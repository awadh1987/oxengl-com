# OxenGL Multi-Tenant Workspace Remediation: Email Customization, First-Login Security, Onboarding Roles & Tenant Ownership

## Background & Problem Statement

A live tenant invitation was dispatched from `wac-ye` (`Alwehda Alarabia Oil Services Co Ltd`) to a user with several operational bugs:

1. **Uncustomizable Branding & Communication:** In the tenant "Communication" page, tenants have no way to edit the login CTA URL, alternative fallback URL, logo URL, support email (which defaulted to `support@oxengl.com`), or custom invitation message body.
2. **Missing First-Login Password Reset Enforcement:** The email states *"you will be required to update your temporary password upon first sign-in"*, but no enforcement mechanism or redirection exists upon first login.
3. **Stuck Invitation Status:** In the tenant user table, the user's status remains stuck at `pending acceptance` even after signing in.
4. **Guest Role Access Block:** The user is invited with a restrictive `Guest` role by default, leaving them blocked by RBAC until manually upgraded.
5. **Tenant Authority & Role Leakage:** The `owner` role must be the ultimate authority in a tenant workspace. Platform `superadmin` roles must not exist or appear in tenant-level user/role selectors.

---

## EXECUTION RULES (CRITICAL)

- **STRICT PHASE-BY-PHASE EXECUTION:** You MUST execute only ONE phase at a time.
- **STOP & WAIT FOR APPROVAL:** At the end of each phase, run tests, present a concise report with verification evidence, and **STOP**. Do NOT begin the next phase until the user explicitly reviews and replies: *"Proceed to Phase [N]"*.

---

## PHASE 1: Tenant Communication Page Customization & Dynamic Invitation Body

### Objective

Allow tenant owners/admins to configure their public login URL, logo URL, support email, email signatures, and customizable invitation body text from the tenant "Communication" page, and ensure `email_service.py` consumes these values.

### Action Steps

1. **Database & Schema Audit:**
   - Inspect `CommunicationSetting` and `ResCompany` in `backend/models.py`.
   - Ensure the tenant communication config (stored in `res_companies` or `communication_settings.config`) supports the following configurable fields:
     - `workspace_login_url`: string (overrides the generated login link)
     - `logo_url`: string (custom public logo HTTPS URL)
     - `support_email`: string (e.g. `support@wac-ye.com`)
     - `invitation_headline`: string (default: `"Join {tenant_name} on OxenGL"`)
     - `invitation_body`: text (custom welcome/instruction text)
     - `signature_name`: string (e.g. `"Executive Administration"`)
     - `signature_title`: string (e.g. `"Operations Team"`)
2. **Backend API Endpoints:**
   - In `backend/app/api/v1/communication.py` (or tenant settings router), verify/add `GET` and `PUT` endpoints for tenant communication branding:
     - `GET /api/v1/tenant/communication/branding`
     - `PUT /api/v1/tenant/communication/branding` (restricted to tenant `owner` / `admin`).
3. **Frontend Integration:**
   - In the tenant's "Communication" settings view (search `frontend/src/` for communication views):
     - Add a form section for **"Email & Invitation Branding"**.
     - Provide editable inputs for:
       - Workspace Login URL
       - Support Contact Email
       - Logo URL (with preview)
       - Email Signature (Name & Title)
       - Custom Invitation Message Body (with token placeholders like `{tenant_name}`, `{user_name}`)
     - Wire saving and fetching to the backend API.
4. **Rewire `EmailService.dispatch_user_invitation`:**
   - In `backend/app/services/email_service.py`:
     - Load tenant branding overrides before rendering `invite_user.html`.
     - Use `company.support_email` instead of fallback `support@oxengl.com`.
     - Use custom `workspace_login_url` if provided; otherwise fall back to domain/slug resolution.
     - Inject `custom_body` into the template context if configured.
5. **Validation:**
   - Run unit tests and in-container render checks ensuring custom text, custom support email, and custom login URL appear properly in the rendered HTML email.

> **GATE 1:** Present modified files, backend compile status, and a render test snippet showing the customized values. Ask for user approval to proceed to Phase 2.

---

## PHASE 2: Mandatory First-Login Password Change & Acceptance Status Transition

### Objective

Enforce mandatory password reset on initial login when an account is provisioned with a temporary password, and automatically transition user status from `pending acceptance` to `active`.

### Action Steps

1. **User Model Attributes:**
   - Verify `User` model in `backend/models.py` has:
     - `must_change_password: bool` (defaults to `True` for invited users created with temporary passwords).
     - `invitation_status: str` or `status: str` (values: `'pending'`, `'active'`).
2. **Authentication Flow Interception:**
   - In `backend/app/api/v1/auth.py` (or login handler):
     - When a user logs in successfully, check `user.must_change_password`.
     - If `True`: Issue a scoped session token (or flag `must_change_password: true` in the login response) that restricts access exclusively to the password update route.
3. **Password Change Endpoint:**
   - Create or verify `POST /api/v1/auth/first-login-password-change`:
     - Accepts current temporary password + new password + confirmation.
     - Enforces password complexity.
     - Sets `user.must_change_password = False`.
     - Updates `user.invitation_status = "active"` (and `user.is_active = True`).
     - Issues a standard full-access JWT session token.
4. **Frontend Login Guard & Modal:**
   - In `frontend/src/views/LoginView.tsx` / `frontend/src/router/`:
     - When the login response indicates `must_change_password: true`, immediately redirect the user to a dedicated `/auth/force-change-password` view (or show a non-dismissible modal).
     - Prevent access to the dashboard until the password is successfully updated.
5. **Validation:**
   - Simulate a login using a temporary password:
     - Verify initial login response mandates password change.
     - Verify API blocks dashboard requests until password change is complete.
     - Verify `must_change_password` toggles to `False` and `invitation_status` transitions to `active`.

> **GATE 2:** Present the modified authentication handlers, frontend interceptor, and verification test logs. Ask for user approval to proceed to Phase 3.

---

## PHASE 3: Invitation Role Selection & Initial Workspace Access

### Objective

Prevent invited users from getting blocked in `Guest` status by allowing tenant admins to select the assigned role at invitation time, and ensure valid access permissions upon first login.

### Action Steps

1. **Tenant Invite Dialog Enhancement:**
   - In `frontend/src/` (the invite user modal/dialog):
     - Add a required "Role" selector dropdown populated with available tenant roles (e.g. `Admin`, `Manager`, `Accountant`, `Staff`, `Member`).
     - Do not force `Guest` as the hardcoded default; allow the inviter to pick the intended operational role.
2. **Backend API Validation:**
   - In `backend/app/api/v1/users.py` and `backend/app/api/v1/tenant_control.py`:
     - Accept `role` from the request payload.
     - Assign the selected role directly to the user's tenant membership/association (`UserCompanyAccess` or user record).
3. **Guest Role Safeguard:**
   - If a tenant explicitly invites a user as `Guest`:
     - Ensure the `Guest` role is granted basic read access to an onboarding welcome page or default read-only workspace view, rather than triggering a blank screen or raw `403 Forbidden` error.
4. **Validation:**
   - Invite a user with role `Accountant` (or `Member`).
   - Verify the database record is created with that role.
   - Verify the invitation email template displays: *"invited you to join ... as Accountant"*.

> **GATE 3:** Present frontend and backend invite payload diffs and confirmation that the role is applied upon creation. Ask for user approval to proceed to Phase 4.

---

## PHASE 4: Tenant Ownership Model & Superadmin Isolation

### Objective

Establish the `owner` role as the ultimate authority within a tenant workspace and eliminate `superadmin` existence or leakage inside tenant scopes.

### Action Steps

1. **Tenant Role Hierarchy Audit:**
   - Verify RBAC definition:
     - Platform Scope: `superadmin` (manages the OxenGL platform, infrastructure, and all tenant provisioning).
     - Tenant Scope: `owner` (highest rank inside a company; full administrative control over members, billing, communications, and settings).
2. **Eliminate `superadmin` Leakage in Tenant UI:**
   - In tenant user management, role selectors, and member lists (`frontend/src/views/`):
     - Filter out `superadmin` from selectable roles.
     - Do not display platform `superadmin` users in tenant member tables unless they hold an explicit tenant membership.
3. **Tenant Guard & Permission Adjustments:**
   - In `backend/app/core/guards.py` and API route dependencies:
     - Ensure all tenant administrative actions (modifying settings, deleting data, updating communication configs) check for tenant `owner` or tenant `admin` permissions.
     - Do not require platform `superadmin` credentials to perform tenant-level administrative operations.
4. **Container Sync & Final Integration Test:**
   - Sync all backend and frontend changes to `oxengl_backend_container` and rebuild frontend assets if necessary.
   - Execute the test suite:
     - Test tenant communication updates.
     - Test complete invitation cycle (invite with role -> receive email -> login -> force change password -> verify active status).
     - Verify tenant owner controls all tenant settings.

> **GATE 4:** Provide final test results, container health status, git diff summary, and wait for confirmation to commit and push.
