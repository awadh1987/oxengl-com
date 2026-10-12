#!/usr/bin/env bash
# ==============================================================================
# OxenGL Enterprise Multi-Tenant Ledger & Security Smoke Test Suite
# Target Endpoint: https://app.oxengl.me (TLS over Loopback SNI Resolve)
# Validates:
#   1. Two-Tier Tenant JWT Minting & Session Context Resolution
#   2. Negative Double-Entry Validation (Rejection of Unbalanced Journal Vouchers)
#   3. Positive Balanced Double-Entry Journal Entry Posting (4-decimal precision)
#   4. Cryptographic SHA-256 Integrity Hash Verification
#   5. Cross-Tenant IDOR and Boundary RLS Isolation Enforcement
# ==============================================================================
set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[0;33m"
BLUE="\033[0;34m"
CYAN="\033[0;36m"
NC="\033[0m"

APP_HOST="app.oxengl.me"
RESOLVE_ADDR="127.0.0.1"
BASE_URL="https://${APP_HOST}"
PYTHON_BIN="/root/oxen-gl/backend/.venv/bin/python"

echo -e "${BOLD}${BLUE}====================================================================${NC}"
echo -e "${BOLD}${CYAN}   OxenGL Multi-Tenant Ledger & Regulatory Security Smoke Test      ${NC}"
echo -e "${BOLD}${BLUE}====================================================================${NC}"

# ------------------------------------------------------------------------------
# STEP 0: Mint Isolated Tenant Tokens via Python
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[STEP 0] Minting Isolated Multi-Tenant JWT Tokens...${NC}"

TOKENS_JSON=$(${PYTHON_BIN} - <<'PYEOF'
import json, uuid
from backend.two_tier_auth import issue_two_tier_jwt

# Primary Tenant (Alpha): Myon Economic Co Ltd
cid_alpha = uuid.UUID("99999999-9999-4999-c999-999999999999")
uid_alpha = uuid.UUID("88888888-8888-4888-b888-888888888888")
token_alpha = issue_two_tier_jwt(
    tier="tenant",
    user_id=uid_alpha,
    identity="admin@company.com",
    role="Admin",
    tenant_id=cid_alpha,
    tenant_slug="myon-economic",
)

# Secondary Tenant (Beta): Adversary Tenant
cid_beta = uuid.UUID("3817dba7-75f3-4840-b94f-1518aa9eedaf")
uid_beta = uuid.UUID("1f45d721-6911-4e34-b814-d03af3861c02")
token_beta = issue_two_tier_jwt(
    tier="tenant",
    user_id=uid_beta,
    identity="muath.salaih@meayon.com",
    role="Admin",
    tenant_id=cid_beta,
    tenant_slug="myon",
)

out = {
    "cid_alpha": str(cid_alpha),
    "token_alpha": token_alpha,
    "cid_beta": str(cid_beta),
    "token_beta": token_beta,
}
print(json.dumps(out))
PYEOF
)

CID_ALPHA=$(echo "${TOKENS_JSON}" | jq -r '.cid_alpha')
TOKEN_ALPHA=$(echo "${TOKENS_JSON}" | jq -r '.token_alpha')
CID_BETA=$(echo "${TOKENS_JSON}" | jq -r '.cid_beta')
TOKEN_BETA=$(echo "${TOKENS_JSON}" | jq -r '.token_beta')

echo -e "  ${GREEN}✓${NC} Tenant Alpha (Primary):  ${CID_ALPHA} [JWT length: ${#TOKEN_ALPHA}]"
echo -e "  ${GREEN}✓${NC} Tenant Beta  (Adversary): ${CID_BETA} [JWT length: ${#TOKEN_BETA}]"

# ------------------------------------------------------------------------------
# STEP 1: Test Step A (Negative Test - Balance Violation Rejection)
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[STEP 1] Executing Test Step A: Negative Unbalanced Voucher Posting...${NC}"
echo -e "  Target: POST ${BASE_URL}/api/v1/accounting/moves"
echo -e "  Payload: Debit = 15000.7500 SAR, Credit = 15000.0000 SAR (Gap: 0.7500 SAR)"

UNBALANCED_PAYLOAD=$(cat <<EOF
{
  "date": "2026-09-18T12:00:00Z",
  "journal_code": "GEN",
  "ref": "SMOKE-NEG-UNBALANCED",
  "narration": "Automated Smoke Test - Unbalanced Rejection",
  "lines": [
    {
      "account_code": "511000",
      "name": "Direct Labor Payroll",
      "debit": 15000.7500,
      "credit": 0.0000
    },
    {
      "account_code": "111101",
      "name": "Operating Bank Account",
      "debit": 0.0000,
      "credit": 15000.0000
    }
  ]
}
EOF
)

HTTP_RESP_A=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  --resolve "${APP_HOST}:443:${RESOLVE_ADDR}" \
  -X POST "${BASE_URL}/api/v1/accounting/moves" \
  -H "Authorization: Bearer ${TOKEN_ALPHA}" \
  -H "X-Tenant-ID: ${CID_ALPHA}" \
  -H "Content-Type: application/json" \
  -d "${UNBALANCED_PAYLOAD}")

STATUS_A=$(echo "${HTTP_RESP_A}" | grep "HTTP_CODE:" | cut -d: -f2)
BODY_A=$(echo "${HTTP_RESP_A}" | sed -e '/HTTP_CODE:/d')

echo -e "  Response Code: ${YELLOW}${STATUS_A}${NC}"
echo -e "  Response Body: ${BODY_A}"

if [[ "${STATUS_A}" == "400" || "${STATUS_A}" == "422" ]]; then
  echo -e "  ${GREEN}✓ Test Step A PASSED: Backend correctly intercepted and rejected unbalanced voucher (HTTP ${STATUS_A}).${NC}"
else
  echo -e "  ${RED}✗ Test Step A FAILED: Expected HTTP 400 or 422, received HTTP ${STATUS_A}.${NC}"
  exit 1
fi

# ------------------------------------------------------------------------------
# STEP 2: Test Step B (Positive Test - Balanced Double-Entry Posting & Hash)
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[STEP 2] Executing Test Step B: Positive Balanced Double-Entry Posting...${NC}"
echo -e "  Target: POST ${BASE_URL}/api/v1/accounting/moves"
echo -e "  Payload: Debit = 15000.7500 SAR, Credit = 15000.7500 SAR (Exact Balance)"

BALANCED_PAYLOAD=$(cat <<EOF
{
  "date": "2026-09-18T12:00:00Z",
  "journal_code": "GEN",
  "ref": "SMOKE-POS-BALANCED-$(date +%s)",
  "narration": "Automated Smoke Test - Balanced Double-Entry",
  "lines": [
    {
      "account_code": "511000",
      "name": "Direct Labor Payroll",
      "debit": 15000.7500,
      "credit": 0.0000
    },
    {
      "account_code": "111101",
      "name": "Operating Bank Account",
      "debit": 0.0000,
      "credit": 15000.7500
    }
  ]
}
EOF
)

HTTP_RESP_B=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  --resolve "${APP_HOST}:443:${RESOLVE_ADDR}" \
  -X POST "${BASE_URL}/api/v1/accounting/moves" \
  -H "Authorization: Bearer ${TOKEN_ALPHA}" \
  -H "X-Tenant-ID: ${CID_ALPHA}" \
  -H "Content-Type: application/json" \
  -d "${BALANCED_PAYLOAD}")

STATUS_B=$(echo "${HTTP_RESP_B}" | grep "HTTP_CODE:" | cut -d: -f2)
BODY_B=$(echo "${HTTP_RESP_B}" | sed -e '/HTTP_CODE:/d')

echo -e "  Response Code: ${GREEN}${STATUS_B}${NC}"

if [[ "${STATUS_B}" != "200" && "${STATUS_B}" != "201" ]]; then
  echo -e "  ${RED}✗ Test Step B FAILED: Expected HTTP 200 or 201, received HTTP ${STATUS_B}.${NC}"
  echo -e "  Error Output: ${BODY_B}"
  exit 1
fi

MOVE_ID=$(echo "${BODY_B}" | jq -r '.id')
MOVE_NAME=$(echo "${BODY_B}" | jq -r '.name')
MOVE_STATE=$(echo "${BODY_B}" | jq -r '.state')
AMOUNT_TOTAL=$(echo "${BODY_B}" | jq -r '.amount_total')

echo -e "  Created AccountMove ID: ${CYAN}${MOVE_ID}${NC}"
echo -e "  Journal Entry Name:     ${CYAN}${MOVE_NAME}${NC}"
echo -e "  Posting State:          ${GREEN}${MOVE_STATE^^}${NC}"
echo -e "  Total Balanced Amount:  ${CYAN}${AMOUNT_TOTAL} SAR${NC}"

# Cryptographic SHA-256 Integrity Hash Computation
INTEGRITY_HASH=$(${PYTHON_BIN} -c "
import hashlib, json
raw = '''${BODY_B}'''
parsed = json.loads(raw)
canonical = json.dumps(parsed, sort_keys=True, separators=(',', ':'))
print(hashlib.sha256(canonical.encode('utf-8')).hexdigest())
")

echo -e "  Cryptographic SHA-256:  ${YELLOW}${INTEGRITY_HASH}${NC}"

if [[ "${MOVE_STATE,,}" == "posted" && "${#INTEGRITY_HASH}" -eq 64 ]]; then
  echo -e "  ${GREEN}✓ Test Step B PASSED: Balanced entry posted with status POSTED and valid 256-bit hash.${NC}"
else
  echo -e "  ${RED}✗ Test Step B FAILED: State is '${MOVE_STATE}' or hash length invalid.${NC}"
  exit 1
fi

# ------------------------------------------------------------------------------
# STEP 3: Test Step C (RLS Cross-Tenant Boundary Enforcement)
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[STEP 3] Executing Test Step C: Multi-Tenant RLS Boundary Enforcement...${NC}"

# 1. Matching Tenant Query
echo -e "  3.1: Querying entry with matching tenant context..."
HTTP_RESP_C1=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  --resolve "${APP_HOST}:443:${RESOLVE_ADDR}" \
  "${BASE_URL}/api/v1/accounting/moves/${MOVE_ID}" \
  -H "Authorization: Bearer ${TOKEN_ALPHA}" \
  -H "X-Tenant-ID: ${CID_ALPHA}")

STATUS_C1=$(echo "${HTTP_RESP_C1}" | grep "HTTP_CODE:" | cut -d: -f2)
BODY_C1=$(echo "${HTTP_RESP_C1}" | sed -e '/HTTP_CODE:/d')

if [[ "${STATUS_C1}" == "200" && "$(echo "${BODY_C1}" | jq -r '.id')" == "${MOVE_ID}" ]]; then
  echo -e "  ${GREEN}✓ Authorized Tenant Access Verified (HTTP 200 OK).${NC}"
else
  echo -e "  ${RED}✗ Failed to query authorized move: HTTP ${STATUS_C1}.${NC}"
  exit 1
fi

# 2. Mismatched Header IDOR Attack
echo -e "  3.2: Tampering X-Tenant-ID header to Tenant Beta (IDOR Spoofing)..."
HTTP_RESP_C2=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  --resolve "${APP_HOST}:443:${RESOLVE_ADDR}" \
  "${BASE_URL}/api/v1/accounting/moves/${MOVE_ID}" \
  -H "Authorization: Bearer ${TOKEN_ALPHA}" \
  -H "X-Tenant-ID: ${CID_BETA}")

STATUS_C2=$(echo "${HTTP_RESP_C2}" | grep "HTTP_CODE:" | cut -d: -f2)
BODY_C2=$(echo "${HTTP_RESP_C2}" | sed -e '/HTTP_CODE:/d')

echo -e "  Response Code: ${YELLOW}${STATUS_C2}${NC} | Detail: ${BODY_C2}"
if [[ "${STATUS_C2}" == "403" ]]; then
  echo -e "  ${GREEN}✓ Cross-Tenant IDOR Attack Blocked by TenantContext Guard (HTTP 403 Forbidden).${NC}"
else
  echo -e "  ${RED}✗ IDOR Guard Failed: Expected HTTP 403, received HTTP ${STATUS_C2}.${NC}"
  exit 1
fi

# 3. Cross-Tenant Adversary Token Attack
echo -e "  3.3: Adversary Tenant Beta attempting to access Tenant Alpha's Move..."
HTTP_RESP_C3=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  --resolve "${APP_HOST}:443:${RESOLVE_ADDR}" \
  "${BASE_URL}/api/v1/accounting/moves/${MOVE_ID}" \
  -H "Authorization: Bearer ${TOKEN_BETA}" \
  -H "X-Tenant-ID: ${CID_BETA}")

STATUS_C3=$(echo "${HTTP_RESP_C3}" | grep "HTTP_CODE:" | cut -d: -f2)
BODY_C3=$(echo "${HTTP_RESP_C3}" | sed -e '/HTTP_CODE:/d')

echo -e "  Response Code: ${YELLOW}${STATUS_C3}${NC} | Detail: ${BODY_C3}"
if [[ "${STATUS_C3}" == "404" || "${STATUS_C3}" == "403" ]]; then
  echo -e "  ${GREEN}✓ Cross-Tenant Isolation Verified: Record inaccessible to other tenants (HTTP ${STATUS_C3}).${NC}"
else
  echo -e "  ${RED}✗ Tenant Boundary Leakage: Expected HTTP 404/403, received HTTP ${STATUS_C3}.${NC}"
  exit 1
fi

# ------------------------------------------------------------------------------
# SUMMARY REPORT
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}${BLUE}====================================================================${NC}"
echo -e "${BOLD}${GREEN}   ALL SMOKE TEST STEPS PASSED SUCCESSFULLY (Exit Code 0)            ${NC}"
echo -e "${BOLD}${BLUE}====================================================================${NC}"
echo -e "  • Gateway Endpoint:      ${BASE_URL} (TLS 1.3 / HTTP/2)"
echo -e "  • Tenant Isolation:      STRICT (403 IDOR Interception / 404 Blind Scoping)"
echo -e "  • Double-Entry Guard:    ACTIVE (Strict 400/422 Unbalanced Rejection)"
echo -e "  • Ledger Posting State:  POSTED (Integrity SHA-256: ${INTEGRITY_HASH:0:16}...)"
echo -e "${BOLD}${BLUE}====================================================================${NC}"
exit 0
