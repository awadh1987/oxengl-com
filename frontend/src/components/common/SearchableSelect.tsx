import React, { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  subLabel?: string;
  badge?: string;
}

export interface SearchableSelectProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  noOptionsMessage?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  isAr?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  id,
  name,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  noOptionsMessage,
  required = false,
  disabled = false,
  className = '',
  isAr = false,
}) => {
  const generatedId = useId();
  const selectId = id || generatedId;

  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    openUpwards: boolean;
  }>({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 280,
    openUpwards: false,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Find currently selected option
  const selectedOption = options.find((opt) => opt.value === value);

  // Filter options based on search query
  const filteredOptions = options.filter((opt) => {
    if (!searchTerm.trim()) return true;
    const query = searchTerm.toLowerCase();
    const matchLabel = opt.label.toLowerCase().includes(query);
    const matchSub = opt.subLabel ? opt.subLabel.toLowerCase().includes(query) : false;
    const matchBadge = opt.badge ? opt.badge.toLowerCase().includes(query) : false;
    return matchLabel || matchSub || matchBadge;
  });

  // Calculate coordinates for the portalled dropdown panel
  const updateMenuPosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const estimatedMenuHeight = 280;
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    const openUpwards = spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow;
    const maxHeight = openUpwards
      ? Math.max(160, Math.min(spaceAbove - 16, 320))
      : Math.max(160, Math.min(spaceBelow - 16, 320));

    setMenuPosition({
      top: openUpwards ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      maxHeight,
      openUpwards,
    });
  };

  // Open / Close handlers
  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      updateMenuPosition();
      setSearchTerm('');
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm('');
    triggerRef.current?.focus();
  };

  // Update position on window scroll or resize
  useEffect(() => {
    if (!isOpen) return;

    updateMenuPosition();

    const handleScrollOrResize = () => {
      updateMenuPosition();
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen]);

  // Focus search input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Click outside and Escape key handling
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
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

  // Render portalled menu panel
  const menuContent = isOpen && typeof document !== 'undefined' ? (
    createPortal(
      <div
        ref={dropdownRef}
        role="listbox"
        id={`${selectId}-menu`}
        aria-labelledby={selectId}
        dir={isAr ? 'rtl' : 'ltr'}
        style={{
          position: 'fixed',
          top: menuPosition.openUpwards ? undefined : `${menuPosition.top}px`,
          bottom: menuPosition.openUpwards ? `${window.innerHeight - menuPosition.top}px` : undefined,
          left: `${menuPosition.left}px`,
          width: `${menuPosition.width}px`,
          maxHeight: `${menuPosition.maxHeight}px`,
          zIndex: 9999,
        }}
        className="erp-dropdown-menu-panel flex flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
      >
        {/* Search Header for quick search */}
        {options.length > 5 && (
          <div className="border-b border-slate-100 dark:border-slate-800 p-2 bg-slate-50/70 dark:bg-slate-950/70">
            <div className="relative flex items-center">
              <Search className="absolute start-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder || (isAr ? 'بحث سريع...' : 'Search options...')}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1.5 ps-8 pe-3 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:border-orange-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Option Items List */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {filteredOptions.length === 0 ? (
            <div className="py-4 text-center text-xs text-slate-400 dark:text-slate-500">
              {noOptionsMessage || (isAr ? 'لا توجد خيارات مطابقة' : 'No matching options')}
            </div>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(opt.value)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-start text-xs font-semibold transition-colors ${
                    isSelected
                      ? 'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300 font-bold'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex flex-col truncate">
                    <span className="truncate">{opt.label}</span>
                    {opt.subLabel && (
                      <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500 truncate">
                        {opt.subLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {opt.badge && (
                      <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 dark:text-slate-400">
                        {opt.badge}
                      </span>
                    )}
                    {isSelected && <Check className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400 shrink-0" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>,
      document.body
    )
  ) : null;

  return (
    <div className={`relative w-full ${className}`} dir={isAr ? 'rtl' : 'ltr'}>
      {/* Interactive Trigger Button */}
      <button
        ref={triggerRef}
        id={selectId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${selectId}-menu`}
        disabled={disabled}
        onClick={handleToggle}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-orange-500/30 ${
          disabled
            ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 text-slate-400 cursor-not-allowed'
            : isOpen
            ? 'border-orange-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 ring-2 ring-orange-500/20'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600'
        }`}
      >
        <div className="truncate text-start flex items-baseline gap-1.5">
          {selectedOption ? (
            <>
              <span className="truncate">{selectedOption.label}</span>
              {selectedOption.subLabel && (
                <span className="text-[10px] font-normal text-slate-400 dark:text-slate-400 truncate">
                  {selectedOption.subLabel}
                </span>
              )}
            </>
          ) : (
            <span className="text-slate-400 font-normal">
              {placeholder || (isAr ? 'اختر...' : 'Select...')}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-orange-500' : ''
          }`}
        />
      </button>

      {/* Hidden standard select for form submission & automated testing accessibility */}
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only pointer-events-none absolute -bottom-1 left-0 opacity-0 h-0 w-0"
      >
        <option value="" disabled>
          {placeholder || 'Select...'}
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Portalled Floating Dropdown Menu Panel */}
      {menuContent}
    </div>
  );
};
