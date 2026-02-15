// worker-scheduler-ws.js
import { createHash, randomUUID } from 'node:crypto';

/* ---------- minimal ws frame helpers ---------- */
function decodeFrame(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 2) return null;

  const first = buffer[0];
  const fin   = (first & 0x80) !== 0;
  const rsv1  = (first & 0x40) !== 0;
  const rsv2  = (first & 0x20) !== 0;
  const rsv3  = (first & 0x10) !== 0;
  const opcode = first & 0x0f;

  // Reject any frame using reserved bits (most common cause: permessage-deflate)
  if (rsv1 || rsv2 || rsv3) {
    console.warn(
      `Protocol error: frame with reserved bits set ` +
      `(RSV1=${rsv1}, RSV2=${rsv2}, RSV3=${rsv3}, opcode=0x${opcode.toString(16)}) ` +
      `— likely client sent compressed frame but extension not supported`
    );
    return null; // will trigger close in caller
  }

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

  if (masked) {
    if (buffer.length < offset + 4) return null;
    const mask = buffer.subarray(offset, offset + 4);
    offset += 4;
    if (buffer.length < offset + payloadLen) return null;

    const payload = Buffer.allocUnsafe(payloadLen);
    for (let i = 0; i < payloadLen; i++) {
      payload[i] = buffer[offset + i] ^ mask[i % 4];
    }
    return { fin, opcode, payload };
  }

  if (buffer.length < offset + payloadLen) return null;
  return { fin, opcode, payload: buffer.subarray(offset, offset + payloadLen) };
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

function safeJsonParse(buf) {
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    return null;
  }
}

/* --------------------------- worker scheduler --------------------------- */
export function createWorkerSchedulerService(opts = {}) {
  const PATH = String(opts.path || '/ws/worker');
  const OFFLINE_AFTER_MS = Number.isFinite(opts.offlineAfterMs) ? Number(opts.offlineAfterMs) : 30_000;
  const HEARTBEAT_MS = Number.isFinite(opts.heartbeatMs) ? Number(opts.heartbeatMs) : 10_000;

  const pools = new Map();

  function getOrCreatePool(poolId) {
    const id = String(poolId || 'default');
    if (!pools.has(id)) {
      pools.set(id, {
        id,
        workers: new Map(),
        queue: [],
        tasks: new Map(),
        rr: 0,
        pingSeq: 0,
      });
    }
    return pools.get(id);
  }

  function send(worker, payload) {
    const sock = worker?.socket;
    if (!sock || sock.destroyed || !sock.writable) return false;
    sock.write(encodeTextFrame(JSON.stringify(payload)));
    return true;
  }

  function isOnline(worker, at = Date.now()) {
    if (!worker || !worker.socket || worker.socket.destroyed) return false;
    return (at - worker.lastSeen) <= OFFLINE_AFTER_MS;
  }

  function workerCapacity(worker, at = Date.now()) {
    if (!isOnline(worker, at)) return 0;
    const c = worker.concurrency || 1;
    const used = worker.inFlight.size;
    return Math.max(0, c - used);
  }

  function pickWorker(pool) {
    const at = Date.now();
    const candidates = Array.from(pool.workers.values())
      .filter((w) => workerCapacity(w, at) > 0);
    if (!candidates.length) return null;
    pool.rr = (pool.rr + 1) >>> 0;
    return candidates[pool.rr % candidates.length] || candidates[0];
  }

  function pump(pool) {
    while (pool.queue.length) {
      const worker = pickWorker(pool);
      if (!worker) return;
      const taskId = pool.queue[0];
      const task = pool.tasks.get(taskId);
      pool.queue.shift();
      if (!task || task.status !== 'queued') continue;

      task.status = 'assigned';
      task.workerId = worker.id;
      task.assignedAt = Date.now();
      task.updatedAt = task.assignedAt;
      worker.inFlight.add(task.id);

      const ok = send(worker, {
        type: 'task',
        taskId: task.id,
        kind: task.kind,
        payload: task.payload,
        createdAt: task.createdAt,
      });

      if (!ok) {
        worker.lastSeen = 0;
        worker.inFlight.delete(task.id);
        task.status = 'queued';
        task.workerId = null;
        task.assignedAt = null;
        task.updatedAt = Date.now();
        pool.queue.unshift(task.id);
        return;
      }
    }
  }

  const heartbeatTimer = setInterval(() => {
    const at = Date.now();
    for (const pool of pools.values()) {
      pool.pingSeq = (pool.pingSeq + 1) >>> 0;
      for (const w of pool.workers.values()) {
        if (!w.socket || w.socket.destroyed) continue;
        if ((at - w.lastSeen) < Math.floor(HEARTBEAT_MS / 2)) continue;
        send(w, { type: 'ping', seq: pool.pingSeq, at });
      }
      pump(pool);
    }
  }, HEARTBEAT_MS);

  if (heartbeatTimer.unref) heartbeatTimer.unref();

  function submitTask(poolId, kind, payload = null) {
    const pool = getOrCreatePool(poolId);
    const id = randomUUID();
    const createdAt = Date.now();
    let resolve, reject;
    const p = new Promise((res, rej) => { resolve = res; reject = rej; });
    p.taskId = id;

    const task = {
      id,
      kind: String(kind || 'task'),
      payload,
      status: 'queued',
      workerId: null,
      createdAt,
      updatedAt: createdAt,
      assignedAt: null,
      finishedAt: null,
      _resolve: resolve,
      _reject: reject,
    };

    pool.tasks.set(id, task);
    pool.queue.push(id);
    pump(pool);
    return p;
  }

  function listWorkers(poolId = 'default') {
    const pool = getOrCreatePool(poolId);
    const at = Date.now();
    return Array.from(pool.workers.values()).map((w) => ({
      workerId: w.id,
      poolId: pool.id,
      name: w.name || null,
      concurrency: w.concurrency || 1,
      inFlight: w.inFlight.size,
      online: isOnline(w, at),
      lastSeen: w.lastSeen,
      capabilities: w.capabilities || null,
    }));
  }

  function getWorker(poolId, workerId) {
    const pool = getOrCreatePool(poolId);
    const w = pool.workers.get(String(workerId));
    if (!w) return null;
    const at = Date.now();
    return {
      workerId: w.id,
      poolId: pool.id,
      name: w.name || null,
      concurrency: w.concurrency || 1,
      inFlight: w.inFlight.size,
      online: isOnline(w, at),
      lastSeen: w.lastSeen,
      capabilities: w.capabilities || null,
    };
  }

  function handleUpgrade(req, socket, head = Buffer.alloc(0)) {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname.replace(/\/+$/, '');
    const expected = String(PATH).replace(/\/+$/, '');

    if (pathname !== expected) return false;

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

    const poolId = String(url.searchParams.get('pool') || 'default');
    const pool = getOrCreatePool(poolId);

    const responseHeaders = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${createWebSocketAccept(key)}`,
      '\r\n',
    ];
    socket.write(responseHeaders.join('\r\n'));

    socket.setTimeout(0);
    socket.setNoDelay(true);
    socket.setKeepAlive(true);

    const pending = {
      buffer: head.length ? Buffer.from(head) : Buffer.alloc(0),
      workerId: null,
      registered: false,
      decodeFailures: 0,
    };

    function registerWorker(msg) {
      const desiredId = msg?.workerId ? String(msg.workerId).trim() : '';
      const workerId = desiredId || randomUUID();

      const existing = pool.workers.get(workerId);
      if (existing && existing.socket && !existing.socket.destroyed) {
        try { existing.socket.destroy(); } catch {}
      }

      const worker = {
        id: workerId,
        name: msg?.name ? String(msg.name).slice(0, 120) : null,
        concurrency: Number.isFinite(msg?.concurrency) ? Math.max(1, Math.trunc(msg.concurrency)) : 1,
        capabilities: msg?.capabilities ?? null,
        socket,
        lastSeen: Date.now(),
        inFlight: new Set(),
      };

      pool.workers.set(workerId, worker);
      pending.workerId = workerId;
      pending.registered = true;

      send(worker, {
        type: 'welcome',
        workerId,
        poolId: pool.id,
        heartbeatMs: HEARTBEAT_MS,
        offlineAfterMs: OFFLINE_AFTER_MS,
        now: Date.now(),
      });

      pump(pool);
      return worker;
    }

    function getWorkerObj() {
      if (!pending.registered || !pending.workerId) return null;
      return pool.workers.get(pending.workerId) || null;
    }

    socket.on('data', (chunk) => {
      pending.buffer = pending.buffer.length
        ? Buffer.concat([pending.buffer, chunk])
        : Buffer.from(chunk);

      // First frame protection
      if (!pending.registered && pending.buffer.length >= 2) {
        const firstByte = pending.buffer[0];
        const fin = (firstByte & 0x80) !== 0;
        const opcode = firstByte & 0x0f;
        if (!fin || opcode !== 0x1) {
          console.warn(`Invalid first frame (fin=${fin}, opcode=0x${opcode.toString(16)})`);
          socket.destroy();
          return;
        }
      }

      while (pending.buffer.length >= 2) {
        const frame = decodeNextFrame(pending.buffer);
        if (!frame) {
          pending.decodeFailures++;
          if (pending.decodeFailures > 5 || pending.buffer.length > 8192) {
            console.warn(`Too many decode failures or buffer overflow → closing connection`);
            socket.destroy();
            return;
          }
          break;
        }

        pending.decodeFailures = 0;
        pending.buffer = pending.buffer.subarray(frame.consumed);

        if (frame.opcode === 0x8) { // close
          socket.end();
          return;
        }

        if (frame.opcode !== 0x1) {
          console.warn(`Unsupported opcode 0x${frame.opcode.toString(16)}`);
          continue;
        }

        const msg = safeJsonParse(frame.payload);
        if (!msg || typeof msg.type !== 'string') {
          console.warn('Invalid or non-string .type in JSON message');
          continue;
        }

        const at = Date.now();

        if (!pending.registered) {
          if (msg.type !== 'hello') continue;
          registerWorker(msg);
          continue;
        }

        const worker = getWorkerObj();
        if (!worker) continue;

        worker.lastSeen = at;

        if (msg.type === 'pong') continue;

        if (msg.type === 'hello') {
          if (msg.name) worker.name = String(msg.name).slice(0, 120);
          if (Number.isFinite(msg.concurrency)) {
            worker.concurrency = Math.max(1, Math.trunc(msg.concurrency));
          }
          if (msg.capabilities !== undefined) worker.capabilities = msg.capabilities;
          continue;
        }

        if (msg.type === 'task-result' && msg.taskId) {
          const taskId = String(msg.taskId);
          const task = pool.tasks.get(taskId);
          if (!task) continue;
          if (task.workerId !== worker.id) continue;

          task.status = msg.ok ? 'completed' : 'failed';
          task.finishedAt = at;
          task.updatedAt = at;
          worker.inFlight.delete(taskId);

          const resolve = task._resolve;
          const reject = task._reject;
          task._resolve = null;
          task._reject = null;

          if (msg.ok) {
            if (resolve) resolve(msg.result);
          } else {
            const err = new Error(msg.error?.message || msg.error || 'task failed');
            err.details = msg.error;
            if (reject) reject(err);
          }

          pump(pool);
        }
      }
    });

    socket.on('close', () => {
      const worker = getWorkerObj();
      if (!worker) return;

      for (const taskId of worker.inFlight) {
        const task = pool.tasks.get(taskId);
        if (!task) continue;
        task.status = 'queued';
        task.workerId = null;
        task.assignedAt = null;
        task.updatedAt = Date.now();
        pool.queue.unshift(task.id);
      }

      pool.workers.delete(worker.id);
      pump(pool);
    });

    socket.on('error', () => {
      try { socket.destroy(); } catch {}
    });

    return true;
  }

  return {
    handleUpgrade,
    submitTask,
    listWorkers,
    getWorker,
    _pools: pools,
    _internals: { decodeFrame, encodeTextFrame, createWebSocketAccept, PATH, HEARTBEAT_MS, OFFLINE_AFTER_MS },
  };
}

// optional named exports
export { decodeFrame, encodeTextFrame, createWebSocketAccept };
