import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('RecordQuarry deduplicates CP&F corner lookups and uses one max-radius query per corner', async () => {
  const html = await fs.readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /const\s+cpfCornerRecordsCache\s*=\s*new\s+Map\(\)\s*;/, 'RecordQuarry should keep a cache for CP&F corner record queries.');
  assert.match(html, /const\s+cpfCornerRecordsInFlight\s*=\s*new\s+Map\(\)\s*;/, 'RecordQuarry should dedupe in-flight CP&F corner record queries.');
  assert.match(html, /if\s*\(cpfCornerRecordsCache\.has\(key\)\)\s*return\s+cpfCornerRecordsCache\.get\(key\);/, 'RecordQuarry should reuse cached CP&F corner query results.');
  assert.match(html, /if\s*\(cpfCornerRecordsInFlight\.has\(key\)\)\s*return\s+cpfCornerRecordsInFlight\.get\(key\);/, 'RecordQuarry should join an existing in-flight CP&F corner query.');
  assert.match(html, /distance:\s*maxMeters,/, 'RecordQuarry should query the CP&F layer once with the final requested distance.');
  assert.doesNotMatch(html, /const\s+radii\s*=\s*\[\s*5\s*,\s*10\s*,\s*25\s*,\s*50\s*,\s*100\s*,\s*150\s*,\s*maxMeters\s*\]/, 'RecordQuarry should not issue escalating-radius query loops per corner lookup.');
});
