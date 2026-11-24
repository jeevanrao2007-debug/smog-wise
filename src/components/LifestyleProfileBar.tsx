import React, { useState } from 'react';
import { Flame, Car, Wind, Users, CloudCheck, HardDrive, Sparkles, Send } from 'lucide-react';
import {
  CommuteMode,
  CookingFuel,
  IndoorFiltration,
  LifestyleProfile,
  VulnerableMembers,
} from '../types';

interface LifestyleProfileBarProps {
  profile: LifestyleProfile;
  onChangeProfile: (updated: LifestyleProfile) => void;
  isSignedIn: boolean;
  isSyncingFirestore: boolean;
  customQuestion?: string;
  onChangeCustomQuestion?: (question: string) => void;
  onSubmitQuestion?: (question: string) => void;
  isGeneratingAi?: boolean;
}

export const LifestyleProfileBar: React.FC<LifestyleProfileBarProps> = React.memo(({
  profile,
  onChangeProfile,
  isSignedIn,
  isSyncingFirestore,
  customQuestion = '',
  onChangeCustomQuestion,
  onSubmitQuestion,
  isGeneratingAi = false,
}) => {
  const [localQuestion, setLocalQuestion] = useState(customQuestion);

  // Synchronize local input state if customQuestion is updated or cleared by parent
  React.useEffect(() => {
    setLocalQuestion(customQuestion);
  }, [customQuestion]);
  const updateCooking = (cookingFuel: CookingFuel) => {
    if (cookingFuel !== profile.cookingFuel) {
      onChangeProfile({ ...profile, cookingFuel });
    }
  };

  const updateCommute = (commute: CommuteMode) => {
    if (commute !== profile.commute) {
      onChangeProfile({ ...profile, commute });
    }
  };

  const updateFiltration = (indoorFiltration: IndoorFiltration) => {
    if (indoorFiltration !== profile.indoorFiltration) {
      onChangeProfile({ ...profile, indoorFiltration });
    }
  };

  const updateVulnerable = (vulnerableMembers: VulnerableMembers) => {
    if (vulnerableMembers !== profile.vulnerableMembers) {
      onChangeProfile({ ...profile, vulnerableMembers });
    }
  };

  return (
    <section
      id="family-profile"
      aria-labelledby="family-profile-heading"
      className="scroll-mt-20 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-200">
        <div>
          <h2
            id="family-profile-heading"
            className="text-lg font-bold text-slate-900"
          >
            Family Lifestyle Profile
          </h2>
          <p className="text-xs text-slate-600">
            Toggle your household setup below—recommendations and modelled exposure math recalculate automatically.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600" aria-live="polite">
          {isSignedIn ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-800 font-medium">
              <CloudCheck aria-hidden="true" className="w-4 h-4" />
              {isSyncingFirestore
                ? 'Syncing to Cloud Firestore...'
                : 'Synced to Cloud Firestore'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <HardDrive aria-hidden="true" className="w-4 h-4 text-slate-500" />
              Instant Guest Mode (Saved Locally)
            </span>
          )}
        </div>
      </div>

      {/* 4 Quick Toggles Grid — 2x2 on Desktop so every label fits cleanly on one line without truncation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Cooking Fuel */}
        <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div
            id="toggle-label-cooking"
            className="flex items-center gap-2 text-xs font-semibold text-slate-800 shrink-0"
          >
            <Flame aria-hidden="true" className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>1. Cooking Fuel</span>
          </div>
          <div
            role="group"
            aria-labelledby="toggle-label-cooking"
            className="grid grid-cols-2 gap-1 p-1 bg-slate-200/70 rounded-lg sm:w-72"
          >
            <button
              type="button"
              onClick={() => updateCooking('gas')}
              aria-pressed={profile.cookingFuel === 'gas'}
              className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                profile.cookingFuel === 'gas'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Gas Stove
            </button>
            <button
              type="button"
              onClick={() => updateCooking('induction')}
              aria-pressed={profile.cookingFuel === 'induction'}
              className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                profile.cookingFuel === 'induction'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Induction / Electric
            </button>
          </div>
        </div>

        {/* 2. Indoor Filtration */}
        <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div
            id="toggle-label-filtration"
            className="flex items-center gap-2 text-xs font-semibold text-slate-800 shrink-0"
          >
            <Wind aria-hidden="true" className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>2. Indoor Filtration</span>
          </div>
          <div
            role="group"
            aria-labelledby="toggle-label-filtration"
            className="grid grid-cols-2 gap-1 p-1 bg-slate-200/70 rounded-lg sm:w-72"
          >
            <button
              type="button"
              onClick={() => updateFiltration('has_purifier')}
              aria-pressed={profile.indoorFiltration === 'has_purifier'}
              className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                profile.indoorFiltration === 'has_purifier'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Have Air Purifier
            </button>
            <button
              type="button"
              onClick={() => updateFiltration('no_purifier')}
              aria-pressed={profile.indoorFiltration === 'no_purifier'}
              className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                profile.indoorFiltration === 'no_purifier'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              No Air Purifier
            </button>
          </div>
        </div>

        {/* 3. Primary Commute */}
        <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div
            id="toggle-label-commute"
            className="flex items-center gap-2 text-xs font-semibold text-slate-800 shrink-0"
          >
            <Car aria-hidden="true" className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>3. Primary Commute</span>
          </div>
          <div
            role="group"
            aria-labelledby="toggle-label-commute"
            className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-slate-200/70 rounded-lg flex-1 sm:max-w-md"
          >
            {(
              [
                { value: 'car', label: 'Car' },
                { value: 'two_wheeler', label: 'Two-Wheeler' },
                { value: 'public_transit', label: 'Public Transit' },
                { value: 'wfh', label: 'Work From Home' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateCommute(opt.value)}
                aria-pressed={profile.commute === opt.value}
                className={`px-2.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                  profile.commute === opt.value
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Vulnerable Family Members */}
        <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div
            id="toggle-label-vulnerable"
            className="flex items-center gap-2 text-xs font-semibold text-slate-800 shrink-0"
          >
            <Users aria-hidden="true" className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>4. Vulnerable Members</span>
          </div>
          <div
            role="group"
            aria-labelledby="toggle-label-vulnerable"
            className="grid grid-cols-2 gap-1 p-1 bg-slate-200/70 rounded-lg sm:w-72"
          >
            <button
              type="button"
              onClick={() => updateVulnerable('yes')}
              aria-pressed={profile.vulnerableMembers === 'yes'}
              className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                profile.vulnerableMembers === 'yes'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Kids or Seniors (Yes)
            </button>
            <button
              type="button"
              onClick={() => updateVulnerable('no')}
              aria-pressed={profile.vulnerableMembers === 'no'}
              className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                profile.vulnerableMembers === 'no'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              No
            </button>
          </div>
        </div>
      </div>

      {/* 5. Custom Routine / Home Question Input Box */}
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
                setLocalQuestion(e.target.value);
                onChangeCustomQuestion?.(e.target.value);
              }}
              placeholder="e.g., Should I take my 4-year-old to the park at 5 PM, or how do I seal a sliding balcony door?"
              maxLength={300}
              className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg shadow-2xs placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 transition-colors pr-8"
            />
            {localQuestion && (
              <button
                type="button"
                onClick={() => {
                  setLocalQuestion('');
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
    </section>
  );
});
