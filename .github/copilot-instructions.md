# OxenGL ERP Workspace Rules

These rules apply to all work in this workspace.

## Authentication
- Authentication must be 100% native to the OxenGL platform.
- Never suggest, introduce, retain, or depend on Firebase authentication, Google Workspace SSO, Google identity tokens, or external identity providers for application login.
- Registration, sign-up, and login flows must support standard free email providers and mobile phone numbers when user credentials are involved.

## Credential Security
- Passwords must be securely hashed on the backend before any database write using a strong password hashing algorithm such as bcrypt or Argon2.
- Never store, log, display, seed, or transmit plain-text passwords beyond the initial credential submission.
- Authenticated sessions must use secure HttpOnly JWT cookies. Do not rely on browser-readable identity tokens for session state.

## Tenant Isolation
- Every database query, API endpoint, service method, report, export, background job, and administrative path that touches tenant data must verify and enforce `company_id` server-side.
- Never rely only on frontend filters or request-provided tenant identifiers for tenant authorization.
- Never expose cross-tenant data unless a deliberately audited platform-superadmin path explicitly authorizes it.

## Audit Logging
- Log all authentication events and administrative bypass actions to `platform_audit_logs`.
- Critical events include registrations, logins, failed logins, logouts, password resets, role changes, bypasses, tenant access decisions, and administrative overrides.
- Audit entries must capture the real client IP, actor identifier, event name, outcome, relevant `company_id` when applicable, and timestamp.
