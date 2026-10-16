import React from 'react';
import {
  Bell,
  Command,
  Languages,
  LogOut,
  Menu,
  Moon,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sun,
  User,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AdminBreadcrumbs } from './AdminBreadcrumbs';

interface AdminTopbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onOpenMobileSidebar: () => void;
  onLogout: () => void;
  activeBroadcastCount?: number;
}

export const AdminTopbar: React.FC<AdminTopbarProps> = ({
  currentPath,
  onNavigate,
  onOpenMobileSidebar,
  onLogout,
  activeBroadcastCount = 0,
}) => {
  const { currentUser, language, setLanguage, themeMode, setThemeMode } = useApp();
  const isAr = language === 'ar';
  const isDark = themeMode === 'dark';

  const toggleTheme = () => {
    const nextMode = isDark ? 'light' : 'dark';
    setThemeMode(nextMode);
  };

  const toggleLanguage = () => {
    const nextLang = isAr ? 'en' : 'ar';
    setLanguage(nextLang);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-800/80 bg-slate-950/90 px-4 sm:px-6 backdrop-blur-md transition-colors duration-200">
      {/* Left: Mobile hamburger & Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileSidebar}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden cursor-pointer"
          aria-label="Open mobile menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="hidden sm:block min-w-0">
          <AdminBreadcrumbs currentPath={currentPath} onNavigate={onNavigate} />
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Broadcasts Indicator */}
        {activeBroadcastCount > 0 && (
          <button
            onClick={() => onNavigate('/admin/settings/master')}
            title={`${activeBroadcastCount} active system broadcasts`}
            className="flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
          >
            <ShieldAlert className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
            <span className="hidden md:inline">{activeBroadcastCount} Active Alert{activeBroadcastCount > 1 ? 's' : ''}</span>
          </button>
        )}

        {/* Command Palette Trigger */}
        <button
          onClick={() => {
            // Trigger synthetic Cmd+K event or open modal
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
          }}
          className="hidden md:flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-xs text-slate-400 hover:border-slate-700 hover:text-slate-200 transition-colors cursor-pointer"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Quick Jump</span>
          <kbd className="rounded bg-slate-800 px-1 py-0.5 text-[10px] font-mono text-slate-300">
            ⌘K
          </kbd>
        </button>

        {/* Language Switcher */}
        <button
          onClick={toggleLanguage}
          title={isAr ? 'Switch to English' : 'التحويل للغة العربية'}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
        >
          <Languages className="h-4 w-4" />
        </button>

        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
          aria-label="Toggle theme mode"
        >
          {isDark ? (
            <Sun className="h-4 w-4 text-amber-400 hover:rotate-45 transition-transform" />
          ) : (
            <Moon className="h-4 w-4 text-indigo-400 hover:-rotate-12 transition-transform" />
          )}
        </button>

        {/* SuperAdmin Identity Card */}
        <div className="flex items-center gap-2 ps-1 sm:ps-2 border-s border-slate-800">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-orange-500 to-amber-500 text-white font-bold text-xs shadow-md shadow-orange-500/20">
            {currentUser?.email ? currentUser.email.charAt(0).toUpperCase() : 'A'}
            <span className="absolute bottom-0 end-0 h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-emerald-500" />
          </div>

          <div className="hidden lg:block text-start">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white truncate max-w-[130px]">
                {currentUser?.email?.split('@')[0] || 'SuperAdmin'}
              </span>
              <span className="rounded bg-emerald-500/10 px-1 py-0.2 text-[9px] font-bold text-emerald-400">
                ROOT
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Sovereign Control Plane</p>
          </div>

          <button
            onClick={onLogout}
            title="Sign Out"
            className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500 transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
