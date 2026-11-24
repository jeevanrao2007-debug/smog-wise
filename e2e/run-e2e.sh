#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
STARTED_SERVER_PID=""

cleanup() {
  playwright-cli close > /dev/null 2>&1 || true
  if [[ -n "$STARTED_SERVER_PID" ]]; then
    kill "$STARTED_SERVER_PID" > /dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# If no server is listening at BASE_URL, start SmogWise locally in production/dev mode
if ! curl -sf "${BASE_URL}/api/health" > /dev/null 2>&1; then
  echo "[E2E] No server detected at ${BASE_URL}; starting Express server..."
  NODE_ENV="${NODE_ENV:-production}" npx tsx server.ts > .playwright-cli-server.log 2>&1 &
  STARTED_SERVER_PID=$!

  for i in $(seq 1 30); do
    if curl -sf "${BASE_URL}/api/health" > /dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done

  if ! curl -sf "${BASE_URL}/api/health" > /dev/null 2>&1; then
    echo "[E2E] ERROR: Server failed to become ready at ${BASE_URL}/api/health"
    cat .playwright-cli-server.log || true
    exit 1
  fi
fi

echo "[E2E] Opening ${BASE_URL} in headless Chromium via playwright-cli..."
playwright-cli open --browser=chromium "${BASE_URL}" > /dev/null
playwright-cli resize 1280 900 > /dev/null

RAW_OUTPUT=$(playwright-cli run-code 'async (page) => {
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.waitForSelector("[data-testid=\"safe-ventilation-banner\"]", { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });

  const runAxe = async (label) => page.evaluate(async (tag) => {
    const res = await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }
    });
    return {
      label: tag,
      violationsCount: res.violations.length,
      passesCount: res.passes.length,
      incompleteCount: res.incomplete.length,
      violations: res.violations.map(v => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        targets: v.nodes.slice(0, 3).map(n => n.target)
      }))
    };
  }, label);

  // 1. Efficiency Check: Verify Guest Mode does NOT download Firebase SDK chunks on initial load
  const initialResources = await page.evaluate(() => {
    const entries = performance.getEntriesByType("resource");
    const jsEntries = entries.filter(e => e.name.includes(".js") || e.initiatorType === "script");
    const firebaseRequests = entries.filter(e =>
      /vendor-firebase|firebaseClient|firebase\/(app|auth|firestore)/i.test(e.name)
    );
    return {
      scriptCount: jsEntries.length,
      firebaseRequestsCount: firebaseRequests.length,
      firebaseRequestNames: firebaseRequests.map(e => e.name)
    };
  });

  // 2. Desktop initial WCAG 2.2 AA axe-core scan
  const axeDesktopInitial = await runAxe("desktop-initial");

  // 3. Full Family Journey
  // 3a. Combobox keyboard navigation (ArrowDown + Escape)
  const combobox = page.getByRole("combobox");
  await combobox.fill("Lahore");
  const optionAppeared = await page
    .locator("#city-search-listbox [role=\"option\"]")
    .first()
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  let activeDescendantAfterDown = null;
  if (optionAppeared) {
    await combobox.press("ArrowDown");
    activeDescendantAfterDown = await combobox.getAttribute("aria-activedescendant");
    await combobox.press("Escape");
  }
  const listboxClosedAfterEscape = !(await page.locator("#city-search-listbox").isVisible().catch(() => false));
  await combobox.fill("");

  // 3b. Switch city preset to Milan
  await page.getByRole("button", { name: "Milan", exact: true }).click();
  await page.waitForTimeout(800);
  const headingAfterPreset = (await page.locator("h1").textContent() || "").trim();

  // 3c. Toggle lifestyle option (Two-Wheeler)
  const twoWheelerBtn = page.getByRole("button", { name: /Two-Wheeler/i });
  await twoWheelerBtn.click();
  const twoWheelerPressed = await twoWheelerBtn.getAttribute("aria-pressed");

  // 3d. Hourly forecast chart roving keyboard navigation (ArrowRight, ArrowLeft, Home, End)
  const activeHourBtn = page.locator("button[data-hour-index][tabindex=\"0\"]").first();
  await activeHourBtn.focus();
  const initialHourIdx = Number(await activeHourBtn.getAttribute("data-hour-index"));
  await page.keyboard.press("ArrowRight");
  const hourAfterRight = await page.evaluate(() => Number(document.activeElement?.getAttribute("data-hour-index")));
  await page.keyboard.press("Home");
  const hourAfterHome = await page.evaluate(() => Number(document.activeElement?.getAttribute("data-hour-index")));
  await page.keyboard.press("End");
  const hourAfterEnd = await page.evaluate(() => Number(document.activeElement?.getAttribute("data-hour-index")));
  const readoutAfterEnd = (await page.locator("[data-testid=\"selected-hour-readout\"]").textContent() || "").trim();

  // 3e. Expand 24-hour forecast data table & verify 24 rows
  const tableSummary = page.locator("summary", { hasText: /View 24-Hour Air Quality/i });
  await tableSummary.click();
  await page.waitForSelector("table tbody tr");
  const tableRowsCount = await page.locator("table tbody tr").count();

  // 3f. Expand "Why & How Estimated" methodology disclosure
  const methodologySummary = page.locator("summary", { hasText: /Why & How Estimated/i }).first();
  await methodologySummary.click();
  const methodologyOpen = await methodologySummary.evaluate(el => el.parentElement?.hasAttribute("open") ?? false);

  // 3g. Complete an action ("We Did This") and verify daily deduplication + recorded counter increment
  const counterEl = page.locator("[data-testid=\"families-counter\"]");
  const countBefore = Number((await counterEl.textContent() || "0").replace(/[^0-9]/g, ""));
  const weDidThisBtn = page.getByRole("button", { name: /We Did This/i }).first();
  await weDidThisBtn.click();
  await page.waitForTimeout(300);
  const countAfter = Number((await counterEl.textContent() || "0").replace(/[^0-9]/g, ""));
  const completedButtonDisabled = await page.locator("article button").first().isDisabled().catch(() => false);

  // 4. Severe Smog Scenario + Desktop axe-core scan
  const severeSwitch = page.getByRole("switch");
  await severeSwitch.click();
  await page.waitForTimeout(400);
  const severeChecked = await severeSwitch.getAttribute("aria-checked");
  const bannerTextSevere = (await page.locator("[data-testid=\"safe-ventilation-banner\"]").textContent() || "").trim();
  const axeDesktopSevere = await runAxe("desktop-severe");

  // 5. Recommendation API Failure & Graceful Fallback Test
  await page.route("**/api/recommendations", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Simulated upstream outage" })
    });
  });
  const refreshBtn = page.getByRole("button", { name: /Refresh AI Plan/i });
  await refreshBtn.click();
  await page.waitForTimeout(600);
  const fallbackCardsCount = await page.locator("#action-plan article").count();
  const fallbackBadgeVisible = await page.getByText(/Calibrated Atmospheric Dispersion/i).first().isVisible().catch(() => false);
  await page.unroute("**/api/recommendations");

  // 6. Mobile (390x844) Layout, Keyboard Navigation & axe-core WCAG 2.2 AA scan
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const mobileOverflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  }));

  // Verify keyboard arrow navigation works on mobile viewport too
  const mobileHourBtn = page.locator("button[data-hour-index][tabindex=\"0\"]").first();
  await mobileHourBtn.focus();
  const mobileInitialHourIdx = Number(await mobileHourBtn.getAttribute("data-hour-index"));
  await page.keyboard.press("ArrowLeft");
  const mobileHourAfterLeft = await page.evaluate(() => Number(document.activeElement?.getAttribute("data-hour-index")));

  const axeMobileSevere = await runAxe("mobile-severe");

  // Enforce strict fail-fast assertions
  const failures = [];
  if (pageErrors.length > 0) failures.push(`Uncaught page errors: ${pageErrors.join("; ")}`);
  if (initialResources.firebaseRequestsCount !== 0) {
    failures.push(`Expected 0 Firebase SDK downloads in Guest Mode, found ${initialResources.firebaseRequestsCount}`);
  }
  if (axeDesktopInitial.violationsCount !== 0) failures.push(`Desktop initial axe violations: ${JSON.stringify(axeDesktopInitial.violations)}`);
  if (axeDesktopSevere.violationsCount !== 0) failures.push(`Desktop severe axe violations: ${JSON.stringify(axeDesktopSevere.violations)}`);
  if (axeMobileSevere.violationsCount !== 0) failures.push(`Mobile severe axe violations: ${JSON.stringify(axeMobileSevere.violations)}`);
  if (!listboxClosedAfterEscape) failures.push("City combobox did not close on Escape");
  if (headingAfterPreset !== "Milan") failures.push(`Expected preset heading Milan, got ${headingAfterPreset}`);
  if (twoWheelerPressed !== "true") failures.push("Two-Wheeler toggle did not set aria-pressed=true");
  if (hourAfterRight !== (initialHourIdx + 1) % 24) failures.push(`ArrowRight failed: expected ${(initialHourIdx + 1) % 24}, got ${hourAfterRight}`);
  if (hourAfterHome !== 0) failures.push(`Home key failed: expected 0, got ${hourAfterHome}`);
  if (hourAfterEnd !== 23) failures.push(`End key failed: expected 23, got ${hourAfterEnd}`);
  if (!/11:00 PM/i.test(readoutAfterEnd)) failures.push(`Selected hour readout did not update to 11:00 PM: ${readoutAfterEnd}`);
  if (tableRowsCount !== 24) failures.push(`Expected 24 forecast table rows, got ${tableRowsCount}`);
  if (!methodologyOpen) failures.push("Methodology disclosure failed to open");
  if (countAfter !== countBefore + 1) failures.push(`Action counter failed to increment: ${countBefore} -> ${countAfter}`);
  if (!completedButtonDisabled) failures.push("Completed action button was not disabled");
  if (severeChecked !== "true" || !/Keep Sealed Today/i.test(bannerTextSevere)) failures.push("Severe smog simulation failed");
  if (fallbackCardsCount !== 3 || !fallbackBadgeVisible) failures.push(`Recommendation fallback failed: cards=${fallbackCardsCount}, badge=${fallbackBadgeVisible}`);
  if (mobileOverflow.hasHorizontalOverflow) failures.push(`Mobile overflow detected: ${JSON.stringify(mobileOverflow)}`);
  const expectedMobileHourAfterLeft = (mobileInitialHourIdx - 1 + 24) % 24;
  if (mobileHourAfterLeft !== expectedMobileHourAfterLeft) {
    failures.push(`Mobile ArrowLeft failed: expected ${expectedMobileHourAfterLeft}, got ${mobileHourAfterLeft}`);
  }

  return {
    passed: failures.length === 0,
    failures,
    summary: {
      pageErrorsCount: pageErrors.length,
      initialResources,
      axeDesktopInitial,
      axeDesktopSevere,
      axeMobileSevere,
      journey: {
        optionAppeared,
        activeDescendantAfterDown,
        listboxClosedAfterEscape,
        headingAfterPreset,
        twoWheelerPressed,
        keyboardNav: { initialHourIdx, hourAfterRight, hourAfterHome, hourAfterEnd, mobileHourAfterLeft },
        tableRowsCount,
        methodologyOpen,
        actionCounter: { countBefore, countAfter, completedButtonDisabled },
        severeSmog: { severeChecked, hasKeepSealed: /Keep Sealed Today/i.test(bannerTextSevere) },
        fallbackResilience: { fallbackCardsCount, fallbackBadgeVisible },
        mobileOverflow
      }
    }
  };
}')

echo "$RAW_OUTPUT"

# Parse the JSON result line after "### Result" and fail non-zero if passed !== true
node -e '
const raw = process.argv[1];
const match = raw.match(/### Result\s*(\{[\s\S]*?\})\s*(?:###|$)/);
if (!match) {
  console.error("[E2E] Failed to parse Playwright JSON result");
  process.exit(1);
}
const result = JSON.parse(match[1]);
if (!result.passed) {
  console.error("[E2E] FAILED assertions:", JSON.stringify(result.failures, null, 2));
  process.exit(1);
}
console.log("[E2E] ALL DESKTOP, MOBILE, FALLBACK, LAZY-LOAD & AXE-CORE WCAG 2.2 AA CHECKS PASSED!");
console.log(JSON.stringify(result.summary, null, 2));
' "$RAW_OUTPUT"
