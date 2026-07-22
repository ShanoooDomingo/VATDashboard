/* Runnable check for extractTinCandidates() — the Philippine TIN candidate finder used
 * by the assisted OCR flow. Extracts the REAL function from app.js (no browser, no OCR
 * engine, no dependencies) and asserts the required cases, including company-TIN
 * exclusion and the "VAT Reg TIN" / "Non-VAT Reg TIN" auto-selection ranking.
 * Run: node tests/tin-extract.test.js
 * (OCR/PDF reading itself is browser-only and must be verified manually with real files;
 *  this check covers the parsing/normalization/ranking that drives auto-selection.) */
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
const COMPANY = '008737954'; // company TIN base (008-737-954-000) — must never be selected

let failed = 0;
function check(label, cond) { if (cond) console.log('ok   ', label); else { console.error('FAIL ', label); failed++; } }

// 1. Clear labelled TIN
let r = extractTinCandidates('Supplier VAT Reg TIN: 123-456-789-000 Address', COMPANY);
check('clear TIN found', r.length === 1 && r[0].normalized === '123-456-789-000');
check('VAT Reg TIN labelled as vatreg', r[0].labelType === 'vatreg');

// 2. Company TIN excluded, supplier TIN chosen even when company TIN appears first
r = extractTinCandidates('Buyer TIN 008-737-954-000  Seller VAT Reg TIN 123-456-789-000', COMPANY);
check('company TIN excluded', !r.some(c => c.digits.slice(0, 9) === COMPANY));
check('supplier TIN auto-selected first', r.length === 1 && r[0].normalized === '123-456-789-000');

// 3. Non-VAT Reg TIN label is also treated as vatreg (supplier) and ranks first
r = extractTinCandidates('order no 987654321000 ... Non-VAT Reg TIN: 111-222-333-000', COMPANY);
check('non-vat-reg label ranks first', r[0].normalized === '111-222-333-000' && r[0].labelType === 'vatreg');

// 4. Label ranking: vatreg beats a generic TIN label beats an unlabelled number
r = extractTinCandidates('ref 222-333-444-000 TIN 555-666-777-000 VAT Reg TIN 123-456-789-000', COMPANY);
check('vatreg ranked above generic tin & bare', r[0].normalized === '123-456-789-000');

// 5. Bare 12-digit run normalizes to dashed form
r = extractTinCandidates('VAT Reg TIN 123456789000 total 1,234.00', COMPANY);
check('bare 12-digit normalized', r.length === 1 && r[0].normalized === '123-456-789-000');

// 6. 9-digit TIN normalizes to ###-###-###
r = extractTinCandidates('TIN 123-456-789 only', COMPANY);
check('9-digit normalized', r.length === 1 && r[0].normalized === '123-456-789');

// 7. Malformed / too-short number -> no candidate
check('malformed rejected', extractTinCandidates('Ref 12-345 and qty 8', COMPANY).length === 0);

// 8. No TIN at all
check('no TIN -> empty', extractTinCandidates('Delivery receipt, amount 500.00', COMPANY).length === 0);

// 9. Only the company TIN present -> nothing to select
check('only company TIN -> empty', extractTinCandidates('Buyer TIN 008-737-954-000', COMPANY).length === 0);

// 10. Empty / nullish input
check('empty string -> []', extractTinCandidates('', COMPANY).length === 0);
check('null -> []', extractTinCandidates(null, COMPANY).length === 0);

// 11. Same supplier TIN twice -> deduped to one candidate
check('duplicate TIN deduped', extractTinCandidates('VAT Reg TIN 123-456-789-000 ... 123-456-789-000', COMPANY).length === 1);

console.log(failed ? ('\n' + failed + ' check(s) FAILED') : '\nAll TIN-extraction checks passed.');
process.exit(failed ? 1 : 0);
