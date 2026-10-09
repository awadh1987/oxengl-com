import React, { useState, useEffect } from 'react';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';
import { getActiveBroadcasts } from '../../services/governanceService';

interface AdminLayoutProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentPath,
  onNavigate,
  onLogout,
  children,
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('oxengl_admin_sidebar_collapsed') === 'true';
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeBroadcastCount, setActiveBroadcastCount] = useState(0);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('oxengl_admin_sidebar_collapsed', String(next));
      return next;
    });
  };

  useEffect(() => {
    getActiveBroadcasts()
      .then((b) => setActiveBroadcastCount(b.length))
      .catch(() => setActiveBroadcastCount(0));
  }, [currentPath]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-100 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 antialiased">
      {/* Sidebar */}
      <AdminSidebar
        currentPath={currentPath}
        onNavigate={onNavigate}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onLogout={onLogout}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <AdminTopbar
          currentPath={currentPath}
          onNavigate={onNavigate}
          onOpenMobileSidebar={() => setMobileOpen(true)}
          onLogout={onLogout}
          activeBroadcastCount={activeBroadcastCount}
        />

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
