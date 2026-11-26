import { CityLocation } from '../types';

/**
 * PM2.5 concentration thresholds (µg/m³) governing safe ventilation status tiers
 * and visual chart color coding.
 */
export const PM25_THRESHOLDS = {
  /** Tier 1 ceiling: WHO clean air threshold allowing anytime ventilation. */
  CLEAN_AIR_MAX: 25,
  /** Tier 2 ceiling for immediate "Open Windows Now" recommendation. */
  OPEN_WINDOWS_NOW_MAX: 60,
  /** Elevated smog threshold for yellow/amber visual warnings. */
  ELEVATED_MIN: 90,
  /** Tier 3 severe smog threshold requiring sealed windows and active filtration. */
  SEVERE_SMOG_MIN: 150,
  /** Hazardous threshold for deep crimson alert indicators. */
  HAZARDOUS_MIN: 250,
  /** Minimum baseline scale (µg/m³) so low-pollution bars remain proportional. */
  CHART_MIN_SCALE: 20,
  /** Sensor sanity validation bounds. */
  MAX_VALID_PM25: 5000,
  MAX_VALID_WIND_KMH: 400,
} as const;

/**
 * Atmospheric dispersion scoring weights and rolling 24-hour forecast window parameters.
 */
export const DISPERSION_CONFIG = {
  /** Weight applied to 10m wind speed (km/h) when scoring dispersion quality. */
  WIND_BONUS_MULTIPLIER: 1.35,
  /** Maximum reduction allowed from wind dispersion bonus to avoid masking severe peaks. */
  MAX_DISPERSION_BONUS: 35,
  /** Number of consecutive upcoming hours analyzed in the rolling forecast. */
  HOURS_PER_FORECAST: 24,
  /** Maximum valid starting offset index for a contiguous 2-hour window (0..22). */
  LAST_WINDOW_START_INDEX: 22,
  /** Default fallback hour when system clock returns a non-finite number. */
  DEFAULT_FALLBACK_HOUR: 10,
} as const;

/**
 * Default urban air shed displayed before geolocation or user selection.
 */
export const DEFAULT_CITY: CityLocation = {
  name: 'New Delhi',
  country: 'India',
  latitude: 28.6139,
  longitude: 77.209,
  slug: 'new-delhi',
};

/**
 * Curated global preset urban air sheds for one-click comparison.
 */
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
