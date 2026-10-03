// calculates the line/column based on the offset in the source file
function lineInfo(src, pos) {
  var row = 1, col = 1, i;
  for (i = 0; i < pos; i++) {
    if (src.charCodeAt(i) === 10) { // \n
      row++;
      col = 1;
    } else {
      col++;
    }
  }
  var all = src.split(/\r?\n/);
  return { line: row, column: col, text: all[row - 1] || '' };
}

// unified format for compiler errors
function error(msg, src, pos) {
  var loc = lineInfo(src, pos);
  var snippet = loc.text.trim();
  if (snippet.length > 60) {
    snippet = snippet.slice(0, 57) + '...';
  }
  var tail = snippet ? ' near "' + snippet + '"' : '';
  return new Error(msg + ' at line ' + loc.line + ', column ' + loc.column + tail);
}

// removes comments outside string literals
function rmComments(src) {
  var out = '';
  var state = 'code';
  var quote = null;
  var stringStart = 0;
  var i = 0;
  while (i < src.length) {
    var ch = src[i];
    if (state === 'code') {
      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
        stringStart = i;
        state = 'string';
        out += ch;
        i++;
        continue;
      }
      if (ch === '/' && src[i + 1] === '/') {
        state = 'comment';
        i += 2;
        continue;
      }
      out += ch;
      i++;
      continue;
    }
    if (state === 'comment') {
      if (ch === '\n') {
        out += '\n';
        state = 'code';
      }
      i++;
      continue;
    }
    out += ch;
    if (ch === '\\') {
      if (i + 1 >= src.length) {
        throw error('Dangling escape in string', src, i);
      }
      out += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === quote) {
      state = 'code';
      quote = null;
      i++;
      continue;
    }
    if (quote !== '`' && (ch === '\n' || ch === '\r')) {
      throw error('Unterminated string', src, stringStart);
    }
    i++;
  }
  if (state === 'string') {
    throw error('Unterminated string', src, stringStart);
  }
  return out;
}

// catches invalid characters and a ":" at the end of the string
function checkLine(row, src, base, lexerState) {
  var quote = lexerState.quote;
  var stringStart = lexerState.stringStart;
  var i, ch;
  for (i = 0; i < row.length; i++) {
    ch = row[i];
    if (quote) {
      if (ch === '\\') {
        if (i + 1 >= row.length) {
          continue;
        }
        i++;
        continue;
      }
      if (ch === quote) {
        quote = null;
        stringStart = 0;
        continue;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      stringStart = base + i;
      continue;
    }
    if (ch === ';') {
      throw error("Unexpected ';'", src, base + i);
    }
  }
  lexerState.quote = quote;
  lexerState.stringStart = stringStart;
  if (!quote && /:\s*$/.test(row)) {
    throw error('Block syntax cannot use ":"', src, base + row.lastIndexOf(':'));
  }
}

// removes the outer parentheses from the condition
function condition(expr) {
  expr = expr.trim();
  if (expr.length >= 2 && expr.charAt(0) === '(' && expr.charAt(expr.length - 1) === ')') {
    return expr.slice(1, -1).trim();
  }
  return expr;
}

function isIdentStart(ch) {
  return !!ch && /[A-Za-z_$]/.test(ch);
}

function isIdentPart(ch) {
  return !!ch && /[A-Za-z0-9_$]/.test(ch);
}

function readIdent(s, pos) {
  if (!isIdentStart(s[pos])) {
    return null;
  }
  var start = pos;
  pos++;
  while (pos < s.length && isIdentPart(s[pos])) {
    pos++;
  }
  return { value: s.slice(start, pos), end: pos };
}

function skipSpace(s, pos) {
  while (pos < s.length && (s[pos] === ' ' || s[pos] === '\t')) {
    pos++;
  }
  return pos;
}

function readString(s, start) {
  var quote = s[start];
  var p = start + 1;
  while (p < s.length) {
    if (s[p] === '\\') {
      if (p + 1 >= s.length) {
        throw new Error('Dangling escape in string');
      }
      p += 2;
      continue;
    }
    if (s[p] === quote) {
      return p + 1;
    }
    if (quote !== '`' && (s[p] === '\n' || s[p] === '\r')) {
      return -1;
    }
    p++;
  }
  return -1;
}

function readBal(s, start) {
  if (s[start] !== '(') {
    return null;
  }
  var depth = 0;
  var quote = null;
  var stringStart = start;
  var p, ch;
  for (p = start; p < s.length; p++) {
    ch = s[p];
    if (quote) {
      if (ch === '\\') {
        if (p + 1 >= s.length) {
          throw new Error('Dangling escape in string');
        }
        p++;
        continue;
      }
      if (ch === quote) {
        quote = null;
        continue;
      }
      if (quote !== '`' && (ch === '\n' || ch === '\r')) {
        throw new Error('Unterminated string at position ' + stringStart);
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      stringStart = p;
      continue;
    }
    if (ch === '(') {
      depth++;
      continue;
    }
    if (ch === ')') {
      depth--;
      if (depth === 0) {
        return { value: s.slice(start + 1, p), end: p + 1 };
      }
    }
  }
  return null;
}

function parseFn(s, pos, isAsync) {
  pos = skipSpace(s, pos);
  var name = readIdent(s, pos);
  if (!name) {
    return { kind: 'raw', text: s };
  }
  pos = skipSpace(s, name.end);
  var args = '';
  if (s[pos] === '(') {
    var group = readBal(s, pos);
    if (!group) {
      return { kind: 'raw', text: s };
    }
    args = group.value;
    if (s.slice(group.end).trim()) {
      return { kind: 'raw', text: s };
    }
  } else {
    args = s.slice(pos).trim();
  }
  return {
    kind: isAsync ? 'async_fn' : 'fn',
    name: name.value,
    args: args
  };
}

function parseStatement(s) {
  var pos = skipSpace(s, 0);
  var first = readIdent(s, pos);
  if (!first) {
    return { kind: 'raw', text: s };
  }
  pos = first.end;
  switch (first.value) {
    case 'if':
      return { kind: 'if', expr: condition(s.slice(skipSpace(s, pos))) };
    case 'elif':
      return { kind: 'elif', expr: condition(s.slice(skipSpace(s, pos))) };
    case 'else':
      if (s.slice(skipSpace(s, pos)).trim()) {
        return { kind: 'raw', text: s };
      }
      return { kind: 'else' };
    case 'while':
      return { kind: 'while', expr: condition(s.slice(skipSpace(s, pos))) };
    case 'for': {
      pos = skipSpace(s, pos);
      var variable = readIdent(s, pos);
      if (!variable) {
        return { kind: 'raw', text: s };
      }
      pos = skipSpace(s, variable.end);
      var inWord = readIdent(s, pos);
      if (!inWord || inWord.value !== 'in') {
        return { kind: 'raw', text: s };
      }
      var iterable = s.slice(skipSpace(s, inWord.end)).trim();
      if (!iterable) {
        return { kind: 'raw', text: s };
      }
      return { kind: 'for', variable: variable.value, expr: iterable };
    }
    case 'async': {
      pos = skipSpace(s, pos);
      var fnWord = readIdent(s, pos);
      if (!fnWord || fnWord.value !== 'fn') {
        return { kind: 'raw', text: s };
      }
      return parseFn(s, fnWord.end, true);
    }
    case 'fn':
      return parseFn(s, pos, false);
    case 'try':
      if (s.slice(skipSpace(s, pos)).trim()) {
        return { kind: 'raw', text: s };
      }
      return { kind: 'try' };
    case 'catch': {
      var catchRest = s.slice(skipSpace(s, pos)).trim();
      return { kind: 'catch', arg: catchRest };
    }
    case 'finally':
      if (s.slice(skipSpace(s, pos)).trim()) {
        return { kind: 'raw', text: s };
      }
      return { kind: 'finally' };
    case 'print': {
      var printPos = skipSpace(s, pos);
      var value = s.slice(printPos).trim();
      if (s[printPos] === '(') {
        var printGroup = readBal(s, printPos);
        if (printGroup && !s.slice(printGroup.end).trim()) {
          value = printGroup.value.trim();
        }
      }
      return { kind: 'print', expr: value };
    }
    default:
      return { kind: 'raw', text: s };
  }
}

function IndentTracker() {
  this.levels = [0];
}

IndentTracker.prototype.feed = function (indent, prevBlock, src, pos) {
  var current = this.levels[this.levels.length - 1];
  if (indent > current) {
    if (!prevBlock) {
      throw error('Unexpected indentation', src, pos);
    }
    this.levels.push(indent);
    return;
  }
  if (indent === current) {
    return;
  }
  while (this.levels.length > 1 && indent < this.levels[this.levels.length - 1]) {
    this.levels.pop();
  }
  if (indent !== this.levels[this.levels.length - 1]) {
    throw error('Inconsistent indentation', src, pos);
  }
};

// the logic of the input itself
function transInput(src, fmt, origins) {
  var used = false;
  var out = '';
  var i = 0;

  function skipString(start) {
    var end = readString(src, start);
    if (end === -1) {
      throw new Error('Unterminated string at position ' + start);
    }
    return end;
  }

  function findClosing(start) {
    var result = readBal(src, start);
    return result ? result.end - 1 : -1;
  }

  while (i < src.length) {
    var ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      var endString = skipString(i);
      out += src.slice(i, endString);
      i = endString;
      continue;
    }
    if (!isIdentStart(ch)) {
      out += ch;
      i++;
      continue;
    }
    var start = i;
    var j = i + 1;
    while (j < src.length && isIdentPart(src[j])) {
      j++;
    }
    var word = src.slice(start, j);
    if (word !== 'input') {
      out += word;
      i = j;
      continue;
    }
    var previous = start > 0 ? src[start - 1] : '';
    if (isIdentPart(previous) || previous === '.') {
      out += word;
      i = j;
      continue;
    }
    var p = j;
    while (p < src.length && (src[p] === ' ' || src[p] === '\t')) {
      p++;
    }
    if (src[p] === '(') {
      var close = findClosing(p);
      if (close !== -1) {
        out += '__humalInput' + src.slice(p, close + 1);
        used = true;
        i = close + 1;
        continue;
      }
    }
    if (src[p] === '"' || src[p] === "'") {
      var promptEnd = skipString(p);
      out += '__humalInput(' + src.slice(p, promptEnd) + ')';
      used = true;
      i = promptEnd;
      continue;
    }
    out += '__humalInput()';
    used = true;
    i = j;
  }

  if (!used) {
    return { code: src, origins: origins };
  }

  var header = fmt === 'esm'
    ? 'import readline from "readline-sync"\nconst __humalInput = prompt => readline.question(prompt)'
    : 'const readline = require("readline-sync")\nconst __humalInput = prompt => readline.question(prompt)';

  return {
    code: header + '\n' + out,
    origins: [null, null].concat(origins)
  };
}

// converts import/export to ESM and CJS
function transModules(src, fmt, origins) {
  var lines = src.split(/\r?\n/);
  var out = [];
  var mappedOrigins = [];
  var i, line, m;

  function push(text, origin) {
    var parts = String(text).split('\n');
    var p;
    for (p = 0; p < parts.length; p++) {
      out.push(parts[p]);
      mappedOrigins.push(origin);
    }
  }

  for (i = 0; i < lines.length; i++) {
    line = lines[i];

    if (fmt === 'esm') {
      m = line.match(/^\s*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+(["'])(.+?)\2\s*$/);
      if (m) {
        push('import * as ' + m[1] + ' from ' + JSON.stringify(m[3]), origins[i]);
        continue;
      }
      m = line.match(/^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+(["'])(.+?)\2\s*$/);
      if (m) {
        push('import ' + m[1] + ' from ' + JSON.stringify(m[3]), origins[i]);
        continue;
      }
      m = line.match(/^\s*import\s*\{([^}]+)\}\s*from\s+(["'])(.+?)\2\s*$/);
      if (m) {
        push('import { ' + m[1].trim() + ' } from ' + JSON.stringify(m[3]), origins[i]);
        continue;
      }
      push(line, origins[i]);
      continue;
    }

    m = line.match(/^\s*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+(["'])(.+?)\2\s*$/);
    if (m) {
      push('const ' + m[1] + ' = require(' + JSON.stringify(m[3]) + ')', origins[i]);
      continue;
    }
    m = line.match(/^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+(["'])(.+?)\2\s*$/);
    if (m) {
      push('const ' + m[1] + ' = require(' + JSON.stringify(m[3]) + ')', origins[i]);
      continue;
    }
    m = line.match(/^\s*import\s*\{([^}]+)\}\s*from\s+(["'])(.+?)\2\s*$/);
    if (m) {
      var imports = m[1].split(',');
      var imported = [];
      var q, importPart, importPieces, importLocal, importAlias;
      for (q = 0; q < imports.length; q++) {
        importPart = imports[q].trim();
        if (!importPart) {
          continue;
        }
        importPieces = importPart.split(/\s+as\s+/);
        importLocal = importPieces[0].trim();
        importAlias = importPieces.length > 1 ? importPieces[1].trim() : importLocal;
        imported.push(importPieces.length > 1 ? importLocal + ': ' + importAlias : importLocal);
      }
      push('const { ' + imported.join(', ') + ' } = require(' + JSON.stringify(m[3]) + ')', origins[i]);
      continue;
    }
    m = line.match(/^\s*export\s+default\s+(.+)$/);
    if (m) {
      push('module.exports.default = ' + m[1], origins[i]);
      continue;
    }
    m = line.match(/^\s*export\s*\{([^}]+)\}\s*$/);
    if (m) {
      var names = m[1].split(',');
      var exported = [];
      var k, part, pieces, localName, exportName;
      for (k = 0; k < names.length; k++) {
        part = names[k].trim();
        if (!part) {
          continue;
        }
        pieces = part.split(/\s+as\s+/);
        localName = pieces[0].trim();
        exportName = pieces.length > 1 ? pieces[1].trim() : localName;
        exported.push('exports.' + exportName + ' = ' + localName);
      }
      push(exported.join('\n'), origins[i]);
      continue;
    }
    push(line, origins[i]);
  }

  return { code: out.join('\n'), origins: mappedOrigins };
}

function validOutput(js, fmt) {
  var vm = require('vm');
  try {
    if (fmt === 'cjs') {
      new vm.Script(js, { filename: 'humal-output.cjs' });
      return;
    }
    if (typeof vm.SourceTextModule === 'function') {
      new vm.SourceTextModule(js, { identifier: 'humal-output.mjs' });
      return;
    }
    try {
      var stripped = js
        .replace(/^\s*import\s+[^\n]+$/mg, '')
        .replace(/^\s*export\s+[^\n]+$/mg, '');
      new vm.Script(stripped, { filename: 'humal-output.mjs' });
    } catch (fallbackError) {
      throw new Error('ESM validation is not available in this Node.js runtime: ' + fallbackError.message);
    }
  } catch (e) {
    throw new Error('Generated JavaScript is invalid: ' + e.message);
  }
}

var BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + 'abcdefghijklmnopqrstuvwxyz' + '0123456789+/';

function vlq(value) {
  var n = value < 0 ? (-value) * 2 + 1 : value * 2;
  var out = '';
  do {
    var digit = n & 31;
    n = Math.floor(n / 32);
    if (n > 0) {
      digit |= 32;
    }
    out += BASE64.charAt(digit);
  } while (n > 0);
  return out;
}

function SourceMap(origins, sourceName, sourceContent) {
  var previousOriginalLine = 0;
  var mappings = [];
  var i, line, originalLine, segment;
  for (i = 0; i < origins.length; i++) {
    line = origins[i];
    if (line == null) {
      mappings.push('');
      continue;
    }
    originalLine = line - 1;
    segment = vlq(0) + vlq(0) + vlq(originalLine - previousOriginalLine) + vlq(0);
    previousOriginalLine = originalLine;
    mappings.push(segment);
  }
  return {
    version: 3,
    file: 'output.js',
    sources: [sourceName || 'input.hum'],
    sourcesContent: [sourceContent],
    names: [],
    mappings: mappings.join(';')
  };
}

function compile(src, fmt, options) {
  if (fmt == null) {
    fmt = 'cjs';
  }
  if (fmt !== 'esm' && fmt !== 'cjs') {
    throw new Error('Unknown module format "' + fmt + '"');
  }
  options = options || {};
  var validate = options.validate !== false;
  var sourceMap = options.sourceMap === true;
  var origSource = src;
  src = rmComments(src);
  var rows = src.split(/\r?\n/);
  var out = [];
  var origins = [];
  var stack = [];
  var indentTracker = new IndentTracker();
  var prevBlock = false;
  var base = 0;
  var lexerState = { quote: null, stringStart: 0 };
  var checkBase = 0;
  var n;
  var raw;
  var trimmed;
  var indent;
  var branch;
  var top;
  var pad;
  var stmt;

  function emit(text, sourceLine) {
    var parts = String(text).split('\n');
    var p;
    for (p = 0; p < parts.length; p++) {
      out.push(parts[p]);
      origins.push(sourceLine == null ? null : sourceLine);
    }
  }

  for (n = 0; n < rows.length; n++) {
    checkLine(rows[n], src, checkBase, lexerState);
    checkBase += rows[n].length + 1;
  }

  if (lexerState.quote) {
    throw error('Unterminated string', src, lexerState.stringStart);
  }

  var inDocComment = false;
  for (n = 0; n < rows.length; n++) {
    raw = rows[n];
    if (inDocComment) {
      emit(raw, n + 1);
      if (raw.indexOf('*/') !== -1) {
        inDocComment = false;
      }
      base += raw.length + 1;
      continue;
    }
    if (/^\s*\/\*\*/.test(raw)) {
      emit(raw, n + 1);
      var docStart = raw.indexOf('/**');
      var docEnd = raw.indexOf('*/', docStart + 3);
      if (docEnd === -1) {
        inDocComment = true;
      }
      base += raw.length + 1;
      continue;
    }
    trimmed = raw.trim();

    if (!trimmed) {
      emit('', n + 1);
      base += raw.length + 1;
      continue;
    }

    indent = 0;
    while (indent < raw.length && (raw[indent] === ' ' || raw[indent] === '\t')) {
      indent += raw[indent] === '\t' ? 4 : 1;
    }

    indentTracker.feed(indent, prevBlock, src, base);

    branch = /^(else|elif|catch|finally)\b/.test(trimmed);

    while (stack.length && (indent < stack[stack.length - 1].indent || (!branch && indent === stack[stack.length - 1].indent))) {
      top = stack[stack.length - 1];
      if (top.bodyIndent == null) {
        throw error('Expected an indented block', src, base);
      }
      emit(new Array(stack.length).join('  ') + '}', n + 1);
      stack.pop();
    }

    if (stack.length) {
      top = stack[stack.length - 1];
      if (indent > top.indent) {
        if (top.bodyIndent == null) {
          top.bodyIndent = indent;
        } else if (top.bodyIndent !== indent) {
          throw error('Inconsistent indentation', src, base);
        }
      }
    }

    pad = new Array(stack.length + 1).join('  ');
    stmt = parseStatement(trimmed);

    switch (stmt.kind) {
      case 'if':
        if (!stmt.expr) {
          throw error('if requires a condition', src, base);
        }
        emit(pad + 'if (' + stmt.expr + ') {', n + 1);
        stack.push({ type: 'if', indent: indent, bodyIndent: null });
        break;

      case 'elif':
        top = stack[stack.length - 1];
        if (!top || top.indent !== indent || (top.type !== 'if' && top.type !== 'elif')) {
          throw error('elif without matching if', src, base);
        }
        if (top.bodyIndent == null) {
          throw error('elif without a previous block', src, base);
        }
        if (!stmt.expr) {
          throw error('elif requires a condition', src, base);
        }
        emit('} else if (' + stmt.expr + ') {', n + 1);
        top.type = 'elif';
        top.bodyIndent = null;
        break;

      case 'else':
        top = stack[stack.length - 1];
        if (!top || top.indent !== indent || (top.type !== 'if' && top.type !== 'elif')) {
          throw error('else without matching if', src, base);
        }
        if (top.bodyIndent == null) {
          throw error('else without a previous block', src, base);
        }
        emit('} else {', n + 1);
        top.type = 'else';
        top.bodyIndent = null;
        break;

      case 'while':
        if (!stmt.expr) {
          throw error('while requires a condition', src, base);
        }
        emit(pad + 'while (' + stmt.expr + ') {', n + 1);
        stack.push({ type: 'while', indent: indent, bodyIndent: null });
        break;

      case 'for':
        emit(pad + 'for (const ' + stmt.variable + ' of ' + stmt.expr + ') {', n + 1);
        stack.push({ type: 'for', indent: indent, bodyIndent: null });
        break;

      case 'async_fn':
        emit(pad + 'async function ' + stmt.name + '(' + stmt.args + ') {', n + 1);
        stack.push({ type: 'function', indent: indent, bodyIndent: null });
        break;

      case 'fn':
        emit(pad + 'function ' + stmt.name + '(' + stmt.args + ') {', n + 1);
        stack.push({ type: 'function', indent: indent, bodyIndent: null });
        break;

      case 'try':
        emit(pad + 'try {', n + 1);
        stack.push({ type: 'try', indent: indent, bodyIndent: null });
        break;

      case 'catch': {
        top = stack[stack.length - 1];
        if (!top || top.indent !== indent || top.type !== 'try') {
          throw error('catch without matching try', src, base);
        }
        if (top.bodyIndent == null) {
          throw error('catch without a previous block', src, base);
        }
        var catchArg = stmt.arg;
        if (catchArg) {
          if (catchArg.charAt(0) === '(' && catchArg.charAt(catchArg.length - 1) === ')') {
            catchArg = catchArg.slice(1, -1).trim();
          }
          if (!isIdentStart(catchArg[0])) {
            throw error('Invalid catch binding', src, base);
          }
          emit('} catch (' + catchArg + ') {', n + 1);
        } else {
          emit('} catch {', n + 1);
        }
        top.type = 'catch';
        top.bodyIndent = null;
        break;
      }

      case 'finally':
        top = stack[stack.length - 1];
        if (!top || top.indent !== indent || (top.type !== 'try' && top.type !== 'catch')) {
          throw error('finally without matching try', src, base);
        }
        if (top.bodyIndent == null) {
          throw error('finally without a previous block', src, base);
        }
        emit('} finally {', n + 1);
        top.type = 'finally';
        top.bodyIndent = null;
        break;

      case 'print':
        emit(stmt.expr ? pad + 'console.log(' + stmt.expr + ')' : pad + 'console.log()', n + 1);
        break;

      default:
        emit(pad + stmt.text, n + 1);
        break;
    }

    prevBlock =
      stmt.kind === 'if' ||
      stmt.kind === 'elif' ||
      stmt.kind === 'else' ||
      stmt.kind === 'while' ||
      stmt.kind === 'for' ||
      stmt.kind === 'fn' ||
      stmt.kind === 'async_fn' ||
      stmt.kind === 'try' ||
      stmt.kind === 'catch' ||
      stmt.kind === 'finally';

    base += raw.length + 1;
  }

  while (stack.length) {
    top = stack[stack.length - 1];
    if (top.bodyIndent == null) {
      throw error('Expected an indented block', src, src.length);
    }
    emit(new Array(stack.length).join('  ') + '}', rows.length);
    stack.pop();
  }

  var js = out.join('\n');

  var inputResult = transInput(js, fmt, origins);
  js = inputResult.code;
  origins = inputResult.origins;

  var moduleResult = transModules(js, fmt, origins);
  js = moduleResult.code;
  origins = moduleResult.origins;

  if (validate) {
    validOutput(js, fmt);
  }

  if (sourceMap) {
    var map = SourceMap(origins, 'input.hum', origSource);
    var encoded = Buffer.from(JSON.stringify(map)).toString('base64');
    js += '\n//# sourceMappingURL=data:application/json;base64,' + encoded;
  }

  return js;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { compile: compile };
}