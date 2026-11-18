import {
  DEFAULT_RECORD_VALUES,
  GlobalEntryDefaults,
  PERMITTED_CATEGORIES,
  PERMITTED_SUBCATEGORIES,
} from '../types/callsheet';

const GLOBAL_DEFAULTS_KEY = 'callsheet_global_entry_defaults_v1';

export function createDefaultGlobalEntryDefaults(): GlobalEntryDefaults {
  return {
    defaultCategory: DEFAULT_RECORD_VALUES.category,
    defaultSubcategory: DEFAULT_RECORD_VALUES.subcategory,
    defaultEscalations: DEFAULT_RECORD_VALUES.escalations,
    defaultChannels: DEFAULT_RECORD_VALUES.channels,
    alwaysApplyCategorySubcategory: true,
    updatedAt: new Date().toISOString(),
  };
}

export function sanitizeGlobalEntryDefaults(
  raw?: Partial<GlobalEntryDefaults> | null
): GlobalEntryDefaults {
  const base = createDefaultGlobalEntryDefaults();
  if (!raw) return base;

  const cat = PERMITTED_CATEGORIES.find((c) => c === raw.defaultCategory) ?? base.defaultCategory;
  const sub =
    PERMITTED_SUBCATEGORIES.find((s) => s === raw.defaultSubcategory) ?? base.defaultSubcategory;

  const esc = String(raw.defaultEscalations ?? '')
    .trim()
    .slice(0, 40);
  const chan = String(raw.defaultChannels ?? '')
    .trim()
    .slice(0, 40);

  return {
    defaultCategory: cat,
    defaultSubcategory: sub,
    defaultEscalations: esc || base.defaultEscalations,
    defaultChannels: chan || base.defaultChannels,
    alwaysApplyCategorySubcategory:
      typeof raw.alwaysApplyCategorySubcategory === 'boolean'
        ? raw.alwaysApplyCategorySubcategory
        : base.alwaysApplyCategorySubcategory,
    updatedAt:
      typeof raw.updatedAt === 'string' && raw.updatedAt.length >= 10
        ? raw.updatedAt.slice(0, 40)
        : new Date().toISOString(),
  };
}

export function loadGlobalEntryDefaults(): GlobalEntryDefaults {
  if (typeof localStorage === 'undefined') {
    return createDefaultGlobalEntryDefaults();
  }
  try {
    const raw = localStorage.getItem(GLOBAL_DEFAULTS_KEY);
    if (!raw) return createDefaultGlobalEntryDefaults();
    return sanitizeGlobalEntryDefaults(JSON.parse(raw) as Partial<GlobalEntryDefaults>);
  } catch {
    return createDefaultGlobalEntryDefaults();
  }
}

export function saveGlobalEntryDefaults(next: GlobalEntryDefaults): GlobalEntryDefaults {
  const sanitized = sanitizeGlobalEntryDefaults({
    ...next,
    updatedAt: next.updatedAt || new Date().toISOString(),
  });
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(GLOBAL_DEFAULTS_KEY, JSON.stringify(sanitized));
    } catch (err) {
      console.error('Failed to persist global entry defaults:', err);
    }
  }
  return sanitized;
}

export function resetGlobalEntryDefaults(): GlobalEntryDefaults {
  const defaults = createDefaultGlobalEntryDefaults();
  return saveGlobalEntryDefaults(defaults);
}
