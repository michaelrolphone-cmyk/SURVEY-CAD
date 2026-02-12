import test from 'node:test';
import assert from 'node:assert/strict';
import { loadUtilitiesByAddress } from '../src/browser-survey-client.js';

test('loadUtilitiesByAddress requests /api/utilities and returns parsed utilities', async () => {
  const originalWindow = global.window;
  const originalFetch = global.fetch;

  global.window = { location: { origin: 'http://localhost:3000' } };
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      json: async () => ({
        utilities: [{ id: 'utility-1', provider: 'Idaho Power' }],
      }),
    };
  };

  try {
    const utilities = await loadUtilitiesByAddress('100 Main St, Boise', { outSR: 2243, sources: ['power'] });
    assert.equal(utilities.length, 1);
    assert.match(calls[0], /\/api\/utilities\?/);
    assert.match(calls[0], /address=100\+Main\+St%2C\+Boise/);
    assert.match(calls[0], /outSR=2243/);
    assert.match(calls[0], /sources=power/);
  } finally {
    global.fetch = originalFetch;
    global.window = originalWindow;
  }
});
