import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  Download,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  CallRecord,
  CallStatus,
  DEFAULT_RECORD_VALUES,
  ParsedDraftRecord,
  RESOLVED_REMARK_PRESETS,
  UNRESOLVED_REMARK_PRESETS,
  WorkbookMetadata,
} from '../types/callsheet';
import {
  buildFinalCallRecord,
  checkDuplicates,
  formatTodayDDMMYYYY,
  isValidDateInput,
  isValidMobileText,
  mapRemarkToStatusAndColumn9,
  normalizeCategory,
  normalizeMobileAsText,
  normalizeSerialId,
  normalizeSubcategory,
  parseBulkNaturalText,
  parseSingleNaturalText,
} from '../utils/statusMapper';

interface AddRecordsViewProps {
  metadata: WorkbookMetadata | null;
  existingRecords: CallRecord[];
  onCommitRecords: (newRecords: CallRecord[]) => Promise<void>;
  onDownloadUpdatedExcel?: () => Promise<void>;
  isExporting?: boolean;
  onGoToMaster: () => void;
}

type EntryMode = 'single' | 'smart' | 'bulk';

export const AddRecordsView: React.FC<AddRecordsViewProps> = ({
  metadata,
  existingRecords,
  onCommitRecords,
  onDownloadUpdatedExcel,
  isExporting = false,
  onGoToMaster,
}) => {
  const defaultDate = formatTodayDDMMYYYY();
  const [entryMode, setEntryMode] = useState<EntryMode>('single');

  // Single Entry Form State
  const [date, setDate] = useState(defaultDate);
  const [serialId, setSerialId] = useState('');
  const [mobileNo, setMobileNo] = useState('');
  const [category, setCategory] = useState<string>(DEFAULT_RECORD_VALUES.category);
  const [subcategory, setSubcategory] = useState<string>(
    DEFAULT_RECORD_VALUES.subcategory
  );
  const [rawRemark, setRawRemark] = useState('');
  const [manualClarifiedStatus, setManualClarifiedStatus] = useState<CallStatus | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitFeedback, setSubmitFeedback] = useState<string | null>(null);

  // Smart Text Single Entry State
  const [smartText, setSmartText] = useState('');
  const [smartPreview, setSmartPreview] = useState<ParsedDraftRecord | null>(null);

  // Bulk Paste State
  const [bulkText, setBulkText] = useState('');
  const [bulkQueue, setBulkQueue] = useState<ParsedDraftRecord[]>([]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>([
      DEFAULT_RECORD_VALUES.category,
      ...Object.keys(metadata?.extractedCategories ?? {}),
    ]);
    for (const rec of existingRecords) {
      if (rec.category) set.add(rec.category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [metadata, existingRecords]);

  const subcategoryOptions = useMemo(() => {
    const set = new Set<string>();
    if (
      !category ||
      category.trim().toLowerCase() === DEFAULT_RECORD_VALUES.category.toLowerCase()
    ) {
      set.add(DEFAULT_RECORD_VALUES.subcategory);
    }
    const map = metadata?.extractedCategories ?? {};
    if (category && map[category]) {
      map[category].forEach((s) => set.add(s));
    } else {
      Object.values(map).forEach((subs) => subs.forEach((s) => set.add(s)));
    }
    for (const rec of existingRecords) {
      if (rec.subcategory && (!category || rec.category === category)) {
        set.add(rec.subcategory);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [metadata, existingRecords, category]);

  const singleMapping = useMemo(
    () => mapRemarkToStatusAndColumn9(rawRemark, manualClarifiedStatus),
    [rawRemark, manualClarifiedStatus]
  );

  const singleDuplicates = useMemo(
    () => checkDuplicates(serialId, mobileNo, existingRecords),
    [serialId, mobileNo, existingRecords]
  );

  if (!metadata) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
        <h2 className="text-lg font-bold text-slate-900">No Master Workbook Loaded</h2>
        <p className="mt-1 text-sm text-slate-600">
          Upload your master .xlsx file or start a new 10-column sheet first before adding records.
        </p>
        <button
          type="button"
          onClick={onGoToMaster}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#107C41] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0B5E31]"
        >
          Go to Master Excel
        </button>
      </div>
    );
  }

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitFeedback(null);

    if (!isValidDateInput(date)) {
      setFormError('Enter a valid date (for example, 17-11-2026).');
      return;
    }

    const cleanedMobile = normalizeMobileAsText(mobileNo);
    if (!isValidMobileText(cleanedMobile)) {
      setFormError(
        'A valid customer mobile number (10 to 15 digits) is required. Do not leave it blank or invent digits.'
      );
      return;
    }

    if (singleMapping.needsClarification || !singleMapping.status) {
      setFormError(
        singleMapping.reason ||
          'Please clarify whether this call outcome is Resolved or Unresolved before adding.'
      );
      return;
    }

    const nextRowIndex = metadata.headerRowIndex + existingRecords.length + 1;
    const draft: ParsedDraftRecord = {
      id: `draft_${Date.now()}`,
      date: date.trim(),
      serialId: normalizeSerialId(serialId),
      mobileNo: cleanedMobile,
      category: normalizeCategory(category),
      subcategory: normalizeSubcategory(subcategory),
      rawRemark: rawRemark.trim(),
      mappedStatus: singleMapping.status,
      mappedRemark: singleMapping.remark,
      needsStatusClarification: false,
      needsMobileClarification: false,
      isDuplicateMobile: singleDuplicates.isDuplicateMobile,
      isDuplicateSerial: singleDuplicates.isDuplicateSerial,
    };

    const finalRecord = buildFinalCallRecord(draft, nextRowIndex, formatTodayDDMMYYYY());
    await onCommitRecords([finalRecord]);

    setSubmitFeedback(
      `Added Row #${nextRowIndex}: ${finalRecord.mobileNo} (${finalRecord.status})`
    );
    // Keep Date, Category, and Subcategory for rapid consecutive calls
    setSerialId('');
    setMobileNo('');
    setRawRemark('');
    setManualClarifiedStatus(null);
  };

  const handleParseSmartText = () => {
    setFormError(null);
    setSubmitFeedback(null);
    const parsed = parseSingleNaturalText(
      smartText,
      { date, category, subcategory },
      existingRecords
    );
    if (!parsed) {
      setFormError('Paste customer details first (e.g. "S ID: 92801385, Mobile: 9752255732, Remark: Busy").');
      return;
    }
    setSmartPreview(parsed);
  };

  const handleCommitSmartPreview = async () => {
    if (!smartPreview) return;
    if (!isValidDateInput(smartPreview.date)) {
      setFormError('Date format is invalid. Use DD-MM-YYYY (e.g. 17-11-2026).');
      return;
    }
    if (smartPreview.needsMobileClarification || !isValidMobileText(smartPreview.mobileNo)) {
      setFormError('Please enter the customer mobile number in the preview before adding.');
      return;
    }
    if (smartPreview.needsStatusClarification || !smartPreview.mappedStatus) {
      setFormError('Please choose Resolved or Unresolved for the unclear remark.');
      return;
    }

    const nextRowIndex = metadata.headerRowIndex + existingRecords.length + 1;
    const finalRecord = buildFinalCallRecord(
      smartPreview,
      nextRowIndex,
      formatTodayDDMMYYYY()
    );
    await onCommitRecords([finalRecord]);
    setSubmitFeedback(`Added Row #${nextRowIndex}: ${finalRecord.mobileNo}`);
    setSmartText('');
    setSmartPreview(null);
  };

  const handleParseBulk = () => {
    setFormError(null);
    setSubmitFeedback(null);
    const parsed = parseBulkNaturalText(
      bulkText,
      { date, category, subcategory },
      existingRecords
    );
    if (parsed.length === 0) {
      setFormError('No valid lines found. Paste comma-separated rows or S ID / Mobile / Remark blocks.');
      return;
    }
    setBulkQueue(parsed);
  };

  const updateBulkDraft = (id: string, patch: Partial<ParsedDraftRecord>) => {
    setBulkQueue((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const merged = { ...item, ...patch };
        const mapping = mapRemarkToStatusAndColumn9(
          merged.rawRemark,
          patch.mappedStatus !== undefined ? patch.mappedStatus : merged.mappedStatus
        );
        const mobileNorm = normalizeMobileAsText(merged.mobileNo);
        const needsMobile = !isValidMobileText(mobileNorm);
        return {
          ...merged,
          mobileNo: mobileNorm,
          serialId: normalizeSerialId(merged.serialId),
          mappedStatus: mapping.status,
          mappedRemark: mapping.remark,
          needsStatusClarification: mapping.needsClarification,
          needsMobileClarification: needsMobile,
        };
      })
    );
  };

  const handleCommitBulk = async () => {
    setFormError(null);
    const invalidItem = bulkQueue.find(
      (item) =>
        item.needsMobileClarification ||
        !isValidMobileText(item.mobileNo) ||
        item.needsStatusClarification ||
        !item.mappedStatus ||
        !isValidDateInput(item.date)
    );
    if (invalidItem) {
      setFormError(
        'Resolve all highlighted rows (missing mobile numbers or unclear statuses) in the preview before adding.'
      );
      return;
    }

    const todayKey = formatTodayDDMMYYYY();
    const startRowIndex = metadata.headerRowIndex + existingRecords.length + 1;
    const recordsToAppend = bulkQueue.map((draft, idx) =>
      buildFinalCallRecord(draft, startRowIndex + idx, todayKey)
    );

    await onCommitRecords(recordsToAppend);
    setSubmitFeedback(
      `Appended ${recordsToAppend.length} records in exact submission order.`
    );
    setBulkQueue([]);
    setBulkText('');
  };

  return (
    <div className="space-y-5">
      {/* Entry Mode Segmented Control */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Add Customer Records</h1>
          <p className="text-xs text-slate-500">
            Auto-maps Unresolved outcomes to CX NOT RESPONSE THE CALL and preserves Resolved remarks.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 sm:w-auto">
          <button
            type="button"
            onClick={() => {
              setEntryMode('single');
              setFormError(null);
            }}
            className={`min-h-[40px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              entryMode === 'single'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Single Entry
          </button>
          <button
            type="button"
            onClick={() => {
              setEntryMode('smart');
              setFormError(null);
            }}
            className={`min-h-[40px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              entryMode === 'smart'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Smart Text
          </button>
          <button
            type="button"
            onClick={() => {
              setEntryMode('bulk');
              setFormError(null);
            }}
            className={`min-h-[40px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              entryMode === 'bulk'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Bulk Paste
          </button>
        </div>
      </div>

      {submitFeedback && (
        <div className="flex flex-col gap-3 rounded-xl border border-[#107C41]/30 bg-[#DCFCE7]/50 px-4 py-3 text-sm font-medium text-[#166534] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{submitFeedback}</span>
          </div>
          {onDownloadUpdatedExcel && (
            <button
              type="button"
              disabled={isExporting}
              onClick={() => void onDownloadUpdatedExcel()}
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-[#107C41] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0B5E31] disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{isExporting ? 'Generating...' : 'Download Updated Excel'}</span>
            </button>
          )}
        </div>
      )}

      {formError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <span>{formError}</span>
        </div>
      )}

      {/* MODE 1: SINGLE STRUCTURED ENTRY */}
      {entryMode === 'single' && (
        <form
          onSubmit={(e) => void handleSingleSubmit(e)}
          className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-6"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Date ({metadata.dateFormat})
              </label>
              <input
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="17-11-2026"
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                S ID / Serial ID
              </label>
              <input
                type="text"
                value={serialId}
                onChange={(e) => setSerialId(e.target.value)}
                placeholder="Leave blank if unavailable (NA)"
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Regd Mobile No <span className="text-red-600">*</span>
              </label>
              <input
                type="tel"
                inputMode="numeric"
                value={mobileNo}
                onChange={(e) => setMobileNo(e.target.value)}
                placeholder="9752255732"
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Category
              </label>
              <input
                type="text"
                list="category-options"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Select or type category"
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/20"
              />
              <datalist id="category-options">
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Subcategory
              </label>
              <input
                type="text"
                list="subcategory-options"
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                placeholder="Select or type subcategory"
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/20"
              />
              <datalist id="subcategory-options">
                {subcategoryOptions.map((sub) => (
                  <option key={sub} value={sub} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Remark / Call Details <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={rawRemark}
                onChange={(e) => {
                  setRawRemark(e.target.value);
                  setManualClarifiedStatus(null);
                }}
                placeholder="Busy, Repayment, Pay Link, General Query..."
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/20"
              />
            </div>
          </div>

          {/* Quick Outcome Presets */}
          <div className="space-y-2.5 border-t border-slate-200 pt-4">
            <div className="text-xs font-semibold text-slate-600">
              Quick Unresolved Outcomes (maps to Unresolved + CX NOT RESPONSE THE CALL)
            </div>
            <div className="flex flex-wrap gap-2">
              {UNRESOLVED_REMARK_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setRawRemark(preset);
                    setManualClarifiedStatus(null);
                  }}
                  className={`min-h-[38px] rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    rawRemark.toLowerCase() === preset.toLowerCase()
                      ? 'border-amber-500 bg-amber-50 text-amber-900'
                      : 'border-slate-200 bg-[#F8FAFC] text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className="pt-1 text-xs font-semibold text-slate-600">
              Quick Resolved Outcomes (retains exact remark in Column 9)
            </div>
            <div className="flex flex-wrap gap-2">
              {RESOLVED_REMARK_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setRawRemark(preset);
                    setManualClarifiedStatus(null);
                  }}
                  className={`min-h-[38px] rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    rawRemark.toLowerCase() === preset.toLowerCase()
                      ? 'border-[#107C41] bg-[#DCFCE7] text-[#166534]'
                      : 'border-slate-200 bg-[#F8FAFC] text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Duplicate Warning (Non-blocking) */}
          {(singleDuplicates.isDuplicateMobile || singleDuplicates.isDuplicateSerial) && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                <span className="font-semibold">Duplicate detected: </span>
                {singleDuplicates.isDuplicateMobile && 'Mobile number '}
                {singleDuplicates.isDuplicateMobile && singleDuplicates.isDuplicateSerial && 'and '}
                {singleDuplicates.isDuplicateSerial && 'Serial ID '}
                already exists in the sheet. Submitting will still append this as a separate new row.
              </div>
            </div>
          )}

          {/* Unclear Outcome Clarification Prompt */}
          {rawRemark.trim().length > 0 && singleMapping.needsClarification && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3.5 space-y-2.5">
              <p className="text-xs font-semibold text-amber-950">
                Outcome "{rawRemark}" is not a standard keyword. Confirm before adding:
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setManualClarifiedStatus('Resolved')}
                  className="min-h-[40px] rounded-lg bg-[#107C41] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0B5E31]"
                >
                  Mark Resolved (Keep "{rawRemark}")
                </button>
                <button
                  type="button"
                  onClick={() => setManualClarifiedStatus('Unresolved')}
                  className="min-h-[40px] rounded-lg border border-amber-400 bg-white px-3.5 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                >
                  Mark Unresolved (Set CX NOT RESPONSE THE CALL)
                </button>
              </div>
            </div>
          )}

          {/* Live Output Row Preview */}
          <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-3 text-xs">
            <div className="font-semibold text-slate-700">
              Excel Row Preview (10 Exact Columns)
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[11px] sm:grid-cols-4">
              <div>
                <span className="font-sans text-slate-500">Date: </span>
                {date || '—'}
              </div>
              <div>
                <span className="font-sans text-slate-500">Serial id: </span>
                {normalizeSerialId(serialId)}
              </div>
              <div>
                <span className="font-sans text-slate-500">Mobile: </span>
                {normalizeMobileAsText(mobileNo) || 'Required'}
              </div>
              <div>
                <span className="font-sans text-slate-500">Status: </span>
                <span
                  className={
                    singleMapping.status === 'Resolved'
                      ? 'font-semibold text-[#166534]'
                      : singleMapping.status === 'Unresolved'
                        ? 'font-semibold text-[#B45309]'
                        : 'text-slate-500'
                  }
                >
                  {singleMapping.status ?? 'Pending'}
                </span>
              </div>
              <div>
                <span className="font-sans text-slate-500">Category: </span>
                {normalizeCategory(category)}
              </div>
              <div className="sm:col-span-2">
                <span className="font-sans text-slate-500">Subcategory: </span>
                {normalizeSubcategory(subcategory)}
              </div>
              <div>
                <span className="font-sans text-slate-500">Defaults: </span>
                {DEFAULT_RECORD_VALUES.escalations} · {DEFAULT_RECORD_VALUES.channels} ·{' '}
                {DEFAULT_RECORD_VALUES.names}
              </div>
            </div>
            <div className="mt-2 border-t border-slate-200 pt-2 text-[11px] text-slate-700">
              <span className="font-semibold text-slate-500">
                Col 9 ("Serial id" / Remarks):{' '}
              </span>
              <span className="font-mono font-medium">
                {singleMapping.remark || '—'}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-slate-500">
              Mobile number is stored strictly as text so all digits are preserved.
            </span>
            <button
              type="submit"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#107C41] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0B5E31] whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>Add Record</span>
            </button>
          </div>
        </form>
      )}

      {/* MODE 2: SMART NATURAL TEXT ENTRY */}
      {entryMode === 'smart' && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Paste Natural Text or Comma-Separated Record
            </label>
            <p className="mt-0.5 text-xs text-slate-500">
              Supports formats like{' '}
              <span className="font-mono">S ID: 92801385 / Mobile: 9752255732 / Remark: Busy</span>{' '}
              or <span className="font-mono">92801385, 9752255732, Busy</span>
            </p>
            <textarea
              rows={4}
              value={smartText}
              onChange={(e) => setSmartText(e.target.value)}
              placeholder={'S ID: 92801385\nMobile: 9752255732\nRemark: Busy'}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-sm text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/20"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleParseSmartText}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Sparkles className="h-4 w-4" />
              <span>Detect Fields & Preview</span>
            </button>
          </div>

          {smartPreview && (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-[#F8FAFC] p-4">
              <div className="text-xs font-bold text-slate-900">
                Editable Parsed Preview
              </div>

              {(smartPreview.isDuplicateMobile || smartPreview.isDuplicateSerial) && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Duplicate detected—confirming will still append this as a new row.
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">Date</label>
                  <input
                    type="text"
                    value={smartPreview.date}
                    onChange={(e) =>
                      setSmartPreview({ ...smartPreview, date: e.target.value })
                    }
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">Serial id</label>
                  <input
                    type="text"
                    value={smartPreview.serialId}
                    onChange={(e) =>
                      setSmartPreview({
                        ...smartPreview,
                        serialId: normalizeSerialId(e.target.value),
                      })
                    }
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Regd Mobile No {smartPreview.needsMobileClarification && '(Required)'}
                  </label>
                  <input
                    type="tel"
                    value={smartPreview.mobileNo}
                    onChange={(e) => {
                      const mob = normalizeMobileAsText(e.target.value);
                      setSmartPreview({
                        ...smartPreview,
                        mobileNo: mob,
                        needsMobileClarification: !isValidMobileText(mob),
                      });
                    }}
                    className={`mt-1 min-h-[40px] w-full rounded-lg border bg-white px-2.5 font-mono text-xs ${
                      smartPreview.needsMobileClarification
                        ? 'border-red-400 bg-red-50/40'
                        : 'border-slate-300'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">Category</label>
                  <input
                    type="text"
                    value={smartPreview.category}
                    onChange={(e) =>
                      setSmartPreview({ ...smartPreview, category: e.target.value })
                    }
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">Subcategory</label>
                  <input
                    type="text"
                    value={smartPreview.subcategory}
                    onChange={(e) =>
                      setSmartPreview({ ...smartPreview, subcategory: e.target.value })
                    }
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Raw Remark
                  </label>
                  <input
                    type="text"
                    value={smartPreview.rawRemark}
                    onChange={(e) => {
                      const next = e.target.value;
                      const m = mapRemarkToStatusAndColumn9(next);
                      setSmartPreview({
                        ...smartPreview,
                        rawRemark: next,
                        mappedStatus: m.status,
                        mappedRemark: m.remark,
                        needsStatusClarification: m.needsClarification,
                      });
                    }}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
                <div className="text-xs">
                  <span className="font-semibold text-slate-600">Mapped Output: </span>
                  <span className="font-mono font-semibold text-slate-900">
                    {smartPreview.mappedStatus ?? 'Clarify Status'} → {smartPreview.mappedRemark || '—'}
                  </span>
                </div>

                {smartPreview.needsStatusClarification && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const m = mapRemarkToStatusAndColumn9(smartPreview.rawRemark, 'Resolved');
                        setSmartPreview({
                          ...smartPreview,
                          mappedStatus: m.status,
                          mappedRemark: m.remark,
                          needsStatusClarification: false,
                        });
                      }}
                      className="rounded-lg bg-[#107C41] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Resolved
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const m = mapRemarkToStatusAndColumn9(smartPreview.rawRemark, 'Unresolved');
                        setSmartPreview({
                          ...smartPreview,
                          mappedStatus: m.status,
                          mappedRemark: m.remark,
                          needsStatusClarification: false,
                        });
                      }}
                      className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900"
                    >
                      Unresolved
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void handleCommitSmartPreview()}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#107C41] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0B5E31]"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Parsed Record</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODE 3: BULK PASTE WITH EDITABLE PREVIEW */}
      {entryMode === 'bulk' && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Bulk Customer Records (Row form: phone number, serial id, and remarks — Category defaults to Query / General information related)
            </label>
            <textarea
              rows={6}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={
                '9752255732, 92801385, Busy\n9876543210\t92801386\tPay Link\n9123456789 No Response'
              }
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/20"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleParseBulk}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <ClipboardPaste className="h-4 w-4" />
              <span>Preview Batch</span>
            </button>
            {bulkQueue.length > 0 && (
              <span className="text-xs font-medium text-slate-600 tabular-nums">
                {bulkQueue.length} rows staged in exact submission order
              </span>
            )}
          </div>

          {bulkQueue.length > 0 && (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-[#F1F5F9] border-b border-slate-200 text-slate-700">
                      <th className="px-2.5 py-2 font-mono">#</th>
                      <th className="px-2.5 py-2">Date</th>
                      <th className="px-2.5 py-2">Serial id</th>
                      <th className="px-2.5 py-2">Regd Mobile No</th>
                      <th className="px-2.5 py-2">Category</th>
                      <th className="px-2.5 py-2">Subcategory</th>
                      <th className="px-2.5 py-2">Status</th>
                      <th className="px-2.5 py-2">Col 9 Remark</th>
                      <th className="px-2.5 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {bulkQueue.map((item, idx) => (
                      <tr
                        key={item.id}
                        className={
                          item.needsMobileClarification || item.needsStatusClarification
                            ? 'bg-amber-50/70'
                            : 'bg-white'
                        }
                      >
                        <td className="px-2.5 py-2 font-mono text-slate-500 tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="px-2.5 py-2">
                          <input
                            type="text"
                            value={item.date}
                            onChange={(e) =>
                              updateBulkDraft(item.id, { date: e.target.value })
                            }
                            className="w-24 rounded border border-slate-300 px-2 py-1 font-mono text-xs"
                          />
                        </td>
                        <td className="px-2.5 py-2">
                          <input
                            type="text"
                            value={item.serialId}
                            onChange={(e) =>
                              updateBulkDraft(item.id, { serialId: e.target.value })
                            }
                            className="w-24 rounded border border-slate-300 px-2 py-1 font-mono text-xs"
                          />
                        </td>
                        <td className="px-2.5 py-2">
                          <input
                            type="tel"
                            value={item.mobileNo}
                            onChange={(e) =>
                              updateBulkDraft(item.id, { mobileNo: e.target.value })
                            }
                            placeholder="Missing!"
                            className={`w-28 rounded border px-2 py-1 font-mono text-xs ${
                              item.needsMobileClarification
                                ? 'border-red-400 bg-red-50'
                                : 'border-slate-300'
                            }`}
                          />
                          {item.isDuplicateMobile && (
                            <div className="mt-0.5 text-[10px] font-semibold text-[#B45309]">
                              Duplicate (will keep)
                            </div>
                          )}
                        </td>
                        <td className="px-2.5 py-2">
                          <input
                            type="text"
                            value={item.category}
                            onChange={(e) =>
                              updateBulkDraft(item.id, { category: e.target.value })
                            }
                            onBlur={(e) =>
                              updateBulkDraft(item.id, {
                                category: normalizeCategory(e.target.value),
                              })
                            }
                            className="w-24 rounded border border-slate-300 px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-2.5 py-2">
                          <input
                            type="text"
                            value={item.subcategory}
                            onChange={(e) =>
                              updateBulkDraft(item.id, { subcategory: e.target.value })
                            }
                            onBlur={(e) =>
                              updateBulkDraft(item.id, {
                                subcategory: normalizeSubcategory(e.target.value),
                              })
                            }
                            className="w-40 rounded border border-slate-300 px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-2.5 py-2">
                          <select
                            value={item.mappedStatus ?? ''}
                            onChange={(e) =>
                              updateBulkDraft(item.id, {
                                mappedStatus: (e.target.value || null) as CallStatus | null,
                              })
                            }
                            className={`rounded border px-2 py-1 text-xs font-semibold ${
                              item.needsStatusClarification
                                ? 'border-amber-500 bg-amber-100 text-amber-900'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            <option value="">Clarify...</option>
                            <option value="Resolved">Resolved</option>
                            <option value="Unresolved">Unresolved</option>
                          </select>
                        </td>
                        <td className="px-2.5 py-2 font-mono text-slate-800">
                          {item.mappedRemark || item.rawRemark}
                        </td>
                        <td className="px-2.5 py-2 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setBulkQueue((prev) => prev.filter((r) => r.id !== item.id))
                            }
                            aria-label="Remove staged row"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleCommitBulk()}
                  className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#107C41] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0B5E31]"
                >
                  <Plus className="h-4 w-4" />
                  <span>Append All {bulkQueue.length} Records</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
