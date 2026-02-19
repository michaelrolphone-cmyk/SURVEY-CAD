import test from 'node:test';
import assert from 'node:assert/strict';
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
