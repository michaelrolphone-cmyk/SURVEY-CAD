import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SERVER_PATH = new URL('../src/server.js', import.meta.url);

test('server BEW bootstrap supports registerBewRoutes exports and adapts express routers', async () => {
  const source = await readFile(SERVER_PATH, 'utf8');

  assert.match(
    source,
    /pickFirstFunction\(BewRoutes, \[\s*"registerBewRoutes",/,
    'server should consider registerBewRoutes when discovering BEW route factories',
  );

  assert.match(
    source,
    /const pseudoApp = \{[\s\S]*?use\(handler\)[\s\S]*?\};[\s\S]*?createRoutes\(pseudoApp, store, \{ redis, redisUrl \}\)/,
    'server should adapt registerBewRoutes\(app, store\) signatures to a route handler',
  );

  assert.match(
    source,
    /looksLikeExpressMiddleware[\s\S]*?product\(req, res, next\)/,
    'server should adapt express middleware/router handlers for BEW paths',
  );
});
