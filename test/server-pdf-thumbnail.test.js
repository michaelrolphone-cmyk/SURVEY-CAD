import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createSurveyServer } from '../src/server.js';

async function startServer(options = {}) {
  const server = createSurveyServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

test('PDF thumbnail endpoint deduplicates generation and returns cached PNG thumbnails', async () => {
  let renderCalls = 0;
  const evidenceDeskFileStore = {
    async getFile(projectId, folderKey, fileName) {
      if (projectId === 'p1' && folderKey === 'cpfs' && fileName === 'file.pdf') {
        return { buffer: Buffer.from('%PDF-1.4\nmock\n', 'utf8') };
      }
      return null;
    },
  };

  const { server, baseUrl } = await startServer({
    evidenceDeskFileStore,
    pdfThumbnailRenderer: async () => {
      renderCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 80));
      return Buffer.from('PNGDATA', 'utf8');
    },
  });

  try {
    const source = encodeURIComponent('/api/project-files/download?projectId=p1&folderKey=cpfs&fileName=file.pdf');
    const thumbnailUrl = `${baseUrl}/api/project-files/pdf-thumbnail?source=${source}`;

    const [first, second] = await Promise.all([fetch(thumbnailUrl), fetch(thumbnailUrl)]);
    assert.equal(first.status, 202);
    assert.equal(second.status, 202);

    await new Promise((resolve) => setTimeout(resolve, 120));
    const cached = await fetch(thumbnailUrl);
    assert.equal(cached.status, 200);
    assert.equal(cached.headers.get('content-type'), 'image/png');
    const body = Buffer.from(await cached.arrayBuffer()).toString('utf8');
    assert.equal(body, 'PNGDATA');
    assert.equal(renderCalls, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('PDF thumbnail endpoint validates source parameter', async () => {
  const { server, baseUrl } = await startServer({ evidenceDeskFileStore: { async getFile() { return null; } } });
  try {
    const response = await fetch(`${baseUrl}/api/project-files/pdf-thumbnail?source=${encodeURIComponent('/etc/passwd')}`);
    assert.equal(response.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('PDF thumbnail endpoint accepts absolute source URLs and normalizes to API paths', async () => {
  let renderCalls = 0;
  const evidenceDeskFileStore = {
    async getFile(projectId, folderKey, fileName) {
      if (projectId === 'p1' && folderKey === 'cpfs' && fileName === 'file.pdf') {
        return { buffer: Buffer.from('%PDF-1.4\nmock\n', 'utf8') };
      }
      return null;
    },
  };

  const { server, baseUrl } = await startServer({
    evidenceDeskFileStore,
    pdfThumbnailRenderer: async () => {
      renderCalls += 1;
      return Buffer.from('PNGDATA-ABS', 'utf8');
    },
  });

  try {
    const source = encodeURIComponent(`${baseUrl}/api/project-files/download?projectId=p1&folderKey=cpfs&fileName=file.pdf`);
    const thumbnailUrl = `${baseUrl}/api/project-files/pdf-thumbnail?source=${source}`;

    const first = await fetch(thumbnailUrl);
    assert.equal(first.status, 202);

    await new Promise((resolve) => setTimeout(resolve, 20));
    const cached = await fetch(thumbnailUrl);
    assert.equal(cached.status, 200);
    const body = Buffer.from(await cached.arrayBuffer()).toString('utf8');
    assert.equal(body, 'PNGDATA-ABS');
    assert.equal(renderCalls, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});


test('PDF thumbnail endpoint reports missing source PDFs as not found failures', async () => {
  const evidenceDeskFileStore = {
    async getFile() {
      return null;
    },
  };

  const { server, baseUrl } = await startServer({
    evidenceDeskFileStore,
    pdfThumbnailRenderer: async () => Buffer.from('PNGDATA', 'utf8'),
  });

  try {
    const source = encodeURIComponent('/api/project-files/download?projectId=p1&folderKey=cpfs&fileName=missing.pdf');
    const thumbnailUrl = `${baseUrl}/api/project-files/pdf-thumbnail?source=${source}`;

    const first = await fetch(thumbnailUrl);
    assert.equal(first.status, 202);

    await new Promise((resolve) => setTimeout(resolve, 30));
    const failed = await fetch(thumbnailUrl);
    assert.equal(failed.status, 404);
    const payload = await failed.json();
    assert.equal(payload.status, 'failed');
    assert.match(payload.detail, /not found/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('PDF thumbnail endpoint reports generation failures instead of returning 202 forever', async () => {
  const evidenceDeskFileStore = {
    async getFile() {
      return { buffer: Buffer.from('%PDF-1.4\nmock\n', 'utf8') };
    },
  };

  const { server, baseUrl } = await startServer({
    evidenceDeskFileStore,
    pdfThumbnailRenderer: async () => {
      throw new Error('renderer unavailable');
    },
  });

  try {
    const source = encodeURIComponent('/api/project-files/download?projectId=p1&folderKey=cpfs&fileName=file.pdf');
    const thumbnailUrl = `${baseUrl}/api/project-files/pdf-thumbnail?source=${source}`;

    const first = await fetch(thumbnailUrl);
    assert.equal(first.status, 202);

    await new Promise((resolve) => setTimeout(resolve, 30));
    const failed = await fetch(thumbnailUrl);
    assert.equal(failed.status, 502);
    const payload = await failed.json();
    assert.equal(payload.status, 'failed');
    assert.match(payload.detail, /renderer unavailable/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});


test('PDF thumbnail endpoint default renderer returns a PNG thumbnail for real PDFs', async (t) => {
  const pdftoppmCheck = spawnSync('pdftoppm', ['-h'], { stdio: 'ignore' });
  if (pdftoppmCheck.error && pdftoppmCheck.error.code === 'ENOENT') {
    t.skip('pdftoppm is not installed in this environment');
    return;
  }

  try {
    await import('sharp');
  } catch {
    t.skip('sharp is not installed in this environment');
    return;
  }

  const onePagePdf = Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 12 Tf 72 120 Td (SurveyCAD PDF) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000202 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
296
%%EOF
`, 'utf8');

  const evidenceDeskFileStore = {
    async getFile(projectId, folderKey, fileName) {
      if (projectId === 'p1' && folderKey === 'ros' && fileName === 'valid.pdf') {
        return { buffer: onePagePdf };
      }
      return null;
    },
  };

  const { server, baseUrl } = await startServer({ evidenceDeskFileStore });

  try {
    const source = encodeURIComponent('/api/project-files/download?projectId=p1&folderKey=ros&fileName=valid.pdf');
    const thumbnailUrl = `${baseUrl}/api/project-files/pdf-thumbnail?source=${source}`;

    const first = await fetch(thumbnailUrl);
    assert.equal(first.status, 202);

    let finalResponse = null;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      const next = await fetch(thumbnailUrl);
      if (next.status === 202) continue;
      finalResponse = next;
      break;
    }

    assert.ok(finalResponse, 'thumbnail generation should complete');
    assert.equal(finalResponse.status, 200);
    assert.equal(finalResponse.headers.get('content-type'), 'image/png');
    const body = Buffer.from(await finalResponse.arrayBuffer());
    assert.ok(body.length > 64, 'renderer should return non-trivial PNG data');
    assert.equal(body.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'thumbnail should be a valid PNG');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
