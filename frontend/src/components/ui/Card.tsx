import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface CardProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  badge?: React.ReactNode;
  headerRight?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  noPadding?: boolean;
  glow?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'none';
  onClick?: () => void;
}

const GLOW_STYLES: Record<NonNullable<CardProps['glow']>, string> = {
  none: 'border-slate-200/80 dark:border-slate-800/80',
  indigo: 'border-indigo-500/30 dark:border-indigo-500/30 shadow-[0_0_25px_-5px_rgba(99,102,241,0.15)]',
  emerald: 'border-emerald-500/30 dark:border-emerald-500/30 shadow-[0_0_25px_-5px_rgba(16,185,129,0.15)]',
  amber: 'border-amber-500/30 dark:border-amber-500/30 shadow-[0_0_25px_-5px_rgba(245,158,11,0.15)]',
  rose: 'border-rose-500/30 dark:border-rose-500/30 shadow-[0_0_25px_-5px_rgba(244,63,94,0.15)]',
  cyan: 'border-cyan-500/30 dark:border-cyan-500/30 shadow-[0_0_25px_-5px_rgba(6,182,212,0.15)]',
};

export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  icon: Icon,
  badge,
  headerRight,
  className = '',
  bodyClassName = '',
  noPadding = false,
  glow = 'none',
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-[#1e1e2d] rounded-2xl border ${GLOW_STYLES[glow]} shadow-sm transition-all duration-200 overflow-hidden ${
        onClick ? 'cursor-pointer hover:border-indigo-500/50' : ''
      } ${className}`}
    >
      {(title || Icon || badge || headerRight) && (
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
                <Icon className="w-4 h-4" />
              </div>
            )}
            <div className="min-w-0">
              {title && (
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white tracking-tight truncate">
                    {title}
                  </h3>
                  {badge}
                </div>
              )}
              {subtitle && (
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {headerRight && <div className="flex items-center gap-2 shrink-0">{headerRight}</div>}
        </div>
      )}
      <div className={`${noPadding ? '' : 'p-5'} ${bodyClassName}`}>{children}</div>
    </div>
  );
};

export default Card;
