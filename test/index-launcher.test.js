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



test('launcher renders experimental apps in a dedicated section after stable apps', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /id="appSections"/, 'launcher should mount app sections wrapper');
  assert.match(launcherHtml, /function\s+renderAppSection\(title, sectionApps\)/, 'launcher should render app sections with optional heading');
  assert.match(launcherHtml, /const\s+stableApps\s*=\s*apps\.filter\(\(app\)\s*=>\s*!app\.experimental\);/, 'launcher should compute stable app list first');
  assert.match(launcherHtml, /const\s+experimentalApps\s*=\s*apps\.filter\(\(app\)\s*=>\s*app\.experimental\);/, 'launcher should compute experimental app list');
  assert.match(launcherHtml, /renderAppSection\('',\s*stableApps\);/, 'launcher should render stable apps before experimental apps');
  assert.match(launcherHtml, /renderAppSection\('Experimental',\s*experimentalApps\);/, 'launcher should render explicit experimental section heading');
  assert.match(launcherHtml, /\.app-section-title\s*\{[\s\S]*text-transform:\s*uppercase;/i, 'launcher should style section heading');
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
  assert.match(launcherHtml, /\.footer-logo\s*\{[\s\S]*width:\s*min\(640px, 100vw\);/i);
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
  assert.match(launcherHtml, /id="projectClientContact"/, 'launcher should include project client contact input');
  assert.match(launcherHtml, /id="projectBillingRate"/, 'launcher should include project billing rate input');
  assert.match(launcherHtml, /id="projectAddress"/, 'launcher should include project address input');
  assert.match(launcherHtml, /id="projectDescription"/, 'launcher should include project description input');
  assert.match(launcherHtml, /const\s+PROJECT_STORAGE_KEY\s*=\s*'surveyfoundryProjects'/, 'launcher should persist project metadata in localStorage');
  assert.match(launcherHtml, /function\s+openProject\(project\)/, 'launcher should define project start helper');
  assert.match(launcherHtml, /openApp\(`RecordQuarry\.html\?\$\{params\.toString\(\)\}`\)/, 'project start should open RecordQuarry with encoded project query params');
  assert.match(launcherHtml, /autostart:\s*'1'/, 'project start should request RecordQuarry autostart lookup');
  assert.match(launcherHtml, /start\.textContent\s*=\s*'Start in RecordQuarry'/, 'project list rows should offer RecordQuarry start action');
});



test('launcher project manager supports rename, edit details, and delete actions', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /function\s+renameProject\(projectId\)/, 'launcher should define a rename project helper');
  assert.match(launcherHtml, /window\.prompt\('Rename project',\s*project\.name\s*\|\|\s*''\)/, 'rename flow should prompt for a new name');
  assert.match(launcherHtml, /function\s+editProject\(projectId\)/, 'launcher should define an edit details helper');
  assert.match(launcherHtml, /window\.prompt\('Client contact information',\s*project\.clientContact\s*\|\|\s*''\)/, 'edit flow should include client contact prompt');
  assert.match(launcherHtml, /window\.prompt\('Billing rate \(USD\/hour\)',\s*project\.billingRate\s*\|\|\s*''\)/, 'edit flow should include billing rate prompt');
  assert.match(launcherHtml, /window\.prompt\('Project description',\s*project\.description\s*\|\|\s*''\)/, 'edit flow should include description prompt');
  assert.match(launcherHtml, /function\s+deleteProject\(projectId\)/, 'launcher should define a delete project helper');
  assert.match(launcherHtml, /function\s+deleteProject\(projectId\)[\s\S]*window\.confirm\(/, 'delete flow should require confirmation');
  assert.match(launcherHtml, /remove\.textContent\s*=\s*'Delete'/, 'project rows should include delete action');
  assert.match(launcherHtml, /rename\.textContent\s*=\s*'Rename'/, 'project rows should include rename action');
  assert.match(launcherHtml, /edit\.textContent\s*=\s*'Edit details'/, 'project rows should include edit-details action');
});

test('launcher project manager is opened from a button and closes after activation/create', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /id="openProjectManagerButton"[^>]*>Choose project<\/button>/, 'launcher home should expose a project picker button');
  assert.match(launcherHtml, /id="projectModalBackdrop" class="project-modal-backdrop hidden"/, 'project manager should render as hidden modal backdrop initially');
  assert.match(launcherHtml, /function\s+openProjectManager\(\)\s*\{[\s\S]*projectModalBackdrop\.classList\.remove\('hidden'\);/, 'project picker button should open the manager modal');
  assert.match(launcherHtml, /function\s+closeProjectManager\(\)\s*\{[\s\S]*projectModalBackdrop\.classList\.add\('hidden'\);/, 'project manager should provide a close helper');
  assert.match(launcherHtml, /makeActive\.addEventListener\('click',\s*\(\)\s*=>\s*\{[\s\S]*setActiveProject\(project\.id\);[\s\S]*closeProjectManager\(\);/, 'activating an existing project should return focus to launcher home by closing modal');
  assert.match(launcherHtml, /createProjectButton\.addEventListener\('click',\s*createProject\);/, 'create action should still be wired from modal');
  assert.match(launcherHtml, /const\s+clientContact\s*=\s*projectClientContactInput\.value\.trim\(\);/, 'create flow should read client contact metadata');
  assert.match(launcherHtml, /const\s+billingRate\s*=\s*projectBillingRateInput\.value\.trim\(\);/, 'create flow should read billing rate metadata');
  assert.match(launcherHtml, /const\s+description\s*=\s*projectDescriptionInput\.value\.trim\(\);/, 'create flow should read project description metadata');
  assert.match(launcherHtml, /clientContact,\s*[\s\S]*billingRate,\s*[\s\S]*description,/, 'create flow should persist new metadata fields on saved project');
  assert.match(launcherHtml, /setActiveProject\(project\.id\);[\s\S]*saveProjects\(\);[\s\S]*renderProjects\(\);[\s\S]*closeProjectManager\(\);/, 'creating a project should auto-activate and close modal');
  assert.match(launcherHtml, /activeProjectSummary\.textContent\s*=\s*activeProject[\s\S]*'No active project selected\.'/, 'launcher home should show active project summary text');
  assert.match(launcherHtml, /activeProjectHeader\.textContent\s*=\s*activeProject\s*\?\s*`Active project: \$\{activeProject\.name\}`\s*:\s*'';/, 'launcher header should show active project when selected and clear when none active');
});
