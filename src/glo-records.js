function decodeHtmlEntities(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripHtml(value = '') {
  return decodeHtmlEntities(String(value).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function normalizeNumberToken(value = '') {
  const digits = String(value || '').match(/\d+/);
  if (!digits) return '';
  return String(Number(digits[0]));
}

function firstAttr(source, keys = []) {
  if (!source || typeof source !== 'object') return '';
  for (const key of keys) {
    const value = source[key];
    if (value === null || value === undefined) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return '';
}

function normalizeDirection(value = '') {
  const normalized = String(value || '').trim().toUpperCase();
  return /^(N|S|E|W)$/.test(normalized) ? normalized : '';
}

function normalizeStateAbbr(value = '') {
  const normalized = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : '';
}

function normalizeCountyCode(value = '') {
  const numeric = normalizeNumberToken(value);
  if (!numeric) return '';
  return numeric.padStart(3, '0');
}

function normalizeMeridianCode(value = '') {
  const numeric = normalizeNumberToken(value);
  if (!numeric) return '';
  return numeric.padStart(2, '0');
}

export function extractTrsMetadataFromLookup(lookupPayload = {}) {
  const townshipAttrs = lookupPayload?.township?.attributes || {};
  const sectionAttrs = lookupPayload?.section?.attributes || {};

  const township = normalizeNumberToken(firstAttr(townshipAttrs, ['TWNSHPNO', 'TOWNSHIP', 'TWP', 'TWP_NO']));
  const townshipDir = normalizeDirection(firstAttr(townshipAttrs, ['TWNSHPDIR', 'TOWNSHPDIR', 'TWPDIR', 'TOWNSHIP_DIR', 'TDIR']));
  const range = normalizeNumberToken(firstAttr(townshipAttrs, ['RANGENO', 'RANGE', 'RNG', 'RANGE_NO']));
  const rangeDir = normalizeDirection(firstAttr(townshipAttrs, ['RANGEDIR', 'RNGDIR', 'RANGE_DIR', 'RDIR']));
  const section = normalizeNumberToken(firstAttr(sectionAttrs, ['SEC', 'SECTION', 'SECNO']));

  const townshipLabel = township ? `T${township}${townshipDir}` : '';
  const rangeLabel = range ? `R${range}${rangeDir}` : '';
  const sectionLabel = section ? `Sec ${section}` : '';

  return {
    township,
    townshipDir,
    range,
    rangeDir,
    section,
    townshipRange: [townshipLabel, rangeLabel, sectionLabel].filter(Boolean).join(' '),
  };
}

export function extractGloSearchCriteriaFromLookup(lookupPayload = {}) {
  const townshipAttrs = lookupPayload?.township?.attributes || {};
  const sectionAttrs = lookupPayload?.section?.attributes || {};
  const geocode = Array.isArray(lookupPayload?.geocode) ? lookupPayload.geocode[0] : null;

  const stateAbbr = normalizeStateAbbr(firstAttr(townshipAttrs, ['STATEABBR', 'STATE_ABBR', 'ST', 'STATE']))
    || normalizeStateAbbr(firstAttr(sectionAttrs, ['STATEABBR', 'STATE_ABBR', 'ST', 'STATE']))
    || normalizeStateAbbr(firstAttr(geocode || {}, ['state', 'state_code']))
    || 'ID';

  const countyCode = normalizeCountyCode(firstAttr(townshipAttrs, ['COUNTYFP', 'COUNTYFIPS', 'CNTYCODE', 'COUNTY_CODE', 'COUNTYNO', 'COUNTY']))
    || normalizeCountyCode(firstAttr(sectionAttrs, ['COUNTYFP', 'COUNTYFIPS', 'CNTYCODE', 'COUNTY_CODE', 'COUNTYNO', 'COUNTY']));

  const meridian = normalizeMeridianCode(firstAttr(townshipAttrs, ['MERIDIAN', 'MERIDIANNO', 'MERIDIAN_NO', 'PM']))
    || normalizeMeridianCode(firstAttr(sectionAttrs, ['MERIDIAN', 'MERIDIANNO', 'MERIDIAN_NO', 'PM']))
    || '08';

  return { stateAbbr, countyCode, meridian };
}

export function buildGloSearchUrl(baseUrl, trs = {}) {
  const url = new URL(String(baseUrl || 'https://glorecords.blm.gov/search/default.aspx'));
  url.hash = 'searchTabIndex=0&searchByTypeIndex=1';

  if (trs.township) url.searchParams.set('township', String(trs.township));
  if (trs.townshipDir) url.searchParams.set('townshipDir', String(trs.townshipDir));
  if (trs.range) url.searchParams.set('range', String(trs.range));
  if (trs.rangeDir) url.searchParams.set('rangeDir', String(trs.rangeDir));
  if (trs.section) url.searchParams.set('section', String(trs.section));

  return url.toString();
}

export function buildGloResultsUrl(baseUrl, trs = {}, criteria = {}) {
  const base = new URL(String(baseUrl || 'https://glorecords.blm.gov/search/default.aspx'));
  const url = new URL('/results/default.aspx', `${base.protocol}//${base.host}`);
  const parts = ['type=survey'];

  if (criteria.stateAbbr) parts.push(`st=${criteria.stateAbbr}`);
  if (criteria.countyCode) parts.push(`cty=${criteria.countyCode}`);
  if (trs.township) parts.push(`twp_nr=${trs.township}`);
  if (trs.townshipDir) parts.push(`twp_dir=${trs.townshipDir}`);
  if (trs.range) parts.push(`rng_nr=${trs.range}`);
  if (trs.rangeDir) parts.push(`rng_dir=${trs.rangeDir}`);
  if (trs.section) parts.push(`sec_nr=${trs.section}`);
  if (criteria.meridian) parts.push(`m=${criteria.meridian}`);

  url.searchParams.set('searchCriteria', parts.join('|'));
  return url.toString();
}

export function parseGloDocumentListHtml(html = '', originUrl = 'https://glorecords.blm.gov/search/default.aspx') {
  const normalizedHtml = String(html || '');
  const origin = new URL(String(originUrl || 'https://glorecords.blm.gov/search/default.aspx'));
  const documents = [];
  const seen = new Set();
  const anchorRegex = /<a\b[^>]*href\s*=\s*['\"]([^'\"]+)['\"][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of normalizedHtml.matchAll(anchorRegex)) {
    const rawHref = match[1] || '';
    const rawTitle = match[2] || '';
    const href = String(rawHref).trim();
    if (!href) continue;

    const absolute = new URL(href, origin);
    if (!['http:', 'https:'].includes(absolute.protocol)) continue;
    if (absolute.hostname !== origin.hostname) continue;

    const title = stripHtml(rawTitle);
    if (!title) continue;
    if (/^search\b/i.test(title)) continue;

    const absoluteUrl = absolute.toString();
    if (!/(details|document|image|patent|survey|tract|serial|plat)/i.test(absoluteUrl)) continue;

    const matchIndex = Number(match.index || 0);
    const contextStart = Math.max(0, matchIndex - 180);
    const contextEnd = Math.min(normalizedHtml.length, matchIndex + String(match[0] || '').length + 180);
    const details = stripHtml(normalizedHtml.slice(contextStart, contextEnd));
    const rowText = details || title;

    if (!/(patent|survey|tract|plat|serial|land|document|record)/i.test(rowText)) continue;

    const key = `${title}|${absoluteUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);

    documents.push({
      title,
      url: absoluteUrl,
      details: rowText,
    });
  }

  return documents;
}
