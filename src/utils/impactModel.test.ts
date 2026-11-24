import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHouseholdExposureImpact,
  calculateNeighborhoodEmissionImpact,
  clampFinite,
  createImpactMethodology,
  filterCompletedKeysForDate,
  getLocalDateKey,
  IMPACT_CONSTANTS,
  isActionCompletedToday,
  toDailyActionKey,
} from './impactModel';

test('clampFinite clamps NaN, Infinity, negative, and oversized inputs deterministically', () => {
  assert.equal(clampFinite(Number.NaN, 0, 100), 0);
  assert.equal(clampFinite(Number.POSITIVE_INFINITY, 0, 100), 0);
  assert.equal(clampFinite(-50, 0, 100), 0);
  assert.equal(clampFinite(999, 0, 100), 100);
  assert.equal(clampFinite(42.5, 0, 100), 42.5);
});

test('calculateHouseholdExposureImpact computes unit-consistent avoided PM2.5 and Berkeley Earth cigarette equivalents', () => {
  // 220 µg/m³ * 50% * 1.0 exposure share = 110.0 µg/m³ avoided -> 110 / 22 = 5.0 cig-eq/day
  const exact = calculateHouseholdExposureImpact({
    ambientPm25: 220,
    reductionPercent: 50,
    exposureWeight: 1.0,
  });
  assert.equal(exact.pm25ReductionPercent, 50);
  assert.equal(exact.avoidedPm25UgM3, 110);
  assert.equal(exact.passiveCigarettesAvoided, 5.0);
  assert.ok(exact.summaryText.includes('Modelled -50%'));
  assert.ok(exact.summaryText.includes('Illustrative benchmark: ~5 cigarette-eq./day'));

  // Zero ambient PM2.5 yields 0 avoided PM2.5 and 0 cigarettes
  const zero = calculateHouseholdExposureImpact({
    ambientPm25: 0,
    reductionPercent: 40,
    exposureWeight: 0.7,
  });
  assert.equal(zero.avoidedPm25UgM3, 0);
  assert.equal(zero.passiveCigarettesAvoided, 0);

  // Negative and extreme inputs are safely clamped within IMPACT_CONSTANTS
  const extreme = calculateHouseholdExposureImpact({
    ambientPm25: 99999,
    reductionPercent: 500,
    exposureWeight: 5.0,
  });
  assert.equal(extreme.pm25ReductionPercent, IMPACT_CONSTANTS.MAX_PM25_REDUCTION_PCT);
  assert.equal(
    extreme.passiveCigarettesAvoided,
    IMPACT_CONSTANTS.MAX_PASSIVE_CIGARETTES_EQUIV
  );

  const negative = calculateHouseholdExposureImpact({
    ambientPm25: -100,
    reductionPercent: -50,
    exposureWeight: -2,
  });
  assert.equal(negative.pm25ReductionPercent, IMPACT_CONSTANTS.MIN_PM25_REDUCTION_PCT);
  assert.equal(negative.avoidedPm25UgM3, 0);
  assert.equal(negative.passiveCigarettesAvoided, 0);
});

test('calculateNeighborhoodEmissionImpact clamps units cleanly within Firestore delta caps', () => {
  const normal = calculateNeighborhoodEmissionImpact({
    city: 'New Delhi',
    co2Kg: 1.64,
    noxGrams: 6.23,
  });
  assert.equal(normal.co2AvoidedKg, 1.6);
  assert.equal(normal.noxAvoidedGrams, 6.2);
  assert.ok(normal.summaryText.includes('Modelled local avoidance'));
  assert.ok(normal.summaryText.includes('kg CO2'));
  assert.ok(normal.summaryText.includes('g NOx'));

  const clamped = calculateNeighborhoodEmissionImpact({
    city: 'New Delhi',
    co2Kg: 9999,
    noxGrams: 9999,
  });
  assert.equal(clamped.co2AvoidedKg, IMPACT_CONSTANTS.MAX_ACTION_CO2_KG);
  assert.equal(clamped.noxAvoidedGrams, IMPACT_CONSTANTS.MAX_ACTION_NOX_GRAMS);

  const negative = calculateNeighborhoodEmissionImpact({
    city: 'New Delhi',
    co2Kg: -4,
    noxGrams: -12,
  });
  assert.equal(negative.co2AvoidedKg, 0);
  assert.equal(negative.noxAvoidedGrams, 0);
});

test('createImpactMethodology always labels estimates as modelled/illustrative with uncertainty disclosure', () => {
  const method = createImpactMethodology({
    rationale: 'Gas stoves emit indoor NO2 when windows stay sealed.',
    targetPollutants: ['PM2.5', 'NO2'],
    formulaSummary: '100 * 25% * 0.5 = 12.5 µg/m³',
    assumptions: 'Assumes 20 min less open-flame burner runtime.',
  });

  assert.equal(method.basis, 'modelled');
  assert.deepEqual(method.targetPollutants, ['PM2.5', 'NO2']);
  assert.ok(method.uncertaintyNote.includes('not a personal sensor or medical measurement'));
});

test('daily action deduplication prevents double counting today and resets automatically on a new calendar day', () => {
  const day1 = getLocalDateKey(new Date(2026, 10, 19)); // 2026-11-19
  const day2 = getLocalDateKey(new Date(2026, 10, 20)); // 2026-11-20

  assert.equal(day1, '2026-11-19');
  const key = toDailyActionKey('routine', day1);
  assert.equal(key, '2026-11-19:routine');

  // Same-day duplicate detected
  assert.equal(isActionCompletedToday([key], 'routine', day1), true);
  assert.equal(isActionCompletedToday([key], 'indoor_hack', day1), false);

  // Next calendar day automatically resets
  assert.equal(isActionCompletedToday([key], 'routine', day2), false);
  assert.deepEqual(filterCompletedKeysForDate([key, '2026-11-20:routine'], day2), [
    '2026-11-20:routine',
  ]);
});
