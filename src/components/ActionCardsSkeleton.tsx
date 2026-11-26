import React from 'react';

/**
 * Accessible loading skeleton displayed while Gemini generates personalized action cards.
 */
export const ActionCardsSkeleton: React.FC = () => {
  return (
    <div
      data-testid="action-cards-skeleton"
      role="status"
      aria-label="Refreshing tailored smog action plan"
      className="grid grid-cols-1 lg:grid-cols-3 gap-5"
    >
      {[0, 1, 2].map((idx) => (
        <div
          key={idx}
          className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 animate-pulse"
        >
          <div className="h-3 w-40 bg-slate-200 rounded" />
          <div className="h-6 w-3/4 bg-slate-200 rounded" />
          <div className="space-y-2">
            <div className="h-4 w-full bg-slate-100 rounded" />
            <div className="h-4 w-11/12 bg-slate-100 rounded" />
            <div className="h-4 w-4/5 bg-slate-100 rounded" />
          </div>
          <div className="h-32 w-full bg-slate-100 rounded-xl" />
          <div className="h-10 w-full bg-slate-200 rounded-lg" />
        </div>
      ))}
    </div>
  );
};
