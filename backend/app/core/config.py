from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import EmailStr
from typing import Optional


class EmailSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    SMTP_HOST: str = "mail.oxengl.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = "notifications@oxengl.com"
    SMTP_PASSWORD: str = "production-smtp-secret"
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False

    # Global OxenGL Platform Identifiers
    OXENGL_SYSTEM_EMAIL: EmailStr = "notifications@oxengl.com"
    OXENGL_ASSETS_BASE_URL: str = "https://assets.oxengl.com"


email_settings = EmailSettings()
