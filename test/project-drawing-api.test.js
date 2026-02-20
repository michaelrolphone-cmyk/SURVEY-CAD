import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurveyServer } from '../src/server.js';
import SurveyCadClient from '../src/survey-api.js';

async function startServer() {
  const server = createSurveyServer({ client: new SurveyCadClient() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

test('project drawing CRUD API stores drawing versions and supports list/get/delete', async () => {
  const app = await startServer();

  try {
    const createRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        drawingName: 'Boundary Draft',
        drawingState: { points: [{ id: 'p-1', x: 1, y: 2 }], mapGeoreference: { origin: [0, 0] } },
        pointFileLink: {
          pointFileId: 'boundary-points',
          pointFileName: 'Boundary Points.csv',
        },
      }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.equal(created.drawing.drawingName, 'Boundary Draft');
    const drawingId = created.drawing.drawingId;

    const renameRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings/${encodeURIComponent(drawingId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        drawingName: 'Boundary Draft Renamed',
        drawingState: created.drawing.currentState,
      }),
    });
    assert.equal(renameRes.status, 200);
    const renamed = await renameRes.json();
    assert.equal(renamed.drawing.drawingName, 'Boundary Draft Renamed');

    const updateRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings/${encodeURIComponent(drawingId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        drawingName: 'Boundary Draft Renamed',
        drawingState: { points: [{ id: 'p-1', x: 3, y: 2 }, { id: 'p-2', x: 5, y: 8 }], mapGeoreference: { origin: [10, 10] } },
      }),
    });
    assert.equal(updateRes.status, 200);
    const updated = await updateRes.json();
    assert.equal(updated.drawing.versions.length, 3);

    const listRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings`);
    assert.equal(listRes.status, 200);
    const listed = await listRes.json();
    assert.equal(listed.drawings.length, 1);
    assert.equal(listed.drawings[0].versionCount, 3);
    assert.equal(listed.drawings[0].drawingName, 'Boundary Draft Renamed');

    const getRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings/${encodeURIComponent(drawingId)}`);
    assert.equal(getRes.status, 200);
    const loaded = await getRes.json();
    assert.equal(loaded.drawing.currentState.points[0].x, 3);


    const linkedPointFileRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/boundary-points`);
    assert.equal(linkedPointFileRes.status, 200);
    const linkedPointFile = await linkedPointFileRes.json();
    assert.equal(linkedPointFile.pointFile.currentState.text, 'p-1,3,2,,,\np-2,5,8,,,');
    assert.equal(linkedPointFile.pointFile.versions.length, 3);
    assert.equal(linkedPointFile.pointFile.source, 'linesmith-drawing');


    const relinkRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings/${encodeURIComponent(drawingId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pointFileLink: {
          pointFileId: 'boundary-points-relinked',
          pointFileName: 'Boundary Points Relinked.csv',
        },
      }),
    });
    assert.equal(relinkRes.status, 200);
    const relinked = await relinkRes.json();
    assert.equal(relinked.drawing.linkedPointFileId, 'boundary-points-relinked');

    const oldPointFileRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/boundary-points`);
    assert.equal(oldPointFileRes.status, 200);
    const oldPointFile = await oldPointFileRes.json();
    assert.equal(oldPointFile.pointFile.versions.length, 3);

    const relinkedPointFileRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/boundary-points-relinked`);
    assert.equal(relinkedPointFileRes.status, 200);
    const relinkedPointFile = await relinkedPointFileRes.json();
    assert.equal(relinkedPointFile.pointFile.currentState.text, 'p-1,3,2,,,\np-2,5,8,,,');
    assert.equal(relinkedPointFile.pointFile.versions.length, 1);

    const deleteRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings/${encodeURIComponent(drawingId)}`, {
      method: 'DELETE',
    });
    assert.equal(deleteRes.status, 200);

    const missingRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings/${encodeURIComponent(drawingId)}`);
    assert.equal(missingRes.status, 404);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
