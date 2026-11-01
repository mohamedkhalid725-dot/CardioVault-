import test from 'node:test';
import assert from 'node:assert/strict';
import { createUnitActivationRequest, isUnitActivationRequestActionable, unitActivationRequestId } from '../src/services/unitActivationModel.ts';

test('activation request identity is stable for a workspace/unit pair and isolated across workspaces', () => {
  assert.equal(unitActivationRequestId('ws_customer01', 'unit-cicu'), unitActivationRequestId('ws_customer01', 'unit-cicu'));
  assert.notEqual(unitActivationRequestId('ws_customer01', 'unit-cicu'), unitActivationRequestId('ws_customer02', 'unit-cicu'));
});

test('request builder stores only bounded unit metadata and starts pending', () => {
  const request = createUnitActivationRequest({
    workspaceId: ' ws_customer01 ', unitId: ' unit-cicu ', unitName: 'CICU', requestedBedCount: 12.8,
    requestedBy: 'doctor-1', requestedByName: 'Dr. A', requestedAtMs: 1762050000000,
  });
  assert.equal(request.requestId, 'ws_customer01__unit-cicu');
  assert.equal(request.requestedBedCount, 12);
  assert.equal(request.status, 'pending');
  assert.equal(request.schemaVersion, 1);
  assert.equal('patientName' in request, false);
});

test('request builder rejects missing identity and invalid bed counts', () => {
  assert.throws(() => createUnitActivationRequest({ workspaceId: '', unitId: 'u', unitName: 'U', requestedBedCount: 1, requestedBy: 'uid', requestedByName: 'A', requestedAtMs: 1 }));
  assert.throws(() => createUnitActivationRequest({ workspaceId: 'ws_customer01', unitId: 'u', unitName: 'U', requestedBedCount: -1, requestedBy: 'uid', requestedByName: 'A', requestedAtMs: 1 }));
});

test('only pending and in-progress requests remain actionable', () => {
  assert.equal(isUnitActivationRequestActionable('pending'), true);
  assert.equal(isUnitActivationRequestActionable('approving'), true);
  assert.equal(isUnitActivationRequestActionable('approved'), false);
});
