import { BuilderCellValue, BuilderColumn, BuilderRecord } from './types';

export function formatTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function resolveColumnDefaultValue(column: BuilderColumn): BuilderCellValue {
  if (column.type === 'autoDate') {
    return formatTodayISO();
  }
  if (column.defaultMode === 'today') {
    return formatTodayISO();
  }
  if (column.defaultMode === 'firstOption') {
    return column.dropdownOptions[0] ?? '';
  }
  if (column.defaultMode === 'custom') {
    if (column.type === 'boolean') {
      const lower = column.defaultValue.trim().toLowerCase();
      return lower === 'true' || lower === 'yes' || lower === '1';
    }
    if (column.type === 'number') {
      const n = Number(column.defaultValue);
      return column.defaultValue.trim() !== '' && Number.isFinite(n) ? n : '';
    }
    return column.defaultValue;
  }
  if (column.type === 'boolean') {
    return false;
  }
  return '';
}

export function normalizeCellValue(
  column: BuilderColumn,
  raw: unknown
): BuilderCellValue {
  if (raw === null || raw === undefined) {
    return column.type === 'boolean' ? false : '';
  }

  if (column.type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    const str = String(raw).trim().toLowerCase();
    return str === 'true' || str === 'yes' || str === 'y' || str === '1';
  }

  if (column.type === 'number') {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    const cleaned = String(raw).replace(/[,₹$€£\s]/g, '').trim();
    if (!cleaned) return '';
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : String(raw).trim();
  }

  if (column.type === 'phone') {
    const str = String(raw).trim();
    const digits = str.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) {
      return digits.slice(2);
    }
    if (digits.length === 11 && digits.startsWith('0')) {
      return digits.slice(1);
    }
    if (digits.length >= 10 && digits.length <= 15 && /^[+\d\s()-]+$/.test(str)) {
      return digits.length === 10 ? digits : str;
    }
    return str;
  }

  if (column.type === 'autoDate' && String(raw).trim() === '') {
    return formatTodayISO();
  }

  return String(raw).trim();
}

export function isCellEmpty(val: BuilderCellValue | undefined): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === 'boolean') return false;
  if (typeof val === 'number') return !Number.isFinite(val);
  return String(val).trim() === '';
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSingleCell(
  column: BuilderColumn,
  val: BuilderCellValue | undefined
): string | null {
  const empty = isCellEmpty(val);
  if (column.required && empty) {
    return `${column.label} is required`;
  }
  if (empty) return null;

  const str = String(val).trim();

  if (column.type === 'number') {
    const num = typeof val === 'number' ? val : Number(str);
    if (!Number.isFinite(num)) {
      return `${column.label} must be a valid number`;
    }
    if (column.minValue !== undefined && num < column.minValue) {
      return `${column.label} must be >= ${column.minValue}`;
    }
    if (column.maxValue !== undefined && num > column.maxValue) {
      return `${column.label} must be <= ${column.maxValue}`;
    }
  }

  if (column.type === 'email' && !EMAIL_REGEX.test(str)) {
    return `${column.label} is not a valid email`;
  }

  if (column.type === 'phone') {
    const digits = str.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
      return `${column.label} should be 7–15 digits`;
    }
  }

  if (column.type === 'date' || column.type === 'autoDate') {
    const isoLike = /^\d{4}-\d{2}-\d{2}$/.test(str);
    const dmyLike = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(str);
    if (!isoLike && !dmyLike && Number.isNaN(Date.parse(str))) {
      return `${column.label} must be a valid date`;
    }
  }

  if (
    column.type === 'dropdown' &&
    column.dropdownOptions.length > 0 &&
    !column.dropdownOptions.some((opt) => opt.toLowerCase() === str.toLowerCase())
  ) {
    return `${column.label} value "${str}" is outside dropdown list`;
  }

  if (column.validationRegex && column.validationRegex.trim()) {
    try {
      const re = new RegExp(column.validationRegex.trim());
      if (!re.test(str)) {
        return `${column.label} failed pattern rule`;
      }
    } catch {
      // ignore invalid user regex gracefully
    }
  }

  return null;
}

export function evaluateRecordValues(
  columns: BuilderColumn[],
  values: Record<string, BuilderCellValue>,
  otherRecords: Array<Pick<BuilderRecord, 'id' | 'values'>>,
  selfRecordId?: string
): {
  validationWarnings: string[];
  duplicateFields: string[];
  isDuplicate: boolean;
} {
  const validationWarnings: string[] = [];
  const duplicateFields: string[] = [];

  for (const col of columns) {
    const warn = validateSingleCell(col, values[col.id]);
    if (warn) {
      validationWarnings.push(warn);
    }

    if (col.unique && !isCellEmpty(values[col.id])) {
      const norm = String(values[col.id]).trim().toLowerCase();
      if (norm !== 'na' && norm !== 'n/a') {
        const hasDup = otherRecords.some((rec) => {
          if (selfRecordId && rec.id === selfRecordId) return false;
          const otherVal = rec.values[col.id];
          if (isCellEmpty(otherVal)) return false;
          return String(otherVal).trim().toLowerCase() === norm;
        });
        if (hasDup) {
          duplicateFields.push(col.label);
        }
      }
    }
  }

  return {
    validationWarnings,
    duplicateFields,
    isDuplicate: duplicateFields.length > 0,
  };
}

/**
 * Prevents spreadsheet formula injection (CSV/Excel leading =, +, -, @, \t, \r)
 * while leaving valid negative numbers as genuine numeric cells.
 */
export function sanitizeSpreadsheetFormulaValue(
  value: BuilderCellValue | undefined,
  columnType?: BuilderColumn['type']
): string | number | boolean {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : '';
  }

  const str = String(value);
  if (columnType === 'number') {
    const cleaned = str.replace(/[,₹$€£\s]/g, '').trim();
    if (cleaned !== '' && Number.isFinite(Number(cleaned))) {
      return Number(cleaned);
    }
  }

  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}
