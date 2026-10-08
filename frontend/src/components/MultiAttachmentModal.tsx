import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { DocumentAttachment } from '../types';
import {
  X,
  Paperclip,
  UploadCloud,
  FileText,
  Trash2,
  Download,
  Eye,
  CheckCircle,
  FileSpreadsheet,
  File,
  Image,
  ScanLine,
} from 'lucide-react';
import { formatDate } from '../utils/formatters';

interface MultiAttachmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  recordTitle?: string;
  recordCategory?: string;
  recordType?: 'Operation' | 'Payment' | 'Invoice' | string;
  recordId?: string;
  existingAttachments?: DocumentAttachment[];
  attachments?: DocumentAttachment[];
  onAddAttachment?: (newAtt: any) => void;
  onDeleteAttachment?: (attId: any) => void;
}

export const MultiAttachmentModal: React.FC<MultiAttachmentModalProps> = ({
  isOpen,
  onClose,
  title,
  recordTitle,
  recordType = 'Operation',
  recordId = '',
  existingAttachments,
  attachments: propAttachments,
  onAddAttachment,
  onDeleteAttachment,
}) => {
  const { addAttachmentToRecord, removeAttachmentFromRecord, language, showToast } = useApp();
  const isAr = language === 'ar';

  // Defensive array fallback to prevent TypeError when API returns 500 or undefined attachments
  const safeAttachments = useMemo(() => {
    if (Array.isArray(existingAttachments)) return existingAttachments;
    if (Array.isArray(propAttachments)) return propAttachments;
    return [];
  }, [existingAttachments, propAttachments]);

  const [category, setCategory] = useState<DocumentAttachment['docCategory']>('Scale Ticket');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [viewingAttachment, setViewingAttachment] = useState<DocumentAttachment | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (viewingAttachment) {
          setViewingAttachment(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, viewingAttachment]);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = () => {
    if (!selectedFile) return;

    const sizeInMB = (selectedFile.size / (1024 * 1024)).toFixed(2);
    const sizeStr = Number(sizeInMB) >= 1 ? `${sizeInMB} MB` : `${Math.round(selectedFile.size / 1024)} KB`;

    const newAtt = {
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fileName: selectedFile.name,
      fileSize: sizeStr,
      fileType: selectedFile.type || 'application/octet-stream',
      docCategory: category,
      fileData: previewUrl || 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&auto=format&fit=crop&q=80',
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'Current User',
    };

    if (onAddAttachment) {
      onAddAttachment(newAtt);
    } else if (addAttachmentToRecord) {
      addAttachmentToRecord(recordType as any, recordId, newAtt);
    }

    setSelectedFile(null);
    setPreviewUrl('');
  };

  const getCategoryBadgeClass = (cat: string) => {
    switch (cat) {
      case 'Scale Ticket':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Waybill':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Delivery Receipt':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'Tax Invoice':
        return 'bg-amber-50 text-purple-700 border-amber-200';
      case 'Payment Voucher':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="multi-attachment-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl bg-white dark:bg-slate-900 shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 transition-colors animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-900/40">
              <Paperclip className="h-5 w-5" />
            </div>
            <div>
              <h2 id="multi-attachment-title" className="text-base font-black text-slate-900 dark:text-white">
                {isAr ? 'نظام المرفقات والمستندات الثبوتية' : 'Document Attachments System'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto p-6 space-y-6 flex-1">
          {/* Uploader Section */}
          <div className="rounded-2xl border border-dashed border-orange-200 dark:border-orange-900/40 bg-orange-50/30 dark:bg-orange-950/20 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'نوع وتصنيف المستند المرفق *' : 'Document Category *'}
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-orange-500 focus:outline-none"
                >
                  <option value="Scale Ticket">{isAr ? 'تذكرة ميزان (Scale Ticket)' : 'Scale Ticket'}</option>
                  <option value="Waybill">{isAr ? 'بوليصة شحن / ترحيل (Waybill)' : 'Waybill'}</option>
                  <option value="Delivery Receipt">{isAr ? 'سند استلام عميل (Delivery Receipt)' : 'Delivery Receipt'}</option>
                  <option value="Tax Invoice">{isAr ? 'صورة فاتورة ضريبية (Tax Invoice)' : 'Tax Invoice'}</option>
                  <option value="Payment Voucher">{isAr ? 'إشعار / سند تحويل بنكي (Payment Voucher)' : 'Payment Voucher'}</option>
                  <option value="Contract">{isAr ? 'عقد / أمر شراء معتمد (Contract / PO)' : 'Contract / PO'}</option>
                  <option value="Other">{isAr ? 'مستند آخر (Other)' : 'Other'}</option>
                </select>
              </div>

              <div className="flex items-end">
                <label
                  htmlFor="camera-scan-input"
                  className="mr-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-orange-600 dark:border-orange-500/80 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-orange-700 dark:text-orange-400 shadow-xs hover:bg-orange-50 dark:hover:bg-slate-800 transition-colors"
                  title={isAr ? 'مسح المستند بالكاميرا' : 'Scan with mobile camera'}
                >
                  <ScanLine className="h-4 w-4" />
                  <span>{isAr ? 'مسح' : 'Scan'}</span>
                </label>
                <input
                  id="camera-scan-input"
                  name="camera_scan"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <label
                  htmlFor="file-upload-input"
                  className="cursor-pointer flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-orange-700 transition-colors"
                >
                  <UploadCloud className="h-4 w-4" />
                  <span>{isAr ? 'اختيار ملف' : 'Select File'}</span>
                </label>
                <input
                  id="file-upload-input"
                  name="file_upload"
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </div>

            {/* Drag and Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`rounded-xl border border-dashed p-4 text-center transition-all ${
                isDragging ? 'border-orange-600 bg-orange-100/50 dark:bg-orange-950/40' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
              }`}
            >
              {selectedFile ? (
                <div className="flex items-center justify-between gap-3 text-left rtl:text-right">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400">
                      {selectedFile.type.includes('pdf') ? <FileText className="h-5 w-5" /> : <Image className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate max-w-xs">{selectedFile.name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {Math.round(selectedFile.size / 1024)} KB - {category}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleUpload}
                      className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors"
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span>{isAr ? 'حفظ وإرفاق' : 'Attach Now'}</span>
                    </button>
                    <button
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewUrl('');
                      }}
                      className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-rose-600 dark:hover:text-rose-400"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    {isAr
                      ? 'يمكنك سحب وإفلات ملفات PDF أو صور تذاكر الميزان هنا مباشرة'
                      : 'Drag & drop PDF files or ticket images directly here'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Attached Files List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                {isAr ? `المرفقات الحالية (${safeAttachments.length})` : `Attached Documents (${safeAttachments.length})`}
              </h3>
            </div>

            {safeAttachments.length === 0 ? (
              <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-8 text-center">
                <File className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                <p className="mt-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  {isAr ? 'لا توجد مرفقات مرتبطة بهذا السجل حتى الآن' : 'No attachments linked to this record yet'}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {isAr ? 'استخدم الزر أعلاه لإضافة تذكرة ميزان أو بوليصة شحن أو سند قبض' : 'Use the uploader above to add scale tickets or waybills'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                {safeAttachments.map((att) => {
                  const isPdf = Boolean(
                    att?.fileType?.toLowerCase().includes('pdf') ||
                    att?.fileName?.toLowerCase().endsWith('.pdf')
                  );

                  return (
                    <div key={att?.id || Math.random()} className="flex items-center justify-between p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {isPdf ? <FileText className="h-5 w-5 text-rose-600" /> : <Image className="h-5 w-5 text-orange-600" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate max-w-sm">{att?.fileName || (isAr ? 'مستند بدون اسم' : 'Unnamed Document')}</p>
                            {att?.docCategory && (
                              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold ${getCategoryBadgeClass(att.docCategory)}`}>
                                {att.docCategory}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {att?.fileSize || '0 KB'} - {att?.uploadedAt ? formatDate(att.uploadedAt) : '-'} - {att?.uploadedBy || '-'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setViewingAttachment(att)}
                          title={isAr ? 'معاينة' : 'Preview'}
                          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-slate-600 dark:text-slate-300 hover:bg-orange-50 dark:hover:bg-slate-700 hover:text-orange-600 dark:hover:text-orange-400 transition-colors shadow-2xs"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {att?.fileData && (
                          <a
                            href={att.fileData}
                            download={att?.fileName || 'attachment'}
                            target="_blank"
                            rel="noreferrer"
                            title={isAr ? 'تحميل' : 'Download'}
                            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-700 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors shadow-2xs"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          onClick={() => {
                            if (onDeleteAttachment) {
                              onDeleteAttachment(att.id);
                            } else if (removeAttachmentFromRecord) {
                              removeAttachmentFromRecord(recordType as any, recordId, att.id);
                            }
                          }}
                          title={isAr ? 'حذف' : 'Delete'}
                          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-slate-400 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400 transition-colors shadow-2xs"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-900 dark:bg-orange-600 hover:bg-slate-800 dark:hover:bg-orange-700 px-5 py-2 text-xs font-bold text-white shadow-xs transition-colors"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>

      {/* Embedded Document Viewer Modal */}
      {viewingAttachment && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="flex max-h-[95vh] w-full max-w-4xl flex-col rounded-3xl bg-white dark:bg-slate-900 shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">{viewingAttachment?.fileName || 'Document'}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {viewingAttachment?.docCategory || 'Attachment'} - {viewingAttachment?.fileSize || ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingAttachment(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-900 p-4 flex items-center justify-center min-h-[400px]">
              {Boolean(viewingAttachment?.fileType?.toLowerCase().includes('pdf') || viewingAttachment?.fileName?.toLowerCase().endsWith('.pdf')) ? (
                <iframe
                  src={viewingAttachment.fileData}
                  className="h-[550px] w-full rounded-xl bg-white border border-slate-800"
                  title={viewingAttachment?.fileName || 'PDF Document'}
                />
              ) : (
                <img
                  src={viewingAttachment.fileData}
                  alt={viewingAttachment?.fileName || 'Attachment Preview'}
                  className="max-h-[550px] max-w-full rounded-xl object-contain shadow-2xl"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
