import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEquipmentLogOptionLabel, buildEquipmentLogOptions } from '../src/equipment-log-options.js';

test('buildEquipmentLogOptionLabel prefers make+model and appends serial number', () => {
  const label = buildEquipmentLogOptionLabel({
    make: 'Trimble',
    model: 'S7',
    equipmentType: 'Total Station',
    serialNumber: 'SN-1001',
  });

  assert.equal(label, 'Trimble S7 (SN-1001)');
});

test('buildEquipmentLogOptionLabel falls back to equipmentType when make/model are blank', () => {
  const label = buildEquipmentLogOptionLabel({ equipmentType: 'GPS Rover' });
  assert.equal(label, 'GPS Rover');
});

test('buildEquipmentLogOptions returns unique, sorted labels and drops empty entries', () => {
  const options = buildEquipmentLogOptions([
    { make: 'Leica', model: 'GS18', serialNumber: 'ABC' },
    { make: 'Leica', model: 'GS18', serialNumber: 'ABC' },
    { equipmentType: 'Total Station' },
    {},
  ]);

  assert.deepEqual(options, ['Leica GS18 (ABC)', 'Total Station']);
});
