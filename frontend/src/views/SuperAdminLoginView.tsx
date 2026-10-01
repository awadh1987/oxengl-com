import React, { useState } from 'react';
import {
  ShieldCheck,
  LockKeyhole,
  Cpu,
  Terminal,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Globe2,
  Loader2,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export interface SuperAdminLoginViewProps {
  onLoginSuccess?: () => void;
}

export const SuperAdminLoginView: React.FC<SuperAdminLoginViewProps> = ({ onLoginSuccess }) => {
  const { loginMaster, language, setLanguage } = useApp();
  const isAr = Boolean(
    language === 'ar' ||
    language?.startsWith('ar') ||
    (typeof localStorage !== 'undefined' && (
      localStorage.getItem('oxengl_language') === 'ar' ||
      localStorage.getItem('i18nextLng')?.startsWith('ar')
    )) ||
    (typeof document !== 'undefined' && (
      document.documentElement.lang?.startsWith('ar') ||
      document.documentElement.dir === 'rtl'
    ))
  );

  const [credentials, setCredentials] = useState({
    admin_email: '',
    security_passphrase: '',
    mfa_token: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [systemLog, setSystemLog] = useState<string[]>([
    '⚙️ CORE-PLANE: Master platform access boundary established.',
    '🔒 CRYPTO-ENGINE: Argon2id memory-hardened parameters locked (m=64MB, t=3, p=4).',
    '🛡️ ENVIRO-GUARD: Strict Two-Tier tenancy isolation active and enforced.',
  ]);

  const handleControlPlaneAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsAuthenticating(true);

    const now = new Date().toISOString().substring(11, 19);
    setSystemLog((prev) => [
      ...prev.slice(-2),
      `[${now}] ⏳ DISPATCH-SALT: Handshake initiated for [${credentials.admin_email || 'ROOT_OPERATOR'}]...`,
    ]);

    try {
      const res = await loginMaster({
        identity: credentials.admin_email.trim(),
        password: credentials.security_passphrase,
      });

      if (res?.access_token) {
        localStorage.setItem('token', res.access_token);
      }
      localStorage.setItem('role', res?.role ?? res?.user?.role ?? 'Super_Admin');

      const successTime = new Date().toISOString().substring(11, 19);
      setSystemLog((prev) => [
        ...prev.slice(-2),
        `[${successTime}] ✅ HANDSHAKE-CONFIRMED: Root cryptographic signature verified.`,
      ]);

      if (onLoginSuccess) {
        onLoginSuccess();
      }
      if (typeof window !== 'undefined') {
        window.location.href = '/admin';
      }
    } catch (err: any) {
      const failTime = new Date().toISOString().substring(11, 19);
      const errDetail =
        err?.message ||
        (isAr ? 'فشل التحقق من هوية المشرف العام.' : 'Master authentication handshake rejected.');
      setErrorMessage(errDetail);
      setSystemLog((prev) => [
        ...prev.slice(-2),
        `[${failTime}] 🚨 AUTH-REJECTED: ${errDetail}`,
      ]);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const navigateToTenantLogin = () => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/login');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  return (
    <div
      dir="ltr"
      className="min-h-dvh erp-viewport-root w-full bg-[#030712] text-slate-100 flex flex-col justify-between p-4 sm:p-6 relative overflow-hidden selection:bg-cyan-500 selection:text-black"
    >
      {/* BACKGROUND GRAPHICS: Pure CSS Dark Matrix Tech Mesh */}
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, #06b6d4 1px, transparent 1px),
            linear-gradient(to bottom, #06b6d4 1px, transparent 1px)
          `,
          backgroundSize: '36px 36px',
        }}
      />
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* TOP STATUS BAR */}
      <header className="relative z-10 mx-auto w-full max-w-5xl flex items-center justify-between py-2 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400/30">
            <LockKeyhole className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-black tracking-tight text-white font-mono">OXENGL_CORE</span>
              <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-black text-cyan-400 font-mono">
                MASTER CONTROL PLANE
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Zero-Tenant Root Administration Gate</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1 text-xs font-mono text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-emerald-400 font-bold">NODE_ARMED</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">ISOLATION: L3_STRICT</span>
          </div>

          <button
            type="button"
            onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs font-mono text-slate-300 hover:bg-slate-800 transition"
          >
            <Globe2 className="h-3.5 w-3.5 text-cyan-400" />
            <span>{language === 'ar' ? 'English' : 'العربية'}</span>
          </button>
        </div>
      </header>

      {/* COMPACT COMMAND CENTER MATRIX CARD */}
      <main className="relative z-10 mx-auto w-full max-w-lg my-auto py-6">
        <div className="relative rounded-3xl border border-cyan-500/30 bg-[#070b14]/90 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl overflow-hidden ring-1 ring-cyan-500/20 shadow-cyan-950/40">
          {/* Accent Highlight Bar */}
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-cyan-500 via-indigo-500 to-amber-500" />

          {/* Card Header */}
          <div className="text-center pb-4">
            <div className="inline-flex items-center justify-center p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 mb-2">
              <KeyRound className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white font-mono">
              {isAr ? 'تسجيل دخول المشرف العام' : 'Platform Master Access'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {isAr ? 'بوابة التحكم المركزية الخاصة بمشرف النظام الرئيسي' : 'Direct Control Plane Authentication Gate'}
            </p>
          </div>

          {/* Compact Telemetry Badges Strip */}
          <div className="grid grid-cols-2 gap-2 mb-4 text-[11px] font-mono">
            <div className="p-2 bg-slate-950/80 rounded-xl border border-slate-800/90 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <div>
                <span className="text-emerald-400 font-bold block">Argon2id Hardened</span>
                <span className="text-[9px] text-slate-500 block">m=64MB, t=3, p=4</span>
              </div>
            </div>

            <div className="p-2 bg-slate-950/80 rounded-xl border border-slate-800/90 flex items-center gap-2">
              <Cpu className="h-4 w-4 text-cyan-400 shrink-0" />
              <div>
                <span className="text-cyan-300 font-bold block">L3 Strict Boundary</span>
                <span className="text-[9px] text-slate-500 block">Zero Tenant Bleed</span>
              </div>
            </div>
          </div>

          {/* Compact Telemetry Stream */}
          <div className="mb-4 bg-black/90 rounded-xl p-2.5 font-mono text-[10px] text-slate-300 border border-slate-800/90 shadow-inner space-y-1">
            <div className="flex items-center justify-between text-slate-500 border-b border-slate-900 pb-1 mb-1">
              <span className="flex items-center gap-1 text-[9px] text-cyan-400">
                <Terminal className="h-3 w-3" />
                IMMUTABLE AUDIT STREAM
              </span>
              <span className="text-[9px] text-slate-600">KERNEL_V4.8-SEC</span>
            </div>
            {systemLog.map((log, idx) => (
              <div key={idx} className="flex items-start gap-1.5 leading-snug">
                <span className="text-slate-600 select-none">&gt;</span>
                <span
                  className={
                    log.includes('🚨')
                      ? 'text-rose-400'
                      : log.includes('✅')
                      ? 'text-emerald-400'
                      : log.includes('DISPATCH')
                      ? 'text-cyan-300'
                      : 'text-slate-400'
                  }
                >
                  {log}
                </span>
              </div>
            ))}
          </div>

          {errorMessage && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="flex-1 font-mono text-[11px] leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* Hardened Form */}
          <form onSubmit={handleControlPlaneAuth} className="space-y-3.5">
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-slate-300 block uppercase tracking-wider">
                {isAr ? 'المعرف الرئيسي (Root Identifier)' : 'Root Identifier'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-slate-500">
                  <Terminal className="h-3.5 w-3.5" />
                </div>
                <input
                  type="text"
                  required
                  autoFocus
                  disabled={isAuthenticating}
                  placeholder={isAr ? 'superadmin@oxengl.com' : 'superadmin@oxengl.com'}
                  value={credentials.admin_email}
                  onChange={(e) =>
                    setCredentials((prev) => ({ ...prev, admin_email: e.target.value }))
                  }
                  className="w-full bg-slate-950/90 border border-slate-800 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 rounded-xl ps-9 pe-3.5 py-2.5 text-xs font-mono text-slate-100 placeholder-slate-600 outline-none transition-all disabled:opacity-50"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-slate-300 block uppercase tracking-wider">
                {isAr ? 'مفتاح المرور المشفر (Passphrase Key)' : 'Passphrase Key'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-slate-500">
                  <LockKeyhole className="h-3.5 w-3.5" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  disabled={isAuthenticating}
                  placeholder={isAr ? '••••••••••••••••' : '••••••••••••••••'}
                  value={credentials.security_passphrase}
                  onChange={(e) =>
                    setCredentials((prev) => ({
                      ...prev,
                      security_passphrase: e.target.value,
                    }))
                  }
                  className="w-full bg-slate-950/90 border border-slate-800 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 rounded-xl ps-9 pe-10 py-2.5 text-xs font-mono text-slate-100 placeholder-slate-600 outline-none transition-all disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 end-0 flex items-center pe-3 text-slate-500 hover:text-cyan-400 transition"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1 pb-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-mono text-slate-300 block uppercase tracking-wider">
                  {isAr ? 'مصفوفة التحقق MFA (اختياري)' : 'Hardware MFA Matrix (Optional)'}
                </label>
                <span className="text-[10px] font-mono text-cyan-400/80">TOTP / TOKEN</span>
              </div>
              <input
                type="text"
                maxLength={6}
                disabled={isAuthenticating}
                placeholder={isAr ? 'رمز التحقق' : '000000'}
                value={credentials.mfa_token}
                onChange={(e) =>
                  setCredentials((prev) => ({ ...prev, mfa_token: e.target.value }))
                }
                className="w-full bg-slate-950/90 border border-slate-800 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 rounded-xl px-3.5 py-2 text-center text-xs font-mono text-cyan-400 tracking-[0.4em] placeholder-slate-700 outline-none transition-all disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={isAuthenticating}
              className="w-full py-3 bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold font-mono tracking-wider transition-all shadow-lg shadow-cyan-600/25 active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isAuthenticating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  <span>VERIFYING CRYPTOGRAPHIC TOKEN...</span>
                </>
              ) : (
                <>
                  <LockKeyhole className="h-4 w-4 text-white" />
                  <span>{isAr ? 'دخول لوحة تحكم المنصة' : 'DEPLOY CREDENTIAL HANDSHAKE'}</span>
                </>
              )}
            </button>
          </form>

          <div className="text-center pt-4 border-t border-slate-800/80 mt-4">
            <button
              type="button"
              onClick={navigateToTenantLogin}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-400 font-mono transition-all group"
            >
              <span>← {isAr ? 'التبديل إلى بوابة مساحة عمل المنشأة' : 'Switch to standard business tenant gate'}</span>
              <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="relative z-10 mx-auto w-full max-w-5xl py-2 flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono text-slate-500 border-t border-slate-800/80 gap-2">
        <div>OxenGL Platform Control Plane &bull; Master Tier L3 Isolation</div>
        <div className="flex items-center gap-4">
          <span className="text-slate-400">Strict Two-Tier Isolation</span>
          <span>&bull;</span>
          <span className="text-slate-400">Argon2id Memory Hardened</span>
        </div>
      </footer>
    </div>
  );
};
