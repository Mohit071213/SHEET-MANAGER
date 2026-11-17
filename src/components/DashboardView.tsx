import React from 'react';
import {
  Download,
  FileSpreadsheet,
  Plus,
  Upload,
  History,
} from 'lucide-react';
import { AppSection, CallRecord, WorkbookMetadata } from '../types/callsheet';
import { formatTodayDDMMYYYY } from '../utils/statusMapper';
import { SpreadsheetTable } from './SpreadsheetTable';

interface DashboardViewProps {
  metadata: WorkbookMetadata | null;
  masterRecords: CallRecord[];
  addedRecords: CallRecord[];
  onNavigate: (section: AppSection) => void;
  onQuickUploadFile: (file: File) => Promise<void>;
  onCreateBlankTemplate: () => Promise<void>;
  onQuickDownload: () => Promise<void>;
  isExporting: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  metadata,
  masterRecords,
  addedRecords,
  onNavigate,
  onQuickUploadFile,
  onCreateBlankTemplate,
  onQuickDownload,
  isExporting,
}) => {
  const allRecords = [...masterRecords, ...addedRecords];
  const todayKey = formatTodayDDMMYYYY();

  const totalCount = allRecords.length;
  const addedTodayCount = addedRecords.filter((r) => r.addedDateKey === todayKey).length;
  const totalResolved = allRecords.filter((r) => r.status === 'Resolved').length;
  const totalUnresolved = allRecords.filter((r) => r.status === 'Unresolved').length;

  const latest10Added = [...addedRecords].reverse().slice(0, 10);
  const latestRowsToShow =
    latest10Added.length > 0 ? latest10Added : [...allRecords].reverse().slice(0, 10);

  const formattedUpdated = metadata?.lastUpdatedAt
    ? new Date(metadata.lastUpdatedAt).toLocaleString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not loaded';

  if (!metadata) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Load Your Master Calling Workbook
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Upload your existing <span className="font-mono font-medium">.xlsx</span> file to preserve all existing customer records, formatting, frozen headers, and column widths. You can then add single or bulk records from your phone or PC and download the updated sheet.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#107C41] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0B5E31] whitespace-nowrap">
              <Upload className="h-4 w-4" />
              <span>Upload Master Excel (.xlsx)</span>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void onQuickUploadFile(file);
                    e.target.value = '';
                  }
                }}
              />
            </label>

            <button
              type="button"
              onClick={() => void onCreateBlankTemplate()}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              <FileSpreadsheet className="h-4 w-4 text-[#107C41]" />
              <span>Start New 10-Column Master Sheet</span>
            </button>
          </div>

          <div className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500">
            Exact columns enforced: Date · Serial id · Regd Mobile No · Category · Subcategory · Status · Escalations · Channels · Serial id (Remarks) · Names
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Loaded Workbook Summary Strip */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-[#107C41] shrink-0" />
            <h2 className="truncate text-base font-bold text-slate-900">
              {metadata.fileName}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span>Sheet: {metadata.sheetName}</span>
            <span aria-hidden="true">·</span>
            <span>Date format: {metadata.dateFormat}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">Last updated: {formattedUpdated}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('add')}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#107C41] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0B5E31] whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Add Record</span>
          </button>

          <button
            type="button"
            disabled={isExporting}
            onClick={() => void onQuickDownload()}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <Download className="h-4 w-4 text-[#107C41]" />
            <span>{isExporting ? 'Generating...' : 'Download Excel'}</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Summary Metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Total Master Records</div>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {totalCount}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {metadata.originalRecordCount} original + {addedRecords.length} added
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Added Today</div>
          <div className="mt-1 font-mono text-2xl font-bold text-[#107C41] tabular-nums">
            {addedTodayCount}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {todayKey}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Total Resolved</div>
          <div className="mt-1 font-mono text-2xl font-bold text-[#166534] tabular-nums">
            {totalResolved}
          </div>
          <div className="mt-1 text-xs text-slate-500">Retained remarks</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Total Unresolved</div>
          <div className="mt-1 font-mono text-2xl font-bold text-[#B45309] tabular-nums">
            {totalUnresolved}
          </div>
          <div className="mt-1 text-xs text-slate-500">CX NOT RESPONSE</div>
        </div>
      </div>

      {/* Latest 10 Added Records */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {latest10Added.length > 0
                ? `Latest ${latest10Added.length} Added Records`
                : 'Latest Records from Master Workbook'}
            </h3>
            <p className="text-xs text-slate-500">
              {latest10Added.length > 0
                ? 'Appended in exact submission order at the bottom of the Excel sheet.'
                : 'Showing recent rows from your uploaded workbook. Add new calls to append rows.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('history')}
            className="inline-flex min-h-[40px] items-center gap-1.5 text-xs font-semibold text-[#107C41] hover:underline whitespace-nowrap shrink-0"
          >
            <History className="h-3.5 w-3.5" />
            <span>View All ({totalCount})</span>
          </button>
        </div>

        <SpreadsheetTable
          records={latestRowsToShow}
          emptyMessage="No records added yet. Tap Add Record to log your first customer call."
        />
      </div>
    </div>
  );
};
