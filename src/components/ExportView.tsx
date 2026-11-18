import React, { useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, PlusCircle } from 'lucide-react';
import { CallRecord, WorkbookMetadata } from '../types/callsheet';
import { formatTodayDDMMYYYY } from '../utils/statusMapper';
import { RemoveLastEntriesBar } from './RemoveLastEntriesBar';
import { SpreadsheetTable } from './SpreadsheetTable';

interface ExportViewProps {
  metadata: WorkbookMetadata | null;
  masterRecords: CallRecord[];
  addedRecords: CallRecord[];
  onDownloadUpdatedExcel: () => Promise<{ fileName: string; totalRows: number } | null>;
  isExporting: boolean;
  onGoToMaster: () => void;
  onGoToAddRecords?: () => void;
  onRemoveLastFromTotal: (count: number) => Promise<void>;
  onRemoveLastAdded: (count: number) => Promise<void>;
  onClearAllAdded: () => Promise<void>;
}

export const ExportView: React.FC<ExportViewProps> = ({
  metadata,
  masterRecords,
  addedRecords,
  onDownloadUpdatedExcel,
  isExporting,
  onGoToMaster,
  onGoToAddRecords,
  onRemoveLastFromTotal,
  onRemoveLastAdded,
  onClearAllAdded,
}) => {
  const [lastExportResult, setLastExportResult] = useState<{
    fileName: string;
    totalRows: number;
    at: string;
  } | null>(null);

  if (!metadata) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
        <h2 className="text-lg font-bold text-slate-900">No Workbook Ready for Export</h2>
        <p className="mt-1 text-sm text-slate-600">
          Upload your master .xlsx workbook first to generate an updated Excel download.
        </p>
        <button
          type="button"
          onClick={onGoToMaster}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#107C41] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0B5E31]"
        >
          Go to Master Excel
        </button>
      </div>
    );
  }

  const expectedFileName = `Call_Records_Updated_${formatTodayDDMMYYYY()}.xlsx`;
  const totalRecords = masterRecords.length + addedRecords.length;
  const tailPreviewRows = [...masterRecords, ...addedRecords].slice(-10);

  const handleExportClick = async () => {
    const res = await onDownloadUpdatedExcel();
    if (res) {
      setLastExportResult({
        fileName: res.fileName,
        totalRows: res.totalRows,
        at: new Date().toLocaleTimeString(),
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Download Updated Excel</h1>
        <p className="text-xs text-slate-500">
          Review total rows, trim trailing entries if needed, or add more records before generating your .xlsx download. Saved data auto-expires after 7 days.
        </p>
      </div>

      {/* Main Export Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-[#107C41]" />
              <span className="font-mono text-sm font-bold text-slate-900">
                {expectedFileName}
              </span>
            </div>
            <p className="text-xs text-slate-600 tabular-nums">
              Source: {metadata.fileName} · Sheet: {metadata.sheetName} · 7-day retention
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {onGoToAddRecords && (
              <button
                type="button"
                onClick={onGoToAddRecords}
                className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
              >
                <PlusCircle className="h-4 w-4 text-[#107C41]" />
                <span>Add More Records</span>
              </button>
            )}

            <button
              type="button"
              disabled={isExporting}
              onClick={() => void handleExportClick()}
              className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-xl bg-[#107C41] px-6 py-3 text-sm font-bold text-white shadow-xs transition-colors hover:bg-[#0B5E31] disabled:opacity-60 whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              <span>
                {isExporting
                  ? 'Generating Workbook...'
                  : `Download Excel (${totalRecords} Rows)`}
              </span>
            </button>
          </div>
        </div>

        {/* Integrity Checklist */}
        <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 text-xs sm:grid-cols-4">
          <div className="rounded-lg bg-[#F8FAFC] p-3 border border-slate-200/80">
            <div className="text-slate-500">Original Rows Preserved</div>
            <div className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums">
              {masterRecords.length}
            </div>
          </div>
          <div className="rounded-lg bg-[#F8FAFC] p-3 border border-slate-200/80">
            <div className="text-slate-500">New Rows Appended</div>
            <div className="mt-1 font-mono text-base font-bold text-[#107C41] tabular-nums">
              +{addedRecords.length}
            </div>
          </div>
          <div className="rounded-lg bg-[#F8FAFC] p-3 border border-slate-200/80">
            <div className="text-slate-500">Total Output Rows</div>
            <div className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums">
              {totalRecords}
            </div>
          </div>
          <div className="rounded-lg bg-[#F8FAFC] p-3 border border-slate-200/80">
            <div className="text-slate-500">Mobile Formatting</div>
            <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
              Text (@) Locked
            </div>
          </div>
        </div>

        {lastExportResult && (
          <div className="flex items-center gap-2 rounded-xl border border-[#107C41]/30 bg-[#DCFCE7]/50 px-4 py-3 text-sm font-medium text-[#166534]">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              Workbook generated and saved:{' '}
              <span className="font-mono">{lastExportResult.fileName}</span> (
              {lastExportResult.totalRows} total records at {lastExportResult.at}).
            </span>
          </div>
        )}
      </div>

      {/* Pre-Download Remove Last Entries Bar */}
      <RemoveLastEntriesBar
        masterCount={masterRecords.length}
        addedCount={addedRecords.length}
        onRemoveLastFromTotal={onRemoveLastFromTotal}
        onRemoveLastAdded={onRemoveLastAdded}
        onClearAllAdded={onClearAllAdded}
      />

      {/* Bottom Rows Preview (Always shows actual end of output sheet) */}
      {tailPreviewRows.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-900 tabular-nums">
            Bottom {tailPreviewRows.length} Rows of Output Sheet (Rows #{tailPreviewRows[0].rowIndex}–#{tailPreviewRows[tailPreviewRows.length - 1].rowIndex})
          </h3>
          <SpreadsheetTable records={tailPreviewRows} />
        </div>
      )}
    </div>
  );
};
