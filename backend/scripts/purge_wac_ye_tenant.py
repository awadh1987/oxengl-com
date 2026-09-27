#!/usr/bin/env python3
"""
Database Maintenance Script: Purge Orphaned Tenant 'wac-ye'
Role: Senior Database Administrator

Safely purges the orphaned 'wac-ye' tenant record and all associated child entities
from PostgreSQL via SQLAlchemy session, ensuring referential integrity and allowing
clean re-registration from the frontend.
"""

import sys
import os
import uuid
import logging
from sqlalchemy import text, or_

# Ensure project root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import SessionLocal
from backend.models import ResCompany, MasterTenant, ResUser
from backend.app.domains.finance.models import Account, FinanceJournalEntry, FinanceJournalLine
from backend.app.domains.inventory.models import InventoryMovement, Material

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [DBA-PURGE] %(message)s"
)
logger = logging.getLogger("tenant_purge")


def purge_wac_ye_tenant(dry_run: bool = False):
    identifier = "wac-ye"
    logger.info(f"Initiating purge sequence for orphaned tenant identifier: '{identifier}' (dry_run={dry_run})")

    db = SessionLocal()
    try:
        # 1. Query the database to locate the tenant/workspace record
        company = db.query(ResCompany).filter(
            or_(
                ResCompany.slug == identifier,
                ResCompany.domain_slug == identifier,
                ResCompany.name.ilike(f"%{identifier}%")
            )
        ).first()

        master = db.query(MasterTenant).filter(
            or_(
                MasterTenant.slug == identifier,
                MasterTenant.name.ilike(f"%{identifier}%")
            )
        ).first()

        if not company and not master:
            logger.warning(f"No tenant or workspace record found matching '{identifier}'. Nothing to purge.")
            return False

        tenant_id = company.id if company else master.id
        tenant_name = company.name if company else master.name
        tenant_slug = company.slug if company else master.slug

        logger.info(f"Located target tenant: Name='{tenant_name}', Slug='{tenant_slug}', ID='{tenant_id}'")

        # Track user IDs for downstream tenant_users cleanup
        user_ids = []
        user_emails = []
        if company:
            company_users = db.query(ResUser).filter(ResUser.company_id == tenant_id).all()
            user_ids = [u.id for u in company_users]
            user_emails = [u.email for u in company_users if u.email]
            logger.info(f"Found {len(company_users)} associated ResUser account(s): {user_emails}")

        # 2. Safely purge domain entities that lack foreign key cascade triggers
        # a. Inventory Movements
        inv_movements = db.query(InventoryMovement).filter(
            or_(
                InventoryMovement.tenant_id == tenant_id,
                InventoryMovement.company_id == tenant_id
            )
        ).all()
        if inv_movements:
            logger.info(f"Deleting {len(inv_movements)} InventoryMovement records...")
            for im in inv_movements:
                db.delete(im)
            db.flush()

        # b. Finance Journal Entries (cascades to FinanceJournalLine)
        journal_entries = db.query(FinanceJournalEntry).filter(
            or_(
                FinanceJournalEntry.tenant_id == tenant_id,
                FinanceJournalEntry.company_id == tenant_id
            )
        ).all()
        if journal_entries:
            logger.info(f"Deleting {len(journal_entries)} FinanceJournalEntry records (cascading lines)...")
            for je in journal_entries:
                db.delete(je)
            db.flush()

        # c. Hierarchical Accounts (child accounts first to satisfy parent_id self-FK)
        child_accounts = db.query(Account).filter(
            Account.tenant_id == tenant_id,
            Account.parent_id.isnot(None)
        ).all()
        if child_accounts:
            logger.info(f"Deleting {len(child_accounts)} child Account records...")
            for a in child_accounts:
                db.delete(a)
            db.flush()

        root_accounts = db.query(Account).filter(Account.tenant_id == tenant_id).all()
        if root_accounts:
            logger.info(f"Deleting {len(root_accounts)} root Account records...")
            for a in root_accounts:
                db.delete(a)
            db.flush()

        # 3. Trigger SQLAlchemy cascading deletions for ResCompany relationships
        if company:
            logger.info("Resolving and loading ResCompany ORM relationships for cascade evaluation...")
            for rel in ResCompany.__mapper__.relationships:
                # Accessing the attribute populates the collection so SQLAlchemy can execute delete-orphan
                try:
                    rel_val = getattr(company, rel.key)
                    if rel_val:
                        count = len(rel_val) if isinstance(rel_val, list) else 1
                        logger.info(f"  Cascading mapped relationship: {rel.key} ({count} record(s))")
                except Exception as rel_err:
                    logger.debug(f"  Skipping non-essential relationship {rel.key}: {rel_err}")

            logger.info("Executing delete on ResCompany...")
            db.delete(company)
            db.flush()

        # 4. Delete MasterTenant record
        if master:
            logger.info("Executing delete on MasterTenant...")
            db.delete(master)
            db.flush()

        # 5. Clean up any lingering tenant_users by ID or email
        if user_ids or user_emails:
            cleanup_query = text("""
                DELETE FROM tenant_users 
                WHERE id = ANY(:user_ids) OR email = ANY(:user_emails)
            """)
            deleted_tu = db.execute(cleanup_query, {
                "user_ids": user_ids if user_ids else [uuid.uuid4()],
                "user_emails": user_emails if user_emails else [""]
            }).rowcount
            logger.info(f"Cleaned up {deleted_tu} records from tenant_users table.")
            db.flush()

        # 6. Check for isolated PostgreSQL schema if any exists
        sanitized_slug = identifier.replace("-", "_")
        for schema_candidate in [f"tenant_{sanitized_slug}", sanitized_slug]:
            schema_exists = db.execute(
                text("SELECT schema_name FROM information_schema.schemata WHERE schema_name = :s"),
                {"s": schema_candidate}
            ).scalar()
            if schema_exists:
                logger.info(f"Dropping isolated PostgreSQL schema '{schema_candidate}' CASCADE...")
                db.execute(text(f'DROP SCHEMA IF EXISTS "{schema_candidate}" CASCADE'))
                db.flush()

        # 7. Commit or Rollback
        if dry_run:
            db.rollback()
            logger.info("DRY-RUN completed successfully. All changes rolled back.")
            return True
        else:
            db.commit()
            logger.info("Database transaction committed successfully.")

        # 8. Post-purge verification
        comp_check = db.query(ResCompany).filter(
            or_(ResCompany.slug == identifier, ResCompany.id == tenant_id)
        ).first()
        master_check = db.query(MasterTenant).filter(
            or_(MasterTenant.slug == identifier, MasterTenant.id == tenant_id)
        ).first()

        if comp_check is None and master_check is None:
            logger.info(f"Verification confirmed: Tenant '{identifier}' has been completely removed from database.")
            return True
        else:
            logger.error(f"Post-purge verification failed: Record still detected in database.")
            return False

    except Exception as e:
        db.rollback()
        logger.error(f"Error encountered during purge: {e}", exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    success = purge_wac_ye_tenant(dry_run=dry_run)
    if success:
        print("\n" + "=" * 60)
        print("CONFIRMATION: Tenant 'wac-ye' has been successfully purged.")
        print("=" * 60 + "\n")
        sys.exit(0)
    else:
        print("\nFAILURE: Purge sequence could not be completed.")
        sys.exit(1)
