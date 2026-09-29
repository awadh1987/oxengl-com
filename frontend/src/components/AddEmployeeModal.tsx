import React, { useState } from 'react';
import {
  UserPlus,
  X,
  AlertCircle,
  Building2,
  Briefcase,
  CreditCard,
  Hash,
  DollarSign,
  Calendar,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { erpApi } from '../services/api';

export interface EmployeeRecord {
  id: string;
  employeeNumber: string;
  nameAr: string;
  nameEn: string;
  roleAr: string;
  roleEn: string;
  departmentAr: string;
  departmentEn: string;
  baseSalary: number;
  attendanceRate: number;
  status: 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';
  iqamaOrNationalId: string;
}

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEmployeeAdded: (employee: EmployeeRecord) => void;
}

export const AddEmployeeModal: React.FC<AddEmployeeModalProps> = ({
  isOpen,
  onClose,
  onEmployeeAdded,
}) => {
  const { language, themeMode, showToast } = useApp();
  const isAr = language === 'ar';
  const isDark = themeMode === 'dark';

  const defaultEmpNum = `EMP-${Math.floor(1000 + Math.random() * 9000)}`;

  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState(defaultEmpNum);
  const [roleAr, setRoleAr] = useState('أخصائي عمليات لوجستية');
  const [roleEn, setRoleEn] = useState('Logistics Operations Specialist');
  const [departmentAr, setDepartmentAr] = useState('العمليات اللوجستية');
  const [departmentEn, setDepartmentEn] = useState('Logistics Operations');
  const [baseSalary, setBaseSalary] = useState('12500');
  const [iqamaOrNationalId, setIqamaOrNationalId] = useState('1092837461');
  const [hireDate, setHireDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDepartmentChange = (arVal: string, enVal: string) => {
    setDepartmentAr(arVal);
    setDepartmentEn(enVal);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!nameAr.trim() && !nameEn.trim()) {
      setError(isAr ? 'يرجى إدخال اسم الموظف باللغة العربية أو الإنجليزية' : 'Please provide the employee name in Arabic or English');
      return;
    }

    if (!iqamaOrNationalId.trim()) {
      setError(isAr ? 'رقم الهوية الوطنية أو الإقامة إلزامي لنظام WPS' : 'National ID or Iqama number is required for WPS compliance');
      return;
    }

    setSubmitting(true);
    try {
      const fullName = (nameEn.trim() || nameAr.trim());
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0] || 'Employee';
      const lastName = nameParts.slice(1).join(' ') || (nameAr.trim() || 'Staff');

      const payload = {
        employee_code: employeeNumber.trim() || undefined,
        employeeNumber: employeeNumber.trim() || undefined,
        first_name: firstName,
        last_name: lastName,
        name: fullName,
        nameAr: nameAr.trim() || nameEn.trim(),
        nameEn: nameEn.trim() || nameAr.trim(),
        roleAr: roleAr.trim() || 'موظف',
        roleEn: roleEn.trim() || 'Employee',
        department: departmentEn || departmentAr || 'Logistics Operations',
        departmentAr: departmentAr || 'العمليات اللوجستية',
        departmentEn: departmentEn || 'Logistics Operations',
        base_salary: parseFloat(baseSalary) || 10000,
        baseSalary: parseFloat(baseSalary) || 10000,
        iqamaOrNationalId: iqamaOrNationalId.trim(),
        hire_date: hireDate,
        hireDate: hireDate,
      };

      const response = await erpApi.createEmployee(payload);

      const newRecord: EmployeeRecord = {
        id: response.id || response.employee_id || `emp-${Date.now()}`,
        employeeNumber: response.employee_code || response.employeeNumber || payload.employee_code,
        nameAr: response.nameAr || payload.nameAr,
        nameEn: response.nameEn || payload.nameEn,
        roleAr: response.roleAr || payload.roleAr,
        roleEn: response.roleEn || payload.roleEn,
        departmentAr: response.departmentAr || payload.departmentAr,
        departmentEn: response.departmentEn || payload.departmentEn,
        baseSalary: response.baseSalary || response.base_salary || payload.baseSalary,
        attendanceRate: 100.0,
        status: 'ACTIVE',
        iqamaOrNationalId: response.iqamaOrNationalId || payload.iqamaOrNationalId,
      };

      onEmployeeAdded(newRecord);
      showToast(
        isAr ? 'تمت إضافة الموظف بنجاح وحفظه في قاعدة البيانات' : 'Employee successfully registered and persisted',
        'success'
      );
      onClose();
    } catch (err: any) {
      setError(err?.message || (isAr ? 'فشل حفظ الموظف، يرجى المحاولة ثانية' : 'Failed to register employee'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`w-full max-w-xl rounded-3xl border shadow-2xl transition-all ${
          isDark ? 'border-slate-800 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-6 dark:border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500/10 text-[#F05627]">
              <UserPlus className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">
                {isAr ? 'إضافة موظف جديد' : 'Register New Employee'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isAr
                  ? 'تسجيل كادر وظيفي جديد وربطه مع نظام حماية الأجور (WPS) والتأمينات'
                  : 'Register personnel profile with WPS compliance & GOSI tracking'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-600 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900/50">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Arabic Name */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'الاسم بالكامل (عربي) *' : 'Full Name (Arabic) *'}
              </label>
              <input
                type="text"
                required
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder={isAr ? 'أحمد بن خالد التميمي' : 'Ahmed Al-Tamimi'}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-[#F05627] ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/60 text-white placeholder-slate-500'
                    : 'border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>

            {/* English Name */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'الاسم بالإنجليزية' : 'Full Name (English)'}
              </label>
              <input
                type="text"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder={isAr ? 'أحمد التميمي' : 'Ahmed Al-Tamimi'}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-[#F05627] ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/60 text-white placeholder-slate-500'
                    : 'border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Employee Code */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                <span className="flex items-center gap-1">
                  <Hash className="h-3 w-3 text-slate-400" />
                  {isAr ? 'الرقم الوظيفي' : 'Employee ID'}
                  <span className="text-[10px] font-normal text-slate-400">({isAr ? 'توليد تلقائي' : 'Auto'})</span>
                </span>
              </label>
              <input
                type="text"
                disabled={true}
                value={employeeNumber}
                onChange={(e) => setEmployeeNumber(e.target.value)}
                placeholder={isAr ? 'يتم التوليد تلقائياً عند الحفظ' : 'Auto-generated upon save'}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-xs font-mono font-medium cursor-not-allowed opacity-75 ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/40 text-slate-400 placeholder-slate-500'
                    : 'border-slate-200 bg-slate-100 text-slate-500 placeholder-slate-400'
                }`}
              />
            </div>

            {/* National ID / Iqama */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                <span className="flex items-center gap-1">
                  <CreditCard className="h-3 w-3 text-slate-400" />
                  {isAr ? 'الهوية الوطنية / الإقامة *' : 'National ID / Iqama *'}
                </span>
              </label>
              <input
                type="text"
                required
                value={iqamaOrNationalId}
                onChange={(e) => setIqamaOrNationalId(e.target.value)}
                placeholder={isAr ? 'رقم الإقامة: 1092837461' : 'Iqama: 1092837461'}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-xs font-mono font-medium focus:outline-hidden focus:ring-2 focus:ring-[#F05627] ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/60 text-white placeholder-slate-500'
                    : 'border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Department */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-slate-400" />
                  {isAr ? 'القسم / الإدارة' : 'Department'}
                </span>
              </label>
              <select
                value={departmentAr}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'العمليات اللوجستية') handleDepartmentChange(val, 'Logistics Operations');
                  else if (val === 'الإدارة المالية') handleDepartmentChange(val, 'Finance & Accounts');
                  else if (val === 'الأسطول والنقل') handleDepartmentChange(val, 'Fleet Dispatch');
                  else if (val === 'المشتريات والمستودعات') handleDepartmentChange(val, 'Procurement & WMS');
                  else handleDepartmentChange(val, val);
                }}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-[#F05627] ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/60 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-900'
                }`}
              >
                <option value="العمليات اللوجستية">{isAr ? 'العمليات اللوجستية' : 'Logistics Operations'}</option>
                <option value="الإدارة المالية">{isAr ? 'الإدارة المالية' : 'Finance & Accounts'}</option>
                <option value="الأسطول والنقل">{isAr ? 'الأسطول والنقل' : 'Fleet Dispatch'}</option>
                <option value="المشتريات والمستودعات">{isAr ? 'المشتريات والمستودعات' : 'Procurement & WMS'}</option>
              </select>
            </div>

            {/* Job Title / Role */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3 w-3 text-slate-400" />
                  {isAr ? 'المسمى الوظيفي' : 'Job Role'}
                </span>
              </label>
              <input
                type="text"
                value={roleAr}
                onChange={(e) => {
                  setRoleAr(e.target.value);
                  setRoleEn(e.target.value);
                }}
                placeholder={isAr ? 'مشرف عمليات الميزان' : 'Weighbridge Supervisor'}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-[#F05627] ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/60 text-white placeholder-slate-500'
                    : 'border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Base Salary */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3 text-slate-400" />
                  {isAr ? 'الراتب الأساسي (ريال سعودي)' : 'Base Salary (SAR)'}
                </span>
              </label>
              <input
                type="number"
                min="3000"
                step="100"
                value={baseSalary}
                onChange={(e) => setBaseSalary(e.target.value)}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-xs font-mono font-medium focus:outline-hidden focus:ring-2 focus:ring-[#F05627] ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/60 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-900'
                }`}
              />
            </div>

            {/* Hire Date */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  {isAr ? 'تاريخ التعيين' : 'Hire Date'}
                </span>
              </label>
              <input
                type="date"
                value={hireDate}
                onChange={(e) => setHireDate(e.target.value)}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-[#F05627] ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/60 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-900'
                }`}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-black text-white shadow-md shadow-orange-500/20 hover:bg-orange-700 transition-colors disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" />
              <span>
                {submitting
                  ? (isAr ? 'جاري الحفظ...' : 'Saving...')
                  : (isAr ? 'حفظ وتثبيت الموظف' : 'Register Employee')}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
