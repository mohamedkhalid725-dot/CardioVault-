# Patient master-file release runbook

This runbook covers the safe operational sequence for the unit-scoped patient master-file index and the owner-controlled legacy backfill. It is for the release owner and the designated operator. It does not authorize a production change.

## Current status and scope

- **Firestore rules have already been deployed to production by CI.** Do not treat this runbook or this documentation change as a rules deployment. Check the corresponding GitHub Actions run and deployed rules history when confirming the current state; do not rerun a deployment merely to verify it.
- This documentation task makes **no production writes and performs no deploys**. It does not run the backfill, change Firestore data, publish rules, or deploy Hosting.
- Backfill execution is a production data write. Do it only after separate, explicit authorization from the owner. A preview is read-only, but still use the authorized owner account and the approved production APK/build.
- Hosting is independent of the rules and data work. Deploy Hosting only when separately and explicitly authorized.

## 1. Confirm deployment status; do not deploy

1. In GitHub, inspect the successful CI run for the commit intended for the release. Confirm the Firestore-rules deployment step succeeded and record the run URL, commit SHA, and timestamp in the release record.
2. In Firebase Console, select project `ccu-notebook` and inspect **Firestore Database → Rules → History**. Confirm the active ruleset corresponds to the intended deployment. This is a verification step only; do not click **Publish** or trigger another workflow to “make sure.”
3. If the CI run, commit, or active ruleset cannot be matched confidently, **stop** and ask the release owner to resolve the discrepancy. Do not deploy as a diagnostic.

## 2. Before any future rules deployment

Only if a later, separately authorized rules change actually requires a deployment:

1. In Firebase Console for `ccu-notebook`, inspect `platformOwners/{ownerUid}` using the authenticated platform owner's Firebase Auth UID. Confirm the document exists at the exact UID path. The existence of that document is the owner registry; a workspace `ownerUid`, email, or client-side setting is not a substitute.
2. If the document is absent or the UID is uncertain, stop. The authorized owner must verify/provision it manually in Firebase Console before any rules deployment. Do not create it from the app, a script, or this runbook.
3. Verify the exact candidate commit and required tests, arrange the approved data backup/rollback plan, and obtain explicit deployment approval before initiating a rules deployment. Deploy only the authorized rules change; do not bundle Hosting.
4. Afterward, verify the active ruleset in Console and exercise the owner and member checks in §5. For a rules regression, stop use of the affected release and have the owner restore the known-good ruleset via **Firestore → Rules → History**. Restoring rules does not undo data writes; handle those separately with the owner and a reviewed recovery plan.

## 3. Owner Settings: read-only preview first

Use the owner account on the approved APK/build and open **Settings → Legacy patient master files**. This is an owner-only panel. Do not use a member account to try to expose it.

1. Select **Preview backfill** and wait for it to finish. Preview reads server-confirmed active and archived patient records and performs no writes.
2. Review the totals before deciding whether to proceed:
   - patient records and archived records included;
   - missing master files and existing files/indexes to confirm;
   - records with missing original admission dates; and
   - records skipped for invalid or missing unit scope.
3. Do not infer that skipped records are safe to ignore. If the counts are surprising, records are skipped, dates are missing unexpectedly, or the preview cannot complete, stop and investigate with the owner before execution. Do not “fix” scope by broadening access.
4. A preview is not authorization to write. Proceed only after the owner has separately authorized this production backfill and approves the exact preview counts/scope. If the data changes materially or the app is refreshed, run a fresh preview and review it again.

## 4. Manually confirmed backfill and result review

After the authorization and preview gates above are satisfied, the owner—not an unattended job—must select **Run confirmed backfill** and explicitly accept the confirmation dialog for the reviewed workspace and record count. The implementation processes batches of 10 and is intended to be idempotent and safe to retry after review.

1. Keep the app open and monitor progress: processed/total, completion count, and failure count. Do not start a second run while one is in progress.
2. At completion, inspect the result counts: master files created, unit indexes repaired, and admission events created or confirmed. Confirm that missing original dates did not result in fabricated timeline events; the tool reports these separately.
3. If any record fails, progress stops unexpectedly, counts differ from the reviewed preview, or the app reports an ambiguous outcome, stop. Preserve the aggregate counts and sanitized error category for the owner; do not repeatedly retry blindly. A retry is appropriate only after the owner reviews the failures and confirms the same scope. The operation is designed to be safe to retry, but that is not permission to ignore errors.
4. Verify the result in the app and with the operational checks in §5. Do not repair clinical records or indexes manually in the console without a separately reviewed recovery instruction.

## 5. Field test with both account types

Use the approved APK/build on a non-production test patient when available. For a production smoke test, use only an owner-approved, non-identifying check that does not create or alter a real patient's clinical record. Never use patient names, identifiers, screenshots, or record contents in a ticket, terminal output, CI log, or release note.

1. **Member account:** sign in as a normal member assigned to one test unit. Confirm the member can access only that unit's permitted patient/master-file view and can perform only the already-authorized member workflow. Confirm another unit's records are not visible. Do not test by opening or exporting real patient data.
2. **Owner account:** sign in as the platform owner. Confirm Owner Settings and the legacy master-file preview are available; confirm the preview loads and does not change data. If the backfill was separately authorized and executed, review its aggregate outcome and verify the expected unit-scoped files/indexes through the approved app workflow.
3. If either role has unexpected access, is denied unexpectedly, or the APK/build does not match the reviewed commit, stop testing and escalate to the owner. Do not compensate with a rules change, backfill, or Hosting deployment.

## 6. Hosting is a separate release decision

Do not deploy Hosting as part of confirming rules status or running a backfill. A Hosting deployment requires its own explicit authorization, reviewed commit, and release verification. If the owner has not separately authorized it, leave Hosting unchanged.

## Stop conditions and data-handling rules

Stop and ask the release owner before proceeding if any of these occur:

- CI and Firebase Console do not agree on the deployed ruleset or intended commit.
- The owner UID or `platformOwners/{ownerUid}` existence is uncertain before a future rules deployment.
- The preview scope/counts are unexpected, records are skipped, or original dates are missing unexpectedly.
- A backfill error occurs, progress stalls, results are ambiguous, or result counts do not reconcile.
- A member sees another unit's data, the owner loses expected access, or the tested APK/build is not the reviewed build.
- There is no separate explicit authorization for a production backfill, rules deployment, or Hosting deployment.

Do not put patient-identifying or clinical data in application logs, CI logs, shell output, screenshots, issue/PR comments, or release notes. Log only operational metadata such as commit/run identifiers, timestamps, aggregate counts, and sanitized error categories. Do not publish patient IDs from the UI's per-record failure list. Preserve the minimum necessary evidence securely and report incidents through the approved private channel.
