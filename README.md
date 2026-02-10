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


## CLI Commands

```bash
npm run cli -- --help
npm run ros:cli -- --help
npm run icons:generate
```

## RecordQuarry Launch Params

`RecordQuarry.html` supports launcher query params for auto-loading and cached restore behavior:

- `address` / `activeAddress`: pre-fills the address input.
- `autostart=1`: automatically runs lookup on open (and reuses cached per-address results when available).
- `projectId` / `activeProjectId`, `projectName` / `activeProjectName`, `client` / `activeClient`: enables project-context restore/save snapshots.

Example:

```bash
open "http://localhost:3000/RecordQuarry.html?address=100%20Main%20St%2C%20Boise&autostart=1"
```


## ArrowHead AR Launch

`ArrowHead.html` is a mobile-first augmented-reality viewer that is launched from LineSmith.

- LineSmith writes handoff geometry into localStorage key `lineSmithArrowHeadImport`.
- ArrowHead reads this payload and overlays LineSmith points/linework on a live camera feed.
- While both apps are open, LineSmith now re-syncs that handoff payload every second (and whenever ArrowHead is opened), and ArrowHead listens for storage updates plus a 1s fallback poll so moved points/edited lines update live in AR without a relaunch.
- ArrowHead now projects points from ENU deltas to camera screen space using relative bearing/elevation (plus roll compensation) so on-screen direction matches both the device heading and source survey geometry.
- ArrowHead now prefers iOS Safari `webkitCompassHeading` (with `deviceorientationabsolute` fallback) and remaps pitch/roll by current screen orientation so overlays track correctly as you turn/tilt the phone instead of sticking to screen center.
- ArrowHead now locks onto absolute heading streams (compass/`deviceorientationabsolute`) once detected so fallback relative-orientation events cannot overwrite heading with north-locked values when you turn your body.
- ArrowHead now defaults to magnetometer heading but includes a **Use Gyroscope Heading** toggle; when enabled, heading is integrated from gyroscope `rotationRate.alpha` and can be calibrated to true north with the **Center** button while the phone is level and facing north.
- ArrowHead avoids modern-only JavaScript syntax (optional chaining/object spread) so iOS 13 Safari/WebKit can parse and run the AR overlay without reducing AR feature behavior.
- ArrowHead now marks points as **On target** when they land inside the center 10% of the camera feed, drawing a green circle around the point and overlaying live distance-to-point guidance in meters and feet.
- GPS + device orientation/motion sensors are used to place features in real space.
- Point elevations with missing/invalid `z` values (including `z=0`) are rendered using the phone-reported elevation at runtime so horizontal spacing is not distorted by zero-altitude assumptions.
- AR horizontal bearing projection uses heading-minus-target handedness so overlays move in the expected direction when panning left/right.
- ArrowHead now derives forward visibility from the magnetometer-driven heading delta (`cos(relativeBearing)`), so points behind you (for example south while facing north) are culled instead of remaining centered in view.
- XY-to-lat/lon conversion reuses the same LineSmith georeference transform used by LineSmith map alignment (`lat=ax*x+by*y+c`, `lng=ax*x+by*y+c`).

Direct open command (after a LineSmith handoff payload exists):

```bash
open "http://localhost:3000/ArrowHead.html?source=linesmith"
```

AR heading controls after launch:

- Tap **Use Gyroscope Heading** only when magnetometer heading is unreliable.
- Keep the phone level, face due north, then tap **Center** to calibrate gyro heading.
- Leave **Use Gyroscope Heading** off to always use magnetometer-based heading.

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

### Collaboration websocket endpoint

LineSmith and ArrowHead share a realtime websocket room at `/ws/lineforge?room=<room-id>`.

- LineSmith publishes cursor and drawing `state` sync events.
- ArrowHead now joins the same room, renders live LineSmith cursor positions in AR, and publishes `ar-presence` updates containing state-plane `x/y`, GPS `lat/lon/altFeet`, and orientation (`headingRad`, `pitchRad`, `rollRad`).
- LineSmith consumes `ar-presence` and draws ArrowHead users on the map layer with a directional triangle cone.

Quick local run command:

```bash
npm start
open "http://localhost:3000/VIEWPORT.HTML"
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
curl "http://localhost:3000/api/localstorage-sync"
curl -X POST "http://localhost:3000/api/project-file/compile" \
  -H "Content-Type: application/json" \
  -d "{"project":{"projectName":"Demo","client":"Ada County","address":"100 Main St, Boise"}}"
curl -X POST "http://localhost:3000/api/localstorage-sync" \
  -H "Content-Type: application/json" \
  -d "{"version":1739072645000,"snapshot":{"surveyfoundryProjects":"[]","surveyfoundryLocalStorageVersion":"1739072645000"}}"
```

WebSocket endpoint for LineSmith realtime collaboration:

```bash
# browser client connects automatically from VIEWPORT.HTML
# manual endpoint format
ws://localhost:3000/ws/lineforge?room=<room-id>
```

Upstream HTTP failures from third-party services (for example, geocoding provider 403s) are returned as `502 Bad Gateway` from this API so callers can distinguish dependency outages from client-side request validation errors. Geocoding now tries Nominatim first and then automatically falls back to ArcGIS World Geocode when Nominatim fails. `/api/lookup` will still return a successful payload when geocoding fails but the Ada County address layer returns a match (including a fallback query that relaxes directional/suffix filters). If both data sources fail to locate the address, `/api/lookup` returns a clear validation error instead of bubbling an upstream HTTP error.
When requesting projected output (`outSR`, e.g. `2243`) from `/api/parcel` and `/api/subdivision`, the server now first resolves the containing feature in WGS84 and then refetches that exact record by `OBJECTID` in the requested spatial reference to keep CSV/export geometry aligned with the looked-up address. If the projected refetch is rejected by the upstream ArcGIS layer, the API now gracefully falls back to the original WGS84 geometry instead of failing the request. If `/api/subdivision` receives an upstream projection error for the initial requested `outSR`, the server retries the same lookup in WGS84 (`4326`) and still returns a successful payload when possible. `/api/subdivision` and related lookup flows also fall back to nearest returned polygon when the point is outside all returned rings, preventing centroid helper runtime errors and preserving a valid geometry response.

`/api/localstorage-sync` provides an in-memory localStorage mirror for the current Node.js server process. The launcher sends the full localStorage snapshot plus a numeric `version` (`surveyfoundryLocalStorageVersion`) whenever browser storage changes. If the browser posts an older version than the server has, the API responds with `status: "client-stale"` and the newer server snapshot so the launcher can replace stale browser storage and refresh the currently open iframe app without changing the app route/view.

`/api/localstorage-sync` traffic is now change-driven in the launcher: the app skips POST requests when the local snapshot is unchanged, and stale snapshot application updates in-memory storage without forcing iframe reloads. This prevents AR and viewport sessions from being reset by background sync churn while still propagating updated geometry/state data.

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
When an app is open in the launcher iframe (including LineSmith), clicking the header back chevron now always returns directly to the SurveyFoundry App Launcher home screen without unsaved-change guard prompts.

`VIEWPORT.HTML` drag locking behavior: points and lines are locked by default and can only be drag-moved after you double-click to toggle them to movable. Persisted/imported movable flags now only unlock dragging when the value is strict boolean `true`.
When no command is active and nothing is selected, `VIEWPORT.HTML` now treats a double right-click the same as double Escape for lock recovery: the first press prompts and the second locks the last unlocked point/line.
`VIEWPORT.HTML` also includes **Display** toggles so you can independently hide/show drawn point **codes** and **notes** while keeping point numbers visible.
`VIEWPORT.HTML` now supports an optional map backdrop layer behind the drawing canvas (off by default) with a tile selector (default **Satellite**, with OpenStreetMap alternatives) and an opacity slider (default **66%**) so sketches can be visually aligned to map context without changing point/line drawing behavior.
When the map layer is enabled and drawing points are present, LineSmith now auto-zooms/centers the canvas to the point extents (without adding an undo history entry) so the basemap view aligns with the same coordinates shown in the drawing.
`VIEWPORT.HTML` now draws line **bearing + distance** labels when zoom/line length allows the text to fit beside the segment and when the computed label bounds do not overlap existing point text labels. The Selection section also includes an inspector card that reports bearing + distance for either the actively selected line or exactly two selected points.
The Selection section now also includes a point inspector card that shows selected point fields and parses CP&F instrument references from point notes (`CPNFS:` with `...` delimiters), with one-click links to open each CP&F PDF by instrument number.
The drawing version restore prompt now renders each saved revision on its own line, preventing script parse errors when opening project-linked drawing history.
When saving drawing metadata back into a project file, LineSmith now ignores malformed/null drawing index entries before updating IDs, preventing `Cannot read properties of null (reading 'id')` runtime errors for older or hand-edited project snapshots.


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

In PointForge, click **Open in LineSmith** from the **upper-right header workflow button** after processing points; this navigates to `VIEWPORT.HTML?source=pointforge` (inside the launcher iframe when embedded, or current tab when standalone) and auto-imports the transformed points via browser local storage, with the map layer defaulted on for the imported handoff view.
PointForge header copy is now intentionally minimal (badge-only) on mobile so the **Open in LineSmith** workflow button stays visible without text wrapping pushing the action out of view.
PointForge handoff uses `number,x,y,z,code,notes` ordering (code immediately after z, notes immediately after code), and now writes the exact state-plane drawing coordinates expected by LineSmith with no additional normalization at import handoff.
PointForge handoff payloads now also include georeference metadata (`zone`, `swapXY`, and sampled WGS84 lat/lon pairs) so LineSmith can align map zoom/centering to imported state-plane coordinates instead of treating feet values as degrees.
PointForge-triggered LineSmith launches now import points before collaboration hydration and skip applying stale welcome-state snapshots from prior rooms, preventing imported drawings from being replaced by the previously open drawing state.
LineSmith now solves a best-fit affine transform from Idaho State Plane West (US-ft) `x/y` to WGS84 `lat/lon` using the sampled PointForge georeference points, then syncs map center + zoom from the drawing extents so panning/zooming tracks imported state-plane geometry correctly on the basemap.
LineSmith now re-measures the canvas viewport and forces a Leaflet size recalculation when the desktop inspector drawer is collapsed or expanded so map tracking stays aligned with drawing pan/zoom.
On touch devices, a single tap now executes the same primary canvas action path as a desktop left click (selection, add-point, line commands, and related tool actions), while long-press behavior remains available for drag/marquee workflows.

`RecordQuarry.html` also supports one-click **Export to PointForge** from a prominent **upper-right header workflow button** for unique parcel/subdivision/aliquot boundary vertices. The button stores a temporary payload in browser local storage and navigates to `POINT_TRANSFORMER.HTML?source=ros` (inside the launcher iframe when embedded, or current tab when standalone), where PointForge auto-loads the incoming CSV points.
PointForge export now performs CP&F lookups for aliquot/section (PLSS) corners before writing the handoff payload, and only includes PLSS points that have matching CP&F instrument records (parcel/subdivision points are still exported as usual).
When launched with an active project, RecordQuarry also updates a project-file snapshot in browser local storage (`surveyfoundryProjectFile:<projectId>`), adding all discovered CP&F instrument references into the `CP&Fs` folder and recording the outgoing PointForge CSV handoff in `Point Files`.
RecordQuarry now normalizes CP&F instrument numbers (trimmed, uppercased, collapsed whitespace) before persisting them, preventing duplicate `CP&Fs` entries caused by formatting variants across exports.
RecordQuarry now accepts both canonical and launcher-alias query params for project context (`projectId`/`activeProjectId`, `projectName`/`activeProjectName`, `client`/`activeClient`, and `address`/`activeAddress`), ensuring CP&F project-file updates still persist when launched from Project Browser style deep links.
RecordQuarry now also caches lookup payloads per normalized address (`surveyfoundryAddressLookup:<address>`) and restores the latest saved address lookup when reopened, including parcel/aliquot export include/exclude selections so selected and deselected states persist across sessions.
When launched with an active project, PointForge now also writes imported and exported point sets into the project file `Point Files` folder as local-storage-backed resources. Uploaded imports keep the source filename, pasted imports prompt for a name, ROS imports are labeled as exported from RecordQuarry, edited exports append `Edited` to the import-derived filename, and imports/exports append a date token (`M D YY`) when the base name does not already include one.
PointForge now also remembers the last project point file that was open (`surveyfoundryLastPointforgePointSet:<projectId>`), and when PointForge is opened directly with the same active project (without a handoff `source` query param) it auto-loads that last open point set.
`PROJECT_BROWSER.html` now prefers the persisted in-browser project-file snapshot (`surveyfoundryProjectFile:<projectId>`) so CP&Fs and Point Files added during Quarry → Forge → Smith workflows appear immediately; it falls back to `/api/project-file/template` only when no stored snapshot exists.
Point-file rows in `PROJECT_BROWSER.html` now include **Open in PointForge**, which stores the selected local-storage-backed point file and navigates to `POINT_TRANSFORMER.HTML?source=project-browser` so PointForge auto-loads that point set into input.
Point-file rows are also directly tappable/clickable (with keyboard Enter/Space support), so mobile users can open a point file in PointForge without needing the small action button.
CP&F rows in `PROJECT_BROWSER.html` now include **Open PDF** and are also directly tappable/clickable, opening the instrument PDF in a new browser tab/window through `/api/ros-pdf`.
CP&F rows in `PROJECT_BROWSER.html` now also include **Delete**. Deleting a CP&F checks linked project-file `Point Files` entries for `CPNFS:` note references; if linked points are found, Project Browser prompts for confirmation and lists the connected point file + point number/code before removal.
Project Browser point-file folders now support desktop drag-and-drop uploads and a mobile-friendly **Choose Point Files** picker (`.csv` and `.txt`/`text/csv`), which attaches files to the active project's persisted project-file snapshot for immediate PointForge launch.
Project Browser folder views now hide each folder's `index.json` metadata file row so only linked resource files are shown in the list.
PointForge also now includes a **Switch to Point Editor View** toggle that swaps input/output textareas for a LineSmith-style tabular point editor/read-only output table (`#`, `X`, `Y`, `Z`, `Code`, `Notes`) while keeping transform processing behavior unchanged.
LineSmith now includes **Project Drawing Saves** so you can name a drawing, save it into the active project's `Drawings` folder, and create differential save versions that can be restored to any prior state.
Drawing-save history now also persists the latest map georeference transform snapshot so opening a saved drawing from Project Browser restores correct map scale/alignment instead of falling back to world-scale extents.
LineSmith now also remembers the last drawing opened or saved per active project (`surveyfoundryLastLineSmithDrawing:<projectId>`), and when launched directly into LineSmith with that active project (without a handoff `source` query param) it restores that drawing automatically.
LineSmith drawing restore now ignores malformed point/line records and stale selection references from local storage snapshots so opening legacy/corrupt drawing history no longer crashes at boot.
When LineSmith has unsaved edits, clicking the SurveyFoundry launcher back chevron now prompts to **save**, **discard**, or **cancel**; cancel keeps you in LineSmith and save attempts a project-linked drawing save before navigation.
LineSmith now includes an icon-based quick toolbar pinned at the top of the drawing canvas with shortcuts for Save, Select/Move, Add Point, Line by Points, Undo/Redo, Zoom Extents, Center, Extend, Trim/Intersect, and Point Manager; existing Tools drawer workflows remain unchanged.
LineSmith quick toolbar now also includes an **Offset Selected Line** action that runs the same Line Ops offset workflow from canvas controls; set **Line Ops → Offset distance** and then use either toolbar button to create a parallel line (+left / -right from A→B of the selected source line).
LineSmith quick toolbar now also exposes map layer controls (on/off + tile type) and point-label display toggles (codes/notes), mirroring the sidebar Display controls for in-canvas workflows. The map type selector is shown inline without a separate text label, and checkbox controls stay inline with their text labels using native checkbox color styling. Saving from toolbar now prompts for a drawing name when the name field is blank instead of failing silently.
LineSmith now also supports reference-angle rotation for selected geometry: click **Rotate Selection (Reference)**, then pick a base point, a reference-angle point, and a target-angle point to rotate selected points/lines around the base by that angular delta (the angle points can be off-selection picks anywhere on the canvas).
LineSmith rotate workflow now also has a quick-toolbar rotate button and a reusable top-right workflow toast that guides step-by-step (select items to rotate, select a point to rotate around, select a basis of rotation, select a target rotation); when rotate starts with nothing selected, you can window-select first and then continue the rotation picks.
On mobile-sized viewports, LineSmith workflow toasts are repositioned above the bottom command toolbar so tool controls remain tappable while guided instructions are visible.
LineSmith Extend and Trim-to-Intersect now also start a guided two-line selection workflow when launched with no lines preselected, using in-canvas toast prompts for first-line pick, second-line pick, and automatic command execution once both lines are selected.
Trim-to-Intersect now supports trim-boundary-first picking: select the boundary line first, then select the line to trim second; for the second pick, click the side of the line you want trimmed and LineSmith trims that clicked-side endpoint to the computed intersection.
LineSmith guided Extend/Trim workflows now auto-accumulate first and second line picks with normal clicks, so you no longer need to hold Shift during the command; Shift-click remains available for manual multi-select outside guided picking.
LineSmith toolbar tools that require staged input now use the same workflow toast guidance pattern as rotate, including Line: 2 Points, Line: Dist/Bearing, and Point on Line, so each step is surfaced in-canvas as you progress.
During the rotate pick flow, LineSmith now draws live on-canvas guide rays from the base point to your cursor, then keeps the locked reference-bearing ray visible while adding a second base-to-cursor target-bearing ray so the intended rotation is easy to visualize before finalizing.
LineSmith now includes a canvas command line for quick operations: `line <point1> <point2>` draws by point number, `move <dx> <dy>` translates current selection, `rotate` starts the reference rotate pick flow, and `inverse <point1> <point2>` reports distance + bearing between two points.
LineSmith canvas right-click now follows CAD-style cancel behavior: if a command is active (draw/rotate/etc.), right-click cancels the command but keeps selection; a subsequent right-click with no active command clears the current selection.
Escape now runs the exact same LineSmith cancel routine as right-click (cancel active command first, then clear selection on the next press when no command is active).
Escape now also supports quick re-locking: if no command is active, nothing is selected, and the last toggled point/line is currently unlocked, press Escape twice to lock that last-unlocked entity without hunting for it on canvas.
LineSmith now renders unlocked (movable) lines in maroon on-canvas so they are immediately identifiable as editable and potentially unsafe to leave unlocked.
When points are already selected, the quick-toolbar **Line by Points** action now immediately runs **Line Between Selected Points** and then returns to **Select / Move** after creating the linework; with fewer than two selected points it still enters the interactive two-point line tool.
When connecting more than two selected points, LineSmith now checks sequential point-number pair distances against each point's nearest selected point that is not already connected by an existing line. If a closer non-connected selected point exists, LineSmith opens a **Connect Lines** modal with **Sequentially** and **By Distance** actions so you can choose the connection order quickly without a browser confirm/cancel prompt.
Project Browser drawing rows in `PROJECT_BROWSER.html` now include **Open in LineSmith**, launching `VIEWPORT.HTML?source=project-browser-drawing` and auto-loading the latest saved drawing version from project storage.
Project-file folder ordering now pins `Drawings` at the top of the folder list, and LineSmith project drawing entries are re-sorted by latest save time so most recently saved drawings appear first.
PointForge now also includes a **Renumber start** control (default `1`) with a **Renumber Output** action button; standard Process behavior remains unchanged, and sequential repacking is only applied when the renumber button is pressed (for example, start at `1000` to move the set into a new range).

PointForge now uses a simplified launcher-aligned visual theme (header, panels, chips, and action buttons) to match SurveyFoundry app launcher and RecordQuarry styling while reducing UI clutter around ingest/map/output workflows.

PointForge direct launch command:

```bash
npm start
open http://localhost:3000/POINT_TRANSFORMER.HTML
```


Project Browser → PointForge deep-link command:

```bash
npm start
open "http://localhost:3000/PROJECT_BROWSER.html?activeProjectId=project-123&activeProjectName=Demo%20Project"
```

Project Browser → LineSmith drawing deep-link command:

```bash
npm start
open "http://localhost:3000/VIEWPORT.HTML?source=project-browser-drawing&activeProjectId=project-123&activeProjectName=Demo%20Project"
```

LineSmith collaborative session launch examples:

```bash
npm start
# shared room by explicit collab room id
open "http://localhost:3000/VIEWPORT.HTML?collabRoom=demo-shared"
# or tie collaboration room to a drawing id
open "http://localhost:3000/VIEWPORT.HTML?drawingId=boundary-a"
```

`PROJECT_BROWSER.html` CP&F folder rows now include a **Print all** action that opens a single HTML print-preview window and embeds every CP&F PDF (in listed order) for one-shot browser printing.
`PROJECT_BROWSER.html` now opens the CP&F **Print all** preview with a writable same-origin popup handle (without `noopener`) so browsers can reliably inject the preview markup instead of showing a blank tab + blocked-popup warning.
The CP&F print preview now renders each PDF in an iframe with PDF open parameters (`#toolbar=0&navpanes=0&scrollbar=0&view=Fit&zoom=page-fit`) so browser PDF viewers hide side panes/toolbars when supported and request full-page fit scaling for cleaner combined prints. The preview also omits injected per-file headings to avoid nearly blank separator pages between PDFs when printing.

`RecordQuarry.html` **Export CSV** now emits simplified point codes in the description column (`COR`, `SUB`, `SECOR`, `14COR`, `16COR`, `CSECOR`) and appends a notes column. For aliquot/section corners with matching CP&F records, the notes value is formatted as `CPNFS: <instrument>...<instrument>`.

`RecordQuarry.html` now shows a processing modal while export flows are busy gathering CPNF instrument numbers for aliquot/section corner notes, so long-running CP&F lookups have visible progress feedback before CSV download or PointForge handoff completes.

`RecordQuarry.html` now also shows a loading modal during **Lookup** runs (and temporarily disables the Lookup button) so address/parcel/subdivision/section/township/ROS/aliquot fetches have visible progress feedback while data is loading.
`RecordQuarry.html` lookup controls no longer render the internal service/layer pills beneath the address input (`Service: External/ExternalMap`, `Parcel: layer 24`, `Address: layer 16`) to keep the panel focused on user-facing actions.
When launched with an active project address (`activeAddress`/`address` query params), `RecordQuarry.html` now automatically runs lookup for that address; if cached per-address data exists in localStorage it is loaded first, then falls back to project snapshot/live lookup.

RecordQuarry project deep-link command:

```bash
npm start
open "http://localhost:3000/RecordQuarry.html?activeProjectId=project-123&activeProjectName=Demo%20Project&activeAddress=1600%20W%20Front%20St%2C%20Boise"
```

RecordQuarry.html now applies mobile-first layout guards so the Leaflet map retains a real viewport height and export controls wrap instead of clipping on narrow screens.

`RecordQuarry.html` now keeps map space focused on the Leaflet canvas by removing the right-side "Map + Results" header bar; **Export CSV** lives with the left-panel Lookup controls and **Export GeoJSON** is no longer exposed as a UI action.
`RecordQuarry.html` now keeps ROS and aliquot results scoped to the lookup address context (containing section and related lookup records), and ROS map popups include both description text and PDF links routed through `/api/ros-pdf`.

`RecordQuarry.html` Summary cards for ROS and aliquots are now interactive: selecting a summary item centers/zooms the map to that feature and opens the related popup when possible.
Aliquot Summary cards and aliquot map popups both surface CP&F PDF links routed through `/api/ros-pdf`.
Aliquot Summary cards now also lazy-load corner-derived CP&F records after card render, ensuring CP&F PDFs appear when available even when aliquot attributes do not include direct PDF fields.
RecordQuarry export now supports aliquot-level inclusion filters: click aliquot polygons on the map to toggle include/exclude state, or use the **Include in export** checkbox on each aliquot Summary card before running **Export CSV** or **Export to PointForge**.
RecordQuarry parcel and aliquot export selection is now fully click-driven on the map: click parcel/aliquot polygons or their corner markers to toggle inclusion, with selected corners visually emphasized for confirmation; township overlays no longer steal those clicks.
RecordQuarry now defaults aliquots to excluded after each lookup, and renders aliquot polygons/corner markers beneath subdivision+parcel interaction layers so parcel polygons and parcel corners remain clickable when geometries overlap.


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
- Launcher header icon now doubles as a home link (`/`) and is rendered at 84×84 (2× prior size), while the embedded viewer now uses an iframe-only layout with no toolbar controls (legacy **Reload app**, **Back to launcher**, and **Switch app** actions removed).
- When an app is opened, the launcher header title/icon switch to that app, the header icon scales down to half-size (84px → 42px) to free app-view real estate, and a leading chevron appears before the icon to reinforce that clicking either the chevron area or icon returns to launcher home.
- Launcher opens `RecordQuarry.html` with query parameters (`projectId`, `projectName`, `client`, `address`, `autostart=1`).
- When a launcher active project is set, every app opened from the launcher receives `activeProjectId` and `activeProjectName` query parameters so tools can save/load project-scoped data.
- Launcher header now displays the active project name whenever a project is active, giving persistent context while moving between tools.
- Leaving LineSmith with unsaved edits now opens a dedicated modal with **Save and leave**, **Discard changes**, and **Cancel** actions (replacing the old free-text browser prompt) to prevent accidental data loss.
- Browser back/forward navigation now participates in launcher view history so pressing the app-launcher back button while LineSmith is open triggers the same unsaved-change guard and can return to launcher home when confirmed.
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

Project Browser → LineSmith drawing deep-link command:

```bash
npm start
open "http://localhost:3000/VIEWPORT.HTML?source=project-browser-drawing&activeProjectId=project-123&activeProjectName=Demo%20Project"
```

Current apps in the catalog:

- **SurveyFoundry Launcher** (`index.html`): Projects, evidence, and outputs—end to end.
- **LineSmith** (`VIEWPORT.HTML`): Turns points into boundaries, alignments, and structure; now supports mobile-first canvas gestures (pinch-zoom, drag-pan, long-press select/box-select), plus long-press add-point placement when the Add Point tool is active, with a slide-out tools drawer. Desktop blank-canvas left-drag marquee selection remains enabled (Shift adds to selection). On desktop, the inspector/controls drawer now has a left-edge collapse tab (hanging over the canvas boundary) and a right-screen cutout expand tab for quick hide/show toggling. The drawer panel allows horizontal overflow so the collapse tab remains visible instead of being clipped. Collaboration now broadcasts live cursor updates for touch/pointer movement and continuously syncs drag edits (point/line moves) so remote peers see in-progress and committed geometry movement in real time. Collaboration state sync now intentionally excludes viewport pan/zoom (including Zoom to Extents) so each connected user keeps their own local view while shared geometry and selections still sync.

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
- `PROJECT_BROWSER.html` print previews now center CP&F PDF pages within the preview window and force a white background, reducing dark margins and unnecessary ink usage when printing.
