import test from 'node:test';
import assert from 'node:assert/strict';

import { createRedisClient } from '../src/bew-redis.js';

function withEnv(next, fn) {
  const keys = new Set(Object.keys(next));
  for (const key of ['REDIS_TLS_REJECT_UNAUTHORIZED', 'REDIS_TLS_INSECURE', 'REDIS_TLS_URL', 'REDIS_URL']) {
    keys.add(key);
  }

  const previous = new Map();
  for (const key of keys) {
    previous.set(key, process.env[key]);
  }

  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of keys) {
        const value = previous.get(key);
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
}

function buildRedisCtorCapture() {
  const calls = [];
  class MockRedis {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.handlers = new Map();
      calls.push({ url, options, instance: this });
    }

    on(eventName, handler) {
      this.handlers.set(eventName, handler);
      return this;
    }
  }
  return { MockRedis, calls };
}

test('createRedisClient uses TLS and defaults to rejectUnauthorized=false for rediss URLs', async () => {
  await withEnv(
    {
      REDIS_TLS_REJECT_UNAUTHORIZED: undefined,
      REDIS_TLS_INSECURE: undefined,
      REDIS_TLS_URL: undefined,
      REDIS_URL: undefined,
    },
    () => {
      const { MockRedis, calls } = buildRedisCtorCapture();
      const client = createRedisClient({ url: 'rediss://example.redis:6380/0', RedisCtor: MockRedis });

      assert.ok(client);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].options.tls.rejectUnauthorized, false);
    },
  );
});

test('createRedisClient honors REDIS_TLS_REJECT_UNAUTHORIZED=true', async () => {
  await withEnv(
    {
      REDIS_TLS_REJECT_UNAUTHORIZED: 'true',
      REDIS_TLS_INSECURE: undefined,
      REDIS_TLS_URL: undefined,
      REDIS_URL: undefined,
    },
    () => {
      const { MockRedis, calls } = buildRedisCtorCapture();
      createRedisClient({ url: 'rediss://example.redis:6380/0', RedisCtor: MockRedis });
      assert.equal(calls[0].options.tls.rejectUnauthorized, true);
    },
  );
});

test('createRedisClient keeps REDIS_TLS_INSECURE backward compatibility', async () => {
  await withEnv(
    {
      REDIS_TLS_REJECT_UNAUTHORIZED: undefined,
      REDIS_TLS_INSECURE: '0',
      REDIS_TLS_URL: undefined,
      REDIS_URL: undefined,
    },
    () => {
      const { MockRedis, calls } = buildRedisCtorCapture();
      createRedisClient({ url: 'rediss://example.redis:6380/0', RedisCtor: MockRedis });
      assert.equal(calls[0].options.tls.rejectUnauthorized, true);
    },
  );
});

test('createRedisClient applies TLS when REDIS_TLS_URL is set even with redis:// URL', async () => {
  await withEnv(
    {
      REDIS_TLS_REJECT_UNAUTHORIZED: 'false',
      REDIS_TLS_INSECURE: undefined,
      REDIS_TLS_URL: 'rediss://tls-enabled',
      REDIS_URL: undefined,
    },
    () => {
      const { MockRedis, calls } = buildRedisCtorCapture();
      createRedisClient({ url: 'redis://127.0.0.1:6379/0', RedisCtor: MockRedis });
      assert.deepEqual(calls[0].options.tls, { rejectUnauthorized: false });
    },
  );
});
