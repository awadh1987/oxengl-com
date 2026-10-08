# File: backend/app/domains/finance/audit_export.py
import xml.etree.ElementTree as ET
from xml.dom import minidom
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from backend.app.database import get_isolated_db_session
from backend.app.domains.finance.models import AccountChart
from backend.app.domains.planning.models import ResCompany

router = APIRouter(prefix="/api/v1/finance", tags=["Financial Compliance Auditing"])

def serialize_account_node(xml_parent: ET.Element, account: AccountChart):
    """
    Recursively maps nested 5-depth general ledger child branches into XML elements.
    """
    account_node = ET.SubElement(xml_parent, "LedgerAccount")
    acc_code = getattr(account, "account_code", None) or getattr(account, "code", "")
    acc_type = getattr(account, "account_type", "")
    account_node.set("code", str(acc_code))
    account_node.set("type", str(acc_type))
    
    # Secure structural string bindings
    ET.SubElement(account_node, "AccountName").text = str(getattr(account, "name", ""))
    balance = getattr(account, 'current_balance', None)
    if balance is None:
        balance = getattr(account, 'accumulated_balance', 0.00)
    ET.SubElement(account_node, "NetBalanceSAR").text = f"{float(balance):.2f}"
    
    # Deep dive recursive parsing for child nodes
    if getattr(account, "children", None):
        children_wrapper = ET.SubElement(account_node, "ChildAccounts")
        for child in account.children:
            serialize_account_node(children_wrapper, child)

@router.get("/generate-closing-xml")
def generate_audit_closing_xml(db: Session = Depends(get_isolated_db_session)):
    """
    Tenant-Isolated Financial Audit Closing Engine.
    Compiles 5-deep ledger accounts into structured XML vectors.
    """
    # 1. Fetch current active company metadata (Scoping provided by RLS)
    active_company = db.query(ResCompany).first()
    if not active_company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active corporate tenant context allocation failure."
        )

    # 2. Initialize XML DOM tree node structure
    root = ET.Element("FinancialAuditClosingManifest")
    root.set("schema_version", "2026.1")
    
    # Injected corporate metadata block
    meta = ET.SubElement(root, "EnterpriseMetadata")
    ET.SubElement(meta, "TenantID").text = str(active_company.id)
    name_ar = getattr(active_company, "name_ar", None) or getattr(active_company, "name", "شركة ميون الاقتصادية المحدودة")
    name_en = getattr(active_company, "name_en", None) or getattr(active_company, "name", "MYON ECONOMIC CO LTD.")
    ET.SubElement(meta, "CompanyNameAR").text = str(name_ar)
    ET.SubElement(meta, "CompanyNameEN").text = str(name_en)
    ET.SubElement(meta, "FiscalYear").text = "2026"
    ET.SubElement(meta, "AuditStatus").text = "COMPILED_CLOSING_TRIAL"

    # 3. Pull root ledger items (Accounts with no parent_id mapping link)
    root_accounts = db.query(AccountChart).filter(AccountChart.parent_id == None).all()
    
    chart_wrapper = ET.SubElement(root, "ChartOfAccountsTree")
    for account in root_accounts:
        serialize_account_node(chart_wrapper, account)

    # 4. Generate beautifully indented, minified XML payload string data
    raw_xml_string = ET.tostring(root, encoding="utf-8")
    parsed_dom = minidom.parseString(raw_xml_string)
    pretty_xml_payload = parsed_dom.toprettyxml(indent="  ")

    slug_val = getattr(active_company, 'domain_slug', None) or getattr(active_company, 'slug', 'myon-logistics')

    return Response(
        content=pretty_xml_payload,
        media_type="application/xml",
        headers={
            "Content-Disposition": f"attachment; filename=audit_closing_{slug_val}_2026.xml"
        }
    )
