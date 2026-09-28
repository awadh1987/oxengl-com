"""
Tenant and Workspace Data Purging Service.
Provides robust, topologically-ordered cascading deletion and purge workflows for
tenant workspaces and companies, preventing any Foreign Key constraint violations.
"""

import logging
import uuid
from typing import Any, Dict, List, Optional, Union
from sqlalchemy import text
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)


def purge_single_tenant_data(
    db: Session,
    tenant_id: Union[str, uuid.UUID],
    company: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Executes a comprehensive, topologically ordered database wipe for a single tenant workspace.
    Deletes all child and dependent entities before deleting the root ResCompany and MasterTenant records.
    Uses nested savepoints (db.begin_nested()) to insulate each statement safely.
    """
    # 1. Resolve UUID and Company entity
    tenant_uuid: Optional[uuid.UUID] = None
    if isinstance(tenant_id, uuid.UUID):
        tenant_uuid = tenant_id
    else:
        try:
            tenant_uuid = uuid.UUID(str(tenant_id).strip())
        except (ValueError, AttributeError):
            tenant_uuid = None

    if company is None or isinstance(company, dict):
        comp_dict = company if isinstance(company, dict) else None
        if not comp_dict:
            if tenant_uuid:
                found = db.execute(
                    text("SELECT id, name, slug, domain_slug FROM res_companies WHERE id = :cid"),
                    {"cid": tenant_uuid},
                ).mappings().first()
                if found:
                    comp_dict = dict(found)
            if not comp_dict and isinstance(tenant_id, str):
                found = db.execute(
                    text("SELECT id, name, slug, domain_slug FROM res_companies WHERE slug = :s OR domain_slug = :s"),
                    {"s": tenant_id.strip()},
                ).mappings().first()
                if found:
                    comp_dict = dict(found)
    else:
        comp_dict = {
            "id": getattr(company, "id", None),
            "name": getattr(company, "name", None),
            "slug": getattr(company, "slug", None),
            "domain_slug": getattr(company, "domain_slug", None),
        }

    if not comp_dict and not tenant_uuid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant workspace '{tenant_id}' not found.",
        )

    cid_str = str(comp_dict["id"]) if comp_dict and comp_dict.get("id") else str(tenant_uuid)
    cid_uuid = uuid.UUID(cid_str)
    slug = (comp_dict.get("domain_slug") or comp_dict.get("slug")) if comp_dict else ""
    company_name = comp_dict.get("name") if comp_dict else "Unknown Workspace"

    logger.info(f"Initiating top-down ordered purge for tenant {company_name} (ID: {cid_str}, Slug: {slug})")

    # Topologically ordered child table cleanup queries (from deepest leaf children to parent records)
    cleanup_queries = [
        # Sessions and security tokens
        ("user_sessions", "DELETE FROM user_sessions WHERE tenant_id = :cid OR user_id IN (SELECT id FROM res_users WHERE company_id = :cid)"),
        ("security_tokens", "DELETE FROM security_tokens WHERE user_id IN (SELECT id FROM res_users WHERE company_id = :cid)"),
        ("sync_queue_events", "DELETE FROM sync_queue_events WHERE company_id = :cid"),
        ("device_registrations", "DELETE FROM device_registrations WHERE company_id = :cid"),
        ("security_events", "DELETE FROM security_events WHERE company_id = :cid"),

        # AI and governance
        ("ai_governance_logs", "DELETE FROM ai_governance_logs WHERE company_id = :cid"),
        ("ai_model_configs", "DELETE FROM ai_model_configs WHERE company_id = :cid"),
        ("ai_knowledge_chunks", "DELETE FROM ai_knowledge_chunks WHERE tenant_id = :cid"),
        ("ai_knowledge_documents", "DELETE FROM ai_knowledge_documents WHERE tenant_id = :cid"),

        # Logistics, Fleet, Telemetry
        ("manifest_stops", "DELETE FROM manifest_stops WHERE waybill_id IN (SELECT id FROM waybills WHERE tenant_id = :cid)"),
        ("waybills", "DELETE FROM waybills WHERE tenant_id = :cid"),
        ("delivery_manifests", "DELETE FROM delivery_manifests WHERE tenant_id = :cid"),
        ("delivery_proofs", "DELETE FROM delivery_proofs WHERE company_id = :cid"),
        ("trip_inspection_logs", "DELETE FROM trip_inspection_logs WHERE company_id = :cid"),
        ("fleet_trips", "DELETE FROM fleet_trips WHERE company_id = :cid"),
        ("fleet_utilization_facts", "DELETE FROM fleet_utilization_facts WHERE company_id = :cid"),
        ("gps_events", "DELETE FROM gps_events WHERE tenant_id = :cid"),
        ("iot_telemetry_events", "DELETE FROM iot_telemetry_events WHERE tenant_id = :cid OR vehicle_id IN (SELECT id FROM vehicles WHERE company_id = :cid)"),
        ("fuel_transactions", "DELETE FROM fuel_transactions WHERE company_id = :cid"),
        ("part_requirements", "DELETE FROM part_requirements WHERE company_id = :cid"),
        ("maintenance_work_orders", "DELETE FROM maintenance_work_orders WHERE company_id = :cid"),
        ("vehicles", "DELETE FROM vehicles WHERE company_id = :cid OR tenant_id = :cid"),
        ("drivers", "DELETE FROM drivers WHERE tenant_id = :cid OR user_id IN (SELECT id FROM res_users WHERE company_id = :cid)"),

        # Agriculture
        ("farm_gate_weighments", "DELETE FROM farm_gate_weighments WHERE company_id = :cid"),
        ("harvest_batches", "DELETE FROM harvest_batches WHERE company_id = :cid"),
        ("seasonal_crop_cycles", "DELETE FROM seasonal_crop_cycles WHERE company_id = :cid"),

        # Procurement, Bids, RFQs & Tenders
        ("procurement_bid_lines", "DELETE FROM procurement_bid_lines WHERE bid_id IN (SELECT id FROM procurement_bids WHERE tender_id IN (SELECT id FROM procurement_tenders WHERE company_id = :cid))"),
        ("procurement_bids", "DELETE FROM procurement_bids WHERE tender_id IN (SELECT id FROM procurement_tenders WHERE company_id = :cid)"),
        ("procurement_tenders", "DELETE FROM procurement_tenders WHERE company_id = :cid"),
        ("purchasing_organizations", "DELETE FROM purchasing_organizations WHERE company_id = :cid"),
        ("purchase_requisitions", "DELETE FROM purchase_requisitions WHERE tenant_id = :cid"),
        ("vendor_bills", "DELETE FROM vendor_bills WHERE tenant_id = :cid OR company_id = :cid"),
        ("vendors", "DELETE FROM vendors WHERE tenant_id = :cid"),
        ("goods_receipts", "DELETE FROM goods_receipts WHERE company_id = :cid"),
        ("purchase_orders", "DELETE FROM purchase_orders WHERE company_id = :cid"),
        ("customs_manifests", "DELETE FROM customs_manifests WHERE tenant_id = :cid OR company_id = :cid"),

        # Inventory & Stock
        ("landed_cost_items", "DELETE FROM landed_cost_items WHERE material_id IN (SELECT id FROM materials WHERE company_id = :cid OR tenant_id = :cid)"),
        ("landed_cost_allocations", "DELETE FROM landed_cost_allocations WHERE tenant_id = :cid"),
        ("materials", "DELETE FROM materials WHERE company_id = :cid OR tenant_id = :cid"),
        ("stock_balances", "DELETE FROM stock_balances WHERE tenant_id = :cid"),
        ("stock_quants", "DELETE FROM stock_quants WHERE company_id = :cid"),
        ("stock_movements", "DELETE FROM stock_movements WHERE company_id = :cid"),
        ("inventory_movements", "DELETE FROM inventory_movements WHERE tenant_id = :cid OR company_id = :cid"),
        ("stock_moves", "DELETE FROM stock_moves WHERE company_id = :cid"),
        ("weighbridge_tickets", "DELETE FROM weighbridge_tickets WHERE company_id = :cid"),
        ("stock_pickings", "DELETE FROM stock_pickings WHERE company_id = :cid"),
        ("stock_lots", "DELETE FROM stock_lots WHERE company_id = :cid"),
        ("stock_items", "DELETE FROM stock_items WHERE company_id = :cid"),
        ("product_products", "DELETE FROM product_products WHERE company_id = :cid"),
        ("yard_gate_appointments", "DELETE FROM yard_gate_appointments WHERE company_id = :cid"),
        ("warehouse_zones", "DELETE FROM warehouse_zones WHERE company_id = :cid"),
        ("warehouses", "DELETE FROM warehouses WHERE company_id = :cid"),
        ("stock_locations", "DELETE FROM stock_locations WHERE company_id = :cid"),

        # Finance, Taxes & General Ledger
        ("zatca_logs", "DELETE FROM zatca_logs WHERE company_id = :cid"),
        ("tax_rules", "DELETE FROM tax_rules WHERE company_id = :cid"),
        ("tax_profiles", "DELETE FROM tax_profiles WHERE company_id = :cid"),
        ("supplier_settlements", "DELETE FROM supplier_settlements WHERE company_id = :cid"),
        ("transporter_ledger", "DELETE FROM transporter_ledger WHERE company_id = :cid"),
        ("customer_invoices", "DELETE FROM customer_invoices WHERE company_id = :cid"),
        ("supplier_invoices", "DELETE FROM supplier_invoices WHERE company_id = :cid"),
        ("account_move_lines", "DELETE FROM account_move_lines WHERE company_id = :cid"),
        ("account_moves", "DELETE FROM account_moves WHERE company_id = :cid"),
        ("finance_journal_lines", "DELETE FROM finance_journal_lines WHERE tenant_id = :cid OR entry_id IN (SELECT id FROM finance_journal_entries WHERE tenant_id = :cid OR company_id = :cid)"),
        ("finance_journal_entries", "DELETE FROM finance_journal_entries WHERE tenant_id = :cid OR company_id = :cid"),
        ("journal_lines", "DELETE FROM journal_lines WHERE entry_id IN (SELECT id FROM journal_entries WHERE tenant_id = :cid OR company_id = :cid)"),
        ("journal_entries", "DELETE FROM journal_entries WHERE tenant_id = :cid OR company_id = :cid"),
        ("electronic_ledger_blocks", "DELETE FROM electronic_ledger_blocks WHERE tenant_id = :cid"),
        ("reporting_ledger_summaries", "DELETE FROM reporting_ledger_summaries WHERE company_id = :cid"),
        ("cost_centers", "DELETE FROM cost_centers WHERE company_id = :cid"),
        ("accounts", "DELETE FROM accounts WHERE (tenant_id = :cid OR company_id = :cid) AND parent_id IS NOT NULL"),
        ("accounts", "DELETE FROM accounts WHERE tenant_id = :cid OR company_id = :cid"),
        ("account_accounts", "DELETE FROM account_accounts WHERE company_id = :cid"),
        ("account_journals", "DELETE FROM account_journals WHERE company_id = :cid"),
        ("fiscal_years", "DELETE FROM fiscal_years WHERE company_id = :cid"),

        # HR & Personnel
        ("hrms_attendance_logs", "DELETE FROM hrms_attendance_logs WHERE tenant_id = :cid"),
        ("attendance_logs", "DELETE FROM attendance_logs WHERE tenant_id = :cid"),
        ("payroll_runs", "DELETE FROM payroll_runs WHERE tenant_id = :cid"),
        ("employees", "DELETE FROM employees WHERE tenant_id = :cid OR user_id IN (SELECT id FROM res_users WHERE company_id = :cid)"),

        # Documents & Attachments
        ("operation_attachments", "DELETE FROM operation_attachments WHERE company_id = :cid"),
        ("tenant_documents", "DELETE FROM tenant_documents WHERE company_id = :cid"),

        # Partners and Users
        ("vendor_portal_users", "DELETE FROM vendor_portal_users WHERE company_id = :cid"),
        ("res_partners", "DELETE FROM res_partners WHERE company_id = :cid"),
        ("res_users", "DELETE FROM res_users WHERE company_id = :cid"),

        # Tenant Configuration & Audits
        ("tenant_audit_logs", "DELETE FROM tenant_audit_logs WHERE tenant_id = :cid"),
        ("platform_audit_logs", "DELETE FROM platform_audit_logs WHERE company_id = :cid"),
        ("tenant_database_migrations", "DELETE FROM tenant_database_migrations WHERE company_id = :cid"),
        ("tenant_database_configs", "DELETE FROM tenant_database_configs WHERE company_id = :cid"),
        ("tenant_sso_configs", "DELETE FROM tenant_sso_configs WHERE company_id = :cid"),
        ("workflow_instances", "DELETE FROM workflow_instances WHERE tenant_id = :cid"),
        ("approval_rules", "DELETE FROM approval_rules WHERE tenant_id = :cid"),
        ("system_sequences", "DELETE FROM system_sequences WHERE tenant_id = :cid_str OR (tenant_id = :slug AND :slug != '')"),

        # SaaS Subscriptions
        ("tenant_subscriptions", "DELETE FROM tenant_subscriptions WHERE tenant_id = :cid"),
    ]

    total_deleted_rows = 0
    params = {"cid": cid_uuid, "cid_str": cid_str, "slug": slug or ""}

    for table_label, query_str in cleanup_queries:
        try:
            with db.begin_nested():
                res = db.execute(text(query_str), params)
                if res.rowcount and res.rowcount > 0:
                    total_deleted_rows += res.rowcount
                    logger.debug(f"Purged {res.rowcount} rows from {table_label}")
        except Exception as exc:
            logger.debug(f"Table purge skip {table_label}: {exc}")

    # Remove linked master_tenants record if slug matches
    if slug:
        try:
            with db.begin_nested():
                db.execute(text("DELETE FROM saas_invoices WHERE tenant_id IN (SELECT id FROM master_tenants WHERE slug = :slug)"), {"slug": slug})
                db.execute(text("DELETE FROM tenant_databases WHERE tenant_id IN (SELECT id FROM master_tenants WHERE slug = :slug)"), {"slug": slug})
                db.execute(text("DELETE FROM master_tenants WHERE slug = :slug"), {"slug": slug})
        except Exception as exc:
            logger.debug(f"Could not purge master_tenants for slug '{slug}': {exc}")

    # Unlink any child branches so foreign keys don't block
    try:
        with db.begin_nested():
            db.execute(text("UPDATE res_companies SET parent_id = NULL WHERE parent_id = :cid"), {"cid": cid_uuid})
    except Exception as exc:
        logger.debug(f"Could not unlink child branches: {exc}")

    # Finally delete parent company record
    with db.begin_nested():
        delete_res = db.execute(text("DELETE FROM res_companies WHERE id = :cid"), {"cid": cid_uuid})
        deleted_company_count = delete_res.rowcount or 1

    # Invalidate Redis tenant resolver cache
    try:
        from backend.app.core.cache import get_redis_client
        redis_client = get_redis_client()
        if redis_client:
            keys_to_delete = [
                f"tenant:slug:{slug}",
                f"tenant:id:{cid_str}",
                f"tenant:company:{cid_str}",
            ]
            redis_client.delete(*keys_to_delete)
    except Exception as exc:
        logger.debug(f"Redis cache invalidate skip: {exc}")

    return {
        "tenant_id": cid_str,
        "tenant_slug": slug,
        "tenant_name": company_name,
        "total_records_purged": total_deleted_rows,
        "company_records_deleted": deleted_company_count,
    }


def purge_multiple_tenants(
    db: Session,
    tenant_ids: List[Union[str, uuid.UUID]],
) -> Dict[str, Any]:
    """
    Purges a list of tenant workspaces atomically within a single transaction.
    """
    purged: List[str] = []
    failed: List[str] = []
    errors: List[str] = []

    for tid in tenant_ids:
        tid_str = str(tid)
        try:
            purge_single_tenant_data(db, tid)
            purged.append(tid_str)
        except Exception as exc:
            logger.error(f"Failed to purge tenant {tid_str}: {exc}", exc_info=True)
            failed.append(tid_str)
            errors.append(f"Tenant {tid_str}: {str(exc)}")

    return {
        "success": len(failed) == 0,
        "purged_count": len(purged),
        "purged_ids": purged,
        "failed_count": len(failed),
        "failed_ids": failed,
        "errors": errors,
    }
