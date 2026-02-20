import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const OPENAPI_PATH = new URL('../docs/server.api.json', import.meta.url);

test('server OpenAPI spec documents project drawing CRUD endpoints', async () => {
  const raw = await readFile(OPENAPI_PATH, 'utf8');
  const spec = JSON.parse(raw);

  const collectionPath = spec?.paths?.['/api/projects/{projectId}/drawings'];
  assert.ok(collectionPath, 'spec should include collection drawing path');
  assert.ok(collectionPath.get, 'collection path should include GET');
  assert.ok(collectionPath.post, 'collection path should include POST');

  const itemPath = spec?.paths?.['/api/projects/{projectId}/drawings/{drawingId}'];
  assert.ok(itemPath, 'spec should include item drawing path');
  assert.ok(itemPath.get, 'item path should include GET');
  assert.ok(itemPath.put, 'item path should include PUT');
  assert.ok(itemPath.patch, 'item path should include PATCH');
  assert.ok(itemPath.delete, 'item path should include DELETE');

  assert.ok(spec?.components?.schemas?.LineSmithDrawingRecord, 'spec should include LineSmithDrawingRecord schema');
  assert.ok(spec?.components?.schemas?.LineSmithDrawingMutationRequest, 'spec should include drawing mutation request schema');
  assert.ok(spec?.components?.schemas?.LineSmithDrawingPointFileLink, 'spec should include drawing point-file link schema');

  const drawingMutation = spec.components.schemas.LineSmithDrawingMutationRequest;
  assert.equal(drawingMutation?.properties?.pointFileLink?.$ref, '#/components/schemas/LineSmithDrawingPointFileLink');

  const drawingRecord = spec.components.schemas.LineSmithDrawingRecord;
  assert.equal(drawingRecord?.properties?.linkedPointFileId?.type, 'string');

  assert.ok(!Array.isArray(drawingMutation?.required) || !drawingMutation.required.includes('drawingState'), 'drawingState should be optional in mutation schema for relink PATCH flows');
});
