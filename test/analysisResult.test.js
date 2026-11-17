const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { analyzeLog } = require('../src/analyzer/logAnalyzer');
const { detectRootCause, buildAnalysisResult } = require('../src/analyzer/rootCauseRules');

function readSample(fileName) {
  return fs.readFileSync(path.join(__dirname, 'samples', fileName), 'utf8');
}

const cases = [
  ['specific technical cause', 'ERROR connection refused', 'failed', 0.95],
  ['less-specific known cause', 'ERROR could not connect', 'failed', 0.75],
  ['unknown suspicious error', 'ERROR unexpected problem', 'failed', 0.40],
  ['clean log', 'INFO started', 'unknown', 0.10],
  ['empty log', '', 'unknown', 0.10],
  ['warning only', 'WARN unusual event', 'warning', 0.40]
];

for (const [label, text, status, confidence] of cases) {
  test(`builds structured result for ${label}`, () => {
    const matches = analyzeLog(text);
    const rootCause = detectRootCause(matches);
    const result = buildAnalysisResult(matches, rootCause);
    assert.equal(result.status, status);
    assert.equal(result.confidence, confidence);
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
    assert.deepEqual(Object.keys(result).sort(), [
      'status', 'rootCause', 'category', 'evidence', 'lineNumber', 'suggestedChecks', 'confidence'
    ].sort());
    assert.equal(typeof result.rootCause, 'string');
    assert.ok(Array.isArray(result.suggestedChecks));
    if (rootCause) {
      assert.equal(result.rootCause, rootCause.summary);
      assert.equal(result.category, rootCause.category);
      assert.equal(result.evidence, rootCause.evidence);
      assert.equal(result.lineNumber, rootCause.lineNumber);
      assert.deepEqual(result.suggestedChecks, rootCause.suggestedChecks);
      assert.notEqual(result.suggestedChecks, rootCause.suggestedChecks);
    } else {
      assert.equal(result.category, 'unknown');
      assert.equal(result.evidence, matches.length ? text : null);
      assert.equal(result.lineNumber, matches.length ? 1 : null);
      assert.deepEqual(result.suggestedChecks, []);
    }
  });
}

test('uses the ranked cause and its original evidence line', () => {
  const matches = analyzeLog('ERROR timeout\nERROR connection refused');
  const result = buildAnalysisResult(matches, detectRootCause(matches));
  assert.equal(result.category, 'Database connection failure');
  assert.equal(result.lineNumber, 2);
  assert.equal(result.confidence, 0.95);
});

test('recognizes case-insensitive specificity in captured context', () => {
  const matches = analyzeLog('ERROR operation\nSQLSTATE 23505');
  const result = buildAnalysisResult(matches, detectRootCause(matches));
  assert.equal(result.confidence, 0.95);
  assert.equal(result.lineNumber, 2);
});

test('errors take precedence over warnings in the structured status and fallback evidence', () => {
  const matches = analyzeLog('WARN first\nERROR unclassified problem');
  const result = buildAnalysisResult(matches, detectRootCause(matches));
  assert.equal(result.status, 'failed');
  assert.equal(result.confidence, 0.40);
  assert.equal(result.evidence, 'ERROR unclassified problem');
  assert.equal(result.lineNumber, 2);
});

test('a critical result without a known cause still has failed status', () => {
  const matches = analyzeLog('FATAL unspecified problem');
  const result = buildAnalysisResult(matches, detectRootCause(matches));
  assert.equal(result.status, 'failed');
  assert.equal(result.category, 'unknown');
  assert.equal(result.confidence, 0.40);
});

test('structured confidence is finite, bounded, and deterministic across mixed inputs', () => {
  for (const text of [
    '', 'INFO healthy', 'WARN check this', 'ERROR unknown',
    'ERROR could not connect', 'ERROR connection refused',
    readSample('multiple-errors.log'),
    'ERROR timeout\nFATAL OutOfMemoryError', 'ERROR SQLSTATE 23505'
  ]) {
    const matches = analyzeLog(text);
    const rootCause = detectRootCause(matches);
    const first = buildAnalysisResult(matches, rootCause);
    const second = buildAnalysisResult(matches, rootCause);
    assert.deepEqual(first, second);
    assert.ok(Number.isFinite(first.confidence));
    assert.ok(first.confidence >= 0 && first.confidence <= 1);
    assert.equal(Object.hasOwn(first, 'score'), false);
  }
});


const sampleCases = [
  ['database-connection.log', 'failed', 'Database connection failure', 3, 'connection refused', 0.95],
  ['authentication-failure.log', 'failed', 'Authentication failure', 3, 'Authentication failed', 0.95],
  ['timeout.log', 'failed', 'Timeout', 3, 'TimeoutException', 0.95],
  ['memory-error.log', 'failed', 'Memory failure', 3, 'OutOfMemoryError', 0.95],
  ['permission-error.log', 'failed', 'Permission failure', 3, 'Permission denied', 0.95],
  ['constraint-error.log', 'failed', 'Database constraint failure', 3, 'SQLSTATE 23505', 0.95],
  ['clean-job.log', 'unknown', 'unknown', null, null, 0.10],
  ['multiple-errors.log', 'failed', 'Database connection failure', 5, 'Connection refused', 0.95]
];

for (const [fileName, status, category, lineNumber, evidencePattern, confidence] of sampleCases) {
  test(`sample ${fileName} produces the expected high-level result`, () => {
    const text = readSample(fileName);
    const matches = analyzeLog(text);
    const rootCause = detectRootCause(matches);
    const result = buildAnalysisResult(matches, rootCause);
    assert.equal(result.status, status);
    assert.equal(result.category, category);
    assert.equal(result.lineNumber, lineNumber);
    assert.equal(result.confidence, confidence);
    if (lineNumber === null) {
      assert.deepEqual(matches, []);
      assert.equal(rootCause, null);
      assert.equal(result.evidence, null);
      assert.deepEqual(result.suggestedChecks, []);
      assert.equal(result.rootCause, 'No obvious errors found.');
    } else {
      assert.equal(result.evidence, text.split(/\r\n|\r|\n/)[lineNumber - 1]);
      assert.ok(result.evidence.includes(evidencePattern));
      assert.ok(result.suggestedChecks.length > 0);
      assert.ok(result.suggestedChecks.every(check => typeof check === 'string'));
    }
  });
}

test('multiple-errors sample ranks a later technical cause above general and downstream failures', () => {
  const matches = analyzeLog(readSample('multiple-errors.log'));
  assert.ok(matches.some(match => match.severity === 'warning'));
  assert.ok(matches.some(match => match.text.includes('Stage failed')));
  assert.equal(matches[0].severity, 'critical');
  const rootCause = detectRootCause(matches);
  assert.equal(rootCause.category, 'Database connection failure');
  assert.equal(rootCause.lineNumber, 5);
  assert.ok(rootCause.evidence.includes('Connection refused'));
});
