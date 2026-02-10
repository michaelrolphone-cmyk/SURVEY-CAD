import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuardedSensorHandler, safeSocketSend, toErrorMessage } from '../src/arrowhead-sensor-guard.js';

test('createGuardedSensorHandler forwards events and catches handler exceptions', () => {
  const seen = [];
  const errors = [];
  const guarded = createGuardedSensorHandler((event) => {
    seen.push(event.step);
    if (event.shouldThrow) throw new Error('boom');
  }, (error, event) => {
    errors.push({ message: error.message, step: event.step });
  });

  guarded({ step: 1, shouldThrow: false });
  guarded({ step: 2, shouldThrow: true });
  guarded({ step: 3, shouldThrow: false });

  assert.deepEqual(seen, [1, 2, 3], 'guarded wrapper should continue invoking the handler after a thrown event');
  assert.deepEqual(errors, [{ message: 'boom', step: 2 }], 'guarded wrapper should report thrown event errors to onError callback');
});

test('toErrorMessage normalizes thrown values into user-facing text', () => {
  assert.equal(toErrorMessage(new Error('sensor unavailable')), 'sensor unavailable');
  assert.equal(toErrorMessage('permission denied'), 'permission denied');
  assert.equal(toErrorMessage(null, 'fallback message'), 'fallback message');
});

test('safeSocketSend sends payloads only when socket is open and ignores send exceptions', () => {
  const originalWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = { OPEN: 1 };
  try {
    const payload = JSON.stringify({ type: 'ar-presence' });
  const sentPayloads = [];
  const openSocket = {
    readyState: 1,
    send(value) {
      sentPayloads.push(value);
    },
  };
  const closedSocket = { readyState: 3, send() { throw new Error('should not send'); } };
  const throwingOpenSocket = { readyState: 1, send() { throw new Error('race close'); } };

  assert.equal(safeSocketSend(openSocket, payload), true, 'open socket should report successful send');
  assert.deepEqual(sentPayloads, [payload], 'open socket should receive payload');
  assert.equal(safeSocketSend(closedSocket, payload), false, 'closed socket should be skipped');
    assert.equal(safeSocketSend(throwingOpenSocket, payload), false, 'send exceptions should be swallowed to keep sensor handlers alive');
  } finally {
    globalThis.WebSocket = originalWebSocket;
  }
});
