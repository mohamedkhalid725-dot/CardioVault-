# Master-file admission resolution and event reliability

- **Goal:** Make every admission resolve to exactly one persistent master patient file, record lifecycle events only in that master file, and prevent duplicate-name and bed-selection errors.
- **Architecture:** Keep `Patient` as the active-admission record and the master file as the durable longitudinal record. Search exact normalized names only inside the selected unit's authorized archive and master files; show all matches for clinician selection, never auto-merge. Store an explicit master-file reference on each admission so future transfer, discharge, and readmission events return to the same master file.
- **Tech stack:** React, TypeScript, AppContext, Firestore web/native adapters, existing Node tests and Firestore emulator.
- **Spec path:** User-confirmed requirements in this conversation (2026-11-02).
- **Global constraints:** No production data in tests; no deploy, commit, or push; preserve workspace/unit Firestore isolation; keep the master file stable and its event log append-only; never report a cloud event as saved before server confirmation; exact name is the only candidate-search key, not proof of identity.
- **Review focus:** Wrong-patient master-file linkage; candidates leaking across units/workspaces; duplicate active records; orphaned/occupied bed selection; missing or duplicated lifecycle events; stale master-file data after workspace switching; native/web persistence differences.

## Confirmed behavior

- The master patient file is longitudinal and stable. Admissions, readmissions, transfers, and discharges append events to it; those events do not appear in the currently admitted patient file's timeline.
- Every new patient admission automatically creates a master file if none is selected.
- In `AddPatient`, after the name is entered, search the archive and master files scoped to the selected unit using the name only. Normalize whitespace/case and existing Arabic name normalization, but do not use age or MRN as a search predicate.
- Show every candidate with enough authorized context for the clinician to choose. Never select or merge automatically.
- If the clinician chooses an existing person, create the active admission record, link it to that existing master file, and append the admission event to that master file.
- If the clinician chooses that this is a different person, create a distinct active record and a distinct master file, even when the name matches. The generated/entered identifiers distinguish records; do not force changing the patient's real name.
- If there are no candidates, create the active admission and its new master file automatically.
- Event and patient/bed writes must be confirmed and retryable. A failed master-event write must not be presented as a fully completed cloud lifecycle action.
- All bed availability displays and final admission/transfer/readmission checks use the same availability rule.
- When workspace changes, clear old master-file data immediately and ignore any late response from the previous workspace.

## Files and responsibilities

- `src/components/patient/AddPatientModal.tsx`: name-entry lookup, candidate selection, new-person choice, and admission submission.
- `src/services/patientDedup.ts`: exact normalized-name candidate matching, constrained to the selected authorized unit; include archived and master-file candidates without auto-linking.
- `src/types/clinical.ts`: explicit optional master-file reference on a patient admission record, if needed by the implementation; validate persisted use through existing rules/tests.
- `src/types/clinicArea.ts`: preserve master-file ownership and append-only timeline event contracts.
- `src/services/masterPatientFileCloud.ts`: resolve/link an admission to an existing master file, create a new one when needed, and append idempotent lifecycle events.
- `src/services/firestoreMasterPatientFilePersistence.ts`: server-confirmed web/native reads and writes, including lookup limited to one unit.
- `src/context/AppContext.tsx`: admission, transfer, discharge, and readmission lifecycle orchestration; do not fire-and-forget the master-file event or report success before its confirmed outcome.
- `src/services/patientLifecycleAccess.ts`: shared bed availability predicate; reject beds with an active/orphaned occupant and any inconsistent non-empty occupancy state.
- `src/components/patient/PatientFileView.tsx`, `src/components/archive/ArchiveView.tsx`, `src/components/patient/PatientFileHeader.tsx`, `src/components/patients/MasterPatientFileView.tsx`: use shared bed rules and render lifecycle events in the master-file view only.
- `firestore.rules`, `test/department-team.rules.test.js`, `test/firestore.rules.test.js`: retain unit/workspace isolation for master-file lookup/linking and event append.
- New/updated tests: `test/patientDedup.test.ts`, `test/masterPatientFileCloudPersistence.test.ts`, lifecycle/admission tests, and any focused rules tests.

## Work plan

### 1. Pin down name matching and admission linkage

1. Add failing pure tests for exact normalized-name matches, same-name distinct people, multiple matches, archived records, and exclusion of records outside the selected unit.
2. Extend the dedup service to merge authorized archived-patient and master-file candidate sources, de-duplicate candidates by stable master identity, and return display metadata without using MRN/age to decide a match.
3. Add failing service tests proving an admission can reuse an explicitly selected master file, while a “different patient” choice creates a new master file even with the same name.
4. Implement a stable master-file reference on the new active patient record; ensure later lifecycle events resolve through that reference rather than deriving a new master file from each admission record ID.
5. Verify Firestore rules deny references/events outside the caller's unit/workspace and preserve append-only event writes.

### 2. Implement the Add Patient decision flow

1. Add component/service tests for name lookup, all-candidate presentation, existing-person selection, distinct-person selection, and no-match admission.
2. In `AddPatientModal`, trigger the selected-unit lookup after name entry; show all matches with name and authorized distinguishing context, plus explicit actions for “same patient” and “different patient”.
3. On existing-person selection, create a new active admission record linked to that candidate's master file and append only a master-file admission event. On distinct/no-match selection, create a new admission and a new master file.
4. Add exact English UI copy for the duplicate prompt and choices; verify dismissing the prompt makes no patient, bed, or master-file writes.
5. Confirm the clinical patient view does not show master-file lifecycle events while the patient is admitted; the master-file screen shows the event and opens its details when selected.

### 3. Make lifecycle persistence and bed decisions consistent

1. Add failing tests for available beds, active occupants, orphaned patient IDs, archived occupants, and inconsistent bed status.
2. Update the shared availability predicate and use it in Add Patient, transfer, archive readmission, and patient-file readmission UI and final AppContext checks.
3. Add failure/retry tests proving master-file event writes are idempotent and that an operation is not reported fully cloud-complete before patient/bed/event persistence is confirmed.
4. Implement awaited server confirmation and retry-safe lifecycle persistence for admission, transfer, discharge, and readmission; preserve previous admissions and append to the original master file.
5. Add a workspace-switch race test: previous files disappear immediately, and a late response from an old workspace cannot repopulate the current view.

### 4. Verification

1. Run focused patient-dedup, master-file, admission/lifecycle, and persistence tests.
2. Run `npm.cmd run test:firestore-rules`, `npm.cmd run test:department-team`, `npm.cmd run lint`, and `npm.cmd run build`.
3. Review `git diff --check` and the final diff; do not deploy, commit, or push.

## Self-review

- Covers master-file stability, name-only candidate lookup, multiple matches, explicit clinician choice, new-person-with-same-name, automatic master-file creation, event-only-in-master behavior, event details, bed consistency, persistence failure/retry, and workspace switching.
- Search matching is exact after the existing normalization; MRN/age are display-only disambiguators and never silently change the name-only search decision.
- The plan requires a stored master reference because each active admission record can have a different ID while all admissions must append to the same master file.
- No database migration or server deployment is included; any rules shape change must be proven by the local emulator suite.
