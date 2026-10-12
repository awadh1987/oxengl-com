// OxenGL ERP — Reusable Cleaning Macros for Dataform
// =========================================================
// CommonJS module for BigQuery SQL transformations across all ERP domains.

/**
 * Validates UUID v4 string format, returns NULL for invalid UUIDs.
 */
function clean_uuid(col) {
  return `CASE
    WHEN REGEXP_CONTAINS(CAST(${col} AS STRING), r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    THEN CAST(${col} AS STRING)
    ELSE NULL
  END`;
}

/**
 * Trims whitespace and nullifies empty strings.
 */
function clean_string(col) {
  return `NULLIF(TRIM(CAST(${col} AS STRING)), '')`;
}

/**
 * Safe numeric cast with BigQuery NUMERIC type.
 */
function clean_decimal(col) {
  return `SAFE_CAST(${col} AS NUMERIC)`;
}

/**
 * Normalizes multi-format PostgreSQL timestamps into BigQuery TIMESTAMP.
 */
function clean_timestamp(col) {
  return `COALESCE(
    SAFE.PARSE_TIMESTAMP('%Y-%m-%dT%H:%M:%E*S%Ez', CAST(${col} AS STRING)),
    SAFE.PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%E*S%Ez', CAST(${col} AS STRING)),
    SAFE.PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%E*S', CAST(${col} AS STRING)),
    SAFE.PARSE_TIMESTAMP('%Y-%m-%dT%H:%M:%E*S', CAST(${col} AS STRING)),
    SAFE.PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S', CAST(${col} AS STRING)),
    SAFE.PARSE_TIMESTAMP('%Y-%m-%d', CAST(${col} AS STRING))
  )`;
}

/**
 * Safe date parsing for ISO and standard date string formats.
 */
function clean_date(col) {
  return `COALESCE(
    SAFE.PARSE_DATE('%Y-%m-%d', CAST(${col} AS STRING)),
    SAFE.PARSE_DATE('%d/%m/%Y', CAST(${col} AS STRING)),
    SAFE.PARSE_DATE('%m/%d/%Y', CAST(${col} AS STRING))
  )`;
}

/**
 * Standard RFC-compliant email address validation.
 */
function clean_email(col) {
  return `CASE
    WHEN REGEXP_CONTAINS(LOWER(TRIM(CAST(${col} AS STRING))), r'^[a-z0-9._%+\\-]+@[a-z0-9.\\-]+\\.[a-z]{2,}$')
    THEN LOWER(TRIM(CAST(${col} AS STRING)))
    ELSE NULL
  END`;
}

/**
 * Saudi phone normalization (+966 standard format).
 */
function clean_phone_sa(col) {
  return `CASE
    WHEN ${col} IS NULL THEN NULL
    WHEN REGEXP_CONTAINS(TRIM(CAST(${col} AS STRING)), r'^\\+966') THEN TRIM(CAST(${col} AS STRING))
    WHEN REGEXP_CONTAINS(TRIM(CAST(${col} AS STRING)), r'^05') THEN CONCAT('+966', SUBSTR(TRIM(CAST(${col} AS STRING)), 2))
    WHEN REGEXP_CONTAINS(TRIM(CAST(${col} AS STRING)), r'^966') THEN CONCAT('+', TRIM(CAST(${col} AS STRING)))
    ELSE TRIM(CAST(${col} AS STRING))
  END`;
}

/**
 * Normalizes ZATCA e-invoicing clearance status.
 */
function clean_zatca_status(col) {
  return `CASE
    WHEN UPPER(TRIM(CAST(${col} AS STRING))) IN ('CLEARED', 'CLEAR') THEN 'CLEARED'
    WHEN UPPER(TRIM(CAST(${col} AS STRING))) IN ('REPORTED', 'REPORT') THEN 'REPORTED'
    WHEN UPPER(TRIM(CAST(${col} AS STRING))) IN ('PENDING', 'DRAFT', 'SUBMITTED') THEN 'PENDING'
    WHEN UPPER(TRIM(CAST(${col} AS STRING))) IN ('REJECTED', 'FAILED', 'ERROR') THEN 'REJECTED'
    ELSE UPPER(TRIM(CAST(${col} AS STRING)))
  END`;
}

/**
 * GPS coordinate validation (latitude between -90 and 90).
 */
function clean_latitude(col) {
  return `CASE
    WHEN SAFE_CAST(${col} AS FLOAT64) BETWEEN -90 AND 90
    THEN SAFE_CAST(${col} AS FLOAT64)
    ELSE NULL
  END`;
}

/**
 * GPS coordinate validation (longitude between -180 and 180).
 */
function clean_longitude(col) {
  return `CASE
    WHEN SAFE_CAST(${col} AS FLOAT64) BETWEEN -180 AND 180
    THEN SAFE_CAST(${col} AS FLOAT64)
    ELSE NULL
  END`;
}

/**
 * Positive-only numeric validation (quantities, unit prices).
 */
function clean_positive_numeric(col) {
  return `CASE
    WHEN SAFE_CAST(${col} AS NUMERIC) > 0 THEN SAFE_CAST(${col} AS NUMERIC)
    ELSE NULL
  END`;
}

/**
 * Non-negative numeric validation (allows zero).
 */
function clean_nonneg_numeric(col) {
  return `CASE
    WHEN SAFE_CAST(${col} AS NUMERIC) >= 0 THEN SAFE_CAST(${col} AS NUMERIC)
    ELSE NULL
  END`;
}

/**
 * Saudi VAT calculation validation (15% standard with strict <= 0.01 SAR tolerance).
 */
function validate_vat_15(subtotal_col, vat_col) {
  return `CASE
    WHEN ABS(SAFE_CAST(${vat_col} AS NUMERIC) - ROUND(SAFE_CAST(${subtotal_col} AS NUMERIC) * 0.15, 2)) <= 0.01
    THEN 'VALID'
    ELSE 'VAT_MISMATCH'
  END`;
}

/**
 * Safe JSON parsing.
 */
function clean_json(col) {
  return `SAFE.PARSE_JSON(CAST(${col} AS STRING))`;
}

module.exports = {
  clean_uuid,
  clean_string,
  clean_decimal,
  clean_timestamp,
  clean_date,
  clean_email,
  clean_phone_sa,
  clean_zatca_status,
  clean_latitude,
  clean_longitude,
  clean_positive_numeric,
  clean_nonneg_numeric,
  validate_vat_15,
  clean_json,
};
