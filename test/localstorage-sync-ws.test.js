import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { lineforgeCollabInternals } from '../src/lineforge-collab.js';
import { createLocalStorageSyncWsService } from '../src/localstorage-sync-ws.js';
import { LocalStorageSyncStore } from '../src/localstorage-sync-store.js';

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
  let header;
  if (data.length < 126) {
    header = Buffer.from([0x81, 0x80 | data.length]);
  } else {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(data.length, 2);
  }
  const masked = Buffer.allocUnsafe(data.length);
  for (let i = 0; i < data.length; i += 1) masked[i] = data[i] ^ mask[i % 4];
  return Buffer.concat([header, mask, masked]);
}


function clientTextFrame(text) {
  const data = Buffer.from(String(text), 'utf8');
  const mask = Buffer.from([9, 8, 7, 6]);
  let header;
  if (data.length < 126) {
    header = Buffer.from([0x81, 0x80 | data.length]);
  } else {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(data.length, 2);
  }
  const masked = Buffer.allocUnsafe(data.length);
  for (let i = 0; i < data.length; i += 1) masked[i] = data[i] ^ mask[i % 4];
  return Buffer.concat([header, mask, masked]);
}

function parseServerTextMessage(socket, index = -1) {
  const chunk = index < 0 ? socket.writes.at(index) : socket.writes[index];
  const frame = lineforgeCollabInternals.decodeFrame(chunk);
  assert.ok(frame);
  return JSON.parse(frame.payload.toString('utf8'));
}

test('localstorage sync websocket applies differentials and broadcasts checksums', async () => {
  const store = new LocalStorageSyncStore({ snapshot: { alpha: '1' } });
  const service = createLocalStorageSyncWsService({ store });

  const s1 = new FakeSocket();
  const s2 = new FakeSocket();

  assert.equal(service.handleUpgrade({ url: '/ws/localstorage-sync', headers: { upgrade: 'websocket', 'sec-websocket-key': 'k1==' } }, s1), true);
  assert.equal(service.handleUpgrade({ url: '/ws/localstorage-sync', headers: { upgrade: 'websocket', 'sec-websocket-key': 'k2==' } }, s2), true);

  await new Promise((resolve) => setImmediate(resolve));
  const welcome1 = parseServerTextMessage(s1, 1);
  assert.equal(welcome1.type, 'sync-welcome');

  await new Promise((resolve) => setImmediate(resolve));

  await new Promise((resolve) => setImmediate(resolve));

  s1.emit('data', clientFrame({
    type: 'sync-differential',
    requestId: 'r1',
    baseChecksum: welcome1.state.checksum,
    operations: [{ type: 'set', key: 'beta', value: '2' }],
  }));

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const b1 = parseServerTextMessage(s1);
  const b2 = parseServerTextMessage(s2);
  assert.equal(b1.type, 'sync-differential-applied');
  assert.equal(b2.type, 'sync-differential-applied');
  assert.equal(b1.state.checksum, store.getState().checksum);
  assert.equal(store.getState().snapshot.beta, '2');
});


test('localstorage sync websocket applies batch differentials and broadcasts to all clients', async () => {
  const store = new LocalStorageSyncStore({ snapshot: { alpha: '1' } });
  const service = createLocalStorageSyncWsService({ store });

  const s1 = new FakeSocket();
  const s2 = new FakeSocket();

  service.handleUpgrade({ url: '/ws/localstorage-sync', headers: { upgrade: 'websocket', 'sec-websocket-key': 'kb1==' } }, s1);
  service.handleUpgrade({ url: '/ws/localstorage-sync', headers: { upgrade: 'websocket', 'sec-websocket-key': 'kb2==' } }, s2);

  await new Promise((resolve) => setImmediate(resolve));

  s1.emit('data', clientFrame({
    type: 'sync-differential-batch',
    requestId: 'batch-1',
    diffs: [
      { operations: [{ type: 'set', key: 'beta', value: '2' }] },
      { operations: [{ type: 'set', key: 'gamma', value: '3' }, { type: 'remove', key: 'alpha' }] },
    ],
  }));

  await new Promise((resolve) => setImmediate(resolve));
  const b1 = parseServerTextMessage(s1);
  const b2 = parseServerTextMessage(s2);
  assert.equal(b1.type, 'sync-differential-applied');
  assert.equal(b1.requestId, 'batch-1');
  assert.equal(b2.type, 'sync-differential-applied');
  assert.deepEqual(store.getState().snapshot, { beta: '2', gamma: '3' });
});


test('localstorage sync websocket returns ack for empty batch', async () => {
  const store = new LocalStorageSyncStore({ snapshot: { alpha: '1' } });
  const service = createLocalStorageSyncWsService({ store });
  const s1 = new FakeSocket();

  service.handleUpgrade({ url: '/ws/localstorage-sync', headers: { upgrade: 'websocket', 'sec-websocket-key': 'ke==' } }, s1);

  s1.emit('data', clientFrame({
    type: 'sync-differential-batch',
    requestId: 'batch-empty',
    diffs: [],
  }));

  await new Promise((resolve) => setImmediate(resolve));
  const msg = parseServerTextMessage(s1);
  assert.equal(msg.type, 'sync-ack');
  assert.equal(msg.requestId, 'batch-empty');
});


test('localstorage websocket upgrade accepts prefixed router paths', async () => {
  const store = new LocalStorageSyncStore({ snapshot: { alpha: '1' } });
  const service = createLocalStorageSyncWsService({ store });
  const socket = new FakeSocket();

  assert.equal(service.handleUpgrade({
    url: '/record-of-survey/ws/localstorage-sync',
    headers: { upgrade: 'websocket', 'sec-websocket-key': 'k-pref==' },
  }, socket), true);

  await new Promise((resolve) => setImmediate(resolve));
  const welcome = parseServerTextMessage(socket, 1);
  assert.equal(welcome.type, 'sync-welcome');
});

test('localstorage sync websocket supports async store methods', async () => {
  const state = { version: 1, snapshot: { alpha: '1' }, checksum: 'seed', updatedAt: null };
  const store = {
    async getState() {
      return { ...state, snapshot: { ...state.snapshot } };
    },
    async applyDifferential() {
      state.version = 2;
      state.snapshot = { alpha: '1', beta: '2' };
      state.checksum = 'next';
      return {
        status: 'applied',
        operations: [{ type: 'set', key: 'beta', value: '2' }],
        state: await this.getState(),
      };
    },
    async applyDifferentialBatch() {
      return { status: 'no-op', state: await this.getState(), allOperations: [] };
    },
  };

  const service = createLocalStorageSyncWsService({ store });
  const socket = new FakeSocket();
  service.handleUpgrade({ url: '/ws/localstorage-sync', headers: { upgrade: 'websocket', 'sec-websocket-key': 'ka==' } }, socket);

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const welcome = parseServerTextMessage(socket, 1);

  socket.emit('data', clientFrame({
    type: 'sync-differential',
    requestId: 'async-1',
    baseChecksum: welcome.state.checksum,
    operations: [{ type: 'set', key: 'beta', value: '2' }],
  }));

  await new Promise((resolve) => setImmediate(resolve));
  const applied = parseServerTextMessage(socket);
  assert.equal(applied.type, 'sync-differential-applied');
  assert.equal(applied.state.version, 2);
  assert.equal(applied.state.checksum, 'next');
});

test('localstorage sync websocket buffers fragmented websocket frames', async () => {
  const store = new LocalStorageSyncStore({ snapshot: { alpha: '1' } });
  const service = createLocalStorageSyncWsService({ store });
  const socket = new FakeSocket();

  service.handleUpgrade({ url: '/ws/localstorage-sync', headers: { upgrade: 'websocket', 'sec-websocket-key': 'kf==' } }, socket);

  await new Promise((resolve) => setImmediate(resolve));
  const welcome = parseServerTextMessage(socket, 1);

  const frame = clientFrame({
    type: 'sync-differential',
    requestId: 'frag-1',
    baseChecksum: welcome.state.checksum,
    operations: [{ type: 'set', key: 'beta', value: '2' }],
  });

  socket.emit('data', frame.subarray(0, 3));
  socket.emit('data', frame.subarray(3));

  await new Promise((resolve) => setImmediate(resolve));
  const applied = parseServerTextMessage(socket);
  assert.equal(applied.type, 'sync-differential-applied');
  assert.equal(store.getState().snapshot.beta, '2');
});


test('localstorage sync websocket ignores non-JSON text frames', async () => {
  const store = new LocalStorageSyncStore({ snapshot: { alpha: '1' } });
  const service = createLocalStorageSyncWsService({ store });
  const socket = new FakeSocket();

  service.handleUpgrade({ url: '/ws/localstorage-sync', headers: { upgrade: 'websocket', 'sec-websocket-key': 'kg==' } }, socket);

  await new Promise((resolve) => setImmediate(resolve));
  const writesBefore = socket.writes.length;

  socket.emit('data', clientTextFrame('------multipart-boundary\r\nContent-Type: application/octet-stream'));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(socket.destroyed, false);
  assert.equal(socket.writable, true);
  assert.equal(socket.writes.length, writesBefore);
  assert.deepEqual(store.getState().snapshot, { alpha: '1' });
});

