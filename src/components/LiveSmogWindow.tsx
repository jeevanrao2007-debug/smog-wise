import React from 'react';
import { AlertTriangle, LocateFixed } from 'lucide-react';
import { PM25_THRESHOLDS } from '../constants';
import { CityLocation, HourlyAirPoint, SafeVentilationWindow, WeatherDataSource } from '../types';
import { formatCoordinateDisplay } from '../utils/weatherService';
import { CitySearchCombobox } from './CitySearchCombobox';
import { HourlyForecastChart } from './HourlyForecastChart';
import { LiveWeatherStrip } from './LiveWeatherStrip';
import { VentilationBanner } from './VentilationBanner';

interface LiveSmogWindowProps {
  city: CityLocation;
  onSelectCity: (city: CityLocation) => void;
  onDetectLocation: () => void;
  isLocating: boolean;
  locationNotice: string | null;
  hourlyPoints: HourlyAirPoint[];
  safeWindow: SafeVentilationWindow;
  currentPm25: number;
  currentWindKmh: number;
  currentTempC: number;
  currentUsAqi: number;
  isLoadingWeather: boolean;
  weatherSource: WeatherDataSource;
  weatherWarning: string | null;
  onRetryWeather?: () => void;
}

/**
 * Primary dashboard section combining coarse location controls, city search,
 * live Open-Meteo metrics, the Safe Ventilation Window banner, and the 24-hour forecast chart.
 */
export const LiveSmogWindow: React.FC<LiveSmogWindowProps> = ({
  city,
  onSelectCity,
  onDetectLocation,
  isLocating,
  locationNotice,
  hourlyPoints,
  safeWindow,
  currentPm25,
  currentWindKmh,
  currentTempC,
  currentUsAqi,
  isLoadingWeather,
  weatherSource,
  weatherWarning,
  onRetryWeather,
}) => {
  const isSevere =
    safeWindow.statusType === 'keep_sealed' || currentPm25 >= PM25_THRESHOLDS.SEVERE_SMOG_MIN;

  return (
    <section
      id="ventilation-window"
      aria-labelledby="active-city-heading"
      className="scroll-mt-20 bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 space-y-6"
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1
              id="active-city-heading"
              className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900"
            >
              {city.name}
              {city.country ? `, ${city.country}` : ''}
            </h1>
            <button
              type="button"
              onClick={onDetectLocation}
              disabled={isLocating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              <LocateFixed className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
              {isLocating ? 'Detecting Coarse Region...' : 'Auto-Detect Location'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span>
              Air Shed Grid: {formatCoordinateDisplay(city.latitude, city.longitude)}
              {city.isCoarseGps ? ' (Coarse ~11 km privacy grid)' : ''}
            </span>
            <span aria-hidden="true">·</span>
            <span
              data-testid="weather-source-badge"
              className={`font-semibold ${
                isLoadingWeather
                  ? 'text-slate-500'
                  : weatherSource === 'offline_fallback'
                    ? 'text-amber-800'
                    : 'text-emerald-800'
              }`}
            >
              {isLoadingWeather
                ? 'Connecting to live atmospheric sensors...'
                : weatherSource === 'offline_fallback'
                  ? 'Atmospheric Sensor Network Offline'
                  : 'Live Open-Meteo 24h Telemetry'}
            </span>
            {locationNotice && (
              <>
                <span aria-hidden="true">·</span>
                <span role="status" className="text-amber-800 font-medium">
                  {locationNotice}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <CitySearchCombobox onSelectCity={onSelectCity} />
        </div>
      </div>

      {weatherSource === 'offline_fallback' && (
        <div
          role="alert"
          className="rounded-xl px-4 py-3 border text-xs leading-relaxed flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-amber-50 border-amber-200 text-amber-950"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle aria-hidden="true" className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
            <span>
              {weatherWarning ||
                'Live Open-Meteo atmospheric sensors are temporarily unreachable. Retrying or selecting another city will reconnect to live telemetry.'}
            </span>
          </div>
          {onRetryWeather && (
            <button
              type="button"
              onClick={onRetryWeather}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-200 hover:bg-amber-300 text-amber-950 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
            >
              Retry Live Telemetry
            </button>
          )}
        </div>
      )}

      <LiveWeatherStrip
        city={city}
        onSelectCity={onSelectCity}
        currentPm25={currentPm25}
        currentUsAqi={currentUsAqi}
        currentWindKmh={currentWindKmh}
        currentTempC={currentTempC}
        isLoadingWeather={isLoadingWeather}
      />

      <VentilationBanner safeWindow={safeWindow} />

      <HourlyForecastChart
        cityName={city.name}
        citySlug={city.slug}
        hourlyPoints={hourlyPoints}
        safeWindow={safeWindow}
        isLoadingWeather={isLoadingWeather}
        isSevere={isSevere}
      />
    </section>
  );
};
