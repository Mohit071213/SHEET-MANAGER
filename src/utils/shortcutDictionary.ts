import {
  AiRemarkSuggestion,
  CallStatus,
  CategoryOption,
  DEFAULT_RECORD_VALUES,
  EmployeeId,
  PERMITTED_CATEGORIES,
  PERMITTED_REMARKS,
  PERMITTED_SUBCATEGORIES,
  RemarkOption,
  ShortcutHistoryEntry,
  ShortcutRule,
  SubcategoryOption,
} from '../types/callsheet';
import { analyzeRemarkWithLocalNlp } from './aiRemarkEngine';

const SHORTCUT_STORAGE_PREFIX = 'callsheet_shortcuts_v1_';
const SHORTCUT_HISTORY_PREFIX = 'callsheet_shortcut_history_v1_';

function rule(
  id: string,
  trigger: string,
  status: CallStatus,
  category: CategoryOption,
  subcategory: SubcategoryOption,
  remark: RemarkOption,
  matchType: ShortcutRule['matchType'] = 'contains'
): ShortcutRule {
  return {
    id,
    trigger,
    matchType,
    status,
    category,
    subcategory,
    remark,
    enabled: true,
    isCustom: false,
  };
}

export const DEFAULT_SHORTCUT_RULES: ShortcutRule[] = [
  // Multi-word high-specificity phrases first
  rule(
    'def_disconnect_conv',
    'disconnect in conversation',
    'Unresolved',
    'Query',
    'General information related',
    'cx disconnect the call in conversation'
  ),
  rule(
    'def_disconnected_conv',
    'disconnected in conversation',
    'Unresolved',
    'Query',
    'General information related',
    'cx disconnect the call in conversation'
  ),
  rule(
    'def_call_cut',
    'call cut',
    'Unresolved',
    'Query',
    'General information related',
    'cx disconnect the call in conversation'
  ),
  rule(
    'def_stop_ivr',
    'stop ivr',
    'Resolved',
    'Request',
    'General information related',
    'CX requested to stop IVR calls, is irritated, and will pay by end of day'
  ),
  rule(
    'def_bank_occupied',
    'bank details occupied',
    'Resolved',
    'Complaint',
    'General information related',
    'Bank details occupied'
  ),
  rule(
    'def_bank_occupied_short',
    'bank occupied',
    'Resolved',
    'Complaint',
    'General information related',
    'Bank details occupied'
  ),
  rule(
    'def_paid_not_updated',
    'paid not updated',
    'Resolved',
    'Complaint',
    'General information related',
    'CX paid but not updated in app'
  ),
  rule(
    'def_paid_but_not_updated',
    'paid but not updated',
    'Resolved',
    'Complaint',
    'General information related',
    'CX paid but not updated in app'
  ),
  rule(
    'def_payment_status_not_updated',
    'payment status not updated',
    'Resolved',
    'Complaint',
    'General information related',
    'Payment status / loan status not updated'
  ),
  rule(
    'def_loan_status_not_updated',
    'loan status not updated',
    'Resolved',
    'Complaint',
    'General information related',
    'Payment status / loan status not updated'
  ),
  rule(
    'def_refund_failed',
    'refund failed',
    'Resolved',
    'Complaint',
    'Refund & Double Deduction',
    'Refund for failed payment'
  ),
  rule(
    'def_failed_payment',
    'failed payment',
    'Resolved',
    'Complaint',
    'Refund & Double Deduction',
    'Refund for failed payment'
  ),
  rule(
    'def_extra_payment',
    'extra payment',
    'Resolved',
    'Complaint',
    'Refund & Double Deduction',
    'Refund for Extra Payment'
  ),
  rule(
    'def_double_deduction',
    'double deduction',
    'Resolved',
    'Complaint',
    'Refund & Double Deduction',
    'Refund for Extra Payment'
  ),
  rule(
    'def_paid_twice',
    'paid twice',
    'Resolved',
    'Complaint',
    'Refund & Double Deduction',
    'Refund for Extra Payment'
  ),
  rule(
    'def_cooling_period',
    'cooling period',
    'Resolved',
    'Query',
    'Charges & Tenure',
    'Foreclose & Cooling period'
  ),
  rule(
    'def_company_location',
    'company location',
    'Resolved',
    'Query',
    'General information related',
    'Request for company location / registration details'
  ),
  rule(
    'def_office_address',
    'office address',
    'Resolved',
    'Query',
    'General information related',
    'Request for company location / registration details'
  ),
  rule(
    'def_partial_payment',
    'partial payment',
    'Resolved',
    'Query',
    'General information related',
    'partial payment query'
  ),
  rule(
    'def_part_payment',
    'part payment',
    'Resolved',
    'Query',
    'General information related',
    'partial payment query'
  ),
  rule(
    'def_payment_link_phrase',
    'payment link',
    'Resolved',
    'Request',
    'General information related',
    'Payment link'
  ),
  rule(
    'def_pay_link',
    'pay link',
    'Resolved',
    'Request',
    'General information related',
    'Payment link'
  ),
  rule(
    'def_shared_link',
    'shared link',
    'Resolved',
    'Request',
    'General information related',
    'Payment link'
  ),
  rule(
    'def_link_sent',
    'link sent',
    'Resolved',
    'Request',
    'General information related',
    'Payment link'
  ),
  rule(
    'def_repayment_date',
    'repayment date',
    'Resolved',
    'Query',
    'General information related',
    'cx asking repayment date inquiries'
  ),
  rule(
    'def_repayment_details',
    'repayment details',
    'Resolved',
    'Query',
    'General information related',
    'cx asking repayment date inquiries'
  ),
  rule(
    'def_repayment',
    'repayment',
    'Resolved',
    'Query',
    'General information related',
    'cx asking repayment date inquiries'
  ),
  rule(
    'def_due_date',
    'due date',
    'Resolved',
    'Query',
    'General information related',
    'cx asking repayment date inquiries'
  ),
  rule(
    'def_payment_updation',
    'payment updation',
    'Resolved',
    'Request',
    'General information related',
    'Payment updation'
  ),
  rule(
    'def_payment_receipts',
    'payment receipt',
    'Resolved',
    'Request',
    'General information related',
    'payment receipts'
  ),
  rule(
    'def_receipt',
    'receipt',
    'Resolved',
    'Request',
    'General information related',
    'payment receipts'
  ),
  rule(
    'def_bank_change',
    'bank change',
    'Resolved',
    'Request',
    'General information related',
    'Change Details'
  ),
  rule(
    'def_change_details',
    'change details',
    'Resolved',
    'Request',
    'General information related',
    'Change Details'
  ),
  rule(
    'def_bank_details',
    'bank details',
    'Resolved',
    'Query',
    'General information related',
    'bank details'
  ),

  // Unresolved triggers
  rule(
    'def_cx_not_response',
    'cx not response',
    'Unresolved',
    'Query',
    'General information related',
    'CX NOT RESPONSE THE CALL'
  ),
  rule(
    'def_no_response',
    'no response',
    'Unresolved',
    'Query',
    'General information related',
    'CX NOT RESPONSE THE CALL'
  ),
  rule(
    'def_no_res',
    'no res',
    'Unresolved',
    'Query',
    'General information related',
    'CX NOT RESPONSE THE CALL'
  ),
  rule(
    'def_not_responding',
    'not responding',
    'Unresolved',
    'Query',
    'General information related',
    'CX NOT RESPONSE THE CALL'
  ),
  rule(
    'def_no_answer',
    'no answer',
    'Unresolved',
    'Query',
    'General information related',
    'CX NOT RESPONSE THE CALL'
  ),
  rule(
    'def_not_available',
    'not available',
    'Unresolved',
    'Query',
    'General information related',
    'CX NOT RESPONSE THE CALL'
  ),
  rule(
    'def_unavailable',
    'unavailable',
    'Unresolved',
    'Query',
    'General information related',
    'CX NOT RESPONSE THE CALL'
  ),
  rule(
    'def_not_reachable',
    'not reachable',
    'Unresolved',
    'Query',
    'General information related',
    'CX NOT RESPONSE THE CALL'
  ),
  rule(
    'def_switched_off',
    'switched off',
    'Unresolved',
    'Query',
    'General information related',
    'CX NOT RESPONSE THE CALL'
  ),
  rule(
    'def_not_connected',
    'not connected',
    'Unresolved',
    'Query',
    'General information related',
    'CX NOT RESPONSE THE CALL'
  ),
  rule(
    'def_call_not_picked',
    'call not picked',
    'Unresolved',
    'Query',
    'General information related',
    'CX NOT RESPONSE THE CALL'
  ),
  rule(
    'def_did_not_pick',
    'did not pick',
    'Unresolved',
    'Query',
    'General information related',
    'CX NOT RESPONSE THE CALL'
  ),
  rule(
    'def_busy',
    'busy',
    'Unresolved',
    'Query',
    'General information related',
    'CX NOT RESPONSE THE CALL'
  ),
  rule(
    'def_disconnected',
    'disconnected',
    'Unresolved',
    'Query',
    'General information related',
    'CX NOT RESPONSE THE CALL'
  ),
  rule(
    'def_invalid',
    'invalid',
    'Unresolved',
    'Query',
    'General information related',
    'CX NOT RESPONSE THE CALL'
  ),
  rule(
    'def_rnr',
    'rnr',
    'Unresolved',
    'Query',
    'General information related',
    'CX NOT RESPONSE THE CALL'
  ),

  // General, Transfers & Languages
  rule(
    'def_general_enquiry',
    'general enquiry',
    'Resolved',
    'Query',
    'General information related',
    'general query'
  ),
  rule(
    'def_general_inquiry',
    'general inquiry',
    'Resolved',
    'Query',
    'General information related',
    'general query'
  ),
  rule(
    'def_general_query',
    'general query',
    'Resolved',
    'Query',
    'General information related',
    'general query'
  ),
  rule(
    'def_query_resolved',
    'query resolved',
    'Resolved',
    'Query',
    'General information related',
    'general query'
  ),
  rule(
    'def_general_short',
    'general',
    'Resolved',
    'Query',
    'General information related',
    'general query'
  ),
  rule(
    'def_gen',
    'gen',
    'Resolved',
    'Query',
    'General information related',
    'general query',
    'exact'
  ),
  rule(
    'def_transferred',
    'transferred',
    'Resolved',
    'Request',
    'General information related',
    'Transfering'
  ),
  rule(
    'def_transfering',
    'transfering',
    'Resolved',
    'Request',
    'General information related',
    'Transfering'
  ),
  rule(
    'def_transferring',
    'transferring',
    'Resolved',
    'Request',
    'General information related',
    'Transfering'
  ),
  rule(
    'def_transfer',
    'transfer',
    'Resolved',
    'Request',
    'General information related',
    'Transfering'
  ),
  rule(
    'def_other_language',
    'other language',
    'Resolved',
    'Request',
    'General information related',
    'other language'
  ),
  rule(
    'def_tamil',
    'tamil',
    'Resolved',
    'Request',
    'General information related',
    'other language'
  ),
  rule(
    'def_telugu',
    'telugu',
    'Resolved',
    'Request',
    'General information related',
    'other language'
  ),
  rule(
    'def_kannada',
    'kannada',
    'Resolved',
    'Request',
    'General information related',
    'other language'
  ),
  rule(
    'def_malayalam',
    'malayalam',
    'Resolved',
    'Request',
    'General information related',
    'other language'
  ),
  rule(
    'def_marathi',
    'marathi',
    'Resolved',
    'Request',
    'General information related',
    'other language'
  ),
  rule(
    'def_bengali',
    'bengali',
    'Resolved',
    'Request',
    'General information related',
    'other language'
  ),
  rule(
    'def_gujarati',
    'gujarati',
    'Resolved',
    'Request',
    'General information related',
    'other language'
  ),
  rule(
    'def_hindi_cx',
    'hindi cx',
    'Resolved',
    'Request',
    'General information related',
    'other language'
  ),

  // Loan, Rejection, Foreclosure, Settlement, Extension, Credit, Charges
  rule(
    'def_rejected',
    'rejected',
    'Resolved',
    'Query',
    'General information related',
    'Loan rejection reason'
  ),
  rule(
    'def_rejection',
    'rejection',
    'Resolved',
    'Query',
    'General information related',
    'Loan rejection reason'
  ),
  rule(
    'def_loan_stage',
    'loan stage',
    'Resolved',
    'Query',
    'General information related',
    'Loan stage / loan status enquiry'
  ),
  rule(
    'def_loan_status',
    'loan status',
    'Resolved',
    'Query',
    'General information related',
    'Loan stage / loan status enquiry'
  ),
  rule(
    'def_foreclose',
    'foreclose',
    'Resolved',
    'Request',
    'Charges & Tenure',
    'cx foreclose the loan'
  ),
  rule(
    'def_foreclosure',
    'foreclosure',
    'Resolved',
    'Request',
    'Charges & Tenure',
    'cx foreclose the loan'
  ),
  rule(
    'def_tenure',
    'tenure',
    'Resolved',
    'Query',
    'Charges & Tenure',
    'higher limit/ tenure'
  ),
  rule(
    'def_higher_limit',
    'higher limit',
    'Resolved',
    'Query',
    'Charges & Tenure',
    'higher limit/ tenure'
  ),
  rule(
    'def_roi',
    'roi',
    'Resolved',
    'Query',
    'Charges & Tenure',
    'Charges, Rates & FPC related'
  ),
  rule(
    'def_charges',
    'charges',
    'Resolved',
    'Query',
    'Charges & Tenure',
    'Charges, Rates & FPC related'
  ),
  rule(
    'def_fpc',
    'fpc',
    'Resolved',
    'Query',
    'Charges & Tenure',
    'Charges, Rates & FPC related'
  ),
  rule(
    'def_apr',
    'apr',
    'Resolved',
    'Query',
    'Charges & Tenure',
    'APR logic and understanding'
  ),
  rule(
    'def_overdue',
    'overdue',
    'Resolved',
    'Query',
    'Charges & Tenure',
    'CX ASKING OVERDUE AMOUNT INQUIRIES'
  ),
  rule(
    'def_settlement',
    'settlement',
    'Resolved',
    'Request',
    'Settlement & Waiver',
    'Waiver request and settlement cases'
  ),
  rule(
    'def_waiver',
    'waiver',
    'Resolved',
    'Request',
    'Settlement & Waiver',
    'Waiver request and settlement cases'
  ),
  rule(
    'def_noc',
    'noc',
    'Resolved',
    'Request',
    'Settlement & Waiver',
    'NOC'
  ),
  rule(
    'def_extension',
    'extension',
    'Resolved',
    'Request',
    'Extension Related',
    'Extension request for more days'
  ),
  rule(
    'def_more_days',
    'more days',
    'Resolved',
    'Request',
    'Extension Related',
    'Extension request for more days'
  ),
  rule(
    'def_suit_filed',
    'suit filed',
    'Resolved',
    'Request',
    'Credit Discrepancy',
    'Suit Filed status removal'
  ),
  rule(
    'def_written_off',
    'written off',
    'Resolved',
    'Request',
    'Credit Discrepancy',
    'Post-Written off removal'
  ),
  rule(
    'def_dpd',
    'dpd',
    'Resolved',
    'Request',
    'Credit Discrepancy',
    'DPD removal'
  ),
  rule(
    'def_outstanding_removal',
    'outstanding balance removal',
    'Resolved',
    'Request',
    'Credit Discrepancy',
    'Outstanding balance removal'
  ),
  rule(
    'def_credit_report',
    'credit report',
    'Resolved',
    'Complaint',
    'Credit Discrepancy',
    'Complaint on wrong details update in credit reports'
  ),
  rule(
    'def_cibil',
    'cibil',
    'Resolved',
    'Complaint',
    'Credit Discrepancy',
    'Complaint on wrong details update in credit reports'
  ),
  rule(
    'def_incorrect_loan',
    'incorrect loan details',
    'Resolved',
    'Complaint',
    'Credit Discrepancy',
    'Incorrect loan details mapped'
  ),

  // IVR, E-NACH, Regulatory, Complaints, App, Cancel
  rule(
    'def_ivr',
    'ivr',
    'Resolved',
    'Query',
    'General information related',
    'ivr calls'
  ),
  rule(
    'def_enach',
    'e-nach',
    'Resolved',
    'Request',
    'General information related',
    'E-NACH RELATED'
  ),
  rule(
    'def_enach_plain',
    'enach',
    'Resolved',
    'Request',
    'General information related',
    'E-NACH RELATED'
  ),
  rule(
    'def_fraud',
    'fraud',
    'Resolved',
    'Complaint',
    'General information related',
    'getting fraud &harassment calls'
  ),
  rule(
    'def_harassment',
    'harassment',
    'Resolved',
    'Complaint',
    'General information related',
    'getting fraud &harassment calls'
  ),
  rule(
    'def_coercive',
    'coercive',
    'Resolved',
    'Complaint',
    'General information related',
    'Coercive methods of collection'
  ),
  rule(
    'def_soft_call',
    'soft call',
    'Resolved',
    'Complaint',
    'General information related',
    'Soft call related complaints'
  ),
  rule(
    'def_deleted_account',
    'deleted account',
    'Resolved',
    'Request',
    'General information related',
    'CX DELETED THE ACCOUNT'
  ),
  rule(
    'def_gst_rbi',
    'gst',
    'Resolved',
    'Query',
    'General information related',
    'GST & RBI registration details'
  ),
  rule(
    'def_rbi',
    'rbi',
    'Resolved',
    'Query',
    'General information related',
    'GST & RBI registration details'
  ),
  rule(
    'def_cancel',
    'cancel',
    'Resolved',
    'Request',
    'General information related',
    'Cancel request'
  ),
  rule(
    'def_app_issue',
    'app issue',
    'Resolved',
    'Complaint',
    'General information related',
    'Application issue'
  ),
  rule(
    'def_application_issue',
    'application issue',
    'Resolved',
    'Complaint',
    'General information related',
    'Application issue'
  ),
  rule(
    'def_resolved_exact',
    'resolved',
    'Resolved',
    'Query',
    'General information related',
    'general query',
    'exact'
  ),
];

export function snapToPermittedCategory(input?: string): CategoryOption {
  const cleaned = String(input ?? '').trim().toLowerCase();
  const exact = PERMITTED_CATEGORIES.find((c) => c.toLowerCase() === cleaned);
  if (exact) return exact;
  if (cleaned.includes('complaint')) return 'Complaint';
  if (cleaned.includes('request')) return 'Request';
  return DEFAULT_RECORD_VALUES.category;
}

export function snapToPermittedSubcategory(input?: string): SubcategoryOption {
  const cleaned = String(input ?? '').trim().toLowerCase();
  const exact = PERMITTED_SUBCATEGORIES.find((s) => s.toLowerCase() === cleaned);
  if (exact) return exact;
  if (cleaned.includes('credit') || cleaned.includes('cibil') || cleaned.includes('dpd')) {
    return 'Credit Discrepancy';
  }
  if (cleaned.includes('charge') || cleaned.includes('tenure') || cleaned.includes('rate')) {
    return 'Charges & Tenure';
  }
  if (cleaned.includes('settle') || cleaned.includes('waiver')) {
    return 'Settlement & Waiver';
  }
  if (cleaned.includes('exten')) {
    return 'Extension Related';
  }
  if (cleaned.includes('refund') || cleaned.includes('double') || cleaned.includes('extra')) {
    return 'Refund & Double Deduction';
  }
  return DEFAULT_RECORD_VALUES.subcategory;
}

export function findExactPermittedRemark(input?: string): RemarkOption | '' {
  const cleaned = String(input ?? '').trim().toLowerCase();
  if (!cleaned) return '';
  const hit = PERMITTED_REMARKS.find((r) => r.toLowerCase() === cleaned);
  return hit ?? '';
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesRule(normalizedInput: string, r: ShortcutRule): boolean {
  const trig = r.trigger.trim().toLowerCase();
  if (!trig || !r.enabled) return false;

  if (r.matchType === 'exact') {
    return normalizedInput === trig;
  }

  if (r.matchType === 'regex') {
    try {
      return new RegExp(r.trigger, 'i').test(normalizedInput);
    } catch {
      return false;
    }
  }

  // Word-boundary contains so short triggers like "gen" don't hit "general" awkwardly
  const boundaryPattern = new RegExp(`(?:^|\\b|\\s)${escapeRegExp(trig)}(?:$|\\b|\\s)`, 'i');
  return boundaryPattern.test(normalizedInput) || normalizedInput.includes(trig);
}

export interface ClassificationResult {
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

export function classifyRemarkWithDictionary(
  rawRemark: string,
  rules: ShortcutRule[] = DEFAULT_SHORTCUT_RULES,
  options?: {
    explicitStatus?: CallStatus | null;
    explicitRemark?: RemarkOption | '';
    explicitCategory?: CategoryOption;
    explicitSubcategory?: SubcategoryOption;
    defaultCategory?: CategoryOption;
    defaultSubcategory?: SubcategoryOption;
    alwaysApplyCategorySubcategory?: boolean;
  }
): ClassificationResult {
  const trimmed = String(rawRemark ?? '').trim();
  const normalized = trimmed.toLowerCase().replace(/\s+/g, ' ');
  const fallbackCat = options?.defaultCategory ?? DEFAULT_RECORD_VALUES.category;
  const fallbackSub = options?.defaultSubcategory ?? DEFAULT_RECORD_VALUES.subcategory;
  const forceGlobalCatSub = Boolean(options?.alwaysApplyCategorySubcategory);

  const pickCategory = (ruleCat?: CategoryOption): CategoryOption => {
    if (options?.explicitCategory) return options.explicitCategory;
    if (forceGlobalCatSub) return fallbackCat;
    return ruleCat ?? fallbackCat;
  };

  const pickSubcategory = (ruleSub?: SubcategoryOption): SubcategoryOption => {
    if (options?.explicitSubcategory) return options.explicitSubcategory;
    if (forceGlobalCatSub) return fallbackSub;
    return ruleSub ?? fallbackSub;
  };

  // Detect optional leading status word ("Resolved; Pay Link" or "Unresolved - busy")
  let inlineStatus: CallStatus | null = null;
  let strippedNormalized = normalized;
  const statusPrefix = trimmed.match(/^(resolved|unresolved)\s*[,;:/|-]+\s*(.+)$/i);
  if (statusPrefix) {
    inlineStatus = /^unresolved$/i.test(statusPrefix[1]) ? 'Unresolved' : 'Resolved';
    strippedNormalized = statusPrefix[2].trim().toLowerCase().replace(/\s+/g, ' ');
  }
  const effectiveExplicitStatus = options?.explicitStatus ?? inlineStatus;

  // 1. If user explicitly selected an exact permitted dropdown remark + status
  if (options?.explicitRemark) {
    const exactRem = findExactPermittedRemark(options.explicitRemark);
    if (exactRem) {
      const inferredStatus: CallStatus =
        effectiveExplicitStatus ??
        (exactRem === 'CX NOT RESPONSE THE CALL' ? 'Unresolved' : 'Resolved');
      return {
        status: inferredStatus,
        category: pickCategory(),
        subcategory: pickSubcategory(),
        remark: exactRem,
        needsClarification: false,
        confidenceScore: 100,
        analysisLayer: 'shortcut',
      };
    }
  }

  // 2. Empty remark -> unclear unless explicitly marked Unresolved
  if (!normalized) {
    if (effectiveExplicitStatus === 'Unresolved') {
      return {
        status: 'Unresolved',
        category: pickCategory(),
        subcategory: pickSubcategory(),
        remark: 'CX NOT RESPONSE THE CALL',
        needsClarification: false,
        confidenceScore: 95,
        analysisLayer: 'shortcut',
      };
    }
    return {
      status: null,
      category: pickCategory(),
      subcategory: pickSubcategory(),
      remark: '',
      needsClarification: true,
      confidenceScore: 0,
      reason: 'Remark is empty. Select exact Category, Subcategory, Status, and Remark.',
    };
  }

  // 3. Direct match against one of the 45 exact permitted remarks
  const exactPermitted =
    findExactPermittedRemark(trimmed) ||
    (statusPrefix ? findExactPermittedRemark(statusPrefix[2]) : '');
  if (exactPermitted) {
    const matchingMeta = rules.find(
      (r) => r.enabled && r.remark.toLowerCase() === exactPermitted.toLowerCase()
    );
    const derivedStatus: CallStatus =
      effectiveExplicitStatus ??
      matchingMeta?.status ??
      (exactPermitted === 'CX NOT RESPONSE THE CALL' ||
      exactPermitted === 'cx disconnect the call in conversation'
        ? 'Unresolved'
        : 'Resolved');

    return {
      status: derivedStatus,
      category: pickCategory(matchingMeta?.category),
      subcategory: pickSubcategory(matchingMeta?.subcategory),
      remark: exactPermitted,
      needsClarification: false,
      matchedTrigger: exactPermitted,
      confidenceScore: 100,
      analysisLayer: 'shortcut',
    };
  }

  // 4. Match active Shortcut Rules (custom rules checked first, then longest trigger match)
  const enabledRules = rules.filter((r) => r.enabled);
  const candidateTexts =
    strippedNormalized && strippedNormalized !== normalized
      ? [strippedNormalized, normalized]
      : [normalized];

  for (const candText of candidateTexts) {
    const exactHits = enabledRules.filter(
      (r) => r.trigger.trim().toLowerCase() === candText
    );
    if (exactHits.length > 0) {
      const customFirst = exactHits.find((r) => r.isCustom) ?? exactHits[0];
      return {
        status: effectiveExplicitStatus ?? customFirst.status,
        category: pickCategory(customFirst.category),
        subcategory: pickSubcategory(customFirst.subcategory),
        remark: customFirst.remark,
        needsClarification: false,
        matchedTrigger: customFirst.trigger,
        confidenceScore: 98,
        analysisLayer: 'shortcut',
      };
    }
  }

  // Sort contains/regex candidates: custom rules prioritized, then longer trigger phrase first
  const candidates = enabledRules
    .filter((r) => candidateTexts.some((txt) => matchesRule(txt, r)))
    .sort((a, b) => {
      if (Boolean(a.isCustom) !== Boolean(b.isCustom)) {
        return a.isCustom ? -1 : 1;
      }
      return b.trigger.length - a.trigger.length;
    });

  if (candidates.length > 0) {
    const best = candidates[0];
    return {
      status: effectiveExplicitStatus ?? best.status,
      category: pickCategory(best.category),
      subcategory: pickSubcategory(best.subcategory),
      remark: best.remark,
      needsClarification: false,
      matchedTrigger: best.trigger,
      confidenceScore: 92,
      analysisLayer: 'shortcut',
    };
  }

  // 5. Layer 3 Free On-Device Semantic & Fuzzy NLP Engine across all 45 Master Remarks
  const nlp = analyzeRemarkWithLocalNlp(statusPrefix ? statusPrefix[2] : trimmed);
  if (nlp.confident && nlp.bestMatch) {
    const inferredStatus = effectiveExplicitStatus ?? nlp.bestMatch.status;
    return {
      status: inferredStatus,
      category: pickCategory(nlp.bestMatch.category),
      subcategory: pickSubcategory(nlp.bestMatch.subcategory),
      remark: nlp.bestMatch.remark,
      needsClarification: false,
      confidenceScore: nlp.confidenceScore,
      analysisLayer: 'semantic-nlp',
      aiSuggestions: nlp.suggestions,
    };
  }

  // 6. Explicit Unresolved confirmation without matched remark maps to CX NOT RESPONSE THE CALL
  if (effectiveExplicitStatus === 'Unresolved') {
    return {
      status: 'Unresolved',
      category: pickCategory(),
      subcategory: pickSubcategory(),
      remark: 'CX NOT RESPONSE THE CALL',
      needsClarification: false,
      confidenceScore: 90,
      analysisLayer: 'shortcut',
      aiSuggestions: nlp.suggestions,
    };
  }

  return {
    status: effectiveExplicitStatus ?? null,
    category: pickCategory(),
    subcategory: pickSubcategory(),
    remark: '',
    needsClarification: true,
    confidenceScore: nlp.confidenceScore,
    analysisLayer: 'semantic-nlp',
    aiSuggestions: nlp.suggestions,
    reason:
      nlp.reason ??
      `Remark "${trimmed}" did not match an exact dropdown value or shortcut rule. Select the exact dropdown values for review.`,
  };
}

export function updateShortcutRule(
  rules: ShortcutRule[],
  updated: ShortcutRule
): ShortcutRule[] {
  return rules.map((r) => (r.id === updated.id ? updated : r));
}

export function loadShortcutRules(employeeId: EmployeeId): ShortcutRule[] {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_SHORTCUT_RULES;
  }
  try {
    const raw = localStorage.getItem(`${SHORTCUT_STORAGE_PREFIX}${employeeId}`);
    if (!raw) return DEFAULT_SHORTCUT_RULES;
    const parsed = JSON.parse(raw) as ShortcutRule[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_SHORTCUT_RULES;
    }
    return parsed.map((item) => ({
      ...item,
      category: snapToPermittedCategory(item.category),
      subcategory: snapToPermittedSubcategory(item.subcategory),
      remark: findExactPermittedRemark(item.remark) || 'general query',
    }));
  } catch {
    return DEFAULT_SHORTCUT_RULES;
  }
}

export function saveShortcutRules(employeeId: EmployeeId, rules: ShortcutRule[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${SHORTCUT_STORAGE_PREFIX}${employeeId}`, JSON.stringify(rules));
  } catch (err) {
    console.error('Failed to persist shortcut dictionary:', err);
  }
}

export function resetShortcutRules(employeeId: EmployeeId): ShortcutRule[] {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(`${SHORTCUT_STORAGE_PREFIX}${employeeId}`);
  }
  return DEFAULT_SHORTCUT_RULES;
}

export function loadShortcutHistory(employeeId: EmployeeId): ShortcutHistoryEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${SHORTCUT_HISTORY_PREFIX}${employeeId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ShortcutHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordShortcutHistory(
  employeeId: EmployeeId,
  action: ShortcutHistoryEntry['action'],
  item: Pick<ShortcutRule, 'trigger' | 'status' | 'category' | 'subcategory' | 'remark'>
): ShortcutHistoryEntry[] {
  const entry: ShortcutHistoryEntry = {
    id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    action,
    trigger: item.trigger,
    status: item.status,
    category: item.category,
    subcategory: item.subcategory,
    remark: item.remark,
    createdAt: new Date().toISOString(),
  };
  const next = [entry, ...loadShortcutHistory(employeeId)].slice(0, 100);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(`${SHORTCUT_HISTORY_PREFIX}${employeeId}`, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  }
  return next;
}

export function clearShortcutHistory(employeeId: EmployeeId): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(`${SHORTCUT_HISTORY_PREFIX}${employeeId}`);
}
