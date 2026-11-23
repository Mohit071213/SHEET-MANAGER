import {
  BuilderCellValue,
  BuilderColumn,
  BuilderRecord,
  BuilderShortcutRule,
} from './types';
import {
  evaluateRecordValues,
  normalizeCellValue,
  resolveColumnDefaultValue,
} from './validationEngine';

export interface StagedBulkRow {
  tempId: string;
  rawLine: string;
  values: Record<string, BuilderCellValue>;
  matchedRuleIds: string[];
  matchedRuleNames: string[];
  confidence: 'high' | 'medium' | 'review';
  validationWarnings: string[];
  duplicateFields: string[];
  isDuplicate: boolean;
  include: boolean;
}

export function matchesShortcutRule(
  text: string,
  rule: BuilderShortcutRule
): boolean {
  if (!rule.enabled) return false;
  const trigger = rule.triggerText.trim();
  if (!trigger) return false;
  const normalizedText = text.trim();
  const lowerText = normalizedText.toLowerCase();
  const lowerTrigger = trigger.toLowerCase();

  switch (rule.matchMode) {
    case 'exact':
      return lowerText === lowerTrigger;
    case 'startsWith':
      return lowerText.startsWith(lowerTrigger);
    case 'regex':
      try {
        const re = new RegExp(trigger, 'i');
        return re.test(normalizedText);
      } catch {
        return false;
      }
    case 'contains':
    default:
      return lowerText.includes(lowerTrigger);
  }
}

export function applyShortcutRules(
  text: string,
  rules: BuilderShortcutRule[]
): {
  assignments: Record<string, string>;
  matchedRuleIds: string[];
  matchedRuleNames: string[];
} {
  const ordered = [...rules]
    .filter((r) => r.enabled)
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.triggerText.length - a.triggerText.length;
    });

  const assignments: Record<string, string> = {};
  const matchedRuleIds: string[] = [];
  const matchedRuleNames: string[] = [];

  for (const rule of ordered) {
    if (matchesShortcutRule(text, rule)) {
      matchedRuleIds.push(rule.id);
      matchedRuleNames.push(rule.name);
      for (const assign of rule.assignments) {
        if (assign.columnId && assignments[assign.columnId] === undefined) {
          assignments[assign.columnId] = assign.value;
        }
      }
    }
  }

  return { assignments, matchedRuleIds, matchedRuleNames };
}

interface ExtractedTokens {
  phones: string[];
  emails: string[];
  dates: string[];
  numbers: number[];
  ids: string[];
  booleanCue: boolean | null;
  cleanedText: string;
}

export function extractTokensFromText(raw: string): ExtractedTokens {
  let working = raw;

  const emails: string[] = [];
  working = working.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (m) => {
    emails.push(m.trim());
    return ' ';
  });

  const dates: string[] = [];
  working = working.replace(
    /\b(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/g,
    (m) => {
      dates.push(m.trim());
      return ' ';
    }
  );

  const phones: string[] = [];
  working = working.replace(/(?:\+?91[\s-]?)?\b([6-9]\d{9})\b/g, (_, tenDigits: string) => {
    phones.push(tenDigits);
    return ' ';
  });
  if (phones.length === 0) {
    working = working.replace(/(?:\+\d{1,3}[\s-]?)?\b(\d{10,12})\b/g, (full, digits: string) => {
      if (digits.length === 10 || full.startsWith('+')) {
        phones.push(digits.slice(-10));
        return ' ';
      }
      return full;
    });
  }

  const ids: string[] = [];
  working = working.replace(
    /\b([A-Z]{2,6}[-_#]?\d{2,10}|\d{5,14})\b/gi,
    (m) => {
      if (!phones.includes(m)) {
        ids.push(m.trim());
        return ' ';
      }
      return m;
    }
  );

  const numbers: number[] = [];
  working = working.replace(/(?:₹|\$|Rs\.?\s*)?(-?\d+(?:,\d{3})*(?:\.\d+)?)/gi, (full, numStr: string) => {
    const parsed = Number(numStr.replace(/,/g, ''));
    if (Number.isFinite(parsed)) {
      numbers.push(parsed);
    }
    return full.startsWith('₹') || full.startsWith('$') || /^rs/i.test(full) ? ' ' : full;
  });

  let booleanCue: boolean | null = null;
  if (/\b(yes|true|paid|completed|done|active|approved|verified)\b/i.test(raw)) {
    booleanCue = true;
  } else if (/\b(no|false|unpaid|pending|inactive|rejected)\b/i.test(raw)) {
    booleanCue = false;
  }

  const cleanedText = working.replace(/[|,;\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { phones, emails, dates, numbers, ids, booleanCue, cleanedText };
}

function splitDelimitedRow(line: string, delimiter: string): string[] {
  if (delimiter === '\t' || delimiter === '|') {
    return line.split(delimiter).map((c) => c.trim());
  }
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function detectTabularDelimiter(lines: string[]): string | null {
  if (lines.length === 0) return null;
  for (const delim of ['\t', '|', ',']) {
    const counts = lines.map((l) => splitDelimitedRow(l, delim).length);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    if (min >= 2 && max - min <= 1) {
      return delim;
    }
  }
  return null;
}

export function parseUniversalBulkInput(input: {
  rawText: string;
  columns: BuilderColumn[];
  rules: BuilderShortcutRule[];
  existingRecords: BuilderRecord[];
  applyMissingDefaults?: boolean;
}): StagedBulkRow[] {
  const lines = input.rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0 || input.columns.length === 0) {
    return [];
  }

  const orderedCols = [...input.columns].sort((a, b) => a.order - b.order);
  const tabularDelim = detectTabularDelimiter(lines);

  // Check if first row looks like a header row matching column labels
  let dataLines = lines;
  let columnMappingByCellIdx: BuilderColumn[] = orderedCols;

  if (tabularDelim) {
    const firstCells = splitDelimitedRow(lines[0], tabularDelim);
    const normalizedLabels = orderedCols.map((c) => c.label.toLowerCase());
    const headerHits = firstCells.filter((cell) =>
      normalizedLabels.includes(cell.toLowerCase())
    ).length;

    if (headerHits >= Math.min(2, orderedCols.length) && lines.length > 1) {
      columnMappingByCellIdx = firstCells.map((cell, idx) => {
        const match = orderedCols.find(
          (c) => c.label.toLowerCase() === cell.toLowerCase()
        );
        return match ?? orderedCols[idx] ?? orderedCols[0];
      });
      dataLines = lines.slice(1);
    }
  }

  const runningRecords: Array<Pick<BuilderRecord, 'id' | 'values'>> = [
    ...input.existingRecords,
  ];
  const staged: StagedBulkRow[] = [];

  for (let idx = 0; idx < dataLines.length; idx++) {
    const line = dataLines[idx];
    const values: Record<string, BuilderCellValue> = {};

    // Initialize defaults when enabled or for autoDate
    for (const col of orderedCols) {
      if (col.type === 'autoDate' || input.applyMissingDefaults !== false) {
        values[col.id] = resolveColumnDefaultValue(col);
      } else {
        values[col.id] = col.type === 'boolean' ? false : '';
      }
    }

    const ruleResult = applyShortcutRules(line, input.rules);

    if (tabularDelim) {
      const cells = splitDelimitedRow(line, tabularDelim);
      cells.forEach((cellVal, cellIdx) => {
        const targetCol = columnMappingByCellIdx[cellIdx];
        if (targetCol && cellVal !== '') {
          values[targetCol.id] = normalizeCellValue(targetCol, cellVal);
        }
      });
    } else {
      const tokens = extractTokensFromText(line);
      let phoneCursor = 0;
      let emailCursor = 0;
      let dateCursor = 0;
      let idCursor = 0;
      let numCursor = 0;

      // Primary heuristic pass
      for (const col of orderedCols) {
        const labelLower = col.label.toLowerCase();

        if (col.type === 'phone' && phoneCursor < tokens.phones.length) {
          values[col.id] = tokens.phones[phoneCursor++];
        } else if (col.type === 'email' && emailCursor < tokens.emails.length) {
          values[col.id] = tokens.emails[emailCursor++];
        } else if (col.type === 'date' && dateCursor < tokens.dates.length) {
          values[col.id] = tokens.dates[dateCursor++];
        } else if (col.type === 'number' && numCursor < tokens.numbers.length) {
          values[col.id] = tokens.numbers[numCursor++];
        } else if (col.type === 'boolean' && tokens.booleanCue !== null) {
          values[col.id] = tokens.booleanCue;
        } else if (
          col.type === 'dropdown' &&
          col.dropdownOptions.length > 0
        ) {
          const lineLower = line.toLowerCase();
          const matchedOpt = col.dropdownOptions.find((opt) =>
            lineLower.includes(opt.toLowerCase())
          );
          if (matchedOpt) {
            values[col.id] = matchedOpt;
          }
        } else if (
          col.type === 'text' &&
          /\b(id|code|ref|sku|awb|ticket|roll|serial|invoice)\b/i.test(labelLower) &&
          idCursor < tokens.ids.length
        ) {
          values[col.id] = tokens.ids[idCursor++];
        }
      }

      // Assign leftover readable text to primary text/remarks/name column
      if (tokens.cleanedText) {
        const remarkOrNameCols = orderedCols.filter(
          (c) =>
            c.type === 'text' &&
            !/\b(id|code|ref|sku|awb|ticket|roll|serial|invoice)\b/i.test(
              c.label.toLowerCase()
            )
        );
        const preferred =
          remarkOrNameCols.find((c) =>
            /\b(remark|note|summary|detail|description|comment)\b/i.test(
              c.label.toLowerCase()
            )
          ) ??
          remarkOrNameCols[0] ??
          orderedCols.find((c) => c.type === 'text');

        if (preferred && String(values[preferred.id] ?? '').trim() === '') {
          values[preferred.id] = tokens.cleanedText;
        }
      }
    }

    // Apply Shortcut Rule assignments with precedence over heuristic defaults
    for (const [colId, assignedVal] of Object.entries(ruleResult.assignments)) {
      const targetCol = orderedCols.find((c) => c.id === colId);
      if (targetCol) {
        values[colId] = normalizeCellValue(targetCol, assignedVal);
      }
    }

    const evaluation = evaluateRecordValues(orderedCols, values, runningRecords);
    const tempId = `staged_${idx}_${Date.now()}`;
    runningRecords.push({ id: tempId, values });

    const confidence: StagedBulkRow['confidence'] =
      evaluation.validationWarnings.length > 0
        ? 'review'
        : ruleResult.matchedRuleIds.length > 0 || Boolean(tabularDelim)
          ? 'high'
          : 'medium';

    staged.push({
      tempId,
      rawLine: line,
      values,
      matchedRuleIds: ruleResult.matchedRuleIds,
      matchedRuleNames: ruleResult.matchedRuleNames,
      confidence,
      validationWarnings: evaluation.validationWarnings,
      duplicateFields: evaluation.duplicateFields,
      isDuplicate: evaluation.isDuplicate,
      include: true,
    });
  }

  return staged;
}
