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

  s1.emit('data', clientFrame({ type: 'state', state: '{"points":[123]}' }));
  const stateMsg = parseServerTextMessage(s2);
  assert.equal(stateMsg.type, 'state');
  assert.equal(stateMsg.state, '{"points":[123]}');

  s1.emit('data', clientFrame({ type: 'cursor', cursor: { x: 7, y: 9 } }));
  const cursorMsg = parseServerTextMessage(s2);
  assert.equal(cursorMsg.type, 'cursor');
  assert.equal(cursorMsg.cursor.x, 7);
  assert.equal(cursorMsg.cursor.y, 9);
  assert.equal(cursorMsg.color, welcome1.color);
});

test('lineforge websocket rejects non-collab upgrade path', () => {
  const collab = createLineforgeCollabService();
  const socket = new FakeSocket();
  const handled = collab.handleUpgrade({ url: '/health', headers: { upgrade: 'websocket', 'sec-websocket-key': 'k' } }, socket, Buffer.alloc(0));
  assert.equal(handled, false);
  assert.equal(socket.destroyed, true);
});
