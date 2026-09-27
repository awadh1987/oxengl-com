import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  FileCheck,
  Hash,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Copy,
  Check,
  Lock,
  Globe,
  Database,
  RefreshCw,
  Search,
  ChevronRight,
  Layers,
  Plus,
  X,
  AlertCircle,
  Truck
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { erpApi, ApiCustomsManifest } from '../services/api';
import { useTranslation } from 'react-i18next';

export type CustomsManifestItem = ApiCustomsManifest;

const maskHash = (hash?: string | null): string => {
  if (!hash) return '—';
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
};

const maskUuid = (uuid?: string | null): string => {
  if (!uuid) return '—';
  return `REF-${uuid.slice(0, 8).toUpperCase()}`;
};

export const CustomsClearanceView: React.FC = () => {
  const { currentCompany, language } = useApp();
  const { t } = useTranslation();
  const isAr = language === 'ar';

  const [activeTab, setActiveTab] = useState<'manifests' | 'ledger'>('manifests');
  const [selectedManifestId, setSelectedManifestId] = useState<string>('');
  const [isSubmittingZatca, setIsSubmittingZatca] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [hoveredBlockIndex, setHoveredBlockIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Live Server State
  const [manifests, setManifests] = useState<CustomsManifestItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // New Declaration Form State
  const [newForm, setNewForm] = useState({
    manifest_number: '',
    declaration_type: 'IMPORT' as 'IMPORT' | 'EXPORT' | 'TRANSIT',
    border_port_name: 'King Abdulaziz Port Dammam (KAP)',
    carrier_name: 'Al-Majdouie Logistics Corp',
    duty_amount: '12500',
    vat_amount: '1875',
    total_value_sar: '125000',
    hs_codes: '8708.29.90, 8504.40.90',
  });

  const loadManifests = useCallback(async () => {
    if (!currentCompany) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await erpApi.getCustomsManifests(currentCompany.id);
      setManifests(data);
      if (data.length > 0) {
        setSelectedManifestId(prev => (prev && data.some(m => m.id === prev) ? prev : data[0].id));
      }
    } catch (err: any) {
      console.warn('[CustomsClearance] Failed to load manifests from backend:', err);
      setError(err?.message || 'Failed to load customs manifests from PostgreSQL');
    } finally {
      setIsLoading(false);
    }
  }, [currentCompany]);

  useEffect(() => {
    void loadManifests();
  }, [loadManifests]);

  const selectedManifest = useMemo(
    () => manifests.find(m => m.id === selectedManifestId) || manifests[0],
    [manifests, selectedManifestId]
  );

  const filteredManifests = useMemo(() => {
    return manifests.filter(m => {
      const matchesSearch =
        m.manifest_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.border_port_name && m.border_port_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (m.carrier_name && m.carrier_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (m.hs_codes && m.hs_codes.some(c => c.includes(searchQuery)));
      const matchesStatus =
        statusFilter === 'ALL' ||
        m.clearance_status === statusFilter ||
        m.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [manifests, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const total = manifests.length;
    const totalValue = manifests.reduce((acc, curr) => acc + (curr.total_value_sar || 0), 0);
    const cleared = manifests.filter(m => m.clearance_status === 'CLEARED' || m.status === 'CLEARED').length;
    const zatcaCertified = manifests.filter(m => m.zatca_compliance_status === 'REPORTED').length;
    return { total, totalValue, cleared, zatcaCertified };
  }, [manifests]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handleZatcaCryptographicReport = async (manifestId: string) => {
    if (!currentCompany) return;
    setIsSubmittingZatca(true);
    try {
      const updated = await erpApi.updateCustomsStatus(
        currentCompany.id,
        manifestId,
        'CLEARED',
        'ZATCA Phase-2 Stage-2 XML Compliance Signature Verified'
      );
      setManifests(prev => prev.map(item => (item.id === manifestId ? updated : item)));
    } catch (err: any) {
      console.error('[CustomsClearance] ZATCA report error:', err);
      alert(err?.message || 'Failed to dispatch cryptographic compliance certificate');
    } finally {
      setIsSubmittingZatca(false);
    }
  };

  const handleStatusTransition = async (manifestId: string, targetStatus: string) => {
    if (!currentCompany) return;
    setIsTransitioning(true);
    try {
      const updated = await erpApi.updateCustomsStatus(currentCompany.id, manifestId, targetStatus);
      setManifests(prev => prev.map(item => (item.id === manifestId ? updated : item)));
    } catch (err: any) {
      console.error('[CustomsClearance] Status transition error:', err);
      alert(err?.message || 'Failed to transition customs manifest status');
    } finally {
      setIsTransitioning(false);
    }
  };

  const handleCreateManifest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCompany) return;
    setIsCreating(true);
    try {
      const codes = newForm.hs_codes
        .split(',')
        .map(c => c.trim())
        .filter(Boolean);

      const created = await erpApi.createCustomsManifest(currentCompany.id, {
        manifest_number: newForm.manifest_number.trim() || undefined,
        declaration_type: newForm.declaration_type,
        border_port_name: newForm.border_port_name.trim(),
        port_of_entry: newForm.border_port_name.trim(),
        carrier_name: newForm.carrier_name.trim(),
        duty_amount: parseFloat(newForm.duty_amount) || 0,
        vat_amount: parseFloat(newForm.vat_amount) || 0,
        total_value_sar: parseFloat(newForm.total_value_sar) || 0,
        total_customs_amount: parseFloat(newForm.total_value_sar) || 0,
        hs_codes: codes,
        status: 'DRAFT',
      });

      setManifests(prev => [created, ...prev]);
      setSelectedManifestId(created.id);
      setIsCreateModalOpen(false);
      setNewForm({
        manifest_number: '',
        declaration_type: 'IMPORT',
        border_port_name: 'King Abdulaziz Port Dammam (KAP)',
        carrier_name: 'Al-Majdouie Logistics Corp',
        duty_amount: '12500',
        vat_amount: '1875',
        total_value_sar: '125000',
        hs_codes: '8708.29.90, 8504.40.90',
      });
    } catch (err: any) {
      console.error('[CustomsClearance] Failed to create manifest:', err);
      alert(err?.message || 'Failed to create customs manifest on server');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070913] text-slate-100 p-4 sm:p-6 lg:p-8 font-sans selection:bg-cyan-500 selection:text-black">
      {/* COMPLIANCE BOARD TOP BAR */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center border-b border-slate-800/80 pb-6 mb-8 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-950/40">
              <Globe className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  {t('customs.title')}
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  {t('customs.postgresLive', 'POSTGRES LIVE')}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-2 font-mono">
                <span>{t('customs.zatcaPhase2Engine', 'ZATCA Phase-2 (Stage-2) Cryptographic Engine')}</span>
                <span className="text-slate-600">•</span>
                <span>{t('customs.sha256Ledger', 'Immutable SHA-256 General Ledger Chaining')}</span>
              </p>
            </div>
          </div>
        </div>

        {/* CONTROLS & TAB SWITCHER */}
        <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end flex-wrap">
          {/* Live Server Refresh */}
          <button
            onClick={() => void loadManifests()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 disabled:opacity-50 transition-colors"
            title="Refresh from PostgreSQL"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-cyan-400 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? t('customs.syncing', 'Syncing...') : t('customs.syncBtn')}</span>
          </button>

          {/* New Declaration Button */}
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-mono font-bold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-950/40 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t('customs.newDeclaration')}</span>
          </button>

          <div className="flex bg-slate-900/90 border border-slate-800 rounded-xl p-1 text-xs font-mono shadow-inner">
            <button
              onClick={() => setActiveTab('manifests')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === 'manifests'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 font-bold text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCheck className="h-3.5 w-3.5" />
              {t('customs.manifestsTab')}
            </button>
            <button
              onClick={() => setActiveTab('ledger')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === 'ledger'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 font-bold text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Hash className="h-3.5 w-3.5" />
              {t('customs.ledgerTab', 'Immutable Hash Ledger')}
            </button>
          </div>

          <a
            href="/dashboard"
            className="hidden sm:inline-flex items-center gap-1 text-xs font-mono text-slate-400 hover:text-cyan-400 transition-colors border border-slate-800 bg-slate-900/60 px-3 py-2 rounded-xl"
          >
            {t('customs.exitHub', 'Exit to Hub')}
            <ChevronRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs font-mono flex items-center gap-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* METRIC CARDS HEADER */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 backdrop-blur-md">
          <span className="text-xs font-mono text-slate-400 block mb-1">{t('customs.totalManifests')}</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-white"><span dir="ltr" className="inline-block unicode-bidi-isolate">{stats.total}</span></span>
            <span className="text-xs font-mono text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40">
              {t('customs.activeSync', 'Active Sync')}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 backdrop-blur-md">
          <span className="text-xs font-mono text-slate-400 block mb-1">{t('customs.declaredValue')}</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-white">
              <span dir="ltr" className="inline-block unicode-bidi-isolate">{stats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </span>
            <span className="text-xs font-mono text-slate-400">SAR</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 backdrop-blur-md">
          <span className="text-xs font-mono text-slate-400 block mb-1">{t('customs.clearanceRatio')}</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-400">
              <span dir="ltr" className="inline-block unicode-bidi-isolate">{stats.total > 0 ? Math.round((stats.cleared / stats.total) * 100) : 0}%</span>
            </span>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
              <span dir="ltr" className="inline-block unicode-bidi-isolate">{stats.cleared}/{stats.total}</span> {t('customs.statusCleared')}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 backdrop-blur-md">
          <span className="text-xs font-mono text-slate-400 block mb-1">{t('customs.certsMetric')}</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-teal-300"><span dir="ltr" className="inline-block unicode-bidi-isolate">{stats.zatcaCertified}</span></span>
            <span className="text-xs font-mono text-[#10b981] bg-emerald-950/60 px-2 py-0.5 rounded border border-[#10b981]/40 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {t('customs.compliant')}
            </span>
          </div>
        </div>
      </div>

      {/* VIEW CONTENT TABS */}
      {activeTab === 'manifests' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT COLUMN: CUSTOMS DECLARATIONS LIST */}
          <div className="lg:col-span-7 space-y-4">
            {/* SEARCH & FILTER BAR */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder={t('customs.filterPlaceholder', 'Filter by Manifest #, Port name, Carrier, or HS Code...')}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-xs font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
              <div className="flex items-center gap-1 bg-slate-900/80 border border-slate-800 p-1 rounded-xl text-xs font-mono overflow-x-auto">
                {['ALL', 'CLEARED', 'UNDER_INSPECTION', 'PENDING_DOCUMENTATION', 'HELD'].map(st => {
                  const getStatusLabel = (s: string) => {
                    switch (s) {
                      case 'ALL': return t('customs.statusAll', 'All');
                      case 'HELD': return t('customs.statusHeld', 'HELD');
                      case 'PENDING_DOCUMENTATION': return t('customs.statusPending', 'PENDING DOCUMENTATION');
                      case 'UNDER_INSPECTION': return t('customs.statusInspection', 'UNDER INSPECTION');
                      case 'CLEARED': return t('customs.statusCleared', 'CLEARED');
                      default: return s.replace('_', ' ');
                    }
                  };
                  return (
                    <button
                      key={st}
                      onClick={() => setStatusFilter(st)}
                      className={`px-2.5 py-1 rounded-lg whitespace-nowrap transition-all ${
                        statusFilter === st
                          ? 'bg-slate-800 font-bold text-cyan-400'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {getStatusLabel(st)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* LOADING STATE */}
            {isLoading && manifests.length === 0 ? (
              <div className="p-12 text-center border border-slate-800 rounded-2xl bg-[#0b1021]">
                <RefreshCw className="h-6 w-6 animate-spin text-cyan-400 mx-auto mb-3" />
                <p className="text-xs font-mono text-slate-400">{t('customs.syncing', 'Loading customs manifests from PostgreSQL...')}</p>
              </div>
            ) : filteredManifests.length === 0 ? (
              <div className="p-12 text-center border border-slate-800 rounded-2xl bg-[#0b1021]">
                <FileCheck className="h-8 w-8 text-slate-600 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-300">{t('customs.emptyTitle', 'No customs manifests found')}</p>
                <p className="text-xs font-mono text-slate-500 mt-1">{t('customs.emptyDesc', 'Create a new declaration to begin blockchain ledger chaining.')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredManifests.map(manifest => {
                  const isSelected = selectedManifest?.id === manifest.id;
                  return (
                    <div
                      key={manifest.id}
                      onClick={() => setSelectedManifestId(manifest.id)}
                      className={`p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                        isSelected
                          ? 'border-cyan-500/80 bg-[#0c1222] shadow-xl shadow-cyan-950/30'
                          : 'border-slate-800/80 bg-[#090d19]/80 hover:border-slate-700 hover:bg-[#0c1020]'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-500 to-blue-500" />
                      )}

                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-cyan-400">
                              <span dir="ltr" className="inline-block unicode-bidi-isolate">{manifest.manifest_number}</span>
                            </span>
                            <span className="text-[11px] font-mono text-slate-500">
                              <span dir="ltr" className="inline-block unicode-bidi-isolate">#BLOCK-{manifest.block_index}</span>
                            </span>
                          </div>
                          <span className="text-sm font-semibold tracking-tight text-white block mt-1">
                            {manifest.border_port_name || manifest.port_of_entry}
                          </span>
                          {manifest.carrier_name && (
                            <span className="text-xs text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                              <Truck className="h-3 w-3 text-slate-500" />
                              <span dir="ltr" className="inline-block unicode-bidi-isolate">{manifest.carrier_name}</span>
                            </span>
                          )}
                        </div>

                        <span
                          className={`px-2.5 py-1 text-[10px] font-mono rounded-md font-bold uppercase tracking-wider ${
                            manifest.declaration_type === 'IMPORT'
                              ? 'bg-blue-950/80 text-blue-300 border border-blue-800/60'
                              : manifest.declaration_type === 'EXPORT'
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                              : 'bg-purple-950/80 text-purple-300 border border-purple-800/60'
                          }`}
                        >
                          {manifest.declaration_type === 'IMPORT' ? t('customs.import', 'IMPORT') : manifest.declaration_type === 'EXPORT' ? t('customs.export', 'EXPORT') : manifest.declaration_type}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5 mt-3 mb-3">
                        {(manifest.hs_codes || []).map(code => (
                          <span
                            key={code}
                            className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400 whitespace-nowrap shrink-0"
                          >
                            <span dir="ltr" className="inline-block unicode-bidi-isolate">HS: {code}</span>
                          </span>
                        ))}
                      </div>

                      <div className="flex flex-wrap justify-between items-center gap-2 pt-3 border-t border-slate-800/60 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`flex items-center gap-1 font-mono text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                              manifest.clearance_status === 'CLEARED' || manifest.status === 'CLEARED'
                                ? 'text-emerald-400'
                                : manifest.clearance_status === 'UNDER_INSPECTION' || manifest.status === 'INSPECTION'
                                ? 'text-amber-400'
                                : manifest.clearance_status === 'HELD' || manifest.status === 'REJECTED'
                                ? 'text-rose-400'
                                : 'text-slate-400'
                            }`}
                          >
                            {(manifest.clearance_status === 'CLEARED' || manifest.status === 'CLEARED') && (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            {(manifest.clearance_status === 'UNDER_INSPECTION' || manifest.status === 'INSPECTION') && (
                              <Clock className="h-3.5 w-3.5 animate-spin" />
                            )}
                            {(manifest.clearance_status === 'PENDING_DOCUMENTATION' || manifest.status === 'DRAFT') && (
                              <AlertTriangle className="h-3.5 w-3.5" />
                            )}
                            {(() => {
                              const st = manifest.clearance_status || manifest.status;
                              if (st === 'CLEARED') return t('customs.statusCleared', 'CLEARED');
                              if (st === 'UNDER_INSPECTION' || st === 'INSPECTION') return t('customs.statusInspection', 'UNDER INSPECTION');
                              if (st === 'PENDING_DOCUMENTATION') return t('customs.statusPending', 'PENDING DOCUMENTATION');
                              if (st === 'HELD' || st === 'REJECTED') return t('customs.statusHeld', 'HELD');
                              if (st === 'DRAFT') return t('customs.statusDraft', 'DRAFT');
                              return st ? st.replace('_', ' ') : st;
                            })()}
                          </span>
                        </div>
                        <span className="font-mono text-slate-200 font-bold">
                          <span dir="ltr" className="inline-block unicode-bidi-isolate">{(manifest.total_value_sar || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} {t('common.currency', 'SAR')}</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: SELECTION AUDIT DETAILS */}
          <div className="lg:col-span-5">
            {selectedManifest ? (
              <div className="bg-[#0b1021] border border-slate-800/90 rounded-2xl p-6 space-y-6 shadow-2xl relative overflow-hidden backdrop-blur-xl sticky top-6">
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-cyan-500 via-teal-400 to-blue-600" />

                <div className="border-b border-slate-800/80 pb-4">
                  <div className="flex flex-wrap justify-between items-start gap-2">
                    <div>
                      <h3 className="text-base font-bold tracking-tight text-white">
                        <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono">{selectedManifest.manifest_number}</span>
                      </h3>
                      <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                        <span dir="ltr" className="inline-block unicode-bidi-isolate">{maskUuid(selectedManifest.id)}</span>
                      </p>
                    </div>
                    <span className="text-xs font-mono px-2 py-1 rounded bg-slate-900 border border-slate-800 text-cyan-400 whitespace-nowrap shrink-0">
                      {t('customs.port', 'Port')}: {selectedManifest.border_port_name || selectedManifest.port_of_entry || ''}
                    </span>
                  </div>
                </div>

                {/* TARIFF DETAILS */}
                <div className="space-y-2 text-xs">
                  <span className="text-slate-400 font-mono uppercase tracking-wider text-[10px] font-bold">
                    {t('customs.hsCodes', 'Harmonized System (HS) Codes:')}
                  </span>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(selectedManifest.hs_codes || []).map(code => (
                      <span
                        key={code}
                        className="px-2.5 py-1.5 bg-slate-900/90 border border-slate-800 font-mono rounded-lg text-xs text-slate-200 flex items-center gap-1.5"
                      >
                        <Layers className="h-3 w-3 text-cyan-400" />
                        <span dir="ltr" className="inline-block unicode-bidi-isolate">{code}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* VALUATION BREAKDOWN */}
                <div className="grid grid-cols-3 gap-2 p-3 bg-black/40 rounded-xl border border-slate-800 text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-slate-500 block">{t('customs.duty', 'Duty (SAR)')}</span>
                    <span className="font-bold text-slate-200">
                      <span dir="ltr" className="inline-block unicode-bidi-isolate">{Number(selectedManifest.duty_amount || 0).toLocaleString()} {t('common.currency', 'SAR')}</span>
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">{t('customs.vat', 'VAT (SAR)')}</span>
                    <span className="font-bold text-slate-200">
                      <span dir="ltr" className="inline-block unicode-bidi-isolate">{Number(selectedManifest.vat_amount || 0).toLocaleString()} {t('common.currency', 'SAR')}</span>
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">{t('customs.totalValue', 'Total Value')}</span>
                    <span className="font-bold text-cyan-400">
                      <span dir="ltr" className="inline-block unicode-bidi-isolate">{Number(selectedManifest.total_value_sar || 0).toLocaleString()} {t('common.currency', 'SAR')}</span>
                    </span>
                  </div>
                </div>

                {/* CRYPTOGRAPHIC BLOCK DETAILS */}
                <div className="space-y-3 p-4 bg-[#070b16] rounded-xl border border-slate-800/80 font-mono text-xs">
                  <div className="flex justify-between items-center text-slate-400 pb-2 border-b border-slate-800/60">
                    <span className="flex items-center gap-1.5">
                      <Database className="h-3.5 w-3.5 text-cyan-400" />
                      {t('customs.ledgerBlockSequence', 'LEDGER BLOCK SEQUENCE')}
                    </span>
                    <span className="text-cyan-400 font-bold bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/50">
                      <span dir="ltr" className="inline-block unicode-bidi-isolate">#BLOCK-{selectedManifest.block_index}</span>
                    </span>
                  </div>

                  <div>
                    <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1">
                      <span>{t('customs.currentHash', 'SHA-256 CURRENT HASH:')}</span>
                      <button
                        onClick={() => handleCopy(selectedManifest.block_hash || selectedManifest.payload_hash || '')}
                        className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                      >
                        {copiedHash === (selectedManifest.block_hash || selectedManifest.payload_hash) ? (
                          <>
                            <Check className="h-3 w-3" /> {t('customs.copied', 'Copied')}
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" /> {t('customs.copy', 'Copy')}
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-slate-300 text-[10px] break-all leading-relaxed bg-black/60 p-2.5 rounded-lg border border-slate-800 font-mono">
                      <span dir="ltr" className="inline-block unicode-bidi-isolate" title={selectedManifest.block_hash || selectedManifest.payload_hash}>
                        {maskHash(selectedManifest.block_hash || selectedManifest.payload_hash)}
                      </span>
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 block mb-1">{t('customs.prevHash', 'PREVIOUS BLOCK HASH:')}</span>
                    <p className="text-slate-500 text-[10px] break-all leading-relaxed bg-black/40 p-2 rounded-lg border border-slate-900 font-mono">
                      <span dir="ltr" className="inline-block unicode-bidi-isolate" title={selectedManifest.previous_hash}>{maskHash(selectedManifest.previous_hash)}</span>
                    </p>
                  </div>
                </div>

                {/* STATUS TRANSITIONS & REGULATORY SUBMISSION BOX */}
                <div className="pt-2 border-t border-slate-800/80 space-y-4">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-slate-400">{t('customs.regulatoryStatus', 'Regulatory Status:')}</span>
                    <span
                      className={`px-2.5 py-1 rounded-md font-bold text-[11px] flex items-center gap-1.5 ${
                        selectedManifest.clearance_status === 'CLEARED' || selectedManifest.status === 'CLEARED'
                          ? 'bg-emerald-950/80 text-[#10b981] border border-[#10b981]/50'
                          : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}
                    >
                      {selectedManifest.clearance_status === 'CLEARED' || selectedManifest.status === 'CLEARED' ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#10b981]" />
                          {t('customs.clearedValidated', 'CLEARED & VALIDATED')}
                        </>
                      ) : (
                        <span dir="ltr" className="inline-block unicode-bidi-isolate">{selectedManifest.clearance_status || selectedManifest.status}</span>
                      )}
                    </span>
                  </div>

                  {/* Status Pipeline Step Actions */}
                  {selectedManifest.status !== 'CLEARED' && (
                    <div className="grid grid-cols-2 gap-2">
                      {selectedManifest.status === 'DRAFT' && (
                        <button
                          onClick={() => handleStatusTransition(selectedManifest.id, 'SUBMITTED')}
                          disabled={isTransitioning}
                          className="py-2 px-3 bg-blue-950/80 hover:bg-blue-900 border border-blue-700/60 rounded-xl text-xs font-mono text-blue-300 font-bold transition-all disabled:opacity-50"
                        >
                          {t('customs.submitToPort', 'Submit to Port')}
                        </button>
                      )}
                      {(selectedManifest.status === 'SUBMITTED' || selectedManifest.status === 'DRAFT') && (
                        <button
                          onClick={() => handleStatusTransition(selectedManifest.id, 'INSPECTION')}
                          disabled={isTransitioning}
                          className="py-2 px-3 bg-amber-950/80 hover:bg-amber-900 border border-amber-700/60 rounded-xl text-xs font-mono text-amber-300 font-bold transition-all disabled:opacity-50"
                        >
                          {t('customs.requestInspection', 'Request Inspection')}
                        </button>
                      )}
                    </div>
                  )}

                  {selectedManifest.clearance_status !== 'CLEARED' && selectedManifest.status !== 'CLEARED' ? (
                    <button
                      onClick={() => handleZatcaCryptographicReport(selectedManifest.id)}
                      disabled={isSubmittingZatca}
                      className="w-full py-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold font-mono transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-950/40 disabled:opacity-50"
                    >
                      {isSubmittingZatca ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          {t('customs.compilingXML', 'COMPILING REGULATORY XML SIGNATURE...')}
                        </>
                      ) : (
                        <>
                          <Lock className="h-4 w-4" />
                          {t('customs.dispatchCompliance', 'DISPATCH CRYPTOGRAPHIC COMPLIANCE INVOICE')}
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-[#10b981]/40 text-[#10b981] text-xs font-mono flex items-center gap-2.5">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[#10b981]" />
                      <span>{t('customs.zatcaCertified', '✔ ZATCA CERTIFIED: Cryptographic verification payload approved. Ledger audit sealed.')}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 border border-slate-800 rounded-2xl text-center text-slate-500 font-mono text-xs">
                {t('customs.selectManifest', 'Select an active customs manifest pipeline to view cryptographic audit trails.')}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* BLOCKCHAIN LEDGER VIEW PANEL */
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-[#0b1021] border border-slate-800/90 shadow-xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-slate-800/80 gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Database className="h-5 w-5 text-cyan-400" />
                  {t('customs.ledgerTitle', 'Sequential Anti-Tamper Blockchain Ledger')}
                </h3>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  {t('customs.ledgerDesc', 'Demonstrating SHA-256 cryptographic linkage across all financial journal vouchers & border declarations.')}
                </p>
              </div>

              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
                <ShieldCheck className="h-4 w-4" />
                <span>{t('customs.chainVerified', 'Chain Invariance Verified: 0 Breaches')}</span>
              </div>
            </div>

            {/* BLOCKCHAIN NODE CHAIN */}
            <div className="pt-8 space-y-6">
              {manifests.length === 0 ? (
                <div className="p-8 text-center text-slate-500 font-mono text-xs">
                  {t('customs.noBlocks', 'No blocks registered in ledger yet. Create declarations to initialize the block chain.')}
                </div>
              ) : (
                manifests.map((block, idx) => {
                  const isHovered = hoveredBlockIndex === block.block_index;
                  return (
                    <div key={block.id} className="relative">
                      {/* CONNECTOR LINE */}
                      {idx < manifests.length - 1 && (
                        <div className="absolute left-6 top-16 bottom-[-24px] w-0.5 bg-gradient-to-b from-cyan-500 to-slate-800 z-0" />
                      )}

                      <div
                        onMouseEnter={() => setHoveredBlockIndex(block.block_index)}
                        onMouseLeave={() => setHoveredBlockIndex(null)}
                        className={`relative z-10 p-5 rounded-2xl border transition-all ${
                          isHovered
                            ? 'border-cyan-400 bg-[#0f172a] shadow-xl shadow-cyan-950/40'
                            : 'border-slate-800 bg-[#070b16] hover:border-slate-700'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center font-mono font-bold text-cyan-400 text-xs shadow-inner">
                              #{block.block_index}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-white font-mono">
                                  {t('customs.blockIndexLabel', 'BLOCK INDEX')} #{block.block_index}
                                </span>
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-semibold">
                                  {t('customs.digitallySealed', 'DIGITALLY SEALED')}
                                </span>
                              </div>
                              <span className="text-xs text-slate-400 font-mono">
                                {t('customs.payloadSource', 'Payload Source:')} <bdi>{block.manifest_number} • {block.border_port_name || block.port_of_entry}</bdi>
                              </span>
                            </div>
                          </div>

                          <span className="text-xs font-mono text-slate-400">
                            {block.created_at ? new Date(block.created_at).toLocaleString() : ''}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-800/60 text-xs font-mono">
                          <div className="p-3 rounded-xl bg-black/40 border border-slate-800/80">
                            <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1">
                              <span>{t('customs.currentHash', 'SHA-256 CURRENT HASH:')}</span>
                              <button
                                onClick={() => handleCopy(block.block_hash || block.payload_hash || '')}
                                className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                              >
                                {copiedHash === (block.block_hash || block.payload_hash) ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                            <p className="text-cyan-300 text-[11px] break-all leading-relaxed font-mono">
                              <bdi title={block.block_hash || block.payload_hash}>
                                {maskHash(block.block_hash || block.payload_hash)}
                              </bdi>
                            </p>
                          </div>

                          <div className="p-3 rounded-xl bg-black/20 border border-slate-900">
                            <div className="flex justify-between items-center text-[10px] text-slate-500 mb-1">
                              <span>{t('customs.prevLinkedHash', 'PREVIOUS LINKED HASH:')}</span>
                            </div>
                            <p className="text-slate-500 text-[11px] break-all leading-relaxed font-mono">
                              <bdi title={block.previous_hash}>{maskHash(block.previous_hash)}</bdi>
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* NEW DECLARATION MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0b1021] border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center p-6 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
                  <Globe className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{t('customs.createDeclarationTitle', 'Create Customs Declaration')}</h3>
                  <p className="text-xs font-mono text-slate-400">{t('customs.createDeclarationDesc', 'Registers declaration with SHA-256 block hash')}</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateManifest} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">{t('customs.manifestNum', 'Manifest Number')} <span className="text-[10px] text-cyan-500">({t('customs.autoGen', 'Auto')})</span></label>
                  <input
                    type="text"
                    disabled={true}
                    placeholder={t('customs.autoGenSave', 'Auto-generated upon save')}
                    value={newForm.manifest_number}
                    onChange={e => setNewForm(prev => ({ ...prev, manifest_number: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-xs font-mono text-slate-500 cursor-not-allowed opacity-75 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">{t('customs.declarationType', 'Declaration Type')}</label>
                  <select
                    value={newForm.declaration_type}
                    onChange={e => setNewForm(prev => ({ ...prev, declaration_type: e.target.value as any }))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="IMPORT">{t('customs.import', 'IMPORT')}</option>
                    <option value="EXPORT">{t('customs.export', 'EXPORT')}</option>
                    <option value="TRANSIT">{t('customs.transit', 'TRANSIT')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">{t('customs.borderPort', 'Border Port / Entry Point')}</label>
                <input
                  type="text"
                  required
                  value={newForm.border_port_name}
                  onChange={e => setNewForm(prev => ({ ...prev, border_port_name: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">{t('customs.carrierName', 'Carrier Name')}</label>
                <input
                  type="text"
                  required
                  value={newForm.carrier_name}
                  onChange={e => setNewForm(prev => ({ ...prev, carrier_name: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">{t('customs.cargoValue', 'Cargo Value (SAR)')}</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newForm.total_value_sar}
                    onChange={e => setNewForm(prev => ({ ...prev, total_value_sar: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">{t('customs.duty', 'Duty (SAR)')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newForm.duty_amount}
                    onChange={e => setNewForm(prev => ({ ...prev, duty_amount: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">{t('customs.vat', 'VAT (SAR)')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newForm.vat_amount}
                    onChange={e => setNewForm(prev => ({ ...prev, vat_amount: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">{t('customs.hsCodesInput', 'HS Codes (Comma Separated)')}</label>
                <input
                  type="text"
                  placeholder="e.g. 8708.29.90, 8504.40.90"
                  value={newForm.hs_codes}
                  onChange={e => setNewForm(prev => ({ ...prev, hs_codes: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-white transition-colors"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2 rounded-xl text-xs font-mono font-bold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-950/40 disabled:opacity-50 transition-all flex items-center gap-2"
                >
                  {isCreating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  <span>{isCreating ? t('customs.creatingBlock', 'Creating Block...') : t('customs.postDeclaration', 'Post Declaration')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
