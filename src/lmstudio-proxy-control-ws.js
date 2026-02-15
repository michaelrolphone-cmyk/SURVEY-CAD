// lmstudio-proxy-control-ws.js
// Drop-in WS control plane for LM Studio proxy clients.
// Requires: npm i ws
//
// Protocol expected from proxy client:
//  - Client connects to ws://SERVER/ws/lmproxy (or your path)
//  - Client sends: { type:"hello", client_id:"...", capabilities:{...}, ... }
//  - Server sends: { type:"chat"|"models"|"cancel", id:"...", body:{...} }
//
// Client sends back events: started, delta, done, error, models, cancelled.
//
// Usage:
//   const lmProxy = createLmProxyControlWsService({ path: "/ws/lmproxy", token: process.env.CONTROL_TOKEN });
//   server.on("upgrade", (req, socket, head) => {
//     if (lmProxy.canHandleUpgrade(req)) return lmProxy.handleUpgrade(req, socket, head);
//     // ... other services
//     socket.destroy();
//   });
//
//   // somewhere in your code:
//   const { message } = await lmProxy.requestChat({ body: { model, messages, stream:true }, onDelta: d => process.stdout.write(d) });

import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";

function now() { return Date.now(); }

function parseUrl(req) {
  // req.url is path + query only in Node http server
  return new URL(req.url, "http://ws.local");
}

function jsonTryParse(s) {
  try { return { ok: true, value: JSON.parse(s) }; }
  catch (e) { return { ok: false, error: e }; }
}

function wsSend(ws, obj) {
  if (!ws || ws.readyState !== ws.OPEN) return false;
  ws.send(JSON.stringify(obj));
  return true;
}

/**
 * createLmProxyControlWsService
 *
 * A WS endpoint that accepts proxy clients and offers a programmatic API
 * for your server to dispatch chat/models/cancel to those proxies.
 */
export function createLmProxyControlWsService({
  path = "/ws/lmproxy",
  token = "",                  // optional shared secret
  pingIntervalMs = 25_000,
  requestTimeoutMs = 120_000,
  selectClient = null,         // optional: (clientsArray) => clientId
  log = console
} = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 10 * 1024 * 1024 });

  /** client_id -> { ws, meta, lastSeen, isAlive } */
  const clients = new Map();

  /** requestId -> { clientId, resolve, reject, onDelta, timer, startedAt } */
  const inflight = new Map();

  let rrIndex = 0;

  function listClientIds() {
    return Array.from(clients.keys());
  }

  function pickClientId() {
    const ids = listClientIds();
    if (ids.length === 0) return null;

    if (typeof selectClient === "function") {
      const chosen = selectClient(ids.slice());
      if (chosen && clients.has(chosen)) return chosen;
    }

    // default: round-robin
    const id = ids[rrIndex % ids.length];
    rrIndex += 1;
    return id;
  }

  function authOk(req) {
    if (!token) return true;
    const url = parseUrl(req);
    const q = url.searchParams.get("token");
    const h = req.headers["x-control-token"];
    return (q && q === token) || (h && h === token);
  }

  function canHandleUpgrade(req) {
    const url = parseUrl(req);
    return url.pathname === path;
  }

  function handleUpgrade(req, socket, head) {
    if (!canHandleUpgrade(req)) return false;

    if (!authOk(req)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return true;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });

    return true;
  }

  function registerClient(clientId, ws, helloMsg = {}) {
    // If duplicate client_id connects, drop old one.
    const existing = clients.get(clientId);
    if (existing?.ws && existing.ws !== ws) {
      try { existing.ws.close(4000, "replaced"); } catch {}
    }

    ws.__clientId = clientId;
    ws.isAlive = true;

    clients.set(clientId, {
      ws,
      meta: helloMsg,
      lastSeen: now()
    });

    log.info?.(`[lmproxy] registered client_id=${clientId}`);
  }

  function unregisterClient(clientId, reason = "disconnect") {
    const entry = clients.get(clientId);
    if (!entry) return;
    clients.delete(clientId);

    // fail any inflight requests assigned to this client
    for (const [rid, inf] of inflight) {
      if (inf.clientId !== clientId) continue;
      clearTimeout(inf.timer);
      inflight.delete(rid);
      inf.reject(Object.assign(new Error(`lmproxy client disconnected (${reason})`), { code: "client_disconnected" }));
    }

    log.warn?.(`[lmproxy] unregistered client_id=${clientId} (${reason})`);
  }

  function onProxyMessage(ws, msg) {
    const clientId = ws.__clientId;

    // allow hello before client_id is set
    if (msg?.type === "hello") {
      const cid = String(msg.client_id || "").trim();
      if (!cid) {
        wsSend(ws, { type: "error", id: null, error: { message: "hello missing client_id" } });
        return;
      }
      registerClient(cid, ws, msg);
      wsSend(ws, { type: "hello_ack", client_id: cid, ts: now() });
      return;
    }

    // until hello arrives, ignore everything else
    if (!clientId) {
      wsSend(ws, { type: "error", id: msg?.id ?? null, error: { message: "must send hello first" } });
      return;
    }

    // update last seen
    const entry = clients.get(clientId);
    if (entry) entry.lastSeen = now();

    const type = String(msg?.type || "");

    if (type === "pong") {
      ws.isAlive = true;
      return;
    }

    if (type === "started" || type === "delta" || type === "done" || type === "error" || type === "models" || type === "cancelled" || type === "chunk") {
      const id = String(msg?.id || "");
      if (!id) return;

      const inf = inflight.get(id);

      // models responses are also correlated via id
      if (type === "models") {
        if (inf) {
          clearTimeout(inf.timer);
          inflight.delete(id);
          inf.resolve({ type: "models", ok: msg.ok !== false, data: msg.data, error: msg.error });
        }
        return;
      }

      if (!inf) {
        // Not necessarily an error; could be a late message after timeout.
        return;
      }

      if (type === "delta") {
        if (typeof inf.onDelta === "function") {
          const d = msg.delta;
          if (typeof d === "string" && d.length) inf.onDelta(d, msg);
        }
        return;
      }

      if (type === "done") {
        clearTimeout(inf.timer);
        inflight.delete(id);
        inf.resolve({
          message: msg.message ?? "",
          finish_reason: msg.finish_reason ?? null,
          usage: msg.usage ?? null,
          raw: msg.raw
        });
        return;
      }

      if (type === "error") {
        clearTimeout(inf.timer);
        inflight.delete(id);
        const e = Object.assign(new Error(msg?.error?.message || "lmproxy error"), {
          code: msg?.error?.code || "lmproxy_error",
          details: msg?.error
        });
        inf.reject(e);
        return;
      }

      if (type === "cancelled") {
        // cancellation is acknowledged; the inflight chat may still emit an Abort error
        return;
      }

      return;
    }

    // Unknown message type from proxy
    wsSend(ws, { type: "error", id: msg?.id ?? null, error: { message: `unknown proxy message type: ${type}` } });
  }

  // Attach WS server behavior
  wss.on("connection", (ws) => {
    ws.isAlive = true;

    ws.on("pong", () => { ws.isAlive = true; });

    ws.on("message", (data) => {
      const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
      const parsed = jsonTryParse(text);
      if (!parsed.ok) {
        wsSend(ws, { type: "error", id: null, error: { message: "bad_json" } });
        return;
      }
      try {
        onProxyMessage(ws, parsed.value);
      } catch (e) {
        wsSend(ws, { type: "error", id: parsed.value?.id ?? null, error: { message: e?.message || String(e) } });
      }
    });

    ws.on("close", () => {
      const cid = ws.__clientId;
      if (cid) unregisterClient(cid, "ws_close");
    });

    ws.on("error", () => {
      const cid = ws.__clientId;
      if (cid) unregisterClient(cid, "ws_error");
    });

    // ask for hello if client doesn't send immediately
    wsSend(ws, { type: "server_hello", want: ["hello"], ts: now() });
  });

  // heartbeat/ping
  const pingTimer = setInterval(() => {
    for (const [clientId, entry] of clients) {
      const ws = entry.ws;
      if (!ws || ws.readyState !== ws.OPEN) {
        unregisterClient(clientId, "dead_socket");
        continue;
      }

      if (ws.isAlive === false) {
        try { ws.terminate(); } catch {}
        unregisterClient(clientId, "no_pong");
        continue;
      }

      ws.isAlive = false;
      try { ws.ping(); } catch {}
      wsSend(ws, { type: "ping", ts: now() });
    }
  }, pingIntervalMs);

  function stop() {
    clearInterval(pingTimer);
    try { wss.close(); } catch {}
    // reject all inflight
    for (const [rid, inf] of inflight) {
      clearTimeout(inf.timer);
      inflight.delete(rid);
      inf.reject(Object.assign(new Error("lmproxy service stopped"), { code: "service_stopped" }));
    }
    clients.clear();
  }

  function ensureClient(clientId) {
    const id = clientId || pickClientId();
    if (!id) throw Object.assign(new Error("No lmproxy clients connected"), { code: "no_clients" });
    const entry = clients.get(id);
    if (!entry?.ws || entry.ws.readyState !== entry.ws.OPEN) {
      throw Object.assign(new Error(`lmproxy client not available: ${id}`), { code: "client_unavailable" });
    }
    return id;
  }

  function makeTimeout(id) {
    return setTimeout(() => {
      const inf = inflight.get(id);
      if (!inf) return;
      inflight.delete(id);
      inf.reject(Object.assign(new Error(`lmproxy request timeout (${requestTimeoutMs}ms)`), { code: "timeout" }));
    }, requestTimeoutMs);
  }

  async function requestModels({ clientId = null } = {}) {
    const cid = ensureClient(clientId);
    const entry = clients.get(cid);
    const id = randomUUID();

    return new Promise((resolve, reject) => {
      const timer = makeTimeout(id);
      inflight.set(id, { clientId: cid, resolve, reject, onDelta: null, timer, startedAt: now() });

      const ok = wsSend(entry.ws, { type: "models", id });
      if (!ok) {
        clearTimeout(timer);
        inflight.delete(id);
        reject(Object.assign(new Error("failed to send models request"), { code: "send_failed" }));
      }
    });
  }

  async function requestChat({ clientId = null, body, onDelta } = {}) {
    const cid = ensureClient(clientId);
    const entry = clients.get(cid);
    const id = String(body?.id || randomUUID()); // allow caller to force id if desired

    return new Promise((resolve, reject) => {
      const timer = makeTimeout(id);
      inflight.set(id, { clientId: cid, resolve, reject, onDelta, timer, startedAt: now() });

      const ok = wsSend(entry.ws, { type: "chat", id, body });
      if (!ok) {
        clearTimeout(timer);
        inflight.delete(id);
        reject(Object.assign(new Error("failed to send chat request"), { code: "send_failed" }));
      }
    });
  }

  function cancel({ clientId = null, id }) {
    if (!id) return false;
    const cid = ensureClient(clientId);
    const entry = clients.get(cid);
    return wsSend(entry.ws, { type: "cancel", id });
  }

  return {
    // upgrade-chain hooks
    path,
    canHandleUpgrade,
    handleUpgrade,

    // runtime API
    stop,
    listClientIds,
    requestModels,
    requestChat,
    cancel,

    // optional debug info
    _clients: clients,
    _inflight: inflight
  };
}
