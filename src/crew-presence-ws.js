import { randomUUID } from 'node:crypto';
import { lineforgeCollabInternals } from './lineforge-collab.js';

const { decodeFrame, encodeTextFrame, createWebSocketAccept } = lineforgeCollabInternals;

/**
 * WebSocket service that tracks which crew members are currently online.
 * Clients identify themselves with a crewMemberId after connecting.
 * The server broadcasts presence updates to all connected clients.
 */
export function createCrewPresenceWsService() {
  const clients = new Map();

  function getOnlineCrewMemberIds() {
    const ids = new Set();
    for (const client of clients.values()) {
      if (client.crewMemberId) ids.add(client.crewMemberId);
    }
    return [...ids];
  }

  function send(client, payload) {
    if (!client?.socket?.writable) return;
    client.socket.write(encodeTextFrame(JSON.stringify(payload)));
  }

  function broadcastPresence() {
    const online = getOnlineCrewMemberIds();
    const payload = { type: 'crew-presence-update', online };
    for (const client of clients.values()) {
      send(client, payload);
    }
  }

  function handleUpgrade(req, socket, head = Buffer.alloc(0)) {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname.replace(/\/+$/, '');
    if (pathname !== '/ws/crew-presence') return false;

    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return true;
    }

    const clientId = randomUUID();
    const client = { id: clientId, socket, crewMemberId: null };
    clients.set(clientId, client);

    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${createWebSocketAccept(key)}`,
      '\r\n',
    ].join('\r\n'));

    // Send current presence state to new client
    send(client, {
      type: 'crew-presence-welcome',
      clientId,
      online: getOnlineCrewMemberIds(),
    });

    if (head.length) {
      const frame = decodeFrame(head);
      if (frame?.opcode === 0x8) {
        socket.end();
        clients.delete(clientId);
        return true;
      }
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

      if (message?.type === 'crew-presence-identify') {
        const previousId = client.crewMemberId;
        client.crewMemberId = message.crewMemberId || null;
        if (previousId !== client.crewMemberId) {
          broadcastPresence();
        }
      }
    });

    socket.on('close', () => {
      const hadIdentity = !!clients.get(clientId)?.crewMemberId;
      clients.delete(clientId);
      if (hadIdentity) broadcastPresence();
    });

    socket.on('error', () => {
      socket.destroy();
    });

    return true;
  }

  return { handleUpgrade, getOnlineCrewMemberIds, _clients: clients };
}
