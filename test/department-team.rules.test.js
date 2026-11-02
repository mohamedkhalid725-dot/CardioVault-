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
import { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
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
  masterEvent: (ws, fileId, eventId) => `workspaces/${ws}/masterFiles/${fileId}/events/${eventId}`,
  waiting: (ws, unitId, id) => `workspaces/${ws}/units/${unitId}/waiting/${id}`,
  patient: (ws, id) => `workspaces/${ws}/patients/${id}`,
  subscription: (ws) => `workspaces/${ws}/subscription/current`,
  license: (ws, unitId) => `workspaces/${ws}/unitLicenses/${unitId}`,
  licenseCode: (ws, hash) => `workspaces/${ws}/unitLicenseCodes/${hash}`,
  activationRequest: (id) => `unitActivationRequests/${id}`,
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

// Mirrors exactly the document subscriptionRequestCloud builds for a member
// request: department area, one unit draft, instapay pricing (500 EGP).
function requestDoc(overrides = {}) {
  const now = Date.now();
  return {
    workspaceId: WS,
    subscriberId: DOC_A,
    subscriberName: "Doctor userA",
    createdByName: "Doctor userA",
    status: "pending",
    method: "instapay",
    unitIds: [UNIT_A],
    amount: 500,
    currency: "EGP",
    paymentVerified: false,
    requestType: "department",
    institutionName: "Dept Team Hospital",
    phone: "+201000000000",
    doctorsCount: 0,
    clinicServices: [],
    unitDrafts: [
      {
        id: "unit_a_draft",
        name: "Unit A",
        typeLabel: "CCU",
        beds: 6,
        receivesOperations: true,
      },
    ],
    lineItems: [
      { area: "department", quantity: 1, currency: "EGP", unitPrice: 500, subtotal: 500 },
    ],
    submittedAtMs: now,
    trialStartedAtMs: now - 60000,
    trialEligible: true,
    isRenewal: false,
    createdBy: DOC_A,
    createdAtMs: now,
    schemaVersion: 1,
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
      setDoc(doc(db, path.license(WS, UNIT_A)), { workspaceId: WS, unitId: UNIT_A, issuedAtMs: Date.now(), expiresAtMs: Date.now() + 30 * 86400000, updatedBy: OWNER, schemaVersion: 1 }),
      setDoc(doc(db, path.license(WS, UNIT_B)), { workspaceId: WS, unitId: UNIT_B, issuedAtMs: Date.now(), expiresAtMs: Date.now() + 30 * 86400000, updatedBy: OWNER, schemaVersion: 1 }),
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

test("members cannot create retired subscription requests even for their own unit", async () => {
  const db = dbFor(DOC_A);
  await assertFails(setDoc(doc(db, path.request(WS, "r1")), requestDoc()));
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
      paymentVerifiedAtMs: Date.now(),
      paymentVerifiedBy: OWNER,
      approvedAtMs: Date.now(),
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

test("master-file events are append-only and visible only through the parent file's authorized units", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path.master(WS, "mpf-pA")), {
      id: "mpf-pA",
      ownerUnitId: UNIT_A,
      contextIds: [UNIT_A],
      sourcePatientIds: ["pA"],
    });
  });
  const event = {
    id: "admission-1",
    refId: "mpf-pA",
    createdBy: DOC_A,
    schemaVersion: 1,
    kind: "patient-admission",
    atMs: Date.now(),
    title: "Patient admitted",
    summary: "Admission recorded",
    detail: "",
    context: { unitId: UNIT_A },
  };
  const memberA = dbFor(DOC_A);
  await assertSucceeds(setDoc(doc(memberA, path.masterEvent(WS, "mpf-pA", event.id)), event));
  await assertSucceeds(getDoc(doc(memberA, path.masterEvent(WS, "mpf-pA", event.id))));
  await assertFails(updateDoc(doc(memberA, path.masterEvent(WS, "mpf-pA", event.id)), { summary: "changed" }));
  await assertFails(deleteDoc(doc(memberA, path.masterEvent(WS, "mpf-pA", event.id))));
  await assertFails(getDoc(doc(dbFor(DOC_B), path.masterEvent(WS, "mpf-pA", event.id))));
});

test("a unit member cannot share a master file to a unit outside their own membership", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path.master(WS, "mpf-pA")), {
      id: "mpf-pA",
      ownerUnitId: UNIT_A,
      contextIds: [UNIT_A],
      sourcePatientIds: ["pA"],
    });
  });
  await assertFails(updateDoc(doc(dbFor(DOC_A), path.master(WS, "mpf-pA")), {
    contextIds: [UNIT_A, UNIT_B],
    updatedAtMs: Date.now(),
  }));
});

test("a master file shared by a member of both units is visible in the destination unit without duplicating the file", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, path.master(WS, "mpf-pA")), {
      id: "mpf-pA", ownerUnitId: UNIT_A, contextIds: [UNIT_A], sourcePatientIds: ["pA"],
    });
    await setDoc(doc(db, path.member(WS, "userBoth")), {
      ...memberDoc("userBoth", UNIT_A), unitIds: [UNIT_A, UNIT_B],
    });
    await setDoc(doc(db, path.team(WS, "userBoth")), {
      ...teamDoc("userBoth", UNIT_A), assignedUnitIds: [UNIT_A, UNIT_B],
    });
  });
  const fileRef = doc(dbFor("userBoth"), path.master(WS, "mpf-pA"));
  await assertSucceeds(updateDoc(fileRef, { contextIds: [UNIT_A, UNIT_B], updatedAtMs: Date.now() }));
  await assertSucceeds(getDoc(doc(dbFor(DOC_B), path.master(WS, "mpf-pA"))));
  const event = { id: "shared-event", refId: "mpf-pA", createdBy: "userBoth", schemaVersion: 1,
    kind: "patient-transfer", atMs: Date.now(), title: "Transfer", summary: "Unit A to B", detail: "",
    context: { unitId: UNIT_B } };
  await assertSucceeds(setDoc(doc(dbFor("userBoth"), path.masterEvent(WS, "mpf-pA", event.id)), event));
  await assertSucceeds(getDoc(doc(dbFor(DOC_B), path.masterEvent(WS, "mpf-pA", event.id))));
});

test("an expired unit license blocks that unit but preserves membership and active sibling access", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), path.license(WS, UNIT_A)), { expiresAtMs: Date.now() - 3600000 });
  });
  const memberDb = dbFor(DOC_A);
  await assertSucceeds(getDoc(doc(memberDb, path.member(WS, DOC_A))));
  await assertSucceeds(getDoc(doc(memberDb, path.license(WS, UNIT_A))));
  await assertFails(getDoc(doc(memberDb, path.patient(WS, "pA"))));
  await assertFails(updateDoc(doc(memberDb, path.patient(WS, "pA")), { status: "Critical" }));
  await assertSucceeds(getDoc(doc(dbFor(DOC_B), path.unit(WS, UNIT_B))));
  await assertSucceeds(getDoc(doc(dbFor(OWNER), path.patient(WS, "pA"))));
});

test("only the platform owner can issue and activate a one-use unit code", async () => {
  const ownerDb = dbFor(OWNER);
  const memberDb = dbFor(DOC_A);
  const hash = 'a'.repeat(64);
  const now = Date.now();
  const codeRef = doc(ownerDb, path.licenseCode(WS, hash));
  const licenseRef = doc(ownerDb, path.license(WS, UNIT_A));
  const license = (await getDoc(doc(ownerDb, path.license(WS, UNIT_A)))).data();
  const expiresAtMs = Math.max(Number(license.expiresAtMs), now) + 30 * 86400000;
  await assertFails(setDoc(doc(memberDb, path.licenseCode(WS, hash)), { workspaceId: WS, unitId: UNIT_A, codeHash: hash }));
  await assertSucceeds(setDoc(codeRef, { workspaceId: WS, unitId: UNIT_A, codeHash: hash, issuedBy: OWNER, issuedAtMs: now, codeExpiresAtMs: now + 30 * 86400000, status: 'active', schemaVersion: 1 }));
  await assertFails(updateDoc(doc(dbFor(DOC_B), path.licenseCode(WS, hash)), { status: 'redeemed', redeemedBy: DOC_B, redeemedAtMs: now, licenseExpiresAtMs: expiresAtMs }));
  await assertFails(updateDoc(doc(ownerDb, path.license(WS, UNIT_A)), { expiresAtMs: expiresAtMs + 86400000 }));
  const memberRedemption = writeBatch(memberDb);
  memberRedemption.update(doc(memberDb, path.licenseCode(WS, hash)), { status: 'redeemed', redeemedBy: DOC_A, redeemedAtMs: now, licenseExpiresAtMs: expiresAtMs });
  memberRedemption.update(doc(memberDb, path.license(WS, UNIT_A)), { workspaceId: WS, unitId: UNIT_A, issuedAtMs: now, expiresAtMs, updatedBy: DOC_A, schemaVersion: 1, activationCodeHash: hash });
  await assertFails(memberRedemption.commit());
  const ownerActivation = writeBatch(ownerDb);
  ownerActivation.update(codeRef, { status: 'redeemed', redeemedBy: OWNER, redeemedAtMs: now, licenseExpiresAtMs: expiresAtMs });
  ownerActivation.update(licenseRef, { workspaceId: WS, unitId: UNIT_A, issuedAtMs: now, expiresAtMs, updatedBy: OWNER, schemaVersion: 1, activationCodeHash: hash });
  await assertSucceeds(ownerActivation.commit());
  await assertFails(updateDoc(doc(dbFor(DOC_B), path.licenseCode(WS, hash)), { status: 'redeemed', redeemedBy: DOC_B, redeemedAtMs: now, licenseExpiresAtMs: expiresAtMs }));
  await assertSucceeds(getDoc(doc(dbFor(DOC_A), path.patient(WS, "pA"))));
});

test("customer-created pending units stay clinically blocked until the owner approves and activates them", async () => {
  const now = Date.now();
  const requestId = `${WS}__${UNIT_A}`;
  const ownerDb = dbFor(OWNER);
  const memberDb = dbFor(DOC_A);
  const memberRequestRef = doc(memberDb, path.activationRequest(requestId));
  const requestRef = doc(ownerDb, path.activationRequest(requestId));
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await updateDoc(doc(db, path.unit(WS, UNIT_A)), { activationStatus: "pending" });
    await updateDoc(doc(db, path.member(WS, DOC_A)), { role: "department_admin" });
    await deleteDoc(doc(db, path.license(WS, UNIT_A)));
    for (let index = 1; index <= 6; index += 1) {
      await setDoc(doc(db, `workspaces/${WS}/beds/bed-${index}`), { unitId: UNIT_A, bedNumber: `Bed ${index}`, status: "Empty" });
    }
  });
  const requestedAtMs = Date.now();
  await assertSucceeds(getDocs(query(collection(memberDb, `workspaces/${WS}/beds`), where('unitId', '==', UNIT_A))));
  await assertFails(getDoc(doc(memberDb, path.patient(WS, "pA"))));
  await assertSucceeds(setDoc(memberRequestRef, {
    requestId, workspaceId: WS, unitId: UNIT_A, unitName: "Unit A", requestedBedCount: 6,
    requestedBy: DOC_A, requestedByName: "Doctor userA", requestedAtMs, status: "pending", schemaVersion: 1,
  }));
  await assertFails(getDoc(doc(memberDb, path.activationRequest(requestId))));
  await assertFails(getDocs(collection(memberDb, "unitActivationRequests")));
  await assertSucceeds(getDoc(requestRef));
  await assertSucceeds(getDocs(collection(ownerDb, "unitActivationRequests")));

  const approvalStartedAtMs = Date.now();
  await assertFails(updateDoc(doc(memberDb, path.activationRequest(requestId)), { status: "approving", approvedBy: DOC_A, approvalStartedAtMs }));
  await assertSucceeds(updateDoc(requestRef, { status: "approving", approvedBy: OWNER, approvalStartedAtMs }));
  await assertSucceeds(updateDoc(doc(ownerDb, path.unit(WS, UNIT_A)), { activationStatus: "active", activatedAtMs: approvalStartedAtMs }));
  await assertFails(getDoc(doc(memberDb, path.patient(WS, "pA"))));
  await assertSucceeds(setDoc(doc(ownerDb, path.license(WS, UNIT_A)), {
    workspaceId: WS, unitId: UNIT_A, issuedAtMs: approvalStartedAtMs,
    expiresAtMs: approvalStartedAtMs + 30 * 86400000, updatedBy: OWNER,
    schemaVersion: 1, activationRequestId: requestId,
  }));
  await assertSucceeds(updateDoc(requestRef, { status: "approved", approvedAtMs: Date.now() }));
  await assertSucceeds(getDoc(doc(memberDb, path.patient(WS, "pA"))));
});

test("platform-owner-created pending units can receive their initial license without an approval request", async () => {
  const now = Date.now();
  const ownerDb = dbFor(OWNER);
  await testEnv.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), path.unit(WS, "owner-created")), { ...unitDoc("owner-created", OWNER), activationStatus: "pending" });
  });
  await assertSucceeds(updateDoc(doc(ownerDb, path.unit(WS, "owner-created")), { activationStatus: "active", activatedAtMs: now }));
  await assertSucceeds(setDoc(doc(ownerDb, path.license(WS, "owner-created")), {
    workspaceId: WS, unitId: "owner-created", issuedAtMs: now,
    expiresAtMs: now + 30 * 86400000, updatedBy: OWNER, schemaVersion: 1,
  }));
});

test("expired subscription clocks do not lock an otherwise licensed unit", async () => {
  await seedExpiredSubscription();
  const memberDb = dbFor(DOC_A);
  await assertSucceeds(updateDoc(doc(memberDb, path.patient(WS, "pA")), { status: "Critical" }));
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
