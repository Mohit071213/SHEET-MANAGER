import { IDBPDatabase, openDB } from 'idb';
import {
  CallRecord,
  LocalVersionSnapshot,
  WorkbookMetadata,
} from '../types/callsheet';

const DB_NAME = 'callsheet-manager-db';
const DB_VERSION = 1;

export interface PersistedLocalWorkspace {
  id: 'active';
  metadata: WorkbookMetadata | null;
  masterBuffer: ArrayBuffer | null;
  backupMetadata: WorkbookMetadata | null;
  backupBuffer: ArrayBuffer | null;
  masterRecords: CallRecord[];
  addedRecords: CallRecord[];
  updatedAt: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

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

export async function loadLocalWorkspace(): Promise<PersistedLocalWorkspace | null> {
  try {
    const db = await getDb();
    const data = await db.get('workspace', 'active');
    return (data as PersistedLocalWorkspace) ?? null;
  } catch (err) {
    console.error('Failed to read local workspace from IndexedDB:', err);
    return null;
  }
}

export async function saveLocalWorkspace(
  workspace: Omit<PersistedLocalWorkspace, 'id' | 'updatedAt'>
): Promise<void> {
  const db = await getDb();
  const payload: PersistedLocalWorkspace = {
    ...workspace,
    id: 'active',
    updatedAt: new Date().toISOString(),
  };
  await db.put('workspace', payload);
}

export async function clearLocalWorkspace(): Promise<void> {
  const db = await getDb();
  await db.delete('workspace', 'active');
}

export async function saveLocalSnapshot(snapshot: LocalVersionSnapshot): Promise<void> {
  const db = await getDb();
  await db.put('snapshots', snapshot);
  // Keep latest 15 snapshots locally to avoid unbounded IndexedDB growth
  const all = (await db.getAll('snapshots')) as LocalVersionSnapshot[];
  if (all.length > 15) {
    const sorted = all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const toRemove = sorted.slice(0, all.length - 15);
    for (const item of toRemove) {
      await db.delete('snapshots', item.id);
    }
  }
}

export async function listLocalSnapshots(): Promise<LocalVersionSnapshot[]> {
  try {
    const db = await getDb();
    const all = (await db.getAll('snapshots')) as LocalVersionSnapshot[];
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export function exportWorkspaceBackupJson(
  metadata: WorkbookMetadata | null,
  masterRecords: CallRecord[],
  addedRecords: CallRecord[]
): Blob {
  const payload = {
    app: 'CallSheet Manager',
    exportedAt: new Date().toISOString(),
    metadata,
    masterRecords,
    addedRecords,
  };
  return new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
}
