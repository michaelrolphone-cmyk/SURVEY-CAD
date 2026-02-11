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

## LineSmith Save Shortcuts

When using `VIEWPORT.HTML` (LineSmith), standard OS save shortcuts trigger the same project-linked save workflow as the **Save Drawing to Project** button:

- `Ctrl+S` (Windows/Linux)
- `Cmd+S` (macOS)
- `Ctrl+Shift+S` / `Cmd+Shift+S` (handled as save in-app)

## LineSmith Mouse Shortcut

When no points/lines are selected in `VIEWPORT.HTML`, a **double right-click** zooms out to the next map zoom level at the cursor position.

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

### LineSmith Field-to-Finish commands

LineSmith parses field-to-finish tokens from point codes and can auto-generate geometry:

- `JPN <pointNumber>`: connect this point to another point by point number (e.g. `JPN 102`).
- `<code> BEG/END/CLO`: start/end/close sequential linework for a linework code.
- `CIR <radius>`: draw a circle centered on the point with a radius in drawing units (feet in typical jobs).
  - Supported circle examples: `CIR 2FT END 102G`, `CIR2 BEG WL JPN123`, `CIR2.5`.

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

- `GET /health`
- `GET /api/apps`

### Survey and geospatial

- `GET /api/lookup?address=...`
- `GET /api/geocode?address=...`
- `GET /api/utilities?address=...&outSR=2243`
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

### Local storage sync

- `GET /api/localstorage-sync`
- `POST /api/localstorage-sync`
  - JSON body: `{ "version": number, "snapshot": object }`

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
