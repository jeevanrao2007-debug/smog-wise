/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { AuthUserSummary } from './firebase';
import { ActionCardsSection } from './components/ActionCardsSection';
import { AppFooter } from './components/AppFooter';
import { AppHeader } from './components/AppHeader';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LifestyleProfileBar } from './components/LifestyleProfileBar';
import { LiveSmogWindow } from './components/LiveSmogWindow';
import { NeighborhoodImpactStrip } from './components/NeighborhoodImpactStrip';
import {
  useActionRecommendations,
  useCommunityImpact,
  useLifestyleProfile,
  useSmogAuth,
  useWeatherForecast,
} from './hooks';
import { sanitizePublicCityLabel } from './utils/smogLogic';

/**
 * Core SmogWise workspace orchestrating weather telemetry, lifestyle profile persistence,
 * live Gemini recommendations, and real-time Cloud Firestore neighborhood impact tracking.
 */
function SmogWiseContent() {
  const [screenReaderAnnouncement, setScreenReaderAnnouncement] = useState<string>('');

  const {
    city,
    setCity,
    isLocating,
    locationNotice,
    setLocationNotice,
    fetchedWeatherSource,
    weatherWarning,
    isLoadingWeather,
    currentHour24,
    safeWindow,
    hourlyPoints,
    currentPm25,
    currentWindKmh,
    currentTempC,
    currentUsAqi,
    fetchCityForecast,
    detectUserLocation,
  } = useWeatherForecast({
    onAnnouncement: setScreenReaderAnnouncement,
  });

  const userRef = useRef<AuthUserSummary | null>(null);

  const {
    profile,
    completedKeys,
    setCompletedKeys,
    isSyncingFirestore,
    hydrateFromFirestore,
    handleProfileChange,
  } = useLifestyleProfile(userRef, city);

  const { user, isConnectingAuth, authErrorMsg, setAuthErrorMsg, handleAuthAction } = useSmogAuth({
    city,
    profile,
    completedKeys,
    onHydrateHousehold: hydrateFromFirestore,
  });

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const {
    actionCards,
    isLoadingCards,
    modelUsed,
    generatedAt,
    recommendationsError,
    customQuestion,
    setCustomQuestion,
    fetchRecommendations,
    handleSubmitCustomQuestion,
  } = useActionRecommendations({
    cityName: city.name,
    currentHour24,
    currentPm25,
    safeWindow,
    profile,
    isLoadingWeather,
    onAnnouncement: setScreenReaderAnnouncement,
  });

  const { celebratingId, recordedCommunityImpact, handleCompleteAction } = useCommunityImpact({
    user,
    city,
    profile,
    completedKeys,
    setCompletedKeys,
    onAnnouncement: setScreenReaderAnnouncement,
  });

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* WCAG 2.2 AA Skip Navigation Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-emerald-800 focus:text-white focus:rounded-lg focus:text-xs focus:font-semibold"
      >
        Skip to main content
      </a>

      {/* Screen Reader Live Region for WCAG 2.2 AA dynamic announcements */}
      <div
        id="a11y-live-announcer"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {screenReaderAnnouncement}
      </div>

      <AppHeader user={user} isConnectingAuth={isConnectingAuth} onAuthAction={handleAuthAction} />

      {/* Main Content Container */}
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 focus:outline-none"
      >
        {authErrorMsg && (
          <div
            role="alert"
            className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-900 flex items-center justify-between"
          >
            <span>{authErrorMsg}</span>
            <button
              type="button"
              onClick={() => setAuthErrorMsg(null)}
              className="font-semibold underline ml-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded"
            >
              Dismiss
            </button>
          </div>
        )}

        <LiveSmogWindow
          city={city}
          onSelectCity={(nextCity) => {
            setCity(nextCity);
            setLocationNotice(null);
          }}
          onDetectLocation={() => detectUserLocation(false)}
          isLocating={isLocating}
          locationNotice={locationNotice}
          hourlyPoints={hourlyPoints}
          safeWindow={safeWindow}
          currentPm25={currentPm25}
          currentWindKmh={currentWindKmh}
          currentTempC={currentTempC}
          currentUsAqi={currentUsAqi}
          isLoadingWeather={isLoadingWeather}
          weatherSource={fetchedWeatherSource}
          weatherWarning={weatherWarning}
          onRetryWeather={() => fetchCityForecast(city, true)}
        />

        <LifestyleProfileBar
          profile={profile}
          onChangeProfile={handleProfileChange}
          isSignedIn={Boolean(user)}
          isSyncingFirestore={isSyncingFirestore}
          customQuestion={customQuestion}
          onChangeCustomQuestion={setCustomQuestion}
          onSubmitQuestion={handleSubmitCustomQuestion}
          isGeneratingAi={isLoadingCards}
        />

        <ActionCardsSection
          city={sanitizePublicCityLabel(city.name)}
          currentPm25={currentPm25}
          profile={profile}
          cards={actionCards}
          isLoading={isLoadingCards}
          modelUsed={modelUsed}
          generatedAt={generatedAt}
          error={recommendationsError}
          customQuestion={customQuestion}
          completedKeys={completedKeys}
          celebratingId={celebratingId}
          onCompleteAction={handleCompleteAction}
          onRefreshRecommendations={() =>
            fetchRecommendations({
              showSkeleton: true,
              forceRefresh: true,
              customQ: customQuestion,
            })
          }
        />

        <NeighborhoodImpactStrip
          cityName={sanitizePublicCityLabel(city.name)}
          recordedImpact={recordedCommunityImpact}
        />
      </main>

      <AppFooter />
    </div>
  );
}

/**
 * Top-level SmogWise application entry wrapped in an accessible React ErrorBoundary.
 */
export default function App() {
  return (
    <ErrorBoundary>
      <SmogWiseContent />
    </ErrorBoundary>
  );
}
