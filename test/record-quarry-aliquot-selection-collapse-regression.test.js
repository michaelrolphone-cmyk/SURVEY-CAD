import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('RecordQuarry keeps aliquots unselected by default when no saved selection exists', async () => {
  const html = await fs.readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(
    html,
    /applySelectionByMode\(\s*state\.selectedAliquotKeys,\s*buildAllSelectedAliquotKeys\(state\.aliquotFeatures\),\s*selection\?\.selectedAliquotKeys,\s*selection\?\.deselectedAliquotKeys,\s*false\s*\);/,
    'RecordQuarry should default aliquot selection to false when no selection snapshot is present.'
  );
  assert.doesNotMatch(
    html,
    /applySelectionByMode\(\s*state\.selectedAliquotKeys,\s*buildAllSelectedAliquotKeys\(state\.aliquotFeatures\),\s*selection\?\.selectedAliquotKeys,\s*selection\?\.deselectedAliquotKeys,\s*true\s*\);/,
    'RecordQuarry should not default all aliquots to selected after lookup hydration.'
  );
});

test('RecordQuarry collapses far aliquots by distance regardless of export selection state', async () => {
  const html = await fs.readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(
    html,
    /const\s+isFar\s*=\s*distMeters\s*>\s*COLLAPSE_DIST_M\s*;/,
    'RecordQuarry should classify far aliquots strictly by distance.'
  );
  assert.doesNotMatch(
    html,
    /const\s+isFar\s*=\s*distMeters\s*>\s*COLLAPSE_DIST_M\s*&&\s*!isAliquotSelected\(f,\s*idx\)\s*;/,
    'RecordQuarry should not bypass distance collapsing when an aliquot is selected for export.'
  );
});
