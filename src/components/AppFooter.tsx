import React from 'react';

/**
 * Quiet footer attributing atmospheric telemetry and non-medical estimation boundaries.
 */
export const AppFooter: React.FC = () => {
  return (
    <footer className="border-t border-slate-200 bg-white px-4 sm:px-8 py-5 text-xs text-slate-600">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>
          SmogWise — Urban Winter Smog Navigation &amp; Household Clean Air Routines
        </span>
        <span>
          Forecast via Open-Meteo · Structured Recommendations via Gemini · Impact estimates are modelled, not medical measurements
        </span>
      </div>
    </footer>
  );
};
