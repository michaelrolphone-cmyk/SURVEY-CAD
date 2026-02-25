import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('RecordQuarry subdivision cards use subdivision name as title and show measured parcel distance', async () => {
  const html = await fs.readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /const\s+distanceMeters\s*=\s*Number\(entry\?\.distanceMeters\);/, 'Subdivision cards should read per-feature distance metadata.');
  assert.match(html, /\?\s*`\$\{fmtDist\(distanceMeters\)\}\s+from\s+parcel\s+centroid`/, 'Subdivision card subtitle should display computed distance from the parcel centroid.');
  assert.match(html, /const\s+c\s*=\s*card\(\s*subdivisionName,\s*subtitle,/, 'Subdivision card header should use subdivision name instead of a numeric placeholder title.');
  assert.match(html, /out\.push\(\{\s*feature,\s*name,\s*plat,\s*distanceMeters\s*\}\);/, 'Nearby subdivision entries should retain computed distance metadata for card rendering.');
});

test('RecordQuarry ROS labels include recorder book/page context when available', async () => {
  const html = await fs.readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /const\s+recorderBook\s*=\s*pick\(\['RecorderBook',\s*'RECORDERBOOK',\s*'Book',\s*'BOOK',\s*'BookNo',\s*'BOOKNO'\]\);/, 'ROS labels should extract recorder book values from common field variants.');
  assert.match(html, /const\s+recorderPage\s*=\s*pick\(\['RecorderPage',\s*'RECORDERPAGE',\s*'Page',\s*'PAGE',\s*'Pg',\s*'PG'\]\);/, 'ROS labels should extract recorder page values from common field variants.');
  assert.match(html, /if \(recorderBook && recorderPage\) parts\.push\(`Book \$\{recorderBook\} Page \$\{recorderPage\}`\);/, 'ROS labels should combine recorder book and page into a single readable segment.');
});
