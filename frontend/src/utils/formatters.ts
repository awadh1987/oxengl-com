export function formatCurrency(amount: number, lang: 'ar' | 'en' = 'ar'): string {
  const formatted = new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);

  return lang === 'ar' ? `${formatted} ر.س` : `SAR ${formatted}`;
}

export function formatNumber(val: number, lang: 'ar' | 'en' = 'ar', decimals = 2): string {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val || 0);
}

export function formatTonnage(weight: number, lang: 'ar' | 'en' = 'ar', uom?: string): string {
  const formatted = formatNumber(weight, lang, 2);
  if (uom && uom !== 'MT طن' && uom !== 'طن' && uom !== 'Tons' && uom !== 'MT') {
    return `${formatted} ${uom}`;
  }
  return `${formatted} MT طن`;
}

export function formatUOM(val: number, uom: string = 'MT طن', lang: 'ar' | 'en' = 'ar'): string {
  const formatted = formatNumber(val, lang, 2);
  if (!uom || uom === 'MT طن' || uom === 'MT' || uom === 'طن' || uom === 'Tons') {
    return `${formatted} ${lang === 'ar' ? 'MT طن' : 'MT'}`;
  }
  if (uom === 'kg') return `${formatted} kg`;
  if (uom === 'truck') return `${formatted} ${lang === 'ar' ? 'شاحنة' : 'truck'}`;
  if (uom === 'CBM') return `${formatted} CBM`;
  return `${formatted} ${uom}`;
}

export function formatDate(dateString: string, lang: 'ar' | 'en' = 'ar'): string {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return dateString;
  }
}

export function getMonthName(monthIndex: number, lang: 'ar' | 'en' = 'ar'): string {
  const arabicMonths = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];
  const englishMonths = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const idx = Math.max(1, Math.min(12, monthIndex)) - 1;
  return lang === 'ar' ? arabicMonths[idx] : englishMonths[idx];
}

/**
 * Precise halala rounding (ROUND_HALF_UP) avoiding IEEE-754 floating-point drift.
 * Multiplies by 100, rounds using Math.round(val + EPSILON) or integer halalas, returns exact 2-decimal number.
 */
export function roundHalala(amount: number): number {
  if (!amount || isNaN(amount)) return 0;
  // Use integer halalas with Math.round to enforce ROUND_HALF_UP
  const halalas = Math.round(Number((Math.abs(amount) * 100).toFixed(6)));
  const rounded = halalas / 100;
  return amount < 0 ? -rounded : rounded;
}

/**
 * Computes standard 15% VAT breakdown with exact halala precision.
 * vatAmount = roundHalala(subtotal * 0.15)
 * total = roundHalala(subtotal + vatAmount)
 */
export function calculateVatBreakdown(subtotal: number, vatRate = 0.15): { subtotal: number; vatAmount: number; grandTotal: number } {
  const cleanSubtotal = roundHalala(subtotal);
  // Compute VAT in halalas: subtotal * 100 * 0.15 = subtotal * 15 halalas
  const vatHalalas = Math.round(Number((cleanSubtotal * vatRate * 100).toFixed(6)));
  const vatAmount = vatHalalas / 100;
  const grandTotal = roundHalala(cleanSubtotal + vatAmount);
  return {
    subtotal: cleanSubtotal,
    vatAmount,
    grandTotal,
  };
}

// Generate TLV format / base64 string for Saudi ZATCA e-invoices QR Code
export function generateZatcaQR(
  sellerName: string,
  vatRegistrationNumber: string,
  timestamp: string,
  invoiceTotal: number,
  vatTotal: number
): string {
  const enc = new TextEncoder();
  const formatTLV = (tag: number, value: string): Uint8Array => {
    const valBytes = enc.encode(value);
    const tlv = new Uint8Array(2 + valBytes.length);
    tlv[0] = tag;
    tlv[1] = valBytes.length;
    tlv.set(valBytes, 2);
    return tlv;
  };

  const t1 = formatTLV(1, sellerName);
  const t2 = formatTLV(2, vatRegistrationNumber);
  const t3 = formatTLV(3, timestamp);
  const t4 = formatTLV(4, roundHalala(invoiceTotal).toFixed(2));
  const t5 = formatTLV(5, roundHalala(vatTotal).toFixed(2));

  const combined = new Uint8Array(t1.length + t2.length + t3.length + t4.length + t5.length);
  let offset = 0;
  [t1, t2, t3, t4, t5].forEach((arr) => {
    combined.set(arr, offset);
    offset += arr.length;
  });

  let binary = '';
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

