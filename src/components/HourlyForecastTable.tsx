import React from 'react';
import { Table2 } from 'lucide-react';
import { PM25_THRESHOLDS } from '../constants';
import { HourlyAirPoint } from '../types';

interface HourlyForecastTableProps {
  cityName: string;
  hourlyPoints: HourlyAirPoint[];
}

/**
 * Accessible expandable tabular data alternative to the 24-hour forecast bar chart.
 */
export const HourlyForecastTable: React.FC<HourlyForecastTableProps> = ({
  cityName,
  hourlyPoints,
}) => {
  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-xs">
      <summary className="cursor-pointer font-semibold text-slate-700 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded">
        <Table2 aria-hidden="true" className="w-3.5 h-3.5 text-emerald-700" />
        <span>View 24-Hour Air Quality &amp; Wind Forecast Data Table</span>
      </summary>
      <div
        tabIndex={0}
        role="region"
        aria-label={`24-hour forecast table for ${cityName}`}
        className="mt-3 overflow-x-auto rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        <table className="w-full text-left border-collapse font-mono-tabular">
          <caption className="sr-only">
            24-hour PM2.5, PM10, US AQI, wind speed, and temperature forecast for {cityName}
          </caption>
          <thead>
            <tr className="border-b border-slate-200 text-slate-700">
              <th scope="col" className="py-1.5 pr-3">
                Hour
              </th>
              <th scope="col" className="py-1.5 pr-3">
                PM2.5 (µg/m³)
              </th>
              <th scope="col" className="py-1.5 pr-3">
                PM10 (µg/m³)
              </th>
              <th scope="col" className="py-1.5 pr-3">
                Wind (km/h)
              </th>
              <th scope="col" className="py-1.5 pr-3">
                Temp (°C)
              </th>
              <th scope="col" className="py-1.5">
                Window Status
              </th>
            </tr>
          </thead>
          <tbody>
            {hourlyPoints.map((pt) => (
              <tr
                key={pt.hourIndex}
                className={`border-b border-slate-100 last:border-b-0 ${
                  pt.isInSafeWindow
                    ? 'bg-emerald-50 font-semibold text-emerald-950'
                    : 'text-slate-700'
                }`}
              >
                <td className="py-1.5 pr-3">{pt.label}</td>
                <td className="py-1.5 pr-3">{Math.round(pt.pm25)}</td>
                <td className="py-1.5 pr-3">{Math.round(pt.pm10)}</td>
                <td className="py-1.5 pr-3">{pt.windSpeedKmh}</td>
                <td className="py-1.5 pr-3">{pt.temperatureC}</td>
                <td className="py-1.5">
                  {pt.isInSafeWindow
                    ? 'Safe Ventilation Window'
                    : pt.pm25 >= PM25_THRESHOLDS.SEVERE_SMOG_MIN
                      ? 'Severe Smog'
                      : pt.pm25 >= PM25_THRESHOLDS.ELEVATED_MIN
                        ? 'Elevated'
                        : 'Moderate'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
};
