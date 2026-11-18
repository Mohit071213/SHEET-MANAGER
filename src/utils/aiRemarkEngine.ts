import {
  AiRemarkSuggestion,
  CallStatus,
  CategoryOption,
  LocalAiConfig,
  PERMITTED_CATEGORIES,
  PERMITTED_REMARKS,
  PERMITTED_SUBCATEGORIES,
  RemarkOption,
  SubcategoryOption,
} from '../types/callsheet';

const LOCAL_AI_CONFIG_KEY = 'callsheet_local_ai_config_v1';

export function getDefaultLocalAiConfig(): LocalAiConfig {
  return {
    enabled: false,
    endpointUrl: 'http://localhost:11434',
    modelName: 'llama3.2:3b',
  };
}

export function loadLocalAiConfig(): LocalAiConfig {
  const def = getDefaultLocalAiConfig();
  if (typeof localStorage === 'undefined') return def;
  try {
    const raw = localStorage.getItem(LOCAL_AI_CONFIG_KEY);
    if (!raw) return def;
    const parsed = JSON.parse(raw) as Partial<LocalAiConfig>;
    return {
      enabled: Boolean(parsed.enabled),
      endpointUrl: String(parsed.endpointUrl || def.endpointUrl).trim().replace(/\/+$/, ''),
      modelName: String(parsed.modelName || def.modelName).trim(),
    };
  } catch {
    return def;
  }
}

export function saveLocalAiConfig(config: LocalAiConfig): LocalAiConfig {
  const def = getDefaultLocalAiConfig();
  const clean: LocalAiConfig = {
    enabled: Boolean(config.enabled),
    endpointUrl: String(config.endpointUrl || def.endpointUrl).trim().replace(/\/+$/, ''),
    modelName: String(config.modelName || def.modelName).trim() || def.modelName,
  };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(LOCAL_AI_CONFIG_KEY, JSON.stringify(clean));
    } catch {
      // ignore storage errors
    }
  }
  return clean;
}

interface RemarkConceptProfile {
  remark: RemarkOption;
  status: CallStatus;
  category: CategoryOption;
  subcategory: SubcategoryOption;
  strongKeywords: string[];
  contextTokens: string[];
}

const REMARK_PROFILES: RemarkConceptProfile[] = [
  {
    remark: 'CX NOT RESPONSE THE CALL',
    status: 'Unresolved',
    category: 'Query',
    subcategory: 'General information related',
    strongKeywords: [
      'no response',
      'no res',
      'no answer',
      'not available',
      'unavailable',
      'not reachable',
      'switched off',
      'switch off',
      'not connected',
      'not picking',
      'did not pick',
      'call not picked',
      'busy',
      'bzy',
      'bsyy',
      'disconnected',
      'invalid',
      'rnr',
      'ringing',
      'dnd',
      'wrong number',
    ],
    contextTokens: ['busy', 'unavailable', 'answer', 'response', 'resp', 'reach', 'pick', 'ring', 'invalid', 'off', 'disconnect', 'connected'],
  },
  {
    remark: 'cx disconnect the call in conversation',
    status: 'Unresolved',
    category: 'Query',
    subcategory: 'General information related',
    strongKeywords: ['disconnect in conversation', 'cut the call', 'call cut', 'hung up', 'dropped call'],
    contextTokens: ['disconnect', 'conversation', 'talk', 'cut', 'hang', 'hung', 'midway'],
  },
  {
    remark: 'Payment link',
    status: 'Resolved',
    category: 'Request',
    subcategory: 'General information related',
    strongKeywords: ['pay link', 'payment link', 'paymnt link', 'paylnk', 'shared link', 'link sent', 'send link', 'upi link'],
    contextTokens: ['pay', 'payment', 'paymnt', 'link', 'lnk', 'send', 'sent', 'share', 'upi', 'online'],
  },
  {
    remark: 'cx asking repayment date inquiries',
    status: 'Resolved',
    category: 'Query',
    subcategory: 'General information related',
    strongKeywords: ['repayment date', 'due date', 'repayment details', 'when to pay', 'emi date', 'repaymnt'],
    contextTokens: ['repayment', 'repaymnt', 'repay', 'due', 'date', 'schedule', 'when', 'emi', 'paydate'],
  },
  {
    remark: 'CX ASKING OVERDUE AMOUNT INQUIRIES',
    status: 'Resolved',
    category: 'Query',
    subcategory: 'Charges & Tenure',
    strongKeywords: ['overdue amount', 'overdue', 'over due', 'pending amount', 'kitna due', 'total due'],
    contextTokens: ['overdue', 'pending', 'balance', 'due', 'amount', 'amt', 'late', 'penalty'],
  },
  {
    remark: 'Loan rejection reason',
    status: 'Resolved',
    category: 'Query',
    subcategory: 'General information related',
    strongKeywords: ['rejected', 'reject', 'rejection', 'rejeted', 'declined', 'not approved'],
    contextTokens: ['reject', 'rejected', 'rejection', 'decline', 'declined', 'why', 'reason', 'eligibility'],
  },
  {
    remark: 'Loan stage / loan status enquiry',
    status: 'Resolved',
    category: 'Query',
    subcategory: 'General information related',
    strongKeywords: ['loan stage', 'loan status', 'application status', 'disbursement status', 'approval status'],
    contextTokens: ['stage', 'status', 'progress', 'approved', 'disburse', 'disbursal', 'loan'],
  },
  {
    remark: 'general query',
    status: 'Resolved',
    category: 'Query',
    subcategory: 'General information related',
    strongKeywords: ['general query', 'general enquiry', 'general inquiry', 'gen query', 'general info'],
    contextTokens: ['general', 'gen', 'genral', 'enquiry', 'inquiry', 'query', 'info', 'information'],
  },
  {
    remark: 'Transfering',
    status: 'Resolved',
    category: 'Request',
    subcategory: 'General information related',
    strongKeywords: ['transfer', 'transferred', 'transfering', 'transferring', 'concern dept', 'concern department', 'transfr'],
    contextTokens: ['transfer', 'transferred', 'transfr', 'forward', 'department', 'dept', 'team', 'concern'],
  },
  {
    remark: 'other language',
    status: 'Resolved',
    category: 'Request',
    subcategory: 'General information related',
    strongKeywords: [
      'other language',
      'tamil',
      'telugu',
      'kannada',
      'malayalam',
      'marathi',
      'bengali',
      'gujarati',
      'punjabi',
      'odia',
      'language barrier',
    ],
    contextTokens: ['language', 'lang', 'tamil', 'telugu', 'kannada', 'malayalam', 'marathi', 'bengali', 'gujarati', 'hindi', 'speak'],
  },
  {
    remark: 'Change Details',
    status: 'Resolved',
    category: 'Request',
    subcategory: 'General information related',
    strongKeywords: ['bank change', 'change details', 'update mobile', 'update email', 'change account', 'change bank'],
    contextTokens: ['change', 'chnge', 'update', 'modify', 'edit', 'bank', 'email', 'address', 'number'],
  },
  {
    remark: 'bank details',
    status: 'Resolved',
    category: 'Query',
    subcategory: 'General information related',
    strongKeywords: ['bank details', 'ifsc', 'account number', 'neft', 'rtgs', 'imps details'],
    contextTokens: ['bank', 'account', 'acct', 'ifsc', 'details', 'neft', 'branch'],
  },
  {
    remark: 'Bank details occupied',
    status: 'Resolved',
    category: 'Complaint',
    subcategory: 'General information related',
    strongKeywords: ['bank details occupied', 'bank occupied', 'account already linked', 'already registered bank'],
    contextTokens: ['bank', 'occupied', 'already', 'exist', 'linked', 'duplicate'],
  },
  {
    remark: 'Payment updation',
    status: 'Resolved',
    category: 'Request',
    subcategory: 'General information related',
    strongKeywords: ['payment updation', 'update payment', 'utr update'],
    contextTokens: ['payment', 'updation', 'update', 'utr', 'reference', 'txn'],
  },
  {
    remark: 'CX paid but not updated in app',
    status: 'Resolved',
    category: 'Complaint',
    subcategory: 'General information related',
    strongKeywords: ['paid not updated', 'paid but not updated', 'paid bt nt updtd', 'already paid', 'paid in app'],
    contextTokens: ['paid', 'payed', 'updated', 'update', 'app', 'showing', 'reflect'],
  },
  {
    remark: 'Payment status / loan status not updated',
    status: 'Resolved',
    category: 'Complaint',
    subcategory: 'General information related',
    strongKeywords: ['payment status not updated', 'loan status not updated', 'status not updated', 'noc not updated'],
    contextTokens: ['payment', 'loan', 'status', 'updated', 'pending', 'reflecting'],
  },
  {
    remark: 'payment receipts',
    status: 'Resolved',
    category: 'Request',
    subcategory: 'General information related',
    strongKeywords: ['payment receipt', 'payment receipts', 'receipt needed', 'send receipt', 'invoice'],
    contextTokens: ['receipt', 'receipts', 'reciept', 'slip', 'proof', 'payment'],
  },
  {
    remark: 'partial payment query',
    status: 'Resolved',
    category: 'Query',
    subcategory: 'General information related',
    strongKeywords: ['partial payment', 'part payment', 'half payment'],
    contextTokens: ['partial', 'part', 'half', 'installment', 'payment'],
  },
  {
    remark: 'Foreclose & Cooling period',
    status: 'Resolved',
    category: 'Query',
    subcategory: 'Charges & Tenure',
    strongKeywords: ['cooling period', 'foreclose & cooling', 'cooling off'],
    contextTokens: ['cooling', 'cool', 'period', 'foreclose', 'cancel', 'days'],
  },
  {
    remark: 'cx foreclose the loan',
    status: 'Resolved',
    category: 'Request',
    subcategory: 'Charges & Tenure',
    strongKeywords: ['foreclose loan', 'foreclosure', 'close loan', 'preclose', 'full closure', 'foreclos'],
    contextTokens: ['foreclose', 'foreclosure', 'foreclos', 'preclose', 'close', 'closure', 'loan'],
  },
  {
    remark: 'higher limit/ tenure',
    status: 'Resolved',
    category: 'Query',
    subcategory: 'Charges & Tenure',
    strongKeywords: ['higher limit', 'increase limit', 'more tenure', 'tenure increase', 'credit limit', 'tenure'],
    contextTokens: ['limit', 'tenure', 'tenur', 'increase', 'higher', 'enhance', 'months'],
  },
  {
    remark: 'Charges, Rates & FPC related',
    status: 'Resolved',
    category: 'Query',
    subcategory: 'Charges & Tenure',
    strongKeywords: ['charges', 'interest rate', 'roi', 'fpc', 'processing fee', 'late fee', 'gst charges'],
    contextTokens: ['charge', 'charges', 'rate', 'rates', 'interest', 'roi', 'fpc', 'fee', 'penalty'],
  },
  {
    remark: 'APR logic and understanding',
    status: 'Resolved',
    category: 'Query',
    subcategory: 'Charges & Tenure',
    strongKeywords: ['apr', 'annual percentage', 'apr calculation', 'apr logic'],
    contextTokens: ['apr', 'annual', 'percentage', 'calculation', 'logic'],
  },
  {
    remark: 'Waiver request and settlement cases',
    status: 'Resolved',
    category: 'Request',
    subcategory: 'Settlement & Waiver',
    strongKeywords: ['settlement', 'setlement', 'waiver', 'waive off', 'ots', 'one time settlement', 'discount on overdue'],
    contextTokens: ['settlement', 'settle', 'setlement', 'waiver', 'waive', 'discount', 'ots', 'reduce'],
  },
  {
    remark: 'NOC',
    status: 'Resolved',
    category: 'Request',
    subcategory: 'Settlement & Waiver',
    strongKeywords: ['noc', 'no objection', 'closure certificate', 'no dues'],
    contextTokens: ['noc', 'objection', 'certificate', 'dues', 'clearance'],
  },
  {
    remark: 'Extension request for more days',
    status: 'Resolved',
    category: 'Request',
    subcategory: 'Extension Related',
    strongKeywords: ['extension', 'extention', 'extend date', 'more days', 'extra time', 'need time to pay', 'grace period'],
    contextTokens: ['extension', 'extention', 'extend', 'more', 'days', 'time', 'grace', 'postpone'],
  },
  {
    remark: 'Refund for failed payment',
    status: 'Resolved',
    category: 'Complaint',
    subcategory: 'Refund & Double Deduction',
    strongKeywords: ['refund failed', 'failed payment', 'debited failed', 'money deducted not credited'],
    contextTokens: ['refund', 'refnd', 'failed', 'fail', 'debited', 'stuck', 'reverse'],
  },
  {
    remark: 'Refund for Extra Payment',
    status: 'Resolved',
    category: 'Complaint',
    subcategory: 'Refund & Double Deduction',
    strongKeywords: ['extra payment', 'double deduction', 'paid twice', 'excess amount', 'double debit', 'extra amt'],
    contextTokens: ['refund', 'refnd', 'extra', 'excess', 'double', 'twice', 'duplicate', 'overpaid'],
  },
  {
    remark: 'Suit Filed status removal',
    status: 'Resolved',
    category: 'Request',
    subcategory: 'Credit Discrepancy',
    strongKeywords: ['suit filed', 'suit status removal', 'legal suit remove'],
    contextTokens: ['suit', 'filed', 'legal', 'remove', 'removal', 'cibil'],
  },
  {
    remark: 'Post-Written off removal',
    status: 'Resolved',
    category: 'Request',
    subcategory: 'Credit Discrepancy',
    strongKeywords: ['written off', 'write off', 'post written off', 'writeoff'],
    contextTokens: ['written', 'write', 'writeoff', 'off', 'removal', 'remove', 'cibil'],
  },
  {
    remark: 'DPD removal',
    status: 'Resolved',
    category: 'Request',
    subcategory: 'Credit Discrepancy',
    strongKeywords: ['dpd removal', 'dpd remove', 'days past due', 'dpd'],
    contextTokens: ['dpd', 'removal', 'remove', 'cibil', 'bureau'],
  },
  {
    remark: 'Outstanding balance removal',
    status: 'Resolved',
    category: 'Request',
    subcategory: 'Credit Discrepancy',
    strongKeywords: ['outstanding balance removal', 'outstanding removal', 'balance removal'],
    contextTokens: ['outstanding', 'balance', 'removal', 'remove', 'zero', 'cibil'],
  },
  {
    remark: 'Complaint on wrong details update in credit reports',
    status: 'Resolved',
    category: 'Complaint',
    subcategory: 'Credit Discrepancy',
    strongKeywords: ['credit report', 'cibil', 'experian', 'equifax', 'crif', 'wrong details in cibil', 'cibil wrong'],
    contextTokens: ['cibil', 'credit', 'report', 'bureau', 'wrong', 'discrepancy', 'incorrect'],
  },
  {
    remark: 'Incorrect loan details mapped',
    status: 'Resolved',
    category: 'Complaint',
    subcategory: 'Credit Discrepancy',
    strongKeywords: ['incorrect loan', 'wrong loan mapped', 'not my loan', 'unknown loan'],
    contextTokens: ['incorrect', 'wrong', 'mapped', 'mapping', 'loan', 'unknown'],
  },
  {
    remark: 'ivr calls',
    status: 'Resolved',
    category: 'Query',
    subcategory: 'General information related',
    strongKeywords: ['ivr calls', 'ivr call', 'automated call', 'robocall', 'ivr'],
    contextTokens: ['ivr', 'automated', 'recorded', 'calls'],
  },
  {
    remark: 'CX requested to stop IVR calls, is irritated, and will pay by end of day',
    status: 'Resolved',
    category: 'Request',
    subcategory: 'General information related',
    strongKeywords: ['stop ivr', 'stop calling', 'irritated', 'pay by eod', 'end of day', 'pay today'],
    contextTokens: ['stop', 'ivr', 'irritated', 'angry', 'eod', 'today', 'evening', 'calls'],
  },
  {
    remark: 'getting fraud &harassment calls',
    status: 'Resolved',
    category: 'Complaint',
    subcategory: 'General information related',
    strongKeywords: ['fraud call', 'harassment', 'harasment', 'scam call', 'blackmail', 'threatening'],
    contextTokens: ['fraud', 'harassment', 'harasment', 'scam', 'fake', 'abuse', 'threat'],
  },
  {
    remark: 'Coercive methods of collection',
    status: 'Resolved',
    category: 'Complaint',
    subcategory: 'General information related',
    strongKeywords: ['coercive', 'recovery agent', 'field agent', 'misbehave', 'abusive agent'],
    contextTokens: ['coercive', 'collection', 'agent', 'recovery', 'misbehave', 'home', 'visit'],
  },
  {
    remark: 'Soft call related complaints',
    status: 'Resolved',
    category: 'Complaint',
    subcategory: 'General information related',
    strongKeywords: ['soft call', 'reminder call complaint', 'rude caller'],
    contextTokens: ['soft', 'call', 'rude', 'tone', 'complaint'],
  },
  {
    remark: 'CX DELETED THE ACCOUNT',
    status: 'Resolved',
    category: 'Request',
    subcategory: 'General information related',
    strongKeywords: ['deleted account', 'delete account', 'account delete', 'deactivate account'],
    contextTokens: ['delete', 'deleted', 'account', 'deactivate', 'remove'],
  },
  {
    remark: 'E-NACH RELATED',
    status: 'Resolved',
    category: 'Request',
    subcategory: 'General information related',
    strongKeywords: ['e-nach', 'enach', 'nach', 'autopay', 'auto debit', 'mandate'],
    contextTokens: ['enach', 'nach', 'mandate', 'autopay', 'autodebit', 'ecs'],
  },
  {
    remark: 'Request for company location / registration details',
    status: 'Resolved',
    category: 'Query',
    subcategory: 'General information related',
    strongKeywords: ['company location', 'office address', 'company address', 'head office', 'registration details'],
    contextTokens: ['location', 'address', 'office', 'company', 'city', 'headquarter'],
  },
  {
    remark: 'GST & RBI registration details',
    status: 'Resolved',
    category: 'Query',
    subcategory: 'General information related',
    strongKeywords: ['gst', 'rbi', 'nbfc', 'cin', 'license number'],
    contextTokens: ['gst', 'rbi', 'nbfc', 'registration', 'license', 'certificate'],
  },
  {
    remark: 'Cancel request',
    status: 'Resolved',
    category: 'Request',
    subcategory: 'General information related',
    strongKeywords: ['cancel loan', 'cancel request', 'cancellation', 'cancel application'],
    contextTokens: ['cancel', 'cancelled', 'cancellation', 'abort', 'withdraw'],
  },
  {
    remark: 'Application issue',
    status: 'Resolved',
    category: 'Complaint',
    subcategory: 'General information related',
    strongKeywords: ['app issue', 'application issue', 'app crash', 'login issue', 'otp issue', 'technical issue', 'app not working'],
    contextTokens: ['app', 'application', 'crash', 'bug', 'error', 'login', 'otp', 'technical', 'glitch'],
  },
];

function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}

function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 3 || b.length < 3) return a === b ? 1 : 0;
  const maxLen = Math.max(a.length, b.length);
  const dist = damerauLevenshtein(a, b);
  const ratio = 1 - dist / maxLen;
  if (dist <= 1 && maxLen >= 4) return Math.max(ratio, 0.85);
  if (dist <= 2 && maxLen >= 6) return Math.max(ratio, 0.72);
  return ratio >= 0.75 ? ratio : 0;
}

export interface LocalNlpResult {
  bestMatch: AiRemarkSuggestion | null;
  suggestions: AiRemarkSuggestion[];
  confidenceScore: number; // 0-100
  confident: boolean;
  reason?: string;
}

/**
 * Layer 3 Free On-Device Semantic & Fuzzy NLP Classifier:
 * Handles typos, abbreviations, incomplete remarks, and natural language across all 45 approved remarks.
 */
export function analyzeRemarkWithLocalNlp(rawRemark: string): LocalNlpResult {
  const cleaned = String(rawRemark ?? '')
    .toLowerCase()
    .replace(/^(?:resolved|unresolved)\s*[,;:/-]*\s*/i, '')
    .replace(/[^a-z0-9\s/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return {
      bestMatch: null,
      suggestions: [],
      confidenceScore: 0,
      confident: false,
      reason: 'Remark text is empty.',
    };
  }

  const inputTokens = cleaned.split(/[\s/-]+/).filter((t) => t.length >= 2);
  const scored: AiRemarkSuggestion[] = [];

  for (const profile of REMARK_PROFILES) {
    let score = 0;

    // 1. Exact or fuzzy phrase hit against strongKeywords
    for (const phrase of profile.strongKeywords) {
      if (cleaned === phrase) {
        score = Math.max(score, 0.96);
      } else if (cleaned.includes(phrase)) {
        score = Math.max(score, 0.86);
      } else {
        const phraseTokens = phrase.split(/[\s/-]+/).filter(Boolean);
        if (phraseTokens.length >= 2 && inputTokens.length >= 2) {
          let sum = 0;
          for (const pt of phraseTokens) {
            let bestTok = 0;
            for (const it of inputTokens) {
              bestTok = Math.max(bestTok, tokenSimilarity(it, pt));
            }
            sum += bestTok;
          }
          const avg = sum / phraseTokens.length;
          if (avg >= 0.78) {
            score = Math.max(score, avg * 0.88);
          }
        }
      }
    }

    // 2. Context-token semantic overlap (handles typos + incomplete sentences)
    if (inputTokens.length > 0 && profile.contextTokens.length > 0) {
      let matchedWeight = 0;
      for (const it of inputTokens) {
        let bestCtx = 0;
        for (const ct of profile.contextTokens) {
          bestCtx = Math.max(bestCtx, tokenSimilarity(it, ct));
        }
        if (bestCtx >= 0.74) {
          matchedWeight += bestCtx;
        }
      }
      const coverage = matchedWeight / Math.max(1, Math.min(inputTokens.length, 3));
      const tokenScore = Math.min(0.84, coverage * 0.72);
      score = Math.max(score, tokenScore);
    }

    if (score >= 0.35) {
      scored.push({
        status: profile.status,
        category: profile.category,
        subcategory: profile.subcategory,
        remark: profile.remark,
        score: Math.round(score * 100),
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top3 = scored.slice(0, 3);
  const top = top3[0] ?? null;
  const second = top3[1] ?? null;

  if (!top) {
    return {
      bestMatch: null,
      suggestions: [],
      confidenceScore: 0,
      confident: false,
      reason: `Could not match "${rawRemark.trim()}" confidently to one of the 45 approved remarks.`,
    };
  }

  const margin = second ? top.score - second.score : top.score;
  const confident = top.score >= 70 || (top.score >= 58 && margin >= 8);

  return {
    bestMatch: top,
    suggestions: top3,
    confidenceScore: top.score,
    confident,
    reason: confident
      ? undefined
      : `Low confidence (${top.score}%) for "${rawRemark.trim()}". Pick from suggested Master Remarks or select manually.`,
  };
}

/**
 * Strip all mobile numbers and numeric Serial IDs before sending remark text to any AI engine.
 */
export function stripPiiForAi(rawRemark: string): string {
  return String(rawRemark ?? '')
    .replace(/\b(?:\+?91[\s-]?)?\d{6,15}\b/g, '[ID]')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function testOllamaConnection(
  endpointUrl: string,
  modelName: string
): Promise<{ ok: boolean; message: string; availableModels?: string[] }> {
  const cleanUrl = endpointUrl.trim().replace(/\/+$/, '');
  if (!cleanUrl) {
    return { ok: false, message: 'Enter an Ollama endpoint URL (e.g. http://localhost:11434).' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const resp = await fetch(`${cleanUrl}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!resp.ok) {
      return { ok: false, message: `Ollama responded with HTTP ${resp.status}.` };
    }
    const data = (await resp.json()) as { models?: Array<{ name?: string }> };
    const models = (data.models ?? []).map((m) => String(m.name ?? '')).filter(Boolean);
    const hasModel = models.some((m) => m.toLowerCase().startsWith(modelName.toLowerCase()));
    return {
      ok: true,
      availableModels: models,
      message: hasModel
        ? `Connected to Ollama (${modelName} ready).`
        : `Connected to Ollama, but model "${modelName}" was not listed (${models.slice(0, 3).join(', ') || 'none'}).`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Connection failed';
    return {
      ok: false,
      message: `Cannot reach ${cleanUrl} (${msg}). Ensure Ollama is running with OLLAMA_ORIGINS="*". Using On-Device Semantic AI fallback.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Layer 4 Optional Local Ollama batch enhancement for ambiguous remarks ONLY.
 * Never transmits mobile numbers or Serial IDs; constrains output strictly to approved dropdowns.
 */
export async function classifyAmbiguousWithLocalOllama(
  anonymizedRemark: string,
  config: LocalAiConfig
): Promise<AiRemarkSuggestion | null> {
  if (!config.enabled || !anonymizedRemark.trim()) return null;
  const cleanUrl = config.endpointUrl.trim().replace(/\/+$/, '');
  const safeText = stripPiiForAi(anonymizedRemark);
  if (!safeText) return null;

  const prompt = [
    'Classify this anonymized customer call remark into strict JSON with keys: status, category, subcategory, remark.',
    'Allowed status: "Resolved" or "Unresolved".',
    `Allowed category: ${JSON.stringify(PERMITTED_CATEGORIES)}.`,
    `Allowed subcategory: ${JSON.stringify(PERMITTED_SUBCATEGORIES)}.`,
    `Allowed remark (pick EXACT string verbatim): ${JSON.stringify(PERMITTED_REMARKS)}.`,
    `Customer remark: ${JSON.stringify(safeText)}`,
    'Reply ONLY with valid JSON object.',
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(`${cleanUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.modelName,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.1 },
      }),
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { response?: string };
    if (!json.response) return null;
    const parsed = JSON.parse(json.response) as {
      status?: string;
      category?: string;
      subcategory?: string;
      remark?: string;
    };

    const exactRemark = PERMITTED_REMARKS.find(
      (r) => r.toLowerCase() === String(parsed.remark ?? '').trim().toLowerCase()
    );
    const exactCat = PERMITTED_CATEGORIES.find(
      (c) => c.toLowerCase() === String(parsed.category ?? '').trim().toLowerCase()
    );
    const exactSub = PERMITTED_SUBCATEGORIES.find(
      (s) => s.toLowerCase() === String(parsed.subcategory ?? '').trim().toLowerCase()
    );
    const exactStatus: CallStatus | undefined =
      parsed.status === 'Unresolved'
        ? 'Unresolved'
        : parsed.status === 'Resolved'
          ? 'Resolved'
          : undefined;

    if (!exactRemark || !exactCat || !exactSub || !exactStatus) {
      return null;
    }

    return {
      status: exactStatus,
      category: exactCat,
      subcategory: exactSub,
      remark: exactRemark,
      score: 88,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
