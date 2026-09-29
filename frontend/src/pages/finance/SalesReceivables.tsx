import React from 'react';
import { Printer as PrinterIcon, Download as ArrowDownTrayIcon } from 'lucide-react';

export interface SalesReceivablesProps {
  row?: {
    id: string;
    [key: string]: any;
  };
}

export const SalesReceivables: React.FC<SalesReceivablesProps> = ({ row = { id: '' } }) => {
  return (
    <div className="flex items-center space-x-2">
      <button
        onClick={() => row?.id && window.open(`/api/v1/sales/invoices/${row.id}/pdf`, '_blank')}
        title="Download PDF"
        className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
      >
        <PrinterIcon className="w-4 h-4" />
      </button>
      <button
        onClick={() => window.open(`/api/v1/sales/invoices/export/excel`, '_blank')}
        title="Export All to Excel"
        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
      >
        <ArrowDownTrayIcon className="w-4 h-4" />
      </button>
    </div>
  );
};

export default SalesReceivables;
