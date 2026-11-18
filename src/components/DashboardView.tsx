import React, { useState } from 'react';
import {
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  History,
  Plus,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import {
  AppSection,
  CallRecord,
  DATA_RETENTION_DAYS,
  EmployeeName,
  GlobalEntryDefaults,
  WorkbookMetadata,
} from '../types/callsheet';
import { loadLocalAiConfig } from '../utils/aiRemarkEngine';
import { formatExpiryDateDDMMYYYY, getRetentionDaysRemaining } from '../utils/retention';
import { formatTodayDDMMYYYY } from '../utils/statusMapper';
import { SpreadsheetTable } from './SpreadsheetTable';

interface DashboardViewProps {
  employeeName: EmployeeName;
  metadata: WorkbookMetadata | null;
  masterRecords: CallRecord[];
  addedRecords: CallRecord[];
  globalDefaults: GlobalEntryDefaults;
  onNavigate: (section: AppSection) => void;
  onSwitchUser: () => void;
  onQuickUploadFile: (file: File) => Promise<void>;
  onCreateBlankTemplate: () => Promise<void>;
  onQuickDownload: () => Promise<void>;
  onProcessBulkFromDashboard: (bulkText: string) => void;
  isExporting: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  employeeName,
  metadata,
  masterRecords,
  addedRecords,
  globalDefaults,
  onNavigate,
  onSwitchUser,
  onQuickUploadFile,
  onCreateBlankTemplate,
  onQuickDownload,
  onProcessBulkFromDashboard,
  isExporting,
}) => {
  const [quickBulkInput, setQuickBulkInput] = useState('');
  const localAiConfig = loadLocalAiConfig();
  const allRecords = [...masterRecords, ...addedRecords];
  const todayKey = formatTodayDDMMYYYY();

  const totalCount = allRecords.length;
  const addedTodayCount = addedRecords.filter((r) => r.addedDateKey === todayKey).length;
  const totalResolved = allRecords.filter((r) => r.status === 'Resolved').length;
  const totalUnresolved = allRecords.filter((r) => r.status === 'Unresolved').length;
  const duplicateCount = addedRecords.filter(
    (r) => r.isDuplicateMobile || r.isDuplicateSerial
  ).length;

  const latest10Added = [...addedRecords].reverse().slice(0, 10);
  const latestRowsToShow =
    latest10Added.length > 0 ? latest10Added : [...allRecords].reverse().slice(0, 10);

  const retentionTimestamp = metadata?.lastUpdatedAt || metadata?.loadedAt;
  const retentionDaysLeft = getRetentionDaysRemaining(retentionTimestamp);
  const expiryDateStr = formatExpiryDateDDMMYYYY(retentionTimestamp);

  const formattedUpdated = metadata?.lastUpdatedAt
    ? new Date(metadata.lastUpdatedAt).toLocaleString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not loaded';

  return (
    <div className="space-y-6">
      {/* Active Employee Header Card */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#DCFCE7] text-[#166534] font-bold text-sm shrink-0">
            {employeeName.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-mono text-slate-500">
              ACTIVE ACCOUNT · {DATA_RETENTION_DAYS}-DAY SAVING
            </div>
            <div className="text-base font-bold text-slate-900 truncate">
              {employeeName} Master Sheet
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onSwitchUser}
          className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          <Users className="h-3.5 w-3.5 text-[#107C41]" />
          <span>Switch Account</span>
        </button>
      </div>

      {!metadata ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Upload {employeeName}&apos;s Calling Sheet
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              No preloaded master data is stored. Upload {employeeName}&apos;s own{' '}
              <span className="font-mono font-medium">.xlsx</span> sheet or start a fresh blank 10-column sheet. Uploaded sheets and new entries are kept for {DATA_RETENTION_DAYS} days and automatically use your shared Global Entry Defaults ({globalDefaults.defaultCategory} · {globalDefaults.defaultSubcategory} · {globalDefaults.defaultEscalations} · {globalDefaults.defaultChannels}).
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#107C41] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0B5E31] whitespace-nowrap">
              <Upload className="h-4 w-4" />
              <span>Upload {employeeName}&apos;s Sheet (.xlsx)</span>
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
              <span>Start Blank {employeeName} Sheet</span>
            </button>
          </div>

          <div className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500">
            Exact workbook preservation: original headers, multiple worksheets, dropdown validations, date/number formats, and {DATA_RETENTION_DAYS}-day auto-retention.
          </div>
        </div>
      ) : (
        <>
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
                <span className="tabular-nums">Updated: {formattedUpdated}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-[#166534]">
                  {retentionDaysLeft}d retention left (exp {expiryDateStr})
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => onNavigate('add')}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#107C41] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0B5E31] whitespace-nowrap shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>Add Records</span>
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
              <div className="text-xs font-medium text-slate-500">Total Sheet Records</div>
              <div className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {totalCount}
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                {metadata.originalRecordCount} uploaded + {addedRecords.length} added
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500">Added Today</div>
              <div className="mt-1 font-mono text-2xl font-bold text-[#107C41] tabular-nums">
                {addedTodayCount}
              </div>
              <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                {todayKey} · Names: {employeeName}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500">Resolved Calls</div>
              <div className="mt-1 font-mono text-2xl font-bold text-[#166534] tabular-nums">
                {totalResolved}
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                {duplicateCount} duplicates logged
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500">Unresolved / Follow-up</div>
              <div className="mt-1 font-mono text-2xl font-bold text-[#B45309] tabular-nums">
                {totalUnresolved}
              </div>
              <div className="mt-1 text-xs text-slate-500">CX NOT RESPONSE</div>
            </div>
          </div>

          {/* Dashboard Quick Bulk Calling Data Processor */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#107C41]" />
                  <span>Quick Bulk Calling Data Processor</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Paste messy calling lines (phone + remark, Serial ID + remark, combined pairs, mixed order, timestamps) using{' '}
                  <span className="font-semibold text-slate-700">
                    {localAiConfig.enabled
                      ? `On-Device Semantic AI + Local Ollama (${localAiConfig.modelName})`
                      : 'On-Device Semantic AI (Free Local Engine)'}
                  </span>
                  .
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('settings')}
                className="text-xs font-semibold text-[#107C41] hover:underline self-start sm:self-auto whitespace-nowrap"
              >
                Edit Defaults / AI Settings
              </button>
            </div>

            <textarea
              rows={4}
              value={quickBulkInput}
              onChange={(e) => setQuickBulkInput(e.target.value)}
              placeholder={
                '9876543210 busy\n92801385 rejected\n94147470,6006838660 Not Available\n8962714926 Resolved; Pay Link'
              }
              className="w-full rounded-xl border border-slate-300 bg-[#F8FAFC] p-3 font-mono text-xs text-slate-900 focus:border-[#107C41] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#107C41]/20"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                Global Defaults: {globalDefaults.defaultCategory} · {globalDefaults.defaultSubcategory} · {globalDefaults.defaultEscalations} · {globalDefaults.defaultChannels} · Names: {employeeName}
              </span>
              <button
                type="button"
                disabled={!quickBulkInput.trim()}
                onClick={() => onProcessBulkFromDashboard(quickBulkInput)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#107C41] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0B5E31] disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <ClipboardPaste className="h-4 w-4" />
                <span>Analyse &amp; Process with AI</span>
              </button>
            </div>
          </div>

          {/* Latest 10 Added Records */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {latest10Added.length > 0
                    ? `Latest ${latest10Added.length} Added Records`
                    : 'Latest Records from Uploaded Sheet'}
                </h3>
                <p className="text-xs text-slate-500">
                  {latest10Added.length > 0
                    ? 'Appended in exact submission order at the bottom of your sheet (auto-saved for 7 days).'
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
              emptyMessage="No records added yet. Paste bulk records above or tap Add Records."
            />
          </div>
        </>
      )}
    </div>
  );
};
