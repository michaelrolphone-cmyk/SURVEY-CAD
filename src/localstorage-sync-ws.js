import { randomUUID } from 'node:crypto';
import { lineforgeCollabInternals } from './lineforge-collab.js';
import { buildSyncResponseState } from './localstorage-sync-state-response.js';

const { decodeNextFrame, encodeTextFrame, createWebSocketAccept } = lineforgeCollabInternals;

export function createLocalStorageSyncWsService({ store }) {
  const clients = new Map();

  async function resolveState() {
    return Promise.resolve(store.getState());
  }

  async function resolveResponseState() {
    return buildSyncResponseState(await resolveState());
  }

  function send(client, payload) {
    if (!client?.socket?.writable) return;
    client.socket.write(encodeTextFrame(JSON.stringify(payload)));
  }

  function broadcast(payload) {
    clients.forEach((client) => send(client, payload));
  }

  function isLikelyJsonPayload(payload) {
    if (!Buffer.isBuffer(payload) || payload.length === 0) return false;
    let idx = 0;
    while (idx < payload.length && payload[idx] <= 0x20) idx += 1;
    if (idx >= payload.length) return false;
    const firstByte = payload[idx];
    return firstByte === 0x7b || firstByte === 0x5b;
  }

  function handleUpgrade(req, socket, head = Buffer.alloc(0)) {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname || '/';
    const isLocalStorageSyncPath = pathname === '/ws/localstorage-sync'
      || pathname === '/ws/localstorage-sync/'
      || pathname.endsWith('/ws/localstorage-sync')
      || pathname.endsWith('/ws/localstorage-sync/');
    if (!isLocalStorageSyncPath) return false;

    // if (req.headers.upgrade?.toLowerCase() !== 'websocket') {
    //   socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    //   socket.destroy();
    //   return true;
    // }

    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return true;
    }

    const clientId = randomUUID();
    const client = { id: clientId, socket, buffer: Buffer.alloc(0) };
    clients.set(clientId, client);

    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${createWebSocketAccept(key)}`,
      '\r\n',
    ].join('\r\n'));

    Promise.resolve(resolveResponseState())
      .then((state) => send(client, { type: 'sync-welcome', clientId, state }))
      .catch(() => {
        socket.end();
      });

    client.buffer = head.length ? Buffer.from(head) : Buffer.alloc(0);

    socket.on('data', (chunk) => {
      client.buffer = client.buffer.length ? Buffer.concat([client.buffer, chunk]) : Buffer.from(chunk);
      while (client.buffer.length) {
        const frame = decodeNextFrame(client.buffer);
        if (!frame) break;
        client.buffer = client.buffer.subarray(frame.consumed);
        if (frame.opcode === 0x8) {
          socket.end();
          return;
        }
        if (frame.opcode !== 0x1) continue;

        if (!isLikelyJsonPayload(frame.payload)) continue;

        let message;
        try {
          message = JSON.parse(frame.payload.toString('utf8'));
        } catch {
          continue;
        }

        Promise.resolve((async () => {
        if (message?.type === 'sync-differential-batch') {
          const diffs = Array.isArray(message.diffs) ? message.diffs : [];
          if (!diffs.length) {
            send(client, { type: 'sync-ack', requestId: message.requestId || null, state: await resolveResponseState() });
            return;
          }

          const result = await Promise.resolve(store.applyDifferentialBatch({ diffs }));

          if (result.status === 'no-op') {
            send(client, {
              type: 'sync-ack',
              requestId: message.requestId || null,
              state: buildSyncResponseState(result.state),
            });
            return;
          }

          broadcast({
            type: 'sync-differential-applied',
            requestId: message.requestId || null,
            originClientId: clientId,
            operations: result.allOperations,
            state: {
              version: result.state.version,
              checksum: result.state.checksum,
            },
          });
          return;
        }

        if (message?.type !== 'sync-differential') return;

        const result = await Promise.resolve(store.applyDifferential({
          operations: message.operations,
          baseChecksum: typeof message.baseChecksum === 'string' ? message.baseChecksum : '',
        }));

        if (result.status === 'checksum-mismatch') {
          send(client, {
            type: 'sync-checksum-mismatch',
            state: buildSyncResponseState(result.state),
            requestId: message.requestId || null,
          });
          return;
        }

        if (result.status === 'no-op') {
          send(client, {
            type: 'sync-ack',
            requestId: message.requestId || null,
            state: buildSyncResponseState(result.state),
          });
          return;
        }

        broadcast({
          type: 'sync-differential-applied',
          requestId: message.requestId || null,
          originClientId: clientId,
          operations: result.operations,
          state: {
            version: result.state.version,
            checksum: result.state.checksum,
          },
        });
        })()).catch(() => {
          socket.end();
        });
      }
    });

    socket.on('close', () => {
      clients.delete(clientId);
    });
    socket.on('error', () => socket.destroy());

    return true;
  }

  return { handleUpgrade, broadcast, _clients: clients };
}
