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
      headers: { 'Content-Type': 'application/json', 'x-survey-user': 'Jordan' },
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
      headers: { 'Content-Type': 'application/json', 'x-survey-user': 'Jordan' },
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
    assert.equal(loaded.drawing.currentState.points[0].notes, '');

    const drawingFileListRes = await fetch(`http://127.0.0.1:${app.port}/api/project-files/list?projectId=demo-project`);
    assert.equal(drawingFileListRes.status, 200);
    const drawingFileListPayload = await drawingFileListRes.json();
    const objectStoreDrawingFile = drawingFileListPayload.files.find((file) => file.folderKey === 'drawings' && String(file.fileName || '').endsWith(`${drawingId}.linesmith.json`));
    assert.ok(objectStoreDrawingFile);

    const objectStoreDrawingRes = await fetch(`http://127.0.0.1:${app.port}/api/project-files/download?projectId=demo-project&folderKey=drawings&fileName=${encodeURIComponent(objectStoreDrawingFile.fileName)}`);
    assert.equal(objectStoreDrawingRes.status, 200);
    const objectStoreDrawing = await objectStoreDrawingRes.json();
    assert.equal(objectStoreDrawing.drawingState.points[0].x, 3);

    const linkedPointFileRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/boundary-points`);
    assert.equal(linkedPointFileRes.status, 200);
    const linkedPointFile = await linkedPointFileRes.json();
    assert.equal(linkedPointFile.pointFile.currentState.text, 'p-1,2,3,,,\np-2,8,5,,,');
    assert.equal(linkedPointFile.pointFile.versions.length, 3);
    assert.equal(linkedPointFile.pointFile.source, 'linesmith-drawing');
    assert.deepEqual(linkedPointFile.pointFile.versions[0].actor, { app: 'linesmith-drawing', user: 'Jordan' });
    assert.deepEqual(linkedPointFile.pointFile.versions[2].actor, { app: 'linesmith-drawing', user: 'Jordan' });


    const relinkRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings/${encodeURIComponent(drawingId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        drawingState: { points: [{ id: 'p-1', x: 3, y: 2 }, { id: 'p-2', x: 5, y: 8 }], mapGeoreference: { origin: [10, 10] } },
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

    const seededRelinkedPointFileRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/boundary-points-relinked`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pointFileName: 'Boundary Points Relinked.csv',
        pointFileState: {
          text: '900,700,800,9,NEW,Relink Target',
          exportFormat: 'csv',
        },
      }),
    });
    assert.equal(seededRelinkedPointFileRes.status, 201);

    const relinkedPointFileAfterRelinkSaveRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/boundary-points-relinked`);
    assert.equal(relinkedPointFileAfterRelinkSaveRes.status, 200);
    const relinkedPointFileAfterRelinkSave = await relinkedPointFileAfterRelinkSaveRes.json();
    assert.equal(relinkedPointFileAfterRelinkSave.pointFile.currentState.text, '900,700,800,9,NEW,Relink Target');

    const getAfterRelinkRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings/${encodeURIComponent(drawingId)}`);
    assert.equal(getAfterRelinkRes.status, 200);
    const loadedAfterRelink = await getAfterRelinkRes.json();
    assert.equal(loadedAfterRelink.drawing.currentState.points.length, 1);
    assert.equal(loadedAfterRelink.drawing.currentState.points[0].num, '900');
    assert.equal(loadedAfterRelink.drawing.currentState.points[0].x, 800);
    assert.equal(loadedAfterRelink.drawing.currentState.points[0].y, 700);

    const relinkedPointFileRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/boundary-points-relinked`);
    assert.equal(relinkedPointFileRes.status, 200);
    const relinkedPointFile = await relinkedPointFileRes.json();
    assert.equal(relinkedPointFile.pointFile.currentState.text, '900,700,800,9,NEW,Relink Target');
    assert.equal(relinkedPointFile.pointFile.versions.length, 1);

    const editLinkedPointFileRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/boundary-points-relinked`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pointFileName: 'Boundary Points Relinked.csv',
        pointFileState: {
          text: '200,1000.5,2000.5,5.25,IP,Imported from PointForge',
          exportFormat: 'csv',
        },
      }),
    });
    assert.equal(editLinkedPointFileRes.status, 200);

    const getAfterPointFileEditRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings/${encodeURIComponent(drawingId)}`);
    assert.equal(getAfterPointFileEditRes.status, 200);
    const loadedAfterPointFileEdit = await getAfterPointFileEditRes.json();
    assert.equal(loadedAfterPointFileEdit.drawing.currentState.points.length, 1);
    assert.equal(loadedAfterPointFileEdit.drawing.currentState.points[0].id, '200');
    assert.equal(loadedAfterPointFileEdit.drawing.currentState.points[0].num, '200');
    assert.equal(loadedAfterPointFileEdit.drawing.currentState.points[0].x, 2000.5);
    assert.equal(loadedAfterPointFileEdit.drawing.currentState.points[0].y, 1000.5);
    assert.equal(loadedAfterPointFileEdit.drawing.currentState.points[0].code, 'IP');
    assert.equal(loadedAfterPointFileEdit.drawing.currentState.points[0].notes, 'Imported from PointForge');

    const createWithNumRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        drawingName: 'Point Number Preserve',
        drawingState: { points: [{ id: 'internal-1', num: '100', x: 11, y: 22 }] },
        pointFileLink: {
          pointFileId: 'point-num-preserve',
          pointFileName: 'Point Number Preserve.csv',
        },
      }),
    });
    assert.equal(createWithNumRes.status, 201);
    const createdWithNum = await createWithNumRes.json();

    const patchPreservePointFileRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/point-num-preserve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pointFileState: {
          text: '100,101,202,9.5,CTRL,Adjusted',
          exportFormat: 'csv',
        },
      }),
    });
    assert.equal(patchPreservePointFileRes.status, 200);

    const getPreserveRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings/${encodeURIComponent(createdWithNum.drawing.drawingId)}`);
    assert.equal(getPreserveRes.status, 200);
    const loadedPreserve = await getPreserveRes.json();
    assert.equal(loadedPreserve.drawing.currentState.points.length, 1);
    assert.equal(loadedPreserve.drawing.currentState.points[0].id, 'internal-1');
    assert.equal(loadedPreserve.drawing.currentState.points[0].num, '100');
    assert.equal(loadedPreserve.drawing.currentState.points[0].x, 202);
    assert.equal(loadedPreserve.drawing.currentState.points[0].y, 101);
    assert.equal(loadedPreserve.drawing.currentState.points[0].z, 9.5);

    const createLayerResetRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        drawingName: 'Layer Reset on Relink',
        drawingState: {
          points: [{ id: 'shape-1', num: '500', x: 50, y: 60, code: 'OLD', layerId: 'layer-legacy' }],
        },
        pointFileLink: {
          pointFileId: 'layer-reset-points',
          pointFileName: 'Layer Reset Points.csv',
        },
      }),
    });
    assert.equal(createLayerResetRes.status, 201);
    const createdLayerReset = await createLayerResetRes.json();

    const mutateLayerResetPointFileRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/layer-reset-points`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pointFileState: {
          text: '500,51,61,,NEW,Updated code should re-run layer mapping',
          exportFormat: 'csv',
        },
      }),
    });
    assert.equal(mutateLayerResetPointFileRes.status, 200);

    const getLayerResetRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings/${encodeURIComponent(createdLayerReset.drawing.drawingId)}`);
    assert.equal(getLayerResetRes.status, 200);
    const loadedLayerReset = await getLayerResetRes.json();
    assert.equal(loadedLayerReset.drawing.currentState.points[0].id, 'shape-1');
    assert.equal(loadedLayerReset.drawing.currentState.points[0].num, '500');
    assert.equal(loadedLayerReset.drawing.currentState.points[0].code, 'NEW');
    assert.equal(loadedLayerReset.drawing.currentState.points[0].layerId, undefined);

    const deleteRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings/${encodeURIComponent(drawingId)}`, {
      method: 'DELETE',
    });
    assert.equal(deleteRes.status, 200);

    const missingRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings/${encodeURIComponent(drawingId)}`);
    assert.equal(missingRes.status, 404);

    const deletedObjectStoreDrawingRes = await fetch(`http://127.0.0.1:${app.port}/api/project-files/download?projectId=demo-project&folderKey=drawings&fileName=${encodeURIComponent(objectStoreDrawingFile.fileName)}`);
    assert.equal(deletedObjectStoreDrawingRes.status, 404);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});

test('relinking a drawing without drawingState rehydrates persisted points from the selected point file', async () => {
  const app = await startServer();

  try {
    const createDrawingRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        drawingName: 'Relink Without Drawing State',
        drawingState: { points: [{ id: 'old-1', num: '1', x: 10, y: 20 }] },
        pointFileLink: {
          pointFileId: 'source-points',
          pointFileName: 'Source Points.csv',
        },
      }),
    });
    assert.equal(createDrawingRes.status, 201);
    const createdDrawing = await createDrawingRes.json();

    const seedTargetPointFileRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/relinked-target`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pointFileName: 'Relinked Target.csv',
        pointFileState: {
          text: '88,1000,2000,,NEW,Relinked source point',
          exportFormat: 'csv',
        },
      }),
    });
    assert.equal(seedTargetPointFileRes.status, 201);

    const relinkRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings/${encodeURIComponent(createdDrawing.drawing.drawingId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pointFileLink: {
          pointFileId: 'Relinked Target.csv',
          pointFileName: 'Relinked Target.csv',
        },
      }),
    });
    assert.equal(relinkRes.status, 200);
    const relinked = await relinkRes.json();
    assert.equal(relinked.drawing.linkedPointFileId, 'relinked-target');
    assert.equal(relinked.drawing.currentState.points.length, 1);
    assert.equal(relinked.drawing.currentState.points[0].num, '88');
    assert.equal(relinked.drawing.currentState.points[0].x, 2000);
    assert.equal(relinked.drawing.currentState.points[0].y, 1000);

    const getAfterRelinkRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings/${encodeURIComponent(createdDrawing.drawing.drawingId)}`);
    assert.equal(getAfterRelinkRes.status, 200);
    const loadedAfterRelink = await getAfterRelinkRes.json();
    assert.equal(loadedAfterRelink.drawing.currentState.points.length, 1);
    assert.equal(loadedAfterRelink.drawing.currentState.points[0].num, '88');
    assert.equal(loadedAfterRelink.drawing.currentState.points[0].x, 2000);
    assert.equal(loadedAfterRelink.drawing.currentState.points[0].y, 1000);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});


test('linked point-file hydration honors Northing/Easting headers when re-associating drawings', async () => {
  const app = await startServer();

  try {
    const createDrawingRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        drawingName: 'Header Driven Relink',
        drawingState: { points: [{ id: 'seed', num: '1', x: 10, y: 20 }] },
      }),
    });
    assert.equal(createDrawingRes.status, 201);
    const createdDrawing = await createDrawingRes.json();

    const seedPointFileRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/header-ne`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pointFileName: 'Header NE.csv',
        pointFileState: {
          text: 'Point,Northing,Easting,Elevation,Code,Notes\n77,4444.25,3333.5,12.6,IP,Header mapping',
          exportFormat: 'csv',
        },
      }),
    });
    assert.equal(seedPointFileRes.status, 201);

    const relinkRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings/${encodeURIComponent(createdDrawing.drawing.drawingId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pointFileLink: {
          pointFileId: 'header-ne',
          pointFileName: 'Header NE.csv',
        },
      }),
    });
    assert.equal(relinkRes.status, 200);

    const relinked = await relinkRes.json();
    assert.equal(relinked.drawing.currentState.points.length, 1);
    assert.equal(relinked.drawing.currentState.points[0].num, '77');
    assert.equal(relinked.drawing.currentState.points[0].x, 3333.5);
    assert.equal(relinked.drawing.currentState.points[0].y, 4444.25);
    assert.equal(relinked.drawing.currentState.points[0].z, 12.6);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});

test('linked point-file hydration treats X/Y headers as Northing/Easting order when re-associating drawings', async () => {
  const app = await startServer();

  try {
    const createDrawingRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        drawingName: 'XY Header Relink',
        drawingState: { points: [{ id: 'seed', num: '1', x: 10, y: 20 }] },
      }),
    });
    assert.equal(createDrawingRes.status, 201);
    const createdDrawing = await createDrawingRes.json();

    const seedPointFileRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/point-files/header-xy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pointFileName: 'Header XY.csv',
        pointFileState: {
          text: 'Point,X,Y,Elevation,Code,Notes\n77,4444.25,3333.5,12.6,IP,Header mapping',
          exportFormat: 'csv',
        },
      }),
    });
    assert.equal(seedPointFileRes.status, 201);

    const relinkRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/demo-project/drawings/${encodeURIComponent(createdDrawing.drawing.drawingId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pointFileLink: {
          pointFileId: 'header-xy',
          pointFileName: 'Header XY.csv',
        },
      }),
    });
    assert.equal(relinkRes.status, 200);

    const relinked = await relinkRes.json();
    assert.equal(relinked.drawing.currentState.points.length, 1);
    assert.equal(relinked.drawing.currentState.points[0].num, '77');
    assert.equal(relinked.drawing.currentState.points[0].x, 3333.5);
    assert.equal(relinked.drawing.currentState.points[0].y, 4444.25);
    assert.equal(relinked.drawing.currentState.points[0].z, 12.6);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
