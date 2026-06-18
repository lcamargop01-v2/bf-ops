// BF Operations — Reports Module
// Comprehensive reporting with drill-down, export, and inventory as-of-date

(function() {
'use strict';

var API = window.axios ? axios.create({ baseURL: '/api' }) : null;
var _rptData = {};
var _currentTab = 'financial';
var _dateFrom = '';
var _dateTo = '';
var _locations = [];
var _categories = [];

// ==================== INIT ====================
window._reportsInit = function() {
  if (!API) API = axios.create({ baseURL: '/api' });
  // Set auth token
  var token = localStorage.getItem('bf_token');
  if (token) API.defaults.headers.common['Authorization'] = 'Bearer ' + token;

  // Default: last 30 days
  var now = new Date();
  var ago = new Date(now.getTime() - 30 * 86400000);
  _dateTo = now.toISOString().slice(0, 10);
  _dateFrom = ago.toISOString().slice(0, 10);

  renderReportsApp();
  loadFilters();
  loadTab(_currentTab);
};

function renderReportsApp() {
  var el = document.getElementById('reports-app');
  if (!el) return;

  el.innerHTML =
    '<div class="rpt-tabs" id="rptTabs">' +
      rptTabBtn('financial', 'fa-chart-line', 'Financial') +
      rptTabBtn('sales', 'fa-receipt', 'Sales') +
      rptTabBtn('products', 'fa-box', 'Products') +
      rptTabBtn('purchasing', 'fa-cart-shopping', 'Purchasing') +
      rptTabBtn('delivery', 'fa-truck', 'Delivery') +
      rptTabBtn('returns', 'fa-rotate-left', 'Returns') +
      rptTabBtn('customers', 'fa-users', 'Customers') +
      rptTabBtn('inventory', 'fa-warehouse', 'Inventory') +
      rptTabBtn('fleet', 'fa-truck-monster', 'Fleet') +
      rptTabBtn('warehouse', 'fa-boxes-stacked', 'Warehouse') +
    '</div>' +
    '<div class="rpt-toolbar" id="rptToolbar">' +
      '<div class="rpt-date-range">' +
        '<input type="date" id="rptFrom" value="' + _dateFrom + '" onchange="window._rptSetFrom(this.value)">' +
        '<span>to</span>' +
        '<input type="date" id="rptTo" value="' + _dateTo + '" onchange="window._rptSetTo(this.value)">' +
      '</div>' +
      '<div class="rpt-quick-range">' +
        '<button class="rpt-quick-btn" onclick="window._rptQuick(7)">7d</button>' +
        '<button class="rpt-quick-btn active" onclick="window._rptQuick(30)">30d</button>' +
        '<button class="rpt-quick-btn" onclick="window._rptQuick(90)">90d</button>' +
        '<button class="rpt-quick-btn" onclick="window._rptQuick(365)">1yr</button>' +
        '<button class="rpt-quick-btn" onclick="window._rptQuickAll()">All</button>' +
      '</div>' +
      '<div class="rpt-toolbar-right">' +
        '<button class="rpt-export-btn" onclick="window._rptExportPDF()"><i class="fas fa-file-pdf"></i> PDF</button>' +
        '<button class="rpt-export-btn" onclick="window._rptExportExcel()"><i class="fas fa-file-excel"></i> Excel</button>' +
      '</div>' +
    '</div>' +
    '<div id="rptContent" class="rpt-page">' +
      '<div class="rpt-loading"><i class="fas fa-spinner fa-spin"></i> Loading report...</div>' +
    '</div>';
}

function rptTabBtn(id, icon, label) {
  return '<button class="rpt-tab ' + (_currentTab === id ? 'active' : '') + '" onclick="window._rptTab(\'' + id + '\')">' +
    '<i class="fas ' + icon + '"></i> <span>' + label + '</span></button>';
}

// ==================== TAB SWITCHING ====================
window._rptTab = function(tab) {
  _currentTab = tab;
  document.querySelectorAll('.rpt-tab').forEach(function(t) { t.classList.remove('active'); });
  var tabs = document.querySelectorAll('.rpt-tab');
  var tabIds = ['financial','sales','products','purchasing','delivery','returns','customers','inventory','fleet','warehouse'];
  var idx = tabIds.indexOf(tab);
  if (idx >= 0 && tabs[idx]) tabs[idx].classList.add('active');
  loadTab(tab);
};

// ==================== DATE CONTROLS ====================
window._rptSetFrom = function(v) { _dateFrom = v; loadTab(_currentTab); };
window._rptSetTo = function(v) { _dateTo = v; loadTab(_currentTab); };
window._rptQuick = function(days) {
  var now = new Date();
  _dateTo = now.toISOString().slice(0, 10);
  _dateFrom = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  document.getElementById('rptFrom').value = _dateFrom;
  document.getElementById('rptTo').value = _dateTo;
  document.querySelectorAll('.rpt-quick-btn').forEach(function(b) { b.classList.remove('active'); });
  event.target.classList.add('active');
  loadTab(_currentTab);
};
window._rptQuickAll = function() {
  _dateFrom = '2020-01-01';
  _dateTo = new Date().toISOString().slice(0, 10);
  document.getElementById('rptFrom').value = _dateFrom;
  document.getElementById('rptTo').value = _dateTo;
  document.querySelectorAll('.rpt-quick-btn').forEach(function(b) { b.classList.remove('active'); });
  event.target.classList.add('active');
  loadTab(_currentTab);
};

function loadFilters() {
  API.get('/reports/locations').then(function(r) { _locations = r.data; }).catch(function() {});
  API.get('/reports/categories').then(function(r) { _categories = r.data; }).catch(function() {});
}

// ==================== LOAD TAB ====================
function loadTab(tab) {
  var el = document.getElementById('rptContent');
  el.innerHTML = '<div class="rpt-loading"><i class="fas fa-spinner fa-spin"></i> Loading report...</div>';

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

function summaryCard(label, value, opts) {
  opts = opts || {};
  var cls = opts.color ? ' ' + opts.color : '';
  var click = opts.onClick ? ' clickable" onclick="' + opts.onClick + '"' : '"';
  var icon = opts.icon ? '<div class="rpt-card-icon" style="background:' + (opts.iconBg || '#3B82F6') + '"><i class="fas ' + opts.icon + '"></i></div>' : '';
  var sub = opts.sub ? '<div class="rpt-card-sub">' + opts.sub + '</div>' : '';
  return '<div class="rpt-card' + click + '>' + icon +
    '<div class="rpt-card-label">' + label + '</div>' +
    '<div class="rpt-card-value' + cls + '">' + value + '</div>' + sub + '</div>';
}

function sectionStart(title, icon, actionsHtml) {
  return '<div class="rpt-section"><div class="rpt-section-header">' +
    '<div class="rpt-section-title"><i class="fas ' + icon + '"></i> ' + title + '</div>' +
    (actionsHtml ? '<div class="rpt-section-actions">' + actionsHtml + '</div>' : '') +
    '</div><div class="rpt-section-body">';
}
function sectionEnd() { return '</div></div>'; }

function groupBtns(groups, current, callbackName) {
  return groups.map(function(g) {
    return '<button class="rpt-group-btn ' + (current === g.id ? 'active' : '') + '" onclick="window.' + callbackName + '(\'' + g.id + '\')">' + g.label + '</button>';
  }).join('');
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

    var html = '<div class="rpt-summary">' +
      summaryCard('Revenue', fmt$(rev.total_revenue), { icon: 'fa-dollar-sign', iconBg: '#059669', color: 'green', sub: fmtN(rev.order_count) + ' orders' }) +
      summaryCard('Cost of Goods', fmt$(rev.cogs), { icon: 'fa-tags', iconBg: '#D97706', sub: 'COGS from sold items' }) +
      summaryCard('Gross Margin', fmt$(rev.gross_margin), { icon: 'fa-chart-line', iconBg: '#2563EB', color: rev.gross_margin >= 0 ? 'green' : 'red', sub: fmtPct(rev.gross_margin, rev.total_revenue) + ' margin rate' }) +
      summaryCard('Purchasing Spend', fmt$(pur.total_purchasing), { icon: 'fa-cart-shopping', iconBg: '#F97316', color: 'orange', sub: fmtN(pur.po_count) + ' purchase orders' }) +
      summaryCard('Bills Paid', fmt$(bill.paid), { icon: 'fa-file-invoice-dollar', iconBg: '#059669', sub: 'Paid to suppliers' }) +
      summaryCard('Bills Pending', fmt$(bill.pending), { icon: 'fa-clock', iconBg: '#EAB308', color: 'orange', sub: 'Awaiting payment' }) +
      summaryCard('Inventory Value (Cost)', fmt$(inv.inventory_value), { icon: 'fa-warehouse', iconBg: '#7C3AED', color: 'purple', sub: fmtN(inv.total_units) + ' units on hand' }) +
      summaryCard('Inventory Value (Retail)', fmt$(inv.inventory_retail_value), { icon: 'fa-store', iconBg: '#2563EB', sub: 'At selling price' }) +
    '</div>';

    // Monthly trend chart
    if (d.monthlyTrend && d.monthlyTrend.length > 0) {
      html += sectionStart('Monthly Trend', 'fa-chart-bar', '');
      html += '<div class="rpt-chart-wrap"><canvas id="rptFinChart"></canvas></div>';
      html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr>' +
        '<th>Month</th><th class="right">Revenue</th><th class="right">COGS</th><th class="right">Margin</th><th class="right">Margin %</th><th class="right">Orders</th>' +
        '</tr></thead><tbody>';
      d.monthlyTrend.forEach(function(m) {
        html += '<tr><td class="num">' + m.month + '</td>' +
          '<td class="right money">' + fmt$(m.revenue) + '</td>' +
          '<td class="right num">' + fmt$(m.cogs) + '</td>' +
          '<td class="right money">' + fmt$(m.margin) + '</td>' +
          '<td class="right num">' + fmtPct(m.margin, m.revenue) + '</td>' +
          '<td class="right num">' + fmtN(m.orders) + '</td></tr>';
      });
      html += '</tbody></table></div>';
      html += sectionEnd();
    }

    el.innerHTML = html;

    // Render chart
    if (d.monthlyTrend && d.monthlyTrend.length > 0 && window.Chart) {
      renderFinChart(d.monthlyTrend);
    }
  }).catch(function(err) {
    document.getElementById('rptContent').innerHTML = '<div class="rpt-empty"><i class="fas fa-exclamation-triangle"></i> Failed to load financial report</div>';
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
        { label: 'Revenue', data: data.map(function(d) { return d.revenue; }), backgroundColor: 'rgba(5,150,105,0.7)', borderRadius: 6, order: 2 },
        { label: 'COGS', data: data.map(function(d) { return d.cogs; }), backgroundColor: 'rgba(217,119,6,0.5)', borderRadius: 6, order: 3 },
        { label: 'Margin', data: data.map(function(d) { return d.margin; }), type: 'line', borderColor: '#2563EB', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 4, order: 1 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, ticks: { callback: function(v) { return '$' + (v/1000).toFixed(0) + 'k'; } } } } }
  });
}

// ==================== SALES REPORT ====================
var _salesGroup = 'day';
function loadSales(q) {
  API.get('/reports/sales?' + q + '&group_by=' + _salesGroup).then(function(r) {
    var d = r.data;
    var s = d.summary || {};
    var el = document.getElementById('rptContent');

    var html = '<div class="rpt-summary">' +
      summaryCard('Total Orders', fmtN(s.total_orders), { icon: 'fa-receipt', iconBg: '#2563EB', onClick: "window._rptDrillSales('status','all')" }) +
      summaryCard('Delivered', fmtN(s.delivered), { icon: 'fa-circle-check', iconBg: '#059669', color: 'green', onClick: "window._rptDrillSales('status','delivered')" }) +
      summaryCard('Active', fmtN(s.active), { icon: 'fa-spinner', iconBg: '#F97316', color: 'orange', onClick: "window._rptDrillSales('status','active')" }) +
      summaryCard('Cancelled', fmtN(s.cancelled), { icon: 'fa-ban', iconBg: '#DC2626', color: 'red', onClick: "window._rptDrillSales('status','cancelled')" }) +
      summaryCard('Revenue', fmt$(s.total_revenue), { icon: 'fa-dollar-sign', iconBg: '#059669', color: 'green' }) +
      summaryCard('Total Weight', fmtN(Math.round(s.total_weight || 0)) + ' lbs', { icon: 'fa-weight-hanging', iconBg: '#7C3AED' }) +
    '</div>';

    var groups = [{ id: 'day', label: 'Daily' }, { id: 'month', label: 'Monthly' }, { id: 'customer', label: 'By Customer' }, { id: 'product', label: 'By Product' }, { id: 'status', label: 'By Status' }];
    html += sectionStart('Breakdown', 'fa-table', groupBtns(groups, _salesGroup, '_rptSalesGroup'));

    if (d.breakdown && d.breakdown.length > 0) {
      if (_salesGroup === 'day' || _salesGroup === 'month') {
        html += '<div class="rpt-chart-wrap"><canvas id="rptSalesChart"></canvas></div>';
        html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Period</th><th class="right">Orders</th><th class="right">Weight</th></tr></thead><tbody>';
        d.breakdown.forEach(function(row) {
          html += '<tr class="clickable" onclick="window._rptDrillSales(\'date\',\'' + row.period + '\')"><td class="num">' + row.period + '</td><td class="right num">' + fmtN(row.orders) + '</td><td class="right num">' + fmtN(Math.round(row.weight || 0)) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      } else if (_salesGroup === 'customer') {
        html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Customer</th><th class="right">Orders</th><th class="right">Units</th><th class="right">Revenue</th><th class="right">Weight</th></tr></thead><tbody>';
        d.breakdown.forEach(function(row) {
          html += '<tr class="clickable" onclick="window._rptDrillSales(\'customer\',' + row.customer_id + ')"><td>' + (row.label || 'Unknown') + '</td><td class="right num">' + fmtN(row.orders) + '</td><td class="right num">' + fmtN(row.units) + '</td><td class="right money">' + fmt$(row.revenue) + '</td><td class="right num">' + fmtN(Math.round(row.weight || 0)) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      } else if (_salesGroup === 'product') {
        html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Product</th><th>Category</th><th class="right">Units</th><th class="right">Revenue</th><th class="right">Cost</th><th class="right">Margin</th><th class="right">Orders</th></tr></thead><tbody>';
        d.breakdown.forEach(function(row) {
          html += '<tr class="clickable" onclick="window._rptDrillSales(\'product\',' + row.product_id + ')"><td>' + (row.label || 'Unknown') + '</td><td><span class="rpt-badge rpt-badge-blue">' + (row.category || '-') + '</span></td><td class="right num">' + fmtN(row.units) + '</td><td class="right money">' + fmt$(row.revenue) + '</td><td class="right num">' + fmt$(row.cost) + '</td><td class="right money">' + fmt$(row.margin) + '</td><td class="right num">' + fmtN(row.orders) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      } else if (_salesGroup === 'status') {
        html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Status</th><th class="right">Orders</th><th class="right">Weight</th></tr></thead><tbody>';
        d.breakdown.forEach(function(row) {
          html += '<tr class="clickable" onclick="window._rptDrillSales(\'status\',\'' + row.label + '\')"><td><span class="rpt-badge rpt-badge-blue">' + row.label + '</span></td><td class="right num">' + fmtN(row.orders) + '</td><td class="right num">' + fmtN(Math.round(row.weight || 0)) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      }
    } else {
      html += '<div class="rpt-empty"><i class="fas fa-inbox"></i> No data for this period</div>';
    }
    html += sectionEnd();
    el.innerHTML = html;

    // Chart for daily/monthly
    if ((_salesGroup === 'day' || _salesGroup === 'month') && d.breakdown && d.breakdown.length > 0 && window.Chart) {
      var ctx = document.getElementById('rptSalesChart');
      if (ctx) new Chart(ctx, {
        type: 'bar',
        data: { labels: d.breakdown.map(function(r) { return r.period; }), datasets: [{ label: 'Orders', data: d.breakdown.map(function(r) { return r.orders; }), backgroundColor: 'rgba(30,58,138,0.7)', borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
      });
    }
  }).catch(function() { document.getElementById('rptContent').innerHTML = '<div class="rpt-empty"><i class="fas fa-exclamation-triangle"></i> Failed to load sales report</div>'; });
}

window._rptSalesGroup = function(g) { _salesGroup = g; loadTab('sales'); };

// ==================== SALES DRILL-DOWN ====================
window._rptDrillSales = function(type, val) {
  var q = 'from=' + _dateFrom + '&to=' + _dateTo;
  if (type === 'customer') q += '&customer_id=' + val;
  else if (type === 'product') q += '&product_id=' + val;
  else if (type === 'date') q += '&date=' + val;
  else if (type === 'status' && val !== 'all' && val !== 'active') q += '&status=' + val;

  API.get('/reports/sales/drill?' + q).then(function(r) {
    var orders = r.data;
    var title = 'Orders';
    if (type === 'date') title = 'Orders on ' + val;
    else if (type === 'status') title = val.charAt(0).toUpperCase() + val.slice(1) + ' Orders';

    var html = '<table class="rpt-table"><thead><tr><th>Order #</th><th>Customer</th><th>Status</th><th>Date</th><th>Items</th><th class="right">Weight</th></tr></thead><tbody>';
    orders.forEach(function(o) {
      html += '<tr><td class="num">' + o.order_number + '</td><td>' + (o.customer_name || '-') + '</td><td><span class="rpt-badge rpt-badge-blue">' + o.status + '</span></td><td class="muted">' + (o.created_at || '').slice(0, 10) + '</td><td class="muted" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (o.items_summary || '-') + '</td><td class="right num">' + fmtN(Math.round(o.total_weight || 0)) + '</td></tr>';
    });
    html += '</tbody></table>';
    if (orders.length === 0) html = '<div class="rpt-empty"><i class="fas fa-inbox"></i> No orders found</div>';
    showDrillModal(title, html, 'orders');
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

    var catOptions = '<option value="">All Categories</option>' + _categories.map(function(c) { return '<option value="' + c + '" ' + (c === cat ? 'selected' : '') + '>' + c + '</option>'; }).join('');

    var html = '<div style="margin-bottom:12px"><select class="rpt-filter-select" id="rptCatFilter" onchange="window._rptTab(\'products\')">' + catOptions + '</select></div>';

    html += '<div class="rpt-summary">' +
      summaryCard('Total Revenue', fmt$(s.totalRevenue), { icon: 'fa-dollar-sign', iconBg: '#059669', color: 'green' }) +
      summaryCard('Total COGS', fmt$(s.totalCost), { icon: 'fa-tags', iconBg: '#D97706' }) +
      summaryCard('Gross Margin', fmt$(s.totalMargin), { icon: 'fa-chart-line', iconBg: '#2563EB', color: 'green', sub: fmtPct(s.totalMargin, s.totalRevenue) }) +
      summaryCard('Units Sold', fmtN(s.totalUnits), { icon: 'fa-cubes', iconBg: '#7C3AED' }) +
    '</div>';

    // By category
    if (d.byCategory && d.byCategory.length > 0) {
      html += sectionStart('By Category', 'fa-layer-group', '');
      html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Category</th><th class="right">Products</th><th class="right">Units Sold</th><th class="right">Revenue</th><th class="right">Cost</th><th class="right">Margin</th></tr></thead><tbody>';
      d.byCategory.forEach(function(row) {
        html += '<tr><td><span class="rpt-badge rpt-badge-blue">' + row.category + '</span></td><td class="right num">' + fmtN(row.products) + '</td><td class="right num">' + fmtN(row.units) + '</td><td class="right money">' + fmt$(row.revenue) + '</td><td class="right num">' + fmt$(row.cost) + '</td><td class="right money">' + fmt$(row.margin) + '</td></tr>';
      });
      html += '</tbody></table></div>';
      html += sectionEnd();
    }

    // Product list
    html += sectionStart('All Products', 'fa-list', '');
    html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Product</th><th>Category</th><th class="right">Price</th><th class="right">Cost</th><th class="right">Units Sold</th><th class="right">Revenue</th><th class="right">Margin</th><th class="right">Stock</th></tr></thead><tbody>';
    (d.products || []).forEach(function(p) {
      html += '<tr class="clickable" onclick="window._rptDrillSales(\'product\',' + p.id + ')"><td>' + p.name + '</td><td><span class="rpt-badge rpt-badge-blue">' + (p.category || '-') + '</span></td><td class="right num">' + fmt$(p.price) + '</td><td class="right num">' + fmt$(p.cost) + '</td><td class="right num">' + fmtN(p.units_sold) + '</td><td class="right money">' + fmt$(p.revenue) + '</td><td class="right money">' + fmt$(p.margin) + '</td><td class="right num">' + fmtN(p.current_stock) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += sectionEnd();
    el.innerHTML = html;
  }).catch(function() { document.getElementById('rptContent').innerHTML = '<div class="rpt-empty"><i class="fas fa-exclamation-triangle"></i> Failed to load products report</div>'; });
}

// ==================== PURCHASING REPORT ====================
var _purGroup = 'supplier';
function loadPurchasing(q) {
  API.get('/reports/purchasing?' + q + '&group_by=' + _purGroup).then(function(r) {
    var d = r.data;
    var s = d.summary || {};
    var el = document.getElementById('rptContent');

    var html = '<div class="rpt-summary">' +
      summaryCard('Total POs', fmtN(s.total_pos), { icon: 'fa-file-alt', iconBg: '#2563EB' }) +
      summaryCard('Total Spent', fmt$(s.total_spent), { icon: 'fa-dollar-sign', iconBg: '#D97706', color: 'orange' }) +
      summaryCard('Received', fmtN(s.received), { icon: 'fa-check-circle', iconBg: '#059669', color: 'green' }) +
      summaryCard('Active', fmtN(s.active), { icon: 'fa-spinner', iconBg: '#F97316', color: 'orange' }) +
      summaryCard('Bills Pending', fmt$(s.pending_amount), { icon: 'fa-clock', iconBg: '#EAB308', color: 'orange' }) +
      summaryCard('Bills Paid', fmt$(s.paid_amount), { icon: 'fa-check', iconBg: '#059669', color: 'green' }) +
    '</div>';

    var groups = [{ id: 'supplier', label: 'By Supplier' }, { id: 'product', label: 'By Product' }, { id: 'month', label: 'Monthly' }];
    html += sectionStart('Breakdown', 'fa-table', groupBtns(groups, _purGroup, '_rptPurGroup'));

    if (d.breakdown && d.breakdown.length > 0) {
      if (_purGroup === 'supplier') {
        html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Supplier</th><th class="right">POs</th><th class="right">Spent</th><th class="right">Received</th><th class="right">Active</th></tr></thead><tbody>';
        d.breakdown.forEach(function(row) {
          html += '<tr><td>' + (row.label || 'Unknown') + '</td><td class="right num">' + fmtN(row.pos) + '</td><td class="right money">' + fmt$(row.spent) + '</td><td class="right num">' + fmtN(row.received) + '</td><td class="right num">' + fmtN(row.active) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      } else if (_purGroup === 'product') {
        html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Product</th><th>Category</th><th class="right">Ordered</th><th class="right">Received</th><th class="right">Total Cost</th><th class="right">POs</th></tr></thead><tbody>';
        d.breakdown.forEach(function(row) {
          html += '<tr><td>' + (row.label || 'Unknown') + '</td><td><span class="rpt-badge rpt-badge-blue">' + (row.category || '-') + '</span></td><td class="right num">' + fmtN(row.qty_ordered) + '</td><td class="right num">' + fmtN(row.qty_received) + '</td><td class="right money">' + fmt$(row.total_cost) + '</td><td class="right num">' + fmtN(row.pos) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      } else if (_purGroup === 'month') {
        html += '<div class="rpt-chart-wrap"><canvas id="rptPurChart"></canvas></div>';
        html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Month</th><th class="right">POs</th><th class="right">Spent</th></tr></thead><tbody>';
        d.breakdown.forEach(function(row) {
          html += '<tr><td class="num">' + row.period + '</td><td class="right num">' + fmtN(row.pos) + '</td><td class="right money">' + fmt$(row.spent) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      }
    } else {
      html += '<div class="rpt-empty"><i class="fas fa-inbox"></i> No data</div>';
    }
    html += sectionEnd();
    el.innerHTML = html;

    if (_purGroup === 'month' && d.breakdown && d.breakdown.length > 0 && window.Chart) {
      var ctx = document.getElementById('rptPurChart');
      if (ctx) new Chart(ctx, {
        type: 'bar',
        data: { labels: d.breakdown.map(function(r) { return r.period; }), datasets: [{ label: 'Spent', data: d.breakdown.map(function(r) { return r.spent; }), backgroundColor: 'rgba(217,119,6,0.7)', borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: function(v) { return '$' + (v/1000).toFixed(0) + 'k'; } } } } }
      });
    }
  }).catch(function() { document.getElementById('rptContent').innerHTML = '<div class="rpt-empty"><i class="fas fa-exclamation-triangle"></i> Failed to load purchasing report</div>'; });
}
window._rptPurGroup = function(g) { _purGroup = g; loadTab('purchasing'); };

// ==================== DELIVERY REPORT ====================
var _delGroup = 'day';
function loadDelivery(q) {
  API.get('/reports/delivery?' + q + '&group_by=' + _delGroup).then(function(r) {
    var d = r.data;
    var s = d.summary || {};
    var el = document.getElementById('rptContent');

    var html = '<div class="rpt-summary">' +
      summaryCard('Total Routes', fmtN(s.total_routes), { icon: 'fa-route', iconBg: '#2563EB' }) +
      summaryCard('Completed', fmtN(s.completed), { icon: 'fa-check-circle', iconBg: '#059669', color: 'green' }) +
      summaryCard('Total Stops', fmtN(s.total_stops), { icon: 'fa-map-marker-alt', iconBg: '#7C3AED' }) +
      summaryCard('Delivered', fmtN(s.delivered_stops), { icon: 'fa-truck', iconBg: '#10B981', color: 'green', sub: fmtPct(s.delivered_stops, s.total_stops) + ' delivery rate' }) +
      summaryCard('Proofs Collected', fmtN(s.proofs_collected), { icon: 'fa-camera', iconBg: '#F97316' }) +
    '</div>';

    var groups = [{ id: 'day', label: 'Daily' }, { id: 'driver', label: 'By Driver' }, { id: 'truck', label: 'By Truck' }];
    html += sectionStart('Breakdown', 'fa-table', groupBtns(groups, _delGroup, '_rptDelGroup'));

    if (d.breakdown && d.breakdown.length > 0) {
      if (_delGroup === 'day') {
        html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Date</th><th class="right">Routes</th><th class="right">Completed</th></tr></thead><tbody>';
        d.breakdown.forEach(function(row) {
          html += '<tr><td class="num">' + row.period + '</td><td class="right num">' + fmtN(row.routes) + '</td><td class="right num">' + fmtN(row.completed) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      } else if (_delGroup === 'driver') {
        html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Driver</th><th class="right">Routes</th><th class="right">Completed</th><th class="right">Stops Delivered</th><th class="right">Proofs</th></tr></thead><tbody>';
        d.breakdown.forEach(function(row) {
          html += '<tr><td>' + (row.label || 'Unassigned') + '</td><td class="right num">' + fmtN(row.routes) + '</td><td class="right num">' + fmtN(row.completed) + '</td><td class="right num">' + fmtN(row.stops) + '</td><td class="right num">' + fmtN(row.proofs) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      } else if (_delGroup === 'truck') {
        html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Truck</th><th class="right">Routes</th><th class="right">Completed</th></tr></thead><tbody>';
        d.breakdown.forEach(function(row) {
          html += '<tr><td>' + (row.label || 'Unassigned') + '</td><td class="right num">' + fmtN(row.routes) + '</td><td class="right num">' + fmtN(row.completed) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      }
    } else {
      html += '<div class="rpt-empty"><i class="fas fa-inbox"></i> No data</div>';
    }
    html += sectionEnd();
    el.innerHTML = html;
  }).catch(function() { document.getElementById('rptContent').innerHTML = '<div class="rpt-empty"><i class="fas fa-exclamation-triangle"></i> Failed to load delivery report</div>'; });
}
window._rptDelGroup = function(g) { _delGroup = g; loadTab('delivery'); };

// ==================== RETURNS REPORT ====================
var _retGroup = 'customer';
function loadReturns(q) {
  API.get('/reports/returns?' + q + '&group_by=' + _retGroup).then(function(r) {
    var d = r.data;
    var s = d.summary || {};
    var el = document.getElementById('rptContent');

    var html = '<div class="rpt-summary">' +
      summaryCard('Total Returns', fmtN(s.total_returns), { icon: 'fa-rotate-left', iconBg: '#DC2626', color: 'red' }) +
      summaryCard('Completed', fmtN(s.completed), { icon: 'fa-check', iconBg: '#059669', color: 'green' }) +
      summaryCard('Pending', fmtN(s.pending), { icon: 'fa-clock', iconBg: '#F97316', color: 'orange' }) +
      summaryCard('Items Returned', fmtN(s.total_items), { icon: 'fa-box', iconBg: '#7C3AED' }) +
      summaryCard('Qty Returned', fmtN(s.total_qty_returned), { icon: 'fa-cubes', iconBg: '#2563EB' }) +
    '</div>';

    var groups = [{ id: 'customer', label: 'By Customer' }, { id: 'product', label: 'By Product' }, { id: 'day', label: 'Daily' }];
    html += sectionStart('Breakdown', 'fa-table', groupBtns(groups, _retGroup, '_rptRetGroup'));

    if (d.breakdown && d.breakdown.length > 0) {
      if (_retGroup === 'customer') {
        html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Customer</th><th class="right">Returns</th><th class="right">Items</th><th class="right">Qty</th></tr></thead><tbody>';
        d.breakdown.forEach(function(row) {
          html += '<tr><td>' + (row.label || 'Unknown') + '</td><td class="right num">' + fmtN(row.returns) + '</td><td class="right num">' + fmtN(row.items) + '</td><td class="right num">' + fmtN(row.qty) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      } else if (_retGroup === 'product') {
        html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Product</th><th>Category</th><th class="right">Qty Returned</th><th class="right">Returns</th></tr></thead><tbody>';
        d.breakdown.forEach(function(row) {
          html += '<tr><td>' + (row.label || 'Unknown') + '</td><td><span class="rpt-badge rpt-badge-blue">' + (row.category || '-') + '</span></td><td class="right num">' + fmtN(row.qty_returned) + '</td><td class="right num">' + fmtN(row.returns) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      } else if (_retGroup === 'day') {
        html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Date</th><th class="right">Returns</th></tr></thead><tbody>';
        d.breakdown.forEach(function(row) {
          html += '<tr><td class="num">' + row.period + '</td><td class="right num">' + fmtN(row.returns) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      }
    } else {
      html += '<div class="rpt-empty"><i class="fas fa-inbox"></i> No returns data</div>';
    }
    html += sectionEnd();
    el.innerHTML = html;
  }).catch(function() { document.getElementById('rptContent').innerHTML = '<div class="rpt-empty"><i class="fas fa-exclamation-triangle"></i> Failed to load returns report</div>'; });
}
window._rptRetGroup = function(g) { _retGroup = g; loadTab('returns'); };

// ==================== CUSTOMERS REPORT ====================
function loadCustomers(q) {
  API.get('/reports/customers?' + q).then(function(r) {
    var d = r.data;
    var s = d.summary || {};
    var el = document.getElementById('rptContent');

    var html = '<div class="rpt-summary">' +
      summaryCard('Active Customers', fmtN(s.total_active), { icon: 'fa-users', iconBg: '#2563EB' }) +
      summaryCard('Ordering in Period', fmtN(s.ordering_customers), { icon: 'fa-cart-shopping', iconBg: '#059669', color: 'green' }) +
      summaryCard('Dormant', fmtN(s.dormant_customers), { icon: 'fa-user-clock', iconBg: '#F97316', color: 'orange', sub: 'No orders in period' }) +
      summaryCard('Inactive', fmtN(s.total_inactive), { icon: 'fa-user-slash', iconBg: '#DC2626', color: 'red' }) +
    '</div>';

    // Top customers
    html += sectionStart('Top Customers (by Revenue)', 'fa-trophy', '');
    html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Customer</th><th>Zone</th><th class="right">Orders</th><th class="right">Revenue</th><th class="right">Weight</th><th>Last Order</th></tr></thead><tbody>';
    (d.topCustomers || []).forEach(function(c) {
      html += '<tr class="clickable" onclick="window._rptDrillSales(\'customer\',' + c.id + ')"><td>' + (c.business_name || '-') + '</td><td><span class="rpt-badge rpt-badge-blue">' + (c.zone || '-') + '</span></td><td class="right num">' + fmtN(c.order_count) + '</td><td class="right money">' + fmt$(c.revenue) + '</td><td class="right num">' + fmtN(Math.round(c.total_weight || 0)) + '</td><td class="muted">' + (c.last_order || '').slice(0, 10) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += sectionEnd();

    // Dormant
    if (d.dormant && d.dormant.length > 0) {
      html += sectionStart('Dormant Customers (No Orders in Period)', 'fa-user-clock', '');
      html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Customer</th><th>Zone</th><th>Last Order</th></tr></thead><tbody>';
      d.dormant.forEach(function(c) {
        html += '<tr><td>' + (c.business_name || '-') + '</td><td><span class="rpt-badge rpt-badge-orange">' + (c.zone || '-') + '</span></td><td class="muted">' + (c.last_order || 'Never').slice(0, 10) + '</td></tr>';
      });
      html += '</tbody></table></div>';
      html += sectionEnd();
    }
    el.innerHTML = html;
  }).catch(function() { document.getElementById('rptContent').innerHTML = '<div class="rpt-empty"><i class="fas fa-exclamation-triangle"></i> Failed to load customers report</div>'; });
}

// ==================== INVENTORY AS-OF REPORT ====================
var _invAsOfDate = new Date().toISOString().slice(0, 10);
function loadInventory() {
  var el = document.getElementById('rptContent');

  var html = '<div class="rpt-asof-panel">' +
    '<div class="rpt-asof-title"><i class="fas fa-calendar-day"></i> Inventory As-Of Date</div>' +
    '<div class="rpt-asof-controls">' +
      '<input type="date" id="rptAsOfDate" value="' + _invAsOfDate + '">' +
      '<button class="rpt-asof-btn" onclick="window._rptLoadAsOf()"><i class="fas fa-search"></i> Load Inventory</button>' +
      '<button class="rpt-snapshot-btn" onclick="window._rptTakeSnapshot()"><i class="fas fa-camera"></i> Take Today\'s Snapshot</button>' +
    '</div>' +
  '</div>';
  html += '<div id="rptInvResults"><div class="rpt-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div></div>';
  el.innerHTML = html;

  _rptLoadAsOfData();
}

function _rptLoadAsOfData() {
  var date = _invAsOfDate;
  API.get('/reports/inventory/as-of?date=' + date).then(function(r) {
    var d = r.data;
    var container = document.getElementById('rptInvResults');
    if (!container) return;

    var html = '';
    if (d.source === 'none' || d.source === 'nearest_snapshot') {
      html += '<div class="rpt-empty"><i class="fas fa-info-circle"></i> ' + (d.message || 'No data') + '</div>';
    }

    if (d.items && d.items.length > 0) {
      var s = d.summary || {};
      html += '<div style="margin-bottom:8px;font-size:12px;color:#6B7280"><i class="fas fa-info-circle"></i> Source: ' + d.source + (d.source === 'snapshot' ? ' (saved snapshot)' : ' (current stock)') + '</div>';

      html += '<div class="rpt-summary">' +
        summaryCard('Products', fmtN(s.totalItems), { icon: 'fa-box', iconBg: '#2563EB' }) +
        summaryCard('Total Qty', fmtN(s.totalQty), { icon: 'fa-cubes', iconBg: '#7C3AED' }) +
        summaryCard('Total Value', fmt$(s.totalValue), { icon: 'fa-dollar-sign', iconBg: '#059669', color: 'green' }) +
      '</div>';

      // By category
      if (d.byCategory && d.byCategory.length > 0) {
        html += sectionStart('By Category', 'fa-layer-group', '');
        html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Category</th><th class="right">Products</th><th class="right">Qty</th><th class="right">Value</th></tr></thead><tbody>';
        d.byCategory.forEach(function(cat) {
          html += '<tr><td><span class="rpt-badge rpt-badge-blue">' + cat.category + '</span></td><td class="right num">' + fmtN(cat.products) + '</td><td class="right num">' + fmtN(cat.qty) + '</td><td class="right money">' + fmt$(cat.value) + '</td></tr>';
        });
        html += '</tbody></table></div>' + sectionEnd();
      }

      // Full list
      html += sectionStart('All Products — ' + d.date, 'fa-list', '');
      html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Product</th><th>Category</th><th class="right">On Hand</th><th class="right">On Hold</th><th class="right">Reserved</th><th class="right">Available</th><th class="right">Cost</th><th class="right">Value</th></tr></thead><tbody>';
      d.items.forEach(function(item) {
        var name = item.product_name || item.name || '-';
        html += '<tr><td>' + name + '</td><td><span class="rpt-badge rpt-badge-blue">' + (item.category || '-') + '</span></td><td class="right num">' + fmtN(item.qty_on_hand) + '</td><td class="right num">' + fmtN(item.qty_on_hold) + '</td><td class="right num">' + fmtN(item.qty_reserved) + '</td><td class="right num">' + fmtN(item.qty_available) + '</td><td class="right num">' + fmt$(item.unit_cost) + '</td><td class="right money">' + fmt$(item.total_value) + '</td></tr>';
      });
      html += '</tbody></table></div>' + sectionEnd();
    } else if (d.source !== 'none' && d.source !== 'nearest_snapshot') {
      html += '<div class="rpt-empty"><i class="fas fa-inbox"></i> No inventory data for this date</div>';
    }

    container.innerHTML = html;
  }).catch(function() {
    var c = document.getElementById('rptInvResults');
    if (c) c.innerHTML = '<div class="rpt-empty"><i class="fas fa-exclamation-triangle"></i> Failed to load inventory</div>';
  });
}

window._rptLoadAsOf = function() {
  _invAsOfDate = document.getElementById('rptAsOfDate')?.value || _invAsOfDate;
  _rptLoadAsOfData();
};

window._rptTakeSnapshot = function() {
  API.post('/reports/inventory/snapshot').then(function(r) {
    alert('Snapshot taken! ' + (r.data.rows || 0) + ' products recorded for ' + r.data.date);
    _rptLoadAsOfData();
  }).catch(function(err) {
    alert('Failed to take snapshot: ' + (err.response?.data?.error || err.message));
  });
};

// ==================== FLEET REPORT ====================
function loadFleet(q) {
  API.get('/reports/fleet?' + q).then(function(r) {
    var d = r.data;
    var s = d.summary || {};
    var el = document.getElementById('rptContent');

    var html = '<div class="rpt-summary">' +
      summaryCard('Active Trucks', fmtN(s.active_trucks), { icon: 'fa-truck', iconBg: '#2563EB' }) +
      summaryCard('Total Routes', fmtN(s.total_routes), { icon: 'fa-route', iconBg: '#7C3AED' }) +
      summaryCard('Maintenance Events', fmtN(s.maintenance_records), { icon: 'fa-wrench', iconBg: '#F97316', color: 'orange' }) +
      summaryCard('Open Issues', fmtN(s.open_issues), { icon: 'fa-exclamation-triangle', iconBg: '#DC2626', color: 'red' }) +
    '</div>';

    // Truck usage
    html += sectionStart('Truck Usage', 'fa-truck', '');
    html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Truck</th><th>Plate</th><th class="right">Routes</th><th class="right">Completed</th><th class="right">Maintenance</th></tr></thead><tbody>';
    (d.truckUsage || []).forEach(function(t) {
      html += '<tr><td>' + (t.name || '-') + '</td><td class="muted">' + (t.plate_number || '-') + '</td><td class="right num">' + fmtN(t.routes) + '</td><td class="right num">' + fmtN(t.completed) + '</td><td class="right num">' + fmtN(t.maintenance_events) + '</td></tr>';
    });
    html += '</tbody></table></div>' + sectionEnd();

    // Driver performance
    html += sectionStart('Driver Performance', 'fa-user-helmet-safety', '');
    html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Driver</th><th class="right">Routes</th><th class="right">Completed</th><th class="right">Stops Delivered</th><th class="right">Proofs</th></tr></thead><tbody>';
    (d.driverPerformance || []).forEach(function(dr) {
      html += '<tr><td>' + (dr.name || '-') + '</td><td class="right num">' + fmtN(dr.routes) + '</td><td class="right num">' + fmtN(dr.completed) + '</td><td class="right num">' + fmtN(dr.stops_delivered) + '</td><td class="right num">' + fmtN(dr.proofs) + '</td></tr>';
    });
    html += '</tbody></table></div>' + sectionEnd();
    el.innerHTML = html;
  }).catch(function() { document.getElementById('rptContent').innerHTML = '<div class="rpt-empty"><i class="fas fa-exclamation-triangle"></i> Failed to load fleet report</div>'; });
}

// ==================== WAREHOUSE REPORT ====================
function loadWarehouse(q) {
  API.get('/reports/warehouse?' + q).then(function(r) {
    var d = r.data;
    var s = d.summary || {};
    var el = document.getElementById('rptContent');

    var html = '<div class="rpt-summary">' +
      summaryCard('Total Activities', fmtN(s.total_activities), { icon: 'fa-boxes-stacked', iconBg: '#2563EB' }) +
      summaryCard('Inbound Qty', fmtN(s.total_in), { icon: 'fa-arrow-down', iconBg: '#059669', color: 'green' }) +
      summaryCard('Outbound Qty', fmtN(s.total_out), { icon: 'fa-arrow-up', iconBg: '#DC2626', color: 'red' }) +
      summaryCard('Products Touched', fmtN(s.products_touched), { icon: 'fa-box', iconBg: '#7C3AED' }) +
      summaryCard('Staff Involved', fmtN(s.staff_involved), { icon: 'fa-users', iconBg: '#F97316' }) +
    '</div>';

    // By type
    html += sectionStart('By Activity Type', 'fa-list', '');
    html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Type</th><th class="right">Count</th><th class="right">Qty In</th><th class="right">Qty Out</th></tr></thead><tbody>';
    (d.byType || []).forEach(function(t) {
      html += '<tr><td><span class="rpt-badge rpt-badge-blue">' + t.activity_type + '</span></td><td class="right num">' + fmtN(t.count) + '</td><td class="right num" style="color:#059669">' + fmtN(t.qty_in) + '</td><td class="right num" style="color:#DC2626">' + fmtN(t.qty_out) + '</td></tr>';
    });
    html += '</tbody></table></div>' + sectionEnd();

    // By staff
    html += sectionStart('By Staff Member', 'fa-user', '');
    html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Name</th><th class="right">Activities</th><th class="right">Qty In</th><th class="right">Qty Out</th></tr></thead><tbody>';
    (d.byStaff || []).forEach(function(s) {
      html += '<tr><td>' + (s.label || 'Unknown') + '</td><td class="right num">' + fmtN(s.activities) + '</td><td class="right num" style="color:#059669">' + fmtN(s.qty_in) + '</td><td class="right num" style="color:#DC2626">' + fmtN(s.qty_out) + '</td></tr>';
    });
    html += '</tbody></table></div>' + sectionEnd();
    el.innerHTML = html;
  }).catch(function() { document.getElementById('rptContent').innerHTML = '<div class="rpt-empty"><i class="fas fa-exclamation-triangle"></i> Failed to load warehouse report</div>'; });
}

// ==================== DRILL-DOWN MODAL ====================
function showDrillModal(title, bodyHtml, exportType) {
  var existing = document.querySelector('.rpt-drill-overlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.className = 'rpt-drill-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML =
    '<div class="rpt-drill-modal">' +
      '<div class="rpt-drill-header"><h3><i class="fas fa-search-plus"></i> ' + title + '</h3><button class="rpt-drill-close" onclick="this.closest(\'.rpt-drill-overlay\').remove()">&times;</button></div>' +
      '<div class="rpt-drill-body">' + bodyHtml + '</div>' +
      '<div class="rpt-drill-footer">' +
        (exportType ? '<button class="rpt-export-btn" onclick="window._rptExportExcel(\'' + exportType + '\')"><i class="fas fa-file-excel"></i> Export</button>' : '') +
        '<button class="rpt-export-btn" onclick="this.closest(\'.rpt-drill-overlay\').remove()">Close</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
}

// ==================== EXPORT: PDF ====================
window._rptExportPDF = function() {
  // Build a print-friendly version and trigger print dialog (saves as PDF)
  var content = document.getElementById('rptContent');
  if (!content) return;

  var win = window.open('', '_blank');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>BF Ops Report - ' + _currentTab + '</title>' +
    '<style>' +
    'body { font-family: Inter, -apple-system, sans-serif; padding: 20px; color: #1F2937; }' +
    'h1 { font-size: 20px; color: #1E3A8A; margin-bottom: 4px; }' +
    '.period { font-size: 13px; color: #6B7280; margin-bottom: 16px; }' +
    'table { width: 100%; border-collapse: collapse; margin: 12px 0; }' +
    'th { padding: 6px 10px; text-align: left; font-size: 11px; background: #F3F4F6; border: 1px solid #E5E7EB; font-weight: 600; }' +
    'td { padding: 6px 10px; font-size: 12px; border: 1px solid #E5E7EB; }' +
    '.right { text-align: right; }' +
    '.num { font-variant-numeric: tabular-nums; }' +
    '.money { font-weight: 700; }' +
    '.rpt-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }' +
    '.rpt-card { border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px; }' +
    '.rpt-card-label { font-size: 10px; font-weight: 600; text-transform: uppercase; color: #9CA3AF; }' +
    '.rpt-card-value { font-size: 20px; font-weight: 800; color: #1E3A8A; }' +
    '.rpt-card-icon, .rpt-chart-wrap, .rpt-group-btn, .rpt-export-btn, .rpt-drill-overlay, canvas, .rpt-tabs, .rpt-toolbar, .rpt-asof-panel button { display: none; }' +
    '@media print { body { padding: 0; } }' +
    '</style></head><body>' +
    '<h1><i class="fas fa-chart-bar"></i> BF Ops — ' + _currentTab.charAt(0).toUpperCase() + _currentTab.slice(1) + ' Report</h1>' +
    '<div class="period">' + _dateFrom + ' to ' + _dateTo + ' • Generated ' + new Date().toLocaleString() + '</div>' +
    content.innerHTML +
    '</body></html>');
  win.document.close();
  setTimeout(function() { win.print(); }, 500);
};

// ==================== EXPORT: EXCEL (CSV) ====================
window._rptExportExcel = function(type) {
  type = type || _currentTab;
  // Map tab names to export types
  var typeMap = { financial: 'orders', sales: 'orders', products: 'products', purchasing: 'bills', delivery: 'orders', returns: 'returns', customers: 'customers', inventory: 'inventory', fleet: 'orders', warehouse: 'orders' };
  var exportType = typeMap[type] || type;

  var q = 'type=' + exportType + '&from=' + _dateFrom + '&to=' + _dateTo;
  if (type === 'inventory' || exportType === 'inventory') {
    var asOfDate = document.getElementById('rptAsOfDate')?.value;
    if (asOfDate) q = 'type=inventory_snapshot&date=' + asOfDate;
  }

  API.get('/reports/export?' + q).then(function(r) {
    var data = r.data.data;
    if (!data || data.length === 0) { alert('No data to export'); return; }

    // Build CSV
    var headers = Object.keys(data[0]);
    var csv = headers.join(',') + '\n';
    data.forEach(function(row) {
      csv += headers.map(function(h) {
        var val = row[h];
        if (val === null || val === undefined) return '';
        val = String(val);
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          val = '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
      }).join(',') + '\n';
    });

    // Download
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'bf-ops-' + exportType + '-' + _dateFrom + '-to-' + _dateTo + '.csv';
    link.click();
  }).catch(function(err) {
    alert('Export failed: ' + (err.response?.data?.error || err.message));
  });
};

})();
