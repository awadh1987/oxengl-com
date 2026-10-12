import React, { useState, useEffect, useRef } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  FileCode,
  Globe,
  Info,
  Palette,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Trash2,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import { AdminPageContainer } from '../../components/admin/AdminPageContainer';
import {
  PlatformMasterSettings,
  SystemBroadcast,
  getPlatformMasterSettings,
  updatePlatformMasterSettings,
  uploadPlatformLogo,
  getAdminBroadcasts,
  createBroadcast,
  updateBroadcast,
  deleteBroadcast,
} from '../../services/governanceService';

type SettingsTab = 'branding' | 'broadcasts' | 'compliance';

const COLOR_PRESETS = [
  '#f97316', // Orange
  '#2563eb', // Blue
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#0f172a', // Slate Dark
  '#ef4444', // Red
];

export const UnifiedMasterSettingsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('branding');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Settings State
  const [settings, setSettings] = useState<PlatformMasterSettings | null>(null);

  // Broadcasts State
  const [broadcasts, setBroadcasts] = useState<SystemBroadcast[]>([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newBroadcast, setNewBroadcast] = useState<Partial<SystemBroadcast>>({
    title: '',
    message: '',
    severity: 'info',
    is_active: true,
    is_dismissible: true,
    target_scope: 'all',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [sData, bData] = await Promise.all([
        getPlatformMasterSettings(),
        getAdminBroadcasts(),
      ]);
      setSettings(sData);
      setBroadcasts(bData);
    } catch (err: any) {
      showToast(`Error: ${err.message || 'Failed to load master settings'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await updatePlatformMasterSettings(settings);
      setSettings(updated);
      showToast('Platform master settings saved and synchronized globally!');
    } catch (err: any) {
      showToast(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, assetType: string = 'primary_logo') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await uploadPlatformLogo(formData, assetType);
      if (res.success && res.url) {
        setSettings((prev) => {
          if (!prev) return prev;
          const next = { ...prev };
          if (assetType === 'logo_light') next.logo_light_url = res.url;
          else if (assetType === 'logo_dark') next.logo_dark_url = res.url;
          else if (assetType === 'favicon') next.favicon_url = res.url;
          else {
            next.logo_light_url = res.url;
            next.logo_dark_url = res.url;
          }
          return next;
        });
        showToast('Logo asset uploaded successfully!');
      }
    } catch (err: any) {
      showToast(`Upload failed: ${err.message}`);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleToggleBroadcast = async (broadcast: SystemBroadcast) => {
    try {
      const updated = await updateBroadcast(broadcast.id, { is_active: !broadcast.is_active });
      setBroadcasts((prev) => prev.map((b) => (b.id === broadcast.id ? updated : b)));
      showToast(`Broadcast "${broadcast.title}" is now ${updated.is_active ? 'Active' : 'Inactive'}.`);
    } catch (err: any) {
      showToast(`Update failed: ${err.message}`);
    }
  };

  const handleDeleteBroadcast = async (id: string) => {
    try {
      await deleteBroadcast(id);
      setBroadcasts((prev) => prev.filter((b) => b.id !== id));
      showToast('Broadcast removed successfully.');
    } catch (err: any) {
      showToast(`Delete failed: ${err.message}`);
    }
  };

  const handleCreateBroadcast = async () => {
    if (!newBroadcast.title || !newBroadcast.message) {
      showToast('Please specify title and message for the announcement.');
      return;
    }
    try {
      const created = await createBroadcast(newBroadcast);
      setBroadcasts((prev) => [created, ...prev]);
      setCreateModalOpen(false);
      setNewBroadcast({
        title: '',
        message: '',
        severity: 'info',
        is_active: true,
        is_dismissible: true,
        target_scope: 'all',
      });
      showToast('New platform broadcast published across all workspaces!');
    } catch (err: any) {
      showToast(`Creation failed: ${err.message}`);
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return (
          <span className="flex items-center gap-1 rounded-full bg-rose-500/10 border border-rose-500/30 px-2.5 py-0.5 text-[10px] font-bold text-rose-500">
            <ShieldAlert className="h-3 w-3" /> CRITICAL
          </span>
        );
      case 'maintenance':
        return (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-bold text-amber-500">
            <Wrench className="h-3 w-3" /> MAINTENANCE
          </span>
        );
      case 'warning':
        return (
          <span className="flex items-center gap-1 rounded-full bg-yellow-500/10 border border-yellow-500/30 px-2.5 py-0.5 text-[10px] font-bold text-yellow-500">
            <AlertTriangle className="h-3 w-3" /> WARNING
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/30 px-2.5 py-0.5 text-[10px] font-bold text-blue-500">
            <Info className="h-3 w-3" /> INFO
          </span>
        );
    }
  };

  if (loading || !settings) {
    return (
      <AdminPageContainer title="Platform Master Settings" subtitle="Loading platform settings...">
        <div className="flex h-64 items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      </AdminPageContainer>
    );
  }

  return (
    <AdminPageContainer
      title="Platform Master Settings Console"
      subtitle="Single source of truth for platform-wide metadata, core branding, live announcements, and multi-tenant policies."
      badge="Root Governance"
      actions={
        <button
          onClick={handleSaveSettings}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 text-xs font-bold shadow-md shadow-orange-500/20 transition-all disabled:opacity-50 cursor-pointer"
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span>Save Changes</span>
        </button>
      }
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 text-white border border-orange-500/50 px-4 py-3 text-xs font-semibold shadow-2xl animate-in slide-in-from-bottom-4">
          <CheckCircle2 className="h-4 w-4 text-orange-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Single-Page Tabbed Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('branding')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'branding'
              ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800/80'
          }`}
        >
          <Palette className="h-4 w-4" />
          <span>1. Identity & Branding</span>
        </button>

        <button
          onClick={() => setActiveTab('broadcasts')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'broadcasts'
              ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800/80'
          }`}
        >
          <Bell className="h-4 w-4" />
          <span>2. System Broadcasts ({broadcasts.filter((b) => b.is_active).length})</span>
        </button>

        <button
          onClick={() => setActiveTab('compliance')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'compliance'
              ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800/80'
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          <span>3. Multi-Tenant & Compliance</span>
        </button>
      </div>

      {/* =====================================================================
          TAB 1: IDENTITY & BRANDING
      ===================================================================== */}
      {activeTab === 'branding' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Core Identity
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Platform Title
                  </label>
                  <input
                    type="text"
                    value={settings.platform_name || ''}
                    onChange={(e) => setSettings({ ...settings, platform_name: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Support Email
                  </label>
                  <input
                    type="email"
                    value={settings.support_email || ''}
                    onChange={(e) => setSettings({ ...settings, support_email: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Tagline / Global Description
                </label>
                <textarea
                  rows={2}
                  value={settings.platform_tagline || ''}
                  onChange={(e) => setSettings({ ...settings, platform_tagline: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-xs leading-relaxed"
                />
              </div>
            </div>

            {/* Visual Color Palette */}
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Color Palette & Tokens
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Primary Color */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
                    Primary Brand Color
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={settings.primary_color || '#f97316'}
                      onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
                      className="h-9 w-12 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={settings.primary_color || ''}
                      onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
                      className="w-28 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-1.5 text-xs font-mono font-bold"
                    />
                  </div>
                  {/* Swatches */}
                  <div className="flex items-center gap-1.5 pt-1">
                    {COLOR_PRESETS.map((hex) => (
                      <button
                        key={hex}
                        onClick={() => setSettings({ ...settings, primary_color: hex })}
                        style={{ backgroundColor: hex }}
                        className="h-5 w-5 rounded-full border border-black/20 hover:scale-110 transition-transform cursor-pointer"
                      />
                    ))}
                  </div>
                </div>

                {/* Secondary Accent Color */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
                    Secondary / Accent Color
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={settings.secondary_color || '#0f172a'}
                      onChange={(e) => setSettings({ ...settings, secondary_color: e.target.value })}
                      className="h-9 w-12 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={settings.secondary_color || ''}
                      onChange={(e) => setSettings({ ...settings, secondary_color: e.target.value })}
                      className="w-28 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-1.5 text-xs font-mono font-bold"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Custom CSS */}
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Global Custom CSS Rules
                </h3>
                <span className="text-[10px] text-slate-400">Injected into public pages</span>
              </div>
              <textarea
                rows={4}
                value={settings.custom_css || ''}
                onChange={(e) => setSettings({ ...settings, custom_css: e.target.value })}
                placeholder="/* e.g. :root { --brand-glow: 0 0 20px #f97316; } */"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-100 p-3 text-xs font-mono"
              />
            </div>
          </div>

          {/* Right Column: Logos & Preview */}
          <div className="space-y-6">
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Logos & Graphic Assets
              </h3>

              {/* Primary Logo Card */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 space-y-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Primary Platform Logo</span>
                <div className="flex h-16 w-full items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 p-2 overflow-hidden">
                  {settings.logo_light_url ? (
                    <img src={settings.logo_light_url} alt="Logo" className="max-h-full object-contain" />
                  ) : (
                    <span className="text-[11px] text-slate-400">No logo uploaded</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => handleFileUpload(e, 'primary_logo')}
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon"
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white py-1.5 text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    {uploadingLogo ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    <span>Upload Logo File</span>
                  </button>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Direct Logo URL</label>
                  <input
                    type="text"
                    value={settings.logo_light_url || ''}
                    onChange={(e) => setSettings({ ...settings, logo_light_url: e.target.value })}
                    className="w-full rounded border border-slate-200 dark:border-slate-800 bg-transparent px-2.5 py-1 text-xs"
                    placeholder="/oxengl-wordmark.svg"
                  />
                </div>
              </div>

              {/* Favicon Card */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 space-y-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Favicon Asset</span>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-1">
                    {settings.favicon_url ? (
                      <img src={settings.favicon_url} alt="Favicon" className="h-6 w-6 object-contain" />
                    ) : (
                      <Globe className="h-5 w-5 text-slate-400" />
                    )}
                  </div>
                  <input
                    type="text"
                    value={settings.favicon_url || ''}
                    onChange={(e) => setSettings({ ...settings, favicon_url: e.target.value })}
                    className="flex-1 rounded border border-slate-200 dark:border-slate-800 bg-transparent px-2.5 py-1 text-xs"
                    placeholder="/favicon.ico"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: SYSTEM BROADCASTS
      ===================================================================== */}
      {activeTab === 'broadcasts' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                System-Wide Announcements & Alerts
              </h3>
              <p className="text-xs text-slate-500">
                Instantly pushed in real-time across public landing, tenant workspaces, and console headers.
              </p>
            </div>

            <button
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white px-3.5 py-2 text-xs font-bold shadow-md shadow-orange-500/20 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Create Announcement</span>
            </button>
          </div>

          {/* Broadcasts List */}
          <div className="space-y-3">
            {broadcasts.length === 0 ? (
              <div className="p-12 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                <Bell className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                <p className="text-xs font-semibold text-slate-500">No active or historical announcements found.</p>
              </div>
            ) : (
              broadcasts.map((b) => (
                <div
                  key={b.id}
                  className={`p-4 rounded-xl border transition-all ${
                    b.is_active
                      ? 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800/60 bg-slate-50 dark:bg-slate-950 opacity-60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {getSeverityBadge(b.severity)}
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white">{b.title}</h4>
                        <span className="text-[10px] text-slate-400 font-mono">({b.target_scope})</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                        {b.message}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Active toggle */}
                      <button
                        onClick={() => handleToggleBroadcast(b)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer transition-colors ${
                          b.is_active
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                        }`}
                      >
                        {b.is_active ? 'Active' : 'Disabled'}
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDeleteBroadcast(b.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Delete Announcement"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: MULTI-TENANT & COMPLIANCE
      ===================================================================== */}
      {activeTab === 'compliance' && (
        <div className="max-w-4xl space-y-6">
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Regulatory Compliance & Hosting Policy
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Terms of Service URL
                </label>
                <input
                  type="text"
                  value={settings.legal_terms_url || ''}
                  onChange={(e) => setSettings({ ...settings, legal_terms_url: e.target.value })}
                  placeholder="/terms"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Privacy Policy URL
                </label>
                <input
                  type="text"
                  value={settings.privacy_policy_url || ''}
                  onChange={(e) => setSettings({ ...settings, privacy_policy_url: e.target.value })}
                  placeholder="/privacy"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs"
                />
              </div>
            </div>

            {/* Sovereignty / Compliance Policy Card Configuration */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Sovereignty &amp; Compliance Policy Card
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Display an authoritative governance declaration on platform landing pages and public portals.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enable_sovereignty_badge !== false}
                    onChange={(e) =>
                      setSettings({ ...settings, enable_sovereignty_badge: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
                </label>
              </div>

              {settings.enable_sovereignty_badge !== false && (
                <div className="space-y-4 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                      Policy Card Title
                    </label>
                    <input
                      type="text"
                      value={settings.sovereignty_badge_title ?? 'Data Sovereignty & Infrastructure Policy'}
                      onChange={(e) =>
                        setSettings({ ...settings, sovereignty_badge_title: e.target.value })
                      }
                      placeholder="e.g. Data Sovereignty & Infrastructure Policy"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                      Policy Statement &amp; Regulatory Standard Details
                    </label>
                    <textarea
                      rows={3}
                      value={
                        settings.sovereignty_badge_text ??
                        'All tenant customer schemas, cryptographic keys, and telemetry logs are strictly persisted on sovereign infrastructure.'
                      }
                      onChange={(e) =>
                        setSettings({ ...settings, sovereignty_badge_text: e.target.value })
                      }
                      placeholder="Explain your jurisdiction, storage standards, encryption, or regulatory compliance..."
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-xs text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  {/* Real-time Live Preview Callout */}
                  <div className="space-y-1.5 pt-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Live Preview
                    </span>
                    <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-500/5 space-y-1.5 transition-all">
                      <div className="flex items-center gap-2 text-emerald-500 font-bold text-xs">
                        <ShieldCheck className="h-4 w-4 shrink-0" />
                        <span>{settings.sovereignty_badge_title || 'Data Sovereignty & Infrastructure Policy'}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                        {settings.sovereignty_badge_text ||
                          'All tenant customer schemas, cryptographic keys, and telemetry logs are strictly persisted on sovereign infrastructure.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Broadcast Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">New Platform Announcement</h3>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Alert Title</label>
                <input
                  type="text"
                  value={newBroadcast.title || ''}
                  onChange={(e) => setNewBroadcast({ ...newBroadcast, title: e.target.value })}
                  placeholder="e.g. Scheduled Network Maintenance"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Severity</label>
                <select
                  value={newBroadcast.severity || 'info'}
                  onChange={(e) => setNewBroadcast({ ...newBroadcast, severity: e.target.value as any })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold"
                >
                  <option value="info">Info (Blue Notice)</option>
                  <option value="warning">Warning (Yellow Caution)</option>
                  <option value="maintenance">Maintenance (Orange Alert)</option>
                  <option value="critical">Critical (Red Urgency)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Alert Message</label>
                <textarea
                  rows={3}
                  value={newBroadcast.message || ''}
                  onChange={(e) => setNewBroadcast({ ...newBroadcast, message: e.target.value })}
                  placeholder="Notice message visible across all tenant viewports..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setCreateModalOpen(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBroadcast}
                className="rounded-xl bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 text-xs font-bold"
              >
                Publish Broadcast
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPageContainer>
  );
};
