'use strict';
var fs = require('fs');
var path = require('path');
var child = require('child_process');

var tsDir = path.dirname(path.dirname(require.resolve('typescript')));
var eslintDir = path.dirname(path.dirname(require.resolve('eslint')));
var prettierDir = path.dirname(require.resolve('prettier'));

var humalRoot = path.resolve(__dirname, '..');
var humalTypesRoot = path.join(
  humalRoot,
  'node_modules',
  '@types'
);

var TSC = path.join(tsDir, 'bin', 'tsc');
var ESLINT = path.join(eslintDir, 'bin', 'eslint.js');
var PRETTIER = path.join(prettierDir, 'bin', 'prettier.cjs');

var ESLINT_CONFIG = path.resolve(__dirname, '..', 'eslint.config.cjs');

var counter = 0;

function run(script, args, cwd) {
  var r = child.spawnSync(process.execPath, [script].concat(args), {
    cwd: cwd,
    encoding: 'utf8',
    windowsHide: true
  });

  if (r.error) {
    throw new Error('Failed to start tool: ' + r.error.message);
  }

  return r;
}

function createTempFile(sourceFile, moduleFormat, code) {
  var ext = moduleFormat === 'esm' ? '.mjs' : '.cjs';
  var dir = path.dirname(sourceFile);
  var base = path.basename(sourceFile, path.extname(sourceFile));

  counter++;

  var file = path.join(
    dir,
    '.' + base + '.humal-tool-' + process.pid + '-' + counter + ext
  );

  fs.writeFileSync(file, code.endsWith('\n') ? code : code + '\n', 'utf8');

  return file;
}

function rmTempFile(file) {
  try {
    fs.unlinkSync(file);
  } catch (e) {}
}

function fail(name, result) {
  var out = String(result.stdout || '') + String(result.stderr || '');
  out = out.trim();
  if (!out) out = 'Unknown error.';
  throw new Error(name + ' failed:\n' + out);
}

function checkTypes(code, sourceFile, moduleFormat) {
  var temp = createTempFile(sourceFile, moduleFormat, code);

  try {
  var r = run(
    TSC,
    [
      '--allowJs', '--checkJs', '--noEmit', '--strict',
      '--noImplicitAny', 'false', '--skipLibCheck',
      '--target', 'ES2022',
      '--module', 'NodeNext',
      '--moduleResolution', 'NodeNext',
      '--esModuleInterop',
      '--typeRoots',
      humalTypesRoot,
      '--types', 'node',
      '--pretty', 'false',
      temp
    ],
    path.dirname(sourceFile)
  );

    if (r.status !== 0) fail('TypeScript validation', r);
  } finally {
    rmTempFile(temp);
  }
}

function lint(code, sourceFile, moduleFormat) {
  var temp = createTempFile(sourceFile, moduleFormat, code);

  try {
    var r = run(
      ESLINT,
      ['--config', ESLINT_CONFIG, '--format', 'stylish', temp],
      path.dirname(sourceFile)
    );

    if (r.status !== 0) fail('ESLint validation', r);
  } finally {
    rmTempFile(temp);
  }
}

function format(code, sourceFile, moduleFormat) {
  var temp = createTempFile(sourceFile, moduleFormat, code);

  try {
    var r = run(
      PRETTIER,
      [
        '--write', '--no-config', '--no-editorconfig',
        '--end-of-line', 'lf',
        '--tab-width', '2',
        '--print-width', '80',
        temp
      ],
      path.dirname(sourceFile)
    );

    if (r.status !== 0) fail('Prettier formatting', r);

    return fs.readFileSync(temp, 'utf8');
  } finally {
    rmTempFile(temp);
  }
}

function processCode(code, sourceFile, moduleFormat) {
  checkTypes(code, sourceFile, moduleFormat);
  lint(code, sourceFile, moduleFormat);
  return format(code, sourceFile, moduleFormat);
}

module.exports = {
  checkTypes: checkTypes,
  lint: lint,
  format: format,
  process: processCode
};