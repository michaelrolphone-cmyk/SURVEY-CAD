// worker-task-ws.js
import { createHash, randomUUID } from 'node:crypto';

/**
 * Protocol (text JSON frames)
 *
 * Server -> Worker
 *  - { type:'welcome', workerId, poolId, heartbeatMs, ackTimeoutMs, now }
 *  - { type:'ping', seq, at }
 *  - { type:'task', taskId, kind, payload, attempt, timeoutMs, createdAt }
 *  - { type:'cancel-task', taskId, reason }
 *  - { type:'drain', enabled } // optional: tells worker to stop accepting new tasks (server still decides assignment)
 *
 * Worker -> Server
 *  - { type:'hello', workerId?, name?, concurrency?, capabilities? }
 *  - { type:'pong', seq, at }
 *  - { type:'task-accepted', taskId, at? }
 *  - { type:'task-progress', taskId, progress, meta?, at? }
 *  - { type:'task-complete', taskId, result, at? }
 *  - { type:'task-failed', taskId, error, retryable?, at? }
 *  - { type:'status', metrics? } // optional
 */

/* ----------------------------- WS framing ----------------------------- */

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
    for (let i = 0; i < payloadLen; i++) payload[i] = buffer[offset + i] ^ mask[i % 4];
    return { opcode, payload };
  }

  if (buffer.length < offset + payloadLen) return null;
  return { opcode, payload: buffer.subarray(offset, offset + payloadLen) };
}

function decodeNextFrame(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 2) return null;
  const second = buffer[1];
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

  if (masked) offset += 4;
  const totalLength = offset + payloadLen;
  if (buffer.length < totalLength) return null;

  const frame = decodeFrame(buffer.subarray(0, totalLength));
  if (!frame) return null;
  return { ...frame, consumed: totalLength };
}

function encodeTextFrame(text) {
  const payload = Buffer.from(String(text), 'utf8');
  const len = payload.length;
  if (len < 126) return Buffer.concat([Buffer.from([0x81, len]), payload]);

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

/* ----------------------------- scheduler ------------------------------ */

const DEFAULTS = {
  path: '/ws/worker',
  heartbeatMs: 15_000,
  offlineAfterMs: 45_000,      // if no message within this, consider offline
  ackTimeoutMs: 10_000,        // worker must accept task quickly
  sweepMs: 1_000,              // scheduler/timeout sweep interval
  maxQueue: 50_000,            // safety
  defaultTaskTimeoutMs: 5 * 60_000,
  defaultMaxAttempts: 2,
  // When a worker disconnects mid-task: requeue if attempts remain, else fail
  requeueOnDisconnect: true,
  // If a task times out while running: requeue if attempts remain, else fail
  requeueOnTimeout: true,
};

function clampInt(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  const i = Math.trunc(v);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function safeJsonParse(buf) {
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    return null;
  }
}

function nowMs() {
  return Date.now();
}

export function createWorkerTaskService(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const pools = new Map(); // poolId -> pool

  function getOrCreatePool(poolId) {
    const id = String(poolId || 'default');
    if (!pools.has(id)) {
      pools.set(id, {
        id,
