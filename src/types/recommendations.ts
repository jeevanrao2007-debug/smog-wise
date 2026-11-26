/** Household stove fuel classification. */
export type CookingFuel = 'gas' | 'induction';

/** Primary daily commute mode affecting exposure & tailpipe emissions. */
export type CommuteMode = 'car' | 'two_wheeler' | 'public_transit' | 'wfh';

/** Availability of indoor HEPA or active mechanical filtration. */
export type IndoorFiltration = 'has_purifier' | 'no_purifier';

/** Presence of infants, elderly, or respiratory-sensitive household members. */
export type VulnerableMembers = 'yes' | 'no';

/** 4-toggle household profile driving personalized AI guidance and exposure math. */
export interface LifestyleProfile {
  cookingFuel: CookingFuel;
  commute: CommuteMode;
  indoorFiltration: IndoorFiltration;
  vulnerableMembers: VulnerableMembers;
}

/** Transparent impact formula and uncertainty disclosure attached to every action card. */
export interface ImpactMethodology {
  basis: 'modelled' | 'illustrative';
  rationale: string;
  targetPollutants: string[];
  formulaSummary: string;
  assumptions: string;
  uncertaintyNote: string;
}

/** Canonical identifier for each of the 3 personalized daily recommendation categories. */
export type ActionCardId = 'routine' | 'indoor_hack' | 'sustainable_swap';

/** Structured AI-generated clean-air action card with modelled exposure & emission metrics. */
export interface ActionCardData {
  id: ActionCardId;
  categoryLabel:
    | 'Low-Emission Daily Routine'
    | 'Indoor Air Quality Hack'
    | 'Sustainable Alternative';
  title: string;
  instruction: string;
  familyHealthImpact: {
    pm25ReductionPercent: number;
    passiveCigarettesAvoided: number;
    summaryText: string;
  };
  neighborhoodEmissionImpact: {
    co2AvoidedKg: number;
    noxAvoidedGrams: number;
    summaryText: string;
  };
  impactMethodology: ImpactMethodology;
  tickerSummary: string;
}

/** Result returned by the Gemini recommendation generator or API endpoint. */
export interface RecommendationsResult {
  cards: ActionCardData[];
  modelUsed: string;
  generatedAt: string;
}
