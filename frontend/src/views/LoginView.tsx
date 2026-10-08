import React from 'react';
import { LandingPageView } from './LandingPageView';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  return <LandingPageView onLoginSuccess={onLoginSuccess} />;
};
