# Hide Clinic Mode from the application

- **Goal:** Remove every user-facing Clinic Mode route, navigation entry, label, and control while preserving existing data and underlying services.
- **Architecture:** Disable Clinic Mode at the application presentation/routing boundary and remove Clinic-specific UI affordances from shared screens. Do not delete Clinic Mode records, types, storage keys, or services; those remain untouched for data compatibility and possible future reactivation.
- **Tech stack:** React, TypeScript, existing application navigation and Node tests.
- **Spec path:** User-confirmed decision in this conversation (2026-11-02): hide Clinic Mode from the app, not delete its data/services.
- **Global constraints:** No production data in tests; no deploy, commit, or push; no destructive storage cleanup; preserve non-clinic patient and master-file behavior.
- **Review focus:** Hidden route still reachable by stale navigation state; Clinic Mode entry points or labels left in shared screens; accidental deletion/migration of stored data; clinic-specific imports breaking the build.

## Files and responsibilities

- `src/App.tsx`: remove Clinic Mode view loading/render route and any clinic-only banner/notice.
- `src/context/AppContext.tsx`: remove the `clinic` view route type if no internal code still depends on it; retain domain data and services.
- `src/components/navigation/MoreDrawerModal.tsx`, `src/components/navigation/BottomNav.tsx`, and any other navigation component found by search: remove Clinic Mode entry points.
- `src/components/patients/MasterPatientFileView.tsx`: remove Clinic Mode-specific visible copy and UI choices, while preserving historical data without destructive changes.
- Other UI references found by repository-wide search: hide them from users or replace only the presentation label if historical records need a neutral display.
- `test/*` navigation/static tests: assert there is no reachable Clinic Mode route or user-facing navigation entry, and verify preview storage/services are not deleted.

## Work plan

### 1. Inventory and tests

1. Search all routes, navigation definitions, buttons, labels, settings, and shared-screen Clinic Mode controls; record the exact user-facing surfaces.
2. Add failing tests for route unavailability and missing navigation entries; add a preservation test or assertion that legacy Clinic Mode data/services are not cleared.

### 2. Hide the app surfaces without deleting data

1. Remove the Clinic Mode lazy view and route rendering from `App.tsx`.
2. Remove Clinic Mode navigation entries and stale route/type handling after confirming no non-UI flow depends on them.
3. Remove Clinic-specific controls and labels from shared app screens, including master-file UI, while retaining the underlying persisted clinic context untouched.
4. Verify an old saved `clinic` view state falls back safely to an allowed screen instead of rendering a hidden view.

### 3. Verification

1. Run focused navigation/static tests, `npm.cmd run test:department-team`, `npm.cmd run lint`, and `npm.cmd run build`.
2. Review for remaining user-facing Clinic Mode text/routes and confirm no Clinic Mode storage or services were deleted.
3. Run `git diff --check`; do not deploy, commit, or push.

## Self-review

- The plan treats “hide from the app” as presentation/routing removal only; existing data and service modules remain intact.
- Covers navigation, route access including stale route state, and Clinic-specific labels embedded in shared screens.
- Does not delete clinic data or perform a migration.
