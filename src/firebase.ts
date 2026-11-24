export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface AuthProviderSummary {
  providerId?: string | null;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
}

export interface AuthUserSummary {
  uid: string;
  displayName: string | null;
  email: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  tenantId: string | null;
  providerData: AuthProviderSummary[];
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: AuthProviderSummary[];
  };
}

export type FirebaseClientModule = typeof import('./firebaseClient');

export const FIREBASE_SESSION_HINT_KEY = 'smogwise_firebase_session_hint_v1';

let loadedClient: FirebaseClientModule | null = null;
let clientPromise: Promise<FirebaseClientModule> | null = null;

export function hasPersistedFirebaseSession(): boolean {
  try {
    return localStorage.getItem(FIREBASE_SESSION_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function markFirebaseSessionActive(active: boolean): void {
  try {
    if (active) {
      localStorage.setItem(FIREBASE_SESSION_HINT_KEY, '1');
    } else {
      localStorage.removeItem(FIREBASE_SESSION_HINT_KEY);
    }
  } catch {
    // ignore storage quota / privacy mode errors
  }
}

export function isFirebaseClientLoaded(): boolean {
  return loadedClient !== null;
}

/**
 * Lazily loads and initializes the Firebase SDK exactly once.
 * Concurrent callers share the same in-flight promise to eliminate duplicate
 * initialization and race conditions, while Guest Mode avoids downloading
 * Firebase bundles altogether.
 */
export function loadFirebaseClient(): Promise<FirebaseClientModule> {
  if (loadedClient) {
    return Promise.resolve(loadedClient);
  }
  if (!clientPromise) {
    clientPromise = import('./firebaseClient')
      .then((mod) => {
        mod.ensureFirebaseInitialized();
        loadedClient = mod;
        return mod;
      })
      .catch((err) => {
        clientPromise = null;
        throw err;
      });
  }
  return clientPromise;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const currentUser = loadedClient?.getCurrentAuthUser() ?? null;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo: currentUser?.providerData || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
