/**
 * Tenant Monogram & Dynamic Branding Utility
 * File: frontend/src/utils/monogram.ts
 *
 * Implements Phase 3 dynamic tenant branding:
 * - Extracts 1-2 character monograms from company / workspace names
 *   (e.g., "Alwehda Alarabia" -> "AA", "Oxen Heavy" -> "OH", "Oxen" -> "OX")
 * - Multilingual support (Arabic & Latin grapheme clusters)
 * - Harmonized color palettes and gradient generation for circular badges
 */

/**
 * Extracts 1-2 uppercase characters from a tenant or company name.
 * 
 * Rules:
 * 1. Multi-word names: first letter of first word + first letter of second word (e.g. "Alwehda Alarabia" -> "AA")
 * 2. Single-word names: first 2 characters if length >= 2 (e.g. "Oxen" -> "OX")
 * 3. Single-character names: 1 character (e.g. "O" -> "O")
 * 4. Strips leading non-alphanumeric punctuation/symbols
 * 5. Supports Arabic unicode graphemes (e.g. "الوحدة العربية" -> "وا")
 *
 * @param name Tenant company name or workspace slug
 * @param fallback Fallback string if name is invalid or empty (defaults to 'OX')
 * @returns 1-2 uppercase characters
 */
export function extractTenantMonogram(name?: string | null, fallback = 'OX'): string {
  if (!name || typeof name !== 'string') {
    return fallback;
  }

  // Remove leading/trailing whitespace and leading non-word symbols
  const clean = name.trim().replace(/^[^a-zA-Z0-9\u0600-\u06FF]+/, '');
  if (!clean) {
    return fallback;
  }

  // Split on whitespace, underscores, hyphens, or dots
  const words = clean.split(/[\s_\-.]+/).filter((w) => w.length > 0);

  if (words.length >= 2) {
    const firstChar = Array.from(words[0])[0] || '';
    const secondChar = Array.from(words[1])[0] || '';
    const monogram = `${firstChar}${secondChar}`.toUpperCase();
    return monogram || fallback;
  }

  if (words.length === 1) {
    const chars = Array.from(words[0]);
    if (chars.length >= 2) {
      return `${chars[0]}${chars[1]}`.toUpperCase();
    }
    if (chars.length === 1) {
      return chars[0].toUpperCase();
    }
  }

  return fallback;
}

/**
 * Generates an elevated gradient style string for tenant monogram circular badges.
 *
 * @param primaryColor Hex color code (defaults to corporate flame '#F05627')
 * @param darkStop Hex color code for dark depth (defaults to slate-900 '#0f172a')
 */
export function getTenantAvatarGradient(primaryColor = '#F05627', darkStop = '#0f172a'): string {
  return `linear-gradient(135deg, ${primaryColor} 0%, ${darkStop} 100%)`;
}
