import React, { useMemo, useState } from 'react';
import { Check, Layers, Plus, Search, Trash2 } from 'lucide-react';
import { BUILDER_INDUSTRIES, BuilderIndustry } from '../config';
import { BuilderTemplate } from '../types';

interface TemplateLibraryViewProps {
  templates: BuilderTemplate[];
  onUseTemplate: (template: BuilderTemplate, customName?: string) => Promise<void>;
  onDeleteCustomTemplate: (templateId: string) => Promise<void>;
}

export const TemplateLibraryView: React.FC<TemplateLibraryViewProps> = ({
  templates,
  onUseTemplate,
  onDeleteCustomTemplate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [industryFilter, setIndustryFilter] = useState<'all' | BuilderIndustry>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'builtin' | 'custom'>('all');
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [namingTemplateId, setNamingTemplateId] = useState<string | null>(null);
  const [customWorkbookName, setCustomWorkbookName] = useState('');

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return templates.filter((tpl) => {
      if (sourceFilter === 'builtin' && !tpl.isBuiltIn) return false;
      if (sourceFilter === 'custom' && tpl.isBuiltIn) return false;
      if (industryFilter !== 'all' && tpl.industry !== industryFilter) return false;
      if (!q) return true;
      return (
        tpl.name.toLowerCase().includes(q) ||
        tpl.industry.toLowerCase().includes(q) ||
        tpl.description.toLowerCase().includes(q) ||
        tpl.columns.some((c) => c.label.toLowerCase().includes(q))
      );
    });
  }, [templates, searchQuery, industryFilter, sourceFilter]);

  const handleStartUse = (tpl: BuilderTemplate) => {
    setNamingTemplateId(tpl.id);
    setCustomWorkbookName(tpl.name);
  };

  const handleConfirmUse = async (tpl: BuilderTemplate) => {
    setCreatingId(tpl.id);
    try {
      await onUseTemplate(tpl, customWorkbookName.trim() || tpl.name);
      setNamingTemplateId(null);
      setCustomWorkbookName('');
    } finally {
      setCreatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 text-balance">
            Industry Template Library
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Start a structured Excel workbook in one click across 10 industries, or reuse your own saved schemas.
          </p>
        </div>
        <span className="text-xs font-mono tabular-nums text-slate-500">
          {filtered.length} templates shown
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates by industry, title, or column name..."
              className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#107C41] focus:outline-none focus:ring-2 focus:ring-[#107C41]/15"
            />
          </div>

          <select
            value={industryFilter}
            onChange={(e) =>
              setIndustryFilter(e.target.value as 'all' | BuilderIndustry)
            }
            aria-label="Filter templates by industry"
            className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-[#107C41] focus:outline-none"
          >
            <option value="all">All Industries</option>
            {BUILDER_INDUSTRIES.map((ind) => (
              <option key={ind} value={ind}>
                {ind}
              </option>
            ))}
          </select>
        </div>

        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start lg:self-auto shrink-0">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'builtin', label: 'Built-in' },
              { id: 'custom', label: 'My Saved' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSourceFilter(tab.id)}
              className={`min-h-[32px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                sourceFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <Layers className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 text-sm font-semibold text-slate-900">
            No templates match your filter
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Clear your search or save a custom template inside any workbook&apos;s Columns tab.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setIndustryFilter('all');
              setSourceFilter('all');
            }}
            className="mt-4 inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((tpl) => {
            const isNaming = namingTemplateId === tpl.id;
            const isBusy = creatingId === tpl.id;
            return (
              <div
                key={tpl.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        {tpl.name}
                      </h2>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span>{tpl.industry}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {tpl.columns.length} columns
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{tpl.isBuiltIn ? 'Built-in Template' : 'Custom Saved'}</span>
                      </div>
                    </div>
                    {!tpl.isBuiltIn && (
                      <button
                        type="button"
                        onClick={() => void onDeleteCustomTemplate(tpl.id)}
                        aria-label={`Delete custom template ${tpl.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <p className="mt-2.5 text-xs leading-relaxed text-slate-600">
                    {tpl.description}
                  </p>

                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <div className="text-[11px] font-semibold text-slate-500 mb-1">
                      Columns Included
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      {tpl.columns.map((c) => c.label).join(' · ')}
                    </p>
                  </div>
                </div>

                {isNaming ? (
                  <div className="border-t border-slate-200 pt-3 space-y-2.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      New Workbook Name
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={customWorkbookName}
                        onChange={(e) => setCustomWorkbookName(e.target.value)}
                        className="flex-1 min-h-[38px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#107C41] focus:outline-none"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleConfirmUse(tpl)}
                          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#107C41] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0B5E31] whitespace-nowrap disabled:opacity-60"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>{isBusy ? 'Creating...' : 'Create Workbook'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setNamingTemplateId(null)}
                          className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-end border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => handleStartUse(tpl)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#107C41] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0B5E31] whitespace-nowrap"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Use This Template</span>
                    </button>
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
