import React, { useState } from 'react';
import {
  Cloud,
  Download,
  HardDrive,
  Lock,
  RotateCcw,
  Shield,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
} from 'lucide-react';
import {
  DATA_RETENTION_DAYS,
  EmployeeId,
  EmployeeName,
  GlobalEntryDefaults,
  LocalAiConfig,
  LocalVersionSnapshot,
  OperatingMode,
  SyncStatus,
  WorkbookMetadata,
} from '../types/callsheet';
import {
  loadLocalAiConfig,
  saveLocalAiConfig,
  testOllamaConnection,
} from '../utils/aiRemarkEngine';
import { formatExpiryDateDDMMYYYY, getRetentionDaysRemaining } from '../utils/retention';
import { hasEmployeePin, removeEmployeePin, setEmployeePin } from '../utils/workspaceAuth';
import { GlobalEntryDefaultsCard } from './GlobalEntryDefaultsCard';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsBackupViewProps {
  employeeName: EmployeeName;
  employeeId: EmployeeId;
  mode: OperatingMode;
  syncStatus: SyncStatus;
  metadata: WorkbookMetadata | null;
  snapshots: LocalVersionSnapshot[];
  globalDefaults: GlobalEntryDefaults;
  onSaveGlobalDefaults: (next: GlobalEntryDefaults) => Promise<void>;
  onLockAndSwitchUser: () => void;
  onSwitchMode: (mode: OperatingMode) => void;
  onExportJsonBackup: () => void;
  onImportJsonBackup: (file: File) => Promise<void>;
  onDownloadSnapshotExcel: (snapshot: LocalVersionSnapshot) => void;
  onRestoreSnapshot: (snapshot: LocalVersionSnapshot) => Promise<void>;
  onClearLocalData: () => Promise<void>;
  cloudSectionSlot?: React.ReactNode;
}

export const SettingsBackupView: React.FC<SettingsBackupViewProps> = ({
  employeeName,
  employeeId,
  mode,
  syncStatus,
  metadata,
  snapshots,
  globalDefaults,
  onSaveGlobalDefaults,
  onLockAndSwitchUser,
  onSwitchMode,
  onExportJsonBackup,
  onImportJsonBackup,
  onDownloadSnapshotExcel,
  onRestoreSnapshot,
  onClearLocalData,
  cloudSectionSlot,
}) => {
  const [confirmClear, setConfirmClear] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(() => hasEmployeePin(employeeId));
  const [newPin, setNewPin] = useState('');
  const [pinMsg, setPinMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [aiConfig, setAiConfig] = useState<LocalAiConfig>(() => loadLocalAiConfig());
  const [aiStatusMsg, setAiStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [isTestingOllama, setIsTestingOllama] = useState(false);

  const handleSaveAiSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const saved = saveLocalAiConfig(aiConfig);
    setAiConfig(saved);
    setAiStatusMsg({
      type: 'ok',
      text: saved.enabled
        ? `Saved. Local Ollama (${saved.modelName}) enabled for ambiguous remarks with PII stripped.`
        : 'Saved. Using 100% On-Device Semantic AI + Shortcut Dictionary (0 network calls).',
    });
  };

  const handleTestOllama = async () => {
    setIsTestingOllama(true);
    setAiStatusMsg(null);
    try {
      const res = await testOllamaConnection(aiConfig.endpointUrl, aiConfig.modelName);
      setAiStatusMsg({
        type: res.ok ? 'ok' : 'err',
        text: res.message,
      });
    } finally {
      setIsTestingOllama(false);
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinMsg(null);
    try {
      await setEmployeePin(employeeId, newPin);
      setPinEnabled(true);
      setNewPin('');
      setPinMsg({
        type: 'ok',
        text: `Account PIN set for ${employeeName}. Re-opening this card will require this PIN.`,
      });
    } catch (err) {
      setPinMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Could not set PIN.',
      });
    }
  };

  const handleRemovePin = () => {
    removeEmployeePin(employeeId);
    setPinEnabled(false);
    setPinMsg({
      type: 'ok',
      text: `Account PIN removed for ${employeeName}.`,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          Settings, Global Defaults &amp; Backup ({employeeName})
        </h1>
        <p className="text-xs text-slate-500">
          Manage team-wide Global Entry Defaults, account PIN lock, Google Cloud Sync, {DATA_RETENTION_DAYS}-day rolling snapshots, and backups.
        </p>
      </div>

      {/* Shared Global Entry Defaults across All 4 Employees */}
      <GlobalEntryDefaultsCard
        variant="full"
        defaults={globalDefaults}
        onSaveDefaults={onSaveGlobalDefaults}
      />

      {/* Workspace Passcode Lock */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            {pinEnabled ? (
              <Lock className="mt-0.5 h-4 w-4 text-[#107C41] shrink-0" />
            ) : (
              <Unlock className="mt-0.5 h-4 w-4 text-slate-500 shrink-0" />
            )}
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {employeeName} Account PIN Protection
              </h2>
              <p className="text-xs text-slate-500">
                Protect {employeeName}&apos;s workspace card with a SHA-256 hashed PIN on this device, and use Google Sign-In below to save data securely to your account.
              </p>
            </div>
          </div>

          <span className="font-mono text-xs font-semibold text-slate-700 shrink-0">
            {pinEnabled ? 'PIN Active' : 'No PIN'}
          </span>
        </div>

        <form onSubmit={(e) => void handleSavePin(e)} className="flex flex-wrap items-center gap-2.5">
          <input
            type="password"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            placeholder={pinEnabled ? 'Enter new PIN (4-16 chars)' : 'Set PIN (4-16 chars)'}
            className="min-h-[42px] w-56 rounded-xl border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 focus:border-[#107C41] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!newPin.trim()}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#107C41] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B5E31] disabled:opacity-50 whitespace-nowrap"
          >
            <Lock className="h-3.5 w-3.5" />
            <span>{pinEnabled ? 'Update PIN' : 'Enable PIN Lock'}</span>
          </button>

          {pinEnabled && (
            <>
              <button
                type="button"
                onClick={onLockAndSwitchUser}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Lock className="h-3.5 w-3.5 text-[#107C41]" />
                <span>Lock &amp; Switch Account</span>
              </button>
              <button
                type="button"
                onClick={handleRemovePin}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Unlock className="h-3.5 w-3.5" />
                <span>Remove PIN</span>
              </button>
            </>
          )}
        </form>

        {pinMsg && (
          <div
            className={`rounded-lg px-3 py-2 text-xs font-semibold ${
              pinMsg.type === 'ok'
                ? 'border border-[#107C41]/30 bg-[#DCFCE7]/50 text-[#166534]'
                : 'border border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {pinMsg.text}
          </div>
        )}
      </div>

      {/* Operating Mode Switcher */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Account Storage &amp; Sync Mode</h2>
            <p className="text-xs text-slate-500">
              Local Mode keeps {employeeName}&apos;s uploaded sheet in this browser for {DATA_RETENTION_DAYS} days. Cloud Account Sync saves isolated workbooks ({employeeId}_master) and Global Defaults under your signed-in Google account for {DATA_RETENTION_DAYS} days.
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
              <div className="text-sm font-bold text-slate-900">Mode 1 — Local Device</div>
              <p className="mt-1 text-xs text-slate-600">
                Browser-based IndexedDB storage with automatic {DATA_RETENTION_DAYS}-day expiry, isolated for {employeeName}.
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
                Mode 2 — Cloud Account Sync
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Google-authenticated cloud persistence saving {employeeName}&apos;s sheet and Global Defaults across phone &amp; PC ({DATA_RETENTION_DAYS}-day retention).
              </p>
            </div>
          </button>
        </div>

        {cloudSectionSlot}
      </div>

      {/* Free Hybrid AI & Local Ollama Privacy */}
      <form
        onSubmit={handleSaveAiSettings}
        className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Sparkles className="mt-0.5 h-4 w-4 text-[#107C41] shrink-0" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Free Hybrid AI Remark Engine &amp; Privacy
              </h2>
              <p className="text-xs text-slate-500">
                On-Device Semantic AI + Shortcut Dictionary always run free locally in your browser with zero paid API keys. Optionally connect a local Ollama instance on your PC for ambiguous phrases. Mobile numbers and Serial IDs are automatically stripped before any AI prompt.
              </p>
            </div>
          </div>
          <span className="font-mono text-xs font-semibold text-[#166534] shrink-0">
            Zero Paid APIs
          </span>
        </div>

        <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-800 cursor-pointer">
          <input
            type="checkbox"
            checked={aiConfig.enabled}
            onChange={(e) =>
              setAiConfig((prev) => ({ ...prev, enabled: e.target.checked }))
            }
            className="h-4 w-4 accent-[#107C41]"
          />
          <span>
            Enable Optional Local Ollama Enhancement for Unmatched Remarks (falls back automatically to On-Device AI)
          </span>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Ollama Endpoint URL
            </label>
            <input
              type="url"
              value={aiConfig.endpointUrl}
              onChange={(e) =>
                setAiConfig((prev) => ({ ...prev, endpointUrl: e.target.value }))
              }
              placeholder="http://localhost:11434"
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 focus:border-[#107C41] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Ollama Model Name
            </label>
            <input
              type="text"
              value={aiConfig.modelName}
              onChange={(e) =>
                setAiConfig((prev) => ({ ...prev, modelName: e.target.value }))
              }
              placeholder="llama3.2:3b"
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 focus:border-[#107C41] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="submit"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#107C41] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B5E31] whitespace-nowrap"
          >
            <span>Save AI Settings</span>
          </button>
          <button
            type="button"
            disabled={isTestingOllama}
            onClick={() => void handleTestOllama()}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap"
          >
            <span>{isTestingOllama ? 'Testing...' : 'Test Ollama Connection'}</span>
          </button>
          <span className="text-[11px] text-slate-500">
            Desktop CLI setup: <span className="font-mono">OLLAMA_ORIGINS=&quot;*&quot; ollama serve</span>
          </span>
        </div>

        {aiStatusMsg && (
          <div
            className={`rounded-lg px-3 py-2 text-xs font-semibold ${
              aiStatusMsg.type === 'ok'
                ? 'border border-[#107C41]/30 bg-[#DCFCE7]/50 text-[#166534]'
                : 'border border-amber-300 bg-amber-50 text-amber-900'
            }`}
          >
            {aiStatusMsg.text}
          </div>
        )}
      </form>

      {/* Backup & 7-Day Retention */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-start gap-2.5">
          <Shield className="mt-0.5 h-4 w-4 text-[#107C41] shrink-0" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {DATA_RETENTION_DAYS}-Day Retention &amp; Local Snapshots ({employeeName})
            </h2>
            <p className="text-xs text-slate-500">
              All calling records, uploaded sheets, and local snapshots older than {DATA_RETENTION_DAYS} days are automatically deleted. Download an Excel or JSON backup anytime before expiry.
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

        {snapshots.length > 0 && (
          <div className="border-t border-slate-200 pt-4 space-y-2">
            <div className="text-xs font-semibold text-slate-700">
              Active Snapshots ({snapshots.length} · auto-purged after {DATA_RETENTION_DAYS} days)
            </div>
            <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
              {snapshots.slice(0, 6).map((snap) => {
                const daysLeft = getRetentionDaysRemaining(snap.createdAt);
                const expDate = formatExpiryDateDDMMYYYY(snap.createdAt);
                return (
                  <div
                    key={snap.id}
                    className="flex flex-col gap-2 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{snap.label}</div>
                      <div className="text-slate-500 font-mono tabular-nums">
                        {new Date(snap.createdAt).toLocaleString()} · {snap.totalRecords} rows · expires {expDate} ({daysLeft}d left)
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
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* PWA Install */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Install App on Phone or PC (PWA)
            </h2>
            <p className="text-xs text-slate-500">
              Works offline after loading. Static hosting compatible with Cloudflare Pages, Vercel, Netlify, or GitHub Pages.
            </p>
          </div>
          <PWAInstallButton variant="full" />
        </div>
      </div>

      {/* Reset Local Workspace */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        {!confirmClear ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-bold text-slate-900">
                Reset {employeeName}&apos;s Local Workspace
              </div>
              <div className="text-xs text-slate-500">
                Clears only {employeeName}&apos;s uploaded sheet and entries from this browser. Other employees remain untouched.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-red-200 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear {employeeName} Data</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold text-red-800">
              Are you sure? Export {employeeName}&apos;s updated Excel or JSON backup first before clearing.
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
