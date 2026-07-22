/* Runnable check for documentCoverageStats() — the supporting-document coverage math.
 * Extracts the REAL function out of app.js (no browser, no dependencies) and asserts
 * the behavior required by the spec. Run: node tests/doc-coverage.test.js */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = src.indexOf('function documentCoverageStats');
if (start < 0) { console.error('documentCoverageStats not found in app.js'); process.exit(1); }
// Brace-match from the first "{" after the declaration to pull the exact function body.
let depth = 0, end = -1;
for (let i = src.indexOf('{', start); i < src.length; i++) {
  const c = src[i];
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const documentCoverageStats = eval('(' + src.slice(start, end) + ')');

let failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { console.error('FAIL ', label, '\n  expected', e, '\n  actual  ', a); failed++; }
  else console.log('ok   ', label);
}

const tx = [{ _id: 't1' }, { _id: 't2' }, { _id: 't3' }, { _id: 't4' }];

eq(documentCoverageStats(tx, []),
  { totalLines: 4, withDocs: 0, withoutDocs: 4, coveragePct: 0, totalFiles: 0 }, 'zero documents');

eq(documentCoverageStats(tx, [{ txnId: 't1' }]),
  { totalLines: 4, withDocs: 1, withoutDocs: 3, coveragePct: 25, totalFiles: 1 }, 'one document');

eq(documentCoverageStats(tx, [{ txnId: 't1' }, { txnId: 't1' }, { txnId: 't1' }]),
  { totalLines: 4, withDocs: 1, withoutDocs: 3, coveragePct: 25, totalFiles: 3 }, 'multiple docs on one line count as one covered line');

// Replace mutates the record in place (same _id, same count) → totals unchanged.
eq(documentCoverageStats(tx, [{ txnId: 't1' }]),
  { totalLines: 4, withDocs: 1, withoutDocs: 3, coveragePct: 25, totalFiles: 1 }, 'replacement does not increase the count');

eq(documentCoverageStats(tx, []),
  { totalLines: 4, withDocs: 0, withoutDocs: 4, coveragePct: 0, totalFiles: 0 }, 'deletion returns to zero');

eq(documentCoverageStats(tx, [{ txnId: 'ghost' }, { txnId: 't2' }]),
  { totalLines: 4, withDocs: 1, withoutDocs: 3, coveragePct: 25, totalFiles: 1 }, 'orphaned metadata is ignored');

// Period filtering: only the visible subset of lines is considered; a doc pointing at
// a line outside the period does not count.
eq(documentCoverageStats([{ _id: 't1' }, { _id: 't2' }], [{ txnId: 't1' }, { txnId: 't3' }]),
  { totalLines: 2, withDocs: 1, withoutDocs: 1, coveragePct: 50, totalFiles: 1 }, 'period-filtered subset');

eq(documentCoverageStats([{ _id: 't1' }], [{ txnId: 't1' }]),
  { totalLines: 1, withDocs: 1, withoutDocs: 0, coveragePct: 100, totalFiles: 1 }, 'full coverage = 100%');

eq(documentCoverageStats([], [{ txnId: 't1' }]),
  { totalLines: 0, withDocs: 0, withoutDocs: 0, coveragePct: 0, totalFiles: 0 }, 'empty period yields zeros, no divide-by-zero');

console.log(failed ? ('\n' + failed + ' check(s) FAILED') : '\nAll document-coverage checks passed.');
process.exit(failed ? 1 : 0);
