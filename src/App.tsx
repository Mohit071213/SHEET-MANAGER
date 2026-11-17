import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Download,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  PlusCircle,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import {
  AppSection,
  CallRecord,
  LocalVersionSnapshot,
  OperatingMode,
  SyncStatus,
  WorkbookMetadata,
} from './types/callsheet';
import {
  createBlankMasterWorkbook,
  generateUpdatedWorkbook,
  parseMasterWorkbook,
  triggerBlobDownload,
  trimMasterWorkbookRows,
} from './utils/excelEngine';
import {
  clearLocalWorkspace,
  exportWorkspaceBackupJson,
  listLocalSnapshots,
  loadLocalWorkspace,
  saveLocalSnapshot,
  saveLocalWorkspace,
} from './utils/storage';
import {
  appendRecordsToCloudTransaction,
  CloudVersionEntry,
  deleteAddedRecordsFromCloud,
  fetchCloudTemplateBuffer,
  subscribeCloudWorkbook,
  uploadMasterToCloud,
} from './utils/cloudSync';
import { formatTodayDDMMYYYY } from './utils/statusMapper';
import { DashboardView } from './components/DashboardView';
import { AddRecordsView } from './components/AddRecordsView';
import { RecordsHistoryView } from './components/RecordsHistoryView';
import { MasterExcelView } from './components/MasterExcelView';
import { ExportView } from './components/ExportView';
import { SettingsBackupView } from './components/SettingsBackupView';
import { CloudSyncPanel } from './components/CloudSyncPanel';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { useOnlineStatus } from './hooks/useOnlineStatus';

const MODE_STORAGE_KEY = 'callsheet_operating_mode';

const NAV_ITEMS: Array<{
  id: AppSection;
  label: string;
  mobileLabel: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Dashboard', mobileLabel: 'Home', icon: LayoutDashboard },
  { id: 'add', label: 'Add Records', mobileLabel: 'Add', icon: PlusCircle },
  { id: 'history', label: 'Records History', mobileLabel: 'History', icon: History },
  { id: 'master', label: 'Master Excel', mobileLabel: 'Master', icon: FileSpreadsheet },
  { id: 'export', label: 'Download / Export', mobileLabel: 'Export', icon: Download },
  { id: 'settings', label: 'Settings & Backup', mobileLabel: 'Settings', icon: Settings },
];

function extractCategoryMap(records: CallRecord[]): Record<string, string[]> {
  const map: Record<string, Set<string>> = {};
  for (const r of records) {
    if (r.category) {
      if (!map[r.category]) map[r.category] = new Set<string>();
      if (r.subcategory) map[r.category].add(r.subcategory);
    }
  }
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(map)) {
    out[k] = Array.from(v).sort((a, b) => a.localeCompare(b));
  }
  return out;
}

export default function App() {
  const isOnline = useOnlineStatus();
  const [section, setSection] = useState<AppSection>('dashboard');
  const [isHydrating, setIsHydrating] = useState(true);
  const [mode, setMode] = useState<OperatingMode>(() => {
    try {
      const saved = localStorage.getItem(MODE_STORAGE_KEY);
      return saved === 'cloud' ? 'cloud' : 'local';
    } catch {
      return 'local';
    }
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('Local Only');
  const [syncError, setSyncError] = useState<string | null>(null);

  // Firebase Auth & Cloud State
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [cloudVersion, setCloudVersion] = useState<number | null>(null);
  const [cloudUpdatedBy, setCloudUpdatedBy] = useState<string | null>(null);
  const [cloudVersions, setCloudVersions] = useState<CloudVersionEntry[]>([]);
  const cloudWorkbookExistsRef = useRef(false);

  // Local / Active Workbook State
  const [metadata, setMetadata] = useState<WorkbookMetadata | null>(null);
  const [masterBuffer, setMasterBuffer] = useState<ArrayBuffer | null>(null);
  const [backupMetadata, setBackupMetadata] = useState<WorkbookMetadata | null>(null);
  const [backupBuffer, setBackupBuffer] = useState<ArrayBuffer | null>(null);
  const [masterRecords, setMasterRecords] = useState<CallRecord[]>([]);
  const [addedRecords, setAddedRecords] = useState<CallRecord[]>([]);
  const [snapshots, setSnapshots] = useState<LocalVersionSnapshot[]>([]);

  const [isExporting, setIsExporting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  }, []);

  const persistWorkspace = useCallback(
    async (next: {
      metadata: WorkbookMetadata | null;
      masterBuffer: ArrayBuffer | null;
      backupMetadata: WorkbookMetadata | null;
      backupBuffer: ArrayBuffer | null;
      masterRecords: CallRecord[];
      addedRecords: CallRecord[];
    }) => {
      await saveLocalWorkspace(next);
    },
    []
  );

  // Load persisted IndexedDB workspace on startup
  useEffect(() => {
    let active = true;
    (async () => {
      const [saved, snaps] = await Promise.all([
        loadLocalWorkspace(),
        listLocalSnapshots(),
      ]);
      if (!active) return;
      if (saved) {
        setMetadata(saved.metadata);
        setMasterBuffer(saved.masterBuffer);
        setBackupMetadata(saved.backupMetadata);
        setBackupBuffer(saved.backupBuffer);
        setMasterRecords(saved.masterRecords ?? []);
        setAddedRecords(saved.addedRecords ?? []);
      }
      setSnapshots(snaps);
      setIsHydrating(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Listen for Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser && mode === 'cloud') {
        setSyncStatus('Sync Failed');
      }
    });
    return () => unsub();
  }, [mode]);

  // Keep refs to latest local state for cloud hydration callback
  const masterBufferRef = useRef(masterBuffer);
  masterBufferRef.current = masterBuffer;
  const backupMetaRef = useRef(backupMetadata);
  backupMetaRef.current = backupMetadata;
  const backupBufRef = useRef(backupBuffer);
  backupBufRef.current = backupBuffer;
  const cloudMetaRef = useRef<WorkbookMetadata | null>(null);
  const lastFetchedTemplateSizeRef = useRef<number>(0);
  const isCloudUploadingRef = useRef(false);

  // Subscribe to real-time Firestore Cross-Device Sync when Mode 2 + authenticated
  useEffect(() => {
    if (mode !== 'cloud') {
      setSyncStatus('Local Only');
      setSyncError(null);
      cloudWorkbookExistsRef.current = false;
      return;
    }

    if (!isOnline) {
      setSyncStatus('Offline');
      return;
    }

    if (!user) {
      setSyncStatus('Sync Failed');
      setSyncError('Sign in with Google in Settings & Backup to enable Cross-Device Sync.');
      return;
    }

    setSyncStatus('Syncing');
    setSyncError(null);

    const unsub = subscribeCloudWorkbook(user.uid, {
      onWorkbook: async (snap) => {
        if (isCloudUploadingRef.current) return;
        if (!snap) {
          cloudWorkbookExistsRef.current = false;
          setCloudVersion(null);
          setCloudUpdatedBy(null);
          setSyncStatus('Synced');
          return;
        }

        cloudWorkbookExistsRef.current = true;
        cloudMetaRef.current = snap.metadata;
        setCloudVersion(snap.version);
        setCloudUpdatedBy(snap.updatedByDevice);

        // Fetch remote .xlsx template buffer if this device doesn't have it or file changed
        let activeBuf = masterBufferRef.current;
        if (
          snap.templateChunkCount > 0 &&
          (!activeBuf || lastFetchedTemplateSizeRef.current !== snap.metadata.fileSizeBytes)
        ) {
          try {
            const downloadedBuf = await fetchCloudTemplateBuffer(user.uid);
            if (downloadedBuf) {
              activeBuf = downloadedBuf;
              lastFetchedTemplateSizeRef.current = snap.metadata.fileSizeBytes;
              setMasterBuffer(downloadedBuf);
            }
          } catch (err) {
            setSyncError(err instanceof Error ? err.message : 'Failed to fetch workbook template.');
            setSyncStatus('Sync Failed');
          }
        }

        setMetadata((prev) => ({
          ...snap.metadata,
          extractedCategories: prev?.extractedCategories ?? {},
        }));
        setSyncStatus('Synced');
      },
      onRecords: (rows) => {
        if (isCloudUploadingRef.current) return;
        const masterRows = rows.filter((r) => r.source === 'master');
        const addedRows = rows.filter((r) => r.source === 'added');
        const categories = extractCategoryMap(rows);

        setMasterRecords(masterRows);
        setAddedRecords(addedRows);
        setMetadata((prev) => {
          const base = prev ?? cloudMetaRef.current;
          if (!base) return null;
          const nextMeta = { ...base, extractedCategories: categories };
          void persistWorkspace({
            metadata: nextMeta,
            masterBuffer: masterBufferRef.current,
            backupMetadata: backupMetaRef.current,
            backupBuffer: backupBufRef.current,
            masterRecords: masterRows,
            addedRecords: addedRows,
          });
          return nextMeta;
        });
        setSyncStatus('Synced');
      },
      onVersions: (vers) => {
        setCloudVersions(vers);
      },
      onError: (err) => {
        setSyncStatus('Sync Failed');
        setSyncError(err.message);
      },
    });

    return () => unsub();
  }, [mode, user, isOnline, persistWorkspace]);

  const allRecords = useMemo(
    () => [...masterRecords, ...addedRecords],
    [masterRecords, addedRecords]
  );

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setSyncError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      setMode('cloud');
      localStorage.setItem(MODE_STORAGE_KEY, 'cloud');
      showToast('success', 'Signed in with Google for Cross-Device Sync.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setSyncError(msg);
      showToast('error', msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setCloudVersion(null);
    setCloudVersions([]);
    setMode('local');
    localStorage.setItem(MODE_STORAGE_KEY, 'local');
    setSyncStatus('Local Only');
    showToast('success', 'Signed out. Switched back to Local Mode.');
  };

  const handlePushLocalToCloud = async () => {
    if (!user || !metadata || !masterBuffer) return;
    setSyncStatus('Syncing');
    setSyncError(null);
    isCloudUploadingRef.current = true;
    try {
      const ver = await uploadMasterToCloud(
        user,
        metadata,
        masterBuffer,
        masterRecords,
        addedRecords
      );
      cloudWorkbookExistsRef.current = true;
      lastFetchedTemplateSizeRef.current = masterBuffer.byteLength;
      setCloudVersion(ver);
      setSyncStatus('Synced');
      showToast('success', `Synced "${metadata.fileName}" to Cloud (v${ver}).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Cloud upload failed.';
      setSyncError(msg);
      setSyncStatus('Sync Failed');
      showToast('error', msg);
    } finally {
      isCloudUploadingRef.current = false;
    }
  };

  const handleUploadFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseMasterWorkbook(buffer, file.name);

      // Preserve previous loaded workbook as automatic backup before replacing
      const nextBackupMeta = metadata ? { ...metadata } : backupMetadata;
      const nextBackupBuf = masterBuffer ? masterBuffer.slice(0) : backupBuffer;

      setMetadata(parsed.metadata);
      setMasterBuffer(parsed.masterBuffer);
      setBackupMetadata(nextBackupMeta);
      setBackupBuffer(nextBackupBuf);
      setMasterRecords(parsed.records);
      setAddedRecords([]);

      await persistWorkspace({
        metadata: parsed.metadata,
        masterBuffer: parsed.masterBuffer,
        backupMetadata: nextBackupMeta,
        backupBuffer: nextBackupBuf,
        masterRecords: parsed.records,
        addedRecords: [],
      });

      const snap: LocalVersionSnapshot = {
        id: `snap_${Date.now()}`,
        label: `Loaded ${parsed.metadata.fileName}`,
        createdAt: new Date().toISOString(),
        fileName: parsed.metadata.fileName,
        totalRecords: parsed.records.length,
        addedRecordsCount: 0,
        buffer: parsed.masterBuffer,
      };
      await saveLocalSnapshot(snap);
      setSnapshots(await listLocalSnapshots());

      if (mode === 'cloud' && user && isOnline) {
        setSyncStatus('Syncing');
        isCloudUploadingRef.current = true;
        try {
          const ver = await uploadMasterToCloud(
            user,
            parsed.metadata,
            parsed.masterBuffer,
            parsed.records,
            []
          );
          cloudWorkbookExistsRef.current = true;
          lastFetchedTemplateSizeRef.current = parsed.masterBuffer.byteLength;
          setCloudVersion(ver);
          setSyncStatus('Synced');
        } finally {
          isCloudUploadingRef.current = false;
        }
      }

      showToast(
        'success',
        `Loaded "${parsed.metadata.fileName}" (${parsed.records.length} existing records).`
      );
      setSection('add');
    } catch (err) {
      if (mode === 'cloud') setSyncStatus('Sync Failed');
      showToast(
        'error',
        err instanceof Error ? err.message : 'Failed to parse uploaded Excel workbook.'
      );
    }
  };

  const handleCreateBlankTemplate = async () => {
    try {
      const parsed = await createBlankMasterWorkbook();
      const nextBackupMeta = metadata ? { ...metadata } : backupMetadata;
      const nextBackupBuf = masterBuffer ? masterBuffer.slice(0) : backupBuffer;

      setMetadata(parsed.metadata);
      setMasterBuffer(parsed.masterBuffer);
      setBackupMetadata(nextBackupMeta);
      setBackupBuffer(nextBackupBuf);
      setMasterRecords([]);
      setAddedRecords([]);

      await persistWorkspace({
        metadata: parsed.metadata,
        masterBuffer: parsed.masterBuffer,
        backupMetadata: nextBackupMeta,
        backupBuffer: nextBackupBuf,
        masterRecords: [],
        addedRecords: [],
      });

      if (mode === 'cloud' && user && isOnline) {
        setSyncStatus('Syncing');
        isCloudUploadingRef.current = true;
        try {
          const ver = await uploadMasterToCloud(
            user,
            parsed.metadata,
            parsed.masterBuffer,
            [],
            []
          );
          cloudWorkbookExistsRef.current = true;
          lastFetchedTemplateSizeRef.current = parsed.masterBuffer.byteLength;
          setCloudVersion(ver);
          setSyncStatus('Synced');
        } finally {
          isCloudUploadingRef.current = false;
        }
      }

      showToast('success', 'Created a clean 10-column Master Call Sheet.');
      setSection('add');
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Could not create blank template.'
      );
    }
  };

  const handleCommitRecords = async (newRecords: CallRecord[]) => {
    if (!metadata || !masterBuffer) return;
    const nowIso = new Date().toISOString();
    const updatedAdded = [...addedRecords, ...newRecords];

    const updatedCategories = { ...metadata.extractedCategories };
    for (const r of newRecords) {
      if (r.category) {
        const list = new Set(updatedCategories[r.category] ?? []);
        if (r.subcategory) list.add(r.subcategory);
        updatedCategories[r.category] = Array.from(list).sort((a, b) => a.localeCompare(b));
      }
    }

    const updatedMeta: WorkbookMetadata = {
      ...metadata,
      extractedCategories: updatedCategories,
      lastUpdatedAt: nowIso,
    };

    setMetadata(updatedMeta);
    setAddedRecords(updatedAdded);

    await persistWorkspace({
      metadata: updatedMeta,
      masterBuffer,
      backupMetadata,
      backupBuffer,
      masterRecords,
      addedRecords: updatedAdded,
    });

    if (mode === 'cloud' && user) {
      if (!isOnline) {
        setSyncStatus('Offline');
        showToast(
          'error',
          'Saved locally while offline. Reconnect and push to sync with other devices.'
        );
        return;
      }

      setSyncStatus('Syncing');
      setSyncError(null);
      try {
        if (!cloudWorkbookExistsRef.current) {
          isCloudUploadingRef.current = true;
          try {
            const ver = await uploadMasterToCloud(
              user,
              updatedMeta,
              masterBuffer,
              masterRecords,
              updatedAdded
            );
            cloudWorkbookExistsRef.current = true;
            lastFetchedTemplateSizeRef.current = masterBuffer.byteLength;
            setCloudVersion(ver);
          } finally {
            isCloudUploadingRef.current = false;
          }
        } else {
          const ver = await appendRecordsToCloudTransaction(user, newRecords);
          setCloudVersion(ver);
        }
        setSyncStatus('Synced');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Cross-device sync failed.';
        setSyncStatus('Sync Failed');
        setSyncError(msg);
        showToast('error', `Saved locally, but cloud sync failed: ${msg}`);
        return;
      }
    }

    showToast(
      'success',
      `Saved ${newRecords.length} record${newRecords.length > 1 ? 's' : ''}${
        mode === 'cloud' && user ? ' & synced across devices.' : ' locally.'
      }`
    );
  };

  const handleDeleteAddedRecords = async (recordIds: string[]) => {
    if (!metadata || !masterBuffer || recordIds.length === 0) return;
    const removeSet = new Set(recordIds);
    const remaining = addedRecords
      .filter((r) => !removeSet.has(r.id))
      .map((rec, idx) => ({
        ...rec,
        rowIndex: metadata.headerRowIndex + masterRecords.length + idx + 1,
      }));
    const removedCount = addedRecords.length - remaining.length;
    if (removedCount === 0) return;

    const updatedMeta: WorkbookMetadata = {
      ...metadata,
      lastUpdatedAt: new Date().toISOString(),
    };

    setMetadata(updatedMeta);
    setAddedRecords(remaining);

    await persistWorkspace({
      metadata: updatedMeta,
      masterBuffer,
      backupMetadata,
      backupBuffer,
      masterRecords,
      addedRecords: remaining,
    });

    if (mode === 'cloud' && user) {
      if (!isOnline) {
        setSyncStatus('Offline');
        showToast(
          'error',
          `Removed ${removedCount} record(s) locally. Reconnect to sync deletion to cloud.`
        );
        return;
      }
      if (cloudWorkbookExistsRef.current) {
        setSyncStatus('Syncing');
        try {
          const ver = await deleteAddedRecordsFromCloud(user, recordIds);
          if (ver !== null) setCloudVersion(ver);
          setSyncStatus('Synced');
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Cloud deletion failed.';
          setSyncStatus('Sync Failed');
          setSyncError(msg);
          showToast('error', `Removed locally, but cloud sync failed: ${msg}`);
          return;
        }
      }
    }

    showToast(
      'success',
      `Removed ${removedCount} added record${removedCount > 1 ? 's' : ''}. Master workbook intact (${masterRecords.length} rows).`
    );
  };

  const handleRemoveLastAdded = async (count: number) => {
    if (count <= 0 || addedRecords.length === 0) return;
    const toRemove = addedRecords.slice(-count).map((r) => r.id);
    await handleDeleteAddedRecords(toRemove);
  };

  const handleRemoveLastTotalEntries = async (count: number) => {
    const total = masterRecords.length + addedRecords.length;
    const removeN = Math.min(Math.max(0, Math.floor(count)), total);
    if (removeN <= 0) return;

    if (removeN <= addedRecords.length) {
      await handleRemoveLastAdded(removeN);
      return;
    }

    const remainingFromMaster = removeN - addedRecords.length;
    const keepMasterCount = Math.max(0, masterRecords.length - remainingFromMaster);
    await handleTrimMasterToCount(keepMasterCount);
  };

  const handleTrimMasterToCount = async (keepCount: number) => {
    if (!metadata || !masterBuffer) return;
    try {
      const nextBackupMeta = { ...metadata };
      const nextBackupBuf = masterBuffer.slice(0);

      const trimmed = await trimMasterWorkbookRows(masterBuffer, metadata, keepCount);

      setBackupMetadata(nextBackupMeta);
      setBackupBuffer(nextBackupBuf);
      setMetadata(trimmed.metadata);
      setMasterBuffer(trimmed.masterBuffer);
      setMasterRecords(trimmed.records);
      setAddedRecords([]);

      await persistWorkspace({
        metadata: trimmed.metadata,
        masterBuffer: trimmed.masterBuffer,
        backupMetadata: nextBackupMeta,
        backupBuffer: nextBackupBuf,
        masterRecords: trimmed.records,
        addedRecords: [],
      });

      const snap: LocalVersionSnapshot = {
        id: `snap_${Date.now()}`,
        label: `Trimmed master to ${trimmed.records.length} rows`,
        createdAt: new Date().toISOString(),
        fileName: trimmed.metadata.fileName,
        totalRecords: trimmed.records.length,
        addedRecordsCount: 0,
        buffer: trimmed.masterBuffer,
      };
      await saveLocalSnapshot(snap);
      setSnapshots(await listLocalSnapshots());

      if (mode === 'cloud' && user && isOnline) {
        setSyncStatus('Syncing');
        isCloudUploadingRef.current = true;
        try {
          const ver = await uploadMasterToCloud(
            user,
            trimmed.metadata,
            trimmed.masterBuffer,
            trimmed.records,
            []
          );
          cloudWorkbookExistsRef.current = true;
          lastFetchedTemplateSizeRef.current = trimmed.masterBuffer.byteLength;
          setCloudVersion(ver);
          setSyncStatus('Synced');
        } finally {
          isCloudUploadingRef.current = false;
        }
      }

      showToast(
        'success',
        `Master copy kept at ${trimmed.records.length} entries (automatic pre-trim backup saved).`
      );
    } catch (err) {
      if (mode === 'cloud') setSyncStatus('Sync Failed');
      showToast(
        'error',
        err instanceof Error ? err.message : 'Failed to trim master workbook.'
      );
    }
  };

  const handleDownloadUpdatedExcel = async (): Promise<{
    fileName: string;
    totalRows: number;
  } | null> => {
    let activeBuffer = masterBuffer;
    if (!activeBuffer && mode === 'cloud' && user) {
      activeBuffer = await fetchCloudTemplateBuffer(user.uid);
      if (activeBuffer) setMasterBuffer(activeBuffer);
    }

    if (!metadata || !activeBuffer) {
      showToast('error', 'No master workbook loaded.');
      return null;
    }

    setIsExporting(true);
    try {
      const result = await generateUpdatedWorkbook(activeBuffer, metadata, addedRecords);
      triggerBlobDownload(result.blob, result.fileName);

      const snap: LocalVersionSnapshot = {
        id: `snap_${Date.now()}`,
        label: `Exported ${result.fileName}`,
        createdAt: new Date().toISOString(),
        fileName: result.fileName,
        totalRecords: result.totalRows,
        addedRecordsCount: addedRecords.length,
        buffer: result.buffer,
      };
      await saveLocalSnapshot(snap);
      setSnapshots(await listLocalSnapshots());

      showToast(
        'success',
        `Generated & downloaded ${result.fileName} (${result.totalRows} rows).`
      );
      return { fileName: result.fileName, totalRows: result.totalRows };
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Failed to generate updated Excel workbook.'
      );
      return null;
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadBackupExcel = () => {
    if (!backupBuffer) return;
    const blob = new Blob([backupBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const name = backupMetadata?.fileName
      ? `Backup_${backupMetadata.fileName}`
      : `Backup_Master_${formatTodayDDMMYYYY()}.xlsx`;
    triggerBlobDownload(blob, name);
    showToast('success', `Downloaded backup: ${name}`);
  };

  const handleRestoreBackup = async () => {
    if (!backupBuffer || !backupMetadata) return;
    try {
      const parsed = await parseMasterWorkbook(backupBuffer, backupMetadata.fileName);
      setMetadata(parsed.metadata);
      setMasterBuffer(parsed.masterBuffer);
      setMasterRecords(parsed.records);
      setAddedRecords([]);

      await persistWorkspace({
        metadata: parsed.metadata,
        masterBuffer: parsed.masterBuffer,
        backupMetadata,
        backupBuffer,
        masterRecords: parsed.records,
        addedRecords: [],
      });

      if (mode === 'cloud' && user && isOnline) {
        setSyncStatus('Syncing');
        isCloudUploadingRef.current = true;
        try {
          const ver = await uploadMasterToCloud(
            user,
            parsed.metadata,
            parsed.masterBuffer,
            parsed.records,
            []
          );
          cloudWorkbookExistsRef.current = true;
          lastFetchedTemplateSizeRef.current = parsed.masterBuffer.byteLength;
          setCloudVersion(ver);
          setSyncStatus('Synced');
        } finally {
          isCloudUploadingRef.current = false;
        }
      }
      showToast('success', `Restored previous workbook "${parsed.metadata.fileName}".`);
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Could not restore previous backup.'
      );
    }
  };

  const handleExportJsonBackup = () => {
    const blob = exportWorkspaceBackupJson(metadata, masterRecords, addedRecords);
    const filename = `CallSheet_Backup_${formatTodayDDMMYYYY()}.json`;
    triggerBlobDownload(blob, filename);
    showToast('success', `Exported ${filename}`);
  };

  const handleImportJsonBackup = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        metadata?: WorkbookMetadata;
        masterRecords?: CallRecord[];
        addedRecords?: CallRecord[];
      };
      if (!parsed.metadata || !Array.isArray(parsed.masterRecords)) {
        throw new Error('Invalid JSON backup structure.');
      }

      let activeBuf = masterBuffer;
      if (!activeBuf) {
        const blank = await createBlankMasterWorkbook();
        activeBuf = blank.masterBuffer;
      }

      const combinedAll = [
        ...(parsed.masterRecords ?? []),
        ...(parsed.addedRecords ?? []),
      ];

      const nextAdded = activeBuf === masterBuffer ? (parsed.addedRecords ?? []) : combinedAll;
      const nextMaster = activeBuf === masterBuffer ? (parsed.masterRecords ?? []) : [];

      setMetadata(parsed.metadata);
      setMasterBuffer(activeBuf);
      setMasterRecords(nextMaster);
      setAddedRecords(nextAdded);

      await persistWorkspace({
        metadata: parsed.metadata,
        masterBuffer: activeBuf,
        backupMetadata,
        backupBuffer,
        masterRecords: nextMaster,
        addedRecords: nextAdded,
      });

      showToast(
        'success',
        `Restored ${combinedAll.length} records from JSON backup.`
      );
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Failed to restore JSON backup.'
      );
    }
  };

  const handleDownloadSnapshotExcel = (snap: LocalVersionSnapshot) => {
    const blob = new Blob([snap.buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    triggerBlobDownload(blob, snap.fileName);
    showToast('success', `Downloaded snapshot: ${snap.fileName}`);
  };

  const handleRestoreSnapshot = async (snap: LocalVersionSnapshot) => {
    try {
      const parsed = await parseMasterWorkbook(snap.buffer, snap.fileName);
      setMetadata(parsed.metadata);
      setMasterBuffer(parsed.masterBuffer);
      setMasterRecords(parsed.records);
      setAddedRecords([]);

      await persistWorkspace({
        metadata: parsed.metadata,
        masterBuffer: parsed.masterBuffer,
        backupMetadata,
        backupBuffer,
        masterRecords: parsed.records,
        addedRecords: [],
      });

      if (mode === 'cloud' && user && isOnline) {
        setSyncStatus('Syncing');
        isCloudUploadingRef.current = true;
        try {
          const ver = await uploadMasterToCloud(
            user,
            parsed.metadata,
            parsed.masterBuffer,
            parsed.records,
            []
          );
          cloudWorkbookExistsRef.current = true;
          lastFetchedTemplateSizeRef.current = parsed.masterBuffer.byteLength;
          setCloudVersion(ver);
          setSyncStatus('Synced');
        } finally {
          isCloudUploadingRef.current = false;
        }
      }

      showToast('success', `Restored snapshot "${snap.label}".`);
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Failed to restore snapshot.'
      );
    }
  };

  const handleClearLocalData = async () => {
    await clearLocalWorkspace();
    setMetadata(null);
    setMasterBuffer(null);
    setBackupMetadata(null);
    setBackupBuffer(null);
    setMasterRecords([]);
    setAddedRecords([]);
    showToast('success', 'Cleared local browser workspace.');
    setSection('dashboard');
  };

  const handleSwitchMode = (nextMode: OperatingMode) => {
    setMode(nextMode);
    localStorage.setItem(MODE_STORAGE_KEY, nextMode);
    if (nextMode === 'local') {
      setSyncStatus('Local Only');
      setSyncError(null);
    } else if (!user) {
      setSyncStatus('Sync Failed');
    } else {
      setSyncStatus('Syncing');
    }
  };

  const currentNav = NAV_ITEMS.find((n) => n.id === section) ?? NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col lg:flex-row">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#107C41] text-white font-bold text-sm">
            CS
          </div>
          <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            CallSheet Manager
          </span>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#DCFCE7]/70 text-[#166534]'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4 space-y-3">
          <div className="text-xs">
            <div className="font-semibold text-slate-700 truncate">
              {metadata ? metadata.fileName : 'No workbook loaded'}
            </div>
            <div className="mt-0.5 text-slate-500 font-mono tabular-nums">
              {allRecords.length} total · {addedRecords.length} added
            </div>
            {mode === 'cloud' && (
              <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                <Cloud className="h-3.5 w-3.5 text-[#107C41]" />
                <span>{syncStatus}</span>
              </div>
            )}
          </div>
          <PWAInstallButton />
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar (Mobile + Desktop) */}
        <header className="sticky top-0 z-30 flex h-[52px] lg:h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-sm lg:px-8">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-sm font-bold tracking-tight text-slate-900 lg:hidden whitespace-nowrap">
              CallSheet Manager
            </span>
            <span className="hidden lg:inline text-sm font-semibold text-slate-500">
              Workspace / <span className="text-slate-900">{currentNav.label}</span>
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {mode === 'cloud' && (
              <button
                type="button"
                onClick={() => setSection('settings')}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-[#F8FAFC] px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap"
              >
                {syncStatus === 'Syncing' && (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-600" />
                )}
                {syncStatus === 'Synced' && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#166534]" />
                )}
                {(syncStatus === 'Sync Failed' || syncStatus === 'Offline') && (
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                )}
                <span>{syncStatus}</span>
              </button>
            )}

            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => setSection('settings')}
                aria-label="Open Settings and Backup"
                className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                  section === 'settings'
                    ? 'bg-[#DCFCE7] text-[#166534]'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>

            {metadata && (
              <button
                type="button"
                disabled={isExporting}
                onClick={() => void handleDownloadUpdatedExcel()}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-[#107C41] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0B5E31] disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{isExporting ? 'Saving...' : 'Download Excel'}</span>
              </button>
            )}
          </div>
        </header>

        {/* Toast Notification */}
        {toast && (
          <div className="px-4 pt-3 lg:px-8">
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

        {/* Active Page Viewport */}
        <main className="flex-1 px-4 py-5 pb-24 lg:px-8 lg:py-6 lg:pb-10 max-w-7xl w-full mx-auto">
          {isHydrating ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              Loading workspace...
            </div>
          ) : (
            <>
              {section === 'dashboard' && (
                <DashboardView
                  metadata={metadata}
                  masterRecords={masterRecords}
                  addedRecords={addedRecords}
                  onNavigate={setSection}
                  onQuickUploadFile={handleUploadFile}
                  onCreateBlankTemplate={handleCreateBlankTemplate}
                  onQuickDownload={async () => {
                    await handleDownloadUpdatedExcel();
                  }}
                  isExporting={isExporting}
                />
              )}

              {section === 'add' && (
                <AddRecordsView
                  metadata={metadata}
                  existingRecords={allRecords}
                  onCommitRecords={handleCommitRecords}
                  onDownloadUpdatedExcel={async () => {
                    await handleDownloadUpdatedExcel();
                  }}
                  isExporting={isExporting}
                  onGoToMaster={() => setSection('master')}
                />
              )}

              {section === 'history' && (
                <RecordsHistoryView
                  masterRecords={masterRecords}
                  addedRecords={addedRecords}
                  onDeleteAddedRecord={(id) => void handleDeleteAddedRecords([id])}
                  onRemoveLastFromTotal={handleRemoveLastTotalEntries}
                  onRemoveLastAdded={handleRemoveLastAdded}
                  onClearAllAdded={() =>
                    handleDeleteAddedRecords(addedRecords.map((r) => r.id))
                  }
                />
              )}

              {section === 'master' && (
                <MasterExcelView
                  metadata={metadata}
                  addedCount={addedRecords.length}
                  backupMetadata={backupMetadata}
                  hasBackupBuffer={Boolean(backupBuffer)}
                  onUploadFile={handleUploadFile}
                  onCreateBlankTemplate={handleCreateBlankTemplate}
                  onDownloadBackupExcel={handleDownloadBackupExcel}
                  onRestoreBackup={handleRestoreBackup}
                  onTrimMasterToCount={handleTrimMasterToCount}
                />
              )}

              {section === 'export' && (
                <ExportView
                  metadata={metadata}
                  masterRecords={masterRecords}
                  addedRecords={addedRecords}
                  onDownloadUpdatedExcel={handleDownloadUpdatedExcel}
                  isExporting={isExporting}
                  onGoToMaster={() => setSection('master')}
                  onGoToAddRecords={() => setSection('add')}
                  onRemoveLastFromTotal={handleRemoveLastTotalEntries}
                  onRemoveLastAdded={handleRemoveLastAdded}
                  onClearAllAdded={() =>
                    handleDeleteAddedRecords(addedRecords.map((r) => r.id))
                  }
                />
              )}

              {section === 'settings' && (
                <SettingsBackupView
                  mode={mode}
                  syncStatus={syncStatus}
                  metadata={metadata}
                  snapshots={snapshots}
                  onSwitchMode={handleSwitchMode}
                  onExportJsonBackup={handleExportJsonBackup}
                  onImportJsonBackup={handleImportJsonBackup}
                  onDownloadSnapshotExcel={handleDownloadSnapshotExcel}
                  onRestoreSnapshot={handleRestoreSnapshot}
                  onClearLocalData={handleClearLocalData}
                  cloudSectionSlot={
                    mode === 'cloud' ? (
                      <CloudSyncPanel
                        user={user}
                        authLoading={authLoading}
                        syncStatus={syncStatus}
                        syncError={syncError}
                        cloudVersion={cloudVersion}
                        cloudUpdatedBy={cloudUpdatedBy}
                        versions={cloudVersions}
                        hasLocalWorkbook={Boolean(metadata && masterBuffer)}
                        localMetadata={metadata}
                        onGoogleSignIn={handleGoogleSignIn}
                        onSignOut={handleSignOut}
                        onPushLocalToCloud={handlePushLocalToCloud}
                        onDownloadSyncedExcel={async () => {
                          await handleDownloadUpdatedExcel();
                        }}
                      />
                    ) : null
                  }
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Mobile Fixed Bottom Thumb Navigation (<= 15% combined sticky height) */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed bottom-0 left-0 right-0 z-30 grid h-16 grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur-md lg:hidden"
      >
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors ${
                active ? 'text-[#107C41]' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{item.mobileLabel}</span>
            </button>
          );
        })}
      </nav>

      <OfflineIndicator />
    </div>
  );
}
