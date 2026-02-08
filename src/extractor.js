import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

function randId() {
  return crypto.randomBytes(8).toString('hex');
}

function norm(s) {
  if (!s) return '';
  return String(s)
    .replace(/º/g, '°')
    .replace(/[’‘′]/g, "'")
    .replace(/[”“″]/g, '"')
    .replace(/\|/g, '1')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

function alphaOnlyUpper(s) {
  return String(s).toUpperCase().replace(/[^A-Z]/g, '');
}

function containsBasisLabel(s) {
  const a = alphaOnlyUpper(s);
  return (
    a.includes('BASISOFBEARING')
    || a.includes('BASISOFBEARINGS')
    || (a.includes('BASIS') && a.includes('BEAR'))
  );
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => {
      out += d.toString('utf8');
    });
    p.stderr.on('data', (d) => {
      err += d.toString('utf8');
    });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve({ out, err });
      else reject(new Error(`${cmd} exited ${code}: ${err || out}`));
    });
  });
}

async function tesseractVersion(runCommand = run) {
  try {
    const { out } = await runCommand('tesseract', ['--version']);
    return out.split('\n')[0].trim();
  } catch {
    return null;
  }
}

async function tesseractLangs(runCommand = run) {
  try {
    const { out } = await runCommand('tesseract', ['--list-langs']);
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.toLowerCase().startsWith('list of'));
  } catch {
    return null;
  }
}

function buildTesseractEnv(baseEnv, tessdataPrefix) {
  if (!tessdataPrefix) return baseEnv;
  return { ...baseEnv, TESSDATA_PREFIX: tessdataPrefix };
}

async function detectTessdataPrefix() {
  if (process.env.TESSDATA_PREFIX) return process.env.TESSDATA_PREFIX;

  const candidates = [
    '/app/.apt/usr/share/tesseract-ocr/5/tessdata',
    '/app/.apt/usr/share/tesseract-ocr/4.00/tessdata',
    '/usr/share/tesseract-ocr/5/tessdata',
    '/usr/share/tesseract-ocr/4.00/tessdata',
    '/usr/share/tessdata',
  ];

  for (const dir of candidates) {
    try {
      const files = await fs.readdir(dir);
      if (files.some((f) => f.endsWith('.traineddata'))) return dir;
    } catch {}
  }
  return null;
}

function withTessdata(runCommand, tessdataPrefix) {
  return (cmd, args, opts = {}) => {
    if (cmd !== 'tesseract' || !tessdataPrefix) return runCommand(cmd, args, opts);
    const env = buildTesseractEnv({ ...process.env, ...(opts.env || {}) }, tessdataPrefix);
    return runCommand(cmd, args, { ...opts, env });
  };
}

function selectOcrLanguage(langs, preferred = 'eng') {
  if (!Array.isArray(langs) || !langs.length) {
    return {
      lang: null,
      warning: 'Tesseract reported no OCR languages. Install tessdata (for example, eng.traineddata) or set TESSDATA_PREFIX.',
    };
  }

  if (langs.includes(preferred)) return { lang: preferred, warning: null };

  return {
    lang: langs[0],
    warning: `Preferred OCR language "${preferred}" is unavailable; using "${langs[0]}" instead.`,
  };
}

async function ocrImage(imgPath, { psm = 6, lang = 'eng', runCommand = run } = {}) {
  const { out } = await runCommand('tesseract', [imgPath, 'stdout', '-l', lang, '--oem', '1', '--psm', String(psm)]);
  return norm(out);
}

const BEARING_STD_RE = /\b([NS])\s*(\d{1,3})\s*(?:°|\*|deg|d)?\s*(\d{1,2})?\s*(?:['′’mmin°]|\s)?\s*(\d{1,2}(?:\.\d+)?)?\s*(?:(?:"|″|sec|s)|\s)?\s*([EW])\b/ig;
const BEARING_COND_RE = /\b([NS])\s*(\d{5,7})\s*([EW])\b/ig;
const AZ_RE = /\b(?:AZ|AZIMUTH)\s*[:=]?\s*(\d{1,3})\s*(?:°|\*|deg|d)?\s*(\d{1,2})\s*(?:['′’mmin]|\s)?\s*(\d{1,2}(?:\.\d+)?)?\s*(?:(?:"|″|sec|s)|\s)?\b/ig;

const NUM_WITH_UNIT_RE = /\b(\d{1,6}(?:\.\d{1,4})?)\s*(ft|feet|foot|'|m|meter|meters)\b/ig;
const BASED_ON_RE = /\bbased\s+on\b/i;

function normalizeUnit(u) {
  if (!u) return null;
  const x = u.toLowerCase().trim();
  if (x === "'" || x === 'ft' || x === 'feet' || x === 'foot') return 'ft';
  if (x.startsWith('m')) return 'm';
  return x;
}

function fmtQuad(ns, deg, mins, secs, ew) {
  const d = String(deg).padStart(2, '0');
  const m = String(mins).padStart(2, '0');
  let s;
  if (secs == null) s = '00';
  else if (Math.abs(secs - Math.round(secs)) < 1e-6) s = String(Math.round(secs)).padStart(2, '0');
  else s = String(secs).replace(/\.00$/, '');
  return `${ns.toUpperCase()} ${d}°${m}'${s}" ${ew.toUpperCase()}`;
}

function findBearings(text) {
  const t = norm(text);
  const hits = [];

  BEARING_STD_RE.lastIndex = 0;
  for (let m; (m = BEARING_STD_RE.exec(t));) {
    const ns = m[1];
    const deg = parseInt(m[2], 10);
    const mins = m[3] ? parseInt(m[3], 10) : 0;
    const secs = m[4] ? parseFloat(m[4]) : 0;
    const ew = m[5];
    if (deg > 120 || mins >= 60 || secs >= 60) continue;
    hits.push({ bearing: fmtQuad(ns, deg, mins, secs, ew), start: m.index, end: m.index + m[0].length });
  }

  BEARING_COND_RE.lastIndex = 0;
  for (let m; (m = BEARING_COND_RE.exec(t));) {
    const ns = m[1];
    const digits = String(m[2]).replace(/\D/g, '');
    const ew = m[3];
    if (digits.length < 5) continue;
    const degPart = digits.slice(0, -4);
    const mm = digits.slice(-4, -2);
    const ss = digits.slice(-2);
    const deg = parseInt(degPart, 10);
    const mins = parseInt(mm, 10);
    const secs = parseInt(ss, 10);
    if (deg > 120 || mins >= 60 || secs >= 60) continue;
    hits.push({ bearing: fmtQuad(ns, deg, mins, secs, ew), start: m.index, end: m.index + m[0].length });
  }

  AZ_RE.lastIndex = 0;
  for (let m; (m = AZ_RE.exec(t));) {
    const deg = parseInt(m[1], 10);
    const mins = parseInt(m[2], 10);
    const secs = m[3] ? parseFloat(m[3]) : 0;
    if (deg > 360 || mins >= 60 || secs >= 60) continue;
    hits.push({ bearing: `AZ ${String(deg).padStart(3, '0')}°${String(mins).padStart(2, '0')}'${String(Math.round(secs)).padStart(2, '0')}"`, start: m.index, end: m.index + m[0].length });
  }

  return hits;
}

function findDistanceAfter(text, startFrom) {
  const t = norm(text);
  const seg = t.slice(startFrom, startFrom + 260);

  NUM_WITH_UNIT_RE.lastIndex = 0;
  const m = NUM_WITH_UNIT_RE.exec(seg);
  if (m) return { distance: parseFloat(m[1]), unit: normalizeUnit(m[2]) };

  const nums = seg.match(/\b\d{1,7}(?:\.\d{1,4})?\b/g) || [];
  const candidates = nums
    .map((s) => ({ s, v: Number(s) }))
    .filter((x) => Number.isFinite(x.v) && x.v >= 10 && x.v <= 200000)
    .sort((a, b) => (a.s.includes('.') === b.s.includes('.') ? 0 : a.s.includes('.') ? -1 : 1));
  if (!candidates.length) return { distance: null, unit: null };
  return { distance: candidates[0].v, unit: null };
}

function pickBestNearBasis(text) {
  const bears = findBearings(text);
  if (!bears.length) return { bearing: null, distance: null, unit: null };

  const basisMatch = /bas/i.exec(text);
  const key = basisMatch ? basisMatch.index : 0;

  const best = bears.reduce((a, b) => (Math.abs(b.start - key) < Math.abs(a.start - key) ? b : a));
  const d = findDistanceAfter(text, best.end);
  return { bearing: best.bearing, distance: d.distance, unit: d.unit };
}

function parseBasisReference(text) {
  const t = norm(text);
  const m = BASED_ON_RE.exec(t);
  if (!m) return null;
  let tail = t.slice(m.index + m[0].length).trim();
  tail = tail.split(/[\n;.]\s+/)[0].trim();
  return tail || null;
}

const ROIS = [
  { name: 'left_strip', x0: 0.00, y0: 0.00, x1: 0.28, y1: 1.00 },
  { name: 'right_strip', x0: 0.72, y0: 0.00, x1: 1.00, y1: 1.00 },
  { name: 'top_band', x0: 0.00, y0: 0.00, x1: 1.00, y1: 0.22 },
  { name: 'bottom_band', x0: 0.00, y0: 0.72, x1: 1.00, y1: 1.00 },
  { name: 'notes_right_top', x0: 0.55, y0: 0.00, x1: 1.00, y1: 0.55 },
  { name: 'notes_left_top', x0: 0.00, y0: 0.00, x1: 0.55, y1: 0.55 },
];

function scoreCandidate(c) {
  let s = 0;
  if (c.source === 'label') s += 2.0;
  if (c.bearing) s += 4.0;
  if (c.distance != null) s += 2.5;
  if (c.basis_reference) s += 1.0;
  if (c.psm === 11) s += 0.2;
  if (c.prep === 'otsu') s += 0.2;
  return s;
}

async function renderPdfToPngs(pdfPath, { maxPages = 2, dpi = 300, outDir, runCommand = run }) {
  const prefix = path.join(outDir, `pages-${randId()}`);
  await runCommand('pdftoppm', ['-f', '1', '-l', String(maxPages), '-r', String(dpi), '-png', pdfPath, prefix]);

  const files = [];
  for (let i = 1; i <= maxPages; i += 1) {
    const p = `${prefix}-${i}.png`;
    try {
      await fs.access(p);
      files.push(p);
    } catch {
      break;
    }
  }
  return files;
}

async function makeVariantImage(inputPath, { roi, rotateDeg, prep }, outPath) {
  const { default: sharp } = await import('sharp');
  let img = sharp(inputPath);
  const meta = await img.metadata();
  const W = meta.width;
  const H = meta.height;

  if (roi) {
    const left = Math.max(0, Math.floor(W * roi.x0));
    const top = Math.max(0, Math.floor(H * roi.y0));
    const width = Math.max(1, Math.floor(W * (roi.x1 - roi.x0)));
    const height = Math.max(1, Math.floor(H * (roi.y1 - roi.y0)));
    img = img.extract({ left, top, width, height });
  }

  if (rotateDeg) img = img.rotate(rotateDeg);
  img = img.grayscale();

  if (prep === 'otsu') img = img.blur(1).threshold(0);
  else if (prep === 'fixed') img = img.blur(1).threshold(180);

  await img.png().toFile(outPath);
}

async function extractFromImageVariants(pagePng, pageIndex, tmpDir, candidates, errors, runCommand, ocrLang) {
  const rotations = [0, 90, 270];
  const preps = ['otsu', 'fixed'];
  const psms = [6, 11];

  for (const prep of preps) {
    for (const psm of psms) {
      const out = path.join(tmpDir, `full-p${pageIndex}-${prep}-psm${psm}.png`);
      try {
        await makeVariantImage(pagePng, { roi: null, rotateDeg: 0, prep }, out);
        const text = await ocrImage(out, { psm, runCommand, lang: ocrLang });
        if (!text) continue;

        if (/\bbear\w*\b.*\bbased\s+on\b/i.test(text) || /\bbasis\b.*\bbear\w*/i.test(text)) {
          const parsed = pickBestNearBasis(text);
          candidates.push({
            page: pageIndex,
            roi: 'full_page',
            rotation: 0,
            prep,
            psm,
            source: 'statement',
            basis_text: text.slice(0, 1200),
            basis_reference: parseBasisReference(text),
            bearing: parsed.bearing,
            distance: parsed.distance,
            distance_unit: parsed.unit,
          });
        }
      } catch (e) {
        errors.push(`full p${pageIndex} ${prep} psm${psm}: ${String(e.message || e)}`);
      } finally {
        try { await fs.unlink(out); } catch {}
      }
    }
  }

  for (const roi of ROIS) {
    for (const rot of rotations) {
      for (const prep of preps) {
        for (const psm of psms) {
          const out = path.join(tmpDir, `roi-${roi.name}-p${pageIndex}-r${rot}-${prep}-psm${psm}.png`);
          try {
            await makeVariantImage(pagePng, { roi, rotateDeg: rot, prep }, out);
            const text = await ocrImage(out, { psm, runCommand, lang: ocrLang });
            if (!text || !containsBasisLabel(text)) continue;

            const parsed = pickBestNearBasis(text);
            candidates.push({
              page: pageIndex,
              roi: roi.name,
              rotation: rot,
              prep,
              psm,
              source: 'label',
              basis_text: text.slice(0, 1200),
              basis_reference: parseBasisReference(text),
              bearing: parsed.bearing,
              distance: parsed.distance,
              distance_unit: parsed.unit,
            });
            break;
          } catch (e) {
            errors.push(`roi ${roi.name} p${pageIndex} rot${rot} ${prep} psm${psm}: ${String(e.message || e)}`);
          } finally {
            try { await fs.unlink(out); } catch {}
          }
        }
      }
    }
  }
}

export async function extractBasisFromPdf(pdfPath, { maxPages = 2, dpi = 300, debug = false, runCommand = run } = {}) {
  const tmpDir = path.join(os.tmpdir(), `ros-basis-${randId()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const candidates = [];
  const errors = [];
  let ocrWarning = null;
  let ocrLang = 'eng';
  const tessdataPrefix = await detectTessdataPrefix();
  const ocrRunCommand = withTessdata(runCommand, tessdataPrefix);

  let diagnostics = null;
  if (debug) {
    const langs = await tesseractLangs(ocrRunCommand);
    diagnostics = {
      tesseract_version: await tesseractVersion(ocrRunCommand),
      tesseract_langs: langs,
      maxPages,
      dpi,
      tessdata_prefix: tessdataPrefix,
    };
    const selected = selectOcrLanguage(langs);
    ocrLang = selected.lang;
    ocrWarning = selected.warning;
  } else {
    const selected = selectOcrLanguage(await tesseractLangs(ocrRunCommand));
    ocrLang = selected.lang;
    ocrWarning = selected.warning;
  }

  try {
    if (!ocrLang) {
      const out = { pdf: path.basename(pdfPath), best: null, candidates: [] };
      if (debug) {
        out.diagnostics = { ...diagnostics, errors: [ocrWarning] };
      }
      return out;
    }

    if (ocrWarning) errors.push(ocrWarning);

    const pagePngs = await renderPdfToPngs(pdfPath, { maxPages, dpi, outDir: tmpDir, runCommand: ocrRunCommand });
    if (!pagePngs.length) {
      return {
        pdf: path.basename(pdfPath),
        best: null,
        candidates: [],
        ...(debug ? { diagnostics: { ...diagnostics, errors: ['pdftoppm produced no pages'] } } : {}),
      };
    }

    for (let i = 0; i < pagePngs.length; i += 1) {
      await extractFromImageVariants(pagePngs[i], i, tmpDir, candidates, errors, ocrRunCommand, ocrLang);
    }

    candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
    const best = candidates.length ? candidates[0] : null;

    const out = { pdf: path.basename(pdfPath), best, candidates };
    if (debug) out.diagnostics = { ...diagnostics, errors };
    return out;
  } finally {
    try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

export { containsBasisLabel, findBearings, parseBasisReference, pickBestNearBasis, scoreCandidate };
export { buildTesseractEnv, selectOcrLanguage };
