import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import SurveyCadClient from './survey-api.js';
import { createRosOcrApp } from './ros-ocr-api.js';
import { listApps } from './app-catalog.js';
import { buildProjectArchivePlan, createProjectFile, PROJECT_FILE_FOLDERS } from './project-file.js';
import { LocalStorageSyncStore } from './localstorage-sync-store.js';
import { createRedisLocalStorageSyncStore } from './redis-localstorage-sync-store.js';
import { createLineforgeCollabService } from './lineforge-collab.js';
import { createLocalStorageSyncWsService } from './localstorage-sync-ws.js';
import { createCrewPresenceWsService } from './crew-presence-ws.js';
import { createWorkerSchedulerService } from './worker-task-ws.js';
import { createIdahoHarvestSupervisor } from './idaho-harvest-supervisor.js';
import { createIdahoHarvestObjectStoreFromEnv } from './idaho-harvest-worker.js';
import { createLmProxyHubWsService } from "./lmstudio-proxy-control-ws.js";
import { createRedisClient as createBewRedisClient } from "./bew-redis.js";
import { createEvidenceDeskFileStore } from './evidence-desk-file-store.js';
import {
  listProjectDrawings,
  getProjectDrawing,
  createOrUpdateProjectDrawing,
  deleteProjectDrawing,
} from './project-drawing-store.js';
import {
  listProjectPointFiles,
  getProjectPointFile,
  getProjectPointFileAtVersion,
  createOrUpdateProjectPointFile,
  deleteProjectPointFile,
} from './project-point-file-store.js';
import {
  getProjectWorkbenchLink,
  setProjectWorkbenchLink,
  clearProjectWorkbenchLink,
  getProjectMetadata,
  collectProjectWorkbenchSources,
  syncProjectSourcesToCasefile,
  listProjectTraverses,
  upsertProjectTraverseRecord,
} from './project-workbench.js';
import {
  hydrateBoundaryLabTraverseCalls,
  normalizeBoundaryLabCalls,
  persistBoundaryLabTraverseCalls,
} from './project-workbench-traverse-calls.js';

import { loadFldConfig } from './fld-config.js';
import {
  getFieldToFinishSettings,
  upsertFieldToFinishSettings,
  clearFieldToFinishSettings,
} from './field-to-finish-store.js';
import {
  getCrewProfiles,
  getEquipmentInventory,
  getEquipmentLogs,
  findCrewMemberById,
  findEquipmentById,
  findEquipmentLogById,
  saveCrewMember,
  saveEquipmentItem,
  deleteEquipmentItem,
  saveEquipmentLog,
} from './crew-equipment-api.js';

/* ------------------------------ BEW integration ------------------------------ */
/* IMPORTANT: namespace imports so missing named exports do not crash on Heroku */
import * as BewRoutes from './bew-routes.js';
import * as BewStore from './bew-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_STATIC_DIR = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
};

const SMALL_ASSET_CACHE_MAX_BYTES = 4 * 1024;
const smallStaticAssetCache = new Map();
const PDF_THUMBNAIL_TARGET_WIDTH = 1024;
const PDF_THUMBNAIL_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;
const PDF_THUMBNAIL_FAILURE_COOLDOWN_MS = 30 * 1000;
const IMAGE_THUMBNAIL_TARGET_WIDTH = 512;
const IMAGE_THUMBNAIL_MAX_HEIGHT = 512;
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = Number(status) || 500;
  return error;
}

function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${cmd} exited with code ${code}${stderr ? `: ${stderr}` : ''}`));
    });
  });
}

async function renderPdfThumbnailFromBuffer(pdfBuffer, { width = PDF_THUMBNAIL_TARGET_WIDTH } = {}) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'surveycad-pdf-thumb-'));
  const pdfPath = path.join(tempDir, 'input.pdf');
  const pngPrefix = path.join(tempDir, 'page');
  const pageOnePng = `${pngPrefix}.png`;
  try {
    await writeFile(pdfPath, pdfBuffer);
    await runCommand('pdftoppm', ['-f', '1', '-singlefile', '-png', pdfPath, pngPrefix]);
    const sharp = (await import('sharp')).default;
    return await sharp(pageOnePng)
      .resize({ width, withoutEnlargement: true })
      .png()
      .toBuffer();
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}


async function renderImageThumbnailFromBuffer(imageBuffer, { width = IMAGE_THUMBNAIL_TARGET_WIDTH, maxHeight = IMAGE_THUMBNAIL_MAX_HEIGHT } = {}) {
  const sharp = (await import('sharp')).default;
  return await sharp(imageBuffer)
    .resize({ width, height: maxHeight, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
}

function canGenerateImageThumbnail({ extension = '', mimeType = '' } = {}) {
  const normalizedExt = String(extension || '').replace(/^\./, '').toLowerCase();
  const normalizedMime = String(mimeType || '').toLowerCase();
  if (normalizedMime.startsWith('image/')) return true;
  return IMAGE_EXTENSIONS.has(normalizedExt);
}


function areWorkersEnabled(env = process.env) {
  return String(env.WORKERS_ENABLED || '1').trim().toLowerCase() !== 'false'
    && String(env.WORKERS_ENABLED || '1').trim() !== '0';
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function parseProjectDrawingRoute(pathname = '') {
  const match = String(pathname || '').match(/^\/api\/projects\/([^/]+)\/drawings(?:\/([^/]+))?\/?$/);
  if (!match) return null;
  return {
    projectId: decodeURIComponent(match[1]),
    drawingId: match[2] ? decodeURIComponent(match[2]) : '',
  };
}

function parseProjectPointFileRoute(pathname = '') {
  const match = String(pathname || '').match(/^\/api\/projects\/([^/]+)\/point-files(?:\/([^/]+))?\/?$/);
  if (!match) return null;
  return {
    projectId: decodeURIComponent(match[1]),
    pointFileId: match[2] ? decodeURIComponent(match[2]) : '',
  };
}

function buildLineSmithDrawingObjectName(drawingId = '') {
  const normalized = String(drawingId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${normalized || 'drawing'}.linesmith.json`;
}

function buildPointFoundryObjectName(pointFileId = '', exportFormat = 'csv') {
  const normalizedId = String(pointFileId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const normalizedFormat = String(exportFormat || 'csv').trim().toLowerCase() || 'csv';
  return `${normalizedId || 'point-file'}.${normalizedFormat}`;
}


function parsePointFileChangeContext(req, body = {}, fallbackApp = 'unknown-app') {
  const appFromHeader = String(req.headers['x-survey-app'] || req.headers['x-app-name'] || '').trim();
  const userFromHeader = String(req.headers['x-survey-user'] || req.headers['x-user-id'] || '').trim();
  const context = body?.changeContext && typeof body.changeContext === 'object' ? body.changeContext : {};
  const sourceAsApp = String(body?.source || '').trim();
  const app = String(context.app || body?.app || appFromHeader || sourceAsApp || fallbackApp || 'unknown-app').trim() || 'unknown-app';
  const user = String(context.user || body?.user || userFromHeader).trim() || 'unknown-user';
  return { app, user };
}

function parseProjectWorkbenchRoute(pathname = '') {
  const match = String(pathname || '').match(/^\/api\/projects\/([^/]+)\/workbench(?:\/(link|casefile|sources|sync|traverses(?:\/[^/]+)?))?\/?$/);
  if (!match) return null;
  const action = match[2] ? decodeURIComponent(match[2]) : '';
  const traverseMatch = action.match(/^traverses(?:\/([^/]+))?$/);
  return {
    projectId: decodeURIComponent(match[1]),
    action,
    traverseId: traverseMatch?.[1] ? decodeURIComponent(traverseMatch[1]) : '',
  };
}

function parseMapTileRoute(pathname = '') {
  const tileJsonMatch = String(pathname || '').match(/^\/api\/maptiles\/([^/]+)\/tilejson\.json\/?$/);
  if (tileJsonMatch) {
    return { dataset: decodeURIComponent(tileJsonMatch[1]), z: null, x: null, y: null, isTileJson: true };
  }
  const tileMatch = String(pathname || '').match(/^\/api\/maptiles\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.geojson\/?$/);
  if (!tileMatch) return null;
  return {
    dataset: decodeURIComponent(tileMatch[1]),
    z: Number(tileMatch[2]),
    x: Number(tileMatch[3]),
    y: Number(tileMatch[4]),
    isTileJson: false,
  };
}

function toCsvValue(value) {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  if (/[,"\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function buildPointFileTextFromDrawingState(drawingState = {}) {
  const points = Array.isArray(drawingState?.points)
    ? drawingState.points.filter((point) => point && typeof point === 'object')
    : [];
  return points
    .map((point, index) => {
      const number = point.num ?? point.number ?? point.pointNumber ?? point.name ?? point.id ?? index + 1;
      const northing = point.y ?? point.northing ?? '';
      const easting = point.x ?? point.easting ?? '';
      const z = point.z ?? point.elevation ?? '';
      const code = point.code ?? '';
      const notes = point.notes ?? point.description ?? '';
      return [number, northing, easting, z, code, notes].map(toCsvValue).join(',');
    })
    .join('\n');
}

function normalizePointFileHeader(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function parseCsvLine(line = '') {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  values.push(current);
  return values;
}

function toFiniteNumberOrRaw(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const number = Number(raw);
  return Number.isFinite(number) ? number : raw;
}

function normalizePointNumber(point = {}) {
  return String(point?.num ?? point?.number ?? point?.pointNumber ?? point?.name ?? point?.id ?? '').trim();
}

function normalizePointCode(point = {}) {
  return String(point?.code || '').trim().toUpperCase();
}

function normalizePointFileId(pointFileId = '') {
  return String(pointFileId || '')
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeLinkedPointFileReference(drawing = null) {
  return {
    projectId: String(drawing?.linkedPointFileProjectId || '').trim(),
    pointFileId: String(drawing?.linkedPointFileId || '').trim(),
  };
}

function hasLinkedPointFileReferenceChanged(previousDrawing = null, nextDrawing = null) {
  const previousReference = normalizeLinkedPointFileReference(previousDrawing);
  const nextReference = normalizeLinkedPointFileReference(nextDrawing);
  return previousReference.projectId !== nextReference.projectId
    || previousReference.pointFileId !== nextReference.pointFileId;
}

function buildDrawingPointsFromPointFileText(text = '') {
  const rows = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => parseCsvLine(line))
    .filter((parts) => parts.length >= 3);
  if (!rows.length) return [];

  let startRow = 0;
  let idx = { num: 0, northing: 1, easting: 2, z: 3, code: 4, notes: 5 };
  const firstRowHeaders = rows[0].map((value) => normalizePointFileHeader(value));
  const looksLikeHeader = firstRowHeaders.some((header) => new Set([
    'point',
    'pointnumber',
    'number',
    'num',
    'northing',
    'easting',
    'n',
    'e',
    'x',
    'y',
  ]).has(header));
  if (looksLikeHeader) {
    const headerMap = new Map(firstRowHeaders.map((value, index) => [value, index]));
    const pick = (...names) => {
      for (const name of names) {
        if (headerMap.has(name)) return headerMap.get(name);
      }
      return null;
    };
    startRow = 1;
    idx = {
      num: pick('pointnumber', 'number', 'num', 'point') ?? 0,
      northing: pick('northing', 'north', 'n', 'x', 'y') ?? 1,
      easting: pick('easting', 'east', 'e', 'y', 'x') ?? 2,
      z: pick('elevation', 'elev', 'z') ?? 3,
      code: pick('code', 'desc', 'description') ?? 4,
      notes: pick('notes', 'note', 'comment', 'comments') ?? 5,
    };
  }

  return rows
    .slice(startRow)
    .map((parts) => {
      const pointNumber = parts[idx.num];
      const northing = parts[idx.northing];
      const easting = parts[idx.easting];
      const z = parts[idx.z];
      const code = parts[idx.code];
      const notes = parts[idx.notes];
      const normalizedPointNumber = String(pointNumber || '').trim();
      const normalizedCode = String(code || '').trim();
      const normalizedNotes = String(notes || '').trim();
      const point = {
        num: normalizedPointNumber,
        x: toFiniteNumberOrRaw(easting),
        y: toFiniteNumberOrRaw(northing),
        notes: normalizedNotes,
      };
      const normalizedZ = String(z || '').trim();
      if (normalizedZ) point.z = toFiniteNumberOrRaw(normalizedZ);
      if (normalizedCode) point.code = normalizedCode;
      return point;
    })
    .filter((point) => point.num);
}

async function hydrateDrawingStateFromLinkedPointFile(store, drawing = null) {
  if (!drawing || !drawing.currentState || typeof drawing.currentState !== 'object') return drawing;
  const linkedProjectId = String(drawing.linkedPointFileProjectId || '').trim();
  const linkedPointFileId = String(drawing.linkedPointFileId || '').trim();
  if (!linkedProjectId || !linkedPointFileId) return drawing;

  const linkedPointFile = await getProjectPointFile(store, linkedProjectId, linkedPointFileId);
  if (!linkedPointFile?.currentState?.text) return drawing;

  const linkedPoints = buildDrawingPointsFromPointFileText(linkedPointFile.currentState.text);
  const existingPoints = Array.isArray(drawing.currentState.points)
    ? drawing.currentState.points.filter((point) => point && typeof point === 'object')
    : [];
  const existingByPointNumber = new Map();
  for (const existingPoint of existingPoints) {
    const pointNumber = normalizePointNumber(existingPoint);
    if (!pointNumber || existingByPointNumber.has(pointNumber)) continue;
    existingByPointNumber.set(pointNumber, existingPoint);
  }

  const hydratedPoints = linkedPoints.map((linkedPoint) => {
    const existingPoint = existingByPointNumber.get(linkedPoint.num);
    if (!existingPoint) {
      return {
        id: linkedPoint.num,
        ...linkedPoint,
      };
    }
    const existingCode = normalizePointCode(existingPoint);
    const linkedCode = normalizePointCode(linkedPoint);
    const shouldPreserveLayerId = !!existingPoint.layerId && existingCode === linkedCode;
    return {
      ...existingPoint,
      ...linkedPoint,
      id: existingPoint.id ?? linkedPoint.num,
      num: linkedPoint.num,
      layerId: shouldPreserveLayerId ? existingPoint.layerId : undefined,
    };
  });

  return {
    ...drawing,
    currentState: {
      ...drawing.currentState,
      points: hydratedPoints,
    },
  };
}

async function syncDrawingLinkedPointFile(store, drawingRecord = {}, changeContext = null) {
  const linkedProjectId = String(drawingRecord?.linkedPointFileProjectId || '').trim();
  const linkedPointFileId = String(drawingRecord?.linkedPointFileId || '').trim();
  if (!linkedProjectId || !linkedPointFileId) return null;

  const text = buildPointFileTextFromDrawingState(drawingRecord?.currentState);
  const result = await createOrUpdateProjectPointFile(store, {
    projectId: linkedProjectId,
    pointFileId: linkedPointFileId,
    pointFileName: drawingRecord.linkedPointFileName || `${drawingRecord.drawingName || linkedPointFileId}.csv`,
    pointFileState: {
      text: String(text || '# empty drawing\n'),
      exportFormat: 'csv',
    },
    source: 'linesmith-drawing',
    sourceLabel: drawingRecord.drawingName || null,
    changeContext: changeContext || { app: 'linesmith-drawing', user: 'unknown-user' },
  });

  return result;
}

function getErrorStatusCode(err) {
  const explicitStatus = Number(err?.status);
  if (Number.isFinite(explicitStatus) && explicitStatus >= 400 && explicitStatus <= 599) {
    return explicitStatus;
  }
  const message = err?.message || '';
  if (/^HTTP\s+\d{3}:/i.test(message)) return 502;
  return 400;
}

function hasDrawingStatePayload(body = {}) {
  return !!body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'drawingState');
}

function parseRemotePdfUrl(urlObj) {
  const rawUrl = urlObj.searchParams.get('url');
  if (!rawUrl) throw new Error('url query parameter is required.');

  let parsed;
  try { parsed = new URL(rawUrl); }
  catch { throw new Error('url query parameter must be a valid absolute URL.'); }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https URLs are supported for ROS PDF loading.');
  }
  return parsed.toString();
}

function parseLonLat(urlObj) {
  const lon = Number(urlObj.searchParams.get('lon'));
  const lat = Number(urlObj.searchParams.get('lat'));
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error('Valid numeric lon and lat query parameters are required.');
  }
  return { lon, lat };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildFallbackStaticMapSvg(lat, lon, address = '') {
  const title = address.trim() || `Lat ${lat.toFixed(5)}, Lon ${lon.toFixed(5)}`;
  const safeTitle = escapeHtml(title);
  const safeCoordinates = escapeHtml(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000" role="img" aria-label="Project map fallback for ${safeTitle}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e293b" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
  </defs>
  <rect width="1600" height="1000" fill="url(#bg)" />
  <circle cx="800" cy="500" r="14" fill="#ef4444" />
  <circle cx="800" cy="500" r="42" fill="none" stroke="#f87171" stroke-opacity="0.55" stroke-width="4" />
  <text x="800" y="560" fill="#e2e8f0" text-anchor="middle" font-size="36" font-family="Inter, system-ui, sans-serif">${safeTitle}</text>
  <text x="800" y="610" fill="#94a3b8" text-anchor="middle" font-size="24" font-family="Inter, system-ui, sans-serif">${safeCoordinates}</text>
</svg>`;
}

function lonLatToTile(lat, lon, zoom = 17) {
  const clampedLat = Math.max(Math.min(lat, 85.05112878), -85.05112878);
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (clampedLat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + (1 / Math.cos(latRad))) / Math.PI) / 2) * n);
  return { x: Math.min(Math.max(x, 0), n - 1), y: Math.min(Math.max(y, 0), n - 1), zoom };
}

const MAX_JSON_BODY_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_UPLOAD_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');
const VALID_FOLDER_KEYS = new Set(PROJECT_FILE_FOLDERS.map((f) => f.key));

function sanitizeFileName(name) {
  return String(name || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '_')
    .slice(0, 200);
}

function parseContentLength(req) {
  const rawLength = req.headers['content-length'];
  const parsed = Number(rawLength);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

async function parseMultipartUpload(req) {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
  if (!boundaryMatch) throw new Error('Missing multipart boundary.');
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const delimiter = Buffer.from(`--${boundary}`);

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_UPLOAD_FILE_BYTES + 1024 * 1024) {
      req.destroy();
      throw new Error(`Upload exceeds maximum allowed size of ${MAX_UPLOAD_FILE_BYTES} bytes.`);
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);

  const fields = {};
  let fileBuffer = null;
  let fileName = '';
  let fileMimeType = null;

  let start = body.indexOf(delimiter);
  while (start !== -1) {
    start += delimiter.length;
    if (body[start] === 0x2d && body[start + 1] === 0x2d) break;
    if (body[start] === 0x0d && body[start + 1] === 0x0a) start += 2;

    const headerEnd = body.indexOf('\r\n\r\n', start);
    if (headerEnd === -1) break;
    const headerBlock = body.slice(start, headerEnd).toString('utf8');
    const bodyStart = headerEnd + 4;

    const nextDelimiter = body.indexOf(delimiter, bodyStart);
    const bodyEnd = nextDelimiter !== -1 ? nextDelimiter - 2 : body.length;
    const partBody = body.slice(bodyStart, bodyEnd);

    const nameMatch = headerBlock.match(/name="([^"]+)"/);
    const filenameMatch = headerBlock.match(/filename="([^"]+)"/);

    if (nameMatch) {
      if (filenameMatch) {
        fileBuffer = partBody;
        fileName = filenameMatch[1];
        const partTypeMatch = headerBlock.match(/(?:^|\r\n)Content-Type:\s*([^\r\n]+)/i);
        fileMimeType = partTypeMatch ? partTypeMatch[1].trim() : null;
      } else {
        fields[nameMatch[1]] = partBody.toString('utf8');
      }
    }

    start = nextDelimiter !== -1 ? nextDelimiter : -1;
  }

  return { fields, fileBuffer, fileName, fileMimeType };
}
async function readJsonBody(req) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      req.destroy();
      throw new Error(`Request body exceeds maximum allowed size of ${MAX_JSON_BODY_BYTES} bytes.`);
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { throw new Error('Request body must be valid JSON.'); }
}

async function serveStaticFile(urlPath, staticDir, res) {
  const requested = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath);
  const safePath = requested.replace(/^\/+/, '');
  const absPath = await resolveStaticPath(staticDir, safePath);

  if (!absPath.startsWith(path.resolve(staticDir))) {
    sendJson(res, 403, { error: 'Forbidden path.' });
    return;
  }

  try {
    const body = await readStaticAsset(absPath);
    const ext = path.extname(absPath).toLowerCase();
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', resolveStaticCacheControl(absPath));
    res.end(body);
  } catch {
    sendJson(res, 404, { error: 'Not found.' });
  }
}

function isSmallStaticAsset(absPath) {
  const normalized = absPath.replace(/\\/g, '/').toLowerCase();
  return normalized.includes('/assets/icons/') || normalized.includes('/assets/survey-symbols/');
}

function resolveStaticCacheControl(absPath) {
  if (isSmallStaticAsset(absPath)) return 'public, max-age=31536000, immutable';
  const ext = path.extname(absPath).toLowerCase();
  if (ext === '.html') return 'no-cache';
  return 'public, max-age=300';
}

async function readStaticAsset(absPath) {
  const cached = smallStaticAssetCache.get(absPath);
  if (cached) return cached;

  const body = await readFile(absPath);
  if (isSmallStaticAsset(absPath) && body.byteLength <= SMALL_ASSET_CACHE_MAX_BYTES) {
    smallStaticAssetCache.set(absPath, body);
  }
  return body;
}

async function resolveStaticPath(staticDir, safePath) {
  const base = path.resolve(staticDir);
  const initialPath = path.resolve(base, safePath);

  if (initialPath.startsWith(base)) {
    try {
      await access(initialPath);
      return initialPath;
    } catch { /* fall through */ }
  }

  const segments = safePath.split('/').filter(Boolean);
  let currentDir = base;

  for (const segment of segments) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    const matched = entries.find((entry) => entry.name === segment)
      || entries.find((entry) => entry.name.toLowerCase() === segment.toLowerCase());

    if (!matched) return initialPath;
    currentDir = path.resolve(currentDir, matched.name);
  }

  return currentDir;
}

/* ------------------------------ BEW router adapter ------------------------------ */

const BEW_PREFIXES = [
  '/casefiles',
  '/casefile',
  '/evidence',
  '/extractions',
  '/corners',
  '/decisions',
  '/traverse',
  '/package',
  '/packages',
  '/bew',
  '/api/bew',
];

function isBewPath(pathname) {
  const p = String(pathname || '/').replace(/\/+$/, '') || '/';
  return BEW_PREFIXES.some((pref) => p === pref || p.startsWith(pref + '/'));
}

function pickFirstFunction(mod, names) {
  for (const n of names) {
    const v = mod?.[n];
    if (typeof v === 'function') return v;
  }
  return null;
}

function pickFirstObject(mod, names) {
  for (const n of names) {
    const v = mod?.[n];
    if (v && typeof v === 'object') return v;
  }
  return null;
}

async function writeFetchResponse(res, response) {
  res.statusCode = Number(response.status) || 200;
  for (const [k, v] of response.headers.entries()) res.setHeader(k, v);
  const ab = await response.arrayBuffer();
  res.end(Buffer.from(ab));
}

function looksLikeFetchResponse(x) {
  return typeof Response !== 'undefined' && x instanceof Response;
}

function decorateBewExpressRequest(req, urlObj) {
  if (req && !req.query) {
    req.query = urlObj?.searchParams ? Object.fromEntries(urlObj.searchParams.entries()) : {};
  }
  if (req && !req.params) req.params = {};
  return req;
}

function decorateBewExpressResponse(res) {
  if (typeof res.status !== 'function') {
    res.status = (code) => {
      res.statusCode = Number(code) || 200;
      return res;
    };
  }
  if (typeof res.json !== 'function') {
    res.json = (payload) => {
      sendJson(res, res.statusCode || 200, payload);
      return res;
    };
  }
  if (typeof res.send !== 'function') {
    res.send = (payload) => {
      if (Buffer.isBuffer(payload) || payload instanceof Uint8Array) {
        if (!res.getHeader?.('content-type')) {
          res.setHeader('Content-Type', 'application/octet-stream');
        }
        res.end(payload);
        return res;
      }
      if (typeof payload === 'object' && payload !== null) {
        return res.json(payload);
      }
      if (!res.getHeader?.('content-type')) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      }
      res.end(payload == null ? '' : String(payload));
      return res;
    };
  }
  return res;
}

export function normalizeBewHandler(product) {
  if (!product) return null;

  // function handler
  if (typeof product === 'function') {
    const looksLikeExpressMiddleware =
      typeof product.handle === 'function' ||
      Array.isArray(product.stack);

    if (looksLikeExpressMiddleware) {
      return async (req, res, urlObj) => {
        decorateBewExpressRequest(req, urlObj);
        decorateBewExpressResponse(res);
        let nextCalled = false;
        await new Promise((resolve, reject) => {
          const next = (err) => {
            if (err) reject(err);
            else {
              nextCalled = true;
              resolve();
            }
          };

          try {
            product(req, res, next);
          } catch (err) {
            reject(err);
          }

          if (res.writableEnded) resolve();
        });

        if (res.writableEnded) return true;
        return !nextCalled;
      };
    }

    return async (req, res, urlObj, ctx) => {
      const beforeEnded = res.writableEnded;
      const out = await product(req, res, urlObj, ctx);
      if (res.writableEnded && !beforeEnded) return true;
      if (out === true) return true;
      if (out === false || out == null) return false;
      if (looksLikeFetchResponse(out)) {
        await writeFetchResponse(res, out);
        return true;
      }
      if (typeof out === 'object' && out?.handled === true) return true;
      return Boolean(res.writableEnded);
    };
  }

  // object with handler
  if (typeof product === 'object') {
    const fn =
      (typeof product.handle === 'function' && product.handle) ||
      (typeof product.handler === 'function' && product.handler) ||
      (typeof product.dispatch === 'function' && product.dispatch) ||
      null;

    if (fn) return normalizeBewHandler(fn);

    // routes array
    const routes = Array.isArray(product.routes) ? product.routes : (Array.isArray(product) ? product : null);
    if (routes) {
      return async (req, res, urlObj, ctx) => {
        const method = String(req.method || 'GET').toUpperCase();
        const pathname = urlObj.pathname.replace(/\/+$/, '') || '/';
        for (const r of routes) {
          const rm = String(r?.method || r?.verb || 'GET').toUpperCase();
          const rp = String(r?.path || r?.pathname || r?.pattern || '');
          const handler = r?.handler || r?.handle || r?.fn;
          if (!rp || typeof handler !== 'function') continue;
          if (rm !== method) continue;

          const match = matchRoute(pathname, rp);
          if (!match.ok) continue;

          const out = await handler({ req, res, url: urlObj, params: match.params, ctx });
          if (res.writableEnded) return true;
          if (out === true) return true;
          if (looksLikeFetchResponse(out)) {
            await writeFetchResponse(res, out);
            return true;
          }
          // if handler returned nothing but wrote to res, handled.
          if (res.writableEnded) return true;
        }
        return false;
      };
    }
  }

  return null;
}

function matchRoute(pathname, pattern) {
  const p = String(pattern || '').trim();
  if (!p) return { ok: false, params: {} };

  // exact
  if (!p.includes(':') && !p.includes('*')) {
    const ok = (pathname === p) || (pathname === p.replace(/\/+$/, ''));
    return { ok, params: {} };
  }

  const a = pathname.split('/').filter(Boolean);
  const b = p.split('/').filter(Boolean);

  const params = {};
  for (let i = 0, j = 0; i < a.length && j < b.length; i += 1, j += 1) {
    const token = b[j];
    if (token === '*') return { ok: true, params };
    if (token.startsWith(':')) {
      params[token.slice(1)] = a[i];
      continue;
    }
    if (token !== a[i]) return { ok: false, params: {} };
  }

  if (a.length === b.length) return { ok: true, params };
  if (b[b.length - 1] === '*') return { ok: true, params };
  return { ok: false, params: {} };
}

// singleton BEW runtime
let _bewPromise = null;
let _bewRuntime = null;

function findHerokuRedisUrl() {
  const direct =
    process.env.BEW_REDIS_URL ||
    process.env.REDIS_URL ||
    process.env.REDIS_TLS_URL ||
    process.env.REDISCLOUD_URL;

  if (direct) return direct;

  // scan env for anything that looks like a Heroku redis URL
  for (const [k, v] of Object.entries(process.env)) {
    if (!v) continue;
    if (!/URL$/i.test(k)) continue;
    if (!/REDIS/i.test(k)) continue;
    if (String(v).startsWith('redis://') || String(v).startsWith('rediss://')) return String(v);
  }
  return null;
}
function isIoredisLike(client) {
  return !!client && typeof client.multi === "function" && typeof client.zrevrange === "function";
}

async function ensureBew({ existingRedis = null } = {}) {
  if (_bewRuntime) return _bewRuntime;
  if (_bewPromise) return _bewPromise;

  _bewPromise = (async () => {
    const redisUrl = findHerokuRedisUrl();
    if (!isIoredisLike(existingRedis) && !redisUrl) {
      throw new Error('Missing Heroku Redis URL env (REDIS_URL / REDIS_TLS_URL / REDISCLOUD_URL).');
    }

    const maxWaitMs = Math.max(Number(process.env.BEW_REDIS_CONNECT_MAX_WAIT_MS) || Number(process.env.REDIS_CONNECT_MAX_WAIT_MS) || 15000, 0);
    const retryDelayMs = Math.max(Number(process.env.BEW_REDIS_CONNECT_RETRY_DELAY_MS) || Number(process.env.REDIS_CONNECT_RETRY_DELAY_MS) || 750, 50);

    let redis = null;
    let attempts = 0;
    let lastError = null;
    const startedAt = Date.now();

    if (isIoredisLike(existingRedis)) {
      redis = existingRedis;
    } else {
      while ((Date.now() - startedAt) <= maxWaitMs) {
        attempts += 1;
        const candidate = createBewRedisClient({ url: redisUrl });
        try {
          await candidate.connect(); // ensures listeners exist before TLS handshake
          redis = candidate;
          break;
        } catch (err) {
          lastError = err;
          if (typeof candidate.disconnect === 'function') {
            await candidate.disconnect().catch(() => {});
          } else if (typeof candidate.quit === 'function') {
            await candidate.quit().catch(() => {});
          }

          if ((Date.now() - startedAt) >= maxWaitMs) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }

      if (!redis) {
        const msg = lastError?.message || String(lastError || 'unknown redis connection error');
        throw new Error(`Unable to initialize BEW Redis after ${attempts} attempt(s): ${msg}`);
      }
    }

    const StoreCtor =
      BewStore.RedisBewStore ||
      BewStore.BewStore ||
      BewStore.Store ||
      (typeof BewStore.default === "function" ? BewStore.default : null);

    if (!StoreCtor) {
      throw new Error(
        `BEW store module missing RedisBewStore export. Exports: ${Object.keys(BewStore || {}).join(", ") || "(none)"}`
      );
    }

    const store = new StoreCtor(redis, {
      prefix: process.env.BEW_REDIS_PREFIX || "bew",
      attachmentMaxBytes: process.env.BEW_ATTACHMENT_MAX_BYTES ? Number(process.env.BEW_ATTACHMENT_MAX_BYTES) : undefined,
    });

    const createRoutes = pickFirstFunction(BewRoutes, [
      "registerBewRoutes",
      "createBewRoutes",
      "createBewRouter",
      "createRoutes",
      "createRouter",
      "default",
    ]);

    let routesProduct = null;
    if (createRoutes) {
      if (createRoutes === BewRoutes.registerBewRoutes) {
        const mounted = [];
        const pseudoApp = {
          use(handler) {
            mounted.push(handler);
            return this;
          },
        };
        const registered = await createRoutes(pseudoApp, store, { redis, redisUrl });
        routesProduct = registered || mounted[mounted.length - 1] || null;
      } else {
        routesProduct = await createRoutes({ store, redis, redisUrl });
      }
    } else {
      routesProduct =
        pickFirstFunction(BewRoutes, ["handle", "handler", "dispatch"]) ||
        pickFirstObject(BewRoutes, ["routes", "router", "api", "service", "default"]) ||
        (typeof BewRoutes.default === "function" ? BewRoutes.default : null);
    }

    const handler = normalizeBewHandler(routesProduct);
    if (!handler) {
      throw new Error(
        `BEW routes module did not provide a usable handler/factory. Exports: ${Object.keys(BewRoutes || {}).join(", ") || "(none)"}`
      );
    }

    const HttpError = BewStore.HttpError || null;

    _bewRuntime = {
      redisUrl: redisUrl || null,
      redis,
      store,
      HttpError,
      handler,
      close: async () => {
        // only quit if we created the client (not reusing existingRedis)
        if (!isIoredisLike(existingRedis) && redis && typeof redis.quit === "function") {
          try { await redis.quit(); } catch {}
        }
      },
    };

    return _bewRuntime;
  })();

  try {
    return await _bewPromise;
  } catch (err) {
    _bewPromise = null;
    throw err;
  }
}


function sendBewError(res, err) {
  const status = Number(err?.status);
  const statusCode = Number.isFinite(status) ? status : 500;
  const payload = {
    error: err?.message || 'BEW request failed.',
    code: err?.code || 'error',
    details: err?.details ?? undefined,
  };
  sendJson(res, statusCode, payload);
}

/* ------------------------------ server ------------------------------ */

export function createSurveyServer({
  client = new SurveyCadClient(),
  staticDir = DEFAULT_STATIC_DIR,
  rosOcrHandler,
  staticMapFetcher = fetch,
  localStorageSyncStore = new LocalStorageSyncStore(),
  evidenceDeskFileStore,
  pdfThumbnailRenderer = renderPdfThumbnailFromBuffer,
  idahoHarvestSupervisor = createIdahoHarvestSupervisor(),
  mapTileObjectStore = null,
} = {}) {
  let rosOcrHandlerPromise = rosOcrHandler ? Promise.resolve(rosOcrHandler) : null;

  const lineforgeCollab = createLineforgeCollabService();
  const localStorageSyncWsService = createLocalStorageSyncWsService({ store: localStorageSyncStore });
  const workerSocket = createWorkerSchedulerService();
  const crewPresence = createCrewPresenceWsService();
  const lmProxyRequestTimeoutMs = Number(process.env.LM_PROXY_REQUEST_TIMEOUT_MS);
  const lmProxy = createLmProxyHubWsService({
    path: "/ws/lmproxy",
    token: process.env.CONTROL_TOKEN || "",
    requestTimeoutMs: Number.isFinite(lmProxyRequestTimeoutMs)
      ? Math.max(0, lmProxyRequestTimeoutMs)
      : 0,
  });

  const pointforgeExportStore = new Map();
  const inMemoryPdfThumbnailCache = new Map();
  const inFlightPdfThumbnailGenerations = new Map();
  const pdfThumbnailFailures = new Map();
  const sharedRedisClient = (() => {
    if (typeof localStorageSyncStore?.getRedisClient === 'function') {
      return localStorageSyncStore.getRedisClient();
    }
    return localStorageSyncStore?.redisClient || localStorageSyncStore?.redis || localStorageSyncStore?.client || null;
  })();

  let evidenceDeskStorePromise = evidenceDeskFileStore
    ? Promise.resolve({ store: evidenceDeskFileStore, redisClient: null, type: 'custom' })
    : null;
  let mapTileStorePromise = mapTileObjectStore ? Promise.resolve(mapTileObjectStore) : null;

  const rawMapTileDatasets = String(process.env.MAPTILE_DATASETS || 'auto').trim().toLowerCase();
  const mapTileSettings = {
    bucket: String(process.env.IDAHO_HARVEST_MINIO_TILE_BUCKET || process.env.IDAHO_HARVEST_MINIO_DEFAULT_BUCKET || 'tile-server'),
    indexBucket: String(process.env.IDAHO_HARVEST_MINIO_INDEX_BUCKET || process.env.IDAHO_HARVEST_MINIO_DEFAULT_BUCKET || 'tile-server'),
    prefix: String(process.env.MAPTILE_MINIO_PREFIX || 'surveycad/idaho-harvest/tiles/id').replace(/\/+$/, ''),
    indexKey: String(process.env.MAPTILE_INDEX_KEY || 'surveycad/idaho-harvest/indexes/id-master-index.geojson'),
    datasets: rawMapTileDatasets && rawMapTileDatasets !== 'auto'
      ? rawMapTileDatasets.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
      : [],
  };

  async function resolveEvidenceDeskStore() {
    if (!evidenceDeskStorePromise) {
      evidenceDeskStorePromise = createEvidenceDeskFileStore({ redisClient: sharedRedisClient });
    }
    return evidenceDeskStorePromise;
  }

  async function resolveMapTileStore() {
    if (!mapTileStorePromise) {
      mapTileStorePromise = Promise.resolve().then(() => createIdahoHarvestObjectStoreFromEnv(process.env));
    }
    return mapTileStorePromise;
  }


  async function resolveMapTileDatasets() {
    if (mapTileSettings.datasets.length) return mapTileSettings.datasets;

    let mapTileStore;
    try {
      mapTileStore = await resolveMapTileStore();
    } catch {
      return [];
    }

    try {
      const payload = await mapTileStore.getObject(mapTileSettings.indexKey, { bucket: mapTileSettings.indexBucket });
      if (!payload) return [];
      const parsed = JSON.parse(Buffer.from(payload).toString('utf8'));
      const features = Array.isArray(parsed?.features) ? parsed.features : [];
      return [...new Set(features
        .map((feature) => String(feature?.properties?.dataset || '').trim().toLowerCase())
        .filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  }

  Promise.resolve()
    .then(() => resolveEvidenceDeskStore())
    .catch(() => {});

  function buildPdfThumbnailCacheKey(sourceUrl = '') {
    const hash = createHash('sha256').update(String(sourceUrl || '')).digest('hex');
    return `surveycad:pdf-thumb:v1:${hash}`;
  }

  async function readCachedPdfThumbnail(cacheKey, runtime) {
    if (typeof runtime?.store?.readCachedPdfThumbnail === 'function') {
      return runtime.store.readCachedPdfThumbnail(cacheKey);
    }
    const redisClient = runtime?.redisClient;
    if (redisClient && typeof redisClient.get === 'function') {
      const encoded = await redisClient.get(cacheKey);
      if (!encoded) return null;
      return Buffer.from(encoded, 'base64');
    }
    return inMemoryPdfThumbnailCache.get(cacheKey) || null;
  }

  async function writeCachedPdfThumbnail(cacheKey, pngBuffer, runtime) {
    if (typeof runtime?.store?.writeCachedPdfThumbnail === 'function') {
      await runtime.store.writeCachedPdfThumbnail(cacheKey, pngBuffer);
      return;
    }
    const redisClient = runtime?.redisClient;
    if (redisClient && typeof redisClient.set === 'function') {
      await redisClient.set(cacheKey, Buffer.from(pngBuffer).toString('base64'), { EX: PDF_THUMBNAIL_CACHE_TTL_SECONDS });
      return;
    }
    inMemoryPdfThumbnailCache.set(cacheKey, Buffer.from(pngBuffer));
  }

  function parsePdfThumbnailSource(urlObj) {
    const source = String(urlObj.searchParams.get('source') || '').trim();
    if (!source) throw new Error('source query parameter is required.');
    const normalizedSource = (() => {
      if (source.startsWith('/')) return source;
      let parsed;
      try {
        parsed = new URL(source);
      } catch {
        throw new Error('source must be a relative /api URL or an absolute http(s) URL.');
      }
      if (!/^https?:$/i.test(parsed.protocol)) {
        throw new Error('source absolute URL protocol must be http or https.');
      }
      return `${parsed.pathname}${parsed.search}`;
    })();
    if (!normalizedSource.startsWith('/api/project-files/download') && !normalizedSource.startsWith('/api/ros-pdf')) {
      throw new Error('source must target /api/project-files/download or /api/ros-pdf.');
    }
    return normalizedSource;
  }

  async function fetchPdfSourceBuffer(sourceUrl, runtime) {
    const sourceObj = new URL(sourceUrl, 'http://localhost');
    if (sourceObj.pathname === '/api/project-files/download') {
      const projectId = sourceObj.searchParams.get('projectId');
      const folderKey = sourceObj.searchParams.get('folderKey');
      const requestedFileName = sourceObj.searchParams.get('fileName');
      if (!projectId || !folderKey || !requestedFileName) throw createHttpError(400, 'Invalid project file download source URL.');
      const file = await runtime.store.getFile(projectId, folderKey, path.basename(requestedFileName));
      if (!file?.buffer) throw createHttpError(404, 'PDF source file not found.');
      return file.buffer;
    }

    if (sourceObj.pathname === '/api/ros-pdf') {
      const remoteUrl = parseRemotePdfUrl(sourceObj);
      const pdfResponse = await fetch(remoteUrl, {
        headers: {
          Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
          'User-Agent': 'SurveyCAD-ProjectBrowser/1.0 (+thumbnail)',
        },
      });
      if (!pdfResponse.ok) {
        throw createHttpError(502, `Could not fetch remote PDF for thumbnail generation: HTTP ${pdfResponse.status}`);
      }
      return Buffer.from(await pdfResponse.arrayBuffer());
    }

    throw createHttpError(400, 'Unsupported PDF thumbnail source path.');
  }

  async function findStoredProjectObjectFileName(runtime, projectId, folderKey, desiredFileName) {
    const listing = await runtime.store.listFiles(projectId, PROJECT_FILE_FOLDERS.map((folder) => folder.key));
    const files = Array.isArray(listing?.files) ? listing.files : [];
    const match = files.find((file) => file?.folderKey === folderKey && String(file?.fileName || '').endsWith(`-${desiredFileName}`));
    return match?.fileName || '';
  }

  async function upsertProjectObjectFile({
    projectId,
    folderKey,
    fileName,
    originalFileName,
    buffer,
    mimeType,
    extension,
  } = {}) {
    const runtime = await resolveEvidenceDeskStore();
    const storedFileName = await findStoredProjectObjectFileName(runtime, projectId, folderKey, fileName);
    if (storedFileName) {
      return runtime.store.updateFile({
        projectId,
        folderKey,
        fileName: storedFileName,
        originalFileName,
        buffer,
        extension,
        mimeType,
      });
    }
    return runtime.store.createFile({
      projectId,
      folderKey,
      originalFileName,
      buffer,
      extension,
      mimeType,
    });
  }

  async function persistLineSmithDrawingObject(projectId, drawing) {
    const drawingId = String(drawing?.drawingId || '').trim();
    if (!drawingId || !drawing?.currentState || typeof drawing.currentState !== 'object') return;
    const fileName = buildLineSmithDrawingObjectName(drawingId);
    const payload = {
      schemaVersion: '1.0.0',
      projectId,
      drawingId,
      drawingName: drawing.drawingName || drawingId,
      updatedAt: drawing.updatedAt || new Date().toISOString(),
      drawingState: drawing.currentState,
    };
    await upsertProjectObjectFile({
      projectId,
      folderKey: 'drawings',
      fileName,
      originalFileName: fileName,
      buffer: Buffer.from(JSON.stringify(payload), 'utf8'),
      extension: 'json',
      mimeType: 'application/json; charset=utf-8',
    });
  }

  async function hydrateLineSmithDrawingFromObjectStore(projectId, drawing) {
    const drawingId = String(drawing?.drawingId || '').trim();
    if (!drawingId) return drawing;
    const runtime = await resolveEvidenceDeskStore();
    const fileName = buildLineSmithDrawingObjectName(drawingId);
    const storedFileName = await findStoredProjectObjectFileName(runtime, projectId, 'drawings', fileName);
    if (!storedFileName) return drawing;
    const existing = await runtime.store.getFile(projectId, 'drawings', storedFileName);
    if (!existing?.buffer) return drawing;
    try {
      const parsed = JSON.parse(existing.buffer.toString('utf8'));
      if (!parsed?.drawingState || typeof parsed.drawingState !== 'object') return drawing;
      return {
        ...drawing,
        currentState: parsed.drawingState,
      };
    } catch {
      return drawing;
    }
  }

  async function deleteLineSmithDrawingObject(projectId, drawingId) {
    if (!projectId || !drawingId) return;
    const runtime = await resolveEvidenceDeskStore();
    const fileName = buildLineSmithDrawingObjectName(drawingId);
    const storedFileName = await findStoredProjectObjectFileName(runtime, projectId, 'drawings', fileName);
    if (!storedFileName) return;
    await runtime.store.deleteFile(projectId, 'drawings', storedFileName);
  }

  async function persistPointFoundryPointFileObject(projectId, pointFile) {
    const pointFileId = String(pointFile?.pointFileId || '').trim();
    if (!pointFileId) return;
    const text = String(pointFile?.currentState?.text || '').trim();
    if (!text) return;
    const extension = String(pointFile?.exportFormat || pointFile?.currentState?.exportFormat || 'csv').trim().toLowerCase() || 'csv';
    const fileName = buildPointFoundryObjectName(pointFileId, extension);
    await upsertProjectObjectFile({
      projectId,
      folderKey: 'point-files',
      fileName,
      originalFileName: fileName,
      buffer: Buffer.from(text, 'utf8'),
      extension,
      mimeType: 'text/csv; charset=utf-8',
    });
  }

  async function hydratePointFoundryPointFileFromObjectStore(projectId, pointFile) {
    const pointFileId = String(pointFile?.pointFileId || '').trim();
    if (!pointFileId) return pointFile;
    const extension = String(pointFile?.exportFormat || pointFile?.currentState?.exportFormat || 'csv').trim().toLowerCase() || 'csv';
    const runtime = await resolveEvidenceDeskStore();
    const fileName = buildPointFoundryObjectName(pointFileId, extension);
    const storedFileName = await findStoredProjectObjectFileName(runtime, projectId, 'point-files', fileName);
    if (!storedFileName) return pointFile;
    const existing = await runtime.store.getFile(projectId, 'point-files', storedFileName);
    if (!existing?.buffer) return pointFile;
    return {
      ...pointFile,
      currentState: {
        ...(pointFile.currentState || {}),
        text: existing.buffer.toString('utf8'),
        exportFormat: extension,
      },
    };
  }

  async function deletePointFoundryPointFileObject(projectId, pointFileId) {
    if (!projectId || !pointFileId) return;
    const runtime = await resolveEvidenceDeskStore();
    const knownExtensions = ['csv', 'txt'];
    await Promise.all(knownExtensions.map(async (extension) => {
      const desiredFileName = buildPointFoundryObjectName(pointFileId, extension);
      const storedFileName = await findStoredProjectObjectFileName(runtime, projectId, 'point-files', desiredFileName);
      if (!storedFileName) return;
      await runtime.store.deleteFile(projectId, 'point-files', storedFileName);
    }));
  }

  const resolveStoreState = () => Promise.resolve(localStorageSyncStore.getState());
  const syncIncomingState = (payload) => Promise.resolve(localStorageSyncStore.syncIncoming(payload));
  const resolveFieldToFinishSettings = async () => {
    const existing = await getFieldToFinishSettings(localStorageSyncStore);
    if (existing) return existing;
    const config = await loadFldConfig(path.resolve(staticDir, 'config/MLS.fld'));
    const created = await upsertFieldToFinishSettings(localStorageSyncStore, {
      config,
      symbolSvgOverrides: {},
    });
    return created.settings;
  };

  // optional reuse: if your localStorage sync store exposes the ioredis client, BEW will share it
  const existingRedis = sharedRedisClient;

  // ensure BEW redis closes on server close (only if we created it)
  let bewCloseHookInstalled = false;
  let evidenceDeskCloseHookInstalled = false;

  if (idahoHarvestSupervisor && process.env.IDAHO_HARVEST_AUTOSTART === '1' && areWorkersEnabled(process.env)) {
    idahoHarvestSupervisor.start();
  }

  const server = createServer(async (req, res) => {
    if (!req.url) {
      sendJson(res, 400, { error: 'Missing request URL.' });
      return;
    }

    const urlObj = new URL(req.url, 'http://localhost');

    try {
      if (!evidenceDeskCloseHookInstalled && evidenceDeskStorePromise) {
        evidenceDeskCloseHookInstalled = true;
        const runtime = await evidenceDeskStorePromise.catch(() => null);
        if (runtime?.type === 'redis' && runtime.redisClient && typeof runtime.redisClient.quit === 'function') {
          server.on('close', () => { Promise.resolve(runtime.redisClient.quit()).catch(() => {}); });
        }
      }

      if (urlObj.pathname === '/extract') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Only POST is supported.' });
          return;
        }
        if (!rosOcrHandlerPromise) rosOcrHandlerPromise = createRosOcrApp();
        const app = await rosOcrHandlerPromise;
        app(req, res);
        return;
      }

      // --- BEW routes (casefiles, evidence, extractions, corners, decisions, traverse, package) ---
      if (isBewPath(urlObj.pathname)) {
        let bew;
        try {
          bew = await ensureBew({ existingRedis });
          if (!bewCloseHookInstalled) {
            bewCloseHookInstalled = true;
            server.on('close', () => { Promise.resolve(bew.close()).catch(() => {}); });
          }
        } catch (e) {
          // BEW is required for these paths; fail explicitly
          sendJson(res, 503, {
            error: 'BEW unavailable (Redis/routes init failed).',
            details: e?.message || String(e),
          });
          return;
        }

        try {
          const handled = await bew.handler(req, res, urlObj, { store: bew.store, redis: bew.redis, redisUrl: bew.redisUrl });
          if (handled || res.writableEnded) return;

          // If a BEW path reaches here, treat as not found rather than falling into static assets.
          sendJson(res, 404, { error: 'BEW endpoint not found.' });
          return;
        } catch (err) {
          // Prefer BEW HttpError shape (status/code/details)
          if (bew?.HttpError && err instanceof bew.HttpError) {
            sendBewError(res, err);
            return;
          }
          if (Number.isFinite(Number(err?.status)) && err?.message) {
            sendBewError(res, err);
            return;
          }
          sendJson(res, 500, { error: err?.message || String(err) });
          return;
        }
      }

      // --- Worker task submit (MUST be before the "Only GET is supported" gate) ---
      if (urlObj.pathname === '/api/worker/submit' || urlObj.pathname === '/api/worker/submit/') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Only POST is supported.' });
          return;
        }

        const body = await readJsonBody(req);

        const poolId = String(body.poolId || 'default');
        const kind = String(body.kind || '');
        const payload = body.payload ?? null;

        if (!kind) {
          sendJson(res, 400, { error: 'kind is required.' });
          return;
        }

        const workers = workerSocket.listWorkers(poolId);
        if (!workers.some(w => w.online)) {
          sendJson(res, 503, { error: 'No online workers in pool.', workers });
          return;
        }

        const p = workerSocket.submitTask(poolId, kind, payload);
        const taskId = p.taskId;

        try {
          const result = await p;
          sendJson(res, 200, { ok: true, taskId, result });
        } catch (err) {
          sendJson(res, 500, {
            ok: false,
            taskId,
            error: err?.message || String(err),
            details: err?.details ?? null,
          });
        }
        return;
      }

      // optional: list workers
      if (urlObj.pathname === '/api/worker/workers' || urlObj.pathname === '/api/worker/workers/') {
        const poolId = String(urlObj.searchParams.get('pool') || 'default');
        sendJson(res, 200, { workers: workerSocket.listWorkers(poolId) });
        return;
      }

      if (urlObj.pathname === '/api/fld-config') {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Only GET is supported.' });
          return;
        }
        const requestedPath = urlObj.searchParams.get('file') || 'config/MLS.fld';
        const safePath = requestedPath.replace(/^\/+/, '');
        const absolutePath = path.resolve(staticDir, safePath);
        if (!absolutePath.startsWith(path.resolve(staticDir))) {
          sendJson(res, 403, { error: 'Forbidden path.' });
          return;
        }
        const config = await loadFldConfig(absolutePath);
        sendJson(res, 200, config);
        return;
      }

      // --- PointForge export persistence ---
      if (urlObj.pathname === '/api/pointforge-exports' || urlObj.pathname === '/api/pointforge-exports/') {
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          if (!body || typeof body !== 'object') {
            sendJson(res, 400, { error: 'Request body must be a JSON object.' });
            return;
          }
          if (!body.modifiedCsv || typeof body.modifiedCsv !== 'string') {
            sendJson(res, 400, { error: 'modifiedCsv (string) is required.' });
            return;
          }
          const id = `pf-export-${Date.now()}-${randomUUID().slice(0, 8)}`;
          const record = {
            id,
            roomId: String(body.roomId || 'default'),
            originalCsv: typeof body.originalCsv === 'string' ? body.originalCsv : '',
            modifiedCsv: body.modifiedCsv,
            georeference: body.georeference || null,
            metadata: body.metadata || {},
            createdAt: new Date().toISOString(),
          };
          pointforgeExportStore.set(id, record);
          lineforgeCollab.broadcastToRoom(record.roomId, { type: 'pointforge-import', exportId: id, at: Date.now() });
          sendJson(res, 201, { export: record });
          return;
        }
        if (req.method === 'GET') {
          const id = urlObj.searchParams.get('id');
          if (id) {
            const record = pointforgeExportStore.get(id);
            if (!record) {
              sendJson(res, 404, { error: 'Export not found.' });
              return;
            }
            sendJson(res, 200, { export: record });
            return;
          }
          const roomId = urlObj.searchParams.get('room') || 'default';
          const exports = [];
          for (const record of pointforgeExportStore.values()) {
            if (record.roomId === roomId) exports.push(record);
          }
          exports.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
          sendJson(res, 200, { exports });
          return;
        }
        sendJson(res, 405, { error: 'Only GET and POST are supported.' });
        return;
      }


      if (urlObj.pathname === '/api/field-to-finish') {
        if (req.method === 'GET') {
          const settings = await resolveFieldToFinishSettings();
          sendJson(res, 200, { settings });
          return;
        }

        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
          const body = await readJsonBody(req);
          const result = await upsertFieldToFinishSettings(localStorageSyncStore, {
            config: body?.config,
            symbolSvgOverrides: body?.symbolSvgOverrides,
          });
          lineforgeCollab.broadcastToAllRooms({
            type: 'field-to-finish-updated',
            updatedAt: result.settings.updatedAt,
          });
          sendJson(res, result.created ? 201 : 200, { settings: result.settings });
          return;
        }

        if (req.method === 'DELETE') {
          const deleted = await clearFieldToFinishSettings(localStorageSyncStore);
          if (!deleted) {
            sendJson(res, 404, { error: 'Field-to-finish settings not found.' });
            return;
          }
          lineforgeCollab.broadcastToAllRooms({
            type: 'field-to-finish-updated',
            updatedAt: new Date().toISOString(),
          });
          sendJson(res, 200, { deleted: true });
          return;
        }

        sendJson(res, 405, { error: 'Supported methods: GET, POST, PUT, PATCH, DELETE.' });
        return;
      }

      if (urlObj.pathname === '/api/localstorage-sync') {
        if (req.method === 'GET') {
          sendJson(res, 200, await resolveStoreState());
          return;
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          const result = await syncIncomingState({ version: body.version, snapshot: body.snapshot });
          sendJson(res, 200, result);
          return;
        }
        sendJson(res, 405, { error: 'Only GET and POST are supported.' });
        return;
      }

      const drawingRoute = parseProjectDrawingRoute(urlObj.pathname);
      if (drawingRoute) {
        const { projectId, drawingId } = drawingRoute;

        if (req.method === 'GET' && !drawingId) {
          const drawings = await listProjectDrawings(localStorageSyncStore, projectId);
          sendJson(res, 200, { projectId, drawings });
          return;
        }

        if (req.method === 'GET' && drawingId) {
          const drawing = await getProjectDrawing(localStorageSyncStore, projectId, drawingId);
          if (!drawing) {
            sendJson(res, 404, { error: 'Drawing not found.' });
            return;
          }
          const objectHydratedDrawing = await hydrateLineSmithDrawingFromObjectStore(projectId, drawing);
          const hydratedDrawing = await hydrateDrawingStateFromLinkedPointFile(localStorageSyncStore, objectHydratedDrawing);
          sendJson(res, 200, { drawing: hydratedDrawing });
          return;
        }

        if ((req.method === 'POST' && !drawingId) || ((req.method === 'PUT' || req.method === 'PATCH') && drawingId)) {
          const body = await readJsonBody(req);
          const payloadDrawingId = drawingId || body.drawingId || body.drawingName;
          const existingDrawing = payloadDrawingId
            ? await getProjectDrawing(localStorageSyncStore, projectId, payloadDrawingId)
            : null;
          const hasDrawingState = hasDrawingStatePayload(body);
          const normalizedPointFileLink = body?.pointFileLink && typeof body.pointFileLink === 'object'
            ? {
              projectId: String(body.pointFileLink.projectId || projectId).trim(),
              pointFileId: normalizePointFileId(body.pointFileLink.pointFileId),
              pointFileName: String(body.pointFileLink.pointFileName || '').trim(),
            }
            : null;
          const shouldHydrateFromLinkedPointFile = !hasDrawingState && !!existingDrawing
            && !!normalizedPointFileLink?.projectId
            && !!normalizedPointFileLink?.pointFileId;
          if (shouldHydrateFromLinkedPointFile) {
            const hydratedSource = await hydrateDrawingStateFromLinkedPointFile(localStorageSyncStore, {
              ...existingDrawing,
              linkedPointFileProjectId: normalizedPointFileLink.projectId,
              linkedPointFileId: normalizedPointFileLink.pointFileId,
              linkedPointFileName: normalizedPointFileLink.pointFileName || normalizedPointFileLink.pointFileId,
            });
            if (hydratedSource?.currentState && typeof hydratedSource.currentState === 'object') {
              body.drawingState = hydratedSource.currentState;
            }
          }
          const result = await createOrUpdateProjectDrawing(localStorageSyncStore, {
            projectId,
            drawingId: payloadDrawingId,
            drawingName: body.drawingName,
            drawingState: body.drawingState,
            pointFileLink: body.pointFileLink,
          });
          const linkedPointFileReferenceChanged = !!existingDrawing && hasLinkedPointFileReferenceChanged(existingDrawing, result.drawing);
          const linkedPointFileSync = hasDrawingStatePayload(body) && !linkedPointFileReferenceChanged
            ? await syncDrawingLinkedPointFile(
              localStorageSyncStore,
              result.drawing,
              parsePointFileChangeContext(req, body, 'linesmith-drawing'),
            )
            : null;
          const hydratedDrawing = await hydrateDrawingStateFromLinkedPointFile(localStorageSyncStore, result.drawing);
          await persistLineSmithDrawingObject(projectId, hydratedDrawing);
          localStorageSyncWsService.broadcast({
            type: 'sync-differential-applied',
            operations: [
              ...(result?.sync?.allOperations || []),
              ...(linkedPointFileSync?.sync?.allOperations || []),
            ],
            state: {
              version: linkedPointFileSync?.sync?.state?.version || result?.sync?.state?.version,
              checksum: linkedPointFileSync?.sync?.state?.checksum || result?.sync?.state?.checksum,
            },
            originClientId: null,
            requestId: null,
          });
          sendJson(res, result.created ? 201 : 200, { drawing: hydratedDrawing });
          return;
        }

        if (req.method === 'DELETE' && drawingId) {
          const deletedResult = await deleteProjectDrawing(localStorageSyncStore, projectId, drawingId);
          if (!deletedResult) {
            sendJson(res, 404, { error: 'Drawing not found.' });
            return;
          }
          await deleteLineSmithDrawingObject(projectId, drawingId);
          localStorageSyncWsService.broadcast({
            type: 'sync-differential-applied',
            operations: deletedResult?.sync?.allOperations || [],
            state: {
              version: deletedResult?.sync?.state?.version,
              checksum: deletedResult?.sync?.state?.checksum,
            },
            originClientId: null,
            requestId: null,
          });
          sendJson(res, 200, { deleted: true });
          return;
        }

        sendJson(res, 405, { error: 'Supported methods: GET, POST, PUT, PATCH, DELETE.' });
        return;
      }


      const projectWorkbenchRoute = parseProjectWorkbenchRoute(urlObj.pathname);
      if (projectWorkbenchRoute) {
        const { projectId, action, traverseId } = projectWorkbenchRoute;

        if (req.method === 'GET' && (!action || action === 'link')) {
          const link = await getProjectWorkbenchLink(localStorageSyncStore, projectId);
          if (!link) {
            sendJson(res, 200, { projectId, link: null, casefile: null });
            return;
          }
          const bew = await ensureBew({ existingRedis });
          const casefile = await bew.store.getCasefile(link.casefileId);
          sendJson(res, 200, { projectId, link, casefile });
          return;
        }

        if (req.method === 'PUT' && action === 'link') {
          const body = await readJsonBody(req);
          const casefileId = String(body?.casefileId || '').trim();
          if (!casefileId) {
            sendJson(res, 400, { error: 'casefileId is required.' });
            return;
          }
          const bew = await ensureBew({ existingRedis });
          await bew.store.getCasefile(casefileId);
          const result = await setProjectWorkbenchLink(localStorageSyncStore, projectId, casefileId);
          localStorageSyncWsService.broadcast({
            type: 'sync-differential-applied',
            operations: result?.sync?.allOperations || [],
            state: {
              version: result?.sync?.state?.version,
              checksum: result?.sync?.state?.checksum,
            },
            originClientId: null,
            requestId: null,
          });
          sendJson(res, 200, { projectId, link: result.link });
          return;
        }

        if (req.method === 'DELETE' && action === 'link') {
          const result = await clearProjectWorkbenchLink(localStorageSyncStore, projectId);
          if (result.sync) {
            localStorageSyncWsService.broadcast({
              type: 'sync-differential-applied',
              operations: result?.sync?.allOperations || [],
              state: {
                version: result?.sync?.state?.version,
                checksum: result?.sync?.state?.checksum,
              },
              originClientId: null,
              requestId: null,
            });
          }
          sendJson(res, 200, { projectId, deleted: result.deleted });
          return;
        }

        if (req.method === 'POST' && (action === 'casefile' || action === 'sync' || action === '')) {
          const body = await readJsonBody(req);
          const bew = await ensureBew({ existingRedis });
          let link = await getProjectWorkbenchLink(localStorageSyncStore, projectId);
          let casefile = null;

          if (action === 'casefile' || !link || body?.forceNewCasefile === true) {
            const projectMeta = await getProjectMetadata(localStorageSyncStore, projectId);
            const created = await bew.store.createCasefile({
              name: String(body?.name || `${projectMeta.name} Workbench`).trim(),
              jurisdiction: [projectMeta.county, projectMeta.state].filter(Boolean).join(', ') || 'Idaho',
              notes: projectMeta.address || projectMeta.notes || '',
              initializeDefaults: body?.initializeDefaults !== false,
            });
            const linked = await setProjectWorkbenchLink(localStorageSyncStore, projectId, created.id);
            link = linked.link;
            localStorageSyncWsService.broadcast({
              type: 'sync-differential-applied',
              operations: linked?.sync?.allOperations || [],
              state: {
                version: linked?.sync?.state?.version,
                checksum: linked?.sync?.state?.checksum,
              },
              originClientId: null,
              requestId: null,
            });
            casefile = created;
          } else {
            casefile = await bew.store.getCasefile(link.casefileId);
          }

          const sources = await collectProjectWorkbenchSources(localStorageSyncStore, projectId, {
            uploadsDir: UPLOADS_DIR,
            validFolderKeys: VALID_FOLDER_KEYS,
          });
          const sync = await syncProjectSourcesToCasefile(bew.store, link.casefileId, projectId, sources);
          casefile = await bew.store.getCasefile(link.casefileId);
          sendJson(res, 200, { projectId, link, casefile, sync, sources });
          return;
        }

        if (req.method === 'DELETE' && action === 'casefile') {
          const bew = await ensureBew({ existingRedis });
          const link = await getProjectWorkbenchLink(localStorageSyncStore, projectId);
          if (!link?.casefileId) {
            sendJson(res, 404, { error: 'No linked casefile found for project.' });
            return;
          }
          await bew.store.deleteCasefile(link.casefileId);
          const unlinked = await clearProjectWorkbenchLink(localStorageSyncStore, projectId);
          if (unlinked.sync) {
            localStorageSyncWsService.broadcast({
              type: 'sync-differential-applied',
              operations: unlinked?.sync?.allOperations || [],
              state: {
                version: unlinked?.sync?.state?.version,
                checksum: unlinked?.sync?.state?.checksum,
              },
              originClientId: null,
              requestId: null,
            });
          }
          sendJson(res, 200, { projectId, deleted: true });
          return;
        }

        if (req.method === 'GET' && action === 'sources') {
          const sources = await collectProjectWorkbenchSources(localStorageSyncStore, projectId, {
            uploadsDir: UPLOADS_DIR,
            validFolderKeys: VALID_FOLDER_KEYS,
          });
          sendJson(res, 200, { projectId, sources });
          return;
        }

        if (req.method === 'GET' && action === 'traverses') {
          const bew = await ensureBew({ existingRedis });
          const traverses = await listProjectTraverses(localStorageSyncStore, projectId);
          const hydrated = [];
          for (const traverse of traverses) {
            try {
              const casefile = await bew.store.getCasefile(traverse.casefileId);
              hydrated.push({
                ...traverse,
                casefileId: casefile.id,
                name: traverse.name || casefile.meta?.name || 'Untitled Traverse',
                casefileName: casefile.meta?.name || traverse.name || 'Untitled Traverse',
                updatedAt: casefile.meta?.updatedAt || traverse.updatedAt,
              });
            } catch {
              // skip stale records that reference deleted casefiles
            }
          }
          sendJson(res, 200, { projectId, traverses: hydrated });
          return;
        }

        if (req.method === 'GET' && action.startsWith('traverses/') && traverseId) {
          const bew = await ensureBew({ existingRedis });
          const traverses = await listProjectTraverses(localStorageSyncStore, projectId);
          const selected = traverses.find((item) => item.traverseId === traverseId);
          if (!selected) {
            sendJson(res, 404, { error: 'Traverse not found.' });
            return;
          }
          const casefile = await bew.store.getCasefile(selected.casefileId);
          const rawTraverse = await bew.store.getTraverseConfig(selected.casefileId);
          const traverse = await hydrateBoundaryLabTraverseCalls({
            store: bew.store,
            casefileId: selected.casefileId,
            traverse: rawTraverse,
          });
          sendJson(res, 200, {
            projectId,
            traverseId: selected.traverseId,
            name: selected.name,
            casefile,
            traverse,
          });
          return;
        }

        if (req.method === 'POST' && action === 'traverses') {
          const body = await readJsonBody(req);
          const name = String(body?.name || '').trim();
          if (!name) {
            sendJson(res, 400, { error: 'name is required.' });
            return;
          }

          const inputCalls = Array.isArray(body?.calls)
            ? body.calls
            : Array.isArray(body?.traverse?.calls)
              ? body.traverse.calls
              : [];
          const normalizedCalls = normalizeBoundaryLabCalls(inputCalls);

          const traversePayload = {
            start: {
              N: Number(body?.traverse?.start?.N ?? body?.start?.N ?? 10000),
              E: Number(body?.traverse?.start?.E ?? body?.start?.E ?? 10000),
            },
            basis: {
              label: String(body?.traverse?.basis?.label ?? body?.basis?.label ?? 'BASIS'),
              rotationDeg: Number(body?.traverse?.basis?.rotationDeg ?? body?.basis?.rotationDeg ?? 0),
            },
            calls: normalizedCalls,
          };

          const bew = await ensureBew({ existingRedis });
          let casefileId = String(body?.casefileId || '').trim();
          let casefile;
          if (casefileId) {
            casefile = await bew.store.updateCasefile(casefileId, { meta: { name } });
          } else {
            let linkedCasefileId = '';
            try {
              const link = await getProjectWorkbenchLink(localStorageSyncStore, projectId);
              linkedCasefileId = String(link?.casefileId || '').trim();
            } catch {
              linkedCasefileId = '';
            }

            if (linkedCasefileId) {
              casefile = await bew.store.duplicateCasefile(linkedCasefileId, { name });
            } else {
              casefile = await bew.store.createCasefile({
                name,
                notes: `BoundaryLab traverse for project ${projectId}`,
                initializeDefaults: true,
              });
            }
            casefileId = casefile.id;
          }

          const traverseCallIds = await persistBoundaryLabTraverseCalls({
            store: bew.store,
            casefileId,
            calls: normalizedCalls,
          });
          traversePayload.calls = traverseCallIds;

          await bew.store.updateTraverseConfig(casefileId, traversePayload);
          const result = await upsertProjectTraverseRecord(localStorageSyncStore, projectId, {
            traverseId: String(body?.traverseId || casefileId),
            casefileId,
            name,
          });
          localStorageSyncWsService.broadcast({
            type: 'sync-differential-applied',
            operations: result?.sync?.allOperations || [],
            state: {
              version: result?.sync?.state?.version,
              checksum: result?.sync?.state?.checksum,
            },
            originClientId: null,
            requestId: null,
          });

          const rawTraverse = await bew.store.getTraverseConfig(casefileId);
          const traverse = await hydrateBoundaryLabTraverseCalls({
            store: bew.store,
            casefileId,
            traverse: rawTraverse,
          });
          sendJson(res, body?.casefileId ? 200 : 201, {
            projectId,
            traverseId: result.traverse?.traverseId,
            name: result.traverse?.name,
            casefileId,
            traverse,
          });
          return;
        }

        sendJson(res, 405, { error: 'Supported methods: GET, POST, PUT, DELETE.' });
        return;
      }

      const pointFileRoute = parseProjectPointFileRoute(urlObj.pathname);
      if (pointFileRoute) {
        const { projectId, pointFileId } = pointFileRoute;

        if (req.method === 'GET' && !pointFileId) {
          const pointFiles = await listProjectPointFiles(localStorageSyncStore, projectId);
          sendJson(res, 200, { projectId, pointFiles });
          return;
        }

        if (req.method === 'GET' && pointFileId) {
          const versionId = String(urlObj.searchParams.get('versionId') || '').trim();
          const pointFile = versionId
            ? await getProjectPointFileAtVersion(localStorageSyncStore, projectId, pointFileId, versionId)
            : await getProjectPointFile(localStorageSyncStore, projectId, pointFileId);
          if (!pointFile) {
            sendJson(res, 404, { error: versionId ? 'Point file version not found.' : 'Point file not found.' });
            return;
          }
          const objectHydratedPointFile = versionId
            ? pointFile
            : await hydratePointFoundryPointFileFromObjectStore(projectId, pointFile);
          sendJson(res, 200, { pointFile: objectHydratedPointFile });
          return;
        }

        if ((req.method === 'POST' && !pointFileId) || ((req.method === 'PUT' || req.method === 'PATCH') && pointFileId)) {
          const body = await readJsonBody(req);
          const payloadPointFileId = pointFileId || body.pointFileId || body.pointFileName;
          const result = await createOrUpdateProjectPointFile(localStorageSyncStore, {
            projectId,
            pointFileId: payloadPointFileId,
            pointFileName: body.pointFileName,
            pointFileState: body.pointFileState,
            source: body.source,
            sourceLabel: body.sourceLabel,
            changeContext: parsePointFileChangeContext(req, body, 'point-file-api'),
          });
          await persistPointFoundryPointFileObject(projectId, result.pointFile);
          localStorageSyncWsService.broadcast({
            type: 'sync-differential-applied',
            operations: result?.sync?.allOperations || [],
            state: {
              version: result?.sync?.state?.version,
              checksum: result?.sync?.state?.checksum,
            },
            originClientId: null,
            requestId: null,
          });
          sendJson(res, result.created ? 201 : 200, { pointFile: result.pointFile });
          return;
        }

        if (req.method === 'DELETE' && pointFileId) {
          const deletedResult = await deleteProjectPointFile(localStorageSyncStore, projectId, pointFileId);
          if (!deletedResult) {
            sendJson(res, 404, { error: 'Point file not found.' });
            return;
          }
          await deletePointFoundryPointFileObject(projectId, pointFileId);
          localStorageSyncWsService.broadcast({
            type: 'sync-differential-applied',
            operations: deletedResult?.sync?.allOperations || [],
            state: {
              version: deletedResult?.sync?.state?.version,
              checksum: deletedResult?.sync?.state?.checksum,
            },
            originClientId: null,
            requestId: null,
          });
          sendJson(res, 200, { deleted: true });
          return;
        }

        sendJson(res, 405, { error: 'Supported methods: GET, POST, PUT, PATCH, DELETE.' });
        return;
      }

      if (urlObj.pathname === '/api/crew' || urlObj.pathname === '/api/crew/') {
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          const hasPreferredDrawingUpdate = body && typeof body === 'object'
            && body.id
            && body.lineSmithActiveDrawingByProject
            && typeof body.lineSmithActiveDrawingByProject === 'object'
            && !Array.isArray(body.lineSmithActiveDrawingByProject);
          if (!body || typeof body !== 'object' || ((!body.firstName && !body.lastName) && !hasPreferredDrawingUpdate)) {
            sendJson(res, 400, { error: 'firstName or lastName is required unless updating an existing member preference by id.' });
            return;
          }
          const member = {
            id: body.id || randomUUID(),
            firstName: body.firstName || '',
            lastName: body.lastName || '',
            jobTitle: body.jobTitle || '',
            phone: body.phone || '',
            email: body.email || '',
            certifications: body.certifications || '',
            notes: body.notes || '',
            roles: Array.isArray(body.roles) ? body.roles : [],
            photo: body.photo || null,
            lineSmithActiveDrawingByProject: body.lineSmithActiveDrawingByProject && typeof body.lineSmithActiveDrawingByProject === 'object' && !Array.isArray(body.lineSmithActiveDrawingByProject)
              ? Object.fromEntries(Object.entries(body.lineSmithActiveDrawingByProject).map(([projectId, drawingId]) => [
                String(projectId || '').trim(),
                String(drawingId || '').trim(),
              ]).filter(([projectId, drawingId]) => projectId && drawingId))
              : undefined,
            createdAt: body.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          const result = await saveCrewMember(localStorageSyncStore, member);
          localStorageSyncWsService.broadcast({
            type: 'sync-differential-applied',
            operations: result.operations,
            state: { version: result.state.version, checksum: result.state.checksum },
            originClientId: null,
            requestId: null,
          });
          sendJson(res, 201, { member });
          return;
        }
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Only GET and POST are supported.' });
          return;
        }
        const state = await resolveStoreState();
        const profiles = getCrewProfiles(state.snapshot);
        const id = urlObj.searchParams.get('id');
        if (id) {
          const member = findCrewMemberById(state.snapshot, id);
          sendJson(res, member ? 200 : 404, member ? { member } : { error: 'Crew member not found.' });
          return;
        }
        sendJson(res, 200, { crew: profiles });
        return;
      }

      if (urlObj.pathname === '/api/crew-presence' || urlObj.pathname === '/api/crew-presence/') {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Only GET is supported.' });
          return;
        }
        sendJson(res, 200, { online: crewPresence.getOnlineCrewMemberIds() });
        return;
      }

      if (urlObj.pathname === '/api/equipment' || urlObj.pathname === '/api/equipment/') {
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          if (!body || typeof body !== 'object' || (!body.make && !body.model)) {
            sendJson(res, 400, { error: 'make or model is required.' });
            return;
          }
          const item = {
            id: body.id || randomUUID(),
            make: body.make || '',
            model: body.model || '',
            equipmentType: body.equipmentType || '',
            serialNumber: body.serialNumber || '',
            createdAt: body.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          const result = await saveEquipmentItem(localStorageSyncStore, item);
          localStorageSyncWsService.broadcast({
            type: 'sync-differential-applied',
            operations: result.operations,
            state: { version: result.state.version, checksum: result.state.checksum },
            originClientId: null,
            requestId: null,
          });
          sendJson(res, 201, { equipment: item });
          return;
        }
        if (req.method === 'DELETE') {
          const id = urlObj.searchParams.get('id');
          if (!id) {
            sendJson(res, 400, { error: 'id is required.' });
            return;
          }
          const result = await deleteEquipmentItem(localStorageSyncStore, id);
          if (!result) {
            sendJson(res, 404, { error: 'Equipment not found.' });
            return;
          }
          localStorageSyncWsService.broadcast({
            type: 'sync-differential-applied',
            operations: result.operations,
            state: { version: result.state.version, checksum: result.state.checksum },
            originClientId: null,
            requestId: null,
          });
          sendJson(res, 200, { deleted: true, id });
          return;
        }
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Only GET, POST, and DELETE are supported.' });
          return;
        }
        const state = await resolveStoreState();
        const inventory = getEquipmentInventory(state.snapshot);
        const id = urlObj.searchParams.get('id');
        if (id) {
          const item = findEquipmentById(state.snapshot, id);
          sendJson(res, item ? 200 : 404, item ? { equipment: item } : { error: 'Equipment not found.' });
          return;
        }
        sendJson(res, 200, { equipment: inventory });
        return;
      }

      if (urlObj.pathname === '/api/equipment-logs' || urlObj.pathname === '/api/equipment-logs/') {
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          if (!body || typeof body !== 'object' || (!body.rodman && !body.jobFileName)) {
            sendJson(res, 400, { error: 'rodman or jobFileName is required.' });
            return;
          }
          const log = {
            id: body.id || randomUUID(),
            rodman: body.rodman || '',
            equipmentHeight: body.equipmentHeight || '',
            referencePoint: body.referencePoint || '',
            setupTime: body.setupTime || '',
            teardownTime: body.teardownTime || '',
            jobFileName: body.jobFileName || '',
            equipmentType: body.equipmentType || '',
            notes: body.notes || '',
            pointFileId: body.pointFileId || '',
            pointFileName: body.pointFileName || '',
            pointFileProjectId: body.pointFileProjectId || '',
            createdAt: body.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          const result = await saveEquipmentLog(localStorageSyncStore, log);
          localStorageSyncWsService.broadcast({
            type: 'sync-differential-applied',
            operations: result.operations,
            state: { version: result.state.version, checksum: result.state.checksum },
            originClientId: null,
            requestId: null,
          });
          sendJson(res, 201, { log });
          return;
        }
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Only GET and POST are supported.' });
          return;
        }
        const state = await resolveStoreState();
        const logs = getEquipmentLogs(state.snapshot);
        const id = urlObj.searchParams.get('id');
        if (id) {
          const log = findEquipmentLogById(state.snapshot, id);
          sendJson(res, log ? 200 : 404, log ? { log } : { error: 'Equipment log not found.' });
          return;
        }
        sendJson(res, 200, { logs });
        return;
      }

      if (urlObj.pathname === '/api/project-files/upload') {
        if (req.method !== 'POST' && req.method !== 'PUT') {
          sendJson(res, 405, { error: 'Only POST and PUT are supported.' });
          return;
        }
        const declaredBytes = parseContentLength(req);
        if (declaredBytes !== null && declaredBytes > MAX_UPLOAD_FILE_BYTES + 1024 * 1024) {
          sendJson(res, 413, { error: `File exceeds maximum size of ${MAX_UPLOAD_FILE_BYTES} bytes.` });
          return;
        }
        const { fields, fileBuffer, fileName, fileMimeType } = await parseMultipartUpload(req);
        const projectId = fields.projectId;
        const folderKey = fields.folderKey;
        const targetFileName = fields.fileName;
        const rosNumber = String(fields.rosNumber || '').trim();
        const pointNumber = String(fields.pointNumber || '').trim();
        if (!projectId || !folderKey) {
          sendJson(res, 400, { error: 'projectId and folderKey are required fields.' });
          return;
        }
        if (!VALID_FOLDER_KEYS.has(folderKey)) {
          sendJson(res, 400, { error: `Invalid folderKey. Must be one of: ${[...VALID_FOLDER_KEYS].join(', ')}` });
          return;
        }
        if (!fileBuffer || !fileName) {
          sendJson(res, 400, { error: 'A file must be included in the upload.' });
          return;
        }
        if (fileBuffer.length > MAX_UPLOAD_FILE_BYTES) {
          sendJson(res, 400, { error: `File exceeds maximum size of ${MAX_UPLOAD_FILE_BYTES} bytes.` });
          return;
        }
        const ext = path.extname(sanitizeFileName(fileName)).replace(/^\./, '').toLowerCase() || 'bin';
        const effectiveMimeType = fileMimeType || 'application/octet-stream';
        let thumbnailBuffer = null;
        if (canGenerateImageThumbnail({ extension: ext, mimeType: effectiveMimeType })) {
          try {
            thumbnailBuffer = await renderImageThumbnailFromBuffer(fileBuffer);
          } catch {}
        }
        const { store } = await resolveEvidenceDeskStore();

        if (req.method === 'PUT') {
          if (!targetFileName) {
            sendJson(res, 400, { error: 'fileName is required when updating an existing upload.' });
            return;
          }
          const resource = await store.updateFile({
            projectId,
            folderKey,
            fileName: path.basename(targetFileName),
            originalFileName: fileName,
            buffer: fileBuffer,
            extension: ext,
            mimeType: effectiveMimeType,
            rosNumber,
            pointNumber,
            thumbnailBuffer,
            thumbnailMimeType: thumbnailBuffer ? 'image/png' : null,
          });
          if (!resource) {
            sendJson(res, 404, { error: 'File not found.' });
            return;
          }
          sendJson(res, 200, { resource });
          return;
        }

        const resource = await store.createFile({
          projectId,
          folderKey,
          originalFileName: fileName,
          buffer: fileBuffer,
          extension: ext,
          mimeType: effectiveMimeType,
          rosNumber,
          pointNumber,
          thumbnailBuffer,
          thumbnailMimeType: thumbnailBuffer ? 'image/png' : null,
        });

        sendJson(res, 201, { resource });
        return;
      }

      if (urlObj.pathname === '/api/project-files/download') {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Only GET is supported.' });
          return;
        }
        const projectId = urlObj.searchParams.get('projectId');
        const folderKey = urlObj.searchParams.get('folderKey');
        const requestedFileName = urlObj.searchParams.get('fileName');
        if (!projectId || !folderKey || !requestedFileName) {
          sendJson(res, 400, { error: 'projectId, folderKey, and fileName are required.' });
          return;
        }
        if (!VALID_FOLDER_KEYS.has(folderKey)) {
          sendJson(res, 400, { error: 'Invalid folderKey.' });
          return;
        }
        const safeName = path.basename(requestedFileName);
        const { store } = await resolveEvidenceDeskStore();
        const file = await store.getFile(projectId, folderKey, safeName);
        if (!file) {
          sendJson(res, 404, { error: 'File not found.' });
          return;
        }
        const ext = path.extname(safeName).toLowerCase();
        res.statusCode = 200;
        res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.end(file.buffer);
        return;
      }


      if (urlObj.pathname === '/api/project-files/image-thumbnail') {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Only GET is supported.' });
          return;
        }
        const projectId = urlObj.searchParams.get('projectId');
        const folderKey = urlObj.searchParams.get('folderKey');
        const requestedFileName = urlObj.searchParams.get('fileName');
        if (!projectId || !folderKey || !requestedFileName) {
          sendJson(res, 400, { error: 'projectId, folderKey, and fileName are required.' });
          return;
        }
        if (!VALID_FOLDER_KEYS.has(folderKey)) {
          sendJson(res, 400, { error: 'Invalid folderKey.' });
          return;
        }
        const { store } = await resolveEvidenceDeskStore();
        const file = await store.getFile(projectId, folderKey, path.basename(requestedFileName));
        if (!file?.thumbnailBuffer) {
          sendJson(res, 404, { error: 'Thumbnail not found.' });
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', file.thumbnailMimeType || 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.end(file.thumbnailBuffer);
        return;
      }

      if (urlObj.pathname === '/api/project-files/pdf-thumbnail') {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Only GET is supported.' });
          return;
        }

        let sourceUrl = '';
        try {
          sourceUrl = parsePdfThumbnailSource(urlObj);
        } catch (error) {
          sendJson(res, 400, { error: error.message || 'Invalid source query parameter.' });
          return;
        }

        const runtime = await resolveEvidenceDeskStore();
        const cacheKey = buildPdfThumbnailCacheKey(sourceUrl);
        const cachedPng = await readCachedPdfThumbnail(cacheKey, runtime);
        if (cachedPng?.length) {
          pdfThumbnailFailures.delete(cacheKey);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.end(cachedPng);
          return;
        }

        const failure = pdfThumbnailFailures.get(cacheKey);
        if (failure && (Date.now() - failure.at) < PDF_THUMBNAIL_FAILURE_COOLDOWN_MS) {
          sendJson(res, failure.status, {
            error: 'Thumbnail generation failed.',
            status: 'failed',
            source: sourceUrl,
            detail: failure.message,
          });
          return;
        }

        if (!inFlightPdfThumbnailGenerations.has(cacheKey)) {
          const generationPromise = (async () => {
            try {
              const pdfBuffer = await fetchPdfSourceBuffer(sourceUrl, runtime);
              const pngBuffer = await pdfThumbnailRenderer(pdfBuffer, { width: PDF_THUMBNAIL_TARGET_WIDTH });
              await writeCachedPdfThumbnail(cacheKey, pngBuffer, runtime);
              pdfThumbnailFailures.delete(cacheKey);
            } catch (error) {
              pdfThumbnailFailures.set(cacheKey, {
                at: Date.now(),
                status: Number(error?.status) || 502,
                message: error?.message || 'Unknown thumbnail generation error.',
              });
            }
          })().finally(() => {
            inFlightPdfThumbnailGenerations.delete(cacheKey);
          });
          inFlightPdfThumbnailGenerations.set(cacheKey, generationPromise);
        }

        sendJson(res, 202, { status: 'generating', source: sourceUrl });
        return;
      }

      if (urlObj.pathname === '/api/project-files/file') {
        if (req.method !== 'DELETE' && req.method !== 'PATCH') {
          sendJson(res, 405, { error: 'Only DELETE and PATCH are supported.' });
          return;
        }
        const projectId = urlObj.searchParams.get('projectId');
        const folderKey = urlObj.searchParams.get('folderKey');
        const requestedFileName = urlObj.searchParams.get('fileName');
        if (!projectId || !folderKey || !requestedFileName) {
          sendJson(res, 400, { error: 'projectId, folderKey, and fileName are required.' });
          return;
        }
        if (!VALID_FOLDER_KEYS.has(folderKey)) {
          sendJson(res, 400, { error: 'Invalid folderKey.' });
          return;
        }
        const { store } = await resolveEvidenceDeskStore();

        if (req.method === 'DELETE') {
          const deleted = await store.deleteFile(projectId, folderKey, path.basename(requestedFileName));
          if (!deleted) {
            sendJson(res, 404, { error: 'File not found.' });
            return;
          }
          sendJson(res, 200, { deleted: true });
          return;
        }

        const body = await readJsonBody(req);
        const targetFolderKey = String(body?.targetFolderKey || '').trim();
        if (!targetFolderKey) {
          sendJson(res, 400, { error: 'targetFolderKey is required.' });
          return;
        }
        if (!VALID_FOLDER_KEYS.has(targetFolderKey)) {
          sendJson(res, 400, { error: 'Invalid targetFolderKey.' });
          return;
        }

        const movedResource = await store.moveFile(projectId, folderKey, path.basename(requestedFileName), targetFolderKey);
        if (!movedResource) {
          sendJson(res, 404, { error: 'File not found.' });
          return;
        }
        sendJson(res, 200, { moved: true, resource: movedResource });
        return;
      }

      if (urlObj.pathname === '/api/project-files/metadata') {
        if (req.method !== 'PATCH') {
          sendJson(res, 405, { error: 'Only PATCH is supported.' });
          return;
        }
        const projectId = urlObj.searchParams.get('projectId');
        const folderKey = urlObj.searchParams.get('folderKey');
        const requestedFileName = urlObj.searchParams.get('fileName');
        if (!projectId || !folderKey || !requestedFileName) {
          sendJson(res, 400, { error: 'projectId, folderKey, and fileName are required.' });
          return;
        }
        if (!VALID_FOLDER_KEYS.has(folderKey)) {
          sendJson(res, 400, { error: 'Invalid folderKey.' });
          return;
        }
        const body = await readJsonBody(req);
        const updates = {};
        if (Object.prototype.hasOwnProperty.call(body || {}, 'rosNumber')) {
          updates.rosNumber = String(body.rosNumber || '').trim();
        }
        if (Object.prototype.hasOwnProperty.call(body || {}, 'pointNumber')) {
          updates.pointNumber = String(body.pointNumber || '').trim();
        }
        if (!Object.keys(updates).length) {
          sendJson(res, 400, { error: 'At least one metadata field is required.' });
          return;
        }
        const { store } = await resolveEvidenceDeskStore();
        if (typeof store.updateFileMetadata !== 'function') {
          sendJson(res, 501, { error: 'Metadata updates are not supported by this store.' });
          return;
        }
        const resource = await store.updateFileMetadata(projectId, folderKey, path.basename(requestedFileName), updates);
        if (!resource) {
          sendJson(res, 404, { error: 'File not found.' });
          return;
        }
        sendJson(res, 200, { resource });
        return;
      }

      if (urlObj.pathname === '/api/project-files/list') {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Only GET is supported.' });
          return;
        }
        const projectId = urlObj.searchParams.get('projectId');
        if (!projectId) {
          sendJson(res, 400, { error: 'projectId is required.' });
          return;
        }
        const { store } = await resolveEvidenceDeskStore();
        const listing = await store.listFiles(projectId, [...VALID_FOLDER_KEYS]);
        sendJson(res, 200, listing);
        return;
      }

      if (urlObj.pathname === '/api/project-file/compile') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Only POST is supported.' });
          return;
        }
        const body = await readJsonBody(req);
        const projectFile = body.projectFile || createProjectFile(body.project || {});
        const archivePlan = await buildProjectArchivePlan(projectFile);
        sendJson(res, 200, { projectFile, archivePlan });
        return;
      }

      if (urlObj.pathname === '/api/idaho-harvest/start') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Only POST is supported.' });
          return;
        }
        if (!areWorkersEnabled(process.env)) {
          sendJson(res, 403, { error: 'Workers are disabled by WORKERS_ENABLED.' });
          return;
        }
        const status = idahoHarvestSupervisor?.start?.() || null;
        sendJson(res, 202, { worker: status });
        return;
      }

      if (urlObj.pathname === '/api/idaho-harvest/stop') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Only POST is supported.' });
          return;
        }
        const status = idahoHarvestSupervisor?.stop?.() || null;
        sendJson(res, 202, { worker: status });
        return;
      }


      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'Only GET is supported.' });
        return;
      }

      if (urlObj.pathname === '/health') {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (urlObj.pathname === '/api/apps') {
        sendJson(res, 200, { apps: listApps() });
        return;
      }

      if (urlObj.pathname === '/api/maptiles') {
        const origin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || 'localhost'}`;
        const datasetNames = await resolveMapTileDatasets();
        const datasets = datasetNames.map((dataset) => ({
          dataset,
          tilejson: `${origin}/api/maptiles/${encodeURIComponent(dataset)}/tilejson.json`,
          tiles: `${origin}/api/maptiles/${encodeURIComponent(dataset)}/{z}/{x}/{y}.geojson`,
        }));
        sendJson(res, 200, { datasets });
        return;
      }

      const mapTileRoute = parseMapTileRoute(urlObj.pathname);
      if (mapTileRoute) {
        const dataset = String(mapTileRoute.dataset || '').trim().toLowerCase();
        const knownDatasets = await resolveMapTileDatasets();
        if (!knownDatasets.includes(dataset)) {
          sendJson(res, 404, { error: `Unknown tile dataset: ${dataset}` });
          return;
        }

        const origin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || 'localhost'}`;
        if (mapTileRoute.isTileJson) {
          sendJson(res, 200, {
            tilejson: '3.0.0',
            name: `surveycad-idaho-${dataset}`,
            scheme: 'xyz',
            tiles: [`${origin}/api/maptiles/${encodeURIComponent(dataset)}/{z}/{x}/{y}.geojson`],
            minzoom: 0,
            maxzoom: 22,
          });
          return;
        }

        let mapTileStore;
        try {
          mapTileStore = await resolveMapTileStore();
        } catch {
          sendJson(res, 503, { error: 'Map tile object storage is not configured.' });
          return;
        }
        const objectKey = `${mapTileSettings.prefix}/${dataset}/${mapTileRoute.z}/${mapTileRoute.x}/${mapTileRoute.y}.geojson`;
        let payload;
        try {
          payload = await mapTileStore.getObject(objectKey, { bucket: mapTileSettings.bucket });
        } catch {
          sendJson(res, 404, { error: 'Map tile not found.' });
          return;
        }
        if (payload == null) {
          sendJson(res, 404, { error: 'Map tile not found.' });
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/geo+json; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=600');
        res.end(Buffer.from(payload));
        return;
      }

      if (urlObj.pathname === '/api/project-file/template') {
        const resourcesRaw = urlObj.searchParams.get('resources');
        let resources = [];
        if (resourcesRaw) {
          try {
            const parsed = JSON.parse(resourcesRaw);
            resources = Array.isArray(parsed) ? parsed : [];
          } catch {
            throw new Error('resources must be a JSON array when provided.');
          }
        }

        const projectFile = createProjectFile({
          projectId: urlObj.searchParams.get('projectId') || undefined,
          projectName: urlObj.searchParams.get('projectName') || undefined,
          client: urlObj.searchParams.get('client') || undefined,
          address: urlObj.searchParams.get('address') || undefined,
          resources,
        });
        sendJson(res, 200, { projectFile });
        return;
      }

      if (urlObj.pathname === '/api/lookup') {
        const address = urlObj.searchParams.get('address');
        if (!address) throw new Error('address query parameter is required.');
        const payload = await client.lookupByAddress(address);
        sendJson(res, 200, payload);
        return;
      }

      if (urlObj.pathname === '/api/geocode') {
        const address = urlObj.searchParams.get('address');
        if (!address) throw new Error('address query parameter is required.');
        const payload = await client.geocodeAddress(address);
        sendJson(res, 200, payload);
        return;
      }

      if (urlObj.pathname === '/api/utilities') {
        const address = urlObj.searchParams.get('address');
        if (!address) throw new Error('address query parameter is required.');
        const outSR = Number(urlObj.searchParams.get('outSR') || 2243);
        const sources = (urlObj.searchParams.get('sources') || 'power')
          .split(',')
          .map((source) => source.trim().toLowerCase())
          .filter(Boolean);
        const utilities = await client.lookupUtilityRecordsByAddress(address, { outSR, sources });
        sendJson(res, 200, { utilities, sources });
        return;
      }

      if (urlObj.pathname === '/api/glo-records') {
        const address = (urlObj.searchParams.get('address') || '').trim();
        const lonRaw = urlObj.searchParams.get('lon');
        const latRaw = urlObj.searchParams.get('lat');
        const hasLon = lonRaw !== null && lonRaw.trim() !== '';
        const hasLat = latRaw !== null && latRaw.trim() !== '';

        if (!address && !(hasLon && hasLat)) {
          throw new Error('address or both lon and lat query parameters are required.');
        }

        const payload = await client.lookupGloRecords({
          address,
          lon: hasLon ? Number(lonRaw) : undefined,
          lat: hasLat ? Number(latRaw) : undefined,
        });
        sendJson(res, 200, payload);
        return;
      }

      if (urlObj.pathname === '/api/static-map') {
        const { lon, lat } = parseLonLat(urlObj);
        const address = urlObj.searchParams.get('address') || '';
        const tile = lonLatToTile(lat, lon, 17);
        const satelliteTileUrl = `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${tile.zoom}/${tile.y}/${tile.x}`;
        const tileUrl = `https://tile.openstreetmap.org/${tile.zoom}/${tile.x}/${tile.y}.png`;
        const candidates = [satelliteTileUrl, tileUrl];

        try {
          for (const candidate of candidates) {
            let upstream;
            try {
              upstream = await staticMapFetcher(candidate, {
                headers: {
                  Accept: 'image/png,image/*;q=0.8,*/*;q=0.5',
                  'User-Agent': 'survey-cad/1.0 static-map-proxy',
                },
              });
            } catch { continue; }

            if (!upstream.ok) continue;

            const imageBuffer = Buffer.from(await upstream.arrayBuffer());
            res.statusCode = 200;
            res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=1800');
            res.end(imageBuffer);
            return;
          }

          throw new Error('No static map provider available');
        } catch {
          const fallbackSvg = buildFallbackStaticMapSvg(lat, lon, address);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
          res.setHeader('Cache-Control', 'public, max-age=300');
          res.end(fallbackSvg);
          return;
        }
      }

      if (urlObj.pathname === '/api/parcel') {
        const { lon, lat } = parseLonLat(urlObj);
        const outSR = Number(urlObj.searchParams.get('outSR') || 4326);
        const searchMeters = Number(urlObj.searchParams.get('searchMeters') || 40);
        const parcel = await client.findParcelNearPoint(lon, lat, outSR, searchMeters);
        sendJson(res, 200, { parcel });
        return;
      }

      if (urlObj.pathname === '/api/idaho-harvest/status' && req.method === 'GET') {
        sendJson(res, 200, { worker: idahoHarvestSupervisor?.getStatus?.() || null });
        return;
      }
      if (urlObj.pathname === '/api/section') {
        const { lon, lat } = parseLonLat(urlObj);
        const section = await client.loadSectionAtPoint(lon, lat);
        sendJson(res, 200, { section });
        return;
      }

      if (urlObj.pathname === '/api/aliquots') {
        const { lon, lat } = parseLonLat(urlObj);
        const outSR = Number(urlObj.searchParams.get('outSR') || 4326);
        const section = await client.loadSectionAtPoint(lon, lat);
        if (!section) {
          sendJson(res, 404, { error: 'No section found at requested coordinates.' });
          return;
        }
        const aliquots = await client.loadAliquotsInSection(section, outSR);
        sendJson(res, 200, { section, aliquots });
        return;
      }

      if (urlObj.pathname === '/api/subdivision') {
        const { lon, lat } = parseLonLat(urlObj);
        const outSR = Number(urlObj.searchParams.get('outSR') || 4326);
        let subdivision;
        try {
          subdivision = await client.loadSubdivisionAtPoint(lon, lat, outSR);
        } catch (err) {
          if (outSR !== 4326) subdivision = await client.loadSubdivisionAtPoint(lon, lat, 4326);
          else throw err;
        }
        sendJson(res, 200, { subdivision });
        return;
      }

      if (urlObj.pathname === '/api/ros-pdf') {
        const remoteUrl = parseRemotePdfUrl(urlObj);
        const pdfResponse = await fetch(remoteUrl, {
          headers: {
            Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
            'User-Agent': 'survey-cad/1.0',
          },
        });

        if (!pdfResponse.ok) throw new Error(`HTTP ${pdfResponse.status}: ${remoteUrl}`);

        const contentType = pdfResponse.headers.get('content-type') || 'application/pdf';
        const contentDisposition = pdfResponse.headers.get('content-disposition');
        const body = Buffer.from(await pdfResponse.arrayBuffer());

        res.statusCode = 200;
        res.setHeader('Content-Type', contentType);
        if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.end(body);
        return;
      }

      await serveStaticFile(urlObj.pathname, staticDir, res);
    } catch (err) {
      sendJson(res, getErrorStatusCode(err), { error: err.message || 'Bad request.' });
    }
  });

  server.on('upgrade', (req, socket, head) => {
    let wrote101 = false;
    const rawWrite = socket.write.bind(socket);

    socket.write = (chunk, ...args) => {
      try {
        const s = Buffer.isBuffer(chunk) ? chunk.toString('utf8', 0, 16) : String(chunk).slice(0, 16);
        if (s.startsWith('HTTP/1.1 101')) wrote101 = true;
      } catch {}
      return rawWrite(chunk, ...args);
    };

    let handled = false;
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const p = url.pathname.replace(/\/+$/, '');

      if (p === '/ws/lmproxy') handled = !!lmProxy.handleUpgrade(req, socket, head);
      else if (p === '/ws/worker') handled = !!workerSocket.handleUpgrade(req, socket, head);
      else if (p === '/ws/lineforge') handled = !!lineforgeCollab.handleUpgrade(req, socket, head);
      else if (p === '/ws/crew-presence') handled = !!crewPresence.handleUpgrade(req, socket, head);
      else if (p === '/ws/localstorage-sync') handled = !!localStorageSyncWsService.handleUpgrade(req, socket, head);
      else handled = false;
    } catch (e) {
      console.error(e);
      handled = false;
    } finally {
      socket.write = rawWrite;
    }

    if (!handled) {
      if (wrote101 || socket.__wsUpgraded) {
        if (!socket.destroyed) socket.destroy();
        return;
      }
      if (!socket.destroyed) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
      }
    }
  });

  if (idahoHarvestSupervisor && typeof idahoHarvestSupervisor.close === 'function') {
    server.on('close', () => {
      Promise.resolve(idahoHarvestSupervisor.close()).catch(() => {});
    });
  }

  return server;
}

export async function startServer({
  port = Number(process.env.PORT) || 3000,
  host = '0.0.0.0',
  redisStoreFactory = createRedisLocalStorageSyncStore,
  ...opts
} = {}) {
  const resolvedOpts = { ...opts };

  if (!resolvedOpts.localStorageSyncStore) {
    try {
      const redisBackedStore = await redisStoreFactory();
      if (redisBackedStore) {
        resolvedOpts.localStorageSyncStore = redisBackedStore;
      }
    } catch (err) {
      const message = err?.message || String(err);
      console.warn(`Redis localstorage sync unavailable, using in-memory store: ${message}`);
    }
  }

  const server = createSurveyServer(resolvedOpts);

  if (resolvedOpts.localStorageSyncStore && typeof resolvedOpts.localStorageSyncStore.close === 'function') {
    server.on('close', () => {
      Promise.resolve(resolvedOpts.localStorageSyncStore.close()).catch(() => {});
    });
  }

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.on('uncaughtException', (err) => {
    console.error(`Uncaught exception: ${err?.stack || err?.message || err}`);
    process.exitCode = 1;
  });

  process.on('unhandledRejection', (reason) => {
    console.error(`Unhandled rejection: ${reason?.stack || reason?.message || reason}`);
  });

  startServer().then((server) => {
    const addr = server.address();
    const display = typeof addr === 'string' ? addr : `${addr.address}:${addr.port}`;
    console.log(`survey-cad server listening on ${display}`);
  }).catch((err) => {
    const message = err?.stack || err?.message || String(err);
    console.error(`Failed to start survey-cad server: ${message}`);
    process.exitCode = 1;
  });
}
