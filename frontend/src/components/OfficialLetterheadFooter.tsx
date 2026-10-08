import React from 'react';
import { BrandConfig } from '../types';
import { useApp } from '../context/AppContext';

interface OfficialLetterheadFooterProps {
  brandConfig?: BrandConfig;
  isAr?: boolean;
  pageNumberText?: string;
}

export const OfficialLetterheadFooter: React.FC<OfficialLetterheadFooterProps> = ({
  brandConfig: propBrandConfig,
  isAr = true,
  pageNumberText,
}) => {
  let appBrandConfig: any = null;
  try {
    const app = useApp();
    appBrandConfig = app?.brandConfig;
  } catch {}
  const brandConfig = propBrandConfig || appBrandConfig || ({} as any);
  return (
    <div
      id="official-letterhead-footer"
      dir="rtl"
      style={{ fontFamily: "'Tajawal', 'Noto Kufi Arabic', sans-serif" }}
      className="official-footer-print mt-8 border-t border-neutral-300 pt-4 text-center text-[10px] text-neutral-600 bg-white"
    >
      <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
        <div className="text-right">
          <p className="font-semibold text-neutral-800">
            {brandConfig.addressAr || 'الرياض - طريق الملك عبد العزيز - برج الأعمال'}
          </p>
          <p className="text-neutral-500">
            هاتف: <span className="font-mono">{brandConfig.phone || '+966 11 482 9900'}</span> | البريد:{' '}
            <span className="font-mono">{brandConfig.email || 'info@oxengl.me'}</span>
          </p>
        </div>

        <div className="text-center sm:text-left">
          <p className="font-mono text-neutral-900 font-bold">
            {brandConfig.bankNameAr} | IBAN: {brandConfig.iban}
          </p>
          {pageNumberText && (
            <p className="text-[9px] text-neutral-400 font-medium">{pageNumberText}</p>
          )}
        </div>
      </div>

      <div className="mt-2 text-[9px] text-neutral-400 border-t border-neutral-100 pt-1">
        {isAr
          ? 'وثيقة رسمية معتمدة إلكترونياً صادرة من منصة أوكسن السحابية (OxenGL Enterprise Cloud) • خاضعة لأنظمة هيئة الزكاة والضريبة والجمارك (ZATCA)'
          : 'Official verified electronic document issued by OxenGL Enterprise Cloud • Compliant with ZATCA regulations'}
      </div>
    </div>
  );
};
