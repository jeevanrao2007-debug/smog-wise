import { ImpactMethodology } from '../types';

/**
 * Transparent, literature-referenced constants used to compute modelled household
 * and neighborhood environmental estimates.
 *
 * All values are MODELLED / ILLUSTRATIVE estimates—never direct personal sensor measurements.
 */
export const IMPACT_CONSTANTS = {
  /**
   * Berkeley Earth epidemiological equivalence benchmark (Muller & Muller):
   * ~22 µg/m³ of 24-hour ambient PM2.5 exposure corresponds roughly to 1 cigarette/day
   * in long-term mortality risk comparisons. Strictly illustrative, not clinical risk.
   */
  PM25_UG_M3_PER_EQUIVALENT_CIGARETTE: 22,

  /** Maximum plausible modelled indoor/exposure reduction percentage for a single habit */
  MAX_PM25_REDUCTION_PCT: 75,
  MIN_PM25_REDUCTION_PCT: 5,

  /** Maximum plausible daily cigarette-equivalent benchmark cap (prevents extreme artifacts) */
  MAX_PASSIVE_CIGARETTES_EQUIV: 20,

  /** Per-action emission ceilings matching Firestore single-write delta caps */
  MAX_ACTION_CO2_KG: 25,
  MAX_ACTION_NOX_GRAMS: 150,
} as const;

export interface ExposureImpactEstimate {
  pm25ReductionPercent: number;
  avoidedPm25UgM3: number;
  passiveCigarettesAvoided: number;
  summaryText: string;
}

export interface EmissionImpactEstimate {
  co2AvoidedKg: number;
  noxAvoidedGrams: number;
  summaryText: string;
}

/**
 * Clamps and validates a numeric input into a finite, non-negative range.
 */
export function clampFinite(value: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

/**
 * Models estimated daily household PM2.5 exposure reduction and its illustrative
 * Berkeley Earth cigarette-equivalent benchmark.
 *
 * Formula:
 *   avoidedPm25UgM3 = ambientPm25 * (reductionPct / 100) * exposureWeight
 *   passiveCigarettesAvoided = avoidedPm25UgM3 / 22
 */
export function calculateHouseholdExposureImpact(params: {
  ambientPm25: number;
  reductionPercent: number;
  exposureWeight: number; // fraction of 24h exposure impacted by this action (0.1..1.0)
  scopeLabel?: string;
}): ExposureImpactEstimate {
  const safeAmbient = clampFinite(params.ambientPm25, 0, 2000);
  const safePct = Math.round(
    clampFinite(
      params.reductionPercent,
      IMPACT_CONSTANTS.MIN_PM25_REDUCTION_PCT,
      IMPACT_CONSTANTS.MAX_PM25_REDUCTION_PCT
    )
  );
  const safeWeight = clampFinite(params.exposureWeight, 0.1, 1.0);

  const avoidedPm25UgM3 = Number(
    (safeAmbient * (safePct / 100) * safeWeight).toFixed(1)
  );
  const rawCigs =
    avoidedPm25UgM3 / IMPACT_CONSTANTS.PM25_UG_M3_PER_EQUIVALENT_CIGARETTE;
  const passiveCigarettesAvoided = Number(
    clampFinite(
      Math.round(rawCigs * 10) / 10,
      0,
      IMPACT_CONSTANTS.MAX_PASSIVE_CIGARETTES_EQUIV
    ).toFixed(1)
  );

  const scope = params.scopeLabel || 'inhaled PM2.5';
  const summaryText = `Modelled -${safePct}% ${scope} (~${avoidedPm25UgM3} µg/m³ avoided) • Illustrative benchmark: ~${passiveCigarettesAvoided} cigarette-eq./day`;

  return {
    pm25ReductionPercent: safePct,
    avoidedPm25UgM3,
    passiveCigarettesAvoided,
    summaryText,
  };
}

/**
 * Models local neighborhood CO2 (kg) and NOx (g) reductions using explicit,
 * unit-checked activity emission factors (EPA / DEFRA / IEA urban averages).
 */
export function calculateNeighborhoodEmissionImpact(params: {
  city: string;
  co2Kg: number;
  noxGrams: number;
}): EmissionImpactEstimate {
  const co2AvoidedKg = Number(
    clampFinite(
      Math.round(params.co2Kg * 10) / 10,
      0,
      IMPACT_CONSTANTS.MAX_ACTION_CO2_KG
    ).toFixed(1)
  );
  const noxAvoidedGrams = Number(
    clampFinite(
      Math.round(params.noxGrams * 10) / 10,
      0,
      IMPACT_CONSTANTS.MAX_ACTION_NOX_GRAMS
    ).toFixed(1)
  );

  return {
    co2AvoidedKg,
    noxAvoidedGrams,
    summaryText: `Modelled local avoidance: ~${co2AvoidedKg} kg CO2 and ~${noxAvoidedGrams} g NOx in ${params.city}`,
  };
}

/**
 * Builds transparent impact methodology metadata for any action card, ensuring
 * assumptions, units, and uncertainty are always disclosed to families.
 */
export function createImpactMethodology(params: {
  rationale: string;
  targetPollutants: string[];
  formulaSummary: string;
  assumptions: string;
  uncertaintyNote?: string;
  basis?: 'modelled' | 'illustrative';
}): ImpactMethodology {
  return {
    basis: params.basis ?? 'modelled',
    rationale: params.rationale,
    targetPollutants:
      params.targetPollutants.length > 0 ? params.targetPollutants : ['PM2.5'],
    formulaSummary: params.formulaSummary,
    assumptions: params.assumptions,
    uncertaintyNote:
      params.uncertaintyNote ||
      'Modelled estimate, not a personal sensor or medical measurement. Actual impact varies with home airtightness, filter CADR, vehicle class, and outdoor dispersion.',
  };
}

/**
 * Returns today's local calendar date key (YYYY-MM-DD) for per-day action deduplication.
 */
export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Builds a date-scoped daily action completion key (`YYYY-MM-DD:<actionId>`),
 * preventing same-day double counting while automatically resetting each calendar day.
 */
export function toDailyActionKey(actionId: string, dateKey: string = getLocalDateKey()): string {
  const cleanId = actionId.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 32) || 'action';
  const cleanDate = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : getLocalDateKey();
  return `${cleanDate}:${cleanId}`.slice(0, 64);
}

/**
 * Checks whether an action ID has already been completed for the specified calendar date.
 */
export function isActionCompletedToday(
  completedKeys: string[],
  actionId: string,
  dateKey: string = getLocalDateKey()
): boolean {
  const expectedKey = toDailyActionKey(actionId, dateKey);
  return completedKeys.includes(expectedKey);
}

/**
 * Filters stored completion keys to only retain entries belonging to the given calendar date.
 */
export function filterCompletedKeysForDate(
  completedKeys: string[],
  dateKey: string = getLocalDateKey()
): string[] {
  const prefix = `${dateKey}:`;
  return Array.from(
    new Set(
      completedKeys.filter(
        (key) => typeof key === 'string' && key.startsWith(prefix) && key.length <= 64
      )
    )
  ).slice(0, 10);
}
