import hashlib
import base64
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Tuple

from cryptography.hazmat.primitives.asymmetric import ec, utils
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.x509.oid import NameOID
from cryptography.x509.name import _ASN1Type
from cryptography import x509


def generate_invoice_uuid() -> str:
    """Generates an RFC 4122 v4 compliant UUID."""
    return str(uuid.uuid4())


def get_zatca_timestamp() -> str:
    """Returns ISO-8601 UTC timestamp required by ZATCA."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def compute_invoice_hash(canonical_xml_bytes: bytes) -> str:
    """Computes SHA-256 digest of canonical invoice body and returns Base64 string."""
    digest = hashlib.sha256(canonical_xml_bytes).digest()
    return base64.b64encode(digest).decode("utf-8")


def encode_tlv_tag(tag_num: int, value: str | bytes) -> bytes:
    """Encodes a single tag according to ZATCA TLV format (Tag, Length, Value)."""
    if isinstance(value, str):
        val_bytes = value.encode("utf-8")
    else:
        val_bytes = value
    tag_byte = bytes([tag_num])
    length_byte = bytes([len(val_bytes)])
    return tag_byte + length_byte + val_bytes


def generate_zatca_phase2_qr(
    seller_name: str,
    vat_number: str,
    timestamp: str,
    total_amount: str,
    vat_amount: str,
    invoice_hash: str,
    digital_signature: str = "",
    public_key: bytes = b"",
    cryptographic_stamp: bytes = b""
) -> str:
    """Builds the 9-tag ZATCA Phase 2 TLV byte structure and returns Base64 string."""
    tlv_bytes = bytearray()
    tlv_bytes.extend(encode_tlv_tag(1, seller_name))
    tlv_bytes.extend(encode_tlv_tag(2, vat_number))
    tlv_bytes.extend(encode_tlv_tag(3, timestamp))
    tlv_bytes.extend(encode_tlv_tag(4, total_amount))
    tlv_bytes.extend(encode_tlv_tag(5, vat_amount))
    tlv_bytes.extend(encode_tlv_tag(6, invoice_hash))
    
    if digital_signature:
        tlv_bytes.extend(encode_tlv_tag(7, digital_signature))
    if public_key:
        tlv_bytes.extend(encode_tlv_tag(8, public_key))
    if cryptographic_stamp:
        tlv_bytes.extend(encode_tlv_tag(9, cryptographic_stamp))
        
    return base64.b64encode(tlv_bytes).decode("utf-8")


# ---------------------------------------------------------------------------
# ZATCA Phase 2 ECDSA secp256k1 Cryptography & CSR Generation
# ---------------------------------------------------------------------------

class KeypairResult(dict):
    """Dual-mode result supporting dict access (keys['private_key']) and tuple unpacking (pk, priv, pub)."""
    def __iter__(self):
        yield self["private_key_obj"]
        yield self["private_key"]
        yield self["public_key"]


class CSRResult(str):
    """Dual-mode result supporting direct str use (csr_b64) and dict metadata access."""
    def __new__(cls, csr_b64: str, data: Optional[Dict[str, Any]] = None):
        instance = super().__new__(cls, csr_b64)
        instance.data = data or {}
        return instance

    def __getitem__(self, item):
        if isinstance(item, str):
            return self.data[item]
        return super().__getitem__(item)

    def get(self, item, default=None):
        return self.data.get(item, default)


def generate_secp256k1_keypair() -> KeypairResult:
    """Generates an ECDSA secp256k1 private/public keypair.
    
    Returns:
        KeypairResult containing:
            - keys["private_key_obj"]: ec.EllipticCurvePrivateKey
            - keys["private_key"]: PEM private key string
            - keys["public_key"]: PEM public key string
        Also supports unpacking:
            pk_obj, pk_pem, pub_pem = generate_secp256k1_keypair()
    """
    private_key = ec.generate_private_key(ec.SECP256K1())
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")

    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")

    return KeypairResult({
        "private_key_obj": private_key,
        "private_key": private_pem,
        "public_key": public_pem,
        "private_key_pem": private_pem,
        "public_key_pem": public_pem,
    })


def load_ec_private_key(private_key_pem: str) -> ec.EllipticCurvePrivateKey:
    """Loads an ECDSA private key from a PEM string."""
    key = serialization.load_pem_private_key(
        private_key_pem.encode("utf-8"),
        password=None,
    )
    if not isinstance(key, ec.EllipticCurvePrivateKey):
        raise ValueError("Loaded key is not an Elliptic Curve private key.")
    return key


def get_public_key_uncompressed_bytes(private_key: ec.EllipticCurvePrivateKey) -> bytes:
    """Returns the 65-byte uncompressed SEC1 public key (0x04 || X || Y) for ZATCA Tag 8."""
    return private_key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )


def sign_invoice_hash_ecdsa(
    private_key: ec.EllipticCurvePrivateKey | str,
    invoice_hash: str | bytes,
) -> Tuple[str, bytes]:
    """Signs an invoice SHA-256 hash digest using ECDSA secp256k1.
    
    Args:
        private_key: The ECDSA secp256k1 private key instance or PEM string.
        invoice_hash: Either raw 32-byte digest or Base64-encoded SHA-256 digest string.
        
    Returns:
        Tuple of (signature_b64, raw_p1363_64_bytes)
        Where raw_p1363_64_bytes is the 64-byte IEEE P1363 (32-byte r || 32-byte s) binary signature.
    """
    if isinstance(private_key, str):
        private_key = load_ec_private_key(private_key)

    if isinstance(invoice_hash, str):
        try:
            digest_bytes = base64.b64decode(invoice_hash)
        except Exception:
            digest_bytes = invoice_hash.encode("utf-8")
    else:
        digest_bytes = bytes(invoice_hash)

    # Ensure 32-byte digest
    if len(digest_bytes) != 32:
        digest_bytes = hashlib.sha256(digest_bytes).digest()

    der_sig = private_key.sign(digest_bytes, ec.ECDSA(utils.Prehashed(hashes.SHA256())))
    r, s = utils.decode_dss_signature(der_sig)
    
    # ZATCA expects 64-byte raw signature (32-byte big-endian r + 32-byte big-endian s)
    raw_p1363_bytes = r.to_bytes(32, byteorder="big") + s.to_bytes(32, byteorder="big")
    sig_b64 = base64.b64encode(raw_p1363_bytes).decode("utf-8")

    return sig_b64, raw_p1363_bytes


def generate_zatca_csr(
    common_name: Optional[str] = None,
    organization_name: Optional[str] = None,
    organizational_unit: Optional[str] = None,
    vat_number: str = "300000000000003",
    country_code: str = "SA",
    invoice_type: str = "1100",
    business_category: str = "Logistics and Supply Chain",
    serial_number: Optional[str] = None,
    private_key: Optional[ec.EllipticCurvePrivateKey | str] = None,
    private_key_pem: Optional[str] = None,
    tenant_name: Optional[str] = None,
    egs_serial: Optional[str] = None,
) -> CSRResult:
    """Generates a ZATCA Phase 2 compliant Certificate Signing Request (CSR) with ECDSA secp256k1.
    
    Returns:
        CSRResult (a str containing csr_b64 that also supports dictionary-style access).
    """
    # Normalize aliases
    if tenant_name and not organization_name:
        organization_name = tenant_name
    if not organization_name:
        organization_name = "OxenGL Logistics Co."

    if egs_serial and not serial_number:
        serial_number = egs_serial
    if not serial_number:
        serial_number = f"1-OxenGL|2-ERP|3-{uuid.uuid4()}"

    if not common_name:
        common_name = f"TST-{vat_number}"

    if not organizational_unit:
        organizational_unit = vat_number

    if private_key_pem and not private_key:
        private_key = private_key_pem

    if private_key is None:
        pk_obj, pk_pem, _ = generate_secp256k1_keypair()
    elif isinstance(private_key, str):
        pk_obj = load_ec_private_key(private_key)
        pk_pem = private_key
    else:
        pk_obj = private_key
        pk_pem = pk_obj.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode("utf-8")

    subject_attributes = [
        x509.NameAttribute(NameOID.COUNTRY_NAME, country_code),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, organization_name),
        x509.NameAttribute(NameOID.ORGANIZATIONAL_UNIT_NAME, organizational_unit),
        x509.NameAttribute(NameOID.COMMON_NAME, common_name),
        x509.NameAttribute(NameOID.SERIAL_NUMBER, serial_number, _ASN1Type.UTF8String),
        x509.NameAttribute(NameOID.TITLE, invoice_type, _ASN1Type.UTF8String),
        x509.NameAttribute(NameOID.BUSINESS_CATEGORY, business_category, _ASN1Type.UTF8String),
    ]

    csr_builder = x509.CertificateSigningRequestBuilder().subject_name(
        x509.Name(subject_attributes)
    )

    csr = csr_builder.sign(pk_obj, hashes.SHA256())
    csr_pem = csr.public_bytes(serialization.Encoding.PEM).decode("utf-8")
    csr_der = csr.public_bytes(serialization.Encoding.DER)
    csr_b64 = base64.b64encode(csr_der).decode("utf-8")

    pub_raw_bytes = get_public_key_uncompressed_bytes(pk_obj)
    pub_b64 = base64.b64encode(pub_raw_bytes).decode("utf-8")

    return CSRResult(csr_b64, {
        "private_key_pem": pk_pem,
        "csr_pem": csr_pem,
        "csr_b64": csr_b64,
        "public_key_b64": pub_b64,
        "public_key_bytes": pub_raw_bytes,
        "serial_number": serial_number,
        "common_name": common_name,
        "vat_number": vat_number,
    })
