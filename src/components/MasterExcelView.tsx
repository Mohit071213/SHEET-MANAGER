import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RotateCcw,
  Scissors,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import {
  CallRecord,
  EmployeeName,
  EXACT_EXCEL_HEADERS,
  GlobalEntryDefaults,
  ShortcutRule,
  WorkbookMetadata,
} from '../types/callsheet';
import { CallsheetFileImportPanel } from './CallsheetFileImportPanel';

interface MasterExcelViewProps {
  employeeName: EmployeeName;
  metadata: WorkbookMetadata | null;
  addedCount: number;
  existingRecords: CallRecord[];
  shortcutRules: ShortcutRule[];
  globalDefaults: GlobalEntryDefaults;
  backupMetadata: WorkbookMetadata | null;
  hasBackupBuffer: boolean;
  onUploadFile: (file: File) => Promise<void>;
  onCreateBlankTemplate: () => Promise<void>;
  onAppendImportedRecords: (records: CallRecord[]) => Promise<void>;
  onDownloadBackupExcel: () => void;
  onRestoreBackup: () => Promise<void>;
  onTrimMasterToCount?: (keepCount: number) => Promise<void>;
}

export const MasterExcelView: React.FC<MasterExcelViewProps> = ({
  employeeName,
  metadata,
  addedCount,
  existingRecords,
  shortcutRules,
  globalDefaults,
  backupMetadata,
  hasBackupBuffer,
  onUploadFile,
  onCreateBlankTemplate,
  onAppendImportedRecords,
  onDownloadBackupExcel,
  onRestoreBackup,
  onTrimMasterToCount,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [keepCountInput, setKeepCountInput] = useState<number>(() =>
    metadata && metadata.originalRecordCount > 97
      ? 97
      : (metadata?.originalRecordCount ?? 97)
  );
  const [confirmTrim, setConfirmTrim] = useState(false);
  const [isTrimming, setIsTrimming] = useState(false);

  useEffect(() => {
    if (metadata) {
      setKeepCountInput(
        metadata.originalRecordCount > 97 ? 97 : metadata.originalRecordCount
      );
      setConfirmTrim(false);
    }
  }, [metadata]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void onUploadFile(file);
    }
  };

  const handleConfirmTrim = async () => {
    if (!onTrimMasterToCount || !metadata) return;
    setIsTrimming(true);
    try {
      await onTrimMasterToCount(keepCountInput);
      setConfirmTrim(false);
    } finally {
      setIsTrimming(false);
    }
  };

  const canTrim =
    Boolean(metadata) &&
    Boolean(onTrimMasterToCount) &&
    keepCountInput >= 0 &&
    keepCountInput < (metadata?.originalRecordCount ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Master Excel Workbook</h1>
        <p className="text-xs text-slate-500">
          Upload or replace your master .xlsx file. Existing records, sheet name, column widths, frozen headers, and filters are preserved.
        </p>
      </div>

      {/* Upload / Replace Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
          isDragging
            ? 'border-[#107C41] bg-[#DCFCE7]/30'
            : 'border-slate-300 bg-white'
        }`}
      >
        <FileSpreadsheet className="mx-auto h-9 w-9 text-[#107C41]" />
        <h2 className="mt-3 text-base font-bold text-slate-900">
          {metadata ? 'Replace Master Excel (.xlsx)' : 'Upload Master Excel (.xlsx)'}
        </h2>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-600">
          {metadata
            ? 'Uploading a newer version automatically creates a local backup of your current workbook before replacing it.'
            : 'Select your customer calling sheet (.xlsx) from your phone storage or computer.'}
        </p>

        <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <label className="inline-flex min-h-[46px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#107C41] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0B5E31] whitespace-nowrap">
            <Upload className="h-4 w-4" />
            <span>{metadata ? 'Choose Newer .xlsx File' : 'Select .xlsx File'}</span>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void onUploadFile(file);
                  e.target.value = '';
                }
              }}
            />
          </label>

          <button
            type="button"
            onClick={() => void onCreateBlankTemplate()}
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <FileSpreadsheet className="h-4 w-4 text-[#107C41]" />
            <span>Create Blank 10-Column Sheet</span>
          </button>
        </div>
      </div>

      {/* Import & Append Pre-Existing Sheet from PC / Phone */}
      <CallsheetFileImportPanel
        title="Append Pre-Existing Sheet from PC or Phone (.xlsx / .csv)"
        subtitle={
          metadata
            ? `Import rows from an existing Excel or CSV file, preview auto-mapped columns & duplicates, and append directly into "${metadata.fileName}" without overwriting existing records.`
            : `Import rows from an existing Excel or CSV file to automatically initialize ${employeeName}'s 10-column sheet and append the imported rows.`
        }
        employeeName={employeeName}
        metadata={metadata}
        existingRecords={existingRecords}
        shortcutRules={shortcutRules}
        globalDefaults={globalDefaults}
        onAppendRecords={onAppendImportedRecords}
      />

      {/* Loaded Workbook Inspector */}
      {metadata && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="h-4 w-4 text-[#166534] shrink-0" />
              <h3 className="truncate text-sm font-bold text-slate-900">
                Loaded: {metadata.fileName}
              </h3>
            </div>
            <span className="font-mono text-xs text-slate-500 tabular-nums shrink-0">
              {(metadata.fileSizeBytes / 1024).toFixed(1)} KB
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
            <div>
              <div className="text-slate-500">Worksheet Name</div>
              <div className="mt-0.5 font-semibold text-slate-900">{metadata.sheetName}</div>
            </div>
            <div>
              <div className="text-slate-500">Original Records</div>
              <div className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                {metadata.originalRecordCount}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Pending Appends</div>
              <div className="mt-0.5 font-mono font-semibold text-[#107C41] tabular-nums">
                +{addedCount}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Date Format</div>
              <div className="mt-0.5 font-mono font-semibold text-slate-900">
                {metadata.dateFormat}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Frozen Header</div>
              <div className="mt-0.5 font-semibold text-slate-900">
                {metadata.hasFrozenHeader ? 'Preserved' : 'Not set in file'}
              </div>
            </div>
            <div>
              <div className="text-slate-500">AutoFilter</div>
              <div className="mt-0.5 font-semibold text-slate-900">
                {metadata.hasAutoFilter ? 'Preserved & auto-expanded' : 'Not set in file'}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Worksheets Preserved</div>
              <div className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                {metadata.sheetNames?.length ?? 1}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Excel Dropdown Rules</div>
              <div className="mt-0.5 font-semibold text-slate-900">
                {metadata.hasDropdownValidations ? 'Preserved & extended' : 'Enforced via app'}
              </div>
              {metadata.workbookDropdowns &&
                (metadata.workbookDropdowns.categories ||
                  metadata.workbookDropdowns.subcategories ||
                  metadata.workbookDropdowns.remarks) && (
                  <div className="mt-0.5 font-mono text-[10px] text-slate-500 tabular-nums">
                    Cat {metadata.workbookDropdowns.categories?.length ?? 3} · Sub{' '}
                    {metadata.workbookDropdowns.subcategories?.length ?? 6} · Rem{' '}
                    {metadata.workbookDropdowns.remarks?.length ?? 45}
                  </div>
                )}
            </div>
          </div>

          <div className="border-t border-slate-200 pt-3">
            <div className="text-xs font-semibold text-slate-700 mb-2">
              Detected Workbook Columns ({metadata.headers?.length ?? EXACT_EXCEL_HEADERS.length})
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px] font-mono text-slate-600">
              {(metadata.headers && metadata.headers.length > 0
                ? metadata.headers
                : EXACT_EXCEL_HEADERS
              ).map((h, i) => (
                <span
                  key={`${h}-${i}`}
                  className="rounded border border-slate-200 bg-[#F8FAFC] px-2 py-1"
                >
                  {i + 1}. {h}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Master Copy Protection & Row Trim */}
      {metadata && metadata.originalRecordCount > 0 && onTrimMasterToCount && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <Scissors className="mt-0.5 h-4 w-4 text-slate-700 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Master Copy Row Trim
                </h3>
                <p className="text-xs text-slate-500">
                  Keep only the first N master entries (for example, keep 97 rows and drop trailing test rows). Automatic pre-trim backup is saved first.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <label className="text-xs font-semibold text-slate-700">
                Keep first:
              </label>
              <input
                type="number"
                min={0}
                max={metadata.originalRecordCount}
                value={keepCountInput}
                onChange={(e) => {
                  const val = Math.max(
                    0,
                    Math.min(metadata.originalRecordCount, Number(e.target.value) || 0)
                  );
                  setKeepCountInput(val);
                  setConfirmTrim(false);
                }}
                className="h-10 w-20 rounded-lg border border-slate-300 bg-white px-2.5 text-center font-mono text-xs text-slate-900"
              />
              <button
                type="button"
                disabled={!canTrim}
                onClick={() => setConfirmTrim(true)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 whitespace-nowrap"
              >
                <Scissors className="h-3.5 w-3.5" />
                <span>Trim Master to {keepCountInput} Rows</span>
              </button>
            </div>
          </div>

          {confirmTrim && canTrim && (
            <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2 text-xs font-semibold text-amber-950">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <span>
                  Keep first {keepCountInput} master rows and remove the trailing{' '}
                  {metadata.originalRecordCount - keepCountInput} row(s) (plus any pending appends)? A backup of your current {metadata.originalRecordCount}-row master is saved automatically.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={isTrimming}
                  onClick={() => void handleConfirmTrim()}
                  className="min-h-[38px] rounded-lg bg-[#107C41] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0B5E31] disabled:opacity-60 whitespace-nowrap"
                >
                  {isTrimming ? 'Trimming...' : 'Confirm Trim'}
                </button>
                <button
                  type="button"
                  disabled={isTrimming}
                  onClick={() => setConfirmTrim(false)}
                  className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Automatic Pre-Edit Backup Card */}
      {hasBackupBuffer && (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-[#107C41] shrink-0" />
            <div>
              <div className="text-sm font-bold text-slate-900">
                Automatic Pre-Edit Backup Available
              </div>
              <div className="text-xs text-slate-500">
                Previous workbook: {backupMetadata?.fileName ?? 'Master backup'} (
                {backupMetadata?.originalRecordCount ?? 0} rows)
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onDownloadBackupExcel}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Backup .xlsx</span>
            </button>
            <button
              type="button"
              onClick={() => void onRestoreBackup()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Restore Previous</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
