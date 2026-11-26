import { RefObject, useCallback, useState } from 'react';
import {
  APP_LIMITS,
  DEFAULT_LIFESTYLE_PROFILE,
  STORAGE_KEYS,
} from '../constants';
import { AuthUserSummary, loadFirebaseClient } from '../firebase';
import { CityLocation, LifestyleProfile } from '../types';
import { sanitizePublicCityLabel } from '../utils/smogLogic';
import { filterCompletedKeysForDate, getLocalDateKey } from '../utils/impactModel';
import { roundCoordinateToCityGrid } from '../utils/weatherService';

/**
 * Custom hook managing the 4-toggle household lifestyle profile and daily completed
 * action keys across localStorage (Guest Mode) and Cloud Firestore.
 */
export function useLifestyleProfile(
  userRef: RefObject<AuthUserSummary | null>,
  city: CityLocation
) {
  const [profile, setProfile] = useState<LifestyleProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.GUEST_PROFILE);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<LifestyleProfile>;
        return { ...DEFAULT_LIFESTYLE_PROFILE, ...parsed };
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_LIFESTYLE_PROFILE;
  });

  const [completedKeys, setCompletedKeys] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.GUEST_COMPLETED);
      if (saved) {
        const parsed = JSON.parse(saved) as unknown;
        if (Array.isArray(parsed)) {
          return filterCompletedKeysForDate(
            parsed as string[],
            getLocalDateKey()
          );
        }
      }
    } catch {
      // ignore
    }
    return [];
  });

  const [isSyncingFirestore, setIsSyncingFirestore] = useState(false);

  const hydrateFromFirestore = useCallback(
    (loadedProfile?: LifestyleProfile, loadedCompletedKeys?: string[]) => {
      if (loadedProfile) {
        setProfile(loadedProfile);
      }
      if (loadedCompletedKeys) {
        setCompletedKeys(
          filterCompletedKeysForDate(loadedCompletedKeys, getLocalDateKey())
        );
      }
    },
    []
  );

  const handleProfileChange = async (updatedProfile: LifestyleProfile) => {
    setProfile(updatedProfile);
    try {
      localStorage.setItem(
        STORAGE_KEYS.GUEST_PROFILE,
        JSON.stringify(updatedProfile)
      );
    } catch {
      // ignore
    }

    const activeUser = userRef.current;
    if (activeUser) {
      setIsSyncingFirestore(true);
      const householdPath = `households/${activeUser.uid}`;
      try {
        const client = await loadFirebaseClient();
        await client.updateHouseholdProfileDoc(activeUser.uid, {
          userId: activeUser.uid,
          city: sanitizePublicCityLabel(city.name),
          citySlug: city.slug.slice(0, 128),
          latitude: roundCoordinateToCityGrid(city.latitude),
          longitude: roundCoordinateToCityGrid(city.longitude),
          cookingFuel: updatedProfile.cookingFuel,
          commute: updatedProfile.commute,
          indoorFiltration: updatedProfile.indoorFiltration,
          vulnerableMembers: updatedProfile.vulnerableMembers,
          completedActionsToday: filterCompletedKeysForDate(
            completedKeys,
            getLocalDateKey()
          ).slice(0, APP_LIMITS.MAX_DAILY_COMPLETED_ACTIONS),
        });
      } catch (err) {
        console.warn(`Firestore profile update failed (${householdPath}):`, err);
      } finally {
        setIsSyncingFirestore(false);
      }
    }
  };

  return {
    profile,
    completedKeys,
    setCompletedKeys,
    isSyncingFirestore,
    hydrateFromFirestore,
    handleProfileChange,
  };
}
