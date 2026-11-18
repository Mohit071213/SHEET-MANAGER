import { EMPLOYEES, EmployeeId, EmployeeName } from '../types/callsheet';

const SESSION_EMPLOYEE_KEY = 'callsheet_active_employee';
const SESSION_UNLOCK_PREFIX = 'callsheet_unlocked_emp_';
const PIN_STORAGE_PREFIX = 'callsheet_emp_pin_v1_';

interface StoredPinRecord {
  salt: string;
  hash: string;
  updatedAt: string;
}

export function isValidEmployeeName(val: string | null): val is EmployeeName {
  return EMPLOYEES.some((e) => e.name === val);
}

export function getActiveEmployeeSession(): EmployeeName | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_EMPLOYEE_KEY);
    return isValidEmployeeName(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function setActiveEmployeeSession(name: EmployeeName): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_EMPLOYEE_KEY, name);
  } catch {
    // ignore storage errors
  }
}

export function clearActiveEmployeeSession(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(SESSION_EMPLOYEE_KEY);
  } catch {
    // ignore
  }
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Deterministic fallback for restricted non-WebCrypto test runtimes
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function hasEmployeePin(employeeId: EmployeeId): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return Boolean(localStorage.getItem(`${PIN_STORAGE_PREFIX}${employeeId}`));
  } catch {
    return false;
  }
}

export function isEmployeeUnlockedInSession(employeeId: EmployeeId): boolean {
  if (!hasEmployeePin(employeeId)) return true;
  if (typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(`${SESSION_UNLOCK_PREFIX}${employeeId}`) === '1';
  } catch {
    return false;
  }
}

export function markEmployeeUnlockedInSession(employeeId: EmployeeId): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(`${SESSION_UNLOCK_PREFIX}${employeeId}`, '1');
  } catch {
    // ignore
  }
}

export function lockEmployeeInSession(employeeId: EmployeeId): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(`${SESSION_UNLOCK_PREFIX}${employeeId}`);
  } catch {
    // ignore
  }
}

export async function setEmployeePin(employeeId: EmployeeId, pin: string): Promise<void> {
  const cleaned = pin.trim();
  if (cleaned.length < 4 || cleaned.length > 16) {
    throw new Error('Workspace PIN must be between 4 and 16 characters.');
  }
  const salt = `${employeeId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const hash = await sha256Hex(`${salt}:${cleaned}`);
  const record: StoredPinRecord = {
    salt,
    hash,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(`${PIN_STORAGE_PREFIX}${employeeId}`, JSON.stringify(record));
  markEmployeeUnlockedInSession(employeeId);
}

export async function verifyEmployeePin(employeeId: EmployeeId, pin: string): Promise<boolean> {
  if (typeof localStorage === 'undefined') return true;
  const raw = localStorage.getItem(`${PIN_STORAGE_PREFIX}${employeeId}`);
  if (!raw) return true;
  try {
    const parsed = JSON.parse(raw) as StoredPinRecord;
    const candidateHash = await sha256Hex(`${parsed.salt}:${pin.trim()}`);
    const valid = candidateHash === parsed.hash;
    if (valid) {
      markEmployeeUnlockedInSession(employeeId);
    }
    return valid;
  } catch {
    return false;
  }
}

export function removeEmployeePin(employeeId: EmployeeId): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(`${PIN_STORAGE_PREFIX}${employeeId}`);
  markEmployeeUnlockedInSession(employeeId);
}
