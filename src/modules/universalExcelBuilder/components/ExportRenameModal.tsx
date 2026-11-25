import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, RotateCcw, X } from 'lucide-react';
import { BuilderWorkbook } from '../types';
import { BuilderExportFormat, sanitizeDownloadFileBase } from '../excelIOEngine';
import { sanitizeSheetName } from '../storage';

export interface ExportRenamePayload {
  format: BuilderExportFormat;
  fileName: string;
  sheetName: string;
  headerOverrides: Record<string, string>;
  persistChangesToWorkbook: boolean;
}

interface ExportRenameModalProps {
  workbook: BuilderWorkbook;
  rowCount: number;
  initialFormat?: BuilderExportFormat;
  isExporting: boolean;
  onClose: () => void;
  onConfirmDownload: (payload: ExportRenamePayload) => Promise<void>;
}

function getDateParts(now = new Date()) {
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return {
    ddmmyyyy: `${dd}-${mm}-${yyyy}`,
    yyyymmdd: `${yyyy}-${mm}-${dd}`,
    dateTime: `${yyyy}-${mm}-${dd}_${hh}-${min}`,
  };
}

function toTitleCase(input: string): string {
  return input
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export const ExportRenameModal: React.FC<ExportRenameModalProps> = ({
  workbook,
  rowCount,
  initialFormat = 'xlsx',
  isExporting,
  onClose,
  onConfirmDownload,
}) => {
  const [format, setFormat] = useState<BuilderExportFormat>(initialFormat);
  const [fileBaseName, setFileBaseName] = useState<string>(() =>
    sanitizeDownloadFileBase(
      initialFormat === 'json' ? `${workbook.name}_Backup` : workbook.name
    )
  );
  const [sheetName, setSheetName] = useState<string>(workbook.sheetName || 'Records');
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');
  const [persistChanges, setPersistChanges] = useState(false);
  const [showColumnRenames, setShowColumnRenames] = useState(false);

  const orderedCols = useMemo(
    () => [...workbook.columns].sort((a, b) => a.order - b.order),
    [workbook.columns]
  );

  const [headerOverrides, setHeaderOverrides] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const col of workbook.columns) {
      initial[col.id] = col.label;
    }
    return initial;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExporting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExporting, onClose]);

  const combinedRawFileName = useMemo(() => {
    const parts = [prefix.trim(), fileBaseName.trim(), suffix.trim()].filter(Boolean);
    return parts.join('_') || workbook.name;
  }, [prefix, fileBaseName, suffix, workbook.name]);

  const sanitizedFileBase = useMemo(
    () => sanitizeDownloadFileBase(combinedRawFileName, 'Workbook'),
    [combinedRawFileName]
  );

  const sanitizedTabName = useMemo(
    () => sanitizeSheetName(sheetName),
    [sheetName]
  );

  const renamedHeaderCount = useMemo(() => {
    let count = 0;
    for (const col of orderedCols) {
      const next = (headerOverrides[col.id] ?? '').trim();
      if (next && next !== col.label) {
        count += 1;
      }
    }
    return count;
  }, [orderedCols, headerOverrides]);

  const dates = useMemo(() => getDateParts(), []);

  const applyFilePreset = (preset: string) => {
    const base = sanitizeDownloadFileBase(workbook.name, 'Workbook');
    switch (preset) {
      case 'base':
        setFileBaseName(base);
        setPrefix('');
        setSuffix('');
        break;
      case 'ddmmyyyy':
        setFileBaseName(`${base}_${dates.ddmmyyyy}`);
        break;
      case 'yyyymmdd':
        setFileBaseName(`${base}_${dates.yyyymmdd}`);
        break;
      case 'datetime':
        setFileBaseName(`${base}_${dates.dateTime}`);
        break;
      case 'rows':
        setFileBaseName(`${base}_${rowCount}_rows`);
        break;
      case 'industry': {
        const ind = sanitizeDownloadFileBase(workbook.industry, 'General').replace(/\s+/g, '_');
        setFileBaseName(`${ind}_${base}`);
        break;
      }
      case 'tab':
        setFileBaseName(sanitizeDownloadFileBase(sanitizedTabName, base));
        break;
      case 'underscores':
        setFileBaseName((prev) => prev.trim().replace(/\s+/g, '_'));
        break;
      case 'titlecase':
        setFileBaseName((prev) => toTitleCase(prev));
        break;
      case 'uppercase':
        setFileBaseName((prev) => prev.toUpperCase());
        break;
      case 'lowercase':
        setFileBaseName((prev) => prev.toLowerCase());
        break;
      default:
        break;
    }
  };

  const applySheetPreset = (preset: string) => {
    switch (preset) {
      case 'saved':
        setSheetName(workbook.sheetName || 'Records');
        break;
      case 'workbook':
        setSheetName(sanitizeSheetName(workbook.name));
        break;
      case 'records':
        setSheetName('Records');
        break;
      case 'data':
        setSheetName('Data');
        break;
      case 'date':
        setSheetName(sanitizeSheetName(dates.ddmmyyyy));
        break;
      case 'summary':
        setSheetName('Summary');
        break;
      default:
        break;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOverrides: Record<string, string> = {};
    for (const col of orderedCols) {
      const next = (headerOverrides[col.id] ?? '').trim();
      if (next && next !== col.label) {
        cleanOverrides[col.id] = next;
      }
    }
    await onConfirmDownload({
      format,
      fileName: sanitizedFileBase,
      sheetName: sanitizedTabName,
      headerOverrides: cleanOverrides,
      persistChangesToWorkbook: persistChanges,
    });
  };

  const canExportSpreadsheet = format === 'json' || orderedCols.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-rename-title"
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 shrink-0">
          <div className="min-w-0">
            <h2
              id="export-rename-title"
              className="text-base font-semibold text-slate-900"
            >
              Rename &amp; Download Options
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 font-mono tabular-nums truncate">
              {workbook.name} · {orderedCols.length} cols · {rowCount} rows
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            aria-label="Close download options"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex-1 overflow-y-auto p-6 space-y-5"
        >
          {/* Export Format Tabs */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs font-semibold text-slate-700">
              Export File Type
            </span>
            <div
              role="group"
              aria-label="Choose export format"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start"
            >
              {(
                [
                  { id: 'xlsx', label: 'Excel (.xlsx)' },
                  { id: 'csv', label: 'CSV (.csv)' },
                  { id: 'json', label: 'JSON Backup (.json)' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFormat(opt.id)}
                  className={`min-h-[34px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    format === opt.id
                      ? 'bg-white text-[#107C41] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 1. File Name Rename */}
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="export-file-name"
                className="text-xs font-semibold text-slate-800"
              >
                Download File Name
              </label>
              <button
                type="button"
                onClick={() => applyFilePreset('base')}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset</span>
              </button>
            </div>

            <div className="flex items-stretch rounded-lg border border-slate-300 bg-white focus-within:border-[#107C41] focus-within:ring-2 focus-within:ring-[#107C41]/15 overflow-hidden">
              <input
                id="export-file-name"
                type="text"
                autoFocus
                maxLength={120}
                value={fileBaseName}
                onChange={(e) => setFileBaseName(e.target.value)}
                placeholder="Enter custom file name"
                className="flex-1 min-w-0 min-h-[42px] px-3.5 py-2 text-sm text-slate-900 focus:outline-none"
              />
              <span className="inline-flex items-center border-l border-slate-200 bg-slate-50 px-3 text-xs font-mono font-semibold text-slate-600 select-none">
                .{format}
              </span>
            </div>

            {/* Prefix & Suffix */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="export-prefix"
                  className="block text-xs font-medium text-slate-600 mb-1"
                >
                  Optional Prefix
                </label>
                <input
                  id="export-prefix"
                  type="text"
                  maxLength={32}
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="e.g., Final, Client, BranchA"
                  className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#107C41] focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="export-suffix"
                  className="block text-xs font-medium text-slate-600 mb-1"
                >
                  Optional Suffix
                </label>
                <input
                  id="export-suffix"
                  type="text"
                  maxLength={32}
                  value={suffix}
                  onChange={(e) => setSuffix(e.target.value)}
                  placeholder="e.g., v2, Approved, Shift1"
                  className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#107C41] focus:outline-none"
                />
              </div>
            </div>

            {/* Quick File Naming Presets & Case Formatters */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-500">
                Quick File Name Presets &amp; Formatting
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'base', label: 'Workbook Name' },
                  { id: 'ddmmyyyy', label: `+ ${dates.ddmmyyyy}` },
                  { id: 'yyyymmdd', label: `+ ${dates.yyyymmdd}` },
                  { id: 'datetime', label: '+ Date & Time' },
                  { id: 'rows', label: `+ ${rowCount} Rows` },
                  { id: 'industry', label: '+ Industry' },
                  { id: 'tab', label: 'Use Tab Name' },
                  { id: 'underscores', label: 'Spaces to _' },
                  { id: 'titlecase', label: 'Title Case' },
                  { id: 'uppercase', label: 'UPPERCASE' },
                  { id: 'lowercase', label: 'lowercase' },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyFilePreset(preset.id)}
                    className="min-h-[32px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-100 whitespace-nowrap"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs text-slate-500 font-mono truncate">
              Output file: <span className="font-semibold text-slate-800">{sanitizedFileBase}.{format}</span>
            </div>
          </div>

          {/* 2. Worksheet Tab Name Rename (XLSX / Saved Tab) */}
          {format !== 'csv' && (
            <div className="border-t border-slate-200 pt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="export-sheet-tab"
                  className="text-xs font-semibold text-slate-800"
                >
                  Excel Worksheet Tab Name
                </label>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {sanitizedTabName.length} / 31 chars
                </span>
              </div>

              <input
                id="export-sheet-tab"
                type="text"
                maxLength={31}
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                placeholder="Records"
                className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/15"
              />

              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'saved', label: `Current (${workbook.sheetName || 'Records'})` },
                  { id: 'workbook', label: 'Workbook Name' },
                  { id: 'records', label: 'Records' },
                  { id: 'data', label: 'Data' },
                  { id: 'date', label: dates.ddmmyyyy },
                  { id: 'summary', label: 'Summary' },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applySheetPreset(preset.id)}
                    className="min-h-[32px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-100 whitespace-nowrap"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Sanitized tab inside Excel: <span className="font-mono font-semibold text-slate-700">{sanitizedTabName}</span> (characters <span className="font-mono">\ / * ? : [ ]</span> are automatically stripped).
              </p>
            </div>
          )}

          {/* 3. Optional Column Header Rename for This Download */}
          {orderedCols.length > 0 && (
            <div className="border-t border-slate-200 pt-4 space-y-3">
              <button
                type="button"
                onClick={() => setShowColumnRenames((v) => !v)}
                className="flex w-full items-center justify-between text-left text-xs font-semibold text-slate-800 hover:text-[#107C41]"
              >
                <span className="inline-flex items-center gap-1.5">
                  {showColumnRenames ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <span>Rename Column Headers Before Download (Optional)</span>
                </span>
                <span className="font-mono font-normal text-slate-500">
                  {renamedHeaderCount > 0 ? `${renamedHeaderCount} renamed` : `${orderedCols.length} columns`}
                </span>
              </button>

              {showColumnRenames && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Customize column titles in the exported file.</span>
                    <button
                      type="button"
                      onClick={() => {
                        const resetMap: Record<string, string> = {};
                        for (const col of orderedCols) {
                          resetMap[col.id] = col.label;
                        }
                        setHeaderOverrides(resetMap);
                      }}
                      className="font-medium text-slate-600 hover:text-slate-900"
                    >
                      Reset All Headers
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 max-h-52 overflow-y-auto pr-1">
                    {orderedCols.map((col, idx) => (
                      <div key={col.id} className="space-y-1">
                        <label
                          htmlFor={`export-col-${col.id}`}
                          className="block text-[11px] font-medium text-slate-500 truncate"
                        >
                          Col {idx + 1}: {col.label}
                        </label>
                        <input
                          id={`export-col-${col.id}`}
                          type="text"
                          maxLength={80}
                          value={headerOverrides[col.id] ?? col.label}
                          onChange={(e) =>
                            setHeaderOverrides((prev) => ({
                              ...prev,
                              [col.id]: e.target.value,
                            }))
                          }
                          className="w-full min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-[#107C41] focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. Save Back to Workbook Option */}
          <div className="border-t border-slate-200 pt-4">
            <label className="inline-flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={persistChanges}
                onChange={(e) => setPersistChanges(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#107C41] focus:ring-[#107C41]"
              />
              <span>
                <span className="font-semibold text-slate-800">
                  Save these renamed names back to the workbook
                </span>
                <span className="block text-slate-500 mt-0.5">
                  Updates the workbook name, worksheet tab name, and any renamed column headers permanently for future downloads. Leave unchecked for a one-time export rename.
                </span>
              </span>
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex flex-col-reverse gap-2.5 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-500 font-mono truncate">
              {sanitizedFileBase}.{format}
              {format === 'xlsx' ? ` · Tab: ${sanitizedTabName}` : ''}
            </div>
            <div className="flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={isExporting}
                className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isExporting || !canExportSpreadsheet}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#107C41] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0B5E31] whitespace-nowrap disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                <span>
                  {isExporting
                    ? 'Preparing File...'
                    : `Download .${format}`}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
