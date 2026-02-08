import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extractBasisFromPdf } from './extractor.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_HTML_PATH = path.resolve(__dirname, '..', 'ROS_OCR.html');

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
      const result = await extractor(pdfPath, {
        maxPages: Number(req.query.maxPages || 2),
        dpi: Number(req.query.dpi || 300),
        debug: String(req.query.debug || '0') === '1',
      });
      res.status(200).json(result);
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
