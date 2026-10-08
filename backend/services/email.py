"""Standard Python Email Notification Service for OxenGL.

Delivers transactional email notifications for both OxenGL Platform Panel
and Tenant Workspaces using standard Python libraries ONLY (no Jinja2, no aiosmtplib).
Uses built-in smtplib and email.mime.
"""
from __future__ import annotations

import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger("oxengl.email")

# Default paths and asset fallbacks
_DEFAULT_OXENGL_LOGO = "https://oxengl.com/oxengl-logo.svg"
_DEFAULT_COMPANY_ADDRESS = "OxenGL Cloud Systems, Inc. · Riyadh, Saudi Arabia"
_DEFAULT_HELP_URL = "https://oxengl.com/help"
_DEFAULT_PRIVACY_URL = "https://oxengl.com/privacy"
_DEFAULT_SECURITY_URL = "https://oxengl.com/security"


def get_default_template_path() -> str:
    """Resolve the filesystem path to base_notification.html."""
    current_file = Path(__file__).resolve()
    # Check potential relative locations
    candidates = [
        current_file.parents[1] / "app" / "templates" / "emails" / "base_notification.html",
        current_file.parent.parent / "app" / "templates" / "emails" / "base_notification.html",
        Path(__file__).resolve().parent / ".." / "app" / "templates" / "emails" / "base_notification.html",
        Path("/home/ahmed_awadh/oxen_gl/backend/app/templates/emails/base_notification.html"),
    ]
    for candidate in candidates:
        if candidate and candidate.exists():
            return str(candidate.resolve())
    return str(candidates[0].resolve())


def render_html(template_path: str, context: dict) -> str:
    """Render an HTML template by reading file and replacing {{key}} tokens.

    Uses standard Python file operations and string manipulation without Jinja2.
    """
    path_obj = Path(template_path)
    if not path_obj.is_absolute() and not path_obj.exists():
        # Fall back to resolving relative to default template directory
        path_obj = Path(get_default_template_path()).parent / template_path

    with open(str(path_obj), "r", encoding="utf-8") as f:
        content = f.read()

    for key, value in context.items():
        val_str = str(value) if value is not None else ""
        content = content.replace(f"{{{{{key}}}}}", val_str)
        content = content.replace(f"{{{{ {key} }}}}", val_str)

    return content


def send_smtp_email(to_email: str, subject: str, html_body: str, from_name: str) -> bool:
    """Send an email using Python standard library smtplib and email.mime.

    Reads credentials from environment variables:
    - SMTP_HOST (or SMTP_SERVER)
    - SMTP_PORT (default: 587)
    - SMTP_USER
    - SMTP_PASSWORD
    - SMTP_USE_TLS (default: True)
    - EMAILS_FROM_EMAIL (or SMTP_FROM_EMAIL)
    """
    smtp_host = os.getenv("SMTP_HOST") or os.getenv("SMTP_SERVER", "localhost")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    use_tls_env = os.getenv("SMTP_USE_TLS", "true").strip().lower()
    smtp_use_tls = use_tls_env in ("true", "1", "yes", "on")
    from_email = os.getenv("EMAILS_FROM_EMAIL") or os.getenv("SMTP_FROM_EMAIL", "noreply@oxengl.com")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name, from_email))
    msg["To"] = to_email

    msg.attach(MIMEText(html_body, "html", "utf-8"))

    server = None
    try:
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=10)
        server.ehlo()
        if smtp_use_tls:
            server.starttls()
            server.ehlo()
        if smtp_user and smtp_password:
            server.login(smtp_user, smtp_password)
        server.sendmail(from_email, [to_email], msg.as_string())
        logger.info("Successfully sent SMTP email to %s (subject: %s)", to_email, subject)
        return True
    except Exception as exc:
        logger.error("Failed to send SMTP email to %s: %s", to_email, exc)
        return False
    finally:
        if server is not None:
            try:
                server.quit()
            except Exception:
                try:
                    server.close()
                except Exception:
                    pass


def send_platform_admin_invite(
    to_email: str,
    user_first_name: str,
    target_url: str,
    action_text: str = "Access Platform Panel",
    *,
    template_path: Optional[str] = None,
) -> bool:
    """Context builder and dispatcher for OxenGL Platform Admin invitations.

    Brand: OxenGL Platform
    Team: "The OxenGL Platform Team"
    Subtext: "Cloud Enterprise Management Infrastructure"
    Footer: "OxenGL Global Operations"
    """
    tmpl_path = template_path or get_default_template_path()
    brand_name = "OxenGL Platform"
    logo_url = os.getenv("OXENGL_LOGO_URL", _DEFAULT_OXENGL_LOGO)
    subject = "Welcome to the OxenGL Platform"

    context: Dict[str, Any] = {
        "subject": subject,
        "logo_url": logo_url,
        "brand_name": brand_name,
        "header_title": "Welcome to the OxenGL Platform",
        "user_first_name": user_first_name or "Administrator",
        "message_body": (
            "You have been invited to access the OxenGL Platform Panel as an administrator. "
            "Please click the button below to accept your invitation and configure your credentials."
        ),
        "target_url": target_url,
        "action_button_text": action_text or "Access Platform Panel",
        "sender_team": "The OxenGL Platform Team",
        "sender_subtext": "Cloud Enterprise Management Infrastructure",
        "footer_org_name": "OxenGL Global Operations",
        "company_address": os.getenv("COMPANY_ADDRESS", _DEFAULT_COMPANY_ADDRESS),
        "help_url": os.getenv("HELP_URL", _DEFAULT_HELP_URL),
        "privacy_url": os.getenv("PRIVACY_URL", _DEFAULT_PRIVACY_URL),
        "security_url": os.getenv("SECURITY_URL", _DEFAULT_SECURITY_URL),
        "footer_disclaimer": (
            "This is an official system transmission from the OxenGL Platform Panel. "
            "Replies to this address are monitored by system automated services."
        ),
    }

    html_body = render_html(tmpl_path, context)
    return send_smtp_email(
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        from_name="OxenGL Platform",
    )


def send_tenant_member_invite(
    to_email: str,
    user_first_name: str,
    inviter_name: str,
    tenant_name: str,
    target_url: str,
    tenant_logo_url: Optional[str] = None,
    *,
    template_path: Optional[str] = None,
) -> bool:
    """Context builder and dispatcher for Tenant Workspace member invitations.

    Brand: Tenant Name
    Logo: tenant_logo_url or fallback OxenGL logo
    Team: "The {tenant_name} Team"
    Subtext: "Powered by OxenGL SaaS Platform"
    Footer: "{tenant_name} · Powered by OxenGL"
    """
    tmpl_path = template_path or get_default_template_path()
    brand_name = tenant_name or "Workspace"
    fallback_logo = os.getenv("OXENGL_LOGO_URL", _DEFAULT_OXENGL_LOGO)
    logo_url = tenant_logo_url if tenant_logo_url else fallback_logo
    subject = f"Invitation to join {brand_name} on OxenGL"

    inviter = inviter_name or "A workspace administrator"
    message_body = (
        f"{inviter} has invited you to join the {brand_name} workspace on OxenGL. "
        "Click the button below to accept the invitation and sign in to your workspace."
    )

    context: Dict[str, Any] = {
        "subject": subject,
        "logo_url": logo_url,
        "brand_name": brand_name,
        "header_title": f"Welcome to {brand_name} on OxenGL",
        "user_first_name": user_first_name or "Team Member",
        "message_body": message_body,
        "target_url": target_url,
        "action_button_text": f"Join {brand_name}",
        "sender_team": f"The {brand_name} Team",
        "sender_subtext": "Powered by OxenGL SaaS Platform",
        "footer_org_name": f"{brand_name} · Powered by OxenGL",
        "company_address": f"{brand_name} · Powered by OxenGL Cloud Systems",
        "help_url": os.getenv("HELP_URL", _DEFAULT_HELP_URL),
        "privacy_url": os.getenv("PRIVACY_URL", _DEFAULT_PRIVACY_URL),
        "security_url": os.getenv("SECURITY_URL", _DEFAULT_SECURITY_URL),
        "footer_disclaimer": (
            f"You received this message because an administrator in {brand_name} "
            "triggered an invitation associated with your email address."
        ),
    }

    html_body = render_html(tmpl_path, context)
    return send_smtp_email(
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        from_name=f"{brand_name} via OxenGL",
    )


def send_password_reset_email(
    to_email: str,
    user_first_name: str,
    reset_url: str,
    is_platform: bool = False,
    tenant_name: Optional[str] = None,
    *,
    template_path: Optional[str] = None,
) -> bool:
    """Context builder and dispatcher for password recovery notifications.

    Uses base_notification.html without Jinja2.
    Subject: 'Reset your OxenGL password' or 'Reset your {tenant_name} password'
    Header Title: 'Password Reset Request'
    Message Body: 'We received a request to reset your password. Click the link below to set a new password. This link is valid for a limited time. If you did not request this, please ignore this email or contact security immediately.'
    Action Button Text: 'Reset Password'
    Sender Details: OxenGL Platform signature if is_platform=True, else Tenant signature.
    """
    tmpl_path = template_path or get_default_template_path()
    fallback_logo = os.getenv("OXENGL_LOGO_URL", _DEFAULT_OXENGL_LOGO)

    if is_platform or not tenant_name:
        brand_name = "OxenGL Platform"
        subject = "Reset your OxenGL password"
        sender_team = "The OxenGL Platform Team"
        sender_subtext = "Cloud Enterprise Management Infrastructure"
        footer_org_name = "OxenGL Global Operations"
        company_address = os.getenv("COMPANY_ADDRESS", _DEFAULT_COMPANY_ADDRESS)
        footer_disclaimer = (
            "This is an official system transmission from the OxenGL Platform Panel. "
            "Replies to this address are monitored by system automated services."
        )
        from_name = "OxenGL Security"
        logo_url = fallback_logo
    else:
        brand_name = tenant_name
        subject = f"Reset your {tenant_name} password"
        sender_team = f"The {tenant_name} Team"
        sender_subtext = "Powered by OxenGL SaaS Platform"
        footer_org_name = f"{tenant_name} · Powered by OxenGL"
        company_address = f"{tenant_name} · Powered by OxenGL Cloud Systems"
        footer_disclaimer = (
            f"You received this message because a password reset was requested for your account in {tenant_name}."
        )
        from_name = f"{tenant_name} Security via OxenGL"
        logo_url = fallback_logo

    context: Dict[str, Any] = {
        "subject": subject,
        "logo_url": logo_url,
        "brand_name": brand_name,
        "header_title": "Password Reset Request",
        "user_first_name": user_first_name or "there",
        "message_body": (
            "We received a request to reset your password. Click the link below to set a new password. "
            "This link is valid for a limited time. If you did not request this, please ignore this email "
            "or contact security immediately."
        ),
        "target_url": reset_url,
        "action_button_text": "Reset Password",
        "sender_team": sender_team,
        "sender_subtext": sender_subtext,
        "footer_org_name": footer_org_name,
        "company_address": company_address,
        "help_url": os.getenv("HELP_URL", _DEFAULT_HELP_URL),
        "privacy_url": os.getenv("PRIVACY_URL", _DEFAULT_PRIVACY_URL),
        "security_url": os.getenv("SECURITY_URL", _DEFAULT_SECURITY_URL),
        "footer_disclaimer": footer_disclaimer,
    }

    html_body = render_html(tmpl_path, context)
    return send_smtp_email(
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        from_name=from_name,
    )

