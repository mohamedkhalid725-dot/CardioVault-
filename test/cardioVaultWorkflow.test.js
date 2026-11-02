import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'cardivault-ci.yml'),
  'utf8',
);

test('v2.1-build pull requests run CI validation', () => {
  assert.match(workflow, /pull_request:\s*\r?\n\s*branches:\s*\[[^\]]*v2\.1-build/);
});

test('live deploy is an explicit workflow_dispatch opt-in', () => {
  assert.match(workflow, /workflow_dispatch:\s*\r?\n\s*inputs:\s*\r?\n\s*deploy_live:[\s\S]*?type:\s*boolean[\s\S]*?default:\s*false/);

  for (const step of [
    'Assert live deploy cannot use staging Firebase config',
    'Rebuild the production web bundle for the live deploy',
    'Deploy CardioVault Web App to Firebase Hosting live',
  ]) {
    const start = workflow.indexOf(`- name: ${step}`);
    assert.notEqual(start, -1, `missing workflow step: ${step}`);
    const nextStep = workflow.indexOf('\n      - name:', start + 1);
    const block = workflow.slice(start, nextStep === -1 ? undefined : nextStep);
    assert.match(block, /github\.event_name == 'workflow_dispatch'/, `${step} must be manual-only`);
    assert.match(block, /inputs\.deploy_live == true/, `${step} must require explicit opt-in`);
  }
});
