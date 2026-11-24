import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  setLogLevel,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'smogwise-rules-test';
let testEnv: RulesTestEnvironment;

function buildValidHousehold(userId: string) {
  return {
    userId,
    city: 'New Delhi',
    citySlug: 'new-delhi',
    latitude: 28.6,
    longitude: 77.2,
    cookingFuel: 'gas',
    commute: 'car',
    indoorFiltration: 'has_purifier',
    vulnerableMembers: 'yes',
    completedActionsToday: ['2026-11-19:routine'],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function buildValidCommunityCreate(uid: string) {
  return {
    citySlug: 'new-delhi',
    cityName: 'New Delhi',
    familiesCount: 1,
    co2AvoidedKg: 1.6,
    noxAvoidedGrams: 6.2,
    recentActions: [
      'A household in New Delhi skipped a cold-start car trip • Just now',
    ],
    lastActionBy: uid,
    updatedAt: serverTimestamp(),
  };
}

before(async () => {
  setLogLevel('error');
  const rules = fs.readFileSync(
    path.resolve(process.cwd(), 'firestore.rules'),
    'utf8'
  );
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

test('Households: denies unauthenticated access, cross-user access, list queries, and unverified writes', async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const userADb = testEnv
    .authenticatedContext('user_a', { email_verified: true })
    .firestore();
  const userBDb = testEnv
    .authenticatedContext('user_b', { email_verified: true })
    .firestore();
  const unverifiedDb = testEnv
    .authenticatedContext('user_unverified', { email_verified: false })
    .firestore();

  // Verified owner creates own household doc
  await assertSucceeds(
    setDoc(doc(userADb, 'households', 'user_a'), buildValidHousehold('user_a'))
  );

  // Owner can read own household doc
  await assertSucceeds(getDoc(doc(userADb, 'households', 'user_a')));

  // Unauthenticated read & write denied
  await assertFails(getDoc(doc(unauthDb, 'households', 'user_a')));
  await assertFails(
    setDoc(doc(unauthDb, 'households', 'anon_1'), buildValidHousehold('anon_1'))
  );

  // Cross-user read, update, and delete denied
  await assertFails(getDoc(doc(userBDb, 'households', 'user_a')));
  await assertFails(
    updateDoc(doc(userBDb, 'households', 'user_a'), {
      cookingFuel: 'induction',
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(deleteDoc(doc(userBDb, 'households', 'user_a')));

  // Collection-wide list denied even for verified users
  await assertFails(getDocs(collection(userADb, 'households')));

  // Unverified email user cannot create household doc
  await assertFails(
    setDoc(
      doc(unverifiedDb, 'households', 'user_unverified'),
      buildValidHousehold('user_unverified')
    )
  );
});

test('Households: blocks shadow fields, userId hijacking, and immutable createdAt tampering', async () => {
  const userADb = testEnv
    .authenticatedContext('user_a', { email_verified: true })
    .firestore();

  // Shadow field injection rejected on create
  await assertFails(
    setDoc(doc(userADb, 'households', 'user_a'), {
      ...buildValidHousehold('user_a'),
      isAdmin: true,
    })
  );

  // Valid create succeeds
  await assertSucceeds(
    setDoc(doc(userADb, 'households', 'user_a'), buildValidHousehold('user_a'))
  );

  // Valid profile update succeeds
  await assertSucceeds(
    updateDoc(doc(userADb, 'households', 'user_a'), {
      cookingFuel: 'induction',
      updatedAt: serverTimestamp(),
    })
  );

  // Tampering with immutable userId or createdAt rejected
  await assertFails(
    updateDoc(doc(userADb, 'households', 'user_a'), {
      userId: 'user_b',
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(
    updateDoc(doc(userADb, 'households', 'user_a'), {
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
});

test('Community Impact: blocks unauthenticated writes, synthetic baselines, excessive increments, decreases, and GPS leakage', async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const userADb = testEnv
    .authenticatedContext('user_a', { email_verified: true })
    .firestore();
  const userBDb = testEnv
    .authenticatedContext('user_b', { email_verified: true })
    .firestore();

  // Unauthenticated create rejected
  await assertFails(
    setDoc(
      doc(unauthDb, 'community_impact', 'new-delhi'),
      buildValidCommunityCreate('user_a')
    )
  );

  // Synthetic baseline (familiesCount > 1 on create) rejected
  await assertFails(
    setDoc(doc(userADb, 'community_impact', 'new-delhi'), {
      ...buildValidCommunityCreate('user_a'),
      familiesCount: 313,
    })
  );

  // GPS coordinates in cityName or recentActions rejected
  await assertFails(
    setDoc(doc(userADb, 'community_impact', 'new-delhi'), {
      ...buildValidCommunityCreate('user_a'),
      cityName: 'GPS (28.61°, 77.21°)',
    })
  );
  await assertFails(
    setDoc(doc(userADb, 'community_impact', 'new-delhi'), {
      ...buildValidCommunityCreate('user_a'),
      recentActions: ['A household at 28.61°N completed an action'],
    })
  );

  // Valid create succeeds
  await assertSucceeds(
    setDoc(
      doc(userADb, 'community_impact', 'new-delhi'),
      buildValidCommunityCreate('user_a')
    )
  );

  // Public get succeeds, list and delete denied
  await assertSucceeds(getDoc(doc(unauthDb, 'community_impact', 'new-delhi')));
  await assertFails(getDocs(collection(userADb, 'community_impact')));
  await assertFails(deleteDoc(doc(userADb, 'community_impact', 'new-delhi')));

  // Excessive increment rejected (+2 families, +30 kg CO2, +200 g NOx)
  await assertFails(
    updateDoc(doc(userBDb, 'community_impact', 'new-delhi'), {
      familiesCount: 3,
      co2AvoidedKg: 3.2,
      noxAvoidedGrams: 12.4,
      recentActions: ['A household in New Delhi acted • Just now'],
      lastActionBy: 'user_b',
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(
    updateDoc(doc(userBDb, 'community_impact', 'new-delhi'), {
      familiesCount: 2,
      co2AvoidedKg: 35,
      noxAvoidedGrams: 12.4,
      recentActions: ['A household in New Delhi acted • Just now'],
      lastActionBy: 'user_b',
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(
    updateDoc(doc(userBDb, 'community_impact', 'new-delhi'), {
      familiesCount: 2,
      co2AvoidedKg: 3.2,
      noxAvoidedGrams: 250,
      recentActions: ['A household in New Delhi acted • Just now'],
      lastActionBy: 'user_b',
      updatedAt: serverTimestamp(),
    })
  );

  // Decreasing counters rejected
  await assertFails(
    updateDoc(doc(userBDb, 'community_impact', 'new-delhi'), {
      familiesCount: 1,
      co2AvoidedKg: 0.5,
      noxAvoidedGrams: 6.2,
      recentActions: ['A household in New Delhi acted • Just now'],
      lastActionBy: 'user_b',
      updatedAt: serverTimestamp(),
    })
  );

  // Spoofed lastActionBy rejected
  await assertFails(
    updateDoc(doc(userBDb, 'community_impact', 'new-delhi'), {
      familiesCount: 2,
      co2AvoidedKg: 3.0,
      noxAvoidedGrams: 10.0,
      recentActions: ['A household in New Delhi acted • Just now'],
      lastActionBy: 'user_a',
      updatedAt: serverTimestamp(),
    })
  );
});

test('Community Impact: concurrent runTransaction updates from two verified users serialize without lost increments', async () => {
  const userADb = testEnv
    .authenticatedContext('user_a', { email_verified: true })
    .firestore();
  const userBDb = testEnv
    .authenticatedContext('user_b', { email_verified: true })
    .firestore();

  const applyTx = (
    dbInstance: ReturnType<
      ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']
    >,
    uid: string,
    actionText: string
  ) =>
    runTransaction(dbInstance, async (tx) => {
      const ref = doc(dbInstance, 'community_impact', 'new-delhi');
      const snap = await tx.get(ref);
      const existing = snap.exists() ? snap.data() : null;
      const nextPayload = {
        citySlug: 'new-delhi',
        cityName: 'New Delhi',
        familiesCount: existing ? existing.familiesCount + 1 : 1,
        co2AvoidedKg: Number(((existing?.co2AvoidedKg ?? 0) + 1.5).toFixed(2)),
        noxAvoidedGrams: Number(
          ((existing?.noxAvoidedGrams ?? 0) + 5.5).toFixed(2)
        ),
        recentActions: [actionText, ...(existing?.recentActions || [])].slice(
          0,
          10
        ),
        lastActionBy: uid,
        updatedAt: serverTimestamp(),
      };

      if (existing) {
        tx.update(ref, {
          cityName: nextPayload.cityName,
          familiesCount: nextPayload.familiesCount,
          co2AvoidedKg: nextPayload.co2AvoidedKg,
          noxAvoidedGrams: nextPayload.noxAvoidedGrams,
          recentActions: nextPayload.recentActions,
          lastActionBy: nextPayload.lastActionBy,
          updatedAt: nextPayload.updatedAt,
        });
      } else {
        tx.set(ref, nextPayload);
      }
    });

  await Promise.all([
    assertSucceeds(
      applyTx(userADb, 'user_a', 'A household in New Delhi avoided cold-start idling • Just now')
    ),
    assertSucceeds(
      applyTx(userBDb, 'user_b', 'A household in New Delhi sealed drafty windows • Just now')
    ),
  ]);

  const finalSnap = await getDoc(doc(userADb, 'community_impact', 'new-delhi'));
  assert.equal(finalSnap.exists(), true);
  assert.equal(finalSnap.data()?.familiesCount, 2);
  assert.equal(finalSnap.data()?.co2AvoidedKg, 3);
  assert.equal(finalSnap.data()?.noxAvoidedGrams, 11);
  assert.equal(finalSnap.data()?.recentActions.length, 2);
});
