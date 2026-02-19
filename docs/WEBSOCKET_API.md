# SURVEY-CAD WebSocket API Reference

> **Base URL:** `ws://<host>:<port>` (default `ws://0.0.0.0:3000`)

All WebSocket endpoints use the HTTP Upgrade mechanism on the same port as the REST API. Messages are JSON-encoded text frames unless otherwise noted.

---

## Table of Contents

- [Connection Overview](#connection-overview)
- [1. LineForge Collaboration (`/ws/lineforge`)](#1-lineforge-collaboration-wslineforge)
- [2. LocalStorage Sync (`/ws/localstorage-sync`)](#2-localstorage-sync-wslocalstorage-sync)
- [3. Crew Presence (`/ws/crew-presence`)](#3-crew-presence-wscrew-presence)
- [4. Worker Task Scheduler (`/ws/worker`)](#4-worker-task-scheduler-wsworker)
- [5. LM Proxy Hub (`/ws/lmproxy`)](#5-lm-proxy-hub-wslmproxy)

---

## Connection Overview

| Path | Purpose | Auth | Query Params |
|------|---------|------|-------------|
| `/ws/lineforge` | Real-time collaborative drawing, cursors, locks, AR | None | `room` (default: `"default"`) |
| `/ws/localstorage-sync` | Differential key-value state synchronization | None | None |
| `/ws/crew-presence` | Online crew member tracking | None | None |
| `/ws/worker` | Distributed task queue for background workers | None | `pool` (default: `"default"`) |
| `/ws/lmproxy` | LM Studio proxy hub for AI chat relay | Optional token | `token` (or `x-control-token` header) |

**Connection Requirements:**
- Standard WebSocket upgrade with `Sec-WebSocket-Key` header
- `Upgrade: websocket` header required
- Unrecognized paths return `HTTP/1.1 404 Not Found`

---

## 1. LineForge Collaboration (`/ws/lineforge`)

Real-time multi-user collaboration service for the LineSmith drawing application. Supports live cursor broadcasting, optimistic-concurrency state sync, entity locking, and AR presence tracking.

### Connection

```
ws://<host>:<port>/ws/lineforge?room=<roomId>
```

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `room` | `string` | `"default"` | Collaboration room identifier |

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| Lock timeout | 5 minutes | Stale locks are auto-released |
| Lock sweep interval | 1 minute | How often stale locks are checked |
| User colors | 8 colors | Cycled through for each new client in a room |

**User Color Palette:**

| Index | Color |
|-------|-------|
| 0 | `#ff4d4f` (red) |
| 1 | `#40a9ff` (blue) |
| 2 | `#73d13d` (green) |
| 3 | `#9254de` (purple) |
| 4 | `#fa8c16` (orange) |
| 5 | `#13c2c2` (cyan) |
| 6 | `#eb2f96` (pink) |
| 7 | `#fadb14` (yellow) |

### Server Messages

#### `welcome`

Sent immediately upon connection. Contains the full room state.

```json
{
  "type": "welcome",
  "clientId": "550e8400-e29b-41d4-a716-446655440000",
  "color": "#ff4d4f",
  "peers": [
    {
      "clientId": "peer-uuid",
      "color": "#40a9ff"
    }
  ],
  "state": { ... },
  "revision": 5,
  "locks": [
    {
      "entityType": "point",
      "entityId": "pt-42",
      "ownerClientId": "peer-uuid",
      "ownerColor": "#40a9ff"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `clientId` | `string` | UUID assigned to this connection |
| `color` | `string` | Hex color assigned to this client |
| `peers` | `Peer[]` | List of already-connected peers |
| `state` | `any \| null` | Latest room state (null if no state has been set) |
| `revision` | `integer` | Current state revision number |
| `locks` | `Lock[]` | Currently held entity locks |

#### `peer-joined`

Broadcast when a new peer connects to the room.

```json
{
  "type": "peer-joined",
  "clientId": "new-peer-uuid",
  "color": "#73d13d"
}
```

#### `peer-left`

Broadcast when a peer disconnects.

```json
{
  "type": "peer-left",
  "clientId": "departed-peer-uuid"
}
```

#### `cursor`

Broadcast of another peer's cursor position.

```json
{
  "type": "cursor",
  "clientId": "peer-uuid",
  "color": "#40a9ff",
  "cursor": {
    "x": 1500.5,
    "y": 2300.0
  },
  "crewMemberId": "crew-member-uuid",
  "crewName": "John Doe",
  "at": 1739664000000
}
```

| Field | Type | Description |
|-------|------|-------------|
| `cursor.x` | `number` | X coordinate in drawing space |
| `cursor.y` | `number` | Y coordinate in drawing space |
| `crewMemberId` | `string \| null` | Associated crew member ID |
| `crewName` | `string \| null` | Display name |
| `at` | `integer` | Server timestamp (ms since epoch) |

#### `state`

Broadcast when another peer successfully updates the room state.

```json
{
  "type": "state",
  "clientId": "peer-uuid",
  "state": { ... },
  "revision": 6,
  "requestId": "req-123",
  "at": 1739664000000
}
```

#### `state-ack`

Confirmation sent to the client that submitted a state update.

```json
{
  "type": "state-ack",
  "requestId": "req-123",
  "revision": 6,
  "state": { ... },
  "at": 1739664000000
}
```

#### `state-rejected`

Sent when a state update fails due to revision mismatch (optimistic concurrency conflict).

```json
{
  "type": "state-rejected",
  "requestId": "req-123",
  "reason": "revision-mismatch",
  "expectedRevision": 5,
  "state": { ... },
  "revision": 5,
  "at": 1739664000000
}
```

| Field | Type | Description |
|-------|------|-------------|
| `reason` | `string` | Always `"revision-mismatch"` |
| `expectedRevision` | `integer` | The revision the server expected |
| `state` | `any` | Current server state for re-merge |
| `revision` | `integer` | Current server revision |

#### `lock-granted`

Sent when an entity lock is successfully acquired.

```json
{
  "type": "lock-granted",
  "requestId": "req-456",
  "entityType": "point",
  "entityId": "pt-42",
  "ownerClientId": "your-client-id",
  "ownerColor": "#ff4d4f",
  "at": 1739664000000
}
```

#### `lock-denied`

Sent when a lock request is denied.

```json
{
  "type": "lock-denied",
  "requestId": "req-456",
  "reason": "already-locked",
  "entityType": "point",
  "entityId": "pt-42",
  "ownerClientId": "other-client-id",
  "ownerColor": "#40a9ff",
  "at": 1739664000000
}
```

| `reason` Value | Description |
|----------------|-------------|
| `"already-locked"` | Another client holds this lock |
| `"invalid-entity"` | Invalid entity type or empty entity ID |

#### `lock-updated`

Broadcast when any lock state changes (acquired, released, or timed out).

```json
{
  "type": "lock-updated",
  "action": "locked",
  "entityType": "point",
  "entityId": "pt-42",
  "ownerClientId": "client-uuid",
  "ownerColor": "#ff4d4f",
  "at": 1739664000000
}
```

| `action` Value | Trigger |
|----------------|---------|
| `"locked"` | A client acquired a lock |
| `"released"` | A client explicitly released a lock, disconnected, or the lock timed out |

When released due to timeout, an additional `reason` field is present:
```json
{
  "type": "lock-updated",
  "action": "released",
  "reason": "timeout",
  ...
}
```

#### `ar-presence`

Broadcast of another peer's AR (augmented reality) position.

```json
{
  "type": "ar-presence",
  "clientId": "peer-uuid",
  "color": "#40a9ff",
  "presence": {
    "x": 2766231.5,
    "y": 1123456.7,
    "lat": 43.6150,
    "lon": -116.2023,
    "altFeet": 2730.5,
    "headingRad": 1.5708,
    "pitchRad": 0.0,
    "rollRad": 0.0
  },
  "at": 1739664000000
}
```

All numeric fields in `presence` that are not finite numbers are omitted from the broadcast.

| Field | Type | Description |
|-------|------|-------------|
| `x` | `number?` | State-plane X coordinate |
| `y` | `number?` | State-plane Y coordinate |
| `lat` | `number?` | WGS 84 latitude |
| `lon` | `number?` | WGS 84 longitude |
| `altFeet` | `number?` | Altitude in feet |
| `headingRad` | `number?` | Compass heading in radians |
| `pitchRad` | `number?` | Device pitch in radians |
| `rollRad` | `number?` | Device roll in radians |

#### `pointforge-import`

Broadcast when a PointForge export is saved via the REST API and targets this room.

```json
{
  "type": "pointforge-import",
  "exportId": "pf-export-1739664000000-a1b2c3d4",
  "at": 1739664000000
}
```

### Client Messages

#### `cursor`

Broadcast your cursor position to all peers.

```json
{
  "type": "cursor",
  "cursor": {
    "x": 1500.5,
    "y": 2300.0
  },
  "crewMemberId": "optional-crew-id",
  "crewName": "Optional Name"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cursor` | `object` | Yes | Must contain numeric `x` and `y` |
| `cursor.x` | `number` | Yes | X coordinate |
| `cursor.y` | `number` | Yes | Y coordinate |
| `crewMemberId` | `string` | No | Associated crew member ID |
| `crewName` | `string` | No | Display name for the cursor |

#### `state`

Submit a state update using optimistic concurrency control.

```json
{
  "type": "state",
  "state": {
    "points": [ ... ],
    "lines": [ ... ],
    "labels": [ ... ]
  },
  "baseRevision": 5,
  "requestId": "req-123"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `state` | `any` | Yes | The new room state (replaces previous state entirely) |
| `baseRevision` | `integer` | Yes | Must match the server's current revision |
| `requestId` | `string` | No | Correlation ID for matching ack/reject |

**Concurrency Protocol:**
1. Client sends `state` with `baseRevision` matching the last known revision.
2. If `baseRevision` matches the server's current revision:
   - Server increments revision, stores new state.
   - Client receives `state-ack` with new revision.
   - All other peers receive `state` broadcast.
3. If `baseRevision` does NOT match:
   - Client receives `state-rejected` with current server state.
   - Client must re-merge and retry.

#### `lock-request`

Request an exclusive lock on a drawing entity.

```json
{
  "type": "lock-request",
  "entityType": "point",
  "entityId": "pt-42",
  "requestId": "req-456"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entityType` | `string` | Yes | `"point"` or `"line"` |
| `entityId` | `string` | Yes | Entity identifier (non-empty) |
| `requestId` | `string` | No | Correlation ID |

**Lock Key:** Internal key is `{entityType}:{entityId}`. Re-requesting a lock you already own refreshes it.

#### `lock-release`

Release a lock you currently hold.

```json
{
  "type": "lock-release",
  "entityType": "point",
  "entityId": "pt-42"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entityType` | `string` | Yes | `"point"` or `"line"` |
| `entityId` | `string` | Yes | Entity identifier |

Only the lock owner can release. Silently ignored if you don't own the lock. On release, a `lock-updated` with `action: "released"` is broadcast to all clients.

#### `ar-presence`

Broadcast your AR device position to all peers.

```json
{
  "type": "ar-presence",
  "presence": {
    "x": 2766231.5,
    "y": 1123456.7,
    "lat": 43.6150,
    "lon": -116.2023,
    "altFeet": 2730.5,
    "headingRad": 1.5708,
    "pitchRad": 0.0,
    "rollRad": 0.0
  }
}
```

All fields in `presence` are optional and independently validated as finite numbers.

### Disconnect Behavior

When a client disconnects:
1. All locks held by that client are automatically released.
2. `lock-updated` events with `action: "released"` are broadcast for each released lock.
3. A `peer-left` message is broadcast to remaining clients.
4. If the room has no remaining clients, it is garbage-collected.

---

## 2. LocalStorage Sync (`/ws/localstorage-sync`)

Differential key-value state synchronization service. Allows multiple browser tabs and devices to stay synchronized through operational transforms applied to a shared key-value store.

### Connection

```
ws://<host>:<port>/ws/localstorage-sync
```

No query parameters.

### Server Messages

#### `sync-welcome`

Sent immediately upon connection with the full current state.

```json
{
  "type": "sync-welcome",
  "clientId": "550e8400-e29b-41d4-a716-446655440000",
  "state": {
    "version": 42,
    "snapshot": {
      "surveyfoundryCrewProfiles": "[{\"id\":\"...\",\"firstName\":\"John\",...}]",
      "surveyfoundryEquipmentInventory": "[{...}]",
      "surveyfoundryEquipmentLogs": "[{...}]"
    },
    "checksum": "fnv1a-a1b2c3d4",
    "updatedAt": "2026-02-16T12:00:00.000Z"
  }
}
```

#### `sync-ack`

Acknowledgment when a differential update results in no actual change (`no-op`).

```json
{
  "type": "sync-ack",
  "requestId": "req-789",
  "state": {
    "version": 42,
    "snapshot": { ... },
    "checksum": "fnv1a-a1b2c3d4",
    "updatedAt": "2026-02-16T12:00:00.000Z"
  }
}
```

#### `sync-checksum-mismatch`

Sent when the client's `baseChecksum` does not match the server's current checksum.

```json
{
  "type": "sync-checksum-mismatch",
  "requestId": "req-789",
  "state": {
    "version": 42,
    "snapshot": { ... },
    "checksum": "fnv1a-a1b2c3d4",
    "updatedAt": "2026-02-16T12:00:00.000Z"
  }
}
```

The client should re-sync using the full state provided and retry.

#### `sync-differential-applied`

Broadcast to ALL connected clients (including the sender) when operations are successfully applied.

```json
{
  "type": "sync-differential-applied",
  "requestId": "req-789",
  "originClientId": "sender-client-uuid",
  "operations": [
    { "type": "set", "key": "surveyfoundryCrewProfiles", "value": "[{...}]" },
    { "type": "remove", "key": "tempKey" }
  ],
  "state": {
    "version": 43,
    "checksum": "fnv1a-b2c3d4e5"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `originClientId` | `string \| null` | The client that initiated the change (null for REST-originated changes) |
| `operations` | `Operation[]` | The normalized operations that were applied |
| `state.version` | `integer` | New version after applying |
| `state.checksum` | `string` | New checksum after applying |

### Client Messages

#### `sync-differential`

Apply a set of differential operations to the shared state.

```json
{
  "type": "sync-differential",
  "operations": [
    { "type": "set", "key": "myKey", "value": "myValue" },
    { "type": "remove", "key": "oldKey" },
    { "type": "clear" }
  ],
  "baseChecksum": "fnv1a-a1b2c3d4",
  "requestId": "req-789"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `operations` | `Operation[]` | Yes | Array of operations to apply |
| `baseChecksum` | `string` | No | Expected server checksum (for conflict detection; empty string to skip) |
| `requestId` | `string` | No | Correlation ID |

#### `sync-differential-batch`

Apply multiple differential operation sets in one message.

```json
{
  "type": "sync-differential-batch",
  "diffs": [
    {
      "operations": [
        { "type": "set", "key": "key1", "value": "val1" }
      ]
    },
    {
      "operations": [
        { "type": "set", "key": "key2", "value": "val2" }
      ]
    }
  ],
  "requestId": "req-790"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `diffs` | `Diff[]` | Yes | Array of differential objects, each containing an `operations` array |
| `requestId` | `string` | No | Correlation ID |

All operations across all diffs are flattened and applied atomically as a single version increment.

### Operation Types

```
Operation = SetOperation | RemoveOperation | ClearOperation
```

#### `set`

Set a key to a string value.

```json
{
  "type": "set",
  "key": "surveyfoundryCrewProfiles",
  "value": "[{\"id\":\"uuid\",\"firstName\":\"Jane\"}]"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | `string` | Yes | Storage key (non-empty) |
| `value` | `string` | Yes | Value to store (coerced to string) |

#### `remove`

Remove a key from the store.

```json
{
  "type": "remove",
  "key": "surveyfoundryCrewProfiles"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | `string` | Yes | Storage key to remove (non-empty) |

#### `clear`

Remove ALL keys from the store.

```json
{
  "type": "clear"
}
```

### Checksum Algorithm

The checksum uses FNV-1a 32-bit hashing on the canonicalized JSON of the sorted snapshot:

1. Sort snapshot keys alphabetically.
2. Clone all keys and values as strings.
3. `JSON.stringify()` the sorted object.
4. Apply FNV-1a (init: `2166136261`, XOR each char code, multiply with FNV prime via bit-shifts).
5. Output as: `fnv1a-{hex8}` (zero-padded 8-char hex).

### Well-Known Storage Keys

| Key | Contents |
|-----|----------|
| `surveyfoundryCrewProfiles` | JSON array of `CrewMember` objects |
| `surveyfoundryEquipmentInventory` | JSON array of `Equipment` objects |
| `surveyfoundryEquipmentLogs` | JSON array of `EquipmentLog` objects |

---

## 3. Crew Presence (`/ws/crew-presence`)

Tracks which crew members are currently connected and online. Clients identify with a `crewMemberId` after connecting.

### Connection

```
ws://<host>:<port>/ws/crew-presence
```

No query parameters.

### Server Messages

#### `crew-presence-welcome`

Sent immediately upon connection.

```json
{
  "type": "crew-presence-welcome",
  "clientId": "550e8400-e29b-41d4-a716-446655440000",
  "online": ["crew-member-id-1", "crew-member-id-2"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `clientId` | `string` | UUID assigned to this WebSocket connection |
| `online` | `string[]` | Deduplicated array of currently online crew member IDs |

#### `crew-presence-update`

Broadcast whenever the set of online crew members changes (join, leave, or identity change).

```json
{
  "type": "crew-presence-update",
  "online": ["crew-member-id-1", "crew-member-id-2", "crew-member-id-3"]
}
```

### Client Messages

#### `crew-presence-identify`

Associate this WebSocket connection with a crew member ID. Can be sent multiple times to change identity.

```json
{
  "type": "crew-presence-identify",
  "crewMemberId": "crew-member-uuid"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `crewMemberId` | `string` | Yes | Crew member ID to associate (falsy to de-identify) |

**Behavior:**
- Sending a new `crewMemberId` replaces the previous association.
- Setting `crewMemberId` to `null` or `""` de-associates without going offline (the connection remains).
- A presence update is broadcast only if the identity actually changed.
- On disconnect, if the client had an identity, a presence update is broadcast.
- Multiple connections can identify as the same crew member; the member appears once in `online`.

---

## 4. Worker Task Scheduler (`/ws/worker`)

Distributed task queue for background worker processes. Workers connect, register capabilities, and receive tasks dispatched by the server in round-robin fashion.

### Connection

```
ws://<host>:<port>/ws/worker?pool=<poolId>
```

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `pool` | `string` | `"default"` | Worker pool to join |

### Constants

| Constant | Default | Description |
|----------|---------|-------------|
| Heartbeat interval | 10,000 ms | How often pings are sent |
| Offline threshold | 30,000 ms | Worker considered offline after this silence |

### Handshake Protocol

1. Worker connects via WebSocket upgrade.
2. Worker MUST send a `hello` message as its first message.
3. Server responds with `welcome`.
4. Worker can now receive `task` and `ping` messages.

### Server → Worker Messages

#### `welcome`

Sent after a worker registers with `hello`.

```json
{
  "type": "welcome",
  "workerId": "worker-abc-123",
  "poolId": "default",
  "heartbeatMs": 10000,
  "offlineAfterMs": 30000,
  "now": 1739664000000
}
```

| Field | Type | Description |
|-------|------|-------------|
| `workerId` | `string` | Assigned or confirmed worker ID |
| `poolId` | `string` | Pool this worker belongs to |
| `heartbeatMs` | `integer` | Expected heartbeat interval |
| `offlineAfterMs` | `integer` | Silence threshold before offline |
| `now` | `integer` | Server timestamp for clock sync |

#### `ping`

Heartbeat probe. Worker must respond with `pong`.

```json
{
  "type": "ping",
  "seq": 42,
  "at": 1739664000000
}
```

#### `task`

A task assigned to this worker for execution.

```json
{
  "type": "task",
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "kind": "ocr-extract",
  "payload": {
    "pdfPath": "/tmp/ros.pdf",
    "options": { "dpi": 300, "maxPages": 5 }
  },
  "createdAt": 1739664000000
}
```

| Field | Type | Description |
|-------|------|-------------|
| `taskId` | `string` | Unique task identifier (UUID) |
| `kind` | `string` | Task type identifier |
| `payload` | `any` | Task-specific data |
| `createdAt` | `integer` | When the task was submitted (ms) |

### Worker → Server Messages

#### `hello`

Register with the worker pool. MUST be the first message sent.

```json
{
  "type": "hello",
  "workerId": "worker-abc-123",
  "name": "gpu-node-1",
  "concurrency": 4,
  "capabilities": {
    "gpu": true,
    "ocr": true,
    "maxMemoryMB": 8192
  }
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `workerId` | `string` | No | Auto-generated UUID | Desired worker ID (reconnection support) |
| `name` | `string` | No | `null` | Human-readable worker name (max 120 chars) |
| `concurrency` | `integer` | No | `1` | Max concurrent tasks this worker can handle |
| `capabilities` | `object` | No | `null` | Arbitrary capability metadata |

**Reconnection:** If `workerId` matches an existing worker, the old socket is destroyed and replaced.

A subsequent `hello` (after registration) can update `name`, `concurrency`, and `capabilities`.

#### `pong`

Heartbeat response to a `ping`. Must include the same `seq`.

```json
{
  "type": "pong",
  "seq": 42
}
```

#### `task-result`

Report task completion or failure.

**Success:**
```json
{
  "type": "task-result",
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "ok": true,
  "result": {
    "bearings": [
      { "bearing": "N 45°30'15\" E", "confidence": 0.95 }
    ]
  }
}
```

**Failure:**
```json
{
  "type": "task-result",
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "ok": false,
  "error": {
    "message": "PDF extraction failed: corrupt file"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `taskId` | `string` | Yes | The task being reported on |
| `ok` | `boolean` | Yes | `true` for success, `false` for failure |
| `result` | `any` | If `ok` | Task result data |
| `error` | `object \| string` | If `!ok` | Error details (object with `message` preferred) |

### Task Lifecycle

```
            submit (REST)
                │
                ▼
           ┌─────────┐
           │ queued   │◄────── worker disconnect (re-queued)
           └────┬─────┘
                │ worker available
                ▼
           ┌──────────┐
           │ assigned  │
           └────┬──────┘
                │
        ┌───────┴────────┐
        ▼                ▼
  ┌───────────┐   ┌──────────┐
  │ completed │   │  failed  │
  └───────────┘   └──────────┘
```

**Task states:**

| State | Description |
|-------|-------------|
| `queued` | Waiting for an available worker |
| `assigned` | Dispatched to a worker; awaiting result |
| `completed` | Worker reported `ok: true` |
| `failed` | Worker reported `ok: false` |

**Scheduling:** Round-robin across workers with available capacity (`concurrency - inFlight > 0`). The queue is pumped on every heartbeat and after every task completion or worker registration.

**Disconnect Recovery:** If a worker disconnects while tasks are in-flight, those tasks are re-queued at the front of the queue and re-dispatched to another available worker.

### Write Guard

After the WebSocket upgrade, a write guard is installed on the socket to prevent accidental raw writes:
- Buffer writes that look like valid WebSocket frames pass through.
- Buffer writes that look like raw JSON are auto-wrapped in a text frame.
- Buffer writes that look like HTTP responses trigger a close frame with code `1002`.
- String writes that look like HTTP are blocked with close frame `1002`.
- Other string writes are automatically wrapped in text frames.

---

## 5. LM Proxy Hub (`/ws/lmproxy`)

A WebSocket hub that connects LM Studio proxy clients with browser UI clients for AI chat functionality. The hub routes chat requests from UI clients to available proxy backends and streams responses back.

### Connection

```
ws://<host>:<port>/ws/lmproxy?token=<auth-token>
```

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `token` | `string` | If `CONTROL_TOKEN` is set | Authentication token |

Alternatively, pass the token via the `x-control-token` HTTP header.

If `CONTROL_TOKEN` is not configured on the server, authentication is disabled.

### Constants

| Constant | Default | Description |
|----------|---------|-------------|
| Ping interval | 25,000 ms | WebSocket-level heartbeat |
| Request timeout | 120,000 ms | Max time for a proxy to complete a request |
| Max payload | 10 MB | Maximum WebSocket message size |

### Handshake Protocol

1. Client connects. Server sends `server_hello`.
2. Client MUST send `hello` with `client_id` and role information.
3. Server responds with `hello_ack`.
4. Messages sent before `hello` (except `hello` itself) receive an error.

### Server Messages (to all clients)

#### `server_hello`

Sent immediately on connection.

```json
{
  "type": "server_hello",
  "want": ["hello"],
  "ts": 1739664000000
}
```

#### `hello_ack`

Sent after successful `hello` registration.

```json
{
  "type": "hello_ack",
  "client_id": "marks-ui",
  "role": "ui",
  "ts": 1739664000000
}
```

#### `error`

Sent for protocol errors or request failures.

```json
{
  "type": "error",
  "id": "req-123",
  "error": {
    "message": "no_proxy_clients_connected"
  }
}
```

**Error messages:**

| Message | Context |
|---------|---------|
| `"hello missing client_id"` | `hello` without `client_id` |
| `"must send hello first"` | Message sent before `hello` |
| `"missing id"` | Chat/models/cancel without `id` |
| `"no_proxy_clients_connected"` | No proxy backends available |
| `"proxy_unavailable"` | Selected proxy not ready |
| `"chat missing body.messages[]"` | Chat request missing messages |
| `"proxy_disconnected:<reason>"` | Proxy dropped during request |
| `"timeout:<ms>ms"` | Request timed out |
| `"service_stopped"` | Hub shutting down |
| `"bad_json"` | Unparseable message |
| `"unknown_ui_type:<type>"` | Unrecognized UI command |

#### `pong`

Response to client `ping`.

```json
{
  "type": "pong",
  "ts": 1739664000000
}
```

### Client Messages (common)

#### `hello`

Register with the hub. Required first message.

**As UI client:**
```json
{
  "type": "hello",
  "client_id": "marks-ui",
  "role": "ui"
}
```

**As proxy client:**
```json
{
  "type": "hello",
  "client_id": "proxy-node-1",
  "capabilities": {
    "chat": true,
    "models": true
  },
  "lm_base_url": "http://localhost:1234"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `client_id` | `string` | Yes | Unique client identifier (non-empty) |
| `role` | `string` | No | Set to `"ui"` for UI clients |
| `capabilities` | `object` | No | Present for proxy clients |
| `lm_base_url` | `string` | No | LM Studio base URL (proxy clients) |

**Role Classification:**
- Explicit `role: "ui"` → UI client
- Has `capabilities` or `lm_base_url` → Proxy client
- Default → Proxy client

#### `ping`

Keepalive message. Server responds with `pong`.

```json
{
  "type": "ping"
}
```

### UI Client → Server Messages

#### `chat`

Send a chat completion request routed to an available proxy.

```json
{
  "type": "chat",
  "id": "req-123",
  "body": {
    "messages": [
      { "role": "system", "content": "You are a helpful surveying assistant." },
      { "role": "user", "content": "What is a basis of bearing?" }
    ],
    "temperature": 0.7,
    "max_tokens": 2048,
    "model": "local-model",
    "stream": true
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique request correlation ID |
| `body` | `object` | Yes | Chat completion request body |
| `body.messages` | `Message[]` | Yes | Non-empty array of chat messages |
| `body.temperature` | `number` | No | Sampling temperature |
| `body.max_tokens` | `integer` | No | Maximum tokens to generate |
| `body.model` | `string` | No | Model identifier |
| `body.stream` | `boolean` | No | Enable streaming |

**Message Object:**

```json
{
  "role": "system" | "user" | "assistant",
  "content": "Message text"
}
```

#### `models`

Request the list of available models from a proxy.

```json
{
  "type": "models",
  "id": "req-456"
}
```

#### `cancel`

Cancel an in-flight request.

```json
{
  "type": "cancel",
  "id": "req-123"
}
```

### Proxy Client → Server Messages (forwarded to UI)

All proxy events with a matching `id` are forwarded as-is to the originating UI client.

#### `started`

Chat generation has begun.

```json
{
  "type": "started",
  "id": "req-123"
}
```

#### `delta`

Streaming token (incremental text).

```json
{
  "type": "delta",
  "id": "req-123",
  "data": " the"
}
```

#### `chunk`

Response chunk (larger than delta).

```json
{
  "type": "chunk",
  "id": "req-123",
  "data": { ... }
}
```

#### `done`

Chat generation is complete.

```json
{
  "type": "done",
  "id": "req-123"
}
```

#### `error`

An error occurred during processing.

```json
{
  "type": "error",
  "id": "req-123",
  "error": {
    "message": "Model not found"
  }
}
```

#### `models`

Response to a `models` request.

```json
{
  "type": "models",
  "id": "req-456",
  "data": [
    { "id": "local-model", "name": "My Model" }
  ]
}
```

#### `cancelled`

Confirmation that a request was cancelled.

```json
{
  "type": "cancelled",
  "id": "req-123"
}
```

### Request Lifecycle

```
  UI                     Hub                    Proxy
   │                      │                       │
   │──── chat (id) ──────►│                       │
   │                      │──── chat (id) ───────►│
   │                      │                       │
   │                      │◄──── started (id) ────│
   │◄──── started (id) ───│                       │
   │                      │                       │
   │                      │◄──── delta (id) ──────│
   │◄──── delta (id) ─────│                       │
   │                      │◄──── delta (id) ──────│
   │◄──── delta (id) ─────│                       │
   │                      │                       │
   │                      │◄──── done (id) ───────│
   │◄──── done (id) ──────│                       │
   │                      │  (inflight cleared)   │
```

**Proxy Selection:** Round-robin across connected proxy clients. If no proxy is available, the UI receives an immediate error.

**Timeout:** If a proxy does not complete a request within `requestTimeoutMs` (default 120s):
1. UI receives `error` with `timeout:<ms>ms`.
2. Hub sends `cancel` to the proxy.
3. Inflight record is cleared.

**Proxy Disconnect:** If a proxy disconnects with in-flight requests:
1. All in-flight requests assigned to that proxy receive `error` with `proxy_disconnected:<reason>`.
2. Inflight records are cleared.

**UI Disconnect:** If a UI client disconnects with in-flight requests:
1. `cancel` messages are sent to the assigned proxies.
2. Inflight records are cleared.

---

## Appendix: Endpoint Summary Table

| Path | Protocol | Direction | Auth |
|------|----------|-----------|------|
| `/ws/lineforge?room=<id>` | Raw WS | Bidirectional | None |
| `/ws/localstorage-sync` | Raw WS | Bidirectional | None |
| `/ws/crew-presence` | Raw WS | Bidirectional | None |
| `/ws/worker?pool=<id>` | Raw WS | Bidirectional | None |
| `/ws/lmproxy?token=<t>` | `ws` (npm) | Bidirectional | Optional token |

**Note on implementation:** The first four WebSocket services (`lineforge`, `localstorage-sync`, `crew-presence`, `worker`) use a hand-rolled WebSocket implementation with manual frame encoding/decoding on raw TCP sockets. The LM Proxy Hub (`lmproxy`) uses the `ws` npm package with `noServer: true` mode.

### `field-to-finish-updated`
Server broadcast on `/ws/lineforge` after shared Field-to-Finish settings are changed via CRUD API.

```json
{
  "type": "field-to-finish-updated",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```
