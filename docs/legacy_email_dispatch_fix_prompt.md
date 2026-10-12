# CRITICAL BUG FIX: STANDARDIZE TENANT INVITATION EMAILS & REWIRE LEGACY DISPATCHERS

A plain-text invitation email was dispatched bypassing the standardized Jinja2/Premailer engine with legacy plain-text content:

* Subject: "OxenGL notification"

* Sender: "<admin@wac-ye.com>"

* Body: "OxenGL account credentials for {name}: temporary password {password}. Sign in and change this password immediately."

* Issue: Missing HTML formatting, missing Tenant Logo, missing OxenGL co-branding footer, and missing a clickable "Sign In & Access Workspace" CTA button.

Execute the following comprehensive three-phase resolution:

================================================================================

## PHASE 1: AUDIT & IDENTIFY ALL LEGACY DISPATCHERS

================================================================================

1. **SEARCH REPOSITORY FOR HARDCODED LEGACY STRINGS:**
   Locate where the legacy invitation message originates:

   * `grep -rn "OxenGL notification" backend/`

   * `grep -rn "temporary password" backend/`

   * `grep -rn "Sign in and change this password immediately" backend/`

   * `grep -rn "account credentials for" backend/`

2. **TRACE THE FRONTEND TRIGGER:**

   * Inspect frontend components where tenant admins invite or create users (search `frontend/src/` for user invite modals, member creation dialogs, or team management tables).

   * Match the invoked API endpoint to the corresponding backend route (e.g., `backend/app/api/v1/users.py`, `backend/app/api/v1/tenants.py`, or `backend/app/api/v1/tenant_control.py`).

3. **MAP ALL SECONDARY CREATION CALLERS:**

   * Identify every adjacent route/service that sends credentials (e.g., manual user provisioning, HR employee onboarding, team invites, initial tenant setup).

   * Document each file, handler function, and line number calling the old mailer.

================================================================================

## PHASE 2: REWIRE DISPATCHERS, CONSTRUCT CTA ROUTING & RESOLVE ASSET LOGOS

================================================================================

Update all user creation and invitation flows to use the standardized `dispatch_user_invitation` engine (`backend/app/services/email_service.py` backed by `invite_user.html` and `base_email.html`):

1. **CONSTRUCT DYNAMIC WORKSPACE LOGIN CTA URL:**
   Build the `action_url` parameter dynamically based on company attributes:

   * If `company.custom_domain` is set:
     `action_url = f"https://{company.custom_domain}/auth/login"`

   * Else if `company.workspace_domain` is set:
     `action_url = f"https://{company.workspace_domain}/auth/login?tenant={company.slug}"`

   * Fallback:
     `action_url = f"https://portal.oxengl.com/auth/login?tenant={company.slug}"`

2. **RESOLVE LOGOS WITH ABSOLUTE HTTPS PATHS:**
   Email clients cannot resolve relative paths (`/logo.png`). Ensure all URLs are fully qualified:

   * **Tenant Logo (Top Header):**

     * If `company.logo_url` exists:
       `tenant_logo = company.logo_url if company.logo_url.startswith("http") else f"https://portal.oxengl.com{company.logo_url}"`

     * If `company.logo_url` is missing or null:
       Pass `None` so `invite_user.html` displays the styled monoline initials badge.

   * **Platform Logo (Footer Co-Branding):**

     * Verify `base_email.html` uses an absolute HTTPS URL for the OxenGL platform footer logo:
       `https://portal.oxengl.com/static/brand/oxengl-logo.png` (or embedded inline SVG).

     * Ensure the footer includes the "Powered by OxenGL" badge and dynamic copyright year.

3. **REWIRE DISPATCH LOGIC TO USE BACKGROUNDTASKS:**
   Replace all legacy mailer invocations across `users.py`, `tenants.py`, and `tenant_control.py` with:

   ```
   tenant_ctx = {
       "name": company.name,
       "logo_url": tenant_logo,
       "workspace_domain": company.workspace_domain or "portal.oxengl.com",
       "support_email": company.support_email or "support@oxengl.com",
       "signature_name": company.signature_name or f"{company.name} Administration",
       "signature_title": company.signature_title or "Workspace Operations",
   }
   
   background_tasks.add_task(
       dispatch_user_invitation,
       recipient_email=user.email,
       first_name=user.first_name or user.full_name or "Team Member",
       user_role=user.role,
       action_url=action_url,
       inviter_name=current_user.full_name or "Workspace Administrator",
       tenant=tenant_ctx,
       temp_password=temporary_password,
   )
   
   ```

================================================================================

## PHASE 3: CONTAINER SYNC, SMOKE TEST & IN-INBOX VERIFICATION

================================================================================

1. **SYNCHRONIZE FILES & RESTART CONTAINER:**

   * Check Python syntax:
     `python3 -m py_compile backend/app/api/v1/*.py backend/app/services/*.py`

   * Copy modified files into `oxengl_backend_container`:
     `docker cp backend/app/. oxengl_backend_container:/app/backend/app/`

   * Restart the backend container:
     `docker restart oxengl_backend_container`

   * Confirm backend health:
     `curl -fsS http://localhost:8000/api/v1/health`

2. **RUN AN IN-CONTAINER RENDER TEST:**
   Execute an assertion test inside `oxengl_backend_container` to verify template compilation and CSS inlining:

   ```
   docker exec -i oxengl_backend_container python3 -c "
   import asyncio
   from app.services.email_service import EmailService
   
   ctx = {
       'user': {'first_name': 'Ahmed', 'role': 'Administrator', 'temp_password': 'TestPassword123!'},
       'inviter': {'name': 'Operations Admin'},
       'action_url': 'https://portal.oxengl.com/auth/login?tenant=wac-ye',
       'expiry_hours': 48,
       'tenant': {
           'name': 'Alwehda Alarabia Oil Services Co Ltd',
           'workspace_domain': 'portal.oxengl.com',
           'logo_url': 'https://portal.oxengl.com/static/tenants/wac-ye-logo.png',
           'signature_name': 'Alwehda Alarabia Operations',
           'signature_title': 'IT Administration',
           'support_email': 'support@wac-ye.com'
       },
       'subject': 'Invitation to join Alwehda Alarabia Oil Services Co Ltd'
   }
   
   html = EmailService._render_template('invite_user.html', ctx)
   assert 'style=' in html, 'Missing inlined CSS'
   assert 'Sign In & Access Workspace' in html or 'https://portal.oxengl.com/auth/login?tenant=wac-ye' in html, 'Missing CTA'
   assert 'Powered by OxenGL' in html, 'Missing OxenGL footer'
   print('RENDER VALIDATION PASSED: Successfully generated co-branded HTML email with CTA button.')
   "
   
   ```

3. **DISPATCH REPORT:**
   Report the exact file and line number where the legacy string was located, list all files updated, and display the in-container render test output.
