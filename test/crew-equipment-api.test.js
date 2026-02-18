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
  saveCrewMember,
  saveEquipmentItem,
  saveEquipmentLog,
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

// --- Unit tests for save functions ---

test('saveCrewMember adds a new member to empty store', async () => {
  const store = new LocalStorageSyncStore({ version: 1, snapshot: {} });
  const result = await saveCrewMember(store, { id: 'new-1', firstName: 'Test', lastName: 'User' });
  assert.equal(result.status, 'applied');
  const profiles = getCrewProfiles(store.getState().snapshot);
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].firstName, 'Test');
});

test('saveCrewMember updates existing member by id', async () => {
  const store = new LocalStorageSyncStore({ version: 1, snapshot: buildSnapshot() });
  const result = await saveCrewMember(store, { id: 'crew-1', firstName: 'Updated', lastName: 'Smith' });
  assert.equal(result.status, 'applied');
  const member = findCrewMemberById(store.getState().snapshot, 'crew-1');
  assert.equal(member.firstName, 'Updated');
});

test('saveEquipmentItem adds a new item to empty store', async () => {
  const store = new LocalStorageSyncStore({ version: 1, snapshot: {} });
  const result = await saveEquipmentItem(store, { id: 'eq-1', make: 'Topcon', model: 'GT-1' });
  assert.equal(result.status, 'applied');
  const items = getEquipmentInventory(store.getState().snapshot);
  assert.equal(items.length, 1);
  assert.equal(items[0].make, 'Topcon');
});

test('saveEquipmentLog adds a new log to empty store', async () => {
  const store = new LocalStorageSyncStore({ version: 1, snapshot: {} });
  const result = await saveEquipmentLog(store, { id: 'log-new', rodman: 'crew-1', jobFileName: 'Test.job' });
  assert.equal(result.status, 'applied');
  const logs = getEquipmentLogs(store.getState().snapshot);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].jobFileName, 'Test.job');
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

test('POST /api/crew with empty body returns 400', async () => {
  const app = await startApiServer(buildSnapshot());
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/crew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  } finally {
    app.server.close();
  }
});

test('POST /api/crew creates a new crew member and persists it', async () => {
  const app = await startApiServer({});
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/crew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Alice', lastName: 'Walker', jobTitle: 'Surveyor' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.member.firstName, 'Alice');
    assert.equal(body.member.lastName, 'Walker');
    assert.ok(body.member.id);

    // Verify persisted via GET
    const getRes = await fetch(`http://127.0.0.1:${app.port}/api/crew`);
    const getData = await getRes.json();
    assert.equal(getData.crew.length, 1);
    assert.equal(getData.crew[0].firstName, 'Alice');
  } finally {
    app.server.close();
  }
});

test('POST /api/equipment creates a new equipment item and persists it', async () => {
  const app = await startApiServer({});
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/equipment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ make: 'Topcon', model: 'GT-600', equipmentType: 'Total Station', serialNumber: 'SN-999' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.equipment.make, 'Topcon');
    assert.ok(body.equipment.id);

    const getRes = await fetch(`http://127.0.0.1:${app.port}/api/equipment`);
    const getData = await getRes.json();
    assert.equal(getData.equipment.length, 1);
    assert.equal(getData.equipment[0].make, 'Topcon');
  } finally {
    app.server.close();
  }
});

test('POST /api/equipment with empty body returns 400', async () => {
  const app = await startApiServer({});
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/equipment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  } finally {
    app.server.close();
  }
});

test('POST /api/equipment-logs creates a new log and persists it', async () => {
  const app = await startApiServer({});
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/equipment-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rodman: 'crew-1', jobFileName: 'TestJob.job', equipmentType: 'GPS Rover' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.log.rodman, 'crew-1');
    assert.equal(body.log.jobFileName, 'TestJob.job');
    assert.ok(body.log.id);

    const getRes = await fetch(`http://127.0.0.1:${app.port}/api/equipment-logs`);
    const getData = await getRes.json();
    assert.equal(getData.logs.length, 1);
    assert.equal(getData.logs[0].jobFileName, 'TestJob.job');
  } finally {
    app.server.close();
  }
});

test('POST /api/equipment-logs with empty body returns 400', async () => {
  const app = await startApiServer({});
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/equipment-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  } finally {
    app.server.close();
  }
});

test('POST /api/crew updates existing member when id matches', async () => {
  const app = await startApiServer(buildSnapshot());
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/crew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'crew-1', firstName: 'Jonathan', lastName: 'Smith' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.member.firstName, 'Jonathan');

    const getRes = await fetch(`http://127.0.0.1:${app.port}/api/crew?id=crew-1`);
    const getData = await getRes.json();
    assert.equal(getData.member.firstName, 'Jonathan');
  } finally {
    app.server.close();
  }
});

test('POST /api/crew preserves lineSmithActiveDrawingByProject preferences for cross-device restore', async () => {
  const app = await startApiServer(buildSnapshot());
  try {
    const updateRes = await fetch(`http://127.0.0.1:${app.port}/api/crew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'crew-1',
        firstName: 'John',
        lastName: 'Smith',
        lineSmithActiveDrawingByProject: {
          'project-alpha': 'boundary-base-map',
          'project-beta': 'lot-12-revision-a',
        },
      }),
    });
    assert.equal(updateRes.status, 201);
    const updatedPayload = await updateRes.json();
    assert.deepEqual(updatedPayload.member.lineSmithActiveDrawingByProject, {
      'project-alpha': 'boundary-base-map',
      'project-beta': 'lot-12-revision-a',
    });

    const getRes = await fetch(`http://127.0.0.1:${app.port}/api/crew?id=crew-1`);
    assert.equal(getRes.status, 200);
    const getPayload = await getRes.json();
    assert.deepEqual(getPayload.member.lineSmithActiveDrawingByProject, {
      'project-alpha': 'boundary-base-map',
      'project-beta': 'lot-12-revision-a',
    });
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
