import React, { useState } from 'react';
import {
  Cloud,
  Download,
  HardDrive,
  RotateCcw,
  Shield,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  LocalVersionSnapshot,
  OperatingMode,
  SyncStatus,
  WorkbookMetadata,
} from '../types/callsheet';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsBackupViewProps {
  mode: OperatingMode;
  syncStatus: SyncStatus;
  metadata: WorkbookMetadata | null;
  snapshots: LocalVersionSnapshot[];
  onSwitchMode: (mode: OperatingMode) => void;
  onExportJsonBackup: () => void;
  onImportJsonBackup: (file: File) => Promise<void>;
  onDownloadSnapshotExcel: (snapshot: LocalVersionSnapshot) => void;
  onRestoreSnapshot: (snapshot: LocalVersionSnapshot) => Promise<void>;
  onClearLocalData: () => Promise<void>;
  cloudSectionSlot?: React.ReactNode;
}

export const SettingsBackupView: React.FC<SettingsBackupViewProps> = ({
  mode,
  syncStatus,
  metadata,
  snapshots,
  onSwitchMode,
  onExportJsonBackup,
  onImportJsonBackup,
  onDownloadSnapshotExcel,
  onRestoreSnapshot,
  onClearLocalData,
  cloudSectionSlot,
}) => {
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Settings & Backup</h1>
        <p className="text-xs text-slate-500">
          Manage storage mode, offline backups, version history, and PWA installation.
        </p>
      </div>

      {/* Operating Mode Switcher */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Operating Mode</h2>
            <p className="text-xs text-slate-500">
              Local Mode stores workbooks strictly in this browser. Cross-Device Mode syncs privately across your phone and PC.
            </p>
          </div>
          <span className="font-mono text-xs font-semibold text-slate-700">
            Status: {syncStatus}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onSwitchMode('local')}
            className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
              mode === 'local'
                ? 'border-[#107C41] bg-[#DCFCE7]/25'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <HardDrive className="mt-0.5 h-5 w-5 text-[#107C41] shrink-0" />
            <div>
              <div className="text-sm font-bold text-slate-900">Mode 1 — Local Mode</div>
              <p className="mt-1 text-xs text-slate-600">
                100% browser-based IndexedDB storage. Zero account required, works offline, specific to this browser & device.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSwitchMode('cloud')}
            className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
              mode === 'cloud'
                ? 'border-[#107C41] bg-[#DCFCE7]/25'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <Cloud className="mt-0.5 h-5 w-5 text-[#107C41] shrink-0" />
            <div>
              <div className="text-sm font-bold text-slate-900">
                Mode 2 — Cross-Device Sync
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Private Google-authenticated sync between phone and PC with conflict protection and version history.
              </p>
            </div>
          </button>
        </div>

        {cloudSectionSlot}
      </div>

      {/* Backup & Restore */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-start gap-2.5">
          <Shield className="mt-0.5 h-4 w-4 text-[#107C41] shrink-0" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Data Backup & Restore
            </h2>
            <p className="text-xs text-slate-500">
              Local data is stored inside IndexedDB on this device. Export a backup before clearing browser storage or switching browsers.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={!metadata}
            onClick={onExportJsonBackup}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export JSON Backup</span>
          </button>

          <label className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50">
            <Upload className="h-3.5 w-3.5" />
            <span>Restore JSON Backup</span>
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void onImportJsonBackup(file);
                  e.target.value = '';
                }
              }}
            />
          </label>
        </div>

        {/* Version Snapshot History */}
        {snapshots.length > 0 && (
          <div className="border-t border-slate-200 pt-4 space-y-2">
            <div className="text-xs font-semibold text-slate-700">
              Local Workbook Snapshots ({snapshots.length})
            </div>
            <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
              {snapshots.slice(0, 6).map((snap) => (
                <div
                  key={snap.id}
                  className="flex flex-col gap-2 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{snap.label}</div>
                    <div className="text-slate-500 font-mono tabular-nums">
                      {new Date(snap.createdAt).toLocaleString()} · {snap.totalRecords} rows
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onDownloadSnapshotExcel(snap)}
                      className="inline-flex min-h-[34px] items-center gap-1 rounded border border-slate-300 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Download className="h-3 w-3" />
                      <span>.xlsx</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void onRestoreSnapshot(snap)}
                      className="inline-flex min-h-[34px] items-center gap-1 rounded border border-slate-300 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Restore</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* PWA Install & Mobile Instructions */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Install App on Phone or PC (PWA)
            </h2>
            <p className="text-xs text-slate-500">
              Works offline after loading. Free static hosting compatible with Vercel, Netlify, GitHub Pages, or Cloudflare Pages.
            </p>
          </div>
          <PWAInstallButton variant="full" />
        </div>
      </div>

      {/* Danger Zone: Clear Local Storage */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        {!confirmClear ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-bold text-slate-900">Reset Local Workspace</div>
              <div className="text-xs text-slate-500">
                Clears the currently loaded workbook and unsaved local additions from this browser.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-red-200 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear Local Data</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold text-red-800">
              Are you sure? Export your updated Excel or JSON backup first before clearing.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmClear(false);
                  void onClearLocalData();
                }}
                className="min-h-[38px] rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                Confirm Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
