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
import crypto from "node:crypto";
import assert from "node:assert/strict";

const PROJECT_ID = "cardiovault-rules-test";
const WORKSPACE = "cardiovault_master_workspace";
const UNIT_A = "unitA";
const UNIT_B = "unitB";
const PATIENT_A = "patientA";
const PATIENT_B = "patientB";

// Temporary-invite fixtures. The rules never hash anything: the client hashes
// the typed code and looks the document up by that id, so the tests do the same.
const INVITE_A = "seed-invite-unit-a";
const INDEX_A = "seed-index-unit-a";
const CODE_INVITE_A = "CV-SEED-INVITE-A";

// Second customer workspace used only to prove workspace-to-workspace isolation.
// It has its own owner, its own unit, its own patient and its own access code.
const WS_B = "ws_team_bravo_2026";
// Self-created customer workspaces used only by the trial-bootstrap test.
const WS_TRIAL_OK = "ws_trial_ok_2026";
const WS_TRIAL_SHAPE = "ws_trial_shape_2026";
const WS_TRIAL_LONG = "ws_trial_long_2026";
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

// The clients never send a raw code to Firestore: they send the SHA-256 of the
// trimmed upper-case code as the document id. The rules only ever look up ids.
function hashOf(code) {
  return crypto.createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

function invitePath(inviteId) {
  return path("invites", inviteId);
}

function unitPath(unitId) {
  return path("units", unitId);
}

function subPath() {
  return path("subscription", "current");
}

// A live, unused invite for UNIT_A issued by userA, the shape the new invite
// screen writes. Tests that need past timestamps or revocation build their own
// documents with the admin context.
function inviteDoc(overrides = {}) {
  const now = Date.now();
  return {
    workspaceId: WORKSPACE,
    unitId: UNIT_A,
    unitName: "Unit A",
    role: "clinical_editor",
    clinicalRole: "resident",
    createdBy: "userA",
    used: false,
    revoked: false,
    createdAtMs: now,
    expiresAtMs: now + 3600000,
    ...overrides,
  };
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
      // Three self-created customer workspaces for the trial-bootstrap rule.
      setDoc(doc(db, "workspaces", WS_TRIAL_OK), { createdBy: "userM", name: "Trial OK" }),
      setDoc(doc(db, "workspaces", WS_TRIAL_SHAPE), { createdBy: "userN", name: "Trial Shape" }),
      setDoc(doc(db, "workspaces", WS_TRIAL_LONG), { createdBy: "userO", name: "Trial Long" }),
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
      // ---- units: UNIT_A has an empty consultant slot, UNIT_B has its own ----
      setDoc(doc(db, unitPath(UNIT_A)), {
        unitId: UNIT_A,
        name: "Unit A",
        type: "cardiology",
        notes: "",
        createdBy: "userA",
        consultantUid: "",
        totalBeds: 10,
        capacityLocked: false,
        features: [],
        createdAtMs: Date.now() - 60000,
      }),
      setDoc(doc(db, unitPath(UNIT_B)), {
        unitId: UNIT_B,
        name: "Unit B",
        type: "cardiology",
        notes: "",
        createdBy: "userB",
        consultantUid: "userB",
        totalBeds: 8,
        capacityLocked: false,
        features: [],
        createdAtMs: Date.now() - 60000,
      }),
      // ---- temporary invite plus its routing index ----
      setDoc(doc(db, invitePath(INVITE_A)), inviteDoc()),
      setDoc(doc(db, "invites", INDEX_A), {
        workspaceId: WORKSPACE,
        unitId: UNIT_A,
        unitName: "Unit A",
        createdBy: "userA",
        expiresAtMs: Date.now() + 3600000,
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

// ---------------------------------------------------------------------------
// Temporary invites, the single consultant slot, the provisioning window, the
// subscription clock and the audit trail (Lane B). Everything below exercises a
// contract that did not exist before the 2026-10-21 rewrite.
// ---------------------------------------------------------------------------

test("25. only a member of the target unit can issue an invite", async () => {
  const hash = (code) => hashOf(code);

  // userA is an active member of UNIT_A.
  await assertSucceeds(
    setDoc(doc(dbFor("userA"), invitePath(hash("CV-INVITE-A1"))), inviteDoc()),
  );
  // userC belongs to both units, so UNIT_A is fine for them too.
  await assertSucceeds(
    setDoc(
      doc(dbFor("userC"), invitePath(hash("CV-INVITE-A2"))),
      inviteDoc({ createdBy: "userC" }),
    ),
  );
  // userB is a member of UNIT_B, not of UNIT_A.
  await assertFails(
    setDoc(
      doc(dbFor("userB"), invitePath(hash("CV-INVITE-A3"))),
      inviteDoc({ createdBy: "userB" }),
    ),
  );
  // userF is a workspace member with no unit assignment at all.
  await assertFails(
    setDoc(
      doc(dbFor("userF"), invitePath(hash("CV-INVITE-A4"))),
      inviteDoc({ createdBy: "userF" }),
    ),
  );
  // userG belongs to a different workspace entirely.
  await assertFails(
    setDoc(
      doc(dbFor("userG"), invitePath(hash("CV-INVITE-A5"))),
      inviteDoc({ createdBy: "userG" }),
    ),
  );
  // Belonging to UNIT_A does not let you invite into UNIT_B.
  await assertFails(
    setDoc(
      doc(dbFor("userA"), invitePath(hash("CV-INVITE-B1"))),
      inviteDoc({ unitId: UNIT_B, unitName: "Unit B" }),
    ),
  );
  // Nor can a member mint an invite that claims to be issued by somebody else.
  await assertFails(
    setDoc(
      doc(dbFor("userA"), invitePath(hash("CV-INVITE-FORGED"))),
      inviteDoc({ createdBy: "userB" }),
    ),
  );
});

test("26. an invite is burned exactly once and enrolls only the burner", async () => {
  const issuersDb = dbFor("userA");
  const inviteId = hashOf("CV-SINGLE-USE");
  await assertSucceeds(
    setDoc(doc(issuersDb, invitePath(inviteId)), inviteDoc()),
  );

  const g = dbFor("userG");
  await assertSucceeds(
    updateDoc(doc(g, invitePath(inviteId)), {
      used: true,
      usedBy: "userG",
      usedAt: Date.now(),
    }),
  );

  // A burned code cannot be burned again, by anybody.
  await assertFails(
    updateDoc(doc(dbFor("userE"), invitePath(inviteId)), {
      used: true,
      usedBy: "userE",
      usedAt: Date.now(),
    }),
  );
  await assertFails(
    updateDoc(doc(g, invitePath(inviteId)), {
      used: true,
      usedBy: "userG",
      usedAt: Date.now(),
    }),
  );

  const membership = (uid) => ({
    uid,
    workspaceId: WORKSPACE,
    active: true,
    forceReauth: false,
    role: "clinical_editor",
    unitId: UNIT_A,
    unitIds: [UNIT_A],
    inviteId,
    inviteIds: [inviteId],
  });

  // Somebody else holding the same id cannot enrol with it.
  await assertFails(
    setDoc(doc(dbFor("userK"), path("members", "userK")), membership("userK")),
  );
  // The burner can, and gets exactly the one unit the invite granted.
  await assertSucceeds(
    setDoc(doc(g, path("members", "userG")), membership("userG")),
  );
  await assertSucceeds(getDoc(doc(g, path("members", "userG"))));
});

test("27. expired and revoked invites cannot be burned or redeemed", async () => {
  const past = Date.now() - 60000;
  const future = Date.now() + 3600000;

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(
        doc(db, invitePath("invite-expired")),
        inviteDoc({ createdAtMs: past - 3600000, expiresAtMs: past }),
      ),
      setDoc(
        doc(db, invitePath("invite-revoked")),
        inviteDoc({ revoked: true, revokedAt: past, expiresAtMs: future }),
      ),
      // Burned first, then withdrawn: the redemption must die with the revoke.
      setDoc(
        doc(db, invitePath("invite-burned-then-revoked")),
        inviteDoc({ used: true, usedBy: "userG", usedAt: past, revoked: true, revokedAt: past }),
      ),
    ]);
  });

  const g = dbFor("userG");
  await assertFails(
    updateDoc(doc(g, invitePath("invite-expired")), {
      used: true,
      usedBy: "userG",
      usedAt: Date.now(),
    }),
  );
  await assertFails(
    updateDoc(doc(g, invitePath("invite-revoked")), {
      used: true,
      usedBy: "userG",
      usedAt: Date.now(),
    }),
  );

  const membership = (inviteId) => ({
    uid: "userG",
    workspaceId: WORKSPACE,
    active: true,
    forceReauth: false,
    role: "clinical_editor",
    unitId: UNIT_A,
    unitIds: [UNIT_A],
    inviteId,
    inviteIds: [inviteId],
  });

  await assertFails(
    setDoc(doc(g, path("members", "userG")), membership("invite-expired")),
  );
  await assertFails(
    setDoc(doc(g, path("members", "userG")), membership("invite-burned-then-revoked")),
  );
});

test("28. a consultant invite needs the unit's consultant slot to be free", async () => {
  const now = Date.now();
  const consultantInvite = (unitId, createdBy) =>
    inviteDoc({
      unitId,
      unitName: unitId,
      createdBy,
      clinicalRole: "consultant",
      expiresAtMs: now + 3600000,
    });

  // UNIT_B already has userB in its consultant slot.
  await assertFails(
    setDoc(
      doc(dbFor("userB"), invitePath(hashOf("CV-CONSULT-B"))),
      consultantInvite(UNIT_B, "userB"),
    ),
  );

  // UNIT_A's slot is empty, so the same invite is allowed there.
  await assertSucceeds(
    setDoc(
      doc(dbFor("userA"), invitePath(hashOf("CV-CONSULT-A"))),
      consultantInvite(UNIT_A, "userA"),
    ),
  );

  // Once the slot is claimed the very next consultant invite is refused.
  await assertSucceeds(
    updateDoc(doc(dbFor("userA"), unitPath(UNIT_A)), {
      consultantUid: "userA",
      updatedAt: now,
    }),
  );
  await assertFails(
    setDoc(
      doc(dbFor("userC"), invitePath(hashOf("CV-CONSULT-A2"))),
      consultantInvite(UNIT_A, "userC"),
    ),
  );
});

test("29. a burned invite can add a unit, but unit access is never removed by the member", async () => {
  const now = Date.now();
  const inviteId = hashOf("CV-JOIN-B");

  // userB issues an invite into UNIT_B...
  await assertSucceeds(
    setDoc(
      doc(dbFor("userB"), invitePath(inviteId)),
      inviteDoc({
        unitId: UNIT_B,
        unitName: "Unit B",
        createdBy: "userB",
        expiresAtMs: now + 3600000,
      }),
    ),
  );
  // ...and userA, already a member of UNIT_A, burns it.
  const a = dbFor("userA");
  await assertSucceeds(
    updateDoc(doc(a, invitePath(inviteId)), {
      used: true,
      usedBy: "userA",
      usedAt: now,
    }),
  );

  const join = (unitIds) => ({
    uid: "userA",
    workspaceId: WORKSPACE,
    active: true,
    forceReauth: false,
    role: "clinical_editor",
    unitId: UNIT_B,
    unitIds,
    inviteId,
    inviteIds: [inviteId],
    updatedAt: now,
  });

  // Joining by dropping UNIT_A is a silent revoke of an existing unit.
  await assertFails(updateDoc(doc(a, path("members", "userA")), join([UNIT_B])));

  // The additive join is allowed and really opens UNIT_B.
  //
  // KNOWN BLOCKER (reported, not worked around): the self-service update branch
  // of workspaces/{ws}/members/{uid} proves redemption through the singular
  // `inviteId` field, but firestore.rules:188 whitelists only `inviteIds`, so any
  // request that carries the proof also changes a field the rule forbids. An
  // additive invite join is therefore impossible today; the client refuses it
  // explicitly in src/services/unitInvites.ts:342-368. Adding 'inviteId' to that
  // hasOnly() list makes this assertion pass (verified against a patched rules
  // copy). The assertion is left as the contract requires.
  await assertSucceeds(
    updateDoc(doc(a, path("members", "userA")), join([UNIT_A, UNIT_B])),
  );
  await assertSucceeds(getDoc(doc(a, patientPath(PATIENT_B))));
});

test("30. a unit's consultant slot can be claimed once, by a member of that unit", async () => {
  const now = Date.now();

  // userA is a member of UNIT_A and the slot is empty.
  await assertSucceeds(
    updateDoc(doc(dbFor("userA"), unitPath(UNIT_A)), {
      consultantUid: "userA",
      updatedAt: now,
    }),
  );

  // userC also belongs to UNIT_A, but the slot is taken.
  await assertFails(
    updateDoc(doc(dbFor("userC"), unitPath(UNIT_A)), {
      consultantUid: "userC",
      updatedAt: now,
    }),
  );

  // userB belongs to UNIT_B only.
  await assertFails(
    updateDoc(doc(dbFor("userB"), unitPath(UNIT_A)), {
      consultantUid: "userB",
      updatedAt: now,
    }),
  );

  // userG belongs to another workspace.
  await assertFails(
    updateDoc(doc(dbFor("userG"), unitPath(UNIT_A)), {
      consultantUid: "userG",
      updatedAt: now,
    }),
  );
});

test("31. only the platform owner clears a consultant slot", async () => {
  const now = Date.now();

  // UNIT_B's consultant cannot vacate their own slot...
  await assertFails(
    updateDoc(doc(dbFor("userB"), unitPath(UNIT_B)), {
      consultantUid: "",
      updatedAt: now,
    }),
  );
  // ...and a member of another unit cannot do it either.
  await assertFails(
    updateDoc(doc(dbFor("userA"), unitPath(UNIT_B)), {
      consultantUid: "",
      updatedAt: now,
    }),
  );

  const owner = dbFor("admin_root");
  await assertSucceeds(
    updateDoc(doc(owner, unitPath(UNIT_B)), { consultantUid: "", updatedAt: now }),
  );
  const snap = await getDoc(doc(owner, unitPath(UNIT_B)));
  assert.equal(snap.data().consultantUid, "");
});

test("32. bed capacity can only be created inside the unit's provisioning window", async () => {
  const now = Date.now();
  const a = dbFor("userA");

  // Capacity acts need the consultant slot.
  await assertSucceeds(
    updateDoc(doc(a, unitPath(UNIT_A)), { consultantUid: "userA", updatedAt: now }),
  );
  await assertSucceeds(
    setDoc(doc(a, path("beds", "bedWarm")), {
      bedId: "bedWarm",
      unitId: UNIT_A,
      label: "A-1",
    }),
  );

  // Age the unit past the one-hour window.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await updateDoc(doc(db, unitPath(UNIT_A)), { createdAtMs: Date.now() - 7200000 });
  });
  await assertFails(
    setDoc(doc(a, path("beds", "bedLate")), {
      bedId: "bedLate",
      unitId: UNIT_A,
      label: "A-2",
    }),
  );
  // Deleting a bed is a capacity change and is frozen just the same.
  await assertFails(deleteDoc(doc(a, path("beds", "bedWarm"))));

  // A capacity lock freezes the window even while it is still open.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await updateDoc(doc(db, unitPath(UNIT_A)), {
      createdAtMs: Date.now(),
      capacityLocked: true,
    });
  });
  await assertFails(
    setDoc(doc(a, path("beds", "bedLocked")), {
      bedId: "bedLocked",
      unitId: UNIT_A,
      label: "A-3",
    }),
  );

  // The platform owner is never bound by the window.
  await assertSucceeds(
    setDoc(doc(dbFor("admin_root"), path("beds", "bedOwner")), {
      bedId: "bedOwner",
      unitId: UNIT_A,
      label: "A-4",
    }),
  );
});

test("33. the unit's consultant edits presentation but never the bed count", async () => {
  const now = Date.now();
  const a = dbFor("userA");

  await assertSucceeds(
    updateDoc(doc(a, unitPath(UNIT_A)), { consultantUid: "userA", updatedAt: now }),
  );
  await assertFails(
    updateDoc(doc(a, unitPath(UNIT_A)), { totalBeds: 12, updatedAt: now }),
  );
  await assertSucceeds(
    updateDoc(doc(a, unitPath(UNIT_A)), {
      name: "Unit A renamed",
      notes: "presentation only",
      updatedAt: now,
    }),
  );

  // The capacity lock is a one-way consultant action.
  await assertSucceeds(
    updateDoc(doc(a, unitPath(UNIT_A)), { capacityLocked: true, updatedAt: now }),
  );
  await assertFails(
    updateDoc(doc(a, unitPath(UNIT_A)), { capacityLocked: false, updatedAt: now }),
  );

  // A member of the unit who is not its consultant cannot edit it at all.
  await assertFails(
    updateDoc(doc(dbFor("userC"), unitPath(UNIT_A)), { name: "Hijacked" }),
  );

  // The platform owner changes the bed count.
  await assertSucceeds(
    updateDoc(doc(dbFor("admin_root"), unitPath(UNIT_A)), { totalBeds: 12 }),
  );
});

test("34. self-service unit creation carries the required metadata", async () => {
  const now = Date.now();
  const a = dbFor("userA");
  const goodUnit = (unitId) => ({
    unitId,
    name: "Self Ward",
    type: "cardiology",
    createdBy: "userA",
    consultantUid: "userA",
    capacityLocked: false,
    totalBeds: 6,
    createdAtMs: now - 1000,
  });

  await assertSucceeds(setDoc(doc(a, unitPath("unitSelf")), goodUnit("unitSelf")));

  // Without a consultant the unit would have nobody accountable for capacity.
  const { consultantUid: _omitted, ...withoutConsultant } = goodUnit("unitNoConsultant");
  await assertFails(
    setDoc(doc(a, unitPath("unitNoConsultant")), withoutConsultant),
  );

  // Claiming to create the unit on somebody else's behalf is denied.
  await assertFails(
    setDoc(doc(a, unitPath("unitForgedCreator")), {
      ...goodUnit("unitForgedCreator"),
      createdBy: "userB",
    }),
  );

  // Pre-locking capacity at birth is not a member's call.
  await assertFails(
    setDoc(doc(a, unitPath("unitPreLocked")), {
      ...goodUnit("unitPreLocked"),
      capacityLocked: true,
    }),
  );

  // A timestamp in the future would game the provisioning window.
  await assertFails(
    setDoc(doc(a, unitPath("unitFuture")), {
      ...goodUnit("unitFuture"),
      createdAtMs: now + 3600000,
    }),
  );

  // A member of another workspace cannot plant a unit here.
  await assertFails(
    setDoc(doc(dbFor("userG"), unitPath("unitIntruder")), {
      ...goodUnit("unitIntruder"),
      createdBy: "userG",
      consultantUid: "userG",
    }),
  );
});

test("35. an expired subscription turns the workspace read-only for members", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, subPath()), {
      trialEndsAtMs: Date.now() - 3 * 86400000,
      periodEndMs: Date.now() - 86400000,
      graceEndsAtMs: Date.now() - 60000,
    });
  });

  const c = dbFor("userC");
  // Reads still work...
  await assertSucceeds(getDoc(doc(c, patientPath(PATIENT_A))));
  await assertSucceeds(
    getDocs(query(collection(c, path("patients")), where("unitId", "==", UNIT_A))),
  );
  await assertSucceeds(getDoc(doc(c, subPath())));

  // ...every clinical write is denied.
  await assertFails(
    setDoc(doc(c, patientPath("lockedPatient")), {
      patientId: "lockedPatient",
      unitId: UNIT_A,
      label: "LOCKED",
    }),
  );
  await assertFails(
    updateDoc(doc(c, patientPath(PATIENT_A)), { label: "LOCKED" }),
  );
  await assertFails(deleteDoc(doc(c, patientPath(PATIENT_A))));

  // Capacity and invites are writes too.
  await assertFails(
    setDoc(doc(dbFor("userA"), path("beds", "bedLockedSub")), {
      bedId: "bedLockedSub",
      unitId: UNIT_A,
      label: "LOCKED",
    }),
  );
  await assertFails(
    setDoc(
      doc(dbFor("userA"), invitePath(hashOf("CV-SUB-LOCKED"))),
      inviteDoc({ expiresAtMs: Date.now() + 3600000 }),
    ),
  );

  // The platform owner keeps writing.
  await assertSucceeds(
    setDoc(doc(dbFor("admin_root"), patientPath("ownerPatient")), {
      patientId: "ownerPatient",
      unitId: UNIT_A,
      label: "OWNER",
    }),
  );
  await assertSucceeds(
    updateDoc(doc(dbFor("admin_root"), patientPath(PATIENT_A)), { label: "OWNER-EDIT" }),
  );
});

test("36. the subscription clock only ever moves forward", async () => {
  const day = 86400000;
  const now = Date.now();
  const owner = dbFor("admin_root");

  await assertSucceeds(
    setDoc(doc(owner, subPath()), {
      trialEndsAtMs: now + 7 * day,
      periodEndMs: now + 30 * day,
      graceEndsAtMs: now + 37 * day,
    }),
  );

  // An active clock lets members work normally, and they can read the clock.
  await assertSucceeds(
    setDoc(doc(dbFor("userC"), patientPath("duringTrial")), {
      patientId: "duringTrial",
      unitId: UNIT_A,
      label: "OK",
    }),
  );
  await assertSucceeds(getDoc(doc(dbFor("userC"), subPath())));

  // Rewinding a paid period is refused.
  await assertFails(
    updateDoc(doc(owner, subPath()), { periodEndMs: now + 20 * day }),
  );
  // Renewing forward is allowed.
  await assertSucceeds(
    updateDoc(doc(owner, subPath()), { periodEndMs: now + 60 * day }),
  );

  // A member can never edit the clock, not even forward.
  await assertFails(
    updateDoc(doc(dbFor("userA"), subPath()), { periodEndMs: now + 90 * day }),
  );
});

test("37. a workspace without a subscription document keeps working", async () => {
  const c = dbFor("userC");

  // No document at all: grandfathered.
  await assertSucceeds(
    setDoc(doc(c, patientPath("grandfathered")), {
      patientId: "grandfathered",
      unitId: UNIT_A,
      label: "OK",
    }),
  );
  await assertSucceeds(getDoc(doc(c, subPath())));

  // A clock without a grace field locks nothing either.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, subPath()), {
      trialEndsAtMs: Date.now() - 86400000,
      periodEndMs: Date.now() - 86400000,
    });
  });
  await assertSucceeds(
    updateDoc(doc(c, patientPath("grandfathered")), { label: "STILL-OK" }),
  );
  await assertSucceeds(
    setDoc(doc(c, patientPath("grandfathered2")), {
      patientId: "grandfathered2",
      unitId: UNIT_A,
      label: "OK",
    }),
  );
});

test("38. the audit trail is append-only and owner-read only", async () => {
  const a = dbFor("userA");
  const event = doc(a, path("audit", "evt-join"));

  await assertSucceeds(
    setDoc(event, {
      eventId: "evt-join",
      workspaceId: WORKSPACE,
      actorUid: "userA",
      action: "join",
      at: Date.now(),
    }),
  );

  // Forging somebody else's actor id is denied, and so is stamping an event
  // with another workspace's id.
  await assertFails(
    setDoc(doc(a, path("audit", "evt-forged")), {
      eventId: "evt-forged",
      workspaceId: WORKSPACE,
      actorUid: "userB",
      action: "role_change",
    }),
  );
  await assertFails(
    setDoc(doc(a, path("audit", "evt-other-workspace")), {
      eventId: "evt-other-workspace",
      workspaceId: WS_B,
      actorUid: "userA",
    }),
  );

  // Nothing rewrites or erases history, not even the platform owner.
  await assertFails(updateDoc(event, { action: "tampered" }));
  await assertFails(deleteDoc(event));
  await assertFails(
    updateDoc(doc(dbFor("admin_root"), path("audit", "evt-join")), { action: "owner-edit" }),
  );
  await assertFails(deleteDoc(doc(dbFor("admin_root"), path("audit", "evt-join"))));

  // Members cannot read the trail; the platform owner can.
  await assertFails(getDoc(event));
  await assertFails(getDocs(collection(a, path("audit"))));
  await assertSucceeds(getDocs(collection(dbFor("admin_root"), path("audit"))));
});

test("39. the invite routing index is a get-only lookup", async () => {
  // Every signed-in account can resolve a code, including an unrelated team.
  await assertSucceeds(getDoc(doc(dbFor("userE"), "invites", INDEX_A)));
  await assertSucceeds(getDoc(doc(dbFor("userG"), "invites", INDEX_A)));

  // But nobody can enumerate the index.
  await assertFails(getDocs(collection(dbFor("userE"), "invites")));
  await assertFails(getDocs(collection(dbFor("admin_root"), "invites")));

  // A random account cannot withdraw an index entry, nor rewrite it.
  await assertFails(deleteDoc(doc(dbFor("userE"), "invites", INDEX_A)));
  await assertFails(deleteDoc(doc(dbFor("userB"), "invites", INDEX_A)));
  await assertFails(
    updateDoc(doc(dbFor("userE"), "invites", INDEX_A), { unitId: UNIT_B }),
  );

  // Minting an index entry demands unit membership, not just an account.
  // (userF is a workspace member but has no unit assignment, unlike userE.)
  await assertFails(
    setDoc(doc(dbFor("userF"), "invites", "idx-forged"), {
      workspaceId: WORKSPACE,
      unitId: UNIT_A,
      createdBy: "userF",
      expiresAtMs: Date.now() + 3600000,
    }),
  );
  // The issuing member can create and then withdraw their own entry.
  await assertSucceeds(
    setDoc(doc(dbFor("userA"), "invites", "idx-issued"), {
      workspaceId: WORKSPACE,
      unitId: UNIT_A,
      createdBy: "userA",
      expiresAtMs: Date.now() + 3600000,
    }),
  );
  await assertSucceeds(deleteDoc(doc(dbFor("userA"), "invites", "idx-issued")));
});

test("40. clinical titles stay inside the units a member belongs to", async () => {
  const a = dbFor("userA");
  const self = doc(a, path("members", "userA"));

  // userA belongs to UNIT_A only.
  await assertSucceeds(
    updateDoc(self, { clinicalRoles: { [UNIT_A]: "specialist" }, updatedAt: Date.now() }),
  );
  // A title for a unit they were never granted is denied.
  await assertFails(
    updateDoc(self, {
      clinicalRoles: { [UNIT_A]: "resident", [UNIT_B]: "resident" },
      updatedAt: Date.now(),
    }),
  );
  // Retitling is not a back door to a wider role or to a second unit.
  await assertFails(
    updateDoc(self, {
      role: "view_only",
      clinicalRoles: { [UNIT_A]: "resident" },
      updatedAt: Date.now(),
    }),
  );
  await assertFails(
    updateDoc(self, {
      clinicalRoles: { [UNIT_A]: "resident" },
      unitIds: [UNIT_A, UNIT_B],
      updatedAt: Date.now(),
    }),
  );

  // A member of both units keeps titles for both.
  await assertSucceeds(
    updateDoc(doc(dbFor("userC"), path("members", "userC")), {
      clinicalRoles: { [UNIT_A]: "resident", [UNIT_B]: "specialist" },
      updatedAt: Date.now(),
    }),
  );
});

test("41. a first join is born with exactly the granted unit", async () => {
  const base = {
    workspaceId: WORKSPACE,
    active: true,
    forceReauth: false,
    role: "clinical_editor",
    unitId: UNIT_A,
    unitIds: [UNIT_A],
    accessCodeHash: HASH_MASTER,
  };
  const create = (uid, overrides = {}) =>
    setDoc(doc(dbFor(uid), path("members", uid)), { uid, ...base, ...overrides });

  await assertSucceeds(create("userL"));

  // Smuggling a second unit into the first join is denied.
  await assertFails(create("userM", { unitIds: [UNIT_A, UNIT_B] }));
  // A clinical title for a unit that was not granted is denied.
  await assertFails(create("userN", { clinicalRoles: { [UNIT_B]: "resident" } }));
  // The membership role must equal the code's role.
  await assertFails(create("userO", { role: "view_only" }));
  // And the code must grant the unit the membership claims.
  await assertFails(create("userP", { unitId: UNIT_B, unitIds: [UNIT_B] }));
  // A code from another workspace does not open this one.
  await assertFails(create("userQ", { accessCodeHash: HASH_TEAM_B }));
});

test("42. only the workspace creator may open its first three-day trial", async () => {
  const DAY = 86400000;
  const clock = ({ days = 3, now = Date.now(), extra = {} } = {}) => ({
    status: "trial",
    trialStartedAtMs: now,
    trialEndsAtMs: now + days * DAY,
    periodEndMs: now + days * DAY,
    graceEndsAtMs: now + (days + 2) * DAY,
    updatedBy: "creator",
    plan: "standard",
    ...extra,
  });
  const clockRef = (workspaceId, uid) =>
    doc(dbFor(uid), "workspaces", workspaceId, "subscription", "current");

  // The creator opens the one trial this workspace will ever get.
  await assertSucceeds(setDoc(clockRef(WS_TRIAL_OK, "userM"), clock()));
  // A clock document can be created once; no second trial.
  await assertFails(setDoc(clockRef(WS_TRIAL_OK, "userM"), clock()));
  // A non-creator account cannot open it at all.
  await assertFails(setDoc(clockRef(WS_TRIAL_OK, "userE"), clock()));

  // The shape is fixed: the grace window must sit exactly two days past the trial.
  await assertFails(setDoc(
    clockRef(WS_TRIAL_SHAPE, "userN"),
    clock({ extra: { graceEndsAtMs: Date.now() + 3 * DAY } }),
  ));
  // ... periodEndMs must equal the trial end, not float free.
  await assertFails(setDoc(
    clockRef(WS_TRIAL_SHAPE, "userN"),
    clock({ extra: { periodEndMs: Date.now() + 30 * DAY } }),
  ));
  // ... and nobody may grant themselves a longer trial.
  await assertFails(setDoc(clockRef(WS_TRIAL_LONG, "userO"), clock({ days: 30 })));
});

