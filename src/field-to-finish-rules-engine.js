const DIRECTIVE_TOKENS = new Set(['BEG', 'END', 'CLO']);

export function tokenizePointCode(rawCode = '') {
  const raw = String(rawCode ?? '');
  return raw
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);
}

export function isCurveMarkerToken(token = '') {
  const normalized = String(token ?? '').trim().toUpperCase();
  return normalized === 'PC' || normalized === 'PT';
}

export function resolveSequentialDirectiveBaseCode(tokensUpper = [], directiveIndex = -1) {
  if (!Array.isArray(tokensUpper)) return '';
  if (!Number.isInteger(directiveIndex) || directiveIndex < 0 || directiveIndex >= tokensUpper.length) return '';

  for (let distance = 1; distance < tokensUpper.length; distance++) {
    const previous = tokensUpper[directiveIndex - distance];
    if (previous && !DIRECTIVE_TOKENS.has(previous) && !isCurveMarkerToken(previous)) return previous;
    const next = tokensUpper[directiveIndex + distance];
    if (next && !DIRECTIVE_TOKENS.has(next) && !isCurveMarkerToken(next)) return next;
  }
  return '';
}

export function parseFieldToFinishDirective(code = '') {
  const tokensUpper = tokenizePointCode(code);
  const firstDirectiveIndex = tokensUpper.findIndex((token) => DIRECTIVE_TOKENS.has(token));
  if (firstDirectiveIndex < 0) return null;
  const action = tokensUpper[firstDirectiveIndex];
  const baseCode = resolveSequentialDirectiveBaseCode(tokensUpper, firstDirectiveIndex);
  if (!baseCode) return null;
  return { action, baseCode };
}

export function buildLineworkSegments(points = [], options = {}) {
  const lineworkCodes = options.lineworkCodes instanceof Set ? options.lineworkCodes : new Set();
  const activeByCode = new Map();
  const segmentsByCode = new Map();

  for (const point of points) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const directive = parseFieldToFinishDirective(point.code || '');
    if (!directive || !directive.baseCode) continue;
    if (lineworkCodes.size && !lineworkCodes.has(directive.baseCode)) continue;

    const key = directive.baseCode;
    const existing = activeByCode.get(key) || null;

    if (directive.action === 'BEG') {
      activeByCode.set(key, point);
      continue;
    }

    if ((directive.action === 'END' || directive.action === 'CLO') && existing) {
      if (!segmentsByCode.has(key)) segmentsByCode.set(key, []);
      segmentsByCode.get(key).push([existing, point]);
      if (directive.action === 'CLO') activeByCode.set(key, point);
      else activeByCode.delete(key);
    }
  }

  return Array.from(segmentsByCode.entries()).map(([baseCode, segments]) => ({ baseCode, segments }));
}

export function deriveLineworkCodesFromFldConfig(config = {}) {
  const rules = Array.isArray(config?.rules) ? config.rules : [];
  const codes = new Set();
  for (const rule of rules) {
    const code = String(rule?.code || '').trim().toUpperCase();
    const rawEntityType = rule?.entityType ?? rule?.entity_type ?? rule?.raw?.entity_type ?? rule?.raw?.entityType ?? '';
    const entityType = String(rawEntityType).trim().toUpperCase();
    const entityTypeNumeric = Number.parseInt(entityType, 10);
    if (!code) continue;
    if (
      entityType === 'LINE'
      || entityType === 'LINEWORK'
      || entityType === 'LWPOLYLINE'
      || entityType === 'POLYLINE'
      || entityTypeNumeric === 1
      || entityTypeNumeric === 2
    ) {
      codes.add(code);
    }
  }
  return codes;
}
