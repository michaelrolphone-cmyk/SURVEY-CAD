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
