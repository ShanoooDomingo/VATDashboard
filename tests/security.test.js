/* Focused security checks. Extracts the REAL pure functions from app.js (no browser, no
 * dependencies) and asserts: record-id sanitization (malicious IDs), file-signature
 * matching, the autonomous-TIN apply gate (confirmation / cancellation / retry), and that
 * the Supabase setup SQL declares the expected access policies.
 * Run: node tests/security.test.js */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function extract(name) {
  const start = src.indexOf('function ' + name);
  if (start < 0) throw new Error(name + ' not found in app.js');
  let depth = 0, end = -1;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return eval('(' + src.slice(start, end) + ')');
}
const safeId = extract('safeId');
const matchesDocSignature = extract('matchesDocSignature');
const tinAutoApplyDecision = extract('tinAutoApplyDecision');

let failed = 0;
const check = (label, cond) => { if (cond) console.log('ok   ', label); else { console.error('FAIL ', label); failed++; } };

// ---- Malicious record IDs ----
check('accepts a clean generated id', safeId('tx_abc123_def456') === 'tx_abc123_def456');
check('accepts uuid-ish id', safeId('doc_lm3k2j_9f8e7d') === 'doc_lm3k2j_9f8e7d');
check('rejects JS-string breakout', safeId("x'-alert(1)-'y") === '');
check('rejects attribute breakout', safeId('a" onmouseover="alert(1)') === '');
check('rejects angle brackets', safeId('<script>') === '');
check('rejects quotes', safeId("a'b") === '' && safeId('a"b') === '');
check('rejects spaces', safeId('a b') === '');
check('rejects over-long id (>64)', safeId('a'.repeat(65)) === '');
check('rejects empty / null', safeId('') === '' && safeId(null) === '' && safeId(undefined) === '');

// ---- File signature (magic-byte) validation ----
const pdf = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];
const jpg = [0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0];
const png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
const exe = [0x4D, 0x5A, 0x90, 0, 0, 0, 0, 0]; // MZ (PE executable)
check('pdf bytes match pdf', matchesDocSignature(pdf, 'pdf') === true);
check('jpg bytes match jpg/jpeg', matchesDocSignature(jpg, 'jpg') === true && matchesDocSignature(jpg, 'jpeg') === true);
check('png bytes match png', matchesDocSignature(png, 'png') === true);
check('exe renamed to .pdf is rejected', matchesDocSignature(exe, 'pdf') === false);
check('png bytes claimed as pdf rejected', matchesDocSignature(png, 'pdf') === false);
check('unknown extension rejected', matchesDocSignature(pdf, 'exe') === false);

// ---- Autonomous TIN apply gate (confirmation / cancellation / retry) ----
check('apply when empty TIN + valid candidate', tinAutoApplyDecision({ currentTinDigits: '', candidateDigits: '123456789000' }) === 'apply');
check('cancel (skip) when a TIN already exists', tinAutoApplyDecision({ currentTinDigits: '123456789', candidateDigits: '999888777000' }) === 'skip-has-tin');
check('retry guard: already attempted -> skip', tinAutoApplyDecision({ attempted: true, currentTinDigits: '', candidateDigits: '123456789000' }) === 'skip-attempted');
check('no candidate -> skip', tinAutoApplyDecision({ currentTinDigits: '', candidateDigits: '' }) === 'skip-none');
check('invalid (short) candidate -> skip', tinAutoApplyDecision({ currentTinDigits: '', candidateDigits: '12345' }) === 'skip-invalid');

// ---- Access policies declared in the setup SQL ----
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase-setup-invoice-documents.sql'), 'utf8').toLowerCase();
check('table has RLS enabled', /enable row level security/.test(sql));
check('metadata policy restricted to authenticated', /to authenticated/.test(sql));
check('storage bucket is private (public=false)', /'invoice-documents'[\s\S]*?false/.test(sql));
check('storage policies scoped to the bucket', /bucket_id\s*=\s*'invoice-documents'/.test(sql));

console.log(failed ? ('\n' + failed + ' check(s) FAILED') : '\nAll security checks passed.');
process.exit(failed ? 1 : 0);
