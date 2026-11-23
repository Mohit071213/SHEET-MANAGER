import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import {
  BuilderColumn,
  BuilderRecord,
  BuilderShortcutRule,
  BuilderTemplate,
  BuilderWorkbook,
} from './types';
import { BuilderIndustry } from './config';

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

function toFirestoreColumnMap(col: BuilderColumn): Record<string, unknown> {
  const map: Record<string, unknown> = {
    id: sanitizeId(col.id),
    key: col.key.slice(0, 80),
    label: col.label.slice(0, 120),
    order: col.order,
    type: col.type,
    required: Boolean(col.required),
    unique: Boolean(col.unique),
    defaultMode: col.defaultMode,
    defaultValue: String(col.defaultValue ?? '').slice(0, 160),
    dropdownOptions: (col.dropdownOptions ?? [])
      .slice(0, 100)
      .map((o) => String(o).slice(0, 100)),
    width: Math.min(80, Math.max(8, Number(col.width) || 16)),
  };
  if (col.validationRegex && col.validationRegex.trim()) {
    map.validationRegex = col.validationRegex.trim().slice(0, 160);
  }
  if (col.minValue !== undefined && Number.isFinite(col.minValue)) {
    map.minValue = col.minValue;
  }
  if (col.maxValue !== undefined && Number.isFinite(col.maxValue)) {
    map.maxValue = col.maxValue;
  }
  return map;
}

function tsToIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

export async function pushBuilderWorkbookToCloud(
  user: User,
  workbook: BuilderWorkbook,
  records: BuilderRecord[],
  rules: BuilderShortcutRule[]
): Promise<{ cloudVersion: number; syncedAt: string }> {
  const userId = user.uid;
  const wbId = sanitizeId(workbook.id);
  const wbPath = `users/${userId}/builderWorkbooks/${wbId}`;
  const wbRef = doc(db, 'users', userId, 'builderWorkbooks', wbId);

  try {
    const existingSnap = await getDoc(wbRef);
    const prevVersion = existingSnap.exists()
      ? Number(existingSnap.data().cloudVersion ?? 0)
      : 0;
    const nextVersion = prevVersion + 1;

    const wbPayload = {
      ownerId: userId,
      name: workbook.name.slice(0, 120),
      industry: workbook.industry.slice(0, 60),
      description: workbook.description.slice(0, 300),
      sheetName: workbook.sheetName.slice(0, 31),
      headerRowIndex: Math.min(20, Math.max(1, workbook.headerRowIndex)),
      freezeHeader: Boolean(workbook.freezeHeader),
      autoFilter: Boolean(workbook.autoFilter),
      duplicateStrategy: workbook.duplicateStrategy,
      archived: Boolean(workbook.archived),
      columns: workbook.columns.slice(0, 60).map(toFirestoreColumnMap),
      rowCount: records.length,
      cloudVersion: nextVersion,
      updatedAt: serverTimestamp(),
      ...(existingSnap.exists() ? {} : { createdAt: serverTimestamp() }),
    };

    // Fetch existing subcollection docs so removed rows/rules are cleaned cleanly
    const [existingRowsSnap, existingRulesSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, 'users', userId, 'builderWorkbooks', wbId, 'rows'),
          where('ownerId', '==', userId)
        )
      ),
      getDocs(
        query(
          collection(db, 'users', userId, 'builderWorkbooks', wbId, 'rules'),
          where('ownerId', '==', userId)
        )
      ),
    ]);

    const keepRowIds = new Set(records.map((r) => sanitizeId(r.id)));
    const keepRuleIds = new Set(rules.map((r) => sanitizeId(r.id)));
    const existingRowCreatedAt = new Map(
      existingRowsSnap.docs.map((d) => [d.id, d.data().createdAt])
    );
    const existingRuleCreatedAt = new Map(
      existingRulesSnap.docs.map((d) => [d.id, d.data().createdAt])
    );

    const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

    // Parent workbook write first so Master Gate getAfter/exists passes
    ops.push((batch) => {
      batch.set(wbRef, wbPayload, { merge: existingSnap.exists() });
    });

    for (const oldRow of existingRowsSnap.docs) {
      if (!keepRowIds.has(oldRow.id)) {
        ops.push((batch) => batch.delete(oldRow.ref));
      }
    }
    for (const oldRule of existingRulesSnap.docs) {
      if (!keepRuleIds.has(oldRule.id)) {
        ops.push((batch) => batch.delete(oldRule.ref));
      }
    }

    for (const rec of records) {
      const rId = sanitizeId(rec.id);
      const rRef = doc(db, 'users', userId, 'builderWorkbooks', wbId, 'rows', rId);
      const boundedValues: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(rec.values).slice(0, 60)) {
        boundedValues[k.slice(0, 80)] =
          typeof v === 'string' ? v.slice(0, 1500) : v;
      }
      const prevCreatedAt = existingRowCreatedAt.get(rId);
      const rowPayload = {
        ownerId: userId,
        workbookId: wbId,
        rowOrder: rec.rowOrder,
        values: boundedValues,
        isDuplicate: Boolean(rec.isDuplicate),
        duplicateFields: rec.duplicateFields.slice(0, 60).map((f) => f.slice(0, 120)),
        validationWarnings: rec.validationWarnings
          .slice(0, 60)
          .map((w) => w.slice(0, 200)),
        source: rec.source,
        createdAt: prevCreatedAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      ops.push((batch) => batch.set(rRef, rowPayload));
    }

    for (const rule of rules) {
      const ruleId = sanitizeId(rule.id);
      const ruleRef = doc(
        db,
        'users',
        userId,
        'builderWorkbooks',
        wbId,
        'rules',
        ruleId
      );
      const prevCreatedAt = existingRuleCreatedAt.get(ruleId);
      const rulePayload = {
        ownerId: userId,
        workbookId: wbId,
        name: rule.name.slice(0, 100),
        triggerText: rule.triggerText.slice(0, 120),
        matchMode: rule.matchMode,
        assignments: rule.assignments.slice(0, 30).map((a) => ({
          columnId: sanitizeId(a.columnId),
          value: String(a.value).slice(0, 200),
        })),
        priority: Math.min(1000, Math.max(0, rule.priority)),
        enabled: Boolean(rule.enabled),
        usageCount: Math.max(0, rule.usageCount),
        createdAt: prevCreatedAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      ops.push((batch) => batch.set(ruleRef, rulePayload));
    }

    // Commit parent doc first if batching > 400 ops
    const firstBatch = writeBatch(db);
    ops.slice(0, 400).forEach((fn) => fn(firstBatch));
    await firstBatch.commit();

    for (let i = 400; i < ops.length; i += 400) {
      const chunkBatch = writeBatch(db);
      ops.slice(i, i + 400).forEach((fn) => fn(chunkBatch));
      await chunkBatch.commit();
    }

    return { cloudVersion: nextVersion, syncedAt: new Date().toISOString() };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, wbPath);
  }
}

export async function pullBuilderWorkbooksFromCloud(user: User): Promise<
  Array<{
    workbook: BuilderWorkbook;
    records: BuilderRecord[];
    rules: BuilderShortcutRule[];
  }>
> {
  const userId = user.uid;
  const colPath = `users/${userId}/builderWorkbooks`;

  try {
    const wbSnap = await getDocs(
      query(
        collection(db, 'users', userId, 'builderWorkbooks'),
        where('ownerId', '==', userId)
      )
    );

    const bundles = await Promise.all(
      wbSnap.docs.map(async (wbDoc) => {
        const d = wbDoc.data();
        const wbId = wbDoc.id;

        const [rowsSnap, rulesSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, 'users', userId, 'builderWorkbooks', wbId, 'rows'),
              where('ownerId', '==', userId)
            )
          ),
          getDocs(
            query(
              collection(db, 'users', userId, 'builderWorkbooks', wbId, 'rules'),
              where('ownerId', '==', userId)
            )
          ),
        ]);

        const records: BuilderRecord[] = rowsSnap.docs
          .map((rowDoc) => {
            const rd = rowDoc.data();
            return {
              id: rowDoc.id,
              workbookId: wbId,
              ownerId: String(rd.ownerId ?? userId),
              rowOrder: Number(rd.rowOrder ?? 1),
              values: (rd.values ?? {}) as Record<string, string | number | boolean>,
              isDuplicate: Boolean(rd.isDuplicate),
              duplicateFields: (rd.duplicateFields ?? []) as string[],
              validationWarnings: (rd.validationWarnings ?? []) as string[],
              source: (rd.source ?? 'form') as BuilderRecord['source'],
              createdAt: tsToIso(rd.createdAt),
              updatedAt: tsToIso(rd.updatedAt),
            };
          })
          .sort((a, b) => a.rowOrder - b.rowOrder);

        const rules: BuilderShortcutRule[] = rulesSnap.docs
          .map((ruleDoc) => {
            const rld = ruleDoc.data();
            return {
              id: ruleDoc.id,
              workbookId: wbId,
              ownerId: String(rld.ownerId ?? userId),
              name: String(rld.name ?? ''),
              triggerText: String(rld.triggerText ?? ''),
              matchMode: (rld.matchMode ?? 'contains') as BuilderShortcutRule['matchMode'],
              assignments: (rld.assignments ?? []) as BuilderShortcutRule['assignments'],
              priority: Number(rld.priority ?? 10),
              enabled: Boolean(rld.enabled ?? true),
              usageCount: Number(rld.usageCount ?? 0),
              createdAt: tsToIso(rld.createdAt),
              updatedAt: tsToIso(rld.updatedAt),
            };
          })
          .sort((a, b) => b.priority - a.priority);

        const workbook: BuilderWorkbook = {
          id: wbId,
          ownerId: String(d.ownerId ?? userId),
          name: String(d.name ?? 'Untitled Workbook'),
          industry: (d.industry ?? 'Custom / General') as BuilderIndustry,
          description: String(d.description ?? ''),
          sheetName: String(d.sheetName ?? 'Records'),
          headerRowIndex: Number(d.headerRowIndex ?? 1),
          freezeHeader: Boolean(d.freezeHeader ?? true),
          autoFilter: Boolean(d.autoFilter ?? true),
          duplicateStrategy: (d.duplicateStrategy ?? 'flag') as BuilderWorkbook['duplicateStrategy'],
          archived: Boolean(d.archived),
          columns: (d.columns ?? []) as BuilderColumn[],
          rowCount: records.length,
          createdAt: tsToIso(d.createdAt),
          updatedAt: tsToIso(d.updatedAt),
          cloudVersion: Number(d.cloudVersion ?? 1),
          lastSyncedAt: new Date().toISOString(),
        };

        return { workbook, records, rules };
      })
    );

    return bundles;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }
}

export async function deleteBuilderWorkbookFromCloud(
  user: User,
  workbookId: string
): Promise<void> {
  const userId = user.uid;
  const wbId = sanitizeId(workbookId);
  const wbPath = `users/${userId}/builderWorkbooks/${wbId}`;
  try {
    const [rowsSnap, rulesSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, 'users', userId, 'builderWorkbooks', wbId, 'rows'),
          where('ownerId', '==', userId)
        )
      ),
      getDocs(
        query(
          collection(db, 'users', userId, 'builderWorkbooks', wbId, 'rules'),
          where('ownerId', '==', userId)
        )
      ),
    ]);

    const refs = [...rowsSnap.docs.map((d) => d.ref), ...rulesSnap.docs.map((d) => d.ref)];
    for (let i = 0; i < refs.length; i += 400) {
      const batch = writeBatch(db);
      refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
    await deleteDoc(doc(db, 'users', userId, 'builderWorkbooks', wbId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, wbPath);
  }
}

export async function pushBuilderTemplateToCloud(
  user: User,
  template: BuilderTemplate
): Promise<void> {
  const userId = user.uid;
  const tplId = sanitizeId(template.id);
  const path = `users/${userId}/builderTemplates/${tplId}`;
  try {
    const ref = doc(db, 'users', userId, 'builderTemplates', tplId);
    const snap = await getDoc(ref);
    await writeBatch(db)
      .set(ref, {
        ownerId: userId,
        name: template.name.slice(0, 120),
        industry: template.industry.slice(0, 60),
        description: template.description.slice(0, 300),
        sheetName: template.sheetName.slice(0, 31),
        columns: template.columns
          .slice(0, 60)
          .map((col, idx) => toFirestoreColumnMap({ ...col, id: `tplcol_${idx}` })),
        ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
      })
      .commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
