# VAT Compliance Purchase Dashboard

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
