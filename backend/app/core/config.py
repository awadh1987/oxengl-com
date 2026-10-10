from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import EmailStr, field_validator
from typing import Optional, List, Any, Union


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


class CurrencySettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    BASE_CURRENCY: str = "USD"
    SUPPORTED_CURRENCIES: str = "USD,SAR,YER"
    ENABLE_DYNAMIC_CONVERSION: bool = True

    @property
    def supported_currencies_list(self) -> List[str]:
        val = self.SUPPORTED_CURRENCIES.strip()
        if val.startswith("[") and val.endswith("]"):
            import json
            try:
                return json.loads(val)
            except Exception:
                pass
        return [x.strip() for x in val.split(",") if x.strip()]




email_settings = EmailSettings()
currency_settings = CurrencySettings()

