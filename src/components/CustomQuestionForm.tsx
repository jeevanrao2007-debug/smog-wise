import React from 'react';
import { Send, Sparkles } from 'lucide-react';
import { APP_LIMITS } from '../constants';

interface CustomQuestionFormProps {
  localQuestion: string;
  onChangeLocalQuestion: (val: string) => void;
  onChangeCustomQuestion?: (question: string) => void;
  onSubmitQuestion?: (question: string) => void;
  isGeneratingAi: boolean;
}

/**
 * Interactive prompt bar enabling households to submit custom smog or home routine scenarios
 * for live grounded Gemini analysis.
 */
export const CustomQuestionForm: React.FC<CustomQuestionFormProps> = ({
  localQuestion,
  onChangeLocalQuestion,
  onChangeCustomQuestion,
  onSubmitQuestion,
  isGeneratingAi,
}) => {
  return (
    <div className="mt-4 p-4 bg-slate-50/80 border border-slate-200 rounded-xl space-y-2.5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
        <label
          htmlFor="custom-home-question"
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-800"
        >
          <Sparkles className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
          <span>Custom Routine / Home Question</span>
        </label>
        <span id="custom-home-question-help" className="text-[11px] text-slate-600">
          Triggers fresh live Gemini analysis grounded in your situation
        </span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = localQuestion.trim();
          onChangeCustomQuestion?.(trimmed);
          onSubmitQuestion?.(trimmed);
        }}
        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
      >
        <div className="relative flex-1">
          <input
            id="custom-home-question"
            type="text"
            aria-describedby="custom-home-question-help"
            value={localQuestion}
            onChange={(e) => {
              onChangeLocalQuestion(e.target.value);
              onChangeCustomQuestion?.(e.target.value);
            }}
            placeholder="e.g., Should I take my 4-year-old to the park at 5 PM, or how do I seal a sliding balcony door?"
            maxLength={APP_LIMITS.MAX_CUSTOM_QUESTION_LENGTH}
            className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg shadow-2xs placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 transition-colors pr-8"
          />
          {localQuestion && (
            <button
              type="button"
              onClick={() => {
                onChangeLocalQuestion('');
                onChangeCustomQuestion?.('');
                onSubmitQuestion?.('');
              }}
              title="Clear question"
              aria-label="Clear custom question"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800 text-xs cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={isGeneratingAi}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg shadow-2xs transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
        >
          <Send className={`w-3.5 h-3.5 ${isGeneratingAi ? 'animate-spin' : ''}`} aria-hidden="true" />
          {isGeneratingAi ? 'Generating Live Plan...' : 'Ask Gemini'}
        </button>
      </form>
    </div>
  );
};
