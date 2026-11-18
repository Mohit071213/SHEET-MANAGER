import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  History,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  CallStatus,
  CategoryOption,
  EmployeeName,
  PERMITTED_CATEGORIES,
  PERMITTED_REMARKS,
  PERMITTED_SUBCATEGORIES,
  RemarkOption,
  ShortcutHistoryEntry,
  ShortcutRule,
  SubcategoryOption,
} from '../types/callsheet';

interface ShortcutDictionaryViewProps {
  employeeName: EmployeeName;
  rules: ShortcutRule[];
  historyEntries?: ShortcutHistoryEntry[];
  onSaveRules: (
    nextRules: ShortcutRule[],
    historyEvent?: {
      action: ShortcutHistoryEntry['action'];
      rule: ShortcutRule;
    }
  ) => void;
  onResetDefaults: () => void;
  onClearHistory?: () => void;
}

export const ShortcutDictionaryView: React.FC<ShortcutDictionaryViewProps> = ({
  employeeName,
  rules,
  historyEntries = [],
  onSaveRules,
  onResetDefaults,
  onClearHistory,
}) => {
  const [search, setSearch] = useState('');
  const [trigger, setTrigger] = useState('');
  const [matchType, setMatchType] = useState<ShortcutRule['matchType']>('contains');
  const [status, setStatus] = useState<CallStatus>('Resolved');
  const [category, setCategory] = useState<CategoryOption>('Query');
  const [subcategory, setSubcategory] = useState<SubcategoryOption>(
    'General information related'
  );
  const [remark, setRemark] = useState<RemarkOption>('general query');
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Inline rule editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ShortcutRule | null>(null);

  const filteredRules = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter(
      (r) =>
        r.trigger.toLowerCase().includes(q) ||
        r.remark.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.subcategory.toLowerCase().includes(q)
    );
  }, [rules, search]);

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cleanTrigger = trigger.trim();
    if (!cleanTrigger) {
      setFormError('Enter a trigger word or abbreviation (for example, "pay link" or "rnr").');
      return;
    }

    const newRule: ShortcutRule = {
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      trigger: cleanTrigger,
      matchType,
      status,
      category,
      subcategory,
      remark,
      enabled: true,
      isCustom: true,
    };

    onSaveRules([newRule, ...rules], { action: 'added', rule: newRule });
    setTrigger('');
  };

  const handleToggleRule = (item: ShortcutRule) => {
    const toggled = { ...item, enabled: !item.enabled };
    onSaveRules(
      rules.map((r) => (r.id === item.id ? toggled : r)),
      { action: 'toggled', rule: toggled }
    );
  };

  const handleDeleteRule = (item: ShortcutRule) => {
    onSaveRules(
      rules.filter((r) => r.id !== item.id),
      { action: 'deleted', rule: item }
    );
    if (editingId === item.id) {
      setEditingId(null);
      setEditDraft(null);
    }
  };

  const startEditing = (item: ShortcutRule) => {
    setEditingId(item.id);
    setEditDraft({ ...item });
    setFormError(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const commitEditing = () => {
    if (!editDraft || !editDraft.trigger.trim()) {
      setFormError('Trigger phrase cannot be empty.');
      return;
    }
    const cleanDraft: ShortcutRule = {
      ...editDraft,
      trigger: editDraft.trigger.trim(),
    };
    onSaveRules(
      rules.map((r) => (r.id === cleanDraft.id ? cleanDraft : r)),
      { action: 'edited', rule: cleanDraft }
    );
    setEditingId(null);
    setEditDraft(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Shortcut Dictionary ({employeeName})
          </h1>
          <p className="text-xs text-slate-500">
            Map short abbreviations and calling phrases to exact fixed Category, Subcategory, Status, and Master Remark values. Changes are logged per user.
          </p>
        </div>

        {!confirmReset ? (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Default Rules</span>
          </button>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                onResetDefaults();
                setConfirmReset(false);
              }}
              className="min-h-[38px] rounded-lg bg-[#107C41] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0B5E31]"
            >
              Confirm Reset
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Add Custom Shortcut Rule */}
      <form
        onSubmit={handleAddRule}
        className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
      >
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <BookOpen className="h-4 w-4 text-[#107C41]" />
          <span>Add Custom Shortcut Mapping</span>
        </div>

        {formError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
            {formError}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Shortcut / Phrase Trigger
            </label>
            <input
              type="text"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder='e.g. "cb tomorrow" or "app crash"'
              className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-[#107C41] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Match Mode
            </label>
            <select
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as ShortcutRule['matchType'])}
              className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900"
            >
              <option value="contains">Contains Phrase</option>
              <option value="exact">Exact Match</option>
              <option value="regex">Regex Pattern</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as CallStatus)}
              className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900"
            >
              <option value="Resolved">Resolved</option>
              <option value="Unresolved">Unresolved</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Category (Exact 3)
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CategoryOption)}
              className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900"
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
              Subcategory (Exact 6)
            </label>
            <select
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value as SubcategoryOption)}
              className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900"
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
              Exact Master Remark (45 Options)
            </label>
            <select
              value={remark}
              onChange={(e) => setRemark(e.target.value as RemarkOption)}
              className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900"
            >
              {PERMITTED_REMARKS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#107C41] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B5E31] whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Shortcut Rule</span>
          </button>
        </div>
      </form>

      {/* Active Rules Table */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search triggers, remarks, categories..."
              className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-xs text-slate-900 focus:border-[#107C41] focus:outline-none"
            />
          </div>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            Showing {filteredRules.length} of {rules.length} rules
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-[#F1F5F9] text-slate-700">
                <th className="px-3 py-2.5 font-semibold">Active</th>
                <th className="px-3 py-2.5 font-semibold">Trigger</th>
                <th className="px-3 py-2.5 font-semibold">Mode</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Category</th>
                <th className="px-3 py-2.5 font-semibold">Subcategory</th>
                <th className="px-3 py-2.5 font-semibold">Exact Master Remark</th>
                <th className="px-3 py-2.5 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredRules.map((item) => {
                const isEditing = editingId === item.id && editDraft;
                if (isEditing && editDraft) {
                  return (
                    <tr key={item.id} className="bg-[#DCFCE7]/20">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={editDraft.enabled}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, enabled: e.target.checked })
                          }
                          aria-label={`Toggle ${editDraft.trigger}`}
                          className="h-4 w-4 accent-[#107C41]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={editDraft.trigger}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, trigger: e.target.value })
                          }
                          className="w-36 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={editDraft.matchType}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              matchType: e.target.value as ShortcutRule['matchType'],
                            })
                          }
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          <option value="contains">contains</option>
                          <option value="exact">exact</option>
                          <option value="regex">regex</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={editDraft.status}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              status: e.target.value as CallStatus,
                            })
                          }
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          <option value="Resolved">Resolved</option>
                          <option value="Unresolved">Unresolved</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={editDraft.category}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              category: e.target.value as CategoryOption,
                            })
                          }
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          {PERMITTED_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={editDraft.subcategory}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              subcategory: e.target.value as SubcategoryOption,
                            })
                          }
                          className="w-40 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          {PERMITTED_SUBCATEGORIES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={editDraft.remark}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              remark: e.target.value as RemarkOption,
                            })
                          }
                          className="w-56 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          {PERMITTED_REMARKS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={commitEditing}
                            aria-label="Save edited rule"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#107C41] text-white hover:bg-[#0B5E31]"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditing}
                            aria-label="Cancel edit"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={item.id} className={!item.enabled ? 'opacity-50 bg-slate-50' : ''}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={() => handleToggleRule(item)}
                        aria-label={`Toggle ${item.trigger}`}
                        className="h-4 w-4 accent-[#107C41]"
                      />
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {item.trigger}
                      {item.isCustom && (
                        <span className="ml-1.5 text-[10px] font-sans font-semibold text-[#107C41]">
                          (Custom)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">
                      {item.matchType}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-semibold">
                      <span
                        className={
                          item.status === 'Resolved' ? 'text-[#166534]' : 'text-[#B45309]'
                        }
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                      {item.category}
                    </td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                      {item.subcategory}
                    </td>
                    <td
                      className="px-3 py-2 font-mono text-slate-900 max-w-xs truncate"
                      title={item.remark}
                    >
                      {item.remark}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEditing(item)}
                          aria-label={`Edit ${item.trigger}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRule(item)}
                          aria-label={`Delete ${item.trigger}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmed Mapping History per Employee */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-[#107C41]" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Confirmed Mapping History ({employeeName})
              </h2>
              <p className="text-xs text-slate-500">
                Recent shortcut additions, edits, toggles, and resets saved to {employeeName}&apos;s workspace.
              </p>
            </div>
          </div>

          {historyEntries.length > 0 && onClearHistory && (
            <button
              type="button"
              onClick={onClearHistory}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Trash2 className="h-3 w-3" />
              <span>Clear History</span>
            </button>
          )}
        </div>

        {historyEntries.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] px-4 py-4 text-xs text-slate-500">
            No custom mapping edits recorded yet for {employeeName}. Add, edit, or save a rule from Bulk Review to log history here.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-[#F1F5F9] text-slate-700">
                  <th className="px-3 py-2 font-semibold">Time</th>
                  <th className="px-3 py-2 font-semibold">Action</th>
                  <th className="px-3 py-2 font-semibold">Trigger</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Category / Subcategory</th>
                  <th className="px-3 py-2 font-semibold">Exact Master Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {historyEntries.slice(0, 25).map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap tabular-nums">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-semibold uppercase text-[10px] text-slate-700 whitespace-nowrap">
                      {entry.action}
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {entry.trigger}
                    </td>
                    <td className="px-3 py-2 font-semibold whitespace-nowrap">
                      <span
                        className={
                          entry.status === 'Resolved' ? 'text-[#166534]' : 'text-[#B45309]'
                        }
                      >
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                      {entry.category} · {entry.subcategory}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-900">{entry.remark}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
