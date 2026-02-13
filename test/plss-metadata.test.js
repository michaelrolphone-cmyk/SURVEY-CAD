import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const indexHtmlPath = path.resolve('index.html');

async function loadPlssMetadataHelpers() {
  const launcherHtml = await readFile(indexHtmlPath, 'utf8');
  const start = launcherHtml.indexOf('function firstAttributeValue');
  const end = launcherHtml.indexOf('async function fetchProjectPlssMetadata');
  assert.ok(start >= 0 && end > start, 'expected PLSS metadata helper block in launcher HTML');

  const helperBlock = launcherHtml.slice(start, end);
  const context = {};
  vm.runInNewContext(
    `${helperBlock}\nthis.exports = { buildTownshipRangeMetadata };`,
    context,
  );

  return context.exports;
}

test('buildTownshipRangeMetadata ignores FRSTDIVNO TRS tokens when section attributes are absent', async () => {
  const { buildTownshipRangeMetadata } = await loadPlssMetadataHelpers();

  const result = buildTownshipRangeMetadata({
    township: {
      attributes: {
        TWNSHPNO: '3',
        TWNSHPDIR: 'N',
        RANGENO: '2',
        RANGEDIR: 'E',
      },
    },
    section: {
      attributes: {
        FRSTDIVNO: '3N2E7',
      },
    },
  });

  assert.equal(result.section, '');
  assert.equal(result.townshipRange, 'T3N R2E');
});

test('buildTownshipRangeMetadata keeps plain numeric section values', async () => {
  const { buildTownshipRangeMetadata } = await loadPlssMetadataHelpers();

  const result = buildTownshipRangeMetadata({
    township: {
      attributes: {
        TWNSHPNO: '4',
        TWNSHPDIR: 'N',
        RANGENO: '1',
        RANGEDIR: 'E',
      },
    },
    section: {
      attributes: {
        SEC: '12',
      },
    },
  });

  assert.equal(result.section, '12');
  assert.equal(result.townshipRange, 'T4N R1E Sec 12');
});
