// OxenGL ERP — Source Declarations (Raw Layer)
// ============================================
// Registers all PostgreSQL ERP tables replicated into BigQuery raw layer

const rawTables = [
  "res_companies",
  "res_users",
  "res_partners",
  "tenants",
  "chart_of_accounts",
  "account_accounts",
  "account_journals",
  "account_moves",
  "account_move_lines",
  "finance_journal_entries",
  "finance_journal_lines",
  "customer_invoices",
  "invoices",
  "fiscal_years",
  "cost_centers",
  "exchange_rates",
  "purchase_orders",
  "purchase_order_lines",
  "purchase_requisitions",
  "vendor_bills",
  "vendors",
  "goods_receipts",
  "inventory_movements",
  "stock_quants",
  "stock_balances",
  "warehouses",
  "product_products",
  "vehicles",
  "fleet_trips",
  "waybills",
  "employees",
  "attendance_logs",
  "zatca_logs"
];

rawTables.forEach((table) => {
  declare({
    database: dataform.projectConfig.defaultProject,
    schema: dataform.projectConfig.vars.raw_dataset || "oxengl_raw",
    name: table,
    description: `Raw replicated ERP table from PostgreSQL: public.${table}`
  });
});
