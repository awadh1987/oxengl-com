"""
OxenGL Enterprise SSL & Caddy Dynamic Reverse Proxy Endpoints
Includes:
- GET /caddy-ask: High-speed gatekeeper queried by Caddy On-Demand TLS
- GET /check-dns: Real authoritative DNS pre-flight verification (CNAME/A/TXT)
- GET /status: Live TLS handshake probe and certificate inspection
- POST /provision: Automated SSL provisioning trigger and verification
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.app.services import ssl_service

router = APIRouter(prefix="/ssl", tags=["Enterprise SSL & Dynamic TLS"])


class SslProvisionRequest(BaseModel):
    domain: str = Field(..., description="Target custom domain to provision")
    tenant_id: Optional[str] = Field(None, description="Tenant ID owning the domain")
    expected_cname: Optional[str] = Field("domains.oxengl.me", description="Expected CNAME target")


@router.get("/caddy-ask", status_code=status.HTTP_200_OK)
def caddy_ask_gatekeeper(
    domain: Optional[str] = Query(None, description="Domain requesting On-Demand TLS certificate"),
    db: Session = Depends(get_db),
):
    """
    Caddy On-Demand TLS Gatekeeper Endpoint.
    Queried automatically by Caddy prior to issuing an automated Let's Encrypt / ZeroSSL certificate.
    Returns HTTP 200 OK if the domain is bound to an active tenant.
    Returns HTTP 403 Forbidden if the domain is not authorized.
    """
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Domain query parameter is required",
        )

    check = ssl_service.verify_caddy_ask(domain=domain, db=db)
    if not check.get("allowed", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Certificate issuance denied: {check.get('reason', 'Domain unauthorized')}",
        )

    # Caddy on_demand_tls accepts 200 OK to allow issuance
    return Response(
        content=f"OK: Authorized for domain '{check.get('domain')}'",
        media_type="text/plain",
        status_code=status.HTTP_200_OK,
    )


@router.get("/check-dns", status_code=status.HTTP_200_OK)
def check_domain_dns(
    domain: str = Query(..., description="Domain name to verify"),
    expected_cname: str = Query("domains.oxengl.me", description="Expected CNAME destination"),
    token: Optional[str] = Query(None, description="Optional TXT challenge token"),
):
    """
    Authoritative DNS Pre-flight Inspection.
    Verifies that the customer has pointed their CNAME or A records before triggering ACME.
    """
    return ssl_service.verify_domain_dns(
        domain=domain,
        expected_cname=expected_cname,
        verification_token=token,
    )


@router.get("/status", status_code=status.HTTP_200_OK)
def check_domain_ssl_status(
    domain: str = Query(..., description="Target domain to probe for live SSL"),
    port: int = Query(443, description="TLS Port (default 443)"),
):
    """
    Live TLS Certificate Probe.
    Inspects live certificate details, issuer, validity period, SANs, and expiration countdown.
    """
    return ssl_service.probe_ssl_certificate(domain=domain, port=port)


@router.post("/provision", status_code=status.HTTP_200_OK)
def trigger_ssl_provisioning(
    payload: SslProvisionRequest,
    db: Session = Depends(get_db),
):
    """
    Automated SSL Provisioning Pipeline.
    1. Runs DNS pre-flight verification.
    2. Validates tenant registration in PostgreSQL.
    3. Confirms Caddy on-demand ask gatekeeper readiness.
    """
    # 1. DNS pre-flight check
    dns_res = ssl_service.verify_domain_dns(
        domain=payload.domain,
        expected_cname=payload.expected_cname or "domains.oxengl.me",
    )

    # 2. Gatekeeper authorization check
    ask_check = ssl_service.verify_caddy_ask(domain=payload.domain, db=db)

    # 3. Live certificate probe
    live_cert = ssl_service.probe_ssl_certificate(domain=payload.domain)

    is_ready = ask_check.get("allowed", False)
    ssl_status = "active" if live_cert.get("has_ssl") else ("ready_for_caddy" if is_ready else "pending_authorization")

    return {
        "success": is_ready,
        "domain": payload.domain,
        "tenant_id": ask_check.get("tenant_id") or payload.tenant_id,
        "ssl_status": ssl_status,
        "caddy_gatekeeper_allowed": ask_check.get("allowed", False),
        "gatekeeper_reason": ask_check.get("reason"),
        "dns_verification": dns_res,
        "live_certificate": live_cert,
        "message": (
            "Domain is fully verified and authorized for automated On-Demand TLS."
            if is_ready
            else "Domain is not ready for automated TLS. Please verify tenant registration."
        ),
    }
