export type UserRole = 'Super_Admin' | 'Admin' | 'COO' | 'Accountant' | 'Data_Entry' | 'Read_Only' | 'Guest';

export interface Company {
  id: string;
  parentId?: string | null;
  name: string;
  company_name?: string;
  company_name_ar?: string;
  name_ar?: string;
  name_en?: string;
  slug: string;
  commercialRegistration?: string;
  taxId?: string;
  currency: string;
  fiscalCalendar?: string;
  fiscalYearStartMonth?: number;
  taxRegime?: string;
  subscriptionTier?: 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE';
  licenseKey?: string | null;
  licenseExpiresAt?: string | null;
  maxCostCenters?: number;
  themeMode?: 'LIGHT' | 'DARK' | 'CUSTOM';
  uiPrimaryColor?: string;
  uiSecondaryColor?: string;
  uiLogoUrl?: string | null;
  ui_logo_url?: string | null;
  logo_url?: string | null;
  logoUrl?: string | null;
  wallpaper_url?: string | null;
  background_url?: string | null;
  uiBackgroundUrl?: string | null;
  custom_domain?: string | null;
  domain?: string | null;
  ui_primary_color?: string | null;
  ui_secondary_color?: string | null;
}

export interface DocumentAttachment {
  id: string;
  fileName: string;
  fileSize: string;
  fileType: string;
  docCategory: 'Scale Ticket' | 'Waybill' | 'Delivery Receipt' | 'Tax Invoice' | 'Payment Voucher' | 'Contract' | 'Other';
  fileData: string; // Base64 or URL
  uploadedAt: string;
  uploadedBy: string;
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  fullNameAr: string;
  email: string;
  phone?: string;
  role: UserRole;
  companyId?: string;
  companyName?: string;
  company_name?: string;
  assignedCustomerId?: string | null;
  avatar?: string;
  avatar_url?: string;
  status?: 'Active' | 'Pending' | 'Suspended';
  is_deleted?: boolean;
  deleted_at?: string;
  deleted_by?: string;
  created_at?: string;
}


export interface Customer {
  id: string;
  customerName: string;
  customerNameEn: string;
  taxNumber: string;
  crNumber?: string;
  contactPerson: string;
  phone: string;
  email: string;
  address?: string;
  openingBalance?: number;
  creditLimit?: number;
  is_deleted?: boolean;
  deleted_at?: string;
  deleted_by?: string;
}

export interface Crusher {
  id: string;
  crusherName: string;
  crusherNameEn: string;
  name?: string;
  location: string;
  bankDetails: string;
  accountNumber?: string;
  taxNumber?: string;
  materialProduced?: string;
  openingBalance: number;
  contactPerson?: string;
  phone?: string;
  is_deleted?: boolean;
  deleted_at?: string;
  deleted_by?: string;
}

export type CrusherEntity = Crusher;

export interface Transporter {
  id: string;
  transporterName: string;
  transporterNameEn: string;
  name?: string;
  driverName: string;
  phone: string;
  truckDetails: string;
  defaultTruckNo?: string;
  capacityTons?: number;
  ratePerTon?: number;
  taxNumber?: string;
  trucksCount?: number;
  is_deleted?: boolean;
  deleted_at?: string;
  deleted_by?: string;
}

export type UOMType = 'MT طن' | 'kg' | 'truck' | 'CBM';

export const SUPPORTED_UOMS: { value: UOMType; labelAr: string; labelEn: string; symbol: string }[] = [
  { value: 'MT طن', labelAr: 'MT طن (طن متري)', labelEn: 'MT (Metric Ton)', symbol: 'MT طن' },
  { value: 'kg', labelAr: 'كجم (كيلوجرام)', labelEn: 'kg (Kilogram)', symbol: 'kg' },
  { value: 'truck', labelAr: 'رد / شاحنة (Truckload)', labelEn: 'Truck (Truckload)', symbol: 'truck' },
  { value: 'CBM', labelAr: 'م³ (متر مكعب)', labelEn: 'CBM (Cubic Meter)', symbol: 'CBM' },
];

export interface MaterialOption {
  id: string;
  nameAr: string;
  nameEn: string;
  category: 'Aggregate' | 'Sand' | 'Powder' | 'Subbase' | 'Water';
  defaultSellingPrice: number;
  defaultPurchasePrice: number;
  unit: UOMType | string;
  is_deleted?: boolean;
  deleted_at?: string;
  deleted_by?: string;
}

export interface OperationRecord {
  id: string;
  loading_date: string; // YYYY-MM-DD
  date?: string;
  truck_no: string;
  transporter_name: string;
  loading_source: string; // Crusher Name
  loading_invoice_no: string;
  destination_customer: string; // Customer Name
  receipt_invoice_no: string;
  material_type: string;
  uom?: UOMType | string; // Universal UOM: 'MT طن' | 'kg' | 'truck' | 'CBM'
  qty_loaded: number; // Metric Tons / UOM
  qty_delivered: number; // Metric Tons / UOM
  qty_wastage: number; // Computed: loaded - delivered
  wastage_percentage: number; // Computed: (wastage / loaded) * 100
  scale_ticket_no: string;
  sales_amount: number; // Excl. VAT
  vat_amount: number; // 15%
  total_sales: number; // sales + vat
  purchases_cost: number; // Payable to Crusher
  crusher_payment: number; // Paid to Crusher
  net_profit: number; // Computed: sales_amount - purchases_cost
  transporter_cost_amount?: number;
  crusher_cost_amount?: number;
  driver_name?: string;
  freight_fee?: number;
  penalty_fee?: number;
  operation_month: number; // 1-12
  operation_year: number;
  notes?: string;
  scale_ticket_attachment?: string;
  attachments?: DocumentAttachment[];
  version?: number;
  is_deleted?: boolean;
  deleted_at?: string;
  deleted_by?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface CrusherPaymentEntry {
  id: string;
  crusher_id: string;
  crusher_name: string;
  payment_date: string;
  amount: number;
  payment_method: 'Bank Transfer' | 'Cheque' | 'Cash' | 'Credit Memo';
  reference_no: string;
  notes?: string;
  month: number;
  year: number;
  attachments?: DocumentAttachment[];
  is_deleted?: boolean;
  deleted_at?: string;
  deleted_by?: string;
  created_at: string;
}

export type CrusherPayment = CrusherPaymentEntry;

export interface DigitalSignatureStamp {
  signedBy: string;
  signedByRole: string;
  signedAt: string;
  verificationHash: string;
  signatureImageUrl?: string;
  stampImageUrl?: string;
  signNotes?: string;
}

export interface InvoiceVersion {
  versionNumber: number;
  versionLabel: string;
  savedAt: string;
  savedBy: string;
  subtotal: number;
  vatAmount: number;
  grandTotal: number;
  tripsCount: number;
  notes?: string;
  items: InvoiceItem[];
}

export interface CustomerInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerTaxNumber: string;
  billingMonth: number;
  billingYear: number;
  issueDate: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  vatAmount: number;
  grandTotal: number;
  totalTrips: number;
  totalLoadedWeight: number;
  totalDeliveredWeight: number;
  totalWastageWeight: number;
  status: 'Draft' | 'Pending_Approval' | 'Approved' | 'Issued' | 'Paid' | 'Overdue';
  preparedBy?: string;
  preparedByRole?: string;
  approvedBy?: string;
  approvedByRole?: string;
  approvedAt?: string;
  qrCodeData?: string;
  version?: number;
  versionHistory?: InvoiceVersion[];
  isSigned?: boolean;
  signatureData?: DigitalSignatureStamp;
  attachments?: DocumentAttachment[];
  is_deleted?: boolean;
  deleted_at?: string;
  deleted_by?: string;
  public_token?: string;
  publicToken?: string;
}

export interface InvoiceItem {
  materialType: string;
  tripsCount: number;
  loadedWeight: number;
  deliveredWeight: number;
  wastageWeight: number;
  unitPrice: number;
  subtotal: number;
  vatAmount: number;
  total: number;
}

export interface TransporterSettlement {
  transporterId?: string;
  transporterName: string;
  month?: number;
  year?: number;
  tripsCount: number;
  totalLoaded: number;
  totalDelivered: number;
  totalWastage: number;
  wastagePercentage: number;
  totalFreightFee: number;
  penaltyDeductions: number;
  netPayable: number;
  status: 'Excellent' | 'Warning' | 'Penalty' | 'Pending' | 'Approved' | 'Disbursed';
  isSigned?: boolean;
  signatureData?: DigitalSignatureStamp;
  attachments?: DocumentAttachment[];
}

export interface DashboardKPIs {
  totalSales: number;
  totalPurchasesCost: number;
  netOperatingProfit: number;
  profitMarginPercent: number;
  totalDeliveredTonnage: number;
  totalLoadedTonnage: number;
  totalWastageTonnage: number;
  overallWastagePercent: number;
  totalTrips: number;
  crusherPayableBalance: number;
  pendingApprovalsCount: number;
}

// Executive Admin & Workflow Models
export interface EditApprovalRequest {
  id: string;
  recordId: string;
  entityType: 'Operation' | 'Invoice' | 'CrusherPayment' | 'Customer' | 'Crusher' | 'Transporter';
  requestedBy: string;
  requestedByRole: UserRole;
  requestedAt: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  oldValues: Record<string, any>;
  newValues: Record<string, any>;
  diffSummary: string;
}

export interface UserApprovalRequest {
  id: string;
  fullName: string;
  fullNameAr: string;
  username: string;
  email: string;
  phone: string;
  requestedRole: UserRole;
  requestedAt: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  reviewedBy?: string;
  assignedRole?: UserRole;
  notes?: string;
}

export interface BrandConfig {
  companyNameAr: string;
  companyNameEn: string;
  crNumber: string;
  taxNumber: string;
  phone: string;
  email: string;
  addressAr: string;
  addressEn: string;
  bankNameAr: string;
  bankNameEn: string;
  iban: string;
  primaryColor: string; // e.g. #4f46e5
  secondaryColor: string; // e.g. #9333ea
  customLogoUrl?: string;
  platformLogoUrl?: string;
  wallpaperUrl?: string;
  backgroundUrl?: string;
  ceoSignatureUrl?: string;
  companyStampUrl?: string;
  ceoNameAr: string;
  ceoNameEn: string;
  ceoTitleAr: string;
  ceoTitleEn: string;
  // Dynamic Homepage & Portal Customization
  heroBadgeAr?: string;
  heroBadgeEn?: string;
  heroHeadlineAr?: string;
  heroHeadlineEn?: string;
  heroSubtitleAr?: string;
  heroSubtitleEn?: string;
  heroCtaPrimaryAr?: string;
  heroCtaPrimaryEn?: string;
  heroCtaSecondaryAr?: string;
  heroCtaSecondaryEn?: string;
  stat1Value?: string;
  stat1LabelAr?: string;
  stat1LabelEn?: string;
  stat2Value?: string;
  stat2LabelAr?: string;
  stat2LabelEn?: string;
  stat3Value?: string;
  stat3LabelAr?: string;
  stat3LabelEn?: string;
  stat4Value?: string;
  stat4LabelAr?: string;
  stat4LabelEn?: string;
  aboutTitleAr?: string;
  aboutTitleEn?: string;
  aboutTextAr?: string;
  aboutTextEn?: string;
  workingHoursAr?: string;
  workingHoursEn?: string;
  sloganAr?: string;
  sloganEn?: string;
  homepageBadgeAr?: string;
  homepageBadgeEn?: string;
  homepageHeroTitleAr?: string;
  homepageHeroTitleEn?: string;
  homepageHeroSubtitleAr?: string;
  homepageHeroSubtitleEn?: string;
  homepageAnnualTonnage?: string;
  homepageFleetCount?: string;
  homepageCrushersCount?: string;
  homepageAboutTitleAr?: string;
  homepageAboutTitleEn?: string;
  homepageAboutDescriptionAr?: string;
  homepageAboutDescriptionEn?: string;
  bankAccountNumber?: string;
  bankIban?: string;
  [key: string]: any;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action:
    | 'CREATE'
    | 'READ'
    | 'UPDATE'
    | 'DELETE'
    | 'SOFT_DELETE'
    | 'RESTORE'
    | 'APPROVE'
    | 'REJECT'
    | 'SIGN'
    | 'LOGIN'
    | 'OVERRIDE_DB'
    | 'BRAND_CONFIG'
    | 'ATTACH_FILE'
    | 'ISSUE'
    | 'POST_LEDGER';
  entityType:
    | 'Operation'
    | 'Customer'
    | 'Crusher'
    | 'Transporter'
    | 'Material'
    | 'Invoice'
    | 'User'
    | 'BrandConfig'
    | 'Payment'
    | 'Settlement'
    | 'Voucher';
  entityId: string;
  summary: string;
  ipAddress: string;
  oldData?: any;
  newData?: any;
}

export type VoucherType = 'Payment' | 'Receipt'; // سند صرف | سند قبض
export type VoucherCategory =
  | 'Crusher_Settlement'
  | 'Transporter_Payment'
  | 'Transporter_Payout'
  | 'Customer_Collection'
  | 'Operational_Expense'
  | 'General';

export interface FinancialVoucher {
  id: string; // e.g. "PV-2026-08-0012" or "RV-2026-08-0005"
  voucherNumber: string;
  type: VoucherType; // Payment = سند صرف, Receipt = سند قبض
  category: VoucherCategory;
  date: string; // YYYY-MM-DD
  amount: number;
  amountInWordsAr: string; // تفقيط باللغة العربية
  amountInWordsEn?: string; // تفقيط باللغة الإنجليزية
  partyType: 'Crusher' | 'Transporter' | 'Customer' | 'Other';
  partyId?: string;
  partyName: string; // اسم المستفيد / المستلم منه
  partyTaxNumber?: string;
  paymentMethod: 'Bank Transfer' | 'Cash' | 'Cheque' | 'Credit Memo';
  bankName?: string;
  checkNumber?: string;
  transferRefNumber?: string;
  linkedReferenceNo?: string; // Invoice #, Crusher Inv #, Trip Ref
  purpose: string; // الغرض من الصرف / القبض
  notes?: string;
  month: number;
  year: number;
  // Approvals & Signatures
  preparedBy: string; // إعداد المحاسب
  reviewedBy?: string; // مراجعة وتدقيق الإدارة المالية
  receivedBy?: string; // توقيع المستلم / المستفيد
  isApproved: boolean;
  approvedBy?: string;
  approvedAt?: string;
  digitalSignature?: DigitalSignatureStamp;
  status: 'Draft' | 'Pending_Approval' | 'Approved' | 'Cancelled';
  attachments?: DocumentAttachment[];
  move_id?: string;
  created_at: string;
  updated_at: string;
}

export interface BalancedJournalLineItem {
  id?: string;
  account_code: string;
  account_name?: string;
  description?: string;
  debit: number;
  credit: number;
}

export interface BalancedJournalVoucher {
  id: string;
  entry_number: string;
  description: string;
  entry_date: string;
  total_debit: number;
  total_credit: number;
  status: string;
  lines: BalancedJournalLineItem[];
}

// ==============================================================================
// Hierarchical Chart of Accounts Recursive Data Contract (finance-tree-contract.json)
// ==============================================================================
export type AccountTypeCategory = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';

export interface OxenGLHierarchicalCoaNode {
  account_code: string;
  account_name: string;
  node_path: string;
  account_type: AccountTypeCategory;
  accumulated_balance: string; // e.g. "148500.5000"
  children: OxenGLHierarchicalCoaNode[];
}

export type OxenGLHierarchicalCoaResponse = OxenGLHierarchicalCoaNode[];

// ==============================================================================
// REQ-FLT-01: GPS Vehicle Telemetry Stream Data Contract
// ==============================================================================
export interface GPSVehicleTelemetry {
  vehicle_id: string;
  license_plate?: string;
  make_model?: string;
  driver_name?: string;
  latitude: number;
  longitude: number;
  speed_kmh: number;
  heading?: number;
  altitude_m?: number;
  engine_status: 'running' | 'idle' | 'stopped';
  fuel_level_pct?: number;
  odometer_km?: number;
  timestamp: string;
  route_id?: string;
  destination?: string;
  alerts?: string[];
  cargo_temperature_celsius?: number;
  ambient_humidity_percentage?: number;
  device_battery_voltage?: number;
  temp?: number;
  humidity?: number;
  voltage?: number;
  routing_status?: 'ON_SCHEDULE' | 'VECTOR_DEVIATION_ALERT' | 'OPTIMAL' | 'CONGESTION_AVOIDANCE' | string;
  deviation_magnitude_km?: number;
  eta_hours?: number;
  weighted_cost_index?: number;
  target_lat?: number;
  target_lon?: number;
  congestion_index?: number;
}

export interface FleetStreamMessage {
  type: 'connection_established' | 'telemetry_batch' | 'telemetry_point' | 'ping' | 'pong' | 'subscribed' | 'ack' | 'echo';
  stream_id?: string;
  status?: string;
  timestamp: string;
  server?: string;
  protocol_version?: string;
  telemetry?: GPSVehicleTelemetry;
  batch?: GPSVehicleTelemetry[];
  payload?: any;
}

// ==============================================================================
// Phase 1 Enterprise Core Interfaces: Fleet & Maintenance
// ==============================================================================
export interface VehicleVitals {
  id: string;
  name: string;
  license_plate: string;
  make?: string;
  model?: string;
  vehicle_type: string;
  status: string;
  current_odometer: number;
  fuel_level_pct?: number;
  engine_temp_c?: number;
  oil_pressure_psi?: number;
  last_inspection_date?: string;
}

export type Vehicle = VehicleVitals;

export interface MaintenanceWorkOrder {
  id: string;
  order_number: string;
  vehicle_id: string;
  order_type: 'preventive' | 'corrective' | 'emergency';
  status: 'draft' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  parts_cost: number;
  labor_cost: number;
  total_cost: number;
  scheduled_date?: string;
  completed_date?: string;
  created_at: string;
}

export type MaintenanceOrder = MaintenanceWorkOrder;

// ==============================================================================
// Phase 1 Enterprise Core Interfaces: S2P (Procurement) & 3-Way Matching
// ==============================================================================
export interface VendorProfile {
  id: string;
  tenant_id: string;
  vendor_code: string;
  name: string;
  commercial_registration?: string;
  vat_number?: string;
  payment_terms_days: number;
  currency: string;
  email?: string;
  phone?: string;
  address?: string;
  is_active: boolean;
  created_at: string;
}

export interface PurchaseRequisitionItem {
  id: string;
  pr_number: string;
  requester_id: string;
  department: string;
  cost_center_id?: string;
  title: string;
  justification?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CONVERTED_TO_PO';
  currency: string;
  total_estimated_amount: number;
  created_at: string;
  lines: Array<{
    id?: string;
    item_description: string;
    quantity: number;
    uom: string;
    unit_price: number;
    line_total: number;
  }>;
}

export interface PurchaseOrderItem {
  id: string;
  company_id: string;
  po_number: string;
  partner_id: string;
  status: 'draft' | 'confirmed' | 'received' | 'billed' | 'cancelled';
  currency: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  order_date: string;
  lines?: Array<{
    id: string;
    description: string;
    quantity_ordered: number;
    quantity_received: number;
    quantity_billed: number;
    unit_price: number;
    line_total: number;
  }>;
}

export interface ThreeWayMatchResult {
  status: 'MATCHED' | 'HOLD_DISCREPANCY';
  purchase_order_id: string;
  goods_receipt_id: string;
  invoice_no: string;
  billed_amount: number;
  expected_amount: number;
  quantity_ordered: number;
  quantity_received: number;
  variance_amount: number;
  variance_percentage: number;
  discrepancy_reasons: string[];
}

// ==============================================================================
// Phase 1 Enterprise Core Interfaces: Workflows & Approvals
// ==============================================================================
export interface ApprovalRuleConfig {
  id: string;
  tenant_id: string;
  document_type: 'PURCHASE_REQUISITION' | 'PURCHASE_ORDER' | 'VENDOR_BILL';
  min_amount: number;
  max_amount: number;
  currency: string;
  sequence_order: number;
  required_role_code: string;
  is_active: boolean;
}

export interface WorkflowInstanceRecord {
  id: string;
  tenant_id: string;
  document_type: string;
  document_id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  current_step: number;
  created_at: string;
  steps?: WorkflowStepRecord[];
}

export interface WorkflowStepRecord {
  id: string;
  instance_id: string;
  sequence_order: number;
  assigned_role_code: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  actioned_by?: string;
  actioned_at?: string;
  rejection_reason?: string;
}

// ==============================================================================
// Phase 1 Enterprise Core Interfaces: Inventory Core & Dual-UOM
// ==============================================================================
export interface MaterialItem {
  id: string;
  code: string;
  name: string;
  category: string;
  primary_uom: string;
  secondary_uom?: string;
  uom_conversion_ratio: number;
  valuation_method: string;
  standard_cost: number;
  current_moving_avg_cost: number;
}

export interface StockBalanceRecord {
  id: string;
  warehouse_id: string;
  material_id: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  unit_cost_moving_avg: number;
  total_valuation: number;
}

export interface LandedCostRecord {
  id: string;
  goods_receipt_id: string;
  freight_amount: number;
  customs_amount: number;
  port_handling_amount: number;
  insurance_amount: number;
  total_landed_cost: number;
  allocation_method: 'VALUE' | 'WEIGHT' | 'QUANTITY';
}

// ==============================================================================
// Phase 2: Biometric HRMS & Double-Entry Financial Ledgers
// ==============================================================================
export interface HrmsEmployee {
  id: string;
  tenant_id?: string;
  company_id?: string;
  user_id?: string | null;
  employee_code: string;
  employeeNumber?: string;
  first_name: string;
  last_name: string;
  name?: string;
  nameAr?: string;
  nameEn?: string;
  department: string;
  departmentAr?: string;
  departmentEn?: string;
  roleAr?: string;
  roleEn?: string;
  base_salary: number;
  baseSalary?: number;
  hire_date: string;
  hireDate?: string;
  is_active: boolean;
  status?: string;
  attendance_rate?: number;
  attendanceRate?: number;
  iqamaOrNationalId?: string;
}

export interface HrmsAttendanceLog {
  id: string;
  tenant_id: string;
  employee_id: string;
  device_id?: string | null;
  check_in: string;
  check_out?: string | null;
  biometric_hash?: string | null;
  verification_mode: string;
  created_at: string;
}

export interface HrmsPayrollRun {
  id: string;
  tenant_id: string;
  employee_id: string;
  employee_name?: string;
  employee_code?: string;
  pay_period: string;
  gross_earnings: number;
  allowances: number;
  deductions: number;
  net_pay: number;
  status: 'DRAFT' | 'APPROVED' | 'PAID' | string;
}

export interface HrmsJournalLine {
  id?: string;
  account_code: string;
  account_id?: string | null;
  description?: string | null;
  debit: number;
  credit: number;
}

export interface HrmsJournalEntry {
  id: string;
  tenant_id: string;
  company_id?: string | null;
  entry_number: string;
  entry_date: string;
  description: string;
  total_debit: number;
  total_credit: number;
  status: string;
  lines?: HrmsJournalLine[];
}

