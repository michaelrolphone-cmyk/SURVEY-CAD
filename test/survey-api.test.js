import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { SurveyCadClient, parseAddress, buildAddressWhere, arcgisQueryUrl, pointInPolygon } from '../src/survey-api.js';

function createMockServer() {
  const requests = [];
  const headers = { geocodeUserAgent: null, geocodeEmail: null };
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

    if (url.pathname.endsWith('/16/query')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        features: [{
          attributes: { ADDRNUM: '100', STREETNAME: 'MAIN', CITY: 'BOISE' },
          geometry: { x: -116.2, y: 43.61 }
        }]
      }));
      return;
    }

    if (url.pathname.endsWith('/24/query')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        features: [{
          attributes: { PARCEL: 'R12345' },
          geometry: { rings: [[[-116.21,43.60],[-116.19,43.60],[-116.19,43.62],[-116.21,43.62],[-116.21,43.60]]] }
        }]
      }));
      return;
    }

    if (url.pathname.endsWith('/20/query') || url.pathname.endsWith('/19/query') || url.pathname.endsWith('/18/query')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        features: [{ attributes: { NAME: 'polygon' }, geometry: { rings: [[[-116.3,43.5],[-116.1,43.5],[-116.1,43.7],[-116.3,43.7],[-116.3,43.5]]] } }]
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

test('arcgisQueryUrl serializes objects as JSON', () => {
  const url = arcgisQueryUrl('https://x/y/24', { geometry: { x: 1, y: 2 }, where: '1=1' });
  assert.match(url, /geometry=%7B%22x%22%3A1%2C%22y%22%3A2%7D/);
  assert.match(url, /f=json/);
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

test('client lookup, section, and aliquot flows', async () => {
  const { server, port, headers } = await createMockServer();
  const base = `http://127.0.0.1:${port}`;
  const client = new SurveyCadClient({
    adaMapServer: `${base}/arcgis/rest/services/External/ExternalMap/MapServer`,
    nominatimUrl: `${base}/geocode`,
    blmFirstDivisionLayer: `${base}/blm1`,
    blmSecondDivisionLayer: `${base}/blm2`,
  });

  try {
    const lookup = await client.lookupByAddress('100 Main St, Boise');
    assert.equal(lookup.parcel.attributes.PARCEL, 'R12345');
    assert.equal(lookup.ros.length, 1);
    assert.match(headers.geocodeUserAgent || '', /survey-cad\/1\.0/);

    const section = await client.loadSectionAtPoint(-116.2, 43.61);
    assert.equal(section.attributes.SEC, 1);

    const aliquots = await client.loadAliquotsInSection(section);
    assert.equal(aliquots[0].attributes.ALIQUOT, 'NWNW');
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
    assert.equal(lookup.parcel.attributes.PARCEL, 'R12345');
    assert.equal(lookup.location.lon, -116.2);
    assert.equal(lookup.location.lat, 43.61);
    assert.equal(lookup.geocode, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
