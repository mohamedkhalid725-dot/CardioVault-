# Unit-wide 30-day owner-issued access

- **Goal:** Retire end-user subscription/trial/payment requests and replace the workspace-wide subscription lock with a 30-day license for each unit, issued or renewed by the platform owner; when it expires, block every member's access to that unit without deleting membership records. Hide Clinic Mode in the app without changing its implementation.
- **Architecture:** Store each unit's authoritative license in Firestore and enforce expiry using `request.time` in security rules, not only a client timer. Keep membership documents intact and separate unit licensing from the existing one-time Unit Access Code/invite membership flow; owner-issued renewal codes are scoped to one unit and cannot grant access to another. A code renewal applies to the whole unit and all its existing members.
- **Tech stack:** React, TypeScript, Firebase Firestore web/Capacitor adapters, Firestore Security Rules v2, Node tests, Firebase Emulator.
- **Spec path:** This plan, based on user-confirmed requirements in the 2026-11-01 conversation.
- **Global constraints:** No Cloud Functions or paid Firebase dependency; no production Firebase deploy; no patient data in tests; preserve workspace/unit isolation; never delete, deactivate, or rewrite a member's membership merely because a license expired; leave Clinic Mode code/data untouched and only hide its entry point. Preserve existing historical subscription documents (no bulk deletion).
- **Review focus:** Expiry enforced by rules on every unit-scoped read/write; one expired unit does not lock other units; owner is not locked out; member records survive expiry/redeem; renewal codes are owner-issued, unit-bound, and exactly 30 days; new-unit onboarding still works without a subscription request; no accidental Clinic Mode behavior changes; no remaining client path can create subscription requests.

## Confirmed behavior

- There is no user-facing subscription request, trial, or payment-confirmation workflow.
- The platform owner issues or renews a unit code; one unit's license is shared by all members assigned to that unit.
- The license duration is exactly `30 * 24 * 60 * 60 * 1000` milliseconds. At or after expiry, all non-owner access to that unit is denied until the owner issues a fresh code for the same unit.
- Expiry is a logical access lock only. `members/{uid}` and team/roster records are retained; renewal restores access to the unit for its members without recreating or deleting membership.
- Renewing a unit must not extend any other unit. Preserve early-renewal behavior by starting after the current unit expiry; late renewal starts at issuance/activation time.
- Patient lifecycle work remains part of this delivery: `Readmit` must be available from both the Archive and the Master Patient File, and Transfer must be visible and usable on phone and desktop to move a patient between units the user is authorized to access.
- Clinic Mode remains in source and its data is untouched, but its navigation entry and app route are hidden so it is not reachable through normal UI.
- No Firebase rules or Hosting deployment is authorized in this task.

## Files and responsibilities

- `src/services/workspaceAccess.ts`: existing owner-issued Unit Access Codes, redemption, membership writes, and membership preservation. Extend the code contract or add a separate unit-license-code path without making ordinary membership codes silently delete/revoke memberships.
- `src/services/unitLicense.ts` (new): pure 30-day code/license lifecycle helpers, expiry checks, renewal timing, and typed result shapes.
- `src/services/unitLicenseCloud.ts` (new): web/Capacitor Firestore read/write adapter for `workspaces/{workspaceId}/unitLicenses/{unitId}` and owner-issued code records.
- `firestore.rules`: owner-only license/code issuance; validate unit/workspace binding and expiry; gate unit-scoped data through shared membership helpers; retain self-read of membership and owner bypass; default-deny expired/missing licenses for non-owner access after the migration strategy is defined.
- `src/context/AppContext.tsx`: remove the workspace-wide `subscriptionLocked` write gate and expose/check per-unit license state without logging out or clearing membership when a unit expires.
- `src/components/auth/UnitAccessGate.tsx`: present an expired-unit/code-needed state and process a fresh owner-issued code while preserving the existing membership record and unrelated unit memberships.
- `src/components/archive/ArchiveView.tsx`, `src/components/patients/MasterPatientFileView.tsx`, `src/components/patient/PatientFileView.tsx`, and `src/components/patient/PatientFileHeader.tsx`: expose Readmit from Archive and Master Patient File, and keep Transfer available at the top of the patient file on mobile and desktop.
- `src/components/settings/SettingsView.tsx` and `src/components/settings/UnitLicensePanel.tsx` (new): platform-owner-only unit license status, issue/renew code, and expiry display. Keep structural membership-code management separate from license renewal.
- `src/components/setup/InstitutionSetupView.tsx`: remove request/trial/payment steps and request submission; retain institution/unit setup and make the no-request onboarding path explicit.
- `src/App.tsx`, `src/components/navigation/MoreDrawerModal.tsx`: remove Clinic Mode from visible navigation/routing while retaining its component source. Remove obsolete user payment/request routes from visible navigation.
- `src/components/settings/PaymentPanel.tsx`, `src/components/settings/OwnerRequestsPanel.tsx`, `src/services/subscriptionRequestCloud.ts`, `src/services/workspaceSubscription.ts`, and `src/services/subscriptionRequests.ts`: retire end-user request/trial/global-clock flows; preserve any small compatibility helpers still required by the dormant Clinic Mode component rather than modifying that component.
- Tests: `test/unitLicense.test.ts` (new), `test/firestore.rules.test.js`, `test/department-team.rules.test.js`, `test/subscriptionRequestCloud.test.ts`, `test/subscriptionLifecycle.test.ts`, and any existing setup/UI static tests. Remove obsolete assertions only when the corresponding user-facing feature is deliberately retired; retain regression coverage for membership, isolation, and owner access.

## Work plan

### 1. Specify and test the unit-license domain

1. Add failing pure tests for the 30-day duration, active-before-expiry/locked-at-expiry boundary, early renewal stacking after the current expiry, late renewal starting at issuance, and unit-scoped independence.
2. Implement `src/services/unitLicense.ts` with typed helpers that accept an injected `nowMs`, return the exact `expiresAtMs`, and reject invalid unit/code scope. Keep the duration constant in one place.
3. Add tests proving an owner-issued code cannot be applied to a different workspace or unit and cannot extend validity beyond its recorded expiry; run the focused unit-license tests.

### 2. Add authoritative Cloud license records and owner controls

1. Add tests first for web/native adapter paths, owner-only issuance/renewal, persisted expiry read-back, and retry idempotency.
2. Implement the cloud adapter and a dedicated owner `UnitLicensePanel`; list units in the selected workspace, show each expiry, issue/renew only the selected unit, and never write to membership documents during expiration or renewal.
3. Update `SettingsView` to show the panel only to the platform owner. Verify a unit renewal changes only that unit's license document and leaves all membership/roster documents byte-for-byte unchanged.

### 3. Enforce per-unit expiry in Firestore rules

1. Add emulator tests for active and expired unit licenses across unit documents, beds, patients, tasks, audit/roster paths, and master-file reads; include a member with two units where only one expires.
2. Add tests that expired users can still read their own membership record, cannot read or write the expired unit's clinical data, retain access to a separately active unit, and the platform owner remains able to manage both.
3. Implement the unit-license rule helpers using server `request.time`; route every unit-scoped access decision through entitlement + existing membership checks. Allow license changes only through the platform-owner-issued unit code contract; do not authorize clients to choose arbitrary future expiry values.
4. Add a renewal-code emulator test: code is valid only for its workspace/unit and 30-day window; renewal does not delete/recreate memberships or cross-grant other units. Run `npm.cmd run test:firestore-rules` with the bundled Temurin JRE and report exact counts.
5. Document the pre-deployment migration requirement: provision an explicit 30-day unit license for every production unit before any rules deployment, otherwise default-deny behavior could lock members out. Do not perform that migration or deploy rules here.

### 4. Replace request/trial UI with unit renewal and remove global lock behavior

1. Add tests showing request/trial/payment controls are absent, onboarding/setup does not create a subscription request, and the owner can issue/renew a unit license without an existing request document.
2. Remove request submission and trial-start logic from `InstitutionSetupView`; preserve workspace/institution/unit setup and confirm the owner has an explicit path to discover and license newly created units.
3. Remove the global workspace subscription clock from `AppContext`; implement per-unit UI gating and clear expired-unit messaging while retaining other active units and the signed-in session.
4. Update `UnitAccessGate` for the owner-issued fresh unit code path. Expired access must not call `logout`, clear stored memberships, or erase unit assignments; successful renewal applies to the entire unit.
5. Retire user-facing PaymentPanel/OwnerRequestsPanel routes and cloud request creation. Keep old cloud request documents untouched; add rules tests proving clients cannot create new retired requests. Preserve only compatibility helpers needed by the hidden Clinic Mode code.

### 5. Hide Clinic Mode and complete regression verification

1. Add regression tests proving Readmit is reachable from Archive and Master Patient File and creates a new episode without overwriting prior history; verify Transfer is visible on mobile and desktop and lists only authorized destination units with a free bed.
2. Add a static/UI regression test proving Clinic Mode is absent from drawer/navigation and cannot be selected through normal app routing, while its component and clinic data services remain present and unchanged.
3. Run focused admission/master-file/transfer, setup, unit-code, unit-license, subscription-retirement, and clinic-module tests; run `npm.cmd run lint` and `npm.cmd run build`.
4. Run the complete Firestore emulator suite after every rules/membership change. Review the final diff for access broadening, membership deletion, accidental clinic edits, and stale subscription-request entry points.
5. Report test results and the production migration prerequisite. Do not commit, push, or deploy unless separately requested.

## Execution and review gates

- Implementation starts only after the user approves this plan.
- The existing `test:firestore-rules` suite previously showed 80/82 because subscription request create paths hit Firestore's 1000-expression evaluation ceiling; this plan retires those paths and replaces them with bounded unit-license checks, but the change is not accepted until the full suite passes.
- Any changes to `firestore.rules`, membership, or unit access must follow the `cardiovault-rules-verify` skill. No live Firestore probe, data migration, or production deployment is part of the plan.
- Preserve the work already in progress on patient lifecycle, hospitals, and master files; isolate this feature's changes and do not reset/revert unrelated worktree changes.
