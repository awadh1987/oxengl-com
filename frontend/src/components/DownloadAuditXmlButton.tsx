// File: frontend/src/components/DownloadAuditXmlButton.tsx
import React, { useState } from 'react';

export const DownloadAuditXmlButton: React.FC = () => {
  const [exporting, setExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const triggerXmlDownload = async () => {
    setExporting(true);
    setStatusMessage("Compiling 5-Deep Ledger Nodes...");

    try {
      const authToken = localStorage.getItem('auth_token');
      const tenantId = localStorage.getItem('pre_auth_tenant_id');

      const response = await fetch('/api/v1/finance/generate-closing-xml', {
        method: 'GET',
        headers: {
          'Authorization': authToken ? `Bearer ${authToken}` : '',
          'X-Tenant-ID': tenantId || '', // Enforces active RLS scoping context
        },
      });

      if (!response.ok) {
        throw new Error(`Compliance compile failure. Server returned status code ${response.status}`);
      }

      setStatusMessage("Packaging Structured XML Stream...");

      // Intercept the stream blob array from the server ring
      const blob = await response.blob();
      
      // Determine filename from server headers or default to timestamped layout
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'annual_audit_closing_manifest.xml';
      if (contentDisposition && contentDisposition.includes('filename=')) {
        filename = contentDisposition.split('filename=')[1].replaceAll('"', '').trim();
      }

      // Create a temporary sandboxed link object to trigger browser download engine
      const downloadUrl = window.URL.createObjectURL(blob);
      const linkAnchor = document.createElement('a');
      linkAnchor.href = downloadUrl;
      linkAnchor.setAttribute('download', filename);
      document.body.appendChild(linkAnchor);
      
      // Fire simulated mouse click down onto browser framework threads
      linkAnchor.click();
      
      // Purge clean virtual memory registers instantly
      linkAnchor.parentNode?.removeChild(linkAnchor);
      window.URL.revokeObjectURL(downloadUrl);

      setStatusMessage("✓ Export Manifest Delivered");
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      console.error("Audit Export Exception encountered:", err);
      setStatusMessage("❌ Compliance Export Failed");
      setTimeout(() => setStatusMessage(null), 4000);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5 font-sans">
      <button
        onClick={triggerXmlDownload}
        disabled={exporting}
        className={`px-4 py-2.5 rounded-xl border text-xs font-mono font-bold tracking-wider uppercase transition-all duration-200 flex items-center gap-2 cursor-pointer shadow-lg disabled:opacity-50 select-none
          ${exporting 
            ? 'bg-amber-950/20 border-amber-500/40 text-amber-400 animate-pulse' 
            : 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-400 text-emerald-400 hover:bg-emerald-950/40'
          }`}
      >
        {/* Animated Terminal / Downward Arrow Glyph */}
        <svg xmlns="http://w3.org" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        {exporting ? 'Processing Compliance Manifest' : 'Download Audit XML'}
      </button>
      
      {statusMessage && (
        <span className={`text-[10px] font-mono tracking-wide ${statusMessage.includes('❌') ? 'text-rose-400' : statusMessage.includes('✓') ? 'text-emerald-400' : 'text-slate-400'}`}>
          {statusMessage}
        </span>
      )}
    </div>
  );
};
