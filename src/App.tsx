/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import {
  AuthUserSummary,
  loadFirebaseClient,
  markFirebaseSessionActive,
} from './firebase';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LiveSmogWindow } from './components/LiveSmogWindow';
import { LifestyleProfileBar } from './components/LifestyleProfileBar';
import { ActionCardsSection } from './components/ActionCardsSection';
import { NeighborhoodImpactStrip } from './components/NeighborhoodImpactStrip';
import {
  ActionCardData,
  CityLocation,
  CommunityImpactDoc,
  HourlyAirPoint,
  LifestyleProfile,
  WeatherDataSource,
} from './types';
import {
  buildSimulatedOrFallbackHourlyPoints,
  calculateSafeVentilationWindow,
  DEFAULT_CITY,
  formatTickerActionLine,
  sanitizePublicCityLabel,
} from './utils/smogLogic';
import {
  filterCompletedKeysForDate,
  getLocalDateKey,
  isActionCompletedToday,
  toDailyActionKey,
} from './utils/impactModel';
import {
  fetchOpenMeteoForecast,
  resolvePrivacySafeLocationFromCoords,
  reverseGeocodeCoarseCoords,
  roundCoordinateToCityGrid,
} from './utils/weatherService';
import { generateClientGeminiRecommendations } from './utils/geminiClient';
import { maskSensitiveErrorDetails } from './utils/apiValidation';

const GUEST_PROFILE_STORAGE_KEY = 'smogwise_guest_profile_v1';
const GUEST_COMPLETED_STORAGE_KEY = 'smogwise_guest_completed_v2';
const GUEST_COMMUNITY_STORAGE_KEY = 'smogwise_guest_community_v2';

const DEFAULT_PROFILE: LifestyleProfile = {
  cookingFuel: 'gas',
  commute: 'car',
  indoorFiltration: 'has_purifier',
  vulnerableMembers: 'yes',
};

function SmogWiseContent() {
  // Firebase Auth state: visitors automatically authenticate anonymously for instant Firestore sync
  const [user, setUser] = useState<AuthUserSummary | null>(null);
  const [isConnectingAuth, setIsConnectingAuth] = useState(false);
  const [authErrorMsg, setAuthErrorMsg] = useState<string | null>(null);

  // Location & Weather state
  const [city, setCity] = useState<CityLocation>(DEFAULT_CITY);
  const [isLocating, setIsLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [rawHourlyPoints, setRawHourlyPoints] = useState<
    Omit<HourlyAirPoint, 'isInSafeWindow'>[]
  >(() => buildSimulatedOrFallbackHourlyPoints(false));
  const [fetchedWeatherSource, setFetchedWeatherSource] = useState<WeatherDataSource>('live');
  const [weatherWarning, setWeatherWarning] = useState<string | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState(true);
  const [screenReaderAnnouncement, setScreenReaderAnnouncement] = useState<string>('');

  // Lifestyle Profile state (Guest localStorage + Firestore sync)
  const [profile, setProfile] = useState<LifestyleProfile>(() => {
    try {
      const saved = localStorage.getItem(GUEST_PROFILE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_PROFILE, ...parsed };
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_PROFILE;
  });
  const [isSyncingFirestore, setIsSyncingFirestore] = useState(false);

  // Daily date-scoped completed action keys (e.g. "2026-11-19:routine")
  const [completedKeys, setCompletedKeys] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(GUEST_COMPLETED_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return filterCompletedKeysForDate(parsed, getLocalDateKey());
        }
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [celebratingId, setCelebratingId] = useState<string | null>(null);

  // AI Recommendations state (Anti-Static: never use static or fallback cards)
  const [actionCards, setActionCards] = useState<ActionCardData[]>([]);
  const [isLoadingCards, setIsLoadingCards] = useState(false);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);
  const [customQuestion, setCustomQuestion] = useState<string>('');
  const customQuestionRef = useRef(customQuestion);
  useEffect(() => {
    customQuestionRef.current = customQuestion;
  }, [customQuestion]);

  // Community Impact state (strictly actual recorded activity — never mixed with synthetic baselines)
  const [firestoreCommunityDoc, setFirestoreCommunityDoc] =
    useState<CommunityImpactDoc | null>(null);
  const [guestCommunityRecords, setGuestCommunityRecords] = useState<
    Record<
      string,
      {
        dateKey: string;
        familiesCount: number;
        co2AvoidedKg: number;
        noxAvoidedGrams: number;
        recentActions: string[];
      }
    >
  >(() => {
    try {
      const saved = localStorage.getItem(GUEST_COMMUNITY_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {};
  });

  // Fresh refs to avoid stale closures in Firebase Auth callback
  const cityRef = useRef(city);
  const profileRef = useRef(profile);
  const completedKeysRef = useRef(completedKeys);
  useEffect(() => {
    cityRef.current = city;
    profileRef.current = profile;
    completedKeysRef.current = completedKeys;
  }, [city, profile, completedKeys]);

  // Current hour with periodic refresh to prevent stale calculations on open tabs
  const [currentHour24, setCurrentHour24] = useState<number>(() => {
    const nowHour = new Date().getHours();
    return Number.isFinite(nowHour) ? nowHour : 10;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const nowHour = new Date().getHours();
      if (Number.isFinite(nowHour)) {
        setCurrentHour24((prev) => (prev !== nowHour ? nowHour : prev));
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  // Safe Ventilation Window calculation strictly derived from live hourly atmospheric points
  const { windowInfo: safeWindow, annotatedPoints: hourlyPoints } = useMemo(
    () => calculateSafeVentilationWindow(rawHourlyPoints, currentHour24),
    [rawHourlyPoints, currentHour24]
  );

  const currentPoint = hourlyPoints[currentHour24] || hourlyPoints[0];
  const currentPm25 = Math.round(currentPoint?.pm25 ?? 0);
  const currentWindKmh = currentPoint?.windSpeedKmh ?? 0;
  const currentTempC = currentPoint?.temperatureC ?? 0;
  const currentUsAqi = Math.round(currentPoint?.usAqi ?? 0);

  // 1. Firebase Auth subscription with seamless anonymous sign-in on load
  useEffect(() => {
    let isCancelled = false;
    let unsubscribeAuth: (() => void) | null = null;

    loadFirebaseClient()
      .then((client) => {
        if (isCancelled) return;
        unsubscribeAuth = client.subscribeToAuthState(async (currentUser) => {
          if (isCancelled) return;

          // If no active user, automatically sign in visitor anonymously
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
                completedActionsToday: activeCompleted.slice(0, 10),
              }
            );
            if (isCancelled) return;
            if (loaded.profile) {
              setProfile(loaded.profile);
            }
            if (loaded.completedActionsToday) {
              setCompletedKeys(
                filterCompletedKeysForDate(
                  loaded.completedActionsToday,
                  getLocalDateKey()
                )
              );
            }
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

  // 2. Fetch live Open-Meteo Air Quality & Weather forecast for selected city (with AbortController)
  const weatherAbortRef = useRef<AbortController | null>(null);

  const fetchCityForecast = useCallback(async (targetCity: CityLocation, forceRefresh = false) => {
    weatherAbortRef.current?.abort();
    const controller = new AbortController();
    weatherAbortRef.current = controller;

    setIsLoadingWeather(true);
    try {
      const result = await fetchOpenMeteoForecast(
        targetCity,
        controller.signal,
        fetch,
        { forceRefresh }
      );
      if (weatherAbortRef.current !== controller) return;
      setRawHourlyPoints(result.points);
      setFetchedWeatherSource(result.source);
      setWeatherWarning(result.warning ?? null);
      setScreenReaderAnnouncement(
        `Updated 24-hour smog forecast for ${targetCity.name}. Outdoor air telemetry loaded.`
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setRawHourlyPoints(buildSimulatedOrFallbackHourlyPoints(false));
      setFetchedWeatherSource('offline_fallback');
      setWeatherWarning(
        'Live Open-Meteo air quality forecast is temporarily unreachable. Showing an illustrative offline winter smog reference curve.'
      );
    } finally {
      if (weatherAbortRef.current === controller) {
        setIsLoadingWeather(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchCityForecast(city);
    return () => {
      weatherAbortRef.current?.abort();
    };
  }, [city, fetchCityForecast]);

  // 3. Privacy-preserving coarse geolocation detection (never leaks exact coordinates to public tickers)
  const detectUserLocation = useCallback((isInitialLoad = false) => {
    if (!('geolocation' in navigator)) {
      if (!isInitialLoad) {
        setLocationNotice('Geolocation not supported by browser — showing New Delhi');
      }
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const resolvedCity = await reverseGeocodeCoarseCoords(
            pos.coords.latitude,
            pos.coords.longitude
          );
          setCity(resolvedCity);
          setLocationNotice(
            resolvedCity.name === 'Local Urban Air Shed'
              ? 'Using coarse ~11 km regional grid (exact GPS never stored)'
              : `Matched location: ${resolvedCity.name}${resolvedCity.country ? ', ' + resolvedCity.country : ''}`
          );
        } catch {
          const privacySafeCity = resolvePrivacySafeLocationFromCoords(
            pos.coords.latitude,
            pos.coords.longitude
          );
          setCity(privacySafeCity);
          setLocationNotice(`Matched nearest air shed: ${privacySafeCity.name}`);
        } finally {
          setIsLocating(false);
        }
      },
      (err) => {
        setCity(DEFAULT_CITY);
        if (err.code === 1) {
          setLocationNotice(
            isInitialLoad
              ? 'Location permission needed to auto-detect — showing New Delhi'
              : 'Location permission denied in browser — showing New Delhi (search your city above)'
          );
        } else if (err.code === 3) {
          setLocationNotice(
            'Location request timed out — showing New Delhi (click Auto-Detect Location to retry or search above)'
          );
        } else {
          setLocationNotice('GPS unavailable — showing New Delhi (search your city above)');
        }
        setIsLocating(false);
      },
      { timeout: 15000, maximumAge: 300000, enableHighAccuracy: false }
    );
  }, []);

  const didAutoLocateRef = useRef(false);
  useEffect(() => {
    if (!didAutoLocateRef.current) {
      didAutoLocateRef.current = true;
      detectUserLocation(true);
    }
  }, [detectUserLocation]);

  // 4. Refresh AI Action Cards whenever city, simulateSevereSmog, or any of the 4 toggles changes
  const recAbortRef = useRef<AbortController | null>(null);

  const fetchRecommendations = useCallback(
    async (options: {
      showSkeleton?: boolean;
      forceRefresh?: boolean;
      customQ?: string;
    } = {}) => {
      const { showSkeleton = false, forceRefresh = false, customQ } = options;
      const q = typeof customQ === 'string' ? customQ : customQuestionRef.current;
      const safeCityLabel = sanitizePublicCityLabel(city.name);

      const sessionCacheKey = `smogwise_gemini_v2:${safeCityLabel.toLowerCase()}:${currentHour24}:${profile.cookingFuel}:${profile.commute}:${profile.indoorFiltration}:${profile.vulnerableMembers}:${(q || '').trim().toLowerCase()}`;

      // Smart Rate-Limit Protection: check client-side sessionStorage cache first unless forceRefresh
      if (!forceRefresh) {
        try {
          const cachedRaw = sessionStorage.getItem(sessionCacheKey);
          if (cachedRaw) {
            const cached = JSON.parse(cachedRaw);
            if (Array.isArray(cached.cards) && cached.cards.length === 3) {
              setActionCards(cached.cards);
              setModelUsed(cached.modelUsed || 'gemini-4-hydrogen');
              setGeneratedAt(cached.generatedAt || new Date().toISOString());
              setRecommendationsError(null);
              setIsLoadingCards(false);
              return;
            }
          }
        } catch {
          // ignore storage error
        }
      }

      if (showSkeleton) {
        setIsLoadingCards(true);
      }
      setRecommendationsError(null);

      if (recAbortRef.current) {
        recAbortRef.current.abort();
      }
      const controller = new AbortController();
      recAbortRef.current = controller;

      try {
        let cardsResult: {
          cards: ActionCardData[];
          modelUsed: string;
          generatedAt: string;
        } | null = null;

        // Try server endpoint first
        try {
          const response = await fetch('/api/recommendations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              city: safeCityLabel,
              currentPm25,
              safeWindow,
              profile,
              forceRefresh,
              customQuestion: q,
            }),
          });

          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const data = await response.json();
            if (response.ok && Array.isArray(data.cards) && data.cards.length === 3) {
              cardsResult = {
                cards: data.cards,
                modelUsed: data.modelUsed || 'gemini-4-hydrogen',
                generatedAt: data.generatedAt || new Date().toISOString(),
              };
            }
          }
        } catch {
          // Server endpoint unreachable; fall through to direct client call
        }

        // Direct client-side Gemini generation for static hosting (e.g. Firebase Hosting)
        if (!cardsResult) {
          cardsResult = await generateClientGeminiRecommendations({
            city: safeCityLabel,
            currentPm25,
            safeWindow,
            profile,
            customQuestion: q,
          });
        }

        if (cardsResult && Array.isArray(cardsResult.cards) && cardsResult.cards.length === 3) {
          setActionCards(cardsResult.cards);
          setModelUsed(cardsResult.modelUsed || 'gemini-4-hydrogen');
          const genAt = cardsResult.generatedAt || new Date().toISOString();
          setGeneratedAt(genAt);
          setRecommendationsError(null);
          setScreenReaderAnnouncement(
            `Generated 3 personalized smog action cards for ${safeCityLabel}.`
          );

          try {
            sessionStorage.setItem(
              sessionCacheKey,
              JSON.stringify({
                cards: cardsResult.cards,
                modelUsed: cardsResult.modelUsed,
                generatedAt: genAt,
              })
            );
          } catch {
            // ignore storage quota error
          }
        } else {
          // Strict Anti-Static rule: never use fallback placeholder cards on error
          setActionCards([]);
          setModelUsed(null);
          setRecommendationsError(
            'Live Gemini recommendations unavailable. Please click Retry below.'
          );
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setActionCards([]);
        setModelUsed(null);
        setRecommendationsError(
          err instanceof Error
            ? `AI Error: ${maskSensitiveErrorDetails(err.message)}. Please click Retry.`
            : 'Unable to reach recommendation service. Please click Retry.'
        );
      } finally {
        if (recAbortRef.current === controller) {
          setIsLoadingCards(false);
        }
      }
    },
    [city.name, currentHour24, currentPm25, safeWindow, profile]
  );

  // Smart Rate-Limit Protection: Debounce lifestyle toggle changes by 800ms
  useEffect(() => {
    if (isLoadingWeather) return;
    const timer = setTimeout(() => {
      fetchRecommendations({
        showSkeleton: true,
        forceRefresh: false,
        customQ: customQuestionRef.current,
      });
    }, 800);

    return () => {
      clearTimeout(timer);
      recAbortRef.current?.abort();
    };
  }, [
    city.name,
    currentPm25,
    safeWindow.windowLabel,
    safeWindow.avgPm25,
    profile.cookingFuel,
    profile.commute,
    profile.indoorFiltration,
    profile.vulnerableMembers,
    fetchRecommendations,
    isLoadingWeather,
  ]);

  const handleSubmitCustomQuestion = useCallback(
    (question: string) => {
      setCustomQuestion(question);
      customQuestionRef.current = question;
      fetchRecommendations({
        showSkeleton: true,
        forceRefresh: true,
        customQ: question,
      });
    },
    [fetchRecommendations]
  );

  // 5. Real-time Firestore listener (`onSnapshot`) for `community_impact/{citySlug}`
  useEffect(() => {
    if (!user) {
      setFirestoreCommunityDoc(null);
      return;
    }

    let isCancelled = false;
    let unsubscribeSnapshot: (() => void) | null = null;
    const docPath = `community_impact/${city.slug}`;

    loadFirebaseClient()
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
  }, [city.slug, user]);

  // Persist lifestyle profile changes to Guest localStorage AND Firestore (if signed in)
  const handleProfileChange = async (updatedProfile: LifestyleProfile) => {
    setProfile(updatedProfile);
    try {
      localStorage.setItem(
        GUEST_PROFILE_STORAGE_KEY,
        JSON.stringify(updatedProfile)
      );
    } catch {
      // ignore
    }

    if (user) {
      setIsSyncingFirestore(true);
      const householdPath = `households/${user.uid}`;
      try {
        const client = await loadFirebaseClient();
        await client.updateHouseholdProfileDoc(user.uid, {
          userId: user.uid,
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
          ).slice(0, 10),
        });
      } catch (err) {
        console.warn(`Firestore profile update failed (${householdPath}):`, err);
      } finally {
        setIsSyncingFirestore(false);
      }
    }
  };

  // Handle "We Did This" Action Button click (atomic Firestore transaction + daily deduplication)
  const handleCompleteAction = async (card: ActionCardData) => {
    const todayKey = getLocalDateKey();
    if (isActionCompletedToday(completedKeys, card.id, todayKey)) return;

    const actionKey = toDailyActionKey(card.id, todayKey);
    const updatedCompleted = filterCompletedKeysForDate(
      [...completedKeys, actionKey],
      todayKey
    ).slice(0, 10);

    setCompletedKeys(updatedCompleted);
    setCelebratingId(card.id);
    setScreenReaderAnnouncement(
      `Clean-air action "${card.title}" marked complete. Modelled household and neighborhood impact logged.`
    );
    setTimeout(() => {
      setCelebratingId((prev) => (prev === card.id ? null : prev));
    }, 4000);

    try {
      localStorage.setItem(
        GUEST_COMPLETED_STORAGE_KEY,
        JSON.stringify(updatedCompleted)
      );
    } catch {
      // ignore
    }

    const safeCityName = sanitizePublicCityLabel(city.name);
    const newActionLine = formatTickerActionLine(safeCityName, card.tickerSummary);

    if (user) {
      const client = await loadFirebaseClient();

      // 1. Update household daily completed actions in Firestore
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

      // 2. Atomically increment community_impact/{citySlug} via Firestore runTransaction
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
      // Instant Guest Mode: update today's local recorded activity without mixing synthetic baselines
      setGuestCommunityRecords((prev) => {
        const existing = prev[city.slug];
        const base =
          existing && existing.dateKey === todayKey
            ? existing
            : {
                dateKey: todayKey,
                familiesCount: 0,
                co2AvoidedKg: 0,
                noxAvoidedGrams: 0,
                recentActions: [],
              };

        const updated = {
          dateKey: todayKey,
          familiesCount: base.familiesCount + 1,
          co2AvoidedKg: Number(
            (
              base.co2AvoidedKg + card.neighborhoodEmissionImpact.co2AvoidedKg
            ).toFixed(2)
          ),
          noxAvoidedGrams: Number(
            (
              base.noxAvoidedGrams +
              card.neighborhoodEmissionImpact.noxAvoidedGrams
            ).toFixed(2)
          ),
          recentActions: [newActionLine, ...base.recentActions].slice(0, 6),
        };
        const nextMap = { ...prev, [city.slug]: updated };
        try {
          localStorage.setItem(
            GUEST_COMMUNITY_STORAGE_KEY,
            JSON.stringify(nextMap)
          );
        } catch {
          // ignore
        }
        return nextMap;
      });
    }
  };

  const recordedCommunityImpact = useMemo(() => {
    if (firestoreCommunityDoc) {
      return {
        familiesCount: firestoreCommunityDoc.familiesCount,
        co2AvoidedKg: firestoreCommunityDoc.co2AvoidedKg,
        noxAvoidedGrams: firestoreCommunityDoc.noxAvoidedGrams,
        recentActions: firestoreCommunityDoc.recentActions || [],
        sourceMode: 'firestore_live' as const,
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
        sourceMode: 'guest_local' as const,
      };
    }

    return {
      familiesCount: 0,
      co2AvoidedKg: 0,
      noxAvoidedGrams: 0,
      recentActions: [],
      sourceMode: user ? ('firestore_live' as const) : ('guest_local' as const),
    };
  }, [firestoreCommunityDoc, guestCommunityRecords, city.slug, user]);

  const handleAuthAction = async () => {
    if (isConnectingAuth) return;
    setAuthErrorMsg(null);
    setIsConnectingAuth(true);

    try {
      const client = await loadFirebaseClient();

      if (user && !user.isAnonymous) {
        await client.signOutUser();
        // Return to anonymous session so live community counter keeps updating
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
      } else if (msg.includes('redirect_uri_mismatch') || msg.includes('operation-not-allowed')) {
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

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* WCAG 2.2 AA Skip Navigation Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-emerald-800 focus:text-white focus:rounded-lg focus:text-xs focus:font-semibold"
      >
        Skip to main content
      </a>

      {/* Screen Reader Live Region for WCAG 2.2 AA dynamic announcements */}
      <div
        id="a11y-live-announcer"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {screenReaderAnnouncement}
      </div>

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
          <a
            href="#ventilation-window"
            className="text-lg font-bold tracking-tight text-emerald-800 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 rounded"
          >
            SmogWise
          </a>

          <nav
            aria-label="Primary sections"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-700"
          >
            <a
              href="#ventilation-window"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 rounded"
            >
              Ventilation Window
            </a>
            <a
              href="#family-profile"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 rounded"
            >
              Family Profile
            </a>
            <a
              href="#action-plan"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 rounded"
            >
              Action Plan
            </a>
            <a
              href="#neighborhood-impact"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 rounded"
            >
              Neighborhood Impact
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleAuthAction}
              disabled={isConnectingAuth}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-65 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              {user && !user.isAnonymous ? (
                <>
                  <LogOut aria-hidden="true" className="w-3.5 h-3.5" />
                  <span>
                    Sign Out ({user.displayName?.split(' ')[0] || 'Family'})
                  </span>
                </>
              ) : (
                <>
                  <LogIn aria-hidden="true" className="w-3.5 h-3.5" />
                  <span>
                    {isConnectingAuth ? 'Connecting...' : 'Sign in with Google'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 focus:outline-none"
      >
        {authErrorMsg && (
          <div
            role="alert"
            className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-900 flex items-center justify-between"
          >
            <span>{authErrorMsg}</span>
            <button
              type="button"
              onClick={() => setAuthErrorMsg(null)}
              className="font-semibold underline ml-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 1. Top Section: Live Smog Window & Safe Ventilation Calculator */}
        <LiveSmogWindow
          city={city}
          onSelectCity={(nextCity) => {
            setCity(nextCity);
            setLocationNotice(null);
          }}
          onDetectLocation={() => detectUserLocation(false)}
          isLocating={isLocating}
          locationNotice={locationNotice}
          hourlyPoints={hourlyPoints}
          safeWindow={safeWindow}
          currentPm25={currentPm25}
          currentWindKmh={currentWindKmh}
          currentTempC={currentTempC}
          currentUsAqi={currentUsAqi}
          isLoadingWeather={isLoadingWeather}
          weatherSource={fetchedWeatherSource}
          weatherWarning={weatherWarning}
          onRetryWeather={() => fetchCityForecast(city, true)}
        />

        {/* 2. Family Lifestyle Profile (4 Quick Toggles + Custom Question) */}
        <LifestyleProfileBar
          profile={profile}
          onChangeProfile={handleProfileChange}
          isSignedIn={Boolean(user)}
          isSyncingFirestore={isSyncingFirestore}
          customQuestion={customQuestion}
          onChangeCustomQuestion={setCustomQuestion}
          onSubmitQuestion={handleSubmitCustomQuestion}
          isGeneratingAi={isLoadingCards}
        />

        {/* 3. Core Section: 3 AI-Generated Action Cards + Direct Impact Explainer */}
        <ActionCardsSection
          city={sanitizePublicCityLabel(city.name)}
          currentPm25={currentPm25}
          profile={profile}
          cards={actionCards}
          isLoading={isLoadingCards}
          modelUsed={modelUsed}
          generatedAt={generatedAt}
          error={recommendationsError}
          customQuestion={customQuestion}
          completedKeys={completedKeys}
          celebratingId={celebratingId}
          onCompleteAction={handleCompleteAction}
          onRefreshRecommendations={() =>
            fetchRecommendations({
              showSkeleton: true,
              forceRefresh: true,
              customQ: customQuestion,
            })
          }
        />

        {/* 4. Bottom Section: Real-Time Neighborhood Impact Strip */}
        <NeighborhoodImpactStrip
          cityName={sanitizePublicCityLabel(city.name)}
          recordedImpact={recordedCommunityImpact}
        />
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white px-4 sm:px-8 py-5 text-xs text-slate-600">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            SmogWise — Urban Winter Smog Navigation &amp; Household Clean Air Routines
          </span>
          <span>
            Forecast via Open-Meteo · Structured Recommendations via Gemini · Impact estimates are modelled, not medical measurements
          </span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SmogWiseContent />
    </ErrorBoundary>
  );
}
