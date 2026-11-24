import React from 'react';
import {
  AlertTriangle,
  Clock,
  LocateFixed,
  ShieldAlert,
  Thermometer,
  Wind,
  CheckCircle2,
} from 'lucide-react';
import {
  CityLocation,
  HourlyAirPoint,
  SafeVentilationWindow,
  WeatherDataSource,
} from '../types';
import { PRESET_CITIES } from '../utils/smogLogic';
import { formatCoordinateDisplay } from '../utils/weatherService';
import { CitySearchCombobox } from './CitySearchCombobox';
import { HourlyForecastChart } from './HourlyForecastChart';

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
    safeWindow.statusType === 'keep_sealed' || currentPm25 >= 150;

  return (
    <section
      id="ventilation-window"
      aria-labelledby="active-city-heading"
      className="scroll-mt-20 bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 space-y-6"
    >
      {/* Top Toolbar: Location Controls & City Search Combobox */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200">
        {/* Left: Current City & Geolocation Control */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1
              id="active-city-heading"
              className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900"
            >
              {city.name}{city.country ? `, ${city.country}` : ''}
            </h1>
            <button
              type="button"
              onClick={onDetectLocation}
              disabled={isLocating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              <LocateFixed
                className="w-3.5 h-3.5 text-emerald-700"
                aria-hidden="true"
              />
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

        {/* Right: City Search Combobox */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <CitySearchCombobox onSelectCity={onSelectCity} />
        </div>
      </div>

      {/* Explicit Disclosure Banner when Offline */}
      {weatherSource === 'offline_fallback' && (
        <div
          role="alert"
          className="rounded-xl px-4 py-3 border text-xs leading-relaxed flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-amber-50 border-amber-200 text-amber-950"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle
              aria-hidden="true"
              className="w-4 h-4 shrink-0 mt-0.5 text-amber-700"
            />
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

      {/* Quick City Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Quick city presets"
        >
          <span className="text-xs font-medium text-slate-600 mr-1">
            Quick Air Sheds:
          </span>
          {PRESET_CITIES.map((preset) => {
            const active = preset.slug === city.slug;
            return (
              <button
                key={preset.slug}
                type="button"
                aria-pressed={active}
                onClick={() => onSelectCity(preset)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {preset.name}
              </button>
            );
          })}
        </div>

        {/* Live Current Readings Strip */}
        <div
          className="flex flex-wrap items-center gap-4 text-xs text-slate-700"
          aria-live="polite"
        >
          <span>
            Current PM2.5:{' '}
            <strong
              className={`font-mono-tabular font-semibold ${
                currentPm25 >= 150
                  ? 'text-rose-700'
                  : currentPm25 >= 55
                  ? 'text-amber-800'
                  : 'text-emerald-800'
              }`}
            >
              {isLoadingWeather ? '...' : `${currentPm25} µg/m³`}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            US AQI:{' '}
            <strong className="font-mono-tabular font-semibold text-slate-900">
              {isLoadingWeather ? '...' : currentUsAqi}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <Wind className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <strong className="font-mono-tabular font-semibold text-slate-900">
              {isLoadingWeather ? '...' : `${currentWindKmh} km/h`}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <Thermometer
              className="w-3.5 h-3.5 text-slate-500"
              aria-hidden="true"
            />
            <strong className="font-mono-tabular font-semibold text-slate-900">
              {isLoadingWeather ? '...' : `${currentTempC}°C`}
            </strong>
          </span>
        </div>
      </div>

      {/* Prominent Safe Ventilation Window Banner */}
      <div
        data-testid="safe-ventilation-banner"
        role={safeWindow.statusType === 'keep_sealed' ? 'alert' : 'status'}
        aria-live="polite"
        className={`rounded-xl p-5 sm:p-6 border transition-colors ${
          safeWindow.statusType === 'keep_sealed'
            ? 'bg-rose-50/80 border-rose-200'
            : safeWindow.statusType === 'open_now'
            ? 'bg-emerald-50/80 border-emerald-200'
            : 'bg-amber-50/60 border-amber-200'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold tracking-wide text-slate-700">
                Safe Ventilation Window (Upcoming 24-Hour Analysis)
              </span>
              <span
                data-testid="ventilation-status-pill"
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 ${
                  safeWindow.statusType === 'keep_sealed'
                    ? 'bg-rose-700 text-white'
                    : safeWindow.statusType === 'open_now'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-amber-800 text-white'
                }`}
              >
                {safeWindow.statusType === 'keep_sealed' ? (
                  <ShieldAlert aria-hidden="true" className="w-3.5 h-3.5" />
                ) : safeWindow.statusType === 'open_now' ? (
                  <CheckCircle2 aria-hidden="true" className="w-3.5 h-3.5" />
                ) : (
                  <Clock aria-hidden="true" className="w-3.5 h-3.5" />
                )}
                {safeWindow.statusHeadline}
              </span>
            </div>

            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 font-mono-tabular">
                {safeWindow.windowLabel}
              </h2>
              <span className="text-sm font-medium text-slate-700">
                {safeWindow.pm25ReductionPctVsPeak}% cleaner than today&apos;s worst hour (
                {safeWindow.worstHourLabel})
              </span>
            </div>

            <p className="text-sm text-slate-700 leading-relaxed">
              {safeWindow.statusSubtext}
            </p>
          </div>

          {/* Window vs Worst Peak Hour Comparison Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-slate-200/80 lg:pl-6 shrink-0">
            <div>
              <div className="text-xs text-slate-600">Window PM2.5</div>
              <div className="text-xl font-bold font-mono-tabular text-slate-900 mt-0.5">
                {safeWindow.avgPm25}{' '}
                <span className="text-xs font-normal text-slate-600">µg/m³</span>
              </div>
              <div className="text-xs text-emerald-800 font-medium mt-0.5">
                Best 2h average
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-600">Window Wind</div>
              <div className="text-xl font-bold font-mono-tabular text-slate-900 mt-0.5">
                {safeWindow.avgWindSpeedKmh}{' '}
                <span className="text-xs font-normal text-slate-600">km/h</span>
              </div>
              <div className="text-xs text-slate-600 mt-0.5">Peak dispersion</div>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <div className="text-xs text-slate-600">
                Worst Peak ({safeWindow.worstHourLabel})
              </div>
              <div className="text-xl font-bold font-mono-tabular text-rose-700 mt-0.5">
                {safeWindow.worstPm25}{' '}
                <span className="text-xs font-normal text-slate-600">µg/m³</span>
              </div>
              <div className="text-xs text-slate-600 font-mono-tabular mt-0.5">
                Wind: {safeWindow.worstWindSpeedKmh} km/h
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Extracted 24-Hour Interactive Bar Chart + Forecast Data Table */}
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
