"""Unit and integration tests for standard Python email notification system.

Tests:
1. HTML template loading and token rendering (render_html) without Jinja2.
2. SMTP delivery via smtplib (send_smtp_email).
3. Context builders for Platform Admin and Tenant Member invites.
4. FastAPI BackgroundTasks integration in tenant team invite endpoint.
"""
import base64
from unittest.mock import MagicMock, patch
import pytest

from backend.services.email import (
    get_default_template_path,
    render_html,
    send_platform_admin_invite,
    send_smtp_email,
    send_tenant_member_invite,
)


def test_render_html_replaces_all_tokens():
    """Verify render_html substitutes all {{key}} placeholders without Jinja2."""
    template_path = get_default_template_path()
    context = {
        "subject": "Platform Welcome",
        "logo_url": "https://cdn.oxengl.com/logo.png",
        "brand_name": "OxenGL Enterprise",
        "header_title": "Welcome to Your Workspace",
        "user_first_name": "Tariq",
        "message_body": "Your account has been provisioned.",
        "target_url": "https://app.oxengl.me/verify?token=xyz",
        "action_button_text": "Activate Account",
        "sender_team": "The OxenGL Platform Team",
        "sender_subtext": "Cloud Enterprise Management Infrastructure",
        "footer_org_name": "OxenGL Global Operations",
        "company_address": "Riyadh Tech District, KSA",
        "help_url": "https://oxengl.com/help",
        "privacy_url": "https://oxengl.com/privacy",
        "security_url": "https://oxengl.com/security",
        "footer_disclaimer": "Official automated transmission.",
    }

    rendered = render_html(template_path, context)

    # Assert all keys were replaced and no raw curly braces remain for these keys
    assert "Platform Welcome" in rendered
    assert "https://cdn.oxengl.com/logo.png" in rendered
    assert "OxenGL Enterprise Logo" in rendered
    assert "Welcome to Your Workspace" in rendered
    assert "Hi <strong>Tariq</strong>" in rendered
    assert "Your account has been provisioned." in rendered
    assert "https://app.oxengl.me/verify?token=xyz" in rendered
    assert "Activate Account" in rendered
    assert "The OxenGL Platform Team" in rendered
    assert "Cloud Enterprise Management Infrastructure" in rendered
    assert "OxenGL Global Operations" in rendered
    assert "Riyadh Tech District, KSA" in rendered
    assert "https://oxengl.com/help" in rendered
    assert "https://oxengl.com/privacy" in rendered
    assert "https://oxengl.com/security" in rendered
    assert "Official automated transmission." in rendered

    # No unreplaced template tokens
    assert "{{" not in rendered
    assert "}}" not in rendered


def test_send_smtp_email_success():
    """Verify send_smtp_email connects, negotiates TLS, logs in, and dispatches."""
    mock_smtp_instance = MagicMock()

    with patch("smtplib.SMTP", return_value=mock_smtp_instance) as mock_smtp_cls, \
         patch.dict("os.environ", {
             "SMTP_HOST": "mail.example.com",
             "SMTP_PORT": "587",
             "SMTP_USER": "mailer@example.com",
             "SMTP_PASSWORD": "SecretPassword123",
             "SMTP_USE_TLS": "true",
             "EMAILS_FROM_EMAIL": "notifications@example.com",
         }):

        success = send_smtp_email(
            to_email="recipient@example.com",
            subject="Test Subject",
            html_body="<p>Hello World</p>",
            from_name="OxenGL Test",
        )

        assert success is True
        mock_smtp_cls.assert_called_once_with("mail.example.com", 587, timeout=10)
        mock_smtp_instance.starttls.assert_called_once()
        mock_smtp_instance.login.assert_called_once_with("mailer@example.com", "SecretPassword123")
        mock_smtp_instance.sendmail.assert_called_once()

        # Check sendmail arguments
        args, _ = mock_smtp_instance.sendmail.call_args
        assert args[0] == "notifications@example.com"
        assert args[1] == ["recipient@example.com"]
        raw_msg = args[2]
        assert "Subject: Test Subject" in raw_msg
        assert "From: OxenGL Test <notifications@example.com>" in raw_msg
        # Body is base64 encoded by MIMEText when utf-8 charset is specified
        expected_b64 = base64.b64encode(b"<p>Hello World</p>").decode("ascii")
        assert expected_b64 in raw_msg
        mock_smtp_instance.quit.assert_called_once()


def test_send_smtp_email_error_handling():
    """Verify send_smtp_email handles connection failure gracefully."""
    with patch("smtplib.SMTP", side_effect=OSError("Connection refused")):
        success = send_smtp_email(
            to_email="recipient@example.com",
            subject="Test Subject",
            html_body="<p>Hello World</p>",
            from_name="OxenGL Test",
        )
        assert success is False


def test_send_platform_admin_invite():
    """Verify send_platform_admin_invite context and dispatch."""
    with patch("backend.services.email.send_smtp_email", return_value=True) as mock_send:
        result = send_platform_admin_invite(
            to_email="superadmin@oxengl.com",
            user_first_name="Ahmed",
            target_url="https://admin.oxengl.com/setup?key=123",
            action_text="Setup Administrator Account",
        )

        assert result is True
        mock_send.assert_called_once()
        _, kwargs = mock_send.call_args
        assert kwargs["to_email"] == "superadmin@oxengl.com"
        assert kwargs["from_name"] == "OxenGL Platform"
        html = kwargs["html_body"]
        assert "Hi <strong>Ahmed</strong>" in html
        assert "OxenGL Platform" in html
        assert "The OxenGL Platform Team" in html
        assert "Cloud Enterprise Management Infrastructure" in html
        assert "OxenGL Global Operations" in html
        assert "https://admin.oxengl.com/setup?key=123" in html
        assert "Setup Administrator Account" in html


def test_send_tenant_member_invite():
    """Verify send_tenant_member_invite context, logo fallback, and branding."""
    with patch("backend.services.email.send_smtp_email", return_value=True) as mock_send:
        result = send_tenant_member_invite(
            to_email="staff@acme.com",
            user_first_name="Sarah",
            inviter_name="Faisal Al-Otaibi",
            tenant_name="Acme Logistics",
            target_url="https://acme.oxengl.me/tenant/login",
            tenant_logo_url="https://acme.com/logo.png",
        )

        assert result is True
        mock_send.assert_called_once()
        _, kwargs = mock_send.call_args
        assert kwargs["to_email"] == "staff@acme.com"
        assert kwargs["from_name"] == "Acme Logistics via OxenGL"
        html = kwargs["html_body"]
        assert "Hi <strong>Sarah</strong>" in html
        assert "Acme Logistics" in html
        assert "https://acme.com/logo.png" in html
        assert "Faisal Al-Otaibi has invited you to join the Acme Logistics workspace" in html
        assert "The Acme Logistics Team" in html
        assert "Powered by OxenGL SaaS Platform" in html
        assert "Acme Logistics · Powered by OxenGL" in html
        assert "https://acme.oxengl.me/tenant/login" in html


def test_send_tenant_member_invite_fallback_logo():
    """Verify fallback logo when tenant_logo_url is None."""
    with patch("backend.services.email.send_smtp_email", return_value=True) as mock_send:
        result = send_tenant_member_invite(
            to_email="staff@acme.com",
            user_first_name="Sarah",
            inviter_name="Faisal Al-Otaibi",
            tenant_name="Acme Logistics",
            target_url="https://acme.oxengl.me/tenant/login",
            tenant_logo_url=None,
        )

        assert result is True
        _, kwargs = mock_send.call_args
        html = kwargs["html_body"]
        assert "https://oxengl.com/oxengl-logo.svg" in html


def test_tenant_invite_endpoint_background_task_dispatch():
    """Verify /api/v1/tenant/control/team/invite enqueues send_tenant_member_invite."""
    from fastapi import BackgroundTasks
    from backend.app.api.v1.tenant_control import invite_team_member, InviteMemberRequest
    import uuid

    mock_db = MagicMock()
    # Mock no existing user
    mock_db.query().filter().first.return_value = None

    # Mock company
    mock_company = MagicMock()
    mock_company.name = "Desert Transport Co."
    mock_company.slug = "desert-trans"
    mock_company.ui_logo_url = "https://desert.sa/logo.png"

    def query_side_effect(model):
        m = MagicMock()
        if hasattr(model, "__name__") and model.__name__ == "ResCompany":
            m.filter.return_value.first.return_value = mock_company
        elif hasattr(model, "__name__") and model.__name__ == "ResUser":
            m.filter.return_value.first.return_value = None
        else:
            m.filter.return_value.first.return_value = None
        return m

    mock_db.query.side_effect = query_side_effect

    mock_current_user = MagicMock()
    mock_current_user.company_id = uuid.uuid4()
    mock_current_user.role = "Admin"
    mock_current_user.full_name = "Khalid Admin"
    mock_current_user.email = "admin@desert.sa"

    payload = InviteMemberRequest(
        email="new_driver@desert.sa",
        full_name="Rashid Mansoor",
        role="user",
        department="Logistics",
    )

    bg_tasks = BackgroundTasks()

    with patch("backend.app.services.billing_service.verify_tenant_seat_limit", return_value=(True, "OK")), \
         patch("backend.app.services.billing_service.increment_tenant_seat_usage", return_value=None):

        response = invite_team_member(
            payload=payload,
            background_tasks=bg_tasks,
            current_user=mock_current_user,
            db=mock_db,
        )

        assert response["success"] is True
        assert "Invitation email dispatched" in response["message"]
        assert response["member"]["email"] == "new_driver@desert.sa"

        # Check background tasks
        assert len(bg_tasks.tasks) == 1
        task = bg_tasks.tasks[0]
        assert task.func == send_tenant_member_invite
        assert task.kwargs["to_email"] == "new_driver@desert.sa"
        assert task.kwargs["user_first_name"] == "Rashid"
        assert task.kwargs["inviter_name"] == "Khalid Admin"
        assert task.kwargs["tenant_name"] == "Desert Transport Co."
        assert task.kwargs["target_url"] == "https://desert-trans.oxengl.me/tenant/login"
        assert task.kwargs["tenant_logo_url"] == "https://desert.sa/logo.png"
