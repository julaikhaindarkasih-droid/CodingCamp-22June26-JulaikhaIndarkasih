/* ============================================================
   Expense & Budget Visualizer — app.js
   ============================================================ */

'use strict';

// ─── Constants ───────────────────────────────────────────────
const LS_TRANSACTIONS = 'ebv_transactions';
const LS_CATEGORIES   = 'ebv_categories';
const LS_THEME        = 'ebv_theme';
const LS_LIMIT        = 'ebv_spending_limit';

const BUILTIN_CATEGORIES = [
  'Food & Drinks', 'Transport', 'Shopping', 'Housing',
  'Health', 'Entertainment', 'Education', 'Salary',
  'Freelance', 'Investment', 'Other',
];

// Palette for chart bars (cycles if more categories than colors)
const CHART_COLORS = [
  '#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6',
  '#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16',
  '#06b6d4','#a855f7',
];

// Category emoji map
const CATEGORY_ICONS = {
  'food & drinks': '🍔', 'transport': '🚗', 'shopping': '🛍️',
  'housing': '🏠', 'health': '💊', 'entertainment': '🎬',
  'education': '📚', 'salary': '💼', 'freelance': '💻',
  'investment': '📈', 'other': '📝',
};

// ─── State ───────────────────────────────────────────────────
let transactions = [];
let customCategories = [];
let pendingDeleteId = null;
let spendingLimit = null;

// ─── Utilities ───────────────────────────────────────────────
function formatRp(number) {
  return 'Rp ' + Math.abs(number).toLocaleString('id-ID');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getCategoryIcon(cat) {
  return CATEGORY_ICONS[cat.toLowerCase()] || '🏷️';
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getAllCategories() {
  return [...BUILTIN_CATEGORIES, ...customCategories];
}

function getYearMonth(dateStr) {
  // Returns "YYYY-MM"
  return dateStr ? dateStr.slice(0, 7) : '';
}

// ─── Local Storage ───────────────────────────────────────────
function saveTransactions() {
  localStorage.setItem(LS_TRANSACTIONS, JSON.stringify(transactions));
}

function loadTransactions() {
  try {
    const raw = localStorage.getItem(LS_TRANSACTIONS);
    transactions = raw ? JSON.parse(raw) : [];
  } catch {
    transactions = [];
  }
}

function saveCategories() {
  localStorage.setItem(LS_CATEGORIES, JSON.stringify(customCategories));
}

function loadCategories() {
  try {
    const raw = localStorage.getItem(LS_CATEGORIES);
    customCategories = raw ? JSON.parse(raw) : [];
  } catch {
    customCategories = [];
  }
}

function saveTheme(theme) {
  localStorage.setItem(LS_THEME, theme);
}

function loadTheme() {
  return localStorage.getItem(LS_THEME) || 'light';
}

function saveLimit(val) {
  if (val) localStorage.setItem(LS_LIMIT, val);
  else localStorage.removeItem(LS_LIMIT);
}

function loadLimit() {
  const raw = localStorage.getItem(LS_LIMIT);
  return raw ? parseFloat(raw) : null;
}

// ─── DOM Refs ────────────────────────────────────────────────
const el = {
  // Dashboard
  totalIncome:    document.getElementById('totalIncome'),
  totalExpenses:  document.getElementById('totalExpenses'),
  balance:        document.getElementById('balance'),
  // Monthly
  monthPicker:    document.getElementById('monthPicker'),
  monthIncome:    document.getElementById('monthIncome'),
  monthExpenses:  document.getElementById('monthExpenses'),
  monthNet:       document.getElementById('monthNet'),
  // Chart
  chartEmpty:     document.getElementById('chartEmpty'),
  chartLegend:    document.getElementById('chartLegend'),
  // Form
  form:           document.getElementById('transactionForm'),
  title:          document.getElementById('title'),
  amount:         document.getElementById('amount'),
  type:           document.getElementById('type'),
  category:       document.getElementById('category'),
  date:           document.getElementById('date'),
  titleError:     document.getElementById('titleError'),
  amountError:    document.getElementById('amountError'),
  typeError:      document.getElementById('typeError'),
  categoryError:  document.getElementById('categoryError'),
  dateError:      document.getElementById('dateError'),
  // Custom Categories
  newCategory:    document.getElementById('newCategory'),
  addCategoryBtn: document.getElementById('addCategoryBtn'),
  categoryAddErr: document.getElementById('categoryAddError'),
  categoryList:   document.getElementById('categoryList'),
  // History
  searchInput:    document.getElementById('searchInput'),
  filterType:     document.getElementById('filterType'),
  filterCategory: document.getElementById('filterCategory'),
  transactionList:document.getElementById('transactionList'),
  noTransactions: document.getElementById('noTransactions'),
  // Theme
  themeToggle:    document.getElementById('themeToggle'),
  // Modal
  deleteModal:    document.getElementById('deleteModal'),
  modalOverlay:   document.getElementById('modalOverlay'),
  modalDesc:      document.getElementById('modalDesc'),
  confirmDelete:  document.getElementById('confirmDelete'),
  cancelDelete:   document.getElementById('cancelDelete'),
  // Spending Limit
  spendingLimit:  document.getElementById('spendingLimit'),
  saveLimitBtn:   document.getElementById('saveLimitBtn'),
  clearLimitBtn:  document.getElementById('clearLimitBtn'),
  limitError:     document.getElementById('limitError'),
  limitActive:    document.getElementById('limitActive'),
};

// ─── Theme ───────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  el.themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
}

el.themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  saveTheme(next);
});

// ─── Dashboard ───────────────────────────────────────────────
function updateDashboard() {
  const totalIncome   = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const bal           = totalIncome - totalExpenses;

  el.totalIncome.textContent   = formatRp(totalIncome);
  el.totalExpenses.textContent = formatRp(totalExpenses);
  el.balance.textContent       = formatRp(bal);
  el.balance.style.color       = bal >= 0 ? 'var(--color-income)' : 'var(--color-expense)';
}

// ─── Monthly Picker ──────────────────────────────────────────
function buildMonthPicker() {
  // Collect all unique YYYY-MM from transactions + current month
  const months = new Set();
  const now = new Date();
  months.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  transactions.forEach(t => months.add(getYearMonth(t.date)));

  const sorted = [...months].sort((a, b) => b.localeCompare(a));
  const current = el.monthPicker.value;
  el.monthPicker.innerHTML = '';
  sorted.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    const [y, mo] = m.split('-');
    opt.textContent = new Date(+y, +mo - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    el.monthPicker.appendChild(opt);
  });
  // Restore previous selection if still valid
  if (current && sorted.includes(current)) el.monthPicker.value = current;
}

function updateMonthlySummary() {
  const selected = el.monthPicker.value;
  const filtered = transactions.filter(t => getYearMonth(t.date) === selected);
  const income   = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const net      = income - expenses;

  el.monthIncome.textContent   = formatRp(income);
  el.monthExpenses.textContent = formatRp(expenses);
  el.monthNet.textContent      = (net >= 0 ? '+' : '-') + formatRp(net);
  el.monthNet.className        = 'stat-value ' + (net >= 0 ? 'income' : 'expense');
}

el.monthPicker.addEventListener('change', updateMonthlySummary);

// ─── Chart — SVG Pie ─────────────────────────────────────────
function updateChart() {
  const expenses  = transactions.filter(t => t.type === 'expense');
  const pieChart  = document.getElementById('pieChart');
  const pieTooltip = document.getElementById('pieTooltip');

  // Group by category (only categories with actual spending)
  const totals = {};
  expenses.forEach(t => {
    totals[t.category] = (totals[t.category] || 0) + t.amount;
  });

  const entries = Object.entries(totals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    el.chartEmpty.hidden  = false;
    pieChart.hidden       = true;
    el.chartLegend.hidden = true;
    pieTooltip.hidden     = true;
    return;
  }

  el.chartEmpty.hidden  = true;
  pieChart.hidden       = false;
  el.chartLegend.hidden = false;

  const total = entries.reduce((s, [, v]) => s + v, 0);
  const cx = 100, cy = 100, r = 90, holeR = 50; // donut hole

  // Clear previous slices (keep nothing)
  pieChart.innerHTML = '';

  // Helper: polar to cartesian
  function polar(cx, cy, r, angleDeg) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  // Helper: build SVG arc path for a donut slice
  function slicePath(startDeg, endDeg) {
    const outerStart = polar(cx, cy, r,     startDeg);
    const outerEnd   = polar(cx, cy, r,     endDeg);
    const innerStart = polar(cx, cy, holeR, endDeg);
    const innerEnd   = polar(cx, cy, holeR, startDeg);
    const large      = endDeg - startDeg > 180 ? 1 : 0;
    return [
      `M ${outerStart.x} ${outerStart.y}`,
      `A ${r} ${r} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y}`,
      `L ${innerStart.x} ${innerStart.y}`,
      `A ${holeR} ${holeR} 0 ${large} 0 ${innerEnd.x} ${innerEnd.y}`,
      'Z',
    ].join(' ');
  }

  let currentAngle = 0;

  el.chartLegend.innerHTML = '';

  entries.forEach(([cat, amount], idx) => {
    const color    = CHART_COLORS[idx % CHART_COLORS.length];
    const sliceDeg = (amount / total) * 360;
    const midAngle = currentAngle + sliceDeg / 2;
    const pct      = ((amount / total) * 100).toFixed(1);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', slicePath(currentAngle, currentAngle + sliceDeg));
    path.setAttribute('fill', color);
    path.setAttribute('stroke', 'var(--color-surface)');
    path.setAttribute('stroke-width', '2');
    path.classList.add('pie-slice');
    path.setAttribute('aria-label', `${cat}: ${formatRp(amount)} (${pct}%)`);
    path.setAttribute('tabindex', '0');

    // Tooltip on hover
    path.addEventListener('mouseenter', e => {
      pieTooltip.textContent = `${cat}: ${formatRp(amount)} (${pct}%)`;
      pieTooltip.hidden = false;
      positionTooltip(e);
    });
    path.addEventListener('mousemove', positionTooltip);
    path.addEventListener('mouseleave', () => { pieTooltip.hidden = true; });

    pieChart.appendChild(path);

    // Percentage label on slice if large enough
    if (sliceDeg > 20) {
      const labelPos = polar(cx, cy, (r + holeR) / 2, midAngle);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', labelPos.x);
      text.setAttribute('y', labelPos.y);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('font-size', '7');
      text.setAttribute('font-weight', '700');
      text.setAttribute('fill', '#fff');
      text.setAttribute('pointer-events', 'none');
      text.textContent = `${pct}%`;
      pieChart.appendChild(text);
    }

    currentAngle += sliceDeg;

    // Legend row
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-dot" style="background:${color}"></span><span>${cat} — ${formatRp(amount)} (${pct}%)</span>`;
    el.chartLegend.appendChild(item);
  });

  // Centre labels (total spending)
  const labelTop = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  labelTop.setAttribute('x', cx); labelTop.setAttribute('y', cy - 8);
  labelTop.classList.add('pie-center-label');
  labelTop.textContent = 'Total Expenses';
  pieChart.appendChild(labelTop);

  const labelAmt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  labelAmt.setAttribute('x', cx); labelAmt.setAttribute('y', cy + 10);
  labelAmt.classList.add('pie-center-amount');
  labelAmt.textContent = formatRp(total);
  pieChart.appendChild(labelAmt);

  function positionTooltip(e) {
    const wrapper = document.querySelector('.pie-wrapper');
    const rect    = wrapper.getBoundingClientRect();
    pieTooltip.style.left = (e.clientX - rect.left) + 'px';
    pieTooltip.style.top  = (e.clientY - rect.top)  + 'px';
  }
}

// ─── Category Selects & Chips ─────────────────────────────────
function rebuildCategorySelect() {
  const current = el.category.value;
  el.category.innerHTML = '<option value="">-- Select category --</option>';
  getAllCategories().forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    el.category.appendChild(opt);
  });
  if (current) el.category.value = current;
}

function rebuildFilterCategory() {
  const current = el.filterCategory.value;
  el.filterCategory.innerHTML = '<option value="all">All categories</option>';
  getAllCategories().forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    el.filterCategory.appendChild(opt);
  });
  if (current) el.filterCategory.value = current;
}

function renderCategoryChips() {
  el.categoryList.innerHTML = '';

  // Built-in (non-removable)
  BUILTIN_CATEGORIES.forEach(cat => {
    const chip = document.createElement('span');
    chip.className = 'chip builtin';
    chip.textContent = cat;
    el.categoryList.appendChild(chip);
  });

  // Custom (removable)
  customCategories.forEach(cat => {
    const chip = document.createElement('span');
    chip.className = 'chip';

    const name = document.createElement('span');
    name.textContent = cat;

    const btn = document.createElement('button');
    btn.className = 'chip-remove';
    btn.innerHTML = '&times;';
    btn.setAttribute('aria-label', `Remove category ${cat}`);
    btn.addEventListener('click', () => removeCustomCategory(cat));

    chip.appendChild(name);
    chip.appendChild(btn);
    el.categoryList.appendChild(chip);
  });
}

function addCustomCategory() {
  const val = el.newCategory.value.trim();
  el.categoryAddErr.textContent = '';

  if (!val) {
    el.categoryAddErr.textContent = 'Category name cannot be empty.';
    return;
  }
  const allLower = getAllCategories().map(c => c.toLowerCase());
  if (allLower.includes(val.toLowerCase())) {
    el.categoryAddErr.textContent = 'Category already exists.';
    return;
  }

  customCategories.push(val);
  saveCategories();
  el.newCategory.value = '';
  syncCategories();
}

function removeCustomCategory(cat) {
  customCategories = customCategories.filter(c => c !== cat);
  saveCategories();
  syncCategories();
}

function syncCategories() {
  renderCategoryChips();
  rebuildCategorySelect();
  rebuildFilterCategory();
}

el.addCategoryBtn.addEventListener('click', addCustomCategory);
el.newCategory.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); addCustomCategory(); }
});

// ─── Spending Limit ───────────────────────────────────────────
function renderLimitStatus() {
  if (spendingLimit) {
    el.spendingLimit.value    = spendingLimit;
    el.limitActive.hidden     = false;
    el.limitActive.textContent = `🔔 Active limit: ${formatRp(spendingLimit)} — expenses above this are highlighted.`;
  } else {
    el.spendingLimit.value = '';
    el.limitActive.hidden  = true;
  }
}

el.saveLimitBtn.addEventListener('click', () => {
  el.limitError.textContent = '';
  const val = parseFloat(el.spendingLimit.value);
  if (!el.spendingLimit.value || isNaN(val) || val <= 0) {
    el.limitError.textContent = 'Enter a positive amount.';
    return;
  }
  spendingLimit = val;
  saveLimit(val);
  renderLimitStatus();
  renderTransactions();
});

el.clearLimitBtn.addEventListener('click', () => {
  spendingLimit = null;
  saveLimit(null);
  el.limitError.textContent = '';
  renderLimitStatus();
  renderTransactions();
});

// ─── Form Validation ─────────────────────────────────────────
function clearErrors() {
  [el.titleError, el.amountError, el.typeError, el.categoryError, el.dateError].forEach(e => e.textContent = '');
  [el.title, el.amount, el.type, el.category, el.date].forEach(i => i.classList.remove('error'));
}

function validateForm() {
  clearErrors();
  let valid = true;

  if (!el.title.value.trim()) {
    el.titleError.textContent = 'Title is required.';
    el.title.classList.add('error');
    valid = false;
  }

  const amt = parseFloat(el.amount.value);
  if (!el.amount.value || isNaN(amt) || amt <= 0) {
    el.amountError.textContent = 'Enter a positive amount.';
    el.amount.classList.add('error');
    valid = false;
  }

  if (!el.type.value) {
    el.typeError.textContent = 'Select a type.';
    el.type.classList.add('error');
    valid = false;
  }

  if (!el.category.value) {
    el.categoryError.textContent = 'Select a category.';
    el.category.classList.add('error');
    valid = false;
  }

  if (!el.date.value) {
    el.dateError.textContent = 'Date is required.';
    el.date.classList.add('error');
    valid = false;
  }

  return valid;
}

// ─── Add Transaction ─────────────────────────────────────────
el.form.addEventListener('submit', e => {
  e.preventDefault();
  if (!validateForm()) return;

  const tx = {
    id:       generateId(),
    title:    el.title.value.trim(),
    amount:   parseFloat(el.amount.value),
    type:     el.type.value,
    category: el.category.value,
    date:     el.date.value,
  };

  transactions.unshift(tx);
  saveTransactions();
  el.form.reset();
  clearErrors();
  refreshAll();
});

// ─── Delete Transaction ───────────────────────────────────────
function openDeleteModal(id, title) {
  pendingDeleteId = id;
  el.modalDesc.textContent = `Delete "${title}"? This cannot be undone.`;
  el.deleteModal.hidden  = false;
  el.modalOverlay.hidden = false;
  el.confirmDelete.focus();
}

function closeDeleteModal() {
  pendingDeleteId = null;
  el.deleteModal.hidden  = true;
  el.modalOverlay.hidden = true;
}

el.confirmDelete.addEventListener('click', () => {
  if (!pendingDeleteId) return;
  transactions = transactions.filter(t => t.id !== pendingDeleteId);
  saveTransactions();
  closeDeleteModal();
  refreshAll();
});

el.cancelDelete.addEventListener('click', closeDeleteModal);
el.modalOverlay.addEventListener('click', closeDeleteModal);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeDeleteModal();
});

// ─── Transaction History ─────────────────────────────────────
function getFilteredTransactions() {
  const search   = el.searchInput.value.toLowerCase().trim();
  const type     = el.filterType.value;
  const category = el.filterCategory.value;

  return transactions.filter(t => {
    const matchSearch   = !search || t.title.toLowerCase().includes(search) || t.category.toLowerCase().includes(search);
    const matchType     = type === 'all' || t.type === type;
    const matchCategory = category === 'all' || t.category === category;
    return matchSearch && matchType && matchCategory;
  });
}

function renderTransactions() {
  const filtered = getFilteredTransactions();
  el.transactionList.innerHTML = '';

  if (filtered.length === 0) {
    el.noTransactions.hidden = false;
    return;
  }

  el.noTransactions.hidden = true;

  filtered.forEach(t => {
    const overLimit = spendingLimit && t.type === 'expense' && t.amount > spendingLimit;
    const li = document.createElement('li');
    li.className = `transaction-item ${t.type}${overLimit ? ' over-limit' : ''}`;
    li.innerHTML = `
      <span class="tx-icon" aria-hidden="true">${getCategoryIcon(t.category)}</span>
      <div class="tx-info">
        <div class="tx-title">${escapeHtml(t.title)}${overLimit ? ' <span class="limit-badge" title="Over spending limit">⚠️</span>' : ''}</div>
        <div class="tx-meta">${escapeHtml(t.category)} · ${formatDate(t.date)}</div>
      </div>
      <span class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${formatRp(t.amount)}</span>
      <button class="tx-delete" aria-label="Delete transaction ${escapeHtml(t.title)}" data-id="${t.id}" data-title="${escapeHtml(t.title)}">🗑️</button>
    `;
    el.transactionList.appendChild(li);
  });

  // Event delegation for delete buttons
  el.transactionList.querySelectorAll('.tx-delete').forEach(btn => {
    btn.addEventListener('click', () => openDeleteModal(btn.dataset.id, btn.dataset.title));
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

el.searchInput.addEventListener('input', renderTransactions);
el.filterType.addEventListener('change', renderTransactions);
el.filterCategory.addEventListener('change', renderTransactions);

// ─── Refresh All ─────────────────────────────────────────────
function refreshAll() {
  updateDashboard();
  buildMonthPicker();
  updateMonthlySummary();
  updateChart();
  renderTransactions();
}

// ─── Init ────────────────────────────────────────────────────
(function init() {
  // Theme
  applyTheme(loadTheme());

  // Data
  loadTransactions();
  loadCategories();
  spendingLimit = loadLimit();

  // Set today's date as default
  const today = new Date().toISOString().split('T')[0];
  el.date.value = today;

  // Categories
  syncCategories();

  // Spending limit UI
  renderLimitStatus();

  // Render everything
  refreshAll();
})();
