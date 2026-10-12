import React from 'react';

interface AdminPageContainerProps {
  title: string;
  subtitle?: string;
  badge?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: 'normal' | 'wide' | 'full';
}

export const AdminPageContainer: React.FC<AdminPageContainerProps> = ({
  title,
  subtitle,
  badge,
  actions,
  children,
  maxWidth = 'wide',
}) => {
  const maxClass =
    maxWidth === 'full'
      ? 'w-full'
      : maxWidth === 'normal'
      ? 'max-w-6xl'
      : 'max-w-7xl 2xl:max-w-screen-2xl';

  return (
    <div className="flex-1 w-full overflow-y-auto bg-slate-50 dark:bg-slate-950/50 min-h-[calc(100vh-4rem)] transition-colors duration-200">
      <div className={`mx-auto p-4 sm:p-6 lg:p-8 ${maxClass} space-y-6`}>
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-200 dark:border-slate-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                {title}
              </h1>
              {badge && (
                <span className="rounded-full bg-orange-500/10 border border-orange-500/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-orange-600 dark:text-orange-400">
                  {badge}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-3xl">
                {subtitle}
              </p>
            )}
          </div>

          {actions && <div className="flex items-center gap-2.5 flex-wrap shrink-0">{actions}</div>}
        </div>

        {/* Page Body */}
        <div>{children}</div>
      </div>
    </div>
  );
};
