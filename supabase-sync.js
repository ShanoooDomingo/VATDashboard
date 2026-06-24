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

  /* ---------- config ---------- */
  const CFG = window.VAT_DASHBOARD_SUPABASE_CONFIG || {};
  const SUPABASE_URL = CFG.url || '';
  const SUPABASE_KEY = CFG.publishableKey || CFG.anonKey || '';
  const IP_LOOKUP_URL = CFG.ipLookupUrl || 'https://api.ipify.org?format=json';
  const CDN_URLS = (Array.isArray(CFG.cdnUrls) && CFG.cdnUrls.length) ? CFG.cdnUrls : [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
    'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.min.js'
  ];

  /* ---------- the six shared data tables ----------
   * get()/set() reach the live globals declared in app.js; norm() reuses
   * the app's own normalizers so stored records keep their exact shape. */
  const ENTITIES = [
    { key:'transactions',   table:'vat_transactions',    module:'Purchase Transactions', get:()=>transactions,   set:v=>{transactions=v},   norm:r=>normalizeTransaction(r) },
    { key:'vatLedger',      table:'vat_vat_ledger',      module:'VAT Balances',          get:()=>vatLedger,      set:v=>{vatLedger=v},      norm:r=>normalizeLedger(r,'vat') },
    { key:'ewtLedger',      table:'vat_ewt_ledger',      module:'EWT Balances',          get:()=>ewtLedger,      set:v=>{ewtLedger=v},      norm:r=>normalizeLedger(r,'ewt') },
    { key:'supplierMaster', table:'vat_supplier_master', module:'Supplier Master',       get:()=>supplierMaster, set:v=>{supplierMaster=v}, norm:r=>normalizeSupplier(r) },
    { key:'atcMaster',      table:'vat_atc_master',      module:'ATC Master',            get:()=>atcMaster,      set:v=>{atcMaster=v},      norm:r=>normalizeAtcMaster(r) },
    { key:'VAT_CATEGORIES', table:'vat_categories',      module:'VAT Categories',        get:()=>VAT_CATEGORIES, set:v=>{VAT_CATEGORIES=v}, norm:r=>normalizeVatCategoryMaster(r) }
  ];
  const ENTITY_BY_KEY = Object.fromEntries(ENTITIES.map(e=>[e.key,e]));

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
  let pendingContext = {};      // optional action label for the next sync (e.g. Upload)

  const snapshots = {};          // entityKey -> Map(record_id -> stable JSON)
  const lastModifiedMap = {};    // record_id -> { by, at }
  let realtimeChannels = [];
  let auditChannel = null;

  let originalSaveAll = (typeof window.saveAll === 'function') ? window.saveAll : null;
  let originalRenderAll = null;
  let originalSwitchTab = null;

  /* audit page state */
  let activeAuditView = false;
  let auditCache = [];
  const AUDIT_FETCH_LIMIT = 1000;

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
    if(cloudApplying) return;
    if(!supabaseClient || !cloudUser) return; // offline: app.js localStorage still holds the work
    clearTimeout(syncTimer);
    syncTimer=setTimeout(()=>runSync(false),400);
  }

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
        const { error } = await supabaseClient.from('audit_log').insert(audits);
        if(error) throw error;
      }
      // Commit local bookkeeping only after the database confirms.
      for(const c of changes){
        if(c.op==='upsert'){ snapshots[c.e.key].set(c.id,c.json); lastModifiedMap[c.id]={ by:name, at:now }; }
        else { snapshots[c.e.key].delete(c.id); delete lastModifiedMap[c.id]; }
      }
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
    }
  }

  /* ---------- initial load of the shared dataset ---------- */
  async function loadAllCentral(){
    cloudApplying=true;
    try{
      for(const e of ENTITIES){
        const { data, error } = await supabaseClient.from(e.table)
          .select('record_id,data,last_modified_by_name,last_modified_at');
        if(error) throw error;
        const arr=[]; const snap=new Map();
        (data||[]).forEach(r=>{
          const rec=e.norm(r.data); rec._id=r.record_id;
          arr.push(rec); snap.set(r.record_id,stableStringify(rec));
          lastModifiedMap[r.record_id]={ by:r.last_modified_by_name, at:r.last_modified_at };
        });
        e.set(arr); snapshots[e.key]=snap;
      }
      if(originalSaveAll) originalSaveAll();   // refresh local cache only
      rerender();
    }finally{ cloudApplying=false; }
  }

  // First user ever: lift their existing localStorage data into the shared cloud.
  async function seedFromLocal(localArrays){
    const now=new Date().toISOString(); const name=currentUserName();
    for(const e of ENTITIES){
      const rows=(localArrays[e.key]||[]).filter(r=>r&&r._id);
      if(!rows.length) continue;
      const up=rows.map(r=>({ record_id:r._id, data:r, last_modified_by:cloudUser.id, last_modified_by_name:name, last_modified_at:now }));
      const audits=rows.map(r=>({ user_id:cloudUser.id, user_name:name, action_type:'Sync', module:e.module, record_id:r._id, old_value:null, new_value:r, ip_address:clientIp }));
      const a=await supabaseClient.from(e.table).upsert(up,{ onConflict:'record_id' });
      if(a.error) throw a.error;
      await supabaseClient.from('audit_log').insert(audits);
      e.set(rows.slice());
      const snap=new Map(); rows.forEach(r=>{ snap.set(r._id,stableStringify(r)); lastModifiedMap[r._id]={ by:name, at:now }; });
      snapshots[e.key]=snap;
    }
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
    },120);
  }

  function handleRealtime(e,payload){
    const id=(payload.new&&payload.new.record_id)||(payload.old&&payload.old.record_id);
    if(!id) return;
    if(payload.eventType==='DELETE'){
      if(!snapshots[e.key]||!snapshots[e.key].has(id)) return; // already gone / own echo
      e.set((e.get()||[]).filter(r=>r._id!==id));
      snapshots[e.key].delete(id); delete lastModifiedMap[id];
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
        .on('postgres_changes',{ event:'INSERT', schema:'public', table:'audit_log' }, p=>{
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
      let { data } = await supabaseClient.from('profiles').select('display_name,role,email').eq('id',cloudUser.id).maybeSingle();
      if(!data){
        await supabaseClient.from('profiles').insert({ id:cloudUser.id, email:cloudUser.email, display_name:(cloudUser.email||'').split('@')[0] });
        const r=await supabaseClient.from('profiles').select('display_name,role,email').eq('id',cloudUser.id).maybeSingle();
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
    byId('importPanel')&&byId('importPanel').classList.remove('visible');
    byId('addPanel')&&byId('addPanel').classList.remove('visible');
    ['importBtn','addBtn','exportBtn'].forEach(id=>byId(id)&&(byId(id).style.display='none'));
    loadAuditTrail();
  }

  async function loadAuditTrail(){
    if(!isAdmin||!supabaseClient) return;
    const tb=byId('auditTbody'); if(tb) tb.innerHTML='<tr><td colspan="7"><div class="empty-state">Loading audit trail...</div></td></tr>';
    try{
      const { data, error } = await supabaseClient.from('audit_log')
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
  async function afterLogin(){
    setAuthView(true);
    setCloudStatus('Connecting to shared cloud...','busy','Loading workspace');
    await fetchIp();
    await loadProfile();
    const before={}; let hadLocal=false;
    ENTITIES.forEach(e=>{ const a=(e.get()||[]).slice(); before[e.key]=a; if(a.length) hadLocal=true; });
    await loadAllCentral();
    const centralEmpty=ENTITIES.every(e=>(e.get()||[]).length===0);
    if(centralEmpty && hadLocal){
      setCloudStatus('Uploading your existing data to the shared cloud...','busy','First-time setup');
      try{ await seedFromLocal(before); }catch(err){ console.error('Seed failed:',err); showErrorBox('Could not upload local data: '+err.message); }
    }
    subscribeRealtime();
    setCloudStatus('Shared cloud is up to date.','ok', lastCloudSave?('Last change saved: '+lastCloudSave):'Connected to shared cloud');
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

  /* ---------- cloud popover plumbing (unchanged UX) ---------- */
  function toggleCloudPopover(event){ if(event) event.stopPropagation(); const w=byId('cloudWidget'); if(!w) return; w.classList.toggle('open'); const t=byId('cloudTrigger'); if(t) t.setAttribute('aria-expanded',w.classList.contains('open')?'true':'false'); }
  function closeCloudPopover(){ const w=byId('cloudWidget'); if(w) w.classList.remove('open'); const t=byId('cloudTrigger'); if(t) t.setAttribute('aria-expanded','false'); }
  function handleLoginKey(event){ if(event.key==='Enter') logIn(); }
  document.addEventListener('click',event=>{ const w=byId('cloudWidget'); if(w&&!w.contains(event.target)) closeCloudPopover(); });

  /* ---------- exports ---------- */
  window.signUp=signUp; window.logIn=logIn; window.logOut=logOut;
  window.saveCloudData=saveCloudData; window.loadCloudData=loadCloudData;
  window.toggleCloudPopover=toggleCloudPopover; window.closeCloudPopover=closeCloudPopover; window.handleLoginKey=handleLoginKey;
  window.openAuditTrail=openAuditTrail; window.refreshAuditTrail=refreshAuditTrail; window.exportAuditTrail=exportAuditTrail; window.auditApplyFilters=renderAuditTable;

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{ initPromise=initSupabase(); });
  else initPromise=initSupabase();
})();
