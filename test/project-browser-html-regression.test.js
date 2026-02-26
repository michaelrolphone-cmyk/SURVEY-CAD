import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');

test('buildOneFileRow defines isServerUpload before CP&F star toggle guard', () => {
  assert.match(
    html,
    /const isServerUpload = entry\?\.reference\?\.type === 'server-upload';[\s\S]*if \(!canLaunchPointForge && !canOpenLineSmithDrawing && !canOpenCpfPdf && !isServerUpload\)/,
  );
});

test('download icon helper maps tif/tiff to fallback file icon without missing-file URL', () => {
  assert.match(html, /tif:\s*'file'/);
  assert.match(html, /tiff:\s*'file'/);
  assert.match(html, /return iconPathByExt\[canonicalExt\] \|\| iconPathByExt\.file;/);
});

test('field-book star toggle routes ROS and plats updates to their own project APIs', () => {
  assert.match(html, /function\s+setRosFieldBookStar\(resource = \{\}, starred = false, projectContext = \{\}\)\s*\{[\s\S]*fetch\(buildProjectRosApiUrl\(projectId, rosId\),\s*\{/);
  assert.match(html, /function\s+setPlatFieldBookStar\(resource = \{\}, starred = false, projectContext = \{\}\)\s*\{[\s\S]*fetch\(buildProjectPlatApiUrl\(projectId, platId\),\s*\{/);
  assert.match(html, /function\s+setFieldBookStarForResource\(folder = \{\}, resource = \{\}, starred = false, projectContext = \{\}\)\s*\{[\s\S]*folder\?\.key === 'ros'[\s\S]*folder\?\.key === 'plats'/);
});
