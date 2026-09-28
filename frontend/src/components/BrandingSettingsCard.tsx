import React, { useState, useRef } from 'react';
import { TenantAvatar } from './TenantAvatar';

interface BrandingSettingsCardProps {
  tenantId: string;
  currentLogoUrl?: string | null;
  tenantName?: string;
  primaryColor?: string;
  onUploadSuccess: (newLogoUrl: string) => void;
}

export const BrandingSettingsCard: React.FC<BrandingSettingsCardProps> = ({
  tenantId,
  currentLogoUrl,
  tenantName,
  primaryColor,
  onUploadSuccess,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFileBlob = async (file: File) => {
    // Validate client-side restrictions before streaming binary files
    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage("File sizes are strictly capped at 2MB to ensure clean memory pools.");
      return;
    }
    
    setUploading(true);
    setErrorMessage(null);
    
    const dataPayload = new FormData();
    dataPayload.append("file", file);

    try {
      const response = await fetch(`/api/v1/tenants/${tenantId}/upload-logo`, {
        method: "POST",
        body: dataPayload,
      });

      if (!response.ok) throw new Error("Server transmission error or unsupported media format.");

      const result = await response.json();
      if (result.status === "SUCCESS") {
        onUploadSuccess(result.logo_url);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to commit image file down to server arrays.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl font-sans">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold tracking-wide text-slate-200 uppercase">Tenant White-Labeling</h3>
          <p className="text-xs text-slate-400 mt-0.5">Upload a custom workspace logo to replace platform branding</p>
        </div>
        <TenantAvatar
          logoUrl={currentLogoUrl}
          name={tenantName}
          primaryColor={primaryColor}
          size="md"
          showGlow={true}
        />
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFileBlob(e.dataTransfer.files[0]);
          }
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`w-full border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 select-none ${
          isDragging 
            ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' 
            : 'border-slate-800 bg-slate-950 hover:border-slate-700 text-slate-400'
        }`}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={(e) => e.target.files && processFileBlob(e.target.files[0])}
          accept="image/png, image/jpeg, image/webp" 
          className="hidden" 
        />
        
        <div className="text-2xl mb-2">📁</div>
        {uploading ? (
          <p className="text-xs font-mono text-cyan-400 animate-pulse">Streaming binary matrix down to disk...</p>
        ) : (
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-300">Drag and drop your asset block here, or <span className="text-cyan-400 font-semibold">browse</span></p>
            <p className="text-[10px] text-slate-500 font-mono">PNG, JPEG, or WEBP up to 2MB</p>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="mt-3 p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-[11px] font-mono text-rose-400">
          ❌ {errorMessage}
        </div>
      )}
    </div>
  );
};
