import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { CRUDModalType, EntityCRUDModal } from './EntityCRUDModal';
import { useApp } from '../context/AppContext';

type EntityCreateType = Exclude<CRUDModalType, 'user'>;

export interface EntityQuickAddAction {
  type: EntityCreateType;
  labelAr: string;
  labelEn: string;
}

interface EntityQuickAddProps {
  actions: EntityQuickAddAction[];
  quickAddMenuActions?: EntityQuickAddAction[];
  quickAddMenuLabel?: { ar: string; en: string };
  onCreated?: () => void | Promise<void>;
  className?: string;
}

export const EntityQuickAdd: React.FC<EntityQuickAddProps> = ({
  actions,
  quickAddMenuActions = [],
  quickAddMenuLabel,
  onCreated,
  className = '',
}) => {
  const { language } = useApp();
  const [entityType, setEntityType] = useState<EntityCreateType | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isAr = language === 'ar';

  const openModal = (type: EntityCreateType) => {
    setIsMenuOpen(false);
    setEntityType(type);
  };

  const renderAction = (action: EntityQuickAddAction) => (
    <button
      key={action.type}
      type="button"
      onClick={() => openModal(action.type)}
      className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-3 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-orange-700"
    >
      <Plus className="h-3.5 w-3.5" />
      <span>{isAr ? action.labelAr : action.labelEn}</span>
    </button>
  );

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} dir={isAr ? 'rtl' : 'ltr'}>
      {actions.map(renderAction)}
      {quickAddMenuLabel && quickAddMenuActions.length > 0 && (
        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((open) => !open)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-orange-300 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-800 shadow-xs transition-colors hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300 dark:hover:bg-orange-900/50"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{isAr ? quickAddMenuLabel.ar : quickAddMenuLabel.en}</span>
          </button>
          {isMenuOpen && (
            <div role="menu" className="absolute end-0 top-full z-50 mt-1 min-w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              {quickAddMenuActions.map((action) => (
                <button
                  key={action.type}
                  type="button"
                  role="menuitem"
                  onClick={() => openModal(action.type)}
                  className="block w-full rounded-lg px-3 py-2 text-start text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {isAr ? action.labelAr : action.labelEn}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {entityType && (
        <EntityCRUDModal
          isOpen
          onClose={() => setEntityType(null)}
          entityType={entityType}
          onSaved={onCreated}
        />
      )}
    </div>
  );
};
