import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseFieldToFinishDirective,
  resolveSequentialDirectiveBaseCode,
  buildLineworkSegments,
} from '../src/field-to-finish-rules-engine.js';
import {
  parsePointFileText,
  renderPointFileThumbnailDataUrl,
} from '../src/point-thumbnail-client.js';

test('shared field-to-finish parser resolves directive base codes', () => {
  assert.deepEqual(parseFieldToFinishDirective('EP BEG tree'), { action: 'BEG', baseCode: 'EP' });
  assert.equal(resolveSequentialDirectiveBaseCode(['BLDG', 'END'], 1), 'BLDG');
});

test('linework engine builds line segments from BEG/END directives', () => {
  const points = [
    { x: 10, y: 10, code: 'BLDG BEG' },
    { x: 20, y: 10, code: 'BLDG END' },
  ];
  const linework = buildLineworkSegments(points);
  assert.equal(linework.length, 1);
  assert.equal(linework[0].baseCode, 'BLDG');
  assert.equal(linework[0].segments.length, 1);
});

test('point thumbnail client parses csv point files and returns SVG data URLs', () => {
  const text = ['1,0,0,100,BLDG BEG', '2,10,0,100,BLDG END'].join('\n');
  const points = parsePointFileText(text);
  assert.equal(points.length, 2);
  const dataUrl = renderPointFileThumbnailDataUrl(text);
  assert.match(dataUrl, /^data:image\/svg\+xml;utf8,/);
});
