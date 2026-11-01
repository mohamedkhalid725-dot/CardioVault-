import test from 'node:test';
import assert from 'node:assert/strict';
import type { Bed, Patient, UserProfile } from '../src/types/clinical';
import { canTransferBetweenUnits, isAvailableLifecycleBed } from '../src/services/patientLifecycleAccess.ts';

const profile = (assignedUnitIds: string[]): UserProfile => ({
  userId: 'doctor-1', name: 'Doctor', email: 'doctor@example.com', role: 'specialist',
  clinicRole: 'doctor', departmentId: 'cardiology', assignedUnitIds, status: 'active', updatedAt: new Date(0).toISOString(),
});
const bed = (patientId?: string) => ({ id: 'bed-1', unitId: 'unit-b', bedNumber: 'B1', status: 'Empty', patientId } as Bed);
const occupant = (id: string, isArchived: boolean) => ({ id, isArchived } as Patient);
const assigned = (user: UserProfile, unitId: string) => (user.assignedUnitIds || []).includes(unitId);

test('transfer destination requires both unit permissions and assigned-unit authorization', () => {
  assert.equal(canTransferBetweenUnits(profile(['unit-a', 'unit-b']), 'unit-a', 'unit-b', () => true, assigned), true);
  assert.equal(canTransferBetweenUnits(profile(['unit-a']), 'unit-a', 'unit-b', () => true, assigned), false);
  assert.equal(canTransferBetweenUnits(profile(['unit-a', 'unit-b']), 'unit-a', 'unit-b', id => id !== 'unit-b', assigned), false);
  assert.equal(canTransferBetweenUnits(profile(['unit-a', 'unit-b']), 'unit-a', 'unit-a', () => true, assigned), false);
});

test('orphaned and active occupants block destination beds; empty and archived occupants are selectable', () => {
  assert.equal(isAvailableLifecycleBed(bed(), []), true);
  assert.equal(isAvailableLifecycleBed(bed('missing-patient'), []), false);
  assert.equal(isAvailableLifecycleBed(bed('active-patient'), [occupant('active-patient', false)]), false);
  assert.equal(isAvailableLifecycleBed(bed('archived-patient'), [occupant('archived-patient', true)]), true);
  assert.equal(isAvailableLifecycleBed({ ...bed(), status: 'Stable' }, []), false);
  assert.equal(isAvailableLifecycleBed({ ...bed('archived-patient'), status: 'Stable' }, [occupant('archived-patient', true)]), false);
});

test('bed availability is re-evaluated at admission time if another admission occupies it', () => {
  const selectedAtDialogOpen = bed();
  assert.equal(isAvailableLifecycleBed(selectedAtDialogOpen, []), true);
  const occupiedBeforeConfirm = { ...selectedAtDialogOpen, patientId: 'new-occupant', status: 'Stable' } as Bed;
  assert.equal(isAvailableLifecycleBed(occupiedBeforeConfirm, [occupant('new-occupant', false)]), false);
});
