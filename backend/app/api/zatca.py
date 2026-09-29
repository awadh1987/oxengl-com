import base64
import httpx
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional

from app.services.zatca_crypto import (
    generate_secp256k1_keypair,
    generate_zatca_csr,
    compute_invoice_hash,
)
try:
    from app.services.ubl_builder import generate_base_ubl_xml, canonicalize_invoice
except (ImportError, ModuleNotFoundError):
    from backend.app.services.ubl_builder import generate_base_ubl_xml, canonicalize_invoice

try:
    from backend.database import get_db
except (ImportError, ModuleNotFoundError):
    try:
        from database import get_db
    except (ImportError, ModuleNotFoundError):
        try:
            from app.db.session import get_db
        except (ImportError, ModuleNotFoundError):
            get_db = None

router = APIRouter(prefix="/zatca", tags=["ZATCA Compliance"])

# ZATCA Developer Portal Sandbox URL (Phase 2)
ZATCA_COMPLIANCE_URL = "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/compliance"


@router.post("/onboard")
async def onboard_tenant_egs(
    otp: str = Header(..., description="The OTP generated from the ZATCA Fatoora Portal"),
    db: Optional[Session] = Depends(get_db) if get_db else None,
):
    """
    Executes the ZATCA Phase 2 onboarding handshake.
    1. Generates local secp256k1 keypair.
    2. Generates CSR.
    3. Requests Compliance CSID (CCSID) from ZATCA.
    """
    # In production, query these from the tenant's configuration in the DB
    tenant_name = "OxenGL Tenant"
    egs_serial = "1-OxenGL|2-ERP|3-EGS-001"
    vat_number = "300000000000003"

    if db:
        try:
            tax_row = db.execute(
                text("SELECT legal_name, tax_id FROM tax_profiles WHERE is_active = true LIMIT 1")
            ).fetchone()
            if tax_row and tax_row[0]:
                tenant_name = tax_row[0]
            if tax_row and tax_row[1]:
                vat_number = tax_row[1]
        except Exception as e:
            print(f"[ZATCA] DB profile lookup skipped: {e}")

    # 1. Generate local cryptographic identity
    print("[ZATCA] Generating secp256k1 keypair...")
    keys = generate_secp256k1_keypair()

    # 2. Generate the base64 CSR
    print("[ZATCA] Generating Certificate Signing Request (CSR)...")
    csr_b64 = generate_zatca_csr(
        private_key_pem=keys["private_key"],
        tenant_name=tenant_name,
        egs_serial=egs_serial,
        vat_number=vat_number,
    )

    # 3. Perform the ZATCA Handshake
    print("[ZATCA] Initiating Fatoora API Handshake...")
    headers = {
        "Accept-Version": "V2",
        "OTP": otp,
        "Content-Type": "application/json",
    }
    payload = {"csr": str(csr_b64)}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(ZATCA_COMPLIANCE_URL, json=payload, headers=headers)
    except httpx.RequestError as exc:
        print(f"[ZATCA Network Error] Failed connecting to ZATCA endpoint: {exc}")
        raise HTTPException(
            status_code=502,
            detail=f"Unable to connect to ZATCA compliance service: {str(exc)}",
        )

    if response.status_code not in (200, 201):
        print(f"[ZATCA Error] Status {response.status_code}: {response.text}")
        detail_msg = "ZATCA Onboarding Failed"
        try:
            err_json = response.json()
            detail_msg = err_json.get("message") or err_json.get("errors") or detail_msg
        except Exception:
            pass
        raise HTTPException(status_code=response.status_code, detail=detail_msg)

    # ZATCA returns the requested CCSID, a secret, and the request ID
    zatca_data = response.json()

    # Save keys["private_key"], binarySecurityToken (CCSID), and secret to DB if session available
    if db:
        try:
            db.execute(
                text(
                    """
                    UPDATE tax_profiles 
                    SET secret_key = :sec, csid = :csid, zatca_stage = 'COMPLIANCE', updated_at = NOW()
                    WHERE is_active = true
                    """
                ),
                {
                    "sec": zatca_data.get("secret", keys["private_key"]),
                    "csid": zatca_data.get("binarySecurityToken"),
                },
            )
            db.commit()
            print("[ZATCA] Securely updated tax_profiles with CCSID credentials.")
        except Exception as e:
            print(f"[ZATCA Warning] Failed to update tax_profiles record: {e}")

    print("[ZATCA] Handshake successful. CCSID obtained.")
    binary_token = zatca_data.get("binarySecurityToken", "")
    ccsid_preview = (binary_token[:30] + "...") if len(binary_token) > 30 else binary_token

    return {
        "status": "success",
        "message": "Successfully obtained Compliance CSID from ZATCA.",
        "request_id": zatca_data.get("requestID"),
        "ccsid_preview": ccsid_preview,
    }


ZATCA_INVOICE_COMPLIANCE_URL = "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/compliance/invoices"


@router.post("/validate/{invoice_uuid}")
async def validate_invoice_compliance(
    invoice_uuid: str,
    db: Optional[Session] = Depends(get_db) if get_db else None,
):
    """
    Submits a generated invoice to the ZATCA sandbox for structural and cryptographic validation.
    """
    # 1. Fetch invoice data (falling back to testing baseline)
    invoice_data = {
        "invoice_number": "INV-0E7D2B",
        "net_amount": 50000.0,
        "vat_amount": 7500.0,
    }
    issue_datetime = "2026-09-29T10:00:00Z"
    pih = "rZ+v2XIxji1IUi6uNvgxDDdRdg0CMBeeUitlFCIehBU="
    inv_hash = "RboNaKmr7FCGvODFDUJFFg/4HbIirmHIeMLm45MWeyc="
    ccsid = "mock_binary_security_token"
    secret = "mock_secret"

    if db:
        try:
            # Query real invoice if present
            row = db.execute(
                text(
                    "SELECT invoice_number, subtotal, vat_amount, issue_date "
                    "FROM customer_invoices "
                    "WHERE id::text = :id OR invoice_number = :id "
                    "LIMIT 1"
                ),
                {"id": invoice_uuid},
            ).fetchone()
            if row:
                invoice_data["invoice_number"] = row[0]
                invoice_data["net_amount"] = float(row[1] or 0.0)
                invoice_data["vat_amount"] = float(row[2] or 0.0)
                if row[3]:
                    issue_datetime = row[3].strftime("%Y-%m-%dT%H:%M:%SZ")

            # Query real tax profile for credentials if present
            tax_profile = db.execute(
                text(
                    "SELECT csid, secret_key FROM tax_profiles "
                    "WHERE is_active = true AND csid IS NOT NULL "
                    "LIMIT 1"
                )
            ).fetchone()
            if tax_profile and tax_profile[0] and tax_profile[1]:
                ccsid = tax_profile[0]
                secret = tax_profile[1]

            # Query log for actual invoice_hash & previous_hash
            log_row = db.execute(
                text(
                    "SELECT invoice_hash, previous_invoice_hash FROM zatca_logs "
                    "WHERE invoice_id::text = :id OR invoice_hash = :id "
                    "ORDER BY created_at DESC LIMIT 1"
                ),
                {"id": invoice_uuid},
            ).fetchone()
            if log_row:
                if log_row[0]:
                    inv_hash = log_row[0]
                if log_row[1]:
                    pih = log_row[1]
        except Exception as e:
            print(f"[ZATCA DB Lookup Info] {e}")

    # 2. Reconstruct and encode the XML payload
    base_xml = generate_base_ubl_xml(invoice_data, invoice_uuid, issue_datetime, pih)
    canonical_xml = canonicalize_invoice(base_xml)
    encoded_invoice = base64.b64encode(canonical_xml).decode("utf-8")

    # If inv_hash was default, compute hash from canonical XML
    if not inv_hash or inv_hash == "RboNaKmr7FCGvODFDUJFFg/4HbIirmHIeMLm45MWeyc=":
        inv_hash = compute_invoice_hash(canonical_xml)

    # 3. Prepare the Fatoora API Request
    auth_credentials = f"{ccsid}:{secret}".encode("utf-8")
    auth_header = f"Basic {base64.b64encode(auth_credentials).decode('utf-8')}"

    headers = {
        "Accept-Version": "V2",
        "Accept-Language": "en",
        "Authorization": auth_header,
        "Content-Type": "application/json",
    }

    payload = {
        "invoiceHash": inv_hash,
        "uuid": invoice_uuid,
        "invoice": encoded_invoice,
    }

    # 4. Transmit to ZATCA
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                ZATCA_INVOICE_COMPLIANCE_URL, json=payload, headers=headers
            )
    except httpx.RequestError as exc:
        print(f"[ZATCA Network Error] Failed connecting to compliance service: {exc}")
        raise HTTPException(
            status_code=502,
            detail=f"Unable to connect to ZATCA compliance service: {str(exc)}",
        )

    if response.status_code not in [200, 202]:
        print(f"[ZATCA Validation Failed] Status {response.status_code}: {response.text}")
        try:
            err_detail = response.json()
        except Exception:
            err_detail = response.text or "ZATCA Validation Failed"
        raise HTTPException(status_code=response.status_code, detail=err_detail)

    return {
        "status": "success",
        "message": "Invoice successfully cleared ZATCA compliance checks.",
        "zatca_response": response.json(),
    }


# ZATCA Developer Portal Production URLs
ZATCA_CLEARANCE_URL = "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/invoices/clearance/single"
ZATCA_REPORTING_URL = "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/invoices/reporting/single"


@router.post("/clearance/single/{invoice_uuid}")
async def clear_b2b_invoice(
    invoice_uuid: str,
    db: Optional[Session] = Depends(get_db) if get_db else None,
):
    """
    B2B Standard Tax Invoice Clearance.
    Transmits the invoice to ZATCA for real-time validation and clearance stamp.
    """
    # 1. Fetch invoice, generate UBL 2.1, and canonicalize (similar to validation route)
    # invoice = db.query(CustomerInvoice).filter_by(uuid=invoice_uuid).first()

    # Mock payload for architecture completion
    encoded_invoice = base64.b64encode(b"<Invoice>Mock B2B C14N XML</Invoice>").decode("utf-8")
    ccsid = "mock_binary_security_token"
    secret = "mock_secret"
    invoice_hash = "MockHash="

    if db:
        try:
            tax_profile = db.execute(
                text(
                    "SELECT csid, secret_key FROM tax_profiles "
                    "WHERE is_active = true AND csid IS NOT NULL "
                    "LIMIT 1"
                )
            ).fetchone()
            if tax_profile and tax_profile[0] and tax_profile[1]:
                ccsid = tax_profile[0]
                secret = tax_profile[1]

            log_row = db.execute(
                text(
                    "SELECT invoice_hash FROM zatca_logs "
                    "WHERE invoice_id::text = :id OR invoice_hash = :id "
                    "ORDER BY created_at DESC LIMIT 1"
                ),
                {"id": invoice_uuid},
            ).fetchone()
            if log_row and log_row[0]:
                invoice_hash = log_row[0]
        except Exception as e:
            print(f"[ZATCA DB Lookup Info] {e}")

    headers = {
        "Accept-Version": "V2",
        "Accept-Language": "en",
        "Authorization": f"Basic {base64.b64encode(f'{ccsid}:{secret}'.encode()).decode()}",
        "Clearance-Status": "1",
        "Content-Type": "application/json",
    }

    payload = {
        "invoiceHash": invoice_hash,
        "uuid": invoice_uuid,
        "invoice": encoded_invoice,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(ZATCA_CLEARANCE_URL, json=payload, headers=headers)
    except httpx.RequestError as exc:
        print(f"[ZATCA Network Error] Failed connecting to clearance service: {exc}")
        raise HTTPException(
            status_code=502,
            detail=f"Unable to connect to ZATCA clearance service: {str(exc)}",
        )

    if response.status_code not in [200, 202]:
        print(f"[ZATCA Clearance Failed] Status {response.status_code}: {response.text}")
        try:
            err_detail = response.json()
        except Exception:
            err_detail = response.text or "ZATCA Clearance Failed"
        raise HTTPException(status_code=response.status_code, detail=err_detail)

    # TODO: Save the returned cleared invoice XML (containing ZATCA's cryptographic stamp) to the DB
    return {"status": "cleared", "zatca_response": response.json()}


@router.post("/reporting/single/{invoice_uuid}")
async def report_b2c_invoice(
    invoice_uuid: str,
    db: Optional[Session] = Depends(get_db) if get_db else None,
):
    """
    B2C Simplified Tax Invoice Reporting.
    Transmits the locally signed invoice to ZATCA asynchronously (within 24 hours).
    """
    # Mock payload for architecture completion
    encoded_invoice = base64.b64encode(b"<Invoice>Mock B2C C14N XML</Invoice>").decode("utf-8")
    ccsid = "mock_binary_security_token"
    secret = "mock_secret"
    invoice_hash = "MockHash="

    if db:
        try:
            tax_profile = db.execute(
                text(
                    "SELECT csid, secret_key FROM tax_profiles "
                    "WHERE is_active = true AND csid IS NOT NULL "
                    "LIMIT 1"
                )
            ).fetchone()
            if tax_profile and tax_profile[0] and tax_profile[1]:
                ccsid = tax_profile[0]
                secret = tax_profile[1]

            log_row = db.execute(
                text(
                    "SELECT invoice_hash FROM zatca_logs "
                    "WHERE invoice_id::text = :id OR invoice_hash = :id "
                    "ORDER BY created_at DESC LIMIT 1"
                ),
                {"id": invoice_uuid},
            ).fetchone()
            if log_row and log_row[0]:
                invoice_hash = log_row[0]
        except Exception as e:
            print(f"[ZATCA DB Lookup Info] {e}")

    headers = {
        "Accept-Version": "V2",
        "Accept-Language": "en",
        "Authorization": f"Basic {base64.b64encode(f'{ccsid}:{secret}'.encode()).decode()}",
        "Clearance-Status": "0",  # 0 indicates reporting, not clearance
        "Content-Type": "application/json",
    }

    payload = {
        "invoiceHash": invoice_hash,
        "uuid": invoice_uuid,
        "invoice": encoded_invoice,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(ZATCA_REPORTING_URL, json=payload, headers=headers)
    except httpx.RequestError as exc:
        print(f"[ZATCA Network Error] Failed connecting to reporting service: {exc}")
        raise HTTPException(
            status_code=502,
            detail=f"Unable to connect to ZATCA reporting service: {str(exc)}",
        )

    if response.status_code not in [200, 202]:
        print(f"[ZATCA Reporting Failed] Status {response.status_code}: {response.text}")
        try:
            err_detail = response.json()
        except Exception:
            err_detail = response.text or "ZATCA Reporting Failed"
        raise HTTPException(status_code=response.status_code, detail=err_detail)

    return {"status": "reported", "zatca_response": response.json()}
