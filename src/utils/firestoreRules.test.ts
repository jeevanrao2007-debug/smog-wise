import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateHouseholdPayload } from './smogLogic';
import { validateCommunityImpactPayload } from './apiValidation';

test('validateHouseholdPayload enforces schema boundaries and rejects Dirty Dozen invalid payloads', () => {
  const valid = {
    userId: 'user_abc123',
    city: 'New Delhi',
    citySlug: 'new-delhi',
    latitude: 28.6,
    longitude: 77.2,
    cookingFuel: 'gas',
    commute: 'car',
    indoorFiltration: 'has_purifier',
    vulnerableMembers: 'yes',
    completedActionsToday: ['2026-11-19:routine'],
  };
  assert.equal(validateHouseholdPayload(valid), true);

  // Invalid enum values
  assert.equal(validateHouseholdPayload({ ...valid, cookingFuel: 'coal' }), false);
  assert.equal(validateHouseholdPayload({ ...valid, commute: 'airplane' }), false);
  assert.equal(validateHouseholdPayload({ ...valid, indoorFiltration: 'unknown' }), false);
  assert.equal(validateHouseholdPayload({ ...valid, vulnerableMembers: 'maybe' }), false);

  // Path-poisoned IDs
  assert.equal(validateHouseholdPayload({ ...valid, userId: 'bad/id with spaces' }), false);
  assert.equal(validateHouseholdPayload({ ...valid, citySlug: 'bad slug!' }), false);

  // Oversized city (>100) and out-of-range/NaN coordinates
  assert.equal(validateHouseholdPayload({ ...valid, city: 'X'.repeat(101) }), false);
  assert.equal(validateHouseholdPayload({ ...valid, latitude: 95 }), false);
  assert.equal(validateHouseholdPayload({ ...valid, longitude: Number.NaN }), false);

  // Unbounded or malformed array elements (checks EVERY item, not just index 0)
  assert.equal(
    validateHouseholdPayload({
      ...valid,
      completedActionsToday: new Array(12).fill('2026-11-19:routine'),
    }),
    false
  );
  assert.equal(
    validateHouseholdPayload({
      ...valid,
      completedActionsToday: ['2026-11-19:routine', 'X'.repeat(80)],
    }),
    false
  );
});

test('validateCommunityImpactPayload enforces single-write increment caps, UID match, and GPS privacy', () => {
  // Valid initial document create (must be exactly 1 recorded action, never synthetic baseline)
  const validCreate = {
    citySlug: 'new-delhi',
    cityName: 'New Delhi',
    familiesCount: 1,
    co2AvoidedKg: 1.6,
    noxAvoidedGrams: 6.2,
    recentActions: ['A household in New Delhi skipped a cold-start car trip • Just now'],
    lastActionBy: 'user_abc123',
  };
  assert.equal(
    validateCommunityImpactPayload(validCreate, 'new-delhi', 'user_abc123', null),
    true
  );

  // Rejects synthetic baseline seeded on create (familiesCount > 1)
  assert.equal(
    validateCommunityImpactPayload(
      { ...validCreate, familiesCount: 313 },
      'new-delhi',
      'user_abc123',
      null
    ),
    false
  );

  // Valid incremental update (+1 family, +1.4 kg CO2, +5.2 g NOx)
  const validUpdate = {
    citySlug: 'new-delhi',
    cityName: 'New Delhi',
    familiesCount: 2,
    co2AvoidedKg: 3.0,
    noxAvoidedGrams: 11.4,
    recentActions: [
      'A household in New Delhi used cabin air recirculation • Just now',
      validCreate.recentActions[0],
    ],
    lastActionBy: 'user_xyz789',
  };
  assert.equal(
    validateCommunityImpactPayload(validUpdate, 'new-delhi', 'user_xyz789', validCreate),
    true
  );

  // Rejects excessive counter inflation (+500 families or +500 kg CO2 in one write)
  assert.equal(
    validateCommunityImpactPayload(
      { ...validUpdate, familiesCount: 501 },
      'new-delhi',
      'user_xyz789',
      validCreate
    ),
    false
  );
  assert.equal(
    validateCommunityImpactPayload(
      { ...validUpdate, co2AvoidedKg: 500 },
      'new-delhi',
      'user_xyz789',
      validCreate
    ),
    false
  );

  // Rejects decreasing counters
  assert.equal(
    validateCommunityImpactPayload(
      { ...validUpdate, co2AvoidedKg: 0.5 },
      'new-delhi',
      'user_xyz789',
      validCreate
    ),
    false
  );

  // Rejects spoofed actor UID & mismatched citySlug
  assert.equal(
    validateCommunityImpactPayload(validUpdate, 'new-delhi', 'other_user', validCreate),
    false
  );
  assert.equal(
    validateCommunityImpactPayload(validUpdate, 'lahore', 'user_xyz789', validCreate),
    false
  );

  // Rejects GPS coordinate leakage in cityName or recentActions
  assert.equal(
    validateCommunityImpactPayload(
      { ...validCreate, cityName: 'GPS (28.61°, 77.21°)' },
      'new-delhi',
      'user_abc123',
      null
    ),
    false
  );
  assert.equal(
    validateCommunityImpactPayload(
      {
        ...validCreate,
        recentActions: ['A household at 28.61°N completed an action'],
      },
      'new-delhi',
      'user_abc123',
      null
    ),
    false
  );
});

test('firestore.rules enforces default-deny, owner isolation, verified writes, increment caps, and GPS privacy', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesText = fs.readFileSync(rulesPath, 'utf8');

  // 1. Default deny catch-all
  assert.ok(rulesText.includes('match /{document=**}'));
  assert.ok(rulesText.includes('allow read, write: if false;'));

  // 2. Household owner isolation & list denial
  assert.ok(rulesText.includes('match /households/{userId}'));
  assert.ok(rulesText.includes('allow get: if isSignedIn() && isValidId(userId) && request.auth.uid == userId;'));
  assert.ok(rulesText.includes('allow list: if false;'));

  // 3. Verified email requirement on writes
  assert.ok(rulesText.includes('request.auth.token.email_verified == true'));

  // 4. Community impact per-write increment caps and delete denial
  assert.ok(rulesText.includes('incoming().familiesCount == 1'));
  assert.ok(rulesText.includes('incoming().familiesCount <= existing().familiesCount + 1'));
  assert.ok(rulesText.includes('incoming().co2AvoidedKg <= existing().co2AvoidedKg + 25'));
  assert.ok(rulesText.includes('incoming().noxAvoidedGrams <= existing().noxAvoidedGrams + 150'));
  assert.ok(rulesText.includes('allow delete: if false;'));

  // 5. GPS coordinate rejection in public community_impact documents
  assert.ok(rulesText.includes("!data.cityName.matches('.*GPS.*')"));
  assert.ok(rulesText.includes("!data.recentActions[0].matches('.*[0-9]+\\\\.[0-9]+°.*')"));
});
