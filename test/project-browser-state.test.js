import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadStoredProjectFile, PROJECT_FILE_STORAGE_PREFIX } from '../src/project-browser-state.js';

function makeStorage(entries = {}) {
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : null;
    },
  };
}

test('loadStoredProjectFile returns persisted project file snapshots by project id', () => {
  const projectId = 'project-abc';
  const storedProject = {
    schemaVersion: '1.0.0',
    folders: [{ key: 'point-files', index: [{ id: 'pointforge-export-1' }] }],
  };
  const storage = makeStorage({
    [`${PROJECT_FILE_STORAGE_PREFIX}:${projectId}`]: JSON.stringify(storedProject),
  });

  const loaded = loadStoredProjectFile(storage, projectId);

  assert.deepEqual(loaded, storedProject);
});

test('loadStoredProjectFile ignores malformed project-file snapshots', () => {
  const projectId = 'project-abc';
  const storage = makeStorage({
    [`${PROJECT_FILE_STORAGE_PREFIX}:${projectId}`]: JSON.stringify({ schemaVersion: '1.0.0', folders: null }),
  });

  const loaded = loadStoredProjectFile(storage, projectId);

  assert.equal(loaded, null);
});

test('Project Browser prefers stored project file snapshots before loading API template', async () => {
  const projectBrowserHtml = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');

  assert.match(projectBrowserHtml, /<script type="module">/, 'Project Browser should use module scripts to import shared state helpers');
  assert.match(projectBrowserHtml, /import\s*\{\s*loadStoredProjectFile\s*\}\s*from\s*'\.\/src\/project-browser-state\.js'/, 'Project Browser should import persisted snapshot loader');
  assert.match(projectBrowserHtml, /const storedProjectFile = loadStoredProjectFile\(window\.localStorage, activeProjectId\);/, 'Project Browser should attempt to load local project-file snapshots');
  assert.match(projectBrowserHtml, /if \(storedProjectFile\) \{[\s\S]*renderTree\(storedProjectFile,\s*\{\s*projectId:\s*activeProjectId,\s*projectName\s*\}\);[\s\S]*return;/, 'Project Browser should render persisted files and skip template requests when available');
});

test('Project Browser can open persisted point files directly in PointForge', async () => {
  const projectBrowserHtml = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');

  assert.match(projectBrowserHtml, /const\s+POINTFORGE_PROJECT_BROWSER_IMPORT_STORAGE_KEY\s*=\s*'pointforgeProjectBrowserImport'/, 'Project Browser should use a stable localStorage key for PointForge launches');
  assert.match(projectBrowserHtml, /function\s+launchPointForgeFromResource\s*\(/, 'Project Browser should define PointForge launch helper for point-file resources');
  assert.match(projectBrowserHtml, /localStorage\.setItem\(POINTFORGE_PROJECT_BROWSER_IMPORT_STORAGE_KEY,\s*JSON\.stringify\(\{[\s\S]*csv:\s*text/, 'Project Browser should persist selected point-file text before launching PointForge');
  assert.match(projectBrowserHtml, /destination\.searchParams\.set\('source',\s*'project-browser'\)/, 'Project Browser should tag PointForge navigation source as project-browser');
  assert.match(projectBrowserHtml, /textContent\s*=\s*'Open in PointForge'/, 'Project Browser should render an Open in PointForge button for supported point files');
});
