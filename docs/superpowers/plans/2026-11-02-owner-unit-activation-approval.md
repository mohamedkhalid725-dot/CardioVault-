# Owner approval for newly created units

- **Goal:** Automatically register every new unit and its requested beds in Firestore, and require platform-owner approval before a customer-admin-created unit becomes clinically active.
- **Architecture:** Units created by the platform owner are provisioned and licensed for 30 days automatically. Units created by a customer workspace administrator are stored with pending activation state and a unit-activation request; the authorized creator can finish and verify the bed setup while the unit remains clinically inaccessible. The platform owner sees pending requests inside the app's Tasks view; approval follows an idempotent, fail-closed sequence because the native Firestore adapter does not expose a transaction/batch API. The unit remains clinically blocked until its license and active state are both confirmed, and retries reuse the original approval time rather than issuing a second license period.
- **Tech stack:** React/TypeScript, Firebase Firestore web and Capacitor adapters, Firestore Rules v2, existing unit-bed provisioning helpers, Node tests and Firebase Emulator.
- **Spec path:** User-confirmed requirements in the 2026-11-02 conversation.
- **Global constraints:** No production deploy, commit, or push without separate authorization. Keep memberships unchanged. Keep renewal codes for renewals; owner approval is only the initial activation path. Do not alter Clinic Mode. Never expose clinical records or allow clinical writes for pending units. Preserve existing patient/hospital data and make provisioning retries idempotent.
- **Review focus:** Cross-workspace owner authorization; request spoofing or approval of a different unit; pending-unit access accidentally opening clinical records; partial/missing beds; duplicate approvals/licenses; expiry beginning before approval; web/native parity; and notification visibility only for the platform owner.

## Code map

- `src/context/AppContext.tsx`: `addUnit` and `completeUnitSetup` currently persist unit metadata and provision beds in separate steps. Route owner-created and customer-admin-created units through distinct activation states without changing the existing bed verification/retry contract.
- `src/components/units/UnitManagementModalV2.tsx` and `src/components/setup/InstitutionSetupView.tsx`: unit creation entry points. Both must surface pending versus active outcomes clearly and preserve the requested bed count.
- `src/services/unitLicenseCloud.ts`: existing unit-license adapters and record shape. Add an owner-approval activation operation, separate from one-use renewal-code redemption.
- `src/services/unitActivationRequests.ts` (new): typed request model plus web/native create, list, and approve adapters; request IDs deterministic by workspace and unit to make retries idempotent.
- `src/components/worklist/TasksCenterView.tsx`: add a platform-owner-only “Unit activation approvals” section with pending request rows, requested unit/bed metadata, approve action, and refresh/retry handling. Do not mix approval requests into ordinary clinical tasks.
- `firestore.rules`: allow only authorized members to submit a request for a unit they created; permit setup-only writes needed to finish beds for that pending unit without granting clinical access; permit platform-owner listing/approval; enforce approval and license identity/scope; retain `request.time` expiry enforcement.
- `test/department-team.rules.test.js` and `test/firestore.rules.test.js`: emulator coverage for request creation, owner-only queue access, approval, denial, and unit isolation.
- New focused tests: `test/unitActivationRequests.test.ts` for request lifecycle/idempotency and `test/unitActivationAccess.test.ts` for pending/active behavior and bed-count verification.

## Implementation tasks

### 1. Define activation request and lifecycle rules in tests

1. Add unit tests proving request IDs are deterministic for `(workspaceId, unitId)`, duplicate submission does not duplicate a request, and status transitions only allow `pending → approved` (or a documented rejected state if rejection is explicitly represented).
2. Add emulator tests proving a member cannot create a request for a unit they do not own/create, cannot approve any request, cannot enumerate other requests, and cannot read/write clinical data in a pending unit.
3. Add emulator tests proving the platform owner can query requests across customer workspaces, approve only the referenced existing unit, and cannot change request scope or requester identity.
4. Verify these tests fail against the current rules before implementation.

### 2. Add Firestore-backed activation request service and rules

1. Implement `src/services/unitActivationRequests.ts` with explicit request fields: `requestId`, `workspaceId`, `unitId`, `unitName`, `requestedBedCount`, `requestedBy`, `requestedAtMs`, `status`, and schema version; do not include patient or other clinical data.
2. Use a globally queryable request collection suitable for the platform-owner queue, and implement web/native adapter parity using the project's existing Firestore APIs.
3. Add Rules v2 validation: authenticated workspace member may create only a pending request tied to their own created unit and actual requested bed count; only the platform owner may list/get requests and change pending to approved; make approved requests immutable except for minimal audit metadata if needed.
4. Add setup-only bed authorization for the requesting creator while the unit remains pending and capacity is open. Ensure this exception is restricted to the unit's expected bed documents and cannot authorize patient, task, audit, or other clinical collection access.
5. Owner approval must be the only client path that creates the initial 30-day license for a customer-created unit. Persist one approval-start time validated against `request.time`; on retries reuse it rather than extending the license. Require `unitActivationStatus == 'active'` in `unitMember()` so neither a partially written license nor a request-status change alone grants clinical access. Order the writes so the request remains retryable and the unit remains blocked until the license and final active marker are verified; do not assume an atomic batch on native.
6. Run the focused emulator tests; all negative isolation cases must remain denied.

### 3. Route unit creation through pending or auto-activation paths

1. Update `addUnit` and the two UI creation flows so a platform-owner-created unit is saved to Firestore and receives its first license automatically, while a customer-admin-created unit is saved as pending and gets one activation request.
2. Provision beds for both paths with the existing deterministic bed IDs and `completeUnitSetup` verification. Pending status must not skip bed creation or capacity verification.
3. For customer-admin-created units, show an explicit pending approval state; do not show a success message claiming clinical activation until the owner approves.
4. For owner-created units, perform initial activation without requiring a separate renewal code. Renewal after the first 30 days continues to use the existing one-use unit code flow.
5. Preserve idempotency: retrying unit creation, bed provisioning, or approval must not duplicate unit/bed/request documents or extend the initial license more than once. Cover interruption after each approval write in tests; incomplete approval must remain clinically blocked and retryable.
6. Add focused tests for owner-created auto-activation, admin-created pending state, exact bed count in Firestore, and safe retry after partial bed provisioning.

### 4. Show approval requests in the platform owner's Tasks view

1. Add a platform-owner-gated request loader and realtime/refresh behavior to `TasksCenterView`; ordinary users must not load or see the queue.
2. Render pending unit name, workspace, requester, request time, and bed count with an **Approve activation** action. Avoid showing clinical/patient data in this item.
3. On approval, invoke the rules-validated activation operation, show success only after Firestore confirms unit, beds, and license, and refresh the queue. On failure, preserve the pending request and provide a retryable error.
4. Add component/service tests for owner visibility, non-owner invisibility, approval success, and stale/already-approved requests.

### 5. Verify end-to-end and report deployment prerequisite

1. Run `npm.cmd run lint`, `npm.cmd run build`, the full `npm.cmd run test:department-team`, focused activation tests, and `npm.cmd run test:firestore-rules` with the bundled JRE.
2. Review `git diff --check` and the complete diff; specifically verify all pending-unit clinical collections remain inaccessible and every unit has exactly its declared number of verified beds before activation.
3. Do not deploy, commit, or push. Report that production rules must not be deployed until existing production units have been provisioned with licenses and the owner-approval path has been tested against the production data inventory.

## Self-review

- Covers owner-created automatic registration/licensing, customer-admin pending requests, in-app Tasks notification, owner approval, 30-day timing, automatic Firestore persistence, and complete bed provisioning.
- Separates setup-only bed writes from clinical authorization; this distinction is required because current `unitMember()` checks an active license.
- Keeps initial activation distinct from renewal-code redemption and leaves memberships intact.
- Includes emulator tests for authorization and unit isolation plus focused lifecycle tests for idempotency and bed counts.
- No implementation is included in this plan; approval is required before coding.
