import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDifferentialOperations } from '../src/browser-localstorage-sync.js';

test('buildDifferentialOperations emits set/remove operations required to transform snapshots', () => {
  const previous = { a: '1', b: '2', removeMe: 'x' };
  const next = { a: '1', b: '3', c: '4' };

  const operations = buildDifferentialOperations(previous, next);

  assert.deepEqual(operations, [
    { type: 'set', key: 'b', value: '3' },
    { type: 'set', key: 'c', value: '4' },
    { type: 'remove', key: 'removeMe' },
  ]);
});

test('buildDifferentialOperations returns no operations for identical snapshots', () => {
  const snapshot = { alpha: '1', beta: '2' };
  const operations = buildDifferentialOperations(snapshot, { ...snapshot });
  assert.deepEqual(operations, []);
});
