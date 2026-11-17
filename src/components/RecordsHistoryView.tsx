import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { CallRecord } from '../types/callsheet';
import { RemoveLastEntriesBar } from './RemoveLastEntriesBar';
import { SpreadsheetTable } from './SpreadsheetTable';

interface RecordsHistoryViewProps {
  masterRecords: CallRecord[];
  addedRecords: CallRecord[];
  onDeleteAddedRecord?: (recordId: string) => void;
  onRemoveLastFromTotal: (count: number) => Promise<void>;
  onRemoveLastAdded: (count: number) => Promise<void>;
  onClearAllAdded: () => Promise<void>;
}

type HistoryFilter = 'all' | 'added' | 'resolved' | 'unresolved';

export const RecordsHistoryView: React.FC<RecordsHistoryViewProps> = ({
  masterRecords,
  addedRecords,
  onDeleteAddedRecord,
  onRemoveLastFromTotal,
  onRemoveLastAdded,
  onClearAllAdded,
}) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [mobileSheetMode, setMobileSheetMode] = useState(false);

  const combined = useMemo(
    () => [...masterRecords, ...addedRecords],
    [masterRecords, addedRecords]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return combined.filter((rec) => {
      if (filter === 'added' && rec.source !== 'added') return false;
      if (filter === 'resolved' && rec.status !== 'Resolved') return false;
      if (filter === 'unresolved' && rec.status !== 'Unresolved') return false;

      if (!q) return true;
      return (
        rec.serialId.toLowerCase().includes(q) ||
        rec.mobileNo.toLowerCase().includes(q) ||
        rec.category.toLowerCase().includes(q) ||
        rec.subcategory.toLowerCase().includes(q) ||
        rec.remark.toLowerCase().includes(q) ||
        rec.date.toLowerCase().includes(q)
      );
    });
  }, [combined, filter, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Records History</h1>
          <p className="text-xs text-slate-500 tabular-nums">
            Showing {filtered.length} of {combined.length} total rows in exact spreadsheet order
          </p>
        </div>

        <button
          type="button"
          onClick={() => setMobileSheetMode((v) => !v)}
          className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 md:hidden"
        >
          {mobileSheetMode ? 'Switch to Mobile Cards' : 'View Full 10-Column Sheet'}
        </button>
      </div>

      {/* Dual Remove Last Entries Bar (Total Sheet + Added Only) */}
      <RemoveLastEntriesBar
        masterCount={masterRecords.length}
        addedCount={addedRecords.length}
        onRemoveLastFromTotal={onRemoveLastFromTotal}
        onRemoveLastAdded={onRemoveLastAdded}
        onClearAllAdded={onClearAllAdded}
      />

      {/* Search and Filter Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search S ID, Mobile, Category, Remark..."
            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/20"
          />
        </div>

        <div className="grid grid-cols-4 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
          {(
            [
              ['all', 'All'],
              ['added', 'Added'],
              ['resolved', 'Resolved'],
              ['unresolved', 'Unresolved'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`min-h-[38px] rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                filter === key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <SpreadsheetTable
        records={filtered}
        compactMobileCards={!mobileSheetMode}
        emptyMessage="No matching records found."
        onDeleteRecord={onDeleteAddedRecord}
      />
    </div>
  );
};
