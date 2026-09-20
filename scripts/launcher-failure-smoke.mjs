import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const result = spawnSync(process.execPath, [resolve('dist/backend-launcher.cjs'), '--ragit-status'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: {
    ...process.env,
    RAGIT_DOCKER_COMMAND: 'ragit-deliberately-missing-docker',
    RAGIT_NATIVE_COMMAND: 'ragit-deliberately-missing-native',
    RAGIT_NPX_COMMAND: 'ragit-deliberately-missing-npx',
  },
});

assert.notEqual(result.status, 0, 'launcher unexpectedly succeeded without either backend');
assert.match(result.stderr, /Docker unavailable/);
assert.match(result.stderr, /npm\/native backend unavailable/);
assert.match(result.stderr, /Install Docker or Node\.js with npm/);
console.log('missing-backend smoke passed');
