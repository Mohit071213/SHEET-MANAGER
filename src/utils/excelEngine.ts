import ExcelJS from 'exceljs';
import {
  CallRecord,
  CallStatus,
  ColumnMapping,
  DEFAULT_RECORD_VALUES,
  EmployeeName,
  EXACT_EXCEL_HEADERS,
  GlobalEntryDefaults,
  PERMITTED_CATEGORIES,
  PERMITTED_REMARKS,
  PERMITTED_SUBCATEGORIES,
  WorkbookDropdowns,
  WorkbookMetadata,
} from '../types/callsheet';
import {
  formatDateToPattern,
  formatTodayDDMMYYYY,
  normalizeCategory,
  normalizeMobileAsText,
  normalizeSerialId,
  normalizeSubcategory,
} from './statusMapper';

const MAX_EXCEL_BYTES = 25 * 1024 * 1024; // 25 MB safety limit

export interface ParsedWorkbookResult {
  metadata: WorkbookMetadata;
  records: CallRecord[];
  masterBuffer: ArrayBuffer;
}

function cellValueToString(cell: ExcelJS.Cell, dateFormatHint: string): string {
  const val = cell.value;
  if (val === null || val === undefined) return '';

  if (val instanceof Date) {
    return formatDateToPattern(val, dateFormatHint);
  }

  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return val.toLocaleString('fullwide', { useGrouping: false });
    }
    return String(val);
  }

  if (typeof val === 'string') {
    return val.trim();
  }

  if (typeof val === 'object') {
    if ('richText' in val && Array.isArray(val.richText)) {
      return val.richText.map((rt) => rt.text).join('').trim();
    }
    if ('text' in val && typeof val.text === 'string') {
      return val.text.trim();
    }
    if ('result' in val && val.result !== undefined && val.result !== null) {
      if (val.result instanceof Date) {
        return formatDateToPattern(val.result, dateFormatHint);
      }
      return String(val.result).trim();
    }
    if ('hyperlink' in val && typeof val.text === 'string') {
      return val.text.trim();
    }
  }

  return String(val).trim();
}

function detectDatePatternFromText(samples: string[]): string {
  for (const sample of samples) {
    if (/^\d{2}-\d{2}-\d{4}$/.test(sample)) return 'DD-MM-YYYY';
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(sample)) return 'DD/MM/YYYY';
    if (/^\d{4}-\d{2}-\d{2}$/.test(sample)) return 'YYYY-MM-DD';
  }
  return 'DD-MM-YYYY';
}

function findHeaderRow(worksheet: ExcelJS.Worksheet): number {
  const maxScan = Math.min(worksheet.rowCount || 15, 15);
  for (let r = 1; r <= maxScan; r++) {
    const row = worksheet.getRow(r);
    const values: string[] = [];
    for (let c = 1; c <= Math.max(12, worksheet.columnCount || 12); c++) {
      values.push(cellValueToString(row.getCell(c), 'DD-MM-YYYY').toLowerCase());
    }
    const joined = values.join('|');
    if (
      joined.includes('date') &&
      (joined.includes('mobile') || joined.includes('serial'))
    ) {
      return r;
    }
  }
  return 1;
}

export function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    dateCol: 1,
    serialIdCol: 2,
    mobileCol: 3,
    categoryCol: 4,
    subcategoryCol: 5,
    statusCol: 6,
    escalationsCol: 7,
    channelsCol: 8,
    remarkCol: 9,
    namesCol: 10,
  };

  let foundSerialId = false;
  headers.forEach((rawHeader, index) => {
    const colNum = index + 1;
    const h = rawHeader.trim().toLowerCase();
    if (!h) return;

    if (h === 'date' || h.includes('call date')) {
      mapping.dateCol = colNum;
    } else if (/^serial\s*id$/i.test(h) || h === 's id' || h === 'sid') {
      if (!foundSerialId) {
        mapping.serialIdCol = colNum;
        foundSerialId = true;
      } else {
        // Second "Serial id" column is always the Remarks column in the master workbook
        mapping.remarkCol = colNum;
      }
    } else if (h.includes('remark')) {
      mapping.remarkCol = colNum;
    } else if (h.includes('mobile') || h.includes('phone') || h.includes('contact')) {
      mapping.mobileCol = colNum;
    } else if (h === 'category') {
      mapping.categoryCol = colNum;
    } else if (h.includes('sub') && h.includes('category')) {
      mapping.subcategoryCol = colNum;
    } else if (h === 'status') {
      mapping.statusCol = colNum;
    } else if (h.includes('escalation')) {
      mapping.escalationsCol = colNum;
    } else if (h.includes('channel')) {
      mapping.channelsCol = colNum;
    } else if (h === 'names' || h === 'name' || h.includes('agent')) {
      mapping.namesCol = colNum;
    }
  });

  return mapping;
}

function normalizeStatus(raw: string): CallStatus {
  return raw.trim().toLowerCase() === 'unresolved' ? 'Unresolved' : 'Resolved';
}

function assertValidZipSignature(buffer: ArrayBuffer): void {
  const view = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  // .xlsx files are ZIP archives starting with PK (0x50 0x4B)
  if (view.length < 2 || view[0] !== 0x50 || view[1] !== 0x4b) {
    throw new Error(
      'Invalid .xlsx file format (ZIP signature missing). Please upload a genuine Excel .xlsx workbook.'
    );
  }
}

function columnNumberToLetter(colNum: number): string {
  let num = colNum;
  let letters = '';
  while (num > 0) {
    const mod = (num - 1) % 26;
    letters = String.fromCharCode(65 + mod) + letters;
    num = Math.floor((num - 1) / 26);
  }
  return letters || 'A';
}

function columnLettersToNumber(letters: string): number {
  let num = 0;
  const upper = letters.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    num = num * 26 + (upper.charCodeAt(i) - 64);
  }
  return num;
}

function resolveValidationListOptions(
  workbook: ExcelJS.Workbook,
  activeSheet: ExcelJS.Worksheet,
  dv?: ExcelJS.DataValidation
): string[] | undefined {
  if (!dv || dv.type !== 'list' || !Array.isArray(dv.formulae) || dv.formulae.length === 0) {
    return undefined;
  }
  const rawFormula = String(dv.formulae[0] ?? '').trim().replace(/^=/, '');
  if (!rawFormula) return undefined;

  const rangeMatch = rawFormula.match(
    /^(?:(?:'([^']+)'|([A-Za-z0-9_ ]+))!)?\$?([A-Za-z]+)\$?(\d+):\$?([A-Za-z]+)\$?(\d+)$/
  );
  if (rangeMatch) {
    const sheetName = (rangeMatch[1] || rangeMatch[2] || '').trim();
    const targetSheet = sheetName ? workbook.getWorksheet(sheetName) : activeSheet;
    if (!targetSheet) return undefined;

    const c1 = columnLettersToNumber(rangeMatch[3]);
    const r1 = Number(rangeMatch[4]);
    const c2 = columnLettersToNumber(rangeMatch[5]);
    const r2 = Number(rangeMatch[6]);
    const values: string[] = [];
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
      for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
        const text = cellValueToString(targetSheet.getRow(r).getCell(c), 'DD-MM-YYYY');
        if (text) values.push(text);
      }
    }
    return values.length > 0 ? Array.from(new Set(values)) : undefined;
  }

  const inline = rawFormula.replace(/^"|"$/g, '');
  const items = inline
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export async function parseMasterWorkbook(
  buffer: ArrayBuffer,
  fileName: string
): Promise<ParsedWorkbookResult> {
  if (!fileName.toLowerCase().endsWith('.xlsx')) {
    throw new Error(
      'Only .xlsx Excel workbooks are supported. Please upload a valid .xlsx file.'
    );
  }
  if (!buffer || buffer.byteLength < 100) {
    throw new Error('The uploaded file appears empty or corrupted.');
  }
  if (buffer.byteLength > MAX_EXCEL_BYTES) {
    throw new Error('Excel file exceeds the 25 MB safety limit.');
  }
  assertValidZipSignature(buffer);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new Error(
      'Unable to read this .xlsx file. The workbook may be password-protected or corrupted.'
    );
  }

  if (workbook.worksheets.length === 0) {
    throw new Error('The uploaded workbook contains no worksheets.');
  }

  // Pick first worksheet with data rows, defaulting to worksheet[0]
  const worksheet =
    workbook.worksheets.find((ws) => ws.rowCount > 0) ?? workbook.worksheets[0];

  const headerRowIndex = findHeaderRow(worksheet);
  const headerRow = worksheet.getRow(headerRowIndex);
  const totalCols = Math.max(10, Math.min(30, worksheet.columnCount || 10));
  const detectedHeaders: string[] = [];
  for (let c = 1; c <= totalCols; c++) {
    detectedHeaders.push(cellValueToString(headerRow.getCell(c), 'DD-MM-YYYY'));
  }
  // Trim trailing empty header columns while keeping at least 10
  while (detectedHeaders.length > 10 && !detectedHeaders[detectedHeaders.length - 1]) {
    detectedHeaders.pop();
  }

  const hasAnyValidHeader = detectedHeaders.some((h) =>
    /^(date|serial\s*id|regd\s*mobile\s*no|mobile|status|category)$/i.test(h)
  );
  if (worksheet.rowCount > 0 && !hasAnyValidHeader) {
    throw new Error(
      'Header row does not match expected calling sheet columns (Date, Serial id, Regd Mobile No, Category, Subcategory, Status, Escalations, Channels, Serial id, Names).'
    );
  }

  const columnMapping = detectColumnMapping(detectedHeaders);

  const dateSamples: string[] = [];
  for (
    let r = headerRowIndex + 1;
    r <= Math.min(worksheet.rowCount, headerRowIndex + 30);
    r++
  ) {
    const val = worksheet.getRow(r).getCell(columnMapping.dateCol).value;
    if (typeof val === 'string' && val.trim()) {
      dateSamples.push(val.trim());
    }
  }
  const dateFormat = detectDatePatternFromText(dateSamples);

  const records: CallRecord[] = [];
  const categoryMap: Record<string, Set<string>> = {};
  const todayKey = formatTodayDDMMYYYY();
  let hasDropdownValidations = false;

  for (let r = headerRowIndex + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const colDate = cellValueToString(row.getCell(columnMapping.dateCol), dateFormat);
    const colSerial = cellValueToString(row.getCell(columnMapping.serialIdCol), dateFormat);
    const colMobile = normalizeMobileAsText(
      cellValueToString(row.getCell(columnMapping.mobileCol), dateFormat)
    );
    const colCategory = cellValueToString(row.getCell(columnMapping.categoryCol), dateFormat);
    const colSubcategory = cellValueToString(
      row.getCell(columnMapping.subcategoryCol),
      dateFormat
    );
    const colStatus = cellValueToString(row.getCell(columnMapping.statusCol), dateFormat);
    const colEscalations = cellValueToString(
      row.getCell(columnMapping.escalationsCol),
      dateFormat
    );
    const colChannels = cellValueToString(row.getCell(columnMapping.channelsCol), dateFormat);
    const colRemark = cellValueToString(row.getCell(columnMapping.remarkCol), dateFormat);
    const colNames = cellValueToString(row.getCell(columnMapping.namesCol), dateFormat);

    if (
      !hasDropdownValidations &&
      (Boolean(row.getCell(columnMapping.categoryCol).dataValidation) ||
        Boolean(row.getCell(columnMapping.statusCol).dataValidation) ||
        Boolean(row.getCell(columnMapping.remarkCol).dataValidation))
    ) {
      hasDropdownValidations = true;
    }

    const hasData = [
      colDate,
      colSerial,
      colMobile,
      colCategory,
      colSubcategory,
      colStatus,
      colRemark,
    ].some((v) => v.length > 0);
    if (!hasData) continue;

    if (colCategory) {
      if (!categoryMap[colCategory]) {
        categoryMap[colCategory] = new Set<string>();
      }
      if (colSubcategory) {
        categoryMap[colCategory].add(colSubcategory);
      }
    }

    records.push({
      id: `master_r${r}`,
      rowIndex: r,
      date: colDate,
      serialId: normalizeSerialId(colSerial),
      mobileNo: colMobile,
      category: colCategory,
      subcategory: colSubcategory,
      status: normalizeStatus(colStatus),
      escalations: colEscalations || DEFAULT_RECORD_VALUES.escalations,
      channels: colChannels || DEFAULT_RECORD_VALUES.channels,
      remark: colRemark,
      names: colNames || DEFAULT_RECORD_VALUES.names,
      source: 'master',
      createdAt: new Date().toISOString(),
      addedDateKey: colDate || todayKey,
    });
  }

  const extractedCategories: Record<string, string[]> = {};
  for (const [cat, subs] of Object.entries(categoryMap)) {
    extractedCategories[cat] = Array.from(subs).sort((a, b) => a.localeCompare(b));
  }

  // Inspect cell dataValidation rules starting at headerRowIndex + 1 (works even on 0-row templates)
  const workbookDropdowns: WorkbookDropdowns = {};
  const dvScanEnd = Math.min(Math.max(worksheet.rowCount, headerRowIndex + 3), headerRowIndex + 10);
  for (let r = headerRowIndex + 1; r <= dvScanEnd; r++) {
    const row = worksheet.getRow(r);
    if (!workbookDropdowns.categories) {
      const opts = resolveValidationListOptions(
        workbook,
        worksheet,
        row.getCell(columnMapping.categoryCol).dataValidation
      );
      if (opts) {
        workbookDropdowns.categories = opts;
        hasDropdownValidations = true;
      }
    }
    if (!workbookDropdowns.subcategories) {
      const opts = resolveValidationListOptions(
        workbook,
        worksheet,
        row.getCell(columnMapping.subcategoryCol).dataValidation
      );
      if (opts) {
        workbookDropdowns.subcategories = opts;
        hasDropdownValidations = true;
      }
    }
    if (!workbookDropdowns.statuses) {
      const opts = resolveValidationListOptions(
        workbook,
        worksheet,
        row.getCell(columnMapping.statusCol).dataValidation
      );
      if (opts) {
        workbookDropdowns.statuses = opts;
        hasDropdownValidations = true;
      }
    }
    if (!workbookDropdowns.remarks) {
      const opts = resolveValidationListOptions(
        workbook,
        worksheet,
        row.getCell(columnMapping.remarkCol).dataValidation
      );
      if (opts) {
        workbookDropdowns.remarks = opts;
        hasDropdownValidations = true;
      }
    }
  }

  const columnWidths: number[] = [];
  for (let c = 1; c <= detectedHeaders.length; c++) {
    const col = worksheet.getColumn(c);
    columnWidths.push(col.width ?? 16);
  }

  const views = worksheet.views || [];
  const hasFrozenHeader = views.some((v) => v.state === 'frozen' && (v.ySplit ?? 0) >= 1);
  const hasAutoFilter = Boolean(worksheet.autoFilter);
  const nowIso = new Date().toISOString();

  const metadata: WorkbookMetadata = {
    fileName,
    sheetName: worksheet.name,
    sheetNames: workbook.worksheets.map((ws) => ws.name),
    headers: detectedHeaders,
    columnMapping,
    workbookDropdowns,
    dateFormat,
    headerRowIndex,
    originalRecordCount: records.length,
    hasFrozenHeader,
    hasAutoFilter,
    hasDropdownValidations,
    columnWidths,
    extractedCategories,
    loadedAt: nowIso,
    lastUpdatedAt: nowIso,
    fileSizeBytes: buffer.byteLength,
  };

  return { metadata, records, masterBuffer: buffer };
}

function buildListValidation(values: readonly string[]): ExcelJS.DataValidation {
  // Excel inline list formula works cleanly up to 255 chars; for longer lists we store on a hidden helper sheet if needed,
  // or write inline list when short.
  const joined = values.join(',');
  if (joined.length <= 240) {
    return {
      type: 'list',
      allowBlank: true,
      formulae: [`"${joined}"`],
    };
  }
  return {
    type: 'list',
    allowBlank: true,
    formulae: ['DropdownLists!$A$1:$A$' + values.length],
  };
}

export async function createBlankMasterWorkbook(
  employeeName: EmployeeName = 'Mohit'
): Promise<ParsedWorkbookResult> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Call Records', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const widths = [14, 15, 18, 18, 28, 14, 14, 12, 42, 14];
  sheet.columns = EXACT_EXCEL_HEADERS.map((header, idx) => ({
    header,
    key: `col_${idx + 1}`,
    width: widths[idx] ?? 16,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.height = 24;
  for (let c = 1; c <= 10; c++) {
    const cell = headerRow.getCell(c);
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF107C41' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      bottom: { style: 'medium', color: { argb: 'FF0B5E31' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    };
  }

  // Hidden helper sheet for the 45 Remarks dropdown options (exceeds 255-char inline limit)
  const listsSheet = workbook.addWorksheet('DropdownLists', { state: 'veryHidden' });
  PERMITTED_REMARKS.forEach((rem, idx) => {
    listsSheet.getCell(idx + 1, 1).value = rem;
  });

  const catValidation = buildListValidation(PERMITTED_CATEGORIES);
  const subValidation = buildListValidation(PERMITTED_SUBCATEGORIES);
  const statusValidation = buildListValidation(['Resolved', 'Unresolved']);
  const remarkValidation = buildListValidation(PERMITTED_REMARKS);

  // Attach data validations on rows 2..500
  for (let r = 2; r <= 500; r++) {
    const row = sheet.getRow(r);
    row.getCell(4).dataValidation = catValidation;
    row.getCell(5).dataValidation = subValidation;
    row.getCell(6).dataValidation = statusValidation;
    row.getCell(9).dataValidation = remarkValidation;
  }

  sheet.getColumn(3).numFmt = '@';
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 10 },
  };

  const out = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(out as ArrayBuffer);
  const buffer = bytes.slice().buffer;

  return parseMasterWorkbook(buffer, `${employeeName}_Master_Sheet.xlsx`);
}

function cloneStyle(style?: Partial<ExcelJS.Style>): Partial<ExcelJS.Style> | undefined {
  if (!style) return undefined;
  try {
    return JSON.parse(JSON.stringify(style));
  } catch {
    return undefined;
  }
}

function cloneDataValidation(
  dv?: ExcelJS.DataValidation
): ExcelJS.DataValidation | undefined {
  if (!dv) return undefined;
  try {
    return JSON.parse(JSON.stringify(dv)) as ExcelJS.DataValidation;
  } catch {
    return undefined;
  }
}

export async function generateUpdatedWorkbook(
  masterBuffer: ArrayBuffer,
  metadata: WorkbookMetadata,
  addedRecords: CallRecord[],
  employeeName: EmployeeName = 'Mohit',
  globalDefaults?: GlobalEntryDefaults
): Promise<{
  buffer: ArrayBuffer;
  blob: Blob;
  fileName: string;
  totalRows: number;
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(masterBuffer);

  const worksheet =
    workbook.getWorksheet(metadata.sheetName) ?? workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Could not locate target worksheet inside master workbook.');
  }

  const headerRow = worksheet.getRow(metadata.headerRowIndex);
  const detectedHeaders =
    metadata.headers && metadata.headers.length >= 10
      ? metadata.headers
      : [...EXACT_EXCEL_HEADERS];
  const colCount = Math.max(10, detectedHeaders.length);

  // Preserve original header cells untouched unless completely blank
  EXACT_EXCEL_HEADERS.forEach((expectedHeader, index) => {
    const cell = headerRow.getCell(index + 1);
    if (!cellValueToString(cell, metadata.dateFormat)) {
      cell.value = expectedHeader;
    }
  });

  const colMap = metadata.columnMapping ?? detectColumnMapping(detectedHeaders);

  // Find actual last non-empty row in sheet
  let lastDataRowIdx = metadata.headerRowIndex;
  for (let r = metadata.headerRowIndex + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    let nonEmpty = false;
    for (let c = 1; c <= colCount; c++) {
      if (cellValueToString(row.getCell(c), metadata.dateFormat).length > 0) {
        nonEmpty = true;
        break;
      }
    }
    if (nonEmpty) {
      lastDataRowIdx = r;
    }
  }

  // Capture style & dataValidation templates from last existing row (or row below header)
  const templateStyles: Array<Partial<ExcelJS.Style> | undefined> = [];
  const templateValidations: Array<ExcelJS.DataValidation | undefined> = [];
  let templateRowHeight: number | undefined;
  const templateSourceIdx =
    lastDataRowIdx > metadata.headerRowIndex
      ? lastDataRowIdx
      : metadata.headerRowIndex + 1;

  if (templateSourceIdx <= worksheet.rowCount || lastDataRowIdx > metadata.headerRowIndex) {
    const templateRow = worksheet.getRow(templateSourceIdx);
    templateRowHeight = templateRow.height;
    for (let c = 1; c <= colCount; c++) {
      const tmplCell = templateRow.getCell(c);
      templateStyles.push(
        lastDataRowIdx > metadata.headerRowIndex ? cloneStyle(tmplCell.style) : undefined
      );
      templateValidations.push(cloneDataValidation(tmplCell.dataValidation));
    }
  }

  let writeRowIdx = lastDataRowIdx + 1;
  for (const record of addedRecords) {
    const row = worksheet.getRow(writeRowIdx);
    if (templateRowHeight) {
      row.height = templateRowHeight;
    }

    const rowValues: Record<number, string> = {
      [colMap.dateCol]: record.date,
      [colMap.serialIdCol]: record.serialId || DEFAULT_RECORD_VALUES.missingSerialId,
      // Leave Regd Mobile No blank ('') if absent — never write NA there unless workbook requires it
      [colMap.mobileCol]: normalizeMobileAsText(record.mobileNo),
      [colMap.categoryCol]: normalizeCategory(
        record.category || globalDefaults?.defaultCategory
      ),
      [colMap.subcategoryCol]: normalizeSubcategory(
        record.subcategory || globalDefaults?.defaultSubcategory
      ),
      [colMap.statusCol]: record.status,
      [colMap.escalationsCol]:
        record.escalations ||
        globalDefaults?.defaultEscalations ||
        DEFAULT_RECORD_VALUES.escalations,
      [colMap.channelsCol]:
        record.channels ||
        globalDefaults?.defaultChannels ||
        DEFAULT_RECORD_VALUES.channels,
      [colMap.remarkCol]: record.remark,
      [colMap.namesCol]: record.names || employeeName || DEFAULT_RECORD_VALUES.names,
    };

    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      if (Object.prototype.hasOwnProperty.call(rowValues, c)) {
        cell.value = rowValues[c];
      }

      const tmplStyle = templateStyles[c - 1];
      if (tmplStyle) {
        cell.style = cloneStyle(tmplStyle) ?? {};
      } else {
        cell.font = { name: 'Calibri', size: 11 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      }

      // Preserve existing cell dropdown validation rules on newly appended rows
      const tmplDv = templateValidations[c - 1];
      if (tmplDv && !cell.dataValidation) {
        const clonedDv = cloneDataValidation(tmplDv);
        if (clonedDv) cell.dataValidation = clonedDv;
      }

      if (c === colMap.mobileCol || c === colMap.dateCol || c === colMap.serialIdCol) {
        cell.numFmt = '@';
      }
    }

    writeRowIdx++;
  }

  // Expand autoFilter range if one already existed on the sheet
  if (worksheet.autoFilter && addedRecords.length > 0) {
    const finalRow = Math.max(lastDataRowIdx, writeRowIdx - 1);
    worksheet.autoFilter = {
      from: { row: metadata.headerRowIndex, column: 1 },
      to: { row: finalRow, column: colCount },
    };
  }

  for (let c = 1; c <= colCount; c++) {
    const col = worksheet.getColumn(c);
    if (!col.width && metadata.columnWidths[c - 1]) {
      col.width = metadata.columnWidths[c - 1];
    }
  }

  // Expand any column-scoped dataValidation ranges stored in ExcelJS internal model if present
  const finalRowNumber = Math.max(lastDataRowIdx, writeRowIdx - 1);
  if (addedRecords.length > 0 && templateValidations.some(Boolean)) {
    for (let c = 1; c <= colCount; c++) {
      const dv = templateValidations[c - 1];
      if (!dv) continue;
      const colLetter = columnNumberToLetter(c);
      for (let r = metadata.headerRowIndex + 1; r <= finalRowNumber; r++) {
        const targetCell = worksheet.getCell(`${colLetter}${r}`);
        if (!targetCell.dataValidation) {
          const clonedDv = cloneDataValidation(dv);
          if (clonedDv) targetCell.dataValidation = clonedDv;
        }
      }
    }
  }

  const written = await workbook.xlsx.writeBuffer();
  const outBytes = new Uint8Array(written as ArrayBuffer);
  const outBuffer: ArrayBuffer = outBytes.slice().buffer;

  if (!outBuffer || outBuffer.byteLength < 100) {
    throw new Error('Generated Excel file failed integrity check (empty output).');
  }

  const blob = new Blob([outBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const todayStr = formatTodayDDMMYYYY();
  const fileName = `${employeeName}_Master_Updated_${todayStr}.xlsx`;
  const totalRows = metadata.originalRecordCount + addedRecords.length;

  return { buffer: outBuffer, blob, fileName, totalRows };
}

export async function trimMasterWorkbookRows(
  masterBuffer: ArrayBuffer,
  metadata: WorkbookMetadata,
  keepRecordCount: number
): Promise<ParsedWorkbookResult> {
  if (keepRecordCount < 0) {
    throw new Error('Keep count must be zero or greater.');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(masterBuffer);

  const worksheet =
    workbook.getWorksheet(metadata.sheetName) ?? workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Could not locate worksheet inside master workbook.');
  }

  const colMap =
    metadata.columnMapping ??
    detectColumnMapping(metadata.headers ?? [...EXACT_EXCEL_HEADERS]);
  const checkCols = [
    colMap.dateCol,
    colMap.serialIdCol,
    colMap.mobileCol,
    colMap.categoryCol,
    colMap.subcategoryCol,
    colMap.statusCol,
    colMap.remarkCol,
  ];

  let kept = 0;
  let lastKeptRowIdx = metadata.headerRowIndex;
  const rowsToDelete: number[] = [];

  for (let r = metadata.headerRowIndex + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const hasData = checkCols.some(
      (c) => cellValueToString(row.getCell(c), metadata.dateFormat).length > 0
    );
    if (!hasData) continue;

    if (kept < keepRecordCount) {
      kept++;
      lastKeptRowIdx = r;
    } else {
      rowsToDelete.push(r);
    }
  }

  for (let i = rowsToDelete.length - 1; i >= 0; i--) {
    worksheet.spliceRows(rowsToDelete[i], 1);
  }

  if (worksheet.autoFilter) {
    worksheet.autoFilter = {
      from: { row: metadata.headerRowIndex, column: 1 },
      to: {
        row: Math.max(metadata.headerRowIndex, lastKeptRowIdx),
        column: Math.max(10, metadata.headers?.length ?? 10),
      },
    };
  }

  const written = await workbook.xlsx.writeBuffer();
  const outBytes = new Uint8Array(written as ArrayBuffer);
  const trimmedBuffer: ArrayBuffer = outBytes.slice().buffer;

  return parseMasterWorkbook(trimmedBuffer, metadata.fileName);
}

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 1500);
}
