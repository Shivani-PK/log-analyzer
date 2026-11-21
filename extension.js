const vscode = require('vscode');
const path = require('node:path');
const { sanitizeLog } = require('./src/sanitizer/logSanitizer');
const { analyzeLog } = require('./src/analyzer/logAnalyzer');
const { detectRootCause, buildAnalysisResult } = require('./src/analyzer/rootCauseRules');

function activate(context) {
  const outputChannel = vscode.window.createOutputChannel('Log Analyzer');
  context.subscriptions.push(outputChannel);

  function appendOutputLine(text) {
    outputChannel.appendLine(sanitizeLog(text));
  }

  async function analyzeActiveEditor(selectionOnly) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active file is open.');
      return;
    }

    const document = editor.document;
    const selection = editor.selection;
    if (selectionOnly && selection.isEmpty) {
      vscode.window.showErrorMessage('Select log lines to analyze first.');
      return;
    }
    const extension = path.extname(document.fileName).toLowerCase();
    if (!['.log', '.txt', '.out'].includes(extension)) {
      const choice = await vscode.window.showWarningMessage(
        'This file does not look like a log file. Analyze anyway?',
        'Analyze Anyway',
        'Cancel'
      );
      if (choice !== 'Analyze Anyway') {
        return;
      }
    }
    const text = selectionOnly ? document.getText(selection) : document.getText();
    const matches = analyzeLog(text);
    const rootCause = detectRootCause(matches);
    const analysis = buildAnalysisResult(matches, rootCause);

    outputChannel.clear();
    appendOutputLine(`SOURCE: ${selectionOnly ? 'Selection' : 'Current File'}`);
    appendOutputLine('');
    appendOutputLine(`STATUS: ${analysis.status.toUpperCase()}`);
    appendOutputLine('');
    appendOutputLine('ROOT CAUSE:');
    appendOutputLine(analysis.rootCause);
    appendOutputLine('');
    appendOutputLine('CATEGORY:');
    appendOutputLine(analysis.category);
    appendOutputLine('');
    appendOutputLine('EVIDENCE:');
    appendOutputLine(analysis.lineNumber === null
      ? 'None.' : `Line ${analysis.lineNumber}: ${analysis.evidence}`);
    appendOutputLine('');
    appendOutputLine('SUGGESTED CHECKS:');
    if (analysis.suggestedChecks.length === 0) {
      appendOutputLine('None.');
    }
    for (const check of analysis.suggestedChecks) {
      appendOutputLine(`- ${check}`);
    }
    appendOutputLine('');
    appendOutputLine('CONFIDENCE:');
    appendOutputLine(analysis.confidence.toFixed(2));
    appendOutputLine('');
    if (matches.length === 0) {
      appendOutputLine('No obvious errors found.');
    } else {
      for (const match of matches) {
        appendOutputLine('Match:');
        appendOutputLine(`Line ${match.lineNumber} [${match.severity}] [${match.pattern}]: ${match.text}`);
        appendOutputLine('');
        appendOutputLine('Context before:');
        match.contextBefore.forEach((contextLine, contextIndex) => {
          appendOutputLine(`Line ${match.lineNumber - match.contextBefore.length + contextIndex}: ${contextLine}`);
        });
        appendOutputLine('');
        appendOutputLine('Context after:');
        match.contextAfter.forEach((contextLine, contextIndex) => {
          appendOutputLine(`Line ${match.lineNumber + 1 + contextIndex}: ${contextLine}`);
        });
        appendOutputLine('');
      }
    }
    outputChannel.show(true);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('log-analyzer.analyzeLog', () => analyzeActiveEditor(false)),
    vscode.commands.registerCommand('log-analyzer.analyzeSelection', () => analyzeActiveEditor(true))
  );
}

module.exports = { activate };