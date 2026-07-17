-- =====================================================================
-- Invoice Document Management — one-time Supabase setup
--
-- Run this in the Supabase dashboard (SQL Editor) BEFORE deploying the
-- updated dashboard files. It creates:
--   1. vat_invoice_documents  — document METADATA table (same 5-column
--      shape as every other vat_* data table; the app stores the whole
--      record in the jsonb `data` column keyed by record_id).
--   2. Realtime publication for that table (live cross-device sync).
--   3. A PRIVATE storage bucket `invoice-documents` for the file bytes,
--      with a 10 MB per-file cap and a PDF/JPEG/PNG MIME allowlist.
--   4. Storage policies: any AUTHENTICATED user of the shared workspace
--      can read/write objects in this bucket. Nothing is public — the
--      dashboard always reads files through short-lived signed URLs.
--
-- After running, verify:
--   * Table editor shows vat_invoice_documents.
--   * Storage shows bucket invoice-documents with "Public" OFF.
--   * Database → Publications → supabase_realtime includes the table.
--
-- Notes:
--   * The table name can be overridden from supabase-config.js via
--     tables:{ invoiceDocuments:'your_table_name' }; the bucket name via
--     storageBucket:'your-bucket-name'.
--   * If the dashboard is deployed before this runs, the app still works:
--     the invoice-documents entity is marked optional and is skipped
--     until the table exists (uploads are refused with a toast).
--   * Orphan cleanup (rare; e.g. a browser closed between the storage
--     upload and the first successful metadata sync): list the bucket's
--     objects and delete any whose doc id no longer appears in
--     vat_invoice_documents.data->>'storagePath'.
-- =====================================================================

-- 1) Metadata table --------------------------------------------------
create table if not exists public.vat_invoice_documents (
  record_id             text primary key,
  data                  jsonb not null,
  last_modified_by      uuid,
  last_modified_by_name text,
  last_modified_at      timestamptz default now()
);

-- RLS: shared-workspace model — every authenticated user reads/writes
-- the same rows (matches the other vat_* tables).
alter table public.vat_invoice_documents enable row level security;

drop policy if exists "invoice docs authenticated all" on public.vat_invoice_documents;
create policy "invoice docs authenticated all"
  on public.vat_invoice_documents
  for all to authenticated
  using (true) with check (true);

-- 2) Realtime ---------------------------------------------------------
-- (Wrapped so a re-run does not fail if the table was already added.)
do $$
begin
  alter publication supabase_realtime add table public.vat_invoice_documents;
exception when duplicate_object then
  null;
end $$;

-- 3) Private storage bucket ------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invoice-documents',
  'invoice-documents',
  false,
  10485760, -- 10 MB
  array['application/pdf','image/jpeg','image/png']
)
on conflict (id) do nothing;

-- 4) Storage object policies (scoped strictly to this bucket) ---------
drop policy if exists "invoice docs read"   on storage.objects;
drop policy if exists "invoice docs insert" on storage.objects;
drop policy if exists "invoice docs update" on storage.objects;
drop policy if exists "invoice docs delete" on storage.objects;

create policy "invoice docs read"
  on storage.objects for select to authenticated
  using (bucket_id = 'invoice-documents');

create policy "invoice docs insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'invoice-documents');

create policy "invoice docs update"
  on storage.objects for update to authenticated
  using (bucket_id = 'invoice-documents');

create policy "invoice docs delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'invoice-documents');
