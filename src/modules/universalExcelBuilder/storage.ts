import { IDBPDatabase, openDB } from 'idb';
import {
  BUILDER_DB_NAME,
  BUILDER_DB_VERSION,
  BuilderIndustry,
  DEFAULT_BUILDER_OWNER_ID,
} from './config';
import {
  BuilderCellValue,
  BuilderColumn,
  BuilderDuplicateStrategy,
  BuilderRecord,
  BuilderShortcutRule,
  BuilderTemplate,
  BuilderWorkbook,
} from './types';
import { evaluateRecordValues, normalizeCellValue } from './validationEngine';

let builderDbPromise: Promise<IDBPDatabase> | null = null;

function getBuilderDb(): Promise<IDBPDatabase> {
  if (!builderDbPromise) {
    builderDbPromise = openDB(BUILDER_DB_NAME, BUILDER_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('workbooks')) {
          db.createObjectStore('workbooks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('records')) {
          const recordStore = db.createObjectStore('records', { keyPath: 'id' });
          recordStore.createIndex('by-workbook', 'workbookId', { unique: false });
        }
        if (!db.objectStoreNames.contains('templates')) {
          db.createObjectStore('templates', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('rules')) {
          const ruleStore = db.createObjectStore('rules', { keyPath: 'id' });
          ruleStore.createIndex('by-workbook', 'workbookId', { unique: false });
        }
      },
    });
  }
  return builderDbPromise;
}

export function createUniqueBuilderId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

export function sanitizeColumnKey(label: string, fallbackIndex: number): string {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || `col_${fallbackIndex + 1}`;
}

export function sanitizeSheetName(raw: string): string {
  const cleaned = raw.replace(/[\\/*?:[\]]/g, '').trim();
  return (cleaned || 'Records').slice(0, 31);
}

export function buildDefaultStarterColumns(): BuilderColumn[] {
  return [
    {
      id: createUniqueBuilderId('col'),
      key: 'entry_date',
      label: 'Date',
      order: 0,
      type: 'autoDate',
      required: true,
      unique: false,
      defaultMode: 'today',
      defaultValue: '',
      dropdownOptions: [],
      width: 14,
    },
    {
      id: createUniqueBuilderId('col'),
      key: 'reference_id',
      label: 'Reference ID',
      order: 1,
      type: 'text',
      required: false,
      unique: true,
      defaultMode: 'custom',
      defaultValue: 'NA',
      dropdownOptions: [],
      width: 18,
    },
    {
      id: createUniqueBuilderId('col'),
      key: 'title_or_name',
      label: 'Name / Title',
      order: 2,
      type: 'text',
      required: true,
      unique: false,
      defaultMode: 'none',
      defaultValue: '',
      dropdownOptions: [],
      width: 24,
    },
    {
      id: createUniqueBuilderId('col'),
      key: 'status',
      label: 'Status',
      order: 3,
      type: 'dropdown',
      required: true,
      unique: false,
      defaultMode: 'firstOption',
      defaultValue: 'Pending',
      dropdownOptions: ['Pending', 'In Progress', 'Completed'],
      width: 16,
    },
    {
      id: createUniqueBuilderId('col'),
      key: 'notes',
      label: 'Notes',
      order: 4,
      type: 'text',
      required: false,
      unique: false,
      defaultMode: 'none',
      defaultValue: '',
      dropdownOptions: [],
      width: 32,
    },
  ];
}

export interface CreateWorkbookInput {
  name: string;
  industry: BuilderIndustry;
  description?: string;
  sheetName?: string;
  headerRowIndex?: number;
  freezeHeader?: boolean;
  autoFilter?: boolean;
  duplicateStrategy?: BuilderDuplicateStrategy;
  includeStarterColumns?: boolean;
  columns?: BuilderColumn[];
  ownerId?: string;
}

export async function listBuilderWorkbooks(options?: {
  includeArchived?: boolean;
  ownerId?: string;
}): Promise<BuilderWorkbook[]> {
  const db = await getBuilderDb();
  const all = (await db.getAll('workbooks')) as BuilderWorkbook[];
  const filtered = all.filter((wb) => {
    if (!options?.includeArchived && wb.archived) return false;
    if (options?.ownerId && wb.ownerId !== options.ownerId) return false;
    return true;
  });
  return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getBuilderWorkbook(
  workbookId: string
): Promise<BuilderWorkbook | null> {
  const db = await getBuilderDb();
  const found = (await db.get('workbooks', workbookId)) as BuilderWorkbook | undefined;
  return found ?? null;
}

export async function createBuilderWorkbook(
  input: CreateWorkbookInput
): Promise<BuilderWorkbook> {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error('Workbook name cannot be empty.');
  }

  const nowIso = new Date().toISOString();
  const columns =
    input.columns && input.columns.length > 0
      ? input.columns.map((col, idx) => ({ ...col, order: idx }))
      : input.includeStarterColumns !== false
        ? buildDefaultStarterColumns()
        : [];

  const workbook: BuilderWorkbook = {
    id: createUniqueBuilderId('uwb'),
    ownerId: input.ownerId?.trim() || DEFAULT_BUILDER_OWNER_ID,
    name: trimmedName.slice(0, 120),
    industry: input.industry,
    description: (input.description ?? '').trim().slice(0, 300),
    sheetName: sanitizeSheetName(input.sheetName ?? 'Records'),
    headerRowIndex: Math.min(20, Math.max(1, input.headerRowIndex ?? 1)),
    freezeHeader: input.freezeHeader ?? true,
    autoFilter: input.autoFilter ?? true,
    duplicateStrategy: input.duplicateStrategy ?? 'flag',
    archived: false,
    columns,
    rowCount: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const db = await getBuilderDb();
  await db.put('workbooks', workbook);
  return workbook;
}

export async function updateBuilderWorkbook(
  workbookId: string,
  patch: Partial<
    Pick<
      BuilderWorkbook,
      | 'name'
      | 'industry'
      | 'description'
      | 'sheetName'
      | 'headerRowIndex'
      | 'freezeHeader'
      | 'autoFilter'
      | 'duplicateStrategy'
      | 'archived'
      | 'columns'
      | 'rowCount'
      | 'cloudVersion'
      | 'lastSyncedAt'
    >
  >
): Promise<BuilderWorkbook> {
  const db = await getBuilderDb();
  const existing = (await db.get('workbooks', workbookId)) as BuilderWorkbook | undefined;
  if (!existing) {
    throw new Error('Workbook not found.');
  }

  const nextName = patch.name !== undefined ? patch.name.trim() : existing.name;
  if (!nextName) {
    throw new Error('Workbook name cannot be empty.');
  }

  const updated: BuilderWorkbook = {
    ...existing,
    ...patch,
    name: nextName.slice(0, 120),
    description:
      patch.description !== undefined
        ? patch.description.trim().slice(0, 300)
        : existing.description,
    sheetName:
      patch.sheetName !== undefined
        ? sanitizeSheetName(patch.sheetName)
        : existing.sheetName,
    headerRowIndex:
      patch.headerRowIndex !== undefined
        ? Math.min(20, Math.max(1, patch.headerRowIndex))
        : existing.headerRowIndex,
    updatedAt: new Date().toISOString(),
  };

  await db.put('workbooks', updated);

  if (patch.columns !== undefined || patch.duplicateStrategy !== undefined) {
    await recomputeWorkbookValidationAndDuplicates(workbookId);
    const refreshed = (await db.get('workbooks', workbookId)) as BuilderWorkbook | undefined;
    return refreshed ?? updated;
  }

  return updated;
}

export async function listWorkbookRecords(
  workbookId: string
): Promise<BuilderRecord[]> {
  const db = await getBuilderDb();
  const tx = db.transaction('records', 'readonly');
  const idx = tx.store.index('by-workbook');
  const rows = (await idx.getAll(workbookId)) as BuilderRecord[];
  await tx.done;
  return rows.sort((a, b) => a.rowOrder - b.rowOrder);
}

export async function addBuilderRecordsBatch(
  workbookId: string,
  rowsInput: Array<{
    values: Record<string, BuilderCellValue>;
    source: BuilderRecord['source'];
  }>,
  ownerId?: string
): Promise<{
  addedRecords: BuilderRecord[];
  skippedDuplicates: number;
  workbook: BuilderWorkbook;
}> {
  const db = await getBuilderDb();
  const workbook = (await db.get('workbooks', workbookId)) as BuilderWorkbook | undefined;
  if (!workbook) {
    throw new Error('Workbook not found.');
  }

  const existingRecords = await listWorkbookRecords(workbookId);
  const runningRecords: Array<Pick<BuilderRecord, 'id' | 'values'>> = [
    ...existingRecords,
  ];
  let nextRowOrder =
    existingRecords.length > 0
      ? Math.max(...existingRecords.map((r) => r.rowOrder)) + 1
      : 1;

  const nowIso = new Date().toISOString();
  const orderedCols = [...workbook.columns].sort((a, b) => a.order - b.order);
  const toInsert: BuilderRecord[] = [];
  let skippedDuplicates = 0;

  for (const item of rowsInput) {
    const normalizedValues: Record<string, BuilderCellValue> = {};
    for (const col of orderedCols) {
      normalizedValues[col.id] = normalizeCellValue(col, item.values[col.id]);
    }

    const evaluation = evaluateRecordValues(orderedCols, normalizedValues, runningRecords);

    if (workbook.duplicateStrategy === 'skip' && evaluation.isDuplicate) {
      skippedDuplicates += 1;
      continue;
    }

    const recordId = createUniqueBuilderId('row');
    const newRecord: BuilderRecord = {
      id: recordId,
      workbookId,
      ownerId: ownerId?.trim() || workbook.ownerId || DEFAULT_BUILDER_OWNER_ID,
      rowOrder: nextRowOrder++,
      values: normalizedValues,
      isDuplicate:
        workbook.duplicateStrategy === 'allow' ? false : evaluation.isDuplicate,
      duplicateFields:
        workbook.duplicateStrategy === 'allow' ? [] : evaluation.duplicateFields,
      validationWarnings: evaluation.validationWarnings,
      source: item.source,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    runningRecords.push({ id: recordId, values: normalizedValues });
    toInsert.push(newRecord);
  }

  const nextWorkbook: BuilderWorkbook = {
    ...workbook,
    rowCount: existingRecords.length + toInsert.length,
    updatedAt: nowIso,
  };

  const tx = db.transaction(['records', 'workbooks'], 'readwrite');
  for (const rec of toInsert) {
    await tx.objectStore('records').put(rec);
  }
  await tx.objectStore('workbooks').put(nextWorkbook);
  await tx.done;

  return {
    addedRecords: toInsert,
    skippedDuplicates,
    workbook: nextWorkbook,
  };
}

export async function updateBuilderRecord(
  workbookId: string,
  recordId: string,
  nextValues: Record<string, BuilderCellValue>
): Promise<BuilderRecord[]> {
  const db = await getBuilderDb();
  const workbook = (await db.get('workbooks', workbookId)) as BuilderWorkbook | undefined;
  if (!workbook) throw new Error('Workbook not found.');

  const allRecords = await listWorkbookRecords(workbookId);
  const target = allRecords.find((r) => r.id === recordId);
  if (!target) throw new Error('Record not found.');

  const orderedCols = [...workbook.columns].sort((a, b) => a.order - b.order);
  const normalized: Record<string, BuilderCellValue> = {};
  for (const col of orderedCols) {
    normalized[col.id] = normalizeCellValue(col, nextValues[col.id]);
  }

  const nowIso = new Date().toISOString();
  const updatedList = allRecords.map((r) =>
    r.id === recordId ? { ...r, values: normalized, updatedAt: nowIso } : r
  );

  const reEvaluated = updatedList.map((rec, idx) => {
    const others = updatedList.slice(0, idx);
    const evalRes = evaluateRecordValues(orderedCols, rec.values, others, rec.id);
    return {
      ...rec,
      isDuplicate:
        workbook.duplicateStrategy === 'allow' ? false : evalRes.isDuplicate,
      duplicateFields:
        workbook.duplicateStrategy === 'allow' ? [] : evalRes.duplicateFields,
      validationWarnings: evalRes.validationWarnings,
    };
  });

  const tx = db.transaction(['records', 'workbooks'], 'readwrite');
  for (const rec of reEvaluated) {
    await tx.objectStore('records').put(rec);
  }
  await tx.objectStore('workbooks').put({
    ...workbook,
    updatedAt: nowIso,
  });
  await tx.done;

  return reEvaluated;
}

export async function deleteBuilderRecords(
  workbookId: string,
  recordIds: string[]
): Promise<{ remainingRecords: BuilderRecord[]; workbook: BuilderWorkbook }> {
  const db = await getBuilderDb();
  const workbook = (await db.get('workbooks', workbookId)) as BuilderWorkbook | undefined;
  if (!workbook) throw new Error('Workbook not found.');

  const removeSet = new Set(recordIds);
  const allRecords = await listWorkbookRecords(workbookId);
  const kept = allRecords.filter((r) => !removeSet.has(r.id));
  const orderedCols = [...workbook.columns].sort((a, b) => a.order - b.order);
  const nowIso = new Date().toISOString();

  const reEvaluated = kept.map((rec, idx) => {
    const prior = kept.slice(0, idx);
    const evalRes = evaluateRecordValues(orderedCols, rec.values, prior, rec.id);
    return {
      ...rec,
      rowOrder: idx + 1,
      isDuplicate:
        workbook.duplicateStrategy === 'allow' ? false : evalRes.isDuplicate,
      duplicateFields:
        workbook.duplicateStrategy === 'allow' ? [] : evalRes.duplicateFields,
      validationWarnings: evalRes.validationWarnings,
    };
  });

  const nextWorkbook: BuilderWorkbook = {
    ...workbook,
    rowCount: reEvaluated.length,
    updatedAt: nowIso,
  };

  const tx = db.transaction(['records', 'workbooks'], 'readwrite');
  for (const id of recordIds) {
    await tx.objectStore('records').delete(id);
  }
  for (const rec of reEvaluated) {
    await tx.objectStore('records').put(rec);
  }
  await tx.objectStore('workbooks').put(nextWorkbook);
  await tx.done;

  return { remainingRecords: reEvaluated, workbook: nextWorkbook };
}

export async function recomputeWorkbookValidationAndDuplicates(
  workbookId: string
): Promise<BuilderRecord[]> {
  const db = await getBuilderDb();
  const workbook = (await db.get('workbooks', workbookId)) as BuilderWorkbook | undefined;
  if (!workbook) return [];

  const rows = await listWorkbookRecords(workbookId);
  const orderedCols = [...workbook.columns].sort((a, b) => a.order - b.order);

  const updated = rows.map((rec, idx) => {
    const prior = rows.slice(0, idx);
    const evalRes = evaluateRecordValues(orderedCols, rec.values, prior, rec.id);
    return {
      ...rec,
      isDuplicate:
        workbook.duplicateStrategy === 'allow' ? false : evalRes.isDuplicate,
      duplicateFields:
        workbook.duplicateStrategy === 'allow' ? [] : evalRes.duplicateFields,
      validationWarnings: evalRes.validationWarnings,
    };
  });

  const tx = db.transaction('records', 'readwrite');
  for (const rec of updated) {
    await tx.store.put(rec);
  }
  await tx.done;

  return updated;
}

export async function listWorkbookRules(
  workbookId: string
): Promise<BuilderShortcutRule[]> {
  const db = await getBuilderDb();
  const tx = db.transaction('rules', 'readonly');
  const idx = tx.store.index('by-workbook');
  const rules = (await idx.getAll(workbookId)) as BuilderShortcutRule[];
  await tx.done;
  return rules.sort((a, b) => b.priority - a.priority);
}

export async function saveBuilderRule(
  rule: Omit<BuilderShortcutRule, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> & {
    id?: string;
    usageCount?: number;
  }
): Promise<BuilderShortcutRule> {
  const db = await getBuilderDb();
  const nowIso = new Date().toISOString();
  const existing = rule.id
    ? ((await db.get('rules', rule.id)) as BuilderShortcutRule | undefined)
    : undefined;

  const saved: BuilderShortcutRule = {
    ...rule,
    id: existing?.id ?? rule.id ?? createUniqueBuilderId('rule'),
    usageCount: existing?.usageCount ?? rule.usageCount ?? 0,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };

  await db.put('rules', saved);
  return saved;
}

export async function deleteBuilderRule(ruleId: string): Promise<void> {
  const db = await getBuilderDb();
  await db.delete('rules', ruleId);
}

export async function incrementRuleUsageCounts(
  matchedRuleIds: string[]
): Promise<void> {
  if (matchedRuleIds.length === 0) return;
  const counts = new Map<string, number>();
  for (const id of matchedRuleIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const db = await getBuilderDb();
  const tx = db.transaction('rules', 'readwrite');
  for (const [ruleId, delta] of counts.entries()) {
    const existing = (await tx.store.get(ruleId)) as BuilderShortcutRule | undefined;
    if (existing) {
      await tx.store.put({
        ...existing,
        usageCount: existing.usageCount + delta,
        updatedAt: new Date().toISOString(),
      });
    }
  }
  await tx.done;
}

export async function replaceWorkbookRules(
  workbookId: string,
  rules: BuilderShortcutRule[]
): Promise<void> {
  const db = await getBuilderDb();
  const existing = await listWorkbookRules(workbookId);
  const tx = db.transaction('rules', 'readwrite');
  for (const oldRule of existing) {
    await tx.store.delete(oldRule.id);
  }
  for (const nextRule of rules) {
    await tx.store.put({ ...nextRule, workbookId });
  }
  await tx.done;
}

export async function duplicateBuilderWorkbook(
  workbookId: string,
  options?: { includeRecords?: boolean; includeRules?: boolean; newName?: string }
): Promise<BuilderWorkbook> {
  const db = await getBuilderDb();
  const source = (await db.get('workbooks', workbookId)) as BuilderWorkbook | undefined;
  if (!source) {
    throw new Error('Source workbook not found.');
  }

  const nowIso = new Date().toISOString();
  const newWorkbookId = createUniqueBuilderId('uwb');

  const columnIdMap = new Map<string, string>();
  const clonedColumns: BuilderColumn[] = source.columns.map((col, idx) => {
    const newColId = createUniqueBuilderId('col');
    columnIdMap.set(col.id, newColId);
    return {
      ...col,
      id: newColId,
      order: idx,
      dropdownOptions: [...col.dropdownOptions],
    };
  });

  const includeRecords = options?.includeRecords ?? true;
  const includeRules = options?.includeRules ?? true;
  const sourceRecords = includeRecords ? await listWorkbookRecords(workbookId) : [];
  const sourceRules = includeRules ? await listWorkbookRules(workbookId) : [];

  const clonedWorkbook: BuilderWorkbook = {
    ...source,
    id: newWorkbookId,
    name: (options?.newName?.trim() || `${source.name} (Copy)`).slice(0, 120),
    archived: false,
    columns: clonedColumns,
    rowCount: sourceRecords.length,
    createdAt: nowIso,
    updatedAt: nowIso,
    cloudVersion: undefined,
    lastSyncedAt: undefined,
  };

  const tx = db.transaction(['workbooks', 'records', 'rules'], 'readwrite');
  await tx.objectStore('workbooks').put(clonedWorkbook);

  for (const row of sourceRecords) {
    const newValues: Record<string, BuilderCellValue> = {};
    for (const [oldColId, val] of Object.entries(row.values)) {
      const mappedColId = columnIdMap.get(oldColId) ?? oldColId;
      newValues[mappedColId] = val;
    }
    const clonedRow: BuilderRecord = {
      ...row,
      id: createUniqueBuilderId('row'),
      workbookId: newWorkbookId,
      values: newValues,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await tx.objectStore('records').put(clonedRow);
  }

  for (const rule of sourceRules) {
    const clonedRule: BuilderShortcutRule = {
      ...rule,
      id: createUniqueBuilderId('rule'),
      workbookId: newWorkbookId,
      assignments: rule.assignments.map((a) => ({
        columnId: columnIdMap.get(a.columnId) ?? a.columnId,
        value: a.value,
      })),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await tx.objectStore('rules').put(clonedRule);
  }

  await tx.done;
  return clonedWorkbook;
}

export async function deleteBuilderWorkbook(workbookId: string): Promise<void> {
  const db = await getBuilderDb();
  const [records, rules] = await Promise.all([
    listWorkbookRecords(workbookId),
    listWorkbookRules(workbookId),
  ]);

  const tx = db.transaction(['workbooks', 'records', 'rules'], 'readwrite');
  await tx.objectStore('workbooks').delete(workbookId);
  for (const row of records) {
    await tx.objectStore('records').delete(row.id);
  }
  for (const rule of rules) {
    await tx.objectStore('rules').delete(rule.id);
  }
  await tx.done;
}

export async function listCustomBuilderTemplates(): Promise<BuilderTemplate[]> {
  const db = await getBuilderDb();
  const all = (await db.getAll('templates')) as BuilderTemplate[];
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveCustomBuilderTemplate(
  workbook: BuilderWorkbook,
  templateName: string,
  description: string
): Promise<BuilderTemplate> {
  const db = await getBuilderDb();
  const nowIso = new Date().toISOString();
  const tpl: BuilderTemplate = {
    id: createUniqueBuilderId('tpl'),
    ownerId: workbook.ownerId || DEFAULT_BUILDER_OWNER_ID,
    name: templateName.trim().slice(0, 120),
    industry: workbook.industry,
    description: description.trim().slice(0, 300),
    isBuiltIn: false,
    sheetName: workbook.sheetName,
    columns: [...workbook.columns]
      .sort((a, b) => a.order - b.order)
      .map(({ id: _unused, ...rest }, idx) => ({
        ...rest,
        order: idx,
        dropdownOptions: [...rest.dropdownOptions],
      })),
    createdAt: nowIso,
  };
  await db.put('templates', tpl);
  return tpl;
}

export async function deleteCustomBuilderTemplate(templateId: string): Promise<void> {
  const db = await getBuilderDb();
  await db.delete('templates', templateId);
}

export async function upsertSyncedWorkbookBundle(
  workbook: BuilderWorkbook,
  records: BuilderRecord[],
  rules: BuilderShortcutRule[]
): Promise<void> {
  const db = await getBuilderDb();
  const existingRecords = await listWorkbookRecords(workbook.id);
  const existingRules = await listWorkbookRules(workbook.id);

  const tx = db.transaction(['workbooks', 'records', 'rules'], 'readwrite');
  await tx.objectStore('workbooks').put(workbook);
  for (const oldRec of existingRecords) {
    await tx.objectStore('records').delete(oldRec.id);
  }
  for (const rec of records) {
    await tx.objectStore('records').put(rec);
  }
  for (const oldRule of existingRules) {
    await tx.objectStore('rules').delete(oldRule.id);
  }
  for (const rule of rules) {
    await tx.objectStore('rules').put(rule);
  }
  await tx.done;
}
