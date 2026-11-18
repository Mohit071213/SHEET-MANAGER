import React, { useEffect, useState } from 'react';
import { Check, RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  CategoryOption,
  DEFAULT_CHANNEL_OPTIONS,
  DEFAULT_ESCALATION_OPTIONS,
  GlobalEntryDefaults,
  PERMITTED_CATEGORIES,
  PERMITTED_SUBCATEGORIES,
  SubcategoryOption,
} from '../types/callsheet';
import { createDefaultGlobalEntryDefaults } from '../utils/globalDefaults';

interface GlobalEntryDefaultsCardProps {
  defaults: GlobalEntryDefaults;
  onSaveDefaults: (next: GlobalEntryDefaults) => Promise<void> | void;
  variant?: 'compact' | 'full';
}

export const GlobalEntryDefaultsCard: React.FC<GlobalEntryDefaultsCardProps> = ({
  defaults,
  onSaveDefaults,
  variant = 'full',
}) => {
  const [expanded, setExpanded] = useState(variant === 'full');
  const [category, setCategory] = useState<CategoryOption>(defaults.defaultCategory);
  const [subcategory, setSubcategory] = useState<SubcategoryOption>(defaults.defaultSubcategory);
  const [escalations, setEscalations] = useState(defaults.defaultEscalations);
  const [channels, setChannels] = useState(defaults.defaultChannels);
  const [alwaysApply, setAlwaysApply] = useState(defaults.alwaysApplyCategorySubcategory);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setCategory(defaults.defaultCategory);
    setSubcategory(defaults.defaultSubcategory);
    setEscalations(defaults.defaultEscalations);
    setChannels(defaults.defaultChannels);
    setAlwaysApply(defaults.alwaysApplyCategorySubcategory);
  }, [defaults]);

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    try {
      await onSaveDefaults({
        defaultCategory: category,
        defaultSubcategory: subcategory,
        defaultEscalations: escalations.trim() || 'Level1',
        defaultChannels: channels.trim() || 'Calls',
        alwaysApplyCategorySubcategory: alwaysApply,
        updatedAt: new Date().toISOString(),
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
      if (variant === 'compact') {
        setExpanded(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const factory = createDefaultGlobalEntryDefaults();
    setCategory(factory.defaultCategory);
    setSubcategory(factory.defaultSubcategory);
    setEscalations(factory.defaultEscalations);
    setChannels(factory.defaultChannels);
    setAlwaysApply(factory.alwaysApplyCategorySubcategory);
    await onSaveDefaults(factory);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const isCustomEscalation = !DEFAULT_ESCALATION_OPTIONS.includes(
    escalations as (typeof DEFAULT_ESCALATION_OPTIONS)[number]
  );
  const isCustomChannel = !DEFAULT_CHANNEL_OPTIONS.includes(
    channels as (typeof DEFAULT_CHANNEL_OPTIONS)[number]
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[#107C41] shrink-0" />
            <h2 className="text-sm font-bold text-slate-900">
              Global Entry Defaults (Shared Across All 4 Users)
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Active for all employees: {defaults.defaultCategory} · {defaults.defaultSubcategory} · {defaults.defaultEscalations} · {defaults.defaultChannels}
            {defaults.alwaysApplyCategorySubcategory ? ' · Enforced on all new rows' : ' · Used as default fallback'}
          </p>
        </div>

        {variant === 'compact' && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            {expanded ? 'Hide Defaults Editor' : 'Change Global Defaults'}
          </button>
        )}
      </div>

      {expanded && (
        <form onSubmit={(e) => void handleSave(e)} className="border-t border-slate-200 pt-3.5 space-y-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Default Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CategoryOption)}
                className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#107C41] focus:outline-none"
              >
                {PERMITTED_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Default Subcategory
              </label>
              <select
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value as SubcategoryOption)}
                className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#107C41] focus:outline-none"
              >
                {PERMITTED_SUBCATEGORIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Default Escalations
              </label>
              <select
                value={isCustomEscalation ? '__custom__' : escalations}
                onChange={(e) => {
                  const val = e.target.value;
                  setEscalations(val === '__custom__' ? '' : val);
                }}
                className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#107C41] focus:outline-none"
              >
                {DEFAULT_ESCALATION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
                <option value="__custom__">Custom Escalation...</option>
              </select>
              {isCustomEscalation && (
                <input
                  type="text"
                  maxLength={40}
                  value={escalations}
                  onChange={(e) => setEscalations(e.target.value)}
                  placeholder="Enter Escalations value"
                  className="mt-1.5 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-[#107C41] focus:outline-none"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Default Channels
              </label>
              <select
                value={isCustomChannel ? '__custom__' : channels}
                onChange={(e) => {
                  const val = e.target.value;
                  setChannels(val === '__custom__' ? '' : val);
                }}
                className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#107C41] focus:outline-none"
              >
                {DEFAULT_CHANNEL_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
                <option value="__custom__">Custom Channel...</option>
              </select>
              {isCustomChannel && (
                <input
                  type="text"
                  maxLength={40}
                  value={channels}
                  onChange={(e) => setChannels(e.target.value)}
                  placeholder="Enter Channel value"
                  className="mt-1.5 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-[#107C41] focus:outline-none"
                />
              )}
            </div>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={alwaysApply}
              onChange={(e) => setAlwaysApply(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded accent-[#107C41]"
            />
            <span>
              Always apply this Category &amp; Subcategory to all new entries (Smart Text, Bulk Paste &amp; Single Entry) across Bhaskar, Mohit, Dishant, and Vishal unless edited per row.
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleReset()}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Defaults</span>
            </button>

            <div className="flex items-center gap-2">
              {savedNotice && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#166534]">
                  <Check className="h-3.5 w-3.5" />
                  <span>Saved for all users</span>
                </span>
              )}
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#107C41] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B5E31] disabled:opacity-60 whitespace-nowrap"
              >
                <Check className="h-3.5 w-3.5" />
                <span>{saving ? 'Saving...' : 'Save Global Defaults'}</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
