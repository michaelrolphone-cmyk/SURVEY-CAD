import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { createLmProxyHubWsService } from '../src/lmstudio-proxy-control-ws.js';

async function withHubService(options, run) {
  const hub = createLmProxyHubWsService({ pingIntervalMs: 60_000, ...options, log: {} });
  const server = createServer();
  const sockets = new Set();

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  server.on('upgrade', (req, socket, head) => {
    if (!hub.handleUpgrade(req, socket, head)) socket.destroy();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `ws://127.0.0.1:${port}/ws/lmproxy`;

  try {
    await run({ baseUrl });
  } finally {
    hub.stop();
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function connectClient(url) {
  const ws = await new Promise((resolve, reject) => {
    const candidate = new WebSocket(url);
    const onError = (err) => reject(err);
    candidate.once('error', onError);
    candidate.once('open', () => {
      candidate.off('error', onError);
      resolve(candidate);
    });
  });

  const queue = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString('utf8'));
    const waiter = waiters.shift();
    if (waiter) {
      waiter(msg);
      return;
    }
    queue.push(msg);
  });

  const next = (timeoutMs = 1_000) => new Promise((resolve, reject) => {
    if (queue.length) {
      resolve(queue.shift());
      return;
    }
    const timer = setTimeout(() => {
      const idx = waiters.indexOf(onMessage);
      if (idx >= 0) waiters.splice(idx, 1);
      reject(new Error(`timed out waiting for websocket message after ${timeoutMs}ms`));
    }, timeoutMs);

    function onMessage(msg) {
      clearTimeout(timer);
      resolve(msg);
    }

    waiters.push(onMessage);
  });

  const send = (payload) => ws.send(JSON.stringify(payload));

  const close = async () => {
    if (ws.readyState === ws.CLOSED) return;
    await new Promise((resolve) => {
      ws.once('close', resolve);
      ws.close();
    });
  };

  return { ws, next, send, close };
}

test('lmproxy hub emits timeout and cancel when requestTimeoutMs is configured', async () => {
  await withHubService({ requestTimeoutMs: 30 }, async ({ baseUrl }) => {
    const proxy = await connectClient(baseUrl);
    proxy.send({ type: 'hello', client_id: 'proxy-a', capabilities: { chat: true } });
    await proxy.next(); // hello_ack

    const ui = await connectClient(baseUrl);
    ui.send({ type: 'hello', client_id: 'marks-ui', role: 'ui' });
    await ui.next(); // hello_ack

    ui.send({
      type: 'chat',
      id: 'req-timeout',
      body: { stream: true, messages: [{ role: 'user', content: 'hello' }] },
    });

    const proxiedChat = await proxy.next();
    assert.equal(proxiedChat.type, 'chat');
    assert.equal(proxiedChat.id, 'req-timeout');

    const uiTimeout = await ui.next();
    assert.equal(uiTimeout.type, 'error');
    assert.equal(uiTimeout.id, 'req-timeout');
    assert.equal(uiTimeout.error?.message, 'timeout:30ms');

    const proxyCancel = await proxy.next();
    assert.equal(proxyCancel.type, 'cancel');
    assert.equal(proxyCancel.id, 'req-timeout');

    await ui.close();
    await proxy.close();
  });
});

test('lmproxy hub keeps long-running chats open when requestTimeoutMs is disabled', async () => {
  await withHubService({ requestTimeoutMs: 0 }, async ({ baseUrl }) => {
    const proxy = await connectClient(baseUrl);
    proxy.send({ type: 'hello', client_id: 'proxy-b', capabilities: { chat: true } });
    await proxy.next(); // hello_ack

    const ui = await connectClient(baseUrl);
    ui.send({ type: 'hello', client_id: 'marks-ui-2', role: 'ui' });
    await ui.next(); // hello_ack

    ui.send({
      type: 'chat',
      id: 'req-long',
      body: { stream: true, messages: [{ role: 'user', content: 'long run' }] },
    });

    const proxiedChat = await proxy.next();
    assert.equal(proxiedChat.type, 'chat');
    assert.equal(proxiedChat.id, 'req-long');

    await new Promise((resolve) => setTimeout(resolve, 80));

    proxy.send({ type: 'delta', id: 'req-long', delta: 'still running' });
    const delta = await ui.next();
    assert.equal(delta.type, 'delta');
    assert.equal(delta.id, 'req-long');

    proxy.send({ type: 'done', id: 'req-long', text: 'complete' });
    const done = await ui.next();
    assert.equal(done.type, 'done');
    assert.equal(done.id, 'req-long');

    await ui.close();
    await proxy.close();
  });
});
