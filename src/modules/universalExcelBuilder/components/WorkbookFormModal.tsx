import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { BUILDER_INDUSTRIES, BuilderIndustry } from '../config';
import { BuilderDuplicateStrategy, BuilderWorkbook } from '../types';
import { sanitizeSheetName } from '../storage';

export interface WorkbookFormValues {
  name: string;
  industry: BuilderIndustry;
  description: string;
  sheetName: string;
  headerRowIndex: number;
  freezeHeader: boolean;
  autoFilter: boolean;
  duplicateStrategy: BuilderDuplicateStrategy;
  includeStarterColumns: boolean;
}

interface WorkbookFormModalProps {
  mode: 'create' | 'edit';
  initialWorkbook?: BuilderWorkbook | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: WorkbookFormValues) => Promise<void>;
}

export const WorkbookFormModal: React.FC<WorkbookFormModalProps> = ({
  mode,
  initialWorkbook,
  isSubmitting,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState(initialWorkbook?.name ?? '');
  const [industry, setIndustry] = useState<BuilderIndustry>(
    initialWorkbook?.industry ?? 'Custom / General'
  );
  const [description, setDescription] = useState(initialWorkbook?.description ?? '');
  const [sheetName, setSheetName] = useState(initialWorkbook?.sheetName ?? 'Records');
  const [headerRowIndex, setHeaderRowIndex] = useState(
    initialWorkbook?.headerRowIndex ?? 1
  );
  const [freezeHeader, setFreezeHeader] = useState(
    initialWorkbook?.freezeHeader ?? true
  );
  const [autoFilter, setAutoFilter] = useState(initialWorkbook?.autoFilter ?? true);
  const [duplicateStrategy, setDuplicateStrategy] =
    useState<BuilderDuplicateStrategy>(
      initialWorkbook?.duplicateStrategy ?? 'flag'
    );
  const [includeStarterColumns, setIncludeStarterColumns] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter a workbook name.');
      return;
    }
    setError(null);
    try {
      await onSubmit({
        name: trimmed,
        industry,
        description: description.trim(),
        sheetName: sanitizeSheetName(sheetName),
        headerRowIndex: Math.min(20, Math.max(1, Number(headerRowIndex) || 1)),
        freezeHeader,
        autoFilter,
        duplicateStrategy,
        includeStarterColumns,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save workbook.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wb-modal-title"
    >
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2
              id="wb-modal-title"
              className="text-base font-semibold text-slate-900"
            >
              {mode === 'create' ? 'Create Custom Workbook' : 'Edit Workbook Settings'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Stored permanently in your Universal Excel Builder workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-6 space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label
                htmlFor="wb-name"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Workbook Name
              </label>
              <input
                id="wb-name"
                type="text"
                autoFocus
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Q4 Sales Pipeline Ledger"
                className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/15"
              />
            </div>

            <div>
              <label
                htmlFor="wb-industry"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Industry / Use Case
              </label>
              <select
                id="wb-industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value as BuilderIndustry)}
                className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/15"
              >
                {BUILDER_INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="wb-sheet-name"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Excel Worksheet Tab Name
              </label>
              <input
                id="wb-sheet-name"
                type="text"
                maxLength={31}
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                placeholder="Records"
                className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/15"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="wb-description"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Description (Optional)
              </label>
              <input
                id="wb-description"
                type="text"
                maxLength={300}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Purpose, reporting frequency, or owner team"
                className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/15"
              />
            </div>

            <div>
              <label
                htmlFor="wb-header-row"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Header Row Number
              </label>
              <input
                id="wb-header-row"
                type="number"
                min={1}
                max={20}
                value={headerRowIndex}
                onChange={(e) => setHeaderRowIndex(Number(e.target.value))}
                className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/15"
              />
            </div>

            <div>
              <label
                htmlFor="wb-dup-strategy"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Duplicate Handling
              </label>
              <select
                id="wb-dup-strategy"
                value={duplicateStrategy}
                onChange={(e) =>
                  setDuplicateStrategy(e.target.value as BuilderDuplicateStrategy)
                }
                className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/15"
              >
                <option value="flag">Warn and flag duplicates</option>
                <option value="skip">Skip duplicate rows on bulk save</option>
                <option value="allow">Allow duplicate entries silently</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2.5 pt-1">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={freezeHeader}
                onChange={(e) => setFreezeHeader(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#107C41] focus:ring-[#107C41]"
              />
              <span>Freeze header row in Excel export</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={autoFilter}
                onChange={(e) => setAutoFilter(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#107C41] focus:ring-[#107C41]"
              />
              <span>Enable Excel AutoFilter row</span>
            </label>
            {mode === 'create' && (
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeStarterColumns}
                  onChange={(e) => setIncludeStarterColumns(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#107C41] focus:ring-[#107C41]"
                />
                <span>Include 5 starter columns (Date, Ref ID, Name, Status, Notes)</span>
              </label>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-[40px] rounded-lg bg-[#107C41] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0B5E31] whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              {isSubmitting
                ? 'Saving...'
                : mode === 'create'
                  ? 'Create Workbook'
                  : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
