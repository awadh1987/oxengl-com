# Monolith SaaS Infrastructure Deployment & Security Hardening Workbook
**System Target**: Multi-Tenant Isolated Workspace Platform (OxenGL Engine)
**Context Blueprint Reference Source**: `backend/app/domains/auth/models.py`

---

## 🛠️ Phase 1: Core System Audit Trails Database Schema
Generate the relational table layers required to record platform administrative interventions, data purges, and automated system alerts.

### Action Steps (Run via Terminal Tool)
1. Write or verify the `TenantAuditLog` SQLAlchemy data model inside your backend domain models schema file:
```python
import datetime
from sqlalchemy import Column, String, DateTime, Text, ForeignKey
from backend.app.database import Base

class TenantAuditLog(Base):
    __tablename__ = "tenant_audit_logs"
    
    id = Column(String(36), primary_key=True, index=True)
    tenant_id = Column(String(36), ForeignKey("res_companies.id", ondelete="SET NULL"), nullable=True)
    action_type = Column(String(50), nullable=False, index=True)
    actor = Column(String(100), default="CRON_SYSTEM_DAEMON")
    details = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
```
2. Generate a fresh Alembic head revision tracking file at `backend/alembic/versions/202609150145_create_tenant_audit_logs.py`:
```python
"""create tenant audit logs table
Revision ID: 202609150145
Revises: 202609141123
"""
from alembic import op
import sqlalchemy as sa

revision = '202609150145'
down_revision = '202609141123'

def upgrade() -> None:
    op.create_table(
        'tenant_audit_logs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=True),
        sa.Column('action_type', sa.String(length=50), nullable=False),
        sa.Column('actor', sa.String(length=100), nullable=True),
        sa.Column('details', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['tenant_id'], ['res_companies.id'], ondelete='SET NULL')
    )
    op.create_index('ix_tenant_audit_logs_id', 'tenant_audit_logs', ['id'], unique=False)
    op.create_index('ix_tenant_audit_logs_action_type', 'tenant_audit_logs', ['action_type'], unique=False)
    op.create_index('ix_tenant_audit_logs_created_at', 'tenant_audit_logs', ['created_at'], unique=False)

def downgrade() -> None:
    op.drop_table('tenant_audit_logs')
```
3. Run the migration script directly inside your integrated terminal window:
   ```bash
   cd backend && .venv/bin/alembic upgrade head && cd ..
   ```

---

## 🎨 Phase 2: Structural Key & Status Extenders on `res_companies`
Extend company model entities with parameters to manage workspace lease visibility, branding hex keys, and platform states.

### Action Steps (Run via Terminal Tool)
1. Add the following model columns onto the `ResCompany` SQLAlchemy model:
   - `is_active = Column(Boolean, default=True, nullable=False)`
   - `status = Column(String(20), default="ACTIVE", nullable=False)`
   - `primary_color = Column(String(7), default="#0ea5e9", nullable=False)`
   - `secondary_color = Column(String(7), default="#0f172a", nullable=False)`
2. Generate an Alembic script at `backend/alembic/versions/202609150210_add_tenant_controls_and_themes.py`:
```python
"""add tenant controls and themes
Revision ID: 202609150210
Revises: 202609150145
"""
from alembic import op
import sqlalchemy as sa

revision = '202609150210'
down_revision = '202609150145'

def upgrade() -> None:
    op.add_column('res_companies', sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False))
    op.add_column('res_companies', sa.Column('status', sa.String(length=20), server_default='ACTIVE', nullable=False))
    op.add_column('res_companies', sa.Column('primary_color', sa.String(length=7), server_default='#0ea5e9', nullable=False))
    op.add_column('res_companies', sa.Column('secondary_color', sa.String(length=7), server_default='#0f172a', nullable=False))

def downgrade() -> None:
    op.drop_column('res_companies', 'secondary_color')
    op.drop_column('res_companies', 'primary_color')
    op.drop_column('res_companies', 'status')
    op.drop_column('res_companies', 'is_active')
```
3. Deploy the structural modifications directly via the console terminal:
   ```bash
   cd backend && .venv/bin/alembic upgrade head && cd ..
   ```

---

## 🔒 Phase 3: Cryptographic Storage Engine with AES-256-GCM
Build a data encryption framework that secures multi-tenant backup snapshots in-memory before they hit persistent storage disks.

### Action Steps (Run via Terminal Tool)
1. Install dependencies inside the virtual environment:
   ```bash
   cd backend && .venv/bin/pip install cryptography && cd ..
   ```
2. Create the cryptographic file handler at `backend/app/utils/crypto_vault.py`:
```python
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

KEY_FILE = "/var/crypto/oxengl/master.key"
os.makedirs(os.path.dirname(KEY_FILE), exist_ok=True)

def ensure_master_key() -> bytes:
    if os.path.exists(KEY_FILE):
        with open(KEY_FILE, "rb") as f:
            return f.read()
    fresh_key = AESGCM.generate_key(bit_length=256)
    with open(KEY_FILE, "wb") as f:
        f.write(fresh_key)
    os.chmod(KEY_FILE, 0o600)
    return fresh_key

def encrypt_bytes_aes256(raw_data: bytes) -> bytes:
    master_key = ensure_master_key()
    aesgcm = AESGCM(master_key)
    nonce = os.urandom(12)
    return nonce + aesgcm.encrypt(nonce, raw_data, None)

def decrypt_bytes_aes256(encrypted_stream: bytes) -> bytes:
    master_key = ensure_master_key()
    aesgcm = AESGCM(master_key)
    nonce = encrypted_stream[:12]
    ciphertext = encrypted_stream[12:]
    return aesgcm.decrypt(nonce, ciphertext, None)
```

---

## ⚙️ Phase 4: Master Control Endpoints with Gzip, Tracking, and Alerts
Expose administrative APIs to control tenant lifecycle states, execute Gzip-compressed snapshots, and manage database restorations.

### Action Steps (Run via Terminal Tool)
1. Create or overwrite the master router at `backend/app/api/v1/super_admin.py`.
2. Ensure the router implements the following endpoints:
   - `GET /api/v1/superadmin/tenants` (Fetch tenant tracking grids)
   - `PUT /api/v1/superadmin/tenants/{tenant_id}/status` (Toggle activation flags)
   - `POST /api/v1/superadmin/tenants/{tenant_id}/trigger-test-alert` (Force Email/WhatsApp notice dispatch)
   - `DELETE /api/v1/superadmin/tenants/{tenant_id}/purge` (Encrypt, Gzip compact to `.enc.tar.gz`, then clear tables)
   - `POST /api/v1/superadmin/tenants/restore-upload` (Decompress, decrypt, and reconstitute 5-deep ledger topologies)
   - `GET /api/v1/superadmin/logs` (Retrieve unified database tracking logs)
   - `GET /api/v1/superadmin/logs/export-csv` (Stream log metrics down into raw CSV downloads)
   - `GET /api/v1/superadmin/cloud-telemetry` (Monitor capacity allocations and evaluate the 90% utilization threshold)
   - `GET /api/v1/superadmin/analytics/velocity` (Analyze time-series entry density over rolling 7-day windows)
3. Register the new router inside `backend/app/main.py`:
```python
from backend.app.api.v1 import super_admin
app.include_router(super_admin.router)
```

---

## 📋 Phase 5: Automated Maintenance, Key Mirroring, and Retention Schedulers
Deploy localized background scripts to enforce storage retention windows, execute weekly system snapshots, and copy master keys offsite.

### Action Steps (Run via Terminal Tool)
1. Deploy or overwrite `scripts/prune_test_tenants.py` to evaluate workspace expiration limits, run a log vacuum pass to clear entries older than 90 days, and dispatch multi-channel Slack/Discord messages if storage thresholds breach 90%.
2. Create `scripts/weekly_active_snapshot.py` to compile non-destructive `.enc.tar.gz` packages for active tenants.
3. Create `scripts/rotate_master_keys.py` to re-encrypt historical storage containers under a rolling key schedule.
4. Create `scripts/mirror_crypto_vault_key.py` to replicate the primary key file offsite to a cloud storage bucket.
5. Create `scripts/replicate_offsite.py` to synchronize encrypted archives over secure network pipes (`boto3`).
6. Register all workflows into the Linux crontab (`sudo crontab -e`).

---

## 🖥️ Phase 6: Unified Frontend Super Admin Control Hub Pages
Build intuitive UI panels inside the Super Admin dashboard viewport canvas to provide full visibility and manual control over the infrastructure.

### Action Steps (Run via Terminal Tool)
1. Build the tenant tracking cockpit at `frontend/src/views/SuperAdminTenantsView.tsx`.
2. Build the log visualization and cloud telemetry graph panel at `frontend/src/views/SuperAdminLogsView.tsx`.
3. Build the time-series activity chart panel at `frontend/src/views/SuperAdminAnalyticsView.tsx`.
4. Register these components inside `frontend/src/App.tsx` matching these absolute paths:
   - `/admin/tenants` ──► Tenant Life-Cycle Cockpit Dashboard
   - `/admin/logs`    ──► Live Telemetry Tracker & System Audit Ledger Grid
   - `/admin/analytics` ──► Transaction Velocity Visualizer
5. Clear deployment buffers and trigger a clean production compilation:
   ```bash
   cd frontend && rm -rf dist node_modules/.vite && npm install && npm run build
   ```
6. Sync the newly built client distribution code directly to your active Nginx directory paths via your terminal environment:
   ```bash
   sudo rm -rf /var/www/erp/frontend/dist/*
