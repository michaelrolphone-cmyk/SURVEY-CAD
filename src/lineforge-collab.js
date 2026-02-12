import { createHash, randomUUID } from 'node:crypto';

const USER_COLORS = ['#ff4d4f', '#40a9ff', '#73d13d', '#9254de', '#fa8c16', '#13c2c2', '#eb2f96', '#fadb14'];

function decodeFrame(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 2) return null;
  const first = buffer[0];
  const second = buffer[1];
  const opcode = first & 0x0f;
  const masked = (second & 0x80) !== 0;
  let payloadLen = second & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buffer.length < offset + 2) return null;
    payloadLen = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLen === 127) {
    if (buffer.length < offset + 8) return null;
    const value = Number(buffer.readBigUInt64BE(offset));
    if (!Number.isSafeInteger(value)) return null;
    payloadLen = value;
    offset += 8;
  }

  if (masked) {
    if (buffer.length < offset + 4) return null;
    const mask = buffer.subarray(offset, offset + 4);
    offset += 4;
    if (buffer.length < offset + payloadLen) return null;
    const payload = Buffer.allocUnsafe(payloadLen);
    for (let i = 0; i < payloadLen; i++) {
      payload[i] = buffer[offset + i] ^ mask[i % 4];
    }
    return { opcode, payload };
  }

  if (buffer.length < offset + payloadLen) return null;
  return { opcode, payload: buffer.subarray(offset, offset + payloadLen) };
}

function encodeTextFrame(text) {
  const payload = Buffer.from(String(text), 'utf8');
  const len = payload.length;
  if (len < 126) {
    return Buffer.concat([Buffer.from([0x81, len]), payload]);
  }
  if (len < 65536) {
    const header = Buffer.allocUnsafe(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
    return Buffer.concat([header, payload]);
  }
  const header = Buffer.allocUnsafe(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(len), 2);
  return Buffer.concat([header, payload]);
}

function createWebSocketAccept(secWebSocketKey) {
  return createHash('sha1')
    .update(`${secWebSocketKey}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`, 'utf8')
    .digest('base64');
}

export function createLineforgeCollabService() {
  const rooms = new Map();

  function getOrCreateRoom(roomId) {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        latestState: null,
        revision: 0,
        locks: new Map(),
        clients: new Map(),
      });
    }
    return rooms.get(roomId);
  }

  function send(client, payload) {
    if (!client.socket.writable) return;
    client.socket.write(encodeTextFrame(JSON.stringify(payload)));
  }

  function broadcast(room, payload, excludeClientId = null) {
    for (const peer of room.clients.values()) {
      if (peer.id === excludeClientId) continue;
      send(peer, payload);
    }
  }

  function handleUpgrade(req, socket, head = Buffer.alloc(0)) {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname !== '/ws/lineforge') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return false;
    }

    if (req.headers.upgrade?.toLowerCase() !== 'websocket') {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return false;
    }

    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return false;
    }

    const roomId = String(url.searchParams.get('room') || 'default');
    const room = getOrCreateRoom(roomId);
    const clientId = randomUUID();
    const color = USER_COLORS[room.clients.size % USER_COLORS.length];
    const client = { id: clientId, color, socket };
    room.clients.set(clientId, client);

    const responseHeaders = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${createWebSocketAccept(key)}`,
      '\r\n',
    ];
    socket.write(responseHeaders.join('\r\n'));

    if (head.length) {
      const frame = decodeFrame(head);
      if (frame?.opcode === 0x8) socket.end();
    }

    const peers = Array.from(room.clients.values())
      .filter((peer) => peer.id !== clientId)
      .map((peer) => ({ clientId: peer.id, color: peer.color }));

    send(client, {
      type: 'welcome',
      clientId,
      color,
      peers,
      state: room.latestState,
      revision: room.revision,
      locks: Array.from(room.locks.values()).map((lock) => ({
        entityType: lock.entityType,
        entityId: lock.entityId,
        ownerClientId: lock.ownerClientId,
        ownerColor: lock.ownerColor,
      })),
    });

    broadcast(room, { type: 'peer-joined', clientId, color }, clientId);

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

      if (message?.type === 'cursor' && message.cursor) {
        broadcast(room, {
          type: 'cursor',
          clientId,
          color,
          cursor: {
            x: Number(message.cursor.x) || 0,
            y: Number(message.cursor.y) || 0,
          },
          at: Date.now(),
        }, clientId);
        return;
      }

      if (message?.type === 'state' && message.state) {
        const baseRevision = Number(message.baseRevision);
        if (!Number.isInteger(baseRevision) || baseRevision !== room.revision) {
          send(client, {
            type: 'state-rejected',
            requestId: message.requestId || null,
            reason: 'revision-mismatch',
            expectedRevision: room.revision,
            state: room.latestState,
            revision: room.revision,
            at: Date.now(),
          });
          return;
        }

        room.latestState = message.state;
        room.revision += 1;

        send(client, {
          type: 'state-ack',
          requestId: message.requestId || null,
          revision: room.revision,
          state: room.latestState,
          at: Date.now(),
        });

        broadcast(room, {
          type: 'state',
          clientId,
          state: message.state,
          revision: room.revision,
          requestId: message.requestId || null,
          at: Date.now(),
        }, clientId);
        return;
      }


      if (message?.type === 'lock-request' && message.entityType && message.entityId) {
        const entityType = message.entityType === 'point' ? 'point' : message.entityType === 'line' ? 'line' : null;
        const entityId = String(message.entityId || '').trim();
        if (!entityType || !entityId) {
          send(client, {
            type: 'lock-denied',
            requestId: message.requestId || null,
            reason: 'invalid-entity',
            at: Date.now(),
          });
          return;
        }

        const lockKey = `${entityType}:${entityId}`;
        const existing = room.locks.get(lockKey);
        if (existing && existing.ownerClientId !== clientId) {
          send(client, {
            type: 'lock-denied',
            requestId: message.requestId || null,
            reason: 'already-locked',
            entityType,
            entityId,
            ownerClientId: existing.ownerClientId,
            ownerColor: existing.ownerColor,
            at: Date.now(),
          });
          return;
        }

        const lock = {
          entityType,
          entityId,
          ownerClientId: clientId,
          ownerColor: color,
          at: Date.now(),
        };
        room.locks.set(lockKey, lock);

        send(client, {
          type: 'lock-granted',
          requestId: message.requestId || null,
          entityType,
          entityId,
          ownerClientId: clientId,
          ownerColor: color,
          at: Date.now(),
        });

        broadcast(room, {
          type: 'lock-updated',
          action: 'locked',
          entityType,
          entityId,
          ownerClientId: clientId,
          ownerColor: color,
          at: Date.now(),
        }, clientId);
        return;
      }

      if (message?.type === 'lock-release' && message.entityType && message.entityId) {
        const entityType = message.entityType === 'point' ? 'point' : message.entityType === 'line' ? 'line' : null;
        const entityId = String(message.entityId || '').trim();
        if (!entityType || !entityId) return;

        const lockKey = `${entityType}:${entityId}`;
        const existing = room.locks.get(lockKey);
        if (!existing || existing.ownerClientId !== clientId) return;

        room.locks.delete(lockKey);
        broadcast(room, {
          type: 'lock-updated',
          action: 'released',
          entityType,
          entityId,
          ownerClientId: clientId,
          ownerColor: color,
          at: Date.now(),
        });
        return;
      }

      if (message?.type === 'ar-presence' && message.presence) {
        const presence = message.presence;
        const projected = {
          type: 'ar-presence',
          clientId,
          color,
          presence: {
            x: Number(presence.x),
            y: Number(presence.y),
            lat: Number(presence.lat),
            lon: Number(presence.lon),
            altFeet: Number(presence.altFeet),
            headingRad: Number(presence.headingRad),
            pitchRad: Number(presence.pitchRad),
            rollRad: Number(presence.rollRad),
          },
          at: Date.now(),
        };
        if (!Number.isFinite(projected.presence.x)) delete projected.presence.x;
        if (!Number.isFinite(projected.presence.y)) delete projected.presence.y;
        if (!Number.isFinite(projected.presence.lat)) delete projected.presence.lat;
        if (!Number.isFinite(projected.presence.lon)) delete projected.presence.lon;
        if (!Number.isFinite(projected.presence.altFeet)) delete projected.presence.altFeet;
        if (!Number.isFinite(projected.presence.headingRad)) delete projected.presence.headingRad;
        if (!Number.isFinite(projected.presence.pitchRad)) delete projected.presence.pitchRad;
        if (!Number.isFinite(projected.presence.rollRad)) delete projected.presence.rollRad;
        broadcast(room, projected, clientId);
      }
    });

    socket.on('close', () => {
      room.clients.delete(clientId);

      const releasedLocks = [];
      for (const [lockKey, lock] of room.locks.entries()) {
        if (lock.ownerClientId === clientId) {
          room.locks.delete(lockKey);
          releasedLocks.push(lock);
        }
      }

      broadcast(room, { type: 'peer-left', clientId }, clientId);
      releasedLocks.forEach((lock) => {
        broadcast(room, {
          type: 'lock-updated',
          action: 'released',
          entityType: lock.entityType,
          entityId: lock.entityId,
          ownerClientId: clientId,
          ownerColor: lock.ownerColor,
          at: Date.now(),
        }, clientId);
      });

      if (room.clients.size === 0) rooms.delete(roomId);
    });

    socket.on('error', () => {
      socket.destroy();
    });

    return true;
  }

  return {
    handleUpgrade,
    _rooms: rooms,
    _internals: { decodeFrame, encodeTextFrame, createWebSocketAccept },
  };
}

export const lineforgeCollabInternals = { decodeFrame, encodeTextFrame, createWebSocketAccept, USER_COLORS };
