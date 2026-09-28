import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  Customer,
  Crusher,
  Transporter,
  MaterialOption,
  User,
  UserRole,
  UOMType,
  SUPPORTED_UOMS,
} from '../types';
import {
  X,
  Building2,
  Database,
  Truck,
  Package,
  Users,
  CheckCircle,
  Save,
  Layers,
  Shield,
} from 'lucide-react';

export type CRUDModalType = 'customer' | 'crusher' | 'transporter' | 'material' | 'user';

interface EntityCRUDModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: CRUDModalType;
  initialData?: any | null; // If present, edit mode; otherwise create mode
}

export const EntityCRUDModal: React.FC<EntityCRUDModalProps> = ({
  isOpen,
  onClose,
  entityType,
  initialData,
}) => {
  const {
    addCustomer,
    updateCustomer,
    addCrusher,
    updateCrusher,
    addTransporter,
    updateTransporter,
    addMaterial,
    updateMaterial,
    addUser,
    updateUser,
    customers,
    language,
    showToast,
  } = useApp();

  const isAr = language === 'ar';
  const isEdit = !!initialData;

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Form State
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (initialData) {
      setFormData({ ...initialData });
    } else {
      // Default empty structures
      if (entityType === 'customer') {
        setFormData({
          customerName: '',
          customerNameEn: '',
          taxNumber: '',
          crNumber: '',
          contactPerson: '',
          phone: '',
          email: '',
          address: '',
          creditLimit: 500000,
          openingBalance: 0,
        });
      } else if (entityType === 'crusher') {
        setFormData({
          crusherName: '',
          crusherNameEn: '',
          location: '',
          bankDetails: '',
          accountNumber: '',
          taxNumber: '',
          materialProduced: 'حصى وركام خرساني',
          openingBalance: 0,
          contactPerson: '',
          phone: '',
        });
      } else if (entityType === 'transporter') {
        setFormData({
          transporterName: '',
          transporterNameEn: '',
          driverName: '',
          phone: '',
          truckDetails: 'مرسيدس أكتروس قلاب 32م³',
          defaultTruckNo: '',
          capacityTons: 44,
          ratePerTon: 18,
        });
      } else if (entityType === 'material') {
        setFormData({
          nameAr: '',
          nameEn: '',
          category: 'Aggregate',
          defaultSellingPrice: 45,
          defaultPurchasePrice: 26,
          unit: 'MT طن',
        });
      } else if (entityType === 'user') {
        setFormData({
          username: '',
          fullName: '',
          fullNameAr: '',
          email: '',
          phone: '',
          role: 'Data_Entry' as UserRole,
          assignedCustomerId: '',
        });
      }
    }
  }, [initialData, entityType, isOpen]);

  if (!isOpen) return null;

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (entityType === 'customer') {
      if (isEdit) {
        updateCustomer(initialData.id, formData);
      } else {
        addCustomer(formData);
      }
    } else if (entityType === 'crusher') {
      if (isEdit) {
        updateCrusher(initialData.id, formData);
      } else {
        addCrusher(formData);
      }
    } else if (entityType === 'transporter') {
      if (isEdit) {
        updateTransporter(initialData.id, formData);
      } else {
        addTransporter(formData);
      }
    } else if (entityType === 'material') {
      if (isEdit) {
        updateMaterial(initialData.id, formData);
      } else {
        addMaterial(formData);
      }
    } else if (entityType === 'user') {
      if (isEdit) {
        updateUser(initialData.id, formData);
      } else {
        addUser(formData);
      }
    }

    showToast(isAr ? 'تم حفظ بيانات السجل بنجاح' : 'Entity record saved successfully', 'success');
    onClose();
  };

  const getHeader = () => {
    switch (entityType) {
      case 'customer':
        return {
          title: isEdit
            ? isAr
              ? 'تعديل بيانات العميل'
              : 'Edit Customer Details'
            : isAr
              ? 'إضافة عميل جديد'
              : 'Add New Customer',
          icon: Building2,
        };
      case 'crusher':
        return {
          title: isEdit
            ? isAr
              ? 'تعديل بيانات مورد المواد'
              : 'Edit Material Supplier Details'
            : isAr
              ? 'إضافة مورد مواد جديد'
              : 'Add Material Supplier',
          icon: Database,
        };
      case 'transporter':
        return {
          title: isEdit
            ? isAr
              ? 'تعديل بيانات مورد الخدمة'
              : 'Edit Service Supplier Details'
            : isAr
              ? 'إضافة مورد خدمة جديد'
              : 'Add Service Supplier',
          icon: Truck,
        };
      case 'material':
        return {
          title: isEdit
            ? isAr
              ? 'تعديل صنف المادة'
              : 'Edit Material Item'
            : isAr
              ? 'إضافة مادة / صنف توريد جديد'
              : 'Add New Material Item',
          subtitle: isAr
            ? 'الأسعار القياسية، الكود الضريبي، وهوامش الربح'
            : 'Standard selling/buying rates & profit margins',
          icon: Layers,
          color: 'amber',
        };
      case 'user':
        return {
          title: isEdit
            ? isAr
              ? 'تعديل بيانات المستخدم'
              : 'Edit User Account'
            : isAr
              ? 'إضافة مستخدم جديد للنظام'
              : 'Add New System User',
          subtitle: isAr
            ? 'الصلاحيات، الأدوار الوظيفية، والارتباط بالعملاء'
            : 'Roles, RBAC permissions, customer portal mapping',
          icon: Shield,
          color: 'purple',
        };
      default:
        return {
          title: 'Entity',
          subtitle: '',
          icon: Users,
          color: 'slate',
        };
    }
  };

  const header = getHeader();
  const HeaderIcon = header.icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="entity-crud-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
              <HeaderIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 id="entity-crud-title" className="text-base font-black text-slate-900">
                {header.title}
              </h2>
              <p className="text-xs text-slate-500">{header.subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form noValidate onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4 flex-1">
          {/* CUSTOMER FORM */}
          {entityType === 'customer' && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'اسم العميل (بالعربي) *' : 'Customer Name (AR) *'}
                  </label>
                  <input
                    type="text"
                    value={formData.customerName || ''}
                    onChange={(e) => handleChange('customerName', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'اسم العميل (بالإنجليزي)' : 'Customer Name (EN)'}
                  </label>
                  <input
                    type="text"
                    value={formData.customerNameEn || ''}
                    onChange={(e) => handleChange('customerNameEn', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'الرقم الضريبي (VAT Reg Number - 15 رقم) *' : 'Tax Number (15 Digits) *'}
                  </label>
                  <input
                    type="text"
                    value={formData.taxNumber || ''}
                    onChange={(e) => handleChange('taxNumber', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'رقم السجل التجاري (CR Number)' : 'CR Number'}
                  </label>
                  <input
                    type="text"
                    value={formData.crNumber || ''}
                    onChange={(e) => handleChange('crNumber', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'الشخص المسؤول' : 'Contact Person'}
                  </label>
                  <input
                    type="text"
                    value={formData.contactPerson || ''}
                    onChange={(e) => handleChange('contactPerson', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'رقم الهاتف' : 'Phone'}
                  </label>
                  <input
                    type="text"
                    value={formData.phone || ''}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'البريد الإلكتروني' : 'Email'}
                  </label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  {isAr ? 'العنوان والموقع الجغرافي / المشروع' : 'Site / Project Address'}
                </label>
                <input
                  type="text"
                  value={formData.address || ''}
                  onChange={(e) => handleChange('address', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'الحد الائتماني (ر.س)' : 'Credit Limit (SAR)'}
                  </label>
                  <input
                    type="number"
                    value={formData.creditLimit || 0}
                    onChange={(e) => handleChange('creditLimit', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'الرصيد الافتتاحي (ر.س)' : 'Opening Balance (SAR)'}
                  </label>
                  <input
                    type="number"
                    value={formData.openingBalance || 0}
                    onChange={(e) => handleChange('openingBalance', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          {/* CRUSHER FORM */}
          {entityType === 'crusher' && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'اسم مورد المواد الخام *' : 'Raw Materials Supplier Name *'}
                  </label>
                  <input
                    type="text"
                    value={formData.crusherName || ''}
                    onChange={(e) => handleChange('crusherName', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'الموقع الجغرافي / الطريق' : 'Location'}
                  </label>
                  <input
                    type="text"
                    value={formData.location || ''}
                    onChange={(e) => handleChange('location', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  {isAr ? 'بيانات الحساب البنكي والآيبان للمدفوعات *' : 'Bank & IBAN Details *'}
                </label>
                <input
                  type="text"
                  placeholder="مصرف الراجحي - SA4280000123608010123456"
                  value={formData.bankDetails || ''}
                  onChange={(e) => handleChange('bankDetails', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'المادة الموردة الأساسية' : 'Primary Material'}
                  </label>
                  <input
                    type="text"
                    value={formData.materialProduced || ''}
                    onChange={(e) => handleChange('materialProduced', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'الرصيد الدائن الافتتاحي (ر.س)' : 'Opening Payable Balance (SAR)'}
                  </label>
                  <input
                    type="number"
                    value={formData.openingBalance || 0}
                    onChange={(e) => handleChange('openingBalance', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'الشخص المسؤول' : 'Contact Person'}
                  </label>
                  <input
                    type="text"
                    value={formData.contactPerson || ''}
                    onChange={(e) => handleChange('contactPerson', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'رقم الهاتف' : 'Phone'}
                  </label>
                  <input
                    type="text"
                    value={formData.phone || ''}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          {/* TRANSPORTER FORM */}
          {entityType === 'transporter' && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'اسم مزود الخدمة *' : 'Service Supplier Name *'}
                  </label>
                  <input
                    type="text"
                    value={formData.transporterName || ''}
                    onChange={(e) => handleChange('transporterName', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'اسم السائق *' : 'Driver Name *'}
                  </label>
                  <input
                    type="text"
                    value={formData.driverName || ''}
                    onChange={(e) => handleChange('driverName', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'رقم لوحة الشاحنة الافتراضية *' : 'Default Truck Plate *'}
                  </label>
                  <input
                    type="text"
                    value={formData.defaultTruckNo || ''}
                    onChange={(e) => handleChange('defaultTruckNo', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'أجرة النقل (ر.س/MT طن)' : 'Rate / MT (SAR)'}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.ratePerTon || 18}
                    onChange={(e) => handleChange('ratePerTon', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'سعة الحمولة القياسية (MT طن)' : 'Capacity (MT)'}
                  </label>
                  <input
                    type="number"
                    value={formData.capacityTons || 44}
                    onChange={(e) => handleChange('capacityTons', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'مواصفات الشاحنة' : 'Truck Details'}
                  </label>
                  <input
                    type="text"
                    value={formData.truckDetails || ''}
                    onChange={(e) => handleChange('truckDetails', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'رقم الهاتف' : 'Phone'}
                  </label>
                  <input
                    type="text"
                    value={formData.phone || ''}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          {/* MATERIAL FORM */}
          {entityType === 'material' && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'اسم المادة (عربي) *' : 'Material Name (AR) *'}
                  </label>
                  <input
                    type="text"
                    value={formData.nameAr || ''}
                    onChange={(e) => handleChange('nameAr', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'اسم المادة (إنجليزي)' : 'Material Name (EN)'}
                  </label>
                  <input
                    type="text"
                    value={formData.nameEn || ''}
                    onChange={(e) => handleChange('nameEn', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'التصنيف' : 'Category'}
                  </label>
                  <select
                    value={formData.category || 'Aggregate'}
                    onChange={(e) => handleChange('category', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  >
                    <option value="Aggregate">{isAr ? 'حصى وركام (Aggregate)' : 'Aggregate'}</option>
                    <option value="Sand">{isAr ? 'رمل بأنواعه (Sand)' : 'Sand'}</option>
                    <option value="Powder">{isAr ? 'بودرة وزيرو (Powder)' : 'Powder'}</option>
                    <option value="Subbase">{isAr ? 'دفان وبيسكورس (Subbase)' : 'Subbase'}</option>
                    <option value="Water">{isAr ? 'مياه معالجة (Water)' : 'Water'}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'وحدة القياس (UOM) *' : 'Unit of Measure (UOM) *'}
                  </label>
                  <select
                    value={formData.unit || 'MT طن'}
                    onChange={(e) => handleChange('unit', e.target.value)}
                    className="w-full rounded-xl border border-orange-300 bg-slate-50 px-3 py-2 text-xs font-bold text-orange-950 focus:border-orange-500 focus:bg-white focus:outline-none"
                  >
                    {SUPPORTED_UOMS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {isAr ? u.labelAr : u.labelEn}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? `سعر الشراء (ر.س/${formData.unit || 'MT طن'})` : `Buy Price (${formData.unit || 'MT طن'})`}
                  </label>
                  <input
                    type="number"
                    value={formData.defaultPurchasePrice || 0}
                    onChange={(e) => handleChange('defaultPurchasePrice', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? `سعر البيع (ر.س/${formData.unit || 'MT طن'})` : `Sell Price (${formData.unit || 'MT طن'})`}
                  </label>
                  <input
                    type="number"
                    value={formData.defaultSellingPrice || 0}
                    onChange={(e) => handleChange('defaultSellingPrice', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          {/* USER FORM */}
          {entityType === 'user' && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'الاسم الكامل (عربي) *' : 'Full Name (AR) *'}
                  </label>
                  <input
                    type="text"
                    value={formData.fullNameAr || ''}
                    onChange={(e) => handleChange('fullNameAr', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'اسم المستخدم للدخول (Username) *' : 'Username *'}
                  </label>
                  <input
                    type="text"
                    value={formData.username || ''}
                    onChange={(e) => handleChange('username', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'البريد الإلكتروني الرسمي *' : 'Work Email *'}
                  </label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'رقم الهاتف' : 'Phone'}
                  </label>
                  <input
                    type="text"
                    value={formData.phone || ''}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'الدور الوظيفي ومستوى الصلاحيات (Role) *' : 'Role & Security Clearance *'}
                  </label>
                  <select
                    value={formData.role || 'Data_Entry'}
                    onChange={(e) => handleChange('role', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-orange-950 focus:border-orange-500 focus:bg-white focus:outline-none"
                  >
                    <option value="Owner">{isAr ? 'مالك المنشأة (Tenant Owner - Supreme Access)' : 'Tenant Owner - Supreme Access'}</option>
                    <option value="Admin">{isAr ? 'المدير العام والتنفيذي (Admin / CEO - Full Access)' : 'CEO / Admin - Full Access'}</option>
                    <option value="COO">{isAr ? 'المدير التنفيذي للعمليات (COO - Operations & Approvals)' : 'COO - Operations & Approvals'}</option>
                    <option value="Accountant">{isAr ? 'المدير المالي / المحاسب (Accountant - Invoices & Ledgers)' : 'Accountant / Finance'}</option>
                    <option value="Data_Entry">{isAr ? 'مدخل بيانات ميزان (Data Entry - Operations)' : 'Data Entry - Operations'}</option>
                    <option value="Guest">{isAr ? 'عميل / تدقيق خارجي (Guest - Read Only)' : 'Guest - Client Audit'}</option>
                  </select>
                </div>

                {formData.role === 'Guest' && (
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      {isAr ? 'تقييد المشاهدة بعميل محدد *' : 'Assign to Specific Client *'}
                    </label>
                    <select
                      value={formData.assignedCustomerId || ''}
                      onChange={(e) => handleChange('assignedCustomerId', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                    >
                      <option value="">{isAr ? '-- اختر العميل --' : '-- Select Client --'}</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.customerName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-orange-600 hover:bg-slate-800 dark:hover:bg-orange-700 px-6 py-2 text-xs font-bold text-white shadow-md transition-colors"
            >
              <Save className="h-4 w-4 text-emerald-400" />
              <span>{isEdit ? (isAr ? 'حفظ التعديلات' : 'Save Changes') : (isAr ? 'حفظ وإضافة' : 'Save & Add')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
