# CardioVault — Security Model

This is the contract written in `firestore.rules`, collection by collection. The rules
are the real gate; the app's own checks only stop a user from *trying* something that
would be refused anyway. If this document and `firestore.rules` ever disagree, the
rules file wins.

## 1. The three identities

| Function in the rules | Meaning |
|---|---|
| `signedIn()` | A Firebase account is authenticated. |
| `platformOwner()` | A document `/platformOwners/{request.auth.uid}` **exists**. Nothing else. |
| `adminOf(workspaceId)` | Literally `platformOwner()`. There is no per-workspace owner. |
| `member(workspaceId)` | `workspaces/{ws}/members/{uid}` exists, `active != false`, `forceReauth != true`. |
| `unitMember(ws, unitId)` | `member(ws)` **and** an active `team/{uid}` profile **and** the unit appears in `assignedUnitIds[]`, `unitId`, or `unitIds[]`. |
| `clinicalEditor(ws, unitId)` | `unitMember(...)` and `members/{uid}.role == 'clinical_editor'`. |
| `canWrite(ws)` | `adminOf(ws)` (the platform owner) **or** the subscription clock is still live. |

Two consequences worth saying out loud:

- **`ownerUid` on a workspace document grants nothing.** The rules never read it. The
  only thing that makes an account the owner is the `platformOwners/{uid}` document,
  which is written from the Firebase console only.
- **The platform owner is not a member of anything.** He is outside every unit roster,
  and still has full read/write everywhere because `adminOf()` is true for every
  workspace id.

## 2. `/platformOwners/{uid}` — the owner registry

| Operation | Allowed |
|---|---|
| `get` | The account itself only (`request.auth.uid == uid`) |
| `list`, `create`, `update`, `delete` | Never, from any client |

**Why:** one owner exists for the whole platform. The app is allowed to read its own
entry so it knows which screens to show; it can never create or promote itself. The
document is created by hand in the Firebase console, and that must happen **before** any
rules deployment that depends on it (see `RUNBOOK.md`).

## 3. `/users/{uid}` — legacy per-account data

`read, write` allowed only for `request.auth.uid == uid`, including the `beds` and
`patients` subcollections. This is pre-workspace data kept alive for the owner's one-time
migration; it is invisible to everybody else, but the account can still write it.

## 4. `/accessCodes/{sha256}` — unit access codes (routing copy)

| Operation | Allowed | Why |
|---|---|---|
| `get` | Any signed-in account | A fresh device must be able to look up which workspace a typed code belongs to. The document id is the hash, so you can only find a code you already hold. |
| `create` | `adminOf(workspaceId)` | Only the platform owner issues unit access codes. |
| `update`, `delete` | `adminOf(workspaceId)` | Only the owner revokes them. |

The authoritative copy lives at `workspaces/{ws}/accessCodes/{hash}`, which is
**owner-read/write only** (`match /accessCodes/{hash} { allow read, write: if adminOf }`).
Creating a code also revokes the previous live code for that unit
(`generateUnitAccessCode`), so a unit has one live code at a time.

## 5. `/invites/{hash}` — routing index for temporary invites

| Operation | Allowed | Why |
|---|---|---|
| `get` | Any signed-in account | So a stranger's app can learn which workspace the typed code belongs to |
| `list` | Never | Listing would expose the invite graph |
| `create` | `canWrite` + `unitMember(ws, unitId)` + `createdBy == self` + expiry in the future | A member may invite into a unit they are already in |
| `update`, `delete` | `adminOf` or the creator | Withdrawing your own code |

The index carries `workspaceId`, `unitId`, `unitName`, role, expiry. It never carries
the plain code. The rules never trust it for state.

## 6. `workspaces/{workspaceId}` — the tenant document

| Operation | Allowed | Why |
|---|---|---|
| `create` | Any signed-in account, with `createdBy == self`, **no** `ownerUid`/`ownerEmail` keys, and an id of `ws_[A-Za-z0-9_-]{8,64}` (or `cardiovault_master_workspace`) | Anybody may bootstrap a customer workspace, but a customer can never claim ownership |
| `get` | `adminOf` or `member` | Members may read the tenant document |
| `update`, `delete` | `adminOf` | Renaming / deleting a workspace is the owner's job |

**Why the id pattern:** it keeps clients from writing arbitrary document ids such as
`users` or `platformOwners` shaped strings, and keeps workspace ids recognisable.

## 7. `workspaces/{ws}/members/{uid}` — membership

| Operation | Allowed | Why |
|---|---|---|
| `get` | `adminOf` or the member himself | Nobody else needs to read your membership |
| `list` | `adminOf` only | **A member cannot enumerate the workspace's members.** This is what makes the rosters necessary. |
| `create` | `canWrite` + `uid == self` + `unitIds` contains exactly the one granted unit + valid proof: a live access code whose `unitId` matches, **or** an invite already burned by this account for that unit | A membership is always born with exactly the unit that was granted |
| `update` | `adminOf`, **or** the member himself adding exactly one proved unit (access code / burned invite / a unit he just created) without changing his workspace role, without removing units, staying `active`, and touching only a fixed key list | Joining a second unit is self-service; everything else is administrative |
| `delete` | `adminOf` | Removing somebody is the owner's job |

Also allowed to a member: `clinicalRoles` on units he already belongs to, and nothing
else (`affectedKeys().hasOnly(['clinicalRoles','updatedAt'])`).

`members/{uid}/units/{unitId}` is a per-unit receipt used by the revoke flow: readable
by the owner or the member, writable by the member only with a valid code/invite,
deletable by the owner.

**Revocation:** `revokeUnitAccessCode` sets the code inactive, then removes that unit
from every membership that used it. A member with no units left gets
`active: false` + `forceReauth: true`, which makes `member()` false immediately.

## 8. `workspaces/{ws}/team/{uid}` — the account directory

| Operation | Allowed | Why |
|---|---|---|
| `get` | `adminOf`, or the account itself | A member may read his own profile only |
| `list` | `adminOf` only | **A member can no longer enumerate the workspace** |
| `create` | Owner, or the member himself, only as a non-privileged profile (`pending` / `nurse` / `resident` / `specialist`), `departmentId == 'dept-cardiology'`, `status == 'active'`, and `assignedUnitIds` a subset of his own membership units | The unit list is an access path, so it may not be inflated |
| `update` | Owner, or the member changing only `name`, `role`, `roleSelectedAt`, `updatedAt` to a self-selectable title (`nurse`/`resident`/`specialist`) | No self-promotion to consultant / admin |
| `delete` | `adminOf` | |

This collection is now the owner's management surface, not a member directory. The
workspace-wide leak it used to carry is closed: colleagues are read from the per-unit
roster below.

## 8b. `workspaces/{ws}/units/{unitId}/roster/{uid}` — who works in this unit

| Operation | Allowed | Why |
|---|---|---|
| `get`, `list` | `adminOf`, a member of that unit, or the account itself | A roster is readable only inside its own unit |
| `create`, `update` | `canWrite` + `request.resource.data.uid == uid` + (`adminOf`, or the account writing **its own** entry while already a member of the unit) | A member cannot add somebody else; the owner can write anybody's |
| `delete` | `adminOf` | |

This is the only directory a non-owner screen may use. Entries are written when a unit is
granted (access code or invite redemption), when the owner edits a member, and when a
member creates a unit. Removing a member from a unit deletes his roster entry, so a person
who left stops appearing in that unit's directory.


## 9. `workspaces/{ws}/units/{unitId}` — units

| Operation | Allowed | Why |
|---|---|---|
| `get` | `adminOf`, a member of that unit, or the creator (so he can read his own unit back before his membership catches up) | |
| `list` | `adminOf` only | A member never gets a list of the workspace's units; his unit ids come from his own membership (`getMyUnits()`) |
| `create` | `canWrite` + `member(ws)` + `createdBy == self` + `consultantUid == self` + `capacityLocked == false` + `createdAtMs <= now` | Creating a unit makes you its consultant |
| `update` | Owner; or a unit member claiming an **empty** `consultantUid` (that field only); or the unit's consultant editing `name`/`type`/`features`/`notes` only, never `totalBeds`, never unlocking capacity | Bed count is capacity, so it stays with the owner |
| `delete` | `adminOf` | |

**Consultant rule:** `consultant` is not a stored clinical title. It is the single slot
`units/{unitId}.consultantUid`. It can be claimed once by a member of the unit, and only
the platform owner can clear it.

## 10. `workspaces/{ws}/beds/{bedId}` — beds

| Operation | Allowed | Why |
|---|---|---|
| `get`, `list` | `adminOf` or `unitMember(ws, resource.unitId)` | Unit-scoped |
| `create`, `delete` | Owner; or the creator/consultant of the unit **inside its 1-hour provisioning window** and only while `capacityLocked != true` | Capacity can be set up once, then frozen |
| `update` | Owner, or a `clinicalEditor` of that unit, and `unitId` may not change | Occupancy changes are clinical acts |

## 11. `workspaces/{ws}/patients/{patientId}` — the clinical file

| Operation | Allowed | Why |
|---|---|---|
| `get`, `list` | `adminOf` or `unitMember(ws, resource.unitId)` | A member reads only patients of his units |
| `create` | `adminOf` or `clinicalEditor(ws, new unitId)` | View-only accounts cannot admit |
| `update` | `adminOf`, or `clinicalEditor` on the **new** unit **and** (`unitId` unchanged **or** `clinicalEditor` on the **old** unit) | Blocks cross-unit tampering by rewriting `unitId` while keeping legitimate transfers possible |
| `delete` | `adminOf` or `clinicalEditor` of the patient's unit | |

`list` is filtered by `resource.data.unitId`, which is why the client must query
patients with a `where('unitId', '==', ...)` filter for non-owners. Collection-group
queries are covered by rules test 13.

## 12. `workspaces/{ws}/units/{unitId}/tasks/{taskId}` — task board

`get, list, create, update`: `canWrite` + (`adminOf` or `unitMember(ws, unitId)`).
`delete`: `adminOf` only. Tasks live under their unit so a task never carries another
unit's patient name into your screen. The old top-level `/tasks` collection has no rule
and is denied.

## 13. `workspaces/{ws}/metadata/{documentId}`

`read, write`: `adminOf` only. Used for sync bookkeeping (`metadata/cloud`).

## 14. `workspaces/{ws}/media/{mediaId}` and `/chunks/{chunkId}` — clinical images

| Operation | Allowed |
|---|---|
| `get` | `adminOf` or `unitMember(ws, resource.unitId)` |
| `create`, `update` | `canWrite` + (`adminOf` or `clinicalEditor(ws, request.resource.data.unitId)`) |
| `delete` | `canWrite` + (`adminOf` or `clinicalEditor(ws, resource.unitId)`) |
| chunks `read` | `adminOf`, or a member of the unit that owns the parent media document |
| chunks `create/update/delete` | `canWrite` + (`adminOf` or an editor of the parent media's unit) |

Chunks inherit the parent's `unitId` by looking the parent up inside the rule, so you
cannot attach a chunk to another unit's image.

## 15. `workspaces/{ws}/audit/{eventId}` — audit trail

| Operation | Allowed | Why |
|---|---|---|
| `read` | `adminOf` | Only the platform owner reads the trail |
| `create` | `canWrite` + (`adminOf` or `member(ws)`) + `actorUid == request.auth.uid` + `workspaceId == ws` | A member may record his own action; nobody can attribute an event to somebody else |
| `update`, `delete` | Never | Append-only |

## 15b. `workspaces/{ws}/units/{unitId}/audit/{eventId}` — unit audit

| Operation | Allowed | Why |
|---|---|---|
| `get`, `list` | `adminOf` or a member of that unit | The unit's own trail |
| `create` | `canWrite` + a member of that unit + `actorUid == request.auth.uid` + `data.unitId == unitId` + `data.workspaceId == ws` | You can only append, in your own name, to your own unit |
| `update`, `delete` | Never | Append-only |

The workspace-level trail (§15) stays for membership-level events and is owner-readable.

## 16. `workspaces/{ws}/subscription/{documentId}` — subscription clock

| Operation | Allowed | Why |
|---|---|---|
| `get` | `adminOf` or `member` | The app must show "expires in N days" |
| `list` | `adminOf` | |
| `create` | Owner; **or** the workspace creator opening its one 3-day trial, with the exact shape: `status == 'trial'`, `trialEndsAtMs` between now and now + 72 h, `periodEndMs == trialEndsAtMs`, `graceEndsAtMs == trialEndsAtMs + 48 h` | Trial bootstrap without giving the owner's pen to customers |
| `update` | `adminOf`, and `periodEndMs` may only move **forward** | A bad client can never shorten or rewind a paid period |
| `delete` | `adminOf` | |

`canWrite(ws)` reads this document:

```
subActive(ws) = no subscription document
             OR no graceEndsAtMs key
             OR graceEndsAtMs > request.time   (server time, not the phone clock)
```

So an expired workspace is read-only for every non-owner write path below the
workspace, while the platform owner keeps working. **No data is deleted on expiry.**

## 17. Default deny

```
match /{document=**} { allow read, write: if false; }
```

Everything not matched above — including the old top-level `/tasks` collection and any new
collection somebody forgets to declare — is refused. `appConfig/{documentId}` is the one
exception: a signed-in account may `get` a release document (never `list`, never write), so
the app can show a "new version available" banner without a server.

## 18. Hard rules, and exactly how far they go

**"A member never sees members of units he does not belong to."**
Enforced for clinical data (patients, beds, media, tasks) through
`unitMember(workspaceId, unitId)`; for the membership collection by making `members` list
owner-only; and for people by making `team` list owner-only and feeding every non-owner
directory from `units/{unitId}/roster`, whose `list` is itself unit-scoped. Rules tests
43–52 cover this.

**"No audit event is ever written for a unit that is not yours."**
The unit trail (`units/{unitId}/audit`) requires membership of that exact unit, an
`actorUid` equal to the caller, and a `unitId` field equal to the path. The workspace
trail (`/audit`) stays for membership-level events and checks the actor, not a unit.


## 19. Known gaps / not covered yet

1. **No rate limiting on access codes or invites.** `/accessCodes/{hash}` and
   `/invites/{hash}` allow `get` to any signed-in account. Guessing is limited only by
   code entropy (10 characters from a 32-symbol alphabet, ~50 bits), not by throttling.
   Firebase App Check would raise the cost of guessing; it is **not** enforced in the
   rules (there is no `request.app` check anywhere).
2. **Trial abuse is possible.** Workspace creation only needs a signed-in account, and
   the creator may open a trial for each new workspace he creates. Nothing limits how
   many workspaces one account creates.
3. **`/users/{uid}` is still fully writable by its own account.** No clinical data should
   be written there any more, but the rule still allows it.
4. **No automated audit retention.** Append-only means nothing is deleted; the 24-month
   hot + yearly export policy is manual (and needs the Blaze plan).
5. **Content is not validated, only identity and unit scope.** The rules check who you
   are and which unit a document belongs to; they do not check payload size, required
   clinical fields, or bed-count minimums (the 3-bed minimum is a product rule, not a
   rule in Firestore).
6. **Expired invites are never cleaned up.** Clients filter them out; the documents stay.
7. **No server-side audit of reads.** Reads are not logged, so "who opened this file"
   cannot be answered from Firestore alone.
8. **Rosters are not backfilled.** An account that joined before the roster existed sees
   an empty Team screen until it redeems a code again or the owner saves it. That is a
   visible gap, not a leak — the old workspace-wide list is no longer readable.
9. **Roster removal is best-effort.** If deleting a person from a unit fails after his
   membership was removed, a stale roster row can remain; it is still visible only to
   that unit's members, and disappears the next time the owner saves that member.

