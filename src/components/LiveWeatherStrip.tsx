import React from 'react';
import { Thermometer, Wind } from 'lucide-react';
import { PM25_THRESHOLDS, PRESET_CITIES } from '../constants';
import { CityLocation } from '../types';

interface LiveWeatherStripProps {
  city: CityLocation;
  onSelectCity: (city: CityLocation) => void;
  currentPm25: number;
  currentUsAqi: number;
  currentWindKmh: number;
  currentTempC: number;
  isLoadingWeather: boolean;
}

/**
 * Renders quick preset urban air shed buttons alongside live PM2.5, AQI, wind, and temperature metrics.
 */
export const LiveWeatherStrip: React.FC<LiveWeatherStripProps> = ({
  city,
  onSelectCity,
  currentPm25,
  currentUsAqi,
  currentWindKmh,
  currentTempC,
  isLoadingWeather,
}) => {
  return (
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

      <div
        className="flex flex-wrap items-center gap-4 text-xs text-slate-700"
        aria-live="polite"
      >
        <span>
          Current PM2.5:{' '}
          <strong
            className={`font-mono-tabular font-semibold ${
              currentPm25 >= PM25_THRESHOLDS.SEVERE_SMOG_MIN
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
  );
};
