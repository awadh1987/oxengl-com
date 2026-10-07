import pytest

from backend.app.services import account_lookup as al
from backend.app.services import communication_service as svc


def test_phone_detection_and_digits():
    assert al.looks_like_phone("+966 50 123 4567")
    assert not al.looks_like_phone("user@example.com")
    assert al.phone_digits("00966-50-123") == "96650123"


def test_render_template_is_json_safe():
    out = svc.render_payload_template('{"to":"{phone}","m":{"t":"{message}"}}', "+1", 'a"b},{')
    assert out == {"to": "+1", "m": {"t": 'a"b},{'}}


def test_headers_validation():
    assert svc.parse_custom_headers('{"Authorization":"Bearer x"}') == {"Authorization": "Bearer x"}
    with pytest.raises(ValueError):
        svc.parse_custom_headers('{"Host":"evil"}')
    with pytest.raises(ValueError):
        svc.parse_custom_headers('{"X-A":"a\\nb"}')


def test_custom_http_config_validation(monkeypatch):
    monkeypatch.setattr(svc.backup_credentials, "validate_destination_host", lambda h, allow_internal=False: h)
    cfg = svc.validate_config(
        "custom_http", {"url": "https://sms.example.com/send", "method": "get"}, tenant_scoped=True
    )
    assert cfg["method"] == "GET" and "{phone}" in cfg["payload_template"]
    with pytest.raises(ValueError):
        svc.validate_config("custom_http", {"url": "http://sms.example.com"}, tenant_scoped=True)
    with pytest.raises(ValueError):
        svc.validate_config(
            "custom_http", {"url": "https://sms.example.com", "payload_template": '{"a":1}'}, tenant_scoped=True
        )
