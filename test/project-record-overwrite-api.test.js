import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurveyServer } from '../src/server.js';
import SurveyCadClient from '../src/survey-api.js';

async function startServer() {
  const server = createSurveyServer({ client: new SurveyCadClient() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

test('batch project record endpoints overwrite existing CP&F, ROS, and plat records when overwrite is true', async () => {
  const app = await startServer();
  const base = `http://127.0.0.1:${app.port}/api/projects/overwrite-demo`;

  try {
    await fetch(`${base}/cpfs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpfs: [{ instrument: '2024-10001' }] }),
    });
    await fetch(`${base}/ros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ros: [{ rosNumber: '10001' }] }),
    });
    await fetch(`${base}/plats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plats: [{ subdivisionName: 'OLD SUBDIVISION' }] }),
    });

    const cpfOverwrite = await fetch(`${base}/cpfs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpfs: [{ instrument: '2024-20002' }], overwrite: true }),
    });
    assert.equal(cpfOverwrite.status, 200);

    const rosOverwrite = await fetch(`${base}/ros?overwrite=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ros: [{ rosNumber: '20002' }] }),
    });
    assert.equal(rosOverwrite.status, 200);

    const platOverwrite = await fetch(`${base}/plats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plats: [{ subdivisionName: 'NEW SUBDIVISION' }], overwrite: true }),
    });
    assert.equal(platOverwrite.status, 200);

    const cpfs = await (await fetch(`${base}/cpfs`)).json();
    const ros = await (await fetch(`${base}/ros`)).json();
    const plats = await (await fetch(`${base}/plats`)).json();

    assert.deepEqual(cpfs.cpfs.map((entry) => entry.instrument), ['2024-20002']);
    assert.deepEqual(ros.ros.map((entry) => entry.rosNumber), ['20002']);
    assert.deepEqual(plats.plats.map((entry) => entry.subdivisionName), ['NEW SUBDIVISION']);

    const clearCpfs = await fetch(`${base}/cpfs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpfs: [], overwrite: true }),
    });
    assert.equal(clearCpfs.status, 200);
    const emptyCpfs = await (await fetch(`${base}/cpfs`)).json();
    assert.equal(emptyCpfs.cpfs.length, 0);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
