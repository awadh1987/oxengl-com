// File segment: frontend/src/components/Navbar.tsx
import React from 'react';

interface NavbarProps {
  currentCompany?: {
    name: string;
    logo_url?: string | null;
  };
}

export const Navbar: React.FC<NavbarProps> = ({ currentCompany }) => {
  return (
    <nav className="w-full bg-[#090f1c] border-b border-slate-800/80 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {/* Dynamic Logo Asset Rendering Container */}
        {currentCompany?.logo_url ? (
          <img 
            src={currentCompany.logo_url} 
            alt={`${currentCompany.name} Logo`} 
            className="h-8 w-8 object-contain rounded-md bg-slate-900 p-1 border border-slate-800"
            onError={(e) => {
              // Fallback element if asset fails to load
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          /* Global Standard Fallback Minimalist Monogram */
          <div className="h-8 w-8 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center shadow-md">
            <span className="text-white text-sm font-bold">
              {currentCompany?.name ? currentCompany.name.charAt(0).toUpperCase() : 'M'}
            </span>
          </div>
        )}
        
        {/* Dynamic Isolated Tenant Title */}
        <span className="text-sm font-semibold tracking-wide text-slate-200">
          {currentCompany?.name || 'Enterprise Workspace'}
        </span>
      </div>
    </nav>
  );
};
