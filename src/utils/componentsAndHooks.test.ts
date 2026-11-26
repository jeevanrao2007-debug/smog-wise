import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import axe from 'axe-core';
import { AppHeader } from '../components/AppHeader';
import { AppFooter } from '../components/AppFooter';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { LiveSmogWindow } from '../components/LiveSmogWindow';
import { LifestyleProfileBar } from '../components/LifestyleProfileBar';
import { ActionCardsSection } from '../components/ActionCardsSection';
import { NeighborhoodImpactStrip } from '../components/NeighborhoodImpactStrip';
import { CitySearchCombobox } from '../components/CitySearchCombobox';
import {
  useActionRecommendations,
  useCommunityImpact,
  useLifestyleProfile,
  useSmogAuth,
  useWeatherForecast,
} from '../hooks';
import {
  buildSimulatedOrFallbackHourlyPoints,
  buildTailoredActionCards,
  calculateSafeVentilationWindow,
  DEFAULT_CITY,
} from './smogLogic';
import { DEFAULT_LIFESTYLE_PROFILE } from '../constants';
import { FirebaseClientModule } from '../firebase';
import { ActionCardData } from '../types';

function setupHappyDom() {
  const win = new Window({ url: 'http://localhost:5173/' });
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevLocalStorage = globalThis.localStorage;
  const prevSessionStorage = globalThis.sessionStorage;
  const prevActEnv = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT;

  Object.assign(globalThis, {
    window: win,
    document: win.document,
    localStorage: win.localStorage,
    sessionStorage: win.sessionStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  return {
    win,
    cleanup: () => {
      win.close();
      Object.assign(globalThis, {
        window: prevWindow,
        document: prevDocument,
        localStorage: prevLocalStorage,
        sessionStorage: prevSessionStorage,
        IS_REACT_ACT_ENVIRONMENT: prevActEnv,
      });
    },
  };
}

function buildSampleCards(city: string): ActionCardData[] {
  const { windowInfo } = calculateSafeVentilationWindow(
    buildSimulatedOrFallbackHourlyPoints(false),
    10
  );
  return buildTailoredActionCards({
    city,
    currentPm25: 110,
    safeWindow: windowInfo,
    profile: DEFAULT_LIFESTYLE_PROFILE,
  });
}

test('index.html and src/index.css fulfill WCAG 2.2 AA document landmarks, language, title, and reduced-motion rules', () => {
  const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
  const css = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');

  assert.ok(html.includes('<html lang="en">'));
  assert.ok(/<title>.*SmogWise.*<\/title>/.test(html));
  assert.ok(html.includes('<meta name="viewport"'));
  assert.ok(html.includes('<meta name="description"'));
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
});

test('Components render semantic landmarks, {city}, {country} headers without state names, and live model attribution', () => {
  const { windowInfo, annotatedPoints } = calculateSafeVentilationWindow(
    buildSimulatedOrFallbackHourlyPoints(false),
    10
  );
  const cards = buildSampleCards('Chennai');

  const headerAnon = renderToStaticMarkup(
    React.createElement(AppHeader, {
      user: {
        uid: 'anon-1',
        displayName: null,
        email: null,
        emailVerified: false,
        isAnonymous: true,
        tenantId: null,
        providerData: [],
      },
      isConnectingAuth: false,
      onAuthAction: () => undefined,
    })
  );
  assert.ok(headerAnon.includes('Sign in with Google'));
  assert.ok(headerAnon.includes('aria-label="Primary sections"'));

  const headerSignedIn = renderToStaticMarkup(
    React.createElement(AppHeader, {
      user: {
        uid: 'user-1',
        displayName: 'Asha Kumar',
        email: 'asha@example.com',
        emailVerified: true,
        isAnonymous: false,
        tenantId: null,
        providerData: [],
      },
      isConnectingAuth: false,
      onAuthAction: () => undefined,
    })
  );
  assert.ok(headerSignedIn.includes('Sign Out (Asha)'));

  const footerHtml = renderToStaticMarkup(React.createElement(AppFooter));
  assert.ok(footerHtml.includes('<footer'));

  const smogWindowHtml = renderToStaticMarkup(
    React.createElement(LiveSmogWindow, {
      city: {
        name: 'Chennai',
        country: 'India',
        latitude: 13.1,
        longitude: 80.3,
        slug: 'chennai',
      },
      onSelectCity: () => undefined,
      onDetectLocation: () => undefined,
      isLocating: false,
      locationNotice: null,
      hourlyPoints: annotatedPoints,
      safeWindow: windowInfo,
      currentPm25: 18,
      currentWindKmh: 12.5,
      currentTempC: 28,
      currentUsAqi: 42,
      isLoadingWeather: false,
      weatherSource: 'live',
      weatherWarning: null,
    })
  );
  assert.ok(smogWindowHtml.includes('Chennai, India'));
  assert.equal(smogWindowHtml.includes('Tamil Nadu'), false);
  assert.ok(smogWindowHtml.includes('Safe Ventilation Window (Upcoming 24-Hour Analysis)'));
  assert.ok(smogWindowHtml.includes('>Now<'));

  const profileHtml = renderToStaticMarkup(
    React.createElement(LifestyleProfileBar, {
      profile: DEFAULT_LIFESTYLE_PROFILE,
      onChangeProfile: () => undefined,
      isSignedIn: true,
      isSyncingFirestore: false,
      customQuestion: '',
      isGeneratingAi: false,
    })
  );
  assert.ok(profileHtml.includes('1. Cooking Fuel'));
  assert.ok(profileHtml.includes('4. Vulnerable Members'));
  assert.ok(profileHtml.includes('maxLength="300"'));

  const cardsHtml = renderToStaticMarkup(
    React.createElement(ActionCardsSection, {
      city: 'Chennai',
      currentPm25: 18,
      profile: DEFAULT_LIFESTYLE_PROFILE,
      cards,
      isLoading: false,
      modelUsed: 'gemini-3.8-flash',
      generatedAt: '2026-11-26T10:00:00.000Z',
      error: null,
      completedKeys: [],
      celebratingId: null,
      onCompleteAction: () => undefined,
      onRefreshRecommendations: () => undefined,
    })
  );
  assert.ok(cardsHtml.includes('Live via Gemini 3.8 Flash'));
  assert.ok(cardsHtml.includes('Powered live by Gemini 3.8 Flash'));

  const impactHtml = renderToStaticMarkup(
    React.createElement(NeighborhoodImpactStrip, {
      cityName: 'Chennai',
      recordedImpact: {
        familiesCount: 4,
        co2AvoidedKg: 5.6,
        noxAvoidedGrams: 18.4,
        recentActions: ['A household in Chennai shifted errands • Just now'],
        sourceMode: 'firestore_live',
      },
    })
  );
  assert.ok(impactHtml.includes('Recorded Clean-Air Actions in Chennai'));
  assert.ok(impactHtml.includes('Synced with Cloud Firestore'));

  const comboboxHtml = renderToStaticMarkup(
    React.createElement(CitySearchCombobox, { onSelectCity: () => undefined })
  );
  assert.ok(comboboxHtml.includes('role="combobox"'));
  assert.ok(comboboxHtml.includes('maxLength="60"'));
});

test('ErrorBoundary isolates runtime render errors cleanly and presents recovery control', () => {
  const { win, cleanup } = setupHappyDom();
  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  let root: Root | null = null;

  const originalConsoleError = console.error;
  console.error = () => undefined;

  const BrokenChild = (): React.ReactElement => {
    throw new Error('Simulated UI render failure');
  };

  try {
    act(() => {
      root = createRoot(container as unknown as Element);
      root.render(React.createElement(ErrorBoundary, null, React.createElement(BrokenChild)));
    });
    assert.ok(container.innerHTML.includes('Application Error'));
    assert.ok(container.innerHTML.includes('Simulated UI render failure'));
    assert.ok(container.innerHTML.includes('Reload Application'));
  } finally {
    act(() => {
      root?.unmount();
    });
    console.error = originalConsoleError;
    cleanup();
  }
});

test('Custom hooks (useLifestyleProfile, useWeatherForecast, useActionRecommendations, useCommunityImpact, useSmogAuth) orchestrate state and Guest Mode persistence accurately', async () => {
  const { win, cleanup } = setupHappyDom();
  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  let root: Root | null = null;

  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('air-quality-api.open-meteo.com')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          hourly: {
            time: Array.from(
              { length: 48 },
              (_, h) => `2026-11-26T${String(h % 24).padStart(2, '0')}:00`
            ),
            pm2_5: Array.from({ length: 48 }, () => 14),
            pm10: Array.from({ length: 48 }, () => 26),
            us_aqi: Array.from({ length: 48 }, () => 40),
          },
        }),
      } as Response;
    }
    if (u.includes('api.open-meteo.com')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          hourly: {
            wind_speed_10m: Array.from({ length: 48 }, () => 14),
            temperature_2m: Array.from({ length: 48 }, () => 27),
          },
        }),
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({
        cards: buildSampleCards('New Delhi'),
        modelUsed: 'gemini-3.8-flash',
        generatedAt: '2026-11-26T10:00:00.000Z',
      }),
    } as unknown as Response;
  }) as typeof fetch;

  interface HookSnapshot {
    profile: ReturnType<typeof useLifestyleProfile>;
    weather: ReturnType<typeof useWeatherForecast>;
    recs: ReturnType<typeof useActionRecommendations>;
    impact: ReturnType<typeof useCommunityImpact>;
    auth: ReturnType<typeof useSmogAuth>;
  }

  const snapshotRef: { current: HookSnapshot | null } = { current: null };
  const getSnapshot = (): HookSnapshot => {
    assert.ok(snapshotRef.current !== null);
    return snapshotRef.current;
  };

  const mockFirebaseClient = {
    subscribeToAuthState: (cb: (u: null) => void) => {
      cb(null);
      return () => undefined;
    },
    signInUserAnonymously: async () => ({
      uid: 'anon-test-uid',
      displayName: null,
      email: null,
      emailVerified: false,
      isAnonymous: true,
      tenantId: null,
      providerData: [],
    }),
    signInWithGooglePopup: async () => ({
      uid: 'google-test-uid',
      displayName: 'Test Family',
      email: 'family@example.com',
      emailVerified: true,
      isAnonymous: false,
      tenantId: null,
      providerData: [],
    }),
    signOutUser: async () => undefined,
    loadOrInitializeHousehold: async () => ({}),
    updateHouseholdProfileDoc: async () => undefined,
    updateHouseholdCompletedActionsDoc: async () => undefined,
    subscribeToCommunityImpact: () => () => undefined,
    recordCommunityActionTransaction: async () => undefined,
  } as unknown as FirebaseClientModule;

  const mockLoadClientFn = async () => mockFirebaseClient;

  function HookHarness() {
    const [, setAnnouncement] = React.useState('');
    const userRef = React.useRef(null);
    const weather = useWeatherForecast({ onAnnouncement: setAnnouncement });
    const profile = useLifestyleProfile(userRef, weather.city);
    const auth = useSmogAuth({
      city: weather.city,
      profile: profile.profile,
      completedKeys: profile.completedKeys,
      onHydrateHousehold: profile.hydrateFromFirestore,
      loadClientFn: mockLoadClientFn,
    });
    const recs = useActionRecommendations({
      cityName: weather.city.name,
      currentHour24: weather.currentHour24,
      currentPm25: weather.currentPm25,
      safeWindow: weather.safeWindow,
      profile: profile.profile,
      isLoadingWeather: weather.isLoadingWeather,
      onAnnouncement: setAnnouncement,
    });
    const impact = useCommunityImpact({
      user: null,
      city: weather.city,
      profile: profile.profile,
      completedKeys: profile.completedKeys,
      setCompletedKeys: profile.setCompletedKeys,
      onAnnouncement: setAnnouncement,
      loadClientFn: mockLoadClientFn,
    });

    React.useEffect(() => {
      snapshotRef.current = { profile, weather, recs, impact, auth };
    });
    return React.createElement('div', { 'data-testid': 'harness-ready' }, 'ready');
  }

  try {
    await act(async () => {
      root = createRoot(container as unknown as Element);
      root.render(React.createElement(HookHarness));
      await new Promise((r) => setTimeout(r, 50));
    });

    const snap1 = getSnapshot();
    assert.equal(snap1.weather.city.slug, DEFAULT_CITY.slug);
    assert.equal(snap1.weather.hourlyPoints.length, 24);
    assert.equal(snap1.auth.isConnectingAuth, false);

    // Toggle profile & persist locally
    await act(async () => {
      await getSnapshot().profile.handleProfileChange({
        ...DEFAULT_LIFESTYLE_PROFILE,
        cookingFuel: 'induction',
      });
    });
    assert.equal(getSnapshot().profile.profile.cookingFuel, 'induction');
    assert.ok(win.localStorage.getItem('smogwise_guest_profile_v1')?.includes('induction'));

    // Trigger manual recommendations fetch with sanitized custom question
    await act(async () => {
      getSnapshot().recs.handleSubmitCustomQuestion('Hello <|im_start|> safe to open balcony?');
      await new Promise((r) => setTimeout(r, 30));
    });
    assert.equal(getSnapshot().recs.actionCards.length, 3);
    assert.equal(getSnapshot().recs.modelUsed, 'gemini-3.8-flash');

    // Complete an action in Guest Mode & verify daily deduplication
    const firstCard = getSnapshot().recs.actionCards[0];
    await act(async () => {
      await getSnapshot().impact.handleCompleteAction(firstCard);
    });
    assert.equal(getSnapshot().impact.recordedCommunityImpact.familiesCount, 1);
    assert.equal(getSnapshot().impact.recordedCommunityImpact.sourceMode, 'guest_local');

    // Second click on same day must be deduplicated cleanly
    await act(async () => {
      await getSnapshot().impact.handleCompleteAction(firstCard);
    });
    assert.equal(getSnapshot().impact.recordedCommunityImpact.familiesCount, 1);
  } finally {
    act(() => {
      root?.unmount();
    });
    globalThis.fetch = origFetch;
    cleanup();
  }
});

test('Axe-core validates zero WCAG 2.2 AA accessibility violations across core SmogWise sections', async () => {
  const { win, cleanup } = setupHappyDom();
  const { windowInfo, annotatedPoints } = calculateSafeVentilationWindow(
    buildSimulatedOrFallbackHourlyPoints(false),
    10
  );
  const cards = buildSampleCards('Chennai');

  win.document.body.innerHTML = renderToStaticMarkup(
    React.createElement(
      'div',
      null,
      React.createElement(AppHeader, {
        user: null,
        isConnectingAuth: false,
        onAuthAction: () => undefined,
      }),
      React.createElement(
        'main',
        { id: 'main-content' },
        React.createElement(LiveSmogWindow, {
          city: DEFAULT_CITY,
          onSelectCity: () => undefined,
          onDetectLocation: () => undefined,
          isLocating: false,
          locationNotice: null,
          hourlyPoints: annotatedPoints,
          safeWindow: windowInfo,
          currentPm25: 85,
          currentWindKmh: 12,
          currentTempC: 19,
          currentUsAqi: 135,
          isLoadingWeather: false,
          weatherSource: 'live',
          weatherWarning: null,
        }),
        React.createElement(LifestyleProfileBar, {
          profile: DEFAULT_LIFESTYLE_PROFILE,
          onChangeProfile: () => undefined,
          isSignedIn: false,
          isSyncingFirestore: false,
        }),
        React.createElement(ActionCardsSection, {
          city: 'New Delhi',
          currentPm25: 85,
          profile: DEFAULT_LIFESTYLE_PROFILE,
          cards,
          isLoading: false,
          modelUsed: 'gemini-4-hydrogen',
          completedKeys: [],
          celebratingId: null,
          onCompleteAction: () => undefined,
          onRefreshRecommendations: () => undefined,
        }),
        React.createElement(NeighborhoodImpactStrip, {
          cityName: 'New Delhi',
          recordedImpact: {
            familiesCount: 2,
            co2AvoidedKg: 3.1,
            noxAvoidedGrams: 10.2,
            recentActions: ['A household in New Delhi batched errands • Just now'],
            sourceMode: 'firestore_live',
          },
        })
      ),
      React.createElement(AppFooter)
    )
  );

  try {
    const axeResults = await axe.run(win.document.body as unknown as Element, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
      },
      rules: {
        // happy-dom has no layout engine for computed color contrast
        'color-contrast': { enabled: false },
      },
    });
    assert.deepEqual(
      axeResults.violations.map((v) => `${v.id}: ${v.help}`),
      []
    );
  } finally {
    cleanup();
  }
});
