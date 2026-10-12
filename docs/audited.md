# OxenGL ERP System-Wide Audit Report

Audit date: 2026-09-05  
Audited root: [MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa)

This report audits the corrected OxenGL ERP root against global ERP standards represented by mature platforms such as Odoo and SAP. It focuses on backend architecture, security, UI/UX dead ends, branding isolation, and frontend-to-backend route alignment.

## Phase 1: Enterprise Architecture And Backend Standards

### [Backend/models.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/models.py)

#### Database And Schema Discrepancies

- [Backend/models.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/models.py#L24-L40): `ResCompany` is materially below global ERP company-master standards. It lacks legal-entity hierarchy, parent company, branch/subsidiary structure, fiscal calendar, fiscal lock dates, base currency precision, country/localization profile, company bank accounts, tax regime, invoice sequence configuration, and intercompany settings.

- [Backend/models.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/models.py#L43-L59): `ResUser` still contains `firebase_uid` as a non-null unique column. Native auth was added, but the model still depends on a legacy external identity placeholder such as `native:<email>`. This should be removed through a real migration once all callers are native.

- [Backend/models.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/models.py#L43-L59): `ResUser` uses a single role string. Standard ERPs require users, groups, permissions, access-control lists, record rules, approval limits, branch/warehouse access, and multi-company memberships.

- [Backend/models.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/models.py#L61-L72): `PlatformAuditLog` lacks `outcome`, actor id, request id, user agent, immutable update/delete protections, structured metadata, and event category. Audit entries are queryable by `action`, but not by a normalized event/outcome pair.

- [Backend/models.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/models.py#L75-L93): `ResPartner` is too thin for customer/vendor master data. Missing supplier/customer flags, payment terms, receivable/payable accounts, credit limits, addresses, contact hierarchy, bank accounts, fiscal position, VAT validation status, pricelists, language, currency, and compliance documents.

- [Backend/models.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/models.py#L82-L84): partner email and tax number are globally unique. This blocks legitimate multi-company reuse and should become tenant-aware unique indexes, for example `(company_id, email)` and `(company_id, tax_number)`.

- [Backend/models.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/models.py#L96-L120): `StockLocation` lacks warehouse, route, putaway/removal strategy, valuation account, lot/serial policy, scrap location, transit ownership, and inventory adjustment controls.

- [Backend/models.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/models.py#L123-L141): `ProductProduct` lacks product template separation, categories, unit-of-measure conversion, purchase/sales UoM, taxes, costing method, inventory valuation method, income/expense accounts, supplier info, variants, barcodes, lots/serial tracking, procurement routes, and reorder rules.

- [Backend/models.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/models.py#L128): `ProductProduct.sku` is globally unique. A tenant ERP should usually enforce `(company_id, sku)` unless a deliberate global catalog exists.

- [Backend/models.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/models.py#L144-L164): `StockPicking` is a minimal movement document. Missing picking type configuration by warehouse, reservation workflow, carrier, driver, vehicle, origin document, backorders, packages, quality checks, cancellation reason, and approval history.

- [Backend/models.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/models.py#L167-L193): `StockMove` lacks UoM, lot/serial, package, owner, procurement group, source document line, valuation layer, analytic/cost-center distribution, unit cost, sale price, and landed cost hooks.

- [Backend/models.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/models.py#L196-L216): `StockQuant` constrains reserved quantity but not actual quantity. Negative stock is possible by default and should be governed by product/location policy.

- [Backend/models.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/models.py#L219-L238): `WeighbridgeTicket` lacks driver, transporter contract, scale device id, calibration certificate, weighing station, inbound/outbound pair, image attachments, tamper hash, approval state, override audit trail, and commodity quality fields.

- [Backend/models.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/models.py#L242-L260): `TransporterLedger` is not a full payable subledger. Missing rate contracts, payable invoice linkage, deductions, penalties, fuel surcharge, demurrage, route, vehicle, driver, settlement status, payment state, and reconciliation.

- [Backend/models.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/models.py#L264-L279): `AccountAccount` lacks account hierarchy, account groups, reconcile flag, deprecated flag, tax tags, account type taxonomy, cash/bank flags, localization tags, and opening balance controls.

- [Backend/models.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/models.py#L282-L301): `AccountMove` lacks journal id, fiscal period, sequence locking, document date, posting date, reversal link, source document, tax lock date, payment state, invoice due dates, currency totals, approval workflow, and immutable posted-state protection.

- [Backend/models.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/models.py#L305-L322): `AccountMoveLine` lacks `company_id`, analytic account, cost center, amount currency, tax ids, tax tags, maturity date, reconciliation id, payment id, product, quantity, unit price, and partner-company validation. Querying move lines directly is unsafe without joining the parent move.

- [Backend/models.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/models.py#L325-L344): `SupplierSettlement` is not a procurement/AP settlement engine. It lacks purchase order links, vendor bill links, receipt matching, three-way match exceptions, tax, withholding, payment terms, approval workflow, attachments, and payment execution.

#### Missing Standard ERP Tables

- General Ledger missing tables: `account_journals`, `account_periods`, `fiscal_years`, `account_taxes`, `account_tax_tags`, `account_payments`, `account_partial_reconciles`, `account_full_reconciles`, `account_bank_statements`, `account_assets`, `account_budgets`, `analytic_accounts`, `analytic_lines`, `cost_centers`.

- HR/Payroll missing tables: `hr_employees`, `hr_departments`, `hr_jobs`, `hr_contracts`, `hr_attendance`, `hr_leave`, `hr_payslips`, `hr_salary_rules`, `hr_payroll_structures`, `hr_expenses`, `hr_recruitment`.

- Procurement missing tables: `purchase_orders`, `purchase_order_lines`, `purchase_requisitions`, `rfqs`, `supplier_price_lists`, `goods_receipts`, `vendor_bills`, `three_way_match_exceptions`, `approval_requests`.

- Agricultural logistics missing tables: `farms`, `fields`, `crop_cycles`, `crop_varieties`, `harvest_batches`, `quality_grades`, `moisture_tests`, `farm_gate_weighments`, `cold_chain_events`, `commodity_contracts`, `seasonal_routes`.

- Property/rental missing tables: `properties`, `units`, `leases`, `rent_schedules`, `rent_invoices`, `deposits`, `maintenance_work_orders`, `meter_readings`, `utility_charges`, `occupancy_status`.

### [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py)

#### Security And Isolation Discrepancies

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L116-L153): database DDL runs at application startup through `create_all` and raw `ALTER TABLE`. Global ERP systems require versioned migrations, promotion controls, rollback plans, and DDL audit.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L132-L135): existing users with no password are backfilled with `DEFAULT_ADMIN_PASSWORD`. That creates a shared-password exposure and should be replaced by forced password reset tokens.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L59-L62): JWT and password configuration exists, but production can still fall back to a development JWT secret. Production startup should fail if `JWT_SECRET_KEY` is not explicitly configured.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L85-L105): JWT signing is manually implemented. Missing issuer, audience, JTI, key id, refresh tokens, revocation table, session table, MFA state, clock skew policy, and rotation support.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L203-L212): `get_active_company_id` checks that `X-Company-ID` exists, but it does not verify that the authenticated user belongs to the company. Tenant authorization is therefore caller-controlled.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L224-L226): `GET /api/companies` exposes all companies without authentication or platform-admin authorization.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L229-L241): `PUT /api/companies/{company_id}/branding` only compares path company id to `X-Company-ID`. It does not require an authenticated admin for that company.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L244-L260): `POST /api/companies/register` creates a company and active admin without platform approval, email verification, phone verification, anti-abuse controls, or platform audit logging.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L264-L280): `POST /api/auth/verify` is native email/password now, but the response model is loose and there is no account lockout, rate limit, password rehash-on-login, MFA, or refresh-token flow.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L283-L298): `POST /api/auth/logout` clears the cookie and logs logout but does not revoke the JWT server-side. A copied cookie remains valid until expiry.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L301-L314): `POST /api/user-registrations` creates inactive users but there are no approval, rejection, activation, invitation, or reviewer audit endpoints.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L317-L338): `POST /api/auth/direct-access` returns a user payload but does not issue the same HttpOnly session cookie as normal login. Direct access and native login are inconsistent.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L344-L350): `require_platform_key` reuses `OXENGL_RECOVERY_CODE` for platform admin authorization. Recovery and administration secrets must be separated.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L353-L365): `GET /api/platform/audit` is unauthenticated and exposes schema/tenant counts.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L369-L410): `POST /api/platform/licenses` can fall back to the first company if no match is found. That can license the wrong tenant.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L369-L410): license issuance is not written to `platform_audit_logs`, despite being an administrative action.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L413-L460): partner, location, and product list/create endpoints use `company_id` filtering, but they do not require authenticated sessions or role permissions.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L477-L507): weighbridge creation validates related records by `company_id`, but posts inventory immediately as `done`, has no approval state, no accounting valuation entry, no audit trail, and no stock availability policy.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L510-L523): operation and accounting list routes are limited list endpoints only. They lack pagination metadata, full filter sets, read-by-id endpoints, and export controls.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L526-L546): journal creation validates account company ownership but not each line's `partner_id` company ownership.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L549-L575): supplier settlement totals are caller-supplied instead of derived from POs, receipts, weighbridge tickets, contracts, vendor bills, or rate schedules.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L583-L599): `GET /api/reports/overdue-invoices` returns static mock data, is unauthenticated, and is not company-scoped.

#### Missing Backend CRUD And Business Logic Endpoints

- Auth/session: missing `GET /api/auth/me`, `POST /api/auth/refresh`, `POST /api/auth/change-password`, `POST /api/auth/password-reset/request`, `POST /api/auth/password-reset/confirm`, `GET /api/auth/sessions`, `POST /api/auth/sessions/{id}/revoke`.

- Users/RBAC: missing `GET /api/users`, `GET /api/users/{id}`, `PATCH /api/users/{id}`, `POST /api/users/{id}/activate`, `POST /api/users/{id}/deactivate`, `POST /api/user-registrations/{id}/approve`, `POST /api/user-registrations/{id}/reject`, `GET /api/roles`, `POST /api/roles`, `GET /api/permissions`.

- Companies: missing `GET /api/companies/{id}`, `PATCH /api/companies/{id}`, `POST /api/companies/{id}/activate`, `POST /api/companies/{id}/suspend`, `GET /api/companies/{id}/users`.

- Partners: missing `GET /api/partners/{id}`, `PATCH /api/partners/{id}`, `DELETE /api/partners/{id}`, `POST /api/partners/{id}/archive`, `GET /api/partners/{id}/ledger`.

- Products: missing `GET /api/products/{id}`, `PATCH /api/products/{id}`, `DELETE /api/products/{id}`, `GET /api/products/{id}/stock`, `GET /api/products/{id}/valuation`.

- Inventory: missing `GET /api/stock/quants`, `POST /api/stock/adjustments`, `POST /api/stock/pickings/{id}/confirm`, `POST /api/stock/pickings/{id}/assign`, `POST /api/stock/pickings/{id}/validate`, `POST /api/stock/pickings/{id}/cancel`, `GET /api/stock/moves`.

- Weighbridge/logistics: missing `GET /api/weighbridge/tickets/{id}`, `PATCH /api/weighbridge/tickets/{id}`, `POST /api/weighbridge/tickets/{id}/approve`, `POST /api/weighbridge/tickets/{id}/void`, `POST /api/weighbridge/tickets/{id}/attachments`, `GET /api/fleet/vehicles`, `GET /api/fleet/drivers`, `GET /api/routes`.

- Accounting: missing `POST /api/accounting/accounts`, `PATCH /api/accounting/accounts/{id}`, `GET /api/accounting/moves/{id}`, `GET /api/accounting/moves/{id}/lines`, `POST /api/accounting/moves/{id}/post`, `POST /api/accounting/moves/{id}/reverse`, `POST /api/accounting/moves/{id}/cancel`, `GET /api/accounting/general-ledger`, `GET /api/accounting/trial-balance`, `GET /api/accounting/balance-sheet`, `GET /api/accounting/profit-loss`, `GET /api/accounting/taxes`.

- Procurement/AP: missing `GET/POST/PATCH /api/purchase/orders`, `POST /api/purchase/orders/{id}/confirm`, `GET/POST /api/vendor-bills`, `POST /api/vendor-bills/{id}/post`, `POST /api/vendor-bills/{id}/pay`, `GET /api/procurement/requisitions`.

- HR/payroll: all employee, contract, attendance, leave, payroll, payslip, salary rule, and expense endpoints are missing.

- Agricultural logistics: all farm, field, crop cycle, harvest batch, commodity grade, moisture test, farm-gate ticket, seasonal contract, and cold-chain endpoints are missing.

- Property/rental: all property, unit, lease, tenant, rent schedule, rent invoice, deposit, maintenance, utility, and occupancy endpoints are missing.

### [Backend/schemas.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/schemas.py)

- [Backend/schemas.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/schemas.py#L15-L30): `ResCompanyRead` exposes `license_key` to normal company reads. License keys should be protected platform security material.

- [Backend/schemas.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/schemas.py#L33-L39): `LicenseIssueRequest` lacks billing account, plan id, contract id, renewal policy, suspension reason, entitlements, user/storage quotas, actor, and approval metadata.

- [Backend/schemas.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/schemas.py#L67-L75): `CompanyRegistrationCreate` captures `admin_password` directly. It is hashed server-side, but there is no password confirmation, strength policy beyond length, breach check, or forced verification flow.

- [Backend/schemas.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/schemas.py#L83-L100): auth request/response contracts are loose. `AuthVerifyResponse.user` is a generic dictionary, which risks accidental schema drift and makes client/server contract validation weak.

- [Backend/schemas.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/schemas.py#L109-L115): partner create schema lacks ERP-grade fiscal/accounting fields.

- [Backend/schemas.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/schemas.py#L138-L144): product create schema lacks category, taxes, valuation, tracking, routes, reorder, vendor, and variant fields.

- [Backend/schemas.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/schemas.py#L154-L168): weighbridge operation schema lacks driver, vehicle, route, scale device, operator, quality grade, image attachment, and approval state.

- [Backend/schemas.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/schemas.py#L197-L211): journal entry schema lacks journal, fiscal period, cost center, analytic distribution, taxes, attachments, source document, and draft/post controls.

### [Backend/database.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/database.py)

- [Backend/database.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/database.py#L13-L27): database URL falls back to local PostgreSQL defaults. Production should fail closed when no explicit database URL is configured.

- [Backend/database.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/database.py#L32-L37): engine setup lacks SSL enforcement, statement timeout, lock timeout, application name, transaction isolation configuration, and telemetry hooks.

- Missing module: no Alembic or migration module exists under [Backend](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend). This is below global ERP deployment standards.

### [server.ts](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/server.ts)

- [server.ts](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/server.ts#L40-L87): Node Express still exposes a Firebase-shaped `/api/auth/verify` route. It accepts `email`, `name`, `uid`, `photoURL`, and returns `firebaseUid`. If Nginx routes `/api/auth/verify` to this server instead of FastAPI, native auth is bypassed.

- [server.ts](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/server.ts#L31-L38): Express also owns `/api/health`, creating split `/api` ownership between Node and FastAPI.

- [server.ts](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/server.ts#L89-L220): AI endpoints accept `erpContext` from the client body. Enterprise ERP AI context should be assembled server-side from authorized tenant data.

## Phase 2: UI/UX, Visual Identity, And Dead Ends

### Unwired UI And Dead Controls

- [src/views/TransporterPerformanceView.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/TransporterPerformanceView.tsx#L52): voucher reference button has no `onClick`, no route, and no API binding.

- [src/views/TransporterPerformanceView.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/TransporterPerformanceView.tsx#L52): `Issue Voucher` button has no `onClick` and no backend route behind it.

- [src/components/platform/PlatformModules.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/components/platform/PlatformModules.tsx#L43-L75): platform tenant registration form calls `erpApi.registerCompany()` without the required `admin_password` and `admin_phone` fields introduced by native auth. This screen will fail after the backend port.

- [src/components/platform/PlatformModules.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/components/platform/PlatformModules.tsx#L214-L260): license provisioning has UI for subscription and colors but no logo upload, no billing flow, no approval workflow, and no tenant activation next step.

### Incomplete Journeys

- [src/App.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/App.tsx#L29-L69): logged-in state is driven by `localStorage` instead of server session verification. A stale local marker can unlock the workspace after the HttpOnly cookie expires.

- [src/App.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/App.tsx#L132-L230): navigation is internal `activeTab` state, not route-based. Users cannot deep-link to ERP modules, and browser refresh loses module context.

- [src/views/OxenGLCloudPortal.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/OxenGLCloudPortal.tsx#L97-L164): direct-access recovery creates local session state but backend direct access does not issue the same session cookie as native login.

- [src/views/OxenGLCloudPortal.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/OxenGLCloudPortal.tsx#L166-L190): tenant onboarding selects a subscription plan but does not continue into payment, quote, approval, license issuance, or admin invitation.

- [src/views/OxenGLCloudPortal.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/OxenGLCloudPortal.tsx#L342): after tenant registration, the modal shows a success message and closes. It does not navigate to tenant login, issue a license, select the new tenant, or show operational next steps.

- [src/context/AppContext.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/context/AppContext.tsx#L363-L539): operations, users, customers, crushers, transporters, materials, payments, approvals, audit logs, and vouchers are persisted in localStorage. Many UI actions look complete but do not persist to backend tables.

- [src/context/AppContext.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/context/AppContext.tsx#L560-L760): offline operation creation writes local records without a durable sync queue, retry workflow, conflict resolution, or server reconciliation.

### Branding And Visual Identity Discrepancies

- [src/components/BrandLogo.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/components/BrandLogo.tsx#L24-L40): `BrandLogo` reads `brandConfig` from context, not `currentCompany.uiLogoUrl`, `currentCompany.uiPrimaryColor`, or `currentCompany.uiSecondaryColor`. Tenant branding will not cascade unless every caller manually passes props.

- [src/context/AppContext.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/context/AppContext.tsx#L188-L211): backend tenant identity lives in `currentCompany`, while visual identity mostly lives in `brandConfig`. This split causes platform branding, tenant branding, and public branding to drift.

- [src/context/AppContext.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/context/AppContext.tsx#L527-L536): document CSS variables `--brand-primary` and `--brand-secondary` are written from `brandConfig`, not from the active tenant/company. Tenant colors can bleed across tenants or fail to appear.

- [src/views/ExecutiveAdminView.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/ExecutiveAdminView.tsx#L1360-L1545): branding editor changes local form/config state and does not clearly persist to `PUT /api/companies/{company_id}/branding`. This prevents reliable cross-tenant visual identity management.

- [src/views/LandingPageView.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/LandingPageView.tsx#L35-L70): landing page consumes global `brandConfig`, not active tenant identity. It behaves like a global marketing shell instead of a tenant-isolated landing surface.

## Phase 3: Frontend-To-Backend Alignment

### Backend API Route Map

| Backend Route | Handler | Frontend Binding | Alignment Status |
|---|---|---|---|
| `GET /` | [root](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L215-L222) | None | Health route only. No React dependency required. |
| `GET /api/companies` | [list_companies](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L224-L226) | [erpApi.getCompanies](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/services/api.ts#L180), [refreshCompanies](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/context/AppContext.tsx#L196-L201), [OxenGLCloudPortal](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/OxenGLCloudPortal.tsx#L82-L94) | Bound but unauthenticated and overexposes license data. |
| `PUT /api/companies/{company_id}/branding` | [update_company_branding](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L229-L241) | [erpApi.updateCompanyBranding](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/services/api.ts#L185) | API client exists, but main branding editor is not clearly wired to it. |
| `POST /api/companies/register` | [register_company](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L244-L260) | [erpApi.registerCompany](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/services/api.ts#L184), [OxenGLCloudPortal.submitRegistration](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/OxenGLCloudPortal.tsx#L166-L190), [PlatformModules.TenantsRegistryView](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/components/platform/PlatformModules.tsx#L43-L75) | Partially broken: portal supplies password/phone, platform module does not. |
| `POST /api/auth/verify` | [verify_user](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L264-L280) | [erpApi.login](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/services/api.ts#L181), [LoginButton](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/components/LoginButton.tsx) | Bound. Missing `/api/auth/me` verification path makes app boot weak. |
| `POST /api/auth/logout` | [logout_user](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L283-L298) | [erpApi.logout](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/services/api.ts#L182), [signOutAuth](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/context/AppContext.tsx#L546-L557), [Navbar](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/components/Navbar.tsx#L320-L370) | Bound, but top-level logout flows do not consistently await it. |
| `POST /api/user-registrations` | [register_user](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L301-L314) | [erpApi.registerUser](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/services/api.ts#L183) | API client exists, but no obvious production screen uses it in the corrected root. |
| `POST /api/auth/direct-access` | [direct_workspace_access](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L317-L338) | [erpApi.directWorkspaceAccess](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/services/api.ts#L186), [OxenGLCloudPortal.completeDirectAccess](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/OxenGLCloudPortal.tsx#L97-L164) | Bound but inconsistent with cookie sessions. |
| `GET /api/platform/audit` | [platform_isolation_audit](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L353-L365) | [erpApi.getIsolationAudit](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/services/api.ts#L187), platform modules | Bound but route is unauthenticated. |
| `POST /api/platform/licenses` | [issue_platform_license](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L369-L410) | [erpApi.issueLicense](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/services/api.ts#L188-L192), [LicenseProvisionerView](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/components/platform/PlatformModules.tsx#L214-L260) | Bound but lacks audit and has unsafe fallback-to-first-company behavior. |
| `GET /api/partners` | [list_partners](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L413-L415) | [erpApi.getPartners](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/services/api.ts#L196) and `findOrCreate` | Bound mostly as helper for operation creation, not full partner UI CRUD. |
| `POST /api/partners` | [create_partner](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L418-L428) | [findOrCreate](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/services/api.ts#L174-L176) | Bound indirectly. No dedicated create/edit partner screen backed by API. |
| `GET /api/locations` | [list_locations](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L431-L433) | [findOrCreate](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/services/api.ts#L174-L176) | Bound indirectly. No full location management UI. |
| `POST /api/locations` | [create_location](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L436-L442) | [findOrCreate](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/services/api.ts#L174-L176) | Bound indirectly. No full location management UI. |
| `GET /api/products` | [list_products](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L445-L447) | [findOrCreate](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/services/api.ts#L174-L176) | Bound indirectly. No full product catalog UI backed by API. |
| `POST /api/products` | [create_product](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L450-L460) | [findOrCreate](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/services/api.ts#L174-L176) | Bound indirectly. No full product catalog UI backed by API. |
| `POST /api/operations/weighbridge` | [create_weighbridge_operation](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L477-L507) | [erpApi.createWeighbridgeOperation](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/services/api.ts#L198-L223), [addOperation](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/context/AppContext.tsx#L560-L760) | Bound for create only. Edit/delete/approval remain local-only. |
| `GET /api/operations` | [get_operations](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L510-L513) | [erpApi.getOperations](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/services/api.ts#L193), [AppContext operations load](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/context/AppContext.tsx#L324-L332) | Bound but limited to latest 100 and no filters. |
| `GET /api/accounting/accounts` | [list_accounts](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L516-L518) | No clear view binding found | API route lacks visible React component integration. |
| `GET /api/accounting/moves` | [list_account_moves](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L521-L523) | [erpApi.getAccountingMoves](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/services/api.ts#L194) | API client exists, but accounting UI still heavily local/context-driven. |
| `POST /api/accounting/moves` | [create_account_move](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L526-L546) | No clear production React form binding found | API route lacks corresponding React workflow. |
| `POST /api/settlements/generate` | [generate_supplier_settlement](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L549-L575) | No clear view binding found | API route lacks corresponding React workflow. |
| `GET /api/settlements` | [list_supplier_settlements](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L578-L580) | [erpApi.getSettlements](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/services/api.ts#L195) | API client exists, but settlement UI is not complete. |
| `GET /api/reports/overdue-invoices` | [get_overdue_invoices](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L583-L599) | No clear React binding found | API route is mock/static and unused. |

### Frontend View To Backend Route Map

| React View / Component | Current Backend Bindings | Missing Supporting API Routes |
|---|---|---|
| [src/views/OxenGLCloudPortal.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/OxenGLCloudPortal.tsx) | `/api/companies`, `/api/companies/register`, `/api/auth/direct-access`, `/api/auth/verify` through `LoginButton` | `/api/auth/me`, `/api/tenant/onboarding/status`, `/api/billing/checkout`, `/api/subscriptions/quote`, `/api/user-registrations/{id}/approve`, `/api/invitations/send`. |
| [src/views/SuperAdminCockpitView.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/SuperAdminCockpitView.tsx) | Renders platform modules | Needs audited platform-admin session APIs, tenant metrics APIs, audit log APIs, and tenant impersonation/inspection APIs. |
| [src/components/platform/PlatformModules.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/components/platform/PlatformModules.tsx) | `/api/companies`, `/api/companies/register`, `/api/platform/licenses`, `/api/platform/audit` | Missing tenant activation/suspension, license history, billing contracts, logo upload, user approval/rejection, audit log browser, and company detail/update routes. |
| [src/views/TenantLandingHubView.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/TenantLandingHubView.tsx) | Navigation only via `onNavigateToTab` | Needs no direct API if dashboard data is delegated, but global standards require module health/count endpoints for landing tiles. |
| [src/views/DashboardView.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/DashboardView.tsx) | Primarily context/local data | Missing `/api/dashboard/kpis`, `/api/dashboard/revenue`, `/api/dashboard/logistics`, `/api/dashboard/alerts`, `/api/dashboard/aging`. |
| [src/views/OperationsLogView.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/OperationsLogView.tsx) | Indirectly uses context `addOperation` -> `/api/operations/weighbridge` for create | Missing read-by-id, update, void, approve, attachment upload, search/filter, pagination, route assignment, driver/vehicle APIs. |
| [src/views/CustomerInvoicingView.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/CustomerInvoicingView.tsx) | Context/local invoices | Missing `/api/sales/orders`, `/api/invoices`, `/api/invoices/{id}`, `/api/invoices/{id}/issue`, `/api/invoices/{id}/approve`, `/api/invoices/{id}/pay`, `/api/taxes/zatca`. |
| [src/views/CrusherLedgerView.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/CrusherLedgerView.tsx) | Context/local crusher payments and balances | Missing `/api/crushers`, `/api/crushers/{id}/ledger`, `/api/vendor-bills`, `/api/vendor-payments`, `/api/supplier-statements`. |
| [src/views/TransporterPerformanceView.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/TransporterPerformanceView.tsx#L52) | No functional voucher binding on key action buttons | Missing `/api/transporters`, `/api/transporters/{id}/performance`, `/api/transporters/{id}/deductions`, `/api/vouchers`, `/api/vouchers/{id}`. |
| [src/views/FinancialVouchersView.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/FinancialVouchersView.tsx) | Context/local vouchers | Missing `/api/vouchers`, `/api/vouchers/{id}`, `/api/vouchers/{id}/approve`, `/api/vouchers/{id}/cancel`, `/api/payments`, `/api/bank-accounts`. |
| [src/views/MasterDataView.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/MasterDataView.tsx) | Mostly local entity state; backend has partner/location/product create/list only | Missing update/delete/read-by-id APIs for all master data, customer-specific APIs, crusher APIs, transporter APIs, material category APIs, import validation APIs. |
| [src/views/ExecutiveAdminView.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/ExecutiveAdminView.tsx) | Mostly local approvals/audit/branding | Missing server approval workflow, audit log queries, tenant branding persistence, user management, role management, and policy configuration APIs. |
| [src/views/AIOperationsView.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/AIOperationsView.tsx) | Likely Node `server.ts` AI routes, with client-provided ERP context | Needs server-derived AI context APIs, tenant authorization, prompt/audit logging, and data minimization controls. |
| [src/views/PublicSharedInvoiceView.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/PublicSharedInvoiceView.tsx) | Public/local invoice rendering | Missing tokenized public invoice endpoint, access log endpoint, revocation, expiry, and ZATCA verification endpoint. |
| [src/views/LoginView.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/LoginView.tsx) | Present in source but not used by top-level App routing | Either wire it into App routes or remove it to avoid parallel login surfaces. |
| [src/views/LandingPageView.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/LandingPageView.tsx) | Present in source but not used by top-level App routing | Either wire it as public marketing route or remove/merge with `OxenGLCloudPortal`. |

### API Routes Without Corresponding React Components

- `GET /api/accounting/accounts`: API client coverage is weak and no clear dedicated chart-of-accounts React screen consumes this route.

- `POST /api/accounting/moves`: backend supports posting a journal move, but there is no clear production React journal-entry form wired to this exact endpoint.

- `POST /api/settlements/generate`: backend settlement generation exists, but the transporter/supplier UI does not expose a functional settlement generation journey.

- `GET /api/reports/overdue-invoices`: backend route exists but is static mock data and has no clear frontend route/component binding.

- `POST /api/user-registrations`: API client exists, but a complete registration approval/review UI is missing. The flow creates inactive users without a working admin progression.

- `PUT /api/companies/{company_id}/branding`: API client exists, but the main branding editor writes mostly to local `brandConfig` instead of reliably persisting tenant branding to this endpoint.

### React Screens Without Supporting API Routes

- `DashboardView`: no backend KPI/reporting API coverage for revenue, margin, active trips, wastage, receivables, payables, overdue invoices, or operational trends.

- `CustomerInvoicingView`: no backend invoice lifecycle API in corrected FastAPI root.

- `FinancialVouchersView`: no backend voucher lifecycle API in corrected FastAPI root.

- `CrusherLedgerView`: no backend crusher ledger, crusher payable, or supplier statement API.

- `TransporterPerformanceView`: no backend transporter performance, voucher issuance, penalty posting, or settlement action API.

- `ExecutiveAdminView`: no backend approval queue, audit log explorer, role management, user activation, or branding persistence workflow that matches the UI.

- `AIOperationsView`: no secure FastAPI AI audit endpoint tied to authenticated tenant data. Node `server.ts` has AI endpoints but they are separate from the tenant security model.

- `PublicSharedInvoiceView`: no corrected FastAPI public invoice-token API.

- `MasterDataView`: only partial backend support exists. Customers, crushers, transporters, materials, imports, soft delete, restore, and batch operations remain frontend-local.

### Broken Or High-Risk Lines Of Code

- [server.ts](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/server.ts#L40-L87): shadow Firebase auth endpoint conflicts with native FastAPI auth.

- [src/components/platform/PlatformModules.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/components/platform/PlatformModules.tsx#L43-L75): calls company registration without backend-required `admin_password` and `admin_phone`.

- [src/views/TransporterPerformanceView.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/views/TransporterPerformanceView.tsx#L52): voucher buttons are unwired.

- [src/App.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/App.tsx#L29-L69): localStorage marker controls session state without server verification.

- [src/context/AppContext.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/context/AppContext.tsx#L363-L539): localStorage persistence gives users false confidence that business operations are server-persisted and audited.

- [src/components/BrandLogo.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/components/BrandLogo.tsx#L24-L40): `BrandLogo` ignores `currentCompany` tenant branding by default.

- [src/context/AppContext.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/context/AppContext.tsx#L527-L536): CSS brand variables are global and not tenant-scoped.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L203-L212): caller-controlled `X-Company-ID` is treated as tenant context without checking the authenticated user.

- [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L583-L599): overdue invoice report is mock data.

### Missing Modules Required For Global Enterprise Standards

- Auth module: session table, JWT revocation, refresh tokens, account lockout, password reset, MFA, user-company memberships, RBAC permissions.

- Migration module: Alembic environment, migration review workflow, rollback plan, seed data versioning.

- Audit module: immutable audit log service, structured metadata, request id propagation, event/outcome taxonomy, export endpoint.

- Accounting module: journals, fiscal periods, taxes, reconciliation, payments, bank statements, assets, budgets, financial statements.

- Sales module: quotations, sales orders, invoices, payment registration, credit control, customer statements.

- Procurement module: RFQ, purchase orders, receipts, vendor bills, three-way match, supplier pricelists.

- Inventory module: stock picking workflow, stock adjustments, lots/serials, valuation layers, warehouse routes, reservation.

- Fleet/logistics module: vehicles, drivers, routes, dispatch, transporter contracts, demurrage, penalties.

- HR/payroll module: employee master, contracts, attendance, leave, payroll structures, payslips, expenses.

- Property/rental module: properties, units, leases, rent schedules, tenant billing, maintenance.

- Agricultural logistics module: farms, fields, crop cycles, harvest batches, commodity grades, quality tests, cold-chain events.

- Branding module: tenant visual identity service, logo upload/storage, platform identity vs tenant identity boundaries.

## Immediate Next Steps

1. Remove the shadow `/api/auth/verify` implementation from [server.ts](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/server.ts#L40-L87), or make Node proxy all `/api/*` traffic to FastAPI.

2. Add `GET /api/auth/me` in FastAPI and update [src/App.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/App.tsx#L29-L69) to bootstrap login state from the HttpOnly cookie, not localStorage.

3. Replace `get_active_company_id` with an authenticated tenant dependency that validates `company_id` against the logged-in user's company memberships.

4. Add approval/rejection routes for `/api/user-registrations/{id}` and wire them into admin UI.

5. Fix [src/components/platform/PlatformModules.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/components/platform/PlatformModules.tsx#L43-L75) to collect and send admin phone/password or remove the duplicate tenant registration form.

6. Create a canonical `TenantBranding` model/service and make `BrandLogo` consume `currentCompany` branding by default, with explicit master-platform override.

7. Replace localStorage-backed business actions in [src/context/AppContext.tsx](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/src/context/AppContext.tsx#L363-L760) with backend CRUD APIs, starting with vouchers, invoices, customers, crushers, transporters, and audit logs.

8. Implement minimum enterprise CRUD parity: read-by-id, update, archive/delete, pagination, filtering, and audit logging for partners, products, locations, operations, accounting moves, and settlements.

9. Add Alembic migrations and remove startup DDL from [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py#L116-L153).

10. Implement real report endpoints for dashboard KPIs, overdue invoices, trial balance, general ledger, balance sheet, profit/loss, transporter performance, and supplier/customer statements.

11. Deploy only from [MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa), not [remix_ui](remix_ui), to avoid serving the wrong application bundle.

## Validation Performed For This Report

- Static route scan of [Backend/main.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/main.py).
- Static schema scan of [Backend/models.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/models.py) and [Backend/schemas.py](MeayonERP2-c675242d164a2db914e4dc40908d7e9f3562d3fa/Backend/schemas.py).
- Static frontend scan for React views, `erpApi` calls, `fetch`, buttons, forms, localStorage usage, branding state, and active tab routing.
- No code changes were made for the audit report itself beyond creating this Markdown file.
