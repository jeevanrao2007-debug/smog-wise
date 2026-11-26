import React from 'react';
import { AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';
import { GEMINI_CANDIDATE_MODELS } from '../constants';
import { ActionCardData, LifestyleProfile } from '../types';
import { isActionCompletedToday } from '../utils/impactModel';
import { ActionCardItem } from './ActionCardItem';
import { ActionCardsSkeleton } from './ActionCardsSkeleton';

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

/**
 * Resolves a model identifier to its human-readable display label.
 */
function formatModelName(model: string): string {
  const matched = GEMINI_CANDIDATE_MODELS.find(
    (candidate) =>
      model === candidate.name ||
      model.includes(candidate.name) ||
      (candidate.name === 'gemini-4-hydrogen' && model.includes('hydrogen')) ||
      (candidate.name === 'gemini-3.5-flash-lite' && model.includes('flash-lite'))
  );
  if (matched) return matched.displayName;
  if (model.includes('2.5-flash')) return 'Gemini 2.5 Flash';
  return model;
}

/**
 * Formats an ISO timestamp into a local time string for badge attribution.
 */
function formatExactTime(isoString?: string | null): string {
  if (!isoString) return 'Just now';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return 'Just now';
  }
}

/**
 * Displays live Gemini-generated household smog action cards alongside model metadata,
 * anti-static error handling, and loading skeletons.
 */
export const ActionCardsSection: React.FC<ActionCardsSectionProps> = React.memo(
  ({
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
              <h2 id="action-plan-heading" className="text-xl font-bold text-slate-900">
                Today&apos;s Personalized Smog Action Plan for {city}
              </h2>
              {modelUsed && (
                <span
                  data-testid="live-model-badge"
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-semibold rounded-full"
                >
                  <Sparkles className="w-3 h-3 text-indigo-600" aria-hidden="true" />
                  Powered live by {formatModelName(modelUsed)}{' '}
                  {generatedAt ? `• ${formatExactTime(generatedAt)}` : ''}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <span
                data-testid="live-metadata-pill"
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200/80 rounded-full text-xs font-medium shadow-2xs"
              >
                <span
                  className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"
                  aria-hidden="true"
                />
                <span>
                  AI Tailored for {city} • {currentPm25} µg/m³ • {stoveLabel} + {commuteLabel} •
                  Live via {formatModelName(modelUsed || 'Gemini 4 Hydrogen')}
                </span>
              </span>

              {customQuestion && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-[11px]">
                  <span>
                    Q: &ldquo;
                    {customQuestion.length > 45
                      ? customQuestion.slice(0, 45) + '…'
                      : customQuestion}
                    &rdquo;
                  </span>
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

        {error && !isLoading && (
          <div
            role="alert"
            aria-live="assertive"
            className="bg-amber-50/90 border border-amber-300 rounded-2xl p-5 text-slate-800 space-y-3"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-amber-900">
                  Live Gemini Recommendations Error
                </h3>
                <p className="text-xs text-amber-800 leading-relaxed">{error}</p>
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
                Per strict anti-static rules, fallback placeholder cards are disabled so you only
                view live Gemini-generated plans.
              </span>
            </div>
          </div>
        )}

        {isLoading ? (
          <ActionCardsSkeleton />
        ) : cards.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
            {cards.map((card, index) => (
              <ActionCardItem
                key={card.id}
                card={card}
                index={index}
                city={city}
                isCompleted={isActionCompletedToday(completedKeys, card.id)}
                isCelebrating={celebratingId === card.id}
                onCompleteAction={onCompleteAction}
              />
            ))}
          </div>
        ) : null}
      </section>
    );
  }
);
