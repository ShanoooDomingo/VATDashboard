/* Runnable check for extractTinCandidates() — the Philippine TIN candidate finder used
 * by the assisted OCR flow. Extracts the REAL function from app.js (no browser, no OCR
 * engine, no dependencies) and asserts the required cases. Run: node tests/tin-extract.test.js
 * (OCR/PDF reading itself is browser-only and must be verified manually with real files;
 *  this check covers the parsing/normalization logic that turns recognized text into
 *  reviewable, normalized candidates.) */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = src.indexOf('function extractTinCandidates');
if (start < 0) { console.error('extractTinCandidates not found in app.js'); process.exit(1); }
let depth = 0, end = -1;
for (let i = src.indexOf('{', start); i < src.length; i++) {
  const c = src[i];
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const extractTinCandidates = eval('(' + src.slice(start, end) + ')');

let failed = 0;
function check(label, cond) { if (cond) console.log('ok   ', label); else { console.error('FAIL ', label); failed++; } }

// 1. Clear labelled TIN in text
let r = extractTinCandidates('Supplier BIR TIN: 123-456-789-000 VAT Reg');
check('clear TIN found', r.length === 1 && r[0].normalized === '123-456-789-000');
check('clear TIN flagged near label', r[0].nearLabel === true);
check('clear TIN has context', /123-456-789-000/.test(r[0].context));

// 2. Multiple distinct TINs -> multiple candidates, never auto-picked
r = extractTinCandidates('Seller TIN 111-222-333-000 ... Buyer TIN 444-555-666-000');
check('two candidates found', r.length === 2);
check('both normalized', r.some(c => c.normalized === '111-222-333-000') && r.some(c => c.normalized === '444-555-666-000'));

// 3. Bare 12-digit run normalizes to dashed form
r = extractTinCandidates('TIN 123456789000 total 1,234.00');
check('bare 12-digit normalized', r.length === 1 && r[0].normalized === '123-456-789-000');

// 4. 9-digit TIN normalizes to ###-###-###
r = extractTinCandidates('TIN 123-456-789 only');
check('9-digit normalized', r.length === 1 && r[0].normalized === '123-456-789');

// 5. Malformed / too-short number -> no candidate
r = extractTinCandidates('Ref 12-345 and qty 8');
check('malformed rejected', r.length === 0);

// 6. No TIN at all
r = extractTinCandidates('Delivery receipt for office supplies, amount 500.00');
check('no TIN -> empty', r.length === 0);

// 7. Empty / nullish input
check('empty string -> []', extractTinCandidates('').length === 0);
check('null -> []', extractTinCandidates(null).length === 0);

// 8. Same TIN twice -> deduped to one candidate
r = extractTinCandidates('TIN 123-456-789-000 ... again 123-456-789-000');
check('duplicate TIN deduped', r.length === 1);

// 9. Labelled candidate ranks ahead of an unlabelled bare number
r = extractTinCandidates('order 987654321000 then TIN: 123-456-789-000');
check('labelled candidate ranked first', r.length === 2 && r[0].normalized === '123-456-789-000');

console.log(failed ? ('\n' + failed + ' check(s) FAILED') : '\nAll TIN-extraction checks passed.');
process.exit(failed ? 1 : 0);
