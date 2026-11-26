import React, { useState } from 'react';
import { Car, CloudCheck, Flame, HardDrive, Users, Wind } from 'lucide-react';
import {
  CommuteMode,
  CookingFuel,
  IndoorFiltration,
  LifestyleProfile,
  VulnerableMembers,
} from '../types';
import { CustomQuestionForm } from './CustomQuestionForm';
import { ProfileToggleGroup, ToggleOption } from './ProfileToggleGroup';

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

const COOKING_OPTIONS: readonly ToggleOption<CookingFuel>[] = [
  { value: 'gas', label: 'Gas Stove' },
  { value: 'induction', label: 'Induction / Electric' },
];

const FILTRATION_OPTIONS: readonly ToggleOption<IndoorFiltration>[] = [
  { value: 'has_purifier', label: 'Have Air Purifier' },
  { value: 'no_purifier', label: 'No Air Purifier' },
];

const COMMUTE_OPTIONS: readonly ToggleOption<CommuteMode>[] = [
  { value: 'car', label: 'Car' },
  { value: 'two_wheeler', label: 'Two-Wheeler' },
  { value: 'public_transit', label: 'Public Transit' },
  { value: 'wfh', label: 'Work From Home' },
];

const VULNERABLE_OPTIONS: readonly ToggleOption<VulnerableMembers>[] = [
  { value: 'yes', label: 'Kids or Seniors (Yes)' },
  { value: 'no', label: 'No' },
];

/**
 * Interactive 4-toggle household lifestyle profile selector and custom scenario prompt bar
 * with localStorage/Cloud Firestore synchronization indicators.
 */
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

  React.useEffect(() => {
    setLocalQuestion(customQuestion);
  }, [customQuestion]);

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ProfileToggleGroup
          labelId="toggle-label-cooking"
          label="1. Cooking Fuel"
          icon={Flame}
          value={profile.cookingFuel}
          options={COOKING_OPTIONS}
          onChange={(cookingFuel) => {
            if (cookingFuel !== profile.cookingFuel) {
              onChangeProfile({ ...profile, cookingFuel });
            }
          }}
        />

        <ProfileToggleGroup
          labelId="toggle-label-filtration"
          label="2. Indoor Filtration"
          icon={Wind}
          value={profile.indoorFiltration}
          options={FILTRATION_OPTIONS}
          onChange={(indoorFiltration) => {
            if (indoorFiltration !== profile.indoorFiltration) {
              onChangeProfile({ ...profile, indoorFiltration });
            }
          }}
        />

        <ProfileToggleGroup
          labelId="toggle-label-commute"
          label="3. Primary Commute"
          icon={Car}
          value={profile.commute}
          options={COMMUTE_OPTIONS}
          gridClassName="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-slate-200/70 rounded-lg flex-1 sm:max-w-md"
          buttonPaddingClassName="px-2.5 py-2"
          onChange={(commute) => {
            if (commute !== profile.commute) {
              onChangeProfile({ ...profile, commute });
            }
          }}
        />

        <ProfileToggleGroup
          labelId="toggle-label-vulnerable"
          label="4. Vulnerable Members"
          icon={Users}
          value={profile.vulnerableMembers}
          options={VULNERABLE_OPTIONS}
          onChange={(vulnerableMembers) => {
            if (vulnerableMembers !== profile.vulnerableMembers) {
              onChangeProfile({ ...profile, vulnerableMembers });
            }
          }}
        />
      </div>

      <CustomQuestionForm
        localQuestion={localQuestion}
        onChangeLocalQuestion={setLocalQuestion}
        onChangeCustomQuestion={onChangeCustomQuestion}
        onSubmitQuestion={onSubmitQuestion}
        isGeneratingAi={isGeneratingAi}
      />
    </section>
  );
});
