import test from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  collectionGroup,
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
      setDoc(doc(db, path("members", "userF")), {
        uid: "userF",
        workspaceId: WORKSPACE,
        active: true,
        forceReauth: false,
        role: "clinical_editor",
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
      setDoc(doc(db, path("units", UNIT_A, "tasks", "taskA")), {
        id: "taskA",
        unitId: UNIT_A,
        title: "Unit A task",
        priority: "routine",
        status: "pending",
        createdBy: "seed",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      setDoc(doc(db, path("units", UNIT_B, "tasks", "taskB")), {
        id: "taskB",
        unitId: UNIT_B,
        title: "Unit B task",
        priority: "routine",
        status: "pending",
        createdBy: "seed",
        createdAt: "2026-01-01T00:00:00.000Z",
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


test("10. A can read/write patient-associated media and chunks in Unit A", async () => {
  const db = dbFor("userA");
  const mediaA = doc(db, path("media", "mediaA"));
  const chunkA = doc(db, path("media", "mediaA", "chunks", "chunkA"));

  await assertSucceeds(
    setDoc(mediaA, { id: "mediaA", unitId: UNIT_A, patientId: PATIENT_A, type: "ecg" }),
  );
  await assertSucceeds(getDoc(mediaA));
  await assertSucceeds(updateDoc(mediaA, { label: "updated" }));

  await assertSucceeds(
    setDoc(chunkA, { id: "chunkA", unitId: UNIT_A, mediaId: "mediaA", payload: "fake" }),
  );
  await assertSucceeds(getDoc(chunkA));
  await assertSucceeds(updateDoc(chunkA, { payload: "fake-updated" }));
  await assertSucceeds(deleteDoc(chunkA));
  await assertSucceeds(deleteDoc(mediaA));
});

test("11. A cannot access Unit B patient-associated media or chunks", async () => {
  const db = dbFor("userA");
  const mediaB = doc(db, path("media", "mediaB"));
  const chunkB = doc(db, path("media", "mediaB", "chunks", "chunkB"));

  await assertFails(getDoc(mediaB));
  await assertFails(getDocs(collection(db, path("media"))));
  await assertFails(updateDoc(mediaB, { label: "ILLEGAL" }));
  await assertFails(deleteDoc(mediaB));

  await assertFails(getDoc(chunkB));
  await assertFails(getDocs(collection(db, path("media", "mediaB", "chunks"))));
  await assertFails(updateDoc(chunkB, { payload: "ILLEGAL" }));
  await assertFails(deleteDoc(chunkB));
});

test("12. D and unauthenticated user are denied patient-associated media and chunks", async () => {
  const contexts = [
    dbFor("userD"),
    testEnv.unauthenticatedContext().firestore(),
  ];

  for (const db of contexts) {
    await assertFails(getDoc(doc(db, path("media", "mediaA"))));
    await assertFails(getDocs(collection(db, path("media"))));
    await assertFails(
      setDoc(doc(db, path("media", "blocked")), {
        id: "blocked",
        unitId: UNIT_A,
        patientId: PATIENT_A,
      }),
    );
    await assertFails(getDoc(doc(db, path("media", "mediaA", "chunks", "chunkA"))));
    await assertFails(getDocs(collection(db, path("media", "mediaA", "chunks"))));
    await assertFails(
      setDoc(doc(db, path("media", "mediaA", "chunks", "blocked")), {
        id: "blocked",
        unitId: UNIT_A,
        mediaId: "mediaA",
      }),
    );
  }
});

test("13. collection-group queries cannot leak media or chunk data across units", async () => {
  const dbA = dbFor("userA");

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const seedDb = context.firestore();
    await setDoc(doc(seedDb, path("media", "mediaB")), {
      id: "mediaB",
      unitId: UNIT_B,
      patientId: PATIENT_B,
      type: "ecg",
    });
    await setDoc(doc(seedDb, path("media", "mediaB", "chunks", "chunkB")), {
      id: "chunkB",
      unitId: UNIT_B,
      mediaId: "mediaB",
      payload: "fake-b",
    });
  });

  await assertFails(getDocs(query(collectionGroup(dbA, "media"))));
  await assertFails(getDocs(query(collectionGroup(dbA, "chunks"))));

  // These collections are not granted collection-group access by the rules.
  // Verify that even Unit-A-constrained collection-group queries remain denied.
  await assertFails(
    getDocs(query(collectionGroup(dbA, "media"), where("unitId", "==", UNIT_A))),
  );
  await assertFails(
    getDocs(query(collectionGroup(dbA, "chunks"), where("unitId", "==", UNIT_A))),
  );
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

test("14. cross-unit patient move needs editor rights on both units", async () => {
  // B is a clinical_editor of Unit B only: pulling A's patient into B must fail.
  await assertFails(
    updateDoc(doc(dbFor("userB"), patientPath(PATIENT_A)), { unitId: UNIT_B, label: "MOVED" }),
  );
  // Same-unit clinical edits still succeed.
  await assertSucceeds(updateDoc(doc(dbFor("userB"), patientPath(PATIENT_B)), { label: "UPDATE" }));
  // C edits both units: a legitimate transfer A -> B succeeds.
  await assertSucceeds(
    updateDoc(doc(dbFor("userC"), patientPath(PATIENT_A)), { unitId: UNIT_B }),
  );
});

test("15. fresh members cannot self-grant the consultant role", async () => {
  const db = dbFor("userF");
  const selfRef = doc(db, path("team", "userF"));
  const profile = {
    uid: "userF",
    workspaceId: WORKSPACE,
    departmentId: "dept-cardiology",
    status: "active",
  };
  await assertFails(setDoc(selfRef, { ...profile, role: "consultant" }));
  await assertSucceeds(setDoc(selfRef, { ...profile, role: "resident" }));
});

test("16. task boards are scoped to the member's unit", async () => {
  const dbA = dbFor("userA");
  const dbB = dbFor("userB");
  const taskA = doc(dbA, path("units", UNIT_A, "tasks", "taskA"));
  const taskB = doc(dbA, path("units", UNIT_B, "tasks", "taskB"));

  await assertSucceeds(getDoc(taskA));
  await assertSucceeds(
    getDocs(collection(dbA, path("units", UNIT_A, "tasks"))),
  );
  await assertSucceeds(
    setDoc(doc(dbA, path("units", UNIT_A, "tasks", "createdByA")), {
      id: "createdByA",
      unitId: UNIT_A,
      title: "Unit A task",
      priority: "routine",
      status: "pending",
      createdBy: "userA",
      createdAt: "2026-01-02T00:00:00.000Z",
    }),
  );

  await assertFails(getDoc(taskB));
  await assertFails(getDocs(collection(dbA, path("units", UNIT_B, "tasks"))));
  await assertFails(
    setDoc(doc(dbA, path("units", UNIT_B, "tasks", "illegalByA")), {
      id: "illegalByA",
      unitId: UNIT_B,
      title: "ILLEGAL",
      priority: "routine",
      status: "pending",
      createdBy: "userA",
      createdAt: "2026-01-02T00:00:00.000Z",
    }),
  );
  await assertFails(updateDoc(taskB, { status: "completed" }));

  // B keeps full access to its own unit board.
  await assertSucceeds(getDoc(doc(dbB, path("units", UNIT_B, "tasks", "taskB"))));

  // The retired top-level /tasks collection has no rule: denied for everyone.
  await assertFails(getDoc(doc(dbA, path("tasks", "legacy"))));
  await assertFails(
    setDoc(doc(dbA, path("tasks", "legacy")), { id: "legacy", unitId: UNIT_A, title: "x" }),
  );
});
