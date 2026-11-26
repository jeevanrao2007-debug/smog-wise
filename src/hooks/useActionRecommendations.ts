import { useCallback, useEffect, useRef, useState } from 'react';
import {
  APP_LIMITS,
  GEMINI_CANDIDATE_MODELS,
  RECOMMENDATION_DEBOUNCE_MS,
  STORAGE_KEYS,
} from '../constants';
import {
  ActionCardData,
  LifestyleProfile,
  RecommendationsResult,
  SafeVentilationWindow,
} from '../types';
import { sanitizePublicCityLabel } from '../utils/smogLogic';
import { generateClientGeminiRecommendations } from '../utils/geminiClient';
import { maskSensitiveErrorDetails, sanitizePlainText } from '../utils/apiValidation';

interface UseActionRecommendationsParams {
  cityName: string;
  currentHour24: number;
  currentPm25: number;
  safeWindow: SafeVentilationWindow;
  profile: LifestyleProfile;
  isLoadingWeather: boolean;
  onAnnouncement: (message: string) => void;
}

/**
 * Custom hook managing debounced Gemini live action recommendations, server-first
 * fallback to client-side Gemini 3-model chain, and sessionStorage rate-limit caching.
 */
export function useActionRecommendations({
  cityName,
  currentHour24,
  currentPm25,
  safeWindow,
  profile,
  isLoadingWeather,
  onAnnouncement,
}: UseActionRecommendationsParams) {
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

  const recAbortRef = useRef<AbortController | null>(null);
  const defaultModelName = GEMINI_CANDIDATE_MODELS[0].name;

  const fetchRecommendations = useCallback(
    async (
      options: {
        showSkeleton?: boolean;
        forceRefresh?: boolean;
        customQ?: string;
      } = {}
    ) => {
      const { showSkeleton = false, forceRefresh = false, customQ } = options;
      const rawQ = typeof customQ === 'string' ? customQ : customQuestionRef.current;
      const q = sanitizePlainText(rawQ, APP_LIMITS.MAX_CUSTOM_QUESTION_LENGTH);
      const safeCityLabel = sanitizePublicCityLabel(cityName);

      const sessionCacheKey = `${STORAGE_KEYS.GEMINI_SESSION_CACHE_PREFIX}:${safeCityLabel.toLowerCase()}:${currentHour24}:${profile.cookingFuel}:${profile.commute}:${profile.indoorFiltration}:${profile.vulnerableMembers}:${(q || '').trim().toLowerCase()}`;

      if (!forceRefresh) {
        try {
          const cachedRaw = sessionStorage.getItem(sessionCacheKey);
          if (cachedRaw) {
            const cached = JSON.parse(cachedRaw) as Partial<RecommendationsResult>;
            if (Array.isArray(cached.cards) && cached.cards.length === 3) {
              setActionCards(cached.cards);
              setModelUsed(cached.modelUsed || defaultModelName);
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
        let cardsResult: RecommendationsResult | null = null;

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
            const data = (await response.json()) as Partial<RecommendationsResult>;
            if (response.ok && Array.isArray(data.cards) && data.cards.length === 3) {
              cardsResult = {
                cards: data.cards,
                modelUsed: data.modelUsed || defaultModelName,
                generatedAt: data.generatedAt || new Date().toISOString(),
              };
            }
          }
        } catch {
          // Server endpoint unreachable; fall through to direct client call
        }

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
          setModelUsed(cardsResult.modelUsed || defaultModelName);
          const genAt = cardsResult.generatedAt || new Date().toISOString();
          setGeneratedAt(genAt);
          setRecommendationsError(null);
          onAnnouncement(`Generated 3 personalized smog action cards for ${safeCityLabel}.`);

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
    [cityName, currentHour24, currentPm25, safeWindow, profile, defaultModelName, onAnnouncement]
  );

  useEffect(() => {
    if (isLoadingWeather) return;
    const timer = setTimeout(() => {
      fetchRecommendations({
        showSkeleton: true,
        forceRefresh: false,
        customQ: customQuestionRef.current,
      });
    }, RECOMMENDATION_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      recAbortRef.current?.abort();
    };
  }, [
    cityName,
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

  return {
    actionCards,
    isLoadingCards,
    modelUsed,
    generatedAt,
    recommendationsError,
    customQuestion,
    setCustomQuestion,
    fetchRecommendations,
    handleSubmitCustomQuestion,
  };
}
