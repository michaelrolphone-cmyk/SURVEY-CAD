import test from 'node:test';
import assert from 'node:assert/strict';
import { latLngToWorldAffine, sanitizeGeoreference, translateLocalPointsToStatePlane, worldToLatLngAffine } from '../src/georeference-transform.js';

test('georeference affine conversion maps world to lat/lng and back', () => {
  const georef = {
    lat: { ax: 1e-6, by: 2e-6, c: 43.5 },
    lng: { ax: -3e-6, by: 1e-6, c: -116.2 },
  };

  const world = { x: 1250000.12, y: 645000.75 };
  const latLng = worldToLatLngAffine(world.x, world.y, georef);
  assert.ok(latLng);

  const roundTrip = latLngToWorldAffine(latLng.lat, latLng.lng, georef);
  assert.ok(roundTrip);
  assert.ok(Math.abs(roundTrip.x - world.x) < 1e-4);
  assert.ok(Math.abs(roundTrip.y - world.y) < 1e-4);
});

test('georeference sanitization rejects malformed transforms', () => {
  assert.equal(sanitizeGeoreference(null), null);
  assert.equal(sanitizeGeoreference({ lat: { ax: 1, by: 2 } }), null);
  assert.equal(latLngToWorldAffine(43.6, -116.1, { lat: { ax: 1, by: 2, c: 3 }, lng: { ax: 2, by: 4, c: 5 } }), null);
});


test('translateLocalPointsToStatePlane offsets every point using anchor mapping', () => {
  const localized = translateLocalPointsToStatePlane([
    { id: 'P1', x: 1000, y: 1000 },
    { id: 'P2', x: 1012.5, y: 987.25 },
  ], {
    anchorLocalX: 1000,
    anchorLocalY: 1000,
    anchorEast: 2500000,
    anchorNorth: 1200000,
  });

  assert.equal(localized.translation.eastOffset, 2499000);
  assert.equal(localized.translation.northOffset, 1199000);
  assert.deepEqual(localized.points.map((pt) => ({ id: pt.id, east: pt.east, north: pt.north })), [
    { id: 'P1', east: 2500000, north: 1200000 },
    { id: 'P2', east: 2500012.5, north: 1199987.25 },
  ]);
});

test('translateLocalPointsToStatePlane rejects malformed points', () => {
  assert.throws(() => translateLocalPointsToStatePlane([], {
    anchorLocalX: 0,
    anchorLocalY: 0,
    anchorEast: 1,
    anchorNorth: 1,
  }), /non-empty array/);

  assert.throws(() => translateLocalPointsToStatePlane([{ x: 'bad', y: 1 }], {
    anchorLocalX: 0,
    anchorLocalY: 0,
    anchorEast: 1,
    anchorNorth: 1,
  }), /numeric x\/y/);
});
