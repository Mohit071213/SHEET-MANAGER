import ExcelJS from 'exceljs';
import {
  CallRecord,
  CallStatus,
  DEFAULT_RECORD_VALUES,
  EXACT_EXCEL_HEADERS,
  WorkbookMetadata,
} from '../types/callsheet';
import {
  formatDateToPattern,
  formatTodayDDMMYYYY,
  normalizeMobileAsText,
  normalizeSerialId,
} from './statusMapper';

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
    // Avoid scientific notation for mobile numbers
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
    for (let c = 1; c <= 12; c++) {
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

function normalizeStatus(raw: string): CallStatus {
  return raw.trim().toLowerCase() === 'unresolved' ? 'Unresolved' : 'Resolved';
}

export async function parseMasterWorkbook(
  buffer: ArrayBuffer,
  fileName: string
): Promise<ParsedWorkbookResult> {
  if (!fileName.toLowerCase().endsWith('.xlsx')) {
    throw new Error('Only .xlsx Excel workbooks are supported. Please upload a valid .xlsx file.');
  }
  if (!buffer || buffer.byteLength < 100) {
    throw new Error('The uploaded file appears empty or corrupted.');
  }

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

  // Pick the first worksheet that has rows, defaulting to worksheet[0]
  const worksheet =
    workbook.worksheets.find((ws) => ws.rowCount > 0) ?? workbook.worksheets[0];

  const headerRowIndex = findHeaderRow(worksheet);
  const headerRow = worksheet.getRow(headerRowIndex);
  const detectedHeaders: string[] = [];
  for (let c = 1; c <= 10; c++) {
    detectedHeaders.push(cellValueToString(headerRow.getCell(c), 'DD-MM-YYYY'));
  }

  // Validate header compatibility (must have at least Date or Serial id / Regd Mobile No)
  const hasAnyValidHeader = detectedHeaders.some((h) =>
    /^(date|serial\s*id|regd\s*mobile\s*no|status|category)$/i.test(h)
  );
  if (worksheet.rowCount > 0 && !hasAnyValidHeader) {
    throw new Error(
      'Header row does not match expected calling sheet columns (Date, Serial id, Regd Mobile No, Category, Subcategory, Status, Escalations, Channels, Serial id, Names).'
    );
  }

  // Scan raw date strings first to detect dominant date format (default DD-MM-YYYY)
  const dateSamples: string[] = [];
  for (let r = headerRowIndex + 1; r <= Math.min(worksheet.rowCount, headerRowIndex + 30); r++) {
    const val = worksheet.getRow(r).getCell(1).value;
    if (typeof val === 'string' && val.trim()) {
      dateSamples.push(val.trim());
    }
  }
  const dateFormat = detectDatePatternFromText(dateSamples);

  const records: CallRecord[] = [];
  const categoryMap: Record<string, Set<string>> = {};
  const todayKey = formatTodayDDMMYYYY();

  for (let r = headerRowIndex + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const col1Date = cellValueToString(row.getCell(1), dateFormat);
    const col2Serial = cellValueToString(row.getCell(2), dateFormat);
    const col3Mobile = normalizeMobileAsText(cellValueToString(row.getCell(3), dateFormat));
    const col4Category = cellValueToString(row.getCell(4), dateFormat);
    const col5Subcategory = cellValueToString(row.getCell(5), dateFormat);
    const col6Status = cellValueToString(row.getCell(6), dateFormat);
    const col7Escalations = cellValueToString(row.getCell(7), dateFormat);
    const col8Channels = cellValueToString(row.getCell(8), dateFormat);
    const col9Remark = cellValueToString(row.getCell(9), dateFormat);
    const col10Names = cellValueToString(row.getCell(10), dateFormat);

    // Skip genuinely blank trailing rows
    const hasData = [
      col1Date,
      col2Serial,
      col3Mobile,
      col4Category,
      col5Subcategory,
      col6Status,
      col9Remark,
    ].some((v) => v.length > 0);
    if (!hasData) continue;

    if (col4Category) {
      if (!categoryMap[col4Category]) {
        categoryMap[col4Category] = new Set<string>();
      }
      if (col5Subcategory) {
        categoryMap[col4Category].add(col5Subcategory);
      }
    }

    records.push({
      id: `master_r${r}`,
      rowIndex: r,
      date: col1Date,
      serialId: normalizeSerialId(col2Serial),
      mobileNo: col3Mobile,
      category: col4Category,
      subcategory: col5Subcategory,
      status: normalizeStatus(col6Status),
      escalations: col7Escalations || DEFAULT_RECORD_VALUES.escalations,
      channels: col8Channels || DEFAULT_RECORD_VALUES.channels,
      remark: col9Remark,
      names: col10Names || DEFAULT_RECORD_VALUES.names,
      source: 'master',
      createdAt: new Date().toISOString(),
      addedDateKey: col1Date || todayKey,
    });
  }

  const extractedCategories: Record<string, string[]> = {};
  for (const [cat, subs] of Object.entries(categoryMap)) {
    extractedCategories[cat] = Array.from(subs).sort((a, b) => a.localeCompare(b));
  }

  const columnWidths: number[] = [];
  for (let c = 1; c <= 10; c++) {
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
    dateFormat,
    headerRowIndex,
    originalRecordCount: records.length,
    hasFrozenHeader,
    hasAutoFilter,
    columnWidths,
    extractedCategories,
    loadedAt: nowIso,
    lastUpdatedAt: nowIso,
    fileSizeBytes: buffer.byteLength,
  };

  return { metadata, records, masterBuffer: buffer };
}

export async function createBlankMasterWorkbook(): Promise<ParsedWorkbookResult> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Call Records', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const widths = [14, 15, 18, 18, 20, 14, 14, 12, 34, 14];
  sheet.columns = EXACT_EXCEL_HEADERS.map((header, idx) => ({
    header,
    key: `col_${idx + 1}`,
    width: widths[idx] ?? 16,
  }));

  // Style header row like a real Excel sheet
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

  // Set Column 3 (Regd Mobile No) default format to Text (@)
  sheet.getColumn(3).numFmt = '@';
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 10 },
  };

  const out = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(out as ArrayBuffer);
  const buffer = bytes.slice().buffer;

  return parseMasterWorkbook(buffer, 'Master_Call_Sheet.xlsx');
}

function cloneStyle(style?: Partial<ExcelJS.Style>): Partial<ExcelJS.Style> | undefined {
  if (!style) return undefined;
  try {
    return JSON.parse(JSON.stringify(style));
  } catch {
    return undefined;
  }
}

export async function generateUpdatedWorkbook(
  masterBuffer: ArrayBuffer,
  metadata: WorkbookMetadata,
  addedRecords: CallRecord[]
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

  // Ensure exact column headers remain untouched on headerRowIndex (especially column 9 = "Serial id")
  const headerRow = worksheet.getRow(metadata.headerRowIndex);
  EXACT_EXCEL_HEADERS.forEach((expectedHeader, index) => {
    const cell = headerRow.getCell(index + 1);
    if (!cellValueToString(cell, metadata.dateFormat)) {
      cell.value = expectedHeader;
    }
  });

  // Find the actual last non-empty row in the sheet so we append cleanly right below existing records
  let lastDataRowIdx = metadata.headerRowIndex;
  for (let r = metadata.headerRowIndex + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    let nonEmpty = false;
    for (let c = 1; c <= 10; c++) {
      if (cellValueToString(row.getCell(c), metadata.dateFormat).length > 0) {
        nonEmpty = true;
        break;
      }
    }
    if (nonEmpty) {
      lastDataRowIdx = r;
    }
  }

  // Capture style template from last existing data row (if any) so new rows match the real Excel sheet
  const templateStyles: Array<Partial<ExcelJS.Style> | undefined> = [];
  let templateRowHeight: number | undefined;
  if (lastDataRowIdx > metadata.headerRowIndex) {
    const templateRow = worksheet.getRow(lastDataRowIdx);
    templateRowHeight = templateRow.height;
    for (let c = 1; c <= 10; c++) {
      templateStyles.push(cloneStyle(templateRow.getCell(c).style));
    }
  }

  // Append newly added records in exact submission order
  let writeRowIdx = lastDataRowIdx + 1;
  for (const record of addedRecords) {
    const row = worksheet.getRow(writeRowIdx);
    if (templateRowHeight) {
      row.height = templateRowHeight;
    }

    const values: [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ] = [
      record.date,
      record.serialId || DEFAULT_RECORD_VALUES.missingSerialId,
      normalizeMobileAsText(record.mobileNo), // Text string
      record.category.trim() || DEFAULT_RECORD_VALUES.category,
      record.subcategory.trim() || DEFAULT_RECORD_VALUES.subcategory,
      record.status,
      record.escalations || DEFAULT_RECORD_VALUES.escalations,
      record.channels || DEFAULT_RECORD_VALUES.channels,
      record.remark, // Column 9 ("Serial id" header retained)
      record.names || DEFAULT_RECORD_VALUES.names,
    ];

    for (let c = 1; c <= 10; c++) {
      const cell = row.getCell(c);
      cell.value = values[c - 1];

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

      // Strictly preserve mobile numbers as Text (@) and Date as text matching original format
      if (c === 3 || c === 1 || c === 2) {
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
      to: { row: finalRow, column: 10 },
    };
  }

  // Preserve column widths (and gently expand if needed without shrinking original widths)
  for (let c = 1; c <= 10; c++) {
    const col = worksheet.getColumn(c);
    if (!col.width && metadata.columnWidths[c - 1]) {
      col.width = metadata.columnWidths[c - 1];
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
  const fileName = `Call_Records_Updated_${todayStr}.xlsx`;
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

  let kept = 0;
  let lastKeptRowIdx = metadata.headerRowIndex;
  const rowsToDelete: number[] = [];

  for (let r = metadata.headerRowIndex + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const hasData = [1, 2, 3, 4, 5, 6, 9].some(
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

  // Delete trailing rows beyond keepRecordCount from bottom to top
  for (let i = rowsToDelete.length - 1; i >= 0; i--) {
    worksheet.spliceRows(rowsToDelete[i], 1);
  }

  if (worksheet.autoFilter) {
    worksheet.autoFilter = {
      from: { row: metadata.headerRowIndex, column: 1 },
      to: { row: Math.max(metadata.headerRowIndex, lastKeptRowIdx), column: 10 },
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
