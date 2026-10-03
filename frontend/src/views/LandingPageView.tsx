import React, { useState, useEffect, useCallback } from 'react';
import './landing/landing.css';
import { LandingHeader } from './landing/LandingHeader';
import { LandingHero } from './landing/LandingHero';
import { LandingStage } from './landing/LandingStage';
import { ProofMetrics } from './landing/ProofMetrics';
import { WorkflowMatrix } from './landing/WorkflowMatrix';
import { PricingSection } from './landing/PricingSection';
import { ProvisioningTerminal } from './landing/ProvisioningTerminal';
import { LandingFooter } from './landing/LandingFooter';

export interface LandingPageViewProps {
  onLoginSuccess?: () => void;
}

export const LandingPageView: React.FC<LandingPageViewProps> = ({ onLoginSuccess }) => {
  const [openWindows, setOpenWindows] = useState<Record<string, boolean>>({
    'win-finance': true,
    'win-telemetry': true,
    'win-weighbridge': true,
  });

  const [activeWindow, setActiveWindow] = useState<string>('win-weighbridge');

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
    <div className="platform-dark landing-page-root">
      <LandingHeader onLoginClick={onLoginSuccess} />
      
      <LandingHero
        onRestoreWindow={handleRestoreWindow}
        openWindows={openWindows}
        activeWindow={activeWindow}
      />

      <LandingStage
        openWindows={openWindows}
        activeWindow={activeWindow}
        onSelectWindow={handleSelectWindow}
        onCloseWindow={handleCloseWindow}
      />

      <ProofMetrics />
      
      <WorkflowMatrix />
      
      <PricingSection onSelectTier={handleTierSelect} />
      
      <ProvisioningTerminal />
      
      <LandingFooter />
    </div>
  );
};

export default LandingPageView;
