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
        changeContext: {
          app: 'pointforge',
          user: 'casey',
        },
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
        changeContext: {
          app: 'pointforge',
          user: 'avery',
        },
      }),
    });
    assert.equal(updateRes.status, 200);
    const updated = await updateRes.json();
    assert.equal(updated.pointFile.versions.length, 3);
    assert.deepEqual(updated.pointFile.versions[0].actor, { app: 'pointforge', user: 'casey' });
    assert.deepEqual(updated.pointFile.versions[2].actor, { app: 'pointforge', user: 'avery' });

    const listRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files`);
    assert.equal(listRes.status, 200);
    const listed = await listRes.json();
    assert.equal(listed.pointFiles.length, 1);
    assert.equal(listed.pointFiles[0].versionCount, 3);
    assert.equal(listed.pointFiles[0].pointFileName, 'Boundary Export Renamed.csv');
    assert.equal(listed.pointFiles[0].source, 'pointforge');
    assert.equal(listed.pointFiles[0].sourceLabel, 'Boundary Export');

    const getRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/${encodeURIComponent(pointFileId)}`);
    assert.equal(getRes.status, 200);
    const loaded = await getRes.json();
    assert.equal(loaded.pointFile.currentState.text, '1,105,205\n2,300,400');

    const firstVersionId = updated.pointFile.versions[0].versionId;
    const versionRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/${encodeURIComponent(pointFileId)}?versionId=${encodeURIComponent(firstVersionId)}`);
    assert.equal(versionRes.status, 200);
    const versionPayload = await versionRes.json();
    assert.equal(versionPayload.pointFile.selectedVersionId, firstVersionId);
    assert.equal(versionPayload.pointFile.currentState.text, '1,100,200');

    const missingVersionRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/${encodeURIComponent(pointFileId)}?versionId=missing-version`);
    assert.equal(missingVersionRes.status, 404);

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


test('project point file API derives actor context from request headers and source when changeContext is missing', async () => {
  const app = await startServer();

  try {
    const createRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-survey-app': 'project-browser',
        'x-survey-user': 'michael',
      },
      body: JSON.stringify({
        pointFileName: 'Header Driven.csv',
        pointFileState: { text: '1,10,20', exportFormat: 'csv' },
      }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    const pointFileId = created.pointFile.pointFileId;
    assert.deepEqual(created.pointFile.versions.at(-1).actor, { app: 'project-browser', user: 'michael' });

    const updateRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/${encodeURIComponent(pointFileId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pointFileName: 'Header Driven.csv',
        pointFileState: { text: '1,11,21', exportFormat: 'csv' },
        source: 'pointforge-transformer',
      }),
    });
    assert.equal(updateRes.status, 200);
    const updated = await updateRes.json();
    assert.deepEqual(updated.pointFile.versions.at(-1).actor, { app: 'pointforge-transformer', user: 'unknown-user' });
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
