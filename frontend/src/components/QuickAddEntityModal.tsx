import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { UOMType, SUPPORTED_UOMS } from '../types';
import {
  X,
  Plus,
  Building2,
  Database,
  Truck,
  Package,
  CheckCircle,
} from 'lucide-react';

export type QuickAddEntityType = 'Customer' | 'Crusher' | 'Transporter' | 'Material';

interface QuickAddEntityModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: QuickAddEntityType;
  onSuccess: (createdName: string, createdId: string) => void;
}

export const QuickAddEntityModal: React.FC<QuickAddEntityModalProps> = ({
  isOpen,
  onClose,
  entityType,
  onSuccess,
}) => {
  const { addCustomer, addCrusher, addTransporter, addMaterial, language, showToast } = useApp();
  const isAr = language === 'ar';

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

  // Form states
  // Customer
  const [customerName, setCustomerName] = useState('');
  const [customerNameEn, setCustomerNameEn] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  // Crusher
  const [crusherName, setCrusherName] = useState('');
  const [crusherLocation, setCrusherLocation] = useState('');
  const [crusherBank, setCrusherBank] = useState('');
  const [crusherPhone, setCrusherPhone] = useState('');

  // Transporter
  const [transporterName, setTransporterName] = useState('');
  const [driverName, setDriverName] = useState('');
  const [truckNo, setTruckNo] = useState('');
  const [transporterPhone, setTransporterPhone] = useState('');
  const [ratePerTon, setRatePerTon] = useState<number>(18);

  // Material
  const [materialNameAr, setMaterialNameAr] = useState('');
  const [materialNameEn, setMaterialNameEn] = useState('');
  const [materialCategory, setMaterialCategory] = useState<'Aggregate' | 'Sand' | 'Powder' | 'Subbase' | 'Water'>('Aggregate');
  const [materialUnit, setMaterialUnit] = useState<UOMType>('MT طن');
  const [defaultSellingPrice, setDefaultSellingPrice] = useState<number>(45);
  const [defaultPurchasePrice, setDefaultPurchasePrice] = useState<number>(26);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (entityType === 'Customer') {
      if (!customerName.trim()) {
        showToast(isAr ? 'يرجى إدخال اسم العميل' : 'Please provide customer name', 'warning');
        return;
      }
      const created = addCustomer({
        customerName,
        customerNameEn: customerNameEn || customerName,
        taxNumber: taxNumber || '300000000000003',
        contactPerson: contactPerson || 'مسؤول المشتريات',
        phone: phone || '+966 50 000 0000',
        email: 'info@client.sa',
        address: address || 'المملكة العربية السعودية',
      });
      onSuccess(created.customerName, created.id);
    } else if (entityType === 'Crusher') {
      if (!crusherName.trim()) {
        showToast(isAr ? 'يرجى إدخال اسم مورد المواد' : 'Please provide material supplier name', 'warning');
        return;
      }
      const created = addCrusher({
        crusherName,
        crusherNameEn: crusherName,
        location: crusherLocation || 'الرياض - مقالع المواد',
        bankDetails: crusherBank || 'مصرف الراجحي',
        phone: crusherPhone || '+966 50 000 0000',
        openingBalance: 0,
      });
      onSuccess(created.crusherName, created.id);
    } else if (entityType === 'Transporter') {
      if (!transporterName.trim()) {
        showToast(isAr ? 'يرجى إدخال اسم مزود الخدمة' : 'Please provide service supplier name', 'warning');
        return;
      }
      const created = addTransporter({
        transporterName,
        transporterNameEn: transporterName,
        driverName: driverName || 'سائق معتمد',
        phone: transporterPhone || '+966 50 000 0000',
        truckDetails: 'مرسيدس أكتروس قلاب 32م³',
        defaultTruckNo: truckNo || '1111-أ ب ج',
        ratePerTon: Number(ratePerTon) || 18,
      });
      onSuccess(created.transporterName, created.id);
    } else if (entityType === 'Material') {
      if (!materialNameAr.trim()) {
        showToast(isAr ? 'يرجى إدخال اسم المادة' : 'Please provide material name', 'warning');
        return;
      }
      const created = addMaterial({
        nameAr: materialNameAr,
        nameEn: materialNameEn || materialNameAr,
        category: materialCategory,
        defaultSellingPrice: Number(defaultSellingPrice) || 45,
        defaultPurchasePrice: Number(defaultPurchasePrice) || 26,
        unit: materialUnit,
      });
      onSuccess(created.nameAr, created.id);
    }

    showToast(isAr ? 'تمت الإضافة السريعة بنجاح' : 'Entity added successfully', 'success');
    onClose();
  };

  const getHeaderInfo = () => {
    switch (entityType) {
      case 'Customer':
        return {
          title: isAr ? 'إضافة عميل جديد سريعاً' : 'Quick Add New Client',
          subtitle: isAr ? 'تسجيل عميل جديد في الدليل' : 'Register a new customer entity',
          icon: Building2,
        };
      case 'Crusher':
        return {
          title: isAr ? 'إضافة مورد مواد جديد' : 'Quick Add Material Supplier',
          subtitle: isAr ? 'تسجيل مورد مواد في النظام' : 'Register a new material supplier',
          icon: Database,
        };
      case 'Transporter':
        return {
          title: isAr ? 'إضافة مورد خدمة / شاحنة' : 'Quick Add Service Supplier / Truck',
          subtitle: isAr ? 'تسجيل مورد خدمة أو شاحنة جديدة' : 'Register a service supplier or truck',
          icon: Truck,
        };
      case 'Material':
        return {
          title: isAr ? 'إضافة صنف مادة جديد' : 'Quick Add Material Item',
          subtitle: isAr ? 'إدراج نوع ركام أو رمل وتسعيرته' : 'Add new aggregate or sand to catalog',
          icon: Package,
        };
    }
  };

  const { title, subtitle, icon: Icon } = getHeaderInfo();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-add-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 transition-colors animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-900/40">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h2 id="quick-add-title" className="text-base font-black text-slate-900 dark:text-white">{title}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form noValidate onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Customer Fields */}
          {entityType === 'Customer' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  {isAr ? 'اسم العميل / الشركة *' : 'Customer Name *'}
                </label>
                <input
                  type="text"
                  placeholder={isAr ? 'مثال: شركة اليمامة للخرسانة الجاهزة' : 'e.g. Al Yamamah ReadyMix'}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'الرقم الضريبي (15 رقم)' : 'VAT Number'}
                  </label>
                  <input
                    type="text"
                    placeholder={isAr ? '300189452300003' : '300189452300003'}
                    value={taxNumber}
                    onChange={(e) => setTaxNumber(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'رقم الهاتف' : 'Phone'}
                  </label>
                  <input
                    type="text"
                    placeholder={isAr ? '+966 50 123 4567' : '+966 50 123 4567'}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'الشخص المسؤول' : 'Contact Person'}
                  </label>
                  <input
                    type="text"
                    placeholder={isAr ? 'م. أحمد السالم' : 'Ahmed Al-Salem'}
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'العنوان' : 'Address'}
                  </label>
                  <input
                    type="text"
                    placeholder={isAr ? 'الرياض - حي الملز' : 'Riyadh - Malaz District'}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          {/* Crusher Fields */}
          {entityType === 'Crusher' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  {isAr ? 'اسم مورد المواد *' : 'Material Supplier Name *'}
                </label>
                <input
                  type="text"
                  placeholder={isAr ? 'مثال: مورد مواد خام الرياض الحديثة' : 'e.g. Riyadh Raw Materials Supplier'}
                  value={crusherName}
                  onChange={(e) => setCrusherName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  {isAr ? 'الموقع الجغرافي / الطريق' : 'Location'}
                </label>
                <input
                  type="text"
                  placeholder={isAr ? 'الرياض - طريق رماح - كم 25' : 'Riyadh, Rumah Road'}
                  value={crusherLocation}
                  onChange={(e) => setCrusherLocation(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  {isAr ? 'الحساب البنكي / الآيبان' : 'Bank IBAN'}
                </label>
                <input
                  type="text"
                  placeholder={isAr ? 'مصرف الراجحي - SA4280000123608010123456' : 'Al Rajhi Bank - SA4280000123608010123456'}
                  value={crusherBank}
                  onChange={(e) => setCrusherBank(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                />
              </div>
            </>
          )}

          {/* Transporter Fields */}
          {entityType === 'Transporter' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  {isAr ? 'اسم مزود الخدمة *' : 'Service Supplier Name *'}
                </label>
                <input
                  type="text"
                  placeholder={isAr ? 'مثال: مؤسسة قوافل نجد للنقليات' : 'e.g. Qawafel Najd Transport'}
                  value={transporterName}
                  onChange={(e) => setTransporterName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'رقم لوحة الشاحنة الافتراضية' : 'Truck Plate #'}
                  </label>
                  <input
                    type="text"
                    placeholder={isAr ? '4491-ق ط ب' : '4491-RSB'}
                    value={truckNo}
                    onChange={(e) => setTruckNo(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'اسم السائق' : 'Driver Name'}
                  </label>
                  <input
                    type="text"
                    placeholder={isAr ? 'محمد إقبال' : 'Driver Name'}
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'أجرة النقل (ر.س/MT طن)' : 'Rate / MT (SAR)'}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={ratePerTon}
                    onChange={(e) => setRatePerTon(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'رقم الهاتف' : 'Phone'}
                  </label>
                  <input
                    type="text"
                    placeholder={isAr ? '+966 50 111 2222' : '+966 50 111 2222'}
                    value={transporterPhone}
                    onChange={(e) => setTransporterPhone(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          {/* Material Fields */}
          {entityType === 'Material' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  {isAr ? 'اسم المادة (عربي) *' : 'Material Name (Arabic) *'}
                </label>
                <input
                  type="text"
                  placeholder={isAr ? 'مثال: حصى سن 1/2 مم' : 'Aggregate 1/2"'}
                  value={materialNameAr}
                  onChange={(e) => setMaterialNameAr(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? 'التصنيف' : 'Category'}
                  </label>
                  <select
                    value={materialCategory}
                    onChange={(e) => setMaterialCategory(e.target.value as any)}
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
                    value={materialUnit}
                    onChange={(e) => setMaterialUnit(e.target.value as UOMType)}
                    className="w-full rounded-xl border border-orange-300 bg-slate-50 px-3 py-2 text-xs font-bold text-orange-950 focus:border-orange-500 focus:bg-white focus:outline-none"
                  >
                    {SUPPORTED_UOMS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {isAr ? u.labelAr : u.labelEn}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? `سعر الشراء الافتراضي (ر.س/${materialUnit})` : `Buy Price (SAR/${materialUnit})`}
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={defaultPurchasePrice}
                    onChange={(e) => setDefaultPurchasePrice(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    {isAr ? `سعر البيع الافتراضي (ر.س/${materialUnit})` : `Sell Price (SAR/${materialUnit})`}
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={defaultSellingPrice}
                    onChange={(e) => setDefaultSellingPrice(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
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
              className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-orange-200 dark:shadow-none hover:bg-orange-700 transition-colors"
            >
              <CheckCircle className="h-4 w-4" />
              <span>{isAr ? 'حفظ واختيار فوري' : 'Save & Select'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
