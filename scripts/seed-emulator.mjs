#!/usr/bin/env node
/**
 * Seeds the LOCAL Firebase Emulator Suite with clearly fake demo data.
 *
 *   1. npm run emulators:start     (Firestore 8080, Auth 9099, Storage 9199)
 *   2. npm run emulators:seed
 *
 * Everything written here is synthetic: the patients are called "DEMO PATIENT A/B/C",
 * the hospital is "Demo Hospital Cardiology" and the accounts use @emulator.test
 * addresses. No real patient data is ever involved.
 *
 * The Firestore emulator accepts `Authorization: Bearer owner` to bypass the
 * security rules, so plain fetch against the emulator REST API is enough and no
 * extra npm dependency is required.
 */

const PROJECT_ID = 'cardiovault-emulator-test';
const FIRESTORE_HOST = 'http://127.0.0.1:8080';
const AUTH_HOST = 'http://127.0.0.1:9099';
const API_KEY = 'fake-api-key';
const OWNER_TOKEN = 'owner';

const DOCTOR = { email: 'doctor@emulator.test', password: 'Test1234!' };
const NURSE = { email: 'nurse@emulator.test', password: 'Test1234!' };

const WORKSPACE_ID = 'ws_demo_hospital';

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
  // 1) The emulator admin account listing is the cheapest lookup.
  try {
    const response = await fetch(`${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`);
    if (response.ok) {
      const body = await readJson(response);
      const users = Array.isArray(body?.users) ? body.users : [];
      const match = users.find(
        (user) => String(user?.email || '').toLowerCase() === email.toLowerCase(),
      );
      if (match?.localId) return match.localId;
    }
  } catch {
    // fall through to the identity toolkit endpoints
  }

  // 2) accounts:lookup by email.
  try {
    const response = await fetch(`${AUTH_HOST}/accounts:lookup?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: [email] }),
    });
    const body = await readJson(response);
    const match = Array.isArray(body?.users) ? body.users[0] : null;
    if (match?.localId) return match.localId;
  } catch {
    // fall through to the sign-in fallback
  }

  // 3) Sign in and look the account up with the returned id token.
  try {
    const signIn = await fetch(`${AUTH_HOST}/accounts:signInWithPassword?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const signInBody = await readJson(signIn);
    if (signIn.ok && signInBody?.idToken) {
      const response = await fetch(`${AUTH_HOST}/accounts:lookup?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: signInBody.idToken }),
      });
      const body = await readJson(response);
      const match = Array.isArray(body?.users) ? body.users[0] : null;
      if (match?.localId) return match.localId;
    }
  } catch {
    // no usable account found
  }

  throw new Error(`Could not resolve an emulator uid for ${email}.`);
}

/** Creates the account, or reuses it when the emulator already knows it. */
async function ensureUser({ email, password }) {
  const response = await fetch(`${AUTH_HOST}/accounts:signUp?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await readJson(response);
  if (response.ok && body?.localId) {
    return { uid: body.localId, created: true };
  }
  const message = String(body?.error?.message || body?.message || response.statusText);
  if (/EMAIL_EXISTS/i.test(message)) {
    return { uid: await findExistingUid(email, password), created: false };
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
      console.error(`\n✖ The ${target.name} emulator is not reachable at ${target.url}.`);
      console.error('  Start the emulators first:  npm run emulators:start');
      console.error(`  (${String(error?.message || error)})\n`);
      process.exit(1);
    }
  }
}

async function main() {
  await assertEmulatorsReachable();

  const now = new Date().toISOString();
  const doctor = await ensureUser(DOCTOR);
  const nurse = await ensureUser(NURSE);

  const written = [];
  const write = async (path, data) => {
    await writeDocument(path, data);
    written.push(path);
  };

  // Workspace -------------------------------------------------------------
  await write(`workspaces/${WORKSPACE_ID}`, {
    ownerUid: doctor.uid,
    ownerEmail: DOCTOR.email,
    name: 'Demo Hospital Cardiology',
    schemaVersion: 12,
    createdAt: now,
  });

  // Members ---------------------------------------------------------------
  await write(`workspaces/${WORKSPACE_ID}/members/${doctor.uid}`, {
    uid: doctor.uid,
    workspaceId: WORKSPACE_ID,
    role: 'owner',
    active: true,
    forceReauth: false,
    unitIds: [],
    unitId: '',
    accessCodeHash: '',
    accessCodeHashes: [],
    joinedAt: now,
    updatedAt: now,
  });

  await write(`workspaces/${WORKSPACE_ID}/members/${nurse.uid}`, {
    uid: nurse.uid,
    workspaceId: WORKSPACE_ID,
    role: 'clinical_editor',
    active: true,
    forceReauth: false,
    unitId: 'unit-ccu-1',
    unitIds: ['unit-ccu-1'],
    joinedAt: now,
    updatedAt: now,
  });

  // Team directory --------------------------------------------------------
  await write(`workspaces/${WORKSPACE_ID}/team/${doctor.uid}`, {
    uid: doctor.uid,
    userId: doctor.uid,
    name: 'Dr. Demo Owner',
    email: DOCTOR.email,
    role: 'department_admin',
    departmentId: 'dept-cardiology',
    assignedUnitIds: ['unit-ccu-1'],
    status: 'active',
    updatedAt: now,
  });

  await write(`workspaces/${WORKSPACE_ID}/team/${nurse.uid}`, {
    uid: nurse.uid,
    userId: nurse.uid,
    name: 'Nurse Demo',
    email: NURSE.email,
    role: 'nurse',
    departmentId: 'dept-cardiology',
    assignedUnitIds: ['unit-ccu-1'],
    status: 'active',
    updatedAt: now,
  });

  // Units -----------------------------------------------------------------
  await write(`workspaces/${WORKSPACE_ID}/units/unit-ccu-1`, {
    unitId: 'unit-ccu-1',
    name: 'CCU 1 (Demo)',
    type: 'ccu',
  });

  await write(`workspaces/${WORKSPACE_ID}/units/unit-icu-1`, {
    unitId: 'unit-icu-1',
    name: 'ICU 1 (Demo)',
    type: 'icu',
  });

  // Patients (obviously fake) ---------------------------------------------
  const patients = [
    {
      id: 'demo-patient-1',
      unitId: 'unit-ccu-1',
      name: 'DEMO PATIENT A',
      age: 61,
      gender: 'male',
      diagnosis: 'Demo diagnosis - not a real case',
    },
    {
      id: 'demo-patient-2',
      unitId: 'unit-ccu-1',
      name: 'DEMO PATIENT B',
      age: 54,
      gender: 'female',
      diagnosis: 'Demo diagnosis - not a real case',
    },
    {
      id: 'demo-patient-3',
      unitId: 'unit-icu-1',
      name: 'DEMO PATIENT C',
      age: 70,
      gender: 'male',
      diagnosis: 'Demo diagnosis - not a real case',
    },
  ];

  for (const patient of patients) {
    await write(`workspaces/${WORKSPACE_ID}/patients/${patient.id}`, {
      patientId: patient.id,
      name: patient.name,
      unitId: patient.unitId,
      age: patient.age,
      gender: patient.gender,
      diagnosis: patient.diagnosis,
      status: 'admitted',
      admissionDate: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Access code -----------------------------------------------------------
  await write('accessCodes/demo-hash-demo', {
    workspaceId: WORKSPACE_ID,
    unitId: 'unit-ccu-1',
    unitName: 'CCU 1 (Demo)',
    role: 'clinical_editor',
    active: true,
  });

  console.log('\n✔ Emulator seed complete (project: ' + PROJECT_ID + ')');
  console.log(`  Documents written: ${written.length}`);
  for (const path of written) console.log(`    - ${path}`);
  console.log('\n  Login accounts:');
  console.log(`    owner / clinical editor : ${DOCTOR.email} / ${DOCTOR.password}  (uid ${doctor.uid}${doctor.created ? '' : ', reused'})`);
  console.log(`    clinical editor         : ${NURSE.email} / ${NURSE.password}  (uid ${nurse.uid}${nurse.created ? '' : ', reused'})`);
  console.log(`    workspace               : ${WORKSPACE_ID}`);
  console.log('  All seeded data is synthetic demo data - no real patient information.\n');
}

main().catch((error) => {
  console.error('\n✖ Seeding failed: ' + String(error?.message || error) + '\n');
  process.exit(1);
});
