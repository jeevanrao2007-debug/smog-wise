import { PM25_THRESHOLDS } from '../constants';
import {
  ActionCardData,
  LifestyleProfile,
  SafeVentilationWindow,
} from '../types';
import {
  calculateHouseholdExposureImpact,
  calculateNeighborhoodEmissionImpact,
  createImpactMethodology,
} from './impactModel';

interface CardDraftParams {
  city: string;
  currentPm25: number;
  safeWindow: SafeVentilationWindow;
  profile: LifestyleProfile;
  isSevere: boolean;
}

/**
 * Builds Card 1: Low-Emission Daily Routine tailored to household commute mode.
 */
function buildRoutineCard({
  city,
  currentPm25,
  safeWindow,
  profile,
}: CardDraftParams): ActionCardData {
  const isSevere =
    currentPm25 >= PM25_THRESHOLDS.SEVERE_SMOG_MIN ||
    safeWindow.statusType === 'keep_sealed';

  let title = '';
  let instruction = '';
  let reductionPercent = 24;
  const exposureWeight = profile.commute === 'two_wheeler' ? 0.7 : 0.65;
  let co2Kg = 0.8;
  let noxGrams = 3.2;
  let tickerSummary = '';
  let rationale = '';
  let assumptions = '';
  let targetPollutants: string[] = ['PM2.5', 'NOx', 'CO2'];

  if (profile.commute === 'two_wheeler') {
    title = isSevere
      ? `Shift Two-Wheeler Errands to ${safeWindow.windowLabel} & Limit Peak Exposure`
      : `Time Two-Wheeler Commutes Around the ${safeWindow.windowLabel} Dispersion Window`;
    instruction = `Avoid riding during the ${safeWindow.worstHourLabel} thermal inversion peak (${safeWindow.worstPm25} µg/m³), and consider a well-fitted N95/FFP2 mask when outdoor PM2.5 is elevated. Consolidate essential local errands into ${safeWindow.windowLabel} when ${safeWindow.avgWindSpeedKmh} km/h winds reduce outdoor particulate levels by ${safeWindow.pm25ReductionPctVsPeak}%.`;
    reductionPercent = isSevere ? 40 : 30;
    co2Kg = 0.6;
    noxGrams = 4.5;
    tickerSummary = 'shifted a two-wheeler commute out of peak smog';
    rationale = `Selected because your commute is Two-Wheeler and ${city}'s worst peak reaches ${safeWindow.worstPm25} µg/m³ at ${safeWindow.worstHourLabel}.`;
    assumptions =
      'Assumes 1–2 short peak-hour trips (~4 km total) shifted or batched into the afternoon dispersion window (~0.15 kg CO2/km and ~1.1 g NOx/km urban two-wheeler factors).';
  } else if (profile.commute === 'car') {
    title = `Use Cabin Recirculation & Shift Trips to ${safeWindow.windowLabel}`;
    instruction = `Switch your car HVAC to cabin recirculation before entering congested corridors near ${safeWindow.worstHourLabel} (${safeWindow.worstPm25} µg/m³) to limit in-cabin tailpipe infiltration. Combine school drop-offs or errands into ${safeWindow.windowLabel} when outdoor PM2.5 is projected around ${safeWindow.avgPm25} µg/m³.`;
    reductionPercent = isSevere ? 35 : 26;
    co2Kg = 1.4;
    noxGrams = 5.2;
    tickerSummary = 'used cabin air recirculation & batched car errands';
    rationale = `Selected because your primary commute is Car and ${city} shows a ${safeWindow.pm25ReductionPctVsPeak}% afternoon dispersion drop vs. peak.`;
    assumptions =
      'Assumes ~3.5 km of peak-traffic stop-start driving consolidated into one warm-engine loop (~0.40 kg CO2/km urban congestion factor, ~1.5 g NOx/km cold-start average).';
  } else if (profile.commute === 'public_transit') {
    title = isSevere
      ? `Avoid Peak Platform Idling & Keep Outdoor Walks Brief Today`
      : `Time Transit Transfers & Outdoor Walks for ${safeWindow.windowLabel}`;
    instruction = isSevere
      ? `Outdoor PM2.5 in ${city} is severe (${currentPm25} µg/m³); skip strenuous outdoor exercise and stand away from bus exhaust lanes while waiting at stops. Plan any essential outdoor walking around ${safeWindow.windowLabel} (${safeWindow.avgPm25} µg/m³) when dispersion is highest.`
      : `Stand upwind of idling bus bays during the ${safeWindow.worstHourLabel} spike (${safeWindow.worstPm25} µg/m³) and wear a fitted N95/FFP2 mask on crowded corridors. Shift brisk walking or outdoor errands to ${safeWindow.windowLabel} when wind speeds reach ${safeWindow.avgWindSpeedKmh} km/h.`;
    reductionPercent = isSevere ? 36 : 27;
    co2Kg = 1.8;
    noxGrams = 6.0;
    tickerSummary = 'timed public transit travel around peak dispersion hours';
    rationale = `Selected for Public Transit commuters in ${city} to reduce street-level exhaust exposure while avoiding private car displacement.`;
    assumptions =
      'Assumes choosing transit over an equivalent ~7 km single-occupancy urban car commute (~0.26 kg CO2/km net savings) plus avoiding peak roadside waiting.';
  } else {
    title = isSevere
      ? `Keep Windows Sealed & Postpone Outdoor Exercise During Severe Smog`
      : `Align Brief Ventilation & Outdoor Walks With ${safeWindow.windowLabel}`;
    instruction = isSevere
      ? `Because even ${city}'s cleanest afternoon window averages ${safeWindow.avgPm25} µg/m³ (>150 µg/m³), keep exterior doors and windows closed and move exercise indoors today. Avoid running unnecessary delivery trips during the ${safeWindow.worstHourLabel} peak (${safeWindow.worstPm25} µg/m³).`
      : `Keep exterior windows shut during the ${safeWindow.worstHourLabel} smog peak (${safeWindow.worstPm25} µg/m³) while working from home. Schedule outdoor walks and a 15–20 minute cross-ventilation flush strictly inside ${safeWindow.windowLabel} (${safeWindow.avgPm25} µg/m³).`;
    reductionPercent = isSevere ? 32 : 24;
    co2Kg = 0.5;
    noxGrams = 2.1;
    tickerSummary = `aligned home ventilation with ${safeWindow.windowLabel}`;
    rationale = `Selected for Work From Home households in ${city} based on today's ${safeWindow.windowLabel} boundary-layer window.`;
    assumptions =
      'Assumes avoiding peak-hour window opening (cutting indoor infiltration ratio by ~24–32%) and batching 1 local vehicle delivery (~2 km).';
    targetPollutants = ['PM2.5', 'PM10', 'CO2'];
  }

  const health = calculateHouseholdExposureImpact({
    ambientPm25: currentPm25,
    reductionPercent,
    exposureWeight,
    scopeLabel: 'daily PM2.5 exposure',
  });
  const emission = calculateNeighborhoodEmissionImpact({
    city,
    co2Kg,
    noxGrams,
  });

  return {
    id: 'routine',
    categoryLabel: 'Low-Emission Daily Routine',
    title,
    instruction,
    familyHealthImpact: {
      pm25ReductionPercent: health.pm25ReductionPercent,
      passiveCigarettesAvoided: health.passiveCigarettesAvoided,
      summaryText: health.summaryText,
    },
    neighborhoodEmissionImpact: {
      co2AvoidedKg: emission.co2AvoidedKg,
      noxAvoidedGrams: emission.noxAvoidedGrams,
      summaryText: emission.summaryText,
    },
    impactMethodology: createImpactMethodology({
      rationale,
      targetPollutants,
      formulaSummary: `Avoided PM2.5 = ${currentPm25} µg/m³ × ${health.pm25ReductionPercent}% × ${exposureWeight} exposure share = ~${health.avoidedPm25UgM3} µg/m³; illustrative cigarette benchmark = avoided PM2.5 ÷ 22 µg/m³ (Berkeley Earth).`,
      assumptions,
    }),
    tickerSummary,
  };
}

/**
 * Builds Card 2: Indoor Air Quality Hack tailored to filtration, fuel, and vulnerable members.
 */
function buildIndoorHackCard({
  city,
  currentPm25,
  profile,
  isSevere,
}: CardDraftParams): ActionCardData {
  let title = '';
  let instruction = '';
  let reductionPercent = 35;
  let exposureWeight = 0.75;
  let co2Kg = 0.3;
  let noxGrams = 1.9;
  let tickerSummary = '';
  let rationale = '';
  let assumptions = '';

  const hasKidsOrSeniors = profile.vulnerableMembers === 'yes';
  const vulnerablePhrase = hasKidsOrSeniors
    ? 'kids and seniors'
    : 'household members';

  if (profile.indoorFiltration === 'has_purifier') {
    if (profile.cookingFuel === 'gas') {
      title = `Run HEPA Clean Room & Balance Kitchen Exhaust Makeup Air`;
      instruction = `Operate your HEPA air purifier in the primary room used by ${vulnerablePhrase} with closed interior doors and towel-sealed door gaps to slow smog infiltration. When running a kitchen exhaust hood over your gas stove during ${currentPm25} µg/m³ smog, crack only the nearest kitchen window 2 cm so negative pressure does not pull raw outdoor air through bedroom gaps.`;
      reductionPercent = isSevere ? 52 : 42;
      assumptions =
        'Assumes a properly sized true-HEPA purifier (CADR >= room volume × 3 ACH) running continuously in a closed room while avoiding whole-home depressurization.';
    } else {
      title = `Stage HEPA Purifier Clear of Walls & Wet-Mop Settled Dust`;
      instruction = `Keep your air purifier at least 45 cm from walls in the living or sleeping room used by ${vulnerablePhrase}, and seal drafty exterior door thresholds with a rolled damp towel. Use damp microfiber mopping instead of dry brooms today so settled outdoor PM2.5 (${currentPm25} µg/m³ outside) is not resuspended indoors.`;
      reductionPercent = isSevere ? 55 : 44;
      assumptions =
        'Assumes continuous HEPA circulation (3–4 air changes/hour) combined with zero dry-sweeping resuspension and reduced door-gap leakage.';
    }
    co2Kg = 0.3;
    noxGrams = 1.9;
    tickerSummary = 'optimized HEPA clean-room airflow & sealed door drafts';
    rationale = `Tailored for households with an Air Purifier (${profile.cookingFuel === 'gas' ? 'Gas Stove' : 'Induction'}) and ${hasKidsOrSeniors ? 'kids/seniors at home' : 'standard occupancy'}.`;
  } else {
    title = `Wet-Mop Floors, Seal Drafts & Avoid Prolonged Exhaust Fan Pull`;
    instruction = `Skip dry brooms, incense, and candles today—wipe hard floors and sills with a damp cloth to capture settled particles around ${vulnerablePhrase}. Seal drafty exterior door gaps with damp towels and keep bathroom/kitchen exhaust runtime minimal while outdoor PM2.5 is ${currentPm25} µg/m³ to reduce unfiltered smog infiltration.`;
    reductionPercent = isSevere ? 32 : 24;
    exposureWeight = 0.7;
    co2Kg = 0.4;
    noxGrams = 2.4;
    tickerSummary = 'switched to wet-mopping & sealed draft infiltration';
    rationale = `Tailored for households with No Air Purifier during ${currentPm25} µg/m³ smog in ${city} to limit indoor particle sources and infiltration without specialized equipment.`;
    assumptions =
      'Assumes eliminating indoor resuspension/smoke sources and reducing passive draft infiltration; note that sealing without HEPA filtration provides smaller reductions than active mechanical filtration.';
  }

  const health = calculateHouseholdExposureImpact({
    ambientPm25: currentPm25,
    reductionPercent,
    exposureWeight,
    scopeLabel: 'indoor PM2.5 exposure',
  });
  const emission = calculateNeighborhoodEmissionImpact({
    city,
    co2Kg,
    noxGrams,
  });

  return {
    id: 'indoor_hack',
    categoryLabel: 'Indoor Air Quality Hack',
    title,
    instruction,
    familyHealthImpact: {
      pm25ReductionPercent: health.pm25ReductionPercent,
      passiveCigarettesAvoided: health.passiveCigarettesAvoided,
      summaryText: health.summaryText,
    },
    neighborhoodEmissionImpact: {
      co2AvoidedKg: emission.co2AvoidedKg,
      noxAvoidedGrams: emission.noxAvoidedGrams,
      summaryText: emission.summaryText,
    },
    impactMethodology: createImpactMethodology({
      rationale,
      targetPollutants:
        profile.cookingFuel === 'gas'
          ? ['PM2.5', 'NO2', 'Ultrafine Particles']
          : ['PM2.5', 'PM10'],
      formulaSummary: `Avoided indoor PM2.5 = ${currentPm25} µg/m³ × ${health.pm25ReductionPercent}% × ${exposureWeight} indoor time share = ~${health.avoidedPm25UgM3} µg/m³; benchmark ÷ 22 µg/m³.`,
      assumptions,
    }),
    tickerSummary,
  };
}

/**
 * Builds Card 3: Sustainable Alternative tailored to kitchen fuel and trip patterns.
 */
function buildSustainableSwapCard({
  city,
  currentPm25,
  safeWindow,
  profile,
}: CardDraftParams): ActionCardData {
  let title = '';
  let instruction = '';
  let reductionPercent = 20;
  const exposureWeight = 0.5;
  let co2Kg = 1.2;
  let noxGrams = 4.4;
  let tickerSummary = '';
  let rationale = '';
  let assumptions = '';
  let targetPollutants: string[] = ['PM2.5', 'NO2', 'CO2'];

  if (
    profile.cookingFuel === 'gas' &&
    (profile.commute === 'wfh' || profile.commute === 'public_transit')
  ) {
    title = `Pre-Boil Water in an Electric Kettle & Cover Pots on Your Gas Stove`;
    instruction = `Heat water in an electric kettle or microwave before moving to your gas burner, and keep tight lids on simmering pots to reduce open-flame runtime by roughly 40%. This lowers indoor NO2 and ultrafine cooking particulates while cutting local combustion emissions in ${city}.`;
    reductionPercent = 22;
    co2Kg = 0.9;
    noxGrams = 4.8;
    tickerSummary = 'cut gas burner runtime using an electric kettle & pot lids';
    rationale = `Selected because your household cooks with a Gas Stove—gas flames emit indoor NO2 and ultrafine particles during sealed-window smog days.`;
    assumptions =
      'Assumes replacing ~20 minutes/day of medium-high LPG/natural gas burner runtime with covered simmering and electric pre-heating (~0.9 kg CO2 and ~4.8 g NOx avoided).';
  } else if (profile.commute === 'car') {
    title = `Bundle Short Car Trips (<3 km) or Swap One Hop to Transit`;
    instruction = `Cold engines and catalytic converters emit elevated NOx and PM2.5 during the first 3 km of driving—combine separate errands into one warm-engine loop during ${safeWindow.windowLabel} or take metro/bus for one hop. Avoid walking/cycling on busy roads while PM2.5 exceeds 150 µg/m³.`;
    reductionPercent = 21;
    co2Kg = 1.6;
    noxGrams = 6.2;
    tickerSummary = 'skipped a cold-start short car trip';
    rationale = `Selected for Car commuters because eliminating a cold-start short urban trip cuts disproportionate local NOx (a secondary PM2.5 precursor) in ${city}.`;
    assumptions =
      'Assumes replacing or eliminating one ~4 km cold-start petrol urban trip (~0.40 kg CO2/km + cold-start enrichment -> ~1.6 kg CO2, ~6.2 g NOx).';
    targetPollutants = ['PM2.5', 'NOx', 'CO2'];
  } else if (profile.commute === 'two_wheeler') {
    title = `Switch Off Engine at Signals >20s & Batch Local Errands`;
    instruction = `Turn off your two-wheeler engine at red lights lasting over 20 seconds and batch neighborhood trips into a single continuous route during ${safeWindow.windowLabel}. At home, favor covered pressure-cooking or electric kettle pre-heating over long open-flame boiling.`;
    reductionPercent = 23;
    co2Kg = 1.1;
    noxGrams = 5.1;
    tickerSummary = 'eliminated signal idling & batched two-wheeler errands';
    rationale = `Selected for Two-Wheeler riders in ${city} to reduce street-level idling exhaust and cold-start fuel waste.`;
    assumptions =
      'Assumes cutting ~10 minutes of traffic signal idling plus consolidating ~3 km of detour errands (~1.1 kg CO2, ~5.1 g NOx).';
    targetPollutants = ['PM2.5', 'NOx', 'CO2'];
  } else {
    title = `Batch Cooking With Tight Lids & Avoid High-Smoke Oil Frying`;
    instruction = `Use a lid, steamer, or pressure cooker on your induction/electric cooktop instead of high-temperature pan frying today to sharply cut indoor cooking aerosols. Consolidate household deliveries to minimize local street-level exhaust and dust resuspension in ${city}.`;
    reductionPercent = 24;
    co2Kg = 1.1;
    noxGrams = 3.6;
    tickerSummary = 'switched to covered low-aerosol cooking';
    rationale = `Selected for Induction/Electric households to prevent indoor cooking-oil PM2.5 spikes when exterior windows must stay closed.`;
    assumptions =
      'Assumes substituting one high-heat oil-frying meal with covered steaming/pressure cooking plus consolidating 1 local delivery trip (~1.1 kg CO2, ~3.6 g NOx).';
    targetPollutants = ['PM2.5', 'VOCs', 'CO2'];
  }

  const health = calculateHouseholdExposureImpact({
    ambientPm25: currentPm25,
    reductionPercent,
    exposureWeight,
    scopeLabel: 'kitchen & street PM2.5',
  });
  const emission = calculateNeighborhoodEmissionImpact({
    city,
    co2Kg,
    noxGrams,
  });

  return {
    id: 'sustainable_swap',
    categoryLabel: 'Sustainable Alternative',
    title,
    instruction,
    familyHealthImpact: {
      pm25ReductionPercent: health.pm25ReductionPercent,
      passiveCigarettesAvoided: health.passiveCigarettesAvoided,
      summaryText: health.summaryText,
    },
    neighborhoodEmissionImpact: {
      co2AvoidedKg: emission.co2AvoidedKg,
      noxAvoidedGrams: emission.noxAvoidedGrams,
      summaryText: emission.summaryText,
    },
    impactMethodology: createImpactMethodology({
      rationale,
      targetPollutants,
      formulaSummary: `Avoided PM2.5 = ${currentPm25} µg/m³ × ${health.pm25ReductionPercent}% × ${exposureWeight} activity share = ~${health.avoidedPm25UgM3} µg/m³; emission factors per urban activity unit.`,
      assumptions,
    }),
    tickerSummary,
  };
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
  const isSevere =
    params.currentPm25 >= PM25_THRESHOLDS.SEVERE_SMOG_MIN ||
    params.safeWindow.statusType === 'keep_sealed';

  const draftParams: CardDraftParams = { ...params, isSevere };

  return [
    buildRoutineCard(draftParams),
    buildIndoorHackCard(draftParams),
    buildSustainableSwapCard(draftParams),
  ];
}
