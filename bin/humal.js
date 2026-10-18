#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const child = require('child_process');

const { compile } = require('../src/compiler');
const tooling = require('../src/tooling');
const pkg = require('../package.json');

const argv = process.argv.slice(2);

function usage(code) {
  console.log('');
  console.log('Usage:');
  console.log('  humal <file.hum> [--esm|--cjs]');
  console.log('  humal build [file.hum|dir] [--esm|--cjs]');
  console.log('  humal check [file.hum|dir] [--esm|--cjs]');
  console.log('  humal fmt [file.hum|dir]');
  console.log('  humal watch [file.hum|dir] [--esm|--cjs]');
  console.log('  humal dev');
  console.log('  humal init [dir] [--env node|browser]');
  console.log('  humal dev:web');
  console.log('  humal build:web');
  console.log('  humal version');
  console.log('');
  process.exit(code == null ? 0 : code);
}

function fail(message, code) {
  console.error('Error: ' + message);
  process.exit(code == null ? 1 : code);
}

function hasFlag(args, flag) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) return true;
  }
  return false;
}

function validateFormat(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--esm' || args[i] === '--cjs') continue;
    if (args[i][0] === '-') fail('Unknown option: ' + args[i]);
  }
}

function getPositionals(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--esm' || args[i] === '--cjs') continue;
    out.push(args[i]);
  }
  return out;
}

function readConfig(cwd) {
  const file = path.join(cwd, 'humal.config.json');

  if (!fs.existsSync(file)) {
    return {
      exists: false,
      file,
      entry: 'src/main.hum',
      sourceDir: 'src',
      module: null,
      env: 'node',
      webEntry: 'index.html'
    };
  }

  let config;
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
  if (config.env == null) config.env = 'node';
  if (config.webEntry == null) config.webEntry = 'index.html';

  if (typeof config.entry !== 'string' || !config.entry.trim()) {
    fail('Invalid humal.config.json: "entry" must be a non-empty string.');
  }
  if (typeof config.sourceDir !== 'string' || !config.sourceDir.trim()) {
    fail('Invalid humal.config.json: "sourceDir" must be a non-empty string.');
  }
  if (config.module != null && config.module !== 'esm' && config.module !== 'cjs') {
    fail('Invalid humal.config.json: "module" must be "esm", "cjs", or null.');
  }
  if (config.env !== 'node' && config.env !== 'browser') {
    fail('Invalid humal.config.json: "env" must be "node" or "browser".');
  }
  if (typeof config.webEntry !== 'string' || !config.webEntry.trim()) {
    fail('Invalid humal.config.json: "webEntry" must be a non-empty string.');
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

function resolveHumFile(file) {
  const full = path.resolve(file);
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

  const wantEsm = hasFlag(args, '--esm');
  const wantCjs = hasFlag(args, '--cjs');

  if (wantEsm && wantCjs) fail('Use only one of --esm or --cjs.');
  if (wantEsm) return 'esm';
  if (wantCjs) return 'cjs';
  if (useConfig && config.module) return config.module;
  return detectFormat(source);
}

function getExtension(format) {
  return format === 'esm' ? '.mjs' : '.cjs';
}

function collectFiles(dir) {
  const result = [];

  function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (e) {
      fail('Cannot read directory "' + current + '": ' + e.message);
    }

    for (const entry of entries) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === '.hg' ||
        entry.name === '.svn'
      ) continue;

      const full = path.join(current, entry.name);

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

  const full = path.resolve(target);
  if (!fs.existsSync(full)) fail('Path "' + target + '" not found.');
  if (fs.statSync(full).isDirectory()) return collectFiles(full);
  return [resolveHumFile(full)];
}

function compileAndTool(source, full, format, config) {
  let js;

  try {
    js = compile(source, format);
  } catch (e) {
    throw new Error(full + ': ' + e.message);
  }

  try {
    return tooling.process(js, full, format, config);
  } catch (e) {
    throw new Error(full + ': ' + e.message);
  }
}

function checkOne(full, config, args) {
  const source = readSource(full);
  const format = resolveFormat(source, args, config, true);

  console.log('Checking ' + path.relative(process.cwd(), full));

  let js;
  try {
    js = compile(source, format);
  } catch (e) {
    console.error('  ✗ Humal compiler');
    console.error('    ' + e.message);
    return false;
  }

  try {
    tooling.checkTypes(js, full, format, config);
  } catch (e) {
    console.error('  ✗ TypeScript');
    console.error('    ' + e.message);
    return false;
  }

  try {
    tooling.lint(js, full, format, config);
  } catch (e) {
    console.error('  ✗ ESLint');
    console.error('    ' + e.message);
    return false;
  }

  console.log('  ✓ OK');
  return true;
}

function buildOne(full, config, args) {
  const source = readSource(full);
  const format = resolveFormat(source, args, config, true);
  const js = compileAndTool(source, full, format, config);

  const outFile = full.slice(0, -4) + getExtension(format);

  try {
    fs.writeFileSync(outFile, js + '\n', 'utf8');
  } catch (e) {
    throw new Error('Cannot write "' + outFile + '": ' + e.message);
  }

  return outFile;
}

function runOne(full, args) {
  const source = readSource(full);
  const config = readConfig(process.cwd());
  const format = resolveFormat(source, args, config, true);
  const js = compileAndTool(source, full, format, config);

  const temp =
    full.slice(0, -4) +
    '.humal-run-' + process.pid + '-' + Date.now() +
    getExtension(format);

  try {
    fs.writeFileSync(temp, js + '\n', 'utf8');
  } catch (e) {
    fail('Cannot create temporary file: ' + e.message);
  }

  let status;
  try {
    const res = child.spawnSync(process.execPath, [temp], { stdio: 'inherit' });
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
  const lines = source.replace(/\r\n?/g, '\n').split('\n');

  for (let i = 0; i < lines.length; i++) {
    lines[i] = lines[i].replace(/[ \t]+$/g, '');
  }

  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();

  return lines.join('\n') + '\n';
}

function formatOne(full) {
  const source = readSource(full);
  const formatted = formatSource(source);

  if (formatted === source) {
    console.log('Already formatted ' + path.relative(process.cwd(), full));
    return;
  }

  try {
    fs.writeFileSync(full, formatted, 'utf8');
  } catch (e) {
    fail('Cannot write "' + full + '": ' + e.message);
  }

  console.log('Formatted ' + path.relative(process.cwd(), full));
}

function loadChokidar() {
  try {
    return require('chokidar');
  } catch (e) {
    fail(
      'The "chokidar" package is required for watch/dev. ' +
      'Install it with: npm install chokidar@^4.0.3'
    );
  }
}

function watchTarget(target, onChange) {
  const chokidar = loadChokidar();

  const watcher = chokidar.watch(target, {
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
  const base = sourceFile.slice(0, -4);

  for (const output of [base + '.mjs', base + '.cjs']) {
    try {
      if (fs.existsSync(output)) fs.unlinkSync(output);
    } catch (e) {
      console.error('Cannot remove "' + output + '": ' + e.message);
    }
  }
}

function watchCommand(target, config, args) {
  const fullTarget = path.resolve(target);

  validateFormat(args);

  if (!fs.existsSync(fullTarget)) fail('Path "' + target + '" not found.');

  console.log('Humal watch mode');
  console.log('Watching: ' + fullTarget);
  console.log('');

  if (fs.statSync(fullTarget).isFile()) {
    try {
      buildOne(resolveHumFile(fullTarget), config, args);
      console.log('Initial build complete.');
    } catch (e) {
      console.error(e.message);
    }
  } else {
    console.log('Watching Humal files...');
  }

  const watcher = watchTarget(fullTarget, function (event, file) {
    console.log('');
    console.log('[' + event + '] ' + file);

    if (event === 'unlink') {
      rmOutputFiles(file);
      console.log('File removed.');
      return;
    }

    try {
      const out = buildOne(file, config, args);
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
  const files = collectFiles(sourceDir);
  const outputs = [];

  for (const file of files) {
    outputs.push(buildOne(file, config, args));
  }

  return outputs;
}

function devCommand() {
  const cwd = process.cwd();
  const config = readConfig(cwd);

  if (!config.exists) fail('humal.config.json not found. Run "humal init" first.');

  const sourceDir = path.resolve(cwd, config.sourceDir);
  const entry = path.resolve(cwd, config.entry);

  if (!fs.existsSync(sourceDir)) fail('Source directory not found: ' + sourceDir);

  let currentChild = null;

  function stopCurrent() {
    if (!currentChild) return;
    const c = currentChild;
    currentChild = null;
    try { c.kill('SIGTERM'); } catch (e) {}
  }

  function buildEntry() {
    const outputs = buildProject(sourceDir, config, []);

    if (!fs.existsSync(entry)) throw new Error('Entry file not found: ' + entry);

    const source = readSource(entry);
    const format = resolveFormat(source, [], config, true);
    const builtEntry = entry.slice(0, -4) + getExtension(format);

    if (!fs.existsSync(builtEntry)) throw new Error('Built entry file not found: ' + builtEntry);

    return { outputs, file: builtEntry };
  }

  function startEntry(builtEntry) {
    stopCurrent();

    console.log('');
    console.log('Starting ' + builtEntry);
    console.log('');

    const spawned = child.spawn(process.execPath, [builtEntry], { stdio: 'inherit' });
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
    const result = buildEntry();
    startEntry(result.file);
  }

  console.log('Humal development mode');
  console.log('');

  try {
    buildAndStart();
  } catch (e) {
    fail(e.message);
  }

  let rebuilding = false;
  let pending = false;

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

  const watcher = watchTarget(sourceDir, function (event, file) {
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

function runParcel(mode) {
  const cwd = process.cwd();
  const config = readConfig(cwd);

  if (!config.exists) {
    fail('humal.config.json not found. Run "humal init" first.');
  }

  if (config.env !== 'browser') {
    fail('This command requires "env": "browser" in humal.config.json.');
  }

  const entry = config.webEntry || 'index.html';
  const fullEntry = path.resolve(cwd, entry);

  if (!fs.existsSync(fullEntry)) {
    fail('Browser entry file not found: ' + fullEntry);
  }

  const parcelBin = path.join(
    cwd,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'parcel.cmd' : 'parcel'
  );

  if (!fs.existsSync(parcelBin)) {
    fail('Parcel is not installed in this project. Run "npm install" first.');
  }

  const args = mode === 'build' ? ['build', entry] : [entry];
  const proc = child.spawn(parcelBin, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  proc.on('error', function (error) {
    console.error('Failed to start Parcel: ' + error.message);
    process.exitCode = 1;
  });

  proc.on('exit', function (code, signal) {
    process.exitCode = signal ? 1 : (code == null ? 1 : code);
  });
}

function initCommand(args) {
  let target = '.';
  let env = null;
  let hasTarget = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env') {
      if (i + 1 >= args.length) fail('Expected "node" or "browser" after --env.');
      env = args[++i];
      if (env !== 'node' && env !== 'browser') {
        fail('Invalid environment. Use --env node or --env browser.');
      }
    } else if (args[i][0] === '-') {
      fail('Unknown init option: ' + args[i]);
    } else if (!hasTarget) {
      target = args[i];
      hasTarget = true;
    } else {
      fail('Expected one project directory.');
    }
  }

  init(target, env);
}

function init(target, env) {
  const dir = path.resolve(target || '.');
  const configFile = path.join(dir, 'humal.config.json');
  const gitignoreFile = path.join(dir, '.gitignore');
  const packageFile = path.join(dir, 'package.json');

  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      fail('Cannot create directory "' + dir + '": ' + e.message);
    }
  }

  let config;
  try {
    if (fs.existsSync(configFile)) {
      config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      if (!config || typeof config !== 'object' || Array.isArray(config)) {
        fail('Invalid humal.config.json: root value must be an object.');
      }
    } else {
      config = {};
    }

    if (config.entry == null) config.entry = 'src/main.hum';
    if (config.sourceDir == null) config.sourceDir = 'src';
    if (config.module == null) config.module = 'esm';
    if (env) config.env = env;
    if (config.env == null) config.env = 'node';
    if (config.webEntry == null) config.webEntry = 'index.html';

    if (typeof config.entry !== 'string' || !config.entry.trim()) {
      fail('Invalid humal.config.json: "entry" must be a non-empty string.');
    }
    if (typeof config.sourceDir !== 'string' || !config.sourceDir.trim()) {
      fail('Invalid humal.config.json: "sourceDir" must be a non-empty string.');
    }
    if (config.module !== 'esm' && config.module !== 'cjs') {
      fail('Invalid humal.config.json: "module" must be "esm" or "cjs".');
    }
    if (config.env !== 'node' && config.env !== 'browser') {
      fail('Invalid humal.config.json: "env" must be "node" or "browser".');
    }
    if (typeof config.webEntry !== 'string' || !config.webEntry.trim()) {
      fail('Invalid humal.config.json: "webEntry" must be a non-empty string.');
    }

    fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n', 'utf8');
  } catch (e) {
    fail('Cannot initialize project configuration: ' + e.message);
  }

  const browser = config.env === 'browser';
  const srcDir = path.resolve(dir, config.sourceDir);
  const entry = path.resolve(dir, config.entry);

  try {
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(path.dirname(entry), { recursive: true });

    if (!fs.existsSync(entry)) {
      const initialSource = browser
        ? 'web.document.title = "Humal Web"\n' +
          'web.text("#status", "Humal Web is running")\n'
        : 'print "Hello from Humal!"\n';
      fs.writeFileSync(entry, initialSource, 'utf8');
    }

    if (!fs.existsSync(gitignoreFile)) {
      fs.writeFileSync(
        gitignoreFile,
        'node_modules/\n*.mjs\n*.cjs\n.humal-tool-*\n.humal-run-*\n',
        'utf8'
      );
    }

    if (browser) {
      const parcelrcFile = path.join(dir, '.parcelrc');
      const htmlFile = path.resolve(dir, config.webEntry);
      fs.mkdirSync(path.dirname(htmlFile), { recursive: true });

      if (!fs.existsSync(parcelrcFile)) {
        fs.writeFileSync(
          parcelrcFile,
          JSON.stringify({
            extends: '@parcel/config-default',
            transformers: {
            '*.hum': ['./node_modules/@qvelop444/humal/src/parcel.js']
            }
          }, null, 2) + '\n',
          'utf8'
        );
      }

      if (!fs.existsSync(htmlFile)) {
        let relativeEntry = path
          .relative(path.dirname(htmlFile), entry)
          .split(path.sep)
          .join('/');
        if (relativeEntry[0] !== '.') relativeEntry = './' + relativeEntry;

        fs.writeFileSync(htmlFile, [
          '<!doctype html>',
          '<html lang="en">',
          '<head>',
          '  <meta charset="utf-8">',
          '  <meta name="viewport" content="width=device-width, initial-scale=1">',
          '  <title>Humal Web</title>',
          '</head>',
          '<body>',
          '  <h1>Humal Web</h1>',
          '  <p id="status">Loading...</p>',
          '  <script type="module" src="' + relativeEntry + '"></script>',
          '</body>',
          '</html>',
          ''
        ].join('\n'), 'utf8');
      }
    }

    let packageConfig;
    if (fs.existsSync(packageFile)) {
      packageConfig = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
      if (!packageConfig || typeof packageConfig !== 'object' || Array.isArray(packageConfig)) {
        fail('Invalid package.json: root value must be an object.');
      }
    } else {
      const projectName = path.basename(dir).toLowerCase()
        .replace(/[^a-z0-9._-]/g, '-')
        .replace(/^[._-]+|[._-]+$/g, '') || 'humal-app';

      packageConfig = {
        name: projectName,
        private: true,
        scripts: {},
        devDependencies: {}
      };
    }

    if (!packageConfig.name) {
      packageConfig.name = path.basename(dir).toLowerCase()
        .replace(/[^a-z0-9._-]/g, '-')
        .replace(/^[._-]+|[._-]+$/g, '') || 'humal-app';
    }

    if (packageConfig.private == null) packageConfig.private = true;

    if (!packageConfig.scripts || typeof packageConfig.scripts !== 'object' || Array.isArray(packageConfig.scripts)) {
      packageConfig.scripts = {};
    }

    if (!packageConfig.devDependencies || typeof packageConfig.devDependencies !== 'object' || Array.isArray(packageConfig.devDependencies)) {
      packageConfig.devDependencies = {};
    }

    if (!packageConfig.devDependencies['@qvelop444/humal']) {
      packageConfig.devDependencies['@qvelop444/humal'] = pkg.version;
    }

    if (browser) {
      if (!packageConfig.devDependencies.parcel) {
        packageConfig.devDependencies.parcel =
          (pkg.devDependencies && pkg.devDependencies.parcel) || '^2.16.4';
      }

      packageConfig.scripts.dev = 'humal dev:web';
      packageConfig.scripts.build = 'humal build:web';
      packageConfig.scripts['dev:web'] = 'humal dev:web';
      packageConfig.scripts['build:web'] = 'humal build:web';
    } else {
      if (!packageConfig.scripts.dev) packageConfig.scripts.dev = 'humal dev';
      if (!packageConfig.scripts.build) packageConfig.scripts.build = 'humal build';
    }

    if (!packageConfig.scripts.check) packageConfig.scripts.check = 'humal check';

    fs.writeFileSync(packageFile, JSON.stringify(packageConfig, null, 2) + '\n', 'utf8');
  } catch (e) {
    fail('Cannot initialize project: ' + e.message);
  }

  console.log('');
  console.log('Humal project created: ' + dir);
  console.log('');
  console.log('Next steps:');
  console.log('  cd ' + path.relative(process.cwd(), dir));
  console.log('  npm install');
  console.log(browser ? '  npm run dev:web' : '  humal dev');
  console.log('');
}

function checkCommand(args) {
  const cwd = process.cwd();
  const config = readConfig(cwd);
  const positionals = getPositionals(args);

  validateFormat(args);

  if (positionals.length > 1) fail('Expected one file or directory.');

  let target;
  if (positionals[0]) target = positionals[0];
  else if (config.exists) target = path.resolve(cwd, config.sourceDir);
  else target = cwd;

  const files = resolveTargets(target);

  if (files.length === 0) {
    console.log('No Humal files found.');
    return;
  }

  let passed = 0;
  let failed = 0;

  for (const file of files) {
    if (checkOne(file, config, args)) passed++;
    else failed++;
  }

  console.log('');
  console.log('Checked ' + files.length + ' file(s): ' + passed + ' passed, ' + failed + ' failed.');

  if (failed > 0) process.exit(1);
}

function buildCommand(args) {
  const cwd = process.cwd();
  const config = readConfig(cwd);
  const positionals = getPositionals(args);

  validateFormat(args);

  if (positionals.length > 1) fail('Expected one file or directory.');

  if (!positionals[0]) {
    if (!config.exists) usage(1);

    const sourceDir = path.resolve(cwd, config.sourceDir);
    if (!fs.existsSync(sourceDir)) fail('Source directory not found: ' + sourceDir);

    try {
      const outputs = buildProject(sourceDir, config, args);
      for (const output of outputs) console.log(output);
    } catch (e) {
      fail(e.message);
    }

    return;
  }

  const target = path.resolve(positionals[0]);
  if (!fs.existsSync(target)) fail('Path "' + positionals[0] + '" not found.');

  if (fs.statSync(target).isDirectory()) {
    const outputs = buildProject(target, config, args);
    for (const output of outputs) console.log(output);
    return;
  }

  try {
    const full = resolveHumFile(target);
    console.log(buildOne(full, config, args));
  } catch (e) {
    fail(e.message);
  }
}

function fmtCommand(args) {
  const cwd = process.cwd();
  const config = readConfig(cwd);

  for (const arg of args) {
    if (arg[0] === '-') fail('Unknown option: ' + arg);
  }

  const positionals = getPositionals(args);
  if (positionals.length > 1) fail('Expected one file or directory.');

  let target;
  if (positionals[0]) target = positionals[0];
  else if (config.exists) target = path.resolve(cwd, config.sourceDir);
  else target = cwd;

  const files = resolveTargets(target);
  for (const file of files) formatOne(file);
}

function watchCommandEntry(args) {
  const cwd = process.cwd();
  const config = readConfig(cwd);
  const positionals = getPositionals(args);

  validateFormat(args);

  if (positionals.length > 1) fail('Expected one file or directory.');

  let target;
  if (positionals[0]) target = positionals[0];
  else if (config.exists) target = path.resolve(cwd, config.sourceDir);
  else target = cwd;

  watchCommand(target, config, args);
}

if (argv.length === 0) usage(1);

const first = argv[0];

if (first === 'version' || first === '-v') {
  if (argv.length > 1) fail('The "version" command does not accept arguments.');
  console.log(pkg.version);
  process.exit(0);
}

if (first === 'init') {
  initCommand(argv.slice(1));
  process.exit(0);
}

if (first === 'check') {
  checkCommand(argv.slice(1));
  process.exit(0);
}

if (first === 'fmt') {
  fmtCommand(argv.slice(1));
  process.exit(0);
}

if (first === 'dev:web') {
  if (argv.length > 1) fail('The "dev:web" command takes no arguments.');
  runParcel('dev');
} else if (first === 'build:web') {
  if (argv.length > 1) fail('The "build:web" command takes no arguments.');
  runParcel('build');
} else if (first === 'watch') {
  watchCommandEntry(argv.slice(1));
} else if (first === 'dev') {
  if (argv.length > 1) fail('The "dev" command does not accept arguments.');
  devCommand();
} else {
  let cmd;
  let file;

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
    buildCommand(argv.slice(1));
    process.exit(0);
  }

  if (!file) usage(1);
  runOne(resolveHumFile(file), argv.slice(1));
}
