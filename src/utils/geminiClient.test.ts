import test from 'node:test';
import assert from 'node:assert/strict';
import { GenerateContentConfig } from '@google/genai';
import { buildGeminiClientPrompt, generateClientGeminiRecommendations } from './geminiClient';
import { buildSimulatedOrFallbackHourlyPoints, calculateSafeVentilationWindow } from './smogLogic';
import { LifestyleProfile } from '../types';

const SAMPLE_PROFILE: LifestyleProfile = {
  cookingFuel: 'gas',
  commute: 'car',
  indoorFiltration: 'has_purifier',
  vulnerableMembers: 'yes',
};

function makeValidGeminiJson(city: string) {
  return JSON.stringify([
    {
      id: 'routine',
      categoryLabel: 'Low-Emission Daily Routine',
      title: `Shift ${city} car errands to clean window`,
      instruction: `Drive during the safe window in ${city}. Keep cabin recirculation active during peak smog.`,
      familyHealthImpact: {
        pm25ReductionPercent: 28,
        passiveCigarettesAvoided: 1.1,
        summaryText: 'Modelled exposure reduction.',
      },
      neighborhoodEmissionImpact: {
        co2AvoidedKg: 1.4,
        noxAvoidedGrams: 5.2,
        summaryText: 'Modelled CO2/NOx avoided.',
      },
      impactMethodology: {
        rationale: `Matches ${city} commute profile.`,
        targetPollutants: ['PM2.5', 'NOx'],
        assumptions: 'Assumes 4 km peak trip shifted.',
      },
      tickerSummary: 'shifted errands to the afternoon dispersion window',
    },
    {
      id: 'indoor_hack',
      categoryLabel: 'Indoor Air Quality Hack',
      title: 'Run HEPA bedroom loop',
      instruction: `Keep doors closed in ${city}. Run HEPA on medium speed during high outdoor peaks.`,
      familyHealthImpact: {
        pm25ReductionPercent: 45,
        passiveCigarettesAvoided: 1.8,
        summaryText: 'Modelled indoor exposure drop.',
      },
      neighborhoodEmissionImpact: {
        co2AvoidedKg: 0.3,
        noxAvoidedGrams: 1.9,
        summaryText: 'Low energy indoor mitigation.',
      },
      impactMethodology: {
        rationale: 'Protects kids and seniors indoors.',
        targetPollutants: ['PM2.5'],
        assumptions: 'Continuous closed-room HEPA circulation.',
      },
      tickerSummary: 'ran HEPA clean-room filtration during smog peak',
    },
    {
      id: 'sustainable_swap',
      categoryLabel: 'Sustainable Alternative',
      title: 'Pre-boil with electric kettle',
      instruction: `Use an electric kettle before gas simmering in ${city}. Cover pots tightly.`,
      familyHealthImpact: {
        pm25ReductionPercent: 22,
        passiveCigarettesAvoided: 0.9,
        summaryText: 'Reduced indoor NO2 and ultrafines.',
      },
      neighborhoodEmissionImpact: {
        co2AvoidedKg: 0.9,
        noxAvoidedGrams: 4.8,
        summaryText: 'Lowered kitchen gas combustion.',
      },
      impactMethodology: {
        rationale: 'Gas stoves release indoor NO2 during sealed-window days.',
        targetPollutants: ['PM2.5', 'NO2'],
        assumptions: '20 min/day burner reduction.',
      },
      tickerSummary: 'cut gas stove runtime with covered pots',
    },
  ]);
}

test('generateClientGeminiRecommendations executes 3-model failover (gemini-4-hydrogen -> gemini-3.8-flash -> gemini-3.5-flash-lite)', async () => {
  const { windowInfo } = calculateSafeVentilationWindow(
    buildSimulatedOrFallbackHourlyPoints(false),
    10
  );
  const modelsCalled: string[] = [];
  const thinkingConfigs: Array<unknown> = [];

  const result = await generateClientGeminiRecommendations(
    {
      city: 'Chennai',
      currentPm25: 18,
      safeWindow: windowInfo,
      profile: SAMPLE_PROFILE,
    },
    {
      backoffMs: 0,
      generateContentFn: async ({ model, config }) => {
        modelsCalled.push(model);
        thinkingConfigs.push(config.thinkingConfig ?? null);
        assert.equal(config.responseMimeType, 'application/json');
        assert.ok(config.responseSchema);

        if (model === 'gemini-4-hydrogen') {
          throw new Error('503 UNAVAILABLE: model overloaded');
        }
        if (model === 'gemini-3.8-flash') {
          throw new Error('429 RESOURCE_EXHAUSTED: rate limit exceeded');
        }
        return { text: makeValidGeminiJson('Chennai') };
      },
    }
  );

  assert.deepEqual(modelsCalled, [
    'gemini-4-hydrogen',
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
  ]);
  assert.ok(thinkingConfigs[0] !== null);
  assert.equal(thinkingConfigs[1], null);
  assert.equal(result.modelUsed, 'gemini-3.5-flash-lite');
  assert.equal(result.cards.length, 3);
  assert.equal(result.cards[0].id, 'routine');
  assert.equal(result.cards[1].id, 'indoor_hack');
  assert.equal(result.cards[2].id, 'sustainable_swap');
});

test('generateClientGeminiRecommendations falls back cleanly on Developer instruction rejection and rejects invalid JSON payloads', async () => {
  const { windowInfo } = calculateSafeVentilationWindow(
    buildSimulatedOrFallbackHourlyPoints(false),
    10
  );
  let callIndex = 0;
  let capturedFallbackContents = '';

  const recovered = await generateClientGeminiRecommendations(
    {
      city: 'Milan',
      currentPm25: 62,
      safeWindow: windowInfo,
      profile: SAMPLE_PROFILE,
    },
    {
      backoffMs: 0,
      generateContentFn: async ({
        contents,
        config,
      }: {
        model: string;
        contents: string;
        config: GenerateContentConfig;
      }) => {
        callIndex++;
        if (callIndex === 1 && config.systemInstruction) {
          throw new Error('Developer instruction is not enabled for api version');
        }
        capturedFallbackContents = contents;
        return { text: makeValidGeminiJson('Milan') };
      },
    }
  );

  assert.equal(recovered.modelUsed, 'gemini-4-hydrogen');
  assert.ok(capturedFallbackContents.includes('SYSTEM INSTRUCTIONS:'));

  // All 3 models return invalid JSON -> throws clear error
  await assert.rejects(
    () =>
      generateClientGeminiRecommendations(
        {
          city: 'Milan',
          currentPm25: 62,
          safeWindow: windowInfo,
          profile: SAMPLE_PROFILE,
        },
        {
          backoffMs: 0,
          generateContentFn: async () => ({ text: '{"not":"an-array"}' }),
        }
      ),
    /Invalid JSON structure from Gemini/
  );
});

test('buildGeminiClientPrompt embeds exact city, live metrics, and custom question without leaking state names', () => {
  const { windowInfo } = calculateSafeVentilationWindow(
    buildSimulatedOrFallbackHourlyPoints(false),
    10
  );
  const prompt = buildGeminiClientPrompt({
    city: 'Chennai',
    currentPm25: 14,
    safeWindow: windowInfo,
    profile: SAMPLE_PROFILE,
    customQuestion: 'Is 6 AM outdoor jogging safe today?',
  });

  assert.ok(prompt.includes('Chennai'));
  assert.ok(prompt.includes('14 µg/m³'));
  assert.ok(prompt.includes('Is 6 AM outdoor jogging safe today?'));
  assert.equal(prompt.includes('Tamil Nadu'), false);
});
