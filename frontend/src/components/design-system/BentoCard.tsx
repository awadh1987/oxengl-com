import React from 'react';
import { useApp } from '../../context/AppContext';
import { DENSITY_STYLES } from '../../theme/designTokens';

export interface BentoCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  glow?: boolean;
  density?: 'comfortable' | 'compact';
  className?: string;
  headerClassName?: string;
}

export const BentoCard: React.FC<BentoCardProps> = ({
  children,
  title,
  subtitle,
  icon: Icon,
  badge,
  actions,
  glow = false,
  density: overrideDensity,
  className = '',
  headerClassName = '',
  ...props
}) => {
  const { densityMode, themeMode } = useApp();
  const activeDensity = overrideDensity || densityMode;
  const densityConfig = DENSITY_STYLES[activeDensity];
  const isDark = themeMode === 'dark';

  return (
    <div
      className={`relative overflow-hidden rounded-2xl transition-all duration-200 ${
        isDark
          ? 'bg-slate-900/70 border border-slate-800/90 text-slate-100 shadow-xl shadow-black/40 backdrop-blur-md hover:border-slate-700/90'
          : 'bg-white border border-slate-200/90 text-slate-900 shadow-md hover:border-slate-300'
      } ${glow ? 'glow-border-tenant' : ''} ${className}`}
      {...props}
    >
      {/* Subtle top surface luminous highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Card Header (if title, icon, badge, or actions provided) */}
      {(title || Icon || badge || actions) && (
        <div
          className={`flex items-center justify-between border-b ${
            isDark ? 'border-slate-800/80 bg-slate-950/40' : 'border-slate-100 bg-slate-50/70'
          } ${activeDensity === 'compact' ? 'px-3.5 py-2.5' : 'px-5 py-4'} ${headerClassName}`}
        >
          <div className="flex min-w-0 items-center gap-3">
            {Icon && (
              <div
                className={`flex shrink-0 items-center justify-center rounded-xl border ${
                  isDark
                    ? 'border-white/10 bg-white/5 text-amber-400'
                    : 'border-slate-200 bg-white text-orange-600 shadow-xs'
                } ${activeDensity === 'compact' ? 'h-7 w-7' : 'h-9 w-9'}`}
              >
                <Icon className={activeDensity === 'compact' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
              </div>
            )}
            <div className="min-w-0">
              {typeof title === 'string' ? (
                <h3
                  className={`truncate font-black tracking-tight ${
                    isDark ? 'text-white' : 'text-slate-900'
                  } ${activeDensity === 'compact' ? 'text-xs' : 'text-sm'}`}
                >
                  {title}
                </h3>
              ) : (
                title
              )}
              {subtitle && (
                <p
                  className={`truncate text-slate-400 ${
                    activeDensity === 'compact' ? 'text-[10px]' : 'text-xs'
                  }`}
                >
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {badge && <div>{badge}</div>}
            {actions && <div>{actions}</div>}
          </div>
        </div>
      )}

      {/* Card Body */}
      <div className={densityConfig.cardPadding}>{children}</div>
    </div>
  );
};
