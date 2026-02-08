import test from 'node:test';
import assert from 'node:assert/strict';
import { createRosOcrApp } from '../src/ros-ocr-api.js';

let depsAvailable = true;
try {
  await import('express');
  await import('multer');
} catch {
  depsAvailable = false;
}

const maybeTest = depsAvailable ? test : test.skip;

async function startApp(extractor) {
  const app = await createRosOcrApp({ extractor });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  return { server, port: server.address().port };
}

maybeTest('ros ocr api health endpoint returns ok and serves html page', async () => {
  const app = await startApp(async () => ({ best: null, candidates: [] }));
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });

    const home = await fetch(`http://127.0.0.1:${app.port}/`);
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /<form id="extractForm">/i);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});

maybeTest('ros ocr api rejects missing pdf uploads', async () => {
  const app = await startApp(async () => ({ best: null, candidates: [] }));
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/extract`, { method: 'POST' });
    assert.equal(res.status, 400);
    const payload = await res.json();
    assert.match(payload.error, /missing file field/i);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});

maybeTest('ros ocr api returns extraction payload for uploaded pdf', async () => {
  const mockResult = { pdf: 'tmp.pdf', best: { bearing: 'N 01°00\'00" E' }, candidates: [{ bearing: 'N 01°00\'00" E' }] };
  const app = await startApp(async (_pdfPath, opts) => {
    assert.equal(opts.maxPages, 3);
    assert.equal(opts.dpi, 400);
    assert.equal(opts.debug, true);
    return mockResult;
  });

  try {
    const form = new FormData();
    form.append('pdf', new Blob(['%PDF-1.4\n%test\n'], { type: 'application/pdf' }), 'sample.pdf');

    const res = await fetch(`http://127.0.0.1:${app.port}/extract?maxPages=3&dpi=400&debug=1`, {
      method: 'POST',
      body: form,
    });

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), mockResult);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
