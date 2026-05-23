/* MPR Budget Manager | Supabase Full Backend V3 Fixed */
const TABLES = {
  months: 'budget_months',
  buckets: 'budget_buckets',
  allocations: 'monthly_budget_allocations',
  plans: 'order_plans',
  transfers: 'budget_transfers',
  exports: 'budget_export_logs'
};

const BUDGET_MATCH_ALIASES = {
  "BUD-MVR": [
    "apiwut",
    "thames",
    "เทมส์",
    "mprapiwut",
    "mvrapiwut",
    "mvr apiwut"
  ],
  "BUD-MSR": [
    "chaiphat",
    "com",
    "msrchaiphat",
    "msr chaiphat"
  ],
  "BUD-LOTUS": [
    "ratthathammanun",
    "kong",
    "lotus",
    "mvrratthathammanun",
    "mvr-ratthathammanun"
  ],
  "BUD-UTILITY": [
    "mvr龙伟",
    "龙伟",
    "mvr庞伟",
    "庞伟",
    "utility",
    "utilities",
    "longwei",
    "pangwei",
    "mvr utility"
  ],
  "BUD-URGENT": [
    "urgent",
    "emergency",
    "critical",
    "priority",
    "ด่วน",
    "เร่งด่วน",
    "优先",
    "优先处理"
  ],
  "BUD-LOCAL-TH": [
    "local",
    "thailand",
    "thai",
    "ซื้อไทย",
    "ซื้อในไทย",
    "local purchase",
    "thailand purchase"
  ]
};

let sb = null;
let months = [];
let buckets = [];
let allocations = [];
let plans = [];
let transfers = [];
let exportLogs = [];
let selectedMonth = localStorage.getItem('mpr_budget_selected_month') || currentMonth();
let cnyToThbRate = 5;

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindEvents();

  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || window.SUPABASE_URL.includes('YOUR-PROJECT')) {
    setConnection(false, 'Supabase not configured', 'Please set supabase-config.js');
    toast('ยังไม่ได้ตั้งค่า Supabase URL / anon key', 'error');
    return;
  }

  sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  setConnection(true, 'Supabase connected', 'Full backend mode');

  showLoading(true);
  try {
    await loadAllData();
    await ensureMonth(selectedMonth, true);
    await loadAllData();
    await refresh();
  } catch (err) {
    console.error(err);
    toast('เชื่อมต่อ Supabase ไม่สำเร็จ: ' + err.message, 'error');
    setConnection(false, 'Supabase error', err.message);
  } finally {
    showLoading(false);
  }
}

function bindEvents() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.dataset.page));
  });
  document.querySelectorAll('.nav-shortcut').forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.dataset.targetPage));
  });

  $('monthForm').addEventListener('submit', handleCreateMonth);
  $('dashboardMonthSelect').addEventListener('change', handleMonthChange);
  $('monthSelect').addEventListener('change', handleMonthChange);

  $('openManualModalBtn').addEventListener('click', openManualModal);
  $('closeManualModalBtn').addEventListener('click', closeManualModal);
  $('manualForm').addEventListener('submit', handleSaveManualOrder);
  $('clearManualFormBtn').addEventListener('click', clearManualForm);
  ['manualRequestQty','manualOrderQty','manualCurrency','manualUnitPrice','manualRate'].forEach(id => {
    $(id).addEventListener('input', updateManualPreview);
    $(id).addEventListener('change', updateManualPreview);
  });

  $('openTransferModalBtn').addEventListener('click', openTransferModal);
  $('openTransferFromPageBtn').addEventListener('click', openTransferModal);
  $('closeTransferModalBtn').addEventListener('click', closeTransferModal);
  $('transferForm').addEventListener('submit', handleSaveTransfer);
  $('clearTransferFormBtn').addEventListener('click', clearTransferForm);
  $('transferAmount').addEventListener('input', updateTransferPreview);
  $('transferFrom').addEventListener('change', validateTransferSelect);
  $('transferTo').addEventListener('change', validateTransferSelect);

  $('openBucketModalBtn').addEventListener('click', () => openBucketModal());
  $('openBucketModalFromMasterBtn').addEventListener('click', () => openBucketModal());
  $('closeBucketModalBtn').addEventListener('click', closeBucketModal);
  $('bucketForm').addEventListener('submit', handleSaveBucket);
  $('clearBucketFormBtn').addEventListener('click', clearBucketForm);

  $('searchInput').addEventListener('input', renderPlanningTable);
  $('budgetFilter').addEventListener('change', renderPlanningTable);
  $('statusFilter').addEventListener('change', renderPlanningTable);
  $('autoFitBudgetBtn').addEventListener('click', autoFitBudget);
  $('clearCurrentMonthBtn').addEventListener('click', clearCurrentMonthData);

  $('recalcRolloverBtn').addEventListener('click', recalculateRollover);
  $('resetMonthBtn').addEventListener('click', resetSelectedMonth);
  $('createNextMonthBtn').addEventListener('click', createNextMonthWithRollover);
  $('createNextMonthCarryBtn').addEventListener('click', createNextMonthFromCarry);

  $('importFile').addEventListener('change', handleImportFile);
  $('exportOrderBtn').addEventListener('click', exportFinalOrder);
  $('exportCarryBtn').addEventListener('click', exportCarryForward);
  $('exportBudgetUsageBtn').addEventListener('click', exportBudgetUsageReport);
}

async function supa(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function loadAllData() {
  const [
    monthsData,
    bucketsData,
    allocationsData,
    plansData,
    transfersData,
    exportData
  ] = await Promise.all([
    supa(sb.from(TABLES.months).select('*').order('month', { ascending: false })),
    supa(sb.from(TABLES.buckets).select('*').order('code')),
    supa(sb.from(TABLES.allocations).select('*').order('month', { ascending: false })),
    supa(sb.from(TABLES.plans).select('*').order('created_at', { ascending: false })),
    supa(sb.from(TABLES.transfers).select('*').order('created_at', { ascending: false })),
    supa(sb.from(TABLES.exports).select('*').order('created_at', { ascending: false }))
  ]);

  months = monthsData || [];
  buckets = bucketsData || [];
  allocations = allocationsData || [];
  plans = plansData || [];
  transfers = transfersData || [];
  exportLogs = exportData || [];

  const monthRow = months.find(m => m.month === selectedMonth);
  cnyToThbRate = num(monthRow?.cny_to_thb_rate || cnyToThbRate || 5);
}

async function refresh() {
  populateMonthSelectors();
  populateBudgetFilters();
  populateBucketOptions();
  renderSidebar();
  renderDashboard();
  renderBudgetAllocationCards();
  renderAttentionList();
  renderTopSpending();
  renderRecentTransfers();
  renderMonthlyBudget();
  renderPlanningTable();
  renderTransferHistory();
  renderCarryForward();
  renderMaster();
  updatePlanningStats();
}

/* Helpers */
function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}
function nextMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 1).toISOString().slice(0, 7);
}
function previousMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 2, 1).toISOString().slice(0, 7);
}
function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  return Number(String(v).replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;
}
function clean(v) { return num(v); }

function hasCellValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatCNY(v) { return `${fmt(v)} CNY`; }
function toTHB(cny) { return num(cny) * num(cnyToThbRate || 5); }
function formatTHB(v) { return `${fmt(v)} THB`; }
function moneyBoth(cny) {
  return `<strong>${formatCNY(cny)}</strong><span class="money-sub">≈ ${formatTHB(toTHB(cny))}</span>`;
}
function activeBuckets() {
  return buckets.filter(b => b.is_active !== false);
}
function getBucket(id) {
  return buckets.find(b => b.id === id) || null;
}
function getBucketByCode(code) {
  return buckets.find(b => String(b.code).toLowerCase() === String(code).toLowerCase()) || null;
}
function bucketLabel(bucket) {
  if (!bucket) return '-';
  return `${bucket.code} — ${bucket.owner} / ${bucket.department}`;
}
function allocationRows(month = selectedMonth) {
  return allocations
    .filter(a => a.month === month && a.is_active !== false)
    .map(a => ({ ...a, bucket: getBucket(a.bucket_id) }))
    .filter(a => a.bucket && a.bucket.is_active !== false)
    .sort((a, b) => a.bucket.code.localeCompare(b.bucket.code));
}
function monthPlans(month = selectedMonth) {
  return plans.filter(p => p.month === month);
}
function monthTransfers(month = selectedMonth) {
  return transfers.filter(t => t.month === month);
}
function planTotal(plan) {
  return num(plan.order_qty) * num(plan.unit_price_cny);
}
function remainQty(plan) {
  return num(plan.request_qty) - num(plan.order_qty);
}
function planStatus(plan) {
  const req = num(plan.request_qty);
  const ord = num(plan.order_qty);
  if (ord === 0) return 'Not Ordered';
  if (ord < req) return 'Partial Ordered';
  if (ord === req) return 'Completed';
  return 'Over Order';
}
function badgeClass(status) {
  if (status === 'Completed' || status === 'Normal') return 'normal';
  if (status === 'Partial Ordered' || status === 'Warning') return 'warning';
  if (status === 'Not Ordered') return 'not';
  return 'danger';
}
function getPreviousRemaining(month, bucketId) {
  const prev = previousMonth(month);
  const previousSummary = calcBudget(prev, bucketId);
  return Math.max(previousSummary.remaining, 0);
}
function calcBudget(month, bucketId) {
  const allocation = allocations.find(a => a.month === month && a.bucket_id === bucketId && a.is_active !== false);
  const base = num(allocation?.base_budget);
  const rollover = num(allocation?.rollover_in);

  const transferIn = transfers
    .filter(t => t.month === month && t.to_bucket_id === bucketId)
    .reduce((sum, t) => sum + num(t.amount_cny), 0);

  const transferOut = transfers
    .filter(t => t.month === month && t.from_bucket_id === bucketId)
    .reduce((sum, t) => sum + num(t.amount_cny), 0);

  const total = base + rollover + transferIn - transferOut;

  const used = plans
    .filter(p => p.month === month && p.bucket_id === bucketId)
    .reduce((sum, p) => sum + planTotal(p), 0);

  const remaining = total - used;
  const usage = total > 0 ? (used / total) * 100 : 0;

  let status = "Normal";
  let level = "normal";
  let message = "งบยังเพียงพอ";

  if (remaining < 0) {
    status = "Over Budget";
    level = "danger";
    message = `เกินงบ ${formatCNY(Math.abs(remaining))}`;
  } else if (usage >= 90) {
    status = "Almost Empty";
    level = "danger";
    message = "งบใกล้หมดมาก ควรตรวจสอบ";
  } else if (usage >= 75) {
    status = "Warning";
    level = "warning";
    message = "ใช้งบเกิน 75% แล้ว";
  }

  return { base, rollover, transferIn, transferOut, total, used, remaining, usage, status, level, message };
}
function calcMonth(month = selectedMonth) {
  const rows = allocationRows(month);
  let total = 0;
  let used = 0;

  rows.forEach(allocation => {
    const summary = calcBudget(month, allocation.bucket_id);
    total += summary.total;
    used += summary.used;
  });

  const remaining = total - used;
  const usage = total > 0 ? (used / total) * 100 : 0;

  let status = "Normal";
  let level = "normal";
  let message = "งบยังเพียงพอ";

  if (remaining < 0) {
    status = "Over Budget";
    level = "danger";
    message = `เกินงบ ${formatCNY(Math.abs(remaining))}`;
  } else if (usage >= 90) {
    status = "Almost Empty";
    level = "danger";
    message = "งบใกล้หมดมาก";
  } else if (usage >= 75) {
    status = "Warning";
    level = "warning";
    message = "ใช้งบเกิน 75% แล้ว";
  }

  return { total, used, remaining, usage, status, level, message, bucketCount: rows.length };
}
function sumAllocationBase(month = selectedMonth) {
  return allocations
    .filter(a => a.month === month && a.is_active !== false)
    .reduce((sum, a) => sum + num(a.base_budget), 0);
}
async function syncMonthBaseTotal(month = selectedMonth) {
  const total = sumAllocationBase(month);
  await supa(
    sb.from(TABLES.months)
      .update({ base_total: total, cny_to_thb_rate: cnyToThbRate })
      .eq('month', month)
      .select()
  );
}

/* Supabase month / allocations */
async function ensureMonth(month, useRollover = true) {
  const existingMonth = months.find(m => m.month === month);

  if (!existingMonth) {
    const totalDefault = activeBuckets().reduce((sum, b) => sum + num(b.default_budget), 0);

    await supa(
      sb.from(TABLES.months)
        .upsert({
          month,
          base_total: totalDefault,
          cny_to_thb_rate: cnyToThbRate
        }, { onConflict: "month" })
        .select()
    );

    await loadAllData();
  }

  const existingAllocationBucketIds = new Set(
    allocations.filter(a => a.month === month).map(a => a.bucket_id)
  );

  const inserts = [];

  activeBuckets().forEach(bucket => {
    if (!existingAllocationBucketIds.has(bucket.id)) {
      inserts.push({
        month,
        bucket_id: bucket.id,
        base_budget: num(bucket.default_budget),
        rollover_in: useRollover ? getPreviousRemaining(month, bucket.id) : 0,
        is_active: true
      });
    }
  });

  if (inserts.length) {
    await supa(sb.from(TABLES.allocations).insert(inserts).select());
  }

  await loadAllData();
  await syncMonthBaseTotal(month);
}

async function handleCreateMonth(e) {
  e.preventDefault();
  showLoading(true);

  try {
    const month = $("monthInput").value;
    const useRollover = $("rolloverToggle").checked;

    selectedMonth = month;
    localStorage.setItem("mpr_budget_selected_month", month);

    cnyToThbRate = clean($("cnyToThbInput").value) || 5;

    const existingMonth = months.find(m => m.month === month);

    if (!existingMonth) {
      const defaultTotal = activeBuckets().reduce((sum, b) => sum + num(b.default_budget), 0);
      await supa(sb.from(TABLES.months).insert({ month, base_total: defaultTotal, cny_to_thb_rate: cnyToThbRate }).select());
    } else {
      await supa(sb.from(TABLES.months).update({ cny_to_thb_rate: cnyToThbRate }).eq("month", month).select());
    }

    await loadAllData();
    await ensureMonth(month, useRollover);

    if (useRollover) {
      await loadAllData();
      const rows = allocationRows(month);
      for (const allocation of rows) {
        await supa(
          sb.from(TABLES.allocations)
            .update({ rollover_in: getPreviousRemaining(month, allocation.bucket_id) })
            .eq("id", allocation.id)
            .select()
        );
      }
    }

    await loadAllData();
    await syncMonthBaseTotal(month);
    await refresh();

    toast("สร้าง/อัปเดตเดือนเรียบร้อย ข้อมูลแยกเดือนแล้ว", "success");
  } catch (err) {
    console.error(err);
    toast(err.message, "error");
  } finally {
    showLoading(false);
  }
}

async function updateAllocationBase(id, value) {
  showLoading(true);
  try {
    const baseBudget = Math.max(clean(value), 0);
    await supa(
      sb.from(TABLES.allocations)
        .update({ base_budget: baseBudget })
        .eq('id', id)
        .select()
    );
    await loadAllData();
    await syncMonthBaseTotal(selectedMonth);
    await loadAllData();
    await refresh();
    toast('อัปเดตงบเดือนนี้แล้ว', 'success');
  } catch (err) {
    console.error(err);
    toast(err.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function recalculateRollover() {
  showLoading(true);
  try {
    const rows = allocationRows(selectedMonth);
    for (const allocation of rows) {
      await supa(
        sb.from(TABLES.allocations)
          .update({ rollover_in: getPreviousRemaining(selectedMonth, allocation.bucket_id) })
          .eq("id", allocation.id)
          .select()
      );
    }
    await loadAllData();
    await syncMonthBaseTotal(selectedMonth);
    await refresh();
    toast("คำนวณ Rollover ใหม่จากเดือนก่อนแล้ว", "success");
  } catch (err) {
    console.error(err);
    toast(err.message, "error");
  } finally {
    showLoading(false);
  }
}

async function resetSelectedMonth() {
  if (!confirm(`Reset allocations and transfers for ${selectedMonth}? Order plans will remain.`)) return;
  showLoading(true);
  try {
    await supa(sb.from(TABLES.allocations).delete().eq('month', selectedMonth));
    await supa(sb.from(TABLES.transfers).delete().eq('month', selectedMonth));
    await loadAllData();
    await ensureMonth(selectedMonth, true);
    await loadAllData();
    await syncMonthBaseTotal(selectedMonth);
    await refresh();
    toast('Reset เดือนที่เลือกแล้ว', 'success');
  } catch (err) {
    console.error(err);
    toast(err.message, 'error');
  } finally {
    showLoading(false);
  }
}

/* Render */
function populateMonthSelectors() {
  const monthSet = new Set(months.map(m => m.month));
  monthSet.add(selectedMonth);
  const all = [...monthSet].sort().reverse();
  const options = all.map(m => `<option value="${m}">${m}</option>`).join('');
  ['dashboardMonthSelect', 'monthSelect'].forEach(id => {
    if ($(id)) {
      $(id).innerHTML = options;
      $(id).value = selectedMonth;
    }
  });
  $('monthInput').value = selectedMonth;
  $('cnyToThbInput').value = cnyToThbRate;
}
function populateBudgetFilters() {
  $('budgetFilter').innerHTML =
    `<option value="ALL">All Budget</option>` +
    activeBuckets().map(b => `<option value="${b.id}">${b.code}</option>`).join('');
}
function populateBucketOptions() {
  const options = activeBuckets().map(b => `<option value="${b.id}">${bucketLabel(b)}</option>`).join('');
  ['manualBucketId','transferFrom','transferTo'].forEach(id => {
    if ($(id)) $(id).innerHTML = options;
  });
}
async function handleMonthChange(e) {
  selectedMonth = e.target.value;
  localStorage.setItem('mpr_budget_selected_month', selectedMonth);
  showLoading(true);
  try {
    await ensureMonth(selectedMonth, true);
    await loadAllData();
    const row = months.find(m => m.month === selectedMonth);
    cnyToThbRate = num(row?.cny_to_thb_rate || 5);
    await refresh();
  } catch (err) {
    console.error(err);
    toast(err.message, 'error');
  } finally {
    showLoading(false);
  }
}
function renderSidebar() {
  const s = calcMonth(selectedMonth);
  $('sideMonth').textContent = selectedMonth;
  $('sideBudget').textContent = formatCNY(s.total);
  $('sideBudgetThb').textContent = `≈ ${formatTHB(toTHB(s.total))}`;
}
function renderDashboard() {
  const s = calcMonth(selectedMonth);
  $('kpiTotalBudget').textContent = formatCNY(s.total);
  $('kpiTotalBudgetThb').textContent = `≈ ${formatTHB(toTHB(s.total))}`;
  $('kpiUsedBudget').textContent = formatCNY(s.used);
  $('kpiUsedBudgetThb').textContent = `≈ ${formatTHB(toTHB(s.used))}`;
  $('kpiRemainBudget').textContent = formatCNY(s.remaining);
  $('kpiRemainBudgetThb').textContent = `≈ ${formatTHB(toTHB(s.remaining))}`;
  $('kpiStatus').textContent = s.status;
  $('kpiStatusMessage').textContent = s.message;
  $('kpiStatusCard').className = `kpi-card status ${s.level}`;
}
function renderBudgetAllocationCards() {
  const grid = $('budgetAllocationGrid');
  const rows = allocationRows(selectedMonth);
  if (!rows.length) {
    grid.innerHTML = `<div class="empty-state">ยังไม่มีงบของเดือนนี้ กรุณาสร้างงบในหน้า Monthly Budget</div>`;
    return;
  }

  grid.innerHTML = rows.map(a => {
    const b = a.bucket;
    const s = calcBudget(selectedMonth, a.bucket_id);
    const width = Math.min(Math.max(s.usage, 0), 100);
    return `
      <article class="budget-card ${s.level}">
        <div class="budget-card-head">
          <div>
            <div class="budget-code">${b.code}</div>
            <div class="budget-owner">${b.owner} / ${b.department}</div>
          </div>
          <span class="badge ${badgeClass(s.status)}">${s.status}</span>
        </div>
        <div class="budget-remaining">
          <span>Remaining Budget</span>
          <strong>${formatCNY(s.remaining)}</strong>
          <small>≈ ${formatTHB(toTHB(s.remaining))}</small>
        </div>
        <div class="budget-mini-row"><span>Total</span><strong>${formatCNY(s.total)}</strong></div>
        <div class="budget-mini-row"><span>Used</span><strong>${formatCNY(s.used)}</strong></div>
        <div class="budget-mini-row"><span>Usage</span><strong>${s.usage.toFixed(1)}%</strong></div>
        <div class="budget-progress"><div class="budget-progress-fill" style="width:${width}%"></div></div>
        <div class="budget-card-actions">
          <button class="mini-btn" onclick="openTransferModalWithTarget('${b.id}')">Transfer In</button>
          <button class="mini-btn" onclick="switchPage('planningPage')">View Orders</button>
        </div>
      </article>
    `;
  }).join('');
}
function renderAttentionList() {
  const rows = allocationRows(selectedMonth)
    .map(a => ({ a, b: a.bucket, s: calcBudget(selectedMonth, a.bucket_id) }))
    .filter(x => x.s.remaining < 0 || x.s.usage >= 75)
    .sort((x, y) => y.s.usage - x.s.usage);

  if (!rows.length) {
    $('attentionList').innerHTML = `<div class="empty-state success">งบทุกก้อนยังอยู่ในระดับปกติ</div>`;
    return;
  }

  $('attentionList').innerHTML = rows.map(x => `
    <div class="attention-item ${x.s.level}">
      <div>
        <strong>${x.b.code} — ${x.b.owner}</strong>
        <p>${x.s.message}</p>
      </div>
      <div>
        <strong>${formatCNY(x.s.remaining)}</strong>
        <p>${x.s.usage.toFixed(1)}% used</p>
      </div>
    </div>
  `).join('');
}
function renderTopSpending() {
  const rows = [...monthPlans(selectedMonth)]
    .sort((a, b) => planTotal(b) - planTotal(a))
    .slice(0, 6);
  $('topSpendingList').innerHTML = rows.length ? rows.map(p => `
    <div class="compact-item">
      <div><strong>${p.part_name || p.part_name_cn || p.model || '-'}</strong><p>${p.budget_code || '-'} | ${p.model || '-'}</p></div>
      <strong>${formatCNY(planTotal(p))}</strong>
    </div>
  `).join('') : `<div class="empty-state">ยังไม่มีรายการสั่งซื้อ</div>`;
}
function renderRecentTransfers() {
  const rows = monthTransfers(selectedMonth).slice(0, 6);
  $('recentTransferList').innerHTML = rows.length ? rows.map(t => {
    const from = getBucket(t.from_bucket_id);
    const to = getBucket(t.to_bucket_id);
    return `<div class="compact-item"><div><strong>${from?.code || '-'} → ${to?.code || '-'}</strong><p>${t.reason || '-'}</p></div><strong>${formatCNY(t.amount_cny)}</strong></div>`;
  }).join('') : `<div class="empty-state">ยังไม่มีประวัติโยกงบ</div>`;
}
function renderMonthlyBudget() {
  const s = calcMonth(selectedMonth);
  $('sumTotalAvailable').textContent = formatCNY(s.total);
  $('sumUsed').textContent = formatCNY(s.used);
  $('sumRemaining').textContent = formatCNY(s.remaining);
  $('sumBuckets').textContent = s.bucketCount;

  const rows = allocationRows(selectedMonth);
  $('monthBudgetBody').innerHTML = rows.length ? rows.map(a => {
    const b = a.bucket;
    const s = calcBudget(selectedMonth, a.bucket_id);
    return `
      <tr>
        <td>${a.month}</td>
        <td class="budget-code-cell"><strong>${b.code}</strong></td>
        <td>${b.group_name}</td>
        <td class="owner-cell">${b.owner}</td>
        <td class="department-cell">${b.department}</td>
        <td>
          <input class="budget-input" type="number" min="0" step="0.01" value="${num(a.base_budget)}"
            onchange="updateAllocationBase('${a.id}', this.value)">
          <span class="money-sub">≈ ${formatTHB(toTHB(a.base_budget))}</span>
        </td>
        <td>${moneyBoth(s.rollover)}</td>
        <td>${moneyBoth(s.transferIn)}</td>
        <td>${moneyBoth(s.transferOut)}</td>
        <td>${moneyBoth(s.total)}</td>
        <td>${moneyBoth(s.used)}</td>
        <td>${moneyBoth(s.remaining)}</td>
        <td>${s.usage.toFixed(1)}%</td>
        <td><span class="badge ${badgeClass(s.status)}">${s.status}</span></td>
        <td>
          <button class="mini-btn" onclick="openBucketModal('${b.id}')">Edit</button>
          <button class="mini-btn" onclick="openTransferModalWithTarget('${b.id}')">Transfer</button>
          <button class="mini-btn" onclick="removeBucket('${b.id}')">Remove</button>
        </td>
      </tr>
    `;
  }).join('') : `<tr><td colspan="15"><div class="empty-state">ยังไม่มีงบเดือนนี้</div></td></tr>`;
}

/* Bucket CRUD */
function openBucketModal(id = '') {
  clearBucketForm();
  if (id) {
    const b = getBucket(id);
    if (!b) return;
    $('bucketModalTitle').textContent = 'Edit Budget Bucket';
    $('bucketId').value = b.id;
    $('bucketCode').value = b.code;
    $('bucketGroup').value = b.group_name;
    $('bucketOwner').value = b.owner;
    $('bucketDepartment').value = b.department;
    $('bucketDefaultBudget').value = num(b.default_budget);
    $('bucketActive').checked = b.is_active !== false;
  } else {
    $('bucketModalTitle').textContent = 'Add Budget Bucket';
  }
  $('bucketModal').classList.add('show');
}
function closeBucketModal() {
  $('bucketModal').classList.remove('show');
}
function clearBucketForm() {
  $('bucketForm').reset();
  $('bucketId').value = '';
  $('bucketActive').checked = true;
}
async function handleSaveBucket(e) {
  e.preventDefault();
  showLoading(true);

  try {
    const id = $('bucketId').value;
    const rec = {
      code: $('bucketCode').value.trim().toUpperCase(),
      group_name: $('bucketGroup').value.trim(),
      owner: $('bucketOwner').value.trim(),
      department: $('bucketDepartment').value.trim(),
      default_budget: clean($('bucketDefaultBudget').value),
      is_active: $('bucketActive').checked
    };

    let savedBucket;
    if (id) {
      savedBucket = await supa(
        sb.from(TABLES.buckets)
          .update(rec)
          .eq('id', id)
          .select()
          .single()
      );
    } else {
      savedBucket = await supa(
        sb.from(TABLES.buckets)
          .insert({ ...rec, is_system: false })
          .select()
          .single()
      );
    }

    const bucketId = savedBucket.id || id;

    await loadAllData();

    const existingAllocation = allocations.find(a => a.month === selectedMonth && a.bucket_id === bucketId);

    if (rec.is_active) {
      if (existingAllocation) {
        await supa(
          sb.from(TABLES.allocations)
            .update({ base_budget: rec.default_budget, is_active: true })
            .eq('id', existingAllocation.id)
            .select()
        );
      } else {
        await supa(
          sb.from(TABLES.allocations)
            .insert({
              month: selectedMonth,
              bucket_id: bucketId,
              base_budget: rec.default_budget,
              rollover_in: $('rolloverToggle')?.checked ? getPreviousRemaining(selectedMonth, bucketId) : 0,
              is_active: true
            })
            .select()
        );
      }
    } else if (existingAllocation) {
      await supa(
        sb.from(TABLES.allocations)
          .update({ is_active: false })
          .eq('id', existingAllocation.id)
          .select()
      );
    }

    closeBucketModal();
    await loadAllData();
    await syncMonthBaseTotal(selectedMonth);
    await loadAllData();
    await refresh();

    toast('บันทึกงบและอัปเดตงบเดือนนี้แล้ว', 'success');
  } catch (err) {
    console.error(err);
    toast(err.message, 'error');
  } finally {
    showLoading(false);
  }
}
async function removeBucket(id) {
  const b = getBucket(id);
  if (!b) return;

  const usedByPlans = plans.some(p => p.bucket_id === id);
  const usedByTransfers = transfers.some(t => t.from_bucket_id === id || t.to_bucket_id === id);
  const msg = usedByPlans || usedByTransfers
    ? `งบ ${b.code} มีประวัติใช้งานแล้ว ระบบจะปิดใช้งานแทนการลบ ต้องการดำเนินการไหม?`
    : `ต้องการลบ/ปิดใช้งานงบ ${b.code} หรือไม่?`;
  if (!confirm(msg)) return;

  showLoading(true);
  try {
    if (usedByPlans || usedByTransfers || b.is_system) {
      await supa(sb.from(TABLES.buckets).update({ is_active: false }).eq('id', id).select());
      const a = allocations.find(x => x.month === selectedMonth && x.bucket_id === id);
      if (a) await supa(sb.from(TABLES.allocations).update({ is_active: false }).eq('id', a.id).select());
    } else {
      await supa(sb.from(TABLES.allocations).delete().eq('bucket_id', id));
      await supa(sb.from(TABLES.buckets).delete().eq('id', id));
    }
    await loadAllData();
    await syncMonthBaseTotal(selectedMonth);
    await loadAllData();
    await refresh();
    toast('อัปเดตสถานะงบแล้ว', 'success');
  } catch (err) {
    console.error(err);
    toast(err.message, 'error');
  } finally {
    showLoading(false);
  }
}
function renderMaster() {
  $('masterGrid').innerHTML = buckets.map(b => `
    <article class="master-card">
      <div class="master-card-head">
        <div>
          <h4>${b.code}</h4>
          <p>${b.group_name} | ${b.owner} | ${b.department}</p>
        </div>
        <span class="badge ${b.is_active ? 'normal' : 'danger'}">${b.is_active ? 'Active' : 'Inactive'}</span>
      </div>
      <p>Default Budget: <strong>${formatCNY(b.default_budget)}</strong></p>
      <p>${b.is_system ? 'System budget' : 'Custom budget'}</p>
      <div class="master-actions">
        <button class="mini-btn" onclick="openBucketModal('${b.id}')">Edit</button>
        <button class="mini-btn" onclick="removeBucket('${b.id}')">Remove</button>
      </div>
    </article>
  `).join('');
}

/* Planning */
function filteredPlans() {
  const q = $('searchInput').value.trim().toLowerCase();
  const bf = $('budgetFilter').value;
  const sf = $('statusFilter').value;

  return monthPlans(selectedMonth).filter(p => {
    const text = [p.part_name_cn, p.part_name, p.model, p.brand, p.requester, p.budget_code, p.department].join(' ').toLowerCase();
    const qOk = !q || text.includes(q);
    const bOk = bf === 'ALL' || p.bucket_id === bf;
    const sOk = sf === 'ALL' || planStatus(p) === sf;
    return qOk && bOk && sOk;
  });
}
function renderPlanningTable() {
  const rows = filteredPlans();

  if (!rows.length) {
    $("planningBody").innerHTML = `
      <tr>
        <td colspan="18">
          <div class="empty-state">
            ยังไม่มีข้อมูล กรุณา Import ไฟล์ Supplier หรือเพิ่ม Manual Order
          </div>
        </td>
      </tr>
    `;
    return;
  }

  $("planningBody").innerHTML = rows.map(p => {
    const status = planStatus(p);
    const totalCny = planTotal(p);

    return `
      <tr>
        <td>${p.no || "-"}</td>
        <td><div class="cell-clamp"><strong>${p.budget_code || "-"}</strong></div></td>
        <td><div class="cell-clamp">${p.budget_owner || "-"}</div></td>
        <td><div class="cell-clamp">${p.department || "-"}</div></td>
        <td><div class="cell-clamp-3">${p.part_name_cn || "-"}</div></td>
        <td><div class="cell-clamp-3">${p.part_name || "-"}</div></td>
        <td><div class="cell-clamp-3">${p.model || "-"}</div></td>
        <td><div class="cell-clamp">${p.brand || "-"}</div></td>
        <td>${num(p.request_qty)}</td>
        <td>
          <input
            class="qty-input"
            type="number"
            min="0"
            step="1"
            value="${num(p.order_qty)}"
            onchange="updateOrderQty('${p.id}', this.value)"
          >
        </td>
        <td>${remainQty(p)}</td>
        <td><div class="money-cell">${formatCNY(p.unit_price_cny)}</div></td>
        <td><div class="money-cell">${formatCNY(totalCny)}</div></td>
        <td><div class="cell-clamp">${p.requester || "-"}</div></td>
        <td><div class="cell-clamp-3">${p.use_position || "-"}</div></td>
        <td><div class="cell-clamp">${p.urgency || "-"}</div></td>
        <td><span class="badge ${badgeClass(status)}">${status}</span></td>
        <td><button class="mini-btn" onclick="deletePlan('${p.id}')">Del</button></td>
      </tr>
    `;
  }).join("");
}
function updatePlanningStats() {
  const rows = monthPlans(selectedMonth);
  $('planItemCount').textContent = rows.length;
  $('planTotalCny').textContent = formatCNY(rows.reduce((s, p) => s + planTotal(p), 0));
  $('planCarryCount').textContent = rows.filter(p => remainQty(p) > 0).length;
}
async function updateOrderQty(id, value) {
  showLoading(true);
  try {
    await supa(sb.from(TABLES.plans).update({ order_qty: Math.max(clean(value), 0) }).eq('id', id).select());
    await loadAllData();
    await refresh();
    toast('อัปเดต Order Qty แล้ว', 'success');
  } catch (err) {
    console.error(err);
    toast(err.message, 'error');
  } finally {
    showLoading(false);
  }
}
async function deletePlan(id) {
  if (!confirm('ลบรายการนี้หรือไม่?')) return;
  showLoading(true);
  try {
    await supa(sb.from(TABLES.plans).delete().eq('id', id));
    await loadAllData();
    await refresh();
    toast('ลบรายการแล้ว', 'success');
  } catch (err) {
    console.error(err);
    toast(err.message, 'error');
  } finally {
    showLoading(false);
  }
}
async function clearCurrentMonthData() {
  if (!confirm(`ลบ Order Planning ของเดือน ${selectedMonth} ทั้งหมดหรือไม่?`)) return;
  showLoading(true);
  try {
    await supa(sb.from(TABLES.plans).delete().eq('month', selectedMonth));
    await loadAllData();
    await refresh();
    toast('ล้างข้อมูลเดือนนี้แล้ว', 'success');
  } catch (err) {
    console.error(err);
    toast(err.message, 'error');
  } finally {
    showLoading(false);
  }
}
async function autoFitBudget() {
  showLoading(true);
  try {
    let changed = false;
    const rows = allocationRows(selectedMonth);

    for (const a of rows) {
      let s = calcBudget(selectedMonth, a.bucket_id);
      if (s.remaining >= 0) continue;

      const targets = monthPlans(selectedMonth)
        .filter(p => p.bucket_id === a.bucket_id)
        .sort((x, y) => num(y.unit_price_cny) - num(x.unit_price_cny));

      for (const p of targets) {
        let qty = num(p.order_qty);
        while (s.remaining < 0 && qty > 0) {
          qty -= 1;
          p.order_qty = qty;
          s = calcBudget(selectedMonth, a.bucket_id);
          changed = true;
        }
        await supa(sb.from(TABLES.plans).update({ order_qty: qty }).eq('id', p.id).select());
        if (s.remaining >= 0) break;
      }
    }

    await loadAllData();
    await refresh();
    toast(changed ? 'Auto Fit Budget สำเร็จ' : 'ยอดยังไม่เกินงบ ไม่จำเป็นต้องลด', 'success');
  } catch (err) {
    console.error(err);
    toast(err.message, 'error');
  } finally {
    showLoading(false);
  }
}

/* Manual order */
function openManualModal() {
  populateBucketOptions();
  $('manualModal').classList.add('show');
  updateManualPreview();
}
function closeManualModal() {
  $('manualModal').classList.remove('show');
}
function clearManualForm() {
  $('manualForm').reset();
  $('manualCurrency').value = 'CNY';
  $('manualRate').value = '0.2';
  updateManualPreview();
}
function manualUnitPriceCny() {
  const currency = $('manualCurrency').value;
  const price = clean($('manualUnitPrice').value);
  const rate = clean($('manualRate').value) || 1;
  return currency === 'THB' ? price * rate : price;
}
function updateManualPreview() {
  const qty = clean($('manualOrderQty').value);
  const currency = $('manualCurrency').value || 'CNY';
  const price = clean($('manualUnitPrice').value);
  $('manualPreviewAmount').textContent = `${fmt(qty * price)} ${currency}`;
  $('manualPreviewCny').textContent = formatCNY(qty * manualUnitPriceCny());
}
function nextPlanNo(month = selectedMonth) {
  const nums = monthPlans(month).map(p => Number(p.no)).filter(n => !Number.isNaN(n));
  return String(nums.length ? Math.max(...nums) + 1 : 1);
}
async function handleSaveManualOrder(e) {
  e.preventDefault();
  showLoading(true);
  try {
    await ensureMonth(selectedMonth, true);
    await loadAllData();

    const bucket = getBucket($('manualBucketId').value);
    if (!bucket) throw new Error('ไม่พบ Budget Bucket');

    const rec = {
      month: selectedMonth,
      bucket_id: bucket.id,
      budget_code: bucket.code,
      budget_owner: bucket.owner,
      department: bucket.department,
      no: nextPlanNo(selectedMonth),
      part_name_cn: $('manualPartNameCn').value.trim(),
      part_name: $('manualPartName').value.trim(),
      model: $('manualModel').value.trim(),
      brand: $('manualBrand').value.trim(),
      request_qty: clean($('manualRequestQty').value),
      order_qty: clean($('manualOrderQty').value),
      currency: $('manualCurrency').value,
      unit_price_original: clean($('manualUnitPrice').value),
      rate_to_cny: $('manualCurrency').value === 'THB' ? clean($('manualRate').value) : 1,
      unit_price_cny: manualUnitPriceCny(),
      requester: $('manualRequester').value.trim() || bucket.owner,
      use_position: $('manualUsePosition').value.trim(),
      urgency: $('manualUrgency').value,
      delivery_date: $('manualDelivery').value.trim(),
      remark: $('manualRemark').value.trim(),
      source_file: 'Manual Entry',
      source_type: $('manualCurrency').value === 'THB' ? 'Thailand Manual Purchase' : 'Manual Purchase'
    };

    await supa(sb.from(TABLES.plans).insert(rec).select());
    closeManualModal();
    clearManualForm();
    await loadAllData();
    await refresh();
    toast('บันทึกรายการสั่งซื้อแล้ว', 'success');
  } catch (err) {
    console.error(err);
    toast(err.message, 'error');
  } finally {
    showLoading(false);
  }
}

/* Transfer */
function openTransferModal() {
  populateBucketOptions();
  const active = activeBuckets();
  if (active[0]) $('transferFrom').value = active[0].id;
  if (active[1]) $('transferTo').value = active[1].id;
  validateTransferSelect();
  updateTransferPreview();
  $('transferModal').classList.add('show');
}
function openTransferModalWithTarget(targetId) {
  openTransferModal();
  if (targetId) $('transferTo').value = targetId;
  if ($('transferFrom').value === targetId) {
    const alt = activeBuckets().find(b => b.id !== targetId);
    if (alt) $('transferFrom').value = alt.id;
  }
  validateTransferSelect();
}
function closeTransferModal() {
  $('transferModal').classList.remove('show');
}
function clearTransferForm() {
  $('transferForm').reset();
  populateBucketOptions();
  updateTransferPreview();
}
function updateTransferPreview() {
  $('transferAmountThb').value = formatTHB(toTHB(clean($('transferAmount').value)));
}
function validateTransferSelect() {
  $('transferTo').setCustomValidity($('transferFrom').value === $('transferTo').value ? 'ห้ามโยกงบไปงบเดียวกัน' : '');
}
async function handleSaveTransfer(e) {
  e.preventDefault();
  showLoading(true);
  try {
    const fromId = $('transferFrom').value;
    const toId = $('transferTo').value;
    if (fromId === toId) throw new Error('ไม่สามารถโยกงบไปงบเดียวกันได้');

    await supa(sb.from(TABLES.transfers).insert({
      month: selectedMonth,
      from_bucket_id: fromId,
      to_bucket_id: toId,
      amount_cny: clean($('transferAmount').value),
      reason: $('transferReason').value.trim(),
      transfer_date: new Date().toISOString().slice(0, 10)
    }).select());

    closeTransferModal();
    clearTransferForm();
    await loadAllData();
    await refresh();
    toast('บันทึกการโยกงบแล้ว', 'success');
  } catch (err) {
    console.error(err);
    toast(err.message, 'error');
  } finally {
    showLoading(false);
  }
}
function renderTransferHistory() {
  const rows = monthTransfers(selectedMonth);
  $('transferHistoryBody').innerHTML = rows.length ? rows.map(t => {
    const from = getBucket(t.from_bucket_id);
    const to = getBucket(t.to_bucket_id);
    return `
      <tr>
        <td>${t.transfer_date || String(t.created_at).slice(0,10)}</td>
        <td>${from?.code || '-'}</td>
        <td>${to?.code || '-'}</td>
        <td>${formatCNY(t.amount_cny)}</td>
        <td>${formatTHB(toTHB(t.amount_cny))}</td>
        <td>${t.reason || '-'}</td>
        <td><button class="mini-btn" onclick="deleteTransfer('${t.id}')">Delete</button></td>
      </tr>
    `;
  }).join('') : `<tr><td colspan="7"><div class="empty-state">ยังไม่มีประวัติการโยกงบ</div></td></tr>`;
}
async function deleteTransfer(id) {
  if (!confirm('ลบประวัติโยกงบนี้หรือไม่?')) return;
  showLoading(true);
  try {
    await supa(sb.from(TABLES.transfers).delete().eq('id', id));
    await loadAllData();
    await refresh();
    toast('ลบประวัติโยกงบแล้ว', 'success');
  } catch (err) {
    console.error(err);
    toast(err.message, 'error');
  } finally {
    showLoading(false);
  }
}

/* Carry */
function renderCarryForward() {
  const rows = monthPlans(selectedMonth).filter(p => remainQty(p) > 0);
  $('carryBody').innerHTML = rows.length ? rows.map(p => `
    <tr>
      <td>${p.month}</td>
      <td>${p.budget_code || '-'}</td>
      <td>${p.budget_owner || '-'}</td>
      <td>${p.department || '-'}</td>
      <td>${p.no || '-'}</td>
      <td>${p.part_name || p.part_name_cn || '-'}</td>
      <td>${p.model || '-'}</td>
      <td>${num(p.request_qty)}</td>
      <td>${num(p.order_qty)}</td>
      <td>${remainQty(p)}</td>
      <td>${formatCNY(p.unit_price_cny)}</td>
      <td>${formatCNY(remainQty(p) * num(p.unit_price_cny))}</td>
      <td><span class="badge warning">Carry</span></td>
    </tr>
  `).join('') : `<tr><td colspan="13"><div class="empty-state success">ไม่มีรายการ Carry Forward</div></td></tr>`;
}
async function createNextMonthFromCarry() {
  const carry = monthPlans(selectedMonth).filter(p => remainQty(p) > 0);

  if (!carry.length) {
    toast("ไม่มีรายการ Carry Forward", "error");
    return;
  }

  const newMonth = nextMonth(selectedMonth);
  showLoading(true);

  try {
    await ensureMonth(newMonth, true);
    await loadAllData();

    let no = monthPlans(newMonth).length + 1;
    const existingCarryIds = new Set(monthPlans(newMonth).map(p => p.source_carry_id).filter(Boolean));

    const newPlans = carry
      .filter(p => !existingCarryIds.has(p.id))
      .map(p => ({
        month: newMonth,
        bucket_id: p.bucket_id,
        budget_code: p.budget_code,
        budget_owner: p.budget_owner,
        department: p.department,
        no: String(no++),
        remark: `Carry forward from ${selectedMonth}`,
        part_name_cn: p.part_name_cn,
        part_name: p.part_name,
        model: p.model,
        brand: p.brand,
        request_qty: remainQty(p),
        order_qty: remainQty(p),
        currency: p.currency,
        unit_price_original: p.unit_price_original,
        rate_to_cny: p.rate_to_cny,
        unit_price_cny: p.unit_price_cny,
        requester: p.requester,
        use_position: p.use_position,
        urgency: p.urgency,
        delivery_date: p.delivery_date,
        planned_delivery: p.planned_delivery,
        source_file: "Carry Forward",
        source_type: "Carry Forward",
        source_carry_id: p.id
      }));

    if (newPlans.length) {
      await supa(sb.from(TABLES.plans).insert(newPlans).select());
    }

    selectedMonth = newMonth;
    localStorage.setItem("mpr_budget_selected_month", selectedMonth);

    await loadAllData();
    await refresh();

    toast(`สร้างเดือน ${newMonth} พร้อม Rollover และ Carry Forward แล้ว`, "success");
  } catch (err) {
    console.error(err);
    toast(err.message, "error");
  } finally {
    showLoading(false);
  }
}


async function createNextMonthWithRollover() {
  const current = selectedMonth;
  const newMonth = nextMonth(current);

  if (!confirm(`สร้างเดือน ${newMonth} และทบยอดคงเหลือจาก ${current} หรือไม่?`)) return;

  showLoading(true);

  try {
    selectedMonth = newMonth;
    localStorage.setItem("mpr_budget_selected_month", selectedMonth);

    await loadAllData();
    await ensureMonth(newMonth, true);
    await loadAllData();
    await syncMonthBaseTotal(newMonth);
    await refresh();

    toast(`สร้างเดือน ${newMonth} พร้อมทบยอดคงเหลือแล้ว`, "success");
  } catch (err) {
    console.error(err);
    toast(err.message, "error");
  } finally {
    showLoading(false);
  }
}

/* Import */
async function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  showLoading(true);
  try {
    await ensureMonth(selectedMonth, true);
    await loadAllData();

    const rows = await readWorkbook(file);
    const imported = rows.map((row, i) => mapSupplierRow(row, i, file.name)).filter(Boolean);
    if (!imported.length) throw new Error('ไม่พบข้อมูลในไฟล์');

    await supa(sb.from(TABLES.plans).insert(imported).select());
    await loadAllData();
    await refresh();
    toast(`Import สำเร็จ ${imported.length} รายการ`, 'success');
  } catch (err) {
    console.error(err);
    toast(err.message, 'error');
  } finally {
    showLoading(false);
    e.target.value = '';
  }
}
function readWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const sh = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(sh, { defval: '', raw: false }));
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
function norm(v) {
  return String(v || '').replace(/\n/g, ' ').replace(/\s+/g, '').trim().toLowerCase();
}
function normalizeRow(row) {
  const out = {};
  Object.keys(row).forEach(k => out[norm(k)] = row[k]);
  return out;
}
function getVal(row, patterns) {
  const keys = Object.keys(row);
  for (const p of patterns.map(norm)) {
    const exact = keys.find(k => k === p);
    if (exact && row[exact] !== '') return row[exact];
    const inc = keys.find(k => k.includes(p) || p.includes(k));
    if (inc && row[inc] !== '') return row[inc];
  }
  return '';
}
function normalizeMatchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()（）\[\]【】\-_/.,:;|]/g, "")
    .trim();
}

function matchBucket(requesterText, extraText = "") {
  const text = normalizeMatchText(`${requesterText} ${extraText}`);

  if (!text) {
    return activeBuckets().find(b => b.code === "BUD-MVR") || activeBuckets()[0];
  }

  for (const [budgetCode, aliases] of Object.entries(BUDGET_MATCH_ALIASES)) {
    const bucket = activeBuckets().find(b => b.code === budgetCode);
    if (!bucket) continue;

    const matched = aliases.some(alias => {
      const key = normalizeMatchText(alias);
      return key && (text.includes(key) || key.includes(text));
    });

    if (matched) {
      return bucket;
    }
  }

  const matchedByMaster = activeBuckets().find(b => {
    const owner = normalizeMatchText(b.owner);
    const dept = normalizeMatchText(b.department);
    const code = normalizeMatchText(b.code);
    const group = normalizeMatchText(b.group_name);

    return (
      (owner && (text.includes(owner) || owner.includes(text))) ||
      (dept && (text.includes(dept) || dept.includes(text))) ||
      (code && (text.includes(code) || code.includes(text))) ||
      (group && (text.includes(group) || group.includes(text)))
    );
  });

  if (matchedByMaster) {
    return matchedByMaster;
  }

  if (
    text.includes("utility") ||
    text.includes("龙伟") ||
    text.includes("庞伟") ||
    text.includes("longwei") ||
    text.includes("pangwei")
  ) {
    return activeBuckets().find(b => b.code === "BUD-UTILITY")
      || activeBuckets().find(b => b.code === "BUD-MVR")
      || activeBuckets()[0];
  }

  return activeBuckets().find(b => b.code === "BUD-MVR") || activeBuckets()[0];
}
function mapSupplierRow(row, index, fileName) {
  const r = normalizeRow(row);

  const no = getVal(r, [
    "序号",
    "ลำดับ",
    "No",
    "No."
  ]);

  const remark = getVal(r, [
    "备注",
    "Remark",
    "Note"
  ]);

  const partNameCn = getVal(r, [
    "备件中文名称",
    "ชื่ออะไหล่ภาษาจีน",
    "Chinese Name",
    "CN Name"
  ]);

  const partName = getVal(r, [
    "备件英文名称",
    "ชื่ออะไหล่ภาษาอังกฤษ",
    "English Name",
    "EN Name",
    "Part Name",
    "Spare Part Name"
  ]);

  const model = getVal(r, [
    "备件型号",
    "รุ่นอะไหล่",
    "Model",
    "Spec"
  ]);

  const brand = getVal(r, [
    "品牌",
    "Brand"
  ]);

  const requestQtyValue = getVal(r, [
    "提报数量",
    "จำนวนที่ขอสั่ง",
    "จำนวนที่ขอสั่งซิ้อ",
    "Request Qty",
    "Request Quantity"
  ]);

  const requestQty = clean(requestQtyValue);

  const requester = getVal(r, [
    "提报人",
    "คนสั่ง",
    "Requester"
  ]);

  const usePosition = getVal(r, [
    "使用部位",
    "ส่วนการใช้งาน",
    "Use Position"
  ]);

  const urgency = getVal(r, [
    "紧急程度",
    "ระดับความเร่งด่วน",
    "Urgency"
  ]);

  const orderQtyValue = getVal(r, [
    "TPT确认下单数量",
    "TPT确认下单数量 Order quantity",
    "TPT确认下单数量\nOrder quantity",
    "TPT确认下单数量\r\nOrder quantity",
    "Order quantity",
    "Order Qty",
    "Confirm Order Qty",
    "TPT Order Qty"
  ]);

  const deliveryDate = getVal(r, [
    "WTD货期",
    "delivery date",
    "Delivery date",
    "Delivery"
  ]);

  const unitPriceCny = clean(getVal(r, [
    "WTD单价/CNY",
    "Unit price",
    "Unit Price CNY",
    "单价"
  ]));

  const plannedDelivery = getVal(r, [
    "计划送货时间",
    "Planned delivery time"
  ]);

  if (!partName && !partNameCn && !model) {
    return null;
  }

  if (!requestQty || requestQty <= 0) {
    return null;
  }

  /*
    สำคัญ:
    - ถ้า Order quantity มีค่า แม้เป็น 0 → ใช้ค่านั้นจริง
    - ถ้า Order quantity ว่างจริง ๆ → ใช้ Request Qty เป็นค่าเริ่มต้น
  */
  const orderQty = hasCellValue(orderQtyValue)
    ? clean(orderQtyValue)
    : requestQty;

  const bucket = matchBucket(
    requester,
    `${usePosition} ${urgency} ${partNameCn} ${partName} ${model} ${brand} ${remark}`
  );

  if (!bucket) {
    return null;
  }

  return {
    month: selectedMonth,
    bucket_id: bucket.id,
    budget_code: bucket.code,
    budget_owner: bucket.owner,
    department: bucket.department,

    no: no || String(index + 1),
    remark,

    part_name_cn: partNameCn,
    part_name: partName,
    model,
    brand,

    request_qty: requestQty,
    order_qty: orderQty,

    currency: "CNY",
    unit_price_original: unitPriceCny,
    rate_to_cny: 1,
    unit_price_cny: unitPriceCny,

    requester,
    use_position: usePosition,
    urgency,
    delivery_date: deliveryDate,
    planned_delivery: plannedDelivery,

    source_file: fileName,
    source_type: "Supplier Import"
  };
}

/* Export */
async function logExport(type, fileName) {
  try {
    await supa(sb.from(TABLES.exports).insert({ month: selectedMonth, export_type: type, file_name: fileName }).select());
  } catch (err) {
    console.warn('export log failed', err);
  }
}
function downloadWorkbook(sheets, fileName, type) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(s => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows), s.name);
  });
  XLSX.writeFile(wb, fileName);
  logExport(type, fileName);
}
function planExportRows(rows) {
  return rows.map(p => ({
    Month: p.month,
    'Budget Code': p.budget_code,
    Owner: p.budget_owner,
    Department: p.department,
    No: p.no,
    'CN Name': p.part_name_cn,
    'Part Name': p.part_name,
    Model: p.model,
    Brand: p.brand,
    'Request Qty': num(p.request_qty),
    'Order Qty': num(p.order_qty),
    'Remain Qty': remainQty(p),
    Currency: p.currency,
    'Unit Price CNY': num(p.unit_price_cny),
    'Total CNY': planTotal(p),
    Requester: p.requester,
    'Use Position': p.use_position,
    Urgency: p.urgency,
    Delivery: p.delivery_date,
    Status: planStatus(p),
    Source: p.source_type
  }));
}
function exportFinalOrder() {
  const fileName = `Final_Order_${selectedMonth}.xlsx`;
  downloadWorkbook([{ name: 'Final Order', rows: planExportRows(monthPlans(selectedMonth).filter(p => num(p.order_qty) > 0)) }], fileName, 'Final Order');
}
function exportCarryForward() {
  const fileName = `Carry_Forward_${selectedMonth}.xlsx`;
  downloadWorkbook([{ name: 'Carry Forward', rows: planExportRows(monthPlans(selectedMonth).filter(p => remainQty(p) > 0)) }], fileName, 'Carry Forward');
}
function exportBudgetUsageReport() {
  const budgetRows = allocationRows(selectedMonth).map(a => {
    const b = a.bucket;
    const s = calcBudget(selectedMonth, a.bucket_id);
    return {
      Month: selectedMonth,
      'Budget Code': b.code,
      Group: b.group_name,
      Owner: b.owner,
      Department: b.department,
      'Base Budget CNY': s.base,
      'Rollover CNY': s.rollover,
      'Transfer In CNY': s.transferIn,
      'Transfer Out CNY': s.transferOut,
      'Total Available CNY': s.total,
      'Used CNY': s.used,
      'Remaining CNY': s.remaining,
      'Remaining THB': toTHB(s.remaining),
      'Usage %': Number(s.usage.toFixed(2)),
      Status: s.status
    };
  });

  const transferRows = monthTransfers(selectedMonth).map(t => ({
    Month: t.month,
    Date: t.transfer_date || String(t.created_at).slice(0, 10),
    From: getBucket(t.from_bucket_id)?.code || '-',
    To: getBucket(t.to_bucket_id)?.code || '-',
    'Amount CNY': num(t.amount_cny),
    'Amount THB': toTHB(t.amount_cny),
    Reason: t.reason
  }));

  const masterRows = buckets.map(b => ({
    'Budget Code': b.code,
    Group: b.group_name,
    Owner: b.owner,
    Department: b.department,
    'Default Budget CNY': num(b.default_budget),
    Active: b.is_active ? 'Yes' : 'No',
    System: b.is_system ? 'Yes' : 'No'
  }));

  const fileName = `Budget_Usage_Report_${selectedMonth}.xlsx`;
  downloadWorkbook([
    { name: 'Budget Summary', rows: budgetRows },
    { name: 'Order Usage', rows: planExportRows(monthPlans(selectedMonth)) },
    { name: 'Transfers', rows: transferRows },
    { name: 'Master Budgets', rows: masterRows }
  ], fileName, 'Budget Usage Report');
}

/* UI */
function switchPage(pageId) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === pageId));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === pageId));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function setConnection(ok, title, sub) {
  $('connectionStatus').textContent = title;
  $('connectionMode').textContent = sub;
  $('connectionCard').classList.toggle('danger', !ok);
}
function showLoading(show) {
  $('loadingOverlay').classList.toggle('show', show);
}
function toast(msg, type = 'success') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => el.className = 'toast', 2800);
}
