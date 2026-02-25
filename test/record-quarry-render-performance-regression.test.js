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
  assert.match(
    html,
    /const\s+ROS_THUMBNAIL_MAX_CONCURRENCY\s*=\s*4\s*;[\s\S]*const\s+rosThumbnailLoadQueue\s*=\s*\[\]\s*;[\s\S]*let\s+rosThumbnailLoadsActive\s*=\s*0\s*;/,
    'RecordQuarry should cap concurrent ROS/subdivision thumbnail loads and maintain a shared queue.'
  );
  assert.match(
    html,
    /function\s+enqueueRosThumbnailLoad\s*\(imgEl,\s*thumbnailUrl\)\s*\{[\s\S]*drainRosThumbnailLoadQueue\(\);[\s\S]*\}/,
    'RecordQuarry should enqueue thumbnail loads instead of firing all requests at once.'
  );
  assert.match(
    html,
    /const\s+ok\s*=\s*await\s+enqueueRosThumbnailLoad\(img,\s*thumbnailUrl\);/,
    'RecordQuarry lazy thumbnail loading should use the bounded queue path.'
  );
});
