import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  Building2,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  FileUp,
  UserPlus,
  X,
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

type RegistrationMode = 'ADVANCED' | 'QUICK';
type DepartmentType =
  | 'OPERATIONS'
  | 'FINANCE'
  | 'HR_ADMIN'
  | 'FLEET_LOGISTICS'
  | 'PROCUREMENT'
  | 'WAREHOUSE'
  | 'IT'
  | 'GENERAL';

interface EmployeeFormState {
  nameAr: string;
  nameEn: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  maritalStatus: string;
  bloodType: string;
  personalMobile: string;
  emergencyContactName: string;
  emergencyContactNumber: string;
  personalEmail: string;
  idType: string;
  identityNumber: string;
  iqamaExpiryHijri: string;
  iqamaExpiryGregorian: string;
  passportNumber: string;
  passportExpiryDate: string;
  professionOnIqama: string;
  sponsorshipStatus: string;
  employeeNumber: string;
  department: string;
  departmentType: DepartmentType;
  jobTitle: string;
  managerName: string;
  hireDate: string;
  contractType: string;
  contractDurationMonths: string;
  probationPeriodDays: string;
  ibanNumber: string;
  bankName: string;
  bankCode: string;
  baseSalary: string;
  housingAllowance: string;
  transportationAllowance: string;
  operationalTelecomAllowance: string;
  foodOtherAllowance: string;
  overtimeEligible: string;
  standardWorkingHours: string;
  gosiRegistrationNumber: string;
  highestEducationLevel: string;
  fieldOfStudy: string;
  certifications: string;
  driversLicenseType: string;
  driversLicenseExpiryDate: string;
}

const JOB_TITLE_GROUPS = [
  {
    category: 'EXECUTIVE',
    label: 'Executive & C-Suite',
    titles: [
      'Chief Executive Officer (CEO)',
      'Chief Operating Officer (COO)',
      'Chief Financial Officer (CFO)',
      'Chief Technology Officer (CTO)',
      'General Manager',
    ],
  },
  {
    category: 'MANAGEMENT',
    label: 'Management & Supervisory',
    titles: [
      'Operations Manager',
      'Finance Manager',
      'HR & Admin Manager',
      'Fleet & Logistics Manager',
      'Procurement Manager',
      'Warehouse Supervisor',
      'Dispatch Supervisor',
    ],
  },
  {
    category: 'PROFESSIONAL',
    label: 'Professional & Administrative',
    titles: [
      'Senior Financial Accountant',
      'Logistics Operations Specialist',
      'HR Generalist / Government Relations Officer (Mandoob)',
      'Procurement Officer',
      'IT Support Specialist',
      'Administrative Assistant',
      'Data Entry Clerk',
    ],
  },
  {
    category: 'OPERATIONAL',
    label: 'Operational & Field',
    titles: [
      'Fleet Dispatcher',
      'Heavy Vehicle Driver',
      'Light Vehicle Driver',
      'Warehouse Operator',
      'Forklift Operator',
      'Maintenance Technician / Mechanic',
    ],
  },
  {
    category: 'FACILITY',
    label: 'Facility & Support',
    titles: ['Security Guard', 'Office Boy / Tea Boy', 'Cleaner / Janitor'],
  },
] as const;

const DEPARTMENTS: Array<{ type: DepartmentType; name: string }> = [
  { type: 'OPERATIONS', name: 'Operations' },
  { type: 'FINANCE', name: 'Finance & Accounts' },
  { type: 'HR_ADMIN', name: 'HR & Administration' },
  { type: 'FLEET_LOGISTICS', name: 'Fleet & Logistics' },
  { type: 'PROCUREMENT', name: 'Procurement' },
  { type: 'WAREHOUSE', name: 'Warehouse' },
  { type: 'IT', name: 'Information Technology' },
  { type: 'GENERAL', name: 'General' },
];

const DOCUMENT_SLOTS = [
  { type: 'NATIONAL_ID_IQAMA', label: 'National ID / Iqama Copy' },
  { type: 'PASSPORT', label: 'Passport Copy' },
  { type: 'EMPLOYMENT_CONTRACT', label: 'Signed Employment Contract' },
  { type: 'EDUCATION_CERTIFICATE', label: 'Education Certificates' },
  { type: 'DRIVERS_LICENSE', label: "Driver's License Copy" },
  { type: 'MEDICAL_INSURANCE', label: 'Medical Insurance Card' },
] as const;

type DocumentType = (typeof DOCUMENT_SLOTS)[number]['type'];
interface SelectedDocument {
  id: string;
  type: DocumentType;
  file: File;
}

const fieldClass = (isDark: boolean) =>
  `w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-500 ${
    isDark
      ? 'border-slate-700 bg-slate-900/70 text-white placeholder-slate-500'
      : 'border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400'
  }`;

const initialForm = (): EmployeeFormState => ({
  nameAr: '',
  nameEn: '',
  dateOfBirth: '',
  gender: '',
  nationality: '',
  maritalStatus: '',
  bloodType: '',
  personalMobile: '',
  emergencyContactName: '',
  emergencyContactNumber: '',
  personalEmail: '',
  idType: 'SAUDI_NATIONAL_ID',
  identityNumber: '',
  iqamaExpiryHijri: '',
  iqamaExpiryGregorian: '',
  passportNumber: '',
  passportExpiryDate: '',
  professionOnIqama: '',
  sponsorshipStatus: '',
  employeeNumber: `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
  department: 'Operations',
  departmentType: 'OPERATIONS',
  jobTitle: '',
  managerName: '',
  hireDate: new Date().toISOString().slice(0, 10),
  contractType: 'FIXED_TERM',
  contractDurationMonths: '12',
  probationPeriodDays: '90',
  ibanNumber: '',
  bankName: '',
  bankCode: '',
  baseSalary: '12500',
  housingAllowance: '0',
  transportationAllowance: '0',
  operationalTelecomAllowance: '0',
  foodOtherAllowance: '0',
  overtimeEligible: 'false',
  standardWorkingHours: '8',
  gosiRegistrationNumber: '',
  highestEducationLevel: '',
  fieldOfStudy: '',
  certifications: '',
  driversLicenseType: '',
  driversLicenseExpiryDate: '',
});

const normalizeIban = (value: string) => value.replace(/\s+/g, '').toUpperCase();

const hasValidSaudiIban = (value: string) => {
  const iban = normalizeIban(value);
  if (!/^SA\d{22}$/.test(iban)) return false;
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
  const expanded = [...rearranged]
    .map((character) => (/\d/.test(character) ? character : String(character.charCodeAt(0) - 55)))
    .join('');
  let remainder = 0;
  for (const digit of expanded) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
};

export const AddEmployeeModal: React.FC<AddEmployeeModalProps> = ({
  isOpen,
  onClose,
  onEmployeeAdded,
}) => {
  const { language, themeMode, currentCompany, showToast } = useApp();
  const isAr = language === 'ar';
  const isDark = themeMode === 'dark';
  const [mode, setMode] = useState<RegistrationMode>('ADVANCED');
  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm] = useState<EmployeeFormState>(initialForm);
  const [documents, setDocuments] = useState<SelectedDocument[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedJobCategory = useMemo(
    () => JOB_TITLE_GROUPS.find((group) => group.titles.includes(form.jobTitle as never))?.category ?? '',
    [form.jobTitle],
  );
  const totalTargetSalary =
    (Number(form.baseSalary) || 0) +
    (Number(form.housingAllowance) || 0) +
    (Number(form.transportationAllowance) || 0) +
    (Number(form.operationalTelecomAllowance) || 0) +
    (Number(form.foodOtherAllowance) || 0);

  if (!isOpen) return null;

  const update = <K extends keyof EmployeeFormState>(key: K, value: EmployeeFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const addFiles = (type: DocumentType, fileList: FileList | null) => {
    if (!fileList?.length) return;
    const selected = Array.from(fileList);
    const valid = selected.filter((file) =>
      ['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) &&
      file.size > 0 &&
      file.size <= 15 * 1024 * 1024
    );
    if (valid.length !== selected.length) {
      setError(isAr
        ? 'يسمح فقط بملفات PDF أو JPEG أو PNG حتى 15 ميغابايت لكل ملف.'
        : 'Only PDF, JPEG, or PNG documents up to 15 MB each are accepted.');
    }
    const picked = valid.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      file,
    }));
    if (picked.length) {
      setDocuments((current) => [...current, ...picked]);
      if (valid.length === selected.length) setError(null);
    }
  };

  const validate = (): boolean => {
    if (!form.nameAr.trim()) {
      setActiveStep(0);
      setError(isAr ? 'الاسم الكامل باللغة العربية مطلوب.' : 'Full Name (Arabic) is required.');
      return false;
    }
    if (!form.idType) {
      setActiveStep(1);
      setError(isAr ? 'يرجى تحديد نوع الهوية.' : 'Select an ID type.');
      return false;
    }
    if (!/^[0-9]{10}$/.test(form.identityNumber.trim())) {
      setActiveStep(1);
      setError(isAr ? 'رقم الهوية أو الإقامة يجب أن يتكون من 10 أرقام.' : 'ID / Iqama number must contain exactly 10 digits.');
      return false;
    }
    if (!hasValidSaudiIban(form.ibanNumber)) {
      setActiveStep(3);
      setError(isAr ? 'أدخل آيبان سعودي صحيحاً يبدأ بـ SA ويتكون من 24 خانة.' : 'Enter a valid 24-character Saudi IBAN beginning with SA.');
      return false;
    }
    if (!form.department || !form.jobTitle) {
      setActiveStep(2);
      setError(isAr ? 'يرجى تحديد القسم والمسمى الوظيفي.' : 'Select a department and job title.');
      return false;
    }
    if (!Number.isFinite(Number(form.baseSalary)) || Number(form.baseSalary) < 0) {
      setActiveStep(3);
      setError(isAr ? 'أدخل راتباً أساسياً صحيحاً.' : 'Enter a valid base salary.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (mode === 'ADVANCED' && activeStep < 4) {
      setActiveStep((step) => Math.min(step + 1, 4));
      return;
    }
    if (!validate()) return;

    setSubmitting(true);
    try {
      const fullName = form.nameEn.trim() || form.nameAr.trim();
      const nameParts = fullName.split(/\s+/);
      const payload = {
        registration_mode: mode,
        employee_code: form.employeeNumber.trim() || undefined,
        first_name: nameParts[0] || 'Employee',
        last_name: nameParts.slice(1).join(' ') || 'Personnel',
        name: fullName,
        name_ar: form.nameAr.trim(),
        name_en: form.nameEn.trim() || null,
        date_of_birth: form.dateOfBirth || null,
        gender: form.gender || null,
        nationality: form.nationality.trim() || null,
        marital_status: form.maritalStatus || null,
        blood_type: form.bloodType || null,
        personal_mobile: form.personalMobile.trim() || null,
        emergency_contact_name: form.emergencyContactName.trim() || null,
        emergency_contact_number: form.emergencyContactNumber.trim() || null,
        personal_email: form.personalEmail.trim() || null,
        id_type: form.idType,
        identity_number: form.identityNumber.trim(),
        iqama_expiry_hijri: form.iqamaExpiryHijri.trim() || null,
        iqama_expiry_gregorian: form.iqamaExpiryGregorian || null,
        passport_number: form.passportNumber.trim() || null,
        passport_expiry_date: form.passportExpiryDate || null,
        profession_on_iqama: form.professionOnIqama.trim() || null,
        sponsorship_status: form.sponsorshipStatus.trim() || null,
        department: form.department,
        department_type: form.departmentType,
        job_title: form.jobTitle,
        job_title_category: selectedJobCategory,
        direct_manager_name: form.managerName.trim() || null,
        hire_date: form.hireDate,
        contract_type: form.contractType,
        contract_duration_months: form.contractDurationMonths ? Number(form.contractDurationMonths) : null,
        probation_period_days: form.probationPeriodDays ? Number(form.probationPeriodDays) : null,
        iban_number: normalizeIban(form.ibanNumber),
        bank_name: form.bankName.trim() || null,
        bank_code: form.bankCode.trim() || null,
        base_salary: Number(form.baseSalary) || 0,
        housing_allowance: Number(form.housingAllowance) || 0,
        transportation_allowance: Number(form.transportationAllowance) || 0,
        operational_telecom_allowance: Number(form.operationalTelecomAllowance) || 0,
        food_other_allowance: Number(form.foodOtherAllowance) || 0,
        total_target_salary: totalTargetSalary,
        overtime_eligible: form.overtimeEligible === 'true',
        standard_working_hours: form.standardWorkingHours ? Number(form.standardWorkingHours) : null,
        gosi_registration_number: form.gosiRegistrationNumber.trim() || null,
        highest_education_level: form.highestEducationLevel || null,
        field_of_study: form.fieldOfStudy.trim() || null,
        certifications: form.certifications
          .split(/\n|,/)
          .map((item) => item.trim())
          .filter(Boolean),
        drivers_license_type: form.driversLicenseType || null,
        drivers_license_expiry_date: form.driversLicenseExpiryDate || null,
      };

      const response = await erpApi.createEmployee(payload, currentCompany?.id);
      const id = response.id || response.employee_id;
      if (!id) throw new Error(isAr ? 'لم يُرجع الخادم رقم الموظف.' : 'The server did not return an employee ID.');

      const failedUploads: string[] = [];
      for (const document of documents) {
        try {
          await erpApi.uploadEmployeeDocument(id, document.type, document.file, currentCompany?.id);
        } catch {
          failedUploads.push(document.file.name);
        }
      }

      const newRecord: EmployeeRecord = {
        id,
        employeeNumber: response.employee_code || response.employeeNumber || payload.employee_code || 'EMP-0000',
        nameAr: response.name_ar || response.nameAr || payload.name_ar,
        nameEn: response.name_en || response.nameEn || fullName,
        roleAr: response.roleAr || form.jobTitle,
        roleEn: response.roleEn || form.jobTitle,
        departmentAr: response.departmentAr || form.department,
        departmentEn: response.departmentEn || form.department,
        baseSalary: Number(response.base_salary ?? payload.base_salary),
        attendanceRate: 100,
        status: 'ACTIVE',
        iqamaOrNationalId: response.identity_number || payload.identity_number,
      };
      onEmployeeAdded(newRecord);
      if (failedUploads.length) {
        showToast(
          isAr
            ? `تم حفظ الموظف، لكن تعذر رفع ${failedUploads.length} من المستندات.`
            : `Employee saved, but ${failedUploads.length} document upload(s) failed.`,
          'warning',
        );
      } else {
        showToast(
          isAr ? 'تم تسجيل الموظف وحفظ بياناته ومستنداته' : 'Employee, registration details, and documents saved',
          'success',
        );
      }
      onClose();
    } catch (err: any) {
      const detail = err?.detail || err?.message;
      setError(typeof detail === 'string' ? detail : (isAr ? 'فشل حفظ الموظف، يرجى المحاولة ثانية.' : 'Failed to register employee. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const textField = (
    label: string,
    key: keyof EmployeeFormState,
    options: { type?: string; required?: boolean; placeholder?: string; min?: string; step?: string } = {},
  ) => (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
        {label}{options.required ? ' *' : ''}
      </span>
      <input
        type={options.type || 'text'}
        value={form[key] as string}
        required={options.required}
        min={options.min}
        step={options.step}
        placeholder={options.placeholder}
        onChange={(event) => update(key, event.target.value as never)}
        className={fieldClass(isDark)}
      />
    </label>
  );

  const selectField = (
    label: string,
    key: keyof EmployeeFormState,
    options: Array<{ value: string; label: string }>,
    required = false,
  ) => (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
        {label}{required ? ' *' : ''}
      </span>
      <select
        value={form[key] as string}
        required={required}
        onChange={(event) => update(key, event.target.value as never)}
        className={fieldClass(isDark)}
      >
        {!required && <option value="">—</option>}
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );

  const renderPersonalTab = () => (
    <div className="grid gap-4 sm:grid-cols-2">
      {textField(isAr ? 'الاسم الكامل (عربي)' : 'Full Name (Arabic)', 'nameAr', { required: true })}
      {textField(isAr ? 'الاسم الكامل (إنجليزي)' : 'Full Name (English)', 'nameEn')}
      {textField(isAr ? 'تاريخ الميلاد' : 'Date of Birth', 'dateOfBirth', { type: 'date' })}
      {selectField(isAr ? 'الجنس' : 'Gender', 'gender', [
        { value: 'MALE', label: isAr ? 'ذكر' : 'Male' },
        { value: 'FEMALE', label: isAr ? 'أنثى' : 'Female' },
      ])}
      {selectField(isAr ? 'الجنسية' : 'Nationality', 'nationality', [
        { value: 'Saudi', label: isAr ? 'سعودي' : 'Saudi' },
        { value: 'Indian', label: isAr ? 'هندي' : 'Indian' },
        { value: 'Pakistani', label: isAr ? 'باكستاني' : 'Pakistani' },
        { value: 'Egyptian', label: isAr ? 'مصري' : 'Egyptian' },
        { value: 'Bangladeshi', label: isAr ? 'بنغلاديشي' : 'Bangladeshi' },
        { value: 'Filipino', label: isAr ? 'فلبيني' : 'Filipino' },
        { value: 'Yemeni', label: isAr ? 'يمني' : 'Yemeni' },
        { value: 'Jordanian', label: isAr ? 'أردني' : 'Jordanian' },
        { value: 'Sudanese', label: isAr ? 'سوداني' : 'Sudanese' },
        { value: 'Other', label: isAr ? 'أخرى' : 'Other' },
      ])}
      {selectField(isAr ? 'الحالة الاجتماعية' : 'Marital Status', 'maritalStatus', [
        { value: 'SINGLE', label: isAr ? 'أعزب' : 'Single' },
        { value: 'MARRIED', label: isAr ? 'متزوج' : 'Married' },
      ])}
      {selectField(isAr ? 'فصيلة الدم' : 'Blood Type', 'bloodType', ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((value) => ({ value, label: value })))}
      {textField(isAr ? 'الجوال الشخصي' : 'Personal Mobile', 'personalMobile', { type: 'tel', placeholder: '+966 5X XXX XXXX' })}
      {textField(isAr ? 'اسم جهة اتصال الطوارئ' : 'Emergency Contact Name', 'emergencyContactName')}
      {textField(isAr ? 'رقم جهة اتصال الطوارئ' : 'Emergency Contact Number', 'emergencyContactNumber', { type: 'tel' })}
      <div className="sm:col-span-2">{textField(isAr ? 'البريد الإلكتروني الشخصي' : 'Personal Email', 'personalEmail', { type: 'email' })}</div>
    </div>
  );

  const renderRegulatoryTab = () => (
    <div className="grid gap-4 sm:grid-cols-2">
      {selectField(isAr ? 'نوع الهوية' : 'ID Type', 'idType', [
        { value: 'SAUDI_NATIONAL_ID', label: isAr ? 'هوية وطنية سعودية' : 'Saudi National ID' },
        { value: 'IQAMA', label: isAr ? 'إقامة' : 'Iqama' },
        { value: 'GCC_ID', label: isAr ? 'هوية خليجية' : 'GCC ID' },
        { value: 'BORDER_NUMBER', label: isAr ? 'رقم حدود' : 'Border Number' },
      ], true)}
      {textField(isAr ? 'رقم الهوية / الإقامة' : 'ID / Iqama Number', 'identityNumber', { required: true, placeholder: '10 digits' })}
      {textField(isAr ? 'انتهاء الهوية (هجري)' : 'ID / Iqama Expiry (Hijri)', 'iqamaExpiryHijri', { placeholder: 'DD/MM/YYYY AH' })}
      {textField(isAr ? 'انتهاء الهوية (ميلادي)' : 'ID / Iqama Expiry (Gregorian)', 'iqamaExpiryGregorian', { type: 'date' })}
      {textField(isAr ? 'رقم جواز السفر' : 'Passport Number', 'passportNumber')}
      {textField(isAr ? 'انتهاء جواز السفر' : 'Passport Expiry Date', 'passportExpiryDate', { type: 'date' })}
      {textField(isAr ? 'المهنة في الإقامة' : 'Profession on Iqama', 'professionOnIqama')}
      {textField(isAr ? 'حالة الكفالة' : 'Sponsorship Status', 'sponsorshipStatus')}
    </div>
  );

  const renderEmploymentTab = () => (
    <div className="grid gap-4 sm:grid-cols-2">
      {textField(isAr ? 'الرقم الوظيفي' : 'Employee ID (Auto / Custom)', 'employeeNumber')}
      <label className="block space-y-1.5">
        <span className="flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-300">
          <Building2 className="h-3.5 w-3.5" />{isAr ? 'القسم' : 'Department'} *
        </span>
        <select
          value={form.departmentType}
          onChange={(event) => {
            const department = DEPARTMENTS.find((item) => item.type === event.target.value);
            if (department) setForm((current) => ({ ...current, departmentType: department.type, department: department.name }));
          }}
          className={fieldClass(isDark)}
        >
          {DEPARTMENTS.map((item) => <option key={item.type} value={item.type}>{item.name}</option>)}
        </select>
      </label>
      <label className="block space-y-1.5 sm:col-span-2">
        <span className="flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-300">
          <Briefcase className="h-3.5 w-3.5" />{isAr ? 'المسمى الوظيفي' : 'Job Title'} *
        </span>
        <select
          value={form.jobTitle}
          onChange={(event) => update('jobTitle', event.target.value)}
          className={fieldClass(isDark)}
          required
        >
          <option value="">{isAr ? 'اختر المسمى الوظيفي' : 'Select a standardized job title'}</option>
          {JOB_TITLE_GROUPS.map((group) => (
            <optgroup key={group.category} label={group.label}>
              {group.titles.map((title) => <option key={title} value={title}>{title}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      {textField(isAr ? 'المدير المباشر / المشرف' : 'Direct Manager / Supervisor', 'managerName')}
      {textField(isAr ? 'تاريخ المباشرة' : 'Hire / Joining Date', 'hireDate', { type: 'date', required: true })}
      {selectField(isAr ? 'نوع العقد' : 'Contract Type', 'contractType', [
        { value: 'FIXED_TERM', label: isAr ? 'محدد المدة' : 'Fixed Term' },
        { value: 'INDEFINITE', label: isAr ? 'غير محدد المدة' : 'Indefinite' },
        { value: 'PART_TIME', label: isAr ? 'دوام جزئي' : 'Part-time' },
        { value: 'FREELANCE', label: isAr ? 'عمل حر' : 'Freelance' },
      ])}
      {selectField(isAr ? 'مدة العقد' : 'Contract Duration', 'contractDurationMonths', [
        { value: '12', label: isAr ? '12 شهراً' : '12 months' },
        { value: '24', label: isAr ? '24 شهراً' : '24 months' },
      ])}
      {textField(isAr ? 'فترة التجربة (أيام)' : 'Probation Period (days)', 'probationPeriodDays', { type: 'number', min: '0' })}
    </div>
  );

  const renderPayrollTab = () => (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2 rounded-xl border border-orange-200 bg-orange-50/70 p-3 text-xs text-orange-800 dark:border-orange-900/70 dark:bg-orange-950/20 dark:text-orange-200">
        {isAr ? 'يجب إدخال آيبان سعودي صحيح مكوّن من 24 خانة للتحقق من الامتثال لمتطلبات حماية الأجور.' : 'A valid 24-character Saudi IBAN is required for WPS compliance.'}
      </div>
      {textField(isAr ? 'رقم الآيبان' : 'IBAN Number', 'ibanNumber', { required: true, placeholder: 'SA + 22 digits' })}
      {textField(isAr ? 'اسم البنك' : 'Bank Name', 'bankName')}
      {textField(isAr ? 'رمز البنك' : 'Bank Code', 'bankCode')}
      {textField(isAr ? 'الراتب الأساسي (ريال)' : 'Base Salary (SAR)', 'baseSalary', { type: 'number', min: '0', step: '0.01', required: true })}
      {textField(isAr ? 'بدل السكن' : 'Housing Allowance', 'housingAllowance', { type: 'number', min: '0', step: '0.01' })}
      {textField(isAr ? 'بدل النقل' : 'Transportation Allowance', 'transportationAllowance', { type: 'number', min: '0', step: '0.01' })}
      {textField(isAr ? 'بدل الاتصالات التشغيلية' : 'Operational Telecom Allowance', 'operationalTelecomAllowance', { type: 'number', min: '0', step: '0.01' })}
      {textField(isAr ? 'بدل الطعام / بدلات أخرى' : 'Food / Other Allowances', 'foodOtherAllowance', { type: 'number', min: '0', step: '0.01' })}
      <div className="sm:col-span-2 flex items-center justify-between rounded-xl bg-slate-100 px-4 py-3 dark:bg-slate-800">
        <span className="flex items-center gap-2 text-sm font-bold"><DollarSign className="h-4 w-4 text-orange-500" />{isAr ? 'إجمالي الراتب المستهدف' : 'Total Target Salary'}</span>
        <strong className="font-mono text-lg">{totalTargetSalary.toLocaleString()} SAR</strong>
      </div>
      {selectField(isAr ? 'استحقاق العمل الإضافي' : 'Overtime Eligibility', 'overtimeEligible', [
        { value: 'true', label: isAr ? 'نعم' : 'Yes' },
        { value: 'false', label: isAr ? 'لا' : 'No' },
      ])}
      {textField(isAr ? 'ساعات العمل القياسية' : 'Standard Working Hours', 'standardWorkingHours', { type: 'number', min: '0', step: '0.25' })}
      <div className="sm:col-span-2">{textField(isAr ? 'رقم التسجيل في التأمينات (GOSI)' : 'GOSI Registration Number', 'gosiRegistrationNumber')}</div>
    </div>
  );

  const renderQualificationsTab = () => (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {selectField(isAr ? 'أعلى مستوى تعليمي' : 'Highest Education Level', 'highestEducationLevel', [
          { value: 'HIGH_SCHOOL', label: 'High School' },
          { value: 'DIPLOMA', label: 'Diploma' },
          { value: 'BACHELOR', label: "Bachelor's" },
          { value: 'MASTER', label: "Master's" },
          { value: 'DOCTORATE', label: 'Doctorate' },
          { value: 'OTHER', label: 'Other' },
        ])}
        {textField(isAr ? 'مجال الدراسة / التخصص' : 'Field of Study / Major', 'fieldOfStudy')}
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{isAr ? 'الشهادات المهنية' : 'Certifications'}</span>
          <textarea
            rows={2}
            value={form.certifications}
            onChange={(event) => update('certifications', event.target.value)}
            placeholder={isAr ? 'أدخل شهادة في كل سطر' : 'Enter one certification per line'}
            className={fieldClass(isDark)}
          />
        </label>
        {selectField(isAr ? 'نوع رخصة القيادة' : "Driver's License Type", 'driversLicenseType', [
          { value: 'PRIVATE', label: 'Private' },
          { value: 'PUBLIC', label: 'Public' },
          { value: 'HEAVY', label: 'Heavy' },
        ])}
        {textField(isAr ? 'انتهاء رخصة القيادة' : "Driver's License Expiry Date", 'driversLicenseExpiryDate', { type: 'date' })}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-black">{isAr ? 'مستندات الموظف' : 'Employee Documents'}</h3>
        <p className="mb-3 text-xs text-slate-500">
          {isAr ? 'اسحب الملفات إلى المنطقة المناسبة أو اخترها من جهازك. PDF وJPEG وPNG حتى 15 ميغابايت لكل ملف.' : 'Drop files into the appropriate category or browse. PDF, JPEG, and PNG up to 15 MB each.'}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {DOCUMENT_SLOTS.map((slot) => {
            const items = documents.filter((document) => document.type === slot.type);
            return (
              <label
                key={slot.type}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  addFiles(slot.type, event.dataTransfer.files);
                }}
                className={`cursor-pointer rounded-xl border border-dashed p-3 transition-colors hover:border-orange-400 ${
                  isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-300 bg-slate-50'
                }`}
              >
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    addFiles(slot.type, event.target.files);
                    event.currentTarget.value = '';
                  }}
                />
                <span className="flex items-center gap-2 text-xs font-bold">
                  <FileUp className="h-4 w-4 text-orange-500" />{slot.label}
                </span>
                {items.length > 0 && (
                  <span className="mt-2 block space-y-1">
                    {items.map((item) => (
                      <span key={item.id} className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                        <span className="truncate">{item.file.name}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${item.file.name}`}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setDocuments((current) => current.filter((document) => document.id !== item.id));
                          }}
                          className="shrink-0 rounded p-1 hover:bg-red-100 hover:text-red-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );

  const tabLabels = isAr
    ? ['الشخصية', 'الهوية والامتثال', 'التوظيف والعقد', 'الرواتب والبدلات', 'المؤهلات والمستندات']
    : ['Personal', 'Regulatory', 'Employment', 'Payroll', 'Qualifications'];

  const quickAddForm = () => (
    <div className="grid gap-4 sm:grid-cols-2">
      {textField(isAr ? 'الاسم الكامل (عربي)' : 'Full Name (Arabic)', 'nameAr', { required: true })}
      {textField(isAr ? 'الاسم الكامل (إنجليزي)' : 'Full Name (English)', 'nameEn')}
      {selectField(isAr ? 'نوع الهوية' : 'ID Type', 'idType', [
        { value: 'SAUDI_NATIONAL_ID', label: isAr ? 'هوية وطنية سعودية' : 'Saudi National ID' },
        { value: 'IQAMA', label: 'Iqama' },
        { value: 'GCC_ID', label: 'GCC ID' },
        { value: 'BORDER_NUMBER', label: 'Border Number' },
      ], true)}
      {textField(isAr ? 'رقم الهوية / الإقامة' : 'ID / Iqama Number', 'identityNumber', { required: true })}
      <label className="block space-y-1.5">
        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{isAr ? 'القسم' : 'Department'} *</span>
        <select
          value={form.departmentType}
          onChange={(event) => {
            const department = DEPARTMENTS.find((item) => item.type === event.target.value);
            if (department) setForm((current) => ({ ...current, departmentType: department.type, department: department.name }));
          }}
          className={fieldClass(isDark)}
        >
          {DEPARTMENTS.map((item) => <option key={item.type} value={item.type}>{item.name}</option>)}
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{isAr ? 'المسمى الوظيفي' : 'Job Title'} *</span>
        <select value={form.jobTitle} onChange={(event) => update('jobTitle', event.target.value)} className={fieldClass(isDark)}>
          <option value="">{isAr ? 'اختر المسمى' : 'Select job title'}</option>
          {JOB_TITLE_GROUPS.map((group) => (
            <optgroup key={group.category} label={group.label}>
              {group.titles.map((title) => <option key={title} value={title}>{title}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      {textField(isAr ? 'الرقم الوظيفي' : 'Employee ID', 'employeeNumber')}
      {textField(isAr ? 'تاريخ المباشرة' : 'Hire / Joining Date', 'hireDate', { type: 'date', required: true })}
      {textField(isAr ? 'رقم الآيبان' : 'IBAN Number', 'ibanNumber', { required: true, placeholder: 'SA + 22 digits' })}
      {textField(isAr ? 'الراتب الأساسي (ريال)' : 'Base Salary (SAR)', 'baseSalary', { type: 'number', min: '0', step: '0.01', required: true })}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-registration-title"
        className={`erp-modal-shell w-full max-w-5xl rounded-3xl border shadow-2xl ${
          isDark ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        <header className="erp-modal-header flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-600">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 id="employee-registration-title" className="text-lg font-black">
                {mode === 'ADVANCED'
                  ? (isAr ? 'التسجيل المتقدم للموظف' : 'Advanced Employee Registration')
                  : (isAr ? 'إضافة سريعة لموظف' : 'Quick Add Employee')}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {isAr ? 'تسجيل بيانات الموارد البشرية والامتثال وحماية الأجور.' : 'Capture HR, regulatory, and WPS payroll details.'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Close" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex flex-wrap gap-2 px-5 pt-4 sm:px-6">
          <button
            type="button"
            onClick={() => { setMode('ADVANCED'); setActiveStep(0); setError(null); }}
            className={`rounded-xl px-3 py-2 text-xs font-black ${mode === 'ADVANCED' ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
          >
            {isAr ? 'التسجيل المتقدم (5 خطوات)' : 'Advanced Registration · 5 tabs'}
          </button>
          <button
            type="button"
            onClick={() => { setMode('QUICK'); setError(null); }}
            className={`rounded-xl px-3 py-2 text-xs font-black ${mode === 'QUICK' ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
          >
            {isAr ? 'إضافة سريعة' : 'Quick Add'}
          </button>
        </div>

        {mode === 'ADVANCED' && (
          <nav aria-label="Employee registration steps" className="grid grid-cols-5 gap-1 px-5 pt-4 sm:gap-2 sm:px-6">
            {tabLabels.map((label, index) => (
              <button
                type="button"
                key={label}
                onClick={() => { setActiveStep(index); setError(null); }}
                className={`min-h-10 rounded-lg px-1.5 py-2 text-[10px] font-bold sm:text-xs ${
                  activeStep === index
                    ? 'bg-orange-500/10 text-orange-600 ring-1 ring-orange-500/30'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800'
                }`}
              >
                <span className="mr-1 opacity-60">{index + 1}</span>{label}
              </button>
            ))}
          </nav>
        )}

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="erp-modal-body min-h-0 px-5 py-5 sm:px-6">
            {error && (
              <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
              </div>
            )}
            {mode === 'QUICK'
              ? quickAddForm()
              : activeStep === 0
                ? renderPersonalTab()
                : activeStep === 1
                  ? renderRegulatoryTab()
                  : activeStep === 2
                    ? renderEmploymentTab()
                    : activeStep === 3
                      ? renderPayrollTab()
                      : renderQualificationsTab()}
          </div>

          <footer className="erp-modal-footer flex items-center justify-between gap-3 border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 sm:px-6">
            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              <Calendar className="h-3.5 w-3.5" />
              {isAr ? 'الحقول المتوافقة مطلوبة قبل الحفظ' : 'ID and WPS compliance fields are checked before save'}
            </div>
            <div className="flex items-center gap-2">
              {mode === 'ADVANCED' && activeStep > 0 && (
                <button type="button" onClick={() => setActiveStep((step) => step - 1)} disabled={submitting} className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold dark:border-slate-700">
                  <ChevronLeft className="h-4 w-4" />{isAr ? 'السابق' : 'Back'}
                </button>
              )}
              {mode === 'ADVANCED' && activeStep < 4 ? (
                <button type="submit" disabled={submitting} className="flex items-center gap-1 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-black text-white hover:bg-orange-700 disabled:opacity-50">
                  {isAr ? 'التالي' : 'Next'}<ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button type="submit" disabled={submitting} className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-black text-white hover:bg-orange-700 disabled:opacity-50">
                  {submitting ? <span className="animate-pulse">{isAr ? 'جاري الحفظ...' : 'Saving...'}</span> : <><Check className="h-4 w-4" />{isAr ? 'حفظ وتسجيل الموظف' : 'Save Employee'}</>}
                </button>
              )}
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
};
