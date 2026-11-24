import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSimulatedOrFallbackHourlyPoints,
  buildTailoredActionCards,
  calculateSafeVentilationWindow,
  DEFAULT_CITY,
  formatHourLabel,
  formatTickerActionLine,
  sanitizePublicCityLabel,
  toCitySlug,
} from './smogLogic';
import {
  fetchOpenMeteoForecast,
  formatCoordinateDisplay,
  normalizeOpenMeteoHourlyResponse,
  resolvePrivacySafeLocationFromCoords,
  roundCoordinateToCityGrid,
} from './weatherService';

test('toCitySlug normalizes city names safely for Firestore document IDs', () => {
  assert.equal(toCitySlug('New Delhi'), 'new-delhi');
  assert.equal(toCitySlug('  São Paulo / Centro '), 's-o-paulo-centro');
  assert.equal(toCitySlug(''), 'unknown-city');
  assert.equal(toCitySlug('A'.repeat(200)).length, 120);
});

test('formatHourLabel formats 24-hour indices and handles non-finite inputs safely', () => {
  assert.equal(formatHourLabel(0, false), '12:00 AM');
  assert.equal(formatHourLabel(0, true), '12 AM');
  assert.equal(formatHourLabel(12, false), '12:00 PM');
  assert.equal(formatHourLabel(14, false), '2:00 PM');
  assert.equal(formatHourLabel(14, true), '2 PM');
  assert.equal(formatHourLabel(Number.NaN, false), '12:00 AM');
});

test('calculateSafeVentilationWindow rejects incomplete (<24h), NaN, Infinity, and negative readings', () => {
  const basePoints = buildSimulatedOrFallbackHourlyPoints(false);

  assert.throws(
    () => calculateSafeVentilationWindow(basePoints.slice(0, 12), 10),
    /Expected 24 hourly air quality points/
  );

  const nanPm25 = basePoints.map((pt, i) =>
    i === 14 ? { ...pt, pm25: Number.NaN } : pt
  );
  assert.throws(
    () => calculateSafeVentilationWindow(nanPm25, 10),
    /Invalid PM2\.5 reading at hour 14/
  );

  const negPm25 = basePoints.map((pt, i) =>
    i === 8 ? { ...pt, pm25: -5 } : pt
  );
  assert.throws(
    () => calculateSafeVentilationWindow(negPm25, 10),
    /Invalid PM2\.5 reading at hour 8/
  );

  const infWind = basePoints.map((pt, i) =>
    i === 10 ? { ...pt, windSpeedKmh: Number.POSITIVE_INFINITY } : pt
  );
  assert.throws(
    () => calculateSafeVentilationWindow(infWind, 10),
    /Invalid wind speed reading at hour 10/
  );
});

test('calculateSafeVentilationWindow identifies lowest PM2.5 + wind dispersion 2-hour window across upcoming 24 hours', () => {
  const rawPoints = buildSimulatedOrFallbackHourlyPoints(false);
  const { windowInfo, annotatedPoints } = calculateSafeVentilationWindow(
    rawPoints,
    10
  );

  // Bar 0 must always be "Now"
  assert.equal(annotatedPoints[0].shortLabel, 'Now');
  assert.equal(annotatedPoints.length, 24);

  // Cleanest upcoming window in moderate curve is 14:00-16:00 (offset 4 from hour 10)
  assert.equal(windowInfo.startHour, 4);
  assert.equal(windowInfo.endHour, 6);
  assert.equal(windowInfo.windowLabel, '2:00 PM – 4:00 PM');
  assert.equal(windowInfo.statusType, 'wait_until');
  assert.equal(windowInfo.statusHeadline, 'Best Upcoming Window: 2:00 PM – 4:00 PM');
  assert.equal(annotatedPoints[4].isInSafeWindow, true);
  assert.equal(annotatedPoints[5].isInSafeWindow, true);
  assert.equal(annotatedPoints[0].isInSafeWindow, false);
});

test('calculateSafeVentilationWindow checks upcoming cleanest window and current PM2.5 <= 60 for Open Windows Now', () => {
  const rawPoints = buildSimulatedOrFallbackHourlyPoints(false);

  // Inside 14:00–16:00 when Now is cleanest window and current PM2.5 (48) <= 60 -> open_now
  const safeRes = calculateSafeVentilationWindow(rawPoints, 14);
  assert.equal(safeRes.windowInfo.startHour, 0);
  assert.equal(safeRes.windowInfo.statusType, 'open_now');
  assert.equal(safeRes.windowInfo.statusHeadline, 'Open Windows Now');
  assert.equal(safeRes.annotatedPoints[0].shortLabel, 'Now');
  assert.equal(safeRes.annotatedPoints[0].isInSafeWindow, true);
  assert.equal(safeRes.annotatedPoints[1].isInSafeWindow, true);

  // When Now is cleanest window but current hour PM2.5 is spiked > 60 -> Tier 2 wait_until
  const spikedPoints = buildSimulatedOrFallbackHourlyPoints(false).map((pt, idx) => ({
    ...pt,
    pm25: idx === 14 ? 75 : pt.pm25,
  }));
  const spikedRes = calculateSafeVentilationWindow(spikedPoints, 14);
  assert.equal(spikedRes.windowInfo.statusType, 'wait_until');
  assert.ok(spikedRes.windowInfo.statusHeadline.includes('Best Upcoming Window'));
});

test('calculateSafeVentilationWindow handles rolling upcoming 24-hour forecast from evening hours', () => {
  const rawPoints = buildSimulatedOrFallbackHourlyPoints(false);
  // 8:00 PM (hour 20) looks forward 24h into tomorrow; cleanest window is tomorrow 2:00 PM – 4:00 PM (offset 18)
  const eveningRes = calculateSafeVentilationWindow(rawPoints, 20);

  assert.equal(eveningRes.annotatedPoints[0].shortLabel, 'Now');
  assert.equal(eveningRes.annotatedPoints.length, 24);
  assert.equal(eveningRes.windowInfo.startHour, 18);
  assert.equal(eveningRes.windowInfo.windowLabel, '2:00 PM – 4:00 PM');
  assert.equal(eveningRes.windowInfo.statusType, 'wait_until');
  assert.equal(eveningRes.windowInfo.statusHeadline, 'Best Upcoming Window: 2:00 PM – 4:00 PM');
  assert.ok(eveningRes.windowInfo.statusSubtext.includes('Keep windows closed during upcoming peak hours'));
});

test('calculateSafeVentilationWindow implements the 3 scientific status tiers accurately', () => {
  const makeConstantPoints = (pm25Val: number) =>
    buildSimulatedOrFallbackHourlyPoints(false).map((pt) => ({
      ...pt,
      pm25: pm25Val,
      windSpeedKmh: 10,
    }));

  // Tier 1: Clean Air All Day (max upcoming PM2.5 <= 25 µg/m³) -> Clean Air — Safe to Ventilate Anytime
  const tier1Res = calculateSafeVentilationWindow(makeConstantPoints(20), 8);
  assert.equal(tier1Res.windowInfo.statusType, 'open_now');
  assert.equal(tier1Res.windowInfo.statusHeadline, 'Clean Air — Safe to Ventilate Anytime');
  assert.ok(tier1Res.windowInfo.statusSubtext.includes('WHO clean air guidelines'));

  // Tier 1 boundary at 25 µg/m³
  const tier1Boundary = calculateSafeVentilationWindow(makeConstantPoints(25), 8);
  assert.equal(tier1Boundary.windowInfo.statusType, 'open_now');
  assert.equal(tier1Boundary.windowInfo.statusHeadline, 'Clean Air — Safe to Ventilate Anytime');

  // Tier 2: Smog Peaks Present (26 to 150 µg/m³): Now in cleanest window & PM2.5 <= 60 -> Open Windows Now
  const tier2Open = calculateSafeVentilationWindow(makeConstantPoints(45), 8);
  assert.equal(tier2Open.windowInfo.statusType, 'open_now');
  assert.equal(tier2Open.windowInfo.statusHeadline, 'Open Windows Now');

  // Tier 2: Smog Peaks Present: PM2.5 > 60 -> Best Upcoming Window: [Start] – [End]
  const tier2Wait = calculateSafeVentilationWindow(makeConstantPoints(90), 8);
  assert.equal(tier2Wait.windowInfo.statusType, 'wait_until');
  assert.ok(tier2Wait.windowInfo.statusHeadline.startsWith('Best Upcoming Window:'));

  // Tier 3: Severe Winter Smog (cleanest upcoming 2-hour window > 150 µg/m³) -> Severe Smog — Keep Windows Sealed
  const tier3Boundary = calculateSafeVentilationWindow(makeConstantPoints(151), 8);
  assert.equal(tier3Boundary.windowInfo.statusType, 'keep_sealed');
  assert.equal(tier3Boundary.windowInfo.statusHeadline, 'Severe Smog — Keep Windows Sealed');
  assert.ok(tier3Boundary.windowInfo.statusSubtext.includes('exceeding the 150 µg/m³ safety ceiling'));
});

test('calculateSafeVentilationWindow triggers Severe Smog — Keep Windows Sealed on simulated severe smog curve', () => {
  const severePoints = buildSimulatedOrFallbackHourlyPoints(true);
  const { windowInfo } = calculateSafeVentilationWindow(severePoints, 14);

  assert.equal(windowInfo.avgPm25 > 150, true);
  assert.equal(windowInfo.statusType, 'keep_sealed');
  assert.equal(windowInfo.statusHeadline, 'Severe Smog — Keep Windows Sealed');
});

test('buildTailoredActionCards adapts meaningfully across household lifestyle profiles and includes transparent methodology', () => {
  const severePoints = buildSimulatedOrFallbackHourlyPoints(true);
  const { windowInfo } = calculateSafeVentilationWindow(severePoints, 19);

  const gasTwoWheelerNoPurifier = buildTailoredActionCards({
    city: 'New Delhi',
    currentPm25: 340,
    safeWindow: windowInfo,
    profile: {
      cookingFuel: 'gas',
      commute: 'two_wheeler',
      indoorFiltration: 'no_purifier',
      vulnerableMembers: 'yes',
    },
  });

  const inductionWfhPurifier = buildTailoredActionCards({
    city: 'Milan',
    currentPm25: 65,
    safeWindow: windowInfo,
    profile: {
      cookingFuel: 'induction',
      commute: 'wfh',
      indoorFiltration: 'has_purifier',
      vulnerableMembers: 'no',
    },
  });

  assert.equal(gasTwoWheelerNoPurifier.length, 3);
  assert.equal(inductionWfhPurifier.length, 3);

  // Profiles must generate genuinely different tailored titles/instructions
  assert.notEqual(gasTwoWheelerNoPurifier[0].title, inductionWfhPurifier[0].title);
  assert.notEqual(gasTwoWheelerNoPurifier[1].title, inductionWfhPurifier[1].title);
  assert.notEqual(gasTwoWheelerNoPurifier[2].title, inductionWfhPurifier[2].title);

  // Every card must expose rationale, targetPollutants, formulaSummary, assumptions, uncertaintyNote, and basis
  for (const card of [...gasTwoWheelerNoPurifier, ...inductionWfhPurifier]) {
    assert.equal(card.impactMethodology.basis, 'modelled');
    assert.ok(card.impactMethodology.rationale.length > 15);
    assert.ok(card.impactMethodology.targetPollutants.length >= 1);
    assert.ok(card.impactMethodology.formulaSummary.includes('µg/m³'));
    assert.ok(card.impactMethodology.assumptions.length > 15);
    assert.ok(card.impactMethodology.uncertaintyNote.includes('Modelled estimate'));
  }
});

test('weatherService normalizes valid Open-Meteo payloads, handles sensor gaps, and falls back explicitly on failure', async () => {
  const validAq = {
    hourly: {
      time: Array.from({ length: 24 }, (_, h) => `2026-11-19T${String(h).padStart(2, '0')}:00`),
      pm2_5: Array.from({ length: 24 }, (_, h) => (h === 5 ? null : 80 + h)),
      pm10: Array.from({ length: 24 }, (_, h) => 110 + h),
      us_aqi: Array.from({ length: 24 }, (_, h) => 140 + h),
    },
  };
  const validWx = {
    hourly: {
      time: validAq.hourly.time,
      wind_speed_10m: Array.from({ length: 24 }, () => 12.4),
      temperature_2m: Array.from({ length: 24 }, () => 19.2),
    },
  };

  const normalized = normalizeOpenMeteoHourlyResponse(validAq, validWx);
  assert.ok(normalized !== null);
  assert.equal(normalized!.length, 24);
  assert.ok(normalized![5].pm25 > 0); // isolated null sensor gap filled by mean

  // Insufficient valid observations (<12 valid PM2.5 readings) must return null
  const mostlyNullAq = {
    hourly: {
      time: validAq.hourly.time,
      pm2_5: Array.from({ length: 24 }, () => null),
    },
  };
  assert.equal(normalizeOpenMeteoHourlyResponse(mostlyNullAq, validWx), null);

  // Offline fetch failure explicitly tags source as 'offline_fallback' with warning
  const failingFetch: typeof fetch = async () => {
    throw new Error('ECONNREFUSED');
  };
  const offlineRes = await fetchOpenMeteoForecast(DEFAULT_CITY, undefined, failingFetch);
  assert.equal(offlineRes.source, 'offline_fallback');
  assert.equal(offlineRes.points.length, 24);
  assert.ok(offlineRes.warning?.includes('not live sensor measurements'));
});

test('privacy-safe coarse geolocation never exposes raw coordinates in city labels or public tickers', () => {
  assert.equal(roundCoordinateToCityGrid(28.613945), 28.6);
  assert.equal(formatCoordinateDisplay(37.7749, -122.4194), '37.8°N, 122.4°W');
  assert.equal(formatCoordinateDisplay(-33.8688, 151.2093), '33.9°S, 151.2°E');

  // Near Delhi matches preset city cleanly
  const nearDelhi = resolvePrivacySafeLocationFromCoords(28.6234, 77.2198);
  assert.equal(nearDelhi.name, 'New Delhi');
  assert.equal(nearDelhi.isCoarseGps, true);

  // Arbitrary remote coordinate resolves to coarse label without embedding coordinates
  const remoteLoc = resolvePrivacySafeLocationFromCoords(12.9716, 77.5946);
  assert.equal(remoteLoc.name, 'Local Urban Air Shed');
  assert.equal(remoteLoc.latitude, 13.0);
  assert.equal(remoteLoc.longitude, 77.6);
  assert.equal(/-?\d+\.\d+°/.test(remoteLoc.name), false);

  // Sanitizer strips accidental GPS strings from public city labels & tickers
  assert.equal(sanitizePublicCityLabel('GPS (28.61°, 77.21°)'), 'Local Urban Air Shed');
  const ticker = formatTickerActionLine(
    'GPS (28.61°, 77.21°)',
    'skipped a short trip near 28.61°N'
  );
  assert.equal(ticker.includes('28.61'), false);
  assert.equal(ticker.includes('GPS'), false);
});
