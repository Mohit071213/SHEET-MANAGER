import {
  CallRecord,
  DATA_RETENTION_DAYS,
  DATA_RETENTION_MS,
  LocalVersionSnapshot,
  WorkbookMetadata,
} from '../types/callsheet';

export { DATA_RETENTION_DAYS, DATA_RETENTION_MS };

export function isExpiredTimestamp(
  isoTimestamp?: string | null,
  nowMs: number = Date.now()
): boolean {
  if (!isoTimestamp) return false;
  const parsed = Date.parse(isoTimestamp);
  if (!Number.isFinite(parsed)) return false;
  return nowMs - parsed > DATA_RETENTION_MS;
}

export function getRetentionDaysRemaining(
  isoTimestamp?: string | null,
  nowMs: number = Date.now()
): number {
  if (!isoTimestamp) return DATA_RETENTION_DAYS;
  const parsed = Date.parse(isoTimestamp);
  if (!Number.isFinite(parsed)) return DATA_RETENTION_DAYS;
  const remainingMs = Math.max(0, parsed + DATA_RETENTION_MS - nowMs);
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}

export function formatExpiryDateDDMMYYYY(isoTimestamp?: string | null): string {
  const baseMs = isoTimestamp ? Date.parse(isoTimestamp) : Date.now();
  const safeBase = Number.isFinite(baseMs) ? baseMs : Date.now();
  const expiry = new Date(safeBase + DATA_RETENTION_MS);
  const dd = String(expiry.getDate()).padStart(2, '0');
  const mm = String(expiry.getMonth() + 1).padStart(2, '0');
  const yyyy = expiry.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export interface PrunedRecordsResult {
  active: CallRecord[];
  expiredIds: string[];
  expiredCount: number;
}

export function pruneExpiredCallRecords(
  records: CallRecord[],
  nowMs: number = Date.now()
): PrunedRecordsResult {
  const active: CallRecord[] = [];
  const expiredIds: string[] = [];

  for (const rec of records) {
    if (isExpiredTimestamp(rec.createdAt, nowMs)) {
      expiredIds.push(rec.id);
    } else {
      active.push(rec);
    }
  }

  return {
    active,
    expiredIds,
    expiredCount: expiredIds.length,
  };
}

export function pruneExpiredSnapshots(
  snapshots: LocalVersionSnapshot[],
  nowMs: number = Date.now()
): { active: LocalVersionSnapshot[]; expiredIds: string[] } {
  const active: LocalVersionSnapshot[] = [];
  const expiredIds: string[] = [];

  for (const snap of snapshots) {
    if (isExpiredTimestamp(snap.createdAt, nowMs)) {
      expiredIds.push(snap.id);
    } else {
      active.push(snap);
    }
  }

  return { active, expiredIds };
}

export interface PrunedWorkspaceState {
  metadata: WorkbookMetadata | null;
  masterBuffer: ArrayBuffer | null;
  backupMetadata: WorkbookMetadata | null;
  backupBuffer: ArrayBuffer | null;
  masterRecords: CallRecord[];
  addedRecords: CallRecord[];
  expiredRecordsRemoved: number;
  expiredWorkbookCleared: boolean;
}

export function pruneExpiredWorkspaceState(
  state: {
    metadata: WorkbookMetadata | null;
    masterBuffer: ArrayBuffer | null;
    backupMetadata: WorkbookMetadata | null;
    backupBuffer: ArrayBuffer | null;
    masterRecords: CallRecord[];
    addedRecords: CallRecord[];
  },
  nowMs: number = Date.now()
): PrunedWorkspaceState {
  const masterPruned = pruneExpiredCallRecords(state.masterRecords ?? [], nowMs);
  const addedPruned = pruneExpiredCallRecords(state.addedRecords ?? [], nowMs);
  const expiredRecordsRemoved = masterPruned.expiredCount + addedPruned.expiredCount;

  let nextBackupMeta = state.backupMetadata;
  let nextBackupBuf = state.backupBuffer;
  if (
    nextBackupMeta &&
    isExpiredTimestamp(nextBackupMeta.lastUpdatedAt || nextBackupMeta.loadedAt, nowMs)
  ) {
    nextBackupMeta = null;
    nextBackupBuf = null;
  }

  const metaTimestamp = state.metadata?.lastUpdatedAt || state.metadata?.loadedAt;
  const workbookExpired =
    Boolean(state.metadata) &&
    isExpiredTimestamp(metaTimestamp, nowMs) &&
    masterPruned.active.length === 0 &&
    addedPruned.active.length === 0;

  if (workbookExpired) {
    return {
      metadata: null,
      masterBuffer: null,
      backupMetadata: nextBackupMeta,
      backupBuffer: nextBackupBuf,
      masterRecords: [],
      addedRecords: [],
      expiredRecordsRemoved,
      expiredWorkbookCleared: true,
    };
  }

  const headerRowIndex = state.metadata?.headerRowIndex ?? 1;
  const reindexedAdded = addedPruned.active.map((rec, idx) => ({
    ...rec,
    rowIndex: headerRowIndex + masterPruned.active.length + idx + 1,
  }));

  const nextMetadata = state.metadata
    ? {
        ...state.metadata,
        originalRecordCount: masterPruned.active.length,
      }
    : null;

  return {
    metadata: nextMetadata,
    masterBuffer: state.masterBuffer,
    backupMetadata: nextBackupMeta,
    backupBuffer: nextBackupBuf,
    masterRecords: masterPruned.active,
    addedRecords: reindexedAdded,
    expiredRecordsRemoved,
    expiredWorkbookCleared: false,
  };
}
