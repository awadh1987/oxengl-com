import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  HelpCircle,
  Layers,
  LucideIcon,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Ship,
  Sparkles,
  Trash2,
  Truck,
  Users,
  Landmark,
  CreditCard,
} from 'lucide-react';
import { AdminPageContainer } from '../../components/admin/AdminPageContainer';
import {
  LandingSection,
  getAdminLandingSections,
  updateAdminLandingSection,
  resetLandingSectionsDefault,
} from '../../services/governanceService';

type SectionKey = 'hero' | 'features' | 'metrics' | 'pricing_matrix' | 'testimonials' | 'faq' | 'footer';

export interface LandingCmsStudioViewProps {
  onNavigate?: (tab: any) => void;
}

export const LandingCmsStudioView: React.FC<LandingCmsStudioViewProps> = ({ onNavigate }) => {
  const [sections, setSections] = useState<LandingSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [activeTab, setActiveTab] = useState<SectionKey>('hero');
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Editable local state map
  const [editMap, setEditMap] = useState<Record<string, Partial<LandingSection>>>({});

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadSections = async () => {
    setLoading(true);
    try {
      const data = await getAdminLandingSections();
      setSections(data);
      const initialMap: Record<string, Partial<LandingSection>> = {};
      data.forEach((s) => {
        initialMap[s.section_key] = {
          title: s.title || '',
          subtitle: s.subtitle || '',
          is_visible: s.is_visible,
          sort_order: s.sort_order,
          locale: s.locale,
          content_data: JSON.parse(JSON.stringify(s.content_data || {})),
        };
      });
      setEditMap(initialMap);
    } catch (err: any) {
      showToast(`Error: ${err.message || 'Failed to load sections'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSections();
  }, []);

  const currentSection = editMap[activeTab];

  const updateCurrentField = (field: keyof LandingSection, value: any) => {
    setEditMap((prev) => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        [field]: value,
      },
    }));
  };

  const updateCurrentContentData = (key: string, value: any) => {
    setEditMap((prev) => {
      const currentContent = { ...(prev[activeTab]?.content_data || {}) };
      currentContent[key] = value;
      return {
        ...prev,
        [activeTab]: {
          ...prev[activeTab],
          content_data: currentContent,
        },
      };
    });
  };

  const handleSaveSection = async (sectionKey: string) => {
    const payload = editMap[sectionKey];
    if (!payload) return;

    setSavingKey(sectionKey);
    try {
      const updated = await updateAdminLandingSection(sectionKey, payload);
      setSections((prev) => prev.map((s) => (s.section_key === sectionKey ? updated : s)));
      showToast(`Section "${sectionKey.toUpperCase()}" published successfully!`);
    } catch (err: any) {
      showToast(`Save failed: ${err.message}`);
    } finally {
      setSavingKey(null);
    }
  };

  const handleResetDefaults = async () => {
    setResetting(true);
    try {
      const reset = await resetLandingSectionsDefault();
      setSections(reset);
      const initialMap: Record<string, Partial<LandingSection>> = {};
      reset.forEach((s) => {
        initialMap[s.section_key] = {
          title: s.title || '',
          subtitle: s.subtitle || '',
          is_visible: s.is_visible,
          sort_order: s.sort_order,
          locale: s.locale,
          content_data: JSON.parse(JSON.stringify(s.content_data || {})),
        };
      });
      setEditMap(initialMap);
      setConfirmResetOpen(false);
      showToast('All sections restored to factory production defaults!');
    } catch (err: any) {
      showToast(`Reset failed: ${err.message}`);
    } finally {
      setResetting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Specialized Editors for each Section
  // ---------------------------------------------------------------------------

  const renderHeroEditor = () => {
    const content = currentSection?.content_data || {};
    const stats: Array<{ label: string; value: string }> = content.stats || [];

    const headlineVal = content.headline !== undefined ? content.headline : (currentSection?.title || '');
    const subheadlineVal = content.subheadline !== undefined ? content.subheadline : (currentSection?.subtitle || '');
    const badgeVal = content.badge_text !== undefined ? content.badge_text : (content.badge || '');
    const priLabelVal = content.primary_cta_label !== undefined ? content.primary_cta_label : (content.cta_primary?.label || '');
    const priUrlVal = content.primary_cta_url !== undefined ? content.primary_cta_url : (content.cta_primary?.url || '');
    const secLabelVal = content.secondary_cta_label !== undefined ? content.secondary_cta_label : (content.cta_secondary?.label || '');
    const secUrlVal = content.secondary_cta_url !== undefined ? content.secondary_cta_url : (content.cta_secondary?.url || '');
    const nodeLabelVal = content.telemetry_node_label || '';
    const dbLabelVal = content.telemetry_db_label || '';

    const handleHeadlineChange = (val: string) => {
      setEditMap((prev) => {
        const cur = { ...(prev[activeTab] || {}) };
        const curContent = { ...(cur.content_data || {}) };
        curContent.headline = val;
        return {
          ...prev,
          [activeTab]: {
            ...cur,
            title: val,
            content_data: curContent,
          },
        };
      });
    };

    const handleSubheadlineChange = (val: string) => {
      setEditMap((prev) => {
        const cur = { ...(prev[activeTab] || {}) };
        const curContent = { ...(cur.content_data || {}) };
        curContent.subheadline = val;
        return {
          ...prev,
          [activeTab]: {
            ...cur,
            subtitle: val,
            content_data: curContent,
          },
        };
      });
    };

    const handleBadgeChange = (val: string) => {
      setEditMap((prev) => {
        const cur = { ...(prev[activeTab] || {}) };
        const curContent = { ...(cur.content_data || {}) };
        curContent.badge_text = val;
        curContent.badge = val;
        return {
          ...prev,
          [activeTab]: {
            ...cur,
            content_data: curContent,
          },
        };
      });
    };

    const handlePrimaryCtaChange = (labelVal: string, urlVal: string) => {
      setEditMap((prev) => {
        const cur = { ...(prev[activeTab] || {}) };
        const curContent = { ...(cur.content_data || {}) };
        curContent.primary_cta_label = labelVal;
        curContent.primary_cta_url = urlVal;
        curContent.cta_primary = { label: labelVal, url: urlVal };
        return {
          ...prev,
          [activeTab]: {
            ...cur,
            content_data: curContent,
          },
        };
      });
    };

    const handleSecondaryCtaChange = (labelVal: string, urlVal: string) => {
      setEditMap((prev) => {
        const cur = { ...(prev[activeTab] || {}) };
        const curContent = { ...(cur.content_data || {}) };
        curContent.secondary_cta_label = labelVal;
        curContent.secondary_cta_url = urlVal;
        curContent.cta_secondary = { label: labelVal, url: urlVal };
        return {
          ...prev,
          [activeTab]: {
            ...cur,
            content_data: curContent,
          },
        };
      });
    };

    return (
      <div className="space-y-6">
        {/* Top Badges & Telemetry Node Row */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-4">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
            Badge &amp; Telemetry Status Labels
          </span>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Hero Badge Pill Text
              </label>
              <input
                type="text"
                value={badgeVal}
                onChange={(e) => handleBadgeChange(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
                placeholder="v4.8 ENTERPRISE CONTROL PLANE"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Telemetry Node Label
              </label>
              <input
                type="text"
                value={nodeLabelVal}
                onChange={(e) => updateCurrentContentData('telemetry_node_label', e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-emerald-500 focus:border-orange-500 focus:outline-none"
                placeholder="YEM-SANAA-01 [ONLINE]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Telemetry Database / Uptime Label
              </label>
              <input
                type="text"
                value={dbLabelVal}
                onChange={(e) => updateCurrentContentData('telemetry_db_label', e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-slate-700 dark:text-slate-300 focus:border-orange-500 focus:outline-none"
                placeholder="PostgreSQL 16.4 • Uptime: 99.984%"
              />
            </div>
          </div>
        </div>

        {/* Main Headline & Subheadline */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Main Headline (Full Custom Sovereignty Text)
            </label>
            <input
              type="text"
              value={headlineVal}
              onChange={(e) => handleHeadlineChange(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              placeholder="Sovereign Multi-Tenant ERP Architecture for the Republic of Yemen"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Hero Subheadline Copy
            </label>
            <textarea
              rows={3}
              value={subheadlineVal}
              onChange={(e) => handleSubheadlineChange(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 text-xs text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none leading-relaxed"
              placeholder="Sub-millisecond query isolation, cryptographic compliance, and heavy industrial logistics orchestration..."
            />
          </div>
        </div>

        {/* Call to action buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 space-y-3">
            <span className="text-xs font-bold text-orange-500 uppercase tracking-wider">Primary CTA</span>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Button Label</label>
              <input
                type="text"
                value={priLabelVal}
                onChange={(e) => handlePrimaryCtaChange(e.target.value, priUrlVal)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs"
                placeholder="Deploy Workspace"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Target URL</label>
              <input
                type="text"
                value={priUrlVal}
                onChange={(e) => handlePrimaryCtaChange(priLabelVal, e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono"
                placeholder="/register"
              />
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 space-y-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Secondary CTA</span>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Button Label</label>
              <input
                type="text"
                value={secLabelVal}
                onChange={(e) => handleSecondaryCtaChange(e.target.value, secUrlVal)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs"
                placeholder="Console Sign In"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Target URL</label>
              <input
                type="text"
                value={secUrlVal}
                onChange={(e) => handleSecondaryCtaChange(secLabelVal, e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono"
                placeholder="/login"
              />
            </div>
          </div>
        </div>

        {/* Live Proof Counters */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Hero Metrics / Counters
            </span>
            <button
              onClick={() => {
                const nextStats = [...stats, { label: 'Metric', value: '100%' }];
                updateCurrentContentData('stats', nextStats);
              }}
              className="flex items-center gap-1 text-xs font-semibold text-orange-500 hover:text-orange-600 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Add Counter
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.map((st, i) => (
              <div
                key={i}
                className="relative p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 group"
              >
                <button
                  onClick={() => {
                    const nextStats = stats.filter((_, idx) => idx !== i);
                    updateCurrentContentData('stats', nextStats);
                  }}
                  className="absolute top-2 right-2 p-1 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <div>
                  <label className="block text-[10px] text-slate-400">Value</label>
                  <input
                    type="text"
                    value={st.value}
                    onChange={(e) => {
                      const nextStats = [...stats];
                      nextStats[i] = { ...nextStats[i], value: e.target.value };
                      updateCurrentContentData('stats', nextStats);
                    }}
                    className="w-full rounded border border-slate-200 dark:border-slate-800 bg-transparent px-2 py-1 text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400">Label</label>
                  <input
                    type="text"
                    value={st.label}
                    onChange={(e) => {
                      const nextStats = [...stats];
                      nextStats[i] = { ...nextStats[i], label: e.target.value };
                      updateCurrentContentData('stats', nextStats);
                    }}
                    className="w-full rounded border border-slate-200 dark:border-slate-800 bg-transparent px-2 py-1 text-xs text-slate-600 dark:text-slate-300"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderFeaturesEditor = () => {
    const content = currentSection?.content_data || {};
    const items: Array<{
      id: string;
      title: string;
      description: string;
      icon: string;
      badge?: string;
    }> = content.items || [];

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Section Title
            </label>
            <input
              type="text"
              value={currentSection?.title || ''}
              onChange={(e) => updateCurrentField('title', e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs font-semibold"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Section Subtitle
            </label>
            <input
              type="text"
              value={currentSection?.subtitle || ''}
              onChange={(e) => updateCurrentField('subtitle', e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Feature Cards ({items.length})
            </span>
            <button
              onClick={() => {
                const nextItems = [
                  ...items,
                  {
                    id: `feat-${Date.now()}`,
                    title: 'New Enterprise Feature',
                    description: 'Feature description and mission value proposition.',
                    icon: 'Sparkles',
                    badge: 'Core',
                  },
                ];
                updateCurrentContentData('items', nextItems);
              }}
              className="flex items-center gap-1 text-xs font-semibold text-orange-500 hover:text-orange-600 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Add Feature Card
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((it, idx) => (
              <div
                key={idx}
                className="relative p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3 shadow-sm group"
              >
                <button
                  onClick={() => {
                    const nextItems = items.filter((_, i) => i !== idx);
                    updateCurrentContentData('items', nextItems);
                  }}
                  className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
                  title="Delete Card"
                >
                  <Trash2 className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-3">
                  <div className="w-1/3">
                    <label className="block text-[10px] text-slate-400 mb-1">Icon Identifier</label>
                    <input
                      type="text"
                      value={it.icon}
                      onChange={(e) => {
                        const nextItems = [...items];
                        nextItems[idx] = { ...nextItems[idx], icon: e.target.value };
                        updateCurrentContentData('items', nextItems);
                      }}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-2.5 py-1.5 text-xs font-mono"
                      placeholder="ShieldCheck"
                    />
                  </div>
                  <div className="w-2/3 pr-8">
                    <label className="block text-[10px] text-slate-400 mb-1">Badge Tag</label>
                    <input
                      type="text"
                      value={it.badge || ''}
                      onChange={(e) => {
                        const nextItems = [...items];
                        nextItems[idx] = { ...nextItems[idx], badge: e.target.value };
                        updateCurrentContentData('items', nextItems);
                      }}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-2.5 py-1.5 text-xs"
                      placeholder="Regulatory"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Feature Title</label>
                  <input
                    type="text"
                    value={it.title}
                    onChange={(e) => {
                      const nextItems = [...items];
                      nextItems[idx] = { ...nextItems[idx], title: e.target.value };
                      updateCurrentContentData('items', nextItems);
                    }}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={it.description}
                    onChange={(e) => {
                      const nextItems = [...items];
                      nextItems[idx] = { ...nextItems[idx], description: e.target.value };
                      updateCurrentContentData('items', nextItems);
                    }}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent p-2.5 text-xs text-slate-600 dark:text-slate-300"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderPricingEditor = () => {
    const content = currentSection?.content_data || {};
    const tiers: Array<any> = content.tiers || [];

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Section Title
            </label>
            <input
              type="text"
              value={currentSection?.title || ''}
              onChange={(e) => updateCurrentField('title', e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs font-semibold"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Section Subtitle
            </label>
            <input
              type="text"
              value={currentSection?.subtitle || ''}
              onChange={(e) => updateCurrentField('subtitle', e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs"
            />
          </div>
        </div>

        {/* Unified Catalog Notice & Direct Action */}
        <div className="p-5 rounded-2xl bg-orange-500/10 border border-orange-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-orange-400 uppercase tracking-wider">
                Unified Pricing & Subscription Catalog
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Subscription plans, SAR pricing, quotas, and feature bullet points are synchronized across the entire platform from the <strong>Pricing & Subscription Plans</strong> hub. Changes publish immediately to the public landing page.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (onNavigate) {
                onNavigate('pricing');
              } else {
                window.location.hash = '#pricing';
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition-all shadow-lg shadow-orange-500/20 shrink-0 cursor-pointer"
          >
            <CreditCard className="h-4 w-4" />
            Edit in Pricing & Subscription Plans
          </button>
        </div>

        {/* Synchronized Plans Preview Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Active Catalog Tiers ({tiers.length})
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Live Synchronized
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (onNavigate) onNavigate('pricing');
                else window.location.hash = '#pricing';
              }}
              className="flex items-center gap-1.5 text-xs font-semibold text-orange-500 hover:text-orange-600 cursor-pointer"
            >
              <CreditCard className="h-3.5 w-3.5" /> Manage Tiers in Pricing Hub
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {tiers.map((t, idx) => {
              const name = t.name || t.plan_name || t.title;
              const isFeatured = Boolean(t.is_featured ?? t.highlighted ?? t.featured);
              const monthly = t.price_monthly || (t.monthly_price != null ? `SAR ${Number(t.monthly_price).toLocaleString('en-US')}` : 'Custom Quote');
              const annual = t.price_annual || (t.annual_price != null ? `SAR ${Number(t.annual_price).toLocaleString('en-US')}` : 'Custom Quote');
              const rawFeatures = t.features ?? t.display_features ?? [];
              const featuresList = Array.isArray(rawFeatures) ? rawFeatures : String(rawFeatures).split('\n').filter(Boolean);

              return (
                <div
                  key={idx}
                  className={`relative p-5 rounded-2xl border ${
                    isFeatured
                      ? 'border-orange-500 bg-orange-500/5 shadow-md shadow-orange-500/10'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                  } space-y-4 flex flex-col justify-between`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase text-orange-500 tracking-wider">
                        {name}
                      </span>
                      {isFeatured && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500 text-white uppercase">
                          Featured
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="text-lg font-black text-slate-900 dark:text-white font-mono">
                        {monthly}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Annual: <span className="font-mono text-slate-300">{annual}</span>
                      </div>
                      {t.tagline && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{t.tagline}</p>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                        Features ({featuresList.length})
                      </span>
                      <ul className="space-y-1 text-xs text-slate-400">
                        {featuresList.slice(0, 4).map((f: string, fIdx: number) => (
                          <li key={fIdx} className="flex items-center gap-1.5 text-[11px] truncate">
                            <span className="text-emerald-500 font-bold">✓</span> {f}
                          </li>
                        ))}
                        {featuresList.length > 4 && (
                          <li className="text-[10px] text-slate-500 italic">
                            +{featuresList.length - 4} more features in catalog
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (onNavigate) onNavigate('pricing');
                      else window.location.hash = '#pricing';
                    }}
                    className="w-full mt-3 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 hover:bg-orange-500 hover:text-white hover:border-orange-500 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    Edit Plan & Limits
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderFaqEditor = () => {
    const content = currentSection?.content_data || {};
    const items: Array<{ question: string; answer: string }> = content.items || [];

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            FAQ Accordion Items ({items.length})
          </span>
          <button
            onClick={() => {
              const nextItems = [
                ...items,
                { question: 'New Question?', answer: 'Comprehensive answer text goes here.' },
              ];
              updateCurrentContentData('items', nextItems);
            }}
            className="flex items-center gap-1 text-xs font-semibold text-orange-500 hover:text-orange-600 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> Add FAQ Item
          </button>
        </div>

        <div className="space-y-3">
          {items.map((it, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 relative group"
            >
              <button
                onClick={() => {
                  const nextItems = items.filter((_, i) => i !== idx);
                  updateCurrentContentData('items', nextItems);
                }}
                className="absolute top-3 right-3 p-1 text-slate-400 hover:text-rose-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>

              <div className="pr-8">
                <label className="block text-[10px] text-slate-400 mb-1">Question</label>
                <input
                  type="text"
                  value={it.question}
                  onChange={(e) => {
                    const nextItems = [...items];
                    nextItems[idx] = { ...nextItems[idx], question: e.target.value };
                    updateCurrentContentData('items', nextItems);
                  }}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-1.5 text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Answer</label>
                <textarea
                  rows={2}
                  value={it.answer}
                  onChange={(e) => {
                    const nextItems = [...items];
                    nextItems[idx] = { ...nextItems[idx], answer: e.target.value };
                    updateCurrentContentData('items', nextItems);
                  }}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent p-2.5 text-xs text-slate-600 dark:text-slate-300"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderFooterEditor = () => {
    const content = currentSection?.content_data || {};
    const contactEmail = content.contact_email || content.email || '';
    const contactPhone = content.contact_phone || content.phone || '';
    const contactLocation = content.contact_location || content.contact_address || content.location_text || '';
    const copyright = content.copyright || '';

    const handlePhoneChange = (val: string) => {
      updateCurrentContentData('contact_phone', val);
      updateCurrentContentData('phone', val);
    };

    const handleLocationChange = (val: string) => {
      updateCurrentContentData('contact_location', val);
      updateCurrentContentData('contact_address', val);
      updateCurrentContentData('location_text', val);
    };

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Footer Brand Title
            </label>
            <input
              type="text"
              value={currentSection?.title || ''}
              onChange={(e) => updateCurrentField('title', e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs font-semibold"
              placeholder="OxenGL"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Footer Brand Tagline / Subtitle
            </label>
            <input
              type="text"
              value={currentSection?.subtitle || ''}
              onChange={(e) => updateCurrentField('subtitle', e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs"
              placeholder="Sovereign Enterprise Resource Planning platform."
            />
          </div>
        </div>

        {/* Dedicated Contact & WhatsApp Bindings */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-4">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
            Official Contact Channels &amp; WhatsApp Integration
          </span>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                WhatsApp &amp; Direct Contact Phone Number
              </label>
              <input
                type="text"
                value={contactPhone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-amber-500 font-bold focus:border-orange-500 focus:outline-none"
                placeholder="+967 736735733"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Rendered on public landing footer as a direct WhatsApp conversation link (wa.me).
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Support &amp; Operations Email
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => updateCurrentContentData('contact_email', e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
                placeholder="ops@oxengl.me"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Direct mailto destination for enterprise inquiries and cluster support.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">
              Headquarters / Regional Operations Location
            </label>
            <input
              type="text"
              value={contactLocation}
              onChange={(e) => handleLocationChange(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
              placeholder="Sana'a, Yemen"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
            Copyright &amp; Sovereign Legal Line
          </label>
          <input
            type="text"
            value={copyright}
            onChange={(e) => updateCurrentContentData('copyright', e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white"
            placeholder="© 2026 OxenGL Enterprise. All rights reserved."
          />
        </div>
      </div>
    );
  };

  const renderGenericJsonEditor = () => {
    const jsonStr = JSON.stringify(currentSection?.content_data || {}, null, 2);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Section Title
            </label>
            <input
              type="text"
              value={currentSection?.title || ''}
              onChange={(e) => updateCurrentField('title', e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs font-semibold"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Section Subtitle
            </label>
            <input
              type="text"
              value={currentSection?.subtitle || ''}
              onChange={(e) => updateCurrentField('subtitle', e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
            Structured Content JSON Payload
          </label>
          <textarea
            rows={10}
            value={jsonStr}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                updateCurrentField('content_data', parsed);
              } catch {
                // Keep typing
              }
            }}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 text-xs font-mono text-slate-900 dark:text-white"
          />
        </div>
      </div>
    );
  };

  const sectionTabs: { key: SectionKey; label: string }[] = [
    { key: 'hero', label: '1. Hero Showcase' },
    { key: 'features', label: '2. Feature Matrix' },
    { key: 'metrics', label: '3. Proof Metrics' },
    { key: 'pricing_matrix', label: '4. Pricing & Plans' },
    { key: 'testimonials', label: '5. Social Proof' },
    { key: 'faq', label: '6. FAQ Accordion' },
    { key: 'footer', label: '7. Footer & Contacts' },
  ];

  if (loading) {
    return (
      <AdminPageContainer title="Landing CMS Studio" subtitle="Loading landing engine configuration...">
        <div className="flex h-64 items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      </AdminPageContainer>
    );
  }

  return (
    <AdminPageContainer
      title="Landing CMS Studio"
      subtitle="Full schema-driven visual control over every word, card, metric, button, and tier on https://oxengl.me"
      badge="Headless CMS"
      actions={
        <>
          <button
            onClick={() => setShowLivePreview(!showLivePreview)}
            className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
              showLivePreview
                ? 'border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300'
            }`}
          >
            {showLivePreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <span>{showLivePreview ? 'Hide Preview' : 'Live Preview'}</span>
          </button>

          <button
            onClick={() => setConfirmResetOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-600 transition-all cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Factory Reset</span>
          </button>

          <button
            onClick={() => handleSaveSection(activeTab)}
            disabled={savingKey === activeTab}
            className="flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 text-xs font-bold shadow-md shadow-orange-500/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            {savingKey === activeTab ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>Publish Section</span>
          </button>
        </>
      }
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 text-white border border-orange-500/50 px-4 py-3 text-xs font-semibold shadow-2xl animate-in slide-in-from-bottom-4">
          <CheckCircle2 className="h-4 w-4 text-orange-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Confirmation Modal for Factory Reset */}
      {confirmResetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-500">
              <AlertCircle className="h-6 w-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Confirm Factory Reset</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Are you sure you want to restore all 7 landing sections to initial production defaults? Any unpublished local custom copy will be overwritten.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setConfirmResetOpen(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleResetDefaults}
                disabled={resetting}
                className="flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-xs font-bold disabled:opacity-50"
              >
                {resetting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>Reset to Factory Defaults</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`grid gap-6 ${showLivePreview ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'}`}>
        {/* Editor Column */}
        <div className="space-y-6">
          {/* Section Navigation Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200 dark:border-slate-800 scrollbar-none">
            {sectionTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                  activeTab === tab.key
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800/80'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Section Visibility & Metadata Row */}
          <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm">
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentSection?.is_visible !== false}
                  onChange={(e) => updateCurrentField('is_visible', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500" />
              </label>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                {currentSection?.is_visible !== false ? 'Section Visible on oxengl.me' : 'Section Hidden from Public'}
              </span>
            </div>

            <span className="text-[11px] font-mono text-slate-400">
              Key: <span className="font-bold text-orange-500">{activeTab}</span>
            </span>
          </div>

          {/* Section Specific Form Body */}
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm space-y-6">
            {activeTab === 'hero' && renderHeroEditor()}
            {activeTab === 'features' && renderFeaturesEditor()}
            {activeTab === 'pricing_matrix' && renderPricingEditor()}
            {activeTab === 'faq' && renderFaqEditor()}
            {activeTab === 'footer' && renderFooterEditor()}
            {activeTab !== 'hero' &&
              activeTab !== 'features' &&
              activeTab !== 'pricing_matrix' &&
              activeTab !== 'faq' &&
              activeTab !== 'footer' &&
              renderGenericJsonEditor()}
          </div>
        </div>

        {/* Live Preview Column (Toggled) */}
        {showLivePreview && (
          <div className="sticky top-20 h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border border-slate-300 dark:border-slate-800 bg-slate-950 text-slate-100 p-6 shadow-2xl space-y-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Instant Preview
                </span>
              </div>
              <span className="text-[10px] text-slate-400">Viewport: 100% Dynamic Binding</span>
            </div>

            {/* Preview Rendering */}
            <div className="space-y-6">
              {currentSection?.is_visible === false && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs text-center font-medium">
                  This section is currently marked Hidden and won't appear publicly.
                </div>
              )}

              {/* Title & Subtitle Preview */}
              {activeTab === 'hero' ? (
                <div className="text-center space-y-4 py-4">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <span className="inline-block rounded-full bg-orange-500/20 border border-orange-500/30 px-3 py-1 text-[10px] font-black text-orange-400 tracking-wider">
                      {currentSection?.content_data?.badge_text || currentSection?.content_data?.badge || 'ENTERPRISE CONTROL PLANE'}
                    </span>
                    {(currentSection?.content_data?.telemetry_node_label || currentSection?.content_data?.telemetry_db_label) && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 border border-slate-800 px-3 py-1 text-[10px] font-mono text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>{currentSection?.content_data?.telemetry_node_label || 'NODE [ONLINE]'}</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-300">{currentSection?.content_data?.telemetry_db_label || 'PostgreSQL 16'}</span>
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-white leading-tight max-w-xl mx-auto">
                    {currentSection?.content_data?.headline || currentSection?.title || 'Sovereign Multi-Tenant ERP Architecture'}
                  </h2>
                  <p className="text-xs text-slate-300 max-w-lg mx-auto leading-relaxed">
                    {currentSection?.content_data?.subheadline || currentSection?.subtitle || 'Sub-millisecond query isolation, cryptographic compliance, and heavy industrial logistics orchestration.'}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <span className="rounded-xl bg-orange-500 text-white font-bold text-xs px-4 py-2 shadow-lg shadow-orange-500/20">
                      {currentSection?.content_data?.primary_cta_label || currentSection?.content_data?.cta_primary?.label || 'Deploy Workspace'}
                    </span>
                    <span className="rounded-xl border border-slate-700 bg-slate-900 text-slate-200 font-bold text-xs px-4 py-2">
                      {currentSection?.content_data?.secondary_cta_label || currentSection?.content_data?.cta_secondary?.label || 'Console Sign In'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-2">
                  {currentSection?.content_data?.badge && (
                    <span className="inline-block rounded-full bg-orange-500/20 border border-orange-500/30 px-3 py-1 text-[10px] font-black text-orange-400 tracking-wider">
                      {currentSection.content_data.badge}
                    </span>
                  )}
                  <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">
                    {currentSection?.title || 'Section Heading'}
                  </h2>
                  <p className="text-xs text-slate-400 max-w-lg mx-auto">
                    {currentSection?.subtitle || 'Section subtitle copy'}
                  </p>
                </div>
              )}

              {/* Dynamic Feature Cards Preview */}
              {activeTab === 'features' && currentSection?.content_data?.items && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {currentSection.content_data.items.map((it: any, i: number) => (
                    <div key={i} className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">{it.title}</span>
                        {it.badge && (
                          <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-bold text-orange-400">
                            {it.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">{it.description}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Pricing Cards Preview */}
              {activeTab === 'pricing_matrix' && currentSection?.content_data?.tiers && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  {currentSection.content_data.tiers.map((t: any, i: number) => (
                    <div
                      key={i}
                      className={`p-3.5 rounded-xl border ${
                        t.highlighted ? 'border-orange-500 bg-orange-500/10' : 'border-slate-800 bg-slate-900/60'
                      } space-y-2`}
                    >
                      <div className="text-xs font-black text-white">{t.name}</div>
                      <div className="text-sm font-black text-orange-400">{t.price_monthly}</div>
                      <p className="text-[10px] text-slate-400">{t.tagline}</p>
                      <ul className="text-[10px] text-slate-300 space-y-1">
                        {(t.features || []).map((f: string, fi: number) => (
                          <li key={fi} className="flex items-center gap-1.5">
                            <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {/* CTAs Preview */}
              {activeTab === 'hero' && (
                <div className="flex items-center justify-center gap-3 pt-4">
                  {currentSection?.content_data?.cta_primary?.label && (
                    <button className="rounded-xl bg-orange-500 text-white font-bold text-xs px-4 py-2 shadow-lg shadow-orange-500/30">
                      {currentSection.content_data.cta_primary.label}
                    </button>
                  )}
                  {currentSection?.content_data?.cta_secondary?.label && (
                    <button className="rounded-xl border border-slate-700 text-slate-300 font-bold text-xs px-4 py-2">
                      {currentSection.content_data.cta_secondary.label}
                    </button>
                  )}
                </div>
              )}

              {/* Footer Contacts Preview */}
              {activeTab === 'footer' && (
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-3">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Footer Live Contacts
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">Email:</span>
                      <span className="text-slate-200">
                        {currentSection?.content_data?.contact_email || 'ops@oxengl.me'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">WhatsApp:</span>
                      <span className="text-amber-400 font-mono font-bold">
                        {currentSection?.content_data?.contact_phone || '+967 736735733'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">Location:</span>
                      <span className="text-slate-300">
                        {currentSection?.content_data?.contact_location || "Sana'a, Yemen"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminPageContainer>
  );
};
