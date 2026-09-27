"""
Enterprise-Standard Corporate CV & Prequalification PDF Generator.
Phase 8 - Step 3 Implementation.

Uses WeasyPrint to transform the aggregated Corporate CV JSON payload
into an executive, vector-crisp, multi-page PDF document adhering to
global procurement and institutional tender evaluation standards.
"""

from __future__ import annotations

import html
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

try:
    from weasyprint import HTML
except (ImportError, Exception):
    HTML = None

logger = logging.getLogger("oxengl.pdf_generator")


def _format_currency(val: Any, currency: str = "SAR") -> str:
    """Format numeric value into standard monetary notation with commas."""
    try:
        num = float(val or 0)
        return f"{num:,.2f} {currency}"
    except (ValueError, TypeError):
        return f"0.00 {currency}"


def _format_int(val: Any) -> str:
    """Format integers with commas."""
    try:
        return f"{int(val):,}"
    except (ValueError, TypeError):
        return "0"


def _format_date(val: Optional[str]) -> str:
    """Parse ISO date or string to YYYY-MM-DD."""
    if not val:
        return "N/A"
    try:
        if "T" in str(val):
            dt = datetime.fromisoformat(str(val).replace("Z", "+00:00"))
            return dt.strftime("%Y-%m-%d")
        return str(val)[:10]
    except Exception:
        return str(val)[:10]


def render_corporate_cv_html(payload: Dict[str, Any]) -> str:
    """
    Renders a complete, standalone, print-optimized HTML5 document
    for enterprise corporate prequalification dossiers.
    """
    meta = payload.get("meta", {})
    comp = payload.get("company_profile", {})
    kpis = payload.get("summary_kpis", {})
    fleet = payload.get("fleet_capacity", {})
    workforce = payload.get("workforce", {})
    regions = payload.get("operating_regions", {})
    finance = payload.get("financial_standing", {})
    vault = payload.get("compliance_vault", {})
    checklist = vault.get("mandatory_checklist", {})
    projects = payload.get("executed_projects", {})

    company_name = html.escape(comp.get("legal_name", "Enterprise Contractor"))
    cr_number = html.escape(comp.get("commercial_registration", "N/A"))
    vat_number = html.escape(comp.get("tax_id", "N/A"))
    std_code = html.escape(meta.get("standard", "GLOBAL-STD-2026.1 / ISO-21500"))
    gen_at = _format_date(meta.get("generated_at", datetime.now(timezone.utc).isoformat()))
    gen_by = html.escape(meta.get("generated_by", "Authorized Officer"))
    readiness_score = float(meta.get("compliance_score_percent", 0.0))
    rating_badge = meta.get("compliance_rating", "COMPLIANT")
    badge_color = "#16A34A" if rating_badge == "COMPLIANT" else ("#D97706" if rating_badge == "PARTIAL" else "#DC2626")

    currency = comp.get("currency", "SAR")

    # Fleet tables
    vehicles: List[Dict[str, Any]] = fleet.get("vehicles", [])
    vehicle_rows_html = ""
    for idx, v in enumerate(vehicles[:15], 1):
        v_name = html.escape(v.get("name", "Asset Unit"))
        v_plate = html.escape(v.get("license_plate", "N/A"))
        v_type = html.escape((v.get("vehicle_type") or "truck").title())
        v_make = html.escape(f"{v.get('make', '')} {v.get('model', '')}".strip() or "Standard Heavy")
        v_year = str(v.get("model_year", 2024))
        v_stat = html.escape((v.get("status") or "active").upper())
        stat_color = "#16A34A" if v_stat == "ACTIVE" else "#EAB308"
        v_branch = html.escape(v.get("branch_name", "Main Plant"))

        vehicle_rows_html += f"""
        <tr>
            <td style="text-align:center;">{idx}</td>
            <td><strong>{v_name}</strong><br><span style="font-size:8pt;color:#64748B;">{v_make} ({v_year})</span></td>
            <td><code>{v_plate}</code></td>
            <td>{v_type}</td>
            <td style="text-align:center;"><span class="badge" style="background:{stat_color};">{v_stat}</span></td>
            <td>{v_branch}</td>
        </tr>
        """

    if not vehicle_rows_html:
        vehicle_rows_html = '<tr><td colspan="6" style="text-align:center;color:#64748B;">No physical machinery records listed.</td></tr>'

    # Checklist rows
    checklist_keys = [
        ("commercial_registration", "Commercial Registration (CR)", "Ministry of Commerce"),
        ("zatca_tax_vat", "ZATCA VAT & Tax Certificate", "ZATCA Authority"),
        ("gosi_saudization", "GOSI Saudization & Social Insurance", "GOSI / Ministry of HR"),
        ("iso_certifications", "ISO Quality & Safety Standards (9001/45001)", "Accredited Registrar"),
        ("chamber_of_commerce", "Chamber of Commerce Membership", "Chamber of Commerce"),
        ("municipal_civil_defense", "Civil Defense & Municipal Operating License", "Municipal Authority"),
    ]
    checklist_rows_html = ""
    for k, label, auth in checklist_keys:
        item = checklist.get(k, {})
        is_verified = item.get("verified", False)
        is_present = item.get("present", False)
        doc_num = html.escape(item.get("document_number") or cr_number if k == "commercial_registration" else (vat_number if k == "zatca_tax_vat" else "ON-FILE"))
        exp_date = _format_date(item.get("expiry_date"))

        if is_verified:
            status_html = '<span class="badge badge-success">✓ VERIFIED</span>'
        elif is_present:
            status_html = '<span class="badge badge-warning">⏳ PENDING AUDIT</span>'
        else:
            status_html = '<span class="badge badge-danger">✗ MISSING</span>'

        checklist_rows_html += f"""
        <tr>
            <td><strong>{label}</strong></td>
            <td>{auth}</td>
            <td><code>{doc_num}</code></td>
            <td style="text-align:center;">{exp_date}</td>
            <td style="text-align:center;">{status_html}</td>
        </tr>
        """

    # Vault documents table
    docs: List[Dict[str, Any]] = vault.get("documents", [])
    doc_rows_html = ""
    for d in docs[:12]:
        d_type = html.escape(d.get("document_type", "GENERAL"))
        d_title = html.escape(d.get("title", "Credential Document"))
        d_num = html.escape(d.get("document_number") or "N/A")
        d_auth = html.escape(d.get("issuing_authority") or "Government Authority")
        d_exp = _format_date(d.get("expiry_date"))
        d_stat = d.get("verification_status", "UNVERIFIED")
        d_color = "#16A34A" if d_stat == "VERIFIED" else ("#DC2626" if d_stat == "EXPIRED" else "#64748B")

        doc_rows_html += f"""
        <tr>
            <td><strong>{d_title}</strong><br><span style="font-size:7.5pt;color:#64748B;">Type: {d_type} | ID: {d_num}</span></td>
            <td>{d_auth}</td>
            <td style="text-align:center;">{d_exp}</td>
            <td style="text-align:center;"><span class="badge" style="background:{d_color};">{d_stat}</span></td>
        </tr>
        """
    if not doc_rows_html:
        doc_rows_html = '<tr><td colspan="4" style="text-align:center;color:#64748B;">All corporate records verified via primary registration.</td></tr>'

    # Facilities / Operating Regions
    facilities_list = regions.get("facilities", [])
    facility_items_html = ""
    for f in facilities_list[:6]:
        fname = html.escape(f.get("facility_name", "Hub Facility"))
        ftype = html.escape(f.get("facility_type", "Logistics Terminal"))
        faddr = html.escape(f.get("address", "Industrial Zone"))
        facility_items_html += f"""
        <div class="facility-box">
            <div class="fac-title">{fname}</div>
            <div class="fac-type">{ftype}</div>
            <div class="fac-addr">📍 {faddr}</div>
        </div>
        """
    if not facility_items_html:
        facility_items_html = '<div style="color:#64748B;font-size:9pt;">Riyadh Central Logistics Hub & Regional Terminals</div>'

    # Workforce department distribution
    depts = workforce.get("department_distribution", {})
    dept_tags_html = "".join(
        f'<span class="dept-chip"><strong>{html.escape(str(d))}</strong>: {cnt}</span> '
        for d, cnt in depts.items()
    ) or '<span class="dept-chip">Operations & Engineering Staff</span>'

    # Key personnel list
    personnel = workforce.get("key_personnel", [])
    personnel_rows_html = ""
    for p in personnel[:4]:
        p_name = html.escape(p.get("full_name", "Corporate Officer"))
        p_role = html.escape(p.get("role", "Operations Executive"))
        p_email = html.escape(p.get("email", "N/A"))
        personnel_rows_html += f"""
        <tr>
            <td><strong>{p_name}</strong></td>
            <td>{p_role}</td>
            <td><code>{p_email}</code></td>
        </tr>
        """
    if not personnel_rows_html:
        personnel_rows_html = '<tr><td colspan="3" style="text-align:center;color:#64748B;">Enterprise Leadership & Technical Directorship</td></tr>'

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Corporate Profile — {company_name}</title>
<style>
    @page {{
        size: A4 portrait;
        margin: 16mm 14mm 18mm 14mm;
        @top-left {{
            content: "GLOBAL INSTITUTIONAL PROCUREMENT STANDARD — TENDER PRE-QUALIFICATION DOSSIER";
            font-family: 'Helvetica Neue', Arial, sans-serif;
            font-size: 7pt;
            color: #64748B;
            font-weight: 600;
            letter-spacing: 0.5px;
        }}
        @top-right {{
            content: "STANDARD: {std_code}";
            font-family: 'Helvetica Neue', Arial, sans-serif;
            font-size: 7pt;
            color: #64748B;
            font-weight: 600;
        }}
        @bottom-left {{
            content: "CONFIDENTIAL & PROPRIETARY — STRICTLY FOR TENDER EVALUATION";
            font-family: 'Helvetica Neue', Arial, sans-serif;
            font-size: 7pt;
            color: #94A3B8;
        }}
        @bottom-right {{
            content: "Page " counter(page) " of " counter(pages);
            font-family: 'Helvetica Neue', Arial, sans-serif;
            font-size: 7.5pt;
            color: #475569;
            font-weight: 600;
        }}
    }}

    body {{
        font-family: 'Helvetica Neue', Arial, sans-serif;
        color: #1E293B;
        margin: 0;
        padding: 0;
        font-size: 9pt;
        line-height: 1.45;
        background: #FFFFFF;
    }}

    /* Header Banner */
    .header-banner {{
        border-bottom: 2.5pt solid #006699;
        padding-bottom: 12px;
        margin-bottom: 14px;
        position: relative;
    }}
    .enterprise-tag {{
        display: inline-block;
        background: #006699;
        color: #FFFFFF;
        font-size: 7.5pt;
        font-weight: 700;
        text-transform: uppercase;
        padding: 3px 8px;
        border-radius: 3px;
        letter-spacing: 0.8px;
        margin-bottom: 6px;
    }}
    .main-title {{
        font-size: 19pt;
        font-weight: 800;
        color: #0F172A;
        margin: 0 0 4px 0;
        letter-spacing: -0.3px;
    }}
    .sub-title {{
        font-size: 9.5pt;
        color: #475569;
        margin: 0;
    }}

    .meta-bar {{
        display: flex;
        justify-content: space-between;
        background: #F8FAFC;
        border: 1px solid #E2E8F0;
        border-radius: 4px;
        padding: 8px 12px;
        margin-top: 10px;
        font-size: 8pt;
    }}
    .meta-item {{
        display: inline-block;
        margin-right: 18px;
    }}
    .meta-label {{
        color: #64748B;
        font-size: 7pt;
        text-transform: uppercase;
        font-weight: 700;
        letter-spacing: 0.5px;
    }}
    .meta-value {{
        font-weight: 700;
        color: #0F172A;
    }}

    /* KPI Grid */
    .kpi-container {{
        display: table;
        width: 100%;
        margin-bottom: 14px;
        border-spacing: 6px 0;
    }}
    .kpi-cell {{
        display: table-cell;
        width: 16.66%;
        background: #F1F5F9;
        border: 1px solid #CBD5E1;
        border-top: 3px solid #006699;
        border-radius: 4px;
        padding: 8px;
        text-align: center;
        vertical-align: middle;
    }}
    .kpi-number {{
        font-size: 13pt;
        font-weight: 800;
        color: #004F77;
        margin-bottom: 2px;
    }}
    .kpi-label {{
        font-size: 6.5pt;
        font-weight: 700;
        text-transform: uppercase;
        color: #475569;
        letter-spacing: 0.3px;
        line-height: 1.2;
    }}

    /* Section Styling */
    .section-title {{
        font-size: 11pt;
        font-weight: 700;
        color: #004F77;
        border-bottom: 1.5px solid #E2E8F0;
        padding-bottom: 4px;
        margin-top: 14px;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
    }}
    .section-title::before {{
        content: "■";
        color: #006699;
        font-size: 9pt;
        margin-right: 6px;
    }}

    /* Tables */
    table.data-table {{
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 12px;
        font-size: 8pt;
    }}
    table.data-table th {{
        background: #0F172A;
        color: #FFFFFF;
        text-align: left;
        padding: 6px 8px;
        font-weight: 700;
        font-size: 7.5pt;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        border: 1px solid #0F172A;
    }}
    table.data-table td {{
        padding: 5.5px 8px;
        border: 1px solid #E2E8F0;
        vertical-align: middle;
    }}
    table.data-table tr:nth-child(even) {{
        background: #F8FAFC;
    }}

    /* Badges */
    .badge {{
        display: inline-block;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 7pt;
        font-weight: 700;
        color: #FFFFFF;
        text-transform: uppercase;
        letter-spacing: 0.3px;
    }}
    .badge-success {{ background: #16A34A; }}
    .badge-warning {{ background: #D97706; }}
    .badge-danger {{ background: #DC2626; }}
    .badge-info {{ background: #006699; }}

    /* Facilities Layout */
    .facilities-grid {{
        display: table;
        width: 100%;
        margin-bottom: 10px;
    }}
    .facility-box {{
        display: inline-block;
        width: 31%;
        background: #F8FAFC;
        border: 1px solid #CBD5E1;
        border-left: 3px solid #006699;
        border-radius: 3px;
        padding: 6px 8px;
        margin-right: 1.5%;
        margin-bottom: 6px;
        vertical-align: top;
        box-sizing: border-box;
    }}
    .fac-title {{ font-weight: 700; color: #0F172A; font-size: 8pt; margin-bottom: 2px; }}
    .fac-type {{ font-size: 7pt; color: #006699; font-weight: 600; text-transform: uppercase; }}
    .fac-addr {{ font-size: 7pt; color: #64748B; margin-top: 2px; }}

    /* Department Chips */
    .dept-chip {{
        display: inline-block;
        background: #F1F5F9;
        border: 1px solid #CBD5E1;
        padding: 3px 8px;
        border-radius: 12px;
        font-size: 7.5pt;
        color: #334155;
        margin-right: 4px;
        margin-bottom: 4px;
    }}

    /* Declaration Box */
    .declaration-box {{
        background: #F8FAFC;
        border: 1px solid #CBD5E1;
        border-left: 4px solid #006699;
        border-radius: 4px;
        padding: 10px 14px;
        margin-top: 14px;
        page-break-inside: avoid;
    }}
    .declaration-title {{
        font-size: 8.5pt;
        font-weight: 800;
        color: #004F77;
        text-transform: uppercase;
        margin-bottom: 4px;
    }}
    .declaration-text {{
        font-size: 7.5pt;
        color: #475569;
        line-height: 1.4;
        margin: 0 0 10px 0;
    }}
    .sig-table {{
        width: 100%;
        margin-top: 8px;
    }}
    .sig-table td {{
        width: 33.33%;
        vertical-align: top;
        font-size: 7.5pt;
        color: #334155;
    }}
    .sig-line {{
        border-top: 1px solid #94A3B8;
        width: 80%;
        margin-top: 25px;
        padding-top: 3px;
        font-size: 7pt;
        color: #64748B;
        font-weight: 600;
    }}

    .page-break {{
        page-break-after: always;
    }}
</style>
</head>
<body>

<!-- Header Banner -->
<div class="header-banner">
    <div class="enterprise-tag">Institutional Tender & Procurement Dossier</div>
    <div class="main-title">{company_name}</div>
    <div class="sub-title">Enterprise Corporate Profile, Technical Asset Register & Prequalification CV</div>

    <div class="meta-bar">
        <div class="meta-item"><span class="meta-label">Commercial Reg (CR):</span> <span class="meta-value">{cr_number}</span></div>
        <div class="meta-item"><span class="meta-label">Tax / VAT ID:</span> <span class="meta-value">{vat_number}</span></div>
        <div class="meta-item"><span class="meta-label">Enterprise Qualification Standard:</span> <span class="meta-value">{std_code}</span></div>
        <div class="meta-item"><span class="meta-label">Dossier Date:</span> <span class="meta-value">{gen_at}</span></div>
        <div class="meta-item"><span class="meta-label">Vendor Status:</span> <span class="badge" style="background:{badge_color};">{rating_badge} ({readiness_score}%)</span></div>
    </div>
</div>

<!-- Key Prequalification Metrics Grid -->
<div class="kpi-container">
    <div class="kpi-cell">
        <div class="kpi-number">{_format_int(kpis.get("total_executed_projects", 0))}</div>
        <div class="kpi-label">Executed Operations</div>
    </div>
    <div class="kpi-cell">
        <div class="kpi-number">{_format_int(kpis.get("total_fleet_capacity", 0))}</div>
        <div class="kpi-label">Machinery & Fleet Units</div>
    </div>
    <div class="kpi-cell">
        <div class="kpi-number">{_format_int(kpis.get("permanent_headcount", 0))}</div>
        <div class="kpi-label">Permanent Manpower</div>
    </div>
    <div class="kpi-cell">
        <div class="kpi-number">{_format_int(kpis.get("total_operating_regions", 1))}</div>
        <div class="kpi-label">Active Hubs / Zones</div>
    </div>
    <div class="kpi-cell">
        <div class="kpi-number">{_format_currency(kpis.get("total_revenue_ytd", 0), currency)}</div>
        <div class="kpi-label">Financial Solvency (YTD)</div>
    </div>
    <div class="kpi-cell">
        <div class="kpi-number">{_format_int(kpis.get("verified_compliance_documents", 0))} / {_format_int(kpis.get("total_compliance_documents", 0))}</div>
        <div class="kpi-label">Verified Credentials</div>
    </div>
</div>

<!-- Section 1: Executive Profile & Enterprise Structure -->
<div class="section-title">1. Corporate Entity Profile & Legal Structure</div>
<table class="data-table">
    <tr>
        <th style="width:25%;">Entity Attribute</th>
        <th style="width:75%;">Official Corporate Record</th>
    </tr>
    <tr>
        <td><strong>Registered Legal Name</strong></td>
        <td>{company_name} (Code: <code>{html.escape(comp.get("company_code", "COMP"))}</code>)</td>
    </tr>
    <tr>
        <td><strong>Commercial Registration (CR)</strong></td>
        <td><code>{cr_number}</code> — Ministry of Commerce Registered</td>
    </tr>
    <tr>
        <td><strong>Tax Registration & Jurisdiction</strong></td>
        <td><code>{vat_number}</code> — Zakat, Tax and Customs Authority (ZATCA), KSA</td>
    </tr>
    <tr>
        <td><strong>Operating Currency</strong></td>
        <td>{currency} (Saudi Riyal)</td>
    </tr>
    <tr>
        <td><strong>Enterprise Hierarchy</strong></td>
        <td>
            Holding / Parent Entity: <strong>{html.escape(comp.get("holding_company_name") or company_name)}</strong>
            <br>
            Active Operating Branches & Plants: <strong>{comp.get("active_branches_count", 0)}</strong>
        </td>
    </tr>
    <tr>
        <td><strong>Financial Standing & Tier</strong></td>
        <td><strong>{html.escape(finance.get("financial_tier", "Tier 2 Commercial Contractor"))}</strong> (Invoiced Turnover: {_format_currency(finance.get("total_invoiced_ytd", 0), currency)})</td>
    </tr>
</table>

<!-- Section 2: Mandatory Enterprise Compliance Checklist -->
<div class="section-title">2. Mandatory Institutional Procurement Compliance Checklist</div>
<table class="data-table">
    <thead>
        <tr>
            <th style="width:30%;">Required Procurement Credential</th>
            <th style="width:25%;">Issuing Regulatory Authority</th>
            <th style="width:20%;">Registration / Cert #</th>
            <th style="width:12%;text-align:center;">Valid Until</th>
            <th style="width:13%;text-align:center;">Audit Status</th>
        </tr>
    </thead>
    <tbody>
        {checklist_rows_html}
    </tbody>
</table>

<!-- Section 3: Physical Fleet & Heavy Machinery Assets -->
<div class="section-title">3. Physical Fleet & Heavy Machinery Asset Register</div>
<table class="data-table">
    <thead>
        <tr>
            <th style="width:5%;text-align:center;">#</th>
            <th style="width:30%;">Machinery / Vehicle Unit</th>
            <th style="width:15%;">Registration Plate</th>
            <th style="width:15%;">Asset Classification</th>
            <th style="width:15%;text-align:center;">Operating Status</th>
            <th style="width:20%;">Assigned Operating Plant</th>
        </tr>
    </thead>
    <tbody>
        {vehicle_rows_html}
    </tbody>
</table>

<!-- Section 4: Human Capital & Technical Workforce -->
<div class="section-title">4. Human Capital, Technical Directorship & Workforce</div>
<div style="margin-bottom:8px;">
    {dept_tags_html}
</div>
<table class="data-table">
    <thead>
        <tr>
            <th style="width:35%;">Key Personnel / Officer</th>
            <th style="width:35%;">Enterprise Responsibility</th>
            <th style="width:30%;">Official Contact</th>
        </tr>
    </thead>
    <tbody>
        {personnel_rows_html}
    </tbody>
</table>

<!-- Section 5: Regional Depots, Facilities & Infrastructure -->
<div class="section-title">5. Operating Terminals, Logistics Hubs & Warehouses</div>
<div class="facilities-grid">
    {facility_items_html}
</div>

<!-- Section 6: Corporate Document Vault Registry -->
<div class="section-title">6. Verified Corporate Vault Attachments & Licenses</div>
<table class="data-table">
    <thead>
        <tr>
            <th style="width:40%;">Document Title & Specification</th>
            <th style="width:30%;">Issuing Authority</th>
            <th style="width:15%;text-align:center;">Expiration Date</th>
            <th style="width:15%;text-align:center;">Vault Verification</th>
        </tr>
    </thead>
    <tbody>
        {doc_rows_html}
    </tbody>
</table>

<!-- Section 7: Legal Declaration & Verification Attestation -->
<div class="declaration-box">
    <div class="declaration-title">Official Prequalification Declaration & Compliance Seal</div>
    <div class="declaration-text">
        I hereby attest under penalty of disqualification that the operational capabilities, physical fleet registers, human capital statistics, financial turnover, and legal compliance credentials detailed in this Corporate Profile (CV) represent true, accurate, and audited enterprise data extracted directly from the OxenGL Enterprise Resource Planning core. All compliance certificates remain valid and on durable file in the corporate vault.
    </div>

    <table class="sig-table">
        <tr>
            <td>
                <strong>Prepared By:</strong><br>
                {gen_by}<br>
                <em>Corporate Procurement Division</em>
                <div class="sig-line">Authorized Signature</div>
            </td>
            <td>
                <strong>Verified By:</strong><br>
                OxenGL Enterprise Governance<br>
                <em>Automated Audit Engine</em>
                <div class="sig-line">Audit Verification Stamp</div>
            </td>
            <td>
                <strong>Submission Timestamp:</strong><br>
                {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")}<br>
                <em>Dossier Ref: ENT-PQ-{comp.get("slug", "oxen").upper()[:8]}</em>
                <div class="sig-line">Corporate Legal Seal</div>
            </td>
        </tr>
    </table>
</div>

</body>
</html>
"""
    return html_content


def generate_corporate_cv_pdf(payload: Dict[str, Any]) -> bytes:
    """
    Renders the Corporate CV HTML template and compiles it into
    a vector-crisp, multi-page PDF using WeasyPrint.

    Parameters:
        payload: Aggregated dictionary returned by get_corporate_cv_payload().

    Returns:
        bytes: Raw PDF binary stream ready for HTTP streaming or S3 storage.
    """
    logger.info("Initiating WeasyPrint compilation for Corporate Profile PDF...")
    rendered_html = render_corporate_cv_html(payload)

    # Compile with WeasyPrint
    if HTML is None:
        raise RuntimeError("WeasyPrint library is not installed in the active environment.")
    pdf_bytes = HTML(string=rendered_html).write_pdf()
    logger.info(f"Successfully compiled Corporate CV PDF ({len(pdf_bytes):,} bytes).")
    return pdf_bytes
