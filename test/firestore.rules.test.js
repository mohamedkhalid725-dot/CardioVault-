import test from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import fs from "node:fs";

const PROJECT_ID = "cardiovault-rules-test";
const WORKSPACE = "cardiovault_master_workspace";
const UNIT_A = "unitA";
const UNIT_B = "unitB";
const PATIENT_A = "patientA";
const PATIENT_B = "patientB";

let testEnv;

function path(...parts) {
  return ["workspaces", WORKSPACE, ...parts].join("/");
}

function patientPath(id) {
  return path("patients", id);
}

function dbFor(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, path()), {
        ownerUid: "owner-unused",
        ownerEmail: "owner@example.com",
      }),
      setDoc(doc(db, path("members", "userA")), {
        uid: "userA",
        workspaceId: WORKSPACE,
        active: true,
        forceReauth: false,
        role: "clinical_editor",
        unitId: UNIT_A,
        unitIds: [UNIT_A],
      }),
      setDoc(doc(db, path("team", "userA")), {
        uid: "userA",
        workspaceId: WORKSPACE,
        role: "resident",
        status: "active",
        assignedUnitIds: [UNIT_A],
      }),
      setDoc(doc(db, path("members", "userB")), {
        uid: "userB",
        workspaceId: WORKSPACE,
        active: true,
        forceReauth: false,
        role: "clinical_editor",
        unitId: UNIT_B,
        unitIds: [UNIT_B],
      }),
      setDoc(doc(db, path("team", "userB")), {
        uid: "userB",
        workspaceId: WORKSPACE,
        role: "resident",
        status: "active",
        assignedUnitIds: [UNIT_B],
      }),
      setDoc(doc(db, path("members", "userC")), {
        uid: "userC",
        workspaceId: WORKSPACE,
        active: true,
        forceReauth: false,
        role: "clinical_editor",
        unitIds: [UNIT_A, UNIT_B],
      }),
      setDoc(doc(db, path("team", "userC")), {
        uid: "userC",
        workspaceId: WORKSPACE,
        role: "resident",
        status: "active",
        assignedUnitIds: [UNIT_A, UNIT_B],
      }),
      setDoc(doc(db, path("members", "userD")), {
        uid: "userD",
        workspaceId: WORKSPACE,
        active: false,
        forceReauth: false,
        role: "clinical_editor",
        unitId: UNIT_A,
        unitIds: [UNIT_A],
      }),
      setDoc(doc(db, path("team", "userD")), {
        uid: "userD",
        workspaceId: WORKSPACE,
        role: "resident",
        status: "active",
        assignedUnitIds: [UNIT_A],
      }),
      setDoc(doc(db, path("members", "userE")), {
        uid: "userE",
        workspaceId: WORKSPACE,
        active: true,
        forceReauth: false,
        role: "view_only",
        unitId: UNIT_A,
        unitIds: [UNIT_A],
      }),
      setDoc(doc(db, path("team", "userE")), {
        uid: "userE",
        workspaceId: WORKSPACE,
        role: "resident",
        status: "active",
        assignedUnitIds: [UNIT_A],
      }),
      setDoc(doc(db, patientPath(PATIENT_A)), {
        patientId: PATIENT_A,
        unitId: UNIT_A,
        label: "FAKE A",
      }),
      setDoc(doc(db, patientPath(PATIENT_B)), {
        patientId: PATIENT_B,
        unitId: UNIT_B,
        label: "FAKE B",
      }),
    ]);
  });
}

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed();
});

test.after(async () => {
  await testEnv.cleanup();
});

test("1. A can read/list/create/update/delete patients in Unit A", async () => {
  const db = dbFor("userA");
  const aRef = doc(db, patientPath(PATIENT_A));

  await assertSucceeds(getDoc(aRef));
  await assertSucceeds(
    getDocs(query(collection(db, path("patients")), where("unitId", "==", UNIT_A))),
  );

  const createdRef = doc(db, patientPath("createdByA"));
  await assertSucceeds(
    setDoc(createdRef, { patientId: "createdByA", unitId: UNIT_A, label: "CREATE" }),
  );
  await assertSucceeds(updateDoc(createdRef, { label: "UPDATE" }));
  await assertSucceeds(deleteDoc(createdRef));
  await assertSucceeds(deleteDoc(aRef));
});

test("2. A cannot get/list/update/delete a patient in Unit B", async () => {
  const db = dbFor("userA");
  const bRef = doc(db, patientPath(PATIENT_B));

  await assertFails(getDoc(bRef));
  await assertFails(
    getDocs(query(collection(db, path("patients")), where("unitId", "==", UNIT_B))),
  );
  await assertFails(updateDoc(bRef, { label: "ILLEGAL" }));
  await assertFails(deleteDoc(bRef));
});

test("3. A cannot create a patient with unitId = Unit B", async () => {
  const db = dbFor("userA");
  await assertFails(
    setDoc(doc(db, patientPath("createdInB")), {
      patientId: "createdInB",
      unitId: UNIT_B,
      label: "ILLEGAL",
    }),
  );
});

test("4. A cannot change an existing patient's unitId to Unit B", async () => {
  const db = dbFor("userA");
  await assertFails(updateDoc(doc(db, patientPath(PATIENT_A)), { unitId: UNIT_B }));
});

test("5. B mirrors A", async () => {
  const db = dbFor("userB");
  const bRef = doc(db, patientPath(PATIENT_B));
  const aRef = doc(db, patientPath(PATIENT_A));

  await assertSucceeds(getDoc(bRef));
  await assertSucceeds(
    getDocs(query(collection(db, path("patients")), where("unitId", "==", UNIT_B))),
  );
  const createdRef = doc(db, patientPath("createdByB"));
  await assertSucceeds(
    setDoc(createdRef, { patientId: "createdByB", unitId: UNIT_B, label: "CREATE" }),
  );
  await assertSucceeds(updateDoc(createdRef, { label: "UPDATE" }));
  await assertSucceeds(deleteDoc(createdRef));

  await assertFails(getDoc(aRef));
  await assertFails(updateDoc(aRef, { label: "ILLEGAL" }));
  await assertFails(deleteDoc(aRef));
  await assertFails(
    setDoc(doc(db, patientPath("createdInA")), {
      patientId: "createdInA",
      unitId: UNIT_A,
      label: "ILLEGAL",
    }),
  );
});

test("6. C can read both units", async () => {
  const db = dbFor("userC");
  await assertSucceeds(getDoc(doc(db, patientPath(PATIENT_A))));
  await assertSucceeds(getDoc(doc(db, patientPath(PATIENT_B))));
  await assertSucceeds(
    getDocs(query(collection(db, path("patients")), where("unitId", "==", UNIT_A))),
  );
  await assertSucceeds(
    getDocs(query(collection(db, path("patients")), where("unitId", "==", UNIT_B))),
  );
});

test("7. D and unauthenticated user are denied patient/workspace access", async () => {
  const contexts = [
    dbFor("userD"),
    testEnv.unauthenticatedContext().firestore(),
  ];

  for (const db of contexts) {
    await assertFails(getDoc(doc(db, patientPath(PATIENT_A))));
    await assertFails(getDocs(collection(db, path("patients"))));
    await assertFails(getDoc(doc(db, path())));
    await assertFails(
      setDoc(doc(db, patientPath("blocked")), { patientId: "blocked", unitId: UNIT_A }),
    );
    await assertFails(updateDoc(doc(db, patientPath(PATIENT_A)), { label: "ILLEGAL" }));
    await assertFails(deleteDoc(doc(db, patientPath(PATIENT_A))));
  }
});

test("8. a non-clinical_editor role cannot write", async () => {
  const db = dbFor("userE");

  await assertSucceeds(getDoc(doc(db, patientPath(PATIENT_A))));
  await assertFails(
    setDoc(doc(db, patientPath("createdByViewOnly")), {
      patientId: "createdByViewOnly",
      unitId: UNIT_A,
      label: "ILLEGAL",
    }),
  );
  await assertFails(updateDoc(doc(db, patientPath(PATIENT_A)), { label: "ILLEGAL" }));
  await assertFails(deleteDoc(doc(db, patientPath(PATIENT_A))));
});

test("9. any path not explicitly allowed is denied", async () => {
  const db = dbFor("userA");
  const unknown = doc(db, "workspaces", WORKSPACE, "notAnAllowedCollection", "x");
  const topLevelUnknown = doc(db, "notAnAllowedTopLevelPath", "x");

  await assertFails(getDoc(unknown));
  await assertFails(setDoc(unknown, { any: "value" }));
  await assertFails(getDoc(topLevelUnknown));
  await assertFails(setDoc(topLevelUnknown, { any: "value" }));
});
