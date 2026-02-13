import { randomUUID } from 'node:crypto';
import { lineforgeCollabInternals } from './lineforge-collab.js';

const { decodeFrame, encodeTextFrame, createWebSocketAccept } = lineforgeCollabInternals;

export function createLocalStorageSyncWsService({ store }) {
  const clients = new Map();

  function send(client, payload) {
    if (!client?.socket?.writable) return;
    client.socket.write(encodeTextFrame(JSON.stringify(payload)));
  }

  function broadcast(payload) {
    clients.forEach((client) => send(client, payload));
  }

  function handleUpgrade(req, socket, head = Buffer.alloc(0)) {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname || '/';
    const isLocalStorageSyncPath = pathname === '/ws/localstorage-sync'
      || pathname === '/ws/localstorage-sync/'
      || pathname.endsWith('/ws/localstorage-sync')
      || pathname.endsWith('/ws/localstorage-sync/');
    if (!isLocalStorageSyncPath) return false;

    if (req.headers.upgrade?.toLowerCase() !== 'websocket') {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return true;
    }

    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return true;
    }

    const clientId = randomUUID();
    const client = { id: clientId, socket };
    clients.set(clientId, client);

    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${createWebSocketAccept(key)}`,
      '\r\n',
    ].join('\r\n'));

    send(client, { type: 'sync-welcome', clientId, state: store.getState() });

    if (head.length) {
      const frame = decodeFrame(head);
      if (frame?.opcode === 0x8) socket.end();
    }

    socket.on('data', (chunk) => {
      const frame = decodeFrame(chunk);
      if (!frame) return;
      if (frame.opcode === 0x8) {
        socket.end();
        return;
      }
      if (frame.opcode !== 0x1) return;

      let message;
      try {
        message = JSON.parse(frame.payload.toString('utf8'));
      } catch {
        return;
      }

      if (message?.type === 'sync-differential-batch') {
        const diffs = Array.isArray(message.diffs) ? message.diffs : [];
        if (!diffs.length) {
          send(client, { type: 'sync-ack', requestId: message.requestId || null, state: store.getState() });
          return;
        }

        const result = store.applyDifferentialBatch({ diffs });

        if (result.status === 'no-op') {
          send(client, { type: 'sync-ack', requestId: message.requestId || null, state: result.state });
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

      const result = store.applyDifferential({
        operations: message.operations,
        baseChecksum: typeof message.baseChecksum === 'string' ? message.baseChecksum : '',
      });

      if (result.status === 'checksum-mismatch') {
        send(client, { type: 'sync-checksum-mismatch', state: result.state, requestId: message.requestId || null });
        return;
      }

      if (result.status === 'no-op') {
        send(client, { type: 'sync-ack', requestId: message.requestId || null, state: result.state });
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
    });

    socket.on('close', () => {
      clients.delete(clientId);
    });
    socket.on('error', () => socket.destroy());

    return true;
  }

  return { handleUpgrade, _clients: clients };
}
