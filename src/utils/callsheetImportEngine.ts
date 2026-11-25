import ExcelJS from 'exceljs';
import {
  CallRecord,
  CallStatus,
  CategoryOption,
  DEFAULT_RECORD_VALUES,
  EmployeeName,
  GlobalEntryDefaults,
  ParsedDraftRecord,
  RemarkOption,
  ShortcutRule,
  SubcategoryOption,
} from '../types/callsheet';
import {
  buildFinalCallRecord,
  checkDuplicates,
  formatDateToPattern,
  formatTodayDDMMYYYY,
  isValidDateInput,
  isValidMobileText,
  mapRemarkToStatusAndColumn9,
  normalizeCategory,
  normalizeMobileAsText,
  normalizeSerialId,
  normalizeSubcategory,
} from './statusMapper';
import { findExactPermittedRemark } from './shortcutDictionary';

export type CallsheetTargetField =
  | ''
  | 'date'
  | 'serialId'
  | 'mobileNo'
  | 'category'
  | 'subcategory'
  | 'status'
  | 'escalations'
  | 'channels'
  | 'remark'
  | 'names';

export const CALLSHEET_FIELD_OPTIONS: Array<{
  value: CallsheetTargetField;
  label: string;
}> = [
  { value: '', label: '-- Skip Column --' },
  { value: 'date', label: 'Date' },
  { value: 'serialId', label: 'Serial id (S ID)' },
  { value: 'mobileNo', label: 'Regd Mobile No' },
  { value: 'category', label: 'Category' },
  { value: 'subcategory', label: 'Subcategory' },
  { value: 'status', label: 'Status' },
  { value: 'escalations', label: 'Escalations' },
  { value: 'channels', label: 'Channels' },
  { value: 'remark', label: 'Remarks (Col 9)' },
  { value: 'names', label: 'Names (Employee)' },
];

export interface ParsedCallsheetSheet {
  sheetName: string;
  headerRowIndex: number; // 1-based
  rawRows: string[][];
}

export interface ParsedCallsheetImportFile {
  fileName: string;
  sheets: ParsedCallsheetSheet[];
}

export interface CallsheetImportDraftRow {
  id: string;
  sourceRowNumber: number;
  include: boolean;
  date: string;
  serialId: string;
  mobileNo: string;
  category: CategoryOption;
  subcategory: SubcategoryOption;
  status: CallStatus;
  escalations: string;
  channels: string;
  remark: RemarkOption;
  rawRemark: string;
  names: string;
  isDuplicateMobile: boolean;
  isDuplicateSerial: boolean;
  isDuplicateBatch: boolean;
  missingIdentifier: boolean;
  matchedShortcutTrigger?: string;
}

function parseCsvMatrix(csvText: string): string[][] {
  const clean = csvText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '"') {
      if (inQuotes && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      row.push(field.trim());
      field = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some((c) => c !== '')) {
        rows.push(row);
      }
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((c) => c !== '')) {
    rows.push(row);
  }
  return rows;
}

function extractExcelCellString(cell: ExcelJS.Cell): string {
  const val = cell.value;
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    return formatDateToPattern(val, 'DD-MM-YYYY');
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return val.toLocaleString('fullwide', { useGrouping: false });
    }
    return String(val);
  }
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'object') {
    if ('richText' in val && Array.isArray(val.richText)) {
      return val.richText.map((r) => r.text).join('').trim();
    }
    if ('text' in val && typeof val.text === 'string') {
      return val.text.trim();
    }
    if ('result' in val && val.result !== undefined && val.result !== null) {
      if (val.result instanceof Date) {
        return formatDateToPattern(val.result, 'DD-MM-YYYY');
      }
      return String(val.result).trim();
    }
    if ('hyperlink' in val && typeof val.text === 'string') {
      return val.text.trim();
    }
  }
  return String(val).trim();
}

export async function parseCallsheetImportFile(
  file: File
): Promise<ParsedCallsheetImportFile> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.xls')) {
    throw new Error(
      'Legacy binary .xls files are not supported directly in browser mode. Please save the file as .xlsx or .csv in Excel / Google Sheets first.'
    );
  }

  if (lower.endsWith('.csv')) {
    const text = await file.text();
    const matrix = parseCsvMatrix(text);
    if (matrix.length === 0) {
      throw new Error('The selected CSV file is empty.');
    }
    return {
      fileName: file.name,
      sheets: [
        {
          sheetName: file.name.replace(/\.csv$/i, '') || 'CSV Data',
          headerRowIndex: 1,
          rawRows: matrix,
        },
      ],
    };
  }

  if (!lower.endsWith('.xlsx')) {
    throw new Error('Unsupported file format. Choose an .xlsx or .csv spreadsheet.');
  }

  const buffer = await file.arrayBuffer();
  const view = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  if (view.length < 2 || view[0] !== 0x50 || view[1] !== 0x4b) {
    throw new Error('Invalid .xlsx workbook. Please choose a genuine Excel .xlsx or .csv file.');
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new Error('Could not open this .xlsx workbook. Ensure it is not password-protected.');
  }

  const sheets: ParsedCallsheetSheet[] = [];
  for (const ws of wb.worksheets) {
    const matrix: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cells[colNumber - 1] = extractExcelCellString(cell);
      });
      for (let i = 0; i < cells.length; i++) {
        if (cells[i] === undefined) cells[i] = '';
      }
      if (cells.some((c) => c !== '')) {
        matrix.push(cells);
      }
    });

    if (matrix.length === 0) continue;

    // Auto-detect header row in top 12 rows
    let headerRowIndex = 1;
    let bestScore = -1;
    const scanLimit = Math.min(12, matrix.length);
    for (let r = 0; r < scanLimit; r++) {
      const rowLower = matrix[r].map((c) => c.toLowerCase()).join('|');
      const nonEmpty = matrix[r].filter(Boolean).length;
      const bonus =
        (rowLower.includes('date') ? 3 : 0) +
        (rowLower.includes('mobile') || rowLower.includes('phone') ? 3 : 0) +
        (rowLower.includes('serial') ? 2 : 0);
      const score = nonEmpty + bonus;
      if (score > bestScore) {
        bestScore = score;
        headerRowIndex = r + 1;
      }
    }

    sheets.push({
      sheetName: ws.name,
      headerRowIndex,
      rawRows: matrix,
    });
  }

  if (sheets.length === 0) {
    throw new Error('No populated rows were found in this workbook.');
  }

  return { fileName: file.name, sheets };
}

export function extractHeadersAndRows(
  sheet: ParsedCallsheetSheet,
  headerRowIndex1Based: number
): { headers: string[]; dataRows: string[][] } {
  const safeIdx = Math.max(0, Math.min(sheet.rawRows.length - 1, headerRowIndex1Based - 1));
  const rawHeaderRow = sheet.rawRows[safeIdx] ?? [];
  const dataRows = sheet.rawRows.slice(safeIdx + 1);
  const colCount = Math.max(
    rawHeaderRow.length,
    ...dataRows.slice(0, 50).map((r) => r.length),
    0
  );
  const headers: string[] = [];
  for (let i = 0; i < colCount; i++) {
    headers.push((rawHeaderRow[i] ?? '').trim() || `Column ${i + 1}`);
  }
  return { headers, dataRows };
}

export function autoMapCallsheetHeaders(
  headers: string[]
): Record<number, CallsheetTargetField> {
  const mapping: Record<number, CallsheetTargetField> = {};
  const usedTargets = new Set<CallsheetTargetField>();
  let serialCount = 0;

  headers.forEach((rawHeader, idx) => {
    const h = rawHeader.trim().toLowerCase();
    let matched: CallsheetTargetField = '';

    if (h === 'date' || h.includes('call date')) {
      matched = 'date';
    } else if (/^serial\s*id$/i.test(h) || h === 's id' || h === 'sid' || h === 'serial') {
      serialCount += 1;
      // Second "Serial id" column in CallSheet master workbooks holds Remarks
      matched = serialCount === 1 ? 'serialId' : 'remark';
    } else if (
      h.includes('remark') ||
      h.includes('disposition') ||
      h.includes('note') ||
      h.includes('comment')
    ) {
      matched = 'remark';
    } else if (h.includes('mobile') || h.includes('phone') || h.includes('contact')) {
      matched = 'mobileNo';
    } else if (h === 'category' || h === 'cat') {
      matched = 'category';
    } else if (h.includes('sub') && h.includes('cat')) {
      matched = 'subcategory';
    } else if (h === 'status') {
      matched = 'status';
    } else if (h.includes('escalation')) {
      matched = 'escalations';
    } else if (h.includes('channel')) {
      matched = 'channels';
    } else if (h === 'names' || h === 'name' || h.includes('agent') || h.includes('employee')) {
      matched = 'names';
    }

    if (matched && (!usedTargets.has(matched) || matched === 'remark')) {
      mapping[idx] = matched;
      usedTargets.add(matched);
    } else {
      mapping[idx] = '';
    }
  });

  return mapping;
}

export function buildCallsheetImportDrafts(params: {
  dataRows: string[][];
  headerRowIndex: number;
  columnMapping: Record<number, CallsheetTargetField>;
  existingRecords: Array<{ serialId: string; mobileNo: string }>;
  shortcutRules: ShortcutRule[];
  globalDefaults: GlobalEntryDefaults;
  employeeName: EmployeeName;
}): CallsheetImportDraftRow[] {
  const {
    dataRows,
    headerRowIndex,
    columnMapping,
    existingRecords,
    shortcutRules,
    globalDefaults,
    employeeName,
  } = params;

  const today = formatTodayDDMMYYYY();
  const seenBatchMobiles = new Set<string>();
  const seenBatchSerials = new Set<string>();
  const drafts: CallsheetImportDraftRow[] = [];

  dataRows.forEach((cells, idx) => {
    const fieldVals: Partial<Record<Exclude<CallsheetTargetField, ''>, string>> = {};
    Object.entries(columnMapping).forEach(([colIdxStr, field]) => {
      if (!field) return;
      const val = (cells[Number(colIdxStr)] ?? '').trim();
      if (val) {
        fieldVals[field] = val;
      }
    });

    // Skip completely empty rows after mapping
    const hasAnyMappedContent = Object.values(fieldVals).some((v) => Boolean(v && v.trim()));
    if (!hasAnyMappedContent) return;

    const rawDate = fieldVals.date?.trim() ?? '';
    const finalDate = rawDate && isValidDateInput(rawDate) ? rawDate : rawDate || today;

    const mobileNo = normalizeMobileAsText(fieldVals.mobileNo ?? '');
    const serialId = normalizeSerialId(fieldVals.serialId ?? '');

    const rawRemark = fieldVals.remark?.trim() ?? '';
    const explicitStatus: CallStatus | null =
      fieldVals.status?.toLowerCase() === 'resolved'
        ? 'Resolved'
        : fieldVals.status?.toLowerCase() === 'unresolved'
          ? 'Unresolved'
          : null;
    const exactRemark = findExactPermittedRemark(rawRemark) || '';

    const mapped = mapRemarkToStatusAndColumn9(
      rawRemark || 'general query',
      explicitStatus,
      shortcutRules,
      {
        explicitRemark: exactRemark || undefined,
        explicitCategory: fieldVals.category
          ? normalizeCategory(fieldVals.category)
          : undefined,
        explicitSubcategory: fieldVals.subcategory
          ? normalizeSubcategory(fieldVals.subcategory)
          : undefined,
        defaultCategory: globalDefaults.defaultCategory,
        defaultSubcategory: globalDefaults.defaultSubcategory,
        alwaysApplyCategorySubcategory: globalDefaults.alwaysApplyCategorySubcategory,
      }
    );

    const status: CallStatus =
      explicitStatus ?? mapped.status ?? (rawRemark ? 'Resolved' : 'Unresolved');
    const finalRemark: RemarkOption =
      exactRemark ||
      mapped.remark ||
      (status === 'Unresolved'
        ? DEFAULT_RECORD_VALUES.unresolvedRemark
        : 'general query');

    const dupExisting = checkDuplicates(serialId, mobileNo, existingRecords);
    const normMob = mobileNo;
    const normSid = serialId.toLowerCase();
    const batchDupMob = normMob.length > 0 && seenBatchMobiles.has(normMob);
    const batchDupSid = normSid !== 'na' && normSid.length > 0 && seenBatchSerials.has(normSid);

    if (normMob) seenBatchMobiles.add(normMob);
    if (normSid !== 'na' && normSid) seenBatchSerials.add(normSid);

    const isDuplicateMobile = dupExisting.isDuplicateMobile || batchDupMob;
    const isDuplicateSerial = dupExisting.isDuplicateSerial || batchDupSid;
    const isDuplicateBatch = batchDupMob || batchDupSid;
    const hasMobile = isValidMobileText(mobileNo);
    const hasSerial = serialId !== DEFAULT_RECORD_VALUES.missingSerialId;
    const missingIdentifier = !hasMobile && !hasSerial;

    drafts.push({
      id: `imp_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      sourceRowNumber: headerRowIndex + 1 + idx,
      include: !missingIdentifier && !(isDuplicateMobile || isDuplicateSerial),
      date: finalDate,
      serialId,
      mobileNo,
      category: fieldVals.category
        ? normalizeCategory(fieldVals.category)
        : mapped.category,
      subcategory: fieldVals.subcategory
        ? normalizeSubcategory(fieldVals.subcategory)
        : mapped.subcategory,
      status,
      escalations: fieldVals.escalations?.trim() || globalDefaults.defaultEscalations,
      channels: fieldVals.channels?.trim() || globalDefaults.defaultChannels,
      remark: finalRemark,
      rawRemark,
      names: fieldVals.names?.trim() || employeeName,
      isDuplicateMobile,
      isDuplicateSerial,
      isDuplicateBatch,
      missingIdentifier,
      matchedShortcutTrigger: mapped.matchedTrigger,
    });
  });

  return drafts;
}

export function finalizeImportedCallRecords(params: {
  drafts: CallsheetImportDraftRow[];
  startRowIndex: number;
  employeeName: EmployeeName;
  globalDefaults: GlobalEntryDefaults;
}): CallRecord[] {
  const { drafts, startRowIndex, employeeName, globalDefaults } = params;
  const todayKey = formatTodayDDMMYYYY();

  return drafts
    .filter((d) => d.include)
    .map((d, idx) => {
      const parsedDraft: ParsedDraftRecord = {
        id: d.id,
        date: d.date,
        serialId: d.serialId,
        mobileNo: d.mobileNo,
        category: d.category,
        subcategory: d.subcategory,
        escalations: d.escalations,
        channels: d.channels,
        rawRemark: d.rawRemark,
        mappedStatus: d.status,
        mappedRemark: d.remark,
        needsStatusClarification: false,
        needsMobileClarification: d.missingIdentifier,
        isDuplicateMobile: d.isDuplicateMobile,
        isDuplicateSerial: d.isDuplicateSerial,
        isDuplicateBatch: d.isDuplicateBatch,
      };
      return buildFinalCallRecord(
        parsedDraft,
        startRowIndex + idx,
        todayKey,
        (d.names as EmployeeName) || employeeName,
        undefined,
        globalDefaults
      );
    });
}
