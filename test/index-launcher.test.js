import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexHtmlPath = new URL('../index.html', import.meta.url);

test('launcher cards show app name, description, and larger icons', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /\.app-icon\s*\{[\s\S]*width:\s*56px;[\s\S]*height:\s*56px;/i);
  assert.match(launcherHtml, /<p class=\"app-description\">\$\{app\.description \|\| ''\}<\/p>/);
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


test('launcher includes SurveyFoundry branding in title and header', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /<title>SurveyFoundry Launcher<\/title>/);
  assert.match(launcherHtml, /<h1>SurveyFoundry App Launcher<\/h1>/);
});


test('launcher includes SurveyFoundry project manager and RecordQuarry start workflow', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /aria-label="RecordQuarry project manager"/, 'launcher should render project manager panel');
  assert.match(launcherHtml, /id="projectName"/, 'launcher should include project name input');
  assert.match(launcherHtml, /id="projectClient"/, 'launcher should include project client input');
  assert.match(launcherHtml, /id="projectAddress"/, 'launcher should include project address input');
  assert.match(launcherHtml, /const\s+PROJECT_STORAGE_KEY\s*=\s*'surveyfoundryProjects'/, 'launcher should persist project metadata in localStorage');
  assert.match(launcherHtml, /function\s+openProject\(project\)/, 'launcher should define project start helper');
  assert.match(launcherHtml, /openApp\(`RecordQuarry\.html\?\$\{params\.toString\(\)\}`\)/, 'project start should open RecordQuarry with encoded project query params');
  assert.match(launcherHtml, /autostart:\s*'1'/, 'project start should request RecordQuarry autostart lookup');
  assert.match(launcherHtml, /start\.textContent\s*=\s*'Start in RecordQuarry'/, 'project list rows should offer RecordQuarry start action');
});
