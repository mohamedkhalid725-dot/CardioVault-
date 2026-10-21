# CardioVault — Decision Log

Every decision that shapes this release, with the reason and what it costs us. The log
was written on **2026-10-21** from the approved build scope; the Android-only release
scope was decided on **2026-10-12**. "Locked" means do not re-open it without the
owner saying so. "Open" means a real question is still unanswered.

---

## D1 — Android only, iOS parked

- **Decided:** 2026-10-12
- **Decision / Why:** This release ships on Android only. iPhone / TestFlight / App Store
  work is parked for this period. The physician works on Android, and every clinical
  hour spent on iOS is an hour not spent on the app that is actually in use.
- **Consequence:** iPhone users have no build. The iOS workflows in `.github/workflows/`
  still exist but must not be treated as part of this release. Any iOS issue is closed as
  out of scope, not as a bug.
- **Status:** locked

## D2 — Distribution through a signed APK and APKPure

- **Decided:** 2026-10-12
- **Decision / Why:** The release artefact is a signed release APK published on APKPure.
  No Play Store dependency, no review queue, no account that can block an update.
- **Consequence:** The signing keystore must never be lost (a new key means every user
  has to uninstall). `versionCode` must be raised for every published build. Updates are
  manual; that is why D9 (new-version banner) exists.
- **Status:** locked

## D3 — One owner account, identified only by `platformOwners/{uid}`

- **Decision / Why:** There is exactly one platform owner:
  `mohamedkhalid725@gmail.com`. He is identified **only** by the existence of
  `/platformOwners/{uid}`. `ownerUid` on a workspace document grants nothing, and no
  customer account can ever become an owner. One owner means one person to trust, one
  audit subject, and no privilege-escalation path through a workspace document.
- **Consequence:** If that document is missing, the app treats the real owner as a normal
  account and his screens load empty. It must exist in the Firebase console **before**
  the rules are deployed to production (see `RUNBOOK.md`). The e-mail check in
  `workspaceAccess.ts` is only a fallback so a failed read cannot lock him out; it is not
  the authority.
- **Status:** locked

## D4 — The owner is never on a unit roster, but reaches every unit

- **Decision / Why:** The owner appears in no unit's roster and in no workspace
  membership. Ownership itself is the grant. This keeps "who works in this unit" clean,
  and means removing a member never risks removing the owner.
- **Consequence:** The owner cannot be "removed" from a unit, and his actions in a unit
  are recorded as owner actions, not as member actions. Any screen that builds a roster
  must handle "the owner is not in the list" without breaking.
- **Status:** locked

## D5 — Subscription clock: 3-day trial → 30-day paid → 2-day grace → read-only

- **Decision / Why:** A new workspace gets a 3-day full trial, started by an owner
  button (never automatically on first login, so nobody burns a trial by opening the
  app). A paid period is 30 days. After the paid period there are 2 days of grace. After
  grace, every non-owner write is refused and the app is read-only. Expiry never deletes
  or hides clinical data; the owner can still read and write.
- **Consequence:** Enforced twice: by `canWrite()` in `firestore.rules` (server time) and
  by `subscriptionLocked` in `AppContext` (UI). A workspace with no subscription document
  is grandfathered and never locks. The owner is always exempt. A workspace creator can
  open a trial for each workspace he creates — see gap 5 in `SECURITY-MODEL.md`.
- **Status:** locked

## D6 — Pricing: 500 EGP locally, USD 20 internationally, per unit per month

- **Decision / Why:** Per unit, per month: **500 EGP** when paid locally, **USD 20** when
  paid internationally. A **clinic** is **1000 EGP** per month locally or **USD 20**
  internationally. There is **no capacity-based pricing** — a 30-bed unit and a 6-bed unit
  cost the same, because pricing by bed would punish the units that need the app most.
- **Consequence:** A unit's price is a property of the unit, not of its bed count. A
  clinic is a special unit shape priced at two normal units locally.
- **Status:** **locked** — USD 20 internationally is a deliberate premium over the local
  price, confirmed by the owner on 2026-10-21. Do not "fix" the asymmetry in code.
- **Also open:** what happens to a unit whose payment lapses while it holds patients —
  read-only (consistent with D5) is the assumption, but it has not been written down as
  a separate decision.

## D7 — Unit creation and activation

- **Decision / Why:** The member who creates a unit sets its details and its bed count at
  creation. The unit stays **pending** until its payment is confirmed, and is then
  activated exactly as specified — same name, type and bed count, nothing silently
  changed. **Minimum 3 beds per unit, maximum 200.**
- **Consequence:** A pending unit must be visible to its creator (and the owner) only.
  Payment confirmation is currently manual (the owner presses renew); automated
  confirmation needs Cloud Functions, i.e. the Blaze plan.
- **Status:** locked (minimum 3 and maximum 200, confirmed 2026-10-21). Neither bound is
  enforced in the rules yet — it is a client rule until the unit-creation flow is built.

## D8 — Offline mode is read-only

- **Decision / Why:** With no connection the app may show what it already holds, but may
  not accept edits. A queued edit that silently fails to reach the cloud is worse than an
  honest "read-only" label in a clinical setting.
- **Consequence:** Every write path must be blocked offline; the UI must say so. **Not
  implemented as decided yet:** the current build shows an "Internet connection required —
  CardioVault is cloud-only" screen and blocks the app entirely when offline. Treat the
  read-only offline mode as the target behaviour.
- **Status:** locked (implementation pending)

## D9 — A "new version available" banner

- **Decision / Why:** When a newer release exists, the app must say so. Sideloaded APKs
  from APKPure do not update themselves, so the user has to be told.
- **Consequence:** Needs a version source the app can read (Firestore document or a
  static file) and a dismissal rule. **Not built yet** — verify before claiming it.
- **Status:** locked

## D10 — Unit types come from a catalogue plus "Custom Unit"

- **Decision / Why:** Units are typed from a predefined catalogue so reports and filters
  stay comparable, plus a **Custom Unit** option for anything the catalogue misses.
- **Consequence:** The current catalogue in `UnitManagementModal.tsx` is
  `Intensive Care`, `Coronary Care`, `HDU`, `Step-down`, `Ward`, `Emergency` — there is
  no Custom Unit option yet. Custom types must not break type-based filtering.
- **Status:** locked (Custom Unit not implemented — **verify**)

## D11 — Waiting lists

- **Decision / Why:** Waiting lists live on the Home screen under the units list, and as
  an entry in the MORE drawer. **Each unit has its own list.** Only members of that unit
  may see it. The owner sees all. There is **never** cross-unit visibility.
- **Consequence:** A waiting list is unit data, so it must live under
  `units/{unitId}` (or carry a `unitId` that the rules check exactly like patients). The
  owner's "sees all" view must be built by listing units, not by a global collection that
  a member could also query.
- **Status:** locked

## D12 — Duplicate patient names: suggest, never merge

- **Decision / Why:** Within the **same unit**, the app normalises the typed name and, on
  a match, shows: **"A patient with this name already exists. Add this patient to the
  existing file?"** together with the existing MRN, age and bed. If accepted, the new
  entry links to the existing master file. If refused, saving is blocked with:
  **"Please modify the name or add a distinguishing element so this patient is saved as a
  new file."** Across units there is **no lookup at all** — a lookup would itself leak
  that a name exists in another unit, so a cross-unit clash can never write into another
  unit's file. Nothing is ever auto-merged.
- **Consequence:** The prompt is English on purpose (it is quoted verbatim above; do not
  translate it silently). The same-unit check can only look at the caller's own unit, so
  it must query with the unit filter, not search the workspace.
- **Status:** locked

## D13 — Custom fields

- **Decision / Why:** The workspace defines a custom field's name, type and options. A
  unit may hide/show it, change whether it is required, its order, and its default — but
  **never its type**. Changing a type is owner-only, at workspace level, and versioned.
  Storage is **per unit**, so one unit's answers never appear in another unit's form.
- **Consequence:** The workspace definition and the unit's presentation are two different
  documents. A version bump must not silently reinterpret existing values; the old
  version has to stay readable.
- **Status:** locked — the storage versioning detail needs to be designed before building.

## D14 — Audit retention: 24 months hot plus a yearly export

- **Decision / Why:** Audit events stay live for 24 months, and a yearly export is taken
  as a durable copy. Clinical audit is needed for review, not forever in a hot
  collection.
- **Consequence:** Needs the **Blaze plan** (scheduled function writing an export to
  Storage, then pruning). Nothing is automated today; Firestore has no TTL configured and
  audit is append-only. Until then, the retention policy is manual.
- **Status:** locked (implementation needs Blaze)

## D15 — The `department-system-v1` branch is abandoned

- **Decision / Why:** That branch is an old direction. It must never be merged into the
  current line.
- **Consequence:** It must not be used as a source of code, a base for a PR, or a deploy
  target. Some old workflows still reference it (`department-web-preview.yml`,
  `deploy-department-system-v1-pages.yml`, and it appears in several branch lists) — they
  should be treated as legacy, not as live deployment paths.
- **Status:** locked

## D16 — A patient file can be shared across units, not copied

- **Decision / Why:** When a member adds a patient whose normalised name already exists in
  **another unit he belongs to**, the app shows the same English prompt as for a
  same-unit match, naming the unit and the existing MRN: *"A patient with this name is
  already registered in {unit} ({MRN}). Do you want this patient to share the same file?"*
  If he accepts, the **same clinical file becomes visible to both units** (option B chosen
  by the owner on 2026-10-21). The clinical reason: most shared members are the same
  department split across floors, so one file is the truth.
- **Consequence:** Every member of the second unit can read the whole file, including the
  first unit's notes, results and media. That is accepted deliberately. It requires a
  `unitIds` array on the patient document (the set of units that may see it) and a rules
  change: read is allowed if the caller belongs to **any** unit in that array. A
  cross-unit lookup is only performed across units the caller already belongs to; a unit
  he is not in is never queried, so the prompt itself can never leak.
- **Status:** locked — **implemented** in `v2.1-build` (patient documents carry `unitIds`;
  the rules read a shared file for any unit the caller belongs to; the admission
  screen asks before it writes anything).

## D17 — A workspace picker is needed (B3)

- **Decision / Why:** The owner confirmed he really does have clinicians who work in more
  than one team with the same Google account. Without a picker, the app can only hold one
  active team per device and switching means leaving the current one.
- **Consequence:** Each account gets a small `userWorkspaces/{uid}` index, written when it
  joins a team, and the app shows a team chooser after sign-in when the index has more
  than one entry. The picker only lists indexed teams, and opening a team still requires a
  real membership document — the index is a hint, never an authorisation.
- **Status:** locked — **implemented** in `v2.1-build` (`userWorkspaces/{uid}/workspaces/{workspaceId}`;
  the picker opens when the account belongs to more than one team, and the index
  grants nothing on its own).
