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

maybeTest('ros ocr api clamps expensive defaults to reduce timeout risk', async () => {
  const mockResult = { pdf: 'tmp.pdf', best: { bearing: 'N 01°00\'00" E' }, candidates: [{ bearing: 'N 01°00\'00" E' }] };
  const app = await startApp(async (_pdfPath, opts) => {
    assert.equal(opts.maxPages, 1);
    assert.equal(opts.dpi, 220);
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
    const payload = await res.json();
    assert.equal(payload.request.allowSlow, false);
    assert.equal(payload.request.requestedMaxPages, 3);
    assert.equal(payload.request.requestedDpi, 400);
    assert.equal(payload.request.maxPages, 1);
    assert.equal(payload.request.dpi, 220);
    assert.deepEqual(payload.best, mockResult.best);
    assert.deepEqual(payload.candidates, mockResult.candidates);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});


maybeTest('ros ocr api allows full settings when allowSlow=1 by creating async job', async () => {
  const app = await startApp(async (_pdfPath, opts) => {
    assert.equal(opts.maxPages, 3);
    assert.equal(opts.dpi, 400);
    assert.equal(opts.debug, false);
    return { pdf: 'tmp.pdf', best: null, candidates: [] };
  });

  try {
    const form = new FormData();
    form.append('pdf', new Blob(['%PDF-1.4\n%test\n'], { type: 'application/pdf' }), 'sample.pdf');

    const res = await fetch(`http://127.0.0.1:${app.port}/extract?maxPages=3&dpi=400&allowSlow=1`, {
      method: 'POST',
      body: form,
    });

    assert.equal(res.status, 202);
    const payload = await res.json();
    assert.equal(payload.status, 'queued');
    assert.equal(payload.request.allowSlow, true);
    assert.equal(payload.request.maxPages, 3);
    assert.equal(payload.request.dpi, 400);
    assert.match(payload.statusUrl, /^\/extract\/jobs\//);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});

maybeTest('ros ocr api queues async jobs for allowSlow requests to avoid request timeout', async () => {
  let release;
  const extractorGate = new Promise((resolve) => {
    release = resolve;
  });

  const app = await startApp(async (_pdfPath, opts) => {
    assert.equal(opts.maxPages, 3);
    assert.equal(opts.dpi, 400);
    await extractorGate;
    return {
      pdf: 'tmp.pdf',
      best: { bearing: 'N 10°00\'00" E' },
      candidates: [{ bearing: 'N 10°00\'00" E' }],
    };
  });

  try {
    const form = new FormData();
    form.append('pdf', new Blob(['%PDF-1.4\n%test\n'], { type: 'application/pdf' }), 'sample.pdf');

    const createRes = await fetch(`http://127.0.0.1:${app.port}/extract?maxPages=3&dpi=400&allowSlow=1`, {
      method: 'POST',
      body: form,
    });

    assert.equal(createRes.status, 202);
    const created = await createRes.json();
    assert.match(created.jobId, /^[0-9a-f-]{36}$/i);
    assert.equal(created.status, 'queued');
    assert.match(created.statusUrl, /^\/extract\/jobs\//);

    const pendingRes = await fetch(`http://127.0.0.1:${app.port}${created.statusUrl}`);
    assert.equal(pendingRes.status, 200);
    const pending = await pendingRes.json();
    assert.match(pending.status, /queued|running/);

    release();

    let completed;
    for (let i = 0; i < 15; i += 1) {
      const pollRes = await fetch(`http://127.0.0.1:${app.port}${created.statusUrl}`);
      if (pollRes.status === 200) {
        const payload = await pollRes.json();
        if (payload.status === 'completed') {
          completed = payload;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    assert.ok(completed, 'expected async job to complete');
    assert.equal(completed.request.allowSlow, true);
    assert.equal(completed.request.maxPages, 3);
    assert.equal(completed.request.dpi, 400);
    assert.deepEqual(completed.best, { bearing: 'N 10°00\'00" E' });
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});

maybeTest('ros ocr api returns 404 for unknown async job', async () => {
  const app = await startApp(async () => ({ pdf: 'tmp.pdf', best: null, candidates: [] }));
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/extract/jobs/does-not-exist`);
    assert.equal(res.status, 404);
    const payload = await res.json();
    assert.match(payload.error, /job not found/i);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
