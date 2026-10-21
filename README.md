# CardioVault

A clinical notebook for a cardiology department / CCU. React + Vite + TypeScript app,
running as an Android app (Capacitor) and as a web app, with Firebase as the backend
(Authentication, Firestore, AI Logic for voice).

This release is Android only, distributed as a signed APK on APKPure. See
`docs/DECISIONS.md` for why.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the app is put together, the layer
  map and the Firestore data model.
- [docs/SECURITY-MODEL.md](docs/SECURITY-MODEL.md) — who may read and write what, as
  enforced by `firestore.rules`, plus the known gaps.
- [docs/DECISIONS.md](docs/DECISIONS.md) — the decision log for this release.
- [docs/RUNBOOK.md](docs/RUNBOOK.md) — how to run, test, build and (only with the owner's
  approval) deploy.

## Quick start

```powershell
npm.cmd run dev        # real Firebase
npm.cmd run build      # production build into dist/
```

Never run `npm install` inside a worktree: `node_modules` is shared between worktrees.
Full instructions, including the emulator and the rules test suite, are in
[docs/RUNBOOK.md](docs/RUNBOOK.md).
