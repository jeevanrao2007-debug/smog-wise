import React from 'react';
import {
  CheckCircle2,
  HeartPulse,
  Info,
  Leaf,
  Sparkles,
} from 'lucide-react';
import { ActionCardData } from '../types';

interface ActionCardItemProps {
  card: ActionCardData;
  index: number;
  city: string;
  isCompleted: boolean;
  isCelebrating: boolean;
  onCompleteAction: (card: ActionCardData) => void;
}

/**
 * Renders a single tailored smog action card with direct health/emission estimates,
 * expandable scientific methodology disclosure, and daily deduplicated completion control.
 */
export const ActionCardItem: React.FC<ActionCardItemProps> = ({
  card,
  index,
  city,
  isCompleted,
  isCelebrating,
  onCompleteAction,
}) => {
  return (
    <article
      data-testid={`action-card-${card.id}`}
      className={`bg-white border rounded-2xl p-6 flex flex-col justify-between transition-colors ${
        isCompleted
          ? 'border-emerald-300 bg-emerald-50/20'
          : 'border-slate-200'
      }`}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span className="font-semibold text-emerald-800">
            0{index + 1}. {card.categoryLabel}
          </span>
          <span className="font-mono-tabular font-medium text-slate-700">
            ~-{card.familyHealthImpact.pm25ReductionPercent}% PM2.5
          </span>
        </div>

        <h3 className="text-lg font-bold text-slate-900 leading-snug">
          {card.title}
        </h3>

        <p className="text-sm text-slate-700 leading-relaxed">
          {card.instruction}
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-900">
              Direct Impact Explainer
            </span>
            <span className="text-[11px] font-medium text-slate-600">
              Modelled Estimate
            </span>
          </div>

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
};
