import { CityLocation, HourlyAirPoint, WeatherDataSource } from '../types';
import {
  buildSimulatedOrFallbackHourlyPoints,
  DEFAULT_CITY,
  formatHourLabel,
  PRESET_CITIES,
  toCitySlug,
} from './smogLogic';

export interface OpenMeteoFetchResult {
  points: Omit<HourlyAirPoint, 'isInSafeWindow'>[];
  source: WeatherDataSource;
  fetchedAtIso: string;
  warning?: string;
}

export const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes TTL

interface WeatherCacheEntry {
  result: OpenMeteoFetchResult;
  timestamp: number;
}

// In-memory weather cache and in-flight request coalescing registry
const weatherMemoryCache = new Map<string, WeatherCacheEntry>();
const inFlightWeatherRequests = new Map<string, Promise<OpenMeteoFetchResult>>();

/**
 * Resets the weather in-memory cache. Primarily useful for unit testing and deterministic checks.
 */
export function clearWeatherCache(): void {
  weatherMemoryCache.clear();
  inFlightWeatherRequests.clear();
}

/**
 * Returns telemetry regarding current cached weather entries.
 */
export function getWeatherCacheStats(): { size: number } {
  return { size: weatherMemoryCache.size };
}

/**
 * Rounds coordinates to a coarse ~0.1° (~11 km) city-level grid so precise
 * household GPS coordinates are never stored in Firestore or shared publicly.
 */
export function roundCoordinateToCityGrid(coord: number): number {
  if (typeof coord !== 'number' || !Number.isFinite(coord)) return 0;
  return Number(coord.toFixed(1));
}

/**
 * Formats latitude and longitude with accurate N/S and E/W hemisphere suffixes.
 */
export function formatCoordinateDisplay(latitude: number, longitude: number): string {
  const safeLat = Number.isFinite(latitude) ? Math.max(-90, Math.min(90, latitude)) : 0;
  const safeLon = Number.isFinite(longitude) ? Math.max(-180, Math.min(180, longitude)) : 0;
  const latHem = safeLat >= 0 ? 'N' : 'S';
  const lonHem = safeLon >= 0 ? 'E' : 'W';
  return `${Math.abs(safeLat).toFixed(1)}°${latHem}, ${Math.abs(safeLon).toFixed(1)}°${lonHem}`;
}

/**
 * Privacy-preserving location resolver:
 * Maps raw GPS coordinates to either the nearest preset regional air shed (within ~75 km)
 * or a coarse city-grid label ("Local Urban Air Shed") WITHOUT exposing coordinates in the name.
 */
export function resolvePrivacySafeLocationFromCoords(
  rawLatitude: number,
  rawLongitude: number
): CityLocation {
  if (!Number.isFinite(rawLatitude) || !Number.isFinite(rawLongitude)) {
    return DEFAULT_CITY;
  }
  const lat = roundCoordinateToCityGrid(Math.max(-90, Math.min(90, rawLatitude)));
  const lon = roundCoordinateToCityGrid(Math.max(-180, Math.min(180, rawLongitude)));

  // Check if within ~0.7 degrees (~75 km) of a known urban air shed
  for (const preset of PRESET_CITIES) {
    const dLat = Math.abs(preset.latitude - lat);
    const dLon = Math.abs(preset.longitude - lon);
    if (dLat <= 0.7 && dLon <= 0.7) {
      return {
        ...preset,
        isCoarseGps: true,
      };
    }
  }

  return {
    name: 'Local Urban Air Shed',
    country: 'Coarse Regional Grid',
    latitude: lat,
    longitude: lon,
    slug: toCitySlug('local-urban-air-shed'),
    isCoarseGps: true,
  };
}

/**
 * Asynchronously reverse-geocodes coarse coordinates to human-readable city and region,
 * falling back gracefully to resolvePrivacySafeLocationFromCoords if offline or unreachable.
 */
export async function reverseGeocodeCoarseCoords(
  rawLatitude: number,
  rawLongitude: number,
  signal?: AbortSignal
): Promise<CityLocation> {
  const coarseCity = resolvePrivacySafeLocationFromCoords(rawLatitude, rawLongitude);
  if (coarseCity.name !== 'Local Urban Air Shed') {
    return coarseCity;
  }

  const lat = coarseCity.latitude;
  const lon = coarseCity.longitude;

  try {
    const res = await fetch(`/api/reverse-geocode?lat=${lat}&lon=${lon}`, { signal });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = (await res.json()) as {
        name?: string;
        admin1?: string;
        country?: string;
      };
      if (data && typeof data.name === 'string' && data.name.trim().length > 0) {
        return {
          name: data.name.trim(),
          country: data.country ? data.country.trim() : 'Coarse Regional Grid',
          latitude: lat,
          longitude: lon,
          slug: toCitySlug(data.name.trim()),
          isCoarseGps: true,
        };
      }
    }
  } catch {
    // Ignore and try direct fallback
  }

  // Client-side direct reverse-geocode fallback for static hosting
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
      { signal, headers: { Accept: 'application/json' } }
    );
    if (res.ok) {
      const data = (await res.json()) as {
        address?: {
          city?: string;
          town?: string;
          village?: string;
          municipality?: string;
          state?: string;
          country?: string;
        };
        name?: string;
      };
      const name =
        data.address?.city ||
        data.address?.town ||
        data.address?.village ||
        data.address?.municipality ||
        data.name;
      if (name && typeof name === 'string' && name.trim().length > 0) {
        return {
          name: name.trim(),
          country: data.address?.country ? String(data.address.country).trim() : 'Coarse Regional Grid',
          latitude: lat,
          longitude: lon,
          slug: toCitySlug(name.trim()),
          isCoarseGps: true,
        };
      }
    }
  } catch {
    // Ignore and return coarse fallback
  }

  return coarseCity;
}

/**
 * Pure parser and sanitizer for Open-Meteo Air Quality + Weather JSON payloads.
 * Returns null if fewer than 24 hourly timestamps are available or data is structurally invalid.
 */
export function normalizeOpenMeteoHourlyResponse(
  aqData: unknown,
  wxData: unknown
): Omit<HourlyAirPoint, 'isInSafeWindow'>[] | null {
  if (!aqData || typeof aqData !== 'object' || !wxData || typeof wxData !== 'object') {
    return null;
  }

  const aqHourly = (aqData as { hourly?: Record<string, unknown> }).hourly;
  const wxHourly = (wxData as { hourly?: Record<string, unknown> }).hourly;

  const times = Array.isArray(aqHourly?.time)
    ? aqHourly.time
    : Array.isArray(wxHourly?.time)
    ? wxHourly.time
    : [];

  if (times.length < 24) {
    return null;
  }

  const pm25Arr = Array.isArray(aqHourly?.pm2_5) ? aqHourly.pm2_5 : [];
  const pm10Arr = Array.isArray(aqHourly?.pm10) ? aqHourly.pm10 : [];
  const aqiArr = Array.isArray(aqHourly?.us_aqi) ? aqHourly.us_aqi : [];
  const windArr = Array.isArray(wxHourly?.wind_speed_10m) ? wxHourly.wind_speed_10m : [];
  const tempArr = Array.isArray(wxHourly?.temperature_2m) ? wxHourly.temperature_2m : [];

  // Require at least 12 valid numeric PM2.5 readings; otherwise refuse to treat as live data
  let validPm25Count = 0;
  for (let i = 0; i < 24; i++) {
    const v = pm25Arr[i];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 2000) {
      validPm25Count++;
    }
  }
  if (validPm25Count < 12) {
    return null;
  }

  // Compute median/mean of valid PM2.5 readings to fill isolated single-hour sensor gaps
  const validPm25Values = pm25Arr
    .slice(0, 24)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 2000);
  const meanPm25 =
    validPm25Values.reduce((sum, n) => sum + n, 0) / Math.max(1, validPm25Values.length);

  const fallback = buildSimulatedOrFallbackHourlyPoints(false);
  const totalHours = Math.min(times.length, 48);

  return Array.from({ length: totalHours }, (_, hour) => {
    const rawPm25 = pm25Arr[hour];
    const pm25 =
      typeof rawPm25 === 'number' && Number.isFinite(rawPm25) && rawPm25 >= 0 && rawPm25 <= 2000
        ? Math.max(1, Math.round(rawPm25))
        : Math.max(1, Math.round(meanPm25));

    const rawPm10 = pm10Arr[hour];
    const pm10 =
      typeof rawPm10 === 'number' && Number.isFinite(rawPm10) && rawPm10 >= 0 && rawPm10 <= 3000
        ? Math.max(pm25, Math.round(rawPm10))
        : Math.round(pm25 * 1.35);

    const rawAqi = aqiArr[hour];
    const usAqi =
      typeof rawAqi === 'number' && Number.isFinite(rawAqi) && rawAqi >= 0 && rawAqi <= 500
        ? Math.round(rawAqi)
        : Math.min(500, Math.round(pm25 * 1.5));

    const rawWind = windArr[hour];
    const windSpeedKmh =
      typeof rawWind === 'number' && Number.isFinite(rawWind) && rawWind >= 0 && rawWind <= 300
        ? Math.round(rawWind * 10) / 10
        : fallback[hour % 24].windSpeedKmh;

    const rawTemp = tempArr[hour];
    const temperatureC =
      typeof rawTemp === 'number' && Number.isFinite(rawTemp) && rawTemp >= -60 && rawTemp <= 65
        ? Math.round(rawTemp)
        : fallback[hour % 24].temperatureC;

    return {
      hourIndex: hour,
      timeIso: typeof times[hour] === 'string' ? times[hour] : fallback[hour % 24].timeIso,
      label: formatHourLabel(hour % 24, false),
      shortLabel: formatHourLabel(hour % 24, true),
      pm25,
      pm10,
      usAqi,
      windSpeedKmh,
      temperatureC,
    };
  });
}

/**
 * Fetches 24-hour Open-Meteo Air Quality & Weather forecasts with AbortController support.
 * Features 10-minute in-memory caching and in-flight request coalescing (deduplication)
 * to maximize performance and minimize redundant atmospheric network round-trips.
 * Explicitly returns `source: 'offline_fallback'` when live APIs are unreachable so the UI
 * never misrepresents fallback curves as live telemetry.
 */
export async function fetchOpenMeteoForecast(
  targetCity: CityLocation,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  options: { forceRefresh?: boolean; now?: () => number } = {}
): Promise<OpenMeteoFetchResult> {
  const { forceRefresh = false, now = Date.now } = options;
  const gridLat = roundCoordinateToCityGrid(targetCity.latitude);
  const gridLon = roundCoordinateToCityGrid(targetCity.longitude);
  const cacheKey = `${gridLat}_${gridLon}`;

  // 1. Fast in-memory cache hit
  if (!forceRefresh) {
    const cached = weatherMemoryCache.get(cacheKey);
    if (cached && now() - cached.timestamp < WEATHER_CACHE_TTL_MS) {
      return cached.result;
    }
  }

  // 2. Request coalescing: if an identical grid request is already in-flight, reuse it
  if (!forceRefresh && inFlightWeatherRequests.has(cacheKey)) {
    return inFlightWeatherRequests.get(cacheKey)!;
  }

  const fetchPromise: Promise<OpenMeteoFetchResult> = (async () => {
    const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${targetCity.latitude}&longitude=${targetCity.longitude}&hourly=pm2_5,pm10,us_aqi&timezone=auto&forecast_days=2`;
    const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${targetCity.latitude}&longitude=${targetCity.longitude}&hourly=wind_speed_10m,temperature_2m&timezone=auto&forecast_days=2`;

    try {
      const [aqRes, wxRes] = await Promise.all([
        fetchImpl(aqUrl, { signal }),
        fetchImpl(wxUrl, { signal }),
      ]);

      if (!aqRes.ok || !wxRes.ok) {
        throw new Error(`Open-Meteo HTTP error (AQ ${aqRes.status}, WX ${wxRes.status})`);
      }

      const [aqData, wxData] = await Promise.all([aqRes.json(), wxRes.json()]);
      const normalized = normalizeOpenMeteoHourlyResponse(aqData, wxData);
      if (!normalized) {
        throw new Error('Open-Meteo payload had insufficient valid hourly observations');
      }

      const result: OpenMeteoFetchResult = {
        points: normalized,
        source: 'live',
        fetchedAtIso: new Date(now()).toISOString(),
      };

      // Store in cache
      weatherMemoryCache.set(cacheKey, { result, timestamp: now() });
      return result;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      return {
        points: buildSimulatedOrFallbackHourlyPoints(false),
        source: 'offline_fallback' as const,
        fetchedAtIso: new Date(now()).toISOString(),
        warning:
          'Live Open-Meteo air quality forecast is temporarily unreachable. Displaying an illustrative offline winter smog reference curve (not live sensor measurements).',
      };
    } finally {
      inFlightWeatherRequests.delete(cacheKey);
    }
  })();

  if (!forceRefresh) {
    inFlightWeatherRequests.set(cacheKey, fetchPromise);
  }

  return fetchPromise;
}
