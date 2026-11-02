# Patient Master-File Access and Backfill

- **Goal:** Restore member patient admission and unit-scoped master-file visibility, then provide a safe owner-controlled backfill for legacy and archived patient records.
- **Architecture:** Ship the admission precheck fix separately first. In the follow-up, add a minimal per-unit master-file index whose rules bind directly to the unit path, then add an idempotent owner-only preview/execute backfill that creates master files, indexes, and original-time admission events in small batches.
- **Tech stack:** React, TypeScript, Firebase Firestore (web + Capacitor), Firestore Rules emulator, Node test runner.
- **Spec path:** User-provided requirements in the 2026-11-02 conversation.
- **Global constraints:** Preserve unit isolation; never grant workspace-wide member reads; no production writes without owner preview and explicit confirmation; no production deploy in this task; archived records are included; every operation must be safely retryable.
- **Review focus:** Duplicate precheck must not block admission when master-file lookup fails; member writes must not leave a patient without a master file/event; index reads must not expose another unit's file; partial backfill retries must neither duplicate documents nor alter clinical history.

## Files and responsibilities

- `src/components/patient/AddPatientModal.tsx`: Best-effort cross-unit/master-file duplicate lookup; local `patients` remain authoritative for same-unit duplicate warnings.
- `src/services/masterPatientFileCloud.ts`: Stable IDs, idempotent creation, and unit-index operations.
- `src/services/firestoreMasterPatientFilePersistence.ts`: Read/write per-unit index on both web and Capacitor, and resolve indexed file IDs to authorized parent files.
- `firestore.rules`: Restrict index reads/writes to the unit path's current members and allow only parent files whose contexts contain that unit.
- `test/department-team.rules.test.js`, `test/firestore.rules.test.js`: Positive same-unit access, negative other-unit access, and owner access.
- `src/services/patientMasterFileBackfill.ts` (new): Owner-only preview and resumable/idempotent execution using patients from `workspaces/{workspaceId}/patients`.
- `src/components/settings/PatientMasterFileBackfillPanel.tsx` (new), `SettingsView.tsx`: Owner-only preview, confirmation, progress (batch size 10), and actionable partial-failure summary.
- `test/patientMasterFileBackfill.test.ts` (new): Active + archived, stable IDs, original admission time, idempotency, batch failure/resume, and preview counts.

## Task 1 — Admission precheck hotfix (separate PR)

1. Add a testable helper/test proving a rejected master-file lookup is logged and does not abort admission; same-unit duplicate patients still block for the normal choice dialog.
2. Change `AddPatientModal` to catch and log lookup errors, continue with no master-file candidates, and use patients already loaded for the selected unit for same-unit duplicate detection.
3. Verify the member can still create the master file and admission event under current rules; if not, record this as a blocker for the follow-up rather than hiding it with a broad permission change.
4. Run lint, focused tests, build, and Firestore rules tests; commit and open a hotfix PR without deploying.

## Task 2 — Per-unit index (follow-up PR)

1. Add rules tests first: a member can list/get only the index for a unit they belong to; another unit's member is denied; owner retains access.
2. Add a minimal `{workspaceId, unitId, masterFileId}` index document at `workspaces/{ws}/units/{unitId}/masterIndex/{fileId}`; parent create/context updates and index writes must be atomic on web and native.
3. Change `listFilesForUnit` to list the unit's index and then fetch only referenced parent files/events. Keep the original clinical file's `contextIds` validation and no workspace-wide member grants.
4. Add tests for initial creation, context expansion, duplicate index repair, and same-file deduplication across unit indexes.

## Task 3 — Owner-only legacy backfill

1. Implement preview that reads server-confirmed patients (active and archived), reports total / already linked / missing master file counts, and performs no writes.
2. Implement owner-only execution with explicit preview confirmation, deterministic `mpf-<patientId>` IDs, contexts from known unit history, original admission timestamp, and batch size 10. Each batch creates/repairs master file, unit index, and admission event idempotently.
3. Add owner-only Settings UI with preview gate, progress, counts, and exact failed patient/batch details; no automatic run on startup or page load.
4. Test preview no-write, active+archived coverage, transferred-unit contexts when present, retries after partial failure, and cross-unit isolation.
5. Run emulator suite (must be all green), lint, targeted tests, and production build. Open a follow-up PR; do not deploy or execute the backfill against production without a separate explicit instruction.
