// File segment: frontend/src/Navbar.tsx
import React from 'react';
import { TenantAvatar } from './components/TenantAvatar';

interface NavbarProps {
  currentCompany?: {
    name: string;
    logo_url?: string | null;
    primary_color?: string;
  };
}

export const Navbar: React.FC<NavbarProps> = ({ currentCompany }) => {
  return (
    <nav className="w-full bg-slate-950 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {/* Dynamic Logo with Strict Fallback to Monogram Avatar */}
        <TenantAvatar
          logoUrl={currentCompany?.logo_url}
          name={currentCompany?.name}
          primaryColor={currentCompany?.primary_color}
          size="sm"
          showGlow={true}
        />
        
        {/* Dynamic Isolated Tenant Title */}
        <span className="text-sm font-semibold tracking-wide text-slate-200">
          {currentCompany?.name || 'Enterprise Workspace'}
        </span>
      </div>
    </nav>
  );
};
