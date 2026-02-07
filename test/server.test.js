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
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        features: [{ attributes: { NAME: 'polygon' }, geometry: { rings: [[[-116.3, 43.5], [-116.1, 43.5], [-116.1, 43.7], [-116.3, 43.7], [-116.3, 43.5]]] } }],
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

    res.statusCode = 404;
    res.end('not found');
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function startApiServer(client) {
  const server = createSurveyServer({ client });
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

    const staticRes = await fetch(`http://127.0.0.1:${app.port}/ROS.html`);
    assert.equal(staticRes.status, 200);
    const html = await staticRes.text();
    assert.match(html, /<html/i);

    const caseInsensitiveStaticRes = await fetch(`http://127.0.0.1:${app.port}/cpnf.html`);
    assert.equal(caseInsensitiveStaticRes.status, 200);
    const cpnfHtml = await caseInsensitiveStaticRes.text();
    assert.match(cpnfHtml, /<html/i);
    assert.match(cpnfHtml, /browser-survey-client\.js/);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
    await new Promise((resolve) => upstream.server.close(resolve));
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
