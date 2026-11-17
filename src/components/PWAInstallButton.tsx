import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'full';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'compact' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    if (variant === 'full') {
      return (
        <span className="inline-flex items-center gap-2 text-xs font-medium text-[#166534]">
          App Installed (Standalone Mode)
        </span>
      );
    }
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-[#107C41]/30 bg-[#DCFCE7]/60 px-3 py-2 text-xs font-semibold text-[#166534] transition-colors hover:bg-[#DCFCE7] whitespace-nowrap shrink-0"
      >
        <Download className="h-3.5 w-3.5" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          <Smartphone className="h-3.5 w-3.5" />
          <span>Install on iPhone</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">
                  Install CallSheet Manager on iOS
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close installation guide"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-sm text-slate-600">
                <li>1. Tap the <strong>Share</strong> icon in the Safari bottom bar.</li>
                <li>2. Scroll down and select <strong>Add to Home Screen</strong>.</li>
                <li>3. Tap <strong>Add</strong> to open CallSheet Manager like a native app.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 min-h-[44px] w-full rounded-lg bg-[#107C41] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0B5E31]"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (variant === 'full') {
    return (
      <span className="text-xs text-slate-500">
        Open in Chrome/Edge on Android or PC and use the browser Install icon in the address bar to install as a PWA.
      </span>
    );
  }

  return null;
};
