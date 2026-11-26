import 'dotenv/config';
import express, { Express, NextFunction, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GenerateContentConfig, GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  normalizeAiActionCards,
  ValidatedRecommendationRequest,
  validateRecommendationRequest,
} from './src/utils/apiValidation';
import { ActionCardData } from './src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_MAX_CACHE_ENTRIES = 100;
export const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
export const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 30;
const GEMINI_TIMEOUT_MS = 12_000;

export interface CreateAppOptions {
  apiKey?: string;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
  trustProxy?: boolean;
  allowedOrigins?: string[];
  now?: () => number;
  /** Optional injectable AI card generator for deterministic HTTP integration testing */
  generateRawAiJson?: (
    validated: ValidatedRecommendationRequest,
    prompt: string
  ) => Promise<string>;
}

interface CacheEntry {
  cards: ActionCardData[];
  modelUsed?: string;
  generatedAt?: string;
  expiresAt: number;
}

export function buildRecommendationCacheKey(validated: ValidatedRecommendationRequest): string {
  return JSON.stringify({
    city: validated.city,
    currentPm25: validated.currentPm25,
    windowLabel: validated.safeWindow.windowLabel,
    avgPm25: validated.safeWindow.avgPm25,
    avgWindSpeedKmh: validated.safeWindow.avgWindSpeedKmh,
    worstPm25: validated.safeWindow.worstPm25,
    worstHourLabel: validated.safeWindow.worstHourLabel,
    statusType: validated.safeWindow.statusType,
    profile: validated.profile,
    customQuestion: validated.customQuestion || '',
  });
}

export function buildGeminiPrompt(validated: ValidatedRecommendationRequest): string {
  const { city, currentPm25, safeWindow, profile, customQuestion } = validated;
  const cookingDesc = profile.cookingFuel === 'gas' ? 'Gas Stove' : 'Induction / Electric';
  const filtrationDesc =
    profile.indoorFiltration === 'has_purifier' ? 'Have Air Purifier' : 'No Air Purifier';
  const vulnerableDesc =
    profile.vulnerableMembers === 'yes' ? 'Kids or Seniors at Home (Yes)' : 'No Vulnerable Members';
  const commuteDesc = profile.commute;

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

async function callGeminiModel(
  ai: GoogleGenAI,
  modelName: string,
  prompt: string
): Promise<string> {
  const tryCall = async (withThinking: boolean) => {
    const config: GenerateContentConfig = {
      systemInstruction:
        "You are an atmospheric scientist and indoor air quality engineer generating deeply personalized, honest, non-medical family smog routines. You must strictly ground every card in the user's specific city name, exact PM2.5 levels, safe ventilation window hours, household toggles, and custom question. Always output valid JSON matching the schema.",
      responseMimeType: 'application/json',
      responseSchema: GEMINI_RESPONSE_SCHEMA,
    };
    if (withThinking) {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
    }
    const response = await withTimeout(
      ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config,
      }),
      GEMINI_TIMEOUT_MS
    );
    return (response.text ?? '').trim();
  };

  try {
    return await tryCall(true);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('thinking') ||
      msg.includes('thinkingConfig') ||
      msg.includes('ThinkingLevel') ||
      msg.includes('not supported')
    ) {
      return await tryCall(false);
    }
    throw err;
  }
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');

  const trustProxy = options.trustProxy ?? process.env.TRUST_PROXY === 'true';
  app.set('trust proxy', trustProxy ? 1 : false);

  const maxCacheEntries = options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const rateLimitWindowMs = options.rateLimitWindowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS;
  const rateLimitMaxRequests = options.rateLimitMaxRequests ?? DEFAULT_RATE_LIMIT_MAX_REQUESTS;
  const getNow = options.now ?? (() => Date.now());

  const configuredAppUrl = process.env.APP_URL;
  const allowedOrigins = new Set<string>(options.allowedOrigins || []);
  if (configuredAppUrl) {
    try {
      allowedOrigins.add(new URL(configuredAppUrl).origin);
    } catch {
      // ignore invalid APP_URL
    }
  }

  // Security headers & strict same-origin / allowlisted CORS policy
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=(), payment=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

    const origin = req.headers.origin;
    if (origin) {
      const hostOrigin = req.headers.host ? `${req.protocol}://${req.headers.host}` : '';
      if (origin === hostOrigin || allowedOrigins.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      }
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
    }

    next();
  });

  app.use(express.json({ limit: '64kb' }));

  // Sanitized JSON parser & payload-size error handler (prevents leaking stack traces)
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err && typeof err === 'object') {
      const status = 'status' in err && typeof err.status === 'number' ? err.status : 0;
      const type = 'type' in err && typeof err.type === 'string' ? err.type : '';
      if (type === 'entity.too.large' || status === 413) {
        res.status(413).json({
          error: 'Request payload exceeds the 64kb safety limit.',
          code: 'PAYLOAD_TOO_LARGE',
        });
        return;
      }
      if (err instanceof SyntaxError || status === 400) {
        res.status(400).json({
          error: 'Malformed JSON body.',
          code: 'MALFORMED_JSON',
        });
        return;
      }
    }
    next(err);
  });

  const recommendationsCache = new Map<string, CacheEntry>();
  const ipRateBuckets = new Map<string, { count: number; resetAt: number }>();

  function getCachedEntry(key: string): CacheEntry | null {
    const entry = recommendationsCache.get(key);
    if (!entry) return null;
    if (getNow() > entry.expiresAt) {
      recommendationsCache.delete(key);
      return null;
    }
    // Refresh LRU order on hit
    recommendationsCache.delete(key);
    recommendationsCache.set(key, entry);
    return entry;
  }

  function setBoundedCache(
    key: string,
    cards: ActionCardData[],
    modelUsed?: string,
    generatedAt?: string
  ) {
    const now = getNow();
    if (recommendationsCache.has(key)) {
      recommendationsCache.delete(key);
    } else if (recommendationsCache.size >= maxCacheEntries) {
      // First evict any expired entries, then oldest LRU entry
      for (const [k, v] of recommendationsCache.entries()) {
        if (now > v.expiresAt) recommendationsCache.delete(k);
      }
      while (recommendationsCache.size >= maxCacheEntries) {
        const oldestKey = recommendationsCache.keys().next().value;
        if (oldestKey === undefined) break;
        recommendationsCache.delete(oldestKey);
      }
    }
    recommendationsCache.set(key, {
      cards,
      modelUsed,
      generatedAt,
      expiresAt: now + cacheTtlMs,
    });
  }

  function resolveClientIp(req: Request): string {
    // Only trust X-Forwarded-For when TRUST_PROXY is explicitly enabled (Express handles req.ip safely).
    // Otherwise bind strictly to socket remoteAddress so clients cannot spoof X-Forwarded-For to bypass limits.
    if (trustProxy && req.ip) {
      return req.ip;
    }
    return req.socket.remoteAddress || 'local';
  }

  function checkRateLimit(ip: string): boolean {
    const now = getNow();
    if (ipRateBuckets.size > 500) {
      for (const [k, v] of ipRateBuckets.entries()) {
        if (now > v.resetAt) ipRateBuckets.delete(k);
      }
    }
    const bucket = ipRateBuckets.get(ip);
    if (!bucket || now > bucket.resetAt) {
      ipRateBuckets.set(ip, { count: 1, resetAt: now + rateLimitWindowMs });
      return true;
    }
    if (bucket.count >= rateLimitMaxRequests) {
      return false;
    }
    bucket.count += 1;
    return true;
  }

  app.get('/api/health', (_req, res) => {
    const now = getNow();
    let activeCacheEntries = 0;
    for (const [k, v] of recommendationsCache.entries()) {
      if (now > v.expiresAt) {
        recommendationsCache.delete(k);
      } else {
        activeCacheEntries++;
      }
    }
    res.json({
      status: 'ok',
      cacheEntries: activeCacheEntries,
      cacheTtlMs,
    });
  });

  app.get('/api/reverse-geocode', async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      res.status(400).json({ error: 'Invalid coordinates' });
      return;
    }

    const roundedLat = Number(lat.toFixed(1));
    const roundedLon = Number(lon.toFixed(1));

    try {
      const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?lat=${roundedLat}&lon=${roundedLon}&format=json`;
      const response = await fetch(nominatimUrl, {
        headers: {
          'User-Agent': 'SmogWiseApp/1.0',
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        const data = (await response.json()) as {
          address?: Record<string, string>;
        };
        const addr = data.address || {};
        const cityName =
          addr.city ||
          addr.town ||
          addr.village ||
          addr.municipality ||
          addr.county ||
          addr.state_district;
        const countryName = addr.country;

        if (cityName) {
          res.json({
            name: cityName,
            country: countryName,
            latitude: roundedLat,
            longitude: roundedLon,
          });
          return;
        }
      }
    } catch {
      // Fallback on network or external API errors
    }

    res.json({
      name: 'Local Urban Air Shed',
      country: 'Coarse Regional Grid',
      latitude: roundedLat,
      longitude: roundedLon,
    });
  });

  app.post('/api/recommendations', async (req, res) => {
    const clientIp = resolveClientIp(req);

    if (!checkRateLimit(clientIp)) {
      res.setHeader('Retry-After', String(Math.ceil(rateLimitWindowMs / 1000)));
      res.status(429).json({
        error: 'Rate limit exceeded. Please wait before refreshing again.',
        code: 'RATE_LIMITED',
      });
      return;
    }

    const validated = validateRecommendationRequest(req.body);
    if (!validated) {
      res.status(400).json({
        error:
          'Invalid request payload: check city, currentPm25 (0..2000), safeWindow, and profile enum values.',
        code: 'INVALID_PAYLOAD',
      });
      return;
    }

    const cacheKey = buildRecommendationCacheKey(validated);
    if (!validated.forceRefresh) {
      const cached = getCachedEntry(cacheKey);
      if (cached) {
        res.json({
          cards: cached.cards,
          source: 'gemini',
          modelUsed: cached.modelUsed || 'gemini-4-hydrogen',
          generatedAt: cached.generatedAt || new Date().toISOString(),
          cached: true,
        });
        return;
      }
    }

    const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    if (!options.generateRawAiJson && (!apiKey || apiKey === 'MY_GEMINI_API_KEY')) {
      res.status(200).json({
        cards: null,
        source: 'calibrated',
        error:
          'GEMINI_API_KEY is not configured in .env. Please configure a valid Gemini API key to receive live AI plans.',
        warning: 'GEMINI_API_KEY is not configured.',
      });
      return;
    }

    const prompt = buildGeminiPrompt(validated);

    try {
      let rawText = '';
      let successfulModel = 'gemini-4-hydrogen';

      if (options.generateRawAiJson) {
        rawText = await withTimeout(
          options.generateRawAiJson(validated, prompt),
          GEMINI_TIMEOUT_MS
        );
      } else {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            apiVersion: 'v1beta',
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const CANDIDATE_MODELS = ['gemini-4-hydrogen', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'];

        let lastChainError: unknown = null;
        for (let i = 0; i < CANDIDATE_MODELS.length; i++) {
          const candidateModel = CANDIDATE_MODELS[i];
          try {
            console.log(`[Gemini Chain] Requesting ${candidateModel}...`);
            rawText = await callGeminiModel(ai, candidateModel, prompt);
            if (rawText && rawText.trim().length > 0) {
              successfulModel = candidateModel;
              console.log(`[Gemini Chain] Success with ${candidateModel}`);
              break;
            }
          } catch (modelErr: unknown) {
            lastChainError = modelErr;
            const errMsg = modelErr instanceof Error ? modelErr.message : String(modelErr);
            console.warn(
              `[Gemini Chain] ${candidateModel} failed (${errMsg}). Trying next model in chain...`
            );
            if (i < CANDIDATE_MODELS.length - 1) {
              await new Promise((resolve) => setTimeout(resolve, 600));
            }
          }
        }

        if (!rawText && lastChainError) {
          throw lastChainError;
        }
      }

      const parsed = JSON.parse(rawText || '[]');
      const normalizedCards = normalizeAiActionCards(parsed, validated);
      if (normalizedCards) {
        const generatedAt = new Date().toISOString();
        setBoundedCache(cacheKey, normalizedCards, successfulModel, generatedAt);
        res.json({
          cards: normalizedCards,
          source: 'gemini',
          modelUsed: successfulModel,
          generatedAt,
          cached: false,
        });
        return;
      }

      // Never cache invalid/empty AI output
      res.status(200).json({
        cards: null,
        source: 'calibrated',
        error: 'AI response failed schema normalization. Please retry.',
        warning: 'AI response failed schema normalization.',
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`Gemini API error in /api/recommendations (${errMsg})`);
      res.status(200).json({
        cards: null,
        source: 'calibrated',
        error: `Gemini API call failed (${errMsg}). Free tier rate limit or connection issue. Please click Retry.`,
        warning: 'Upstream AI generation unavailable.',
      });
    }
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vitePromise = createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Final sanitized catch-all error middleware
  app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({
      error: 'Internal server error.',
      code: 'INTERNAL_ERROR',
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SmogWise server running on http://localhost:${PORT}`);
  });
}

// Only start HTTP listener when executed as the main entrypoint (not when imported by integration tests)
const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectExecution) {
  startServer();
}
