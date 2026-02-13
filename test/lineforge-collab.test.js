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
    url: '/ws/lineforge?room=alpha',
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
    url: '/ws/lineforge?room=alpha',
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

test('lineforge websocket accepts base-path routed collab endpoint', () => {
  const collab = createLineforgeCollabService();
  const socket = new FakeSocket();
  const handled = collab.handleUpgrade({
    url: '/record-of-survey/ws/lineforge?room=base-path',
    headers: {
      upgrade: 'websocket',
      'sec-websocket-key': 'route-key==',
    },
  }, socket, Buffer.alloc(0));

  assert.equal(handled, true);
  const welcome = parseServerTextMessage(socket, 1);
  assert.equal(welcome.type, 'welcome');
  assert.equal(welcome.revision, 0);
});


test('lineforge rejects stale state revisions and returns canonical room state', () => {
  const collab = createLineforgeCollabService();

  const s1 = new FakeSocket();
  const s2 = new FakeSocket();

  assert.equal(collab.handleUpgrade({
    url: '/ws/lineforge?room=beta',
    headers: { upgrade: 'websocket', 'sec-websocket-key': 'key-a==' },
  }, s1, Buffer.alloc(0)), true);

  assert.equal(collab.handleUpgrade({
    url: '/ws/lineforge?room=beta',
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
    url: '/ws/lineforge?room=locks',
    headers: { upgrade: 'websocket', 'sec-websocket-key': 'lock-a==' },
  }, s1, Buffer.alloc(0)), true);
  assert.equal(collab.handleUpgrade({
    url: '/ws/lineforge?room=locks',
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

test('lineforge processes fragmented and coalesced websocket frames', () => {
  const collab = createLineforgeCollabService();
  const s1 = new FakeSocket();
  const s2 = new FakeSocket();

  assert.equal(collab.handleUpgrade({
    url: '/ws/lineforge?room=fragmented',
    headers: { upgrade: 'websocket', 'sec-websocket-key': 'frag-a==' },
  }, s1, Buffer.alloc(0)), true);
  assert.equal(collab.handleUpgrade({
    url: '/ws/lineforge?room=fragmented',
    headers: { upgrade: 'websocket', 'sec-websocket-key': 'frag-b==' },
  }, s2, Buffer.alloc(0)), true);

  const welcome1 = parseServerTextMessage(s1, 1);
  parseServerTextMessage(s2, 1);
  parseServerTextMessage(s1); // peer-joined broadcast

  const stateFrame = clientFrame({
    type: 'state',
    requestId: 'frag-state',
    baseRevision: welcome1.revision,
    state: '{"points":[42]}',
  });
  const splitAt = Math.floor(stateFrame.length / 2);
  s1.emit('data', stateFrame.subarray(0, splitAt));
  s1.emit('data', stateFrame.subarray(splitAt));

  const ack = parseServerTextMessage(s1);
  assert.equal(ack.type, 'state-ack');
  const stateBroadcast = parseServerTextMessage(s2);
  assert.equal(stateBroadcast.type, 'state');
  assert.equal(stateBroadcast.state, '{"points":[42]}');

  const cursorFrame = clientFrame({ type: 'cursor', cursor: { x: 5, y: 6 } });
  const presenceFrame = clientFrame({ type: 'ar-presence', presence: { x: 1, y: 2, lat: 43.6, lon: -116.2 } });
  s1.emit('data', Buffer.concat([cursorFrame, presenceFrame]));

  const cursorMessage = parseServerTextMessage(s2, -2);
  assert.equal(cursorMessage.type, 'cursor');
  const presenceMessage = parseServerTextMessage(s2);
  assert.equal(presenceMessage.type, 'ar-presence');
});


test('lineforge processes websocket frames that arrive in upgrade head bytes', () => {
  const collab = createLineforgeCollabService();
  const s1 = new FakeSocket();

  assert.equal(collab.handleUpgrade({
    url: '/ws/lineforge?room=head-bytes',
    headers: { upgrade: 'websocket', 'sec-websocket-key': 'head-a==' },
  }, s1, clientFrame({
    type: 'state',
    requestId: 'head-state',
    baseRevision: 0,
    state: '{"points":[99]}',
  })), true);

  const welcome = parseServerTextMessage(s1, 1);
  assert.equal(welcome.type, 'welcome');

  const ack = parseServerTextMessage(s1);
  assert.equal(ack.type, 'state-ack');
  assert.equal(ack.requestId, 'head-state');
  assert.equal(ack.revision, 1);

  const s2 = new FakeSocket();
  assert.equal(collab.handleUpgrade({
    url: '/ws/lineforge?room=head-bytes',
    headers: { upgrade: 'websocket', 'sec-websocket-key': 'head-b==' },
  }, s2, Buffer.alloc(0)), true);

  const welcome2 = parseServerTextMessage(s2, 1);
  assert.equal(welcome2.type, 'welcome');
  assert.equal(welcome2.revision, 1);
  assert.equal(welcome2.state, '{"points":[99]}');
});
