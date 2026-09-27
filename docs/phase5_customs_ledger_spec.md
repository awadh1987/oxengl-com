# OxenGL Enterprise Platform Specification Sheet
## Phase 5: Cross-Border Customs Manifest Syncing & Electronic Ledger Reporting

---

## 1. Architectural Objective
Phase 5 transforms the platform into an internationally compliant logistics engine. It establishes automated cryptographic XML ledger reporting matching ZATCA Stage-2 specifications, implements customs clearing manifest sync pipelines, and locks down financial audit trails via immutable SHA-256 block-chaining techniques.

---

## 2. Database Topology & Cryptographic Ledger Schemas

### A. Immutable Electronic Ledger (`electronic_ledger_blocks`)
To prevent post-facto financial manipulation and satisfy international tax audits, journal entries are sequentially chained together using SHA-256 cryptographic hashes.

```sql
CREATE TABLE IF NOT EXISTS electronic_ledger_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES res_companies(id) ON DELETE CASCADE,
    journal_entry_id UUID NOT NULL,
    block_index BIGINT NOT NULL,
    payload_json JSONB NOT NULL,
    previous_hash VARCHAR(64) NOT NULL,
    current_hash VARCHAR(64) NOT NULL,
    digitally_signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_chain_sequence 
ON electronic_ledger_blocks (tenant_id, block_index DESC);
```

### B. Cross-Border Customs Manifests (`customs_manifests`)
Tracks unified international clearances, managing harmonized tariff codes (HS Codes), border checkpoint ports, and declarations status variables.

```sql
CREATE TABLE IF NOT EXISTS customs_manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES res_companies(id) ON DELETE CASCADE,
    manifest_number VARCHAR(100) UNIQUE NOT NULL,
    declaration_type VARCHAR(50) NOT NULL DEFAULT 'IMPORT',
    border_port_name VARCHAR(150) NOT NULL, -- e.g., King Khalid International Airport, Batha Border
    hs_codes_json JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of tracked Harmonized System tariff codes
    clearance_status VARCHAR(50) NOT NULL DEFAULT 'PENDING_DOCUMENTATION',
    zatca_compliance_status VARCHAR(50) NOT NULL DEFAULT 'NOT_SUBMITTED',
    cryptographic_uuid UUID UNIQUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 3. Backend Compliance Services (`backend/app/services/compliance_service.py`)

### A. ZATCA Stage-2 Cryptographic XML Generation
Implements cryptographic invoice wrapping. It hashes invoice lines, injects your company's X.509 private certificate signature, compiles compliance-compliant XML payloads, and relays data blocks directly to regulatory API sandboxes.

### B. SHA-256 Blockchain Ledger Chaining
Intercepts the Phase 2 balanced journal post triggers. It pulls the latest block's hash, packages the new transaction lines, hashes them sequentially, and writes a tamper-proof record to `electronic_ledger_blocks`:
```python
def mint_ledger_block(session, tenant_id, journal_entry_data):
    # Fetch previous block hash mapping
    last_block = session.query(LedgerBlock).filter_by(tenant_id=tenant_id).order_by(LedgerBlock.block_index.desc()).first()
    prev_hash = last_block.current_hash if last_block else "0" * 64
    
    # Compile text vector block and compute hash
    block_string = f"{prev_hash}{json.dumps(journal_entry_data, sort_keys=True)}"
    curr_hash = hashlib.sha256(block_string.encode('utf-8')).hexdigest()
    return curr_hash
```

---

## 4. Frontend Customs Clearance & Reporting UI (`CustomsClearanceView.tsx`)

### A. Visual Compliance Indicators
Builds an electronic compliance interface displaying real-time cryptographic signature chains, clearance timelines, and ZATCA compliance status matrices.
- **ZATCA Certified State:** Displays a green certified checkmark badge (`#10b981`) confirming cryptographic acceptance.
- **Ledger Audit State:** Renders an active blockchain chain visualization where hovering over nodes displays the specific SHA-256 block linkage hash.

---

## 5. Verification & Strict Build Policy
1. **Zero Type Mismatches:** `cd frontend && npx tsc --noEmit` must exit with code `0`.
2. **Immutable Ledger Invariance:** Unit tests must confirm that attempting to alter a past ledger payload fails or breaks the hash chain mapping.
3. **Monolith Integrity:** `python3 scripts/migration_sanity_check.py` must return 0 blocking path defects.

# Role & Context
You are a Principal Software SRE, Cryptographic Compliance Engineer, and Full-Stack Developer. We are executing the final milestone: Phase 5 (Cross-Border Customs Manifest Syncing & Electronic Ledger Reporting).

# Objective
Read, parse, and systematically implement the system specification sheet located at `generated/phase5_customs_ledger_spec.md`.

# Actionable Steps (Execute via terminal, file writing, and database tools)

1. **Deploy Relational Compliance Migration Tables:**
   Create an Alembic migration script to provision the `electronic_ledger_blocks` and `customs_manifests` tables exactly as specified in the document, ensuring strict primary key allocations and indexes are built.

2. **Code the SHA-256 Ledger Chaining Service:**
   Create `backend/app/services/compliance_service.py`. Write the cryptographic chaining logic that captures balanced journal entries, reads the previous block's SHA-256 hash, computes the new block hash, and saves the immutable block structure.

3. **Deploy the Customs Clearance Control Dashboard View:**
   Create a new view at `frontend/src/views/CustomsClearanceView.tsx` and integrate its path routing cleanly inside `frontend/src/App.tsx`. Build out the data list containers mapping customs manifest status levels and displaying interactive blockchain SHA-256 hash chains.

4. **Execute Full-Stack Structural Compilation Checks:**
   Validate type alignment across your new tables and React views:
   `cd frontend && npm run build && cd .. && npx tsc --noEmit && python3 scripts/migration_sanity_check.py`

5. **Distribute Production Chunks & Reload Mesh Gateways:**
   `sudo cp -r frontend/dist/* /var/www/oxengl/dist/ && sudo systemctl reload nginx && sudo systemctl restart oxengl.service`

# Output Requirements
Provide a complete summary execution log confirming that your Alembic database migration succeeded and that the final full-stack Vite compilation pass exits with code 0.
