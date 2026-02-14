import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurveyServer } from '../src/server.js';
import { LocalStorageSyncStore } from '../src/localstorage-sync-store.js';
import {
  getCrewProfiles,
  getEquipmentInventory,
  getEquipmentLogs,
  findCrewMemberById,
  findEquipmentById,
  findEquipmentLogById,
  CREW_KEY,
  EQUIPMENT_KEY,
  EQUIPMENT_LOGS_KEY,
} from '../src/crew-equipment-api.js';

const SAMPLE_CREW = [
  { id: 'crew-1', firstName: 'John', lastName: 'Smith', jobTitle: 'Party Chief', phone: '555-0142', email: 'jsmith@example.com', certifications: 'PLS #12345', notes: '', roles: ['Instrument Operator'], photo: null },
  { id: 'crew-2', firstName: 'Jane', lastName: 'Doe', jobTitle: 'Rodman', phone: '555-0199', email: 'jdoe@example.com', certifications: '', notes: 'New hire', roles: [], photo: null },
];

const SAMPLE_EQUIPMENT = [
  { id: 'equip-1', make: 'Trimble', model: 'S7', equipmentType: 'Total Station', serialNumber: 'SN-001', createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 'equip-2', make: 'Leica', model: 'GS18', equipmentType: 'GPS Rover', serialNumber: 'SN-002', createdAt: '2024-01-02T00:00:00.000Z' },
];

const SAMPLE_LOGS = [
  { id: 'log-1', rodman: 'crew-1', equipmentHeight: '5.2 ft', referencePoint: 'MON 1042', setupTime: '2024-03-12T08:00', teardownTime: '2024-03-12T16:00', jobFileName: 'BoiseSurvey.job', equipmentType: 'GPS Rover', notes: '' },
];

function buildSnapshot() {
  return {
    [CREW_KEY]: JSON.stringify(SAMPLE_CREW),
    [EQUIPMENT_KEY]: JSON.stringify(SAMPLE_EQUIPMENT),
    [EQUIPMENT_LOGS_KEY]: JSON.stringify(SAMPLE_LOGS),
  };
}

// --- Unit tests for helper functions ---

test('getCrewProfiles parses crew from snapshot', () => {
  const profiles = getCrewProfiles(buildSnapshot());
  assert.equal(profiles.length, 2);
  assert.equal(profiles[0].firstName, 'John');
});

test('getCrewProfiles returns empty array for missing key', () => {
  assert.deepEqual(getCrewProfiles({}), []);
  assert.deepEqual(getCrewProfiles(null), []);
});

test('getEquipmentInventory parses equipment from snapshot', () => {
  const items = getEquipmentInventory(buildSnapshot());
  assert.equal(items.length, 2);
  assert.equal(items[0].make, 'Trimble');
});

test('getEquipmentLogs parses logs from snapshot', () => {
  const logs = getEquipmentLogs(buildSnapshot());
  assert.equal(logs.length, 1);
  assert.equal(logs[0].jobFileName, 'BoiseSurvey.job');
});

test('findCrewMemberById returns matching member or null', () => {
  const snapshot = buildSnapshot();
  const found = findCrewMemberById(snapshot, 'crew-1');
  assert.equal(found.firstName, 'John');
  assert.equal(findCrewMemberById(snapshot, 'nonexistent'), null);
});

test('findEquipmentById returns matching item or null', () => {
  const snapshot = buildSnapshot();
  const found = findEquipmentById(snapshot, 'equip-2');
  assert.equal(found.make, 'Leica');
  assert.equal(findEquipmentById(snapshot, 'nonexistent'), null);
});

test('findEquipmentLogById returns matching log or null', () => {
  const snapshot = buildSnapshot();
  const found = findEquipmentLogById(snapshot, 'log-1');
  assert.equal(found.rodman, 'crew-1');
  assert.equal(findEquipmentLogById(snapshot, 'nonexistent'), null);
});

test('handles malformed JSON gracefully', () => {
  const snapshot = { [CREW_KEY]: 'not valid json' };
  assert.deepEqual(getCrewProfiles(snapshot), []);
});

test('handles non-array JSON gracefully', () => {
  const snapshot = { [CREW_KEY]: JSON.stringify({ foo: 'bar' }) };
  assert.deepEqual(getCrewProfiles(snapshot), []);
});

// --- Integration tests for API endpoints ---

async function startApiServer(storeSnapshot = {}) {
  const store = new LocalStorageSyncStore({
    version: 1,
    snapshot: storeSnapshot,
  });
  const server = createSurveyServer({ localStorageSyncStore: store });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

test('GET /api/crew returns crew profiles from sync store', async () => {
  const app = await startApiServer(buildSnapshot());
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/crew`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.crew.length, 2);
    assert.equal(body.crew[0].firstName, 'John');
  } finally {
    app.server.close();
  }
});

test('GET /api/crew?id= returns single crew member', async () => {
  const app = await startApiServer(buildSnapshot());
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/crew?id=crew-2`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.member.firstName, 'Jane');
  } finally {
    app.server.close();
  }
});

test('GET /api/crew?id= returns 404 for unknown id', async () => {
  const app = await startApiServer(buildSnapshot());
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/crew?id=unknown`);
    assert.equal(res.status, 404);
  } finally {
    app.server.close();
  }
});

test('GET /api/crew returns empty array when no data', async () => {
  const app = await startApiServer({});
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/crew`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.crew, []);
  } finally {
    app.server.close();
  }
});

test('POST /api/crew returns 405', async () => {
  const app = await startApiServer(buildSnapshot());
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/crew`, { method: 'POST' });
    assert.equal(res.status, 405);
  } finally {
    app.server.close();
  }
});

test('GET /api/equipment returns equipment inventory', async () => {
  const app = await startApiServer(buildSnapshot());
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/equipment`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.equipment.length, 2);
    assert.equal(body.equipment[0].make, 'Trimble');
  } finally {
    app.server.close();
  }
});

test('GET /api/equipment?id= returns single equipment item', async () => {
  const app = await startApiServer(buildSnapshot());
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/equipment?id=equip-1`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.equipment.model, 'S7');
  } finally {
    app.server.close();
  }
});

test('GET /api/equipment?id= returns 404 for unknown id', async () => {
  const app = await startApiServer(buildSnapshot());
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/equipment?id=unknown`);
    assert.equal(res.status, 404);
  } finally {
    app.server.close();
  }
});

test('GET /api/equipment-logs returns equipment logs', async () => {
  const app = await startApiServer(buildSnapshot());
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/equipment-logs`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.logs.length, 1);
    assert.equal(body.logs[0].jobFileName, 'BoiseSurvey.job');
  } finally {
    app.server.close();
  }
});

test('GET /api/equipment-logs?id= returns single log', async () => {
  const app = await startApiServer(buildSnapshot());
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/equipment-logs?id=log-1`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.log.rodman, 'crew-1');
  } finally {
    app.server.close();
  }
});

test('GET /api/equipment-logs?id= returns 404 for unknown id', async () => {
  const app = await startApiServer(buildSnapshot());
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/equipment-logs?id=unknown`);
    assert.equal(res.status, 404);
  } finally {
    app.server.close();
  }
});
