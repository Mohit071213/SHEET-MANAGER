import {
  CallRecord,
  CallStatus,
  DEFAULT_RECORD_VALUES,
  ParsedDraftRecord,
} from '../types/callsheet';

const UNRESOLVED_PATTERNS: RegExp[] = [
  /\bbusy\b/i,
  /\bno\s*response\b/i,
  /\bnot\s*responding\b/i,
  /\bcx\s*not\s*response(?:\s*the\s*call)?\b/i,
  /\bno\s*answer\b/i,
  /\bnot\s*available\b/i,
  /\bunavailable\b/i,
  /\binvalid\b/i,
  /\bdisconnected\b/i,
  /\bnot\s*connected\b/i,
  /\bnot\s*reachable\b/i,
  /\bswitched\s*off\b/i,
  /\bring(?:ing)?\s*no\s*response\b/i,
  /\bcall\s*not\s*picked\b/i,
  /\bdid\s*not\s*pick\b/i,
  /\brnr\b/i,
];

const RESOLVED_PATTERNS: RegExp[] = [
  /\bresolved\b/i,
  /\brejected\b/i,
  /\brepayment\b/i,
  /\bpay\s*link\b/i,
  /\bpayment\s*link\b/i,
  /\bbank\s*change\b/i,
  /\bother\s*language\b/i,
  /\btransfer(?:red)?\b/i,
  /\bgeneral\s*query\b/i,
  /\bquery\s*resolved\b/i,
  /\bcompleted\b/i,
  /\bpaid\b/i,
  /\bsettled\b/i,
  /\bemi\s*paid\b/i,
  /\bcallback\s*scheduled\b/i,
  /\bshared\s*link\b/i,
  /\blink\s*sent\b/i,
  /\baccount\s*updated\b/i,
  /\bissue\s*fixed\b/i,
];

export function formatTodayDDMMYYYY(date: Date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export function formatDateToPattern(date: Date, pattern: string): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());

  if (pattern === 'DD/MM/YYYY') return `${dd}/${mm}/${yyyy}`;
  if (pattern === 'YYYY-MM-DD') return `${yyyy}-${mm}-${dd}`;
  return `${dd}-${mm}-${yyyy}`;
}

export function isValidDateInput(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  // Match DD-MM-YYYY or DD/MM/YYYY
  const dmy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const dt = new Date(year, month - 1, day);
    return (
      dt.getFullYear() === year &&
      dt.getMonth() === month - 1 &&
      dt.getDate() === day
    );
  }

  // Match YYYY-MM-DD
  const ymd = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const dt = new Date(year, month - 1, day);
    return (
      dt.getFullYear() === year &&
      dt.getMonth() === month - 1 &&
      dt.getDate() === day
    );
  }

  return false;
}

export function normalizeMobileAsText(input: string): string {
  const trimmed = String(input ?? '').trim();
  // Strip spaces, dashes, parentheses, and optional leading + only if numeric phone
  const stripped = trimmed.replace(/[\s()-]/g, '');
  return stripped;
}

export function isValidMobileText(mobile: string): boolean {
  const cleaned = normalizeMobileAsText(mobile).replace(/^\+/, '');
  return /^\d{10,15}$/.test(cleaned);
}

export function normalizeSerialId(input: string): string {
  const cleaned = String(input ?? '').trim();
  if (!cleaned) return DEFAULT_RECORD_VALUES.missingSerialId;
  return cleaned;
}

export function normalizeCategory(input?: string): string {
  const cleaned = String(input ?? '').trim();
  return cleaned || DEFAULT_RECORD_VALUES.category;
}

export function normalizeSubcategory(input?: string): string {
  const cleaned = String(input ?? '').trim();
  return cleaned || DEFAULT_RECORD_VALUES.subcategory;
}

export interface StatusMappingResult {
  status: CallStatus | null;
  remark: string;
  needsClarification: boolean;
  reason?: string;
}

export function mapRemarkToStatusAndColumn9(
  rawRemark: string,
  explicitStatus?: CallStatus | null
): StatusMappingResult {
  const trimmed = String(rawRemark ?? '').trim();

  if (!trimmed) {
    if (explicitStatus === 'Unresolved') {
      return {
        status: 'Unresolved',
        remark: DEFAULT_RECORD_VALUES.unresolvedRemark,
        needsClarification: false,
      };
    }
    return {
      status: null,
      remark: '',
      needsClarification: true,
      reason: 'Remark is empty. Please enter call details or select an outcome.',
    };
  }

  // Check explicit Unresolved rules FIRST
  for (const pattern of UNRESOLVED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        status: 'Unresolved',
        remark: DEFAULT_RECORD_VALUES.unresolvedRemark,
        needsClarification: false,
      };
    }
  }

  // Check explicit Resolved rules
  for (const pattern of RESOLVED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        status: 'Resolved',
        remark: trimmed,
        needsClarification: false,
      };
    }
  }

  // If user manually clarified the ambiguous remark
  if (explicitStatus === 'Unresolved') {
    return {
      status: 'Unresolved',
      remark: DEFAULT_RECORD_VALUES.unresolvedRemark,
      needsClarification: false,
    };
  }
  if (explicitStatus === 'Resolved') {
    return {
      status: 'Resolved',
      remark: trimmed,
      needsClarification: false,
    };
  }

  // Outcome is unclear -> ask user before adding
  return {
    status: null,
    remark: trimmed,
    needsClarification: true,
    reason: `Outcome "${trimmed}" is unclear. Confirm whether it is Resolved or Unresolved.`,
  };
}

export function checkDuplicates(
  serialId: string,
  mobileNo: string,
  existingRecords: Array<{ serialId: string; mobileNo: string }>
): { isDuplicateMobile: boolean; isDuplicateSerial: boolean } {
  const normMob = normalizeMobileAsText(mobileNo);
  const normSid = normalizeSerialId(serialId).toLowerCase();

  const isDuplicateMobile =
    normMob.length > 0 &&
    existingRecords.some((r) => normalizeMobileAsText(r.mobileNo) === normMob);

  const isDuplicateSerial =
    normSid !== 'na' &&
    normSid.length > 0 &&
    existingRecords.some((r) => normalizeSerialId(r.serialId).toLowerCase() === normSid);

  return { isDuplicateMobile, isDuplicateSerial };
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function looksLikeMobile(token: string): boolean {
  const cleaned = token.replace(/[\s()-]/g, '').replace(/^\+/, '');
  return /^\d{10,13}$/.test(cleaned);
}

function looksLikeDate(token: string): boolean {
  return isValidDateInput(token);
}

function looksLikeSerialIdToken(token: string): boolean {
  const cleaned = token.trim();
  if (!cleaned || looksLikeDate(cleaned) || looksLikeMobile(cleaned)) return false;
  if (/^(level\s*1|calls|mohit|resolved|unresolved|query|na|n\/a)$/i.test(cleaned)) {
    return false;
  }
  if (!mapRemarkToStatusAndColumn9(cleaned).needsClarification) {
    return false;
  }
  return /^\d{5,9}$/.test(cleaned) || /^(?=.*\d)[a-zA-Z0-9_-]{4,20}$/.test(cleaned);
}

export function parseSingleNaturalText(
  text: string,
  defaults: { date: string; category: string; subcategory: string },
  existingRecords: Array<{ serialId: string; mobileNo: string }>
): ParsedDraftRecord | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let date = defaults.date;
  let serialId = '';
  let mobileNo = '';
  let category = normalizeCategory(defaults.category);
  let subcategory = normalizeSubcategory(defaults.subcategory);
  let rawRemark = '';

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Key-Value multi-line detection: "S ID: 92801385", "Mobile: 9752255732", "Remark: Busy"
  const hasKeyValues = lines.some((line) =>
    /^(?:s[\s._-]*id|serial[\s._-]*id|mobile|phone|mob|regd\s*mobile(?:\s*no)?|remark|remarks|status|category|subcategory|date)\s*[:=-]/i.test(
      line
    )
  );

  if (hasKeyValues) {
    for (const line of lines) {
      const kv = line.match(/^([^:=-]+)\s*[:=-]\s*(.+)$/);
      if (!kv) {
        if (!rawRemark) rawRemark = line;
        continue;
      }
      const key = kv[1].trim().toLowerCase();
      const val = kv[2].trim();

      if (/^(s[\s._-]*id|serial[\s._-]*id|sid)$/.test(key)) {
        serialId = val;
      } else if (/^(mobile|phone|mob|regd\s*mobile(?:\s*no)?|contact|number)$/.test(key)) {
        mobileNo = normalizeMobileAsText(val);
      } else if (/^(remark|remarks|call\s*details|details|outcome|status|note)$/.test(key)) {
        rawRemark = rawRemark ? `${rawRemark} ${val}` : val;
      } else if (/^category$/.test(key)) {
        category = val;
      } else if (/^(sub\s*category|subcategory)$/.test(key)) {
        subcategory = val;
      } else if (/^date$/.test(key)) {
        date = val;
      }
    }
  } else if (trimmed.includes('\t')) {
    // Tab-separated paste directly from Excel / Google Sheets: preserve empty tab slots!
    const rawCells = text.replace(/\r?\n/g, '').split('\t').map((c) => c.trim());
    const mobileIdx = rawCells.findIndex((c) => looksLikeMobile(c));

    if (mobileIdx >= 0) {
      mobileNo = normalizeMobileAsText(rawCells[mobileIdx]);

      // Inspect cells before mobile number (Date and/or Row# / Serial id)
      const before = rawCells.slice(0, mobileIdx).filter((c) => c.length > 0);
      for (const token of before) {
        if (looksLikeDate(token)) {
          date = token;
        } else if (/^\d{1,4}$/.test(token)) {
          // Small 1..4 digit sequential index copied from Excel row numbers -> NA
          if (!serialId) serialId = '';
        } else {
          serialId = token;
        }
      }

      // Inspect cells after mobile number; support both "Mobile \t Serial id \t Remark"
      // and 10-col layout "+1 Category, +2 Subcategory, +3 Status/Outcome, +4 Escalations, +5 Channels, +6/+7 Remarks"
      let after = rawCells.slice(mobileIdx + 1);
      if (!serialId && after[0] && looksLikeSerialIdToken(after[0])) {
        serialId = after[0];
        after = after.slice(1);
      }

      const colCat = after[0] ?? '';
      const colSub = after[1] ?? '';
      const colStatusOrOutcome = after[2] ?? '';
      const laterNonEmpty = after
        .slice(3)
        .filter((c) => c.length > 0 && !/^(level\s*1|calls|mohit)$/i.test(c));

      const nonEmptyAfter = after.filter((c) => c.length > 0);
      if (!colCat && !colSub && colStatusOrOutcome) {
        const isExplicitStatusWord = /^(resolved|unresolved)$/i.test(colStatusOrOutcome);
        if (isExplicitStatusWord && laterNonEmpty.length > 0) {
          // Row like: 8 | 8962714926 | | | Resolved | | | | Pay Link
          rawRemark = laterNonEmpty[0];
          const checkMap = mapRemarkToStatusAndColumn9(rawRemark);
          if (checkMap.needsClarification) {
            rawRemark = `${colStatusOrOutcome} - ${laterNonEmpty[0]}`;
          }
        } else if (
          /^(busy|no\s*response|no\s*answer|not\s*available|invalid|disconnected|not\s*connected)$/i.test(
            colStatusOrOutcome
          )
        ) {
          rawRemark = colStatusOrOutcome;
        } else if (
          laterNonEmpty.length > 0 &&
          !mapRemarkToStatusAndColumn9(colStatusOrOutcome).needsClarification
        ) {
          rawRemark = colStatusOrOutcome;
        } else {
          rawRemark = laterNonEmpty[0] || colStatusOrOutcome;
        }
      } else if (nonEmptyAfter.length === 1) {
        rawRemark = nonEmptyAfter[0];
      } else if (nonEmptyAfter.length === 2) {
        if (/^(resolved|unresolved)$/i.test(nonEmptyAfter[0])) {
          rawRemark = nonEmptyAfter[1];
        } else if (!mapRemarkToStatusAndColumn9(nonEmptyAfter[0]).needsClarification) {
          rawRemark = nonEmptyAfter[0];
        } else {
          category = nonEmptyAfter[0];
          rawRemark = nonEmptyAfter[1];
        }
      } else if (nonEmptyAfter.length >= 3) {
        category = colCat || nonEmptyAfter[0];
        subcategory = colSub || subcategory;
        if (/^(resolved|unresolved)$/i.test(colStatusOrOutcome) && laterNonEmpty.length > 0) {
          const checkMap = mapRemarkToStatusAndColumn9(laterNonEmpty[0]);
          rawRemark = checkMap.needsClarification
            ? `${colStatusOrOutcome} - ${laterNonEmpty[0]}`
            : laterNonEmpty[0];
        } else {
          rawRemark =
            colStatusOrOutcome ||
            laterNonEmpty[0] ||
            nonEmptyAfter[nonEmptyAfter.length - 1];
        }
      }
    } else {
      // Tab-separated row without a valid mobile number (flag needsMobileClarification)
      const nonEmpty = rawCells.filter((c) => c.length > 0);
      if (nonEmpty.length > 0) {
        const outcomeCell = nonEmpty.find(
          (c) => !mapRemarkToStatusAndColumn9(c).needsClarification
        );
        rawRemark = outcomeCell ?? nonEmpty[nonEmpty.length - 1];
        const first = nonEmpty[0];
        if (!/^\d{1,4}$/.test(first) && first !== rawRemark) {
          serialId = first;
        }
      }
    }
  } else {
    // Delimited single line: "92801385, 9752255732, Busy" or "9752255732, 92801385, Pay Link"
    const parts = trimmed
      .split(/[,|]+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (parts.length >= 2) {
      const remaining: string[] = [];
      for (const part of parts) {
        if (!mobileNo && looksLikeMobile(part)) {
          mobileNo = normalizeMobileAsText(part);
        } else if (looksLikeDate(part) && part !== parts[0]) {
          date = part;
        } else {
          remaining.push(part);
        }
      }

      if (remaining.length === 1) {
        if (looksLikeSerialIdToken(remaining[0])) {
          serialId = remaining[0];
        } else {
          rawRemark = remaining[0];
        }
      } else if (remaining.length === 2) {
        if (/^\d{1,4}$/.test(remaining[0])) {
          serialId = '';
        } else {
          serialId = remaining[0];
        }
        rawRemark = remaining[1];
      } else if (remaining.length >= 3) {
        serialId = /^\d{1,4}$/.test(remaining[0]) ? '' : remaining[0];
        if (remaining.length === 3) {
          if (/^(resolved|unresolved)$/i.test(remaining[1])) {
            rawRemark = remaining[2];
          } else {
            category = remaining[1];
            rawRemark = remaining[2];
          }
        } else {
          category = remaining[1];
          subcategory = remaining[2];
          rawRemark = remaining.slice(3).join(', ');
        }
      }
    } else {
      // Single unstructured space-separated row: "9555917883 92801385 Busy" or "92801385 9555917883 Pay Link"
      let work = trimmed;
      const dateMatch = work.match(/\b(\d{1,2}[-/]\d{1,2}[-/]\d{4})\b/);
      if (dateMatch && looksLikeDate(dateMatch[1])) {
        date = dateMatch[1];
        work = work.replace(dateMatch[0], ' ').trim();
      }
      const mobMatch = work.match(/(?:\+?91[\s-]?)?(\d{10,12})\b/);
      if (mobMatch) {
        mobileNo = normalizeMobileAsText(mobMatch[1]);
        work = work.replace(mobMatch[0], ' ').trim();
      }
      // Strip optional leading 1..4 digit row number if mobile was present
      if (mobileNo) {
        work = work.replace(/^\d{1,4}\s+/, '').trim();
      }
      const sidMatch = work.match(/\b((?=.*\d)[a-zA-Z0-9_-]{5,15})\b/);
      if (sidMatch && looksLikeSerialIdToken(sidMatch[1])) {
        serialId = sidMatch[1];
        work = work.replace(sidMatch[0], ' ').trim();
      }
      const leftover = work.replace(/^[,:-\s]+|[,:-\s]+$/g, '').trim();
      rawRemark = leftover;
    }
  }

  const finalSerialId = normalizeSerialId(serialId);
  const finalMobile = normalizeMobileAsText(mobileNo);
  const finalCategory = normalizeCategory(category);
  const finalSubcategory = normalizeSubcategory(subcategory);
  const mapping = mapRemarkToStatusAndColumn9(rawRemark);
  const dups = checkDuplicates(finalSerialId, finalMobile, existingRecords);
  const needsMobile = !isValidMobileText(finalMobile);

  return {
    id: makeId(),
    date,
    serialId: finalSerialId,
    mobileNo: finalMobile,
    category: finalCategory,
    subcategory: finalSubcategory,
    rawRemark: rawRemark.trim(),
    mappedStatus: mapping.status,
    mappedRemark: mapping.remark,
    needsStatusClarification: mapping.needsClarification,
    needsMobileClarification: needsMobile,
    clarificationReason: needsMobile
      ? 'Valid mobile number (10+ digits) is missing. Enter it rather than leaving it empty.'
      : mapping.reason,
    isDuplicateMobile: dups.isDuplicateMobile,
    isDuplicateSerial: dups.isDuplicateSerial,
    rawInputLine: trimmed,
  };
}

export function parseBulkNaturalText(
  bulkText: string,
  defaults: { date: string; category: string; subcategory: string },
  existingRecords: Array<{ serialId: string; mobileNo: string }>
): ParsedDraftRecord[] {
  const normalized = bulkText.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  // Split by blank lines if entries are multi-line S ID / Mobile / Remark blocks
  const blocks = normalized.split(/\n\s*\n/);
  const drafts: ParsedDraftRecord[] = [];
  const runningRecords = [...existingRecords];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const isKeyValueBlock = lines.some((line) =>
      /^(?:s[\s._-]*id|serial[\s._-]*id|mobile|phone|mob|remark|remarks)\s*[:=-]/i.test(
        line
      )
    );

    if (isKeyValueBlock) {
      // Check if multiple "S ID:" blocks were pasted without blank lines between them
      let currentChunk: string[] = [];
      for (const line of lines) {
        const startsNew = /^(?:s[\s._-]*id|serial[\s._-]*id)\s*[:=-]/i.test(line);
        if (startsNew && currentChunk.length > 0 && currentChunk.some((c) => /mobile|phone|remark/i.test(c))) {
          const parsed = parseSingleNaturalText(currentChunk.join('\n'), defaults, runningRecords);
          if (parsed) {
            drafts.push(parsed);
            runningRecords.push({ serialId: parsed.serialId, mobileNo: parsed.mobileNo });
          }
          currentChunk = [line];
        } else {
          currentChunk.push(line);
        }
      }
      if (currentChunk.length > 0) {
        const parsed = parseSingleNaturalText(currentChunk.join('\n'), defaults, runningRecords);
        if (parsed) {
          drafts.push(parsed);
          runningRecords.push({ serialId: parsed.serialId, mobileNo: parsed.mobileNo });
        }
      }
    } else {
      // Each non-empty line is one record (CSV / TSV / space-separated)
      for (const line of lines) {
        const parsed = parseSingleNaturalText(line, defaults, runningRecords);
        if (parsed) {
          drafts.push(parsed);
          runningRecords.push({ serialId: parsed.serialId, mobileNo: parsed.mobileNo });
        }
      }
    }
  }

  return drafts;
}

export function buildFinalCallRecord(
  draft: ParsedDraftRecord,
  rowIndex: number,
  todayKey: string,
  deviceTag?: string
): CallRecord {
  const status: CallStatus = draft.mappedStatus ?? 'Resolved';
  const remark =
    status === 'Unresolved'
      ? DEFAULT_RECORD_VALUES.unresolvedRemark
      : draft.mappedRemark || draft.rawRemark;

  return {
    id: draft.id || makeId(),
    rowIndex,
    date: draft.date.trim() || todayKey,
    serialId: normalizeSerialId(draft.serialId),
    mobileNo: normalizeMobileAsText(draft.mobileNo),
    category: normalizeCategory(draft.category),
    subcategory: normalizeSubcategory(draft.subcategory),
    status,
    escalations: DEFAULT_RECORD_VALUES.escalations,
    channels: DEFAULT_RECORD_VALUES.channels,
    remark,
    names: DEFAULT_RECORD_VALUES.names,
    source: 'added',
    createdAt: new Date().toISOString(),
    addedDateKey: todayKey,
    isDuplicateMobile: draft.isDuplicateMobile,
    isDuplicateSerial: draft.isDuplicateSerial,
    deviceTag,
  };
}
