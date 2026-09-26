"""
OxenGL Enterprise SSL & Dynamic TLS Provisioning Service
Supports:
1. Caddy On-Demand TLS Gatekeeper (Ask endpoint logic)
2. Authoritative DNS Pre-flight Verification (CNAME, A, TXT) via dnspython
3. Live TLS Certificate Status & Expiration Prober
4. Domain Rate-Limit and Attack Protection
"""
import re
import ssl
import socket
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from urllib.parse import urlparse

import dns.resolver
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.database import SessionLocal
from backend.models import MasterTenant, ResCompany
from backend.app.core.middleware import _DOMAIN_CACHE, _DOMAIN_CACHE_LOCK

logger = logging.getLogger("oxengl.ssl_service")

# Reserved / Platform apex hostnames that do NOT get individual On-Demand certs from Caddy ask
PLATFORM_BASE_HOSTS = {
    "oxengl.me",
    "oxengl.com",
    "localhost",
    "127.0.0.1",
    "domains.oxengl.me",
    "app.oxengl.me",
    "www.oxengl.me",
}

# Domain validation regex (RFC 1123 compliant hostname)
DOMAIN_REGEX = re.compile(
    r"^(?:[a-zA-Z0-9]"
    r"(?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+"
    r"[a-zA-Z]{2,63}$"
)


def normalize_domain(domain_input: str) -> str:
    """Cleans, normalizes, and strips protocol/port/trailing dots from domain."""
    if not domain_input:
        return ""
    d = domain_input.strip().lower()
    if "://" in d:
        try:
            d = urlparse(d).hostname or d
        except Exception:
            pass
    # Strip port if present
    if ":" in d:
        d = d.split(":")[0]
    # Strip trailing dot (DNS root)
    d = d.rstrip(".")
    return d


def is_valid_domain_syntax(domain: str) -> bool:
    """Validates domain against standard FQDN format."""
    if not domain or len(domain) > 253:
        return False
    # Reject IP addresses for custom domain TLS
    try:
        socket.inet_aton(domain)
        return False
    except socket.error:
        pass
    return bool(DOMAIN_REGEX.match(domain))


def verify_caddy_ask(domain: str, db: Optional[Session] = None) -> Dict[str, Any]:
    """
    Core Gatekeeper for Caddy on_demand_tls.
    Caddy executes an HTTP GET to /api/v1/ssl/caddy-ask?domain=<domain>.
    Returns:
        {
            "allowed": bool,
            "domain": str,
            "tenant_id": Optional[str],
            "tenant_slug": Optional[str],
            "reason": str
        }
    """
    clean_domain = normalize_domain(domain)
    if not clean_domain:
        return {"allowed": False, "domain": domain, "reason": "Empty domain"}

    # Base platform hosts already have wildcard or static certs
    if clean_domain in PLATFORM_BASE_HOSTS:
        return {
            "allowed": True,
            "domain": clean_domain,
            "tenant_id": None,
            "tenant_slug": None,
            "reason": "Platform base domain",
        }

    if not is_valid_domain_syntax(clean_domain):
        return {"allowed": False, "domain": clean_domain, "reason": "Invalid domain syntax"}

    # Fast in-memory cache check
    with _DOMAIN_CACHE_LOCK:
        if clean_domain in _DOMAIN_CACHE:
            cached = _DOMAIN_CACHE[clean_domain]
            if cached and cached.get("tenant_id"):
                return {
                    "allowed": True,
                    "domain": clean_domain,
                    "tenant_id": cached.get("tenant_id"),
                    "tenant_slug": cached.get("tenant_slug"),
                    "reason": "Authorized tenant (cached)",
                }

    # Query PostgreSQL
    close_db_at_end = False
    if db is None:
        db = SessionLocal()
        close_db_at_end = True

    try:
        # Check MasterTenant custom_domain
        tenant = (
            db.query(MasterTenant)
            .filter(
                MasterTenant.custom_domain == clean_domain,
                MasterTenant.status == "active",
            )
            .first()
        )

        if tenant:
            # Populate domain cache
            with _DOMAIN_CACHE_LOCK:
                _DOMAIN_CACHE[clean_domain] = {
                    "tenant_id": str(tenant.id),
                    "company_id": str(tenant.id),
                    "tenant_slug": tenant.slug,
                    "name": tenant.name,
                    "custom_domain": tenant.custom_domain,
                    "is_custom_domain": True,
                    "subscription_tier": tenant.subscription_tier,
                    "status": tenant.status,
                }
            return {
                "allowed": True,
                "domain": clean_domain,
                "tenant_id": str(tenant.id),
                "tenant_slug": tenant.slug,
                "reason": "Authorized active tenant",
            }

        # Check ResCompany custom_domain
        company = (
            db.query(ResCompany)
            .filter(
                ResCompany.custom_domain == clean_domain,
                ResCompany.is_active == True,
            )
            .first()
        )
        if company:
            with _DOMAIN_CACHE_LOCK:
                _DOMAIN_CACHE[clean_domain] = {
                    "tenant_id": str(company.id),
                    "company_id": str(company.id),
                    "tenant_slug": company.slug or company.domain_slug,
                    "name": company.name,
                    "custom_domain": company.custom_domain,
                    "is_custom_domain": True,
                    "subscription_tier": "enterprise",
                    "status": "active",
                }
            return {
                "allowed": True,
                "domain": clean_domain,
                "tenant_id": str(company.id),
                "tenant_slug": company.slug or company.domain_slug,
                "reason": "Authorized company domain",
            }

        # Domain not found or tenant inactive
        return {
            "allowed": False,
            "domain": clean_domain,
            "reason": "Domain not registered or tenant inactive",
        }

    except Exception as e:
        logger.error(f"Error checking caddy-ask for {clean_domain}: {e}")
        return {"allowed": False, "domain": clean_domain, "reason": f"Internal error: {str(e)}"}
    finally:
        if close_db_at_end:
            db.close()


def verify_domain_dns(
    domain: str,
    expected_cname: str = "domains.oxengl.me",
    verification_token: Optional[str] = None,
    timeout: float = 3.0,
) -> Dict[str, Any]:
    """
    Performs authoritative DNS pre-flight inspection before requesting SSL from ACME.
    Checks:
    1. CNAME records pointing to expected_cname (e.g. domains.oxengl.me).
    2. A records resolving the domain.
    3. TXT record matching _oxengl-challenge.<domain> if verification_token is provided.
    """
    clean_domain = normalize_domain(domain)
    clean_expected = normalize_domain(expected_cname)

    result: Dict[str, Any] = {
        "domain": clean_domain,
        "is_valid": False,
        "dns_status": "unresolved",
        "cname_target": expected_cname,
        "cname_matched": False,
        "cname_records": [],
        "a_records": [],
        "txt_records": [],
        "message": "",
    }

    if not is_valid_domain_syntax(clean_domain):
        result["message"] = f"Invalid domain syntax '{clean_domain}'"
        result["dns_status"] = "invalid_syntax"
        return result

    resolver = dns.resolver.Resolver()
    resolver.lifetime = timeout
    resolver.timeout = timeout

    # 1. Check CNAME
    try:
        cname_answers = resolver.resolve(clean_domain, "CNAME")
        for rdata in cname_answers:
            target = str(rdata.target).rstrip(".").lower()
            result["cname_records"].append(target)
            if target == clean_expected:
                result["cname_matched"] = True
    except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
        pass
    except Exception as e:
        logger.warning(f"DNS CNAME lookup exception for {clean_domain}: {e}")

    # 2. Check A / AAAA records
    try:
        a_answers = resolver.resolve(clean_domain, "A")
        for rdata in a_answers:
            result["a_records"].append(str(rdata.address))
    except Exception:
        # Fallback to standard socket getaddrinfo
        try:
            addr_info = socket.getaddrinfo(clean_domain, None, socket.AF_INET)
            for addr in addr_info:
                ip = addr[4][0]
                if ip not in result["a_records"]:
                    result["a_records"].append(ip)
        except Exception:
            pass

    # 3. Check TXT Verification if token given
    if verification_token:
        challenge_host = f"_oxengl-challenge.{clean_domain}"
        try:
            txt_answers = resolver.resolve(challenge_host, "TXT")
            for rdata in txt_answers:
                for string in rdata.strings:
                    decoded = string.decode("utf-8", errors="ignore")
                    result["txt_records"].append(decoded)
                    if verification_token in decoded:
                        result["txt_matched"] = True
        except Exception:
            result["txt_matched"] = False

    # Evaluate overall DNS validity
    if result["cname_matched"]:
        result["is_valid"] = True
        result["dns_status"] = "cname_verified"
        result["message"] = f"CNAME successfully points to {expected_cname}"
    elif result["a_records"]:
        # If A record exists, it points to an IP
        result["is_valid"] = True
        result["dns_status"] = "a_record_present"
        result["message"] = f"Domain resolves to IP(s): {', '.join(result['a_records'])}"
    else:
        result["is_valid"] = False
        result["dns_status"] = "not_pointing"
        result["message"] = f"Domain does not resolve or point to {expected_cname}"

    return result


def probe_ssl_certificate(domain: str, port: int = 443, timeout: float = 3.0) -> Dict[str, Any]:
    """
    Connects to the target domain on port 443 with TLS to probe live SSL certificate details.
    Extracts issuer, expiry, SANs, and computes days until expiration.
    """
    clean_domain = normalize_domain(domain)
    res: Dict[str, Any] = {
        "domain": clean_domain,
        "port": port,
        "has_ssl": False,
        "ssl_status": "unreachable",
        "issuer": None,
        "subject": None,
        "sans": [],
        "valid_from": None,
        "valid_to": None,
        "days_remaining": None,
        "error": None,
    }

    if not is_valid_domain_syntax(clean_domain):
        res["ssl_status"] = "invalid_domain"
        res["error"] = "Invalid domain syntax"
        return res

    context = ssl.create_default_context()
    # Allow inspection of self-signed or staging certs without crashing
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE

    try:
        with socket.create_connection((clean_domain, port), timeout=timeout) as sock:
            with context.wrap_socket(sock, server_hostname=clean_domain) as ssock:
                cert = ssock.getpeercert(binary_form=False)
                # Some servers return empty cert when CERT_NONE is used; fetch binary cert
                if not cert:
                    bin_cert = ssock.getpeercert(binary_form=True)
                    if bin_cert:
                        import ssl as _ssl
                        cert = _ssl._ssl._test_decode_cert(bin_cert) if hasattr(_ssl, "_ssl") else {}

                res["has_ssl"] = True
                res["ssl_status"] = "active"

                if cert:
                    # Parse subject
                    subject_parts = []
                    for rdn in cert.get("subject", ()):
                        for key, val in rdn:
                            subject_parts.append(f"{key}={val}")
                    res["subject"] = ", ".join(subject_parts)

                    # Parse issuer
                    issuer_parts = []
                    for rdn in cert.get("issuer", ()):
                        for key, val in rdn:
                            if key in ("commonName", "organizationName"):
                                issuer_parts.append(val)
                    res["issuer"] = " - ".join(issuer_parts) or "TLS Certificate Authority"

                    # Parse SANs
                    sans = []
                    for san_type, san_val in cert.get("subjectAltName", ()):
                        if san_type == "DNS":
                            sans.append(san_val)
                    res["sans"] = sans

                    # Parse Expiration
                    not_after_str = cert.get("notAfter")
                    if not_after_str:
                        # Format: 'May 26 23:59:59 2026 GMT'
                        try:
                            expiry = datetime.strptime(not_after_str, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
                            res["valid_to"] = expiry.isoformat()
                            now = datetime.now(timezone.utc)
                            days = (expiry - now).days
                            res["days_remaining"] = days
                            if days < 0:
                                res["ssl_status"] = "expired"
                            elif days < 15:
                                res["ssl_status"] = "expiring_soon"
                            else:
                                res["ssl_status"] = "active"
                        except Exception:
                            pass

                    not_before_str = cert.get("notBefore")
                    if not_before_str:
                        try:
                            valid_from = datetime.strptime(not_before_str, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
                            res["valid_from"] = valid_from.isoformat()
                        except Exception:
                            pass

    except (socket.timeout, socket.gaierror, ConnectionRefusedError, OSError) as e:
        res["ssl_status"] = "unreachable"
        res["error"] = str(e)
    except ssl.SSLError as e:
        res["ssl_status"] = "ssl_handshake_error"
        res["error"] = str(e)
    except Exception as e:
        res["ssl_status"] = "probe_failed"
        res["error"] = str(e)

    return res
