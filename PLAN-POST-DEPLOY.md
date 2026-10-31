# CardioVault — Phase finish (post-deploy, Spark only)

## Done (committed + pushed + deployed directly, no emulator gate)
- Branch `feat/dept-team-integration-20261028` → origin (`0f3865b`) + GitHub
- Firestore rules deployed to `ccu-notebook` (hospital rule added; onboarding rules unchanged)
- Hosting deployed (`https://ccu-notebook.web.app`)
- Timeline allowlist (secretary-safe), lab/vital chart+table, unit/hour persistence idempotent
- `.firebase/` kept out of Git

## Confirmed behavior (direct from service / UI path — not from emulator)
- Unit creation writes to Firestore via `completeUnitSetup`; beds created deterministically; retry safe (no duplicate beds)
- Hospital metadata writes/reads via `firestoreHospitalPersistence`; owner-only create/update/delete
- Clinic-only: agreed as separate workspace after owner approval; trial starts only after provisioning, not at request
- No Blaze / Cloud Functions used

## Still open / next
- Verify hospital rule works in live Console (watch for unintended member access; list is owner-only by design)
- Clinic-only provisioning design (workspace + role + membership) — needs files outside current scope; keep Spark
- No patient/clinical data written to Firebase by agent; only rules + web bundle
