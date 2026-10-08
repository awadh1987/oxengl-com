import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { erpApi } from '../services/api';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  Database,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

interface ImportSystemResourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: (result: any) => void;
}

export const ImportSystemResourceModal: React.FC<ImportSystemResourceModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const { language, themeMode, showToast, refreshOperations } = useApp();
  const isAr = language === 'ar';
  const isDark = themeMode === 'dark';

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const name = file.name.toLowerCase();
      if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
        setErrorMessage(
          isAr
            ? 'صيغة الملف غير صحيحة. يرجى اختيار ملف إكسل بصيغة .xlsx أو .xls'
            : 'Invalid file format. Please upload an Excel workbook (.xlsx or .xls).'
        );
        return;
      }
      setSelectedFile(file);
      setErrorMessage(null);
      setResult(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const name = file.name.toLowerCase();
      if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
        setErrorMessage(
          isAr
            ? 'صيغة الملف غير مدعومة. يرجى سحب ملف بصيغة .xlsx أو .xls'
            : 'Unsupported file format. Please drop a valid .xlsx or .xls file.'
        );
        return;
      }
      setSelectedFile(file);
      setErrorMessage(null);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setErrorMessage(null);
    setResult(null);

    try {
      const response = await erpApi.importLegacySystemResource(selectedFile);
      setResult(response);
      showToast(
        isAr
          ? `تم استيراد ${response.imported_count} سجل جديد وتحديث ${response.updated_count} بنجاح!`
          : `Successfully imported ${response.imported_count} new records and updated ${response.updated_count}!`,
        'success'
      );

      // Refresh parent dataset
      if (refreshOperations) {
        await refreshOperations();
      }
      if (onImportComplete) {
        onImportComplete(response);
      }
    } catch (err: any) {
      console.error('[Legacy Import Error]:', err);
      const msg = err.message || (isAr ? 'فشلت معالجة ملف الإكسل' : 'Failed to process Excel workbook');
      setErrorMessage(msg);
      showToast(msg, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const resetState = () => {
    setSelectedFile(null);
    setResult(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      id="legacy-import-modal"
    >
      <div
        className={`w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden transition-all duration-200 ${
          isDark
            ? 'bg-neutral-900 border-neutral-700/80 text-neutral-100'
            : 'bg-white border-neutral-200 text-neutral-900'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-950/60 border border-orange-200 dark:border-orange-800/80 text-[#F05627]">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight">
                {isAr ? 'جسر البيانات التاريخية (System Resource)' : 'Legacy Data Bridge (System Resource)'}
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {isAr
                  ? 'استيعاب ملفات إكسل التاريخية ومطابقة الحمولات والكسارات والنواقل مع قاعدة البيانات'
                  : 'Ingest historical System Resource workbooks with strict relational idempotency'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* File Drop Area */}
          {!result && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                isDragging
                  ? 'border-[#F05627] bg-orange-50/50 dark:bg-orange-950/20'
                  : selectedFile
                  ? 'border-emerald-500/70 bg-emerald-50/30 dark:bg-emerald-950/20'
                  : 'border-neutral-300 dark:border-neutral-700 hover:border-[#F05627]/60 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileChange}
                className="hidden"
                id="system-resource-file-input"
              />

              {selectedFile ? (
                <div className="flex flex-col items-center text-center space-y-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                    <FileSpreadsheet className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    {isAr ? 'جاهز للاستيراد والامتصاص' : 'Ready for ingestion'}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center space-y-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
                    <Upload className="h-6 w-6 text-[#F05627]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
                      {isAr
                        ? 'اسحب وأفلت ملف System Resource.xlsx هنا'
                        : 'Drag & drop "System Resource.xlsx" here'}
                    </p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {isAr ? 'أو انقر لتصفح ملفات جهازك' : 'or click to browse from device'}
                    </p>
                  </div>
                  <p className="text-[11px] text-neutral-400">
                    {isAr ? 'يدعم Excel 2007+ (.xlsx, .xls)' : 'Supports modern Excel workbooks (.xlsx, .xls)'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Error Notice */}
          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Success Summary Breakdown Card */}
          {result && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="text-xs font-bold">
                    {isAr ? 'اكتملت المعالجة والاستيراد بنجاح!' : 'Ingestion Completed Successfully!'}
                  </p>
                  <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
                    {result.filename}
                  </p>
                </div>
              </div>

              {/* Metric Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40 text-center">
                  <p className="text-xs text-neutral-400">{isAr ? 'حمولات جديدة' : 'New Tickets'}</p>
                  <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {result.imported_count}
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40 text-center">
                  <p className="text-xs text-neutral-400">{isAr ? 'تحديث متطابق' : 'Updated'}</p>
                  <p className="text-lg font-black text-blue-600 dark:text-blue-400 mt-0.5">
                    {result.updated_count}
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40 text-center">
                  <p className="text-xs text-neutral-400">{isAr ? 'شركاء مرتبطين' : 'Partners'}</p>
                  <p className="text-lg font-black text-amber-600 dark:text-amber-400 mt-0.5">
                    {result.entities_created?.partners || 0}
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40 text-center">
                  <p className="text-xs text-neutral-400">{isAr ? 'أصناف المواد' : 'Materials'}</p>
                  <p className="text-lg font-black text-[#F05627] mt-0.5">
                    {result.entities_created?.materials || 0}
                  </p>
                </div>
              </div>

              {/* Informational Footer */}
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-[11px] text-neutral-600 dark:text-neutral-400">
                <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>
                  {isAr
                    ? 'تم تطبيق تقريب ROUND_HALF_UP لكافة العمليات المالية وضمان سلامة القيود المحاسبية.'
                    : 'Strict ROUND_HALF_UP rounding and database constraints applied idempotently.'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/50">
          {result ? (
            <button
              type="button"
              onClick={resetState}
              className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 underline"
            >
              {isAr ? 'استيراد ملف إكسل آخر' : 'Import another workbook'}
            </button>
          ) : (
            <span className="text-[11px] text-neutral-400 flex items-center gap-1">
              <Database className="h-3.5 w-3.5 text-neutral-400" />
              <span>{isAr ? 'قاعدة بيانات PostgreSQL مباشرة' : 'Direct PostgreSQL transactions'}</span>
            </span>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              {result ? (isAr ? 'إغلاق' : 'Close') : isAr ? 'إلغاء' : 'Cancel'}
            </button>

            {!result && (
              <button
                type="button"
                id="execute-legacy-import-btn"
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#F05627] hover:bg-[#d94a1f] text-white text-xs font-bold shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{isAr ? 'جارِ امتصاص البيانات...' : 'Absorbing Legacy Records...'}</span>
                  </>
                ) : (
                  <>
                    <ArrowRight className="h-4 w-4" />
                    <span>{isAr ? 'بدء الاستيراد والامتصاص' : 'Execute Import Bridge'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
