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
  assert.match(html, /if \(activeProjectId\)\{[\s\S]*const linked = await api\.syncProjectWorkbench\(activeProjectId, \{\}\);[\s\S]*pinnedCasefileId = linked\?\.link\?\.casefileId \|\| linked\?\.casefile\?\.id \|\| "";[\s\S]*\}/);
});

test('WORKBENCH creates linked casefile for active project when missing', async () => {
  const html = await readFile(path.resolve(__dirname, '../WORKBENCH.html'), 'utf8');
  assert.match(html, /if \(activeProjectId\)\{[\s\S]*if \(!linkedExists\)\{[\s\S]*await api\.createProjectCasefile\(activeProjectId, \{\}\);[\s\S]*\}[\s\S]*\}/);
  assert.match(html, /if \(!state\.casefiles\.length\)\{[\s\S]*const cf = activeProjectId[\s\S]*await api\.createProjectCasefile\(activeProjectId, \{\}\)[\s\S]*: \(await api\.createCasefile\("New Boundary Casefile", "Idaho", "", true\)\);/);
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

test('WORKBENCH render guards against missing active casefile to avoid null meta access', async () => {
  const html = await readFile(path.resolve(__dirname, '../WORKBENCH.html'), 'utf8');
  assert.match(html, /if \(!haveActive\(\)\)\{[\s\S]*No active casefile[\s\S]*return;/);
});
