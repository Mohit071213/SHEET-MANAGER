import { IDBPDatabase, openDB } from 'idb';
import {
  CallRecord,
  EmployeeId,
  EMPLOYEES,
  LocalVersionSnapshot,
  WorkbookMetadata,
} from '../types/callsheet';
import {
  getRetentionDaysRemaining,
  pruneExpiredSnapshots,
  pruneExpiredWorkspaceState,
} from './retention';

const DB_NAME = 'callsheet-manager-db';
const DB_VERSION = 1;
const LEGACY_MASTER_PURGE_KEY = 'callsheet_master_purge_v2';

export type WorkspaceStorageKey =
  | 'workspace_bhaskar'
  | 'workspace_mohit'
  | 'workspace_dishant'
  | 'workspace_vishal';

export function getWorkspaceKey(employeeId: EmployeeId): WorkspaceStorageKey {
  return `workspace_${employeeId}` as WorkspaceStorageKey;
}

export interface PersistedLocalWorkspace {
  id: string;
  employeeId?: EmployeeId;
  metadata: WorkbookMetadata | null;
  masterBuffer: ArrayBuffer | null;
  backupMetadata: WorkbookMetadata | null;
  backupBuffer: ArrayBuffer | null;
  masterRecords: CallRecord[];
  addedRecords: CallRecord[];
  updatedAt: string;
}

export interface EmployeeWorkspacePreview {
  employeeId: EmployeeId;
  hasSheet: boolean;
  fileName: string | null;
  totalRecords: number;
  daysRemaining: number | null;
}

let dbPromise: Promise<IDBPDatabase> | null = null;
let legacyPurgePromise: Promise<void> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('workspace')) {
          db.createObjectStore('workspace', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * One-time clean wipe of pre-existing/legacy master sheet data so every user
 * starts completely empty and uploads their own workbook.
 */
export async function purgeLegacyMasterDataOnce(): Promise<boolean> {
  if (typeof localStorage !== 'undefined') {
    try {
      if (localStorage.getItem(LEGACY_MASTER_PURGE_KEY) === 'done') {
        return false;
      }
    } catch {
      // continue safely
    }
  }

  if (!legacyPurgePromise) {
    legacyPurgePromise = (async () => {
      try {
        const db = await getDb();
        const tx = db.transaction(['workspace', 'snapshots'], 'readwrite');
        await tx.objectStore('workspace').clear();
        await tx.objectStore('snapshots').clear();
        await tx.done;
      } catch (err) {
        console.error('Failed during one-time legacy master purge:', err);
      } finally {
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(LEGACY_MASTER_PURGE_KEY, 'done');
          } catch {
            // ignore
          }
        }
      }
    })();
  }

  await legacyPurgePromise;
  return true;
}

export async function loadLocalWorkspace(
  employeeId: EmployeeId,
  nowMs: number = Date.now()
): Promise<{
  workspace: PersistedLocalWorkspace | null;
  expiredRecordsRemoved: number;
  expiredWorkbookCleared: boolean;
}> {
  try {
    await purgeLegacyMasterDataOnce();
    const db = await getDb();
    const key = getWorkspaceKey(employeeId);
    const data = (await db.get('workspace', key)) as PersistedLocalWorkspace | undefined;
    if (!data) {
      return { workspace: null, expiredRecordsRemoved: 0, expiredWorkbookCleared: false };
    }

    const pruned = pruneExpiredWorkspaceState(
      {
        metadata: data.metadata,
        masterBuffer: data.masterBuffer,
        backupMetadata: data.backupMetadata,
        backupBuffer: data.backupBuffer,
        masterRecords: data.masterRecords ?? [],
        addedRecords: data.addedRecords ?? [],
      },
      nowMs
    );

    if (pruned.expiredWorkbookCleared) {
      await db.delete('workspace', key);
      return {
        workspace: null,
        expiredRecordsRemoved: pruned.expiredRecordsRemoved,
        expiredWorkbookCleared: true,
      };
    }

    const nextWorkspace: PersistedLocalWorkspace = {
      id: key,
      employeeId,
      metadata: pruned.metadata,
      masterBuffer: pruned.masterBuffer,
      backupMetadata: pruned.backupMetadata,
      backupBuffer: pruned.backupBuffer,
      masterRecords: pruned.masterRecords,
      addedRecords: pruned.addedRecords,
      updatedAt:
        pruned.expiredRecordsRemoved > 0 ? new Date(nowMs).toISOString() : data.updatedAt,
    };

    if (pruned.expiredRecordsRemoved > 0) {
      await db.put('workspace', nextWorkspace);
    }

    return {
      workspace: nextWorkspace,
      expiredRecordsRemoved: pruned.expiredRecordsRemoved,
      expiredWorkbookCleared: false,
    };
  } catch (err) {
    console.error('Failed to read local workspace from IndexedDB:', err);
    return { workspace: null, expiredRecordsRemoved: 0, expiredWorkbookCleared: false };
  }
}

export async function saveLocalWorkspace(
  employeeId: EmployeeId,
  workspace: Omit<PersistedLocalWorkspace, 'id' | 'employeeId' | 'updatedAt'>
): Promise<void> {
  await purgeLegacyMasterDataOnce();
  const db = await getDb();
  const key = getWorkspaceKey(employeeId);
  const payload: PersistedLocalWorkspace = {
    ...workspace,
    id: key,
    employeeId,
    updatedAt: new Date().toISOString(),
  };
  await db.put('workspace', payload);
}

export async function clearLocalWorkspace(employeeId: EmployeeId): Promise<void> {
  const db = await getDb();
  const key = getWorkspaceKey(employeeId);
  await db.delete('workspace', key);
}

export async function getAllEmployeeWorkspacePreviews(
  nowMs: number = Date.now()
): Promise<Record<EmployeeId, EmployeeWorkspacePreview>> {
  const result = {} as Record<EmployeeId, EmployeeWorkspacePreview>;
  await Promise.all(
    EMPLOYEES.map(async (emp) => {
      const { workspace } = await loadLocalWorkspace(emp.id, nowMs);
      if (workspace?.metadata) {
        const total =
          (workspace.masterRecords?.length ?? 0) + (workspace.addedRecords?.length ?? 0);
        const ts = workspace.metadata.lastUpdatedAt || workspace.metadata.loadedAt;
        result[emp.id] = {
          employeeId: emp.id,
          hasSheet: true,
          fileName: workspace.metadata.fileName,
          totalRecords: total,
          daysRemaining: getRetentionDaysRemaining(ts, nowMs),
        };
      } else {
        result[emp.id] = {
          employeeId: emp.id,
          hasSheet: false,
          fileName: null,
          totalRecords: 0,
          daysRemaining: null,
        };
      }
    })
  );
  return result;
}

export async function saveLocalSnapshot(snapshot: LocalVersionSnapshot): Promise<void> {
  await purgeLegacyMasterDataOnce();
  const db = await getDb();
  await db.put('snapshots', snapshot);

  const all = (await db.getAll('snapshots')) as LocalVersionSnapshot[];
  const { active, expiredIds } = pruneExpiredSnapshots(all);
  for (const id of expiredIds) {
    await db.delete('snapshots', id);
  }

  // Keep latest 15 active snapshots per employee locally
  const empId = snapshot.employeeId;
  const sameEmployee = active.filter((s) => s.employeeId === empId);
  if (sameEmployee.length > 15) {
    const sorted = sameEmployee.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const toRemove = sorted.slice(0, sameEmployee.length - 15);
    for (const item of toRemove) {
      await db.delete('snapshots', item.id);
    }
  }
}

export async function listLocalSnapshots(
  employeeId?: EmployeeId,
  nowMs: number = Date.now()
): Promise<LocalVersionSnapshot[]> {
  try {
    await purgeLegacyMasterDataOnce();
    const db = await getDb();
    const all = (await db.getAll('snapshots')) as LocalVersionSnapshot[];
    const { active, expiredIds } = pruneExpiredSnapshots(all, nowMs);

    for (const id of expiredIds) {
      await db.delete('snapshots', id);
    }

    const filtered = employeeId
      ? active.filter((s) => s.employeeId === employeeId)
      : active;
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export function exportWorkspaceBackupJson(
  employeeId: EmployeeId,
  metadata: WorkbookMetadata | null,
  masterRecords: CallRecord[],
  addedRecords: CallRecord[]
): Blob {
  const payload = {
    app: 'CallSheet Manager',
    employeeId,
    exportedAt: new Date().toISOString(),
    retentionDays: 7,
    metadata,
    masterRecords,
    addedRecords,
  };
  return new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
}
