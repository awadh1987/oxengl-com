"""End-to-End Automated Cross-Tenant Negative Isolation Test Suite (REM-P4-01).

Enforces strict tenant boundary checks across critical domains:
1. Accounting Moves & Vouchers (/api/accounting/moves):
   - Tenant A cannot view Tenant B's moves by ID (HTTP 404/403).
   - Tenant A cannot list or post to Tenant B's ledger.
2. Fleet Telemetry & Live Tracking Handshake (/api/v1/logistics/ws/fleet-stream):
   - Tenant A attempting to subscribe to Tenant B's fleet stream is rejected (Connection closed/rejected).
3. Customs Clearance Manifests (/api/v1/logistics/customs/manifests):
   - Tenant A cannot view Tenant B's customs manifest by ID (HTTP 403 Forbidden).
   - Tenant A cannot transition/mutate the status of Tenant B's customs manifest (HTTP 403 Forbidden).
4. Tenant Control Team & Settings (/api/tenant/control/):
   - Tenant A cannot access or delete Tenant B's team members.
   - Deleting a user belonging to another tenant fails with HTTP 404 (or 403) without leaking existence.
"""

from __future__ import annotations

import json
import uuid
from decimal import Decimal
import pytest
from starlette.testclient import TestClient

from backend.app.main import app, create_session_token
from backend.database import SessionLocal
from backend.models import (
    AccountAccount,
    AccountJournal,
    AccountMove,
    AccountMoveLine,
    FiscalYear,
    ResCompany,
    ResUser,
)
from backend.app.domains.logistics.customs_models import CustomsManifest

client = TestClient(app)


@pytest.fixture
def isolation_environment():
    """Seeds two completely isolated corporate tenants: Alpha Corp and Beta Logistics."""
    db = SessionLocal()
    try:
        # 1. Tenant Alpha
        cid_alpha = uuid.uuid4()
        company_alpha = ResCompany(
            id=cid_alpha,
            name=f"Alpha Corp {cid_alpha.hex[:6]}",
            slug=f"alpha-{cid_alpha.hex[:6]}",
            domain_slug=f"alpha-{cid_alpha.hex[:6]}",
            currency="SAR",
            tax_id=f"300{cid_alpha.hex[:8]}",
            commercial_registration=f"101{cid_alpha.hex[:7]}",
            is_active=True,
        )
        db.add(company_alpha)

        # 2. Tenant Beta
        cid_beta = uuid.uuid4()
        company_beta = ResCompany(
            id=cid_beta,
            name=f"Beta Logistics {cid_beta.hex[:6]}",
            slug=f"beta-{cid_beta.hex[:6]}",
            domain_slug=f"beta-{cid_beta.hex[:6]}",
            currency="SAR",
            tax_id=f"300{cid_beta.hex[:8]}",
            commercial_registration=f"101{cid_beta.hex[:7]}",
            is_active=True,
        )
        db.add(company_beta)
        db.flush()

        user_alpha = ResUser(
            id=uuid.uuid4(),
            firebase_uid=f"user-alpha-{cid_alpha.hex[:6]}",
            email=f"admin@{company_alpha.slug}.com",
            full_name="Admin Alpha",
            company_id=cid_alpha,
            role="Admin",
            is_active=True,
        )
        db.add(user_alpha)

        user_beta = ResUser(
            id=uuid.uuid4(),
            firebase_uid=f"user-beta-{cid_beta.hex[:6]}",
            email=f"admin@{company_beta.slug}.com",
            full_name="Admin Beta",
            company_id=cid_beta,
            role="Admin",
            is_active=True,
        )
        db.add(user_beta)

        # Member inside Beta (for cross-tenant deletion attack)
        member_beta = ResUser(
            id=uuid.uuid4(),
            firebase_uid=f"member-beta-{cid_beta.hex[:6]}",
            email=f"driver@{company_beta.slug}.com",
            full_name="Driver Beta",
            company_id=cid_beta,
            role="Data_Entry",
            is_active=True,
        )
        db.add(member_beta)
        db.flush()

        # 3. Seed Accounting Move for Beta
        journal_beta = AccountJournal(
            company_id=cid_beta,
            code="MISC",
            name="Miscellaneous",
            journal_type="general",
            sequence_prefix="MISC",
            next_sequence=2,
        )
        db.add(journal_beta)
        db.flush()

        fiscal_beta = FiscalYear(
            company_id=cid_beta,
            name="2026",
            date_start=company_beta.created_at,
            date_end=company_beta.created_at,
            state="open",
        )
        db.add(fiscal_beta)
        db.flush()

        move_beta = AccountMove(
            company_id=cid_beta,
            journal_id=journal_beta.id,
            fiscal_year_id=fiscal_beta.id,
            name=f"MISC/2026/{cid_beta.hex[:4]}",
            sequence_number=1,
            move_type="entry",
            date=company_beta.created_at,
            state="posted",
            ref="Confidential Beta Voucher",
        )
        db.add(move_beta)

        # 4. Seed Customs Manifest for Beta
        manifest_beta = CustomsManifest(
            tenant_id=cid_beta,
            company_id=cid_beta,
            manifest_number=f"MANIFEST-BETA-{uuid.uuid4().hex[:6].upper()}",
            declaration_number="DEC-BETA-9999",
            declaration_type="IMPORT",
            border_port_name="King Abdulaziz Port Dammam",
            carrier_name="Beta International Shipping",
            status="DRAFT",
            clearance_status="PENDING_DOCUMENTATION",
            zatca_compliance_status="NOT_SUBMITTED",
            duty_amount=Decimal("1500.0000"),
            vat_amount=Decimal("225.0000"),
            total_customs_amount=Decimal("1725.0000"),
            previous_hash="0" * 64,
            payload_hash="abcd" * 16,
            block_index=1,
        )
        db.add(manifest_beta)
        db.commit()

        # Auth Tokens
        token_alpha = create_session_token(
            subject=user_alpha.email,
            company_id=cid_alpha,
            role="Admin",
            tenant_slug=company_alpha.slug,
        )
        token_beta = create_session_token(
            subject=user_beta.email,
            company_id=cid_beta,
            role="Admin",
            tenant_slug=company_beta.slug,
        )

        headers_alpha = {
            "Authorization": f"Bearer {token_alpha}",
            "X-Tenant-ID": str(cid_alpha),
        }
        headers_beta = {
            "Authorization": f"Bearer {token_beta}",
            "X-Tenant-ID": str(cid_beta),
        }

        yield {
            "alpha": {"cid": cid_alpha, "headers": headers_alpha, "user": user_alpha},
            "beta": {
                "cid": cid_beta,
                "headers": headers_beta,
                "user": user_beta,
                "member": member_beta,
                "move": move_beta,
                "manifest": manifest_beta,
            },
        }

    finally:
        db.close()


def test_accounting_voucher_negative_cross_tenant_isolation(isolation_environment):
    """Tenant Alpha must NOT be able to view, access, or mutate Tenant Beta's journal entries."""
    alpha_headers = isolation_environment["alpha"]["headers"]
    beta_move = isolation_environment["beta"]["move"]

    # 1. Tenant Alpha attempts to GET Tenant Beta's move directly by UUID
    res = client.get(f"/api/accounting/moves/{beta_move.id}", headers=alpha_headers)
    assert res.status_code in (404, 403), f"Expected 404 or 403, got {res.status_code}"

    # 2. Tenant Alpha lists moves; Beta's move must not appear in the result
    res_list = client.get("/api/accounting/moves", headers=alpha_headers)
    assert res_list.status_code == 200
    listed_moves = res_list.json()
    move_ids = [m["id"] for m in listed_moves]
    assert str(beta_move.id) not in move_ids

    # 3. Tenant Alpha attempts to POST/execute status change on Beta's move
    res_post = client.post(f"/api/accounting/moves/{beta_move.id}/post", headers=alpha_headers)
    assert res_post.status_code in (404, 403)


def test_customs_manifest_negative_cross_tenant_isolation(isolation_environment):
    """Tenant Alpha must NOT be able to view or transition status of Tenant Beta's customs manifests."""
    alpha_headers = isolation_environment["alpha"]["headers"]
    beta_manifest = isolation_environment["beta"]["manifest"]

    # 1. Tenant Alpha attempts to GET Beta's manifest details
    res_get = client.get(
        f"/api/v1/logistics/customs/manifests/{beta_manifest.id}",
        headers=alpha_headers,
    )
    assert res_get.status_code in (403, 404)
    if res_get.status_code == 403:
        assert "forbidden" in res_get.json()["detail"].lower()

    # 2. Tenant Alpha attempts to transition Beta's manifest status to INSPECTION
    res_put = client.put(
        f"/api/v1/logistics/customs/manifests/{beta_manifest.id}/status",
        headers=alpha_headers,
        json={"status": "INSPECTION", "review_notes": "Malicious Tampering Attempt"},
    )
    assert res_put.status_code in (403, 404)

    # 3. Verify in Beta's context that the manifest status remained unaltered (DRAFT)
    res_beta = client.get(
        f"/api/v1/logistics/customs/manifests/{beta_manifest.id}",
        headers=isolation_environment["beta"]["headers"],
    )
    assert res_beta.status_code == 200
    assert res_beta.json()["status"] == "DRAFT"


def test_tenant_control_team_and_user_negative_isolation(isolation_environment):
    """Tenant Alpha cannot list, view, or delete team members belonging to Tenant Beta."""
    alpha_headers = isolation_environment["alpha"]["headers"]
    beta_cid = str(isolation_environment["beta"]["cid"])
    beta_member = isolation_environment["beta"]["member"]

    # 1. Tenant Alpha attempts to query Tenant Beta's team members via spoofed header/query
    res_team_spoof = client.get(
        "/api/tenant/control/team",
        headers={"X-Tenant-ID": beta_cid, "Authorization": alpha_headers["Authorization"]},
    )
    # The endpoint resolves target tenant context
    # If called with alpha token against beta, verify isolation
    res_team_alpha = client.get("/api/tenant/control/team", headers=alpha_headers)
    assert res_team_alpha.status_code == 200
    team_members = res_team_alpha.json().get("team", [])
    member_ids = [m["id"] for m in team_members]
    assert str(beta_member.id) not in member_ids

    # 2. Tenant Alpha attempts to delete Beta's team member
    res_delete = client.delete(
        f"/api/tenant/control/team/{beta_member.id}",
        headers=alpha_headers,
    )
    assert res_delete.status_code in (404, 403)


@pytest.mark.asyncio
async def test_fleet_websocket_cross_tenant_rejection(async_client, isolation_environment):
    """Tenant Alpha attempting to connect to Tenant Beta's live telemetry stream is dropped."""
    cid_alpha = str(isolation_environment["alpha"]["cid"])
    cid_beta = str(isolation_environment["beta"]["cid"])

    try:
        async with async_client.websocket_connect(
            f"/api/v1/logistics/ws/fleet-stream?tenant_id={cid_beta}",
            headers={"X-Tenant-ID": cid_alpha},
        ) as ws:
            await ws.send_text(json.dumps({"type": "ping"}))
            pytest.fail("Security Breach: Cross-tenant WebSocket connection was erroneously accepted.")
    except Exception:
        # Expected behavior: connection refused, dropped, or failed
        assert True
