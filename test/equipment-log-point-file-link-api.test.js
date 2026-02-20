import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurveyServer } from '../src/server.js';
import SurveyCadClient from '../src/survey-api.js';

async function startServer() {
  const server = createSurveyServer({ client: new SurveyCadClient() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

test('equipment log API persists linked project point file metadata for audits', async () => {
  const app = await startServer();
  try {
    const pointFileRes = await fetch(`http://127.0.0.1:${app.port}/api/projects/audit-project/point-files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pointFileName: 'Audit-Control.csv',
        pointFileState: { text: '1,100,200', exportFormat: 'csv' },
        source: 'equipment-log',
        sourceLabel: 'Equipment log: Job 17 · Trimble S7 · Riley',
      }),
    });
    assert.equal(pointFileRes.status, 201);
    const pointFilePayload = await pointFileRes.json();

    const logRes = await fetch(`http://127.0.0.1:${app.port}/api/equipment-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rodman: 'Riley',
        jobFileName: 'Job 17',
        equipmentType: 'Trimble S7',
        pointFileId: pointFilePayload.pointFile.pointFileId,
        pointFileName: pointFilePayload.pointFile.pointFileName,
        pointFileProjectId: 'audit-project',
      }),
    });
    assert.equal(logRes.status, 201);

    const listRes = await fetch(`http://127.0.0.1:${app.port}/api/equipment-logs`);
    assert.equal(listRes.status, 200);
    const listed = await listRes.json();
    assert.equal(listed.logs.length, 1);
    assert.equal(listed.logs[0].pointFileProjectId, 'audit-project');
    assert.equal(listed.logs[0].pointFileId, pointFilePayload.pointFile.pointFileId);
    assert.equal(listed.logs[0].pointFileName, 'Audit-Control.csv');
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
