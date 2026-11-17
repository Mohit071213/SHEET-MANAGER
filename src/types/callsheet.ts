export type CallStatus = 'Resolved' | 'Unresolved';

export type AppSection =
  | 'dashboard'
  | 'add'
  | 'history'
  | 'master'
  | 'export'
  | 'settings';

export type OperatingMode = 'local' | 'cloud';

export type SyncStatus = 'Synced' | 'Syncing' | 'Sync Failed' | 'Local Only' | 'Offline';

export const EXACT_EXCEL_HEADERS = [
  'Date',
  'Serial id',
  'Regd Mobile No',
  'Category',
  'Subcategory',
  'Status',
  'Escalations',
  'Channels',
  'Serial id', // Column 9 keeps original header verbatim for Remarks/Details
  'Names',
] as const;

export const DEFAULT_RECORD_VALUES = {
  category: 'Query',
  subcategory: 'General information related',
  escalations: 'Level1',
  channels: 'Calls',
  names: 'Mohit',
  missingSerialId: 'NA',
  unresolvedRemark: 'CX NOT RESPONSE THE CALL',
} as const;

export const UNRESOLVED_REMARK_PRESETS = [
  'Busy',
  'No Response',
  'No Answer',
  'Not Available',
  'Invalid',
  'Disconnected',
  'Not Connected',
] as const;

export const RESOLVED_REMARK_PRESETS = [
  'Resolved',
  'Repayment',
  'Pay Link',
  'Bank Change',
  'General Query',
  'Rejected',
  'Other Language',
  'Transferred',
] as const;

export interface CallRecord {
  id: string;
  rowIndex: number; // 1-based row position in master/output sheet
  date: string; // Preserved date string e.g. 17-11-2026
  serialId: string;
  mobileNo: string; // Strictly string to preserve all digits
  category: string;
  subcategory: string;
  status: CallStatus;
  escalations: string;
  channels: string;
  remark: string; // Stored in Column 9 ("Serial id")
  names: string;
  source: 'master' | 'added';
  createdAt: string; // ISO timestamp
  addedDateKey: string; // DD-MM-YYYY for "Added Today" calculation
  isDuplicateMobile?: boolean;
  isDuplicateSerial?: boolean;
  deviceTag?: string;
}

export interface ParsedDraftRecord {
  id: string;
  date: string;
  serialId: string;
  mobileNo: string;
  category: string;
  subcategory: string;
  rawRemark: string;
  mappedStatus: CallStatus | null; // null when ambiguous / needs user clarification
  mappedRemark: string;
  needsStatusClarification: boolean;
  needsMobileClarification: boolean;
  clarificationReason?: string;
  isDuplicateMobile: boolean;
  isDuplicateSerial: boolean;
  rawInputLine?: string;
}

export interface WorkbookMetadata {
  fileName: string;
  sheetName: string;
  dateFormat: string;
  headerRowIndex: number;
  originalRecordCount: number;
  hasFrozenHeader: boolean;
  hasAutoFilter: boolean;
  columnWidths: number[];
  extractedCategories: Record<string, string[]>;
  loadedAt: string;
  lastUpdatedAt: string;
  fileSizeBytes: number;
}

export interface LocalVersionSnapshot {
  id: string;
  label: string;
  createdAt: string;
  fileName: string;
  totalRecords: number;
  addedRecordsCount: number;
  buffer: ArrayBuffer;
}
