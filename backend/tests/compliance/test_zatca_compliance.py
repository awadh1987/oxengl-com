"""Compliance test suite for ZATCA Phase 2 e-Invoicing integration.

Verifies:
1. UBL 2.1 XML structure and hashing (canonical representation, ICV, PIH).
2. Genuine ECDSA secp256k1 digital signatures and public key verification.
3. Base64 TLV QR code encoding with authentic binary signature bytes in Tag 7.
4. Exact halala rounding without floating-point error.
"""

from __future__ import annotations

import base64
import hashlib
import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, utils

from backend import models
from backend.zatca_adapter import (
    ZATCAAdapter,
    decode_tlv,
    encode_tlv,
    generate_zatca_qr_code,
    get_or_create_fallback_credentials,
    get_public_key_bytes,
    load_private_key,
    sign_hash_ecdsa,
)


from backend.database import PlatformSessionLocal as SessionLocal


@pytest.fixture
def compliance_db():
    """Provides test database session with company, tax profile, and customer invoice."""
    test_db = SessionLocal()
    try:
        # Ensure ResCompany exists
        cid = uuid.uuid4()
        company = models.ResCompany(
            id=cid,
            name=f"Oxen Logistics Co {cid.hex[:6]}",
            slug=f"oxen-{cid.hex[:6]}",
            domain_slug=f"oxen-{cid.hex[:6]}",
            currency="SAR",
        )
        test_db.add(company)
        test_db.flush()

        # Create active TaxProfile
        priv_pem, cert_pem = get_or_create_fallback_credentials()
        tax_profile = test_db.query(models.TaxProfile).filter_by(company_id=company.id).first()
        if not tax_profile:
            tax_profile = models.TaxProfile(
                company_id=company.id,
                tax_id="300099999900003",
                legal_name="Oxen Logistics Transport Company",
                trade_name="OxenGL",
                branch_name="Riyadh Main",
                branch_number="1",
                street_name="King Fahd Road",
                building_number="1234",
                postal_zone="12345",
                city="Riyadh",
                district="Olaya",
                country_code="SA",
                zatca_stage="simulation",
                zatca_environment="simulation",
                csid=cert_pem,
                secret_key=priv_pem,
                is_active=True,
            )
            test_db.add(tax_profile)
            test_db.flush()

        # Create Customer Partner
        partner = test_db.query(models.ResPartner).filter_by(company_id=company.id, partner_type="customer").first()
        if not partner:
            partner = models.ResPartner(
                company_id=company.id,
                name="Arabian Mineral Aggregate Co",
                partner_type="customer",
                tax_number=f"3100{cid.hex[:8]}003",
            )
            test_db.add(partner)
            test_db.flush()

        # Create standard customer invoice with halala precision
        subtotal = Decimal("1000.33")
        vat_amount = (subtotal * Decimal("0.15")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        grand_total = subtotal + vat_amount

        invoice = models.CustomerInvoice(
            company_id=company.id,
            partner_id=partner.id,
            invoice_number=f"INV/2026/COMPL-{uuid.uuid4().hex[:6].upper()}",
            customer_name=partner.name,
            customer_tax_number=partner.tax_number,
            issue_date=datetime.now(timezone.utc),
            due_date=datetime.now(timezone.utc),
            subtotal=subtotal,
            vat_amount=vat_amount,
            grand_total=grand_total,
            status="Approved",
        )
        test_db.add(invoice)
        test_db.commit()
        test_db.refresh(invoice)

        yield {
            "db": test_db,
            "company": company,
            "tax_profile": tax_profile,
            "partner": partner,
            "invoice": invoice,
        }
    finally:
        test_db.close()


def test_ecdsa_secp256k1_key_generation_and_signing():
    """Verify ECDSA key generation, prehashed SHA-256 signing, and public key verification."""
    priv_pem, cert_pem = get_or_create_fallback_credentials()
    assert priv_pem.startswith("-----BEGIN PRIVATE KEY-----")
    assert cert_pem.startswith("-----BEGIN CERTIFICATE-----")

    private_key = load_private_key(priv_pem)
    assert isinstance(private_key.curve, ec.SECP256K1)

    # Test prehashed digest signing
    test_data = b"OxenGL ZATCA Canonical Invoice Representation 2026"
    digest = hashlib.sha256(test_data).digest()

    # Raw 64-byte signature (r || s)
    sig_raw = sign_hash_ecdsa(private_key, digest)
    assert len(sig_raw) == 64, f"Expected 64 bytes IEEE P1363 signature, got {len(sig_raw)}"

    # Verify signature using public key
    r = int.from_bytes(sig_raw[:32], byteorder="big")
    s = int.from_bytes(sig_raw[32:], byteorder="big")
    der_sig = utils.encode_dss_signature(r, s)

    public_key = private_key.public_key()
    public_key.verify(der_sig, digest, ec.ECDSA(utils.Prehashed(hashes.SHA256())))

    # Verify uncompressed public key bytes
    pk_bytes = get_public_key_bytes(private_key)
    assert len(pk_bytes) == 65
    assert pk_bytes[0] == 0x04


def test_ubl_2_1_xml_generation_and_canonical_hashing(compliance_db):
    """Verify canonical invoice body, SHA-256 hash generation, and UBL 2.1 XML structure."""
    db = compliance_db["db"]
    company = compliance_db["company"]
    invoice = compliance_db["invoice"]

    # Process standard B2B invoice
    log_entry = ZATCAAdapter.process_invoice(
        database=db,
        company_id=company.id,
        invoice_id=invoice.id,
        invoice_type="b2b",
    )

    assert log_entry.submission_status == "CLEARED"
    assert log_entry.clearance_status == "CLEARED"
    assert log_entry.invoice_hash is not None
    assert len(log_entry.invoice_hash) == 64  # SHA-256 hex string

    xml = log_entry.xml_payload
    assert xml is not None
    assert '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"' in xml
    assert "<cbc:ProfileID>reporting:1.0</cbc:ProfileID>" in xml
    assert f"<cbc:ID>{invoice.invoice_number}</cbc:ID>" in xml
    assert f"<cbc:UUID>{log_entry.invoice_uuid}</cbc:UUID>" in xml
    assert '<cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>' in xml
    assert "<cbc:ID>ICV</cbc:ID>" in xml
    assert "<cbc:ID>PIH</cbc:ID>" in xml
    assert "<ext:UBLExtensions>" in xml
    assert "<ds:SignatureValue>" in xml
    assert log_entry.cryptographic_stamp in xml


def test_zatca_qr_code_tlv_tags_and_raw_signature_bytes(compliance_db):
    """Verify QR code TLV encoding: Tags 1-9, especially Tag 7 contains raw 64-byte signature."""
    db = compliance_db["db"]
    company = compliance_db["company"]
    invoice = compliance_db["invoice"]

    log_entry = ZATCAAdapter.process_invoice(
        database=db,
        company_id=company.id,
        invoice_id=invoice.id,
        invoice_type="b2b",
    )

    qr_b64 = log_entry.qr_code_payload
    assert qr_b64 is not None

    tlv_bytes = base64.b64decode(qr_b64)
    tags = decode_tlv(tlv_bytes)

    # Tag 1: Seller's Name
    assert 1 in tags
    assert tags[1].decode("utf-8") == "Oxen Logistics Transport Company"

    # Tag 2: Seller's VAT Registration Number
    assert 2 in tags
    assert tags[2].decode("utf-8") == "300099999900003"

    # Tag 3: Invoice Timestamp
    assert 3 in tags

    # Tag 4: Invoice Total
    assert 4 in tags
    assert tags[4].decode("utf-8") == f"{invoice.grand_total:.2f}"

    # Tag 5: VAT Total
    assert 5 in tags
    assert tags[5].decode("utf-8") == f"{invoice.vat_amount:.2f}"

    # Tag 6: Invoice Hash (32 bytes SHA-256 digest)
    assert 6 in tags
    assert len(tags[6]) == 32

    # Tag 7: ECDSA Digital Signature (Raw 64 bytes IEEE P1363, NOT truncated hex string)
    assert 7 in tags
    assert len(tags[7]) == 64, f"Tag 7 must be 64 bytes raw signature, got {len(tags[7])}"

    # Tag 8: ECDSA Public Key (65 bytes SEC1 uncompressed)
    assert 8 in tags
    assert len(tags[8]) == 65

    # Tag 9: Certificate Signature (authentic DER signature)
    assert 9 in tags
    assert len(tags[9]) > 0


def test_previous_invoice_hash_chaining(compliance_db):
    """Verify blockchain-like cryptographic chaining with Previous Invoice Hash (PIH)."""
    db = compliance_db["db"]
    company = compliance_db["company"]
    partner = compliance_db["partner"]

    # First invoice must use GENESIS_HASH
    log1 = ZATCAAdapter.process_invoice(
        database=db,
        company_id=company.id,
        invoice_id=compliance_db["invoice"].id,
        invoice_type="b2b",
    )
    assert log1.previous_invoice_hash is not None

    # Create second invoice
    invoice2 = models.CustomerInvoice(
        company_id=company.id,
        partner_id=partner.id,
        invoice_number=f"INV/2026/COMPL-{uuid.uuid4().hex[:6].upper()}",
        customer_name=partner.name,
        customer_tax_number=partner.tax_number,
        issue_date=datetime.now(timezone.utc),
        subtotal=Decimal("500.00"),
        vat_amount=Decimal("75.00"),
        grand_total=Decimal("575.00"),
        status="Approved",
    )
    db.add(invoice2)
    db.commit()
    db.refresh(invoice2)

    log2 = ZATCAAdapter.process_invoice(
        database=db,
        company_id=company.id,
        invoice_id=invoice2.id,
        invoice_type="b2c",
    )

    # Second invoice's PIH must match first invoice's invoice_hash
    assert log2.previous_invoice_hash == log1.invoice_hash
    assert log2.submission_status == "REPORTED"
    assert log2.reporting_status == "REPORTED"


def test_halala_rounding_precision_no_floating_point_drift():
    """Verify that halala rounding strictly enforces Decimal ROUND_HALF_UP precision."""
    # Test problematic float numbers: 1000.33 * 0.15 = 150.0495 -> rounds up to 150.05
    subtotal = Decimal("1000.33")
    vat_rate = Decimal("0.15")
    raw_vat = subtotal * vat_rate
    rounded_vat = raw_vat.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    assert rounded_vat == Decimal("150.05")

    # In standard float: 1000.33 * 0.15 = 150.04950000000002
    grand_total = (subtotal + rounded_vat).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    assert grand_total == Decimal("1150.38")
    assert subtotal + rounded_vat == grand_total


def test_zatca_math_calculation_api(compliance_db):
    """Test the /api/compliance/zatca/calculate-invoice backend endpoint."""
    from starlette.testclient import TestClient
    from backend.app.main import app, create_session_token

    client = TestClient(app)
    company = compliance_db["company"]
    db = compliance_db["db"]

    user = models.ResUser(
        id=uuid.uuid4(),
        company_id=company.id,
        email=f"calc_tester_{uuid.uuid4().hex[:6]}@example.com",
        role="Admin",
        is_active=True,
    )
    db.add(user)
    db.commit()

    token = create_session_token(
        subject=user.email,
        company_id=company.id,
        role="Admin",
        tenant_slug=company.slug,
    )
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Company-ID": str(company.id),
    }

    # 1. Test quantity and unit price
    res = client.post(
        "/api/compliance/zatca/calculate-invoice",
        json={"quantity": "100.5", "unit_price": "25.25", "vat_rate": "0.15"},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert Decimal(str(data["subtotal"])) == Decimal("2537.63")
    assert Decimal(str(data["vat_amount"])) == Decimal("380.64")
    assert Decimal(str(data["grand_total"])) == Decimal("2918.27")


def test_zatca_string_date_handling():
    """Verify that generate_zatca_qr_code gracefully handles ISO string dates without throwing AttributeError."""
    priv_pem, cert_pem = get_or_create_fallback_credentials()
    priv_key = load_private_key(priv_pem)
    pk_bytes = get_public_key_bytes(priv_key)
    dummy_hash = hashlib.sha256(b"dummy").digest()
    dummy_sig = sign_hash_ecdsa(priv_key, dummy_hash)

    # Pass ISO string timestamp instead of datetime object
    qr_b64 = generate_zatca_qr_code(
        seller_name="Oxen Logistics",
        vat_number="300099999900003",
        timestamp="2026-09-22T00:00:00Z",
        total_amount=Decimal("1150.00"),
        vat_amount=Decimal("150.00"),
        invoice_hash=dummy_hash,
        digital_signature=dummy_sig,
        public_key=pk_bytes,
    )
    assert qr_b64 is not None
    assert len(qr_b64) > 50
    decoded_tags = decode_tlv(base64.b64decode(qr_b64))
    assert 1 in decoded_tags
    assert decoded_tags[1].decode("utf-8") == "Oxen Logistics"
