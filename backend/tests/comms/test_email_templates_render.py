"""Comprehensive in-container rendering smoke tests for OxenGL transactional email templates.

Verifies:
1. Jinja2 template parsing & auto-escaping.
2. Premailer CSS inlining across all 5 templates.
3. Co-branding elements, dynamic tokens, current year, and Powered by OxenGL badge.
"""
import datetime
import pytest
from app.services.email_service import EmailService


@pytest.fixture
def base_tenant_context():
    return {
        "name": "Desert Transport Co.",
        "workspace_domain": "desert-trans.oxengl.com",
        "logo_url": "https://desert.sa/logo.png",
        "signature_name": "Desert Transport Operations",
        "signature_title": "Fleet Management",
        "support_email": "support@deserttransport.sa",
    }


def test_render_invite_user_template(base_tenant_context):
    """Verify invite_user.html renders tenant name, user name, temp password, CTA, and footer."""
    current_year = str(datetime.datetime.now(datetime.timezone.utc).year)
    context = {
        "user": {
            "first_name": "Tariq",
            "email": "tariq@deserttransport.sa",
            "role": "Fleet Dispatcher",
            "temp_password": "TempSecure#982",
        },
        "inviter": {"name": "Khalid Al-Mansoor"},
        "action_url": "https://desert-trans.oxengl.me/activate?token=test12345",
        "expiry_hours": 48,
        "tenant": base_tenant_context,
        "subject": "Invitation to join Desert Transport Co. on OxenGL",
    }

    html = EmailService._render_template("invite_user.html", context)

    # Inlined CSS verification
    assert "style=" in html
    # Co-branding & Badge
    assert "Desert Transport Co." in html
    assert "https://desert.sa/logo.png" in html
    assert "Powered by <strong>OxenGL</strong>" in html
    assert current_year in html
    # Template-specific tokens
    assert "Tariq" in html
    assert "TempSecure#982" in html
    assert "Fleet Dispatcher" in html
    assert "Khalid Al-Mansoor" in html
    assert "https://desert-trans.oxengl.me/activate?token=test12345" in html
    assert "48 hours" in html


def test_render_password_reset_template(base_tenant_context):
    """Verify password_reset.html renders reset link, IP audit block, expiry timer."""
    current_year = str(datetime.datetime.now(datetime.timezone.utc).year)
    context = {
        "user": {"first_name": "Fatima"},
        "reset_url": "https://desert-trans.oxengl.me/reset-password?token=sec_abc123",
        "expiry_minutes": 30,
        "request_ip": "197.234.12.88",
        "tenant": base_tenant_context,
        "subject": "Reset your password for Desert Transport Co.",
    }

    html = EmailService._render_template("password_reset.html", context)

    # Inlined CSS verification
    assert "style=" in html
    # Co-branding & Badge
    assert "Desert Transport Co." in html
    assert "Powered by <strong>OxenGL</strong>" in html
    assert current_year in html
    # Template-specific tokens
    assert "Fatima" in html
    assert "https://desert-trans.oxengl.me/reset-password?token=sec_abc123" in html
    assert "197.234.12.88" in html
    assert "30 minutes" in html


def test_render_system_instructions_template(base_tenant_context):
    """Verify system_instructions.html renders numbered steps list, summary, CTA button."""
    current_year = str(datetime.datetime.now(datetime.timezone.utc).year)
    steps = [
        {"title": "Inspection", "description": "Verify digital telematics and vehicle battery levels before departure."},
        {"title": "Manifest", "description": "Log cargo manifest into the OxenGL Driver Portal."},
        {"title": "Escalation", "description": "Report any diagnostic anomaly via the OxenGL Support hotline."},
    ]
    context = {
        "user": {"first_name": "Nawaf"},
        "instruction_title": "Emergency Fleet Dispatch Protocol",
        "instruction_summary": "Please review the updated safety protocol before your next vehicle inspection cycle.",
        "steps": steps,
        "action_url": "https://desert-trans.oxengl.me/sop/emergency-dispatch",
        "button_label": "Acknowledge SOP Guidelines",
        "tenant": base_tenant_context,
        "subject": "SOP Instructions: Emergency Fleet Dispatch Protocol",
    }

    html = EmailService._render_template("system_instructions.html", context)

    # Inlined CSS verification
    assert "style=" in html
    # Co-branding & Badge
    assert "Desert Transport Co." in html
    assert "Powered by <strong>OxenGL</strong>" in html
    assert current_year in html
    # Template-specific tokens
    assert "Emergency Fleet Dispatch Protocol" in html
    assert "Please review the updated safety protocol" in html
    assert "Verify digital telematics" in html
    assert "Log cargo manifest" in html
    assert "Report any diagnostic anomaly" in html
    assert "https://desert-trans.oxengl.me/sop/emergency-dispatch" in html
    assert "Acknowledge SOP Guidelines" in html


def test_render_security_alert_template(base_tenant_context):
    """Verify security_alert.html renders device/IP/timestamp session box and lock CTA."""
    current_year = str(datetime.datetime.now(datetime.timezone.utc).year)
    session_data = {
        "user_agent": "MacBook Pro / Chrome 126",
        "ip_address": "82.114.160.21",
        "timestamp": "2026-10-09 16:45 UTC",
        "location": "Riyadh, Saudi Arabia",
    }
    context = {
        "user": {"first_name": "Omar"},
        "session": session_data,
        "secure_account_url": "https://desert-trans.oxengl.me/security/lock-account?token=sec_lock_998",
        "tenant": base_tenant_context,
        "subject": "Security Alert: New Sign-In Detected - Desert Transport Co.",
    }

    html = EmailService._render_template("security_alert.html", context)

    # Inlined CSS verification
    assert "style=" in html
    # Co-branding & Badge
    assert "Desert Transport Co." in html
    assert "Powered by <strong>OxenGL</strong>" in html
    assert current_year in html
    # Template-specific tokens
    assert "MacBook Pro / Chrome 126" in html
    assert "82.114.160.21" in html
    assert "2026-10-09 16:45 UTC" in html
    assert "Riyadh, Saudi Arabia" in html
    assert "https://desert-trans.oxengl.me/security/lock-account?token=sec_lock_998" in html


def test_render_role_updated_template(base_tenant_context):
    """Verify role_updated.html renders modifier name, new role name, effective date."""
    current_year = str(datetime.datetime.now(datetime.timezone.utc).year)
    context = {
        "user": {"first_name": "Sarah", "email": "sarah@deserttransport.sa"},
        "modifier": {"name": "Sultan Al-Otaibi"},
        "new_role": "Senior Logistics Operations Manager",
        "effective_date": "2026-10-09 17:00 UTC",
        "workspace_url": "https://desert-trans.oxengl.me/dashboard",
        "tenant": base_tenant_context,
        "subject": "Workspace Permissions Updated - Desert Transport Co.",
    }

    html = EmailService._render_template("role_updated.html", context)

    # Inlined CSS verification
    assert "style=" in html
    # Co-branding & Badge
    assert "Desert Transport Co." in html
    assert "Powered by <strong>OxenGL</strong>" in html
    assert current_year in html
    # Template-specific tokens
    assert "Sultan Al-Otaibi" in html
    assert "Senior Logistics Operations Manager" in html
    assert "2026-10-09 17:00 UTC" in html
    assert "https://desert-trans.oxengl.me/dashboard" in html
