/** Firestore document schema for aggregated neighborhood clean-air actions. */
export interface CommunityImpactDoc {
  citySlug: string;
  cityName: string;
  familiesCount: number;
  co2AvoidedKg: number;
  noxAvoidedGrams: number;
  recentActions: string[];
  lastActionBy: string;
  updatedAt?: unknown;
}

/** LocalStorage fallback record for daily community impact in Guest Mode. */
export interface GuestCommunityRecord {
  dateKey: string;
  familiesCount: number;
  co2AvoidedKg: number;
  noxAvoidedGrams: number;
  recentActions: string[];
}

/** Normalized neighborhood impact snapshot rendered by the UI impact strip. */
export interface RecordedCommunityImpact {
  familiesCount: number;
  co2AvoidedKg: number;
  noxAvoidedGrams: number;
  recentActions: string[];
  sourceMode: 'firestore_live' | 'guest_local';
}
