import { PDFDocument, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import html2canvas from 'html2canvas';
import { CustomerInvoice, OperationRecord, BrandConfig, DocumentAttachment } from '../types';
import { formatCurrency, formatDate } from './formatters';

export interface MergedPdfProgressCallback {
  (progress: number, message: string): void;
}

/**
 * Downloads a binary Blob with the given filename in the browser
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ======================================================================================
// PRINT-SAFE COLOR ENGINE FOR HTML2CANVAS & PDF GENERATION
// html2canvas throws an uncaught error when parsing modern CSS color spaces (oklab, oklch,
// color-mix). The engine below provides mathematical conversion, canvas-backed rasterization,
// DOM sanitization, and a computedStyle proxy to ensure html2canvas never receives oklab/oklch.
// ======================================================================================

const PALETTE_SRGB_MAP: Record<string, string> = {
  // Slate
  'slate-50': '#f8fafc',
  'slate-100': '#f1f5f9',
  'slate-200': '#e2e8f0',
  'slate-300': '#cbd5e1',
  'slate-400': '#94a3b8',
  'slate-500': '#64748b',
  'slate-600': '#475569',
  'slate-700': '#334155',
  'slate-800': '#1e293b',
  'slate-900': '#0f172a',
  'slate-950': '#020617',

  // Gray / Neutral / Zinc / Stone
  'gray-50': '#f9fafb',
  'gray-100': '#f3f4f6',
  'gray-200': '#e5e7eb',
  'gray-300': '#d1d5db',
  'gray-400': '#9ca3af',
  'gray-500': '#6b7280',
  'gray-600': '#4b5563',
  'gray-700': '#374151',
  'gray-800': '#1f2937',
  'gray-900': '#111827',
  'gray-950': '#030712',
  'neutral-50': '#fafafa',
  'neutral-100': '#f5f5f5',
  'neutral-200': '#e5e5e5',
  'neutral-300': '#d4d4d4',
  'neutral-400': '#a3a3a3',
  'neutral-500': '#737373',
  'neutral-600': '#525252',
  'neutral-700': '#404040',
  'neutral-800': '#262626',
  'neutral-900': '#171717',
  'neutral-950': '#0a0a0a',

  // Orange
  'orange-50': '#fff7ed',
  'orange-100': '#ffedd5',
  'orange-200': '#fed7aa',
  'orange-300': '#fdba74',
  'orange-400': '#fb923c',
  'orange-500': '#f97316',
  'orange-600': '#ea580c',
  'orange-700': '#c2410c',
  'orange-800': '#9a3412',
  'orange-900': '#7c2d12',
  'orange-950': '#431407',

  // Emerald
  'emerald-50': '#ecfdf5',
  'emerald-100': '#d1fae5',
  'emerald-200': '#a7f3d0',
  'emerald-300': '#6ee7b7',
  'emerald-400': '#34d399',
  'emerald-500': '#10b981',
  'emerald-600': '#059669',
  'emerald-700': '#047857',
  'emerald-800': '#065f46',
  'emerald-900': '#064e3b',
  'emerald-950': '#022c22',

  // Rose
  'rose-50': '#fff1f2',
  'rose-100': '#ffe4e6',
  'rose-200': '#fecdd3',
  'rose-300': '#fda4af',
  'rose-400': '#fb7185',
  'rose-500': '#f43f5e',
  'rose-600': '#e11d48',
  'rose-700': '#be123c',
  'rose-800': '#9f1239',
  'rose-900': '#881337',
  'rose-950': '#4c0519',

  // Amber
  'amber-50': '#fffbeb',
  'amber-100': '#fef3c7',
  'amber-200': '#fde68a',
  'amber-300': '#fcd34d',
  'amber-400': '#fbbf24',
  'amber-500': '#f59e0b',
  'amber-600': '#d97706',
  'amber-700': '#b45309',
  'amber-800': '#92400e',
  'amber-900': '#78350f',
  'amber-950': '#451a03',

  // Blue
  'blue-50': '#eff6ff',
  'blue-100': '#dbeafe',
  'blue-200': '#bfdbfe',
  'blue-300': '#93c5fd',
  'blue-400': '#60a5fa',
  'blue-500': '#3b82f6',
  'blue-600': '#2563eb',
  'blue-700': '#1d4ed8',
  'blue-800': '#1e40af',
  'blue-900': '#1e3a8a',
  'blue-950': '#172554',

  // Red
  'red-500': '#ef4444',
  'red-600': '#dc2626',
  'red-700': '#b91c1c',
};

/**
 * Exact mathematical conversion from Oklab (L, a, b) to sRGB string
 */
function oklabToSrgb(L: number, a: number, b: number, alpha: number = 1): string {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const gamma = (c: number) => {
    const clamped = Math.max(0, Math.min(1, c));
    return clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  };

  const r = Math.round(gamma(rLin) * 255);
  const g = Math.round(gamma(gLin) * 255);
  const bCol = Math.round(gamma(bLin) * 255);

  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  if (clampedAlpha < 1) {
    return `rgba(${r}, ${g}, ${bCol}, ${Number(clampedAlpha.toFixed(3))})`;
  }
  return `rgb(${r}, ${g}, ${bCol})`;
}

/**
 * Exact mathematical conversion from Oklch (L, C, H) to sRGB string
 */
function oklchToSrgb(L: number, C: number, H: number, alpha: number = 1): string {
  const rad = (H * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);
  return oklabToSrgb(L, a, b, alpha);
}

function parseCssNumber(val: string): number {
  val = val.trim();
  if (val.endsWith('%')) {
    return parseFloat(val) / 100;
  }
  return parseFloat(val);
}

function parseHue(val: string): number {
  val = val.trim();
  if (val.endsWith('turn')) {
    return parseFloat(val) * 360;
  }
  if (val.endsWith('rad')) {
    return (parseFloat(val) * 180) / Math.PI;
  }
  if (val.endsWith('deg')) {
    return parseFloat(val);
  }
  return parseFloat(val);
}

function parseAndConvertOklab(str: string): string | null {
  const match = str.match(/oklab\(\s*([^/)]+)(?:\s*\/\s*([^)]+))?\s*\)/i);
  if (!match) return null;
  const parts = match[1].trim().split(/\s+/);
  if (parts.length < 3) return null;
  const L = parseCssNumber(parts[0]);
  const a = parseCssNumber(parts[1]);
  const b = parseCssNumber(parts[2]);
  let alpha = 1;
  if (match[2]) {
    alpha = parseCssNumber(match[2]);
  }
  if (isNaN(L) || isNaN(a) || isNaN(b) || isNaN(alpha)) return null;
  return oklabToSrgb(L, a, b, alpha);
}

function parseAndConvertOklch(str: string): string | null {
  const match = str.match(/oklch\(\s*([^/)]+)(?:\s*\/\s*([^)]+))?\s*\)/i);
  if (!match) return null;
  const parts = match[1].trim().split(/\s+/);
  if (parts.length < 3) return null;
  const L = parseCssNumber(parts[0]);
  const C = parseCssNumber(parts[1]);
  const H = parseHue(parts[2]);
  let alpha = 1;
  if (match[2]) {
    alpha = parseCssNumber(match[2]);
  }
  if (isNaN(L) || isNaN(C) || isNaN(H) || isNaN(alpha)) return null;
  return oklchToSrgb(L, C, H, alpha);
}

let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;

/**
 * Uses off-screen 1x1 canvas rasterization to let the browser compute the exact sRGB pixel
 * for complex CSS color expressions (like color-mix, lab, lch, oklab, oklch)
 */
function tryCanvasColorConvert(colorStr: string): string | null {
  try {
    if (typeof document === 'undefined') return null;
    if (!sharedCanvas) {
      sharedCanvas = document.createElement('canvas');
      sharedCanvas.width = 1;
      sharedCanvas.height = 1;
      sharedCtx = sharedCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (!sharedCtx) return null;

    sharedCtx.clearRect(0, 0, 1, 1);
    sharedCtx.fillStyle = '#000000';
    sharedCtx.fillStyle = colorStr;
    sharedCtx.fillRect(0, 0, 1, 1);

    const imgData = sharedCtx.getImageData(0, 0, 1, 1).data;
    const r = imgData[0];
    const g = imgData[1];
    const b = imgData[2];
    const a = imgData[3];

    if (a === 0 && colorStr.toLowerCase().includes('transparent')) {
      return 'rgba(0, 0, 0, 0)';
    }

    const alpha = Number((a / 255).toFixed(3));
    if (alpha < 1) {
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return `rgb(${r}, ${g}, ${b})`;
  } catch {
    return null;
  }
}

function findPaletteFallback(str: string): string {
  const lower = str.toLowerCase();
  for (const [key, hex] of Object.entries(PALETTE_SRGB_MAP)) {
    if (lower.includes(key)) {
      return hex;
    }
  }
  if (lower.includes('transparent')) return 'rgba(0, 0, 0, 0)';
  if (lower.includes('rose')) return '#f43f5e';
  if (lower.includes('orange')) return '#ea580c';
  if (lower.includes('emerald')) return '#059669';
  if (lower.includes('amber')) return '#d97706';
  if (lower.includes('slate')) return '#334155';
  if (lower.includes('blue')) return '#2563eb';
  return '#0f172a';
}

/**
 * Universal converter from modern CSS color functions to print-safe sRGB (rgb/rgba/hex)
 */
export function convertCssColorToStandardRgb(colorStr: string): string {
  if (
    !colorStr ||
    colorStr === 'transparent' ||
    colorStr === 'inherit' ||
    colorStr === 'initial' ||
    colorStr === 'none'
  ) {
    return colorStr;
  }
  if (
    !colorStr.includes('oklch') &&
    !colorStr.includes('oklab') &&
    !colorStr.includes('color-mix') &&
    !colorStr.includes('lab(') &&
    !colorStr.includes('lch(')
  ) {
    return colorStr;
  }

  // 1. Try browser canvas rasterization (handles color-mix, alpha, variables)
  const canvasConverted = tryCanvasColorConvert(colorStr);
  if (canvasConverted && !canvasConverted.includes('okl')) {
    return canvasConverted;
  }

  // 2. Try mathematical parser for oklch
  if (colorStr.includes('oklch')) {
    const parsed = parseAndConvertOklch(colorStr);
    if (parsed) return parsed;
  }

  // 3. Try mathematical parser for oklab
  if (colorStr.includes('oklab')) {
    const parsed = parseAndConvertOklab(colorStr);
    if (parsed) return parsed;
  }

  // 4. Palette fallback
  return findPaletteFallback(colorStr);
}

/**
 * Sanitizes any CSS property value (including shadows, gradients, and single colors)
 */
export function sanitizeStylePropertyValue(propertyName: string, value: string): string {
  if (!value || typeof value !== 'string') return value;

  const propLower = propertyName.toLowerCase();

  // If it's a shadow and contains okl/color-mix, remove it to eliminate html2canvas parser crashes
  if (propLower.includes('shadow')) {
    if (
      value.includes('oklch') ||
      value.includes('oklab') ||
      value.includes('color-mix') ||
      value.includes('lab(') ||
      value.includes('lch(')
    ) {
      return 'none';
    }
    return value;
  }

  if (
    !value.includes('oklch') &&
    !value.includes('oklab') &&
    !value.includes('color-mix') &&
    !value.includes('lab(') &&
    !value.includes('lch(')
  ) {
    return value;
  }

  const singleColorProps = [
    'color',
    'background-color',
    'backgroundcolor',
    'border-color',
    'bordercolor',
    'border-top-color',
    'bordertopcolor',
    'border-bottom-color',
    'borderbottomcolor',
    'border-left-color',
    'borderleftcolor',
    'border-right-color',
    'borderrightcolor',
    'outline-color',
    'outlinecolor',
    'text-decoration-color',
    'textdecorationcolor',
    'fill',
    'stroke',
    'stop-color',
    'stopcolor',
  ];

  if (singleColorProps.includes(propLower) || value.startsWith('okl') || value.startsWith('color-mix')) {
    return convertCssColorToStandardRgb(value);
  }

  // Compound property (e.g. background-image with linear-gradient): replace nested okl/color-mix functions
  const funcRegex = /(?:oklch|oklab|color-mix|lab|lch)\((?:[^()]+|\((?:[^()]+|\([^()]*\))*\))*\)/g;
  return value.replace(funcRegex, (match) => {
    return convertCssColorToStandardRgb(match);
  });
}

/**
 * Creates a Proxy wrapping a CSSStyleDeclaration to intercept property queries and return print-safe sRGB colors
 */
function createSanitizedStyleDeclaration(realStyle: CSSStyleDeclaration): CSSStyleDeclaration {
  return new Proxy(realStyle, {
    get(target, prop, _receiver) {
      if (prop === 'getPropertyValue') {
        return (propertyName: string): string => {
          const raw = target.getPropertyValue(propertyName);
          return sanitizeStylePropertyValue(propertyName, raw);
        };
      }
      // Pass target as receiver (NOT Proxy receiver) so native WebIDL getters execute with realStyle context,
      // preventing "TypeError: Illegal invocation"
      const val = Reflect.get(target, prop, target);
      if (typeof prop === 'string' && typeof val === 'string') {
        return sanitizeStylePropertyValue(prop, val);
      }
      if (typeof val === 'function') {
        return val.bind(target);
      }
      return val;
    },
  });
}

/**
 * Creates a Proxy wrapping window.getComputedStyle that preserves target function binding to window
 * and ensures Reflect.apply explicitly binds to the window context, avoiding "TypeError: Illegal invocation"
 */
function createGetComputedStyleProxy(targetWindow: Window): typeof window.getComputedStyle {
  const origFn = targetWindow.getComputedStyle;
  const boundTarget = origFn.bind(targetWindow);
  return new Proxy(boundTarget, {
    apply(target, _thisArg, args: [Element, (string | null | undefined)?]) {
      const real = Reflect.apply(target, targetWindow, args) as CSSStyleDeclaration;
      return createSanitizedStyleDeclaration(real);
    },
  });
}

/**
 * Traverses an element tree and replaces any computed or inline oklab/oklch colors with standard sRGB
 */
export function sanitizeDomElementColors(rootElement: Element | null): void {
  if (!rootElement) return;

  const colorProps = [
    'color',
    'background-color',
    'border-color',
    'border-top-color',
    'border-bottom-color',
    'border-left-color',
    'border-right-color',
    'outline-color',
    'text-decoration-color',
    'fill',
    'stroke',
  ];

  const win = rootElement.ownerDocument?.defaultView || window;
  const elements = [rootElement, ...Array.from(rootElement.querySelectorAll('*'))];

  for (const el of elements) {
    if (!(el instanceof HTMLElement || el instanceof SVGElement)) continue;

    if (el instanceof HTMLElement) {
      if (
        el.style.boxShadow &&
        (el.style.boxShadow.includes('okl') || el.style.boxShadow.includes('color-mix'))
      ) {
        el.style.boxShadow = 'none';
      }
    }

    try {
      const computed = win.getComputedStyle(el);
      for (const prop of colorProps) {
        const compVal = computed.getPropertyValue(prop);
        if (
          compVal &&
          (compVal.includes('oklch') ||
            compVal.includes('oklab') ||
            compVal.includes('color-mix') ||
            compVal.includes('lab(') ||
            compVal.includes('lch('))
        ) {
          const safeVal = convertCssColorToStandardRgb(compVal);
          el.style.setProperty(prop, safeVal, 'important');
        }
      }

      const computedShadow = computed.getPropertyValue('box-shadow');
      if (
        computedShadow &&
        (computedShadow.includes('oklch') ||
          computedShadow.includes('oklab') ||
          computedShadow.includes('color-mix'))
      ) {
        el.style.setProperty('box-shadow', 'none', 'important');
      }
    } catch {}
  }
}

function normalizeElementColorsForHtml2Canvas(clonedDoc: Document) {
  // 1. Hook cloned document's defaultView getComputedStyle if present
  try {
    if (clonedDoc.defaultView && clonedDoc.defaultView !== window) {
      clonedDoc.defaultView.getComputedStyle = createGetComputedStyleProxy(clonedDoc.defaultView);
    }
  } catch {}

  // 2. Inject universal sRGB stylesheet override into clonedDoc head to map Tailwind v4 variables to standard hex
  try {
    const styleEl = clonedDoc.createElement('style');
    styleEl.id = 'html2canvas-srgb-fallback-styles';
    styleEl.textContent = `
      :root, [data-theme], body, #customer-tax-invoice-printable, .printable-ticket-page, #export-print-preview-content, [data-pdf-staging-container="true"] {
        --color-slate-50: #f8fafc !important;
        --color-slate-100: #f1f5f9 !important;
        --color-slate-200: #e2e8f0 !important;
        --color-slate-300: #cbd5e1 !important;
        --color-slate-400: #94a3b8 !important;
        --color-slate-500: #64748b !important;
        --color-slate-600: #475569 !important;
        --color-slate-700: #334155 !important;
        --color-slate-800: #1e293b !important;
        --color-slate-900: #0f172a !important;
        --color-slate-950: #020617 !important;

        --color-orange-50: #fff7ed !important;
        --color-orange-100: #ffedd5 !important;
        --color-orange-200: #fed7aa !important;
        --color-orange-300: #fdba74 !important;
        --color-orange-400: #fb923c !important;
        --color-orange-500: #f97316 !important;
        --color-orange-600: #ea580c !important;
        --color-orange-700: #c2410c !important;
        --color-orange-800: #9a3412 !important;
        --color-orange-900: #7c2d12 !important;
        --color-orange-950: #431407 !important;

        --color-emerald-50: #ecfdf5 !important;
        --color-emerald-100: #d1fae5 !important;
        --color-emerald-200: #a7f3d0 !important;
        --color-emerald-300: #6ee7b7 !important;
        --color-emerald-400: #34d399 !important;
        --color-emerald-500: #10b981 !important;
        --color-emerald-600: #059669 !important;
        --color-emerald-700: #047857 !important;
        --color-emerald-800: #065f46 !important;
        --color-emerald-900: #064e3b !important;
        --color-emerald-950: #022c22 !important;

        --color-rose-50: #fff1f2 !important;
        --color-rose-100: #ffe4e6 !important;
        --color-rose-200: #fecdd3 !important;
        --color-rose-300: #fda4af !important;
        --color-rose-400: #fb7185 !important;
        --color-rose-500: #f43f5e !important;
        --color-rose-600: #e11d48 !important;
        --color-rose-700: #be123c !important;
        --color-rose-800: #9f1239 !important;
        --color-rose-900: #881337 !important;
        --color-rose-950: #4c0519 !important;

        --color-amber-50: #fffbeb !important;
        --color-amber-100: #fef3c7 !important;
        --color-amber-200: #fde68a !important;
        --color-amber-300: #fcd34d !important;
        --color-amber-400: #fbbf24 !important;
        --color-amber-500: #f59e0b !important;
        --color-amber-600: #d97706 !important;
        --color-amber-700: #b45309 !important;
        --color-amber-800: #92400e !important;
        --color-amber-900: #78350f !important;
        --color-amber-950: #451a03 !important;

        --color-neutral-50: #fafafa !important;
        --color-neutral-100: #f5f5f5 !important;
        --color-neutral-200: #e5e5e5 !important;
        --color-neutral-300: #d4d4d4 !important;
        --color-neutral-400: #a3a3a3 !important;
        --color-neutral-500: #737373 !important;
        --color-neutral-600: #525252 !important;
        --color-neutral-700: #404040 !important;
        --color-neutral-800: #262626 !important;
        --color-neutral-900: #171717 !important;
        --color-neutral-950: #0a0a0a !important;
      }

      #customer-tax-invoice-printable,
      .printable-ticket-page,
      #export-print-preview-content,
      [data-pdf-staging-container="true"] {
        background-color: #ffffff !important;
        color: #0f172a !important;
        opacity: 1 !important;
        visibility: visible !important;
        box-shadow: none !important;
      }

      [data-pdf-staging-container="true"] * {
        box-shadow: none !important;
        text-shadow: none !important;
      }
    `;
    clonedDoc.head?.appendChild(styleEl);
  } catch {}

  // 3. Directly sanitize all cloned elements
  sanitizeDomElementColors(clonedDoc.body);

  // 4. Ensure primary invoice and printable ticket containers have explicit white background
  const targets = clonedDoc.querySelectorAll<HTMLElement>(
    '#customer-tax-invoice-printable, .printable-ticket-page, #export-print-preview-content'
  );
  targets.forEach((target) => {
    target.style.backgroundColor = '#ffffff';
    target.style.color = '#0f172a';
    target.style.opacity = '1';
    target.style.visibility = 'visible';
    target.style.boxShadow = 'none';
  });
}

/**
 * Converts a base64 data URL to a Uint8Array in memory without relying on fetch()
 */
export function base64DataUrlToUint8Array(dataUrl: string): Uint8Array {
  const commaIndex = dataUrl.indexOf(',');
  const base64 = commaIndex !== -1 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Safely captures an HTML element (including off-screen, hidden, or nested elements)
 * by temporarily cloning the DOM node, mounting it into a fixed viewport container
 * (position: absolute/fixed, z-index: -1, opacity: 1, visible), running html2canvas,
 * and immediately destroying the clone and container.
 */
export async function captureElementWithStaging(
  element: HTMLElement | null,
  scale: number = 2,
  targetWidth: number = 960
): Promise<string> {
  const resolvedEl =
    element ||
    (document.getElementById('export-print-preview-content') as HTMLElement) ||
    (document.querySelector('.print-container') as HTMLElement) ||
    (document.getElementById('customer-tax-invoice-printable') as HTMLElement);

  if (!resolvedEl) {
    throw new Error('Element to capture is null or undefined.');
  }

  // 1. Create a dedicated staging container attached to document.body
  const stagingContainer = document.createElement('div');
  stagingContainer.setAttribute('data-pdf-staging-container', 'true');
  stagingContainer.style.position = 'absolute';
  stagingContainer.style.left = '0px';
  stagingContainer.style.top = '0px';
  stagingContainer.style.width = `${targetWidth}px`;
  stagingContainer.style.zIndex = '-1';
  stagingContainer.style.opacity = '1';
  stagingContainer.style.visibility = 'visible';
  stagingContainer.style.pointerEvents = 'none';
  stagingContainer.style.backgroundColor = '#ffffff';
  stagingContainer.style.transform = 'none';
  stagingContainer.style.overflow = 'visible';
  stagingContainer.style.boxSizing = 'border-box';
  stagingContainer.style.boxShadow = 'none';

  // 2. Clone the element
  const clone = resolvedEl.cloneNode(true) as HTMLElement;
  clone.style.display = 'block';
  clone.style.opacity = '1';
  clone.style.visibility = 'visible';
  clone.style.position = 'relative';
  clone.style.left = '0px';
  clone.style.top = '0px';
  clone.style.width = '100%';
  clone.style.maxWidth = '100%';
  clone.style.margin = '0';
  clone.style.transform = 'none';
  clone.style.backgroundColor = '#ffffff';
  clone.style.boxSizing = 'border-box';
  clone.style.boxShadow = 'none';

  // Remove any conflicting hide/opacity classes from the clone
  clone.classList.remove('opacity-0', 'pointer-events-none', 'hidden');

  // Pre-sanitize all colors and shadows in the clone before rendering
  sanitizeDomElementColors(clone);

  stagingContainer.appendChild(clone);
  document.body.appendChild(stagingContainer);

  try {
    // 3. Capture canvas from clone
    const dataUrl = await captureElementToPng(clone, scale);
    return dataUrl;
  } finally {
    // 4. Destroy the staging container and clone
    if (stagingContainer.parentNode) {
      stagingContainer.parentNode.removeChild(stagingContainer);
    }
  }
}

/**
 * Capture an HTML element as high-resolution PNG image data URL
 */
export async function captureElementToPng(element: HTMLElement, scale: number = 2): Promise<string> {
  const origGetComputedStyle = window.getComputedStyle;
  try {
    // Intercept window.getComputedStyle via createGetComputedStyleProxy so that
    // target function is bound to window and Reflect.apply explicitly binds to window context,
    // preventing "TypeError: Illegal invocation"
    window.getComputedStyle = createGetComputedStyleProxy(window);

    const canvas = await html2canvas(element, {
      scale,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: element.scrollWidth || 1024,
      onclone: (clonedDoc) => {
        normalizeElementColorsForHtml2Canvas(clonedDoc);
      },
    });
    return canvas.toDataURL('image/png', 0.95);
  } catch (err) {
    console.warn('Standard html2canvas capture failed, attempting resilient fallback mode:', err);
    const canvas = await html2canvas(element, {
      scale: 1.5,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: '#ffffff',
      onclone: (clonedDoc) => {
        normalizeElementColorsForHtml2Canvas(clonedDoc);
      },
    });
    return canvas.toDataURL('image/png', 0.95);
  } finally {
    window.getComputedStyle = origGetComputedStyle;
  }
}

/**
 * Generate a standalone PDF for the official Tax Invoice from its DOM element
 */
export async function generateInvoicePdfFromElement(
  element: HTMLElement,
  invoiceNumber: string
): Promise<Uint8Array> {
  const pngDataUrl = await captureElementWithStaging(element, 2, 960);
  const pdfDoc = await PDFDocument.create();

  // A4 dimensions in points: 595.28 x 841.89
  const a4Width = 595.28;
  const a4Height = 841.89;

  const imageBytes = base64DataUrlToUint8Array(pngDataUrl);
  const pngImage = await pdfDoc.embedPng(imageBytes);

  const imgDims = pngImage.scaleToFit(a4Width - 40, a4Height - 40);
  const page = pdfDoc.addPage([a4Width, a4Height]);

  // Center on A4
  const x = (a4Width - imgDims.width) / 2;
  const y = a4Height - imgDims.height - 20;

  page.drawImage(pngImage, {
    x,
    y,
    width: imgDims.width,
    height: imgDims.height,
  });

  return await pdfDoc.save();
}

/**
 * Generate a single-page PDF for an individual Scale Ticket / Waybill from a hidden rendered DOM or constructed canvas
 */
export async function generateScaleTicketPdfFromElement(
  element: HTMLElement
): Promise<Uint8Array> {
  const pngDataUrl = await captureElementWithStaging(element, 2, 960);
  const pdfDoc = await PDFDocument.create();

  const a4Width = 595.28;
  const a4Height = 841.89;

  const imageBytes = base64DataUrlToUint8Array(pngDataUrl);
  const pngImage = await pdfDoc.embedPng(imageBytes);

  const imgDims = pngImage.scaleToFit(a4Width - 40, a4Height - 40);
  const page = pdfDoc.addPage([a4Width, a4Height]);

  const x = (a4Width - imgDims.width) / 2;
  const y = a4Height - imgDims.height - 20;

  page.drawImage(pngImage, {
    x,
    y,
    width: imgDims.width,
    height: imgDims.height,
  });

  return await pdfDoc.save();
}

/**
 * Generate a Single Merged Multi-Page PDF:
 * - Page 1: Approved Tax Invoice with Official Letterhead, Signatures, Stamps, QR Code
 * - Pages 2..N: Supporting Documents & Scale Tickets for each trip included in the invoice
 */
export async function generateSingleMergedInvoicePdf(
  invoiceElement: HTMLElement,
  ticketElements: HTMLElement[] = [],
  invoice: CustomerInvoice,
  onProgress?: MergedPdfProgressCallback
): Promise<Blob> {
  const resolvedInvoiceEl =
    invoiceElement ||
    (document.getElementById('customer-tax-invoice-printable') as HTMLElement) ||
    (document.querySelector('.print-container') as HTMLElement) ||
    (document.getElementById('export-print-preview-content') as HTMLElement);

  if (!resolvedInvoiceEl) {
    throw new Error('Invoice container element is null or undefined.');
  }

  onProgress?.(10, 'جاري تهيئة محرك دمج المستندات الرسمي...');
  const mergedPdfDoc = await PDFDocument.create();

  // Set PDF Metadata
  mergedPdfDoc.setTitle(`Tax Invoice ${invoice.invoiceNumber} - Official Merged Document`);
  mergedPdfDoc.setAuthor('OxenGL Enterprise Cloud');
  mergedPdfDoc.setSubject(`Approved Tax Invoice and Supporting Scale Tickets for ${invoice.customerName}`);
  mergedPdfDoc.setKeywords(['Tax Invoice', 'ZATCA', 'Scale Tickets', 'OxenGL', invoice.invoiceNumber]);
  mergedPdfDoc.setCreationDate(new Date());

  const a4Width = 595.28;
  const a4Height = 841.89;

  // Step 1: Render Page 1 (Main Tax Invoice)
  onProgress?.(25, 'جاري معالجة وتضمين الفاتورة الضريبية المعتمدة (الصفحة 1)...');
  const invoicePng = await captureElementWithStaging(resolvedInvoiceEl, 2, 960);
  const invoiceImageBytes = base64DataUrlToUint8Array(invoicePng);
  const embeddedInvoiceImg = await mergedPdfDoc.embedPng(invoiceImageBytes);

  const invDims = embeddedInvoiceImg.scaleToFit(a4Width - 40, a4Height - 40);
  const page1 = mergedPdfDoc.addPage([a4Width, a4Height]);
  page1.drawImage(embeddedInvoiceImg, {
    x: (a4Width - invDims.width) / 2,
    y: a4Height - invDims.height - 20,
    width: invDims.width,
    height: invDims.height,
  });

  // Step 2: Render Supporting Documents & Scale Tickets as subsequent pages
  const validTicketElements = Array.isArray(ticketElements) ? ticketElements.filter(Boolean) : [];
  const totalTickets = validTicketElements.length;

  if (totalTickets === 0) {
    onProgress?.(85, 'لا توجد مرفقات إضافية محددة للدمج. جاري إنهاء ملف الفاتورة...');
  } else {
    for (let i = 0; i < totalTickets; i++) {
      const progressPercent = Math.round(30 + ((i + 1) / totalTickets) * 60);
      onProgress?.(
        progressPercent,
        `جاري دمج تذكرة الميزان والإثبات الداعم (${i + 1} من ${totalTickets})...`
      );

      const ticketEl = validTicketElements[i];
      if (!ticketEl) continue;

      try {
        const ticketPng = await captureElementWithStaging(ticketEl, 2, 960);
        const ticketBytes = base64DataUrlToUint8Array(ticketPng);
        const embeddedTicketImg = await mergedPdfDoc.embedPng(ticketBytes);

        const ticketDims = embeddedTicketImg.scaleToFit(a4Width - 40, a4Height - 40);
        const ticketPage = mergedPdfDoc.addPage([a4Width, a4Height]);
        ticketPage.drawImage(embeddedTicketImg, {
          x: (a4Width - ticketDims.width) / 2,
          y: a4Height - ticketDims.height - 20,
          width: ticketDims.width,
          height: ticketDims.height,
        });
      } catch (err) {
        console.warn(`Could not render ticket page ${i + 1}:`, err);
      }
    }
  }

  onProgress?.(95, 'جاري حفظ وتوقيع ملف PDF النهائي المدمج...');
  const mergedPdfBytes = await mergedPdfDoc.save();
  onProgress?.(100, 'تم إنشاء ملف PDF المدمج بنجاح!');

  return new Blob([mergedPdfBytes], { type: 'application/pdf' });
}

/**
 * Generate a ZIP archive containing:
 * 1. Main Official Tax Invoice PDF
 * 2. Supporting_Documents/ folder containing separate Scale Ticket PDFs
 */
export async function generateInvoiceZipArchive(
  invoiceElement: HTMLElement,
  ticketElements: { element: HTMLElement; trip: OperationRecord }[] = [],
  invoice: CustomerInvoice,
  onProgress?: MergedPdfProgressCallback
): Promise<Blob> {
  if (!invoiceElement) {
    throw new Error('Invoice container element is null or undefined.');
  }

  onProgress?.(10, 'جاري إنشاء حزمة الأرشيف المضغوط (ZIP)...');
  const zip = new JSZip();

  // 1. Add Main Tax Invoice PDF
  onProgress?.(25, 'جاري توليد ملف الفاتورة الضريبية المنفصل...');
  const invoicePdfBytes = await generateInvoicePdfFromElement(
    invoiceElement,
    invoice.invoiceNumber
  );
  zip.file(`${invoice.invoiceNumber}_Official_Tax_Invoice.pdf`, invoicePdfBytes);

  // 2. Add Supporting Scale Tickets in a sub-folder if any
  const validItems = Array.isArray(ticketElements)
    ? ticketElements.filter((item) => item && item.element && item.trip)
    : [];
  const total = validItems.length;

  if (total > 0) {
    const supportingFolder = zip.folder('Supporting_Scale_Tickets_and_Waybills');

    for (let i = 0; i < total; i++) {
      const progressPercent = Math.round(30 + ((i + 1) / total) * 60);
      const item = validItems[i];
      onProgress?.(
        progressPercent,
        `جاري توليد ملف PDF لتذكرة الميزان ${item.trip.scale_ticket_no} (${i + 1}/${total})...`
      );

      try {
        const ticketPdfBytes = await generateScaleTicketPdfFromElement(item.element);
        const cleanTicketNo = (item.trip.scale_ticket_no || `ticket_${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_');
        const cleanTruck = (item.trip.truck_no || 'truck').replace(/[^a-zA-Z0-9_-]/g, '_');
        supportingFolder?.file(
          `${cleanTicketNo}_Truck_${cleanTruck}_${item.trip.loading_date || 'date'}.pdf`,
          ticketPdfBytes
        );
      } catch (err) {
        console.warn(`Failed to add ticket ${item.trip?.scale_ticket_no} to zip:`, err);
      }
    }
  }

  onProgress?.(95, 'جاري ضغط الحزمة وإنشاء ملف ZIP النهائي...');
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  onProgress?.(100, 'تم تجهيز أرشيف ZIP بنجاح!');
  return zipBlob;
}
