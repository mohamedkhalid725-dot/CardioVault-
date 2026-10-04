# CardioVault Pre-Launch Checklist

**Scope:** Pre-launch gate for the first real patient.  
**Current phase:** Staging only. Fake/test data only.  
**Do not treat this checklist as authorization to touch production.**

## Mandatory open items before the first real patient

- [ ] **Offline / typed-text loss:** Fix the current offline/typed-text-loss behavior and the unsaved-text/overlay problem. This was intentionally left unchanged in the current voice phase.
- [ ] **Remove preview/debug/skip paths:** Remove every preview-only, App Check debug-provider, and App Check skip flag/path from the production code and build configuration. Delete any debug token and ensure no debug token is stored in source control, CI configuration, or release artifacts.
- [ ] **Production Firebase App Check:** Configure the production Firebase web app with the production Enterprise App Check key and complete the live merge only with explicit production guards. Production App Check enforcement must remain ON.
- [ ] **Retire reCAPTCHA v3:** Delete the old reCAPTCHA v3 key and remove any remaining references to it after the production Enterprise App Check migration is verified.
- [ ] **Gemini billing / budget:** Move the production AI workload to the required paid Gemini tier (Blaze), configure a budget alert, and verify the expected billing controls before real patient use.
- [ ] **Legal / patient-data review:** Complete legal/privacy review of patient-data use with the AI features, including what data is sent to AI, retention/processing implications, disclosures/consent requirements, and the applicable clinical/privacy requirements.
- [ ] **APK AI path:** Decide and complete the Android AI path before enabling AI for real patients: use the supported native SDK path with the required Play Integrity/App Check protection, **or disable AI in the APK** until that protection is implemented and verified.
- [ ] **Firestore/Auth monitoring gap:** Reassess the existing Firestore/Auth monitoring-gap plan and remove it from the launch plan if it is no longer needed; otherwise complete it before launch.
- [ ] **AI Logic App Check enforcement deadline:** Verify Firebase AI Logic App Check enforcement remains enabled and complete all required enforcement work no later than **November 2, 2026**.

## Launch gates

- [ ] No real patient data is used during staging verification.
- [ ] Google Sign-In remains unchanged and passes its existing regression checks.
- [ ] Production/live deployment is separate from staging and cannot consume staging Firebase/App Check configuration.
- [ ] No preview/debug/skip configuration can reach a production web build or APK.
- [ ] Voice, AI lab analysis, and any other AI output remain reviewable before saving.
- [ ] First-real-patient launch is blocked until every mandatory item above is checked off.

## Current explicit exclusions from this phase

- Do **not** implement the offline/typed-text-loss fix during the current voice-prompt testing phase.
- Do **not** add the Patient File microphone controls yet.
- Do **not** change the live site, production secrets, Google Sign-In, APK AI behavior, main branch, or production App Check configuration as part of this staging test.
