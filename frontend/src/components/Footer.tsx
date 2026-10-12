import React from 'react';
import { useApp } from '../context/AppContext';
import { PlatformLogo } from './PlatformLogo';

export const Footer: React.FC = () => {
  const { language, brandConfig } = useApp();
  const isAr = language === 'ar';

  return (
    <footer className="border-t border-gray-800 bg-[#0d131f] py-8 text-neutral-400">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-500 gap-4">
        <div className="flex items-center gap-3">
          <PlatformLogo size="sm" />
          <span className="font-semibold text-neutral-300">
            {brandConfig?.companyNameEn || 'OxenGL Enterprise Cloud'}
          </span>
        </div>
        <p>
          © {new Date().getFullYear()} {brandConfig?.companyNameAr || 'منظومة أوكسن السحابية'} ({brandConfig?.companyNameEn || 'OxenGL Enterprise Cloud'}).{' '}
          {isAr ? 'جميع الحقوق محفوظة.' : 'All rights reserved.'}
        </p>
      </div>
    </footer>
  );
};
