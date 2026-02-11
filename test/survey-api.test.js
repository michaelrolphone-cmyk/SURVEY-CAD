import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { SurveyCadClient, parseAddress, buildAddressWhere, arcgisQueryUrl, pointInPolygon, centroidOfPolygon } from '../src/survey-api.js';

function createMockServer(options = {}) {
  const {
    strictAddressMiss = false,
    addressAlwaysMiss = false,
    failProjectedRefetch = false,
    utilities404 = false,
    estimateCalculate404 = false,
    nearPoint404 = false,
    includeServiceLines = false,
    omitTransformers = false,
  } = options;
  const requests = [];
  const headers = { geocodeUserAgent: null, geocodeEmail: null, arcgisGeocodeUserAgent: null, estimateCalculateBodies: [], nearPointPath: null };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    requests.push(url.pathname + url.search);

    if (url.pathname === '/geocode') {
      headers.geocodeUserAgent = req.headers['user-agent'] || null;
      headers.geocodeEmail = url.searchParams.get('email');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify([{ lat: '43.61', lon: '-116.20', display_name: 'Boise' }]));
      return;
    }

    if (url.pathname === '/geocode-403') {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'forbidden' }));
      return;
    }


    if (url.pathname.startsWith('/serviceEstimator/api/NearPoint/Residential/PrimaryPoints/')) {
      headers.nearPointPath = url.pathname;
      if (nearPoint404) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'not found' }));
        return;
      }

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        primaryPoints: [
          { id: 'pm-1', serviceTypeId: 1, code: 'PM', geometry: { x: -12936280.004339488, y: 5406832.06332747, spatialReference: { wkid: 3857 } } },
          { id: 'up-1', serviceTypeId: 2, code: 'UP', geometry: { x: -12936180.004339488, y: 5406882.06332747, spatialReference: { wkid: 3857 } } },
          { id: 'oh-1', serviceTypeId: 3, code: 'OH', geometry: { x: -12936080.004339488, y: 5406932.06332747, spatialReference: { wkid: 3857 } } },
        ],
      }));
      return;
    }


    if (url.pathname === '/serviceEstimator/api/EstimateDetail/Calculate') {
      if (estimateCalculate404) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'not found' }));
        return;
      }
      const form = new URLSearchParams();
      req.on('data', (chunk) => form.append('__chunk', chunk.toString()));
      req.on('end', () => {
        const raw = form.getAll('__chunk').join('');
        const body = new URLSearchParams(raw);
        headers.estimateCalculateBodies.push(raw);
        res.setHeader('Content-Type', 'application/json');
        const response = {
          estimateDetail: {
            estimateDetailId: 88,
            feederId: body.get('feederId') || 'GARY15',
            beginLongitude: Number(body.get('beginLongitude')),
            beginLatitude: Number(body.get('beginLatitude')),
            endLongitude: Number(body.get('endLongitude')),
            endLatitude: Number(body.get('endLatitude')),
          },
          transformers: omitTransformers ? [] : [{
            id: `tx-${body.get('serviceEstimateServiceTypeId') || '1'}`,
            provider: 'Idaho Power',
            name: `Transformer ${body.get('serviceEstimateServiceTypeId') || '1'}`,
            longitude: Number(body.get('beginLongitude')) + (Number(body.get('serviceEstimateServiceTypeId') || '1') * 0.001),
            latitude: Number(body.get('beginLatitude')) + (Number(body.get('serviceEstimateServiceTypeId') || '1') * 0.001),
          }],
        };
        if (includeServiceLines && body.get('serviceEstimateServiceTypeId') === '1') {
          response.estimateDetail.overheadLines = [{
            id: 'oh-line-1',
            geometry: {
              paths: [[
                [Number(body.get('beginLongitude')), Number(body.get('beginLatitude'))],
                [Number(body.get('beginLongitude')) + 0.001, Number(body.get('beginLatitude')) + 0.001],
              ]],
              spatialReference: { wkid: 4326 },
            },
          }];
          response.estimateDetail.undergroundLines = [{
            id: 'ug-line-1',
            geometry: {
              paths: [[
                [Number(body.get('beginLongitude')) + 0.002, Number(body.get('beginLatitude')) + 0.002],
                [Number(body.get('beginLongitude')) + 0.003, Number(body.get('beginLatitude')) + 0.003],
              ]],
              spatialReference: { wkid: 4326 },
            },
          }];
        }
        res.end(JSON.stringify(response));
      });
      return;
    }

    if (url.pathname === '/idaho-power/utilities') {
      if (utilities404) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'not found' }));
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        utilities: [{
          id: 'utility-1',
          provider: 'Idaho Power',
          name: 'Boise Service Utility',
          geometry: { x: -116.2, y: 43.61, spatialReference: { wkid: 4326 } },
        }],
      }));
      return;
    }

    if (url.pathname === '/geometry/project') {
      const geometriesRaw = url.searchParams.get('geometries') || '{}';
      const geometries = JSON.parse(geometriesRaw).geometries || [];
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        geometries: geometries.map((point) => ({ x: Number(point.x) + 1000000, y: Number(point.y) + 1000000 })),
      }));
      return;
    }

    if (url.pathname === '/arcgis-geocode') {
      headers.arcgisGeocodeUserAgent = req.headers['user-agent'] || null;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        candidates: [{
          address: '5707 W Castle Dr, Boise, Idaho, 83703',
          location: { x: -116.27, y: 43.66 },
          attributes: { Match_addr: '5707 W Castle Dr, Boise, Idaho, 83703' },
        }],
      }));
      return;
    }

    if (url.pathname.endsWith('/16/query')) {
      const where = url.searchParams.get('where') || '';
      const strictClauseRequested = /\b(PREDIR|SUFFIX|POSTDIR)\b/.test(where);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        features: addressAlwaysMiss || (strictAddressMiss && strictClauseRequested)
          ? []
          : [{
            attributes: { ADDRNUM: '100', STREETNAME: 'CASTLE', SUFFIX: 'DRIVE', CITY: 'BOISE' },
            geometry: { x: -116.2, y: 43.61 }
          }]
      }));
      return;
    }

    if (url.pathname.endsWith('/24/query')) {
      const where = url.searchParams.get('where') || '';
      const outSR = url.searchParams.get('outSR');
      res.setHeader('Content-Type', 'application/json');
      if (/OBJECTID\s*=\s*2\b/.test(where) && outSR === '2243') {
        res.end(JSON.stringify({
          features: [{
            attributes: { OBJECTID: 2, PARCEL: 'R_SECOND' },
            geometry: { rings: [[[5000,6000],[5100,6000],[5100,6100],[5000,6100],[5000,6000]]] }
          }]
        }));
        return;
      }
      res.end(JSON.stringify({
        features: [{
          attributes: { OBJECTID: 1, PARCEL: 'R12345' },
          geometry: { rings: [[[-116.30,43.50],[-116.28,43.50],[-116.28,43.52],[-116.30,43.52],[-116.30,43.50]]] }
        }, {
          attributes: { OBJECTID: 2, PARCEL: 'R_SECOND' },
          geometry: { rings: [[[-116.21,43.60],[-116.19,43.60],[-116.19,43.62],[-116.21,43.62],[-116.21,43.60]]] }
        }]
      }));
      return;
    }

    if (url.pathname.endsWith('/20/query') || url.pathname.endsWith('/19/query') || url.pathname.endsWith('/18/query')) {
      const where = url.searchParams.get('where') || '';
      const outSR = url.searchParams.get('outSR');
      if (failProjectedRefetch && /OBJECTID\s*=\s*22\b/.test(where) && outSR === '2243') {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: { message: 'Invalid outSR' } }));
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      if (/OBJECTID\s*=\s*22\b/.test(where) && outSR === '2243') {
        res.end(JSON.stringify({
          features: [{ attributes: { OBJECTID: 22, NAME: 'polygon' }, geometry: { rings: [[[7000,8000],[7100,8000],[7100,8100],[7000,8100],[7000,8000]]] } }]
        }));
        return;
      }
      res.end(JSON.stringify({
        features: [
          { attributes: { OBJECTID: 21, NAME: 'off-target' }, geometry: { rings: [[[-116.40,43.40],[-116.31,43.40],[-116.31,43.49],[-116.40,43.49],[-116.40,43.40]]] } },
          { attributes: { OBJECTID: 22, NAME: 'polygon' }, geometry: { rings: [[[-116.3,43.5],[-116.1,43.5],[-116.1,43.7],[-116.3,43.7],[-116.3,43.5]]] } }
        ]
      }));
      return;
    }

    if (url.pathname.endsWith('/17/query')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ features: [{ attributes: { ROS: '12-34' }, geometry: { x: -116.2, y: 43.6105 } }] }));
      return;
    }

    if (url.pathname === '/blm1/query') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        features: [{ attributes: { SEC: 1 }, geometry: { rings: [[[-116.21,43.60],[-116.19,43.60],[-116.19,43.62],[-116.21,43.62],[-116.21,43.60]]] } }]
      }));
      return;
    }

    if (url.pathname === '/blm2/query') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        features: [
          { attributes: { ALIQUOT: 'NWNW' }, geometry: { rings: [[[-116.21,43.61],[-116.20,43.61],[-116.20,43.62],[-116.21,43.62],[-116.21,43.61]]] } }
        ]
      }));
      return;
    }

    res.statusCode = 404;
    res.end('not found');
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port, requests, headers });
    });
  });
}

test('parseAddress and SQL where builder', () => {
  const parsed = parseAddress('100 N Main St, Boise');
  assert.equal(parsed.house, '100');
  assert.equal(parsed.preDir, 'N');
  assert.equal(parsed.streetName, 'MAIN');
  const where = buildAddressWhere(parsed);
  assert.match(where, /ADDRNUM = '100'/);
  assert.match(where, /UPPER\(CITY\) LIKE 'BOISE%'/);
});



test('parseAddress strips trailing state abbreviation from city', () => {
  const parsed = parseAddress('5707 W Castle Dr, Boise ID');
  assert.equal(parsed.city, 'Boise');
  const where = buildAddressWhere(parsed);
  assert.match(where, /UPPER\(CITY\) LIKE 'BOISE%'/);
  assert.doesNotMatch(where, /BOISE ID/);
});

test('arcgisQueryUrl serializes objects as JSON', () => {
  const url = arcgisQueryUrl('https://x/y/24', { geometry: { x: 1, y: 2 }, where: '1=1' });
  assert.match(url, /geometry=%7B%22x%22%3A1%2C%22y%22%3A2%7D/);
  assert.match(url, /f=json/);
});



test('centroidOfPolygon returns average point for first ring', () => {
  const centroid = centroidOfPolygon({
    rings: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
  });
  assert.deepEqual(centroid, { x: 0.8, y: 0.8 });
});

test('pointInPolygon handles holes', () => {
  const geom = {
    rings: [
      [[0,0],[10,0],[10,10],[0,10],[0,0]],
      [[3,3],[7,3],[7,7],[3,7],[3,3]]
    ]
  };
  assert.equal(pointInPolygon([1, 1], geom), true);
  assert.equal(pointInPolygon([5, 5], geom), false);
});



test('findParcelNearPoint selects containing parcel and refetches projected geometry by OBJECTID', async () => {
  const { server, port, requests } = await createMockServer();
  const base = `http://127.0.0.1:${port}`;
  const client = new SurveyCadClient({
    adaMapServer: `${base}/arcgis/rest/services/External/ExternalMap/MapServer`,
    nominatimUrl: `${base}/geocode`,
  });

  try {
    const parcel = await client.findParcelNearPoint(-116.2, 43.61, 2243, 150);
    assert.equal(parcel.attributes.PARCEL, 'R_SECOND');
    assert.deepEqual(parcel.geometry.rings[0][0], [5000, 6000]);

    assert.ok(requests.some((r) => r.includes('/24/query') && r.includes('outSR=4326')));
    assert.ok(requests.some((r) => r.includes('/24/query') && r.includes('where=OBJECTID+%3D+2') && r.includes('outSR=2243')));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('findContainingPolygonWithOutSr selects containing polygon and refetches outSR geometry by OBJECTID', async () => {
  const { server, port, requests } = await createMockServer();
  const base = `http://127.0.0.1:${port}`;
  const client = new SurveyCadClient({
    adaMapServer: `${base}/arcgis/rest/services/External/ExternalMap/MapServer`,
    nominatimUrl: `${base}/geocode`,
  });

  try {
    const section = await client.findContainingPolygonWithOutSr(20, -116.2, 43.61, 2243, 2500);
    assert.equal(section.attributes.OBJECTID, 22);
    assert.deepEqual(section.geometry.rings[0][0], [7000, 8000]);

    assert.ok(requests.some((r) => r.includes('/20/query') && r.includes('outSR=4326')));
    assert.ok(requests.some((r) => r.includes('/20/query') && r.includes('where=OBJECTID+%3D+22') && r.includes('outSR=2243')));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test('client lookup, section, and aliquot flows', async () => {
  const { server, port, requests, headers } = await createMockServer();
  const base = `http://127.0.0.1:${port}`;
  const client = new SurveyCadClient({
    adaMapServer: `${base}/arcgis/rest/services/External/ExternalMap/MapServer`,
    nominatimUrl: `${base}/geocode`,
    blmFirstDivisionLayer: `${base}/blm1`,
    blmSecondDivisionLayer: `${base}/blm2`,
  });

  try {
    const lookup = await client.lookupByAddress('100 Main St, Boise');
    assert.equal(lookup.parcel.attributes.PARCEL, 'R_SECOND');
    assert.equal(lookup.ros.length, 1);
    assert.match(headers.geocodeUserAgent || '', /survey-cad\/1\.0/);

    const section = await client.loadSectionAtPoint(-116.2, 43.61);
    assert.equal(section.attributes.SEC, 1);

    const aliquots = await client.loadAliquotsInSection(section, 2243);
    assert.equal(aliquots[0].attributes.ALIQUOT, 'NWNW');
    assert.ok(requests.some((r) => r.includes('/blm2/query') && r.includes('outSR=2243')));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});


test('geocodeAddress sends configured nominatim user agent', async () => {
  const { server, port, headers } = await createMockServer();
  const base = `http://127.0.0.1:${port}`;
  const client = new SurveyCadClient({
    adaMapServer: `${base}/arcgis/rest/services/External/ExternalMap/MapServer`,
    nominatimUrl: `${base}/geocode`,
    nominatimUserAgent: 'survey-cad-test/2.0',
    nominatimEmail: 'owner@example.com',
  });

  try {
    await client.geocodeAddress('100 Main St, Boise');
    assert.equal(headers.geocodeUserAgent, 'survey-cad-test/2.0');
    assert.equal(headers.geocodeEmail, 'owner@example.com');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});




test('geocodeAddress falls back to ArcGIS geocoder when Nominatim fails', async () => {
  const { server, port, headers } = await createMockServer();
  const base = `http://127.0.0.1:${port}`;
  const client = new SurveyCadClient({
    adaMapServer: `${base}/arcgis/rest/services/External/ExternalMap/MapServer`,
    nominatimUrl: `${base}/geocode-403`,
    arcgisGeocodeUrl: `${base}/arcgis-geocode`,
  });

  try {
    const geocode = await client.geocodeAddress('5707 W Castle Dr, Boise ID');
    assert.equal(geocode.lon, -116.27);
    assert.equal(geocode.lat, 43.66);
    assert.match(geocode.display, /5707 W Castle Dr/i);
    assert.equal(headers.arcgisGeocodeUserAgent, 'survey-cad/1.0 (contact: admin@example.com)');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('lookupByAddress falls back to address layer when geocode is unavailable', async () => {
  const { server, port } = await createMockServer();
  const base = `http://127.0.0.1:${port}`;
  const client = new SurveyCadClient({
    adaMapServer: `${base}/arcgis/rest/services/External/ExternalMap/MapServer`,
    nominatimUrl: `${base}/geocode-403`,
    blmFirstDivisionLayer: `${base}/blm1`,
    blmSecondDivisionLayer: `${base}/blm2`,
  });

  try {
    const lookup = await client.lookupByAddress('100 Main St, Boise');
    assert.equal(lookup.parcel.attributes.PARCEL, 'R_SECOND');
    assert.equal(lookup.location.lon, -116.2);
    assert.equal(lookup.location.lat, 43.61);
    assert.equal(lookup.geocode, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});


test('findBestAddressFeature retries with fallback where clause when strict query misses', async () => {
  const { server, port, requests } = await createMockServer({ strictAddressMiss: true });
  const base = `http://127.0.0.1:${port}`;
  const client = new SurveyCadClient({
    adaMapServer: `${base}/arcgis/rest/services/External/ExternalMap/MapServer`,
    nominatimUrl: `${base}/geocode`,
  });

  try {
    const feature = await client.findBestAddressFeature('5707 W Castle Dr, Boise ID');
    assert.ok(feature);
    assert.equal(feature.attributes.STREETNAME, 'CASTLE');

    const addressQueries = requests.filter((r) => r.includes('/16/query'));
    assert.equal(addressQueries.length, 2);
    assert.match(addressQueries[0], /SUFFIX/);
    assert.doesNotMatch(addressQueries[1], /SUFFIX/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});


test('lookupByAddress throws clear error when address and geocode both fail', async () => {
  const { server, port } = await createMockServer({ addressAlwaysMiss: true });
  const base = `http://127.0.0.1:${port}`;
  const client = new SurveyCadClient({
    adaMapServer: `${base}/arcgis/rest/services/External/ExternalMap/MapServer`,
    nominatimUrl: `${base}/geocode-403`,
  });

  try {
    await assert.rejects(
      () => client.lookupByAddress('5707 W Castle Dr, Boise ID'),
      /Unable to locate this address from county records or geocoder/i,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});



test('findContainingPolygonWithOutSr chooses nearest polygon when point is not contained', async () => {
  const { server, port } = await createMockServer();
  const base = `http://127.0.0.1:${port}`;
  const client = new SurveyCadClient({
    adaMapServer: `${base}/arcgis/rest/services/External/ExternalMap/MapServer`,
  });

  try {
    const polygon = await client.findContainingPolygonWithOutSr(18, -116.305, 43.495, 2243, 2500);
    assert.equal(polygon.attributes.NAME, 'off-target');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test('loadSubdivisionAtPoint supports outSR override', async () => {
  const { server, port, requests } = await createMockServer();
  const base = `http://127.0.0.1:${port}`;
  const client = new SurveyCadClient({
    adaMapServer: `${base}/arcgis/rest/services/External/ExternalMap/MapServer`,
  });

  try {
    const subdivision = await client.loadSubdivisionAtPoint(-116.2, 43.61, 2243);
    assert.equal(subdivision.attributes.NAME, 'polygon');
    assert.ok(requests.some((r) => r.includes('/18/query') && r.includes('outSR=2243')));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});


test('loadSubdivisionAtPoint falls back to WGS84 geometry when projected refetch fails', async () => {
  const { server, port, requests } = await createMockServer({ failProjectedRefetch: true });
  const base = `http://127.0.0.1:${port}`;
  const client = new SurveyCadClient({
    adaMapServer: `${base}/arcgis/rest/services/External/ExternalMap/MapServer`,
  });

  try {
    const subdivision = await client.loadSubdivisionAtPoint(-116.2, 43.61, 2243);
    assert.equal(subdivision.attributes.NAME, 'polygon');
    assert.deepEqual(subdivision.geometry.rings[0][0], [-116.3, 43.5]);
    assert.ok(requests.some((r) => r.includes('/18/query') && r.includes('outSR=2243')));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});


test('lookupUtilitiesByAddress uses Idaho Power NearPoint PrimaryPoints API and projects distinct utility geometry', async () => {
  const { server, port, headers } = await createMockServer();
  const base = `http://127.0.0.1:${port}`;
  const client = new SurveyCadClient({
    adaMapServer: `${base}/arcgis/rest/services/External/ExternalMap/MapServer`,
    nominatimUrl: `${base}/geocode`,
    idahoPowerUtilityLookupUrl: `${base}/serviceEstimator/api/NearPoint/Residential/PrimaryPoints`,
    arcgisGeometryProjectUrl: `${base}/geometry/project`,
  });

  try {
    const utilities = await client.lookupUtilitiesByAddress('100 Main St, Boise', 2243);
    assert.equal(utilities.length, 3);
    assert.ok(utilities.every((utility) => utility.provider === 'Idaho Power'));
    assert.deepEqual(
      utilities.map((utility) => utility.code).sort(),
      ['OH', 'PM', 'UP'],
    );

    assert.match(headers.nearPointPath || '', /\/serviceEstimator\/api\/NearPoint\/Residential\/PrimaryPoints\//);

    const uniqueProjected = new Set(utilities.map((utility) => `${utility.projected.east.toFixed(3)},${utility.projected.north.toFixed(3)}`));
    assert.equal(uniqueProjected.size, 3);
    assert.ok(utilities.every((utility) => Number.isFinite(utility?.projected?.east) && Number.isFinite(utility?.projected?.north)));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('lookupUtilitiesByAddress labels NearPoint utility points using PM/OH/UP service rules', async () => {
  const { server, port } = await createMockServer();
  const base = `http://127.0.0.1:${port}`;

  const client = new SurveyCadClient({
    nominatimUrl: `${base}/geocode`,
    adaMapServer: `${base}/arcgis/rest/services/External/ExternalMap/MapServer`,
    arcgisGeometryProjectUrl: `${base}/geometry/project`,
    idahoPowerUtilityLookupUrl: `${base}/serviceEstimator/api/NearPoint/Residential/PrimaryPoints`,
  });

  try {
    const utilities = await client.lookupUtilitiesByAddress('100 Main St, Boise', 2243);
    const codes = new Set(utilities.map((utility) => utility.code));
    assert.deepEqual(codes, new Set(['PM', 'UP', 'OH']));
    assert.ok(utilities.every((utility) => !String(utility.code).includes('Idaho Power Service Estimate')));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('lookupUtilitiesByAddress only returns the three NearPoint service points when line geometry is present', async () => {
  const { server, port, requests } = await createMockServer();
  const base = `http://127.0.0.1:${port}`;

  const client = new SurveyCadClient({
    nominatimUrl: `${base}/geocode`,
    adaMapServer: `${base}/arcgis/rest/services/External/ExternalMap/MapServer`,
    arcgisGeometryProjectUrl: `${base}/geometry/project`,
    idahoPowerUtilityLookupUrl: `${base}/serviceEstimator/api/NearPoint/Residential/PrimaryPoints`,
  });

  try {
    const utilities = await client.lookupUtilitiesByAddress('100 Main St, Boise', 2243);
    const codes = new Set(utilities.map((utility) => utility.code));

    assert.equal(utilities.length, 3);
    assert.deepEqual(codes, new Set(['PM', 'UP', 'OH']));
    assert.ok(utilities.every((utility) => Number.isFinite(utility?.projected?.east) && Number.isFinite(utility?.projected?.north)));
    assert.ok(requests.some((requestPath) => requestPath.includes('/geometry/project?')));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});


test('lookupUtilitiesByAddress returns [] when NearPoint endpoint is unavailable', async () => {
  const { server, port, requests } = await createMockServer({ nearPoint404: true });
  const base = `http://127.0.0.1:${port}`;
  const client = new SurveyCadClient({
    nominatimUrl: `${base}/geocode`,
    idahoPowerUtilityLookupUrl: `${base}/serviceEstimator/api/NearPoint/Residential/PrimaryPoints`,
  });

  try {
    const utilities = await client.lookupUtilitiesByAddress('100 Main St, Boise', 2243);
    assert.deepEqual(utilities, []);
    assert.ok(requests.some((requestPath) => requestPath.includes('/serviceEstimator/api/NearPoint/Residential/PrimaryPoints/')));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
