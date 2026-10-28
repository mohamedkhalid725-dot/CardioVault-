/**
 * Rules tests for the Department Team additions.
 *
 * These cover the three things the UI cannot guarantee on its own:
 *   - a member can only request a subscription for units they belong to,
 *   - only the platform owner can approve, and a member can never self-approve,
 *   - an expired subscription still allows a renewal request but blocks writes.
 *
 * Run with: npm run test:firestore-rules
 */
import test from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import fs from "node:fs";

const PROJECT_ID = "cardiovault-dept-team-rules-test";
const WS = "ws_dept_team_rules";
const UNIT_A = "unitA";
const UNIT_B = "unitB";
const OWNER = "ownerUid";
const DOC_A = "userA";
const DOC_B = "userB";

let testEnv;

const path = {
  member: (ws, uid) => `workspaces/${ws}/members/${uid}`,
  team: (ws, uid) => `workspaces/${ws}/team/${uid}`,
  unit: (ws, unitId) => `workspaces/${ws}/units/${unitId}`,
  request: (ws, id) => `workspaces/${ws}/subscriptionRequests/${id}`,
  master: (ws, id) => `workspaces/${ws}/masterFiles/${id}`,
  waiting: (ws, unitId, id) => `workspaces/${ws}/units/${unitId}/waiting/${id}`,
  patient: (ws, id) => `workspaces/${ws}/patients/${id}`,
  subscription: (ws) => `workspaces/${ws}/subscription/current`,
};

const dbFor = (uid) => testEnv.authenticatedContext(uid).firestore();

function memberDoc(uid, unitId) {
  return {
    workspaceId: WS,
    uid,
    role: "clinical_editor",
    unitId,
    unitIds: [unitId],
    clinicalRoles: { [unitId]: "resident" },
    active: true,
    forceReauth: false,
    createdAtMs: Date.now() - 60000,
  };
}

function teamDoc(uid, unitId) {
  return {
    uid,
    workspaceId: WS,
    name: `Doctor ${uid}`,
    role: "resident",
    status: "active",
    departmentId: "dept-cardiology",
    assignedUnitIds: [unitId],
    updatedAt: new Date().toISOString(),
  };
}

function unitDoc(unitId, ownerUid) {
  return {
    unitId,
    name: `Unit ${unitId}`,
    type: "cardiology",
    notes: "",
    createdBy: ownerUid,
    consultantUid: ownerUid,
    totalBeds: 6,
    capacityLocked: true,
    features: [],
    createdAtMs: Date.now() - 60000,
  };
}

function requestDoc(overrides = {}) {
  return {
    workspaceId: WS,
    subscriberId: DOC_A,
    status: "pending",
    method: "instapay",
    unitIds: [UNIT_A],
    amount: 500,
    currency: "EGP",
    paymentVerified: false,
    createdAtMs: Date.now(),
    ...overrides,
  };
}

async function seedExpiredSubscription() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path.subscription(WS)), {
      status: "expired",
      periodEndMs: Date.now() - 86400000,
      graceEndsAtMs: Date.now() - 3600000,
    });
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
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "platformOwners", OWNER), { email: "owner@example.com" }),
      setDoc(doc(db, `workspaces/${WS}`), { createdBy: OWNER, name: "Dept Team" }),
      setDoc(doc(db, path.member(WS, DOC_A)), memberDoc(DOC_A, UNIT_A)),
      setDoc(doc(db, path.member(WS, DOC_B)), memberDoc(DOC_B, UNIT_B)),
      setDoc(doc(db, path.team(WS, DOC_A)), teamDoc(DOC_A, UNIT_A)),
      setDoc(doc(db, path.team(WS, DOC_B)), teamDoc(DOC_B, UNIT_B)),
      setDoc(doc(db, path.unit(WS, UNIT_A)), unitDoc(UNIT_A, DOC_A)),
      setDoc(doc(db, path.unit(WS, UNIT_B)), unitDoc(UNIT_B, DOC_B)),
      setDoc(doc(db, path.patient(WS, "pA")), {
        unitId: UNIT_A,
        unitIds: [UNIT_A],
        fullName: "Patient A",
        status: "Stable",
      }),
    ]);
  });
});

test.after(async () => {
  await testEnv.cleanup();
});

// ── Subscription requests ────────────────────────────────────────────────

test("a member may file a request for a unit they belong to", async () => {
  const db = dbFor(DOC_A);
  await assertSucceeds(setDoc(doc(db, path.request(WS, "r1")), requestDoc()));
});

test("a member may not file a request for a unit they do not belong to", async () => {
  const db = dbFor(DOC_A);
  await assertFails(
    setDoc(doc(db, path.request(WS, "r2")), requestDoc({ unitIds: [UNIT_B] })),
  );
});

test("a member may not pre-mark a request as paid", async () => {
  const db = dbFor(DOC_A);
  await assertFails(
    setDoc(doc(db, path.request(WS, "r3")), requestDoc({ paymentVerified: true })),
  );
});

test("a member may not approve their own request", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path.request(WS, "r4")), requestDoc());
  });
  const db = dbFor(DOC_A);
  await assertFails(updateDoc(doc(db, path.request(WS, "r4")), { status: "approved" }));
});

test("the owner approves a request", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path.request(WS, "r5")), requestDoc());
  });
  const db = dbFor(OWNER);
  await assertSucceeds(
    updateDoc(doc(db, path.request(WS, "r5")), {
      status: "approved",
      paymentVerified: true,
      decidedAtMs: Date.now(),
    }),
  );
});

test("the owner reads the request queue, a member cannot list it", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path.request(WS, "r6")), requestDoc());
  });
  await assertSucceeds(getDocs(collection(dbFor(OWNER), `workspaces/${WS}/subscriptionRequests`)));
  await assertFails(getDocs(collection(dbFor(DOC_A), `workspaces/${WS}/subscriptionRequests`)));
});

test("a requester reads their own request but not another member's", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, path.request(WS, "r7")), requestDoc());
    await setDoc(doc(db, path.request(WS, "r8")), requestDoc({ subscriberId: DOC_B, unitIds: [UNIT_B] }));
  });
  await assertSucceeds(getDoc(doc(dbFor(DOC_A), path.request(WS, "r7"))));
  await assertFails(getDoc(doc(dbFor(DOC_A), path.request(WS, "r8"))));
});

test("a requester withdraws a pending request but not an approved one", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, path.request(WS, "r9")), requestDoc());
    await setDoc(doc(db, path.request(WS, "r10")), requestDoc({ status: "approved" }));
  });
  await assertSucceeds(updateDoc(doc(dbFor(DOC_A), path.request(WS, "r9")), { status: "withdrawn" }));
  await assertFails(updateDoc(doc(dbFor(DOC_A), path.request(WS, "r10")), { status: "withdrawn" }));
});

test("an expired subscription still allows a renewal request but blocks clinical writes", async () => {
  await seedExpiredSubscription();
  const memberDb = dbFor(DOC_A);
  // The renewal path must survive read-only mode, otherwise the workspace can
  // never be reactivated.
  await assertSucceeds(setDoc(doc(memberDb, path.request(WS, "r11")), requestDoc()));
  // ... but the clinical data is frozen for everyone except the owner.
  await assertFails(updateDoc(doc(memberDb, path.patient(WS, "pA")), { status: "Critical" }));
});

test("unauthenticated callers are denied everywhere", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, path.request(WS, "r1"))));
  await assertFails(setDoc(doc(db, path.request(WS, "r12")), requestDoc()));
});

// ── Master patient file ──────────────────────────────────────────────────

test("a unit member reads a master file scoped to their unit", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path.master(WS, "m1")), {
      workspaceId: WS,
      createdBy: DOC_A,
      contextIds: [UNIT_A],
      name: "Patient A",
    });
  });
  await assertSucceeds(getDoc(doc(dbFor(DOC_A), path.master(WS, "m1"))));
  await assertFails(getDoc(doc(dbFor(DOC_B), path.master(WS, "m1"))));
});

test("a member cannot create a master file that references a foreign unit", async () => {
  const db = dbFor(DOC_A);
  await assertFails(
    setDoc(doc(db, path.master(WS, "m2")), {
      workspaceId: WS,
      createdBy: DOC_A,
      contextIds: [UNIT_A, UNIT_B],
      name: "Foreign",
    }),
  );
});

// ── Unit waiting list ────────────────────────────────────────────────────

test("a waiting entry is readable and writable only inside its own unit", async () => {
  const dbA = dbFor(DOC_A);
  await assertSucceeds(
    setDoc(doc(dbA, path.waiting(WS, UNIT_A, "w1")), {
      workspaceId: WS,
      unitId: UNIT_A,
      patientName: "Patient A",
      createdAtMs: Date.now(),
    }),
  );
  await assertSucceeds(getDoc(doc(dbA, path.waiting(WS, UNIT_A, "w1"))));
  await assertFails(getDoc(doc(dbFor(DOC_B), path.waiting(WS, UNIT_A, "w1"))));
  await assertFails(
    setDoc(doc(dbA, path.waiting(WS, UNIT_B, "w2")), {
      workspaceId: WS,
      unitId: UNIT_B,
      patientName: "Cross-unit",
      createdAtMs: Date.now(),
    }),
  );
});

test("waiting entries cannot be deleted by a member of another unit", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path.waiting(WS, UNIT_A, "w3")), {
      workspaceId: WS,
      unitId: UNIT_A,
      patientName: "Patient A",
      createdAtMs: Date.now(),
    });
  });
  await assertFails(deleteDoc(doc(dbFor(DOC_B), path.waiting(WS, UNIT_A, "w3"))));
  await assertSucceeds(deleteDoc(doc(dbFor(DOC_A), path.waiting(WS, UNIT_A, "w3"))));
});
