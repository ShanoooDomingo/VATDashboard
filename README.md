# Purchase Compliance Dashboard

This folder is the modular version of the former single-file dashboard.

## Files to upload

Keep this structure together when replacing the old GitHub HTML file:

```text
index.html
assets/
  css/
    styles.css
  js/
    app.js
    supabase-config.js
    supabase-config.example.js
    supabase-sync.js
```

Open `index.html` as the replacement page. The UI, dashboard logic, import/export behavior, local storage, and Supabase sync are loaded from the files under `assets/`.

## Supabase config

The current Supabase browser config is in:

```text
assets/js/supabase-config.js
```

Only use a Supabase publishable key or legacy anon key in this browser file. Do not place a Supabase secret key, service role key, database password, or direct database connection string in any browser-loaded file.

For static hosting, GitHub Secrets can keep these values out of the committed repository, but the deployed browser app still needs a generated `assets/js/supabase-config.js` file to connect.

Recommended GitHub secret names:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_TABLE
```

Generated file shape:

```js
window.VAT_DASHBOARD_SUPABASE_CONFIG={
  url:'https://your-project-ref.supabase.co',
  publishableKey:'your-supabase-publishable-key',
  table:'your_table_name'
};
```

If you want the Supabase values hidden from browser users, the dashboard needs a backend or serverless proxy. A static HTML/JS app cannot keep runtime Supabase browser settings private from someone inspecting the page or network requests.

## Invoice document management (supporting documents)

Each transaction line in the Purchase Transaction Verification popup has a **Supporting documents** section: upload PDF/JPG/JPEG/PNG files (max 10 MB each), then View, Download, Replace, or Delete them. Files are stored centrally, so a document uploaded on one computer is immediately visible to every logged-in user on every device — no re-upload needed.

How it works:

- File bytes live in a **private Supabase Storage bucket** (`invoice-documents`); the dashboard opens them through short-lived signed URLs, so nothing is publicly reachable.
- Document **metadata** lives in the `vat_invoice_documents` table and syncs through the same shared-cloud machinery as every other dataset (realtime, tombstoned deletes, audit trail module "Invoice Documents").
- Documents are linked to a transaction by its persistent record id, so renaming a CV or invoice number never breaks the link. Display/download names are derived live as `CV_INVOICE_n.ext`.
- Only metadata loads at startup; file content is fetched on demand, so the dashboard stays fast with thousands of documents.

One-time setup: run `supabase-setup-invoice-documents.sql` in the Supabase dashboard SQL Editor **before** deploying the updated files (it creates the table, realtime publication, private bucket, and access policies). Optional overrides in `supabase-config.js`: `tables:{ invoiceDocuments:'...' }` and `storageBucket:'...'`.

Caveat: re-importing transactions with "Replace existing data" assigns new record ids, so documents attached to the replaced rows become unlinked (they stop appearing but stay in storage).

## Security

What the app enforces:

- **Invitation-only accounts.** The login page has no "Create account" control and the browser `signUp()` path is disabled. Enforce this authoritatively in Supabase: **Authentication → Sign In / Providers → turn OFF "Allow new users to sign up."** Existing users keep logging in; the Email provider stays enabled.
- **Private document storage.** Files live in a private bucket and are only ever reached through **short-lived signed URLs** (120 s TTL); there are no public links. View/download tabs use `noopener`.
- **Upload validation.** Every upload is checked for **extension, size (≤10 MB), and content signature (magic bytes)** — a file whose bytes are not a real PDF/JPEG/PNG is rejected even if renamed or given a fake MIME type.
- **Record-id hardening (XSS).** All record ids are validated to `[A-Za-z0-9_-]` on load (`safeId`), so a crafted shared-cloud `record_id` cannot break out of an HTML attribute or inline handler. Document actions use event delegation (`data-*`), not interpolated ids.
- **Logout hygiene.** Logout purges the local dataset cache, sync bookkeeping, and known-cloud-id set from `localStorage`, so a signed-out shared device retains nothing; a fresh login re-pulls from the cloud.
- **On-device OCR.** Supplier-TIN detection runs entirely in the browser (tesseract.js / pdf.js); tax documents are never sent to an external OCR service. Extracted text is not stored.

Recommended hosting configuration (set as real HTTP response headers at your static host / CDN — a static app can only partially self-enforce these):

```
Content-Security-Policy: default-src 'self';
  script-src 'self' 'unsafe-inline' https://cdn.sheetjs.com https://cdn.jsdelivr.net https://unpkg.com;
  connect-src 'self' https://<your-project-ref>.supabase.co wss://<your-project-ref>.supabase.co https://api.ipify.org https://cdn.jsdelivr.net https://unpkg.com https://tessdata.projectnaptha.com;
  worker-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

Known limitations (searchable as `ponytail:` in the source):

- **`script-src` still needs `'unsafe-inline'`** because the app uses legacy inline `onclick` handlers; the document section has already been migrated to event delegation, and the rest should follow to allow dropping `'unsafe-inline'`.
- **Third-party libraries load from CDNs without Subresource Integrity**, and tesseract fetches its WASM core + language data from a CDN at runtime. Pin exact versions with `integrity="sha384-…" crossorigin`, or **self-host** the libraries and OCR assets under `/vendor`, to eliminate execution of unverified remote code.
- **The offline `localStorage` cache is plaintext** while logged in (purged on logout).
- **The audit trail retains field-level old/new values** (TINs, amounts) and best-effort client IP by design; keep `audit_log` access admin-only and RLS-restricted.
