/**
 * Tafqeet (تفقيط) Utility for Arabic & English Number-to-Words Conversion
 * Converts numerical amounts (SAR and Halalas) into legally compliant accounting text.
 * Example: 1540.50 -> "فقط ألف وخمسمائة وأربعون ريالاً سعودياً وخمسون هللة لا غير"
 */

const ONES_AR = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const ONES_FEMININE_AR = ['', 'واحدة', 'اثنتان', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثمان', 'تسع'];
const TEENS_AR = [
  'عشرة',
  'أحد عشر',
  'اثنا عشر',
  'ثلاثة عشر',
  'أربعة عشر',
  'خمسة عشر',
  'ستة عشر',
  'سبعة عشر',
  'ثمانية عشر',
  'تسعة عشر',
];
const TENS_AR = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS_AR = [
  '',
  'مائة',
  'مائتان',
  'ثلاثمائة',
  'أربعمائة',
  'خمسمائة',
  'ستمائة',
  'سبعمائة',
  'ثمانمائة',
  'تسعمائة',
];

const ONES_EN = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS_EN = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function convertUnderThousandAr(n: number): string {
  if (n === 0) return '';
  const parts: string[] = [];

  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;

  if (hundreds > 0) {
    parts.push(HUNDREDS_AR[hundreds]);
  }

  if (remainder > 0) {
    if (remainder < 10) {
      parts.push(ONES_AR[remainder]);
    } else if (remainder < 20) {
      parts.push(TEENS_AR[remainder - 10]);
    } else {
      const tens = Math.floor(remainder / 10);
      const units = remainder % 10;
      if (units > 0) {
        parts.push(`${ONES_AR[units]} و${TENS_AR[tens]}`);
      } else {
        parts.push(TENS_AR[tens]);
      }
    }
  }

  return parts.join(' و');
}

/**
 * Converts a positive integer (up to 999,999,999) into Arabic words
 */
export function integerToArabicWords(n: number): string {
  if (n === 0) return 'صفر';

  const millions = Math.floor(n / 1000000);
  const thousands = Math.floor((n % 1000000) / 1000);
  const remaining = n % 1000;

  const sections: string[] = [];

  // Millions
  if (millions > 0) {
    if (millions === 1) {
      sections.push('مليون');
    } else if (millions === 2) {
      sections.push('مليونان');
    } else if (millions >= 3 && millions <= 10) {
      sections.push(`${convertUnderThousandAr(millions)} ملايين`);
    } else {
      sections.push(`${convertUnderThousandAr(millions)} مليوناً`);
    }
  }

  // Thousands
  if (thousands > 0) {
    if (thousands === 1) {
      sections.push('ألف');
    } else if (thousands === 2) {
      sections.push('ألفان');
    } else if (thousands >= 3 && thousands <= 10) {
      sections.push(`${convertUnderThousandAr(thousands)} آلاف`);
    } else {
      sections.push(`${convertUnderThousandAr(thousands)} ألفاً`);
    }
  }

  // Remainder (0..999)
  if (remaining > 0) {
    sections.push(convertUnderThousandAr(remaining));
  }

  return sections.join(' و');
}

/**
 * Converts standard currency amount into official Saudi Arabic Tafqeet string
 * e.g. 15400.75 -> "فقط خمسة عشر ألفاً وأربعمائة ريال سعودي وخمسة وسبعون هللة لا غير"
 */
export function tafqeetArabic(
  amount: number,
  currencyAr: string = 'ريال سعودي',
  fractionAr: string = 'هللة'
): string {
  if (isNaN(amount) || amount === 0) {
    return `فقط صفر ${currencyAr} لا غير`;
  }

  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);

  const integerPart = Math.floor(absAmount);
  const fractionalPart = Math.round((absAmount - integerPart) * 100);

  const integerWords = integerToArabicWords(integerPart);
  let result = `فقط ${integerWords} ${currencyAr}`;

  if (fractionalPart > 0) {
    const fractionWords = convertUnderThousandAr(fractionalPart);
    result += ` و${fractionWords} ${fractionAr}`;
  }

  result += ' لا غير';

  return isNegative ? `سالب ${result}` : result;
}

function convertUnderThousandEn(n: number): string {
  if (n === 0) return '';
  let str = '';
  if (n >= 100) {
    str += `${ONES_EN[Math.floor(n / 100)]} Hundred `;
    n %= 100;
  }
  if (n >= 20) {
    str += `${TENS_EN[Math.floor(n / 10)]} `;
    n %= 10;
  }
  if (n > 0) {
    str += `${ONES_EN[n]} `;
  }
  return str.trim();
}

/**
 * Converts currency amount to English accounting words
 */
export function tafqeetEnglish(
  amount: number,
  currencyEn: string = 'Saudi Riyals',
  fractionEn: string = 'Halalas'
): string {
  if (isNaN(amount) || amount === 0) {
    return `Only Zero ${currencyEn}`;
  }

  const absAmount = Math.abs(amount);
  const integerPart = Math.floor(absAmount);
  const fractionalPart = Math.round((absAmount - integerPart) * 100);

  const millions = Math.floor(integerPart / 1000000);
  const thousands = Math.floor((integerPart % 1000000) / 1000);
  const remaining = integerPart % 1000;

  const parts: string[] = [];

  if (millions > 0) {
    parts.push(`${convertUnderThousandEn(millions)} Million`);
  }
  if (thousands > 0) {
    parts.push(`${convertUnderThousandEn(thousands)} Thousand`);
  }
  if (remaining > 0) {
    parts.push(convertUnderThousandEn(remaining));
  }

  let words = parts.join(' ');
  let result = `Only ${words} ${currencyEn}`;

  if (fractionalPart > 0) {
    result += ` and ${convertUnderThousandEn(fractionalPart)} ${fractionEn}`;
  }

  result += ' Only';
  return result;
}
