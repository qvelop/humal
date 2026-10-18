'use strict';
const { compile } = require('./compiler');

const READLINE_IMPORT =
  /^import readline from "readline-sync"\r?\nconst __humalInput = prompt => readline\.question\(prompt\)/m;

const PROMPT_SHIM =
  '// Input in the browser\nconst __humalInput = prompt => window.prompt(prompt ?? "")';

const READLINE_LEFT =
  /^\s*import readline from ["']readline-sync["']/m;

function compileWeb(source, options = {}) {
  let js = compile(source, 'esm', options);

  js = js.replace(READLINE_IMPORT, PROMPT_SHIM);

  if (READLINE_LEFT.test(js)) {
    throw new Error('web: failed to remove the dependency readline-sync');
  }

  return js;
}

module.exports = { compileWeb };