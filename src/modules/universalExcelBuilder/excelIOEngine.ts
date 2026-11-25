import ExcelJS from 'exceljs';
import {
  BuilderCellValue,
  BuilderColumn,
  BuilderColumnType,
  BuilderRecord,
  BuilderWorkbook,
} from './types';
import { createUniqueBuilderId, sanitizeColumnKey, sanitizeSheetName } from './storage';
import {
  normalizeCellValue,
  sanitizeSpreadsheetFormulaValue,
} from './validationEngine';

export interface ParsedSpreadsheetSheet {
  sheetName: string;
  headerRowIndex: number;
  rawRows: string[][];
  detectedColumns: BuilderColumn[];
  rowCount: number;
}

export interface ParsedSpreadsheetFile {
  fileName: string;
  sheets: ParsedSpreadsheetSheet[];
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

function extractExcelCellText(cell: ExcelJS.Cell): string {
  const val = cell.value;
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  if (typeof val === 'object') {
    if ('result' in val && val.result !== undefined) return String(val.result).trim();
    if ('text' in val && val.text !== undefined) return String(val.text).trim();
    if ('richText' in val && Array.isArray(val.richText)) {
      return val.richText.map((r) => r.text).join('').trim();
    }
  }
  return String(val).trim();
}

function inferColumnTypeFromSamples(
  headerLabel: string,
  samples: string[],
  explicitDropdownOptions: string[]
): { type: BuilderColumnType; dropdownOptions: string[] } {
  if (explicitDropdownOptions.length > 0) {
    return { type: 'dropdown', dropdownOptions: explicitDropdownOptions };
  }

  const nonEmpty = samples.map((s) => s.trim()).filter(Boolean);
  const labelLower = headerLabel.toLowerCase();

  if (nonEmpty.length === 0) {
    if (/email|e-mail/.test(labelLower)) return { type: 'email', dropdownOptions: [] };
    if (/phone|mobile|contact|whatsapp/.test(labelLower)) return { type: 'phone', dropdownOptions: [] };
    if (/date/.test(labelLower)) return { type: 'date', dropdownOptions: [] };
    if (/amount|price|qty|count|value|fee|budget|score|age/.test(labelLower)) {
      return { type: 'number', dropdownOptions: [] };
    }
    return { type: 'text', dropdownOptions: [] };
  }

  if (nonEmpty.every((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))) {
    return { type: 'email', dropdownOptions: [] };
  }
  if (
    /phone|mobile/.test(labelLower) ||
    nonEmpty.every((v) => /^\+?[\d\s()-]{8,15}$/.test(v) && v.replace(/\D/g, '').length >= 10)
  ) {
    return { type: 'phone', dropdownOptions: [] };
  }
  if (nonEmpty.every((v) => /^(true|false|yes|no)$/i.test(v))) {
    return { type: 'boolean', dropdownOptions: [] };
  }
  if (
    nonEmpty.every((v) => !Number.isNaN(Number(v.replace(/[,₹$]/g, '')))) &&
    !/id|code|sku|roll|awb|ticket|serial/.test(labelLower)
  ) {
    return { type: 'number', dropdownOptions: [] };
  }
  if (
    nonEmpty.every(
      (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(v)
    )
  ) {
    return { type: 'date', dropdownOptions: [] };
  }

  const uniqueVals = Array.from(new Set(nonEmpty));
  if (
    nonEmpty.length >= 4 &&
    uniqueVals.length >= 2 &&
    uniqueVals.length <= 12 &&
    uniqueVals.every((v) => v.length <= 40)
  ) {
    return { type: 'dropdown', dropdownOptions: uniqueVals };
  }

  return { type: 'text', dropdownOptions: [] };
}

export function buildDetectedColumnsFromMatrix(
  matrix: string[][],
  headerRowIndex1Based: number,
  excelValidationsByCol?: Map<number, string[]>
): { columns: BuilderColumn[]; dataRows: string[][] } {
  const headerIdx = Math.max(0, Math.min(matrix.length - 1, headerRowIndex1Based - 1));
  const headerCells = matrix[headerIdx] ?? [];
  const dataRows = matrix.slice(headerIdx + 1);
  const maxWidthCols = Math.max(
    headerCells.length,
    ...dataRows.slice(0, 50).map((r) => r.length),
    0
  );

  const columns: BuilderColumn[] = [];
  for (let colIdx = 0; colIdx < maxWidthCols; colIdx++) {
    const label = (headerCells[colIdx] ?? '').trim() || `Column ${colIdx + 1}`;
    const samples = dataRows.slice(0, 100).map((r) => r[colIdx] ?? '');
    const explicitOpts = excelValidationsByCol?.get(colIdx) ?? [];
    const inferred = inferColumnTypeFromSamples(label, samples, explicitOpts);

    columns.push({
      id: createUniqueBuilderId('col'),
      key: sanitizeColumnKey(label, colIdx),
      label,
      order: colIdx,
      type: inferred.type,
      required: false,
      unique: false,
      defaultMode: inferred.type === 'dropdown' && inferred.dropdownOptions.length > 0 ? 'firstOption' : 'none',
      defaultValue: '',
      dropdownOptions: inferred.dropdownOptions,
      width: Math.min(44, Math.max(14, label.length + 5)),
    });
  }

  return { columns, dataRows };
}

export async function parseUploadedSpreadsheetFile(
  file: File
): Promise<ParsedSpreadsheetFile> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.xls')) {
    throw new Error(
      'Legacy binary .xls files are not supported directly in browser mode. Please open the file in Excel / LibreOffice / Google Sheets and save as .xlsx or .csv first.'
    );
  }

  if (lower.endsWith('.csv')) {
    const text = await file.text();
    const matrix = parseCsvMatrix(text);
    if (matrix.length === 0) {
      throw new Error('The uploaded CSV file is empty.');
    }
    const { columns, dataRows } = buildDetectedColumnsFromMatrix(matrix, 1);
    return {
      fileName: file.name,
      sheets: [
        {
          sheetName: sanitizeSheetName(file.name.replace(/\.csv$/i, '')),
          headerRowIndex: 1,
          rawRows: matrix,
          detectedColumns: columns,
          rowCount: dataRows.length,
        },
      ],
    };
  }

  if (!lower.endsWith('.xlsx')) {
    throw new Error('Unsupported file type. Please upload an .xlsx or .csv spreadsheet.');
  }

  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  if (workbook.worksheets.length === 0) {
    throw new Error('This .xlsx workbook contains no worksheets.');
  }

  const sheets: ParsedSpreadsheetSheet[] = [];

  for (const ws of workbook.worksheets) {
    const matrix: string[][] = [];
    const colValidations = new Map<number, string[]>();

    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cells[colNumber - 1] = extractExcelCellText(cell);
        if (
          cell.dataValidation?.type === 'list' &&
          Array.isArray(cell.dataValidation.formulae) &&
          cell.dataValidation.formulae[0] &&
          !colValidations.has(colNumber - 1)
        ) {
          const rawFormula = String(cell.dataValidation.formulae[0]).trim();
          if (rawFormula.startsWith('"') && rawFormula.endsWith('"')) {
            const opts = rawFormula
              .slice(1, -1)
              .split(',')
              .map((o) => o.trim())
              .filter(Boolean);
            if (opts.length > 0) {
              colValidations.set(colNumber - 1, opts);
            }
          }
        }
      });
      for (let i = 0; i < cells.length; i++) {
        if (cells[i] === undefined) cells[i] = '';
      }
      if (cells.some((c) => c !== '')) {
        matrix.push(cells);
      }
    });

    if (matrix.length === 0) continue;

    // Auto-detect header row among top 10 rows by maximum non-empty cell count
    let bestRowIdx1Based = 1;
    let bestScore = -1;
    const inspectLimit = Math.min(10, matrix.length);
    for (let r = 0; r < inspectLimit; r++) {
      const nonEmptyCount = matrix[r].filter((c) => c !== '').length;
      if (nonEmptyCount > bestScore) {
        bestScore = nonEmptyCount;
        bestRowIdx1Based = r + 1;
      }
    }

    const { columns, dataRows } = buildDetectedColumnsFromMatrix(
      matrix,
      bestRowIdx1Based,
      colValidations
    );

    sheets.push({
      sheetName: ws.name,
      headerRowIndex: bestRowIdx1Based,
      rawRows: matrix,
      detectedColumns: columns,
      rowCount: dataRows.length,
    });
  }

  if (sheets.length === 0) {
    throw new Error('No populated rows or headers were found in this workbook.');
  }

  return { fileName: file.name, sheets };
}

export type BuilderExportFormat = 'xlsx' | 'csv' | 'json';

export interface BuilderExportOptions {
  fileName?: string;
  sheetName?: string;
  headerOverrides?: Record<string, string>;
}

export function sanitizeDownloadFileBase(
  raw: string,
  fallback = 'Workbook'
): string {
  const withoutExt = raw.trim().replace(/\.(xlsx|csv|json)$/i, '');
  const cleaned = withoutExt
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[._\s]+|[._\s]+$/g, '');
  return cleaned.slice(0, 120) || fallback;
}

export async function exportWorkbookToXlsxBlob(
  workbook: BuilderWorkbook,
  records: BuilderRecord[],
  options?: BuilderExportOptions
): Promise<{ blob: Blob; fileName: string; sheetName: string }> {
  const orderedCols = [...workbook.columns].sort((a, b) => a.order - b.order);
  const excelWb = new ExcelJS.Workbook();
  excelWb.creator = 'Universal Excel Builder';
  excelWb.created = new Date();

  const sheetName = sanitizeSheetName(options?.sheetName ?? workbook.sheetName);
  const ws = excelWb.addWorksheet(sheetName, {
    views: workbook.freezeHeader
      ? [{ state: 'frozen', ySplit: workbook.headerRowIndex }]
      : [],
  });

  const getHeaderLabel = (col: BuilderColumn): string => {
    const override = options?.headerOverrides?.[col.id]?.trim();
    return override || col.label;
  };

  const headerRowNum = Math.max(1, workbook.headerRowIndex);
  const headerRow = ws.getRow(headerRowNum);

  orderedCols.forEach((col, idx) => {
    const colNumber = idx + 1;
    const excelCol = ws.getColumn(colNumber);
    const label = getHeaderLabel(col);
    let maxLen = label.length + 4;
    for (const rec of records.slice(0, 300)) {
      const len = String(rec.values[col.id] ?? '').length + 3;
      if (len > maxLen) maxLen = len;
    }
    excelCol.width = Math.min(55, Math.max(col.width || 14, maxLen));

    const cell = headerRow.getCell(colNumber);
    cell.value = sanitizeSpreadsheetFormulaValue(label, 'text');
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });
  headerRow.height = 26;

  records.forEach((rec, rowIdx) => {
    const targetRow = ws.getRow(headerRowNum + 1 + rowIdx);
    orderedCols.forEach((col, colIdx) => {
      const cell = targetRow.getCell(colIdx + 1);
      const rawVal = rec.values[col.id];
      const safeVal = sanitizeSpreadsheetFormulaValue(rawVal, col.type);
      if (col.type === 'boolean') {
        cell.value = rawVal === true || String(rawVal).toLowerCase() === 'true' ? 'Yes' : 'No';
      } else {
        cell.value = safeVal;
      }
      if (col.type === 'number' && typeof safeVal === 'number') {
        cell.numFmt = '#,##0.##';
      }
      cell.alignment = { vertical: 'middle', horizontal: col.type === 'number' ? 'right' : 'left' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFF1F5F9' } },
      };
    });
    targetRow.height = 21;
  });

  if (workbook.autoFilter && orderedCols.length > 0) {
    ws.autoFilter = {
      from: { row: headerRowNum, column: 1 },
      to: { row: headerRowNum + records.length, column: orderedCols.length },
    };
  }

  // Native Excel dropdown Data Validation on Dropdown & Boolean columns
  const validationLastRow = Math.max(headerRowNum + records.length + 200, headerRowNum + 200);
  orderedCols.forEach((col, colIdx) => {
    const optionsList =
      col.type === 'boolean'
        ? ['Yes', 'No']
        : col.type === 'dropdown'
          ? col.dropdownOptions
          : [];
    if (optionsList.length === 0) return;

    const label = getHeaderLabel(col);
    const joined = optionsList.map((o) => o.replace(/"/g, '')).join(',');
    if (joined.length <= 240) {
      const formula = `"${joined}"`;
      for (let r = headerRowNum + 1; r <= validationLastRow; r++) {
        ws.getRow(r).getCell(colIdx + 1).dataValidation = {
          type: 'list',
          allowBlank: !col.required,
          formulae: [formula],
          showErrorMessage: true,
          errorTitle: `Invalid ${label}`,
          error: `Choose one of: ${joined}`,
        };
      }
    }
  });

  const buffer = await excelWb.xlsx.writeBuffer();
  const defaultBase =
    workbook.name.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'Workbook';
  const safeBase = options?.fileName?.trim()
    ? sanitizeDownloadFileBase(options.fileName, defaultBase)
    : defaultBase;
  const fileName = `${safeBase}.xlsx`;
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  return { blob, fileName, sheetName };
}

function escapeCsvCell(val: string | number | boolean): string {
  const str = String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportWorkbookToCsvBlob(
  workbook: BuilderWorkbook,
  records: BuilderRecord[],
  options?: BuilderExportOptions
): { blob: Blob; fileName: string } {
  const orderedCols = [...workbook.columns].sort((a, b) => a.order - b.order);
  const headerLine = orderedCols
    .map((c) => {
      const label = options?.headerOverrides?.[c.id]?.trim() || c.label;
      return escapeCsvCell(sanitizeSpreadsheetFormulaValue(label, 'text'));
    })
    .join(',');

  const dataLines = records.map((rec) =>
    orderedCols
      .map((col) => {
        const val = normalizeCellValue(col, rec.values[col.id]);
        if (col.type === 'boolean') {
          return escapeCsvCell(val === true ? 'Yes' : 'No');
        }
        return escapeCsvCell(sanitizeSpreadsheetFormulaValue(val, col.type));
      })
      .join(',')
  );

  const csvContent = '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
  const defaultBase =
    workbook.name.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'Workbook';
  const safeBase = options?.fileName?.trim()
    ? sanitizeDownloadFileBase(options.fileName, defaultBase)
    : defaultBase;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  return { blob, fileName: `${safeBase}.csv` };
}

export function exportWorkbookToJsonBlob(
  workbook: BuilderWorkbook,
  records: BuilderRecord[],
  rules: unknown[],
  options?: BuilderExportOptions
): { blob: Blob; fileName: string } {
  const exportedWorkbook: BuilderWorkbook = {
    ...workbook,
    sheetName: sanitizeSheetName(options?.sheetName ?? workbook.sheetName),
    columns: workbook.columns.map((col) => ({
      ...col,
      label: options?.headerOverrides?.[col.id]?.trim() || col.label,
    })),
  };
  const blob = new Blob(
    [
      JSON.stringify(
        {
          module: 'Universal Excel Builder',
          exportedAt: new Date().toISOString(),
          workbook: exportedWorkbook,
          rules,
          records,
        },
        null,
        2
      ),
    ],
    { type: 'application/json' }
  );
  const defaultBase = `${workbook.name.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'Workbook'}_Backup`;
  const safeBase = options?.fileName?.trim()
    ? sanitizeDownloadFileBase(options.fileName, defaultBase)
    : defaultBase;
  return { blob, fileName: `${safeBase}.json` };
}

export function triggerBuilderBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
