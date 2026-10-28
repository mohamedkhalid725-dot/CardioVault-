// Static assertions on firestore.rules.
//
// The Firebase Emulator is not available in this environment (and the task
// forbids it), so end-to-end rule behaviour cannot be exercised here. What CAN
// be checked is the exact source text that will be deployed: this test fails if
// the clinic-only branch, the owner-only preference document or the default
// deny tail is ever weakened.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

/** Slices one top-level `match` block (4-space indented siblings terminate it). */
const matchBlock = (needle: string): string => {
  const start = rules.indexOf(needle);
  assert.notEqual(start, -1, `${needle} is missing from firestore.rules`);
  const rest = rules.slice(start + needle.length);
  const end = rest.search(/\n {4}match \//);
  return needle + (end === -1 ? rest : rest.slice(0, end));
};

/** Slices one function body (4-space indented closing brace terminates it). */
const functionBody = (needle: string): string => {
  const start = rules.indexOf(needle);
  assert.notEqual(start, -1, `${needle} is missing from firestore.rules`);
  const rest = rules.slice(start + needle.length);
  const end = rest.search(/\n {4}\}\n/);
  return needle + (end === -1 ? rest : rest.slice(0, end));
};

// ---------------------------------------------------------------------------
// Fix 3: owner unit visibility
// ---------------------------------------------------------------------------

test('ownerPreferences is readable and writable only by the platform owner', () => {
  const block = matchBlock('match /ownerPreferences/{uid} {');

  assert.match(block, /allow get: if signedIn\(\) && request\.auth\.uid == uid && platformOwner\(\);/);
  assert.match(block, /allow list: if false;/, 'the owner never lists other owners');
  assert.match(
    block,
    /allow create, update: if signedIn\(\) && request\.auth\.uid == uid && platformOwner\(\)/,
  );
  assert.match(block, /allow delete: if signedIn\(\) && request\.auth\.uid == uid && platformOwner\(\);/);

  // The stored shape is bounded so a hand-written document cannot grow forever.
  assert.match(block, /request\.resource\.data\.hiddenUnitIds is list/);
  assert.match(block, /request\.resource\.data\.hiddenUnitIds\.size\(\) <= 200/);

  // Every single allow line is owner-gated or a plain denial.
  const allows = block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('allow '));
  assert.ok(allows.length >= 4, 'expected get/list/create-update/delete');
  for (const line of allows) {
    assert.ok(/platformOwner\(\)/.test(line) || line === 'allow list: if false;', `unguarded rule: ${line}`);
  }
});

test('the preference document grants nothing to the unit or subscription rules', () => {
  // It is a separate top-level collection, not nested under /users/{uid}, whose
  // catch-all would have handed every account write access to it.
  assert.doesNotMatch(rules, /match \/users\/\{uid\}\/[\s\S]{0,400}ownerPreferences/);
  assert.match(rules, /match \/ownerPreferences\/\{uid\} \{/);
});

// ---------------------------------------------------------------------------
// Fix 2: clinic-only subscription requests
// ---------------------------------------------------------------------------

test('the clinic-only branch is narrow and priced', () => {
  const clinic = functionBody('function clinicOnlyRequest()');

  assert.match(clinic, /get\('unitIds', \[\]\)\.size\(\) == 0/, 'only a request without a unit');
  assert.match(clinic, /get\('requestType', ''\) == 'clinic'/, 'only the clinic request type');
  assert.match(clinic, /doctorsCount is int/);
  assert.match(clinic, /doctorsCount >= 1/);
  assert.match(clinic, /doctorsCount <= 200/);
  assert.match(clinic, /get\('clinicServices', \[\]\)\.size\(\) <= 20/);
  assert.match(clinic, /phone', ''\)\.size\(\) >= 7/);
  assert.match(clinic, /institutionName', ''\)\.size\(\) >= 2/);

  // Exact published price per doctor, in the currency the method implies.
  assert.match(clinic, /method == 'instapay'[\s\S]*currency', ''\) == 'EGP'[\s\S]*\* 500/);
  assert.match(clinic, /method == 'visa'[\s\S]*currency', ''\) == 'USD'[\s\S]*\* 20/);
});

test('a subscription request still requires membership, the caller and a pending state', () => {
  const block = matchBlock('match /subscriptionRequests/{requestId} {');
  const create = block.slice(block.indexOf('allow create'));

  assert.match(create, /member\(workspaceId\)/);
  assert.match(create, /request\.resource\.data\.workspaceId == workspaceId/);
  assert.match(create, /request\.resource\.data\.subscriberId == request\.auth\.uid/);
  assert.match(create, /request\.resource\.data\.status == 'pending'/);
  assert.match(create, /request\.resource\.data\.method in \['instapay', 'visa'\]/);
  assert.match(create, /request\.resource\.data\.get\('unitIds', \[\]\)\.hasOnly\(memberUnits\(workspaceId\)\)/);
  assert.match(create, /request\.resource\.data\.amount > 0/);
  assert.match(create, /request\.resource\.data\.get\('paymentVerified', false\) == false/);

  // The clinic-only branch is only reachable as the alternative to a non-empty
  // unit list - it can never approve a department request without a unit.
  assert.match(create, /request\.resource\.data\.get\('unitIds', \[\]\)\.size\(\) > 0\s*\|\| clinicOnlyRequest\(\)/);

  // Only the owner reads the queue, and only the owner decides.
  assert.match(block, /allow list: if adminOf\(workspaceId\);/);
  assert.match(block, /allow update: if \(\s*adminOf\(workspaceId\)/);
  // A requester may only withdraw their own pending request.
  assert.match(block, /resource\.data\.status == 'pending'/);
  assert.match(block, /request\.resource\.data\.status == 'withdrawn'/);
  assert.match(block, /affectedKeys\(\)\.hasOnly\(\['status', 'withdrawnAt'\]\)/);
});

test('the publisher 2.0.0 department and combined paths are unchanged', () => {
  // A department request still needs at least one unit of the caller's own
  // membership; nothing about it was relaxed to make the clinic case work.
  const create = matchBlock('match /subscriptionRequests/{requestId} {').split('allow create')[1] || '';
  assert.match(create, /unitIds', \[\]\)\.hasOnly\(memberUnits\(workspaceId\)\)/);
  assert.match(create, /size\(\) > 0/);
});

// ---------------------------------------------------------------------------
// Least privilege that must survive this change
// ---------------------------------------------------------------------------

test('unit documents stay owner-listable and members still need membership', () => {
  const block = matchBlock('match /units/{unitId} {');
  assert.match(block, /allow list: if adminOf\(workspaceId\);/);
  assert.match(block, /allow get: if adminOf\(workspaceId\) \|\| unitMember\(workspaceId,unitId\)/);
});

test('nothing in the rules is public or anonymous', () => {
  assert.doesNotMatch(rules, /allow [a-z, ]*: if true/);
  assert.doesNotMatch(rules, /request\.auth == null/);
  // Default deny tail must stay last.
  assert.match(rules, /match \/\{document=\*\*\} \{ allow read, write: if false; \}\s*\}\s*\}\s*$/);
});

test('the build still ships exactly one rules file at the configured path', () => {
  const config = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
  assert.equal(config?.firestore?.rules, 'firestore.rules');
});
