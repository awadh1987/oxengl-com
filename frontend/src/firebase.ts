import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc as firestoreSetDoc,
  getDoc as firestoreGetDoc,
  getDocs as firestoreGetDocs,
  onSnapshot,
  updateDoc as firestoreUpdateDoc,
  deleteDoc as firestoreDeleteDoc,
  query,
  orderBy,
  limit,
  writeBatch,
  disableNetwork,
  setLogLevel,
  DocumentReference,
  SetOptions,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Auth instance & Google Provider
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Firestore with custom database ID
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');

// ============================================================================
// Firestore Quota Exhaustion Circuit Breaker & Write Throttler
// Prevents exceeding Firebase free-tier daily write limits and gracefully
// suppresses retry loops when `FirebaseError: [code=resource-exhausted]` occurs.
// ============================================================================
const QUOTA_EXHAUSTED_STORAGE_KEY = 'oxengl_firestore_quota_exhausted_until';
const LAST_PAYLOAD_STORAGE_PREFIX = 'oxengl_fs_hash_';
const QUOTA_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes cooldown on quota exhaustion
const MIN_WRITE_INTERVAL_MS = 10_000; // Minimum 10s interval between writes to the same doc path

let quotaExhaustedInMemoryUntil = 0;
let quotaWarningLogged = false;
const lastWriteTimeByPath = new Map<string, number>();
const lastPayloadHashByPath = new Map<string, string>();
const pendingDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function isFirestoreQuotaExhausted(): boolean {
  const now = Date.now();
  if (quotaExhaustedInMemoryUntil > now) {
    return true;
  }
  try {
    const stored = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(QUOTA_EXHAUSTED_STORAGE_KEY) : null;
    if (stored) {
      const until = Number(stored);
      if (Number.isFinite(until) && until > now) {
        quotaExhaustedInMemoryUntil = until;
        return true;
      }
      sessionStorage.removeItem(QUOTA_EXHAUSTED_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors
  }
  return false;
}

export function isResourceExhaustedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; name?: string };
  const code = String(err.code || '').toLowerCase();
  const msg = String(err.message || '').toLowerCase();
  return (
    code.includes('resource-exhausted') ||
    msg.includes('resource-exhausted') ||
    msg.includes('quota exceeded')
  );
}

export function handleFirestoreQuotaError(error: unknown, contextLabel = 'Firestore operation'): boolean {
  if (!isResourceExhaustedError(error)) {
    return false;
  }
  const cooldownUntil = Date.now() + QUOTA_COOLDOWN_MS;
  quotaExhaustedInMemoryUntil = cooldownUntil;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(QUOTA_EXHAUSTED_STORAGE_KEY, String(cooldownUntil));
    }
  } catch {
    // Ignore storage errors
  }

  // Silence Firestore internal WebChannel retry spam and pause network retries
  try {
    setLogLevel('silent');
    disableNetwork(db).catch(() => {});
  } catch {
    // Ignore SDK state errors
  }

  if (!quotaWarningLogged) {
    quotaWarningLogged = true;
    console.warn(
      `[OxenGL Firebase] Quota limit reached during ${contextLabel} (resource-exhausted). ` +
        `Firestore background writes are paused for 15 minutes; primary PostgreSQL API persistence remains active.`
    );
  }
  return true;
}

// If quota was already marked exhausted in this session, silence background retry logs immediately
if (isFirestoreQuotaExhausted()) {
  try {
    setLogLevel('silent');
    disableNetwork(db).catch(() => {});
  } catch {
    // Ignore
  }
}

function computeStableHash(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch {
    return String(Date.now());
  }
}

/**
 * Quota-safe, deduplicated, and throttled wrapper around Firestore `setDoc`.
 * Skips redundant writes when payload hasn't changed and trips the circuit breaker
 * cleanly if `FirebaseError: [code=resource-exhausted]` occurs.
 */
export async function setDoc<T>(
  reference: DocumentReference<T>,
  data: unknown,
  options?: SetOptions
): Promise<void> {
  if (isFirestoreQuotaExhausted()) {
    return;
  }

  const docPath = reference?.path || 'unknown_path';
  const payloadHash = computeStableHash(data);

  // 1. Deduplicate identical payloads across memory & localStorage
  const memHash = lastPayloadHashByPath.get(docPath);
  if (memHash === payloadHash) {
    return;
  }
  try {
    const storedHash =
      typeof localStorage !== 'undefined' ? localStorage.getItem(`${LAST_PAYLOAD_STORAGE_PREFIX}${docPath}`) : null;
    if (storedHash === payloadHash) {
      lastPayloadHashByPath.set(docPath, payloadHash);
      return;
    }
  } catch {
    // Ignore localStorage errors
  }

  // 2. Throttle high-frequency writes to the same document path
  const now = Date.now();
  const lastWrite = lastWriteTimeByPath.get(docPath) || 0;
  const elapsed = now - lastWrite;

  const executeWrite = async () => {
    if (isFirestoreQuotaExhausted()) return;
    lastWriteTimeByPath.set(docPath, Date.now());
    lastPayloadHashByPath.set(docPath, payloadHash);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`${LAST_PAYLOAD_STORAGE_PREFIX}${docPath}`, payloadHash);
      }
    } catch {
      // Ignore storage quota
    }

    try {
      if (options) {
        await firestoreSetDoc(reference, data as any, options);
      } else {
        await firestoreSetDoc(reference, data as any);
      }
    } catch (error) {
      if (!handleFirestoreQuotaError(error, `setDoc(${docPath})`)) {
        console.warn(`[OxenGL Firebase] Non-fatal setDoc warning on ${docPath}:`, error);
      }
    }
  };

  if (elapsed < MIN_WRITE_INTERVAL_MS) {
    const existingTimer = pendingDebounceTimers.get(docPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    return new Promise<void>((resolve) => {
      const timer = setTimeout(async () => {
        pendingDebounceTimers.delete(docPath);
        await executeWrite();
        resolve();
      }, MIN_WRITE_INTERVAL_MS - elapsed);
      pendingDebounceTimers.set(docPath, timer);
    });
  }

  await executeWrite();
}

export const getDoc: typeof firestoreGetDoc = (async (reference: any) => {
  try {
    return await firestoreGetDoc(reference);
  } catch (error) {
    handleFirestoreQuotaError(error, `getDoc(${reference?.path || ''})`);
    throw error;
  }
}) as typeof firestoreGetDoc;

export const getDocs: typeof firestoreGetDocs = (async (q: any) => {
  try {
    return await firestoreGetDocs(q);
  } catch (error) {
    handleFirestoreQuotaError(error, 'getDocs');
    throw error;
  }
}) as typeof firestoreGetDocs;

export const updateDoc: typeof firestoreUpdateDoc = (async (reference: any, ...args: any[]) => {
  if (isFirestoreQuotaExhausted()) return;
  try {
    return await (firestoreUpdateDoc as any)(reference, ...args);
  } catch (error) {
    if (!handleFirestoreQuotaError(error, `updateDoc(${reference?.path || ''})`)) {
      throw error;
    }
  }
}) as typeof firestoreUpdateDoc;

export const deleteDoc: typeof firestoreDeleteDoc = (async (reference: any) => {
  if (isFirestoreQuotaExhausted()) return;
  try {
    return await firestoreDeleteDoc(reference);
  } catch (error) {
    if (!handleFirestoreQuotaError(error, `deleteDoc(${reference?.path || ''})`)) {
      throw error;
    }
  }
}) as typeof firestoreDeleteDoc;

// Helper Google Sign-In
export async function signInWithGoogle(): Promise<{ user: FirebaseUser; isNewUser?: boolean }> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return { user: result.user };
  } catch (error: any) {
    console.error('Google Sign-In Error:', error);
    throw error;
  }
}

// Helper Sign-Out
export async function signOutFirebase(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Firebase Sign-Out Error:', error);
  }
}

// Export Firestore utilities
export {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit,
  writeBatch,
  onAuthStateChanged,
};
export type { FirebaseUser };
