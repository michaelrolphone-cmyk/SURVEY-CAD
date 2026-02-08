import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extractBasisFromPdf } from './extractor.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_HTML_PATH = path.resolve(__dirname, '..', 'ROS_OCR.html');
const DEFAULT_MAX_PAGES = Number(process.env.ROS_OCR_MAX_PAGES || 1);
const DEFAULT_DPI = Number(process.env.ROS_OCR_DPI || 220);

function parsePositiveInt(input, fallback) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export async function createRosOcrApp({ extractor = extractBasisFromPdf, htmlPath = DEFAULT_HTML_PATH } = {}) {
  const [{ default: express }, { default: multer }] = await Promise.all([import('express'), import('multer')]);
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const upload = multer({
    dest: path.join(os.tmpdir(), 'ros_uploads'),
    limits: { fileSize: 35 * 1024 * 1024 },
  });

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get('/', async (_req, res) => {
    try {
      const html = await fs.readFile(htmlPath, 'utf8');
      res.type('html').send(html);
    } catch {
      res.type('text').send('ROS Basis Extractor is running. POST /extract with multipart form-data field "pdf".');
    }
  });

  app.post('/extract', upload.single('pdf'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Missing file field "pdf".' });
      return;
    }

    const pdfPath = req.file.path;
    try {
      const allowSlow = String(req.query.allowSlow || '0') === '1';
      const requestedMaxPages = parsePositiveInt(req.query.maxPages, DEFAULT_MAX_PAGES);
      const requestedDpi = parsePositiveInt(req.query.dpi, DEFAULT_DPI);

      const maxPages = allowSlow ? requestedMaxPages : clamp(requestedMaxPages, 1, DEFAULT_MAX_PAGES);
      const dpi = allowSlow ? requestedDpi : clamp(requestedDpi, 120, DEFAULT_DPI);

      const result = await extractor(pdfPath, {
        maxPages,
        dpi,
        debug: String(req.query.debug || '0') === '1',
      });
      res.status(200).json({
        ...result,
        request: {
          allowSlow,
          requestedMaxPages,
          requestedDpi,
          maxPages,
          dpi,
        },
      });
    } catch (e) {
      res.status(500).json({ error: String(e?.message || e) });
    } finally {
      try {
        await fs.unlink(pdfPath);
      } catch {}
    }
  });

  return app;
}

export async function startRosOcrServer({ port = Number(process.env.PORT) || 3001, host = '0.0.0.0', ...opts } = {}) {
  const app = await createRosOcrApp(opts);
  return new Promise((resolve) => {
    const server = app.listen(port, host, () => resolve(server));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startRosOcrServer().then((server) => {
    const addr = server.address();
    const display = typeof addr === 'string' ? addr : `${addr.address}:${addr.port}`;
    console.log(`ros-ocr-api listening on ${display}`);
  });
}
