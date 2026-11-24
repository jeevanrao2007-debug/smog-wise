# SmogWise Security Architecture & Hardening Report

## 1. Threat Model & Assets

SmogWise handles:
1. **Private Household Lifestyle Profiles (`/households/{userId}`)**: Cooking fuel, commute mode, indoor filtration, vulnerable member status, city preference, and calendar-day deduplicated action keys (`YYYY-MM-DD:<actionId>`).
2. **Public City-Aggregated Community Counters (`/community_impact/{citySlug}`)**: Anonymized counts and cumulative modelled $\text{CO}_2$/$\text{NO}_x$ totals with **zero household PII and zero GPS coordinates**.
3. **Server-Side Gemini API Proxy (`POST /api/recommendations`)**: Uses a server-only `GEMINI_API_KEY` to generate structured action plans.

---

## 2. Verified Security Controls

### A. Location Privacy & Zero Public GPS Exposure
- **Coarse Grid Rounding (`src/utils/weatherService.ts`)**: Browser geolocation coordinates are rounded to `0.1°` (~11 km grid) via `roundCoordinateToCityGrid()` before display or lookup.
- **Public Ticker & City Sanitization (`src/utils/smogLogic.ts`)**: `sanitizePublicCityLabel()` and `formatTickerActionLine()` strip any raw coordinate strings (`lat, lon`, `°N/S/E/W`, `GPS`, `Local Area`) before writing to `/community_impact/{citySlug}`.
- **Database-Enforced GPS Rejection (`firestore.rules`)**: `isPublicSafeCityName()` and `isPublicSafeActionLine()` reject documents containing decimal coordinates (`-?[0-9]+\.[0-9]+`) or degree markers (`°`) at the Firestore security rules layer.

### B. Server-Only API Key Isolation & Upstream Guards (`server.ts`)
- `@google/genai` is imported and invoked exclusively on the server using `process.env.GEMINI_API_KEY`. Client bundles contain zero references to `@google/genai` or API keys.
- Upstream Gemini calls are guarded by a `12-second` timeout (`DEFAULT_AI_TIMEOUT_MS = 12_000`) so hung upstream connections cannot exhaust Express workers. Upstream failures fall back gracefully to the deterministic model and are **never cached**.

### C. Input Validation, Prompt-Injection Mitigation & Output Grounding (`src/utils/apiValidation.ts`)
- `validateRecommendationRequest()` sanitizes untrusted strings with `sanitizePlainText()` (stripping control characters, newlines, backticks, `{}`, `[]`, `<>`), validates strict numeric ranges (`PM2.5: 0..2000`, `Wind: 0..300`), and enforces enum allowlists for all 4 lifestyle fields plus optional `forceRefresh: boolean`.
- `normalizeAiActionCards()` validates parsed Gemini JSON and grounds all impact metrics through `src/utils/impactModel.ts`, clamping `pm25ReductionPercent` (`[5, 85]`), `passiveCigarettesAvoided` (`[0, 25]`), `co2AvoidedKg` (`[0, 25]`), and `noxAvoidedGrams` (`[0, 150]`).

### D. HTTP Hardening, Non-Spoofable Rate Limiting & Error Sanitization (`server.ts`)
- **Security Headers**: Disables `x-powered-by`; sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=()`, and `Cross-Origin-Resource-Policy: same-origin`.
- **Same-Origin / Allowlisted CORS**: Validates cross-origin `Origin` headers against the request host, `APP_URL`, or configured `allowedOrigins`; rejects unauthorized cross-origin API calls with `403`.
- **Anti-Spoofing Rate Limiter**: `resolveClientIp()` defaults `trustProxy` to `false`, binding rate-limit buckets strictly to `req.socket.remoteAddress` so forged `X-Forwarded-For` headers cannot bypass the `30 req / 60s` limit (`429 Too Many Requests` + `Retry-After: 60`). Proxy headers are only read if explicitly opted in via `TRUST_PROXY=true`.
- **Sanitized Error Handling**: Malformed JSON returns `400 Bad Request` (`{ error: 'Malformed JSON request body.' }`) and bodies over `64kb` return `413 Payload Too Large` (`{ error: 'Request payload exceeds the 64kb limit.' }`) with zero stack traces leaked.

### E. Zero-Trust Cloud Firestore Rules (`firestore.rules`) & Atomic Transactions
- **Static Analysis & Live Deployment**: Linted via `@firebase/eslint-plugin-security-rules` (`npm run lint:rules` -> `0` errors) and deployed to the provisioned Firestore database.
- **Enforced Invariants**:
  1. Global default-deny catch-all (`match /{document=**} { allow read, write: if false; }`).
  2. Path ID validation (`^[a-zA-Z0-9_\-]+$`, `1..128` chars) on `{userId}` and `{citySlug}`.
  3. Owner-only read/write on `/households/{userId}` with `allow list: if false`.
  4. Verified-email authentication (`request.auth.token.email_verified == true`) on all writes.
  5. Strict anti-shadow-field key allowlists (`hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` on update).
  6. Server-time enforcement (`createdAt == request.time`, immutable `createdAt`, `updatedAt == request.time`).
  7. **Per-Write Counter Delta Caps**: On `/community_impact/{citySlug}`, create requires `familiesCount == 1`, `co2AvoidedKg <= 25`, `noxAvoidedGrams <= 150`; update requires `familiesCount` delta `0..1`, `co2AvoidedKg` delta `0..25`, and `noxAvoidedGrams` delta `0..150`.
  8. **Atomic Client Updates**: `src/firebaseClient.ts` updates `/community_impact/{citySlug}` inside `runTransaction(db, ...)` after pre-validating payloads with `validateCommunityImpactPayload()`.
  9. **Firestore Emulator Authorization Test Suite**: `tests/firestore.emulator.test.ts` (using `@firebase/rules-unit-testing` + `firebase.json`) tests unauthorized household access, cross-user read/write/delete denial, list denial, unverified email rejection, shadow-field & immutable-field tampering, synthetic baseline rejection, excessive increment rejection (`+2` families, `+30 kg CO2`, `+200 g NOx`), counter decrement rejection, GPS leakage rejection, and concurrent `runTransaction` updates from two verified users. Configured as a blocking CI job in `.github/workflows/ci.yml` (`actions/setup-java@v4` + `firebase emulators:exec --only firestore "npm run test:rules:emulator"`).

---

## 3. Cloud Function Aggregation Evaluation & Remaining Risks

1. **Cloud Function Community Aggregation Evaluation**:
   - Moving `/community_impact/{citySlug}` writes into a server-side Cloud Function triggered by `/households/{userId}` was evaluated and intentionally **not** added in this repository because AI Studio's Starter Tier Firebase environment does not provision Blaze Cloud Functions deployment or allow server-side Admin SDK Firestore access. Rather than shipping an undeployable, untestable Cloud Function, SmogWise enforces atomic client `runTransaction` writes backed by strict deployed `firestore.rules` per-write delta caps (`+1` action, `+25 kg CO2`, `+150 g NOx`) and email-verified auth. In a Blaze-tier production deployment, migrating aggregation to an idempotent Cloud Function (keyed by `${userId}_${dateKey}_${actionId}`) is the clear next hardening step.
2. **Process-Local Rate Limiter & Cache**: `ipRateBuckets` and `recommendationCache` live in Node.js process memory. Horizontally scaled deployments should migrate both to Redis or place Cloud Armor in front of `/api/*`.
3. **Local Container vs. CI Emulator Execution**: Because this container lacks a Java JRE (`no java`), `tests/firestore.emulator.test.ts` is strictly type-checked locally via `tsc --noEmit` and executed against the real Firestore Emulator inside GitHub Actions CI (`ubuntu-latest` with Java 21).
4. **Dependency Vulnerability Scanning**: Because the workspace uses `bun.lock` instead of `package-lock.json`, `npm audit` returns `ENOLOCK`. Production CI should commit a single canonical lockfile and run automated CVE scanning on every pull request.
