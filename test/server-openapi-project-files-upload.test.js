import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('server OpenAPI spec documents EvidenceDesk upload CRUD endpoints', async () => {
  const raw = await readFile(new URL('../docs/server.api.json', import.meta.url), 'utf8');
  const spec = JSON.parse(raw);

  const uploadPath = spec?.paths?.['/api/project-files/upload'];
  assert.ok(uploadPath, 'spec should include upload path');
  assert.ok(uploadPath.post, 'spec should include POST upload');
  assert.ok(uploadPath.put, 'spec should include PUT upload update');
  assert.ok(uploadPath.post.responses?.['413'], 'POST upload should document oversized payload response');
  assert.ok(uploadPath.put.responses?.['413'], 'PUT upload should document oversized payload response');

  const filePath = spec?.paths?.['/api/project-files/file'];
  assert.ok(filePath, 'spec should include file item path');
  assert.ok(filePath.delete, 'spec should include DELETE file endpoint');

  const listPath = spec?.paths?.['/api/project-files/list'];
  assert.ok(listPath?.get, 'spec should include list endpoint');

  const listSchema = spec?.components?.schemas?.ProjectFilesListResponse;
  assert.ok(listSchema?.properties?.filesByFolder, 'spec should include filesByFolder in list response');
});
