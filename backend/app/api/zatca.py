import httpx
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional

from app.services.zatca_crypto import generate_secp256k1_keypair, generate_zatca_csr

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
