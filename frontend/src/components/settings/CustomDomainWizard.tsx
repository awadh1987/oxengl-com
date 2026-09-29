import React from 'react';
import { useTranslation } from 'react-i18next';
import { CustomDomainWizard as BaseCustomDomainWizard } from '../platform/CustomDomainWizard';

export const CustomDomainWizard: React.FC<React.ComponentProps<typeof BaseCustomDomainWizard>> = (props) => {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  return <BaseCustomDomainWizard {...props} />;
};

export default CustomDomainWizard;
