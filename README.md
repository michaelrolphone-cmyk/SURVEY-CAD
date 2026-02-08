# SURVEY-CAD Node Library + Heroku Web App

This repository includes:
- A reusable Node.js surveying client in `src/survey-api.js`.
- A project-file manifest builder in `src/project-file.js` for symbolic archive compilation plans.
- A CLI in `src/cli.js`.
- A standalone ROS basis-of-bearing OCR API in `src/ros-ocr-api.js`.
- A standalone ROS basis-of-bearing CLI in `src/ros-basis-cli.js`.
- A Heroku-compatible web server in `src/server.js` that serves the repository HTML files statically and exposes the surveying library as JSON API endpoints.

## Install / Run

```bash
npm install
npm test
npm run cli -- --help
npm run ros:cli -- --help
npm run icons:generate
npm start
npm run ros:ocr
```

The server binds to `PORT` (Heroku-compatible) and defaults to `3000` locally.

## Heroku Deployment

The repo is configured with:
- `Procfile` (`web: npm start`)
- `npm start` script (`node src/server.js`)
- Node engine requirement in `package.json`
- `Aptfile` packages for OCR/PDF binaries (`poppler-utils`, `tesseract-ocr`, `tesseract-ocr-eng`)

Heroku settings required for OCR features:

```bash
heroku buildpacks:add --index 1 heroku-community/apt
heroku buildpacks:add --index 2 heroku/nodejs
heroku config:set TESSDATA_PREFIX=/app/.apt/usr/share/tesseract-ocr/5/tessdata
```

Example deploy commands:

```bash
heroku create <your-app-name>
git push heroku <your-branch>:main
heroku open
```

## API

Module: `src/survey-api.js`

### `new SurveyCadClient(options?)`

Optional endpoint overrides:
- `adaMapServer` (default Ada County Assessor MapServer)
- `layers.address|ros|subdivisions|townships|sections|parcels`
- `blmFirstDivisionLayer`
- `blmSecondDivisionLayer`
- `nominatimUrl`
- `nominatimUserAgent` (default `survey-cad/1.0 (contact: admin@example.com)`)
- `nominatimEmail` (default `admin@example.com`; sent to Nominatim as `email=` query param)
- `arcgisGeocodeUrl` (default ArcGIS World Geocode `findAddressCandidates` endpoint, used as geocode fallback when Nominatim is unavailable)

### Core methods

- `geocodeAddress(address)`
- `findBestAddressFeature(address)`
- `findParcelNearPoint(lon, lat, outSR?, searchMeters?)`
- `findContainingPolygon(layerId, lon, lat, searchMeters?)`
- `findRosNearPoint(lon, lat, searchMeters?)`
- `loadSectionAtPoint(lon, lat)`
- `loadAliquotsInSection(sectionFeature)`
- `lookupByAddress(address)` (accepts addresses like `5707 W Castle Dr, Boise ID`; trailing state in the city segment is normalized before querying Ada County address records)

### Utility exports

- `parseAddress(rawAddress)`
- `buildAddressWhere(parsedOrRaw)`
- `buildFallbackAddressWhere(parsedOrRaw)`
- `scoreAddressCandidate(parsedOrRaw, attrs)`
- `arcgisQueryUrl(layerUrl, paramsObj)`
- `pointInRing(pointXY, ring)`
- `pointInPolygon(pointXY, esriPolygonGeom)`
- `haversineMeters(lat1, lon1, lat2, lon2)`

## Web Server Endpoints

Base entrypoint: `npm start` (or `node src/server.js`)

### Health check

```bash
curl "http://localhost:3000/health"
curl "http://localhost:3000/api/apps"
```

### API endpoints

```bash
curl "http://localhost:3000/api/geocode?address=1600%20W%20Front%20St%2C%20Boise"
curl "http://localhost:3000/api/static-map?lat=43.610000&lon=-116.200000&address=1600%20W%20Front%20St%2C%20Boise"
curl "http://localhost:3000/api/lookup?address=1600%20W%20Front%20St%2C%20Boise"
curl "http://localhost:3000/api/section?lon=-116.2&lat=43.61"
curl "http://localhost:3000/api/parcel?lon=-116.2&lat=43.61&outSR=2243&searchMeters=150"
curl "http://localhost:3000/api/aliquots?lon=-116.2&lat=43.61"
curl "http://localhost:3000/api/aliquots?lon=-116.2&lat=43.61&outSR=2243"
curl "http://localhost:3000/api/subdivision?lon=-116.2&lat=43.61&outSR=2243"
curl "http://localhost:3000/api/ros-pdf?url=https%3A%2F%2Fexample.com%2Fros.pdf"
curl "http://localhost:3000/api/project-file/template?projectName=Demo&client=Ada%20County&address=100%20Main%20St%2C%20Boise"
curl -X POST "http://localhost:3000/api/project-file/compile" \
  -H "Content-Type: application/json" \
  -d "{"project":{"projectName":"Demo","client":"Ada County","address":"100 Main St, Boise"}}"
```

Upstream HTTP failures from third-party services (for example, geocoding provider 403s) are returned as `502 Bad Gateway` from this API so callers can distinguish dependency outages from client-side request validation errors. Geocoding now tries Nominatim first and then automatically falls back to ArcGIS World Geocode when Nominatim fails. `/api/lookup` will still return a successful payload when geocoding fails but the Ada County address layer returns a match (including a fallback query that relaxes directional/suffix filters). If both data sources fail to locate the address, `/api/lookup` returns a clear validation error instead of bubbling an upstream HTTP error.
When requesting projected output (`outSR`, e.g. `2243`) from `/api/parcel` and `/api/subdivision`, the server now first resolves the containing feature in WGS84 and then refetches that exact record by `OBJECTID` in the requested spatial reference to keep CSV/export geometry aligned with the looked-up address. If the projected refetch is rejected by the upstream ArcGIS layer, the API now gracefully falls back to the original WGS84 geometry instead of failing the request. If `/api/subdivision` receives an upstream projection error for the initial requested `outSR`, the server retries the same lookup in WGS84 (`4326`) and still returns a successful payload when possible. `/api/subdivision` and related lookup flows also fall back to nearest returned polygon when the point is outside all returned rings, preventing centroid helper runtime errors and preserving a valid geometry response.

### Browser helper module for static HTML tools

The static HTML tools use `src/browser-survey-client.js` so network calls flow through shared server endpoints backed by `SurveyCadClient`:

- `lookupByAddress(address)` → `/api/lookup` (if Ada County address layer misses but geocoding succeeds, `RecordQuarry.html` continues lookup using geocoded coordinates)
- `findParcelNearPoint(lon, lat, outSR?, searchMeters?)` → `/api/parcel`
- `loadSectionAtPoint(lon, lat)` → `/api/section`
- `loadAliquotsAtPoint(lon, lat, outSR?)` → `/api/aliquots`
- `loadSubdivisionAtPoint(lon, lat, outSR?)` → `/api/subdivision`
- `buildRosPdfProxyUrl(url)` → `/api/ros-pdf?url=...` (stream ROS/aliquot PDFs through the API server to avoid browser CORS blocking; supports absolute URLs and relative PDF paths found in ArcGIS attributes)

### Static HTML files

Any repository-root static file can be requested directly. File path matching is case-insensitive, so `/CPNF.HTML` and `/cpnf.html` both resolve to the same file. Examples:

```bash
curl "http://localhost:3000/RecordQuarry.html"
curl "http://localhost:3000/CPNF.HTML"
curl "http://localhost:3000/cpnf.html"
curl "http://localhost:3000/POINT_TRANSFORMER.HTML"
curl "http://localhost:3000/VIEWPORT.HTML?source=pointforge"
curl "http://localhost:3000/ROS_OCR.html"
curl -X POST "http://localhost:3000/extract?maxPages=1&dpi=220&debug=1" \
  -F "pdf=@/absolute/path/to/ros.pdf;type=application/pdf"
curl -X POST "http://localhost:3000/extract?maxPages=3&dpi=400&allowSlow=1" \
  -F "pdf=@/absolute/path/to/ros.pdf;type=application/pdf"
```

`/` defaults to `index.html` (the SurveyFoundry app launcher). The launcher now loads its app tiles from `/api/apps` at runtime, renders each app's `iconPath` SVG icon, and displays app names only on launcher tiles (not raw HTML filenames). `ROS_OCR.html` posts to `/extract`, which is now served by the main `npm start` web server (same behavior as the standalone ROS OCR app).

`VIEWPORT.HTML` drag locking behavior: points and lines are locked by default and can only be drag-moved after you double-click to toggle them to movable. Persisted/imported movable flags now only unlock dragging when the value is strict boolean `true`.
`VIEWPORT.HTML` also includes **Display** toggles so you can independently hide/show drawn point **codes** and **notes** while keeping point numbers visible.
`VIEWPORT.HTML` now supports an optional map backdrop layer behind the drawing canvas (off by default) with a tile selector (default **Satellite**, with OpenStreetMap alternatives) and an opacity slider (default **10%**) so sketches can be visually aligned to map context without changing point/line drawing behavior.
When the map layer is enabled and drawing points are present, LineSmith now auto-zooms/centers the canvas to the point extents (without adding an undo history entry) so the basemap view aligns with the same coordinates shown in the drawing.
`VIEWPORT.HTML` now draws line **bearing + distance** labels when zoom/line length allows the text to fit beside the segment and when the computed label bounds do not overlap existing point text labels. The Selection section also includes an inspector card that reports bearing + distance for either the actively selected line or exactly two selected points.


### ROS standalone tool command

Run the web app and open the ROS helper directly:

```bash
npm start
open http://localhost:3000/RecordQuarry.html
```

PointForge → LineSmith handoff (imports transformed output points into LineSmith):

```bash
npm start
open http://localhost:3000/POINT_TRANSFORMER.HTML
```

In PointForge, click **Open in LineSmith** after processing points; this navigates to `VIEWPORT.HTML?source=pointforge` (inside the launcher iframe when embedded, or current tab when standalone) and auto-imports the transformed points via browser local storage.
PointForge handoff uses `number,x,y,z,code,notes` ordering (code immediately after z, notes immediately after code), and now writes the exact state-plane drawing coordinates expected by LineSmith with no additional normalization at import handoff.
PointForge handoff payloads now also include georeference metadata (`zone`, `swapXY`, and sampled WGS84 lat/lon pairs) so LineSmith can align map zoom/centering to imported state-plane coordinates instead of treating feet values as degrees.
LineSmith now solves a best-fit affine transform from Idaho State Plane West (US-ft) `x/y` to WGS84 `lat/lon` using the sampled PointForge georeference points, then syncs map center + zoom from the drawing extents so panning/zooming tracks imported state-plane geometry correctly on the basemap.

`RecordQuarry.html` also supports one-click **Export to PointForge** for unique parcel/subdivision/aliquot boundary vertices. The button stores a temporary payload in browser local storage and navigates to `POINT_TRANSFORMER.HTML?source=ros` (inside the launcher iframe when embedded, or current tab when standalone), where PointForge auto-loads the incoming CSV points.
PointForge export now performs CP&F lookups for aliquot/section (PLSS) corners before writing the handoff payload, and only includes PLSS points that have matching CP&F instrument records (parcel/subdivision points are still exported as usual).
When launched with an active project, RecordQuarry also updates a project-file snapshot in browser local storage (`surveyfoundryProjectFile:<projectId>`), adding all discovered CP&F instrument references into the `CP&Fs` folder and recording the outgoing PointForge CSV handoff in `Point Files`.
When launched with an active project, PointForge now also writes imported and exported point sets into the project file `Point Files` folder as local-storage-backed resources. Uploaded imports keep the source filename, pasted imports prompt for a name, ROS imports are labeled as exported from RecordQuarry, edited exports append `Edited` to the import-derived filename, and imports/exports append a date token (`M D YY`) when the base name does not already include one.
`PROJECT_BROWSER.html` now prefers the persisted in-browser project-file snapshot (`surveyfoundryProjectFile:<projectId>`) so CP&Fs and Point Files added during Quarry → Forge → Smith workflows appear immediately; it falls back to `/api/project-file/template` only when no stored snapshot exists.
Point-file rows in `PROJECT_BROWSER.html` now include **Open in PointForge**, which stores the selected local-storage-backed point file and navigates to `POINT_TRANSFORMER.HTML?source=project-browser` so PointForge auto-loads that point set into input.
Point-file rows are also directly tappable/clickable (with keyboard Enter/Space support), so mobile users can open a point file in PointForge without needing the small action button.
CP&F rows in `PROJECT_BROWSER.html` now include **Open PDF** and are also directly tappable/clickable, opening the instrument PDF in a new browser tab/window through `/api/ros-pdf`.
Project Browser point-file folders now support desktop drag-and-drop uploads and a mobile-friendly **Choose Point Files** picker (`.csv` and `.txt`/`text/csv`), which attaches files to the active project's persisted project-file snapshot for immediate PointForge launch.
PointForge also now includes a **Switch to Point Editor View** toggle that swaps input/output textareas for a LineSmith-style tabular point editor/read-only output table (`#`, `X`, `Y`, `Z`, `Code`, `Notes`) while keeping transform processing behavior unchanged.
PointForge now also includes a **Renumber start** control (default `1`) with a **Renumber Output** action button; standard Process behavior remains unchanged, and sequential repacking is only applied when the renumber button is pressed (for example, start at `1000` to move the set into a new range).

Project Browser → PointForge deep-link command:

```bash
npm start
open "http://localhost:3000/PROJECT_BROWSER.html?activeProjectId=project-123&activeProjectName=Demo%20Project"
```

`RecordQuarry.html` **Export CSV** now emits simplified point codes in the description column (`COR`, `SUB`, `SECOR`, `14COR`, `16COR`, `CSECOR`) and appends a notes column. For aliquot/section corners with matching CP&F records, the notes value is formatted as `CPNFS: <instrument>...<instrument>`.

`RecordQuarry.html` now shows a processing modal while export flows are busy gathering CPNF instrument numbers for aliquot/section corner notes, so long-running CP&F lookups have visible progress feedback before CSV download or PointForge handoff completes.

RecordQuarry.html now applies mobile-first layout guards so the Leaflet map retains a real viewport height and export controls wrap instead of clipping on narrow screens.

`RecordQuarry.html` supports GeoJSON export for the current lookup (parcel, subdivision, section, township, ROS, aliquots, and selected address point).
`RecordQuarry.html` now keeps ROS and aliquot results scoped to the lookup address context (containing section and related lookup records), and ROS map popups include both description text and PDF links routed through `/api/ros-pdf`.

`RecordQuarry.html` Summary cards for ROS and aliquots are now interactive: selecting a summary item centers/zooms the map to that feature and opens the related popup when possible.
Aliquot Summary cards and aliquot map popups both surface CP&F PDF links routed through `/api/ros-pdf`.
Aliquot Summary cards now also lazy-load corner-derived CP&F records after card render, ensuring CP&F PDFs appear when available even when aliquot attributes do not include direct PDF fields.
RecordQuarry export now supports aliquot-level inclusion filters: click aliquot polygons on the map to toggle include/exclude state, or use the **Include in export** checkbox on each aliquot Summary card before running **Export CSV** or **Export to PointForge**.


## App Icons Catalog

Generated app icon SVG files are stored under `assets/icons/` and can be regenerated with:

```bash
npm run icons:generate
```

Catalog endpoint:

```bash
curl "http://localhost:3000/api/apps"
```

Launcher icon mappings now use the shipped PNG assets for core apps:

- `SurveyFoundry` → `/assets/icons/SurveyFoundry.png`
- `RecordQuarry` → `/assets/icons/RecordQuarry.png`
- `PointForge` → `/assets/icons/PointForge.png`
- `LineSmith` → `/assets/icons/LineSmith.png`
- `Project Browser` → `/assets/icons/project-browser.svg` (folder emoji icon)

### SurveyFoundry project file concept

SurveyFoundry now supports a **project file** manifest that symbolically represents the final downloadable project archive (`.zip`).

- The manifest defines fixed folders: `RoS`, `CP&Fs`, `Point Files`, `Drawings`, `Deeds`, `Plats`, `Invoices`, and `Other`.
- Each folder stores an indexed list of resource references rather than embedded binaries.
- At compile time, each reference can be resolved into export files (for example, CP&Fs by instrument number to PDF, or PointForge point sets to CSV) and mapped into an archive plan.
- The API returns both the generated project file and an archive-entry plan, including unresolved references for later resolver wiring.

### SurveyFoundry project workflow

`index.html` (SurveyFoundry launcher) now includes a lightweight project manager for RecordQuarry/PointForge/LineSmith workflows:

- Use **Choose project** to open a project-manager dialog so the launcher home stays focused on app selection.
- Create a project with **project name**, **client**, **client contact info**, **billing rate**, **address**, and **project description** (creation auto-activates the project and returns to launcher focus).
- Existing projects can be managed in-place with **Rename**, **Edit details**, and **Delete** actions.
- Projects now include a sequential **status** lifecycle with one-click advancement: `Proposed → Researched → Calculated → Tied → Drafted → Pin Set → Final Drafted → Submitted → Recorded → Billed → Paid → Archived`.
- Start that project directly in RecordQuarry via **Start in RecordQuarry**.
- Launcher app cards now display each app's catalog description under the app name for quicker selection context.
- Launcher app cards align app icons to the top-left of each card for consistent vertical layout with multi-line descriptions.
- Launcher header now uses the SurveyFoundry app icon, and the legacy SurveyFoundry logo is moved to a centered enlarged footer treatment at the bottom of the launcher view.
- Launcher header icon/title are vertically centered together, the footer logo appears only on the launcher home screen at a 1280px max-width display size, and on mobile the embedded app viewer presents a full-width iframe.
- Launcher opens `RecordQuarry.html` with query parameters (`projectId`, `projectName`, `client`, `address`, `autostart=1`).
- When a launcher active project is set, every app opened from the launcher receives `activeProjectId` and `activeProjectName` query parameters so tools can save/load project-scoped data.
- Launcher header now displays the active project name whenever a project is active, giving persistent context while moving between tools.
- When a project is active and includes an address, the launcher geocodes that address via `GET /api/geocode` and requests a background image through `GET /api/static-map` (server proxy).
`/api/static-map` now prefers Esri World Imagery satellite tiles for project backgrounds, retries a direct OpenStreetMap street tile for the same coordinates if satellite is unavailable, and finally returns the generated SVG fallback when no upstream imagery source is reachable.
- RecordQuarry runs the lookup and saves the lookup payload snapshot to browser local storage under `surveyfoundryProjectLookup:<projectId>`.
- Re-opening the same project restores saved RecordQuarry results from local storage before falling back to a live lookup.
- Exporting from RecordQuarry to PointForge also writes/updates a project-file snapshot in local storage (`surveyfoundryProjectFile:<projectId>`) so discovered CP&F references persist with the project record.

Example launcher deep-link with active project context:

```bash
open "http://localhost:3000/RecordQuarry.html?activeProjectId=project-123&activeProjectName=Demo%20Project"
```

Project Browser deep-link command:

```bash
open "http://localhost:3000/PROJECT_BROWSER.html?activeProjectId=project-123&activeProjectName=Demo%20Project"
```

Current apps in the catalog:

- **SurveyFoundry Launcher** (`index.html`): Projects, evidence, and outputs—end to end.
- **LineSmith** (`VIEWPORT.HTML`): Turns points into boundaries, alignments, and structure; now supports mobile-first canvas gestures (pinch-zoom, drag-pan, long-press select/box-select), plus long-press add-point placement when the Add Point tool is active, with a slide-out tools drawer.

Mobile launch command:

```bash
open "http://localhost:3000/VIEWPORT.HTML"
```
- **RecordQuarry** (`RecordQuarry.html`): Harvests plats, ROS, CP&F, parcels, and subdivisions into structured evidence.
- **Project Browser** (`PROJECT_BROWSER.html`): Browse a symbolic SurveyFoundry project-file folder tree as a standalone app.
- **PointForge Transformer** (`POINT_TRANSFORMER.HTML`): Builds the canonical point set (coords + provenance + weights).

Experimental apps:

- **ROS Basis Extractor** (`ROS_OCR.html`): OCR-based basis-of-bearing extraction from uploaded PDFs.
- **PLSS + CP&F Explorer** (`CPNF.HTML`): aliquot/corner viewer with Ada County CP&F lookups.

## CLI Commands

Entry: `src/cli.js`

```bash
npm run cli -- --help
node src/cli.js lookup --address "1600 W Front St, Boise"
node src/cli.js section --lat 43.61 --lon -116.20
node src/cli.js aliquots --lat 43.61 --lon -116.20
node src/cli.js parcel --lat 43.61 --lon -116.20 --outSR 2243
```

All CLI commands print JSON to stdout.

Generate a symbolic project-file + zip archive plan:

```bash
node src/cli.js project-file --projectName "Demo" --client "Ada County" --address "100 Main St, Boise" --resource "cpfs|instrument-number|2019-12345|CP&F 2019-12345" --resource "point-files|pointforge-set|set-77|Boundary points"
```

## ROS Basis Extractor Standalone App

The ROS OCR extractor is a dedicated app that accepts a Record of Survey PDF and returns detected basis-of-bearing candidates.

### Start standalone ROS OCR API

```bash
npm run ros:ocr
open http://localhost:3001/
```

Defaults: host `0.0.0.0`, port `3001` (`PORT` env var overrides). The standalone HTML app page is served at `/` (file: `ROS_OCR.html`).

### ROS OCR API endpoints

```bash
curl "http://localhost:3001/health"
curl "http://localhost:3001/"   # standalone HTML page
curl -X POST "http://localhost:3001/extract?maxPages=1&dpi=220&debug=1" \
  -F "pdf=@/absolute/path/to/ros.pdf;type=application/pdf"
curl -X POST "http://localhost:3001/extract?maxPages=3&dpi=400&allowSlow=1" \
  -F "pdf=@/absolute/path/to/ros.pdf;type=application/pdf"
curl "http://localhost:3001/extract/jobs/<jobId>"   # poll async OCR job status/result
```

`/extract` response shape:
- `pdf`: uploaded filename basename
- `best`: top-ranked basis candidate (or `null`)
- `candidates`: all candidate detections
- `diagnostics`: included when `debug=1` (includes detected `tessdata_prefix`)
- `request`: normalized request settings (`requestedMaxPages`, `requestedDpi`, applied `maxPages`, applied `dpi`, and `allowSlow`)

If Tesseract has no installed OCR languages (for example missing `eng.traineddata`), the extractor returns `best: null` / empty `candidates` and, when `debug=1`, includes a clear diagnostics error describing how to install tessdata or configure `TESSDATA_PREFIX`.

`/extract` query parameters:
- `maxPages` (default request value `1`)
- `dpi` (default request value `220`)
- `debug` (`1` to include diagnostics)
- `allowSlow` (`1` to bypass safety clamping and run in async job mode)
- `async` (`1` to force async job mode even when `allowSlow=0`)

When `allowSlow=1` (or `async=1`), `/extract` immediately returns `202 Accepted` with `jobId`/`statusUrl` and performs OCR in the background. Poll `GET /extract/jobs/:jobId` until `status` becomes `completed` (includes full extraction payload) or `failed` (includes error).

When `allowSlow` is not enabled, the API clamps expensive runs to reduce timeout/503 risk on Heroku-style 30s request limits (defaults can be tuned with `ROS_OCR_MAX_PAGES` and `ROS_OCR_DPI`). This avoids relying on router timeout changes that are not configurable on standard Heroku web dynos.

### ROS OCR CLI

```bash
npm run ros:cli -- --pdf /absolute/path/to/ros.pdf
npm run ros:cli -- --pdf /absolute/path/to/ros.pdf --maxPages 3 --dpi 400 --debug
```

CLI prints the same JSON payload returned by `/extract`.


### RecordQuarry.html enhancements

- `RecordQuarry.html` now includes BLM aliquot lookup/mapping in the map results panel.
- `RecordQuarry.html` now includes an **Export to PointForge** button that opens `POINT_TRANSFORMER.HTML?source=ros` and transfers unique boundary CSV points via local storage.
- ROS cards now link PDFs through `/api/ros-pdf` so PDFs are loaded via this app server.
- Aliquot cards now also surface any PDF attribute links and route them through `/api/ros-pdf`.
- Clicking a parcel/subdivision/aliquot corner marker in `RecordQuarry.html` now queries nearby Ada County CP&F records and shows CP&F PDF download links (proxied through `/api/ros-pdf`).
- CP&F lookups in `RecordQuarry.html` now JSON-encode ArcGIS geometry query parameters and filter returned records to the selected corner radius, preventing section-wide CP&F lists from appearing on each corner popup.
- Subdivision boundary and parcel/subdivision/aliquot corner markers are drawn on the map.
- Parcel CSV export from `RecordQuarry.html` now emits unique boundary points only (parcel + subdivision + aliquot corners), deduplicated to one row per coordinate in P,N,E,Z,D format (EPSG:2243); section-only corners that are not drawn are excluded.
