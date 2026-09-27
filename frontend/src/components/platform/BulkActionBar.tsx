import React, { useState } from 'react';
import {
  CheckSquare,
  X,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Download,
  CheckCircle2,
} from 'lucide-react';

export interface BulkActionItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }> | React.ReactNode;
  variant?: 'default' | 'primary' | 'danger' | 'warning' | 'success';
  onClick: (selectedIds: string[]) => void | Promise<void>;
  requiresConfirmation?: boolean;
  confirmTitle?: string;
  confirmMessage?: string;
  disabled?: boolean;
}

export interface BulkActionBarProps {
  selectedIds: string[];
  onClearSelection: () => void;
  actions: BulkActionItem[];
  itemLabel?: string;
  isRTL?: boolean;
  className?: string;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedIds,
  onClearSelection,
  actions,
  itemLabel = 'items',
  isRTL = false,
  className = '',
}) => {
  const [activeConfirmAction, setActiveConfirmAction] = useState<BulkActionItem | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  if (selectedIds.length === 0) {
    return null;
  }

  const handleActionClick = async (action: BulkActionItem) => {
    if (action.disabled || isProcessing) return;

    if (action.requiresConfirmation) {
      setActiveConfirmAction(action);
      return;
    }

    try {
      setIsProcessing(true);
      await action.onClick(selectedIds);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = async () => {
    if (!activeConfirmAction) return;
    try {
      setIsProcessing(true);
      await activeConfirmAction.onClick(selectedIds);
      setActiveConfirmAction(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const count = selectedIds.length;

  return (
    <>
      {/* Floating Action Dock */}
      <aside
        aria-label="Bulk actions toolbar"
        className={`fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 bg-slate-900/95 border-slate-700/80 text-white shadow-black/60 max-w-[95vw] overflow-x-auto ${className}`}
      >
        {/* Selection Count Badge */}
        <div className="flex items-center gap-2 pr-3 border-r border-slate-700/80 shrink-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
            <CheckSquare className="h-4 w-4" />
          </div>
          <div className="text-xs font-mono font-bold tracking-tight">
            <span className="text-sky-400 font-black">{count}</span>{' '}
            <span className="text-slate-300">
              {isRTL
                ? count === 1
                  ? 'عنصر محدد'
                  : count === 2
                  ? 'عنصران محددان'
                  : 'عناصر محددة'
                : count === 1
                ? `1 ${itemLabel.replace(/s$/, '')} selected`
                : `${count} ${itemLabel} selected`}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {actions.map((action) => {
            let btnClass = 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700';

            if (action.variant === 'primary') {
              btnClass = 'bg-sky-600 hover:bg-sky-500 text-white border-sky-500 shadow-md shadow-sky-600/20';
            } else if (action.variant === 'danger') {
              btnClass = 'bg-rose-600/90 hover:bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/20';
            } else if (action.variant === 'warning') {
              btnClass = 'bg-amber-600/90 hover:bg-amber-600 text-white border-amber-500 shadow-md shadow-amber-600/20';
            } else if (action.variant === 'success') {
              btnClass = 'bg-emerald-600/90 hover:bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/20';
            }

            return (
              <button
                key={action.id}
                type="button"
                onClick={() => handleActionClick(action)}
                disabled={action.disabled || isProcessing}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0 ${btnClass}`}
              >
                {React.isValidElement(action.icon) ? (
                  action.icon
                ) : action.icon ? (
                  React.createElement(action.icon as React.ComponentType<{ className?: string }>, { className: 'h-3.5 w-3.5 shrink-0' })
                ) : null}
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>

        {/* Clear Selection Button */}
        <button
          type="button"
          onClick={onClearSelection}
          disabled={isProcessing}
          title={isRTL ? 'إلغاء التحديد' : 'Clear selection'}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-colors shrink-0 ml-1 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </aside>

      {/* Confirmation Modal for Destructive or State Changing Operations */}
      {activeConfirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  activeConfirmAction.variant === 'danger'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {activeConfirmAction.confirmTitle ||
                    (isRTL ? 'تأكيد العملية المجمعة' : 'Confirm Bulk Operation')}
                </h3>
                <p className="text-xs text-slate-400">
                  {isRTL
                    ? `تطبيق الإجراء على ${count} عنصر محدد`
                    : `Applying action to ${count} selected ${itemLabel}`}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              {activeConfirmAction.confirmMessage ||
                (isRTL
                  ? `هل أنت متأكد من تنفيذ هذا الإجراء المجمع على ${count} من السجلات المحددة؟ لا يمكن التراجع عن بعض هذه العمليات.`
                  : `Are you sure you want to execute this operation on ${count} selected records? This action cannot be undone.`)}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActiveConfirmAction(null)}
                disabled={isProcessing}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isProcessing}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-md ${
                  activeConfirmAction.variant === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30'
                    : 'bg-sky-600 hover:bg-sky-500 shadow-sky-600/30'
                }`}
              >
                {isProcessing && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>{isRTL ? 'تأكيد وتنفيذ' : 'Confirm & Execute'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
