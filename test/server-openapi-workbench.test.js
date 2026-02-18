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

  const linkPath = spec?.paths?.['/api/projects/{projectId}/workbench/link'];
  assert.ok(linkPath, 'spec should include project workbench link path');
  assert.ok(linkPath.put, 'spec should include PUT on workbench link path');
  assert.ok(linkPath.delete, 'spec should include DELETE on workbench link path');

  const casefilePath = spec?.paths?.['/api/projects/{projectId}/workbench/casefile'];
  assert.ok(casefilePath, 'spec should include project workbench casefile path');
  assert.ok(casefilePath.post, 'spec should include POST on workbench casefile path');
  assert.ok(casefilePath.delete, 'spec should include DELETE on workbench casefile path');

  const sourcesPath = spec?.paths?.['/api/projects/{projectId}/workbench/sources'];
  assert.ok(sourcesPath, 'spec should include project workbench sources path');
  assert.ok(sourcesPath.get, 'spec should include GET on workbench sources path');

  const syncPath = spec?.paths?.['/api/projects/{projectId}/workbench/sync'];
  assert.ok(syncPath, 'spec should include project workbench sync path');
  assert.ok(syncPath.post, 'spec should include POST on workbench sync path');

  assert.ok(spec?.components?.schemas?.ProjectWorkbenchLink, 'spec should include ProjectWorkbenchLink schema');
  assert.ok(spec?.components?.schemas?.ProjectWorkbenchSyncResponse, 'spec should include ProjectWorkbenchSyncResponse schema');
  assert.ok(spec?.components?.schemas?.ProjectWorkbenchSourcesResponse, 'spec should include ProjectWorkbenchSourcesResponse schema');
});
