import { useEffect, useRef, useState } from 'react';
import {
  AuthUserSummary,
  loadFirebaseClient,
  markFirebaseSessionActive,
} from '../firebase';
import { CityLocation, LifestyleProfile } from '../types';
import { sanitizePublicCityLabel } from '../utils/smogLogic';
import { filterCompletedKeysForDate, getLocalDateKey } from '../utils/impactModel';
import { roundCoordinateToCityGrid } from '../utils/weatherService';
import { APP_LIMITS } from '../constants';

interface UseSmogAuthParams {
  city: CityLocation;
  profile: LifestyleProfile;
  completedKeys: string[];
  onHydrateHousehold: (
    loadedProfile?: LifestyleProfile,
    loadedCompletedKeys?: string[]
  ) => void;
}

/**
 * Custom hook managing Firebase Authentication (automatic anonymous visitor auth
 * and optional Google OAuth sign-in/out) plus initial Firestore household hydration.
 */
export function useSmogAuth({
  city,
  profile,
  completedKeys,
  onHydrateHousehold,
}: UseSmogAuthParams) {
  const [user, setUser] = useState<AuthUserSummary | null>(null);
  const [isConnectingAuth, setIsConnectingAuth] = useState(false);
  const [authErrorMsg, setAuthErrorMsg] = useState<string | null>(null);

  // Refs prevent stale closures inside the persistent Firebase Auth observer
  const cityRef = useRef(city);
  const profileRef = useRef(profile);
  const completedKeysRef = useRef(completedKeys);
  const hydrateCallbackRef = useRef(onHydrateHousehold);

  useEffect(() => {
    cityRef.current = city;
    profileRef.current = profile;
    completedKeysRef.current = completedKeys;
    hydrateCallbackRef.current = onHydrateHousehold;
  }, [city, profile, completedKeys, onHydrateHousehold]);

  useEffect(() => {
    let isCancelled = false;
    let unsubscribeAuth: (() => void) | null = null;

    loadFirebaseClient()
      .then((client) => {
        if (isCancelled) return;
        unsubscribeAuth = client.subscribeToAuthState(async (currentUser) => {
          if (isCancelled) return;

          if (!currentUser) {
            try {
              const anon = await client.signInUserAnonymously();
              if (anon && !isCancelled) {
                setUser(anon);
              }
            } catch (anonErr) {
              console.warn('Anonymous sign-in fallback:', anonErr);
            }
            return;
          }

          setUser(currentUser);
          markFirebaseSessionActive(true);

          const householdPath = `households/${currentUser.uid}`;
          const activeCity = cityRef.current;
          const activeProfile = profileRef.current;
          const activeCompleted = filterCompletedKeysForDate(
            completedKeysRef.current,
            getLocalDateKey()
          );

          try {
            const loaded = await client.loadOrInitializeHousehold(
              currentUser.uid,
              {
                userId: currentUser.uid,
                city: sanitizePublicCityLabel(activeCity.name),
                citySlug: activeCity.slug.slice(0, 128),
                latitude: roundCoordinateToCityGrid(activeCity.latitude),
                longitude: roundCoordinateToCityGrid(activeCity.longitude),
                cookingFuel: activeProfile.cookingFuel,
                commute: activeProfile.commute,
                indoorFiltration: activeProfile.indoorFiltration,
                vulnerableMembers: activeProfile.vulnerableMembers,
                completedActionsToday: activeCompleted.slice(
                  0,
                  APP_LIMITS.MAX_DAILY_COMPLETED_ACTIONS
                ),
              }
            );
            if (isCancelled) return;
            hydrateCallbackRef.current(loaded.profile, loaded.completedActionsToday);
          } catch (err) {
            console.warn(`Firestore household sync failed (${householdPath}):`, err);
          }
        });
      })
      .catch((err) => {
        if (!isCancelled) {
          console.warn('Firebase load fallback:', err);
        }
      });

    return () => {
      isCancelled = true;
      unsubscribeAuth?.();
    };
  }, []);

  const handleAuthAction = async () => {
    if (isConnectingAuth) return;
    setAuthErrorMsg(null);
    setIsConnectingAuth(true);

    try {
      const client = await loadFirebaseClient();

      if (user && !user.isAnonymous) {
        await client.signOutUser();
        const anon = await client.signInUserAnonymously();
        setUser(anon);
      } else {
        const signedInUser = await client.signInWithGooglePopup();
        if (signedInUser) {
          markFirebaseSessionActive(true);
          setUser(signedInUser);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('Firebase Auth error:', err);
      if (msg.includes('popup-closed-by-user')) {
        // Voluntarily dismissed
      } else if (msg.includes('unauthorized-domain')) {
        setAuthErrorMsg(
          'Firebase domain unauthorized: "localhost" is not added to Authorized Domains in Firebase Console > Authentication > Settings.'
        );
      } else if (
        msg.includes('redirect_uri_mismatch') ||
        msg.includes('operation-not-allowed')
      ) {
        setAuthErrorMsg(
          'Google Sign-In is not enabled or OAuth redirect URI is mismatched in this Firebase project.'
        );
      } else {
        setAuthErrorMsg(
          `Google Sign-In error: ${msg}. Instant Guest Mode remains active.`
        );
      }
    } finally {
      setIsConnectingAuth(false);
    }
  };

  return {
    user,
    isConnectingAuth,
    authErrorMsg,
    setAuthErrorMsg,
    handleAuthAction,
  };
}
