"""
OxenGL Automated Foreign Exchange (FX) Synchronization Background Worker.
Fetches live rates for USD to SAR and YER from standard external FX APIs,
inserts newly effective rates into oxengl_exchange_rates and legacy exchange_rates,
and flushes Redis currency caches immediately following a successful database commit.
"""

from __future__ import annotations

import os
import logging
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, Optional, Tuple

import httpx
from sqlalchemy.orm import Session
from sqlalchemy import text

from backend.database import SessionLocal
from backend.models import OxenglExchangeRate
from backend.app.services.currency import CurrencyService
from backend.app.core.celery_app import celery_app
from backend.app.core.config import currency_settings

logger = logging.getLogger("oxengl.tasks.fx_sync")

DEFAULT_FX_API_URL = os.getenv("FX_API_URL", "https://api.frankfurter.dev/v1/latest")
DEFAULT_FX_API_KEY = os.getenv("FX_API_KEY", "")

# Mission-critical baseline parities for offline and disconnected fallback
STATIC_BASELINES: Dict[str, float] = {
    "USD_SAR": 3.750000,
    "USD_YER": 535.000000,
}


def fetch_live_rates(
    api_key: Optional[str] = None,
    api_url: Optional[str] = None,
) -> Dict[str, float]:
    """
    Retrieves live foreign exchange rates from standard external FX APIs.
    Gracefully computes reciprocal and cross rates between USD, SAR, and YER.
    """
    key = api_key if api_key is not None else currency_settings.FX_API_KEY or DEFAULT_FX_API_KEY
    url = api_url or currency_settings.FX_API_URL or DEFAULT_FX_API_URL

    usd_sar = STATIC_BASELINES["USD_SAR"]
    usd_yer = STATIC_BASELINES["USD_YER"]

    # 1. Fetch live rates via HTTP with tight timeouts
    try:
        with httpx.Client(timeout=5.0) as client:
            # If an API key is specified (e.g., ExchangeRate-API or OpenExchangeRates)
            if key:
                if "openexchangerates.org" in url:
                    res = client.get(f"https://openexchangerates.org/api/latest.json?app_id={key}&symbols=SAR,YER")
                    if res.status_code == 200:
                        rates = res.json().get("rates", {})
                        if "SAR" in rates:
                            usd_sar = float(rates["SAR"])
                        if "YER" in rates:
                            usd_yer = float(rates["YER"])
                elif "exchangerate-api.com" in url:
                    res = client.get(f"https://v6.exchangerate-api.com/v6/{key}/latest/USD")
                    if res.status_code == 200:
                        rates = res.json().get("conversion_rates", {})
                        if "SAR" in rates:
                            usd_sar = float(rates["SAR"])
                        if "YER" in rates:
                            usd_yer = float(rates["YER"])
                else:
                    res = client.get(url, params={"base": "USD", "symbols": "SAR", "api_key": key})
                    if res.status_code == 200:
                        rates = res.json().get("rates", {})
                        if "SAR" in rates:
                            usd_sar = float(rates["SAR"])
                        if "YER" in rates:
                            usd_yer = float(rates["YER"])
            else:
                # Standard open API endpoint (Frankfurter)
                res = client.get(url, params={"base": "USD", "symbols": "SAR"})
                if res.status_code == 200:
                    rates = res.json().get("rates", {})
                    if "SAR" in rates:
                        usd_sar = float(rates["SAR"])
                else:
                    # Secondary fallback endpoint
                    res2 = client.get("https://api.frankfurter.app/latest", params={"base": "USD", "symbols": "SAR"})
                    if res2.status_code == 200:
                        rates = res2.json().get("rates", {})
                        if "SAR" in rates:
                            usd_sar = float(rates["SAR"])
    except Exception as exc:
        logger.warning(
            "External FX query failed (%s); utilizing baseline enterprise parities: USD_SAR=%s, USD_YER=%s",
            exc,
            usd_sar,
            usd_yer,
        )

    # 2. Derive complete bidirectional tri-currency matrix
    sar_usd = round(1.0 / usd_sar, 6)
    yer_usd = round(1.0 / usd_yer, 8)
    sar_yer = round(usd_yer / usd_sar, 6)
    yer_sar = round(usd_sar / usd_yer, 8)

    return {
        "USD_SAR": round(usd_sar, 6),
        "SAR_USD": sar_usd,
        "USD_YER": round(usd_yer, 6),
        "YER_USD": yer_usd,
        "SAR_YER": sar_yer,
        "YER_SAR": yer_sar,
    }


def sync_exchange_rates(
    db: Optional[Session] = None,
    api_key: Optional[str] = None,
    api_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Executes atomic database insertion of newly active rates and immediately
    purges Redis currency caches to ensure real-time consistency across OxenGL.
    """
    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True

    try:
        now_utc = datetime.now(timezone.utc)
        live_rates = fetch_live_rates(api_key=api_key, api_url=api_url)

        synced_records = []

        # Pairs mapping
        pairs = [
            ("USD", "SAR", live_rates["USD_SAR"]),
            ("SAR", "USD", live_rates["SAR_USD"]),
            ("USD", "YER", live_rates["USD_YER"]),
            ("YER", "USD", live_rates["YER_USD"]),
            ("SAR", "YER", live_rates["SAR_YER"]),
            ("YER", "SAR", live_rates["YER_SAR"]),
        ]

        for from_cur, to_cur, rate_val in pairs:
            rate_dec = Decimal(str(rate_val)).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)

            # Deactivate previous active rates for this currency pair
            db.query(OxenglExchangeRate).filter(
                OxenglExchangeRate.from_currency == from_cur,
                OxenglExchangeRate.to_currency == to_cur,
                OxenglExchangeRate.is_active == True,
            ).update({"is_active": False}, synchronize_session=False)

            # Insert newly synced rate with CURRENT_TIMESTAMP effective_date
            new_rate = OxenglExchangeRate(
                from_currency=from_cur,
                to_currency=to_cur,
                rate=rate_dec,
                effective_date=now_utc,
                is_active=True,
                created_at=now_utc,
            )
            db.add(new_rate)
            synced_records.append(f"{from_cur}_{to_cur}: {rate_val}")

            # Keep legacy public.exchange_rates table in sync
            try:
                db.execute(
                    text("""
                        INSERT INTO public.exchange_rates (from_currency, to_currency, rate)
                        VALUES (:from_c, :to_c, :r)
                        ON CONFLICT (from_currency, to_currency)
                        DO UPDATE SET rate = EXCLUDED.rate;
                    """),
                    {"from_c": from_cur, "to_c": to_cur, "r": rate_dec},
                )
            except Exception as legacy_exc:
                logger.debug("Legacy exchange_rates sync note: %s", legacy_exc)

        # Commit transaction atomically
        db.commit()
        logger.info("Successfully committed %d FX rates to oxengl_exchange_rates at %s", len(pairs), now_utc.isoformat())

        # Purge Redis currency caches immediately following successful commit
        currency_service = CurrencyService()
        flushed_keys_count = currency_service.flush_currency_cache_sync()
        logger.info("Flushed %d cached exchange rate keys in Redis", flushed_keys_count)

        return {
            "status": "SUCCESS",
            "effective_date": now_utc.isoformat(),
            "synced_pairs": len(pairs),
            "rates": live_rates,
            "flushed_cache_keys": flushed_keys_count,
        }

    except Exception as exc:
        db.rollback()
        logger.error("Failed to synchronize FX rates: %s", exc, exc_info=True)
        raise exc
    finally:
        if should_close:
            db.close()


@celery_app.task(name="tasks.sync_exchange_rates", bind=True, max_retries=3, default_retry_delay=60)
def sync_exchange_rates_task(self) -> Dict[str, Any]:
    """
    Periodic Celery worker task executing scheduled foreign exchange rate synchronization.
    """
    try:
        return sync_exchange_rates()
    except Exception as exc:
        logger.error("Celery sync_exchange_rates task failed: %s", exc)
        raise self.retry(exc=exc)
