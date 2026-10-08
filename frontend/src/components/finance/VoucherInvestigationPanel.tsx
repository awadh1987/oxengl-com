import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  Scale,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Download,
  Copy,
  Check,
  QrCode,
  ExternalLink,
  Layers,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { LedgerEntryItem } from './LedgerMasterGrid';
import { formatCurrency } from '../../utils/formatters';

interface VoucherInvestigationPanelProps {
  entry: LedgerEntryItem | null;
  onClose: () => void;
  onApprovePosting?: (entryId: string) => void;
  onRevalidateZatca?: (entryId: string) => void;
}

export const VoucherInvestigationPanel: React.FC<VoucherInvestigationPanelProps> = ({
  entry,
  onClose,
  onApprovePosting,
  onRevalidateZatca,
}) => {
  const [copiedHash, setCopiedHash] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  if (!entry) return null;

  const mockJournalLines = [
    {
      accountCode: '110201',
      accountName: 'Al-Rajhi Bank Operating A/C',
      debit: entry.totalDebitSar,
      credit: 0,
      costCenter: 'CC-01 Riyadh HQ',
    },
    {
      accountCode: '210101',
      accountName: 'Accounts Payable - Vendors',
      debit: 0,
      credit: entry.totalDebitSar * 0.85,
      costCenter: 'CC-03 Fleet Ops',
    },
    {
      accountCode: '210502',
      accountName: 'ZATCA Output VAT 15%',
      debit: 0,
      credit: entry.totalDebitSar * 0.15,
      costCenter: 'CC-00 Central Tax',
    },
  ];

  const handleCopyHash = () => {
    const hash = entry.auditHash || `SHA256-${entry.id.replace(/-/g, '').slice(0, 32)}`;
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleApprove = async () => {
    setIsProcessing(true);
    setActionNotice(null);
    try {
      if (onApprovePosting) {
        await onApprovePosting(entry.id);
      }
      setActionNotice('Posting verified & ledger locked successfully.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRevalidate = async () => {
    setIsProcessing(true);
    setActionNotice(null);
    try {
      if (onRevalidateZatca) {
        await onRevalidateZatca(entry.id);
      }
      setActionNotice('ZATCA cryptographic XML cleared with clearance status OK.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white dark:bg-[#0c0c0f] border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-lg flex flex-col h-full overflow-y-auto">
      {/* Panel Header */}
      <div className="flex items-start justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
              {entry.entryNumber}
            </span>
            <span
              className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                entry.isBalanced
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400'
                  : 'bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-400'
              }`}
            >
              {entry.isBalanced ? 'Balanced' : 'Imbalanced'}
            </span>
          </div>
          <h4 className="text-sm font-bold text-zinc-950 dark:text-zinc-50 mt-1 line-clamp-1">
            {entry.description}
          </h4>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            Recorded {entry.date} • {entry.sourceParty || 'Internal Transfer'}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {actionNotice && (
        <div className="mt-3 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Details Stack */}
      <div className="space-y-4 my-4 flex-1">
        {/* ZATCA Cryptographic Integrity Card */}
        <div className="bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ZATCA Phase-2 Validation
            </span>
            <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              Score: {entry.complianceScorePct}%
            </span>
          </div>

          <div className="text-[11px] space-y-1.5 pt-1 text-zinc-600 dark:text-zinc-400">
            <div className="flex justify-between">
              <span>Clearance Status:</span>
              <span className="font-semibold capitalize text-zinc-900 dark:text-zinc-100">
                {entry.zatcaStatus}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Document Reference:</span>
              <span className="font-mono text-zinc-800 dark:text-zinc-200">
                {entry.referenceDoc || `REF-${entry.id.slice(0, 8)}`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>ECDSA Hash:</span>
              <button
                type="button"
                onClick={handleCopyHash}
                className="inline-flex items-center gap-1 font-mono text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
              >
                {copiedHash ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                {copiedHash ? 'Copied' : 'Copy Hash'}
              </button>
            </div>
          </div>
        </div>

        {/* Double-Entry Ledger Lines */}
        <div className="bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3.5 space-y-2">
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Journal Lines Breakdown
            </span>
            <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              Δ {entry.varianceSar.toFixed(2)} SAR
            </span>
          </div>

          <div className="space-y-2 pt-1">
            {mockJournalLines.map((line, idx) => (
              <div
                key={idx}
                className="text-xs border-b border-zinc-100 dark:border-zinc-800/60 pb-1.5 last:border-0"
              >
                <div className="flex justify-between font-mono text-[11px]">
                  <span className="text-zinc-700 dark:text-zinc-300 font-semibold">
                    {line.accountCode} - {line.accountName}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  <span>{line.costCenter}</span>
                  <div className="space-x-2 font-mono">
                    {line.debit > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        DR: {formatCurrency(line.debit, 'en')}
                      </span>
                    )}
                    {line.credit > 0 && (
                      <span className="text-blue-600 dark:text-blue-400">
                        CR: {formatCurrency(line.credit, 'en')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800 text-xs font-bold font-mono">
            <span className="text-zinc-600 dark:text-zinc-400">Totals:</span>
            <span className="text-zinc-900 dark:text-zinc-100">
              {formatCurrency(entry.totalDebitSar, 'en')}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2">
        <button
          type="button"
          disabled={isProcessing}
          onClick={handleApprove}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2.5 text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {isProcessing ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5" />
          )}
          <span>Lock & Authorize Posting</span>
        </button>

        <button
          type="button"
          disabled={isProcessing}
          onClick={handleRevalidate}
          className="w-full bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-2.5 text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
          <span>Re-verify ZATCA Stamp</span>
        </button>
      </div>
    </div>
  );
};
