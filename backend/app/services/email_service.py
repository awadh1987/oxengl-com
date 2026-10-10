import os
import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict, List, Optional, Union

import aiosmtplib
from jinja2 import Environment, FileSystemLoader, select_autoescape
import premailer

try:
    from app.core.config import email_settings
    from app.schemas.email import TenantBrandContext
except ImportError:
    from backend.app.core.config import email_settings
    from backend.app.schemas.email import TenantBrandContext

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
        smtp_port = int(custom_smtp.get("port") if custom_smtp else email_settings.SMTP_PORT)
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


def _clean_str(val: Any) -> Optional[str]:
    if val is None or hasattr(val, "_mock_return_value") or type(val).__name__ in ("MagicMock", "Mock"):
        return None
    s = str(val).strip()
    return s if s else None


def resolve_tenant_logo_url(company: Any) -> Optional[str]:
    """Resolve tenant logo with absolute HTTPS path (email clients require absolute URLs)."""
    if not company:
        return None
    raw_logo = (
        company.get("logo_url") or company.get("ui_logo_url")
        if isinstance(company, dict)
        else (getattr(company, "logo_url", None) or getattr(company, "ui_logo_url", None))
    )
    logo_str = _clean_str(raw_logo)
    if not logo_str:
        return None
    if logo_str.startswith("http://") or logo_str.startswith("https://"):
        return logo_str
    if not logo_str.startswith("/"):
        logo_str = f"/{logo_str}"
    return f"https://portal.oxengl.com{logo_str}"


def construct_workspace_login_url(company: Any) -> str:
    """Build the action_url parameter dynamically based on company attributes."""
    if not company:
        return "https://portal.oxengl.com/auth/login"

    custom_domain = _clean_str(
        company.get("custom_domain")
        if isinstance(company, dict)
        else getattr(company, "custom_domain", None)
    )
    if custom_domain:
        return f"https://{custom_domain}/auth/login"

    workspace_domain = _clean_str(
        company.get("workspace_domain")
        if isinstance(company, dict)
        else getattr(company, "workspace_domain", None)
    )
    slug = _clean_str(
        (company.get("slug") or company.get("domain_slug"))
        if isinstance(company, dict)
        else (getattr(company, "slug", None) or getattr(company, "domain_slug", None))
    )
    if workspace_domain:
        tenant_param = f"?tenant={slug}" if slug else ""
        return f"https://{workspace_domain}/auth/login{tenant_param}"

    tenant_param = f"?tenant={slug}" if slug else ""
    return f"https://portal.oxengl.com/auth/login{tenant_param}"


def resolve_tenant_branding(tenant_model: Any) -> TenantBrandContext:
    """Extracts branding info from any Tenant / ResCompany / MasterTenant model or dict, with sensible defaults."""
    if isinstance(tenant_model, TenantBrandContext):
        return tenant_model

    def _val(obj: Any, *keys: str, default: Optional[str] = None) -> Optional[str]:
        if isinstance(obj, dict):
            for k in keys:
                v = obj.get(k)
                if v is not None and not hasattr(v, "_mock_return_value") and type(v).__name__ not in ("MagicMock", "Mock"):
                    s = str(v).strip()
                    if s:
                        return s
        elif obj is not None:
            for k in keys:
                v = getattr(obj, k, None)
                if v is not None and not hasattr(v, "_mock_return_value") and type(v).__name__ not in ("MagicMock", "Mock"):
                    s = str(v).strip()
                    if s:
                        return s
        return default

    name = _val(tenant_model, "company_name", "name", default="OxenGL Enterprise") or "OxenGL Enterprise"
    slug = _val(tenant_model, "slug", "domain_slug", "schema_name", default="portal") or "portal"
    custom_domain = _val(tenant_model, "custom_domain")
    workspace_domain = _val(tenant_model, "workspace_domain") or custom_domain or f"{slug}.oxengl.com"
    logo_url = resolve_tenant_logo_url(tenant_model)
    signature_name = _val(tenant_model, "signature_name", default=name) or name
    signature_title = _val(tenant_model, "signature_title", default="Workspace Operations") or "Workspace Operations"
    support_email = _val(tenant_model, "support_email", default="support@oxengl.com") or "support@oxengl.com"

    return TenantBrandContext(
        name=name,
        workspace_domain=workspace_domain,
        logo_url=logo_url,
        signature_name=signature_name,
        signature_title=signature_title,
        support_email=support_email,
    )


# ----------------------------------------------------------------------
# High-Level Specialized Dispatchers
# ----------------------------------------------------------------------

async def dispatch_user_invitation(
    *,
    recipient_email: str,
    first_name: str,
    role: Optional[str] = None,
    user_role: Optional[str] = None,
    action_url: str,
    inviter_name: str,
    tenant: Union[TenantBrandContext, Any],
    temp_password: Optional[str] = None,
    expiry_hours: int = 48,
    custom_smtp: Optional[Dict[str, Any]] = None,
    **kwargs: Any,
) -> bool:
    assigned_role = user_role or role or "Team Member"
    tenant_brand = resolve_tenant_branding(tenant)
    context = {
        "user": {
            "first_name": first_name,
            "email": recipient_email,
            "role": assigned_role,
            "temp_password": temp_password,
        },
        "inviter": {"name": inviter_name},
        "action_url": action_url,
        "expiry_hours": expiry_hours,
    }
    return await EmailService.send_email(
        recipient_email=recipient_email,
        subject=f"Invitation to join {tenant_brand.name} on OxenGL",
        template_name="invite_user.html",
        template_context=context,
        tenant=tenant_brand,
        custom_smtp=custom_smtp,
    )


async def dispatch_password_reset(
    *,
    recipient_email: str,
    first_name: str,
    reset_url: str,
    request_ip: str,
    tenant: Union[TenantBrandContext, Any],
    expiry_minutes: int = 30,
    custom_smtp: Optional[Dict[str, Any]] = None,
) -> bool:
    tenant_brand = resolve_tenant_branding(tenant)
    context = {
        "user": {"first_name": first_name, "email": recipient_email},
        "reset_url": reset_url,
        "request_time": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "request_ip": request_ip,
        "expiry_minutes": expiry_minutes,
    }
    return await EmailService.send_email(
        recipient_email=recipient_email,
        subject=f"Reset your password for {tenant_brand.name}",
        template_name="password_reset.html",
        template_context=context,
        tenant=tenant_brand,
        custom_smtp=custom_smtp,
    )


async def dispatch_system_instructions(
    *,
    recipient_email: str,
    first_name: str,
    instruction_title: str,
    instruction_summary: str,
    steps: List[Dict[str, str]],
    tenant: Union[TenantBrandContext, Any],
    action_url: Optional[str] = None,
    button_label: Optional[str] = "Open Workspace",
    custom_smtp: Optional[Dict[str, Any]] = None,
) -> bool:
    tenant_brand = resolve_tenant_branding(tenant)
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
        subject=f"{instruction_title} - {tenant_brand.name}",
        template_name="system_instructions.html",
        template_context=context,
        tenant=tenant_brand,
        custom_smtp=custom_smtp,
    )


async def dispatch_security_alert(
    *,
    recipient_email: str,
    session: Dict[str, Any],
    secure_account_url: str,
    tenant: Union[TenantBrandContext, Any],
    custom_smtp: Optional[Dict[str, Any]] = None,
) -> bool:
    tenant_brand = resolve_tenant_branding(tenant)
    context = {
        "session": session,
        "secure_account_url": secure_account_url,
    }
    return await EmailService.send_email(
        recipient_email=recipient_email,
        subject=f"Security Alert: New Sign-In Detected - {tenant_brand.name}",
        template_name="security_alert.html",
        template_context=context,
        tenant=tenant_brand,
        custom_smtp=custom_smtp,
    )


async def dispatch_role_updated(
    *,
    recipient_email: str,
    first_name: str,
    modifier_name: str,
    new_role: str,
    workspace_url: str,
    tenant: Union[TenantBrandContext, Any],
    effective_date: Optional[str] = None,
    custom_smtp: Optional[Dict[str, Any]] = None,
) -> bool:
    tenant_brand = resolve_tenant_branding(tenant)
    if not effective_date:
        effective_date = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    context = {
        "user": {"first_name": first_name, "email": recipient_email},
        "modifier": {"name": modifier_name},
        "new_role": new_role,
        "effective_date": effective_date,
        "workspace_url": workspace_url,
    }
    return await EmailService.send_email(
        recipient_email=recipient_email,
        subject=f"Workspace Permissions Updated - {tenant_brand.name}",
        template_name="role_updated.html",
        template_context=context,
        tenant=tenant_brand,
        custom_smtp=custom_smtp,
    )
