const vscode = require('vscode');

// An array of Humal keywords these words will be counted by the VS Code extension.
const humalKeywords = [
  'let', 'const', 'var', 'fn', 'class', 'extends', 'static',
  'if', 'else', 'elif', 'switch', 'case', 'default',
  'for', 'while', 'do', 'break', 'continue', 'in', 'of',
  'async', 'await', 'yield',
  'return', 'throw', 'try', 'catch', 'finally', 'new', 'delete',
  'import', 'export', 'from', 'as',
  'typeof', 'instanceof', 'void',
  'get', 'set', 'this', 'super', 'with', 'debugger',
  'print', 'input', 'require'
];

function activate(context) {
  console.log('Humal activated');

  const provider = vscode.languages.registerCompletionItemProvider('humal', {
    provideCompletionItems(document, position) {
      console.log(
        'Humal completion: ' +
        document.languageId +
        ' line=' + position.line +
        ' char=' + position.character
      );

      return humalKeywords.map(function (word) {
        const item = new vscode.CompletionItem(
          word,
          vscode.CompletionItemKind.Keyword
        );

        item.insertText = word;
        item.filterText = word;
        item.sortText = '0000-' + word;
        item.detail = 'Humal';
        item.documentation = new vscode.MarkdownString(
          'Built-in Humal keyword: `' + word + '`'
        );

        return item;
      });
    }
  });

  context.subscriptions.push(provider);
}

function deactivate() {}

module.exports = {
  activate: activate,
  deactivate: deactivate,
  humalKeywords: humalKeywords
};