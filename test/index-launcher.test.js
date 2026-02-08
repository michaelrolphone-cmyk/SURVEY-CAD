import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexHtmlPath = new URL('../index.html', import.meta.url);

test('launcher cards show app name, description, and larger icons', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /\.app-icon\s*\{[\s\S]*width:\s*56px;[\s\S]*height:\s*56px;/i);
  assert.match(launcherHtml, /<p class=\"app-description\">\$\{app\.description \|\| ''\}<\/p>/);
  assert.match(launcherHtml, /\.app-card\s*\{[\s\S]*align-items:\s*flex-start;/i);
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
  assert.match(launcherHtml, /id="activeProjectHeader" class="header-meta" aria-live="polite"/, 'header should include active project status region');
  assert.match(launcherHtml, /<img src="\/assets\/icons\/SurveyFoundry\.png" alt="SurveyFoundry app icon" class="launcher-icon"\s*\/>/);
  assert.match(launcherHtml, /\.header-meta\s*\{[\s\S]*margin-left:\s*auto;[\s\S]*text-align:\s*right;/i);
  assert.match(launcherHtml, /<footer class="footer-logo-wrap"[\s\S]*<img src="943\.png" alt="SurveyFoundry logo" class="footer-logo"/);
  assert.match(launcherHtml, /header\s*\{[\s\S]*align-items:\s*center;/i);
  assert.match(launcherHtml, /\.footer-logo-wrap\s*\{[\s\S]*justify-content:\s*center;/i);
  assert.match(launcherHtml, /\.footer-logo-wrap\.hidden\s*\{[\s\S]*display:\s*none;/i);
  assert.match(launcherHtml, /\.footer-logo\s*\{[\s\S]*width:\s*min\(320px, 58vw\);/i);
  assert.match(launcherHtml, /footerLogoWrap\?\.classList\.remove\('hidden'\);/, 'showHome should display footer logo only on launcher home screen');
  assert.match(launcherHtml, /footerLogoWrap\?\.classList\.add\('hidden'\);/, 'openApp should hide footer logo when an app is opened');
});

test('launcher mobile viewer uses full-width iframe layout', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /@media \(max-width: 760px\)\s*\{[\s\S]*\.viewer\s*\{[\s\S]*padding:\s*0;/i);
  assert.match(launcherHtml, /@media \(max-width: 760px\)\s*\{[\s\S]*iframe\s*\{[\s\S]*border-left:\s*0;[\s\S]*border-right:\s*0;[\s\S]*border-radius:\s*0;/i);
});




test('launcher tracks active project and app launches include active project query params', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /const\s+ACTIVE_PROJECT_STORAGE_KEY\s*=\s*'surveyfoundryActiveProjectId'/, 'launcher should persist active project identity');
  assert.match(launcherHtml, /function\s+setActiveProject\(projectId\)/, 'launcher should define active-project setter');
  assert.match(launcherHtml, /function\s+withActiveProject\(file\)/, 'launcher should define active-project URL mapper');
  assert.match(launcherHtml, /url\.searchParams\.set\('activeProjectId',\s*String\(project\.id\)\)/, 'launcher should append activeProjectId to launched apps');
  assert.match(launcherHtml, /url\.searchParams\.set\('activeProjectName',\s*String\(project\.name\s*\|\|\s*''\)\)/, 'launcher should append activeProjectName to launched apps');
  assert.match(launcherHtml, /setActiveProject\(project\.id\);[\s\S]*const params = new URLSearchParams\(/, 'starting a project in RecordQuarry should mark project active');
  assert.match(launcherHtml, /makeActive\.textContent\s*=\s*project\.id === activeProjectId \? 'Active project' : 'Set active project'/, 'project list should expose explicit set-active action');
  assert.match(launcherHtml, /const resolvedFile = withActiveProject\(file\);/, 'openApp should resolve app URL with active project metadata');
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


test('launcher project manager is opened from a button and closes after activation/create', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /id="openProjectManagerButton"[^>]*>Choose project<\/button>/, 'launcher home should expose a project picker button');
  assert.match(launcherHtml, /id="projectModalBackdrop" class="project-modal-backdrop hidden"/, 'project manager should render as hidden modal backdrop initially');
  assert.match(launcherHtml, /function\s+openProjectManager\(\)\s*\{[\s\S]*projectModalBackdrop\.classList\.remove\('hidden'\);/, 'project picker button should open the manager modal');
  assert.match(launcherHtml, /function\s+closeProjectManager\(\)\s*\{[\s\S]*projectModalBackdrop\.classList\.add\('hidden'\);/, 'project manager should provide a close helper');
  assert.match(launcherHtml, /makeActive\.addEventListener\('click',\s*\(\)\s*=>\s*\{[\s\S]*setActiveProject\(project\.id\);[\s\S]*closeProjectManager\(\);/, 'activating an existing project should return focus to launcher home by closing modal');
  assert.match(launcherHtml, /createProjectButton\.addEventListener\('click',\s*createProject\);/, 'create action should still be wired from modal');
  assert.match(launcherHtml, /setActiveProject\(project\.id\);[\s\S]*saveProjects\(\);[\s\S]*renderProjects\(\);[\s\S]*closeProjectManager\(\);/, 'creating a project should auto-activate and close modal');
  assert.match(launcherHtml, /activeProjectSummary\.textContent\s*=\s*activeProject[\s\S]*'No active project selected\.'/, 'launcher home should show active project summary text');
  assert.match(launcherHtml, /activeProjectHeader\.textContent\s*=\s*activeProject\s*\?\s*`Active project: \$\{activeProject\.name\}`\s*:\s*'';/, 'launcher header should show active project when selected and clear when none active');
});
