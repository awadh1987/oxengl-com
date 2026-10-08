import React, { useState, useRef, useEffect } from 'react';
import {
  Palette,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Eye,
  Sliders,
  Trash2,
  Building2,
  ShieldCheck,
  Check,
  Layout,
  Maximize2,
  FileCheck,
  Globe,
  Sun,
  Moon,
  MousePointerClick,
} from 'lucide-react';
import { HoverIcon } from '../common/HoverIcon';
import { TenantAvatar } from '../TenantAvatar';
import { useApp } from '../../context/AppContext';
import { erpApi } from '../../services/api';

const PRIMARY_COLOR_PRESETS = [
  { nameAr: 'برتقالي أوكسن المميز', nameEn: 'Oxen Flame Orange', hex: '#F05627' },
  { nameAr: 'أزرق كحلي ملكي', nameEn: 'Royal Sapphire Blue', hex: '#2563EB' },
  { nameAr: 'أخضر زمردي مؤسسي', nameEn: 'Emerald Forest Green', hex: '#059669' },
  { nameAr: 'بنفسجي إنديجو عصري', nameEn: 'Indigo Violet', hex: '#6366F1' },
  { nameAr: 'أحمر قرمزي رسمي', nameEn: 'Crimson Corporate', hex: '#DC2626' },
  { nameAr: 'ذهبي عنبري فاخر', nameEn: 'Amber Gold', hex: '#D97706' },
  { nameAr: 'رمادي حجري فولاذي', nameEn: 'Graphite Slate', hex: '#475569' },
  { nameAr: 'سماوي تيتانيوم', nameEn: 'Cyan Titanium', hex: '#0891B2' },
];

const SIDEBAR_ACCENT_PRESETS = [
  { nameAr: 'أوكسن أسود كحلي عميق', nameEn: 'Oxen Midnight Navy', hex: '#090f1c' },
  { nameAr: 'أوبسيديان داكن خالص', nameEn: 'Obsidian Night', hex: '#0b0d19' },
  { nameAr: 'سليت رمادي أزرق', nameEn: 'Deep Slate', hex: '#0f172a' },
  { nameAr: 'فحم كربوني نقي', nameEn: 'Carbon Coal', hex: '#18181b' },
  { nameAr: 'بترولي داكن هادئ', nameEn: 'Dark Petrol', hex: '#04171d' },
];

export const TenantBrandingCustomizer: React.FC = () => {
  const { language, themeMode, currentCompany, brandConfig, updateBrandConfig, refreshCompanies, showToast } = useApp();
  const isAr = language === 'ar';
  const isDark = themeMode === 'dark';

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Branding states
  const [logoUrl, setLogoUrl] = useState<string>(
    brandConfig.customLogoUrl || currentCompany?.ui_logo_url || currentCompany?.uiLogoUrl || ''
  );
  const [logoScale, setLogoScale] = useState<number>(100);
  const [primaryColor, setPrimaryColor] = useState<string>(
    brandConfig.primaryColor || currentCompany?.ui_primary_color || '#F05627'
  );
  const [sidebarColor, setSidebarColor] = useState<string>(
    brandConfig.secondaryColor || currentCompany?.ui_secondary_color || '#090f1c'
  );
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [previewTab, setPreviewTab] = useState<'navbar' | 'letterhead' | 'hero' | 'landing'>('navbar');
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Phase 4: Tenant public landing page content
  const [heroTitle, setHeroTitle] = useState<string>('');
  const [heroSubtitle, setHeroSubtitle] = useState<string>('');
  const [ctaLabel, setCtaLabel] = useState<string>('');
  const [ctaUrl, setCtaUrl] = useState<string>('');
  const [landingThemeMode, setLandingThemeMode] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    if (!currentCompany?.id) return;
    let cancelled = false;
    erpApi
      .getTenantBranding(String(currentCompany.id))
      .then((dto) => {
        if (cancelled || !dto) return;
        setHeroTitle(dto.landing_hero_title || '');
        setHeroSubtitle(dto.landing_hero_subtitle || '');
        setCtaLabel(dto.landing_cta_label || '');
        setCtaUrl(dto.landing_cta_url || '');
        setLandingThemeMode(dto.landing_theme_mode === 'dark' ? 'dark' : 'light');
      })
      .catch(() => {
        /* landing content is optional; keep defaults */
      });
    return () => {
      cancelled = true;
    };
  }, [currentCompany?.id]);

  useEffect(() => {
    if (brandConfig.customLogoUrl || currentCompany?.ui_logo_url || currentCompany?.uiLogoUrl) {
      setLogoUrl(brandConfig.customLogoUrl || currentCompany?.ui_logo_url || currentCompany?.uiLogoUrl || '');
    }
    if (brandConfig.primaryColor || currentCompany?.ui_primary_color) {
      setPrimaryColor(brandConfig.primaryColor || currentCompany?.ui_primary_color || '#F05627');
    }
    if (brandConfig.secondaryColor || currentCompany?.ui_secondary_color) {
      setSidebarColor(brandConfig.secondaryColor || currentCompany?.ui_secondary_color || '#090f1c');
    }
  }, [brandConfig, currentCompany]);

  // Handle file reading
  const processLogoFile = async (file: File) => {
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      showToast(
        isAr ? 'نوع الملف غير مدعوم. يرجى اختيار ملف PNG أو SVG أو JPEG أو WEBP' : 'Unsupported file type. Please use PNG, SVG, JPEG, or WEBP',
        'error'
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast(
        isAr ? 'حجم الصورة كبير جداً. الحد الأقصى 5 ميجابايت' : 'File is too large. Maximum size is 5MB',
        'error'
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Data = e.target?.result as string;
      if (!base64Data) return;

      setLogoUrl(base64Data);

      // Try uploading to backend platform asset endpoint
      if (currentCompany?.id) {
        setIsUploading(true);
        try {
          const res = await erpApi.uploadPlatformAsset(
            {
              asset_type: 'platform_logo',
              file_buffer: base64Data,
              file_name: file.name,
              company_id: currentCompany.id,
              primary_color: primaryColor,
              secondary_color: sidebarColor,
            },
            currentCompany.id
          );
          if (res?.asset_url) {
            setLogoUrl(res.asset_url);
            showToast(
              isAr ? 'تم تحميل الشعار بنجاح وحفظه على الخادم' : 'Logo uploaded and hosted successfully',
              'success'
            );
          }
        } catch (err) {
          console.warn('Asset upload fallback to base64 buffer:', err);
          showToast(
            isAr ? 'تم استيراد الشعار محلياً' : 'Logo imported locally',
            'info'
          );
        } finally {
          setIsUploading(false);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void processLogoFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void processLogoFile(e.target.files[0]);
    }
  };

  const handleRemoveLogo = () => {
    setLogoUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    showToast(isAr ? 'تمت إزالة الشعار' : 'Logo removed', 'info');
  };

  const handleSaveBranding = async () => {
    if (!currentCompany?.id) {
      showToast(isAr ? 'لا توجد منشأة نشطة محددة' : 'No active company found', 'error');
      return;
    }

    setIsSaving(true);
    try {
      // 1. Update company branding on backend
      await erpApi.updateCompanyBranding(currentCompany.id, {
        ui_logo_url: logoUrl || null,
        ui_primary_color: primaryColor,
        ui_secondary_color: sidebarColor,
      });

      // 2. Update local AppContext brandConfig
      updateBrandConfig({
        customLogoUrl: logoUrl,
        primaryColor,
        secondaryColor: sidebarColor,
      });

      // 3. Refresh companies in context
      await refreshCompanies();

      // 4. Sync tenant_branding (drives the public tenant landing page on subdomain/custom domain)
      try {
        await erpApi.updateTenantBranding(currentCompany.id, {
          logo_url: logoUrl || undefined,
          primary_color: primaryColor,
          accent_color: sidebarColor,
          landing_hero_title: heroTitle.trim() || null,
          landing_hero_subtitle: heroSubtitle.trim() || null,
          landing_cta_label: ctaLabel.trim() || null,
          landing_cta_url: ctaUrl.trim() || null,
          landing_theme_mode: landingThemeMode,
        });
      } catch (landingErr) {
        console.warn('Tenant landing branding sync failed:', landingErr);
        showToast(
          isAr ? 'تم حفظ الهوية، لكن تعذر مزامنة صفحة الهبوط' : 'Branding saved, but landing page sync failed',
          'info'
        );
      }

      setLastSaved(new Date().toLocaleTimeString(isAr ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      showToast(
        isAr ? 'تم حفظ تخصيص هوية ومظهر المنشأة بنجاح' : 'Tenant branding & theme saved successfully',
        'success'
      );
    } catch (err: any) {
      console.error('Failed to save tenant branding:', err);
      showToast(
        err?.message || (isAr ? 'حدث خطأ أثناء حفظ التخصيص' : 'Failed to persist branding customization'),
        'error'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const companyDisplayName = isAr
    ? currentCompany?.name || brandConfig.companyName || 'منشأة أوكسن اللوجستية'
    : currentCompany?.name || brandConfig.companyNameEn || 'Oxen Logistics Platform';

  return (
    <div className={`rounded-2xl border p-5 sm:p-7 shadow-xl space-y-7 transition-all ${
      isDark ? 'bg-[#090f1c] border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
    }`}>
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800/60">
        <div className="flex items-start sm:items-center gap-3.5">
          <div
            className="p-3 rounded-xl shadow-md shrink-0 flex items-center justify-center"
            style={{ backgroundColor: `${primaryColor}20`, border: `1px solid ${primaryColor}50` }}
          >
            <Palette className="h-6 w-6" style={{ color: primaryColor }} />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold tracking-tight">
                {isAr ? 'تخصيص شعار ومظهر المنشأة' : 'Tenant Branding & Theme Customization'}
              </h2>
              <span className="text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
                {isAr ? 'الهوية البصرية والمظهر' : 'Visual Identity & UX'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              {isAr
                ? 'خصص الشعار الرسمي وألوان الواجهة الخاصة بمنشأتك لتظهر على شريط التنقل، الفواتير والسندات الرسمية، ولوحة القيادة.'
                : 'Upload corporate logos, define primary brand accents, and customize sidebar palettes rendered across your workspace and documents.'}
            </p>
          </div>
        </div>

        {/* Save and Status Actions */}
        <div className="flex items-center gap-3 self-end sm:self-center">
          {lastSaved && (
            <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{isAr ? `تم الحفظ: ${lastSaved}` : `Saved at ${lastSaved}`}</span>
            </span>
          )}
          <button
            type="button"
            onClick={handleSaveBranding}
            disabled={isSaving || isUploading}
            className="group flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs text-white shadow-lg transition-all cursor-pointer disabled:opacity-50 hover:brightness-110 active:scale-95"
            style={{
              backgroundColor: primaryColor,
              boxShadow: `0 8px 20px -4px ${primaryColor}40`,
            }}
          >
            <HoverIcon className="h-4 w-4">
              <RefreshCw className={`h-full w-full ${isSaving ? 'animate-spin' : ''}`} />
            </HoverIcon>
            <span>{isSaving ? (isAr ? 'جاري الحفظ...' : 'Saving Changes...') : (isAr ? 'حفظ التخصيص' : 'Save Changes')}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Logo Upload & Scaling (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Logo Upload Card */}
          <div className={`p-4 sm:p-5 rounded-xl border ${
            isDark ? 'bg-[#050914] border-slate-800/90' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-slate-200">
                <ImageIcon className="h-4 w-4 text-cyan-400" />
                <span>{isAr ? 'شعار المنشأة الرسمي' : 'Corporate Logo Asset'}</span>
              </label>
              {logoUrl && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 font-medium transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>{isAr ? 'حذف الشعار' : 'Remove Logo'}</span>
                </button>
              )}
            </div>

            {/* Drag & Drop Upload Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-6 sm:p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                isDragging
                  ? 'border-cyan-400 bg-cyan-950/20'
                  : isDark
                  ? 'border-slate-700/80 hover:border-slate-500 bg-slate-900/40 hover:bg-slate-900/80'
                  : 'border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-100/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.svg,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={handleFileInput}
              />

              {isUploading ? (
                <div className="flex flex-col items-center gap-2 py-4">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                  <span className="text-xs font-bold text-cyan-400">
                    {isAr ? 'جاري رفع الشعار ومعالجة الأبعاد...' : 'Uploading & optimizing brand asset...'}
                  </span>
                </div>
              ) : logoUrl ? (
                <div className="flex flex-col items-center gap-3 w-full">
                  <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-700 flex items-center justify-center max-w-[200px] h-[90px] overflow-hidden">
                    <img
                      src={logoUrl}
                      alt="Uploaded Logo"
                      style={{
                        transform: `scale(${logoScale / 100})`,
                        transition: 'transform 0.2s ease-in-out',
                      }}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{isAr ? 'تم استيراد الشعار بنجاح' : 'Logo Asset Active'}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {isAr ? 'اضغط أو اسحب صورة جديدة لاستبدال الشعار' : 'Click or drop a new image to replace'}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="p-3 rounded-full bg-slate-800 text-slate-400 group-hover:text-cyan-400 transition-colors">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div className="text-xs font-bold text-slate-300">
                    {isAr ? 'اسحب وأفلت الشعار هنا أو انقر للاستعراض' : 'Drag & drop corporate logo here, or browse'}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    PNG, SVG, JPEG, WEBP (Max 5MB)
                  </div>
                </div>
              )}
            </div>

            {/* Logo Scaling Slider */}
            {logoUrl && (
              <div className="mt-4 pt-3 border-t border-slate-800/70 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <Sliders className="h-3.5 w-3.5 text-cyan-400" />
                  <span>{isAr ? 'مقياس وتكبير الشعار:' : 'Logo Scaling:'}</span>
                  <span className="font-mono text-cyan-300">{logoScale}%</span>
                </div>
                <div className="flex items-center gap-3 w-48">
                  <input
                    type="range"
                    min="50"
                    max="150"
                    step="5"
                    value={logoScale}
                    onChange={(e) => setLogoScale(parseInt(e.target.value, 10))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => setLogoScale(100)}
                    className="text-[10px] text-slate-400 hover:text-white underline font-mono shrink-0"
                  >
                    100%
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Theme Accent Color Selection */}
          <div className={`p-4 sm:p-5 rounded-xl border space-y-4 ${
            isDark ? 'bg-[#050914] border-slate-800/90' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-slate-200">
                <Palette className="h-4 w-4 text-[#F05627]" />
                <span>{isAr ? 'لون السمة والتركيز الرئيسي (Primary Brand Color)' : 'Primary Theme Accent Color'}</span>
              </label>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-200">
                {primaryColor.toUpperCase()}
              </span>
            </div>

            {/* Preset Color Swatches */}
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {PRIMARY_COLOR_PRESETS.map((preset) => {
                const isSelected = primaryColor.toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => setPrimaryColor(preset.hex)}
                    title={isAr ? preset.nameAr : preset.nameEn}
                    className={`h-9 w-full rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
                      isSelected ? 'ring-2 ring-white scale-105 shadow-md' : 'hover:scale-105 opacity-90 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: preset.hex }}
                  >
                    {isSelected && <Check className="h-4 w-4 text-white drop-shadow-md" />}
                  </button>
                );
              })}
            </div>

            {/* Custom Color Input */}
            <div className="flex items-center gap-3 pt-2">
              <label className="text-xs text-slate-400 font-medium">
                {isAr ? 'أو اختر كود لون مخصص (HEX):' : 'Or pick custom brand HEX:'}
              </label>
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg p-1 px-2.5">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-6 w-6 rounded-md border-0 bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-20 text-xs font-mono bg-transparent text-slate-200 outline-none uppercase font-bold"
                />
              </div>
            </div>

            {/* Dark Sidebar Accent Selector */}
            <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-slate-300">
                  <Layout className="h-4 w-4 text-indigo-400" />
                  <span>{isAr ? 'لون القائمة الجانبية (Dark Sidebar Accent)' : 'Dark Sidebar Tone'}</span>
                </label>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-200">
                  {sidebarColor.toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {SIDEBAR_ACCENT_PRESETS.map((preset) => {
                  const isSelected = sidebarColor.toLowerCase() === preset.hex.toLowerCase();
                  return (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() => setSidebarColor(preset.hex)}
                      className={`p-2 rounded-lg border text-left flex items-center justify-between text-xs transition-all cursor-pointer ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-950/30 text-white font-bold'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="h-3.5 w-3.5 rounded-full border border-slate-600 shrink-0" style={{ backgroundColor: preset.hex }} />
                        <span className="truncate text-[11px]">{isAr ? preset.nameAr : preset.nameEn}</span>
                      </div>
                      {isSelected && <Check className="h-3 w-3 text-indigo-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Phase 4: Public Landing Page Content */}
          <div className={`p-4 sm:p-5 rounded-xl border space-y-4 ${
            isDark ? 'bg-[#050914] border-slate-800/90' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-slate-200">
                <Globe className="h-4 w-4 text-emerald-400" />
                <span>{isAr ? 'صفحة الهبوط العامة' : 'Public Landing Page'}</span>
              </label>
              <span className="text-[10px] font-mono text-slate-400 truncate">
                {currentCompany?.slug ? `${currentCompany.slug}.oxengl.me` : '*.oxengl.me'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {isAr
                ? 'يظهر هذا المحتوى للزوار على النطاق الفرعي أو النطاق المخصص لمنشأتك قبل تسجيل الدخول.'
                : 'Shown to visitors on your subdomain or mapped custom domain before they sign in.'}
            </p>

            <div className="space-y-1.5">
              <label htmlFor="landing-hero-title" className="text-[11px] font-semibold text-slate-300">
                {isAr ? 'عنوان البطل (Hero Title)' : 'Hero Title'}
              </label>
              <input
                id="landing-hero-title"
                type="text"
                maxLength={120}
                value={heroTitle}
                onChange={(e) => setHeroTitle(e.target.value)}
                placeholder={`Welcome to ${companyDisplayName}`}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-slate-500"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="landing-hero-subtitle" className="text-[11px] font-semibold text-slate-300">
                {isAr ? 'النص التعريفي' : 'Hero Subtitle'}
              </label>
              <textarea
                id="landing-hero-subtitle"
                rows={3}
                maxLength={400}
                value={heroSubtitle}
                onChange={(e) => setHeroSubtitle(e.target.value)}
                placeholder={isAr ? 'وصف مختصر لمنشأتك وخدماتها' : 'A short description of your company and services'}
                className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-slate-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="landing-cta-label" className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <MousePointerClick className="h-3.5 w-3.5" />
                  {isAr ? 'نص زر الإجراء' : 'Call-to-Action Label'}
                </label>
                <input
                  id="landing-cta-label"
                  type="text"
                  maxLength={40}
                  value={ctaLabel}
                  onChange={(e) => setCtaLabel(e.target.value)}
                  placeholder="Sign in to workspace"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-slate-500"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="landing-cta-url" className="text-[11px] font-semibold text-slate-300">
                  {isAr ? 'رابط الزر (اختياري)' : 'CTA Link (optional)'}
                </label>
                <input
                  id="landing-cta-url"
                  type="url"
                  value={ctaUrl}
                  onChange={(e) => setCtaUrl(e.target.value)}
                  placeholder="https://… or /login"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-mono text-slate-100 outline-none focus:border-slate-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-[11px] font-semibold text-slate-300">
                {isAr ? 'مظهر صفحة الهبوط' : 'Landing Appearance'}
              </span>
              <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-[11px]">
                {(['light', 'dark'] as const).map((mode) => (
                  <button
                    key={mode}
                    id={`landing-theme-${mode}`}
                    type="button"
                    onClick={() => setLandingThemeMode(mode)}
                    className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-colors ${
                      landingThemeMode === mode ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {mode === 'light' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                    <span>{mode === 'light' ? (isAr ? 'فاتح' : 'Light') : (isAr ? 'داكن' : 'Dark')}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Contextual Previews (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className={`p-4 sm:p-5 rounded-xl border h-full flex flex-col justify-between ${
            isDark ? 'bg-[#050914] border-slate-800/90' : 'bg-slate-50 border-slate-200'
          }`}>
            <div>
              {/* Preview Header & Tabs */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    {isAr ? 'معاينة الواجهة الحية' : 'Live UI Previews'}
                  </span>
                </div>
                <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setPreviewTab('navbar')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      previewTab === 'navbar' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {isAr ? 'الشريط العلوي' : 'Navbar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('letterhead')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      previewTab === 'letterhead' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {isAr ? 'الترويسة والوثائق' : 'Documents'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('hero')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      previewTab === 'hero' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {isAr ? 'العرض الكامل' : 'Full Emblem'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('landing')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      previewTab === 'landing' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {isAr ? 'صفحة الهبوط' : 'Landing'}
                  </button>
                </div>
              </div>

              {/* Live Preview Display Box */}
              <div className="mt-4">
                {previewTab === 'navbar' && (
                  <div className="space-y-3">
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {isAr
                        ? 'كيف يظهر شعارك ولون التمييز في شريط التنقل العلوي والقائمة الجانبية للمستخدمين:'
                        : 'How your logo and primary color render across the main application topbar and sidebar:'}
                    </p>

                    {/* Mock Browser Container */}
                    <div
                      className="rounded-xl border border-slate-800 overflow-hidden shadow-2xl"
                      style={{ backgroundColor: sidebarColor }}
                    >
                      {/* Mock Topbar */}
                      <div className="h-11 border-b border-slate-800/80 px-3 flex items-center justify-between bg-slate-950/60">
                        <div className="flex items-center gap-2.5">
                          <TenantAvatar
                            logoUrl={logoUrl}
                            name={companyDisplayName}
                            primaryColor={primaryColor}
                            size="sm"
                            showGlow={true}
                          />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-white truncate max-w-[130px]">
                              {companyDisplayName}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400">
                              {currentCompany?.slug || 'tenant-slug'}
                            </span>
                          </div>
                        </div>

                        {/* Mock Action Pill */}
                        <div
                          className="px-2.5 py-1 rounded-md text-[10px] font-bold text-white shadow-xs"
                          style={{ backgroundColor: primaryColor }}
                        >
                          {isAr ? 'العمليات اليومية' : 'Live Portal'}
                        </div>
                      </div>

                      {/* Mock Mini-Sidebar Body */}
                      <div className="p-3 grid grid-cols-12 gap-2 text-xs">
                        <div className="col-span-4 space-y-1.5 border-r border-slate-800/60 pr-2">
                          <div
                            className="p-1.5 rounded-lg text-[10px] font-bold text-white flex items-center gap-1.5"
                            style={{ backgroundColor: `${primaryColor}30`, borderLeft: `3px solid ${primaryColor}` }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: primaryColor }} />
                            <span>{isAr ? 'لوحة القيادة' : 'Dashboard'}</span>
                          </div>
                          <div className="p-1.5 rounded-lg text-[10px] text-slate-400 flex items-center gap-1.5 hover:text-white">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                            <span>{isAr ? 'دفتر الأستاذ' : 'Ledger'}</span>
                          </div>
                          <div className="p-1.5 rounded-lg text-[10px] text-slate-400 flex items-center gap-1.5 hover:text-white">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                            <span>{isAr ? 'المشتريات' : 'Procure'}</span>
                          </div>
                        </div>
                        <div className="col-span-8 p-2 rounded-lg bg-slate-900/40 border border-slate-800/40 flex flex-col justify-center items-center text-center">
                          <span className="text-[10px] text-slate-400">{isAr ? 'المحتوى الرئيسي للواجهة' : 'Active Workspace Node'}</span>
                          <span className="text-xs font-bold mt-1 text-slate-200">{companyDisplayName}</span>
                          <button
                            type="button"
                            className="mt-2 text-[10px] px-2 py-0.5 rounded-md font-bold text-white"
                            style={{ backgroundColor: primaryColor }}
                          >
                            {isAr ? 'زر الإجراء المخصص' : 'Action Button'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {previewTab === 'letterhead' && (
                  <div className="space-y-3">
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {isAr
                        ? 'معاينة ترويسة التقارير الرسمية، عروض الأسعار، وسندات الصرف والقبض:'
                        : 'Official invoice letterhead, voucher printouts, and tender dossier header:'}
                    </p>

                    <div className="p-4 rounded-xl border border-slate-700 bg-white text-slate-900 shadow-md">
                      <div className="flex items-center justify-between border-b-2 pb-3" style={{ borderColor: primaryColor }}>
                        <div className="space-y-0.5">
                          <h4 className="text-sm font-black tracking-tight" style={{ color: primaryColor }}>
                            {companyDisplayName}
                          </h4>
                          <p className="text-[10px] text-slate-500 font-mono">
                            C.R: 1010XXXXXX | VAT: 3000XXXXXXXX003
                          </p>
                          <p className="text-[9px] text-slate-400">
                            Enterprise Resource Planning & Supply Chain Suite
                          </p>
                        </div>
                        {logoUrl ? (
                          <div className="h-12 w-24 flex items-center justify-end">
                            <img
                              src={logoUrl}
                              alt="Logo Letterhead"
                              style={{ transform: `scale(${logoScale / 100})` }}
                              className="max-h-full max-w-full object-contain"
                            />
                          </div>
                        ) : (
                          <TenantAvatar
                            name={companyDisplayName}
                            primaryColor={primaryColor}
                            size="md"
                          />
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500">
                        <span>{isAr ? 'سند استلام / تسليم رسمي' : 'Official Financial Voucher'}</span>
                        <span className="font-mono">REF-2026-0091</span>
                      </div>
                    </div>
                  </div>
                )}

                {previewTab === 'hero' && (
                  <div className="space-y-3 text-center py-4">
                    <div className="inline-flex p-6 rounded-2xl bg-slate-950/80 border border-slate-800 shadow-xl items-center justify-center min-w-[160px] min-h-[140px]">
                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt="Hero Logo"
                          style={{
                            transform: `scale(${logoScale / 100})`,
                            transition: 'transform 0.2s ease',
                          }}
                          className="max-h-24 max-w-40 object-contain drop-shadow-xl"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <TenantAvatar
                            name={companyDisplayName}
                            primaryColor={primaryColor}
                            size="2xl"
                            showGlow={true}
                          />
                          <span className="text-[11px] text-slate-400 font-medium mt-1">
                            {isAr ? 'شارة الهوية الحركية (Monogram)' : 'Dynamic Monogram Avatar'}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="text-xs font-bold text-slate-200">{companyDisplayName}</div>
                    <div className="flex items-center justify-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: primaryColor }} />
                      <span className="text-[10px] font-mono text-slate-400">{primaryColor.toUpperCase()}</span>
                      <span className="text-slate-600">|</span>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: sidebarColor }} />
                      <span className="text-[10px] font-mono text-slate-400">{sidebarColor.toUpperCase()}</span>
                    </div>
                  </div>
                )}

                {previewTab === 'landing' && (
                  <div
                    className={`rounded-xl border overflow-hidden shadow-xl ${
                      landingThemeMode === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
                    }`}
                  >
                    <div className={`flex items-center justify-between px-3 py-2 border-b ${
                      landingThemeMode === 'dark' ? 'border-slate-800' : 'border-slate-200'
                    }`}>
                      <div className="flex items-center gap-2">
                        <TenantAvatar logoUrl={logoUrl} name={companyDisplayName} primaryColor={primaryColor} size="sm" />
                        <span className="text-[11px] font-bold truncate max-w-[120px]">{companyDisplayName}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold text-white" style={{ backgroundColor: primaryColor }}>
                        {isAr ? 'دخول' : 'Sign in'}
                      </span>
                    </div>
                    <div className="p-4" style={{ background: `radial-gradient(80% 80% at 0% 0%, ${primaryColor}22, transparent 70%)` }}>
                      <p className="text-sm font-black leading-snug">
                        {heroTitle.trim() || `Welcome to ${companyDisplayName}`}
                      </p>
                      <p className={`mt-1.5 text-[10px] leading-relaxed line-clamp-3 ${landingThemeMode === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                        {heroSubtitle.trim() || 'Our secure operations and finance workspace.'}
                      </p>
                      <span
                        className="mt-3 inline-block px-3 py-1.5 rounded-lg text-[10px] font-bold text-white"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {ctaLabel.trim() || 'Sign in to workspace'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Summary Pill */}
            <div className="mt-4 pt-3 border-t border-slate-800/70 text-[11px] text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <FileCheck className="h-3.5 w-3.5 text-cyan-400" />
                <span>{isAr ? 'المزامنة الفورية نشطة' : 'Real-time Persistence Active'}</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {currentCompany?.id?.slice(0, 8) || 'default'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default TenantBrandingCustomizer;
