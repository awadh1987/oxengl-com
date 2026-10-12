# Finance & Invoicing Dynamic Form Pipeline Blueprint

Task: Extend the dynamic form schema ingestion, Excel custom column parsing, and metadata-driven UI rendering to the Finance, Accounting & Control workspace (Invoices & Vouchers).

## Instructions:

1. **Backend Models & JSONB Extension:**
   - Update SQLAlchemy models representing Financial Invoices and Vouchers (`FinancialInvoice`, `FinancialVoucher`, or equivalent financial transaction tables) to include a `custom_attributes` JSONB column if not already present.
   - Update `custom_fields.py` entity aliases to include `"invoice"`, `"customer_invoice"`, `"voucher"`, `"payment_voucher"`, and `"receipt_voucher"`.

2. **Smart Excel Invoicing & Voucher Import:**
   - Update the financial/invoice import parsers in the backend so that any custom or unrecognized column headers in uploaded Excel invoice or voucher sheets are captured and stored in `custom_attributes`, and auto-register them via `register_discovered_fields`.

3. **API & Schema Support:**
   - Ensure invoice and voucher Pydantic schemas (`schemas.py`) and API endpoints accept, persist, and return `custom_attributes`.

4. **Frontend Dynamic Form Integration:**
   - Integrate `<DynamicFieldRenderer entity="invoice" ... />` into `CustomerInvoicingView.tsx` / invoice creation forms.
   - Integrate `<DynamicFieldRenderer entity="voucher" ... />` into `FinancialVouchersView.tsx` / voucher creation modals.

5. **Build & Verify:**
   - Run `npm run build` in the frontend directory.
   - Rebuild and restart the Podman containers (`podman compose build backend frontend && podman compose up -d --no-deps backend frontend`).
   - Stage, commit, and push the changes to `main`, and report back.