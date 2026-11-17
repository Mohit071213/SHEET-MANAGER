import { User } from 'firebase/auth';
import {
  collection,
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
import { CallRecord, WorkbookMetadata } from '../types/callsheet';

const WORKBOOK_ID = 'master';
const CHUNK_SIZE = 450_000; // Safely under 1MB Firestore document limit

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

export async function ensureUserWorkspace(user: User): Promise<void> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        ownerId: user.uid,
        email: (user.email ?? 'user@callsheet.local').slice(0, 200),
        activeWorkbookId: WORKBOOK_ID,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }
}

export async function uploadMasterToCloud(
  user: User,
  metadata: WorkbookMetadata,
  masterBuffer: ArrayBuffer,
  masterRecords: CallRecord[],
  addedRecords: CallRecord[]
): Promise<number> {
  await ensureUserWorkspace(user);

  const deviceTag = getCurrentDeviceTag();
  const base64Template = arrayBufferToBase64(masterBuffer);
  const chunks = chunkString(base64Template, CHUNK_SIZE);
  const wbPath = `users/${user.uid}/workbooks/${WORKBOOK_ID}`;
  const wbRef = doc(db, 'users', user.uid, 'workbooks', WORKBOOK_ID);

  try {
    const existingWb = await getDoc(wbRef);
    const nextVersion = existingWb.exists()
      ? Number(existingWb.data().version ?? 0) + 1
      : 1;

    // Delete old records & chunks safely before uploading replacement master workbook
    const oldChunksSnap = await getDocs(
      query(
        collection(db, 'users', user.uid, 'workbooks', WORKBOOK_ID, 'chunks'),
        where('ownerId', '==', user.uid)
      )
    );
    const oldRecordsSnap = await getDocs(
      query(
        collection(db, 'users', user.uid, 'workbooks', WORKBOOK_ID, 'records'),
        where('ownerId', '==', user.uid)
      )
    );

    const deleteRefs = [...oldChunksSnap.docs, ...oldRecordsSnap.docs].map((d) => d.ref);
    for (let i = 0; i < deleteRefs.length; i += 400) {
      const batch = writeBatch(db);
      deleteRefs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    // Write/Update WorkbookMaster document
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
          : [14, 15, 18, 18, 20, 14, 14, 12, 34, 14],
      templateChunkCount: chunks.length,
      version: nextVersion,
      updatedByDevice: deviceTag.slice(0, 80),
      fileSizeBytes: masterBuffer.byteLength,
      createdAt: existingWb.exists() ? existingWb.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(wbRef, wbPayload);

    // Upload template chunks
    for (let i = 0; i < chunks.length; i += 10) {
      const batch = writeBatch(db);
      chunks.slice(i, i + 10).forEach((chunkData, offset) => {
        const idx = i + offset;
        const cRef = doc(
          db,
          'users',
          user.uid,
          'workbooks',
          WORKBOOK_ID,
          'chunks',
          `chunk_${idx}`
        );
        batch.set(cRef, {
          ownerId: user.uid,
          workbookId: WORKBOOK_ID,
          index: idx,
          data: chunkData,
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }

    // Upload all existing + added records in batches of 400
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
          WORKBOOK_ID,
          'records',
          recId
        );
        batch.set(rRef, {
          ownerId: user.uid,
          workbookId: WORKBOOK_ID,
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

    // Record immutable version entry
    const verRef = doc(
      db,
      'users',
      user.uid,
      'workbooks',
      WORKBOOK_ID,
      'versions',
      `v_${nextVersion}_${Date.now()}`
    );
    await setDoc(verRef, {
      ownerId: user.uid,
      workbookId: WORKBOOK_ID,
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
  newRecords: CallRecord[]
): Promise<number> {
  await ensureUserWorkspace(user);
  const deviceTag = getCurrentDeviceTag();
  const wbPath = `users/${user.uid}/workbooks/${WORKBOOK_ID}`;
  const wbRef = doc(db, 'users', user.uid, 'workbooks', WORKBOOK_ID);

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
          WORKBOOK_ID,
          'records',
          recId
        );
        tx.set(rRef, {
          ownerId: user.uid,
          workbookId: WORKBOOK_ID,
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
        WORKBOOK_ID,
        'versions',
        `v_${nextVer}_${Date.now()}`
      );
      tx.set(verRef, {
        ownerId: user.uid,
        workbookId: WORKBOOK_ID,
        version: nextVer,
        label: `Added ${newRecords.length} record${newRecords.length > 1 ? 's' : ''} (${deviceTag})`.slice(
          0,
          160
        ),
        fileName: String(data.fileName ?? 'Master_Call_Sheet.xlsx').slice(0, 200),
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
  recordIds: string[]
): Promise<number | null> {
  if (recordIds.length === 0) return null;
  await ensureUserWorkspace(user);

  const deviceTag = getCurrentDeviceTag();
  const wbPath = `users/${user.uid}/workbooks/${WORKBOOK_ID}`;
  const wbRef = doc(db, 'users', user.uid, 'workbooks', WORKBOOK_ID);

  try {
    // If deleting more than 400 rows at once, batch-delete the overflow first
    const overflowCount = Math.max(0, recordIds.length - 400);
    if (overflowCount > 0) {
      const overflowIds = recordIds.slice(0, overflowCount);
      for (let i = 0; i < overflowIds.length; i += 400) {
        const batch = writeBatch(db);
        overflowIds.slice(i, i + 400).forEach((rawId) => {
          const recId = sanitizeFirestoreId(rawId, rawId);
          batch.delete(
            doc(db, 'users', user.uid, 'workbooks', WORKBOOK_ID, 'records', recId)
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
          WORKBOOK_ID,
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
        WORKBOOK_ID,
        'versions',
        `v_${nextVer}_${Date.now()}`
      );
      tx.set(verRef, {
        ownerId: user.uid,
        workbookId: WORKBOOK_ID,
        version: nextVer,
        label: `Removed ${recordIds.length} added record${recordIds.length > 1 ? 's' : ''} (${deviceTag})`.slice(
          0,
          160
        ),
        fileName: String(data.fileName ?? 'Master_Call_Sheet.xlsx').slice(0, 200),
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

export async function fetchCloudTemplateBuffer(userId: string): Promise<ArrayBuffer | null> {
  const chunksPath = `users/${userId}/workbooks/${WORKBOOK_ID}/chunks`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'users', userId, 'workbooks', WORKBOOK_ID, 'chunks'),
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
  callbacks: {
    onWorkbook: (snap: CloudWorkbookSnapshot | null) => void;
    onRecords: (records: CallRecord[]) => void;
    onVersions: (versions: CloudVersionEntry[]) => void;
    onError: (err: Error) => void;
  }
): () => void {
  const wbPath = `users/${userId}/workbooks/${WORKBOOK_ID}`;
  const recordsPath = `${wbPath}/records`;
  const versionsPath = `${wbPath}/versions`;

  const unsubWb = onSnapshot(
    doc(db, 'users', userId, 'workbooks', WORKBOOK_ID),
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
      collection(db, 'users', userId, 'workbooks', WORKBOOK_ID, 'records'),
      where('ownerId', '==', userId),
      orderBy('rowIndex', 'asc')
    ),
    (snap) => {
      const rows: CallRecord[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          rowIndex: Number(d.rowIndex),
          date: String(d.date ?? ''),
          serialId: String(d.serialId ?? 'NA'),
          mobileNo: String(d.mobileNo ?? ''),
          category: String(d.category ?? ''),
          subcategory: String(d.subcategory ?? ''),
          status: d.status === 'Unresolved' ? 'Unresolved' : 'Resolved',
          escalations: String(d.escalations ?? 'Level1'),
          channels: String(d.channels ?? 'Calls'),
          remark: String(d.remark ?? ''),
          names: String(d.names ?? 'Mohit'),
          source: d.source === 'master' ? 'master' : 'added',
          createdAt: tsToIso(d.createdAt),
          addedDateKey: String(d.addedDateKey ?? ''),
          deviceTag: String(d.deviceTag ?? ''),
          isDuplicateMobile: Boolean(d.isDuplicateMobile),
          isDuplicateSerial: Boolean(d.isDuplicateSerial),
        };
      });
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
      collection(db, 'users', userId, 'workbooks', WORKBOOK_ID, 'versions'),
      where('ownerId', '==', userId),
      orderBy('version', 'desc')
    ),
    (snap) => {
      const versions: CloudVersionEntry[] = snap.docs.map((docSnap) => {
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
      });
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
