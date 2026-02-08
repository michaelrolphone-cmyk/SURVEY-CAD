import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexHtmlPath = new URL('../index.html', import.meta.url);

test('launcher cards show app name only and larger icons', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /\.app-icon\s*\{[\s\S]*width:\s*56px;[\s\S]*height:\s*56px;/i);
  assert.doesNotMatch(launcherHtml, /<span>\$\{app\.entryHtml\}<\/span>/);
  assert.match(launcherHtml, /option\.textContent\s*=\s*app\.name;/);
  assert.doesNotMatch(launcherHtml, /option\.textContent\s*=\s*`\$\{app\.name\}\s*\(\$\{app\.entryHtml\}\)`;/);
});


test('launcher supports in-iframe app handoff navigation messages', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /window\.addEventListener\('message',\s*\(event\)\s*=>\s*\{/, 'launcher should listen for cross-app handoff messages');
  assert.match(launcherHtml, /event\.origin\s*!==\s*window\.location\.origin/, 'launcher should require same-origin postMessage handoff');
  assert.match(launcherHtml, /message\.type\s*!==\s*'survey-cad:navigate-app'/, 'launcher should only process survey-cad handoff events');
  assert.match(launcherHtml, /openApp\(`\$\{file\}\$\{url\.search\}`\)/, 'launcher should navigate iframe app source with query params when handoff is requested');
});
