import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  CallRecord,
  EmployeeId,
  EMPLOYEES,
  GlobalEntryDefaults,
  WorkbookMetadata,
} from '../types/callsheet';
import { sanitizeGlobalEntryDefaults } from './globalDefaults';
import { isExpiredTimestamp } from './retention';

const CHUNK_SIZE = 450_000; // Safely under 1MB Firestore document limit

export function getEmployeeWorkbookId(employeeId: EmployeeId): string {
  return `${employeeId}_master`;
}

export interface CloudVersionEntry {
  id: string;
  version: number;
  label: string;
  fileName: string;
  totalRecords: number;
  addedCount: number;
  deviceTag: string;
  createdAt: string;
}

export interface CloudWorkbookSnapshot {
  metadata: WorkbookMetadata;
  version: number;
  templateChunkCount: number;
  updatedByDevice: string;
}

export function getCurrentDeviceTag(): string {
  if (typeof navigator === 'undefined') return 'Web Browser';
  const ua = navigator.userAgent;
  const isMobile = /android|iphone|ipad|ipod/i.test(ua);
  const platform = /iphone|ipad/i.test(ua)
    ? 'iPhone'
    : /android/i.test(ua)
      ? 'Android'
      : /windows/i.test(ua)
        ? 'Windows PC'
        : /mac/i.test(ua)
          ? 'Mac'
          : 'Web';
  return `${platform}${isMobile ? ' Mobile' : ''}`;
}

function sanitizeFirestoreId(raw: string, fallbackPrefix: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
  return cleaned || `${fallbackPrefix}_${Date.now()}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function chunkString(str: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < str.length; i += size) {
    out.push(str.slice(i, i + size));
  }
  return out;
}

function tsToIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

async function deleteCloudWorkbookCompletely(
  userId: string,
  workbookId: string
): Promise<void> {
  const [chunksSnap, recordsSnap, versionsSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, 'users', userId, 'workbooks', workbookId, 'chunks'),
        where('ownerId', '==', userId)
      )
    ),
    getDocs(
      query(
        collection(db, 'users', userId, 'workbooks', workbookId, 'records'),
        where('ownerId', '==', userId)
      )
    ),
    getDocs(
      query(
        collection(db, 'users', userId, 'workbooks', workbookId, 'versions'),
        where('ownerId', '==', userId)
      )
    ),
  ]);

  const refs = [
    ...chunksSnap.docs.map((d) => d.ref),
    ...recordsSnap.docs.map((d) => d.ref),
    ...versionsSnap.docs.map((d) => d.ref),
  ];

  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  await deleteDoc(doc(db, 'users', userId, 'workbooks', workbookId));
}

export async function ensureUserWorkspace(
  user: User,
  employeeId: EmployeeId,
  globalDefaults?: GlobalEntryDefaults
): Promise<{ purgedLegacyCloud: boolean; cloudGlobalDefaults: GlobalEntryDefaults | null }> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  const workbookId = getEmployeeWorkbookId(employeeId);

  try {
    const snap = await getDoc(userRef);
    const cleanDefaults = globalDefaults
      ? sanitizeGlobalEntryDefaults(globalDefaults)
      : undefined;

    if (!snap.exists()) {
      await setDoc(userRef, {
        ownerId: user.uid,
        email: (user.email ?? 'user@callsheet.local').slice(0, 200),
        activeWorkbookId: workbookId,
        purgeV2Applied: true,
        ...(cleanDefaults ? { globalDefaults: cleanDefaults } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { purgedLegacyCloud: false, cloudGlobalDefaults: cleanDefaults ?? null };
    }

    const existingData = snap.data();
    let purgedLegacyCloud = false;

    // One-time cloud master reset: wipe pre-existing legacy cloud workbooks so every employee starts fresh
    if (existingData?.purgeV2Applied !== true) {
      const legacyIds = new Set<string>([
        'master',
        ...EMPLOYEES.map((e) => getEmployeeWorkbookId(e.id)),
      ]);
      for (const wbId of legacyIds) {
        try {
          const wbSnap = await getDoc(doc(db, 'users', user.uid, 'workbooks', wbId));
          if (wbSnap.exists()) {
            await deleteCloudWorkbookCompletely(user.uid, wbId);
            purgedLegacyCloud = true;
          }
        } catch {
          // ignore missing legacy workbook doc
        }
      }

      await setDoc(
        userRef,
        {
          ownerId: user.uid,
          email: (user.email ?? 'user@callsheet.local').slice(0, 200),
          activeWorkbookId: workbookId,
          purgeV2Applied: true,
          ...(existingData?.globalDefaults
            ? {
                globalDefaults: sanitizeGlobalEntryDefaults(
                  existingData.globalDefaults as Partial<GlobalEntryDefaults>
                ),
              }
            : cleanDefaults
              ? { globalDefaults: cleanDefaults }
              : {}),
          createdAt: existingData.createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } else if (existingData?.activeWorkbookId !== workbookId) {
      await setDoc(
        userRef,
        {
          ownerId: user.uid,
          email: (user.email ?? 'user@callsheet.local').slice(0, 200),
          activeWorkbookId: workbookId,
          purgeV2Applied: true,
          ...(existingData?.globalDefaults
            ? {
                globalDefaults: sanitizeGlobalEntryDefaults(
                  existingData.globalDefaults as Partial<GlobalEntryDefaults>
                ),
              }
            : {}),
          createdAt: existingData.createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    const cloudGlobalDefaults = existingData?.globalDefaults
      ? sanitizeGlobalEntryDefaults(existingData.globalDefaults as Partial<GlobalEntryDefaults>)
      : null;

    return { purgedLegacyCloud, cloudGlobalDefaults };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }
}

export async function saveGlobalDefaultsToCloud(
  user: User,
  employeeId: EmployeeId,
  defaults: GlobalEntryDefaults
): Promise<GlobalEntryDefaults> {
  const clean = sanitizeGlobalEntryDefaults({
    ...defaults,
    updatedAt: new Date().toISOString(),
  });
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  const workbookId = getEmployeeWorkbookId(employeeId);

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        ownerId: user.uid,
        email: (user.email ?? 'user@callsheet.local').slice(0, 200),
        activeWorkbookId: workbookId,
        purgeV2Applied: true,
        globalDefaults: clean,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existingData = snap.data();
      await setDoc(
        userRef,
        {
          ownerId: user.uid,
          email: (user.email ?? 'user@callsheet.local').slice(0, 200),
          activeWorkbookId: existingData.activeWorkbookId ?? workbookId,
          purgeV2Applied: true,
          globalDefaults: clean,
          createdAt: existingData.createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
    return clean;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }
}

export function subscribeCloudUserDefaults(
  userId: string,
  onDefaults: (defaults: GlobalEntryDefaults) => void,
  onError?: (err: Error) => void
): () => void {
  const userPath = `users/${userId}`;
  return onSnapshot(
    doc(db, 'users', userId),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d?.globalDefaults) {
        onDefaults(sanitizeGlobalEntryDefaults(d.globalDefaults as Partial<GlobalEntryDefaults>));
      }
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.GET, userPath);
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
    }
  );
}

export async function pruneExpiredCloudWorkbookData(
  user: User,
  employeeId: EmployeeId,
  nowMs: number = Date.now()
): Promise<{ removedRecords: number; removedVersions: number; clearedWorkbook: boolean }> {
  const workbookId = getEmployeeWorkbookId(employeeId);
  const wbPath = `users/${user.uid}/workbooks/${workbookId}`;
  const wbRef = doc(db, 'users', user.uid, 'workbooks', workbookId);

  try {
    const wbSnap = await getDoc(wbRef);
    if (!wbSnap.exists()) {
      return { removedRecords: 0, removedVersions: 0, clearedWorkbook: false };
    }

    const wbData = wbSnap.data();
    const recordsSnap = await getDocs(
      query(
        collection(db, 'users', user.uid, 'workbooks', workbookId, 'records'),
        where('ownerId', '==', user.uid)
      )
    );
    const versionsSnap = await getDocs(
      query(
        collection(db, 'users', user.uid, 'workbooks', workbookId, 'versions'),
        where('ownerId', '==', user.uid)
      )
    );

    const expiredRecordRefs = recordsSnap.docs
      .filter((d) => isExpiredTimestamp(tsToIso(d.data().createdAt), nowMs))
      .map((d) => d.ref);
    const activeRecords = recordsSnap.docs.filter(
      (d) => !isExpiredTimestamp(tsToIso(d.data().createdAt), nowMs)
    );

    const expiredVersionRefs = versionsSnap.docs
      .filter((d) => isExpiredTimestamp(tsToIso(d.data().createdAt), nowMs))
      .map((d) => d.ref);

    const wbUpdatedIso = tsToIso(wbData.updatedAt ?? wbData.createdAt);
    const shouldClearWorkbook =
      isExpiredTimestamp(wbUpdatedIso, nowMs) && activeRecords.length === 0;

    if (shouldClearWorkbook) {
      await deleteCloudWorkbookCompletely(user.uid, workbookId);
      return {
        removedRecords: recordsSnap.docs.length,
        removedVersions: versionsSnap.docs.length,
        clearedWorkbook: true,
      };
    }

    const deleteRefs = [...expiredRecordRefs, ...expiredVersionRefs];
    for (let i = 0; i < deleteRefs.length; i += 400) {
      const batch = writeBatch(db);
      deleteRefs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    if (expiredRecordRefs.length > 0) {
      const remainingMaster = activeRecords.filter((d) => d.data().source === 'master').length;
      const remainingAdded = activeRecords.filter((d) => d.data().source === 'added').length;
      const deviceTag = getCurrentDeviceTag();

      await runTransaction(db, async (tx) => {
        const freshWb = await tx.get(wbRef);
        if (!freshWb.exists()) return;
        const currVer = Number(freshWb.data().version ?? 1);
        tx.update(wbRef, {
          originalRecordCount: remainingMaster,
          addedRecordCount: remainingAdded,
          version: currVer + 1,
          updatedByDevice: deviceTag.slice(0, 80),
          updatedAt: serverTimestamp(),
        });
      });
    }

    return {
      removedRecords: expiredRecordRefs.length,
      removedVersions: expiredVersionRefs.length,
      clearedWorkbook: false,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, wbPath);
  }
}

export async function uploadMasterToCloud(
  user: User,
  employeeId: EmployeeId,
  metadata: WorkbookMetadata,
  masterBuffer: ArrayBuffer,
  masterRecords: CallRecord[],
  addedRecords: CallRecord[]
): Promise<number> {
  await ensureUserWorkspace(user, employeeId);

  const workbookId = getEmployeeWorkbookId(employeeId);
  const deviceTag = getCurrentDeviceTag();
  const base64Template = arrayBufferToBase64(masterBuffer);
  const chunks = chunkString(base64Template, CHUNK_SIZE);
  const wbPath = `users/${user.uid}/workbooks/${workbookId}`;
  const wbRef = doc(db, 'users', user.uid, 'workbooks', workbookId);

  try {
    const existingWb = await getDoc(wbRef);
    const nextVersion = existingWb.exists()
      ? Number(existingWb.data().version ?? 0) + 1
      : 1;

    const oldChunksSnap = await getDocs(
      query(
        collection(db, 'users', user.uid, 'workbooks', workbookId, 'chunks'),
        where('ownerId', '==', user.uid)
      )
    );
    const oldRecordsSnap = await getDocs(
      query(
        collection(db, 'users', user.uid, 'workbooks', workbookId, 'records'),
        where('ownerId', '==', user.uid)
      )
    );

    const deleteRefs = [...oldChunksSnap.docs, ...oldRecordsSnap.docs].map((d) => d.ref);
    for (let i = 0; i < deleteRefs.length; i += 400) {
      const batch = writeBatch(db);
      deleteRefs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    const wbPayload = {
      ownerId: user.uid,
      fileName: metadata.fileName.slice(0, 200),
      sheetName: metadata.sheetName.slice(0, 100),
      dateFormat: metadata.dateFormat.slice(0, 20),
      headerRowIndex: metadata.headerRowIndex,
      originalRecordCount: masterRecords.length,
      addedRecordCount: addedRecords.length,
      hasFrozenHeader: metadata.hasFrozenHeader,
      hasAutoFilter: metadata.hasAutoFilter,
      columnWidths:
        metadata.columnWidths.length > 0
          ? metadata.columnWidths.slice(0, 10)
          : [14, 15, 18, 18, 28, 14, 14, 12, 42, 14],
      templateChunkCount: chunks.length,
      version: nextVersion,
      updatedByDevice: deviceTag.slice(0, 80),
      fileSizeBytes: masterBuffer.byteLength,
      createdAt: existingWb.exists() ? existingWb.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(wbRef, wbPayload);

    for (let i = 0; i < chunks.length; i += 10) {
      const batch = writeBatch(db);
      chunks.slice(i, i + 10).forEach((chunkData, offset) => {
        const idx = i + offset;
        const cRef = doc(
          db,
          'users',
          user.uid,
          'workbooks',
          workbookId,
          'chunks',
          `chunk_${idx}`
        );
        batch.set(cRef, {
          ownerId: user.uid,
          workbookId,
          index: idx,
          data: chunkData,
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }

    const allRows = [...masterRecords, ...addedRecords];
    for (let i = 0; i < allRows.length; i += 400) {
      const batch = writeBatch(db);
      allRows.slice(i, i + 400).forEach((rec, offset) => {
        const recId = sanitizeFirestoreId(rec.id, `row_${i + offset}`);
        const rRef = doc(
          db,
          'users',
          user.uid,
          'workbooks',
          workbookId,
          'records',
          recId
        );
        batch.set(rRef, {
          ownerId: user.uid,
          workbookId,
          rowIndex: rec.rowIndex,
          date: rec.date.slice(0, 24),
          serialId: (rec.serialId || 'NA').slice(0, 64),
          mobileNo: rec.mobileNo.slice(0, 24),
          category: rec.category.slice(0, 100),
          subcategory: rec.subcategory.slice(0, 100),
          status: rec.status,
          escalations: rec.escalations.slice(0, 40),
          channels: rec.channels.slice(0, 40),
          remark: rec.remark.slice(0, 500),
          names: rec.names.slice(0, 60),
          source: rec.source,
          addedDateKey: rec.addedDateKey.slice(0, 24),
          deviceTag: (rec.deviceTag || deviceTag).slice(0, 80),
          isDuplicateMobile: Boolean(rec.isDuplicateMobile),
          isDuplicateSerial: Boolean(rec.isDuplicateSerial),
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }

    const verRef = doc(
      db,
      'users',
      user.uid,
      'workbooks',
      workbookId,
      'versions',
      `v_${nextVersion}_${Date.now()}`
    );
    await setDoc(verRef, {
      ownerId: user.uid,
      workbookId,
      version: nextVersion,
      label: `Synced workbook ${metadata.fileName}`.slice(0, 160),
      fileName: metadata.fileName.slice(0, 200),
      totalRecords: allRows.length,
      addedCount: addedRecords.length,
      deviceTag: deviceTag.slice(0, 80),
      createdAt: serverTimestamp(),
    });

    return nextVersion;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, wbPath);
  }
}

export async function appendRecordsToCloudTransaction(
  user: User,
  employeeId: EmployeeId,
  newRecords: CallRecord[]
): Promise<number> {
  await ensureUserWorkspace(user, employeeId);
  const workbookId = getEmployeeWorkbookId(employeeId);
  const deviceTag = getCurrentDeviceTag();
  const wbPath = `users/${user.uid}/workbooks/${workbookId}`;
  const wbRef = doc(db, 'users', user.uid, 'workbooks', workbookId);

  try {
    const nextVersion = await runTransaction(db, async (tx) => {
      const wbSnap = await tx.get(wbRef);
      if (!wbSnap.exists()) {
        throw new Error(
          'No synced master workbook found in your cloud account. Push your master workbook first.'
        );
      }

      const data = wbSnap.data();
      const currentVersion = Number(data.version ?? 1);
      const headerRowIndex = Number(data.headerRowIndex ?? 1);
      const originalCount = Number(data.originalRecordCount ?? 0);
      const currentAddedCount = Number(data.addedRecordCount ?? 0);
      const nextVer = currentVersion + 1;
      const startRowIndex = headerRowIndex + originalCount + currentAddedCount + 1;

      newRecords.forEach((rec, idx) => {
        const recId = sanitizeFirestoreId(rec.id, `added_${Date.now()}_${idx}`);
        const rRef = doc(
          db,
          'users',
          user.uid,
          'workbooks',
          workbookId,
          'records',
          recId
        );
        tx.set(rRef, {
          ownerId: user.uid,
          workbookId,
          rowIndex: startRowIndex + idx,
          date: rec.date.slice(0, 24),
          serialId: (rec.serialId || 'NA').slice(0, 64),
          mobileNo: rec.mobileNo.slice(0, 24),
          category: rec.category.slice(0, 100),
          subcategory: rec.subcategory.slice(0, 100),
          status: rec.status,
          escalations: rec.escalations.slice(0, 40),
          channels: rec.channels.slice(0, 40),
          remark: rec.remark.slice(0, 500),
          names: rec.names.slice(0, 60),
          source: 'added',
          addedDateKey: rec.addedDateKey.slice(0, 24),
          deviceTag: deviceTag.slice(0, 80),
          isDuplicateMobile: Boolean(rec.isDuplicateMobile),
          isDuplicateSerial: Boolean(rec.isDuplicateSerial),
          createdAt: serverTimestamp(),
        });
      });

      const updatedAddedCount = currentAddedCount + newRecords.length;
      tx.update(wbRef, {
        addedRecordCount: updatedAddedCount,
        version: nextVer,
        updatedByDevice: deviceTag.slice(0, 80),
        updatedAt: serverTimestamp(),
      });

      const verRef = doc(
        db,
        'users',
        user.uid,
        'workbooks',
        workbookId,
        'versions',
        `v_${nextVer}_${Date.now()}`
      );
      tx.set(verRef, {
        ownerId: user.uid,
        workbookId,
        version: nextVer,
        label: `Added ${newRecords.length} record${newRecords.length > 1 ? 's' : ''} (${deviceTag})`.slice(
          0,
          160
        ),
        fileName: String(data.fileName ?? `${employeeId}_master.xlsx`).slice(0, 200),
        totalRecords: originalCount + updatedAddedCount,
        addedCount: newRecords.length,
        deviceTag: deviceTag.slice(0, 80),
        createdAt: serverTimestamp(),
      });

      return nextVer;
    });

    return nextVersion;
  } catch (err) {
    if (err instanceof Error && err.message.includes('No synced master workbook')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, wbPath);
  }
}

export async function deleteAddedRecordsFromCloud(
  user: User,
  employeeId: EmployeeId,
  recordIds: string[]
): Promise<number | null> {
  if (recordIds.length === 0) return null;
  await ensureUserWorkspace(user, employeeId);

  const workbookId = getEmployeeWorkbookId(employeeId);
  const deviceTag = getCurrentDeviceTag();
  const wbPath = `users/${user.uid}/workbooks/${workbookId}`;
  const wbRef = doc(db, 'users', user.uid, 'workbooks', workbookId);

  try {
    const overflowCount = Math.max(0, recordIds.length - 400);
    if (overflowCount > 0) {
      const overflowIds = recordIds.slice(0, overflowCount);
      for (let i = 0; i < overflowIds.length; i += 400) {
        const batch = writeBatch(db);
        overflowIds.slice(i, i + 400).forEach((rawId) => {
          const recId = sanitizeFirestoreId(rawId, rawId);
          batch.delete(
            doc(db, 'users', user.uid, 'workbooks', workbookId, 'records', recId)
          );
        });
        await batch.commit();
      }
    }

    const txIds = recordIds.slice(overflowCount);
    const nextVersion = await runTransaction(db, async (tx) => {
      const wbSnap = await tx.get(wbRef);
      if (!wbSnap.exists()) {
        return null;
      }

      const data = wbSnap.data();
      const currentVersion = Number(data.version ?? 1);
      const originalCount = Number(data.originalRecordCount ?? 0);
      const currentAddedCount = Number(data.addedRecordCount ?? 0);
      const nextVer = currentVersion + 1;
      const updatedAddedCount = Math.max(0, currentAddedCount - recordIds.length);

      txIds.forEach((rawId) => {
        const recId = sanitizeFirestoreId(rawId, rawId);
        const rRef = doc(
          db,
          'users',
          user.uid,
          'workbooks',
          workbookId,
          'records',
          recId
        );
        tx.delete(rRef);
      });

      tx.update(wbRef, {
        addedRecordCount: updatedAddedCount,
        version: nextVer,
        updatedByDevice: deviceTag.slice(0, 80),
        updatedAt: serverTimestamp(),
      });

      const verRef = doc(
        db,
        'users',
        user.uid,
        'workbooks',
        workbookId,
        'versions',
        `v_${nextVer}_${Date.now()}`
      );
      tx.set(verRef, {
        ownerId: user.uid,
        workbookId,
        version: nextVer,
        label: `Removed ${recordIds.length} added record${recordIds.length > 1 ? 's' : ''} (${deviceTag})`.slice(
          0,
          160
        ),
        fileName: String(data.fileName ?? `${employeeId}_master.xlsx`).slice(0, 200),
        totalRecords: originalCount + updatedAddedCount,
        addedCount: 0,
        deviceTag: deviceTag.slice(0, 80),
        createdAt: serverTimestamp(),
      });

      return nextVer;
    });

    return nextVersion;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, wbPath);
  }
}

export async function fetchCloudTemplateBuffer(
  userId: string,
  employeeId: EmployeeId
): Promise<ArrayBuffer | null> {
  const workbookId = getEmployeeWorkbookId(employeeId);
  const chunksPath = `users/${userId}/workbooks/${workbookId}/chunks`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'users', userId, 'workbooks', workbookId, 'chunks'),
        where('ownerId', '==', userId),
        orderBy('index', 'asc')
      )
    );
    if (snap.empty) return null;
    const base64 = snap.docs.map((d) => String(d.data().data ?? '')).join('');
    return base64ToArrayBuffer(base64);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, chunksPath);
  }
}

export function subscribeCloudWorkbook(
  userId: string,
  employeeId: EmployeeId,
  callbacks: {
    onWorkbook: (snap: CloudWorkbookSnapshot | null) => void;
    onRecords: (records: CallRecord[]) => void;
    onVersions: (versions: CloudVersionEntry[]) => void;
    onError: (err: Error) => void;
  }
): () => void {
  const workbookId = getEmployeeWorkbookId(employeeId);
  const wbPath = `users/${userId}/workbooks/${workbookId}`;
  const recordsPath = `${wbPath}/records`;
  const versionsPath = `${wbPath}/versions`;

  const unsubWb = onSnapshot(
    doc(db, 'users', userId, 'workbooks', workbookId),
    (snap) => {
      if (!snap.exists()) {
        callbacks.onWorkbook(null);
        return;
      }
      const d = snap.data();
      const meta: WorkbookMetadata = {
        fileName: String(d.fileName),
        sheetName: String(d.sheetName),
        dateFormat: String(d.dateFormat),
        headerRowIndex: Number(d.headerRowIndex),
        originalRecordCount: Number(d.originalRecordCount),
        hasFrozenHeader: Boolean(d.hasFrozenHeader),
        hasAutoFilter: Boolean(d.hasAutoFilter),
        columnWidths: Array.isArray(d.columnWidths) ? (d.columnWidths as number[]) : [],
        extractedCategories: {},
        loadedAt: tsToIso(d.createdAt),
        lastUpdatedAt: tsToIso(d.updatedAt),
        fileSizeBytes: Number(d.fileSizeBytes ?? 0),
      };
      callbacks.onWorkbook({
        metadata: meta,
        version: Number(d.version ?? 1),
        templateChunkCount: Number(d.templateChunkCount ?? 0),
        updatedByDevice: String(d.updatedByDevice ?? ''),
      });
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.GET, wbPath);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  const unsubRecords = onSnapshot(
    query(
      collection(db, 'users', userId, 'workbooks', workbookId, 'records'),
      where('ownerId', '==', userId),
      orderBy('rowIndex', 'asc')
    ),
    (snap) => {
      const nowMs = Date.now();
      const rows: CallRecord[] = snap.docs
        .map((docSnap) => {
          const d = docSnap.data();
          const createdAt = tsToIso(d.createdAt);
          return {
            id: docSnap.id,
            rowIndex: Number(d.rowIndex),
            date: String(d.date ?? ''),
            serialId: String(d.serialId ?? 'NA'),
            mobileNo: String(d.mobileNo ?? ''),
            category: String(d.category ?? ''),
            subcategory: String(d.subcategory ?? ''),
            status: d.status === 'Unresolved' ? ('Unresolved' as const) : ('Resolved' as const),
            escalations: String(d.escalations ?? 'Level1'),
            channels: String(d.channels ?? 'Calls'),
            remark: String(d.remark ?? ''),
            names: String(d.names ?? employeeId),
            source: d.source === 'master' ? ('master' as const) : ('added' as const),
            createdAt,
            addedDateKey: String(d.addedDateKey ?? ''),
            deviceTag: String(d.deviceTag ?? ''),
            isDuplicateMobile: Boolean(d.isDuplicateMobile),
            isDuplicateSerial: Boolean(d.isDuplicateSerial),
          };
        })
        .filter((row) => !isExpiredTimestamp(row.createdAt, nowMs));
      callbacks.onRecords(rows);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, recordsPath);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  const unsubVersions = onSnapshot(
    query(
      collection(db, 'users', userId, 'workbooks', workbookId, 'versions'),
      where('ownerId', '==', userId),
      orderBy('version', 'desc')
    ),
    (snap) => {
      const nowMs = Date.now();
      const versions: CloudVersionEntry[] = snap.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            version: Number(d.version ?? 1),
            label: String(d.label ?? ''),
            fileName: String(d.fileName ?? ''),
            totalRecords: Number(d.totalRecords ?? 0),
            addedCount: Number(d.addedCount ?? 0),
            deviceTag: String(d.deviceTag ?? ''),
            createdAt: tsToIso(d.createdAt),
          };
        })
        .filter((v) => !isExpiredTimestamp(v.createdAt, nowMs));
      callbacks.onVersions(versions);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, versionsPath);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  return () => {
    unsubWb();
    unsubRecords();
    unsubVersions();
  };
}
