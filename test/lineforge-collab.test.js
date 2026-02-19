import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createLineforgeCollabService, lineforgeCollabInternals } from '../src/lineforge-collab.js';

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.writable = true;
    this.writes = [];
    this.destroyed = false;
  }

  write(chunk) {
    this.writes.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    return true;
  }

  end() {
    this.writable = false;
    this.emit('close');
  }

  destroy() {
    this.destroyed = true;
    this.writable = false;
  }
}

function clientFrame(payload) {
  const data = Buffer.from(JSON.stringify(payload), 'utf8');
  const mask = Buffer.from([1, 2, 3, 4]);
  const header = Buffer.from([0x81, 0x80 | data.length]);
  const masked = Buffer.allocUnsafe(data.length);
  for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4];
  return Buffer.concat([header, mask, masked]);
}

function parseServerTextMessage(socket, index = -1) {
  const chunk = index < 0 ? socket.writes.at(index) : socket.writes[index];
  const frame = lineforgeCollabInternals.decodeFrame(chunk);
  assert.ok(frame);
  return JSON.parse(frame.payload.toString('utf8'));
}

test('lineforge websocket handshake and broadcast keeps state/cursor in-room', () => {
  const collab = createLineforgeCollabService();

  const s1 = new FakeSocket();
  const req1 = {
    url: '/ws/lineforge?crewMemberId=crew-a&projectId=proj-1&room=alpha',
    headers: {
      upgrade: 'websocket',
      'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
    },
  };

  assert.equal(collab.handleUpgrade(req1, s1, Buffer.alloc(0)), true);
  const welcome1 = parseServerTextMessage(s1, 1);
  assert.equal(welcome1.type, 'welcome');
  assert.equal(welcome1.peers.length, 0);

  const s2 = new FakeSocket();
  const req2 = {
    url: '/ws/lineforge?crewMemberId=crew-a&projectId=proj-1&room=alpha',
    headers: {
      upgrade: 'websocket',
      'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZTI=',
    },
  };

  assert.equal(collab.handleUpgrade(req2, s2, Buffer.alloc(0)), true);
  const welcome2 = parseServerTextMessage(s2, 1);
  assert.equal(welcome2.type, 'welcome');
  assert.equal(welcome2.peers.length, 1);

  const peerJoined = parseServerTextMessage(s1);
  assert.equal(peerJoined.type, 'peer-joined');
  assert.equal(peerJoined.clientId, welcome2.clientId);

  s1.emit('data', clientFrame({ type: 'state', requestId: 'req-1', baseRevision: welcome1.revision, state: '{\"points\":[123]}' }));
  const stateAck = parseServerTextMessage(s1);
  assert.equal(stateAck.type, 'state-ack');
  assert.equal(stateAck.requestId, 'req-1');
  assert.equal(stateAck.revision, 1);

  const stateMsg = parseServerTextMessage(s2);
  assert.equal(stateMsg.type, 'state');
  assert.equal(stateMsg.state, '{\"points\":[123]}');
  assert.equal(stateMsg.revision, 1);

  s1.emit('data', clientFrame({ type: 'cursor', cursor: { x: 7, y: 9 } }));
  const cursorMsg = parseServerTextMessage(s2);
  assert.equal(cursorMsg.type, 'cursor');
  assert.equal(cursorMsg.cursor.x, 7);
  assert.equal(cursorMsg.cursor.y, 9);
  assert.equal(cursorMsg.color, welcome1.color);

  s1.emit('data', clientFrame({ type: 'ar-presence', presence: { x: 10, y: 20, lat: 43.61, lon: -116.2, headingRad: 1.2 } }));
  const presenceMsg = parseServerTextMessage(s2);
  assert.equal(presenceMsg.type, 'ar-presence');
  assert.equal(presenceMsg.presence.x, 10);
  assert.equal(presenceMsg.presence.y, 20);
  assert.equal(presenceMsg.presence.lat, 43.61);
  assert.equal(presenceMsg.presence.lon, -116.2);

});

test('lineforge websocket rejects non-collab upgrade path', () => {
  const collab = createLineforgeCollabService();
  const socket = new FakeSocket();
  const handled = collab.handleUpgrade({ url: '/health', headers: { upgrade: 'websocket', 'sec-websocket-key': 'k' } }, socket, Buffer.alloc(0));
  assert.equal(handled, false);
  assert.equal(socket.destroyed, true);
});


test('lineforge rejects stale state revisions and returns canonical room state', () => {
  const collab = createLineforgeCollabService();

  const s1 = new FakeSocket();
  const s2 = new FakeSocket();

  assert.equal(collab.handleUpgrade({
    url: '/ws/lineforge?crewMemberId=crew-a&projectId=proj-1&room=beta',
    headers: { upgrade: 'websocket', 'sec-websocket-key': 'key-a==' },
  }, s1, Buffer.alloc(0)), true);

  assert.equal(collab.handleUpgrade({
    url: '/ws/lineforge?crewMemberId=crew-a&projectId=proj-1&room=beta',
    headers: { upgrade: 'websocket', 'sec-websocket-key': 'key-b==' },
  }, s2, Buffer.alloc(0)), true);

  const welcome1 = parseServerTextMessage(s1, 1);
  const welcome2 = parseServerTextMessage(s2, 1);

  s1.emit('data', clientFrame({
    type: 'state',
    requestId: 's1-1',
    baseRevision: welcome1.revision,
    state: '{"points":[1]}',
  }));

  const ack = parseServerTextMessage(s1);
  assert.equal(ack.type, 'state-ack');
  assert.equal(ack.revision, 1);

  // stale write: client 2 still tries base revision 0 after room moved to revision 1
  s2.emit('data', clientFrame({
    type: 'state',
    requestId: 's2-stale',
    baseRevision: welcome2.revision,
    state: '{"points":[2]}',
  }));

  const rejected = parseServerTextMessage(s2);
  assert.equal(rejected.type, 'state-rejected');
  assert.equal(rejected.requestId, 's2-stale');
  assert.equal(rejected.expectedRevision, 1);
  assert.equal(rejected.state, '{"points":[1]}');
});


test('lineforge lock handshake grants, denies, and releases object edit locks', () => {
  const collab = createLineforgeCollabService();
  const s1 = new FakeSocket();
  const s2 = new FakeSocket();

  assert.equal(collab.handleUpgrade({
    url: '/ws/lineforge?crewMemberId=crew-a&projectId=proj-1&room=locks',
    headers: { upgrade: 'websocket', 'sec-websocket-key': 'lock-a==' },
  }, s1, Buffer.alloc(0)), true);
  assert.equal(collab.handleUpgrade({
    url: '/ws/lineforge?crewMemberId=crew-a&projectId=proj-1&room=locks',
    headers: { upgrade: 'websocket', 'sec-websocket-key': 'lock-b==' },
  }, s2, Buffer.alloc(0)), true);

  const welcome1 = parseServerTextMessage(s1, 1);
  const welcome2 = parseServerTextMessage(s2, 1);
  assert.deepEqual(welcome1.locks, []);
  assert.deepEqual(welcome2.locks, []);

  s1.emit('data', clientFrame({
    type: 'lock-request',
    requestId: 'l1',
    entityType: 'point',
    entityId: 'p-1',
  }));

  const granted = parseServerTextMessage(s1);
  assert.equal(granted.type, 'lock-granted');
  assert.equal(granted.entityType, 'point');
  assert.equal(granted.entityId, 'p-1');

  const broadcastLocked = parseServerTextMessage(s2);
  assert.equal(broadcastLocked.type, 'lock-updated');
  assert.equal(broadcastLocked.action, 'locked');

  s2.emit('data', clientFrame({
    type: 'lock-request',
    requestId: 'l2',
    entityType: 'point',
    entityId: 'p-1',
  }));

  const denied = parseServerTextMessage(s2);
  assert.equal(denied.type, 'lock-denied');
  assert.equal(denied.reason, 'already-locked');

  s1.emit('data', clientFrame({
    type: 'lock-release',
    entityType: 'point',
    entityId: 'p-1',
  }));

  const released1 = parseServerTextMessage(s1);
  const released2 = parseServerTextMessage(s2);
  assert.equal(released1.type, 'lock-updated');
  assert.equal(released1.action, 'released');
  assert.equal(released2.type, 'lock-updated');
  assert.equal(released2.action, 'released');
});

test('lineforge isolates rooms across crew/project context even when room id matches', () => {
  const collab = createLineforgeCollabService();
  const sameCrewProject = new FakeSocket();
  const otherCrewProject = new FakeSocket();

  assert.equal(collab.handleUpgrade({
    url: '/ws/lineforge?crewMemberId=crew-a&projectId=proj-1&room=shared-room',
    headers: { upgrade: 'websocket', 'sec-websocket-key': 'iso-a==' },
  }, sameCrewProject, Buffer.alloc(0)), true);

  assert.equal(collab.handleUpgrade({
    url: '/ws/lineforge?crewMemberId=crew-b&projectId=proj-2&room=shared-room',
    headers: { upgrade: 'websocket', 'sec-websocket-key': 'iso-b==' },
  }, otherCrewProject, Buffer.alloc(0)), true);

  const sameCrewWelcome = parseServerTextMessage(sameCrewProject, 1);
  const otherCrewWelcome = parseServerTextMessage(otherCrewProject, 1);
  assert.equal(sameCrewWelcome.type, 'welcome');
  assert.equal(otherCrewWelcome.type, 'welcome');
  assert.equal(sameCrewWelcome.peers.length, 0);
  assert.equal(otherCrewWelcome.peers.length, 0);

  sameCrewProject.emit('data', clientFrame({ type: 'cursor', cursor: { x: 7, y: 9 } }));
  assert.equal(otherCrewProject.writes.length, 2, 'peer in different crew/project should not receive updates');
});

test('lineforge websocket requires crew member identity context', () => {
  const collab = createLineforgeCollabService();
  const socket = new FakeSocket();
  const handled = collab.handleUpgrade({
    url: '/ws/lineforge?room=alpha',
    headers: { upgrade: 'websocket', 'sec-websocket-key': 'missing-crew==' },
  }, socket, Buffer.alloc(0));

  assert.equal(handled, false);
  assert.equal(socket.destroyed, true);
});

test('lineforge can broadcast shared Field-to-Finish updates to all connected clients', () => {
  const collab = createLineforgeCollabService();
  const scopedA = new FakeSocket();
  const scopedB = new FakeSocket();

  assert.equal(collab.handleUpgrade({
    url: '/ws/lineforge?crewMemberId=crew-a&projectId=proj-1&room=room-a',
    headers: { upgrade: 'websocket', 'sec-websocket-key': 'global-a==' },
  }, scopedA, Buffer.alloc(0)), true);
  assert.equal(collab.handleUpgrade({
    url: '/ws/lineforge?crewMemberId=crew-b&projectId=proj-2&room=room-b',
    headers: { upgrade: 'websocket', 'sec-websocket-key': 'global-b==' },
  }, scopedB, Buffer.alloc(0)), true);

  collab.broadcastGlobal({ type: 'field-to-finish-updated', revision: 3 });

  const aMessage = parseServerTextMessage(scopedA);
  const bMessage = parseServerTextMessage(scopedB);
  assert.equal(aMessage.type, 'field-to-finish-updated');
  assert.equal(bMessage.type, 'field-to-finish-updated');
  assert.equal(aMessage.revision, 3);
  assert.equal(bMessage.revision, 3);
});
