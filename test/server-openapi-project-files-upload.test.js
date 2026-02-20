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
  assert.ok(uploadPath.post.responses?.['507'], 'POST upload should document out-of-storage response');
  assert.ok(uploadPath.put.responses?.['507'], 'PUT upload should document out-of-storage response');

  const postUploadSchema = uploadPath.post.requestBody?.content?.['multipart/form-data']?.schema;
  const putUploadSchema = uploadPath.put.requestBody?.content?.['multipart/form-data']?.schema;
  assert.ok(postUploadSchema?.properties?.rosNumber, 'POST upload should allow optional rosNumber form field');
  assert.ok(putUploadSchema?.properties?.rosNumber, 'PUT upload should allow optional rosNumber form field');
  assert.ok(postUploadSchema?.properties?.pointNumber, 'POST upload should allow optional pointNumber form field');
  assert.ok(putUploadSchema?.properties?.pointNumber, 'PUT upload should allow optional pointNumber form field');

  const filePath = spec?.paths?.['/api/project-files/file'];
  assert.ok(filePath, 'spec should include file item path');
  assert.ok(filePath.delete, 'spec should include DELETE file endpoint');
  assert.ok(filePath.patch, 'spec should include PATCH file move endpoint');

  const metadataPath = spec?.paths?.['/api/project-files/metadata'];
  assert.ok(metadataPath?.patch, 'spec should include metadata PATCH endpoint');

  const listPath = spec?.paths?.['/api/project-files/list'];
  assert.ok(listPath?.get, 'spec should include list endpoint');



  const imageThumbPath = spec?.paths?.['/api/project-files/image-thumbnail'];
  assert.ok(imageThumbPath?.get, 'spec should include image thumbnail endpoint');
  assert.ok(imageThumbPath.get.responses?.['200'], 'Image thumbnail endpoint should document image response');
  assert.ok(imageThumbPath.get.responses?.['404'], 'Image thumbnail endpoint should document thumbnail-not-found response');

  const thumbPath = spec?.paths?.['/api/project-files/pdf-thumbnail'];
  assert.ok(thumbPath?.get, 'spec should include PDF thumbnail endpoint');
  assert.ok(thumbPath.get.responses?.['200'], 'PDF thumbnail endpoint should document image response');
  assert.ok(thumbPath.get.responses?.['202'], 'PDF thumbnail endpoint should document generation-in-progress response');
  assert.ok(thumbPath.get.responses?.['404'], 'PDF thumbnail endpoint should document source-not-found failures');
  assert.ok(thumbPath.get.responses?.['502'], 'PDF thumbnail endpoint should document generation failure response');

  const listSchema = spec?.components?.schemas?.ProjectFilesListResponse;
  assert.ok(listSchema?.properties?.filesByFolder, 'spec should include filesByFolder in list response');
  const listItemSchema = listSchema?.properties?.files?.items;
  assert.ok(listItemSchema?.properties?.rosNumber, 'list response should include optional rosNumber metadata');
  assert.ok(listItemSchema?.properties?.pointNumber, 'list response should include optional pointNumber metadata');
});
