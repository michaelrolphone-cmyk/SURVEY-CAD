import { randomUUID } from 'node:crypto';
import { lineforgeCollabInternals } from './lineforge-collab.js';

const { decodeFrame, encodeTextFrame, createWebSocketAccept } = lineforgeCollabInternals;

export function createLocalStorageSyncWsService({ store, getStoreForRequest } = {}) {
  const contextualResolver = typeof getStoreForRequest === 'function'
    ? getStoreForRequest
    : null;
  const getStoreResolver = typeof store === 'function'
    ? (req) => ({ store: store(req), context: null })
    : null;
  const storeResolver = getStoreForRequest
    || getStoreResolver
    || contextualResolver
    || ((req) => {
      const candidate = req?.getStoreForRequest;
      if (typeof candidate === 'function') return candidate(req);
      return { store, context: null };
    });

  const clients = new Map();
  const clientsByContext = new Map();

  function send(client, payload) {
    if (!client?.socket?.writable) return;
    client.socket.write(encodeTextFrame(JSON.stringify(payload)));
  }

  function broadcast(contextKey, payload) {
    const contextClients = clientsByContext.get(contextKey);
    if (!contextClients) return;
    contextClients.forEach((clientId) => {
      const client = clients.get(clientId);
      if (client) send(client, payload);
    });
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

    let requestStore;
    try {
      requestStore = storeResolver(req);
    } catch (err) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return true;
    }

    const activeStore = requestStore?.store;
    if (!activeStore) {
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
      return true;
    }

    const contextKey = requestStore?.context?.contextKey || '__default__';
    const contextMeta = requestStore?.context || {};
    const clientId = randomUUID();
    const client = { id: clientId, socket, contextKey };
    clients.set(clientId, client);
    if (!clientsByContext.has(contextKey)) {
      clientsByContext.set(contextKey, new Set());
    }
    clientsByContext.get(contextKey).add(clientId);

    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${createWebSocketAccept(key)}`,
      '\r\n',
    ].join('\r\n'));

    send(client, {
      type: 'sync-welcome',
      clientId,
      state: activeStore.getState(),
      crewMemberId: contextMeta.crewMemberId || '',
      projectId: contextMeta.projectId || '',
    });

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
          send(client, { type: 'sync-ack', requestId: message.requestId || null, state: activeStore.getState() });
          return;
        }

        const result = activeStore.applyDifferentialBatch({ diffs });

        if (result.status === 'no-op') {
          send(client, { type: 'sync-ack', requestId: message.requestId || null, state: result.state });
          return;
        }

        broadcast(contextKey, {
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

      const result = activeStore.applyDifferential({
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

      broadcast(contextKey, {
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
      const contextClients = clientsByContext.get(contextKey);
      if (contextClients) {
        contextClients.delete(clientId);
        if (!contextClients.size) clientsByContext.delete(contextKey);
      }
    });
    socket.on('error', () => socket.destroy());

    return true;
  }

  return { handleUpgrade, _clients: clients, _clientsByContext: clientsByContext };
}
