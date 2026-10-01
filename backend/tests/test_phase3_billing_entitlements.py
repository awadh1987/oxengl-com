# File: backend/tests/test_phase3_billing_entitlements.py
"""
Automated Test Suite for Phase 3:
Entitlement Middleware, Architectural Feature-Gating & Seat Quota Enforcement.

Validates that:
1. Grade 1 (FREE) tenants cannot access custom domain routing, dedicated SSL, or external DB migrations.
2. Grade 2 (PROFESSIONAL) tenants are prevented from configuring private external DBs and custom domains.
3. Seat quotas are strictly enforced: Free tier capped at 2 seats, Professional capped at 20 seats.
4. Grade 3 (ENTERPRISE) tenants unlock all architectural features and enjoy unlimited seats.
5. In-flight upgrade immediately unlocks previously locked endpoints.
6. Enterprise contract amendments (custom_limits) override default plan tier constraints.
7. Caddy on-demand TLS gatekeeper (/api/v1/ssl/caddy-ask) validates tier entitlement before certificate issuance.
"""

import uuid
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.database import SessionLocal
from backend.models import MasterTenant, ResCompany, ResUser, TenantDatabaseMigration
from backend.app.domains.saas.models import SubscriptionPlan, TenantSubscription
from backend.app.services.billing_service import (
    seed_default_subscription_plans,
    get_or_create_tenant_subscription,
    verify_tenant_entitlement,
    enforce_tenant_entitlement,
    verify_tenant_seat_limit,
    increment_tenant_seat_usage,
    create_subscription_invoice,
    verify_and_settle_invoice,
)
from backend.app.core.middleware import invalidate_domain_cache
from backend.api.dependencies import create_access_token

client = TestClient(app)


@pytest.fixture(autouse=True)
def ensure_default_plans():
    """Ensures standard Free, Professional, and Enterprise plans are seeded."""
    db = SessionLocal()
    try:
        seed_default_subscription_plans(db)
    finally:
        db.close()


def test_free_tier_cannot_register_custom_domain():
    """
    Test 1: Free tier tenant calling POST /api/v1/tenant/control/domains is blocked
    with HTTP 403 Forbidden and structured upgrade headers.
    """
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    tenant_id = uuid.uuid4()
    domain_to_register = f"free-{suffix}.org"

    try:
        tenant = MasterTenant(
            id=tenant_id,
            name=f"Free Tenant {suffix}",
            slug=f"free-{suffix}",
            owner_full_name="Free Admin",
            owner_email=f"admin@{suffix}.com",
            owner_mobile="+966500000001",
            subscription_tier="free",
            status="active",
        )
        company = ResCompany(
            id=tenant_id,
            name=f"Free Tenant {suffix}",
            slug=f"free-{suffix}",
            subscription_tier="free",
            is_active=True,
        )
        db.add_all([tenant, company])
        db.commit()

        # Establish linked Free subscription
        sub = get_or_create_tenant_subscription(db, tenant_id, plan_name="FREE")

        headers = {
            "X-Tenant-ID": str(tenant_id),
            "X-Company-ID": str(tenant_id),
        }

        resp = client.post(
            "/api/v1/tenant/control/domains",
            json={"domain_name": domain_to_register},
            headers=headers,
        )
        assert resp.status_code == 403
        data = resp.json()
        assert "locked for Grade 'FREE'" in data["detail"]
        assert resp.headers.get("x-required-tier") == "ENTERPRISE"
        assert resp.headers.get("x-current-tier") == "FREE"
        assert "/api/v1/tenant/billing/checkout" in resp.headers.get("x-upgrade-url", "")
    finally:
        db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).delete()
        db.query(MasterTenant).filter(MasterTenant.id == tenant_id).delete()
        db.query(ResCompany).filter(ResCompany.id == tenant_id).delete()
        db.commit()
        db.close()


def test_free_tier_cannot_trigger_database_migration_or_test():
    """
    Test 2: Free tier tenant calling POST /database/test-connection, /database/migrate,
    and /database/switch-back is blocked with HTTP 403 Forbidden.
    """
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    tenant_id = uuid.uuid4()

    try:
        tenant = MasterTenant(
            id=tenant_id,
            name=f"Free DB Tenant {suffix}",
            slug=f"free-db-{suffix}",
            owner_full_name="Free DB Admin",
            owner_email=f"dbadmin@{suffix}.com",
            owner_mobile="+966500000002",
            subscription_tier="free",
            status="active",
        )
        company = ResCompany(
            id=tenant_id,
            name=f"Free DB Tenant {suffix}",
            slug=f"free-db-{suffix}",
            subscription_tier="free",
            is_active=True,
        )
        db.add_all([tenant, company])
        db.commit()

        get_or_create_tenant_subscription(db, tenant_id, plan_name="FREE")

        headers = {
            "X-Tenant-ID": str(tenant_id),
            "X-Company-ID": str(tenant_id),
        }

        # 1. Test Connection
        test_payload = {
            "host": "127.0.0.1",
            "port": 5432,
            "database_name": "target_db",
            "username": "target_user",
            "password": "secret_password",
            "ssl_mode": "prefer",
        }
        resp_test = client.post(
            "/api/v1/tenant/control/database/test-connection",
            json=test_payload,
            headers=headers,
        )
        assert resp_test.status_code == 403
        assert "allow_external_database" in resp_test.json()["detail"]

        # 2. Trigger Migrate
        resp_mig = client.post(
            "/api/v1/tenant/control/database/migrate",
            json=test_payload,
            headers=headers,
        )
        assert resp_mig.status_code == 403
        assert "allow_external_database" in resp_mig.json()["detail"]

        # 3. Switch Back
        resp_switch = client.post(
            "/api/v1/tenant/control/database/switch-back",
            headers=headers,
        )
        assert resp_switch.status_code == 403
        assert "allow_external_database" in resp_switch.json()["detail"]
    finally:
        db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).delete()
        db.query(MasterTenant).filter(MasterTenant.id == tenant_id).delete()
        db.query(ResCompany).filter(ResCompany.id == tenant_id).delete()
        db.commit()
        db.close()


def test_professional_tier_cannot_access_enterprise_features():
    """
    Test 3: Professional tier tenant has access to core ERP and higher quotas,
    but is strictly prevented from configuring external databases and custom domains.
    """
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    tenant_id = uuid.uuid4()

    try:
        tenant = MasterTenant(
            id=tenant_id,
            name=f"Pro Tenant {suffix}",
            slug=f"pro-{suffix}",
            owner_full_name="Pro Admin",
            owner_email=f"admin@{suffix}.pro",
            owner_mobile="+966500000003",
            subscription_tier="professional",
            status="active",
        )
        company = ResCompany(
            id=tenant_id,
            name=f"Pro Tenant {suffix}",
            slug=f"pro-{suffix}",
            subscription_tier="professional",
            is_active=True,
        )
        db.add_all([tenant, company])
        db.commit()

        get_or_create_tenant_subscription(db, tenant_id, plan_name="PROFESSIONAL")

        headers = {
            "X-Tenant-ID": str(tenant_id),
            "X-Company-ID": str(tenant_id),
        }

        # Attempt custom domain registration
        dom_resp = client.post(
            "/api/v1/tenant/control/domains",
            json={"domain_name": f"pro-{suffix}.com"},
            headers=headers,
        )
        assert dom_resp.status_code == 403
        assert "locked for Grade 'PROFESSIONAL'" in dom_resp.json()["detail"]

        # Attempt external database connection test
        db_resp = client.post(
            "/api/v1/tenant/control/database/test-connection",
            json={"host": "ext.db", "database_name": "db", "username": "u", "password": "p"},
            headers=headers,
        )
        assert db_resp.status_code == 403
        assert "locked for Grade 'PROFESSIONAL'" in db_resp.json()["detail"]
    finally:
        db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).delete()
        db.query(MasterTenant).filter(MasterTenant.id == tenant_id).delete()
        db.query(ResCompany).filter(ResCompany.id == tenant_id).delete()
        db.commit()
        db.close()


def test_free_tier_seat_limit_enforcement():
    """
    Test 4: Grade 1 (FREE) is capped at 2 seats.
    First 2 users are permitted; attempting to invite a 3rd member returns 403 Forbidden.
    """
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    tenant_id = uuid.uuid4()

    try:
        tenant = MasterTenant(
            id=tenant_id,
            name=f"Seat Test Corp {suffix}",
            slug=f"seats-{suffix}",
            owner_full_name="Seat Admin",
            owner_email=f"owner@{suffix}.com",
            owner_mobile="+966500000004",
            subscription_tier="free",
            status="active",
        )
        company = ResCompany(
            id=tenant_id,
            name=f"Seat Test Corp {suffix}",
            slug=f"seats-{suffix}",
            subscription_tier="free",
            is_active=True,
        )
        # Create Owner user (seat 1)
        user1 = ResUser(
            id=uuid.uuid4(),
            email=f"owner@{suffix}.com",
            full_name="Owner User",
            company_id=tenant_id,
            role="Admin",
            is_active=True,
        )
        db.add_all([tenant, company, user1])
        db.commit()

        get_or_create_tenant_subscription(db, tenant_id, plan_name="FREE")

        headers = {
            "X-Tenant-ID": str(tenant_id),
            "X-Company-ID": str(tenant_id),
        }

        # Invite user 2 (seat 2 / max 2) -> Should succeed (201 Created)
        invite1_resp = client.post(
            "/api/v1/tenant/control/team/invite",
            json={"email": f"user2@{suffix}.com", "full_name": "Second User", "role": "user"},
            headers=headers,
        )
        assert invite1_resp.status_code == 201
        assert invite1_resp.json()["success"] is True

        # Invite user 3 (exceeds max 2 seats) -> Should fail with 403 Forbidden
        invite2_resp = client.post(
            "/api/v1/tenant/control/team/invite",
            json={"email": f"user3@{suffix}.com", "full_name": "Third User", "role": "user"},
            headers=headers,
        )
        assert invite2_resp.status_code == 403
        data = invite2_resp.json()
        assert "Seat quota exceeded" in data["detail"]
        assert "limit of 2 seat(s) on Grade 'FREE'" in data["detail"]
        assert invite2_resp.headers.get("x-quota-type") == "max_seats"
    finally:
        db.query(ResUser).filter(ResUser.company_id == tenant_id).delete()
        db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).delete()
        db.query(MasterTenant).filter(MasterTenant.id == tenant_id).delete()
        db.query(ResCompany).filter(ResCompany.id == tenant_id).delete()
        db.commit()
        db.close()


def test_professional_tier_seat_limit_boundary():
    """
    Test 5: Grade 2 (PROFESSIONAL) allows up to 20 seats.
    When 20 seats are occupied, inviting a 21st user is rejected with 403.
    """
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    tenant_id = uuid.uuid4()

    try:
        tenant = MasterTenant(
            id=tenant_id,
            name=f"Pro Seats Corp {suffix}",
            slug=f"pro-seats-{suffix}",
            owner_full_name="Pro Seats Admin",
            owner_email=f"owner@{suffix}.pro",
            owner_mobile="+966500000005",
            subscription_tier="professional",
            status="active",
        )
        company = ResCompany(
            id=tenant_id,
            name=f"Pro Seats Corp {suffix}",
            slug=f"pro-seats-{suffix}",
            subscription_tier="professional",
            is_active=True,
        )
        db.add_all([tenant, company])
        db.commit()

        get_or_create_tenant_subscription(db, tenant_id, plan_name="PROFESSIONAL")

        # Seed 20 active users
        users = [
            ResUser(
                id=uuid.uuid4(),
                email=f"worker_{i}_{suffix}@procorp.com",
                full_name=f"Worker {i}",
                company_id=tenant_id,
                role="Data_Entry",
                is_active=True,
            )
            for i in range(20)
        ]
        db.add_all(users)
        db.commit()

        headers = {
            "X-Tenant-ID": str(tenant_id),
            "X-Company-ID": str(tenant_id),
        }

        # Attempt to invite 21st user
        invite_resp = client.post(
            "/api/v1/tenant/control/team/invite",
            json={"email": f"worker_21_{suffix}@procorp.com", "full_name": "Worker 21", "role": "user"},
            headers=headers,
        )
        assert invite_resp.status_code == 403
        data = invite_resp.json()
        assert "Seat quota exceeded" in data["detail"]
        assert "limit of 20 seat(s) on Grade 'PROFESSIONAL'" in data["detail"]
    finally:
        db.query(ResUser).filter(ResUser.company_id == tenant_id).delete()
        db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).delete()
        db.query(MasterTenant).filter(MasterTenant.id == tenant_id).delete()
        db.query(ResCompany).filter(ResCompany.id == tenant_id).delete()
        db.commit()
        db.close()


def test_enterprise_tier_unlimited_seats_and_features():
    """
    Test 6: Grade 3 (ENTERPRISE) unlocks all architectural routes and has unlimited seat capacity.
    """
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    tenant_id = uuid.uuid4()
    domain_name = f"enterprise-{suffix}.sa"

    try:
        tenant = MasterTenant(
            id=tenant_id,
            name=f"Enterprise Sovereign {suffix}",
            slug=f"ent-{suffix}",
            owner_full_name="Enterprise Sovereign Admin",
            owner_email=f"admin@{domain_name}",
            owner_mobile="+966500000006",
            subscription_tier="enterprise",
            status="active",
        )
        company = ResCompany(
            id=tenant_id,
            name=f"Enterprise Sovereign {suffix}",
            slug=f"ent-{suffix}",
            subscription_tier="enterprise",
            is_active=True,
        )
        db.add_all([tenant, company])
        db.commit()

        get_or_create_tenant_subscription(db, tenant_id, plan_name="ENTERPRISE")

        headers = {
            "X-Tenant-ID": str(tenant_id),
            "X-Company-ID": str(tenant_id),
        }

        # 1. Custom Domain registration succeeds
        dom_resp = client.post(
            "/api/v1/tenant/control/domains",
            json={"domain_name": domain_name},
            headers=headers,
        )
        assert dom_resp.status_code == 201

        # 2. Domain verification endpoint succeeds
        verify_resp = client.post(
            f"/api/v1/tenant/control/domains/{domain_name}/verify",
            headers=headers,
        )
        assert verify_resp.status_code == 200

        # 3. SSL status probe succeeds
        ssl_resp = client.get(
            f"/api/v1/tenant/control/domains/{domain_name}/ssl-status",
            headers=headers,
        )
        assert ssl_resp.status_code == 200

        # 4. Database test-connection succeeds (handler executes, returns 200 with test outcome)
        test_resp = client.post(
            "/api/v1/tenant/control/database/test-connection",
            json={"host": "127.0.0.99", "port": 5439, "database_name": "test_db", "username": "u", "password": "p"},
            headers=headers,
        )
        assert test_resp.status_code == 200

        # 5. Unlimited seats: seed 30 users and invite 31st user
        users = [
            ResUser(
                id=uuid.uuid4(),
                email=f"ent_user_{i}_{suffix}@{domain_name}",
                full_name=f"Enterprise User {i}",
                company_id=tenant_id,
                role="Data_Entry",
                is_active=True,
            )
            for i in range(30)
        ]
        db.add_all(users)
        db.commit()

        invite_resp = client.post(
            "/api/v1/tenant/control/team/invite",
            json={"email": f"ent_user_31_{suffix}@{domain_name}", "full_name": "User 31", "role": "admin"},
            headers=headers,
        )
        assert invite_resp.status_code == 201
        assert invite_resp.json()["success"] is True
    finally:
        invalidate_domain_cache(domain_name)
        db.query(ResUser).filter(ResUser.company_id == tenant_id).delete()
        db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).delete()
        db.query(MasterTenant).filter(MasterTenant.id == tenant_id).delete()
        db.query(ResCompany).filter(ResCompany.id == tenant_id).delete()
        db.commit()
        db.close()


def test_upgrade_unlocks_gated_features_immediately():
    """
    Test 7: A tenant initially on Grade 1 (FREE) is blocked from registering a domain.
    Upon upgrading to Grade 3 (ENTERPRISE), the endpoint is immediately unlocked without restart.
    """
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    tenant_id = uuid.uuid4()
    domain_name = f"upgrade-test-{suffix}.com"

    try:
        tenant = MasterTenant(
            id=tenant_id,
            name=f"Upgrade Corp {suffix}",
            slug=f"upg-{suffix}",
            owner_full_name="Upgrade Admin",
            owner_email=f"admin@{suffix}.upg",
            owner_mobile="+966500000007",
            subscription_tier="free",
            status="active",
        )
        company = ResCompany(
            id=tenant_id,
            name=f"Upgrade Corp {suffix}",
            slug=f"upg-{suffix}",
            subscription_tier="free",
            is_active=True,
        )
        db.add_all([tenant, company])
        db.commit()

        sub = get_or_create_tenant_subscription(db, tenant_id, plan_name="FREE")

        headers = {
            "X-Tenant-ID": str(tenant_id),
            "X-Company-ID": str(tenant_id),
        }

        # Attempt 1: Blocked on Free
        resp_blocked = client.post(
            "/api/v1/tenant/control/domains",
            json={"domain_name": domain_name},
            headers=headers,
        )
        assert resp_blocked.status_code == 403

        # Upgrade tenant to ENTERPRISE via invoice creation & wire settlement
        ent_plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.name == "ENTERPRISE").first()
        invoice = create_subscription_invoice(
            db=db,
            tenant_id=tenant_id,
            plan_id=ent_plan.id,
            subscription_id=sub.id,
            amount_sar=ent_plan.annual_price,
            billing_cycle="annual",
            payment_method="bank_transfer",
            po_number=f"PO-{suffix}",
            status="pending",
        )
        verify_and_settle_invoice(
            db=db,
            invoice_id=invoice.id,
            payment_reference=f"WIRE-UPG-{suffix}",
            notes=f"Settled by superadmin@oxengl.com",
        )

        # Invalidate domain cache
        invalidate_domain_cache(domain_name)

        # Attempt 2: Immediately unlocked on Enterprise
        resp_unlocked = client.post(
            "/api/v1/tenant/control/domains",
            json={"domain_name": domain_name},
            headers=headers,
        )
        assert resp_unlocked.status_code == 201
        assert resp_unlocked.json()["success"] is True
    finally:
        invalidate_domain_cache(domain_name)
        db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).delete()
        db.query(MasterTenant).filter(MasterTenant.id == tenant_id).delete()
        db.query(ResCompany).filter(ResCompany.id == tenant_id).delete()
        db.commit()
        db.close()


def test_custom_limits_contract_override_bypasses_tier_lock():
    """
    Test 8: Custom contract amendment via sub.custom_limits allows a Professional
    tenant to access allow_external_database without migrating full plan tier.
    """
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    tenant_id = uuid.uuid4()

    try:
        tenant = MasterTenant(
            id=tenant_id,
            name=f"Custom Limit Corp {suffix}",
            slug=f"custom-{suffix}",
            owner_full_name="Custom Admin",
            owner_email=f"admin@{suffix}.custom",
            owner_mobile="+966500000008",
            subscription_tier="professional",
            status="active",
        )
        company = ResCompany(
            id=tenant_id,
            name=f"Custom Limit Corp {suffix}",
            slug=f"custom-{suffix}",
            subscription_tier="professional",
            is_active=True,
        )
        db.add_all([tenant, company])
        db.commit()

        sub = get_or_create_tenant_subscription(db, tenant_id, plan_name="PROFESSIONAL")

        # Inject contract amendment into custom_limits
        sub.custom_limits = {"allow_external_database": True, "max_seats": 50}
        db.commit()

        headers = {
            "X-Tenant-ID": str(tenant_id),
            "X-Company-ID": str(tenant_id),
        }

        # External database test-connection now passes entitlement check!
        resp = client.post(
            "/api/v1/tenant/control/database/test-connection",
            json={"host": "127.0.0.99", "port": 5439, "database_name": "custom_db", "username": "u", "password": "p"},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False  # Connection failed to mock IP, but was not rejected by 403 entitlement gate!
        assert "failed" in data["message"].lower()

        # However, custom domain is NOT in custom_limits, so it remains blocked (403)
        dom_resp = client.post(
            "/api/v1/tenant/control/domains",
            json={"domain_name": f"blocked-{suffix}.com"},
            headers=headers,
        )
        assert dom_resp.status_code == 403
    finally:
        db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).delete()
        db.query(MasterTenant).filter(MasterTenant.id == tenant_id).delete()
        db.query(ResCompany).filter(ResCompany.id == tenant_id).delete()
        db.commit()
        db.close()


def test_caddy_ask_ssl_gatekeeper_enforces_tier():
    """
    Test 9: Caddy on-demand TLS gatekeeper (/api/v1/ssl/caddy-ask) enforces subscription tier.
    A Free/Professional tenant with an unauthorized domain is rejected for SSL issuance,
    whereas an Enterprise tenant is granted SSL certificate authority.
    """
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    free_tenant_id = uuid.uuid4()
    ent_tenant_id = uuid.uuid4()
    free_domain = f"free-ssl-{suffix}.com"
    ent_domain = f"ent-ssl-{suffix}.com"

    try:
        # 1. Free tenant with a custom domain value in DB
        free_tenant = MasterTenant(
            id=free_tenant_id,
            name=f"Free SSL Corp {suffix}",
            slug=f"free-ssl-{suffix}",
            custom_domain=free_domain,
            owner_full_name="Free SSL Admin",
            owner_email=f"admin@{free_domain}",
            owner_mobile="+966500000009",
            subscription_tier="free",
            status="active",
        )
        get_or_create_tenant_subscription(db, free_tenant_id, plan_name="FREE")

        # 2. Enterprise tenant with a custom domain value in DB
        ent_tenant = MasterTenant(
            id=ent_tenant_id,
            name=f"Ent SSL Corp {suffix}",
            slug=f"ent-ssl-{suffix}",
            custom_domain=ent_domain,
            owner_full_name="Ent SSL Admin",
            owner_email=f"admin@{ent_domain}",
            owner_mobile="+966500000010",
            subscription_tier="enterprise",
            status="active",
        )
        get_or_create_tenant_subscription(db, ent_tenant_id, plan_name="ENTERPRISE")

        db.add_all([free_tenant, ent_tenant])
        db.commit()

        invalidate_domain_cache(free_domain)
        invalidate_domain_cache(ent_domain)

        # Caddy asks for free tenant domain -> 403 Forbidden
        free_ask = client.get(f"/api/v1/ssl/caddy-ask?domain={free_domain}")
        assert free_ask.status_code == 403
        assert "does not entitle dedicated ssl" in free_ask.json()["detail"].lower()

        # Caddy asks for enterprise tenant domain -> 200 OK (Allowed)
        ent_ask = client.get(f"/api/v1/ssl/caddy-ask?domain={ent_domain}")
        assert ent_ask.status_code == 200
        assert "Authorized for domain" in ent_ask.text
    finally:
        invalidate_domain_cache(free_domain)
        invalidate_domain_cache(ent_domain)
        db.query(TenantSubscription).filter(TenantSubscription.tenant_id.in_([free_tenant_id, ent_tenant_id])).delete()
        db.query(MasterTenant).filter(MasterTenant.id.in_([free_tenant_id, ent_tenant_id])).delete()
        db.commit()
        db.close()


def test_features_override_bypasses_custom_domain_tier_lock():
    """
    Test 10: A tenant on PROFESSIONAL plan with features_override.get("allow_custom_domain") == True
    completely bypasses the 403 Professional plan restriction when registering a custom domain.
    """
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    tenant_id = uuid.uuid4()
    domain_name = f"override-test-{suffix}.com"

    try:
        tenant = MasterTenant(
            id=tenant_id,
            name=f"Override Corp {suffix}",
            slug=f"ovr-{suffix}",
            owner_full_name="Override Admin",
            owner_email=f"admin@{suffix}.ovr",
            owner_mobile="+966500000011",
            subscription_tier="professional",
            status="active",
            features_override={"allow_custom_domain": True},
        )
        company = ResCompany(
            id=tenant_id,
            name=f"Override Corp {suffix}",
            slug=f"ovr-{suffix}",
            subscription_tier="professional",
            features_override={"allow_custom_domain": True},
            is_active=True,
        )
        db.add_all([tenant, company])
        db.commit()

        get_or_create_tenant_subscription(db, tenant_id, plan_name="PROFESSIONAL")

        headers = {
            "X-Tenant-ID": str(tenant_id),
            "X-Company-ID": str(tenant_id),
        }

        # Attempt: Professional tenant with features_override={"allow_custom_domain": True}
        # MUST bypass 403 and return 201 Created!
        resp = client.post(
            "/api/v1/tenant/control/domains",
            json={"domain_name": domain_name},
            headers=headers,
        )
        assert resp.status_code == 201
        assert resp.json()["success"] is True

        # Verify domain registered in DB
        db.refresh(tenant)
        assert tenant.custom_domain == domain_name
    finally:
        invalidate_domain_cache(domain_name)
        db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).delete()
        db.query(MasterTenant).filter(MasterTenant.id == tenant_id).delete()
        db.query(ResCompany).filter(ResCompany.id == tenant_id).delete()
        db.commit()
        db.close()
