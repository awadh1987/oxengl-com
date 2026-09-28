import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { redirectToTenantWorkspace } from '../utils/subdomain';
import { UserRole } from '../types';

import { BrandLogo } from '../components/BrandLogo';
import { PlatformLogo } from '../components/PlatformLogo';
import { LoginButton } from '../components/LoginButton';
import { NotificationTopBar } from '../components/NotificationTopBar';
import {
  Truck,
  ShieldCheck,
  Building2,
  FileCheck2,
  Lock,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Users,
  CheckCircle2,
  BarChart3,
  Scale,
  Award,
  Layers,
  ChevronRight,
  Phone,
  Mail,
  MapPin,
  Clock,
  UserPlus,
  LogIn,
  Search,
  ExternalLink,
  Globe2,
  Check,
  Server,
  Zap,
} from 'lucide-react';

interface LandingPageViewProps {
  onLoginSuccess?: () => void;
}

interface PublicTenant {
  id: string;
  name: string;
  slug: string;
  commercial_registration?: string;
  max_cost_centers?: number;
  subscription_tier?: string;
  logo_url?: string | null;
  status?: string;
  theme_color?: string;
  primary_color?: string;
  uiPrimaryColor?: string;
  ui_primary_color?: string;
  brandConfig?: {
    primaryColor?: string;
    secondaryColor?: string;
    [key: string]: any;
  };
}

export const LandingPageView: React.FC<LandingPageViewProps> = ({ onLoginSuccess }) => {
  const {
    users,
    setCurrentUser,
    language,
    setLanguage,
    brandConfig,
    logAuditAction,
    currentCompany,
    companies,
    setCurrentCompany,
  } = useApp();
  const isAr = language === 'ar';

  // Auth Modal State
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authTab, setAuthTab] = useState<'signin' | 'signup'>('signin');

  // Sign In Form State
  const [selectedRole, setSelectedRole] = useState<UserRole>('Admin');
  const [selectedUserId, setSelectedUserId] = useState<string>(users[0]?.id || 'usr-1');
  const [usernameInput, setUsernameInput] = useState('');

  // Sign Up Form State (Subject to Admin Approval)
  const [signupForm, setSignupForm] = useState({
    fullName: '',
    fullNameAr: '',
    username: '',
    email: '',
    phone: '',
    organization: '',
    requestedRole: 'Guest' as UserRole,
    notes: '',
  });
  const [signupSubmitted, setSignupSubmitted] = useState(false);

  // Dynamic Public Tenants Grid State
  const [publicTenants, setPublicTenants] = useState<PublicTenant[]>([]);
  const [isLoadingTenants, setIsLoadingTenants] = useState<boolean>(true);
  const [tenantFilter, setTenantFilter] = useState<string>('');
  const [tenantFetchError, setTenantFetchError] = useState<string | null>(null);

  // Fetch actively licensed tenants from public endpoint
  useEffect(() => {
    let isMounted = true;
    const fetchTenants = async () => {
      setIsLoadingTenants(true);
      setTenantFetchError(null);
      try {
        const res = await fetch('/api/public/tenants');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setPublicTenants(Array.isArray(data) ? data : []);
          }
        } else {
          // Graceful fallback to companies or public directory
          const fallbackRes = await fetch('/api/auth/tenants-public');
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            if (isMounted) {
              setPublicTenants(
                Array.isArray(fallbackData)
                  ? fallbackData.map((t: any) => ({
                      id: t.id,
                      name: t.name,
                      slug: t.slug,
                      commercial_registration: '1010' + (t.id || '').replace(/-/g, '').slice(0, 6),
                      max_cost_centers: 25,
                      subscription_tier: 'PROFESSIONAL',
                      logo_url: t.ui_logo_url || t.logo_url || null,
                      status: 'active',
                      theme_color: t.theme_color || t.primary_color || t.ui_primary_color || t.uiPrimaryColor || t.brandConfig?.primaryColor || '#F97316',
                      primary_color: t.primary_color || t.ui_primary_color || t.uiPrimaryColor || '#F97316',
                    }))
                  : []
              );
            }
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setTenantFetchError(err.message || 'Failed to load organization workspaces');
        }
      } finally {
        if (isMounted) {
          setIsLoadingTenants(false);
        }
      }
    };

    fetchTenants();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleQuickRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    const matchedUser = users.find((u) => u.role === role);
    if (matchedUser) {
      setSelectedUserId(matchedUser.id);
      setUsernameInput(matchedUser.username);
    }
  };

  const handleSignInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetUser = users.find((u) => u.id === selectedUserId) || users[0];
    if (targetUser) {
      setCurrentUser(targetUser);

      logAuditAction({
        userId: targetUser.id,
        userName: targetUser.fullNameAr || targetUser.fullName,
        userRole: targetUser.role,
        action: 'READ',
        entityType: 'User',
        entityId: targetUser.id,
        summary: `تسجيل دخول ناجح إلى النظام بصلاحية: (${targetUser.role})`,
      });

      setIsAuthModalOpen(false);
      onLoginSuccess?.();
    }
  };

  const handleSignUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupForm.fullName || !signupForm.username || !signupForm.email) return;

    const newReq = {
      id: `req-usr-${Date.now()}`,
      fullName: signupForm.fullName,
      fullNameAr: signupForm.fullNameAr || signupForm.fullName,
      username: signupForm.username.toLowerCase().trim(),
      email: signupForm.email,
      phone: signupForm.phone,
      requestedRole: signupForm.requestedRole,
      requestedAt: new Date().toISOString(),
      status: 'Pending' as const,
      notes: `${signupForm.organization ? `الجهة: ${signupForm.organization} | ` : ''}${signupForm.notes || 'طلب تسجيل حساب جديد عبر البوابة العامة'}`,
    };

    const current = JSON.parse(localStorage.getItem('oxengl_user_requests') || '[]');
    localStorage.setItem('oxengl_user_requests', JSON.stringify([newReq, ...current]));

    logAuditAction({
      userId: 'anonymous-visitor',
      userName: signupForm.fullNameAr || signupForm.fullName,
      userRole: signupForm.requestedRole,
      action: 'CREATE',
      entityType: 'User',
      entityId: newReq.id,
      summary: `تقديم طلب فتح حساب مستخدم جديد (${signupForm.fullName}) قيد مراجعة المدير التنفيذي`,
      newData: newReq,
    });

    setSignupSubmitted(true);
  };

  const openAuthModalWithTab = (tab: 'signin' | 'signup') => {
    setAuthTab(tab);
    setSignupSubmitted(false);
    setIsAuthModalOpen(true);
  };

  const handleLaunchWorkspace = (tenant: PublicTenant) => {
    localStorage.setItem('oxengl_tenant_slug', tenant.slug);
    localStorage.setItem('oxengl_tenant_id', tenant.id);
    localStorage.setItem('tenant_slug', tenant.slug);
    localStorage.setItem('tenant_id', tenant.id);
    const matchedComp = companies.find((c) => c.slug === tenant.slug || c.id === tenant.id);
    if (matchedComp) {
      setCurrentCompany(matchedComp);
    }

    const customDomain = (tenant as any)?.custom_domain || (tenant as any)?.domain || matchedComp?.custom_domain;
    redirectToTenantWorkspace({
      slug: tenant.slug,
      custom_domain: customDomain,
    }, '/operations/daily');
  };


  const filteredTenants = publicTenants.filter((tenant) => {
    if (!tenantFilter.trim()) return true;
    const q = tenantFilter.toLowerCase().trim();
    return (
      (tenant.name || '').toLowerCase().includes(q) ||
      (tenant.slug || '').toLowerCase().includes(q) ||
      (tenant.commercial_registration || '').toLowerCase().includes(q)
    );
  });

  return (
    <div
      id="oxengl-landing-page"
      dir={isAr ? 'rtl' : 'ltr'}
      className="min-h-dvh erp-viewport-root bg-[#111827] font-sans text-neutral-100 antialiased selection:bg-[#F97316] selection:text-white flex flex-col justify-between"
    >
      <NotificationTopBar />

      {/* 1. Public Top Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-gray-800 bg-[#111827]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <PlatformLogo size="md" />
            <div>
              <span className="text-sm font-black tracking-tight text-white sm:text-base">
                {brandConfig.companyNameAr || 'منظومة أوكسن السحابية'}
              </span>
              <p className="text-[10px] font-bold tracking-widest text-[#F97316] uppercase sm:text-xs">
                {brandConfig.companyNameEn || 'OXENGL ENTERPRISE CLOUD'}
              </p>
            </div>
          </div>

          {/* Center Links (Desktop) */}
          <nav className="hidden items-center gap-6 text-xs font-semibold text-neutral-300 md:flex">
            <a href="#workspaces" className="hover:text-[#F97316] transition-colors">
              {isAr ? 'مساحات العمل' : 'Workspaces'}
            </a>
            <a href="#services" className="hover:text-[#F97316] transition-colors">
              {isAr ? 'الخدمات والأسطول' : 'Fleet & Services'}
            </a>
            <a href="#zatca" className="hover:text-[#F97316] transition-colors">
              {isAr ? 'الامتثال و ZATCA' : 'ZATCA Compliance'}
            </a>
            <a href="#contact" className="hover:text-[#F97316] transition-colors">
              {isAr ? 'الموقع والتواصل' : 'Contact'}
            </a>
          </nav>

          {/* Actions: Language Toggle */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setLanguage(isAr ? 'en' : 'ar')}
              className="flex items-center gap-1.5 rounded-xl border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs font-bold text-neutral-300 hover:bg-gray-800 transition"
            >
              <Globe2 className="h-3.5 w-3.5 text-[#F97316]" />
              <span>{isAr ? 'English' : 'العربية'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. Hero Section: Two-Column Bold Typography & Interactive Mock ERP Widget */}
      <section className="relative overflow-hidden pt-12 pb-16 lg:pt-20 lg:pb-24">
        {/* Glow Effects & Backdrop */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-[700px] rounded-full bg-gradient-to-tr from-orange-600/15 via-amber-600/15 to-transparent blur-3xl -z-10 pointer-events-none" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
            {/* Left/Right Text Content */}
            <div className="space-y-6 text-center lg:col-span-7 lg:text-start">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-950/60 px-4 py-1.5 text-xs font-bold text-orange-300 backdrop-blur-sm">
                <Sparkles className="h-3.5 w-3.5 text-[#F97316]" />
                <span>
                  {isAr
                    ? brandConfig.homepageBadgeAr || 'منظومة النقل والكسارات المتقدمة • Advanced Fleet ERP'
                    : brandConfig.homepageBadgeEn || 'Advanced Fleet & Quarry Logistics ERP'}
                </span>
              </div>

              <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl lg:leading-[1.15]">
                {isAr ? (
                  brandConfig.homepageHeroTitleAr ? (
                    <span>{brandConfig.homepageHeroTitleAr}</span>
                  ) : (
                    <>
                      الريادة في أسطول النقل الثقيل{' '}
                      <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 bg-clip-text text-transparent">
                        وتوريدات الكسارات والمشاريع
                      </span>
                    </>
                  )
                ) : brandConfig.homepageHeroTitleEn ? (
                  <span>{brandConfig.homepageHeroTitleEn}</span>
                ) : (
                  <>
                    Pioneering Heavy Transport Fleet &{' '}
                    <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 bg-clip-text text-transparent">
                      Quarry Material Supply
                    </span>
                  </>
                )}
              </h1>

              <p className="max-w-2xl text-sm text-neutral-300 sm:text-base leading-relaxed">
                {isAr
                  ? brandConfig.homepageHeroSubtitleAr ||
                    'تدير المنظومة دورة لوجستية متكاملة تشمل توريد الركام والدفان والبحص، إدارة أسطول الشاحنات الثقيلة، حساب الفاقد بدقة موازين البسكول، وإصدار الفواتير الضريبية المعتمدة وفق اشتراطات هيئة الزكاة والضريبة والجمارك.'
                  : brandConfig.homepageHeroSubtitleEn ||
                    'OxenGL manages an end-to-end operational lifecycle for heavy haulage, quarry materials, weighbridge scale reconciliation, and ZATCA Phase-2 tax invoicing.'}
              </p>

              {/* CTAs */}
              <div className="flex flex-col items-center justify-center gap-3.5 sm:flex-row lg:justify-start pt-2">
                <a
                  href="/register"
                  onClick={(e) => {
                    e.preventDefault();
                    if (typeof window !== 'undefined') {
                      window.history.pushState({}, '', '/register');
                      window.dispatchEvent(new PopStateEvent('popstate'));
                    }
                  }}
                  className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-600 via-[#F97316] to-amber-600 px-7 py-3.5 text-sm font-black text-white shadow-xl shadow-orange-600/30 transition-all hover:scale-[1.02] hover:shadow-orange-600/50"
                >
                  <Building2 className="h-4 w-4" />
                  <span>{isAr ? 'تسجيل منشأة جديدة' : 'Register New Tenant'}</span>
                </a>

                <a
                  href="/login"
                  onClick={(e) => {
                    e.preventDefault();
                    if (typeof window !== 'undefined') {
                      window.history.pushState({}, '', '/login');
                      window.dispatchEvent(new PopStateEvent('popstate'));
                    }
                  }}
                  className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl border border-gray-700 bg-gray-900/90 px-7 py-3.5 text-sm font-bold text-neutral-200 hover:border-orange-500 hover:bg-gray-800 transition"
                >
                  <LogIn className="h-4 w-4 text-[#F97316]" />
                  <span>{isAr ? 'تسجيل الدخول للمنشأة' : 'Login to Existing Tenant'}</span>
                </a>
              </div>

              {/* Key Trust Badges */}
              <div className="grid grid-cols-2 gap-4 border-t border-gray-800/80 pt-6 sm:grid-cols-4">
                <div>
                  <div className="text-xl font-black text-white sm:text-2xl font-mono">
                    {brandConfig.homepageAnnualTonnage || '+500,000'}
                  </div>
                  <div className="text-[11px] text-neutral-400">{isAr ? 'طن توريدات سنوياً' : 'Annual Tonnage'}</div>
                </div>
                <div>
                  <div className="text-xl font-black text-[#F97316] sm:text-2xl font-mono">
                    {brandConfig.homepageFleetCount || '+120'}
                  </div>
                  <div className="text-[11px] text-neutral-400">{isAr ? 'شاحنة وتريلا بالأسطول' : 'Heavy Fleet Trucks'}</div>
                </div>
                <div>
                  <div className="text-xl font-black text-amber-400 sm:text-2xl font-mono">100%</div>
                  <div className="text-[11px] text-neutral-400">{isAr ? 'مطابقة ZATCA المرحلة 2' : 'ZATCA Compliant'}</div>
                </div>
                <div>
                  <div className="text-xl font-black text-emerald-400 sm:text-2xl font-mono">
                    {brandConfig.homepageCrushersCount || '+25'}
                  </div>
                  <div className="text-[11px] text-neutral-400">{isAr ? 'مورد مواد خام معتمد' : 'Raw Materials Suppliers'}</div>
                </div>
              </div>
            </div>

            {/* Right Interactive Mockup / Demo Account Preview Widget */}
            <div className="lg:col-span-5">
              <div className="relative overflow-hidden rounded-3xl border border-gray-800 bg-gray-900/90 p-6 shadow-2xl backdrop-blur-xl">
                {/* Header of Preview Box */}
                <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-rose-500" />
                    <span className="h-3 w-3 rounded-full bg-amber-500" />
                    <span className="h-3 w-3 rounded-full bg-emerald-500" />
                    <span className="text-[11px] font-mono text-neutral-400 ms-2">
                      workspace.oxengl.cloud
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-md bg-orange-950/80 px-2 py-0.5 text-[10px] font-bold text-orange-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{isAr ? 'نظام حي' : 'Live System'}</span>
                  </div>
                </div>

                {/* Simulated Dashboard UI */}
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-neutral-400">{isAr ? 'إجمالي المبيعات النشطة' : 'Active Revenue'}</span>
                      <span className="text-xs font-mono font-bold text-emerald-400">+18.4%</span>
                    </div>
                    <div className="mt-1 text-2xl font-black text-white font-mono">1,025,480.00 ر.س</div>
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-neutral-400">
                      <Scale className="h-3.5 w-3.5 text-[#F97316]" />
                      <span>{isAr ? 'تمت مطابقة 154 تذكرة ميزان بنجاح' : '154 Scale tickets reconciled'}</span>
                    </div>
                  </div>

                  {/* Fast 1-Click Role Login triggers */}
                  <div className="rounded-2xl border border-gray-800 bg-gray-950/80 p-4">
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-xs font-bold text-neutral-300">
                        {isAr ? 'حسابات التجربة والاعتماد الفوري:' : 'Instant Evaluation (Demo Roles):'}
                      </p>
                      <span className="text-[10px] font-mono text-[#F97316]">
                        {users.length} {isAr ? 'أدوار نشطة' : 'Active Roles'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {/* 1. Enterprise CEO */}
                      <button
                        type="button"
                        onClick={() => {
                          const user = users.find((u) => u.role === 'Admin') || users[0];
                          if (user) {
                            setCurrentUser(user);
                            onLoginSuccess?.();
                          }
                        }}
                        className="flex items-center justify-between rounded-xl border border-orange-500/40 bg-orange-950/40 p-2.5 text-start transition hover:bg-orange-900/60"
                      >
                        <div>
                          <div className="text-[11px] font-black text-orange-200">
                            {isAr ? 'الرئيس التنفيذي للمنظومة' : 'Enterprise CEO'}
                          </div>
                          <div className="text-[9px] text-orange-400">
                            {isAr ? 'المدير العام والتنفيذي • صلاحيات كاملة' : 'Executive CEO • Full Authority'}
                          </div>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                      </button>

                      {/* 2. Operations Director */}
                      <button
                        type="button"
                        onClick={() => {
                          const user = users.find((u) => u.role === 'COO' || (u.role as string) === 'Operations') || users[1] || users[0];
                          if (user) {
                            setCurrentUser(user);
                            onLoginSuccess?.();
                          }
                        }}
                        className="flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-950/40 p-2.5 text-start transition hover:bg-amber-900/60"
                      >
                        <div>
                          <div className="text-[11px] font-black text-amber-200">
                            {isAr ? 'مدير العمليات اللوجستية' : 'Operations Director'}
                          </div>
                          <div className="text-[9px] text-amber-400">
                            {isAr ? 'إدارة الأسطول والكسارات • اعتمادات' : 'Operations Director • Approvals'}
                          </div>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      </button>

                      {/* 3. Finance Director */}
                      <button
                        type="button"
                        onClick={() => {
                          const user = users.find((u) => (u.role as string) === 'Finance' || u.role === 'Accountant') || users[2] || users[0];
                          if (user) {
                            setCurrentUser(user);
                            onLoginSuccess?.();
                          }
                        }}
                        className="flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-2.5 text-start transition hover:bg-emerald-900/60"
                      >
                        <div>
                          <div className="text-[11px] font-black text-emerald-200">
                            {isAr ? 'المدير المالي التنفيذي' : 'Finance Director'}
                          </div>
                          <div className="text-[9px] text-emerald-400">
                            {isAr ? 'الرقابة المالية • التدقيق والفوترة' : 'Finance Director • Accounting'}
                          </div>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      </button>

                      {/* 4. Senior Accountant */}
                      <button
                        type="button"
                        onClick={() => {
                          const user = users.find((u) => u.role === 'Accountant') || users[3] || users[0];
                          if (user) {
                            setCurrentUser(user);
                            onLoginSuccess?.();
                          }
                        }}
                        className="flex items-center justify-between rounded-xl border border-teal-500/40 bg-teal-950/40 p-2.5 text-start transition hover:bg-teal-900/60"
                      >
                        <div>
                          <div className="text-[11px] font-black text-teal-200">
                            {isAr ? 'كبير المحاسبين' : 'Senior Accountant'}
                          </div>
                          <div className="text-[9px] text-teal-400">
                            {isAr ? 'محاسب مالي • كشوف حساب ومستحقات' : 'Senior Accountant • Ledgers & Payments'}
                          </div>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-teal-400 shrink-0" />
                      </button>

                      {/* 5. Data Entry Specialist */}
                      <button
                        type="button"
                        onClick={() => {
                          const user = users.find((u) => u.role === 'Data_Entry') || users[4] || users[0];
                          if (user) {
                            setCurrentUser(user);
                            onLoginSuccess?.();
                          }
                        }}
                        className="flex items-center justify-between rounded-xl border border-orange-500/40 bg-gray-900 p-2.5 text-start transition hover:bg-gray-800 sm:col-span-2"
                      >
                        <div>
                          <div className="text-[11px] font-black text-orange-200">
                            {isAr ? 'أخصائي إدخال البيانات وميزان البسكول' : 'Data Entry Specialist'}
                          </div>
                          <div className="text-[9px] text-orange-400">
                            {isAr ? 'إدخال العمليات اليومية • تذاكر الميزان والرحلات' : 'Data Entry Specialist • Daily Trips & Scale Tickets'}
                          </div>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. DYNAMIC TENANT GRID: Available Organization Workspaces Section */}
      <section id="workspaces" className="border-t border-gray-800 bg-[#0f172a]/70 py-16 lg:py-20 relative">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-950/40 px-3.5 py-1 text-xs font-bold text-orange-300 mb-2">
                <Building2 className="h-3.5 w-3.5 text-[#F97316]" />
                <span>{isAr ? 'مساحات عمل المؤسسات المرخصة' : 'Licensed Enterprise Workspaces'}</span>
              </div>
              <h2 className="text-2xl font-black text-white sm:text-3xl lg:text-4xl">
                {isAr ? 'مساحات عمل المنشآت المتاحة' : 'Available Organization Workspaces'}
              </h2>
              <p className="text-xs sm:text-sm text-neutral-400 mt-2 max-w-2xl">
                {isAr
                  ? 'اختر مساحة العمل الخاصة بمنشأتك للولوج المباشر إلى المنظومة ببيئة سحابية معزولة ومشفرة بالكامل.'
                  : 'Access your licensed corporate workspace directly with multi-tenant zero-knowledge data isolation.'}
              </p>
            </div>

            {/* Tenant Search Bar */}
            <div className="w-full md:w-80">
              <div className="relative">
                <Search className="absolute start-3 top-3 h-4 w-4 text-neutral-400" />
                <input
                  type="text"
                  value={tenantFilter}
                  onChange={(e) => setTenantFilter(e.target.value)}
                  placeholder={isAr ? 'بحث بالاسم، المعرف، أو السجل...' : 'Search workspace, slug, or CR...'}
                  className="w-full rounded-2xl border border-gray-700 bg-gray-900/90 py-2.5 ps-9 pe-4 text-xs font-medium text-white placeholder-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 transition"
                />
              </div>
            </div>
          </div>

          {/* Tenants Content State */}
          {isLoadingTenants ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((n) => (
                <div key={n} className="rounded-3xl border border-gray-800 bg-gray-900/50 p-6 animate-pulse">
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-10 w-10 rounded-2xl bg-gray-800" />
                    <div className="h-5 w-20 rounded-full bg-gray-800" />
                  </div>
                  <div className="h-5 w-3/4 bg-gray-800 rounded mb-2" />
                  <div className="h-3 w-1/2 bg-gray-800 rounded mb-6" />
                  <div className="h-10 w-full bg-gray-800 rounded-xl" />
                </div>
              ))}
            </div>
          ) : tenantFetchError && filteredTenants.length === 0 ? (
            <div className="rounded-3xl border border-rose-900/40 bg-rose-950/20 p-8 text-center max-w-md mx-auto">
              <p className="text-sm font-bold text-rose-300 mb-2">
                {isAr ? 'تعذر تحميل مساحات العمل' : 'Unable to load workspaces'}
              </p>
              <p className="text-xs text-rose-400/80 mb-4">{tenantFetchError}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-xl bg-gray-800 px-4 py-2 text-xs font-bold text-white hover:bg-gray-700 transition"
              >
                {isAr ? 'إعادة المحاولة' : 'Retry'}
              </button>
            </div>
          ) : filteredTenants.length === 0 ? (
            <div className="rounded-3xl border border-gray-800 bg-gray-900/50 p-12 text-center max-w-lg mx-auto">
              <Building2 className="h-12 w-12 text-neutral-500 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white mb-1">
                {isAr ? 'لا توجد مساحات عمل مطابقة' : 'No matching workspaces found'}
              </h3>
              <p className="text-xs text-neutral-400 mb-6">
                {isAr
                  ? 'لم يتم العثور على منشآت نشطة تطابق معايير البحث الحالية.'
                  : 'No active licensed organizations matched your search filter.'}
              </p>
              <button
                type="button"
                onClick={() => setTenantFilter('')}
                className="rounded-xl border border-orange-500/40 bg-orange-950/30 px-4 py-2 text-xs font-bold text-orange-300 hover:bg-orange-900/40 transition"
              >
                {isAr ? 'إلغاء التصفية' : 'Clear Filter'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTenants.map((tenant) => {
                const tierColor =
                  tenant.subscription_tier === 'ENTERPRISE'
                    ? 'border-purple-500/40 bg-purple-950/40 text-purple-300'
                    : tenant.subscription_tier === 'GROWTH'
                    ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                    : 'border-orange-500/40 bg-orange-950/40 text-orange-300';

                const tenantThemeColor =
                  tenant.theme_color ||
                  tenant.primary_color ||
                  tenant.brandConfig?.primaryColor ||
                  tenant.uiPrimaryColor ||
                  tenant.ui_primary_color ||
                  '#F97316';

                const tenantLogoUrl = tenant.logo_url || (tenant as any).ui_logo_url || (tenant as any).uiLogoUrl || null;

                return (
                  <div
                    key={tenant.id}
                    className="group relative rounded-3xl border border-gray-800 bg-gray-900/80 p-6 shadow-xl backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl flex flex-col justify-between"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = `${tenantThemeColor}99`;
                      e.currentTarget.style.boxShadow = `0 20px 25px -5px ${tenantThemeColor}20, 0 8px 10px -6px ${tenantThemeColor}20`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '';
                      e.currentTarget.style.boxShadow = '';
                    }}
                  >
                    {/* Top Accent Glow on hover */}
                    <div
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-300 rounded-3xl pointer-events-none"
                      style={{
                        background: `radial-gradient(circle at top right, ${tenantThemeColor}18, transparent 70%)`
                      }}
                    />

                    <div className="relative z-10">
                      {/* Top Row: Monogram / Logo & Badges */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          {tenantLogoUrl ? (
                            <img
                              src={tenantLogoUrl}
                              alt={tenant.name}
                              className="h-11 w-11 rounded-2xl object-cover border border-gray-700 bg-gray-800 p-0.5"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                                const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                                if (fallback) fallback.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <div
                            className={`h-11 w-11 items-center justify-center rounded-2xl text-white font-black text-sm shadow-md ${tenantLogoUrl ? 'hidden' : 'flex'}`}
                            style={{
                              background: `linear-gradient(135deg, ${tenantThemeColor}, #111827)`
                            }}
                          >
                            {(tenant.name || 'T').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span
                              className="text-[10px] font-mono font-bold tracking-wider uppercase"
                              style={{ color: tenantThemeColor }}
                            >
                              {tenant.slug}.oxengl.me
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                                {isAr ? 'مرخصة ونشطة' : 'Active License'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Subscription Tier Badge */}
                        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold font-mono uppercase ${tierColor}`}>
                          {tenant.subscription_tier || 'STANDARD'}
                        </span>
                      </div>

                      {/* Organization Name */}
                      <h3
                        className="text-base font-black text-white transition mb-3 line-clamp-1"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = tenantThemeColor;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '';
                        }}
                      >
                        {tenant.name}
                      </h3>

                      {/* Info Metadata Grid */}
                      <div
                        className="rounded-2xl border border-gray-800/80 bg-gray-950/60 p-3.5 space-y-2 mb-5 transition"
                        style={{
                          borderInlineStartWidth: '3px',
                          borderInlineStartColor: tenantThemeColor,
                          borderInlineStartStyle: 'solid',
                        }}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-neutral-400">{isAr ? 'السجل التجاري:' : 'CR Number:'}</span>
                          <span className="font-mono font-bold text-neutral-200">
                            {tenant.commercial_registration || '1010349281'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-neutral-400">{isAr ? 'مراكز التكلفة المتاحة:' : 'Cost Centers:'}</span>
                          <span className="font-mono font-bold" style={{ color: tenantThemeColor }}>
                            {tenant.max_cost_centers || 25} {isAr ? 'مركز' : 'Centers'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-800/60">
                          <span className="text-neutral-400">{isAr ? 'عزل البيانات:' : 'Data Isolation:'}</span>
                          <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                            Zero-Knowledge RLS
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Launch Button */}
                    <div className="relative z-10 pt-2 border-t border-gray-800/60">
                      <button
                        type="button"
                        onClick={() => handleLaunchWorkspace(tenant)}
                        style={{
                          backgroundColor: tenantThemeColor,
                          boxShadow: `0 4px 14px 0 ${tenantThemeColor}40`,
                        }}
                        className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs font-black text-white hover:brightness-110 active:scale-[0.99] transition shadow-md"
                      >
                        <span>{isAr ? 'تشغيل مساحة العمل' : 'Launch Workspace'}</span>
                        {isAr ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 4. Core Enterprise Capabilities Section */}
      <section id="services" className="border-t border-gray-800 bg-gray-900/40 py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-3 max-w-3xl mx-auto">
            <h2 className="text-2xl font-black text-white sm:text-3xl">
              {isAr ? 'ركائز المنظومة اللوجستية والتشغيلية' : 'Enterprise Logistics & Financial Capabilities'}
            </h2>
            <p className="text-xs sm:text-sm text-neutral-400">
              {isAr
                ? 'حلول متكاملة تضمن دقة الأوزان وسرعة الإمداد والشفافية المالية التامة بين موردي المواد الخام ومزودي الخدمات والعملاء.'
                : 'Engineered for high precision, automated scale reconciliations, and airtight financial tracking across supply chains.'}
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-3xl border border-gray-800 bg-gray-950/80 p-6 transition-all hover:border-orange-500/50">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-600/20 text-[#F97316]">
                <Truck className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-sm font-black text-white">
                {isAr ? 'أسطول النقل الثقيل والتريلات' : 'Heavy Transport Fleet'}
              </h3>
              <p className="mt-2 text-xs text-neutral-400 leading-relaxed">
                {isAr
                  ? 'أسطول تريلات وناقلات ثقيلة مجهزة لنقل الدفان، البحص، الصخور، والركام بجدولة زمنية دقيقة على مدار الساعة.'
                  : 'High-capacity heavy tippers delivering aggregate, road base, subbase, and sand to major infrastructure projects.'}
              </p>
            </div>

            <div className="rounded-3xl border border-gray-800 bg-gray-950/80 p-6 transition-all hover:border-amber-500/50">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-600/20 text-amber-400">
                <Building2 className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-sm font-black text-white">
                {isAr ? 'عقود توريد المواد الخام' : 'Raw Materials Supplier Network'}
              </h3>
              <p className="mt-2 text-xs text-neutral-400 leading-relaxed">
                {isAr
                  ? 'شراكات مع كبرى كسارات ومقالع المملكة مع نظام دائن ومدين آلي لتسوية الأرصدة وسندات الصرف.'
                  : 'Direct partnerships with leading Saudi quarries with automated credit/debit ledger tracking and payment vouchers.'}
              </p>
            </div>

            <div className="rounded-3xl border border-gray-800 bg-gray-950/80 p-6 transition-all hover:border-emerald-500/50">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600/20 text-emerald-400">
                <Scale className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-sm font-black text-white">
                {isAr ? 'رصد الفاقد وموازين البسكول' : 'Weighbridge & Loss Control'}
              </h3>
              <p className="mt-2 text-xs text-neutral-400 leading-relaxed">
                {isAr
                  ? 'حساب تلقائي للفارق بين الوزن المحمل والوزن الصافي المستلم لكل رحلة وتحديد نسب الهدر لكل مزود خدمة.'
                  : 'Real-time calculation of loaded vs net weight per trip to pinpoint transit wastage and optimize fleet efficiency.'}
              </p>
            </div>

            <div className="rounded-3xl border border-gray-800 bg-gray-950/80 p-6 transition-all hover:border-orange-500/50">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-600/20 text-orange-400">
                <FileCheck2 className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-sm font-black text-white">
                {isAr ? 'فواتير ضريبية معتمدة ZATCA' : 'ZATCA Tax Invoicing Engine'}
              </h3>
              <p className="mt-2 text-xs text-neutral-400 leading-relaxed">
                {isAr
                  ? 'إصدار الفواتير الضريبية برمز الاستجابة السريع المعتمد ودورة اعتمادات رقمية متقدمة وتوقيعات تنفيذية.'
                  : 'Official compliant tax invoice generator featuring Phase-2 QR code, multi-tier approval state-machine, and signed exports.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Vision 2030 & ZATCA Section */}
      <section id="zatca" className="py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-orange-900/30 bg-gradient-to-br from-gray-900/90 via-[#181f2c] to-[#111827] p-8 sm:p-12">
            <div className="space-y-4 max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-lg bg-orange-600/20 px-3 py-1 text-xs font-bold text-orange-300">
                <Award className="h-4 w-4 text-[#F97316]" />
                <span>{isAr ? 'متوافق مع مستهدفات رؤية المملكة 2030' : 'Aligned with Saudi Vision 2030'}</span>
              </div>
              <h2 className="text-2xl font-black text-white sm:text-3xl">
                {isAr
                  ? brandConfig.homepageAboutTitleAr || 'حوكمة تشغيلية وأمان مالي رقمي بمقاييس عالمية'
                  : brandConfig.homepageAboutTitleEn || 'Operational Governance & Digital Financial Security'}
              </h2>
              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                {isAr
                  ? brandConfig.homepageAboutDescriptionAr ||
                    'تلتزم المنظومة بأعلى معايير الرقابة والشفافية عبر نظام سجلات التدقيق الشامل (Audit Trail)، الحذف الآمن (Soft Delete)، والتوقيع الرقمي للمدير التنفيذي مع حماية خصوصية بيانات الشركاء.'
                  : brandConfig.homepageAboutDescriptionEn ||
                    'OxenGL enforces enterprise-grade audit logging, digital approvals, recoverability, and multi-tier role access.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Contact & Corporate Location Footer */}
      <footer id="contact" className="border-t border-gray-800 bg-[#0d131f] py-12 text-neutral-400">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <PlatformLogo size="sm" />
                <span className="text-sm font-black text-white">{brandConfig.companyNameAr || 'منظومة أوكسن السحابية'}</span>
              </div>
              <p className="text-xs text-neutral-400">
                {brandConfig.companyNameEn || 'OxenGL Enterprise Cloud'}
              </p>
              <p className="text-[11px] text-neutral-500">
                {isAr ? 'المملكة العربية السعودية - الرياض' : 'Riyadh, Kingdom of Saudi Arabia'}
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <h4 className="font-bold text-white uppercase text-[11px] tracking-wider">
                {isAr ? 'البيانات التجارية والضريبية' : 'Commercial Info'}
              </h4>
              <p>
                <span className="text-neutral-500">{isAr ? 'السجل التجاري:' : 'CR Number:'}</span>{' '}
                <strong className="font-mono text-neutral-300">{brandConfig.crNumber || '1010349281'}</strong>
              </p>
              <p>
                <span className="text-neutral-500">{isAr ? 'الرقم الضريبي:' : 'VAT Number:'}</span>{' '}
                <strong className="font-mono text-neutral-300">{brandConfig.taxNumber || '310184729000003'}</strong>
              </p>
              <p>
                <span className="text-neutral-500">{isAr ? 'الحساب البنكي:' : 'Bank Account:'}</span>{' '}
                <span className="text-neutral-300">{brandConfig.bankNameAr || 'مصرف الراجحي'}</span>
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <h4 className="font-bold text-white uppercase text-[11px] tracking-wider">
                {isAr ? 'التواصل المباشر' : 'Direct Contact'}
              </h4>
              <p className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-[#F97316]" />
                <span dir="ltr" className="font-mono text-neutral-300">{brandConfig.phone || '+966 50 123 4567'}</span>
              </p>
              <p className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-[#F97316]" />
                <span className="text-neutral-300">{brandConfig.email || 'contact@oxengl.me'}</span>
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-[#F97316]" />
                <span className="text-neutral-300">{brandConfig.addressAr || 'الرياض، المملكة العربية السعودية'}</span>
              </p>
            </div>
          </div>

          <div className="mt-10 border-t border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-500 gap-2">
            <p>
              © {new Date().getFullYear()} {brandConfig.companyNameAr || 'منظومة أوكسن السحابية'} ({brandConfig.companyNameEn || 'OxenGL Enterprise Cloud'}).{' '}
              {isAr ? 'جميع الحقوق محفوظة.' : 'All rights reserved.'}
            </p>
            <p className="font-mono text-[11px]">
              Zero-Knowledge Multi-Tenant Architecture • Enterprise Logistics
            </p>
          </div>
        </div>
      </footer>

      {/* 7. Integrated Authentication Modal (Sign In + Sign Up with Approval Queue) */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div
            id="auth-modal-dialog"
            className="w-full max-w-md overflow-hidden rounded-3xl border border-gray-800 bg-[#181f2c] shadow-2xl"
          >
            {/* Modal Header */}
            <div className="border-b border-gray-800 bg-[#111827] p-6 text-center">
              <div className="flex justify-center mb-3">
                <BrandLogo size="md" showText={false} forcePlatformLogo={true} />
              </div>
              <h3 className="text-base font-black text-white">
                {brandConfig.companyNameAr || 'منظومة أوكسن السحابية'}
              </h3>
              <p className="text-[10px] font-bold text-[#F97316] tracking-wider uppercase">
                {brandConfig.companyNameEn || 'OXENGL ENTERPRISE CLOUD'}
              </p>

              {/* Tabs: Sign In vs Sign Up */}
              <div className="mt-4 flex rounded-xl bg-gray-900 p-1 border border-gray-800">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('signin');
                    setSignupSubmitted(false);
                  }}
                  className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                    authTab === 'signin'
                      ? 'bg-[#F97316] text-white shadow-xs'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {isAr ? 'تسجيل الدخول (Sign In)' : 'Sign In'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('signup');
                    setSignupSubmitted(false);
                  }}
                  className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                    authTab === 'signup'
                      ? 'bg-[#F97316] text-white shadow-xs'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {isAr ? 'طلب حساب جديد (Sign Up)' : 'Request Account'}
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {authTab === 'signin' ? (
                /* --- Sign In Tab --- */
                <form onSubmit={handleSignInSubmit} className="space-y-4">
                  <div>
                    <label className="mb-2 block text-xs font-bold text-neutral-300">
                      {isAr ? 'الشركة / مساحة العمل' : 'Organization Workspace'}
                    </label>
                    <select
                      value={currentCompany?.id || ''}
                      onChange={(event) => {
                        const company = companies.find((item) => item.id === event.target.value);
                        if (company) setCurrentCompany(company);
                      }}
                      className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2.5 text-xs font-semibold text-neutral-100 outline-none focus:border-orange-500"
                    >
                      <option value="" disabled>{isAr ? 'اختر المؤسسة' : 'Select organization'}</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name} ({company.slug})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Google Sign-In */}
                  <div>
                    <LoginButton
                      variant="dark"
                      onSuccess={() => {
                        setIsAuthModalOpen(false);
                        onLoginSuccess?.();
                      }}
                    />
                    <div className="relative my-3 flex items-center justify-center">
                      <div className="w-full border-t border-gray-800" />
                      <span className="absolute bg-[#181f2c] px-2 text-[10px] font-semibold text-neutral-500 uppercase">
                        {isAr ? 'أو الدخول التجريبي المباشر' : 'or quick role access'}
                      </span>
                    </div>
                  </div>

                  {/* Quick Role Selection Pills */}
                  <div>
                    <label className="mb-2 block text-xs font-bold text-neutral-300">
                      {isAr ? 'اختر الدور والصلاحية المطلوبة للدخول:' : 'Select Access Role:'}
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { role: 'Owner' as UserRole, label: isAr ? 'مالك المنشأة Owner' : 'Tenant Owner' },
                        { role: 'Admin' as UserRole, label: isAr ? 'المدير العام CEO' : 'Admin / CEO' },
                        { role: 'COO' as UserRole, label: isAr ? 'مدير العمليات' : 'COO Exec' },
                        { role: 'Accountant' as UserRole, label: isAr ? 'المحاسب' : 'Accountant' },
                        { role: 'Data_Entry' as UserRole, label: isAr ? 'مدخل البيانات' : 'Data Entry' },
                        { role: 'Guest' as UserRole, label: isAr ? 'بوابة العميل' : 'Guest / Audit' },
                      ].map((item) => (
                        <button
                          key={item.role}
                          type="button"
                          onClick={() => handleQuickRoleSelect(item.role)}
                          className={`rounded-xl border p-2 text-center text-xs font-bold transition ${
                            selectedRole === item.role
                              ? 'border-orange-500 bg-orange-950/80 text-orange-300 ring-1 ring-orange-500'
                              : 'border-gray-800 bg-gray-900 text-neutral-400 hover:bg-gray-800 hover:text-neutral-200'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* User Profile Selector */}
                  <div>
                    <label className="mb-1 block text-xs font-bold text-neutral-300">
                      {isAr ? 'الحساب المعتمد:' : 'Select User Profile:'}
                    </label>
                    <select
                      value={selectedUserId}
                      onChange={(e) => {
                        setSelectedUserId(e.target.value);
                        const u = users.find((x) => x.id === e.target.value);
                        if (u) {
                          setSelectedRole(u.role);
                          setUsernameInput(u.username);
                        }
                      }}
                      className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-xs font-bold text-white focus:border-orange-500 focus:outline-none"
                    >
                      {users
                        .filter((u) => u.role === selectedRole || selectedRole === 'Admin')
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.fullNameAr || u.fullName} ({u.role})
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Password mock field */}
                  <div>
                    <label className="mb-1 block text-xs font-bold text-neutral-300">
                      {isAr ? 'كلمة المرور المشفرة:' : 'Password:'}
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        value="••••••••••••"
                        readOnly
                        className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-xs font-mono text-neutral-400 focus:outline-none"
                      />
                      <Lock className="absolute end-3 top-3 h-3.5 w-3.5 text-neutral-500" />
                    </div>
                    <span className="mt-1 block text-[10px] text-neutral-500">
                      {isAr ? 'الدخول السريع مفعل لأغراض التقييم والاعتماد' : 'Quick access enabled for system preview'}
                    </span>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAuthModalOpen(false)}
                      className="w-1/3 rounded-xl border border-gray-800 bg-gray-900 py-2.5 text-xs font-bold text-neutral-400 hover:bg-gray-800 transition"
                    >
                      {isAr ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                      type="submit"
                      className="w-2/3 rounded-xl bg-gradient-to-r from-orange-600 via-[#F97316] to-amber-600 py-2.5 text-xs font-black text-white hover:opacity-95 shadow-md shadow-orange-600/30 transition"
                    >
                      {isAr ? 'دخول فوري للنظام' : 'Enter System Now'}
                    </button>
                  </div>
                </form>
              ) : signupSubmitted ? (
                /* --- Sign Up Success / Pending Approval Banner --- */
                <div className="space-y-4 text-center py-4">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400">
                    <Clock className="h-7 w-7" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-white">
                      {isAr ? 'تم استلام طلبكم بنجاح!' : 'Request Submitted Successfully!'}
                    </h4>
                    <p className="mt-1.5 text-xs text-amber-300 font-semibold">
                      {isAr
                        ? 'طلبك الآن قيد مراجعة واعتماد المدير التنفيذي (Pending CEO Approval)'
                        : 'Your account request is queued for Executive CEO Approval.'}
                    </p>
                    <p className="mt-2 text-[11px] text-neutral-400 leading-relaxed">
                      {isAr
                        ? 'سيتم تفعيل حسابك وإشعارك فور مصادقة الإدارة التنفيذية على الصلاحيات المطلوبة.'
                        : 'You will receive access credentials once the Executive Admin verifies your organization.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsAuthModalOpen(false);
                      setSignupSubmitted(false);
                    }}
                    className="w-full rounded-xl bg-[#F97316] py-2.5 text-xs font-black text-white hover:bg-orange-600 transition"
                  >
                    {isAr ? 'إغلاق ومتابعة' : 'Close & Continue'}
                  </button>
                </div>
              ) : (
                /* --- Sign Up Form --- */
                <form onSubmit={handleSignUpSubmit} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-neutral-300">
                      {isAr ? 'الاسم الكامل (عربي/إنجليزي):' : 'Full Name:'}
                    </label>
                    <input
                      type="text"
                      required
                      value={signupForm.fullName}
                      onChange={(e) => setSignupForm({ ...signupForm, fullName: e.target.value })}
                      placeholder={isAr ? 'الاسم الثلاثي' : 'e.g. John Doe'}
                      className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-white focus:border-orange-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-neutral-300">
                        {isAr ? 'اسم المستخدم:' : 'Username:'}
                      </label>
                      <input
                        type="text"
                        required
                        value={signupForm.username}
                        onChange={(e) => setSignupForm({ ...signupForm, username: e.target.value })}
                        placeholder="username"
                        className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-white focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-neutral-300">
                        {isAr ? 'البريد الإلكتروني:' : 'Email:'}
                      </label>
                      <input
                        type="email"
                        required
                        value={signupForm.email}
                        onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
                        placeholder="user@domain.com"
                        className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-white focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-neutral-300">
                        {isAr ? 'رقم الجوال:' : 'Phone:'}
                      </label>
                      <input
                        type="tel"
                        value={signupForm.phone}
                        onChange={(e) => setSignupForm({ ...signupForm, phone: e.target.value })}
                        placeholder="+966 5X XXX XXXX"
                        className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-white focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-neutral-300">
                        {isAr ? 'الجهة / المنشأة:' : 'Organization:'}
                      </label>
                      <input
                        type="text"
                        value={signupForm.organization}
                        onChange={(e) => setSignupForm({ ...signupForm, organization: e.target.value })}
                        placeholder={isAr ? 'اسم المنشأة' : 'Company Name'}
                        className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-white focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-neutral-300">
                      {isAr ? 'الصلاحية المطلوبة:' : 'Requested Role:'}
                    </label>
                    <select
                      value={signupForm.requestedRole}
                      onChange={(e) => setSignupForm({ ...signupForm, requestedRole: e.target.value as UserRole })}
                      className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-xs font-bold text-white focus:border-orange-500 focus:outline-none"
                    >
                      <option value="Guest">{isAr ? 'مستعرض / جهة تدقيق (Guest)' : 'Guest / Audit'}</option>
                      <option value="Data_Entry">{isAr ? 'مدخل بيانات ميداني (Data Entry)' : 'Field Data Entry'}</option>
                      <option value="Accountant">{isAr ? 'محاسب مالي (Accountant)' : 'Accountant'}</option>
                      <option value="COO">{isAr ? 'مدير تشغيل (COO)' : 'COO Operations'}</option>
                    </select>
                  </div>

                  <div className="pt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAuthModalOpen(false)}
                      className="w-1/3 rounded-xl border border-gray-800 bg-gray-900 py-2.5 text-xs font-bold text-neutral-400 hover:bg-gray-800 transition"
                    >
                      {isAr ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                      type="submit"
                      className="w-2/3 rounded-xl bg-gradient-to-r from-orange-600 via-[#F97316] to-amber-600 py-2.5 text-xs font-black text-white hover:opacity-95 shadow-md shadow-orange-600/30 transition"
                    >
                      {isAr ? 'إرسال طلب الاعتماد' : 'Submit Application'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { LandingPageView as LandingPage, LandingPageView as UnifiedPortalView };
export default LandingPageView;
