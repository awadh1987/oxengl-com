import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export interface BreadcrumbItem {
  label: string;
  labelAr?: string;
  path?: string;
}

interface AdminBreadcrumbsProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  items?: BreadcrumbItem[];
}

export const AdminBreadcrumbs: React.FC<AdminBreadcrumbsProps> = ({
  currentPath,
  onNavigate,
  items,
}) => {
  const { language } = useApp();
  const isAr = language === 'ar';

  const defaultItems: BreadcrumbItem[] = (() => {
    if (items && items.length > 0) return items;

    const base: BreadcrumbItem[] = [
      { label: 'Admin', labelAr: 'الإدارة', path: '/admin' },
    ];

    if (currentPath === '/admin' || currentPath === '/admin/cockpit') {
      base.push({ label: 'Mission Cockpit', labelAr: 'لوحة القيادة المركزية' });
    } else if (currentPath.startsWith('/admin/billing-gateways') || currentPath.startsWith('/admin/billing')) {
      base.push({ label: 'Payment & Billing Gateways', labelAr: 'بوابات الدفع والفوترة', path: '/admin/billing-gateways' });
    } else if (currentPath.startsWith('/admin/platform')) {
      base.push({ label: 'Platform Admin Portal', labelAr: 'بوابة إدارة المنصة', path: '/admin/platform' });
    } else if (currentPath.startsWith('/admin/tenants')) {
      base.push({ label: 'Tenants Registry', labelAr: 'سجل المستأجرين' });
    } else if (currentPath.startsWith('/admin/landing-editor')) {
      base.push({ label: 'Landing CMS Studio', labelAr: 'محرر الصفحة الرئيسية CMS' });
    } else if (currentPath.startsWith('/admin/settings/master') || currentPath.startsWith('/admin/settings')) {
      base.push({ label: 'Platform Governance', labelAr: 'إدارة المنظومة' });
      base.push({ label: 'Master Settings', labelAr: 'الإعدادات الموحدة' });
    } else if (currentPath.startsWith('/admin/logs')) {
      base.push({ label: 'Audit Logs', labelAr: 'سجلات التدقيق' });
    } else if (currentPath.startsWith('/admin/analytics')) {
      base.push({ label: 'Analytics', labelAr: 'التحليلات' });
    } else {
      const seg = currentPath.replace('/admin/', '');
      base.push({ label: seg.charAt(0).toUpperCase() + seg.slice(1) });
    }

    return base;
  })();

  return (
    <nav aria-label="Breadcrumb" className="flex items-center text-xs text-slate-500 dark:text-slate-400">
      <button
        onClick={() => onNavigate('/admin')}
        className="flex items-center gap-1 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
        aria-label="Home"
      >
        <Home className="h-3.5 w-3.5" />
      </button>

      {defaultItems.map((crumb, idx) => {
        const isLast = idx === defaultItems.length - 1;
        const label = (isAr && crumb.labelAr) ? crumb.labelAr : crumb.label;

        return (
          <React.Fragment key={idx}>
            <ChevronRight className="h-3 w-3 mx-1.5 text-slate-400 dark:text-slate-600 shrink-0" />
            {isLast || !crumb.path ? (
              <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[200px]">
                {label}
              </span>
            ) : (
              <button
                onClick={() => crumb.path && onNavigate(crumb.path)}
                className="hover:text-slate-800 dark:hover:text-white transition-colors truncate max-w-[150px] cursor-pointer"
              >
                {label}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};
