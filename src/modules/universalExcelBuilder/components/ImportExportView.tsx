import React, { useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Cloud,
  CloudDownload,
  CloudUpload,
  Download,
  FileSpreadsheet,
  Upload,
} from 'lucide-react';
import { BUILDER_INDUSTRIES, BuilderIndustry } from '../config';
import {
  buildDetectedColumnsFromMatrix,
  exportWorkbookToCsvBlob,
  exportWorkbookToXlsxBlob,
  ParsedSpreadsheetFile,
  parseUploadedSpreadsheetFile,
  triggerBuilderBlobDownload,
} from '../excelIOEngine';
import { createUniqueBuilderId } from '../storage';
import {
  BuilderCellValue,
  BuilderColumn,
  BuilderRecord,
  BuilderShortcutRule,
  BuilderWorkbook,
} from '../types';
import { normalizeCellValue } from '../validationEngine';

interface ImportExportViewProps {
  activeWorkbook: BuilderWorkbook | null;
  records: BuilderRecord[];
  rules: BuilderShortcutRule[];
  user: User | null;
  isSyncingCloud: boolean;
  onCreateWorkbookFromImport: (input: {
    name: string;
    industry: BuilderIndustry;
    sheetName: string;
    headerRowIndex: number;
    columns: BuilderColumn[];
    rows: Array<Record<string, BuilderCellValue>>;
  }) => Promise<void>;
  onAppendImportedRows: (
    rows: Array<Record<string, BuilderCellValue>>
  ) => Promise<void>;
  onPushWorkbookCloud: () => Promise<void>;
  onPullAllCloud: () => Promise<void>;
}

export const ImportExportView: React.FC<ImportExportViewProps> = ({
  activeWorkbook,
  records,
  rules,
  user,
  isSyncingCloud,
  onCreateWorkbookFromImport,
  onAppendImportedRows,
  onPushWorkbookCloud,
  onPullAllCloud,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedFile, setParsedFile] = useState<ParsedSpreadsheetFile | null>(null);
  const [selectedSheetIdx, setSelectedSheetIdx] = useState(0);
  const [headerRowOverride, setHeaderRowOverride] = useState(1);
  const [importTargetMode, setImportTargetMode] = useState<
    'new-with-rows' | 'new-schema-only' | 'append-current'
  >(activeWorkbook ? 'append-current' : 'new-with-rows');
  const [newWorkbookName, setNewWorkbookName] = useState('');
  const [newIndustry, setNewIndustry] =
    useState<BuilderIndustry>('Custom / General');
  const [columnMapping, setColumnMapping] = useState<Record<number, string>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);

  const selectedSheet = parsedFile?.sheets[selectedSheetIdx] ?? null;

  const detectedView = useMemo(() => {
    if (!selectedSheet) return null;
    const { columns, dataRows } = buildDetectedColumnsFromMatrix(
      selectedSheet.rawRows,
      headerRowOverride
    );
    return { columns, dataRows };
  }, [selectedSheet, headerRowOverride]);

  const handleFileChange = async (file: File) => {
    setParseError(null);
    try {
      const parsed = await parseUploadedSpreadsheetFile(file);
      setParsedFile(parsed);
      setSelectedSheetIdx(0);
      setHeaderRowOverride(parsed.sheets[0].headerRowIndex);
      setNewWorkbookName(
        file.name.replace(/\.(xlsx|csv)$/i, '').replace(/[_-]+/g, ' ').trim() ||
          'Imported Workbook'
      );

      // Build initial label-based column map if appending to active workbook
      if (activeWorkbook) {
        const autoMap: Record<number, string> = {};
        parsed.sheets[0].detectedColumns.forEach((srcCol, idx) => {
          const match = activeWorkbook.columns.find(
            (target) =>
              target.label.trim().toLowerCase() ===
              srcCol.label.trim().toLowerCase()
          );
          if (match) {
            autoMap[idx] = match.id;
          }
        });
        setColumnMapping(autoMap);
      }
    } catch (err) {
      setParsedFile(null);
      setParseError(
        err instanceof Error ? err.message : 'Unable to read spreadsheet file.'
      );
    }
  };

  const handleRunImport = async () => {
    if (!selectedSheet || !detectedView) return;
    setIsImporting(true);
    try {
      if (importTargetMode === 'append-current' && activeWorkbook) {
        const mappedRows = detectedView.dataRows.map((rawCells) => {
          const rowValues: Record<string, BuilderCellValue> = {};
          Object.entries(columnMapping).forEach(([srcIdxStr, targetColId]) => {
            if (!targetColId) return;
            const srcIdx = Number(srcIdxStr);
            const targetCol = activeWorkbook.columns.find(
              (c) => c.id === targetColId
            );
            if (targetCol) {
              rowValues[targetCol.id] = normalizeCellValue(
                targetCol,
                rawCells[srcIdx] ?? ''
              );
            }
          });
          return rowValues;
        });
        await onAppendImportedRows(mappedRows);
        setParsedFile(null);
      } else {
        const freshCols: BuilderColumn[] = detectedView.columns.map((c, idx) => ({
          ...c,
          id: createUniqueBuilderId('col'),
          order: idx,
        }));

        const rows =
          importTargetMode === 'new-schema-only'
            ? []
            : detectedView.dataRows.map((rawCells) => {
                const rowValues: Record<string, BuilderCellValue> = {};
                freshCols.forEach((col, colIdx) => {
                  rowValues[col.id] = normalizeCellValue(
                    col,
                    rawCells[colIdx] ?? ''
                  );
                });
                return rowValues;
              });

        await onCreateWorkbookFromImport({
          name: newWorkbookName.trim() || selectedSheet.sheetName,
          industry: newIndustry,
          sheetName: selectedSheet.sheetName,
          headerRowIndex: headerRowOverride,
          columns: freshCols,
          rows,
        });
        setParsedFile(null);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleExportXlsx = async () => {
    if (!activeWorkbook) return;
    setIsExportingXlsx(true);
    try {
      const { blob, fileName } = await exportWorkbookToXlsxBlob(
        activeWorkbook,
        records
      );
      triggerBuilderBlobDownload(blob, fileName);
    } finally {
      setIsExportingXlsx(false);
    }
  };

  const handleExportCsv = () => {
    if (!activeWorkbook) return;
    const { blob, fileName } = exportWorkbookToCsvBlob(activeWorkbook, records);
    triggerBuilderBlobDownload(blob, fileName);
  };

  const handleExportJson = () => {
    if (!activeWorkbook) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            module: 'Universal Excel Builder',
            exportedAt: new Date().toISOString(),
            workbook: activeWorkbook,
            rules,
            records,
          },
          null,
          2
        ),
      ],
      { type: 'application/json' }
    );
    const safeName = activeWorkbook.name.replace(/[^a-zA-Z0-9_-]+/g, '_');
    triggerBuilderBlobDownload(blob, `${safeName}_Backup.json`);
  };

  return (
    <div className="space-y-6">
      {/* Export & Cloud Sync Section (when workbook active) */}
      {activeWorkbook && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Export Formatted Workbook
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Generates a clean Excel file with styled headers, fitted widths, native dropdown validations, frozen header ({activeWorkbook.freezeHeader ? 'On' : 'Off'}), AutoFilter ({activeWorkbook.autoFilter ? 'On' : 'Off'}), and formula-injection sanitization.
                </p>
              </div>
              <FileSpreadsheet className="h-5 w-5 text-[#107C41] shrink-0" />
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                disabled={isExportingXlsx || activeWorkbook.columns.length === 0}
                onClick={() => void handleExportXlsx()}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#107C41] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B5E31] whitespace-nowrap disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                <span>{isExportingXlsx ? 'Building XLSX...' : 'Download .xlsx'}</span>
              </button>
              <button
                type="button"
                disabled={activeWorkbook.columns.length === 0}
                onClick={handleExportCsv}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                <span>Download .csv</span>
              </button>
              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <span>Export JSON</span>
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Cloud Sync (Isolated Builder Collections)
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Sync custom workbooks, columns, rules, and rows permanently to your Google account—completely separated from Call Sheet Manager data.
                </p>
              </div>
              <Cloud className="h-5 w-5 text-[#107C41] shrink-0" />
            </div>

            {!user ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
                Sign in with Google from the CallSheet sign-in or Settings screen to enable cross-device cloud sync for Universal Excel Builder. Local browser storage works permanently offline.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-slate-600 font-mono tabular-nums">
                  Account: {user.email} ·{' '}
                  {activeWorkbook.cloudVersion
                    ? `Cloud v${activeWorkbook.cloudVersion}`
                    : 'Not pushed to cloud yet'}
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={isSyncingCloud}
                    onClick={() => void onPushWorkbookCloud()}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#107C41] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B5E31] whitespace-nowrap disabled:opacity-60"
                  >
                    <CloudUpload className="h-4 w-4" />
                    <span>{isSyncingCloud ? 'Syncing...' : 'Push Workbook to Cloud'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSyncingCloud}
                    onClick={() => void onPullAllCloud()}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap disabled:opacity-60"
                  >
                    <CloudDownload className="h-4 w-4" />
                    <span>Pull Cloud Workbooks</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Spreadsheet Import Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Import Existing Spreadsheet (.xlsx or .csv)
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Automatically inspects headers, infers column types, extracts Excel dropdown lists, and lets you import rows or create a reusable workbook structure. Legacy .xls files should be saved as .xlsx or .csv first.
            </p>
          </div>
          <div className="shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileChange(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#107C41] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B5E31] whitespace-nowrap"
            >
              <Upload className="h-4 w-4" />
              <span>Choose .xlsx / .csv File</span>
            </button>
          </div>
        </div>

        {parseError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800"
          >
            {parseError}
          </div>
        )}

        {parsedFile && selectedSheet && detectedView && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Worksheet Tab
                </label>
                <select
                  value={selectedSheetIdx}
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    setSelectedSheetIdx(idx);
                    setHeaderRowOverride(
                      parsedFile.sheets[idx].headerRowIndex
                    );
                  }}
                  className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                >
                  {parsedFile.sheets.map((s, idx) => (
                    <option key={s.sheetName} value={idx}>
                      {s.sheetName} ({s.rowCount} rows)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Header Row Position
                </label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, selectedSheet.rawRows.length)}
                  value={headerRowOverride}
                  onChange={(e) =>
                    setHeaderRowOverride(Math.max(1, Number(e.target.value) || 1))
                  }
                  className="w-full min-h-[38px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Import Destination
                </label>
                <select
                  value={importTargetMode}
                  onChange={(e) =>
                    setImportTargetMode(
                      e.target.value as
                        | 'new-with-rows'
                        | 'new-schema-only'
                        | 'append-current'
                    )
                  }
                  className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                >
                  {activeWorkbook && (
                    <option value="append-current">
                      Append Rows to &ldquo;{activeWorkbook.name}&rdquo;
                    </option>
                  )}
                  <option value="new-with-rows">
                    Create New Workbook (Columns + All Rows)
                  </option>
                  <option value="new-schema-only">
                    Create New Workbook (Schema Only, 0 Rows)
                  </option>
                </select>
              </div>
            </div>

            {importTargetMode !== 'append-current' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    New Workbook Name
                  </label>
                  <input
                    type="text"
                    value={newWorkbookName}
                    onChange={(e) => setNewWorkbookName(e.target.value)}
                    className="w-full min-h-[38px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Industry
                  </label>
                  <select
                    value={newIndustry}
                    onChange={(e) =>
                      setNewIndustry(e.target.value as BuilderIndustry)
                    }
                    className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                  >
                    {BUILDER_INDUSTRIES.map((ind) => (
                      <option key={ind} value={ind}>
                        {ind}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              activeWorkbook && (
                <div className="rounded-xl border border-slate-200 p-4 space-y-2.5">
                  <div className="text-xs font-semibold text-slate-800">
                    Map Imported Columns to &ldquo;{activeWorkbook.name}&rdquo;
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {detectedView.columns.map((srcCol, srcIdx) => (
                      <div
                        key={srcCol.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"
                      >
                        <span className="font-medium text-slate-800 truncate">
                          {srcCol.label}
                        </span>
                        <select
                          value={columnMapping[srcIdx] ?? ''}
                          onChange={(e) =>
                            setColumnMapping((prev) => ({
                              ...prev,
                              [srcIdx]: e.target.value,
                            }))
                          }
                          aria-label={`Map column ${srcCol.label}`}
                          className="min-h-[32px] max-w-[150px] rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          <option value="">-- Skip --</option>
                          {activeWorkbook.columns.map((target) => (
                            <option key={target.id} value={target.id}>
                              {target.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}

            {/* Detected Schema Preview */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
                    <th className="py-2 px-3">Detected Column</th>
                    <th className="py-2 px-3">Inferred Type</th>
                    <th className="py-2 px-3">Dropdown Values</th>
                    <th className="py-2 px-3">Sample Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {detectedView.columns.map((col, idx) => (
                    <tr key={col.id} className="h-[38px]">
                      <td className="px-3 py-1.5 font-semibold text-slate-900">
                        {col.label}
                      </td>
                      <td className="px-3 py-1.5 text-slate-600">{col.type}</td>
                      <td className="px-3 py-1.5 text-slate-600">
                        {col.dropdownOptions.length > 0
                          ? col.dropdownOptions.slice(0, 6).join(', ')
                          : '—'}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-slate-500">
                        {detectedView.dataRows[0]?.[idx] || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setParsedFile(null)}
                className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isImporting}
                onClick={() => void handleRunImport()}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#107C41] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0B5E31] whitespace-nowrap disabled:opacity-60"
              >
                <Upload className="h-4 w-4" />
                <span>
                  {isImporting
                    ? 'Importing...'
                    : importTargetMode === 'new-schema-only'
                      ? 'Create Template Workbook (0 Rows)'
                      : `Import ${detectedView.dataRows.length} Row${
                          detectedView.dataRows.length === 1 ? '' : 's'
                        }`}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
