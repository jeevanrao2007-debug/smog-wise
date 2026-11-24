# SmogWise Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Default Deny Safety Net**: Any path not explicitly matched (`/households/{userId}`, `/community_impact/{citySlug}`, `/test/connection`) is unconditionally denied for all reads and writes.
2. **Path Variable Hardening**: Every document ID (`{userId}`, `{citySlug}`) must pass `isValidId(id)` (`id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$')`).
3. **Strict Household Ownership & Isolation**:
   - Only an authenticated user whose `request.auth.uid == userId` may read (`get`) or write (`create`, `update`, `delete`) `/households/{userId}`.
   - `list` queries on `/households` are forbidden (`allow list: if false;`) to prevent enumeration of households.
   - `incoming().userId` must equal `request.auth.uid` on creation and remain immutable (`incoming().userId == existing().userId`) on update.
4. **Verified User Mandate for Writes**: All write operations (`create`, `update`, `delete`) require `request.auth != null && request.auth.token.email_verified == true`.
5. **Strict Key & Schema Validation (`hasAll` + `hasOnly`)**:
   - `isValidHousehold(data)` enforces exact allowed keys, enum values for the 4 lifestyle toggles (`cookingFuel`, `commute`, `indoorFiltration`, `vulnerableMembers`), string length bounds, coordinate bounds, and bounded `completedActionsToday` array (`size() <= 10`).
   - `isValidCommunityImpact(data, citySlug)` enforces exact allowed keys, non-negative counters, bounded `recentActions` list (`size() <= 10`), `lastActionBy == request.auth.uid`, and rejects GPS coordinate strings in public `cityName` and `recentActions[0]`.
6. **Bounded Single-Action Counter Increments**:
   - On `create` of `/community_impact/{citySlug}`: `familiesCount == 1`, `co2AvoidedKg <= 25`, `noxAvoidedGrams <= 150`, `recentActions.size() == 1`.
   - On `update` of `/community_impact/{citySlug}`: monotonic non-decreasing counters capped at `familiesCount <= existing + 1`, `co2AvoidedKg <= existing + 25`, and `noxAvoidedGrams <= existing + 150` per write.
7. **Temporal Integrity & Immortal Fields**:
   - On `create` of `/households/{userId}`, `createdAt == request.time` and `updatedAt == request.time`.
   - On `update` of `/households/{userId}`, `createdAt == existing().createdAt` and `updatedAt == request.time`.
   - On `create` and `update` of `/community_impact/{citySlug}`, `updatedAt == request.time`.

## 2. The Red-Team Adversarial Payloads ("Dirty Dozen+")

1. **Identity Spoofing on Household Create**: Authenticated user `uid_1` attempts to create `/households/uid_2` or sets `userId: "uid_2"`. -> `PERMISSION_DENIED`
2. **Unverified Email Write**: Authenticated user with `email_verified: false` attempts to create `/households/uid_1`. -> `PERMISSION_DENIED`
3. **Shadow Field Injection on Household**: User includes an undeclared field `isAdmin: true` in `/households/uid_1`. -> `PERMISSION_DENIED`
4. **Invalid Toggle Enum Value**: User submits `cookingFuel: "coal"` instead of `"gas"` or `"induction"`. -> `PERMISSION_DENIED`
5. **Oversized String / Resource Poisoning**: User submits a `city` string of 500 characters (`> 100`). -> `PERMISSION_DENIED`
6. **Unbounded Array Attack**: User submits `completedActionsToday` with 25 items (`> 10`). -> `PERMISSION_DENIED`
7. **Timestamp Forgery on Household Create**: User provides a past or future client timestamp instead of `request.time`. -> `PERMISSION_DENIED`
8. **Immortal Field Mutation on Household Update**: User modifies `createdAt` or `userId` during an update. -> `PERMISSION_DENIED`
9. **Cross-Household Read (PII / Profile Scraping)**: Authenticated user `uid_1` attempts `get` on `/households/uid_2` or `list` on `/households`. -> `PERMISSION_DENIED`
10. **Community Impact Negative Counter Poisoning**: User attempts to set `familiesCount: -5` or `co2AvoidedKg: -10` in `/community_impact/new-delhi`. -> `PERMISSION_DENIED`
11. **Community Impact Excessive Inflation Attack**: User attempts to jump `familiesCount` by `+500` or `co2AvoidedKg` by `+5000` in a single write, or create a city doc with `familiesCount: 300`. -> `PERMISSION_DENIED`
12. **Community Impact Spoofed Actor**: User `uid_1` writes `lastActionBy: "uid_2"` to `/community_impact/new-delhi`. -> `PERMISSION_DENIED`
13. **Community Impact GPS Coordinate Leak**: Client attempts to write `cityName: "GPS (28.61°, 77.21°)"` or a coordinate string inside `recentActions[0]`. -> `PERMISSION_DENIED`
14. **Community Impact Deletion**: Any user attempts to `delete` `/community_impact/new-delhi`. -> `PERMISSION_DENIED`
