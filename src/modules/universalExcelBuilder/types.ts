import type { BuilderIndustry } from './config';

export type BuilderColumnType =
  | 'text'
  | 'number'
  | 'date'
  | 'dropdown'
  | 'boolean'
  | 'phone'
  | 'email'
  | 'autoDate';

export type BuilderDefaultMode = 'none' | 'today' | 'firstOption' | 'custom';

export type BuilderDuplicateStrategy = 'flag' | 'skip' | 'allow';

export type BuilderShortcutMatchMode = 'contains' | 'exact' | 'startsWith' | 'regex';

export interface BuilderColumn {
  id: string;
  key: string;
  label: string;
  order: number;
  type: BuilderColumnType;
  required: boolean;
  unique: boolean;
  defaultMode: BuilderDefaultMode;
  defaultValue: string;
  dropdownOptions: string[];
  width: number;
  validationRegex?: string;
  minValue?: number;
  maxValue?: number;
}

export interface BuilderWorkbook {
  id: string;
  ownerId: string;
  name: string;
  industry: BuilderIndustry;
  description: string;
  sheetName: string;
  headerRowIndex: number;
  freezeHeader: boolean;
  autoFilter: boolean;
  duplicateStrategy: BuilderDuplicateStrategy;
  archived: boolean;
  columns: BuilderColumn[];
  rowCount: number;
  createdAt: string;
  updatedAt: string;
  cloudVersion?: number;
  lastSyncedAt?: string;
}

export type BuilderCellValue = string | number | boolean;

export interface BuilderRecord {
  id: string;
  workbookId: string;
  ownerId: string;
  rowOrder: number;
  values: Record<string, BuilderCellValue>;
  isDuplicate: boolean;
  duplicateFields: string[];
  validationWarnings: string[];
  source: 'form' | 'bulk' | 'import';
  createdAt: string;
  updatedAt: string;
}

export interface BuilderShortcutAssignment {
  columnId: string;
  value: string;
}

export interface BuilderShortcutRule {
  id: string;
  workbookId: string;
  ownerId: string;
  name: string;
  triggerText: string;
  matchMode: BuilderShortcutMatchMode;
  assignments: BuilderShortcutAssignment[];
  priority: number;
  enabled: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BuilderTemplate {
  id: string;
  ownerId: string;
  name: string;
  industry: BuilderIndustry;
  description: string;
  isBuiltIn: boolean;
  sheetName: string;
  columns: Array<Omit<BuilderColumn, 'id'>>;
  createdAt: string;
}

export type BuilderViewSection =
  | 'workbooks'
  | 'templates'
  | 'standalone-import'
  | 'columns'
  | 'entry'
  | 'bulk'
  | 'preview'
  | 'rules'
  | 'import-export';
