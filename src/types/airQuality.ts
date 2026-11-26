/** Primary atmospheric telemetry source indicator. */
export type WeatherDataSource = 'live' | 'offline_fallback';

/** Geographical air shed metadata formatted without exposing state/province or exact GPS. */
export interface CityLocation {
  name: string;
  country?: string;
  latitude: number;
  longitude: number;
  slug: string;
  isCoarseGps?: boolean;
}

/** Single hourly air quality & meteorological observation point. */
export interface HourlyAirPoint {
  hourIndex: number; // 0 to 23 (0 = Now)
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

/** Scientific ventilation recommendation tier status. */
export type VentilationStatusType = 'open_now' | 'wait_until' | 'keep_sealed';

/** Summary of the cleanest contiguous 2-hour dispersion window in the upcoming 24 hours. */
export interface SafeVentilationWindow {
  startHour: number;
  endHour: number;
  windowLabel: string;
  startTimeLabel: string;
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

/** Open-Meteo Geocoding search candidate result. */
export interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
}
