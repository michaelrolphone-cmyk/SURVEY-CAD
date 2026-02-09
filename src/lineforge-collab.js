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
        room.latestState = message.state;
        broadcast(room, {
          type: 'state',
          clientId,
          state: message.state,
          at: Date.now(),
        }, clientId);
      }
    });

    socket.on('close', () => {
      room.clients.delete(clientId);
      broadcast(room, { type: 'peer-left', clientId }, clientId);
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
