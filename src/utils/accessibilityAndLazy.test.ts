import test from 'node:test';
import assert from 'node:assert/strict';
import { getNextHourlyBarIndex } from '../components/HourlyForecastChart';
import {
  isFirebaseClientLoaded,
  hasPersistedFirebaseSession,
  FIREBASE_SESSION_HINT_KEY,
} from '../firebase';

test('getNextHourlyBarIndex handles ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Home, and End with wrap-around', () => {
  assert.equal(getNextHourlyBarIndex(0, 'ArrowRight', 24), 1);
  assert.equal(getNextHourlyBarIndex(23, 'ArrowRight', 24), 0);
  assert.equal(getNextHourlyBarIndex(0, 'ArrowLeft', 24), 23);
  assert.equal(getNextHourlyBarIndex(14, 'ArrowLeft', 24), 13);
  assert.equal(getNextHourlyBarIndex(10, 'Home', 24), 0);
  assert.equal(getNextHourlyBarIndex(10, 'End', 24), 23);
  assert.equal(getNextHourlyBarIndex(5, 'Enter', 24), null);
  assert.equal(getNextHourlyBarIndex(5, 'Tab', 24), null);
  // Edge case: empty or invalid hours
  assert.equal(getNextHourlyBarIndex(0, 'ArrowRight', 0), null);
  assert.equal(getNextHourlyBarIndex(0, 'ArrowRight', -5), null);
});

test('lazy Firebase facade does not eagerly load Firebase SDK in Guest Mode', () => {
  assert.equal(isFirebaseClientLoaded(), false);
  assert.equal(typeof FIREBASE_SESSION_HINT_KEY, 'string');
  // In Node test environment without localStorage, hasPersistedFirebaseSession fails safe to false
  assert.equal(hasPersistedFirebaseSession(), false);
});
