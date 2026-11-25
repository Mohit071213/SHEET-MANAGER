import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookmarkPlus,
  CheckCircle2,
  Download,
  Filter,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  CallRecord,
  CallStatus,
  CategoryOption,
  DEFAULT_CHANNEL_OPTIONS,
  DEFAULT_ESCALATION_OPTIONS,
  DEFAULT_RECORD_VALUES,
  EmployeeName,
  GlobalEntryDefaults,
  ParsedDraftRecord,
  PERMITTED_CATEGORIES,
  PERMITTED_REMARKS,
  PERMITTED_SUBCATEGORIES,
  RemarkOption,
  RESOLVED_REMARK_PRESETS,
  ShortcutRule,
  SubcategoryOption,
  UNRESOLVED_REMARK_PRESETS,
  WorkbookMetadata,
} from '../types/callsheet';
import { loadLocalAiConfig } from '../utils/aiRemarkEngine';
import {
  buildFinalCallRecord,
  checkDuplicates,
  enhanceDraftsWithOllamaIfEnabled,
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
  summarizeProcessingResults,
} from '../utils/statusMapper';
import { GlobalEntryDefaultsCard } from './GlobalEntryDefaultsCard';
import { CallsheetFileImportPanel } from './CallsheetFileImportPanel';

interface AddRecordsViewProps {
  employeeName: EmployeeName;
  shortcutRules: ShortcutRule[];
  onAddShortcutRule?: (rule: ShortcutRule) => void;
  metadata: WorkbookMetadata | null;
  existingRecords: CallRecord[];
  globalDefaults: GlobalEntryDefaults;
  onSaveGlobalDefaults: (next: GlobalEntryDefaults) => Promise<void>;
  onCommitRecords: (newRecords: CallRecord[]) => Promise<void>;
  onDownloadUpdatedExcel?: () => Promise<void>;
  isExporting?: boolean;
  onGoToMaster: () => void;
  initialBulkText?: string | null;
  onConsumedInitialBulkText?: () => void;
}

type EntryMode = 'single' | 'smart' | 'bulk' | 'import';

export const AddRecordsView: React.FC<AddRecordsViewProps> = ({
  employeeName,
  shortcutRules,
  onAddShortcutRule,
  metadata,
  existingRecords,
  globalDefaults,
  onSaveGlobalDefaults,
  onCommitRecords,
  onDownloadUpdatedExcel,
  isExporting = false,
  onGoToMaster,
  initialBulkText,
  onConsumedInitialBulkText,
}) => {
  const defaultDate = formatTodayDDMMYYYY();
  const [entryMode, setEntryMode] = useState<EntryMode>('bulk');

  // Single Entry Form State (synced to shared GlobalEntryDefaults)
  const [date, setDate] = useState(defaultDate);
  const [serialId, setSerialId] = useState('');
  const [mobileNo, setMobileNo] = useState('');
  const [category, setCategory] = useState<CategoryOption>(globalDefaults.defaultCategory);
  const [subcategory, setSubcategory] = useState<SubcategoryOption>(
    globalDefaults.defaultSubcategory
  );
  const [escalations, setEscalations] = useState<string>(globalDefaults.defaultEscalations);
  const [channels, setChannels] = useState<string>(globalDefaults.defaultChannels);
  const [rawRemark, setRawRemark] = useState('');
  const [manualRemarkOverride, setManualRemarkOverride] = useState<RemarkOption | ''>('');
  const [manualClarifiedStatus, setManualClarifiedStatus] = useState<CallStatus | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitFeedback, setSubmitFeedback] = useState<string | null>(null);

  // Keep single-entry defaults synchronized when shared GlobalEntryDefaults updates
  useEffect(() => {
    setCategory(globalDefaults.defaultCategory);
    setSubcategory(globalDefaults.defaultSubcategory);
    setEscalations(globalDefaults.defaultEscalations);
    setChannels(globalDefaults.defaultChannels);
  }, [globalDefaults]);

  // Smart Text Single Entry State
  const [smartText, setSmartText] = useState('');
  const [smartPreview, setSmartPreview] = useState<ParsedDraftRecord | null>(null);

  // Bulk Paste State
  const [bulkText, setBulkText] = useState('');
  const [bulkQueue, setBulkQueue] = useState<ParsedDraftRecord[]>([]);
  const [savedShortcutIds, setSavedShortcutIds] = useState<Record<string, boolean>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showOnlyReview, setShowOnlyReview] = useState(false);

  // Consume pre-filled bulk text sent from Dashboard Quick Processor
  useEffect(() => {
    if (initialBulkText && initialBulkText.trim()) {
      setEntryMode('bulk');
      setBulkText(initialBulkText);
      const parseDefaults = {
        date: defaultDate,
        category: globalDefaults.defaultCategory,
        subcategory: globalDefaults.defaultSubcategory,
        escalations: globalDefaults.defaultEscalations,
        channels: globalDefaults.defaultChannels,
        alwaysApplyCategorySubcategory: globalDefaults.alwaysApplyCategorySubcategory,
      };
      const parsed = parseBulkNaturalText(
        initialBulkText,
        parseDefaults,
        existingRecords,
        shortcutRules
      );
      setBulkQueue(parsed);
      setShowOnlyReview(false);
      setFormError(null);
      setSubmitFeedback(null);
      onConsumedInitialBulkText?.();

      if (loadLocalAiConfig().enabled && parsed.some((d) => d.needsStatusClarification)) {
        setIsAnalyzing(true);
        void enhanceDraftsWithOllamaIfEnabled(parsed, parseDefaults)
          .then((enhanced) => setBulkQueue(enhanced))
          .finally(() => setIsAnalyzing(false));
      }
    }
  }, [
    initialBulkText,
    defaultDate,
    existingRecords,
    shortcutRules,
    globalDefaults,
    onConsumedInitialBulkText,
  ]);

  const singleMapping = useMemo(
    () =>
      mapRemarkToStatusAndColumn9(rawRemark, manualClarifiedStatus, shortcutRules, {
        explicitRemark: manualRemarkOverride || undefined,
        explicitCategory: category,
        explicitSubcategory: subcategory,
        defaultCategory: globalDefaults.defaultCategory,
        defaultSubcategory: globalDefaults.defaultSubcategory,
        alwaysApplyCategorySubcategory: globalDefaults.alwaysApplyCategorySubcategory,
      }),
    [
      rawRemark,
      manualClarifiedStatus,
      shortcutRules,
      manualRemarkOverride,
      category,
      subcategory,
      globalDefaults,
    ]
  );

  const singleDuplicates = useMemo(
    () => checkDuplicates(serialId, mobileNo, existingRecords),
    [serialId, mobileNo, existingRecords]
  );

  const processingSummary = useMemo(
    () => summarizeProcessingResults(bulkQueue),
    [bulkQueue]
  );

  if (!metadata) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
        <h2 className="text-lg font-bold text-slate-900">No Master Workbook Loaded</h2>
        <p className="mt-1 text-sm text-slate-600">
          Upload {employeeName}&apos;s master .xlsx file or start a new sheet first before adding records.
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
    const cleanedSerial = normalizeSerialId(serialId);
    const hasMobile = isValidMobileText(cleanedMobile);
    const hasSerial = cleanedSerial !== DEFAULT_RECORD_VALUES.missingSerialId;

    if (cleanedMobile.length > 0 && !hasMobile) {
      setFormError('Mobile number must contain 10 to 15 digits.');
      return;
    }
    if (!hasMobile && !hasSerial) {
      setFormError(
        'Enter at least a 10-digit Mobile Number or a valid Serial ID before adding.'
      );
      return;
    }

    if (singleMapping.needsClarification || !singleMapping.status || !singleMapping.remark) {
      setFormError(
        singleMapping.reason ||
          'Please select an exact Status and Master Remark before adding.'
      );
      return;
    }

    const nextRowIndex = metadata.headerRowIndex + existingRecords.length + 1;
    const draft: ParsedDraftRecord = {
      id: `draft_${Date.now()}`,
      date: date.trim(),
      serialId: cleanedSerial,
      mobileNo: cleanedMobile,
      category: normalizeCategory(category),
      subcategory: normalizeSubcategory(subcategory),
      escalations: escalations.trim() || globalDefaults.defaultEscalations,
      channels: channels.trim() || globalDefaults.defaultChannels,
      rawRemark: rawRemark.trim(),
      mappedStatus: singleMapping.status,
      mappedRemark: singleMapping.remark,
      needsStatusClarification: false,
      needsMobileClarification: false,
      isDuplicateMobile: singleDuplicates.isDuplicateMobile,
      isDuplicateSerial: singleDuplicates.isDuplicateSerial,
    };

    const finalRecord = buildFinalCallRecord(
      draft,
      nextRowIndex,
      formatTodayDDMMYYYY(),
      employeeName,
      undefined,
      globalDefaults
    );
    await onCommitRecords([finalRecord]);

    setSubmitFeedback(
      `Added Row #${nextRowIndex}: ${finalRecord.mobileNo || finalRecord.serialId} (${finalRecord.status})`
    );
    setSerialId('');
    setMobileNo('');
    setRawRemark('');
    setManualRemarkOverride('');
    setManualClarifiedStatus(null);
    setCategory(globalDefaults.defaultCategory);
    setSubcategory(globalDefaults.defaultSubcategory);
    setEscalations(globalDefaults.defaultEscalations);
    setChannels(globalDefaults.defaultChannels);
  };

  const handleParseSmartText = () => {
    setFormError(null);
    setSubmitFeedback(null);
    const parsed = parseSingleNaturalText(
      smartText,
      {
        date,
        category: globalDefaults.defaultCategory,
        subcategory: globalDefaults.defaultSubcategory,
        escalations: globalDefaults.defaultEscalations,
        channels: globalDefaults.defaultChannels,
        alwaysApplyCategorySubcategory: globalDefaults.alwaysApplyCategorySubcategory,
      },
      existingRecords,
      shortcutRules
    );
    if (!parsed) {
      setFormError(
        'Paste customer details first (e.g. "9876543210 busy", "92801385 rejected", or "S ID: 92801385, Mobile: 9752255732, Remark: Busy").'
      );
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
    const hasMobile = isValidMobileText(smartPreview.mobileNo);
    const hasSerial = normalizeSerialId(smartPreview.serialId) !== 'NA';
    if (smartPreview.needsMobileClarification || (!hasMobile && !hasSerial)) {
      setFormError('Enter a valid 10-digit Mobile Number or Serial ID in the preview.');
      return;
    }
    if (
      smartPreview.needsStatusClarification ||
      !smartPreview.mappedStatus ||
      !smartPreview.mappedRemark
    ) {
      setFormError('Select exact Status and Master Remark for the flagged remark.');
      return;
    }

    const nextRowIndex = metadata.headerRowIndex + existingRecords.length + 1;
    const finalRecord = buildFinalCallRecord(
      smartPreview,
      nextRowIndex,
      formatTodayDDMMYYYY(),
      employeeName,
      undefined,
      globalDefaults
    );
    await onCommitRecords([finalRecord]);
    setSubmitFeedback(
      `Added Row #${nextRowIndex}: ${finalRecord.mobileNo || finalRecord.serialId}`
    );
    setSmartText('');
    setSmartPreview(null);
  };

  const handleParseBulk = async () => {
    setFormError(null);
    setSubmitFeedback(null);
    setShowOnlyReview(false);
    const parseDefaults = {
      date,
      category: globalDefaults.defaultCategory,
      subcategory: globalDefaults.defaultSubcategory,
      escalations: globalDefaults.defaultEscalations,
      channels: globalDefaults.defaultChannels,
      alwaysApplyCategorySubcategory: globalDefaults.alwaysApplyCategorySubcategory,
    };
    const parsed = parseBulkNaturalText(
      bulkText,
      parseDefaults,
      existingRecords,
      shortcutRules
    );
    if (parsed.length === 0) {
      setFormError(
        'No valid lines found. Paste unstructured bulk lines, comma/tab rows, or key-value blocks.'
      );
      return;
    }
    setBulkQueue(parsed);

    if (loadLocalAiConfig().enabled && parsed.some((d) => d.needsStatusClarification)) {
      setIsAnalyzing(true);
      try {
        const enhanced = await enhanceDraftsWithOllamaIfEnabled(parsed, parseDefaults);
        setBulkQueue(enhanced);
      } finally {
        setIsAnalyzing(false);
      }
    }
  };

  const handleClearBulkInput = () => {
    setBulkText('');
    setBulkQueue([]);
    setShowOnlyReview(false);
    setFormError(null);
    setSubmitFeedback(null);
  };

  const updateBulkDraft = (id: string, patch: Partial<ParsedDraftRecord>) => {
    setBulkQueue((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const merged = { ...item, ...patch };
        const mobileNorm = normalizeMobileAsText(merged.mobileNo);
        const serialNorm = normalizeSerialId(merged.serialId);

        const mapping = mapRemarkToStatusAndColumn9(
          merged.rawRemark,
          patch.mappedStatus !== undefined ? patch.mappedStatus : merged.mappedStatus,
          shortcutRules,
          {
            explicitRemark:
              patch.mappedRemark !== undefined
                ? patch.mappedRemark
                : merged.mappedRemark || undefined,
            explicitCategory: merged.category,
            explicitSubcategory: merged.subcategory,
            defaultCategory: globalDefaults.defaultCategory,
            defaultSubcategory: globalDefaults.defaultSubcategory,
            alwaysApplyCategorySubcategory: globalDefaults.alwaysApplyCategorySubcategory,
          }
        );

        const hasValidMob = isValidMobileText(mobileNorm);
        const hasSid = serialNorm !== DEFAULT_RECORD_VALUES.missingSerialId;
        const malformedMob = mobileNorm.length > 0 && !hasValidMob;
        const needsIdentifier = malformedMob || (!hasValidMob && !hasSid);

        const dups = checkDuplicates(serialNorm, mobileNorm, existingRecords);

        return {
          ...merged,
          mobileNo: mobileNorm,
          serialId: serialNorm,
          category: normalizeCategory(merged.category),
          subcategory: normalizeSubcategory(merged.subcategory),
          escalations: merged.escalations?.trim() || globalDefaults.defaultEscalations,
          channels: merged.channels?.trim() || globalDefaults.defaultChannels,
          mappedStatus: mapping.status,
          mappedRemark: mapping.remark,
          needsStatusClarification: mapping.needsClarification,
          needsMobileClarification: needsIdentifier,
          confidenceScore: mapping.confidenceScore,
          analysisLayer:
            patch.mappedRemark || patch.mappedStatus ? 'manual' : mapping.analysisLayer,
          aiSuggestions: mapping.aiSuggestions,
          isDuplicateMobile: dups.isDuplicateMobile,
          isDuplicateSerial: dups.isDuplicateSerial,
        };
      })
    );
  };

  const handleSkipAllDuplicates = () => {
    setBulkQueue((prev) =>
      prev.map((item) =>
        item.isDuplicateMobile || item.isDuplicateSerial || item.isDuplicateBatch
          ? { ...item, skipped: true }
          : item
      )
    );
  };

  const handleKeepAllDuplicates = () => {
    setBulkQueue((prev) => prev.map((item) => ({ ...item, skipped: false })));
  };

  const handleSaveRowAsShortcut = (item: ParsedDraftRecord) => {
    if (!onAddShortcutRule || !item.rawRemark.trim() || !item.mappedStatus || !item.mappedRemark) {
      return;
    }
    onAddShortcutRule({
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      trigger: item.rawRemark.trim(),
      matchType: 'contains',
      status: item.mappedStatus,
      category: item.category,
      subcategory: item.subcategory,
      remark: item.mappedRemark,
      enabled: true,
      isCustom: true,
    });
    setSavedShortcutIds((prev) => ({ ...prev, [item.id]: true }));
  };

  const activeQueue = bulkQueue.filter((item) => !item.skipped);

  const handleCommitBulk = async () => {
    setFormError(null);
    if (activeQueue.length === 0) {
      setFormError('No active rows left to append (all rows are skipped or removed).');
      return;
    }

    const invalidItem = activeQueue.find(
      (item) =>
        item.needsMobileClarification ||
        item.needsStatusClarification ||
        !item.mappedStatus ||
        !item.mappedRemark ||
        !isValidDateInput(item.date)
    );
    if (invalidItem) {
      setFormError(
        'Resolve all highlighted review rows (missing identifiers or unmapped remarks) or mark them Skip before appending.'
      );
      return;
    }

    const todayKey = formatTodayDDMMYYYY();
    const startRowIndex = metadata.headerRowIndex + existingRecords.length + 1;
    const recordsToAppend = activeQueue.map((draft, idx) =>
      buildFinalCallRecord(
        draft,
        startRowIndex + idx,
        todayKey,
        employeeName,
        undefined,
        globalDefaults
      )
    );

    await onCommitRecords(recordsToAppend);
    setSubmitFeedback(
      `Appended ${recordsToAppend.length} records to ${employeeName}'s sheet (Names: ${employeeName}).`
    );
    setBulkQueue([]);
    setBulkText('');
  };

  return (
    <div className="space-y-5">
      {/* Entry Mode Segmented Control */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Add Customer Records ({employeeName})
          </h1>
          <p className="text-xs text-slate-500">
            Strictly maps to exact 3 Categories, 6 Subcategories, and 45 Master Remarks. Missing Serial IDs become NA; Names = {employeeName}.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 sm:grid-cols-4 sm:w-auto">
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
          <button
            type="button"
            onClick={() => {
              setEntryMode('import');
              setFormError(null);
            }}
            className={`min-h-[40px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              entryMode === 'import'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            File Import
          </button>
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
        </div>
      </div>

      <GlobalEntryDefaultsCard
        variant="compact"
        defaults={globalDefaults}
        onSaveDefaults={onSaveGlobalDefaults}
      />

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
                Regd Mobile No (or blank if Serial ID entered)
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
                Category (Exact 3)
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CategoryOption)}
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/20"
              >
                {PERMITTED_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Subcategory (Exact 6)
              </label>
              <select
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value as SubcategoryOption)}
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/20"
              >
                {PERMITTED_SUBCATEGORIES.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Call Remark / Shortcut <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={rawRemark}
                onChange={(e) => {
                  const val = e.target.value;
                  setRawRemark(val);
                  setManualClarifiedStatus(null);
                  setManualRemarkOverride('');
                  const auto = mapRemarkToStatusAndColumn9(val, null, shortcutRules, {
                    defaultCategory: globalDefaults.defaultCategory,
                    defaultSubcategory: globalDefaults.defaultSubcategory,
                    alwaysApplyCategorySubcategory: globalDefaults.alwaysApplyCategorySubcategory,
                  });
                  if (!auto.needsClarification) {
                    setCategory(auto.category);
                    setSubcategory(auto.subcategory);
                  }
                }}
                placeholder="busy, repayment, pay link, rejected..."
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Escalations
              </label>
              <select
                value={
                  DEFAULT_ESCALATION_OPTIONS.includes(
                    escalations as (typeof DEFAULT_ESCALATION_OPTIONS)[number]
                  )
                    ? escalations
                    : '__custom__'
                }
                onChange={(e) => {
                  const val = e.target.value;
                  setEscalations(val === '__custom__' ? '' : val);
                }}
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/20"
              >
                {DEFAULT_ESCALATION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
                <option value="__custom__">Custom...</option>
              </select>
              {!DEFAULT_ESCALATION_OPTIONS.includes(
                escalations as (typeof DEFAULT_ESCALATION_OPTIONS)[number]
              ) && (
                <input
                  type="text"
                  value={escalations}
                  onChange={(e) => setEscalations(e.target.value)}
                  placeholder="Enter Escalations"
                  className="mt-1.5 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-[#107C41] focus:outline-none"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Channels
              </label>
              <select
                value={
                  DEFAULT_CHANNEL_OPTIONS.includes(
                    channels as (typeof DEFAULT_CHANNEL_OPTIONS)[number]
                  )
                    ? channels
                    : '__custom__'
                }
                onChange={(e) => {
                  const val = e.target.value;
                  setChannels(val === '__custom__' ? '' : val);
                }}
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/20"
              >
                {DEFAULT_CHANNEL_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
                <option value="__custom__">Custom...</option>
              </select>
              {!DEFAULT_CHANNEL_OPTIONS.includes(
                channels as (typeof DEFAULT_CHANNEL_OPTIONS)[number]
              ) && (
                <input
                  type="text"
                  value={channels}
                  onChange={(e) => setChannels(e.target.value)}
                  placeholder="Enter Channels"
                  className="mt-1.5 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-[#107C41] focus:outline-none"
                />
              )}
            </div>

            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-xs font-semibold text-slate-700">
                Exact Master Dropdown Remark (Col 9)
              </label>
              <select
                value={manualRemarkOverride || singleMapping.remark}
                onChange={(e) => {
                  const chosen = e.target.value as RemarkOption | '';
                  setManualRemarkOverride(chosen);
                  if (chosen) {
                    const auto = mapRemarkToStatusAndColumn9(chosen, null, shortcutRules, {
                      defaultCategory: globalDefaults.defaultCategory,
                      defaultSubcategory: globalDefaults.defaultSubcategory,
                      alwaysApplyCategorySubcategory: globalDefaults.alwaysApplyCategorySubcategory,
                    });
                    setCategory(auto.category);
                    setSubcategory(auto.subcategory);
                    setManualClarifiedStatus(auto.status);
                  }
                }}
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/20"
              >
                <option value="">-- Auto-detect or choose exact Remark --</option>
                {PERMITTED_REMARKS.map((rem) => (
                  <option key={rem} value={rem}>
                    {rem}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Outcome Presets */}
          <div className="space-y-2.5 border-t border-slate-200 pt-4">
            <div className="text-xs font-semibold text-slate-600">
              Quick Unresolved Shortcuts (Unresolved → CX NOT RESPONSE THE CALL)
            </div>
            <div className="flex flex-wrap gap-2">
              {UNRESOLVED_REMARK_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setRawRemark(preset);
                    setManualClarifiedStatus(null);
                    setManualRemarkOverride('');
                    setCategory(globalDefaults.defaultCategory);
                    setSubcategory(globalDefaults.defaultSubcategory);
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
              Quick Resolved Presets (Exact Master Remark)
            </div>
            <div className="flex flex-wrap gap-2">
              {RESOLVED_REMARK_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setRawRemark(preset);
                    setManualClarifiedStatus('Resolved');
                    setManualRemarkOverride(preset);
                    const auto = mapRemarkToStatusAndColumn9(preset, 'Resolved', shortcutRules, {
                      defaultCategory: globalDefaults.defaultCategory,
                      defaultSubcategory: globalDefaults.defaultSubcategory,
                      alwaysApplyCategorySubcategory: globalDefaults.alwaysApplyCategorySubcategory,
                    });
                    setCategory(auto.category);
                    setSubcategory(auto.subcategory);
                  }}
                  className={`min-h-[38px] rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    (manualRemarkOverride || singleMapping.remark) === preset
                      ? 'border-[#107C41] bg-[#DCFCE7] text-[#166534]'
                      : 'border-slate-200 bg-[#F8FAFC] text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {(singleDuplicates.isDuplicateMobile || singleDuplicates.isDuplicateSerial) && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                <span className="font-semibold">Duplicate detected: </span>
                {singleDuplicates.isDuplicateMobile && 'Mobile number '}
                {singleDuplicates.isDuplicateMobile && singleDuplicates.isDuplicateSerial && 'and '}
                {singleDuplicates.isDuplicateSerial && 'Serial ID '}
                already exists in {employeeName}&apos;s sheet.
              </div>
            </div>
          )}

          {rawRemark.trim().length > 0 && singleMapping.needsClarification && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3.5 space-y-2.5">
              <p className="text-xs font-semibold text-amber-950">
                "{rawRemark}" did not match a shortcut rule automatically. Pick an exact Master Remark above or mark Unresolved:
              </p>
              <button
                type="button"
                onClick={() => {
                  setManualClarifiedStatus('Unresolved');
                  setManualRemarkOverride('CX NOT RESPONSE THE CALL');
                }}
                className="min-h-[40px] rounded-lg border border-amber-400 bg-white px-3.5 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
              >
                Mark Unresolved (CX NOT RESPONSE THE CALL)
              </button>
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
                {normalizeMobileAsText(mobileNo) || '(Blank)'}
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
                {category}
              </div>
              <div>
                <span className="font-sans text-slate-500">Subcategory: </span>
                {subcategory}
              </div>
              <div>
                <span className="font-sans text-slate-500">Escalations: </span>
                {escalations || globalDefaults.defaultEscalations}
              </div>
              <div>
                <span className="font-sans text-slate-500">Channels: </span>
                {channels || globalDefaults.defaultChannels}
              </div>
              <div>
                <span className="font-sans text-slate-500">Names: </span>
                {employeeName}
              </div>
            </div>
            <div className="mt-2 border-t border-slate-200 pt-2 text-[11px] text-slate-700">
              <span className="font-semibold text-slate-500">
                Col 9 (&quot;Serial id&quot; / Master Remark):{' '}
              </span>
              <span className="font-mono font-medium">
                {singleMapping.remark || '— (Select exact option)'}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-slate-500">
              Mobile number is stored strictly as text (@). Names = {employeeName}.
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
              Paste Natural Text Record (Any Order or Missing Field)
            </label>
            <p className="mt-0.5 text-xs text-slate-500">
              Supports <span className="font-mono">9876543210 busy</span>,{' '}
              <span className="font-mono">92801385 rejected</span>,{' '}
              <span className="font-mono">9876543210 92801385 busy</span>, or{' '}
              <span className="font-mono">S ID: 92801385 / Mobile: 9752255732 / Remark: Pay link</span>
            </p>
            <textarea
              rows={4}
              value={smartText}
              onChange={(e) => setSmartText(e.target.value)}
              placeholder={'92801385 resolved payment link sent'}
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
                Editable Parsed Preview (Strict Dropdowns)
              </div>

              {(smartPreview.isDuplicateMobile || smartPreview.isDuplicateSerial) && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Duplicate detected against existing sheet records.
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
                    onChange={(e) => {
                      const nextSid = normalizeSerialId(e.target.value);
                      const hasValid = isValidMobileText(smartPreview.mobileNo) || nextSid !== 'NA';
                      setSmartPreview({
                        ...smartPreview,
                        serialId: nextSid,
                        needsMobileClarification: !hasValid,
                      });
                    }}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Regd Mobile No {smartPreview.needsMobileClarification && '(Needs Mobile/SID)'}
                  </label>
                  <input
                    type="tel"
                    value={smartPreview.mobileNo}
                    onChange={(e) => {
                      const mob = normalizeMobileAsText(e.target.value);
                      const hasValid =
                        isValidMobileText(mob) ||
                        (mob === '' && normalizeSerialId(smartPreview.serialId) !== 'NA');
                      setSmartPreview({
                        ...smartPreview,
                        mobileNo: mob,
                        needsMobileClarification: !hasValid,
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
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Category
                  </label>
                  <select
                    value={smartPreview.category}
                    onChange={(e) =>
                      setSmartPreview({
                        ...smartPreview,
                        category: e.target.value as CategoryOption,
                      })
                    }
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                  >
                    {PERMITTED_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Subcategory
                  </label>
                  <select
                    value={smartPreview.subcategory}
                    onChange={(e) =>
                      setSmartPreview({
                        ...smartPreview,
                        subcategory: e.target.value as SubcategoryOption,
                      })
                    }
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                  >
                    {PERMITTED_SUBCATEGORIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Exact Master Remark
                  </label>
                  <select
                    value={smartPreview.mappedRemark}
                    onChange={(e) => {
                      const rem = e.target.value as RemarkOption | '';
                      const m = mapRemarkToStatusAndColumn9(
                        smartPreview.rawRemark,
                        smartPreview.mappedStatus,
                        shortcutRules,
                        {
                          explicitRemark: rem || undefined,
                          explicitCategory: smartPreview.category,
                          explicitSubcategory: smartPreview.subcategory,
                          defaultCategory: globalDefaults.defaultCategory,
                          defaultSubcategory: globalDefaults.defaultSubcategory,
                          alwaysApplyCategorySubcategory: globalDefaults.alwaysApplyCategorySubcategory,
                        }
                      );
                      setSmartPreview({
                        ...smartPreview,
                        mappedStatus: m.status,
                        mappedRemark: m.remark,
                        needsStatusClarification: m.needsClarification,
                      });
                    }}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                  >
                    <option value="">-- Select exact Remark --</option>
                    {PERMITTED_REMARKS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
                <div className="text-xs">
                  <span className="font-semibold text-slate-600">Mapped Output: </span>
                  <span className="font-mono font-semibold text-slate-900">
                    {smartPreview.mappedStatus ?? 'Clarify Status'} →{' '}
                    {smartPreview.mappedRemark || 'Select Remark'} ·{' '}
                    {smartPreview.escalations || globalDefaults.defaultEscalations} ·{' '}
                    {smartPreview.channels || globalDefaults.defaultChannels} · Names: {employeeName}
                  </span>
                </div>

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

      {/* MODE 3: BULK PASTE WITH PROCESSING RESULTS & EDITABLE PREVIEW */}
      {entryMode === 'bulk' && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Bulk Customer Records (Cases A–G: Phone + Remark, Serial ID + Remark, Any Order, Context Sentences, Timestamps)
            </label>
            <textarea
              rows={6}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={
                '9876543210 busy\n92801385 rejected\n9876543210 92801385 busy\n92801386 resolved payment link sent\n8101446596 repayment link'
              }
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/20"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={isAnalyzing}
              onClick={() => void handleParseBulk()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
            >
              <Sparkles className="h-4 w-4 text-[#DCFCE7]" />
              <span>
                {isAnalyzing ? 'Analysing with AI...' : 'Analyse & Process with AI'}
              </span>
            </button>
            {(bulkText.trim().length > 0 || bulkQueue.length > 0) && (
              <button
                type="button"
                onClick={handleClearBulkInput}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear Input</span>
              </button>
            )}
            {bulkQueue.length > 0 && (
              <span className="text-xs font-medium text-slate-600 tabular-nums">
                {activeQueue.length} of {bulkQueue.length} rows active for append
              </span>
            )}
          </div>

          {/* Screen 4: Processing Results Summary Metrics */}
          {bulkQueue.length > 0 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-700">
                    AI Processing Results Summary ({employeeName})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {processingSummary.reviewRequiredCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowOnlyReview((v) => !v)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
                          showOnlyReview
                            ? 'border-red-400 bg-red-50 text-red-900'
                            : 'border-amber-300 bg-white text-amber-900 hover:bg-amber-50'
                        }`}
                      >
                        <Filter className="h-3 w-3" />
                        <span>
                          {showOnlyReview
                            ? 'Show All Rows'
                            : `Review Exceptions (${processingSummary.reviewRequiredCount})`}
                        </span>
                      </button>
                    )}
                    {processingSummary.duplicateCount > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={handleSkipAllDuplicates}
                          className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 whitespace-nowrap"
                        >
                          Skip All Duplicates
                        </button>
                        <button
                          type="button"
                          onClick={handleKeepAllDuplicates}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          Keep Repeat Calls
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs sm:grid-cols-3 lg:grid-cols-9">
                  <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="text-[11px] text-slate-500">Detected</div>
                    <div className="font-mono text-base font-bold text-slate-900 tabular-nums">
                      {processingSummary.totalDetected}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="text-[11px] text-slate-500">Ready</div>
                    <div className="font-mono text-base font-bold text-[#166534] tabular-nums">
                      {processingSummary.successfullyIdentified}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="text-[11px] text-slate-500">Phones</div>
                    <div className="font-mono text-base font-bold text-slate-900 tabular-nums">
                      {processingSummary.phonesDetected}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="text-[11px] text-slate-500">Serial IDs</div>
                    <div className="font-mono text-base font-bold text-slate-900 tabular-nums">
                      {processingSummary.serialIdsDetected}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="text-[11px] text-slate-500">NA Assigned</div>
                    <div className="font-mono text-base font-bold text-slate-700 tabular-nums">
                      {processingSummary.assignedNaCount}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="text-[11px] text-slate-500">Status &amp; Rem</div>
                    <div className="font-mono text-base font-bold text-[#107C41] tabular-nums">
                      {processingSummary.dropdownsMappedCount}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="text-[11px] text-slate-500">Cat &amp; Subcat</div>
                    <div className="font-mono text-base font-bold text-[#107C41] tabular-nums">
                      {processingSummary.totalDetected}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="text-[11px] text-slate-500">Duplicates</div>
                    <div className="font-mono text-base font-bold text-[#B45309] tabular-nums">
                      {processingSummary.duplicateCount}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="text-[11px] text-slate-500">Needs Review</div>
                    <div
                      className={`font-mono text-base font-bold tabular-nums ${
                        processingSummary.reviewRequiredCount > 0
                          ? 'text-red-700'
                          : 'text-slate-900'
                      }`}
                    >
                      {processingSummary.reviewRequiredCount}
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-[#F1F5F9] border-b border-slate-200 text-slate-700">
                      <th className="px-2.5 py-2 font-mono">#</th>
                      <th className="px-2.5 py-2">Skip</th>
                      <th className="px-2.5 py-2">Date</th>
                      <th className="px-2.5 py-2">Serial id</th>
                      <th className="px-2.5 py-2">Regd Mobile No</th>
                      <th className="px-2.5 py-2">Category</th>
                      <th className="px-2.5 py-2">Subcategory</th>
                      <th className="px-2.5 py-2">Status</th>
                      <th className="px-2.5 py-2">Col 9 Master Remark (45)</th>
                      <th className="px-2.5 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {bulkQueue
                      .map((item, idx) => ({ item, idx }))
                      .filter(({ item }) =>
                        showOnlyReview
                          ? !item.skipped &&
                            (item.needsMobileClarification || item.needsStatusClarification)
                          : true
                      )
                      .map(({ item, idx }) => {
                        const needsReview =
                          item.needsMobileClarification || item.needsStatusClarification;
                        return (
                        <tr
                          key={item.id}
                          className={
                            item.skipped
                              ? 'bg-slate-100 opacity-50'
                              : needsReview
                                ? 'bg-amber-50/70'
                                : 'bg-white'
                          }
                        >
                          <td className="px-2.5 py-2 font-mono text-slate-500 tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="px-2.5 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={Boolean(item.skipped)}
                              onChange={(e) =>
                                updateBulkDraft(item.id, { skipped: e.target.checked })
                              }
                              aria-label={`Skip row ${idx + 1}`}
                              className="h-4 w-4 accent-slate-700"
                            />
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
                            {item.sequenceRef && (
                              <div className="mt-0.5 text-[10px] text-slate-500">
                                Ref: {item.sequenceRef}
                              </div>
                            )}
                          </td>
                          <td className="px-2.5 py-2">
                            <input
                              type="tel"
                              value={item.mobileNo}
                              onChange={(e) =>
                                updateBulkDraft(item.id, { mobileNo: e.target.value })
                              }
                              placeholder={item.serialId !== 'NA' ? 'Blank OK' : 'Missing!'}
                              className={`w-28 rounded border px-2 py-1 font-mono text-xs ${
                                item.needsMobileClarification
                                  ? 'border-red-400 bg-red-50'
                                  : 'border-slate-300'
                              }`}
                            />
                            {(item.isDuplicateMobile || item.isDuplicateSerial || item.isDuplicateBatch) && (
                              <div className="mt-0.5 text-[10px] font-semibold text-[#B45309]">
                                Duplicate
                              </div>
                            )}
                          </td>
                          <td className="px-2.5 py-2">
                            <select
                              value={item.category}
                              onChange={(e) =>
                                updateBulkDraft(item.id, {
                                  category: e.target.value as CategoryOption,
                                })
                              }
                              className="w-28 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                            >
                              {PERMITTED_CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2.5 py-2">
                            <select
                              value={item.subcategory}
                              onChange={(e) =>
                                updateBulkDraft(item.id, {
                                  subcategory: e.target.value as SubcategoryOption,
                                })
                              }
                              className="w-44 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                            >
                              {PERMITTED_SUBCATEGORIES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2.5 py-2">
                            <select
                              value={item.mappedStatus ?? ''}
                              onChange={(e) => {
                                const nextStat = (e.target.value || null) as CallStatus | null;
                                updateBulkDraft(item.id, {
                                  mappedStatus: nextStat,
                                  mappedRemark:
                                    nextStat === 'Unresolved' && !item.mappedRemark
                                      ? 'CX NOT RESPONSE THE CALL'
                                      : item.mappedRemark,
                                });
                              }}
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
                          <td className="px-2.5 py-2 min-w-[230px]">
                            <select
                              value={item.mappedRemark}
                              onChange={(e) => {
                                const nextRem = e.target.value as RemarkOption | '';
                                updateBulkDraft(item.id, {
                                  mappedRemark: nextRem,
                                  mappedStatus:
                                    item.mappedStatus ??
                                    (nextRem === 'CX NOT RESPONSE THE CALL'
                                      ? 'Unresolved'
                                      : nextRem
                                        ? 'Resolved'
                                        : null),
                                });
                              }}
                              className={`w-full rounded border px-2 py-1 text-xs ${
                                !item.mappedRemark
                                  ? 'border-amber-500 bg-amber-50 text-amber-900'
                                  : 'border-slate-300 bg-white text-slate-900'
                              }`}
                            >
                              <option value="">-- Select exact Remark --</option>
                              {PERMITTED_REMARKS.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                            {item.rawRemark && (
                              <div
                                className="mt-0.5 truncate text-[10px] text-slate-500 max-w-[260px]"
                                title={item.rawRemark}
                              >
                                Input: {item.rawRemark}
                                {item.analysisLayer && item.confidenceScore !== undefined
                                  ? ` · ${
                                      item.analysisLayer === 'shortcut'
                                        ? 'Shortcut'
                                        : item.analysisLayer === 'semantic-nlp'
                                          ? 'On-Device AI'
                                          : item.analysisLayer === 'ollama-local'
                                            ? 'Ollama AI'
                                            : 'Manual'
                                    } (${item.confidenceScore}%)`
                                  : ''}
                                {item.clarificationReason ? ` · ${item.clarificationReason}` : ''}
                              </div>
                            )}
                            {item.needsStatusClarification &&
                              item.aiSuggestions &&
                              item.aiSuggestions.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {item.aiSuggestions.slice(0, 2).map((sug) => (
                                    <button
                                      key={sug.remark}
                                      type="button"
                                      onClick={() =>
                                        updateBulkDraft(item.id, {
                                          mappedStatus: sug.status,
                                          category: globalDefaults.alwaysApplyCategorySubcategory
                                            ? globalDefaults.defaultCategory
                                            : sug.category,
                                          subcategory: globalDefaults.alwaysApplyCategorySubcategory
                                            ? globalDefaults.defaultSubcategory
                                            : sug.subcategory,
                                          mappedRemark: sug.remark,
                                        })
                                      }
                                      className="rounded border border-[#107C41]/40 bg-[#DCFCE7]/60 px-1.5 py-0.5 text-[10px] font-semibold text-[#166534] hover:bg-[#DCFCE7] text-left"
                                    >
                                      {sug.remark} ({sug.score}%)
                                    </button>
                                  ))}
                                </div>
                              )}
                          </td>
                          <td className="px-2.5 py-2 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              {onAddShortcutRule &&
                                item.rawRemark &&
                                item.mappedStatus &&
                                item.mappedRemark &&
                                !item.matchedShortcutTrigger && (
                                  <button
                                    type="button"
                                    onClick={() => handleSaveRowAsShortcut(item)}
                                    title="Save phrase as Shortcut Rule"
                                    className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold ${
                                      savedShortcutIds[item.id]
                                        ? 'border-[#107C41]/30 bg-[#DCFCE7] text-[#166534]'
                                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    <BookmarkPlus className="h-3 w-3" />
                                    <span>
                                      {savedShortcutIds[item.id] ? 'Saved' : 'Shortcut'}
                                    </span>
                                  </button>
                                )}
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
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs text-slate-500">
                  All appended rows apply Global Defaults ({globalDefaults.defaultEscalations} / {globalDefaults.defaultChannels}) and populate Names = {employeeName}.
                </span>
                <button
                  type="button"
                  onClick={() => void handleCommitBulk()}
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#107C41] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0B5E31] whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" />
                  <span>Append to Master ({activeQueue.length})</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODE 4: FILE IMPORT (.xlsx / .csv) */}
      {entryMode === 'import' && (
        <CallsheetFileImportPanel
          title="Import Sheet from PC or Phone (.xlsx / .csv)"
          subtitle={`Choose an Excel or CSV file, review auto-mapped columns, apply ${employeeName}'s shortcuts & Global Defaults, and append rows directly into "${metadata.fileName}".`}
          employeeName={employeeName}
          metadata={metadata}
          existingRecords={existingRecords}
          shortcutRules={shortcutRules}
          globalDefaults={globalDefaults}
          onAppendRecords={async (finalRecords) => {
            await onCommitRecords(finalRecords);
            setSubmitFeedback(
              `Appended ${finalRecords.length} imported row${
                finalRecords.length === 1 ? '' : 's'
              } to ${employeeName}'s sheet.`
            );
          }}
        />
      )}
    </div>
  );
};
