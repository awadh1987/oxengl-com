import React, { useEffect, useRef, useState, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, LucideIcon, MoreHorizontal } from 'lucide-react';

export interface ActionMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export interface ActionsMenuProps {
  items: ActionMenuItem[];
  isArabic: boolean;
  isDark?: boolean;
  className?: string;
  id?: string;
  align?: 'start' | 'end';
}

export const ActionsMenu: React.FC<ActionsMenuProps> = ({
  items,
  isArabic,
  isDark = false,
  className = '',
  id,
  align = 'end',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const menuId = id || generatedId;

  const [position, setPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    openUpwards: boolean;
    maxHeight: number;
  }>({
    left: 0,
    openUpwards: false,
    maxHeight: 320,
  });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 256; // standard w-64 (16rem = 256px)
    const estimatedHeight = Math.min(items.length * 48 + 16, 320);
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const spaceBelow = viewportHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;

    const openUpwards = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    const maxHeight = openUpwards
      ? Math.max(160, Math.min(spaceAbove - 16, 384))
      : Math.max(160, Math.min(spaceBelow - 16, 384));

    // Horizontal positioning:
    // In RTL, end-0 means left-aligned with trigger; in LTR, end-0 means right-aligned with trigger.
    let left: number;
    if (isArabic) {
      if (align === 'end') {
        left = triggerRect.left;
      } else {
        left = triggerRect.right - menuWidth;
      }
    } else {
      if (align === 'end') {
        left = triggerRect.right - menuWidth;
      } else {
        left = triggerRect.left;
      }
    }

    // Clamp horizontally to stay within viewport
    left = Math.max(8, Math.min(left, viewportWidth - menuWidth - 8));

    setPosition({
      top: openUpwards ? undefined : triggerRect.bottom + 6,
      bottom: openUpwards ? viewportHeight - triggerRect.top + 6 : undefined,
      left,
      openUpwards,
      maxHeight,
    });
  }, [items.length, isArabic, align]);

  const handleToggle = () => {
    if (!isOpen) {
      updatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  // Reposition on scroll or resize
  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, updatePosition]);

  // Click outside and Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuPanelRef.current &&
        !menuPanelRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (items.length === 0) return null;

  const menuPortal =
    isOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuPanelRef}
            id={`${menuId}-dropdown-panel`}
            role="menu"
            aria-label={isArabic ? 'إجراءات إضافية' : 'Additional actions'}
            dir={isArabic ? 'rtl' : 'ltr'}
            style={{
              position: 'fixed',
              top: position.top !== undefined ? `${position.top}px` : undefined,
              bottom: position.bottom !== undefined ? `${position.bottom}px` : undefined,
              left: `${position.left}px`,
              width: '16rem', // w-64
              maxHeight: `${position.maxHeight}px`,
              zIndex: 9999,
            }}
            className={`erp-dropdown-menu-panel flex flex-col overflow-y-auto rounded-2xl border p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 ${
              isDark
                ? 'border-slate-700 bg-slate-900/95 text-slate-100 shadow-slate-950/80'
                : 'border-slate-200 bg-white/95 text-slate-800 shadow-slate-900/20'
            }`}
          >
            {items.map(({ id: itemId, label, icon: Icon, onSelect, disabled, danger }) => (
              <button
                key={itemId}
                id={itemId}
                type="button"
                role="menuitem"
                disabled={disabled}
                onClick={() => {
                  setIsOpen(false);
                  onSelect();
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  danger
                    ? 'text-rose-500 hover:bg-rose-500/10'
                    : isDark
                    ? 'hover:bg-slate-800 text-slate-200 hover:text-white'
                    : 'hover:bg-slate-100 text-slate-700 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${danger ? 'text-rose-500' : 'text-orange-500'}`} />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>,
          document.body
        )
      : null;

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        id={menuId}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? `${menuId}-dropdown-panel` : undefined}
        onClick={handleToggle}
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

      {menuPortal}
    </div>
  );
};
