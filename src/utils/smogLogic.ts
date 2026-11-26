import { DISPERSION_CONFIG, PM25_THRESHOLDS } from '../constants';
import { HourlyAirPoint, SafeVentilationWindow, VentilationStatusType } from '../types';

export { DEFAULT_CITY, PRESET_CITIES } from '../constants';
export { buildTailoredActionCards } from './actionCardBuilder';

/**
 * Normalizes a city name into a safe, lowercase Firestore document slug.
 */
export function toCitySlug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return cleaned || 'unknown-city';
}

/**
 * Formats a 24-hour clock index into a clean 12-hour human label (e.g. "2:00 PM" or "2 PM").
 */
export function formatHourLabel(hour24: number, short = false): string {
  const safeHour = Number.isFinite(hour24) ? Math.trunc(hour24) : 0;
  const normalized =
    ((safeHour % DISPERSION_CONFIG.HOURS_PER_FORECAST) + DISPERSION_CONFIG.HOURS_PER_FORECAST) %
    DISPERSION_CONFIG.HOURS_PER_FORECAST;
  const period = normalized >= 12 ? 'PM' : 'AM';
  const hour12 = normalized % 12 === 0 ? 12 : normalized % 12;
  return short ? `${hour12} ${period}` : `${hour12}:00 ${period}`;
}

/**
 * Validates that raw hourly air quality points form a finite, non-negative >= 24h dataset.
 */
function validateHourlyPointsInput(hourlyPoints: Omit<HourlyAirPoint, 'isInSafeWindow'>[]): void {
  if (!Array.isArray(hourlyPoints) || hourlyPoints.length < DISPERSION_CONFIG.HOURS_PER_FORECAST) {
    throw new Error('Expected 24 hourly air quality points');
  }

  for (let i = 0; i < hourlyPoints.length; i++) {
    const pt = hourlyPoints[i];
    if (
      !pt ||
      typeof pt.pm25 !== 'number' ||
      !Number.isFinite(pt.pm25) ||
      pt.pm25 < 0 ||
      pt.pm25 > PM25_THRESHOLDS.MAX_VALID_PM25
    ) {
      throw new Error(`Invalid PM2.5 reading at hour ${i}`);
    }
    if (
      typeof pt.windSpeedKmh !== 'number' ||
      !Number.isFinite(pt.windSpeedKmh) ||
      pt.windSpeedKmh < 0 ||
      pt.windSpeedKmh > PM25_THRESHOLDS.MAX_VALID_WIND_KMH
    ) {
      throw new Error(`Invalid wind speed reading at hour ${i}`);
    }
  }
}

/**
 * Slices the next 24 consecutive upcoming hours starting at the normalized local hour (Now)
 * so past hours are never analyzed or displayed.
 */
function sliceUpcoming24Hours(
  hourlyPoints: Omit<HourlyAirPoint, 'isInSafeWindow'>[],
  normalizedCurrentHour: number
): Omit<HourlyAirPoint, 'isInSafeWindow'>[] {
  const hoursCount = DISPERSION_CONFIG.HOURS_PER_FORECAST;
  const upcomingPoints: Omit<HourlyAirPoint, 'isInSafeWindow'>[] = [];
  for (let i = 0; i < hoursCount; i++) {
    const sourceIndex = (normalizedCurrentHour + i) % hourlyPoints.length;
    const pt = hourlyPoints[sourceIndex];
    const hourOfDay = (normalizedCurrentHour + i) % hoursCount;
    upcomingPoints.push({
      ...pt,
      hourIndex: i,
      label:
        i === 0 ? `Now (${formatHourLabel(hourOfDay, false)})` : formatHourLabel(hourOfDay, false),
      shortLabel: i === 0 ? 'Now' : formatHourLabel(hourOfDay, true),
    });
  }
  return upcomingPoints;
}

/**
 * Finds the hourly observation with the highest projected PM2.5 concentration.
 */
function findWorstUpcomingPoint(
  upcomingPoints: Omit<HourlyAirPoint, 'isInSafeWindow'>[]
): Omit<HourlyAirPoint, 'isInSafeWindow'> {
  return upcomingPoints.reduce(
    (worst, pt) => (pt.pm25 > worst.pm25 ? pt : worst),
    upcomingPoints[0]
  );
}

/**
 * Finds the cleanest contiguous 2-hour dispersion window across upcoming hours.
 */
function findOptimalVentilationWindow(upcomingPoints: Omit<HourlyAirPoint, 'isInSafeWindow'>[]): {
  bestStartIdx: number;
  bestAvgPm25: number;
  bestAvgWind: number;
} {
  let bestStartIdx = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestAvgPm25 = 0;
  let bestAvgWind = 0;

  for (let h = 0; h <= DISPERSION_CONFIG.LAST_WINDOW_START_INDEX; h++) {
    const avgPm25 = (upcomingPoints[h].pm25 + upcomingPoints[h + 1].pm25) / 2;
    const avgWind = (upcomingPoints[h].windSpeedKmh + upcomingPoints[h + 1].windSpeedKmh) / 2;
    const dispersionBonus = Math.min(
      avgWind * DISPERSION_CONFIG.WIND_BONUS_MULTIPLIER,
      DISPERSION_CONFIG.MAX_DISPERSION_BONUS
    );
    const score = avgPm25 - dispersionBonus;

    if (score < bestScore) {
      bestScore = score;
      bestStartIdx = h;
      bestAvgPm25 = Math.round(avgPm25);
      bestAvgWind = Math.round(avgWind * 10) / 10;
    }
  }

  return { bestStartIdx, bestAvgPm25, bestAvgWind };
}

/**
 * Classifies the upcoming 24-hour forecast into one of 3 scientific ventilation status tiers.
 */
function classifyVentilationTier(params: {
  maxUpcomingPm25: number;
  bestAvgPm25: number;
  bestAvgWind: number;
  bestStartIdx: number;
  currentPm25: number;
  windowLabel: string;
  worstHourLabel: string;
}): {
  statusType: VentilationStatusType;
  statusHeadline: string;
  statusSubtext: string;
} {
  const {
    maxUpcomingPm25,
    bestAvgPm25,
    bestAvgWind,
    bestStartIdx,
    currentPm25,
    windowLabel,
    worstHourLabel,
  } = params;

  if (maxUpcomingPm25 <= PM25_THRESHOLDS.CLEAN_AIR_MAX) {
    return {
      statusType: 'open_now',
      statusHeadline: 'Clean Air — Safe to Ventilate Anytime',
      statusSubtext: `Ambient PM2.5 stays well below unhealthy levels (maximum ${maxUpcomingPm25} µg/m³ throughout the upcoming 24 hours, meeting WHO clean air guidelines), so natural cross-ventilation is safe day and night. The single cleanest 2-hour peak-dispersion window for deep airing out is ${windowLabel} (projected ${bestAvgPm25} µg/m³ with ${bestAvgWind} km/h dispersion winds).`,
    };
  }
  if (bestAvgPm25 > PM25_THRESHOLDS.SEVERE_SMOG_MIN) {
    return {
      statusType: 'keep_sealed',
      statusHeadline: 'Severe Smog — Keep Windows Sealed',
      statusSubtext: `Even the cleanest upcoming 2-hour window averages ${bestAvgPm25} µg/m³ (exceeding the 150 µg/m³ safety ceiling). Keep windows sealed, run active indoor air filtration, and seal door gaps. Lowest pollution window is ${windowLabel} if brief air exchange is needed.`,
    };
  }
  if (bestStartIdx === 0 && currentPm25 <= PM25_THRESHOLDS.OPEN_WINDOWS_NOW_MAX) {
    return {
      statusType: 'open_now',
      statusHeadline: 'Open Windows Now',
      statusSubtext: `Current PM2.5 is ${currentPm25} µg/m³ with ${bestAvgWind} km/h dispersion winds. Cross-ventilate now before upcoming peak hours (${maxUpcomingPm25} µg/m³ at ${worstHourLabel}) trap stagnant pollution.`,
    };
  }
  return {
    statusType: 'wait_until',
    statusHeadline: `Best Upcoming Window: ${windowLabel}`,
    statusSubtext: `Keep windows closed during upcoming peak hours (${maxUpcomingPm25} µg/m³ at ${worstHourLabel}) and ventilate during ${windowLabel} when air dispersion is strongest (averaging ${bestAvgPm25} µg/m³).`,
  };
}

/**
 * Calculates the best 2-hour Safe Ventilation Window among the UPCOMING 24 consecutive hours
 * starting from the user's current local hour (Now), so past hours are never analyzed or displayed.
 *
 * Evaluates 3 scientifically accurate status tiers:
 * - Tier 1: Clean Air All Day (max upcoming PM2.5 <= 25 µg/m³)
 * - Tier 2: Smog Peaks Present (max upcoming PM2.5 26..150 µg/m³)
 * - Tier 3: Severe Smog (cleanest upcoming 2-hour window > 150 µg/m³)
 */
export function calculateSafeVentilationWindow(
  hourlyPoints: Omit<HourlyAirPoint, 'isInSafeWindow'>[],
  currentHour24: number
): {
  windowInfo: SafeVentilationWindow;
  annotatedPoints: HourlyAirPoint[];
} {
  validateHourlyPointsInput(hourlyPoints);

  const hoursCount = DISPERSION_CONFIG.HOURS_PER_FORECAST;
  const normalizedCurrentHour = Number.isFinite(currentHour24)
    ? ((Math.trunc(currentHour24) % hoursCount) + hoursCount) % hoursCount
    : DISPERSION_CONFIG.DEFAULT_FALLBACK_HOUR;

  const upcomingPoints = sliceUpcoming24Hours(hourlyPoints, normalizedCurrentHour);
  const worstPoint = findWorstUpcomingPoint(upcomingPoints);
  const { bestStartIdx, bestAvgPm25, bestAvgWind } = findOptimalVentilationWindow(upcomingPoints);

  const startHourOfWindow = (normalizedCurrentHour + bestStartIdx) % hoursCount;
  const endHourOfWindow = (normalizedCurrentHour + bestStartIdx + 2) % hoursCount;
  const startTimeLabel = bestStartIdx === 0 ? 'Now' : formatHourLabel(startHourOfWindow, false);
  const windowLabel = `${startTimeLabel} – ${formatHourLabel(endHourOfWindow, false)}`;

  const maxUpcomingPm25 = Math.round(worstPoint.pm25);
  const currentPm25 = Math.round(upcomingPoints[0].pm25);
  const pm25ReductionPctVsPeak =
    worstPoint.pm25 > 0
      ? Math.max(0, Math.round(((worstPoint.pm25 - bestAvgPm25) / worstPoint.pm25) * 100))
      : 0;

  const { statusType, statusHeadline, statusSubtext } = classifyVentilationTier({
    maxUpcomingPm25,
    bestAvgPm25,
    bestAvgWind,
    bestStartIdx,
    currentPm25,
    windowLabel,
    worstHourLabel: worstPoint.label,
  });

  const annotatedPoints: HourlyAirPoint[] = upcomingPoints.map((pt, idx) => ({
    ...pt,
    isInSafeWindow: idx === bestStartIdx || idx === bestStartIdx + 1,
  }));

  return {
    windowInfo: {
      startHour: bestStartIdx,
      endHour: bestStartIdx + 2,
      windowLabel,
      startTimeLabel,
      avgPm25: bestAvgPm25,
      avgWindSpeedKmh: bestAvgWind,
      worstHourLabel: worstPoint.label,
      worstPm25: maxUpcomingPm25,
      worstWindSpeedKmh: Math.round(worstPoint.windSpeedKmh * 10) / 10,
      pm25ReductionPctVsPeak,
      statusType,
      statusHeadline,
      statusSubtext,
    },
    annotatedPoints,
  };
}

/**
 * Generates an explicitly labelled severe-smog simulation curve (340 µg/m³ at 19:00)
 * or an illustrative offline winter smog reference curve when Open-Meteo is unreachable.
 */
export function buildSimulatedOrFallbackHourlyPoints(
  simulateSevereSmog: boolean,
  baseRawPoints?: Omit<HourlyAirPoint, 'isInSafeWindow'>[]
): Omit<HourlyAirPoint, 'isInSafeWindow'>[] {
  const severeCurvePm25 = [
    310, 305, 298, 295, 308, 330, 355, 380, 392, 360, 315, 265, 225, 198, 184, 188, 215, 260, 310,
    340, 365, 372, 350, 328,
  ];
  const severeWindKmh = [
    3.2, 2.8, 2.5, 2.4, 2.6, 3.0, 3.4, 3.8, 4.5, 6.2, 8.4, 10.2, 11.8, 13.4, 14.2, 13.6, 10.5, 7.2,
    5.0, 4.1, 3.6, 3.4, 3.3, 3.1,
  ];
  const severeTempC = [
    9, 8, 8, 7, 7, 8, 9, 11, 13, 16, 18, 20, 21, 22, 22, 21, 19, 16, 14, 13, 12, 11, 10, 9,
  ];

  const moderateFallbackPm25 = [
    118, 112, 106, 102, 108, 124, 142, 156, 148, 122, 96, 74, 58, 48, 44, 46, 62, 88, 110, 128, 138,
    134, 126, 120,
  ];
  const moderateWindKmh = [
    5.4, 5.1, 4.8, 4.6, 5.0, 5.8, 6.5, 7.8, 9.5, 12.0, 14.8, 17.2, 19.4, 21.0, 21.8, 20.5, 16.4,
    12.2, 9.0, 7.6, 6.8, 6.2, 5.9, 5.6,
  ];

  return Array.from({ length: DISPERSION_CONFIG.HOURS_PER_FORECAST }, (_, hour) => {
    const label = formatHourLabel(hour, false);
    const shortLabel = formatHourLabel(hour, true);
    if (simulateSevereSmog) {
      const pm25 = severeCurvePm25[hour];
      return {
        hourIndex: hour,
        timeIso: `2026-11-18T${String(hour).padStart(2, '0')}:00`,
        label,
        shortLabel,
        pm25,
        pm10: Math.round(pm25 * 1.48),
        usAqi: Math.min(500, Math.round(pm25 * 1.15 + 45)),
        windSpeedKmh: severeWindKmh[hour],
        temperatureC: baseRawPoints?.[hour]?.temperatureC ?? severeTempC[hour],
      };
    }

    if (baseRawPoints && baseRawPoints[hour]) {
      return baseRawPoints[hour];
    }

    const pm25 = moderateFallbackPm25[hour];
    return {
      hourIndex: hour,
      timeIso: `2026-11-18T${String(hour).padStart(2, '0')}:00`,
      label,
      shortLabel,
      pm25,
      pm10: Math.round(pm25 * 1.35),
      usAqi: Math.round(pm25 * 1.6),
      windSpeedKmh: moderateWindKmh[hour],
      temperatureC: severeTempC[hour] + 3,
    };
  });
}

/**
 * Defensive payload validator that mirrors `isValidHousehold` in `firestore.rules`
 * and `firebase-blueprint.json` before any Firestore write.
 */
export function validateHouseholdPayload(payload: {
  userId: string;
  city: string;
  citySlug: string;
  latitude: number;
  longitude: number;
  cookingFuel: string;
  commute: string;
  indoorFiltration: string;
  vulnerableMembers: string;
  completedActionsToday: string[];
}): boolean {
  const idRegex = /^[a-zA-Z0-9_-]+$/;
  if (!payload.userId || payload.userId.length > 128 || !idRegex.test(payload.userId)) {
    return false;
  }
  if (!payload.city || payload.city.length > 100) return false;
  if (!payload.citySlug || payload.citySlug.length > 128 || !idRegex.test(payload.citySlug)) {
    return false;
  }
  if (
    typeof payload.latitude !== 'number' ||
    !Number.isFinite(payload.latitude) ||
    payload.latitude < -90 ||
    payload.latitude > 90
  ) {
    return false;
  }
  if (
    typeof payload.longitude !== 'number' ||
    !Number.isFinite(payload.longitude) ||
    payload.longitude < -180 ||
    payload.longitude > 180
  ) {
    return false;
  }
  if (payload.cookingFuel !== 'gas' && payload.cookingFuel !== 'induction') {
    return false;
  }
  if (!['car', 'two_wheeler', 'public_transit', 'wfh'].includes(payload.commute)) {
    return false;
  }
  if (payload.indoorFiltration !== 'has_purifier' && payload.indoorFiltration !== 'no_purifier') {
    return false;
  }
  if (payload.vulnerableMembers !== 'yes' && payload.vulnerableMembers !== 'no') {
    return false;
  }
  if (!Array.isArray(payload.completedActionsToday) || payload.completedActionsToday.length > 10) {
    return false;
  }
  for (const item of payload.completedActionsToday) {
    if (typeof item !== 'string' || item.length < 1 || item.length > 64) {
      return false;
    }
  }
  return true;
}

/**
 * Strips any accidental GPS coordinate strings from public city labels so precise
 * household locations can never leak into public Firestore community documents or tickers.
 */
export function sanitizePublicCityLabel(rawCityName: string): string {
  const trimmed = (rawCityName || '').trim();
  if (!trimmed || /\bGPS\b/i.test(trimmed) || /-?\d{1,3}\.\d+\s*°/.test(trimmed)) {
    return 'Local Urban Air Shed';
  }
  return trimmed.slice(0, 100);
}

/**
 * Formats an anonymized neighborhood ticker line without duplicating the city name
 * and without leaking GPS coordinates or household PII.
 */
export function formatTickerActionLine(cityName: string, rawTickerSummary: string): string {
  const safeCity = sanitizePublicCityLabel(cityName);
  const escapedCity = safeCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cleanedVerb = rawTickerSummary
    .replace(/-?\d{1,3}\.\d+\s*°\s*[NSEW]?/gi, '')
    .replace(new RegExp(`^A (family|household|commuter) in ${escapedCity}\\s+`, 'i'), '')
    .replace(new RegExp(`\\s+in ${escapedCity}[.!]*$`, 'i'), '')
    .replace(/\s+/g, ' ')
    .trim();

  return `A household in ${safeCity} ${cleanedVerb || 'completed a clean-air habit'} • Just now`.slice(
    0,
    220
  );
}
