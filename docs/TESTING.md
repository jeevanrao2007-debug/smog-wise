# SmogWise Testing Strategy & Verification Report

## 1. Automated Verification Commands

```bash
# Strict TypeScript static check (src/** + tests/firestore.emulator.test.ts)
npm run lint

# ESLint Firestore security rules analyzer (@firebase/eslint-plugin-security-rules)
npm run lint:rules

# Complete 28-test unit, impact-model, HTTP integration, a11y & security suite
npm test

# Automated Desktop + Mobile Playwright E2E, fallback, lazy-load & axe-core WCAG 2.2 AA suite
npm run test:e2e

# Firestore Emulator authorization & concurrency rules suite (requires Java 21 + firebase-tools)
firebase emulators:exec --only firestore "npm run test:rules:emulator"

# Production build check
npm run build
```

---

## 2. Automated Unit, Integration & Security Suite (28/28 Passing)

### A. Core Domain, Boundary & Weather/Geolocation Tests (`src/utils/smogLogic.test.ts` — 11 Tests)
Covers `toCitySlug`, `formatHourLabel`, `<24h` & `NaN`/negative input rejection, `06:00–21:00` safe 2h window scoring, dual current-hour + window-average `<90` guard, exact `89/90/150/151` threshold transitions, past-window evening handling, severe smog curve, tailored action cards, household payload validation, Open-Meteo normalization, and coarse `0.1°` privacy geolocation.

### B. Environmental Impact Model & Daily Deduplication Tests (`src/utils/impactModel.test.ts` — 5 Tests)
Covers exposure reduction & Berkeley Earth passive-cigarette benchmark monotonicity, conservative per-action emission caps (`25 kg CO2`, `150 g NOx`), methodology disclosure completeness, calendar-day deduplication rollover, and `clampFinite` safety.

### C. Live Express HTTP API Integration Tests (`src/utils/apiIntegration.test.ts` — 7 Tests)
Runs against a real ephemeral-port Express server created via `createApp(...)`:
1. `GET /api/health` returns `200 OK`, security headers, and omits `x-powered-by`.
2. `POST /api/recommendations` rejects invalid payloads (`400`) and malformed JSON (`400`) without stack traces.
3. `POST /api/recommendations` rejects bodies `>64kb` (`413`).
4. Cache hit, TTL expiration (`cacheTtlMs`), and `forceRefresh: true` bypass.
5. Upstream AI throw/malformed JSON gracefully falls back to `calibrated_model` (`200`) without caching failures.
6. Non-spoofable rate limiter (`429` + `Retry-After`) ignoring forged `X-Forwarded-For` when `trustProxy: false`.
7. Same-origin / allowlisted CORS enforcement (`403` on unauthorized `Origin`).

### D. Firestore Security Contract Tests (`src/utils/firestoreRules.test.ts` — 3 Tests)
Verifies household Dirty Dozen schema rejection, community single-write delta caps & GPS privacy in TypeScript validators, and critical security invariants inside `firestore.rules`.

### E. Accessibility & Lazy-Loading Unit Tests (`src/utils/accessibilityAndLazy.test.ts` — 2 Tests)
1. `getNextHourlyBarIndex` verifies `ArrowRight`, `ArrowLeft`, `ArrowUp`, `ArrowDown`, `Home`, and `End` roving keyboard wrap-around and non-nav key pass-through.
2. Lazy Firebase facade confirms `isFirebaseClientLoaded() === false` and safe `hasPersistedFirebaseSession()` default in Guest Mode.

---

## 3. Firestore Emulator Runtime Rules Suite (`tests/firestore.emulator.test.ts`)

Real `@firebase/rules-unit-testing` suite (configured with `firebase.json` and blocking CI job `firestore-emulator-rules` in `.github/workflows/ci.yml`):
1. Denies unauthenticated access, cross-user household read/write/delete, collection `list`, and `email_verified: false` writes.
2. Blocks shadow-field injection (`isAdmin`), `userId` hijacking, and immutable `createdAt` tampering.
3. Blocks unauthenticated community writes, synthetic baselines (`familiesCount: 313`), GPS leakage (`GPS`, `28.61°`), excessive increments (`+2` families, `+35 kg CO2`, `+250 g NOx`), counter decreases, spoofed `lastActionBy`, `list`, and `delete`.
4. Verifies concurrent `runTransaction` updates from two verified users serialize cleanly to `familiesCount: 2` without lost increments.

*Execution status*: Type-checked locally via `tsc --noEmit` (`0` errors) and wired into GitHub Actions CI (`ubuntu-latest` + Java 21). Not executed locally inside this container because Java JRE is not installed (`no java`).

---

## 4. Automated Playwright E2E & `axe-core` WCAG 2.2 AA Suite (`e2e/run-e2e.sh`)

Executed locally via `npm run test:e2e` (exit code `0`) and wired into `.github/workflows/ci.yml` as blocking job `e2e-and-accessibility`:
- **Uncaught Page Errors**: `0`
- **Guest Mode Lazy Firebase Verification**: `firebaseRequestsCount: 0` (`firebaseRequestNames: []`)
- **Desktop (`1280×900`) Initial `axe-core` WCAG 2.2 AA**: **0 violations** (`24` passes)
- **Full Family Journey**: Combobox `ArrowDown` (`aria-activedescendant="city-option-1172451"`) + `Escape`; Milan preset (`<h1>`); Two-Wheeler toggle (`aria-pressed="true"`); roving chart keyboard nav (`15 -> 16 -> 0 -> 23`, live readout updates to `11:00 PM`); 24-row forecast table; expanded methodology disclosure; `"We Did This"` counter increment (`0 -> 1`) + disabled button.
- **Severe Smog Scenario + Desktop `axe-core`**: `aria-checked="true"`, `Keep Sealed Today` banner, **0 violations** (`28` passes).
- **HTTP `503` Recommendation API Failure Fallback**: Intercepted `/api/recommendations` with `503`, clicked `"Refresh AI Plan"`, verified `3` calibrated action cards + `"Calibrated Atmospheric Dispersion"` label with `0` uncaught exceptions.
- **Mobile (`390×844`) Layout, Keyboard & `axe-core`**: `scrollWidth === 390` / `clientWidth === 390` (`hasHorizontalOverflow: false`), mobile `ArrowLeft` roving focus (`14 -> 13`), **0 violations** (`27` passes).

---

## 5. Known Testing Gaps

- **Local Java / Emulator Runtime**: Local container has no Java JRE (`no java`), so `tests/firestore.emulator.test.ts` runs in GitHub Actions CI rather than locally.
- **Interactive Google OAuth Popup**: Live Google sign-in popups require real account credentials in a top-level browser session.
- **Manual Screen-Reader Testing**: Automated `axe-core` and keyboard-focus assertions are verified; manual NVDA/VoiceOver sessions were not performed in this headless Linux environment.
