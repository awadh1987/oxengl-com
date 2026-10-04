# OxenGL Enterprise Architecture: Password Reset & Multi-Destination Backup Strategy

## 1. Password Reset & Recovery Architecture (3 Tiers + Dual Channels)
A secure multi-tenant enterprise ERP requires robust recovery pathways across all administrative levels. Here is the architecture for managing password resets via both Email and Mobile Phone / SMS:

### 📱 Self-Service User Recovery
* **Channels**: Supports both Email Link (secure tokenized URL with short expiration) and SMS / WhatsApp One-Time Password (OTP) sent to the user's verified mobile number.
* **Flow**:
  1. User clicks "Forgot Password" on the login portal.
  2. Selects recovery method: Email or SMS.
  3. Enters their identifier (email or phone number).
  4. System generates a cryptographically secure, time-bound token (hashed in the database).
  5. Upon verification of the code/token, the user is prompted to set a new password, instantly invalidating all active sessions.

### 🏢 Tenant Admin Management
* **Capabilities**: Tenant Administrators can manage user access for their specific organization's employees and drivers.
* **Flow**:
  1. Navigates to the Tenant User Registry.
  2. Selects a user and triggers a "Reset Password" or "Generate Temporary Password" action.
  3. Can choose to send the temporary credentials via SMS or Email directly to the user, or display a secure one-time temporary password on screen for immediate administrative handover.
  4. Forces a password change on the user's next login.

### 👑 Super Admin Platform Rescue
* **Capabilities**: Platform Owners (Super Admins) maintain a high-level rescue mechanism for locked-out Tenant Owners/Admins.
* **Flow**:
  1. Accessed securely via the Super Admin Console (`/admin`).
  2. Allows direct credential re-issuance or forced recovery token dispatch for any tenant administrative account.
  3. All super-admin override actions are logged in the platform-wide audit trail for corporate compliance.

---

## 2. Multi-Destination Backup Architecture (Private Servers + Google Drive & OneDrive)
To guarantee absolute data sovereignty, privacy compliance, and disaster recovery resilience, OxenGL supports flexible multi-destination backups across two operational scopes and three storage targets.

### 🗄️ Storage Destinations
* **Private Server Storage (Primary / Sovereign)**:
  * **Protocols**: SFTP, secure SSH/rsync, WebDAV, or local S3-compatible private object storage (e.g., MinIO deployed on-premise or on a private VPS).
  * **Security**: Encrypted in transit (TLS/SSH) and at rest (AES-256). Ideal for regulated industries where data cannot leave private infrastructure.
* **Cloud Storage Integrations (Secondary / Redundant)**:
  * **Providers**: Google Drive and Microsoft OneDrive via secure OAuth2 API integrations.
  * **Usage**: Allows seamless syncing to corporate cloud accounts.

### 📦 Backup Scopes & Execution
* **Tenant Level**:
  * Tenant admins can configure automated daily incremental and weekly full backups of their isolated PostgreSQL schema, uploaded attachments, and generated invoices.
  * Destinations can be pointed to their own corporate Google Drive / OneDrive or an assigned private SFTP server.
* **Platform Level**:
  * The Super Admin configures global automated platform snapshots.
  * Executes automated daily database dumps, system configuration backups, and audit logs pushed securely to a master private server vault and/or a master enterprise cloud folder.

---

## 3. Implementation Roadmap
### Phase A: Self-Service & Admin Password Resets
* Implement token generation and validation endpoints supporting dual-channel dispatch (SMTP email provider + Twilio/SMS gateway integration).
* Build UI modals for self-service recovery and tenant-admin user credential management.

### Phase B: Multi-Destination Backup Daemon
* Develop a scheduled background worker (`celery` or `asyncio` cron task) for database schema dumps and file archive packaging (`tar.gz` with AES-256 encryption).
* Implement connectors for SFTP/Private Server upload and OAuth2 token management for Google Drive / OneDrive API uploads.

### Phase C: Management Consoles
* Expose backup configuration panels in both the Tenant Settings view and the Super Admin Platform Master Settings.

---

## 4. Implementation Status (2026-10-04)

| Item | State |
|---|---|
| Phase A scaffold | [`backend/app/api/v1/auth_recovery.py`](../../backend/app/api/v1/auth_recovery.py). The three recovery tiers' routes, request/response contracts, `RecoveryDeliveryProvider` hook and authorisation guards. **Not mounted**; every endpoint returns `501`. |
| Phase B scaffold | [`backend/app/services/backup_service.py`](../../backend/app/services/backup_service.py). Scopes, policies, the `BackupDestination` interface with SFTP / rsync-SSH / WebDAV / S3-compatible / Google Drive / OneDrive connectors, a path-traversal guard, and worker entry points. Not scheduled. |
| Live recovery endpoints | Legacy `/api/v1/auth/forgot-password` + `/reset-password` and `/api/auth/recover-password` + `/reset-password`. Hardened in incident report Addendum D. |
| Self-service reset | **Unavailable until an email/SMS provider is configured.** Codes are never returned in API responses. Super Admin credential rotation still works. |

**Security baseline for Phases A–C** (from incident report Addendum D, `docs/incidents/2026-10-04-unauthenticated-master-platform-and-invoice-idor.md`):

- **Responses:** recovery responses are identical for existing and unknown accounts, and never carry an OTP, token or link.
- **Codes:** OTPs and tokens come from a cryptographically secure generator, are hashed at rest, single-use and short-lived. They are destroyed after 5 failed guesses and never logged.
- **Sessions:** a completed reset revokes all of the account's sessions and refresh tokens.
- **Tenant scope:** derived from the authenticated caller only. Admin and super-admin actions are audited.
- **Backups:** archives are encrypted client-side (AES-256-GCM) before upload. Destination credentials and OAuth refresh tokens are encrypted at rest and are write-only in the consoles. SFTP host keys are pinned.
