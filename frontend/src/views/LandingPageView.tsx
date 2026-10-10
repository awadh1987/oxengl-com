import React, { useState, useEffect, useCallback } from 'react';
import './landing/landing.css';
import { LandingHeader } from './landing/LandingHeader';
import { LandingHero } from './landing/LandingHero';
import { LandingStage } from './landing/LandingStage';
import { ProofMetrics } from './landing/ProofMetrics';
import { WorkflowMatrix } from './landing/WorkflowMatrix';
import { PricingSection } from './landing/PricingSection';
import { ProvisioningTerminal } from './landing/ProvisioningTerminal';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { useLandingContent } from '../hooks/useLandingContent';
import { SystemBroadcastBanner } from '../components/common/SystemBroadcastBanner';
import { LandingFooter } from './landing/LandingFooter';

export interface LandingPageViewProps {
  onLoginSuccess?: () => void;
}

export const LandingPageView: React.FC<LandingPageViewProps> = ({ onLoginSuccess }) => {
  const { settings: siteSettings, loading: siteSettingsLoading } = useSiteSettings();
  const { heroData, footerData, pricingData, cmsContent, metricsData, platformSettings } = useLandingContent();
  const [openWindows, setOpenWindows] = useState<Record<string, boolean>>({
    'win-finance': true,
    'win-telemetry': true,
    'win-weighbridge': true,
  });

  const [activeWindow, setActiveWindow] = useState<string>('win-weighbridge');

  // Augmented settings with platform master defaults & compliance policy
  const effectiveSettings = {
    ...siteSettings,
    site_name: platformSettings.platform_name || siteSettings.site_name,
    site_tagline: platformSettings.platform_tagline || siteSettings.site_tagline,
    site_logo: platformSettings.logo_light_url || siteSettings.site_logo,
    contact_email: footerData.contact_email || platformSettings.support_email || siteSettings.contact_email,
    contact_phone: footerData.contact_phone || siteSettings.contact_phone,
    contact_address: footerData.contact_address || siteSettings.contact_address,
    enable_sovereignty_badge: platformSettings.enable_sovereignty_badge,
    sovereignty_badge_title: platformSettings.sovereignty_badge_title,
    sovereignty_badge_text: platformSettings.sovereignty_badge_text,
  };

  // Global mouse tracking for background radial spotlight
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
      document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  const handleRestoreWindow = useCallback((winId: string) => {
    setOpenWindows((prev) => ({
      ...prev,
      [winId]: true,
    }));
    setActiveWindow(winId);
  }, []);

  const handleCloseWindow = useCallback((winId: string) => {
    setOpenWindows((prev) => ({
      ...prev,
      [winId]: false,
    }));
  }, []);

  const handleSelectWindow = useCallback((winId: string) => {
    setActiveWindow(winId);
  }, []);

  const handleTierSelect = useCallback((tier: string) => {
    const el = document.getElementById('namespace-slug');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      el.focus();
    }
  }, []);

  return (
    <div className="platform-dark landing-page-root flex flex-col min-h-dvh w-full">
      {/* Real-time Platform Broadcast Subsystem */}
      <SystemBroadcastBanner />

      <LandingHeader settings={effectiveSettings} onLoginClick={onLoginSuccess} />

      <main className="landing-main flex-1 w-full">
        {heroData.isVisible && (
          <LandingHero
            settings={effectiveSettings}
            loading={siteSettingsLoading}
            cmsHero={heroData}
            cmsContent={cmsContent}
            onRestoreWindow={handleRestoreWindow}
            openWindows={openWindows}
            activeWindow={activeWindow}
          />
        )}

        <LandingStage
          openWindows={openWindows}
          activeWindow={activeWindow}
          onSelectWindow={handleSelectWindow}
          onCloseWindow={handleCloseWindow}
        />

        {metricsData.isVisible && <ProofMetrics cmsMetrics={metricsData} />}
        
        <WorkflowMatrix />
        
        <PricingSection
          cmsPricing={pricingData}
          cmsContent={cmsContent}
          onSelectTier={handleTierSelect}
        />
        
        <ProvisioningTerminal />
      </main>

      <LandingFooter
        settings={effectiveSettings}
        cmsFooter={footerData}
        cmsContent={cmsContent}
      />
    </div>
  );
};

export default LandingPageView;
