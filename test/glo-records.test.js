import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGloResultsUrl,
  buildGloSearchUrl,
  extractGloSearchCriteriaFromLookup,
  extractTrsMetadataFromLookup,
  parseGloDocumentListHtml,
} from '../src/glo-records.js';

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

test('extractGloSearchCriteriaFromLookup derives state, county code, and meridian defaults', () => {
  const result = extractGloSearchCriteriaFromLookup({
    township: { attributes: { STATEABBR: 'id', COUNTYFP: '39', MERIDIAN: '8' } },
  });

  assert.equal(result.stateAbbr, 'ID');
  assert.equal(result.countyCode, '039');
  assert.equal(result.meridian, '08');
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

test('buildGloResultsUrl builds township/range/section results search criteria', () => {
  const url = buildGloResultsUrl(
    'https://glorecords.blm.gov/search/default.aspx',
    { township: '5', townshipDir: 'S', range: '9', rangeDir: 'E', section: '4' },
    { stateAbbr: 'ID', countyCode: '039', meridian: '08' },
  );

  assert.match(url, /^https:\/\/glorecords\.blm\.gov\/results\/default\.aspx\?/);
  assert.match(url, /searchCriteria=type%3Dsurvey%7Cst%3DID%7Ccty%3D039%7Ctwp_nr%3D5%7Ctwp_dir%3DS%7Crng_nr%3D9%7Crng_dir%3DE%7Csec_nr%3D4%7Cm%3D08/);
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

test('parseGloDocumentListHtml extracts survey records from results page style links', () => {
  const html = `
    <div class="results-row">
      <h3><a href="/details/survey/default.aspx?aid=111">Survey Plat 111</a></h3>
      <p>Survey record filed for township and range reference.</p>
    </div>
    <div class="results-row">
      <h3><a href="/details/survey/default.aspx?aid=111">Survey Plat 111</a></h3>
      <p>Duplicate row.</p>
    </div>
  `;

  const docs = parseGloDocumentListHtml(html, 'https://glorecords.blm.gov/search/default.aspx');
  assert.equal(docs.length, 1);
  assert.equal(docs[0].title, 'Survey Plat 111');
  assert.equal(docs[0].url, 'https://glorecords.blm.gov/details/survey/default.aspx?aid=111');
});

test('parseGloDocumentListHtml ignores javascript and off-site links from search chrome rows', () => {
  const html = `
    <table>
      <tr><td><a href="javascript:tabClick('1')">Search Documents By Type</a></td><td>Search Documents By Type Search Documents By Location</td></tr>
      <tr><td><a href="javascript:search('patent')">Search Patents</a></td><td>Search Patents Note: This site does not cover every state.</td></tr>
      <tr><td><a href="https://example.com/details/patent/default.aspx?id=123">Patent 123</a></td><td>Land patent record</td></tr>
      <tr><td><a href="/details/patent/default.aspx?id=123">Patent 123</a></td><td>Land patent record</td></tr>
    </table>
  `;

  const docs = parseGloDocumentListHtml(html, 'https://glorecords.blm.gov/search/default.aspx');
  assert.equal(docs.length, 1);
  assert.equal(docs[0].title, 'Patent 123');
  assert.equal(docs[0].url, 'https://glorecords.blm.gov/details/patent/default.aspx?id=123');
});
