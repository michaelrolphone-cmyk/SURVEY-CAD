import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { APP_CATALOG } from '../src/app-catalog.js';

const SHARED_STYLESHEET_LINK = '<link rel="stylesheet" href="/assets/styles/shared-ui.css" />';
const sharedLinkRegex = new RegExp(SHARED_STYLESHEET_LINK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

const htmlFiles = ['index.html', ...new Set(APP_CATALOG.map((entry) => entry.entryHtml))];

test('all launcher-discoverable apps include shared ui stylesheet and opt-in class', async () => {
  for (const htmlFile of htmlFiles) {
    const html = await readFile(new URL(`../${htmlFile}`, import.meta.url), 'utf8');
    assert.match(html, sharedLinkRegex, `${htmlFile} should include shared-ui.css`);
    assert.match(html, /<body[^>]*\bsf-ui-controls\b[^>]*>/, `${htmlFile} should include sf-ui-controls on body`);
  }
});

test('shared ui stylesheet contains standardized control selectors', async () => {
  const css = await readFile(new URL('../assets/styles/shared-ui.css', import.meta.url), 'utf8');
  assert.match(css, /\.sf-ui-controls\s+input,\s*[\s\S]*\.sf-ui-controls\s+button/s);
  assert.match(css, /\.sf-ui-controls\s+\.primary/);
  assert.match(css, /\.sf-ui-controls\s+\.danger/);
});
