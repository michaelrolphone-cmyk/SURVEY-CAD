import test from 'node:test';
import assert from 'node:assert/strict';
import { latLngToWorldAffine, sanitizeGeoreference, worldToLatLngAffine } from '../src/georeference-transform.js';

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
