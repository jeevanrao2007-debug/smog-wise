import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  HeartPulse,
  Info,
  Leaf,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { ActionCardData, LifestyleProfile } from '../types';
import { isActionCompletedToday } from '../utils/impactModel';

interface ActionCardsSectionProps {
  city: string;
  currentPm25: number;
  profile: LifestyleProfile;
  cards: ActionCardData[];
  isLoading: boolean;
  modelUsed?: string | null;
  generatedAt?: string | null;
  error?: string | null;
  customQuestion?: string;
  completedKeys: string[];
  celebratingId: string | null;
  onCompleteAction: (card: ActionCardData) => void;
  onRefreshRecommendations: () => void;
}

function formatModelName(model: string): string {
  if (model.includes('hydrogen') || model.includes('gemini-4')) return 'Gemini 4 Hydrogen';
  if (model.includes('3.8-flash')) return 'Gemini 3.8 Flash';
  if (model.includes('3.5-flash-lite') || model.includes('flash-lite')) return 'Gemini 3.5 Flash Lite';
  if (model.includes('2.5-flash')) return 'Gemini 2.5 Flash';
  return model;
}

function formatExactTime(isoString?: string | null): string {
  if (!isoString) return 'Just now';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return 'Just now';
  }
}

export const ActionCardsSection: React.FC<ActionCardsSectionProps> = React.memo(({
  city,
  currentPm25,
  profile,
  cards,
  isLoading,
  modelUsed,
  generatedAt,
  error,
  customQuestion,
  completedKeys,
  celebratingId,
  onCompleteAction,
  onRefreshRecommendations,
}) => {
  const stoveLabel = profile.cookingFuel === 'gas' ? 'Gas Stove' : 'Induction';
  const commuteLabel =
    profile.commute === 'car'
      ? 'Car'
      : profile.commute === 'two_wheeler'
      ? 'Two-Wheeler'
      : profile.commute === 'public_transit'
      ? 'Public Transit'
      : 'WFH';

  return (
    <section
      id="action-plan"
      aria-labelledby="action-plan-heading"
      className="scroll-mt-20 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="action-plan-heading"
              className="text-xl font-bold text-slate-900"
            >
              Today&apos;s Personalized Smog Action Plan for {city}
            </h2>
            {modelUsed && (
              <span
                data-testid="live-model-badge"
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-semibold rounded-full"
              >
                <Sparkles className="w-3 h-3 text-indigo-600" aria-hidden="true" />
                Powered live by {formatModelName(modelUsed)} {generatedAt ? `• ${formatExactTime(generatedAt)}` : ''}
              </span>
            )}
          </div>

          {/* Subtle Live Metadata Pill */}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <span
              data-testid="live-metadata-pill"
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200/80 rounded-full text-xs font-medium shadow-2xs"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
              <span>
                AI Tailored for {city} • {currentPm25} µg/m³ • {stoveLabel} + {commuteLabel} • Live via {formatModelName(modelUsed || 'Gemini 4 Hydrogen')}
              </span>
            </span>

            {customQuestion && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-[11px]">
                <span>Q: &ldquo;{customQuestion.length > 45 ? customQuestion.slice(0, 45) + '…' : customQuestion}&rdquo;</span>
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onRefreshRecommendations}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 self-start"
        >
          <RefreshCw
            aria-hidden="true"
            className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
          />
          Refresh AI Plan
        </button>
      </div>

      {/* Error Alert with Retry button (Anti-Static: never use static text) */}
      {error && !isLoading && (
        <div
          role="alert"
          aria-live="assertive"
          className="bg-amber-50/90 border border-amber-300 rounded-2xl p-5 text-slate-800 space-y-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-amber-900">
                Live Gemini Recommendations Error
              </h3>
              <p className="text-xs text-amber-800 leading-relaxed">
                {error}
              </p>
            </div>
          </div>
          <div className="pt-1 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onRefreshRecommendations}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              Retry Live Generation
            </button>
            <span className="text-[11px] text-amber-700">
              Per strict anti-static rules, fallback placeholder cards are disabled so you only view live Gemini-generated plans.
            </span>
          </div>
        </div>
      )}

      {/* Loading Skeleton State */}
      {isLoading ? (
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
      ) : cards.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
          {cards.map((card, index) => {
            const isCompleted = isActionCompletedToday(completedKeys, card.id);
            const isCelebrating = celebratingId === card.id;

            return (
              <article
                key={card.id}
                data-testid={`action-card-${card.id}`}
                className={`bg-white border rounded-2xl p-6 flex flex-col justify-between transition-colors ${
                  isCompleted
                    ? 'border-emerald-300 bg-emerald-50/20'
                    : 'border-slate-200'
                }`}
              >
                <div className="space-y-4">
                  {/* Editorial Kicker */}
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="font-semibold text-emerald-800">
                      0{index + 1}. {card.categoryLabel}
                    </span>
                    <span className="font-mono-tabular font-medium text-slate-700">
                      ~-{card.familyHealthImpact.pm25ReductionPercent}% PM2.5
                    </span>
                  </div>

                  {/* Clear Action Title */}
                  <h3 className="text-lg font-bold text-slate-900 leading-snug">
                    {card.title}
                  </h3>

                  {/* 2-Sentence Plain-Language Step-by-Step Instruction */}
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {card.instruction}
                  </p>
                </div>

                <div className="mt-6 space-y-4">
                  {/* Direct Impact Box (Visually Distinct Summary Inside Each Card) */}
                  <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">
                        Direct Impact Explainer
                      </span>
                      <span className="text-[11px] font-medium text-slate-600">
                        Modelled Estimate
                      </span>
                    </div>

                    {/* Family Health / Exposure Impact */}
                    <div className="flex items-start gap-2.5">
                      <HeartPulse
                        aria-hidden="true"
                        className="w-4 h-4 text-rose-700 shrink-0 mt-0.5"
                      />
                      <div className="text-xs leading-relaxed">
                        <span className="font-semibold text-slate-900">
                          Household Exposure Estimate:{' '}
                        </span>
                        <span className="text-slate-700 font-mono-tabular">
                          {card.familyHealthImpact.summaryText}
                        </span>
                      </div>
                    </div>

                    {/* Neighborhood Emission Impact */}
                    <div className="flex items-start gap-2.5 pt-2 border-t border-slate-200/70">
                      <Leaf
                        aria-hidden="true"
                        className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5"
                      />
                      <div className="text-xs leading-relaxed">
                        <span className="font-semibold text-slate-900">
                          Neighborhood Emission Estimate:{' '}
                        </span>
                        <span className="text-slate-700 font-mono-tabular">
                          {card.neighborhoodEmissionImpact.summaryText}
                        </span>
                      </div>
                    </div>

                    {/* Transparent Rationale, Formula, Assumptions & Uncertainty */}
                    <details className="pt-2 border-t border-slate-200/70 text-[11px] text-slate-700">
                      <summary className="cursor-pointer font-semibold text-emerald-800 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded">
                        <Info aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
                        <span>Why &amp; How Estimated (Assumptions &amp; Uncertainty)</span>
                      </summary>
                      <dl className="mt-2 space-y-1.5 leading-relaxed">
                        <div>
                          <dt className="font-semibold text-slate-900 inline">
                            Why recommended:{' '}
                          </dt>
                          <dd className="inline">{card.impactMethodology.rationale}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-900 inline">
                            Pollutants targeted:{' '}
                          </dt>
                          <dd className="inline">
                            {card.impactMethodology.targetPollutants.join(', ')}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-900 inline">
                            Method &amp; units ({card.impactMethodology.basis}):{' '}
                          </dt>
                          <dd className="inline font-mono-tabular">
                            {card.impactMethodology.formulaSummary}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-900 inline">
                            Assumptions:{' '}
                          </dt>
                          <dd className="inline">{card.impactMethodology.assumptions}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-900 inline">
                            Uncertainty:{' '}
                          </dt>
                          <dd className="inline text-slate-600">
                            {card.impactMethodology.uncertaintyNote}
                          </dd>
                        </div>
                      </dl>
                    </details>
                  </div>

                  {/* "We Did This" Action Button */}
                  <button
                    type="button"
                    onClick={() => onCompleteAction(card)}
                    disabled={isCompleted}
                    className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${
                      isCompleted
                        ? 'bg-emerald-100 text-emerald-950 border border-emerald-300 cursor-default'
                        : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                    }`}
                  >
                    {isCompleted ? (
                      <>
                        <CheckCircle2
                          aria-hidden="true"
                          className="w-4 h-4 text-emerald-800 shrink-0"
                        />
                        <span>
                          {isCelebrating
                            ? `Logged ~${card.neighborhoodEmissionImpact.co2AvoidedKg} kg CO2 for ${city}`
                            : 'Completed Today — Impact Logged'}
                        </span>
                        <span className="sr-only"> ({card.categoryLabel})</span>
                      </>
                    ) : (
                      <>
                        <Sparkles aria-hidden="true" className="w-4 h-4 shrink-0" />
                        <span>We Did This</span>
                        <span className="sr-only">: {card.categoryLabel}</span>
                      </>
                    )}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
});
