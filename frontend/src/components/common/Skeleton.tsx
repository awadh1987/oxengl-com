import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rounded',
}) => {
  const baseClasses = 'animate-pulse bg-zinc-200 dark:bg-zinc-800/80';
  
  const variantClasses = {
    text: 'h-4 w-full rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-none',
    rounded: 'rounded-lg',
  }[variant];

  return <div className={`${baseClasses} ${variantClasses} ${className}`} />;
};

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 ${className}`}>
    <div className="flex items-center justify-between mb-4">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-8 w-8" variant="circular" />
    </div>
    <Skeleton className="h-8 w-36 mb-2" />
    <Skeleton className="h-3 w-48" />
  </div>
);

export const SkeletonTable: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 5,
  cols = 6,
}) => (
  <div className="w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
    <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex gap-4">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={`head-${i}`} className="h-4 flex-1" />
      ))}
    </div>
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 p-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={`row-${r}`} className="py-3 px-2 flex gap-4 items-center">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={`cell-${r}-${c}`} className={`h-4 flex-1 ${c === 0 ? 'max-w-[140px]' : ''}`} />
          ))}
        </div>
      ))}
    </div>
  </div>
);

export default Skeleton;
