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

  return new Error(
    msg +
    ' at line ' +
    loc.line +
    ', column ' +
    loc.column +
    tail
  );
}

// removes comments outside string literals
function removeComments(src) {
  var rows = src.split(/\r?\n/);
  var out = [];
  var r, row, quote, i, ch;

  for (r = 0; r < rows.length; r++) {
    row = rows[r];
    quote = null;

    for (i = 0; i < row.length; i++) {
      ch = row[i];
      if (ch === '\\') {
        i++;
        continue;
      }
      if ((ch === '"' || ch === "'" || ch === '`') && !quote) {
        quote = ch;
        continue;
      }
      if (ch === quote) {
        quote = null;
        continue;
      }
      if (!quote && ch === '/' && row[i + 1] === '/') {
        row = row.slice(0, i);
        break;
      }
    }
    out.push(row);
  }
  return out.join('\n');
}

// catches invalid characters and a ":" at the end of the string
function checkLine(row, src, base) {
  var quote = null;
  var i, ch;

  for (i = 0; i < row.length; i++) {
    ch = row[i];

    if (ch === '\\') {
      i++;
      continue;
    }
    if ((ch === '"' || ch === "'" || ch === '`') && !quote) {
      quote = ch;
      continue;
    }
    if (ch === quote) {
      quote = null;
      continue;
    }
    if (!quote && (ch === '{' || ch === '}' || ch === ';')) {
      throw error(
        "Unexpected '" + ch + "'",
        src,
        base + i
      );
    }
  }
  if (!quote && /:\s*$/.test(row)) {
    throw error(
      'Block syntax cannot use ":"',
      src,
      base + row.lastIndexOf(':')
    );
  }
}

// removes the outer parentheses from the condition
function condition(expr) {
  expr = expr.trim();

  if (
    expr.length >= 2 &&
    expr.charAt(0) === '(' &&
    expr.charAt(expr.length - 1) === ')'
  ) {
    return expr.slice(1, -1).trim();
  }

  return expr;
}

// the logic of the input itself
function transformInput(src, fmt) {
  var used = false;
  var out = '';
  var i = 0;

  function isIdentStart(ch) {
    return !!ch && /[A-Za-z_$]/.test(ch);
  }
  function isIdentPart(ch) {
    return !!ch && /[A-Za-z0-9_$]/.test(ch);
  }
  function skipString(start) {
    var quote = src[start];
    var p = start + 1;

    while (p < src.length) {
      if (src[p] === '\\') {
        p += 2;
        continue;
      }

      if (src[p] === quote) {
        return p + 1;
      }

      p++;
    }

    return src.length;
  }
  function findClosingParen(start) {
    var depth = 0;
    var quote = null;
    var p, ch;
    for (p = start; p < src.length; p++) {
      ch = src[p];

      if (ch === '\\') {
        p++;
        continue;
      }
      if ((ch === '"' || ch === "'" || ch === '`') && !quote) {
        quote = ch;
        continue;
      }
      if (ch === quote) {
        quote = null;
        continue;
      }
      if (quote) {
        continue;
      }
      if (ch === '(') {
        depth++;
      } else if (ch === ')') {
        depth--;
        if (depth === 0) {
          return p;
        }
      }
    }

    return -1;
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
    while (
      p < src.length &&
      (src[p] === ' ' || src[p] === '\t')
    ) {
      p++;
    }
    if (src[p] === '(') {
      var close = findClosingParen(p);

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
    return src;
  }

  var header = fmt === 'esm'
    ? 'import readline from "readline-sync"\nconst __humalInput = prompt => readline.question(prompt)'
    : 'const readline = require("readline-sync")\nconst __humalInput = prompt => readline.question(prompt)';

  return header + '\n' + out;
}

// converts import/export to ESM and CJS
function transformModules(src, fmt) {
  var lines = src.split(/\r?\n/);
  var out = [];
  var i, line, m;

  for (i = 0; i < lines.length; i++) {
    line = lines[i];

    if (fmt === 'esm') {
      m = line.match(
        /^\s*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+(["'])(.+?)\2\s*$/
      );
      if (m) {
        out.push(
          'import * as ' +
          m[1] +
          ' from ' +
          JSON.stringify(m[3])
        );
        continue;
      }
      m = line.match(
        /^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+(["'])(.+?)\2\s*$/
      );
      if (m) {
        out.push(
          'import ' +
          m[1] +
          ' from ' +
          JSON.stringify(m[3])
        );
        continue;
      }
      m = line.match(
        /^\s*import\s*\{([^}]+)\}\s*from\s+(["'])(.+?)\2\s*$/
      );
      if (m) {
        out.push(
          'import { ' +
          m[1].trim() +
          ' } from ' +
          JSON.stringify(m[3])
        );
        continue;
      }
      out.push(line);
      continue;
    }
    m = line.match(
      /^\s*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+(["'])(.+?)\2\s*$/
    );
    if (m) {
      out.push(
        'const ' +
        m[1] +
        ' = require(' +
        JSON.stringify(m[3]) +
        ')'
      );
      continue;
    }
    m = line.match(
      /^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+(["'])(.+?)\2\s*$/
    );
    if (m) {
      out.push(
        'const ' +
        m[1] +
        ' = require(' +
        JSON.stringify(m[3]) +
        ')'
      );
      continue;
    }
    m = line.match(
      /^\s*import\s*\{([^}]+)\}\s*from\s+(["'])(.+?)\2\s*$/
    );
    if (m) {
      out.push(
        'const { ' +
        m[1].trim() +
        ' } = require(' +
        JSON.stringify(m[3]) +
        ')'
      );
      continue;
    }
    m = line.match(
      /^\s*export\s+default\s+(.+)$/
    );
    if (m) {
      out.push(
        'module.exports.default = ' + m[1]
      );
      continue;
    }
    m = line.match(
      /^\s*export\s*\{([^}]+)\}\s*$/
    );
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
        exportName = pieces.length > 1
          ? pieces[1].trim()
          : localName;

        exported.push(
          'exports.' +
          exportName +
          ' = ' +
          localName
        );
      }

      out.push(exported.join('\n'));
      continue;
    }

    out.push(line);
  }

  return out.join('\n');
}

// This is the core compiler logic; the indentation logic and block stack are implemented here.
function compile(src, fmt) {
  if (fmt == null) {
    fmt = 'cjs';
  }

  if (fmt !== 'esm' && fmt !== 'cjs') {
    throw new Error(
      'Unknown module format "' + fmt + '"'
    );
  }

  src = removeComments(src);
  var rows = src.split(/\r?\n/);
  var out = [];
  var stack = [];
  var base = 0;

  var n;
  var raw;
  var trimmed;
  var indent;
  var branch;
  var top;
  var pad;
  var m;
  var args;

  for (n = 0; n < rows.length; n++) {
    raw = rows[n];
    trimmed = raw.trim();

    if (!trimmed) {
      out.push('');
      base += raw.length + 1;
      continue;
    }

    checkLine(raw, src, base);

    var indentMatch = raw.match(/^[ \t]*/);
    indent = indentMatch
      ? indentMatch[0].replace(/\t/g, '    ').length
      : 0;

    branch = /^(else|elif|catch|finally)\b/.test(trimmed);

    while (
      stack.length &&
      (
        indent < stack[stack.length - 1].indent ||
        (
          !branch &&
          indent === stack[stack.length - 1].indent
        )
      )
    ) {
      top = stack[stack.length - 1];

      if (top.bodyIndent == null) {
        throw error(
          'Expected an indented block',
          src,
          base
        );
      }

      out.push(
        new Array(stack.length).join('  ') + '}'
      );

      stack.pop();
    }
    if (!stack.length && indent > 0) {
      throw error(
        'Unexpected indentation',
        src,
        base
      );
    }
    if (stack.length) {
      top = stack[stack.length - 1];

      if (indent > top.indent) {
        if (top.bodyIndent == null) {
          top.bodyIndent = indent;
        } else if (top.bodyIndent !== indent) {
          throw error(
            'Inconsistent indentation',
            src,
            base
          );
        }
      }
    }

    pad = new Array(stack.length + 1).join('  ');

    if ((m = trimmed.match(/^if\s+(.+)$/))) {
      out.push(
        pad +
        'if (' +
        condition(m[1]) +
        ') {'
      );
      stack.push({
        type: 'if',
        indent: indent,
        bodyIndent: null
      });

    } else if ((m = trimmed.match(/^elif\s+(.+)$/))) {
      top = stack[stack.length - 1];
      if (
        !top ||
        top.indent !== indent ||
        (top.type !== 'if' && top.type !== 'elif')
      ) {
        throw error(
          'elif without matching if',
          src,
          base
        );
      }
      if (top.bodyIndent == null) {
        throw error(
          'elif without a previous block',
          src,
          base
        );
      }
      out.push(
        '} else if (' +
        condition(m[1]) +
        ') {'
      );
      top.type = 'elif';
      top.bodyIndent = null;

    } else if (trimmed === 'else') {
      top = stack[stack.length - 1];
      if (
        !top ||
        top.indent !== indent ||
        (top.type !== 'if' && top.type !== 'elif')
      ) {
        throw error(
          'else without matching if',
          src,
          base
        );
      }
      if (top.bodyIndent == null) {
        throw error(
          'else without a previous block',
          src,
          base
        );
      }

      out.push('} else {');
      top.type = 'else';
      top.bodyIndent = null;

    } else if ((m = trimmed.match(/^while\s+(.+)$/))) {
      out.push(
        pad +
        'while (' +
        condition(m[1]) +
        ') {'
      );
      stack.push({
        type: 'while',
        indent: indent,
        bodyIndent: null
      });
    } else if (
      (m = trimmed.match(
        /^for\s+([A-Za-z_$][\w$]*)\s+in\s+(.+)$/
      ))
    ) {
      out.push(
        pad +
        'for (const ' +
        m[1] +
        ' of ' +
        m[2] +
        ') {'
      );

      stack.push({
        type: 'for',
        indent: indent,
        bodyIndent: null
      });

    } else if (
      (m = trimmed.match(
        /^async\s+fn\s+([A-Za-z_$][\w$]*)(?:\s*\(([^)]*)\)|\s+(.+))?$/
      ))
    ) {
      args = m[2] != null
        ? m[2]
        : (m[3] != null ? m[3] : '');

      out.push(
        pad +
        'async function ' +
        m[1] +
        '(' +
        args +
        ') {'
      );

      stack.push({
        type: 'function',
        indent: indent,
        bodyIndent: null
      });

    } else if (
      (m = trimmed.match(
        /^fn\s+([A-Za-z_$][\w$]*)(?:\s*\(([^)]*)\)|\s+(.+))?$/
      ))
    ) {
      args = m[2] != null
        ? m[2]
        : (m[3] != null ? m[3] : '');

      out.push(
        pad +
        'function ' +
        m[1] +
        '(' +
        args +
        ') {'
      );

      stack.push({
        type: 'function',
        indent: indent,
        bodyIndent: null
      });

    } else if (trimmed === 'try') {
      out.push(pad + 'try {');

      stack.push({
        type: 'try',
        indent: indent,
        bodyIndent: null
      });

    } else if (
      (m = trimmed.match(/^catch(?:\s+(.+))?$/))
    ) {
      top = stack[stack.length - 1];

      if (!top || top.indent !== indent || top.type !== 'try') {
        throw error(
          'catch without matching try',
          src,
          base
        );
      }

      if (top.bodyIndent == null) {
        throw error(
          'catch without a previous block',
          src,
          base
        );
      }

      var catchArg = m[1] ? m[1].trim() : '';

      if (catchArg) {
        if (
          catchArg.charAt(0) === '(' &&
          catchArg.charAt(catchArg.length - 1) === ')'
        ) {
          catchArg = catchArg.slice(1, -1).trim();
        }

        out.push(
          '} catch (' +
          catchArg +
          ') {'
        );
      } else {
        out.push('} catch {');
      }

      top.type = 'catch';
      top.bodyIndent = null;

    } else if (trimmed === 'finally') {
      top = stack[stack.length - 1];

      if (
        !top ||
        top.indent !== indent ||
        (top.type !== 'try' && top.type !== 'catch')
      ) {
        throw error(
          'finally without matching try',
          src,
          base
        );
      }

      if (top.bodyIndent == null) {
        throw error(
          'finally without a previous block',
          src,
          base
        );
      }

      out.push('} finally {');

      top.type = 'finally';
      top.bodyIndent = null;

    } else if ((m = trimmed.match(/^print\s+(.+)$/))) {
      out.push(
        pad +
        'console.log(' +
        m[1] +
        ')'
      );

    } else if (trimmed === 'print') {
      out.push(
        pad +
        'console.log()'
      );

    } else if (
      (m = trimmed.match(/^print\s*\((.*)\)$/))
    ) {
      out.push(
        pad +
        'console.log(' +
        m[1] +
        ')'
      );

    } else {
      out.push(
        pad +
        trimmed
      );
    }

    base += raw.length + 1;
  }

  while (stack.length) {
    top = stack[stack.length - 1];

    if (top.bodyIndent == null) {
      throw error(
        'Expected an indented block',
        src,
        src.length
      );
    }

    out.push(
      new Array(stack.length).join('  ') + '}'
    );

    stack.pop();
  }

  var js = out.join('\n');

  js = transformInput(js, fmt);
  js = transformModules(js, fmt);

  return js;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { compile: compile };
}