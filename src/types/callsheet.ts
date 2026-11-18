export type EmployeeName = 'Bhaskar' | 'Mohit' | 'Dishant' | 'Vishal';

export const EMPLOYEES: ReadonlyArray<{
  name: EmployeeName;
  id: 'bhaskar' | 'mohit' | 'dishant' | 'vishal';
  sheetLabel: string;
}> = [
  { name: 'Bhaskar', id: 'bhaskar', sheetLabel: 'Bhaskar Master Sheet' },
  { name: 'Mohit', id: 'mohit', sheetLabel: 'Mohit Master Sheet' },
  { name: 'Dishant', id: 'dishant', sheetLabel: 'Dishant Master Sheet' },
  { name: 'Vishal', id: 'vishal', sheetLabel: 'Vishal Master Sheet' },
] as const;

export type EmployeeId = (typeof EMPLOYEES)[number]['id'];

export function getEmployeeConfig(name: EmployeeName) {
  return EMPLOYEES.find((e) => e.name === name) ?? EMPLOYEES[1];
}

export type CallStatus = 'Resolved' | 'Unresolved';

export type AppSection =
  | 'dashboard'
  | 'add'
  | 'history'
  | 'master'
  | 'shortcuts'
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

// Mandatory Category Dropdown (3 permitted values)
export const PERMITTED_CATEGORIES = ['Query', 'Request', 'Complaint'] as const;
export type CategoryOption = (typeof PERMITTED_CATEGORIES)[number];

// Mandatory Subcategory Dropdown (6 permitted values)
export const PERMITTED_SUBCATEGORIES = [
  'General information related',
  'Credit Discrepancy',
  'Charges & Tenure',
  'Settlement & Waiver',
  'Extension Related',
  'Refund & Double Deduction',
] as const;
export type SubcategoryOption = (typeof PERMITTED_SUBCATEGORIES)[number];

// Mandatory Remarks Dropdown (exact 45 permitted values verbatim)
export const PERMITTED_REMARKS = [
  'cx asking repayment date inquiries',
  'Bank details occupied',
  'Payment updation',
  'Foreclose & Cooling period',
  'ivr calls',
  'CX NOT RESPONSE THE CALL',
  'Transfering',
  'payment receipts',
  'general query',
  'cx foreclose the loan',
  'CX requested to stop IVR calls, is irritated, and will pay by end of day',
  'CX paid but not updated in app',
  'CX ASKING OVERDUE AMOUNT INQUIRIES',
  'getting fraud &harassment calls',
  'CX DELETED THE ACCOUNT',
  'E-NACH RELATED',
  'Request for company location / registration details',
  'GST & RBI registration details',
  'Loan stage / loan status enquiry',
  'Loan rejection reason',
  'Suit Filed status removal',
  'Post-Written off removal',
  'DPD removal',
  'Outstanding balance removal',
  'Waiver request and settlement cases',
  'Refund for failed payment',
  'Refund for Extra Payment',
  'Extension request for more days',
  'Complaint on wrong details update in credit reports',
  'Incorrect loan details mapped',
  'Payment status / loan status not updated',
  'Charges, Rates & FPC related',
  'Coercive methods of collection',
  'APR logic and understanding',
  'Soft call related complaints',
  'NOC',
  'Cancel request',
  'bank details',
  'other language',
  'higher limit/ tenure',
  'Payment link',
  'partial payment query',
  'cx disconnect the call in conversation',
  'Application issue',
  'Change Details',
] as const;
export type RemarkOption = (typeof PERMITTED_REMARKS)[number];

export const DEFAULT_ESCALATION_OPTIONS = [
  'Level1',
  'Level2',
  'Level3',
  'Escalated',
  'None',
] as const;

export const DEFAULT_CHANNEL_OPTIONS = [
  'Calls',
  'Email',
  'Chat',
  'WhatsApp',
  'Inbound',
  'Outbound',
] as const;

export const DATA_RETENTION_DAYS = 7;
export const DATA_RETENTION_MS = DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export interface GlobalEntryDefaults {
  defaultCategory: CategoryOption;
  defaultSubcategory: SubcategoryOption;
  defaultEscalations: string;
  defaultChannels: string;
  alwaysApplyCategorySubcategory: boolean;
  updatedAt: string;
}

export const DEFAULT_RECORD_VALUES = {
  category: 'Query' as CategoryOption,
  subcategory: 'General information related' as SubcategoryOption,
  escalations: 'Level1',
  channels: 'Calls',
  names: 'Mohit' as string,
  missingSerialId: 'NA',
  unresolvedRemark: 'CX NOT RESPONSE THE CALL' as RemarkOption,
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
  'general query',
  'Payment link',
  'cx asking repayment date inquiries',
  'Loan rejection reason',
  'Transfering',
  'other language',
  'NOC',
  'Change Details',
] as const;

export interface ShortcutRule {
  id: string;
  trigger: string;
  matchType: 'exact' | 'contains' | 'regex';
  status: CallStatus;
  category: CategoryOption;
  subcategory: SubcategoryOption;
  remark: RemarkOption;
  enabled: boolean;
  isCustom?: boolean;
}

export interface ShortcutHistoryEntry {
  id: string;
  action: 'added' | 'edited' | 'deleted' | 'toggled' | 'reset';
  trigger: string;
  status: CallStatus;
  category: CategoryOption;
  subcategory: SubcategoryOption;
  remark: RemarkOption;
  createdAt: string;
}

export interface LocalAiConfig {
  enabled: boolean;
  endpointUrl: string;
  modelName: string;
}

export interface AiRemarkSuggestion {
  status: CallStatus;
  category: CategoryOption;
  subcategory: SubcategoryOption;
  remark: RemarkOption;
  score: number;
}

export interface ColumnMapping {
  dateCol: number;
  serialIdCol: number;
  mobileCol: number;
  categoryCol: number;
  subcategoryCol: number;
  statusCol: number;
  escalationsCol: number;
  channelsCol: number;
  remarkCol: number;
  namesCol: number;
}

export interface CallRecord {
  id: string;
  rowIndex: number; // 1-based row position in master/output sheet
  date: string; // Preserved date string e.g. 17-11-2026
  serialId: string;
  mobileNo: string; // Strictly string to preserve digits & leading zeros; '' if absent
  category: string;
  subcategory: string;
  status: CallStatus;
  escalations: string;
  channels: string;
  remark: string; // Stored in Column 9 ("Serial id" / Remarks)
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
  category: CategoryOption;
  subcategory: SubcategoryOption;
  escalations?: string;
  channels?: string;
  rawRemark: string;
  mappedStatus: CallStatus | null; // null when ambiguous / needs user clarification
  mappedRemark: RemarkOption | '';
  needsStatusClarification: boolean;
  needsMobileClarification: boolean; // true only if BOTH serialId and mobileNo are missing or ambiguous
  clarificationReason?: string;
  isDuplicateMobile: boolean;
  isDuplicateSerial: boolean;
  isDuplicateBatch?: boolean;
  skipped?: boolean;
  matchedShortcutTrigger?: string;
  confidenceScore?: number;
  analysisLayer?: 'shortcut' | 'semantic-nlp' | 'ollama-local' | 'manual';
  aiSuggestions?: AiRemarkSuggestion[];
  timestamp?: string;
  sequenceRef?: string;
  rawInputLine?: string;
}

export interface BulkProcessingSummary {
  totalDetected: number;
  successfullyIdentified: number;
  phonesDetected: number;
  serialIdsDetected: number;
  assignedNaCount: number;
  dropdownsMappedCount: number;
  duplicateCount: number;
  reviewRequiredCount: number;
}

export interface WorkbookDropdowns {
  categories?: string[];
  subcategories?: string[];
  statuses?: string[];
  remarks?: string[];
}

export interface WorkbookMetadata {
  fileName: string;
  sheetName: string;
  sheetNames?: string[];
  headers?: string[];
  columnMapping?: ColumnMapping;
  workbookDropdowns?: WorkbookDropdowns;
  dateFormat: string;
  headerRowIndex: number;
  originalRecordCount: number;
  hasFrozenHeader: boolean;
  hasAutoFilter: boolean;
  hasDropdownValidations?: boolean;
  columnWidths: number[];
  extractedCategories: Record<string, string[]>;
  loadedAt: string;
  lastUpdatedAt: string;
  fileSizeBytes: number;
}

export interface LocalVersionSnapshot {
  id: string;
  employeeId?: EmployeeId;
  label: string;
  createdAt: string;
  fileName: string;
  totalRecords: number;
  addedRecordsCount: number;
  buffer: ArrayBuffer;
}
