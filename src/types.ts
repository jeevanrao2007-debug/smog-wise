export type CookingFuel = 'gas' | 'induction';
export type CommuteMode = 'car' | 'two_wheeler' | 'public_transit' | 'wfh';
export type IndoorFiltration = 'has_purifier' | 'no_purifier';
export type VulnerableMembers = 'yes' | 'no';

export type WeatherDataSource = 'live' | 'offline_fallback';

export interface LifestyleProfile {
  cookingFuel: CookingFuel;
  commute: CommuteMode;
  indoorFiltration: IndoorFiltration;
  vulnerableMembers: VulnerableMembers;
}

export interface CityLocation {
  name: string;
  country?: string;
  latitude: number;
  longitude: number;
  slug: string;
  isCoarseGps?: boolean;
}

export interface HourlyAirPoint {
  hourIndex: number; // 0 to 23
  timeIso: string;
  label: string; // e.g., "1:00 PM"
  shortLabel: string; // e.g., "1 PM"
  pm25: number;
  pm10: number;
  usAqi: number;
  windSpeedKmh: number;
  temperatureC: number;
  isInSafeWindow: boolean;
}

export type VentilationStatusType = 'open_now' | 'wait_until' | 'keep_sealed';

export interface SafeVentilationWindow {
  startHour: number; // e.g., 14 for 2:00 PM
  endHour: number; // e.g., 16 for 4:00 PM
  windowLabel: string; // e.g., "2:00 PM – 4:00 PM"
  startTimeLabel: string; // e.g., "2:00 PM"
  avgPm25: number;
  avgWindSpeedKmh: number;
  worstHourLabel: string;
  worstPm25: number;
  worstWindSpeedKmh: number;
  pm25ReductionPctVsPeak: number;
  statusType: VentilationStatusType;
  statusHeadline: string;
  statusSubtext: string;
  hasWindowPassedToday?: boolean;
}

export interface ImpactMethodology {
  basis: 'modelled' | 'illustrative';
  rationale: string;
  targetPollutants: string[];
  formulaSummary: string;
  assumptions: string;
  uncertaintyNote: string;
}

export interface ActionCardData {
  id: 'routine' | 'indoor_hack' | 'sustainable_swap';
  categoryLabel:
  | 'Low-Emission Daily Routine'
  | 'Indoor Air Quality Hack'
  | 'Sustainable Alternative';
  title: string;
  instruction: string; // 2-sentence plain-language step-by-step instruction
  familyHealthImpact: {
    pm25ReductionPercent: number;
    passiveCigarettesAvoided: number;
    summaryText: string;
  };
  neighborhoodEmissionImpact: {
    co2AvoidedKg: number;
    noxAvoidedGrams: number;
    summaryText: string;
  };
  impactMethodology: ImpactMethodology;
  tickerSummary: string; // e.g. "sealed door gaps & ran HEPA filtration during peak smog"
}

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
