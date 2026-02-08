import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
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

function parseBoolFlag(input) {
  return String(input || '0') === '1';
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

  const jobs = new Map();

  app.get('/extract/jobs/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }

    if (job.status === 'completed') {
      res.status(200).json({
        jobId: req.params.jobId,
        status: job.status,
        request: job.request,
        ...job.result,
      });
      return;
    }

    if (job.status === 'failed') {
      res.status(500).json({
        jobId: req.params.jobId,
        status: job.status,
        request: job.request,
        error: job.error,
      });
      return;
    }

    res.status(200).json({
      jobId: req.params.jobId,
      status: job.status,
      request: job.request,
      pollAfterMs: 1000,
    });
  });

  app.post('/extract', upload.single('pdf'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Missing file field "pdf".' });
      return;
    }

    const pdfPath = req.file.path;
    let runAsync = false;
    try {
      const allowSlow = parseBoolFlag(req.query.allowSlow);
      runAsync = parseBoolFlag(req.query.async) || allowSlow;
      const requestedMaxPages = parsePositiveInt(req.query.maxPages, DEFAULT_MAX_PAGES);
      const requestedDpi = parsePositiveInt(req.query.dpi, DEFAULT_DPI);

      const maxPages = allowSlow ? requestedMaxPages : clamp(requestedMaxPages, 1, DEFAULT_MAX_PAGES);
      const dpi = allowSlow ? requestedDpi : clamp(requestedDpi, 120, DEFAULT_DPI);

      const requestOptions = {
        allowSlow,
        requestedMaxPages,
        requestedDpi,
        maxPages,
        dpi,
      };

      if (runAsync) {
        const jobId = crypto.randomUUID();
        jobs.set(jobId, {
          status: 'queued',
          request: requestOptions,
        });

        const statusUrl = `/extract/jobs/${jobId}`;
        Promise.resolve()
          .then(() => {
            const job = jobs.get(jobId);
            if (job) {
              jobs.set(jobId, { ...job, status: 'running' });
            }
          })
          .then(async () => {
            const result = await extractor(pdfPath, {
              maxPages,
              dpi,
              debug: parseBoolFlag(req.query.debug),
            });
            jobs.set(jobId, {
              status: 'completed',
              request: requestOptions,
              result: {
                ...result,
                request: requestOptions,
              },
            });
          })
          .catch((e) => {
            jobs.set(jobId, {
              status: 'failed',
              request: requestOptions,
              error: String(e?.message || e),
            });
          })
          .finally(async () => {
            try {
              await fs.unlink(pdfPath);
            } catch {}
          });

        res.status(202).json({
          jobId,
          status: 'queued',
          statusUrl,
          pollAfterMs: 1000,
          request: requestOptions,
        });
        return;
      }

      const result = await extractor(pdfPath, {
        maxPages,
        dpi,
        debug: parseBoolFlag(req.query.debug),
      });
      res.status(200).json({
        ...result,
        request: requestOptions,
      });
    } catch (e) {
      res.status(500).json({ error: String(e?.message || e) });
    } finally {
      if (!runAsync) {
        try {
          await fs.unlink(pdfPath);
        } catch {}
      }
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
