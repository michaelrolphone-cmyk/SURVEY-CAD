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

function parseServerTextMessage(socket, index = -1) {
  const chunk = index < 0 ? socket.writes.at(index) : socket.writes[index];
  const frame = lineforgeCollabInternals.decodeFrame(chunk);
  assert.ok(frame);
  return JSON.parse(frame.payload.toString('utf8'));
}

test('localstorage sync websocket applies differentials and broadcasts checksums', () => {
  const store = new LocalStorageSyncStore({ snapshot: { alpha: '1' } });
  const service = createLocalStorageSyncWsService({ store });

  const s1 = new FakeSocket();
  const s2 = new FakeSocket();

  assert.equal(service.handleUpgrade({ url: '/ws/localstorage-sync', headers: { upgrade: 'websocket', 'sec-websocket-key': 'k1==' } }, s1), true);
  assert.equal(service.handleUpgrade({ url: '/ws/localstorage-sync', headers: { upgrade: 'websocket', 'sec-websocket-key': 'k2==' } }, s2), true);

  const welcome1 = parseServerTextMessage(s1, 1);
  assert.equal(welcome1.type, 'sync-welcome');

  s1.emit('data', clientFrame({
    type: 'sync-differential',
    requestId: 'r1',
    baseChecksum: welcome1.state.checksum,
    operations: [{ type: 'set', key: 'beta', value: '2' }],
  }));

  const b1 = parseServerTextMessage(s1);
  const b2 = parseServerTextMessage(s2);
  assert.equal(b1.type, 'sync-differential-applied');
  assert.equal(b2.type, 'sync-differential-applied');
  assert.equal(b1.state.checksum, store.getState().checksum);
  assert.equal(store.getState().snapshot.beta, '2');
});


test('localstorage sync websocket applies batch differentials and broadcasts to all clients', () => {
  const store = new LocalStorageSyncStore({ snapshot: { alpha: '1' } });
  const service = createLocalStorageSyncWsService({ store });

  const s1 = new FakeSocket();
  const s2 = new FakeSocket();

  service.handleUpgrade({ url: '/ws/localstorage-sync', headers: { upgrade: 'websocket', 'sec-websocket-key': 'kb1==' } }, s1);
  service.handleUpgrade({ url: '/ws/localstorage-sync', headers: { upgrade: 'websocket', 'sec-websocket-key': 'kb2==' } }, s2);

  s1.emit('data', clientFrame({
    type: 'sync-differential-batch',
    requestId: 'batch-1',
    diffs: [
      { operations: [{ type: 'set', key: 'beta', value: '2' }] },
      { operations: [{ type: 'set', key: 'gamma', value: '3' }, { type: 'remove', key: 'alpha' }] },
    ],
  }));

  const b1 = parseServerTextMessage(s1);
  const b2 = parseServerTextMessage(s2);
  assert.equal(b1.type, 'sync-differential-applied');
  assert.equal(b1.requestId, 'batch-1');
  assert.equal(b2.type, 'sync-differential-applied');
  assert.deepEqual(store.getState().snapshot, { beta: '2', gamma: '3' });
});


test('localstorage sync websocket returns ack for empty batch', () => {
  const store = new LocalStorageSyncStore({ snapshot: { alpha: '1' } });
  const service = createLocalStorageSyncWsService({ store });
  const s1 = new FakeSocket();

  service.handleUpgrade({ url: '/ws/localstorage-sync', headers: { upgrade: 'websocket', 'sec-websocket-key': 'ke==' } }, s1);

  s1.emit('data', clientFrame({
    type: 'sync-differential-batch',
    requestId: 'batch-empty',
    diffs: [],
  }));

  const msg = parseServerTextMessage(s1);
  assert.equal(msg.type, 'sync-ack');
  assert.equal(msg.requestId, 'batch-empty');
});


test('localstorage websocket upgrade accepts prefixed router paths', () => {
  const store = new LocalStorageSyncStore({ snapshot: { alpha: '1' } });
  const service = createLocalStorageSyncWsService({ store });
  const socket = new FakeSocket();

  assert.equal(service.handleUpgrade({
    url: '/record-of-survey/ws/localstorage-sync',
    headers: { upgrade: 'websocket', 'sec-websocket-key': 'k-pref==' },
  }, socket), true);

  const welcome = parseServerTextMessage(socket, 1);
  assert.equal(welcome.type, 'sync-welcome');
});


test('localstorage websocket isolates broadcasts by crew/project context', () => {
  const stores = new Map();
  const service = createLocalStorageSyncWsService({
    getStoreForRequest: (req) => {
      const url = new URL(req.url || '/', 'http://localhost');
      const crewMemberId = String(url.searchParams.get('crewMemberId') || '');
      const projectId = String(url.searchParams.get('projectId') || '');
      if (!crewMemberId) throw new Error('missing crew');
      const key = `${crewMemberId}::${projectId}`;
      if (!stores.has(key)) stores.set(key, new LocalStorageSyncStore({ snapshot: {} }));
      return {
        context: { crewMemberId, projectId, contextKey: key },
        store: stores.get(key),
      };
    },
  });

  const s1 = new FakeSocket();
  const s2 = new FakeSocket();
  const s3 = new FakeSocket();

  service.handleUpgrade({ url: '/ws/localstorage-sync?crewMemberId=a&projectId=p1', headers: { upgrade: 'websocket', 'sec-websocket-key': 'k-1==' } }, s1);
  service.handleUpgrade({ url: '/ws/localstorage-sync?crewMemberId=a&projectId=p1', headers: { upgrade: 'websocket', 'sec-websocket-key': 'k-2==' } }, s2);
  service.handleUpgrade({ url: '/ws/localstorage-sync?crewMemberId=b&projectId=p2', headers: { upgrade: 'websocket', 'sec-websocket-key': 'k-3==' } }, s3);

  const welcome1 = parseServerTextMessage(s1, 1);

  s1.emit('data', clientFrame({
    type: 'sync-differential',
    requestId: 'ctx-1',
    baseChecksum: welcome1.state.checksum,
    operations: [{ type: 'set', key: 'shared', value: 'only-p1' }],
  }));

  const scopedBroadcast1 = parseServerTextMessage(s1);
  const scopedBroadcast2 = parseServerTextMessage(s2);
  assert.equal(scopedBroadcast1.type, 'sync-differential-applied');
  assert.equal(scopedBroadcast2.type, 'sync-differential-applied');
  assert.equal(s3.writes.length, 2, 'other contexts should only receive their initial handshake + welcome');
});

test('localstorage websocket rejects missing crew identity context', () => {
  const service = createLocalStorageSyncWsService({
    getStoreForRequest: () => {
      throw new Error('missing crew');
    },
  });
  const socket = new FakeSocket();
  assert.equal(service.handleUpgrade({
    url: '/ws/localstorage-sync',
    headers: { upgrade: 'websocket', 'sec-websocket-key': 'k-missing==' },
  }, socket), true);
  assert.equal(socket.destroyed, true);
});
