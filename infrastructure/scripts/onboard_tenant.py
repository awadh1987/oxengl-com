import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from decimal import Decimal
from sqlalchemy import text
from backend.database import SessionLocal
from backend import models
from backend.app.domains.saas.models import SubscriptionPlan, TenantSubscription

# Passphrase representation: 'Meayon123!' securely packed via blowfish crypt standard
ADMIN_PASSWORD_PLAIN = "Meayon123!"

async def automate_corporate_onboarding(company_name: str, admin_email: str):
    print(f"\033[1m=== Initiating Automated Multi-Tenant SaaS Workspace Provisioning ===\033[0m")
    db: Any = SessionLocal()
    tenant_id = uuid.uuid4()
    company_id = uuid.uuid4()
    
    try:
        # 0. Idempotency safeguard: clean up existing records for repeated test runs
        db.execute(text("DELETE FROM res_users WHERE email = :email"), {"email": admin_email})
        db.execute(text("DELETE FROM res_companies WHERE name = :name"), {"name": company_name})
        db.execute(text("DELETE FROM tenant_subscriptions WHERE tenant_id IN (SELECT id FROM tenants WHERE company_name = :name)"), {"name": company_name})
        db.execute(text("DELETE FROM tenants WHERE company_name = :name"), {"name": company_name})
        await db.flush()

        # 1. Instantiate the isolated tenant mapping row envelope
        tenant_name_slug = company_name.lower().replace(" ", "_")
        tenant = models.Tenant(id=tenant_id, name=company_name, schema_name=f"tenant_{tenant_name_slug[:10]}", is_active=True)
        db.add(tenant)
        
        # 2. Check and provision the core Enterprise plan metadata parameters matrix
        plan_stmt = text("SELECT id FROM subscription_plans WHERE name = 'ENTERPRISE' LIMIT 1;")
        res = db.execute(plan_stmt)
        plan_row = res.fetchone()
        
        if not plan_row:
            plan = SubscriptionPlan(id=uuid.uuid4(), name="ENTERPRISE", stripe_price_id="price_ent_live_2026", max_seats=50, max_vehicles=100, monthly_price=Decimal("2999.00"))
            db.add(plan)
            await db.flush()
            plan_id = plan.id
        else:
            plan_id = plan_row[0]

        # 3. Attach metered subscription quotas contract layer
        subscription = TenantSubscription(id=uuid.uuid4(), tenant_id=tenant_id, plan_id=plan_id, stripe_customer_id=f"cus_live_{uuid.uuid4().hex[:8]}", status="active", current_seats_used=1, current_vehicles_used=0, current_period_end=datetime.now(timezone.utc) + timedelta(days=30))
        db.add(subscription)

        # 4. Spin up the Corporate Operating Company boundary marker
        company = models.ResCompany(id=company_id, name=company_name, currency="SAR", is_active=True)
        db.add(company)
        await db.flush()

        # 5. Provision the Authoritative Administrator Profile account with Blowfish encryption
        hash_stmt = text("SELECT crypt(:pwd, gen_salt('bf', 10));")
        hash_res = db.execute(hash_stmt, {"pwd": ADMIN_PASSWORD_PLAIN})
        pwd_hash = hash_res.scalar()

        admin_user = models.ResUser(id=uuid.uuid4(), tenant_id=tenant_id, company_id=company_id, username=f"admin.{tenant_name_slug[:10]}", email=admin_email, password_hash=pwd_hash, is_active=True, mfa_enabled=False)
        db.add(admin_user)
        
        await db.commit()
        print(f"\n\033[92m[SUCCESS] Corporate Onboarding Provisioned Cleanly for: {company_name}\033[0m")
        print(f"  - Tenant ID Context Token: \033[1m{tenant_id}\033[0m")
        print(f"  - Operating Company UUID:  {company_id}")
        print(f"  - Admin Email Identifier:   {admin_email}")
        print(f"  - Temporary Password Key:  {ADMIN_PASSWORD_PLAIN}\n")
        
    except Exception as e:
        await db.rollback()
        print(f"\033[91m[CRITICAL REVERSION] Provisioning pipeline aborted:\033[0m {str(e)}")
    finally:
        db.close()

if __name__ == "__main__":
    # Automate onboarding for an enterprise logistics partner entity profile instance
    asyncio.run(automate_corporate_onboarding("Myon Economic Co Ltd.", "muath.salaih@meayon.com"))
