import React from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Download,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { SyncStatus, WorkbookMetadata } from '../types/callsheet';
import { CloudVersionEntry } from '../utils/cloudSync';

interface CloudSyncPanelProps {
  user: User | null;
  authLoading: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  cloudVersion: number | null;
  cloudUpdatedBy: string | null;
  versions: CloudVersionEntry[];
  hasLocalWorkbook: boolean;
  localMetadata: WorkbookMetadata | null;
  onGoogleSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onPushLocalToCloud: () => Promise<void>;
  onDownloadSyncedExcel: () => Promise<void>;
}

export const CloudSyncPanel: React.FC<CloudSyncPanelProps> = ({
  user,
  authLoading,
  syncStatus,
  syncError,
  cloudVersion,
  cloudUpdatedBy,
  versions,
  hasLocalWorkbook,
  localMetadata,
  onGoogleSignIn,
  onSignOut,
  onPushLocalToCloud,
  onDownloadSyncedExcel,
}) => {
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-[#F8FAFC] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-bold text-slate-900">
            Cross-Device Sync Account (Firebase Free Spark Tier)
          </div>
          <p className="text-xs text-slate-600">
            Sign in with the same Google account on your phone and PC. Customer records are stored privately under your account only.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {syncStatus === 'Synced' && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#166534]">
              <CheckCircle2 className="h-4 w-4" />
              Synced
            </span>
          )}
          {syncStatus === 'Syncing' && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Syncing
            </span>
          )}
          {syncStatus === 'Sync Failed' && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
              <AlertTriangle className="h-4 w-4" />
              Sync Failed
            </span>
          )}
        </div>
      </div>

      {syncError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {syncError}
        </div>
      )}

      {!user ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-slate-200 pt-3">
          <div className="text-xs text-slate-600">
            Not signed in. Sign in with Google to sync Phone ↔ PC automatically.
          </div>
          <button
            type="button"
            disabled={authLoading}
            onClick={() => void onGoogleSignIn()}
            className="inline-flex min-h-[44px] items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 shadow-xs transition-colors hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap"
          >
            <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
            <span>{authLoading ? 'Signing in...' : 'Sign in with Google'}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4 border-t border-slate-200 pt-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs">
              <div className="font-semibold text-slate-900">
                Signed in as {user.email}
              </div>
              <div className="mt-0.5 text-slate-500 font-mono tabular-nums">
                {cloudVersion
                  ? `Cloud Version v${cloudVersion} · Last updated by ${cloudUpdatedBy || 'device'}`
                  : 'No workbook uploaded to cloud yet'}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {hasLocalWorkbook && (
                <button
                  type="button"
                  onClick={() => void onPushLocalToCloud()}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#107C41] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0B5E31]"
                >
                  <CloudUpload className="h-3.5 w-3.5" />
                  <span>
                    Sync "{localMetadata?.fileName ?? 'Local Workbook'}" to Cloud
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => void onSignOut()}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>

          {/* Cloud Version History */}
          {versions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  Cloud Sync Version History ({versions.length})
                </span>
                <button
                  type="button"
                  onClick={() => void onDownloadSyncedExcel()}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#107C41] hover:underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Latest Synced .xlsx</span>
                </button>
              </div>

              <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white max-h-56 overflow-y-auto">
                {versions.slice(0, 10).map((ver) => (
                  <div
                    key={ver.id}
                    className="flex flex-col gap-1 px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <span className="font-mono font-bold text-slate-900">
                        v{ver.version}
                      </span>{' '}
                      <span className="font-medium text-slate-800">{ver.label}</span>
                      <div className="text-[11px] text-slate-500">
                        {ver.deviceTag} · {new Date(ver.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="font-mono text-[11px] text-slate-600 tabular-nums">
                      {ver.totalRecords} total rows
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Honest Free-Tier Limits Disclosure */}
      <div className="border-t border-slate-200 pt-3 text-[11px] text-slate-500 space-y-1">
        <div className="font-semibold text-slate-600">
          Free-Tier Sync Limits & Security Disclosure
        </div>
        <p>
          Cloud Sync uses Firebase Spark free tier (50,000 reads/day, 20,000 writes/day, 1 GiB total storage). Your master workbook and customer rows are protected by owner-only Firestore rules so only your signed-in Google account can read or update them. Simultaneous phone/PC submissions use atomic transactions to prevent overwriting each other.
        </p>
      </div>
    </div>
  );
};
