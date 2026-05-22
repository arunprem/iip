"""TOTP (Google Authenticator) provisioning and verification."""

from __future__ import annotations

import base64
import io
from typing import TYPE_CHECKING

import pyotp
import qrcode
from cryptography.fernet import Fernet, InvalidToken
from hashlib import sha256

from iip_core.settings import BaseServiceSettings

if TYPE_CHECKING:
    from iam_svc.models.user import User

TOTP_ISSUER = "IIP Kerala Police"


def _fernet(settings: BaseServiceSettings) -> Fernet:
    digest = sha256(settings.jwt_secret_key.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_secret(settings: BaseServiceSettings, secret: str) -> str:
    return _fernet(settings).encrypt(secret.encode("utf-8")).decode("utf-8")


def decrypt_secret(settings: BaseServiceSettings, encrypted: str) -> str | None:
    try:
        return _fernet(settings).decrypt(encrypted.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return None


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def build_provisioning_uri(username: str, secret: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=TOTP_ISSUER)


def qr_code_data_url(otpauth_uri: str) -> str:
    img = qrcode.make(otpauth_uri)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def verify_totp_code(settings: BaseServiceSettings, user: User, code: str) -> bool:
    if not user.mfa_secret:
        return False
    secret = decrypt_secret(settings, user.mfa_secret)
    if not secret:
        return False
    normalized = "".join(ch for ch in code.strip() if ch.isdigit())
    if len(normalized) != 6:
        return False
    totp = pyotp.TOTP(secret)
    return totp.verify(normalized, valid_window=1)


def verify_raw_secret(secret: str, code: str) -> bool:
    normalized = "".join(ch for ch in code.strip() if ch.isdigit())
    if len(normalized) != 6:
        return False
    return pyotp.TOTP(secret).verify(normalized, valid_window=1)


def user_must_use_mfa(user: User, force_mfa: bool) -> bool:
    return force_mfa or bool(user.mfa_enabled)


def user_is_mfa_enrolled(user: User) -> bool:
    return bool(user.mfa_enabled and user.mfa_secret)


def user_can_disable_mfa(user: User, force_mfa: bool) -> bool:
    return user_is_mfa_enrolled(user) and not force_mfa
