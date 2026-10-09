'use strict';
const vscode = require('vscode');
const { compile } = require('@qvelop444/humal/src/compiler');

const diag = vscode.languages.createDiagnosticCollection('humal');
let t;

const humalKeywords = [
  'let', 'const', 'var', 'fn', 'class', 'extends', 'static',
  'if', 'else', 'elif', 'switch', 'case', 'default',
  'for', 'while', 'break', 'continue',
  'async', 'await', 'yield',
  'return', 'throw', 'try', 'catch', 'finally',
  'new', 'delete',
  'import', 'export', 'from', 'as',
  'typeof', 'instanceof', 'void',
  'get', 'set', 'this', 'super',
  'print', 'input', 'require'
];

function activate(ctx) {
  ctx.subscriptions.push(
    vscode.languages.registerCompletionItemProvider('humal', {
      provideCompletionItems() {
        return humalKeywords.map(w => {
          const it = new vscode.CompletionItem(w, vscode.CompletionItemKind.Keyword);
          it.detail = 'Humal';
          it.insertText = w;
          return it;
        });
      }
    })
  );

  ctx.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.languageId !== 'humal') return;
      clearTimeout(t);
      t = setTimeout(() => check(e.document), 100);
    })
  );

  ctx.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => {
      if (doc.languageId === 'humal') check(doc);
    })
  );

  ctx.subscriptions.push(diag);
}

function check(doc) {
  if (doc.languageId !== 'humal') return;

  try {
    compile(doc.getText(), 'cjs', { validate: true });
    diag.delete(doc.uri);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    const m = msg.match(/at line (\d+), column (\d+)/);

    let ln = 0, col = 0;
    if (m) {
      ln = Number(m[1]) - 1;
      col = Number(m[2]) - 1;
    }

    ln = Math.min(Math.max(0, ln), doc.lineCount - 1);
    const lineText = doc.lineAt(ln).text;
    col = Math.min(Math.max(0, col), lineText.length);

    const end = Math.min(col + 1, lineText.length);

    const d = new vscode.Diagnostic(
      new vscode.Range(ln, col, ln, Math.max(col + 1, end)),
      msg,
      vscode.DiagnosticSeverity.Error
    );
    d.source = 'Humal';

    diag.set(doc.uri, [d]);
  }
}

function deactivate() {
  clearTimeout(t);
  diag.dispose();
}

module.exports = { activate, deactivate };