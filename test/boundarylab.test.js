import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBearing,
  bearingToAzimuth,
  calculateTraverseFromOrderedCalls,
  closureRatio,
  formatDms,
  azimuthToBearing,
  LINEAR_CLOSURE_TOLERANCE,
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
  assert.equal(open.closureBearing, `S 90°00'00.00" E`);
  assert.ok((closureRatio(open.totalLength, open.linearMisclosure) || 0) > 1);
});


test('calculateTraverseFromOrderedCalls treats small rounding errors as closed and returns Closed bearing', () => {
  const nearlyClosed = calculateTraverseFromOrderedCalls({
    orderedCalls: [
      { bearing: 'N45W', distance: 100 },
      { bearing: 'S45E', distance: 100.005 },
    ],
  });

  assert.ok((nearlyClosed.linearMisclosure || 0) <= LINEAR_CLOSURE_TOLERANCE);
  assert.equal(nearlyClosed.closureIsLinear, true);
  assert.equal(nearlyClosed.closureBearing, 'Closed');
});

test('azimuthToBearing formats closure azimuths as quadrant bearings', () => {
  assert.equal(azimuthToBearing(0), `N 0°00'00.00" E`);
  assert.equal(azimuthToBearing(135), `N 45°00'00.00" W`);
  assert.equal(azimuthToBearing(225), `S 45°00'00.00" W`);
});

test('calculateTraverseFromOrderedCalls reports zero angular misclosure for linearly closed reversals', () => {
  const closedOutAndBack = calculateTraverseFromOrderedCalls({
    orderedCalls: [
      { bearing: 'N45E', distance: 125 },
      { bearing: 'S45W', distance: 125 },
    ],
  });

  assert.ok((closedOutAndBack.linearMisclosure || 0) <= 1e-6);
  assert.equal(closedOutAndBack.angularMisclosure, 0);
});


test('formatDms renders angular errors in DMS text with rollover-safe precision', () => {
  assert.equal(formatDms(90), `90°00'00.00"`);
  assert.equal(formatDms(12.5), `12°30'00.00"`);
  assert.equal(formatDms(12.9999999), `13°00'00.00"`);
  assert.equal(formatDms(Number.NaN), '—');
});
