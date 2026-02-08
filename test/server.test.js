import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createSurveyServer } from '../src/server.js';
import SurveyCadClient from '../src/survey-api.js';

function createMockServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/geocode') {
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
        features: [{ attributes: { ADDRNUM: '100', STREETNAME: 'MAIN', CITY: 'BOISE' }, geometry: { x: -116.2, y: 43.61 } }],
      }));
      return;
    }

    if (url.pathname.endsWith('/24/query')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        features: [{
          attributes: { PARCEL: 'R12345' },
          geometry: { rings: [[[-116.21, 43.60], [-116.19, 43.60], [-116.19, 43.62], [-116.21, 43.62], [-116.21, 43.60]]] },
        }],
      }));
      return;
    }

    if (url.pathname.endsWith('/20/query') || url.pathname.endsWith('/19/query') || url.pathname.endsWith('/18/query')) {
      const where = url.searchParams.get('where') || '';
      const outSR = url.searchParams.get('outSR');
      if (url.pathname.endsWith('/18/query') && /OBJECTID\s*=\s*22\b/.test(where) && outSR === '2243') {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: { message: 'Invalid outSR' } }));
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        features: [{ attributes: { OBJECTID: 22, NAME: 'polygon' }, geometry: { rings: [[[-116.3, 43.5], [-116.1, 43.5], [-116.1, 43.7], [-116.3, 43.7], [-116.3, 43.5]]] } }],
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
        features: [{ attributes: { SEC: 1 }, geometry: { rings: [[[-116.21, 43.60], [-116.19, 43.60], [-116.19, 43.62], [-116.21, 43.62], [-116.21, 43.60]]] } }],
      }));
      return;
    }

    if (url.pathname === '/blm2/query') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        features: [{ attributes: { ALIQUOT: 'NWNW' }, geometry: { rings: [[[-116.21, 43.61], [-116.20, 43.61], [-116.20, 43.62], [-116.21, 43.62], [-116.21, 43.61]]] } }],
      }));
      return;
    }

    if (url.pathname === '/sample.pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.end(Buffer.from('%PDF-1.4\n%mock\n', 'utf8'));
      return;
    }

    res.statusCode = 404;
    res.end('not found');
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function startApiServer(client, opts = {}) {
  const server = createSurveyServer({ client, ...opts });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

test('server exposes survey APIs and static html', async () => {
  const upstream = await createMockServer();
  const base = `http://127.0.0.1:${upstream.port}`;
  const client = new SurveyCadClient({
    adaMapServer: `${base}/arcgis/rest/services/External/ExternalMap/MapServer`,
    nominatimUrl: `${base}/geocode`,
    blmFirstDivisionLayer: `${base}/blm1`,
    blmSecondDivisionLayer: `${base}/blm2`,
  });
  const app = await startApiServer(client);

  try {
    const healthRes = await fetch(`http://127.0.0.1:${app.port}/health`);
    assert.equal(healthRes.status, 200);

    const lookupRes = await fetch(`http://127.0.0.1:${app.port}/api/lookup?address=${encodeURIComponent('100 Main St, Boise')}`);
    assert.equal(lookupRes.status, 200);
    const lookup = await lookupRes.json();
    assert.equal(lookup.parcel.attributes.PARCEL, 'R12345');

    const parcelRes = await fetch(`http://127.0.0.1:${app.port}/api/parcel?lon=-116.2&lat=43.61&outSR=2243`);
    assert.equal(parcelRes.status, 200);
    const parcelPayload = await parcelRes.json();
    assert.equal(parcelPayload.parcel.attributes.PARCEL, 'R12345');

    const aliquotsRes = await fetch(`http://127.0.0.1:${app.port}/api/aliquots?lon=-116.2&lat=43.61`);
    assert.equal(aliquotsRes.status, 200);
    const aliquots = await aliquotsRes.json();
    assert.equal(aliquots.aliquots[0].attributes.ALIQUOT, 'NWNW');

    const subdivisionRes = await fetch(`http://127.0.0.1:${app.port}/api/subdivision?lon=-116.2&lat=43.61&outSR=2243`);
    assert.equal(subdivisionRes.status, 200);
    const subdivisionPayload = await subdivisionRes.json();
    assert.equal(subdivisionPayload.subdivision.attributes.NAME, 'polygon');
    assert.deepEqual(subdivisionPayload.subdivision.geometry.rings[0][0], [-116.3, 43.5]);

    const rosPdfRes = await fetch(`http://127.0.0.1:${app.port}/api/ros-pdf?url=${encodeURIComponent(`${base}/sample.pdf`)}`);
    assert.equal(rosPdfRes.status, 200);
    assert.match(rosPdfRes.headers.get('content-type') || '', /application\/pdf/i);

    const staticRes = await fetch(`http://127.0.0.1:${app.port}/ROS.html`);
    assert.equal(staticRes.status, 200);
    const html = await staticRes.text();
    assert.match(html, /<html/i);

    const caseInsensitiveStaticRes = await fetch(`http://127.0.0.1:${app.port}/cpnf.html`);
    assert.equal(caseInsensitiveStaticRes.status, 200);
    const cpnfHtml = await caseInsensitiveStaticRes.text();
    assert.match(cpnfHtml, /<html/i);
    assert.match(cpnfHtml, /browser-survey-client\.js/);

    const rosOcrStaticRes = await fetch(`http://127.0.0.1:${app.port}/ROS_OCR.html`);
    assert.equal(rosOcrStaticRes.status, 200);
    const rosOcrHtml = await rosOcrStaticRes.text();
    assert.match(rosOcrHtml, /Basis of Bearing Extractor/i);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
    await new Promise((resolve) => upstream.server.close(resolve));
  }
});



test('server forwards /extract POST requests to ROS OCR handler', async () => {
  const rosPayload = { best: { basisType: 'grid' }, candidates: [] };
  const app = await startApiServer(new SurveyCadClient(), {
    rosOcrHandler(req, res) {
      assert.equal(req.method, 'POST');
      assert.equal(new URL(req.url, 'http://localhost').pathname, '/extract');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(rosPayload));
    },
  });

  try {
    const formData = new FormData();
    formData.append('pdf', new Blob(['%PDF-1.4\n'], { type: 'application/pdf' }), 'sample.pdf');
    const res = await fetch(`http://127.0.0.1:${app.port}/extract?maxPages=2&dpi=300&debug=1`, {
      method: 'POST',
      body: formData,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, rosPayload);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});


test('server rejects non-POST methods for /extract', async () => {
  const app = await startApiServer(new SurveyCadClient(), {
    rosOcrHandler() {
      throw new Error('ros ocr handler should not be called for GET /extract');
    },
  });

  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/extract`);
    assert.equal(res.status, 405);
    const body = await res.json();
    assert.match(body.error, /Only POST is supported/i);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
test('server validates required parameters', async () => {
  const app = await startApiServer(new SurveyCadClient());
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/lookup`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /address query parameter is required/i);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});


test('server maps upstream HTTP errors to bad gateway', async () => {
  const client = {
    async lookupByAddress() {
      throw new Error('HTTP 403: https://nominatim.openstreetmap.org/search?q=test');
    },
  };
  const app = await startApiServer(client);

  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/lookup?address=${encodeURIComponent('100 Main St, Boise')}`);
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.match(body.error, /HTTP 403/i);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});


test('server lookup succeeds when geocode provider fails but address layer resolves', async () => {
  const upstream = await createMockServer();
  const base = `http://127.0.0.1:${upstream.port}`;
  const client = new SurveyCadClient({
    adaMapServer: `${base}/arcgis/rest/services/External/ExternalMap/MapServer`,
    nominatimUrl: `${base}/geocode-403`,
    blmFirstDivisionLayer: `${base}/blm1`,
    blmSecondDivisionLayer: `${base}/blm2`,
  });
  const app = await startApiServer(client);

  try {
    const lookupRes = await fetch(`http://127.0.0.1:${app.port}/api/lookup?address=${encodeURIComponent('100 Main St, Boise')}`);
    assert.equal(lookupRes.status, 200);
    const lookup = await lookupRes.json();
    assert.equal(lookup.parcel.attributes.PARCEL, 'R12345');
    assert.equal(lookup.geocode, null);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
    await new Promise((resolve) => upstream.server.close(resolve));
  }
});


test('server returns validation error when lookup cannot resolve coordinates', async () => {
  const client = {
    async lookupByAddress() {
      throw new Error('Unable to locate this address from county records or geocoder.');
    },
  };
  const app = await startApiServer(client);

  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/lookup?address=${encodeURIComponent('5707 W Castle Dr, Boise ID')}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /Unable to locate this address/i);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});


test('server validates ros pdf URL input', async () => {
  const app = await startApiServer(new SurveyCadClient());
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/ros-pdf?url=notaurl`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /valid absolute URL/i);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
