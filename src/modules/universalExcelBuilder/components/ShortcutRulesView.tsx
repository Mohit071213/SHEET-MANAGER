import React, { useMemo, useRef, useState } from 'react';
import {
  Download,
  FlaskConical,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { applyShortcutRules } from '../bulkParserEngine';
import { triggerBuilderBlobDownload } from '../excelIOEngine';
import { createUniqueBuilderId } from '../storage';
import {
  BuilderShortcutAssignment,
  BuilderShortcutMatchMode,
  BuilderShortcutRule,
  BuilderWorkbook,
} from '../types';

interface ShortcutRulesViewProps {
  workbook: BuilderWorkbook;
  rules: BuilderShortcutRule[];
  onSaveRule: (
    rule: Omit<
      BuilderShortcutRule,
      'id' | 'createdAt' | 'updatedAt' | 'usageCount'
    > & { id?: string; usageCount?: number }
  ) => Promise<void>;
  onDeleteRule: (ruleId: string) => Promise<void>;
  onImportRulesJson: (rules: BuilderShortcutRule[]) => Promise<void>;
}

export const ShortcutRulesView: React.FC<ShortcutRulesViewProps> = ({
  workbook,
  rules,
  onSaveRule,
  onDeleteRule,
  onImportRulesJson,
}) => {
  const orderedCols = useMemo(
    () => [...workbook.columns].sort((a, b) => a.order - b.order),
    [workbook.columns]
  );

  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [triggerText, setTriggerText] = useState('');
  const [matchMode, setMatchMode] =
    useState<BuilderShortcutMatchMode>('contains');
  const [priority, setPriority] = useState(50);
  const [enabled, setEnabled] = useState(true);
  const [assignments, setAssignments] = useState<BuilderShortcutAssignment[]>(
    () =>
      orderedCols[0] ? [{ columnId: orderedCols[0].id, value: '' }] : []
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [testInput, setTestInput] = useState('');
  const importFileRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setEditingRuleId(null);
    setName('');
    setTriggerText('');
    setMatchMode('contains');
    setPriority(50);
    setEnabled(true);
    setAssignments(
      orderedCols[0] ? [{ columnId: orderedCols[0].id, value: '' }] : []
    );
    setFormError(null);
  };

  const startEditRule = (rule: BuilderShortcutRule) => {
    setEditingRuleId(rule.id);
    setName(rule.name);
    setTriggerText(rule.triggerText);
    setMatchMode(rule.matchMode);
    setPriority(rule.priority);
    setEnabled(rule.enabled);
    setAssignments(
      rule.assignments.length > 0
        ? rule.assignments.map((a) => ({ ...a }))
        : orderedCols[0]
          ? [{ columnId: orderedCols[0].id, value: '' }]
          : []
    );
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !triggerText.trim()) {
      setFormError('Rule name and trigger keyword/pattern are required.');
      return;
    }
    const validAssignments = assignments.filter(
      (a) => a.columnId && a.value.trim() !== ''
    );
    if (validAssignments.length === 0) {
      setFormError('Add at least one target column and assigned value.');
      return;
    }
    if (matchMode === 'regex') {
      try {
        new RegExp(triggerText.trim(), 'i');
      } catch {
        setFormError('Invalid Regular Expression pattern.');
        return;
      }
    }

    setFormError(null);
    setIsSaving(true);
    try {
      await onSaveRule({
        id: editingRuleId ?? undefined,
        workbookId: workbook.id,
        ownerId: workbook.ownerId,
        name: name.trim(),
        triggerText: triggerText.trim(),
        matchMode,
        assignments: validAssignments,
        priority: Math.min(1000, Math.max(0, Number(priority) || 0)),
        enabled,
      });
      resetForm();
    } finally {
      setIsSaving(false);
    }
  };

  const testResult = useMemo(() => {
    if (!testInput.trim()) return null;
    return applyShortcutRules(testInput, rules);
  }, [testInput, rules]);

  const handleExportRulesJson = () => {
    const blob = new Blob([JSON.stringify(rules, null, 2)], {
      type: 'application/json',
    });
    const safeName = workbook.name.replace(/[^a-zA-Z0-9_-]+/g, '_');
    triggerBuilderBlobDownload(blob, `${safeName}_Shortcut_Rules.json`);
  };

  const handleImportRulesFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new Error('JSON file must contain an array of shortcut rules.');
      }
      const nowIso = new Date().toISOString();
      const normalized: BuilderShortcutRule[] = parsed
        .filter((r) => r && typeof r.triggerText === 'string')
        .map((r) => ({
          id: createUniqueBuilderId('rule'),
          workbookId: workbook.id,
          ownerId: workbook.ownerId,
          name: String(r.name || r.triggerText).slice(0, 100),
          triggerText: String(r.triggerText).slice(0, 120),
          matchMode: ['contains', 'exact', 'startsWith', 'regex'].includes(
            r.matchMode
          )
            ? r.matchMode
            : 'contains',
          assignments: Array.isArray(r.assignments) ? r.assignments : [],
          priority: Number(r.priority ?? 50),
          enabled: Boolean(r.enabled ?? true),
          usageCount: 0,
          createdAt: nowIso,
          updatedAt: nowIso,
        }));
      await onImportRulesJson(normalized);
      setFormError(null);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to import shortcut rules JSON.'
      );
    }
  };

  if (orderedCols.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
        <p className="text-sm font-semibold text-slate-900">
          Add columns before building shortcut rules
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Shortcut rules map detected keywords directly into your workbook columns.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Shortcut &amp; Automation Rule Builder
          </h2>
          <p className="text-xs text-slate-500">
            Automatically populate one or multiple columns when pasted bulk text matches a keyword or regex trigger.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={importFileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportRulesFile(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => importFileRef.current?.click()}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Import JSON</span>
          </button>
          <button
            type="button"
            disabled={rules.length === 0}
            onClick={handleExportRulesJson}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Rule Editor Form */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-4 self-start"
        >
          <h3 className="text-sm font-semibold text-slate-900">
            {editingRuleId ? 'Edit Shortcut Rule' : 'Create New Shortcut Rule'}
          </h3>

          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
            >
              {formError}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Rule Label
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., VIP Priority Escalation"
                className="w-full min-h-[38px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#107C41] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Trigger Keyword / Pattern
                </label>
                <input
                  type="text"
                  value={triggerText}
                  onChange={(e) => setTriggerText(e.target.value)}
                  placeholder="e.g., urgent, paid, rto"
                  className="w-full min-h-[38px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono text-slate-900 focus:border-[#107C41] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Match Mode
                </label>
                <select
                  value={matchMode}
                  onChange={(e) =>
                    setMatchMode(e.target.value as BuilderShortcutMatchMode)
                  }
                  className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                >
                  <option value="contains">Contains (case-insensitive)</option>
                  <option value="exact">Exact Line Match</option>
                  <option value="startsWith">Starts With</option>
                  <option value="regex">Regex Pattern</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Priority (0–1000)
                </label>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  className="w-full min-h-[38px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono tabular-nums"
                />
              </div>

              <label className="inline-flex min-h-[38px] items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#107C41]"
                />
                <span>Rule Enabled</span>
              </label>
            </div>

            <div className="border-t border-slate-200 pt-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  Target Column Assignments
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setAssignments((prev) => [
                      ...prev,
                      { columnId: orderedCols[0].id, value: '' },
                    ])
                  }
                  className="text-xs font-semibold text-[#107C41] hover:underline"
                >
                  + Add Field
                </button>
              </div>

              {assignments.map((assign, idx) => {
                const targetCol =
                  orderedCols.find((c) => c.id === assign.columnId) ??
                  orderedCols[0];
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={assign.columnId}
                      onChange={(e) =>
                        setAssignments((prev) =>
                          prev.map((item, i) =>
                            i === idx
                              ? { ...item, columnId: e.target.value, value: '' }
                              : item
                          )
                        )
                      }
                      aria-label="Target column"
                      className="w-1/2 min-h-[36px] rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      {orderedCols.map((col) => (
                        <option key={col.id} value={col.id}>
                          {col.label}
                        </option>
                      ))}
                    </select>

                    {targetCol.type === 'dropdown' &&
                    targetCol.dropdownOptions.length > 0 ? (
                      <select
                        value={assign.value}
                        onChange={(e) =>
                          setAssignments((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, value: e.target.value }
                                : item
                            )
                          )
                        }
                        aria-label="Assign dropdown value"
                        className="w-1/2 min-h-[36px] rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                      >
                        <option value="">-- Choose --</option>
                        {targetCol.dropdownOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : targetCol.type === 'boolean' ? (
                      <select
                        value={assign.value}
                        onChange={(e) =>
                          setAssignments((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, value: e.target.value }
                                : item
                            )
                          )
                        }
                        className="w-1/2 min-h-[36px] rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                      >
                        <option value="">-- Choose --</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={assign.value}
                        onChange={(e) =>
                          setAssignments((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, value: e.target.value }
                                : item
                            )
                          )
                        }
                        placeholder="Value to assign"
                        className="w-1/2 min-h-[36px] rounded-lg border border-slate-300 px-2.5 py-1 text-xs"
                      />
                    )}

                    {assignments.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setAssignments((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                        aria-label="Remove assignment"
                        className="flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
            {editingRuleId && (
              <button
                type="button"
                onClick={resetForm}
                className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                Cancel Edit
              </button>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#107C41] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0B5E31] whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>
                {isSaving
                  ? 'Saving...'
                  : editingRuleId
                    ? 'Update Rule'
                    : 'Save Rule'}
              </span>
            </button>
          </div>
        </form>

        {/* Active Rules + Live Tester */}
        <div className="lg:col-span-7 space-y-5">
          {/* Sandbox Tester */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
              <FlaskConical className="h-4 w-4 text-[#107C41]" />
              <span>Rule Tester Sandbox</span>
            </div>
            <input
              type="text"
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              placeholder="Type a sample bulk note here to test which shortcut rules match..."
              className="w-full min-h-[38px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#107C41] focus:outline-none"
            />
            {testResult && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
                {testResult.matchedRuleNames.length === 0 ? (
                  <span className="text-slate-500">
                    No active shortcut rules matched this input.
                  </span>
                ) : (
                  <div className="space-y-1">
                    <div className="font-semibold text-slate-800">
                      Matched: {testResult.matchedRuleNames.join(' · ')}
                    </div>
                    <div className="text-slate-600">
                      {Object.entries(testResult.assignments)
                        .map(([colId, val]) => {
                          const colLabel =
                            orderedCols.find((c) => c.id === colId)?.label ??
                            colId;
                          return `${colLabel}: "${val}"`;
                        })
                        .join(' · ')}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Saved Rules List */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">
                Configured Shortcut Rules
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {rules.length} rules
              </span>
            </div>

            {rules.length === 0 ? (
              <div className="px-5 py-10 text-center text-xs text-slate-500">
                No shortcut rules created yet. Add your first keyword rule on the left to speed up bulk data entry.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900">
                          {rule.name}
                        </span>
                        {!rule.enabled && (
                          <span className="text-[11px] font-medium text-slate-400">
                            Paused
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span className="font-mono text-slate-700">
                          &ldquo;{rule.triggerText}&rdquo;
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{rule.matchMode}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Priority {rule.priority}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Used {rule.usageCount}x
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-700">
                        {rule.assignments
                          .map((a) => {
                            const colLabel =
                              orderedCols.find((c) => c.id === a.columnId)
                                ?.label ?? 'Column';
                            return `${colLabel} → ${a.value}`;
                          })
                          .join(' · ')}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          void onSaveRule({ ...rule, enabled: !rule.enabled })
                        }
                        className="min-h-[34px] rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {rule.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditRule(rule)}
                        aria-label={`Edit rule ${rule.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteRule(rule.id)}
                        aria-label={`Delete rule ${rule.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
