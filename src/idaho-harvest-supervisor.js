import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createIdahoHarvestSupervisor({
  workerScript = path.join(__dirname, 'idaho-harvest-worker.js'),
  forkImpl = fork,
  restartDelayMs = 1_000,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  isEnabledFn = () => String(process.env.WORKERS_ENABLED || '1').trim().toLowerCase() !== 'false'
    && String(process.env.WORKERS_ENABLED || '1').trim() !== '0',
} = {}) {
  let desiredRunning = false;
  let child = null;
  let restartTimer = null;
  let restartCount = 0;
  let lastExitCode = null;
  let status = 'idle';

  function spawnWorker() {
    status = 'running';
    child = forkImpl(workerScript, [], { env: process.env, stdio: 'inherit' });

    child.once('exit', (code, signal) => {
      const exitCode = Number.isFinite(code) ? Number(code) : null;
      lastExitCode = exitCode;
      child = null;

      if (!desiredRunning) {
        status = signal ? 'stopped' : 'idle';
        return;
      }

      if (exitCode === 0) {
        status = 'completed';
        desiredRunning = false;
        return;
      }

      status = 'restarting';
      restartCount += 1;
      restartTimer = setTimeoutImpl(() => {
        restartTimer = null;
        if (desiredRunning) spawnWorker();
      }, Math.max(0, Number(restartDelayMs) || 0));
    });
  }

  return {
    start() {
      if (!isEnabledFn()) {
        desiredRunning = false;
        status = 'disabled';
        return this.getStatus();
      }
      desiredRunning = true;
      if (restartTimer) {
        clearTimeoutImpl(restartTimer);
        restartTimer = null;
      }
      if (!child) spawnWorker();
      return this.getStatus();
    },
    stop() {
      desiredRunning = false;
      status = 'stopping';
      if (restartTimer) {
        clearTimeoutImpl(restartTimer);
        restartTimer = null;
      }
      if (child && !child.killed) child.kill('SIGTERM');
      return this.getStatus();
    },
    getStatus() {
      return {
        desiredRunning,
        running: !!child,
        pid: child?.pid || null,
        restartCount,
        lastExitCode,
        status,
      };
    },
    async close() {
      this.stop();
    },
  };
}
