/**
 * Metadata describing a candidate Gemini model in the fallback execution chain.
 */
export interface GeminiModelCandidate {
  name: string;
  withThinking: boolean;
  displayName: string;
}

/**
 * Free-tier sequential fallback chain used to ensure high availability under
 * upstream 503, 429, or 500 transient errors.
 */
export const GEMINI_CANDIDATE_MODELS: readonly GeminiModelCandidate[] = [
  { name: 'gemini-4-hydrogen', withThinking: true, displayName: 'Gemini 4 Hydrogen' },
  { name: 'gemini-3.8-flash', withThinking: false, displayName: 'Gemini 3.8 Flash' },
  { name: 'gemini-3.5-flash-lite', withThinking: false, displayName: 'Gemini 3.5 Flash Lite' },
] as const;

/**
 * Backoff wait duration (ms) between consecutive candidate model retries.
 */
export const GEMINI_RETRY_BACKOFF_MS = 600;

/**
 * Per-request client-side timeout (ms) for direct Gemini SDK calls.
 */
export const GEMINI_CLIENT_TIMEOUT_MS = 10_000;

/**
 * Debounce delay (ms) applied to lifestyle toggle updates before calling Gemini.
 */
export const RECOMMENDATION_DEBOUNCE_MS = 800;

/**
 * System prompt instructing Gemini to generate grounded, non-medical JSON recommendations.
 */
export const GEMINI_SYSTEM_INSTRUCTION =
  "You are an atmospheric scientist and indoor air quality engineer generating deeply personalized, honest, non-medical family smog routines. You must strictly ground every card in the user's specific city name, exact PM2.5 levels, safe ventilation window hours, household toggles, and custom question. Always output valid JSON matching the schema.";
