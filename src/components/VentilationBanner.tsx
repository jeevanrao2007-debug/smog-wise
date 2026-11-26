import React from 'react';
import { CheckCircle2, Clock, ShieldAlert } from 'lucide-react';
import { SafeVentilationWindow } from '../types';

interface VentilationBannerProps {
  safeWindow: SafeVentilationWindow;
}

/**
 * Displays the upcoming 24-hour Safe Ventilation Window status tier banner,
 * optimal time window, and peak-hour comparison telemetry.
 */
export const VentilationBanner: React.FC<VentilationBannerProps> = ({
  safeWindow,
}) => {
  return (
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
  );
};
