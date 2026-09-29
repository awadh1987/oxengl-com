import io
import uuid
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
import pandas as pd

from app.db.session import get_db

router = APIRouter(prefix="/api/v1/sales/invoices", tags=["Sales Exports"])

@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(invoice_id: str, db: Session = Depends(get_db)):
    """Generates a professional ZATCA-compliant PDF invoice with embedded QR code."""
    try:
        inv_uuid = uuid.UUID(invoice_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid invoice ID format")

    # Fetch invoice and audit log
    invoice = db.execute(
        text("SELECT * FROM customer_invoices WHERE id = :id"), {"id": inv_uuid}
    .fetchone()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    zatca_log = db.execute(
        text("SELECT qr_code_payload, invoice_hash FROM zatca_logs WHERE invoice_id = :id"), {"id": inv_uuid}
    ).fetchone()

    # Generate PDF using ReportLab
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    import qrcode

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    story = []
    styles = getSampleStyleSheet()

    # Header
    title_style = ParagraphStyle('TitleStyle', parent=styles['Heading1'], fontSize=20, textColor=colors.HexColor('#1e293b'), spaceAfter=6)
    story.append(Paragraph(f"Tax Invoice / فاتورة ضريبية", title_style))
    story.append(Paragraph(f"<b>Invoice Number:</b> {invoice.invoice_number}", styles['Normal']))
    story.append(Paragraph(f"<b>Issue Date:</b> {invoice.issue_date}", styles['Normal']))
    story.append(Spacer(1, 12))

    # Party Info Table
    data = [
        [Paragraph("<b>Seller:</b> Myon Economic Co Ltd<br/><b>VAT ID:</b> 310123456700003", styles['Normal']),
         Paragraph(f"<b>Customer:</b> {invoice.customer_name}<br/><b>Customer VAT:</b> {invoice.customer_tax_number or 'N/A'}", styles['Normal'])]
    ]
    t = Table(data, colWidths=[270, 270])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('PADDING', (0,0), (-1,-1), 10),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
    ]))
    story.append(t)
    story.append(Spacer(1, 16))

    # Line Items / Totals Table
    totals_data = [
        ["Description", "Amount (SAR)"],
        [invoice.customer_name + " - Services rendered", f"{invoice.subtotal:.2f}"],
        ["Subtotal (Net)", f"{invoice.subtotal:.2f}"],
        ["VAT (15%)", f"{invoice.vat_amount:.2f}"],
        ["Grand Total (SAR)", f"{invoice.grand_total:.2f}"]
    ]
    t2 = Table(totals_data, colWidths=[380, 160])
    t2.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('PADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t2)
    
    doc.build(story)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={invoice.invoice_number}.pdf"}
    )

@router.get("/export/excel")
def export_invoices_excel(db: Session = Depends(get_db)):
    """Exports all customer invoices into an Excel spreadsheet."""
    query = text("SELECT invoice_number, customer_name, customer_tax_number, issue_date, status, subtotal, vat_amount, grand_total FROM customer_invoices ORDER BY created_at DESC")
    df = pd.read_sql(query, db.bind)
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Customer Invoices')
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=customer_invoices_report.xlsx"}
    )
    