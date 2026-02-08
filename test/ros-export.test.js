import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildParcelCsvPNEZD,
  buildPolygonCornerCsvRowsPNEZD,
  buildPointMarkerCsvRowsPNEZD,
  buildUniquePolygonCsvRowsPNEZD,
  buildRosBoundaryCsvRowsPNEZD,
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


test('buildUniquePolygonCsvRowsPNEZD emits each coordinate once across parcel/subdivision/section features', () => {
  const features = [
    {
      attributes: { PARCEL: 'P1' },
      geometry: { rings: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
    },
    {
      attributes: { SUB_NAME: 'SUB A' },
      geometry: { rings: [[[0, 0], [10, 0], [12, 8], [0, 0]]] },
    },
    {
      attributes: { NAME: 'SEC 1' },
      geometry: { rings: [[[10, 10], [12, 8], [20, 20], [10, 10]]] },
    },
  ];

  const { csv, nextPoint, count } = buildUniquePolygonCsvRowsPNEZD(features, 1, 'BOUNDARY_CORNER');
  const lines = csv.trim().split('\n');

  assert.equal(count, 6);
  assert.equal(lines.length, 6);
  assert.equal(lines[0], '1,0.000,0.000,0.000,BOUNDARY_CORNER P1 R1 V1');
  assert.equal(lines[5], '6,20.000,20.000,0.000,BOUNDARY_CORNER SEC 1 R1 V3');
  assert.equal(nextPoint, 7);
});

test('buildRosBoundaryCsvRowsPNEZD applies simplified codes and optional CP&F notes', () => {
  const parcel = {
    geometry: { rings: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]] },
  };
  const subdivision = {
    geometry: { rings: [[[120, 0], [200, 0], [200, 100], [120, 100], [120, 0]]] },
  };
  const section = {
    geometry: { rings: [[[0, 0], [400, 0], [400, 400], [0, 400], [0, 0]]] },
  };
  const aliquots = [
    {
      geometry: {
        rings: [[
          [100, 100], [200, 100], [200, 200], [100, 200], [100, 100],
        ]],
      },
    },
  ];

  const notesByCoordinate = new Map([
    ['200.000000000,200.000000000', 'CPNFS: 1234567...321111...65456'],
  ]);

  const { csv, count } = buildRosBoundaryCsvRowsPNEZD({
    parcelFeature2243: parcel,
    subdivisionFeature2243: subdivision,
    sectionFeature2243: section,
    aliquotFeatures2243: aliquots,
    notesByCoordinate,
  });

  const lines = csv.trim().split('\n');
  assert.equal(count, lines.length);
  assert.match(lines[0], /,COR,$/);
  assert.ok(lines.some((line) => /,SUB,$/.test(line)), 'should include subdivision code');
  assert.ok(lines.some((line) => /,16COR,$/.test(line)), 'should classify aliquot corners as 16th corners');
  assert.ok(lines.some((line) => /,CSECOR,CPNFS: 1234567\.\.\.321111\.\.\.65456$/.test(line)), 'should include CP&F notes for PLSS points');
});

test('buildRosBoundaryCsvRowsPNEZD does not emit section-only corners when no aliquots are present', () => {
  const parcel = {
    geometry: { rings: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]] },
  };
  const section = {
    geometry: { rings: [[[0, 0], [400, 0], [400, 400], [0, 400], [0, 0]]] },
  };

  const { csv, count } = buildRosBoundaryCsvRowsPNEZD({
    parcelFeature2243: parcel,
    sectionFeature2243: section,
    aliquotFeatures2243: [],
  });

  const lines = csv.trim().split('\n');
  assert.equal(count, 4);
  assert.equal(lines.length, 4);
  assert.ok(lines.every((line) => /,COR,$/.test(line)), 'should only include parcel corners');
});


test('buildRosBoundaryCsvRowsPNEZD can omit PLSS-only points without CP&F notes', () => {
  const parcel = {
    geometry: { rings: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]] },
  };
  const section = {
    geometry: { rings: [[[0, 0], [400, 0], [400, 400], [0, 400], [0, 0]]] },
  };
  const aliquots = [
    {
      geometry: {
        rings: [[
          [100, 100], [200, 100], [200, 200], [100, 200], [100, 100],
        ]],
      },
    },
  ];

  const notesByCoordinate = new Map([
    ['200.000000000,200.000000000', 'CPNFS: 1234567'],
  ]);

  const { csv, count } = buildRosBoundaryCsvRowsPNEZD({
    parcelFeature2243: parcel,
    sectionFeature2243: section,
    aliquotFeatures2243: aliquots,
    notesByCoordinate,
    includePlssWithoutNotes: false,
  });

  const lines = csv.trim().split('\n');
  assert.equal(count, 5);
  assert.equal(lines.length, 5);
  assert.ok(lines.some((line) => /,COR,$/.test(line)), 'should still include parcel points');
  assert.ok(lines.some((line) => /,CSECOR,CPNFS: 1234567$/.test(line)), 'should include CP&F-backed PLSS point');
  assert.ok(lines.every((line) => !/,16COR,$/.test(line)), 'should exclude unbacked PLSS points');
});
