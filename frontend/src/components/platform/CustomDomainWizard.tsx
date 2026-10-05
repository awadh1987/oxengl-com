import React, { useState, useEffect } from 'react';
import {
  Globe,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  ShieldCheck,
  ArrowRight,
  Server,
  Plus,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { erpApi } from '../../services/api';

interface DomainRecord {
  id: string;
  tenant_id: string;
  domain_name: string;
  verification_token: string;
  cname_target: string;
  is_verified: boolean;
  ssl_status: 'pending' | 'validating_dns' | 'issuing' | 'active' | 'failed';
  created_at: string;
}

interface CustomDomainWizardProps {
  tenantId: string;
  tenantSlug: string;
}

export const CustomDomainWizard: React.FC<CustomDomainWizardProps> = ({ tenantId, tenantSlug }) => {
  const { i18n } = useTranslation();
  const isAr = i18n?.language === 'ar' || i18n?.language?.startsWith('ar');

  const [domains, setDomains] = useState<DomainRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDomainInput, setNewDomainInput] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [activeDomain, setActiveDomain] = useState<DomainRecord | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyingDomainId, setVerifyingDomainId] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchDomains();
  }, [tenantId]);

  const fetchDomains = async () => {
    setLoading(true);
    try {
      const data = await erpApi.getTenantControlDomains(tenantId);
      if (data?.success && data.domains) {
        setDomains(data.domains);
      }
    } catch (err) {
      console.error('Failed to fetch domains', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleRegisterDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomainInput.trim()) return;
    setErrorMessage(null);
    setActionSuccess(null);

    let clean = newDomainInput.trim().toLowerCase();
    if (clean.includes('://')) clean = clean.split('://')[1];
    clean = clean.split('/')[0].split(':')[0].trim();

    try {
      const data = await erpApi.registerTenantControlDomain({ domain_name: clean }, tenantId);
      setActiveDomain(data.domain);
      setStep(2);
      fetchDomains();
    } catch (err: any) {
      setErrorMessage(err.message || 'خطأ في الاتصال بالخادم');
    }
  };

  const handleVerifyDNS = async (domainId: string) => {
    setVerifying(true);
    setVerifyingDomainId(domainId);
    setVerificationResult(null);
    setErrorMessage(null);
    setActionSuccess(null);

    try {
      const data = await erpApi.verifyTenantControlDomain(domainId, tenantId);
      setVerificationResult(data);
      if (data.success) {
        setStep(3);
        setActionSuccess(`تم فحص النطاق ${data.domain_name || domainId} بنجاح: حالة SSL هي ${data.ssl_status}`);
        fetchDomains();
      } else {
        setErrorMessage(data.error || data.detail || 'فشل التحقق من سجلات DNS وشهادة SSL');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'خطأ أثناء فحص سجلات DNS وشهادة SSL');
    } finally {
      setVerifying(false);
      setVerifyingDomainId(null);
    }
  };

  const handleDeleteDomain = async (domainId: string, domainName: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف وإلغاء ربط النطاق "${domainName}"؟ سيتم إلغاء التوجيه الفوري.`)) {
      return;
    }
    setErrorMessage(null);
    setActionSuccess(null);
    try {
      await erpApi.removeTenantControlDomain(domainId, tenantId);
      setActionSuccess(`تم إلغاء ربط النطاق ${domainName} بنجاح`);
      fetchDomains();
      if (activeDomain?.id === domainId || activeDomain?.domain_name === domainName) {
        setActiveDomain(null);
        setStep(1);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'خطأ أثناء حذف النطاق');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-100 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-5 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Globe className="w-6 h-6 text-indigo-400" />
            <h2 className="text-xl font-bold tracking-tight text-white">إدارة النطاقات المخصصة (Custom Domains)</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            اربط نطاقك التجاري المخصص (مثل: <code className="text-indigo-300 font-mono">erp.yourcompany.sa</code>) مع تفعيل شهادة SSL/TLS تلقائياً.
          </p>
        </div>
        <div className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded-full text-xs font-mono">
          Tenant: {tenantSlug}
        </div>
      </div>

      {actionSuccess && (
        <div className="mb-6 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-white text-xs px-2">✕</button>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white text-xs px-2">✕</button>
        </div>
      )}

      {/* Guided 3-Step Wizard Modal/Card */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 mb-8 relative overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step === 1 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>1</span>
            <span className="text-sm font-semibold text-slate-300">إدخال النطاق</span>
            <div className="w-8 h-[2px] bg-slate-800" />
            <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step === 2 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>2</span>
            <span className="text-sm font-semibold text-slate-300">إعداد سجلات DNS</span>
            <div className="w-8 h-[2px] bg-slate-800" />
            <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step === 3 ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>3</span>
            <span className="text-sm font-semibold text-slate-300">التحقق وتفعيل SSL</span>
          </div>

          {step > 1 && (
            <button
              onClick={() => {
                setStep(1);
                setActiveDomain(null);
                setVerificationResult(null);
                setErrorMessage(null);
              }}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              + إضافة نطاق آخر
            </button>
          )}
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Step 1: Input Domain */}
        {step === 1 && (
          <form onSubmit={handleRegisterDomain} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">النطاق المطلوب ربطه (FQDN)</label>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder={isAr ? 'مثال: portal.logistics.sa أو logistics.company.com' : 'e.g. portal.logistics.sa or logistics.company.com'}
                  value={newDomainInput}
                  onChange={(e) => setNewDomainInput(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  required
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-lg transition-all flex items-center gap-2"
                >
                  <span>متابعة الإعداد</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              يدعم نظام Multi-Tenant SaaS التوجيه التلقائي عبر CNAME على حافة Cloudflare و Edge Proxies مع عزل RLS كامل.
            </p>
          </form>
        )}

        {/* Step 2: One-Click Copy DNS Targets */}
        {step === 2 && activeDomain && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">سجلات DNS المطلوبة لدى مزود النطاق الخاص بك (Cloudflare, GoDaddy, Sahab, etc.)</div>

              <div className="space-y-3">
                {/* CNAME Record */}
                <div className="flex items-center justify-between bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded">CNAME Record</span>
                    <div className="text-xs text-slate-400">
                      Host: <span className="text-white font-mono">{activeDomain.domain_name}</span> &rarr; Target: <span className="text-indigo-400 font-mono">{activeDomain.cname_target}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopy(activeDomain.cname_target, 'cname')}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors flex items-center gap-1.5 text-xs"
                    title="نسخ الهدف"
                  >
                    {copiedField === 'cname' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedField === 'cname' ? 'تم النسخ' : 'نسخ Target'}</span>
                  </button>
                </div>

                {/* TXT Verification Record */}
                <div className="flex items-center justify-between bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">TXT Verification</span>
                    <div className="text-xs text-slate-400">
                      Host: <span className="text-white font-mono">_oxengl-challenge</span> &rarr; Value: <span className="text-amber-400 font-mono text-[11px]">{activeDomain.verification_token}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopy(activeDomain.verification_token, 'txt')}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors flex items-center gap-1.5 text-xs"
                    title="نسخ الرمز"
                  >
                    {copiedField === 'txt' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedField === 'txt' ? 'تم النسخ' : 'نسخ Token'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Server className="w-3.5 h-3.5 text-slate-500" />
                قد يستغرق انتشار سجلات DNS بضع دقائق حسب مزود الخدمة.
              </span>
              <button
                onClick={() => handleVerifyDNS(activeDomain.id)}
                disabled={verifying}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-medium text-sm rounded-lg transition-all flex items-center gap-2"
              >
                {verifying ? <RefreshCw className="w-4 h-4 animate-spin text-indigo-200" /> : <ShieldCheck className="w-4 h-4" />}
                <span>{verifying ? 'جاري فحص DNS وشهادة SSL...' : 'التحقق الآن وتفعيل النطاق'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Verification & SSL Activation Success */}
        {step === 3 && (
          <div className="space-y-4 text-center py-4 animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">تم التحقق وتفعيل النطاق بنجاح!</h3>
              <p className="text-xs text-slate-400 mt-1">
                تم إصدار شهادة Let's Encrypt TLS/SSL تلقائياً وتوجيه النطاق إلى مساحة عمل المنشأة.
              </p>
            </div>
            {verificationResult && (
              <div className="space-y-2">
                <div className="inline-flex flex-wrap items-center justify-center gap-3 bg-slate-900 border border-slate-800 px-4 py-2.5 rounded-lg text-xs font-mono text-slate-300">
                  <span>DNS: <strong className="text-white">{verificationResult.dns_check}</strong></span>
                  <span>•</span>
                  <span className="text-emerald-400">SSL: <strong>{verificationResult.ssl_status}</strong></span>
                  <span>•</span>
                  <span className="text-indigo-400">Router: <strong>{verificationResult.routing}</strong></span>
                  {verificationResult.certificate?.issuer && (
                    <>
                      <span>•</span>
                      <span className="text-amber-400">Issuer: <strong>{verificationResult.certificate.issuer}</strong></span>
                    </>
                  )}
                  {verificationResult.certificate?.days_remaining !== undefined && verificationResult.certificate?.days_remaining !== null && (
                    <>
                      <span>•</span>
                      <span className="text-sky-400">Validity: <strong>{verificationResult.certificate.days_remaining}d remaining</strong></span>
                    </>
                  )}
                </div>
              </div>
            )}
            <div className="pt-2">
              <button
                onClick={() => {
                  setStep(1);
                  setActiveDomain(null);
                }}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                العودة لقائمة النطاقات
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Domain Registry Table */}
      <div>
        <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
          <span>النطاقات المسجلة والنشطة</span>
          <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded-full text-xs">{domains.length}</span>
        </h3>

        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">جاري تحميل النطاقات...</div>
        ) : domains.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-sm">
            لم يتم تسجيل أي نطاق مخصص حتى الآن.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-4 py-3">النطاق (Domain)</th>
                  <th className="px-4 py-3">حالة التحقق (DNS)</th>
                  <th className="px-4 py-3">شهادة الأمان (SSL)</th>
                  <th className="px-4 py-3">هدف CNAME</th>
                  <th className="px-4 py-3 text-right">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                {domains.map((dom) => (
                  <tr key={dom.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-white flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                      <span>{dom.domain_name}</span>
                    </td>
                    <td className="px-4 py-3">
                      {dom.is_verified ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-medium text-[11px]">
                          <CheckCircle2 className="w-3 h-3" /> تم التحقق
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded font-medium text-[11px]">
                          <AlertCircle className="w-3 h-3" /> بانتظار DNS
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium text-[11px] ${dom.ssl_status === 'active' ? 'text-emerald-400 bg-emerald-500/10' : 'text-sky-400 bg-sky-500/10'}`}>
                        <ShieldCheck className="w-3 h-3" />
                        {dom.ssl_status === 'active' ? 'SSL نشط ومشفر' : dom.ssl_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400 text-[11px]">
                      {dom.cname_target}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <button
                          onClick={() => handleVerifyDNS(dom.id || dom.domain_name)}
                          disabled={verifying && verifyingDomainId === (dom.id || dom.domain_name)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-600/90 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded text-[11px] font-semibold transition-colors"
                          title="فحص سجلات DNS وطلب ترخيص SSL/ACME"
                        >
                          {verifying && verifyingDomainId === (dom.id || dom.domain_name) ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <ShieldCheck className="w-3 h-3 text-indigo-200" />
                          )}
                          <span>
                            {verifying && verifyingDomainId === (dom.id || dom.domain_name)
                              ? 'جاري الفحص...'
                              : 'فحص وتفعيل SSL'}
                          </span>
                        </button>
                        <button
                          onClick={() => handleDeleteDomain(dom.id || dom.domain_name, dom.domain_name)}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 rounded text-[11px] transition-colors"
                          title="إلغاء ربط النطاق المخصص"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>حذف</span>
                        </button>
                        <a
                          href={`https://${dom.domain_name}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-slate-400 hover:text-white px-2 py-1 transition-colors"
                          title="فتح الرابط"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
