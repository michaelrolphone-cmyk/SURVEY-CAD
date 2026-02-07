import test from 'node:test';
import assert from 'node:assert/strict';
import { buildParcelCsvPNEZD, buildAliquotCsvRowsPNEZD } from '../src/ros-export.js';

test('buildParcelCsvPNEZD emits P,N,E,Z,D rows and strips duplicate closing vertex', () => {
  const parcel = {
    attributes: { PARCEL: 'R12345' },
    geometry: {
      rings: [
        [[100, 200], [110, 200], [110, 210], [100, 210], [100, 200]],
      ],
    },
  };

  const { csv, nextPoint } = buildParcelCsvPNEZD(parcel, 1);
  const lines = csv.trim().split('\n');

  assert.equal(lines.length, 4);
  assert.equal(lines[0], '1,200.000,100.000,0.000,PARCEL_VERTEX R12345 R1 V1');
  assert.equal(lines[3], '4,210.000,100.000,0.000,PARCEL_VERTEX R12345 R1 V4');
  assert.equal(nextPoint, 5);
});

test('buildAliquotCsvRowsPNEZD appends centroid coordinates for aliquots', () => {
  const aliquots = [
    {
      attributes: { ALIQUOT: 'NWNW' },
      geometry: { rings: [[[10, 20], [14, 20], [14, 24], [10, 24], [10, 20]]] },
    },
    {
      attributes: { ALIQUOT_LABEL: 'NESE' },
      geometry: { rings: [[[30, 40], [34, 40], [34, 44], [30, 44], [30, 40]]] },
    },
  ];

  const { csv, nextPoint, count } = buildAliquotCsvRowsPNEZD(aliquots, 7);
  const lines = csv.trim().split('\n');

  assert.equal(count, 2);
  assert.equal(lines[0], '7,22.000,12.000,0.000,ALIQUOT_CENTROID NWNW');
  assert.equal(lines[1], '8,42.000,32.000,0.000,ALIQUOT_CENTROID NESE');
  assert.equal(nextPoint, 9);
});
