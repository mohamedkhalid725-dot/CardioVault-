# CardioVault — Architecture

Plain description of how the app is built and where the data lives. Everything here
was read from the code on the `build/lane4-cleanup` branch. Anything I could not
confirm is marked **verify**.

## 1. What the app is

CardioVault is a clinical notebook for a cardiology department / CCU. It runs as:

- **Android app** — React app inside a Capacitor 7 WebView, package `com.cardiovault.app`.
- **Web app** — the same React app, built with Vite and served from Firebase Hosting.

The backend is **Firebase only**: Firebase Authentication (Google + email/password),
Cloud Firestore (all clinical data, including images), Firebase AI Logic for voice, and
a small Cloudflare Worker (`voice-proxy/`) that relays Android voice audio. Firebase
Storage is present in the code as a legacy upload helper but is not used: the project's
Storage bucket is unavailable, so clinical images go into Firestore chunks
(`mediaStorage.ts`).

There is no server of our own. `server.ts` (the old Express server) was deleted, which
is why `express`, `@types/express`, `dotenv` and `@supabase/supabase-js` were removed
from the root `package.json`. `jose` stayed: the voice-proxy tests under `test/` import
it.

**Offline:** the app is cloud-only today. `src/App.tsx` shows an "Internet connection
required — CardioVault is cloud-only" screen when the device is offline. Local
`localStorage` is a cache mirror, not a working copy.

## 2. Layer map

```
User
 │
 ├── LoginScreen            (Firebase sign-in: Google or email/password)
 ├── UnitAccessGate         (no membership yet -> enter a unit access code / invite)
 │
 └── App.tsx  ── currentView switch ──► views
        home            DashboardClinicalCenter
        census          UnitCensusView
        handover        HandoverView
        patient         PatientFileView
        patients        ActivePatientsView
        add-patient     AddPatientPage
        archive         ArchiveView
        calculators     CalculatorsHub
        my-worklist     TasksCenterView
        team            TeamDirectoryView
        protocols       ProtocolLibraryView
        statistics      DepartmentStatisticsView
        audit-trail     AuditTrailView
        settings        SettingsView
        results-center  ResultsCenterView
 │
 ├── AppContext (src/context/AppContext.tsx)
 │      one store for: auth, theme, current unit/patient, units[], beds[], patients[],
 │      toasts, subscription lock, sync state. Views never talk to Firestore
 │      directly; they call AppContext actions (addPatient, addUnit, addBed, ...).
 │
 ├── services (src/services/*.ts)  — every read/write to the cloud
 │      access + membership : workspaceAccess.ts
 │      invites             : unitInvites.ts, customUnitAccessCode.ts
 │      subscription clock  : workspaceSubscription.ts
 │      team roster per unit: unitRoster.ts
 │      audit per unit      : unitAudit.ts  (plus local auditTrailService.ts)
 │      clinical media      : mediaStorage.ts (Firestore chunks, not Storage)
 │      cloud sync          : cloudSyncBridge.ts (Android), webCloudSyncBridge.ts (web)
 │      clinical domain     : patientFilePhase2.ts, admissionEpisode.ts, patientAdmission.ts,
 │                            abgHistory.ts, examinationContent.ts, calculators.ts,
 │                            labOcrService.ts, voicePipeline.ts, voiceProxy.ts, ...
 │
 └── Firestore / Capacitor
        Android: @capacitor-firebase/firestore + @capacitor-firebase/authentication
        Web    : firebase/firestore + firebase/auth, wrapped by webFirebase.ts
```

**Why two branches everywhere:** Android talks to Firebase through the Capacitor
plugins (native SDK), the web build talks through the Firebase JS SDK. Every service
therefore starts with `Capacitor.isNativePlatform() ? ... : ...`. `webFirebase.ts` is
the single web wrapper: it holds the Firebase config, the emulator switch
(`VITE_FIREBASE_EMULATOR=true`) and the persistent browser cache.

**Sync direction:** `loadCurrentUserFromCloud()` (services/cloudSyncBridge.ts) pulls the
workspace down, writes it into `StorageService` (localStorage), and the UI re-renders.
Writes go out again through the same bridge. On web, `installWebRealtimeCloudSync`
adds live listeners. Android uses the Capacitor Firestore plugin.

## 3. Firestore data model (as it exists today)

Top level:

| Path | What it is | Who writes it |
|---|---|---|
| `/users/{uid}` | Legacy per-account data from before workspaces (`beds`, `patients` subcollections, read-only via rules). Only read for a one-time migration of the platform owner. | Nobody new |
| `/platformOwners/{uid}` | The single owner registry. The document's *existence* is what makes an account the platform owner. | Firebase console only |
| `/accessCodes/{sha256(code)}` | Routing copy of a unit access code, so a fresh device can find which workspace the code belongs to. | Owner (admin) |
| `/invites/{sha256(code)}` | Routing index for a temporary invite. Never trusted for state. | Invite creator |

Inside a workspace, `/workspaces/{workspaceId}`:

| Path | What it is |
|---|---|
| `workspaces/{ws}` | Tenant document: `createdBy`, `createdByEmail`, `name`, `schemaVersion`, `createdAt` |
| `workspaces/{ws}/members/{uid}` | Membership: `unitId`, `unitIds[]`, `role` (`clinical_editor` / `view_only`), `clinicalRoles{}`, `active`, `forceReauth`, `accessCodeHash(es)`, `inviteId(s)` |
| `workspaces/{ws}/members/{uid}/units/{unitId}` | Per-unit receipt, used by the revoke flow |
| `workspaces/{ws}/accessCodes/{hash}` | Authoritative unit access codes (owner-managed) |
| `workspaces/{ws}/invites/{hash}` | Authoritative, single-use, expiring invites |
| `workspaces/{ws}/team/{uid}` | Team directory profile: name, clinical role, `assignedUnitIds[]`, status. **This collection is workspace-wide readable — the residual leak, see SECURITY-MODEL.md.** |
| `workspaces/{ws}/units/{unitId}` | A clinical unit: `name`, `type`, `totalBeds`, `createdBy`, `consultantUid`, `createdAtMs`, `capacityLocked` |
| `workspaces/{ws}/units/{unitId}/tasks/{taskId}` | Unit-shared task board |
| `workspaces/{ws}/units/{unitId}/roster/{uid}` | Unit-scoped roster (service exists in `unitRoster.ts`; **no Firestore rule yet**) |
| `workspaces/{ws}/units/{unitId}/audit/{eventId}` | Unit-scoped audit (service exists in `unitAudit.ts`; **no Firestore rule yet**) |
| `workspaces/{ws}/beds/{bedId}` | Bed: `unitId`, `bedNumber`, `status`, `patientId` |
| `workspaces/{ws}/patients/{patientId}` | The whole clinical file of one patient, including every section (history, vitals, labs, ECG, imaging lists, notes) |
| `workspaces/{ws}/media/{mediaId}` + `/chunks/{chunkId}` | Clinical images as base64 chunks of ~600 KB inside Firestore (Firebase Storage is not used) |
| `workspaces/{ws}/metadata/cloud` | Sync bookkeeping (`lastClientSync`, `schemaVersion`, platform). Owner-only per rules. |
| `workspaces/{ws}/audit/{eventId}` | Workspace audit trail: append-only, owner-read only. Used today for `invite.redeemed` events. |
| `workspaces/{ws}/subscription/current` | Subscription clock: `status`, `trialEndsAtMs`, `periodEndMs`, `graceEndsAtMs`, `plan`, `renewalRef` |

`totalBeds` on the unit document is **not** the source of truth for capacity — the bed
documents are. `totalBeds` is a display number that the UI keeps in step.

## 4. Workspace, unit, bed, patient — what is the difference

- **Workspace** = the tenant. One hospital / one department group. Everything a
  customer may ever see lives under one `workspaces/{ws}` document. Two workspaces
  cannot see each other at all (proved by rules tests 17–19).
- **Unit** = a clinical area inside that workspace: CCU-1, ICU, a ward. A unit owns its
  own patients, beds, task board, roster and audit. Access is granted per unit, not per
  workspace.
- **Bed** = one physical bed, attached to exactly one unit. A bed points at the patient
  currently in it (`bed.patientId`); occupancy is the link, and the rules use
  `bed.unitId` to decide who may touch it.
- **Patient** = one clinical file. It has exactly one `unitId` and one `bedId`. Moving a
  patient to another unit means editing `unitId`, which the rules only allow if the
  caller can edit *both* the old and the new unit.

The owner is deliberately **not** a member of any unit. Ownership is the
`/platformOwners/{uid}` document; it gives full access everywhere without appearing on
any roster.

## 5. Which module owns what

| Area | Module | Notes |
|---|---|---|
| Sign-in, session restore | `context/AppContext.tsx`, `webFirebase.ts` | Android waits up to 5 s for the native session to restore before treating it as a sign-out |
| Who is the owner | `services/workspaceAccess.ts` → `isMasterAccount()` | Reads `/platformOwners/{uid}`; the e-mail check is a fallback so the owner is never locked out if that read fails |
| Workspace / membership / unit access codes | `workspaceAccess.ts` | Also `getMyUnits()`, `claimUnitConsultant()`, `setUnitCapacityLocked()` |
| Temporary invites | `unitInvites.ts` | Create, list (own only), revoke, redeem; burns the code before creating the membership |
| Subscription clock | `workspaceSubscription.ts` | Trial 3 d, paid 30 d, grace 2 d, then read-only |
| Per-unit roster | `unitRoster.ts` | Read/write `units/{unitId}/roster` — blocked by rules today (default deny) **verify** |
| Per-unit audit | `unitAudit.ts` | Append-only `units/{unitId}/audit` — blocked by rules today (default deny) **verify** |
| Local audit buffer | `auditTrailService.ts` | Last 500 events in `localStorage`; what the Audit screen shows today |
| Clinical images | `mediaStorage.ts` | Downscale to 1600 px JPEG, then 600 KB Firestore chunks; URLs are resolved on read |
| Units / beds / patients state and actions | `context/AppContext.tsx` + `services/storage.ts` | localStorage keys `cardiovault_units_v2`, `cardiovault_beds_v2`, `cardiovault_patients_v2` |
| Cloud push/pull | `cloudSyncBridge.ts` (Android), `webCloudSyncBridge.ts` (web) | 15 s timeout and 3 retries per operation |
| Clinical content | `patientFilePhase2.ts`, `admissionEpisode.ts`, `patientAdmission.ts`, `abgHistory.ts`, `examinationContent.ts`, `calculators.ts` | Pure functions, covered by `npm run test:summary-input` |
| Voice | `voicePipeline.ts`, `voiceProxy.ts`, `voice-proxy/` | Web uses Firebase AI Logic; Android posts to the Cloudflare Worker, which verifies the Firebase ID token with `jose` |
| Navigation | `App.tsx`, `components/navigation/*` | Back button + browser history kept in sync |

## 6. Things that are true but easy to miss

- `workspaces/{ws}/team` is a directory of **every account in the workspace**. The rules
  let any member read/list it. `unitRoster.ts` exists to replace it for non-owner
  accounts, but that collection has no rule yet, so it is currently unusable. See the
  gaps section of `SECURITY-MODEL.md`.
- `units/{unitId}/roster` and `units/{unitId}/audit` are **not mentioned in
  `firestore.rules` at all**, so the default-deny tail rule blocks them.
- The subscription lock is enforced twice: server-side by the rules (`canWrite()`), and
  client-side by `subscriptionLocked` in `AppContext`, which stops the UI from offering
  an action that would be denied.
- A workspace without a `subscription/current` document is grandfathered and never
  locks. That is intentional and matches `subActive()` in the rules.
- The `android/` and `ios/` folders are not committed in this branch, so
  `npm run cap:sync` / `npm run android:debug` need an Android project generated first
  (see `RUNBOOK.md`).
