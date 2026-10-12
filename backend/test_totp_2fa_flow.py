import json
import urllib.request
from unittest.mock import MagicMock, patch

import pyotp

BASE_URL = "http://127.0.0.1:8000"

def make_request(path, data):
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))

def mock_response(payload, status=200):
    response = MagicMock()
    response.status = status
    response.read.return_value = json.dumps(payload).encode("utf-8")
    context_manager = MagicMock()
    context_manager.__enter__.return_value = response
    return context_manager


@patch("urllib.request.urlopen")
def test_totp_2fa_flow(mock_urlopen):
    """Exercise the TOTP handshake without requiring a running HTTP service."""
    secret = "A" * 32
    mock_urlopen.side_effect = [
        mock_response({
            "status": "SETUP_INITIATED",
            "secret": secret,
            "totp_auth_url": "otpauth://totp/OxenGL:test?secret=" + secret,
        }),
        mock_response({"status": "SUCCESS", "tfa_enabled": True}),
        mock_response({"status": "2FA_REQUIRED", "two_factor_token": "test-token"}),
        mock_response({"status": "SUCCESS", "access_token": "test-access-token", "token_type": "bearer"}),
    ]

    email = "muath.salaih@meayon.com"
    workspace = "myon"
    status_code, setup_res = make_request("/auth/2fa/setup", {
        "email": email,
        "workspace_slug": workspace,
    })
    assert status_code == 200
    assert setup_res.get("status") == "SETUP_INITIATED"
    secret = setup_res["secret"]
    auth_url = setup_res["totp_auth_url"]
    assert secret and len(secret) == 32
    assert "otpauth://" in auth_url

    code = pyotp.TOTP(secret).now()
    status_code, verify_res = make_request("/auth/2fa/verify", {
        "email": email,
        "workspace_slug": workspace,
        "code": code,
    })
    assert status_code == 200
    assert verify_res.get("status") in ("SUCCESS", "2FA_ACTIVATED")
    assert verify_res.get("tfa_enabled") is True

    status_code, login_res = make_request("/api/auth/tenant/login", {
        "workspace_slug": workspace,
        "identity": email,
        "password": "Meayon123!",
    })
    assert status_code == 200
    assert login_res.get("status") == "2FA_REQUIRED"
    two_factor_token = login_res.get("two_factor_token")
    assert two_factor_token, "Expected two_factor_token in response"

    fresh_code = pyotp.TOTP(secret).now()
    status_code, verify_login_res = make_request("/auth/2fa/verify", {
        "two_factor_token": two_factor_token,
        "code": fresh_code,
    })
    assert status_code == 200
    assert verify_login_res.get("status") == "SUCCESS"
    assert "access_token" in verify_login_res
    assert verify_login_res["token_type"] == "bearer"
    assert mock_urlopen.call_count == 4
