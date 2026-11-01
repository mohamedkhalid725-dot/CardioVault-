# CardioVault patient lifecycle, unit persistence, and hospital linking

- **Goal:** Verify reliable Firebase persistence for units and beds, complete unit-scoped master-file lifecycle and patient actions, and make hospitals and their unit associations reliably visible in the app.
- **Architecture:** Keep the existing React/AppContext and Firestore persistence boundaries. Reuse the existing unit finalization, transfer, discharge, readmission, and hospital persistence services where valid; add narrowly scoped service/UI behavior and tests rather than parallel paths. The master file remains owned by its original unit across transfers and readmissions; destination-unit users may access it only through explicit, verified authorization, never by weakening workspace isolation.
- **Tech stack:** React, TypeScript, Vite, Capacitor, Firebase Firestore, existing Node tests and Firestore emulator suite.
- **Spec path:** This document, based on the user requirements stated 2026-11-01.
- **Global constraints:** Firebase Spark only; no Cloud Functions; never write real patient data in tests; preserve workspace/unit isolation and append-only clinical history; do not silently claim cloud persistence without server read-back.
- **Review focus:** Partial unit/bed writes or incorrect bed counts; old admission overwritten by Readmit; duplicate master files on transfer; master-file access crossing unauthorized units; patient transfer leaving an occupied source bed or allowing an occupied destination; hospital present in Firestore but missing after refresh; one-sided unit/hospital links; mobile actions hidden or unusable.

## Confirmed behavior

- A successful new admission must have a master patient file created/linked automatically.
- Every archived patient file must be linked to a master file associated with the unit where that master file is stored; legacy archived records need a safe linking/backfill path.
- Readmit creates a new admission episode, preserves prior episodes, and appends an event to the existing master file.
- Transfer keeps the same master file (owned by its original unit), preserves the active admission, moves the patient from the source bed to a free bed in a unit the user can access/write, and appends a transfer event to that same master file.
- Users authorized for the destination unit should be able to read the same master file, but this must be implemented through explicit access checks consistent with workspace isolation.
- The patient-file header must expose Transfer and Discharge at the top on mobile and desktop; archived patient files need a Readmit action. Discharge uses the existing reason/summary workflow.
- A hospital added successfully must appear in the active app session. Users must be able to associate a newly created unit with a hospital or associate an already existing unit. Both sides of the relationship must remain consistent.
- Unit creation must persist the declared bed count and corresponding bed documents on both web and native Android before success is reported.

## Files and responsibilities to inspect/change

- `src/context/AppContext.tsx`: unit finalization, admission/readmit/transfer/discharge, master-file lifecycle, hospital state/refresh and assignment.
- `src/services/unitBeds.ts`, `src/services/unitPersistence.ts`, `src/services/firestoreUnitPersistence.ts`, `src/services/cloudSyncBridge.ts`, `src/services/webCloudSyncBridge.ts`: deterministic bed creation, cloud writes, and server-confirmed verification.
- `src/services/masterPatientFile.ts` and relevant Firestore persistence/rules: master-file identity, unit ownership, cloud read/write, event append, authorized access.
- `src/components/archive/ArchiveView.tsx`, `src/components/patient/PatientFileView.tsx`, `src/components/patient/PatientFileHeader.tsx`: archived Readmit and responsive top-of-file patient actions.
- `src/services/hospitalPersistence.ts`, `src/components/units/UnitManagementModalV2.tsx`, and `src/types/clinical.ts`: hospital creation/refresh and two-way linking for new/existing units.
- Tests: `test/unitPersistence.test.ts`, `test/unitBeds.test.ts`, admission/master-file tests, hospital persistence tests, Firestore rules tests, and targeted UI/context tests following current project conventions.

## Work plan

### 1. Establish unit/bed persistence evidence

1. Add/adjust failing tests for `finalizeUnitCreation`/`completeUnitSetup`: declared capacity is preserved, exactly the expected deterministic beds are written, capacity locks only after upload, and a partial failure remains retryable and is not reported as success.
2. Run unit persistence/bed tests and the Firestore emulator creation-order rules test. Verify native and web persistence adapters both require server-confirmed read-back. Fix any gap without changing declared capacity to a derived count.
3. Record the verified behavior and exact tested commands; do not use production patient data for validation.

### 2. Master-file lifecycle and patient actions

1. Add tests first for automatic master creation/linking on admission, archive linkage including legacy records, Readmit appending to the same master while retaining the old episode, and transfer appending to the same original-unit master.
2. Implement durable cloud persistence/read-back for master files and append-only events. Review how units currently fetch/list master files; ensure the original-unit owner remains stable and destination access is granted only when the user has explicit authorization to the related patient/unit. Keep workspace isolation intact.
3. Add Readmit to archived records in Archive and the patient file. Ensure it creates a new episode, clears only current-episode fields as existing reset logic intends, and appends the admission event to the existing master.
4. Make Transfer and Discharge reachable at the top of the patient file on mobile and desktop. Transfer must list only eligible subscribed/authorized writable destination units, require a free destination bed, and atomically update patient and both bed assignments with a same-master event. Discharge must use the existing reason/summary dialog and release the bed/archive the patient.
5. Add targeted regression tests for transfer authorization, source/destination bed occupancy, event persistence, archived read-only behavior, and responsive action availability; run relevant admission/master-file and Firestore rules suites.

### 3. Hospital visibility and unit association

1. Add regression tests that create a hospital, refresh/hydrate state, and confirm it remains visible under the active workspace and correct owner/member access rules. Reproduce stale/missing access and unlinked-hospital cases.
2. Fix creation/refresh state so a verified hospital remains visible after subsequent refreshes without broadening list/read permissions.
3. Test and implement both association paths: selecting a hospital while creating a unit, and assigning an already existing unit. Verify both `unit.hospitalId` and `hospital.unitIds` after server read-back; preserve owner-only assignment and existing membership restrictions.
4. Run hospital persistence tests, relevant static/rules tests, and the Firestore emulator suite if security rules change.

## Execution and review gates

- No implementation begins until the user approves this plan.
- If `firestore.rules`, workspace membership, or unit access behavior changes, load and follow the `cardiovault-rules-verify` skill and run its full isolation test suite before considering the change complete.
- Report any remaining ambiguity or access-control limitation before deployment. Do not deploy rules or Hosting as part of a local implementation unless separately authorized.
