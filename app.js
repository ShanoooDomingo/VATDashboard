const TX_KEY='vatPurchaseVoucherVerificationTxCleanV1';
const VAT_LEDGER_KEY='vatPurchaseVatLedgerCleanV1';
const EWT_LEDGER_KEY='vatPurchaseEwtLedgerCleanV1';
const SUPPLIER_MASTER_KEY='vatPurchaseSupplierMasterV1';
const ATC_MASTER_KEY='vatPurchaseAtcMasterDatabaseOnlyV1';
const VAT_CATEGORIES_KEY='vatPurchaseVatCategoriesMasterV1';
const INVOICE_DOCS_KEY='vatPurchaseInvoiceDocumentsV1';
const COMPANY_PROFILE={tin:'008737954',filingType:'P',registeredName:'LOCANDSTOR 247 INC',lastName:'',firstName:'',middleName:'',tradeName:'LOCSTOR 247 INC',address:'54 E RODRIGUEZ JR AVE BRGY BAGONG ILOG',cityZip:'PASIG CITY NCR 1604',branchCode:'043',taxRateCode:'12'};
const demoTransactions=[];
const demoVatLedger=[];
const demoEwtLedger=[];
const demoAtcMaster=[];

const demoSupplierMaster=[
  {tin:'123-456-789-000',registeredName:'Supplier A Corporation',lastName:'',firstName:'',middleName:'',address:'100 Ayala Avenue',city:'Makati City',zip:'1226'},
  {tin:'234-567-890-000',registeredName:'Supplier B Services',lastName:'',firstName:'',middleName:'',address:'12 Shaw Boulevard',city:'Mandaluyong City',zip:'1550'},
  {tin:'345-678-901-000',registeredName:'Supplier C Trading',lastName:'',firstName:'',middleName:'',address:'88 Quezon Avenue',city:'Quezon City',zip:'1100'},
  {tin:'456-789-012-000',registeredName:'',lastName:'Dela Cruz',firstName:'Juan',middleName:'Santos',address:'45 Mabini Street',city:'Manila',zip:'1000'},
  {tin:'567-890-123-000',registeredName:'Supplier Y Inc.',lastName:'',firstName:'',middleName:'',address:'9 Rizal Drive',city:'Taguig City',zip:'1634'}
];
let activeTab='summary';
let activeMasterSub='vatCategories';
let activeYear='all';
let activeMonth='all';
let activePurchaseBreakdown=null;
let workSort={key:'date',dir:'asc'};
let summarySort={key:'first',dir:'asc'};
let summaryViewMode='count';
let activeSummaryStatus='';
let activeBirReport='slpExcel';
let focusedCV=null;
let pendingScrollCV=null;
const BALANCE_ALLOWANCE=0.51;
const openSummary=new Set();
let activeSummaryReview=null;
const openCVs=new Set();
const MONTH_NAMES=[['Jan','january','jan'],['Feb','february','feb'],['Mar','march','mar'],['Apr','april','apr'],['May','may'],['Jun','june','jun'],['Jul','july','jul'],['Aug','august','aug'],['Sep','september','sept','sep'],['Oct','october','oct'],['Nov','november','nov'],['Dec','december','dec']];
function makeId(prefix='id'){return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)}
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function attr(v){return esc(v)}
function parseMoney(value){let raw=String(value??'').trim();if(!raw||raw==='-'||raw==='--'||raw.toLowerCase()==='n/a')return 0;let negative=false;if(/^\(.*\)$/.test(raw)){negative=true;raw=raw.slice(1,-1)}raw=raw.replace(/[₱,\s]/g,'');const parsed=parseFloat(raw);if(!Number.isFinite(parsed))return 0;return negative?-parsed:parsed}
function fmt(n){return Number(n||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}
function peso(n){const value=Number(n||0);const negative=value<0;return `<span class="peso"><span class="peso-paren">${negative?'(':''}</span><span class="peso-sign">₱</span><span class="peso-num">${fmt(Math.abs(value))}</span><span class="peso-paren">${negative?')':''}</span></span>`}
function pesoText(n){const value=Number(n||0);const body='₱ '+fmt(Math.abs(value));return value<0?'('+body+')':body}
function money(n){return pesoText(n)}
function getValue(id){const el=document.getElementById(id);return el?el.value.trim():''}
function setValue(id,value){const el=document.getElementById(id);if(el)el.value=value??''}
function readMoney(id){return parseMoney(getValue(id))}
function isStrictMMDDYYYY(value){
  const raw=String(value??'').trim();
  const m=raw.match(/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/(19\d{2}|20\d{2})$/);
  if(!m)return false;
  const mm=Number(m[1]),dd=Number(m[2]),yyyy=Number(m[3]);
  const d=new Date(yyyy,mm-1,dd);
  return d.getFullYear()===yyyy&&d.getMonth()===(mm-1)&&d.getDate()===dd;
}
function normalizeImportDate(value){
  if(value instanceof Date&&!Number.isNaN(value.getTime())){
    const mm=String(value.getMonth()+1).padStart(2,'0');
    const dd=String(value.getDate()).padStart(2,'0');
    return `${mm}/${dd}/${value.getFullYear()}`;
  }
  const raw=String(value??'').trim();
  if(!raw)return '';
  if(isStrictMMDDYYYY(raw))return raw;
  const m=raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
  if(!m)return '';
  const mm=Number(m[1]),dd=Number(m[2]);
  let yyyy=Number(m[3]);
  if(m[3].length===2)yyyy=yyyy>=50?1900+yyyy:2000+yyyy;
  const d=new Date(yyyy,mm-1,dd);
  if(d.getFullYear()!==yyyy||d.getMonth()!==mm-1||d.getDate()!==dd)return '';
  return `${String(mm).padStart(2,'0')}/${String(dd).padStart(2,'0')}/${yyyy}`;
}
function requireMMDDYYYY(value,label='Date'){
  const raw=String(value??'').trim();
  if(isStrictMMDDYYYY(raw))return raw;
  showToast(`${label} must use MM/DD/YYYY format, for example 04/05/2026.`);
  return '';
}
function dateSortNumber(value){
  const raw=String(value??'').trim();
  if(isStrictMMDDYYYY(raw)){
    const [mm,dd,yyyy]=raw.split('/').map(Number);
    return yyyy*10000+mm*100+dd;
  }
  return null;
}
function loadArray(key,fallback){try{const raw=localStorage.getItem(key);if(raw){const parsed=JSON.parse(raw);if(Array.isArray(parsed))return parsed}}catch(err){}return fallback}
function saveAll(){invalidateVisibleCache();try{localStorage.setItem(TX_KEY,JSON.stringify(transactions));localStorage.setItem(VAT_LEDGER_KEY,JSON.stringify(vatLedger));localStorage.setItem(EWT_LEDGER_KEY,JSON.stringify(ewtLedger));localStorage.setItem(SUPPLIER_MASTER_KEY,JSON.stringify(supplierMaster));localStorage.setItem(ATC_MASTER_KEY,JSON.stringify(atcMaster));localStorage.setItem(VAT_CATEGORIES_KEY,JSON.stringify(VAT_CATEGORIES));localStorage.setItem(INVOICE_DOCS_KEY,JSON.stringify(invoiceDocuments))}catch(err){}}
function parseVerification(value){const v=String(value??'').trim().toLowerCase();if(!v||['unreviewed','for review','not reviewed'].includes(v))return 'unreviewed';if(['ok','compliant','fully compliant','with invoice','has invoice','invoice'].includes(v))return 'ok';if(['warn','without invoice','no invoice','missing invoice','without-invoice','without_invoice'].includes(v))return 'warn';if(['err','error','non-compliant','non compliant','non_compliant','noncompliant','with issues','non-compliant invoice','invoice has non-compliant part'].includes(v))return 'err';if(['journal','journal entry','journal-entry','journal_entry','je'].includes(v))return 'journal';if(['adjusting','adjusting entry','adjusting-entry','adjusting_entry','adjustment','aje'].includes(v))return 'adjusting';return 'unreviewed'}
function verificationText(status){if(status==='ok')return 'Compliant';if(status==='warn')return 'Without Invoice';if(status==='err')return 'Non-Compliant';if(status==='journal')return 'Journal Entry';if(status==='adjusting')return 'Adjusting Entry';return 'Unreviewed'}
// Journal Entry and Adjusting Entry are intentional postings that do not require
// invoice / VAT category / ATC / TIN, so they are exempt from incomplete flags.
function isExemptEntry(t){const s=t&&t.manualStatus;return s==='journal'||s==='adjusting'}
// Adjusting Entries are additionally excluded from all BIR Compliance Export math.
function isAdjustingEntry(t){return (t&&t.manualStatus)==='adjusting'}
function normalizeATC(value){const raw=String(value??'').trim().toUpperCase();if(!raw||raw==='-'||raw==='--'||raw==='N/A'||raw==='NONE')return '';const compact=raw.replace(/[^A-Z0-9]/g,'');const match=compact.match(/^([A-Z]{2})(\d{3})$/);return match?`${match[1]} ${match[2]}`:''}
function isValidATC(value){const raw=String(value??'').trim();return !raw||Boolean(normalizeATC(raw))}
function atcText(value){return normalizeATC(value)||'--'}
function parseRate(value){
  const raw=String(value??'').trim();
  if(!raw||raw==='-'||raw==='--'||raw.toLowerCase()==='n/a')return null;
  const hasPercent=raw.includes('%');
  const parsed=parseFloat(raw.replace('%','').replace(/,/g,''));
  if(!Number.isFinite(parsed))return null;
  // Master rates are stored as percentage points for display/export, e.g. 5.00 means 5%.
  // Accept common upload formats: 5, 5%, or 0.05 all normalize to 5.
  if(!hasPercent&&parsed>0&&parsed<1)return parsed*100;
  return parsed;
}
function normalizeAtcMaster(row){return{_id:row?._id||makeId('atc'),atcCode:normalizeATC(row?.atcCode??row?.atc_code??row?.atc??row?.code),rate:parseRate(row?.rate??row?.ewt_rate??row?.percentage??row?.tax_rate),description:String(row?.description??row?.nature??row?.income_payment??row?.payment_type??'').trim(),source:String(row?.source??row?.database_source??row?.reference??row?.basis??row?.legal_basis??'').trim(),status:String(row?.status??'active').trim().toLowerCase()||'active'}}
function atcLookup(code){const normalized=normalizeATC(code);if(!normalized)return null;const source=(typeof atcMaster!=='undefined'&&Array.isArray(atcMaster)?atcMaster:demoAtcMaster||[]).map(normalizeAtcMaster);return source.find(a=>normalizeATC(a.atcCode)===normalized)||null}
function atcRateForCode(code){const found=atcLookup(code);return found&&Number.isFinite(found.rate)?found.rate:null}
function atcRateText(code){const rate=atcRateForCode(code);return rate===null?'--':rate.toFixed(2).replace(/\.00$/,'')+'%'}
function ewtBaseAmount(t){return Number(t?.amount||0)}
function expectedEwtAmount(t){const rate=atcRateForCode(t?.atcCode);if(rate===null)return 0;return ewtBaseAmount(t)*rate/100}
function ewtExpectedDisplay(t){const rate=atcRateForCode(t?.atcCode);if(normalizeATC(t?.atcCode)&&rate===null)return `<span class="variance-bad">Rate missing</span><div class="mono">Upload ATC Master</div>`;const expected=expectedEwtAmount(t);const diff=Number(t.ewtAmount||0)-expected;return `<span class="${isBalanced(diff)?'variance-good':'variance-bad'}">${peso(expected)}</span><div class="mono">ATC ${esc(atcRateText(t.atcCode))}</div>`}
function ewtRateMismatch(t){return false}
const demoVatCategories=[
  {code:'S',label:'Vatable services',kind:'VAT Registered',rate:12,status:'locked'},
  {code:'G',label:'Vatable goods',kind:'VAT Registered',rate:12,status:'locked'},
  {code:'I',label:'Vatable importation',kind:'VAT Registered',rate:12,status:'locked'},
  {code:'CG',label:'Vatable capital goods',kind:'VAT Registered',rate:12,status:'locked'},
  {code:'SNQ',label:'Non-VAT services',kind:'Non-VAT',rate:0,status:'locked'},
  {code:'GNQ',label:'Non-VAT goods',kind:'Non-VAT',rate:0,status:'locked'}
];
function normalizeVatCodeRaw(value){return String(value??'').trim().toUpperCase().replace(/[^A-Z]/g,'')}
function normalizeVatCategoryMaster(row){return{_id:row?._id||makeId('vatcat'),code:normalizeVatCodeRaw(row?.code??row?.vatCategory??row?.vat_category??row?.vat_category_code??row?.category),label:String(row?.label??row?.description??row?.desc??row?.meaning??'').trim(),kind:String(row?.kind??row?.vatType??row?.vat_type??row?.type??'VAT Registered').trim()||'VAT Registered',rate:parseRate(row?.rate??row?.vat_rate??row?.percentage)??0,status:String(row?.status??'active').trim().toLowerCase()||'active'}}
function normalizeVATCategory(value){const raw=String(value??'').trim().toUpperCase().replace(/[^A-Z]/g,'');return VAT_CATEGORIES.some(c=>c.code===raw)?raw:''}
function vatCategoryLookup(code){const normalized=normalizeVATCategory(code);return VAT_CATEGORIES.find(c=>c.code===normalized)||null}
function vatCategoryText(code){const c=vatCategoryLookup(code);return c?`${c.code} - ${c.label}`:'--'}
function vatRateForCategory(code){const c=vatCategoryLookup(code);return c?c.rate:null}
function isVatableCategory(code){const rate=vatRateForCategory(code);return Number(rate||0)>0}
function computeVATFromCategory(vatable,category){const rate=vatRateForCategory(category);if(rate===null)return 0;return Number(vatable||0)*rate/100}
function taxableBaseFromAmount(amount,category){return isVatableCategory(category)?Number(amount||0):0}
function nonTaxableBaseFromAmount(amount,category){return category&&!isVatableCategory(category)?Number(amount||0):0}
function transactionAmount(t){return Number(t?.amount||0)||Number(t?.vatable||0)+Number(t?.nonVatable||0)}
function deriveVatTypeFromCategory(category,vat){return Number(vat||0)>0?'VAT-reg':'Non-VAT'}
function vatTypeText(type){return type==='VAT-reg'?'VAT Registered':'Not VAT Registered'}
function inferVatCategory(raw,vat,nonVatable){const direct=normalizeVATCategory(raw?.vatCategory??raw?.vat_category??raw?.vat_category_code??raw?.vatCode??raw?.vat_code??raw?.tax_code);if(direct)return direct;if(Number(vat||0)>0)return 'S';if(Number(nonVatable||0)>0)return 'SNQ';return ''}
function computeAmounts(raw){
  const directAmount=parseMoney(raw.amount??raw.purchase_amount??raw.base_amount??raw.tax_base_amount??raw.vatable??raw.vatableAmount??raw.vatable_amount??raw.nonVatable??raw.nonVat??raw.non_vat??raw.non_vat_amount??raw.non_vatable_amount??raw.net??raw.net_amount);
  const legacyVat=parseMoney(raw.vat??raw.vatAmount??raw.vat_amount);
  const legacyGross=parseMoney(raw.gross??raw.gross_amount);
  const vatCategory=inferVatCategory(raw,legacyVat,parseMoney(raw.nonVatable??raw.nonVat??raw.non_vat??raw.non_vat_amount??raw.non_vatable_amount));
  let amount=directAmount;
  if(amount===0&&legacyGross>0&&legacyVat>0) amount=legacyGross-legacyVat;
  const vatable=taxableBaseFromAmount(amount,vatCategory);
  const nonVatable=nonTaxableBaseFromAmount(amount,vatCategory);
  const vat=computeVATFromCategory(vatable,vatCategory);
  // Total Amount is always Amount + VAT, for both imported and manual transactions.
  // (EWT is computed/displayed separately and never reduces the Total.)
  const total=amount+vat;
  return{amount,vatable,nonVatable,vat,total,vatCategory}
}
function normalizeTIN(value){return String(value??'').replace(/[^0-9]/g,'')}
function formatTIN(value){const d=normalizeTIN(value);if(d.length===12)return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6,9)}-${d.slice(9)}`;return String(value??'').trim()}
function personName(s){return [s.firstName,s.middleName,s.lastName].filter(Boolean).join(' ').trim()}
function supplierDisplayName(s){return String(s?.registeredName||'').trim()||personName(s)||''}
function normalizeSupplier(row){return{_id:row?._id||makeId('sup'),tin:formatTIN(row?.tin||row?.supplier_tin||row?.tin_no||row?.tax_identification_number),registeredName:String(row?.registeredName??row?.registered_name??row?.corporation_name??row?.registered_corporation_name??row?.company_name??row?.supplier_name??'').trim(),lastName:String(row?.lastName??row?.last_name??row?.registered_last_name??'').trim(),firstName:String(row?.firstName??row?.first_name??row?.registered_first_name??'').trim(),middleName:String(row?.middleName??row?.middle_name??row?.registered_middle_name??'').trim(),address:String(row?.address??row?.registeredAddress??row?.registered_address??row?.street_address??'').trim(),city:String(row?.city??row?.registered_city??'').trim(),zip:String(row?.zip??row?.zip_code??row?.registered_zip_code??row?.postal_code??'').trim()}}
function findSupplierByTIN(tin){const needle=normalizeTIN(tin);if(!needle)return null;return supplierMaster.map(normalizeSupplier).find(s=>normalizeTIN(s.tin)===needle)||null}
function applySupplierToTransaction(tx,s){if(!s)return tx;return normalizeTransaction({...tx,tin:s.tin,supplier:supplierDisplayName(s),registeredName:s.registeredName,lastName:s.lastName,firstName:s.firstName,middleName:s.middleName,address:s.address,city:s.city,zip:s.zip})}
// Stable per-transaction import sequence. It is preserved when already present on a
// record (so it survives localStorage saves and cloud sync/pull, which do not return
// rows in a guaranteed order) and only assigned — monotonically increasing so new
// lines append to the end — when a record has never carried one. This is what keeps
// a CV popup opening its lines in the same order every time, on every device.
let txnSeqCounter=0;
function nextTransactionSeq(t){
  const raw=Number(t?._seq??t?.seq??t?.line_no??t?.line_number??t?.import_seq??t?.sequence);
  if(Number.isFinite(raw)){if(raw>txnSeqCounter)txnSeqCounter=raw;return raw;}
  return ++txnSeqCounter;
}
function normalizeTransaction(t){const manualStatus=parseVerification(t?.manualStatus??t?.status??t?.compliance??t?.verification??t?.document_status);const exempt=(manualStatus==='journal'||manualStatus==='adjusting');let a=computeAmounts(t||{});if(exempt)a={...a,vatCategory:'',vatable:0,nonVatable:0,vat:0,total:a.amount};const _seq=nextTransactionSeq(t);const supplier=String(t?.supplier??t?.registeredName??t?.registered_name??t?.supplierName??t?.supplier_name??'').trim();const voucherName=String(t?.voucherName??t?.voucher_name??t?.voucher??t?.voucher_payee??t?.payee??t?.book_payee??t?.booked_payee??supplier??'').trim();const atcCode=exempt?'':normalizeATC(t?.atcCode??t?.atc_code??t?.atc??t?.withholding_atc??t?.ewt_rate??t?.ewt);const ewtAmount=exempt?0:expectedEwtAmount({amount:a.amount,atcCode});return{_id:t?._id||makeId('tx'),_seq,voucherName:voucherName||supplier||'(No Voucher Name)',supplier,tin:formatTIN(t?.tin||t?.supplier_tin||''),cv:String(t?.cv||t?.cv_no||t?.cv_number||'').trim(),inv:String(t?.inv||t?.invoice_no||t?.invoice||t?.or_no||'').trim(),date:String(t?.date||t?.payment_date||t?.document_date||'').trim()||'--',description:String(t?.description||t?.desc||t?.nature||t?.particulars||'').trim(),...a,vatReg:deriveVatTypeFromCategory(a.vatCategory,a.vat),ewtAmount,atcCode,manualStatus,reviewNote:String(t?.reviewNote??t?.review_note??t?.note??'').trim(),lastReviewed:String(t?.lastReviewed??t?.last_reviewed??'').trim(),accountingTitle:String(t?.accountingTitle??t?.accounting_title??t?.accounting_titles??t?.account_title??t?.accounting??'').trim(),bankAccount:String(t?.bankAccount??t?.bank_account??t?.bank??t?.cash_bank_account??'').trim(),registeredName:String(t?.registeredName??t?.registered_name??'').trim(),lastName:String(t?.lastName??t?.last_name??t?.registered_last_name??'').trim(),firstName:String(t?.firstName??t?.first_name??t?.registered_first_name??'').trim(),middleName:String(t?.middleName??t?.middle_name??t?.registered_middle_name??'').trim(),address:String(t?.address??t?.registeredAddress??t?.registered_address??'').trim(),city:String(t?.city??t?.registered_city??'').trim(),zip:String(t?.zip??t?.zip_code??t?.registered_zip_code??'').trim(),supplierManualOverride:Boolean(t?.supplierManualOverride||t?.supplier_manual_override)}}
function normalizeLedger(row,type){return{_id:row?._id||makeId(type==='vat'?'vat':'ewt'),cv:String(row?.cv||row?.cv_no||row?.cv_number||'').trim(),supplier:String(row?.supplier||row?.supplier_name||row?.payee||row?.voucherName||row?.voucher_name||'').trim(),date:String(row?.date||row?.transaction_date||'').trim()||'--',description:String(row?.description??row?.desc??row?.memo??row?.particulars??row?.nature??'').trim(),amount:parseMoney(row?.amount??row?.balance??row?.ending_balance??(type==='vat'?row?.vat_amount??row?.input_vat:row?.ewt_amount??row?.withholding_tax)),account:String(row?.account||row?.ledger_account||'').trim(),ref:String(row?.ref||row?.reference||row?.gl_ref||'').trim(),type}}
// Invoice document METADATA. The files themselves live in Supabase Storage (private
// bucket); each record links a stored file to its transaction by the transaction's
// persistent _id (txnId), never by CV/invoice number. Explicit literal like every
// other normalizer so records keep an exact, stable shape through cloud round-trips.
function normalizeInvoiceDocument(d){return{_id:d?._id||makeId('doc'),txnId:String(d?.txnId||'').trim(),originalName:String(d?.originalName||'').trim(),ext:String(d?.ext||'').trim().toLowerCase(),mimeType:String(d?.mimeType||'').trim(),fileSize:Number(d?.fileSize||0),storagePath:String(d?.storagePath||'').trim(),uploadedAt:String(d?.uploadedAt||'').trim(),uploadedBy:String(d?.uploadedBy||'').trim(),uploadedByName:String(d?.uploadedByName||'').trim()}}
let VAT_CATEGORIES=loadArray(VAT_CATEGORIES_KEY,demoVatCategories).map(normalizeVatCategoryMaster);
let atcMaster=loadArray(ATC_MASTER_KEY,demoAtcMaster).map(normalizeAtcMaster);
let supplierMaster=loadArray(SUPPLIER_MASTER_KEY,demoSupplierMaster).map(normalizeSupplier);
let transactions=loadArray(TX_KEY,demoTransactions).map(normalizeTransaction);
let vatLedger=loadArray(VAT_LEDGER_KEY,demoVatLedger).map(r=>normalizeLedger(r,'vat'));
let ewtLedger=loadArray(EWT_LEDGER_KEY,demoEwtLedger).map(r=>normalizeLedger(r,'ewt'));
let invoiceDocuments=loadArray(INVOICE_DOCS_KEY,[]).map(normalizeInvoiceDocument);
function monthInfo(month,year){const m=Math.max(1,Math.min(12,Number(month)||1));const mm=String(m).padStart(2,'0');const yr=String(year||'').trim();return{key:yr?`${yr}-${mm}`:`m${mm}`,label:`${MONTH_NAMES[m-1][0]}${yr?' '+yr:''}`,order:yr?Number(yr)*100+m:m}}
function monthInfoFromDate(value){const raw=String(value??'').trim();if(!raw||raw==='--'||raw==='-'||raw.toLowerCase()==='n/a')return{key:'undated',label:'Undated',order:999999};let m=raw.match(/^\s*(\d{4})[-\/.](\d{1,2})(?:[-\/.](\d{1,2}))?/);if(m)return monthInfo(Number(m[2]),m[1]);m=raw.match(/^\s*(\d{1,2})[-\/.](\d{1,2})(?:[-\/.](\d{2,4}))?/);if(m){const first=Number(m[1]),second=Number(m[2]);const month=first>12?second:first;let yr=m[3]||'';if(yr&&yr.length===2)yr='20'+yr;return monthInfo(month,yr)}const lower=raw.toLowerCase();const y=(raw.match(/\b(19\d{2}|20\d{2})\b/)||[])[1]||'';for(let i=0;i<MONTH_NAMES.length;i++){if(MONTH_NAMES[i].some(alias=>new RegExp(`\\b${alias}\\b`).test(lower)))return monthInfo(i+1,y)}const parsed=new Date(raw);if(!Number.isNaN(parsed.getTime()))return monthInfo(parsed.getMonth()+1,String(parsed.getFullYear()));return{key:'undated',label:'Undated',order:999999}}
function recordMonthKey(row){return monthInfoFromDate(row?.date).key}
function yearOfKey(key){return /^(\d{4})-\d{2}$/.test(String(key))?String(key).slice(0,4):''}
// Scope = selected month (a specific YYYY-MM) OR, when no single month is picked,
// the whole selected fiscal year OR all years. Years never mix unless "All Years".
function recordMatchesActiveMonth(row){
  const key=recordMonthKey(row);
  if(activeMonth!=='all')return key===activeMonth;
  if(activeYear!=='all')return yearOfKey(key)===activeYear;
  return true;
}
// PERF: visibleTransactionsForMonth / *LedgerForMonth are called many times per
// render (buildCVGroups alone runs on several tabs, and renderWorking calls the set
// three times). Each call re-normalizes the whole array — which is deliberate, so
// VAT/EWT stay in sync with the current master rates — but it only needs to happen
// ONCE per render, not 10+ times. We memo the normalized+filtered result, keyed by a
// data version that is bumped whenever data is saved (saveAll) or a fresh render
// pass starts (renderAll), plus the active year/month scope. Every render therefore
// still recomputes fresh against live master data; it just stops repeating the work
// within a single pass. The normalization logic itself is unchanged.
let dataVersion=0;
function invalidateVisibleCache(){dataVersion++;}
let _visCache={ver:-1,scope:'',tx:null,vat:null,ewt:null};
function _ensureVisCache(){
  const scope=activeYear+'|'+activeMonth;
  if(_visCache.ver!==dataVersion||_visCache.scope!==scope)_visCache={ver:dataVersion,scope,tx:null,vat:null,ewt:null};
  return _visCache;
}
function visibleTransactionsForMonth(){const c=_ensureVisCache();if(!c.tx)c.tx=transactions.map(normalizeTransaction).filter(recordMatchesActiveMonth);return c.tx}
function visibleVatLedgerForMonth(){const c=_ensureVisCache();if(!c.vat)c.vat=vatLedger.map(r=>normalizeLedger(r,'vat')).filter(recordMatchesActiveMonth);return c.vat}
function visibleEwtLedgerForMonth(){const c=_ensureVisCache();if(!c.ewt)c.ewt=ewtLedger.map(r=>normalizeLedger(r,'ewt')).filter(recordMatchesActiveMonth);return c.ewt}
function buildMonthBuckets(){const map=new Map();const add=row=>{const info=monthInfoFromDate(row?.date);if(!map.has(info.key))map.set(info.key,info)};transactions.forEach(add);vatLedger.forEach(add);ewtLedger.forEach(add);return[...map.values()].sort((a,b)=>a.order-b.order||a.label.localeCompare(b.label))}
function monthCount(key){if(key==='all')return transactions.length;return transactions.filter(t=>recordMonthKey(t)===key).length}
function yearCount(year){if(year==='all')return transactions.length;return transactions.filter(t=>yearOfKey(recordMonthKey(t))===year).length}
// Distinct fiscal years present in the data (plus an "undated" bucket if needed).
function buildYearBuckets(){
  const map=new Map();
  buildMonthBuckets().forEach(m=>{const yr=yearOfKey(m.key)||'undated';if(!map.has(yr))map.set(yr,{year:yr,order:yr==='undated'?999999:Number(yr)})});
  return [...map.values()].sort((a,b)=>a.order-b.order);
}
function monthsForActiveYear(){const months=buildMonthBuckets();return activeYear==='all'?months:months.filter(m=>(yearOfKey(m.key)||'undated')===activeYear)}
function setYear(year){activeYear=year;activeMonth='all';focusedCV=null;activeSummaryReview=null;openSummary.clear();openCVs.clear();document.getElementById('importPanel')?.classList.remove('visible');document.getElementById('addPanel')?.classList.remove('visible');closeSummaryReviewModal(true);renderAll()}
function setMonth(key){if(key!=='all'){const ym=yearOfKey(key);if(ym)activeYear=ym}activeMonth=key;focusedCV=null;activeSummaryReview=null;openSummary.clear();openCVs.clear();document.getElementById('importPanel')?.classList.remove('visible');document.getElementById('addPanel')?.classList.remove('visible');closeSummaryReviewModal(true);if(typeof closePeriodPicker==='function')closePeriodPicker();renderAll()}
// Calendar period selector (single calendar icon beside the page title, opening a
// compact year/month picker). Replaces the old row of month tabs. Months that
// have records are shown in an active colour; months without records are muted;
// the selected month is highlighted. Works for every time-based module because
// it drives the same activeYear/activeMonth scope used across the dashboard.
function togglePeriodPicker(event){
  if(event)event.stopPropagation();
  const sel=document.getElementById('periodSelector');if(!sel)return;
  const open=sel.classList.toggle('open');
  const btn=document.getElementById('periodBtn');if(btn)btn.setAttribute('aria-expanded',open?'true':'false');
}
function closePeriodPicker(){
  const sel=document.getElementById('periodSelector');if(!sel)return;
  sel.classList.remove('open');
  const btn=document.getElementById('periodBtn');if(btn)btn.setAttribute('aria-expanded','false');
}
document.addEventListener('click',event=>{const sel=document.getElementById('periodSelector');if(sel&&!sel.contains(event.target))closePeriodPicker()});
function renderMonthTabs(){
  // The old #monthTabs strip is retired; keep the element hidden for compatibility.
  const legacy=document.getElementById('monthTabs');if(legacy){legacy.innerHTML='';legacy.style.display='none'}
  const sel=document.getElementById('periodSelector');if(!sel)return;
  // Master Data and Audit are not date-scoped: hide the period selector there.
  if(activeTab==='masters'){sel.style.display='none';closePeriodPicker();return}
  sel.style.display='';
  const years=buildYearBuckets();
  if(!new Set(['all',...years.map(y=>y.year)]).has(activeYear))activeYear='all';
  // Keep the selected month consistent with the selected year.
  if(activeMonth!=='all'){const ym=yearOfKey(activeMonth);if(ym&&activeYear!=='all'&&ym!==activeYear)activeMonth='all'}
  // Year chips (All Years + each fiscal year present + Undated if any).
  const yearsEl=document.getElementById('periodYears');
  if(yearsEl){
    let yearHtml=`<button class="period-year ${activeYear==='all'?'active':''}" type="button" onclick="setYear('all')">All Years <span>${transactions.length}</span></button>`;
    years.forEach(y=>{yearHtml+=`<button class="period-year ${activeYear===y.year?'active':''}" type="button" onclick="setYear('${attr(y.year)}')">${esc(y.year==='undated'?'Undated':y.year)} <span>${yearCount(y.year)}</span></button>`});
    yearsEl.innerHTML=yearHtml;
  }
  // Month grid for the selected year. When a specific calendar year is active we
  // show all 12 months Jan–Dec so empty months are clearly visible (muted);
  // otherwise we list the distinct month buckets that actually exist.
  const headEl=document.getElementById('periodMonthsHead');
  const monthsEl=document.getElementById('periodMonths');
  if(monthsEl){
    let monthHtml='';
    const isCalendarYear=/^\d{4}$/.test(activeYear);
    if(isCalendarYear){
      if(headEl)headEl.textContent=`Months in ${activeYear}`;
      monthHtml+=`<button class="period-month full ${activeMonth==='all'?'selected':''}" type="button" onclick="setMonth('all')">Full Year<span>${yearCount(activeYear)}</span></button>`;
      for(let m=1;m<=12;m++){
        const key=`${activeYear}-${String(m).padStart(2,'0')}`;
        const count=monthCount(key);
        const cls=['period-month'];
        if(count>0)cls.push('has');else cls.push('none');
        if(activeMonth===key)cls.push('selected');
        monthHtml+=`<button class="${cls.join(' ')}" type="button" onclick="setMonth('${attr(key)}')">${esc(MONTH_NAMES[m-1][0])}<span>${count}</span></button>`;
      }
    }else{
      if(headEl)headEl.textContent=activeYear==='all'?'All months':'Undated';
      const months=monthsForActiveYear();
      const firstLabel=activeYear==='all'?`All Months<span>${transactions.length}</span>`:`All Undated<span>${yearCount(activeYear)}</span>`;
      monthHtml+=`<button class="period-month full ${activeMonth==='all'?'selected':''}" type="button" onclick="setMonth('all')">${firstLabel}</button>`;
      months.forEach(m=>{const count=monthCount(m.key);monthHtml+=`<button class="period-month ${count>0?'has':'none'} ${activeMonth===m.key?'selected':''}" type="button" onclick="setMonth('${attr(m.key)}')">${esc(m.label)}<span>${count}</span></button>`});
    }
    monthsEl.innerHTML=monthHtml;
  }
  // Trigger button label reflects the current scope.
  const labelEl=document.getElementById('periodLabel');if(labelEl)labelEl.textContent=activeMonthLabel();
}
function badge(type,label){return `<span class="badge badge-${type}">${esc(label)}</span>`}
function vatBadge(type){return type==='VAT-reg'?badge('ok','VAT Registered'):badge('na','Not VAT Registered')}
function statusBadge(status){if(status==='ok')return badge('ok','Compliant');if(status==='warn')return badge('warn','Without Invoice');if(status==='err')return badge('err','Non-Compliant');if(status==='journal')return badge('journal','Journal Entry');if(status==='adjusting')return badge('adjusting','Adjusting Entry');return badge('review','Unreviewed')}
function isBalanced(n){return Math.abs(Number(n||0))<=BALANCE_ALLOWANCE}
function amountClass(n){return isBalanced(n)?'variance-good':'variance-bad'}
function varianceBadge(n){const value=Number(n||0);return `<span class="${amountClass(value)}">${peso(value)}</span>`}
function compactList(values,empty='--'){const seen=[];values.forEach(v=>{const s=String(v??'').trim();if(s&&!seen.includes(s))seen.push(s)});if(!seen.length)return empty;if(seen.length===1)return seen[0];return `Mixed (${seen.length})`}
function groupStatus(txns){const total=txns.length||1;const ok=txns.filter(t=>t.manualStatus==='ok').length;const warn=txns.filter(t=>t.manualStatus==='warn').length;const err=txns.filter(t=>t.manualStatus==='err').length;const unreviewed=txns.filter(t=>t.manualStatus==='unreviewed').length;const journal=txns.filter(t=>t.manualStatus==='journal').length;const adjusting=txns.filter(t=>t.manualStatus==='adjusting').length;const okPct=Math.round(ok/total*100);const warnPct=Math.round(warn/total*100);const errPct=Math.round(err/total*100);const journalPct=Math.round(journal/total*100);const adjustingPct=Math.round(adjusting/total*100);const reviewPct=Math.max(0,100-okPct-warnPct-errPct-journalPct-adjustingPct);let status='ok';if(err>0)status='err';else if(warn>0)status='warn';else if(unreviewed>0)status='unreviewed';else if(ok>0)status='ok';else if(journal>0)status='journal';else if(adjusting>0)status='adjusting';return{ok,warn,err,unreviewed,journal,adjusting,okPct,warnPct,errPct,journalPct,adjustingPct,reviewPct,status}}
function scoreBar(st){return `<div class="bar-wrap"><div class="bar-ok" style="width:${st.okPct}%"></div><div class="bar-warn" style="width:${st.warnPct}%"></div><div class="bar-err" style="width:${st.errPct}%"></div><div class="bar-journal" style="width:${st.journalPct||0}%"></div><div class="bar-adjusting" style="width:${st.adjustingPct||0}%"></div><div class="bar-review" style="width:${st.reviewPct}%"></div></div><div class="pct-row"><span class="pct-ok">${st.ok}</span><span class="pct-warn">${st.warn}</span><span class="pct-err">${st.err}</span><span class="pct-journal">${st.journal||0}</span><span class="pct-adjusting">${st.adjusting||0}</span><span class="pct-review">${st.unreviewed}</span></div>`}
function sumTxns(txns){return txns.reduce((a,t)=>{a.amount+=transactionAmount(t);a.vatable+=t.vatable;a.nonVatable+=t.nonVatable;a.vat+=t.vat;a.total+=t.total;a.ewtAmount+=t.ewtAmount;return a},{amount:0,vatable:0,nonVatable:0,vat:0,total:0,ewtAmount:0})}
function switchTab(tab){activeTab=tab;if(tab!=='working')focusedCV=null;if(tab!=='summary')activeSummaryReview=null;['summary','working','vat','ewt','bir','masters'].forEach(name=>{const sheetId=name==='working'?'workingSheet':name==='masters'?'mastersSheet':name==='bir'?'birSheet':name+'Sheet';const btnId=name==='working'?'tabWorkingBtn':name==='summary'?'tabSummaryBtn':name==='vat'?'tabVatBtn':name==='ewt'?'tabEwtBtn':name==='bir'?'tabBirBtn':'tabMastersBtn';document.getElementById(sheetId)?.classList.toggle('active',tab===name);document.getElementById(btnId)?.classList.toggle('active',tab===name)});document.getElementById('importPanel').classList.remove('visible');document.getElementById('addPanel').classList.remove('visible');if(tab!=='summary')closeSummaryReviewModal(true);updateActionButtons();renderAll()}
function switchMasterSub(sub){activeMasterSub=sub;['vatCategories','atcRates','suppliers'].forEach(name=>{const paneId=name==='vatCategories'?'vatCategoriesPane':name==='atcRates'?'atcRatesPane':'suppliersPane';const btnId=name==='vatCategories'?'masterVatCategoriesBtn':name==='atcRates'?'masterAtcRatesBtn':'masterSuppliersBtn';document.getElementById(paneId)?.classList.toggle('active',sub===name);document.getElementById(btnId)?.classList.toggle('active',sub===name)});updateActionButtons();renderAll()}
function updateActionButtons(){const canImport=['working','vat','ewt','masters'].includes(activeTab);document.getElementById('importBtn').style.display=canImport?'inline-flex':'none';document.getElementById('addBtn').style.display=activeTab==='working'?'inline-flex':'none';let label='Export Summary';if(activeTab==='working')label='Export Purchases';else if(activeTab==='vat')label='Export VAT Balances';else if(activeTab==='ewt')label='Export EWT Balances';else if(activeTab==='bir')label='Export BIR Index';else if(activeTab==='masters')label=activeMasterSub==='vatCategories'?'Export VAT Categories':activeMasterSub==='atcRates'?'Export ATC Master':'Export Supplier Master';document.getElementById('exportBtn').textContent=label}
function toggleImport(){if(activeTab==='summary')switchTab('working');document.getElementById('importPanel').classList.toggle('visible');document.getElementById('addPanel').classList.remove('visible');let type='book';if(activeTab==='vat')type='vatLedger';else if(activeTab==='ewt')type='ewtLedger';else if(activeTab==='masters')type=activeMasterSub==='vatCategories'?'vatCategoryMaster':activeMasterSub==='atcRates'?'atcMaster':'supplierMaster';document.getElementById('importType').value=type;updateImportHelp()}
function toggleAdd(){if(activeTab!=='working')switchTab('working');document.getElementById('addPanel').classList.toggle('visible');document.getElementById('importPanel').classList.remove('visible')}
function activeMonthLabel(){if(activeMonth==='all')return activeYear==='all'?'All Months':`Full Year ${activeYear==='undated'?'Undated':activeYear}`;const found=buildMonthBuckets().find(m=>m.key===activeMonth);return found?found.label:activeMonth}
function clearLedgerUpload(type){
  const isVat=type==='vat';
  const label=isVat?'VAT Balances':'EWT Balances';
  if(activeMonth==='all'){showToast('Select a specific month before removing '+label+'. All-month deletion is disabled.');return}
  const rows=isVat?vatLedger:ewtLedger;
  const toRemove=rows.filter(r=>recordMonthKey(r)===activeMonth);
  if(!toRemove.length){showToast(label+' has no uploaded rows for '+activeMonthLabel()+'.');return}
  const ok=confirm('Remove '+toRemove.length+' '+label+' row(s) for '+activeMonthLabel()+' only? Other months will remain.');
  if(!ok)return;
  if(isVat){vatLedger=vatLedger.filter(r=>recordMonthKey(r)!==activeMonth);document.getElementById('vatSearch').value='';document.getElementById('vatBalanceFilter').value=''}
  else{ewtLedger=ewtLedger.filter(r=>recordMonthKey(r)!==activeMonth);document.getElementById('ewtSearch').value='';document.getElementById('ewtBalanceFilter').value=''}
  saveAll();
  renderAll();
  showToast(label+' for '+activeMonthLabel()+' removed.');
}

function updateTaxPreview(prefix){const amount=readMoney(prefix+'_amount')||readMoney(prefix+'_vatable');const cat=normalizeVATCategory(getValue(prefix+'_vat_category'));const vatable=taxableBaseFromAmount(amount,cat);const nonVatable=nonTaxableBaseFromAmount(amount,cat);const vat=computeVATFromCategory(vatable,cat);setValue(prefix+'_vat',money(vat));setValue(prefix+'_vat_type',vatTypeText(deriveVatTypeFromCategory(cat,vat)));const atcCode=normalizeATC(getValue(prefix+'_atc_code'));setValue(prefix+'_ewt_amount',money(expectedEwtAmount({amount,atcCode}))) }
function updateVatTypePreview(prefix){updateTaxPreview(prefix)}
function updateImportHelp(){const type=document.getElementById('importType').value;let text='';if(type==='book')text='Purchase transaction import required columns per purchase line: voucher_name, cv_no, date, accounting_title, and bank_account. Date must be MM/DD/YYYY, for example 04/05/2026. One CV may contain multiple purchase lines with different Accounting Titles and Bank Accounts. Recommended: description, amount, total_amount, vat_category, atc_code, invoice_no, compliance, review_note.';else if(type==='vatLedger')text='VAT Balances import recommended columns: cv_no, voucher_name or supplier_name, date, description, vat_amount, ledger_account. Duplicate detection uses CV Number, Date, Voucher Name, Description and Amount, so lines with the same CV and amount but a different description are still uploaded.';else if(type==='ewtLedger')text='EWT Balances import recommended columns: cv_no, voucher_name or supplier_name, date, description, ewt_amount, ledger_account. Duplicate detection uses CV Number, Date, Voucher Name, Description and Amount, so lines with the same CV and amount but a different description are still uploaded.';else if(type==='vatCategoryMaster')text='VAT Categories import required columns: vat_category and rate. Recommended: description, vat_type. Example: S, Vatable services, VAT Registered, 12.';else if(type==='atcMaster')text='ATC Master import required columns: atc_code and rate. Recommended: description and source. Example: WC 160, 2, Service payment, 2307 reference table.';else text='Supplier Master import required column: tin. Recommended: registered_name, registered_last_name, registered_first_name, registered_middle_name, registered_address, city, zip_code.';document.getElementById('importHelp').textContent=text}
let addSupplierLookupTimer=null;
function applySupplierFields(prefix,s){if(!s)return;setValue(prefix+'_tin',s.tin);setValue(prefix+'_supplier',supplierDisplayName(s));if(document.getElementById(prefix+'_last'))setValue(prefix+'_last',s.lastName);if(document.getElementById(prefix+'_first'))setValue(prefix+'_first',s.firstName);if(document.getElementById(prefix+'_middle'))setValue(prefix+'_middle',s.middleName);if(document.getElementById(prefix+'_address'))setValue(prefix+'_address',s.address);if(document.getElementById(prefix+'_city'))setValue(prefix+'_city',s.city);if(document.getElementById(prefix+'_zip'))setValue(prefix+'_zip',s.zip)}
function autoLookupSupplierForAdd(silent=true){const rawTin=getValue('f_tin');const digits=normalizeTIN(rawTin);if(!digits)return false;const s=findSupplierByTIN(rawTin);if(!s){if(!silent)showToast('No supplier found for this TIN in Supplier Master. Add it in Master Data → Supplier Master first.');return false}applySupplierFields('f',s);if(!silent)showToast('Supplier details auto-filled from Supplier Master.');return true}
function queueSupplierLookupForAdd(){clearTimeout(addSupplierLookupTimer);addSupplierLookupTimer=setTimeout(()=>{if(normalizeTIN(getValue('f_tin')).length>=9)autoLookupSupplierForAdd(true)},350)}
function addTransaction(){
  const voucherName=getValue('f_voucher'), cv=getValue('f_cv');
  if(!voucherName||!cv){showToast('Please fill in Voucher name and CV no.');return}
  const date=requireMMDDYYYY(getValue('f_date'),'Manual transaction date');
  if(!date)return;
  const amount=readMoney('f_amount');
  const vatCategory=normalizeVATCategory(getValue('f_vat_category'));
  const atcCode=normalizeATC(getValue('f_atc_code'));
  if(getValue('f_atc_code')&&!atcCode){showToast('ATC Code must use the format WC 160 or WI 160.');return}
  if(!isAtcAllowedForVatCategory(atcCode,vatCategory)){showToast(atcVatConflictMessage(atcCode,vatCategory));return}
  const vatable=taxableBaseFromAmount(amount,vatCategory);
  const nonVatable=nonTaxableBaseFromAmount(amount,vatCategory);
  const vat=vatCategory?computeVATFromCategory(vatable,vatCategory):0;
  const total=amount+vat; // Total, VAT, EWT and Verification are computed/handled on the transaction line.
  const inv=getValue('f_inv'), tin=getValue('f_tin');
  // Supplier details come from Master Data via the TIN, not from this form.
  const master=tin?findSupplierByTIN(tin):null;
  if(tin&&!master)showToast('No supplier found for this TIN in Supplier Master. You can add the supplier master record later.');
  const base=normalizeTransaction({_id:makeId('tx'),voucherName,supplier:master?supplierDisplayName(master):'',tin,cv,inv,date,description:getValue('f_desc'),accountingTitle:getValue('f_accounting_title'),bankAccount:getValue('f_bank_account'),amount,vatable,nonVatable,vatCategory,total,atcCode,manualStatus:'unreviewed',lastReviewed:new Date().toISOString()});
  const newRow=master?applySupplierToTransaction(base,master):base;
  transactions.push(newRow);
  ['f_voucher','f_tin','f_cv','f_inv','f_date','f_desc','f_accounting_title','f_bank_account','f_amount'].forEach(id=>setValue(id,''));
  setValue('f_vat_category','');setValue('f_atc_code','');
  activeTab='working';
  // Scope the view to the new transaction's fiscal year/month so it is clearly visible,
  // clear filters that could hide it, then focus its CV so the user stays exactly where
  // the new record landed (its CV opens for review) instead of jumping to the top.
  const monthKey=monthInfoFromDate(newRow.date).key;
  if(/^\d{4}-\d{2}$/.test(monthKey)){activeYear=monthKey.slice(0,4);activeMonth=monthKey;}else{activeYear='all';activeMonth='all';}
  if(document.getElementById('workSearch'))document.getElementById('workSearch').value='';
  if(document.getElementById('workStatus'))document.getElementById('workStatus').value='';
  if(document.getElementById('varianceFilter'))document.getElementById('varianceFilter').value='';
  const newCv=newRow.cv||'(No CV Number)';
  openCVs.add(newCv);
  focusedCV=newCv;                       // highlights the CV row and opens it for verification
  document.getElementById('addPanel').classList.remove('visible'); // avoid overlapping the review popup
  saveAll();renderAll();
  // Bring the new CV's row into view as a clear confirmation of where it landed.
  setTimeout(()=>{const row=document.querySelector('#workTbody tr.active-cv');if(row&&row.scrollIntoView)row.scrollIntoView({block:'center',behavior:'smooth'});},60);
  showToast(`Transaction added to CV ${newCv} (${activeMonthLabel()}). Opened for review.`);
}
function addFiveTestTransactions(){
  const baseDate=new Date();
  const samples=[
    {voucherName:'Manual Test Voucher 1',cv:'TEST-CV-001',description:'Office supplies',amount:1000,vatCategory:'G',atcCode:'WC 160',manualStatus:'unreviewed'},
    {voucherName:'Manual Test Voucher 2',cv:'TEST-CV-002',description:'Professional services',amount:2500,vatCategory:'S',atcCode:'WI 160',manualStatus:'unreviewed'},
    {voucherName:'Manual Test Voucher 3',cv:'TEST-CV-003',description:'Non-VAT service',amount:1500,vatCategory:'SNQ',atcCode:'WC 160',manualStatus:'unreviewed'},
    {voucherName:'Petty Cash Voucher Test',cv:'TEST-PCF-001',description:'Petty cash total row',amount:3000,vatCategory:'GNQ',atcCode:'',manualStatus:'unreviewed'},
    {voucherName:'Manual Test Voucher 5',cv:'TEST-CV-005',description:'Capital goods test',amount:5000,vatCategory:'CG',atcCode:'WC 160',manualStatus:'unreviewed'}
  ];
  samples.forEach((s,i)=>{
    const vatable=taxableBaseFromAmount(s.amount,s.vatCategory);
    const nonVatable=nonTaxableBaseFromAmount(s.amount,s.vatCategory);
    const vat=computeVATFromCategory(vatable,s.vatCategory);
    const total=s.amount+vat;
    const date=new Date(baseDate.getFullYear(),baseDate.getMonth(),Math.min(28,i+1));
    const row=normalizeTransaction({_id:makeId('tx'),voucherName:s.voucherName,cv:s.cv,date:date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),description:s.description,amount:s.amount,vatable,nonVatable,vatCategory:s.vatCategory,vat,total,atcCode:s.atcCode,manualStatus:s.manualStatus,lastReviewed:new Date().toISOString()});
    transactions.push(row);openCVs.add(row.cv||'(No CV Number)');
  });
  activeTab='working';activeMonth='all';
  if(document.getElementById('workSearch'))document.getElementById('workSearch').value='';
  if(document.getElementById('workStatus'))document.getElementById('workStatus').value='';
  if(document.getElementById('varianceFilter'))document.getElementById('varianceFilter').value='';
  saveAll();renderAll();
  document.getElementById('addPanel').classList.remove('visible');
  showToast('5 test purchase transactions added and shown under All Months.');
}
function parseCSV(text){const rows=[];let row=[],value='',inQuotes=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'){if(inQuotes&&n==='"'){value+='"';i++}else inQuotes=!inQuotes}else if(c===','&&!inQuotes){row.push(value);value=''}else if((c==='\n'||c==='\r')&&!inQuotes){if(c==='\r'&&n==='\n')i++;row.push(value);if(row.some(v=>v.trim()!==''))rows.push(row);row=[];value=''}else value+=c}row.push(value);if(row.some(v=>v.trim()!==''))rows.push(row);return rows}
function headerKey(h){return String(h||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')}
function pick(row,...keys){for(const key of keys){const k=headerKey(key);if(row[k]!==undefined&&row[k]!==null&&String(row[k]).trim()!=='')return row[k]}return ''}
function ensureXLSX(){if(window.XLSX&&XLSX.utils&&XLSX.writeFile)return true;showToast('XLSX engine is not loaded. Please connect to the internet or use a packaged copy of xlsx.full.min.js.');return false}
function preferredSheetName(type,wb){const names=wb.SheetNames||[];const targets={book:['Purchase Transactions','Purchases','Transactions'],vatLedger:['VAT Balances','VAT Ledger'],ewtLedger:['EWT Balances','EWT Ledger'],vatCategoryMaster:['VAT Categories'],atcMaster:['ATC Master'],supplierMaster:['Supplier Master']};const wanted=targets[type]||[];const match=names.find(n=>wanted.some(w=>n.toLowerCase()===w.toLowerCase()))||names[0];return match}
function workbookRows(wb,type){const sheetName=preferredSheetName(type,wb);const ws=wb.Sheets[sheetName];if(!ws)return[];return XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false}).filter(r=>r.some(v=>String(v??'').trim()!==''))}
/* ============================================================================
 * QuickBooks working-paper auto-import.
 * Detects and maps the real QuickBooks reports (Transaction Detail by Account,
 * Tax Detail / VAT Summary Report, Withholding Transaction Report) so users can
 * upload the generated working papers directly without a custom template. The
 * mapped rows are handed to importRows(), which keeps all validation and the
 * record-building logic in one place.
 * ========================================================================== */
function qbCellText(v){return String(v??'').replace(/\s+/g,' ').trim();}
function qbNorm(v){return qbCellText(v).toLowerCase().replace(/\.$/,'');} // normalise header label ("No." -> "no")
function qbTypeLabel(type){return ({book:'Purchase Transactions',vatLedger:'VAT Balances',ewtLedger:'EWT Balances'})[type]||type;}
function qbFindHeaderRow(rows){
  for(let i=0;i<Math.min(rows.length,20);i++){
    const toks=(rows[i]||[]).map(qbNorm);
    if(toks.includes('date')&&toks.includes('name')&&toks.includes('no')) return i;
  }
  return -1;
}
function qbColMap(headerRow){
  const map={};
  (headerRow||[]).forEach((cell,idx)=>{const k=qbNorm(cell);if(k&&map[k]===undefined)map[k]=idx;});
  return map;
}
function qbRecognizeType(colmap,contextText){
  // First trust strong column signals; then fall back to the report title/sheet
  // name so a QuickBooks file is still recognised (and validated) even if a
  // required column was renamed or removed.
  const has=k=>colmap[k]!==undefined;
  if(has('tax name')) return 'vatLedger';
  if(has('account')&&has('split')&&has('debit')&&has('credit')) return has('balance')?'book':'ewtLedger';
  const ctx=String(contextText||'').toLowerCase();
  if(/vat summary report|tax detail report/.test(ctx)) return 'vatLedger';
  if(/transaction detail by account/.test(ctx)) return 'book';
  if(/withholding/.test(ctx)) return 'ewtLedger';
  return null;
}
function qbIsSkippableAccount(account){
  // In "Transaction Detail by Account", the cash funding side and the tax lines
  // are captured by the separate VAT/EWT working papers, not as purchase rows.
  const a=String(account||'').toLowerCase();
  return a.startsWith('cash in bank')||a.includes('vat summary report')||a.includes('withholding tax');
}
function parseQuickBooksWorkbook(wb){
  if(!wb||!wb.SheetNames||!wb.SheetNames.length) return null;
  const ws=wb.Sheets[wb.SheetNames[0]];
  if(!ws) return null;
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});
  const hi=qbFindHeaderRow(rows);
  // Title/sheet context (rows above the header) lets us recognise the report type
  // even when columns are renamed; used for clear validation messages.
  const titleRows=hi>=0?rows.slice(0,hi):rows.slice(0,6);
  const contextText=titleRows.map(r=>(r||[]).map(qbCellText).join(' ')).join(' ')+' '+(wb.SheetNames[0]||'');
  const colmap=hi>=0?qbColMap(rows[hi]):{};
  const type=qbRecognizeType(colmap,contextText);
  if(!type) return null;
  if(hi<0) return {error:true,type,message:`This looks like a QuickBooks ${qbTypeLabel(type)} file, but the column header row (with Date, No., Name…) could not be found. Export the standard QuickBooks report without deleting the header rows.`};
  const idxOf=(...names)=>{for(const n of names){if(colmap[n]!==undefined)return colmap[n];}return undefined;};
  const getv=(r,...names)=>{const i=idxOf(...names);return i===undefined?'':qbCellText((r||[])[i]);};
  // Required QuickBooks columns per report (each entry lists accepted aliases).
  const required={
    book:[['date'],['no'],['name'],['account'],['split'],['debit']],
    vatLedger:[['date'],['no'],['name'],['tax name'],['amount']],
    ewtLedger:[['date'],['no'],['name'],['credit']]
  }[type];
  const missing=required.filter(alts=>!alts.some(a=>colmap[a]!==undefined)).map(alts=>alts[0]);
  if(missing.length) return {error:true,type,message:`This looks like a QuickBooks ${qbTypeLabel(type)} file, but these required columns were not found: ${missing.join(', ')}. Export the standard QuickBooks report without removing or renaming columns.`};
  const data=rows.slice(hi+1);
  let header, built=[];
  if(type==='book'){
    header=['date','cv_no','voucher_name','registered_name','description','accounting_title','bank_account','amount','invoice_no','tin'];
    data.forEach(r=>{
      const date=getv(r,'date'); if(!date) return;            // skip section/total/footer/blank rows
      const account=getv(r,'account'); if(qbIsSkippableAccount(account)) return;
      const amount=parseMoney(getv(r,'debit'))||parseMoney(getv(r,'credit')); if(!amount) return;
      const name=getv(r,'name');
      built.push([date,getv(r,'no'),name,name,getv(r,'memo/description','memo'),account,getv(r,'split'),Math.abs(amount),'','']);
    });
  }else if(type==='vatLedger'){
    header=['cv_no','supplier_name','date','description','vat_amount','ledger_account','reference'];
    data.forEach(r=>{
      const date=getv(r,'date'); if(!date) return;
      if(getv(r,'tax name').toLowerCase()!=='tax (purchases)') return; // input VAT (purchases) only
      const amt=parseMoney(getv(r,'amount')); if(!amt) return;
      built.push([getv(r,'no'),getv(r,'name'),date,getv(r,'memo/description','memo'),Math.abs(amt),'Input VAT',getv(r,'no')]);
    });
  }else{ // ewtLedger
    header=['cv_no','supplier_name','date','description','ewt_amount','ledger_account','reference'];
    data.forEach(r=>{
      const date=getv(r,'date'); if(!date) return;
      const amt=parseMoney(getv(r,'credit'))||parseMoney(getv(r,'debit')); if(!amt) return;
      built.push([getv(r,'no'),getv(r,'name'),date,getv(r,'memo/description','memo'),Math.abs(amt),getv(r,'account')||'Withholding Tax - Expanded',getv(r,'no')]);
    });
  }
  if(!built.length) return {error:true,type,message:`Detected a QuickBooks ${qbTypeLabel(type)} file, but found no ${type==='book'?'expense':type==='vatLedger'?'input VAT (Tax on Purchases)':'withholding'} lines to import.`};
  return {type,syntheticRows:[header,...built],count:built.length};
}
function showQbValidationError(qb){
  const box=document.getElementById('importIssueReport');
  if(box){box.innerHTML=`<strong>QuickBooks import could not continue.</strong><div>${importHtmlEscape(qb.message)}</div>`;box.style.display='block';}
  const panel=document.getElementById('importPanel'); if(panel)panel.classList.add('visible');
  showToast(qb.message);
}
function handleXLSX(e){
  if(!ensureXLSX())return;
  clearImportIssueReport();
  const file=e.target.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    let wb;
    try{wb=XLSX.read(ev.target.result,{type:'array',cellDates:false})}
    catch(err){showToast('Unable to read XLSX file. Please check the workbook format.');return}
    // Auto-detect a QuickBooks working paper first; fall back to the template format.
    let qb=null;
    try{qb=parseQuickBooksWorkbook(wb)}catch(err){qb=null}
    if(qb&&qb.error){showQbValidationError(qb);return;}
    if(qb&&qb.type){
      const sel=document.getElementById('importType'); if(sel){sel.value=qb.type;updateImportHelp();}
      importRows(qb.syntheticRows,qb.type,e.target,file.name||'uploaded file');
      showToast(`Detected QuickBooks ${qbTypeLabel(qb.type)} file — mapped ${qb.count} line(s).`);
      return;
    }
    const type=document.getElementById('importType').value;
    const rows=workbookRows(wb,type);
    importRows(rows,type,e.target,file.name||'uploaded file');
  };
  reader.readAsArrayBuffer(file);
}
function importIssueLabel(type){return({book:'Purchase Transactions',vatLedger:'VAT Balances',ewtLedger:'EWT Balances',vatCategoryMaster:'VAT Categories',atcMaster:'ATC Master',supplierMaster:'Supplier Master'})[type]||'Import'}
function importHtmlEscape(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
function clearImportIssueReport(){const box=document.getElementById('importIssueReport');if(box){box.style.display='none';box.innerHTML=''}window.__lastImportIssues=[]}
function addImportIssue(issues,rowNumber,field,message,row){issues.push({rowNumber,field,message,cv:pick(row||{},'cv_no','cv','cv_number','voucher_no','check_voucher'),voucher:pick(row||{},'voucher_name','voucher','voucher_payee','booked_payee','book_payee','payee','supplier_name','supplier','vendor'),date:pick(row||{},'date','payment_date','document_date','posting_date'),amount:pick(row||{},'amount','total_amount','gross_amount','vat_amount','ewt_amount','balance','ledger_amount'),rawRow:row||{}})}
// Human-readable reasons for the "not uploaded" preview, grouped from per-field issues.
function importErrorReasonFromField(field,message){return message||('Invalid '+field)}
function showImportIssueReport(issues,added,type,fileName){
  window.__lastImportIssues=issues.slice();
  const box=document.getElementById('importIssueReport');
  if(!box)return;
  if(!issues.length){box.style.display='none';box.innerHTML='';return}
  const preview=issues.slice(0,80).map(item=>`<li><strong>Row ${importHtmlEscape(item.rowNumber)}</strong>${item.cv?` · CV <code>${importHtmlEscape(item.cv)}</code>`:''}${item.voucher?` · ${importHtmlEscape(item.voucher)}`:''}: ${importHtmlEscape(item.field)} — ${importHtmlEscape(item.message)}</li>`).join('');
  const more=issues.length>80?`<li>+ ${issues.length-80} more issue(s). Download the issue report for the complete list.</li>`:'';
  box.innerHTML=`<strong>${importHtmlEscape(importIssueLabel(type))} import found ${issues.length} row issue(s).</strong><div>${added} valid row(s) imported. Fix the listed XLSX rows, then upload again if needed.</div><div class="import-report-actions"><button class="btn" type="button" onclick="downloadImportIssueReport()">Download issue report</button></div><ul>${preview}${more}</ul>`;
  box.style.display='block';
}
function downloadImportIssueReport(){
  const issues=window.__lastImportIssues||[];
  if(!issues.length){showToast('No import issues to download.');return}
  const rows=[['Row Number','Field','Problem','CV No.','Voucher / Supplier']];
  issues.forEach(item=>rows.push([item.rowNumber,item.field,item.message,item.cv||'',item.voucher||'']));
  downloadXLSX(rows,'xlsx_import_issue_report.xlsx','Import Issues');
}
function strictRateIssue(value){const raw=String(value??'').trim();if(!raw)return 'missing';return parseRate(raw)===null?'invalid':''}
/* ============================================================================
 * Upload duplicate handling.
 *
 *  - EXACT duplicate  : every relevant business field matches a record that is
 *                       already saved -> skipped (never added twice).
 *  - NEAR duplicate   : looks like an existing record (same CV, date, amount,
 *                       supplier, accounting title) but at least one other
 *                       detail differs -> NOT skipped; added and flagged so the
 *                       user can review. We never delete, overwrite, or silently
 *                       drop a near-duplicate.
 *  - NEW              : neither matches -> added normally.
 *
 * Review metadata (status, notes, _id) is excluded from the fingerprint so
 * re-uploading a row that was already verified is still recognised as a copy.
 * ========================================================================== */
function dupMoney(v){return Math.round((Number(v)||0)*100)/100}
function dupNorm(v){return String(v??'').trim().toLowerCase()}
function importDupFingerprint(type,r){
  if(type==='book')return ['cv',dupNorm(r.cv),'dt',dupNorm(r.date),'vn',dupNorm(r.voucherName),'sp',dupNorm(r.supplier),'tin',dupNorm(r.tin),'inv',dupNorm(r.inv),'ds',dupNorm(r.description),'at',dupNorm(r.accountingTitle),'ba',dupNorm(r.bankAccount),'vc',dupNorm(r.vatCategory),'atc',dupNorm(r.atcCode),'am',dupMoney(transactionAmount(r)),'vt',dupMoney(r.vat),'tt',dupMoney(r.total)].join('|');
  // VAT / EWT ledger rows. Description is included so that lines sharing the same
  // CV Number and Amount but with a DIFFERENT Description are NOT treated as
  // duplicates (a real-world case in the QuickBooks-generated balances).
  return ['cv',dupNorm(r.cv),'dt',dupNorm(r.date),'sp',dupNorm(r.supplier),'ds',dupNorm(r.description),'ac',dupNorm(r.account),'rf',dupNorm(r.ref),'am',dupMoney(r.amount)].join('|');
}
function importDupLooseKey(type,r){
  if(type==='book')return ['cv',dupNorm(r.cv),'dt',dupNorm(r.date),'sp',dupNorm(r.supplier),'at',dupNorm(r.accountingTitle),'am',dupMoney(transactionAmount(r))].join('|');
  // Ledger loose key also includes Description so differing-description lines count
  // as genuinely new (uploaded), not flagged as near-duplicates.
  return ['cv',dupNorm(r.cv),'dt',dupNorm(r.date),'sp',dupNorm(r.supplier),'ds',dupNorm(r.description),'am',dupMoney(r.amount)].join('|');
}
// Match key for backfilling Description onto pre-existing ledger rows WITHOUT
// using Description itself (old records saved before Description existed are blank).
function ledgerBackfillKey(r){return ['cv',dupNorm(r.cv),'dt',dupNorm(r.date),'sp',dupNorm(r.supplier),'am',dupMoney(r.amount)].join('|')}
// Safe migration: fill blank Descriptions on existing VAT/EWT balance rows from a
// re-uploaded file. Adds NO new rows and NEVER overwrites a non-blank Description.
function backfillLedgerDescriptions(type,built){
  const arr=type==='vatLedger'?vatLedger:ewtLedger;
  const ledgerType=type==='vatLedger'?'vat':'ewt';
  // Bucket ALL existing rows by match key, blank-Description rows first so they
  // get filled before a same-key row that already has a Description.
  const buckets=new Map();
  arr.forEach(r=>{const rec=normalizeLedger(r,ledgerType);const k=ledgerBackfillKey(rec);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(r)});
  buckets.forEach(list=>list.sort((a,b)=>(String(a.description||'').trim()?1:0)-(String(b.description||'').trim()?1:0)));
  let filled=0,alreadyHad=0,unmatched=0;
  built.forEach(b=>{
    const desc=String(b.description||'').trim();
    if(!desc)return;
    const list=buckets.get(ledgerBackfillKey(b));
    if(list&&list.length){const target=list.shift();if(String(target.description||'').trim()===''){target.description=desc;filled++}else alreadyHad++}
    else unmatched++;
  });
  return {filled,alreadyHad,unmatched};
}
// Row preview fields shown in the upload summary's "not uploaded" list.
function importPreviewFields(type,rec){
  if(type==='book')return{cv:String(rec.cv||'').trim(),date:String(rec.date||'').trim(),supplier:String(rec.supplier||rec.voucherName||'').trim(),amount:transactionAmount(rec)};
  return{cv:String(rec.cv||'').trim(),date:String(rec.date||'').trim(),supplier:String(rec.supplier||'').trim(),amount:Number(rec.amount||0)};
}
// Classify freshly-built import records against the records already saved.
// Returns kept rows (new + near-duplicates, both added) plus per-row detail
// for the upload preview. `meta[i].row` is the originating XLSX row number.
function classifyImportDuplicates(type,built,existing,meta){
  const exactSet=new Set();
  const looseSet=new Set();
  (existing||[]).forEach(r=>{exactSet.add(importDupFingerprint(type,r));looseSet.add(importDupLooseKey(type,r))});
  const kept=[],nearReview=[],exactList=[],nearList=[];let exactDup=0,nearDup=0;
  built.forEach((r,i)=>{
    const rowNo=(meta&&meta[i]&&meta[i].row)||'';
    const fp=importDupFingerprint(type,r);
    if(exactSet.has(fp)){                                 // perfect copy -> skip
      exactDup++;
      exactList.push(Object.assign({row:rowNo,reason:'Exact duplicate already exists in the database'},importPreviewFields(type,r)));
      return;
    }
    const loose=importDupLooseKey(type,r);
    const isNear=looseSet.has(loose);                    // similar but not identical
    kept.push(r);                                        // never auto-skip a near-duplicate
    exactSet.add(fp);looseSet.add(loose);                // dedupe within the same file too
    if(isNear){nearDup++;nearReview.push(r);nearList.push(Object.assign({row:rowNo,reason:'Near-duplicate of an existing record — added and flagged for review'},importPreviewFields(type,r)))}
  });
  return {kept,nearReview,exactDup,nearDup,exactList,nearList};
}
function uploadSummaryAmount(v){const n=Number(v);return Number.isFinite(n)&&String(v??'').trim()!==''?pesoText(n):String(v||'')}
function uploadPreviewRowsHtml(entries){
  return entries.map(e=>`<tr>
      <td class="mono">${importHtmlEscape(e.row||'—')}</td>
      <td class="mono">${importHtmlEscape(e.cv||'—')}</td>
      <td class="mono">${importHtmlEscape(e.date||'—')}</td>
      <td>${importHtmlEscape(e.supplier||'—')}</td>
      <td class="mono num">${importHtmlEscape(uploadSummaryAmount(e.amount))}</td>
      <td>${importHtmlEscape(e.reason||'—')}</td>
    </tr>`).join('');
}
function showUploadSummary(stats){
  const modal=document.getElementById('uploadSummaryModal');
  const body=document.getElementById('uploadSummaryBody');
  if(!modal||!body)return;
  // Build the "not uploaded" preview: validation errors + exact duplicates skipped.
  const notUploaded=[...(stats.errorList||[]),...(stats.exactList||[])]
    .sort((a,b)=>(Number(a.row)||0)-(Number(b.row)||0));
  const review=stats.nearList||[];
  const previewTable=(title,note,entries)=>!entries.length?'':`
    <div class="upload-preview-block">
      <div class="upload-preview-title">${importHtmlEscape(title)} <span>${entries.length}</span></div>
      ${note?`<div class="upload-preview-note">${importHtmlEscape(note)}</div>`:''}
      <div class="upload-preview-scroll"><table class="upload-preview-table"><thead><tr><th>Row</th><th>CV / Ref</th><th>Date</th><th>Supplier / Payee</th><th>Amount</th><th>Reason not uploaded</th></tr></thead><tbody>${uploadPreviewRowsHtml(entries)}</tbody></table></div>
    </div>`;
  const reviewTable=!review.length?'':`
    <div class="upload-preview-block">
      <div class="upload-preview-title warn">Added — flagged for review <span>${review.length}</span></div>
      <div class="upload-preview-note">These rows were added (never skipped or overwritten) because they look similar to existing records but are not exact copies. Please review them in ${importHtmlEscape(stats.label)}.</div>
      <div class="upload-preview-scroll"><table class="upload-preview-table"><thead><tr><th>Row</th><th>CV / Ref</th><th>Date</th><th>Supplier / Payee</th><th>Amount</th><th>Why flagged</th></tr></thead><tbody>${uploadPreviewRowsHtml(review)}</tbody></table></div>
    </div>`;
  const bf=!!stats.backfillNote;
  body.innerHTML=`
    <div class="upload-summary-grid">
      <div class="upload-stat"><div class="upload-stat-num">${stats.totalRows}</div><div class="upload-stat-label">Total rows in file</div></div>
      <div class="upload-stat ok"><div class="upload-stat-num">${stats.added}</div><div class="upload-stat-label">${bf?'Descriptions filled':'Successfully uploaded'}</div></div>
      <div class="upload-stat muted"><div class="upload-stat-num">${stats.exactDup}</div><div class="upload-stat-label">${bf?'Already had Description':'Skipped (duplicates)'}</div></div>
      <div class="upload-stat warn"><div class="upload-stat-num">${stats.nearDup}</div><div class="upload-stat-label">Requiring review</div></div>
      <div class="upload-stat err"><div class="upload-stat-num">${stats.errors}</div><div class="upload-stat-label">Not uploaded (errors)</div></div>
    </div>
    <div class="upload-summary-meta">${importHtmlEscape(stats.label)}${stats.fileName?' · '+importHtmlEscape(stats.fileName):''}</div>
    ${stats.backfillNote?`<div class="upload-summary-review ok-note">${importHtmlEscape(stats.backfillNote)}</div>`:''}
    ${(!stats.backfillNote&&!notUploaded.length&&!review.length)?'<div class="upload-summary-review ok-note">All rows uploaded successfully. No duplicates, errors, or rows needing review.</div>':''}
    ${previewTable('Not uploaded','These rows were not added. Fix the reason and re-upload if needed.',notUploaded)}
    ${reviewTable}`;
  modal.classList.add('visible');modal.setAttribute('aria-hidden','false');
}
function closeUploadSummary(){const m=document.getElementById('uploadSummaryModal');if(m){m.classList.remove('visible');m.setAttribute('aria-hidden','true')}}
function importRows(rows,type,fileInput,fileName){
  if(rows.length<2){showToast('XLSX must have a header row and data.');return}
  clearImportIssueReport();
  const headers=rows[0].map(headerKey);
  const replace=document.getElementById('replaceOnImport').checked;
  let added=0,skipped=0;
  const built=[];
  const builtMeta=[];   // parallel to built: { row: xlsxRowNumber } for the upload preview
  const issues=[];
  rows.slice(1).forEach((vals,rowOffset)=>{
    const xlsxRowNumber=rowOffset+2;
    const row={};
    headers.forEach((h,i)=>row[h]=String(vals[i]??'').trim());
    if(!Object.values(row).some(v=>String(v??'').trim()!==''))return;
    if(type==='book'){
      const tin=pick(row,'tin','supplier_tin');
      const found=findSupplierByTIN(tin);
      const supplierFromImport=pick(row,'registered_name','registered_supplier','supplier_registered_name','supplier_name','supplier','vendor');
      const supplier=found?supplierDisplayName(found):supplierFromImport;
      const voucherName=pick(row,'voucher_name','voucher','voucher_payee','booked_payee','book_payee','payee')||supplier;
      const cv=pick(row,'cv_no','cv','cv_number','voucher_no','check_voucher');
      const accountingTitle=pick(row,'accounting_title','accounting_titles','account_title','accounting','gl_account','expense_account');
      const bankAccount=pick(row,'bank_account','bank','cash_bank_account','disbursement_bank');
      const rawDate=pick(row,'date','payment_date','document_date');
      const date=normalizeImportDate(rawDate);
      const rawVatCategory=pick(row,'vat_category','vat_category_code','vat_code','tax_code');
      const vatCategory=normalizeVATCategory(rawVatCategory);
      const rawAtcCode=pick(row,'atc_code','atc','withholding_atc','ewt_atc');
      const atcCode=normalizeATC(rawAtcCode);
      let bad=false;
      if(!voucherName){addImportIssue(issues,xlsxRowNumber,'voucher_name','Missing voucher name or supplier name.',row);bad=true}
      if(!cv){addImportIssue(issues,xlsxRowNumber,'cv_no','Missing CV number.',row);bad=true}
      if(!rawDate){addImportIssue(issues,xlsxRowNumber,'date','Missing date. Required format is MM/DD/YYYY, for example 04/05/2026.',row);bad=true}
      else if(!date){addImportIssue(issues,xlsxRowNumber,'date',`Invalid date "${rawDate}". Required format is MM/DD/YYYY, for example 04/05/2026.`,row);bad=true}
      if(!accountingTitle){addImportIssue(issues,xlsxRowNumber,'accounting_title','Missing accounting title.',row);bad=true}
      if(!bankAccount){addImportIssue(issues,xlsxRowNumber,'bank_account','Missing bank account.',row);bad=true}
      if(rawVatCategory&&!vatCategory){addImportIssue(issues,xlsxRowNumber,'vat_category',`Unknown VAT Category "${rawVatCategory}". Add it to VAT Categories master or correct the code.`,row);bad=true}
      if(rawAtcCode&&!atcCode){addImportIssue(issues,xlsxRowNumber,'atc_code',`Invalid ATC Code "${rawAtcCode}". Use a format like WC 160 or WI 160.`,row);bad=true}
      if(bad){skipped++;return}
      const amount=pick(row,'amount','purchase_amount','base_amount','tax_base_amount','vatable_amount','vatable','non_vatable_amount','non_vat_amount');
      const total=pick(row,'total_amount','total','gross_amount','gross');
      built.push(normalizeTransaction({_id:makeId('tx'),voucherName,supplier,tin,cv,inv:pick(row,'invoice_no','invoice','or_no'),date,description:pick(row,'description','particulars','nature'),accountingTitle,bankAccount,amount,vatCategory,total,atcCode,manualStatus:pick(row,'compliance','verification','status'),reviewNote:pick(row,'review_note','note'),lastReviewed:'',address:found?found.address:pick(row,'registered_address','address'),city:found?found.city:pick(row,'city'),zip:found?found.zip:pick(row,'zip_code','zip')}));
      builtMeta.push({row:xlsxRowNumber});
      added++;return;
    }
    if(type==='vatLedger'){
      const cv=pick(row,'cv_no','cv','cv_number');
      const rawAmount=pick(row,'vat_amount','amount','balance','ledger_amount');
      let bad=false;
      if(!cv){addImportIssue(issues,xlsxRowNumber,'cv_no','Missing CV number.',row);bad=true}
      if(!rawAmount){addImportIssue(issues,xlsxRowNumber,'vat_amount','Missing VAT balance amount.',row);bad=true}
      if(bad){skipped++;return}
      // normalizeLedger assigns a stable _id so the row syncs to the central DB
      // (records without _id are never pushed and get wiped on the next refresh).
      built.push(normalizeLedger({cv,supplier:pick(row,'voucher_name','supplier_name','supplier','vendor'),date:pick(row,'date','posting_date'),description:pick(row,'description','memo','particulars','nature','desc'),amount:parseMoney(rawAmount),account:pick(row,'ledger_account','account'),ref:pick(row,'reference','ref')},'vat'));builtMeta.push({row:xlsxRowNumber});added++;return;
    }
    if(type==='ewtLedger'){
      const cv=pick(row,'cv_no','cv','cv_number');
      const rawAmount=pick(row,'ewt_amount','amount','balance','ledger_amount');
      let bad=false;
      if(!cv){addImportIssue(issues,xlsxRowNumber,'cv_no','Missing CV number.',row);bad=true}
      if(!rawAmount){addImportIssue(issues,xlsxRowNumber,'ewt_amount','Missing EWT balance amount.',row);bad=true}
      if(bad){skipped++;return}
      // normalizeLedger assigns a stable _id so the row syncs to the central DB.
      built.push(normalizeLedger({cv,supplier:pick(row,'voucher_name','supplier_name','supplier','vendor'),date:pick(row,'date','posting_date'),description:pick(row,'description','memo','particulars','nature','desc'),amount:parseMoney(rawAmount),account:pick(row,'ledger_account','account'),ref:pick(row,'reference','ref')},'ewt'));builtMeta.push({row:xlsxRowNumber});added++;return;
    }
    if(type==='vatCategoryMaster'){
      const rawCode=pick(row,'vat_category','vat_category_code','code','category');
      const code=normalizeVatCodeRaw(rawCode);
      const rawRate=pick(row,'rate','vat_rate','percentage');
      const rateIssue=strictRateIssue(rawRate);
      let bad=false;
      if(!code){addImportIssue(issues,xlsxRowNumber,'vat_category','Missing VAT Category code.',row);bad=true}
      if(rateIssue){addImportIssue(issues,xlsxRowNumber,'rate',rateIssue==='missing'?'Missing VAT rate.':'Invalid VAT rate. Use 12, 12%, or 0 for non-VAT categories.',row);bad=true}
      if(bad){skipped++;return}
      const rate=parseRate(rawRate);
      built.push(normalizeVatCategoryMaster({code,label:pick(row,'description','label','meaning','desc'),kind:pick(row,'vat_type','type','kind')||(Number(rate||0)>0?'VAT Registered':'Not VAT Registered'),rate}));added++;return;
    }
    if(type==='atcMaster'){
      const rawCode=pick(row,'atc_code','atc');
      const code=normalizeATC(rawCode);
      const rawRate=pick(row,'rate','ewt_rate','percentage');
      const rateIssue=strictRateIssue(rawRate);
      let bad=false;
      if(!rawCode){addImportIssue(issues,xlsxRowNumber,'atc_code','Missing ATC Code.',row);bad=true}
      else if(!code){addImportIssue(issues,xlsxRowNumber,'atc_code',`Invalid ATC Code "${rawCode}". Use a format like WC 160 or WI 160.`,row);bad=true}
      if(rateIssue){addImportIssue(issues,xlsxRowNumber,'rate',rateIssue==='missing'?'Missing EWT rate.':'Invalid EWT rate. Use 2, 2%, or 0.02.',row);bad=true}
      if(bad){skipped++;return}
      built.push(normalizeAtcMaster({atcCode:code,rate:parseRate(rawRate),description:pick(row,'description','desc'),source:pick(row,'source','reference')}));added++;return;
    }
    if(type==='supplierMaster'){
      const tin=pick(row,'tin','supplier_tin');
      if(!tin){addImportIssue(issues,xlsxRowNumber,'tin','Missing supplier TIN.',row);skipped++;return}
      built.push(normalizeSupplier({tin,registeredName:pick(row,'registered_name','corporation_name','supplier_name'),lastName:pick(row,'registered_last_name','last_name'),firstName:pick(row,'registered_first_name','first_name'),middleName:pick(row,'registered_middle_name','middle_name'),address:pick(row,'registered_address','address'),city:pick(row,'city'),zip:pick(row,'zip_code','zip')}));added++;return;
    }
  });
  // Duplicate-aware merge for the transaction-style modules. Exact copies are
  // skipped; near-duplicates are added and flagged for review; masters keep their
  // existing dedupe-by-key behaviour. "Replace" still wipes-then-adds on request.
  // Safe Description backfill mode for VAT/EWT Balances: fill blanks only, add nothing.
  const backfillOnly=(type==='vatLedger'||type==='ewtLedger')&&!!document.getElementById('backfillDescOnly')?.checked;
  if(backfillOnly){
    const res=backfillLedgerDescriptions(type,built);
    saveAll();renderAll();
    if(fileInput)fileInput.value='';
    document.getElementById('importPanel').classList.remove('visible');
    showUploadSummary({totalRows:rows.length-1,added:res.filled,exactDup:res.alreadyHad,nearDup:0,errors:0,errorList:[],exactList:[],nearList:[],label:importIssueLabel(type)+' — Description backfill',fileName,backfillNote:`${res.filled} blank Description(s) filled; ${res.alreadyHad} already had a Description; ${res.unmatched} upload row(s) had no matching existing record. No new rows were added and no existing Description was overwritten.`});
    showToast(`Description backfill: ${res.filled} filled, ${res.alreadyHad} already set, ${res.unmatched} unmatched. No rows added.`);
    return;
  }
  const errors=skipped;        // rows dropped by validation = errors
  let exactDup=0,nearDup=0,newAdded=added,exactList=[],nearList=[];
  if(type==='book'||type==='vatLedger'||type==='ewtLedger'){
    const existingArr = replace ? [] : (type==='book'?transactions.map(normalizeTransaction):(type==='vatLedger'?vatLedger:ewtLedger));
    const cls=classifyImportDuplicates(type,built,existingArr,builtMeta);
    if(type==='book'){if(replace)transactions=[];transactions=transactions.concat(cls.kept)}
    else if(type==='vatLedger'){if(replace)vatLedger=[];vatLedger=vatLedger.concat(cls.kept)}
    else{if(replace)ewtLedger=[];ewtLedger=ewtLedger.concat(cls.kept)}
    exactDup=cls.exactDup;nearDup=cls.nearDup;newAdded=cls.kept.length-cls.nearDup;exactList=cls.exactList;nearList=cls.nearList;
  }
  else if(type==='vatCategoryMaster'){if(replace)VAT_CATEGORIES=[];VAT_CATEGORIES=VAT_CATEGORIES.concat(built);dedupeVatCategories()}
  else if(type==='atcMaster'){if(replace)atcMaster=[];atcMaster=atcMaster.concat(built);dedupeAtcMaster()}
  else{if(replace)supplierMaster=[];supplierMaster=supplierMaster.concat(built);dedupeSupplierMaster()}
  saveAll();renderAll();
  if(issues.length){showImportIssueReport(issues,newAdded+nearDup,type,fileName);document.getElementById('importPanel').classList.add('visible')}
  else{document.getElementById('importPanel').classList.remove('visible')}
  if(fileInput)fileInput.value='';
  if(type==='book'||type==='vatLedger'||type==='ewtLedger'){
    // Aggregate validation failures into one "not uploaded" entry per source row.
    const errMap=new Map();
    issues.forEach(it=>{
      const key=it.rowNumber;
      if(!errMap.has(key))errMap.set(key,{row:it.rowNumber,cv:it.cv||'',date:it.date||'',supplier:it.voucher||'',amount:it.amount||'',reasons:[]});
      errMap.get(key).reasons.push(importErrorReasonFromField(it.field,it.message));
    });
    const errorList=[...errMap.values()].map(e=>({row:e.row,cv:e.cv,date:e.date,supplier:e.supplier,amount:e.amount,reason:e.reasons.join('; ')}));
    showUploadSummary({totalRows:rows.length-1,added:newAdded,exactDup,nearDup,errors:errorList.length,errorList,exactList,nearList,label:importIssueLabel(type),fileName});
    showToast(`Upload complete: ${newAdded} new, ${exactDup} duplicate(s) skipped, ${nearDup} for review${errorList.length?`, ${errorList.length} not uploaded`:''}.`);
  }else{
    showToast(`${added} rows imported${skipped?`; ${skipped} skipped with issue report`:''}.`);
  }
}
function templateSpec(type){if(type==='book')return{name:'purchase_transactions_voucher_template.xlsx',sheet:'Purchase Transactions',rows:[['voucher_name','cv_no','date','description','accounting_title','bank_account','tin','invoice_no','amount','total_amount','vat_category','atc_code','compliance','review_note'],['Sample Voucher','CV-0001','01/05/2026','Office supplies','Office Supplies Expense','BDO Checking 1234','123-456-789-000','SI-0001',10000,11200,'S','WC 160','Compliant','Invoice verified'],['Petty Cash Voucher','CV-PCF-001','01/08/2026','Petty cash taxi reimbursement','Transportation Expense','BPI Petty Cash','','',500,500,'SNQ','WI 160','Without Invoice','Needs supplier verification']]};if(type==='vatLedger')return{name:'vat_balances_template.xlsx',sheet:'VAT Balances',rows:[['cv_no','voucher_name','date','description','vat_amount','ledger_account'],['CV-0001','Sample Voucher','Jan 5','Input VAT on office supplies',1200,'Input VAT']]};if(type==='ewtLedger')return{name:'ewt_balances_template.xlsx',sheet:'EWT Balances',rows:[['cv_no','voucher_name','date','description','ewt_amount','ledger_account'],['CV-0001','Sample Voucher','Jan 5','EWT on professional fee',200,'EWT Payable']]};if(type==='vatCategoryMaster')return{name:'vat_categories_template.xlsx',sheet:'VAT Categories',rows:[['vat_category','description','vat_type','rate'],['S','Vatable services','VAT Registered',12],['SNQ','Non-VAT services','Not VAT Registered',0]]};if(type==='atcMaster')return{name:'atc_master_template.xlsx',sheet:'ATC Master',rows:[['atc_code','rate','description','source'],['WC 160',2,'Sample ATC description','2307 reference table'],['WI 160',2,'Service payment - individual','2307 reference table']]};return{name:'supplier_master_template.xlsx',sheet:'Supplier Master',rows:[['tin','registered_name','registered_last_name','registered_first_name','registered_middle_name','registered_address','city','zip_code'],['123-456-789-000','Supplier A Corporation','','','','100 Ayala Avenue','Makati City','1226'],['456-789-012-000','','Dela Cruz','Juan','Santos','45 Mabini Street','Manila','1000']]}}
function downloadTemplate(){const spec=templateSpec(document.getElementById('importType').value);downloadXLSX(spec.rows,spec.name,spec.sheet)}
function safeSheetName(name){return String(name||'Sheet1').replace(/[\\/?*\[\]:]/g,' ').slice(0,31)||'Sheet1'}
function fitColumns(rows){const header=rows[0]||[];return header.map((_,i)=>({wch:Math.min(34,Math.max(10,...rows.slice(0,200).map(r=>String(r[i]??'').length+2)))}))}
function downloadXLSX(rows,name,sheetName){if(!ensureXLSX())return;const cleanRows=rows.map(r=>r.map(v=>v==null?'':v));const ws=XLSX.utils.aoa_to_sheet(cleanRows);ws['!cols']=fitColumns(cleanRows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,safeSheetName(sheetName));XLSX.writeFile(wb,name)}
function downloadBlob(content,name){const blob=new Blob([content],{type:'application/octet-stream'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function filteredTransactions(prefix){const search=(document.getElementById(prefix+'Search')?.value||'').toLowerCase();const status=prefix==='summary'?activeSummaryStatus:(document.getElementById(prefix+'Status')?.value||'');const vatType=(document.getElementById('summaryVatType')?.value||'');let tx=visibleTransactionsForMonth();if(search){tx=tx.filter(t=>{const searchable=prefix==='summary'?[t.supplier,t.tin,t.address,t.city,t.zip,t.cv,t.inv,t.date,t.description,t.reviewNote]:[t.voucherName,t.supplier,t.tin,t.address,t.city,t.zip,t.cv,t.inv,t.date,t.description,t.reviewNote,t.vatCategory,t.atcCode];return searchable.some(v=>String(v||'').toLowerCase().includes(search));});}if(status)tx=tx.filter(t=>t.manualStatus===status);if(prefix==='summary'&&vatType)tx=tx.filter(t=>(Number(t.vat||0)>0?'VAT-reg':'Non-VAT')===vatType);return tx}
function groupKey(t,mode){const supplier=t.supplier||'(For verification)';const voucher=t.voucherName||'(No Voucher Name)';if(mode==='cv')return t.cv||'(No CV Number)';if(mode==='cv_supplier')return `${t.cv||'(No CV Number)'} | ${supplier}`;if(mode==='supplier')return supplier;if(mode==='voucher_supplier')return `${voucher} | ${supplier}`;return voucher}
function groupSummary(txns,mode){const map=new Map();txns.forEach(t=>{const key=groupKey(t,mode);if(!map.has(key))map.set(key,{key,txns:[]});map.get(key).txns.push(t)});return[...map.values()].map(g=>{g.voucherDisplay=compactList(g.txns.map(t=>t.voucherName),'(No Voucher Name)');g.supplierDisplay=compactList(g.txns.map(t=>t.supplier||'For verification'),'(For verification)');g.tinDisplay=compactList(g.txns.map(t=>t.tin),'--');g.cvDisplay=compactList(g.txns.map(t=>t.cv),'(No CV Number)');g.vatRegDisplay=g.txns.some(t=>Number(t.vat||0)>0)?'VAT-reg':'Non-VAT';return g}).sort((a,b)=>a.key.localeCompare(b.key))}
function summaryLabels(mode){if(mode==='supplier')return{first:'Registered Supplier',second:'TIN / CVs'};if(mode==='cv')return{first:'CV Number',second:'Registered Supplier'};return{first:'Registered Supplier',second:'TIN / CVs'}}
// Column types for the Compliance Summary table: text headers sort alphabetically,
// money/count columns sort numerically, and Status sorts by compliance severity.
const SUMMARY_SORT_TYPES={first:'text',second:'text',vattype:'text',txn:'num',amount:'num',vat:'num',total:'num',ewt:'num',score:'num',status:'status'};
function summarySortType(key){return SUMMARY_SORT_TYPES[key]||'text';}
function summaryFirstLabel(g,mode){return mode==='supplier'?g.supplierDisplay:g.key;}
function summarySortValue(g,key,mode){
  switch(key){
    case 'first':return summaryFirstLabel(g,mode)||'';
    case 'second':return (mode==='supplier'?g.tinDisplay:g.supplierDisplay)||'';
    case 'vattype':return g.vatRegDisplay||'';
    case 'txn':return g.txns.length;
    case 'amount':return sumTxns(g.txns).amount;
    case 'vat':return sumTxns(g.txns).vat;
    case 'total':return sumTxns(g.txns).total;
    case 'ewt':return sumTxns(g.txns).ewtAmount;
    case 'score':return groupStatus(g.txns).okPct;
    case 'status':return statusSortRank(groupStatus(g.txns).status);
    default:return summaryFirstLabel(g,mode)||'';
  }
}
function sortSummaryGroups(groups,mode){
  const key=summarySort?.key||'first';
  const type=summarySortType(key);
  const dir=summarySort?.dir==='desc'?-1:1;
  return [...groups].sort((a,b)=>{
    let cmp=compareTypedValues(summarySortValue(a,key,mode),summarySortValue(b,key,mode),type);
    // Tie-break on the first (label) column so order stays stable after refresh.
    if(!cmp&&key!=='first')cmp=naturalCompareText(summaryFirstLabel(a,mode),summaryFirstLabel(b,mode));
    return cmp*dir;
  });
}
function setSummarySort(key){
  if(summarySort.key===key)summarySort.dir=summarySort.dir==='asc'?'desc':'asc';
  else summarySort={key,dir:'asc'};
  renderSummary();
}
function summarySortHeader(key,label,width,cls){
  const active=summarySort.key===key;
  const arrow=active?(summarySort.dir==='asc'?'▲':'▼'):'↕';
  const thCls=['sort-th',cls].filter(Boolean).join(' ');
  return `<th class="${thCls}"${width?` style="width:${width}"`:''}><button type="button" class="sort-th-btn ${active?'active':''}" onclick="setSummarySort('${attr(key)}')" title="Sort by ${attr(label)}"><span>${esc(label)}</span><span class="sort-arrow">${arrow}</span></button></th>`;
}

function setSummaryViewMode(mode){
  summaryViewMode=mode==='amount'?'amount':'count';
  renderSummary();
}
function setSummaryMetricStatus(status){
  activeSummaryStatus=activeSummaryStatus===status?'':status;
  renderAll();
}
function summaryStatusStats(tx,status){
  const rows=tx.filter(t=>t.manualStatus===status);
  return{count:rows.length,amount:rows.reduce((a,t)=>a+transactionAmount(t),0),vat:rows.reduce((a,t)=>a+Number(t.vat||0),0),total:rows.reduce((a,t)=>a+Number(t.total||0),0)};
}
function pctText(part,total){return total?((part/total)*100).toFixed(1).replace(/\.0$/,'')+'%':'0%'}
function summaryMetricCard(status,label,klass,stats,total,totalVat){
  const active=activeSummaryStatus===status;
  const countPct=pctText(stats.count,total);
  const amountPct=pctText(stats.vat,totalVat);
  const value=summaryViewMode==='amount'?amountPct:`${stats.count} / ${total}`;
  const valueClass=summaryViewMode==='amount'?'metric-value summary-pct-value':'metric-value';
  const sub=summaryViewMode==='amount'?`<span class="summary-card-detail">${peso(stats.vat)}</span> VAT of ${peso(totalVat)} · ${stats.count} txn(s)`:`<span class="pct">${countPct}</span> of transactions · click to filter`;
  return `<div class="metric ${klass} summary-filter-card ${active?'active':''}" onclick="setSummaryMetricStatus('${status}')" title="Click to filter ${attr(label)} transactions"><div class="metric-label">${esc(label)}</div><div class="${valueClass}">${value}</div><div class="metric-sub">${sub}</div></div>`;
}
function renderSummary(){
  const groupSelect=document.getElementById('summaryGroup');
  const mode=['supplier','cv'].includes(groupSelect?.value)?groupSelect.value:'supplier';
  if(activeSummaryReview&&activeSummaryReview.mode!==mode)closeSummaryReviewModal(true);
  const tx=filteredTransactions('summary');
  const groups=sortSummaryGroups(groupSummary(tx,mode),mode);
  const total=tx.length;
  const okStats=summaryStatusStats(tx,'ok');
  const warnStats=summaryStatusStats(tx,'warn');
  const errStats=summaryStatusStats(tx,'err');
  const unrevStats=summaryStatusStats(tx,'unreviewed');
  const journalStats=summaryStatusStats(tx,'journal');
  const adjustingStats=summaryStatusStats(tx,'adjusting');
  const totalAmount=tx.reduce((a,t)=>a+t.total,0);
  const vatAmount=tx.reduce((a,t)=>a+t.vat,0);
  const countToggle=document.getElementById('summaryCountToggle');
  const amountToggle=document.getElementById('summaryAmountToggle');
  if(countToggle)countToggle.classList.toggle('active',summaryViewMode!=='amount');
  if(amountToggle)amountToggle.classList.toggle('active',summaryViewMode==='amount');
  document.getElementById('summaryMetrics').innerHTML=`<div class="metric"><div class="metric-label">${mode==='supplier'?'Suppliers':mode==='cv'?'CV Numbers':mode==='voucher'?'Vouchers':'Groups'}</div><div class="metric-value">${groups.length}</div><div class="metric-sub">${total} purchase transactions</div></div>${summaryMetricCard('ok','Compliant','ok',okStats,total,vatAmount)}${summaryMetricCard('warn','Without Invoice','warn',warnStats,total,vatAmount)}${summaryMetricCard('err','Non-Compliant','err',errStats,total,vatAmount)}${summaryMetricCard('unreviewed','Unreviewed','review',unrevStats,total,vatAmount)}${summaryMetricCard('journal','Journal Entry','journal',journalStats,total,vatAmount)}${summaryMetricCard('adjusting','Adjusting Entry','adjusting',adjustingStats,total,vatAmount)}<div class="metric"><div class="metric-label">Total / VAT</div><div class="metric-value" style="font-size:16px">${peso(totalAmount)}</div><div class="metric-sub">VAT ${peso(vatAmount)}</div></div>`;
  const labels=summaryLabels(mode);
  const supplierFirst=mode==='supplier';
  const firstHeader=summarySortHeader('first',labels.first,'17%');
  const secondHeader=summarySortHeader('second',labels.second,'17%');
  const vatTypeHeader=summarySortHeader('vattype','VAT Type','10%');
  const numericHeaders=summarySortHeader('txn','Txn','5%','num')+summarySortHeader('amount','Amount','11%','num')+summarySortHeader('vat','VAT','9%','num')+summarySortHeader('total','Total','10%','num')+summarySortHeader('ewt','EWT','9%','num')+summarySortHeader('score','Score','8%')+summarySortHeader('status','Status','9%');
  document.getElementById('summaryThead').innerHTML=`<tr>${supplierFirst?firstHeader+vatTypeHeader+secondHeader:firstHeader+secondHeader+vatTypeHeader}${numericHeaders}</tr>`;
  const tbody=document.getElementById('summaryTbody'),tfoot=document.getElementById('summaryTfoot');
  tbody.innerHTML='';
  if(!groups.length){tbody.innerHTML='<tr><td colspan="10"><div class="empty-state">No transactions match your filters.</div></td></tr>';tfoot.innerHTML='';closeSummaryReviewModal(true);return}
  let totals={txn:0,amount:0,vat:0,total:0,ewt:0};
  groups.forEach(g=>{
    const st=groupStatus(g.txns);
    const sums=sumTxns(g.txns);
    totals.txn+=g.txns.length;totals.amount+=sums.amount;totals.vat+=sums.vat;totals.total+=sums.total;totals.ewt+=sums.ewtAmount;
    const key=mode+'|'+g.key;
    const open=activeSummaryReview&&activeSummaryReview.mode===mode&&activeSummaryReview.key===g.key;
    let firstLabel=g.key;
    let second=`<div class="sup-name">${esc(g.supplierDisplay)}</div><div class="sup-tin">${esc(g.tinDisplay)}</div><div class="mono">CV: ${esc(g.cvDisplay)}</div>`;
    if(mode==='supplier'){
      firstLabel=g.supplierDisplay;
      second=`<div class="sup-tin">${esc(g.tinDisplay)}</div><div class="mono">CV: ${esc(g.cvDisplay)}</div>`;
    }else if(mode==='cv'){
      second=`<div class="sup-name">${esc(g.supplierDisplay)}</div><div class="sup-tin">${esc(g.tinDisplay)}</div>`;
    }
    const firstCell=`<td><div class="sup-cell"><svg class="chevron${open?' open':''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg><div><div class="sup-name">${esc(firstLabel)}</div></div></div></td>`;
    const secondCell=`<td>${second}</td>`;
    const vatTypeCell=`<td>${vatBadge(g.vatRegDisplay)}</td>`;
    const tr=document.createElement('tr');
    tr.className='summary-row';
    tr.innerHTML=`${supplierFirst?firstCell+vatTypeCell+secondCell:firstCell+secondCell+vatTypeCell}<td class="num">${g.txns.length}</td><td class="num">${peso(sums.amount)}</td><td class="num">${peso(sums.vat)}</td><td class="num">${peso(sums.total)}</td><td class="num">${peso(sums.ewtAmount)}</td><td>${scoreBar(st)}</td><td>${statusBadge(st.status)}</td>`;
    tr.addEventListener('click',()=>{activeSummaryReview={mode,key:g.key};renderSummary();renderSummaryReviewModal()});
    tbody.appendChild(tr);
  });
  tfoot.innerHTML=`<tr><td colspan="3">Total</td><td class="num">${totals.txn}</td><td class="num">${peso(totals.amount)}</td><td class="num">${peso(totals.vat)}</td><td class="num">${peso(totals.total)}</td><td class="num">${peso(totals.ewt)}</td><td colspan="2"></td></tr>`;
  renderSummaryReviewModal();
}
function summaryHiddenDetailFields(mode){
  const hidden=new Set(['voucher','vatCategory','atcCode']);
  if(mode==='supplier')hidden.add('supplier');
  if(mode==='cv')hidden.add('cv');
  return hidden;
}
function summaryDetailTable(txns,mode='voucher'){
  const hidden=summaryHiddenDetailFields(mode);
  const columns=[
    {key:'cv',label:'CV no.',cls:'mono',cell:t=>esc(t.cv)},
    {key:'supplier',label:'Registered supplier',cell:t=>esc(t.supplier||'For verification')},
    {key:'invoice',label:'Invoice / OR',cls:'mono',cell:t=>t.inv?esc(t.inv):'<span class="muted">Not issued</span>'},
    {key:'date',label:'Date',cell:t=>esc(t.date)},
    {key:'description',label:'Description',cell:t=>esc(t.description||'--')},
    {key:'amount',label:'Amount',cls:'num',cell:t=>peso(transactionAmount(t))},
    {key:'vat',label:'Computed VAT',cls:'num',cell:t=>peso(t.vat)},
    {key:'total',label:'Total',cls:'num',cell:t=>peso(t.total)},
    {key:'ewt',label:'Computed EWT',cls:'num',cell:t=>peso(t.ewtAmount)},
    {key:'status',label:'Status',cell:t=>statusBadge(t.manualStatus)}
  ].filter(col=>!hidden.has(col.key));
  const classAttr=col=>col.cls?` class="${col.cls}"`:'';
  return `<table class="dtable"><thead><tr>${columns.map(col=>`<th${classAttr(col)}>${col.label}</th>`).join('')}</tr></thead><tbody>${txns.map(t=>`<tr>${columns.map(col=>`<td${classAttr(col)}>${col.cell(t)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function summaryModeTitle(mode){
  if(mode==='supplier')return 'Registered Supplier';
  if(mode==='cv')return 'CV Number';
  if(mode==='cv_supplier')return 'CV + Supplier';
  if(mode==='voucher_supplier')return 'Voucher + Supplier';
  return 'Voucher Name';
}
function summaryDetailValue(key,t){
  if(key==='voucher')return t.voucherName||'--';
  if(key==='supplier')return t.supplier||'For verification';
  if(key==='cv')return t.cv||'(No CV Number)';
  return '';
}
function summaryReadonlyField(label,value,extraClass=''){
  return `<div class="compact-field"><label>${esc(label)}</label><div class="summary-readonly-value ${extraClass}">${value}</div></div>`;
}
function summaryStatusPill(status){return `<div class="summary-status-pill ${verificationStatusClass(status)}">${esc(verificationText(status))}</div>`}
function summaryGroupMetaLine(g,mode){
  if(mode==='supplier')return `TIN: ${esc(g.tinDisplay)} · CVs: ${esc(g.cvDisplay)}`;
  if(mode==='cv')return `Suppliers: ${esc(g.supplierDisplay)} · TIN: ${esc(g.tinDisplay)}`;
  return `Suppliers: ${esc(g.supplierDisplay)} · CVs: ${esc(g.cvDisplay)}`;
}
function summaryReviewCards(txns,mode='voucher'){
  if(!txns.length)return '<div class="empty-state" style="padding:16px">No transaction rows for this summary group.</div>';
  const hidden=summaryHiddenDetailFields(mode);
  const cards=txns.map(t=>{
    const supplierFields=[];
    if(!hidden.has('supplier'))supplierFields.push(summaryReadonlyField('Registered Supplier',esc(t.supplier||'For verification')));
    const invoiceFields=[];
    if(!hidden.has('cv'))invoiceFields.push(summaryReadonlyField('CV Number',esc(t.cv||'--')));
    invoiceFields.push(summaryReadonlyField('Invoice / OR',t.inv?esc(t.inv):'<span class="muted">Not issued</span>'));
    invoiceFields.push(summaryReadonlyField('Date',esc(t.date||'--')));
    const supplierSection=supplierFields.length?`<div class="verification-section section-supplier summary-section-supplier">
          <div class="verification-section-title">Supplier</div>
          <div class="compact-grid">${supplierFields.join('')}</div>
        </div>`:'';
    return `<div class="verification-card summary-popup-card ${verificationStatusClass(t.manualStatus)} ${supplierFields.length?'':'no-supplier'}">
      <div class="verification-card-head summary-thin-head">
        <div class="summary-desc-wrap"><div class="field-label">Description</div><div class="readonly-desc">${esc(t.description||'--')}</div></div>
        <div class="action-buttons verification-actions-right"><span class="autosave-status">Read-only summary</span></div>
      </div>
      <div class="verification-line summary-thin-line">
        ${supplierSection}
        <div class="verification-section section-tax">
          <div class="verification-section-title">References</div>
          <div class="compact-grid">${invoiceFields.join('')}</div>
        </div>
        <div class="verification-section section-amounts">
          <div class="verification-section-title">Computed amounts</div>
          <div class="compact-grid">
            ${summaryReadonlyField('Amount',peso(transactionAmount(t)),'money')}
            ${summaryReadonlyField('Computed VAT',peso(t.vat),'money')}
            ${summaryReadonlyField('Total',peso(t.total),'money')}
            ${summaryReadonlyField('Computed EWT',peso(t.ewtAmount),'money')}
          </div>
        </div>
        <div class="verification-section section-verification">
          <div class="verification-section-title">Verification</div>
          <div class="compact-grid">
            <div class="compact-field"><label>Status</label>${summaryStatusPill(t.manualStatus)}</div>
            <div class="compact-field compact-note"><label>Notes</label><div class="summary-readonly-value summary-note-value">${esc(t.reviewNote||'--')}</div></div>
          </div>
        </div>
      </div>
      ${isExemptEntry(t)?`<div class="exempt-entry-note summary-exempt-note">VAT Category and ATC Code are not applicable for Journal Entries and Adjusting Entries.</div>`:''}
    </div>`;
  }).join('');
  return `<div class="verification-card-list summary-thin-card-list">${cards}</div>`;
}

function renderSummaryReviewModal(){
  const modal=document.getElementById('summaryReviewModal');
  const content=document.getElementById('summaryReviewModalContent');
  if(!modal||!content)return;
  if(activeTab!=='summary'||!activeSummaryReview){modal.classList.remove('visible');modal.setAttribute('aria-hidden','true');content.innerHTML='';return;}
  const selectedSummaryMode=document.getElementById('summaryGroup')?.value||'supplier';
  const mode=['supplier','cv'].includes(activeSummaryReview.mode)?activeSummaryReview.mode:(['supplier','cv'].includes(selectedSummaryMode)?selectedSummaryMode:'supplier');
  const groups=groupSummary(filteredTransactions('summary'),mode);
  const g=groups.find(item=>item.key===activeSummaryReview.key);
  if(!g){modal.classList.remove('visible');modal.setAttribute('aria-hidden','true');content.innerHTML='';activeSummaryReview=null;return;}
  const sums=sumTxns(g.txns);
  const st=groupStatus(g.txns);
  const groupTitle=summaryModeTitle(mode);
  const hidden=summaryHiddenDetailFields(mode);
  const groupedHidden=[...hidden].filter(k=>['supplier','cv'].includes(k));
  const hiddenNames=groupedHidden.map(k=>k==='supplier'?'Registered Supplier':k==='cv'?'CV Number':k).join(', ');
  modal.classList.add('visible');
  modal.setAttribute('aria-hidden','false');
  content.innerHTML=`<div class="detail-inner review-workspace summary-review-workspace">
    <div class="review-workspace-header">
      <div class="review-workspace-title">
        <div class="review-title-main"><span id="summaryReviewTitle">${esc(groupTitle)}: ${esc(g.key)}</span><span class="review-voucher">${summaryGroupMetaLine(g,mode)}</span></div>
        <div class="review-chips">
          <span class="review-chip"><strong>${g.txns.length}</strong> transaction row(s)</span>
          <span class="review-chip"><strong>${verificationText(st.status)}</strong> group status</span>
          <span class="review-chip"><strong>${vatTypeText(g.vatRegDisplay)}</strong> VAT type</span>
          ${hiddenNames?`<span class="review-chip">Grouped field hidden in line cards: <strong>${esc(hiddenNames)}</strong></span>`:''}
        </div>
      </div>
      <div class="review-actions"><button class="cv-review-close" data-close-summary-review="1" aria-label="Close">×</button></div>
    </div>
    <div class="summary-mini-metrics">
      <div class="summary-mini-card"><div class="mini-label">Transactions</div><div class="mini-value">${g.txns.length}</div><div class="mini-sub">Rows in this group</div></div>
      <div class="summary-mini-card"><div class="mini-label">Amount</div><div class="mini-value">${peso(sums.amount)}</div><div class="mini-sub">Base purchase amount</div></div>
      <div class="summary-mini-card"><div class="mini-label">Computed VAT</div><div class="mini-value">${peso(sums.vat)}</div><div class="mini-sub">Input VAT</div></div>
      <div class="summary-mini-card"><div class="mini-label">Total</div><div class="mini-value">${peso(sums.total)}</div><div class="mini-sub">Gross purchase total</div></div>
      <div class="summary-mini-card"><div class="mini-label">Computed EWT</div><div class="mini-value">${peso(sums.ewtAmount)}</div><div class="mini-sub">Withholding tax</div></div>
      <div class="summary-mini-card"><div class="mini-label">Compliant</div><div class="mini-value">${st.okPct}%</div><div class="mini-sub">${st.ok} compliant · ${st.err} non-compliant</div></div>
    </div>
    <div class="cv-review-body">${summaryReviewCards(g.txns,mode)}</div>
  </div>`;
}
function closeSummaryReviewModal(silent=false){
  const modal=document.getElementById('summaryReviewModal');
  const content=document.getElementById('summaryReviewModalContent');
  activeSummaryReview=null;
  if(modal){modal.classList.remove('visible');modal.setAttribute('aria-hidden','true')}
  if(content)content.innerHTML='';
  if(!silent&&activeTab==='summary')renderSummary();
}

function ledgerSearchMatch(row,search){return [row.cv,row.supplier,row.date,row.amount,row.account].some(v=>String(v||'').toLowerCase().includes(search))}
function buildCVGroups(){const map=new Map();const ensure=cv=>{const key=cv||'(No CV Number)';if(!map.has(key))map.set(key,{cv:key,txns:[],vatRows:[],ewtRows:[]});return map.get(key)};visibleTransactionsForMonth().forEach(t=>ensure(t.cv).txns.push(t));visibleVatLedgerForMonth().forEach(r=>{const g=map.get(r.cv||'(No CV Number)');if(g)g.vatRows.push(r)});visibleEwtLedgerForMonth().forEach(r=>{const g=map.get(r.cv||'(No CV Number)');if(g)g.ewtRows.push(r)});return[...map.values()].map(g=>{const sums=sumTxns(g.txns);g.bookVat=sums.vat;g.bookEwt=sums.ewtAmount;g.bookTotal=sums.total;g.vatLedger=g.vatRows.reduce((a,r)=>a+r.amount,0);g.ewtLedger=g.ewtRows.reduce((a,r)=>a+r.amount,0);g.vatDiff=g.bookVat-g.vatLedger;g.ewtDiff=g.bookEwt-g.ewtLedger;g.voucherNames=compactList(g.txns.map(t=>t.voucherName),'--');g.dateDisplay=compactList(g.txns.map(t=>t.date),'--');g.accountingTitles=compactList(g.txns.map(t=>t.accountingTitle),'--');g.bankAccounts=compactList(g.txns.map(t=>t.bankAccount),'--');g.suppliers=compactList(g.txns.map(t=>t.supplier||'For verification'),'--');g.status=groupStatus(g.txns);return g}).sort((a,b)=>a.cv.localeCompare(b.cv))}
function filteredCVGroups(){const search=(document.getElementById('workSearch').value||'').toLowerCase();const status=document.getElementById('workStatus').value;const variance=document.getElementById('varianceFilter').value;let groups=buildCVGroups();if(search)groups=groups.filter(g=>String(g.cv).toLowerCase().includes(search)||String(g.voucherNames).toLowerCase().includes(search)||String(g.suppliers).toLowerCase().includes(search)||g.txns.some(t=>[t.voucherName,t.supplier,t.tin,t.inv,t.date,t.description,t.accountingTitle,t.bankAccount,t.reviewNote].some(v=>String(v||'').toLowerCase().includes(search)))||g.vatRows.some(r=>ledgerSearchMatch(r,search))||g.ewtRows.some(r=>ledgerSearchMatch(r,search)));if(status)groups=groups.filter(g=>g.txns.some(t=>t.manualStatus===status));if(variance==='vat')groups=groups.filter(g=>!isBalanced(g.vatDiff));if(variance==='ewt')groups=groups.filter(g=>!isBalanced(g.ewtDiff));if(variance==='any')groups=groups.filter(g=>!isBalanced(g.vatDiff)||!isBalanced(g.ewtDiff));return sortWorkingGroups(groups)}
function amountWithBalance(value,diff){const cls=isBalanced(diff)?'':'ledger-alert';return `<span class="${cls}">${peso(value)}</span>`}
// Hover text for the VAT/EWT balance check: how much each is over/short/balanced.
// diff = computed (from Purchase Transactions) - uploaded ledger balance.
function balanceDeltaText(label,diff){
  const d=Number(diff||0);
  if(isBalanced(d))return `${label}: Balanced (${pesoText(0)})`;
  const dir=d>0?'over (computed exceeds uploaded balance)':'short (uploaded balance exceeds computed)';
  return `${label}: ${pesoText(Math.abs(d))} ${dir}`;
}
function balanceHoverText(g){
  const both=isBalanced(g.vatDiff)&&isBalanced(g.ewtDiff);
  return `VAT / EWT balance check — ${both?'Balanced':'Review balances'}\n${balanceDeltaText('VAT',g.vatDiff)}\n${balanceDeltaText('EWT',g.ewtDiff)}`;
}
// Rich (visible) hover tooltip content for the balance check cell.
function balanceDeltaHtml(label,diff){
  const d=Number(diff||0);
  if(isBalanced(d))return `<div class="bal-tip-row"><strong>${label}:</strong> <span class="bal-ok">Balanced (${pesoText(0)})</span></div>`;
  const dir=d>0?'over':'short';
  const cls=d>0?'bal-over':'bal-short';
  return `<div class="bal-tip-row"><strong>${label}:</strong> <span class="${cls}">${pesoText(Math.abs(d))} ${dir}</span></div>`;
}
function balanceHoverHtml(g){
  return `<div class="bal-tip-head">VAT / EWT balance difference</div>${balanceDeltaHtml('VAT',g.vatDiff)}${balanceDeltaHtml('EWT',g.ewtDiff)}<div class="bal-tip-note">Difference = computed (from Purchase Transactions) − uploaded ledger balance.</div>`;
}

function togglePurchaseInfo(){document.getElementById('purchaseInfoPanel')?.classList.toggle('visible')}
function birVisualWarningReportLabel(report){
  return ({slpExcel:'SLP Excel',slpDat:'SLP DAT',qapExcel:'QAP Excel',qapDat:'QAP DAT',purchaseBook:'Purchase Book',cashBook:'Cash Disbursement Book'})[report]||report;
}
function transactionIncludedInBirVisualWarningScope(t,report){
  if(report==='cashBook')return true;
  if(report==='qapExcel'||report==='qapDat')return hasTaxClassification(t)&&(hasAtcCode(t)||Number(t?.ewtAmount||0)>0);
  return hasTaxClassification(t);
}
function transactionReviewReasons(t){
  // Journal/Adjusting entries are valid without invoice, VAT category, ATC, or TIN,
  // so they are never flagged as incomplete BIR export blockers.
  if(isExemptEntry(t))return [];
  const reports=['slpExcel','slpDat','qapExcel','qapDat','purchaseBook','cashBook'];
  const reasons=[];
  reports.forEach(report=>{
    if(!transactionIncludedInBirVisualWarningScope(t,report))return;
    const missing=birTransactionBlockersForReport(t,report);
    if(missing.length)reasons.push(`${birVisualWarningReportLabel(report)} blocker: missing or unresolved ${missing.join(', ')}`);
  });
  return [...new Set(reasons)];
}
function groupReviewReasons(g){
  const reasons=[];
  (g.txns||[]).forEach(t=>transactionReviewReasons(t).forEach(r=>reasons.push(r)));
  return [...new Set(reasons)];
}
function groupNeedsReview(g){return groupReviewReasons(g).length>0}
function reviewTitleFromReasons(reasons){return reasons.length?'BIR export blocker: '+reasons.slice(0,6).join('; ')+(reasons.length>6?'; ...':''):''}

function ymd(year,month,day){
  // Pack a calendar date into a single comparable YYYYMMDD integer so every
  // recognised format sorts on the same scale regardless of how it was typed.
  const y=Number(year)||0,m=Number(month)||1,d=Number(day)||1;
  return y*10000+m*100+d;
}
function fullYear(year){
  let y=Number(year)||0;
  if(y>0&&y<100)y+=y<=69?2000:1900; // 2-digit year window: 00-69 -> 2000s, 70-99 -> 1900s
  return y;
}
function excelSerialToYmd(serial){
  // Excel/Sheets store dates as a serial day count from 1899-12-30 (UTC).
  const ms=Math.round(serial)*86400000+Date.UTC(1899,11,30);
  const d=new Date(ms);
  if(Number.isNaN(d.getTime()))return null;
  return ymd(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate());
}
function parseWorkSortDate(value){
  const raw=String(value??'').trim();
  if(!raw||raw==='--'||raw==='-'||raw.toLowerCase()==='n/a')return Number.POSITIVE_INFINITY;
  const strict=dateSortNumber(raw);
  if(strict!==null)return strict;
  // Bare numeric string => Excel serial date. Convert to a real date first so it
  // lands on the same YYYYMMDD scale as the text formats below instead of ~45000.
  if(/^\d+(?:\.\d+)?$/.test(raw)){
    const numeric=Number(raw);
    if(Number.isFinite(numeric)&&numeric>20000&&numeric<70000){
      const fromSerial=excelSerialToYmd(numeric);
      if(fromSerial!==null)return fromSerial;
    }
  }
  // ISO-ish: YYYY-MM-DD / YYYY/MM/DD (optionally with time)
  let m=raw.match(/^\s*(\d{4})[-\/.](\d{1,2})(?:[-\/.](\d{1,2}))?/);
  if(m)return ymd(m[1],m[2],m[3]||1);
  // Numeric MM/DD/YYYY or DD/MM/YYYY (2- or 4-digit year). If the first part is
  // >12 it can only be a day, which disambiguates the two orderings.
  m=raw.match(/^\s*(\d{1,2})[-\/.](\d{1,2})(?:[-\/.](\d{2,4}))?/);
  if(m){
    const first=Number(m[1]),second=Number(m[2]);
    const month=first>12?second:first;
    const day=first>12?first:second;
    return ymd(fullYear(m[3]),month,day);
  }
  // Month-name formats: "March 5, 2024", "5-Jan-24", "Jan 2024"
  const lower=raw.toLowerCase();
  const day=Number((raw.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/i)||[])[1]||1);
  const yearToken=(raw.match(/\b(\d{4})\b/)||raw.match(/\b(\d{2})\b(?!.*\b\d{1,2}\b)/)||[])[1];
  const year=fullYear(yearToken);
  for(let i=0;i<MONTH_NAMES.length;i++){
    if(MONTH_NAMES[i].some(alias=>new RegExp(`\\b${alias}\\b`,'i').test(lower)))return ymd(year,i+1,day);
  }
  // Last resort: let the JS engine try, then normalise to the same scale.
  const parsed=new Date(raw);
  if(!Number.isNaN(parsed.getTime()))return ymd(parsed.getFullYear(),parsed.getMonth()+1,parsed.getDate());
  return Number.POSITIVE_INFINITY;
}
function naturalCompareText(a,b){return String(a??'').localeCompare(String(b??''),undefined,{numeric:true,sensitivity:'base'})}
// Compliance severity used so Status/Verification columns sort by meaning rather
// than the raw status keyword: best (Compliant) -> worst (Non-Compliant).
const STATUS_SORT_PRIORITY={ok:0,journal:1,adjusting:2,warn:3,unreviewed:4,err:5};
function statusSortRank(status){const r=STATUS_SORT_PRIORITY[status];return r===undefined?99:r;}
// Generic typed comparator. 'date', 'num' and 'status' arrive pre-normalised to
// numbers so they sort by real value; everything else falls back to natural text.
function compareTypedValues(a,b,type){
  if(type==='text')return naturalCompareText(a,b);
  const an=Number(a),bn=Number(b);
  if(!Number.isFinite(an)&&!Number.isFinite(bn))return 0;
  if(!Number.isFinite(an))return 1; // push unparseable/blank values to the end
  if(!Number.isFinite(bn))return -1;
  return an<bn?-1:an>bn?1:0;
}
const WORK_SORT_TYPES={date:'date',cv:'text',voucher:'text',vat:'num',ewt:'num',total:'num',balance:'num',verification:'status'};
function workSortType(key){return WORK_SORT_TYPES[key]||'text';}
function workSortValueForGroup(g,key){
  switch(key){
    case 'date':return Math.min(...(g.txns||[]).map(t=>parseWorkSortDate(t.date)).concat([Number.POSITIVE_INFINITY]));
    case 'voucher':return g.voucherNames||compactList((g.txns||[]).map(t=>t.voucherName),'');
    case 'vat':return Number(g.bookVat)||0;
    case 'ewt':return Number(g.bookEwt)||0;
    case 'total':return Number(g.bookTotal)||0;
    case 'balance':return (isBalanced(g.vatDiff)&&isBalanced(g.ewtDiff))?0:1;
    case 'verification':return statusSortRank(g.status&&g.status.status);
    case 'cv':default:return g.cv||'';
  }
}
function sortWorkingGroups(groups){
  const key=workSort?.key||'date';
  const type=workSortType(key);
  const dir=workSort?.dir==='desc'?-1:1;
  return [...groups].sort((a,b)=>{
    let cmp=compareTypedValues(workSortValueForGroup(a,key),workSortValueForGroup(b,key),type);
    // Stable tie-breakers (date, then CV, then voucher) keep order deterministic
    // after filtering/search/refresh regardless of the active column.
    if(!cmp&&key!=='date')cmp=compareTypedValues(workSortValueForGroup(a,'date'),workSortValueForGroup(b,'date'),'date');
    if(!cmp&&key!=='cv')cmp=naturalCompareText(a.cv,b.cv);
    if(!cmp&&key!=='voucher')cmp=naturalCompareText(a.voucherNames,b.voucherNames);
    return cmp*dir;
  });
}
// Order the transaction lines shown inside a CV verification popup. Lines always
// follow their stable import sequence (_seq) so the same CV group opens in the same
// order every time — across refreshes, autosaves, cloud sync/pull, sessions, and
// devices. This is deliberately independent of the working-table column sort
// (workSort), which only reorders the CV groups in the summary list, never the
// lines within a group. Records are never reordered unless the user explicitly
// changes them.
function orderedGroupTransactions(txns){
  return [...(txns||[])].sort((a,b)=>{
    const sa=Number(a?._seq),sb=Number(b?._seq);
    const fa=Number.isFinite(sa),fb=Number.isFinite(sb);
    if(fa&&fb){if(sa!==sb)return sa-sb;}
    else if(fa)return -1;
    else if(fb)return 1;
    return 0; // fall back to the existing (import) order
  });
}
function setWorkSort(key){
  if(workSort.key===key)workSort.dir=workSort.dir==='asc'?'desc':'asc';
  else workSort={key,dir:'asc'};
  renderWorking();
}
function workSortHeader(key,label){
  const active=workSort.key===key;
  const arrow=active?(workSort.dir==='asc'?'▲':'▼'):'↕';
  return `<button type="button" class="sort-th-btn ${active?'active':''}" onclick="setWorkSort('${attr(key)}')" title="Sort by ${attr(label)}"><span>${esc(label)}</span><span class="sort-arrow">${arrow}</span></button>`;
}

function togglePurchaseBreakdown(kind){renderWorking()}
function taxGroupKey(value,fallback){const v=String(value||'').trim();return v||fallback}
function purchaseVatBreakdownRows(txns){
  const map=new Map();
  txns.forEach(t=>{
    const code=normalizeVATCategory(t.vatCategory)||'Uncoded';
    const label=code==='Uncoded'?'Uncoded VAT Category':vatCategoryText(code);
    if(!map.has(code))map.set(code,{code,label,rows:0,amount:0,vat:0,total:0});
    const g=map.get(code);g.rows++;g.amount+=transactionAmount(t);g.vat+=Number(t.vat||0);g.total+=Number(t.total||0);
  });
  return [...map.values()].sort((a,b)=>b.amount-a.amount||a.code.localeCompare(b.code));
}
function purchaseEwtBreakdownRows(txns){
  const map=new Map();
  txns.forEach(t=>{
    const code=normalizeATC(t.atcCode)||'Uncoded';
    const rate=code==='Uncoded'?'--':atcRateText(code);
    const label=code==='Uncoded'?'Uncoded ATC':`${code} · ${rate}`;
    if(!map.has(code))map.set(code,{code,label,rate,rows:0,amount:0,total:0,ewt:0,net:0});
    const g=map.get(code);g.rows++;g.amount+=transactionAmount(t);g.total+=Number(t.total||0);g.ewt+=Number(t.ewtAmount||0);g.net+=Number(t.total||0)-Number(t.ewtAmount||0);
  });
  return [...map.values()].sort((a,b)=>b.ewt-a.ewt||b.amount-a.amount||a.code.localeCompare(b.code));
}
function setPurchaseBreakdown(kind){
  const next=kind==='ewt'?'ewt':'vat';
  activePurchaseBreakdown=activePurchaseBreakdown===next?null:next;
  renderWorking();
}
function renderPurchaseTaxBreakdown(txns){
  const panel=document.getElementById('purchaseTaxBreakdown');
  if(!panel)return;
  if(activeTab!=='working'||!activePurchaseBreakdown){panel.classList.remove('visible');panel.innerHTML='';return;}
  const kind=activePurchaseBreakdown==='ewt'?'ewt':'vat';
  const isVat=kind==='vat';
  const rows=isVat?purchaseVatBreakdownRows(txns):purchaseEwtBreakdownRows(txns);
  const title=isVat?'Purchase VAT by VAT Category Code':'Purchase EWT by ATC Code';
  const subtitle=isVat?'VAT Category summary for the selected month.':'ATC Code summary for the selected month.';
  const total=rows.reduce((a,r)=>({rows:a.rows+r.rows,amount:a.amount+r.amount,vat:a.vat+(r.vat||0),total:a.total+(r.total||0),ewt:a.ewt+(r.ewt||0),net:a.net+(r.net||0)}),{rows:0,amount:0,vat:0,total:0,ewt:0,net:0});
  const body=rows.length?rows.map(r=>isVat?`<tr><td class="mono">${esc(r.code)}</td><td>${esc(r.label)}</td><td class="num">${peso(r.amount)}</td><td class="num">${peso(r.vat)}</td><td class="num">${peso(r.total)}</td></tr>`:`<tr><td class="mono">${esc(r.code)}</td><td>${esc(r.rate)}</td><td class="num">${peso(r.amount)}</td><td class="num">${peso(r.total)}</td><td class="num">${peso(r.ewt)}</td><td class="num">${peso(r.net)}</td></tr>`).join(''):`<tr><td colspan="${isVat?5:6}"><div class="empty-state" style="padding:12px">No purchase rows available.</div></td></tr>`;
  const footer=isVat?`<tr class="tax-breakdown-total"><td colspan="2">Total</td><td class="num">${peso(total.amount)}</td><td class="num">${peso(total.vat)}</td><td class="num">${peso(total.total)}</td></tr>`:`<tr class="tax-breakdown-total"><td colspan="2">Total</td><td class="num">${peso(total.amount)}</td><td class="num">${peso(total.total)}</td><td class="num">${peso(total.ewt)}</td><td class="num">${peso(total.net)}</td></tr>`;
  panel.innerHTML=`<div class="tax-breakdown-grid"><div class="tax-breakdown-box"><div class="tax-breakdown-title">${title}</div><div class="tax-breakdown-sub">${subtitle}</div><div class="tax-breakdown-wrap"><table class="tax-breakdown-table"><thead>${isVat?'<tr><th style="width:13%">VAT Category</th><th style="width:32%">Description</th><th class="num" style="width:18%">Amount</th><th class="num" style="width:18%">VAT Amount</th><th class="num" style="width:19%">Total Amount</th></tr>':'<tr><th style="width:13%">ATC Code</th><th style="width:12%">Rate</th><th class="num" style="width:18%">Amount</th><th class="num" style="width:18%">Total Amount</th><th class="num" style="width:18%">EWT Amount</th><th class="num" style="width:21%">Net Amount</th></tr>'}</thead><tbody>${body}</tbody><tfoot>${footer}</tfoot></table></div></div></div>`;
  panel.classList.add('visible');
}
function renderWorking(){
  const groups=filteredCVGroups();
  const allTx=visibleTransactionsForMonth();
  const vatRows=visibleVatLedgerForMonth();
  const ewtRows=visibleEwtLedgerForMonth();
  const bookVat=allTx.reduce((a,t)=>a+t.vat,0);
  const bookEwt=allTx.reduce((a,t)=>a+t.ewtAmount,0);
  const vatBal=vatRows.reduce((a,r)=>a+r.amount,0);
  const ewtBal=ewtRows.reduce((a,r)=>a+r.amount,0);
  const vatDiff=bookVat-vatBal;
  const ewtDiff=bookEwt-ewtBal;
  const unrev=allTx.filter(t=>t.manualStatus==='unreviewed').length;
  const forVerification=allTx.filter(t=>!t.supplier||!t.tin).length;
  const supplierSpecialCount=allTx.filter(t=>supplierSpecialIssues(t).length).length;
  document.getElementById('reconMetrics').innerHTML=`<div class="metric"><div class="metric-label">CV Groups</div><div class="metric-value">${groups.length}</div><div class="metric-sub">${allTx.length} purchase rows</div></div><div class="metric review"><div class="metric-label">Supplier Data Needed</div><div class="metric-value">${forVerification}</div><div class="metric-sub">blank supplier or TIN</div></div><div class="metric money-metric breakdown-tab ${isBalanced(vatDiff)?'ok':'err'} ${activePurchaseBreakdown==='vat'?'active':''}" onclick="setPurchaseBreakdown('vat')" aria-pressed="${activePurchaseBreakdown==='vat'?'true':'false'}"><div class="metric-label">Purchase VAT</div><div class="metric-value">${peso(bookVat)}</div><div class="metric-sub">VAT Category breakdown</div></div><div class="metric money-metric breakdown-tab ${isBalanced(ewtDiff)?'ok':'err'} ${activePurchaseBreakdown==='ewt'?'active':''}" onclick="setPurchaseBreakdown('ewt')" aria-pressed="${activePurchaseBreakdown==='ewt'?'true':'false'}"><div class="metric-label">Purchase EWT</div><div class="metric-value">${peso(bookEwt)}</div><div class="metric-sub">ATC Code breakdown</div></div><div class="metric review"><div class="metric-label">Unreviewed</div><div class="metric-value">${unrev}</div><div class="metric-sub">needs manual tag</div></div><div class="metric ${supplierSpecialCount?'warn':'ok'}"><div class="metric-label">Supplier Detail Review</div><div class="metric-value">${supplierSpecialCount}</div><div class="metric-sub">special character warning(s)</div></div>`;
  renderPurchaseTaxBreakdown(allTx);
  renderDocTrackerMetrics();
  document.getElementById('workThead').innerHTML=`<tr><th class="sort-th" style="width:10%">${workSortHeader('date','Date')}</th><th class="sort-th" style="width:15%">${workSortHeader('cv','CV Number')}</th><th class="sort-th" style="width:21%">${workSortHeader('voucher','Voucher name')}</th><th class="num sort-th" style="width:11%">${workSortHeader('vat','Purchase VAT')}</th><th class="num sort-th" style="width:11%">${workSortHeader('ewt','Purchase EWT')}</th><th class="num sort-th" style="width:12%">${workSortHeader('total','Total Amount')}</th><th class="sort-th" style="width:10%"><span class="column-info-wrap">${workSortHeader('balance','Balance check')}<button class="info-icon-btn column-info-btn" type="button" onclick="event.stopPropagation()" aria-label="Balance Check explanation">i</button><span class="column-tooltip"><strong>Balance Check</strong> compares the total computed Purchase VAT and Purchase EWT from Purchase Transactions against uploaded VAT Balances and EWT Balances with the same CV Number. Balanced means both differences are within the rounding allowance; Review balances means at least one total does not match.</span></span></th><th class="sort-th" style="width:10%"><span class="column-info-wrap">${workSortHeader('verification','Verification')}<button class="info-icon-btn column-info-btn" type="button" onclick="event.stopPropagation()" aria-label="Verification explanation">i</button><span class="column-tooltip"><strong>Verification</strong> summarizes the line-level review status for the CV: Compliant, Without Invoice, Non-Compliant, Unreviewed, Journal Entry, or Adjusting Entry. <strong>Journal Entry</strong> marks a disbursement intentionally booked as a journal entry: it is valid without invoice, VAT category, ATC code, or TIN, and is not flagged incomplete. <strong>Adjusting Entry</strong> applies the same field exemptions and is additionally excluded from all BIR Compliance Exports (including the Cash Disbursement Book). Open the CV to fix missing supplier, TIN, invoice, tax code, amount, status, or review notes.</span></span></th></tr>`;
  const tbody=document.getElementById('workTbody'),tfoot=document.getElementById('workTfoot');
  tbody.innerHTML='';
  if(!groups.length){tbody.innerHTML='<tr><td colspan="8"><div class="empty-state">No CV groups match your filters.</div></td></tr>';tfoot.innerHTML='';focusedCV=null;renderCVReviewModal();return}
  let totalAmount=0;
  let selectedStillVisible=false;
  groups.forEach(g=>{
    const open=focusedCV===g.cv;
    if(open)selectedStillVisible=true;
    const cvTotal=g.txns.reduce((a,t)=>a+t.total,0);
    totalAmount+=cvTotal;
    const vatOk=isBalanced(g.vatDiff),ewtOk=isBalanced(g.ewtDiff);
    const check=vatOk&&ewtOk?badge('ok','Balanced'):badge('err','Review balances');
    const balanceHover=balanceHoverText(g);
    const tr=document.createElement('tr');
    const reviewReasons=groupReviewReasons(g);
    tr.className='summary-row'+(open?' active-cv':'')+(reviewReasons.length?' review-needed-row':'');
    if(reviewReasons.length)tr.title=reviewTitleFromReasons(reviewReasons);
    tr.innerHTML=`<td>${esc(g.dateDisplay||'--')}</td><td><div class="sup-cell"><svg class="chevron${open?' open':''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg><div><div class="sup-name">${esc(g.cv)}</div></div></div></td><td>${esc(g.voucherNames)}</td><td class="num">${amountWithBalance(g.bookVat,g.vatDiff)}</td><td class="num">${amountWithBalance(g.bookEwt,g.ewtDiff)}</td><td class="num">${peso(cvTotal)}</td><td title="${attr(balanceHover)}"><span class="column-info-wrap balance-info" tabindex="0">${check}<span class="column-tooltip balance-tip">${balanceHoverHtml(g)}</span></span></td><td>${scoreBar(g.status)}</td>`;
    tr.addEventListener('click',()=>{focusedCV=g.cv;openCVs.clear();openCVs.add(g.cv);renderWorking()});
    tbody.appendChild(tr);
  });
  if(focusedCV&&!selectedStillVisible){focusedCV=null;openCVs.clear()}
  tfoot.innerHTML=`<tr><td colspan="3">Grand total</td><td class="num">${amountWithBalance(bookVat,vatDiff)}</td><td class="num">${amountWithBalance(bookEwt,ewtDiff)}</td><td class="num">${peso(totalAmount)}</td><td colspan="2"></td></tr>`;
  renderCVReviewModal();
}

function renderCVReviewModal(){
  const modal=document.getElementById('cvReviewModal');
  const content=document.getElementById('cvReviewModalContent');
  if(!modal||!content)return;
  // Preserve the scroll position and focused field so a re-render triggered by
  // autosave / cloud sync does not jump the popup back to the top (important for
  // CV groups with many lines).
  const prevBody=content.querySelector('.cv-review-body');
  const prevScroll=prevBody?prevBody.scrollTop:0;
  const activeEl=document.activeElement;
  let focusId=null,selStart=null,selEnd=null;
  if(activeEl&&activeEl.id&&content.contains(activeEl)){
    focusId=activeEl.id;
    try{selStart=activeEl.selectionStart;selEnd=activeEl.selectionEnd;}catch(err){}
  }
  if(activeTab!=='working'||!focusedCV){modal.classList.remove('visible');modal.setAttribute('aria-hidden','true');content.innerHTML='';return;}
  const g=buildCVGroups().find(item=>item.cv===focusedCV);
  if(!g){modal.classList.remove('visible');modal.setAttribute('aria-hidden','true');content.innerHTML='';return;}
  // STABILITY: if the popup is already open on this same CV and the user is actively
  // editing a field inside it, skip the innerHTML rebuild. This prevents the popup
  // from stuttering or closing when a background autosave / cloud sync re-renders.
  // Live field values are updated in place by the field handlers, so no rebuild is
  // needed mid-edit; the popup rebuilds normally once focus leaves it.
  const existingInner=content.querySelector('.review-workspace');
  if(focusId&&existingInner&&existingInner.getAttribute('data-cv')===String(g.cv)){
    modal.classList.add('visible');modal.setAttribute('aria-hidden','false');
    return;
  }
  const cvTotal=g.txns.reduce((a,t)=>a+t.total,0);
  modal.classList.add('visible');
  modal.setAttribute('aria-hidden','false');
  content.innerHTML=`<div class="detail-inner review-workspace" data-cv="${attr(g.cv)}"><div class="review-workspace-header"><div class="review-workspace-title"><div class="review-title-main" id="cvReviewTitle"><span class="review-cv-edit">${cvNumberEditor(g)}</span><span class="review-voucher">${esc(g.voucherNames)}</span></div><div class="review-chips"><span class="review-chip"><strong>Date</strong> ${esc(g.dateDisplay||'--')}</span><span class="review-chip"><strong>Lines</strong> ${g.txns.length}</span><span class="review-chip"><strong>VAT</strong> ${peso(g.bookVat)}</span><span class="review-chip"><strong>EWT</strong> ${peso(g.bookEwt)}</span><span class="review-chip"><strong>Total</strong> ${peso(cvTotal)}</span></div></div><div class="review-actions"><button type="button" class="cv-review-close" data-close-cv-review aria-label="Close CV verification">×</button></div></div><div class="cv-review-body">${workingDetailTable(g)}</div></div>`;
  // Restore scroll + focus after the rebuild.
  const newBody=content.querySelector('.cv-review-body');
  if(newBody)newBody.scrollTop=prevScroll;
  if(focusId){
    const el=document.getElementById(focusId);
    if(el){try{el.focus({preventScroll:true});if(selStart!=null&&typeof el.setSelectionRange==='function')el.setSelectionRange(selStart,selEnd);}catch(err){}}
  }
}
function closeCVReviewModal(){focusedCV=null;openCVs.clear();renderWorking()}
/* ---- Inline edit: CV Number (group header) and per-line Description ---- */
function cvNumberEditor(g){
  const cv=g.cv;
  return `<span class="cv-edit-wrap" id="cvEditWrap">`
    +`<span class="review-cv" id="cvView">${esc(cv)}</span>`
    +`<button type="button" class="btn btn-small cv-inline-edit-btn" id="cvEditBtn" onclick="editCvNumber()">Edit</button>`
    +`<span class="cv-edit-form" id="cvEditForm" style="display:none">`
    +`<input type="text" class="edit-input cv-edit-input" id="cvEditInput" value="${attr(cv)}" aria-label="CV Number"/>`
    +`<button type="button" class="btn btn-small btn-primary" onclick="saveCvNumber()">Save</button>`
    +`<button type="button" class="btn btn-small" onclick="cancelCvNumber()">Cancel</button>`
    +`</span></span>`;
}
function editCvNumber(){
  const view=document.getElementById('cvView'),btn=document.getElementById('cvEditBtn'),form=document.getElementById('cvEditForm');
  if(!form)return;
  view.style.display='none';if(btn)btn.style.display='none';form.style.display='';
  const inp=document.getElementById('cvEditInput');if(inp){inp.focus();inp.select();}
}
function cancelCvNumber(){
  const view=document.getElementById('cvView'),btn=document.getElementById('cvEditBtn'),form=document.getElementById('cvEditForm');
  if(!form)return;
  const inp=document.getElementById('cvEditInput');if(inp)inp.value=focusedCV;
  form.style.display='none';view.style.display='';if(btn)btn.style.display='';
}
function saveCvNumber(){
  const inp=document.getElementById('cvEditInput');if(!inp)return;
  const newCv=String(inp.value||'').trim();
  const oldKey=focusedCV;
  if(!newCv){showToast('CV Number cannot be blank.');return;}
  if(newCv===oldKey){cancelCvNumber();return;}
  let changed=0;
  transactions.forEach(t=>{if((t.cv||'(No CV Number)')===oldKey){t.cv=newCv;changed++;}});
  // Keep the matching VAT/EWT balance rows attached to the renamed CV.
  (Array.isArray(vatLedger)?vatLedger:[]).forEach(r=>{if((r.cv||'(No CV Number)')===oldKey)r.cv=newCv;});
  (Array.isArray(ewtLedger)?ewtLedger:[]).forEach(r=>{if((r.cv||'(No CV Number)')===oldKey)r.cv=newCv;});
  if(!changed){showToast('No transactions found for this CV.');return;}
  focusedCV=newCv;openCVs.clear();openCVs.add(newCv);
  saveAll();renderAll();
  showToast('CV Number updated.');
}
function editLineDescription(id){
  const view=document.getElementById('descView_'+id),btn=document.getElementById('descEditBtn_'+id),form=document.getElementById('descForm_'+id);
  if(!form)return;
  view.style.display='none';if(btn)btn.style.display='none';form.style.display='';
  const inp=document.getElementById('descInput_'+id);if(inp){inp.focus();inp.select();}
}
function cancelLineDescription(id){
  const t=transactions.find(x=>x._id===id);
  const view=document.getElementById('descView_'+id),btn=document.getElementById('descEditBtn_'+id),form=document.getElementById('descForm_'+id);
  if(!form)return;
  const inp=document.getElementById('descInput_'+id);if(inp&&t)inp.value=t.description||'';
  form.style.display='none';view.style.display='';if(btn)btn.style.display='';
}
function saveLineDescription(id){
  const inp=document.getElementById('descInput_'+id);if(!inp)return;
  const idx=transactions.findIndex(x=>x._id===id);if(idx<0)return;
  const val=String(inp.value||'').trim();
  transactions[idx]={...transactions[idx],description:val,lastReviewed:new Date().toISOString()};
  const view=document.getElementById('descView_'+id);if(view)view.textContent=val||'--';
  cancelLineDescription(id);
  saveAll();
  showToast('Description updated.');
}
function verificationStatusClass(status){const s=parseVerification(status);return 'status-'+(['ok','warn','err','journal','adjusting'].includes(s)?s:'unreviewed')}
// Recolor the whole Verification Status box/card to match the selected status.
// The dropdown itself stays neutral/readable; no separate badge is used.
// Replace whatever status-* class a node currently carries with `cls`. Generic on
// purpose: it strips ANY class beginning with "status-", so a future Verification
// Status flows through without listing it here.
function swapStatusClass(node,cls){if(!node)return;[...node.classList].forEach(c=>{if(c.indexOf('status-')===0)node.classList.remove(c);});if(cls)node.classList.add(cls);}
function applyVerificationStatusClass(el){if(!el)return;const id=el.dataset?.id;if(!id)return;const cls=verificationStatusClass(parseVerification(el.value));
  // Recolor the Verification section box AND the transaction card's left accent bar
  // so the status color is visible at a glance across many lines in a CV.
  swapStatusClass(document.getElementById('wp_vsection_'+id),cls);
  swapStatusClass(el.closest('.verification-card'),cls);
}
// Journal Entry / Adjusting Entry are non-taxable accounting entries, so VAT Category
// and ATC Code do not apply. When one of those statuses is selected we clear both
// fields, disable them (greyed out), and show a helper note. Switching back to a
// regular status re-enables the fields but intentionally leaves them blank — the user
// must re-select to avoid an accidental incorrect tax classification. The cleared
// values are persisted by the follow-up autosave (and enforced again in
// normalizeTransaction), keeping the treatment consistent everywhere.
function applyExemptEntryFieldLock(id){
  const statusEl=document.getElementById('wp_status_'+id);
  if(!statusEl)return;
  const exempt=['journal','adjusting'].includes(parseVerification(statusEl.value));
  const vatEl=document.getElementById('wp_vatcat_'+id);
  const atcEl=document.getElementById('wp_atc_'+id);
  const note=document.getElementById('wp_exemptnote_'+id);
  if(vatEl){if(exempt)vatEl.value='';vatEl.disabled=exempt;vatEl.classList.toggle('field-locked',exempt);}
  if(atcEl){if(exempt)atcEl.value='';atcEl.disabled=exempt;atcEl.classList.toggle('field-locked',exempt);}
  if(exempt)setAtcVatWarning(id,'');
  if(note)note.style.display=exempt?'':'none';
  updateWorkingTaxPreview(id);
}
function verificationSelect(t){const opts=[['unreviewed','Unreviewed'],['ok','Compliant'],['warn','Without Invoice'],['err','Non-Compliant'],['journal','Journal Entry'],['adjusting','Adjusting Entry']];return `<select class="select-small wp-status wp-autosave verification-status-select" data-id="${attr(t._id)}" id="wp_status_${attr(t._id)}" aria-label="Verification Status">${opts.map(([v,l])=>`<option value="${v}" ${t.manualStatus===v?'selected':''}>${l}</option>`).join('')}</select>`}
function supplierLookupSummary(t){const parts=[];if(t.address)parts.push(t.address);if(t.city)parts.push(t.city);if(t.zip)parts.push(t.zip);return parts.length?parts.join(', '):'--'}
// Characters the BIR DAT/Reliefs format accepts: A-Z, 0-9, space and . , & ( ) ' / -
const BIR_ALLOWED_RE=/^[A-Za-z0-9 .,&()'\/-]*$/;
function supplierFieldHasSpecial(value){const v=String(value??'').trim();if(!v)return false;return !BIR_ALLOWED_RE.test(v)}
// List the specific unsupported characters in a value, for a clear validation
// message. Smart quotes/dashes are first mapped to their ASCII equivalents (as
// birSanitize does), so only genuinely unrepresentable characters are reported
// (accented letters, symbols like # % * @ ₱ ™, emoji, etc.).
function birUnsupportedChars(value){
  const s=String(value??'').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[–—]/g,'-');
  const bad=[];const seen=new Set();
  for(const ch of s){if(ch===' '||ch==='\t')continue;if(BIR_ALLOWED_RE.test(ch))continue;if(seen.has(ch))continue;seen.add(ch);bad.push(ch)}
  return bad;
}
// Supplier fields actually written into each DAT export. QAP DAT outputs only the
// supplier NAME fields; SLP DAT also outputs registered address, city, and ZIP.
// Validation is therefore scoped to exactly the supplier fields a given DAT uses,
// and to nothing else on the dashboard.
function birDatSupplierFields(report){
  const nameFields=[['registeredName','Registered Name'],['lastName','Registered Last Name'],['firstName','Registered First Name'],['middleName','Registered Middle Name']];
  if(report==='qapDat'||report==='qapExcel')return nameFields;
  return nameFields.concat([['address','Registered Address'],['city','City'],['zip','ZIP Code']]);
}
// Block a DAT export when supplier info carries characters the BIR format cannot
// represent. Rows the user has explicitly flagged with a manual supplier override
// are respected (the user has taken responsibility) and exempt entries are skipped.
function birSupplierSpecialBlockers(rows,report){
  const fields=birDatSupplierFields(report);
  const issues=[];
  (rows||[]).forEach(t=>{
    if(typeof isExemptEntry==='function'&&isExemptEntry(t))return;
    if(t&&t.supplierManualOverride)return;
    const parts=[];
    fields.forEach(([key,label])=>{
      const val=t&&t[key];
      const chars=birUnsupportedChars(val);
      if(chars.length)parts.push(`${label} "${String(val||'').trim()}" → unsupported: ${chars.join(' ')}`);
    });
    if(parts.length)issues.push(birIssue(t.cv,t.voucherName,t.inv,'Supplier info has characters BIR cannot export — correct in Supplier Master (or enable Manual intervention on the line): '+parts.join('; ')));
  });
  return issues;
}
// Make any text safe for BIR export: transliterate accents (ñ->N, é->E…), drop
// unsupported characters, collapse spaces. Preserves as much of the original as possible.
function birSanitize(value){
  let s=String(value??'').normalize('NFKD').replace(/[̀-ͯ]/g,''); // strip diacritics
  s=s.replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[–—]/g,'-'); // smart punctuation -> ascii
  s=s.replace(/[^A-Za-z0-9 .,&()'\/-]/g,' ');                          // drop anything still unsupported
  return s.replace(/\s+/g,' ').trim();
}
// Per-field special-character check for the Supplier Master entry form.
function supplierSpecialFieldKeys(row){
  const checks=[['registeredName','Registered Name','mc_sup_registered'],['lastName','Last Name','mc_sup_last'],['firstName','First Name','mc_sup_first'],['middleName','Middle Name','mc_sup_middle'],['address','Registered Address','mc_sup_address'],['city','City','mc_sup_city'],['zip','ZIP Code','mc_sup_zip']];
  return checks.filter(([key])=>supplierFieldHasSpecial(row?.[key])).map(([key,label,inputId])=>({key,label,inputId}));
}
function supplierSpecialIssues(obj){const checks=[['supplier','Registered Name'],['registeredName','Registered Name'],['lastName','Registered Last Name'],['firstName','Registered First Name'],['middleName','Registered Middle Name'],['address','Registered Address'],['city','City'],['zip','ZIP Code']];const seen=new Set();const issues=[];checks.forEach(([key,label])=>{if(seen.has(label))return;const val=obj?.[key];if(supplierFieldHasSpecial(val)){seen.add(label);issues.push(label)}});return issues}
function specialFieldClass(value){return supplierFieldHasSpecial(value)?' special-review-field':''}
function supplierSpecialWarningHtml(t){const issues=supplierSpecialIssues(t);const manual=!!t.supplierManualOverride;if(!issues.length&&!manual)return '';const label=issues.length?`Special character review: ${issues.join(', ')}`:'Manual supplier override active';return `<div class="supplier-special-alert"><span><strong>${esc(label)}</strong><br/>TIN is excluded from this check. Review and correct supplier details before BIR exports if needed.</span><button type="button" class="btn" onclick="enableSupplierManualIntervention('${attr(t._id)}')">Manual intervention</button></div>`}
function enableSupplierManualIntervention(id){setValue('wp_supplier_manual_'+id,'1');const panel=document.getElementById('wp_supplier_panel_'+id);if(panel)panel.classList.add('visible');['wp_supplier_'+id,'wp_address_'+id,'wp_city_'+id,'wp_zip_'+id].forEach(fid=>{const el=document.getElementById(fid);if(el)el.removeAttribute('readonly')});setAutoSaveStatus(id,'Manual edit','warn');showToast('Manual supplier detail intervention enabled for this line.')}
function refreshSupplierFullAddress(id){setValue('wp_full_address_'+id,supplierLookupSummary({address:getValue('wp_address_'+id),city:getValue('wp_city_'+id),zip:getValue('wp_zip_'+id)}))}
function supplierSpecialCell(value){return `<td class="${supplierFieldHasSpecial(value)?'special-review-cell':''}">${esc(value||'--')}</td>`}
function loadSupplierMasterForEdit(tin){const s=findSupplierByTIN(tin);if(!s){showToast('Supplier Master row not found.');return}switchTab('masters');switchMasterSub('suppliers');setValue('mc_sup_tin',s.tin);setValue('mc_sup_registered',s.registeredName);setValue('mc_sup_last',s.lastName);setValue('mc_sup_first',s.firstName);setValue('mc_sup_middle',s.middleName);setValue('mc_sup_address',s.address);setValue('mc_sup_city',s.city);setValue('mc_sup_zip',s.zip);showToast('Supplier Master row loaded for manual correction.')}

function vatCategorySelect(t){const val=normalizeVATCategory(t.vatCategory);const locked=isExemptEntry(t);return `<select class="select-small wp-vatcat wp-autosave${locked?' field-locked':''}" data-id="${attr(t._id)}" id="wp_vatcat_${attr(t._id)}"${locked?' disabled':''}>${['','S','G','I','CG','SNQ','GNQ'].map(c=>`<option value="${c}" ${val===c?'selected':''}>${c?vatCategoryText(c):'Select code'}</option>`).join('')}</select>`}
// --- VAT Category <-> ATC Code compatibility rules (BIR) ---
// GNQ / G  cannot use WC 160 / WI 160.   S / SNQ cannot use WC 158 / WI 158.
function blockedAtcForVatCategory(cat){const c=normalizeVATCategory(cat);if(c==='G'||c==='GNQ')return ['WC 160','WI 160'];if(c==='S'||c==='SNQ')return ['WC 158','WI 158'];return []}
function isAtcAllowedForVatCategory(atcCode,cat){const code=normalizeATC(atcCode);if(!code)return true;return !blockedAtcForVatCategory(cat).includes(code)}
function atcVatConflictMessage(atcCode,cat){const code=normalizeATC(atcCode);const c=normalizeVATCategory(cat);const blocked=blockedAtcForVatCategory(c);if(!code||!blocked.length)return '';return `ATC Code ${code} is not allowed when VAT Category is ${c} (${vatCategoryText(c)}). ${blocked.join(' and ')} cannot be combined with ${c}. Choose a different ATC Code.`}
function atcMasterOptions(selected='',blocked=[]){const selectedCode=normalizeATC(selected);const blockedSet=new Set((blocked||[]).map(normalizeATC));const rows=(Array.isArray(atcMaster)?atcMaster:[]).map(normalizeAtcMaster).filter(a=>normalizeATC(a.atcCode));const seen=new Set();let opts=['<option value="">Select ATC Code</option>'];rows.forEach(a=>{const code=normalizeATC(a.atcCode);if(!code||seen.has(code))return;seen.add(code);const isBlocked=blockedSet.has(code);const label=`${atcText(code)}${a.rate!==null?' - '+a.rate+'%':''}${a.description?' · '+a.description:''}${isBlocked?' (not allowed for this VAT Category)':''}`;opts.push(`<option value="${attr(atcText(code))}" ${selectedCode===code?'selected':''} ${isBlocked?'disabled':''}>${esc(label)}</option>`)});if(selectedCode&&!seen.has(selectedCode))opts.push(`<option value="${attr(atcText(selectedCode))}" selected>${esc(atcText(selectedCode)+' - missing in ATC Master')}</option>`);return opts.join('')}
function atcCodeSelect(t){const blocked=blockedAtcForVatCategory(t.vatCategory);const locked=isExemptEntry(t);return `<select class="select-small mono wp-atc wp-autosave${locked?' field-locked':''}" data-id="${attr(t._id)}" id="wp_atc_${attr(t._id)}"${locked?' disabled':''}>${atcMasterOptions(t.atcCode,blocked)}</select>`}
function populateAddAtcDropdown(){const el=document.getElementById('f_atc_code');if(!el)return;const current=el.value;const blocked=blockedAtcForVatCategory(getValue('f_vat_category'));el.innerHTML=atcMasterOptions(current,blocked)}
// Add Transaction form: re-apply the VAT/ATC rule when the VAT Category changes.
function enforceAddAtcVatRule(){const catEl=document.getElementById('f_vat_category');const atcEl=document.getElementById('f_atc_code');if(!catEl||!atcEl)return;const cat=normalizeVATCategory(catEl.value);const current=normalizeATC(atcEl.value);const blocked=blockedAtcForVatCategory(cat);const invalid=current&&blocked.includes(current);if(invalid)showToast(atcVatConflictMessage(current,cat)+' It has been cleared.');atcEl.innerHTML=atcMasterOptions(invalid?'':current,blocked)}
/* ---- Invoice document management (Supporting Documents per transaction) ----
 * Metadata lives in the `invoiceDocuments` array (synced through the shared cloud
 * like every other dataset); file bytes live in a private Supabase Storage bucket
 * reached through window.vatDocStorage (defined in supabase-sync.js). Documents are
 * linked to a transaction by its persistent _id, so CV / invoice renames never break
 * the link. Display names are derived live from the transaction's current CV and
 * invoice number, so they stay correct after a CV rename. */
const DOC_MAX_BYTES=10*1024*1024;
const DOC_ALLOWED_EXT={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png'};
let docUploadTarget=null;              // {mode:'new',txnId} | {mode:'replace',docId}
const pendingDocUploads=new Map();     // uploadKey -> {txnId,fileName} (survives popup rebuilds)
function docsForTransaction(txnId){return invoiceDocuments.filter(d=>d.txnId===txnId).sort((a,b)=>String(a.uploadedAt).localeCompare(String(b.uploadedAt))||String(a._id).localeCompare(String(b._id)))}
function sanitizeFileToken(v){return String(v??'').normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^[-.]+|[-.]+$/g,'').slice(0,60)}
function invoiceDocDisplayName(d){const t=transactions.find(x=>x._id===d.txnId);const cv=sanitizeFileToken(t?.cv)||'NOCV';const inv=sanitizeFileToken(t?.inv)||'NOINV';const n=docsForTransaction(d.txnId).findIndex(x=>x._id===d._id)+1;return `${cv}_${inv}_${n>0?n:1}.${d.ext||'bin'}`}
function formatFileSize(b){b=Number(b||0);if(b>=1048576)return (b/1048576).toFixed(1)+' MB';return Math.max(1,Math.round(b/1024))+' KB'}
function docUploadDateText(iso){const d=new Date(String(iso||''));return Number.isNaN(d.getTime())?'':`${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`}
function docFileIconSvg(ext){const image=(ext==='jpg'||ext==='jpeg'||ext==='png');return image
  ?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>'
  :'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>'}
function validateDocFile(f){const ext=String(f.name.split('.').pop()||'').toLowerCase();
  if(!DOC_ALLOWED_EXT[ext])return{ok:false,msg:`"${f.name}" is not a supported file type. Use PDF, JPG, JPEG, or PNG.`};
  if(f.size>DOC_MAX_BYTES)return{ok:false,msg:`"${f.name}" is ${formatFileSize(f.size)} — the limit is 10 MB per file.`};
  return{ok:true,ext}}
// NOTE: buttons in this section intentionally carry NO id attribute — the CV popup's
// rebuild guard in renderCVReviewModal() skips re-rendering while an element WITH an
// id inside the popup has focus, and a clicked button must not suppress the rebuild
// that shows the updated document list.
function documentsSection(t){
  const docs=docsForTransaction(t._id);
  const pending=[...pendingDocUploads.values()].filter(p=>p.txnId===t._id);
  const docRows=docs.map(d=>`<div class="doc-row" data-doc-id="${attr(d._id)}">${docFileIconSvg(d.ext)}<div class="doc-info"><div class="doc-name">${esc(invoiceDocDisplayName(d))}</div><div class="doc-meta">${esc(d.originalName||'')}${d.fileSize?' · '+esc(formatFileSize(d.fileSize)):''}${d.uploadedByName?' · Uploaded by '+esc(d.uploadedByName):''}${docUploadDateText(d.uploadedAt)?' · '+esc(docUploadDateText(d.uploadedAt)):''}</div></div><div class="doc-row-actions action-buttons"><button type="button" class="btn btn-small" onclick="viewInvoiceDoc('${attr(d._id)}')">View</button><button type="button" class="btn btn-small" onclick="downloadInvoiceDoc('${attr(d._id)}')">Download</button><button type="button" class="btn btn-small" onclick="scanDocForTin('${attr(d._id)}')">Scan for TIN</button><button type="button" class="btn btn-small" onclick="startDocReplace('${attr(d._id)}')">Replace</button><button type="button" class="btn btn-small btn-danger" onclick="deleteInvoiceDoc('${attr(d._id)}')">Delete</button></div></div>`).join('');
  const pendingRows=pending.map(p=>`<div class="doc-row uploading">${docFileIconSvg('')}<div class="doc-info"><div class="doc-name">${esc(p.fileName)}</div><div class="doc-meta">Uploading to shared cloud…</div></div></div>`).join('');
  const list=(docRows||pendingRows)?docRows+pendingRows:'<div class="empty-state doc-empty">No supporting documents uploaded.</div>';
  return `<div class="docs-section" data-docs-txn="${attr(t._id)}">
    <div class="docs-section-title">Supporting documents <span class="doc-count">(${docs.length})</span></div>
    <div class="doc-list">${list}</div>
    <div class="doc-actions-row"><button type="button" class="btn btn-small" onclick="startDocUpload('${attr(t._id)}')">Upload document</button><span class="doc-hint">PDF, JPG, PNG · max 10 MB · shared with all users</span></div>
  </div>`;
}
// In-place refresh of just the documents block, so upload/delete feedback appears even
// while the popup's rebuild guard is active (user editing another field in the card).
function refreshDocsSections(txnId){
  document.querySelectorAll('.docs-section[data-docs-txn]').forEach(sec=>{
    if(sec.getAttribute('data-docs-txn')!==txnId)return;
    const t=transactions.find(x=>x._id===txnId);
    if(t)sec.outerHTML=documentsSection(t);
  });
  // Keep the document-coverage tracker in step with every upload/replace/delete.
  renderDocTrackerMetrics();
}
// ---- Supporting-document coverage tracker ----
// Pure and testable: given transaction lines and the invoice-document metadata array,
// compute coverage stats using the SAME txnId matching as docsForTransaction(). A line
// is "with documents" when at least one document's txnId equals its _id. Orphaned
// document metadata (txnId not present among the given lines) is ignored — it is never
// counted as a covered line, and its files are not added to the file total.
function documentCoverageStats(txns,docs){
  const list=Array.isArray(txns)?txns:[];
  const counts=new Map();
  (Array.isArray(docs)?docs:[]).forEach(d=>{const k=d&&d.txnId;if(k==null||k==='')return;counts.set(k,(counts.get(k)||0)+1)});
  let withDocs=0,totalFiles=0;
  list.forEach(t=>{const n=counts.get(t&&t._id)||0;if(n>0){withDocs++;totalFiles+=n}});
  const totalLines=list.length;
  const withoutDocs=totalLines-withDocs;
  const coveragePct=totalLines?Math.round((withDocs/totalLines)*100):0;
  return{totalLines,withDocs,withoutDocs,coveragePct,totalFiles};
}
// Render the tracker for the CURRENTLY SELECTED reporting period (follows the same
// visibleTransactionsForMonth() scope as the rest of the Purchase Transactions tab).
function renderDocTrackerMetrics(){
  const el=document.getElementById('docTrackerMetrics');
  if(!el)return;
  const s=documentCoverageStats(visibleTransactionsForMonth(),invoiceDocuments);
  const covClass=!s.totalLines?'':(s.coveragePct>=100?'ok':(s.coveragePct>0?'review':'warn'));
  el.innerHTML=`<div class="metric ${covClass}"><div class="metric-label">Document Coverage</div><div class="metric-value">${s.coveragePct}%</div><div class="metric-sub">${s.withDocs} of ${s.totalLines} transaction line(s)</div></div><div class="metric"><div class="metric-label">Lines With Documents</div><div class="metric-value">${s.withDocs}</div><div class="metric-sub">${s.withoutDocs} without documents</div></div><div class="metric"><div class="metric-label">Uploaded Files</div><div class="metric-value">${s.totalFiles}</div><div class="metric-sub">supporting document file(s)</div></div>`;
}
/* ---- Assisted OCR-based TIN extraction (browser-local, Option A) ----
 * Reads an already-uploaded supporting document ENTIRELY on the user's device:
 * text-based PDFs are read via pdf.js getTextContent() (no OCR); scanned PDFs and
 * images are OCR'd via tesseract.js (WASM) in the browser. No document bytes are ever
 * sent to an external OCR provider (only the OCR engine assets are fetched, and can be
 * self-hosted). Extracted text is transient and never saved. OCR results are SUGGESTIONS
 * only: the user reviews candidate TINs with surrounding context and explicitly confirms
 * before anything is written; a non-empty TIN is never overwritten without confirmation. */
const OCR_LIBS={
  tesseract:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  pdfjs:'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.min.js',
  pdfWorker:'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js'
};
const OCR_MAX_PDF_OCR_PAGES=5;    // OCR is CPU-heavy: cap scanned-PDF OCR to the first N pages
const OCR_MAX_PDF_TEXT_PAGES=20;  // cheap text-layer extraction cap for very long PDFs
let _tinScanState={txnId:null,docId:null,candidates:[]};
let _ocrLibsPromise=null;
function loadExternalScript(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=true;s.onload=()=>resolve();s.onerror=()=>reject(new Error('Failed to load '+src));document.head.appendChild(s)})}
async function ensureOcrLibs(){
  if(window.Tesseract&&window.pdfjsLib)return;
  if(!_ocrLibsPromise){
    _ocrLibsPromise=(async()=>{
      if(!window.pdfjsLib)await loadExternalScript(OCR_LIBS.pdfjs);
      if(window.pdfjsLib&&window.pdfjsLib.GlobalWorkerOptions)window.pdfjsLib.GlobalWorkerOptions.workerSrc=OCR_LIBS.pdfWorker;
      if(!window.Tesseract)await loadExternalScript(OCR_LIBS.tesseract);
    })().catch(err=>{_ocrLibsPromise=null;throw err});
  }
  return _ocrLibsPromise;
}
// PURE + TESTABLE: find Philippine TIN candidates in free text. Self-contained (no app
// deps). Returns [{normalized, digits, context, nearLabel}], deduped by digits, with
// TIN-labelled matches ranked first. A candidate is a 9-, 12-, or 14-digit number
// (base 9 + optional 3/5-digit branch). Never auto-selects; caller shows all for review.
function extractTinCandidates(text){
  const src=String(text||'');
  if(!src)return [];
  const found=new Map();
  const add=(matchText,index)=>{
    const digits=String(matchText).replace(/\D/g,'');
    if(!(digits.length===9||digits.length===12||digits.length===14))return;
    const before=src.slice(Math.max(0,index-24),index);
    const nearLabel=/tin\b|t\.?\s*i\.?\s*n\.?|tax\s*id/i.test(before);
    let normalized;
    if(digits.length===9)normalized=`${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6,9)}`;
    else if(digits.length===12)normalized=`${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6,9)}-${digits.slice(9,12)}`;
    else normalized=`${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6,9)}-${digits.slice(9)}`;
    const ctxStart=Math.max(0,index-35),ctxEnd=Math.min(src.length,index+String(matchText).length+35);
    const context=src.slice(ctxStart,ctxEnd).replace(/\s+/g,' ').trim();
    const existing=found.get(digits);
    if(existing){if(nearLabel&&!existing.nearLabel){existing.nearLabel=true;existing.context=context}return}
    found.set(digits,{normalized,digits,context,nearLabel});
  };
  let m;
  const grouped=/\d{3}[-\s.]\d{3}[-\s.]\d{3}(?:[-\s.]\d{3,5})?/g;
  while((m=grouped.exec(src)))add(m[0],m.index);
  const bare=/\d{9,14}/g;
  while((m=bare.exec(src))){const d=m[0].replace(/\D/g,'');if(d.length===9||d.length===12||d.length===14)add(m[0],m.index)}
  return [...found.values()].sort((a,b)=>(b.nearLabel?1:0)-(a.nearLabel?1:0));
}
async function fetchDocBlob(d){
  const url=await window.vatDocStorage.signedUrl(d.storagePath);
  const res=await fetch(url);
  if(!res.ok)throw new Error('Could not fetch the document ('+res.status+')');
  return await res.blob();
}
async function ocrRecognize(image){
  const worker=await window.Tesseract.createWorker('eng');
  try{const {data}=await worker.recognize(image);return (data&&data.text)||''}
  finally{try{await worker.terminate()}catch(e){}}
}
async function extractTextFromPdf(arrayBuffer){
  const pdf=await window.pdfjsLib.getDocument({data:arrayBuffer}).promise;
  const total=pdf.numPages;
  let text='';
  const textPages=Math.min(total,OCR_MAX_PDF_TEXT_PAGES);
  for(let p=1;p<=textPages;p++){const page=await pdf.getPage(p);const tc=await page.getTextContent();text+=' '+tc.items.map(i=>i.str).join(' ')}
  if(text.replace(/\s/g,'').length>=20)return text; // usable text layer -> no OCR needed
  // Scanned/image PDF: render the first N pages and OCR them.
  let ocrText='';
  const ocrPages=Math.min(total,OCR_MAX_PDF_OCR_PAGES);
  const worker=await window.Tesseract.createWorker('eng');
  try{
    for(let p=1;p<=ocrPages;p++){
      const page=await pdf.getPage(p);
      const viewport=page.getViewport({scale:2});
      const canvas=document.createElement('canvas');
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
      const {data}=await worker.recognize(canvas);
      ocrText+=' '+((data&&data.text)||'');
    }
  }finally{try{await worker.terminate()}catch(e){}}
  return ocrText;
}
async function scanDocForTin(docId){
  const d=invoiceDocuments.find(x=>x._id===docId);
  if(!d){showToast('Document record not found.');return}
  if(!docStorageReady())return;
  const t=transactions.find(x=>x._id===d.txnId);
  if(!t){showToast('This document is not linked to a transaction line.');return}
  showToast('Scanning on your device… the first run downloads the OCR engine.');
  try{
    await ensureOcrLibs();
    const blob=await fetchDocBlob(d);
    let text='';
    if(d.ext==='pdf'){text=await extractTextFromPdf(await blob.arrayBuffer())}
    else{text=await ocrRecognize(blob)}
    const candidates=extractTinCandidates(text);
    if(!candidates.length){showToast('No TIN candidate found.');return}
    _tinScanState={txnId:t._id,docId:d._id,candidates};
    openTinScanModal(d,t,candidates);
  }catch(err){console.error('TIN scan failed:',err);showToast('Scan failed: '+(err.message||err))}
}
function openTinScanModal(d,t,candidates){
  const modal=document.getElementById('tinScanModal'),body=document.getElementById('tinScanBody');
  if(!modal||!body)return;
  const curTin=t.tin?`<div class="tin-scan-note">This line already has TIN <strong>${esc(t.tin)}</strong>. Choosing a candidate will ask you to confirm before replacing it.</div>`:'';
  // Candidate values are NOT interpolated into inline handlers — buttons carry only an
  // index and are dispatched through delegated handleTinScanClick(). esc() guards text.
  const rows=candidates.map((c,i)=>`<div class="tin-candidate"><div class="tin-candidate-main"><span class="tin-candidate-value mono">${esc(c.normalized)}</span>${c.nearLabel?'<span class="badge badge-ok">near “TIN” label</span>':''}</div><div class="tin-candidate-context">…${esc(c.context)}…</div><div class="tin-candidate-actions"><button type="button" class="btn btn-small btn-primary" data-tin-index="${i}">Use this TIN</button></div></div>`).join('');
  body.innerHTML=`<div class="tin-scan-intro">Reviewed entirely on your device — nothing was uploaded to an external service. OCR results are <strong>suggestions</strong>, not verified tax data. Select the correct TIN for <strong>${esc(invoiceDocDisplayName(d))}</strong>.</div>${curTin}<div class="tin-candidate-list">${rows}</div>`;
  modal.classList.add('visible');modal.setAttribute('aria-hidden','false');
}
function closeTinScanModal(){
  const modal=document.getElementById('tinScanModal');
  if(modal){modal.classList.remove('visible');modal.setAttribute('aria-hidden','true')}
  const body=document.getElementById('tinScanBody');if(body)body.innerHTML='';
  _tinScanState={txnId:null,docId:null,candidates:[]};
}
function confirmTinCandidate(index){
  const st=_tinScanState,c=st.candidates[index];
  if(!c)return;
  const idx=transactions.findIndex(x=>x._id===st.txnId);
  if(idx<0){showToast('Transaction line no longer exists.');closeTinScanModal();return}
  if(normalizeTIN(c.normalized).length<9){showToast('That candidate is not a valid TIN.');return}
  const cur=transactions[idx];
  const curDigits=normalizeTIN(cur.tin),newDigits=normalizeTIN(c.normalized);
  if(curDigits&&curDigits===newDigits){showToast('This line already has that TIN.');closeTinScanModal();return}
  if(curDigits&&curDigits!==newDigits){ if(!confirm(`This line already has TIN ${cur.tin}. Replace it with ${c.normalized}?`))return; }
  // Write through the SAME path as manual entry: normalize, then Supplier Master lookup,
  // then persist via saveAll()/cloud-sync. Never marks compliance — status is untouched.
  let updated=normalizeTransaction({...cur,tin:c.normalized});
  const master=(!updated.supplierManualOverride)?findSupplierByTIN(updated.tin):null;
  if(master)updated=applySupplierToTransaction(updated,master);
  transactions[idx]=updated;
  saveAll();
  renderAll();
  closeTinScanModal();
  showToast(master?`TIN ${c.normalized} set and matched to Supplier Master.`:`TIN ${c.normalized} set. No Supplier Master match yet.`);
}
function handleTinScanClick(e){
  if(e.target.id==='tinScanModal'||e.target.closest('[data-close-tin-scan]')){closeTinScanModal();return}
  const btn=e.target.closest('[data-tin-index]');
  if(btn){const i=Number(btn.getAttribute('data-tin-index'));if(Number.isInteger(i))confirmTinCandidate(i)}
}
function docStorageReady(){if(window.vatDocStorage&&window.vatDocStorage.ready())return true;showToast('Log in to the shared cloud before working with documents.');return false}
function startDocUpload(txnId){
  if(!docStorageReady())return;
  const inp=document.getElementById('docFileInput');if(!inp)return;
  docUploadTarget={mode:'new',txnId};
  inp.multiple=true;inp.value='';inp.click();
}
function startDocReplace(docId){
  if(!docStorageReady())return;
  const inp=document.getElementById('docFileInput');if(!inp)return;
  docUploadTarget={mode:'replace',docId};
  inp.multiple=false;inp.value='';inp.click();
}
async function handleDocFileInput(e){
  const target=docUploadTarget;docUploadTarget=null;
  const files=[...(e.target.files||[])];e.target.value='';
  if(!target||!files.length)return;
  if(!docStorageReady())return;
  const valid=[];
  for(const f of files){const v=validateDocFile(f);if(!v.ok){showToast(v.msg);continue}valid.push({file:f,ext:v.ext})}
  if(!valid.length)return;
  if(target.mode==='replace'){await replaceInvoiceDocFile(target.docId,valid[0]);return}
  const txnId=target.txnId;
  if(!transactions.some(t=>t._id===txnId)){showToast('Transaction not found.');return}
  for(const {file,ext} of valid){
    const docId=makeId('doc');
    // Storage path is built ONLY from generated ids + sanitized extension (never from
    // the user's filename), so it is collision-proof and key-safe. The friendly
    // CV_INV_n name is derived at display/download time from the live transaction.
    const path=`txn/${txnId}/${docId}.${ext}`;
    const uploadKey=docId;
    pendingDocUploads.set(uploadKey,{txnId,fileName:file.name});
    refreshDocsSections(txnId);
    try{
      // Upload the object FIRST; metadata is only written after the file is safely
      // stored, so a synced record can never point at a missing file.
      await window.vatDocStorage.upload(path,file);
      const u=window.vatDocStorage.user();
      invoiceDocuments.push(normalizeInvoiceDocument({_id:docId,txnId,originalName:file.name,ext,mimeType:file.type||DOC_ALLOWED_EXT[ext],fileSize:file.size,storagePath:path,uploadedAt:new Date().toISOString(),uploadedBy:u.id,uploadedByName:u.name}));
      saveAll();
      showToast(`"${file.name}" uploaded and shared with all users.`);
    }catch(err){
      console.error('Document upload failed:',err);
      showToast(`Upload failed for "${file.name}": ${err.message||err}`);
    }finally{
      pendingDocUploads.delete(uploadKey);
      refreshDocsSections(txnId);
    }
  }
}
async function replaceInvoiceDocFile(docId,picked){
  const d=invoiceDocuments.find(x=>x._id===docId);
  if(!d){showToast('Document record not found.');return}
  const {file,ext}=picked;
  const oldPath=d.storagePath;
  // Never overwrite the old object in place: upload to a fresh path, switch the
  // record over, then clean up the old object best-effort. A concurrent viewer keeps
  // a working file at every moment, and a failed upload leaves the record untouched.
  const newPath=`txn/${d.txnId}/${d._id}_${Date.now().toString(36)}.${ext}`;
  pendingDocUploads.set(docId,{txnId:d.txnId,fileName:file.name});
  refreshDocsSections(d.txnId);
  try{
    await window.vatDocStorage.upload(newPath,file);
    const u=window.vatDocStorage.user();
    d.originalName=file.name;d.ext=ext;d.mimeType=file.type||DOC_ALLOWED_EXT[ext];d.fileSize=file.size;
    d.storagePath=newPath;d.uploadedAt=new Date().toISOString();d.uploadedBy=u.id;d.uploadedByName=u.name;
    saveAll();
    if(oldPath&&oldPath!==newPath)window.vatDocStorage.remove(oldPath).catch(err=>console.warn('Old document object cleanup skipped:',err&&err.message));
    showToast(`Document replaced with "${file.name}".`);
  }catch(err){
    console.error('Document replace failed:',err);
    showToast(`Replace failed for "${file.name}": ${err.message||err}`);
  }finally{
    pendingDocUploads.delete(docId);
    refreshDocsSections(d.txnId);
  }
}
async function viewInvoiceDoc(docId){
  const d=invoiceDocuments.find(x=>x._id===docId);
  if(!d){showToast('Document record not found.');return}
  if(!docStorageReady())return;
  // Open the window synchronously (popup-blocker safe), then point it at the signed URL.
  const w=window.open('','_blank');
  try{
    const url=await window.vatDocStorage.signedUrl(d.storagePath);
    if(w)w.location=url;else window.open(url,'_blank');
  }catch(err){
    if(w)w.close();
    console.error('Document view failed:',err);
    showToast('Could not open document: '+(err.message||err));
  }
}
async function downloadInvoiceDoc(docId){
  const d=invoiceDocuments.find(x=>x._id===docId);
  if(!d){showToast('Document record not found.');return}
  if(!docStorageReady())return;
  try{
    const url=await window.vatDocStorage.signedUrl(d.storagePath,invoiceDocDisplayName(d));
    const a=document.createElement('a');a.href=url;a.download=invoiceDocDisplayName(d);
    document.body.appendChild(a);a.click();a.remove();
  }catch(err){
    console.error('Document download failed:',err);
    showToast('Could not download document: '+(err.message||err));
  }
}
function deleteInvoiceDoc(docId){
  const d=invoiceDocuments.find(x=>x._id===docId);
  if(!d)return;
  if(!confirm(`Delete "${invoiceDocDisplayName(d)}"? This removes it for all users and cannot be undone.`))return;
  // Metadata first: the record is the UI's source of truth on every device, and its
  // tombstone guarantees it can never resurrect. The storage object removal is
  // best-effort — a failure only leaves an invisible orphaned file, never a listed
  // document whose View/Download would 404.
  invoiceDocuments=invoiceDocuments.filter(x=>x._id!==docId);
  saveAll();
  if(window.vatDocStorage&&window.vatDocStorage.ready())window.vatDocStorage.remove(d.storagePath).catch(err=>console.warn('Document object cleanup skipped:',err&&err.message));
  refreshDocsSections(d.txnId);
  showToast('Document deleted for all users.');
}
function workingDetailTable(g){
  if(!g.txns.length)return '<div class="empty-state" style="padding:16px">No purchase transaction rows for this CV.</div>';
  const vatInputClass=isBalanced(g.vatDiff)?'money-input':'money-input ledger-alert-input';
  const ewtInputClass=isBalanced(g.ewtDiff)?'money-input':'money-input ledger-alert-input';
  const cards=orderedGroupTransactions(g.txns).map(t=>{
    const reviewReasons=transactionReviewReasons(t);
    const reviewTitle=reviewTitleFromReasons(reviewReasons);
    return `<div class="verification-card ${verificationStatusClass(t.manualStatus)}${reviewReasons.length?' review-needed-card':''}"${reviewTitle?` title="${attr(reviewTitle)}"`:''}>
    <div class="verification-card-head">
      <div><div class="field-label">Description</div><div class="desc-edit-wrap" id="descWrap_${attr(t._id)}"><span class="readonly-desc" id="descView_${attr(t._id)}">${esc(t.description||'--')}</span><button type="button" class="btn btn-small desc-inline-edit-btn" id="descEditBtn_${attr(t._id)}" onclick="editLineDescription('${attr(t._id)}')">Edit</button><span class="desc-edit-form" id="descForm_${attr(t._id)}" style="display:none"><input type="text" class="edit-input desc-edit-input" id="descInput_${attr(t._id)}" value="${attr(t.description)}" placeholder="Description" aria-label="Description"/><button type="button" class="btn btn-small btn-primary" onclick="saveLineDescription('${attr(t._id)}')">Save</button><button type="button" class="btn btn-small" onclick="cancelLineDescription('${attr(t._id)}')">Cancel</button></span></div><div class="line-meta line-meta-grid"><span>Accounting Title: ${esc(t.accountingTitle||'--')}</span><span>Bank Account: ${esc(t.bankAccount||'--')}</span></div></div>
      <div class="action-buttons verification-actions-right"><button class="btn btn-small btn-danger wp-remove" data-id="${attr(t._id)}">Remove</button></div>
    </div>
    <div class="verification-line">
      <div class="verification-section section-supplier">
        <div class="verification-section-title">Supplier details</div>
        <div class="compact-grid">
          <div class="compact-field"><label>TIN</label><input class="edit-input tin-auto wp-autosave" id="wp_tin_${attr(t._id)}" data-id="${attr(t._id)}" value="${attr(t.tin)}" placeholder="TIN"/><div class="lookup-meta" id="wp_lookup_${attr(t._id)}">${findSupplierByTIN(t.tin)?'<span class="lookup-hit">Auto-matched</span>':(t.tin?'<span class="lookup-miss">No Supplier Master match</span>':'<span class="muted">Enter TIN to auto-fill</span>')}</div></div>
          <div class="compact-field"><label>Registered Name</label><input class="wide-input wp-autosave supplier-detail-input${specialFieldClass(t.supplier)}" data-id="${attr(t._id)}" id="wp_supplier_${attr(t._id)}" value="${attr(t.supplier)}" placeholder="Auto-filled from TIN" ${t.supplierManualOverride?'':'readonly'}/></div>
          <div class="compact-field span-2"><label>Address</label><input class="wide-input full-address-input${(supplierFieldHasSpecial(t.address)||supplierFieldHasSpecial(t.city)||supplierFieldHasSpecial(t.zip))?' special-review-field':''}" id="wp_full_address_${attr(t._id)}" value="${attr(supplierLookupSummary(t))}" placeholder="Auto-filled address, city, ZIP" readonly/></div>
          ${supplierSpecialWarningHtml(t)}
          <input type="hidden" id="wp_supplier_manual_${attr(t._id)}" value="${t.supplierManualOverride?'1':'0'}"/>
          <div class="supplier-manual-panel ${t.supplierManualOverride?'visible':''}" id="wp_supplier_panel_${attr(t._id)}"><div class="supplier-manual-note">Manual intervention stores these fields separately for future DAT/SLP references. TIN is not checked for special characters.</div><div class="compact-grid"><div class="compact-field"><label>Registered Address</label><input class="edit-input wp-autosave${specialFieldClass(t.address)}" data-id="${attr(t._id)}" id="wp_address_${attr(t._id)}" value="${attr(t.address)}" ${t.supplierManualOverride?'':'readonly'} oninput="refreshSupplierFullAddress('${attr(t._id)}')"/></div><div class="compact-field"><label>City</label><input class="edit-input wp-autosave${specialFieldClass(t.city)}" data-id="${attr(t._id)}" id="wp_city_${attr(t._id)}" value="${attr(t.city)}" ${t.supplierManualOverride?'':'readonly'} oninput="refreshSupplierFullAddress('${attr(t._id)}')"/></div><div class="compact-field"><label>ZIP</label><input class="edit-input wp-autosave${specialFieldClass(t.zip)}" data-id="${attr(t._id)}" id="wp_zip_${attr(t._id)}" value="${attr(t.zip)}" ${t.supplierManualOverride?'':'readonly'} oninput="refreshSupplierFullAddress('${attr(t._id)}')"/></div></div></div>
        </div>
      </div>
      <div class="verification-section section-tax">
        <div class="verification-section-title">Invoice and codes</div>
        <div class="compact-grid">
          <div class="compact-field"><label>Invoice Number</label><input class="edit-input wp-autosave" data-id="${attr(t._id)}" id="wp_inv_${attr(t._id)}" value="${attr(t.inv)}" placeholder="Invoice no."/></div>
          <div class="compact-field"><label>VAT Category</label>${vatCategorySelect(t)}</div>
          <div class="compact-field span-2"><label>ATC Code and Rate</label>${atcCodeSelect(t)}<div class="lookup-meta mono">Rate: ${esc(atcRateText(t.atcCode))}</div><div class="atc-vat-warning" id="wp_atcwarn_${attr(t._id)}" style="display:none"></div></div>
          <div class="compact-field span-2 exempt-entry-note" id="wp_exemptnote_${attr(t._id)}"${isExemptEntry(t)?'':' style="display:none"'}>VAT Category and ATC Code are not applicable for Journal Entries and Adjusting Entries.</div>
        </div>
      </div>
      <div class="verification-section section-amounts">
        <div class="verification-section-title">Computed amounts</div>
        <div class="compact-grid">
          <div class="compact-field"><label>Amount</label><input class="money-input wp-autosave" data-id="${attr(t._id)}" id="wp_amount_${attr(t._id)}" value="${attr(money(transactionAmount(t)))}"/></div>
          <div class="compact-field"><label>Computed VAT</label><input class="${vatInputClass}" id="wp_vat_${attr(t._id)}" value="${attr(money(t.vat))}" readonly/></div>
          <div class="compact-field"><label>Total (Amount + VAT)</label><input class="money-input" id="wp_total_${attr(t._id)}" value="${attr(money(transactionAmount(t)+Number(t.vat||0)))}" readonly/></div>
          <div class="compact-field"><label>Computed EWT</label><input class="${(ewtInputClass+(ewtRateMismatch(t)?' ledger-alert-input':''))}" id="wp_ewt_${attr(t._id)}" value="${attr(money(t.ewtAmount))}" readonly/></div>
        </div>
      </div>
      <div class="verification-section section-verification ${verificationStatusClass(t.manualStatus)}" id="wp_vsection_${attr(t._id)}">
        <div class="verification-section-title">Verification</div>
        <div class="compact-grid">
          <div class="compact-field"><label>Status</label>${verificationSelect(t)}</div>
          <div class="compact-field compact-note"><label>Notes</label><input class="note-input wp-autosave" data-id="${attr(t._id)}" id="wp_note_${attr(t._id)}" value="${attr(t.reviewNote)}" placeholder="Verification note"/></div>
        </div>
        ${documentsSection(t)}
      </div>
    </div>
  </div>`}).join('');
  return `<div class="verification-card-list">${cards}</div>`;
}

function addSupplierLine(cv){const base=transactions.find(t=>(t.cv||'(No CV Number)')===cv)||{};const voucherName=base.voucherName||cv;transactions.push(normalizeTransaction({_id:makeId('tx'),voucherName,cv:base.cv||cv,date:base.date||'--',description:'Supplier line for '+voucherName,amount:0,vatable:0,nonVatable:0,vat:0,total:0,ewtAmount:0,atcCode:'',manualStatus:'unreviewed',reviewNote:'Added during verification'}));openCVs.add(cv);saveAll();renderAll();showToast('Supplier line added. Fill in supplier, TIN, invoice, and amounts.')}
const tinLookupTimers={};
function autoLookupSupplierForRow(id,silent=true){const rawTin=getValue('wp_tin_'+id);const normalized=normalizeTIN(rawTin);const statusEl=document.getElementById('wp_lookup_'+id);if(!normalized){if(statusEl)statusEl.innerHTML='<span class="muted">Enter TIN to auto-fill</span>';const manual=getValue('wp_supplier_manual_'+id)==='1';if(!manual){setValue('wp_supplier_'+id,'');setValue('wp_address_'+id,'');setValue('wp_city_'+id,'');setValue('wp_zip_'+id,'')}setValue('wp_full_address_'+id,'');return false}const s=findSupplierByTIN(rawTin);if(!s){if(statusEl)statusEl.innerHTML='<span class="lookup-miss">No Supplier Master match</span>';setValue('wp_full_address_'+id,supplierLookupSummary({address:getValue('wp_address_'+id),city:getValue('wp_city_'+id),zip:getValue('wp_zip_'+id)}));if(!silent)showToast('No supplier found for this TIN. Add it in Master Data → Supplier Master first.');return false}setValue('wp_supplier_manual_'+id,'0');const panel=document.getElementById('wp_supplier_panel_'+id);if(panel)panel.classList.remove('visible');setValue('wp_tin_'+id,s.tin);setValue('wp_supplier_'+id,supplierDisplayName(s));setValue('wp_address_'+id,s.address);setValue('wp_city_'+id,s.city);setValue('wp_zip_'+id,s.zip);setValue('wp_full_address_'+id,supplierLookupSummary({address:s.address,city:s.city,zip:s.zip}));['wp_supplier_'+id,'wp_address_'+id,'wp_city_'+id,'wp_zip_'+id].forEach(fid=>{const el=document.getElementById(fid);if(el)el.setAttribute('readonly','readonly')});if(statusEl)statusEl.innerHTML='<span class="lookup-hit">Auto-matched Supplier Master</span>';if(!silent)showToast('Supplier details auto-filled from Supplier Master.');return true}
function queueSupplierLookupForRow(id){clearTimeout(tinLookupTimers[id]);tinLookupTimers[id]=setTimeout(()=>{if(normalizeTIN(getValue('wp_tin_'+id)).length>=9)autoLookupSupplierForRow(id,true)},350)}
const workingAutoSaveTimers={};
function setAutoSaveStatus(id,msg,type=''){
  const el=document.getElementById('wp_autosave_'+id);
  if(!el)return;
  el.textContent=msg;
  el.className='autosave-status'+(type?' '+type:'');
}
function queueAutoSaveWorkingRow(id,delay=450){
  clearTimeout(workingAutoSaveTimers[id]);
  setAutoSaveStatus(id,'Saving...','warn');
  workingAutoSaveTimers[id]=setTimeout(()=>autoSaveWorkingRow(id),delay);
}
function autoSaveWorkingRow(id){
  const ok=saveWorkingRow(id,{silent:true});
  if(ok)setTimeout(()=>setAutoSaveStatus(id,'Saved','saved'),0);
  else setTimeout(()=>setAutoSaveStatus(id,'Needs review','err'),0);
}
function fieldExists(id){return !!document.getElementById(id)}
function getValueOrFallback(id,fallback=''){const el=document.getElementById(id);return el?String(el.value??'').trim():String(fallback??'').trim()}
function getMoneyOrFallback(id,fallback=0){const el=document.getElementById(id);return el?parseMoney(el.value):Number(fallback||0)}
function setAtcVatWarning(id,msg){const el=document.getElementById('wp_atcwarn_'+id);if(!el)return;if(msg){el.textContent=msg;el.style.display='block'}else{el.textContent='';el.style.display='none'}}
// Enforce the VAT Category <-> ATC Code rule on the transaction popup. Rebuilds
// the ATC dropdown so invalid options are disabled; if the currently-selected
// ATC is now invalid for the chosen VAT Category, it is cleared and a warning is
// shown. Returns true if it cleared an invalid code.
function enforceAtcVatRule(id,opts={}){
  const catEl=document.getElementById('wp_vatcat_'+id);const atcEl=document.getElementById('wp_atc_'+id);
  if(!catEl||!atcEl)return false;
  const cat=normalizeVATCategory(catEl.value);
  const blocked=blockedAtcForVatCategory(cat);
  const current=normalizeATC(atcEl.value);
  const invalid=current&&blocked.includes(current);
  const conflictMsg=invalid?atcVatConflictMessage(current,cat):'';
  // Rebuild options (disabled state) keeping a valid selection, dropping an invalid one.
  atcEl.innerHTML=atcMasterOptions(invalid?'':current,blocked);
  if(invalid){
    setAtcVatWarning(id,conflictMsg+' The invalid ATC Code was cleared.');
    if(opts.notify!==false)showToast(conflictMsg+' It has been cleared.');
    return true;
  }
  setAtcVatWarning(id,'');
  return false;
}
function updateWorkingTaxPreview(id){
  const amount=getMoneyOrFallback('wp_amount_'+id,0);
  const vatCategory=normalizeVATCategory(getValueOrFallback('wp_vatcat_'+id,''));
  const vat=computeVATFromCategory(taxableBaseFromAmount(amount,vatCategory),vatCategory);
  const atcCode=normalizeATC(getValueOrFallback('wp_atc_'+id,''));
  const ewt=expectedEwtAmount({amount,atcCode});
  setValue('wp_vat_'+id,money(vat));
  setValue('wp_ewt_'+id,money(ewt));
  // Total is always Amount + VAT (EWT is shown/computed separately and never reduces Total).
  setValue('wp_total_'+id,money(amount+vat));
}
function saveWorkingRow(id,opts={}){
  const silent=!!opts.silent;
  const notify=msg=>{if(!silent)showToast(msg)};
  const index=transactions.findIndex(t=>t._id===id);
  if(index<0){notify('Transaction not found.');return false}
  const existing=transactions[index]||{};
  const inv=getValueOrFallback('wp_inv_'+id,existing.inv);
  let supplier=getValueOrFallback('wp_supplier_'+id,existing.supplier);
  let tin=getValueOrFallback('wp_tin_'+id,existing.tin);
  const manualOverride=getValueOrFallback('wp_supplier_manual_'+id,existing.supplierManualOverride?'1':'0')==='1';
  const rowMaster=tin?findSupplierByTIN(tin):null;
  if(tin&&rowMaster&&!manualOverride){
    autoLookupSupplierForRow(id,true);
    supplier=getValueOrFallback('wp_supplier_'+id,supplier);
    tin=getValueOrFallback('wp_tin_'+id,tin);
  }else if(tin&&!rowMaster){
    const statusEl=document.getElementById('wp_lookup_'+id);
    if(statusEl)statusEl.innerHTML='<span class="lookup-miss">No Supplier Master match</span>';
    notify('No supplier found for this TIN. Add it in Master Data → Supplier Master first.');
  }
  const status=parseVerification(getValueOrFallback('wp_status_'+id,existing.manualStatus));
  const rawAtc=getValueOrFallback('wp_atc_'+id,existing.atcCode);
  const atcCode=normalizeATC(rawAtc);
  if(rawAtc&&!atcCode){notify('ATC Code must use the format WC 160 or WI 160.');return false}
  if(status==='ok'&&(!inv||!supplier||!tin)){notify('For Compliant, fill in Registered supplier, TIN, and invoice number.');return false}
  const amount=getMoneyOrFallback('wp_amount_'+id,transactionAmount(existing));
  const vatCategory=normalizeVATCategory(getValueOrFallback('wp_vatcat_'+id,existing.vatCategory));
  // Block saving an invalid VAT Category + ATC Code combination.
  if(!isAtcAllowedForVatCategory(atcCode,vatCategory)){const msg=atcVatConflictMessage(atcCode,vatCategory);setAtcVatWarning(id,msg);notify(msg);return false}
  else setAtcVatWarning(id,'');
  const vatable=taxableBaseFromAmount(amount,vatCategory);
  const nonVatable=nonTaxableBaseFromAmount(amount,vatCategory);
  const vat=computeVATFromCategory(vatable,vatCategory);
  // Total Amount = Amount + VAT (same logic for imported and manual lines). EWT stays separate.
  const total=amount+vat;
  const master=findSupplierByTIN(tin);
  const base={...existing,supplier,tin,inv,description:existing.description,accountingTitle:existing.accountingTitle,bankAccount:existing.bankAccount,amount,vatable,nonVatable,vatCategory,vat,total,ewtAmount:expectedEwtAmount({amount,atcCode}),atcCode,manualStatus:status,reviewNote:getValueOrFallback('wp_note_'+id,existing.reviewNote),lastReviewed:new Date().toISOString(),address:getValueOrFallback('wp_address_'+id,existing.address),city:getValueOrFallback('wp_city_'+id,existing.city),zip:getValueOrFallback('wp_zip_'+id,existing.zip),supplierManualOverride:manualOverride};
  transactions[index]=(master&&!manualOverride)?applySupplierToTransaction(base,master):normalizeTransaction(base);
  saveAll();
  updateWorkingTaxPreview(id);
  if(!silent)renderAll();
  notify((master&&!manualOverride)?'Verification saved with Supplier Master details.':'Verification saved.');
  return true
}
function removeTransaction(id){
  // Cascade: a removed transaction takes its supporting documents with it (metadata
  // syncs/tombstones normally; storage object removal is best-effort cleanup).
  const docs=invoiceDocuments.filter(d=>d.txnId===id);
  transactions=transactions.filter(t=>t._id!==id);
  if(docs.length){
    invoiceDocuments=invoiceDocuments.filter(d=>d.txnId!==id);
    if(window.vatDocStorage&&window.vatDocStorage.ready())window.vatDocStorage.remove(docs.map(d=>d.storagePath)).catch(err=>console.warn('Document object cleanup skipped:',err&&err.message));
  }
  saveAll();renderAll();
  showToast('Transaction removed.'+(docs.length?' '+docs.length+' attached document(s) deleted.':''));
}
function ledgerRowsByCV(type){const rows=type==='vat'?visibleVatLedgerForMonth():visibleEwtLedgerForMonth();const groups=buildCVGroups();const byCv=new Map(groups.map(g=>[g.cv,g]));const search=(document.getElementById(type+'Search')?.value||'').toLowerCase();const filter=(document.getElementById(type+'BalanceFilter')?.value||'');const map=new Map();rows.forEach(r=>{const cv=r.cv||'(No CV Number)';if(!map.has(cv))map.set(cv,{cv,rows:[],ledgerAmount:0,purchaseAmount:0,diff:0});const g=map.get(cv);g.rows.push(r);g.ledgerAmount+=r.amount});byCv.forEach((g,cv)=>{if(!map.has(cv))map.set(cv,{cv,rows:[],ledgerAmount:0,purchaseAmount:0,diff:0});const item=map.get(cv);item.purchaseAmount=type==='vat'?g.bookVat:g.bookEwt;item.diff=item.purchaseAmount-item.ledgerAmount});let result=[...map.values()];result.forEach(item=>{item.diff=item.purchaseAmount-item.ledgerAmount;item.suppliers=compactList(item.rows.map(r=>r.supplier).concat((byCv.get(item.cv)?.txns||[]).map(t=>t.voucherName||t.supplier)));item.status=isBalanced(item.diff)?'balanced':'unbalanced'});if(search)result=result.filter(item=>String(item.cv).toLowerCase().includes(search)||String(item.suppliers).toLowerCase().includes(search)||item.rows.some(r=>ledgerSearchMatch(r,search)));if(filter)result=result.filter(item=>item.status===filter);return result.sort((a,b)=>String(a.cv).localeCompare(String(b.cv)))}
// ---- Ledger transaction management (VAT / EWT Balances) ----
// Expansion state per ledger type; persists across renders so an open CV stays open.
let openVatCVs=new Set(), openEwtCVs=new Set();
function ledgerOpenSet(type){return type==='vat'?openVatCVs:openEwtCVs;}
function ledgerArray(type){return type==='vat'?vatLedger:ewtLedger;}
function toggleLedgerCV(type,cv){const s=ledgerOpenSet(type);if(s.has(cv))s.delete(cv);else s.add(cv);renderLedgerSheet(type);}
function editLedgerRow(id){const form=document.getElementById('ledgerEditRow_'+id);if(!form)return;form.classList.remove('hidden');const view=document.getElementById('ledgerViewRow_'+id);if(view)view.classList.add('editing');const inp=document.getElementById('led_cv_'+id);if(inp)inp.focus();}
function cancelLedgerRow(id){const form=document.getElementById('ledgerEditRow_'+id);if(form)form.classList.add('hidden');const view=document.getElementById('ledgerViewRow_'+id);if(view)view.classList.remove('editing');}
function saveLedgerRow(id,type){
  const arr=ledgerArray(type);const idx=arr.findIndex(r=>r._id===id);
  if(idx<0){showToast('Ledger row not found.');return;}
  const g=fid=>{const el=document.getElementById(fid);return el?String(el.value||'').trim():'';};
  // Reuse normalizeLedger so the row keeps its exact stored shape; _id is preserved.
  const merged=normalizeLedger({...arr[idx],cv:g('led_cv_'+id),date:g('led_date_'+id)||'--',supplier:g('led_supplier_'+id),description:g('led_desc_'+id),amount:parseMoney(g('led_amount_'+id)),account:g('led_account_'+id),ref:g('led_ref_'+id)},type);
  merged._id=id;
  arr[idx]=merged;
  saveAll();renderAll();
  showToast(type.toUpperCase()+' ledger transaction updated.');
}
function deleteLedgerRow(id,type){
  const arr=ledgerArray(type);const row=arr.find(r=>r._id===id);if(!row)return;
  if(!confirm('Delete this '+type.toUpperCase()+' ledger transaction'+(row.cv?' for '+row.cv:'')+'? This cannot be undone.'))return;
  if(type==='vat')vatLedger=vatLedger.filter(r=>r._id!==id);else ewtLedger=ewtLedger.filter(r=>r._id!==id);
  saveAll();renderAll();
  showToast(type.toUpperCase()+' ledger transaction deleted.');
}
function ledgerEditFormHtml(r,type){
  const id=r._id;const amtLabel=(type==='vat'?'VAT':'EWT')+' Amount';
  const f=(lbl,fid,val,cls='')=>`<div class="compact-field"><label>${esc(lbl)}</label><input class="edit-input ${cls}" id="${attr(fid)}" value="${attr(val)}"/></div>`;
  return `<div class="ledger-edit-form"><div class="ledger-edit-grid">`
    +f('CV Number','led_cv_'+id,r.cv)
    +f('Date','led_date_'+id,r.date==='--'?'':r.date)
    +f('Supplier','led_supplier_'+id,r.supplier)
    +f('Description','led_desc_'+id,r.description)
    +f(amtLabel,'led_amount_'+id,money(r.amount),'money-input')
    +f('Account','led_account_'+id,r.account)
    +f('Reference','led_ref_'+id,r.ref)
    +`</div><div class="ledger-edit-actions"><button type="button" class="btn btn-small btn-primary" onclick="saveLedgerRow('${attr(id)}','${type}')">Save</button><button type="button" class="btn btn-small" onclick="cancelLedgerRow('${attr(id)}')">Cancel</button><button type="button" class="btn btn-small btn-danger" onclick="deleteLedgerRow('${attr(id)}','${type}')">Delete</button></div></div>`;
}
function renderLedgerSheet(type){
  const rows=ledgerRowsByCV(type);
  const allRows=type==='vat'?visibleVatLedgerForMonth():visibleEwtLedgerForMonth();
  const tx=visibleTransactionsForMonth();
  const purchaseTotal=tx.reduce((a,t)=>a+(type==='vat'?t.vat:t.ewtAmount),0);
  const ledgerTotal=allRows.reduce((a,r)=>a+r.amount,0);
  const diff=purchaseTotal-ledgerTotal;
  const prefix=type==='vat'?'vat':'ewt';const openSet=ledgerOpenSet(type);
  document.getElementById(prefix+'Metrics').innerHTML=`<div class="metric"><div class="metric-label">CV Groups</div><div class="metric-value">${rows.length}</div><div class="metric-sub">${allRows.length} uploaded balance rows</div></div><div class="metric"><div class="metric-label">Purchase ${type.toUpperCase()}</div><div class="metric-value" style="font-size:16px">${peso(purchaseTotal)}</div><div class="metric-sub">from Purchase Transactions</div></div><div class="metric"><div class="metric-label">${type.toUpperCase()} Balance</div><div class="metric-value" style="font-size:16px">${peso(ledgerTotal)}</div><div class="metric-sub">from Online Book ledger upload</div></div><div class="metric ${isBalanced(diff)?'ok':'err'}"><div class="metric-label">Difference</div><div class="metric-value" style="font-size:16px">${peso(diff)}</div><div class="metric-sub">vs uploaded ledger balance</div></div><div class="metric err"><div class="metric-label">Not Balanced</div><div class="metric-value">${rows.filter(r=>!isBalanced(r.diff)).length}</div><div class="metric-sub">CV groups</div></div><div class="metric ok"><div class="metric-label">Balanced</div><div class="metric-value">${rows.filter(r=>isBalanced(r.diff)).length}</div><div class="metric-sub">CV groups</div></div>`;
  document.getElementById(prefix+'Thead').innerHTML=`<tr><th style="width:12%">CV Number</th><th style="width:15%">Supplier / voucher</th><th style="width:16%">Description</th><th class="num" style="width:10%">Purchase ${type.toUpperCase()}</th><th class="num" style="width:10%">Uploaded Balance</th><th class="num" style="width:10%">Difference</th><th style="width:8%">Status</th><th style="width:6%">Ledger rows</th><th style="width:9%">References</th><th style="width:9%">Actions</th></tr>`;
  const tbody=document.getElementById(prefix+'Tbody'),tfoot=document.getElementById(prefix+'Tfoot');
  tbody.innerHTML='';
  if(!rows.length){tbody.innerHTML='<tr><td colspan="10"><div class="empty-state">No balance rows match your filters.</div></td></tr>';tfoot.innerHTML='';return}
  rows.forEach(item=>{
    const multi=item.rows.length>1;
    const open=multi?openSet.has(item.cv):true;
    const refs=compactList(item.rows.map(r=>r.ref),'--');
    const descs=compactList(item.rows.map(r=>r.description),'--');
    const tr=document.createElement('tr');
    tr.className='ledger-cv-row'+(multi?' ledger-cv-expandable clickable-row':'')+(multi&&open?' open':'');
    const cvCell=multi
      ? `<div class="ledger-cv-toggle"><svg class="chevron${open?' open':''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="9 18 15 12 9 6"/></svg><span class="mono">${esc(item.cv)}</span><span class="ledger-count-badge">${item.rows.length}</span></div>`
      : `<span class="mono">${esc(item.cv)}</span>`;
    tr.innerHTML=`<td>${cvCell}</td><td>${esc(item.suppliers)}</td><td class="ledger-desc-cell">${esc(descs)}</td><td class="num">${peso(item.purchaseAmount)}</td><td class="num">${peso(item.ledgerAmount)}</td><td class="num">${varianceBadge(item.diff)}</td><td>${item.status==='balanced'?badge('ok','Balanced'):badge('err','Not balanced')}</td><td>${item.rows.length}</td><td class="mono">${esc(refs)}</td><td></td>`;
    if(multi)tr.addEventListener('click',()=>toggleLedgerCV(type,item.cv));
    tbody.appendChild(tr);
    item.rows.forEach(r=>{
      const detail=document.createElement('tr');
      detail.id='ledgerViewRow_'+r._id;
      detail.className='ledger-detail-row'+(open?'':' hidden');
      detail.innerHTML=`<td></td><td>${esc(r.supplier||'--')}</td><td class="ledger-desc-cell">${esc(r.description||'--')}</td><td></td><td class="num">${peso(r.amount)}</td><td></td><td></td><td>${esc(r.account||'--')}</td><td class="mono">${esc(r.ref||'--')}</td><td class="ledger-actions-cell"><button type="button" class="btn btn-small ledger-edit-btn" onclick="editLedgerRow('${attr(r._id)}')">Edit</button><button type="button" class="btn btn-small btn-danger" onclick="deleteLedgerRow('${attr(r._id)}','${type}')">Delete</button></td>`;
      tbody.appendChild(detail);
      const form=document.createElement('tr');
      form.id='ledgerEditRow_'+r._id;
      form.className='ledger-edit-row hidden';
      form.innerHTML=`<td colspan="10">${ledgerEditFormHtml(r,type)}</td>`;
      tbody.appendChild(form);
    });
  });
  tfoot.innerHTML=`<tr><td colspan="3">Grand total</td><td class="num">${peso(purchaseTotal)}</td><td class="num">${peso(ledgerTotal)}</td><td class="num">${varianceBadge(diff)}</td><td colspan="4"></td></tr>`;
}
function renderVatBalances(){renderLedgerSheet('vat')}
function renderEwtBalances(){renderLedgerSheet('ewt')}

function dedupeVatCategories(){const map=new Map();VAT_CATEGORIES.map(normalizeVatCategoryMaster).filter(c=>c.code).forEach(c=>map.set(c.code,c));VAT_CATEGORIES=[...map.values()].sort((a,b)=>a.code.localeCompare(b.code))}
function dedupeAtcMaster(){const map=new Map();atcMaster.map(normalizeAtcMaster).filter(a=>normalizeATC(a.atcCode)).forEach(a=>map.set(normalizeATC(a.atcCode),a));atcMaster=[...map.values()].sort((a,b)=>atcText(a.atcCode).localeCompare(atcText(b.atcCode)))}
function addVatCategoryManual(){const code=normalizeVatCodeRaw(getValue('mc_vat_code'));if(!code){showToast('Enter a valid VAT Category code.');return}const label=getValue('mc_vat_label');if(!label){showToast('Enter the VAT Category description.');return}const rate=getValue('mc_vat_rate');const row=normalizeVatCategoryMaster({code,label,kind:getValue('mc_vat_kind'),rate});VAT_CATEGORIES=VAT_CATEGORIES.filter(c=>c.code!==row.code).concat(row);dedupeVatCategories();saveAll();renderAll();['mc_vat_code','mc_vat_label','mc_vat_rate'].forEach(id=>setValue(id,''));showToast('VAT Category saved.')}
function addAtcMasterManual(){const atcCode=normalizeATC(getValue('mc_atc_code'));if(!atcCode){showToast('ATC Code must use the format WC 160 or WI 160.');return}const rate=parseRate(getValue('mc_atc_rate'));if(rate===null){showToast('Enter the EWT rate percentage.');return}const row=normalizeAtcMaster({atcCode,rate,description:getValue('mc_atc_desc'),source:getValue('mc_atc_source')});atcMaster=atcMaster.filter(a=>normalizeATC(a.atcCode)!==row.atcCode).concat(row);dedupeAtcMaster();transactions=transactions.map(normalizeTransaction);saveAll();renderAll();['mc_atc_code','mc_atc_rate','mc_atc_desc','mc_atc_source'].forEach(id=>setValue(id,''));showToast('ATC Code saved.')}
function clearSupplierFieldErrors(){['mc_sup_registered','mc_sup_last','mc_sup_first','mc_sup_middle','mc_sup_address','mc_sup_city','mc_sup_zip'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('field-invalid')});const box=document.getElementById('mc_sup_validation');if(box){box.style.display='none';box.innerHTML=''}}
function addSupplierMasterManual(){
  clearSupplierFieldErrors();
  const tin=getValue('mc_sup_tin');if(!normalizeTIN(tin)){showToast('Enter the supplier TIN.');return}
  const row=normalizeSupplier({tin,registeredName:getValue('mc_sup_registered'),lastName:getValue('mc_sup_last'),firstName:getValue('mc_sup_first'),middleName:getValue('mc_sup_middle'),address:getValue('mc_sup_address'),city:getValue('mc_sup_city'),zip:getValue('mc_sup_zip')});
  // BIR compliance: block records with characters the BIR DAT format cannot accept.
  const badFields=supplierSpecialFieldKeys(row);
  if(badFields.length){
    badFields.forEach(f=>{const el=document.getElementById(f.inputId);if(el){el.classList.add('field-invalid');el.addEventListener('input',clearSupplierFieldErrors,{once:true})}});
    const box=document.getElementById('mc_sup_validation');
    const list=badFields.map(f=>esc(f.label)).join(', ');
    const msg=`<strong>Cannot save: unsupported characters for BIR Compliance Exports.</strong><div>The BIR DAT format only accepts letters, numbers, spaces and . , &amp; ( ) ' / - . Please correct: <strong>${list}</strong> (remove accents/symbols such as ñ, é, #, @, *, :, ;).</div>`;
    if(box){box.innerHTML=msg;box.style.display='block'}
    showToast('Supplier not saved: unsupported BIR characters in '+badFields.map(f=>f.label).join(', ')+'.');
    return;
  }
  supplierMaster=supplierMaster.filter(s=>normalizeTIN(s.tin)!==normalizeTIN(row.tin)).concat(row);dedupeSupplierMaster();saveAll();renderAll();['mc_sup_tin','mc_sup_registered','mc_sup_last','mc_sup_first','mc_sup_middle','mc_sup_address','mc_sup_city','mc_sup_zip'].forEach(id=>setValue(id,''));showToast('Supplier Master record saved.')
} 
function removeVatCategory(code){VAT_CATEGORIES=VAT_CATEGORIES.filter(c=>c.code!==code);saveAll();renderAll();showToast('VAT Category removed.')} 
function removeAtcMaster(code){const c=normalizeATC(code);atcMaster=atcMaster.filter(a=>normalizeATC(a.atcCode)!==c);saveAll();renderAll();showToast('ATC Code removed.')} 
function removeSupplierMaster(tin){const n=normalizeTIN(tin);supplierMaster=supplierMaster.filter(s=>normalizeTIN(s.tin)!==n);saveAll();renderAll();showToast('Supplier Master record removed.')}

function dedupeSupplierMaster(){const map=new Map();supplierMaster.map(normalizeSupplier).forEach(s=>{if(normalizeTIN(s.tin))map.set(normalizeTIN(s.tin),s)});supplierMaster=[...map.values()].sort((a,b)=>supplierDisplayName(a).localeCompare(supplierDisplayName(b))||a.tin.localeCompare(b.tin))}
function renderSuppliers(){dedupeSupplierMaster();const el=document.getElementById('supplierMetrics');if(el)el.innerHTML='';const search=(document.getElementById('supplierSearch')?.value||'').toLowerCase();let rows=supplierMaster;if(search)rows=rows.filter(s=>[s.tin,s.registeredName,s.lastName,s.firstName,s.middleName,s.address,s.city,s.zip].some(v=>String(v||'').toLowerCase().includes(search)));document.getElementById('supplierThead').innerHTML='<tr><th style="width:12%">TIN</th><th style="width:17%">Registered Name</th><th style="width:11%">Last Name</th><th style="width:11%">First Name</th><th style="width:10%">Middle Name</th><th style="width:18%">Registered Address</th><th style="width:8%">City</th><th style="width:6%">ZIP Code</th><th style="width:7%">Review</th><th style="width:7%">Action</th></tr>';const tbody=document.getElementById('supplierTbody'),tfoot=document.getElementById('supplierTfoot');tbody.innerHTML='';if(!rows.length){tbody.innerHTML='<tr><td colspan="10"><div class="empty-state">No supplier master rows match your search.</div></td></tr>';tfoot.innerHTML='';return}let flagged=0;rows.forEach(s=>{const issues=supplierSpecialIssues(s);if(issues.length)flagged++;const tr=document.createElement('tr');tr.innerHTML=`<td class="mono">${esc(s.tin)}</td>${supplierSpecialCell(s.registeredName)}${supplierSpecialCell(s.lastName)}${supplierSpecialCell(s.firstName)}${supplierSpecialCell(s.middleName)}${supplierSpecialCell(s.address)}${supplierSpecialCell(s.city)}${supplierSpecialCell(s.zip)}<td>${issues.length?badge('warn','Review'):'--'}</td><td><div class="action-buttons"><button class="btn btn-small" onclick="loadSupplierMasterForEdit('${attr(s.tin)}')">Edit</button><button class="btn btn-small btn-danger" onclick="removeSupplierMaster('${attr(s.tin)}')">Remove</button></div></td>`;tbody.appendChild(tr)});tfoot.innerHTML=`<tr><td colspan="10">${rows.length} supplier master record(s) shown. ${flagged?flagged+' record(s) need special character review.':'No supplier detail special character warnings.'}</td></tr>`}

function renderAtcMaster(){dedupeAtcMaster();const el=document.getElementById('atcMetrics');if(el)el.innerHTML='';const search=(document.getElementById('atcSearch')?.value||'').toLowerCase();let rows=atcMaster;if(search)rows=rows.filter(a=>[a.atcCode,a.description,a.source].some(v=>String(v||'').toLowerCase().includes(search)));document.getElementById('atcThead').innerHTML='<tr><th style="width:16%">ATC Code</th><th class="num" style="width:14%">EWT Rate</th><th style="width:44%">Description / nature of payment</th><th style="width:18%">Source / reference</th><th style="width:8%">Action</th></tr>';const tbody=document.getElementById('atcTbody'),tfoot=document.getElementById('atcTfoot');tbody.innerHTML='';if(!rows.length){tbody.innerHTML='<tr><td colspan="5"><div class="empty-state">No ATC master rows match your filters.</div></td></tr>';tfoot.innerHTML='';return}rows.forEach(a=>{const tr=document.createElement('tr');tr.innerHTML=`<td class="mono">${esc(atcText(a.atcCode))}</td><td class="num">${a.rate===null?'--':esc(String(a.rate))+'%'}</td><td>${esc(a.description||'--')}</td><td>${esc(a.source||'--')}</td><td><button class="btn btn-small btn-danger" onclick="removeAtcMaster('${attr(a.atcCode)}')">Remove</button></td>`;tbody.appendChild(tr)});tfoot.innerHTML=`<tr><td colspan="5">${rows.length} ATC master row(s) shown.</td></tr>`}

function renderVatCategories(){dedupeVatCategories();const el=document.getElementById('vatCategoryMetrics');if(el)el.innerHTML='';const search=(document.getElementById('vatCategorySearch')?.value||'').toLowerCase();let rows=VAT_CATEGORIES;if(search)rows=rows.filter(c=>[c.code,c.label,c.kind].some(v=>String(v||'').toLowerCase().includes(search)));document.getElementById('vatCategoryThead').innerHTML='<tr><th style="width:14%">VAT Category</th><th style="width:42%">Description</th><th style="width:22%">VAT Type</th><th class="num" style="width:12%">VAT Rate</th><th style="width:10%">Action</th></tr>';const tbody=document.getElementById('vatCategoryTbody'),tfoot=document.getElementById('vatCategoryTfoot');tbody.innerHTML='';if(!rows.length){tbody.innerHTML='<tr><td colspan="5"><div class="empty-state">No VAT Category rows match your search.</div></td></tr>';tfoot.innerHTML='';return}rows.forEach(c=>{const tr=document.createElement('tr');tr.innerHTML=`<td class="mono">${esc(c.code)}</td><td>${esc(c.label||'--')}</td><td>${esc(Number(c.rate||0)>0?'VAT Registered':'Not VAT Registered')}</td><td class="num">${fmt(c.rate)}%</td><td><button class="btn btn-small btn-danger" onclick="removeVatCategory('${attr(c.code)}')">Remove</button></td>`;tbody.appendChild(tr)});tfoot.innerHTML=`<tr><td colspan="5">VAT Category Codes decide whether Amount is vatable or non-vatable and compute VAT using the configured rate.</td></tr>`}

function exportVatCategoriesXLSX(){const rows=[['VAT Category','Description','VAT Type','VAT Rate']];VAT_CATEGORIES.forEach(c=>rows.push([c.code,c.label,Number(c.rate||0)>0?'VAT Registered':'Not VAT Registered',c.rate]));downloadXLSX(rows,'vat_categories_export.xlsx','VAT Categories');showToast('VAT Categories export downloaded.')}

function exportAtcMasterXLSX(){const rows=[['ATC Code','EWT Rate','Description','Database Reference']];atcMaster.map(normalizeAtcMaster).forEach(a=>rows.push([atcText(a.atcCode),a.rate===null?'':a.rate,a.description,a.source]));downloadXLSX(rows,'atc_master_export.xlsx','ATC Master');showToast('ATC Master export downloaded.')}

function exportSupplierXLSX(){const rows=[['TIN','Registered Name','Registered Last Name','Registered First Name','Registered Middle Name','Registered Address','City','ZIP Code']];supplierMaster.map(normalizeSupplier).forEach(s=>rows.push([s.tin,s.registeredName,s.lastName,s.firstName,s.middleName,s.address,s.city,s.zip]));downloadXLSX(rows,'supplier_master_export.xlsx','Supplier Master');showToast('Supplier Master export downloaded.')}
function safeDashboardRender(fnName){try{if(typeof window[fnName]==='function')window[fnName]()}catch(err){console.error('Render failed:',fnName,err);if(fnName==='renderBirCompliance')renderBirFallback(err)}}
// PERF: only render the tab the user is actually looking at. The previous version
// rebuilt all six tabs' DOM (Summary, Working, VAT, EWT, BIR, Masters) on every
// single change — even hidden ones — which was the main source of lag. switchTab()
// calls renderAll(), so the target tab is always rebuilt fresh the moment it is
// shown. Always-on pieces (the period/month tabs, the Add-panel ATC dropdown, and
// the toolbar buttons) still render every pass. No render logic is changed; only
// how many run per pass.
const TAB_RENDERERS={
  summary:['renderSummary'],
  working:['renderWorking'],
  vat:['renderVatBalances'],
  ewt:['renderEwtBalances'],
  bir:['renderBirCompliance'],
  masters:['renderVatCategories','renderAtcMaster','renderSuppliers'],
};
function renderAll(){
  invalidateVisibleCache();
  safeDashboardRender('renderMonthTabs');
  (TAB_RENDERERS[activeTab]||[]).forEach(safeDashboardRender);
  try{populateAddAtcDropdown()}catch(err){console.error('Render failed: populateAddAtcDropdown',err)}
  try{updateActionButtons()}catch(err){console.error('Render failed: updateActionButtons',err)}
}


function slpExcelPeriodEndDate(){
  const period=slpPeriodInfo();
  const [mm,dd,yyyy]=period.date.split('/').map(v=>Number(v));
  return new Date(yyyy,mm-1,dd);
}
function excelSerialFromDate(d){
  const utc=Date.UTC(d.getFullYear(),d.getMonth(),d.getDate());
  const epoch=Date.UTC(1899,11,30);
  return Math.round((utc-epoch)/86400000);
}
function formatTin9Hyphen(value){
  const tin=slpTin9(value);
  return tin.length===9?`${tin.slice(0,3)}-${tin.slice(3,6)}-${tin.slice(6,9)}`:tin;
}
function slpExcelSourceRows(){
  return birNonCashSourceRows();
}
function slpExcelSupplierAddress(t){
  return birSanitize([t.address,t.city,t.zip].map(v=>String(v||'').trim()).filter(Boolean).join(' '));
}
function slpExcelNameFields(t){
  const parts=slpSupplierNameParts(t);
  const individual=[parts.last,parts.first,parts.middle].filter(Boolean).join(', ');
  return {
    registeredName: birSanitize(parts.corp?parts.corp:''),
    individualName: birSanitize(parts.corp?'':(individual||String(t.supplier||'').trim()))
  };
}
function hasVatCategoryCode(t){return Boolean(normalizeVATCategory(t?.vatCategory))}
function hasAtcCode(t){return atcText(t?.atcCode)!=='--'}
function hasTaxClassification(t){return hasVatCategoryCode(t)||hasAtcCode(t)}
// Adjusting Entries are excluded from every BIR Compliance Export calculation.
function birEligibleTransactions(){return visibleTransactionsForMonth().filter(t=>!isAdjustingEntry(t));}
function birNonCashSourceRows(){
  return birEligibleTransactions().filter(t=>hasTaxClassification(t));
}
function birExcludedTaxClassificationRows(){
  return visibleTransactionsForMonth().filter(t=>!hasTaxClassification(t));
}
function birRowsForReportValidation(report){
  if(report==='cashBook')return birCashSourceRows();
  if(report==='qapExcel'||report==='qapDat')return ewtSourceRows();
  if(report==='slpExcel'||report==='slpDat')return slpExcelSourceRows();
  return birSourceRows();
}
function slpExcelBucketRow(t,monthSerial){
  const amount=transactionAmount(t);
  const vat=Number(t.vat||0);
  const b=slpDatAmountBuckets(t);
  const taxable=b.services+b.capital+b.goods;
  const grossTaxable=taxable+vat;
  const names=slpExcelNameFields(t);
  return [
    monthSerial,
    formatTin9Hyphen(t.tin),
    names.registeredName,
    names.individualName,
    slpExcelSupplierAddress(t),
    amount,
    b.exempt,
    b.zero,
    taxable,
    b.services,
    b.capital,
    b.goods,
    vat,
    grossTaxable
  ];
}
function slpExcelRows(){
  const period=slpPeriodInfo();
  const monthEnd=slpExcelPeriodEndDate();
  const monthSerial=excelSerialFromDate(monthEnd);
  const rows=[
    ['PURCHASE TRANSACTION','','','','','','','','','','','','',''],
    ['RECONCILIATION OF LISTING FOR ENFORCEMENT','','','','','','','','','','','','',''],
    ['','','','','','','','','','','','','',''],
    ['','','','','','','','','','','','','',''],
    ['','','','','','','','','','','','','',''],
    [`TIN : ${slpTin9(COMPANY_PROFILE.tin)}`,'','','','','','','','','','','','',''],
    [`OWNER\'S NAME: ${COMPANY_PROFILE.registeredName}`,'','','','','','','','','','','','',''],
    [`OWNER\'S TRADE NAME : ${COMPANY_PROFILE.tradeName}`,'','','','','','','','','','','','',''],
    [`OWNER\'S ADDRESS:  ${[COMPANY_PROFILE.address,COMPANY_PROFILE.cityZip].filter(Boolean).join(' ')}`,'','','','','','','','','','','','',''],
    ['','','','','','','','','','','','','',''],
    ['TAXABLE','TAXPAYER','REGISTERED NAME','NAME OF SUPPLIER',"SUPPLIER'S ADDRESS",'AMOUNT OF','AMOUNT OF','AMOUNT OF','AMOUNT OF','AMOUNT OF','AMOUNT OF','AMOUNT OF','AMOUNT OF','AMOUNT OF'],
    ['MONTH','IDENTIFICATION','','(Last Name, First Name, Middle Name)','','GROSS PURCHASE','EXEMPT PURCHASE','ZERO-RATED PURCHASE','TAXABLE PURCHASE','PURCHASE OF SERVICES','PURCHASE OF CAPITAL GOODS','PURCHASE OF GOODS OTHER THAN CAPITAL GOODS','INPUT TAX','GROSS TAXABLE PURCHASE'],
    ['','NUMBER','','','','','','','','','','','',''],
    ['(1)','(2)','(3)','(4)','(5)','(6)','(7)','(8)','(9)','(10)','(11)','(12)','(13)','(14)']
  ];
  const tx=slpExcelSourceRows();
  const totals={gross:0,exempt:0,zero:0,taxable:0,services:0,capital:0,goods:0,inputVat:0,grossTaxable:0};
  tx.forEach(t=>{
    const row=slpExcelBucketRow(t,monthSerial);
    rows.push(row);
    totals.gross+=Number(row[5]||0);
    totals.exempt+=Number(row[6]||0);
    totals.zero+=Number(row[7]||0);
    totals.taxable+=Number(row[8]||0);
    totals.services+=Number(row[9]||0);
    totals.capital+=Number(row[10]||0);
    totals.goods+=Number(row[11]||0);
    totals.inputVat+=Number(row[12]||0);
    totals.grossTaxable+=Number(row[13]||0);
  });
  rows.push(['','','','','','','','','','','','','','']);
  rows.push(['','','','','','','','','','','','','','']);
  rows.push(['Grand Total :','','','','',totals.gross,totals.exempt,totals.zero,totals.taxable,totals.services,totals.capital,totals.goods,totals.inputVat,totals.grossTaxable]);
  rows.push(['','','','','','','','','','','','','','']);
  rows.push(['END OF REPORT','','','','','','','','','','','','','']);
  return rows;
}
function showSLPExcelValidationIssues(issues){
  const preview=issues.slice(0,12).map(i=>`• ${i.cv} / ${i.voucher} / ${i.invoice}: missing ${i.missing.join(', ')}`).join('\n');
  const more=issues.length>12?`\n...and ${issues.length-12} more line(s).`:'';
  alert(`Cannot export SLP Excel yet. Complete Supplier Master / verification details for every exported line first.\n\n${preview}${more}`);
}
function downloadSLPExcelWorkbook(rows,name){
  if(!ensureXLSX())return;
  const cleanRows=rows.map(r=>r.map(v=>v==null?'':v));
  const ws=XLSX.utils.aoa_to_sheet(cleanRows);
  ws['!cols']=[
    {wch:12},{wch:16},{wch:38},{wch:38},{wch:54},{wch:16},{wch:16},{wch:18},{wch:18},{wch:20},{wch:22},{wch:34},{wch:16},{wch:22}
  ];
  ws['!merges']=[
    {s:{r:0,c:0},e:{r:0,c:13}},
    {s:{r:1,c:0},e:{r:1,c:13}},
    {s:{r:5,c:0},e:{r:5,c:13}},
    {s:{r:6,c:0},e:{r:6,c:13}},
    {s:{r:7,c:0},e:{r:7,c:13}},
    {s:{r:8,c:0},e:{r:8,c:13}}
  ];
  for(let r=14;r<cleanRows.length;r++){
    const cell=ws[XLSX.utils.encode_cell({r,c:0})];
    if(cell){cell.t='n';cell.z='m/d/yyyy'}
    for(let c=5;c<=13;c++){
      const moneyCell=ws[XLSX.utils.encode_cell({r,c})];
      if(moneyCell)moneyCell.z='#,##0.00';
    }
  }
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Sheet1');
  XLSX.writeFile(wb,name);
}
function exportSLPExcel(){
  if(activeMonth==='all'){showToast('Select one month before exporting SLP Excel.');return}
  const sourceRows=slpExcelSourceRows();
  if(!sourceRows.length){showToast('No SLP Excel rows to export for '+activeMonthLabel()+'.');return}
  const issues=validateSLPDatSourceRows(sourceRows);
  if(issues.length){showSLPExcelValidationIssues(issues);return}
  const rows=slpExcelRows();
  const period=slpPeriodInfo();
  const fileMonth=activeMonth.replace('-','_');
  downloadSLPExcelWorkbook(rows,`${slpTin9(COMPANY_PROFILE.tin)}_SLP_PURCHASES_${fileMonth}.xlsx`);
  showToast('Monthly SLP Excel exported for '+activeMonthLabel()+'.');
}

function slpDatQuote(value){const s=birSanitize(value).toUpperCase();return s?`"${s.replace(/"/g,'""')}"`:''}
function slpDatNum(value){const n=Number(value||0);return Number.isFinite(n)?n.toFixed(2):'0.00'}
function slpTin9(value){return normalizeTIN(value).slice(0,9)}
function slpSupplierNameParts(t){
  const last=String(t?.lastName||'').trim();
  const first=String(t?.firstName||'').trim();
  const middle=String(t?.middleName||'').trim();
  // A supplier is an INDIVIDUAL when individual name parts (last/first) exist.
  // Otherwise it is a corporation/partnership/non-individual identified by its
  // registered (corporate) name. This decides the DAT taxpayer-type formatting.
  const isIndividual=Boolean(last||first);
  const registered=String(t?.registeredName||'').trim();
  const corp=isIndividual?'':(registered||String(t?.supplier||'').trim());
  return{
    corp,
    last:isIndividual?last:'',
    first:isIndividual?first:'',
    middle:isIndividual?middle:'',
    isIndividual,
    hasName:Boolean(corp||last||first)
  };
}
function slpRegisteredName(t){
  const parts=slpSupplierNameParts(t);
  if(parts.corp)return birSanitize(parts.corp);
  return birSanitize([parts.last,parts.first,parts.middle].filter(Boolean).join(' ').trim());
}
function slpCityLine(t){return String(t?.city||'').trim()}
function validateSLPDatSourceRows(rows){
  const issues=[];
  rows.forEach((t,idx)=>{
    const missing=[];
    const tin=slpTin9(t.tin);
    const name=slpSupplierNameParts(t);
    if(tin.length!==9)missing.push('9-digit supplier TIN');
    if(!name.hasName)missing.push('supplier registered name or individual name');
    if(!String(t.address||'').trim())missing.push('registered address');
    if(!slpCityLine(t))missing.push('city');
    if(missing.length){
      issues.push({
        row:idx+1,
        cv:String(t.cv||'(No CV)').trim(),
        voucher:String(t.voucherName||'(No voucher)').trim(),
        invoice:String(t.inv||'(No invoice)').trim(),
        missing
      });
    }
  });
  return issues;
}
function showSLPDatValidationIssues(issues){
  const preview=issues.slice(0,12).map(i=>`• ${i.cv} / ${i.voucher} / ${i.invoice}: missing ${i.missing.join(', ')}`).join('\n');
  const more=issues.length>12?`\n...and ${issues.length-12} more line(s).`:'';
  alert(`Cannot export SLP DAT yet. Complete Supplier Master / verification details for every exported line first.\n\n${preview}${more}`);
}
function slpPeriodInfo(){
  let year='',month='';
  if(/^\d{4}-\d{2}$/.test(activeMonth)){year=activeMonth.slice(0,4);month=activeMonth.slice(5,7)}
  if(!year||!month){const row=visibleTransactionsForMonth()[0]||transactions[0]||{};const info=monthInfoFromDate(row.date);if(/^\d{4}-\d{2}$/.test(info.key)){year=info.key.slice(0,4);month=info.key.slice(5,7)}}
  if(!year||!month){const now=new Date();year=String(now.getFullYear());month=String(now.getMonth()+1).padStart(2,'0')}
  const end=new Date(Number(year),Number(month),0);
  const mm=String(end.getMonth()+1).padStart(2,'0');
  const dd=String(end.getDate()).padStart(2,'0');
  return{date:`${mm}/${dd}/${end.getFullYear()}`,token:`${mm}${end.getFullYear()}`};
}
function slpDatAmountBuckets(t){
  const amount=transactionAmount(t),vat=Number(t.vat||0),cat=normalizeVATCategory(t.vatCategory);
  const buckets={exempt:0,zero:0,services:0,capital:0,goods:0,inputVat:vat};
  if(cat==='S')buckets.services=amount;
  else if(cat==='CG')buckets.capital=amount;
  else if(cat==='G'||cat==='I')buckets.goods=amount;
  else if(cat==='SNQ'||cat==='GNQ'||!cat)buckets.exempt=amount;
  return buckets;
}
function slpDatRows(){
  const period=slpPeriodInfo();
  const companyTin=slpTin9(COMPANY_PROFILE.tin);
  const sourceRows=slpExcelSourceRows();
  const validationIssues=validateSLPDatSourceRows(sourceRows);
  if(validationIssues.length)return{lines:[],details:[],totals:null,period,companyTin,validationIssues};
  const detailMap=new Map();
  sourceRows.forEach(t=>{
    const tin=slpTin9(t.tin);
    const name=slpSupplierNameParts(t);
    const corp=name.corp;
    const last=name.last;
    const first=name.first;
    const middle=name.middle;
    const address=String(t.address||'').trim();
    const city=slpCityLine(t);
    const key=[tin,corp,last,first,middle,address,city].join('|');
    if(!detailMap.has(key))detailMap.set(key,{tin,corp,last,first,middle,address,city,exempt:0,zero:0,services:0,capital:0,goods:0,inputVat:0});
    const item=detailMap.get(key);const b=slpDatAmountBuckets(t);
    item.exempt+=b.exempt;item.zero+=b.zero;item.services+=b.services;item.capital+=b.capital;item.goods+=b.goods;item.inputVat+=b.inputVat;
  });
  const details=[...detailMap.values()].sort((a,b)=>(a.corp||a.last).localeCompare(b.corp||b.last)||a.tin.localeCompare(b.tin));
  const totals=details.reduce((a,r)=>{a.exempt+=r.exempt;a.zero+=r.zero;a.services+=r.services;a.capital+=r.capital;a.goods+=r.goods;a.inputVat+=r.inputVat;return a},{exempt:0,zero:0,services:0,capital:0,goods:0,inputVat:0});
  const header=['H',COMPANY_PROFILE.filingType,slpDatQuote(companyTin),slpDatQuote(COMPANY_PROFILE.registeredName),slpDatQuote(COMPANY_PROFILE.lastName),slpDatQuote(COMPANY_PROFILE.firstName),slpDatQuote(COMPANY_PROFILE.middleName),slpDatQuote(COMPANY_PROFILE.tradeName),slpDatQuote(COMPANY_PROFILE.address),slpDatQuote(COMPANY_PROFILE.cityZip),slpDatNum(totals.exempt),slpDatNum(totals.zero),slpDatNum(totals.services),slpDatNum(totals.capital),slpDatNum(totals.goods),slpDatNum(totals.inputVat),slpDatNum(totals.inputVat),slpDatNum(0),COMPANY_PROFILE.branchCode,period.date,COMPANY_PROFILE.taxRateCode].join(',');
  const lines=[header];
  details.forEach(r=>{lines.push(['D',COMPANY_PROFILE.filingType,slpDatQuote(r.tin),slpDatQuote(r.corp),slpDatQuote(r.last),slpDatQuote(r.first),slpDatQuote(r.middle),slpDatQuote(r.address),slpDatQuote(r.city),slpDatNum(r.exempt),slpDatNum(r.zero),slpDatNum(r.services),slpDatNum(r.capital),slpDatNum(r.goods),slpDatNum(r.inputVat),companyTin,period.date].join(','))});
  return{lines,details,totals,period,companyTin,validationIssues:[]};
}
function exportSLPDAT(){
  if(activeMonth==='all'){showToast('Select one month before exporting SLP DAT.');return}
  // Central gate also blocks supplier info with BIR-unsupported special characters.
  const gate=birValidationIssuesForExport('slpDat');
  if(gate.length){showBIRValidationIssues('Summary List of Purchases - DAT',gate);return}
  const dat=slpDatRows();
  if(dat.validationIssues&&dat.validationIssues.length){showSLPDatValidationIssues(dat.validationIssues);return}
  if(dat.details.length===0){showToast('No SLP DAT detail rows to export for '+activeMonthLabel()+'.');return}
  const text=dat.lines.join('\r\n')+'\r\n';
  const blob=new Blob([text],{type:'text/plain;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${dat.companyTin}P${dat.period.token}.DAT`;a.click();URL.revokeObjectURL(a.href);
  showToast('SLP DAT exported with validated supplier details and 9-digit TINs.');
}

function requireSingleMonthForBIR(label){
  if(activeMonth==='all'){
    showToast('Select one month before exporting '+label+'.');
    return false;
  }
  return true;
}
function birSourceRows(){return birNonCashSourceRows()}
function birCashSourceRows(){return birEligibleTransactions()}
function ewtSourceRows(){return birNonCashSourceRows().filter(t=>hasAtcCode(t)||Number(t.ewtAmount||0)>0)}
function birIssueKey(issue){return [issue.cv,issue.voucher,issue.invoice,issue.message].map(v=>String(v||'')).join('|')}
function dedupeBirIssues(issues){const seen=new Set();return (issues||[]).filter(i=>{const key=birIssueKey(i);if(seen.has(key))return false;seen.add(key);return true;});}
function birTransactionBlockersForReport(t,report){
  // Exempt entries carry no field requirements and never block an export.
  if(isExemptEntry(t))return [];
  const missing=[];
  if(!String(t.date||'').trim()||String(t.date||'').trim()==='--')missing.push('date');
  if(!String(t.cv||'').trim())missing.push('CV No.');
  if(!String(t.voucherName||'').trim())missing.push('voucher name');
  if(!(transactionAmount(t)>0))missing.push('amount');
  const needsSupplier=report==='slpExcel'||report==='slpDat'||report==='qapExcel'||report==='qapDat'||report==='purchaseBook';
  if(needsSupplier){
    if(slpTin9(t.tin).length!==9)missing.push('9-digit supplier TIN');
    if(!slpRegisteredName(t))missing.push('supplier registered name');
  }
  if(report==='slpExcel'||report==='slpDat'||report==='purchaseBook'){
    if(!String(t.address||'').trim())missing.push('registered address');
    if(!slpCityLine(t))missing.push('city');
  }
  if(report==='qapExcel'||report==='qapDat'){
    if(hasAtcCode(t)||Number(t.ewtAmount||0)>0){
      if(!hasAtcCode(t))missing.push('ATC Code');
      if(atcRateForCode(t.atcCode)===null)missing.push('ATC Master rate');
    }
  }
  if(report==='purchaseBook'){
    if(!String(t.accountingTitle||'').trim())missing.push('COA title / accounting title');
    if(!String(t.description||'').trim())missing.push('description');
  }
  if(report==='cashBook'){
    if(!String(t.accountingTitle||'').trim())missing.push('accounting title');
    if(!String(t.bankAccount||'').trim())missing.push('bank account');
    if(!String(t.description||'').trim())missing.push('description');
    if(!(Number(t.total||0)>0))missing.push('total amount');
  }
  return missing;
}
function birMonthWideBlockerIssues(report){
  if(activeMonth==='all')return [birIssue('Period','All Months','',`Select one month before exporting ${birReportLabel(report)}.`)];
  const rows=birRowsForReportValidation(report);
  const issues=[];
  rows.forEach(t=>{
    const missing=birTransactionBlockersForReport(t,report);
    if(missing.length)issues.push(birIssue(t.cv,t.voucherName,t.inv,'missing or unresolved '+missing.join(', ')));
  });
  return issues;
}
function qapPeriodText(){
  const info=slpPeriodInfo();
  return `${info.token.slice(0,2)}/${info.token.slice(2)}`;
}
function qapAtcCompact(code){return normalizeATC(code).replace(/\s+/g,'')}
function qapTinBranch(value){
  const digits=normalizeTIN(value);
  if(digits.length>=13)return digits.slice(9,13);
  if(digits.length>=12)return digits.slice(9,12).padStart(4,'0');
  return '0000';
}
function qapCompanyBranch(){return qapTinBranch(COMPANY_PROFILE.tin)}
function qapTextQuote(value){const s=birSanitize(value).toUpperCase();return `"${s.replace(/"/g,'""')}"`}
function qapDetailRows(){
  const period=qapPeriodText();
  const detailMap=new Map();
  ewtSourceRows().forEach(t=>{
    const names=slpSupplierNameParts(t);
    const tin=slpTin9(t.tin);
    const branch=qapTinBranch(t.tin);
    const atc=qapAtcCompact(t.atcCode);
    const rate=atcRateForCode(t.atcCode);
    const key=[tin,branch,names.corp,names.last,names.first,names.middle,period,atc,rate===null?'':rate].join('|');
    if(!detailMap.has(key))detailMap.set(key,{tin,branch,corp:names.corp,last:names.last,first:names.first,middle:names.middle,period,atc,rate:rate===null?0:rate,base:0,ewt:0,count:0});
    const item=detailMap.get(key);
    item.base+=transactionAmount(t);
    item.ewt+=Number(t.ewtAmount||0);
    item.count+=1;
  });
  return [...detailMap.values()].sort((a,b)=>(a.corp||a.last).localeCompare(b.corp||b.last)||a.tin.localeCompare(b.tin)||a.atc.localeCompare(b.atc));
}
function qapRows(){
  const rows=[['Record Type','Form','Sequence','Supplier TIN','Supplier Branch Code','Corporation Name','Last Name','First Name','Middle Name','Period','ATC Code','Rate','Tax Base Amount','Tax Withheld / EWT','Source Lines']];
  qapDetailRows().forEach((r,idx)=>rows.push(['D1','1601EQ',idx+1,r.tin,r.branch,r.corp,r.last,r.first,r.middle,r.period,r.atc,r.rate.toFixed(2),Number(r.base||0),Number(r.ewt||0),r.count]));
  return rows;
}
function qapFullTin(tin,branch){
  const base=formatTin9Hyphen(tin);
  const b=String(branch||'0000').replace(/\D/g,'').padStart(4,'0').slice(0,4);
  return base?`${base}-${b}`:b;
}
function qapNatureForCode(code){
  const found=atcLookup(code);
  return found&&found.description?found.description:'';
}
function qapExcelPeriodHeading(){
  const d=slpExcelPeriodEndDate();
  const month=d.toLocaleString('en-US',{month:'long'}).toUpperCase();
  return `FOR THE MONTH ENDING ${month} ${d.getDate()}, ${d.getFullYear()}`;
}
function qapExcelRows(){
  const monthEnd=slpExcelPeriodEndDate();
  const monthSerial=excelSerialFromDate(monthEnd);
  const details=qapDetailRows();
  const rows=[
    ['Attachment to BIR Form 1601-EQ','','','','','','','','','','','','','','','','','','','',''],
    ['MONTHLY ALPHABETICAL LIST OF PAYEES SUBJECTED TO EXPANDED WITHHOLDING TAX & PAYEES WHOSE INCOME PAYMENTS ARE EXEMPT','','','','','','','','','','','','','','','','','','','',''],
    [qapExcelPeriodHeading(),'','','','','','','','','','','','','','','','','','','',''],
    ['','','','','','','','','','','','','','','','','','','','',''],
    ['','','','','','','','','','','','','','','','','','','','',''],
    [`TIN : ${qapFullTin(slpTin9(COMPANY_PROFILE.tin),qapCompanyBranch())}`,'','','','','','','','','','','','','','','','','','','',''],
    [`WITHHOLDING AGENT'S NAME: ${COMPANY_PROFILE.registeredName}`,'','','','','','','','','','','','','','','','','','','',''],
    ['','','','','','','','','','','','','','','','','','','','',''],
    ['','','','','','','','','','','','','','','','','','','','',''],
    ['','','','','','','','','','','1ST MONTH OF THE QUARTER','','','2ND MONTH OF THE QUARTER','','','3RD MONTH OF THE QUARTER','','','TOTAL FOR THE QUARTER',''],
    ['SEQ','TAXPAYER','CORPORATION','INDIVIDUAL','ATC CODE','NATURE OF PAYMENT','','','','','AMOUNT OF','TAX RATE','AMOUNT OF','AMOUNT OF','TAX RATE','AMOUNT OF','AMOUNT OF','TAX RATE','AMOUNT OF','TOTAL','TOTAL'],
    ['NO','IDENTIFICATION','(Registered Name)','(Last Name, First Name, Middle Name)','','','','','','','INCOME PAYMENT','','TAX WITHHELD','INCOME PAYMENT','','TAX WITHHELD','INCOME PAYMENT','','TAX WITHHELD','INCOME PAYMENT','TAX WITHHELD'],
    ['','NUMBER','','','','','','','','','','','','','','','','','','',''],
    ['(1)','(2)','(3)','(4)','(5)','','','','','','(6)','(7)','(8)','(9)','(10)','(11)','(12)','(13)','(14)','(15)','(16)'],
    ['------------------------------','------------------------------','------------------------------','------------------------------','------------------------------','------------------------------','------------------------------','------------------------------','------------------------------','------------------------------','------------------------------','------------------------------','------------------------------','------------------------------','------------------------------','------------------------------','------------------------------','------------------------------','------------------------------','------------------------------','------------------------------']
  ];
  const totals={base:0,ewt:0};
  details.forEach((r,idx)=>{
    const name=[r.last,r.first,r.middle].filter(Boolean).join(', ');
    const base=Number(r.base||0);
    const ewt=Number(r.ewt||0);
    const rate=Number(r.rate||0);
    totals.base+=base; totals.ewt+=ewt;
    rows.push([
      idx+1,
      qapFullTin(r.tin,r.branch),
      r.corp||'',
      r.corp?'':name,
      r.atc,
      qapNatureForCode(r.atc),
      monthSerial,
      base,
      rate,
      ewt,
      base,
      rate,
      ewt,
      0,0,0,
      0,0,0,
      base,
      ewt
    ]);
  });
  rows.push(['','','','','','','------------------','------------------','------------------','------------------','------------------','------------------','------------------','------------------','------------------','------------------','------------------','------------------','------------------','------------------','------------------']);
  rows.push(['Grand Total :','','','','','',monthSerial,totals.base,'',totals.ewt,totals.base,'',totals.ewt,0,'',0,0,'',0,totals.base,totals.ewt]);
  return rows;
}
function downloadQAPExcelWorkbook(rows,name){
  if(!ensureXLSX())return;
  const cleanRows=rows.map(r=>r.map(v=>v==null?'':v));
  const ws=XLSX.utils.aoa_to_sheet(cleanRows);
  ws['!cols']=[
    {wch:8},{wch:20},{wch:42},{wch:42},{wch:12},{wch:62},
    {wch:12},{wch:16},{wch:10},{wch:16},{wch:16},{wch:10},{wch:16},
    {wch:16},{wch:10},{wch:16},{wch:16},{wch:10},{wch:16},{wch:18},{wch:18}
  ];
  ws['!merges']=[
    {s:{r:0,c:0},e:{r:0,c:20}},
    {s:{r:1,c:0},e:{r:1,c:20}},
    {s:{r:2,c:0},e:{r:2,c:20}},
    {s:{r:5,c:0},e:{r:5,c:20}},
    {s:{r:6,c:0},e:{r:6,c:20}}
  ];
  const moneyCols=[7,9,10,12,13,15,16,18,19,20];
  const rateCols=[8,11,14,17];
  for(let r=15;r<cleanRows.length;r++){
    const dateCell=ws[XLSX.utils.encode_cell({r,c:6})];
    if(dateCell&&typeof dateCell.v==='number'){dateCell.t='n';dateCell.z='m/d/yyyy'}
    moneyCols.forEach(c=>{const cell=ws[XLSX.utils.encode_cell({r,c})];if(cell&&cell.v!==''&&typeof cell.v==='number')cell.z='#,##0.00'});
    rateCols.forEach(c=>{const cell=ws[XLSX.utils.encode_cell({r,c})];if(cell&&cell.v!==''&&typeof cell.v==='number')cell.z='0.00'});
  }
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'QAP 1601EQ Schedule 1');
  XLSX.writeFile(wb,name);
}
function qapDatLines(){
  const period=slpPeriodInfo();
  const companyTin=slpTin9(COMPANY_PROFILE.tin);
  const companyBranch=qapCompanyBranch();
  const qapPeriod=qapPeriodText();
  const details=qapDetailRows();
  const totalBase=details.reduce((a,r)=>a+Number(r.base||0),0);
  const totalEwt=details.reduce((a,r)=>a+Number(r.ewt||0),0);
  const lines=[['HQAP','H1601EQ',companyTin,companyBranch,qapTextQuote(COMPANY_PROFILE.registeredName),qapPeriod,COMPANY_PROFILE.branchCode].join(',')];
  details.forEach((r,idx)=>{
    lines.push(['D1','1601EQ',idx+1,r.tin,r.branch,qapTextQuote(r.corp),qapTextQuote(r.last),qapTextQuote(r.first),qapTextQuote(r.middle),r.period,r.atc,r.rate.toFixed(2),slpDatNum(r.base),slpDatNum(r.ewt)].join(','));
  });
  lines.push(['C1','1601EQ',companyTin,companyBranch,qapPeriod,slpDatNum(totalBase),slpDatNum(totalEwt)].join(','));
  return{lines,period,companyTin,companyBranch,count:details.length,totalBase,totalEwt,details};
}
function exportQAP1601EQExcel(){
  if(!requireSingleMonthForBIR('QAP 1601EQ Schedule 1 Excel'))return;
  const issues=birValidationIssuesForExport('qapExcel');
  if(issues.length){showBIRValidationIssues('QAP 1601EQ Schedule 1 Excel',issues);return}
  const details=qapDetailRows();
  if(!details.length){showToast('No EWT rows to export for '+activeMonthLabel()+'.');return}
  const rows=qapExcelRows();
  const token=slpPeriodInfo().token;
  downloadQAPExcelWorkbook(rows,`${slpTin9(COMPANY_PROFILE.tin)}${qapCompanyBranch()}${token}1601EQ_QAP_Schedule1.xlsx`);
  showToast('QAP 1601EQ Schedule 1 Excel exported using the uploaded monthly template style.');
}
function exportQAP1601EQDAT(){
  if(!requireSingleMonthForBIR('QAP 1601EQ Schedule 1 DAT'))return;
  const issues=birValidationIssuesForExport('qapDat');
  if(issues.length){showBIRValidationIssues('QAP 1601EQ Schedule 1 DAT',issues);return}
  const dat=qapDatLines();
  if(!dat.count){showToast('No EWT rows to export for '+activeMonthLabel()+'.');return}
  const blob=new Blob([dat.lines.join('\r\n')+'\r\n'],{type:'text/plain;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${dat.companyTin}${dat.companyBranch}${dat.period.token}1601EQ.DAT`;a.click();URL.revokeObjectURL(a.href);
  showToast('QAP 1601EQ Schedule 1 DAT exported using the uploaded DAT reference format.');
}

function bookFullTin(value){
  const digits=String(value||'').replace(/\D/g,'');
  if(digits.length>=12)return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6,9)}-${digits.slice(9,12)}`;
  if(digits.length===9)return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6,9)}`;
  return String(value||'').trim();
}
function supplierBookAddress(t){return birSanitize([t.address,t.city,t.zip].map(v=>String(v||'').trim()).filter(Boolean).join(' '))}
function purchaseBookReference(t){return String(t.inv||t.invoiceNo||t.referenceNo||t.cv||'').trim()}
function parseBookDate(value){
  if(value instanceof Date&&!isNaN(value))return value;
  const raw=String(value||'').trim();
  if(!raw||raw==='--')return '';
  const numeric=Number(raw);
  if(Number.isFinite(numeric)&&numeric>20000&&numeric<70000){
    const epoch=Date.UTC(1899,11,30);
    return new Date(epoch+numeric*86400000);
  }
  const parsed=new Date(raw);
  if(!isNaN(parsed))return parsed;
  return raw;
}
function bookDateCell(value){
  const d=parseBookDate(value);
  if(d instanceof Date)return excelSerialFromDate(d);
  return d;
}
function bookPeriodLabel(){return activeMonth==='all'?'Selected Period':activeMonthLabel()}
function subsidiaryPurchaseBookDetailRow(t){
  const amount=transactionAmount(t);
  const vat=Number(t.vat||0);
  const vatable=Number(t.vatable||0);
  const nonVatable=Number(t.nonVatable||0);
  const gross=Number(t.total||0) || amount+vat;
  return [
    bookDateCell(t.date),
    bookFullTin(t.tin),
    slpRegisteredName(t),
    supplierBookAddress(t),
    purchaseBookReference(t),
    String(t.description||'').trim(),
    vatable>0?vatable:'',
    nonVatable>0?nonVatable:'',
    vat>0?vat:'',
    gross||'',
    String(t.coaCode||t.accountingCode||t.account_code||'').trim(),
    String(t.accountingTitle||'').trim(),
    '',
    ''
  ];
}
function subsidiaryPurchaseBookRows(){
  const rows=[
    ['','','','','','','','','','','','','',''],
    ['NAME:',`: ${COMPANY_PROFILE.bookName||'LOC&STOR 24/7, INC.'}`,'','','','','','','','','',''],
    ["OWNER'S ADDRESS",`: ${COMPANY_PROFILE.bookAddress||[COMPANY_PROFILE.address,COMPANY_PROFILE.cityZip].filter(Boolean).join(' ')}`,'','','','','','','','','',''],
    ['VAT Reg. TIN',`: ${formatTIN(COMPANY_PROFILE.bookTin||COMPANY_PROFILE.tin+'000')}`,'','SUBSIDIARY PURCHASE JOURNAL','','','','','','','',''],
    ['PERIOD',`: ${bookPeriodLabel()}`,'','','','','','','','','',''],
    ['PERMIT TO USE NO.',`: ${COMPANY_PROFILE.permitToUseNo||'XXXXXXXXXXXX'}`,'','','','','','','','','',''],
    ['','','','','0','','','','','','',''],
    ['DATE','TIN','VENDOR NAME','VENDOR ADDRESS','Reference No. *','DESCRIPTION','VATABLE AMOUNT','NON VATABLE AMOUNT','TAX AMOUNT','GROSS AMOUNT','COA CODE','COA TITLE','','']
  ];
  birSourceRows().forEach(t=>rows.push(subsidiaryPurchaseBookDetailRow(t)));
  return rows;
}
function downloadSubsidiaryPurchaseBookWorkbook(rows,name){
  if(!ensureXLSX())return;
  const cleanRows=rows.map(r=>r.map(v=>v==null?'':v));
  const ws=XLSX.utils.aoa_to_sheet(cleanRows);
  ws['!cols']=[{wch:13},{wch:18},{wch:34},{wch:48},{wch:24},{wch:55},{wch:16},{wch:18},{wch:16},{wch:16},{wch:14},{wch:34},{wch:10},{wch:10}];
  ws['!merges']=[{s:{r:3,c:3},e:{r:3,c:8}}];
  const range=XLSX.utils.decode_range(ws['!ref']||'A1:N1');
  for(let r=8;r<=range.e.r+1;r++){
    const dateCell=ws['A'+r];
    if(dateCell&&typeof dateCell.v==='number')dateCell.z='mm/dd/yyyy';
    ['G','H','I','J'].forEach(col=>{const cell=ws[col+r];if(cell&&cell.v!==''&&cell.v!=null)cell.z='#,##0.00';});
  }
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Purchase Journal');
  XLSX.writeFile(wb,name);
}
function cashBookReference(t){return String(t.cv||t.cvNo||t.cv_number||'').trim()}
function cashDisbursementBookDetailRow(t){
  const gross=Number(t.total||0) || transactionAmount(t)+Number(t.vat||0);
  const ewt=Number(t.ewtAmount||0);
  const withheld=ewt ? -Math.abs(ewt) : 0;
  const cashAmount=gross + withheld;
  return [
    bookDateCell(t.date),
    bookFullTin(t.tin)||'0',
    slpRegisteredName(t)||'',
    cashBookReference(t),
    String(t.description||'').trim(),
    cashAmount||'',
    withheld||0,
    gross||'',
    String(t.bankAccount||'').trim()
  ];
}
function cashDisbursementBookRows(){
  const details=birCashSourceRows().map(cashDisbursementBookDetailRow);
  const totals=details.reduce((a,r)=>{a.cash+=Number(r[5]||0);a.withheld+=Number(r[6]||0);a.gross+=Number(r[7]||0);return a},{cash:0,withheld:0,gross:0});
  const rows=[
    ['','','','','','','','',''],
    ['NAME:',`: ${COMPANY_PROFILE.bookName||'LOC&STOR 24/7, INC.'}`,'','','','','','',''],
    ["OWNER'S ADDRESS",`: ${COMPANY_PROFILE.bookAddress||[COMPANY_PROFILE.address,COMPANY_PROFILE.cityZip].filter(Boolean).join(' ')}`,'','','','','','',''],
    ['VAT Reg. TIN',`: ${formatTIN(COMPANY_PROFILE.bookTin||COMPANY_PROFILE.tin+'000')}`,'','CASH DISBURSEMENT JOURNAL','','','','',''],
    ['PERIOD',`: ${bookPeriodLabel()}`,'','','','','','',''],
    ['PERMIT TO USE NO.',`: ${COMPANY_PROFILE.permitToUseNo||'XXXXXXXXXXXX'}`,'','','','','','',''],
    ['','','','0','',totals.cash,totals.withheld,totals.gross,''],
    ['DATE','TIN','VENDOR NAME','CDJ (CV number)','DESCRIPTION','CASH ACCOUNT','WITHHELD TAX','GROSS AMOUNT','Cash Account']
  ];
  details.forEach(r=>rows.push(r));
  return rows;
}
function downloadCashDisbursementBookWorkbook(rows,name){
  if(!ensureXLSX())return;
  const cleanRows=rows.map(r=>r.map(v=>v==null?'':v));
  const ws=XLSX.utils.aoa_to_sheet(cleanRows);
  ws['!cols']=[{wch:13},{wch:18},{wch:34},{wch:24},{wch:60},{wch:16},{wch:16},{wch:16},{wch:42}];
  ws['!merges']=[{s:{r:3,c:3},e:{r:3,c:7}}];
  const range=XLSX.utils.decode_range(ws['!ref']||'A1:I1');
  for(let r=9;r<=range.e.r+1;r++){
    const dateCell=ws['A'+r];
    if(dateCell&&typeof dateCell.v==='number')dateCell.z='mm/dd/yyyy';
    ['F','G','H'].forEach(col=>{const cell=ws[col+r];if(cell&&cell.v!==''&&cell.v!=null)cell.z='#,##0.00';});
  }
  ['F7','G7','H7'].forEach(addr=>{if(ws[addr])ws[addr].z='#,##0.00';});
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Disbursement Journal');
  XLSX.writeFile(wb,name);
}
function exportSubsidiaryPurchaseBookExcel(){
  if(!requireSingleMonthForBIR('Subsidiary Purchase Book'))return;
  const issues=birValidationIssuesForExport('purchaseBook');
  if(issues.length){showBIRValidationIssues('Subsidiary Purchase Book',issues);return}
  const rows=subsidiaryPurchaseBookRows();
  if(rows.length<=8){showToast('No purchase rows to export for '+activeMonthLabel()+'.');return}
  downloadSubsidiaryPurchaseBookWorkbook(rows,`${slpTin9(COMPANY_PROFILE.tin)}_Subsidiary_Purchase_Book_${slpPeriodInfo().token}.xlsx`);
  showToast('Subsidiary Purchase Book exported using the uploaded template layout.');
}
function exportCashDisbursementBookExcel(){
  if(!requireSingleMonthForBIR('Cash Disbursement Book'))return;
  const issues=birValidationIssuesForExport('cashBook');
  if(issues.length){showBIRValidationIssues('Cash Disbursement Book',issues);return}
  const rows=cashDisbursementBookRows();
  if(rows.length<=8){showToast('No cash disbursement rows to export for '+activeMonthLabel()+'.');return}
  downloadCashDisbursementBookWorkbook(rows,`${slpTin9(COMPANY_PROFILE.tin)}_Cash_Disbursement_Book_${slpPeriodInfo().token}.xlsx`);
  showToast('Cash Disbursement Book exported using the uploaded template layout.');
}


function exportBIRComplianceIndexXLSX(){
  const rows=[['Export','Source','Month Requirement','Status / Notes'],['SLP Excel','Purchase Transactions + Supplier Master','Specific month only','Excludes rows missing both VAT Category and ATC Code; template-aligned monthly SLP workbook'],['SLP DAT','Purchase Transactions + Supplier Master','Specific month only','Excludes rows missing both VAT Category and ATC Code; DAT follows uploaded sample and validates supplier details'],['QAP 1601EQ Schedule 1 Excel','EWT rows from Purchase Transactions + ATC Master','Specific month only','Excludes rows missing both VAT Category and ATC Code; template-aligned monthly QAP Excel export'],['QAP 1601EQ Schedule 1 DAT','EWT rows from Purchase Transactions + ATC Master','Specific month only','Excludes rows missing both VAT Category and ATC Code; DAT follows uploaded HQAP/D1/C1 sample format'],['Subsidiary Purchase Book','Purchase Transactions','Specific month only','Excludes rows missing both VAT Category and ATC Code; template-aligned purchase journal layout'],['Cash Disbursement Book','Purchase Transactions','Specific month only','Lenient exception: includes rows even if both VAT Category and ATC Code are blank']];
  downloadXLSX(rows,'bir_compliance_export_index.xlsx','BIR Compliance');
  showToast('BIR Compliance export index downloaded.');
}
function selectBirReport(report){
  activeBirReport=report||'slpExcel';
  renderBirCompliance();
}
function birReportLabel(report){
  return ({slpExcel:'Summary List of Purchases — Excel',slpDat:'Summary List of Purchases — DAT',qapExcel:'QAP 1601EQ Schedule 1 — Excel',qapDat:'QAP 1601EQ Schedule 1 — DAT',purchaseBook:'Subsidiary Purchase Book',cashBook:'Cash Disbursement Book'})[report]||'Summary List of Purchases — Excel';
}
function birReportExportFn(report){
  return ({slpExcel:'exportSLPExcel',slpDat:'exportSLPDAT',qapExcel:'exportQAP1601EQExcel',qapDat:'exportQAP1601EQDAT',purchaseBook:'exportSubsidiaryPurchaseBookExcel',cashBook:'exportCashDisbursementBookExcel'})[report]||'exportSLPExcel';
}
function birIssue(cv,voucher,invoice,message){return{cv:String(cv||'(No CV)'),voucher:String(voucher||'(No voucher)'),invoice:String(invoice||'(No invoice)'),message}}
function validateQAPSourceRows(rows){
  const issues=[];
  rows.forEach(t=>{
    const missing=[];
    if(slpTin9(t.tin).length!==9)missing.push('9-digit supplier TIN');
    if(!slpRegisteredName(t))missing.push('supplier registered name');
    if(!atcText(t.atcCode)||atcText(t.atcCode)==='--')missing.push('ATC Code');
    const rate=atcRateForCode(t.atcCode);
    if(rate===null)missing.push('ATC Master rate');
    if(!(transactionAmount(t)>0))missing.push('amount');
    if(missing.length)issues.push(birIssue(t.cv,t.voucherName,t.inv,'missing '+missing.join(', ')));
  });
  return issues;
}


function makeBirAttentionRows(issues,headerCount){
  const count=Math.max(Number(headerCount||0),5);
  return (issues||[]).map(i=>{
    const row=['Attention Needed',`CV: ${i.cv||''}`,`Voucher: ${i.voucher||''}`,`Invoice: ${i.invoice||''}`,i.message||'Issue found'];
    while(row.length<count)row.push('');
    return row.slice(0,count);
  });
}
function validateBookSourceRows(rows,kind){
  const issues=[];
  rows.forEach(t=>{
    const missing=[];
    if(!String(t.date||'').trim()||String(t.date||'').trim()==='--')missing.push('date');
    if(!String(t.cv||'').trim())missing.push('CV No.');
    if(!String(t.voucherName||'').trim())missing.push('voucher name');
    if(kind==='purchase'){
      if(bookFullTin(t.tin).replace(/\D/g,'').length<9)missing.push('supplier TIN');
      if(!slpRegisteredName(t))missing.push('vendor name');
      if(!supplierBookAddress(t))missing.push('vendor address');
      if(!String(t.accountingTitle||'').trim())missing.push('COA title / accounting title');
      if(!String(t.description||'').trim())missing.push('description');
    }
    if(kind==='cash'){
      if(!String(t.accountingTitle||'').trim())missing.push('accounting title');
      if(!String(t.bankAccount||'').trim())missing.push('bank account');
      if(!String(t.description||'').trim())missing.push('description');
      if(!(Number(t.total||0)>0))missing.push('total amount');
    }
    if(!(transactionAmount(t)>0))missing.push('amount');
    if(missing.length)issues.push(birIssue(t.cv,t.voucherName,t.inv,'missing '+missing.join(', ')));
  });
  return issues;
}
function birPreviewPayload(report){
  let headers=[],rows=[],issues=[],note='',sourceCount=0;
  const monthWarn=activeMonth==='all'?'Select one month before exporting this report. Preview may still show current filtered data.':'';
  if(report==='slpExcel'){
    const source=slpExcelSourceRows();sourceCount=source.length;issues=validateSLPDatSourceRows(source).map(i=>birIssue(i.cv,i.voucher,i.invoice,'missing '+i.missing.join(', ')));
    headers=['Taxable Month','Supplier TIN','Registered Name','Name of Supplier','Supplier Address','Gross Purchase','Exempt Purchase','Taxable Purchase','Services','Capital Goods','Other Goods','Input Tax','Gross Taxable'];
    const monthSerial=excelSerialFromDate(slpExcelPeriodEndDate());
    rows=source.slice(0,25).map(t=>{const r=slpExcelBucketRow(t,monthSerial);return [activeMonthLabel(),r[1],r[2],r[3],r[4],peso(r[5]),peso(r[6]),peso(r[8]),peso(r[9]),peso(r[10]),peso(r[11]),peso(r[12]),peso(r[13])];});
    note='Preview excludes rows missing both VAT Category and ATC Code, then validates exported SLP lines so reports cannot download partially.';
  }else if(report==='slpDat'){
    const dat=slpDatRows();sourceCount=(dat.details||[]).length;issues=(dat.validationIssues||[]).map(i=>birIssue(i.cv,i.voucher,i.invoice,'missing '+i.missing.join(', ')));
    headers=['Record','Filing','Supplier TIN','Registered Name','Address','City','Exempt','Services','Capital Goods','Other Goods','Input VAT'];
    rows=(dat.details||[]).slice(0,25).map(r=>['D',COMPANY_PROFILE.filingType,r.tin,r.corp||[r.last,r.first,r.middle].filter(Boolean).join(', '),r.address,r.city,peso(r.exempt),peso(r.services),peso(r.capital),peso(r.goods),peso(r.inputVat)]);
    note='Preview excludes rows missing both VAT Category and ATC Code, then validates exported SLP DAT lines so reports cannot download partially.';
  }else if(report==='qapExcel'){
    const source=ewtSourceRows();sourceCount=source.length;issues=validateQAPSourceRows(source);
    const details=qapDetailRows();
    headers=['Seq','Taxpayer Identification Number','Corporation / Individual','ATC Code','Nature of Payment','Income Payment','Tax Rate','Tax Withheld','Total Income Payment','Total Tax Withheld'];
    rows=details.slice(0,25).map((r,idx)=>[idx+1,qapFullTin(r.tin,r.branch),r.corp||[r.last,r.first,r.middle].filter(Boolean).join(', '),r.atc,qapNatureForCode(r.atc),peso(r.base),r.rate.toFixed(2)+'%',peso(r.ewt),peso(r.base),peso(r.ewt)]);
    note='Preview follows the uploaded QAP Excel template, but exports the selected month only. Export is blocked if ATC code/rate, supplier details, or amount is incomplete.';
  }else if(report==='qapDat'){
    const source=ewtSourceRows();sourceCount=source.length;issues=validateQAPSourceRows(source);
    const details=qapDetailRows();
    headers=['Record','Seq','Supplier TIN','Branch','Corporation / Individual Name','Period','ATC Code','Rate','Tax Base Amount','Computed EWT','Source Lines'];
    rows=details.slice(0,25).map((r,idx)=>['D1',idx+1,formatTin9Hyphen(r.tin),r.branch,r.corp||[r.last,r.first,r.middle].filter(Boolean).join(', '),r.period,r.atc,r.rate.toFixed(2)+'%',peso(r.base),peso(r.ewt),r.count]);
    note='Preview follows the uploaded QAP DAT structure: HQAP header, D1 detail rows, and C1 control totals. Export is blocked if ATC code/rate, supplier details, or amount is incomplete.';
  }else if(report==='purchaseBook'){
    const source=birSourceRows();sourceCount=source.length;issues=validateBookSourceRows(source,'purchase');
    headers=['Date','TIN','Vendor Name','Vendor Address','Reference No.','Description','Vatable Amount','Non-Vatable Amount','Tax Amount','Gross Amount','COA Code','COA Title'];
    rows=source.slice(0,25).map(t=>{
      const r=subsidiaryPurchaseBookDetailRow(t);
      return [t.date, r[1], r[2], r[3], r[4], r[5], peso(r[6]||0), peso(r[7]||0), peso(r[8]||0), peso(r[9]||0), r[10], r[11]];
    });
    note='Preview excludes rows missing both VAT Category and ATC Code and follows the uploaded Subsidiary Purchase Book template. Export is blocked only if a required book/export field is missing.';
  }else{
    const source=birCashSourceRows();sourceCount=source.length;issues=validateBookSourceRows(source,'cash');
    headers=['Date','TIN','Vendor Name','CDJ (CV number)','Description','Cash Account','Withheld Tax','Gross Amount','Cash Account'];
    rows=source.slice(0,25).map(t=>{
      const r=cashDisbursementBookDetailRow(t);
      return [t.date,r[1],r[2],r[3],r[4],peso(r[5]||0),peso(r[6]||0),peso(r[7]||0),r[8]];
    });
    note='Preview includes all cash disbursement lines, including rows with no VAT Category and no ATC Code, and follows the uploaded Cash Disbursement Book template. CDJ (CV number) keeps the stored CV reference exactly as encoded, including suffixes used to split one voucher into multiple accounting-title lines.';
  }
  const finalIssues=birValidationIssuesForExport(report);
  issues=finalIssues.length?finalIssues:issues;
  const attentionRows=makeBirAttentionRows(issues,headers.length);
  return{headers,rows,issues,note,sourceCount,attentionRows};
}
function birValidationIssuesForExport(report){
  const blockers=birMonthWideBlockerIssues(report);
  if(blockers.length)return dedupeBirIssues(blockers);
  let reportIssues=[];
  if(report==='slpExcel'){reportIssues=validateSLPDatSourceRows(slpExcelSourceRows()).map(i=>birIssue(i.cv,i.voucher,i.invoice,'missing '+i.missing.join(', ')))}
  else if(report==='slpDat'){reportIssues=(slpDatRows().validationIssues||[]).map(i=>birIssue(i.cv,i.voucher,i.invoice,'missing '+i.missing.join(', ')));reportIssues=reportIssues.concat(birSupplierSpecialBlockers(slpExcelSourceRows(),'slpDat'))}
  else if(report==='qapExcel'||report==='qapDat'){reportIssues=validateQAPSourceRows(ewtSourceRows());if(report==='qapDat')reportIssues=reportIssues.concat(birSupplierSpecialBlockers(ewtSourceRows(),'qapDat'))}
  else if(report==='purchaseBook')reportIssues=validateBookSourceRows(birSourceRows(),'purchase');
  else if(report==='cashBook')reportIssues=validateBookSourceRows(birCashSourceRows(),'cash');
  return dedupeBirIssues(reportIssues);
}

function showBIRValidationIssues(label,issues){
  const preview=issues.slice(0,12).map(i=>`• ${i.cv} / ${i.voucher}${i.invoice?` / ${i.invoice}`:''}: ${i.message}`).join('\n');
  const more=issues.length>12?`\n...and ${issues.length-12} more issue(s).`:'';
  alert(`Cannot export ${label} yet. Please resolve the preview issues first.\n\n${preview}${more}`);
}

function exportSelectedBirReport(){
  const select=document.getElementById('birReportSelect');
  const report=(select&&select.value)||activeBirReport||'slpExcel';
  activeBirReport=report;
  const label=birReportLabel(report);
  const issues=birValidationIssuesForExport(report);
  if(issues.length){showBIRValidationIssues(label,issues);renderBirCompliance();return;}
  const fnMap={
    slpExcel:exportSLPExcel,
    slpDat:exportSLPDAT,
    qapExcel:exportQAP1601EQExcel,
    qapDat:exportQAP1601EQDAT,
    purchaseBook:exportSubsidiaryPurchaseBookExcel,
    cashBook:exportCashDisbursementBookExcel
  };
  const fn=fnMap[report];
  if(typeof fn!=='function'){alert('Export function is not available for '+label+'.');return;}
  fn();
}
function renderBirFallback(err){
  const status=document.getElementById('birPreviewStatus');
  const actions=document.getElementById('birReportActions');
  const title=document.getElementById('birPreviewTitle');
  const note=document.getElementById('birPreviewNote');
  const thead=document.getElementById('birThead'),tbody=document.getElementById('birTbody'),tfoot=document.getElementById('birTfoot');
  if(actions)actions.innerHTML=`<button class="btn btn-primary" id="birExportSelectedBtn" onclick="exportSelectedBirReport()">Export Selected Report</button><button class="btn" onclick="renderBirCompliance()">Refresh Preview</button>`;
  if(title)title.textContent=birReportLabel(activeBirReport)+' Preview';
  if(status){status.className='bir-preview-status err';status.innerHTML='<strong>Preview error:</strong> The preview panel could not render. The export button remains available and will still run validation before downloading.<div class="bir-issue-list"><div>'+esc(err&&err.message?err.message:String(err||'Unknown error'))+'</div></div>';}
  if(note)note.textContent='Use Refresh Preview after correcting data. Export still blocks if validation fails.';
  if(thead)thead.innerHTML='<tr><th>Status</th></tr>';
  if(tbody)tbody.innerHTML='<tr><td>Preview unavailable because of a rendering error.</td></tr>';
  if(tfoot)tfoot.innerHTML='<tr><td>Export validation is still active.</td></tr>';
}
function normalizeBirPreviewRow(row, headerCount){
  let cells=[];
  if(Array.isArray(row))cells=row;
  else if(row && typeof row==='object')cells=Object.values(row);
  else cells=[row??''];
  const count=Math.max(headerCount||0,cells.length||0,1);
  while(cells.length<count)cells.push('');
  return cells.slice(0,count);
}
function renderBirPreviewTable(payload){
  const title=document.getElementById('birPreviewTitle');
  const status=document.getElementById('birPreviewStatus');
  const note=document.getElementById('birPreviewNote');
  const thead=document.getElementById('birThead'),tbody=document.getElementById('birTbody'),tfoot=document.getElementById('birTfoot');
  const safePayload=payload&&typeof payload==='object'?payload:{headers:['Preview'],rows:[],issues:[birIssue('Preview','','','Preview payload was not generated.')],note:'Preview unavailable.',sourceCount:0};
  const headers=Array.isArray(safePayload.headers)&&safePayload.headers.length?safePayload.headers:['Preview'];
  const rows=Array.isArray(safePayload.rows)?safePayload.rows:[];
  const issues=Array.isArray(safePayload.issues)?safePayload.issues:[];
  const attentionRows=Array.isArray(safePayload.attentionRows)?safePayload.attentionRows:[];
  const sourceCount=Number(safePayload.sourceCount||0);
  if(title)title.textContent=birReportLabel(activeBirReport)+' Preview';
  if(status){
    const hasRows=sourceCount>0||rows.length>0;
    const hardIssues=issues.length;
    status.className='bir-preview-status '+(hardIssues?'err':hasRows?'ok':'warn');
    const issueLines=issues.slice(0,5).map(i=>`<div>• ${esc(i.cv||'')} / ${esc(i.voucher||'')}${i.invoice?` / ${esc(i.invoice)}`:''}: ${esc(i.message||'Issue found')}</div>`).join('');
    const more=issues.length>5?`<div>...and ${issues.length-5} more issue(s).</div>`:'';
    status.innerHTML=hardIssues?`<strong>Export blocked:</strong> ${hardIssues} issue(s) found. Preview remains available below.<div class="bir-issue-list">${issueLines}${more}</div>`:hasRows?`<strong>Preview ready:</strong> ${sourceCount||rows.length} row(s) available. Export will still run final validation before downloading.`:`<strong>No rows:</strong> No source rows are available for this report and period.`;
  }
  if(note)note.textContent=(safePayload.note||'Preview shown for review.')+(rows.length<sourceCount?` Showing first ${rows.length} of ${sourceCount} row(s).`:'' );
  if(!thead||!tbody||!tfoot)return;
  thead.innerHTML='<tr>'+headers.map(h=>`<th>${esc(h)}</th>`).join('')+'</tr>';
  const attentionHtml=attentionRows.length?`<tr class="bir-attention-header-row"><td colspan="${headers.length}"><span class="bir-attention-note">Review Queue</span> Attention Needed transactions are pinned here until fixed.</td></tr>`+attentionRows.map(row=>{
    const cells=normalizeBirPreviewRow(row,headers.length);
    return '<tr class="bir-attention-row">'+cells.map(v=>`<td>${v&&String(v).startsWith('<span class="peso"')?v:esc(v)}</td>`).join('')+'</tr>';
  }).join(''):'';
  const previewHtml=rows.length?rows.map(row=>{
      const cells=normalizeBirPreviewRow(row,headers.length);
      return '<tr>'+cells.map(v=>`<td>${v&&String(v).startsWith('<span class="peso"')?v:esc(v)}</td>`).join('')+'</tr>';
    }).join(''):'';
  if(attentionHtml||previewHtml){
    tbody.innerHTML=attentionHtml+previewHtml;
  }else{
    tbody.innerHTML=`<tr><td colspan="${headers.length}"><div class="empty-state"><p>No preview rows for this report.</p></div></td></tr>`;
  }
  tfoot.innerHTML=`<tr><td colspan="${headers.length}">${issues.length?'Resolve issues above before exporting.':'Preview shown for review. Export will re-check data before download.'}</td></tr>`;
}
function renderBirCompliance(){
  try{
    // BIR Compliance summary cards were intentionally removed from the UI.
    // Keep the preview/export logic independent from any summary metric element.
    const select=document.getElementById('birReportSelect');
    if(select){
      if(!select.value)select.value=activeBirReport||'slpExcel';
      activeBirReport=select.value||activeBirReport||'slpExcel';
    }
    const actions=document.getElementById('birReportActions');
    if(actions)actions.innerHTML=`<button class="btn btn-primary" id="birExportSelectedBtn" onclick="exportSelectedBirReport()">Export Selected Report</button><button class="btn" onclick="renderBirCompliance()">Refresh Preview</button>`;
    const payload=birPreviewPayload(activeBirReport||'slpExcel');
    renderBirPreviewTable(payload);
  }catch(err){
    console.error('BIR preview render failed:',err);
    renderBirFallback(err);
  }
}
function exportXLSX(){if(activeTab==='working')exportWorkingXLSX();else if(activeTab==='vat')exportLedgerXLSX('vat');else if(activeTab==='ewt')exportLedgerXLSX('ewt');else if(activeTab==='bir')exportBIRComplianceIndexXLSX();else if(activeTab==='masters'){if(activeMasterSub==='vatCategories')exportVatCategoriesXLSX();else if(activeMasterSub==='atcRates')exportAtcMasterXLSX();else exportSupplierXLSX()}else exportSummaryXLSX()}
function exportSummaryXLSX(){const rows=[['Voucher Name','Accounting Title','Bank Account','Registered Supplier','TIN','Registered Address','City','ZIP Code','CV No.','Invoice/OR No.','Date','Description','Amount','Computed VAT Amount','Total Amount','VAT Type','Computed EWT Amount','ATC Code','ATC Rate','Compliance','Review Note','Last Reviewed']];filteredTransactions('summary').forEach(t=>rows.push([t.voucherName,t.accountingTitle,t.bankAccount,t.supplier,t.tin,t.address,t.city,t.zip,t.cv,t.inv,t.date,t.description,transactionAmount(t),t.vat,t.total,vatTypeText(t.vatReg),t.ewtAmount,atcText(t.atcCode),atcRateText(t.atcCode),verificationText(t.manualStatus),t.reviewNote,t.lastReviewed]));downloadXLSX(rows,'vat_compliance_summary_export.xlsx','Compliance Summary');showToast('Summary export downloaded.')}
function exportWorkingXLSX(){const groups=filteredCVGroups();const groupMap=new Map(groups.map(g=>[g.cv,g]));const rows=[['Voucher Name','CV No.','Accounting Title','Bank Account','Registered Supplier','TIN','Registered Address','City','ZIP Code','Invoice/OR No.','Date','Description','Amount','VAT Category','Computed VAT Amount','Total Amount','Computed EWT Amount','ATC Code','ATC Rate','VAT Balance Status by CV','EWT Balance Status by CV','Verification','Review Note','Last Reviewed']];groups.forEach(g=>g.txns.forEach(t=>{const cvGroup=groupMap.get(t.cv||'(No CV Number)')||{};rows.push([t.voucherName,t.cv,t.accountingTitle,t.bankAccount,t.supplier,t.tin,t.address,t.city,t.zip,t.inv,t.date,t.description,transactionAmount(t),vatCategoryText(t.vatCategory),t.vat,t.total,t.ewtAmount,atcText(t.atcCode),atcRateText(t.atcCode),isBalanced(cvGroup.vatDiff||0)?'Balanced':'Not Balanced',isBalanced(cvGroup.ewtDiff||0)?'Balanced':'Not Balanced',verificationText(t.manualStatus),t.reviewNote,t.lastReviewed])}));downloadXLSX(rows,'purchase_transactions_export.xlsx','Purchase Transactions');showToast('Purchase Transactions export downloaded.')}

function exportLedgerXLSX(type){const rows=[['CV No.','Supplier / Voucher','Uploaded Balance','Purchase Amount by CV','Difference','Status']];ledgerRowsByCV(type).forEach(item=>rows.push([item.cv,item.suppliers,item.ledgerAmount,item.purchaseAmount,item.diff,item.status==='balanced'?'Balanced':'Not Balanced']));downloadXLSX(rows,type==='vat'?'vat_balances_export.xlsx':'ewt_balances_export.xlsx',type==='vat'?'VAT Balances':'EWT Balances');showToast((type==='vat'?'VAT':'EWT')+' Balances export downloaded.')}
function downloadCSV(rows,name){downloadXLSX(rows,String(name||'export.csv').replace(/\.csv$/i,'.xlsx'),'Export')}
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
function handleVerificationClick(e){
  const close=e.target.closest('[data-close-cv-review]');
  if(close){e.stopPropagation();closeCVReviewModal();return}
  const remove=e.target.closest('.wp-remove');
  if(remove){e.stopPropagation();removeTransaction(remove.dataset.id);renderCVReviewModal();return}
  if(e.target.closest('input')||e.target.closest('select')||e.target.closest('button'))e.stopPropagation();
}
function handleVerificationInput(e){const tin=e.target.closest('.tin-auto');if(tin&&tin.dataset.id)queueSupplierLookupForRow(tin.dataset.id)}
function handleVerificationChange(e){const field=e.target.closest('.wp-autosave');if(!field||!field.dataset.id)return;const id=field.dataset.id;if(field.classList.contains('wp-status')){applyVerificationStatusClass(field);applyExemptEntryFieldLock(id);}if(field.classList.contains('tin-auto'))autoLookupSupplierForRow(id,false);if(field.classList.contains('wp-vatcat')||field.classList.contains('wp-atc'))enforceAtcVatRule(id);if(field.id&&(/wp_amount_|wp_vatcat_|wp_atc_|wp_total_/.test(field.id)))updateWorkingTaxPreview(id);queueAutoSaveWorkingRow(id,80)}
function handleVerificationFocusOut(e){const field=e.target.closest('.wp-autosave');if(!field||!field.dataset.id)return;const id=field.dataset.id;if(field.classList.contains('tin-auto'))autoLookupSupplierForRow(id,true);if(field.id&&(/wp_amount_|wp_vatcat_|wp_atc_|wp_total_/.test(field.id)))updateWorkingTaxPreview(id);queueAutoSaveWorkingRow(id,80)}
document.getElementById('workTbody').addEventListener('click',handleVerificationClick);
document.getElementById('workTbody').addEventListener('input',handleVerificationInput);
document.getElementById('workTbody').addEventListener('change',handleVerificationChange);
document.getElementById('workTbody').addEventListener('focusout',handleVerificationFocusOut);
document.getElementById('summaryReviewModal').addEventListener('click',e=>{if(e.target.id==='summaryReviewModal'||e.target.closest('[data-close-summary-review]')){closeSummaryReviewModal();return}});
document.getElementById('cvReviewModal').addEventListener('click',e=>{if(e.target.id==='cvReviewModal'){closeCVReviewModal();return}handleVerificationClick(e)});
document.getElementById('cvReviewModal').addEventListener('input',handleVerificationInput);
document.getElementById('cvReviewModal').addEventListener('change',handleVerificationChange);
document.getElementById('cvReviewModal').addEventListener('focusout',handleVerificationFocusOut);
document.getElementById('tinScanModal').addEventListener('click',handleTinScanClick);
const dz=document.getElementById('dropZone');dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('drag')});dz.addEventListener('dragleave',()=>dz.classList.remove('drag'));dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('drag');const f=e.dataTransfer.files[0];if(f){const inp=document.getElementById('xlsxInput');const dt=new DataTransfer();dt.items.add(f);inp.files=dt.files;handleXLSX({target:inp})}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const tinModal=document.getElementById('tinScanModal');if(tinModal&&tinModal.classList.contains('visible')){closeTinScanModal();return}if(activeSummaryReview){closeSummaryReviewModal();return}if(focusedCV){closeCVReviewModal();}}});
updateImportHelp();updateTaxPreview('f');renderAll();
