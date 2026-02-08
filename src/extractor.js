const os = require("os");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const sharp = require("sharp");
const { spawn } = require("child_process");

function randId() {
  return crypto.randomBytes(8).toString("hex");
}

function norm(s) {
  if (!s) return "";
  return String(s)
    .replace(/º/g, "°")
    .replace(/[’‘′]/g, "'")
    .replace(/[”“″]/g, '"')
    .replace(/\|/g, "1")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
}

function alphaOnlyUpper(s) {
  return String(s).toUpperCase().replace(/[^A-Z]/g, "");
}

function containsBasisLabel(s) {
  const a = alphaOnlyUpper(s);
  return (
    a.includes("BASISOFBEARING") ||
    a.includes("BASISOFBEARINGS") ||
    (a.includes("BASIS") && a.includes("BEAR"))
  );
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString("utf8")));
    p.stderr.on("data", (d) => (err += d.toString("utf8")));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve({ out, err });
      else reject(new Error(`${cmd} exited ${code}: ${err || out}`));
    });
  });
}

async function tesseractVersion() {
  try {
    const { out } = await run("tesseract", ["--version"]);
    return out.split("\n")[0].trim();
  } catch {
    return null;
  }
}

async function tesseractLangs() {
  try {
    const { out } = await run("tesseract", ["--list-langs"]);
    return out
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.toLowerCase().startsWith("list of"));
  } catch {
    return null;
  }
}

async function ocrImage(imgPath, { psm = 6, lang = "eng" } = {}) {
  // tesseract <image> stdout -l eng --psm 6 --oem 1
  const { out } = await run("tesseract", [imgPath, "stdout", "-l", lang, "--oem", "1", "--psm", String(psm)]);
  return norm(out);
}

// Bearing patterns (ported/tolerant)
const BEARING_STD_RE = /\b([NS])\s*(\d{1,3})\s*(?:°|\*|deg|d)?\s*(\d{1,2})?\s*(?:['′’mmin°]|\s)?\s*(\d{1,2}(?:\.\d+)?)?\s*(?:(?:"|″|sec|s)|\s)?\s*([EW])\b/ig;
const BEARING_COND_RE = /\b([NS])\s*(\d{5,7})\s*([EW])\b/ig;
const AZ_RE = /\b(?:AZ|AZIMUTH)\s*[:=]?\s*(\d{1,3})\s*(?:°|\*|deg|d)?\s*(\d{1,2})\s*(?:['′’mmin]|\s)?\s*(\d{1,2}(?:\.\d+)?)?\s*(?:(?:"|″|sec|s)|\s)?\b/ig;

const NUM_WITH_UNIT_RE = /\b(\d{1,6}(?:\.\d{1,4})?)\s*(ft|feet|foot|'|m|meter|meters)\b/ig;
const BASED_ON_RE = /\bbased\s+on\b/i;

function normalizeUnit(u) {
  if (!u) return null;
  const x = u.toLowerCase().trim();
  if (x === "'" || x === "ft" || x === "feet" || x === "foot") return "ft";
  if (x.startsWith("m")) return "m";
  return x;
}

function fmtQuad(ns, deg, mins, secs, ew) {
  const d = String(deg).padStart(2, "0");
  const m = String(mins).padStart(2, "0");
  let s;
  if (secs == null) s = "00";
  else if (Math.abs(secs - Math.round(secs)) < 1e-6) s = String(Math.round(secs)).padStart(2, "0");
  else s = String(secs).replace(/\.00$/, "");
  return `${ns.toUpperCase()} ${d}°${m}'${s}" ${ew.toUpperCase()}`;
}

function findBearings(text) {
  const t = norm(text);
  const hits = [];

  BEARING_STD_RE.lastIndex = 0;
  for (let m; (m = BEARING_STD_RE.exec(t)); ) {
    const ns = m[1], deg = parseInt(m[2], 10);
    const mins = m[3] ? parseInt(m[3], 10) : 0;
    const secs = m[4] ? parseFloat(m[4]) : 0;
    const ew = m[5];
    if (deg > 120 || mins >= 60 || secs >= 60) continue;
    hits.push({ bearing: fmtQuad(ns, deg, mins, secs, ew), start: m.index, end: m.index + m[0].length });
  }

  BEARING_COND_RE.lastIndex = 0;
  for (let m; (m = BEARING_COND_RE.exec(t)); ) {
    const ns = m[1], digits = String(m[2]).replace(/\D/g, ""), ew = m[3];
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
  for (let m; (m = AZ_RE.exec(t)); ) {
    const deg = parseInt(m[1], 10);
    const mins = parseInt(m[2], 10);
    const secs = m[3] ? parseFloat(m[3]) : 0;
    if (deg > 360 || mins >= 60 || secs >= 60) continue;
    hits.push({ bearing: `AZ ${String(deg).padStart(3, "0")}°${String(mins).padStart(2, "0")}'${String(Math.round(secs)).padStart(2, "0")}"`, start: m.index, end: m.index + m[0].length });
  }

  return hits;
}

function findDistanceAfter(text, startFrom) {
  const t = norm(text);
  const seg = t.slice(startFrom, startFrom + 260);

  NUM_WITH_UNIT_RE.lastIndex = 0;
  const m = NUM_WITH_UNIT_RE.exec(seg);
  if (m) return { distance: parseFloat(m[1]), unit: normalizeUnit(m[2]) };

  // fallback: first plausible number
  const nums = seg.match(/\b\d{1,7}(?:\.\d{1,4})?\b/g) || [];
  const candidates = nums
    .map((s) => ({ s, v: Number(s) }))
    .filter((x) => Number.isFinite(x.v) && x.v >= 10 && x.v <= 200000)
    .sort((a, b) => (a.s.includes(".") === b.s.includes(".") ? 0 : a.s.includes(".") ? -1 : 1));
  if (!candidates.length) return { distance: null, unit: null };
  return { distance: candidates[0].v, unit: null };
}

function pickBestNearBasis(text) {
  const bears = findBearings(text);
  if (!bears.length) return { bearing: null, distance: null, unit: null };

  const key = (() => {
    const m = /bas/i.exec(text);
    return m ? m.index : 0;
  })();

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

// ROI list (proportions)
const ROIS = [
  { name: "left_strip", x0: 0.00, y0: 0.00, x1: 0.28, y1: 1.00 },
  { name: "right_strip", x0: 0.72, y0: 0.00, x1: 1.00, y1: 1.00 },
  { name: "top_band", x0: 0.00, y0: 0.00, x1: 1.00, y1: 0.22 },
  { name: "bottom_band", x0: 0.00, y0: 0.72, x1: 1.00, y1: 1.00 },
  { name: "notes_right_top", x0: 0.55, y0: 0.00, x1: 1.00, y1: 0.55 },
  { name: "notes_left_top", x0: 0.00, y0: 0.00, x1: 0.55, y1: 0.55 }
];

function scoreCandidate(c) {
  let s = 0;
  if (c.source === "label") s += 2.0;
  if (c.bearing) s += 4.0;
  if (c.distance != null) s += 2.5;
  if (c.basis_reference) s += 1.0;
  if (c.psm === 11) s += 0.2;
  if (c.prep === "otsu") s += 0.2;
  return s;
}

async function renderPdfToPngs(pdfPath, { maxPages = 2, dpi = 300, outDir }) {
  const prefix = path.join(outDir, `pages-${randId()}`);
  // pdftoppm -f 1 -l N -r DPI -png input prefix
  await run("pdftoppm", ["-f", "1", "-l", String(maxPages), "-r", String(dpi), "-png", pdfPath, prefix]);

  // outputs: prefix-1.png, prefix-2.png, ...
  const files = [];
  for (let i = 1; i <= maxPages; i++) {
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
  let img = sharp(inputPath);
  const meta = await img.metadata();
  const W = meta.width, H = meta.height;

  if (roi) {
    const left = Math.max(0, Math.floor(W * roi.x0));
    const top = Math.max(0, Math.floor(H * roi.y0));
    const width = Math.max(1, Math.floor(W * (roi.x1 - roi.x0)));
    const height = Math.max(1, Math.floor(H * (roi.y1 - roi.y0)));
    img = img.extract({ left, top, width, height });
  }

  if (rotateDeg) img = img.rotate(rotateDeg);

  img = img.grayscale();

  if (prep === "otsu") {
    // sharp.threshold(0) => Otsu
    img = img.blur(1).threshold(0);
  } else if (prep === "fixed") {
    img = img.blur(1).threshold(180);
  }

  await img.png().toFile(outPath);
}

async function extractFromImageVariants(pagePng, pageIndex, tmpDir, candidates, errors) {
  const rotations = [0, 90, 270];
  const preps = ["otsu", "fixed"];
  const psms = [6, 11];

  // A) statement search: full page (limited variants to keep runtime sane)
  for (const prep of preps) {
    for (const psm of psms) {
      const out = path.join(tmpDir, `full-p${pageIndex}-${prep}-psm${psm}.png`);
      try {
        await makeVariantImage(pagePng, { roi: null, rotateDeg: 0, prep }, out);
        const text = await ocrImage(out, { psm });
        if (!text) continue;

        if (/\bbear\w*\b.*\bbased\s+on\b/i.test(text) || /\bbasis\b.*\bbear\w*/i.test(text)) {
          const parsed = pickBestNearBasis(text);
          candidates.push({
            page: pageIndex,
            roi: "full_page",
            rotation: 0,
            prep,
            psm,
            source: "statement",
            basis_text: text.slice(0, 1200),
            basis_reference: parseBasisReference(text),
            bearing: parsed.bearing,
            distance: parsed.distance,
            distance_unit: parsed.unit
          });
        }
      } catch (e) {
        errors.push(`full p${pageIndex} ${prep} psm${psm}: ${String(e.message || e)}`);
      } finally {
        try { await fs.unlink(out); } catch {}
      }
    }
  }

  // B) label search: ROI + rotations
  for (const roi of ROIS) {
    for (const rot of rotations) {
      for (const prep of preps) {
        for (const psm of psms) {
          const out = path.join(tmpDir, `roi-${roi.name}-p${pageIndex}-r${rot}-${prep}-psm${psm}.png`);
          try {
            await makeVariantImage(pagePng, { roi, rotateDeg: rot, prep }, out);
            const text = await ocrImage(out, { psm });
            if (!text) continue;

            if (!containsBasisLabel(text)) continue;

            const parsed = pickBestNearBasis(text);
            candidates.push({
              page: pageIndex,
              roi: `${roi.name}`,
              rotation: rot,
              prep,
              psm,
              source: "label",
              basis_text: text.slice(0, 1200),
              basis_reference: parseBasisReference(text),
              bearing: parsed.bearing,
              distance: parsed.distance,
              distance_unit: parsed.unit
            });

            // once we found BASIS in this ROI+rot, stop trying all other variants for that same ROI+rot
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

async function extractBasisFromPdf(pdfPath, { maxPages = 2, dpi = 300, debug = false } = {}) {
  const tmpDir = path.join(os.tmpdir(), `ros-basis-${randId()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const candidates = [];
  const errors = [];

  let diagnostics = null;
  if (debug) {
    diagnostics = {
      tesseract_version: await tesseractVersion(),
      tesseract_langs: await tesseractLangs(),
      maxPages,
      dpi
    };
  }

  try {
    const pagePngs = await renderPdfToPngs(pdfPath, { maxPages, dpi, outDir: tmpDir });
    if (!pagePngs.length) {
      return { pdf: path.basename(pdfPath), best: null, candidates: [], ...(debug ? { diagnostics: { ...diagnostics, errors: ["pdftoppm produced no pages"] } } : {}) };
    }

    for (let i = 0; i < pagePngs.length; i++) {
      await extractFromImageVariants(pagePngs[i], i, tmpDir, candidates, errors);
    }

    candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
    const best = candidates.length ? candidates[0] : null;

    const out = { pdf: path.basename(pdfPath), best, candidates };
    if (debug) out.diagnostics = { ...diagnostics, errors };
    return out;
  } finally {
    // cleanup tmp dir
    try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { extractBasisFromPdf };
