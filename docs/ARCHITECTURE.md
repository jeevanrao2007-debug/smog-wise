# SmogWise System Architecture

## 1. High-Level Overview

SmogWise follows a modular full-stack single-page application (SPA) architecture with strict separation between UI presentation, pure domain/physics logic, weather/geocoding transport, security validation, and Express backend orchestration:

```
+-----------------------------------------------------------------------------------+
|                               Browser Client (React 19)                           |
|                                                                                   |
|  +---------------------------+  +--------------------------+  +----------------+  |
|  |     LiveSmogWindow        |  |   LifestyleProfileBar    |  |  ActionCards   |  |
|  | - Coarse GPS (0.1 deg)    |  | - 4 role="group" Toggles |  | - 3 AI Cards   |  |
|  | - Open-Meteo Combobox     |  | - Guest localStorage     |  | - Impact Model |  |
|  | - Safe 2h Window Banner   |  | - Firestore Sync         |  | - Disclosure   |  |
|  | - 24h Chart + Data Table  |  |                          |  | - Daily Dedup  |  |
|  +-------------+-------------+  +------------+-------------+  +-------+--------+  |
|                |                             |                        |           |
|                +--------------+--------------+------------------------+           |
|                               |                                                   |
|                               v                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |              Pure Domain, Impact & Transport Layer (src/utils/*)            |  |
|  |  - impactModel.ts: Exposure/emission formulas, caps, daily dedup keys       |  |
|  |  - weatherService.ts: Open-Meteo fetch/parse, coarse GPS grid rounding      |  |
|  |  - smogLogic.ts: Safe 2h window scoring, card builder, ticker sanitization  |  |
|  |  - apiValidation.ts: Input sanitization, AI grounding, Firestore validators |  |
|  +-------------+-----------------------------------+---------------------------+  |
+----------------|-----------------------------------|------------------------------+
                 |                                   |
                 | HTTPS (JSON)                      | HTTPS / Firestore SDK
                 v                                   v
+----------------------------------+   +--------------------------------------------+
|   Express 4 Backend (server.ts)  |   |     External Services & Cloud Persistence  |
|  - createApp() testable factory  |   |  - Open-Meteo AQ, Weather & Geocoding APIs |
|  - Same-origin CORS & CORP       |   |  - Firebase Auth (Google Sign-In Popup)    |
|  - Non-spoofable IP Rate Limiter |   |  - Cloud Firestore (households, atomic     |
|  - 10m TTL + 100-entry LRU Cache |   |    runTransaction on community_impact)     |
|  - @google/genai (12s timeout)   |   |                                            |
+----------------------------------+   +--------------------------------------------+
```

---

## 2. Module Responsibilities

| File Path | Layer | Responsibility |
|---|---|---|
| `server.ts` | Backend Server | Exports testable `createApp(options)` factory; binds port `3000` on direct execution; applies security headers (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Resource-Policy`), same-origin/allowlisted CORS, non-spoofable IP rate limiting (`trustProxy` defaults to `false`), 10-minute TTL + 100-entry LRU cache with `forceRefresh` bypass, 12s Gemini upstream timeout, and sanitized `400`/`413` JSON errors. |
| `src/types.ts` | Domain Contracts | Strict TypeScript interfaces (`LifestyleProfile`, `CityLocation`, `WeatherDataSource`, `HourlyAirPoint`, `SafeVentilationWindow`, `ImpactMethodology`, `ActionCardData`, `CommunityImpactDoc`). |
| `src/utils/impactModel.ts` | Pure Environmental Model | Encapsulates exposure-reduction and emission formulas (`calculateHouseholdExposureImpact`, `calculateNeighborhoodEmissionImpact`, `createImpactMethodology`), conservative per-action caps (`25 kg CO2`, `150 g NOx`), Berkeley Earth benchmark framing, and calendar-day deduplication keys (`YYYY-MM-DD:<actionId>`). |
| `src/utils/weatherService.ts` | Weather & Privacy Geo | Fetches and normalizes Open-Meteo Air Quality & Weather forecasts with `AbortController` and explicit `live` / `offline_fallback` tagging; rounds browser GPS coordinates to `0.1°` (~11 km grid) via `roundCoordinateToCityGrid`, formats proper `N/S`/`E/W` coordinates (`formatCoordinateDisplay`), and resolves coarse location labels via `resolvePrivacySafeLocationFromCoords`. |
| `src/utils/smogLogic.ts` | Pure Domain Logic | Computes the 06:00–21:00 Safe Ventilation Window (rejecting `<24h` or non-finite inputs, checking both window average AND current-hour PM2.5 before `open_now`, and handling passed daytime windows), builds calibrated fallback cards, sanitizes public city labels (`sanitizePublicCityLabel`), strips GPS from tickers (`formatTickerActionLine`), and validates household payloads. |
| `src/utils/apiValidation.ts` | Security & Boundary Layer | Sanitizes untrusted text (`sanitizePlainText`), validates `/api/recommendations` requests (including `forceRefresh`), grounds AI JSON outputs through `impactModel.ts` (`normalizeAiActionCards`), and validates Firestore community payloads including per-write delta caps (`validateCommunityImpactPayload`). |
| `src/firebase.ts` | Lazy Firebase Facade | Zero-Firebase-SDK facade exporting `loadFirebaseClient()` (memoized singleton dynamic `import('./firebaseClient')`), session hint helpers (`hasPersistedFirebaseSession`, `markFirebaseSessionActive`), and `handleFirestoreError()`. Prevents Guest Mode from downloading Firebase SDK chunks. |
| `src/firebaseClient.ts` | Deferred Cloud SDK | Dynamically imported only when a user signs in or restores an existing session. Initializes Firebase App, Auth, and Firestore (`firebaseConfig.firestoreDatabaseId`) once, runs `testConnection()`, and encapsulates `runTransaction` and `onSnapshot`. |
| `src/components/LiveSmogWindow.tsx` | Presentation (~338 lines) | Composes `CitySearchCombobox` and `HourlyForecastChart`, renders air-shed header, explicit `weatherSource` badge + simulation/offline disclosure banner, presets, and the Safe Ventilation Window Banner. |
| `src/components/CitySearchCombobox.tsx` | Presentation | Encapsulates debounced (`250ms`) Open-Meteo Geocoding search, `AbortController`, offline preset fallback, outside-click dismissal, and full ARIA combobox keyboard navigation (`ArrowDown`/`ArrowUp`/`Enter`/`Escape`). |
| `src/components/HourlyForecastChart.tsx` | Presentation | Encapsulates the 24-hour PM2.5 bar chart with WCAG 2.2 AA roving `tabIndex` keyboard arrow navigation (`ArrowLeft`/`ArrowRight`/`Home`/`End`), live `aria-live="polite"` readout, legend, and focusable 24-hour forecast `<table>`. |
| `src/components/LifestyleProfileBar.tsx` | Presentation | Renders 4 accessible `role="group"` toggle clusters (`aria-labelledby`, `aria-pressed`) with cloud vs. local persistence state. |
| `src/components/ActionCardsSection.tsx` | Presentation | Renders the 3 personalized action cards with `"Modelled Estimate"` labeling, expandable `"Why & How Estimated (Assumptions & Uncertainty)"` `<details>` methodology disclosure, and daily-deduplicated `"We Did This"` buttons. |
| `src/components/NeighborhoodImpactStrip.tsx` | Presentation | Strictly separates **Recorded Clean-Air Actions** (starting at `0`) from the clearly disclosed **Illustrative Neighborhood Scale Scenario (Modelled Benchmark — Not Live Telemetry)** box. |
| `src/components/ErrorBoundary.tsx` | Resilience | Catches runtime render or structured Firestore permission errors with accessible `role="alert"` recovery UI. |

---

## 3. Data Flow & Concurrency Guarantees

1. **Forecast & Cancellation Pipeline**:
   - `App.tsx` tracks city changes with an `AbortController` passed into `fetchOpenMeteoForecast`, cancelling stale network calls on rapid city switching and tagging every dataset with `weatherSource: 'live' | 'simulated' | 'offline_fallback'`.
2. **Recommendation Pipeline & Cache Invalidation**:
   - `App.tsx` computes immediate calibrated cards via `buildTailoredActionCards` and dispatches an abortable `POST /api/recommendations` request.
   - Cache keys include `city`, `currentPm25`, `windowLabel`, `avgPm25`, `avgWindSpeedKmh`, `worstPm25`, `worstHourLabel`, `statusType`, and all 4 lifestyle toggles. Entries expire after `600,000 ms` (10 minutes); `"Refresh AI Plan"` passes `forceRefresh: true`.
3. **Lazy Firebase Hydration, Atomic Updates & Stale-Closure Protection**:
   - Guest Mode never downloads or initializes Firebase (`firebaseRequestsCount: 0` verified in Chromium). Returning signed-in users restore their session via `hasPersistedFirebaseSession()`; Guests clicking `"Sign in with Google"` await the memoized singleton `loadFirebaseClient()` promise (eliminating duplicate initialization or race conditions).
   - `App.tsx` stores current `city`, `profile`, and `completedKeys` in synced React refs (`cityRef`, `profileRef`, `completedKeysRef`) so `onAuthStateChanged` never reads stale state.
   - Authenticated `"We Did This"` actions update `/community_impact/{citySlug}` inside `runTransaction(db, ...)`.

---

## 4. Production Build & Lazy-Loading Measurements

`vite.config.ts` splits third-party dependencies via `manualChunks`, verified via `npm run build` (`696ms`, `0` warnings):

| Bundle Asset | Loading Strategy | Minified Size | Gzipped Size |
|---|---|---:|---:|
| `rolldown-runtime-*.js` | Initial (Guest + Auth) | `0.59 kB` | `0.36 kB` |
| `index-*.js` | Initial (Guest + Auth) | `103.15 kB` | `25.86 kB` |
| `vendor-ui-*.js` | Initial (Guest + Auth) | `431.93 kB` | `132.13 kB` |
| `firebaseClient-*.js` | **Lazy (Auth Only)** | `4.92 kB` | `2.04 kB` |
| `vendor-firebase-*.js` | **Lazy (Auth Only)** | `564.92 kB` | `169.76 kB` |
| `index-*.css` | Initial Stylesheet | `34.12 kB` | `6.78 kB` |

- **Initial JS Loaded in Guest Mode (Before Lazy-Loading)**: `1,100.14 kB` minified (`327.74 kB` gzip)
- **Initial JS Loaded in Guest Mode (After Lazy-Loading)**: `535.67 kB` minified (`158.35 kB` gzip)
- **Measured Guest Mode Reduction**: **`-564.47 kB` (-51.3%) minified / `-169.39 kB` (-51.7%) gzip**, verified via both `dist/index.html` preload analysis and Chromium Resource Timing (`firebaseRequestsCount: 0`).
