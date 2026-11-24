import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  doc,
  Firestore,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { AuthUserSummary } from './firebase';
import { CommunityImpactDoc, LifestyleProfile } from './types';
import { validateCommunityImpactPayload } from './utils/apiValidation';
import { validateHouseholdPayload } from './utils/smogLogic';

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let googleProviderInstance: GoogleAuthProvider | null = null;
let didProbeConnection = false;

function toAuthUserSummary(user: User | null): AuthUserSummary | null {
  if (!user) return null;
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    emailVerified: user.emailVerified,
    isAnonymous: user.isAnonymous,
    tenantId: user.tenantId,
    providerData:
      user.providerData?.map((provider) => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoURL: provider.photoURL,
      })) || [],
  };
}

export function ensureFirebaseInitialized(): {
  app: FirebaseApp;
  db: Firestore;
  auth: Auth;
  googleProvider: GoogleAuthProvider;
} {
  if (!appInstance) {
    appInstance = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
  if (!dbInstance) {
    dbInstance =
      firebaseConfig.firestoreDatabaseId &&
      firebaseConfig.firestoreDatabaseId !== '(default)'
        ? getFirestore(appInstance, firebaseConfig.firestoreDatabaseId)
        : getFirestore(appInstance);
  }
  if (!authInstance) {
    authInstance = getAuth(appInstance);
  }
  if (!googleProviderInstance) {
    googleProviderInstance = new GoogleAuthProvider();
  }

  if (!didProbeConnection) {
    didProbeConnection = true;
    void testConnection(dbInstance);
  }

  return {
    app: appInstance,
    db: dbInstance,
    auth: authInstance,
    googleProvider: googleProviderInstance,
  };
}

async function testConnection(db: Firestore): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

export function getCurrentAuthUser(): AuthUserSummary | null {
  const { auth } = ensureFirebaseInitialized();
  return toAuthUserSummary(auth.currentUser);
}

export function subscribeToAuthState(
  callback: (user: AuthUserSummary | null) => void
): () => void {
  const { auth } = ensureFirebaseInitialized();
  return onAuthStateChanged(auth, (user) => {
    callback(toAuthUserSummary(user));
  });
}

export async function signInWithGooglePopup(): Promise<AuthUserSummary | null> {
  const { auth, googleProvider } = ensureFirebaseInitialized();
  const credential = await signInWithPopup(auth, googleProvider);
  return toAuthUserSummary(credential.user);
}

export async function signInUserAnonymously(): Promise<AuthUserSummary | null> {
  const { auth } = ensureFirebaseInitialized();
  if (auth.currentUser) {
    return toAuthUserSummary(auth.currentUser);
  }
  const credential = await signInAnonymously(auth);
  return toAuthUserSummary(credential.user);
}

export async function signOutUser(): Promise<void> {
  const { auth } = ensureFirebaseInitialized();
  await signOut(auth);
}

export interface HouseholdSyncPayload {
  userId: string;
  city: string;
  citySlug: string;
  latitude: number;
  longitude: number;
  cookingFuel: LifestyleProfile['cookingFuel'];
  commute: LifestyleProfile['commute'];
  indoorFiltration: LifestyleProfile['indoorFiltration'];
  vulnerableMembers: LifestyleProfile['vulnerableMembers'];
  completedActionsToday: string[];
}

export async function loadOrInitializeHousehold(
  userId: string,
  initialPayload: HouseholdSyncPayload
): Promise<{
  profile?: LifestyleProfile;
  completedActionsToday?: string[];
}> {
  const { db } = ensureFirebaseInitialized();
  const snap = await getDoc(doc(db, 'households', userId));

  if (snap.exists()) {
    const data = snap.data();
    const result: {
      profile?: LifestyleProfile;
      completedActionsToday?: string[];
    } = {};

    if (
      data.cookingFuel &&
      data.commute &&
      data.indoorFiltration &&
      data.vulnerableMembers
    ) {
      result.profile = {
        cookingFuel: data.cookingFuel,
        commute: data.commute,
        indoorFiltration: data.indoorFiltration,
        vulnerableMembers: data.vulnerableMembers,
      };
    }

    if (Array.isArray(data.completedActionsToday)) {
      result.completedActionsToday = data.completedActionsToday;
    }

    return result;
  }

  if (validateHouseholdPayload(initialPayload)) {
    await setDoc(doc(db, 'households', userId), {
      ...initialPayload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  return {};
}

export async function updateHouseholdProfileDoc(
  userId: string,
  payload: HouseholdSyncPayload
): Promise<void> {
  if (!validateHouseholdPayload(payload)) return;
  const { db } = ensureFirebaseInitialized();
  await updateDoc(doc(db, 'households', userId), {
    city: payload.city,
    citySlug: payload.citySlug,
    latitude: payload.latitude,
    longitude: payload.longitude,
    cookingFuel: payload.cookingFuel,
    commute: payload.commute,
    indoorFiltration: payload.indoorFiltration,
    vulnerableMembers: payload.vulnerableMembers,
    completedActionsToday: payload.completedActionsToday,
    updatedAt: serverTimestamp(),
  });
}

export async function updateHouseholdCompletedActionsDoc(
  userId: string,
  payload: HouseholdSyncPayload
): Promise<void> {
  if (!validateHouseholdPayload(payload)) return;
  const { db } = ensureFirebaseInitialized();
  await updateDoc(doc(db, 'households', userId), {
    completedActionsToday: payload.completedActionsToday,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToCommunityImpact(
  citySlug: string,
  onData: (data: CommunityImpactDoc | null) => void,
  onError: (error: Error) => void
): () => void {
  const { db } = ensureFirebaseInitialized();
  const docRef = doc(db, 'community_impact', citySlug);
  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        onData(snapshot.data() as CommunityImpactDoc);
      } else {
        onData(null);
      }
    },
    (error) => {
      onError(error);
    }
  );
}

export async function recordCommunityActionTransaction(params: {
  citySlug: string;
  cityName: string;
  userId: string;
  co2AvoidedKg: number;
  noxAvoidedGrams: number;
  actionLine: string;
}): Promise<void> {
  const { db } = ensureFirebaseInitialized();
  const slug = params.citySlug.slice(0, 128);
  const communityRef = doc(db, 'community_impact', slug);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(communityRef);
    const existingDoc = snap.exists()
      ? (snap.data() as CommunityImpactDoc)
      : null;

    const nextFamilies = existingDoc ? existingDoc.familiesCount + 1 : 1;
    const nextCo2 = Number(
      ((existingDoc?.co2AvoidedKg ?? 0) + params.co2AvoidedKg).toFixed(2)
    );
    const nextNox = Number(
      ((existingDoc?.noxAvoidedGrams ?? 0) + params.noxAvoidedGrams).toFixed(2)
    );
    const nextRecent = [
      params.actionLine,
      ...(existingDoc?.recentActions || []),
    ].slice(0, 10);

    const candidatePayload: CommunityImpactDoc = {
      citySlug: slug,
      cityName: params.cityName,
      familiesCount: nextFamilies,
      co2AvoidedKg: nextCo2,
      noxAvoidedGrams: nextNox,
      recentActions: nextRecent,
      lastActionBy: params.userId,
    };

    if (
      !validateCommunityImpactPayload(
        candidatePayload,
        slug,
        params.userId,
        existingDoc
      )
    ) {
      return;
    }

    if (existingDoc) {
      transaction.update(communityRef, {
        cityName: candidatePayload.cityName,
        familiesCount: candidatePayload.familiesCount,
        co2AvoidedKg: candidatePayload.co2AvoidedKg,
        noxAvoidedGrams: candidatePayload.noxAvoidedGrams,
        recentActions: candidatePayload.recentActions,
        lastActionBy: candidatePayload.lastActionBy,
        updatedAt: serverTimestamp(),
      });
    } else {
      transaction.set(communityRef, {
        ...candidatePayload,
        updatedAt: serverTimestamp(),
      });
    }
  });
}
