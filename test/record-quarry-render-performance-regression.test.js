import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('RecordQuarry renders summary cards in browser-yielding batches to avoid UI lockups', async () => {
  const html = await fs.readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(
    html,
    /const\s+SUMMARY_RENDER_BATCH_SIZE\s*=\s*24\s*;/,
    'RecordQuarry should define a bounded summary render batch size.'
  );
  assert.match(
    html,
    /async\s+function\s+setSummaryCards\s*\(cards\)\s*\{[\s\S]*const\s+shouldChunk\s*=\s*cards\.length\s*>\s*SUMMARY_RENDER_BATCH_SIZE;[\s\S]*await\s+yieldToBrowserFrame\(\);[\s\S]*\}/,
    'RecordQuarry should yield between summary-card batches during large renders.'
  );
  assert.match(
    html,
    /await\s+setSummaryCards\(cards\);/,
    'RecordQuarry lookup flow should wait for batched summary rendering before running follow-up UI work.'
  );
});
