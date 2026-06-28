/* =============================================================================
 *  VAT COMPLIANCE DASHBOARD — DATABASE / CLOUD CONFIGURATION
 *  -----------------------------------------------------------------------------
 *  THIS IS THE ONLY FILE IT NEEDS TO EDIT TO REPOINT THE DASHBOARD AT A
 *  DIFFERENT DATABASE. Do NOT put connection details anywhere else, and do NOT
 *  edit supabase-sync.js or app.js for configuration changes.
 *
 *  After editing, save this file and re-publish it (or just re-upload this one
 *  file). No build step is required.
 *
 *  SECURITY: Only ever use a Supabase *publishable* key (or legacy *anon* key)
 *  here. NEVER put a service-role key, database password, or direct Postgres
 *  connection string in this browser file.
 * ========================================================================== */
window.VAT_DASHBOARD_SUPABASE_CONFIG = {

  /* ---- REQUIRED: point these at your Supabase project ---------------------- */
  // Project URL (Supabase dashboard → Project Settings → API → Project URL)
  url: 'https://pqxspjlmxltxpnhvivdy.supabase.co',

  // Publishable / anon key (Project Settings → API → Project API keys → anon/public)
  publishableKey: 'sb_publishable_LtjYerjDYfGusEa8tOGvUg_3VcDJfh4',

  /* ---- OPTIONAL: legacy recovery table ------------------------------------
   * Only used by the one-time "Recover previous data" button to read an older
   * single-blob table. Safe to leave as-is or blank for new deployments. */
  table: 'ShanoooDomingoAFK',

  /* ---- OPTIONAL: table-name overrides -------------------------------------
   * The dashboard expects these table names by default. Leave this section
   * commented out unless your DBA created the tables under different names —
   * then set only the ones that differ. Overriding here means supabase-sync.js
   * never has to be edited.
   *
   * tables: {
   *   transactions:   'vat_transactions',
   *   vatLedger:      'vat_vat_ledger',
   *   ewtLedger:      'vat_ewt_ledger',
   *   supplierMaster: 'vat_supplier_master',
   *   atcMaster:      'vat_atc_master',
   *   vatCategories:  'vat_categories',
   *   auditLog:       'audit_log',
   *   profiles:       'profiles'
   * },
   */

  /* ---- OPTIONAL: self-hosted Supabase JS library --------------------------
   * If your network blocks the public CDN, host supabase.min.js next to these
   * files and set its path here (e.g. 'supabase.min.js'). */
  // libUrl: 'supabase.min.js',

  /* ---- OPTIONAL: turn off the client-IP lookup used in the audit log ------- */
  // disableIpLookup: false,
};
