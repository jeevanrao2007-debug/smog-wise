# SmogWise Accessibility Report (WCAG 2.2 AA Verification)

## 1. Automated `axe-core` WCAG 2.2 AA Regression Results (`npm run test:e2e`)

Executed automatically by `e2e/run-e2e.sh` (blocking CI job `e2e-and-accessibility` in `.github/workflows/ci.yml`) using `axe-core` with tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, and `wcag22aa`:

| Viewport & State | Violations | Passes | Incomplete (Manual Review) | Horizontal Overflow |
|---|---:|---:|---:|---|
| Desktop (`1280×900`) — Initial Live Forecast | **0** | 24 | 1 | None |
| Desktop (`1280×900`) — Severe Smog + Expanded 24h Table + Methodology + Completed Card | **0** | 28 | 1 | None |
| Mobile (`390×844`) — Severe Smog + Expanded 24h Scrollable Table + Roving Keyboard Focus | **0** | 27 | 2 | `0px` (`390 / 390`) |

### Genuine Defects Caught by `axe-core` & Resolved
1. **WCAG 2.5.3 Label in Name (`label-content-name-mismatch`)**: Replaced conflicting `aria-label` overrides on the 24-hour chart bars (`HourlyForecastChart.tsx`) and action completion button (`ActionCardsSection.tsx`) with visible DOM text + `<span className="sr-only">` context.
2. **WCAG 2.1.1 Keyboard (`scrollable-region-focusable`)**: Added `tabIndex={0}`, `role="region"`, `aria-label`, and visible `focus-visible:ring-2` to the horizontally scrollable 24-hour forecast table container on mobile.

---

## 2. Keyboard Navigation & Focus Management

- **Skip Navigation (`WCAG 2.4.1`)**: `"Skip to main content"` link jumps directly to `<main id="main-content" tabIndex={-1}>`.
- **Roving `tabIndex` 24-Hour Chart Navigation (`HourlyForecastChart.tsx`)**:
  - Uses roving `tabIndex` (`tabIndex={isSelected ? 0 : -1}`) so keyboard users enter the chart with a single `Tab` stop and navigate all 24 hours with `ArrowRight`, `ArrowLeft`, `ArrowUp`, `ArrowDown`, `Home` (`12:00 AM`), and `End` (`11:00 PM`) with immediate programmatic `.focus()` and `aria-live="polite" aria-atomic="true"` readout announcements.
  - Regression-tested both via unit tests (`src/utils/accessibilityAndLazy.test.ts`) and live Chromium desktop + mobile keyboard assertions in `e2e/run-e2e.sh`.
- **Full ARIA Combobox (`CitySearchCombobox.tsx`)**: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `role="listbox"`, `role="option"`, `aria-selected`, `ArrowDown`/`ArrowUp`/`Enter`/`Escape`, and outside-click dismissal.
- **Grouped Lifestyle Toggles (`LifestyleProfileBar.tsx`)**: All 4 toggle clusters use `role="group"`, `aria-labelledby`, and `aria-pressed`.
- **Tabular Data Alternative (`HourlyForecastChart.tsx`)**: Expandable `<details>` 24-hour `<table>` with `<caption className="sr-only">`, `<th scope="col">`, and keyboard-focusable scroll region.

---

## 3. Contrast, Non-Color Signaling & Reduced Motion

- Primary text (`slate-900` on `white`/`slate-50`) `> 15:1`; muted text (`slate-600`/`slate-700`) `>= 4.6:1`; status pills (`emerald-700`, `amber-800`, `rose-700` with white text) `> 5.1:1`; dark-slate impact strip `> 8.5:1`.
- Non-color signaling pairs icons, explicit status labels, and tabular numeric metrics.
- `@media (prefers-reduced-motion: reduce)` in `src/index.css` disables animations and transitions.

---

## 4. Honest Manual Screen-Reader Disclosure

Automated `axe-core` WCAG 2.2 AA scans, DOM accessibility tree attributes, `aria-live` regions, and desktop/mobile keyboard focus management are all verified automatically in headless Chromium. **Manual testing with desktop/mobile screen readers (NVDA, JAWS, or VoiceOver) has not been performed** in this headless Linux container environment.
