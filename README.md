# SmogWise — GenAI Family Smog Navigation & Clean Air Assistant

SmogWise is an intelligent, privacy-first web application designed to help families and urban communities navigate severe winter smog and urban air pollution. Powered by Google Gemini and live atmospheric dispersion telemetry from Open-Meteo, SmogWise delivers hyper-localized safe ventilation timing, lifestyle-tailored indoor clean-air routines, sustainable commuting alternatives, and transparently quantified health and emissions impact.

---

## 1. Challenge & Problem Statement

During severe winter smog events and urban thermal inversions, cities worldwide face dangerous atmospheric conditions where stagnant cold air traps hazardous concentrations of particulate matter ($\text{PM}_{2.5}$, $\text{PM}_{10}$) and nitrogen oxides ($\text{NO}_x$) near ground level.

Urban families encounter critical challenges:
- **Hazardous Ventilation Timing**: Opening windows during morning or evening thermal inversion peaks pulls concentrated toxic smog directly indoors.
- **Negative Pressure Contamination**: Running kitchen exhaust fans without filtered makeup air creates indoor vacuum pressure, sucking unconditioned particulate smog through building crevices and door gaps.
- **Generic, Non-Actionable Advice**: Standard AQI apps display red numbers and vague health warnings ("wear a mask"), but fail to provide actionable guidance tailored to a family's cooking fuel, daily commute mode, indoor filtration capabilities, or vulnerable household members (infants, elderly, asthma patients).
- **Invisible Impact**: Families cannot easily see how their individual household choices directly reduce their personal toxic inhalation or contribute to collective neighborhood emission reductions.

---

## 2. The SmogWise Solution

SmogWise solves these challenges with five core pillars:

1. **Upcoming 24-Hour Safe Ventilation Window**:
   - Analyzes a 48-hour forward forecast (`forecast_days=2`) from Open-Meteo Air Quality and Weather APIs.
   - Slices the forecast starting from the user's current local hour (`Now`) for the next 24 consecutive hours so past hours are never displayed.
   - Evaluates contiguous 2-hour windows to identify optimal atmospheric dispersion, balancing minimal $\text{PM}_{2.5}$ with high wind dispersion velocity.
2. **Three Scientifically Accurate Status Tiers**:
   - **Tier 1 — Clean Air All Day (`max upcoming PM2.5 <= 25 µg/m³`)**:  
     Green status: **"Clean Air — Safe to Ventilate Anytime"**. Confirms ambient air meets WHO clean air thresholds, while highlighting the single cleanest 2-hour window for deep airing out.
   - **Tier 2 — Smog Peaks Present (`max upcoming PM2.5` between `26` and `150 µg/m³`)**:  
     If `Now` is within the cleanest 2-hour window and current $\text{PM}_{2.5} \le 60\ \mu\text{g/m}^3$, displays **"Open Windows Now"**. Otherwise displays amber **"Best Upcoming Window: [Start] – [End]"**, advising families to keep windows closed during peak hours and ventilate during optimal dispersion.
   - **Tier 3 — Severe Winter Smog (`cleanest upcoming window > 150 µg/m³`)**:  
     Red status: **"Severe Smog — Keep Windows Sealed"**, advising active HEPA filtration and door-gap draft sealing, while noting the lowest-pollution window if brief air exchange is required.
3. **4-Toggle Household Profile + Custom Scenario Prompt Bar**:
   - Customizes guidance based on **Cooking Fuel** (Gas Stove vs. Induction/Electric), **Primary Commute** (Car, Two-Wheeler, Public Transit, Walk/Cycle, Work from Home), **Indoor Air Filtration** (HEPA Purifier vs. DIY/No Purifier), and **Vulnerable Members** (Kids, Seniors, Respiratory Sensitivity).
   - An interactive scenario bar allows users to query custom questions (e.g., *"How do I safely dry laundry during smog?"* or *"Is a 6 AM jog safe tomorrow?"*) for real-time AI reasoning.
4. **Structured Gemini Free-Tier Fallback Chain (Strict Anti-Static Guarantee)**:
   - Generates three structured daily action cards (**Low-Emission Daily Routine**, **Indoor Air Quality Hack**, **Sustainable Alternative**) grounded in transparent health impact formulas.
   - Employs a robust three-model sequence (`gemini-4-hydrogen` $\to$ `gemini-3.8-flash` $\to$ `gemini-3.5-flash-lite`) with 600ms exponential retry backoff.
   - Strictly validates output structure using JSON schema (`responseSchema`) with zero hardcoded or static placeholder fallback cards.
5. **Real-Time Neighborhood Impact Strip & Community Counter**:
   - Authenticates visitors seamlessly with anonymous authentication (`signInAnonymously`) on page load or Google Sign-In.
   - Records completed actions via atomic Cloud Firestore transactions (`community_impact/{citySlug}`), updating live neighborhood counters and the real-time activity feed with date-scoped deduplication.

---

## 3. Safe Ventilation Window & 24-Hour Dispersion Graph

### Mathematical Dispersion Scoring
For each contiguous 2-hour window starting at upcoming index $h$ ($0 \le h \le 22$):

$$\text{Score}(h) = \overline{\text{PM}_{2.5}}(h, h+1) - \min\left(1.35 \times \overline{\text{Wind}}_{10\text{m}}(h, h+1),\ 35\right)$$

Where:
- $\overline{\text{PM}_{2.5}}(h, h+1)$ is the average $\text{PM}_{2.5}$ concentration ($\mu\text{g/m}^3$) across the 2-hour window.
- $\overline{\text{Wind}}_{10\text{m}}(h, h+1)$ is the average wind speed at 10 meters ($\text{km/h}$).
- The dispersion bonus is capped at $35\ \mu\text{g/m}^3$ to prevent high wind from masking dangerous pollution levels.

### Chart Features
- **Bar 1 starts at `"Now"`**: Followed by the next 23 consecutive hours in clean 12-hour format (`"Now"`, `"9 PM"`, `"11 PM"`, `"1 AM"`, etc.).
- **De-cluttered X-Axis**: Every 2nd label is rendered to prevent overlapping on mobile screens.
- **Dynamic Bar Scaling**: Scaled relative to $\max(\dots\text{PM}_{2.5}, 20)$ so clean-air cities ($3\text{--}6\ \mu\text{g/m}^3$) render clearly visible, proportional bars.

---

## 4. Gemini AI Resilience Architecture

```
[User Request / Lifestyle Profile / Air Quality Telemetry]
                           │
                           ▼
             Try Model 1: gemini-4-hydrogen
             (thinkingConfig: { thinkingLevel: 'low' })
                           │
                ┌──────────┴──────────┐
             Success?               Fails (503 / 429 / 500)
                │                             │
                ▼                             ▼
        Return Plan JSON             600ms Backoff Delay
                                              │
                                              ▼
                               Try Model 2: gemini-3.8-flash
                                              │
                                   ┌──────────┴──────────┐
                                Success?               Fails (503 / 429 / 500)
                                   │                             │
                                   ▼                             ▼
                           Return Plan JSON             600ms Backoff Delay
                                                                 │
                                                                 ▼
                                                  Try Model 3: gemini-3.5-flash-lite
                                                                 │
                                                      ┌──────────┴──────────┐
                                                   Success?               All 3 Fail
                                                      │                       │
                                                      ▼                       ▼
                                              Return Plan JSON        Display Error Banner
                                                                      (with Retry Button)
```

- **Zero Mock / Placeholder Policy**: Per strict anti-static rules, hardcoded placeholder cards are never displayed. The user always receives authentic, live Gemini-generated plans.
- **Model Attribution Badge**: The active model is displayed live in the interface (e.g., *"Live via Gemini 3.8 Flash"* or *"Live via Gemini 4 Hydrogen"*).

---

## 5. Technology Stack

- **Frontend & UI**: React 19, Vite, TypeScript, Tailwind CSS, Lucide Icons, Motion
- **Artificial Intelligence**: Google GenAI SDK (`@google/genai`) with structured JSON schema (`responseSchema`)
- **Backend & Real-Time Sync**: Firebase Auth (Anonymous & Google OAuth Popup), Cloud Firestore (`runTransaction`, `onSnapshot`)
- **Atmospheric Data**: Open-Meteo Air Quality & Weather API, Open-Meteo Geocoding API
- **Testing & Quality Assurance**: Node.js Native Test Runner (`node:test`), Axe Accessibility Auditing, Strict TypeScript (`tsc --noEmit`)

---

## 6. Local Development & Setup

### Prerequisites
- Node.js 20+ installed
- A Google Gemini API key from [Google AI Studio](https://aistudio.google.com/)
- (Optional) A Firebase project with Cloud Firestore and Authentication enabled

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/jeevanrao2007-debug/smog-wise.git
   cd smog-wise
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy the example `.env.example` file to create `.env`:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and set your Gemini API key:
   ```env
   VITE_GEMINI_API_KEY=your_actual_gemini_api_key_here
   GEMINI_API_KEY=your_actual_gemini_api_key_here
   ```

4. **Configure Firebase Client Credentials**:
   Copy `firebase-applet-config.example.json` to `firebase-applet-config.json`:
   ```bash
   cp firebase-applet-config.example.json firebase-applet-config.json
   ```
   Add your Firebase Web App configuration credentials to `firebase-applet-config.json`:
   ```json
   {
     "projectId": "your-firebase-project-id",
     "appId": "your-firebase-app-id",
     "apiKey": "your-firebase-api-key",
     "authDomain": "your-firebase-project-id.firebaseapp.com",
     "firestoreDatabaseId": "(default)",
     "storageBucket": "your-firebase-project-id.firebasestorage.app",
     "messagingSenderId": "your-messaging-sender-id",
     "measurementId": "",
     "oAuthClientId": "your-oauth-client-id.apps.googleusercontent.com",
     "recaptchaSiteKey": ""
   }
   ```

5. **Start the Development Server**:
   ```bash
   npm run dev
   ```
   The local application will be available at `http://localhost:5173`.

---

## 7. Quality Assurance & Verification

Run the full TypeScript check and automated test suite:

```bash
# Type-check with zero errors
npm run lint

# Execute all 31 unit, security, and logic tests
npm test

# Build production bundle
npm run build
```

---

## 8. Privacy & Security Highlights

- **Privacy-Preserving Geolocation**: Coarse GPS coordinates are rounded to a 0.1° grid (~11 km radius) and resolved to generic urban air-shed labels. Raw GPS coordinates are never stored, sent to AI prompts, or written to Firestore.
- **No Location State Exposure**: Locations are formatted strictly as `{city}, {country}` across headers, comboboxes, and AI prompts.
- **Default-Deny Firestore Security Rules**: Write increments to `community_impact` are strictly capped (`co2AvoidedKg <= 5.0`, `noxAvoidedGrams <= 15.0`) to prevent spam or counter inflation.
- **Sensitive Key Redaction**: Client-side error masks automatically scrub API keys and authorization tokens before rendering to logs or user-visible alerts.

---

## 9. License

This project is licensed under the Apache-2.0 License.
