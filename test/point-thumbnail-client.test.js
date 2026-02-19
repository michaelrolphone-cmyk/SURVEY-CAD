import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseFieldToFinishDirective,
  resolveSequentialDirectiveBaseCode,
  buildLineworkSegments,
  deriveLineworkCodesFromFldConfig,
} from '../src/field-to-finish-rules-engine.js';
import {
  parsePointFileText,
  renderLineworkThumbnailDataUrl,
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

test('linework code derivation excludes symbol codes and includes line/polyline numeric types', () => {
  const lineworkCodes = deriveLineworkCodesFromFldConfig({
    rules: [
      { code: 'EP', entityType: '0' },
      { code: 'FENCE', entityType: '1' },
      { code: 'BLDG', entityType: '2' },
      { code: 'ROW', entityType: 'LINE' },
    ],
  });

  assert.equal(lineworkCodes.has('EP'), false);
  assert.equal(lineworkCodes.has('FENCE'), true);
  assert.equal(lineworkCodes.has('BLDG'), true);
  assert.equal(lineworkCodes.has('ROW'), true);
});

test('linework code derivation supports snake_case entity_type values from persisted FLD config payloads', () => {
  const lineworkCodes = deriveLineworkCodesFromFldConfig({
    rules: [
      { code: 'EP', entity_type: '0' },
      { code: 'WALL', entity_type: '1' },
      { code: 'LOT', raw: { entity_type: '2' } },
    ],
  });

  assert.equal(lineworkCodes.has('EP'), false);
  assert.equal(lineworkCodes.has('WALL'), true);
  assert.equal(lineworkCodes.has('LOT'), true);
});

test('thumbnail renderer skips symbol-only field-to-finish codes when linework codes are provided', () => {
  const symbolPoints = [
    { x: 0, y: 0, code: 'EP BEG' },
    { x: 5, y: 0, code: 'EP END' },
  ];
  const symbolOnlyDataUrl = renderLineworkThumbnailDataUrl(symbolPoints, {
    lineworkCodes: new Set(['FENCE']),
  });
  assert.equal(symbolOnlyDataUrl, '');

  const mixedPoints = [
    ...symbolPoints,
    { x: 0, y: 5, code: 'FENCE BEG' },
    { x: 5, y: 5, code: 'FENCE END' },
  ];
  const dataUrl = renderLineworkThumbnailDataUrl(mixedPoints, {
    lineworkCodes: new Set(['FENCE']),
  });
  assert.match(dataUrl, /^data:image\/svg\+xml;utf8,/);
});



test('thumbnail renderer preserves 1:1 northing/easting aspect ratio', () => {
  const points = [
    { x: 0, y: 0, code: 'LOT BEG' },
    { x: 20, y: 0, code: 'LOT END' },
    { x: 0, y: 0, code: 'LEG BEG' },
    { x: 0, y: 20, code: 'LEG END' },
  ];
  const dataUrl = renderLineworkThumbnailDataUrl(points, {
    width: 88,
    height: 52,
    lineworkCodes: new Set(['LOT', 'LEG']),
  });
  const svg = decodeURIComponent(dataUrl.replace('data:image/svg+xml;utf8,', ''));
  const lines = [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"\s*\/>/g)];
  assert.equal(lines.length, 2);

  const lengths = lines.map((match) => {
    const [, x1, y1, x2, y2] = match;
    return Math.hypot(Number(x2) - Number(x1), Number(y2) - Number(y1));
  });
  assert.ok(Math.abs(lengths[0] - lengths[1]) < 0.01, 'equal ground lengths should render as equal pixel lengths');
});
