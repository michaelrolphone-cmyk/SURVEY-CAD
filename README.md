# SURVEY-CAD Node Library + Heroku Web App

This repository includes:
- A reusable Node.js surveying client in `src/survey-api.js`.
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
npm start
npm run ros:ocr
```

The server binds to `PORT` (Heroku-compatible) and defaults to `3000` locally.

## Heroku Deployment

The repo is configured with:
- `Procfile` (`web: npm start`)
- `npm start` script (`node src/server.js`)
- Node engine requirement in `package.json`

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
```

### API endpoints

```bash
curl "http://localhost:3000/api/geocode?address=1600%20W%20Front%20St%2C%20Boise"
curl "http://localhost:3000/api/lookup?address=1600%20W%20Front%20St%2C%20Boise"
curl "http://localhost:3000/api/section?lon=-116.2&lat=43.61"
curl "http://localhost:3000/api/parcel?lon=-116.2&lat=43.61&outSR=2243&searchMeters=150"
curl "http://localhost:3000/api/aliquots?lon=-116.2&lat=43.61"
curl "http://localhost:3000/api/aliquots?lon=-116.2&lat=43.61&outSR=2243"
curl "http://localhost:3000/api/subdivision?lon=-116.2&lat=43.61&outSR=2243"
curl "http://localhost:3000/api/ros-pdf?url=https%3A%2F%2Fexample.com%2Fros.pdf"
```

Upstream HTTP failures from third-party services (for example, geocoding provider 403s) are returned as `502 Bad Gateway` from this API so callers can distinguish dependency outages from client-side request validation errors. Geocoding now tries Nominatim first and then automatically falls back to ArcGIS World Geocode when Nominatim fails. `/api/lookup` will still return a successful payload when geocoding fails but the Ada County address layer returns a match (including a fallback query that relaxes directional/suffix filters). If both data sources fail to locate the address, `/api/lookup` returns a clear validation error instead of bubbling an upstream HTTP error.

### Browser helper module for static HTML tools

The static HTML tools use `src/browser-survey-client.js` so network calls flow through shared server endpoints backed by `SurveyCadClient`:

- `lookupByAddress(address)` → `/api/lookup` (if Ada County address layer misses but geocoding succeeds, `ROS.html` continues lookup using geocoded coordinates)
- `findParcelNearPoint(lon, lat, outSR?, searchMeters?)` → `/api/parcel`
- `loadSectionAtPoint(lon, lat)` → `/api/section`
- `loadAliquotsAtPoint(lon, lat, outSR?)` → `/api/aliquots`
- `loadSubdivisionAtPoint(lon, lat, outSR?)` → `/api/subdivision`
- `buildRosPdfProxyUrl(url)` → `/api/ros-pdf?url=...` (stream ROS/aliquot PDFs through the API server to avoid browser CORS blocking; supports absolute URLs and relative PDF paths found in ArcGIS attributes)

### Static HTML files

Any repository-root static file can be requested directly. File path matching is case-insensitive, so `/CPNF.HTML` and `/cpnf.html` both resolve to the same file. Examples:

```bash
curl "http://localhost:3000/ROS.html"
curl "http://localhost:3000/CPNF.HTML"
curl "http://localhost:3000/cpnf.html"
curl "http://localhost:3000/ROS_OCR.html"
```

`/` defaults to `VIEWPORT.HTML`.


### ROS standalone tool command

Run the web app and open the ROS helper directly:

```bash
npm start
open http://localhost:3000/ROS.html
```

`ROS.html` supports GeoJSON export for the current lookup (parcel, subdivision, section, township, ROS, aliquots, and selected address point).
`ROS.html` now keeps ROS and aliquot results scoped to the lookup address context (containing section and related lookup records), and ROS map popups include both description text and PDF links routed through `/api/ros-pdf`.

## CLI Commands

Entry: `src/cli.js`

```bash
node src/cli.js lookup --address "1600 W Front St, Boise"
node src/cli.js section --lat 43.61 --lon -116.20
node src/cli.js aliquots --lat 43.61 --lon -116.20
```

All CLI commands print JSON to stdout.

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
curl -X POST "http://localhost:3001/extract?maxPages=2&dpi=300&debug=1" \
  -F "pdf=@/absolute/path/to/ros.pdf;type=application/pdf"
```

`/extract` response shape:
- `pdf`: uploaded filename basename
- `best`: top-ranked basis candidate (or `null`)
- `candidates`: all candidate detections
- `diagnostics`: included when `debug=1`

### ROS OCR CLI

```bash
npm run ros:cli -- --pdf /absolute/path/to/ros.pdf
npm run ros:cli -- --pdf /absolute/path/to/ros.pdf --maxPages 3 --dpi 400 --debug
```

CLI prints the same JSON payload returned by `/extract`.


### ROS.html enhancements

- `ROS.html` now includes BLM aliquot lookup/mapping in the map results panel.
- ROS cards now link PDFs through `/api/ros-pdf` so PDFs are loaded via this app server.
- Aliquot cards now also surface any PDF attribute links and route them through `/api/ros-pdf`.
- Clicking a parcel/subdivision/aliquot corner marker in `ROS.html` now queries nearby Ada County CP&F records and shows CP&F PDF download links (proxied through `/api/ros-pdf`).
- CP&F lookups in `ROS.html` now JSON-encode ArcGIS geometry query parameters and filter returned records to the selected corner radius, preventing section-wide CP&F lists from appearing on each corner popup.
- Subdivision boundary and parcel/subdivision/aliquot corner markers are drawn on the map.
- Parcel CSV export from `ROS.html` now emits unique boundary points only (parcel + subdivision + containing section), deduplicated to one row per coordinate in P,N,E,Z,D format (EPSG:2243).
