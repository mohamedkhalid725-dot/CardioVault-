# CardioVault — Runbook

How to run, test and build the app on this Windows machine. Every npm command below is
copied from `package.json` on purpose — if it is not in `package.json`, it is not here.

## 0. Two things that bite everybody

**Use `npm.cmd`, not `npm`, in PowerShell.** Windows blocks `npm.ps1` under the default
execution policy, and the error looks like a script-signing problem rather than a PATH
problem.

```powershell
npm.cmd run build
```

**Never run `npm install` or `npm ci` inside a worktree.** `node_modules` is a Windows
junction shared by several worktrees; installing from one worktree rewrites it for all of
them. If a dependency was removed from `package.json`, the stale copy simply stays in
`node_modules` — that is harmless, and `bun.lock` is not regenerated automatically.

Working directory used below:

```powershell
cd 'G:\MY PROJECTS\CV-worktrees\lane4-cleanup'
```

## 1. Run the app locally (no emulator, real Firebase)

```powershell
npm.cmd run dev
```

`dev` is `vite`. Vite prints the local URL (normally `http://localhost:5173`). This
talks to the real Firebase project.

Production build, then serve the build:

```powershell
npm.cmd run build
npm.cmd run preview
```

`build` is `vite build` (output in `dist/`), `preview` is `vite preview`.

## 2. Run the emulators and the demo accounts

Terminal 1 — start the emulators:

```powershell
npm.cmd run emulators:start
```

This is `npx firebase-tools@15.30.2 emulators:start --only firestore,auth,storage --project cardiovault-emulator-test`.
Ports come from `firebase.json`: **Firestore 8080**, Auth 9099, Storage 9199, Emulator UI
4000.

Terminal 2 — seed the demo data (run once, after the emulators are up):

```powershell
npm.cmd run emulators:seed
```

Terminal 3 — run the web build against the emulators:

```powershell
npm.cmd run dev:emulator
```

That is `vite --mode emulator`, which loads `.env.emulator` (`VITE_FIREBASE_EMULATOR=true`).
Do **not** use `npm run dev` for emulator work — it ignores `.env.emulator`.

**Demo accounts created by the seed** (`scripts/seed-emulator.mjs`), password
`Test1234!`:

| Account | Role |
|---|---|
| `doctor@emulator.test` | Platform owner (also seeded into `/platformOwners`) |
| `resident@emulator.test` | Clinical editor of CCU-1 |
| `nurse@emulator.test` | Second member |
| `newcomer@emulator.test` | No membership — use it to test the access gate |

Demo codes:

| Code | Use |
|---|---|
| `CV-DEMO-CCU1-2026` | Unit access code for `unit-ccu-1` |
| `CV-JOIN-ICU-2026` | Single-use invite to `unit-icu-1` |

All seeded data is synthetic (patients are "DEMO PATIENT A/B/C", hospital is "Demo
Hospital Cardiology"). Never put real patient data in the emulator.

Stop the emulators with `Ctrl+C` in their terminal. If the next run says port 8080 is in
use, an old emulator is still alive — close it first; the rules suite needs that port.

## 3. Run the Firestore rules test suite

This suite is the only proof that unit/workspace isolation still works. It needs **Java
21** and **port 8080 free**.

The JRE is bundled on this machine:

```powershell
$env:JAVA_HOME = 'G:\MY PROJECTS\tools\temurin-jre21'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
java -version    # expect openjdk 21.x
```

Then:

```powershell
npm.cmd run test:firestore-rules
```

That is `npx firebase-tools@15.30.2 emulators:exec --only firestore "node --test test/firestore.rules.test.js"`.
`emulators:exec` starts its own Firestore emulator on **8080**, runs the suite, and shuts
it down — so do not run it while `emulators:start` is running in another terminal.

The suite currently has **42 tests** in `test/firestore.rules.test.js` (unit isolation,
workspace isolation, invites, consultant slot, capacity window, subscription lock,
append-only audit, default deny). Every test must pass before any rules change is
merged. First run downloads `firebase-tools@15.30.2` through `npx`, so it needs internet
once.

Other tests (clinical content, voice proxy, summaries) — no emulator, no Java:

```powershell
npm.cmd run test:summary-input
```

## 4. Typecheck

```powershell
node node_modules\typescript\lib\tsc.js --noEmit
```

Exit code 0 means clean. This is the same check as `npm.cmd run lint` (`tsc --noEmit`),
but calling the compiler directly avoids the PowerShell `npm.ps1` problem and avoids any
wrapper surprises. Run it after every change.

## 5. Build

```powershell
npm.cmd run build
```

Output: `dist/`. `npm.cmd run clean` is `rm -rf dist server.js` — a Unix command, and
`server.js` no longer exists, so on Windows it may just fail. Nothing depends on it;
delete `dist/` by hand if you need to.

## 6. Android

The `android/` folder is **not committed** in this branch. Generate it once with:

```powershell
npm.cmd run cap:add
```

`cap:add` is `npx cap add android`. Then, for a debug APK:

```powershell
npm.cmd run android:debug
```

That is `npm run build && npx cap sync android && cd android && ./gradlew assembleDebug`.
It needs the Android SDK and a JDK; on this machine the JDK is the same
`G:\MY PROJECTS\tools\temurin-jre21` (set `JAVA_HOME` as in §3).

After changing web code, `npm.cmd run cap:sync` is enough to copy `dist/` into the
Android project. `npm.cmd run cap:sync:ios` exists but iOS is parked (see
`DECISIONS.md` D1) — do not spend time there.

## 7. Deploying — read this before running anything

**No deploy may ever be run without the owner's explicit approval — not from a terminal,
not from CI, not "just the rules".** This includes `firebase deploy` in any form.

Two CI workflows will deploy if they are triggered, so pushing a branch can be a deploy:

| Workflow | Trigger | What it deploys |
|---|---|---|
| `cardivault-ci.yml` | push to one of its listed branches (`main`, `department-system-v1`, `build-972-clean`, `task1-email-auth`, the `task2-*` / `phase*` branches …) or a PR | **Firestore rules** (via the Admin SDK, unless the branch is `phase2-security-review`) and, for `main` / `department-system-v1` / `build-972-clean` / `task1-email-auth`, **Hosting live** |
| `cardiovault-release.yml` | manual `workflow_dispatch` only | **Firestore rules** (`firebase deploy --only firestore:rules`) as part of the signed release |

Legacy, do not use: `department-web-preview.yml` and
`deploy-department-system-v1-pages.yml` still point at the abandoned
`department-system-v1` branch (`DECISIONS.md` D15).

`build/lane4-cleanup` is not in the CI branch list, so pushing it does not deploy. That is
the only reason it is safe.

### Before any production rules deployment

1. **Create `/platformOwners/{uid}` in the Firebase console first.** The document for
   `mohamedkhalid725@gmail.com` must exist before the new rules go live, or the real owner
   is treated as an ordinary account and every owner screen loads empty. The rules cannot
   create it (client writes are refused by design).
2. **Take a data export first.** Firestore export to a Cloud Storage bucket (or at minimum
   a full collection dump) so a bad rules deployment can be rolled back without losing
   anything.
3. Run the rules suite (§3) and the typecheck (§4) against the exact commit being
   deployed.
4. Deploy rules only. Do not bundle a hosting deploy into the same step unless the owner
   asked for the web app to change too.

Rollback: the Firebase console keeps the previous ruleset; re-publish it from
**Firestore → Rules → history**. That does not restore data, which is why step 2 exists.

## 8. Emergency: a member can see data they should not

Do this in order, and do not delete anything while investigating.

1. **Stop the bleeding first — revoke access, do not delete records.**
   - Owner → Settings → the unit's access code → revoke it. Revoking sets the code
     inactive and strips that unit from every membership that used it; accounts with no
     units left get `active: false` + `forceReauth: true` and are locked out on their next
     check.
   - For a temporary invite, revoke the invite (creator or owner).
2. **Confirm the lock actually took.** In the Firebase console, open the affected
   `workspaces/{ws}/members/{uid}` and check `active` and `forceReauth`. If a membership
   still lists the unit, fix it by hand from the console (`unitIds` without that unit,
   `active: false` if nothing is left). The console is the only place with authority over
   every document.
3. **Check whether it is a rules hole or a UI bug.** If the data is visible through a
   collection the rules allow workspace-wide (today: `workspaces/{ws}/team`), the fix is a
   rules change, not a data change. See `SECURITY-MODEL.md` §18–19.
4. **Record what happened** in `workspaces/{ws}/audit` from the console: who, which unit,
   what was seen, when, and who was told. The trail is append-only; write it once, clearly.
5. **Tell the owner before doing anything irreversible.** No production-rules deployment
   and no data deletion without his explicit approval (§7).
6. Afterwards: add a test to `test/firestore.rules.test.js` that reproduces the leak, and
   only then change the rules.

## 9. Quick reference

| Task | Command |
|---|---|
| Dev server (real Firebase) | `npm.cmd run dev` |
| Build | `npm.cmd run build` |
| Preview a build | `npm.cmd run preview` |
| Emulators | `npm.cmd run emulators:start` |
| Seed emulator data | `npm.cmd run emulators:seed` |
| Dev server against emulators | `npm.cmd run dev:emulator` |
| Rules tests (Java + port 8080) | `npm.cmd run test:firestore-rules` |
| Clinical/voice unit tests | `npm.cmd run test:summary-input` |
| Typecheck | `node node_modules\typescript\lib\tsc.js --noEmit` |
| Typecheck (npm form) | `npm.cmd run lint` |
| Add Android project (once) | `npm.cmd run cap:add` |
| Sync web build into Android | `npm.cmd run cap:sync` |
| Debug APK | `npm.cmd run android:debug` |
