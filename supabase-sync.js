/* Clean Supabase integration layer. Kept separate from the dashboard logic to avoid fragile dashboard patches. */
(function(){
  'use strict';
  const SUPABASE_CONFIG=window.VAT_DASHBOARD_SUPABASE_CONFIG||{};
  const SUPABASE_URL=SUPABASE_CONFIG.url||'';
  const SUPABASE_PUBLISHABLE_KEY=SUPABASE_CONFIG.publishableKey||SUPABASE_CONFIG.anonKey||'';
  const SUPABASE_TABLE=SUPABASE_CONFIG.table||'';
  const SUPABASE_CDN_URLS=Array.isArray(SUPABASE_CONFIG.cdnUrls)&&SUPABASE_CONFIG.cdnUrls.length?SUPABASE_CONFIG.cdnUrls:[
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
    'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.min.js'
  ];
  let supabaseClient=null;
  let cloudUser=null;
  let cloudSaveTimer=null;
  let cloudHasUnsavedLocalChanges=false;
  let cloudApplying=false;
  let cloudBusy=false;
  let lastCloudSave='';
  let originalSaveAll=typeof window.saveAll==='function'?window.saveAll:null;

  function byId(id){return document.getElementById(id)}
  function text(id,value){const el=byId(id);if(el)el.textContent=value}
  function setClass(id,base,type){const el=byId(id);if(el)el.className=base+(type?' '+type:'')}
  function showLoginStatus(message,type){text('loginCloudStatus',message);setClass('loginCloudStatus','login-status',type||'warn')}
  function showErrorBox(message){const el=byId('supabaseErrorBox');if(!el)return;el.textContent=message;el.classList.add('visible');clearTimeout(showErrorBox._timer);showErrorBox._timer=setTimeout(()=>el.classList.remove('visible'),8000)}
  function statusLabel(type){return type==='ok'?'Connected':type==='err'?'Not connected':type==='busy'?'Working':'Attention needed'}
  function setCloudStatus(message,type,meta){
    const t=type||'warn';
    setClass('cloudDot','cloud-dot',t);
    setClass('cloudStatusPill','cloud-pill',t);
    text('cloudStatusPill',statusLabel(t));
    text('cloudStatusDetail',message||'');
    text('cloudMeta',meta||'');
    text('cloudUserText',cloudUser&&cloudUser.email?cloudUser.email:'Not logged in');
    showLoginStatus(message||'',t);
  }
  function setAuthView(isLoggedIn){document.body.classList.toggle('auth-locked',!isLoggedIn);if(isLoggedIn)window.scrollTo(0,0)}
  function getAuthEmail(){return (byId('authEmail')?.value||'').trim()}
  function getAuthPassword(){return (byId('authPassword')?.value||'').trim()}
  function getAppData(){
    return {
      version:2,
      savedAt:new Date().toISOString(),
      transactions:Array.isArray(transactions)?transactions:[],
      vatLedger:Array.isArray(vatLedger)?vatLedger:[],
      ewtLedger:Array.isArray(ewtLedger)?ewtLedger:[],
      supplierMaster:Array.isArray(supplierMaster)?supplierMaster:[],
      atcMaster:Array.isArray(atcMaster)?atcMaster:[],
      VAT_CATEGORIES:Array.isArray(VAT_CATEGORIES)?VAT_CATEGORIES:[],
      activeTab:activeTab||'summary',
      activeMasterSub:activeMasterSub||'vatCategories',
      activeMonth:activeMonth||'all'
    };
  }
  function applyAppData(payload){
    if(!payload||typeof payload!=='object')return false;
    cloudApplying=true;
    try{
      if(Array.isArray(payload.transactions))transactions=typeof normalizeTransaction==='function'?payload.transactions.map(normalizeTransaction):payload.transactions;
      if(Array.isArray(payload.vatLedger))vatLedger=typeof normalizeLedger==='function'?payload.vatLedger.map(r=>normalizeLedger(r,'vat')):payload.vatLedger;
      if(Array.isArray(payload.ewtLedger))ewtLedger=typeof normalizeLedger==='function'?payload.ewtLedger.map(r=>normalizeLedger(r,'ewt')):payload.ewtLedger;
      if(Array.isArray(payload.supplierMaster))supplierMaster=typeof normalizeSupplier==='function'?payload.supplierMaster.map(normalizeSupplier):payload.supplierMaster;
      if(Array.isArray(payload.atcMaster))atcMaster=typeof normalizeAtcMaster==='function'?payload.atcMaster.map(normalizeAtcMaster):payload.atcMaster;
      if(Array.isArray(payload.VAT_CATEGORIES))VAT_CATEGORIES=typeof normalizeVatCategoryMaster==='function'?payload.VAT_CATEGORIES.map(normalizeVatCategoryMaster):payload.VAT_CATEGORIES;
      if(payload.activeTab)activeTab=payload.activeTab;
      if(payload.activeMasterSub)activeMasterSub=payload.activeMasterSub;
      if(payload.activeMonth)activeMonth=payload.activeMonth;
      if(originalSaveAll)originalSaveAll();
      if(typeof window.renderAll==='function')window.renderAll();
      cloudHasUnsavedLocalChanges=false;
      clearTimeout(cloudSaveTimer);
      cloudSaveTimer=null;
      return true;
    }catch(err){
      console.error('Cloud apply failed:',err);
      setCloudStatus('Cloud data loaded, but applying it to the dashboard failed: '+err.message,'warn','Dashboard refresh issue');
      return false;
    }finally{cloudApplying=false;}
  }
  function queueCloudSave(){
    if(cloudApplying)return;
    cloudHasUnsavedLocalChanges=true;
    if(!cloudUser||!supabaseClient)return;
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer=setTimeout(()=>saveCloudData(false),900);
  }
  function wrapSaveAll(){
    originalSaveAll=typeof window.saveAll==='function'?window.saveAll:originalSaveAll;
    window.saveAll=function(){
      if(originalSaveAll)originalSaveAll.apply(this,arguments);
      queueCloudSave();
    };
  }
  function loadScript(url){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.async=true;s.onload=resolve;s.onerror=()=>reject(new Error('Failed to load '+url));document.head.appendChild(s);});}
  async function loadSupabaseLibrary(){
    if(window.supabase&&window.supabase.createClient)return;
    let lastErr=null;
    for(const url of SUPABASE_CDN_URLS){try{await loadScript(url);if(window.supabase&&window.supabase.createClient)return;}catch(err){lastErr=err;}}
    throw lastErr||new Error('Supabase library failed to load.');
  }
  async function initSupabase(){
    wrapSaveAll();
    setAuthView(false);
    setCloudStatus('Preparing secure login...','busy','Loading Supabase Auth');
    if(!SUPABASE_URL||!SUPABASE_PUBLISHABLE_KEY||!SUPABASE_TABLE){
      setCloudStatus('Supabase configuration is missing. Check assets/js/supabase-config.js.','err','Missing configuration');
      showErrorBox('Supabase configuration is missing. Check assets/js/supabase-config.js.');
      return;
    }
    try{
      await loadSupabaseLibrary();
      supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
      const {data,error}=await supabaseClient.auth.getSession();
      if(error)throw error;
      cloudUser=data.session?.user||null;
      if(cloudUser){
        setAuthView(true);
        setCloudStatus('Cloud connection is healthy.','ok','Connected to Supabase');
        await loadCloudData(false);
      }else{
        setAuthView(false);
        setCloudStatus('Not logged in. Please log in to open the dashboard.','err','No active session');
      }
      supabaseClient.auth.onAuthStateChange(async (event,session)=>{
        cloudUser=session?.user||null;
        if(cloudUser){
          setAuthView(true);
          setCloudStatus('Cloud connection is healthy.','ok',lastCloudSave?('Last cloud save: '+lastCloudSave):'Connected to Supabase');
          if(event==='SIGNED_IN')await loadCloudData(false);
        }else{
          setAuthView(false);
          setCloudStatus('Not logged in. Please log in to open the dashboard.','err','No active session');
        }
      });
    }catch(err){
      console.error(err);
      setAuthView(false);
      setCloudStatus('Supabase setup failed: '+err.message,'err','Library or project connection issue');
      showErrorBox('Supabase setup failed: '+err.message);
    }
  }
  async function signUp(){
    try{
      if(!supabaseClient){setCloudStatus('Supabase is still loading. Try again in a few seconds.','busy','Preparing Auth');return;}
      const email=getAuthEmail(),password=getAuthPassword();
      if(!email||!password){setCloudStatus('Type an email and password first.','warn','Missing login details');return;}
      setCloudStatus('Creating account...','busy','Sending signup request');
      const {data,error}=await supabaseClient.auth.signUp({email,password});
      if(error)throw error;
      cloudUser=data.session?.user||null;
      if(cloudUser){setAuthView(true);setCloudStatus('Account created and logged in.','ok','Connected to Supabase');await loadCloudData(false);}else{setAuthView(false);setCloudStatus('Account created. Check your email before logging in if confirmation is enabled.','warn','Waiting for email confirmation');}
    }catch(err){console.error(err);setCloudStatus('Signup error: '+err.message,'warn','Account was not created');showErrorBox('Signup error: '+err.message);}
  }
  async function logIn(){
    try{
      if(!supabaseClient){setCloudStatus('Supabase is still loading. Try again in a few seconds.','busy','Preparing Auth');return;}
      const email=getAuthEmail(),password=getAuthPassword();
      if(!email||!password){setCloudStatus('Type an email and password first.','warn','Missing login details');return;}
      setCloudStatus('Logging in...','busy','Checking credentials');
      const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
      if(error)throw error;
      cloudUser=data.session?.user||data.user||null;
      setAuthView(Boolean(cloudUser));
      setCloudStatus('Logged in. Loading cloud data...','busy','Connected to Supabase');
      await loadCloudData(false);
    }catch(err){console.error(err);setCloudStatus('Login error: '+err.message,'warn','Could not start session');showErrorBox('Login error: '+err.message);}
  }
  async function logOut(){
    try{
      clearTimeout(cloudSaveTimer);
      if(supabaseClient)await supabaseClient.auth.signOut();
      cloudUser=null;lastCloudSave='';
      const p=byId('authPassword');if(p)p.value='';
      closeCloudPopover();setAuthView(false);setCloudStatus('Logged out. Please log in to open the dashboard.','err','No active session');
    }catch(err){console.error(err);showErrorBox('Logout error: '+err.message);}
  }
  async function saveCloudData(manual){
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer=null;
    if(cloudBusy)return;
    if(!supabaseClient){if(manual)showErrorBox('Supabase client is not ready yet.');return;}
    if(!cloudUser){if(manual)showErrorBox('Please log in before saving to Supabase.');setCloudStatus('Please log in before saving to Supabase.','err','No active session');return;}
    cloudBusy=true;setCloudStatus('Saving to cloud...','busy','Uploading dashboard data');
    try{
      const row={user_id:cloudUser.id,is_done:true,app_data:getAppData(),updated_at:new Date().toISOString()};
      const {data,error}=await supabaseClient.from(SUPABASE_TABLE).upsert(row,{onConflict:'user_id'}).select('updated_at').maybeSingle();
      if(error)throw error;
      lastCloudSave=(data?.updated_at?new Date(data.updated_at):new Date()).toLocaleString();
      cloudHasUnsavedLocalChanges=false;
      setCloudStatus('Cloud connection is healthy.','ok','Last cloud save: '+lastCloudSave);
      if(manual&&typeof window.showToast==='function')window.showToast('Saved to Supabase.');
    }catch(err){
      console.error(err);
      const help=err.message&&err.message.includes('null value in column')?' Run the Supabase SQL repair/setup file so id is generated automatically.':'';
      setCloudStatus('Cloud save failed: '+err.message+help,'warn','Click the Cloud status for details');
      if(manual)showErrorBox('Cloud save failed: '+err.message+help);
    }finally{cloudBusy=false;}
  }
  async function loadCloudData(manual){
    if(!supabaseClient){if(manual)showErrorBox('Supabase client is not ready yet.');return;}
    if(!cloudUser){if(manual)showErrorBox('Please log in before loading from Supabase.');setCloudStatus('Please log in before loading from Supabase.','err','No active session');return;}
    if(!manual&&(cloudHasUnsavedLocalChanges||cloudSaveTimer)){
      setCloudStatus('Local upload is pending cloud save. Saving local changes instead of loading older cloud data.','busy','Protecting new upload');
      await saveCloudData(false);
      return;
    }
    setCloudStatus('Loading cloud data...','busy','Fetching dashboard data');
    try{
      const {data,error}=await supabaseClient.from(SUPABASE_TABLE).select('app_data,updated_at').eq('user_id',cloudUser.id).maybeSingle();
      if(error)throw error;
      if(!data){setCloudStatus('No cloud data yet. Saving this local dashboard as your first cloud copy...','warn','First cloud save');await saveCloudData(false);return;}
      if(!manual&&(cloudHasUnsavedLocalChanges||cloudSaveTimer)){
        setCloudStatus('Local upload changed while cloud data was loading. Saving local changes instead of applying older cloud data.','busy','Protecting new upload');
        await saveCloudData(false);
        return;
      }
      applyAppData(data.app_data);
      lastCloudSave=data.updated_at?new Date(data.updated_at).toLocaleString():'';
      setCloudStatus('Cloud connection is healthy.','ok',lastCloudSave?('Last cloud save: '+lastCloudSave):'Loaded from Supabase');
      if(manual&&typeof window.showToast==='function')window.showToast('Loaded from Supabase.');
    }catch(err){console.error(err);setCloudStatus('Cloud load failed: '+err.message,'warn','Click the Cloud status for details');if(manual)showErrorBox('Cloud load failed: '+err.message);}
  }
  function toggleCloudPopover(event){if(event)event.stopPropagation();const widget=byId('cloudWidget');if(!widget)return;widget.classList.toggle('open');const trigger=byId('cloudTrigger');if(trigger)trigger.setAttribute('aria-expanded',widget.classList.contains('open')?'true':'false');}
  function closeCloudPopover(){const widget=byId('cloudWidget');if(widget)widget.classList.remove('open');const trigger=byId('cloudTrigger');if(trigger)trigger.setAttribute('aria-expanded','false');}
  function handleLoginKey(event){if(event.key==='Enter')logIn();}
  document.addEventListener('click',event=>{const widget=byId('cloudWidget');if(widget&&!widget.contains(event.target))closeCloudPopover();});
  window.signUp=signUp;window.logIn=logIn;window.logOut=logOut;window.saveCloudData=saveCloudData;window.loadCloudData=loadCloudData;window.toggleCloudPopover=toggleCloudPopover;window.closeCloudPopover=closeCloudPopover;window.handleLoginKey=handleLoginKey;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initSupabase);else initSupabase();
})();
