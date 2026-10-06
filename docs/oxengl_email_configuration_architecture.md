# OxenGL Two-Tier Email Configuration Architecture

This document establishes the official technical specification for implementing two-tier email delivery within the OxenGL SaaS platform. It covers global superadmin fallback configuration and tenant-specific isolated custom SMTP overrides, adhering to enterprise security and multi-tenant isolation standards.

---

## 1. Architectural Overview

OxenGL implements a hierarchical fallback mail delivery pipeline:
1. **Tier 1 (Tenant Override):** If an active, verified tenant-specific SMTP configuration exists, outbound operational emails (invoices, purchase orders, client alerts) are dispatched using the tenant's dedicated mail server.
2. **Tier 2 (Global Superadmin Fallback):** If no tenant override is active or if the tenant SMTP fails authentication, the system automatically falls back to the global platform-wide SMTP configuration managed by the Superadmin. System-critical alerts (password resets, subscription expiration warnings, security notifications) always evaluate through the global pool or explicit priority channels.

```
                  [ Outbound Email Request ]
                             │
                             ▼
              { Does Tenant Have Active SMTP? }
                     /                 \
                 ( YES )              ( NO )
                   /                     \
                  ▼                       ▼
      [ Decrypt & Apply Tenant ]    [ Use Global Superadmin ]
      [      SMTP Config       ]    [      Fallback SMTP    ]
                   \                     /
                    \                   /
                     ▼                 ▼
              [ Dispatch via FastAPI Mail Engine ]
```

---

## 2. Database Schema & Storage Specifications

### Tier 1: Tenant-Specific Configurations
Stored in a secure, RLS-protected table within `erp_db`.

* **Table Name:** `tenant_email_configs`
* **Columns:**
  * `id` (UUID, Primary Key)
  * `tenant_id` (UUID, Foreign Key referencing `tenants.id`, indexed, RLS enforced)
  * `is_active` (Boolean, default `false`)
  * `smtp_host` (String, e.g., `smtp.mailgun.org`)
  * `smtp_port` (Integer, e.g., `587`)
  * `smtp_user` (String)
  * `encrypted_password` (Text, encrypted via Fernet / AES-256)
  * `from_email` (String, validated domain match)
  * `from_name` (String)
  * `use_tls` (Boolean, default `true`)
  * `use_ssl` (Boolean, default `false`)
  * `created_at` (Timestamp with timezone)
  * `updated_at` (Timestamp with timezone)

### Tier 2: Global System Configuration
Stored in the global system settings table (`system_configs`) or environment variables.

* **Variables / Fields:**
  * `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` (Encrypted at rest)
  * `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`

---

## 3. Security & Encryption Standards

* **Credential Encryption:** All SMTP passwords must be encrypted using application-level AES-256 encryption (`cryptography.fernet`) before persisting to the database. Decryption occurs strictly in-memory at runtime during dispatch.
* **Row-Level Security (RLS):** The `tenant_email_configs` table must enforce strict RLS policies ensuring tenants can only read/write their own email configurations.
* **Domain Validation:** Tenant `from_email` domains should ideally pass SPF/DKIM verification checks where enterprise compliance requires it.

---

## 4. Backend Dispatch Logic & Fallback Mechanism

Implement the dynamic email dispatcher service in `backend/app/services/email_service.py`:

```python
from sqlalchemy.orm import Session
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema
from backend.app.core.security import decrypt_value
from backend.app.models.tenant_email import TenantEmailConfig
from backend.app.core.config import settings

async def get_mail_config(tenant_id: str, db: Session) -> ConnectionConfig:
    if tenant_id:
        tenant_config = db.query(TenantEmailConfig).filter_by(tenant_id=tenant_id, is_active=True).first()
        if tenant_config:
            try:
                decrypted_pass = decrypt_value(tenant_config.encrypted_password)
                return ConnectionConfig(
                    MAIL_USERNAME=tenant_config.smtp_user,
                    MAIL_PASSWORD=decrypted_pass,
                    MAIL_FROM=tenant_config.from_email,
                    MAIL_PORT=tenant_config.smtp_port,
                    MAIL_SERVER=tenant_config.smtp_host,
                    MAIL_FROM_NAME=tenant_config.from_name,
                    MAIL_TLS=tenant_config.use_tls,
                    MAIL_SSL=tenant_config.use_ssl,
                    USE_CREDENTIALS=True,
                    VALIDATE_CERTS=True
                )
            except Exception as e:
                # Log decryption/connection failure and fall back to global
                logger.error(f"Tenant SMTP configuration failed for {tenant_id}: {e}")

    # Fallback to Superadmin Global SMTP
    return ConnectionConfig(
        MAIL_USERNAME=settings.SMTP_USER,
        MAIL_PASSWORD=settings.SMTP_PASSWORD,
        MAIL_FROM=settings.SMTP_FROM_EMAIL,
        MAIL_PORT=settings.SMTP_PORT,
        MAIL_SERVER=settings.SMTP_HOST,
        MAIL_FROM_NAME=settings.SMTP_FROM_NAME,
        MAIL_TLS=settings.SMTP_TLS,
        MAIL_SSL=settings.SMTP_SSL,
        USE_CREDENTIALS=True,
        VALIDATE_CERTS=True
    )
```

---

## 5. API Endpoint Specifications

### Superadmin Endpoints (`/api/v1/superadmin/settings/smtp`)
* `GET /`: Retrieve current global SMTP settings (passwords masked).
* `PUT /`: Update global system SMTP parameters and test connection.
* `POST /test`: Trigger a test email dispatch using global settings.

### Tenant Endpoints (`/api/v1/tenant/settings/smtp`)
* `GET /`: Retrieve tenant's custom SMTP configuration status (password masked).
* `POST /`: Create or update custom tenant SMTP settings (encrypts password on save).
* `POST /test`: Send a test email using the tenant's custom configuration.
* `DELETE /`: Disable custom SMTP override and revert entirely to global fallback.

---

## 6. Frontend UI Considerations

* **Superadmin Panel:** A dedicated Settings tab containing input fields for Host, Port, Username, Password (with eye toggle), From Email, and a **"Test Global SMTP Connection"** action button.
* **Tenant Panel:** A Workspace Integration / Mail Settings card allowing tenant administrators to toggle "Use Custom SMTP Server", fill in their corporate mail gateway parameters, test connectivity, and view connection status indicators (Active / Error / Fallback).