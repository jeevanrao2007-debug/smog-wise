import { GenerateContentConfig, GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  GEMINI_CANDIDATE_MODELS,
  GEMINI_CLIENT_TIMEOUT_MS,
  GEMINI_RETRY_BACKOFF_MS,
  GEMINI_SYSTEM_INSTRUCTION,
} from '../constants';
import { ActionCardData, LifestyleProfile, SafeVentilationWindow } from '../types';
import {
  maskSensitiveErrorDetails,
  normalizeAiActionCards,
  ValidatedRecommendationRequest,
} from './apiValidation';

const GEMINI_RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      categoryLabel: { type: Type.STRING },
      title: { type: Type.STRING },
      instruction: { type: Type.STRING },
      familyHealthImpact: {
        type: Type.OBJECT,
        properties: {
          pm25ReductionPercent: { type: Type.INTEGER },
          passiveCigarettesAvoided: { type: Type.NUMBER },
          summaryText: { type: Type.STRING },
        },
        required: ['pm25ReductionPercent', 'passiveCigarettesAvoided', 'summaryText'],
      },
      neighborhoodEmissionImpact: {
        type: Type.OBJECT,
        properties: {
          co2AvoidedKg: { type: Type.NUMBER },
          noxAvoidedGrams: { type: Type.NUMBER },
          summaryText: { type: Type.STRING },
        },
        required: ['co2AvoidedKg', 'noxAvoidedGrams', 'summaryText'],
      },
      impactMethodology: {
        type: Type.OBJECT,
        properties: {
          rationale: { type: Type.STRING },
          targetPollutants: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          assumptions: { type: Type.STRING },
        },
        required: ['rationale', 'targetPollutants', 'assumptions'],
      },
      tickerSummary: { type: Type.STRING },
    },
    required: [
      'id',
      'categoryLabel',
      'title',
      'instruction',
      'familyHealthImpact',
      'neighborhoodEmissionImpact',
      'impactMethodology',
      'tickerSummary',
    ],
  },
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('AI_UPSTREAM_TIMEOUT')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function buildGeminiClientPrompt(req: {
  city: string;
  currentPm25: number;
  safeWindow: SafeVentilationWindow;
  profile: LifestyleProfile;
  customQuestion?: string;
}): string {
  const { city, currentPm25, safeWindow, profile, customQuestion } = req;
  const cookingDesc = profile.cookingFuel === 'gas' ? 'Gas Stove' : 'Induction / Electric';
  const commuteDesc =
    profile.commute === 'car'
      ? 'Car / Private Vehicle'
      : profile.commute === 'two_wheeler'
        ? 'Motorcycle / Scooter'
        : profile.commute === 'public_transit'
          ? 'Metro / Bus'
          : 'Work From Home (WFH)';
  const filtrationDesc =
    profile.indoorFiltration === 'has_purifier'
      ? 'Active HEPA Air Purifier Available'
      : 'No Air Purifier (Natural Ventilation Only)';
  const vulnerableDesc =
    profile.vulnerableMembers === 'yes'
      ? 'Vulnerable Members (Children / Elderly / Respiratory Conditions Present)'
      : 'Healthy Adults Only';

  return `Generate 3 tailored, practical daily smog navigation action cards for a family in ${city}.

LIVE INPUTS & CONDITIONS:
- Exact City: ${city}
- Current Outdoor PM2.5: ${currentPm25} µg/m³
- Today's Safe Ventilation Window: ${safeWindow.windowLabel} (Projected Window PM2.5: ${safeWindow.avgPm25} µg/m³, Wind: ${safeWindow.avgWindSpeedKmh} km/h, Status: ${safeWindow.statusHeadline})
- Worst Peak Smog Hour Today: ${safeWindow.worstHourLabel} (${safeWindow.worstPm25} µg/m³)
- Household Lifestyle Profile:
  * Cooking Fuel: ${cookingDesc}
  * Primary Commute Mode: ${commuteDesc}
  * Indoor Air Filtration: ${filtrationDesc}
  * Vulnerable Family Members: ${vulnerableDesc}
${customQuestion ? `- User's Specific Custom Question / Routine Request: "${customQuestion}"\n` : ''}

CRITICAL ANTI-STATIC & INPUT-GROUNDING REQUIREMENTS:
1. Every card's "instruction" and "impactMethodology" MUST explicitly mention and ground itself in:
   - The user's exact city name: "${city}"
   - The current PM2.5 reading: "${currentPm25} µg/m³"
   - The exact ventilation window hours: "${safeWindow.windowLabel}"
   - The specific household toggles: "${cookingDesc}", "${commuteDesc}", "${filtrationDesc}", "${vulnerableDesc}"
   ${customQuestion ? `- Directly answer the user's custom question: "${customQuestion}". Specifically address their scenario in the instruction!` : ''}
2. Absolutely NO generic or boilerplate advice. Tailor the steps to this exact household setup.
3. If outdoor PM2.5 >= 150 µg/m³ or status is keep_sealed, NEVER advise opening windows or outdoor exercise.
4. Do NOT make medical or clinical protection guarantees.

Return-order requirements (exactly 3 JSON items):
1. id: "routine", categoryLabel: "Low-Emission Daily Routine"
2. id: "indoor_hack", categoryLabel: "Indoor Air Quality Hack"
3. id: "sustainable_swap", categoryLabel: "Sustainable Alternative"

Requirements for each card:
- "title": Clear, highly specific action title (under 85 characters).
- "instruction": Exactly 2 plain-language sentences giving step-by-step instructions that explicitly reference ${city}, ${currentPm25} µg/m³, and ${safeWindow.windowLabel}${customQuestion ? ` and directly answer "${customQuestion}"` : ''}.
- "familyHealthImpact":
  - "pm25ReductionPercent": integer between 15 and 60 representing modelled % reduction in exposure.
  - "passiveCigarettesAvoided": number (to 1 decimal place).
  - "summaryText": brief plain-language summary referencing the local conditions.
- "neighborhoodEmissionImpact":
  - "co2AvoidedKg": number (to 1 decimal place, realistic single-day household action 0.2..5.0 kg).
  - "noxAvoidedGrams": number (to 1 decimal place, realistic single-day action 1.0..15.0 g).
  - "summaryText": brief plain-language summary.
- "impactMethodology":
  - "rationale": 1 clear sentence explaining WHY this action fits this ${city} household and the ${currentPm25} µg/m³ level.
  - "targetPollutants": array of 1-3 pollutant names (e.g. ["PM2.5", "NOx", "CO2"]).
  - "assumptions": 1 sentence stating the concrete activity assumption.
- "tickerSummary": concise verb phrase (e.g. "shifted cooking schedule and ran air filtration during peak smog").`;
}

/**
 * Executes a single candidate Gemini model request with automatic fallback
 * for API versions lacking developer systemInstruction fields.
 */
async function invokeCandidateModel(
  generateFn: (params: {
    model: string;
    contents: string;
    config: GenerateContentConfig;
  }) => Promise<{ text?: string }>,
  modelName: string,
  withThinking: boolean,
  prompt: string
): Promise<string> {
  const tryGenerate = async (includeSystemInstruction: boolean) => {
    const config: GenerateContentConfig = {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_RESPONSE_SCHEMA,
    };
    if (includeSystemInstruction) {
      config.systemInstruction = GEMINI_SYSTEM_INSTRUCTION;
    }
    if (withThinking) {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
    }
    const contents = includeSystemInstruction
      ? prompt
      : `SYSTEM INSTRUCTIONS:\n${GEMINI_SYSTEM_INSTRUCTION}\n\nUSER REQUEST:\n${prompt}`;

    const response = await withTimeout(
      generateFn({ model: modelName, contents, config }),
      GEMINI_CLIENT_TIMEOUT_MS
    );
    return (response.text ?? '').trim();
  };

  try {
    return await tryGenerate(true);
  } catch (genErr: unknown) {
    const msg = genErr instanceof Error ? genErr.message : String(genErr);
    if (msg.includes('Developer instruction') || msg.includes('systemInstruction')) {
      return await tryGenerate(false);
    }
    throw genErr;
  }
}

/**
 * Executes the client-side Gemini recommendation generation across the configured
 * 3-model free-tier fallback chain with structured JSON output.
 */
export async function generateClientGeminiRecommendations(
  req: {
    city: string;
    currentPm25: number;
    safeWindow: SafeVentilationWindow;
    profile: LifestyleProfile;
    customQuestion?: string;
  },
  options?: {
    generateContentFn?: (params: {
      model: string;
      contents: string;
      config: GenerateContentConfig;
    }) => Promise<{ text?: string }>;
    backoffMs?: number;
  }
): Promise<{ cards: ActionCardData[]; modelUsed: string; generatedAt: string }> {
  let generateFn = options?.generateContentFn;

  if (!generateFn) {
    const apiKey =
      (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ||
      ((typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) as string | undefined);

    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      throw new Error('VITE_GEMINI_API_KEY is not configured in .env');
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: 'v1beta' },
    });
    generateFn = (params) => ai.models.generateContent(params);
  }

  const prompt = buildGeminiClientPrompt(req);
  const backoffMs = options?.backoffMs ?? GEMINI_RETRY_BACKOFF_MS;
  let lastError: Error | null = null;

  for (let i = 0; i < GEMINI_CANDIDATE_MODELS.length; i++) {
    const candidate = GEMINI_CANDIDATE_MODELS[i];
    try {
      const text = await invokeCandidateModel(
        generateFn,
        candidate.name,
        candidate.withThinking,
        prompt
      );
      if (!text) throw new Error('Empty response from model');

      const parsed: unknown = JSON.parse(text);
      if (!Array.isArray(parsed) || parsed.length !== 3) {
        throw new Error('Invalid JSON structure from Gemini');
      }

      const normalized = normalizeAiActionCards(parsed, req as ValidatedRecommendationRequest);
      if (!normalized) throw new Error('Failed to normalize action cards');

      return {
        cards: normalized,
        modelUsed: candidate.name,
        generatedAt: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const safeMsg = maskSensitiveErrorDetails(err);
      lastError = new Error(safeMsg);
      console.warn(`[Gemini Chain] ${candidate.name} failed (${safeMsg}). Trying next model...`);
      if (i < GEMINI_CANDIDATE_MODELS.length - 1 && backoffMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError || new Error('All 3 Gemini models in fallback chain failed');
}
