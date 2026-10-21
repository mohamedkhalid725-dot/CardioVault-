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

// Second customer workspace used only to prove workspace-to-workspace isolation.
// It has its own owner, its own unit, its own patient and its own access code.
const WS_B = "ws_team_bravo_2026";
const UNIT_X = "unitX";
const PATIENT_X = "patientX";
const HASH_MASTER = "hash-master-unit-a";
const HASH_TEAM_B = "hash-team-b-unit-x";

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

// Workspace bootstrap requires the owner email to match the signed-in token.
function dbForWithEmail(uid, email) {
  return testEnv
    .authenticatedContext(uid, { email, email_verified: true })
    .firestore();
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
      // ---- second customer team, fully separate workspace ----
      setDoc(doc(db, "workspaces", WS_B), {
        ownerUid: "ownerB",
        ownerEmail: "ownerb@example.com",
        name: "Team Bravo",
      }),
      setDoc(doc(db, "workspaces", WS_B, "members", "userG"), {
        uid: "userG",
        workspaceId: WS_B,
        active: true,
        forceReauth: false,
        role: "clinical_editor",
        unitId: UNIT_X,
        unitIds: [UNIT_X],
      }),
      setDoc(doc(db, "workspaces", WS_B, "team", "userG"), {
        uid: "userG",
        workspaceId: WS_B,
        role: "resident",
        status: "active",
        assignedUnitIds: [UNIT_X],
      }),
      setDoc(doc(db, "workspaces", WS_B, "patients", PATIENT_X), {
        patientId: PATIENT_X,
        unitId: UNIT_X,
        label: "FAKE X",
      }),
      setDoc(doc(db, "accessCodes", HASH_TEAM_B), {
        workspaceId: WS_B,
        unitId: UNIT_X,
        unitName: "Team B ICU",
        role: "clinical_editor",
        active: true,
      }),
      setDoc(doc(db, "accessCodes", HASH_MASTER), {
        workspaceId: WORKSPACE,
        unitId: UNIT_A,
        unitName: "Unit A",
        role: "clinical_editor",
        active: true,
      }),
      // The single platform owner. Written from the console only, never by a client.
      setDoc(doc(db, "platformOwners", "admin_root"), {
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      // A member whose team profile already says 'consultant'. Before 2026-10-21
      // that alone was enough to rewrite other memberships.
      setDoc(doc(db, path("members", "consultantX")), {
        uid: "consultantX",
        workspaceId: WORKSPACE,
        active: true,
        forceReauth: false,
        role: "clinical_editor",
        unitId: UNIT_A,
        unitIds: [UNIT_A],
      }),
      setDoc(doc(db, path("team", "consultantX")), {
        uid: "consultantX",
        workspaceId: WORKSPACE,
        role: "consultant",
        status: "active",
        assignedUnitIds: [UNIT_A],
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

// ---------------------------------------------------------------------------
// Workspace-to-workspace isolation (Lane B). Before the 2026-10-21 refactor the
// rules hard-coded one workspace id, so a second customer team either could not
// exist or, once hard-coding was partially relaxed, could read the first team's
// records. These tests treat two workspaces as two different hospitals.
// ---------------------------------------------------------------------------

test("17. team A cannot read, list or write anything inside team B's workspace", async () => {
  const db = dbFor("userA");

  await assertFails(getDoc(doc(db, "workspaces", WS_B)));
  await assertFails(getDoc(doc(db, "workspaces", WS_B, "patients", PATIENT_X)));
  await assertFails(getDocs(collection(db, "workspaces", WS_B, "patients")));
  await assertFails(getDoc(doc(db, "workspaces", WS_B, "members", "userG")));
  await assertFails(getDoc(doc(db, "workspaces", WS_B, "team", "userG")));

  await assertFails(
    updateDoc(doc(db, "workspaces", WS_B, "patients", PATIENT_X), { label: "ILLEGAL" }),
  );
  await assertFails(deleteDoc(doc(db, "workspaces", WS_B, "patients", PATIENT_X)));
  await assertFails(
    setDoc(doc(db, "workspaces", WS_B, "patients", "injected"), {
      patientId: "injected",
      unitId: UNIT_X,
      label: "ILLEGAL",
    }),
  );
});

test("18. isolation is symmetric: team B cannot reach the legacy master workspace", async () => {
  const db = dbFor("userG");

  await assertFails(getDoc(doc(db, path())));
  await assertFails(getDoc(doc(db, patientPath(PATIENT_A))));
  await assertFails(getDocs(collection(db, path("patients"))));
  await assertFails(updateDoc(doc(db, patientPath(PATIENT_A)), { label: "ILLEGAL" }));
  await assertFails(deleteDoc(doc(db, patientPath(PATIENT_B))));
});

test("19. a customer can create a workspace but can never own one", async () => {
  const creator = dbForWithEmail("ownerNew", "newowner@example.com");

  // Self-service bootstrap: the creator is recorded for the audit trail only.
  await assertSucceeds(
    setDoc(doc(creator, "workspaces", "ws_newteam_2026"), {
      createdBy: "ownerNew",
      name: "New Team",
    }),
  );

  // Claiming ownership of a workspace is refused, even for one's own new team.
  await assertFails(
    setDoc(doc(creator, "workspaces", "ws_otherteam_2026"), {
      ownerUid: "ownerNew",
      name: "Mine",
    }),
  );

  // Creating a workspace on behalf of somebody else is refused.
  await assertFails(
    setDoc(doc(creator, "workspaces", "ws_thirdteam_2026"), {
      createdBy: "someoneElse",
      name: "Not mine",
    }),
  );

  // Cannot take over a workspace that already exists.
  const intruder = dbForWithEmail("userG", "g@example.com");
  await assertFails(
    setDoc(doc(intruder, "workspaces", WORKSPACE), {
      createdBy: "userG",
    }),
  );

  // New customer workspaces must use the reserved prefix.
  await assertFails(
    setDoc(doc(creator, "workspaces", "hospital-hidden"), {
      createdBy: "ownerNew",
    }),
  );

  // A workspace creator has no rights inside the workspace they created:
  // access comes from unit membership, never from creation.
  await assertFails(getDoc(doc(creator, "workspaces", "ws_newteam_2026", "patients", "p1")));
  await assertFails(
    setDoc(doc(creator, "workspaces", "ws_newteam_2026", "units", "unitY"), {
      unitId: "unitY",
    }),
  );
});

test("20. an access code opens exactly its own workspace and nothing else", async () => {
  const joiner = dbFor("userH");
  const membership = {
    uid: "userH",
    workspaceId: WS_B,
    accessCodeHash: HASH_TEAM_B,
    unitId: UNIT_X,
    unitIds: [UNIT_X],
    role: "clinical_editor",
    active: true,
    forceReauth: false,
  };

  await assertSucceeds(
    setDoc(doc(joiner, "workspaces", WS_B, "members", "userH"), membership),
  );
  await assertSucceeds(
    setDoc(doc(joiner, "workspaces", WS_B, "team", "userH"), {
      uid: "userH",
      workspaceId: WS_B,
      departmentId: "dept-cardiology",
      status: "active",
      role: "resident",
      assignedUnitIds: [UNIT_X],
    }),
  );
  await assertSucceeds(getDoc(doc(joiner, "workspaces", WS_B, "patients", PATIENT_X)));

  // Joining team B must not open the master workspace.
  await assertFails(getDoc(doc(joiner, patientPath(PATIENT_A))));

  // The same code replayed against the master workspace must be rejected.
  const replay = dbFor("userI");
  await assertFails(
    setDoc(doc(replay, "workspaces", WORKSPACE, "members", "userI"), {
      ...membership,
      uid: "userI",
      workspaceId: WORKSPACE,
      unitId: UNIT_A,
      unitIds: [UNIT_A],
    }),
  );
});

test("21. only the platform owner provisions units and access codes", async () => {
  const teamLead = dbFor("ownerB");

  // The account that created a workspace has no administrative rights in it.
  await assertFails(
    setDoc(doc(teamLead, "workspaces", WS_B, "units", "unitY"), {
      unitId: "unitY",
      name: "Ward Y",
    }),
  );
  await assertFails(
    setDoc(doc(teamLead, "accessCodes", "hash-team-b-ward-y"), {
      workspaceId: WS_B,
      unitId: "unitY",
      unitName: "Ward Y",
      role: "clinical_editor",
      active: true,
    }),
  );
  await assertFails(
    deleteDoc(doc(teamLead, "workspaces", WS_B, "members", "userG")),
  );

  // The platform owner can provision any workspace...
  const owner = dbFor("admin_root");
  await assertSucceeds(
    setDoc(doc(owner, "workspaces", WS_B, "units", "unitY"), {
      unitId: "unitY",
      name: "Ward Y",
    }),
  );
  await assertSucceeds(
    setDoc(doc(owner, "accessCodes", "hash-team-b-ward-y"), {
      workspaceId: WS_B,
      unitId: "unitY",
      unitName: "Ward Y",
      role: "clinical_editor",
      active: true,
    }),
  );
  await assertSucceeds(
    setDoc(doc(owner, "workspaces", WS_B, "accessCodes", "hash-team-b-ward-y"), {
      workspaceId: WS_B,
      unitId: "unitY",
      code: "CV-TEST-CODE",
      active: true,
    }),
  );
  await assertSucceeds(
    setDoc(doc(owner, "workspaces", WORKSPACE, "units", "unitZ"), { unitId: "unitZ" }),
  );
});

test("22. the platform owner keeps full access to the legacy master workspace", async () => {
  const db = dbFor("admin_root");

  await assertSucceeds(getDoc(doc(db, path())));
  await assertSucceeds(getDoc(doc(db, patientPath(PATIENT_A))));
  await assertSucceeds(getDoc(doc(db, path("members", "userD"))));
  await assertSucceeds(updateDoc(doc(db, patientPath(PATIENT_B)), { label: "OWNER-EDIT" }));
});

test("23. a member cannot promote themselves to consultant", async () => {
  const db = dbFor("userF");
  const selfRef = doc(db, path("team", "userF"));

  await assertSucceeds(
    setDoc(selfRef, {
      uid: "userF",
      workspaceId: WORKSPACE,
      departmentId: "dept-cardiology",
      status: "active",
      role: "resident",
    }),
  );
  await assertFails(updateDoc(selfRef, { role: "consultant" }));
  await assertSucceeds(updateDoc(selfRef, { role: "specialist" }));
});

test("24. a consultant profile cannot manage other memberships", async () => {
  const db = dbFor("consultantX");
  const other = doc(db, path("members", "userA"));

  await assertFails(updateDoc(other, { unitIds: [UNIT_A, UNIT_B] }));
  await assertFails(updateDoc(other, { role: "view_only" }));
  await assertFails(updateDoc(other, { active: false }));
  await assertFails(deleteDoc(other));

  // Nor can they grant themselves a second unit.
  await assertFails(
    updateDoc(doc(db, path("members", "consultantX")), { unitIds: [UNIT_A, UNIT_B] }),
  );
});
