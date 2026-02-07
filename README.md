# SURVEY-CAD Node Library + Heroku Web App

This repository includes:
- A reusable Node.js surveying client in `src/survey-api.js`.
- A CLI in `src/cli.js`.
- A Heroku-compatible web server in `src/server.js` that serves the repository HTML files statically and exposes the surveying library as JSON API endpoints.

## Install / Run

```bash
npm install
npm test
npm run cli -- --help
npm start
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
```

Upstream HTTP failures from third-party services (for example, geocoding provider 403s) are returned as `502 Bad Gateway` from this API so callers can distinguish dependency outages from client-side request validation errors. `/api/lookup` will still return a successful payload when the geocoder fails but the Ada County address layer returns a match.

### Browser helper module for static HTML tools

The static HTML tools use `src/browser-survey-client.js` so network calls flow through shared server endpoints backed by `SurveyCadClient`:

- `lookupByAddress(address)` → `/api/lookup`
- `findParcelNearPoint(lon, lat, outSR?, searchMeters?)` → `/api/parcel`
- `loadSectionAtPoint(lon, lat)` → `/api/section`
- `loadAliquotsAtPoint(lon, lat, outSR?)` → `/api/aliquots`

### Static HTML files

Any repository-root static file can be requested directly. File path matching is case-insensitive, so `/CPNF.HTML` and `/cpnf.html` both resolve to the same file. Examples:

```bash
curl "http://localhost:3000/ROS.html"
curl "http://localhost:3000/CPNF.HTML"
curl "http://localhost:3000/cpnf.html"
```

`/` defaults to `VIEWPORT.HTML`.

## CLI Commands

Entry: `src/cli.js`

```bash
node src/cli.js lookup --address "1600 W Front St, Boise"
node src/cli.js section --lat 43.61 --lon -116.20
node src/cli.js aliquots --lat 43.61 --lon -116.20
```

All CLI commands print JSON to stdout.


### ROS.html enhancements

- `ROS.html` now includes BLM aliquot lookup/mapping in the map results panel.
- Parcel CSV export from `ROS.html` now appends aliquot centroid coordinate rows in the same P,N,E,Z,D format (EPSG:2243).
