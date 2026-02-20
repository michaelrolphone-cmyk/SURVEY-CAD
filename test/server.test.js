import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSurveyServer, startServer } from '../src/server.js';
import SurveyCadClient from '../src/survey-api.js';
import { RedisEvidenceDeskFileStore } from '../src/evidence-desk-file-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');

function createMockServer(options = {}) {
  const { utilities404 = false, estimateCalculate404 = false } = options;
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


    if (url.pathname === '/results/default.aspx') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<div><a href="/details/survey/default.aspx?id=abc">Survey ABC</a><span>Survey record</span></div>');
      return;
    }

    if (url.pathname === '/glo-search/default.aspx') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<table><tr><td><a href="/details/patent/default.aspx?id=fallback">Patent Fallback</a></td><td>land patent</td></tr></table>');
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

    if (url.pathname.startsWith('/serviceEstimator/api/NearPoint/Residential/PrimaryPoints/')) {
      if (estimateCalculate404) {
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


class FakeRedis {
  constructor() {
    this.values = new Map();
    this.sets = new Map();
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async set(key, value) {
    this.values.set(key, value);
    return 'OK';
  }

  async sAdd(key, value) {
    const set = this.sets.get(key) || new Set();
    set.add(value);
    this.sets.set(key, set);
    return 1;
  }

  async sRem(key, value) {
    const set = this.sets.get(key);
    if (!set) return 0;
    const removed = set.delete(value);
    if (!set.size) this.sets.delete(key);
    return removed ? 1 : 0;
  }

  async sMembers(key) {
    return [...(this.sets.get(key) || new Set())];
  }

  async del(key) {
    return this.values.delete(key) ? 1 : 0;
  }

  multi() {
    const ops = [];
    const tx = {
      set: (key, value) => { ops.push(() => this.set(key, value)); return tx; },
      sAdd: (key, value) => { ops.push(() => this.sAdd(key, value)); return tx; },
      sRem: (key, value) => { ops.push(() => this.sRem(key, value)); return tx; },
      del: (key) => { ops.push(() => this.del(key)); return tx; },
      exec: async () => {
        const out = [];
        for (const op of ops) out.push([null, await op()]);
        return out;
      },
    };
    return tx;
  }
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
    idahoPowerUtilityLookupUrl: `${base}/serviceEstimator/api/NearPoint/Residential/PrimaryPoints`,
    arcgisGeometryProjectUrl: `${base}/geometry/project`,
    gloRecordsSearchUrl: `${base}/glo-search/default.aspx`,
  });
  const app = await startApiServer(client);

  try {
    const healthRes = await fetch(`http://127.0.0.1:${app.port}/health`);
    assert.equal(healthRes.status, 200);

    const localStorageInitialRes = await fetch(`http://127.0.0.1:${app.port}/api/localstorage-sync`);
    assert.equal(localStorageInitialRes.status, 200);
    const localStorageInitial = await localStorageInitialRes.json();
    assert.equal(localStorageInitial.version, 0);

    const localStorageUpdateRes = await fetch(`http://127.0.0.1:${app.port}/api/localstorage-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ version: 100, snapshot: { sample: 'value' } }),
    });
    assert.equal(localStorageUpdateRes.status, 200);
    const localStorageUpdate = await localStorageUpdateRes.json();
    assert.equal(localStorageUpdate.status, 'server-updated');

    const localStorageStaleRes = await fetch(`http://127.0.0.1:${app.port}/api/localstorage-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ version: 99, snapshot: { sample: 'old' } }),
    });
    assert.equal(localStorageStaleRes.status, 200);
    const localStorageStale = await localStorageStaleRes.json();
    assert.equal(localStorageStale.status, 'client-stale');
    assert.deepEqual(localStorageStale.state.snapshot, { sample: 'value' });


    const localStorageConflictRes = await fetch(`http://127.0.0.1:${app.port}/api/localstorage-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ version: 100, snapshot: { sample: 'different' } }),
    });
    assert.equal(localStorageConflictRes.status, 200);
    const localStorageConflict = await localStorageConflictRes.json();
    assert.equal(localStorageConflict.status, 'checksum-conflict');
    assert.deepEqual(localStorageConflict.state.snapshot, { sample: 'value' });

    const appsRes = await fetch(`http://127.0.0.1:${app.port}/api/apps`);
    assert.equal(appsRes.status, 200);
    const appsPayload = await appsRes.json();
    assert.ok(appsPayload.apps.length >= 10);
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

    const utilitiesRes = await fetch(`http://127.0.0.1:${app.port}/api/utilities?address=${encodeURIComponent('100 Main St, Boise')}`);
    assert.equal(utilitiesRes.status, 200);
    const utilitiesPayload = await utilitiesRes.json();
    assert.deepEqual(utilitiesPayload.sources, ['power']);
    assert.equal(utilitiesPayload.utilities.length, 3);
    assert.ok(utilitiesPayload.utilities.every((utility) => utility.provider === 'Idaho Power'));
    assert.deepEqual(
      utilitiesPayload.utilities.map((utility) => utility.code).sort(),
      ['OH', 'PM', 'UP'],
    );


    const gloRes = await fetch(`http://127.0.0.1:${app.port}/api/glo-records?address=${encodeURIComponent('100 Main St, Boise')}`);
    assert.equal(gloRes.status, 200);
    const gloPayload = await gloRes.json();
    assert.equal(Array.isArray(gloPayload.documents), true);
    assert.equal(gloPayload.documents[0].title, 'Survey ABC');
    assert.match(gloPayload.resultsUrl, /\/results\/default\.aspx\?searchCriteria=/);

    const gloCoordsRes = await fetch(`http://127.0.0.1:${app.port}/api/glo-records?lon=-116.2&lat=43.61`);
    assert.equal(gloCoordsRes.status, 200);
    const gloCoordsPayload = await gloCoordsRes.json();
    assert.equal(gloCoordsPayload.address, '');
    assert.equal(gloCoordsPayload.location.lon, -116.2);
    assert.equal(gloCoordsPayload.location.lat, 43.61);
    assert.equal(Array.isArray(gloCoordsPayload.documents), true);

    const rosPdfRes = await fetch(`http://127.0.0.1:${app.port}/api/ros-pdf?url=${encodeURIComponent(`${base}/sample.pdf`)}`);
    assert.equal(rosPdfRes.status, 200);
    assert.match(rosPdfRes.headers.get('content-type') || '', /application\/pdf/i);

    const fldConfigRes = await fetch(`http://127.0.0.1:${app.port}/api/fld-config?file=config/MLS.fld`);
    assert.equal(fldConfigRes.status, 200);
    const fldConfig = await fldConfigRes.json();
    assert.equal(fldConfig.versionTag, '2010V');
    assert.equal(fldConfig.rulesByCode.WL.entityType, '2');
    assert.equal(fldConfig.rulesByCode.WM.entityType, '0');

    const staticRes = await fetch(`http://127.0.0.1:${app.port}/RecordQuarry.html`);
    assert.equal(staticRes.status, 200);
    const html = await staticRes.text();
    assert.match(html, /<html/i);

    const caseInsensitiveStaticRes = await fetch(`http://127.0.0.1:${app.port}/cpnf.html`);
    assert.equal(caseInsensitiveStaticRes.status, 200);
    assert.equal(caseInsensitiveStaticRes.headers.get('cache-control'), 'no-cache');
    const cpnfHtml = await caseInsensitiveStaticRes.text();
    assert.match(cpnfHtml, /<html/i);
    assert.match(cpnfHtml, /browser-survey-client\.js/);

    const symbolSvgRes = await fetch(`http://127.0.0.1:${app.port}/assets/survey-symbols/monument.svg`);
    assert.equal(symbolSvgRes.status, 200);
    assert.match(symbolSvgRes.headers.get('content-type') || '', /image\/svg\+xml/i);
    assert.equal(symbolSvgRes.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    const symbolSvgBody = await symbolSvgRes.text();
    assert.match(symbolSvgBody, /<svg/i);

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
    assert.match(projectBrowserHtml, /SurveyFoundry EvidenceDesk/i);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
    await new Promise((resolve) => upstream.server.close(resolve));
  }
});

test('startServer falls back to in-memory sync store when redis setup fails', async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(String(message));

  const server = await startServer({
    host: '127.0.0.1',
    port: 0,
    redisStoreFactory: async () => {
      throw new Error('redis unavailable in dyno');
    },
  });

  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/api/localstorage-sync`);
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.version, 0);
    assert.ok(warnings.some((entry) => entry.includes('using in-memory store')));
  } finally {
    console.warn = originalWarn;
    await new Promise((resolve) => server.close(resolve));
  }
});


test('server returns empty utility payload when upstream utility endpoint is unavailable', async () => {
  const upstream = await createMockServer({ estimateCalculate404: true });
  const base = `http://127.0.0.1:${upstream.port}`;
  const client = new SurveyCadClient({
    idahoPowerUtilityLookupUrl: `${base}/serviceEstimator/api/NearPoint/Residential/PrimaryPoints`,
  });
  const app = await startApiServer(client);

  try {
    const utilitiesRes = await fetch(`http://127.0.0.1:${app.port}/api/utilities?address=${encodeURIComponent('100 Main St, Boise')}`);
    assert.equal(utilitiesRes.status, 200);
    const utilitiesPayload = await utilitiesRes.json();
    assert.deepEqual(utilitiesPayload, { utilities: [], sources: ['power'] });
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



test('server validates GLO records query input', async () => {
  const app = await startApiServer(new SurveyCadClient());
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/glo-records`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /address or both lon and lat/i);
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

test('server static map endpoint proxies upstream image, retries tile fallback, and falls back to SVG when unavailable', async () => {
  const staticBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
  const tileBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x46]);
  const mapCalls = [];
  let callCount = 0;
  const app = await startApiServer(new SurveyCadClient(), {
    staticMapFetcher: async (url) => {
      mapCalls.push(url);
      callCount += 1;
      if (callCount === 1) {
        return new Response(staticBytes, {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        });
      }
      if (callCount === 2) {
        return new Response('unavailable', { status: 503 });
      }
      if (callCount === 3) {
        return new Response(tileBytes, {
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
    assert.deepEqual(Array.from(okBody), Array.from(staticBytes));

    const tileFallbackRes = await fetch(`http://127.0.0.1:${app.port}/api/static-map?lat=43.61&lon=-116.2&address=${encodeURIComponent('100 Main St, Boise')}`);
    assert.equal(tileFallbackRes.status, 200);
    assert.match(tileFallbackRes.headers.get('content-type') || '', /image\/png/i);
    const tileFallbackBody = new Uint8Array(await tileFallbackRes.arrayBuffer());
    assert.deepEqual(Array.from(tileFallbackBody), Array.from(tileBytes));

    const svgFallbackRes = await fetch(`http://127.0.0.1:${app.port}/api/static-map?lat=43.62&lon=-116.21&address=${encodeURIComponent('100 Main St, Boise')}`);
    assert.equal(svgFallbackRes.status, 200);
    assert.match(svgFallbackRes.headers.get('content-type') || '', /image\/svg\+xml/i);
    const svgFallbackBody = await svgFallbackRes.text();
    assert.match(svgFallbackBody, /Project map fallback/i);
    assert.match(svgFallbackBody, /100 Main St, Boise/i);

    assert.ok(mapCalls.some((url) => /services\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile\/17\//.test(url)));
    assert.ok(mapCalls.some((url) => /tile\.openstreetmap\.org\/17\//.test(url)));
    assert.match(mapCalls[0], /MapServer\/tile\/17\/47857\/23228$/);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});

test('server localstorage sync endpoint supports async-backed stores', async () => {
  const state = {
    version: 2,
    snapshot: { shared: 'yes' },
    checksum: 'abc123',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const store = {
    async getState() {
      return { ...state, snapshot: { ...state.snapshot } };
    },
    async syncIncoming() {
      state.version = 3;
      state.snapshot = { shared: 'updated' };
      state.checksum = 'def456';
      return { status: 'server-updated', state: { ...state, snapshot: { ...state.snapshot } } };
    },
  };

  const app = await startApiServer(new SurveyCadClient(), { localStorageSyncStore: store });
  try {
    const initialRes = await fetch(`http://127.0.0.1:${app.port}/api/localstorage-sync`);
    assert.equal(initialRes.status, 200);
    const initialPayload = await initialRes.json();
    assert.equal(initialPayload.version, 2);
    assert.equal(initialPayload.snapshot.shared, 'yes');

    const updateRes = await fetch(`http://127.0.0.1:${app.port}/api/localstorage-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 3, snapshot: { shared: 'updated' } }),
    });
    assert.equal(updateRes.status, 200);
    const updatePayload = await updateRes.json();
    assert.equal(updatePayload.status, 'server-updated');
    assert.equal(updatePayload.state.snapshot.shared, 'updated');
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});

test('server file upload CRUD and list endpoints', async () => {
  const app = await startApiServer(new SurveyCadClient());
  const testProjectId = `test-upload-${Date.now()}`;
  const testProjectDir = path.join(UPLOADS_DIR, testProjectId);

  try {
    // Upload a file to the drawings folder
    const boundary = '----TestBoundary123';
    const fileContent = 'sample drawing content for test';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="projectId"',
      '',
      testProjectId,
      `--${boundary}`,
      'Content-Disposition: form-data; name="folderKey"',
      '',
      'drawings',
      `--${boundary}`,
      'Content-Disposition: form-data; name="rosNumber"',
      '',
      '84-123',
      `--${boundary}`,
      'Content-Disposition: form-data; name="pointNumber"',
      '',
      '101',
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="test-drawing.dxf"',
      'Content-Type: application/octet-stream',
      '',
      fileContent,
      `--${boundary}--`,
    ].join('\r\n');

    const uploadRes = await fetch(`http://127.0.0.1:${app.port}/api/project-files/upload`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    });
    assert.equal(uploadRes.status, 201);
    const uploadPayload = await uploadRes.json();
    assert.ok(uploadPayload.resource);
    assert.equal(uploadPayload.resource.folder, 'drawings');
    assert.equal(uploadPayload.resource.title, 'test-drawing.dxf');
    assert.equal(uploadPayload.resource.exportFormat, 'dxf');
    assert.equal(uploadPayload.resource.reference.type, 'server-upload');
    assert.ok(uploadPayload.resource.reference.value.includes('/api/project-files/download'));
    assert.equal(uploadPayload.resource.reference.metadata.rosNumber, '84-123');
    assert.equal(uploadPayload.resource.reference.metadata.pointNumber, '101');

    // Download the file
    const downloadUrl = `http://127.0.0.1:${app.port}${uploadPayload.resource.reference.value}`;
    const downloadRes = await fetch(downloadUrl);
    assert.equal(downloadRes.status, 200);
    const downloadedContent = await downloadRes.text();
    assert.equal(downloadedContent, fileContent);

    // List files for the project
    const listRes = await fetch(`http://127.0.0.1:${app.port}/api/project-files/list?projectId=${encodeURIComponent(testProjectId)}`);
    assert.equal(listRes.status, 200);
    const listPayload = await listRes.json();
    assert.ok(Array.isArray(listPayload.files));
    assert.equal(listPayload.files.length, 1);
    assert.equal(listPayload.files[0].folderKey, 'drawings');
    assert.ok(Array.isArray(listPayload.filesByFolder.drawings));
    assert.equal(listPayload.files[0].rosNumber, '84-123');
    assert.equal(listPayload.files[0].pointNumber, '101');

    const storedFileName = uploadPayload.resource.reference.metadata.storedName;

    const updateBoundary = '----UpdateBoundary456';
    const updatedBody = [
      `--${updateBoundary}`,
      'Content-Disposition: form-data; name="projectId"',
      '',
      testProjectId,
      `--${updateBoundary}`,
      'Content-Disposition: form-data; name="folderKey"',
      '',
      'drawings',
      `--${updateBoundary}`,
      'Content-Disposition: form-data; name="fileName"',
      '',
      storedFileName,
      `--${updateBoundary}`,
      'Content-Disposition: form-data; name="rosNumber"',
      '',
      '84-456',
      `--${updateBoundary}`,
      'Content-Disposition: form-data; name="file"; filename="test-drawing-updated.dxf"',
      'Content-Type: application/octet-stream',
      '',
      'updated drawing content',
      `--${updateBoundary}--`,
    ].join('\r\n');

    const updateRes = await fetch(`http://127.0.0.1:${app.port}/api/project-files/upload`, {
      method: 'PUT',
      headers: { 'Content-Type': `multipart/form-data; boundary=${updateBoundary}` },
      body: updatedBody,
    });
    assert.equal(updateRes.status, 200);
    const updatedUploadPayload = await updateRes.json();
    assert.equal(updatedUploadPayload?.resource?.reference?.metadata?.rosNumber, '84-456');

    const updatedDownloadRes = await fetch(`http://127.0.0.1:${app.port}/api/project-files/download?projectId=${encodeURIComponent(testProjectId)}&folderKey=drawings&fileName=${encodeURIComponent(storedFileName)}`);
    assert.equal(updatedDownloadRes.status, 200);
    assert.equal(await updatedDownloadRes.text(), 'updated drawing content');

    // Validate error cases
    const noFileRes = await fetch(`http://127.0.0.1:${app.port}/api/project-files/upload`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: [
        `--${boundary}`,
        'Content-Disposition: form-data; name="projectId"',
        '',
        testProjectId,
        `--${boundary}`,
        'Content-Disposition: form-data; name="folderKey"',
        '',
        'drawings',
        `--${boundary}--`,
      ].join('\r\n'),
    });
    assert.equal(noFileRes.status, 400);

    const badFolderRes = await fetch(`http://127.0.0.1:${app.port}/api/project-files/upload`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: [
        `--${boundary}`,
        'Content-Disposition: form-data; name="projectId"',
        '',
        testProjectId,
        `--${boundary}`,
        'Content-Disposition: form-data; name="folderKey"',
        '',
        'invalid-folder',
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="test.txt"',
        'Content-Type: text/plain',
        '',
        'test content',
        `--${boundary}--`,
      ].join('\r\n'),
    });
    assert.equal(badFolderRes.status, 400);

    const oversizedBoundary = '----OversizedBoundary789';
    const oversizedPrefix = [
      `--${oversizedBoundary}`,
      'Content-Disposition: form-data; name="projectId"',
      '',
      testProjectId,
      `--${oversizedBoundary}`,
      'Content-Disposition: form-data; name="folderKey"',
      '',
      'drawings',
      `--${oversizedBoundary}`,
      'Content-Disposition: form-data; name="file"; filename="huge.txt"',
      'Content-Type: text/plain',
      '',
    ].join('\r\n');
    const oversizedSuffix = `\r\n--${oversizedBoundary}--`;
    const declaredBytes = 52 * 1024 * 1024;
    const payloadBody = oversizedPrefix + 'x'.repeat(Math.max(0, declaredBytes - Buffer.byteLength(oversizedPrefix) - Buffer.byteLength(oversizedSuffix))) + oversizedSuffix;

    const oversizedRes = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: app.port,
        path: '/api/project-files/upload',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${oversizedBoundary}`,
          'Content-Length': String(Buffer.byteLength(payloadBody)),
        },
      }, (res) => {
        let payload = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { payload += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, payload }));
      });
      req.on('error', reject);
      req.end(payloadBody);
    });
    assert.equal(oversizedRes.statusCode, 413);
    assert.match(oversizedRes.payload, /File exceeds maximum size/);

    const metadataRes = await fetch(`http://127.0.0.1:${app.port}/api/project-files/metadata?projectId=${encodeURIComponent(testProjectId)}&folderKey=drawings&fileName=${encodeURIComponent(storedFileName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pointNumber: '109' }),
    });
    assert.equal(metadataRes.status, 200);
    const metadataPayload = await metadataRes.json();
    assert.equal(metadataPayload?.resource?.reference?.metadata?.pointNumber, '109');

    const moveRes = await fetch(`http://127.0.0.1:${app.port}/api/project-files/file?projectId=${encodeURIComponent(testProjectId)}&folderKey=drawings&fileName=${encodeURIComponent(storedFileName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetFolderKey: 'deeds' }),
    });
    assert.equal(moveRes.status, 200);
    const movePayload = await moveRes.json();
    assert.equal(movePayload.moved, true);
    assert.equal(movePayload.resource.folder, 'deeds');

    const movedDownloadRes = await fetch(`http://127.0.0.1:${app.port}/api/project-files/download?projectId=${encodeURIComponent(testProjectId)}&folderKey=deeds&fileName=${encodeURIComponent(storedFileName)}`);
    assert.equal(movedDownloadRes.status, 200);
    assert.equal(await movedDownloadRes.text(), 'updated drawing content');

    const deleteRes = await fetch(`http://127.0.0.1:${app.port}/api/project-files/file?projectId=${encodeURIComponent(testProjectId)}&folderKey=deeds&fileName=${encodeURIComponent(storedFileName)}`, {
      method: 'DELETE',
    });
    assert.equal(deleteRes.status, 200);
    // Download non-existent file
    const missingRes = await fetch(`http://127.0.0.1:${app.port}/api/project-files/download?projectId=${testProjectId}&folderKey=drawings&fileName=nonexistent.txt`);
    assert.equal(missingRes.status, 404);

    // List for non-existent project returns empty
    const emptyListRes = await fetch(`http://127.0.0.1:${app.port}/api/project-files/list?projectId=no-such-project`);
    assert.equal(emptyListRes.status, 200);
    const emptyListPayload = await emptyListRes.json();
    assert.deepEqual(emptyListPayload.files, []);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
    // Clean up test uploads
    await fs.rm(testProjectDir, { recursive: true, force: true }).catch(() => {});
  }
});




test('server upload generates and serves 512px image thumbnails for EvidenceDesk previews', async () => {
  const app = await startApiServer(new SurveyCadClient());
  const testProjectId = `thumb-upload-${Date.now()}`;
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5lp7kAAAAASUVORK5CYII=';
  const imageBuffer = Buffer.from(pngBase64, 'base64');
  const boundary = '----ImageThumbBoundary';
  const body = Buffer.concat([
    Buffer.from([
      `--${boundary}`,
      'Content-Disposition: form-data; name="projectId"',
      '',
      testProjectId,
      `--${boundary}`,
      'Content-Disposition: form-data; name="folderKey"',
      '',
      'other',
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="preview-source.png"',
      'Content-Type: image/png',
      '',
    ].join('\r\n') + '\r\n'),
    imageBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  try {
    const uploadRes = await fetch(`http://127.0.0.1:${app.port}/api/project-files/upload`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    });
    assert.equal(uploadRes.status, 201);
    const uploaded = await uploadRes.json();
    const thumbnailPath = uploaded?.resource?.reference?.metadata?.thumbnailUrl;
    assert.ok(thumbnailPath, 'uploaded image should include thumbnail URL metadata');

    const thumbnailRes = await fetch(`http://127.0.0.1:${app.port}${thumbnailPath}`);
    assert.equal(thumbnailRes.status, 200);
    assert.equal(thumbnailRes.headers.get('content-type'), 'image/png');
    const thumbnailBytes = Buffer.from(await thumbnailRes.arrayBuffer());
    assert.ok(thumbnailBytes.length > 0, 'thumbnail endpoint should return PNG bytes');

    const missingRes = await fetch(`http://127.0.0.1:${app.port}/api/project-files/image-thumbnail?projectId=${encodeURIComponent(testProjectId)}&folderKey=other&fileName=missing.png`);
    assert.equal(missingRes.status, 404);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});

test('server file upload and download endpoints work with redis-backed EvidenceDesk store', async () => {
  const redisStore = new RedisEvidenceDeskFileStore(new FakeRedis());
  const app = await startApiServer(new SurveyCadClient(), { evidenceDeskFileStore: redisStore });
  const testProjectId = `redis-project-${Date.now()}`;
  const boundary = '----RedisUploadBoundary';
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="projectId"',
    '',
    testProjectId,
    `--${boundary}`,
    'Content-Disposition: form-data; name="folderKey"',
    '',
    'deeds',
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="redis-proof.pdf"',
    'Content-Type: application/pdf',
    '',
    '%PDF-1.4 redis proof',
    `--${boundary}--`,
  ].join('\r\n');

  try {
    const uploadRes = await fetch(`http://127.0.0.1:${app.port}/api/project-files/upload`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    });
    assert.equal(uploadRes.status, 201);
    const uploaded = await uploadRes.json();
    const downloadRes = await fetch(`http://127.0.0.1:${app.port}${uploaded.resource.reference.value}`);
    assert.equal(downloadRes.status, 200);
    assert.equal(downloadRes.headers.get('content-type'), 'application/pdf');
    assert.equal(await downloadRes.text(), '%PDF-1.4 redis proof');
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});

test('pointforge-exports API saves and loads original and modified points', async () => {
  const app = await startApiServer(new SurveyCadClient());
  try {
    // POST a pointforge export
    const createRes = await fetch(`http://127.0.0.1:${app.port}/api/pointforge-exports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originalCsv: '1,100,200,0,IRON,original\n2,300,400,0,MAG,original',
        modifiedCsv: '1,100,200,0,IRON,modified\n2,300,400,0,MAG,modified',
        georeference: { type: 'idaho-state-plane-usft', zone: 'west' },
        metadata: { source: 'pointforge-transformer' },
      }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.ok(created.export.id, 'Response should include an export ID');
    assert.equal(created.export.originalCsv, '1,100,200,0,IRON,original\n2,300,400,0,MAG,original');
    assert.equal(created.export.modifiedCsv, '1,100,200,0,IRON,modified\n2,300,400,0,MAG,modified');
    assert.equal(created.export.georeference.zone, 'west');

    // GET by ID
    const getRes = await fetch(`http://127.0.0.1:${app.port}/api/pointforge-exports?id=${encodeURIComponent(created.export.id)}`);
    assert.equal(getRes.status, 200);
    const loaded = await getRes.json();
    assert.equal(loaded.export.id, created.export.id);
    assert.equal(loaded.export.originalCsv, created.export.originalCsv);
    assert.equal(loaded.export.modifiedCsv, created.export.modifiedCsv);

    // GET by room
    const roomRes = await fetch(`http://127.0.0.1:${app.port}/api/pointforge-exports?room=default`);
    assert.equal(roomRes.status, 200);
    const roomExports = await roomRes.json();
    assert.ok(roomExports.exports.length >= 1);
    assert.ok(roomExports.exports.some((e) => e.id === created.export.id));

    // 404 for nonexistent
    const notFoundRes = await fetch(`http://127.0.0.1:${app.port}/api/pointforge-exports?id=nonexistent`);
    assert.equal(notFoundRes.status, 404);

    // Validation: modifiedCsv is required
    const badRes = await fetch(`http://127.0.0.1:${app.port}/api/pointforge-exports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalCsv: 'test' }),
    });
    assert.equal(badRes.status, 400);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
