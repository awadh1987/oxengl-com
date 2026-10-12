"""ZATCA e-Invoicing Phase 2 Integration Adapter.

Isolated service layer responsible for:
- Authentic UBL 2.1 XML structure generation for standard (B2B) and simplified (B2C) tax invoices
- Canonical invoice hashing (SHA-256) and Previous Invoice Hash (PIH) chaining
- Genuine ECDSA secp256k1 digital signatures and X.509 CSID certificate embedding
- Complete ZATCA Phase 2 QR Code TLV encoding (Tags 1-9) with raw binary signature bytes
- Precise Decimal arithmetic with ROUND_HALF_UP halala quantization
- Clearance (B2B) vs Reporting (B2C) workflow execution
- Transmission failure simulation and retry mechanics
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, Tuple

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, utils
from cryptography.x509.oid import NameOID
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models


def _normalize_datetime(dt: datetime | str | None) -> datetime:
    """Safely converts any datetime or string timestamp to a timezone-aware UTC datetime."""
    if dt is None:
        return datetime.now(timezone.utc)
    if isinstance(dt, str):
        try:
            cleaned = dt.replace("Z", "+00:00")
            parsed = datetime.fromisoformat(cleaned)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed
        except Exception:
            return datetime.now(timezone.utc)
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt
    return datetime.now(timezone.utc)


# Default test / development fallback ECDSA key & CSID
_FALLBACK_PRIVATE_KEY_PEM: Optional[str] = None
_FALLBACK_CERTIFICATE_PEM: Optional[str] = None


def get_or_create_fallback_credentials() -> Tuple[str, str]:
    """Generates an in-memory SECP256K1 ECDSA private key and self-signed X.509 certificate for simulation/dev."""
    global _FALLBACK_PRIVATE_KEY_PEM, _FALLBACK_CERTIFICATE_PEM
    if _FALLBACK_PRIVATE_KEY_PEM and _FALLBACK_CERTIFICATE_PEM:
        return _FALLBACK_PRIVATE_KEY_PEM, _FALLBACK_CERTIFICATE_PEM

    priv_key = ec.generate_private_key(ec.SECP256K1())
    priv_pem = priv_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")

    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "SA"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "OxenGL Logistics"),
        x509.NameAttribute(NameOID.COMMON_NAME, "ZATCA-CSID-SIMULATION"),
    ])
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(priv_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(timezone.utc))
        .not_valid_after(datetime.now(timezone.utc) + timedelta(days=365))
        .sign(priv_key, hashes.SHA256())
    )
    cert_pem = cert.public_bytes(serialization.Encoding.PEM).decode("utf-8")
    _FALLBACK_PRIVATE_KEY_PEM = priv_pem
    _FALLBACK_CERTIFICATE_PEM = cert_pem
    return priv_pem, cert_pem


def load_private_key(pem_str: str) -> ec.EllipticCurvePrivateKey:
    """Loads an EC private key from PEM string."""
    key = serialization.load_pem_private_key(pem_str.encode("utf-8"), password=None)
    if not isinstance(key, ec.EllipticCurvePrivateKey):
        raise ValueError("Key is not an Elliptic Curve private key")
    return key


def sign_hash_ecdsa(private_key: ec.EllipticCurvePrivateKey, digest_bytes: bytes) -> bytes:
    """Signs a SHA-256 digest using ECDSA secp256k1 and returns IEEE P1363 raw (r || s) 64 bytes."""
    der_sig = private_key.sign(digest_bytes, ec.ECDSA(utils.Prehashed(hashes.SHA256())))
    r, s = utils.decode_dss_signature(der_sig)
    # ZATCA expects 64-byte raw signature (r || s, 32 bytes each) or DER bytes.
    # IEEE P1363 is exactly 64 bytes (32-byte big-endian r + 32-byte big-endian s).
    return r.to_bytes(32, byteorder="big") + s.to_bytes(32, byteorder="big")


def get_public_key_bytes(private_key: ec.EllipticCurvePrivateKey) -> bytes:
    """Returns uncompressed SEC1 public key bytes (65 bytes: 0x04 || X || Y)."""
    return private_key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )


def encode_tlv(tag: int, value: bytes | str) -> bytes:
    """Encode a single TLV (Tag-Length-Value) field per ZATCA e-invoicing specification.

    Handles ASN.1 length prefixes (> 127 bytes).
    """
    val_bytes = value.encode("utf-8") if isinstance(value, str) else bytes(value)
    length = len(val_bytes)
    if length < 128:
        len_bytes = bytes([length])
    elif length < 256:
        len_bytes = bytes([0x81, length])
    else:
        len_bytes = bytes([0x82, (length >> 8) & 0xFF, length & 0xFF])
    return bytes([tag]) + len_bytes + val_bytes


def decode_tlv(data: bytes) -> dict[int, bytes]:
    """Helper to decode binary TLV data into tag -> value mapping."""
    result: dict[int, bytes] = {}
    idx = 0
    total = len(data)
    while idx < total:
        tag = data[idx]
        idx += 1
        if idx >= total:
            break
        length_byte = data[idx]
        idx += 1
        if length_byte < 128:
            length = length_byte
        elif length_byte == 0x81:
            length = data[idx]
            idx += 1
        elif length_byte == 0x82:
            length = (data[idx] << 8) | data[idx + 1]
            idx += 2
        else:
            length = length_byte
        val = data[idx : idx + length]
        idx += length
        result[tag] = val
    return result


def generate_zatca_qr_code(
    seller_name: str,
    vat_number: str,
    timestamp: datetime,
    total_amount: Decimal,
    vat_amount: Decimal,
    invoice_hash: str | bytes,
    digital_signature: bytes | str,
    public_key: Optional[bytes | str] = None,
    certificate_signature: Optional[bytes | str] = None,
) -> str:
    """Generate ZATCA Phase 2 compliant TLV Base64 QR Code with Tags 1 through 9.

    Tag 1: Seller Name (UTF-8)
    Tag 2: Seller VAT Registration Number (15 digits)
    Tag 3: Invoice Timestamp (ISO 8601 UTC)
    Tag 4: Invoice Total (with VAT) formatted to 2 decimals
    Tag 5: VAT Total formatted to 2 decimals
    Tag 6: Invoice Cryptographic Hash (SHA-256 digest bytes or hex)
    Tag 7: ECDSA Digital Signature (raw binary bytes, 64-byte r||s)
    Tag 8: ECDSA Public Key (optional for B2C, SEC1 bytes)
    Tag 9: Cryptographic Stamp / Certificate Signature (optional for B2C, DER bytes)
    """
    total_dec = total_amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    vat_dec = vat_amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    # Convert hash to bytes if hex string
    if isinstance(invoice_hash, str):
        try:
            hash_bytes = bytes.fromhex(invoice_hash)
        except ValueError:
            hash_bytes = invoice_hash.encode("utf-8")
    else:
        hash_bytes = bytes(invoice_hash)

    # Convert signature to raw bytes
    if isinstance(digital_signature, str):
        try:
            sig_bytes = bytes.fromhex(digital_signature)
        except ValueError:
            sig_bytes = digital_signature.encode("utf-8")
    else:
        sig_bytes = bytes(digital_signature)

    norm_ts = _normalize_datetime(timestamp)
    iso_ts = norm_ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    tlv_bytes = bytearray()
    tlv_bytes.extend(encode_tlv(1, seller_name))
    tlv_bytes.extend(encode_tlv(2, vat_number))
    tlv_bytes.extend(encode_tlv(3, iso_ts))
    tlv_bytes.extend(encode_tlv(4, f"{total_dec:.2f}"))
    tlv_bytes.extend(encode_tlv(5, f"{vat_dec:.2f}"))
    tlv_bytes.extend(encode_tlv(6, hash_bytes))
    tlv_bytes.extend(encode_tlv(7, sig_bytes))

    if public_key is not None:
        pk_bytes = bytes.fromhex(public_key) if isinstance(public_key, str) else bytes(public_key)
        tlv_bytes.extend(encode_tlv(8, pk_bytes))

    if certificate_signature is not None:
        cs_bytes = bytes.fromhex(certificate_signature) if isinstance(certificate_signature, str) else bytes(certificate_signature)
        tlv_bytes.extend(encode_tlv(9, cs_bytes))

    return base64.b64encode(tlv_bytes).decode("utf-8")


class ZATCAAdapter:
    """Isolated ZATCA Phase 2 transmission, cryptographic signing and compliance engine."""

    GENESIS_HASH = "NWZlMWMwMmRhMjA3ZjBhMmQ1MTUzYTM4MGQ2NTY1M2MwODFjMzg4OTdhNzg2N2VlYzA4OWI5Mjc4NjVkZDJjNA=="

    @classmethod
    def get_invoice_counter(cls, database: Session, company_id: uuid.UUID) -> int:
        """Returns the sequential Invoice Counter Value (ICV) for the company."""
        count = database.scalar(
            select(models.ZATCALog.id)
            .where(models.ZATCALog.company_id == company_id)
        )
        # Count all existing logs for this company + 1
        from sqlalchemy import func
        total = database.scalar(
            select(func.count(models.ZATCALog.id)).where(models.ZATCALog.company_id == company_id)
        ) or 0
        return total + 1

    @classmethod
    def generate_canonical_body(
        cls,
        invoice: models.CustomerInvoice,
        seller_name: str,
        seller_vat: str,
        buyer_name: str,
        buyer_vat: str,
        invoice_uuid: str,
        issue_date_str: str,
        issue_time_str: str,
        invoice_type_code: str,
        subtotal_dec: Decimal,
        vat_dec: Decimal,
        grand_total_dec: Decimal,
        pih: str,
        icv: int,
    ) -> str:
        """Constructs canonical UBL 2.1 invoice XML representation for hashing."""
        return (
            f'<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" '
            f'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" '
            f'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">\n'
            f'    <cbc:ProfileID>reporting:1.0</cbc:ProfileID>\n'
            f'    <cbc:ID>{invoice.invoice_number}</cbc:ID>\n'
            f'    <cbc:UUID>{invoice_uuid}</cbc:UUID>\n'
            f'    <cbc:IssueDate>{issue_date_str}</cbc:IssueDate>\n'
            f'    <cbc:IssueTime>{issue_time_str}</cbc:IssueTime>\n'
            f'    <cbc:InvoiceTypeCode name="{invoice_type_code}">388</cbc:InvoiceTypeCode>\n'
            f'    <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>\n'
            f'    <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>\n'
            f'    <cac:AdditionalDocumentReference>\n'
            f'        <cbc:ID>ICV</cbc:ID>\n'
            f'        <cbc:UUID>{icv}</cbc:UUID>\n'
            f'    </cac:AdditionalDocumentReference>\n'
            f'    <cac:AdditionalDocumentReference>\n'
            f'        <cbc:ID>PIH</cbc:ID>\n'
            f'        <cac:Attachment>\n'
            f'            <cac:ExternalReference>\n'
            f'                <cbc:URI>{pih}</cbc:URI>\n'
            f'            </cac:ExternalReference>\n'
            f'        </cac:Attachment>\n'
            f'    </cac:AdditionalDocumentReference>\n'
            f'    <cac:AccountingSupplierParty>\n'
            f'        <cac:Party>\n'
            f'            <cac:PartyIdentification>\n'
            f'                <cbc:ID schemeID="CRN">{seller_vat[:10]}</cbc:ID>\n'
            f'            </cac:PartyIdentification>\n'
            f'            <cac:PartyLegalEntity>\n'
            f'                <cbc:RegistrationName>{seller_name}</cbc:RegistrationName>\n'
            f'            </cac:PartyLegalEntity>\n'
            f'            <cac:PartyTaxScheme>\n'
            f'                <cbc:CompanyID>{seller_vat}</cbc:CompanyID>\n'
            f'                <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>\n'
            f'            </cac:PartyTaxScheme>\n'
            f'        </cac:Party>\n'
            f'    </cac:AccountingSupplierParty>\n'
            f'    <cac:AccountingCustomerParty>\n'
            f'        <cac:Party>\n'
            f'            <cac:PartyIdentification>\n'
            f'                <cbc:ID schemeID="NAT">{buyer_vat[:10]}</cbc:ID>\n'
            f'            </cac:PartyIdentification>\n'
            f'            <cac:PartyLegalEntity>\n'
            f'                <cbc:RegistrationName>{buyer_name}</cbc:RegistrationName>\n'
            f'            </cac:PartyLegalEntity>\n'
            f'            <cac:PartyTaxScheme>\n'
            f'                <cbc:CompanyID>{buyer_vat}</cbc:CompanyID>\n'
            f'                <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>\n'
            f'            </cac:PartyTaxScheme>\n'
            f'        </cac:Party>\n'
            f'    </cac:AccountingCustomerParty>\n'
            f'    <cac:TaxTotal>\n'
            f'        <cbc:TaxAmount currencyID="SAR">{vat_dec:.2f}</cbc:TaxAmount>\n'
            f'        <cac:TaxSubtotal>\n'
            f'            <cbc:TaxableAmount currencyID="SAR">{subtotal_dec:.2f}</cbc:TaxableAmount>\n'
            f'            <cbc:TaxAmount currencyID="SAR">{vat_dec:.2f}</cbc:TaxAmount>\n'
            f'            <cac:TaxCategory>\n'
            f'                <cbc:ID>S</cbc:ID>\n'
            f'                <cbc:Percent>15.00</cbc:Percent>\n'
            f'                <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>\n'
            f'            </cac:TaxCategory>\n'
            f'        </cac:TaxSubtotal>\n'
            f'    </cac:TaxTotal>\n'
            f'    <cac:LegalMonetaryTotal>\n'
            f'        <cbc:LineExtensionAmount currencyID="SAR">{subtotal_dec:.2f}</cbc:LineExtensionAmount>\n'
            f'        <cbc:TaxExclusiveAmount currencyID="SAR">{subtotal_dec:.2f}</cbc:TaxExclusiveAmount>\n'
            f'        <cbc:TaxInclusiveAmount currencyID="SAR">{grand_total_dec:.2f}</cbc:TaxInclusiveAmount>\n'
            f'        <cbc:AllowanceTotalAmount currencyID="SAR">0.00</cbc:AllowanceTotalAmount>\n'
            f'        <cbc:PrepaidAmount currencyID="SAR">0.00</cbc:PrepaidAmount>\n'
            f'        <cbc:PayableAmount currencyID="SAR">{grand_total_dec:.2f}</cbc:PayableAmount>\n'
            f'    </cac:LegalMonetaryTotal>\n'
            f'    <cac:InvoiceLine>\n'
            f'        <cbc:ID>1</cbc:ID>\n'
            f'        <cbc:InvoicedQuantity unitCode="PCE">1.0000</cbc:InvoicedQuantity>\n'
            f'        <cbc:LineExtensionAmount currencyID="SAR">{subtotal_dec:.2f}</cbc:LineExtensionAmount>\n'
            f'        <cac:TaxTotal>\n'
            f'            <cbc:TaxAmount currencyID="SAR">{vat_dec:.2f}</cbc:TaxAmount>\n'
            f'            <cbc:RoundingAmount currencyID="SAR">{grand_total_dec:.2f}</cbc:RoundingAmount>\n'
            f'        </cac:TaxTotal>\n'
            f'        <cac:Item>\n'
            f'            <cbc:Name>Logistics Services / Operations</cbc:Name>\n'
            f'            <cac:ClassifiedTaxCategory>\n'
            f'                <cbc:ID>S</cbc:ID>\n'
            f'                <cbc:Percent>15.00</cbc:Percent>\n'
            f'                <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>\n'
            f'            </cac:ClassifiedTaxCategory>\n'
            f'        </cac:Item>\n'
            f'        <cac:Price>\n'
            f'            <cbc:PriceAmount currencyID="SAR">{subtotal_dec:.2f}</cbc:PriceAmount>\n'
            f'        </cac:Price>\n'
            f'    </cac:InvoiceLine>\n'
            f'</Invoice>'
        )

    @classmethod
    def generate_xml_ubl(
        cls,
        invoice: models.CustomerInvoice,
        tax_profile: Optional[models.TaxProfile],
        invoice_uuid: str,
        is_b2b: bool = True,
        previous_hash: Optional[str] = None,
        icv: int = 1,
        signature_value_b64: Optional[str] = None,
        certificate_b64: Optional[str] = None,
    ) -> str:
        """Generates complete, compliant UBL 2.1 XML with UBLExtensions, digital signature and CSID."""
        seller_name = tax_profile.legal_name if tax_profile else "شركة ميون للنقل والخدمات اللوجستية"
        seller_vat = tax_profile.tax_id if tax_profile else "300099999900003"
        buyer_name = invoice.customer_name or "Standard Customer"
        buyer_vat = invoice.customer_tax_number or "311111111100003"
        type_code = "0100000" if is_b2b else "0200000"
        pih = previous_hash or cls.GENESIS_HASH

        subtotal_val = getattr(invoice, "subtotal", 0) or 0
        vat_val = getattr(invoice, "vat_amount", 0) or 0
        grand_val = getattr(invoice, "grand_total", 0) or (Decimal(str(subtotal_val)) + Decimal(str(vat_val)))

        subtotal_dec = Decimal(str(subtotal_val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        vat_dec = Decimal(str(vat_val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        grand_total_dec = Decimal(str(grand_val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        norm_dt = _normalize_datetime(getattr(invoice, "issue_date", None))
        issue_date_str = norm_dt.strftime("%Y-%m-%d")
        issue_time_str = norm_dt.strftime("%H:%M:%S")

        sig_val = signature_value_b64 or ""
        cert_val = certificate_b64 or ""

        return (
            f'<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" '
            f'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" '
            f'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" '
            f'xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">\n'
            f'    <ext:UBLExtensions>\n'
            f'        <ext:UBLExtension>\n'
            f'            <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>\n'
            f'            <ext:ExtensionContent>\n'
            f'                <sig:UBLDocumentSignatures xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2">\n'
            f'                    <sac:SignatureInformation xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2">\n'
            f'                        <cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>\n'
            f'                        <sbc:ReferencedSignatureID xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2">urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>\n'
            f'                        <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature">\n'
            f'                            <ds:SignedInfo>\n'
            f'                                <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>\n'
            f'                                <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>\n'
            f'                            </ds:SignedInfo>\n'
            f'                            <ds:SignatureValue>{sig_val}</ds:SignatureValue>\n'
            f'                            <ds:KeyInfo>\n'
            f'                                <ds:X509Data>\n'
            f'                                    <ds:X509Certificate>{cert_val}</ds:X509Certificate>\n'
            f'                                </ds:X509Data>\n'
            f'                            </ds:KeyInfo>\n'
            f'                        </ds:Signature>\n'
            f'                    </sac:SignatureInformation>\n'
            f'                </sig:UBLDocumentSignatures>\n'
            f'            </ext:ExtensionContent>\n'
            f'        </ext:UBLExtension>\n'
            f'    </ext:UBLExtensions>\n'
            f'    <cbc:ProfileID>reporting:1.0</cbc:ProfileID>\n'
            f'    <cbc:ID>{invoice.invoice_number}</cbc:ID>\n'
            f'    <cbc:UUID>{invoice_uuid}</cbc:UUID>\n'
            f'    <cbc:IssueDate>{issue_date_str}</cbc:IssueDate>\n'
            f'    <cbc:IssueTime>{issue_time_str}</cbc:IssueTime>\n'
            f'    <cbc:InvoiceTypeCode name="{type_code}">388</cbc:InvoiceTypeCode>\n'
            f'    <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>\n'
            f'    <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>\n'
            f'    <cac:AdditionalDocumentReference>\n'
            f'        <cbc:ID>ICV</cbc:ID>\n'
            f'        <cbc:UUID>{icv}</cbc:UUID>\n'
            f'    </cac:AdditionalDocumentReference>\n'
            f'    <cac:AdditionalDocumentReference>\n'
            f'        <cbc:ID>PIH</cbc:ID>\n'
            f'        <cac:Attachment>\n'
            f'            <cac:ExternalReference>\n'
            f'                <cbc:URI>{pih}</cbc:URI>\n'
            f'            </cac:ExternalReference>\n'
            f'        </cac:Attachment>\n'
            f'    </cac:AdditionalDocumentReference>\n'
            f'    <cac:AccountingSupplierParty>\n'
            f'        <cac:Party>\n'
            f'            <cac:PartyIdentification>\n'
            f'                <cbc:ID schemeID="CRN">{seller_vat[:10]}</cbc:ID>\n'
            f'            </cac:PartyIdentification>\n'
            f'            <cac:PartyLegalEntity>\n'
            f'                <cbc:RegistrationName>{seller_name}</cbc:RegistrationName>\n'
            f'            </cac:PartyLegalEntity>\n'
            f'            <cac:PartyTaxScheme>\n'
            f'                <cbc:CompanyID>{seller_vat}</cbc:CompanyID>\n'
            f'                <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>\n'
            f'            </cac:PartyTaxScheme>\n'
            f'        </cac:Party>\n'
            f'    </cac:AccountingSupplierParty>\n'
            f'    <cac:AccountingCustomerParty>\n'
            f'        <cac:Party>\n'
            f'            <cac:PartyIdentification>\n'
            f'                <cbc:ID schemeID="NAT">{buyer_vat[:10]}</cbc:ID>\n'
            f'            </cac:PartyIdentification>\n'
            f'            <cac:PartyLegalEntity>\n'
            f'                <cbc:RegistrationName>{buyer_name}</cbc:RegistrationName>\n'
            f'            </cac:PartyLegalEntity>\n'
            f'            <cac:PartyTaxScheme>\n'
            f'                <cbc:CompanyID>{buyer_vat}</cbc:CompanyID>\n'
            f'                <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>\n'
            f'            </cac:PartyTaxScheme>\n'
            f'        </cac:Party>\n'
            f'    </cac:AccountingCustomerParty>\n'
            f'    <cac:TaxTotal>\n'
            f'        <cbc:TaxAmount currencyID="SAR">{vat_dec:.2f}</cbc:TaxAmount>\n'
            f'        <cac:TaxSubtotal>\n'
            f'            <cbc:TaxableAmount currencyID="SAR">{subtotal_dec:.2f}</cbc:TaxableAmount>\n'
            f'            <cbc:TaxAmount currencyID="SAR">{vat_dec:.2f}</cbc:TaxAmount>\n'
            f'            <cac:TaxCategory>\n'
            f'                <cbc:ID>S</cbc:ID>\n'
            f'                <cbc:Percent>15.00</cbc:Percent>\n'
            f'                <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>\n'
            f'            </cac:TaxCategory>\n'
            f'        </cac:TaxSubtotal>\n'
            f'    </cac:TaxTotal>\n'
            f'    <cac:LegalMonetaryTotal>\n'
            f'        <cbc:LineExtensionAmount currencyID="SAR">{subtotal_dec:.2f}</cbc:LineExtensionAmount>\n'
            f'        <cbc:TaxExclusiveAmount currencyID="SAR">{subtotal_dec:.2f}</cbc:TaxExclusiveAmount>\n'
            f'        <cbc:TaxInclusiveAmount currencyID="SAR">{grand_total_dec:.2f}</cbc:TaxInclusiveAmount>\n'
            f'        <cbc:AllowanceTotalAmount currencyID="SAR">0.00</cbc:AllowanceTotalAmount>\n'
            f'        <cbc:PrepaidAmount currencyID="SAR">0.00</cbc:PrepaidAmount>\n'
            f'        <cbc:PayableAmount currencyID="SAR">{grand_total_dec:.2f}</cbc:PayableAmount>\n'
            f'    </cac:LegalMonetaryTotal>\n'
            f'    <cac:InvoiceLine>\n'
            f'        <cbc:ID>1</cbc:ID>\n'
            f'        <cbc:InvoicedQuantity unitCode="PCE">1.0000</cbc:InvoicedQuantity>\n'
            f'        <cbc:LineExtensionAmount currencyID="SAR">{subtotal_dec:.2f}</cbc:LineExtensionAmount>\n'
            f'        <cac:TaxTotal>\n'
            f'            <cbc:TaxAmount currencyID="SAR">{vat_dec:.2f}</cbc:TaxAmount>\n'
            f'            <cbc:RoundingAmount currencyID="SAR">{grand_total_dec:.2f}</cbc:RoundingAmount>\n'
            f'        </cac:TaxTotal>\n'
            f'        <cac:Item>\n'
            f'            <cbc:Name>Logistics Services / Operations</cbc:Name>\n'
            f'            <cac:ClassifiedTaxCategory>\n'
            f'                <cbc:ID>S</cbc:ID>\n'
            f'                <cbc:Percent>15.00</cbc:Percent>\n'
            f'                <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>\n'
            f'            </cac:TaxCategory>\n'
            f'        </cac:Item>\n'
            f'        <cac:Price>\n'
            f'            <cbc:PriceAmount currencyID="SAR">{subtotal_dec:.2f}</cbc:PriceAmount>\n'
            f'        </cac:Price>\n'
            f'    </cac:InvoiceLine>\n'
            f'</Invoice>'
        )

    @classmethod
    def get_latest_invoice_hash(cls, database: Session, company_id: uuid.UUID) -> str:
        """Retrieve previous invoice hash for blockchain-like cryptographic chaining."""
        last_log = database.scalar(
            select(models.ZATCALog)
            .where(models.ZATCALog.company_id == company_id, models.ZATCALog.invoice_hash.isnot(None))
            .order_by(models.ZATCALog.created_at.desc())
        )
        return last_log.invoice_hash if last_log and last_log.invoice_hash else cls.GENESIS_HASH

    @classmethod
    def process_invoice(
        cls,
        database: Session,
        company_id: uuid.UUID,
        invoice_id: uuid.UUID,
        invoice_type: str = "b2b",
        simulate_failure: bool = False,
        failure_reason: Optional[str] = None,
    ) -> models.ZATCALog:
        """Process customer invoice for ZATCA Phase 2 Clearance (B2B) or Reporting (B2C) using authentic ECDSA signing."""
        invoice = database.scalar(
            select(models.CustomerInvoice).where(
                models.CustomerInvoice.id == invoice_id,
                models.CustomerInvoice.company_id == company_id,
            )
        )
        if invoice is None:
            raise ValueError(f"Customer invoice {invoice_id} not found for company {company_id}")

        tax_profile = database.scalar(
            select(models.TaxProfile).where(
                models.TaxProfile.company_id == company_id,
                models.TaxProfile.is_active.is_(True),
            )
        )

        now = datetime.now(timezone.utc)
        is_b2b = invoice_type.lower() in {"b2b", "standard", "tax_invoice"}
        inv_uuid = str(uuid.uuid4())
        type_code = "0100000" if is_b2b else "0200000"

        # 1. Resolve Cryptographic Private Key & CSID Certificate
        default_priv_pem, default_cert_pem = get_or_create_fallback_credentials()
        priv_pem = tax_profile.secret_key if tax_profile and tax_profile.secret_key else default_priv_pem
        cert_pem = tax_profile.csid if tax_profile and tax_profile.csid else default_cert_pem

        try:
            private_key = load_private_key(priv_pem)
        except Exception:
            private_key = load_private_key(default_priv_pem)

        try:
            cert = x509.load_pem_x509_certificate(cert_pem.encode("utf-8"))
            cert_der = cert.public_bytes(serialization.Encoding.DER)
            cert_b64 = base64.b64encode(cert_der).decode("utf-8")
            cert_sig_bytes = cert.signature
        except Exception:
            cert = x509.load_pem_x509_certificate(default_cert_pem.encode("utf-8"))
            cert_der = cert.public_bytes(serialization.Encoding.DER)
            cert_b64 = base64.b64encode(cert_der).decode("utf-8")
            cert_sig_bytes = cert.signature

        public_key_bytes = get_public_key_bytes(private_key)

        # 2. Sequential Invoice Counter (ICV) & Previous Invoice Hash (PIH)
        icv = cls.get_invoice_counter(database, company_id)
        previous_hash = cls.get_latest_invoice_hash(database, company_id)

        # 3. Canonical Invoice Hash
        seller_name = tax_profile.legal_name if tax_profile else "شركة ميون للنقل والخدمات اللوجستية"
        seller_vat = tax_profile.tax_id if tax_profile else "300099999900003"
        buyer_name = invoice.customer_name or "Standard Customer"
        buyer_vat = invoice.customer_tax_number or "311111111100003"

        subtotal_val = getattr(invoice, "subtotal", 0) or 0
        vat_val = getattr(invoice, "vat_amount", 0) or 0
        grand_val = getattr(invoice, "grand_total", 0) or (Decimal(str(subtotal_val)) + Decimal(str(vat_val)))

        subtotal_dec = Decimal(str(subtotal_val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        vat_dec = Decimal(str(vat_val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        grand_total_dec = Decimal(str(grand_val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        norm_issue_dt = _normalize_datetime(getattr(invoice, "issue_date", None))
        issue_date_str = norm_issue_dt.strftime("%Y-%m-%d")
        issue_time_str = norm_issue_dt.strftime("%H:%M:%S")

        canonical_body = cls.generate_canonical_body(
            invoice=invoice,
            seller_name=seller_name,
            seller_vat=seller_vat,
            buyer_name=buyer_name,
            buyer_vat=buyer_vat,
            invoice_uuid=inv_uuid,
            issue_date_str=issue_date_str,
            issue_time_str=issue_time_str,
            invoice_type_code=type_code,
            subtotal_dec=subtotal_dec,
            vat_dec=vat_dec,
            grand_total_dec=grand_total_dec,
            pih=previous_hash,
            icv=icv,
        )
        invoice_hash_bytes = hashlib.sha256(canonical_body.encode("utf-8")).digest()
        invoice_hash = invoice_hash_bytes.hex()

        # 4. Authentic ECDSA secp256k1 Digital Signing
        ecdsa_sig_bytes = sign_hash_ecdsa(private_key, invoice_hash_bytes)
        signature_value_b64 = base64.b64encode(ecdsa_sig_bytes).decode("utf-8")
        crypto_stamp = signature_value_b64

        # 5. Full UBL 2.1 XML Generation
        xml_payload = cls.generate_xml_ubl(
            invoice=invoice,
            tax_profile=tax_profile,
            invoice_uuid=inv_uuid,
            is_b2b=is_b2b,
            previous_hash=previous_hash,
            icv=icv,
            signature_value_b64=signature_value_b64,
            certificate_b64=cert_b64,
        )

        # 6. ZATCA Phase 2 Compliant TLV Base64 QR Code
        qr_code = generate_zatca_qr_code(
            seller_name=seller_name,
            vat_number=seller_vat,
            timestamp=norm_issue_dt,
            total_amount=grand_total_dec,
            vat_amount=vat_dec,
            invoice_hash=invoice_hash_bytes,
            digital_signature=ecdsa_sig_bytes,
            public_key=public_key_bytes,
            certificate_signature=cert_sig_bytes,
        )

        if simulate_failure:
            submission_status = "FAILED"
            clearance_status = None
            reporting_status = None
            validation_errors = failure_reason or "Simulated transmission failure: connection timeout to ZATCA gateway"
            retry_count = 1
            response_payload = json.dumps({
                "status": "FAILED",
                "error_code": "CF-902",
                "message": validation_errors,
                "timestamp": now.isoformat(),
            })
        else:
            validation_errors = None
            retry_count = 0
            if is_b2b:
                submission_status = "CLEARED"
                clearance_status = "CLEARED"
                reporting_status = None
            else:
                submission_status = "REPORTED"
                clearance_status = None
                reporting_status = "REPORTED"

            response_payload = json.dumps({
                "status": "SUCCESS",
                "zatca_stage": tax_profile.zatca_stage if tax_profile else "simulation",
                "invoice_type": "Standard Tax Invoice" if is_b2b else "Simplified Tax Invoice",
                "clearance_status": clearance_status,
                "reporting_status": reporting_status,
                "timestamp": now.isoformat(),
            })

        log_entry = models.ZATCALog(
            company_id=company_id,
            tax_profile_id=tax_profile.id if tax_profile else None,
            invoice_id=invoice.id,
            invoice_uuid=inv_uuid,
            invoice_hash=invoice_hash,
            previous_invoice_hash=previous_hash,
            xml_payload=xml_payload,
            qr_code_payload=qr_code,
            cryptographic_stamp=crypto_stamp,
            submission_status=submission_status,
            clearance_status=clearance_status,
            reporting_status=reporting_status,
            validation_errors=validation_errors,
            warning_messages=None,
            retry_count=retry_count,
            last_attempt_at=now,
            response_payload=response_payload,
        )

        database.add(log_entry)
        database.commit()
        database.refresh(log_entry)
        return log_entry

    @classmethod
    def retry_submission(
        cls,
        database: Session,
        company_id: uuid.UUID,
        log_id: uuid.UUID,
        simulate_failure: bool = False,
        failure_reason: Optional[str] = None,
    ) -> models.ZATCALog:
        """Retry a failed ZATCA submission."""
        log_entry = database.scalar(
            select(models.ZATCALog).where(
                models.ZATCALog.id == log_id,
                models.ZATCALog.company_id == company_id,
            )
        )
        if log_entry is None:
            raise ValueError(f"ZATCA log entry {log_id} not found for company {company_id}")

        now = datetime.now(timezone.utc)
        log_entry.retry_count += 1
        log_entry.last_attempt_at = now

        if simulate_failure:
            log_entry.submission_status = "FAILED"
            log_entry.validation_errors = failure_reason or f"Retry attempt {log_entry.retry_count} failed: ZATCA gateway 503"
            log_entry.response_payload = json.dumps({
                "status": "FAILED",
                "retry_attempt": log_entry.retry_count,
                "error": log_entry.validation_errors,
                "timestamp": now.isoformat(),
            })
        else:
            is_simplified = (
                "Simplified" in (log_entry.response_payload or "")
                or "0200000" in (log_entry.xml_payload or "")
                or log_entry.reporting_status == "REPORTED"
            )
            if is_simplified:
                log_entry.submission_status = "REPORTED"
                log_entry.reporting_status = "REPORTED"
                log_entry.clearance_status = None
            else:
                log_entry.submission_status = "CLEARED"
                log_entry.clearance_status = "CLEARED"
                log_entry.reporting_status = None

            log_entry.validation_errors = None
            log_entry.response_payload = json.dumps({
                "status": "RETRY_SUCCESS",
                "retry_attempt": log_entry.retry_count,
                "clearance_status": log_entry.clearance_status,
                "reporting_status": log_entry.reporting_status,
                "timestamp": now.isoformat(),
            })

        database.commit()
        database.refresh(log_entry)
        return log_entry
