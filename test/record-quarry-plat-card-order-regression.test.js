import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const recordQuarryPath = new URL('../RecordQuarry.html', import.meta.url);

test('RecordQuarry renders subdivision plat cards after aliquot CP&F cards and before ROS cards', async () => {
  const html = await readFile(recordQuarryPath, 'utf8');

  const aliquotCardsIndex = html.indexOf('const aliquotCardSliceStart = cards.length;');
  const subdivisionCardsIndex = html.indexOf('// Render subdivision plat cards after aliquot CP&F summaries and before ROS cards.');
  const rosCardsIndex = html.indexOf('if (ros.length) {');

  assert.notEqual(aliquotCardsIndex, -1, 'Aliquot card rendering block should exist.');
  assert.notEqual(subdivisionCardsIndex, -1, 'Subdivision plat rendering block should exist.');
  assert.notEqual(rosCardsIndex, -1, 'ROS rendering block should exist.');

  assert.ok(
    aliquotCardsIndex < subdivisionCardsIndex,
    'Subdivision plat cards should be rendered after aliquot cards so CP&F summaries appear first.'
  );
  assert.ok(
    subdivisionCardsIndex < rosCardsIndex,
    'Subdivision plat cards should be rendered before Record of Survey cards.'
  );
});
