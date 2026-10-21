#!/usr/bin/env node
/**
 * Seeds the LOCAL Firebase Emulator Suite with clearly fake demo data.
 *
 *   1. npm run emulators:start     (Firestore 8080, Auth 9099, Storage 9199)
 *   2. npm run emulators:seed
 *   3. npm run dev:emulator        (Vite on http://localhost:5173, emulator mode)
 *
 * Everything written here is synthetic: the patients are called "DEMO PATIENT A/B/C",
 * the hospital is "Demo Hospital Cardiology" and the accounts use @emulator.test
 * addresses. No real patient data is ever involved.
 *
 * The shape mirrors the current security contract:
 *   - ownership is /platformOwners/{uid}, never a membership row;
 *   - the platform owner is NOT in any unit's team roster;
 *   - unit capacity is a bed document set plus the provisioning window;
 *   - a unit's consultant is a single slot (units/{id}.consultantUid);
 *   - invites are hashed, single-use and mirrored in /invites/{hash}.
 *
 * The Firestore emulator accepts `Authorization: Bearer owner` to bypass the
 * security rules, so plain fetch against the emulator REST API is enough and no
 * extra npm dependency is required.
 */

import { createHash } from 'node:crypto';

const PROJECT_ID = 'cardiovault-emulator-test';
const FIRESTORE_HOST = 'http://127.0.0.1:8080';
const AUTH_HOST = 'http://127.0.0.1:9099';
// The Auth emulator serves the Identity Toolkit API under this prefix; the bare
// root only answers the emulator admin endpoints.
const AUTH_API = `${AUTH_HOST}/identitytoolkit.googleapis.com/v1`;
const API_KEY = 'fake-api-key';
const OWNER_TOKEN = 'owner';

const PASSWORD = 'Test1234!';
const OWNER = { email: 'doctor@emulator.test', password: PASSWORD };
const RESIDENT = { email: 'resident@emulator.test', password: PASSWORD };
const NURSE = { email: 'nurse@emulator.test', password: PASSWORD };
const NEWCOMER = { email: 'newcomer@emulator.test', password: PASSWORD };

// Must match MASTER_WORKSPACE_ID in src/services/workspaceAccess.ts so the
// owner's boot sequence lands on the seeded data instead of creating an empty one.
const WORKSPACE_ID = 'cardiovault_master_workspace';

const CCU = 'unit-ccu-1';
const ICU = 'unit-icu-1';

// Plain-text demo codes, hashed below exactly like the client does.
const ACCESS_CODE = 'CV-DEMO-CCU1-2026';
const INVITE_CODE = 'CV-JOIN-ICU-2026';

const DAY = 86400000;

/** Firestore REST API value encoding. */
function toValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (typeof value === 'object') {
    const fields = {};
    for (const [key, entry] of Object.entries(value)) fields[key] = toValue(entry);
    return { mapValue: { fields } };
  }
  throw new Error(`Unsupported seed value: ${String(value)}`);
}

function documentUrl(path) {
  return `${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
}

async function writeDocument(path, data) {
  const fields = {};
  for (const [key, value] of Object.entries(data)) fields[key] = toValue(value);
  const response = await fetch(documentUrl(path), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OWNER_TOKEN}`,
    },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to write ${path} (${response.status}): ${body}`);
  }
  return path;
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/** Looks up an existing emulator account so repeated seeds stay idempotent. */
async function findExistingUid(email, password) {
  try {
    const response = await fetch(`${AUTH_API}/accounts:signInWithPassword?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const body = await readJson(response);
    if (body?.localId) return body.localId;
  } catch {
    // fall through
  }
  return null;
}

/** Creates the account, or reuses it when the emulator already knows it. */
async function ensureUser({ email, password }) {
  const response = await fetch(`${AUTH_API}/accounts:signUp?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await readJson(response);
  if (response.ok && body?.localId) return { uid: body.localId, created: true };
  const message = String(body?.error?.message || body?.message || response.statusText);
  if (/EMAIL_EXISTS/i.test(message)) {
    const uid = await findExistingUid(email, password);
    if (uid) return { uid, created: false };
  }
  throw new Error(`Could not create the emulator account ${email}: ${message}`);
}

async function assertEmulatorsReachable() {
  const targets = [
    { name: 'Firestore', url: `${FIRESTORE_HOST}/` },
    { name: 'Auth', url: `${AUTH_HOST}/` },
  ];
  for (const target of targets) {
    try {
      await fetch(target.url, { method: 'GET' });
    } catch (error) {
      console.error(`\n[!] The ${target.name} emulator is not reachable at ${target.url}.`);
      console.error('  Start the emulators first:  npm run emulators:start');
      console.error(`  (${String(error?.message || error)})\n`);
      process.exit(1);
    }
  }
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

async function main() {
  await assertEmulatorsReachable();

  const now = Date.now();
  const iso = new Date(now).toISOString();
  const owner = await ensureUser(OWNER);
  const resident = await ensureUser(RESIDENT);
  const nurse = await ensureUser(NURSE);
  const newcomer = await ensureUser(NEWCOMER);

  const written = [];
  const write = async (path, data) => {
    await writeDocument(path, data);
    written.push(path);
  };

  // Ownership ------------------------------------------------------------
  // The only thing that grants administrative authority. Written from the
  // console in production; here the seed plays the console's role.
  await write(`platformOwners/${owner.uid}`, {
    email: OWNER.email,
    grantedAt: iso,
    note: 'Emulator demo owner - synthetic account',
  });

  // Workspace ------------------------------------------------------------
  await write(`workspaces/${WORKSPACE_ID}`, {
    name: 'Demo Hospital Cardiology',
    schemaVersion: 12,
    createdAt: iso,
    createdBy: owner.uid,
    createdByEmail: OWNER.email,
  });

  // Membership + team profiles -------------------------------------------
  // The owner has NO membership row and NO unit assignment: he sees every unit
  // through /platformOwners, and must never appear in a unit's roster.
  const members = [
    {
      account: resident,
      name: 'Dr. Demo Resident',
      role: 'resident',
      units: [CCU, ICU],
    },
    {
      account: nurse,
      name: 'Nurse Demo',
      role: 'nurse',
      units: [CCU],
    },
  ];

  for (const member of members) {
    const { uid } = member.account;
    await write(`workspaces/${WORKSPACE_ID}/members/${uid}`, {
      uid,
      workspaceId: WORKSPACE_ID,
      role: 'clinical_editor',
      active: true,
      forceReauth: false,
      unitId: member.units[0],
      unitIds: member.units,
      accessCodeHash: '',
      accessCodeHashes: [],
      joinedAt: iso,
      updatedAt: iso,
    });
    await write(`workspaces/${WORKSPACE_ID}/team/${uid}`, {
      uid,
      userId: uid,
      workspaceId: WORKSPACE_ID,
      name: member.name,
      email: member.account.email,
      role: member.role,
      departmentId: 'dept-cardiology',
      assignedUnitIds: member.units,
      status: 'active',
      updatedAt: iso,
    });
    // Unit rosters: the Team screen of a non-owner reads these, never the
    // workspace team collection (which is owner-only), so every unit a member
    // belongs to needs its own roster document or the demo directory is empty.
    for (const unitId of member.units) {
      await write(`workspaces/${WORKSPACE_ID}/units/${unitId}/roster/${uid}`, {
        uid,
        name: member.name,
        role: 'clinical_editor',
        clinicalRole: member.role,
        status: 'active',
        joinedAtMs: now,
        updatedAtMs: now,
        addedBy: owner.uid,
        email: member.account.email,
      });
    }
  }

  // Units ----------------------------------------------------------------
  // createdAtMs is hours in the past so the one-hour bed provisioning window is
  // closed: capacity already belongs to the owner on these units.
  const units = [
    {
      id: CCU,
      name: 'CCU 1 (Demo)',
      type: 'ccu',
      totalBeds: 6,
      // The single consultant slot is taken, so the join screen must NOT offer
      // the Consultant option for this unit.
      consultantUid: resident.uid,
      consultantName: 'Dr. Demo Resident',
    },
    {
      id: ICU,
      name: 'ICU 1 (Demo)',
      type: 'icu',
      totalBeds: 4,
      // Free slot: a newcomer may claim Consultant on first join.
      consultantUid: '',
      consultantName: '',
    },
  ];

  for (const unit of units) {
    await write(`workspaces/${WORKSPACE_ID}/units/${unit.id}`, {
      unitId: unit.id,
      id: unit.id,
      name: unit.name,
      type: unit.type,
      totalBeds: unit.totalBeds,
      createdBy: owner.uid,
      createdAtMs: now - 3 * 60 * 60 * 1000,
      capacityLocked: true,
      consultantUid: unit.consultantUid,
      consultantName: unit.consultantName,
      updatedAt: iso,
    });
  }

  // Beds live in ONE workspace-level collection with a unitId, which is what the
  // app reads and what capacity is counted from - not per-unit subcollections.
  const bedOccupant = {
    [`${CCU}:1`]: 'demo-patient-1',
    [`${CCU}:2`]: 'demo-patient-2',
    [`${ICU}:1`]: 'demo-patient-3',
  };
  for (const unit of units) {
    for (let index = 1; index <= unit.totalBeds; index += 1) {
      const patientId = bedOccupant[`${unit.id}:${index}`] || '';
      await write(`workspaces/${WORKSPACE_ID}/beds/bed-${unit.id}-${index}`, {
        id: `bed-${unit.id}-${index}`,
        unitId: unit.id,
        bedNumber: String(index),
        status: patientId ? 'Stable' : 'Empty',
        ...(patientId ? { patientId } : {}),
        schemaVersion: 12,
      });
    }
  }

  // Patients (obviously fake) --------------------------------------------
  const patients = [
    {
      id: 'demo-patient-1',
      unitId: CCU,
      bedId: `bed-${CCU}-1`,
      name: 'DEMO PATIENT A',
      age: 61,
      gender: 'male',
      diagnosis: 'Demo diagnosis - not a real case',
    },
    {
      id: 'demo-patient-2',
      unitId: CCU,
      bedId: `bed-${CCU}-2`,
      name: 'DEMO PATIENT B',
      age: 54,
      gender: 'female',
      diagnosis: 'Demo diagnosis - not a real case',
    },
    {
      id: 'demo-patient-3',
      unitId: ICU,
      bedId: `bed-${ICU}-1`,
      name: 'DEMO PATIENT C',
      age: 70,
      gender: 'male',
      diagnosis: 'Demo diagnosis - not a real case',
    },
  ];

  for (const patient of patients) {
    await write(`workspaces/${WORKSPACE_ID}/patients/${patient.id}`, {
      patientId: patient.id,
      fullName: patient.name,
      name: patient.name,
      unitId: patient.unitId,
      bedId: patient.bedId,
      age: patient.age,
      gender: patient.gender,
      diagnosis: patient.diagnosis,
      status: 'Stable',
      isArchived: false,
      admissionDate: iso,
      createdAt: iso,
      updatedAt: iso,
      schemaVersion: 12,
    });
  }

  // Subscription clock ---------------------------------------------------
  // An active paid period, so the app is writable and the card can be renewed.
  await write(`workspaces/${WORKSPACE_ID}/subscription/current`, {
    status: 'active',
    plan: 'standard',
    trialStartedAtMs: now - 40 * DAY,
    trialEndsAtMs: now - 37 * DAY,
    periodEndMs: now + 20 * DAY,
    graceEndsAtMs: now + 22 * DAY,
    updatedBy: owner.uid,
    updatedAtMs: now,
  });

  // Access code (permanent, per unit) ------------------------------------
  const accessCodeHash = sha256(ACCESS_CODE);
  await write(`accessCodes/${accessCodeHash}`, {
    workspaceId: WORKSPACE_ID,
    unitId: CCU,
    unitName: 'CCU 1 (Demo)',
    role: 'clinical_editor',
    active: true,
    createdBy: owner.uid,
    createdAtMs: now,
  });

  // Temporary invite (single use, expires) -------------------------------
  const inviteHash = sha256(INVITE_CODE);
  await write(`workspaces/${WORKSPACE_ID}/invites/${inviteHash}`, {
    workspaceId: WORKSPACE_ID,
    unitId: ICU,
    unitName: 'ICU 1 (Demo)',
    role: 'clinical_editor',
    clinicalRole: 'consultant',
    createdBy: resident.uid,
    createdAtMs: now,
    expiresAtMs: now + 7 * DAY,
    used: false,
    revoked: false,
    code: INVITE_CODE,
  });
  await write(`invites/${inviteHash}`, {
    workspaceId: WORKSPACE_ID,
    unitId: ICU,
    unitName: 'ICU 1 (Demo)',
    role: 'clinical_editor',
    clinicalRole: 'consultant',
    createdBy: resident.uid,
    createdAtMs: now,
    expiresAtMs: now + 7 * DAY,
  });

  console.log(`\n[ok] Emulator seed complete (project: ${PROJECT_ID})`);
  console.log(`  Documents written: ${written.length}`);
  console.log(`  Workspace: ${WORKSPACE_ID}`);
  console.log('\n  Login accounts (email / password):');
  console.log(`    Platform owner   : ${OWNER.email} / ${PASSWORD}   (uid ${owner.uid})`);
  console.log(`    Resident         : ${RESIDENT.email} / ${PASSWORD}   (uid ${resident.uid})`);
  console.log(`    Nurse            : ${NURSE.email} / ${PASSWORD}   (uid ${nurse.uid})`);
  console.log(`    Newcomer (no unit): ${NEWCOMER.email} / ${PASSWORD}   (uid ${newcomer.uid})`);
  console.log('\n  Demo codes:');
  console.log(`    Unit access code (CCU)  : ${ACCESS_CODE}`);
  console.log(`    Temp invite (ICU, 7d)   : ${INVITE_CODE}   single use`);
  console.log('\n  All seeded data is synthetic demo data - no real patient information.\n');
}

main().catch((error) => {
  console.error(`\n[!] Seeding failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
