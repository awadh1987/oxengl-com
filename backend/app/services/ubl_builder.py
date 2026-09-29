from lxml import etree
import base64
from typing import Dict, Any, Optional


def generate_base_ubl_xml(
    invoice_data: dict,
    uuid_str: str,
    issue_datetime: str,
    pih: str,
) -> bytes:
    """
    Generates the foundational UBL 2.1 XML for ZATCA Phase 2 e-invoicing.
    In production, this scales to map all line items, VAT categories, and tenant details.
    """
    if "T" in issue_datetime:
        parts = issue_datetime.split("T")
        issue_date = parts[0]
        issue_time = parts[1].replace("Z", "").split(".")[0]
    elif " " in issue_datetime:
        parts = issue_datetime.split(" ")
        issue_date = parts[0]
        issue_time = parts[1].split(".")[0]
    else:
        issue_date = issue_datetime
        issue_time = "00:00:00"

    invoice_number = invoice_data.get("invoice_number", "INV-AUTO")
    invoice_type_code = invoice_data.get("invoice_type_code", "388")
    invoice_subtype = invoice_data.get("invoice_subtype", "0111010")
    currency_code = invoice_data.get("currency", "SAR")

    xml_template = f'''<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
    <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
    <cbc:ID>{invoice_number}</cbc:ID>
    <cbc:UUID>{uuid_str}</cbc:UUID>
    <cbc:IssueDate>{issue_date}</cbc:IssueDate>
    <cbc:IssueTime>{issue_time}</cbc:IssueTime>
    <cbc:InvoiceTypeCode name="{invoice_subtype}">{invoice_type_code}</cbc:InvoiceTypeCode>
    <cbc:DocumentCurrencyCode>{currency_code}</cbc:DocumentCurrencyCode>
    <cac:AdditionalDocumentReference>
        <cbc:ID>PIH</cbc:ID>
        <cac:Attachment>
            <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">{pih}</cbc:EmbeddedDocumentBinaryObject>
        </cac:Attachment>
    </cac:AdditionalDocumentReference>
</Invoice>'''
    return xml_template.encode("utf-8")


def canonicalize_invoice(xml_bytes: bytes) -> bytes:
    """
    Parses the XML and applies standard Canonical XML 1.0 (C14N) 
    as strictly required by ZATCA before computing the SHA-256 hash.
    
    ZATCA Rule: Exclude UBLExtensions, SignatureInformation, and Signature elements from the hash.
    """
    parser = etree.XMLParser(remove_blank_text=True)
    elem = etree.fromstring(xml_bytes, parser)

    # Filter out None keys in nsmap for XPath compatibility
    ns = {
        "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
        "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
        "ext": "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
    }
    if elem.nsmap:
        ns.update({k: v for k, v in elem.nsmap.items() if k})

    # ZATCA Rule: Exclude UBLExtensions and SignatureInformation from the hash
    for ext in elem.xpath("//ext:UBLExtensions", namespaces=ns):
        if ext.getparent() is not None:
            ext.getparent().remove(ext)

    for sig in elem.xpath("//cac:SignatureInformation", namespaces=ns):
        if sig.getparent() is not None:
            sig.getparent().remove(sig)

    for sig in elem.xpath("//cac:Signature", namespaces=ns):
        if sig.getparent() is not None:
            sig.getparent().remove(sig)

    # C14N enforces standardized spacing, attribute ordering, and namespace declarations
    return etree.tostring(elem, method="c14n", exclusive=False)
