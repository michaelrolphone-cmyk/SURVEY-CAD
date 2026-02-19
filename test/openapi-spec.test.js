import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const REQUIRED_HTTP_ENDPOINTS = [
  '/health',
  '/api/apps',
  '/api/crew-members',
  '/api/lookup',
  '/api/geocode',
  '/api/utilities',
  '/api/static-map',
  '/api/parcel',
  '/api/section',
  '/api/aliquots',
  '/api/subdivision',
  '/api/ros-pdf',
  '/extract',
  '/api/fld-config',
  '/api/field-to-finish',
  '/api/project-file/template',
  '/api/project-file/compile',
  '/api/localstorage-sync',
];

const REQUIRED_WEBSOCKET_ENDPOINTS = [
  '/ws/localstorage-sync',
  '/ws/lineforge',
];

test('OpenAPI spec documents all platform API endpoints', async () => {
  const specRaw = await readFile(new URL('../docs/openapi.json', import.meta.url), 'utf8');
  const spec = JSON.parse(specRaw);

  assert.equal(spec.openapi, '3.1.0');
  assert.ok(spec.paths && typeof spec.paths === 'object');

  for (const endpoint of REQUIRED_HTTP_ENDPOINTS) {
    assert.ok(spec.paths[endpoint], `Missing OpenAPI path for ${endpoint}`);
  }

  for (const endpoint of REQUIRED_WEBSOCKET_ENDPOINTS) {
    assert.ok(spec.paths[endpoint], `Missing OpenAPI path for ${endpoint}`);
    assert.equal(spec.paths[endpoint].get?.['x-websocket'], true, `${endpoint} must be flagged as websocket`);
  }
});

test('OpenAPI operations include summaries and responses', async () => {
  const specRaw = await readFile(new URL('../docs/openapi.json', import.meta.url), 'utf8');
  const spec = JSON.parse(specRaw);

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method)) continue;
      assert.ok(operation.summary, `Missing summary for ${method.toUpperCase()} ${path}`);
      assert.ok(operation.responses && Object.keys(operation.responses).length > 0, `Missing responses for ${method.toUpperCase()} ${path}`);
    }
  }
});
