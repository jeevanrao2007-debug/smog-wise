import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import { APP_LIMITS, STORAGE_KEYS } from '../constants';
import { AuthUserSummary, FirebaseClientModule, loadFirebaseClient } from '../firebase';
import {
  ActionCardData,
  CityLocation,
  CommunityImpactDoc,
  GuestCommunityRecord,
  LifestyleProfile,
  RecordedCommunityImpact,
} from '../types';
import { formatTickerActionLine, sanitizePublicCityLabel } from '../utils/smogLogic';
import {
  filterCompletedKeysForDate,
  getLocalDateKey,
  isActionCompletedToday,
  toDailyActionKey,
} from '../utils/impactModel';
import { roundCoordinateToCityGrid } from '../utils/weatherService';

interface UseCommunityImpactParams {
  user: AuthUserSummary | null;
  city: CityLocation;
  profile: LifestyleProfile;
  completedKeys: string[];
  setCompletedKeys: Dispatch<SetStateAction<string[]>>;
  onAnnouncement: (message: string) => void;
  loadClientFn?: () => Promise<FirebaseClientModule>;
}

/**
 * Custom hook managing the real-time Cloud Firestore neighborhood listener (`onSnapshot`),
 * daily deduplicated habit completion, and localStorage fallback metrics.
 */
export function useCommunityImpact({
  user,
  city,
  profile,
  completedKeys,
  setCompletedKeys,
  onAnnouncement,
  loadClientFn = loadFirebaseClient,
}: UseCommunityImpactParams) {
  const [celebratingId, setCelebratingId] = useState<string | null>(null);
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (celebrationTimerRef.current) {
        clearTimeout(celebrationTimerRef.current);
      }
    };
  }, []);
  const [firestoreCommunityDoc, setFirestoreCommunityDoc] = useState<CommunityImpactDoc | null>(
    null
  );
  const [guestCommunityRecords, setGuestCommunityRecords] = useState<
    Record<string, GuestCommunityRecord>
  >(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.GUEST_COMMUNITY);
      if (saved) return JSON.parse(saved) as Record<string, GuestCommunityRecord>;
    } catch {
      // ignore
    }
    return {};
  });

  useEffect(() => {
    if (!user) {
      return;
    }

    let isCancelled = false;
    let unsubscribeSnapshot: (() => void) | null = null;
    const docPath = `community_impact/${city.slug}`;

    loadClientFn()
      .then((client) => {
        if (isCancelled) return;
        unsubscribeSnapshot = client.subscribeToCommunityImpact(
          city.slug,
          (data) => {
            if (!isCancelled) {
              setFirestoreCommunityDoc(data);
            }
          },
          (error) => {
            if (!isCancelled) {
              console.warn(`Firestore community_impact listener warning (${docPath}):`, error);
              setFirestoreCommunityDoc(null);
            }
          }
        );
      })
      .catch((err) => {
        if (!isCancelled) {
          console.warn('Firestore community_impact listener fallback:', err);
        }
      });

    return () => {
      isCancelled = true;
      unsubscribeSnapshot?.();
    };
  }, [city.slug, user, loadClientFn]);

  const handleCompleteAction = async (card: ActionCardData) => {
    const todayKey = getLocalDateKey();
    if (isActionCompletedToday(completedKeys, card.id, todayKey)) return;

    const actionKey = toDailyActionKey(card.id, todayKey);
    const updatedCompleted = filterCompletedKeysForDate(
      [...completedKeys, actionKey],
      todayKey
    ).slice(0, APP_LIMITS.MAX_DAILY_COMPLETED_ACTIONS);

    setCompletedKeys(updatedCompleted);
    setCelebratingId(card.id);
    onAnnouncement(
      `Clean-air action "${card.title}" marked complete. Modelled household and neighborhood impact logged.`
    );
    if (celebrationTimerRef.current) {
      clearTimeout(celebrationTimerRef.current);
    }
    celebrationTimerRef.current = setTimeout(() => {
      setCelebratingId((prev) => (prev === card.id ? null : prev));
    }, APP_LIMITS.ACTION_CELEBRATION_DURATION_MS);

    try {
      localStorage.setItem(STORAGE_KEYS.GUEST_COMPLETED, JSON.stringify(updatedCompleted));
    } catch {
      // ignore
    }

    const safeCityName = sanitizePublicCityLabel(city.name);
    const newActionLine = formatTickerActionLine(safeCityName, card.tickerSummary);

    if (user) {
      const client = await loadClientFn();

      const householdPath = `households/${user.uid}`;
      try {
        await client.updateHouseholdCompletedActionsDoc(user.uid, {
          userId: user.uid,
          city: safeCityName,
          citySlug: city.slug.slice(0, 128),
          latitude: roundCoordinateToCityGrid(city.latitude),
          longitude: roundCoordinateToCityGrid(city.longitude),
          cookingFuel: profile.cookingFuel,
          commute: profile.commute,
          indoorFiltration: profile.indoorFiltration,
          vulnerableMembers: profile.vulnerableMembers,
          completedActionsToday: updatedCompleted,
        });
      } catch (err) {
        console.warn(`Firestore actions sync failed (${householdPath}):`, err);
      }

      const communityPath = `community_impact/${city.slug}`;
      try {
        await client.recordCommunityActionTransaction({
          citySlug: city.slug,
          cityName: safeCityName,
          userId: user.uid,
          co2AvoidedKg: card.neighborhoodEmissionImpact.co2AvoidedKg,
          noxAvoidedGrams: card.neighborhoodEmissionImpact.noxAvoidedGrams,
          actionLine: newActionLine,
        });
      } catch (err) {
        console.warn(`Firestore community impact transaction failed (${communityPath}):`, err);
      }
    } else {
      setGuestCommunityRecords((prev) => {
        const existing = prev[city.slug];
        const base: GuestCommunityRecord =
          existing && existing.dateKey === todayKey
            ? existing
            : {
                dateKey: todayKey,
                familiesCount: 0,
                co2AvoidedKg: 0,
                noxAvoidedGrams: 0,
                recentActions: [],
              };

        const updated: GuestCommunityRecord = {
          dateKey: todayKey,
          familiesCount: base.familiesCount + 1,
          co2AvoidedKg: Number(
            (base.co2AvoidedKg + card.neighborhoodEmissionImpact.co2AvoidedKg).toFixed(2)
          ),
          noxAvoidedGrams: Number(
            (base.noxAvoidedGrams + card.neighborhoodEmissionImpact.noxAvoidedGrams).toFixed(2)
          ),
          recentActions: [newActionLine, ...base.recentActions].slice(
            0,
            APP_LIMITS.MAX_RECENT_TICKER_ITEMS
          ),
        };
        const nextMap = { ...prev, [city.slug]: updated };
        try {
          localStorage.setItem(STORAGE_KEYS.GUEST_COMMUNITY, JSON.stringify(nextMap));
        } catch {
          // ignore
        }
        return nextMap;
      });
    }
  };

  const recordedCommunityImpact: RecordedCommunityImpact = useMemo(() => {
    if (user && firestoreCommunityDoc && firestoreCommunityDoc.citySlug === city.slug) {
      return {
        familiesCount: firestoreCommunityDoc.familiesCount,
        co2AvoidedKg: firestoreCommunityDoc.co2AvoidedKg,
        noxAvoidedGrams: firestoreCommunityDoc.noxAvoidedGrams,
        recentActions: firestoreCommunityDoc.recentActions || [],
        sourceMode: 'firestore_live',
      };
    }

    const todayKey = getLocalDateKey();
    const guestCityRec = guestCommunityRecords[city.slug];
    if (guestCityRec && guestCityRec.dateKey === todayKey) {
      return {
        familiesCount: guestCityRec.familiesCount,
        co2AvoidedKg: guestCityRec.co2AvoidedKg,
        noxAvoidedGrams: guestCityRec.noxAvoidedGrams,
        recentActions: guestCityRec.recentActions,
        sourceMode: 'guest_local',
      };
    }

    return {
      familiesCount: 0,
      co2AvoidedKg: 0,
      noxAvoidedGrams: 0,
      recentActions: [],
      sourceMode: user ? 'firestore_live' : 'guest_local',
    };
  }, [firestoreCommunityDoc, guestCommunityRecords, city.slug, user]);

  return {
    celebratingId,
    recordedCommunityImpact,
    handleCompleteAction,
  };
}
