import React, { useState } from 'react';
import { User } from 'firebase/auth';
import {
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  KeyRound,
  Lock,
  LogOut,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { DATA_RETENTION_DAYS, EMPLOYEES, EmployeeId, EmployeeName } from '../types/callsheet';
import { EmployeeWorkspacePreview } from '../utils/storage';
import {
  hasEmployeePin,
  isEmployeeUnlockedInSession,
  lockEmployeeInSession,
  setEmployeePin,
  verifyEmployeePin,
} from '../utils/workspaceAuth';

interface EmployeeSelectorScreenProps {
  onSelectEmployee: (name: EmployeeName) => void;
  user: User | null;
  authLoading: boolean;
  onGoogleSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  previews: Record<EmployeeId, EmployeeWorkspacePreview> | null;
}

export const EmployeeSelectorScreen: React.FC<EmployeeSelectorScreenProps> = ({
  onSelectEmployee,
  user,
  authLoading,
  onGoogleSignIn,
  onSignOut,
  previews,
}) => {
  const [pinTarget, setPinTarget] = useState<{
    name: EmployeeName;
    id: EmployeeId;
    sheetLabel: string;
    mode: 'verify' | 'setup';
  } | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [, setRefreshTick] = useState(0);

  const handleCardClick = (emp: (typeof EMPLOYEES)[number]) => {
    setPinError(null);
    setPinInput('');
    setConfirmPinInput('');

    const hasPin = hasEmployeePin(emp.id);
    if (hasPin && !isEmployeeUnlockedInSession(emp.id)) {
      setPinTarget({
        name: emp.name,
        id: emp.id,
        sheetLabel: emp.sheetLabel,
        mode: 'verify',
      });
      return;
    }

    if (!hasPin) {
      setPinTarget({
        name: emp.name,
        id: emp.id,
        sheetLabel: emp.sheetLabel,
        mode: 'setup',
      });
      return;
    }

    onSelectEmployee(emp.name);
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinTarget) return;
    setVerifying(true);
    setPinError(null);

    try {
      if (pinTarget.mode === 'verify') {
        const ok = await verifyEmployeePin(pinTarget.id, pinInput);
        if (!ok) {
          setPinError('Incorrect account PIN. Please try again.');
          return;
        }
        onSelectEmployee(pinTarget.name);
      } else {
        const trimmed = pinInput.trim();
        if (trimmed.length < 4 || trimmed.length > 16) {
          setPinError('PIN must be between 4 and 16 characters.');
          return;
        }
        if (trimmed !== confirmPinInput.trim()) {
          setPinError('PINs do not match. Re-enter the same PIN.');
          return;
        }
        await setEmployeePin(pinTarget.id, trimmed);
        onSelectEmployee(pinTarget.name);
      }
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'PIN action failed.');
    } finally {
      setVerifying(false);
    }
  };

  const handleLockCard = (e: React.MouseEvent, empId: EmployeeId) => {
    e.stopPropagation();
    lockEmployeeInSession(empId);
    setRefreshTick((t) => t + 1);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[#107C41] text-white font-bold text-base">
            CS
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            CallSheet Manager
          </h1>
          <p className="mx-auto max-w-2xl text-sm text-slate-600">
            Sign in with your account to save workbooks across devices for {DATA_RETENTION_DAYS} days, then select your employee account and PIN below. Each employee uploads their own sheet.
          </p>
        </div>

        {/* Upfront Cloud Account Sign-In Bar */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {user ? (
            <>
              <div className="flex items-start gap-2.5 min-w-0">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-[#166534] shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">
                    Signed in as {user.email}
                  </div>
                  <div className="text-xs text-slate-500">
                    Cloud save active · Separate workspaces for Bhaskar, Mohit, Dishant &amp; Vishal · {DATA_RETENTION_DAYS}-day auto-retention
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void onSignOut()}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </button>
            </>
          ) : (
            <>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900">
                  Account Login for Cloud Save ({DATA_RETENTION_DAYS}-Day Retention)
                </div>
                <p className="text-xs text-slate-500">
                  Sign in with Google so each employee&apos;s uploaded sheet, entries, and shared Global Defaults stay saved to your account.
                </p>
              </div>
              <button
                type="button"
                disabled={authLoading}
                onClick={() => void onGoogleSignIn()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2.5 rounded-xl bg-[#107C41] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0B5E31] disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                <span>{authLoading ? 'Signing in...' : 'Sign in with Google'}</span>
              </button>
            </>
          )}
        </div>

        {/* 4 Independent Employee Account Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {EMPLOYEES.map((emp, index) => {
            const hasPin = hasEmployeePin(emp.id);
            const unlocked = isEmployeeUnlockedInSession(emp.id);
            const locked = hasPin && !unlocked;
            const preview = previews?.[emp.id];

            return (
              <button
                key={emp.id}
                type="button"
                onClick={() => handleCardClick(emp)}
                className="group flex min-h-[136px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left transition-all hover:border-[#107C41] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#107C41]/30"
              >
                <div className="flex items-start justify-between gap-3 w-full">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#DCFCE7]/70 text-[#166534] font-bold text-base shrink-0">
                      {emp.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-mono font-medium text-slate-500">
                        ACCOUNT 0{index + 1}
                      </div>
                      <h2 className="text-lg font-bold text-slate-900 group-hover:text-[#107C41]">
                        {emp.name}
                      </h2>
                    </div>
                  </div>

                  {locked ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 shrink-0">
                      <Lock className="h-3.5 w-3.5" />
                      PIN Locked
                    </span>
                  ) : hasPin ? (
                    <span className="inline-flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#166534]">
                        <UserCheck className="h-3.5 w-3.5" />
                        Unlocked
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => handleLockCard(e, emp.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            lockEmployeeInSession(emp.id);
                            setRefreshTick((t) => t + 1);
                          }
                        }}
                        className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                      >
                        Lock
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 shrink-0">
                      <KeyRound className="h-3.5 w-3.5" />
                      Set PIN
                    </span>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs w-full">
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-600 min-w-0 truncate">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-[#107C41] shrink-0" />
                    <span className="truncate font-mono tabular-nums">
                      {preview?.hasSheet
                        ? `${preview.fileName} · ${preview.totalRecords} rows · ${preview.daysRemaining}d left`
                        : 'No sheet uploaded yet'}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-[#107C41] whitespace-nowrap shrink-0">
                    <span>{locked ? 'Unlock' : !hasPin ? 'Setup / Open' : 'Open'}</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Inline PIN Verification OR First-Time PIN Setup Panel */}
        {pinTarget && (
          <form
            onSubmit={(e) => void handlePinSubmit(e)}
            className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs"
          >
            <div className="flex items-center gap-2.5">
              {pinTarget.mode === 'verify' ? (
                <Lock className="h-4 w-4 text-[#107C41]" />
              ) : (
                <KeyRound className="h-4 w-4 text-[#107C41]" />
              )}
              <div>
                <div className="text-sm font-bold text-slate-900">
                  {pinTarget.mode === 'verify'
                    ? `Unlock ${pinTarget.name}'s Account`
                    : `Set PIN for ${pinTarget.name}'s Account`}
                </div>
                <div className="text-xs text-slate-500">
                  {pinTarget.mode === 'verify'
                    ? pinTarget.sheetLabel
                    : 'Create a 4–16 digit PIN to lock this employee account.'}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  {pinTarget.mode === 'verify' ? 'Enter Account PIN' : 'New Account PIN (4–16 chars)'}
                </label>
                <input
                  type="password"
                  autoFocus
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Enter PIN"
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-sm text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/20"
                />
              </div>

              {pinTarget.mode === 'setup' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Confirm PIN
                  </label>
                  <input
                    type="password"
                    value={confirmPinInput}
                    onChange={(e) => setConfirmPinInput(e.target.value)}
                    placeholder="Re-enter PIN"
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-sm text-slate-900 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/20"
                  />
                </div>
              )}

              {pinError && (
                <p className="text-xs font-semibold text-red-700">{pinError}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {pinTarget.mode === 'setup' ? (
                <button
                  type="button"
                  onClick={() => onSelectEmployee(pinTarget.name)}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 hover:underline"
                >
                  Open without PIN
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPinTarget(null);
                    setPinError(null);
                  }}
                  className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={verifying || !pinInput.trim()}
                  className="min-h-[40px] rounded-xl bg-[#107C41] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B5E31] disabled:opacity-60 whitespace-nowrap"
                >
                  {verifying
                    ? 'Saving...'
                    : pinTarget.mode === 'verify'
                      ? 'Unlock Account'
                      : 'Set PIN & Open'}
                </button>
              </div>
            </div>
          </form>
        )}

        <div className="flex items-center justify-center gap-2 text-center text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 text-[#107C41] shrink-0" />
          <span>
            No preloaded master sheet data — each employee uploads their own workbook. All records and snapshots auto-expire after {DATA_RETENTION_DAYS} days.
          </span>
        </div>
      </div>
    </div>
  );
};
