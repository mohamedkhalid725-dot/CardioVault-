# CardioVault license and setup repair

- **Goal:** Make owner-issued unit-license redemption reliable, provide a safe owner-only 30-day reset for eligible units, and prevent the Finish setup flow from spinning indefinitely.
- **Architecture:** Keep membership/access-code handling separate from unit licensing. Apply code redemption atomically under existing Firestore authorization, add a narrowly scoped owner-only license reset, and bound the existing setup-repair path without changing activation or membership state.
- **Tech stack:** TypeScript, React, Capacitor Firebase Firestore, Firebase Security Rules, Firestore Emulator tests, Node test runner.
- **Spec path:** This plan records the user-confirmed requirements in the current session.
- **Global constraints:** Reset only non-deleted units that currently have at least one bed; set each expiry to 30 days from the owner-confirmed execution time; preserve all memberships and each unit's `activationStatus` (including `pending`); a unit access code never changes license duration. A newly redeemed owner-issued CVL adds 30 days to an unexpired license, or starts 30 days from redemption when expired; CVLs issued before the bulk reset are invalidated. Only the platform owner may issue CVLs or authorize the bulk reset.
- **Review focus:** Firestore rule least privilege; one-use CVL codes cannot burn without applying their matching license; bulk reset uses one shared timestamp and skips deleted/zero-bed units; retries cannot duplicate or overwrite membership; setup timeout cannot leave hidden writes or allow overlapping repairs.

## File map

- `src/services/unitLicenseCloud.ts`: CVL redemption and owner reset service operations.
- `src/components/settings/UnitLicensePanel.tsx` and `src/components/settings/SettingsView.tsx`: owner-only reset control with a count/confirmation; member CVL redeem remains separate.
- `firestore.rules`: exact client-redemption payload and constrained owner reset authorization.
- `test/firestore.rules.test.js` and `test/unitLicense.test.ts`: authorization, expiry, eligibility, and membership/status invariants.
- `src/context/AppContext.tsx` and `src/components/units/UnitManagementModalV2.tsx`: bounded setup repair, useful error stage, and no overlapping repair.
- `test/unitBeds.test.ts` or a focused setup-repair test: timeout and retry behavior.

## Implementation tasks

1. **Pin the current failures with tests.** Add a rules test using the exact CVL redemption payload currently emitted by the client; verify it is rejected before the fix. Add an atomic redemption test and owner-reset tests that reject non-owners and preserve member/pending data. Add focused tests for the setup operation timing out and releasing the visible spinner.
2. **Repair CVL redemption narrowly.** Remove the redundant forbidden `activationCodeHash` from the code-document update, retain it on the license document, and write code reservation plus license update in one batch on Android and web. Preserve same-member retry behavior. Do not let a unit access code modify a license. A CVL adds 30 days to the existing future expiry, or starts at redemption time if already expired. The bulk reset invalidates CVLs issued before the reset.
3. **Add the controlled bulk reset.** A platform-owner-only action refreshes cloud units/beds, selects only existing units with at least one stored bed, confirms the eligible count, uses one `nowMs` for all records, and sets expiry to `nowMs + 30 days`. It must not edit units, membership, invitations, bed records, or activation status. Batch writes in safe chunks and report partial failures without claiming a full reset.
4. **Bound setup repair.** Add an overall watchdog and bounded recovery verification with a clear stage-specific failure message. Keep underlying bed creation idempotent and prevent a second repair from starting while a timed-out operation is still in flight.
5. **Verify before release.** Run TypeScript/lint, focused license/setup tests, `npm.cmd run test:firestore-rules` with the bundled JRE, and a production web build. Do not deploy or mutate production until the tested change is reviewed and the owner runs the confirmed reset action.

## Confirmed decisions

- A newly redeemed CVL stacks 30 days onto a still-active license; if expired, it starts a new 30-day term at redemption. CVLs issued before the bulk reset are cancelled. The reset itself grants 30 days from execution to eligible units.

## Acceptance checks

- CVL redemption for an authorized member succeeds and produces the matching license atomically; an unauthorized user cannot redeem it.
- Access-code redemption leaves license expiry unchanged; CVL renewal remains owner-authorized and unit-scoped.
- Reset targets exactly non-deleted units with at least one bed, gives all the same 30-day window, and preserves memberships and pending/active statuses.
- `Finish setup` stops showing an infinite spinner, reports a useful error on timeout, and remains safe to retry.
- No production deployment or license data mutation occurs as part of local implementation/testing.
