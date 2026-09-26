#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var child = require('child_process');
var compile = require('../src/compiler').compile;

var argv = process.argv.slice(2);

function usage() {
  console.error('Usage: humal <file.hum> [--esm|--cjs]');
  console.error('       humal build <file.hum> [--esm|--cjs]');
  console.error('       humal version');
  process.exit(1);
}

function hasFlag(flag) {
  var i;
  for (i = 0; i < argv.length; i++) {
    if (argv[i] === flag) return true;
  }
  return false;
}

if (argv.length === 0) usage();

var first = argv[0];

if (first === 'version' || first === '-v') {
  console.log(require('../package.json').version);
  process.exit(0);
}

var cmd, file;

if (first === 'build') {
  cmd = 'build';
  file = argv[1];
} else if (first.charAt(0) === '-') {
  usage();
} else {
  cmd = 'run';
  file = first;
}

var wantEsm = hasFlag('--esm');
var wantCjs = hasFlag('--cjs');

if (!file) usage();

if (wantEsm && wantCjs) usage();

var full = path.resolve(file);

if (!fs.existsSync(full)) {
  console.error('Error: File "' + file + '" not found.');
  process.exit(1);
}

if (full.slice(-4) !== '.hum') {
  console.error('Error: File must have .hum extension.');
  process.exit(1);
}

var source;
try {
  source = fs.readFileSync(full, 'utf8');
} catch (e) {
  console.error('Error: ' + e.message);
  process.exit(1);
}

var format;
if (wantEsm) {
  format = 'esm';
} else if (wantCjs) {
  format = 'cjs';
} else if (/^\s*(import|export)\b/m.test(source)) {
  format = 'esm';
} else {
  format = 'cjs';
}

var ext = format === 'esm' ? '.mjs' : '.cjs';
var js;

try {
  js = compile(source, format);
} catch (e) {
  console.error('Error: ' + e.message);
  process.exit(1);
}

if (cmd === 'build') {
  var outFile = full.slice(0, -4) + ext;
  fs.writeFileSync(outFile, js + '\n');
  console.log(outFile);
  process.exit(0);
}

var temp = full.slice(0, -4) + '.humal-run' + ext;

fs.writeFileSync(temp, js + '\n');

var status;
try {
  var res = child.spawnSync(process.execPath, [temp], { stdio: 'inherit' });
  status = res.status == null ? 1 : res.status;
} finally {
  if (fs.existsSync(temp)) fs.unlinkSync(temp);
}

process.exit(status);