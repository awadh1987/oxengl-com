# OxenGL Multi-Currency Integration Architecture

## 1. Overview

**Objective:** Expand OxenGL's base currency support from a dual-currency system (USD, SAR) to a universal tri-currency system by introducing the Yemeni Rial (YER / YR) across all financial engines and settings.

## 2. Database Layer Updates

### 2.1 Global Currency Registry

The central currency master table must be updated to recognize YER globally.

- **Table:** `oxengl_currencies`
- **Action:** Insert/Update `currency_code = 'YER'`, `currency_symbol = '﷼'`, `currency_name = 'Yemeni Rial'`, `is_active = TRUE`.

### 2.2 Universal Exchange Rates

Establish base conversion rates using USD as the base ledger currency.

- **Table:** `oxengl_exchange_rates`
- **Action:** Insert current peg/market rates for `USD -> SAR` and `USD -> YER`. Ensure `effective_date` logic supports historical querying.

### 2.3 Engine Settings

Push the supported currency array to all interconnected modules.

- **Table:** `oxengl_engine_settings`
- **Target Engines:** `core_financial`, `billing`, `inventory`, `payroll`, `reporting`.
- **Action:** Update the `supported_currencies` key to `["USD", "SAR", "YER"]`.

## 3. Application Layer & Configuration

### 3.1 Global Config (JSON/Environment)

Update the core configuration files consumed by the UI and API gateways.

```json
{
  "currencySettings": {
    "baseCurrency": "USD",
    "supportedCurrencies": ["USD", "SAR", "YER"],
    "displayFormat": {
      "USD": "$0,0.00",
      "SAR": "0,0.00 SR",
      "YER": "0,0.00 ﷼"
    },
    "enableDynamicConversion": true
  }
}
```

## 4. Deployment & Security Post-Steps

1. **Cache Invalidation:** Restart core OxenGL services to flush legacy `["USD", "SAR"]` cached arrays.
2. **Row-Level Security (RLS):** Verify PostgreSQL RLS policies permit regional users (e.g., Yemen region) to transact in YER without authorization blocks.
3. **UI Validation:** Ensure dropdowns, invoicing templates, and financial reports correctly map the new `displayFormat` for YER.
