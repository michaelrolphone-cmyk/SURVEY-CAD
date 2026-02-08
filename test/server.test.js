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

    const appsRes = await fetch(`http://127.0.0.1:${app.port}/api/apps`);
    assert.equal(appsRes.status, 200);
    const appsPayload = await appsRes.json();
    assert.equal(appsPayload.apps.length, 7);
    assert.equal(appsPayload.apps[0].name, 'SurveyFoundry');
    assert.match(appsPayload.apps[0].iconPath, /assets\/icons\/SurveyFoundry\.png$/i);

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

    const staticRes = await fetch(`http://127.0.0.1:${app.port}/RecordQuarry.html`);
    assert.equal(staticRes.status, 200);
    const html = await staticRes.text();
    assert.match(html, /<html/i);

    const caseInsensitiveStaticRes = await fetch(`http://127.0.0.1:${app.port}/cpnf.html`);
    assert.equal(caseInsensitiveStaticRes.status, 200);
    const cpnfHtml = await caseInsensitiveStaticRes.text();
    assert.match(cpnfHtml, /<html/i);
    assert.match(cpnfHtml, /browser-survey-client\.js/);

    const launcherRes = await fetch(`http://127.0.0.1:${app.port}/`);
    assert.equal(launcherRes.status, 200);
    const launcherHtml = await launcherRes.text();
    assert.match(launcherHtml, /SurveyFoundry Launcher/i);
    assert.match(launcherHtml, /api\/apps/);
    assert.match(launcherHtml, /app-icon/);

    const rosOcrStaticRes = await fetch(`http://127.0.0.1:${app.port}/ROS_OCR.html`);
    assert.equal(rosOcrStaticRes.status, 200);
    const rosOcrHtml = await rosOcrStaticRes.text();
    assert.match(rosOcrHtml, /Basis of Bearing Extractor/i);

    const projectBrowserStaticRes = await fetch(`http://127.0.0.1:${app.port}/PROJECT_BROWSER.html`);
    assert.equal(projectBrowserStaticRes.status, 200);
    const projectBrowserHtml = await projectBrowserStaticRes.text();
    assert.match(projectBrowserHtml, /SurveyFoundry Project Browser/i);
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


test('server subdivision endpoint falls back to WGS84 when projected outSR lookup fails', async () => {
  const calls = [];
  const client = {
    async loadSubdivisionAtPoint(lon, lat, outSR) {
      calls.push({ lon, lat, outSR });
      if (outSR === 2243) {
        throw new Error('Invalid outSR');
      }
      return { attributes: { NAME: 'fallback' }, geometry: { spatialReference: { wkid: 4326 } } };
    },
  };

  const app = await startApiServer(client);

  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/subdivision?lon=-116.2&lat=43.61&outSR=2243`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.subdivision.attributes.NAME, 'fallback');
    assert.deepEqual(calls, [
      { lon: -116.2, lat: 43.61, outSR: 2243 },
      { lon: -116.2, lat: 43.61, outSR: 4326 },
    ]);
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


test('server exposes project-file template and compile endpoints', async () => {
  const app = await startApiServer(new SurveyCadClient());

  try {
    const resources = encodeURIComponent(JSON.stringify([
      {
        folder: 'cpfs',
        title: 'CP&F Instrument',
        reference: { type: 'instrument-number', value: 'INST-123' },
      },
    ]));

    const templateRes = await fetch(`http://127.0.0.1:${app.port}/api/project-file/template?projectName=Demo&client=Ada&address=100%20Main&resources=${resources}`);
    assert.equal(templateRes.status, 200);
    const templatePayload = await templateRes.json();
    assert.equal(templatePayload.projectFile.project.name, 'Demo');
    assert.equal(templatePayload.projectFile.folders.find((folder) => folder.key === 'cpfs').index.length, 1);

    const compileRes = await fetch(`http://127.0.0.1:${app.port}/api/project-file/compile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        project: {
          projectName: 'Compile Test',
          address: '200 Main St, Boise',
          resources: [
            {
              folder: 'point-files',
              title: 'Boundary points',
              reference: { type: 'pointforge-set', value: 'set-100' },
            },
          ],
        },
      }),
    });
    assert.equal(compileRes.status, 200);
    const compilePayload = await compileRes.json();
    assert.equal(compilePayload.projectFile.project.name, 'Compile Test');
    assert.ok(compilePayload.archivePlan.entries.some((entry) => /project-file\.json$/.test(entry.path)));
    assert.equal(compilePayload.archivePlan.unresolved.length, 1);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});

test('server static map endpoint proxies upstream image and falls back to SVG when unavailable', async () => {
  const imageBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
  const mapCalls = [];
  const app = await startApiServer(new SurveyCadClient(), {
    staticMapFetcher: async (url) => {
      mapCalls.push(url);
      if (mapCalls.length === 1) {
        return new Response(imageBytes, {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        });
      }
      throw new Error('upstream unavailable');
    },
  });

  try {
    const okRes = await fetch(`http://127.0.0.1:${app.port}/api/static-map?lat=43.61001&lon=-116.20001&address=${encodeURIComponent('100 Main St, Boise')}`);
    assert.equal(okRes.status, 200);
    assert.match(okRes.headers.get('content-type') || '', /image\/png/i);
    const okBody = new Uint8Array(await okRes.arrayBuffer());
    assert.deepEqual(Array.from(okBody), Array.from(imageBytes));

    const fallbackRes = await fetch(`http://127.0.0.1:${app.port}/api/static-map?lat=43.61&lon=-116.2&address=${encodeURIComponent('100 Main St, Boise')}`);
    assert.equal(fallbackRes.status, 200);
    assert.match(fallbackRes.headers.get('content-type') || '', /image\/svg\+xml/i);
    const fallbackBody = await fallbackRes.text();
    assert.match(fallbackBody, /Project map fallback/i);
    assert.match(fallbackBody, /100 Main St, Boise/i);

    assert.equal(mapCalls.length, 2);
    assert.match(mapCalls[0], /staticmap\.openstreetmap\.de\/staticmap\.php/);
    assert.match(mapCalls[0], /center=43\.610010%2C-116\.200010/);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
