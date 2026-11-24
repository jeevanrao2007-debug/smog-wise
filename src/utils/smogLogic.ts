import {
  ActionCardData,
  CityLocation,
  HourlyAirPoint,
  LifestyleProfile,
  SafeVentilationWindow,
  VentilationStatusType,
} from '../types';
import {
  calculateHouseholdExposureImpact,
  calculateNeighborhoodEmissionImpact,
  createImpactMethodology,
} from './impactModel';

export const DEFAULT_CITY: CityLocation = {
  name: 'New Delhi',
  country: 'India',
  latitude: 28.6139,
  longitude: 77.209,
  slug: 'new-delhi',
};

export const PRESET_CITIES: CityLocation[] = [
  DEFAULT_CITY,
  {
    name: 'Lahore',
    country: 'Pakistan',
    latitude: 31.5204,
    longitude: 74.3587,
    slug: 'lahore',
  },
  {
    name: 'Beijing',
    country: 'China',
    latitude: 39.9042,
    longitude: 116.4074,
    slug: 'beijing',
  },
  {
    name: 'Milan',
    country: 'Italy',
    latitude: 45.4642,
    longitude: 9.19,
    slug: 'milan',
  },
  {
    name: 'San Francisco',
    country: 'United States',
    latitude: 37.7749,
    longitude: -122.4194,
    slug: 'san-francisco',
  },
];

export function toCitySlug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return cleaned || 'unknown-city';
}

export function formatHourLabel(hour24: number, short = false): string {
  const safeHour = Number.isFinite(hour24) ? Math.trunc(hour24) : 0;
  const normalized = ((safeHour % 24) + 24) % 24;
  const period = normalized >= 12 ? 'PM' : 'AM';
  const hour12 = normalized % 12 === 0 ? 12 : normalized % 12;
  return short ? `${hour12} ${period}` : `${hour12}:00 ${period}`;
}

/**
 * Calculates the best 2-hour Safe Ventilation Window among the UPCOMING 24 consecutive hours
 * starting from the user's current local hour (Now), so past hours are never analyzed or displayed.
 *
 * Balances lowest average PM2.5 and strongest wind dispersion (wind_speed_10m).
 * Evaluates 3 scientifically accurate status tiers:
 * - Tier 1: Clean Air All Day (max upcoming PM2.5 <= 25 µg/m³) -> "Clean Air — Safe to Ventilate Anytime"
 * - Tier 2: Smog Peaks Present (max upcoming PM2.5 26..150 µg/m³) -> "Open Windows Now" if Now is in cleanest window and <= 60, else "Best Upcoming Window"
 * - Tier 3: Severe Smog (cleanest upcoming 2-hour window > 150 µg/m³) -> "Severe Smog — Keep Windows Sealed"
 *
 * Throws explicitly on incomplete (<24h) or invalid (NaN/Infinity/negative) PM2.5 or wind inputs.
 */
export function calculateSafeVentilationWindow(
  hourlyPoints: Omit<HourlyAirPoint, 'isInSafeWindow'>[],
  currentHour24: number
): {
  windowInfo: SafeVentilationWindow;
  annotatedPoints: HourlyAirPoint[];
} {
  if (!Array.isArray(hourlyPoints) || hourlyPoints.length < 24) {
    throw new Error('Expected 24 hourly air quality points');
  }

  for (let i = 0; i < hourlyPoints.length; i++) {
    const pt = hourlyPoints[i];
    if (
      !pt ||
      typeof pt.pm25 !== 'number' ||
      !Number.isFinite(pt.pm25) ||
      pt.pm25 < 0 ||
      pt.pm25 > 5000
    ) {
      throw new Error(`Invalid PM2.5 reading at hour ${i}`);
    }
    if (
      typeof pt.windSpeedKmh !== 'number' ||
      !Number.isFinite(pt.windSpeedKmh) ||
      pt.windSpeedKmh < 0 ||
      pt.windSpeedKmh > 400
    ) {
      throw new Error(`Invalid wind speed reading at hour ${i}`);
    }
  }

  const normalizedCurrentHour = Number.isFinite(currentHour24)
    ? ((Math.trunc(currentHour24) % 24) + 24) % 24
    : 10;

  // Slice the next 24 consecutive upcoming hours starting at current local hour (Now)
  const upcomingPoints: Omit<HourlyAirPoint, 'isInSafeWindow'>[] = [];
  for (let i = 0; i < 24; i++) {
    const sourceIndex = (normalizedCurrentHour + i) % hourlyPoints.length;
    const pt = hourlyPoints[sourceIndex];
    const hourOfDay = (normalizedCurrentHour + i) % 24;
    upcomingPoints.push({
      ...pt,
      hourIndex: i, // 0 is Now, 1 is Now + 1h, etc.
      label: i === 0 ? `Now (${formatHourLabel(hourOfDay, false)})` : formatHourLabel(hourOfDay, false),
      shortLabel: i === 0 ? 'Now' : formatHourLabel(hourOfDay, true),
    });
  }

  // Find worst peak hour across the upcoming 24 consecutive hours
  let worstPoint = upcomingPoints[0];
  for (const pt of upcomingPoints) {
    if (pt.pm25 > worstPoint.pm25) {
      worstPoint = pt;
    }
  }

  // Find the single cleanest contiguous 2-hour window among upcoming hours (minimizing PM2.5 with wind dispersion bonus)
  let bestStartIdx = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestAvgPm25 = 0;
  let bestAvgWind = 0;

  for (let h = 0; h <= 22; h++) {
    const h1 = upcomingPoints[h];
    const h2 = upcomingPoints[h + 1];
    const avgPm25 = (h1.pm25 + h2.pm25) / 2;
    const avgWind = (h1.windSpeedKmh + h2.windSpeedKmh) / 2;

    // Dispersion score: lower PM2.5 is primary, stronger wind dispersion reduces stagnation
    const dispersionBonus = Math.min(avgWind * 1.35, 35);
    const score = avgPm25 - dispersionBonus;

    if (score < bestScore) {
      bestScore = score;
      bestStartIdx = h;
      bestAvgPm25 = Math.round(avgPm25);
      bestAvgWind = Math.round(avgWind * 10) / 10;
    }
  }

  const startHourOfWindow = (normalizedCurrentHour + bestStartIdx) % 24;
  const endHourOfWindow = (normalizedCurrentHour + bestStartIdx + 2) % 24;
  const startTimeLabel = bestStartIdx === 0 ? 'Now' : formatHourLabel(startHourOfWindow, false);
  const endTimeLabel = formatHourLabel(endHourOfWindow, false);
  const windowLabel = `${startTimeLabel} – ${endTimeLabel}`;

  const maxUpcomingPm25 = Math.round(worstPoint.pm25);
  const currentPm25 = Math.round(upcomingPoints[0].pm25);

  const pm25ReductionPctVsPeak =
    worstPoint.pm25 > 0
      ? Math.max(
          0,
          Math.round(((worstPoint.pm25 - bestAvgPm25) / worstPoint.pm25) * 100)
        )
      : 0;

  let statusType: VentilationStatusType;
  let statusHeadline: string;
  let statusSubtext: string;

  if (maxUpcomingPm25 <= 25) {
    // Tier 1 — Clean Air All Day (max upcoming PM2.5 <= 25 µg/m³)
    statusType = 'open_now';
    statusHeadline = 'Clean Air — Safe to Ventilate Anytime';
    statusSubtext = `Ambient PM2.5 stays well below unhealthy levels (maximum ${maxUpcomingPm25} µg/m³ throughout the upcoming 24 hours, meeting WHO clean air guidelines), so natural cross-ventilation is safe day and night. The single cleanest 2-hour peak-dispersion window for deep airing out is ${windowLabel} (projected ${bestAvgPm25} µg/m³ with ${bestAvgWind} km/h dispersion winds).`;
  } else if (bestAvgPm25 > 150) {
    // Tier 3 — Severe Winter Smog (cleanest upcoming 2-hour window > 150 µg/m³)
    statusType = 'keep_sealed';
    statusHeadline = 'Severe Smog — Keep Windows Sealed';
    statusSubtext = `Even the cleanest upcoming 2-hour window averages ${bestAvgPm25} µg/m³ (exceeding the 150 µg/m³ safety ceiling). Keep windows sealed, run active indoor air filtration, and seal door gaps. Lowest pollution window is ${windowLabel} if brief air exchange is needed.`;
  } else if (bestStartIdx === 0 && currentPm25 <= 60) {
    // Tier 2 — Smog Peaks Present: Now is inside cleanest window & current PM2.5 <= 60
    statusType = 'open_now';
    statusHeadline = 'Open Windows Now';
    statusSubtext = `Current PM2.5 is ${currentPm25} µg/m³ with ${bestAvgWind} km/h dispersion winds. Cross-ventilate now before upcoming peak hours (${maxUpcomingPm25} µg/m³ at ${worstPoint.label}) trap stagnant pollution.`;
  } else {
    // Tier 2 — Smog Peaks Present: Advise waiting for the specific upcoming window
    statusType = 'wait_until';
    statusHeadline = `Best Upcoming Window: ${windowLabel}`;
    statusSubtext = `Keep windows closed during upcoming peak hours (${maxUpcomingPm25} µg/m³ at ${worstPoint.label}) and ventilate during ${windowLabel} when air dispersion is strongest (averaging ${bestAvgPm25} µg/m³).`;
  }

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
 * Generates an explicitly labelled severe-smog simulation curve (340 µg/m³ at 19:00,
 * afternoon dip >180 µg/m³ triggering "Keep Sealed Today — Severe Smog") or an
 * illustrative offline winter smog reference curve when Open-Meteo is unreachable.
 */
export function buildSimulatedOrFallbackHourlyPoints(
  simulateSevereSmog: boolean,
  baseRawPoints?: Omit<HourlyAirPoint, 'isInSafeWindow'>[]
): Omit<HourlyAirPoint, 'isInSafeWindow'>[] {
  const severeCurvePm25 = [
    310, 305, 298, 295, 308, 330, 355, 380, 392, 360, 315, 265, 225, 198, 184,
    188, 215, 260, 310, 340, 365, 372, 350, 328,
  ];
  const severeWindKmh = [
    3.2, 2.8, 2.5, 2.4, 2.6, 3.0, 3.4, 3.8, 4.5, 6.2, 8.4, 10.2, 11.8, 13.4,
    14.2, 13.6, 10.5, 7.2, 5.0, 4.1, 3.6, 3.4, 3.3, 3.1,
  ];
  const severeTempC = [
    9, 8, 8, 7, 7, 8, 9, 11, 13, 16, 18, 20, 21, 22, 22, 21, 19, 16, 14, 13,
    12, 11, 10, 9,
  ];

  const moderateFallbackPm25 = [
    118, 112, 106, 102, 108, 124, 142, 156, 148, 122, 96, 74, 58, 48, 44, 46,
    62, 88, 110, 128, 138, 134, 126, 120,
  ];
  const moderateWindKmh = [
    5.4, 5.1, 4.8, 4.6, 5.0, 5.8, 6.5, 7.8, 9.5, 12.0, 14.8, 17.2, 19.4, 21.0,
    21.8, 20.5, 16.4, 12.2, 9.0, 7.6, 6.8, 6.2, 5.9, 5.6,
  ];

  return Array.from({ length: 24 }, (_, hour) => {
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
 * Generates 3 tailored, transparent, modelled Action Cards for the given city,
 * current PM2.5, Safe Ventilation Window, and 4 Family Lifestyle toggles.
 * Every numeric impact flows through `impactModel.ts` with explicit formulas,
 * assumptions, and uncertainty disclosures.
 */
export function buildTailoredActionCards(params: {
  city: string;
  currentPm25: number;
  safeWindow: SafeVentilationWindow;
  profile: LifestyleProfile;
}): ActionCardData[] {
  const { city, currentPm25, safeWindow, profile } = params;
  const isSevere =
    currentPm25 >= 150 || safeWindow.statusType === 'keep_sealed';

  // 1. Low-Emission Daily Routine
  let routineTitle = '';
  let routineInstruction = '';
  let routineRedPct = 24;
  let routineWeight = 0.65;
  let routineCo2 = 0.8;
  let routineNox = 3.2;
  let routineTicker = '';
  let routineRationale = '';
  let routineAssumptions = '';
  let routinePollutants: string[] = ['PM2.5', 'NOx', 'CO2'];

  if (profile.commute === 'two_wheeler') {
    routineTitle = isSevere
      ? `Shift Two-Wheeler Errands to ${safeWindow.windowLabel} & Limit Peak Exposure`
      : `Time Two-Wheeler Commutes Around the ${safeWindow.windowLabel} Dispersion Window`;
    routineInstruction = `Avoid riding during the ${safeWindow.worstHourLabel} thermal inversion peak (${safeWindow.worstPm25} µg/m³), and consider a well-fitted N95/FFP2 mask when outdoor PM2.5 is elevated. Consolidate essential local errands into ${safeWindow.windowLabel} when ${safeWindow.avgWindSpeedKmh} km/h winds reduce outdoor particulate levels by ${safeWindow.pm25ReductionPctVsPeak}%.`;
    routineRedPct = isSevere ? 40 : 30;
    routineWeight = 0.7;
    routineCo2 = 0.6;
    routineNox = 4.5;
    routineTicker = 'shifted a two-wheeler commute out of peak smog';
    routineRationale = `Selected because your commute is Two-Wheeler and ${city}'s worst peak reaches ${safeWindow.worstPm25} µg/m³ at ${safeWindow.worstHourLabel}.`;
    routineAssumptions =
      'Assumes 1–2 short peak-hour trips (~4 km total) shifted or batched into the afternoon dispersion window (~0.15 kg CO2/km and ~1.1 g NOx/km urban two-wheeler factors).';
  } else if (profile.commute === 'car') {
    routineTitle = `Use Cabin Recirculation & Shift Trips to ${safeWindow.windowLabel}`;
    routineInstruction = `Switch your car HVAC to cabin recirculation before entering congested corridors near ${safeWindow.worstHourLabel} (${safeWindow.worstPm25} µg/m³) to limit in-cabin tailpipe infiltration. Combine school drop-offs or errands into ${safeWindow.windowLabel} when outdoor PM2.5 is projected around ${safeWindow.avgPm25} µg/m³.`;
    routineRedPct = isSevere ? 35 : 26;
    routineWeight = 0.65;
    routineCo2 = 1.4;
    routineNox = 5.2;
    routineTicker = 'used cabin air recirculation & batched car errands';
    routineRationale = `Selected because your primary commute is Car and ${city} shows a ${safeWindow.pm25ReductionPctVsPeak}% afternoon dispersion drop vs. peak.`;
    routineAssumptions =
      'Assumes ~3.5 km of peak-traffic stop-start driving consolidated into one warm-engine loop (~0.40 kg CO2/km urban congestion factor, ~1.5 g NOx/km cold-start average).';
  } else if (profile.commute === 'public_transit') {
    routineTitle = isSevere
      ? `Avoid Peak Platform Idling & Keep Outdoor Walks Brief Today`
      : `Time Transit Transfers & Outdoor Walks for ${safeWindow.windowLabel}`;
    routineInstruction = isSevere
      ? `Outdoor PM2.5 in ${city} is severe (${currentPm25} µg/m³); skip strenuous outdoor exercise and stand away from bus exhaust lanes while waiting at stops. Plan any essential outdoor walking around ${safeWindow.windowLabel} (${safeWindow.avgPm25} µg/m³) when dispersion is highest.`
      : `Stand upwind of idling bus bays during the ${safeWindow.worstHourLabel} spike (${safeWindow.worstPm25} µg/m³) and wear a fitted N95/FFP2 mask on crowded corridors. Shift brisk walking or outdoor errands to ${safeWindow.windowLabel} when wind speeds reach ${safeWindow.avgWindSpeedKmh} km/h.`;
    routineRedPct = isSevere ? 36 : 27;
    routineWeight = 0.65;
    routineCo2 = 1.8;
    routineNox = 6.0;
    routineTicker = 'timed public transit travel around peak dispersion hours';
    routineRationale = `Selected for Public Transit commuters in ${city} to reduce street-level exhaust exposure while avoiding private car displacement.`;
    routineAssumptions =
      'Assumes choosing transit over an equivalent ~7 km single-occupancy urban car commute (~0.26 kg CO2/km net savings) plus avoiding peak roadside waiting.';
  } else {
    routineTitle = isSevere
      ? `Keep Windows Sealed & Postpone Outdoor Exercise During Severe Smog`
      : `Align Brief Ventilation & Outdoor Walks With ${safeWindow.windowLabel}`;
    routineInstruction = isSevere
      ? `Because even ${city}'s cleanest afternoon window averages ${safeWindow.avgPm25} µg/m³ (>150 µg/m³), keep exterior doors and windows closed and move exercise indoors today. Avoid running unnecessary delivery trips during the ${safeWindow.worstHourLabel} peak (${safeWindow.worstPm25} µg/m³).`
      : `Keep exterior windows shut during the ${safeWindow.worstHourLabel} smog peak (${safeWindow.worstPm25} µg/m³) while working from home. Schedule outdoor walks and a 15–20 minute cross-ventilation flush strictly inside ${safeWindow.windowLabel} (${safeWindow.avgPm25} µg/m³).`;
    routineRedPct = isSevere ? 32 : 24;
    routineWeight = 0.65;
    routineCo2 = 0.5;
    routineNox = 2.1;
    routineTicker = `aligned home ventilation with ${safeWindow.windowLabel}`;
    routineRationale = `Selected for Work From Home households in ${city} based on today's ${safeWindow.windowLabel} boundary-layer window.`;
    routineAssumptions =
      'Assumes avoiding peak-hour window opening (cutting indoor infiltration ratio by ~24–32%) and batching 1 local vehicle delivery (~2 km).';
    routinePollutants = ['PM2.5', 'PM10', 'CO2'];
  }

  const routineHealth = calculateHouseholdExposureImpact({
    ambientPm25: currentPm25,
    reductionPercent: routineRedPct,
    exposureWeight: routineWeight,
    scopeLabel: 'daily PM2.5 exposure',
  });
  const routineEmission = calculateNeighborhoodEmissionImpact({
    city,
    co2Kg: routineCo2,
    noxGrams: routineNox,
  });

  // 2. Indoor Air Quality Hack
  let hackTitle = '';
  let hackInstruction = '';
  let hackRedPct = 35;
  let hackWeight = 0.75;
  let hackCo2 = 0.3;
  let hackNox = 1.9;
  let hackTicker = '';
  let hackRationale = '';
  let hackAssumptions = '';

  const hasKidsOrSeniors = profile.vulnerableMembers === 'yes';
  const vulnerablePhrase = hasKidsOrSeniors
    ? 'kids and seniors'
    : 'household members';

  if (profile.indoorFiltration === 'has_purifier') {
    if (profile.cookingFuel === 'gas') {
      hackTitle = `Run HEPA Clean Room & Balance Kitchen Exhaust Makeup Air`;
      hackInstruction = `Operate your HEPA air purifier in the primary room used by ${vulnerablePhrase} with closed interior doors and towel-sealed door gaps to slow smog infiltration. When running a kitchen exhaust hood over your gas stove during ${currentPm25} µg/m³ smog, crack only the nearest kitchen window 2 cm so negative pressure does not pull raw outdoor air through bedroom gaps.`;
      hackRedPct = isSevere ? 52 : 42;
      hackAssumptions =
        'Assumes a properly sized true-HEPA purifier (CADR >= room volume × 3 ACH) running continuously in a closed room while avoiding whole-home depressurization.';
    } else {
      hackTitle = `Stage HEPA Purifier Clear of Walls & Wet-Mop Settled Dust`;
      hackInstruction = `Keep your air purifier at least 45 cm from walls in the living or sleeping room used by ${vulnerablePhrase}, and seal drafty exterior door thresholds with a rolled damp towel. Use damp microfiber mopping instead of dry brooms today so settled outdoor PM2.5 (${currentPm25} µg/m³ outside) is not resuspended indoors.`;
      hackRedPct = isSevere ? 55 : 44;
      hackAssumptions =
        'Assumes continuous HEPA circulation (3–4 air changes/hour) combined with zero dry-sweeping resuspension and reduced door-gap leakage.';
    }
    hackCo2 = 0.3;
    hackNox = 1.9;
    hackTicker = 'optimized HEPA clean-room airflow & sealed door drafts';
    hackRationale = `Tailored for households with an Air Purifier (${profile.cookingFuel === 'gas' ? 'Gas Stove' : 'Induction'}) and ${hasKidsOrSeniors ? 'kids/seniors at home' : 'standard occupancy'}.`;
  } else {
    hackTitle = `Wet-Mop Floors, Seal Drafts & Avoid Prolonged Exhaust Fan Pull`;
    hackInstruction = `Skip dry brooms, incense, and candles today—wipe hard floors and sills with a damp cloth to capture settled particles around ${vulnerablePhrase}. Seal drafty exterior door gaps with damp towels and keep bathroom/kitchen exhaust runtime minimal while outdoor PM2.5 is ${currentPm25} µg/m³ to reduce unfiltered smog infiltration.`;
    hackRedPct = isSevere ? 32 : 24;
    hackWeight = 0.7;
    hackCo2 = 0.4;
    hackNox = 2.4;
    hackTicker = 'switched to wet-mopping & sealed draft infiltration';
    hackRationale = `Tailored for households with No Air Purifier during ${currentPm25} µg/m³ smog in ${city} to limit indoor particle sources and infiltration without specialized equipment.`;
    hackAssumptions =
      'Assumes eliminating indoor resuspension/smoke sources and reducing passive draft infiltration; note that sealing without HEPA filtration provides smaller reductions than active mechanical filtration.';
  }

  const hackHealth = calculateHouseholdExposureImpact({
    ambientPm25: currentPm25,
    reductionPercent: hackRedPct,
    exposureWeight: hackWeight,
    scopeLabel: 'indoor PM2.5 exposure',
  });
  const hackEmission = calculateNeighborhoodEmissionImpact({
    city,
    co2Kg: hackCo2,
    noxGrams: hackNox,
  });

  // 3. Sustainable Alternative
  let swapTitle = '';
  let swapInstruction = '';
  let swapRedPct = 20;
  let swapWeight = 0.5;
  let swapCo2 = 1.2;
  let swapNox = 4.4;
  let swapTicker = '';
  let swapRationale = '';
  let swapAssumptions = '';
  let swapPollutants: string[] = ['PM2.5', 'NO2', 'CO2'];

  if (
    profile.cookingFuel === 'gas' &&
    (profile.commute === 'wfh' || profile.commute === 'public_transit')
  ) {
    swapTitle = `Pre-Boil Water in an Electric Kettle & Cover Pots on Your Gas Stove`;
    swapInstruction = `Heat water in an electric kettle or microwave before moving to your gas burner, and keep tight lids on simmering pots to reduce open-flame runtime by roughly 40%. This lowers indoor NO2 and ultrafine cooking particulates while cutting local combustion emissions in ${city}.`;
    swapRedPct = 22;
    swapCo2 = 0.9;
    swapNox = 4.8;
    swapTicker = 'cut gas burner runtime using an electric kettle & pot lids';
    swapRationale = `Selected because your household cooks with a Gas Stove—gas flames emit indoor NO2 and ultrafine particles during sealed-window smog days.`;
    swapAssumptions =
      'Assumes replacing ~20 minutes/day of medium-high LPG/natural gas burner runtime with covered simmering and electric pre-heating (~0.9 kg CO2 and ~4.8 g NOx avoided).';
  } else if (profile.commute === 'car') {
    swapTitle = `Bundle Short Car Trips (<3 km) or Swap One Hop to Transit`;
    swapInstruction = `Cold engines and catalytic converters emit elevated NOx and PM2.5 during the first 3 km of driving—combine separate errands into one warm-engine loop during ${safeWindow.windowLabel} or take metro/bus for one hop. Avoid walking/cycling on busy roads while PM2.5 exceeds 150 µg/m³.`;
    swapRedPct = 21;
    swapCo2 = 1.6;
    swapNox = 6.2;
    swapTicker = 'skipped a cold-start short car trip';
    swapRationale = `Selected for Car commuters because eliminating a cold-start short urban trip cuts disproportionate local NOx (a secondary PM2.5 precursor) in ${city}.`;
    swapAssumptions =
      'Assumes replacing or eliminating one ~4 km cold-start petrol urban trip (~0.40 kg CO2/km + cold-start enrichment -> ~1.6 kg CO2, ~6.2 g NOx).';
    swapPollutants = ['PM2.5', 'NOx', 'CO2'];
  } else if (profile.commute === 'two_wheeler') {
    swapTitle = `Switch Off Engine at Signals >20s & Batch Local Errands`;
    swapInstruction = `Turn off your two-wheeler engine at red lights lasting over 20 seconds and batch neighborhood trips into a single continuous route during ${safeWindow.windowLabel}. At home, favor covered pressure-cooking or electric kettle pre-heating over long open-flame boiling.`;
    swapRedPct = 23;
    swapCo2 = 1.1;
    swapNox = 5.1;
    swapTicker = 'eliminated signal idling & batched two-wheeler errands';
    swapRationale = `Selected for Two-Wheeler riders in ${city} to reduce street-level idling exhaust and cold-start fuel waste.`;
    swapAssumptions =
      'Assumes cutting ~10 minutes of traffic signal idling plus consolidating ~3 km of detour errands (~1.1 kg CO2, ~5.1 g NOx).';
    swapPollutants = ['PM2.5', 'NOx', 'CO2'];
  } else {
    swapTitle = `Batch Cooking With Tight Lids & Avoid High-Smoke Oil Frying`;
    swapInstruction = `Use a lid, steamer, or pressure cooker on your induction/electric cooktop instead of high-temperature pan frying today to sharply cut indoor cooking aerosols. Consolidate household deliveries to minimize local street-level exhaust and dust resuspension in ${city}.`;
    swapRedPct = 24;
    swapCo2 = 1.1;
    swapNox = 3.6;
    swapTicker = 'switched to covered low-aerosol cooking';
    swapRationale = `Selected for Induction/Electric households to prevent indoor cooking-oil PM2.5 spikes when exterior windows must stay closed.`;
    swapAssumptions =
      'Assumes substituting one high-heat oil-frying meal with covered steaming/pressure cooking plus consolidating 1 local delivery trip (~1.1 kg CO2, ~3.6 g NOx).';
    swapPollutants = ['PM2.5', 'VOCs', 'CO2'];
  }

  const swapHealth = calculateHouseholdExposureImpact({
    ambientPm25: currentPm25,
    reductionPercent: swapRedPct,
    exposureWeight: swapWeight,
    scopeLabel: 'kitchen & street PM2.5',
  });
  const swapEmission = calculateNeighborhoodEmissionImpact({
    city,
    co2Kg: swapCo2,
    noxGrams: swapNox,
  });

  return [
    {
      id: 'routine',
      categoryLabel: 'Low-Emission Daily Routine',
      title: routineTitle,
      instruction: routineInstruction,
      familyHealthImpact: {
        pm25ReductionPercent: routineHealth.pm25ReductionPercent,
        passiveCigarettesAvoided: routineHealth.passiveCigarettesAvoided,
        summaryText: routineHealth.summaryText,
      },
      neighborhoodEmissionImpact: {
        co2AvoidedKg: routineEmission.co2AvoidedKg,
        noxAvoidedGrams: routineEmission.noxAvoidedGrams,
        summaryText: routineEmission.summaryText,
      },
      impactMethodology: createImpactMethodology({
        rationale: routineRationale,
        targetPollutants: routinePollutants,
        formulaSummary: `Avoided PM2.5 = ${currentPm25} µg/m³ × ${routineHealth.pm25ReductionPercent}% × ${routineWeight} exposure share = ~${routineHealth.avoidedPm25UgM3} µg/m³; illustrative cigarette benchmark = avoided PM2.5 ÷ 22 µg/m³ (Berkeley Earth).`,
        assumptions: routineAssumptions,
      }),
      tickerSummary: routineTicker,
    },
    {
      id: 'indoor_hack',
      categoryLabel: 'Indoor Air Quality Hack',
      title: hackTitle,
      instruction: hackInstruction,
      familyHealthImpact: {
        pm25ReductionPercent: hackHealth.pm25ReductionPercent,
        passiveCigarettesAvoided: hackHealth.passiveCigarettesAvoided,
        summaryText: hackHealth.summaryText,
      },
      neighborhoodEmissionImpact: {
        co2AvoidedKg: hackEmission.co2AvoidedKg,
        noxAvoidedGrams: hackEmission.noxAvoidedGrams,
        summaryText: hackEmission.summaryText,
      },
      impactMethodology: createImpactMethodology({
        rationale: hackRationale,
        targetPollutants:
          profile.cookingFuel === 'gas'
            ? ['PM2.5', 'NO2', 'Ultrafine Particles']
            : ['PM2.5', 'PM10'],
        formulaSummary: `Avoided indoor PM2.5 = ${currentPm25} µg/m³ × ${hackHealth.pm25ReductionPercent}% × ${hackWeight} indoor time share = ~${hackHealth.avoidedPm25UgM3} µg/m³; benchmark ÷ 22 µg/m³.`,
        assumptions: hackAssumptions,
      }),
      tickerSummary: hackTicker,
    },
    {
      id: 'sustainable_swap',
      categoryLabel: 'Sustainable Alternative',
      title: swapTitle,
      instruction: swapInstruction,
      familyHealthImpact: {
        pm25ReductionPercent: swapHealth.pm25ReductionPercent,
        passiveCigarettesAvoided: swapHealth.passiveCigarettesAvoided,
        summaryText: swapHealth.summaryText,
      },
      neighborhoodEmissionImpact: {
        co2AvoidedKg: swapEmission.co2AvoidedKg,
        noxAvoidedGrams: swapEmission.noxAvoidedGrams,
        summaryText: swapEmission.summaryText,
      },
      impactMethodology: createImpactMethodology({
        rationale: swapRationale,
        targetPollutants: swapPollutants,
        formulaSummary: `Avoided PM2.5 = ${currentPm25} µg/m³ × ${swapHealth.pm25ReductionPercent}% × ${swapWeight} activity share = ~${swapHealth.avoidedPm25UgM3} µg/m³; emission factors per urban activity unit.`,
        assumptions: swapAssumptions,
      }),
      tickerSummary: swapTicker,
    },
  ];
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
  const idRegex = /^[a-zA-Z0-9_\-]+$/;
  if (
    !payload.userId ||
    payload.userId.length > 128 ||
    !idRegex.test(payload.userId)
  ) {
    return false;
  }
  if (!payload.city || payload.city.length > 100) return false;
  if (
    !payload.citySlug ||
    payload.citySlug.length > 128 ||
    !idRegex.test(payload.citySlug)
  ) {
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
  if (
    !['car', 'two_wheeler', 'public_transit', 'wfh'].includes(payload.commute)
  ) {
    return false;
  }
  if (
    payload.indoorFiltration !== 'has_purifier' &&
    payload.indoorFiltration !== 'no_purifier'
  ) {
    return false;
  }
  if (
    payload.vulnerableMembers !== 'yes' &&
    payload.vulnerableMembers !== 'no'
  ) {
    return false;
  }
  if (
    !Array.isArray(payload.completedActionsToday) ||
    payload.completedActionsToday.length > 10
  ) {
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
  if (
    !trimmed ||
    /\bGPS\b/i.test(trimmed) ||
    /-?\d{1,3}\.\d+\s*°/.test(trimmed)
  ) {
    return 'Local Urban Air Shed';
  }
  return trimmed.slice(0, 100);
}

/**
 * Formats an anonymized neighborhood ticker line without duplicating the city name
 * and without leaking GPS coordinates or household PII.
 */
export function formatTickerActionLine(
  cityName: string,
  rawTickerSummary: string
): string {
  const safeCity = sanitizePublicCityLabel(cityName);
  const escapedCity = safeCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cleanedVerb = rawTickerSummary
    .replace(/-?\d{1,3}\.\d+\s*°\s*[NSEW]?/gi, '')
    .replace(
      new RegExp(`^A (family|household|commuter) in ${escapedCity}\\s+`, 'i'),
      ''
    )
    .replace(new RegExp(`\\s+in ${escapedCity}[.!]*$`, 'i'), '')
    .replace(/\s+/g, ' ')
    .trim();

  return `A household in ${safeCity} ${cleanedVerb || 'completed a clean-air habit'} • Just now`.slice(
    0,
    220
  );
}
