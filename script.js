const CONFIG = window.BUDGET_APP_CONFIG || {};
let sb = null;
let isReady = false;
let buckets = [];
let months = [];
let allocations = [];
let plans = [];
let transfers = [];
let exportLogs = [];
let selectedMonth = localStorage.getItem('mpr_budget_selected_month') || new Date().toISOString().slice(0, 7);
let cnyToThbRate = 5;

const $ = (id) => document.getElementById(id);
const TABLES = {
  months: 'budget_months',
  buckets: 'budget_buckets',
  allocations: 'monthly_budget_allocations',
  plans: 'order_plans',
  transfers: 'budget_transfers',
  logs: 'budget_export_logs'
};

const masterSeed = [
  { code: 'BUD-MSR', group_name: 'Department', owner: 'Chaiphat', department: 'MSR', default_budget: 14000, is_system: true, is_active: true },
  { code: 'BUD-UTILITY', group_name: 'Department', owner: 'MVR龙伟', department: 'Utility', default_budget: 14000, is_system: true, is_active: true },
  { code: 'BUD-LOTUS', group_name: 'Department', owner: 'Ratthathammanun', department: 'Lotus', default_budget: 14000, is_system: true, is_active: true },
  { code: 'BUD-MVR', group_name: 'Department', owner: 'Apiwut', department: 'MVR', default_budget: 14000, is_system: true, is_active: true },
  { code: 'BUD-URGENT', group_name: 'Emergency', owner: 'Common', department: 'Urgent Spare Parts', default_budget: 16000, is_system: true, is_active: true },
  { code: 'BUD-LOCAL-TH', group_name: 'Local Purchase', owner: 'Common', department: 'Thailand Purchase', default_budget: 8000, is_system: true, is_active: true }
];

document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  bindEvents();
  showLoading(true);
  try {
    initSupabase();
    await loadAllData();
    await ensureDefaultData();
    await ensureMonth(selectedMonth, true);
    await loadAllData();
    setConnection('ready', 'Supabase connected');
    isReady = true;
    renderAll();
  } catch (error) {
    console.error(error);
    setConnection('error', 'Supabase not ready');
    toast('ตั้งค่า Supabase หรือรัน database.sql ก่อนใช้งาน', 'error');
  } finally {
    showLoading(false);
  }
}

function initSupabase() {
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey || CONFIG.supabaseUrl.includes('PASTE_')) {
    throw new Error('Missing Supabase URL or anon key in supabase-config.js');
  }
  sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
}

function setConnection(type, text) {
  const card = $('connectionCard');
  card.classList.remove('ready', 'error');
  card.classList.add(type);
  $('connectionStatus').textContent = text;
}
function showLoading(show) { $('loadingOverlay').classList.toggle('show', show); }
function toast(message, type = 'success') {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast show ${type}`;
  setTimeout(() => el.classList.remove('show'), 3200);
}
async function supa(queryPromise) {
  const { data, error } = await queryPromise;
  if (error) throw error;
  return data;
}
async function loadAllData() {
  [months, buckets, allocations, plans, transfers, exportLogs] = await Promise.all([
    supa(sb.from(TABLES.months).select('*').order('month', { ascending: false })),
    supa(sb.from(TABLES.buckets).select('*').order('code')),
    supa(sb.from(TABLES.allocations).select('*, budget_buckets(*)').order('created_at')),
    supa(sb.from(TABLES.plans).select('*, budget_buckets(*)').order('created_at', { ascending: false })),
    supa(sb.from(TABLES.transfers).select('*, from_bucket:from_bucket_id(*), to_bucket:to_bucket_id(*)').order('created_at', { ascending: false })),
    supa(sb.from(TABLES.logs).select('*').order('created_at', { ascending: false }).limit(80))
  ]);
  const month = months.find(m => m.month === selectedMonth);
  cnyToThbRate = Number(month?.cny_to_thb_rate || 5);
}
async function ensureDefaultData() {
  if (buckets.length) return;
  await supa(sb.from(TABLES.buckets).upsert(masterSeed, { onConflict: 'code' }).select());
  await loadAllData();
}
async function ensureMonth(month, useRollover = true) {
  const activeBuckets = buckets.filter(b => b.is_active);
  const totalDefault = activeBuckets.reduce((s, b) => s + num(b.default_budget), 0) || 80000;
  await supa(sb.from(TABLES.months).upsert({ month, base_total: totalDefault, cny_to_thb_rate: cnyToThbRate }, { onConflict: 'month' }).select());
  const existing = allocations.filter(a => a.month === month).map(a => a.bucket_id);
  const inserts = [];
  for (const b of activeBuckets) {
    if (!existing.includes(b.id)) {
      inserts.push({ month, bucket_id: b.id, base_budget: num(b.default_budget), rollover_in: useRollover ? getPreviousRemaining(month, b.id) : 0, is_active: true });
    }
  }
  if (inserts.length) await supa(sb.from(TABLES.allocations).insert(inserts).select());
}
function bindEvents() {
  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchPage(btn.dataset.page)));
  $('globalMonthSelect').addEventListener('change', async () => { selectedMonth = $('globalMonthSelect').value; localStorage.setItem('mpr_budget_selected_month', selectedMonth); await ensureMonth(selectedMonth, true); await refresh(); });
  $('monthForm').addEventListener('submit', handleCreateMonth);
  $('recalcRolloverBtn').addEventListener('click', recalculateRollover);
  $('resetMonthBudgetBtn').addEventListener('click', resetSelectedMonth);
  $('openManualModalBtn').addEventListener('click', openManualModal);
  $('openTransferModalBtn').addEventListener('click', openTransferModal);
  $('openTransferPageBtn').addEventListener('click', openTransferModal);
  $('openBucketModalBtn').addEventListener('click', () => openBucketModal());
  $('openBucketMasterBtn').addEventListener('click', () => openBucketModal());
  $('closeManualModalBtn').addEventListener('click', closeManualModal);
  $('closeBucketModalBtn').addEventListener('click', closeBucketModal);
  $('closeTransferModalBtn').addEventListener('click', closeTransferModal);
  $('manualForm').addEventListener('submit', handleSaveManualOrder);
  $('bucketForm').addEventListener('submit', handleSaveBucket);
  $('transferForm').addEventListener('submit', handleSaveTransfer);
  $('clearManualFormBtn').addEventListener('click', () => { $('manualForm').reset(); updateManualPreview(); });
  $('clearBucketFormBtn').addEventListener('click', clearBucketForm);
  $('clearTransferFormBtn').addEventListener('click', clearTransferForm);
  ['manualOrderQty', 'manualUnitPrice', 'manualCurrency', 'manualRate'].forEach(id => $(id).addEventListener('input', updateManualPreview));
  $('transferAmount').addEventListener('input', updateTransferPreview);
  $('transferFrom').addEventListener('change', validateTransferSelect);
  $('transferTo').addEventListener('change', validateTransferSelect);
  $('searchInput').addEventListener('input', renderPlanningTable);
  $('bucketFilter').addEventListener('change', renderPlanningTable);
  $('statusFilter').addEventListener('change', renderPlanningTable);
  $('autoFitBudgetBtn').addEventListener('click', autoFitBudget);
  $('clearCurrentMonthBtn').addEventListener('click', clearCurrentMonthOrders);
  $('createNextMonthCarryBtn').addEventListener('click', createNextMonthCarry);
  $('importFile').addEventListener('change', handleImportFile);
  $('exportOrderBtn').addEventListener('click', exportFinalOrder);
  $('exportCarryBtn').addEventListener('click', exportCarryForward);
  $('exportBudgetUsageBtn').addEventListener('click', exportBudgetUsage);
}
async function refresh() { showLoading(true); try { await loadAllData(); renderAll(); } finally { showLoading(false); } }
function switchPage(pageId) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === pageId));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === pageId));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function num(v) { return Number(v || 0); }
function fmt(n) { return `${num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CNY`; }
function thb(n) { return num(n) * num(cnyToThbRate); }
function fmtTHB(n) { return `${num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`; }
function moneyBoth(n) { return `<strong>${fmt(n)}</strong><span class="money-sub">≈ ${fmtTHB(thb(n))}</span>`; }
function clean(v) { if (v === null || v === undefined || v === '') return 0; return Number(String(v).replace(/,/g, '').replace(/[^\d.\-]/g, '')) || 0; }
function getNextMonth(month) { const [y, m] = month.split('-').map(Number); return new Date(y, m, 1).toISOString().slice(0, 7); }
function getPrevMonth(month) { const [y, m] = month.split('-').map(Number); return new Date(y, m - 2, 1).toISOString().slice(0, 7); }
function activeBuckets() { return buckets.filter(b => b.is_active); }
function getBucket(id) { return buckets.find(b => b.id === id) || {}; }
function allocationRows(month = selectedMonth) { return allocations.filter(a => a.month === month && a.is_active !== false); }
function monthPlans(month = selectedMonth) { return plans.filter(p => p.month === month); }
function monthTransfers(month = selectedMonth) { return transfers.filter(t => t.month === month); }
function planTotal(p) { return num(p.order_qty) * num(p.unit_price_cny); }
function remainQty(p) { return num(p.request_qty) - num(p.order_qty); }
function planStatus(p) { const req = num(p.request_qty), ord = num(p.order_qty); if (ord <= 0) return 'Not Ordered'; if (ord < req) return 'Partial Ordered'; if (ord === req) return 'Completed'; return 'Over Order'; }
function badgeClass(status) { if (status === 'Completed' || status === 'Normal') return 'completed'; if (status === 'Partial Ordered' || status === 'Warning') return 'partial'; if (status === 'Not Ordered') return 'not'; return 'over'; }
function budgetSummary(month, bucketId) {
  const al = allocations.find(a => a.month === month && a.bucket_id === bucketId && a.is_active !== false);
  const base = num(al?.base_budget), roll = num(al?.rollover_in);
  const tin = transfers.filter(t => t.month === month && t.to_bucket_id === bucketId).reduce((s,t)=>s+num(t.amount_cny),0);
  const tout = transfers.filter(t => t.month === month && t.from_bucket_id === bucketId).reduce((s,t)=>s+num(t.amount_cny),0);
  const total = base + roll + tin - tout;
  const used = plans.filter(p => p.month === month && p.bucket_id === bucketId).reduce((s,p)=>s+planTotal(p),0);
  const remaining = total - used;
  const usage = total > 0 ? (used / total) * 100 : 0;
  let status = 'Normal', level = 'normal', message = 'งบยังเพียงพอ';
  if (remaining < 0) { status = 'Over Budget'; level = 'danger'; message = `เกินงบ ${fmt(Math.abs(remaining))}`; }
  else if (usage >= 90) { status = 'Almost Empty'; level = 'danger'; message = 'งบใกล้หมดมาก ควรตรวจสอบ'; }
  else if (usage >= 75) { status = 'Warning'; level = 'warning'; message = 'ใช้งบเกิน 75% แล้ว'; }
  return { base, roll, tin, tout, total, used, remaining, usage, status, level, message };
}
function monthSummary(month = selectedMonth) {
  const rows = allocationRows(month); let total = 0, used = 0;
  rows.forEach(a => { const s = budgetSummary(month, a.bucket_id); total += s.total; used += s.used; });
  const remaining = total - used, usage = total > 0 ? used / total * 100 : 0;
  let status = 'Normal', level = 'normal', message = 'งบรวมยังอยู่ในระดับปกติ';
  if (remaining < 0) { status = 'Over Budget'; level = 'danger'; message = `งบรวมเกิน ${fmt(Math.abs(remaining))}`; }
  else if (usage >= 90) { status = 'Almost Empty'; level = 'danger'; message = 'งบรวมใกล้หมดมาก'; }
  else if (usage >= 75) { status = 'Warning'; level = 'warning'; message = 'งบรวมใช้เกิน 75%'; }
  return { total, used, remaining, usage, status, level, message };
}
function getPreviousRemaining(month, bucketId) { return Math.max(budgetSummary(getPrevMonth(month), bucketId).remaining, 0); }
function renderAll() {
  renderMonthSelectors(); renderDashboard(); renderBudgetAllocation(); renderAttention(); renderTopSpending(); renderBudgetPage(); renderPlanningFilters(); renderPlanningTable(); renderTransfers(); renderCarry(); renderMaster(); renderExportLogs();
  const s = monthSummary(); $('sideMonth').textContent = selectedMonth; $('sideBudget').innerHTML = `${fmt(s.total)}<br><span class="money-sub">≈ ${fmtTHB(thb(s.total))}</span>`;
  $('monthInput').value = selectedMonth; $('totalBudgetInput').value = months.find(m => m.month === selectedMonth)?.base_total || s.total || 80000; $('cnyToThbInput').value = cnyToThbRate;
}
function renderMonthSelectors() {
  const set = new Set(months.map(m => m.month)); set.add(selectedMonth);
  const opts = [...set].sort().reverse().map(m => `<option value="${m}" ${m===selectedMonth?'selected':''}>${m}</option>`).join('');
  $('globalMonthSelect').innerHTML = opts;
}
function renderDashboard() {
  const s = monthSummary(); $('kpiMonthlyBudget').innerHTML = moneyBoth(s.total); $('kpiUsedBudget').innerHTML = moneyBoth(s.used); $('kpiRemainBudget').innerHTML = moneyBoth(s.remaining);
  $('kpiBudgetStatus').textContent = s.status; $('kpiBudgetMessage').textContent = s.message; $('budgetAlertCard').className = `kpi-card status ${s.level}`;
  $('usagePercent').textContent = `${s.usage.toFixed(1)}%`; $('usageBar').style.width = `${Math.min(Math.max(s.usage,0),100)}%`; $('usageBar').className = `meter-fill ${s.level}`; $('meterUsed').textContent = `Used: ${fmt(s.used)}`; $('meterRemain').textContent = `Remain: ${fmt(s.remaining)}`;
  const mp = monthPlans(); $('sumItems').textContent = mp.length; $('sumCompleted').textContent = mp.filter(p=>planStatus(p)==='Completed').length; $('sumPartial').textContent = mp.filter(p=>planStatus(p)==='Partial Ordered').length; $('sumCarry').textContent = mp.filter(p=>remainQty(p)>0).length;
}
function renderBudgetAllocation() {
  const rows = allocationRows();
  $('budgetAllocationGrid').innerHTML = rows.map(a => { const b = getBucket(a.bucket_id), s = budgetSummary(selectedMonth,a.bucket_id); return `<article class="budget-card ${s.level}"><div class="budget-card-head"><div><div class="budget-code">${b.code||'-'}</div><div class="budget-owner">${b.owner||'-'} / ${b.department||'-'}</div></div><span class="badge ${badgeClass(s.status)}">${s.status}</span></div><div class="budget-remaining"><span>Remaining Budget</span><strong>${fmt(s.remaining)}</strong><small>≈ ${fmtTHB(thb(s.remaining))}</small></div><div class="budget-mini-row"><span>Total Available</span><strong>${fmt(s.total)}</strong></div><div class="budget-mini-row"><span>Used</span><strong>${fmt(s.used)}</strong></div><div class="budget-mini-row"><span>Usage</span><strong>${s.usage.toFixed(1)}%</strong></div><div class="budget-progress"><div class="budget-progress-fill" style="width:${Math.min(Math.max(s.usage,0),100)}%"></div></div><div class="budget-card-actions"><button class="mini-btn" onclick="filterPlanningByBucket('${a.bucket_id}')">ดูรายการ</button><button class="mini-btn" onclick="openTransferModalWithTarget('${a.bucket_id}')">โยกงบเข้า</button></div></article>`; }).join('') || `<div class="empty-state">ยังไม่มีงบของเดือนนี้</div>`;
}
function renderAttention() {
  const rows = allocationRows().map(a => ({ a, b:getBucket(a.bucket_id), s:budgetSummary(selectedMonth,a.bucket_id) })).filter(x => x.s.remaining < 0 || x.s.usage >= 75).sort((x,y)=>y.s.usage-x.s.usage);
  $('budgetAttentionList').innerHTML = rows.length ? rows.map(x => `<div class="attention-item ${x.s.level==='danger'?'danger':''}"><div><strong>${x.b.code} — ${x.b.owner}</strong><p>${x.s.message}</p></div><div class="attention-number"><strong>${fmt(x.s.remaining)}</strong><p>${x.s.usage.toFixed(1)}% used</p></div></div>`).join('') : `<div class="empty-state success">งบทุกก้อนยังอยู่ในระดับปกติ สามารถวางแผนสั่งซื้อได้</div>`;
}
function renderTopSpending() {
  const top = [...monthPlans()].sort((a,b)=>planTotal(b)-planTotal(a)).slice(0,8);
  $('topSpendingBody').innerHTML = top.map((p,i)=>`<tr><td>${i+1}</td><td>${p.part_name||p.part_name_cn||'-'}</td><td>${p.model||'-'}</td><td>${p.budget_buckets?.code||getBucket(p.bucket_id).code||'-'}</td><td>${num(p.order_qty)}</td><td>${fmt(p.unit_price_cny)}</td><td>${fmt(planTotal(p))}</td><td><span class="badge ${badgeClass(planStatus(p))}">${planStatus(p)}</span></td></tr>`).join('') || `<tr><td colspan="8"><div class="empty-state">ยังไม่มีรายการสั่งซื้อ</div></td></tr>`;
}
function renderBudgetPage() {
  const s = monthSummary();
  $('budgetSummaryStrip').innerHTML = `<div class="strip-card"><span>Total Available</span><strong>${fmt(s.total)}</strong></div><div class="strip-card"><span>Used</span><strong>${fmt(s.used)}</strong></div><div class="strip-card"><span>Remaining</span><strong>${fmt(s.remaining)}</strong></div><div class="strip-card"><span>Budget Buckets</span><strong>${allocationRows().length}</strong></div>`;
  $('monthBudgetBody').innerHTML = allocationRows().map(a=>{ const b=getBucket(a.bucket_id), x=budgetSummary(selectedMonth,a.bucket_id); return `<tr><td><strong>${b.code}</strong></td><td>${b.group_name||'-'}</td><td>${b.owner||'-'}</td><td>${b.department||'-'}</td><td><input class="budget-input" type="number" value="${num(a.base_budget)}" onchange="updateAllocationBase('${a.id}', this.value)"></td><td>${fmt(a.rollover_in)}</td><td class="transfer-in">${fmt(x.tin)}</td><td class="transfer-out">${fmt(x.tout)}</td><td>${fmt(x.total)}</td><td>${fmt(x.used)}</td><td>${fmt(x.remaining)}</td><td>${x.usage.toFixed(1)}%</td><td><span class="badge ${badgeClass(x.status)}">${x.status}</span></td><td><div class="action-list"><button class="action-btn" onclick="openBucketModal('${b.id}')">Edit</button><button class="action-btn" onclick="openTransferModalWithTarget('${b.id}')">Transfer</button><button class="action-btn danger" onclick="removeAllocation('${a.id}')">Remove</button></div></td></tr>`}).join('') || `<tr><td colspan="14"><div class="empty-state">ยังไม่มีงบ</div></td></tr>`;
}
function renderPlanningFilters() {
  const opts = `<option value="ALL">All Budgets</option>` + activeBuckets().map(b=>`<option value="${b.id}">${b.code} — ${b.owner}</option>`).join('');
  if ($('bucketFilter').innerHTML !== opts) $('bucketFilter').innerHTML = opts;
}
function renderPlanningTable() {
  const q = $('searchInput').value?.toLowerCase() || '', bucket = $('bucketFilter').value || 'ALL', st = $('statusFilter').value || 'ALL';
  let rows = monthPlans().filter(p => bucket === 'ALL' || p.bucket_id === bucket).filter(p => st === 'ALL' || planStatus(p) === st).filter(p => [p.part_name,p.part_name_cn,p.model,p.brand,p.requester,p.use_position].join(' ').toLowerCase().includes(q));
  const total = rows.reduce((s,p)=>s+planTotal(p),0); $('planItemsStat').textContent = `${rows.length} items`; $('planTotalStat').textContent = fmt(total);
  $('planningBody').innerHTML = rows.map((p,i)=>`<tr><td>${p.no||i+1}</td><td><select class="budget-select" onchange="updatePlanBucket('${p.id}', this.value)">${activeBuckets().map(b=>`<option value="${b.id}" ${b.id===p.bucket_id?'selected':''}>${b.code}</option>`).join('')}</select></td><td><strong>${p.part_name||'-'}</strong></td><td>${p.part_name_cn||'-'}</td><td>${p.model||'-'}</td><td>${p.brand||'-'}</td><td>${num(p.request_qty)}</td><td><input class="qty-input" type="number" min="0" step="1" value="${num(p.order_qty)}" onchange="updateOrderQty('${p.id}',this.value)"></td><td>${remainQty(p)}</td><td>${fmt(p.unit_price_cny)}</td><td><strong>${fmt(planTotal(p))}</strong></td><td>${p.requester||'-'}</td><td>${p.use_position||'-'}</td><td>${p.urgency||'-'}</td><td><span class="badge ${badgeClass(planStatus(p))}">${planStatus(p)}</span></td><td><button class="action-btn danger" onclick="deletePlan('${p.id}')">Delete</button></td></tr>`).join('') || `<tr><td colspan="16"><div class="empty-state">ยังไม่มีรายการในเดือนนี้ ไปที่ File Center เพื่อ Import หรือกด Add Order</div></td></tr>`;
}
function renderTransfers() {
  $('transferHistoryBody').innerHTML = monthTransfers().map(t=>`<tr><td>${t.transfer_date||''}</td><td>${t.from_bucket?.code||getBucket(t.from_bucket_id).code}</td><td>${t.to_bucket?.code||getBucket(t.to_bucket_id).code}</td><td>${fmt(t.amount_cny)}</td><td>${fmtTHB(thb(t.amount_cny))}</td><td>${t.reason||'-'}</td><td><button class="action-btn danger" onclick="deleteTransfer('${t.id}')">Delete</button></td></tr>`).join('') || `<tr><td colspan="7"><div class="empty-state">ยังไม่มีประวัติโยกงบ</div></td></tr>`;
}
function renderCarry() {
  const rows = monthPlans().filter(p => remainQty(p) > 0);
  $('carryBody').innerHTML = rows.map(p=>`<tr><td>${p.month}</td><td>${getBucket(p.bucket_id).code||'-'}</td><td>${p.no||''}</td><td>${p.part_name||p.part_name_cn||'-'}</td><td>${p.model||'-'}</td><td>${p.brand||'-'}</td><td>${num(p.request_qty)}</td><td>${num(p.order_qty)}</td><td>${remainQty(p)}</td><td>${fmt(p.unit_price_cny)}</td><td>${fmt(remainQty(p)*num(p.unit_price_cny))}</td><td><span class="badge partial">Carry</span></td></tr>`).join('') || `<tr><td colspan="12"><div class="empty-state success">ไม่มีรายการค้างสั่ง</div></td></tr>`;
}
function renderMaster() {
  $('masterBody').innerHTML = buckets.map(b=>`<tr><td><strong>${b.code}</strong></td><td>${b.group_name}</td><td>${b.owner}</td><td>${b.department}</td><td>${fmt(b.default_budget)}</td><td>${b.is_system?'System':'Custom'}</td><td><span class="badge ${b.is_active?'normal':'not'}">${b.is_active?'Active':'Inactive'}</span></td><td><div class="action-list"><button class="action-btn" onclick="openBucketModal('${b.id}')">Edit</button><button class="action-btn danger" onclick="deleteBucket('${b.id}')">Delete</button></div></td></tr>`).join('');
}
function renderExportLogs() {
  $('exportLogBody').innerHTML = exportLogs.map(l=>`<tr><td>${new Date(l.created_at).toLocaleString()}</td><td>${l.month}</td><td>${l.export_type}</td><td>${l.file_name||'-'}</td><td>${l.total_records}</td></tr>`).join('') || `<tr><td colspan="5"><div class="empty-state">ยังไม่มีประวัติ Export</div></td></tr>`;
}
async function handleCreateMonth(e) {
  e.preventDefault(); showLoading(true);
  try {
    const month = $('monthInput').value; selectedMonth = month; localStorage.setItem('mpr_budget_selected_month', month); cnyToThbRate = clean($('cnyToThbInput').value) || 5;
    const totalBudget = clean($('totalBudgetInput').value) || 0; await supa(sb.from(TABLES.months).upsert({ month, base_total: totalBudget, cny_to_thb_rate: cnyToThbRate }, { onConflict: 'month' }).select());
    await loadAllData(); await ensureMonth(month, $('rolloverToggle').checked); await loadAllData();
    const rows = allocationRows(month); const defaultTotal = rows.reduce((s,a)=>s+num(getBucket(a.bucket_id).default_budget),0) || 1;
    for (const a of rows) { const ratio = num(getBucket(a.bucket_id).default_budget) / defaultTotal; await supa(sb.from(TABLES.allocations).update({ base_budget: totalBudget * ratio, rollover_in: $('rolloverToggle').checked ? getPreviousRemaining(month, a.bucket_id) : 0 }).eq('id', a.id).select()); }
    await refresh(); toast('สร้าง/อัปเดตงบเดือนเรียบร้อย');
  } catch (err) { console.error(err); toast(err.message, 'error'); } finally { showLoading(false); }
}
async function updateAllocationBase(id, value) { await supa(sb.from(TABLES.allocations).update({ base_budget: Math.max(clean(value),0) }).eq('id', id).select()); await refresh(); }
async function recalculateRollover() { for (const a of allocationRows()) await supa(sb.from(TABLES.allocations).update({ rollover_in: getPreviousRemaining(selectedMonth, a.bucket_id) }).eq('id', a.id).select()); await refresh(); toast('คำนวณ Rollover ใหม่แล้ว'); }
async function resetSelectedMonth() { if(!confirm(`Reset budget allocations for ${selectedMonth}?`)) return; await supa(sb.from(TABLES.allocations).delete().eq('month', selectedMonth)); await loadAllData(); await ensureMonth(selectedMonth, true); await refresh(); toast('Reset เดือนที่เลือกแล้ว'); }
async function removeAllocation(id) { if(!confirm('นำงบนี้ออกจากเดือนนี้? ข้อมูลเก่าในรายการสั่งซื้อจะยังอยู่')) return; await supa(sb.from(TABLES.allocations).update({ is_active:false }).eq('id',id).select()); await refresh(); }
function openManualModal(){ populateBucketOptions('manualBucketId'); $('manualModal').classList.add('show'); updateManualPreview(); }
function closeManualModal(){ $('manualModal').classList.remove('show'); }
function getManualUnitCny(){ const cur=$('manualCurrency').value, unit=clean($('manualUnitPrice').value), rate=clean($('manualRate').value)||0; return cur==='THB'?unit*rate:unit; }
function updateManualPreview(){ const total=clean($('manualOrderQty').value)*getManualUnitCny(); $('manualPreviewCny').textContent=fmt(total); }
async function handleSaveManualOrder(e){ e.preventDefault(); showLoading(true); try{ const unitCny=getManualUnitCny(); const rec={ month:selectedMonth,bucket_id:$('manualBucketId').value,no:String(monthPlans().length+1),part_name:$('manualPartName').value.trim(),part_name_cn:$('manualPartNameCn').value.trim(),model:$('manualModel').value.trim(),brand:$('manualBrand').value.trim(),request_qty:clean($('manualRequestQty').value),order_qty:clean($('manualOrderQty').value),currency:$('manualCurrency').value,unit_price_original:clean($('manualUnitPrice').value),rate_to_cny:$('manualCurrency').value==='THB'?clean($('manualRate').value):1,unit_price_cny:unitCny,requester:$('manualRequester').value.trim(),use_position:$('manualUsePosition').value.trim(),urgency:$('manualUrgency').value,remark:$('manualRemark').value.trim(),source_type:'Manual Order'}; await supa(sb.from(TABLES.plans).insert(rec).select()); $('manualForm').reset(); closeManualModal(); await refresh(); toast('บันทึกรายการแล้ว'); }catch(err){toast(err.message,'error')}finally{showLoading(false)} }
function openBucketModal(id=null){ clearBucketForm(); if(id){ const b=getBucket(id); $('bucketModalTitle').textContent='Edit Budget Bucket'; $('bucketId').value=b.id; $('bucketCode').value=b.code; $('bucketGroup').value=b.group_name; $('bucketOwner').value=b.owner; $('bucketDepartment').value=b.department; $('bucketDefaultBudget').value=num(b.default_budget); $('bucketActive').checked=!!b.is_active; } else $('bucketModalTitle').textContent='Add Budget Bucket'; $('bucketModal').classList.add('show'); }
function closeBucketModal(){ $('bucketModal').classList.remove('show'); }
function clearBucketForm(){ $('bucketForm').reset(); $('bucketId').value=''; $('bucketGroup').value='Project'; $('bucketActive').checked=true; }
async function handleSaveBucket(e){ e.preventDefault(); showLoading(true); try{ const id=$('bucketId').value; const rec={ code:$('bucketCode').value.trim().toUpperCase(), group_name:$('bucketGroup').value.trim(), owner:$('bucketOwner').value.trim(), department:$('bucketDepartment').value.trim(), default_budget:clean($('bucketDefaultBudget').value), is_active:$('bucketActive').checked }; let saved; if(id) saved=await supa(sb.from(TABLES.buckets).update(rec).eq('id',id).select().single()); else saved=await supa(sb.from(TABLES.buckets).insert({ ...rec, is_system:false }).select().single()); closeBucketModal(); await loadAllData(); await ensureMonth(selectedMonth,true); await refresh(); toast('บันทึกงบย่อยแล้ว'); }catch(err){toast(err.message,'error')}finally{showLoading(false)} }
async function deleteBucket(id){ const b=getBucket(id); const used=plans.some(p=>p.bucket_id===id)||transfers.some(t=>t.from_bucket_id===id||t.to_bucket_id===id)||allocations.some(a=>a.bucket_id===id); if(used){ if(!confirm('งบนี้มีประวัติใช้งานแล้ว ระบบจะปิดใช้งานแทนการลบ เพื่อไม่ให้ข้อมูลย้อนหลังพัง')) return; await supa(sb.from(TABLES.buckets).update({is_active:false}).eq('id',id).select()); } else { if(!confirm(`Delete ${b.code}?`)) return; await supa(sb.from(TABLES.buckets).delete().eq('id',id)); } await refresh(); }
function populateBucketOptions(id){ $(id).innerHTML=activeBuckets().map(b=>`<option value="${b.id}">${b.code} — ${b.owner} / ${b.department}</option>`).join(''); }
function openTransferModal(){ populateBucketOptions('transferFrom'); populateBucketOptions('transferTo'); $('transferModal').classList.add('show'); validateTransferSelect(); updateTransferPreview(); }
function openTransferModalWithTarget(target){ openTransferModal(); $('transferTo').value=target; if($('transferFrom').value===target){ const alt=activeBuckets().find(b=>b.id!==target); if(alt) $('transferFrom').value=alt.id; } validateTransferSelect(); updateTransferPreview(); }
function closeTransferModal(){ $('transferModal').classList.remove('show'); }
function clearTransferForm(){ $('transferForm').reset(); populateBucketOptions('transferFrom'); populateBucketOptions('transferTo'); updateTransferPreview(); }
function updateTransferPreview(){ $('transferAmountThb').value=fmtTHB(thb(clean($('transferAmount').value))); }
function validateTransferSelect(){ $('transferTo').setCustomValidity($('transferFrom').value===$('transferTo').value?'ห้ามโยกงบก้อนเดียวกัน':''); }
async function handleSaveTransfer(e){ e.preventDefault(); if($('transferFrom').value===$('transferTo').value){toast('ห้ามโยกงบก้อนเดียวกัน','error');return;} await supa(sb.from(TABLES.transfers).insert({month:selectedMonth,from_bucket_id:$('transferFrom').value,to_bucket_id:$('transferTo').value,amount_cny:clean($('transferAmount').value),reason:$('transferReason').value.trim()}).select()); closeTransferModal(); await refresh(); toast('บันทึกการโยกงบแล้ว'); }
async function deleteTransfer(id){ if(!confirm('ลบประวัติโยกงบนี้?'))return; await supa(sb.from(TABLES.transfers).delete().eq('id',id)); await refresh(); }
async function updateOrderQty(id,value){ await supa(sb.from(TABLES.plans).update({order_qty:Math.max(clean(value),0)}).eq('id',id).select()); await refresh(); }
async function updatePlanBucket(id,bucketId){ await supa(sb.from(TABLES.plans).update({bucket_id:bucketId}).eq('id',id).select()); await refresh(); }
async function deletePlan(id){ if(!confirm('ลบรายการนี้?'))return; await supa(sb.from(TABLES.plans).delete().eq('id',id)); await refresh(); }
function filterPlanningByBucket(id){ switchPage('planningPage'); $('bucketFilter').value=id; renderPlanningTable(); }
async function autoFitBudget(){ for(const a of allocationRows()){ let s=budgetSummary(selectedMonth,a.bucket_id); const rows=monthPlans().filter(p=>p.bucket_id===a.bucket_id).sort((x,y)=>num(y.unit_price_cny)-num(x.unit_price_cny)); for(const p of rows){ while(s.remaining<0 && num(p.order_qty)>0){ p.order_qty=num(p.order_qty)-1; await supa(sb.from(TABLES.plans).update({order_qty:p.order_qty}).eq('id',p.id).select()); await loadAllData(); s=budgetSummary(selectedMonth,a.bucket_id); } } } await refresh(); toast('Auto Fit Budget แล้ว'); }
async function clearCurrentMonthOrders(){ if(!confirm(`ลบรายการ Order ทั้งหมดของ ${selectedMonth}?`))return; await supa(sb.from(TABLES.plans).delete().eq('month',selectedMonth)); await refresh(); }
async function createNextMonthCarry(){ const carry=monthPlans().filter(p=>remainQty(p)>0); if(!carry.length){toast('ไม่มีรายการ Carry Forward');return;} const next=getNextMonth(selectedMonth); await ensureMonth(next,true); const records=carry.map((p,i)=>({month:next,bucket_id:p.bucket_id,no:String(i+1),part_name_cn:p.part_name_cn,part_name:p.part_name,model:p.model,brand:p.brand,request_qty:remainQty(p),order_qty:remainQty(p),currency:p.currency,unit_price_original:p.unit_price_original,rate_to_cny:p.rate_to_cny,unit_price_cny:p.unit_price_cny,requester:p.requester,use_position:p.use_position,urgency:p.urgency,delivery_date:p.delivery_date,planned_delivery:p.planned_delivery,remark:`Carry from ${selectedMonth}`,source_type:'Carry Forward',source_carry_id:p.id})); await supa(sb.from(TABLES.plans).insert(records).select()); selectedMonth=next; localStorage.setItem('mpr_budget_selected_month',next); await refresh(); toast(`สร้างแผนเดือน ${next} แล้ว`); }
async function handleImportFile(e){ const file=e.target.files[0]; if(!file)return; showLoading(true); try{ const rows=await readWorkbook(file); const records=rows.map((r,i)=>mapImportRow(r,i,file.name)).filter(Boolean); if(!records.length)throw new Error('ไม่พบข้อมูลที่นำเข้าได้'); await supa(sb.from(TABLES.plans).insert(records).select()); await refresh(); toast(`Import สำเร็จ ${records.length} รายการ`); }catch(err){toast(err.message,'error')}finally{e.target.value='';showLoading(false)} }
function readWorkbook(file){ return new Promise((resolve,reject)=>{ const reader=new FileReader(); reader.onload=ev=>{ try{ const data=new Uint8Array(ev.target.result); const wb=XLSX.read(data,{type:'array'}); const sheet=wb.Sheets[wb.SheetNames[0]]; resolve(XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false})); }catch(err){reject(err)} }; reader.onerror=reject; reader.readAsArrayBuffer(file); }); }
function norm(v){return String(v||'').replace(/\n/g,' ').replace(/\s+/g,'').toLowerCase()} function val(row,keys){ const nk=Object.fromEntries(Object.keys(row).map(k=>[norm(k),row[k]])); for(const k of keys){ const p=norm(k); const found=Object.keys(nk).find(x=>x===p||x.includes(p)||p.includes(x)); if(found && nk[found]!== '') return nk[found]; } return ''; }
function matchBucketByRequester(req){ const text=String(req||'').toLowerCase(); return activeBuckets().find(b=>text.includes(String(b.owner).toLowerCase())||text.includes(String(b.department).toLowerCase()))||activeBuckets()[0]; }
function mapImportRow(row,i,fileName){ const part=val(row,['备件英文名称','English Name','Part Name','Spare Part Name']); const cn=val(row,['备件中文名称','CN Name']); const model=val(row,['备件型号','Model','รุ่นอะไหล่']); if(!part&&!cn&&!model)return null; const requester=val(row,['提报人','Requester','คนสั่ง']); const bucket=matchBucketByRequester(requester); const requestQty=clean(val(row,['提报数量','Request Qty','จำนวนที่ขอสั่ง'])); const orderQty=clean(val(row,['TPT确认下单数量','Order quantity','Order Qty'])); const unit=clean(val(row,['WTD单价/CNY','Unit price','Unit Price CNY'])); return {month:selectedMonth,bucket_id:bucket?.id,no:val(row,['序号','No','ลำดับ'])||String(i+1),part_name_cn:cn,part_name:part,model,brand:val(row,['品牌','Brand']),request_qty:requestQty,order_qty:orderQty,currency:'CNY',unit_price_original:unit,rate_to_cny:1,unit_price_cny:unit,requester,use_position:val(row,['使用部位','Use Position']),urgency:val(row,['紧急程度','Urgency']),delivery_date:val(row,['WTD货期','Delivery date']),planned_delivery:val(row,['计划送货时间','Planned delivery time']),remark:val(row,['备注','Remark']),source_file:fileName,source_type:'Supplier Import'}; }
function sheetBudgetSummary(){ return allocationRows().map(a=>{ const b=getBucket(a.bucket_id), s=budgetSummary(selectedMonth,a.bucket_id); return {'Month':selectedMonth,'Budget Code':b.code,'Group':b.group_name,'Owner':b.owner,'Department':b.department,'Base CNY':s.base,'Rollover CNY':s.roll,'Transfer In CNY':s.tin,'Transfer Out CNY':s.tout,'Total Available CNY':s.total,'Used CNY':s.used,'Remaining CNY':s.remaining,'Remaining THB':thb(s.remaining),'Usage %':s.usage,'Status':s.status}; }); }
function sheetOrders(rows=monthPlans()){ return rows.map(p=>({'Month':p.month,'Budget Code':getBucket(p.bucket_id).code,'No':p.no,'CN Name':p.part_name_cn,'Part Name':p.part_name,'Model':p.model,'Brand':p.brand,'Request Qty':p.request_qty,'Order Qty':p.order_qty,'Remaining Qty':remainQty(p),'Unit Price CNY':p.unit_price_cny,'Total CNY':planTotal(p),'Requester':p.requester,'Use Position':p.use_position,'Urgency':p.urgency,'Status':planStatus(p),'Source':p.source_type})); }
function sheetTransfers(){ return monthTransfers().map(t=>({'Month':t.month,'Date':t.transfer_date,'From':getBucket(t.from_bucket_id).code,'To':getBucket(t.to_bucket_id).code,'Amount CNY':t.amount_cny,'Amount THB':thb(t.amount_cny),'Reason':t.reason})); }
async function logExport(type,fileName,count){ await supa(sb.from(TABLES.logs).insert({month:selectedMonth,export_type:type,file_name:fileName,total_records:count}).select()); await loadAllData(); renderExportLogs(); }
function downloadWorkbook(fileName,sheets){ const wb=XLSX.utils.book_new(); for(const [name,data] of Object.entries(sheets)){ XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data),name); } XLSX.writeFile(wb,fileName); }
async function exportFinalOrder(){ const data=sheetOrders(monthPlans().filter(p=>num(p.order_qty)>0)); const fn=`Final_Order_${selectedMonth}.xlsx`; downloadWorkbook(fn,{Final_Order:data}); await logExport('Final Order',fn,data.length); }
async function exportCarryForward(){ const data=sheetOrders(monthPlans().filter(p=>remainQty(p)>0)); const fn=`Carry_Forward_${selectedMonth}.xlsx`; downloadWorkbook(fn,{Carry_Forward:data}); await logExport('Carry Forward',fn,data.length); }
async function exportBudgetUsage(){ const orders=sheetOrders(), summary=sheetBudgetSummary(), trans=sheetTransfers(); const fn=`Budget_Usage_Report_${selectedMonth}.xlsx`; downloadWorkbook(fn,{'Budget Summary':summary,'Order Usage':orders,'Transfers':trans}); await logExport('Budget Usage',fn,summary.length+orders.length+trans.length); }
