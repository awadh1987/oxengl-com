import * as XLSX from 'xlsx';
import { OperationRecord, CustomerInvoice, TransporterSettlement } from '../types';

export function exportOperationsToExcel(operations: OperationRecord[], fileName = 'Meayon_Operations_Log') {
  const rows = operations.map((op, idx) => ({
    '#': idx + 1,
    'رقم الرحلة / المعرف': op.id,
    'تاريخ التحميل': op.loading_date,
    'رقم الشاحنة': op.truck_no,
    'اسم الناقل (المقاول)': op.transporter_name,
    'مصدر التحميل (الكسارة)': op.loading_source,
    'رقم فاتورة التحميل': op.loading_invoice_no,
    'العميل المستلم': op.destination_customer,
    'رقم فاتورة الاستلام': op.receipt_invoice_no,
    'نوع المادة': op.material_type,
    'الوزن المحمل (MT طن)': op.qty_loaded,
    'الوزن المستلم (MT طن)': op.qty_delivered,
    'الفاقد (MT طن)': op.qty_wastage,
    'نسبة الفاقد %': `${op.wastage_percentage}%`,
    'رقم تذكرة الميزان': op.scale_ticket_no,
    'قيمة المبيعات (بدون ضريبة)': op.sales_amount,
    'ضريبة القيمة المضافة 15%': op.vat_amount,
    'إجمالي المبيعات (ر.س)': op.total_sales,
    'تكلفة الشراء من الكسارة': op.purchases_cost,
    'المسدد للكسارة': op.crusher_payment,
    'صافي الربح التشغيلي': op.net_profit,
    'الشهر': op.operation_month,
    'ملاحظات': op.notes || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'سجل العمليات اليومية');

  // Set RTL on sheet
  if (!workbook.Workbook) workbook.Workbook = {};
  if (!workbook.Workbook.Views) workbook.Workbook.Views = [];
  workbook.Workbook.Views[0] = { RTL: true };

  XLSX.writeFile(workbook, `${fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportInvoiceToExcel(invoice: CustomerInvoice, trips: OperationRecord[]) {
  const summaryRows = invoice.items.map((item, i) => ({
    '#': i + 1,
    'نوع المادة / البند': item.materialType,
    'عدد الرحلات': item.tripsCount,
    'الوزن المحمل (MT طن)': item.loadedWeight,
    'الوزن الصافي المستلم (MT طن)': item.deliveredWeight,
    'إجمالي الفاقد (MT طن)': item.wastageWeight,
    'سعر الوحدة (ر.س/MT طن)': item.unitPrice,
    'المبلغ الخاضع للضريبة (ر.س)': item.subtotal,
    'ضريبة القيمة المضافة 15%': item.vatAmount,
    'الإجمالي الشامل للضريبة (ر.س)': item.total,
  }));

  const tripRows = trips.map((trip, idx) => ({
    '#': idx + 1,
    'التاريخ': trip.loading_date,
    'رقم الشاحنة': trip.truck_no,
    'الناقل': trip.transporter_name,
    'المادة': trip.material_type,
    'الوزن المستلم': trip.qty_delivered,
    'رقم تذكرة الميزان': trip.scale_ticket_no,
    'رقم الإيصال': trip.receipt_invoice_no,
    'المبلغ (ر.س)': trip.sales_amount,
  }));

  const workbook = XLSX.utils.book_new();
  const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
  const tripsWs = XLSX.utils.json_to_sheet(tripRows);

  XLSX.utils.book_append_sheet(workbook, summaryWs, 'ملخص الفاتورة');
  XLSX.utils.book_append_sheet(workbook, tripsWs, 'بيان تفاصيل الرحلات');

  XLSX.writeFile(workbook, `فاتورة_${invoice.customerName.slice(0, 15)}_${invoice.invoiceNumber}.xlsx`);
}

export function exportTransporterSettlementsToExcel(settlements: TransporterSettlement[], month: number, year: number) {
  const rows = settlements.map((s, i) => ({
    '#': i + 1,
    'اسم الناقل': s.transporterName,
    'الشهر/السنة': `${month}/${year}`,
    'عدد الرحلات': s.tripsCount,
    'إجمالي الوزن المحمل (MT طن)': s.totalLoaded,
    'إجمالي الوزن المستلم (MT طن)': s.totalDelivered,
    'إجمالي الفاقد (MT طن)': s.totalWastage,
    'نسبة الفاقد %': `${s.wastagePercentage.toFixed(2)}%`,
    'أجور النقل المستحقة (ر.س)': s.totalFreightFee,
    'خصومات الفاقد والجزاءات (ر.س)': s.penaltyDeductions,
    'صافي المستحق للصرف (ر.س)': s.netPayable,
    'الحالة': s.status,
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'كشف حساب الناقلين');
  XLSX.writeFile(wb, `كشف_حساب_الناقلين_${month}_${year}.xlsx`);
}
