// DIAGNOSTIC (temporary): the whole "create a unit with N beds" flow against
// the real firestore.rules, using the REAL app modules for the merge and the
// reconciliation. Proves the bed count survives.
import test from "node:test";
import assert from "node:assert/strict";
import { assertSucceeds, assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, setDoc, updateDoc } from "firebase/firestore";
import fs from "node:fs";
import { mergeClinicalCollections } from "../src/services/clinicalMerge.ts";
import { reconcileClinicalRegistry } from "../src/services/bedReconciliation.ts";

const WORKSPACE = "cardiovault_master_workspace";
const UNIT_A = "unitA";
let testEnv;
const path = (...parts) => ["workspaces", WORKSPACE, ...parts].join("/");
const unitPath = (id) => path("units", id);
const dbFor = (uid) => testEnv.authenticatedContext(uid).firestore();

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, path()), { ownerUid: "owner-unused", ownerEmail: "owner@example.com" }),
      setDoc(doc(db, path("members", "userA")), {
        uid: "userA", workspaceId: WORKSPACE, active: true, forceReauth: false,
        role: "clinical_editor", unitId: UNIT_A, unitIds: [UNIT_A],
      }),
      setDoc(doc(db, path("team", "userA")), {
        uid: "userA", workspaceId: WORKSPACE, role: "resident",
        status: "active", assignedUnitIds: [UNIT_A],
      }),
      setDoc(doc(db, "platformOwners", "admin_root"), { createdAt: "2026-01-01T00:00:00.000Z" }),
      setDoc(doc(db, unitPath(UNIT_A)), {
        unitId: UNIT_A, name: "Unit A", type: "cardiology", notes: "",
        createdBy: "userA", consultantUid: "", totalBeds: 10,
        capacityLocked: false, features: [], createdAtMs: Date.now() - 60000,
      }),
    ]);
  });
}

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "cardiovault-rules-test",
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
test.beforeEach(async () => { await testEnv.clearFirestore(); await seed(); });
test.after(async () => { await testEnv.cleanup(); });

test("the fixed creation flow keeps the bed count", async () => {
  const a = dbFor("userA");
  const unitId = "unitNew";
  const bedCount = 6;
  const now = Date.now();

  // ---- step 1: the app creates the unit locally and the sync uploads it ----
  await assertSucceeds(setDoc(doc(a, unitPath(unitId)), {
    id: unitId, name: "New Unit", type: "Intensive Care", totalBeds: bedCount,
    createdBy: "userA", consultantUid: "userA", createdAtMs: now,
    capacityLocked: false, updatedAt: new Date().toISOString(), schemaVersion: 12,
  }, { merge: true }));

  // ---- step 2: the sync uploads the bed documents ----
  for (let i = 1; i <= bedCount; i += 1) {
    await assertSucceeds(setDoc(doc(a, path("beds", `bed-${unitId}-${i}`)), {
      id: `bed-${unitId}-${i}`, unitId, bedNumber: `Bed ${i}`, status: "Empty",
      updatedAt: new Date().toISOString(), schemaVersion: 12,
    }, { merge: true }));
  }

  // ---- step 3: the creator registers the unit on his own membership ----
  await assertSucceeds(updateDoc(doc(a, path("members", "userA")), {
    unitId, unitIds: [UNIT_A, unitId], updatedAt: new Date().toISOString(),
  }));

  // ---- step 4: only now the capacity window is closed ----
  await assertSucceeds(updateDoc(doc(a, unitPath(unitId)), {
    capacityLocked: true, updatedAt: new Date().toISOString(),
  }));

  // ---- the restore: read the cloud back and reconcile it ----
  const owner = dbFor("admin_root");
  const unitSnap = await getDoc(doc(owner, unitPath(unitId)));
  const bedSnap = await getDocs(collection(owner, path("beds")));
  const cloud = {
    units: [{ ...unitSnap.data(), id: unitSnap.id }],
    beds: bedSnap.docs.map((d) => ({ ...d.data(), id: d.id })),
    patients: [],
  };
  const reconciled = reconcileClinicalRegistry(cloud.units, cloud.beds, cloud.patients);
  console.log("\n--- after the fixed flow ---");
  console.log("beds in the cloud          :", cloud.beds.length);
  console.log("declared totalBeds         :", cloud.units[0].totalBeds);
  console.log("totalBeds after reconcile  :", reconciled.units[0].totalBeds);
  assert.equal(cloud.beds.length, bedCount);
  assert.equal(reconciled.units[0].totalBeds, bedCount);
});

test("a restore that lands before the beds are uploaded does not wipe them", async () => {
  // The cloud has the unit but not yet its beds: the window that used to
  // destroy the bed count.
  const cloud = {
    units: [{ id: "unitNew", name: "New Unit", type: "Intensive Care", totalBeds: 6, createdBy: "userA", consultantUid: "userA", createdAtMs: Date.now(), capacityLocked: false }],
    beds: [],
    patients: [],
  };
  const local = {
    units: [{ id: "unitNew", name: "New Unit", type: "Intensive Care", totalBeds: 6, createdBy: "userA", consultantUid: "userA", createdAtMs: Date.now(), capacityLocked: false }],
    beds: Array.from({ length: 6 }, (_, i) => ({ id: `bed-unitNew-${i + 1}`, unitId: "unitNew", bedNumber: `Bed ${i + 1}`, status: "Empty" })),
    patients: [],
  };

  // The old behaviour: the cloud snapshot replaced the local state.
  const oldWay = { units: cloud.units, beds: cloud.beds, patients: cloud.patients };
  const oldReconciled = reconcileClinicalRegistry(oldWay.units, oldWay.beds, oldWay.patients);
  const oldVisible = oldReconciled.beds.filter((b) => b.unitId === "unitNew").length;
  console.log("\n--- the old restore (replace) ---");
  console.log("beds kept                  :", oldReconciled.beds.length);
  console.log("beds the doctor sees       :", oldVisible);
  console.log("totalBeds after reconcile  :", oldReconciled.units[0].totalBeds);

  // The new behaviour: the restore merges while changes are pending.
  const merged = mergeClinicalCollections(cloud, local, { keepLocalOnly: true });
  const newReconciled = reconcileClinicalRegistry(merged.units, merged.beds, merged.patients);
  const newVisible = newReconciled.beds.filter((b) => b.unitId === "unitNew").length;
  console.log("\n--- the new restore (merge) ---");
  console.log("beds kept                  :", newReconciled.beds.length);
  console.log("beds the doctor sees       :", newVisible);
  console.log("totalBeds after reconcile  :", newReconciled.units[0].totalBeds);

  assert.equal(oldReconciled.beds.length, 0, "the old path really did lose the beds");
  assert.equal(oldVisible, 0, "the old path showed the unit with zero beds");
  assert.equal(newReconciled.beds.length, 6, "the new path keeps the beds");
  assert.equal(newVisible, 6, "the new path shows the unit with its six beds");
  assert.equal(newReconciled.units[0].totalBeds, 6, "the new path keeps the declared bed count");
});
