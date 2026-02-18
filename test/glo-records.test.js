import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGloSearchUrl, extractTrsMetadataFromLookup, parseGloDocumentListHtml } from '../src/glo-records.js';

test('extractTrsMetadataFromLookup derives township/range/section labels', () => {
  const result = extractTrsMetadataFromLookup({
    township: { attributes: { TWNSHPNO: '3', TWNSHPDIR: 'N', RANGENO: '2', RANGEDIR: 'E' } },
    section: { attributes: { SEC: '12' } },
  });

  assert.equal(result.township, '3');
  assert.equal(result.range, '2');
  assert.equal(result.section, '12');
  assert.equal(result.townshipRange, 'T3N R2E Sec 12');
});

test('buildGloSearchUrl appends PLSS query values', () => {
  const url = buildGloSearchUrl('https://glorecords.blm.gov/search/default.aspx', {
    township: '5',
    townshipDir: 'S',
    range: '1',
    rangeDir: 'W',
    section: '7',
  });

  assert.match(url, /township=5/);
  assert.match(url, /townshipDir=S/);
  assert.match(url, /range=1/);
  assert.match(url, /rangeDir=W/);
  assert.match(url, /section=7/);
  assert.match(url, /#searchTabIndex=0&searchByTypeIndex=1$/);
});

test('parseGloDocumentListHtml extracts unique document links from tabular rows', () => {
  const html = `
    <table>
      <tr><th>Document</th></tr>
      <tr><td><a href="/details/patent/default.aspx?id=123">Patent 123</a></td><td>Land patent record</td></tr>
      <tr><td><a href="/details/patent/default.aspx?id=123">Patent 123</a></td><td>Land patent record duplicate</td></tr>
      <tr><td><a href="https://example.com/not-glo">Ignore me</a></td><td>Random row</td></tr>
    </table>
  `;

  const docs = parseGloDocumentListHtml(html, 'https://glorecords.blm.gov/search/default.aspx');
  assert.equal(docs.length, 1);
  assert.equal(docs[0].title, 'Patent 123');
  assert.equal(docs[0].url, 'https://glorecords.blm.gov/details/patent/default.aspx?id=123');
  assert.match(docs[0].details, /Land patent record/i);
});
