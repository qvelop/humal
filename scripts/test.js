'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'bin', 'humal.js');
const fixturePath = path.join(projectRoot, 'test', 'test.hum');

const run = spawnSync(
  process.execPath,
  [cliPath, fixturePath],
  {
    cwd: projectRoot,
    encoding: 'utf8'
  }
);

if (run.error) {
  throw run.error;
}

assert.equal(
  run.status,
  0,
  `CLI error:\n${run.stderr || run.stdout}`
);

assert.equal(
  run.stdout.trim(),
  '5',
  'error'
);

console.log('test passed ✓');
