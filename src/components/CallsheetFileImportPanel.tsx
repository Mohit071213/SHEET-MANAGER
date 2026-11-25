import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Upload,
  X,
} from 'lucide-react';
import {
  CallRecord,
  CallStatus,
  EmployeeName,
  GlobalEntryDefaults,
  PERMITTED_REMARKS,
  RemarkOption,
  ShortcutRule,
  WorkbookMetadata,
} from '../types/callsheet';
import {
  autoMapCallsheetHeaders,
  buildCallsheetImportDrafts,
  CALLSHEET_FIELD_OPTIONS,
  CallsheetImportDraftRow,
  CallsheetTargetField,
  extractHeadersAndRows,
  finalizeImportedCallRecords,
  parseCallsheetImportFile,
  ParsedCallsheetImportFile,
} from '../utils/callsheetImportEngine';

interface CallsheetFileImportPanelProps {
  title?: string;
  subtitle?: string;
  employeeName: EmployeeName;
  metadata: WorkbookMetadata | null;
  existingRecords: CallRecord[];
  shortcutRules: ShortcutRule[];
  globalDefaults: GlobalEntryDefaults;
  onAppendRecords: (records: CallRecord[]) => Promise<void>;
  onEnsureMasterWorkbookFirst?: () => Promise<WorkbookMetadata | null>;
}

export const CallsheetFileImportPanel: React.FC<CallsheetFileImportPanelProps> = ({
  title = 'Import & Append from File (.xlsx / .csv)',
  subtitle = 'Select an existing spreadsheet from your PC or phone to auto-map headers, preview duplicates, and append rows without overwriting your master sheet.',
  employeeName,
  metadata,
  existingRecords,
  shortcutRules,
  globalDefaults,
  onAppendRecords,
  onEnsureMasterWorkbookFirst,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsedFile, setParsedFile] = useState<ParsedCallsheetImportFile | null>(
    null
  );
  const [selectedSheetIdx, setSelectedSheetIdx] = useState(0);
  const [headerRowIndex, setHeaderRowIndex] = useState(1);
  const [columnMapping, setColumnMapping] = useState<
    Record<number, CallsheetTargetField>
  >({});
  const [drafts, setDrafts] = useState<CallsheetImportDraftRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isAppending, setIsAppending] = useState(false);

  const selectedSheet = parsedFile?.sheets[selectedSheetIdx] ?? null;

  const extracted = useMemo(() => {
    if (!selectedSheet) return null;
    return extractHeadersAndRows(selectedSheet, headerRowIndex);
  }, [selectedSheet, headerRowIndex]);

  useEffect(() => {
    if (!extracted) return;
    const autoMap = autoMapCallsheetHeaders(extracted.headers);
    setColumnMapping(autoMap);
  }, [extracted]);

  useEffect(() => {
    if (!extracted) {
      setDrafts([]);
      return;
    }
    const built = buildCallsheetImportDrafts({
      dataRows: extracted.dataRows,
      headerRowIndex,
      columnMapping,
      existingRecords,
      shortcutRules,
      globalDefaults,
      employeeName,
    });
    setDrafts(built);
  }, [
    extracted,
    headerRowIndex,
    columnMapping,
    existingRecords,
    shortcutRules,
    globalDefaults,
    employeeName,
  ]);

  const handleFileSelected = async (file: File) => {
    setParseError(null);
    setStatusMessage(null);
    try {
      const parsed = await parseCallsheetImportFile(file);
      setParsedFile(parsed);
      setSelectedSheetIdx(0);
      setHeaderRowIndex(parsed.sheets[0].headerRowIndex);
    } catch (err) {
      setParsedFile(null);
      setDrafts([]);
      setParseError(
        err instanceof Error ? err.message : 'Could not read spreadsheet file.'
      );
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFileSelected(file);
  };

  const summary = useMemo(() => {
    let selectedCount = 0;
    let dupCount = 0;
    let missingIdCount = 0;
    for (const d of drafts) {
      if (d.include) selectedCount += 1;
      if (d.isDuplicateMobile || d.isDuplicateSerial || d.isDuplicateBatch) {
        dupCount += 1;
      }
      if (d.missingIdentifier) missingIdCount += 1;
    }
    return {
      total: drafts.length,
      selectedCount,
      dupCount,
      missingIdCount,
    };
  }, [drafts]);

  const handleConfirmAppend = async () => {
    if (summary.selectedCount === 0) return;
    setIsAppending(true);
    setParseError(null);
    try {
      let activeMeta = metadata;
      if (!activeMeta && onEnsureMasterWorkbookFirst) {
        activeMeta = await onEnsureMasterWorkbookFirst();
      }
      const startRowIndex =
        (activeMeta?.headerRowIndex ?? 1) + existingRecords.length + 1;
      const finalRecords = finalizeImportedCallRecords({
        drafts,
        startRowIndex,
        employeeName,
        globalDefaults,
      });
      if (finalRecords.length === 0) return;

      await onAppendRecords(finalRecords);
      setStatusMessage(
        `Appended ${finalRecords.length} row${
          finalRecords.length === 1 ? '' : 's'
        } from "${parsedFile?.fileName ?? 'file'}" into ${employeeName}'s sheet.`
      );
      setParsedFile(null);
      setDrafts([]);
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Failed to append imported rows.'
      );
    } finally {
      setIsAppending(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>

        <div className="shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileSelected(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#107C41] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B5E31] whitespace-nowrap"
          >
            <Upload className="h-4 w-4" />
            <span>Import File (.xlsx / .csv)</span>
          </button>
        </div>
      </div>

      {!parsedFile && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`cursor-pointer rounded-xl border border-dashed px-4 py-5 text-center transition-colors ${
            isDragging
              ? 'border-[#107C41] bg-[#DCFCE7]/30'
              : 'border-slate-300 bg-slate-50/60 hover:border-slate-400'
          }`}
        >
          <FileSpreadsheet className="mx-auto h-6 w-6 text-[#107C41]" />
          <p className="mt-1.5 text-xs font-medium text-slate-700">
            Tap to browse from phone or PC, or drop an .xlsx / .csv file here to append rows
          </p>
        </div>
      )}

      {statusMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-[#107C41]/30 bg-[#DCFCE7]/50 px-4 py-2.5 text-xs font-semibold text-[#166534]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {parseError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <span>{parseError}</span>
        </div>
      )}

      {parsedFile && selectedSheet && extracted && (
        <div className="space-y-4 border-t border-slate-200 pt-4">
          {/* File Metadata & Sheet Controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 flex-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Worksheet ({parsedFile.fileName})
                </label>
                <select
                  value={selectedSheetIdx}
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    setSelectedSheetIdx(idx);
                    setHeaderRowIndex(parsedFile.sheets[idx].headerRowIndex);
                  }}
                  className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                >
                  {parsedFile.sheets.map((s, idx) => (
                    <option key={s.sheetName} value={idx}>
                      {s.sheetName} ({Math.max(0, s.rawRows.length - 1)} rows)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Header Row Number
                </label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, selectedSheet.rawRows.length)}
                  value={headerRowIndex}
                  onChange={(e) =>
                    setHeaderRowIndex(Math.max(1, Number(e.target.value) || 1))
                  }
                  className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono tabular-nums"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setParsedFile(null);
                setDrafts([]);
              }}
              className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 self-start sm:self-auto"
            >
              <X className="h-3.5 w-3.5" />
              <span>Clear File</span>
            </button>
          </div>

          {/* Column Auto-Mapping Grid */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              Column Mapping (Auto-Matched to 10-Column Call Sheet)
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {extracted.headers.map((headerLabel, colIdx) => (
                <div
                  key={`${headerLabel}-${colIdx}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs"
                >
                  <span
                    className="font-medium text-slate-800 truncate"
                    title={headerLabel}
                  >
                    {colIdx + 1}. {headerLabel}
                  </span>
                  <select
                    value={columnMapping[colIdx] ?? ''}
                    onChange={(e) =>
                      setColumnMapping((prev) => ({
                        ...prev,
                        [colIdx]: e.target.value as CallsheetTargetField,
                      }))
                    }
                    aria-label={`Map column ${headerLabel}`}
                    className="min-h-[32px] max-w-[155px] rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                  >
                    {CALLSHEET_FIELD_OPTIONS.map((opt) => (
                      <option key={opt.value || 'skip'} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Summary Bar & Bulk Toggles */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-t border-slate-200 pt-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 font-mono tabular-nums">
              <span>{summary.total} rows parsed</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-[#166534]">
                {summary.selectedCount} ready to append
              </span>
              <span aria-hidden="true">·</span>
              <span className={summary.dupCount > 0 ? 'text-amber-700 font-semibold' : ''}>
                {summary.dupCount} duplicates
              </span>
              {summary.missingIdCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-red-700 font-semibold">
                    {summary.missingIdCount} missing Mobile/ID
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setDrafts((prev) =>
                    prev.map((d) => ({
                      ...d,
                      include:
                        !d.missingIdentifier &&
                        !d.isDuplicateMobile &&
                        !d.isDuplicateSerial &&
                        !d.isDuplicateBatch,
                    }))
                  )
                }
                className="min-h-[34px] rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Skip All Duplicates
              </button>
              <button
                type="button"
                onClick={() =>
                  setDrafts((prev) => prev.map((d) => ({ ...d, include: true })))
                }
                className="min-h-[34px] rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Select All
              </button>
            </div>
          </div>

          {/* Preview Rows Table */}
          {drafts.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
              No data rows found below header row {headerRowIndex}. Try adjusting the Header Row Number above.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-80">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                  <tr>
                    <th className="py-2 px-3 w-10">Add</th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Serial ID</th>
                    <th className="py-2 px-3">Mobile No</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">Remark (Col 9)</th>
                    <th className="py-2 px-3">Check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {drafts.slice(0, 150).map((row) => {
                    const isDup =
                      row.isDuplicateMobile ||
                      row.isDuplicateSerial ||
                      row.isDuplicateBatch;
                    return (
                      <tr
                        key={row.id}
                        className={
                          !row.include
                            ? 'bg-slate-50/70 text-slate-400'
                            : isDup
                              ? 'bg-amber-50/40'
                              : ''
                        }
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={row.include}
                            onChange={(e) =>
                              setDrafts((prev) =>
                                prev.map((item) =>
                                  item.id === row.id
                                    ? { ...item, include: e.target.checked }
                                    : item
                                )
                              )
                            }
                            className="h-4 w-4 rounded border-slate-300 text-[#107C41] focus:ring-[#107C41]"
                          />
                        </td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">
                          {row.date}
                        </td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">
                          {row.serialId}
                        </td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">
                          {row.mobileNo || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={row.status}
                            onChange={(e) =>
                              setDrafts((prev) =>
                                prev.map((item) =>
                                  item.id === row.id
                                    ? {
                                        ...item,
                                        status: e.target.value as CallStatus,
                                      }
                                    : item
                                )
                              )
                            }
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                          >
                            <option value="Resolved">Resolved</option>
                            <option value="Unresolved">Unresolved</option>
                          </select>
                        </td>
                        <td className="px-3 py-2 min-w-[200px]">
                          <select
                            value={row.remark}
                            onChange={(e) =>
                              setDrafts((prev) =>
                                prev.map((item) =>
                                  item.id === row.id
                                    ? {
                                        ...item,
                                        remark: e.target.value as RemarkOption,
                                      }
                                    : item
                                )
                              )
                            }
                            className="w-full max-w-[240px] rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                          >
                            {PERMITTED_REMARKS.map((rem) => (
                              <option key={rem} value={rem}>
                                {rem}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap font-medium">
                          {row.missingIdentifier ? (
                            <span className="text-red-600">No Mobile/ID</span>
                          ) : isDup ? (
                            <span className="text-amber-700">Duplicate</span>
                          ) : (
                            <span className="text-[#166534]">Valid</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {drafts.length > 150 && (
                <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  Showing first 150 rows in preview · all {summary.selectedCount} checked rows will be appended.
                </div>
              )}
            </div>
          )}

          {/* Append Action */}
          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              disabled={isAppending || summary.selectedCount === 0}
              onClick={() => void handleConfirmAppend()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#107C41] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#0B5E31] disabled:opacity-50 whitespace-nowrap"
            >
              <Upload className="h-4 w-4" />
              <span>
                {isAppending
                  ? 'Appending Rows...'
                  : `Append ${summary.selectedCount} Row${
                      summary.selectedCount === 1 ? '' : 's'
                    } to Sheet`}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
