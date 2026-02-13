import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBearing,
  bearingToAzimuth,
  calculateTraverseFromOrderedCalls,
  closureRatio,
} from '../src/boundarylab.js';

test('parseBearing supports compact and spaced quadrant bearings', () => {
  assert.deepEqual(parseBearing('N45E'), { ns: 'N', ew: 'E', angle: 45 });
  assert.deepEqual(parseBearing('s 12.5 w'), { ns: 'S', ew: 'W', angle: 12.5 });
  assert.equal(parseBearing('N100E'), null);
  assert.equal(parseBearing('bad'), null);
});

test('bearingToAzimuth converts quadrants to north-azimuth', () => {
  assert.equal(bearingToAzimuth(parseBearing('N45E')), 45);
  assert.equal(bearingToAzimuth(parseBearing('N45W')), 315);
  assert.equal(bearingToAzimuth(parseBearing('S45E')), 135);
  assert.equal(bearingToAzimuth(parseBearing('S45W')), 225);
});

test('calculateTraverseFromOrderedCalls computes closure and error metrics', () => {
  const closed = calculateTraverseFromOrderedCalls({
    orderedCalls: [
      { bearing: 'N0E', distance: 100 },
      { bearing: 'S90E', distance: 100 },
      { bearing: 'S0W', distance: 100 },
      { bearing: 'N90W', distance: 100 },
    ],
  });
  assert.equal(closed.points.length, 5);
  assert.equal(closed.totalLength, 400);
  assert.ok((closed.linearMisclosure || 0) < 1e-9);
  assert.equal(closureRatio(closed.totalLength, closed.linearMisclosure), Infinity);

  const open = calculateTraverseFromOrderedCalls({
    orderedCalls: [
      { bearing: 'N45E', distance: 100 },
      { bearing: 'S45E', distance: 100 },
    ],
  });
  assert.ok((open.linearMisclosure || 0) > 0);
  assert.equal(open.angularMisclosure, 90);
  assert.ok((closureRatio(open.totalLength, open.linearMisclosure) || 0) > 1);
});
