import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignUnitHospitalDocument,
  createHospitalDocument,
  loadHospitalsForUnits,
  type HospitalDocument,
  type HospitalPersistenceIO,
  type HospitalWrite,
} from '../src/services/hospitalPersistence.ts';
import type { Unit } from '../src/types/clinical.ts';

const makeIO = (options: { dropWrites?: boolean } = {}) => {
  const hospitals = new Map<string, HospitalDocument>();
  const units = new Map<string, Unit>();
  let commits = 0;
  const key = (workspaceId: string, id: string) => `${workspaceId}/${id}`;
  const io: HospitalPersistenceIO = {
    async getHospital(workspaceId, hospitalId) {
      return hospitals.get(key(workspaceId, hospitalId)) || null;
    },
    async listHospitals(workspaceId) {
      return Array.from(hospitals.entries())
        .filter(([path]) => path.startsWith(`${workspaceId}/`))
        .map(([, hospital]) => hospital);
    },
    async getUnit(workspaceId, unitId) {
      return units.get(key(workspaceId, unitId)) || null;
    },
    async commit(workspaceId, writes: HospitalWrite[]) {
      commits += 1;
      if (options.dropWrites) return;
      const nextHospitals = new Map(hospitals);
      const nextUnits = new Map(units);
      for (const write of writes) {
        const target = write.collection === 'hospitals' ? nextHospitals : nextUnits;
        const path = key(workspaceId, write.id);
        const current = target.get(path) as unknown as Record<string, unknown> | undefined;
        target.set(path, (write.merge === false ? write.data : { ...(current || {}), ...write.data }) as any);
      }
      hospitals.clear();
      units.clear();
      for (const [path, value] of nextHospitals) hospitals.set(path, value);
      for (const [path, value] of nextUnits) units.set(path, value as Unit);
    },
  };
  return { io, hospitals, units, get commits() { return commits; } };
};

test('hospital creation retries use the same stable document and do not duplicate it', async () => {
  const store = makeIO();
  const first = await createHospitalDocument(store.io, 'ws_test', 'owner-1', 'City Hospital', 'hospital-stable', 100);
  const retry = await createHospitalDocument(store.io, 'ws_test', 'owner-1', 'City Hospital', 'hospital-stable', 200);

  assert.equal(first.id, retry.id);
  assert.equal(first.createdAtMs, 100);
  assert.equal(store.hospitals.size, 1);
  assert.equal(store.commits, 1);
});

test('creation is not reported successful when Firestore does not return the written document', async () => {
  const store = makeIO({ dropWrites: true });
  await assert.rejects(
    () => createHospitalDocument(store.io, 'ws_test', 'owner-1', 'City Hospital', 'hospital-missing', 100),
    /not confirmed in Firestore/,
  );
});

test('unit reassignment updates both hospital unit lists without duplicate IDs', async () => {
  const store = makeIO();
  const first = await createHospitalDocument(store.io, 'ws_test', 'owner-1', 'North Hospital', 'hospital-north', 100);
  const second = await createHospitalDocument(store.io, 'ws_test', 'owner-1', 'South Hospital', 'hospital-south', 100);
  store.units.set('ws_test/unit-1', { id: 'unit-1', name: 'CCU', type: 'ICU', totalBeds: 4 });

  await assignUnitHospitalDocument(store.io, 'ws_test', 'unit-1', first.id, 200);
  await assignUnitHospitalDocument(store.io, 'ws_test', 'unit-1', first.id, 300);
  await assignUnitHospitalDocument(store.io, 'ws_test', 'unit-1', second.id, 400);

  assert.deepEqual((await store.io.getHospital('ws_test', first.id))?.unitIds, []);
  assert.deepEqual((await store.io.getHospital('ws_test', second.id))?.unitIds, ['unit-1']);
  assert.equal((await store.io.getUnit('ws_test', 'unit-1'))?.hospitalId, second.id);

  await assignUnitHospitalDocument(store.io, 'ws_test', 'unit-1', null, 500);
  assert.deepEqual((await store.io.getHospital('ws_test', second.id))?.unitIds, []);
  assert.equal((await store.io.getUnit('ws_test', 'unit-1'))?.hospitalId, null);
});

test('members load only hospital metadata linked to their authorized units', async () => {
  const store = makeIO();
  const first = await createHospitalDocument(store.io, 'ws_test', 'owner-1', 'North Hospital', 'hospital-north', 100);
  const second = await createHospitalDocument(store.io, 'ws_test', 'owner-1', 'South Hospital', 'hospital-south', 100);
  store.units.set('ws_test/unit-1', { id: 'unit-1', name: 'CCU', type: 'ICU', totalBeds: 4, hospitalId: first.id });
  store.units.set('ws_test/unit-2', { id: 'unit-2', name: 'Ward', type: 'Ward', totalBeds: 8, hospitalId: second.id });
  await assignUnitHospitalDocument(store.io, 'ws_test', 'unit-1', first.id, 200);
  await assignUnitHospitalDocument(store.io, 'ws_test', 'unit-2', second.id, 200);

  const memberHospitals = await loadHospitalsForUnits(store.io, 'ws_test', [store.units.get('ws_test/unit-1')!], false);
  const ownerHospitals = await loadHospitalsForUnits(store.io, 'ws_test', [], true);

  assert.deepEqual(memberHospitals.map((hospital) => hospital.id), [first.id]);
  assert.equal(ownerHospitals.length, 2);
});
