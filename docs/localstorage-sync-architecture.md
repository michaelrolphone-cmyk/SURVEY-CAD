# LocalStorage Sync Data Flow (WebSocket + REST Fallback)

This document describes the current synchronization model used by SURVEY-CAD for browser-to-browser data sync via `localStorage` diffs.

## 1) State authority and transports

- The **server-side store** is authoritative for shared sync state (`version`, `snapshot`, `checksum`).
- Browsers connect to:
  - **WebSocket**: `GET /ws/localstorage-sync` for real-time differential sync.
  - **REST**: `GET/POST /api/localstorage-sync` for snapshot hydration and fallback reconciliation.

Relevant implementation files:

- Browser client sync engine: `src/browser-localstorage-sync.js`.
- WebSocket upgrade + broadcast service: `src/localstorage-sync-ws.js`.
- Store diff/checksum/version logic: `src/localstorage-sync-store.js`.
- Route wiring for REST + WebSocket services: `src/server.js`.

## 2) Browser write path (what happens when one tab changes localStorage)

1. Browser patches `Storage.prototype.setItem/removeItem/clear`.
2. For sync-eligible keys, it creates `set/remove/clear` operations.
3. Operations are batched briefly (`OPERATION_BATCH_DELAY_MS`) and queued.
4. Queue flush sends either:
   - `sync-differential` (single queued diff), or
   - `sync-differential-batch` (offline catch-up batch).
5. Client waits for server acknowledgement/broadcast before popping queue head.

## 3) Server apply + fan-out path

1. WebSocket service decodes message and calls store:
   - `applyDifferential` for single diff.
   - `applyDifferentialBatch` for batch.
2. Store validates checksum precondition (if `baseChecksum` provided), applies operations, increments version, computes new checksum.
3. Server broadcasts `sync-differential-applied` to **all** clients (including origin), including the resulting `state.version` and `state.checksum`.

## 4) Browser receive path (other tab updates)

1. Receiving tab gets `sync-differential-applied` from server.
2. If message is from another client, it applies operations to local `localStorage` under suppression mode.
3. Tab computes local checksum and compares with server checksum in message.
4. If mismatch, tab hydrates full server snapshot (`GET /api/localstorage-sync`) and rebases queued local diffs.

## 5) Bootstrapping and conflict handling

- On initial WebSocket connect, server sends `sync-welcome` with current state/checksum.
- If a browser has **no pending local edits** and checksum differs, it hydrates from server.
- **New browser with empty localStorage**: if the server snapshot is non-empty, checksums differ on `sync-welcome`, so the browser immediately fetches `GET /api/localstorage-sync` and hydrates from server. If the server snapshot is also empty (matching checksum), no hydrate call is needed.
- If a browser **has pending local edits** and checksum differs, it hydrates then rebases pending queue from server->local delta.
- If server rejects a diff with checksum mismatch, browser fetches snapshot and rebases queue.

## 6) Offline / reconnect behavior

- Browser persists queued diffs in `surveyfoundryLocalStoragePendingDiffs`.
- Reconnect uses exponential backoff; repeated pre-connect failures can enter dormant retry mode.
- While WebSocket is unavailable (but online), periodic HTTP fallback runs:
  - fetch server state,
  - push local snapshot via `POST /api/localstorage-sync` if local pending changes exist,
  - or hydrate from server if server checksum differs.

## 7) Sequence diagrams

### 7a) Initial state loading (bootstrap / first connect)

```text
Browser (new tab)          Server WS + Store
-----------------          -----------------
open page
  | start LocalStorageSocketSync
  | WebSocket connect --------------------------------------> |
  | <-------------------------- sync-welcome(state/checksum) |
  | compare local checksum vs server checksum
  | (new/empty localStorage tab usually mismatches when server has data)
  | if queue empty + checksum mismatch:
  |   GET /api/localstorage-sync ---------------------------> |
  | <---------------------------------------- snapshot/state |
  | apply server snapshot to localStorage
  | notify app via surveyfoundry-localstorage-sync event
  |
  | if queue has local edits + checksum mismatch:
  |   GET /api/localstorage-sync, apply snapshot,
  |   rebase queued diffs from server->local delta
```

### 7b) Live differential sync between browsers

```text
Browser A                 Server WS + Store                  Browser B
---------                 -----------------                  ---------
(setItem key=x)
  | patch Storage
  | enqueue op(set x)
  | flush -> sync-differential -----------------------------> |
  |                                                           | applyDifferential()
  |                                                           | version++, checksum'
  | <--------------------- sync-differential-applied -------- |
  | (origin ack: dequeue)                                     |
  |                                                           | ---------------------> sync-differential-applied
  |                                                           |                        (from A)
  |                                                           |                        apply op(set x)
  |                                                           |                        compute checksum
  |                                                           |                        if mismatch -> GET /api/localstorage-sync
```

## 8) Practical debugging checklist for "two browsers not syncing"

1. Verify both tabs are not opting out via `data-localstorage-sync-disabled`.
2. Confirm both tabs establish `WebSocket` to `/ws/localstorage-sync` (no 404/proxy path rewrite issues).
3. Confirm the changed keys are not internal excluded keys.
4. Inspect browser `localStorage` for queue growth in `surveyfoundryLocalStoragePendingDiffs` (indicates unsent/unacked diffs).
5. Check for repeated `sync-checksum-mismatch` events causing repeated rehydrate/rebase loops.
6. Confirm reverse proxy/load balancer preserves WebSocket upgrade headers.
7. If multiple app base paths are used, verify endpoint candidate resolution (`/ws/localstorage-sync` and `<base>/ws/localstorage-sync`) resolves consistently for both tabs.

