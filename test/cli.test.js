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
    maxBuffer: 16 * 1024 * 1024,
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.projectFile.project.name, 'Demo');
  assert.equal(payload.projectFile.folders.find((folder) => folder.key === 'cpfs').index.length, 1);
  assert.equal(payload.projectFile.folders.find((folder) => folder.key === 'point-files').index.length, 1);
  assert.ok(payload.archivePlan.entries.some((entry) => /project-file\.json$/.test(entry.path)));
  assert.equal(payload.archivePlan.unresolved.length, 2);
});

test('cli fld-config command parses a field-to-finish file', () => {
  const result = spawnSync(process.execPath, [
    'src/cli.js',
    'fld-config',
    '--file',
    'config/MLS.fld',
    '--summary',
  ], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.versionTag, '2010V');
  assert.equal(payload.ruleCount, 105);
  assert.ok(payload.codes.includes('CURB'));
});

test('cli pointforge-localize command translates points using explicit state-plane anchor', () => {
  const points = JSON.stringify([
    { name: 'P1', x: 1000, y: 1000 },
    { name: 'P2', x: 1012, y: 998 },
  ]);

  const result = spawnSync(process.execPath, [
    'src/cli.js',
    'pointforge-localize',
    '--points',
    points,
    '--anchorX',
    '1000',
    '--anchorY',
    '1000',
    '--anchorEast',
    '2500000',
    '--anchorNorth',
    '1200000',
  ], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.points[0].east, 2500000);
  assert.equal(payload.points[0].north, 1200000);
  assert.equal(payload.points[1].east, 2500012);
  assert.equal(payload.points[1].north, 1199998);
});
