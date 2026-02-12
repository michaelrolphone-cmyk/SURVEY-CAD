# SURVEY-CAD

SURVEY-CAD is a Node.js toolkit and web server for survey workflows. It includes:

- A reusable surveying client (`src/survey-api.js`).
- A web API server (`src/server.js`).
- Command-line tools for survey lookups, project file generation, FLD parsing, point localization, and ROS basis-of-bearing extraction.
- Static browser tools served from the repository root.
  - LineSmith (`VIEWPORT.HTML`) points manager includes row tinting by layer color and optional grouping by Layer or Code for large point sets.

## Requirements

- Node.js `>=20`
- npm
- (Optional, for ROS OCR features) `poppler-utils`, `tesseract-ocr`, `tesseract-ocr-eng`

## Installation

```bash
npm install
```

## Run

```bash
npm start
```

The server binds to `PORT` (default: `3000`) on `0.0.0.0`.

See **API Endpoints** and **CLI Commands** below for the complete endpoint and command reference used by this release.

## LineSmith Loading Experience

When `VIEWPORT.HTML` (LineSmith) opens, a modern non-blocking loading indicator appears while startup tasks run:

- A staged 30-second assembly animation now progressively draws traverse segments and node locks while two markers travel the route, so loading feels like workspace construction instead of short saw-tooth loops.
- A live stage message updates as LineSmith initializes map controls, restores project drawings, and joins collaboration.
- The indicator card floats above the LineSmith UI so you can still see the editor behind it, then auto-dismisses once boot is complete (or after recovery from a startup error).

## Collaboration WebSocket resilience

LineSmith (`VIEWPORT.HTML`) and ArrowHead (`ArrowHead.html`) now auto-retry collaboration room connections when a websocket disconnects:

- Both apps reconnect to `/ws/lineforge?room=...` on a short timer (every few seconds) after an unexpected close.
- Presence/cursor overlays are cleared when a disconnect occurs, then restored as peers rejoin.
- This reconnect loop helps collaboration recover from transient network drops without requiring a manual page refresh.

## LineSmith Point Inspector Editing

When you click a point in `VIEWPORT.HTML`, you can now edit point properties directly inside the **Point Inspector** card:

- Editable fields: point number, X, Y, Z, code, and notes.
- Click **Apply Inspector Edits** to save updates to the selected point.
- The classic **Add / Edit Point** panel remains available and uses the same update workflow.

## LineSmith Multi-Point Inspector Controls

When two or more points are selected in `VIEWPORT.HTML`, the **Point Inspector** now includes a shared-values summary before the per-point editor:

- Shared values render directly for fields that match across all selected points.
- Mismatched values render as a red **Varied** pill; click it to set one value across all selected points.
- A point dropdown appears so you can pick which selected point to inspect/edit in the detailed inspector fields.

## LineSmith Save Shortcuts

When using `VIEWPORT.HTML` (LineSmith), standard OS save shortcuts trigger the same project-linked save workflow as the **Save Drawing to Project** button:

- `Ctrl+S` (Windows/Linux)
- `Cmd+S` (macOS)
- `Ctrl+Shift+S` / `Cmd+Shift+S` (handled as save in-app)
- Successful saves now pulse the quick-toolbar floppy-disk icon so you get immediate visual confirmation that the save completed.

## LineSmith Mouse Shortcut

When no points/lines are selected in `VIEWPORT.HTML`, a **double right-click** zooms out to the next map zoom level at the cursor position.

When using the **Line by 2 points** tool, LineSmith now treats only `null`/`undefined` as "no start point" so legacy drawings that include point id `0` can still complete on the second click.

## LineSmith Mobile Pinch Zoom Stability

LineSmith pinch gestures in `VIEWPORT.HTML` now anchor zoom to the gesture midpoint so two-finger zoom/pan stays stable on mobile instead of drifting across the map.

## API and CLI Notes for this change

This mobile pinch-zoom stability fix does not add or remove server API endpoints or CLI commands; existing endpoint and command references below remain current for this release.

## LineSmith Layer Reassignment Shortcut

When points/lines are selected in `VIEWPORT.HTML`, choosing a layer from the quick layer toolbar dropdown (or clicking **Use** in Layer Manager) now moves the current selection to that chosen layer in one step.

## LineSmith Print View (Record of Survey placeholder)

`VIEWPORT.HTML` now includes a **Print View** panel for generating black-on-white print-ready excerpts from a drawn print window:

- Click the toolbar **Print** icon (next to **Save**) or **Draw Print Window** to arm print capture; the Print icon highlights and an on-screen toast explains the next step, then drag/release a selection window around the area you want to print.
- Choosing a print window now preserves your current selected points/lines (the print window no longer overwrites selection state).
- Paper size defaults to `A4` and can be changed to `A0`, `A1`, `A2`, `A3`, or `Custom` dimensions in millimeters.
- The print scale automatically snaps to the closest supported ratio: `1:1`, `1:5`, `1:10`, `1:20`, `1:30`, `1:40`, `1:50`, `1:100`, `1:200`, `1:500`, `1:1000` (engineering interpretation: `1" = N'`, e.g. `1:50` means 1 inch = 50 feet).
- Output opens in a new print preview window with a landscape **Record of Survey template placeholder** and a print button (no blank popup fallback page).
- `Ctrl+P` / `Cmd+P` now invoke the same in-app **Draw Print Window** workflow so OS-native print shortcuts kick off LineSmith print capture directly.

Quick command support in LineSmith:

```text
printview
```

LineSmith command search keyboard behavior:

- When no text field is focused, typing any printable key anywhere in `VIEWPORT.HTML` now auto-focuses the quick command search input and inserts that character there.
- This keeps command discovery/entry fast without requiring a mouse click into the search field first.
## LineSmith Basis of Bearing

`VIEWPORT.HTML` (LineSmith) now supports defining a **Basis of Bearing** directly in the drawing by selecting two existing point numbers/names:

- Enter a **Start point #/name** and **End point #/name** under the **Basis of Bearing** section (for example `101` and `102`).
- Optionally enter a **Record basis bearing** and **Record basis distance** from the plat/ROS.
- Click **Set Basis of Bearing** to draw a dashed reference line between those two points.
- If a record bearing is entered, LineSmith compares the measured basis bearing to the record bearing and rotates the rendered drawing view (pivoted at the basis start point) so displayed bearings align to record.
- Point coordinates are not modified by this basis-record rotation; inspectors, inverse point-to-point bearings, and drawing bearing labels report the rotated (record-aligned) bearings.
- The reference is clearly labeled **BASIS OF BEARING** on-canvas for plan readability.
- Click **Clear Basis of Bearing** to remove it.

The basis-of-bearing definition is saved/restored with drawing state (local save, project drawing versions, and collaboration state sync).

Bearing annotations now render in DMS using degree/minute/second symbols (`°`, `'`, `"`), round to the nearest whole second for map labels/layout grouping, and orient clockwise from the active basis-of-bearing when one is set. Bearing label text rotation is normalized for readability so bearings prefer top-right facing text (then other right/up readable angles) and do not render upside down even when segment direction is clockwise. Bearing/distance labels are rendered only for eligible linework codes (`BDY`, `BDRY`, `BOUNDARY`, `SEC`, `SECTION`, `COR`, `SUB`, `CL`, `ROW`) or when either endpoint code includes `BEAR`. When a line does not yet have persisted field-to-finish metadata, LineSmith also checks approved bearing codes directly from endpoint point-code tokens (for example `SEC` / `SEC END`) so imported traverse segments still receive bearing labels. Consecutive shared-bearing segments are grouped by a single bearing + total distance label on the left side of travel only when they connect through sequential degree-2 points (no extra branch connections), while individual segment lengths are placed on the opposite side.

## LineSmith Cluster Tooltip During Line Drawing

When point clustering is enabled in `VIEWPORT.HTML` while drawing lines:

- Hovering a point cluster keeps the cluster tooltip open long enough to move from the canvas marker onto the tooltip and choose a specific point.
- For large clusters that collapse to layer-group counts, clicking a layer group drills into the points from that layer in-place.
- Moving off the cluster and not onto the tooltip closes the tooltip after a short delay (normal behavior).

## LineSmith Quick Search

In `VIEWPORT.HTML`, the point/command quick-search flyout is intentionally wider than the input field so long code/notes descriptions remain readable, and point suggestions now display the point number without a `P` prefix.
Display behavior note:

- Selecting a point from quick search now auto-zooms to **10 px/unit** and centers that point in view.

- When **Draw point names** and/or **Draw point codes** are turned off, hovering a point on the canvas shows a tooltip with point name, code, layer, and description (notes).
- When exactly one point is selected, hovering a different point shows an inset summary at the top of the tooltip with inverse **Distance** and **Bearing** back to the selected point, including a layer-colored source point pill (for example: `1234.12' from 123`).
- The inset source-point pill uses dark text to keep point numbers readable on lighter layer colors.

### LineSmith Field-to-Finish commands

LineSmith parses field-to-finish tokens from point codes and can auto-generate geometry:

- `JPN <pointNumber>`: connect this point to another point by point number (e.g. `JPN 102`).
- `<code> BEG/END/CLO`: start/end/close sequential linework for a linework code.
- `CIR <radius>`: draw a circle centered on the point with a radius in drawing units (feet in typical jobs).
  - CIR circles render with a 35% opacity primary stroke and no black underlay so map content remains visible through the circle interior.
  - Supported circle examples: `CIR 2FT END 102G`, `CIR2 BEG WL JPN123`, `CIR2.5`.
- Manual LineSmith line connections now persist to point codes:
  - When a user manually connects two points, LineSmith appends `JPN<targetPointNumber>` to the source point unless that pair is already connected by sequential linework rules.
  - Deleting a line removes matching `JPN` directives when present.
  - Deleting a sequentially generated connection inserts `<code> END` and `<code> BEG` break directives on the connected points so the removed segment stays removed.
- Point code normalization rules (applies to point editor, inspector edits, and auto-inserted linework commands):
  - Duplicate tokens are removed case-insensitively.
  - Sequential directives are de-duplicated per base code with `END` taking precedence over `BEG`, then `CLO`.
  - Tokens are ordered as: primary line code, sequential directives, `JPN` directives, then unrecognized passthrough tokens (for example `154G`).
  - Point Inspector code edits and multi-point "Varied" code updates now immediately re-run field-to-finish linework synchronization so BEG/END/CLO/JPN drawing changes appear without requiring a point-table edit.

### LineSmith Field-to-Finish commands

LineSmith parses field-to-finish tokens from point codes and can auto-generate geometry:

- `JPN <pointNumber>`: connect this point to another point by point number (e.g. `JPN 102`).
- `<code> BEG/END/CLO`: start/end/close sequential linework for a linework code.
- `CIR <radius>`: draw a circle centered on the point with a radius in drawing units (feet in typical jobs).
  - Supported circle examples: `CIR 2FT END 102G`, `CIR2 BEG WL JPN123`, `CIR2.5`.


## LineSmith Symbol Point Markers

LineSmith now renders configured survey symbol SVGs directly as map point markers when a point code maps to an FLD symbol rule (`entity_type = 0`) with `symbol_name_2` set. SVG markers are tinted to the active point layer color using the SVG symbol footprint (so the symbol shape is shaded without flooding the full marker square). To keep symbol linework readable, LineSmith now draws a bolded symbol pass and renders SVG markers at a corrected 30px footprint (right-sized from the prior oversized 60px render). When no SVG mapping is found (or while the SVG is still loading), LineSmith falls back to the existing `x` marker. LineSmith now also re-renders automatically as soon as each SVG symbol asset finishes loading, so mapped symbols appear on the first drawing open without requiring a manual pan/zoom refresh. Symbol assets are proactively preloaded when FLD rules are applied, and failed symbol image cache entries are retried on later draws to avoid intermittent missing markers after opening LineSmith.

FLD Manager local edits now persist SVG mapping selections both as symbol-name overrides and in the active FLD row mapping columns, so **Save Local** keeps new code mappings stable and point markers update immediately after saving.

Mapped symbol previews are now reused across editing/search surfaces so the same SVG shows up in quick search results, Points Manager rows (next to point numbers), Add/Edit point panel preview row, point-cluster tooltip rows, and as a profile-style badge in the point inspector for the selected point.

To keep monochrome SVG symbols legible, UI badges now render those previews on a white tile background across search results, Points Manager, point inspector, and point-group tooltip surfaces.

Symbol marker refresh now relies on the existing continuous canvas animation loop (`requestAnimationFrame(draw)`) rather than legacy one-off `redraw()` callbacks.


## LineSmith Quick Toolbar

In `VIEWPORT.HTML`, the secondary quick toolbar now includes a dedicated **Field-to-Finish (FLD) Manager** button directly beside the **Points Manager** button so field-code rule editing is one click away while drafting.

On mobile viewports, a new **Hide Bars / Show Bars** control is pinned at the top-left of the canvas so you can quickly hide both floating quick toolbars (and restore them with one tap) while panning or selecting in tight screen space.

## Survey Symbol SVG Library

A dedicated library of surveying map symbols is available in `assets/survey-symbols/` for use with point-file symbol rendering workflows (property pins, cap types, meters, manholes, control points, poles, signs, and related utility marks). A machine-readable manifest is also included at `assets/survey-symbols/index.json`.

Quick command to inspect symbols:

```bash
find assets/survey-symbols -maxdepth 1 -name '*.svg' | sort

# inspect symbol-to-code mappings used by API/CLI workflows
node -e "const m=require('./assets/survey-symbols/index.json'); console.table(m.symbols.map(({id,code,file})=>({id,code,file})))"
```


## UtilitiesPack Export Control

`UtilitiesPack.html` now uses an icon-based export control for power CSV downloads: a CSV document glyph with a download-arrow overlay and an **Export** subtitle for compact action labeling.

## API and CLI Notes for this change

This UtilitiesPack export-control UI update does not add, remove, or modify server API endpoints or CLI commands; the endpoint and command references in this README remain current.

## Test

```bash
npm test
```

## API + CLI quick verification commands

```bash
npm run cli -- --help
npm run ros:cli -- --help
curl "http://localhost:3000/health"
curl "http://localhost:3000/api/apps"
node --test test/viewport.test.js
find assets/survey-symbols -maxdepth 1 -name '*.svg' | wc -l
```

---

## CLI Commands

### Primary CLI

Entry point:

```bash
npm run cli -- --help
# or
node src/cli.js --help
```

Commands:

- Lookup address:

  ```bash
  npm run cli -- lookup --address "1600 W Front St, Boise"
  ```

- Get section at coordinate:

  ```bash
  npm run cli -- section --lat 43.61 --lon -116.20
  ```

- Get aliquots at coordinate:

  ```bash
  npm run cli -- aliquots --lat 43.61 --lon -116.20
  ```

- Build project file + archive plan:

  ```bash
  npm run cli -- project-file \
    --projectName "Demo" \
    --client "Ada County" \
    --address "100 Main St, Boise"
  ```

- Parse Field-to-Finish config:

  ```bash
  npm run cli -- fld-config --file config/MLS.fld
  npm run cli -- fld-config --file config/MLS.fld --summary
  ```

- Translate local points to state plane:

  ```bash
  npm run cli -- pointforge-localize \
    --points '[{"name":"P1","x":1000,"y":1000}]' \
    --anchorX 1000 \
    --anchorY 1000 \
    --lat 43.61 \
    --lon -116.20
  ```

### ROS Basis CLI

Entry point:

```bash
npm run ros:cli -- --help
# or
node src/ros-basis-cli.js --help
```

Example:

```bash
npm run ros:cli -- --pdf ./sample.pdf --maxPages 2 --dpi 300 --debug
```

### Utility Scripts

- Generate app icons:

  ```bash
  npm run icons:generate
  ```

- Run ROS OCR API standalone:

  ```bash
  npm run ros:ocr
  ```

---

## HTTP API Endpoints

Base URL (local): `http://localhost:3000`

### Health and app metadata


### Launcher apps

- `RecordQuarry.html` — full research bundle harvest workflow (plats, ROS, parcels, subdivision, and utility overlays).
- `UtilitiesPack.html` — utilities-only workflow that fetches utility records for an address, stores state-plane coordinates in app state, and exports power utility CSV rows.


- `GET /health`
- `GET /api/apps`
- `GET /ws/lineforge?room=<roomId>` (WebSocket upgrade endpoint used by LineSmith + ArrowHead collaboration)
- Static asset delivery: `/assets/icons/*` and `/assets/survey-symbols/*` now return long-lived immutable caching headers (`Cache-Control: public, max-age=31536000, immutable`) for faster repeat icon/SVG loads.

### Survey and geospatial

- `GET /api/lookup?address=...`
- `GET /api/geocode?address=...`
- `GET /api/utilities?address=...&outSR=2243&sources=power`
  - `sources` accepts a comma-separated list (for example `power,water`) so utility providers can be added incrementally. Current implementation returns Idaho Power records for `power`.
- `GET /api/parcel?lon=...&lat=...&outSR=4326&searchMeters=40`
- `GET /api/section?lon=...&lat=...`
- `GET /api/aliquots?lon=...&lat=...&outSR=4326`
- `GET /api/subdivision?lon=...&lat=...&outSR=4326`
- `GET /api/static-map?lon=...&lat=...&address=...`

### Project file

- `GET /api/project-file/template?projectName=...&client=...&address=...`
  - Optional `resources` query param accepts a JSON array.
- `POST /api/project-file/compile`
  - JSON body accepts either `{ "projectFile": ... }` or `{ "project": ... }`.

### Field-to-Finish (FLD)

- `GET /api/fld-config?file=config/MLS.fld`

Returns parsed FLD data:

- `versionTag`
- `columns`
- `rules`
- `rulesByCode`

LineSmith (`VIEWPORT.HTML`) now also includes an FLD editor workflow:

- Open **Field-to-Finish → Open FLD Editor**.
- Add, edit, and remove FLD code rows.
- For each row, choose **Entity** as **Linework**, **2D Polyline (Linework)**, or **Symbol**.
  - **Linework** and **2D Polyline** rows can pick a FLD `Linetype` value from existing line types in the loaded config; line entities default to FLD `Symbol` = `SPT10` and do not expose symbol SVG options.
  - **Symbol** rows can set FLD `Symbol` to the symbol name used by your code set (for example `SPT10`), then choose the mapped SVG from a dropdown + preview picker so you can visually confirm the symbol before saving, and set FLD `Symbol Size` scale. SVG mappings are stored separately in browser local storage as `Symbol -> SVG` overrides and are not written back into FLD columns.
- Click **Save Local** to store a browser-local override (`localStorage` key: `lineSmithFldConfigLocal`) and immediately apply those rules to auto linework/layer behavior.
- Click **Download Local FLD** (panel button or modal button) to export your saved local override as an `.fld` file.
- Click **Download Current FLD** to export the currently-loaded editor state.
- Click **Reset to Server** to clear local override storage and restore the server-sourced FLD file.

When saving/downloading, unknown columns from the FLD header are preserved and new entries are created using template-backed raw fields so extra properties are retained.

### Local storage sync

- `GET /api/localstorage-sync`
- `POST /api/localstorage-sync`
  - JSON body: `{ "version": number, "snapshot": object }`
  - Launcher sync behavior: browser client now runs a single in-flight polling loop (default 2s cadence, capped exponential retry backoff to 30s) so slow sync requests do not stack into dozens of pending calls.

### ROS and OCR

- `POST /extract` (ROS OCR extraction endpoint)
- `GET /api/ros-pdf?url=https://...` (proxy/fetch remote PDF)

---

## Example API calls

```bash
curl "http://localhost:3000/health"
curl "http://localhost:3000/api/lookup?address=1600%20W%20Front%20St%2C%20Boise"
curl "http://localhost:3000/api/section?lon=-116.20&lat=43.61"
curl "http://localhost:3000/api/fld-config?file=config/MLS.fld"
curl -X POST "http://localhost:3000/api/localstorage-sync" \
  -H "Content-Type: application/json" \
  -d '{"version":1730000000000,"snapshot":{"surveyfoundryProjects":"[]"}}'
curl -I "http://localhost:3000/assets/survey-symbols/monument.svg"
```

## Heroku notes

This repo includes:

- `Procfile` (`web: npm start`)
- `Aptfile` for OCR dependencies

Typical setup:

```bash
heroku buildpacks:add --index 1 heroku-community/apt
heroku buildpacks:add --index 2 heroku/nodejs
heroku config:set TESSDATA_PREFIX=/app/.apt/usr/share/tesseract-ocr/5/tessdata
```

Deploy:

```bash
heroku create <your-app-name>
git push heroku <your-branch>:main
heroku open
```
