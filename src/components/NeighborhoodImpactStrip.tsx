import React from 'react';
import { Users, Wind, Activity, ShieldCheck } from 'lucide-react';
import { APP_LIMITS } from '../constants';
import { RecordedCommunityImpact } from '../types';

interface NeighborhoodImpactStripProps {
  cityName: string;
  recordedImpact: RecordedCommunityImpact;
}

/**
 * Displays real-time recorded neighborhood clean-air totals (actions, CO2, NOx)
 * and an anonymized live activity ticker backed by Cloud Firestore or Guest localStorage.
 */
export const NeighborhoodImpactStrip: React.FC<NeighborhoodImpactStripProps> = React.memo(({
  cityName,
  recordedImpact,
}) => {
  const hasRecordedActivity = recordedImpact.familiesCount > 0;

  return (
    <section
      id="neighborhood-impact"
      aria-labelledby="neighborhood-impact-heading"
      data-testid="neighborhood-impact-strip"
      className="scroll-mt-20 bg-slate-900 text-slate-100 rounded-2xl p-6 sm:p-7 border border-slate-800 space-y-6"
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="space-y-1.5 max-w-xl">
          <div className="text-xs font-medium text-emerald-300">
            Real-Time Neighborhood Impact Strip · {cityName} Air Shed
          </div>
          <h2
            id="neighborhood-impact-heading"
            className="text-xl sm:text-2xl font-bold tracking-tight text-white"
          >
            Recorded Clean-Air Actions in {cityName}
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            {recordedImpact.sourceMode === 'firestore_live'
              ? 'Live verified aggregate synced via Cloud Firestore atomic transactions. Totals reflect modelled CO2/NOx estimates from actual logged actions—never synthetic baselines.'
              : 'Guest Mode local tracker. Sign in with Google to contribute verified actions to the shared Cloud Firestore neighborhood counter.'}
          </p>
        </div>

        {/* Key Aggregate Counters (Strictly Actual Recorded Activity) */}
        <div
          aria-live="polite"
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 shrink-0"
        >
          <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Users
                aria-hidden="true"
                className="w-4 h-4 text-emerald-400 shrink-0"
              />
              <span>Actions Logged Today</span>
            </div>
            <div
              data-testid="families-counter"
              className="text-2xl font-bold text-white font-mono-tabular mt-1"
            >
              {recordedImpact.familiesCount.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-300 mt-0.5">
              {recordedImpact.sourceMode === 'firestore_live'
                ? 'Verified Firestore records'
                : 'Your local session today'}
            </div>
          </div>

          <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Wind
                aria-hidden="true"
                className="w-4 h-4 text-emerald-400 shrink-0"
              />
              <span>Modelled CO2 Avoided</span>
            </div>
            <div
              data-testid="co2-counter"
              className="text-2xl font-bold text-emerald-300 font-mono-tabular mt-1"
            >
              {(Number(recordedImpact.co2AvoidedKg) || 0).toFixed(1)}{' '}
              <span className="text-sm font-normal text-slate-300">kg</span>
            </div>
            <div className="text-[11px] text-slate-300 mt-0.5">
              Sum of logged estimates
            </div>
          </div>

          <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Activity
                aria-hidden="true"
                className="w-4 h-4 text-emerald-400 shrink-0"
              />
              <span>Modelled NOx Curbed</span>
            </div>
            <div
              data-testid="nox-counter"
              className="text-2xl font-bold text-white font-mono-tabular mt-1"
            >
              {(Number(recordedImpact.noxAvoidedGrams) || 0).toFixed(1)}{' '}
              <span className="text-sm font-normal text-slate-300">g</span>
            </div>
            <div className="text-[11px] text-slate-300 mt-0.5">
              Secondary PM2.5 precursor
            </div>
          </div>
        </div>
      </div>

      {/* Live Feed of Recorded Anonymized Actions */}
      <div className="pt-4 border-t border-slate-800 space-y-4">
        <div>
          <div className="text-xs font-semibold text-slate-200 mb-2.5">
            {hasRecordedActivity
              ? `Recent Anonymized Actions Logged in ${cityName}`
              : `No Verified Actions Logged Yet Today in ${cityName}`}
          </div>

          {hasRecordedActivity ? (
            <div
              data-testid="live-action-ticker"
              aria-live="polite"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5"
            >
              {recordedImpact.recentActions
                .slice(0, APP_LIMITS.MAX_RECENT_TICKER_ITEMS)
                .map((actionStr, idx) => (
                <div
                  key={`${idx}-${actionStr}`}
                  className="px-3.5 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700/70 text-xs text-slate-100 leading-relaxed truncate"
                  title={actionStr}
                >
                  {actionStr}
                </div>
              ))}
            </div>
          ) : (
            <div
              data-testid="live-action-ticker"
              aria-live="polite"
              className="px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-700/70 text-xs text-slate-300"
            >
              Click &ldquo;We Did This&rdquo; on any action card above to record today&apos;s first household habit for {cityName}. Each habit is deduplicated per calendar day to prevent double counting.
            </div>
          )}
        </div>

        {/* Real Data & Privacy Verification Badge */}
        <div className="rounded-xl bg-slate-800/50 border border-slate-700/70 p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Strictly Real Telemetry &amp; Logged Actions — Zero synthetic benchmarks or simulated data.</span>
          </div>
          <span className="text-[11px] text-slate-300">
            {recordedImpact.sourceMode === 'firestore_live' ? 'Synced with Cloud Firestore' : 'Stored in local session'}
          </span>
        </div>
      </div>
    </section>
  );
});
