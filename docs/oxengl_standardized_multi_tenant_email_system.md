# OxenGL Multi-Tenant Email & Messaging System Specification

This document serves as the single source of truth for standardizing transactional messaging across the OxenGL platform and all existing and future tenant workspaces.

---

## 1. Architectural Overview & Design System

### 1.1 Brand & Visual Hierarchy

To align with enterprise conventions (e.g., Microsoft 365, Google Workspace, Stripe):

- **Container Structure:** 600px fixed-width container, single column, light neutral background (`#F8FAFC`), white card body (`#FFFFFF`), subtle border (`#E2E8F0`), 8px corner radius.
- **Header (Primary Co-Branding):** Prominently displays the **Tenant Logo** (or styled tenant business name) alongside the tenant's workspace subdomain (e.g., `tenant.oxengl.com`).
- **Body Area:** High-contrast typography (`#0F172A` headings, `#334155` body text), clear call-to-action (CTA) buttons, and distinct credential highlight cards.
- **Tenant Signature:** Tenant department or administrative signature directly beneath the body content with direct tenant support contact details.
- **Footer (Platform Compliance & Attestation):** Standardized, muted footer displaying:
  - Legal tenant copyright.
  - Platform compliance attestation: *"This message was sent by [Tenant Name] via the OxenGL Enterprise Platform."*
  - **OxenGL Badge:** Monochrome OxenGL logo + *"Powered by OxenGL"*.

### 1.2 Deliverability & Authentication Guardrails

- **Sender Identity (`From:`):** `"{Tenant Name} via OxenGL" <notifications@oxengl.com>` (or verified tenant custom sending domain if configured).
- **Reply Routing (`Reply-To:`):** Always mapped to the tenant's configured support email (`{{ tenant.support_email }}`). Replies go directly to tenant administrators without exposing OxenGL internal mailboxes.
- **CSS Inlining:** All CSS styles are inlined at build time using `premailer` to prevent stripping by Outlook (desktop/web) and Gmail.
- **MIME Multipart:** Messages are emitted as `multipart/alternative` with properly formatted HTML and UTF-8 encoding.

---

## 2. Directory Structure

The implementation must conform to the following project layout within the FastAPI service:

```text
app/
├── core/
│   └── config.py                     # SMTP host, port, credentials, and platform fallbacks
├── models/
│   └── tenant.py                     # Tenant model with branding attributes
├── schemas/
│   └── email.py                      # Pydantic schemas for email payloads
├── services/
│   └── email_service.py              # Template renderer, CSS inliner, and SMTP dispatcher
└── templates/
    └── email/
        ├── base_email.html           # Master skeleton with Outlook VML & dual-branding
        ├── invite_user.html          # User workspace invitation & activation
        ├── password_reset.html       # Security-audited password reset
        ├── system_instructions.html  # Onboarding SOPs & step-by-step guides
        ├── security_alert.html       # New session/IP login notification
        └── role_updated.html         # RBAC permission change notice
```

---

## 3. Master Jinja2 Layout & Child Templates

### 3.1 Base Skeleton (`templates/email/base_email.html`)

```html
<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>{{ subject }}</title>
  <!--[if mso]>
  <xml>
    <o:OfficeDocumentSettings>
      <o:AllowPNG/>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml>
  <![endif]-->
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1E293B; }
    .btn-primary { background-color: #0F172A; color: #FFFFFF !important; display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 6px; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; width: 100%;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <!-- Container -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #FFFFFF; border-radius: 8px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);">
          
          <!-- Tenant Header -->
          <tr>
            <td style="padding: 32px 40px 24px 40px; border-bottom: 1px solid #F1F5F9;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left" valign="middle">
                    {% if tenant.logo_url %}
                      <img src="{{ tenant.logo_url }}" alt="{{ tenant.name }}" height="36" style="display: block; max-height: 36px; max-width: 180px; object-fit: contain;">
                    {% else %}
                      <span style="font-size: 20px; font-weight: 700; color: #0F172A; letter-spacing: -0.5px;">{{ tenant.name }}</span>
                    {% endif %}
                  </td>
                  <td align="right" valign="middle" style="font-size: 12px; color: #64748B; font-weight: 500;">
                    {{ tenant.workspace_domain | default('Portal') }}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body Content Block -->
          <tr>
            <td style="padding: 36px 40px;">
              {% block content %}{% endblock %}
            </td>
          </tr>

          <!-- Tenant Signature Block -->
          <tr>
            <td style="padding: 0 40px 32px 40px; font-size: 13px; color: #475569; line-height: 1.6;">
              <div style="font-weight: 600; color: #1E293B;">{{ tenant.signature_name | default(tenant.name) }}</div>
              <div>{{ tenant.signature_title | default('Operations Team') }}</div>
              {% if tenant.support_email %}
                <div>Support: <a href="mailto:{{ tenant.support_email }}" style="color: #2563EB; text-decoration: none;">{{ tenant.support_email }}</a></div>
              {% endif %}
            </td>
          </tr>

          <!-- OxenGL Co-Branded Compliance Footer -->
          <tr>
            <td style="background-color: #F8FAFC; padding: 24px 40px; border-top: 1px solid #E2E8F0; text-align: center;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="font-size: 12px; color: #94A3B8; line-height: 1.5;">
                    <p style="margin: 0 0 8px 0;">
                      This message was sent by <strong>{{ tenant.name }}</strong> via the OxenGL Enterprise Platform.
                    </p>
                    <p style="margin: 0 0 12px 0;">
                      &copy; {{ current_year }} {{ tenant.name }}. All rights reserved.
                    </p>
                    <div style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                      <img src="{{ oxengl_assets_url }}/static/brand/oxengl-monochrome.png" alt="OxenGL" height="14" style="vertical-align: middle; opacity: 0.6;">
                      <span style="font-size: 11px; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.5px;">Powered by <strong>OxenGL</strong></span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

### 3.2 User Invitation Template (`templates/email/invite_user.html`)

```html
{% extends "base_email.html" %}

{% block content %}
<h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0F172A; letter-spacing: -0.5px;">
  Join {{ tenant.name }} on OxenGL
</h1>

<p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
  Hello <strong>{{ user.first_name }}</strong>,
</p>

<p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
  <strong>{{ inviter.name }}</strong> has invited you to join the <strong>{{ tenant.name }}</strong> workspace on OxenGL as <strong>{{ user.role }}</strong>. You can now access your dashboard, operations modules, and business data.
</p>

<!-- Credential Summary Card -->
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; margin: 0 0 28px 0;">
  <tr>
    <td style="padding: 16px 20px;">
      <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748B; margin-bottom: 8px;">Your Account Details</div>
      <div style="font-size: 14px; color: #1E293B; margin-bottom: 6px;">
        <strong>Email:</strong> <span style="font-family: monospace;">{{ user.email }}</span>
      </div>
      {% if user.temp_password %}
      <div style="font-size: 14px; color: #1E293B;">
        <strong>Temporary Password:</strong> <code style="background-color: #E2E8F0; padding: 2px 6px; border-radius: 4px; font-weight: 600;">{{ user.temp_password }}</code>
      </div>
      {% endif %}
    </td>
  </tr>
</table>

<!-- Action Button -->
<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 28px 0;">
  <tr>
    <td align="center">
      <a href="{{ action_url }}" class="btn-primary" target="_blank">
        Activate Account &amp; Log In
      </a>
    </td>
  </tr>
</table>

<p style="font-size: 13px; line-height: 1.5; color: #64748B; margin: 0 0 16px 0;">
  This link is unique to your identity and expires in <strong>{{ expiry_hours | default(48) }} hours</strong>. For security, you will be required to update your temporary password upon first sign-in.
</p>

<!-- Fallback URL -->
<div style="font-size: 12px; color: #94A3B8; word-break: break-all; border-top: 1px solid #F1F5F9; padding-top: 16px;">
  Button not working? Copy and paste this URL into your browser:<br>
  <a href="{{ action_url }}" style="color: #2563EB;">{{ action_url }}</a>
</div>
{% endblock %}
```

---

### 3.3 Password Reset Template (`templates/email/password_reset.html`)

```html
{% extends "base_email.html" %}

{% block content %}
<h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0F172A; letter-spacing: -0.5px;">
  Reset Your Password
</h1>

<p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
  Hello <strong>{{ user.first_name }}</strong>,
</p>

<p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
  We received a request to reset your password for your <strong>{{ tenant.name }}</strong> account on OxenGL. Click below to establish a new password.
</p>

<!-- Action Button -->
<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 28px 0;">
  <tr>
    <td align="center">
      <a href="{{ reset_url }}" class="btn-primary" target="_blank" style="background-color: #2563EB;">
        Set New Password
      </a>
    </td>
  </tr>
</table>

<!-- Audit Box -->
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; border-left: 3px solid #64748B; padding: 12px 16px; margin: 0 0 24px 0;">
  <tr>
    <td style="font-size: 13px; color: #475569; line-height: 1.5;">
      <strong>Security Context:</strong><br>
      Timestamp: {{ request_time }}<br>
      Request IP: {{ request_ip | default('Undisclosed') }}
    </td>
  </tr>
</table>

<p style="font-size: 13px; line-height: 1.5; color: #64748B; margin: 0 0 16px 0;">
  This link will expire in <strong>{{ expiry_minutes | default(30) }} minutes</strong>. If you did not initiate this request, no action is needed; your current credentials remain secure.
</p>

<div style="font-size: 12px; color: #94A3B8; word-break: break-all; border-top: 1px solid #F1F5F9; padding-top: 16px;">
  Direct link: <a href="{{ reset_url }}" style="color: #2563EB;">{{ reset_url }}</a>
</div>
{% endblock %}
```

---

### 3.4 Operational Instructions Template (`templates/email/system_instructions.html`)

```html
{% extends "base_email.html" %}

{% block content %}
<h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0F172A; letter-spacing: -0.5px;">
  {{ instruction_title | default('Standard Operating Instructions') }}
</h1>

<p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
  Hello <strong>{{ user.first_name }}</strong>,
</p>

<p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
  {{ instruction_summary }}
</p>

<!-- Step-by-Step Card -->
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; margin: 0 0 28px 0;">
  <tr>
    <td style="padding: 20px 24px;">
      <div style="font-size: 13px; font-weight: 700; color: #0F172A; margin-bottom: 14px; text-transform: uppercase;">
        Required Steps:
      </div>
      
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        {% for step in steps %}
        <tr>
          <td valign="top" style="width: 28px; padding-bottom: 12px;">
            <div style="width: 20px; height: 20px; background-color: #0F172A; color: #FFFFFF; border-radius: 50%; font-size: 11px; font-weight: 700; text-align: center; line-height: 20px;">
              {{ loop.index }}
            </div>
          </td>
          <td valign="top" style="padding-bottom: 12px; font-size: 14px; color: #334155; line-height: 1.5;">
            <strong>{{ step.title }}:</strong> {{ step.description }}
          </td>
        </tr>
        {% endfor %}
      </table>
    </td>
  </tr>
</table>

{% if action_url %}
<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 28px 0;">
  <tr>
    <td align="center">
      <a href="{{ action_url }}" class="btn-primary" target="_blank">
        {{ button_label | default('Open OxenGL Workspace') }}
      </a>
    </td>
  </tr>
</table>
{% endif %}

<p style="font-size: 13px; line-height: 1.5; color: #64748B; margin: 0;">
  If you have questions about these guidelines, reply directly to this email to reach your administrator.
</p>
{% endblock %}
```

---

### 3.5 Security Alert Template (`templates/email/security_alert.html`)

```html
{% extends "base_email.html" %}

{% block content %}
<div style="display: inline-block; padding: 4px 10px; background-color: #FEF2F2; color: #991B1B; border-radius: 4px; font-size: 12px; font-weight: 600; margin-bottom: 16px;">
  Security Notification
</div>

<h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0F172A; letter-spacing: -0.5px;">
  New Sign-In Detected
</h1>

<p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
  Your account on <strong>{{ tenant.name }}</strong> was accessed from an unrecognized device or location:
</p>

<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; margin: 0 0 24px 0;">
  <tr>
    <td style="padding: 16px 20px; font-size: 13px; color: #334155; line-height: 1.6;">
      <strong>Device/Client:</strong> {{ session.user_agent }}<br>
      <strong>Time:</strong> {{ session.timestamp }}<br>
      <strong>IP Address:</strong> {{ session.ip_address }}<br>
      <strong>Location:</strong> {{ session.location | default('Unknown') }}
    </td>
  </tr>
</table>

<p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
  If this was you, you can ignore this alert. If you did not perform this login, revoke all active sessions immediately and secure your credentials.
</p>

<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 16px 0;">
  <tr>
    <td>
      <a href="{{ secure_account_url }}" class="btn-primary" style="background-color: #DC2626;" target="_blank">
        Review &amp; Lock Account
      </a>
    </td>
  </tr>
</table>
{% endblock %}
```

---

### 3.6 Role & Permissions Update Template (`templates/email/role_updated.html`)

```html
{% extends "base_email.html" %}

{% block content %}
<h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0F172A; letter-spacing: -0.5px;">
  Workspace Permissions Updated
</h1>

<p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
  Hello <strong>{{ user.first_name }}</strong>,
</p>

<p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
  Your permissions within the <strong>{{ tenant.name }}</strong> workspace were updated by <strong>{{ modifier.name }}</strong>.
</p>

<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; margin: 0 0 24px 0;">
  <tr>
    <td style="padding: 16px 20px; font-size: 14px; color: #334155; line-height: 1.6;">
      <div><strong>New Assigned Role:</strong> <span style="color: #0F172A; font-weight: 600;">{{ new_role }}</span></div>
      <div><strong>Effective Date:</strong> {{ effective_date }}</div>
    </td>
  </tr>
</table>

<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0;">
  <tr>
    <td>
      <a href="{{ workspace_url }}" class="btn-primary" target="_blank">
        Open Workspace
      </a>
    </td>
  </tr>
</table>
{% endblock %}
```

---

## 4. Backend Implementation Engine

### 4.1 Configuration (`app/core/config.py`)

```python
from pydantic_settings import BaseSettings
from pydantic import EmailStr
from typing import Optional

class EmailSettings(BaseSettings):
    SMTP_HOST: str = "mail.oxengl.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = "notifications@oxengl.com"
    SMTP_PASSWORD: str = "production-smtp-secret"
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False
    
    # Global OxenGL Platform Identifiers
    OXENGL_SYSTEM_EMAIL: EmailStr = "notifications@oxengl.com"
    OXENGL_ASSETS_BASE_URL: str = "https://assets.oxengl.com"

    class Config:
        env_file = ".env"
        extra = "ignore"

email_settings = EmailSettings()
```

---

### 4.2 Data Schemas (`app/schemas/email.py`)

```python
from pydantic import BaseModel, HttpUrl, EmailStr
from typing import Optional, List, Dict, Any

class TenantBrandContext(BaseModel):
    name: str
    workspace_domain: str
    logo_url: Optional[str] = None
    signature_name: Optional[str] = None
    signature_title: Optional[str] = None
    support_email: Optional[EmailStr] = None

class UserContext(BaseModel):
    first_name: str
    email: EmailStr
    role: Optional[str] = None
    temp_password: Optional[str] = None

class InstructionStep(BaseModel):
    title: str
    description: str
```

---

### 4.3 Email Engine & Dispatcher (`app/services/email_service.py`)

```python
import os
import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict, List, Optional

import aiosmtplib
from jinja2 import Environment, FileSystemLoader, select_autoescape
import premailer

from app.core.config import email_settings
from app.schemas.email import TenantBrandContext

# Initialize Jinja2 Loader
TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates", "email")

jinja_env = Environment(
    loader=FileSystemLoader(TEMPLATE_DIR),
    autoescape=select_autoescape(["html", "xml"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


class EmailService:
    @staticmethod
    def _render_template(template_name: str, context: Dict[str, Any]) -> str:
        """Injects platform constants, renders Jinja2 template, and inlines CSS."""
        template = jinja_env.get_template(template_name)
        
        # Inject standard global parameters
        context.setdefault("current_year", datetime.datetime.now(datetime.timezone.utc).year)
        context.setdefault("oxengl_assets_url", email_settings.OXENGL_ASSETS_BASE_URL)
        
        raw_html = template.render(context)
        # Inline CSS for broad email client support (Outlook, Gmail, etc.)
        return premailer.transform(raw_html)

    @classmethod
    async def send_email(
        cls,
        *,
        recipient_email: str,
        subject: str,
        template_name: str,
        template_context: Dict[str, Any],
        tenant: TenantBrandContext,
        custom_smtp: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Sends standardized transactional email via async SMTP.
        Allows individual tenants to supply custom SMTP overrides or defaults to OxenGL.
        """
        # Ensure tenant dictionary is serializable
        template_context["tenant"] = tenant.model_dump()
        template_context["subject"] = subject
        
        html_content = cls._render_template(template_name, template_context)

        # Standardized Display Name: "[Tenant Name] via OxenGL"
        sender_display_name = f"{tenant.name} via OxenGL"
        system_from = f'"{sender_display_name}" <{email_settings.OXENGL_SYSTEM_EMAIL}>'

        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = system_from
        message["To"] = recipient_email
        
        # Route recipient replies directly to the tenant's support team
        message["Reply-To"] = str(tenant.support_email) if tenant.support_email else str(email_settings.OXENGL_SYSTEM_EMAIL)

        message.attach(MIMEText(html_content, "html", "utf-8"))

        # Determine SMTP configuration (tenant custom override vs OxenGL shared engine)
        smtp_host = custom_smtp.get("host") if custom_smtp else email_settings.SMTP_HOST
        smtp_port = custom_smtp.get("port") if custom_smtp else email_settings.SMTP_PORT
        smtp_user = custom_smtp.get("user") if custom_smtp else email_settings.SMTP_USER
        smtp_pass = custom_smtp.get("password") if custom_smtp else email_settings.SMTP_PASSWORD
        use_tls = custom_smtp.get("use_tls") if custom_smtp else email_settings.SMTP_USE_TLS
        use_ssl = custom_smtp.get("use_ssl") if custom_smtp else email_settings.SMTP_USE_SSL

        try:
            await aiosmtplib.send(
                message,
                hostname=smtp_host,
                port=smtp_port,
                username=smtp_user,
                password=smtp_pass,
                start_tls=use_tls,
                use_tls=use_ssl,
                timeout=15,
            )
            return True
        except Exception as exc:
            print(f"[EmailService Error] Dispatch failed for {recipient_email}: {str(exc)}")
            return False


# ----------------------------------------------------------------------
# High-Level Specialized Dispatchers
# ----------------------------------------------------------------------

async def dispatch_user_invitation(
    *,
    recipient_email: str,
    first_name: str,
    role: str,
    action_url: str,
    inviter_name: str,
    tenant: TenantBrandContext,
    temp_password: Optional[str] = None,
    expiry_hours: int = 48,
    custom_smtp: Optional[Dict[str, Any]] = None,
) -> bool:
    context = {
        "user": {
            "first_name": first_name,
            "email": recipient_email,
            "role": role,
            "temp_password": temp_password,
        },
        "inviter": {"name": inviter_name},
        "action_url": action_url,
        "expiry_hours": expiry_hours,
    }
    return await EmailService.send_email(
        recipient_email=recipient_email,
        subject=f"Invitation to join {tenant.name} on OxenGL",
        template_name="invite_user.html",
        template_context=context,
        tenant=tenant,
        custom_smtp=custom_smtp,
    )


async def dispatch_password_reset(
    *,
    recipient_email: str,
    first_name: str,
    reset_url: str,
    request_ip: str,
    tenant: TenantBrandContext,
    expiry_minutes: int = 30,
    custom_smtp: Optional[Dict[str, Any]] = None,
) -> bool:
    context = {
        "user": {"first_name": first_name, "email": recipient_email},
        "reset_url": reset_url,
        "request_time": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "request_ip": request_ip,
        "expiry_minutes": expiry_minutes,
    }
    return await EmailService.send_email(
        recipient_email=recipient_email,
        subject=f"Reset your password for {tenant.name}",
        template_name="password_reset.html",
        template_context=context,
        tenant=tenant,
        custom_smtp=custom_smtp,
    )


async def dispatch_system_instructions(
    *,
    recipient_email: str,
    first_name: str,
    instruction_title: str,
    instruction_summary: str,
    steps: List[Dict[str, str]],
    tenant: TenantBrandContext,
    action_url: Optional[str] = None,
    button_label: Optional[str] = "Open Workspace",
    custom_smtp: Optional[Dict[str, Any]] = None,
) -> bool:
    context = {
        "user": {"first_name": first_name, "email": recipient_email},
        "instruction_title": instruction_title,
        "instruction_summary": instruction_summary,
        "steps": steps,
        "action_url": action_url,
        "button_label": button_label,
    }
    return await EmailService.send_email(
        recipient_email=recipient_email,
        subject=f"{instruction_title} - {tenant.name}",
        template_name="system_instructions.html",
        template_context=context,
        tenant=tenant,
        custom_smtp=custom_smtp,
    )
```

---

## 5. Multi-Tenant Integration Strategy (Current & Future Tenants)

### 5.1 Database Schema Requirements for Tenants

Every tenant record in OxenGL must store branding metadata so that newly provisioned tenants instantly produce correctly branded templates without code modifications.

```sql
-- Schema Migration for OxenGL Tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url VARCHAR(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS workspace_domain VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS signature_name VARCHAR(100) DEFAULT 'Executive Administration';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS signature_title VARCHAR(100) DEFAULT 'Operations Team';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS support_email VARCHAR(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_smtp_settings JSONB DEFAULT NULL;
```

### 5.2 Dynamic Context Resolution Helper

Any service dispatching messages must resolve the `TenantBrandContext` prior to sending:

```python
def resolve_tenant_branding(tenant_model) -> TenantBrandContext:
    """Extracts branding info from any Tenant model, with sensible defaults."""
    return TenantBrandContext(
        name=tenant_model.name,
        workspace_domain=tenant_model.workspace_domain or f"{tenant_model.slug}.oxengl.com",
        logo_url=tenant_model.logo_url,
        signature_name=tenant_model.signature_name or tenant_model.name,
        signature_title=tenant_model.signature_title or "Workspace Operations",
        support_email=tenant_model.support_email or "support@oxengl.com",
    )
```

---

## 6. Verification and Smoke Test Script

Run this test script to verify template compilation, premailer CSS inlining, and SMTP dispatch:

```python
# scripts/test_email_render.py
import asyncio
from app.schemas.email import TenantBrandContext
from app.services.email_service import dispatch_user_invitation

async def test_invite():
    test_tenant = TenantBrandContext(
        name="Apex Industrial Logistics",
        workspace_domain="apex.oxengl.com",
        logo_url="https://assets.oxengl.com/tenants/demo-logo.png",
        signature_name="Apex Administration",
        signature_title="Identity & Access Management",
        support_email="admin@apex-logistics.com"
    )
    
    success = await dispatch_user_invitation(
        recipient_email="test.user@example.com",
        first_name="Zaid",
        role="Senior Financial Auditor",
        action_url="https://apex.oxengl.com/auth/activate?token=sample_token_123",
        inviter_name="Fatima Al-Jabri",
        tenant=test_tenant,
        temp_password="Oxen#2026!Secure",
        expiry_hours=48
    )
    print(f"Invitation Email Test Status: {'SUCCESS' if success else 'FAILED'}")

if __name__ == "__main__":
    asyncio.run(test_invite())
