import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_CATALOG, listApps } from '../src/app-catalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('app catalog exposes one icon entry for each app', () => {
  assert.equal(APP_CATALOG.length, 9);

  const ids = new Set(APP_CATALOG.map((app) => app.id));
  assert.equal(ids.size, APP_CATALOG.length);

  for (const app of APP_CATALOG) {
    assert.ok(app.name.length > 4);
    assert.ok(app.description.length > 20);
    assert.match(app.iconPath, /^\/assets\/icons\/.+\.(svg|png)$/i);
    assert.ok(app.entryHtml.toLowerCase().endsWith('.html'));
  }
});

test('public app listing omits rendering-only fields', () => {
  const apps = listApps();
  assert.equal(apps.length, APP_CATALOG.length);

  for (const app of apps) {
    assert.equal(Object.hasOwn(app, 'color'), false);
    assert.equal(Object.hasOwn(app, 'accent'), false);
    assert.equal(Object.hasOwn(app, 'glyph'), false);
    assert.ok(app.description);
  }
});


test('app catalog publishes updated core app descriptions', () => {
  const byName = new Map(APP_CATALOG.map((app) => [app.name, app.description]));
  assert.equal(byName.get('SurveyFoundry'), 'Projects, evidence, and outputs—end to end.');
  assert.equal(byName.get('RecordQuarry'), 'Harvests plats, ROS, CP&F, parcels, and subdivisions into structured evidence.');
  assert.equal(byName.get('PointForge'), 'Builds the canonical point set (coords + provenance + weights).');
  assert.equal(byName.get('LineSmith'), 'Turns points into boundaries, alignments, and structure.');
  assert.equal(byName.get('ArrowHead'), 'Mobile AR viewer that overlays LineSmith points and linework on the live camera feed.');
  assert.equal(byName.get('EvidenceDesk'), 'Browse the symbolic project-file folder structure as a standalone app.');
  assert.equal(byName.get('UtilitiesPack'), 'Fetches utility records, keeps state-plane coordinates, and exports power utility CSV bundles.');
});


test('experimental apps are flagged and sorted after stable apps', () => {
  const experimentalApps = APP_CATALOG.filter((app) => app.experimental);
  assert.deepEqual(experimentalApps.map((app) => app.id), ['cpnf-corners', 'ros-ocr']);

  const firstExperimentalIndex = APP_CATALOG.findIndex((app) => app.experimental);
  assert.ok(firstExperimentalIndex > 0);
  assert.equal(APP_CATALOG.slice(firstExperimentalIndex).every((app) => app.experimental), true);
});

test('generated icon files exist for every app', async () => {
  for (const app of APP_CATALOG) {
    const iconFsPath = path.join(rootDir, app.iconPath.replace(/^\//, ''));
    await access(iconFsPath);
  }
});


test('utilities pack uses CSV download icon override and height metadata', () => {
  const utilitiesPack = APP_CATALOG.find((app) => app.id === 'utilities-pack');
  assert.ok(utilitiesPack);
  assert.equal(utilitiesPack.iconPath, '/assets/icons/download/Download-CSV.png');
  assert.equal(utilitiesPack.iconHeight, 125);

  const publicUtilitiesPack = listApps().find((app) => app.id === 'utilities-pack');
  assert.ok(publicUtilitiesPack);
  assert.equal(publicUtilitiesPack.iconHeight, 125);
});
