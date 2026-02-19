import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const OPENAPI_PATH = new URL('../docs/server.api.json', import.meta.url);

test('server OpenAPI spec documents project workbench endpoints', async () => {
  const raw = await readFile(OPENAPI_PATH, 'utf8');
  const spec = JSON.parse(raw);

  const rootPath = spec?.paths?.['/api/projects/{projectId}/workbench'];
  assert.ok(rootPath, 'spec should include project workbench root path');
  assert.ok(rootPath.get, 'spec should include GET project workbench root');
  assert.ok(rootPath.post, 'spec should include POST project workbench root');


  assert.equal(
    rootPath.post.requestBody?.content?.['application/json']?.schema?.$ref,
    '#/components/schemas/ProjectWorkbenchSyncRequest',
    'spec should define sync request body for project workbench root POST'
  );

  const linkPath = spec?.paths?.['/api/projects/{projectId}/workbench/link'];
  assert.ok(linkPath, 'spec should include project workbench link path');
  assert.ok(linkPath.put, 'spec should include PUT on workbench link path');
  assert.ok(linkPath.delete, 'spec should include DELETE on workbench link path');

  const casefilePath = spec?.paths?.['/api/projects/{projectId}/workbench/casefile'];
  assert.ok(casefilePath, 'spec should include project workbench casefile path');
  assert.ok(casefilePath.post, 'spec should include POST on workbench casefile path');
  assert.ok(casefilePath.delete, 'spec should include DELETE on workbench casefile path');


  assert.equal(
    casefilePath.post.requestBody?.content?.['application/json']?.schema?.$ref,
    '#/components/schemas/ProjectWorkbenchSyncRequest',
    'spec should define sync request body for project workbench casefile POST'
  );

  const sourcesPath = spec?.paths?.['/api/projects/{projectId}/workbench/sources'];
  assert.ok(sourcesPath, 'spec should include project workbench sources path');
  assert.ok(sourcesPath.get, 'spec should include GET on workbench sources path');

  const syncPath = spec?.paths?.['/api/projects/{projectId}/workbench/sync'];
  assert.ok(syncPath, 'spec should include project workbench sync path');
  assert.ok(syncPath.post, 'spec should include POST on workbench sync path');


  assert.equal(
    syncPath.post.requestBody?.content?.['application/json']?.schema?.$ref,
    '#/components/schemas/ProjectWorkbenchSyncRequest',
    'spec should define sync request body for project workbench sync POST'
  );

  const traversesPath = spec?.paths?.['/api/projects/{projectId}/workbench/traverses'];
  assert.ok(traversesPath, 'spec should include project workbench traverses path');
  assert.ok(traversesPath.get, 'spec should include GET on project traverses path');
  assert.ok(traversesPath.post, 'spec should include POST on project traverses path');

  const traversePath = spec?.paths?.['/api/projects/{projectId}/workbench/traverses/{traverseId}'];
  assert.ok(traversePath, 'spec should include project traverse detail path');
  assert.ok(traversePath.get, 'spec should include GET on project traverse detail path');

  assert.ok(spec?.components?.schemas?.ProjectWorkbenchLink, 'spec should include ProjectWorkbenchLink schema');
  assert.ok(spec?.components?.schemas?.ProjectWorkbenchSyncResponse, 'spec should include ProjectWorkbenchSyncResponse schema');
  assert.ok(spec?.components?.schemas?.ProjectWorkbenchSyncRequest, 'spec should include ProjectWorkbenchSyncRequest schema');
  assert.ok(spec?.components?.schemas?.ProjectWorkbenchSourcesResponse, 'spec should include ProjectWorkbenchSourcesResponse schema');
  assert.ok(spec?.components?.schemas?.ProjectWorkbenchTraverseRecord, 'spec should include ProjectWorkbenchTraverseRecord schema');
  assert.ok(spec?.components?.schemas?.ProjectWorkbenchTraverseResponse, 'spec should include ProjectWorkbenchTraverseResponse schema');
});
