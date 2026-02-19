import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurveyServer } from '../src/server.js';
import SurveyCadClient from '../src/survey-api.js';

async function startServer() {
  const server = createSurveyServer({ client: new SurveyCadClient() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

test('project point file CRUD API stores differential versions and supports list/get/delete', async () => {
  const app = await startServer();

  try {
    const createRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pointFileName: 'Boundary Export.csv',
        pointFileState: { text: '1,100,200', exportFormat: 'csv' },
        source: 'pointforge',
        sourceLabel: 'Boundary Export',
      }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.equal(created.pointFile.pointFileName, 'Boundary Export.csv');
    const pointFileId = created.pointFile.pointFileId;

    const renameRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/${encodeURIComponent(pointFileId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pointFileName: 'Boundary Export Renamed.csv',
        pointFileState: created.pointFile.currentState,
      }),
    });
    assert.equal(renameRes.status, 200);
    const renamed = await renameRes.json();
    assert.equal(renamed.pointFile.pointFileName, 'Boundary Export Renamed.csv');

    const updateRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/${encodeURIComponent(pointFileId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pointFileName: 'Boundary Export Renamed.csv',
        pointFileState: { text: '1,105,205\n2,300,400', exportFormat: 'csv' },
      }),
    });
    assert.equal(updateRes.status, 200);
    const updated = await updateRes.json();
    assert.equal(updated.pointFile.versions.length, 3);

    const listRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files`);
    assert.equal(listRes.status, 200);
    const listed = await listRes.json();
    assert.equal(listed.pointFiles.length, 1);
    assert.equal(listed.pointFiles[0].versionCount, 3);
    assert.equal(listed.pointFiles[0].pointFileName, 'Boundary Export Renamed.csv');

    const getRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/${encodeURIComponent(pointFileId)}`);
    assert.equal(getRes.status, 200);
    const loaded = await getRes.json();
    assert.equal(loaded.pointFile.currentState.text, '1,105,205\n2,300,400');

    const deleteRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/${encodeURIComponent(pointFileId)}`, {
      method: 'DELETE',
    });
    assert.equal(deleteRes.status, 200);

    const missingRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/${encodeURIComponent(pointFileId)}`);
    assert.equal(missingRes.status, 404);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
