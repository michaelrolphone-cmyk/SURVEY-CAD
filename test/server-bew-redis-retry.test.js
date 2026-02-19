import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('server BEW bootstrap retries Redis connect and clears rejected singleton promise', async () => {
  const source = await readFile(path.resolve(__dirname, '../src/server.js'), 'utf8');
  assert.match(source, /const maxWaitMs = Math\.max\(Number\(process\.env\.BEW_REDIS_CONNECT_MAX_WAIT_MS\) \|\| Number\(process\.env\.REDIS_CONNECT_MAX_WAIT_MS\) \|\| 15000, 0\);/);
  assert.match(source, /const retryDelayMs = Math\.max\(Number\(process\.env\.BEW_REDIS_CONNECT_RETRY_DELAY_MS\) \|\| Number\(process\.env\.REDIS_CONNECT_RETRY_DELAY_MS\) \|\| 750, 50\);/);
  assert.match(source, /while \(\(Date\.now\(\) - startedAt\) <= maxWaitMs\)\s*\{[\s\S]*await candidate\.connect\(\);[\s\S]*await new Promise\(\(resolve\) => setTimeout\(resolve, retryDelayMs\)\);/);
  assert.match(source, /throw new Error\(`Unable to initialize BEW Redis after \$\{attempts\} attempt\(s\): \$\{msg\}`\);/);
  assert.match(source, /try \{\s*return await _bewPromise;\s*\} catch \(err\) \{\s*_bewPromise = null;\s*throw err;\s*\}/);
});
