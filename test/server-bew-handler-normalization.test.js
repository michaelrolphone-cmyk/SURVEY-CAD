import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeBewHandler } from '../src/server.js';

function createMockRes() {
  const headers = new Map();
  return {
    statusCode: 200,
    writableEnded: false,
    body: '',
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), String(value));
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    end(chunk = '') {
      this.body = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      this.writableEnded = true;
    },
  };
}

test('normalizeBewHandler decorates node req/res for express routers', async () => {
  const middleware = (req, res) => {
    res.status(200).json({ limit: req.query.limit });
  };
  middleware.stack = [];

  const handler = normalizeBewHandler(middleware);
  const req = { method: 'GET', url: '/api/bew/casefiles?limit=7' };
  const res = createMockRes();
  const urlObj = new URL('http://localhost/api/bew/casefiles?limit=7');

  const handled = await handler(req, res, urlObj);

  assert.equal(handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { limit: '7' });
});

test('normalizeBewHandler decorated response supports express error send shape', async () => {
  const middleware = (req, res) => {
    res.status(500).json({ error: 'boom', code: 'internal_error' });
  };
  middleware.stack = [];

  const handler = normalizeBewHandler(middleware);
  const req = { method: 'GET', url: '/api/bew/casefiles' };
  const res = createMockRes();

  const handled = await handler(req, res, new URL('http://localhost/api/bew/casefiles'));

  assert.equal(handled, true);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(JSON.parse(res.body), { error: 'boom', code: 'internal_error' });
});
