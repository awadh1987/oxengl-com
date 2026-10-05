import React from 'react';
import { CommunicationsTab } from './CommunicationsTab';

export const SuperAdminCommunicationsPanel: React.FC = () => (
  <div className="w-full max-w-7xl mx-auto mt-6 pb-6">
    <CommunicationsTab superAdmin />
  </div>
);

export default SuperAdminCommunicationsPanel;
