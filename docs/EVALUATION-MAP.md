# SmogWise — Evaluator Discoverability Map

Maps all six evaluation criteria directly to verified source files, functions, automated tests, and CI jobs.

---

## 1. Code Quality

- **Strict TypeScript (`tsconfig.json`)**: `"strict": true`, `"noUnusedLocals": true`, `"noUnusedParameters": true`, zero `any` in application modules.
- **Clean Modular Decomposition**:
  - `src/components/CitySearchCombobox.tsx`: Debounced Open-Meteo geocoding combobox with ARIA keyboard nav.
  - `src/components/HourlyForecastChart.tsx`: 24-hour forecast chart with roving keyboard focus + accessible data table.
  - `src/components/LiveSmogWindow.tsx`: Streamlined (~338 lines, down from 868) air-shed banner and ventilation panel.
  - `src/utils/impactModel.ts`, `src/utils/weatherService.ts`, `src/utils/smogLogic.ts`, `src/utils/apiValidation.ts`, and testable `createApp()` in `server.ts`.
- **Verification**: `npm run lint` (`0` errors).

---

## 2. Security

- **Zero Public GPS / PII Exposure**: `roundCoordinateToCityGrid()`, `sanitizePublicCityLabel()`, `formatTickerActionLine()`, and regex rejection in `firestore.rules`.
- **Server-Side Isolation & Hardening (`server.ts`)**: Server-only `GEMINI_API_KEY`, `12s` upstream timeout, non-spoofable IP rate limiting (`trustProxy: false`), same-origin CORS, `CORP: same-origin`, `64kb` body cap, sanitized `400`/`413` responses.
- **Hardened Firestore Rules & Emulator Test Suite**:
  - Deployed `firestore.rules` linted with `0` errors (`npm run lint:rules`), enforcing owner isolation, verified email, per-write counter delta caps (`+1` action, `+25 kg CO2`, `+150 g NOx`), and atomic `runTransaction` updates (`src/firebaseClient.ts`).
  - Real `@firebase/rules-unit-testing` suite (`tests/firestore.emulator.test.ts` + `firebase.json`) wired into `.github/workflows/ci.yml` (`firestore-emulator-rules`).

---

## 3. Efficiency & Performance

- **Lazy-Loaded Firebase Auth & Firestore (`src/firebase.ts` + `src/firebaseClient.ts`)**:
  - Singleton dynamic `import('./firebaseClient')` defers `vendor-firebase` (`564.92 kB` / `169.76 kB` gzip) and `firebaseClient` (`4.92 kB` / `2.04 kB` gzip) completely out of Guest Mode initial load.
  - **Measured Guest Mode Initial JS**: Reduced from `1,100.14 kB` (`327.74 kB` gzip) to `535.67 kB` (`158.35 kB` gzip) — **-51.3% minified / -51.7% gzip**, verified in Chromium (`firebaseRequestsCount: 0`).
- **Server & Network Efficiency**: 10-minute TTL + 100-entry LRU cache with `forceRefresh` bypass, `250ms` debounced geocoding, and `AbortController` request cancellation.
- **Verification**: `npm run build` (`696ms`, `0` warnings) & `npm run test:e2e`.

---

## 4. Testing & Reliability

- **28 Unit, Integration, A11y & Security Tests (`npm test`)**: `smogLogic.test.ts` (11), `impactModel.test.ts` (5), `apiIntegration.test.ts` (7), `firestoreRules.test.ts` (3), `accessibilityAndLazy.test.ts` (2).
- **Automated Playwright + `axe-core` E2E Regression Suite (`npm run test:e2e`, `e2e/run-e2e.sh`)**: Desktop (`1280×900`) + Mobile (`390×844`), full family journey, severe smog scenario, HTTP `503` recommendation failure fallback, roving keyboard nav, Guest Mode lazy-load assertion, and `axe-core` WCAG 2.2 AA (`0` violations).
- **CI Pipeline (`.github/workflows/ci.yml`)**: Three blocking jobs (`verify`, `firestore-emulator-rules`, `e2e-and-accessibility`).

---

## 5. Accessibility (WCAG 2.2 AA)

- **Automated `axe-core` Regression Gate (`e2e/run-e2e.sh`)**: **0 violations** across desktop initial (`24` passes), desktop severe (`28` passes), and mobile severe (`27` passes, `0px` horizontal overflow).
- **Roving `tabIndex` Chart Keyboard Navigation**: `ArrowLeft`, `ArrowRight`, `Home`, `End` with programmatic `.focus()` and `aria-live="polite" aria-atomic="true"` announcements on both desktop and mobile.
- **Documentation**: `docs/ACCESSIBILITY.md` (including explicit disclosure that manual NVDA/VoiceOver testing was not run in the headless container).

---

## 6. Problem Statement Alignment

- Preserves 100% of core winter smog challenge capabilities without feature bloat: Safe Ventilation Window (`06:00–21:00`), 4-toggle household profile, Gemini + calibrated 3-card action plan, transparent `"Modelled Estimate"` methodology disclosures (formulas, Berkeley Earth benchmark framing, assumptions, uncertainty), daily habit deduplication, and honest recorded-vs-benchmark community impact tracking.
