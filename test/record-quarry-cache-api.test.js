import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurveyServer } from '../src/server.js';
import SurveyCadClient from '../src/survey-api.js';

async function startServer() {
  const server = createSurveyServer({ client: new SurveyCadClient() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

test('address-scoped RecordQuarry cache persists coordinate-only lookup summary', async () => {
  const app = await startServer();

  try {
    const payload = {
      address: '100 main st boise',
      lookup: {
        geocode: { lat: 43.61, lon: -116.2, display: '100 Main St, Boise, ID' },
        location: { lon: -116.2, lat: 43.61 },
        parcel: {
          attributes: { PARCEL: 'R12345' },
          geometry: { rings: [[[-116.21, 43.60], [-116.19, 43.60], [-116.19, 43.62], [-116.21, 43.62], [-116.21, 43.60]]] },
        },
      },
    };

    const saveRes = await fetch(`http://127.0.0.1:${app.port}/api/record-quarry-cache`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(saveRes.status, 200);
    const saved = await saveRes.json();
    assert.deepEqual(saved.cache.lookup, {
      location: { lon: -116.2, lat: 43.61 },
      geocode: { lat: 43.61, lon: -116.2, display: '100 Main St, Boise, ID' },
    });

    const getRes = await fetch(`http://127.0.0.1:${app.port}/api/record-quarry-cache?address=${encodeURIComponent('100 main st boise')}`);
    assert.equal(getRes.status, 200);
    const fetched = await getRes.json();
    assert.deepEqual(fetched.cache.lookup, {
      location: { lon: -116.2, lat: 43.61 },
      geocode: { lat: 43.61, lon: -116.2, display: '100 Main St, Boise, ID' },
    });
    assert.equal(fetched.cache.lookup.parcel, undefined);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
