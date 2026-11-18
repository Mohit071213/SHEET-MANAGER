import {
  AiRemarkSuggestion,
  BulkProcessingSummary,
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
  classifyAmbiguousWithLocalOllama,
  loadLocalAiConfig,
  stripPiiForAi,
} from './aiRemarkEngine';
import {
  classifyRemarkWithDictionary,
  DEFAULT_SHORTCUT_RULES,
  findExactPermittedRemark,
  snapToPermittedCategory,
  snapToPermittedSubcategory,
} from './shortcutDictionary';

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
  if (!trimmed) return '';
  let stripped = trimmed.replace(/[\s()-]/g, '');
  if (/^\+91\d{10}$/.test(stripped)) {
    stripped = stripped.slice(3);
  } else if (/^91\d{10}$/.test(stripped)) {
    stripped = stripped.slice(2);
  }
  return stripped;
}

export function isValidMobileText(mobile: string): boolean {
  const cleaned = normalizeMobileAsText(mobile).replace(/^\+/, '');
  return /^\d{10,15}$/.test(cleaned);
}

export function normalizeSerialId(input: string): string {
  const cleaned = String(input ?? '').trim();
  if (!cleaned) return DEFAULT_RECORD_VALUES.missingSerialId;
  // Rule: Never place a 10-digit mobile number in Serial ID column
  const digitsOnly = cleaned.replace(/^\+?91/, '').replace(/[\s()-]/g, '');
  if (/^\d{10,13}$/.test(digitsOnly)) {
    return DEFAULT_RECORD_VALUES.missingSerialId;
  }
  if (/^(n\/a|na|none|null|-+)$/i.test(cleaned)) {
    return DEFAULT_RECORD_VALUES.missingSerialId;
  }
  return cleaned;
}

export function normalizeCategory(input?: string): CategoryOption {
  return snapToPermittedCategory(input);
}

export function normalizeSubcategory(input?: string): SubcategoryOption {
  return snapToPermittedSubcategory(input);
}

export interface StatusMappingResult {
  status: CallStatus | null;
  category: CategoryOption;
  subcategory: SubcategoryOption;
  remark: RemarkOption | '';
  needsClarification: boolean;
  matchedTrigger?: string;
  confidenceScore?: number;
  analysisLayer?: 'shortcut' | 'semantic-nlp';
  aiSuggestions?: AiRemarkSuggestion[];
  reason?: string;
}

export function mapRemarkToStatusAndColumn9(
  rawRemark: string,
  explicitStatus?: CallStatus | null,
  shortcutRules: ShortcutRule[] = DEFAULT_SHORTCUT_RULES,
  explicitOverrides?: {
    explicitRemark?: RemarkOption | '';
    explicitCategory?: CategoryOption;
    explicitSubcategory?: SubcategoryOption;
    defaultCategory?: CategoryOption;
    defaultSubcategory?: SubcategoryOption;
    alwaysApplyCategorySubcategory?: boolean;
  }
): StatusMappingResult {
  const res = classifyRemarkWithDictionary(rawRemark, shortcutRules, {
    explicitStatus,
    explicitRemark: explicitOverrides?.explicitRemark,
    explicitCategory: explicitOverrides?.explicitCategory,
    explicitSubcategory: explicitOverrides?.explicitSubcategory,
    defaultCategory: explicitOverrides?.defaultCategory,
    defaultSubcategory: explicitOverrides?.defaultSubcategory,
    alwaysApplyCategorySubcategory: explicitOverrides?.alwaysApplyCategorySubcategory,
  });
  return {
    status: res.status,
    category: res.category,
    subcategory: res.subcategory,
    remark: res.remark,
    needsClarification: res.needsClarification,
    matchedTrigger: res.matchedTrigger,
    confidenceScore: res.confidenceScore,
    analysisLayer: res.analysisLayer,
    aiSuggestions: res.aiSuggestions,
    reason: res.reason,
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
  const cleaned = token.trim().replace(/[\s()-]/g, '').replace(/^\+?91(?=\d{10}$)/, '');
  return /^\d{10}$/.test(cleaned) || (/^\d{10,13}$/.test(cleaned) && !/^\d{5,9}$/.test(cleaned));
}

function looksLikeDate(token: string): boolean {
  return isValidDateInput(token);
}

function looksLikeTime(token: string): boolean {
  return /^\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:am|pm))?$/i.test(token.trim());
}

function looksLikeSerialIdToken(token: string, shortcutRules: ShortcutRule[]): boolean {
  const cleaned = token.trim();
  if (!cleaned || looksLikeDate(cleaned) || looksLikeTime(cleaned) || looksLikeMobile(cleaned)) {
    return false;
  }
  if (/^\d{1,2}(?:st|nd|rd|th)$/i.test(cleaned)) {
    return false;
  }
  if (/^\d{5,9}$/.test(cleaned)) {
    return true;
  }
  if (
    /^(level\s*1|calls|mohit|bhaskar|dishant|vishal|resolved|unresolved|query|request|complaint|na|n\/a)$/i.test(
      cleaned
    )
  ) {
    return false;
  }
  if (!mapRemarkToStatusAndColumn9(cleaned, null, shortcutRules).needsClarification) {
    return false;
  }
  return /^(?=.*\d)[a-zA-Z0-9_-]{4,20}$/.test(cleaned);
}

/**
 * Extracts combined "SerialID,Mobile" or "Mobile,SerialID" tokens (e.g. "94147470,6006838660")
 * while keeping leading zeros intact on both values.
 */
function extractCombinedSerialAndMobile(
  token: string
): { serialId: string; mobileNo: string } | null {
  const sidFirst = token.match(
    /^\s*(\d{5,9}|(?=.*\d)[a-zA-Z0-9_-]{5,16})\s*[,/;&]\s*(?:\+?91[\s-]?)?(\d{10})\s*$/
  );
  if (sidFirst && !/^\d{10}$/.test(sidFirst[1])) {
    return {
      serialId: sidFirst[1].trim(),
      mobileNo: normalizeMobileAsText(sidFirst[2]),
    };
  }
  const mobFirst = token.match(
    /^\s*(?:\+?91[\s-]?)?(\d{10})\s*[,/;&]\s*(\d{5,9}|(?=.*\d)[a-zA-Z0-9_-]{5,16})\s*$/
  );
  if (mobFirst && !/^\d{10}$/.test(mobFirst[2])) {
    return {
      serialId: mobFirst[2].trim(),
      mobileNo: normalizeMobileAsText(mobFirst[1]),
    };
  }
  return null;
}

function extractInlineCombinedPair(
  text: string
): { serialId: string; mobileNo: string; remainder: string } | null {
  const sidFirst = text.match(
    /(?:^|\s)(\d{5,9})\s*,\s*(?:\+?91[\s-]?)?(\d{10})(?=$|\s|[,;])/
  );
  if (sidFirst) {
    return {
      serialId: sidFirst[1],
      mobileNo: normalizeMobileAsText(sidFirst[2]),
      remainder: text.replace(sidFirst[0], ' ').replace(/\s+/g, ' ').trim(),
    };
  }
  const mobFirst = text.match(
    /(?:^|\s)(?:\+?91[\s-]?)?(\d{10})\s*,\s*(\d{5,9})(?=$|\s|[,;])/
  );
  if (mobFirst) {
    return {
      serialId: mobFirst[2],
      mobileNo: normalizeMobileAsText(mobFirst[1]),
      remainder: text.replace(mobFirst[0], ' ').replace(/\s+/g, ' ').trim(),
    };
  }
  return null;
}

function extractOrdinalIndex(text: string): { ordinalNum: number; label: string; cleaned: string } | null {
  const m = text.match(/\b(\d{1,2})(st|nd|rd|th)\b/i);
  if (!m) return null;
  const ordinalNum = Number(m[1]);
  if (!Number.isFinite(ordinalNum) || ordinalNum < 1) return null;
  const cleaned = text.replace(m[0], ' ').replace(/\s+/g, ' ').trim();
  return { ordinalNum, label: m[0], cleaned };
}

export interface ParseEntryDefaults {
  date: string;
  category: string;
  subcategory: string;
  escalations?: string;
  channels?: string;
  alwaysApplyCategorySubcategory?: boolean;
}

export function parseSingleNaturalText(
  text: string,
  defaults: ParseEntryDefaults,
  existingRecords: Array<{ serialId: string; mobileNo: string }>,
  shortcutRules: ShortcutRule[] = DEFAULT_SHORTCUT_RULES,
  contextRecords: ParsedDraftRecord[] = []
): ParsedDraftRecord | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let date = defaults.date;
  let serialId = '';
  let mobileNo = '';
  let explicitCategoryInput: string | undefined;
  let explicitSubcategoryInput: string | undefined;
  let explicitStatusFromInput: CallStatus | null = null;
  let rawRemark = '';
  let timestamp: string | undefined;
  let sequenceRef: string | undefined;
  let unresolvedSequenceReason: string | undefined;

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
      } else if (/^(remark|remarks|call\s*details|details|outcome|note)$/.test(key)) {
        rawRemark = rawRemark ? `${rawRemark} ${val}` : val;
      } else if (/^status$/.test(key)) {
        if (/^unresolved$/i.test(val)) explicitStatusFromInput = 'Unresolved';
        else if (/^resolved$/i.test(val)) explicitStatusFromInput = 'Resolved';
        else rawRemark = rawRemark ? `${rawRemark} ${val}` : val;
      } else if (/^category$/.test(key)) {
        explicitCategoryInput = val;
      } else if (/^(sub\s*category|subcategory)$/.test(key)) {
        explicitSubcategoryInput = val;
      } else if (/^date$/.test(key)) {
        date = val;
      }
    }
  } else if (trimmed.includes('\t')) {
    // Tab-separated paste directly from Excel / Google Sheets; split any combined SID,Mobile cells first
    const expandedCells: string[] = [];
    for (const rawCell of text.replace(/\r?\n/g, '').split('\t').map((c) => c.trim())) {
      const pair = extractCombinedSerialAndMobile(rawCell);
      if (pair) {
        expandedCells.push(pair.serialId, pair.mobileNo);
      } else {
        expandedCells.push(rawCell);
      }
    }

    const mobileIdx = expandedCells.findIndex((c) => looksLikeMobile(c));

    if (mobileIdx >= 0) {
      mobileNo = normalizeMobileAsText(expandedCells[mobileIdx]);

      const before = expandedCells.slice(0, mobileIdx).filter((c) => c.length > 0);
      for (const token of before) {
        if (looksLikeDate(token)) {
          date = token;
        } else if (looksLikeTime(token)) {
          timestamp = token;
        } else if (/^\d{1,4}$/.test(token)) {
          // Sequential row number (1..10) -> keep Serial ID as NA
          if (!serialId) serialId = '';
        } else if (looksLikeSerialIdToken(token, shortcutRules)) {
          serialId = token;
        }
      }

      let after = expandedCells.slice(mobileIdx + 1);
      if (!serialId && after[0] && looksLikeSerialIdToken(after[0], shortcutRules)) {
        serialId = after[0];
        after = after.slice(1);
      }

      const colCat = after[0] ?? '';
      const colSub = after[1] ?? '';
      const colStatusOrOutcome = after[2] ?? '';
      const laterNonEmpty = after
        .slice(3)
        .filter(
          (c) =>
            c.length > 0 &&
            !/^(level\s*1|calls|mohit|bhaskar|dishant|vishal)$/i.test(c)
        );

      const nonEmptyAfter = after.filter((c) => c.length > 0);
      if (!colCat && !colSub && colStatusOrOutcome) {
        const isExplicitStatusWord = /^(resolved|unresolved)$/i.test(colStatusOrOutcome);
        if (isExplicitStatusWord && laterNonEmpty.length > 0) {
          explicitStatusFromInput = /^unresolved$/i.test(colStatusOrOutcome)
            ? 'Unresolved'
            : 'Resolved';
          rawRemark = laterNonEmpty[0];
        } else if (
          !mapRemarkToStatusAndColumn9(colStatusOrOutcome, null, shortcutRules).needsClarification
        ) {
          rawRemark = colStatusOrOutcome;
        } else {
          rawRemark = laterNonEmpty[0] || colStatusOrOutcome;
        }
      } else if (nonEmptyAfter.length === 1) {
        rawRemark = nonEmptyAfter[0];
      } else if (nonEmptyAfter.length === 2) {
        if (/^(resolved|unresolved)$/i.test(nonEmptyAfter[0])) {
          explicitStatusFromInput = /^unresolved$/i.test(nonEmptyAfter[0])
            ? 'Unresolved'
            : 'Resolved';
          rawRemark = nonEmptyAfter[1];
        } else if (
          !mapRemarkToStatusAndColumn9(nonEmptyAfter[0], null, shortcutRules).needsClarification
        ) {
          rawRemark = nonEmptyAfter[0];
        } else {
          explicitCategoryInput = nonEmptyAfter[0];
          rawRemark = nonEmptyAfter[1];
        }
      } else if (nonEmptyAfter.length >= 3) {
        explicitCategoryInput = colCat || nonEmptyAfter[0];
        explicitSubcategoryInput = colSub || undefined;
        if (/^(resolved|unresolved)$/i.test(colStatusOrOutcome) && laterNonEmpty.length > 0) {
          explicitStatusFromInput = /^unresolved$/i.test(colStatusOrOutcome)
            ? 'Unresolved'
            : 'Resolved';
          rawRemark = laterNonEmpty[0];
        } else {
          rawRemark =
            colStatusOrOutcome ||
            laterNonEmpty[0] ||
            nonEmptyAfter[nonEmptyAfter.length - 1];
        }
      }
    } else {
      // Tab-separated row without a 10-digit mobile number (e.g., Case B with Serial ID + Remark)
      const nonEmpty = expandedCells.filter((c) => c.length > 0);
      if (nonEmpty.length > 0) {
        const sidCell = nonEmpty.find((c) => looksLikeSerialIdToken(c, shortcutRules));
        if (sidCell) serialId = sidCell;
        const outcomeCell = nonEmpty.find(
          (c) =>
            c !== sidCell &&
            !looksLikeDate(c) &&
            !looksLikeTime(c) &&
            !/^\d{1,4}$/.test(c) &&
            !mapRemarkToStatusAndColumn9(c, null, shortcutRules).needsClarification
        );
        const fallbackRemark = nonEmpty.find(
          (c) => c !== sidCell && !looksLikeDate(c) && !looksLikeTime(c) && !/^\d{1,4}$/.test(c)
        );
        rawRemark = outcomeCell ?? fallbackRemark ?? '';
      }
    }
  } else {
    // Extract inline comma-joined "SerialID,Mobile" or "Mobile,SerialID" (e.g. "2 94147470,6006838660 Not Available")
    let workText = trimmed;
    const inlinePair = extractInlineCombinedPair(workText);
    if (inlinePair) {
      serialId = inlinePair.serialId;
      mobileNo = inlinePair.mobileNo;
      workText = inlinePair.remainder;
    }

    // Delimited (| or genuine comma-separated columns) or unstructured space-separated row (Cases A–I)
    const delimiterRegex = workText.includes('|') ? /[|]+/ : /[,]+/;
    const parts = workText
      .split(delimiterRegex)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (parts.length >= 2) {
      const remaining: string[] = [];
      for (const part of parts) {
        if (!mobileNo && looksLikeMobile(part)) {
          mobileNo = normalizeMobileAsText(part);
        } else if (looksLikeDate(part)) {
          date = part;
        } else if (!timestamp && looksLikeTime(part)) {
          timestamp = part;
        } else {
          remaining.push(part);
        }
      }

      if (remaining.length === 1) {
        if (!serialId && looksLikeSerialIdToken(remaining[0], shortcutRules)) {
          serialId = remaining[0];
        } else {
          rawRemark = remaining[0];
        }
      } else if (remaining.length === 2) {
        if (!serialId && looksLikeSerialIdToken(remaining[0], shortcutRules)) {
          serialId = remaining[0];
          rawRemark = remaining[1];
        } else if (!serialId && looksLikeSerialIdToken(remaining[1], shortcutRules)) {
          serialId = remaining[1];
          rawRemark = remaining[0];
        } else if (/^\d{1,4}$/.test(remaining[0])) {
          rawRemark = remaining[1];
        } else {
          rawRemark = remaining.join(' ');
        }
      } else if (remaining.length >= 3) {
        if (!serialId) {
          serialId = /^\d{1,4}$/.test(remaining[0])
            ? ''
            : looksLikeSerialIdToken(remaining[0], shortcutRules)
              ? remaining[0]
              : '';
        }
        if (remaining.length === 3) {
          if (/^(resolved|unresolved)$/i.test(remaining[1])) {
            explicitStatusFromInput = /^unresolved$/i.test(remaining[1])
              ? 'Unresolved'
              : 'Resolved';
            rawRemark = remaining[2];
          } else if (serialId) {
            explicitCategoryInput = remaining[1];
            rawRemark = remaining[2];
          } else {
            rawRemark = remaining.join(', ');
          }
        } else {
          explicitCategoryInput = remaining[1];
          explicitSubcategoryInput = remaining[2];
          rawRemark = remaining.slice(3).join(', ');
        }
      }
    } else {
      // Unstructured single line (Cases A, B, C, D, E, F, G, H, I)
      let work = workText;

      // 1. Date token
      const dateMatch = work.match(/\b(\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/);
      if (dateMatch && looksLikeDate(dateMatch[1])) {
        date = dateMatch[1];
        work = work.replace(dateMatch[0], ' ').replace(/\s+/g, ' ').trim();
      }

      // 2. Time token (e.g. "12:18", "12:24") — extract BEFORE Serial ID so "12:18" is never confused
      const timeMatch = work.match(/\b(\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:am|pm))?)\b/i);
      if (timeMatch) {
        timestamp = timeMatch[1];
        work = work.replace(timeMatch[0], ' ').replace(/\s+/g, ' ').trim();
      }

      // 3. 10-digit Mobile number (with optional +91 / 91) — extract BEFORE Serial ID
      if (!mobileNo) {
        const mobMatch = work.match(/(?:^|\s)(?:\+?91[\s-]?)?(\d{10})\b/);
        if (mobMatch) {
          mobileNo = normalizeMobileAsText(mobMatch[1]);
          work = work.replace(mobMatch[0], ' ').replace(/\s+/g, ' ').trim();
        }
      }

      // 4. Optional leading list row number like "1. " or "10 " when mobile/serial already found
      if (mobileNo || serialId) {
        work = work.replace(/^\d{1,4}[.)]?\s+/, '').trim();
        // Also clear bare trailing/leading sequence digit if nothing else remains
        if (/^\d{1,4}$/.test(work)) {
          work = '';
        }
      } else {
        work = work.replace(/^\d{1,4}[.)]\s+/, '').trim();
      }

      // 5. Serial ID token (any order: before or after mobile/remark, excluding ordinals & words)
      const tokens = work.split(/\s+/).filter(Boolean);
      const keptTokens: string[] = [];
      for (const tok of tokens) {
        const cleanTok = tok.replace(/^[,;:]+|[,;:]+$/g, '');
        if (!serialId && looksLikeSerialIdToken(cleanTok, shortcutRules)) {
          serialId = cleanTok;
        } else {
          keptTokens.push(tok);
        }
      }
      work = keptTokens.join(' ').trim();

      // 6. Ordinal reference resolution (Case G: "1st", "2nd", etc.) when neither Serial ID nor Mobile is present
      if (!serialId && !mobileNo) {
        const ord = extractOrdinalIndex(work);
        if (ord) {
          sequenceRef = ord.label;
          work = ord.cleaned;
          const targetIdx = ord.ordinalNum - 1;
          const refRecord = contextRecords[targetIdx];
          if (
            refRecord &&
            (isValidMobileText(refRecord.mobileNo) ||
              (refRecord.serialId && refRecord.serialId !== 'NA'))
          ) {
            serialId = refRecord.serialId !== 'NA' ? refRecord.serialId : '';
            mobileNo = refRecord.mobileNo;
          } else {
            unresolvedSequenceReason = `Sequence reference "${ord.label}" could not be resolved confidently from surrounding records.`;
          }
        }
      }

      rawRemark = work.replace(/^[,:-\s]+|[,:-\s]+$/g, '').trim();
    }
  }

  const finalSerialId = normalizeSerialId(serialId);
  const finalMobile = normalizeMobileAsText(mobileNo);

  const mapping = mapRemarkToStatusAndColumn9(
    rawRemark,
    explicitStatusFromInput,
    shortcutRules,
    {
      explicitCategory: explicitCategoryInput
        ? normalizeCategory(explicitCategoryInput)
        : undefined,
      explicitSubcategory: explicitSubcategoryInput
        ? normalizeSubcategory(explicitSubcategoryInput)
        : undefined,
      defaultCategory: normalizeCategory(defaults.category),
      defaultSubcategory: normalizeSubcategory(defaults.subcategory),
      alwaysApplyCategorySubcategory: defaults.alwaysApplyCategorySubcategory,
    }
  );

  // Respect explicit input columns first; otherwise apply global defaults when enforced or use mapped category/subcategory
  const finalCategory: CategoryOption = explicitCategoryInput
    ? normalizeCategory(explicitCategoryInput)
    : defaults.alwaysApplyCategorySubcategory
      ? normalizeCategory(defaults.category)
      : mapping.remark
        ? mapping.category
        : normalizeCategory(defaults.category);

  const finalSubcategory: SubcategoryOption = explicitSubcategoryInput
    ? normalizeSubcategory(explicitSubcategoryInput)
    : defaults.alwaysApplyCategorySubcategory
      ? normalizeSubcategory(defaults.subcategory)
      : mapping.remark
        ? mapping.subcategory
        : normalizeSubcategory(defaults.subcategory);

  const dups = checkDuplicates(finalSerialId, finalMobile, existingRecords);

  // Case B & Section 5: Serial ID present WITHOUT mobile is completely valid (mobile stays '').
  // Only flag missing identifier when BOTH Serial ID ('NA') AND mobile ('') are unavailable, or mobile is malformed, or sequenceRef failed.
  const hasValidMobile = isValidMobileText(finalMobile);
  const hasSerialId = finalSerialId !== DEFAULT_RECORD_VALUES.missingSerialId;
  const hasMalformedMobile = finalMobile.length > 0 && !hasValidMobile;
  const needsIdentifierReview =
    Boolean(unresolvedSequenceReason) || hasMalformedMobile || (!hasValidMobile && !hasSerialId);

  let clarificationReason: string | undefined;
  if (unresolvedSequenceReason) {
    clarificationReason = unresolvedSequenceReason;
  } else if (hasMalformedMobile) {
    clarificationReason = 'Mobile number must be 10 digits.';
  } else if (!hasValidMobile && !hasSerialId) {
    clarificationReason =
      'Both Serial ID and Mobile Number are missing or could not be identified.';
  } else if (mapping.needsClarification) {
    clarificationReason =
      !rawRemark.trim() && (hasValidMobile || hasSerialId)
        ? hasSerialId && hasValidMobile
          ? 'Serial ID and Mobile Number extracted; select Status and exact Master Remark.'
          : 'No remark provided; select Status and exact Master Remark.'
        : mapping.reason;
  }

  return {
    id: makeId(),
    date,
    serialId: finalSerialId,
    mobileNo: finalMobile,
    category: finalCategory,
    subcategory: finalSubcategory,
    escalations: defaults.escalations?.trim() || DEFAULT_RECORD_VALUES.escalations,
    channels: defaults.channels?.trim() || DEFAULT_RECORD_VALUES.channels,
    rawRemark: rawRemark.trim(),
    mappedStatus: mapping.status,
    mappedRemark: mapping.remark,
    needsStatusClarification: mapping.needsClarification,
    needsMobileClarification: needsIdentifierReview,
    clarificationReason,
    isDuplicateMobile: dups.isDuplicateMobile,
    isDuplicateSerial: dups.isDuplicateSerial,
    matchedShortcutTrigger: mapping.matchedTrigger,
    confidenceScore: mapping.confidenceScore,
    analysisLayer: mapping.analysisLayer,
    aiSuggestions: mapping.aiSuggestions,
    timestamp,
    sequenceRef,
    rawInputLine: trimmed,
  };
}

/**
 * Layer 4 Optional Free Local Ollama Enhancement:
 * Runs ONLY on ambiguous rows when the user opted into Local Ollama in Settings.
 * All mobile numbers & Serial IDs are stripped before inference.
 */
export async function enhanceDraftsWithOllamaIfEnabled(
  drafts: ParsedDraftRecord[],
  defaults: ParseEntryDefaults
): Promise<ParsedDraftRecord[]> {
  const aiConfig = loadLocalAiConfig();
  if (!aiConfig.enabled) return drafts;

  const targetIndices: number[] = [];
  drafts.forEach((d, idx) => {
    if (!d.skipped && d.needsStatusClarification && d.rawRemark.trim().length > 0) {
      targetIndices.push(idx);
    }
  });
  if (targetIndices.length === 0) return drafts;

  const updated = [...drafts];
  for (const idx of targetIndices.slice(0, 20)) {
    const item = updated[idx];
    const anonymized = stripPiiForAi(item.rawRemark);
    if (!anonymized) continue;
    const suggestion = await classifyAmbiguousWithLocalOllama(anonymized, aiConfig);
    if (!suggestion) continue;

    updated[idx] = {
      ...item,
      mappedStatus: suggestion.status,
      mappedRemark: suggestion.remark,
      category: defaults.alwaysApplyCategorySubcategory
        ? normalizeCategory(defaults.category)
        : suggestion.category,
      subcategory: defaults.alwaysApplyCategorySubcategory
        ? normalizeSubcategory(defaults.subcategory)
        : suggestion.subcategory,
      needsStatusClarification: false,
      confidenceScore: suggestion.score,
      analysisLayer: 'ollama-local',
      clarificationReason: item.needsMobileClarification ? item.clarificationReason : undefined,
    };
  }
  return updated;
}

export function parseBulkNaturalText(
  bulkText: string,
  defaults: ParseEntryDefaults,
  existingRecords: Array<{ serialId: string; mobileNo: string }>,
  shortcutRules: ShortcutRule[] = DEFAULT_SHORTCUT_RULES
): ParsedDraftRecord[] {
  const normalized = bulkText.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n\s*\n/);
  const drafts: ParsedDraftRecord[] = [];
  const existingSnap = [...existingRecords];
  const seenBatchMobiles = new Set<string>();
  const seenBatchSerials = new Set<string>();

  const pushDraft = (parsed: ParsedDraftRecord | null) => {
    if (!parsed) return;
    const normMob = normalizeMobileAsText(parsed.mobileNo);
    const normSid = normalizeSerialId(parsed.serialId).toLowerCase();
    const batchDupMob = normMob.length > 0 && seenBatchMobiles.has(normMob);
    const batchDupSid = normSid !== 'na' && normSid.length > 0 && seenBatchSerials.has(normSid);

    parsed.isDuplicateBatch = batchDupMob || batchDupSid;
    if (batchDupMob) parsed.isDuplicateMobile = true;
    if (batchDupSid) parsed.isDuplicateSerial = true;

    if (normMob) seenBatchMobiles.add(normMob);
    if (normSid !== 'na' && normSid) seenBatchSerials.add(normSid);

    drafts.push(parsed);
  };

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
      let currentChunk: string[] = [];
      for (const line of lines) {
        const startsNew = /^(?:s[\s._-]*id|serial[\s._-]*id)\s*[:=-]/i.test(line);
        if (
          startsNew &&
          currentChunk.length > 0 &&
          currentChunk.some((c) => /mobile|phone|remark/i.test(c))
        ) {
          pushDraft(
            parseSingleNaturalText(
              currentChunk.join('\n'),
              defaults,
              existingSnap,
              shortcutRules,
              drafts
            )
          );
          currentChunk = [line];
        } else {
          currentChunk.push(line);
        }
      }
      if (currentChunk.length > 0) {
        pushDraft(
          parseSingleNaturalText(
            currentChunk.join('\n'),
            defaults,
            existingSnap,
            shortcutRules,
            drafts
          )
        );
      }
    } else {
      for (const line of lines) {
        pushDraft(
          parseSingleNaturalText(line, defaults, existingSnap, shortcutRules, drafts)
        );
      }
    }
  }

  return drafts;
}

export function summarizeProcessingResults(
  drafts: ParsedDraftRecord[]
): BulkProcessingSummary {
  const active = drafts.filter((d) => !d.skipped);
  let successfullyIdentified = 0;
  let phonesDetected = 0;
  let serialIdsDetected = 0;
  let assignedNaCount = 0;
  let dropdownsMappedCount = 0;
  let duplicateCount = 0;
  let reviewRequiredCount = 0;

  for (const d of active) {
    if (isValidMobileText(d.mobileNo)) phonesDetected++;
    if (d.serialId && d.serialId !== 'NA') {
      serialIdsDetected++;
    } else {
      assignedNaCount++;
    }
    if (!d.needsStatusClarification && d.mappedStatus && d.mappedRemark) {
      dropdownsMappedCount++;
    }
    if (d.isDuplicateMobile || d.isDuplicateSerial || d.isDuplicateBatch) {
      duplicateCount++;
    }
    if (d.needsMobileClarification || d.needsStatusClarification) {
      reviewRequiredCount++;
    } else {
      successfullyIdentified++;
    }
  }

  return {
    totalDetected: active.length,
    successfullyIdentified,
    phonesDetected,
    serialIdsDetected,
    assignedNaCount,
    dropdownsMappedCount,
    duplicateCount,
    reviewRequiredCount,
  };
}

export function buildFinalCallRecord(
  draft: ParsedDraftRecord,
  rowIndex: number,
  todayKey: string,
  employeeName: EmployeeName = 'Mohit',
  deviceTag?: string,
  globalDefaults?: GlobalEntryDefaults
): CallRecord {
  const status: CallStatus = draft.mappedStatus ?? 'Resolved';
  const exactRemark =
    status === 'Unresolved' && !draft.mappedRemark
      ? DEFAULT_RECORD_VALUES.unresolvedRemark
      : findExactPermittedRemark(draft.mappedRemark) ||
        findExactPermittedRemark(draft.rawRemark) ||
        DEFAULT_RECORD_VALUES.unresolvedRemark;

  const finalCategory = draft.category
    ? normalizeCategory(draft.category)
    : globalDefaults?.defaultCategory ?? DEFAULT_RECORD_VALUES.category;

  const finalSubcategory = draft.subcategory
    ? normalizeSubcategory(draft.subcategory)
    : globalDefaults?.defaultSubcategory ?? DEFAULT_RECORD_VALUES.subcategory;

  const finalEscalations =
    draft.escalations?.trim() ||
    globalDefaults?.defaultEscalations ||
    DEFAULT_RECORD_VALUES.escalations;

  const finalChannels =
    draft.channels?.trim() ||
    globalDefaults?.defaultChannels ||
    DEFAULT_RECORD_VALUES.channels;

  return {
    id: draft.id || makeId(),
    rowIndex,
    date: draft.date.trim() || todayKey,
    serialId: normalizeSerialId(draft.serialId),
    mobileNo: normalizeMobileAsText(draft.mobileNo),
    category: finalCategory,
    subcategory: finalSubcategory,
    status,
    escalations: finalEscalations,
    channels: finalChannels,
    remark: exactRemark,
    names: employeeName || DEFAULT_RECORD_VALUES.names,
    source: 'added',
    createdAt: new Date().toISOString(),
    addedDateKey: todayKey,
    isDuplicateMobile: draft.isDuplicateMobile,
    isDuplicateSerial: draft.isDuplicateSerial,
    deviceTag,
  };
}
