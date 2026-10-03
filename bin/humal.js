#!/usr/bin/env node
'use strict';
var fs = require('fs');
var path = require('path');
var child = require('child_process');

var compile = require('../src/compiler').compile;
var tooling = require('../src/tooling');
var pkg = require('../package.json');

var argv = process.argv.slice(2);

function usage(code) {
  console.log('');
  console.log('Usage:');
  console.log('  humal <file.hum> [--esm|--cjs]');
  console.log('  humal build [file.hum|dir] [--esm|--cjs]');
  console.log('  humal check [file.hum|dir] [--esm|--cjs]');
  console.log('  humal fmt [file.hum|dir]');
  console.log('  humal watch [file.hum|dir] [--esm|--cjs]');
  console.log('  humal dev');
  console.log('  humal init [dir]');
  console.log('  humal version');
  console.log('');
  process.exit(code == null ? 0 : code);
}

function fail(msg, code) {
  console.error('Error: ' + msg);
  process.exit(code == null ? 1 : code);
}

function hasFlag(args, flag) {
  for (var i = 0; i < args.length; i++) {
    if (args[i] === flag) return true;
  }
  return false;
}

function validateFormat(args) {
  for (var i = 0; i < args.length; i++) {
    if (args[i] === '--esm' || args[i] === '--cjs') continue;
    if (args[i][0] === '-') fail('Unknown option: ' + args[i]);
  }
}

function getPosition(args) {
  var out = [];
  for (var i = 0; i < args.length; i++) {
    if (args[i] === '--esm' || args[i] === '--cjs') continue;
    out.push(args[i]);
  }
  return out;
}

function readConfig(cwd) {
  var file = path.join(cwd, 'humal.config.json');
  if (!fs.existsSync(file)) {
    return {
      exists: false,
      file: file,
      entry: 'src/main.hum',
      sourceDir: 'src',
      module: null
    };
  }
  var config;
  try {
    config = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    fail('Invalid humal.config.json: ' + e.message);
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    fail('Invalid humal.config.json: root value must be an object.');
  }
  if (config.entry == null) config.entry = 'src/main.hum';
  if (config.sourceDir == null) config.sourceDir = 'src';
  if (typeof config.entry !== 'string' || !config.entry.trim()) {
    fail('Invalid humal.config.json: "entry" must be a non-empty string.');
  }
  if (typeof config.sourceDir !== 'string' || !config.sourceDir.trim()) {
    fail('Invalid humal.config.json: "sourceDir" must be a non-empty string.');
  }
  if (config.module != null && config.module !== 'esm' && config.module !== 'cjs') {
    fail('Invalid humal.config.json: "module" must be "esm", "cjs", or null.');
  }
  config.exists = true;
  config.file = file;
  return config;
}

function readSource(full) {
  try {
    return fs.readFileSync(full, 'utf8');
  } catch (e) {
    fail(e.message);
  }
}

function Humalfile(file) {
  var full = path.resolve(file);
  if (!fs.existsSync(full)) fail('File "' + file + '" not found.');
  if (!fs.statSync(full).isFile()) fail('Not a file: "' + file + '"');
  if (path.extname(full).toLowerCase() !== '.hum') fail('File must have .hum extension.');
  return full;
}

function detectFormat(source) {
  return /^\s*(import|export)\b/m.test(source) ? 'esm' : 'cjs';
}

function resolveFormat(source, args, config, useConfig) {
  validateFormat(args);
  var wantEsm = hasFlag(args, '--esm');
  var wantCjs = hasFlag(args, '--cjs');
  if (wantEsm && wantCjs) fail('Use only one of --esm or --cjs.');
  if (wantEsm) return 'esm';
  if (wantCjs) return 'cjs';
  if (useConfig && config.module) return config.module;
  return detectFormat(source);
}

function getExtension(format) {
  return format === 'esm' ? '.mjs' : '.cjs';
}

function collectfiles(dir) {
  var result = [];
  function walk(current) {
    var entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (e) {
      fail('Cannot read directory "' + current + '": ' + e.message);
    }
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (entry.name === 'node_modules' || entry.name === '.git' ||
          entry.name === '.hg' || entry.name === '.svn') continue;
      var full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.hum') {
        result.push(full);
      }
    }
  }
  walk(dir);
  result.sort();
  return result;
}

function resolveTargets(target) {
  if (!target) return [];
  var full = path.resolve(target);
  if (!fs.existsSync(full)) fail('Path "' + target + '" not found.');
  if (fs.statSync(full).isDirectory()) return collectfiles(full);
  return [Humalfile(full)];
}

function compileAndTool(source, full, format) {
  var js;
  try {
    js = compile(source, format);
  } catch (e) {
    throw new Error(full + ': ' + e.message);
  }
  try {
    return tooling.process(js, full, format);
  } catch (e) {
    throw new Error(full + ': ' + e.message);
  }
}

function checkOne(full, config, args) {
  var source = readSource(full);
  var format = resolveFormat(source, args, config, true);
  var js;
  console.log('Checking ' + path.relative(process.cwd(), full));
  try {
    js = compile(source, format);
  } catch (e) {
    console.error('  ✗ Humal compiler');
    console.error('    ' + e.message);
    return false;
  }
  try {
    tooling.checkTypes(js, full, format);
  } catch (e) {
    console.error('  ✗ TypeScript');
    console.error('    ' + e.message);
    return false;
  }
  try {
    tooling.lint(js, full, format);
  } catch (e) {
    console.error('  ✗ ESLint');
    console.error('    ' + e.message);
    return false;
  }
  console.log('  ✓ OK');
  return true;
}

function buildOne(full, config, args) {
  var source = readSource(full);
  var format = resolveFormat(source, args, config, true);
  var js = compileAndTool(source, full, format);
  var ext = getExtension(format);
  var outFile = full.slice(0, -4) + ext;
  try {
    fs.writeFileSync(outFile, js + '\n', 'utf8');
  } catch (e) {
    throw new Error('Cannot write "' + outFile + '": ' + e.message);
  }
  return outFile;
}

function runOne(full, args) {
  var source = readSource(full);
  var config = readConfig(process.cwd());
  var format = resolveFormat(source, args, config, true);
  var js = compileAndTool(source, full, format);
  var ext = getExtension(format);
  var temp = full.slice(0, -4) + '.humal-run-' + process.pid + '-' + Date.now() + ext;
  try {
    fs.writeFileSync(temp, js + '\n', 'utf8');
  } catch (e) {
    fail('Cannot create temporary file: ' + e.message);
  }
  var status;
  try {
    var res = child.spawnSync(process.execPath, [temp], { stdio: 'inherit' });
    if (res.error) {
      console.error('Error: ' + res.error.message);
      status = 1;
    } else {
      status = res.status == null ? 1 : res.status;
    }
  } finally {
    try {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    } catch (e) {}
  }
  process.exit(status);
}

function formatSource(source) {
  var lines = source.replace(/\r\n?/g, '\n').split('\n');
  for (var i = 0; i < lines.length; i++) {
    lines[i] = lines[i].replace(/[ \t]+$/g, '');
  }
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n') + '\n';
}

function formatOne(full) {
  var source = readSource(full);
  var formatted = formatSource(source);
  if (formatted !== source) {
    try {
      fs.writeFileSync(full, formatted, 'utf8');
    } catch (e) {
      fail('Cannot write "' + full + '": ' + e.message);
    }
    console.log('Formatted ' + path.relative(process.cwd(), full));
  } else {
    console.log('Already formatted ' + path.relative(process.cwd(), full));
  }
}

function loadChokidar() {
  try {
    return require('chokidar');
  } catch (e) {
    fail('The "chokidar" package is required for watch/dev. ' +
         'Install it with: npm install chokidar@^4.0.3');
  }
}

function watchTarget(target, config, args, onChange) {
  var chokidar = loadChokidar();
  var watcher = chokidar.watch(target, {
    ignored: /(^|[\/\\])(\.git|node_modules)([\/\\]|$)/,
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
  });
  watcher.on('error', function (error) {
    console.error('Watcher error: ' + error.message);
  });
  watcher.on('all', function (event, file) {
    if (path.extname(file).toLowerCase() !== '.hum') return;
    if (event !== 'change' && event !== 'add' && event !== 'unlink') return;
    onChange(event, path.resolve(file));
  });
  return watcher;
}

function rmOutputFiles(sourceFile) {
  var base = sourceFile.slice(0, -4);
  var outputs = [base + '.mjs', base + '.cjs'];
  for (var i = 0; i < outputs.length; i++) {
    try {
      if (fs.existsSync(outputs[i])) fs.unlinkSync(outputs[i]);
    } catch (e) {
      console.error('Cannot remove "' + outputs[i] + '": ' + e.message);
    }
  }
}

function Watch(target, config, args) {
  var fullTarget = path.resolve(target);
  validateFormat(args);
  if (!fs.existsSync(fullTarget)) fail('Path "' + target + '" not found.');
  console.log('Humal watch mode');
  console.log('Watching: ' + fullTarget);
  console.log('');
  if (fs.statSync(fullTarget).isFile()) {
    try {
      buildOne(Humalfile(fullTarget), config, args);
      console.log('Initial build complete.');
    } catch (e) {
      console.error(e.message);
    }
  } else {
    console.log('Watching Humal files...');
  }
  var watcher = watchTarget(fullTarget, config, args, function (event, file) {
    console.log('');
    console.log('[' + event + '] ' + file);
    if (event === 'unlink') {
      rmOutputFiles(file);
      console.log('File removed.');
      return;
    }
    try {
      var out = buildOne(file, config, args);
      console.log('Built: ' + out);
    } catch (e) {
      console.error(e.message);
    }
  });
  process.on('SIGINT', function () {
    console.log('');
    console.log('Stopped.');
    watcher.close();
    process.exit(0);
  });
}

function buildProject(sourceDir, config, args) {
  var files = collectfiles(sourceDir);
  var outputs = [];
  for (var i = 0; i < files.length; i++) {
    outputs.push(buildOne(files[i], config, args));
  }
  return outputs;
}

function checkProject(sourceDir, config, args) {
  var files = collectfiles(sourceDir);
  var passed = 0, failed = 0;
  for (var i = 0; i < files.length; i++) {
    if (checkOne(files[i], config, args)) passed++;
    else failed++;
  }
  console.log('');
  console.log('Checked ' + files.length + ' file(s): ' + passed + ' passed, ' + failed + ' failed.');
  if (failed > 0) process.exit(1);
}

function Dev() {
  var cwd = process.cwd();
  var config = readConfig(cwd);
  if (!config.exists) fail('humal.config.json not found. Run "humal init" first.');
  var sourceDir = path.resolve(cwd, config.sourceDir);
  var entry = path.resolve(cwd, config.entry);
  if (!fs.existsSync(sourceDir)) fail('Source directory not found: ' + sourceDir);

  var currentChild = null;

  function stopCurrent() {
    if (!currentChild) return;
    var c = currentChild;
    currentChild = null;
    try { c.kill('SIGTERM'); } catch (e) {}
  }

  function buildEntry() {
    var outputs = buildProject(sourceDir, config, []);
    if (!fs.existsSync(entry)) throw new Error('Entry file not found: ' + entry);
    var source = readSource(entry);
    var format = resolveFormat(source, [], config, true);
    var ext = getExtension(format);
    var builtEntry = entry.slice(0, -4) + ext;
    if (!fs.existsSync(builtEntry)) throw new Error('Built entry file not found: ' + builtEntry);
    return { outputs: outputs, file: builtEntry };
  }

  function startEntry(builtEntry) {
    stopCurrent();
    console.log('');
    console.log('Starting ' + builtEntry);
    console.log('');
    var spawned = child.spawn(process.execPath, [builtEntry], { stdio: 'inherit' });
    currentChild = spawned;
    spawned.on('error', function (error) {
      if (currentChild !== spawned) return;
      currentChild = null;
      console.error('\nFailed to start process: ' + error.message);
    });
    spawned.on('exit', function (code, signal) {
      if (currentChild !== spawned) return;
      currentChild = null;
      if (signal) console.log('\nProcess stopped by signal ' + signal + '.');
      else if (code !== 0) console.log('\nProcess exited with code ' + code + '.');
    });
  }

  function buildAndStart() {
    var result = buildEntry();
    startEntry(result.file);
  }

  console.log('Humal development mode');
  console.log('');
  try {
    buildAndStart();
  } catch (e) {
    fail(e.message);
  }

  var rebuilding = false;
  var pending = false;

  function rebuild() {
    if (rebuilding) { pending = true; return; }
    rebuilding = true;
    try {
      buildAndStart();
      console.log('Build successful.');
    } catch (e) {
      console.error('');
      console.error(e.message);
      console.error('Keeping the previous process running.');
    } finally {
      rebuilding = false;
      if (pending) { pending = false; rebuild(); }
    }
  }

  var watcher = watchTarget(sourceDir, config, [], function (event, file) {
    console.log('');
    console.log('[' + event + '] ' + file);
    if (event === 'unlink') {
      rmOutputFiles(file);
      if (path.resolve(file) === entry) {
        stopCurrent();
        console.error('Entry file removed: ' + entry);
        return;
      }
    }
    rebuild();
  });

  process.on('SIGINT', function () {
    console.log('');
    console.log('Stopping Humal dev...');
    watcher.close();
    stopCurrent();
    process.exit(0);
  });
}

function init(target) {
  var dir = path.resolve(target || '.');
  var configFile = path.join(dir, 'humal.config.json');
  var srcDir = path.join(dir, 'src');
  var entry = path.join(srcDir, 'main.hum');
  var gitignore = path.join(dir, '.gitignore');
  var packageFile = path.join(dir, 'package.json');

  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); }
    catch (e) { fail('Cannot create directory "' + dir + '": ' + e.message); }
  }
  if (!fs.existsSync(srcDir)) {
    try { fs.mkdirSync(srcDir, { recursive: true }); }
    catch (e) { fail('Cannot create directory "' + srcDir + '": ' + e.message); }
  }

  try {
    if (!fs.existsSync(configFile)) {
      fs.writeFileSync(configFile, JSON.stringify({
        entry: 'src/main.hum',
        sourceDir: 'src',
        module: 'esm'
      }, null, 2) + '\n', 'utf8');
    }
    if (!fs.existsSync(entry)) {
      fs.writeFileSync(entry, 'print "Hello from Humal!"\n', 'utf8');
    }
    if (!fs.existsSync(gitignore)) {
      fs.writeFileSync(gitignore,
        'node_modules/\n*.mjs\n*.cjs\n.humal-tool-*\n.humal-run-*\n', 'utf8');
    }
    if (!fs.existsSync(packageFile)) {
      var name = path.basename(dir).toLowerCase()
        .replace(/[^a-z0-9._-]/g, '-')
        .replace(/^[._-]+|[._-]+$/g, '') || 'humal-app';
      fs.writeFileSync(packageFile, JSON.stringify({
        name: name,
        private: true,
        scripts: {
          dev: 'humal dev',
          build: 'humal build',
          check: 'humal check'
        },
        devDependencies: { '@qvelop444/humal': pkg.version }
      }, null, 2) + '\n', 'utf8');
    }
  } catch (e) {
    fail('Cannot initialize project: ' + e.message);
  }

  console.log('');
  console.log('Humal project created: ' + dir);
  console.log('');
  console.log('Next steps:');
  console.log('  cd ' + path.relative(process.cwd(), dir));
  console.log('  npm install');
  console.log('  humal dev');
  console.log('');
}

function Check(args) {
  var cwd = process.cwd();
  var config = readConfig(cwd);
  var positionals = getPosition(args);
  validateFormat(args);
  if (positionals.length > 1) fail('Expected one file or directory.');
  var target;
  if (positionals[0]) target = positionals[0];
  else if (config.exists) target = path.resolve(cwd, config.sourceDir);
  else target = cwd;
  var files = resolveTargets(target);
  if (files.length === 0) {
    console.log('No Humal files found.');
    return;
  }
  var passed = 0, failed = 0;
  for (var i = 0; i < files.length; i++) {
    if (checkOne(files[i], config, args)) passed++;
    else failed++;
  }
  console.log('');
  console.log('Checked ' + files.length + ' file(s): ' + passed + ' passed, ' + failed + ' failed.');
  if (failed > 0) process.exit(1);
}

function Build(args) {
  var cwd = process.cwd();
  var config = readConfig(cwd);
  var positionals = getPosition(args);
  validateFormat(args);
  if (positionals.length > 1) fail('Expected one file or directory.');

  if (!positionals[0]) {
    if (!config.exists) usage(1);
    var sourceDir = path.resolve(cwd, config.sourceDir);
    if (!fs.existsSync(sourceDir)) fail('Source directory not found: ' + sourceDir);
    try {
      var outputs = buildProject(sourceDir, config, args);
      for (var i = 0; i < outputs.length; i++) console.log(outputs[i]);
    } catch (e) { fail(e.message); }
    return;
  }

  var target = path.resolve(positionals[0]);
  if (!fs.existsSync(target)) fail('Path "' + positionals[0] + '" not found.');
  if (fs.statSync(target).isDirectory()) {
    var projectOutputs = buildProject(target, config, args);
    for (var j = 0; j < projectOutputs.length; j++) console.log(projectOutputs[j]);
    return;
  }
  try {
    var full = Humalfile(target);
    console.log(buildOne(full, config, args));
  } catch (e) { fail(e.message); }
}

function Fmt(args) {
  var cwd = process.cwd();
  var config = readConfig(cwd);
  for (var i = 0; i < args.length; i++) {
    if (args[i][0] === '-') fail('Unknown option: ' + args[i]);
  }
  var positionals = getPosition(args);
  if (positionals.length > 1) fail('Expected one file or directory.');
  var target;
  if (positionals[0]) target = positionals[0];
  else if (config.exists) target = path.resolve(cwd, config.sourceDir);
  else target = cwd;
  var files = resolveTargets(target);
  for (var j = 0; j < files.length; j++) formatOne(files[j]);
}

function Watchcom(args) {
  var cwd = process.cwd();
  var config = readConfig(cwd);
  var positionals = getPosition(args);
  validateFormat(args);
  if (positionals.length > 1) fail('Expected one file or directory.');
  var target;
  if (positionals[0]) target = positionals[0];
  else if (config.exists) target = path.resolve(cwd, config.sourceDir);
  else target = cwd;
  Watch(target, config, args);
}

if (argv.length === 0) usage(1);

var first = argv[0];

if (first === 'version' || first === '-v') {
  if (argv.length > 1) fail('The "version" command does not accept arguments.');
  console.log(pkg.version);
  process.exit(0);
}

if (first === 'init') {
  if (argv.length > 2) fail('Expected one directory.');
  init(argv[1]);
  process.exit(0);
}

if (first === 'check') {
  Check(argv.slice(1));
  process.exit(0);
}

if (first === 'fmt') {
  Fmt(argv.slice(1));
  process.exit(0);
}

if (first === 'watch') {
  Watchcom(argv.slice(1));
} else if (first === 'dev') {
  if (argv.length > 1) fail('The "dev" command does not accept arguments.');
  Dev();
} else {
  var cmd, file;
  if (first === 'build') {
    cmd = 'build';
    file = argv[1];
  } else if (first[0] === '-') {
    usage(1);
  } else {
    cmd = 'run';
    file = first;
  }

  if (cmd === 'build') {
    Build(argv.slice(1));
    process.exit(0);
  }

  if (!file) usage(1);
  runOne(Humalfile(file), argv.slice(1));
}