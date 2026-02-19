import {
  buildLineworkSegments,
  deriveLineworkCodesFromFldConfig,
  parseFieldToFinishDirective,
  resolveSequentialDirectiveBaseCode,
  tokenizePointCode,
  isCurveMarkerToken,
} from './field-to-finish-rules-engine.js';

function parseNumeric(value) {
  const num = Number(String(value ?? '').trim());
  return Number.isFinite(num) ? num : null;
}

export function parsePointFileText(text = '') {
  const lines = String(text ?? '').split(/\r?\n/).filter((line) => line.trim());
  const points = [];
  for (const rawLine of lines) {
    const cols = rawLine.split(',');
    if (cols.length < 3) continue;
    const x = parseNumeric(cols[1]);
    const y = parseNumeric(cols[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push({ id: String(cols[0] || '').trim(), x, y, code: String(cols[4] || '').trim() });
  }
  return points;
}

export function renderLineworkThumbnailDataUrl(points = [], options = {}) {
  const width = Number(options.width) || 96;
  const height = Number(options.height) || 56;
  const stroke = options.stroke || '#22d3ee';
  const lineworkCodes = options.lineworkCodes instanceof Set
    ? options.lineworkCodes
    : deriveLineworkCodesFromFldConfig(options.fldConfig || {});
  const lineworks = buildLineworkSegments(points, { lineworkCodes });
  const segments = lineworks.flatMap((entry) => entry.segments || []);
  if (!segments.length) return '';

  const coords = segments.flatMap((segment) => segment || []);
  const xs = coords.map((p) => p.x);
  const ys = coords.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const pad = 6;
  const viewW = Math.max(1, width - pad * 2);
  const viewH = Math.max(1, height - pad * 2);
  const scale = Math.min(viewW / spanX, viewH / spanY);
  const usedW = spanX * scale;
  const usedH = spanY * scale;
  const offsetX = pad + (viewW - usedW) / 2;
  const offsetY = pad + (viewH - usedH) / 2;

  const lines = segments.map(([a, b]) => {
    const ax = offsetX + (a.x - minX) * scale;
    const ay = height - (offsetY + (a.y - minY) * scale);
    const bx = offsetX + (b.x - minX) * scale;
    const by = height - (offsetY + (b.y - minY) * scale);
    return `<line x1="${ax.toFixed(2)}" y1="${ay.toFixed(2)}" x2="${bx.toFixed(2)}" y2="${by.toFixed(2)}" />`;
  }).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#0b1120"/><g stroke="${stroke}" stroke-width="2" stroke-linecap="round">${lines}</g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function renderPointFileThumbnailDataUrl(text = '', options = {}) {
  return renderLineworkThumbnailDataUrl(parsePointFileText(text), options);
}

const PointThumbnailClient = {
  tokenizePointCode,
  isCurveMarkerToken,
  resolveSequentialDirectiveBaseCode,
  parseFieldToFinishDirective,
  buildLineworkSegments,
  deriveLineworkCodesFromFldConfig,
  parsePointFileText,
  renderLineworkThumbnailDataUrl,
  renderPointFileThumbnailDataUrl,
};

if (typeof window !== 'undefined') {
  window.SurveyCadPointThumbnailClient = PointThumbnailClient;
}

export default PointThumbnailClient;
