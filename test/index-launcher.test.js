import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexHtmlPath = new URL('../index.html', import.meta.url);

test('launcher cards show 2.5x icons, centered names, and descriptions via tooltip', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /\.app-icon\s*\{[\s\S]*height:\s*var\(--app-icon-height,\s*140px\);[\s\S]*max-width:\s*140px;/i);
  assert.match(launcherHtml, /\.app-card\s*\{[\s\S]*flex-direction:\s*column;[\s\S]*align-items:\s*center;/i);
  assert.match(launcherHtml, /\.app-card\s+strong\s*\{[\s\S]*text-align:\s*center;/i);
  assert.match(launcherHtml, /\.app-icon\s*\{[\s\S]*object-fit:\s*contain;[\s\S]*flex:\s*none;[\s\S]*\}/i);
  assert.doesNotMatch(launcherHtml, /\.app-icon\s*\{[^}]*border:/i, 'launcher should avoid framed icon-in-card styling');
  assert.doesNotMatch(launcherHtml, /\.app-icon\s*\{[^}]*background:/i, 'launcher icon should not add an extra boxed background');
  assert.match(launcherHtml, /card\.title\s*=\s*app\.description\s*\|\|\s*'';/, 'launcher should expose app description in native tooltip text');

  assert.match(launcherHtml, /const\s+iconHeight\s*=\s*Number\(app\.iconHeight\);/, 'launcher should normalize per-app icon height overrides');
  assert.match(launcherHtml, /style=\"--app-icon-height:\$\{iconHeight\}px\"/, 'launcher should pass icon-height override to card icon style variable');
  assert.doesNotMatch(launcherHtml, /class=\"app-description\"/, 'launcher should not render visible description text under icon');
  assert.doesNotMatch(launcherHtml, /<span>\$\{app\.entryHtml\}<\/span>/);
});

test('launcher home styling blends rustic workshop tones with futuristic glow accents', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /--ember:\s*#ffb347;/, 'launcher should define an ember accent variable for warm lamplight color language');
  assert.match(launcherHtml, /repeating-linear-gradient\(-14deg,[\s\S]*rgba\(255, 226, 187, 0\.03\)/, 'launcher body should include subtle painted texture striping');
  assert.match(launcherHtml, /radial-gradient\(circle at 84% 14%, rgba\(104, 214, 255, 0\.16\)/, 'launcher background should preserve futuristic cyan highlight accents');
  assert.match(launcherHtml, /\.app-card\s*\{[\s\S]*background:\s*linear-gradient\(160deg, rgba\(78, 51, 34, 0\.56\), rgba\(45, 31, 23, 0\.48\)\);/i, 'launcher app cards should use translucent brown glass tones');
  assert.match(launcherHtml, /\.app-card\s*\{[\s\S]*backdrop-filter:\s*blur\(10px\) saturate\(130%\);/i, 'launcher app cards should blur and enrich light behind cards for glass effect');
  assert.match(launcherHtml, /\.app-card\s*\{[\s\S]*-webkit-backdrop-filter:\s*blur\(10px\) saturate\(130%\);/i, 'launcher app cards should include WebKit glass blur fallback');
  assert.doesNotMatch(launcherHtml, /\.app-card::before\s*\{[\s\S]*repeating-linear-gradient\(-18deg,[\s\S]*rgba\(255, 230, 194, 0\.03\)/i, 'launcher app cards should not include the diagonal stripe texture overlay');
  assert.match(launcherHtml, /\.app-card:hover,[\s\S]*box-shadow:\s*0 14px 28px rgba\(16, 10, 6, 0\.62\), 0 0 0 1px rgba\(255, 214, 155, 0\.28\);/i, 'launcher hover states should add warm workshop depth with luminous edge highlights');
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




test('launcher uses a save/discard/cancel modal when leaving app with unsaved LineSmith changes', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /function\s+requestAppFrameMessage\(messageType, extraPayload = \{\}\)/, 'launcher should expose iframe request/response helper for navigation guards');
  assert.match(launcherHtml, /messageType\}:response/, 'launcher should expect typed response channels for iframe requests');
  assert.match(launcherHtml, /function\s+confirmNavigateHomeFromApp\(\)/, 'launcher should gate home navigation through unsaved-change confirmation helper');
  assert.match(launcherHtml, /survey-cad:request-unsaved-state/, 'launcher should ask active iframe app for unsaved-change state before leaving');
  assert.match(launcherHtml, /id="leaveLineSmithModalBackdrop"/, 'launcher should render a dedicated leave-LineSmith modal');
  assert.match(launcherHtml, /function\s+promptLeaveLineSmithChoice\(\)/, 'launcher should request a modal-based choice instead of prompt text entry');
  assert.match(launcherHtml, /id="leaveLineSmithSaveButton"/, 'launcher modal should expose save-and-leave action');
  assert.match(launcherHtml, /id="leaveLineSmithDiscardButton"/, 'launcher modal should expose discard action');
  assert.match(launcherHtml, /id="leaveLineSmithCancelButton"/, 'launcher modal should expose cancel action');
  assert.doesNotMatch(launcherHtml, /Type "save" to save before leaving, "discard" to leave without saving, or "cancel" to stay on this page\./, 'launcher should no longer use prompt text input for leave confirmation');
  assert.match(launcherHtml, /survey-cad:request-save-before-navigate/, 'launcher should request in-app save when save option is selected');
  assert.match(launcherHtml, /LineSmith could not save your latest changes\. You are still on the page\./, 'launcher should keep user in app when save attempt fails');
  assert.match(launcherHtml, /launcherHomeLink\.addEventListener\('click', \(event\) => \{[\s\S]*if \(!currentApp\) return;[\s\S]*showHome\(\);/, 'back-chevron click should always return to launcher home from an open app');
});

test('launcher includes SurveyFoundry branding in title and header', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /<title>SurveyFoundry Launcher<\/title>/);
  assert.match(launcherHtml, /<h1 id="launcherHeaderTitle">SurveyFoundry App Launcher<\/h1>/);
  assert.match(launcherHtml, /id="activeProjectHeader" class="header-meta" aria-live="polite"/, 'header should include active project status region');
  assert.match(launcherHtml, /<a href="\/" id="launcherHomeLink" class="launcher-home-link" aria-label="Go to SurveyFoundry launcher home page">[\s\S]*<span id="launcherBackChevron" class="launcher-back-chevron" aria-hidden="true">‹<\/span>[\s\S]*<img id="launcherHeaderIcon" src="\/assets\/icons\/SurveyFoundry\.png" alt="SurveyFoundry app icon" class="launcher-icon" \/>/);
  assert.match(launcherHtml, /<header>[\s\S]*<a href="\/" id="launcherHomeLink" class="launcher-home-link" aria-label="Go to SurveyFoundry launcher home page">[\s\S]*<\/a>[\s\S]*<h1 id="launcherHeaderTitle">SurveyFoundry App Launcher<\/h1>/, 'header should place launcher icon link before app title text on the left');
  assert.match(launcherHtml, /\.header-meta\s*\{[\s\S]*margin-left:\s*auto;[\s\S]*text-align:\s*right;[\s\S]*background:\s*linear-gradient\(135deg, #f9d18f, #e8974a\);[\s\S]*border-radius:\s*999px;/i, 'header active project should render as a standout pill');
  assert.match(launcherHtml, /<footer class="footer-logo-wrap"[\s\S]*<img src="assets\/icons\/StoneLogo\.png" alt="SurveyFoundry logo" class="footer-logo"/);
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
  assert.match(launcherHtml, /\.launcher-home-link\.app-open \.launcher-icon\s*\{[\s\S]*width:\s*42px;[\s\S]*height:\s*42px;/i, 'opened app state should shrink header icon to half size for more app real estate');
  assert.match(launcherHtml, /const\s+LAUNCHER_HOME_TITLE\s*=\s*'SurveyFoundry App Launcher';/, 'launcher should define default home title constant');
  assert.match(launcherHtml, /function\s+updateHeaderForApp\(file\)\s*\{[\s\S]*launcherHeaderIcon\.src\s*=\s*appIconPath;[\s\S]*launcherHeaderTitle\.textContent\s*=\s*appName;[\s\S]*launcherHomeLink\.classList\.add\('app-open'\);/, 'opening an app should update header title/icon and show back chevron state');
  assert.match(launcherHtml, /function\s+showHome\(\{\s*historyMode\s*=\s*'push'\s*\}\s*=\s*\{\}\)\s*\{[\s\S]*launcherHomeLink\.classList\.remove\('app-open'\);[\s\S]*launcherHeaderIcon\.src\s*=\s*LAUNCHER_HOME_ICON;[\s\S]*launcherHeaderTitle\.textContent\s*=\s*LAUNCHER_HOME_TITLE;/, 'returning home should restore SurveyFoundry title and icon');
  assert.match(launcherHtml, /launcherHomeLink\.addEventListener\('click',\s*\(event\)\s*=>\s*\{[\s\S]*event\.preventDefault\(\);[\s\S]*if \(!currentApp\) return;[\s\S]*showHome\(\);/, 'clicking header icon/chevron should return directly to home when an app is open');
});

test('launcher fetches and applies static map background for active project address', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /const\s+backgroundMapUrlCache\s*=\s*new Map\(\);/, 'launcher should cache map background URLs per address');
  assert.match(launcherHtml, /const\s+backgroundGeocodeCache\s*=\s*new Map\(\);/, 'launcher should cache geocode results per normalized address on the client');
  assert.match(launcherHtml, /const\s+backgroundGeocodeInFlight\s*=\s*new Map\(\);/, 'launcher should dedupe in-flight geocode requests for duplicate addresses');
  assert.match(launcherHtml, /function\s+setLauncherBackground\(mapUrl = ''\)/, 'launcher should support dynamic background switching');
  assert.match(launcherHtml, /function\s+buildStaticMapUrl\(lat, lon, address = ''\)/, 'launcher should derive static map URL from geocoded coordinates');
  assert.match(launcherHtml, /new URL\('\/api\/static-map',\s*window\.location\.origin\)/, 'launcher should build static map URLs through the local static map proxy endpoint');
  assert.match(launcherHtml, /async\s+function\s+getCachedGeocodeForAddress\(address = ''\)/, 'launcher should centralize geocode lookup through a client cache helper');
  assert.match(launcherHtml, /if \(backgroundGeocodeInFlight\.has\(cacheKey\)\) \{[\s\S]*return backgroundGeocodeInFlight\.get\(cacheKey\);[\s\S]*\}/, 'launcher should reuse an in-flight geocode request instead of issuing duplicate fetches');
  assert.match(launcherHtml, /backgroundGeocodeCache\.set\(cacheKey, normalizedGeocode\);/, 'launcher should persist successful geocodes for future reuse');
  assert.match(launcherHtml, /const\s+geocode\s*=\s*await\s+getCachedGeocodeForAddress\(address\);/, 'launcher should use client-side cached geocodes when rendering map backgrounds');
  assert.match(launcherHtml, /if \(!Number\.isFinite\(geocode\?\.lat\) \|\| !Number\.isFinite\(geocode\?\.lon\)\)/, 'launcher should validate geocode coordinates before using them');
  assert.match(launcherHtml, /syncActiveProjectBackground\(\);/, 'renderProjects should refresh the launcher background for active project changes');
});

test('launcher mobile viewer uses full-width iframe layout', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /@media \(max-width: 760px\)\s*\{[\s\S]*\.viewer\s*\{[\s\S]*padding:\s*0;/i);
  assert.doesNotMatch(launcherHtml, /@media \(max-width: 760px\)\s*\{[\s\S]*\.toolbar\s*\{/, 'mobile styles should not include removed toolbar block');
  assert.match(launcherHtml, /#viewerView\s*\{[\s\S]*padding:\s*0;/i, 'desktop viewer container should remove padding around embedded app');
  assert.match(launcherHtml, /iframe\s*\{[\s\S]*border:\s*0;[\s\S]*border-radius:\s*0;/i, 'iframe should render without border or corner radius');
  assert.match(launcherHtml, /@media \(max-width: 760px\)\s*\{[\s\S]*iframe\s*\{[\s\S]*border:\s*0;[\s\S]*border-radius:\s*0;/i);
});




test('launcher tracks active project and app launches include active project query params', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /const\s+ACTIVE_PROJECT_STORAGE_KEY_PREFIX\s*=\s*'surveyfoundryActiveProjectId'/, 'launcher should define the active project localStorage key prefix');
  assert.match(launcherHtml, /function\s+getActiveProjectStorageKey\(\)\s*\{[\s\S]*getActiveCrewMemberId\(\)[\s\S]*return `\$\{ACTIVE_PROJECT_STORAGE_KEY_PREFIX\}:\$\{activeCrewMemberId\}`;/, 'launcher should scope active project storage by active crew member id');
  assert.match(launcherHtml, /function\s+setActiveProject\(projectId\)/, 'launcher should define active-project setter');
  assert.match(launcherHtml, /function\s+withActiveProject\(file\)/, 'launcher should define active-project URL mapper');
  assert.match(launcherHtml, /url\.searchParams\.set\('activeProjectId',\s*String\(project\.id\)\)/, 'launcher should append activeProjectId to launched apps');
  assert.match(launcherHtml, /url\.searchParams\.set\('activeProjectName',\s*String\(project\.name\s*\|\|\s*''\)\)/, 'launcher should append activeProjectName to launched apps');
  assert.match(launcherHtml, /setActiveProject\(project\.id\);[\s\S]*const params = new URLSearchParams\(/, 'starting a project in RecordQuarry should mark project active');
  assert.match(launcherHtml, /makeActive\.textContent\s*=\s*project\.id === activeProjectId \? 'Active project' : 'Set active project'/, 'project list should expose explicit set-active action');
  assert.match(launcherHtml, /const resolvedFile = withActiveProject\(file\);/, 'openApp should resolve app URL with active project metadata');
});

test('launcher switches active project context when crew identity changes', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /function\s+setActiveCrewMemberId\(id\)\s*\{[\s\S]*loadActiveProject\(\);[\s\S]*renderProjects\(\);/, 'changing crew identity should reload crew-scoped active project and refresh UI');
});
test('launcher includes SurveyFoundry project manager and RecordQuarry start workflow', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /aria-label="RecordQuarry project manager"/, 'launcher should render project manager panel');
  assert.match(launcherHtml, /id="openProjectFormButton"[^>]*>Create project<\/button>/, 'launcher should expose a create-project button that opens the shared form modal');
  assert.match(launcherHtml, /id="projectFormModalBackdrop" class="project-modal-backdrop hidden"/, 'launcher should render a dedicated project form modal backdrop');
  assert.match(launcherHtml, /id="projectName"/, 'launcher should include project name input');
  assert.match(launcherHtml, /id="projectClient"/, 'launcher should include project client input');
  assert.match(launcherHtml, /id="projectClientContact"/, 'launcher should include project client contact input');
  assert.match(launcherHtml, /id="projectBillingRate"/, 'launcher should include project billing rate input');
  assert.match(launcherHtml, /id="projectAddress"/, 'launcher should include project address input');
  assert.match(launcherHtml, /id="projectTsr"/, 'launcher should include project TSR input');
  assert.match(launcherHtml, /id="projectSection"/, 'launcher should include project section input');
  assert.match(launcherHtml, /id="projectDescription"/, 'launcher should include project description input');
  assert.match(launcherHtml, /const\s+PROJECT_STORAGE_KEY\s*=\s*'surveyfoundryProjects'/, 'launcher should persist project metadata in localStorage');
  assert.match(launcherHtml, /function\s+openProject\(project\)/, 'launcher should define project start helper');
  assert.match(launcherHtml, /openApp\(`RecordQuarry\.html\?\$\{params\.toString\(\)\}`\)/, 'project start should open RecordQuarry with encoded project query params');
  assert.match(launcherHtml, /autostart:\s*'1'/, 'project start should request RecordQuarry autostart lookup');
  assert.match(launcherHtml, /start\.textContent\s*=\s*'Start in RecordQuarry'/, 'project list rows should offer RecordQuarry start action');
});



test('launcher project manager supports shared modal editing and delete actions', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /function\s+openProjectForm\(projectId = null\)/, 'launcher should use a single modal form helper for create/edit workflows');
  assert.match(launcherHtml, /saveProjectFormButton\.textContent\s*=\s*project\s*\?\s*'Save project changes'\s*:\s*'Create and activate project';/, 'project form should switch submit button text between edit and create modes');
  assert.match(launcherHtml, /projectNameInput\.value\s*=\s*project\?\.name\s*\|\|\s*'';/, 'edit mode should prefill project form values from selected project');
  assert.match(launcherHtml, /projectTsrInput\.value\s*=\s*project\?\.tsr\s*\|\|\s*project\?\.townshipRange\s*\|\|\s*'';/, 'edit mode should prefill TSR override field');
  assert.match(launcherHtml, /projectSectionInput\.value\s*=\s*project\?\.section\s*\|\|\s*project\?\.sections\?\.\[0\]\s*\|\|\s*'';/, 'edit mode should prefill section override field');
  assert.match(launcherHtml, /setProjectFormError\('Please provide both a project name and project address before saving\.'\);/, 'shared form should render inline validation when required fields are missing');
  assert.doesNotMatch(launcherHtml, /window\.prompt\(/, 'project create/edit flow should no longer rely on browser prompts');
  assert.match(launcherHtml, /function\s+deleteProject\(projectId\)/, 'launcher should define a delete project helper');
  assert.match(launcherHtml, /function\s+deleteProject\(projectId\)[\s\S]*window\.confirm\(/, 'delete flow should require confirmation');
  assert.match(launcherHtml, /function\s+deleteProject\(projectId\)[\s\S]*localStorage\.removeItem\(getActiveProjectStorageKey\(\)\);/, 'delete flow should clear crew-scoped active project key');
  assert.match(launcherHtml, /remove\.textContent\s*=\s*'Delete'/, 'project rows should include delete action');
  assert.match(launcherHtml, /edit\.textContent\s*=\s*'Edit project'/, 'project rows should include edit action that opens the shared modal form');
});

test('launcher project manager is opened from a button and closes after activation/create', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /id="openProjectManagerButton"[^>]*>Choose project<\/button>/, 'launcher home should expose a project picker button');
  assert.match(launcherHtml, /id="projectModalBackdrop" class="project-modal-backdrop hidden"/, 'project manager should render as hidden modal backdrop initially');
  assert.match(launcherHtml, /function\s+openProjectManager\(\)\s*\{[\s\S]*projectModalBackdrop\.classList\.remove\('hidden'\);/, 'project picker button should open the manager modal');
  assert.match(launcherHtml, /function\s+closeProjectManager\(\)\s*\{[\s\S]*projectModalBackdrop\.classList\.add\('hidden'\);/, 'project manager should provide a close helper');
  assert.match(launcherHtml, /makeActive\.addEventListener\('click',\s*\(\)\s*=>\s*\{[\s\S]*setActiveProject\(project\.id\);[\s\S]*closeProjectManager\(\);/, 'activating an existing project should return focus to launcher home by closing modal');
  assert.match(launcherHtml, /openProjectFormButton\.addEventListener\('click',\s*\(\)\s*=>\s*openProjectForm\(\)\);/, 'create action should open the shared project form modal');
  assert.match(launcherHtml, /projectForm\.addEventListener\('submit',\s*saveProjectFromForm\);/, 'project form submit should be wired to the shared save handler');
  assert.match(launcherHtml, /const\s+clientContact\s*=\s*projectClientContactInput\.value\.trim\(\);/, 'create flow should read client contact metadata');
  assert.match(launcherHtml, /const\s+billingRate\s*=\s*projectBillingRateInput\.value\.trim\(\);/, 'create flow should read billing rate metadata');
  assert.match(launcherHtml, /const\s+tsr\s*=\s*projectTsrInput\.value\.trim\(\);/, 'create flow should read TSR metadata from the shared form');
  assert.match(launcherHtml, /const\s+section\s*=\s*projectSectionInput\.value\.trim\(\);/, 'create flow should read section metadata from the shared form');
  assert.match(launcherHtml, /const\s+description\s*=\s*projectDescriptionInput\.value\.trim\(\);/, 'create flow should read project description metadata');
  assert.match(launcherHtml, /tsr,\s*[\s\S]*section,\s*[\s\S]*sections:\s*section\s*\?\s*\[section\]\s*:\s*\[\],/, 'create flow should persist TSR and section metadata on saved project');
  assert.match(launcherHtml, /clientContact,\s*[\s\S]*billingRate,\s*[\s\S]*description,/, 'create flow should persist new metadata fields on saved project');
  assert.match(launcherHtml, /setActiveProject\(project\.id\);[\s\S]*saveProjects\(\);[\s\S]*renderProjects\(\);[\s\S]*closeProjectForm\(\);[\s\S]*closeProjectManager\(\);/, 'saving from create mode should auto-activate and close both form and manager modals');
  assert.match(launcherHtml, /activeProjectSummary\.textContent\s*=\s*activeProject[\s\S]*'No active project selected\.'/, 'launcher home should show active project summary text');
  assert.match(launcherHtml, /id="activeProjectOverview" class="active-project-overview"/, 'launcher should render an active project overview panel on home view');
  assert.match(launcherHtml, /class="project-manager-launch"[\s\S]*id="activeProjectOverview" class="active-project-overview"/, 'overview should be rendered inside the project-manager-launch section on the main screen');
  assert.match(launcherHtml, /id="activeProjectNameOverview"/, 'overview should render project field');
  assert.match(launcherHtml, /id="activeProjectClientOverview"/, 'overview should render client field');
  assert.match(launcherHtml, /id="activeProjectContactOverview"/, 'overview should render contact field');
  assert.match(launcherHtml, /id="activeProjectAddressOverview"/, 'overview should render address field');
  assert.match(launcherHtml, /id="activeProjectPlssOverview"/, 'overview should render PLSS field');
  assert.match(launcherHtml, /id="activeProjectIndexOverview"/, 'overview should render index in the right-hand header area');
  assert.match(launcherHtml, /function\s+buildNativeMapsHref\(address = ''\)/, 'overview should provide native maps link generation for addresses');
  assert.match(launcherHtml, /return `geo:0,0\?q=\$\{encodeURIComponent\(trimmedAddress\)\}`;/, 'overview address links should use native geo URI deep links');
  assert.match(launcherHtml, /function\s+extractPhoneNumber\(value = ''\)/, 'overview should parse phone numbers from contact metadata');
  assert.match(launcherHtml, /function\s+extractEmailAddress\(value = ''\)/, 'overview should parse email addresses from contact metadata');
  assert.match(launcherHtml, /phoneLink\.href\s*=\s*normalizePhoneHref\(phoneNumber\);/, 'overview should make phone numbers tappable with tel links');
  assert.match(launcherHtml, /phoneLink\.textContent\s*=\s*phoneNumber;/, 'overview should render the phone number itself as the tappable text');
  assert.match(launcherHtml, /emailLink\.href\s*=\s*`mailto:\$\{emailAddress\}`;/, 'overview should make email addresses tappable with mailto links');
  assert.match(launcherHtml, /setProjectOverviewLink\(activeProjectAddressOverview, activeProject\?\.address \|\| '', buildNativeMapsHref\(activeProject\?\.address \|\| ''\), '—'\);/, 'overview should make addresses tappable with native maps links');
  assert.doesNotMatch(launcherHtml, /phoneLink\.textContent\s*=\s*'Call';/, 'overview should not require separate call label; the number itself should be tappable');
  assert.doesNotMatch(launcherHtml, /emailLink\.textContent\s*=\s*'Email';/, 'overview should not require separate email label; the address itself should be tappable');
  assert.match(launcherHtml, /renderActiveProjectOverview\(activeProject\);/, 'project rendering should refresh the active project overview panel');
  assert.match(launcherHtml, /activeProjectHeader\.textContent\s*=\s*activeProject[\s\S]*Index \$\{activeProjectIndex\}/, 'launcher header should include survey index text when available and clear when no active project');
});


test('launcher enriches saved projects with township/range aliquots and survey index from address lookup', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /async\s+function\s+saveProjectFromForm\(event\)/, 'project save flow should be async so metadata backfills can be scheduled without blocking persistence');
  assert.match(launcherHtml, /if \(isSavingProjectForm\) return;/, 'project save flow should ignore duplicate submits while a save is already in flight');
  assert.match(launcherHtml, /const\s+projectIdBeingEdited\s*=\s*editingProjectId;/, 'project save flow should capture edit target before async enrichment starts');
  assert.match(launcherHtml, /if \(projectIdBeingEdited\) \{[\s\S]*projects\.find\(\(entry\) => entry\.id === projectIdBeingEdited\)/, 'edit saves should resolve the original project id captured at submit time to avoid create-mode fallthrough');
  assert.match(launcherHtml, /saveProjectFormButton\.disabled\s*=\s*true;[\s\S]*finally\s*\{[\s\S]*saveProjectFormButton\.disabled\s*=\s*false;/, 'project form submit button should be disabled during async save and restored afterwards');
  assert.match(launcherHtml, /function\s+normalizeTrsComponent\(value = '', padLength = 2, maxLength = 0\)/, 'launcher should include TRS normalization helper for index generation');
  assert.match(launcherHtml, /function\s+buildSurveyIndexNumber\(project\)/, 'launcher should build SurveyFoundry index numbers from normalized PLSS metadata');
  assert.match(launcherHtml, /normalizeTrsComponent\(project\.townships\?\.\[0\], 0, 1\)/, 'launcher should constrain township index component to one digit');
  assert.match(launcherHtml, /normalizeTrsComponent\(project\.ranges\?\.\[0\], 0, 1\)/, 'launcher should constrain range index component to one digit');
  assert.match(launcherHtml, /async\s+function\s+fetchProjectPlssMetadata\(address = ''\)/, 'launcher should fetch PLSS metadata for the entered address');
  assert.match(launcherHtml, /fetch\(`\/api\/lookup\?address=\$\{encodeURIComponent\(trimmedAddress\)\}`\)/, 'PLSS enrichment should resolve lookup coordinates via the address API');
  assert.match(launcherHtml, /fetch\(`\/api\/aliquots\?lon=\$\{encodeURIComponent\(lon\)\}&lat=\$\{encodeURIComponent\(lat\)\}`\)/, 'PLSS enrichment should load aliquots for resolved coordinates');
  assert.match(launcherHtml, /const\s+addressChanged\s*=\s*String\(project\.address \|\| ''\)\.trim\(\) !== address;/, 'editing a project should detect address changes so stale metadata can be cleared');
  assert.match(launcherHtml, /const\s+plssEdited\s*=\s*tsr !== previousTsr \|\| section !== previousSection;/, 'editing should detect manual TSR/section corrections');
  assert.match(launcherHtml, /if \(plssEdited\) \{[\s\S]*project\.manualPlssOverride\s*=\s*true;/, 'editing TSR/section should enable manual override mode to preserve operator corrections');
  assert.match(launcherHtml, /if \(addressChanged && !project\.manualPlssOverride\) \{[\s\S]*project\.surveyIndex\s*=\s*'';/, 'editing with a new address should only clear auto metadata when manual override is not enabled');
  assert.match(launcherHtml, /surveyIndex:\s*''/, 'creating a project should initialize survey index metadata as empty until backfill resolves');
  assert.match(launcherHtml, /if \(shouldBackfillMetadata && savedProjectId\) \{[\s\S]*syncProjectPlssMetadata\(savedProjectId\);/, 'project saves should trigger non-blocking background metadata enrichment');
  assert.match(launcherHtml, /<small>PLSS: \$\{plssText\}<\/small><br\/><small>Index: \$\{surveyIndexText\}<\/small>/, 'project overview rows should display PLSS summary and survey index');
  assert.match(launcherHtml, /function\s+projectNeedsPlssMetadata\(project\)/, 'launcher should detect when the active project is missing PLSS or index metadata');
  assert.match(launcherHtml, /return\s*!plssDescription\s*\|\|\s*!surveyIndex;/, 'metadata detection should trigger when either PLSS description or survey index is missing');
  assert.match(launcherHtml, /async\s+function\s+syncProjectPlssMetadata\(projectId\)/, 'launcher should define a background metadata sync helper for active projects');
  assert.match(launcherHtml, /syncProjectPlssMetadata\(activeProjectId\);/, 'launcher should backfill missing metadata for the active project on initial load');
  assert.match(launcherHtml, /function\s+setActiveProject\(projectId\)[\s\S]*syncProjectPlssMetadata\(activeProjectId\);/, 'switching active projects should trigger PLSS/index backfill when metadata is missing');
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

test('launcher delegates localStorage synchronization to websocket wrapper', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /<script type="module" src="\/src\/browser-localstorage-sync\.js"><\/script>/, 'launcher should include the shared localStorage websocket sync wrapper');
  assert.doesNotMatch(launcherHtml, /LOCAL_STORAGE_SYNC_INTERVAL_MS/, 'launcher should no longer maintain polling interval constants');
  assert.doesNotMatch(launcherHtml, /runLocalStorageSyncCycle\(/, 'launcher should no longer invoke the old polling sync cycle');
  assert.match(launcherHtml, /window\.addEventListener\('storage',\s*syncLauncherStateFromStorageEvent\);/, 'launcher should reactively re-render project lists when storage changes are applied');
});

test('launcher back-button navigation is wired through browser history state', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /const\s+LAUNCHER_HISTORY_STATE_KEY\s*=\s*'survey-cad-launcher-view';/, 'launcher should declare a history state key for view transitions');
  assert.match(launcherHtml, /function\s+writeHistoryState\(nextState, mode = 'push'\)/, 'launcher should centralize push/replace history behavior');
  assert.match(launcherHtml, /window\.addEventListener\('popstate',\s*\(event\)\s*=>\s*\{/, 'launcher should react to browser back/forward events');
  assert.doesNotMatch(launcherHtml, /window\.addEventListener\('popstate',\s*async/, 'popstate handling should no longer be async for guard prompts');
  assert.doesNotMatch(launcherHtml, /if \(!canNavigateHome\)/, 'popstate handling should not block returning home behind unsaved guards');
  assert.match(launcherHtml, /if \(!window\.history\.state\?\.\[LAUNCHER_HISTORY_STATE_KEY\]\) \{[\s\S]*writeHistoryState\(buildHomeHistoryState\(\), 'replace'\);/, 'launcher should seed initial home history state for first back transition');
});

test('launcher requires a valid crew identity before opening non-CrewManager apps', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /function\s+hasValidActiveCrewIdentity\(\)\s*\{[\s\S]*getActiveCrewMemberId\(\)[\s\S]*getCrewProfiles\(\)\.some\(\(profile\)\s*=>\s*profile\.id\s*===\s*activeId\);/, 'launcher should validate that the selected crew id still exists in crew profiles');
  assert.match(launcherHtml, /function\s+requiresCrewIdentity\(file\)\s*\{[\s\S]*getEntryFile\(file\)\s*!==\s*'CrewManager\.html';[\s\S]*\}/, 'launcher should exempt CrewManager so identities can still be managed');
  assert.match(launcherHtml, /function\s+ensureCrewIdentityForApp\(file\)\s*\{[\s\S]*setActiveCrewMemberId\(null\);[\s\S]*openCrewSelectModal\(\);[\s\S]*crewPickerDetail\.textContent\s*=\s*'Choose your crew identity to open apps\.';[\s\S]*return false;/, 'launcher should block app opening and force the crew picker modal when identity is missing');
  assert.match(launcherHtml, /function\s+openApp\(file,\s*\{\s*historyMode\s*=\s*'push'\s*\}\s*=\s*\{\}\)\s*\{[\s\S]*if\s*\(!ensureCrewIdentityForApp\(file\)\)\s*return;/, 'openApp should enforce crew identity gate before showing apps');
});


test('launcher archives project payload on the server before deleting local project metadata', async () => {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');

  assert.match(launcherHtml, /fetch\(`\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/archive`/, 'project delete should POST project archives to server first');
  assert.match(launcherHtml, /window\.alert\(`Could not archive project/, 'launcher should halt deletion and alert if archive upload fails');
  assert.match(launcherHtml, /const\s+PROJECT_DELETE_TOMBSTONE_STORAGE_KEY\s*=\s*'surveyfoundryDeletedProjects';/, 'launcher should define a tombstone key for deleted project ids');
  assert.match(launcherHtml, /function\s+markProjectDeleted\(projectId\)/, 'launcher should define helper to mark deleted project ids in tombstone storage');
  assert.match(launcherHtml, /markProjectDeleted\(projectId\);/, 'delete flow should tombstone deleted project ids to prevent stale sync reappearance');
  assert.match(launcherHtml, /const\s+tombstones\s*=\s*loadDeletedProjectTombstones\(\);[\s\S]*parsed\.filter\(\(project\)\s*=>\s*!tombstones\[String\(project\?\.id\s*\|\|\s*''\)\]\)/, 'loading projects should ignore tombstoned ids received from localStorage sync');
  assert.match(launcherHtml, /localStorage\.removeItem\(getActiveProjectStorageKey\(\)\);/, 'launcher should clear active-project storage via crew-scoped key helper after delete');
});
