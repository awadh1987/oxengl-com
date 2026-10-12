import arLocale from '../locales/ar.json';
import { useApp } from '../context/AppContext';

export const useTranslation = (namespace: string = 'dashboard') => {
  let language = 'ar';
  try {
    const appCtx = useApp();
    if (appCtx?.language) {
      language = appCtx.language;
    }
  } catch {
    // AppContext optional fallback
  }

  const t = (key: string): string => {
    if (language === 'ar') {
      const section = (arLocale as any)[namespace];
      if (section && section[key]) return section[key];
      if ((arLocale.dashboard as any)[key]) return (arLocale.dashboard as any)[key];
      if ((arLocale.global as any)[key]) return (arLocale.global as any)[key];
      return key;
    }
    const enMap: Record<string, string> = {
      header_title: "Global Panoramic ERP Cockpit",
      kpi_asset_valuation: "Monthly Recurring (MRR)",
      kpi_projection_30d: "Isolation Coverage",
      regression_slope: "Slope Trajectory Rate",
      confidence_high: "AI Forecast Confidence Index",
      current_value: "On-Hand Stock Asset Value",
      projected_value_30d: "30-Day Forward Value Projection"
    };
    return enMap[key] || key;
  };

  return { t };
};

export default useTranslation;
