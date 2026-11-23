import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  GripVertical,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { createUniqueBuilderId, sanitizeColumnKey } from '../storage';
import {
  BuilderColumn,
  BuilderColumnType,
  BuilderDefaultMode,
  BuilderWorkbook,
} from '../types';

interface ColumnDesignerViewProps {
  workbook: BuilderWorkbook;
  onSaveColumns: (columns: BuilderColumn[]) => Promise<void>;
  onSaveAsTemplate: (templateName: string, description: string) => Promise<void>;
}

const COLUMN_TYPES: Array<{ value: BuilderColumnType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'dropdown', label: 'Dropdown List' },
  { value: 'boolean', label: 'Yes / No (Boolean)' },
  { value: 'phone', label: 'Phone Number' },
  { value: 'email', label: 'Email Address' },
  { value: 'autoDate', label: 'Auto Today Date' },
];

export const ColumnDesignerView: React.FC<ColumnDesignerViewProps> = ({
  workbook,
  onSaveColumns,
  onSaveAsTemplate,
}) => {
  const [draftCols, setDraftCols] = useState<BuilderColumn[]>(() =>
    [...workbook.columns].sort((a, b) => a.order - b.order)
  );
  const [dirty, setDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [expandedColId, setExpandedColId] = useState<string | null>(null);
  const [templateBoxOpen, setTemplateBoxOpen] = useState(false);
  const [templateName, setTemplateName] = useState(`${workbook.name} Template`);
  const [templateDesc, setTemplateDesc] = useState(workbook.description || '');
  const [savingTpl, setSavingTpl] = useState(false);

  useEffect(() => {
    setDraftCols([...workbook.columns].sort((a, b) => a.order - b.order));
    setDirty(false);
  }, [workbook.id, workbook.columns]);

  const updateCol = (idx: number, patch: Partial<BuilderColumn>) => {
    setDraftCols((prev) =>
      prev.map((col, i) => {
        if (i !== idx) return col;
        const nextLabel = patch.label !== undefined ? patch.label : col.label;
        return {
          ...col,
          ...patch,
          key:
            patch.label !== undefined
              ? sanitizeColumnKey(nextLabel, i)
              : col.key,
        };
      })
    );
    setDirty(true);
  };

  const handleAddColumn = () => {
    const idx = draftCols.length;
    const newCol: BuilderColumn = {
      id: createUniqueBuilderId('col'),
      key: `column_${idx + 1}`,
      label: `Column ${idx + 1}`,
      order: idx,
      type: 'text',
      required: false,
      unique: false,
      defaultMode: 'none',
      defaultValue: '',
      dropdownOptions: [],
      width: 18,
    };
    setDraftCols((prev) => [...prev, newCol]);
    setExpandedColId(newCol.id);
    setDirty(true);
  };

  const handleMove = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= draftCols.length || fromIdx === toIdx) return;
    setDraftCols((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, moved);
      return copy.map((c, idx) => ({ ...c, order: idx }));
    });
    setDirty(true);
  };

  const handleDeleteColumn = (idx: number) => {
    setDraftCols((prev) =>
      prev.filter((_, i) => i !== idx).map((c, order) => ({ ...c, order }))
    );
    setDirty(true);
  };

  const handleSave = async () => {
    const cleaned = draftCols.map((col, idx) => ({
      ...col,
      label: col.label.trim() || `Column ${idx + 1}`,
      key: sanitizeColumnKey(col.label || `Column ${idx + 1}`, idx),
      order: idx,
      dropdownOptions:
        col.type === 'dropdown'
          ? col.dropdownOptions.map((o) => o.trim()).filter(Boolean)
          : [],
    }));
    setIsSaving(true);
    try {
      await onSaveColumns(cleaned);
      setDirty(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) return;
    setSavingTpl(true);
    try {
      await onSaveAsTemplate(templateName.trim(), templateDesc.trim());
      setTemplateBoxOpen(false);
    } finally {
      setSavingTpl(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Custom Column Designer
          </h2>
          <p className="text-xs text-slate-500">
            Drag rows or use arrows to reorder columns. Define data types, dropdown lists, required fields, and unique duplicate keys.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setTemplateBoxOpen((o) => !o)}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <BookmarkPlus className="h-3.5 w-3.5" />
            <span>Save as Template</span>
          </button>
          <button
            type="button"
            onClick={handleAddColumn}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5 text-[#107C41]" />
            <span>Add Column</span>
          </button>
          <button
            type="button"
            disabled={!dirty || isSaving}
            onClick={() => void handleSave()}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#107C41] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0B5E31] whitespace-nowrap disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{isSaving ? 'Saving...' : dirty ? 'Save Column Schema' : 'Schema Saved'}</span>
          </button>
        </div>
      </div>

      {templateBoxOpen && (
        <form
          onSubmit={(e) => void handleSaveTemplate(e)}
          className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
        >
          <div className="text-xs font-semibold text-slate-900">
            Save Current Columns to Reusable Template Library
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="text"
              required
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name"
              className="min-h-[38px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#107C41] focus:outline-none"
            />
            <input
              type="text"
              value={templateDesc}
              onChange={(e) => setTemplateDesc(e.target.value)}
              placeholder="Short description (optional)"
              className="min-h-[38px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#107C41] focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setTemplateBoxOpen(false)}
              className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingTpl}
              className="min-h-[36px] rounded-lg bg-[#107C41] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0B5E31]"
            >
              {savingTpl ? 'Saving...' : 'Save Custom Template'}
            </button>
          </div>
        </form>
      )}

      {draftCols.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <p className="text-sm font-semibold text-slate-900">No columns defined yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Add your first column to unlock single entry forms, bulk text parsing, and Excel exports.
          </p>
          <button
            type="button"
            onClick={handleAddColumn}
            className="mt-4 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#107C41] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B5E31]"
          >
            <Plus className="h-4 w-4" />
            <span>Add First Column</span>
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white overflow-hidden">
          {draftCols.map((col, idx) => {
            const isExpanded = expandedColId === col.id;
            return (
              <div
                key={col.id}
                draggable
                onDragStart={() => setDragIndex(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIndex !== null && dragIndex !== idx) {
                    handleMove(dragIndex, idx);
                  }
                  setDragIndex(null);
                }}
                className={`p-4 transition-colors ${
                  dragIndex === idx ? 'bg-slate-100/80' : 'hover:bg-slate-50/50'
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  {/* Order & Drag Handle */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      title="Drag to reorder"
                      className="cursor-grab text-slate-400 hover:text-slate-600"
                    >
                      <GripVertical className="h-4 w-4" />
                    </span>
                    <span className="w-6 text-xs font-mono tabular-nums text-slate-500">
                      {idx + 1}
                    </span>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMove(idx, idx - 1)}
                      aria-label={`Move ${col.label} up`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === draftCols.length - 1}
                      onClick={() => handleMove(idx, idx + 1)}
                      aria-label={`Move ${col.label} down`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Primary Header & Type Controls */}
                  <div className="grid flex-1 grid-cols-1 gap-2.5 sm:grid-cols-12 sm:items-center">
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        value={col.label}
                        onChange={(e) => updateCol(idx, { label: e.target.value })}
                        placeholder="Column Header Name"
                        aria-label={`Column ${idx + 1} header name`}
                        className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 focus:border-[#107C41] focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <select
                        value={col.type}
                        onChange={(e) => {
                          const nextType = e.target.value as BuilderColumnType;
                          updateCol(idx, {
                            type: nextType,
                            defaultMode:
                              nextType === 'autoDate'
                                ? 'today'
                                : nextType === 'dropdown' && col.dropdownOptions.length > 0
                                  ? 'firstOption'
                                  : col.defaultMode,
                          });
                          if (nextType === 'dropdown') {
                            setExpandedColId(col.id);
                          }
                        }}
                        aria-label={`Column ${idx + 1} data type`}
                        className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#107C41] focus:outline-none"
                      >
                        {COLUMN_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-3 flex items-center gap-4 text-xs font-medium text-slate-700">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={col.required}
                          onChange={(e) =>
                            updateCol(idx, { required: e.target.checked })
                          }
                          className="h-4 w-4 rounded border-slate-300 text-[#107C41]"
                        />
                        <span>Required</span>
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={col.unique}
                          onChange={(e) =>
                            updateCol(idx, { unique: e.target.checked })
                          }
                          className="h-4 w-4 rounded border-slate-300 text-[#107C41]"
                        />
                        <span>Unique</span>
                      </label>
                    </div>

                    <div className="sm:col-span-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedColId((curr) =>
                            curr === col.id ? null : col.id
                          )
                        }
                        className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        {isExpanded ? 'Hide Options' : 'Options'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteColumn(idx)}
                        aria-label={`Remove column ${col.label}`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-red-600 hover:bg-red-50 shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Column Advanced Options (Dropdowns, Defaults, Validation) */}
                {isExpanded && (
                  <div className="mt-3 ml-0 lg:ml-24 grid grid-cols-1 gap-3 border-t border-slate-200 pt-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Default Behavior
                      </label>
                      <select
                        value={col.defaultMode}
                        onChange={(e) =>
                          updateCol(idx, {
                            defaultMode: e.target.value as BuilderDefaultMode,
                          })
                        }
                        className="w-full min-h-[36px] rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800"
                      >
                        <option value="none">No Default (Blank)</option>
                        <option value="today">Today&apos;s Date</option>
                        <option value="firstOption">First Dropdown Option</option>
                        <option value="custom">Custom Fixed Value</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Custom Default Value
                      </label>
                      <input
                        type="text"
                        value={col.defaultValue}
                        disabled={col.defaultMode !== 'custom'}
                        onChange={(e) =>
                          updateCol(idx, { defaultValue: e.target.value })
                        }
                        placeholder={
                          col.defaultMode === 'custom'
                            ? 'e.g. NA or Pending'
                            : 'Select Custom Fixed Value'
                        }
                        className="w-full min-h-[36px] rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Excel Width (Chars)
                      </label>
                      <input
                        type="number"
                        min={8}
                        max={80}
                        value={col.width}
                        onChange={(e) =>
                          updateCol(idx, {
                            width: Math.min(80, Math.max(8, Number(e.target.value) || 16)),
                          })
                        }
                        className="w-full min-h-[36px] rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono tabular-nums text-slate-900"
                      />
                    </div>

                    {col.type === 'dropdown' && (
                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Dropdown Options (comma-separated, embedded directly into Excel validation)
                        </label>
                        <input
                          type="text"
                          value={col.dropdownOptions.join(', ')}
                          onChange={(e) =>
                            updateCol(idx, {
                              dropdownOptions: e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                          placeholder="e.g., Open, In Progress, Resolved, Closed"
                          className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-[#107C41] focus:outline-none"
                        />
                      </div>
                    )}

                    {col.type === 'number' && (
                      <>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Minimum Value (Optional)
                          </label>
                          <input
                            type="number"
                            value={col.minValue ?? ''}
                            onChange={(e) =>
                              updateCol(idx, {
                                minValue:
                                  e.target.value === ''
                                    ? undefined
                                    : Number(e.target.value),
                              })
                            }
                            className="w-full min-h-[36px] rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Maximum Value (Optional)
                          </label>
                          <input
                            type="number"
                            value={col.maxValue ?? ''}
                            onChange={(e) =>
                              updateCol(idx, {
                                maxValue:
                                  e.target.value === ''
                                    ? undefined
                                    : Number(e.target.value),
                              })
                            }
                            className="w-full min-h-[36px] rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono tabular-nums"
                          />
                        </div>
                      </>
                    )}

                    {(col.type === 'text' || col.type === 'phone') && (
                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Validation Regex Pattern (Optional)
                        </label>
                        <input
                          type="text"
                          value={col.validationRegex ?? ''}
                          onChange={(e) =>
                            updateCol(idx, { validationRegex: e.target.value })
                          }
                          placeholder="e.g., ^[A-Z]{2,4}-\\d{3,6}$"
                          className="w-full min-h-[36px] rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono text-slate-900"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
