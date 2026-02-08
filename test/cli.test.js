import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('cli project-file command emits symbolic project file and archive plan', () => {
  const result = spawnSync(process.execPath, [
    'src/cli.js',
    'project-file',
    '--projectName',
    'Demo',
    '--client',
    'Ada County',
    '--address',
    '100 Main St, Boise',
    '--resource',
    'cpfs|instrument-number|2019-12345|CP&F 2019-12345',
    '--resource',
    'point-files|pointforge-set|set-77|Boundary points',
  ], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.projectFile.project.name, 'Demo');
  assert.equal(payload.projectFile.folders.find((folder) => folder.key === 'cpfs').index.length, 1);
  assert.equal(payload.projectFile.folders.find((folder) => folder.key === 'point-files').index.length, 1);
  assert.ok(payload.archivePlan.entries.some((entry) => /project-file\.json$/.test(entry.path)));
  assert.equal(payload.archivePlan.unresolved.length, 2);
});
