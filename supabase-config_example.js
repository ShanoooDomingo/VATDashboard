/* =============================================================================
 *  TEMPLATE — copy this file to "supabase-config.js" and fill in your values.
 *  This is the ONLY file IT edits to connect the dashboard to a database.
 *  Use ONLY a publishable/anon key here — never a service-role key or password.
 * ========================================================================== */
window.VAT_DASHBOARD_SUPABASE_CONFIG = {
  // REQUIRED
  url: 'https://your-project-ref.supabase.co',
  publishableKey: 'your-supabase-publishable-or-anon-key',

  // OPTIONAL — legacy recovery table (leave blank for new deployments)
  table: '',

  // OPTIONAL — only if your tables use non-default names:
  // tables: {
  //   transactions:'vat_transactions', vatLedger:'vat_vat_ledger',
  //   ewtLedger:'vat_ewt_ledger', supplierMaster:'vat_supplier_master',
  //   atcMaster:'vat_atc_master', vatCategories:'vat_categories',
  //   auditLog:'audit_log', profiles:'profiles'
  // },

  // OPTIONAL — self-hosted Supabase library if the CDN is blocked:
  // libUrl: 'supabase.min.js',
};
