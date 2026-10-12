import React, { useState } from 'react';
import { BrandMark } from '../views/landing/BrandWordmark';
import { useApp } from '../context/AppContext';

export interface PlatformLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'hero';
  className?: string;
  alt?: string;
}

const sizePxMap: Record<string, number> = {
  sm: 32,
  md: 44,
  lg: 64,
  xl: 88,
  '2xl': 120,
  hero: 160,
};

export const PlatformLogo: React.FC<PlatformLogoProps> = ({
  size = 'sm',
  className = '',
  alt = 'OxenGL Enterprise Platform Logo',
}) => {
  let brandConfig: any = null;
  try {
    const appContext = useApp();
    brandConfig = appContext?.brandConfig;
  } catch {
    // Graceful fallback if rendered outside AppProvider
  }
  const [imgError, setImgError] = useState(false);

  // Dynamic platform logo resolution:
  // 1. Vite environment variable: import.meta.env.VITE_PLATFORM_LOGO_URL
  // 2. Global app brand config: brandConfig.platformLogoUrl or brandConfig.customLogoUrl
  // 3. Fallback: Clean default OxenGL BrandLogo SVG
  const envLogo = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_PLATFORM_LOGO_URL : undefined;
  const platformLogoUrl =
    (envLogo && typeof envLogo === 'string' && envLogo.trim() !== '')
      ? envLogo.trim()
      : (brandConfig?.platformLogoUrl && typeof brandConfig.platformLogoUrl === 'string' && brandConfig.platformLogoUrl.trim() !== '')
      ? brandConfig.platformLogoUrl.trim()
      : null;

  const px = sizePxMap[size] || 32;

  // The legacy default (/oxengl-logo.svg) is superseded by the OxenGL GL brand mark.
  if (platformLogoUrl && platformLogoUrl !== '/oxengl-logo.svg' && !imgError) {
    return (
      <div
        style={{ width: px, height: px }}
        className={`relative flex items-center justify-center shrink-0 ${className}`}
      >
        <img
          src={platformLogoUrl}
          alt={alt}
          style={{ maxWidth: '100%', maxHeight: '100%' }}
          className="object-contain rounded-md"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center shrink-0 ${className}`}>
      <BrandMark size={px} />
    </div>
  );
};
