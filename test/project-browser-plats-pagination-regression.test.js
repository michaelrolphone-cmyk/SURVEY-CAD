import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('PROJECT_BROWSER paginates large plats folders to avoid EvidenceDesk render lockups', async () => {
  const html = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');

  assert.match(
    html,
    /const\s+shouldPaginatePlats\s*=\s*folder\.key\s*===\s*'plats'\s*&&\s*folderEntries\.length\s*>\s*200;/,
    'Project Browser should detect large plats folders and enable pagination.',
  );
  assert.match(
    html,
    /showMoreButton\.textContent\s*=\s*'Load more plats';/,
    'Project Browser should provide a load-more control for large plat lists.',
  );
  assert.match(
    html,
    /Showing\s+\$\{renderedCount\.toLocaleString\(\)\}\s+of\s+\$\{folderEntries\.length\.toLocaleString\(\)\}\s+plats\./,
    'Project Browser should display rendered plat counts to keep the UI responsive while browsing large lists.',
  );

  assert.doesNotMatch(
    html,
    /showMoreButton\.textContent\s*=\s*'Load more previews';/,
    'Project Browser should no longer render a load-more control for collapsed thumbnail strips.',
  );
  assert.doesNotMatch(
    html,
    /Showing\s+\$\{renderedCount\.toLocaleString\(\)\}\s+of\s+\$\{toRender\.length\.toLocaleString\(\)\}\s+thumbnails\./,
    'Project Browser should stop rendering thumbnail pagination status copy in collapsed strips.',
  );
  assert.match(
    html,
    /const\s+stripPreviewObserver\s*=\s*typeof\s+window\.IntersectionObserver\s*===\s*'function'/,
    'Project Browser should defer thumbnail work with intersection observation for collapsed folder strips.',
  );
  assert.match(
    html,
    /const\s+getVisibleStripCount\s*=\s*\(\)\s*=>\s*\{/,
    'Project Browser should cap collapsed strip previews to the number of items that fit in the available strip width.',
  );
  assert.match(
    html,
    /const\s+visibleCount\s*=\s*getVisibleStripCount\(\);/,
    'Project Browser should render only the visible thumbnail count in collapsed strips.',
  );
  assert.match(
    html,
    /stripPreviewObserver\.observe\(item\);/,
    'Project Browser should enqueue thumbnail rendering only for strip items approaching the viewport.',
  );
});
