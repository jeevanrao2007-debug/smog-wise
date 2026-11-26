import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APP_LIMITS, DEFAULT_CITY, DISPERSION_CONFIG } from '../constants';
import { CityLocation, HourlyAirPoint, WeatherDataSource } from '../types';
import {
  buildSimulatedOrFallbackHourlyPoints,
  calculateSafeVentilationWindow,
} from '../utils/smogLogic';
import {
  fetchOpenMeteoForecast,
  resolvePrivacySafeLocationFromCoords,
  reverseGeocodeCoarseCoords,
} from '../utils/weatherService';

interface UseWeatherForecastParams {
  onAnnouncement: (message: string) => void;
}

/**
 * Custom hook managing urban location selection, privacy-preserving coarse geolocation,
 * Open-Meteo 48h telemetry fetching, rolling 24h Safe Ventilation Window derivation,
 * and automatic hourly clock rollover updates.
 */
export function useWeatherForecast({ onAnnouncement }: UseWeatherForecastParams) {
  const [city, setCity] = useState<CityLocation>(DEFAULT_CITY);
  const [isLocating, setIsLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [rawHourlyPoints, setRawHourlyPoints] = useState<Omit<HourlyAirPoint, 'isInSafeWindow'>[]>(
    () => buildSimulatedOrFallbackHourlyPoints(false)
  );
  const [fetchedWeatherSource, setFetchedWeatherSource] = useState<WeatherDataSource>('live');
  const [weatherWarning, setWeatherWarning] = useState<string | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState(true);

  const [currentHour24, setCurrentHour24] = useState<number>(() => {
    const nowHour = new Date().getHours();
    return Number.isFinite(nowHour) ? nowHour : DISPERSION_CONFIG.DEFAULT_FALLBACK_HOUR;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const nowHour = new Date().getHours();
      if (Number.isFinite(nowHour)) {
        setCurrentHour24((prev) => (prev !== nowHour ? nowHour : prev));
      }
    }, APP_LIMITS.HOUR_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const { windowInfo: safeWindow, annotatedPoints: hourlyPoints } = useMemo(
    () => calculateSafeVentilationWindow(rawHourlyPoints, currentHour24),
    [rawHourlyPoints, currentHour24]
  );

  const currentPoint = hourlyPoints[currentHour24] || hourlyPoints[0];
  const currentPm25 = Math.round(currentPoint?.pm25 ?? 0);
  const currentWindKmh = currentPoint?.windSpeedKmh ?? 0;
  const currentTempC = currentPoint?.temperatureC ?? 0;
  const currentUsAqi = Math.round(currentPoint?.usAqi ?? 0);

  const weatherAbortRef = useRef<AbortController | null>(null);

  const fetchCityForecast = useCallback(
    async (targetCity: CityLocation, forceRefresh = false) => {
      weatherAbortRef.current?.abort();
      const controller = new AbortController();
      weatherAbortRef.current = controller;

      setIsLoadingWeather(true);
      try {
        const result = await fetchOpenMeteoForecast(targetCity, controller.signal, fetch, {
          forceRefresh,
        });
        if (weatherAbortRef.current !== controller) return;
        setRawHourlyPoints(result.points);
        setFetchedWeatherSource(result.source);
        setWeatherWarning(result.warning ?? null);
        onAnnouncement(
          `Updated 24-hour smog forecast for ${targetCity.name}. Outdoor air telemetry loaded.`
        );
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setRawHourlyPoints(buildSimulatedOrFallbackHourlyPoints(false));
        setFetchedWeatherSource('offline_fallback');
        setWeatherWarning(
          'Live Open-Meteo air quality forecast is temporarily unreachable. Showing an illustrative offline winter smog reference curve.'
        );
      } finally {
        if (weatherAbortRef.current === controller) {
          setIsLoadingWeather(false);
        }
      }
    },
    [onAnnouncement]
  );

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        void fetchCityForecast(city);
      }
    });
    return () => {
      active = false;
      weatherAbortRef.current?.abort();
    };
  }, [city, fetchCityForecast]);

  const detectUserLocation = useCallback((isInitialLoad = false) => {
    if (!('geolocation' in navigator)) {
      if (!isInitialLoad) {
        setLocationNotice('Geolocation not supported by browser — showing New Delhi');
      }
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const resolvedCity = await reverseGeocodeCoarseCoords(
            pos.coords.latitude,
            pos.coords.longitude
          );
          setCity(resolvedCity);
          setLocationNotice(
            resolvedCity.name === 'Local Urban Air Shed'
              ? 'Using coarse ~11 km regional grid (exact GPS never stored)'
              : `Matched location: ${resolvedCity.name}${resolvedCity.country ? ', ' + resolvedCity.country : ''}`
          );
        } catch {
          const privacySafeCity = resolvePrivacySafeLocationFromCoords(
            pos.coords.latitude,
            pos.coords.longitude
          );
          setCity(privacySafeCity);
          setLocationNotice(`Matched nearest air shed: ${privacySafeCity.name}`);
        } finally {
          setIsLocating(false);
        }
      },
      (err) => {
        setCity(DEFAULT_CITY);
        if (err.code === 1) {
          setLocationNotice(
            isInitialLoad
              ? 'Location permission needed to auto-detect — showing New Delhi'
              : 'Location permission denied in browser — showing New Delhi (search your city above)'
          );
        } else if (err.code === 3) {
          setLocationNotice(
            'Location request timed out — showing New Delhi (click Auto-Detect Location to retry or search above)'
          );
        } else {
          setLocationNotice('GPS unavailable — showing New Delhi (search your city above)');
        }
        setIsLocating(false);
      },
      { timeout: 15000, maximumAge: 300000, enableHighAccuracy: false }
    );
  }, []);

  const didAutoLocateRef = useRef(false);
  useEffect(() => {
    if (!didAutoLocateRef.current) {
      didAutoLocateRef.current = true;
      detectUserLocation(true);
    }
  }, [detectUserLocation]);

  return {
    city,
    setCity,
    isLocating,
    locationNotice,
    setLocationNotice,
    fetchedWeatherSource,
    weatherWarning,
    isLoadingWeather,
    currentHour24,
    safeWindow,
    hourlyPoints,
    currentPm25,
    currentWindKmh,
    currentTempC,
    currentUsAqi,
    fetchCityForecast,
    detectUserLocation,
  };
}
