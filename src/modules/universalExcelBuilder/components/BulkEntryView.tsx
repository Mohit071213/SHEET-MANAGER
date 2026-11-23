import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Play,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  parseUniversalBulkInput,
  StagedBulkRow,
} from '../bulkParserEngine';
import {
  BuilderCellValue,
  BuilderDuplicateStrategy,
  BuilderRecord,
  BuilderShortcutRule,
  BuilderWorkbook,
} from '../types';
import { evaluateRecordValues } from '../validationEngine';

interface BulkEntryViewProps {
  workbook: BuilderWorkbook;
  existingRecords: BuilderRecord[];
  rules: BuilderShortcutRule[];
  onCommitBulkRows: (
    rows: Array<Record<string, BuilderCellValue>>,
    matchedRuleIds: string[]
  ) => Promise<{ addedCount: number; skippedDuplicates: number }>;
  onGoToRules: () => void;
}

export const BulkEntryView: React.FC<BulkEntryViewProps> = ({
  workbook,
  existingRecords,
  rules,
  onCommitBulkRows,
  onGoToRules,
}) => {
  const orderedCols = useMemo(
    () => [...workbook.columns].sort((a, b) => a.order - b.order),
    [workbook.columns]
  );

  const [rawText, setRawText] = useState('');
  const [applyDefaults, setApplyDefaults] = useState(true);
  const [duplicateResolution, setDuplicateResolution] =
    useState<BuilderDuplicateStrategy>(workbook.duplicateStrategy);
  const [stagedRows, setStagedRows] = useState<StagedBulkRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const handleLoadSample = () => {
    const sampleLines = [
      '9876543210 Rajesh Sharma invoice INV-1042 4500 paid urgent follow up',
      '9123456780 Priya Nair priya@example.com 2026-11-22 1299 pending callback tomorrow',
    ];
    setRawText(sampleLines.join('\n'));
  };

  const handleParse = () => {
    const parsed = parseUniversalBulkInput({
      rawText,
      columns: orderedCols,
      rules,
      existingRecords,
      applyMissingDefaults: applyDefaults,
    });
    if (duplicateResolution === 'skip') {
      setStagedRows(
        parsed.map((r) => (r.isDuplicate ? { ...r, include: false } : r))
      );
    } else {
      setStagedRows(parsed);
    }
  };

  const updateStagedCell = (
    tempId: string,
    colId: string,
    value: BuilderCellValue
  ) => {
    setStagedRows((prev) => {
      const updated = prev.map((row) =>
        row.tempId === tempId
          ? { ...row, values: { ...row.values, [colId]: value } }
          : row
      );
      const running: Array<Pick<BuilderRecord, 'id' | 'values'>> = [
        ...existingRecords,
      ];
      return updated.map((row) => {
        const evalRes = evaluateRecordValues(
          orderedCols,
          row.values,
          running,
          row.tempId
        );
        running.push({ id: row.tempId, values: row.values });
        return {
          ...row,
          validationWarnings: evalRes.validationWarnings,
          duplicateFields: evalRes.duplicateFields,
          isDuplicate: evalRes.isDuplicate,
        };
      });
    });
  };

  const includedRows = useMemo(
    () =>
      stagedRows.filter((r) => {
        if (!r.include) return false;
        if (duplicateResolution === 'skip' && r.isDuplicate) return false;
        return true;
      }),
    [stagedRows, duplicateResolution]
  );

  const handleCommit = async () => {
    if (includedRows.length === 0) return;
    setIsSaving(true);
    try {
      const matchedIds = includedRows.flatMap((r) => r.matchedRuleIds);
      await onCommitBulkRows(
        includedRows.map((r) => r.values),
        matchedIds
      );
      setStagedRows([]);
      setRawText('');
    } finally {
      setIsSaving(false);
    }
  };

  if (orderedCols.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
        <p className="text-sm font-semibold text-slate-900">
          Add columns before using Bulk Entry
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Configure at least one column so the parser knows how to structure your pasted lines.
        </p>
      </div>
    );
  }

  const matchedRuleCount = stagedRows.filter(
    (r) => r.matchedRuleIds.length > 0
  ).length;
  const dupCount = stagedRows.filter((r) => r.isDuplicate).length;
  const warnCount = stagedRows.filter(
    (r) => r.validationWarnings.length > 0
  ).length;

  return (
    <div className="space-y-6">
      {/* Input Zone */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Universal Bulk Text &amp; Paste Engine
            </h2>
            <p className="text-xs text-slate-500">
              Paste raw multi-line notes, CSV/TSV rows, IDs, phones, emails, dates, or amounts. Active shortcut rules ({rules.filter((r) => r.enabled).length}) run automatically.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleLoadSample}
              className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              Insert Sample Lines
            </button>
            <button
              type="button"
              onClick={onGoToRules}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5 text-[#107C41]" />
              <span>Manage Rules</span>
            </button>
          </div>
        </div>

        <textarea
          rows={6}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste raw lines, copied spreadsheet rows, WhatsApp notes, or CSV records (one entry per line)..."
          className="w-full rounded-xl border border-slate-300 bg-slate-50/40 p-3.5 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#107C41] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#107C41]/15"
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="inline-flex items-center gap-2 font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={applyDefaults}
                onChange={(e) => setApplyDefaults(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#107C41]"
              />
              <span>Auto-fill defaults for missing fields</span>
            </label>

            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-600">Duplicates:</span>
              <select
                value={duplicateResolution}
                onChange={(e) =>
                  setDuplicateResolution(
                    e.target.value as BuilderDuplicateStrategy
                  )
                }
                aria-label="Duplicate handling mode"
                className="min-h-[34px] rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800"
              >
                <option value="flag">Warn &amp; Keep</option>
                <option value="skip">Auto-Skip Duplicates</option>
                <option value="allow">Allow All</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            disabled={!rawText.trim()}
            onClick={handleParse}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-[#107C41] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0B5E31] whitespace-nowrap disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            <span>Parse &amp; Preview Rows</span>
          </button>
        </div>
      </div>

      {/* Preview Table */}
      {stagedRows.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Editable Bulk Preview
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 font-mono tabular-nums">
                <span>{stagedRows.length} parsed</span>
                <span aria-hidden="true">·</span>
                <span>{matchedRuleCount} rule matches</span>
                <span aria-hidden="true">·</span>
                <span>{dupCount} duplicates</span>
                <span aria-hidden="true">·</span>
                <span>{warnCount} validation warnings</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setStagedRows([])}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear</span>
              </button>
              <button
                type="button"
                disabled={includedRows.length === 0 || isSaving}
                onClick={() => void handleCommit()}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#107C41] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0B5E31] whitespace-nowrap disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>
                  {isSaving
                    ? 'Saving...'
                    : `Save ${includedRows.length} Validated Row${
                        includedRows.length === 1 ? '' : 's'
                      }`}
                </span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                  <th className="py-2.5 px-3 w-10">Save</th>
                  {orderedCols.map((col) => (
                    <th key={col.id} className="py-2.5 px-3 whitespace-nowrap">
                      {col.label}
                    </th>
                  ))}
                  <th className="py-2.5 px-3 whitespace-nowrap">
                    Rules &amp; Checks
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {stagedRows.map((row) => {
                  const hasIssues =
                    row.isDuplicate || row.validationWarnings.length > 0;
                  return (
                    <tr
                      key={row.tempId}
                      className={
                        !row.include
                          ? 'bg-slate-100/70 opacity-60'
                          : hasIssues
                            ? 'bg-amber-50/40'
                            : 'hover:bg-slate-50/60'
                      }
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={row.include}
                          onChange={(e) =>
                            setStagedRows((prev) =>
                              prev.map((item) =>
                                item.tempId === row.tempId
                                  ? { ...item, include: e.target.checked }
                                  : item
                              )
                            )
                          }
                          aria-label="Include row in save"
                          className="h-4 w-4 rounded border-slate-300 text-[#107C41]"
                        />
                      </td>
                      {orderedCols.map((col) => {
                        const cellVal = row.values[col.id];
                        return (
                          <td key={col.id} className="px-2.5 py-2">
                            {col.type === 'dropdown' ? (
                              <select
                                value={String(cellVal ?? '')}
                                onChange={(e) =>
                                  updateStagedCell(
                                    row.tempId,
                                    col.id,
                                    e.target.value
                                  )
                                }
                                className="min-h-[34px] rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                              >
                                <option value="">--</option>
                                {col.dropdownOptions.map((o) => (
                                  <option key={o} value={o}>
                                    {o}
                                  </option>
                                ))}
                              </select>
                            ) : col.type === 'boolean' ? (
                              <input
                                type="checkbox"
                                checked={Boolean(cellVal)}
                                onChange={(e) =>
                                  updateStagedCell(
                                    row.tempId,
                                    col.id,
                                    e.target.checked
                                  )
                                }
                                className="h-4 w-4 rounded border-slate-300"
                              />
                            ) : (
                              <input
                                type={col.type === 'number' ? 'number' : 'text'}
                                value={String(cellVal ?? '')}
                                onChange={(e) =>
                                  updateStagedCell(
                                    row.tempId,
                                    col.id,
                                    e.target.value
                                  )
                                }
                                className="min-h-[34px] min-w-[110px] rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                              />
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="space-y-0.5">
                          {row.matchedRuleNames.length > 0 && (
                            <div className="text-[11px] font-semibold text-[#166534]">
                              Rules: {row.matchedRuleNames.join(', ')}
                            </div>
                          )}
                          {hasIssues ? (
                            <div className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800">
                              <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                              <span>
                                {[
                                  row.isDuplicate
                                    ? `Dup (${row.duplicateFields.join(', ')})`
                                    : '',
                                  row.validationWarnings[0] ?? '',
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-500">
                              Confidence: {row.confidence}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
