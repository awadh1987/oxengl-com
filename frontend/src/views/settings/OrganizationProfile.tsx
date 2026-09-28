import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Building2,
  GitFork,
  DollarSign,
  ShoppingCart,
  Plus,
  Search,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Layers,
  Trash2,
  Edit3,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Filter,
  Shield,
  FolderTree,
  Building,
  Sparkles,
  Info,
  ExternalLink,
  ChevronUp,
  Globe,
  X,
  Palette,
} from 'lucide-react';
import { HoverIcon } from '../../components/common/HoverIcon';
import { CustomDomainWizard } from '../../components/platform/CustomDomainWizard';
import { TenantBrandingCustomizer } from '../../components/settings/TenantBrandingCustomizer';
import { useApp } from '../../context/AppContext';
import {
  erpApi,
  OrgTreeNode,
  OrgCostCenter,
  OrgPurchasingOrg,
  CreateBranchPayload,
  CreateCostCenterPayload,
  CreatePurchasingOrgPayload,
} from '../../services/api';

// Modal types
type ModalType = 'add_branch' | 'add_cost_center' | 'add_purchasing_org' | 'edit_branch' | null;

interface ModalTarget {
  companyId: string;
  companyName: string;
  isRoot?: boolean;
}

export const OrganizationProfile: React.FC = () => {
  const { language, themeMode, currentCompany, currentUser, showToast } = useApp();
  const isAr = language === 'ar';
  const isDark = themeMode === 'dark';

  // State
  const [treeData, setTreeData] = useState<OrgTreeNode[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [activeTabFilter, setActiveTabFilter] = useState<'all' | 'branches' | 'cost_centers' | 'purchasing_orgs' | 'custom_domains' | 'branding'>('all');

  // Modal states
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [modalTarget, setModalTarget] = useState<ModalTarget | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form inputs
  const [branchForm, setBranchForm] = useState<CreateBranchPayload>({
    name: '',
    slug: '',
    currency: 'SAR',
    is_active: true,
  });
  const [costCenterForm, setCostCenterForm] = useState<{
    code: string;
    name: string;
    description: string;
    is_active: boolean;
  }>({
    code: '',
    name: '',
    description: '',
    is_active: true,
  });
  const [purchasingOrgForm, setPurchasingOrgForm] = useState<{
    code: string;
    name: string;
    currency: string;
    is_active: boolean;
  }>({
    code: '',
    name: '',
    currency: 'SAR',
    is_active: true,
  });

  const isSuperAdmin = currentUser?.role === 'Super_Admin';
  const isAdmin = currentUser?.role === 'Admin' || isSuperAdmin;

  // 1. Fetch organizational tree
  const fetchTree = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    else setIsRefreshing(true);
    setModalError(null);

    try {
      const data = await erpApi.getOrgTree();
      setTreeData(data || []);

      // Auto-expand all top-level roots by default
      if (data && data.length > 0) {
        setExpandedNodes((prev) => {
          const next = { ...prev };
          const expandRecursive = (nodes: OrgTreeNode[]) => {
            nodes.forEach((n) => {
              if (next[n.id] === undefined) {
                next[n.id] = true; // Default expanded
              }
              if (n.branches && n.branches.length > 0) {
                expandRecursive(n.branches);
              }
            });
          };
          expandRecursive(data);
          return next;
        });
      }
    } catch (err: any) {
      console.error('Failed to load organization tree:', err);
      showToast?.(
        isAr ? 'فشل تحميل الهيكل التنظيمي للمنشأة' : 'Failed to load organizational structure tree',
        'error'
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isAr, showToast]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  // Expand / Collapse toggling
  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  const handleExpandAll = () => {
    const next: Record<string, boolean> = {};
    const recurse = (nodes: OrgTreeNode[]) => {
      nodes.forEach((n) => {
        next[n.id] = true;
        if (n.branches) recurse(n.branches);
      });
    };
    recurse(treeData);
    setExpandedNodes(next);
  };

  const handleCollapseAll = () => {
    setExpandedNodes({});
  };

  // Flattened companies list for modal dropdowns
  const allCompaniesList = useMemo(() => {
    const list: { id: string; name: string; org_type: string }[] = [];
    const traverse = (nodes: OrgTreeNode[]) => {
      nodes.forEach((n) => {
        list.push({ id: n.id, name: n.name, org_type: n.org_type });
        if (n.branches) traverse(n.branches);
      });
    };
    traverse(treeData);
    return list;
  }, [treeData]);

  // Aggregate stats across the hierarchy
  const stats = useMemo(() => {
    let companyCodes = 0;
    let branches = 0;
    let costCenters = 0;
    let purchasingOrgs = 0;

    const countRecursive = (nodes: OrgTreeNode[]) => {
      nodes.forEach((n) => {
        if (n.org_type === 'company_code') companyCodes++;
        else branches++;
        costCenters += (n.cost_centers || []).length;
        purchasingOrgs += (n.purchasing_organizations || []).length;
        if (n.branches) countRecursive(n.branches);
      });
    };
    countRecursive(treeData);
    return { companyCodes, branches, costCenters, purchasingOrgs };
  }, [treeData]);

  // Open modals
  const openAddBranchModal = (target: ModalTarget) => {
    setModalTarget(target);
    setBranchForm({
      name: '',
      slug: '',
      parent_id: target.companyId,
      currency: 'SAR',
      is_active: true,
    });
    setModalError(null);
    setActiveModal('add_branch');
  };

  const openAddCostCenterModal = (target: ModalTarget) => {
    setModalTarget(target);
    setCostCenterForm({
      code: '',
      name: '',
      description: '',
      is_active: true,
    });
    setModalError(null);
    setActiveModal('add_cost_center');
  };

  const openAddPurchasingOrgModal = (target: ModalTarget) => {
    setModalTarget(target);
    setPurchasingOrgForm({
      code: '',
      name: '',
      currency: 'SAR',
      is_active: true,
    });
    setModalError(null);
    setActiveModal('add_purchasing_org');
  };

  const closeModal = () => {
    setActiveModal(null);
    setModalTarget(null);
    setModalError(null);
  };

  // Submit Add Branch
  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchForm.name.trim()) {
      setModalError(isAr ? 'يرجى إدخال اسم الفرع / المصنع' : 'Branch / Plant name is required');
      return;
    }
    setIsSubmitting(true);
    setModalError(null);
    try {
      await erpApi.createOrgCompany({
        ...branchForm,
        parent_id: modalTarget?.companyId || null,
      });
      showToast?.(
        isAr ? 'تم إنشاء الفرع بنجاح' : 'Operational branch provisioned successfully',
        'success'
      );
      closeModal();
      await fetchTree(true);
    } catch (err: any) {
      setModalError(err.message || (isAr ? 'فشل إنشاء الفرع' : 'Failed to provision branch'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Add Cost Center
  const handleCreateCostCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!costCenterForm.code.trim() || !costCenterForm.name.trim()) {
      setModalError(isAr ? 'الكود والاسم مطلوبان' : 'Cost center code and name are required');
      return;
    }
    if (!modalTarget?.companyId) {
      setModalError(isAr ? 'يرجى تحديد الفرع التابع له' : 'Target branch is required');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);
    try {
      await erpApi.createCostCenter({
        company_id: modalTarget.companyId,
        code: costCenterForm.code.trim().toUpperCase(),
        name: costCenterForm.name.trim(),
        description: costCenterForm.description.trim() || undefined,
        is_active: costCenterForm.is_active,
      });
      showToast?.(
        isAr ? 'تم إضافة مركز التكلفة بنجاح' : 'Cost Center created successfully',
        'success'
      );
      closeModal();
      await fetchTree(true);
    } catch (err: any) {
      setModalError(
        err.message || (isAr ? 'فشل إنشاء مركز التكلفة' : 'Failed to create cost center')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Add Purchasing Org
  const handleCreatePurchasingOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchasingOrgForm.code.trim() || !purchasingOrgForm.name.trim()) {
      setModalError(isAr ? 'الكود والاسم مطلوبان' : 'Purchasing org code and name are required');
      return;
    }
    if (!modalTarget?.companyId) {
      setModalError(isAr ? 'يرجى تحديد الفرع التابع له' : 'Target branch is required');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);
    try {
      await erpApi.createPurchasingOrg({
        company_id: modalTarget.companyId,
        code: purchasingOrgForm.code.trim().toUpperCase(),
        name: purchasingOrgForm.name.trim(),
        currency: purchasingOrgForm.currency || 'SAR',
        is_active: purchasingOrgForm.is_active,
      });
      showToast?.(
        isAr ? 'تم إضافة منظمة المشتريات بنجاح' : 'Purchasing Organization created successfully',
        'success'
      );
      closeModal();
      await fetchTree(true);
    } catch (err: any) {
      setModalError(
        err.message || (isAr ? 'فشل إنشاء منظمة المشتريات' : 'Failed to create purchasing org')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Handlers
  const handleDeleteCostCenter = async (id: string, name: string) => {
    if (
      !window.confirm(
        isAr
          ? `هل أنت متأكد من حذف مركز التكلفة "${name}"؟`
          : `Are you sure you want to delete Cost Center "${name}"?`
      )
    ) {
      return;
    }
    try {
      await erpApi.deleteCostCenter(id);
      showToast?.(isAr ? 'تم حذف مركز التكلفة' : 'Cost center deleted successfully', 'success');
      await fetchTree(true);
    } catch (err: any) {
      showToast?.(err.message || (isAr ? 'تعذر حذف مركز التكلفة' : 'Failed to delete cost center'), 'error');
    }
  };

  const handleDeletePurchasingOrg = async (id: string, name: string) => {
    if (
      !window.confirm(
        isAr
          ? `هل أنت متأكد من حذف منظمة المشتريات "${name}"؟`
          : `Are you sure you want to delete Purchasing Organization "${name}"?`
      )
    ) {
      return;
    }
    try {
      await erpApi.deletePurchasingOrg(id);
      showToast?.(isAr ? 'تم حذف منظمة المشتريات' : 'Purchasing organization deleted successfully', 'success');
      await fetchTree(true);
    } catch (err: any) {
      showToast?.(
        err.message || (isAr ? 'تعذر حذف منظمة المشتريات' : 'Failed to delete purchasing org'),
        'error'
      );
    }
  };

  const handleDeleteBranch = async (id: string, name: string) => {
    if (
      !window.confirm(
        isAr
          ? `هل أنت متأكد من حذف الفرع "${name}"؟ يجب أن لا يحتوي على فروع فرعية.`
          : `Are you sure you want to delete Branch "${name}"? It must not contain sub-branches.`
      )
    ) {
      return;
    }
    try {
      await erpApi.deleteOrgCompany(id);
      showToast?.(isAr ? 'تم حذف الفرع بنجاح' : 'Branch de-provisioned successfully', 'success');
      await fetchTree(true);
    } catch (err: any) {
      showToast?.(err.message || (isAr ? 'تعذر حذف الفرع' : 'Failed to delete branch'), 'error');
    }
  };

  // Recursive Tree Node Renderer
  const renderTreeNode = (node: OrgTreeNode, depth = 0) => {
    const isExpanded = !!expandedNodes[node.id];
    const isRoot = node.org_type === 'company_code';
    const hasChildren =
      (node.branches && node.branches.length > 0) ||
      (node.cost_centers && node.cost_centers.length > 0) ||
      (node.purchasing_organizations && node.purchasing_organizations.length > 0);

    const matchesSearch =
      !searchTerm ||
      node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (node.cost_centers || []).some(
        (c) =>
          c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.name.toLowerCase().includes(searchTerm.toLowerCase())
      ) ||
      (node.purchasing_organizations || []).some(
        (p) =>
          p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.name.toLowerCase().includes(searchTerm.toLowerCase())
      );

    if (!matchesSearch && searchTerm) return null;

    const filteredCostCenters = (node.cost_centers || []).filter(
      (cc) =>
        !searchTerm ||
        cc.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cc.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredPurchasingOrgs = (node.purchasing_organizations || []).filter(
      (po) =>
        !searchTerm ||
        po.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        po.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div
        key={node.id}
        className={`relative transition-all duration-200 ${
          depth > 0 ? (isAr ? 'mr-4 sm:mr-8 border-r-2 pr-3' : 'ml-4 sm:ml-8 border-l-2 pl-3') : 'mb-6'
        } ${isDark ? 'border-slate-800' : 'border-slate-200'}`}
      >
        {/* Node Card Header */}
        <div
          className={`group rounded-xl p-4 transition-all duration-150 border ${
            isRoot
              ? isDark
                ? 'bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border-indigo-700/50 shadow-lg shadow-indigo-950/20'
                : 'bg-gradient-to-r from-white via-indigo-50/50 to-white border-indigo-200 shadow-md'
              : isDark
              ? 'bg-[#12182d] hover:bg-[#161f3d] border-slate-800 hover:border-slate-700'
              : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left: Expander & Entity Info */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => toggleNode(node.id)}
                className={`group flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  isDark
                    ? 'border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300'
                    : 'border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
                title={isExpanded ? (isAr ? 'طي' : 'Collapse') : isAr ? 'توسيع' : 'Expand'}
              >
                {isExpanded ? (
                  <HoverIcon className="h-4 w-4">
                    <ChevronDown className="h-full w-full" />
                  </HoverIcon>
                ) : (
                  <HoverIcon className="h-4 w-4">
                    <ChevronRight className={`h-full w-full ${isAr ? 'rotate-180' : ''}`} />
                  </HoverIcon>
                )}
              </button>

              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold ${
                  isRoot
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-teal-600/20 text-teal-400 border border-teal-500/30'
                }`}
              >
                {isRoot ? <Building2 className="h-5 w-5" /> : <GitFork className="h-5 w-5" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3
                    className={`font-black text-base truncate ${
                      isDark ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {node.name}
                  </h3>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      isRoot
                        ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                        : 'bg-teal-500/10 text-teal-400 border border-teal-500/30'
                    }`}
                  >
                    {isRoot
                      ? isAr
                        ? 'الكيان القانوني الرئيسي (Company Code)'
                        : 'Company Code (Legal Entity)'
                      : isAr
                      ? 'فرع تشغيلي / مصنع (Plant)'
                      : 'Operational Branch (Plant)'}
                  </span>
                  <span
                    className={`text-[11px] font-mono px-1.5 py-0.5 rounded text-slate-400 ${
                      isDark ? 'bg-slate-800' : 'bg-slate-100'
                    }`}
                  >
                    {node.currency}
                  </span>
                  {!node.is_active && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                      {isAr ? 'غير نشط' : 'Inactive'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-400 mt-0.5 font-mono">
                  <span>slug: {node.slug}</span>
                  <span>id: {node.id.slice(0, 8)}...</span>
                </div>
              </div>
            </div>

            {/* Right: Quick Counts & Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Badges for counts */}
              <div className="hidden sm:flex items-center gap-1.5 text-xs">
                {(node.branches || []).length > 0 && (
                  <span
                    className={`px-2 py-1 rounded-md font-medium ${
                      isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {node.branches.length} {isAr ? 'فروع' : 'Branches'}
                  </span>
                )}
                {(node.cost_centers || []).length > 0 && (
                  <span className="px-2 py-1 rounded-md font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {node.cost_centers.length} {isAr ? 'مراكز تكلفة' : 'Cost Centers'}
                  </span>
                )}
                {(node.purchasing_organizations || []).length > 0 && (
                  <span className="px-2 py-1 rounded-md font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    {node.purchasing_organizations.length} {isAr ? 'منظمات شراء' : 'Purchasing Orgs'}
                  </span>
                )}
              </div>

              {/* Action Buttons for Super Admin / Admin */}
              {isAdmin && (
                <div className="flex items-center gap-1.5">
                  {/* Add Branch */}
                  <button
                    type="button"
                    onClick={() =>
                      openAddBranchModal({
                        companyId: node.id,
                        companyName: node.name,
                        isRoot,
                      })
                    }
                    className={`group flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors border ${
                      isDark
                        ? 'border-teal-700/60 bg-teal-950/40 hover:bg-teal-900/60 text-teal-300'
                        : 'border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800'
                    }`}
                    title={isAr ? 'إضافة فرع تشغيلي جديد تحت هذا الكيان' : 'Add Child Branch'}
                  >
                    <HoverIcon className="h-3.5 w-3.5">
                      <Plus className="h-full w-full" />
                    </HoverIcon>
                    <span>{isAr ? 'فرع' : 'Branch'}</span>
                  </button>

                  {/* Add Cost Center */}
                  <button
                    type="button"
                    onClick={() =>
                      openAddCostCenterModal({
                        companyId: node.id,
                        companyName: node.name,
                        isRoot,
                      })
                    }
                    className={`group flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors border ${
                      isDark
                        ? 'border-emerald-700/60 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300'
                        : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                    }`}
                    title={isAr ? 'إضافة مركز تكلفة مالي' : 'Add Cost Center'}
                  >
                    <HoverIcon className="h-3.5 w-3.5">
                      <Plus className="h-full w-full" />
                    </HoverIcon>
                    <span>{isAr ? 'مركز تكلفة' : 'Cost Center'}</span>
                  </button>

                  {/* Add Purchasing Org */}
                  <button
                    type="button"
                    onClick={() =>
                      openAddPurchasingOrgModal({
                        companyId: node.id,
                        companyName: node.name,
                        isRoot,
                      })
                    }
                    className={`group flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors border ${
                      isDark
                        ? 'border-purple-700/60 bg-purple-950/40 hover:bg-purple-900/60 text-purple-300'
                        : 'border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-800'
                    }`}
                    title={isAr ? 'إضافة منظمة مشتريات وتوريد' : 'Add Purchasing Org'}
                  >
                    <HoverIcon className="h-3.5 w-3.5">
                      <Plus className="h-full w-full" />
                    </HoverIcon>
                    <span>{isAr ? 'منظمة مشتريات' : 'Purchasing Org'}</span>
                  </button>

                  {/* Delete branch (if not root) */}
                  {!isRoot && (
                    <button
                      type="button"
                      onClick={() => handleDeleteBranch(node.id, node.name)}
                      className="group p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title={isAr ? 'حذف الفرع' : 'Delete Branch'}
                    >
                      <HoverIcon className="h-4 w-4">
                        <Trash2 className="h-full w-full" />
                      </HoverIcon>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Collapsible Children Section */}
        {isExpanded && (
          <div className="mt-3 space-y-4">
            {/* 1. Cost Centers Grid under this node */}
            {(activeTabFilter === 'all' || activeTabFilter === 'cost_centers') &&
              filteredCostCenters.length > 0 && (
                <div
                  className={`rounded-xl p-3 border ${
                    isDark ? 'bg-slate-900/50 border-emerald-950/50' : 'bg-emerald-50/30 border-emerald-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-emerald-500/10">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-emerald-400" />
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                        {isAr ? 'مراكز التكلفة المالية' : 'Cost Centers (CO / Expenses)'}
                      </span>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded-full font-mono">
                        {filteredCostCenters.length}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {filteredCostCenters.map((cc) => (
                      <div
                        key={cc.id}
                        className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                          isDark
                            ? 'bg-[#101524] border-slate-800 hover:border-emerald-800/40'
                            : 'bg-white border-slate-200 hover:border-emerald-300'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-black text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              {cc.code}
                            </span>
                            <span
                              className={`text-xs font-bold truncate ${
                                isDark ? 'text-slate-200' : 'text-slate-800'
                              }`}
                            >
                              {cc.name}
                            </span>
                          </div>
                          {cc.description && (
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {cc.description}
                            </p>
                          )}
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCostCenter(cc.id, cc.name)}
                            className="group p-1 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                            title={isAr ? 'حذف مركز التكلفة' : 'Delete Cost Center'}
                          >
                            <HoverIcon className="h-3.5 w-3.5">
                              <Trash2 className="h-full w-full" />
                            </HoverIcon>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* 2. Purchasing Organizations Grid under this node */}
            {(activeTabFilter === 'all' || activeTabFilter === 'purchasing_orgs') &&
              filteredPurchasingOrgs.length > 0 && (
                <div
                  className={`rounded-xl p-3 border ${
                    isDark ? 'bg-slate-900/50 border-purple-950/50' : 'bg-purple-50/30 border-purple-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-purple-500/10">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-purple-400" />
                      <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                        {isAr ? 'منظمات المشتريات والتوريد' : 'Purchasing Organizations (Procurement / S2P)'}
                      </span>
                      <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.2 rounded-full font-mono">
                        {filteredPurchasingOrgs.length}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {filteredPurchasingOrgs.map((po) => (
                      <div
                        key={po.id}
                        className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                          isDark
                            ? 'bg-[#101524] border-slate-800 hover:border-purple-800/40'
                            : 'bg-white border-slate-200 hover:border-purple-300'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-black text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">
                              {po.code}
                            </span>
                            <span
                              className={`text-xs font-bold truncate ${
                                isDark ? 'text-slate-200' : 'text-slate-800'
                              }`}
                            >
                              {po.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 font-mono">
                            <span>{po.currency}</span>
                            <span>•</span>
                            <span className={po.is_active ? 'text-emerald-400' : 'text-red-400'}>
                              {po.is_active ? (isAr ? 'نشط' : 'Active') : isAr ? 'معطل' : 'Disabled'}
                            </span>
                          </div>
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeletePurchasingOrg(po.id, po.name)}
                            className="group p-1 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                            title={isAr ? 'حذف منظمة المشتريات' : 'Delete Purchasing Org'}
                          >
                            <HoverIcon className="h-3.5 w-3.5">
                              <Trash2 className="h-full w-full" />
                            </HoverIcon>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* 3. Nested Child Branches */}
            {(activeTabFilter === 'all' || activeTabFilter === 'branches') &&
              node.branches &&
              node.branches.length > 0 && (
                <div className="space-y-3">
                  {node.branches.map((b) => renderTreeNode(b, depth + 1))}
                </div>
              )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header & Title Banner */}
      <div
        className={`rounded-2xl p-6 border transition-all ${
          isDark
            ? 'bg-gradient-to-br from-[#0c1020] via-[#0f172a] to-[#0c1020] border-slate-800 shadow-xl'
            : 'bg-gradient-to-br from-white via-slate-50 to-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#F05627] to-orange-400 text-white shadow-lg shadow-orange-500/20">
              <FolderTree className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1
                  className={`text-2xl font-black tracking-tight ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {isAr
                    ? 'الهيكل التنظيمي للمنشأة وإدارة الكيانات'
                    : 'Enterprise Organizational Management'}
                </h1>
                <span className="text-xs font-mono font-bold bg-[#F05627]/10 text-[#F05627] border border-[#F05627]/30 px-2.5 py-0.5 rounded-full">
                  {isAr ? 'الهيكل المؤسسي' : 'Organizational Hierarchy'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-3xl leading-relaxed">
                {isAr
                  ? 'هيكلة وتوزيع الكيانات القانونية (Company Codes)، الفروع والمصانع التشغيلية (Plants)، ومراكز التكلفة (Cost Centers) ومنظمات الشراء (Purchasing Orgs) مع عزل أمني صارم بين الفروع.'
                  : 'Multi-tier enterprise-grade hierarchical modeling for Company Codes, Plants/Branches, Cost Centers, and Purchasing Organizations with real-time RBAC boundary isolation.'}
              </p>
            </div>
          </div>

          {/* Top Actions: Refresh, Expand/Collapse, Super Admin Provision */}
          <div className="flex items-center gap-2 self-stretch md:self-auto justify-end flex-wrap">
            <button
              type="button"
              onClick={handleExpandAll}
              className={`text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${
                isDark
                  ? 'border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
            >
              {isAr ? 'توسيع الكل' : 'Expand All'}
            </button>
            <button
              type="button"
              onClick={handleCollapseAll}
              className={`text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${
                isDark
                  ? 'border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
            >
              {isAr ? 'طي الكل' : 'Collapse All'}
            </button>
            <button
              type="button"
              onClick={() => fetchTree(true)}
              disabled={isRefreshing}
              className={`group flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl border transition-colors ${
                isDark
                  ? 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
              }`}
            >
              <HoverIcon className="h-3.5 w-3.5">
                <RefreshCw className={`h-full w-full ${isRefreshing ? 'animate-spin' : ''}`} />
              </HoverIcon>
              <span>{isAr ? 'تحديث' : 'Refresh'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTabFilter('branding')}
              className={`group flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl border transition-all ${
                activeTabFilter === 'branding'
                  ? 'border-[#F05627] bg-[#F05627] text-white shadow-md shadow-[#F05627]/20'
                  : isDark
                  ? 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
              }`}
            >
              <HoverIcon className="h-3.5 w-3.5">
                <Palette className="h-full w-full text-cyan-400 group-hover:text-white" />
              </HoverIcon>
              <span>{isAr ? 'تخصيص الهوية والشعار' : 'Branding & Theme'}</span>
            </button>

            {/* Super Admin Top-Level Company Code Creation */}
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() =>
                  openAddBranchModal({
                    companyId: '',
                    companyName: isAr ? 'كيان رئيسي جديد' : 'New Company Code',
                    isRoot: true,
                  })
                }
                className="group flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white shadow-md shadow-indigo-600/20 transition-all"
              >
                <HoverIcon className="h-4 w-4">
                  <Plus className="h-full w-full" />
                </HoverIcon>
                <span>{isAr ? 'إضافة كيان رئيسي (Company Code)' : 'Add Company Code'}</span>
              </button>
            )}
          </div>
        </div>

        {/* 2. KPI Summary Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800/40">
          <div
            className={`p-3.5 rounded-xl border ${
              isDark ? 'bg-indigo-950/20 border-indigo-900/30' : 'bg-indigo-50/50 border-indigo-100'
            }`}
          >
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold">
              <Building2 className="h-4 w-4" />
              <span>{isAr ? 'الكيانات القانونية' : 'Company Codes'}</span>
            </div>
            <p className="text-xl sm:text-2xl font-black mt-1 text-indigo-300 font-mono">
              {stats.companyCodes}
            </p>
          </div>

          <div
            className={`p-3.5 rounded-xl border ${
              isDark ? 'bg-teal-950/20 border-teal-900/30' : 'bg-teal-50/50 border-teal-100'
            }`}
          >
            <div className="flex items-center gap-2 text-teal-400 text-xs font-bold">
              <GitFork className="h-4 w-4" />
              <span>{isAr ? 'الفروع والمصانع' : 'Plants & Branches'}</span>
            </div>
            <p className="text-xl sm:text-2xl font-black mt-1 text-teal-300 font-mono">
              {stats.branches}
            </p>
          </div>

          <div
            className={`p-3.5 rounded-xl border ${
              isDark ? 'bg-emerald-950/20 border-emerald-900/30' : 'bg-emerald-50/50 border-emerald-100'
            }`}
          >
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
              <DollarSign className="h-4 w-4" />
              <span>{isAr ? 'مراكز التكلفة' : 'Cost Centers'}</span>
            </div>
            <p className="text-xl sm:text-2xl font-black mt-1 text-emerald-300 font-mono">
              {stats.costCenters}
            </p>
          </div>

          <div
            className={`p-3.5 rounded-xl border ${
              isDark ? 'bg-purple-950/20 border-purple-900/30' : 'bg-purple-50/50 border-purple-100'
            }`}
          >
            <div className="flex items-center gap-2 text-purple-400 text-xs font-bold">
              <ShoppingCart className="h-4 w-4" />
              <span>{isAr ? 'منظمات المشتريات' : 'Purchasing Orgs'}</span>
            </div>
            <p className="text-xl sm:text-2xl font-black mt-1 text-purple-300 font-mono">
              {stats.purchasingOrgs}
            </p>
          </div>
        </div>
      </div>

      {/* 3. Search & Category Filters Bar */}
      <div
        className={`flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-xl border ${
          isDark ? 'bg-[#0f1426] border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="relative w-full sm:w-80">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              isAr
                ? 'بحث بالاسم، الكود، المعرّف...'
                : 'Filter tree by name, code, slug...'
            }
            className={`w-full ps-9 pe-3 py-2 text-xs rounded-lg border outline-hidden transition-all ${
              isDark
                ? 'bg-slate-900 border-slate-700 text-white focus:border-indigo-500'
                : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-indigo-500'
            }`}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="group absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              title={isAr ? 'مسح البحث' : 'Clear search'}
            >
              <HoverIcon className="h-3.5 w-3.5">
                <X className="h-full w-full" />
              </HoverIcon>
            </button>
          )}
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {(
            [
              { id: 'all', labelAr: 'الكل', labelEn: 'All Elements' },
              { id: 'branches', labelAr: 'الفروع فقط', labelEn: 'Branches Only' },
              { id: 'cost_centers', labelAr: 'مراكز التكلفة', labelEn: 'Cost Centers' },
              { id: 'purchasing_orgs', labelAr: 'منظمات الشراء', labelEn: 'Purchasing Orgs' },
              { id: 'custom_domains', labelAr: 'النطاق المخصص وSSL', labelEn: 'Custom Domains & SSL' },
              { id: 'branding', labelAr: 'تخصيص الهوية والمظهر', labelEn: 'Tenant Branding & Theme' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabFilter(tab.id)}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                activeTabFilter === tab.id
                  ? 'bg-[#F05627] text-white shadow-xs'
                  : isDark
                  ? 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {isAr ? tab.labelAr : tab.labelEn}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Tenant Branding & Theme Shortcut Banner for All Elements View */}
      {activeTabFilter === 'all' && (
        <div
          className={`rounded-2xl p-4 sm:p-5 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all ${
            isDark
              ? 'bg-gradient-to-r from-[#090f1c] via-[#0d1527] to-[#090f1c] border-slate-800 shadow-md'
              : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-[#F05627]/10 border border-[#F05627]/30 text-[#F05627] shrink-0">
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs sm:text-sm font-bold text-slate-100">
                  {isAr ? 'تخصيص شعار ومظهر المنشأة' : 'Tenant Branding & Theme Customization'}
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
                  {isAr ? 'تخصيص الواجهة' : 'Branding'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 max-w-xl">
                {isAr
                  ? 'قم برفع شعار منشأتك وضبط ألوان السمة الرئيسية وخلفية القائمة الجانبية لتخصيص بيئة العمل والمستندات.'
                  : 'Upload corporate logo and adjust primary theme and dark sidebar accents for your workspace and official printouts.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTabFilter('branding')}
            className="group flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl bg-[#F05627] hover:bg-[#F05627]/90 text-white shadow-md shadow-[#F05627]/20 transition-all shrink-0 cursor-pointer"
          >
            <HoverIcon className="h-3.5 w-3.5">
              <Sparkles className="h-full w-full" />
            </HoverIcon>
            <span>{isAr ? 'تخصيص الشعار والمظهر ←' : 'Customize Branding & Theme →'}</span>
          </button>
        </div>
      )}

      {/* 4. Interactive Hierarchical Tree Container, Custom Domains Management, or Tenant Branding Customizer */}
      {activeTabFilter === 'custom_domains' ? (
        <CustomDomainWizard
          tenantId={currentCompany?.id || ''}
          tenantSlug={currentCompany?.slug || 'tenant'}
        />
      ) : activeTabFilter === 'branding' ? (
        <TenantBrandingCustomizer />
      ) : (
        <div
          className={`rounded-2xl p-4 sm:p-6 border min-h-[400px] ${
            isDark ? 'bg-[#090d1a] border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-3 border-indigo-500 border-t-transparent mb-3" />
              <p className="text-sm font-bold text-slate-400">
                {isAr ? 'جاري استرجاع الهيكل التنظيمي...' : 'Loading organizational hierarchy...'}
              </p>
            </div>
          ) : treeData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Building2 className="h-12 w-12 text-slate-600 mb-3" />
              <h3 className="text-base font-bold text-slate-300">
                {isAr ? 'لا توجد بيانات هيكل تنظيمي مسجلة' : 'No organizational entities found'}
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                {isAr
                  ? 'قم بإنشاء فرع أو مركز تكلفة لبدء تصميم الهيكل المؤسسي لشركتك.'
                  : 'Start provisioning Company Codes, Plants, and Cost Centers to establish your ERP structure.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {treeData.map((node) => renderTreeNode(node, 0))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL: Add Branch / Plant                                              */}
      {/* ========================================================================= */}
      {activeModal === 'add_branch' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div
            className={`w-full max-w-lg rounded-2xl p-6 border shadow-2xl transition-all ${
              isDark ? 'bg-[#0e1428] border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <GitFork className="h-5 w-5 text-teal-400" />
                <h3 className="text-base font-bold">
                  {modalTarget?.isRoot && !modalTarget.companyId
                    ? isAr
                      ? 'إضافة كيان رئيسي جديد (Company Code)'
                      : 'Create Root Company Code'
                    : isAr
                    ? `إضافة فرع / مصنع جديد تحت: ${modalTarget?.companyName}`
                    : `Add Branch / Plant under: ${modalTarget?.companyName}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="group text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
                title={isAr ? 'إغلاق' : 'Close'}
              >
                <HoverIcon className="h-4 w-4">
                  <X className="h-full w-full" />
                </HoverIcon>
              </button>
            </div>

            {modalError && (
              <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateBranch} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  {isAr ? 'اسم الفرع / الكيان *' : 'Branch / Entity Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={branchForm.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const slug = name
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-|-$/g, '');
                    setBranchForm((prev) => ({
                      ...prev,
                      name,
                      slug: prev.slug ? prev.slug : slug,
                    }));
                  }}
                  placeholder={
                    isAr ? 'مثال: مصنع الرياض للخرسانة' : 'e.g., Riyadh Concrete Plant #2'
                  }
                  className={`w-full px-3 py-2 text-xs rounded-xl border outline-hidden transition-all ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 focus:border-teal-500 text-white'
                      : 'bg-slate-50 border-slate-300 focus:border-teal-500 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  {isAr ? 'المعرّف المختصر (Slug)' : 'Unique Slug identifier'}
                </label>
                <input
                  type="text"
                  value={branchForm.slug || ''}
                  onChange={(e) => setBranchForm({ ...branchForm, slug: e.target.value })}
                  placeholder="e.g. riyadh-plant-2"
                  className={`w-full px-3 py-2 text-xs font-mono rounded-xl border outline-hidden transition-all ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 focus:border-teal-500 text-white'
                      : 'bg-slate-50 border-slate-300 focus:border-teal-500 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  {isAr ? 'العملة الأساسية' : 'Currency'}
                </label>
                <select
                  value={branchForm.currency || 'SAR'}
                  onChange={(e) => setBranchForm({ ...branchForm, currency: e.target.value })}
                  className={`w-full px-3 py-2 text-xs rounded-xl border outline-hidden transition-all ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="SAR">SAR - Saudi Riyal (ريال سعودي)</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="AED">AED - UAE Dirham</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="branch-is-active"
                  checked={branchForm.is_active}
                  onChange={(e) => setBranchForm({ ...branchForm, is_active: e.target.checked })}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <label htmlFor="branch-is-active" className="text-xs text-slate-300 cursor-pointer">
                  {isAr ? 'فرع تشغيلي نشط' : 'Active Operational Branch'}
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={closeModal}
                  className={`px-4 py-2 text-xs font-bold rounded-xl border ${
                    isDark
                      ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                      : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-teal-600 hover:bg-teal-500 text-white shadow-md shadow-teal-600/30 transition-all flex items-center gap-1.5"
                >
                  {isSubmitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>{isAr ? 'تأكيد وحفظ الفرع' : 'Save Branch'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. MODAL: Add Cost Center                                                 */}
      {/* ========================================================================= */}
      {activeModal === 'add_cost_center' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div
            className={`w-full max-w-lg rounded-2xl p-6 border shadow-2xl transition-all ${
              isDark ? 'bg-[#0e1428] border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-bold">
                  {isAr ? 'إضافة مركز تكلفة مالي جديد' : 'Add Cost Center (Finance)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="group text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
                title={isAr ? 'إغلاق' : 'Close'}
              >
                <HoverIcon className="h-4 w-4">
                  <X className="h-full w-full" />
                </HoverIcon>
              </button>
            </div>

            {modalError && (
              <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateCostCenter} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  {isAr ? 'الفرع / الكيان التابع له *' : 'Assigned Branch / Entity *'}
                </label>
                <select
                  value={modalTarget?.companyId || ''}
                  onChange={(e) => {
                    const sel = allCompaniesList.find((c) => c.id === e.target.value);
                    if (sel) {
                      setModalTarget({ companyId: sel.id, companyName: sel.name });
                    }
                  }}
                  className={`w-full px-3 py-2 text-xs rounded-xl border outline-hidden transition-all ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                >
                  {allCompaniesList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.org_type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    {isAr ? 'كود مركز التكلفة *' : 'Cost Center Code *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={costCenterForm.code}
                    onChange={(e) =>
                      setCostCenterForm({ ...costCenterForm, code: e.target.value.toUpperCase() })
                    }
                    placeholder="e.g. CC-RYD-01"
                    className={`w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border outline-hidden uppercase transition-all ${
                      isDark
                        ? 'bg-slate-900 border-slate-700 focus:border-emerald-500 text-emerald-400'
                        : 'bg-slate-50 border-slate-300 focus:border-emerald-500 text-emerald-700'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    {isAr ? 'اسم مركز التكلفة *' : 'Cost Center Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={costCenterForm.name}
                    onChange={(e) => setCostCenterForm({ ...costCenterForm, name: e.target.value })}
                    placeholder={isAr ? 'مثال: قسم الصيانة والتشغيل' : 'e.g. Maintenance Fleet'}
                    className={`w-full px-3 py-2 text-xs rounded-xl border outline-hidden transition-all ${
                      isDark
                        ? 'bg-slate-900 border-slate-700 focus:border-emerald-500 text-white'
                        : 'bg-slate-50 border-slate-300 focus:border-emerald-500 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  {isAr ? 'الوصف والغرض المالي' : 'Description / Financial Scope'}
                </label>
                <textarea
                  rows={2}
                  value={costCenterForm.description}
                  onChange={(e) =>
                    setCostCenterForm({ ...costCenterForm, description: e.target.value })
                  }
                  placeholder={
                    isAr
                      ? 'تفاصيل تتبع المصروفات التشغيلية...'
                      : 'Expense allocation details and purpose...'
                  }
                  className={`w-full px-3 py-2 text-xs rounded-xl border outline-hidden transition-all ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 focus:border-emerald-500 text-white'
                      : 'bg-slate-50 border-slate-300 focus:border-emerald-500 text-slate-900'
                  }`}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="cc-is-active"
                  checked={costCenterForm.is_active}
                  onChange={(e) =>
                    setCostCenterForm({ ...costCenterForm, is_active: e.target.checked })
                  }
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="cc-is-active" className="text-xs text-slate-300 cursor-pointer">
                  {isAr ? 'مركز تكلفة نشط ومتاح للقيود' : 'Active Cost Center for GL Postings'}
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={closeModal}
                  className={`px-4 py-2 text-xs font-bold rounded-xl border ${
                    isDark
                      ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                      : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30 transition-all flex items-center gap-1.5"
                >
                  {isSubmitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>{isAr ? 'حفظ مركز التكلفة' : 'Save Cost Center'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. MODAL: Add Purchasing Organization                                     */}
      {/* ========================================================================= */}
      {activeModal === 'add_purchasing_org' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div
            className={`w-full max-w-lg rounded-2xl p-6 border shadow-2xl transition-all ${
              isDark ? 'bg-[#0e1428] border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-purple-400" />
                <h3 className="text-base font-bold">
                  {isAr ? 'إضافة منظمة مشتريات وتوريد' : 'Add Purchasing Organization (Procurement)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="group text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
                title={isAr ? 'إغلاق' : 'Close'}
              >
                <HoverIcon className="h-4 w-4">
                  <X className="h-full w-full" />
                </HoverIcon>
              </button>
            </div>

            {modalError && (
              <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreatePurchasingOrg} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  {isAr ? 'الفرع / الكيان التابع له *' : 'Assigned Branch / Entity *'}
                </label>
                <select
                  value={modalTarget?.companyId || ''}
                  onChange={(e) => {
                    const sel = allCompaniesList.find((c) => c.id === e.target.value);
                    if (sel) {
                      setModalTarget({ companyId: sel.id, companyName: sel.name });
                    }
                  }}
                  className={`w-full px-3 py-2 text-xs rounded-xl border outline-hidden transition-all ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                >
                  {allCompaniesList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.org_type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    {isAr ? 'كود منظمة المشتريات *' : 'Purchasing Org Code *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={purchasingOrgForm.code}
                    onChange={(e) =>
                      setPurchasingOrgForm({
                        ...purchasingOrgForm,
                        code: e.target.value.toUpperCase(),
                      })
                    }
                    placeholder="e.g. PUR-01"
                    className={`w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border outline-hidden uppercase transition-all ${
                      isDark
                        ? 'bg-slate-900 border-slate-700 focus:border-purple-500 text-purple-400'
                        : 'bg-slate-50 border-slate-300 focus:border-purple-500 text-purple-700'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    {isAr ? 'اسم منظمة المشتريات *' : 'Purchasing Org Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={purchasingOrgForm.name}
                    onChange={(e) =>
                      setPurchasingOrgForm({ ...purchasingOrgForm, name: e.target.value })
                    }
                    placeholder={
                      isAr ? 'مثال: مشتريات العقود والخدمات' : 'e.g. Corporate Procurement'
                    }
                    className={`w-full px-3 py-2 text-xs rounded-xl border outline-hidden transition-all ${
                      isDark
                        ? 'bg-slate-900 border-slate-700 focus:border-purple-500 text-white'
                        : 'bg-slate-50 border-slate-300 focus:border-purple-500 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  {isAr ? 'عملة أوامر الشراء' : 'PO Settlement Currency'}
                </label>
                <select
                  value={purchasingOrgForm.currency || 'SAR'}
                  onChange={(e) =>
                    setPurchasingOrgForm({ ...purchasingOrgForm, currency: e.target.value })
                  }
                  className={`w-full px-3 py-2 text-xs rounded-xl border outline-hidden transition-all ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="SAR">SAR - Saudi Riyal (ريال سعودي)</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="AED">AED - UAE Dirham</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="po-is-active"
                  checked={purchasingOrgForm.is_active}
                  onChange={(e) =>
                    setPurchasingOrgForm({ ...purchasingOrgForm, is_active: e.target.checked })
                  }
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <label htmlFor="po-is-active" className="text-xs text-slate-300 cursor-pointer">
                  {isAr ? 'منظمة مشتريات نشطة ومعتمدة' : 'Active Purchasing Organization'}
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={closeModal}
                  className={`px-4 py-2 text-xs font-bold rounded-xl border ${
                    isDark
                      ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                      : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/30 transition-all flex items-center gap-1.5"
                >
                  {isSubmitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>{isAr ? 'حفظ منظمة المشتريات' : 'Save Purchasing Org'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
