import React, { useEffect, useRef, useState } from 'react';
import { DISPERSION_CONFIG, PM25_THRESHOLDS } from '../constants';
import { HourlyAirPoint, SafeVentilationWindow } from '../types';
import { formatHourLabel } from '../utils/smogLogic';
import { HourlyForecastTable } from './HourlyForecastTable';

interface HourlyForecastChartProps {
  cityName: string;
  citySlug: string;
  hourlyPoints: HourlyAirPoint[];
  safeWindow: SafeVentilationWindow;
  isLoadingWeather: boolean;
  isSevere: boolean;
}

/**
 * Pure keyboard navigation helper for the 24-hour forecast chart toolbar.
 * Supports roving focus via ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Home, and End keys.
 */
export function getNextHourlyBarIndex(
  currentIndex: number,
  key: string,
  totalHours: number = DISPERSION_CONFIG.HOURS_PER_FORECAST
): number | null {
  if (totalHours <= 0) return null;
  const safeCurrent = Math.max(0, Math.min(totalHours - 1, currentIndex));

  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (safeCurrent + 1) % totalHours;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (safeCurrent - 1 + totalHours) % totalHours;
    case 'Home':
      return 0;
    case 'End':
      return totalHours - 1;
    default:
      return null;
  }
}

/**
 * Resolves Tailwind bar fill classes for an hourly PM2.5 reading.
 */
function getHourlyBarColorClass(pm25: number, isInSafeWindow: boolean, isSevere: boolean): string {
  if (isInSafeWindow && !isSevere) return 'bg-emerald-600 hover:bg-emerald-700';
  if (pm25 >= PM25_THRESHOLDS.HAZARDOUS_MIN) return 'bg-rose-700 hover:bg-rose-800';
  if (pm25 >= PM25_THRESHOLDS.SEVERE_SMOG_MIN) return 'bg-rose-600 hover:bg-rose-700';
  if (pm25 >= PM25_THRESHOLDS.ELEVATED_MIN) return 'bg-amber-600 hover:bg-amber-700';
  return 'bg-slate-500 hover:bg-slate-600';
}

/**
 * Interactive upcoming 24-hour PM2.5 bar chart featuring dynamic scaling,
 * roving tabindex keyboard navigation, and an accessible tabular alternative.
 */
export const HourlyForecastChart: React.FC<HourlyForecastChartProps> = React.memo(
  ({ cityName, citySlug, hourlyPoints, safeWindow, isLoadingWeather, isSevere }) => {
    const [selectedHourIdx, setSelectedHourIdx] = useState<number>(0);
    const barButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

    useEffect(() => {
      setSelectedHourIdx(0);
    }, [citySlug, safeWindow.windowLabel]);

    const maxPm25 = Math.max(PM25_THRESHOLDS.CHART_MIN_SCALE, ...hourlyPoints.map((pt) => pt.pm25));

    const inspectedPoint =
      hourlyPoints[selectedHourIdx] || hourlyPoints[safeWindow.startHour] || hourlyPoints[0];

    const handleBarKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, hourIndex: number) => {
      const nextIdx = getNextHourlyBarIndex(hourIndex, event.key, hourlyPoints.length);
      if (nextIdx === null) return;

      event.preventDefault();
      setSelectedHourIdx(nextIdx);
      barButtonRefs.current[nextIdx]?.focus();
    };

    return (
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Upcoming 24-Hour PM2.5 Forecast &amp; Safe Ventilation Window
            </h3>
            <p className="text-xs text-slate-600">
              Green shaded bars mark the 2-hour Safe Ventilation Window ({safeWindow.windowLabel}).
              Starts at Now for the upcoming 24 consecutive hours. Click any bar or use arrow keys;
              expand table below.
            </p>
          </div>

          {inspectedPoint && (
            <div
              data-testid="selected-hour-readout"
              aria-live="polite"
              aria-atomic="true"
              className="flex flex-wrap items-center gap-3 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-mono-tabular"
            >
              <span className="font-semibold text-slate-900">{inspectedPoint.label}</span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  inspectedPoint.isInSafeWindow && !isSevere
                    ? 'text-emerald-800 font-semibold'
                    : inspectedPoint.pm25 >= PM25_THRESHOLDS.SEVERE_SMOG_MIN
                      ? 'text-rose-700 font-semibold'
                      : 'text-slate-700'
                }
              >
                PM2.5: {Math.round(inspectedPoint.pm25)} µg/m³
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-700">Wind: {inspectedPoint.windSpeedKmh} km/h</span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-700">Temp: {inspectedPoint.temperatureC}°C</span>
            </div>
          )}
        </div>

        <div
          className="relative pt-6 pb-2 px-2 sm:px-4 bg-slate-50/70 border border-slate-200 rounded-xl"
          role="region"
          aria-label="24-hour PM2.5 forecast chart"
        >
          {isLoadingWeather ? (
            <div
              role="status"
              className="h-40 flex items-center justify-center text-xs text-slate-600"
            >
              Loading 24-hour atmospheric forecast...
            </div>
          ) : (
            <div
              role="group"
              aria-label="Hourly PM2.5 forecast bars. Use Left and Right arrow keys to inspect each hour."
              className="grid grid-cols-24 gap-1 sm:gap-1.5 items-end h-40"
            >
              {hourlyPoints.map((pt) => {
                const heightPct = Math.max(
                  10,
                  Math.min(100, Math.round((pt.pm25 / maxPm25) * 100))
                );
                const isSelected = pt.hourIndex === selectedHourIdx;
                const barColor = getHourlyBarColorClass(pt.pm25, pt.isInSafeWindow, isSevere);
                const shortHourText =
                  pt.shortLabel ||
                  (pt.hourIndex === 0 ? 'Now' : formatHourLabel(pt.hourIndex, true));
                const isLabelVisible = pt.hourIndex % 2 === 0;
                const roundedPm25 = Math.round(pt.pm25);

                return (
                  <div key={pt.hourIndex} className="relative h-full flex flex-col justify-end">
                    {pt.isInSafeWindow && !isSevere && pt.hourIndex === safeWindow.startHour && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute -top-5 left-0 text-[10px] font-semibold text-emerald-800 whitespace-nowrap font-mono-tabular"
                      >
                        Safe 2h Window
                      </span>
                    )}
                    <button
                      ref={(el) => {
                        barButtonRefs.current[pt.hourIndex] = el;
                      }}
                      type="button"
                      data-hour-index={pt.hourIndex}
                      tabIndex={isSelected ? 0 : -1}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedHourIdx(pt.hourIndex)}
                      onFocus={() => setSelectedHourIdx(pt.hourIndex)}
                      onMouseEnter={() => setSelectedHourIdx(pt.hourIndex)}
                      onKeyDown={(e) => handleBarKeyDown(e, pt.hourIndex)}
                      className={`group relative w-full h-full flex flex-col justify-end items-center rounded-md px-0.5 py-1 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                        pt.isInSafeWindow && !isSevere
                          ? 'bg-emerald-500/15 ring-1 ring-emerald-500/40'
                          : isSelected
                            ? 'bg-slate-200/70'
                            : ''
                      }`}
                    >
                      <span className="text-[10px] font-mono-tabular text-slate-600 mb-1 hidden md:block">
                        {roundedPm25}
                      </span>
                      <span className="sr-only">
                        {' '}
                        PM2.5 {roundedPm25} micrograms per cubic meter at{' '}
                      </span>
                      <div
                        aria-hidden="true"
                        className={`w-full rounded-t transition-transform duration-150 ${barColor} ${
                          isSelected ? 'ring-2 ring-slate-900' : ''
                        }`}
                        style={{ height: `${heightPct}%` }}
                      />
                      <span
                        className={`mt-1.5 text-[10px] font-mono-tabular whitespace-nowrap transition-opacity ${
                          pt.isInSafeWindow && !isSevere
                            ? 'font-bold text-emerald-800'
                            : isLabelVisible
                              ? 'text-slate-700 font-medium'
                              : 'opacity-0 select-none pointer-events-none'
                        }`}
                      >
                        {shortHourText}
                      </span>
                      <span className="sr-only">
                        {' '}
                        ({pt.label}), Wind {pt.windSpeedKmh} kilometers per hour, Temperature{' '}
                        {pt.temperatureC} degrees Celsius
                        {pt.isInSafeWindow && !isSevere ? ', Safe Ventilation Window' : ''}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-2.5 border-t border-slate-200/80 text-xs text-slate-700">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="w-3 h-3 rounded-sm bg-emerald-600 inline-block"
                />
                <span>Safe Ventilation Window ({safeWindow.windowLabel})</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="w-3 h-3 rounded-sm bg-amber-600 inline-block" />
                <span>Elevated (90–149 µg/m³)</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="w-3 h-3 rounded-sm bg-rose-700 inline-block" />
                <span>Severe Smog (&ge;150 µg/m³)</span>
              </span>
            </div>
            <span className="font-mono-tabular text-slate-600">
              {isSevere
                ? 'Alert: Inversion Trapping Active'
                : 'Afternoon Boundary Layer Dispersion Active'}
            </span>
          </div>
        </div>

        <HourlyForecastTable cityName={cityName} hourlyPoints={hourlyPoints} />
      </div>
    );
  }
);
