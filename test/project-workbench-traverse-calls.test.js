import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeBoundaryLabCalls,
  persistBoundaryLabTraverseCalls,
  hydrateBoundaryLabTraverseCalls,
} from '../src/project-workbench-traverse-calls.js';

test('normalizeBoundaryLabCalls keeps only valid bearing/distance pairs', () => {
  const out = normalizeBoundaryLabCalls([
    { bearing: ' N 10-00-00 E ', distance: '100.5' },
    { bearing: '', distance: 50 },
    { bearing: 'S 2-0-0 W', distance: 'NaN' },
    { bearing: 'N 1-0-0 W', distance: 0 },
  ]);

  assert.deepEqual(out, [{ bearing: 'N 10-00-00 E', distance: 100.5 }]);
});

test('persistBoundaryLabTraverseCalls creates tagged evidence once and returns extraction ids', async () => {
  const createdEvidence = [];
  const createdExtractions = [];
  const store = {
    async listEvidence() {
      return { items: [] };
    },
    async createEvidence(_casefileId, payload) {
      createdEvidence.push(payload);
      return { id: 'evidence-1' };
    },
    async createExtraction(_casefileId, payload) {
      createdExtractions.push(payload);
      return { id: `ex-${createdExtractions.length}` };
    },
  };

  const ids = await persistBoundaryLabTraverseCalls({
    store,
    casefileId: 'casefile-1',
    calls: [
      { bearing: 'N 10-00-00 E', distance: 100 },
      { bearing: 'S 20-00-00 W', distance: 50 },
    ],
  });

  assert.deepEqual(ids, ['ex-1', 'ex-2']);
  assert.equal(createdEvidence.length, 1);
  assert.equal(createdEvidence[0].type, 'Other');
  assert.equal(createdExtractions.length, 2);
  assert.equal(createdExtractions[0].evidenceId, 'evidence-1');
  assert.equal(createdExtractions[1].label, 'BoundaryLab Call 2');
});

test('hydrateBoundaryLabTraverseCalls resolves extraction ids into bearing/distance calls', async () => {
  const store = {
    async getExtraction(_casefileId, extractionId) {
      if (extractionId === 'missing') throw new Error('not found');
      return {
        bearingText: extractionId === 'a' ? 'N 1-0-0 E' : 'S 2-0-0 W',
        distance: extractionId === 'a' ? 100 : 200,
      };
    },
  };

  const traverse = await hydrateBoundaryLabTraverseCalls({
    store,
    casefileId: 'case-1',
    traverse: { start: { N: 0, E: 0 }, basis: { label: 'BASIS', rotationDeg: 0 }, calls: ['a', 'missing', 'b'] },
  });

  assert.deepEqual(traverse.calls, [
    { bearing: 'N 1-0-0 E', distance: 100 },
    { bearing: 'S 2-0-0 W', distance: 200 },
  ]);
});
