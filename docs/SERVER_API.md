# SURVEY-CAD Server API Reference

> **Base URL:** `http://<host>:<port>` (default `http://0.0.0.0:3000`)

---

## Table of Contents

- [Server Configuration](#server-configuration)
- [Request / Response Conventions](#request--response-conventions)
- [Health & Application Catalog](#health--application-catalog)
- [Geographic Lookup & GIS](#geographic-lookup--gis)
- [Project File Management](#project-file-management)
- [Crew Management](#crew-management)
- [Equipment Management](#equipment-management)
- [Equipment Logs](#equipment-logs)
- [LocalStorage Sync (REST)](#localstorage-sync-rest)
- [PointForge Exports](#pointforge-exports)
- [FLD Configuration](#fld-configuration)
- [Worker Task Management](#worker-task-management)
- [ROS OCR Extraction](#ros-ocr-extraction)
- [Static Map Tiles](#static-map-tiles)
- [ROS PDF Proxy](#ros-pdf-proxy)
- [Static File Serving](#static-file-serving)
- [Error Handling](#error-handling)
- [Data Models](#data-models)

---

## Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `REDIS_URL` | _(none)_ | Redis connection URL; enables persistent sync store |
| `REDIS_CONNECT_MAX_WAIT_MS` | `15000` | Max wait for Redis connection |
| `REDIS_CONNECT_RETRY_DELAY_MS` | `750` | Retry delay between Redis connection attempts |
| `REDIS_TLS_REJECT_UNAUTHORIZED` | `false` | Strict TLS verification for Redis |
| `LOCALSTORAGE_SYNC_REDIS_KEY` | `survey-cad:localstorage-sync:state` | Redis key used for persistent state |
| `CONTROL_TOKEN` | _(none)_ | Optional auth token for the LM Proxy Hub WebSocket |
| `ROS_OCR_MAX_PAGES` | `1` | Default max PDF pages for OCR extraction |
| `ROS_OCR_DPI` | `220` | Default DPI for OCR extraction |

**Request Limits:**

| Limit | Value |
|-------|-------|
| JSON request body max | 5 MB |
| File upload max | 50 MB |

---

## Request / Response Conventions

- All JSON responses use `Content-Type: application/json; charset=utf-8`.
- All API routes are prefixed with `/api/` except `/health`, `/extract`, and static files.
- Error responses always return: `{ "error": "<message>" }`.
- Successful mutations return HTTP `201 Created`; reads return `200 OK`.
- Methods not supported on an endpoint return `405 Method Not Allowed`.

---

## Health & Application Catalog

### `GET /health`

Health check endpoint.

**Response `200`:**
```json
{
  "ok": true
}
```

---

### `GET /api/apps`

Returns the public application catalog.

**Response `200`:**
```json
{
  "apps": [
    {
      "id": "launcher",
      "name": "SurveyFoundry",
      "description": "Projects, evidence, and outputs—end to end.",
      "entryHtml": "index.html",
      "iconPath": "/assets/icons/SurveyFoundry.png",
      "section": "Research"
    }
  ]
}
```

**App Object:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique app identifier |
| `name` | `string` | Display name |
| `description` | `string` | Human-readable description |
| `entryHtml` | `string` | HTML entry point filename |
| `iconPath` | `string` | Path to the app icon |
| `section` | `string?` | Category grouping (e.g. `"Research"`, `"Drafting"`, `"Field Tools"`, `"TOPO"`) |
| `experimental` | `boolean?` | Present and `true` for experimental apps |

---

## Geographic Lookup & GIS

### `GET /api/lookup`

Comprehensive address lookup. Geocodes the address and queries parcels, sections, subdivisions, and Records of Survey in the vicinity.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `address` | `string` | Yes | Street address to look up |

**Response `200`:** The full result object from `SurveyCadClient.lookupByAddress()` containing geocode results, nearby parcels, section data, and ROS records.

---

### `GET /api/geocode`

Geocode an address to coordinates. Tries Nominatim first, falls back to ArcGIS.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `address` | `string` | Yes | Street address to geocode |

**Response `200`:** Geocode result with coordinates and metadata.

---

### `GET /api/parcel`

Find the nearest parcel to a geographic point.

| Query Param | Type | Required | Default | Description |
|-------------|------|----------|---------|-------------|
| `lon` | `number` | Yes | - | Longitude (WGS 84) |
| `lat` | `number` | Yes | - | Latitude (WGS 84) |
| `outSR` | `number` | No | `4326` | Output spatial reference WKID |
| `searchMeters` | `number` | No | `40` | Search radius in meters |

**Response `200`:**
```json
{
  "parcel": { ... }
}
```

The `parcel` object contains ArcGIS feature attributes and geometry from the Ada County parcel layer.

---

### `GET /api/section`

Load the PLSS section at a geographic point.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `lon` | `number` | Yes | Longitude |
| `lat` | `number` | Yes | Latitude |

**Response `200`:**
```json
{
  "section": { ... }
}
```

Returns the BLM First Division feature at the given point, or `null`.

---

### `GET /api/aliquots`

Load PLSS aliquots (second-division subdivisions) within the section at a geographic point.

| Query Param | Type | Required | Default | Description |
|-------------|------|----------|---------|-------------|
| `lon` | `number` | Yes | - | Longitude |
| `lat` | `number` | Yes | - | Latitude |
| `outSR` | `number` | No | `4326` | Output spatial reference WKID |

**Response `200`:**
```json
{
  "section": { ... },
  "aliquots": [ ... ]
}
```

**Response `404`:** If no section is found at the given coordinates.

---

### `GET /api/subdivision`

Load subdivision data at a geographic point from the Ada County subdivision layer.

| Query Param | Type | Required | Default | Description |
|-------------|------|----------|---------|-------------|
| `lon` | `number` | Yes | - | Longitude |
| `lat` | `number` | Yes | - | Latitude |
| `outSR` | `number` | No | `4326` | Output spatial reference WKID (falls back to 4326 on error) |

**Response `200`:**
```json
{
  "subdivision": { ... }
}
```

---

### `GET /api/utilities`

Look up utility records (power infrastructure) near an address.

| Query Param | Type | Required | Default | Description |
|-------------|------|----------|---------|-------------|
| `address` | `string` | Yes | - | Street address |
| `outSR` | `number` | No | `2243` | Output spatial reference WKID (default: Idaho State Plane West, US Feet) |
| `sources` | `string` | No | `"power"` | Comma-separated source types to query |

**Response `200`:**
```json
{
  "utilities": [ ... ],
  "sources": ["power"]
}
```

---

## Project File Management

### `GET /api/project-file/template`

Generate a project file manifest template.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `projectId` | `string` | No | Project ID (auto-generated if omitted) |
| `projectName` | `string` | No | Project display name |
| `client` | `string` | No | Client name |
| `address` | `string` | No | Project address |
| `resources` | `string` | No | JSON-encoded array of resource objects |

**Response `200`:**
```json
{
  "projectFile": {
    "schemaVersion": "1.0.0",
    "generatedAt": "2026-02-16T00:00:00.000Z",
    "project": {
      "id": "project-1739664000000",
      "name": "Untitled Project",
      "client": "",
      "address": ""
    },
    "archive": {
      "type": "zip",
      "rootFolderName": "untitled-project-project-1739664000000"
    },
    "folders": [
      {
        "key": "drawings",
        "label": "Drawings",
        "description": "LineSmith drawing packages generated from linked point files.",
        "index": []
      },
      {
        "key": "ros",
        "label": "RoS",
        "description": "Record of Survey source files and exports.",
        "index": []
      },
      {
        "key": "cpfs",
        "label": "CP&Fs",
        "description": "Corner Perpetuation & Filing references resolved by instrument number.",
        "index": []
      },
      {
        "key": "point-files",
        "label": "Point Files",
        "description": "PointForge-managed points exported as CSV.",
        "index": []
      },
      {
        "key": "deeds",
        "label": "Deeds",
        "description": "Deed references and exported documents.",
        "index": []
      },
      {
        "key": "plats",
        "label": "Plats",
        "description": "Subdivision plats and plat-related exhibits.",
        "index": []
      },
      {
        "key": "invoices",
        "label": "Invoices",
        "description": "Billing artifacts and project invoices.",
        "index": []
      },
      {
        "key": "other",
        "label": "Other",
        "description": "Future expansion area for additional project evidence types.",
        "index": []
      }
    ]
  }
}
```

---

### `POST /api/project-file/compile`

Compile a project file into an archive plan with resolved file entries.

**Request Body:**
```json
{
  "projectFile": { ... },
  "project": {
    "projectId": "my-project",
    "projectName": "My Project",
    "client": "ACME Corp",
    "address": "123 Main St"
  }
}
```

If `projectFile` is omitted, one is auto-generated from `project`.

**Response `200`:**
```json
{
  "projectFile": { ... },
  "archivePlan": {
    "archiveName": "my-project.zip",
    "rootFolderName": "my-project-my-project",
    "entries": [
      {
        "path": "my-project-my-project/project-file.json",
        "source": {
          "type": "project-file-manifest",
          "contentType": "application/json"
        }
      },
      {
        "path": "my-project-my-project/Drawings/index.json",
        "source": {
          "type": "folder-index",
          "folder": "drawings",
          "contentType": "application/json"
        }
      }
    ],
    "unresolved": []
  }
}
```

---

### `POST /api/project-files/upload`

Upload a file to a project folder on the server.

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | `string` | Yes | Target project ID |
| `folderKey` | `string` | Yes | Target folder (see valid keys below) |
| `file` | `binary` | Yes | The file to upload (max 50 MB) |

**Valid `folderKey` values:** `drawings`, `ros`, `cpfs`, `point-files`, `deeds`, `plats`, `invoices`, `other`

**Response `201`:**
```json
{
  "resource": {
    "id": "upload-my-drawing-1739664000000",
    "folder": "drawings",
    "title": "my-drawing.dxf",
    "exportFormat": "dxf",
    "reference": {
      "type": "server-upload",
      "value": "/api/project-files/download?projectId=proj-1&folderKey=drawings&fileName=1739664000000-my-drawing_dxf",
      "resolverHint": "evidence-desk-upload",
      "metadata": {
        "fileName": "my-drawing.dxf",
        "storedName": "1739664000000-my-drawing_dxf",
        "uploadedAt": "2026-02-16T00:00:00.000Z",
        "sizeBytes": 1024
      }
    }
  }
}
```

---

### `GET /api/project-files/download`

Download a previously uploaded file.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `projectId` | `string` | Yes | Project ID |
| `folderKey` | `string` | Yes | Folder key |
| `fileName` | `string` | Yes | Stored filename (from upload response) |

**Response `200`:** Raw file content with appropriate MIME type and `Content-Disposition: inline`.

**Response `404`:** `{ "error": "File not found." }`

---

### `GET /api/project-files/list`

List all uploaded files for a project.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `projectId` | `string` | Yes | Project ID |

**Response `200`:**
```json
{
  "files": [
    {
      "folderKey": "drawings",
      "fileName": "1739664000000-my-drawing_dxf"
    }
  ]
}
```

---

## Crew Management

### `GET /api/crew`

List all crew members, or retrieve one by ID.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `id` | `string` | No | If provided, returns a single crew member |

**Response `200` (list):**
```json
{
  "crew": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "firstName": "John",
      "lastName": "Doe",
      "jobTitle": "Party Chief",
      "phone": "208-555-1234",
      "email": "john@example.com",
      "certifications": "PLS",
      "notes": "",
      "roles": ["chief", "rodman"],
      "photo": null,
      "createdAt": "2026-01-15T08:00:00.000Z",
      "updatedAt": "2026-02-10T12:30:00.000Z"
    }
  ]
}
```

**Response `200` (by ID):**
```json
{
  "member": { ... }
}
```

**Response `404`:** `{ "error": "Crew member not found." }`

---

### `POST /api/crew`

Create or update a crew member.

**Request Body:**
```json
{
  "id": "optional-uuid",
  "firstName": "Jane",
  "lastName": "Smith",
  "jobTitle": "Instrument Operator",
  "phone": "208-555-5678",
  "email": "jane@example.com",
  "certifications": "CST III",
  "notes": "Experienced with GPS",
  "roles": ["operator"],
  "photo": null,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | `string` | No | Auto-generated UUID | Crew member ID |
| `firstName` | `string` | Yes* | `""` | First name (*at least one of firstName/lastName required) |
| `lastName` | `string` | Yes* | `""` | Last name |
| `jobTitle` | `string` | No | `""` | Job title |
| `phone` | `string` | No | `""` | Phone number |
| `email` | `string` | No | `""` | Email address |
| `certifications` | `string` | No | `""` | Certifications held |
| `notes` | `string` | No | `""` | Free-form notes |
| `roles` | `string[]` | No | `[]` | Array of role strings |
| `photo` | `any` | No | `null` | Photo data (nullable) |
| `createdAt` | `string` | No | Now (ISO 8601) | Creation timestamp |

**Response `201`:**
```json
{
  "member": { ... }
}
```

Automatically broadcasts the change to all connected LocalStorage Sync WebSocket clients.

---

### `GET /api/crew-presence`

Get the list of currently online crew member IDs (determined by WebSocket connections).

**Response `200`:**
```json
{
  "online": ["crew-member-id-1", "crew-member-id-2"]
}
```

---

## Equipment Management

### `GET /api/equipment`

List all equipment, or retrieve one by ID.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `id` | `string` | No | If provided, returns a single equipment item |

**Response `200` (list):**
```json
{
  "equipment": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "make": "Trimble",
      "model": "S7",
      "equipmentType": "Total Station",
      "serialNumber": "TS-12345",
      "createdAt": "2026-01-10T00:00:00.000Z",
      "updatedAt": "2026-02-10T12:00:00.000Z"
    }
  ]
}
```

**Response `200` (by ID):**
```json
{
  "equipment": { ... }
}
```

**Response `404`:** `{ "error": "Equipment not found." }`

---

### `POST /api/equipment`

Create or update an equipment item.

**Request Body:**
```json
{
  "id": "optional-uuid",
  "make": "Trimble",
  "model": "S7",
  "equipmentType": "Total Station",
  "serialNumber": "TS-12345"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | `string` | No | Auto-generated UUID | Equipment ID |
| `make` | `string` | Yes* | `""` | Manufacturer (*at least one of make/model required) |
| `model` | `string` | Yes* | `""` | Model name/number |
| `equipmentType` | `string` | No | `""` | Equipment category |
| `serialNumber` | `string` | No | `""` | Serial number |
| `createdAt` | `string` | No | Now (ISO 8601) | Creation timestamp |

**Response `201`:**
```json
{
  "equipment": { ... }
}
```

---

## Equipment Logs

### `GET /api/equipment-logs`

List all equipment logs, or retrieve one by ID.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `id` | `string` | No | If provided, returns a single log entry |

**Response `200` (list):**
```json
{
  "logs": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "rodman": "John Doe",
      "equipmentHeight": "5.2",
      "referencePoint": "CP-101",
      "setupTime": "08:30",
      "teardownTime": "16:00",
      "jobFileName": "site-survey-2026.job",
      "equipmentType": "Total Station",
      "notes": "Clear conditions",
      "createdAt": "2026-02-15T08:30:00.000Z",
      "updatedAt": "2026-02-15T16:00:00.000Z"
    }
  ]
}
```

**Response `200` (by ID):**
```json
{
  "log": { ... }
}
```

**Response `404`:** `{ "error": "Equipment log not found." }`

---

### `POST /api/equipment-logs`

Create or update an equipment log entry.

**Request Body:**
```json
{
  "rodman": "John Doe",
  "equipmentHeight": "5.2",
  "referencePoint": "CP-101",
  "setupTime": "08:30",
  "teardownTime": "16:00",
  "jobFileName": "site-survey-2026.job",
  "equipmentType": "Total Station",
  "notes": "Clear conditions"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | `string` | No | Auto-generated UUID | Log entry ID |
| `rodman` | `string` | Yes* | `""` | Rodman name (*at least one of rodman/jobFileName required) |
| `equipmentHeight` | `string` | No | `""` | Instrument height |
| `referencePoint` | `string` | No | `""` | Setup reference point name |
| `setupTime` | `string` | No | `""` | Setup time |
| `teardownTime` | `string` | No | `""` | Teardown time |
| `jobFileName` | `string` | Yes* | `""` | Job/data collector filename |
| `equipmentType` | `string` | No | `""` | Equipment category |
| `notes` | `string` | No | `""` | Free-form notes |
| `createdAt` | `string` | No | Now (ISO 8601) | Creation timestamp |

**Response `201`:**
```json
{
  "log": { ... }
}
```

---

## LocalStorage Sync (REST)

### `GET /api/localstorage-sync`

Retrieve the current synchronized state snapshot.

**Response `200`:**
```json
{
  "version": 42,
  "snapshot": {
    "surveyfoundryCrewProfiles": "[{...}]",
    "surveyfoundryEquipmentInventory": "[{...}]",
    "surveyfoundryEquipmentLogs": "[{...}]"
  },
  "checksum": "fnv1a-a1b2c3d4",
  "updatedAt": "2026-02-16T12:00:00.000Z"
}
```

**State Object:**

| Field | Type | Description |
|-------|------|-------------|
| `version` | `integer` | Monotonically increasing version counter |
| `snapshot` | `Record<string, string>` | Key-value map of all stored data (values are JSON-encoded strings) |
| `checksum` | `string` | FNV-1a 32-bit checksum in format `fnv1a-<hex>` |
| `updatedAt` | `string \| null` | ISO 8601 timestamp of last update |

---

### `POST /api/localstorage-sync`

Push a full state snapshot to the server (full sync).

**Request Body:**
```json
{
  "version": 43,
  "snapshot": {
    "surveyfoundryCrewProfiles": "[{...}]"
  }
}
```

**Response `200`:**
```json
{
  "status": "server-updated",
  "state": { ... }
}
```

**Possible `status` values:**

| Status | Meaning |
|--------|---------|
| `server-updated` | Incoming version was newer; server state replaced |
| `client-stale` | Incoming version was older; server state returned as-is |
| `checksum-conflict` | Same version but different content; server wins |
| `in-sync` | Same version and same content; no change |

---

## LineSmith Drawings (Project-scoped CRUD)

Project-scoped LineSmith drawings are persisted in the shared sync snapshot (Redis-backed when configured) and keep differential version history for offline-friendly reconstruction.

### `GET /api/projects/:projectId/drawings`

List drawing summaries for a project.

**Response `200`:**
```json
{
  "projectId": "proj-1",
  "drawings": [
    {
      "drawingId": "boundary-base-map",
      "drawingName": "Boundary Base Map",
      "createdAt": "2026-02-18T00:00:00.000Z",
      "updatedAt": "2026-02-18T00:10:00.000Z",
      "latestVersionId": "v-1739837400000",
      "versionCount": 3,
      "latestMapGeoreference": { "origin": [0, 0] }
    }
  ]
}
```

### `POST /api/projects/:projectId/drawings`

Create a drawing record for a project.

**Request Body:**
```json
{
  "drawingName": "Boundary Base Map",
  "drawingState": {
    "points": [{ "id": "p-1", "x": 1000, "y": 2000 }],
    "mapGeoreference": { "origin": [0, 0] }
  }
}
```

**Response `201`:**
```json
{
  "drawing": {
    "schemaVersion": "1.0.0",
    "projectId": "proj-1",
    "drawingId": "boundary-base-map",
    "drawingName": "Boundary Base Map",
    "createdAt": "2026-02-18T00:00:00.000Z",
    "updatedAt": "2026-02-18T00:00:00.000Z",
    "latestMapGeoreference": { "origin": [0, 0] },
    "versions": [
      {
        "versionId": "v-1739836800000",
        "savedAt": "2026-02-18T00:00:00.000Z",
        "label": "Boundary Base Map",
        "baseState": { "points": [] }
      }
    ],
    "currentState": { "points": [] }
  }
}
```

### `GET /api/projects/:projectId/drawings/:drawingId`

Fetch the full drawing record and reconstructed latest state.

**Response `200`:**
```json
{
  "drawing": { ... }
}
```

**Response `404`:** `{ "error": "Drawing not found." }`

### `PUT /api/projects/:projectId/drawings/:drawingId`
### `PATCH /api/projects/:projectId/drawings/:drawingId`

Append a new drawing version using differential patching from the prior version.

**Request Body:**
```json
{
  "drawingName": "Boundary Base Map",
  "drawingState": {
    "points": [{ "id": "p-1", "x": 1010, "y": 2010 }],
    "mapGeoreference": { "origin": [10, 10] }
  }
}
```

**Response `200`:**
```json
{
  "drawing": { ... }
}
```

### `DELETE /api/projects/:projectId/drawings/:drawingId`

Delete a drawing record from a project.

**Response `200`:**
```json
{
  "deleted": true
}
```

**Response `404`:** `{ "error": "Drawing not found." }`

## Project Point Files (Project-scoped CRUD)

Project-scoped point files are persisted in the shared sync snapshot (Redis-backed when configured) and keep differential version history for offline-friendly reconstruction across PointForge and EvidenceDesk.

### `GET /api/projects/:projectId/point-files`

List point-file summaries for a project.

**Response `200`:**
```json
{
  "projectId": "proj-1",
  "pointFiles": [
    {
      "pointFileId": "boundary-export",
      "pointFileName": "Boundary Export.csv",
      "exportFormat": "csv",
      "createdAt": "2026-02-18T00:00:00.000Z",
      "updatedAt": "2026-02-18T00:10:00.000Z",
      "latestVersionId": "v-1739837400000",
      "versionCount": 2
    }
  ]
}
```

### `POST /api/projects/:projectId/point-files`

Create a point-file record for a project.

**Request Body:**
```json
{
  "pointFileName": "Boundary Export.csv",
  "pointFileState": {
    "text": "1,100,200",
    "exportFormat": "csv"
  }
}
```

**Response `201`:**
```json
{
  "pointFile": {
    "projectId": "proj-1",
    "pointFileId": "boundary-export",
    "pointFileName": "Boundary Export.csv",
    "versions": [
      {
        "versionId": "v-1739836800000",
        "savedAt": "2026-02-18T00:00:00.000Z",
        "label": "Boundary Export.csv",
        "baseState": { "text": "1,100,200", "exportFormat": "csv" }
      }
    ],
    "currentState": { "text": "1,100,200", "exportFormat": "csv" }
  }
}
```

### `GET /api/projects/:projectId/point-files/:pointFileId`

Fetch the full point-file record and reconstructed latest state.

**Response `200`:**
```json
{
  "pointFile": { ... }
}
```

**Response `404`:** `{ "error": "Point file not found." }`

### `PUT /api/projects/:projectId/point-files/:pointFileId`
### `PATCH /api/projects/:projectId/point-files/:pointFileId`

Append a new point-file version using differential patching from the prior version.

### `DELETE /api/projects/:projectId/point-files/:pointFileId`

Delete a point-file record from a project.

**Response `200`:**
```json
{
  "deleted": true
}
```

**Response `404`:** `{ "error": "Point file not found." }`

---

---

## PointForge Exports

### `GET /api/pointforge-exports`

List exports or retrieve one by ID.

| Query Param | Type | Required | Default | Description |
|-------------|------|----------|---------|-------------|
| `id` | `string` | No | - | Retrieve a specific export by ID |
| `room` | `string` | No | `"default"` | Filter exports by room ID |

**Response `200` (list):**
```json
{
  "exports": [
    {
      "id": "pf-export-1739664000000-a1b2c3d4",
      "roomId": "default",
      "originalCsv": "POINT,NORTH,EAST,...",
      "modifiedCsv": "POINT,NORTH,EAST,...",
      "georeference": { ... },
      "metadata": { ... },
      "createdAt": "2026-02-16T00:00:00.000Z"
    }
  ]
}
```

**Response `200` (by ID):**
```json
{
  "export": { ... }
}
```

**Response `404`:** `{ "error": "Export not found." }`

---

### `POST /api/pointforge-exports`

Persist a PointForge export and broadcast a `pointforge-import` event to the LineForge collaboration room.

**Request Body:**
```json
{
  "modifiedCsv": "POINT,NORTH,EAST,ELEV,DESC\n1,1000.000,5000.000,100.00,CP",
  "originalCsv": "POINT,NORTH,EAST,ELEV,DESC\n1,999.998,4999.997,99.98,CP",
  "georeference": {
    "controlPoints": [ ... ],
    "transformation": "helmert",
    "residuals": [ ... ]
  },
  "metadata": {
    "sourceFile": "job-2026.csv",
    "pointCount": 150
  },
  "roomId": "project-abc"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `modifiedCsv` | `string` | Yes | Transformed CSV point data |
| `originalCsv` | `string` | No | Original CSV before transformation |
| `georeference` | `object \| null` | No | Georeference transformation metadata |
| `metadata` | `object` | No | Arbitrary metadata |
| `roomId` | `string` | No | LineForge room to notify (default: `"default"`) |

**Response `201`:**
```json
{
  "export": {
    "id": "pf-export-1739664000000-a1b2c3d4",
    "roomId": "project-abc",
    "originalCsv": "...",
    "modifiedCsv": "...",
    "georeference": { ... },
    "metadata": { ... },
    "createdAt": "2026-02-16T00:00:00.000Z"
  }
}
```

**Side Effect:** Broadcasts to the LineForge collab room:
```json
{
  "type": "pointforge-import",
  "exportId": "pf-export-1739664000000-a1b2c3d4",
  "at": 1739664000000
}
```

---

## FLD Configuration

### `GET /api/fld-config`

Load and parse a survey field code (.fld) configuration file.

| Query Param | Type | Required | Default | Description |
|-------------|------|----------|---------|-------------|
| `file` | `string` | No | `"config/MLS.fld"` | Relative path to the FLD config file |

**Response `200`:**
```json
{
  "versionTag": "MLS v2.1",
  "columns": [
    { "index": 0, "name": "Code", "key": "code" },
    { "index": 1, "name": "Description", "key": "description" }
  ],
  "rules": [
    {
      "rowNumber": 1,
      "code": "IP",
      "description": "Iron Pin",
      "fullName": "Iron Pin Found",
      "layer": "BOUNDARY",
      "entityType": "point",
      "lineType": "",
      "symbol": "IP",
      "symbolSize": "0.1",
      "symbolMapFile": "",
      "processingOn": true,
      "codeSequence": ["IP"],
      "companionCodes": [],
      "raw": { ... }
    }
  ],
  "rulesByCode": {
    "IP": { ... }
  }
}
```

---

## Worker Task Management

### `POST /api/worker/submit`

Submit a task to the distributed worker pool. Blocks until a worker completes the task or an error occurs.

**Request Body:**
```json
{
  "poolId": "default",
  "kind": "ocr-extract",
  "payload": {
    "pdfUrl": "https://example.com/ros.pdf",
    "options": { "dpi": 300 }
  }
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `poolId` | `string` | No | `"default"` | Worker pool to submit to |
| `kind` | `string` | Yes | - | Task type identifier |
| `payload` | `any` | No | `null` | Arbitrary task payload |

**Response `200` (success):**
```json
{
  "ok": true,
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "result": { ... }
}
```

**Response `500` (task failed):**
```json
{
  "ok": false,
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "error": "Processing failed: invalid PDF",
  "details": { ... }
}
```

**Response `503` (no workers):**
```json
{
  "error": "No online workers in pool.",
  "workers": []
}
```

---

### `GET /api/worker/workers`

List all registered workers and their status.

| Query Param | Type | Required | Default | Description |
|-------------|------|----------|---------|-------------|
| `pool` | `string` | No | `"default"` | Worker pool to query |

**Response `200`:**
```json
{
  "workers": [
    {
      "workerId": "worker-abc-123",
      "poolId": "default",
      "name": "gpu-node-1",
      "concurrency": 4,
      "inFlight": 2,
      "online": true,
      "lastSeen": 1739664000000,
      "capabilities": { "gpu": true, "ocr": true }
    }
  ]
}
```

---

## ROS OCR Extraction

### `POST /extract`

Extract basis-of-bearing candidates from a Record of Survey PDF using OCR.

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pdf` | `binary` | Yes | PDF file to process (max 35 MB) |

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `maxPages` | `integer` | `1` | Max pages to process |
| `dpi` | `integer` | `220` | OCR resolution |
| `async` | `"0" \| "1"` | `"0"` | Run asynchronously |
| `allowSlow` | `"0" \| "1"` | `"0"` | Allow higher limits for maxPages and dpi |
| `debug` | `"0" \| "1"` | `"0"` | Include debug output |

**Response `200` (synchronous):**
```json
{
  "basis": [ ... ],
  "request": {
    "allowSlow": false,
    "requestedMaxPages": 1,
    "requestedDpi": 220,
    "maxPages": 1,
    "dpi": 220
  }
}
```

**Response `202` (asynchronous):**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "statusUrl": "/extract/jobs/550e8400-e29b-41d4-a716-446655440000",
  "pollAfterMs": 1000,
  "request": { ... }
}
```

---

### `GET /extract/jobs/:jobId`

Poll an async extraction job status.

**Response `200` (completed):**
```json
{
  "jobId": "...",
  "status": "completed",
  "request": { ... },
  "basis": [ ... ]
}
```

**Response `200` (still running):**
```json
{
  "jobId": "...",
  "status": "running",
  "request": { ... },
  "pollAfterMs": 1000
}
```

**Response `500` (failed):**
```json
{
  "jobId": "...",
  "status": "failed",
  "request": { ... },
  "error": "Error message"
}
```

**Job status values:** `queued` | `running` | `completed` | `failed`

---

## Static Map Tiles

### `GET /api/static-map`

Fetch a satellite/street map tile centered on coordinates. Attempts ArcGIS World Imagery first, falls back to OpenStreetMap, then to a generated SVG placeholder.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `lon` | `number` | Yes | Longitude |
| `lat` | `number` | Yes | Latitude |
| `address` | `string` | No | Address label for SVG fallback |

**Response `200`:** `image/png` (tile image) or `image/svg+xml` (fallback).

**Cache-Control:** `public, max-age=1800` (tile) or `public, max-age=300` (SVG fallback).

---

## ROS PDF Proxy

### `GET /api/ros-pdf`

Proxy a remote Record of Survey PDF to avoid CORS issues.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `url` | `string` | Yes | Absolute HTTP/HTTPS URL to the PDF |

**Response `200`:** Raw PDF content with original Content-Type and Content-Disposition headers.

**Response `502`:** If the upstream request fails.

---

## Static File Serving

All paths not matching an API route are served as static files from the project root directory.

**Caching Strategy:**

| Path Pattern | Cache-Control |
|-------------|---------------|
| `/assets/icons/*`, `/assets/survey-symbols/*` | `public, max-age=31536000, immutable` |
| `*.html` | `no-cache` |
| All other assets | `public, max-age=300` |

**Path Resolution:** Case-insensitive fallback matching is used if the exact path is not found.

---

## Error Handling

All errors return JSON with an `error` field:

```json
{
  "error": "Descriptive error message."
}
```

| HTTP Status | Meaning |
|-------------|---------|
| `400` | Bad request / validation error |
| `403` | Forbidden (path traversal attempt) |
| `404` | Resource not found |
| `405` | Method not allowed |
| `502` | Upstream server error (proxied requests) |
| `503` | Service unavailable (no workers online) |

---

## Data Models

### ProjectFile

```
ProjectFile {
  schemaVersion: string               // "1.0.0"
  generatedAt:   string               // ISO 8601 timestamp
  project:       Project
  archive:       Archive
  folders:       Folder[]
}
```

### Project

```
Project {
  id:      string                      // Unique project identifier
  name:    string                      // Display name
  client:  string                      // Client name
  address: string                      // Project address
}
```

### Archive

```
Archive {
  type:           string               // "zip"
  rootFolderName: string               // Slugified root folder name
}
```

### Folder

```
Folder {
  key:         string                  // One of: drawings, ros, cpfs, point-files, deeds, plats, invoices, other
  label:       string                  // Human-readable label
  description: string                  // Folder purpose description
  index:       Resource[]              // Resources in this folder
}
```

### Resource

```
Resource {
  id:           string                 // Unique resource identifier
  folder:       string                 // Parent folder key
  title:        string                 // Display title
  exportFormat: string                 // File extension (dxf, pdf, csv, bin, etc.)
  reference:    Reference
}
```

### Reference

```
Reference {
  type:         string                 // "external" | "server-upload" | custom type
  value:        string                 // URL or reference path
  resolverHint: string | null          // Hint for archive resolution
  metadata:     object                 // Arbitrary metadata
}
```

### CrewMember

```
CrewMember {
  id:             string               // UUID
  firstName:      string
  lastName:       string
  jobTitle:       string
  phone:          string
  email:          string
  certifications: string
  notes:          string
  roles:          string[]
  photo:          any | null
  createdAt:      string               // ISO 8601
  updatedAt:      string               // ISO 8601
}
```

### Equipment

```
Equipment {
  id:             string               // UUID
  make:           string
  model:          string
  equipmentType:  string
  serialNumber:   string
  createdAt:      string               // ISO 8601
  updatedAt:      string               // ISO 8601
}
```

### EquipmentLog

```
EquipmentLog {
  id:              string              // UUID
  rodman:          string
  equipmentHeight: string
  referencePoint:  string
  setupTime:       string
  teardownTime:    string
  jobFileName:     string
  equipmentType:   string
  notes:           string
  createdAt:       string              // ISO 8601
  updatedAt:       string              // ISO 8601
}
```

### PointForgeExport

```
PointForgeExport {
  id:           string                 // "pf-export-{timestamp}-{uuid8}"
  roomId:       string                 // LineForge room association
  originalCsv:  string                 // Pre-transform CSV
  modifiedCsv:  string                 // Post-transform CSV
  georeference: object | null          // Transform parameters
  metadata:     object                 // Arbitrary metadata
  createdAt:    string                 // ISO 8601
}
```

### SyncState

```
SyncState {
  version:   integer                   // Monotonically increasing
  snapshot:  Record<string, string>    // Key-value storage
  checksum:  string                    // "fnv1a-{hex8}"
  updatedAt: string | null             // ISO 8601
}
```

### FldConfig

```
FldConfig {
  versionTag:  string | null
  columns:     FldColumn[]
  rules:       FldRule[]
  rulesByCode: Record<string, FldRule>
}
```

### FldColumn

```
FldColumn {
  index: integer
  name:  string
  key:   string
}
```

### FldRule

```
FldRule {
  rowNumber:      integer
  code:           string
  description:    string
  fullName:       string
  layer:          string
  entityType:     string
  lineType:       string
  symbol:         string
  symbolSize:     string
  symbolMapFile:  string
  processingOn:   boolean
  codeSequence:   string[]
  companionCodes: string[]
  raw:            object
}
```

### WorkerInfo

```
WorkerInfo {
  workerId:     string
  poolId:       string
  name:         string | null
  concurrency:  integer
  inFlight:     integer
  online:       boolean
  lastSeen:     integer                // Unix timestamp (ms)
  capabilities: object | null
}
```

## Project Workbench (Project-scoped casefile integration)

Project Workbench endpoints link SurveyFoundry projects to BEW casefiles and synchronize project-derived evidence (drawings, point-files, and uploaded files) into Workbench evidence records.

### `GET /api/projects/:projectId/workbench`

Return the current project↔casefile link and the linked casefile payload (if linked).

### `PUT /api/projects/:projectId/workbench/link`

Link an existing casefile to a project.

**Request Body:**
```json
{
  "casefileId": "2e9e8fd9-58c8-41b5-8a10-2fd2e2f9a2f7"
}
```

### `DELETE /api/projects/:projectId/workbench/link`

Remove a project↔casefile link.

### `POST /api/projects/:projectId/workbench/casefile`

Create (or force-create) a project-linked casefile and synchronize project-derived evidence into that casefile.

### `DELETE /api/projects/:projectId/workbench/casefile`

Delete the linked casefile and remove the project link.

### `GET /api/projects/:projectId/workbench/sources`

List the derived project sources used for Workbench sync.

### `POST /api/projects/:projectId/workbench/sync`

Synchronize project-derived evidence into the linked casefile and return sync counts (`created`, `updated`, `deleted`, `totalSources`).
