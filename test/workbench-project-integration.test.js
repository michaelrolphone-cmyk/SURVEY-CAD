import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('WORKBENCH bootstraps active project casefile linkage via API', async () => {
  const html = await readFile(path.resolve(__dirname, '../WORKBENCH.html'), 'utf8');
  assert.match(html, /const activeProjectId = pageParams\.get\("activeProjectId"\) \|\| pageParams\.get\("projectId"\) \|\| "";/);
  assert.match(html, /syncProjectWorkbench: \(projectId, body=\{\}\) => apiRequest\("POST",`\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/workbench\/sync`/);
  assert.match(html, /listProjectTraverses: \(projectId\) => apiRequest\("GET",`\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/workbench\/traverses`/);
  assert.match(html, /getProjectTraverse: \(projectId, traverseId\) => apiRequest\("GET",`\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/workbench\/traverses\/\$\{encodeURIComponent\(traverseId\)\}`/);
  assert.match(html, /function resolveCasefileId\(payload\)\{[\s\S]*payload\?\.id \|\| payload\?\.casefile\?\.id \|\| payload\?\.link\?\.casefileId \|\| "";[\s\S]*\}/);
  assert.match(html, /async function ensureActiveCasefile\(candidateIds = \[]\)\{[\s\S]*await setActiveCasefile\(id\);[\s\S]*return true;[\s\S]*\}/);
  assert.match(html, /async function createAndActivateFallbackCasefile\(\)\{[\s\S]*if \(activeProjectId\)\{[\s\S]*cf = await api\.createProjectCasefile\(activeProjectId, \{\}\);[\s\S]*const synced = await api\.syncProjectWorkbench\(activeProjectId, \{ forceNewCasefile: true \}\);[\s\S]*if \(!activated\)\{[\s\S]*Unable to create or activate a project-linked casefile\.[\s\S]*\}[\s\S]*\}[\s\S]*cf = await api\.createCasefile\("New Boundary Casefile", "Idaho", "", true\);[\s\S]*\}/);
  assert.match(html, /if \(activeProjectId\)\{[\s\S]*try\{[\s\S]*const linked = await api\.syncProjectWorkbench\(activeProjectId, \{\}\);[\s\S]*pinnedCasefileId = resolveCasefileId\(linked\);[\s\S]*\}catch\(err\)\{[\s\S]*project sync bootstrap failed[\s\S]*\}[\s\S]*\}/);
});

test('WORKBENCH creates linked casefile for active project when missing', async () => {
  const html = await readFile(path.resolve(__dirname, '../WORKBENCH.html'), 'utf8');
  assert.match(html, /if \(activeProjectId\)\{[\s\S]*if \(!linkedExists\)\{[\s\S]*try\{[\s\S]*const created = await api\.createProjectCasefile\(activeProjectId, \{\}\);[\s\S]*pinnedCasefileId = resolveCasefileId\(created\) \|\| pinnedCasefileId;[\s\S]*\}catch\(err\)\{[\s\S]*project-linked casefile bootstrap failed[\s\S]*\}[\s\S]*\}[\s\S]*\}/);
  assert.match(html, /if \(!state\.casefiles\.length\)\{[\s\S]*await createAndActivateFallbackCasefile\(\);[\s\S]*\}/);
});

test('WORKBENCH fallback helper activates created casefile ids', async () => {
  const html = await readFile(path.resolve(__dirname, '../WORKBENCH.html'), 'utf8');
  assert.match(html, /const createdId = resolveCasefileId\(cf\);/);
  assert.match(html, /const activated = await ensureActiveCasefile\(\[createdId, pinnedCasefileId, state\.casefiles\?\.\[0\]\?\.id \|\| ""\]\);/);
});



test('WORKBENCH creates fallback casefile when activation fails', async () => {
  const html = await readFile(path.resolve(__dirname, '../WORKBENCH.html'), 'utf8');
  assert.match(html, /const activated = await ensureActiveCasefile\(\[pick, pickDefault, state\.casefiles\[0\]\?\.id \|\| ""\]\);/);
  assert.match(html, /if \(!activated\)\{[\s\S]*await createAndActivateFallbackCasefile\(\);[\s\S]*\}/);
});


test('WORKBENCH no longer exposes API base or project picker controls', async () => {
  const html = await readFile(path.resolve(__dirname, '../WORKBENCH.html'), 'utf8');
  assert.doesNotMatch(html, /id="apiBaseInput"/);
  assert.doesNotMatch(html, /id="projectSelect"/);
  assert.doesNotMatch(html, /concept prototype — api-driven/);
  assert.doesNotMatch(html, /elImportBtn\.textContent = "Open Project"/);
  assert.match(html, /elImportBtn\.style\.display = "none";/);
});

test('WORKBENCH boot handles initData API failures without uncaught promise rejection', async () => {
  const html = await readFile(path.resolve(__dirname, '../WORKBENCH.html'), 'utf8');
  assert.match(html, /async function boot\(\)\{[\s\S]*try\{[\s\S]*await initData\(\);[\s\S]*\}catch\(err\)\{[\s\S]*setApiHealthState\("ERR"\);[\s\S]*toast\("Error", err\?\.message \|\| String\(err\), "bad"\);[\s\S]*render\(\);[\s\S]*\}/);
});

test('WORKBENCH initData degrades gracefully when casefile listing API is unavailable', async () => {
  const html = await readFile(path.resolve(__dirname, '../WORKBENCH.html'), 'utf8');
  assert.match(html, /let casefilesLoaded = false;[\s\S]*try\{[\s\S]*await refreshCasefiles\(\);[\s\S]*casefilesLoaded = true;[\s\S]*\}catch\(err\)\{[\s\S]*Casefiles API is temporarily unavailable[\s\S]*\}/);
  assert.match(html, /if \(!casefilesLoaded\)\{[\s\S]*await createAndActivateFallbackCasefile\(\);[\s\S]*ensureTabData\(state\.tab\);[\s\S]*render\(\);[\s\S]*return;[\s\S]*\}/);
});

test('WORKBENCH render guards against missing active casefile to avoid null meta access', async () => {
  const html = await readFile(path.resolve(__dirname, '../WORKBENCH.html'), 'utf8');
  assert.match(html, /if \(!haveActive\(\)\)\{[\s\S]*No active casefile[\s\S]*return;/);
});


test('WORKBENCH project traverse tab exposes selectable traverse list and loader actions', async () => {
  const html = await readFile(path.resolve(__dirname, '../WORKBENCH.html'), 'utf8');
  assert.match(html, /function refreshProjectTraverses\(\)\{[\s\S]*state\.projectTraverses = Array\.isArray\(payload\?\.traverses\) \? payload\.traverses : \[\];[\s\S]*\}/);
  assert.match(html, /<select id="projectTraverseSelect"[\s\S]*data-act="refreshProjectTraverses"[\s\S]*data-act="loadProjectTraverse"/);
  assert.match(html, /async function loadSelectedProjectTraverse\(\)\{[\s\S]*await api\.getProjectTraverse\(activeProjectId, selected\);[\s\S]*await setActiveCasefile\(casefileId\);[\s\S]*toast\("Loaded", `Traverse \"\$\{payload\?\.name \|\| selected\}\" loaded\.`, "good"\);[\s\S]*\}/);
  assert.match(html, /if \(act === "refreshProjectTraverses"\)\{[\s\S]*refreshProjectTraverses\(\)\.then\(\(\)=>render\(\)\)/);
  assert.match(html, /if \(act === "loadProjectTraverse"\)\{ loadSelectedProjectTraverse\(\); return; \}/);
});
