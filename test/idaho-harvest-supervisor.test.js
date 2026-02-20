import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createIdahoHarvestSupervisor } from '../src/idaho-harvest-supervisor.js';

function createFakeChild() {
  const child = new EventEmitter();
  child.pid = 1234;
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    child.emit('exit', 0, 'SIGTERM');
  };
  return child;
}

test('idaho harvest supervisor restarts worker when it exits with non-zero code', () => {
  const children = [];
  const timers = [];
  const supervisor = createIdahoHarvestSupervisor({
    forkImpl: () => {
      const child = createFakeChild();
      children.push(child);
      return child;
    },
    setTimeoutImpl: (fn) => {
      timers.push(fn);
      return fn;
    },
    clearTimeoutImpl: () => {},
  });

  supervisor.start();
  assert.equal(children.length, 1);
  children[0].emit('exit', 1, null);
  assert.equal(supervisor.getStatus().status, 'restarting');

  timers[0]();
  assert.equal(children.length, 2);
  assert.equal(supervisor.getStatus().restartCount, 1);
});


test('idaho harvest supervisor does not spawn worker when WORKERS_ENABLED is false', () => {
  const children = [];
  const supervisor = createIdahoHarvestSupervisor({
    forkImpl: () => {
      const child = createFakeChild();
      children.push(child);
      return child;
    },
    isEnabledFn: () => false,
  });

  const status = supervisor.start();
  assert.equal(children.length, 0);
  assert.equal(status.running, false);
  assert.equal(status.status, 'disabled');
});
