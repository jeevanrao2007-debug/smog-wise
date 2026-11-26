import {
  ActionCardData,
  CommuteMode,
  CommunityImpactDoc,
  CookingFuel,
  IndoorFiltration,
  LifestyleProfile,
  SafeVentilationWindow,
  VulnerableMembers,
} from '../types';
import {
  calculateHouseholdExposureImpact,
  calculateNeighborhoodEmissionImpact,
  createImpactMethodology,
  IMPACT_CONSTANTS,
} from './impactModel';
import { buildTailoredActionCards, sanitizePublicCityLabel } from './smogLogic';

const VALID_COOKING: CookingFuel[] = ['gas', 'induction'];
const VALID_COMMUTE: CommuteMode[] = ['car', 'two_wheeler', 'public_transit', 'wfh'];
const VALID_FILTRATION: IndoorFiltration[] = ['has_purifier', 'no_purifier'];
const VALID_VULNERABLE: VulnerableMembers[] = ['yes', 'no'];
const ID_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Strips control characters, newlines, zero-width spaces, bidi overrides,
 * prompt-delimiter tokens, and dangerous characters from user-supplied strings
 * before interpolating into LLM prompts or storing in state.
 */
export function sanitizePlainText(input: unknown, maxLength = 100): string {
  if (typeof input !== 'string') return '';
  return (
    input
      // Strip zero-width & invisible format characters (CVE-2021-42574 trojan source / prompt hiding)
      .replace(/[\u200B-\u200D\uFEFF\u00AD\u202A-\u202E\u2066-\u2069]/g, '')
      // Strip control characters, backticks, brackets, braces, angle brackets, backslashes, quotes
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001F\u007F`{}[\]<>\\]/g, ' ')
      // Defang common prompt injection delimiters / special LLM tokens
      .replace(/<\|im_start\|>|<\|im_end\|>|<\|endoftext\|>/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength)
  );
}

/**
 * Scrubs any sensitive credentials, Google Cloud API keys, or bearer tokens
 * from error messages or logs so they are never exposed in UI alerts or telemetry.
 */
export function maskSensitiveErrorDetails(error: unknown): string {
  if (!error) return 'An unexpected error occurred.';
  const raw = error instanceof Error ? error.message : String(error);

  return (
    raw
      // Mask Google Cloud / Gemini API keys
      .replace(new RegExp(['AI', 'za[0-9A-Za-z_-]{35}'].join(''), 'g'), '[REDACTED_API_KEY]')
      .replace(new RegExp(['AI', 'zaSy[0-9A-Za-z_-]{33}'].join(''), 'g'), '[REDACTED_API_KEY]')
      // Mask key= query parameter values
      .replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED_API_KEY]')
      // Mask Authorization Bearer tokens
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED_TOKEN]')
      // Mask generic API secret headers
      .replace(/(api[_-]?key["':\s]+)[A-Za-z0-9_-]{16,}/gi, '$1[REDACTED_KEY]')
  );
}

export interface ValidatedRecommendationRequest {
  city: string;
  currentPm25: number;
  safeWindow: SafeVentilationWindow;
  profile: LifestyleProfile;
  forceRefresh: boolean;
  customQuestion?: string;
}

/**
 * Strictly validates and sanitizes the incoming POST /api/recommendations body.
 * Returns null if any required field is missing, out of bounds, or has an invalid enum.
 */
export function validateRecommendationRequest(
  body: unknown
): ValidatedRecommendationRequest | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;

  const rawCity = sanitizePlainText(raw.city, 100);
  if (!rawCity || rawCity.length < 1) return null;
  const city = sanitizePublicCityLabel(rawCity);

  if (
    typeof raw.currentPm25 !== 'number' ||
    !Number.isFinite(raw.currentPm25) ||
    raw.currentPm25 < 0 ||
    raw.currentPm25 > 2000
  ) {
    return null;
  }
  const currentPm25 = Math.round(raw.currentPm25);

  if (!raw.profile || typeof raw.profile !== 'object') return null;
  const rawProfile = raw.profile as Record<string, unknown>;
  if (
    !VALID_COOKING.includes(rawProfile.cookingFuel as CookingFuel) ||
    !VALID_COMMUTE.includes(rawProfile.commute as CommuteMode) ||
    !VALID_FILTRATION.includes(rawProfile.indoorFiltration as IndoorFiltration) ||
    !VALID_VULNERABLE.includes(rawProfile.vulnerableMembers as VulnerableMembers)
  ) {
    return null;
  }

  const profile: LifestyleProfile = {
    cookingFuel: rawProfile.cookingFuel as CookingFuel,
    commute: rawProfile.commute as CommuteMode,
    indoorFiltration: rawProfile.indoorFiltration as IndoorFiltration,
    vulnerableMembers: rawProfile.vulnerableMembers as VulnerableMembers,
  };

  if (!raw.safeWindow || typeof raw.safeWindow !== 'object') return null;
  const rawWin = raw.safeWindow as Record<string, unknown>;

  const windowLabel = sanitizePlainText(rawWin.windowLabel, 60);
  const worstHourLabel = sanitizePlainText(rawWin.worstHourLabel, 40);
  const statusHeadline = sanitizePlainText(rawWin.statusHeadline, 80);

  if (
    !windowLabel ||
    !worstHourLabel ||
    !statusHeadline ||
    typeof rawWin.avgPm25 !== 'number' ||
    !Number.isFinite(rawWin.avgPm25) ||
    rawWin.avgPm25 < 0 ||
    rawWin.avgPm25 > 2000 ||
    typeof rawWin.avgWindSpeedKmh !== 'number' ||
    !Number.isFinite(rawWin.avgWindSpeedKmh) ||
    rawWin.avgWindSpeedKmh < 0 ||
    rawWin.avgWindSpeedKmh > 300 ||
    typeof rawWin.worstPm25 !== 'number' ||
    !Number.isFinite(rawWin.worstPm25) ||
    rawWin.worstPm25 < 0 ||
    rawWin.worstPm25 > 2000
  ) {
    return null;
  }

  const safeWindow: SafeVentilationWindow = {
    startHour:
      typeof rawWin.startHour === 'number' && rawWin.startHour >= 0 && rawWin.startHour <= 23
        ? Math.trunc(rawWin.startHour)
        : 14,
    endHour:
      typeof rawWin.endHour === 'number' && rawWin.endHour >= 1 && rawWin.endHour <= 24
        ? Math.trunc(rawWin.endHour)
        : 16,
    windowLabel,
    startTimeLabel: sanitizePlainText(rawWin.startTimeLabel, 30) || '2:00 PM',
    avgPm25: Math.round(rawWin.avgPm25),
    avgWindSpeedKmh: Math.round(rawWin.avgWindSpeedKmh * 10) / 10,
    worstHourLabel,
    worstPm25: Math.round(rawWin.worstPm25),
    worstWindSpeedKmh:
      typeof rawWin.worstWindSpeedKmh === 'number' && Number.isFinite(rawWin.worstWindSpeedKmh)
        ? Math.round(rawWin.worstWindSpeedKmh * 10) / 10
        : 3.0,
    pm25ReductionPctVsPeak:
      typeof rawWin.pm25ReductionPctVsPeak === 'number' &&
      Number.isFinite(rawWin.pm25ReductionPctVsPeak)
        ? Math.max(0, Math.min(100, Math.round(rawWin.pm25ReductionPctVsPeak)))
        : 50,
    statusType:
      rawWin.statusType === 'open_now' ||
      rawWin.statusType === 'wait_until' ||
      rawWin.statusType === 'keep_sealed'
        ? rawWin.statusType
        : 'wait_until',
    statusHeadline,
    statusSubtext: sanitizePlainText(rawWin.statusSubtext, 240) || statusHeadline,
  };

  const rawCustom = raw.customQuestion;
  const customQuestion =
    typeof rawCustom === 'string' && rawCustom.trim().length > 0
      ? sanitizePlainText(rawCustom, 300)
      : undefined;

  return {
    city,
    currentPm25,
    safeWindow,
    profile,
    forceRefresh: raw.forceRefresh === true,
    customQuestion,
  };
}

const EXPECTED_CARD_SPECS: Array<{
  id: ActionCardData['id'];
  categoryLabel: ActionCardData['categoryLabel'];
  exposureWeight: number;
}> = [
  {
    id: 'routine',
    categoryLabel: 'Low-Emission Daily Routine',
    exposureWeight: 0.65,
  },
  {
    id: 'indoor_hack',
    categoryLabel: 'Indoor Air Quality Hack',
    exposureWeight: 0.75,
  },
  {
    id: 'sustainable_swap',
    categoryLabel: 'Sustainable Alternative',
    exposureWeight: 0.5,
  },
];

/**
 * Validates and normalizes untrusted AI JSON output against the strict 3-card contract.
 * Re-computes cigarette equivalence and emission summaries via `impactModel.ts` so AI output
 * can never fabricate out-of-range impacts or present estimates as measured facts.
 */
export function normalizeAiActionCards(
  rawCards: unknown,
  reqData: ValidatedRecommendationRequest
): ActionCardData[] | null {
  if (!Array.isArray(rawCards) || rawCards.length !== 3) {
    return null;
  }

  const fallbackCards = buildTailoredActionCards(reqData);

  return EXPECTED_CARD_SPECS.map((spec, index) => {
    const candidate = rawCards[index] as Record<string, unknown> | undefined;
    const fallback = fallbackCards[index];
    if (!candidate || typeof candidate !== 'object') {
      return fallback;
    }

    const title = sanitizePlainText(candidate.title, 110) || fallback.title;
    const instruction = sanitizePlainText(candidate.instruction, 420) || fallback.instruction;
    const tickerSummary = sanitizePlainText(candidate.tickerSummary, 140) || fallback.tickerSummary;

    const rawHealth =
      candidate.familyHealthImpact && typeof candidate.familyHealthImpact === 'object'
        ? (candidate.familyHealthImpact as Record<string, unknown>)
        : {};
    const rawEmission =
      candidate.neighborhoodEmissionImpact &&
      typeof candidate.neighborhoodEmissionImpact === 'object'
        ? (candidate.neighborhoodEmissionImpact as Record<string, unknown>)
        : {};
    const rawMethod =
      candidate.impactMethodology && typeof candidate.impactMethodology === 'object'
        ? (candidate.impactMethodology as Record<string, unknown>)
        : {};

    const candidateReductionPct =
      typeof rawHealth.pm25ReductionPercent === 'number' &&
      Number.isFinite(rawHealth.pm25ReductionPercent)
        ? rawHealth.pm25ReductionPercent
        : fallback.familyHealthImpact.pm25ReductionPercent;

    // Ground exposure math in deterministic impactModel formulas (never trust raw LLM arithmetic)
    const groundedHealth = calculateHouseholdExposureImpact({
      ambientPm25: reqData.currentPm25,
      reductionPercent: candidateReductionPct,
      exposureWeight: spec.exposureWeight,
      scopeLabel:
        spec.id === 'indoor_hack'
          ? 'indoor PM2.5 exposure'
          : spec.id === 'sustainable_swap'
            ? 'kitchen & street PM2.5'
            : 'daily PM2.5 exposure',
    });

    const candidateCo2 =
      typeof rawEmission.co2AvoidedKg === 'number' &&
      Number.isFinite(rawEmission.co2AvoidedKg) &&
      rawEmission.co2AvoidedKg >= 0
        ? rawEmission.co2AvoidedKg
        : fallback.neighborhoodEmissionImpact.co2AvoidedKg;

    const candidateNox =
      typeof rawEmission.noxAvoidedGrams === 'number' &&
      Number.isFinite(rawEmission.noxAvoidedGrams) &&
      rawEmission.noxAvoidedGrams >= 0
        ? rawEmission.noxAvoidedGrams
        : fallback.neighborhoodEmissionImpact.noxAvoidedGrams;

    const groundedEmission = calculateNeighborhoodEmissionImpact({
      city: reqData.city,
      co2Kg: candidateCo2,
      noxGrams: candidateNox,
    });

    const rationale =
      sanitizePlainText(rawMethod.rationale, 240) || fallback.impactMethodology.rationale;
    const assumptions =
      sanitizePlainText(rawMethod.assumptions, 280) || fallback.impactMethodology.assumptions;
    const targetPollutants = Array.isArray(rawMethod.targetPollutants)
      ? rawMethod.targetPollutants
          .map((p) => sanitizePlainText(p, 24))
          .filter(Boolean)
          .slice(0, 4)
      : fallback.impactMethodology.targetPollutants;

    const impactMethodology = createImpactMethodology({
      basis: 'modelled',
      rationale,
      targetPollutants:
        targetPollutants.length > 0
          ? targetPollutants
          : fallback.impactMethodology.targetPollutants,
      formulaSummary: `Avoided PM2.5 = ${reqData.currentPm25} µg/m³ × ${groundedHealth.pm25ReductionPercent}% × ${spec.exposureWeight} share = ~${groundedHealth.avoidedPm25UgM3} µg/m³; illustrative benchmark ÷ 22 µg/m³ (Berkeley Earth).`,
      assumptions,
    });

    return {
      id: spec.id,
      categoryLabel: spec.categoryLabel,
      title,
      instruction,
      familyHealthImpact: {
        pm25ReductionPercent: groundedHealth.pm25ReductionPercent,
        passiveCigarettesAvoided: groundedHealth.passiveCigarettesAvoided,
        summaryText: groundedHealth.summaryText,
      },
      neighborhoodEmissionImpact: {
        co2AvoidedKg: groundedEmission.co2AvoidedKg,
        noxAvoidedGrams: groundedEmission.noxAvoidedGrams,
        summaryText: groundedEmission.summaryText,
      },
      impactMethodology,
      tickerSummary,
    };
  });
}

/**
 * Defensive payload validator that mirrors `isValidCommunityImpact` in `firestore.rules`
 * and `firebase-blueprint.json` before any Firestore write to `/community_impact/{citySlug}`.
 */
export function validateCommunityImpactPayload(
  payload: CommunityImpactDoc,
  expectedCitySlug: string,
  expectedAuthUid: string,
  previousDoc?: Pick<
    CommunityImpactDoc,
    'familiesCount' | 'co2AvoidedKg' | 'noxAvoidedGrams'
  > | null
): boolean {
  if (!payload || typeof payload !== 'object') return false;
  if (
    !payload.citySlug ||
    payload.citySlug.length > 128 ||
    !ID_REGEX.test(payload.citySlug) ||
    payload.citySlug !== expectedCitySlug
  ) {
    return false;
  }
  if (!payload.cityName || payload.cityName.length > 100) return false;
  if (/\bGPS\b/i.test(payload.cityName) || /-?\d{1,3}\.\d+\s*°/.test(payload.cityName)) {
    return false;
  }
  if (
    typeof payload.familiesCount !== 'number' ||
    !Number.isFinite(payload.familiesCount) ||
    payload.familiesCount < 1 ||
    payload.familiesCount > 10000000
  ) {
    return false;
  }
  if (
    typeof payload.co2AvoidedKg !== 'number' ||
    !Number.isFinite(payload.co2AvoidedKg) ||
    payload.co2AvoidedKg < 0 ||
    payload.co2AvoidedKg > 100000000
  ) {
    return false;
  }
  if (
    typeof payload.noxAvoidedGrams !== 'number' ||
    !Number.isFinite(payload.noxAvoidedGrams) ||
    payload.noxAvoidedGrams < 0 ||
    payload.noxAvoidedGrams > 100000000
  ) {
    return false;
  }

  // Enforce per-write realistic delta caps matching firestore.rules
  if (previousDoc) {
    const famDelta = payload.familiesCount - previousDoc.familiesCount;
    const co2Delta = payload.co2AvoidedKg - previousDoc.co2AvoidedKg;
    const noxDelta = payload.noxAvoidedGrams - previousDoc.noxAvoidedGrams;
    if (famDelta < 0 || famDelta > 1) return false;
    if (co2Delta < 0 || co2Delta > IMPACT_CONSTANTS.MAX_ACTION_CO2_KG) return false;
    if (noxDelta < 0 || noxDelta > IMPACT_CONSTANTS.MAX_ACTION_NOX_GRAMS) return false;
  } else {
    // Initial document create must represent 1 real action, never a synthetic seeded total
    if (payload.familiesCount !== 1) return false;
    if (payload.co2AvoidedKg > IMPACT_CONSTANTS.MAX_ACTION_CO2_KG) return false;
    if (payload.noxAvoidedGrams > IMPACT_CONSTANTS.MAX_ACTION_NOX_GRAMS) return false;
  }

  if (
    !Array.isArray(payload.recentActions) ||
    payload.recentActions.length < 1 ||
    payload.recentActions.length > 10
  ) {
    return false;
  }
  for (const item of payload.recentActions) {
    if (
      typeof item !== 'string' ||
      item.length < 1 ||
      item.length > 240 ||
      /-?\d{1,3}\.\d+\s*°/.test(item)
    ) {
      return false;
    }
  }
  if (
    !payload.lastActionBy ||
    payload.lastActionBy.length > 128 ||
    !ID_REGEX.test(payload.lastActionBy) ||
    payload.lastActionBy !== expectedAuthUid
  ) {
    return false;
  }
  return true;
}
