# Engineering Traceability Matrix

| Requirement ID | MSS Segment Reference | Database Target | API Port Interface | Verification Test Case |
| :--- | :--- | :--- | :--- | :--- |
| **REQ-SEC-01** | Ch. 2 Security | `public.users` | `POST /api/v1/auth/users` | `test_user_onboarding()` |
| **REQ-FIN-01** | Ch. 3 Finance | `tenant.journal_vouchers` | `GET /api/v1/billing/balance-sheet` | `test_ledger_aggregation()` |
| **REQ-PRO-01** | Ch. 4 Procurement | `tenant.purchase_orders` | `POST /api/v1/procurement/purchase-order` | `test_purchase_order_conversion()` |
| **REQ-INV-01** | Ch. 5 Inventory | `tenant.inventory_ledger` | `POST /api/v1/inventory/batch` | `test_dual_uom_density_ratio()` |
| **REQ-FLT-01** | Ch. 6 Logistics | `tenant.gps_telemetry_stream` | `WS /api/v1/tracking/ws/fleet-stream` | `test_websocket_stream_throughput()` |
