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

export function parseGloDocumentListHtml(html = '', originUrl = 'https://glorecords.blm.gov/search/default.aspx') {
  const normalizedHtml = String(html || '');
  const rowMatches = normalizedHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  const documents = [];
  const seen = new Set();

  for (const rowHtml of rowMatches) {
    const linkMatch = rowHtml.match(/<a\b[^>]*href\s*=\s*['\"]([^'\"]+)['\"][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const [, rawHref, rawTitle] = linkMatch;
    const href = String(rawHref || '').trim();
    if (!href) continue;

    const absoluteUrl = new URL(href, originUrl).toString();
    const title = stripHtml(rawTitle);
    const rowText = stripHtml(rowHtml);

    if (!/(patent|survey|tract|plat|serial|land|document|record)/i.test(rowText)) continue;
    if (!title) continue;

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
