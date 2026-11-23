import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  Check,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  BuilderCellValue,
  BuilderRecord,
  BuilderWorkbook,
} from '../types';
import { resolveColumnDefaultValue } from '../validationEngine';

interface DataGridViewProps {
  workbook: BuilderWorkbook;
  records: BuilderRecord[];
  onUpdateRecord: (
    recordId: string,
    values: Record<string, BuilderCellValue>
  ) => Promise<void>;
  onDeleteRecords: (recordIds: string[]) => Promise<void>;
  onQuickAddRow: (values: Record<string, BuilderCellValue>) => Promise<void>;
  onGoToEntry: () => void;
}

export const DataGridView: React.FC<DataGridViewProps> = ({
  workbook,
  records,
  onUpdateRecord,
  onDeleteRecords,
  onQuickAddRow,
  onGoToEntry,
}) => {
  const orderedCols = useMemo(
    () => [...workbook.columns].sort((a, b) => a.order - b.order),
    [workbook.columns]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [filterColId, setFilterColId] = useState<string>('');
  const [filterColVal, setFilterColVal] = useState<string>('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [sortColId, setSortColId] = useState<string>('__rowOrder');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, BuilderCellValue>>({});
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const dropdownCols = useMemo(
    () =>
      orderedCols.filter(
        (c) => c.type === 'dropdown' && c.dropdownOptions.length > 0
      ),
    [orderedCols]
  );

  const activeFilterColumn = useMemo(
    () => dropdownCols.find((c) => c.id === filterColId) ?? null,
    [dropdownCols, filterColId]
  );

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = records.filter((rec) => {
      if (
        flaggedOnly &&
        !rec.isDuplicate &&
        rec.validationWarnings.length === 0
      ) {
        return false;
      }
      if (filterColId && filterColVal) {
        if (
          String(rec.values[filterColId] ?? '').toLowerCase() !==
          filterColVal.toLowerCase()
        ) {
          return false;
        }
      }
      if (!q) return true;
      return orderedCols.some((col) =>
        String(rec.values[col.id] ?? '')
          .toLowerCase()
          .includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sortColId === '__rowOrder') {
        return sortAsc ? a.rowOrder - b.rowOrder : b.rowOrder - a.rowOrder;
      }
      const va = String(a.values[sortColId] ?? '');
      const vb = String(b.values[sortColId] ?? '');
      const cmp = va.localeCompare(vb, undefined, { numeric: true });
      return sortAsc ? cmp : -cmp;
    });
  }, [
    records,
    searchQuery,
    flaggedOnly,
    filterColId,
    filterColVal,
    sortColId,
    sortAsc,
    orderedCols,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filteredAndSorted.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  const flaggedCount = useMemo(
    () =>
      records.filter(
        (r) => r.isDuplicate || r.validationWarnings.length > 0
      ).length,
    [records]
  );

  const toggleSort = (colId: string) => {
    if (sortColId === colId) {
      setSortAsc((prev) => !prev);
    } else {
      setSortColId(colId);
      setSortAsc(true);
    }
  };

  const toggleSelectAllOnPage = () => {
    const allSelected =
      pagedRows.length > 0 && pagedRows.every((r) => selectedIds.has(r.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pagedRows.forEach((r) => next.delete(r.id));
      } else {
        pagedRows.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  const handleStartEdit = (rec: BuilderRecord) => {
    setEditingRowId(rec.id);
    setEditDraft({ ...rec.values });
  };

  const handleSaveEdit = async (recId: string) => {
    setIsBusy(true);
    try {
      await onUpdateRecord(recId, editDraft);
      setEditingRowId(null);
      setEditDraft({});
    } finally {
      setIsBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBusy(true);
    try {
      await onDeleteRecords(Array.from(selectedIds));
      setSelectedIds(new Set());
      setConfirmDeleteSelected(false);
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddBlankRow = async () => {
    const defaults: Record<string, BuilderCellValue> = {};
    for (const col of orderedCols) {
      defaults[col.id] = resolveColumnDefaultValue(col);
    }
    setIsBusy(true);
    try {
      await onQuickAddRow(defaults);
      setPage(Math.max(1, Math.ceil((records.length + 1) / pageSize)));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[210px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search across all columns..."
                className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#107C41] focus:outline-none"
              />
            </div>

            {dropdownCols.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={filterColId}
                  onChange={(e) => {
                    setFilterColId(e.target.value);
                    setFilterColVal('');
                    setPage(1);
                  }}
                  aria-label="Select filter column"
                  className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                >
                  <option value="">Filter by Column...</option>
                  {dropdownCols.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {activeFilterColumn && (
                  <select
                    value={filterColVal}
                    onChange={(e) => {
                      setFilterColVal(e.target.value);
                      setPage(1);
                    }}
                    aria-label="Select filter value"
                    className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                  >
                    <option value="">All Values</option>
                    {activeFilterColumn.dropdownOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setFlaggedOnly((f) => !f);
                setPage(1);
              }}
              className={`min-h-[38px] rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap font-mono tabular-nums ${
                flaggedOnly
                  ? 'border-amber-400 bg-amber-50 text-amber-900'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Flagged ({flaggedCount})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {selectedIds.size > 0 && (
              <>
                {confirmDeleteSelected ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleBulkDelete()}
                      className="min-h-[36px] rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 whitespace-nowrap"
                    >
                      Confirm Delete ({selectedIds.size})
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteSelected(false)}
                      className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteSelected(true)}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 whitespace-nowrap"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete Selected ({selectedIds.size})</span>
                  </button>
                )}
              </>
            )}

            {orderedCols.length > 0 && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleAddBlankRow()}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#107C41] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0B5E31] whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Blank Row</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      {records.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <p className="text-sm font-semibold text-slate-900">
            No records saved in &ldquo;{workbook.name}&rdquo; yet
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Add your first entry with the dynamic form, paste bulk text, or import an existing .xlsx/.csv file.
          </p>
          <button
            type="button"
            onClick={onGoToEntry}
            className="mt-4 inline-flex min-h-[40px] items-center rounded-lg bg-[#107C41] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B5E31]"
          >
            Add First Entry
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                  <th className="py-2.5 px-3 w-10">
                    <input
                      type="checkbox"
                      checked={
                        pagedRows.length > 0 &&
                        pagedRows.every((r) => selectedIds.has(r.id))
                      }
                      onChange={toggleSelectAllOnPage}
                      aria-label="Select all visible rows"
                      className="h-4 w-4 rounded border-slate-300 text-[#107C41]"
                    />
                  </th>
                  <th className="py-2.5 px-3 w-14">
                    <button
                      type="button"
                      onClick={() => toggleSort('__rowOrder')}
                      className="inline-flex items-center gap-1 font-mono hover:text-slate-900"
                    >
                      <span>#</span>
                      <ArrowDownUp className="h-3 w-3" />
                    </button>
                  </th>
                  {orderedCols.map((col) => (
                    <th key={col.id} className="py-2.5 px-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleSort(col.id)}
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                      >
                        <span>{col.label}</span>
                        <ArrowDownUp className="h-3 w-3 text-slate-400" />
                      </button>
                    </th>
                  ))}
                  <th className="py-2.5 px-3 whitespace-nowrap">Status</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {pagedRows.map((rec) => {
                  const isEditing = editingRowId === rec.id;
                  const hasAlert =
                    rec.isDuplicate || rec.validationWarnings.length > 0;

                  return (
                    <tr
                      key={rec.id}
                      className={`min-h-[42px] ${
                        hasAlert
                          ? 'bg-amber-50/40 hover:bg-amber-50/70'
                          : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(rec.id)}
                          onChange={() =>
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(rec.id)) next.delete(rec.id);
                              else next.add(rec.id);
                              return next;
                            })
                          }
                          aria-label={`Select row ${rec.rowOrder}`}
                          className="h-4 w-4 rounded border-slate-300 text-[#107C41]"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums text-slate-500">
                        {rec.rowOrder}
                      </td>
                      {orderedCols.map((col) => {
                        const cellVal = isEditing
                          ? editDraft[col.id]
                          : rec.values[col.id];
                        return (
                          <td
                            key={col.id}
                            className={`px-3 py-2 ${
                              col.type === 'number' || col.type === 'phone'
                                ? 'font-mono tabular-nums'
                                : ''
                            }`}
                          >
                            {isEditing ? (
                              col.type === 'dropdown' ? (
                                <select
                                  value={String(cellVal ?? '')}
                                  onChange={(e) =>
                                    setEditDraft((p) => ({
                                      ...p,
                                      [col.id]: e.target.value,
                                    }))
                                  }
                                  className="min-h-[32px] rounded border border-slate-300 bg-white px-2 py-1 text-xs"
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
                                    setEditDraft((p) => ({
                                      ...p,
                                      [col.id]: e.target.checked,
                                    }))
                                  }
                                  className="h-4 w-4 rounded border-slate-300"
                                />
                              ) : (
                                <input
                                  type={col.type === 'number' ? 'number' : 'text'}
                                  value={String(cellVal ?? '')}
                                  onChange={(e) =>
                                    setEditDraft((p) => ({
                                      ...p,
                                      [col.id]: e.target.value,
                                    }))
                                  }
                                  className="min-h-[32px] min-w-[110px] rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                                />
                              )
                            ) : col.type === 'boolean' ? (
                              <span>{cellVal === true ? 'Yes' : 'No'}</span>
                            ) : (
                              <span className="text-slate-900">
                                {String(cellVal ?? '')}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 whitespace-nowrap">
                        {hasAlert ? (
                          <span className="inline-flex items-center gap-1 text-amber-800 font-medium">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            <span>
                              {[
                                rec.isDuplicate
                                  ? `Dup: ${rec.duplicateFields.join(', ')}`
                                  : '',
                                rec.validationWarnings[0] ?? '',
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-500">Valid</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleSaveEdit(rec.id)}
                              aria-label="Save row edits"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#107C41] text-white hover:bg-[#0B5E31]"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingRowId(null)}
                              aria-label="Cancel row edits"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(rec)}
                              aria-label={`Edit row ${rec.rowOrder}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void onDeleteRecords([rec.id])}
                              aria-label={`Delete row ${rec.rowOrder}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <div className="font-mono tabular-nums">
              Showing {(safePage - 1) * pageSize + 1}–
              {Math.min(safePage * pageSize, filteredAndSorted.length)} of{' '}
              {filteredAndSorted.length} rows
            </div>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                aria-label="Rows per page"
                className="min-h-[32px] rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-mono tabular-nums"
              >
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="min-h-[32px] rounded-lg border border-slate-300 bg-white px-3 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="font-mono tabular-nums px-1">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="min-h-[32px] rounded-lg border border-slate-300 bg-white px-3 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
