import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePointFileExportFormat,
  buildEquipmentLogPointFilePayload,
} from '../src/equipment-log-point-files.js';

test('normalizePointFileExportFormat maps txt files to txt and defaults to csv', () => {
  assert.equal(normalizePointFileExportFormat('setup-notes.txt'), 'txt');
  assert.equal(normalizePointFileExportFormat('control.csv'), 'csv');
  assert.equal(normalizePointFileExportFormat('no-extension'), 'csv');
});

test('buildEquipmentLogPointFilePayload returns null when required values are missing', () => {
  assert.equal(buildEquipmentLogPointFilePayload({ projectId: '', fileName: 'a.csv', text: '1,2,3' }), null);
  assert.equal(buildEquipmentLogPointFilePayload({ projectId: 'proj-1', fileName: '', text: '1,2,3' }), null);
  assert.equal(buildEquipmentLogPointFilePayload({ projectId: 'proj-1', fileName: 'a.csv', text: '  ' }), null);
});

test('buildEquipmentLogPointFilePayload builds equipment-log source metadata for project point files', () => {
  const payload = buildEquipmentLogPointFilePayload({
    projectId: 'proj-1',
    fileName: 'Control.txt',
    text: '1,2,3',
    log: {
      jobFileName: 'Audit Job',
      equipmentType: 'Trimble S7',
      rodman: 'Jordan',
    },
  });

  assert.equal(payload.pointFileName, 'Control.txt');
  assert.equal(payload.pointFileState.exportFormat, 'txt');
  assert.equal(payload.pointFileState.text, '1,2,3');
  assert.equal(payload.source, 'equipment-log');
  assert.equal(payload.sourceLabel, 'Equipment log: Audit Job · Trimble S7 · Jordan');
});
