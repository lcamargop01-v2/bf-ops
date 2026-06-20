// BF Operations — Reports Module (QB Online Style)
// Clean, customizable reports with column toggles, filters, and export

(function() {
'use strict';

var API = window.axios ? axios.create({ baseURL: '/api' }) : null;
var _rptData = {};
var _currentTab = 'financial';
var _dateFrom = '';
var _dateTo = '';
var _locations = [];
var _categories = [];
var _activeQuick = '30d';

// Column visibility state per tab
var _colState = {
  financial: { month:1, revenue:1, cogs:1, margin:1, margin_pct:1, orders:1 },
  sales: {},
  products: { name:1, category:1, price:1, cost:1, units:1, revenue:1, margin:1, margin_pct:1, stock:1 },
  purchasing: {},
  delivery: {},
  returns: {},
  customers: { name:1, zone:1, orders:1, revenue:1, weight:1, last_order:1 },
  inventory: { name:1, category:1, on_hand:1, on_hold:1, reserved:1, available:1, cost:1, price:1, value:1 },
  fleet: {},
  warehouse: {}
};

// ==================== INIT ====================
window._reportsInit = function() {
  if (!API) API = axios.create({ baseURL: '/api' });
  var token = localStorage.getItem('bf_token') || localStorage.getItem('bf_ops_token');
  if (token) API.defaults.headers.common['Authorization'] = 'Bearer ' + token;

  var now = new Date();
  var ago = new Date(now.getTime() - 30 * 86400000);
  _dateTo = now.toISOString().slice(0, 10);
  _dateFrom = ago.toISOString().slice(0, 10);

  renderApp();
  loadFilters();
  loadTab(_currentTab);
};

window._reportsCleanup = function() {
  _rptData = {};
};

// ==================== MAIN RENDER ====================
function renderApp() {
  var el = document.getElementById('reports-app');
  if (!el) return;

  el.innerHTML =
    '<div class="qb-report-header">' +
      '<div class="qb-report-title-row">' +
        '<div class="qb-report-title"><i class="fas fa-chart-pie"></i> <span id="rptTitleText">Reports</span></div>' +
        '<div class="qb-report-actions">' +
          '<div style="position:relative">' +
            '<button class="qb-action-btn" onclick="window._rptToggleColumns()"><i class="fas fa-columns"></i> Columns</button>' +
            '<div id="rptColumnsDropdown" class="qb-customize-dropdown" style="display:none"></div>' +
          '</div>' +
          '<button class="qb-action-btn" onclick="window._rptExportExcel()"><i class="fas fa-file-csv"></i> Export</button>' +
          '<button class="qb-action-btn" onclick="window._rptExportPDF()"><i class="fas fa-print"></i> Print</button>' +
        '</div>' +
      '</div>' +
      '<div class="qb-tabs" id="rptTabs">' +
        tabBtn('financial', 'fa-chart-line', 'Financial') +
        tabBtn('sales', 'fa-receipt', 'Sales') +
        tabBtn('products', 'fa-box', 'Products') +
        tabBtn('purchasing', 'fa-cart-shopping', 'Purchasing') +
        tabBtn('delivery', 'fa-truck', 'Delivery') +
        tabBtn('returns', 'fa-rotate-left', 'Returns') +
        tabBtn('customers', 'fa-users', 'Customers') +
        tabBtn('inventory', 'fa-warehouse', 'Inventory') +
        tabBtn('fleet', 'fa-truck-monster', 'Fleet') +
        tabBtn('warehouse', 'fa-boxes-stacked', 'Warehouse') +
      '</div>' +
      '<div class="qb-filter-bar" id="rptFilterBar">' +
        '<div class="qb-filter-group">' +
          '<span class="qb-filter-label">Date</span>' +
          '<input type="date" class="qb-filter-input" id="rptFrom" value="' + _dateFrom + '" onchange="window._rptSetFrom(this.value)">' +
          '<span style="color:var(--qb-text-muted);font-size:12px">to</span>' +
          '<input type="date" class="qb-filter-input" id="rptTo" value="' + _dateTo + '" onchange="window._rptSetTo(this.value)">' +
        '</div>' +
        '<div class="qb-quick-dates">' +
          quickBtn('7d', '7d') + quickBtn('30d', '30d') + quickBtn('90d', '90d') + quickBtn('1yr', '1yr') + quickBtn('All', 'all') +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="qb-report-body" id="rptContent">' +
      '<div class="qb-loading"><i class="fas fa-spinner fa-spin"></i> Loading report...</div>' +
    '</div>';
}

function tabBtn(id, icon, label) {
  return '<button class="qb-tab ' + (_currentTab === id ? 'active' : '') + '" onclick="window._rptTab(\'' + id + '\')">' +
    '<i class="fas ' + icon + '"></i> <span>' + label + '</span></button>';
}

function quickBtn(label, id) {
  return '<button class="qb-quick-date ' + (_activeQuick === id ? 'active' : '') + '" onclick="window._rptQuick(\'' + id + '\')">' + label + '</button>';
}

// ==================== TAB SWITCHING ====================
window._rptTab = function(tab) {
  _currentTab = tab;
  document.querySelectorAll('.qb-tab').forEach(function(t) { t.classList.remove('active'); });
  var tabs = document.querySelectorAll('.qb-tab');
  var tabIds = ['financial','sales','products','purchasing','delivery','returns','customers','inventory','fleet','warehouse'];
  var idx = tabIds.indexOf(tab);
  if (idx >= 0 && tabs[idx]) tabs[idx].classList.add('active');

  // Update title
  var titles = { financial:'Financial Overview', sales:'Sales Report', products:'Product Performance', purchasing:'Purchasing Report', delivery:'Delivery Report', returns:'Returns Report', customers:'Customer Report', inventory:'Inventory Valuation', fleet:'Fleet Report', warehouse:'Warehouse Activity' };
  var titleEl = document.getElementById('rptTitleText');
  if (titleEl) titleEl.textContent = titles[tab] || 'Reports';

  loadTab(tab);
};

// ==================== DATE CONTROLS ====================
window._rptSetFrom = function(v) { _dateFrom = v; _activeQuick = ''; loadTab(_currentTab); };
window._rptSetTo = function(v) { _dateTo = v; _activeQuick = ''; loadTab(_currentTab); };
window._rptQuick = function(id) {
  var now = new Date();
  _dateTo = now.toISOString().slice(0, 10);
  if (id === '7d') _dateFrom = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  else if (id === '30d') _dateFrom = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  else if (id === '90d') _dateFrom = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
  else if (id === '1yr') _dateFrom = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10);
  else if (id === 'all') _dateFrom = '2020-01-01';
  _activeQuick = id;
  document.getElementById('rptFrom').value = _dateFrom;
  document.getElementById('rptTo').value = _dateTo;
  document.querySelectorAll('.qb-quick-date').forEach(function(b) { b.classList.remove('active'); });
  if (event && event.target) event.target.classList.add('active');
  loadTab(_currentTab);
};

function loadFilters() {
  API.get('/reports/locations').then(function(r) { _locations = r.data; }).catch(function() {});
  API.get('/reports/categories').then(function(r) { _categories = r.data; }).catch(function() {});
}

// ==================== COLUMN TOGGLE ====================
window._rptToggleColumns = function() {
  var dd = document.getElementById('rptColumnsDropdown');
  if (!dd) return;
  if (dd.style.display !== 'none') { dd.style.display = 'none'; return; }

  var cols = getColumnsForTab(_currentTab);
  if (!cols || cols.length === 0) { dd.innerHTML = '<div style="font-size:12px;color:var(--qb-text-muted);padding:4px">No customizable columns</div>'; dd.style.display = 'block'; return; }

  var state = _colState[_currentTab] || {};
  var html = '<div style="font-size:12px;font-weight:700;color:var(--qb-text-muted);margin-bottom:6px;text-transform:uppercase">Show / Hide</div>';
  cols.forEach(function(c) {
    var checked = state[c.id] !== 0 ? 'checked' : '';
    html += '<label class="qb-customize-item"><input type="checkbox" ' + checked + ' onchange="window._rptColToggle(\'' + c.id + '\',this.checked)"> ' + c.label + '</label>';
  });
  dd.innerHTML = html;
  dd.style.display = 'block';

  // Close on outside click
  setTimeout(function() {
    document.addEventListener('click', function handler(e) {
      if (!dd.contains(e.target) && e.target.id !== 'rptColumnsDropdown') {
        dd.style.display = 'none';
        document.removeEventListener('click', handler);
      }
    });
  }, 10);
};

window._rptColToggle = function(colId, show) {
  if (!_colState[_currentTab]) _colState[_currentTab] = {};
  _colState[_currentTab][colId] = show ? 1 : 0;
  loadTab(_currentTab);
};

function getColumnsForTab(tab) {
  var c = {
    financial: [{id:'month',label:'Month'},{id:'revenue',label:'Revenue'},{id:'cogs',label:'COGS'},{id:'margin',label:'Margin'},{id:'margin_pct',label:'Margin %'},{id:'orders',label:'Orders'}],
    products: [{id:'name',label:'Product'},{id:'category',label:'Category'},{id:'price',label:'Price'},{id:'cost',label:'Cost'},{id:'units',label:'Units Sold'},{id:'revenue',label:'Revenue'},{id:'margin',label:'Margin'},{id:'margin_pct',label:'Margin %'},{id:'stock',label:'Stock'}],
    customers: [{id:'name',label:'Customer'},{id:'zone',label:'Zone'},{id:'orders',label:'Orders'},{id:'revenue',label:'Revenue'},{id:'weight',label:'Weight'},{id:'last_order',label:'Last Order'}],
    inventory: [{id:'name',label:'Product'},{id:'category',label:'Category'},{id:'on_hand',label:'On Hand'},{id:'on_hold',label:'On Hold'},{id:'reserved',label:'Reserved'},{id:'available',label:'Available'},{id:'cost',label:'Unit Cost'},{id:'price',label:'Unit Price'},{id:'value',label:'Value (Retail)'}]
  };
  return c[tab] || [];
}

function colVisible(tab, colId) {
  var s = _colState[tab];
  if (!s || s[colId] === undefined) return true;
  return s[colId] !== 0;
}

// ==================== LOAD TAB ====================
function loadTab(tab) {
  var el = document.getElementById('rptContent');
  if (el) el.innerHTML = '<div class="qb-loading"><i class="fas fa-spinner fa-spin"></i> Loading report...</div>';
  var q = 'from=' + _dateFrom + '&to=' + _dateTo;
  if (tab === 'financial') loadFinancial(q);
  else if (tab === 'sales') loadSales(q);
  else if (tab === 'products') loadProducts(q);
  else if (tab === 'purchasing') loadPurchasing(q);
  else if (tab === 'delivery') loadDelivery(q);
  else if (tab === 'returns') loadReturns(q);
  else if (tab === 'customers') loadCustomers(q);
  else if (tab === 'inventory') loadInventory(q);
  else if (tab === 'fleet') loadFleet(q);
  else if (tab === 'warehouse') loadWarehouse(q);
}

// ==================== HELPERS ====================
function fmt$(v) { return '$' + (v || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function fmtN(v) { return (v || 0).toLocaleString(); }
function fmtPct(a, b) { return b ? ((a / b) * 100).toFixed(1) + '%' : '0%'; }

function summaryItem(label, value, opts) {
  opts = opts || {};
  var cls = opts.color ? ' ' + opts.color : '';
  var sub = opts.sub ? '<div class="qb-summary-sub">' + opts.sub + '</div>' : '';
  return '<div class="qb-summary-item"><div class="qb-summary-label">' + label + '</div><div class="qb-summary-value' + cls + '">' + value + '</div>' + sub + '</div>';
}

function sectionOpen(title, icon, controlsHtml) {
  return '<div class="qb-section"><div class="qb-section-header"><div class="qb-section-title"><i class="fas ' + icon + '"></i> ' + title + '</div>' +
    (controlsHtml ? '<div class="qb-section-controls">' + controlsHtml + '</div>' : '') +
    '</div><div class="qb-section-body">';
}
function sectionClose() { return '</div></div>'; }

function groupBtns(groups, current, callbackName) {
  return groups.map(function(g) {
    return '<button class="qb-group-btn ' + (current === g.id ? 'active' : '') + '" onclick="window.' + callbackName + '(\'' + g.id + '\')">' + g.label + '</button>';
  }).join('');
}

function th(label, opts) {
  opts = opts || {};
  return '<th' + (opts.right ? ' class="right"' : '') + '>' + label + '</th>';
}
function td(val, opts) {
  opts = opts || {};
  var cls = [];
  if (opts.right) cls.push('right');
  if (opts.money) cls.push('money');
  if (opts.num) cls.push('num');
  if (opts.muted) cls.push('muted');
  if (opts.neg) cls.push('neg');
  return '<td' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '>' + val + '</td>';
}

// ==================== FINANCIAL OVERVIEW ====================
function loadFinancial(q) {
  API.get('/reports/financial?' + q).then(function(r) {
    var d = r.data;
    var rev = d.revenue || {};
    var pur = d.purchasing || {};
    var bill = d.bills || {};
    var inv = d.inventoryValue || {};
    var el = document.getElementById('rptContent');

    var html = '<div class="qb-summary-strip">' +
      summaryItem('Revenue', fmt$(rev.total_revenue), { color: 'green', sub: fmtN(rev.order_count) + ' orders' }) +
      summaryItem('Cost of Goods', fmt$(rev.cogs), { sub: 'COGS from sold items' }) +
      summaryItem('Gross Margin', fmt$(rev.gross_margin), { color: rev.gross_margin >= 0 ? 'green' : 'red', sub: fmtPct(rev.gross_margin, rev.total_revenue) + ' margin' }) +
      summaryItem('Purchasing', fmt$(pur.total_purchasing), { color: 'orange', sub: fmtN(pur.po_count) + ' POs' }) +
      summaryItem('Bills Paid', fmt$(bill.paid), { color: 'green' }) +
      summaryItem('Bills Pending', fmt$(bill.pending), { color: 'orange' }) +
      summaryItem('Inventory (Retail)', fmt$(inv.inventory_retail_value), { color: 'green', sub: fmtN(inv.total_units) + ' units' }) +
      summaryItem('Inventory (Cost)', fmt$(inv.inventory_value), { sub: 'At cost basis' }) +
    '</div>';

    // Monthly trend
    if (d.monthlyTrend && d.monthlyTrend.length > 0) {
      var cv = colVisible.bind(null, 'financial');
      html += sectionOpen('Monthly P&L Trend', 'fa-chart-bar', '');
      html += '<div class="qb-chart-wrap"><canvas id="rptFinChart"></canvas></div>';
      html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>';
      if (cv('month')) html += th('Month');
      if (cv('revenue')) html += th('Revenue', {right:1});
      if (cv('cogs')) html += th('COGS', {right:1});
      if (cv('margin')) html += th('Gross Margin', {right:1});
      if (cv('margin_pct')) html += th('Margin %', {right:1});
      if (cv('orders')) html += th('Orders', {right:1});
      html += '</tr></thead><tbody>';

      var totRev = 0, totCogs = 0, totMargin = 0, totOrders = 0;
      d.monthlyTrend.forEach(function(m) {
        totRev += m.revenue || 0; totCogs += m.cogs || 0; totMargin += m.margin || 0; totOrders += m.orders || 0;
        html += '<tr>';
        if (cv('month')) html += td(m.month, {num:1});
        if (cv('revenue')) html += td(fmt$(m.revenue), {right:1, money:1});
        if (cv('cogs')) html += td(fmt$(m.cogs), {right:1, num:1});
        if (cv('margin')) html += td(fmt$(m.margin), {right:1, money:1});
        if (cv('margin_pct')) html += td(fmtPct(m.margin, m.revenue), {right:1, num:1});
        if (cv('orders')) html += td(fmtN(m.orders), {right:1, num:1});
        html += '</tr>';
      });
      // Totals row
      html += '<tr class="totals-row">';
      if (cv('month')) html += '<td><strong>Total</strong></td>';
      if (cv('revenue')) html += td(fmt$(totRev), {right:1, money:1});
      if (cv('cogs')) html += td(fmt$(totCogs), {right:1, num:1});
      if (cv('margin')) html += td(fmt$(totMargin), {right:1, money:1});
      if (cv('margin_pct')) html += td(fmtPct(totMargin, totRev), {right:1, num:1});
      if (cv('orders')) html += td(fmtN(totOrders), {right:1, num:1});
      html += '</tr>';
      html += '</tbody></table></div>';
      html += sectionClose();
    }

    el.innerHTML = html;
    if (d.monthlyTrend && d.monthlyTrend.length > 0 && window.Chart) renderFinChart(d.monthlyTrend);
  }).catch(function() {
    document.getElementById('rptContent').innerHTML = '<div class="qb-empty"><i class="fas fa-exclamation-triangle"></i> Failed to load financial report</div>';
  });
}

function renderFinChart(data) {
  var ctx = document.getElementById('rptFinChart');
  if (!ctx || !window.Chart) return;
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(function(d) { return d.month; }),
      datasets: [
        { label: 'Revenue', data: data.map(function(d) { return d.revenue; }), backgroundColor: '#2CA01C', borderRadius: 4, order: 2 },
        { label: 'COGS', data: data.map(function(d) { return d.cogs; }), backgroundColor: '#E8590C', borderRadius: 4, order: 3 },
        { label: 'Margin', data: data.map(function(d) { return d.margin; }), type: 'line', borderColor: '#0077C5', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 3, order: 1 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { usePointStyle: true, padding: 16 } } },
      scales: { y: { beginAtZero: true, grid: { color: '#E8EAED' }, ticks: { callback: function(v) { return '$' + (v/1000).toFixed(0) + 'k'; } } }, x: { grid: { display: false } } } }
  });
}

// ==================== SALES REPORT ====================
var _salesGroup = 'day';
function loadSales(q) {
  API.get('/reports/sales?' + q + '&group_by=' + _salesGroup).then(function(r) {
    var d = r.data;
    var s = d.summary || {};
    var el = document.getElementById('rptContent');

    var html = '<div class="qb-summary-strip">' +
      summaryItem('Total Orders', fmtN(s.total_orders), { color: 'blue' }) +
      summaryItem('Delivered', fmtN(s.delivered), { color: 'green' }) +
      summaryItem('Active', fmtN(s.active), { color: 'orange' }) +
      summaryItem('Cancelled', fmtN(s.cancelled), { color: 'red' }) +
      summaryItem('Revenue', fmt$(s.total_revenue), { color: 'green' }) +
      summaryItem('Total Weight', fmtN(Math.round(s.total_weight || 0)) + ' lbs') +
    '</div>';

    var groups = [{id:'day',label:'Daily'},{id:'month',label:'Monthly'},{id:'customer',label:'By Customer'},{id:'product',label:'By Product'},{id:'status',label:'By Status'}];
    html += sectionOpen('Breakdown', 'fa-table', groupBtns(groups, _salesGroup, '_rptSalesGroup'));

    if (d.breakdown && d.breakdown.length > 0) {
      if (_salesGroup === 'day' || _salesGroup === 'month') {
        html += '<div class="qb-chart-wrap"><canvas id="rptSalesChart"></canvas></div>';
        html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>' + th('Period') + th('Orders',{right:1}) + th('Weight',{right:1}) + '</tr></thead><tbody>';
        var totO = 0, totW = 0;
        d.breakdown.forEach(function(row) {
          totO += row.orders || 0; totW += row.weight || 0;
          html += '<tr class="clickable" onclick="window._rptDrillSales(\'date\',\'' + row.period + '\')">' + td(row.period, {num:1}) + td(fmtN(row.orders), {right:1,num:1}) + td(fmtN(Math.round(row.weight || 0)), {right:1,num:1}) + '</tr>';
        });
        html += '<tr class="totals-row"><td><strong>Total</strong></td>' + td(fmtN(totO),{right:1,num:1}) + td(fmtN(Math.round(totW)),{right:1,num:1}) + '</tr>';
        html += '</tbody></table></div>';
      } else if (_salesGroup === 'customer') {
        html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>' + th('Customer') + th('Orders',{right:1}) + th('Units',{right:1}) + th('Revenue',{right:1}) + th('Weight',{right:1}) + '</tr></thead><tbody>';
        var totO=0,totU=0,totR=0,totW=0;
        d.breakdown.forEach(function(row) {
          totO+=row.orders||0;totU+=row.units||0;totR+=row.revenue||0;totW+=row.weight||0;
          html += '<tr class="clickable" onclick="window._rptDrillSales(\'customer\',' + row.customer_id + ')">' + td(row.label||'Unknown') + td(fmtN(row.orders),{right:1,num:1}) + td(fmtN(row.units),{right:1,num:1}) + td(fmt$(row.revenue),{right:1,money:1}) + td(fmtN(Math.round(row.weight||0)),{right:1,num:1}) + '</tr>';
        });
        html += '<tr class="totals-row"><td><strong>Total</strong></td>'+td(fmtN(totO),{right:1,num:1})+td(fmtN(totU),{right:1,num:1})+td(fmt$(totR),{right:1,money:1})+td(fmtN(Math.round(totW)),{right:1,num:1})+'</tr>';
        html += '</tbody></table></div>';
      } else if (_salesGroup === 'product') {
        html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>' + th('Product') + th('Category') + th('Units',{right:1}) + th('Revenue',{right:1}) + th('Cost',{right:1}) + th('Margin',{right:1}) + th('Orders',{right:1}) + '</tr></thead><tbody>';
        var totU=0,totR=0,totC=0,totM=0,totO=0;
        d.breakdown.forEach(function(row) {
          totU+=row.units||0;totR+=row.revenue||0;totC+=row.cost||0;totM+=row.margin||0;totO+=row.orders||0;
          html += '<tr class="clickable" onclick="window._rptDrillSales(\'product\',' + row.product_id + ')">' + td(row.label||'Unknown') + td('<span class="qb-badge qb-badge-blue">'+(row.category||'-')+'</span>') + td(fmtN(row.units),{right:1,num:1}) + td(fmt$(row.revenue),{right:1,money:1}) + td(fmt$(row.cost),{right:1,num:1}) + td(fmt$(row.margin),{right:1,money:1}) + td(fmtN(row.orders),{right:1,num:1}) + '</tr>';
        });
        html += '<tr class="totals-row"><td><strong>Total</strong></td><td></td>'+td(fmtN(totU),{right:1,num:1})+td(fmt$(totR),{right:1,money:1})+td(fmt$(totC),{right:1,num:1})+td(fmt$(totM),{right:1,money:1})+td(fmtN(totO),{right:1,num:1})+'</tr>';
        html += '</tbody></table></div>';
      } else if (_salesGroup === 'status') {
        html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>' + th('Status') + th('Orders',{right:1}) + th('Weight',{right:1}) + '</tr></thead><tbody>';
        d.breakdown.forEach(function(row) {
          html += '<tr class="clickable" onclick="window._rptDrillSales(\'status\',\'' + row.label + '\')">' + td('<span class="qb-badge qb-badge-blue">'+row.label+'</span>') + td(fmtN(row.orders),{right:1,num:1}) + td(fmtN(Math.round(row.weight||0)),{right:1,num:1}) + '</tr>';
        });
        html += '</tbody></table></div>';
      }
    } else {
      html += '<div class="qb-empty"><i class="fas fa-inbox"></i> No data for this period</div>';
    }
    html += sectionClose();
    el.innerHTML = html;

    if ((_salesGroup === 'day' || _salesGroup === 'month') && d.breakdown && d.breakdown.length > 0 && window.Chart) {
      var ctx = document.getElementById('rptSalesChart');
      if (ctx) new Chart(ctx, {
        type: 'bar',
        data: { labels: d.breakdown.map(function(r){return r.period}), datasets: [{label:'Orders',data:d.breakdown.map(function(r){return r.orders}),backgroundColor:'#0077C5',borderRadius:4}] },
        options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,grid:{color:'#E8EAED'}},x:{grid:{display:false}}} }
      });
    }
  }).catch(function(){document.getElementById('rptContent').innerHTML='<div class="qb-empty"><i class="fas fa-exclamation-triangle"></i> Failed to load sales report</div>';});
}
window._rptSalesGroup = function(g) { _salesGroup = g; loadTab('sales'); };

// Sales drill-down
window._rptDrillSales = function(type, val) {
  var q = 'from=' + _dateFrom + '&to=' + _dateTo;
  if (type === 'customer') q += '&customer_id=' + val;
  else if (type === 'product') q += '&product_id=' + val;
  else if (type === 'date') q += '&date=' + val;
  else if (type === 'status' && val !== 'all' && val !== 'active') q += '&status=' + val;

  API.get('/reports/sales/drill?' + q).then(function(r) {
    var orders = r.data;
    var title = 'Orders';
    if (type === 'date') title = 'Orders — ' + val;
    else if (type === 'status') title = val.charAt(0).toUpperCase() + val.slice(1) + ' Orders';

    var html = '<table class="qb-table"><thead><tr>' + th('Order #') + th('Customer') + th('Status') + th('Date') + th('Items') + th('Weight',{right:1}) + '</tr></thead><tbody>';
    orders.forEach(function(o) {
      html += '<tr>' + td(o.order_number,{num:1}) + td(o.customer_name||'-') + td('<span class="qb-badge qb-badge-blue">'+o.status+'</span>') + td((o.created_at||'').slice(0,10),{muted:1}) + td((o.items_summary||'-'),{muted:1}) + td(fmtN(Math.round(o.total_weight||0)),{right:1,num:1}) + '</tr>';
    });
    html += '</tbody></table>';
    if (orders.length === 0) html = '<div class="qb-empty"><i class="fas fa-inbox"></i> No orders found</div>';
    showDrillModal(title, html);
  });
};

// ==================== PRODUCTS REPORT ====================
function loadProducts(q) {
  var cat = document.getElementById('rptCatFilter')?.value || '';
  var catQ = cat ? '&category=' + encodeURIComponent(cat) : '';
  API.get('/reports/products?' + q + catQ).then(function(r) {
    var d = r.data;
    var s = d.summary || {};
    var el = document.getElementById('rptContent');
    var cv = colVisible.bind(null, 'products');

    var catOptions = '<option value="">All Categories</option>' + _categories.map(function(c) { return '<option value="'+c+'" '+(c===cat?'selected':'')+'>'+c+'</option>'; }).join('');
    var html = '<div style="margin-bottom:12px"><select class="qb-filter-input" id="rptCatFilter" onchange="window._rptTab(\'products\')">' + catOptions + '</select></div>';

    html += '<div class="qb-summary-strip">' +
      summaryItem('Total Revenue', fmt$(s.totalRevenue), { color: 'green' }) +
      summaryItem('Total COGS', fmt$(s.totalCost)) +
      summaryItem('Gross Margin', fmt$(s.totalMargin), { color: 'green', sub: fmtPct(s.totalMargin, s.totalRevenue) }) +
      summaryItem('Units Sold', fmtN(s.totalUnits)) +
    '</div>';

    // By category
    if (d.byCategory && d.byCategory.length > 0) {
      html += sectionOpen('By Category', 'fa-layer-group', '');
      html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>'+th('Category')+th('Products',{right:1})+th('Units',{right:1})+th('Revenue',{right:1})+th('Cost',{right:1})+th('Margin',{right:1})+'</tr></thead><tbody>';
      var tP=0,tU=0,tR=0,tC=0,tM=0;
      d.byCategory.forEach(function(row) {
        tP+=row.products||0;tU+=row.units||0;tR+=row.revenue||0;tC+=row.cost||0;tM+=row.margin||0;
        html += '<tr>'+td('<span class="qb-badge qb-badge-blue">'+row.category+'</span>')+td(fmtN(row.products),{right:1,num:1})+td(fmtN(row.units),{right:1,num:1})+td(fmt$(row.revenue),{right:1,money:1})+td(fmt$(row.cost),{right:1,num:1})+td(fmt$(row.margin),{right:1,money:1})+'</tr>';
      });
      html += '<tr class="totals-row"><td><strong>Total</strong></td>'+td(fmtN(tP),{right:1,num:1})+td(fmtN(tU),{right:1,num:1})+td(fmt$(tR),{right:1,money:1})+td(fmt$(tC),{right:1,num:1})+td(fmt$(tM),{right:1,money:1})+'</tr>';
      html += '</tbody></table></div>' + sectionClose();
    }

    // All products
    html += sectionOpen('All Products', 'fa-list', '');
    html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>';
    if(cv('name')) html+=th('Product');
    if(cv('category')) html+=th('Category');
    if(cv('price')) html+=th('Price',{right:1});
    if(cv('cost')) html+=th('Cost',{right:1});
    if(cv('units')) html+=th('Units Sold',{right:1});
    if(cv('revenue')) html+=th('Revenue',{right:1});
    if(cv('margin')) html+=th('Margin',{right:1});
    if(cv('margin_pct')) html+=th('Margin %',{right:1});
    if(cv('stock')) html+=th('Stock',{right:1});
    html += '</tr></thead><tbody>';

    var totU=0,totR=0,totM2=0;
    (d.products || []).forEach(function(p) {
      totU+=p.units_sold||0;totR+=p.revenue||0;totM2+=p.margin||0;
      html += '<tr class="clickable" onclick="window._rptDrillSales(\'product\','+p.id+')">';
      if(cv('name')) html+=td(p.name);
      if(cv('category')) html+=td('<span class="qb-badge qb-badge-blue">'+(p.category||'-')+'</span>');
      if(cv('price')) html+=td(fmt$(p.price),{right:1,num:1});
      if(cv('cost')) html+=td(fmt$(p.cost),{right:1,num:1});
      if(cv('units')) html+=td(fmtN(p.units_sold),{right:1,num:1});
      if(cv('revenue')) html+=td(fmt$(p.revenue),{right:1,money:1});
      if(cv('margin')) html+=td(fmt$(p.margin),{right:1,money:1});
      if(cv('margin_pct')) html+=td(fmtPct(p.margin,p.revenue),{right:1,num:1});
      if(cv('stock')) html+=td(fmtN(p.current_stock),{right:1,num:1});
      html += '</tr>';
    });
    // Totals
    html += '<tr class="totals-row">';
    if(cv('name')) html+='<td><strong>Total</strong></td>';
    if(cv('category')) html+='<td></td>';
    if(cv('price')) html+='<td></td>';
    if(cv('cost')) html+='<td></td>';
    if(cv('units')) html+=td(fmtN(totU),{right:1,num:1});
    if(cv('revenue')) html+=td(fmt$(totR),{right:1,money:1});
    if(cv('margin')) html+=td(fmt$(totM2),{right:1,money:1});
    if(cv('margin_pct')) html+=td(fmtPct(totM2,totR),{right:1,num:1});
    if(cv('stock')) html+='<td></td>';
    html += '</tr>';
    html += '</tbody></table></div>' + sectionClose();
    el.innerHTML = html;
  }).catch(function(){document.getElementById('rptContent').innerHTML='<div class="qb-empty"><i class="fas fa-exclamation-triangle"></i> Failed to load products report</div>';});
}

// ==================== PURCHASING REPORT ====================
var _purGroup = 'supplier';
function loadPurchasing(q) {
  API.get('/reports/purchasing?' + q + '&group_by=' + _purGroup).then(function(r) {
    var d = r.data;
    var s = d.summary || {};
    var el = document.getElementById('rptContent');

    var html = '<div class="qb-summary-strip">' +
      summaryItem('Total POs', fmtN(s.total_pos), { color: 'blue' }) +
      summaryItem('Total Spent', fmt$(s.total_spent), { color: 'orange' }) +
      summaryItem('Received', fmtN(s.received), { color: 'green' }) +
      summaryItem('Active', fmtN(s.active), { color: 'orange' }) +
      summaryItem('Bills Pending', fmt$(s.pending_amount), { color: 'orange' }) +
      summaryItem('Bills Paid', fmt$(s.paid_amount), { color: 'green' }) +
    '</div>';

    var groups = [{id:'supplier',label:'By Supplier'},{id:'product',label:'By Product'},{id:'month',label:'Monthly'}];
    html += sectionOpen('Breakdown', 'fa-table', groupBtns(groups, _purGroup, '_rptPurGroup'));

    if (d.breakdown && d.breakdown.length > 0) {
      if (_purGroup === 'supplier') {
        html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>'+th('Supplier')+th('POs',{right:1})+th('Spent',{right:1})+th('Received',{right:1})+th('Active',{right:1})+'</tr></thead><tbody>';
        var tP=0,tS=0,tR=0,tA=0;
        d.breakdown.forEach(function(row) {
          tP+=row.pos||0;tS+=row.spent||0;tR+=row.received||0;tA+=row.active||0;
          html += '<tr>'+td(row.label||'Unknown')+td(fmtN(row.pos),{right:1,num:1})+td(fmt$(row.spent),{right:1,money:1})+td(fmtN(row.received),{right:1,num:1})+td(fmtN(row.active),{right:1,num:1})+'</tr>';
        });
        html += '<tr class="totals-row"><td><strong>Total</strong></td>'+td(fmtN(tP),{right:1,num:1})+td(fmt$(tS),{right:1,money:1})+td(fmtN(tR),{right:1,num:1})+td(fmtN(tA),{right:1,num:1})+'</tr>';
        html += '</tbody></table></div>';
      } else if (_purGroup === 'product') {
        html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>'+th('Product')+th('Category')+th('Ordered',{right:1})+th('Received',{right:1})+th('Total Cost',{right:1})+th('POs',{right:1})+'</tr></thead><tbody>';
        d.breakdown.forEach(function(row) {
          html += '<tr>'+td(row.label||'Unknown')+td('<span class="qb-badge qb-badge-blue">'+(row.category||'-')+'</span>')+td(fmtN(row.qty_ordered),{right:1,num:1})+td(fmtN(row.qty_received),{right:1,num:1})+td(fmt$(row.total_cost),{right:1,money:1})+td(fmtN(row.pos),{right:1,num:1})+'</tr>';
        });
        html += '</tbody></table></div>';
      } else if (_purGroup === 'month') {
        html += '<div class="qb-chart-wrap"><canvas id="rptPurChart"></canvas></div>';
        html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>'+th('Month')+th('POs',{right:1})+th('Spent',{right:1})+'</tr></thead><tbody>';
        d.breakdown.forEach(function(row) {
          html += '<tr>'+td(row.period,{num:1})+td(fmtN(row.pos),{right:1,num:1})+td(fmt$(row.spent),{right:1,money:1})+'</tr>';
        });
        html += '</tbody></table></div>';
      }
    } else {
      html += '<div class="qb-empty"><i class="fas fa-inbox"></i> No data</div>';
    }
    html += sectionClose();
    el.innerHTML = html;

    if (_purGroup === 'month' && d.breakdown && d.breakdown.length > 0 && window.Chart) {
      var ctx = document.getElementById('rptPurChart');
      if (ctx) new Chart(ctx, {
        type:'bar', data:{labels:d.breakdown.map(function(r){return r.period}),datasets:[{label:'Spent',data:d.breakdown.map(function(r){return r.spent}),backgroundColor:'#E8590C',borderRadius:4}]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:'#E8EAED'},ticks:{callback:function(v){return '$'+(v/1000).toFixed(0)+'k'}}},x:{grid:{display:false}}}}
      });
    }
  }).catch(function(){document.getElementById('rptContent').innerHTML='<div class="qb-empty"><i class="fas fa-exclamation-triangle"></i> Failed to load purchasing report</div>';});
}
window._rptPurGroup = function(g) { _purGroup = g; loadTab('purchasing'); };

// ==================== DELIVERY REPORT ====================
var _delGroup = 'day';
function loadDelivery(q) {
  API.get('/reports/delivery?' + q + '&group_by=' + _delGroup).then(function(r) {
    var d = r.data;
    var s = d.summary || {};
    var el = document.getElementById('rptContent');

    var html = '<div class="qb-summary-strip">' +
      summaryItem('Total Routes', fmtN(s.total_routes), { color: 'blue' }) +
      summaryItem('Completed', fmtN(s.completed), { color: 'green' }) +
      summaryItem('Total Stops', fmtN(s.total_stops)) +
      summaryItem('Delivered', fmtN(s.delivered_stops), { color: 'green', sub: fmtPct(s.delivered_stops, s.total_stops) + ' rate' }) +
      summaryItem('Proofs', fmtN(s.proofs_collected)) +
    '</div>';

    var groups = [{id:'day',label:'Daily'},{id:'driver',label:'By Driver'},{id:'truck',label:'By Truck'}];
    html += sectionOpen('Breakdown', 'fa-table', groupBtns(groups, _delGroup, '_rptDelGroup'));
    if (d.breakdown && d.breakdown.length > 0) {
      if (_delGroup === 'day') {
        html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>'+th('Date')+th('Routes',{right:1})+th('Completed',{right:1})+'</tr></thead><tbody>';
        d.breakdown.forEach(function(row) { html += '<tr>'+td(row.period,{num:1})+td(fmtN(row.routes),{right:1,num:1})+td(fmtN(row.completed),{right:1,num:1})+'</tr>'; });
        html += '</tbody></table></div>';
      } else if (_delGroup === 'driver') {
        html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>'+th('Driver')+th('Routes',{right:1})+th('Completed',{right:1})+th('Stops',{right:1})+th('Proofs',{right:1})+'</tr></thead><tbody>';
        d.breakdown.forEach(function(row) { html += '<tr>'+td(row.label||'Unassigned')+td(fmtN(row.routes),{right:1,num:1})+td(fmtN(row.completed),{right:1,num:1})+td(fmtN(row.stops),{right:1,num:1})+td(fmtN(row.proofs),{right:1,num:1})+'</tr>'; });
        html += '</tbody></table></div>';
      } else if (_delGroup === 'truck') {
        html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>'+th('Truck')+th('Routes',{right:1})+th('Completed',{right:1})+'</tr></thead><tbody>';
        d.breakdown.forEach(function(row) { html += '<tr>'+td(row.label||'Unassigned')+td(fmtN(row.routes),{right:1,num:1})+td(fmtN(row.completed),{right:1,num:1})+'</tr>'; });
        html += '</tbody></table></div>';
      }
    } else { html += '<div class="qb-empty"><i class="fas fa-inbox"></i> No data</div>'; }
    html += sectionClose();
    el.innerHTML = html;
  }).catch(function(){document.getElementById('rptContent').innerHTML='<div class="qb-empty"><i class="fas fa-exclamation-triangle"></i> Failed to load delivery report</div>';});
}
window._rptDelGroup = function(g) { _delGroup = g; loadTab('delivery'); };

// ==================== RETURNS REPORT ====================
var _retGroup = 'customer';
function loadReturns(q) {
  API.get('/reports/returns?' + q + '&group_by=' + _retGroup).then(function(r) {
    var d = r.data;
    var s = d.summary || {};
    var el = document.getElementById('rptContent');

    var html = '<div class="qb-summary-strip">' +
      summaryItem('Total Returns', fmtN(s.total_returns), { color: 'red' }) +
      summaryItem('Completed', fmtN(s.completed), { color: 'green' }) +
      summaryItem('Pending', fmtN(s.pending), { color: 'orange' }) +
      summaryItem('Items Returned', fmtN(s.total_items)) +
      summaryItem('Qty Returned', fmtN(s.total_qty_returned)) +
    '</div>';

    var groups = [{id:'customer',label:'By Customer'},{id:'product',label:'By Product'},{id:'day',label:'Daily'}];
    html += sectionOpen('Breakdown', 'fa-table', groupBtns(groups, _retGroup, '_rptRetGroup'));
    if (d.breakdown && d.breakdown.length > 0) {
      if (_retGroup === 'customer') {
        html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>'+th('Customer')+th('Returns',{right:1})+th('Items',{right:1})+th('Qty',{right:1})+'</tr></thead><tbody>';
        d.breakdown.forEach(function(row) { html += '<tr>'+td(row.label||'Unknown')+td(fmtN(row.returns),{right:1,num:1})+td(fmtN(row.items),{right:1,num:1})+td(fmtN(row.qty),{right:1,num:1})+'</tr>'; });
        html += '</tbody></table></div>';
      } else if (_retGroup === 'product') {
        html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>'+th('Product')+th('Category')+th('Qty Returned',{right:1})+th('Returns',{right:1})+'</tr></thead><tbody>';
        d.breakdown.forEach(function(row) { html += '<tr>'+td(row.label||'Unknown')+td('<span class="qb-badge qb-badge-blue">'+(row.category||'-')+'</span>')+td(fmtN(row.qty_returned),{right:1,num:1})+td(fmtN(row.returns),{right:1,num:1})+'</tr>'; });
        html += '</tbody></table></div>';
      } else if (_retGroup === 'day') {
        html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>'+th('Date')+th('Returns',{right:1})+'</tr></thead><tbody>';
        d.breakdown.forEach(function(row) { html += '<tr>'+td(row.period,{num:1})+td(fmtN(row.returns),{right:1,num:1})+'</tr>'; });
        html += '</tbody></table></div>';
      }
    } else { html += '<div class="qb-empty"><i class="fas fa-inbox"></i> No returns data</div>'; }
    html += sectionClose();
    el.innerHTML = html;
  }).catch(function(){document.getElementById('rptContent').innerHTML='<div class="qb-empty"><i class="fas fa-exclamation-triangle"></i> Failed to load returns report</div>';});
}
window._rptRetGroup = function(g) { _retGroup = g; loadTab('returns'); };

// ==================== CUSTOMERS REPORT ====================
function loadCustomers(q) {
  API.get('/reports/customers?' + q).then(function(r) {
    var d = r.data;
    var s = d.summary || {};
    var el = document.getElementById('rptContent');
    var cv = colVisible.bind(null, 'customers');

    var html = '<div class="qb-summary-strip">' +
      summaryItem('Active', fmtN(s.total_active), { color: 'blue' }) +
      summaryItem('Ordering', fmtN(s.ordering_customers), { color: 'green' }) +
      summaryItem('Dormant', fmtN(s.dormant_customers), { color: 'orange', sub: 'No orders in period' }) +
      summaryItem('Inactive', fmtN(s.total_inactive), { color: 'red' }) +
    '</div>';

    html += sectionOpen('Top Customers (by Revenue)', 'fa-trophy', '');
    html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>';
    if(cv('name')) html+=th('Customer');
    if(cv('zone')) html+=th('Zone');
    if(cv('orders')) html+=th('Orders',{right:1});
    if(cv('revenue')) html+=th('Revenue',{right:1});
    if(cv('weight')) html+=th('Weight',{right:1});
    if(cv('last_order')) html+=th('Last Order');
    html += '</tr></thead><tbody>';
    var totO=0,totR=0,totW=0;
    (d.topCustomers || []).forEach(function(c) {
      totO+=c.order_count||0;totR+=c.revenue||0;totW+=c.total_weight||0;
      html += '<tr class="clickable" onclick="window._rptDrillSales(\'customer\','+c.id+')">';
      if(cv('name')) html+=td(c.business_name||'-');
      if(cv('zone')) html+=td('<span class="qb-badge qb-badge-blue">'+(c.location||'-')+'</span>');
      if(cv('orders')) html+=td(fmtN(c.order_count),{right:1,num:1});
      if(cv('revenue')) html+=td(fmt$(c.revenue),{right:1,money:1});
      if(cv('weight')) html+=td(fmtN(Math.round(c.total_weight||0)),{right:1,num:1});
      if(cv('last_order')) html+=td((c.last_order||'').slice(0,10),{muted:1});
      html += '</tr>';
    });
    html += '<tr class="totals-row">';
    if(cv('name')) html+='<td><strong>Total</strong></td>';
    if(cv('zone')) html+='<td></td>';
    if(cv('orders')) html+=td(fmtN(totO),{right:1,num:1});
    if(cv('revenue')) html+=td(fmt$(totR),{right:1,money:1});
    if(cv('weight')) html+=td(fmtN(Math.round(totW)),{right:1,num:1});
    if(cv('last_order')) html+='<td></td>';
    html += '</tr>';
    html += '</tbody></table></div>' + sectionClose();

    // Dormant
    if (d.dormant && d.dormant.length > 0) {
      html += sectionOpen('Dormant Customers', 'fa-user-clock', '');
      html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>'+th('Customer')+th('Zone')+th('Last Order')+'</tr></thead><tbody>';
      d.dormant.forEach(function(c) {
        html += '<tr>'+td(c.business_name||'-')+td('<span class="qb-badge qb-badge-orange">'+(c.location||'-')+'</span>')+td((c.last_order||'Never').slice(0,10),{muted:1})+'</tr>';
      });
      html += '</tbody></table></div>' + sectionClose();
    }
    el.innerHTML = html;
  }).catch(function(){document.getElementById('rptContent').innerHTML='<div class="qb-empty"><i class="fas fa-exclamation-triangle"></i> Failed to load customers report</div>';});
}

// ==================== INVENTORY AS-OF REPORT ====================
var _invAsOfDate = new Date().toISOString().slice(0, 10);
function loadInventory() {
  var el = document.getElementById('rptContent');

  var html = '<div class="qb-asof-bar">' +
    '<i class="fas fa-clock-rotate-left"></i>' +
    '<label>Inventory As Of:</label>' +
    '<input type="date" id="rptAsOfDate" value="' + _invAsOfDate + '" max="' + new Date().toISOString().slice(0,10) + '">' +
    '<button class="qb-asof-btn" onclick="window._rptLoadAsOf()"><i class="fas fa-search"></i> Load</button>' +
    '<button class="qb-action-btn" style="margin-left:auto" onclick="window._rptExportInventoryAsOf()"><i class="fas fa-file-csv"></i> Export As-Of</button>' +
  '</div>';
  html += '<div id="rptInvResults"><div class="qb-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div></div>';
  el.innerHTML = html;
  _rptLoadAsOfData();
}

function _rptLoadAsOfData() {
  var date = _invAsOfDate;
  API.get('/reports/inventory/as-of?date=' + date).then(function(r) {
    var d = r.data;
    var container = document.getElementById('rptInvResults');
    if (!container) return;
    var cv = colVisible.bind(null, 'inventory');
    var html = '';

    if (d.source === 'none' || d.source === 'nearest_snapshot') {
      html += '<div class="qb-empty"><i class="fas fa-info-circle"></i> ' + (d.message || 'No data') + '</div>';
    }

    if (d.items && d.items.length > 0) {
      var sourceLabel = d.source === 'live'
        ? '<i class="fas fa-circle" style="color:#2CA01C;font-size:8px"></i> Current live inventory'
        : '<i class="fas fa-clock-rotate-left" style="color:#6C2EB9;font-size:8px"></i> Saved snapshot from ' + d.date;
      html += '<div class="qb-source-label">' + sourceLabel + '</div>';

      var s = d.summary || {};
      html += '<div class="qb-summary-strip">' +
        summaryItem('Products', fmtN(s.totalItems)) +
        summaryItem('Total Qty', fmtN(s.totalQty)) +
        summaryItem('Value (Retail)', fmt$(s.totalValue), { color: 'green', sub: 'At selling price' }) +
        (s.totalCostValue ? summaryItem('Value (Cost)', fmt$(s.totalCostValue), { sub: 'At cost basis' }) : '') +
      '</div>';

      // By category
      if (d.byCategory && d.byCategory.length > 0) {
        html += sectionOpen('By Category', 'fa-layer-group', '');
        html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>'+th('Category')+th('Products',{right:1})+th('Qty',{right:1})+th('Value',{right:1})+'</tr></thead><tbody>';
        var tP=0,tQ=0,tV=0;
        d.byCategory.forEach(function(cat) {
          tP+=cat.products||0;tQ+=cat.qty||0;tV+=cat.value||0;
          html += '<tr>'+td('<span class="qb-badge qb-badge-blue">'+cat.category+'</span>')+td(fmtN(cat.products),{right:1,num:1})+td(fmtN(cat.qty),{right:1,num:1})+td(fmt$(cat.value),{right:1,money:1})+'</tr>';
        });
        html += '<tr class="totals-row"><td><strong>Total</strong></td>'+td(fmtN(tP),{right:1,num:1})+td(fmtN(tQ),{right:1,num:1})+td(fmt$(tV),{right:1,money:1})+'</tr>';
        html += '</tbody></table></div>' + sectionClose();
      }

      // Full product list
      html += sectionOpen('All Products — ' + d.date, 'fa-list', '');
      html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>';
      if(cv('name')) html+=th('Product');
      if(cv('category')) html+=th('Category');
      if(cv('on_hand')) html+=th('On Hand',{right:1});
      if(cv('on_hold')) html+=th('On Hold',{right:1});
      if(cv('reserved')) html+=th('Reserved',{right:1});
      if(cv('available')) html+=th('Available',{right:1});
      if(cv('cost')) html+=th('Unit Cost',{right:1});
      if(cv('price')) html+=th('Unit Price',{right:1});
      if(cv('value')) html+=th('Value (Retail)',{right:1});
      html += '</tr></thead><tbody>';

      var totQty=0,totVal=0;
      d.items.forEach(function(item) {
        var name = item.product_name || item.name || '-';
        totQty+=item.qty_on_hand||0;totVal+=item.total_value||0;
        html += '<tr>';
        if(cv('name')) html+=td(name);
        if(cv('category')) html+=td('<span class="qb-badge qb-badge-blue">'+(item.category||'-')+'</span>');
        if(cv('on_hand')) html+=td(fmtN(item.qty_on_hand),{right:1,num:1});
        if(cv('on_hold')) html+=td(fmtN(item.qty_on_hold),{right:1,num:1});
        if(cv('reserved')) html+=td(fmtN(item.qty_reserved),{right:1,num:1});
        if(cv('available')) html+=td(fmtN(item.qty_available),{right:1,num:1});
        if(cv('cost')) html+=td(fmt$(item.unit_cost),{right:1,num:1});
        if(cv('price')) html+=td(fmt$(item.unit_price),{right:1,num:1});
        if(cv('value')) html+=td(fmt$(item.total_value),{right:1,money:1});
        html += '</tr>';
      });
      html += '<tr class="totals-row">';
      if(cv('name')) html+='<td><strong>Total</strong></td>';
      if(cv('category')) html+='<td></td>';
      if(cv('on_hand')) html+=td(fmtN(totQty),{right:1,num:1});
      if(cv('on_hold')) html+='<td></td>';
      if(cv('reserved')) html+='<td></td>';
      if(cv('available')) html+='<td></td>';
      if(cv('cost')) html+='<td></td>';
      if(cv('price')) html+='<td></td>';
      if(cv('value')) html+=td(fmt$(totVal),{right:1,money:1});
      html += '</tr>';
      html += '</tbody></table></div>' + sectionClose();
    } else if (d.source !== 'none' && d.source !== 'nearest_snapshot') {
      html += '<div class="qb-empty"><i class="fas fa-inbox"></i> No inventory data for this date</div>';
    }
    container.innerHTML = html;
  }).catch(function() {
    var c = document.getElementById('rptInvResults');
    if (c) c.innerHTML = '<div class="qb-empty"><i class="fas fa-exclamation-triangle"></i> Failed to load inventory</div>';
  });
}

window._rptLoadAsOf = function() {
  _invAsOfDate = document.getElementById('rptAsOfDate')?.value || _invAsOfDate;
  _rptLoadAsOfData();
};

// Export inventory as-of specifically
window._rptExportInventoryAsOf = function() {
  var date = document.getElementById('rptAsOfDate')?.value || _invAsOfDate;
  API.get('/reports/inventory/as-of?date=' + date).then(function(r) {
    var d = r.data;
    if (!d.items || d.items.length === 0) { alert('No inventory data to export for ' + date); return; }

    var csv = 'Product,Category,On Hand,On Hold,Reserved,Available,Unit Cost,Unit Price,Value (Retail)\n';
    d.items.forEach(function(item) {
      csv += csvVal(item.product_name || item.name || '') + ',' +
        csvVal(item.category || '') + ',' +
        (item.qty_on_hand || 0) + ',' +
        (item.qty_on_hold || 0) + ',' +
        (item.qty_reserved || 0) + ',' +
        (item.qty_available || 0) + ',' +
        (item.unit_cost || 0).toFixed(2) + ',' +
        (item.unit_price || 0).toFixed(2) + ',' +
        (item.total_value || 0).toFixed(2) + '\n';
    });

    downloadCsv(csv, 'bf-ops-inventory-as-of-' + date + '.csv');
  }).catch(function(err) {
    alert('Export failed: ' + (err.response?.data?.error || err.message));
  });
};

// ==================== FLEET REPORT ====================
function loadFleet(q) {
  API.get('/reports/fleet?' + q).then(function(r) {
    var d = r.data;
    var s = d.summary || {};
    var el = document.getElementById('rptContent');

    var html = '<div class="qb-summary-strip">' +
      summaryItem('Active Trucks', fmtN(s.active_trucks), { color: 'blue' }) +
      summaryItem('Total Routes', fmtN(s.total_routes)) +
      summaryItem('Maintenance', fmtN(s.maintenance_records), { color: 'orange' }) +
      summaryItem('Open Issues', fmtN(s.open_issues), { color: 'red' }) +
    '</div>';

    html += sectionOpen('Truck Usage', 'fa-truck', '');
    html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>'+th('Truck')+th('Plate')+th('Routes',{right:1})+th('Completed',{right:1})+th('Maintenance',{right:1})+'</tr></thead><tbody>';
    (d.truckUsage || []).forEach(function(t) {
      html += '<tr>'+td(t.name||'-')+td(t.plate_number||'-',{muted:1})+td(fmtN(t.routes),{right:1,num:1})+td(fmtN(t.completed),{right:1,num:1})+td(fmtN(t.maintenance_events),{right:1,num:1})+'</tr>';
    });
    html += '</tbody></table></div>' + sectionClose();

    html += sectionOpen('Driver Performance', 'fa-user-helmet-safety', '');
    html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>'+th('Driver')+th('Routes',{right:1})+th('Completed',{right:1})+th('Stops',{right:1})+th('Proofs',{right:1})+'</tr></thead><tbody>';
    (d.driverPerformance || []).forEach(function(dr) {
      html += '<tr>'+td(dr.name||'-')+td(fmtN(dr.routes),{right:1,num:1})+td(fmtN(dr.completed),{right:1,num:1})+td(fmtN(dr.stops_delivered),{right:1,num:1})+td(fmtN(dr.proofs),{right:1,num:1})+'</tr>';
    });
    html += '</tbody></table></div>' + sectionClose();
    el.innerHTML = html;
  }).catch(function(){document.getElementById('rptContent').innerHTML='<div class="qb-empty"><i class="fas fa-exclamation-triangle"></i> Failed to load fleet report</div>';});
}

// ==================== WAREHOUSE REPORT ====================
function loadWarehouse(q) {
  API.get('/reports/warehouse?' + q).then(function(r) {
    var d = r.data;
    var s = d.summary || {};
    var el = document.getElementById('rptContent');

    var html = '<div class="qb-summary-strip">' +
      summaryItem('Activities', fmtN(s.total_activities)) +
      summaryItem('Inbound Qty', fmtN(s.total_in), { color: 'green' }) +
      summaryItem('Outbound Qty', fmtN(s.total_out), { color: 'red' }) +
      summaryItem('Products Touched', fmtN(s.products_touched)) +
      summaryItem('Staff', fmtN(s.staff_involved)) +
    '</div>';

    html += sectionOpen('By Activity Type', 'fa-list', '');
    html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>'+th('Type')+th('Count',{right:1})+th('Qty In',{right:1})+th('Qty Out',{right:1})+'</tr></thead><tbody>';
    (d.byType || []).forEach(function(t) {
      html += '<tr>'+td('<span class="qb-badge qb-badge-blue">'+t.activity_type+'</span>')+td(fmtN(t.count),{right:1,num:1})+td(fmtN(t.qty_in),{right:1,num:1})+td(fmtN(t.qty_out),{right:1,num:1})+'</tr>';
    });
    html += '</tbody></table></div>' + sectionClose();

    html += sectionOpen('By Staff', 'fa-user', '');
    html += '<div class="qb-table-wrap"><table class="qb-table"><thead><tr>'+th('Name')+th('Activities',{right:1})+th('Qty In',{right:1})+th('Qty Out',{right:1})+'</tr></thead><tbody>';
    (d.byStaff || []).forEach(function(st) {
      html += '<tr>'+td(st.label||'Unknown')+td(fmtN(st.activities),{right:1,num:1})+td(fmtN(st.qty_in),{right:1,num:1})+td(fmtN(st.qty_out),{right:1,num:1})+'</tr>';
    });
    html += '</tbody></table></div>' + sectionClose();
    el.innerHTML = html;
  }).catch(function(){document.getElementById('rptContent').innerHTML='<div class="qb-empty"><i class="fas fa-exclamation-triangle"></i> Failed to load warehouse report</div>';});
}

// ==================== DRILL-DOWN MODAL ====================
function showDrillModal(title, bodyHtml) {
  var existing = document.querySelector('.qb-drill-overlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.className = 'qb-drill-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML =
    '<div class="qb-drill-modal">' +
      '<div class="qb-drill-header"><h3>' + title + '</h3><button class="qb-drill-close" onclick="this.closest(\'.qb-drill-overlay\').remove()"><i class="fas fa-times"></i></button></div>' +
      '<div class="qb-drill-body">' + bodyHtml + '</div>' +
      '<div class="qb-drill-footer">' +
        '<button class="qb-action-btn" onclick="window._rptExportExcel()"><i class="fas fa-file-csv"></i> Export</button>' +
        '<button class="qb-action-btn" onclick="this.closest(\'.qb-drill-overlay\').remove()">Close</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
}

// ==================== EXPORT: PDF / PRINT ====================
window._rptExportPDF = function() {
  var content = document.getElementById('rptContent');
  if (!content) return;
  var titles = { financial:'Financial Overview', sales:'Sales Report', products:'Product Performance', purchasing:'Purchasing Report', delivery:'Delivery Report', returns:'Returns Report', customers:'Customer Report', inventory:'Inventory Valuation', fleet:'Fleet Report', warehouse:'Warehouse Activity' };

  var win = window.open('', '_blank');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>BF Ops — ' + (titles[_currentTab]||'Report') + '</title>' +
    '<style>' +
    'body { font-family: Inter, -apple-system, sans-serif; padding: 24px; color: #393A3D; max-width: 1000px; margin: 0 auto; }' +
    'h1 { font-size: 20px; color: #393A3D; margin-bottom: 4px; }' +
    '.period { font-size: 12px; color: #8C8D91; margin-bottom: 20px; }' +
    'table { width: 100%; border-collapse: collapse; margin: 12px 0; }' +
    'th { padding: 8px 12px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; background: #F4F5F8; border-bottom: 2px solid #D4D7DC; }' +
    'td { padding: 8px 12px; font-size: 12px; border-bottom: 1px solid #E8EAED; }' +
    '.right { text-align: right; }' +
    '.num { font-variant-numeric: tabular-nums; }' +
    '.money { font-weight: 700; color: #2CA01C; }' +
    '.totals-row td { font-weight: 800; border-top: 2px solid #393A3D; border-bottom: none; }' +
    '.qb-summary-strip { display: flex; gap: 12px; margin: 16px 0; }' +
    '.qb-summary-item { border: 1px solid #E8EAED; border-radius: 4px; padding: 10px 14px; }' +
    '.qb-summary-label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #8C8D91; }' +
    '.qb-summary-value { font-size: 18px; font-weight: 800; }' +
    '.qb-summary-value.green { color: #2CA01C; } .qb-summary-value.red { color: #D13B3B; } .qb-summary-value.orange { color: #E8590C; } .qb-summary-value.blue { color: #0077C5; }' +
    '.qb-badge { font-size: 10px; padding: 1px 6px; border-radius: 3px; }' +
    '.qb-badge-blue { background: #E5F1FA; color: #005A9E; }' +
    '.qb-badge-green { background: #E8F5E6; color: #1A7A12; }' +
    '.qb-badge-orange { background: #FFF4E5; color: #C05000; }' +
    'canvas, .qb-chart-wrap, .qb-section-controls, .qb-asof-bar button, .qb-action-btn { display: none; }' +
    '@media print { body { padding: 0; } }' +
    '</style></head><body>' +
    '<h1>BF Operations — ' + (titles[_currentTab]||'Report') + '</h1>' +
    '<div class="period">' + _dateFrom + ' to ' + _dateTo + ' &bull; Generated ' + new Date().toLocaleString() + '</div>' +
    content.innerHTML +
    '</body></html>');
  win.document.close();
  setTimeout(function() { win.print(); }, 500);
};

// ==================== EXPORT: CSV ====================
window._rptExportExcel = function(type) {
  type = type || _currentTab;

  // Scrape visible tables
  var tables = document.querySelectorAll('#rptContent .qb-table');
  if (tables.length > 0) {
    var allCsv = '';
    tables.forEach(function(table, tIdx) {
      if (tIdx > 0) allCsv += '\n';
      var rows = table.querySelectorAll('tr');
      rows.forEach(function(row) {
        var cells = row.querySelectorAll('th, td');
        var vals = [];
        cells.forEach(function(cell) {
          var val = cell.textContent.trim();
          vals.push(csvVal(val));
        });
        allCsv += vals.join(',') + '\n';
      });
    });
    if (allCsv.trim()) { downloadCsv(allCsv, 'bf-ops-' + type + '-' + _dateFrom + '-to-' + _dateTo + '.csv'); return; }
  }

  // Fallback: summary cards
  var cards = document.querySelectorAll('#rptContent .qb-summary-item');
  if (cards.length > 0) {
    var csv = 'Metric,Value\n';
    cards.forEach(function(card) {
      var label = (card.querySelector('.qb-summary-label') || {}).textContent || '';
      var value = (card.querySelector('.qb-summary-value') || {}).textContent || '';
      csv += csvVal(label.trim()) + ',' + csvVal(value.trim()) + '\n';
    });
    downloadCsv(csv, 'bf-ops-' + type + '-summary-' + _dateFrom + '-to-' + _dateTo + '.csv');
    return;
  }

  // Last resort: API
  var typeMap = { financial:'orders', sales:'orders', products:'products', purchasing:'bills', delivery:'orders', returns:'returns', customers:'customers', inventory:'inventory', fleet:'orders', warehouse:'orders' };
  var exportType = typeMap[type] || type;
  var q = 'type=' + exportType + '&from=' + _dateFrom + '&to=' + _dateTo;
  if (type === 'inventory') {
    var asOfDate = document.getElementById('rptAsOfDate')?.value;
    if (asOfDate) q = 'type=inventory_snapshot&date=' + asOfDate;
  }

  API.get('/reports/export?' + q).then(function(r) {
    var data = r.data.data;
    if (!data || data.length === 0) { alert('No data to export.'); return; }
    var headers = Object.keys(data[0]);
    var csv = headers.join(',') + '\n';
    data.forEach(function(row) {
      csv += headers.map(function(h) { return csvVal(String(row[h] ?? '')); }).join(',') + '\n';
    });
    downloadCsv(csv, 'bf-ops-' + exportType + '-' + _dateFrom + '-to-' + _dateTo + '.csv');
  }).catch(function(err) {
    alert('Export failed: ' + (err.response?.data?.error || err.message));
  });
};

function csvVal(val) {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) return '"' + val.replace(/"/g, '""') + '"';
  return val;
}

function downloadCsv(csv, filename) {
  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

})();
