import { LifestyleProfile } from '../types';

/**
 * Browser storage keys for Guest Mode persistence and session-level AI caching.
 */
export const STORAGE_KEYS = {
  GUEST_PROFILE: 'smogwise_guest_profile_v1',
  GUEST_COMPLETED: 'smogwise_guest_completed_v2',
  GUEST_COMMUNITY: 'smogwise_guest_community_v2',
  GEMINI_SESSION_CACHE_PREFIX: 'smogwise_gemini_v2',
} as const;

/**
 * Default household lifestyle toggles applied on first visit.
 */
export const DEFAULT_LIFESTYLE_PROFILE: LifestyleProfile = {
  cookingFuel: 'gas',
  commute: 'car',
  indoorFiltration: 'has_purifier',
  vulnerableMembers: 'yes',
};

/**
 * Timing and capacity limits for client-side telemetry and impact logging.
 */
export const APP_LIMITS = {
  /** Duration (ms) for celebratory badge state after logging an action. */
  ACTION_CELEBRATION_DURATION_MS: 4000,
  /** Interval (ms) to check whether local clock hour has rolled over. */
  HOUR_REFRESH_INTERVAL_MS: 60_000,
  /** Maximum number of completed action keys retained per calendar day. */
  MAX_DAILY_COMPLETED_ACTIONS: 10,
  /** Maximum recent neighborhood ticker lines stored in Guest Mode. */
  MAX_RECENT_TICKER_ITEMS: 6,
  /** Maximum character length for custom household questions. */
  MAX_CUSTOM_QUESTION_LENGTH: 300,
} as const;
