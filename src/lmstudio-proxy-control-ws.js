// lmproxy-hub-ws.js
// npm i ws
//
// This WS hub allows BOTH:
//  - proxy clients (lmstudio-proxy-client.js) to connect and register
//  - browser UI clients ("Marks") to send chat/models/cancel, which are forwarded to a proxy
//
// Path stays /ws/lmproxy so your HTML can connect to the same endpoint.
//
// Expected HELLO:
//  Proxy sends: {type:"hello", client_id, capabilities:{...}, ...}
//  UI sends:    {type:"hello", client_id:"marks-ui", role:"ui"}
//
// UI commands:
//  {type:"chat", id, body:{messages:[...], temperature, max_tokens, stream, model?}}
//  {type:"models", id}
//  {type:"cancel", id}
//
// Proxy events forwarded back to UI by matching id:
//  started / delta / chunk / done / error / models / cancelled

import { WebSocketServer } from "ws";

function parseUrl(req) {
  return new URL(req.url, "http://ws.local");
}
function safeJsonParse(s) {
  try { return { ok: true, value: JSON.parse(s) }; }
  catch (e) { return { ok: false, error: e }; }
}
function wsSend(ws, obj) {
  if (!ws || ws.readyState !== ws.OPEN) return false;
  ws.send(JSON.stringify(obj));
  return true;
}

export function createLmProxyHubWsService({
  path = "/ws/lmproxy",
  token = "",
  pingIntervalMs = 25_000,
  requestTimeoutMs = 120_000,
  log = console
} = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 10 * 1024 * 1024 });

  // proxyId -> { ws, hello, lastSeen }
  const proxies = new Map();

  // uiId -> { ws, hello, lastSeen }
  const uis = new Map();

  // requestId -> { uiWs, proxyId, timer }
  const inflight = new Map();

  let rr = 0;

  function authOk(req) {
    if (!token) return true;
    const url = parseUrl(req);
    const q = url.searchParams.get("token");
    const h = req.headers["x-control-token"];
    return (q && q === token) || (h && h === token);
  }

  function canHandleUpgrade(req) {
    return parseUrl(req).pathname === path;
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

  function listProxyIds() {
    return Array.from(proxies.keys());
  }

  function pickProxyId() {
    const ids = listProxyIds();
    if (ids.length === 0) return null;
    const id = ids[rr % ids.length];
    rr += 1;
    return id;
  }

  function registerProxy(clientId, ws, hello) {
    // Replace old if duplicate
    const existing = proxies.get(clientId);
    if (existing?.ws && existing.ws !== ws) {
      try { existing.ws.close(4000, "replaced"); } catch {}
    }

    ws.__role = "proxy";
    ws.__id = clientId;
    ws.isAlive = true;

    proxies.set(clientId, { ws, hello, lastSeen: Date.now() });
    log.info?.(`[lmproxy-hub] proxy registered ${clientId}`);
  }

  function registerUi(clientId, ws, hello) {
    const existing = uis.get(clientId);
    if (existing?.ws && existing.ws !== ws) {
      try { existing.ws.close(4000, "replaced"); } catch {}
    }

    ws.__role = "ui";
    ws.__id = clientId;
    ws.isAlive = true;

    uis.set(clientId, { ws, hello, lastSeen: Date.now() });
    log.info?.(`[lmproxy-hub] ui registered ${clientId}`);
  }

  function unregister(ws, reason) {
    const role = ws.__role;
    const id = ws.__id;

    if (role === "proxy" && id) {
      proxies.delete(id);

      // Fail any inflight requests assigned to this proxy
      for (const [rid, inf] of inflight) {
        if (inf.proxyId !== id) continue;
        clearTimeout(inf.timer);
        inflight.delete(rid);
        wsSend(inf.uiWs, { type: "error", id: rid, error: { message: `proxy_disconnected:${reason}` } });
      }

      log.warn?.(`[lmproxy-hub] proxy unregistered ${id} (${reason})`);
    }

    if (role === "ui" && id) {
      uis.delete(id);

      // Cancel any inflight owned by this UI
      for (const [rid, inf] of inflight) {
        if (inf.uiWs !== ws) continue;
        clearTimeout(inf.timer);
        inflight.delete(rid);
        const p = proxies.get(inf.proxyId)?.ws;
        if (p) wsSend(p, { type: "cancel", id: rid });
      }

      log.warn?.(`[lmproxy-hub] ui unregistered ${id} (${reason})`);
    }
  }

  function setInflight(id, uiWs, proxyId) {
    const timer = setTimeout(() => {
      const inf = inflight.get(id);
      if (!inf) return;
      inflight.delete(id);
      wsSend(uiWs, { type: "error", id, error: { message: `timeout:${requestTimeoutMs}ms` } });
      const p = proxies.get(proxyId)?.ws;
      if (p) wsSend(p, { type: "cancel", id });
    }, requestTimeoutMs);

    inflight.set(id, { uiWs, proxyId, timer });
  }

  function clearInflight(id) {
    const inf = inflight.get(id);
    if (!inf) return;
    clearTimeout(inf.timer);
    inflight.delete(id);
  }

  function handleHello(ws, msg) {
    const clientId = String(msg?.client_id || "").trim();
    if (!clientId) {
      wsSend(ws, { type: "error", id: null, error: { message: "hello missing client_id" } });
      return;
    }

    const role = String(msg?.role || "").toLowerCase();

    // Classify:
    // - explicit role:"ui" => UI
    // - presence of capabilities.chat/models etc => proxy
    // - otherwise default proxy
    const looksProxy = !!msg?.capabilities || !!msg?.lm_base_url;

    if (role === "ui") registerUi(clientId, ws, msg);
    else if (looksProxy) registerProxy(clientId, ws, msg);
    else registerProxy(clientId, ws, msg);

    wsSend(ws, { type: "hello_ack", client_id: clientId, role: ws.__role, ts: Date.now() });
  }

  function handleUiCommand(ws, msg) {
    const type = String(msg?.type || "");
    const id = String(msg?.id || "");

    // Keepalive helpers
    if (type === "ping") { wsSend(ws, { type: "pong", ts: Date.now() }); return; }
    if (type === "pong") return;
    if (type === "hello") { wsSend(ws, { type:"hello_ack", ts:Date.now() }); return; }

    if (!id && (type === "chat" || type === "models" || type === "cancel")) {
      wsSend(ws, { type: "error", id: null, error: { message: "missing id" } });
      return;
    }

    const proxyId = pickProxyId();
    if (!proxyId) {
      wsSend(ws, { type: "error", id, error: { message: "no_proxy_clients_connected" } });
      return;
    }

    const proxyWs = proxies.get(proxyId)?.ws;
    if (!proxyWs || proxyWs.readyState !== proxyWs.OPEN) {
      wsSend(ws, { type: "error", id, error: { message: "proxy_unavailable" } });
      return;
    }

    if (type === "models") {
      setInflight(id, ws, proxyId);
      wsSend(proxyWs, { type: "models", id });
      return;
    }

    if (type === "cancel") {
      // forward cancel; do not require inflight to exist
      wsSend(proxyWs, { type: "cancel", id });
      return;
    }

    if (type === "chat") {
      const body = msg?.body;
      if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
        wsSend(ws, { type: "error", id, error: { message: "chat missing body.messages[]" } });
        return;
      }
      setInflight(id, ws, proxyId);
      wsSend(proxyWs, { type: "chat", id, body });
      return;
    }

    wsSend(ws, { type: "error", id: id || null, error: { message: `unknown_ui_type:${type}` } });
  }

  function handleProxyEvent(ws, msg) {
    const type = String(msg?.type || "");
    const id = String(msg?.id || "");

    // Keepalive helpers
    if (type === "ping") { wsSend(ws, { type: "pong", ts: Date.now() }); return; }
    if (type === "pong") return;

    // If proxy sends models response (correlated by id), forward to UI
    if (!id) return;

    const inf = inflight.get(id);
    if (!inf) {
      // Late/no-owner message; ignore
      return;
    }

    // Forward as-is to UI
    wsSend(inf.uiWs, msg);

    if (type === "done" || type === "error" || type === "models") {
      clearInflight(id);
    }
  }

  wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.__role = null;
    ws.__id = null;

    ws.on("pong", () => { ws.isAlive = true; });

    ws.on("message", (data) => {
      const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
      const parsed = safeJsonParse(text);
      if (!parsed.ok) {
        wsSend(ws, { type: "error", id: null, error: { message: "bad_json" } });
        return;
      }

      const msg = parsed.value;
      const type = String(msg?.type || "");

      // Require hello first
      if (!ws.__role) {
        if (type === "hello") return handleHello(ws, msg);
        wsSend(ws, { type: "error", id: msg?.id ?? null, error: { message: "must send hello first" } });
        return;
      }

      // Update lastSeen
      const entry = (ws.__role === "proxy") ? proxies.get(ws.__id) : uis.get(ws.__id);
      if (entry) entry.lastSeen = Date.now();

      if (ws.__role === "ui") return handleUiCommand(ws, msg);
      if (ws.__role === "proxy") return handleProxyEvent(ws, msg);

      wsSend(ws, { type: "error", id: msg?.id ?? null, error: { message: "unknown_role" } });
    });

    ws.on("close", () => unregister(ws, "close"));
    ws.on("error", () => unregister(ws, "error"));

    // Prompt hello
    wsSend(ws, { type: "server_hello", want: ["hello"], ts: Date.now() });
  });

  // Heartbeat (both roles)
  const pingTimer = setInterval(() => {
    for (const [, entry] of proxies) {
      const ws = entry.ws;
      if (!ws || ws.readyState !== ws.OPEN) continue;
      if (ws.isAlive === false) { try { ws.terminate(); } catch {} continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    }
    for (const [, entry] of uis) {
      const ws = entry.ws;
      if (!ws || ws.readyState !== ws.OPEN) continue;
      if (ws.isAlive === false) { try { ws.terminate(); } catch {} continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    }
  }, pingIntervalMs);

  function stop() {
    clearInterval(pingTimer);
    try { wss.close(); } catch {}
    for (const [rid, inf] of inflight) {
      clearTimeout(inf.timer);
      inflight.delete(rid);
      try { wsSend(inf.uiWs, { type: "error", id: rid, error: { message: "service_stopped" } }); } catch {}
    }
    proxies.clear();
    uis.clear();
  }

  return {
    path,
    canHandleUpgrade,
    handleUpgrade,
    stop,
    listProxyIds
  };
}
