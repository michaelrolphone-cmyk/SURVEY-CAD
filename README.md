# SURVEY-CAD Node Library

This repository now includes a reusable Node.js library extracted from `ROS.html` and `CPNF.HTML` data-access logic, without modifying those HTML files.

## Install / Run

```bash
npm test
npm run cli -- --help
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

### Core methods

- `geocodeAddress(address)`
- `findBestAddressFeature(address)`
- `findParcelNearPoint(lon, lat, outSR?, searchMeters?)`
- `findContainingPolygon(layerId, lon, lat, searchMeters?)`
- `findRosNearPoint(lon, lat, searchMeters?)`
- `loadSectionAtPoint(lon, lat)`
- `loadAliquotsInSection(sectionFeature)`
- `lookupByAddress(address)`

### Utility exports

- `parseAddress(rawAddress)`
- `buildAddressWhere(parsedOrRaw)`
- `scoreAddressCandidate(parsedOrRaw, attrs)`
- `arcgisQueryUrl(layerUrl, paramsObj)`
- `pointInRing(pointXY, ring)`
- `pointInPolygon(pointXY, esriPolygonGeom)`
- `haversineMeters(lat1, lon1, lat2, lon2)`

## Endpoint coverage

This library supports the same endpoint types used in the HTML tools:

- Geocoding endpoint (Nominatim-style JSON): `GET /search?q=...&format=json`
- Ada ArcGIS feature queries for address, parcels, section, township, subdivision, ROS
- BLM First Division (section polygon at point)
- BLM Second Division (aliquots in section polygon)

## CLI Commands

Entry: `src/cli.js`

```bash
node src/cli.js lookup --address "1600 W Front St, Boise"
node src/cli.js section --lat 43.61 --lon -116.20
node src/cli.js aliquots --lat 43.61 --lon -116.20
```

All commands print JSON to stdout.
