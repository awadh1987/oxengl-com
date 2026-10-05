import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LucideIcon, MoreHorizontal } from 'lucide-react';
import { useOutsideClick } from '../hooks/useOutsideClick';

export interface ActionMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
}

interface ActionsMenuProps {
  items: ActionMenuItem[];
  isArabic: boolean;
  isDark?: boolean;
}

export const ActionsMenu: React.FC<ActionsMenuProps> = ({
  items,
  isArabic,
  isDark = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useOutsideClick(menuRef, () => setIsOpen(false));

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  if (items.length === 0) return null;

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 ${
          isDark
            ? 'border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700'
            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        <MoreHorizontal className="h-4 w-4 text-orange-500" />
        <span>{isArabic ? 'الإجراءات' : 'Actions / More'}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={isArabic ? 'إجراءات إضافية' : 'Additional actions'}
          className={`absolute end-0 top-full z-50 mt-2 max-h-[min(70vh,24rem)] w-64 overflow-y-auto rounded-2xl border p-1.5 shadow-xl ${
            isDark
              ? 'border-slate-700 bg-slate-900 text-slate-100'
              : 'border-slate-200 bg-white text-slate-800'
          }`}
        >
          {items.map(({ id, label, icon: Icon, onSelect }) => (
            <button
              key={id}
              id={id}
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                onSelect();
              }}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-xs font-semibold transition-colors ${
                isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0 text-orange-500" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
