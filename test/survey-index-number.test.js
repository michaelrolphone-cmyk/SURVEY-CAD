import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const indexHtmlPath = path.resolve('index.html');

async function loadSurveyIndexHelpers() {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');
  const start = launcherHtml.indexOf("function normalizeTrsComponent");
  const end = launcherHtml.indexOf("function extractAliquotSequence");
  assert.ok(start >= 0 && end > start, 'expected survey index helper block in launcher HTML');
  const helperBlock = launcherHtml.slice(start, end);

  const context = {};
  vm.runInNewContext(
    `${helperBlock}\nthis.exports = { normalizeTrsComponent, buildSurveyIndexNumber };`,
    context,
  );
  return context.exports;
}

test('buildSurveyIndexNumber keeps first segment at 3 digits when township/range contain leading zeros', async () => {
  const { buildSurveyIndexNumber } = await loadSurveyIndexHelpers();

  const index = buildSurveyIndexNumber({
    townships: ['04'],
    ranges: ['03'],
    sections: ['1'],
    sectionQuadrant: 'NW',
    aliquots: ['NE', 'SW'],
    platBook: '7',
    platPageStart: '10',
  });

  assert.equal(index, '434-01-130-7-10');
  assert.equal(index.split('-')[0].length, 3);
});

test('normalizeTrsComponent can constrain normalized TRS pieces to one digit for index prefix', async () => {
  const { normalizeTrsComponent } = await loadSurveyIndexHelpers();

  assert.equal(normalizeTrsComponent('09', 0, 1), '9');
  assert.equal(normalizeTrsComponent('003', 0, 1), '3');
});
