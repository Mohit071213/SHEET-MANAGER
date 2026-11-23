import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, PlusCircle, RotateCcw } from 'lucide-react';
import {
  BuilderCellValue,
  BuilderColumn,
  BuilderRecord,
  BuilderWorkbook,
} from '../types';
import {
  evaluateRecordValues,
  resolveColumnDefaultValue,
  validateSingleCell,
} from '../validationEngine';

interface SingleEntryFormViewProps {
  workbook: BuilderWorkbook;
  existingRecords: BuilderRecord[];
  onSaveRecord: (values: Record<string, BuilderCellValue>) => Promise<{
    addedCount: number;
    skippedDuplicates: number;
  }>;
  onGoToColumns: () => void;
}

function buildInitialValues(columns: BuilderColumn[]): Record<string, BuilderCellValue> {
  const initial: Record<string, BuilderCellValue> = {};
  for (const col of columns) {
    initial[col.id] = resolveColumnDefaultValue(col);
  }
  return initial;
}

export const SingleEntryFormView: React.FC<SingleEntryFormViewProps> = ({
  workbook,
  existingRecords,
  onSaveRecord,
  onGoToColumns,
}) => {
  const orderedCols = useMemo(
    () => [...workbook.columns].sort((a, b) => a.order - b.order),
    [workbook.columns]
  );

  const [values, setValues] = useState<Record<string, BuilderCellValue>>(() =>
    buildInitialValues(orderedCols)
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submittedOnce, setSubmittedOnce] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setValues(buildInitialValues(orderedCols));
    setTouched({});
    setSubmittedOnce(false);
  }, [workbook.id, orderedCols]);

  const liveEval = useMemo(
    () => evaluateRecordValues(orderedCols, values, existingRecords),
    [orderedCols, values, existingRecords]
  );

  const handleReset = () => {
    setValues(buildInitialValues(orderedCols));
    setTouched({});
    setSubmittedOnce(false);
  };

  const handleSubmit = async (e: React.FormEvent, resetAfter: boolean) => {
    e.preventDefault();
    setSubmittedOnce(true);

    // Block strictly on required errors
    const missingRequired = orderedCols.filter((col) => {
      if (!col.required) return false;
      const err = validateSingleCell(col, values[col.id]);
      return Boolean(err && err.includes('is required'));
    });

    if (missingRequired.length > 0) {
      return;
    }

    setIsSaving(true);
    try {
      await onSaveRecord(values);
      if (resetAfter) {
        handleReset();
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (orderedCols.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
        <p className="text-sm font-semibold text-slate-900">
          Add columns before entering records
        </p>
        <p className="mt-1 text-xs text-slate-500">
          This workbook has 0 columns configured. Define at least one column to generate your data-entry form.
        </p>
        <button
          type="button"
          onClick={onGoToColumns}
          className="mt-4 inline-flex min-h-[40px] items-center rounded-lg bg-[#107C41] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B5E31]"
        >
          Configure Columns
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e, true)}
      className="rounded-xl border border-slate-200 bg-white p-6 space-y-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Single Record Entry Form
          </h2>
          <p className="text-xs text-slate-500">
            Auto-generated from {orderedCols.length} configured columns in &ldquo;{workbook.name}&rdquo;.
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 self-start sm:self-auto whitespace-nowrap"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset Defaults</span>
        </button>
      </div>

      {liveEval.isDuplicate && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <span className="font-semibold">Duplicate value detected</span> on{' '}
            {liveEval.duplicateFields.join(', ')}.{' '}
            {workbook.duplicateStrategy === 'skip'
              ? 'Save will skip this row because duplicate strategy is set to Skip.'
              : 'You can still save and it will be flagged in the Data Grid.'}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {orderedCols.map((col) => {
          const val = values[col.id];
          const fieldError =
            submittedOnce || touched[col.id]
              ? validateSingleCell(col, val)
              : null;

          return (
            <div
              key={col.id}
              className={
                col.type === 'text' &&
                /note|remark|summary|description|comment/i.test(col.label)
                  ? 'sm:col-span-2'
                  : ''
              }
            >
              <label
                htmlFor={`entry_${col.id}`}
                className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5"
              >
                <span>
                  {col.label}
                  {col.required && <span className="ml-1 text-red-600">*</span>}
                </span>
                <span className="text-[11px] font-normal text-slate-400">
                  {col.unique ? 'Unique' : col.type}
                </span>
              </label>

              {col.type === 'dropdown' ? (
                <select
                  id={`entry_${col.id}`}
                  value={String(val ?? '')}
                  onBlur={() => setTouched((p) => ({ ...p, [col.id]: true }))}
                  onChange={(e) =>
                    setValues((p) => ({ ...p, [col.id]: e.target.value }))
                  }
                  className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/15"
                >
                  {!col.required && <option value="">-- Select --</option>}
                  {col.dropdownOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : col.type === 'boolean' ? (
                <label className="flex min-h-[42px] items-center gap-2.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-800 cursor-pointer">
                  <input
                    id={`entry_${col.id}`}
                    type="checkbox"
                    checked={Boolean(val)}
                    onChange={(e) =>
                      setValues((p) => ({ ...p, [col.id]: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-slate-300 text-[#107C41]"
                  />
                  <span>{Boolean(val) ? 'Yes' : 'No'}</span>
                </label>
              ) : (
                <input
                  id={`entry_${col.id}`}
                  type={
                    col.type === 'number'
                      ? 'number'
                      : col.type === 'date' || col.type === 'autoDate'
                        ? 'date'
                        : col.type === 'email'
                          ? 'email'
                          : col.type === 'phone'
                            ? 'tel'
                            : 'text'
                  }
                  step={col.type === 'number' ? 'any' : undefined}
                  value={String(val ?? '')}
                  onBlur={() => setTouched((p) => ({ ...p, [col.id]: true }))}
                  onChange={(e) =>
                    setValues((p) => ({ ...p, [col.id]: e.target.value }))
                  }
                  placeholder={`Enter ${col.label.toLowerCase()}`}
                  className={`w-full min-h-[42px] rounded-lg border bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
                    fieldError
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                      : 'border-slate-300 focus:border-[#107C41] focus:ring-[#107C41]/15'
                  }`}
                />
              )}

              {fieldError && (
                <p className="mt-1 text-[11px] font-medium text-red-600">
                  {fieldError}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
        <button
          type="button"
          disabled={isSaving}
          onClick={(e) => void handleSubmit(e, false)}
          className="min-h-[42px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap disabled:opacity-60"
        >
          Save &amp; Keep Values
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-[#107C41] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0B5E31] whitespace-nowrap disabled:opacity-60"
        >
          <PlusCircle className="h-4 w-4" />
          <span>{isSaving ? 'Saving...' : 'Save & Add Next'}</span>
        </button>
      </div>
    </form>
  );
};
