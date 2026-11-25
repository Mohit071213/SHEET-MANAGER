import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Columns3,
  Download,
  FileSpreadsheet,
  FileUp,
  Layers,
  Pencil,
  Plus,
  PlusCircle,
  Sparkles,
  Table2,
  Upload,
} from 'lucide-react';
import { DEFAULT_BUILDER_OWNER_ID } from './config';
import { BUILT_IN_BUILDER_TEMPLATES } from './templates';
import {
  addBuilderRecordsBatch,
  createBuilderWorkbook,
  createUniqueBuilderId,
  deleteBuilderRule,
  deleteBuilderWorkbook,
  deleteCustomBuilderTemplate,
  deleteBuilderRecords,
  duplicateBuilderWorkbook,
  incrementRuleUsageCounts,
  listBuilderWorkbooks,
  listCustomBuilderTemplates,
  listWorkbookRecords,
  listWorkbookRules,
  replaceWorkbookRules,
  saveBuilderRule,
  saveCustomBuilderTemplate,
  updateBuilderRecord,
  updateBuilderWorkbook,
  upsertSyncedWorkbookBundle,
} from './storage';
import {
  deleteBuilderWorkbookFromCloud,
  pullBuilderWorkbooksFromCloud,
  pushBuilderTemplateToCloud,
  pushBuilderWorkbookToCloud,
} from './cloudSync';
import {
  BuilderExportFormat,
  exportWorkbookToCsvBlob,
  exportWorkbookToJsonBlob,
  exportWorkbookToXlsxBlob,
  triggerBuilderBlobDownload,
} from './excelIOEngine';
import {
  BuilderCellValue,
  BuilderColumn,
  BuilderRecord,
  BuilderShortcutRule,
  BuilderTemplate,
  BuilderViewSection,
  BuilderWorkbook,
} from './types';
import { WorkbookFormModal, WorkbookFormValues } from './components/WorkbookFormModal';
import { WorkbookHubView } from './components/WorkbookHubView';
import { TemplateLibraryView } from './components/TemplateLibraryView';
import { ColumnDesignerView } from './components/ColumnDesignerView';
import { SingleEntryFormView } from './components/SingleEntryFormView';
import { BulkEntryView } from './components/BulkEntryView';
import { DataGridView } from './components/DataGridView';
import { ShortcutRulesView } from './components/ShortcutRulesView';
import { ImportExportView } from './components/ImportExportView';
import {
  ExportRenameModal,
  ExportRenamePayload,
} from './components/ExportRenameModal';

interface UniversalExcelBuilderAppProps {
  user?: User | null;
  ownerId?: string;
  onExitBuilder: () => void;
}

const WORKBOOK_TABS: Array<{
  id: Extract<
    BuilderViewSection,
    'columns' | 'entry' | 'bulk' | 'preview' | 'rules' | 'import-export'
  >;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'columns', label: 'Columns', icon: Columns3 },
  { id: 'entry', label: 'Add Entry', icon: PlusCircle },
  { id: 'bulk', label: 'Bulk Entry', icon: Sparkles },
  { id: 'preview', label: 'Data Grid', icon: Table2 },
  { id: 'rules', label: 'Shortcut Rules', icon: BookOpen },
  { id: 'import-export', label: 'Import / Export', icon: FileUp },
];

export const UniversalExcelBuilderApp: React.FC<UniversalExcelBuilderAppProps> = ({
  user = null,
  ownerId,
  onExitBuilder,
}) => {
  const effectiveOwnerId = user?.uid || ownerId?.trim() || DEFAULT_BUILDER_OWNER_ID;

  const [workbooks, setWorkbooks] = useState<BuilderWorkbook[]>([]);
  const [customTemplates, setCustomTemplates] = useState<BuilderTemplate[]>([]);
  const [selectedWorkbook, setSelectedWorkbook] = useState<BuilderWorkbook | null>(null);
  const [workbookRecords, setWorkbookRecords] = useState<BuilderRecord[]>([]);
  const [workbookRules, setWorkbookRules] = useState<BuilderShortcutRule[]>([]);
  const [viewSection, setViewSection] = useState<BuilderViewSection>('workbooks');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [isQuickExporting, setIsQuickExporting] = useState(false);
  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    target: BuilderWorkbook | null;
  }>({ open: false, mode: 'create', target: null });
  const [exportModalState, setExportModalState] = useState<{
    open: boolean;
    workbook: BuilderWorkbook;
    records: BuilderRecord[];
    rules: BuilderShortcutRule[];
    initialFormat: BuilderExportFormat;
  } | null>(null);
  const [stagedImportFile, setStagedImportFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  }, []);

  const allTemplates = useMemo(
    () => [...customTemplates, ...BUILT_IN_BUILDER_TEMPLATES],
    [customTemplates]
  );

  const refreshWorkbooksAndTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const [wbList, customTpls] = await Promise.all([
        listBuilderWorkbooks({ includeArchived: true }),
        listCustomBuilderTemplates(),
      ]);
      setWorkbooks(wbList);
      setCustomTemplates(customTpls);
      setSelectedWorkbook((prev) =>
        prev ? wbList.find((item) => item.id === prev.id) ?? null : null
      );
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Failed to load Universal Excel Builder data.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  const loadActiveWorkbookDetails = useCallback(async (workbookId: string) => {
    const [recs, rls] = await Promise.all([
      listWorkbookRecords(workbookId),
      listWorkbookRules(workbookId),
    ]);
    setWorkbookRecords(recs);
    setWorkbookRules(rls);
  }, []);

  useEffect(() => {
    void refreshWorkbooksAndTemplates();
  }, [refreshWorkbooksAndTemplates]);

  useEffect(() => {
    if (!selectedWorkbook) {
      setWorkbookRecords([]);
      setWorkbookRules([]);
      return;
    }
    void loadActiveWorkbookDetails(selectedWorkbook.id);
  }, [selectedWorkbook?.id, loadActiveWorkbookDetails]);

  const openWorkbookWorkspace = async (
    wb: BuilderWorkbook,
    tab: BuilderViewSection = 'preview'
  ) => {
    setSelectedWorkbook(wb);
    setViewSection(wb.columns.length === 0 ? 'columns' : tab);
    await loadActiveWorkbookDetails(wb.id);
  };

  const handleSubmitModal = async (values: WorkbookFormValues) => {
    setIsSubmitting(true);
    try {
      if (modalState.mode === 'create') {
        const created = await createBuilderWorkbook({
          name: values.name,
          industry: values.industry,
          description: values.description,
          sheetName: values.sheetName,
          headerRowIndex: values.headerRowIndex,
          freezeHeader: values.freezeHeader,
          autoFilter: values.autoFilter,
          duplicateStrategy: values.duplicateStrategy,
          includeStarterColumns: values.importedColumns
            ? false
            : values.includeStarterColumns,
          columns: values.importedColumns,
          ownerId: effectiveOwnerId,
        });
        let finalWorkbook = created;
        if (values.importedRows && values.importedRows.length > 0) {
          const batchRes = await addBuilderRecordsBatch(
            created.id,
            values.importedRows.map((rowValues) => ({
              values: rowValues,
              source: 'import',
            })),
            effectiveOwnerId
          );
          finalWorkbook = batchRes.workbook;
        }
        await refreshWorkbooksAndTemplates();
        await openWorkbookWorkspace(
          finalWorkbook,
          values.importedColumns && values.importedColumns.length > 0
            ? 'preview'
            : 'columns'
        );
        setModalState({ open: false, mode: 'create', target: null });
        showToast(
          'success',
          values.importedColumns
            ? `Created ready sheet "${finalWorkbook.name}" (${finalWorkbook.columns.length} columns, ${finalWorkbook.rowCount} rows).`
            : `Created workbook "${finalWorkbook.name}".`
        );
      } else if (modalState.target) {
        const updated = await updateBuilderWorkbook(modalState.target.id, {
          name: values.name,
          industry: values.industry,
          description: values.description,
          sheetName: values.sheetName,
          headerRowIndex: values.headerRowIndex,
          freezeHeader: values.freezeHeader,
          autoFilter: values.autoFilter,
          duplicateStrategy: values.duplicateStrategy,
        });
        await refreshWorkbooksAndTemplates();
        if (selectedWorkbook?.id === updated.id) {
          setSelectedWorkbook(updated);
          await loadActiveWorkbookDetails(updated.id);
        }
        setModalState({ open: false, mode: 'create', target: null });
        showToast('success', `Saved settings for "${updated.name}".`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUseTemplate = async (
    tpl: BuilderTemplate,
    customName?: string
  ) => {
    const freshColumns: BuilderColumn[] = tpl.columns.map((c, idx) => ({
      ...c,
      id: createUniqueBuilderId('col'),
      order: idx,
      dropdownOptions: [...c.dropdownOptions],
    }));

    const created = await createBuilderWorkbook({
      name: customName?.trim() || tpl.name,
      industry: tpl.industry,
      description: tpl.description,
      sheetName: tpl.sheetName,
      columns: freshColumns,
      ownerId: effectiveOwnerId,
    });
    await refreshWorkbooksAndTemplates();
    await openWorkbookWorkspace(created, 'entry');
    showToast('success', `Created "${created.name}" from ${tpl.industry} template.`);
  };

  const handleSaveColumns = async (columns: BuilderColumn[]) => {
    if (!selectedWorkbook) return;
    const updated = await updateBuilderWorkbook(selectedWorkbook.id, { columns });
    setSelectedWorkbook(updated);
    await refreshWorkbooksAndTemplates();
    await loadActiveWorkbookDetails(updated.id);
    showToast('success', `Saved ${columns.length} column definitions.`);
  };

  const handleSaveAsTemplate = async (name: string, description: string) => {
    if (!selectedWorkbook) return;
    const saved = await saveCustomBuilderTemplate(
      selectedWorkbook,
      name,
      description
    );
    if (user) {
      try {
        await pushBuilderTemplateToCloud(user, saved);
      } catch {
        // non-blocking cloud backup
      }
    }
    await refreshWorkbooksAndTemplates();
    showToast('success', `Saved "${saved.name}" to Template Library.`);
  };

  const handleSaveSingleRecord = async (
    values: Record<string, BuilderCellValue>
  ) => {
    if (!selectedWorkbook) return { addedCount: 0, skippedDuplicates: 0 };
    const result = await addBuilderRecordsBatch(
      selectedWorkbook.id,
      [{ values, source: 'form' }],
      effectiveOwnerId
    );
    setSelectedWorkbook(result.workbook);
    await loadActiveWorkbookDetails(selectedWorkbook.id);
    await refreshWorkbooksAndTemplates();
    if (result.skippedDuplicates > 0) {
      showToast('error', 'Skipped duplicate record per workbook duplicate rule.');
    } else {
      showToast('success', `Saved entry to "${result.workbook.name}".`);
    }
    return {
      addedCount: result.addedRecords.length,
      skippedDuplicates: result.skippedDuplicates,
    };
  };

  const handleCommitBulkRows = async (
    rows: Array<Record<string, BuilderCellValue>>,
    matchedRuleIds: string[]
  ) => {
    if (!selectedWorkbook) return { addedCount: 0, skippedDuplicates: 0 };
    const result = await addBuilderRecordsBatch(
      selectedWorkbook.id,
      rows.map((values) => ({ values, source: 'bulk' })),
      effectiveOwnerId
    );
    if (matchedRuleIds.length > 0) {
      await incrementRuleUsageCounts(matchedRuleIds);
    }
    setSelectedWorkbook(result.workbook);
    await loadActiveWorkbookDetails(selectedWorkbook.id);
    await refreshWorkbooksAndTemplates();
    showToast(
      'success',
      `Added ${result.addedRecords.length} bulk row${
        result.addedRecords.length === 1 ? '' : 's'
      }${
        result.skippedDuplicates > 0
          ? ` (${result.skippedDuplicates} duplicates skipped)`
          : ''
      }.`
    );
    return {
      addedCount: result.addedRecords.length,
      skippedDuplicates: result.skippedDuplicates,
    };
  };

  const handleUpdateRecord = async (
    recordId: string,
    values: Record<string, BuilderCellValue>
  ) => {
    if (!selectedWorkbook) return;
    const updatedRows = await updateBuilderRecord(
      selectedWorkbook.id,
      recordId,
      values
    );
    setWorkbookRecords(updatedRows);
    showToast('success', 'Updated row.');
  };

  const handleDeleteRecords = async (recordIds: string[]) => {
    if (!selectedWorkbook) return;
    const res = await deleteBuilderRecords(selectedWorkbook.id, recordIds);
    setSelectedWorkbook(res.workbook);
    setWorkbookRecords(res.remainingRecords);
    await refreshWorkbooksAndTemplates();
    showToast(
      'success',
      `Deleted ${recordIds.length} row${recordIds.length === 1 ? '' : 's'}.`
    );
  };

  const handleSaveRule = async (
    rule: Omit<
      BuilderShortcutRule,
      'id' | 'createdAt' | 'updatedAt' | 'usageCount'
    > & { id?: string; usageCount?: number }
  ) => {
    if (!selectedWorkbook) return;
    await saveBuilderRule(rule);
    await loadActiveWorkbookDetails(selectedWorkbook.id);
    showToast('success', `Saved rule "${rule.name}".`);
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!selectedWorkbook) return;
    await deleteBuilderRule(ruleId);
    await loadActiveWorkbookDetails(selectedWorkbook.id);
    showToast('success', 'Deleted shortcut rule.');
  };

  const handleImportRulesJson = async (rules: BuilderShortcutRule[]) => {
    if (!selectedWorkbook) return;
    await replaceWorkbookRules(selectedWorkbook.id, rules);
    await loadActiveWorkbookDetails(selectedWorkbook.id);
    showToast('success', `Imported ${rules.length} shortcut rule(s).`);
  };

  const handleCreateWorkbookFromImport = async (input: {
    name: string;
    industry: BuilderWorkbook['industry'];
    sheetName: string;
    headerRowIndex: number;
    columns: BuilderColumn[];
    rows: Array<Record<string, BuilderCellValue>>;
  }) => {
    const created = await createBuilderWorkbook({
      name: input.name,
      industry: input.industry,
      sheetName: input.sheetName,
      headerRowIndex: input.headerRowIndex,
      columns: input.columns,
      ownerId: effectiveOwnerId,
    });
    let finalWb = created;
    if (input.rows.length > 0) {
      const batchRes = await addBuilderRecordsBatch(
        created.id,
        input.rows.map((values) => ({ values, source: 'import' })),
        effectiveOwnerId
      );
      finalWb = batchRes.workbook;
    }
    await refreshWorkbooksAndTemplates();
    await openWorkbookWorkspace(finalWb, 'preview');
    showToast(
      'success',
      `Imported "${finalWb.name}" (${finalWb.columns.length} columns, ${finalWb.rowCount} rows).`
    );
  };

  const handleAppendImportedRows = async (
    rows: Array<Record<string, BuilderCellValue>>,
    newColumnsToAdd?: BuilderColumn[]
  ) => {
    if (!selectedWorkbook) return;
    if (newColumnsToAdd && newColumnsToAdd.length > 0) {
      const mergedColumns = [...selectedWorkbook.columns, ...newColumnsToAdd].map(
        (col, idx) => ({ ...col, order: idx })
      );
      await updateBuilderWorkbook(selectedWorkbook.id, {
        columns: mergedColumns,
      });
    }
    const res = await addBuilderRecordsBatch(
      selectedWorkbook.id,
      rows.map((values) => ({ values, source: 'import' })),
      effectiveOwnerId
    );
    setSelectedWorkbook(res.workbook);
    await loadActiveWorkbookDetails(selectedWorkbook.id);
    await refreshWorkbooksAndTemplates();
    setViewSection('preview');
    showToast(
      'success',
      `Imported ${res.addedRecords.length} row(s) into "${res.workbook.name}"${
        newColumnsToAdd && newColumnsToAdd.length > 0
          ? ` (added ${newColumnsToAdd.length} new column${
              newColumnsToAdd.length === 1 ? '' : 's'
            })`
          : ''
      }.`
    );
  };

  const handleOpenExportModal = async (
    targetWorkbook: BuilderWorkbook,
    initialFormat: BuilderExportFormat = 'xlsx',
    preloadedRecords?: BuilderRecord[],
    preloadedRules?: BuilderShortcutRule[]
  ) => {
    const [recs, rls] =
      preloadedRecords && preloadedRules
        ? [preloadedRecords, preloadedRules]
        : await Promise.all([
            listWorkbookRecords(targetWorkbook.id),
            listWorkbookRules(targetWorkbook.id),
          ]);
    setExportModalState({
      open: true,
      workbook: targetWorkbook,
      records: recs,
      rules: rls,
      initialFormat,
    });
  };

  const handleConfirmExportModal = async (payload: ExportRenamePayload) => {
    if (!exportModalState) return;
    setIsQuickExporting(true);
    try {
      let targetWb = exportModalState.workbook;
      if (payload.persistChangesToWorkbook) {
        const nextColumns =
          Object.keys(payload.headerOverrides).length > 0
            ? targetWb.columns.map((col) => ({
                ...col,
                label: payload.headerOverrides[col.id]?.trim() || col.label,
              }))
            : targetWb.columns;
        const updated = await updateBuilderWorkbook(targetWb.id, {
          name: payload.fileName,
          sheetName: payload.sheetName,
          columns: nextColumns,
        });
        targetWb = updated;
        await refreshWorkbooksAndTemplates();
        if (selectedWorkbook?.id === updated.id) {
          setSelectedWorkbook(updated);
          await loadActiveWorkbookDetails(updated.id);
        }
      }

      const exportOptions = {
        fileName: payload.fileName,
        sheetName: payload.sheetName,
        headerOverrides: payload.headerOverrides,
      };

      if (payload.format === 'xlsx') {
        const { blob, fileName } = await exportWorkbookToXlsxBlob(
          targetWb,
          exportModalState.records,
          exportOptions
        );
        triggerBuilderBlobDownload(blob, fileName);
        showToast('success', `Downloaded ${fileName}.`);
      } else if (payload.format === 'csv') {
        const { blob, fileName } = exportWorkbookToCsvBlob(
          targetWb,
          exportModalState.records,
          exportOptions
        );
        triggerBuilderBlobDownload(blob, fileName);
        showToast('success', `Downloaded ${fileName}.`);
      } else {
        const { blob, fileName } = exportWorkbookToJsonBlob(
          targetWb,
          exportModalState.records,
          exportModalState.rules,
          exportOptions
        );
        triggerBuilderBlobDownload(blob, fileName);
        showToast('success', `Downloaded ${fileName}.`);
      }
      setExportModalState(null);
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Failed to export workbook.'
      );
    } finally {
      setIsQuickExporting(false);
    }
  };

  const handlePushWorkbookCloud = async () => {
    if (!user || !selectedWorkbook) return;
    setIsSyncingCloud(true);
    try {
      const res = await pushBuilderWorkbookToCloud(
        user,
        selectedWorkbook,
        workbookRecords,
        workbookRules
      );
      const updated = await updateBuilderWorkbook(selectedWorkbook.id, {
        cloudVersion: res.cloudVersion,
        lastSyncedAt: res.syncedAt,
      });
      setSelectedWorkbook(updated);
      await refreshWorkbooksAndTemplates();
      showToast(
        'success',
        `Synced "${updated.name}" to cloud (v${res.cloudVersion}).`
      );
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Cloud sync failed.'
      );
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handlePullAllCloud = async () => {
    if (!user) return;
    setIsSyncingCloud(true);
    try {
      const bundles = await pullBuilderWorkbooksFromCloud(user);
      for (const bundle of bundles) {
        await upsertSyncedWorkbookBundle(
          bundle.workbook,
          bundle.records,
          bundle.rules
        );
      }
      await refreshWorkbooksAndTemplates();
      if (selectedWorkbook) {
        await loadActiveWorkbookDetails(selectedWorkbook.id);
      }
      showToast(
        'success',
        `Pulled ${bundles.length} workbook(s) from your cloud workspace.`
      );
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Failed to pull cloud workbooks.'
      );
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleDeleteWorkbook = async (workbookId: string) => {
    const targetName =
      workbooks.find((w) => w.id === workbookId)?.name ?? 'Workbook';
    await deleteBuilderWorkbook(workbookId);
    if (user) {
      try {
        await deleteBuilderWorkbookFromCloud(user, workbookId);
      } catch {
        // ignore if workbook was local-only
      }
    }
    if (selectedWorkbook?.id === workbookId) {
      setSelectedWorkbook(null);
      setViewSection('workbooks');
    }
    await refreshWorkbooksAndTemplates();
    showToast('success', `Deleted "${targetName}".`);
  };

  const isInsideWorkbook =
    Boolean(selectedWorkbook) &&
    !['workbooks', 'templates', 'standalone-import'].includes(viewSection);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col">
      {/* Top Bar (Single-Row 3-Zone Contract) */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-sm lg:px-8">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#107C41] text-white shrink-0">
            <FileSpreadsheet className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            Universal Excel Builder
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600">
          <button
            type="button"
            onClick={() => {
              setSelectedWorkbook(null);
              setViewSection('workbooks');
            }}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
              viewSection === 'workbooks'
                ? 'border-[#107C41] text-slate-900'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Workbooks
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedWorkbook(null);
              setViewSection('templates');
            }}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
              viewSection === 'templates'
                ? 'border-[#107C41] text-slate-900'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Templates
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedWorkbook(null);
              setViewSection('standalone-import');
            }}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
              viewSection === 'standalone-import'
                ? 'border-[#107C41] text-slate-900'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Import Spreadsheet
          </button>
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onExitBuilder}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-slate-600" />
            <span>Back to CallSheet</span>
          </button>

          {isInsideWorkbook && selectedWorkbook ? (
            <button
              type="button"
              disabled={isQuickExporting || selectedWorkbook.columns.length === 0}
              onClick={() =>
                void handleOpenExportModal(
                  selectedWorkbook,
                  'xlsx',
                  workbookRecords,
                  workbookRules
                )
              }
              className="hidden sm:inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#107C41] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0B5E31] whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{isQuickExporting ? 'Exporting...' : 'Export .xlsx'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                setModalState({ open: true, mode: 'create', target: null })
              }
              className="hidden sm:inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#107C41] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0B5E31] whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Workbook</span>
            </button>
          )}
        </div>
      </header>

      {/* Mobile Hub Switcher Bar when not inside a specific workbook */}
      {!isInsideWorkbook && (
        <div className="md:hidden border-b border-slate-200 bg-white px-4 py-2 flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setViewSection('workbooks')}
            className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold whitespace-nowrap ${
              viewSection === 'workbooks'
                ? 'bg-[#DCFCE7] text-[#166534]'
                : 'text-slate-600'
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Workbooks</span>
          </button>
          <button
            type="button"
            onClick={() => setViewSection('templates')}
            className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold whitespace-nowrap ${
              viewSection === 'templates'
                ? 'bg-[#DCFCE7] text-[#166534]'
                : 'text-slate-600'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Templates</span>
          </button>
          <button
            type="button"
            onClick={() => setViewSection('standalone-import')}
            className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold whitespace-nowrap ${
              viewSection === 'standalone-import'
                ? 'bg-[#DCFCE7] text-[#166534]'
                : 'text-slate-600'
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Import</span>
          </button>
        </div>
      )}

      {toast && (
        <div className="px-4 pt-4 lg:px-8 max-w-6xl w-full mx-auto">
          <div
            role="alert"
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold ${
              toast.type === 'success'
                ? 'border-[#107C41]/30 bg-[#DCFCE7]/60 text-[#166534]'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8 max-w-6xl w-full mx-auto space-y-6">
        {isInsideWorkbook && selectedWorkbook && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedWorkbook(null);
                      setViewSection('workbooks');
                    }}
                    className="font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Workbooks
                  </button>
                  <span>/</span>
                  <span className="truncate">{selectedWorkbook.name}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span className="font-semibold text-slate-900 text-base">
                    {selectedWorkbook.name}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedWorkbook.industry}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {selectedWorkbook.columns.length} cols
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {workbookRecords.length} rows
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {workbookRules.length} rules
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setModalState({
                    open: true,
                    mode: 'edit',
                    target: selectedWorkbook,
                  })
                }
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 self-start sm:self-auto whitespace-nowrap"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span>Workbook Settings</span>
              </button>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto bg-slate-50/70 px-3 py-2">
              {WORKBOOK_TABS.map((tab) => {
                const Icon = tab.icon;
                const active = viewSection === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setViewSection(tab.id)}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-white text-[#107C41] shadow-xs border border-slate-200'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {viewSection === 'templates' && (
          <TemplateLibraryView
            templates={allTemplates}
            onUseTemplate={handleUseTemplate}
            onDeleteCustomTemplate={async (tplId) => {
              await deleteCustomBuilderTemplate(tplId);
              await refreshWorkbooksAndTemplates();
              showToast('success', 'Deleted custom template.');
            }}
          />
        )}

        {viewSection === 'standalone-import' && (
          <ImportExportView
            activeWorkbook={null}
            records={[]}
            rules={[]}
            user={user}
            isSyncingCloud={isSyncingCloud}
            initialImportFile={stagedImportFile}
            onConsumedInitialImportFile={() => setStagedImportFile(null)}
            onCreateWorkbookFromImport={handleCreateWorkbookFromImport}
            onAppendImportedRows={handleAppendImportedRows}
            onPushWorkbookCloud={handlePushWorkbookCloud}
            onPullAllCloud={handlePullAllCloud}
            onRequestExport={() => {}}
          />
        )}

        {viewSection === 'workbooks' && (
          <WorkbookHubView
            workbooks={workbooks}
            isLoading={isLoading}
            onCreateNew={() =>
              setModalState({ open: true, mode: 'create', target: null })
            }
            onImportFile={(file) => {
              setSelectedWorkbook(null);
              setStagedImportFile(file);
              setViewSection('standalone-import');
            }}
            onOpenWorkbook={(wb) => void openWorkbookWorkspace(wb)}
            onExportWorkbook={(wb) => void handleOpenExportModal(wb, 'xlsx')}
            onEditWorkbook={(wb) =>
              setModalState({ open: true, mode: 'edit', target: wb })
            }
            onDuplicateWorkbook={async (wb, includeRecords) => {
              const copy = await duplicateBuilderWorkbook(wb.id, {
                includeRecords,
              });
              await refreshWorkbooksAndTemplates();
              showToast('success', `Created duplicate "${copy.name}".`);
            }}
            onToggleArchive={async (wb) => {
              const updated = await updateBuilderWorkbook(wb.id, {
                archived: !wb.archived,
              });
              await refreshWorkbooksAndTemplates();
              showToast(
                'success',
                updated.archived
                  ? `Archived "${updated.name}".`
                  : `Restored "${updated.name}".`
              );
            }}
            onDeleteWorkbook={handleDeleteWorkbook}
          />
        )}

        {selectedWorkbook && viewSection === 'columns' && (
          <ColumnDesignerView
            workbook={selectedWorkbook}
            onSaveColumns={handleSaveColumns}
            onSaveAsTemplate={handleSaveAsTemplate}
          />
        )}

        {selectedWorkbook && viewSection === 'entry' && (
          <SingleEntryFormView
            workbook={selectedWorkbook}
            existingRecords={workbookRecords}
            onSaveRecord={handleSaveSingleRecord}
            onGoToColumns={() => setViewSection('columns')}
          />
        )}

        {selectedWorkbook && viewSection === 'bulk' && (
          <BulkEntryView
            workbook={selectedWorkbook}
            existingRecords={workbookRecords}
            rules={workbookRules}
            onCommitBulkRows={handleCommitBulkRows}
            onGoToRules={() => setViewSection('rules')}
            onImportFile={(file) => {
              setStagedImportFile(file);
              setViewSection('import-export');
            }}
          />
        )}

        {selectedWorkbook && viewSection === 'preview' && (
          <DataGridView
            workbook={selectedWorkbook}
            records={workbookRecords}
            onUpdateRecord={handleUpdateRecord}
            onDeleteRecords={handleDeleteRecords}
            onQuickAddRow={async (values) => {
              await handleSaveSingleRecord(values);
            }}
            onGoToEntry={() => setViewSection('entry')}
          />
        )}

        {selectedWorkbook && viewSection === 'rules' && (
          <ShortcutRulesView
            workbook={selectedWorkbook}
            rules={workbookRules}
            onSaveRule={handleSaveRule}
            onDeleteRule={handleDeleteRule}
            onImportRulesJson={handleImportRulesJson}
          />
        )}

        {selectedWorkbook && viewSection === 'import-export' && (
          <ImportExportView
            activeWorkbook={selectedWorkbook}
            records={workbookRecords}
            rules={workbookRules}
            user={user}
            isSyncingCloud={isSyncingCloud}
            initialImportFile={stagedImportFile}
            onConsumedInitialImportFile={() => setStagedImportFile(null)}
            onCreateWorkbookFromImport={handleCreateWorkbookFromImport}
            onAppendImportedRows={handleAppendImportedRows}
            onPushWorkbookCloud={handlePushWorkbookCloud}
            onPullAllCloud={handlePullAllCloud}
            onRequestExport={(format) =>
              void handleOpenExportModal(
                selectedWorkbook,
                format,
                workbookRecords,
                workbookRules
              )
            }
          />
        )}
      </main>

      {modalState.open && (
        <WorkbookFormModal
          mode={modalState.mode}
          initialWorkbook={modalState.target}
          isSubmitting={isSubmitting}
          onClose={() => {
            if (!isSubmitting) {
              setModalState({ open: false, mode: 'create', target: null });
            }
          }}
          onSubmit={handleSubmitModal}
        />
      )}

      {exportModalState?.open && (
        <ExportRenameModal
          workbook={exportModalState.workbook}
          rowCount={exportModalState.records.length}
          initialFormat={exportModalState.initialFormat}
          isExporting={isQuickExporting}
          onClose={() => {
            if (!isQuickExporting) {
              setExportModalState(null);
            }
          }}
          onConfirmDownload={handleConfirmExportModal}
        />
      )}
    </div>
  );
};
