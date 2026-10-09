try:
    from backend.services.email import (
        get_default_template_path,
        render_html,
        send_password_reset_email,
        send_platform_admin_invite,
        send_smtp_email,
        send_tenant_member_invite,
    )
except ImportError:
    from services.email import (
        get_default_template_path,
        render_html,
        send_password_reset_email,
        send_platform_admin_invite,
        send_smtp_email,
        send_tenant_member_invite,
    )

try:
    from backend.app.services.email_service import (
        EmailService,
        resolve_tenant_branding,
        dispatch_user_invitation,
        dispatch_password_reset,
        dispatch_system_instructions,
        dispatch_security_alert,
        dispatch_role_updated,
    )
except ImportError:
    from app.services.email_service import (
        EmailService,
        resolve_tenant_branding,
        dispatch_user_invitation,
        dispatch_password_reset,
        dispatch_system_instructions,
        dispatch_security_alert,
        dispatch_role_updated,
    )

__all__ = [
    "get_default_template_path",
    "render_html",
    "send_smtp_email",
    "send_platform_admin_invite",
    "send_tenant_member_invite",
    "send_password_reset_email",
    "EmailService",
    "resolve_tenant_branding",
    "dispatch_user_invitation",
    "dispatch_password_reset",
    "dispatch_system_instructions",
    "dispatch_security_alert",
    "dispatch_role_updated",
]
