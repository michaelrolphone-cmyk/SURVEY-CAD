import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/ros-basis-cli.js';

test('ros basis cli parses positional and flag args', () => {
  const parsed = parseArgs(['extract', '--pdf', 'foo.pdf', '--maxPages', '4', '--debug']);
  assert.deepEqual(parsed._, ['extract']);
  assert.equal(parsed.pdf, 'foo.pdf');
  assert.equal(parsed.maxPages, '4');
  assert.equal(parsed.debug, true);
});
