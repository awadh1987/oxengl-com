import React, { useState, useEffect } from 'react';
import {
  Building2,
  Webhook,
  Key,
  ShieldCheck,
  Globe,
  Save,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Copy,
  RefreshCw,
  Database,
  Server,
  ArrowRightLeft,
  ExternalLink,
  CloudUpload,
  MessageSquareText,
} from 'lucide-react';
import { CustomDomainWizard } from './CustomDomainWizard';
import { BackupDestinationsTab } from './BackupDestinationsTab';
import { CommunicationsTab } from './CommunicationsTab';
import { erpApi } from '../../services/api';
import { useTranslation } from 'react-i18next';

interface TenantSettingsPanelProps {
  tenantId: string;
  tenantSlug: string;
}

export const TenantSettingsPanel: React.FC<TenantSettingsPanelProps> = ({ tenantId, tenantSlug }) => {
  const { i18n } = useTranslation();
  const isAr = i18n?.language === 'ar' || i18n?.language?.startsWith('ar');

  const [activeTab, setActiveTab] = useState<'general' | 'domains' | 'database' | 'webhooks' | 'api_keys' | 'sso' | 'backups' | 'communications'>('general');
  const [settings, setSettings] = useState<any>(null);
  const [domainsList, setDomainsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  // Database & In-App Migration (Phase 1)
  const [dbConfig, setDbConfig] = useState<any>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbActionLoading, setDbActionLoading] = useState(false);
  const [dbTestResult, setDbTestResult] = useState<{ success: boolean; message: string; host?: string } | null>(null);
  const [migrationStatus, setMigrationStatus] = useState<any>(null);
  const [targetDbForm, setTargetDbForm] = useState({
    host: '',
    port: '5432',
    database_name: '',
    username: '',
    password: '',
    ssl_mode: 'prefer',
  });
  const [showDbPassword, setShowDbPassword] = useState(false);
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);

  useEffect(() => {
    loadSettings();
    loadDomains();
  }, [tenantId]);

  const loadDomains = async () => {
    try {
      const data = await erpApi.getTenantControlDomains(tenantId);
      if (data?.success && data.domains) {
        setDomainsList(data.domains);
      }
    } catch (err) {
      console.warn('Failed to load domains in settings panel:', err);
    }
  };

  const loadSettings = async () => {
    try {
      const data = await erpApi.getTenantControlSettings(tenantId);
      if (data?.success) {
        setSettings(data.settings);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSection = async (sectionKey: string, payload: any) => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const data = await erpApi.updateTenantControlSettings(
        { section: sectionKey, settings: payload, general: sectionKey === 'general' ? payload : undefined },
        tenantId
      );
      if (data?.success) {
        setSettings(data.settings || { ...settings, [sectionKey]: payload });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const loadDatabaseConfig = async () => {
    setDbLoading(true);
    try {
      const config = await erpApi.getTenantDatabaseConfig(tenantId);
      if (config) setDbConfig(config);
      try {
        const mig = await erpApi.getTenantDatabaseMigrationStatus(undefined, tenantId);
        if (mig) setMigrationStatus(mig);
      } catch (_) {}
    } catch (err) {
      console.warn('Error loading database configuration:', err);
    } finally {
      setDbLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'database') {
      loadDatabaseConfig();
    }
  }, [activeTab, tenantId]);

  // Polling for live migration progress
  useEffect(() => {
    let interval: any = null;
    if (migrationStatus && (migrationStatus.status === 'PENDING' || migrationStatus.status === 'RUNNING')) {
      interval = setInterval(async () => {
        try {
          const updated = await erpApi.getTenantDatabaseMigrationStatus(migrationStatus.id, tenantId);
          if (updated) {
            setMigrationStatus(updated);
            if (updated.status === 'COMPLETED' || updated.status === 'FAILED') {
              loadDatabaseConfig();
              clearInterval(interval);
            }
          }
        } catch (_) {}
      }, 2500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [migrationStatus?.status, migrationStatus?.id, tenantId]);

  const handleTestDatabaseConnection = async () => {
    setDbActionLoading(true);
    setDbTestResult(null);
    try {
      const parsedPort = parseInt(String(targetDbForm.port).trim(), 10);
      const res = await erpApi.testTenantDatabaseConnection({
        host: targetDbForm.host.trim(),
        port: !isNaN(parsedPort) && parsedPort > 0 ? parsedPort : 5432,
        database_name: targetDbForm.database_name.trim(),
        username: targetDbForm.username.trim(),
        password: targetDbForm.password,
        ssl_mode: targetDbForm.ssl_mode,
      }, tenantId);
      setDbTestResult(res);
    } catch (err: any) {
      setDbTestResult({ success: false, message: err?.message || 'Connection test failed.' });
    } finally {
      setDbActionLoading(false);
    }
  };

  const handleTriggerMigration = async () => {
    if (!targetDbForm.host || !targetDbForm.database_name || !targetDbForm.username) {
      alert('الرجاء إدخال بيانات الاتصال بقاعدة البيانات كاملة.');
      return;
    }
    setDbActionLoading(true);
    try {
      const parsedPort = parseInt(String(targetDbForm.port).trim(), 10);
      const res = await erpApi.triggerTenantDatabaseMigration({
        host: targetDbForm.host.trim(),
        port: !isNaN(parsedPort) && parsedPort > 0 ? parsedPort : 5432,
        database_name: targetDbForm.database_name.trim(),
        username: targetDbForm.username.trim(),
        password: targetDbForm.password,
        ssl_mode: targetDbForm.ssl_mode,
      }, tenantId);
      if (res?.migration_id) {
        setMigrationStatus({
          id: res.migration_id,
          status: 'PENDING',
          progress_pct: 0,
          current_step: 'Migration queued. Contacting worker...',
          records_transferred: 0,
          target_host: res.target_host,
          target_database: res.target_database,
        });
      }
    } catch (err: any) {
      alert(err?.message || 'فشل في بدء عملية الترحيل.');
    } finally {
      setDbActionLoading(false);
    }
  };

  const handleRevertToShared = async () => {
    setDbActionLoading(true);
    try {
      await erpApi.revertTenantToSharedDatabase(tenantId);
      setRevertConfirmOpen(false);
      await loadDatabaseConfig();
    } catch (err: any) {
      alert(err?.message || 'فشل الرجوع لقاعدة البيانات المشتركة.');
    } finally {
      setDbActionLoading(false);
    }
  };

  if (loading) {

    return <div className="p-8 text-center text-slate-500 font-mono">جاري تحميل إعدادات المنشأة...</div>;
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-100 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-5 mb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-indigo-400" />
            <span>لوحة تحكم مساحة عمل المنشأة (Tenant Control Panel)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            إعدادات الهوية، النطاقات المخصصة، واجهات البرمجة (Webhooks / API Keys)، والربط المؤسسي.
          </p>
        </div>

        {saveSuccess && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-semibold animate-in fade-in">
            <CheckCircle2 className="w-4 h-4" />
            <span>تم حفظ التغييرات بنجاح</span>
          </div>
        )}
      </div>

      {/* Progressive Disclosure Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 md:gap-2 border-b border-slate-800 pb-3 mb-6 text-xs font-medium">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap shrink-0 ${activeTab === 'general' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <Building2 className="w-4 h-4 shrink-0" />
          <span>المعلومات الأساسية</span>
        </button>

        <button
          onClick={() => setActiveTab('domains')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap shrink-0 ${activeTab === 'domains' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <Globe className="w-4 h-4 shrink-0" />
          <span>النطاقات المخصصة (Domains)</span>
        </button>

        <button
          onClick={() => setActiveTab('database')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap shrink-0 ${activeTab === 'database' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <Database className="w-4 h-4 shrink-0" />
          <span>قاعدة البيانات والترحيل (External DB)</span>
        </button>

        <button
          onClick={() => setActiveTab('webhooks')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap shrink-0 ${activeTab === 'webhooks' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <Webhook className="w-4 h-4 shrink-0" />
          <span>الخطافات البرمجية (Webhooks)</span>
        </button>

        <button
          onClick={() => setActiveTab('api_keys')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap shrink-0 ${activeTab === 'api_keys' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <Key className="w-4 h-4 shrink-0" />
          <span>مفاتيح الـ API</span>
        </button>

        <button
          onClick={() => setActiveTab('sso')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap shrink-0 ${activeTab === 'sso' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>الدخول الموحد (SSO / SAML)</span>
        </button>
        <button
          onClick={() => setActiveTab('communications')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap shrink-0 ${activeTab === 'communications' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <MessageSquareText className="w-4 h-4 shrink-0" />
          <span>{isAr ? 'الاتصالات' : 'Communications'}</span>
        </button>

        <button
          onClick={() => setActiveTab('backups')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap shrink-0 ${activeTab === 'backups' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <CloudUpload className="w-4 h-4 shrink-0" />
          <span>{isAr ? 'النسخ الاحتياطي والأرشفة (Data Backups & Archives)' : 'Data Backups & Archives'}</span>
        </button>
      </div>

      {/* 1. General Settings Tab */}
      {activeTab === 'general' && settings && (
        <div className="space-y-6 max-w-2xl animate-in fade-in duration-150">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">اسم المنشأة التجاري</label>
              <input
                type="text"
                value={settings.general?.company_name || ''}
                onChange={(e) => setSettings({ ...settings, general: { ...settings.general, company_name: e.target.value } })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">السجل التجاري (CR Number)</label>
              <input
                type="text"
                value={settings.general?.cr_number || ''}
                onChange={(e) => setSettings({ ...settings, general: { ...settings.general, cr_number: e.target.value } })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">الرقم الضريبي (VAT / ZATCA ID)</label>
              <input
                type="text"
                value={settings.general?.vat_number || ''}
                onChange={(e) => setSettings({ ...settings, general: { ...settings.general, vat_number: e.target.value } })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">العملة الافتراضية</label>
              <select
                value={settings.general?.currency || 'SAR'}
                onChange={(e) => setSettings({ ...settings, general: { ...settings.general, currency: e.target.value } })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="SAR">ريال سعودي (SAR)</option>
                <option value="USD">دولار أمريكي (USD)</option>
                <option value="YER">ريال يمني (YER)</option>
              </select>
            </div>
          </div>

          {/* Custom Domain Management Card */}
          <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>النطاق المخصص وهوية الدخول (Custom Domain & Corporate Portal)</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                      Zero-Slug SSL
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    الوصول المباشر للمنظومة عبر نطاقك الخاص مثل <code className="text-indigo-300 font-mono">myon-contrac.cloud</code> مع شهادات SSL مؤتمتة وتوجيه Zero-Slug.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('domains')}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 self-start sm:self-auto shrink-0 shadow-sm"
              >
                <span>إدارة النطاقات وSSL</span>
                <ArrowRightLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">النطاق السحابي الافتراضي</span>
                <div className="font-mono text-slate-200 font-semibold flex items-center justify-between">
                  <span>{tenantSlug}.oxengl.me</span>
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">افتراضي</span>
                </div>
              </div>

              <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">النطاق المخصص النشط</span>
                {domainsList.length > 0 ? (
                  <div className="flex items-center justify-between font-mono text-slate-200 font-semibold">
                    <span className="text-cyan-300">{domainsList[0].domain_name}</span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      <ShieldCheck className="w-3 h-3" />
                      {domainsList[0].ssl_status === 'active' ? 'SSL نشط ومشفر' : domainsList[0].ssl_status}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-slate-500">
                    <span>لم يتم ربط نطاق مخصص</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('domains')}
                      className="text-indigo-400 hover:text-indigo-300 text-[11px] underline"
                    >
                      + ربط الآن
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="text-[11px] text-slate-400 bg-slate-900/40 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-indigo-400" />
                سجل CNAME المطلوب: <code className="text-amber-300 font-mono">domains.oxengl.me</code>
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('domains')}
                className="text-xs text-indigo-400 hover:text-white font-semibold flex items-center gap-1"
              >
                <span>فحص وتفعيل الشهادات</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end pt-4 border-t border-slate-800">
            <button
              onClick={() => handleSaveSection('general', settings.general)}
              disabled={saving}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>حفظ الإعدادات الأساسية</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. Custom Domain Wizard Tab */}
      {activeTab === 'domains' && (
        <CustomDomainWizard tenantId={tenantId} tenantSlug={tenantSlug} />
      )}

      {/* 3b. Enterprise Database & In-App Migration Tab (Phase 1) */}
      {activeTab === 'database' && (
        <div className="space-y-6 max-w-4xl animate-in fade-in duration-150 text-xs">
          {/* Current Database Hosting Architecture Card */}
          <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl shadow-lg space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${dbConfig?.is_external_db ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'}`}>
                  {dbConfig?.is_external_db ? <Database className="w-5 h-5" /> : <Server className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex flex-wrap items-center gap-2">
                    <span>استضافة قاعدة البيانات الحالية (Database Architecture)</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase whitespace-nowrap shrink-0 ${dbConfig?.is_external_db ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>
                      {dbConfig?.storage_mode === 'DEDICATED_EXTERNAL' ? 'Dedicated External' : 'Shared PostgreSQL'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {dbConfig?.is_external_db
                      ? 'يتم تخزين بيانات هذه المنشأة في قاعدة بيانات PostgreSQL خاصة ومستقلة تماماً (Enterprise Isolated Database Engine).'
                      : 'يتم تخزين بيانات المنشأة ضمن الكتلة السحابية المشتركة مع عزل منطقي كامل عبر سياسات Row-Level Security (RLS).'}
                  </p>
                </div>
              </div>

              {dbConfig?.is_external_db && (
                <button
                  onClick={() => setRevertConfirmOpen(true)}
                  disabled={dbActionLoading}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-slate-800 hover:border-rose-500/30 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" />
                  <span>الرجوع للمستودع المشترك</span>
                </button>
              )}
            </div>

            {/* Revert confirmation modal inline */}
            {revertConfirmOpen && (
              <div className="p-4 bg-rose-950/20 border border-rose-500/30 rounded-xl space-y-3 animate-in fade-in">
                <div className="flex items-center gap-2 text-rose-400 font-semibold text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>تأكيد الرجوع إلى قاعدة البيانات المشتركة (Local Shared Engine)</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  هل أنت متأكد من رغبتك في تحويل مسار اتصالات المنشأة إلى قاعدة البيانات المحلية المشتركة؟ سيتم فك ارتباط المحرك الخارجي المخصص فوراً دون فقدان البيانات المخزنة.
                </p>
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => setRevertConfirmOpen(false)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={handleRevertToShared}
                    disabled={dbActionLoading}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs flex items-center gap-1.5"
                  >
                    {dbActionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                    <span>تأكيد التحويل الآن</span>
                  </button>
                </div>
              </div>
            )}

            {dbLoading ? (
              <div className="text-center py-4 text-slate-500 font-mono">جاري فحص حالة قاعدة البيانات...</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 pt-1">
                <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
                  <span className="text-[10px] text-slate-400 font-mono block uppercase">وضع التخزين (Storage Mode)</span>
                  <span className="font-bold text-white text-xs mt-1 block">
                    {dbConfig?.storage_mode || 'LOCAL_SHARED'}
                  </span>
                </div>
                <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
                  <span className="text-[10px] text-slate-400 font-mono block uppercase">اسم قاعدة البيانات (Catalog)</span>
                  <span className="font-bold text-white text-xs mt-1 block font-mono">
                    {dbConfig?.database_name || 'erp_db'}
                  </span>
                </div>
                <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
                  <span className="text-[10px] text-slate-400 font-mono block uppercase">مضيف الاتصال (Host Endpoint)</span>
                  <span className="font-bold text-cyan-300 text-xs mt-1 block font-mono truncate">
                    {dbConfig?.target_host || 'PostgreSQL Local Cluster'}
                  </span>
                </div>
                <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
                  <span className="text-[10px] text-slate-400 font-mono block uppercase">تشفير القناة (SSL Mode)</span>
                  <span className="font-bold text-emerald-400 text-xs mt-1 block font-mono">
                    {dbConfig?.ssl_mode || 'prefer'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Active / Recent Migration Progress Tracker Card */}
          {migrationStatus && (
            <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl shadow-lg space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="text-sm font-bold text-white">حالة ترحيل البيانات المباشر (Live Migration Tracker)</span>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  migrationStatus.status === 'COMPLETED'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : migrationStatus.status === 'FAILED'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                }`}>
                  {migrationStatus.status === 'RUNNING' && <RefreshCw className="w-3 h-3 animate-spin shrink-0" />}
                  {migrationStatus.status === 'COMPLETED' && <CheckCircle2 className="w-3 h-3 shrink-0" />}
                  {migrationStatus.status === 'FAILED' && <AlertCircle className="w-3 h-3 shrink-0" />}
                  <span>{migrationStatus.status}</span>
                </span>
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-mono text-slate-400">
                  <span>{migrationStatus.current_step || 'جاري معالجة المهام...'}</span>
                  <span className="font-bold text-white">{migrationStatus.progress_pct}%</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-800">
                  <div
                    className={`h-full transition-all duration-500 ${
                      migrationStatus.status === 'COMPLETED'
                        ? 'bg-emerald-500'
                        : migrationStatus.status === 'FAILED'
                        ? 'bg-rose-500'
                        : 'bg-gradient-to-r from-blue-500 to-cyan-500'
                    }`}
                    style={{ width: `${Math.max(5, migrationStatus.progress_pct)}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 font-mono">
                <div>
                  <span className="text-slate-500">السجلات المنقولة: </span>
                  <span className="text-white font-bold">{migrationStatus.records_transferred || 0}</span>
                </div>
                <div>
                  <span className="text-slate-500">الوجهة: </span>
                  <span className="text-cyan-400">{migrationStatus.target_host || 'External Host'}</span>
                </div>
              </div>

              {migrationStatus.error_message && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 font-mono text-xs">
                  ⚠️ خطأ في الترحيل: {migrationStatus.error_message}
                </div>
              )}
            </div>
          )}

          {/* In-App Live Migration Engine Card */}
          <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl shadow-lg space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>ترحيل البيانات المباشر إلى قاعدة بيانات خارجية (In-App Live Migration)</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                تتيح هذه الأداة نقل كامل بيانات وسجلات المنشأة تلقائياً من المستودع المشترك إلى خادم PostgreSQL خارجي مخصص بدون توقف للخدمة (Zero-Downtime Hot Cutover).
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-slate-400 font-semibold mb-1">عنوان خادم PostgreSQL (Host / IP)</label>
                  <input
                    type="text"
                    placeholder={isAr ? 'db.enterprise.sa أو 10.0.1.50' : 'db.enterprise.sa or 10.0.1.50'}
                    value={targetDbForm.host}
                    onChange={(e) => setTargetDbForm({ ...targetDbForm, host: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">المنفذ (Port)</label>
                  <input
                    type="number"
                    placeholder={isAr ? '5432' : '5432'}
                    value={targetDbForm.port}
                    onChange={(e) => setTargetDbForm({ ...targetDbForm, port: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">اسم قاعدة البيانات (Database Name)</label>
                  <input
                    type="text"
                    placeholder={isAr ? 'oxengl_tenant_db' : 'oxengl_tenant_db'}
                    value={targetDbForm.database_name}
                    onChange={(e) => setTargetDbForm({ ...targetDbForm, database_name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">نمط أمان التشفير (SSL Mode)</label>
                  <select
                    value={targetDbForm.ssl_mode}
                    onChange={(e) => setTargetDbForm({ ...targetDbForm, ssl_mode: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="prefer">prefer (محاولة التشفير مع السماح بالاتصال العادي)</option>
                    <option value="require">require (فرض تشفير TLS / SSL إلزامي)</option>
                    <option value="verify-full">verify-full (تحقق صارم من شهادة CA المعتمدة)</option>
                    <option value="disable">disable (تعطيل التشفير - غير موصى به)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">اسم المستخدم (Username)</label>
                  <input
                    type="text"
                    placeholder={isAr ? 'postgres أو db_user' : 'postgres or db_user'}
                    value={targetDbForm.username}
                    onChange={(e) => setTargetDbForm({ ...targetDbForm, username: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">كلمة المرور (Password)</label>
                  <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
                    <input
                      type={showDbPassword ? 'text' : 'password'}
                      placeholder={isAr ? '••••••••••••' : '••••••••••••'}
                      value={targetDbForm.password}
                      onChange={(e) => setTargetDbForm({ ...targetDbForm, password: e.target.value })}
                      className="flex-1 bg-transparent text-white font-mono focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDbPassword(!showDbPassword)}
                      className="text-slate-400 hover:text-white"
                    >
                      {showDbPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Feedback test message */}
              {dbTestResult && (
                <div className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-mono animate-in fade-in ${
                  dbTestResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                  {dbTestResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{dbTestResult.message}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleTestDatabaseConnection}
                  disabled={dbActionLoading || !targetDbForm.host}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-200 border border-slate-800 rounded-xl font-semibold flex items-center gap-2 transition-all cursor-pointer"
                >
                  {dbActionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 text-cyan-400" />}
                  <span>فحص الاتصال وشهادة SSL</span>
                </button>

                <button
                  type="button"
                  onClick={handleTriggerMigration}
                  disabled={dbActionLoading || migrationStatus?.status === 'RUNNING' || !targetDbForm.host}
                  className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-cyan-600/20 cursor-pointer"
                >
                  {dbActionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                  <span>بدء الترحيل المباشر (Launch Migration)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Webhooks Tab */}
      {activeTab === 'webhooks' && settings && (

        <div className="space-y-6 max-w-2xl animate-in fade-in duration-150">
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">تفعيل الخطافات البرمجية (Outgoing Webhooks)</span>
              <button
                onClick={() => setSettings({ ...settings, webhooks: { ...settings.webhooks, enabled: !settings.webhooks?.enabled } })}
                className={`w-11 h-6 rounded-full transition-colors relative ${settings.webhooks?.enabled ? 'bg-indigo-600' : 'bg-slate-800'}`}
              >
                <span className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${settings.webhooks?.enabled ? 'right-1' : 'left-1'}`} />
              </button>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Webhook Endpoint URL</label>
              <input
                type="url"
                placeholder={isAr ? 'https://api.yourcompany.com/webhooks/oxengl' : 'https://api.yourcompany.com/webhooks/oxengl'}
                value={settings.webhooks?.endpoint_url || ''}
                onChange={(e) => setSettings({ ...settings, webhooks: { ...settings.webhooks, endpoint_url: e.target.value } })}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Webhook Signing Secret</label>
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
                <input
                  type={showSecret ? 'text' : 'password'}
                  readOnly
                  value={settings.webhooks?.secret_key || 'whsec_7d9e8a2b3c4d5e6f7a8b9c0d1e2f3a4b'}
                  className="flex-1 bg-transparent text-amber-400 font-mono focus:outline-none"
                />
                <button onClick={() => setShowSecret(!showSecret)} className="text-slate-400 hover:text-white">
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end pt-2">
            <button
              onClick={() => handleSaveSection('webhooks', settings.webhooks)}
              disabled={saving}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>حفظ إعدادات Webhooks</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. API Keys Tab */}
      {activeTab === 'api_keys' && settings && (
        <div className="space-y-4 max-w-2xl animate-in fade-in duration-150">
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">مفتاح الوصول البرمجي النشط (Live API Key)</div>
                <div className="text-[11px] text-slate-500 font-mono">آخر استخدام: قبل 12 دقيقة</div>
              </div>
              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-mono uppercase">Active</span>
            </div>

            <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-3 rounded-lg font-mono text-xs text-indigo-300 select-all">
              <span>{settings.api_keys?.primary_key || 'oxen_live_sk_8f7b2c9a1d4e6f889201a'}</span>
              <button
                onClick={() => navigator.clipboard.writeText(settings.api_keys?.primary_key || '')}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                title="نسخ المفتاح"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">نطاق الصلاحيات (Scopes)</label>
              <div className="flex flex-wrap gap-2 font-mono text-[11px]">
                {['trips:read', 'trips:write', 'invoices:read', 'zatca:dispatch', 'fleet:telemetry'].map((scope) => (
                  <span key={scope} className="px-2 py-1 bg-slate-900 border border-slate-800 text-slate-300 rounded">
                    {scope}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. SSO / SAML Tab */}
      {activeTab === 'sso' && settings && (
        <div className="space-y-4 max-w-2xl animate-in fade-in duration-150">
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">فرض تسجيل الدخول الموحد (Enforce Corporate SSO)</span>
              <button
                onClick={() => setSettings({ ...settings, sso: { ...settings.sso, enforce_sso: !settings.sso?.enforce_sso } })}
                className={`w-11 h-6 rounded-full transition-colors relative ${settings.sso?.enforce_sso ? 'bg-indigo-600' : 'bg-slate-800'}`}
              >
                <span className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${settings.sso?.enforce_sso ? 'right-1' : 'left-1'}`} />
              </button>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">IdP Entity ID / Metadata URL</label>
              <input
                type="text"
                placeholder={isAr ? 'https://login.microsoftonline.com/{tenant-id}/...' : 'https://login.microsoftonline.com/{tenant-id}/federationmetadata/2007-06/federationmetadata.xml'}
                value={settings.sso?.idp_entity_id || ''}
                onChange={(e) => setSettings({ ...settings, sso: { ...settings.sso, idp_entity_id: e.target.value } })}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end pt-2">
            <button
              onClick={() => handleSaveSection('sso', settings.sso)}
              disabled={saving}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>حفظ إعدادات SSO</span>
            </button>
          </div>
        </div>
      )}

      {/* 7. Data Backups & Archives Tab */}
      {activeTab === 'backups' && <BackupDestinationsTab isAr={isAr} />}
      {activeTab === 'communications' && <CommunicationsTab isAr={isAr} />}

    </div>
  );
};
