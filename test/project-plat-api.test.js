import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurveyServer } from '../src/server.js';
import SurveyCadClient from '../src/survey-api.js';

async function startServer() {
  const server = createSurveyServer({ client: new SurveyCadClient() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

test('project plats CRUD API supports batch upsert and star metadata', async () => {
  const app = await startServer();

  try {
    const createRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/plats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subdivisionName: 'EAGLE ESTATES', title: 'Eagle Estates Plat', platUrl: 'https://example.com/eagle.pdf', starredInFieldBook: true }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.equal(created.plat.starredInFieldBook, true);

    const listRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/plats`);
    assert.equal(listRes.status, 200);
    const listed = await listRes.json();
    assert.equal(listed.plats.length, 1);
    assert.equal(listed.plats[0].subdivisionName, 'EAGLE ESTATES');

    const platId = created.plat.platId;
    const patchRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/plats/${encodeURIComponent(platId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subdivisionName: 'EAGLE ESTATES', title: 'Eagle Estates Plat Revised', starredInFieldBook: false }),
    });
    assert.equal(patchRes.status, 200);
    const patched = await patchRes.json();
    assert.equal(patched.plat.starredInFieldBook, false);

    const batchRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/plats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plats: [{
          subdivisionName: 'RIVER RUN',
          title: 'River Run Plat',
          platUrl: 'https://example.com/river-run.pdf',
          thumbnailUrl: 'https://example.com/river-run.png',
          starredInFieldBook: true,
        }],
      }),
    });
    assert.equal(batchRes.status, 200);
    const batchPayload = await batchRes.json();
    assert.equal(batchPayload.plats.length, 1);
    assert.equal(batchPayload.plats[0].thumbnailUrl, 'https://example.com/river-run.png');

    const deleteRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/plats/${encodeURIComponent(platId)}`, {
      method: 'DELETE',
    });
    assert.equal(deleteRes.status, 200);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
