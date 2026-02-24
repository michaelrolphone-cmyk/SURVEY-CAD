import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurveyServer } from '../src/server.js';
import SurveyCadClient from '../src/survey-api.js';

async function startServer() {
  const server = createSurveyServer({ client: new SurveyCadClient() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

test('project ROS CRUD API supports batch upsert and star metadata', async () => {
  const app = await startServer();

  try {
    const createRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/ros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rosNumber: '12345', title: 'ROS 12345', starredInFieldBook: true }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.equal(created.ros.starredInFieldBook, true);

    const listRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/ros`);
    assert.equal(listRes.status, 200);
    const listed = await listRes.json();
    assert.equal(listed.ros.length, 1);
    assert.equal(listed.ros[0].rosNumber, '12345');

    const rosId = created.ros.rosId;
    const patchRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/ros/${encodeURIComponent(rosId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rosNumber: '12345', title: 'ROS 12345 Revised', starredInFieldBook: false }),
    });
    assert.equal(patchRes.status, 200);
    const patched = await patchRes.json();
    assert.equal(patched.ros.starredInFieldBook, false);

    const batchRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/ros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ros: [{ rosNumber: '90001', title: 'ROS 90001', starredInFieldBook: true }] }),
    });
    assert.equal(batchRes.status, 200);
    const batchPayload = await batchRes.json();
    assert.equal(batchPayload.ros.length, 1);

    const deleteRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/ros/${encodeURIComponent(rosId)}`, {
      method: 'DELETE',
    });
    assert.equal(deleteRes.status, 200);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
