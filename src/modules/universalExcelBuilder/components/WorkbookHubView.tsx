import React, { useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Copy,
  Download,
  FileSpreadsheet,
  FolderOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { BUILDER_INDUSTRIES, BuilderIndustry } from '../config';
import { BuilderWorkbook } from '../types';

type StatusFilter = 'active' | 'archived' | 'all';

interface WorkbookHubViewProps {
  workbooks: BuilderWorkbook[];
  isLoading: boolean;
  onCreateNew: () => void;
  onImportFile: (file: File) => void;
  onOpenWorkbook: (workbook: BuilderWorkbook) => void;
  onExportWorkbook: (workbook: BuilderWorkbook) => void;
  onEditWorkbook: (workbook: BuilderWorkbook) => void;
  onDuplicateWorkbook: (workbook: BuilderWorkbook, includeRecords: boolean) => Promise<void>;
  onToggleArchive: (workbook: BuilderWorkbook) => Promise<void>;
  onDeleteWorkbook: (workbookId: string) => Promise<void>;
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export const WorkbookHubView: React.FC<WorkbookHubViewProps> = ({
  workbooks,
  isLoading,
  onCreateNew,
  onImportFile,
  onOpenWorkbook,
  onExportWorkbook,
  onEditWorkbook,
  onDuplicateWorkbook,
  onToggleArchive,
  onDeleteWorkbook,
}) => {
  const hubImportInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [industryFilter, setIndustryFilter] = useState<'all' | BuilderIndustry>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyWorkbookId, setBusyWorkbookId] = useState<string | null>(null);

  const counts = useMemo(() => {
    let active = 0;
    let archived = 0;
    for (const wb of workbooks) {
      if (wb.archived) archived += 1;
      else active += 1;
    }
    return { active, archived, total: workbooks.length };
  }, [workbooks]);

  const filteredWorkbooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return workbooks.filter((wb) => {
      if (statusFilter === 'active' && wb.archived) return false;
      if (statusFilter === 'archived' && !wb.archived) return false;
      if (industryFilter !== 'all' && wb.industry !== industryFilter) return false;
      if (!q) return true;
      return (
        wb.name.toLowerCase().includes(q) ||
        wb.industry.toLowerCase().includes(q) ||
        wb.description.toLowerCase().includes(q) ||
        wb.sheetName.toLowerCase().includes(q)
      );
    });
  }, [workbooks, searchQuery, industryFilter, statusFilter]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    industryFilter !== 'all' ||
    statusFilter !== 'active';

  const handleDuplicate = async (wb: BuilderWorkbook, includeRecords: boolean) => {
    setBusyWorkbookId(wb.id);
    try {
      await onDuplicateWorkbook(wb, includeRecords);
    } finally {
      setBusyWorkbookId(null);
    }
  };

  const handleArchiveToggle = async (wb: BuilderWorkbook) => {
    setBusyWorkbookId(wb.id);
    try {
      await onToggleArchive(wb);
    } finally {
      setBusyWorkbookId(null);
    }
  };

  const handleConfirmDelete = async (wbId: string) => {
    setBusyWorkbookId(wbId);
    try {
      await onDeleteWorkbook(wbId);
      setConfirmDeleteId(null);
    } finally {
      setBusyWorkbookId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Summary */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 text-balance">
            Custom Excel Workbooks
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 font-mono tabular-nums">
            <span>{counts.active} active</span>
            <span aria-hidden="true">·</span>
            <span>{counts.archived} archived</span>
            <span aria-hidden="true">·</span>
            <span className="font-sans">Permanent isolated storage</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <input
            ref={hubImportInputRef}
            type="file"
            accept=".xlsx,.csv,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImportFile(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => hubImportInputRef.current?.click()}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Upload className="h-4 w-4 text-[#107C41]" />
            <span>Import File (.xlsx / .csv)</span>
          </button>
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-[#107C41] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0B5E31] whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>New Workbook</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search workbooks by name, industry, or sheet tab..."
              aria-label="Search workbooks"
              className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/15"
            />
          </div>

          <select
            value={industryFilter}
            onChange={(e) =>
              setIndustryFilter(e.target.value as 'all' | BuilderIndustry)
            }
            aria-label="Filter by industry"
            className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/15"
          >
            <option value="all">All Industries</option>
            {BUILDER_INDUSTRIES.map((ind) => (
              <option key={ind} value={ind}>
                {ind}
              </option>
            ))}
          </select>
        </div>

        <div
          role="group"
          aria-label="Filter workbooks by archive status"
          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start lg:self-auto shrink-0"
        >
          {(
            [
              { id: 'active', label: `Active (${counts.active})` },
              { id: 'archived', label: `Archived (${counts.archived})` },
              { id: 'all', label: `All (${counts.total})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`min-h-[32px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 font-mono tabular-nums ${
                statusFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading / Empty / Workbook Grid */}
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-28 rounded-xl border border-slate-200 bg-white animate-pulse"
            />
          ))}
        </div>
      ) : workbooks.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-14 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[#107C41]">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-slate-900">
            Create your first custom Excel workbook
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
            Design custom column schemas for Banking, Sales, HR, Inventory, Healthcare, Education, or any business ledger—stored permanently without affecting Call Sheet Manager.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onCreateNew}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#107C41] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0B5E31] whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>Create First Workbook</span>
            </button>
            <button
              type="button"
              onClick={() => hubImportInputRef.current?.click()}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <Upload className="h-4 w-4 text-[#107C41]" />
              <span>Import Sheet from PC / Phone</span>
            </button>
          </div>
        </div>
      ) : filteredWorkbooks.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <p className="text-sm font-semibold text-slate-900">
            No workbooks match your current filters
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Try switching between Active and Archived tabs or clearing your search query.
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setIndustryFilter('all');
                setStatusFilter('active');
              }}
              className="mt-4 inline-flex min-h-[38px] items-center rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white overflow-hidden">
          {filteredWorkbooks.map((wb) => {
            const isBusy = busyWorkbookId === wb.id;
            const isConfirmingDelete = confirmDeleteId === wb.id;

            return (
              <div
                key={wb.id}
                className="flex flex-col gap-4 p-5 transition-colors hover:bg-slate-50/60 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => onOpenWorkbook(wb)}
                      className="text-left text-base font-semibold text-slate-900 hover:text-[#107C41] truncate"
                    >
                      {wb.name}
                    </button>
                    {wb.archived && (
                      <span className="text-xs font-medium text-amber-700 shrink-0">
                        Archived
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span>{wb.industry}</span>
                    <span aria-hidden="true">·</span>
                    <span>Tab: {wb.sheetName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {wb.columns.length} columns
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {wb.rowCount} rows
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      Updated {formatShortDate(wb.updatedAt)}
                    </span>
                  </div>

                  {wb.description && (
                    <p className="mt-1.5 text-xs text-slate-600 line-clamp-1">
                      {wb.description}
                    </p>
                  )}
                </div>

                {/* Action Controls */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {isConfirmingDelete ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-red-700">
                        Delete permanently?
                      </span>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleConfirmDelete(wb.id)}
                        className="min-h-[36px] rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 whitespace-nowrap disabled:opacity-50"
                      >
                        {isBusy ? 'Deleting...' : 'Confirm Delete'}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setConfirmDeleteId(null)}
                        className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => onOpenWorkbook(wb)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                      >
                        <FolderOpen className="h-3.5 w-3.5 text-[#107C41]" />
                        <span>Open</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy || wb.columns.length === 0}
                        onClick={() => onExportWorkbook(wb)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap disabled:opacity-50"
                      >
                        <Download className="h-3.5 w-3.5 text-[#107C41]" />
                        <span>Download</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => onEditWorkbook(wb)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>Rename / Edit</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleDuplicate(wb, true)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        <span>Duplicate</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleArchiveToggle(wb)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        {wb.archived ? (
                          <>
                            <ArchiveRestore className="h-3.5 w-3.5" />
                            <span>Restore</span>
                          </>
                        ) : (
                          <>
                            <Archive className="h-3.5 w-3.5" />
                            <span>Archive</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setConfirmDeleteId(wb.id)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 whitespace-nowrap"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
