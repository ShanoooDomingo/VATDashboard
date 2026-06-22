# VAT Compliance Purchase Dashboard

This folder is the modular version of the former single-file dashboard.

## Files to upload

Keep this structure together when replacing the old GitHub HTML file:

```text
index.html
styles.css`r`napp.js`r`nsupabase-config.js`r`nsupabase-config.example.js`r`nsupabase-sync.js
```

Open `index.html` as the replacement page. The UI, dashboard logic, import/export behavior, local storage, and Supabase sync are loaded from the files under `assets/`.

## Supabase config

The current Supabase browser config is in:

```text
supabase-config.js
```

Only use a Supabase publishable key or legacy anon key in this browser file. Do not place a Supabase secret key, service role key, database password, or direct database connection string in any browser-loaded file.

For static hosting, GitHub Secrets can keep these values out of the committed repository, but the deployed browser app still needs a generated `supabase-config.js` file to connect.

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

