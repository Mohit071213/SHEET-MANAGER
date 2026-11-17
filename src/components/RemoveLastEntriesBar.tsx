import React, { useEffect, useState } from 'react';
import { AlertTriangle, Scissors, Trash2 } from 'lucide-react';

interface RemoveLastEntriesBarProps {
  masterCount: number;
  addedCount: number;
  onRemoveLastFromTotal: (count: number) => Promise<void>;
  onRemoveLastAdded: (count: number) => Promise<void>;
  onClearAllAdded?: () => Promise<void>;
}

const PRESET_COUNTS = [5, 10, 25, 50];

export const RemoveLastEntriesBar: React.FC<RemoveLastEntriesBarProps> = ({
  masterCount,
  addedCount,
  onRemoveLastFromTotal,
  onRemoveLastAdded,
  onClearAllAdded,
}) => {
  const totalCount = masterCount + addedCount;

  const [countInput, setCountInput] = useState<number>(() =>
    totalCount >= 10 ? 10 : Math.max(1, totalCount)
  );
  const [confirmAction, setConfirmAction] = useState<
    | null
    | { scope: 'total'; count: number }
    | { scope: 'added'; count: number }
    | { scope: 'all-added' }
  >(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    setCountInput((prev) => {
      if (totalCount === 0) return 1;
      if (prev > totalCount) return totalCount;
      if (prev < 1) return Math.min(10, totalCount);
      return prev;
    });
    setConfirmAction(null);
  }, [totalCount, addedCount]);

  if (totalCount === 0) {
    return null;
  }

  const safeTotalRemove = Math.max(1, Math.min(totalCount, countInput || 1));
  const safeAddedRemove =
    addedCount > 0 ? Math.max(1, Math.min(addedCount, countInput || 1)) : 0;

  const willTrimMaster =
    confirmAction?.scope === 'total' && confirmAction.count > addedCount;

  const getAfterCount = () => {
    if (!confirmAction) return totalCount;
    if (confirmAction.scope === 'total') {
      return Math.max(0, totalCount - confirmAction.count);
    }
    if (confirmAction.scope === 'added') {
      return Math.max(masterCount, totalCount - confirmAction.count);
    }
    return masterCount;
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    setIsProcessing(true);
    try {
      if (confirmAction.scope === 'total') {
        await onRemoveLastFromTotal(confirmAction.count);
      } else if (confirmAction.scope === 'added') {
        await onRemoveLastAdded(confirmAction.count);
      } else if (confirmAction.scope === 'all-added' && onClearAllAdded) {
        await onClearAllAdded();
      }
      setConfirmAction(null);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-bold text-slate-900 tabular-nums">
            Remove Last Entries ({totalCount} total · {masterCount} master ·{' '}
            {addedCount} added)
          </div>
          <p className="text-xs text-slate-500">
            Trim trailing test or unwanted entries, then keep the clean sheet ready to download or add more records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-[#F8FAFC] p-1">
            {PRESET_COUNTS.filter((p) => p <= totalCount).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setCountInput(preset);
                  setConfirmAction(null);
                }}
                className={`min-h-[32px] rounded-md px-2.5 text-xs font-mono font-semibold transition-colors whitespace-nowrap ${
                  countInput === preset
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {preset}
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={totalCount}
              value={countInput}
              onChange={(e) => {
                const parsed = Number(e.target.value);
                setCountInput(
                  Number.isFinite(parsed)
                    ? Math.max(1, Math.min(totalCount, Math.floor(parsed)))
                    : 1
                );
                setConfirmAction(null);
              }}
              aria-label="Number of trailing entries to remove"
              className="h-8 w-16 rounded-md border border-slate-300 bg-white px-2 text-center font-mono text-xs text-slate-900"
            />
          </div>

          <button
            type="button"
            onClick={() =>
              setConfirmAction({ scope: 'total', count: safeTotalRemove })
            }
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 whitespace-nowrap shrink-0"
          >
            <Scissors className="h-3.5 w-3.5" />
            <span>Remove Last {safeTotalRemove} from Total Sheet</span>
          </button>

          {addedCount > 0 && (
            <button
              type="button"
              onClick={() =>
                setConfirmAction({ scope: 'added', count: safeAddedRemove })
              }
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Remove Last {safeAddedRemove} Added Only</span>
            </button>
          )}

          {addedCount > 0 && onClearAllAdded && (
            <button
              type="button"
              onClick={() => setConfirmAction({ scope: 'all-added' })}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 whitespace-nowrap shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Remove All Added ({addedCount})</span>
            </button>
          )}
        </div>
      </div>

      {confirmAction && (
        <div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-xs font-semibold text-red-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div>
              <div>
                {confirmAction.scope === 'total' &&
                  `Remove last ${confirmAction.count} row(s) from the sheet (${totalCount} rows → ${getAfterCount()} rows)?`}
                {confirmAction.scope === 'added' &&
                  `Remove last ${confirmAction.count} recently added row(s) (${totalCount} rows → ${getAfterCount()} rows)? Master rows stay locked.`}
                {confirmAction.scope === 'all-added' &&
                  `Remove all ${addedCount} recently added row(s) (${totalCount} rows → ${masterCount} rows)? Master rows stay locked.`}
              </div>
              {willTrimMaster && (
                <div className="mt-0.5 font-normal text-red-800">
                  Includes {confirmAction.count - addedCount} trailing master workbook row(s). An automatic pre-trim backup is saved first so you can restore anytime.
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => void handleConfirm()}
              className="min-h-[38px] rounded-lg bg-red-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-60 whitespace-nowrap"
            >
              {isProcessing ? 'Removing...' : 'Confirm Remove'}
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => setConfirmAction(null)}
              className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
