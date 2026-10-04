# Phase 2 — Security Review (Staging)
Date: 2026-10-05
Scope: review only; no Firestore rule or runtime behavior changes.

## 1. Patient-data access model
Canonical clinical data is stored under:
- workspaces/{workspaceId}/patients/{patientId}
- workspaces/{workspaceId}/beds/{bedId}
- workspaces/{workspaceId}/units/{unitId}

The active workspace is cardiovault_master_workspace.

### Firestore enforcement
- member(workspaceId) requires Firebase Authentication plus an active membership.
- unitMember(workspaceId, unitId) requires an active membership and a matching assigned unit.
- Patient reads are allowed only to the workspace owner or a member of the patient's unitId.
- Patient creates/updates require the workspace owner or a clinical_editor scoped to the target unit.
- Patient deletes require the workspace owner or a clinical_editor scoped to the existing patient unit.
- A final catch-all rule denies everything else.

The client also loads non-owner patients using where('unitId', '==', unitId) queries, matching the Firestore rule scope.

### Important distinction
This is permitted-unit isolation, not 'each doctor can only see patients they personally created.' A doctor can see patients in every unit explicitly assigned to that account. That matches the current Unit Access model.
The master/owner account is intentionally broader and can access the full workspace.

## 2. Two-account isolation test
Use two fresh Firebase accounts with fake data only.

### Account A — Unit A
1. Create/sign in as Account A.
2. Redeem a Unit A access code only.
3. Confirm the workspace shows Unit A.
4. Add a fake patient TEST-A-001 to a Unit A bed.
5. Save/sync.
6. Confirm Account A can open TEST-A-001.

### Account B — Unit B
1. Sign out completely.
2. Sign in as Account B.
3. Redeem a Unit B access code only.
4. Confirm the workspace shows Unit B.
5. Add a fake patient TEST-B-001 to a Unit B bed.
6. Save/sync.
7. Confirm Account B can open TEST-B-001.

### Cross-isolation checks
While signed in as Account A:
- Unit B must not appear.
- TEST-B-001 must not appear in Active Patients.
- Searching for TEST-B-001 or its MRN must return nothing.
- Opening a direct patient route/state for TEST-B-001 must not reveal the record.
- Attempting to edit/delete TEST-B-001 must fail server-side.

While signed in as Account B, repeat the same checks against TEST-A-001.

### Strong server-side check
Do not treat a hidden UI item as proof of security. The decisive result is that Firestore denies a cross-unit read/write even if a user manipulates the client.

### Negative control
Give one test account access to two fake units (A+B). That account should see both units and their patients. This verifies that the intended permitted-units model still works.

## 3. Current rule-change decision
No Firestore rule change is proposed in this Phase 2 review.
Reason: patient read rules are unit-scoped; patient writes are role + unit scoped; non-owner client reads use matching unitId queries; the final catch-all denies unmatched paths.
Therefore there is no rule diff to approve at this stage.
If a manual isolation test exposes a real authorization gap, the next change must be a separate rule-only diff and must be approved before deployment.

## 4. Legacy AI/server code — removal candidates only
The repository still contains:
- server.ts — Express server with legacy /api/ai/analyze and /api/ai/assistant endpoints using GEMINI_API_KEY.
- functions/index.js — legacy Firebase HTTPS AI function analyzeClinicalPatient, also using GEMINI_API_KEY.
- functions/package.json — legacy Firebase Functions dependencies.
- Root package.json still includes express, @types/express, tsx, and @google/genai; these may be legacy depending on remaining non-AI usage and require reference verification before removal.
- .env.example contains the legacy GEMINI_API_KEY placeholder.

Current Phase 2 action: remove nothing.
Before removal, verify no client import/call reaches server.ts endpoints or analyzeClinicalPatient, no Firebase staging/production deployment depends on the legacy function, no CI step starts Express, and no non-AI feature imports a package solely used by the legacy server/function.
Check Firebase Console for deployed legacy Functions before deleting their source.

## 5. Legacy secret handling
Candidate: GEMINI_API_KEY.
Do not delete or rotate it in this phase.
Before deleting: confirm no deployed Cloud Function or server uses it; confirm Firebase AI Logic is the only intended AI path; if no longer needed, remove the secret from the relevant secret store and then remove source references in a separate approved cleanup change.
Never place a Gemini API key in Vite/client code.

## 6. Android release keystore backup
1. On the PC, locate the exact release keystore file used by CI.
2. Do not upload it to GitHub, Git, Drive links, or chat.
3. Make two encrypted backups on two separate trusted storage locations.
4. Use a strong unique keystore password and store it in a password manager.
5. Record the keystore alias and key password in the same password manager entry.
6. Verify a restored copy offline with: keytool -list -v -keystore <copy>.
7. Keep the original and backups protected from casual phone access.
8. Never commit the keystore or passwords to the repository.
The CI base64 secret should remain protected as a GitHub Actions secret; do not paste its value into chat.

## 7. Scope protection
This Phase 2 review does not change Google Sign-In, App Check enforcement, production secrets, billing, main/live, APK behavior, or production Firestore rules.
Fake data only remains required.