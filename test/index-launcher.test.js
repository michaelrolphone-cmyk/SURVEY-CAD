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



test('launcher viewer removes toolbar controls and keeps iframe-only layout', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.doesNotMatch(launcherHtml, /id="reloadButton"/, 'viewer should remove reload control');
  assert.doesNotMatch(launcherHtml, /id="backButton"/, 'viewer should remove back-to-launcher button');
  assert.doesNotMatch(launcherHtml, /id="appSelect"/, 'viewer should remove switch-app dropdown');
  assert.doesNotMatch(launcherHtml, /reloadButton\.addEventListener/, 'viewer should no longer wire reload button behavior');
  assert.doesNotMatch(launcherHtml, /backButton\.addEventListener/, 'viewer should no longer wire back button behavior');
  assert.doesNotMatch(launcherHtml, /appSelect\.addEventListener/, 'viewer should no longer wire app-switch behavior');
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
  assert.match(launcherHtml, /<h1 id="launcherHeaderTitle">SurveyFoundry App Launcher<\/h1>/);
  assert.match(launcherHtml, /id="activeProjectHeader" class="header-meta" aria-live="polite"/, 'header should include active project status region');
  assert.match(launcherHtml, /<a href="\/" id="launcherHomeLink" class="launcher-home-link" aria-label="Go to SurveyFoundry launcher home page">[\s\S]*<span id="launcherBackChevron" class="launcher-back-chevron" aria-hidden="true">‹<\/span>[\s\S]*<img id="launcherHeaderIcon" src="\/assets\/icons\/SurveyFoundry\.png" alt="SurveyFoundry app icon" class="launcher-icon" \/>/);
  assert.match(launcherHtml, /<header>[\s\S]*<a href="\/" id="launcherHomeLink" class="launcher-home-link" aria-label="Go to SurveyFoundry launcher home page">[\s\S]*<\/a>[\s\S]*<h1 id="launcherHeaderTitle">SurveyFoundry App Launcher<\/h1>/, 'header should place launcher icon link before app title text on the left');
  assert.match(launcherHtml, /\.header-meta\s*\{[\s\S]*margin-left:\s*auto;[\s\S]*text-align:\s*right;[\s\S]*background:\s*linear-gradient\(135deg, #facc15, #f97316\);[\s\S]*border-radius:\s*999px;/i, 'header active project should render as a standout pill');
  assert.match(launcherHtml, /<footer class="footer-logo-wrap"[\s\S]*<img src="943\.png" alt="SurveyFoundry logo" class="footer-logo"/);
  assert.match(launcherHtml, /header\s*\{[\s\S]*align-items:\s*center;/i);
  assert.match(launcherHtml, /\.launcher-icon\s*\{[\s\S]*width:\s*84px;[\s\S]*height:\s*84px;/i, 'header launcher icon should render at twice the previous size');
  assert.match(launcherHtml, /\.footer-logo-wrap\s*\{[\s\S]*justify-content:\s*center;/i);
  assert.match(launcherHtml, /\.footer-logo-wrap\.hidden\s*\{[\s\S]*display:\s*none;/i);
  assert.match(launcherHtml, /\.footer-logo\s*\{[\s\S]*width:\s*min\(1280px, 100vw\);/i);
  assert.match(launcherHtml, /body\s*\{[\s\S]*background-attachment:\s*fixed;/i, 'launcher body background should support full-screen static map backdrop');
  assert.match(launcherHtml, /footerLogoWrap\?\.classList\.remove\('hidden'\);/, 'showHome should display footer logo only on launcher home screen');
  assert.match(launcherHtml, /footerLogoWrap\?\.classList\.add\('hidden'\);/, 'openApp should hide footer logo when an app is opened');
});



test('launcher header switches to opened app icon/title and shows back chevron affordance', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /\.launcher-back-chevron\s*\{[\s\S]*display:\s*none;/i, 'back chevron should be hidden on home launcher state');
  assert.match(launcherHtml, /\.launcher-home-link\.app-open \.launcher-back-chevron\s*\{[\s\S]*display:\s*inline-block;/i, 'back chevron should appear only when an app is open');
  assert.match(launcherHtml, /const\s+LAUNCHER_HOME_TITLE\s*=\s*'SurveyFoundry App Launcher';/, 'launcher should define default home title constant');
  assert.match(launcherHtml, /function\s+updateHeaderForApp\(file\)\s*\{[\s\S]*launcherHeaderIcon\.src\s*=\s*appIconPath;[\s\S]*launcherHeaderTitle\.textContent\s*=\s*appName;[\s\S]*launcherHomeLink\.classList\.add\('app-open'\);/, 'opening an app should update header title/icon and show back chevron state');
  assert.match(launcherHtml, /function\s+showHome\(\)\s*\{[\s\S]*launcherHomeLink\.classList\.remove\('app-open'\);[\s\S]*launcherHeaderIcon\.src\s*=\s*LAUNCHER_HOME_ICON;[\s\S]*launcherHeaderTitle\.textContent\s*=\s*LAUNCHER_HOME_TITLE;/, 'returning home should restore SurveyFoundry title and icon');
  assert.match(launcherHtml, /launcherHomeLink\.addEventListener\('click',\s*\(event\)\s*=>\s*\{[\s\S]*event\.preventDefault\(\);[\s\S]*if \(!currentApp\) return;[\s\S]*showHome\(\);/, 'clicking header icon/chevron should return to home when an app is open');
});

test('launcher fetches and applies static map background for active project address', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /const\s+backgroundMapUrlCache\s*=\s*new Map\(\);/, 'launcher should cache map background URLs per address');
  assert.match(launcherHtml, /function\s+setLauncherBackground\(mapUrl = ''\)/, 'launcher should support dynamic background switching');
  assert.match(launcherHtml, /function\s+buildStaticMapUrl\(lat, lon, address = ''\)/, 'launcher should derive static map URL from geocoded coordinates');
  assert.match(launcherHtml, /new URL\('\/api\/static-map',\s*window\.location\.origin\)/, 'launcher should build static map URLs through the local static map proxy endpoint');
  assert.match(launcherHtml, /fetch\(`\/api\/geocode\?address=\$\{encodeURIComponent\(address\)\}`\)/, 'launcher should geocode active project address before rendering map background');
  assert.match(launcherHtml, /if \(!Number\.isFinite\(geocode\?\.lat\) \|\| !Number\.isFinite\(geocode\?\.lon\)\)/, 'launcher should validate geocode coordinates before using them');
  assert.match(launcherHtml, /syncActiveProjectBackground\(\);/, 'renderProjects should refresh the launcher background for active project changes');
});

test('launcher mobile viewer uses full-width iframe layout', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /@media \(max-width: 760px\)\s*\{[\s\S]*\.viewer\s*\{[\s\S]*padding:\s*0;/i);
  assert.doesNotMatch(launcherHtml, /@media \(max-width: 760px\)\s*\{[\s\S]*\.toolbar\s*\{/, 'mobile styles should not include removed toolbar block');
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
  assert.match(launcherHtml, /activeProjectHeader\.textContent\s*=\s*activeProject\s*\?\s*`\$\{activeProject\.name\}`\s*:\s*'';/, 'launcher header should show only the active project name when selected and clear when none active');
});

test('launcher project manager enforces sequential project status progression', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /const\s+PROJECT_STATUS_SEQUENCE\s*=\s*\[[\s\S]*'Proposed',[\s\S]*'Researched',[\s\S]*'Calculated',[\s\S]*'Tied',[\s\S]*'Drafted',[\s\S]*'Pin Set',[\s\S]*'Final Drafted',[\s\S]*'Submitted',[\s\S]*'Recorded',[\s\S]*'Billed',[\s\S]*'Paid',[\s\S]*'Archived',[\s\S]*\];/, 'launcher should define the full project status sequence in order');
  assert.match(launcherHtml, /function\s+advanceProjectStatus\(projectId\)/, 'launcher should define a status advancement helper');
  assert.match(launcherHtml, /project\.status\s*=\s*PROJECT_STATUS_SEQUENCE\[currentIndex \+ 1\];/, 'status advancement should move to the next sequential status only');
  assert.match(launcherHtml, /<small>Status: \$\{currentStatus\}<\/small>/, 'project row should show current status');
  assert.match(launcherHtml, /advanceStatus\.textContent\s*=\s*nextStatus\s*\?\s*`Advance to \$\{nextStatus\}`\s*:\s*'Status complete';/, 'status action should expose next sequential status or completion state');
  assert.match(launcherHtml, /status:\s*'Proposed',/, 'new projects should start in Proposed status');
  assert.match(launcherHtml, /const\s+knownStatus\s*=\s*PROJECT_STATUS_SEQUENCE\.includes\(project\?\.status\)\s*\?\s*project\.status\s*:\s*'Proposed';/, 'loaded projects should normalize missing/unknown statuses to Proposed');
});
