"""Tenant-aware HR audit helpers, using the platform audit log convention."""

from __future__ import annotations

import ipaddress
import os
import uuid
from dataclasses import dataclass
from typing import Optional

from fastapi import Request
from sqlalchemy.orm import Session

from backend import models


def _trusted_proxy_networks() -> list[ipaddress.IPv4Network | ipaddress.IPv6Network]:
    configured = os.getenv("OXENGL_TRUSTED_PROXY_CIDRS", "")
    networks: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = []
    for item in configured.split(","):
        candidate = item.strip()
        if candidate:
            try:
                networks.append(ipaddress.ip_network(candidate, strict=False))
            except ValueError:
                continue
    return networks


def resolve_hr_client_ip(request: Request) -> Optional[str]:
    """Honor forwarded addresses only when the direct peer is a configured trusted proxy."""
    peer = request.client.host if request.client else None
    if not peer:
        return None
    try:
        peer_ip = ipaddress.ip_address(peer)
    except ValueError:
        return None

    networks = _trusted_proxy_networks()
    if not any(peer_ip in network for network in networks):
        return str(peer_ip)

    forwarded = request.headers.get("x-forwarded-for", "")
    chain: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
    for raw_ip in forwarded.split(","):
        try:
            chain.append(ipaddress.ip_address(raw_ip.strip()))
        except ValueError:
            continue
    # Work from the trusted proxy back toward the client. The first untrusted hop is
    # the best client address available from a correctly configured proxy chain.
    for address in reversed(chain):
        if not any(address in network for network in networks):
            return str(address)
    return str(chain[0]) if chain else str(peer_ip)


@dataclass(frozen=True)
class AuditContext:
    """Plain-data snapshot of the request facts an audit row needs.

    Safe to hand to a BackgroundTask: it holds no ORM objects, no Request, and no secrets.
    """

    actor_id: Optional[uuid.UUID]
    actor_identifier: Optional[str]
    ip_address: Optional[str]
    user_agent: str
    request_id: str
    endpoint: str


def build_audit_context(
    request: Request,
    *,
    actor_id: Optional[uuid.UUID],
    actor_identifier: Optional[str],
) -> AuditContext:
    """Capture the real client IP (trusted-proxy aware) and request facts for later auditing."""
    return AuditContext(
        actor_id=actor_id,
        actor_identifier=(actor_identifier or (f"user:{actor_id}" if actor_id else "unknown"))[:255],
        ip_address=resolve_hr_client_ip(request),
        user_agent=(request.headers.get("user-agent") or "unknown")[:512],
        request_id=(request.headers.get("x-request-id") or str(uuid.uuid4()))[:64],
        endpoint=request.url.path[:255],
    )


def append_audit_from_context(
    db: Session,
    context: AuditContext,
    *,
    action: str,
    outcome: str,
    tenant_id: Optional[uuid.UUID],
) -> None:
    """Append an event to platform_audit_logs in the caller's transaction (no request needed)."""
    company_id = None
    if tenant_id:
        # platform_audit_logs.company_id references res_companies; tenant_id is
        # retained separately so test, legacy, and non-company tenant IDs are auditable.
        company_id = db.query(models.ResCompany.id).filter(models.ResCompany.id == tenant_id).scalar()
    db.add(
        models.PlatformAuditLog(
            actor_email=(context.actor_identifier or "unknown")[:255],
            actor_id=context.actor_id,
            tenant_id=tenant_id,
            action=action[:120],
            outcome=outcome[:40],
            endpoint_accessed=context.endpoint,
            request_id=context.request_id,
            user_agent=context.user_agent,
            ip_address=context.ip_address,
            company_id=company_id,
        )
    )


def append_hr_audit(
    db: Session,
    request: Request,
    *,
    action: str,
    outcome: str,
    tenant_id: Optional[uuid.UUID],
    actor_id: Optional[uuid.UUID],
    actor_identifier: Optional[str],
) -> None:
    """Append an HR event to platform_audit_logs in the caller's transaction."""
    append_audit_from_context(
        db,
        build_audit_context(request, actor_id=actor_id, actor_identifier=actor_identifier),
        action=action,
        outcome=outcome,
        tenant_id=tenant_id,
    )
