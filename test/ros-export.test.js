import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildParcelCsvPNEZD,
  buildPolygonCornerCsvRowsPNEZD,
  buildPointMarkerCsvRowsPNEZD,
} from '../src/ros-export.js';

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

test('buildPolygonCornerCsvRowsPNEZD emits corner rows for each ring vertex', () => {
  const features = [
    {
      attributes: { SUB_NAME: 'WEST ACRES' },
      geometry: { rings: [[[10, 20], [14, 20], [14, 24], [10, 24], [10, 20]]] },
    },
  ];

  const { csv, nextPoint, count } = buildPolygonCornerCsvRowsPNEZD(features, 7, 'SUBDIVISION_CORNER');
  const lines = csv.trim().split('\n');

  assert.equal(count, 4);
  assert.equal(lines[0], '7,20.000,10.000,0.000,SUBDIVISION_CORNER WEST ACRES R1 V1');
  assert.equal(lines[3], '10,24.000,10.000,0.000,SUBDIVISION_CORNER WEST ACRES R1 V4');
  assert.equal(nextPoint, 11);
});

test('buildPointMarkerCsvRowsPNEZD emits arbitrary marker points', () => {
  const markers = [
    { east: 100, north: 200, label: 'ADDRESS_POINT' },
    { east: 110, north: 210, label: 'ROS_POINT 1' },
  ];

  const { csv, nextPoint, count } = buildPointMarkerCsvRowsPNEZD(markers, 20, 'MARKER');
  const lines = csv.trim().split('\n');

  assert.equal(count, 2);
  assert.equal(lines[0], '20,200.000,100.000,0.000,MARKER ADDRESS_POINT');
  assert.equal(lines[1], '21,210.000,110.000,0.000,MARKER ROS_POINT 1');
  assert.equal(nextPoint, 22);
});
