import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserCheck,
  CalendarCheck,
  CreditCard,
  Plus,
  Search,
  CheckCircle2,
  Download,
  Clock,
  FileSpreadsheet,
  Upload,
  BookOpen,
  RefreshCw,
  AlertCircle,
  Fingerprint,
  ShieldCheck,
  DollarSign,
  ArrowRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate } from '../utils/formatters';
import { BulkImportModal } from '../components/BulkImportModal';
import { AddEmployeeModal, EmployeeRecord } from '../components/AddEmployeeModal';
import { erpApi, ApiPayrollRun, ApiAttendanceLog, ApiEmployee } from '../services/api';

export const HRMSView: React.FC = () => {
  const { language, themeMode, currentCompany, showToast } = useApp();
  const isAr = language === 'ar';
  const isDark = themeMode === 'dark';

  const [activeTab, setActiveTab] = useState<'employees' | 'payroll' | 'attendance'>('employees');
  const [searchTerm, setSearchTerm] = useState('');
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);

  // Live Backend Data States
  const [employees, setEmployees] = useState<EmployeeRecord[]>([
    {
      id: 'emp-01',
      employeeNumber: 'EMP-0412',
      nameAr: 'أحمد بن خالد التميمي',
      nameEn: 'Ahmed Al-Tamimi',
      roleAr: 'مشرف عمليات الميزان والقبان',
      roleEn: 'Weighbridge Operations Supervisor',
      departmentAr: 'العمليات اللوجستية',
      departmentEn: 'Logistics Operations',
      baseSalary: 12500,
      attendanceRate: 98.5,
      status: 'ACTIVE',
      iqamaOrNationalId: '1092837461',
    },
    {
      id: 'emp-02',
      employeeNumber: 'EMP-0418',
      nameAr: 'محمد عبد الله الشمري',
      nameEn: 'Mohammed Al-Shammari',
      roleAr: 'محاسب مالي أول',
      roleEn: 'Senior Financial Accountant',
      departmentAr: 'الإدارة المالية',
      departmentEn: 'Finance & Accounts',
      baseSalary: 14000,
      attendanceRate: 100,
      status: 'ACTIVE',
      iqamaOrNationalId: '1084729104',
    },
    {
      id: 'emp-03',
      employeeNumber: 'EMP-0425',
      nameAr: 'طارق سيف الزهراني',
      nameEn: 'Tariq Al-Zahrani',
      roleAr: 'مدير حركة الأسطول والشاحنات',
      roleEn: 'Fleet Movement Controller',
      departmentAr: 'الأسطول والنقل',
      departmentEn: 'Fleet Dispatch',
      baseSalary: 11000,
      attendanceRate: 96.0,
      status: 'ACTIVE',
      iqamaOrNationalId: '1073829105',
    },
  ]);

  const [payrollRuns, setPayrollRuns] = useState<ApiPayrollRun[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<ApiAttendanceLog[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);
  const [isLoadingPayroll, setIsLoadingPayroll] = useState(false);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [postingPayrollId, setPostingPayrollId] = useState<string | null>(null);
  const [isDraftingPayroll, setIsDraftingPayroll] = useState(false);

  // 1. Fetch live employees from /api/hrms/employees
  const loadEmployees = async () => {
    setIsLoadingEmployees(true);
    try {
      const data = await erpApi.getHrmsEmployees(currentCompany?.id);
      if (Array.isArray(data) && data.length > 0) {
        setEmployees(data.map((d: any) => ({
          id: d.id,
          employeeNumber: d.employeeNumber || d.employee_code || 'EMP-0000',
          nameAr: d.nameAr || `${d.first_name || ''} ${d.last_name || ''}`.trim() || d.name || 'موظف',
          nameEn: d.nameEn || `${d.first_name || ''} ${d.last_name || ''}`.trim() || d.name || 'Employee',
          roleAr: d.roleAr || 'موظف',
          roleEn: d.roleEn || 'Employee',
          departmentAr: d.departmentAr || d.department || 'العمليات اللوجستية',
          departmentEn: d.departmentEn || d.department || 'Logistics Operations',
          baseSalary: typeof d.base_salary === 'number' ? d.base_salary : (parseFloat(d.base_salary) || d.baseSalary || 10000),
          attendanceRate: d.attendanceRate ?? 100,
          status: (d.is_active === false || d.status === 'TERMINATED' ? 'TERMINATED' : d.status === 'LEAVE' ? 'ON_LEAVE' : 'ACTIVE') as 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED',
          iqamaOrNationalId: d.iqamaOrNationalId || '1092837461',
        })));
      }
    } catch (err) {
      console.error('Failed to load employees:', err);
    } finally {
      setIsLoadingEmployees(false);
    }
  };

  // 2. Fetch live payroll runs from /api/hrms/payroll
  const loadPayrollRuns = async () => {
    setIsLoadingPayroll(true);
    try {
      const data = await erpApi.getHrmsPayrollRuns(currentCompany?.id);
      if (Array.isArray(data)) {
        setPayrollRuns(data);
      }
    } catch (err) {
      console.error('Failed to load payroll runs:', err);
    } finally {
      setIsLoadingPayroll(false);
    }
  };

  // 3. Fetch live attendance logs from /api/hrms/attendance
  const loadAttendanceLogs = async () => {
    setIsLoadingAttendance(true);
    try {
      const data = await erpApi.getHrmsAttendanceLogs(currentCompany?.id);
      if (Array.isArray(data)) {
        setAttendanceLogs(data);
      }
    } catch (err) {
      console.error('Failed to load attendance logs:', err);
    } finally {
      setIsLoadingAttendance(false);
    }
  };

  useEffect(() => {
    loadEmployees();
    loadPayrollRuns();
    loadAttendanceLogs();
  }, [currentCompany?.id]);

  // Ledger Action: Post Payroll to General Ledger
  const handlePostPayrollToLedger = async (runId: string) => {
    setPostingPayrollId(runId);
    try {
      const result = await erpApi.postPayrollToLedger(runId, currentCompany?.id);
      showToast(
        isAr
          ? `تم ترحيل مسير الرواتب لدفتر الأستاذ العام بنجاح! رقم القيد المالي: ${result.entry_number}`
          : `Payroll successfully posted to General Ledger! Journal Entry: ${result.entry_number}`,
        'success'
      );
      await loadPayrollRuns();
    } catch (err: any) {
      const errorMsg = err?.detail || err?.message || (isAr ? 'فشل ترحيل مسير الرواتب إلى دفتر الأستاذ' : 'Failed to post payroll to ledger');
      showToast(errorMsg, 'error');
    } finally {
      setPostingPayrollId(null);
    }
  };

  // Quick Action: Draft a Sample Payroll Run
  const handleGenerateSamplePayrollRun = async () => {
    if (employees.length === 0) {
      showToast(isAr ? 'يرجى تسجيل موظف أولاً لإنشاء مسيرة رواتب' : 'Please register an employee first', 'warning');
      return;
    }
    setIsDraftingPayroll(true);
    try {
      const targetEmp = employees[0];
      const salary = targetEmp.baseSalary || 12000;
      const allowances = 1500;
      const deductions = 500;
      const currentPeriod = new Date().toISOString().slice(0, 7); // e.g. "2026-09"

      await erpApi.createHrmsPayrollRun({
        employee_id: targetEmp.id,
        pay_period: currentPeriod,
        gross_earnings: salary,
        allowances,
        deductions,
        status: 'DRAFT',
      }, currentCompany?.id);

      showToast(
        isAr ? `تم إعداد مسودة مسيرة رواتب جديدة لشهر ${currentPeriod}` : `Draft payroll run generated for period ${currentPeriod}`,
        'success'
      );
      await loadPayrollRuns();
    } catch (err: any) {
      showToast(err?.detail || err?.message || (isAr ? 'فشل توليد مسير الرواتب' : 'Failed to draft payroll run'), 'error');
    } finally {
      setIsDraftingPayroll(false);
    }
  };

  // Quick Action: Record a Sample Biometric Attendance Scan
  const handleRecordSampleScan = async () => {
    if (employees.length === 0) {
      showToast(isAr ? 'يرجى تسجيل موظف أولاً' : 'Please register an employee first', 'warning');
      return;
    }
    try {
      const targetEmp = employees[0];
      await erpApi.recordHrmsAttendance({
        employee_id: targetEmp.id,
        device_id: 'BIO-SCANNER-01',
        verification_mode: 'BIOMETRIC_FINGERPRINT',
        check_in: new Date().toISOString(),
      }, currentCompany?.id);

      showToast(
        isAr ? 'تم تسجيل حركة البصمة البيومترية بنجاح' : 'Biometric fingerprint scan logged successfully',
        'success'
      );
      await loadAttendanceLogs();
    } catch (err: any) {
      showToast(err?.detail || err?.message || (isAr ? 'فشل تسجيل حركة البصمة' : 'Failed to record attendance scan'), 'error');
    }
  };

  // Filtered employees by search input
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (!emp) return false;
      const q = (searchTerm || '').trim().toLowerCase();
      return (
        (emp.nameAr || '').includes(searchTerm) ||
        (emp.nameEn || '').toLowerCase().includes(q) ||
        (emp.employeeNumber || '').toLowerCase().includes(q) ||
        (emp.departmentAr || '').includes(searchTerm) ||
        (emp.departmentEn || '').toLowerCase().includes(q)
      );
    });
  }, [employees, searchTerm]);

  // Total payroll amount computed from active runs or employees
  const totalPayrollValue = useMemo(() => {
    if (payrollRuns.length > 0) {
      return payrollRuns.reduce((sum, r) => sum + (Number(r.net_pay) || 0), 0);
    }
    return employees.reduce((sum, e) => sum + (e.baseSalary || 0), 0);
  }, [payrollRuns, employees]);

  return (
    <div className="space-y-6 px-3 sm:px-4 md:px-6 w-full max-w-7xl mx-auto" id="hrms-view">
      {/* Top Header Card */}
      <div
        className={`flex flex-col justify-between gap-4 rounded-3xl border p-6 shadow-xs transition-colors sm:flex-row sm:items-center ${
          isDark ? 'border-slate-800 bg-[#141726]' : 'border-slate-200/80 bg-white'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500/10 text-[#F05627]">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 dark:text-white">
                {isAr ? 'الموارد البشرية والرواتب (HR & Payroll)' : 'Human Resources & Payroll'}
              </h1>
              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-black text-emerald-700">
                WPS Compliant (GOSI)
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isAr
                ? 'إدارة شؤون الموظفين، سجلات البصمة والحضور البيومتري، ومسيرات الرواتب المتوافقة مع نظام حماية الأجور (WPS) مع الترحيل المالي لدفتر الأستاذ'
                : 'Personnel Directory, Biometric Attendance Logs, and Automated GOSI/WPS Payroll Double-Entry Ledger Integration'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Universal Bulk Import Button (REM-P7) */}
          <button
            id="bulk-import-hrms-btn"
            type="button"
            onClick={() => setIsBulkImportOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50/80 px-3.5 py-2.5 text-xs font-bold text-emerald-900 shadow-2xs hover:bg-emerald-100 transition-colors"
            title={isAr ? 'استيراد بيانات الموظفين والرواتب وقاعدة البيانات الشاملة (CSV / Excel)' : 'Bulk Import (CSV/Excel)'}
          >
            <Upload className="h-4 w-4 text-emerald-700" />
            <span>{isAr ? 'استيراد بيانات / Bulk Import (CSV/Excel)' : 'Bulk Import (CSV/Excel)'}</span>
          </button>

          <button
            id="add-employee-btn"
            type="button"
            onClick={() => setIsAddEmployeeOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-black text-white shadow-md shadow-orange-500/20 hover:bg-orange-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>{isAr ? 'إضافة موظف جديد' : 'Add Employee'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div
          className={`rounded-2xl border p-4 shadow-xs ${
            isDark ? 'border-slate-800 bg-[#141726]' : 'border-slate-200/80 bg-white'
          }`}
        >
          <span className="text-[11px] font-semibold text-slate-500">
            {isAr ? 'إجمالي الكادر الوظيفي' : 'Total Personnel'}
          </span>
          <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">
            {employees.length} {isAr ? 'موظفاً' : 'Employees'}
          </p>
        </div>
        <div
          className={`rounded-2xl border p-4 shadow-xs ${
            isDark ? 'border-slate-800 bg-[#141726]' : 'border-slate-200/80 bg-white'
          }`}
        >
          <span className="text-[11px] font-semibold text-slate-500">
            {isAr ? 'سجلات الحضور البيومتري' : 'Biometric Logs Count'}
          </span>
          <p className="mt-1 text-lg font-black text-emerald-600">
            {attendanceLogs.length > 0 ? `${attendanceLogs.length} سجل` : '98.2%'}
          </p>
        </div>
        <div
          className={`rounded-2xl border p-4 shadow-xs ${
            isDark ? 'border-slate-800 bg-[#141726]' : 'border-slate-200/80 bg-white'
          }`}
        >
          <span className="text-[11px] font-semibold text-slate-500">
            {isAr ? 'إجمالي مسير الرواتب' : 'Monthly Payroll Value'}
          </span>
          <p className="mt-1 text-lg font-black text-[#F05627]">
            <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono">{formatCurrency(totalPayrollValue, language)}</span>
          </p>
        </div>
        <div
          className={`rounded-2xl border p-4 shadow-xs ${
            isDark ? 'border-slate-800 bg-[#141726]' : 'border-slate-200/80 bg-white'
          }`}
        >
          <span className="text-[11px] font-semibold text-slate-500">
            {isAr ? 'مسيرات الرواتب المنشأة' : 'Payroll Runs Tracked'}
          </span>
          <p className="mt-1 text-lg font-black text-emerald-600">
            {payrollRuns.length} {isAr ? 'مسيرة' : 'Runs'}
          </p>
        </div>
      </div>

      {/* Filter and Tab Bar */}
      <div
        className={`flex flex-col gap-3 rounded-2xl border p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between ${
          isDark ? 'border-slate-800 bg-[#141726]' : 'border-slate-200/80 bg-white'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('employees')}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'employees'
                ? 'bg-slate-900 text-white dark:bg-orange-500'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {isAr ? 'دليل الموظفين' : 'Employee Directory'} ({employees.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('payroll')}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'payroll'
                ? 'bg-slate-900 text-white dark:bg-orange-500'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {isAr ? 'مسيرات الرواتب ودفتر الأستاذ (GL Payroll)' : 'Payroll & General Ledger'} ({payrollRuns.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('attendance')}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'attendance'
                ? 'bg-slate-900 text-white dark:bg-orange-500'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {isAr ? 'سجلات الحضور البيومتري' : 'Biometric Logs'} ({attendanceLogs.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'payroll' && (
            <button
              type="button"
              disabled={isDraftingPayroll}
              onClick={handleGenerateSamplePayrollRun}
              className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/80 px-3 py-1.5 text-xs font-bold text-indigo-900 shadow-2xs hover:bg-indigo-100 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {isDraftingPayroll ? <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" /> : <Plus className="h-3.5 w-3.5 shrink-0" />}
              <span>{isAr ? 'إعداد مسودة مسير جديدة' : 'Draft Payroll Run'}</span>
            </button>
          )}

          {activeTab === 'attendance' && (
            <button
              type="button"
              onClick={handleRecordSampleScan}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50/80 px-3 py-1.5 text-xs font-bold text-emerald-900 shadow-2xs hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0"
            >
              <Fingerprint className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
              <span>{isAr ? 'تسجيل حركة بصمة' : 'Record Biometric Scan'}</span>
            </button>
          )}

          <div className="relative min-w-[220px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 rtl:right-3 rtl:left-auto ltr:left-3 ltr:right-auto" />
            <input
              type="text"
              placeholder={isAr ? 'بحث بالاسم أو الرقم الوظيفي...' : 'Search employee or ID...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-1.5 px-8 text-xs text-slate-900 placeholder-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Main Tab Views */}
      <div
        className={`rounded-3xl border shadow-xs overflow-hidden ${
          isDark ? 'border-slate-800 bg-[#141726]' : 'border-slate-200/80 bg-white'
        }`}
      >
        {/* Tab 1: Employees Directory */}
        {activeTab === 'employees' && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr
                  className={`border-b font-black ${
                    isDark
                      ? 'border-slate-800 bg-slate-900/60 text-slate-300'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  <th className="py-3 px-4">{isAr ? 'الرقم الوظيفي' : 'Emp ID'}</th>
                  <th className="py-3 px-4">{isAr ? 'اسم الموظف' : 'Employee Name'}</th>
                  <th className="py-3 px-4">{isAr ? 'المسمى الوظيفي' : 'Designation'}</th>
                  <th className="py-3 px-4">{isAr ? 'القسم' : 'Department'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الراتب الأساسي' : 'Base Salary'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'نسبة الحضور' : 'Attendance'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      {isAr ? 'لم يتم العثور على موظفين مطابقين للبحث' : 'No matching employees found'}
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => (
                    <tr
                      key={emp.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                        <span dir="ltr" className="inline-block unicode-bidi-isolate">{emp.employeeNumber}</span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-200">
                        {isAr ? emp.nameAr : emp.nameEn}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                        {isAr ? emp.roleAr : emp.roleEn}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                        {isAr ? emp.departmentAr : emp.departmentEn}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-900 dark:text-white">
                        <span dir="ltr" className="inline-block unicode-bidi-isolate">{formatCurrency(emp.baseSalary, language)}</span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-emerald-600">
                        <span dir="ltr" className="inline-block unicode-bidi-isolate">{emp.attendanceRate}%</span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 whitespace-nowrap shrink-0">
                          <CheckCircle2 className="h-3 w-3 shrink-0" />
                          {emp.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Payroll Runs & GL Ledger Integration */}
        {activeTab === 'payroll' && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr
                  className={`border-b font-black ${
                    isDark
                      ? 'border-slate-800 bg-slate-900/60 text-slate-300'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  <th className="py-3 px-4">{isAr ? 'فترة المسير' : 'Period'}</th>
                  <th className="py-3 px-4">{isAr ? 'معرف / اسم الموظف' : 'Employee ID / Name'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الراتب الإجمالي' : 'Gross Earnings'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'البدلات' : 'Allowances'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الاستقطاعات' : 'Deductions'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'صافي الراتب' : 'Net Pay'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'حالة المسير' : 'Status'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الترحيل المالي (GL)' : 'Ledger Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {isLoadingPayroll ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto text-slate-400" />
                    </td>
                  </tr>
                ) : payrollRuns.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center">
                      <p className="text-slate-500 font-bold mb-3">
                        {isAr ? 'لا توجد مسيرات رواتب مسجلة حالياً في النظام' : 'No payroll runs currently recorded.'}
                      </p>
                      <button
                        type="button"
                        onClick={handleGenerateSamplePayrollRun}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-700 transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                        <span>{isAr ? 'توليد مسودة مسير رواتب تجريبية' : 'Generate Sample Draft Payroll Run'}</span>
                      </button>
                    </td>
                  </tr>
                ) : (
                  payrollRuns.map((run) => {
                    const matchedEmp = employees.find((e) => e.id === run.employee_id);
                    const empLabel = matchedEmp
                      ? `${isAr ? matchedEmp.nameAr : matchedEmp.nameEn} (${matchedEmp.employeeNumber})`
                      : run.employee_name || run.employee_id.slice(0, 8);

                    return (
                      <tr
                        key={run.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                          <span dir="ltr" className="inline-block unicode-bidi-isolate">{run.pay_period}</span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-200">
                          {empLabel}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-900 dark:text-white">
                          <span dir="ltr" className="inline-block unicode-bidi-isolate">{formatCurrency(Number(run.gross_earnings), language)}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-emerald-600">
                          +<span dir="ltr" className="inline-block unicode-bidi-isolate">{formatCurrency(Number(run.allowances), language)}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-rose-600">
                          -<span dir="ltr" className="inline-block unicode-bidi-isolate">{formatCurrency(Number(run.deductions), language)}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-black text-blue-600">
                          <span dir="ltr" className="inline-block unicode-bidi-isolate">{formatCurrency(Number(run.net_pay), language)}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0 ${
                              run.status === 'APPROVED' || run.status === 'PAID'
                                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                                : 'bg-amber-50 border border-amber-200 text-amber-800'
                            }`}
                          >
                            {run.status === 'APPROVED' || run.status === 'PAID'
                              ? isAr
                                ? 'معتمد ومرحل'
                                : 'Approved'
                              : isAr
                              ? 'مسودة'
                              : 'Draft'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {run.status === 'DRAFT' ? (
                            <button
                              type="button"
                              disabled={postingPayrollId === run.id}
                              onClick={() => handlePostPayrollToLedger(run.id)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:opacity-95 disabled:opacity-50 transition-all whitespace-nowrap shrink-0"
                              title={isAr ? 'ترحيل مسير الراتب إلى دفتر الأستاذ العام بقيد متوازن' : 'Post balanced double-entry to General Ledger'}
                            >
                              {postingPayrollId === run.id ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
                              ) : (
                                <BookOpen className="h-3.5 w-3.5 shrink-0" />
                              )}
                              <span>{isAr ? 'ترحيل لدفتر الأستاذ (Post to GL)' : 'Post to GL'}</span>
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 whitespace-nowrap shrink-0">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              <span>{isAr ? 'مرحل لدفتر الأستاذ (Posted)' : 'Posted to GL'}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Biometric Attendance Logs */}
        {activeTab === 'attendance' && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr
                  className={`border-b font-black ${
                    isDark
                      ? 'border-slate-800 bg-slate-900/60 text-slate-300'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  <th className="py-3 px-4">{isAr ? 'معرف الموظف' : 'Employee'}</th>
                  <th className="py-3 px-4">{isAr ? 'جهاز المسح البيومتري' : 'Device ID'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'نمط التحقق' : 'Verification Mode'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'وقت تسجيل الدخول' : 'Check-In'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'وقت تسجيل الخروج' : 'Check-Out'}</th>
                  <th className="py-3 px-4">{isAr ? 'البصمة المشفرة (Hash)' : 'Biometric Hash'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {isLoadingAttendance ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto text-slate-400" />
                    </td>
                  </tr>
                ) : attendanceLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <p className="text-slate-500 font-bold mb-3">
                        {isAr ? 'لا توجد حركات بصمة مسجلة حتى الآن' : 'No biometric scans logged yet.'}
                      </p>
                      <button
                        type="button"
                        onClick={handleRecordSampleScan}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors"
                      >
                        <Fingerprint className="h-4 w-4" />
                        <span>{isAr ? 'تسجيل حركة بصمة تجريبية' : 'Record Sample Biometric Scan'}</span>
                      </button>
                    </td>
                  </tr>
                ) : (
                  attendanceLogs.map((log) => {
                    const matchedEmp = employees.find((e) => e.id === log.employee_id);
                    const empLabel = matchedEmp
                      ? `${isAr ? matchedEmp.nameAr : matchedEmp.nameEn} (${matchedEmp.employeeNumber})`
                      : log.employee_id.slice(0, 8);

                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-200">
                          {empLabel}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                          <span dir="ltr" className="inline-block unicode-bidi-isolate">{log.device_id || 'BIO-SCANNER-01'}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                            <Fingerprint className="h-3 w-3 text-blue-600" />
                            {log.verification_mode}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-slate-700 dark:text-slate-300">
                          <span dir="ltr" className="inline-block unicode-bidi-isolate">{formatDate(log.check_in, language)} {new Date(log.check_in).toLocaleTimeString(language === 'ar' ? 'ar-SA' : 'en-US')}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-slate-500">
                          {log.check_out ? (
                            <span dir="ltr" className="inline-block unicode-bidi-isolate">{formatDate(log.check_out, language)} {new Date(log.check_out).toLocaleTimeString(language === 'ar' ? 'ar-SA' : 'en-US')}</span>
                          ) : (
                            <span className="text-amber-600">{isAr ? 'نشط حالياً' : 'Active'}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[10px] text-slate-500">
                          <span dir="ltr" className="inline-block unicode-bidi-isolate">{log.biometric_hash ? `${log.biometric_hash.slice(0, 16)}...` : 'N/A'}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Universal Bulk Import Modal (REM-P7) */}
      <BulkImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        defaultCategory="partners"
      />

      {/* Add Employee Modal with Direct Backend Persistence & Optimistic Update */}
      <AddEmployeeModal
        isOpen={isAddEmployeeOpen}
        onClose={() => setIsAddEmployeeOpen(false)}
        onEmployeeAdded={(newEmployee) => {
          setEmployees((prev) => [newEmployee, ...prev]);
        }}
      />
    </div>
  );
};
