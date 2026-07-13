/* =====================================================================
 * Centralized Supabase integration for the VAT Compliance Dashboard.
 *
 * Single source of truth: ONE shared company dataset. Every signed-in
 * user reads and writes the SAME rows. Each change is written per-record
 * to the central database, recorded permanently in an immutable audit
 * log, and pushed live to every other open session.
 *
 * This layer is deliberately kept separate from app.js. It does not edit
 * any dashboard logic; it wraps a few global hooks (saveAll, renderAll,
 * switchTab, importRows) and reads the app's own arrays. Every feature,
 * computation and export in app.js stays exactly as it was.
 * ===================================================================== */
(function(){
  'use strict';

  /* ---------- config ----------
   * ALL connection settings come from supabase-config.js (window.VAT_DASHBOARD_SUPABASE_CONFIG).
   * IT should edit that ONE file only. The fallbacks below keep the app working if an
   * optional setting is omitted, so nothing here needs changing to repoint the database. */
  const CFG = window.VAT_DASHBOARD_SUPABASE_CONFIG || {};
  const SUPABASE_URL = CFG.url || '';
  const SUPABASE_KEY = CFG.publishableKey || CFG.anonKey || '';
  const IP_LOOKUP_URL = CFG.ipLookupUrl || 'https://api.ipify.org?format=json';
  const CDN_URLS = (Array.isArray(CFG.cdnUrls) && CFG.cdnUrls.length) ? CFG.cdnUrls : [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
    'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.min.js'
  ];
  /* Database table names. Defaults match the standard schema; IT may override any of
   * them from supabase-config.js via `tables:{...}` WITHOUT editing this file. */
  const TBL = Object.assign({
    transactions:'vat_transactions',
    vatLedger:'vat_vat_ledger',
    ewtLedger:'vat_ewt_ledger',
    supplierMaster:'vat_supplier_master',
    atcMaster:'vat_atc_master',
    vatCategories:'vat_categories',
    auditLog:'audit_log',
    profiles:'profiles'
  }, (CFG.tables && typeof CFG.tables === 'object') ? CFG.tables : {});

  /* ---------- the six shared data tables ----------
   * get()/set() reach the live globals declared in app.js; norm() reuses
   * the app's own normalizers so stored records keep their exact shape. */
  // dedupe policy per entity (see identityKey / reconcile below):
  //   'hard'    = reliable natural key (TIN / ATC code / VAT code / balance tuple):
  //               collapse duplicates to a deterministic survivor AND clean the extra
  //               copies out of the shared cloud.
  //   'prevent' = transactions: block new content-duplicates from ever being pushed,
  //               but never auto-delete a cloud row (two lines can be legitimately
  //               identical, so removing one could lose real data).
  const ENTITIES = [
    { key:'transactions',   table:TBL.transactions,    module:'Purchase Transactions', dedupe:'prevent', get:()=>transactions,   set:v=>{transactions=v},   norm:r=>normalizeTransaction(r) },
    { key:'vatLedger',      table:TBL.vatLedger,       module:'VAT Balances',          dedupe:'hard',    get:()=>vatLedger,      set:v=>{vatLedger=v},      norm:r=>normalizeLedger(r,'vat') },
    { key:'ewtLedger',      table:TBL.ewtLedger,       module:'EWT Balances',          dedupe:'hard',    get:()=>ewtLedger,      set:v=>{ewtLedger=v},      norm:r=>normalizeLedger(r,'ewt') },
    { key:'supplierMaster', table:TBL.supplierMaster,  module:'Supplier Master',       dedupe:'hard',    get:()=>supplierMaster, set:v=>{supplierMaster=v}, norm:r=>normalizeSupplier(r) },
    { key:'atcMaster',      table:TBL.atcMaster,       module:'ATC Master',            dedupe:'hard',    get:()=>atcMaster,      set:v=>{atcMaster=v},      norm:r=>normalizeAtcMaster(r) },
    { key:'VAT_CATEGORIES', table:TBL.vatCategories,   module:'VAT Categories',        dedupe:'hard',    get:()=>VAT_CATEGORIES, set:v=>{VAT_CATEGORIES=v}, norm:r=>normalizeVatCategoryMaster(r) }
  ];
  const ENTITY_BY_KEY = Object.fromEntries(ENTITIES.map(e=>[e.key,e]));

  /* ---------- deterministic record identity (root-cause fix for cross-device dupes) ----------
   * A record's cloud key is its persistent record_id (_id). But the SAME logical record
   * created independently on two devices — a re-import, or the built-in demo Supplier /
   * VAT Category rows, which are seeded with a fresh random _id on every browser — gets a
   * different _id each time, so record_id-only dedup cannot tell they are the same record.
   * We derive a STABLE CONTENT key so those are recognised as one record and never stored,
   * pushed, or kept twice. The key is deterministic (identical on every device) so all
   * clients independently agree on the same survivor and converge without a delete war. */
  function idParts(){ return JSON.stringify([].slice.call(arguments).map(v=>String(v==null?'':v).trim().toLowerCase())); }
  function nTIN(v){ return (typeof normalizeTIN==='function')?normalizeTIN(v):String(v==null?'':v).replace(/[^0-9]/g,''); }
  function nATC(v){ return (typeof normalizeATC==='function')?normalizeATC(v):String(v==null?'':v).trim().toUpperCase(); }
  function identityKey(entityKey, r){
    if(!r) return '';
    switch(entityKey){
      case 'supplierMaster':{ const t=nTIN(r.tin); return t?('tin:'+t):('sup:'+idParts(r.registeredName,r.lastName,r.firstName)); }
      case 'atcMaster':{ const c=nATC(r.atcCode); return c?('atc:'+c):''; }
      case 'VAT_CATEGORIES':{ const c=String(r.code||'').trim().toUpperCase(); return c?('vcat:'+c):''; }
      case 'vatLedger':
      case 'ewtLedger': return 'led:'+idParts(entityKey, r.cv, r.date, r.account, r.ref, r.description, r.amount);
      case 'transactions': return 'tx:'+idParts(r.cv, r.voucherName, r.date, r.inv, r.description, r.tin, r.amount, r.vat, r.ewtAmount, r.atcCode, r.vatCategory, r.accountingTitle, r.bankAccount);
      default: return '';
    }
  }
  // When two records share an identity, the record_id that sorts lowest is the survivor.
  function canonicalPick(a,b){ return String(a)<=String(b)?a:b; }
  // Collapse an array to one record per identity, keeping the deterministic survivor.
  // Returns the deduped array; if `dropped` is passed it receives the losing records.
  function dedupeByIdentity(entityKey, rows, dropped){
    const first=new Map();
    (rows||[]).forEach(rec=>{
      const k=identityKey(entityKey,rec)||('id:'+(rec&&rec._id));
      const ex=first.get(k);
      if(!ex){ first.set(k,rec); return; }
      const survivor=canonicalPick(ex._id,rec._id);
      const loser=(survivor===ex._id)?rec:ex;
      if(survivor!==ex._id) first.set(k,rec);
      if(dropped) dropped.push(loser);
    });
    return [...first.values()];
  }
  // Collapse in-memory 'hard' entities so a re-import in the SAME session never pushes a
  // duplicate (losers already synced become deletes on the next diff; unsynced ones just go).
  function collapseLocalHardDuplicates(){
    ENTITIES.forEach(e=>{
      if(e.dedupe!=='hard') return;
      const cur=e.get()||[]; if(cur.length<2) return;
      const deduped=dedupeByIdentity(e.key,cur);
      if(deduped.length!==cur.length) e.set(deduped);
    });
  }

  /* ---------- state ---------- */
  let supabaseClient = null;
  let cloudUser = null;
  let myProfile = null;
  let isAdmin = false;
  let clientIp = null;
  let lastCloudSave = '';
  let initPromise = null;   // resolves when initSupabase() finishes (success or handled failure)

  let cloudApplying = false;   // true while applying remote data (suppress push)
  let cloudBusy = false;       // true while a sync write is in flight
  let rerunQueued = false;
  let syncTimer = null;
  let deferredSync = false;     // a save was requested while applying; run it right after
  let pendingContext = {};      // optional action label for the next sync (e.g. Upload)

  const snapshots = {};          // entityKey -> Map(record_id -> stable JSON)
  const lastModifiedMap = {};    // record_id -> { by, at }

  /* ---------- persistent "known cloud ids" (fixes stale-device resurrection) ----------
   * snapshots above is in-memory only and starts EMPTY every session, so on the first
   * load after login it cannot tell a record that was deleted remotely while this device
   * was offline from a brand-new local insert — and the preserve step would re-push the
   * stale record, resurrecting deletions. We persist, per browser and per database, the
   * set of record_ids this device last confirmed present in the cloud. Loaded at startup,
   * it gives the preserve guard a reliable cross-session "was this ever in the cloud?"
   * answer: absent-from-cloud + known => deleted remotely (drop); absent + unknown =>
   * genuine unsynced insert (keep). This keeps the database authoritative. */
  function simpleHash(s){ let h=0; s=String(s||''); for(let i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))|0; } return (h>>>0).toString(36); }
  const KNOWN_IDS_KEY = 'vatDashKnownCloudIds_'+simpleHash(SUPABASE_URL);
  let knownCloudIds = (function(){
    const out={};
    try{ const raw=localStorage.getItem(KNOWN_IDS_KEY); if(raw){ const p=JSON.parse(raw); if(p&&typeof p==='object'){ for(const k in p){ if(Array.isArray(p[k])) out[k]=new Set(p[k]); } } } }catch(e){}
    return out;
  })();
  function persistKnownCloudIds(){
    try{
      const obj={};
      ENTITIES.forEach(e=>{ const snap=snapshots[e.key]; obj[e.key]= snap ? [...snap.keys()] : (knownCloudIds[e.key]?[...knownCloudIds[e.key]]:[]); });
      localStorage.setItem(KNOWN_IDS_KEY, JSON.stringify(obj));
      ENTITIES.forEach(e=>{ knownCloudIds[e.key]=new Set(obj[e.key]||[]); });
    }catch(e){}
  }
  let realtimeChannels = [];
  let auditChannel = null;

  let originalSaveAll = (typeof window.saveAll === 'function') ? window.saveAll : null;
  let originalRenderAll = null;
  let originalSwitchTab = null;

  /* audit page state */
  let activeAuditView = false;
  let auditCache = [];
  const AUDIT_FETCH_LIMIT = 1000;

  /* ---------------------------------------------------------------------
   * Service-layer paginated fetch.
   *
   * Supabase (PostgREST) returns AT MOST 1,000 rows per request regardless
   * of how many rows exist. Any plain .select() therefore silently caps at
   * 1,000 and "loses" the rest. This helper pages through the WHOLE table in
   * fixed-size blocks using .range() until a short page is returned, so the
   * entire dataset is always loaded no matter how many months/years/records
   * accumulate. PAGE_SIZE is a batching window, NOT a data cap — there is no
   * 1,000-row limit anywhere. If we ever swap database providers, this single
   * function is the only place that needs a matching pagination strategy. */
  const PAGE_SIZE = 1000;
  async function fetchAllRows(table, columns, decorate){
    const out=[];
    let from=0;
    for(;;){
      let q=supabaseClient.from(table).select(columns).range(from,from+PAGE_SIZE-1);
      if(typeof decorate==='function') q=decorate(q);
      const { data, error } = await q;
      if(error) throw error;
      const batch=data||[];
      out.push(...batch);
      if(batch.length<PAGE_SIZE) break;   // last (short) page reached
      from+=PAGE_SIZE;
    }
    return out;
  }

  /* ---------- small DOM helpers (same UX as before) ---------- */
  function byId(id){ return document.getElementById(id); }
  function text(id,v){ const el=byId(id); if(el) el.textContent=v; }
  function setClass(id,base,type){ const el=byId(id); if(el) el.className=base+(type?' '+type:''); }
  function showLoginStatus(m,t){ text('loginCloudStatus',m); setClass('loginCloudStatus','login-status',t||'warn'); }
  function showErrorBox(m){ const el=byId('supabaseErrorBox'); if(!el)return; el.textContent=m; el.classList.add('visible'); clearTimeout(showErrorBox._t); showErrorBox._t=setTimeout(()=>el.classList.remove('visible'),8000); }
  function statusLabel(t){ return t==='ok'?'Connected':t==='err'?'Not connected':t==='busy'?'Working':'Attention needed'; }
  function setCloudStatus(message,type,meta){
    const t=type||'warn';
    setClass('cloudDot','cloud-dot',t);
    setClass('cloudStatusPill','cloud-pill',t);
    text('cloudStatusPill',statusLabel(t));
    text('cloudStatusDetail',message||'');
    text('cloudMeta',meta||'');
    text('cloudUserText', cloudUser && cloudUser.email ? cloudUser.email : 'Not logged in');
    showLoginStatus(message||'',t);
  }
  function setAuthView(on){ document.body.classList.toggle('auth-locked',!on); if(on) window.scrollTo(0,0); }
  function getAuthEmail(){ return (byId('authEmail')?.value||'').trim(); }
  function getAuthPassword(){ return (byId('authPassword')?.value||'').trim(); }
  function currentUserName(){ return (myProfile&&myProfile.display_name) || (cloudUser&&cloudUser.email) || 'Unknown user'; }

  /* ---------- deterministic stringify (stable key order) ---------- */
  function stableStringify(v){
    if(v===null||typeof v!=='object') return JSON.stringify(v);
    if(Array.isArray(v)) return '['+v.map(stableStringify).join(',')+']';
    return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stableStringify(v[k])).join(',')+'}';
  }
  function safeParse(s){ try{ return JSON.parse(s); }catch(e){ return {}; } }

  /* ---------- change detection ---------- */
  const IGNORE_DIFF_KEYS = new Set(['lastReviewed']); // cosmetic, not a real edit
  function meaningfulDiffKeys(oldRec,newRec){
    const keys=new Set([...Object.keys(oldRec||{}),...Object.keys(newRec||{})]);
    const diff=[];
    keys.forEach(k=>{
      if(k==='_id'||IGNORE_DIFF_KEYS.has(k)) return;
      if(stableStringify(oldRec?oldRec[k]:undefined)!==stableStringify(newRec?newRec[k]:undefined)) diff.push(k);
    });
    return diff;
  }

  function collectChanges(ctx){
    const changes=[]; const noops=[];
    for(const e of ENTITIES){
      const cur=e.get()||[];
      const snap=snapshots[e.key]||(snapshots[e.key]=new Map());
      const seen=new Set();
      for(const rec of cur){
        const id=rec&&rec._id; if(!id) continue;
        seen.add(id);
        const json=stableStringify(rec);
        const prev=snap.get(id);
        if(prev===undefined){
          changes.push({ e, op:'upsert', id, rec, json, action:ctx.action||'Create', oldRec:null, newRec:rec });
        }else if(prev!==json){
          const oldRec=safeParse(prev);
          const diff=meaningfulDiffKeys(oldRec,rec);
          if(!diff.length){ noops.push({ e, id, json }); continue; } // e.g. only lastReviewed moved
          let action=ctx.action || 'Update';
          if(!ctx.action && e.key==='transactions' && diff.length===1 && diff[0]==='manualStatus') action='Status Change';
          changes.push({ e, op:'upsert', id, rec, json, action, oldRec, newRec:rec });
        }
      }
      for(const [id,prev] of snap){
        if(!seen.has(id)) changes.push({ e, op:'delete', id, action:'Delete', oldRec:safeParse(prev), newRec:null });
      }
    }
    return { changes, noops };
  }

  function auditRow(c){
    return {
      user_id: cloudUser.id,
      user_name: currentUserName(),
      action_type: c.action,
      module: c.e.module,
      record_id: c.id,
      old_value: c.oldRec || null,
      new_value: c.newRec || null,
      ip_address: clientIp
    };
  }

  /* ---------- push local changes to the shared database ---------- */
  function queueSync(){
    // Don't drop a save just because a refresh is mid-flight: remember it and run
    // it the instant applying finishes (otherwise a fresh upload could be lost).
    if(cloudApplying){ deferredSync=true; return; }
    if(!supabaseClient || !cloudUser) return; // offline: app.js localStorage still holds the work
    clearTimeout(syncTimer);
    syncTimer=setTimeout(()=>runSync(false),400);
  }
  // Run any save that was requested while we were applying remote data.
  function flushDeferredSync(){ if(deferredSync){ deferredSync=false; queueSync(); } }

  async function runSync(manual){
    clearTimeout(syncTimer); syncTimer=null;
    if(cloudApplying) return;
    if(!supabaseClient || !cloudUser){ if(manual) showErrorBox('Please log in before saving.'); return; }
    if(cloudBusy){ rerunQueued=true; return; }

    const ctx=pendingContext; pendingContext={};
    const { changes, noops } = collectChanges(ctx);
    // Keep snapshots aligned for no-op (cosmetic) differences so we don't re-scan them forever.
    noops.forEach(n=>snapshots[n.e.key].set(n.id,n.json));
    if(!changes.length){ if(manual) showToastSafe('Shared cloud is already up to date.'); return; }

    cloudBusy=true;
    setCloudStatus('Saving changes to shared cloud...','busy','Writing '+changes.length+' change(s)');
    const now=new Date().toISOString();
    const name=currentUserName();
    try{
      const upserts={}, deletes={}, audits=[];
      for(const c of changes){
        if(c.op==='upsert'){
          (upserts[c.e.table]||(upserts[c.e.table]=[])).push({
            record_id:c.id, data:c.rec,
            last_modified_by:cloudUser.id, last_modified_by_name:name, last_modified_at:now
          });
        }else{
          (deletes[c.e.table]||(deletes[c.e.table]=[])).push(c.id);
        }
        audits.push(auditRow(c));
      }
      for(const table in upserts){
        const { error } = await supabaseClient.from(table).upsert(upserts[table],{ onConflict:'record_id' });
        if(error) throw error;
      }
      for(const table in deletes){
        const { error } = await supabaseClient.from(table).delete().in('record_id',deletes[table]);
        if(error) throw error;
      }
      if(audits.length){
        const { error } = await supabaseClient.from(TBL.auditLog).insert(audits);
        if(error) throw error;
      }
      // Commit local bookkeeping only after the database confirms.
      for(const c of changes){
        if(c.op==='upsert'){ snapshots[c.e.key].set(c.id,c.json); lastModifiedMap[c.id]={ by:name, at:now }; }
        else { snapshots[c.e.key].delete(c.id); delete lastModifiedMap[c.id]; }
      }
      persistKnownCloudIds();   // a deleted record leaves the known-ids set so it is never re-pushed
      lastCloudSave=new Date(now).toLocaleString();
      setCloudStatus('Shared cloud is up to date.','ok','Last change saved: '+lastCloudSave);
      if(manual) showToastSafe('Saved to shared cloud.');
      cloudApplying=true; try{ rerender(); }finally{ cloudApplying=false; }
    }catch(err){
      console.error('Cloud save failed:',err);
      setCloudStatus('Cloud save failed: '+err.message,'warn','Click Cloud for details');
      if(manual) showErrorBox('Cloud save failed: '+err.message);
      // snapshots are unchanged for failed items, so the next sync retries them
    }finally{
      cloudBusy=false;
      if(rerunQueued){ rerunQueued=false; queueSync(); }
      flushDeferredSync();
    }
  }

  /* ---------- initial + ongoing load of the shared (central) dataset ----------
   * This pulls the ONE shared dataset for every entity. It is the single global
   * source of truth: after it runs, the local arrays mirror the central tables
   * exactly. Used on login, on manual Load, by realtime, and by the periodic
   * background refresh. Returns true if anything actually changed so the quiet
   * background poll only re-renders when there is something new. */
  async function loadAllCentral(opts={}){
    cloudApplying=true;
    let changed=false, pendingLocal=0;
    const dupeDeletes={};   // table -> [record_id,...] redundant cloud copies to remove ('hard' only)
    try{
      for(const e of ENTITIES){
        // Page through the FULL table (works around the 1,000-row request cap).
        const data = await fetchAllRows(e.table,'record_id,data,last_modified_by_name,last_modified_at');
        let rows=(data||[]).map(r=>{
          const rec=e.norm(r.data); rec._id=r.record_id;
          lastModifiedMap[r.record_id]={ by:r.last_modified_by_name, at:r.last_modified_at };
          return rec;
        });
        // 'hard' entities: collapse any pre-existing cloud duplicates (same content under
        // different record_ids, e.g. suppliers/VAT categories re-seeded on many devices) to
        // one deterministic survivor, and remember the losers so we can clean the cloud.
        if(e.dedupe==='hard'){
          const dropped=[];
          rows=dedupeByIdentity(e.key,rows,dropped);
          dropped.forEach(r=>{ if(r&&r._id)(dupeDeletes[e.table]||(dupeDeletes[e.table]=[])).push(r._id); });
        }
        const arr=[]; const snap=new Map(); const identities=new Set();
        rows.forEach(rec=>{ arr.push(rec); snap.set(rec._id,stableStringify(rec)); identities.add(identityKey(e.key,rec)||('id:'+rec._id)); });
        const prev=snapshots[e.key];
        const known=knownCloudIds[e.key];   // persisted across sessions/logins
        // PRESERVE only genuinely NEW local records that were never synced. A local record
        // is a pending insert when it is NOT in the cloud now by record_id, NOT in the cloud
        // by CONTENT identity, AND was never previously confirmed in the cloud — checked
        // against BOTH the in-session snapshot AND the persisted known-cloud-ids. If it WAS
        // previously in the cloud (this session or a past one) but is gone now, it was
        // deleted remotely, so we drop it instead of re-pushing it. This is what stops a
        // stale/offline device from resurrecting records the database no longer has.
        (e.get()||[]).forEach(r=>{
          const id=r&&r._id; if(!id) return;
          if(snap.has(id)) return;
          const key=identityKey(e.key,r)||('id:'+id);
          if(identities.has(key)) return;
          if((prev&&prev.has(id))||(known&&known.has(id))) return; // deleted remotely -> do not restore
          arr.push(r); identities.add(key); pendingLocal++;
        });
        if(!changed){
          if(!prev||prev.size!==snap.size) changed=true;
          else { for(const [id,json] of snap){ if(prev.get(id)!==json){ changed=true; break; } } }
        }
        e.set(arr); snapshots[e.key]=snap;
      }
      persistKnownCloudIds();   // record the current cloud truth so deletions stick across logins
      if(originalSaveAll) originalSaveAll();   // refresh local cache only
      if(changed || pendingLocal || Object.keys(dupeDeletes).length || !opts.quiet) rerender();
    }finally{ cloudApplying=false; }
    // Clean redundant cloud duplicates. Safe & idempotent: a deterministic survivor of the
    // same identity is always retained, so no device ever deletes the last copy, and once
    // the cloud is clean this loop finds nothing. Best-effort — a failure just retries next load.
    for(const table in dupeDeletes){
      const ids=[...new Set(dupeDeletes[table])];
      if(!ids.length) continue;
      try{ await supabaseClient.from(table).delete().in('record_id',ids); }
      catch(err){ console.warn('Duplicate cleanup skipped for',table,err&&err.message); }
    }
    // Push any preserved local inserts (and any save deferred during applying).
    if(pendingLocal>0) deferredSync=true;
    flushDeferredSync();
    return changed;
  }

  /* ---------- background refresh: guarantee a single global source of truth ----------
   * Realtime (postgres_changes) is the fast path, but it requires Realtime to be
   * enabled on the tables in the Supabase project. To make centralization robust
   * regardless of that setting, every signed-in client also pulls the shared
   * dataset on a short interval and whenever the tab regains focus. This converges
   * all users onto the same data even if realtime events are missed. It never
   * disrupts an in-progress edit or a pending local save. */
  let refreshTimer=null;
  const BACKGROUND_REFRESH_MS=15000;
  function userIsEditingField(){
    const el=document.activeElement; if(!el) return false;
    const tag=(el.tagName||'').toUpperCase();
    return tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA';
  }
  async function backgroundRefresh(){
    if(!supabaseClient || !cloudUser) return;
    if(cloudBusy || cloudApplying) return;   // a write/apply is already running
    if(syncTimer) return;                    // a local change is queued to push first
    if(document.hidden) return;              // tab not visible
    if(userIsEditingField()) return;         // don't yank data while the user types
    try{ await loadAllCentral({quiet:true}); }catch(err){ /* transient; next tick retries */ }
  }
  function startBackgroundRefresh(){ stopBackgroundRefresh(); refreshTimer=setInterval(backgroundRefresh,BACKGROUND_REFRESH_MS); }
  function stopBackgroundRefresh(){ if(refreshTimer){ clearInterval(refreshTimer); refreshTimer=null; } }

  // First user ever: lift their existing localStorage data into the shared cloud.
  async function seedFromLocal(localArrays){
    const now=new Date().toISOString(); const name=currentUserName();
    for(const e of ENTITIES){
      let rows=(localArrays[e.key]||[]).filter(r=>r&&r._id);
      if(e.dedupe==='hard') rows=dedupeByIdentity(e.key,rows); // don't seed duplicate masters/balances
      if(!rows.length) continue;
      const up=rows.map(r=>({ record_id:r._id, data:r, last_modified_by:cloudUser.id, last_modified_by_name:name, last_modified_at:now }));
      const audits=rows.map(r=>({ user_id:cloudUser.id, user_name:name, action_type:'Sync', module:e.module, record_id:r._id, old_value:null, new_value:r, ip_address:clientIp }));
      const a=await supabaseClient.from(e.table).upsert(up,{ onConflict:'record_id' });
      if(a.error) throw a.error;
      await supabaseClient.from(TBL.auditLog).insert(audits);
      e.set(rows.slice());
      const snap=new Map(); rows.forEach(r=>{ snap.set(r._id,stableStringify(r)); lastModifiedMap[r._id]={ by:name, at:now }; });
      snapshots[e.key]=snap;
    }
    persistKnownCloudIds();
    if(originalSaveAll) originalSaveAll();
    cloudApplying=true; try{ rerender(); }finally{ cloudApplying=false; }
  }

  /* ---------- realtime: merge other users' changes live ---------- */
  let renderDebounce=null;
  function applyAndRender(){
    clearTimeout(renderDebounce);
    renderDebounce=setTimeout(()=>{
      cloudApplying=true;
      try{ if(originalSaveAll) originalSaveAll(); rerender(); }
      finally{ cloudApplying=false; }
      flushDeferredSync();
    },120);
  }

  function handleRealtime(e,payload){
    const id=(payload.new&&payload.new.record_id)||(payload.old&&payload.old.record_id);
    if(!id) return;
    if(payload.eventType==='DELETE'){
      if(!snapshots[e.key]||!snapshots[e.key].has(id)) return; // already gone / own echo
      e.set((e.get()||[]).filter(r=>r._id!==id));
      snapshots[e.key].delete(id); delete lastModifiedMap[id];
      persistKnownCloudIds();   // a remote delete drops the id so this device never restores it
      applyAndRender(); return;
    }
    if(!payload.new||!payload.new.data) return;
    const rec=e.norm(payload.new.data); rec._id=id;
    const json=stableStringify(rec);
    if(snapshots[e.key] && snapshots[e.key].get(id)===json) return; // unchanged / own echo
    const arr=(e.get()||[]).slice();
    const idx=arr.findIndex(r=>r._id===id);
    if(idx>=0) arr[idx]=rec; else arr.push(rec);
    e.set(arr);
    (snapshots[e.key]||(snapshots[e.key]=new Map())).set(id,json);
    lastModifiedMap[id]={ by:payload.new.last_modified_by_name, at:payload.new.last_modified_at };
    persistKnownCloudIds();
    applyAndRender();
  }

  function subscribeRealtime(){
    unsubscribeRealtime();
    realtimeChannels=ENTITIES.map(e=>
      supabaseClient.channel('vatdash-'+e.table)
        .on('postgres_changes',{ event:'*', schema:'public', table:e.table }, p=>handleRealtime(e,p))
        .subscribe()
    );
    if(isAdmin){
      auditChannel=supabaseClient.channel('vatdash-audit')
        .on('postgres_changes',{ event:'INSERT', schema:'public', table:TBL.auditLog }, p=>{
          if(!p.new) return;
          auditCache.unshift(p.new);
          if(auditCache.length>2*AUDIT_FETCH_LIMIT) auditCache.length=2*AUDIT_FETCH_LIMIT;
          if(activeAuditView) renderAuditTable();
        })
        .subscribe();
    }
  }
  function unsubscribeRealtime(){
    realtimeChannels.forEach(ch=>{ try{ supabaseClient.removeChannel(ch); }catch(e){} });
    realtimeChannels=[];
    if(auditChannel){ try{ supabaseClient.removeChannel(auditChannel); }catch(e){} auditChannel=null; }
  }

  /* ---------- profile / admin ---------- */
  async function loadProfile(){
    myProfile=null; isAdmin=false;
    if(!cloudUser) return;
    try{
      let { data } = await supabaseClient.from(TBL.profiles).select('display_name,role,email').eq('id',cloudUser.id).maybeSingle();
      if(!data){
        await supabaseClient.from(TBL.profiles).insert({ id:cloudUser.id, email:cloudUser.email, display_name:(cloudUser.email||'').split('@')[0] });
        const r=await supabaseClient.from(TBL.profiles).select('display_name,role,email').eq('id',cloudUser.id).maybeSingle();
        data=r.data;
      }
      if(data){ myProfile=data; isAdmin=(data.role==='admin'); }
    }catch(err){ console.error('Profile load failed:',err); }
    syncAuditTabVisibility();
  }
  function syncAuditTabVisibility(){
    const b=byId('tabAuditBtn');
    if(b) b.style.display=isAdmin?'inline-flex':'none';
    if(!isAdmin && activeAuditView && originalSwitchTab) originalSwitchTab('summary');
  }

  /* ---------- best-effort client IP ---------- */
  async function fetchIp(){
    if(CFG.disableIpLookup){ clientIp=null; return; }
    try{ const r=await fetch(IP_LOOKUP_URL,{ cache:'no-store' }); const j=await r.json(); clientIp=j&&(j.ip||j.address)||null; }
    catch(e){ clientIp=null; }
  }

  /* ---------- "last modified" info badges (injected after each render) ---------- */
  function lmButtonHtml(lm){
    const when=lm&&lm.at?new Date(lm.at).toLocaleString():'—';
    const who=lm&&lm.by?lm.by:'Unknown';
    return '<span class="column-info-wrap lm-badge"><button type="button" class="info-icon-btn column-info-btn" aria-label="Last modified details" onclick="event.stopPropagation()">i</button>'
         + '<span class="column-tooltip"><strong>Last modified by</strong> '+escapeHtml(who)+'<br/><strong>When</strong> '+escapeHtml(when)+'</span></span>';
  }
  function escapeHtml(v){ return (typeof esc==='function')?esc(v):String(v==null?'':v); }
  function rerender(){ if(originalRenderAll) originalRenderAll(); try{ injectLastModified(); }catch(e){} }

  function injectTableBadges(tbodyId, keyToId){
    const tb=byId(tbodyId); if(!tb) return;
    Array.prototype.forEach.call(tb.rows,tr=>{
      if(tr.querySelector('.lm-badge')) return;
      if(!tr.cells||tr.cells.length<2) return; // skip empty-state rows
      const key=(tr.cells[0].textContent||'').trim();
      if(!key||key==='--') return;
      const id=keyToId(key); if(!id) return;
      const lm=lastModifiedMap[id]; if(!lm) return;
      const cell=tr.cells[tr.cells.length-1]; if(!cell) return;
      cell.insertAdjacentHTML('beforeend',' '+lmButtonHtml(lm));
    });
  }

  function injectLastModified(){
    try{
      // Purchase Transactions verification cards (each carries data-id).
      document.querySelectorAll('.verification-card').forEach(card=>{
        if(card.querySelector('.lm-badge')) return;
        const rm=card.querySelector('.wp-remove[data-id]'); if(!rm) return;
        const id=rm.getAttribute('data-id'); const lm=lastModifiedMap[id]; if(!lm) return;
        const host=card.querySelector('.verification-actions-right'); if(!host) return;
        host.insertAdjacentHTML('afterbegin',lmButtonHtml(lm)+' ');
      });
      // Master tables: map the first-column key back to the record _id.
      injectTableBadges('supplierTbody', key=>{
        const n=normalizeTIN(key);
        const m=(supplierMaster||[]).find(s=>normalizeTIN(s.tin)===n);
        return m&&m._id;
      });
      injectTableBadges('atcTbody', key=>{
        const c=normalizeATC(key);
        const m=(atcMaster||[]).find(a=>normalizeATC(a.atcCode)===c);
        return m&&m._id;
      });
      injectTableBadges('vatCategoryTbody', key=>{
        const c=normalizeVatCodeRaw(key);
        const m=(VAT_CATEGORIES||[]).find(v=>v.code===c);
        return m&&m._id;
      });
    }catch(err){ /* badges are best-effort; never block rendering */ }
  }

  /* ---------- Audit Trail page (admin only) ---------- */
  const FIELD_LABELS={ voucherName:'Voucher', supplier:'Supplier', registeredName:'Registered Name', tin:'TIN', cv:'CV No.', inv:'Invoice', date:'Date', description:'Description', amount:'Amount', vat:'VAT', total:'Total', ewtAmount:'EWT', vatable:'Vatable', nonVatable:'Non-vatable', atcCode:'ATC Code', vatCategory:'VAT Category', manualStatus:'Status', reviewNote:'Note', accountingTitle:'Accounting Title', bankAccount:'Bank Account', address:'Address', city:'City', zip:'ZIP', code:'Code', label:'Description', rate:'Rate', kind:'VAT Type', source:'Source', account:'Account', ref:'Reference', supplierManualOverride:'Manual override' };
  const MONEY_FIELDS=new Set(['amount','vat','total','ewtAmount','vatable','nonVatable']);
  function fieldLabel(k){ return FIELD_LABELS[k]||k; }
  function valLabel(k,v){
    if(v===undefined||v===null||v==='') return '(blank)';
    if(k==='manualStatus'&&typeof verificationText==='function') return verificationText(v);
    if(MONEY_FIELDS.has(k)&&typeof pesoText==='function') return pesoText(Number(v)||0);
    if(typeof v==='object') return JSON.stringify(v);
    return String(v);
  }
  function describeChange(a){
    if(a.action_type==='Delete') return 'Removed record';
    if((a.action_type==='Create'||a.action_type==='Upload'||a.action_type==='Sync') && !a.old_value) return 'New record added';
    const o=a.old_value||{}, n=a.new_value||{};
    const keys=meaningfulDiffKeys(o,n);
    if(!keys.length) return '—';
    return keys.slice(0,5).map(k=>fieldLabel(k)+': '+valLabel(k,o[k])+' \u2192 '+valLabel(k,n[k])).join('; ')+(keys.length>5?'; \u2026':'');
  }
  function actionBadgeClass(action){
    if(action==='Create'||action==='Upload'||action==='Sync') return 'badge-ok';
    if(action==='Delete') return 'badge-err';
    if(action==='Status Change') return 'badge-review';
    return 'badge-na';
  }

  function openAuditTrail(){
    if(!isAdmin){ showToastSafe('The Audit Trail is available to admins only.'); return; }
    activeAuditView=true;
    ['summarySheet','workingSheet','vatSheet','ewtSheet','birSheet','mastersSheet'].forEach(id=>byId(id)&&byId(id).classList.remove('active'));
    ['tabSummaryBtn','tabWorkingBtn','tabVatBtn','tabEwtBtn','tabBirBtn','tabMastersBtn'].forEach(id=>byId(id)&&byId(id).classList.remove('active'));
    if(byId('tabAuditBtn')) byId('tabAuditBtn').classList.add('active');
    if(byId('auditSheet')) byId('auditSheet').classList.add('active');
    const mt=byId('monthTabs'); if(mt){ mt.innerHTML=''; mt.style.display='none'; }
    const ps=byId('periodSelector'); if(ps){ ps.style.display='none'; ps.classList.remove('open'); }
    byId('importPanel')&&byId('importPanel').classList.remove('visible');
    byId('addPanel')&&byId('addPanel').classList.remove('visible');
    ['importBtn','addBtn','exportBtn'].forEach(id=>byId(id)&&(byId(id).style.display='none'));
    loadAuditTrail();
  }

  async function loadAuditTrail(){
    if(!isAdmin||!supabaseClient) return;
    const tb=byId('auditTbody'); if(tb) tb.innerHTML='<tr><td colspan="7"><div class="empty-state">Loading audit trail...</div></td></tr>';
    try{
      const { data, error } = await supabaseClient.from(TBL.auditLog)
        .select('*').order('created_at',{ ascending:false }).limit(AUDIT_FETCH_LIMIT);
      if(error) throw error;
      auditCache=data||[];
      renderAuditTable();
    }catch(err){
      console.error('Audit load failed:',err);
      if(tb) tb.innerHTML='<tr><td colspan="7"><div class="empty-state">Could not load the audit trail: '+escapeHtml(err.message)+'</div></td></tr>';
    }
  }

  function filteredAudit(){
    const moduleF=(byId('auditModuleFilter')?.value||'');
    const actionF=(byId('auditActionFilter')?.value||'');
    const search=(byId('auditSearch')?.value||'').toLowerCase();
    const from=(byId('auditFromDate')?.value||'');
    const to=(byId('auditToDate')?.value||'');
    const fromT=from?new Date(from+'T00:00:00').getTime():null;
    const toT=to?new Date(to+'T23:59:59').getTime():null;
    return auditCache.filter(a=>{
      if(moduleF && a.module!==moduleF) return false;
      if(actionF && a.action_type!==actionF) return false;
      if(fromT||toT){ const t=new Date(a.created_at).getTime(); if(fromT&&t<fromT)return false; if(toT&&t>toT)return false; }
      if(search){
        const hay=[a.user_name,a.action_type,a.module,a.record_id,describeChange(a),a.ip_address].map(v=>String(v||'').toLowerCase()).join(' ');
        if(!hay.includes(search)) return false;
      }
      return true;
    });
  }

  function renderAuditTable(){
    const tb=byId('auditTbody'); if(!tb) return;
    const rows=filteredAudit();
    text('auditCount', rows.length+' of '+auditCache.length+' event(s)'+(auditCache.length>=AUDIT_FETCH_LIMIT?' (latest '+AUDIT_FETCH_LIMIT+')':''));
    if(!rows.length){ tb.innerHTML='<tr><td colspan="7"><div class="empty-state">No audit events match your filters.</div></td></tr>'; return; }
    tb.innerHTML=rows.map(a=>{
      const when=a.created_at?new Date(a.created_at).toLocaleString():'—';
      return '<tr>'
        +'<td class="mono">'+escapeHtml(when)+'</td>'
        +'<td>'+escapeHtml(a.user_name||'—')+'</td>'
        +'<td><span class="badge '+actionBadgeClass(a.action_type)+'">'+escapeHtml(a.action_type)+'</span></td>'
        +'<td>'+escapeHtml(a.module||'—')+'</td>'
        +'<td class="mono">'+escapeHtml(a.record_id||'—')+'</td>'
        +'<td class="audit-change">'+escapeHtml(describeChange(a))+'</td>'
        +'<td class="mono">'+escapeHtml(a.ip_address||'—')+'</td>'
        +'</tr>';
    }).join('');
  }

  function refreshAuditTrail(){ loadAuditTrail(); }
  function exportAuditTrail(){
    if(typeof downloadXLSX!=='function'){ showToastSafe('Export engine not ready.'); return; }
    const rows=[['Date and Time','User Name','User ID','Action','Module','Record ID','Old Value','New Value','IP Address']];
    filteredAudit().forEach(a=>rows.push([
      a.created_at?new Date(a.created_at).toLocaleString():'',
      a.user_name||'', a.user_id||'', a.action_type||'', a.module||'', a.record_id||'',
      a.old_value?JSON.stringify(a.old_value):'', a.new_value?JSON.stringify(a.new_value):'', a.ip_address||''
    ]));
    downloadXLSX(rows,'audit_trail_export.xlsx','Audit Trail');
    showToastSafe('Audit trail exported.');
  }

  /* ---------- wrap the app's global hooks (app.js untouched) ---------- */
  function wrapGlobals(){
    // saveAll: keep original localStorage behavior, then push the diff to the cloud.
    originalSaveAll = (typeof window.saveAll==='function') ? window.saveAll : originalSaveAll;
    window.saveAll = function(){
      // Collapse any in-session duplicate masters/balances (e.g. a re-import of the same
      // file) BEFORE persisting/pushing, so we never send a duplicate to the shared cloud.
      if(!cloudApplying){ try{ collapseLocalHardDuplicates(); }catch(err){ console.warn('Local dedupe skipped:',err&&err.message); } }
      if(originalSaveAll) originalSaveAll.apply(this,arguments);
      if(cloudApplying) return;
      queueSync();
    };
    // renderAll: after every render, (re)inject the last-modified badges.
    if(typeof window.renderAll==='function' && !originalRenderAll){
      originalRenderAll = window.renderAll;
      window.renderAll = function(){
        const r=originalRenderAll.apply(this,arguments);
        try{ injectLastModified(); }catch(e){}
        return r;
      };
    }
    // switchTab: leaving any of the six tabs closes the Audit view cleanly.
    if(typeof window.switchTab==='function' && !originalSwitchTab){
      originalSwitchTab = window.switchTab;
      window.switchTab = function(){
        activeAuditView=false;
        byId('tabAuditBtn')&&byId('tabAuditBtn').classList.remove('active');
        byId('auditSheet')&&byId('auditSheet').classList.remove('active');
        return originalSwitchTab.apply(this,arguments);
      };
    }
    // importRows: label rows created/updated by an XLSX import as "Upload".
    if(typeof window.importRows==='function' && !window.importRows.__wrapped){
      const origImport=window.importRows;
      window.importRows=function(){ pendingContext={ action:'Upload' }; return origImport.apply(this,arguments); };
      window.importRows.__wrapped=true;
    }
  }

  function showToastSafe(m){ if(typeof window.showToast==='function') window.showToast(m); }

  /* ---------- auth actions (same buttons as before) ---------- */
  let afterLoginBusy=false;
  async function afterLogin(){
    // Guard against overlapping startups (initSupabase's initial call + an auth-state
    // event, or a fast re-login) so the initial download and seed never run twice at once.
    if(afterLoginBusy) return;
    afterLoginBusy=true;
    try{
      setAuthView(true);
      setCloudStatus('Connecting to shared cloud...','busy','Loading workspace');
      await fetchIp();
      await loadProfile();
      const before={}; let hadLocal=false;
      ENTITIES.forEach(e=>{ const a=(e.get()||[]).slice(); before[e.key]=a; if(a.length) hadLocal=true; });
      await loadAllCentral();   // initial download completes BEFORE realtime subscribes (below)
      const centralEmpty=ENTITIES.every(e=>(e.get()||[]).length===0);
      if(centralEmpty && hadLocal){
        setCloudStatus('Uploading your existing data to the shared cloud...','busy','First-time setup');
        try{ await seedFromLocal(before); }catch(err){ console.error('Seed failed:',err); showErrorBox('Could not upload local data: '+err.message); }
      }
      subscribeRealtime();
      startBackgroundRefresh();   // safety net so all users converge even without realtime
      setCloudStatus('Shared cloud is up to date.','ok', lastCloudSave?('Last change saved: '+lastCloudSave):'Connected to shared cloud');
    }finally{ afterLoginBusy=false; }
  }

  /* ---------- load the Supabase browser library ---------- */
  function loadScript(url){
    return new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=url; s.async=true;
      s.onload=resolve;
      s.onerror=()=>reject(new Error('Failed to load '+url));
      document.head.appendChild(s);
    });
  }
  async function loadSupabaseLibrary(){
    if(window.supabase && window.supabase.createClient) return; // already present (e.g. self-hosted)
    const urls=[];
    if(CFG.libUrl) urls.push(CFG.libUrl);           // optional self-hosted copy
    CDN_URLS.forEach(u=>urls.push(u));
    let lastErr=null;
    for(const url of urls){
      try{
        await loadScript(url);
        if(window.supabase && window.supabase.createClient) return;
      }catch(err){ lastErr=err; }
    }
    throw lastErr || new Error('Supabase library failed to load from all sources.');
  }

  async function initSupabase(){
    wrapGlobals();
    setAuthView(false);
    setCloudStatus('Preparing secure login...','busy','Loading Supabase');
    if(!SUPABASE_URL||!SUPABASE_KEY){
      setCloudStatus('Supabase configuration is missing. Check supabase-config.js.','err','Missing configuration');
      showErrorBox('Supabase configuration is missing. Check supabase-config.js.');
      return;
    }
    try{
      await loadSupabaseLibrary();
      supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
      const { data, error } = await supabaseClient.auth.getSession();
      if(error) throw error;
      cloudUser=data.session?.user||null;
      if(cloudUser){ await afterLogin(); }
      else { setAuthView(false); setCloudStatus('Not logged in. Please log in to open the dashboard.','err','No active session'); }

      supabaseClient.auth.onAuthStateChange(async (event,session)=>{
        const next=session?.user||null;
        const wasUser=cloudUser&&cloudUser.id;
        cloudUser=next;
        if(cloudUser){
          if(event==='SIGNED_IN' && cloudUser.id!==wasUser){ await afterLogin(); }
          else { setAuthView(true); }
        }else{
          unsubscribeRealtime();
          stopBackgroundRefresh();
          setAuthView(false);
          setCloudStatus('Not logged in. Please log in to open the dashboard.','err','No active session');
        }
      });
    }catch(err){
      console.error(err);
      setAuthView(false);
      const libIssue=/load/i.test(err.message||'');
      const msg=libIssue
        ? 'Could not load the Supabase library. Your network or host may be blocking the CDN (check the browser Console). You can host supabase.min.js next to your files and set libUrl in supabase-config.js.'
        : 'Supabase setup failed: '+err.message;
      setCloudStatus(msg,'err',libIssue?'Library not loaded':'Connection issue');
      showErrorBox(msg);
    }
  }

  async function signUp(){
    try{
      if(!supabaseClient){ setCloudStatus('Connecting to Supabase...','busy','Loading library'); if(initPromise){ try{ await initPromise; }catch(e){} } }
      if(!supabaseClient){ setCloudStatus('Could not connect to Supabase. The Supabase library did not load \u2014 your network or host may be blocking the CDN. Open the browser Console for the exact error, or host supabase.min.js next to your files and set libUrl in supabase-config.js.','err','Library not loaded'); showErrorBox('The Supabase library did not load. Check the browser Console (likely a blocked CDN request or Content-Security-Policy).'); return; }
      const email=getAuthEmail(), password=getAuthPassword();
      if(!email||!password){ setCloudStatus('Type an email and password first.','warn','Missing login details'); return; }
      setCloudStatus('Creating account...','busy','Sending signup request');
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if(error) throw error;
      cloudUser=data.session?.user||null;
      if(cloudUser){ await afterLogin(); }
      else { setAuthView(false); setCloudStatus('Account created. Confirm your email before logging in if confirmation is enabled.','warn','Waiting for email confirmation'); }
    }catch(err){ console.error(err); setCloudStatus('Signup error: '+err.message,'warn','Account was not created'); showErrorBox('Signup error: '+err.message); }
  }
  async function logIn(){
    try{
      if(!supabaseClient){ setCloudStatus('Connecting to Supabase...','busy','Loading library'); if(initPromise){ try{ await initPromise; }catch(e){} } }
      if(!supabaseClient){ setCloudStatus('Could not connect to Supabase. The Supabase library did not load \u2014 your network or host may be blocking the CDN. Open the browser Console for the exact error, or host supabase.min.js next to your files and set libUrl in supabase-config.js.','err','Library not loaded'); showErrorBox('The Supabase library did not load. Check the browser Console (likely a blocked CDN request or Content-Security-Policy).'); return; }
      const email=getAuthEmail(), password=getAuthPassword();
      if(!email||!password){ setCloudStatus('Type an email and password first.','warn','Missing login details'); return; }
      setCloudStatus('Logging in...','busy','Checking credentials');
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if(error) throw error;
      cloudUser=data.session?.user||data.user||null;
      if(cloudUser) await afterLogin();
    }catch(err){ console.error(err); setCloudStatus('Login error: '+err.message,'warn','Could not start session'); showErrorBox('Login error: '+err.message); }
  }
  async function logOut(){
    try{
      clearTimeout(syncTimer);
      unsubscribeRealtime();
      stopBackgroundRefresh();
      if(supabaseClient) await supabaseClient.auth.signOut();
      cloudUser=null; myProfile=null; isAdmin=false; lastCloudSave=''; activeAuditView=false;
      const p=byId('authPassword'); if(p) p.value='';
      syncAuditTabVisibility();
      closeCloudPopover(); setAuthView(false);
      setCloudStatus('Logged out. Please log in to open the dashboard.','err','No active session');
    }catch(err){ console.error(err); showErrorBox('Logout error: '+err.message); }
  }

  // Cloud popover buttons: Save = push pending diff now; Load = re-pull shared data.
  async function saveCloudData(manual){ await runSync(!!manual); }
  async function loadCloudData(manual){
    if(!supabaseClient||!cloudUser){ if(manual) showErrorBox('Please log in first.'); return; }
    setCloudStatus('Loading shared cloud data...','busy','Fetching latest');
    try{ await loadAllCentral(); setCloudStatus('Shared cloud is up to date.','ok','Loaded latest shared data'); if(manual) showToastSafe('Loaded latest shared data.'); }
    catch(err){ console.error(err); setCloudStatus('Cloud load failed: '+err.message,'warn','Click Cloud for details'); if(manual) showErrorBox('Cloud load failed: '+err.message); }
  }

  // One-time recovery: pull any prior work from the legacy per-user storage
  // (the old blob table named in supabase-config.js, plus whatever this
  // browser still holds) and merge it into the shared central tables.
  // Safe to run more than once: records dedupe by their stable _id.
  async function recoverPreviousData(){
    if(!supabaseClient||!cloudUser){ showErrorBox('Please log in first.'); return; }
    const legacyTable = CFG.table || '';
    setCloudStatus('Recovering previous data...','busy','Reading earlier storage');
    try{
      const merged={}; ENTITIES.forEach(e=>merged[e.key]=new Map());

      // 1) Legacy blob table (old decentralized cloud copy). RLS may limit
      //    this to the rows you are allowed to read (usually your own).
      if(legacyTable){
        let data=null;
        try{ data = await fetchAllRows(legacyTable,'*'); }
        catch(error){ console.warn('Legacy table read skipped:', error.message); }
        if(Array.isArray(data)){
          data.sort((a,b)=> new Date(a.updated_at||a.created_at||0) - new Date(b.updated_at||b.created_at||0)); // newest overwrites
          data.forEach(row=>{
            const app = row.app_data || row.data || row.payload || null;
            if(!app||typeof app!=='object') return;
            ENTITIES.forEach(e=>{
              const arr = Array.isArray(app[e.key]) ? app[e.key] : [];
              arr.forEach(r=>{ const rec=e.norm(r); if(!rec._id) rec._id=makeId(e.key); merged[e.key].set(rec._id,rec); });
            });
          });
        }
      }

      // 2) Whatever this browser currently holds in memory / local storage.
      ENTITIES.forEach(e=>{ (e.get()||[]).forEach(r=>{ const rec=e.norm(r); if(rec._id && !merged[e.key].has(rec._id)) merged[e.key].set(rec._id,rec); }); });

      const total = ENTITIES.reduce((n,e)=>n+merged[e.key].size,0);
      if(!total){ setCloudStatus('No previous data found to recover.','warn','Nothing to import'); showErrorBox('No previous data was found in the legacy table or this browser. If the work was done on another computer or account, run Recover there, or check that the table name in supabase-config.js is correct.'); return; }

      const now=new Date().toISOString(); const name=currentUserName();
      let imported=0, newlyAudited=0;
      for(const e of ENTITIES){
        const rows=[...merged[e.key].values()];
        if(!rows.length) continue;
        const up=rows.map(r=>({ record_id:r._id, data:r, last_modified_by:cloudUser.id, last_modified_by_name:name, last_modified_at:now }));
        const res=await supabaseClient.from(e.table).upsert(up,{ onConflict:'record_id' });
        if(res.error) throw res.error;
        imported+=rows.length;
        // Audit only records that were not already in the shared tables.
        const fresh=rows.filter(r=>!(snapshots[e.key] && snapshots[e.key].has(r._id)));
        const audits=fresh.map(r=>({ user_id:cloudUser.id, user_name:name, action_type:'Sync', module:e.module, record_id:r._id, old_value:null, new_value:r, ip_address:clientIp }));
        for(let i=0;i<audits.length;i+=500){ const ar=await supabaseClient.from(TBL.auditLog).insert(audits.slice(i,i+500)); if(ar.error) console.warn('Audit insert warn:',ar.error.message); }
        newlyAudited+=audits.length;
      }
      await loadAllCentral();
      setCloudStatus('Previous data recovered into the shared cloud.','ok', imported+' record(s) now shared');
      showToastSafe('Recovered '+imported+' record(s) ('+newlyAudited+' new) into the shared workspace.');
    }catch(err){
      console.error('Recovery failed:',err);
      setCloudStatus('Recovery failed: '+err.message,'warn','Click Cloud for details');
      showErrorBox('Recovery failed: '+err.message);
    }
  }

  /* ---------- cloud popover plumbing (unchanged UX) ---------- */
  function toggleCloudPopover(event){ if(event) event.stopPropagation(); const w=byId('cloudWidget'); if(!w) return; w.classList.toggle('open'); const t=byId('cloudTrigger'); if(t) t.setAttribute('aria-expanded',w.classList.contains('open')?'true':'false'); }
  function closeCloudPopover(){ const w=byId('cloudWidget'); if(w) w.classList.remove('open'); const t=byId('cloudTrigger'); if(t) t.setAttribute('aria-expanded','false'); }
  function handleLoginKey(event){ if(event.key==='Enter') logIn(); }
  document.addEventListener('click',event=>{ const w=byId('cloudWidget'); if(w&&!w.contains(event.target)) closeCloudPopover(); });
  // Pull the latest shared data the moment the user returns to the tab/window,
  // so they never look at stale data after switching away.
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) backgroundRefresh(); });
  window.addEventListener('focus',()=>backgroundRefresh());

  /* ---------- exports ---------- */
  window.signUp=signUp; window.logIn=logIn; window.logOut=logOut;
  window.saveCloudData=saveCloudData; window.loadCloudData=loadCloudData; window.recoverPreviousData=recoverPreviousData;
  window.toggleCloudPopover=toggleCloudPopover; window.closeCloudPopover=closeCloudPopover; window.handleLoginKey=handleLoginKey;
  window.openAuditTrail=openAuditTrail; window.refreshAuditTrail=refreshAuditTrail; window.exportAuditTrail=exportAuditTrail; window.auditApplyFilters=renderAuditTable;

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{ initPromise=initSupabase(); });
  else initPromise=initSupabase();
})();
