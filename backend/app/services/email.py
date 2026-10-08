"""Re-export email service functions from backend.services.email."""
from backend.services.email import (
    get_default_template_path,
    render_html,
    send_password_reset_email,
    send_platform_admin_invite,
    send_smtp_email,
    send_tenant_member_invite,
)

__all__ = [
    "get_default_template_path",
    "render_html",
    "send_smtp_email",
    "send_platform_admin_invite",
    "send_tenant_member_invite",
    "send_password_reset_email",
]
