// BF Ops - Purchasing Module
// Purchase orders, receiving, bills, suppliers

var poAPI = axios.create({ baseURL: '' });
var poUser = null;
var poPage = 'dashboard';
var poLocations = [];
var poSuppliers = [];
var poSelectedLocation = null;
var poDashboard = {};
var poOrders = [];
var poCurrentOrder = null;
var poBills = [];
var poRequests = [];
var poRequestSummary = {};

// Permission helpers
function poCanEdit(feature) {
  var fn = typeof window.canEdit === 'function' ? window.canEdit : function() { return true; };
  return fn('ordering', feature || poPage);
}

// ==================== AUTH BRIDGE ====================
function poGetToken() {
  return localStorage.getItem('bf_ops_token') || localStorage.getItem('bf_token') || '';
}
function poHeaders() {
  return { Authorization: 'Bearer ' + poGetToken() };
}

// ==================== INIT ====================
window._purchasingInit = function() {
  console.log('[Purchasing] init called');
  var savedUser = localStorage.getItem('bf_ops_user') || localStorage.getItem('bf_user');
  if (savedUser) {
    try { poUser = JSON.parse(savedUser); } catch(e) { poUser = null; }
  }
  poPage = 'dashboard';
  // Consume initial page from parent shell
  if (window._shellInitialPage) {
    var _ca = typeof window.canAccess === 'function' ? window.canAccess : function() { return true; };
    if (_ca('ordering', window._shellInitialPage)) poPage = window._shellInitialPage;
    window._shellInitialPage = null;
  }
  Promise.all([poLoadLocations(), poLoadSuppliers()]).then(function() {
    console.log('[Purchasing] locations:', poLocations.length, 'suppliers:', poSuppliers.length);
    poRender();
  }).catch(function(e) {
    console.error('[Purchasing] init failed:', e);
    var root = document.getElementById('purchasing-app');
    if (root) root.innerHTML = '<div style="padding:24px;color:#DC2626"><i class="fas fa-exclamation-triangle"></i> Purchasing failed to load. Please refresh.</div>';
  });
};

window._purchasingCleanup = function() {
  poUser = null;
  poPage = 'dashboard';
  poOrders = [];
  poDashboard = {};
};

// ==================== DATA LOADING ====================
async function poLoadLocations() {
  try {
    var resp = await poAPI.get('/api/locations', { headers: poHeaders() });
    poLocations = resp.data.locations || [];
  } catch(e) { poLocations = []; }
}

async function poLoadSuppliers() {
  try {
    var resp = await poAPI.get('/api/purchasing/suppliers?active=1', { headers: poHeaders() });
    poSuppliers = resp.data.suppliers || [];
  } catch(e) { poSuppliers = []; }
}

// ==================== TOAST ====================
function poToast(msg, type) {
  type = type || 'success';
  var t = document.createElement('div');
  t.className = 'po-toast po-toast-' + type;
  t.innerHTML = '<i class="fas fa-' + (type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'check-circle') + '"></i> ' + msg;
  document.body.appendChild(t);
  setTimeout(function() { t.classList.add('po-toast-show'); }, 10);
  setTimeout(function() { t.classList.remove('po-toast-show'); setTimeout(function() { t.remove(); }, 300); }, 3000);
}

// ==================== NAVIGATION ====================
function poNav(page, data) {
  poPage = page;
  poCurrentOrder = data || null;
  poRender();
}

// ==================== MAIN RENDER ====================
async function poRender() {
  var root = document.getElementById('purchasing-app');
  if (!root) { console.warn('[Purchasing] #purchasing-app not found'); return; }

  // Set view-only mode class based on permissions
  var _ce = typeof window.canEdit === 'function' ? window.canEdit : function() { return true; };
  var _editMode = _ce('ordering', poPage);
  root.classList.toggle('po-view-only', !_editMode);

  root.innerHTML = '<div class="po-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

  try {
    if (poPage === 'dashboard') {
      var results = await Promise.all([
        poAPI.get('/api/purchasing/dashboard', { headers: poHeaders() }),
        poAPI.get('/api/purchasing/requests/summary', { headers: poHeaders() })
      ]);
      poDashboard = results[0].data;
      poRequestSummary = results[1].data;
      root = document.getElementById('purchasing-app'); if (!root) return;
      root.innerHTML = poRenderNav() + poRenderDashboard();
    } else if (poPage === 'orders') {
      await poLoadOrders();
      root = document.getElementById('purchasing-app'); if (!root) return;
      root.innerHTML = poRenderNav() + poRenderOrderList();
    } else if (poPage === 'create') {
      root = document.getElementById('purchasing-app'); if (!root) return;
      root.innerHTML = poRenderNav() + poRenderCreateOrder();
    } else if (poPage === 'detail') {
      var resp = await poAPI.get('/api/purchasing/orders/' + poCurrentOrder, { headers: poHeaders() });
      root = document.getElementById('purchasing-app'); if (!root) return;
      root.innerHTML = poRenderNav() + poRenderOrderDetail(resp.data);
    } else if (poPage === 'receive') {
      var resp = await poAPI.get('/api/purchasing/orders/' + poCurrentOrder, { headers: poHeaders() });
      root = document.getElementById('purchasing-app'); if (!root) return;
      root.innerHTML = poRenderNav() + poRenderReceiving(resp.data);
    } else if (poPage === 'arriving') {
      var locQ = poSelectedLocation ? '&location_id=' + poSelectedLocation : '';
      var resp = await poAPI.get('/api/purchasing/arriving?days=30' + locQ, { headers: poHeaders() });
      root = document.getElementById('purchasing-app'); if (!root) return;
      root.innerHTML = poRenderNav() + poRenderArriving(resp.data.arriving || []);
    } else if (poPage === 'bills') {
      var resp = await poAPI.get('/api/purchasing/bills', { headers: poHeaders() });
      poBills = resp.data.bills || [];
      root = document.getElementById('purchasing-app'); if (!root) return;
      root.innerHTML = poRenderNav() + poRenderBills();
    } else if (poPage === 'suppliers') {
      await poLoadSuppliers();
      root = document.getElementById('purchasing-app'); if (!root) return;
      root.innerHTML = poRenderNav() + poRenderSuppliers();
    } else if (poPage === 'requests') {
      await poLoadRequests();
      root = document.getElementById('purchasing-app'); if (!root) return;
      root.innerHTML = poRenderNav() + poRenderRequests();
    } else if (poPage === 'request_detail') {
      var resp = await poAPI.get('/api/purchasing/requests/' + poCurrentOrder, { headers: poHeaders() });
      root = document.getElementById('purchasing-app'); if (!root) return;
      root.innerHTML = poRenderNav() + poRenderRequestDetail(resp.data);
    }
  } catch(err) {
    console.error('[Purchasing] render error:', err);
    var r = document.getElementById('purchasing-app');
    if (r) r.innerHTML = poRenderNav() + '<div style="padding:24px;color:#DC2626"><i class="fas fa-exclamation-triangle"></i> Error: ' + (err.message || err) + '</div>';
  }
}

async function poLoadOrders() {
  var url = '/api/purchasing/orders?';
  var statusFilter = document.getElementById('poStatusFilter');
  var typeFilter = document.getElementById('poTypeFilter');
  if (statusFilter && statusFilter.value) url += 'status=' + statusFilter.value + '&';
  if (typeFilter && typeFilter.value) url += 'type=' + typeFilter.value + '&';
  if (poSelectedLocation) url += 'location_id=' + poSelectedLocation + '&';
  var resp = await poAPI.get(url, { headers: poHeaders() });
  poOrders = resp.data.orders || [];
}

// ==================== NAV BAR ====================
function poRenderNav() {
  var pages = [
    { id: 'dashboard', icon: 'fa-chart-line', label: 'Dashboard' },
    { id: 'orders', icon: 'fa-file-invoice', label: 'Orders' },
    { id: 'requests', icon: 'fa-hand', label: 'Requests' },
    { id: 'arriving', icon: 'fa-truck-moving', label: 'Arriving' },
    { id: 'bills', icon: 'fa-file-invoice-dollar', label: 'Bills' },
    { id: 'suppliers', icon: 'fa-building', label: 'Suppliers' }
  ];
  // Filter by role permissions
  var _ca = typeof window.canAccess === 'function' ? window.canAccess : function() { return true; };
  pages = pages.filter(function(p) { return _ca('ordering', p.id); });

  var locOpts = '<option value="">All Locations</option>';
  poLocations.forEach(function(l) {
    locOpts += '<option value="' + l.id + '"' + (poSelectedLocation == l.id ? ' selected' : '') + '>' + l.code + ' \u2014 ' + l.name + '</option>';
  });

  return '<div class="po-nav">' +
    '<div class="po-nav-scroll">' +
    pages.map(function(p) {
      return '<button class="po-nav-btn' + (poPage === p.id ? ' active' : '') + '" onclick="poNav(\'' + p.id + '\')">' +
        '<i class="fas ' + p.icon + '"></i><span>' + p.label + '</span></button>';
    }).join('') +
    '</div>' +
    '<div class="po-loc-picker">' +
    '<i class="fas fa-location-dot"></i>' +
    '<select onchange="poSelectedLocation=this.value||null;poRender()">' + locOpts + '</select>' +
    '</div>' +
    '</div>' +
    (!(typeof window.canEdit === 'function' ? window.canEdit : function(){return true;})('ordering', poPage) ? '<div style="background:#FEF3C7;color:#92400E;padding:6px 16px;font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;border-bottom:1px solid #FDE68A"><i class="fas fa-eye"></i> View Only</div>' : '');
}

// ==================== DASHBOARD ====================
function poRenderDashboard() {
  var d = poDashboard;
  var statusCounts = d.status_counts || [];
  var arrivingSoon = d.arriving_soon || [];
  var activePOs = d.active_pos || [];
  var recentReceivings = d.recent_receivings || [];

  // Aggregate status counts
  var totals = {};
  statusCounts.forEach(function(r) {
    totals[r.status] = (totals[r.status] || 0) + r.cnt;
  });

  var cards = [
    { icon: 'fa-file-invoice', label: 'Active Orders', value: (totals.ordered || 0) + (totals.in_transit || 0) + (totals.delayed || 0) + (totals.partial || 0), color: '#D97706', click: "poNav('orders')" },
    { icon: 'fa-truck-moving', label: 'In Transit', value: totals.in_transit || 0, color: '#2563EB', click: "document.getElementById('poStatusFilter')||poNav('orders')" },
    { icon: 'fa-clock', label: 'Arriving Soon', value: arrivingSoon.length, color: '#059669', click: "poNav('arriving')" },
    { icon: 'fa-exclamation-triangle', label: 'Overdue', value: d.overdue_count || 0, color: d.overdue_count > 0 ? '#DC2626' : '#6B7280' },
    { icon: 'fa-check-double', label: 'Received', value: totals.received || 0, color: '#059669' },
    { icon: 'fa-triangle-exclamation', label: 'Delayed', value: totals.delayed || 0, color: totals.delayed > 0 ? '#DC2626' : '#6B7280' },
    { icon: 'fa-hand', label: 'Pending Requests', value: poRequestSummary.pending_requests ? poRequestSummary.pending_requests.length : 0, color: (poRequestSummary.pending_requests && poRequestSummary.pending_requests.length > 0) ? '#E11D48' : '#6B7280', click: "poNav('requests')" },
    { icon: 'fa-file-invoice-dollar', label: 'Pending Bills', value: d.pending_bills ? d.pending_bills.count : 0, color: '#7C3AED', click: "poNav('bills')" },
    { icon: 'fa-dollar-sign', label: 'Bills Total', value: '$' + ((d.pending_bills ? d.pending_bills.total : 0) || 0).toLocaleString(undefined, {minimumFractionDigits:2}), color: '#7C3AED' },
    { icon: 'fa-truck-loading', label: 'Pending Freight', value: d.pending_freight ? d.pending_freight.count : 0, color: (d.pending_freight && d.pending_freight.count > 0) ? '#0369A1' : '#6B7280' }
  ];

  var html = '<div class="po-dashboard">';

  // Quick actions
  html += '<div class="po-quick-actions">';
  html += '<button class="po-action-btn po-action-hs" onclick="poNav(\'create\')"><i class="fas fa-plus-circle"></i> New Purchase Order</button>';
  html += '<button class="po-action-btn po-action-arriving" onclick="poNav(\'arriving\')"><i class="fas fa-truck-moving"></i> What\'s Arriving</button>';
  html += '<button class="po-action-btn po-action-suppliers" onclick="poNav(\'suppliers\')"><i class="fas fa-building"></i> Manage Suppliers</button>';
  html += '</div>';

  // Stat cards
  html += '<div class="po-cards-grid">';
  cards.forEach(function(card) {
    html += '<div class="po-stat-card" ' + (card.click ? 'onclick="' + card.click + '"' : '') + '>' +
      '<div class="po-stat-icon" style="background:' + card.color + '20;color:' + card.color + '"><i class="fas ' + card.icon + '"></i></div>' +
      '<div class="po-stat-info"><div class="po-stat-value">' + card.value + '</div><div class="po-stat-label">' + card.label + '</div></div>' +
      '</div>';
  });
  html += '</div>';

  // Arriving Soon section
  if (arrivingSoon.length > 0) {
    html += '<div class="po-section">';
    html += '<div class="po-section-header"><h3><i class="fas fa-truck-moving"></i> Arriving Soon (7 days)</h3>';
    html += '<button class="po-btn po-btn-sm po-btn-outline" onclick="poNav(\'arriving\')">View All <i class="fas fa-arrow-right"></i></button></div>';
    html += '<div class="po-arriving-cards">';
    arrivingSoon.forEach(function(po) {
      var daysOut = po.expected_date ? Math.ceil((new Date(po.expected_date) - new Date()) / 86400000) : '?';
      var urgency = daysOut <= 1 ? 'po-urgent' : daysOut <= 3 ? 'po-soon' : '';
      html += '<div class="po-arriving-card ' + urgency + '" onclick="poNav(\'detail\',' + po.id + ')">' +
        '<div class="po-arriving-card-top">' +
        '<span class="po-type-badge po-type-' + po.order_type + '">' + poTypeLabel(po.order_type) + '</span>' +
        '<span class="po-arriving-days">' + (daysOut <= 0 ? 'TODAY' : daysOut + 'd') + '</span>' +
        '</div>' +
        '<div class="po-arriving-card-info">' +
        '<strong>' + poEsc(po.po_number) + '</strong>' +
        '<span class="po-muted">' + poEsc(po.supplier_name || 'No supplier') + '</span>' +
        '<span class="po-muted"><i class="fas fa-location-dot"></i> ' + poEsc(po.location_code) + '</span>' +
        '</div>' +
        '<div class="po-arriving-card-bottom">' +
        '<span>' + po.item_count + ' item' + (po.item_count !== 1 ? 's' : '') + '</span>' +
        '<span class="po-status-badge po-status-' + po.status + '">' + poStatusLabel(po.status) + '</span>' +
        '</div>' +
        '</div>';
    });
    html += '</div></div>';
  }

  // Pending Requests section
  var pendingReqs = poRequestSummary.pending_requests || [];
  if (pendingReqs.length > 0) {
    html += '<div class="po-section">';
    html += '<div class="po-section-header"><h3><i class="fas fa-hand" style="color:#E11D48"></i> Pending Order Requests</h3>';
    html += '<button class="po-btn po-btn-sm po-btn-outline" onclick="poNav(\'requests\')">View All <i class="fas fa-arrow-right"></i></button></div>';
    html += '<div class="po-table-wrap"><table class="po-table"><thead><tr><th>Request #</th><th>Urgency</th><th>Type</th><th>Location</th><th>Items</th><th>Requested By</th><th>Date</th></tr></thead><tbody>';
    pendingReqs.forEach(function(r) {
      html += '<tr class="po-clickable" onclick="poNav(\'request_detail\',' + r.id + ')">' +
        '<td><strong>' + poEsc(r.request_number) + '</strong></td>' +
        '<td><span class="po-urgency-badge po-urgency-' + r.urgency + '">' + poUrgencyLabel(r.urgency) + '</span></td>' +
        '<td>' + (r.order_type ? '<span class="po-type-badge po-type-' + r.order_type + '">' + poTypeLabel(r.order_type) + '</span>' : '<span class="po-muted">—</span>') + '</td>' +
        '<td><span class="po-loc-badge">' + poEsc(r.location_code) + '</span></td>' +
        '<td>' + (r.item_count || 0) + '</td>' +
        '<td>' + poEsc(r.requested_by_name || '—') + '</td>' +
        '<td>' + poFormatDateTime(r.created_at) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div></div>';
  }

  // Active POs table
  if (activePOs.length > 0) {
    html += '<div class="po-section">';
    html += '<div class="po-section-header"><h3><i class="fas fa-file-invoice"></i> Active Purchase Orders</h3>';
    html += '<button class="po-btn po-btn-sm po-btn-outline" onclick="poNav(\'orders\')">All Orders <i class="fas fa-arrow-right"></i></button></div>';
    html += poRenderOrderTable(activePOs);
    html += '</div>';
  }

  // Recent receivings
  if (recentReceivings.length > 0) {
    html += '<div class="po-section">';
    html += '<h3 class="po-section-title"><i class="fas fa-box-open"></i> Recent Receivings (7 days)</h3>';
    html += '<div class="po-table-wrap"><table class="po-table"><thead><tr><th>PO #</th><th>Type</th><th>Location</th><th>Items</th><th>Received By</th><th>Date</th></tr></thead><tbody>';
    recentReceivings.forEach(function(r) {
      html += '<tr class="po-clickable" onclick="poNav(\'detail\',' + (r.po_id || 0) + ')">' +
        '<td><strong>' + poEsc(r.po_number) + '</strong></td>' +
        '<td><span class="po-type-badge po-type-' + r.order_type + '">' + poTypeLabel(r.order_type) + '</span></td>' +
        '<td><span class="po-loc-badge">' + poEsc(r.location_code) + '</span></td>' +
        '<td>' + r.item_count + '</td>' +
        '<td>' + poEsc(r.received_by_name || '—') + '</td>' +
        '<td>' + poFormatDateTime(r.received_at) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div></div>';
  }

  // Empty state
  if (activePOs.length === 0 && arrivingSoon.length === 0) {
    html += '<div class="po-empty">';
    html += '<i class="fas fa-cart-shopping" style="font-size:48px;color:#CBD5E1"></i>';
    html += '<h3>No Purchase Orders Yet</h3>';
    html += '<p>Create your first purchase order to start tracking.</p>';
    if (poCanEdit('orders')) html += '<button class="po-btn po-btn-primary" onclick="poNav(\'create\')"><i class="fas fa-plus"></i> Create Purchase Order</button>';
    html += '</div>';
  }

  html += '</div>';
  return html;
}

// ==================== ORDER LIST ====================
function poRenderOrderList() {
  var html = '<div class="po-orders-page">';

  // Toolbar
  html += '<div class="po-toolbar">';
  html += '<select id="poStatusFilter" onchange="poLoadAndRenderOrders()" class="po-select">' +
    '<option value="">All Statuses</option>' +
    ['ordered','in_transit','delayed','partial','received','cancelled','claim','draft'].map(function(s) {
      return '<option value="' + s + '">' + poStatusLabel(s) + '</option>';
    }).join('') + '</select>';
  html += '<select id="poTypeFilter" onchange="poLoadAndRenderOrders()" class="po-select">' +
    '<option value="">All Types</option>' +
    '<option value="hay_shavings">Hay & Shavings</option>' +
    '<option value="feed">Feed</option>' +
    '<option value="shelf_goods">Shelf Goods</option>' +
    '</select>';
  if (poCanEdit('orders')) html += '<button class="po-btn po-btn-primary" onclick="poNav(\'create\')"><i class="fas fa-plus"></i> New Order</button>';
  html += '</div>';

  html += '<div class="po-stock-count">' + poOrders.length + ' order' + (poOrders.length !== 1 ? 's' : '') + '</div>';

  if (poOrders.length === 0) {
    html += '<div class="po-empty"><i class="fas fa-file-invoice" style="font-size:48px;color:#CBD5E1"></i>';
    html += '<h3>No Orders Found</h3><p>Try adjusting your filters or create a new order.</p></div>';
  } else {
    html += poRenderOrderTable(poOrders);
    // Mobile cards
    html += '<div class="po-mobile-only po-order-cards">';
    poOrders.forEach(function(po) {
      var pctRecv = po.total_qty_ordered > 0 ? Math.round((po.total_qty_received / po.total_qty_ordered) * 100) : 0;
      html += '<div class="po-order-card" onclick="poNav(\'detail\',' + po.id + ')">' +
        '<div class="po-order-card-top">' +
        '<div><strong>' + poEsc(po.po_number) + '</strong><br><span class="po-muted">' + poEsc(po.supplier_name || 'No supplier') + '</span></div>' +
        '<span class="po-status-badge po-status-' + po.status + '">' + poStatusLabel(po.status) + '</span>' +
        '</div>' +
        '<div class="po-order-card-meta">' +
        '<span class="po-type-badge po-type-' + po.order_type + '">' + poTypeLabel(po.order_type) + '</span>' +
        '<span class="po-loc-badge">' + poEsc(po.location_code) + '</span>' +
        (po.expected_date ? '<span class="po-muted"><i class="fas fa-calendar"></i> ' + poFormatDate(po.expected_date) + '</span>' : '') +
        '</div>' +
        '<div class="po-order-card-nums">' +
        '<div><span class="po-muted">Items</span><strong>' + po.item_count + '</strong></div>' +
        '<div><span class="po-muted">Ordered</span><strong>' + po.total_qty_ordered + '</strong></div>' +
        '<div><span class="po-muted">Received</span><strong>' + po.total_qty_received + '</strong></div>' +
        '<div><span class="po-muted">Progress</span><strong>' + pctRecv + '%</strong></div>' +
        '</div>' +
        (po.total_amount > 0 ? '<div class="po-order-card-total">$' + po.total_amount.toLocaleString(undefined, {minimumFractionDigits:2}) + '</div>' : '') +
        '</div>';
    });
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function poRenderOrderTable(orders) {
  var html = '<div class="po-table-wrap po-desktop-only"><table class="po-table po-table-hover">';
  html += '<thead><tr><th>PO #</th><th>Type</th><th>Supplier</th><th>Location</th><th>Status</th><th>Items</th><th>Received</th><th>Expected</th><th class="text-right">Total</th></tr></thead><tbody>';
  orders.forEach(function(po) {
    var pctRecv = po.total_qty_ordered > 0 ? Math.round((po.total_qty_received / po.total_qty_ordered) * 100) : 0;
    html += '<tr class="po-clickable" onclick="poNav(\'detail\',' + po.id + ')">' +
      '<td><strong>' + poEsc(po.po_number) + '</strong></td>' +
      '<td><span class="po-type-badge po-type-' + po.order_type + '">' + poTypeLabel(po.order_type) + '</span></td>' +
      '<td>' + poEsc(po.supplier_name || '—') + '</td>' +
      '<td><span class="po-loc-badge">' + poEsc(po.location_code) + '</span></td>' +
      '<td><span class="po-status-badge po-status-' + po.status + '">' + poStatusLabel(po.status) + '</span></td>' +
      '<td>' + po.item_count + '</td>' +
      '<td>' +
      '<div class="po-progress-mini">' +
      '<div class="po-progress-bar-mini"><div class="po-progress-fill-mini" style="width:' + pctRecv + '%"></div></div>' +
      '<span>' + po.total_qty_received + '/' + po.total_qty_ordered + '</span></div></td>' +
      '<td>' + poFormatDate(po.expected_date) + '</td>' +
      '<td class="text-right">' + (po.total_amount > 0 ? '$' + po.total_amount.toLocaleString(undefined, {minimumFractionDigits:2}) : '—') + '</td>' +
      '</tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

async function poLoadAndRenderOrders() {
  await poLoadOrders();
  var root = document.getElementById('purchasing-app');
  if (root) root.innerHTML = poRenderNav() + poRenderOrderList();
}

// ==================== CREATE ORDER ====================
var poNewItems = [{ product_id: '', description: '', qty_ordered: '', unit: 'each', unit_cost: '' }];

function poRenderCreateOrder() {
  poNewItems = [{ product_id: '', description: '', qty_ordered: '', unit: 'each', unit_cost: '' }];

  var supplierOpts = '<option value="">— Select Supplier —</option>';
  poSuppliers.forEach(function(s) {
    supplierOpts += '<option value="' + s.id + '">' + poEsc(s.name) + (s.code ? ' (' + poEsc(s.code) + ')' : '') + '</option>';
  });

  var locOpts = '';
  poLocations.forEach(function(l) {
    locOpts += '<option value="' + l.id + '">' + poEsc(l.code) + ' \u2014 ' + poEsc(l.name) + '</option>';
  });

  var html = '<div class="po-create-page">';
  html += '<div class="po-section-header"><h2><i class="fas fa-plus-circle"></i> New Purchase Order</h2>';
  html += '<button class="po-btn po-btn-outline" onclick="poNav(\'orders\')"><i class="fas fa-arrow-left"></i> Back</button></div>';

  html += '<div class="po-create-form">';

  // Row 1: Type & Supplier
  html += '<div class="po-form-row">';
  html += '<div class="po-form-group"><label>Order Type *</label><select id="poNewType" class="po-select">' +
    '<option value="hay_shavings">Hay & Shavings</option>' +
    '<option value="feed">Feed</option>' +
    '<option value="shelf_goods">Shelf Goods</option>' +
    '</select></div>';
  html += '<div class="po-form-group"><label>Supplier</label><select id="poNewSupplier" class="po-select">' + supplierOpts + '</select></div>';
  html += '</div>';

  // Row 2: Location & Dates
  html += '<div class="po-form-row">';
  html += '<div class="po-form-group"><label>Delivery Location *</label><select id="poNewLocation" class="po-select">' + locOpts + '</select></div>';
  html += '<div class="po-form-group"><label>Order Date</label><input id="poNewOrderDate" type="date" class="po-input" value="' + new Date().toISOString().slice(0,10) + '"></div>';
  html += '<div class="po-form-group"><label>Expected Arrival</label><input id="poNewExpectedDate" type="date" class="po-input"></div>';
  html += '</div>';

  // Notes
  html += '<div class="po-form-row">';
  html += '<div class="po-form-group" style="flex:2"><label>Notes</label><textarea id="poNewNotes" class="po-input" rows="2" placeholder="Order notes visible to warehouse..."></textarea></div>';
  html += '<div class="po-form-group"><label>Internal Notes</label><textarea id="poNewInternalNotes" class="po-input" rows="2" placeholder="Internal only..."></textarea></div>';
  html += '</div>';

  // Line items
  html += '<div class="po-items-section">';
  html += '<div class="po-section-header"><h3><i class="fas fa-list"></i> Line Items</h3>';
  html += '<button class="po-btn po-btn-sm po-btn-outline" onclick="poAddNewItem()"><i class="fas fa-plus"></i> Add Item</button></div>';
  html += '<div id="poNewItemsList">' + poRenderNewItems() + '</div>';
  html += '</div>';

  // Submit
  html += '<div class="po-create-actions">';
  html += '<button class="po-btn po-btn-primary po-btn-lg" onclick="poSubmitNewOrder()"><i class="fas fa-paper-plane"></i> Create Purchase Order</button>';
  html += '</div>';

  html += '</div></div>';
  return html;
}

function poRenderNewItems() {
  var html = '';
  poNewItems.forEach(function(item, idx) {
    html += '<div class="po-new-item" data-idx="' + idx + '">';
    html += '<div class="po-new-item-row">';
    html += '<div class="po-form-group" style="flex:2"><label>Description / Product</label>' +
      '<input type="text" class="po-input" placeholder="Search or type description..." value="' + poEsc(item.description) + '" oninput="poSearchItemProduct(this.value,' + idx + ')" id="poItemDesc_' + idx + '">' +
      '<select class="po-select po-item-product-select" id="poItemProduct_' + idx + '" onchange="poSelectItemProduct(' + idx + ')" style="margin-top:4px"><option value="">— or pick from catalog —</option></select></div>';
    html += '<div class="po-form-group" style="flex:0.5"><label>Qty *</label><input type="number" class="po-input" placeholder="0" value="' + (item.qty_ordered || '') + '" id="poItemQty_' + idx + '" inputmode="numeric"></div>';
    html += '<div class="po-form-group" style="flex:0.5"><label>Unit</label><select class="po-select" id="poItemUnit_' + idx + '">' +
      ['each','bag','bale','pallet','ton','load','case','box','roll'].map(function(u) {
        return '<option value="' + u + '"' + (item.unit === u ? ' selected' : '') + '>' + u + '</option>';
      }).join('') + '</select></div>';
    html += '<div class="po-form-group" style="flex:0.5"><label>Unit Cost</label><input type="number" step="0.01" class="po-input" placeholder="0.00" value="' + (item.unit_cost || '') + '" id="poItemCost_' + idx + '"></div>';
    html += '<button class="po-btn po-btn-xs po-btn-danger po-item-remove" onclick="poRemoveNewItem(' + idx + ')" title="Remove"><i class="fas fa-trash"></i></button>';
    html += '</div></div>';
  });
  return html;
}

function poAddNewItem() {
  poNewItems.push({ product_id: '', description: '', qty_ordered: '', unit: 'each', unit_cost: '' });
  poSyncNewItemFields();
  document.getElementById('poNewItemsList').innerHTML = poRenderNewItems();
}

function poRemoveNewItem(idx) {
  if (poNewItems.length <= 1) { poToast('Need at least one item', 'warning'); return; }
  poSyncNewItemFields();
  poNewItems.splice(idx, 1);
  document.getElementById('poNewItemsList').innerHTML = poRenderNewItems();
}

function poSyncNewItemFields() {
  poNewItems.forEach(function(item, idx) {
    var desc = document.getElementById('poItemDesc_' + idx);
    var qty = document.getElementById('poItemQty_' + idx);
    var unit = document.getElementById('poItemUnit_' + idx);
    var cost = document.getElementById('poItemCost_' + idx);
    var prod = document.getElementById('poItemProduct_' + idx);
    if (desc) item.description = desc.value;
    if (qty) item.qty_ordered = qty.value;
    if (unit) item.unit = unit.value;
    if (cost) item.unit_cost = cost.value;
    if (prod && prod.value) item.product_id = prod.value;
  });
}

var poItemSearchTimer = null;
async function poSearchItemProduct(term, idx) {
  clearTimeout(poItemSearchTimer);
  poItemSearchTimer = setTimeout(async function() {
    if (!term || term.length < 2) return;
    try {
      var resp = await poAPI.get('/api/purchasing/products?search=' + encodeURIComponent(term), { headers: poHeaders() });
      var sel = document.getElementById('poItemProduct_' + idx);
      if (!sel) return;
      sel.innerHTML = '<option value="">— or pick from catalog —</option>';
      (resp.data.products || []).forEach(function(p) {
        sel.innerHTML += '<option value="' + p.id + '" data-name="' + poEsc(p.name) + '" data-cost="' + (p.cost || 0) + '" data-price="' + (p.price || 0) + '" data-unit="' + poEsc(p.unit_type || 'each') + '">' +
          poEsc(p.name) + ' (' + poEsc(p.sku || 'no SKU') + ') - Cost: $' + (p.cost || 0).toFixed(2) + ' / Sell: $' + (p.price || 0) + '</option>';
      });
    } catch(e) {}
  }, 300);
}

function poSelectItemProduct(idx) {
  var sel = document.getElementById('poItemProduct_' + idx);
  if (!sel || !sel.value) return;
  var opt = sel.options[sel.selectedIndex];
  var descInput = document.getElementById('poItemDesc_' + idx);
  var costInput = document.getElementById('poItemCost_' + idx);
  var unitInput = document.getElementById('poItemUnit_' + idx);
  if (descInput && opt.dataset.name) descInput.value = opt.dataset.name;
  if (costInput) costInput.value = opt.dataset.cost || opt.dataset.price || '';
  if (unitInput && opt.dataset.unit) unitInput.value = opt.dataset.unit;
  poNewItems[idx].product_id = sel.value;
}

async function poSubmitNewOrder() {
  poSyncNewItemFields();

  var type = document.getElementById('poNewType').value;
  var supplier_id = document.getElementById('poNewSupplier').value || null;
  var location_id = document.getElementById('poNewLocation').value;
  var order_date = document.getElementById('poNewOrderDate').value;
  var expected_date = document.getElementById('poNewExpectedDate').value;
  var notes = document.getElementById('poNewNotes').value;
  var internal_notes = document.getElementById('poNewInternalNotes').value;

  if (!location_id) { poToast('Select a delivery location', 'warning'); return; }

  var items = poNewItems.filter(function(i) { return i.description || i.product_id; }).map(function(i) {
    return {
      product_id: i.product_id ? parseInt(i.product_id) : null,
      description: i.description,
      qty_ordered: parseFloat(i.qty_ordered) || 0,
      unit: i.unit || 'each',
      unit_cost: parseFloat(i.unit_cost) || 0
    };
  });

  if (items.length === 0) { poToast('Add at least one item', 'warning'); return; }

  try {
    var resp = await poAPI.post('/api/purchasing/orders', {
      order_type: type,
      supplier_id: supplier_id ? parseInt(supplier_id) : null,
      location_id: parseInt(location_id),
      order_date: order_date,
      expected_date: expected_date || null,
      notes: notes,
      internal_notes: internal_notes,
      items: items
    }, { headers: poHeaders() });

    poToast('Purchase Order ' + resp.data.po_number + ' created!');
    poNav('detail', resp.data.id);
  } catch(e) {
    poToast('Failed: ' + (e.response?.data?.error || e.message), 'error');
  }
}

// ==================== ORDER DETAIL ====================
function poRenderOrderDetail(data) {
  var po = data.order;
  var items = data.items || [];
  var receivings = data.receivings || [];
  var images = data.images || [];
  var bills = data.bills || [];
  var freightCharges = data.freight_charges || [];

  var pctRecv = 0;
  var totalOrdered = items.reduce(function(s, i) { return s + (i.qty_ordered || 0); }, 0);
  var totalReceived = items.reduce(function(s, i) { return s + (i.qty_received || 0); }, 0);
  if (totalOrdered > 0) pctRecv = Math.round((totalReceived / totalOrdered) * 100);

  var html = '<div class="po-detail-page">';

  // Header
  html += '<div class="po-detail-header">';
  html += '<div class="po-detail-header-left">';
  html += '<button class="po-btn po-btn-outline po-btn-sm" onclick="poNav(\'orders\')"><i class="fas fa-arrow-left"></i> Back</button>';
  html += '<h2>' + poEsc(po.po_number) + '</h2>';
  html += '<span class="po-type-badge po-type-' + po.order_type + '">' + poTypeLabel(po.order_type) + '</span>';
  html += '<span class="po-status-badge po-status-' + po.status + '">' + poStatusLabel(po.status) + '</span>';
  html += '</div>';
  html += '<div class="po-detail-header-actions">';
  if (['ordered','in_transit','delayed','partial'].includes(po.status)) {
    html += '<button class="po-btn po-btn-primary" onclick="poNav(\'receive\',' + po.id + ')"><i class="fas fa-box-open"></i> Receive Items</button>';
  }
  html += '<button class="po-btn po-btn-outline po-btn-sm" onclick="poShowStatusChange(' + po.id + ',\'' + po.status + '\')"><i class="fas fa-exchange-alt"></i> Status</button>';
  html += '<button class="po-btn po-btn-outline po-btn-sm" onclick="poShowCreateBill(' + po.id + ')"><i class="fas fa-file-invoice-dollar"></i> Create Bill</button>';
  html += '<button class="po-btn po-btn-outline po-btn-sm" onclick="poShowCreateFreight(' + po.id + ')"><i class="fas fa-truck-loading"></i> Add Freight</button>';
  html += '<button class="po-btn po-btn-outline po-btn-sm" onclick="poShowUploadImage(' + po.id + ')"><i class="fas fa-camera"></i> Photo</button>';
  html += '</div></div>';

  // Info grid
  html += '<div class="po-detail-grid">';
  html += '<div class="po-detail-info-card">';
  html += '<div class="po-detail-row"><span>Supplier</span><strong>' + poEsc(po.supplier_name || 'Not set') + '</strong></div>';
  html += '<div class="po-detail-row"><span>Location</span><strong><span class="po-loc-badge">' + poEsc(po.location_code) + '</span> ' + poEsc(po.location_name) + '</strong></div>';
  html += '<div class="po-detail-row"><span>Order Date</span><strong>' + poFormatDate(po.order_date) + '</strong></div>';
  html += '<div class="po-detail-row"><span>Expected</span><strong>' + poFormatDate(po.expected_date) + '</strong></div>';
  html += '<div class="po-detail-row"><span>Received</span><strong>' + poFormatDate(po.received_date) + '</strong></div>';
  html += '<div class="po-detail-row"><span>Created By</span><strong>' + poEsc(po.created_by_name || '—') + '</strong></div>';
  if (po.notes) html += '<div class="po-detail-row"><span>Notes</span><strong>' + poEsc(po.notes) + '</strong></div>';
  if (po.internal_notes) html += '<div class="po-detail-row"><span>Internal</span><strong>' + poEsc(po.internal_notes) + '</strong></div>';
  html += '</div>';

  // Progress card
  html += '<div class="po-detail-progress-card">';
  html += '<h4>Receiving Progress</h4>';
  html += '<div class="po-progress-ring-wrap">';
  html += '<div class="po-progress-big-num">' + pctRecv + '<span>%</span></div>';
  html += '<div class="po-progress-bar"><div class="po-progress-fill" style="width:' + pctRecv + '%;background:' + (pctRecv >= 100 ? '#059669' : '#D97706') + '"></div></div>';
  html += '</div>';
  html += '<div class="po-progress-stats">';
  html += '<div><span class="po-muted">Ordered</span><strong>' + totalOrdered + '</strong></div>';
  html += '<div><span class="po-muted">Received</span><strong>' + totalReceived + '</strong></div>';
  html += '<div><span class="po-muted">Remaining</span><strong>' + (totalOrdered - totalReceived) + '</strong></div>';
  html += '</div>';
  if (po.total_amount > 0) {
    html += '<div class="po-detail-total">Total: $' + po.total_amount.toLocaleString(undefined, {minimumFractionDigits:2}) + '</div>';
  }
  html += '</div>';
  html += '</div>';

  // Line items table
  html += '<div class="po-section">';
  html += '<h3 class="po-section-title"><i class="fas fa-list"></i> Line Items</h3>';
  html += '<div class="po-table-wrap"><table class="po-table"><thead><tr><th>Item</th><th>Product</th><th class="text-right">Ordered</th><th class="text-right">Received</th><th>Unit</th><th class="text-right">Cost</th><th class="text-right">Line Total</th><th>Status</th></tr></thead><tbody>';
  items.forEach(function(item) {
    var remaining = (item.qty_ordered || 0) - (item.qty_received || 0);
    var rowClass = remaining <= 0 ? 'po-row-done' : '';
    html += '<tr class="' + rowClass + '">' +
      '<td>' + poEsc(item.description || '—') + '</td>' +
      '<td>' + poEsc(item.product_name || '—') + (item.sku ? '<br><span class="po-muted">' + poEsc(item.sku) + '</span>' : '') + '</td>' +
      '<td class="text-right"><strong>' + (item.qty_ordered || 0) + '</strong></td>' +
      '<td class="text-right"><strong class="' + (item.qty_received >= item.qty_ordered ? 'po-positive' : '') + '">' + (item.qty_received || 0) + '</strong></td>' +
      '<td>' + poEsc(item.unit || 'each') + '</td>' +
      '<td class="text-right">$' + (item.unit_cost || 0).toFixed(2) + '</td>' +
      '<td class="text-right">$' + ((item.qty_ordered || 0) * (item.unit_cost || 0)).toFixed(2) + '</td>' +
      '<td>' + (remaining <= 0 ? '<span class="po-status-badge po-status-received"><i class="fas fa-check"></i></span>' : '<span class="po-muted">' + remaining + ' left</span>') + '</td>' +
      '</tr>';
  });
  html += '</tbody></table></div></div>';

  // Receiving history
  if (receivings.length > 0) {
    html += '<div class="po-section">';
    html += '<h3 class="po-section-title"><i class="fas fa-box-open"></i> Receiving History</h3>';
    html += '<div class="po-receivings-list">';
    receivings.forEach(function(r) {
      html += '<div class="po-receiving-card">' +
        '<div class="po-receiving-card-header">' +
        '<div><strong>Receiving #' + r.id + '</strong><span class="po-muted"> \u2014 ' + poFormatDateTime(r.received_at) + '</span></div>' +
        '<div><span class="po-muted">By:</span> ' + poEsc(r.received_by_name || '—') + ' | ' + r.item_count + ' item(s)' +
        (r.image_count > 0 ? ' | <i class="fas fa-camera"></i> ' + r.image_count + ' photo(s)' : '') + '</div>' +
        '</div>' +
        (r.notes ? '<div class="po-receiving-notes">' + poEsc(r.notes) + '</div>' : '') +
        '</div>';
    });
    html += '</div></div>';
  }

  // Images
  if (images.length > 0) {
    html += '<div class="po-section">';
    html += '<h3 class="po-section-title"><i class="fas fa-images"></i> Photos (' + images.length + ')</h3>';
    html += '<div class="po-images-grid">';
    images.forEach(function(img) {
      html += '<div class="po-image-thumb" onclick="poViewImage(' + img.id + ')">' +
        '<i class="fas fa-image"></i>' +
        '<span class="po-muted">' + poEsc(img.caption || 'Photo') + '</span>' +
        '<span class="po-muted">' + poFormatDateTime(img.created_at) + '</span>' +
        '</div>';
    });
    html += '</div></div>';
  }

  // Bills
  html += '<div class="po-section">';
  html += '<div class="po-section-header">';
  html += '<h3 class="po-section-title" style="margin:0"><i class="fas fa-file-invoice-dollar"></i> Bills / Supplier Invoices</h3>';
  html += '<button class="po-btn po-btn-sm po-btn-outline" onclick="poShowCreateBill(' + po.id + ')"><i class="fas fa-plus"></i> Create Bill</button>';
  html += '</div>';
  if (bills.length === 0) {
    html += '<div style="padding:24px;text-align:center;color:#94A3B8"><i class="fas fa-file-invoice-dollar" style="font-size:32px;margin-bottom:8px;display:block"></i>No bills yet. Create a bill to record the supplier\'s invoice costs.</div>';
  } else {
    html += '<div class="po-table-wrap"><table class="po-table po-table-hover"><thead><tr><th>Bill #</th><th>Invoice #</th><th class="text-right">Subtotal</th><th class="text-right">Tax</th><th class="text-right">Total</th><th>Status</th><th>Due</th><th></th></tr></thead><tbody>';
    bills.forEach(function(b) {
      html += '<tr class="po-clickable" onclick="poShowBillDetail(' + b.id + ')">' +
        '<td><strong>' + poEsc(b.bill_number) + '</strong></td>' +
        '<td>' + poEsc(b.supplier_invoice_number || '—') + '</td>' +
        '<td class="text-right">$' + (b.amount || 0).toFixed(2) + '</td>' +
        '<td class="text-right">$' + (b.tax || 0).toFixed(2) + '</td>' +
        '<td class="text-right"><strong>$' + ((b.amount || 0) + (b.tax || 0)).toFixed(2) + '</strong></td>' +
        '<td><span class="po-bill-status po-bill-' + b.status + '">' + poBillStatusLabel(b.status) + '</span></td>' +
        '<td>' + poFormatDate(b.due_date) + '</td>' +
        '<td onclick="event.stopPropagation()">' +
        (b.status === 'pending' ? '<button class="po-btn po-btn-xs po-btn-success" onclick="poApproveBill(' + b.id + ')" title="Approve & update costs"><i class="fas fa-check"></i></button>' : '') +
        (b.status === 'approved' ? '<button class="po-btn po-btn-xs po-btn-success" onclick="poMarkBillPaid(' + b.id + ')" title="Mark paid"><i class="fas fa-dollar-sign"></i></button>' : '') +
        '</td></tr>';
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';

  // Freight Charges
  html += '<div class="po-section">';
  html += '<div class="po-section-header">';
  html += '<h3 class="po-section-title" style="margin:0"><i class="fas fa-truck-loading"></i> Freight Charges</h3>';
  html += '<button class="po-btn po-btn-sm po-btn-outline" onclick="poShowCreateFreight(' + po.id + ')"><i class="fas fa-plus"></i> Add Freight</button>';
  html += '</div>';
  if (freightCharges.length === 0) {
    html += '<div style="padding:24px;text-align:center;color:#94A3B8"><i class="fas fa-truck-loading" style="font-size:32px;margin-bottom:8px;display:block"></i>No freight charges. Add a freight charge to track shipping costs and calculate landed cost.</div>';
  } else {
    var totalFreight = freightCharges.reduce(function(s, f) { return s + (f.amount || 0) + (f.tax || 0); }, 0);
    html += '<div class="po-freight-summary" style="padding:8px 16px;background:#F0F9FF;border-radius:8px;margin-bottom:12px;display:flex;gap:16px;align-items:center;flex-wrap:wrap">';
    html += '<span style="color:#0369A1;font-weight:600"><i class="fas fa-truck-loading"></i> Total Freight: $' + totalFreight.toFixed(2) + '</span>';
    var pendingF = freightCharges.filter(function(f) { return f.status === 'pending'; }).length;
    var approvedF = freightCharges.filter(function(f) { return f.status === 'approved'; }).length;
    if (pendingF > 0) html += '<span class="po-bill-status po-bill-pending">' + pendingF + ' Pending</span>';
    if (approvedF > 0) html += '<span class="po-bill-status po-bill-approved">' + approvedF + ' Approved</span>';
    html += '<button class="po-btn po-btn-xs po-btn-outline" onclick="poShowLandedCost(' + po.id + ')" style="margin-left:auto"><i class="fas fa-calculator"></i> View Landed Cost</button>';
    html += '</div>';
    html += '<div class="po-table-wrap"><table class="po-table po-table-hover"><thead><tr><th>Vendor / Carrier</th><th>Invoice #</th><th class="text-right">Amount</th><th class="text-right">Tax</th><th class="text-right">Total</th><th>Method</th><th>Status</th><th></th></tr></thead><tbody>';
    freightCharges.forEach(function(f) {
      var vendorLabel = f.carrier_name || f.vendor_name || f.supplier_name_resolved || 'Unknown';
      if (f.is_third_party) vendorLabel += ' <span class="po-muted" style="font-size:11px">(3rd party)</span>';
      html += '<tr class="po-clickable" onclick="poShowFreightDetail(' + f.id + ')">' +
        '<td><strong>' + vendorLabel + '</strong></td>' +
        '<td>' + poEsc(f.invoice_number || '—') + '</td>' +
        '<td class="text-right">$' + (f.amount || 0).toFixed(2) + '</td>' +
        '<td class="text-right">$' + (f.tax || 0).toFixed(2) + '</td>' +
        '<td class="text-right"><strong>$' + ((f.amount || 0) + (f.tax || 0)).toFixed(2) + '</strong></td>' +
        '<td><span class="po-muted" style="font-size:12px">' + poFreightMethodLabel(f.allocation_method) + '</span></td>' +
        '<td><span class="po-bill-status po-bill-' + f.status + '">' + poBillStatusLabel(f.status) + '</span></td>' +
        '<td onclick="event.stopPropagation()">' +
        (f.status === 'pending' ? '<button class="po-btn po-btn-xs po-btn-success" onclick="poApproveFreight(' + f.id + ')" title="Approve & allocate"><i class="fas fa-check"></i></button>' +
          '<button class="po-btn po-btn-xs po-btn-danger" onclick="poDeleteFreight(' + f.id + ')" title="Delete"><i class="fas fa-trash"></i></button>' : '') +
        (f.status === 'approved' ? '<button class="po-btn po-btn-xs po-btn-success" onclick="poMarkFreightPaid(' + f.id + ')" title="Mark paid"><i class="fas fa-dollar-sign"></i></button>' : '') +
        '</td></tr>';
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';

  html += '</div>';
  return html;
}

// ==================== RECEIVING WORKFLOW ====================
function poRenderReceiving(data) {
  var po = data.order;
  var items = data.items || [];

  var html = '<div class="po-receive-page">';
  html += '<div class="po-receive-header">';
  html += '<button class="po-btn po-btn-outline po-btn-sm" onclick="poNav(\'detail\',' + po.id + ')"><i class="fas fa-arrow-left"></i> Back to Order</button>';
  html += '<h2><i class="fas fa-box-open"></i> Receive Items \u2014 ' + poEsc(po.po_number) + '</h2>';
  html += '<span class="po-type-badge po-type-' + po.order_type + '">' + poTypeLabel(po.order_type) + '</span>';
  html += '</div>';

  html += '<div class="po-receive-info">';
  html += '<span><i class="fas fa-building"></i> ' + poEsc(po.supplier_name || 'No supplier') + '</span>';
  html += '<span><i class="fas fa-location-dot"></i> ' + poEsc(po.location_name) + '</span>';
  html += '</div>';

  // Items to receive
  html += '<div class="po-receive-items">';
  items.forEach(function(item, idx) {
    var remaining = (item.qty_ordered || 0) - (item.qty_received || 0);
    var done = remaining <= 0;
    html += '<div class="po-receive-item' + (done ? ' po-receive-item-done' : '') + '">' +
      '<div class="po-receive-item-info">' +
      '<strong>' + poEsc(item.description || item.product_name || 'Item') + '</strong>' +
      '<span class="po-muted">' + (item.product_name && item.description !== item.product_name ? poEsc(item.product_name) + ' \u00B7 ' : '') + poEsc(item.sku || '') + '</span>' +
      '<div class="po-receive-item-meta">' +
      '<span>Ordered: <strong>' + item.qty_ordered + '</strong></span>' +
      '<span>Already Received: <strong>' + item.qty_received + '</strong></span>' +
      '<span>Remaining: <strong class="' + (remaining > 0 ? 'po-warning-text' : 'po-positive') + '">' + remaining + '</strong></span>' +
      '</div></div>' +
      '<div class="po-receive-item-input">' +
      (done ? '<div class="po-receive-done-badge"><i class="fas fa-check-circle"></i> Complete</div>' :
      '<div class="po-receive-qty-wrap">' +
      '<label>Qty Received</label>' +
      '<div class="po-stepper">' +
      '<button class="po-stepper-btn" onclick="poStepRecv(' + idx + ',-1)">\u2212</button>' +
      '<input type="number" id="poRecvQty_' + idx + '" class="po-recv-field" value="' + remaining + '" data-item-id="' + item.id + '" data-product-id="' + (item.product_id || '') + '" inputmode="numeric">' +
      '<button class="po-stepper-btn" onclick="poStepRecv(' + idx + ',1)">+</button>' +
      '</div>' +
      '<select id="poRecvCond_' + idx + '" class="po-select po-select-sm">' +
      '<option value="good">Good</option><option value="damaged">Damaged</option><option value="short">Short</option><option value="rejected">Rejected</option>' +
      '</select>' +
      '<input type="text" id="poRecvNotes_' + idx + '" class="po-input po-input-sm" placeholder="Notes...">' +
      '</div>') +
      '</div></div>';
  });
  html += '</div>';

  // Photo & general notes
  html += '<div class="po-receive-extras">';
  html += '<div class="po-form-group"><label>Receiving Notes</label><textarea id="poRecvGeneralNotes" class="po-input" rows="3" placeholder="General notes about this delivery..."></textarea></div>';
  html += '<div class="po-receive-photo-section">' +
    '<label class="po-receive-photo-btn"><i class="fas fa-camera"></i> Attach Photo' +
    '<input type="file" accept="image/*" capture="environment" id="poRecvPhoto" style="display:none" onchange="poPreviewRecvPhoto(this)"></label>' +
    '<img id="poRecvPhotoPreview" class="po-recv-photo-preview" style="display:none">' +
    '</div>';
  html += '</div>';

  // Submit
  html += '<div class="po-receive-submit">';
  html += '<button class="po-btn po-btn-primary po-btn-lg" onclick="poSubmitReceiving(' + po.id + ')"><i class="fas fa-check-double"></i> Submit Receiving</button>';
  html += '</div>';

  html += '</div>';
  return html;
}

function poStepRecv(idx, delta) {
  var input = document.getElementById('poRecvQty_' + idx);
  if (!input) return;
  var val = parseInt(input.value) || 0;
  input.value = Math.max(0, val + delta);
}

function poPreviewRecvPhoto(input) {
  if (!input.files || !input.files[0]) return;
  poCompressImage(input.files[0], 800, 0.7).then(function(dataUrl) {
    var preview = document.getElementById('poRecvPhotoPreview');
    preview.src = dataUrl;
    preview.style.display = 'block';
    preview.dataset.imageData = dataUrl;
    poToast('Photo ready');
  });
}

async function poSubmitReceiving(poId) {
  var items = [];
  var inputs = document.querySelectorAll('.po-recv-field');
  inputs.forEach(function(input, idx) {
    var qty = parseInt(input.value) || 0;
    if (qty <= 0) return;
    var cond = document.getElementById('poRecvCond_' + idx);
    var notes = document.getElementById('poRecvNotes_' + idx);
    items.push({
      po_item_id: parseInt(input.dataset.itemId),
      product_id: input.dataset.productId ? parseInt(input.dataset.productId) : null,
      qty_received: qty,
      condition: cond ? cond.value : 'good',
      notes: notes ? notes.value : ''
    });
  });

  if (items.length === 0) { poToast('No items to receive', 'warning'); return; }

  var generalNotes = document.getElementById('poRecvGeneralNotes');

  try {
    var resp = await poAPI.post('/api/purchasing/orders/' + poId + '/receive', {
      items: items,
      notes: generalNotes ? generalNotes.value : ''
    }, { headers: poHeaders() });

    // Upload photo if present
    var preview = document.getElementById('poRecvPhotoPreview');
    if (preview && preview.dataset.imageData) {
      try {
        await poAPI.post('/api/purchasing/orders/' + poId + '/images', {
          image_data: preview.dataset.imageData,
          caption: 'Receiving photo',
          receiving_id: resp.data.receiving_id
        }, { headers: poHeaders() });
      } catch(e) { console.error('Image upload failed:', e); }
    }

    poToast('Items received! Status: ' + poStatusLabel(resp.data.new_status));
    poNav('detail', poId);

    // Prompt to create a bill from supplier invoice
    setTimeout(function() {
      if (confirm('Items received successfully!\n\nDo you have the supplier\'s invoice? Create a bill now to record the actual costs.')) {
        poShowCreateBill(poId);
      }
    }, 500);
  } catch(e) {
    poToast('Receiving failed: ' + (e.response?.data?.error || e.message), 'error');
  }
}

// ==================== ARRIVING VIEW ====================
function poRenderArriving(arriving) {
  var html = '<div class="po-arriving-page">';
  html += '<div class="po-section-header"><h2><i class="fas fa-truck-moving"></i> Arriving Items \u2014 Stock Planning</h2></div>';
  html += '<p class="po-muted" style="margin:-8px 0 16px">Items expected in the next 30 days. Use this to plan warehouse space and stock levels.</p>';

  if (arriving.length === 0) {
    html += '<div class="po-empty"><i class="fas fa-truck-moving" style="font-size:48px;color:#CBD5E1"></i>';
    html += '<h3>Nothing Arriving</h3><p>No open orders with expected dates in the next 30 days.</p></div>';
    html += '</div>';
    return html;
  }

  // Group by expected date
  var byDate = {};
  arriving.forEach(function(item) {
    var dateKey = item.expected_date || 'No Date';
    if (!byDate[dateKey]) byDate[dateKey] = [];
    byDate[dateKey].push(item);
  });

  Object.keys(byDate).sort().forEach(function(dateKey) {
    var items = byDate[dateKey];
    var daysOut = dateKey !== 'No Date' ? Math.ceil((new Date(dateKey) - new Date()) / 86400000) : null;
    var dateClass = daysOut !== null && daysOut <= 0 ? 'po-date-overdue' : daysOut !== null && daysOut <= 2 ? 'po-date-soon' : '';

    html += '<div class="po-arriving-date-group ' + dateClass + '">';
    html += '<div class="po-arriving-date-header">';
    html += '<h3>' + (dateKey !== 'No Date' ? poFormatDate(dateKey) : 'No Expected Date') + '</h3>';
    if (daysOut !== null) {
      html += '<span class="po-arriving-days-badge">' + (daysOut <= 0 ? 'OVERDUE' : daysOut === 1 ? 'TOMORROW' : daysOut + ' days') + '</span>';
    }
    html += '</div>';

    html += '<div class="po-table-wrap"><table class="po-table"><thead><tr><th>PO #</th><th>Type</th><th>Item</th><th>Product</th><th>Ordered</th><th>Remaining</th><th>Supplier</th><th>Location</th><th>Status</th></tr></thead><tbody>';
    items.forEach(function(item) {
      var remaining = (item.qty_ordered || 0) - (item.qty_received || 0);
      html += '<tr class="po-clickable" onclick="poNav(\'detail\',' + item.id + ')">' +
        '<td><strong>' + poEsc(item.po_number) + '</strong></td>' +
        '<td><span class="po-type-badge po-type-' + item.order_type + '">' + poTypeLabel(item.order_type) + '</span></td>' +
        '<td>' + poEsc(item.description || '—') + '</td>' +
        '<td>' + poEsc(item.product_name || '—') + '</td>' +
        '<td class="text-right">' + item.qty_ordered + ' ' + poEsc(item.unit || '') + '</td>' +
        '<td class="text-right"><strong class="' + (remaining > 0 ? 'po-warning-text' : 'po-positive') + '">' + remaining + '</strong></td>' +
        '<td>' + poEsc(item.supplier_name || '—') + '</td>' +
        '<td><span class="po-loc-badge">' + poEsc(item.location_code) + '</span></td>' +
        '<td><span class="po-status-badge po-status-' + item.status + '">' + poStatusLabel(item.status) + '</span></td>' +
        '</tr>';
    });
    html += '</tbody></table></div></div>';
  });

  html += '</div>';
  return html;
}

// ==================== BILLS ====================
function poRenderBills() {
  var html = '<div class="po-bills-page">';
  html += '<div class="po-section-header"><h2><i class="fas fa-file-invoice-dollar"></i> Bills / Invoices</h2>';
  html += '<div style="display:flex;gap:8px;align-items:center">' +
    '<select id="poBillStatusFilter" onchange="poLoadAndRenderBills()" class="po-select po-select-sm">' +
    '<option value="">All Statuses</option>' +
    '<option value="pending">Pending</option><option value="approved">Approved</option><option value="paid">Paid</option><option value="disputed">Disputed</option></select>' +
    '</div></div>';

  if (poBills.length === 0) {
    html += '<div class="po-empty"><i class="fas fa-file-invoice-dollar" style="font-size:48px;color:#CBD5E1"></i>';
    html += '<h3>No Bills Yet</h3><p>Bills are created from purchase orders when you enter the supplier\'s invoice costs.</p></div>';
  } else {
    // Summary bar
    var pending = poBills.filter(function(b) { return b.status === 'pending'; });
    var approved = poBills.filter(function(b) { return b.status === 'approved'; });
    var paid = poBills.filter(function(b) { return b.status === 'paid'; });
    var pendingTotal = pending.reduce(function(s, b) { return s + (b.amount || 0) + (b.tax || 0); }, 0);
    html += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">' +
      '<div style="background:#FEF3C7;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600"><i class="fas fa-clock" style="color:#D97706"></i> ' + pending.length + ' Pending — $' + pendingTotal.toFixed(2) + '</div>' +
      '<div style="background:#DBEAFE;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600"><i class="fas fa-check" style="color:#2563EB"></i> ' + approved.length + ' Approved</div>' +
      '<div style="background:#D1FAE5;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600"><i class="fas fa-check-double" style="color:#059669"></i> ' + paid.length + ' Paid</div>' +
      '</div>';

    html += '<div class="po-table-wrap"><table class="po-table po-table-hover"><thead><tr><th>Bill #</th><th>PO #</th><th>Supplier</th><th>Invoice #</th><th>Items</th><th class="text-right">Subtotal</th><th class="text-right">Tax</th><th class="text-right">Total</th><th>Status</th><th>Due</th><th></th></tr></thead><tbody>';
    poBills.forEach(function(b) {
      html += '<tr class="po-clickable" onclick="poShowBillDetail(' + b.id + ')">' +
        '<td><strong>' + poEsc(b.bill_number) + '</strong></td>' +
        '<td><span class="po-link" onclick="event.stopPropagation();poNav(\'detail\',' + b.po_id + ')">' + poEsc(b.po_number) + '</span></td>' +
        '<td>' + poEsc(b.supplier_name || '—') + '</td>' +
        '<td>' + poEsc(b.supplier_invoice_number || '—') + '</td>' +
        '<td>' + (b.item_count || 0) + '</td>' +
        '<td class="text-right">$' + (b.amount || 0).toFixed(2) + '</td>' +
        '<td class="text-right">$' + (b.tax || 0).toFixed(2) + '</td>' +
        '<td class="text-right"><strong>$' + ((b.amount || 0) + (b.tax || 0)).toFixed(2) + '</strong></td>' +
        '<td><span class="po-bill-status po-bill-' + b.status + '">' + poBillStatusLabel(b.status) + '</span></td>' +
        '<td>' + poFormatDate(b.due_date) + '</td>' +
        '<td onclick="event.stopPropagation()">' +
        (b.status === 'pending' ? '<button class="po-btn po-btn-xs po-btn-success" onclick="poApproveBill(' + b.id + ')" title="Approve & update costs"><i class="fas fa-check"></i></button> ' : '') +
        (b.status === 'approved' ? '<button class="po-btn po-btn-xs po-btn-success" onclick="poMarkBillPaid(' + b.id + ')" title="Mark paid"><i class="fas fa-dollar-sign"></i></button> ' : '') +
        '</td></tr>';
    });
    html += '</tbody></table></div>';
  }

  html += '</div>';
  return html;
}

function poBillStatusLabel(s) {
  var labels = { pending: 'Pending Review', approved: 'Approved', paid: 'Paid', disputed: 'Disputed' };
  return labels[s] || s || '—';
}

async function poLoadAndRenderBills() {
  var statusFilter = document.getElementById('poBillStatusFilter');
  var url = '/api/purchasing/bills';
  if (statusFilter && statusFilter.value) url += '?status=' + statusFilter.value;
  var resp = await poAPI.get(url, { headers: poHeaders() });
  poBills = resp.data.bills || [];
  var root = document.getElementById('purchasing-app');
  if (root) root.innerHTML = poRenderNav() + poRenderBills();
}

// Bill detail modal — shows line items, cost comparison, approval action
async function poShowBillDetail(billId) {
  try {
    var resp = await poAPI.get('/api/purchasing/bills/' + billId, { headers: poHeaders() });
    var bill = resp.data.bill;
    var items = resp.data.items || [];

    var body = '<div class="po-detail-grid" style="margin-bottom:16px">' +
      '<div class="po-detail-info-card">' +
      '<div class="po-detail-row"><span>Bill Number</span><strong>' + poEsc(bill.bill_number) + '</strong></div>' +
      '<div class="po-detail-row"><span>PO Number</span><strong><span class="po-link" onclick="poCloseModal();poNav(\'detail\',' + bill.po_id + ')">' + poEsc(bill.po_number) + '</span></strong></div>' +
      '<div class="po-detail-row"><span>Supplier</span><strong>' + poEsc(bill.supplier_name || '—') + '</strong></div>' +
      '<div class="po-detail-row"><span>Invoice #</span><strong>' + poEsc(bill.supplier_invoice_number || '—') + '</strong></div>' +
      '<div class="po-detail-row"><span>Status</span><span class="po-bill-status po-bill-' + bill.status + '">' + poBillStatusLabel(bill.status) + '</span></div>' +
      '<div class="po-detail-row"><span>Due Date</span><strong>' + poFormatDate(bill.due_date) + '</strong></div>' +
      (bill.paid_date ? '<div class="po-detail-row"><span>Paid Date</span><strong>' + poFormatDate(bill.paid_date) + '</strong></div>' : '') +
      (bill.notes ? '<div class="po-detail-row"><span>Notes</span><strong>' + poEsc(bill.notes) + '</strong></div>' : '') +
      '</div>' +
      '<div class="po-detail-progress-card">' +
      '<div style="text-align:center">' +
      '<div class="po-muted">Subtotal</div><div style="font-size:24px;font-weight:800;color:#059669">$' + (bill.amount || 0).toFixed(2) + '</div>' +
      '<div class="po-muted" style="margin-top:4px">Tax: $' + (bill.tax || 0).toFixed(2) + '</div>' +
      '<div style="font-size:28px;font-weight:800;color:#1E40AF;margin-top:8px;border-top:2px solid #E2E8F0;padding-top:8px">$' + ((bill.amount || 0) + (bill.tax || 0)).toFixed(2) + '</div>' +
      '</div></div></div>';

    // Line items with cost comparison
    if (items.length > 0) {
      body += '<h4 style="margin-bottom:8px"><i class="fas fa-list"></i> Line Items</h4>';
      body += '<div class="po-table-wrap"><table class="po-table"><thead><tr><th>Product</th><th class="text-right">Qty</th><th>Unit</th><th class="text-right">Bill Cost</th><th class="text-right">Current Cost</th><th class="text-right">Diff</th><th class="text-right">Line Total</th></tr></thead><tbody>';
      items.forEach(function(item) {
        var diff = (item.unit_cost || 0) - (item.current_product_cost || 0);
        var diffClass = diff > 0 ? 'po-danger' : diff < 0 ? 'po-positive' : 'po-muted';
        body += '<tr>' +
          '<td><strong>' + poEsc(item.product_name || item.description || '—') + '</strong>' + (item.sku ? '<br><span class="po-muted">' + poEsc(item.sku) + '</span>' : '') + '</td>' +
          '<td class="text-right">' + (item.qty || 0) + '</td>' +
          '<td>' + poEsc(item.unit || 'each') + '</td>' +
          '<td class="text-right" style="font-weight:600">$' + (item.unit_cost || 0).toFixed(2) + '</td>' +
          '<td class="text-right po-muted">$' + (item.current_product_cost || 0).toFixed(2) + '</td>' +
          '<td class="text-right ' + diffClass + '">' + (diff !== 0 ? (diff > 0 ? '+' : '') + '$' + diff.toFixed(2) : '—') + '</td>' +
          '<td class="text-right"><strong>$' + ((item.qty || 0) * (item.unit_cost || 0)).toFixed(2) + '</strong></td>' +
          '</tr>';
      });
      body += '</tbody></table></div>';
    }

    // QBO sync status
    if (bill.qbo_sync_status && bill.qbo_sync_status !== 'not_synced') {
      body += '<div style="margin-top:12px;padding:8px 12px;background:#F0FDF4;border-radius:6px;font-size:13px"><i class="fas fa-cloud" style="color:#059669"></i> QBO: ' + bill.qbo_sync_status + (bill.qbo_bill_id ? ' (ID: ' + bill.qbo_bill_id + ')' : '') + '</div>';
    }

    var footer = '';
    if (bill.status === 'pending') {
      footer += '<button class="po-btn po-btn-success" onclick="poCloseModal();poApproveBill(' + bill.id + ')"><i class="fas fa-check-circle"></i> Approve & Update Costs</button> ';
      footer += '<button class="po-btn po-btn-outline" onclick="poCloseModal();poDisputeBill(' + bill.id + ')"><i class="fas fa-exclamation-triangle"></i> Dispute</button>';
    } else if (bill.status === 'approved') {
      footer += '<button class="po-btn po-btn-success" onclick="poCloseModal();poMarkBillPaid(' + bill.id + ')"><i class="fas fa-dollar-sign"></i> Mark Paid</button>';
    }

    poShowModal('<i class="fas fa-file-invoice-dollar"></i> Bill Detail — ' + poEsc(bill.bill_number), body, footer);
  } catch(e) { poToast('Failed to load bill: ' + (e.response?.data?.error || e.message), 'error'); }
}

// Approve bill — this updates product costs from the bill's line item costs
async function poApproveBill(billId) {
  if (!confirm('Approve this bill?\n\nThis will update product costs to the supplier\'s invoice prices.\nThe new costs will be used for COGS calculations going forward.')) return;
  try {
    await poAPI.put('/api/purchasing/bills/' + billId, { status: 'approved' }, { headers: poHeaders() });
    poToast('Bill approved — product costs updated to latest supplier prices');
    poRender();
  } catch(e) { poToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

async function poMarkBillPaid(billId) {
  if (!confirm('Mark this bill as paid?')) return;
  try {
    await poAPI.put('/api/purchasing/bills/' + billId, {
      status: 'paid',
      paid_date: new Date().toISOString().slice(0,10)
    }, { headers: poHeaders() });
    poToast('Bill marked as paid');
    poRender();
  } catch(e) { poToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

async function poDisputeBill(billId) {
  var reason = prompt('Enter dispute reason:');
  if (!reason) return;
  try {
    await poAPI.put('/api/purchasing/bills/' + billId, {
      status: 'disputed',
      notes: reason
    }, { headers: poHeaders() });
    poToast('Bill disputed');
    poRender();
  } catch(e) { poToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// ==================== FREIGHT CHARGES ====================

function poFreightMethodLabel(m) {
  if (m === 'by_qty') return 'By Qty';
  if (m === 'by_value') return 'By Value';
  if (m === 'even') return 'Even Split';
  return m || 'By Qty';
}

async function poShowCreateFreight(poId) {
  try {
    // Load suppliers for vendor picker
    var resp = await poAPI.get('/api/purchasing/suppliers?active=1', { headers: poHeaders() });
    var suppliers = resp.data.suppliers || [];

    var body = '<div class="po-form">';
    body += '<h4 style="margin-bottom:12px"><i class="fas fa-truck-loading"></i> Add Freight Charge for this PO</h4>';

    // Third party toggle
    body += '<div class="po-form-row" style="margin-bottom:12px">';
    body += '<label style="display:flex;align-items:center;gap:8px;cursor:pointer">';
    body += '<input type="checkbox" id="poFreightThirdParty" onchange="poToggleFreightVendor()">';
    body += '<span>Third-party freight carrier (different from product supplier)</span>';
    body += '</label></div>';

    // Vendor selection (for third party)
    body += '<div id="poFreightVendorSection" style="display:none">';
    body += '<div class="po-form-row"><label>Freight Vendor</label>';
    body += '<select id="poFreightVendorId" class="po-input"><option value="">— Select vendor or enter name below —</option>';
    suppliers.forEach(function(s) {
      body += '<option value="' + s.id + '">' + poEsc(s.name) + (s.supplier_type === 'freight' ? ' (Freight)' : '') + '</option>';
    });
    body += '</select></div>';
    body += '<div class="po-form-row"><label>Or enter carrier name</label><input id="poFreightCarrierName" class="po-input" placeholder="e.g. FedEx Freight, R+L Carriers"></div>';
    body += '</div>';

    // Core fields
    body += '<div class="po-form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
    body += '<div class="po-form-row"><label>Freight Amount *</label><input id="poFreightAmount" type="number" step="0.01" min="0" class="po-input" placeholder="0.00"></div>';
    body += '<div class="po-form-row"><label>Tax</label><input id="poFreightTax" type="number" step="0.01" min="0" class="po-input" placeholder="0.00" value="0"></div>';
    body += '<div class="po-form-row"><label>Invoice / BOL #</label><input id="poFreightInvoice" class="po-input" placeholder="Freight invoice number"></div>';
    body += '<div class="po-form-row"><label>Tracking #</label><input id="poFreightTracking" class="po-input" placeholder="Tracking or PRO number"></div>';
    body += '<div class="po-form-row"><label>Due Date</label><input id="poFreightDueDate" type="date" class="po-input"></div>';
    body += '<div class="po-form-row"><label>Allocation Method</label>';
    body += '<select id="poFreightMethod" class="po-input">';
    body += '<option value="by_qty" selected>Split by Quantity (default)</option>';
    body += '<option value="by_value">Split by Value</option>';
    body += '<option value="even">Even Split</option>';
    body += '</select></div>';
    body += '</div>';

    body += '<div class="po-form-row" style="margin-top:12px"><label>Notes</label><textarea id="poFreightNotes" class="po-input" rows="2" placeholder="Notes about this freight charge..."></textarea></div>';
    body += '</div>';

    var footer = '<button class="po-btn po-btn-primary" onclick="poDoCreateFreight(' + poId + ')"><i class="fas fa-plus"></i> Add Freight Charge</button>';
    poShowModal('<i class="fas fa-truck-loading"></i> Add Freight Charge', body, footer);
  } catch(e) { poToast('Failed to load: ' + (e.response?.data?.error || e.message), 'error'); }
}

function poToggleFreightVendor() {
  var checked = document.getElementById('poFreightThirdParty').checked;
  document.getElementById('poFreightVendorSection').style.display = checked ? 'block' : 'none';
}

async function poDoCreateFreight(poId) {
  var amount = parseFloat(document.getElementById('poFreightAmount').value) || 0;
  if (amount <= 0) { poToast('Freight amount is required', 'error'); return; }

  var isThirdParty = document.getElementById('poFreightThirdParty').checked;
  var vendorId = isThirdParty ? (document.getElementById('poFreightVendorId').value || null) : null;
  var carrierName = isThirdParty ? (document.getElementById('poFreightCarrierName').value || null) : null;

  try {
    await poAPI.post('/api/purchasing/orders/' + poId + '/freight', {
      amount: amount,
      tax: parseFloat(document.getElementById('poFreightTax').value) || 0,
      invoice_number: document.getElementById('poFreightInvoice').value || null,
      tracking_number: document.getElementById('poFreightTracking').value || null,
      due_date: document.getElementById('poFreightDueDate').value || null,
      allocation_method: document.getElementById('poFreightMethod').value || 'by_qty',
      notes: document.getElementById('poFreightNotes').value || null,
      is_third_party: isThirdParty ? 1 : 0,
      vendor_id: vendorId,
      carrier_name: carrierName,
      vendor_name: carrierName
    }, { headers: poHeaders() });
    poToast('Freight charge added');
    poCloseModal();
    poRender();
  } catch(e) { poToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

async function poShowFreightDetail(freightId) {
  try {
    var resp = await poAPI.get('/api/purchasing/freight/' + freightId, { headers: poHeaders() });
    var charge = resp.data.charge;
    var allocations = resp.data.allocations || [];
    var poItems = resp.data.po_items || [];

    var body = '<div class="po-bill-detail">';

    // Header info
    body += '<div class="po-detail-grid" style="grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">';
    body += '<div class="po-detail-info-card">';
    body += '<div class="po-detail-row"><span>PO</span><strong>' + poEsc(charge.po_number) + '</strong></div>';
    body += '<div class="po-detail-row"><span>Vendor</span><strong>' + poEsc(charge.carrier_name || charge.vendor_name || charge.supplier_name_resolved || '—') + '</strong></div>';
    if (charge.is_third_party) body += '<div class="po-detail-row"><span>Type</span><strong style="color:#D97706"><i class="fas fa-external-link-alt"></i> Third-Party Carrier</strong></div>';
    body += '<div class="po-detail-row"><span>Invoice/BOL</span><strong>' + poEsc(charge.invoice_number || '—') + '</strong></div>';
    if (charge.tracking_number) body += '<div class="po-detail-row"><span>Tracking</span><strong>' + poEsc(charge.tracking_number) + '</strong></div>';
    body += '</div>';
    body += '<div class="po-detail-info-card">';
    body += '<div class="po-detail-row"><span>Amount</span><strong style="color:#0369A1;font-size:18px">$' + (charge.amount || 0).toFixed(2) + '</strong></div>';
    body += '<div class="po-detail-row"><span>Tax</span><strong>$' + (charge.tax || 0).toFixed(2) + '</strong></div>';
    body += '<div class="po-detail-row"><span>Total</span><strong>$' + ((charge.amount || 0) + (charge.tax || 0)).toFixed(2) + '</strong></div>';
    body += '<div class="po-detail-row"><span>Allocation</span><strong>' + poFreightMethodLabel(charge.allocation_method) + '</strong></div>';
    body += '<div class="po-detail-row"><span>Status</span><span class="po-bill-status po-bill-' + charge.status + '">' + poBillStatusLabel(charge.status) + '</span></div>';
    body += '</div></div>';

    if (charge.notes) body += '<div class="po-muted" style="margin-bottom:12px"><i class="fas fa-sticky-note"></i> ' + poEsc(charge.notes) + '</div>';

    // If approved/paid, show allocations
    if (allocations.length > 0) {
      body += '<h4 style="margin-top:8px"><i class="fas fa-sitemap" style="color:#6366F1"></i> Freight Allocation</h4>';
      body += '<table class="po-table po-table-compact"><thead><tr><th>Product</th><th class="text-right">Qty</th><th class="text-right">Allocated</th><th class="text-right">Per Unit</th><th class="text-right">Current Cost</th></tr></thead><tbody>';
      allocations.forEach(function(a) {
        body += '<tr>' +
          '<td><strong>' + poEsc(a.product_name || '—') + '</strong>' + (a.sku ? ' <span class="po-muted">(' + poEsc(a.sku) + ')</span>' : '') + '</td>' +
          '<td class="text-right">' + a.qty + '</td>' +
          '<td class="text-right">$' + (a.allocated_amount || 0).toFixed(2) + '</td>' +
          '<td class="text-right" style="color:#0369A1;font-weight:600">$' + (a.per_unit_freight || 0).toFixed(2) + '</td>' +
          '<td class="text-right">$' + (a.current_cost || 0).toFixed(2) + '</td>' +
          '</tr>';
      });
      body += '</tbody></table>';
    } else if (charge.status === 'pending') {
      // Show preview
      body += '<h4 style="margin-top:8px"><i class="fas fa-eye" style="color:#D97706"></i> Allocation Preview (pending approval)</h4>';
      if (poItems.length > 0) {
        var totalQty = poItems.reduce(function(s, i) { return s + (i.qty_received || i.qty_ordered || 0); }, 0);
        body += '<table class="po-table po-table-compact"><thead><tr><th>Product</th><th class="text-right">Qty</th><th class="text-right">Est. Allocated</th><th class="text-right">Est. Per Unit</th><th class="text-right">Current Cost</th><th class="text-right">Est. Landed</th></tr></thead><tbody>';
        poItems.forEach(function(item) {
          var qty = item.qty_received || item.qty_ordered || 0;
          var allocated = totalQty > 0 ? (qty / totalQty) * charge.amount : 0;
          var perUnit = qty > 0 ? allocated / qty : 0;
          var landed = (item.current_cost || 0) + perUnit;
          body += '<tr>' +
            '<td><strong>' + poEsc(item.product_name || '—') + '</strong></td>' +
            '<td class="text-right">' + qty + '</td>' +
            '<td class="text-right" style="color:#D97706">$' + allocated.toFixed(2) + '</td>' +
            '<td class="text-right" style="color:#D97706">$' + perUnit.toFixed(2) + '</td>' +
            '<td class="text-right">$' + (item.current_cost || 0).toFixed(2) + '</td>' +
            '<td class="text-right" style="color:#059669;font-weight:600">$' + landed.toFixed(2) + '</td>' +
            '</tr>';
        });
        body += '</tbody></table>';
        body += '<p class="po-muted" style="font-size:12px;margin-top:8px"><i class="fas fa-info-circle"></i> These are estimates based on current quantities. Final allocation is calculated upon approval.</p>';
      } else {
        body += '<p class="po-muted">No PO items to allocate freight to.</p>';
      }
    }

    body += '</div>';

    var footer = '';
    if (charge.status === 'pending') {
      footer += '<button class="po-btn po-btn-danger" onclick="poCloseModal();poDeleteFreight(' + charge.id + ')"><i class="fas fa-trash"></i> Delete</button>';
      footer += '<button class="po-btn po-btn-success" onclick="poCloseModal();poApproveFreight(' + charge.id + ')"><i class="fas fa-check"></i> Approve & Allocate</button>';
    } else if (charge.status === 'approved') {
      footer += '<button class="po-btn po-btn-success" onclick="poCloseModal();poMarkFreightPaid(' + charge.id + ')"><i class="fas fa-dollar-sign"></i> Mark Paid</button>';
    }

    poShowModal('<i class="fas fa-truck-loading"></i> Freight Charge Detail', body, footer);
  } catch(e) { poToast('Failed to load freight: ' + (e.response?.data?.error || e.message), 'error'); }
}

async function poApproveFreight(freightId) {
  if (!confirm('Approve this freight charge?\n\nThis will allocate freight costs across PO items by quantity and update product costs.\nThe landed cost (product + freight) will be used for COGS going forward.')) return;
  try {
    await poAPI.put('/api/purchasing/freight/' + freightId, {
      status: 'approved'
    }, { headers: poHeaders() });
    poToast('Freight approved — costs allocated to products');
    poRender();
  } catch(e) { poToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

async function poMarkFreightPaid(freightId) {
  try {
    await poAPI.put('/api/purchasing/freight/' + freightId, {
      status: 'paid',
      paid_date: new Date().toISOString().slice(0,10)
    }, { headers: poHeaders() });
    poToast('Freight marked as paid');
    poRender();
  } catch(e) { poToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

async function poDeleteFreight(freightId) {
  if (!confirm('Delete this freight charge? This cannot be undone.')) return;
  try {
    await poAPI.delete('/api/purchasing/freight/' + freightId, { headers: poHeaders() });
    poToast('Freight charge deleted');
    poRender();
  } catch(e) { poToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

async function poShowLandedCost(poId) {
  try {
    var resp = await poAPI.get('/api/purchasing/orders/' + poId + '/landed-cost', { headers: poHeaders() });
    var items = resp.data.items || [];
    var totalFreight = resp.data.total_freight || 0;
    var freightCount = resp.data.freight_count || 0;

    var body = '<div class="po-bill-detail">';
    body += '<div style="padding:12px 16px;background:#F0FDF4;border-radius:8px;margin-bottom:16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap">';
    body += '<span style="color:#059669;font-weight:600;font-size:16px"><i class="fas fa-calculator"></i> Landed Cost Breakdown</span>';
    body += '<span class="po-muted">' + freightCount + ' freight charge(s) totaling $' + totalFreight.toFixed(2) + '</span>';
    body += '</div>';

    if (items.length > 0) {
      body += '<table class="po-table po-table-compact"><thead><tr><th>Product</th><th class="text-right">Qty</th><th class="text-right">Unit Cost</th><th class="text-right">Freight/Unit</th><th class="text-right">Landed Cost</th></tr></thead><tbody>';
      items.forEach(function(item) {
        var hasFreight = (item.freight_per_unit || 0) > 0;
        body += '<tr>' +
          '<td><strong>' + poEsc(item.product_name || '—') + '</strong>' + (item.sku ? ' <span class="po-muted">(' + poEsc(item.sku) + ')</span>' : '') + '</td>' +
          '<td class="text-right">' + (item.qty_received || item.qty_ordered || 0) + '</td>' +
          '<td class="text-right">$' + (item.bill_unit_cost || 0).toFixed(2) + '</td>' +
          '<td class="text-right" style="color:' + (hasFreight ? '#0369A1' : '#94A3B8') + '">' + (hasFreight ? '$' + item.freight_per_unit.toFixed(2) : '—') + '</td>' +
          '<td class="text-right" style="color:#059669;font-weight:700;font-size:14px">$' + (item.landed_cost || 0).toFixed(2) + '</td>' +
          '</tr>';
      });
      body += '</tbody></table>';
    } else {
      body += '<p class="po-muted" style="text-align:center;padding:24px">No items on this PO.</p>';
    }

    if (totalFreight === 0) {
      body += '<p class="po-muted" style="font-size:12px;margin-top:12px"><i class="fas fa-info-circle"></i> No approved freight charges yet. Add and approve freight to see the full landed cost.</p>';
    }

    body += '</div>';
    poShowModal('<i class="fas fa-calculator"></i> Landed Cost Analysis', body, '');
  } catch(e) { poToast('Failed to load landed cost: ' + (e.response?.data?.error || e.message), 'error'); }
}

// ==================== SUPPLIERS ====================
function poRenderSuppliers() {
  var html = '<div class="po-suppliers-page">';
  html += '<div class="po-section-header"><h2><i class="fas fa-building"></i> Suppliers</h2>';
  if (poCanEdit('suppliers')) html += '<button class="po-btn po-btn-primary" onclick="poShowAddSupplier()"><i class="fas fa-plus"></i> Add Supplier</button>';
  html += '</div>';

  if (poSuppliers.length === 0) {
    html += '<div class="po-empty"><i class="fas fa-building" style="font-size:48px;color:#CBD5E1"></i>';
    html += '<h3>No Suppliers</h3><p>Add your vendors and suppliers.</p></div>';
  } else {
    html += '<div class="po-supplier-cards">';
    poSuppliers.forEach(function(s) {
      html += '<div class="po-supplier-card">' +
        '<div class="po-supplier-card-header">' +
        '<strong>' + poEsc(s.name) + '</strong>' +
        (s.code ? '<span class="po-loc-badge">' + poEsc(s.code) + '</span>' : '') +
        '</div>' +
        '<div class="po-supplier-card-body">' +
        (s.contact_name ? '<div><i class="fas fa-user"></i> ' + poEsc(s.contact_name) + '</div>' : '') +
        (s.phone ? '<div><i class="fas fa-phone"></i> ' + poEsc(s.phone) + '</div>' : '') +
        (s.email ? '<div><i class="fas fa-envelope"></i> ' + poEsc(s.email) + '</div>' : '') +
        (s.address ? '<div><i class="fas fa-map-marker-alt"></i> ' + poEsc(s.address) + (s.city ? ', ' + poEsc(s.city) : '') + (s.state ? ' ' + poEsc(s.state) : '') + (s.zip ? ' ' + poEsc(s.zip) : '') + '</div>' : '') +
        '<div><i class="fas fa-credit-card"></i> ' + poEsc(s.payment_terms || 'Net 30') + '</div>' +
        '</div>' +
        '<div class="po-supplier-card-actions">' +
        '<button class="po-btn po-btn-xs po-btn-outline" onclick="poShowEditSupplier(' + s.id + ')"><i class="fas fa-pen"></i> Edit</button>' +
        '</div></div>';
    });
    html += '</div>';
  }

  html += '</div>';
  return html;
}

// ==================== MODALS ====================
function poShowModal(title, body, footer) {
  var existing = document.getElementById('poModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'poModal';
  modal.className = 'po-modal-overlay';
  modal.innerHTML = '<div class="po-modal">' +
    '<div class="po-modal-header"><h3>' + title + '</h3><button onclick="poCloseModal()" class="po-modal-close"><i class="fas fa-times"></i></button></div>' +
    '<div class="po-modal-body">' + body + '</div>' +
    (footer ? '<div class="po-modal-footer">' + footer + '</div>' : '') +
    '</div>';
  modal.onclick = function(e) { if (e.target === modal) poCloseModal(); };
  document.body.appendChild(modal);
  setTimeout(function() { modal.classList.add('po-modal-show'); }, 10);
}

function poCloseModal() {
  var modal = document.getElementById('poModal');
  if (modal) { modal.classList.remove('po-modal-show'); setTimeout(function() { modal.remove(); }, 200); }
}

// Status change modal
function poShowStatusChange(poId, currentStatus) {
  var statuses = ['draft','ordered','in_transit','delayed','partial','received','cancelled','claim'];
  var body = '<div class="po-form-group"><label>Current Status</label><span class="po-status-badge po-status-' + currentStatus + '">' + poStatusLabel(currentStatus) + '</span></div>';
  body += '<div class="po-form-group"><label>New Status</label><select id="poNewStatus" class="po-select">';
  statuses.forEach(function(s) {
    body += '<option value="' + s + '"' + (s === currentStatus ? ' selected' : '') + '>' + poStatusLabel(s) + '</option>';
  });
  body += '</select></div>';

  var footer = '<button class="po-btn po-btn-primary" onclick="poDoStatusChange(' + poId + ')"><i class="fas fa-check"></i> Update</button>';
  poShowModal('<i class="fas fa-exchange-alt"></i> Change Status', body, footer);
}

async function poDoStatusChange(poId) {
  var status = document.getElementById('poNewStatus').value;
  try {
    await poAPI.post('/api/purchasing/orders/' + poId + '/status', { status: status }, { headers: poHeaders() });
    poToast('Status updated to ' + poStatusLabel(status));
    poCloseModal();
    poNav('detail', poId);
  } catch(e) { poToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// Create bill modal — pre-populated with PO items and actual costs
var poBillItems = [];

async function poShowCreateBill(poId) {
  try {
    var resp = await poAPI.get('/api/purchasing/orders/' + poId + '/bill-preview', { headers: poHeaders() });
    var preview = resp.data;
    poBillItems = (preview.items || []).filter(function(item) { return item.qty_received > 0; });

    // If no items received yet, show all items with ordered qty
    if (poBillItems.length === 0) {
      poBillItems = (preview.items || []).map(function(item) {
        return Object.assign({}, item, { qty_received: item.qty_ordered });
      });
    }

    var body = '<div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:12px;margin-bottom:16px">' +
      '<div style="font-weight:600;color:#1E40AF;margin-bottom:4px"><i class="fas fa-info-circle"></i> Enter Supplier Invoice Costs</div>' +
      '<div style="font-size:13px;color:#3B82F6">Enter the actual costs from the supplier\'s invoice below. These costs will update your product COGS when the bill is approved.</div>' +
      '</div>';

    body += '<div class="po-form-row">' +
      '<div class="po-form-group" style="flex:2"><label>Supplier Invoice #</label><input id="poBillInvoice" type="text" class="po-input" placeholder="Invoice number from supplier"></div>' +
      '<div class="po-form-group"><label>Due Date</label><input id="poBillDue" type="date" class="po-input" value="' + (preview.suggested_due_date || '') + '"></div>' +
      '</div>';

    // Line items with editable costs
    body += '<div class="po-bill-items-section" style="margin-top:16px">';
    body += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
      '<label style="font-weight:600"><i class="fas fa-list"></i> Line Items (from supplier invoice)</label>' +
      '<span id="poBillSubtotal" style="font-weight:700;color:#059669">$0.00</span></div>';

    body += '<div class="po-table-wrap"><table class="po-table"><thead><tr>' +
      '<th>Product</th><th class="text-right">Qty Received</th><th>Unit</th>' +
      '<th class="text-right" style="color:#D97706">PO Est. Cost</th>' +
      '<th class="text-right" style="color:#059669">Actual Cost *</th>' +
      '<th class="text-right">Line Total</th></tr></thead><tbody>';

    poBillItems.forEach(function(item, idx) {
      var costVal = item.po_unit_cost || item.current_product_cost || 0;
      body += '<tr>' +
        '<td><strong>' + poEsc(item.product_name || item.description || 'Item') + '</strong>' +
        (item.sku ? '<br><span class="po-muted">' + poEsc(item.sku) + '</span>' : '') +
        '<input type="hidden" id="poBillItemProd_' + idx + '" value="' + (item.product_id || '') + '">' +
        '<input type="hidden" id="poBillItemPoItem_' + idx + '" value="' + (item.po_item_id || '') + '">' +
        '<input type="hidden" id="poBillItemDesc_' + idx + '" value="' + poEsc(item.description || item.product_name || '') + '">' +
        '<input type="hidden" id="poBillItemUnit_' + idx + '" value="' + poEsc(item.unit || 'each') + '">' +
        '</td>' +
        '<td class="text-right"><input type="number" step="0.01" class="po-input po-input-sm" style="width:80px;text-align:right" id="poBillItemQty_' + idx + '" value="' + (item.qty_received || 0) + '" oninput="poCalcBillTotals()" inputmode="decimal"></td>' +
        '<td>' + poEsc(item.unit || 'each') + '</td>' +
        '<td class="text-right po-muted">$' + (item.po_unit_cost || 0).toFixed(2) + '</td>' +
        '<td class="text-right"><div style="position:relative"><span style="position:absolute;left:4px;top:50%;transform:translateY(-50%);color:#94A3B8;font-size:12px">$</span>' +
        '<input type="number" step="0.01" class="po-input po-input-sm" style="width:100px;text-align:right;padding-left:16px;font-weight:600;border-color:#059669" id="poBillItemCost_' + idx + '" value="' + costVal.toFixed(2) + '" oninput="poCalcBillTotals()" inputmode="decimal"></div></td>' +
        '<td class="text-right" id="poBillItemTotal_' + idx + '" style="font-weight:600">$' + ((item.qty_received || 0) * costVal).toFixed(2) + '</td>' +
        '</tr>';
    });
    body += '</tbody></table></div></div>';

    // Tax & notes
    body += '<div class="po-form-row" style="margin-top:12px">' +
      '<div class="po-form-group"><label>Tax</label><input id="poBillTax" type="number" step="0.01" class="po-input" placeholder="0.00" value="0" oninput="poCalcBillTotals()"></div>' +
      '<div class="po-form-group" id="poBillGrandTotalWrap" style="display:flex;flex-direction:column;justify-content:flex-end">' +
      '<div style="text-align:right"><span class="po-muted">Grand Total: </span><span id="poBillGrandTotal" style="font-size:20px;font-weight:800;color:#059669">$0.00</span></div></div>' +
      '</div>';
    body += '<div class="po-form-group"><label>Notes</label><textarea id="poBillNotes" class="po-input" rows="2" placeholder="Bill notes..."></textarea></div>';

    var footer = '<button class="po-btn po-btn-primary po-btn-lg" onclick="poDoCreateBill(' + poId + ')"><i class="fas fa-file-invoice-dollar"></i> Create Bill</button>';
    poShowModal('<i class="fas fa-file-invoice-dollar"></i> Create Bill — ' + poEsc(preview.po.po_number), body, footer);

    // Trigger initial calculation
    setTimeout(function() { poCalcBillTotals(); }, 50);
  } catch(e) {
    poToast('Failed to load bill preview: ' + (e.response?.data?.error || e.message), 'error');
  }
}

function poCalcBillTotals() {
  var subtotal = 0;
  poBillItems.forEach(function(item, idx) {
    var qty = parseFloat(document.getElementById('poBillItemQty_' + idx)?.value) || 0;
    var cost = parseFloat(document.getElementById('poBillItemCost_' + idx)?.value) || 0;
    var lineTotal = qty * cost;
    subtotal += lineTotal;
    var td = document.getElementById('poBillItemTotal_' + idx);
    if (td) td.textContent = '$' + lineTotal.toFixed(2);
  });
  var sub = document.getElementById('poBillSubtotal');
  if (sub) sub.textContent = '$' + subtotal.toFixed(2);
  var tax = parseFloat(document.getElementById('poBillTax')?.value) || 0;
  var grand = document.getElementById('poBillGrandTotal');
  if (grand) grand.textContent = '$' + (subtotal + tax).toFixed(2);
}

async function poDoCreateBill(poId) {
  var invoice = document.getElementById('poBillInvoice').value;
  var due = document.getElementById('poBillDue').value;
  var tax = parseFloat(document.getElementById('poBillTax').value) || 0;
  var notes = document.getElementById('poBillNotes').value;

  var items = [];
  poBillItems.forEach(function(item, idx) {
    var qty = parseFloat(document.getElementById('poBillItemQty_' + idx)?.value) || 0;
    var cost = parseFloat(document.getElementById('poBillItemCost_' + idx)?.value) || 0;
    if (qty > 0 && cost > 0) {
      items.push({
        po_item_id: parseInt(document.getElementById('poBillItemPoItem_' + idx)?.value) || null,
        product_id: parseInt(document.getElementById('poBillItemProd_' + idx)?.value) || null,
        description: document.getElementById('poBillItemDesc_' + idx)?.value || '',
        qty: qty,
        unit: document.getElementById('poBillItemUnit_' + idx)?.value || 'each',
        unit_cost: cost
      });
    }
  });

  if (items.length === 0) { poToast('Add at least one item with qty and cost', 'warning'); return; }

  try {
    var resp = await poAPI.post('/api/purchasing/orders/' + poId + '/bills', {
      supplier_invoice_number: invoice,
      tax: tax,
      due_date: due || null,
      notes: notes,
      items: items
    }, { headers: poHeaders() });
    poToast('Bill ' + resp.data.bill_number + ' created — $' + (resp.data.amount || 0).toFixed(2));
    poCloseModal();
    poNav('detail', poId);
  } catch(e) { poToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// Upload image modal
function poShowUploadImage(poId) {
  var body = '<div class="po-img-capture">' +
    '<div class="po-img-capture-zone">' +
    '<div class="po-img-capture-placeholder">' +
    '<i class="fas fa-camera"></i><p>Take photo or choose file</p>' +
    '<div class="po-img-capture-btns">' +
    '<label class="po-btn po-btn-primary po-btn-sm"><i class="fas fa-camera"></i> Camera<input type="file" accept="image/*" capture="environment" style="display:none" onchange="poPreviewUpload(this)"></label>' +
    '<label class="po-btn po-btn-outline po-btn-sm"><i class="fas fa-images"></i> Gallery<input type="file" accept="image/*" style="display:none" onchange="poPreviewUpload(this)"></label>' +
    '</div></div>' +
    '<img id="poUploadPreview" class="po-upload-preview" style="display:none">' +
    '</div>' +
    '<div class="po-form-group"><label>Caption</label><input id="poUploadCaption" type="text" class="po-input" placeholder="e.g. Delivery truck, pallet condition..."></div>' +
    '</div>';

  var footer = '<button class="po-btn po-btn-primary" onclick="poDoUploadImage(' + poId + ')" id="poUploadBtn" disabled><i class="fas fa-cloud-arrow-up"></i> Upload</button>';
  poShowModal('<i class="fas fa-camera"></i> Upload Photo', body, footer);
}

function poPreviewUpload(input) {
  if (!input.files || !input.files[0]) return;
  poCompressImage(input.files[0], 800, 0.7).then(function(dataUrl) {
    var preview = document.getElementById('poUploadPreview');
    preview.src = dataUrl;
    preview.style.display = 'block';
    preview.dataset.imageData = dataUrl;
    document.getElementById('poUploadBtn').disabled = false;
  });
}

async function poDoUploadImage(poId) {
  var preview = document.getElementById('poUploadPreview');
  var caption = document.getElementById('poUploadCaption').value;
  if (!preview || !preview.dataset.imageData) return;

  var btn = document.getElementById('poUploadBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

  try {
    await poAPI.post('/api/purchasing/orders/' + poId + '/images', {
      image_data: preview.dataset.imageData,
      caption: caption
    }, { headers: poHeaders() });
    poToast('Photo uploaded');
    poCloseModal();
    poNav('detail', poId);
  } catch(e) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-cloud-arrow-up"></i> Upload';
    poToast('Upload failed', 'error');
  }
}

// View image
async function poViewImage(imageId) {
  try {
    var resp = await poAPI.get('/api/purchasing/images/' + imageId, { headers: poHeaders() });
    if (resp.data.image && resp.data.image.image_data) {
      var overlay = document.createElement('div');
      overlay.className = 'po-fullimg-overlay';
      overlay.onclick = function() { overlay.remove(); };
      overlay.innerHTML = '<img src="' + resp.data.image.image_data + '" class="po-fullimg">' +
        '<button class="po-fullimg-close"><i class="fas fa-times"></i></button>';
      document.body.appendChild(overlay);
      setTimeout(function() { overlay.classList.add('po-fullimg-show'); }, 10);
    }
  } catch(e) { poToast('Failed to load image', 'error'); }
}

// Add supplier modal
function poShowAddSupplier() {
  var body = '<div class="po-form-group"><label>Name *</label><input id="poSupName" type="text" class="po-input" placeholder="Supplier name"></div>' +
    '<div class="po-form-row">' +
    '<div class="po-form-group"><label>Code</label><input id="poSupCode" type="text" class="po-input" placeholder="Short code"></div>' +
    '<div class="po-form-group"><label>Contact</label><input id="poSupContact" type="text" class="po-input" placeholder="Contact person"></div>' +
    '</div>' +
    '<div class="po-form-row">' +
    '<div class="po-form-group"><label>Phone</label><input id="poSupPhone" type="tel" class="po-input" placeholder="Phone number"></div>' +
    '<div class="po-form-group"><label>Email</label><input id="poSupEmail" type="email" class="po-input" placeholder="Email"></div>' +
    '</div>' +
    '<div class="po-form-group"><label>Address</label><input id="poSupAddress" type="text" class="po-input" placeholder="Street address"></div>' +
    '<div class="po-form-row">' +
    '<div class="po-form-group"><label>City</label><input id="poSupCity" type="text" class="po-input" placeholder="City"></div>' +
    '<div class="po-form-group" style="flex:0.5"><label>State</label><input id="poSupState" type="text" class="po-input" placeholder="FL" value="FL"></div>' +
    '<div class="po-form-group" style="flex:0.5"><label>ZIP</label><input id="poSupZip" type="text" class="po-input" placeholder="ZIP"></div>' +
    '</div>' +
    '<div class="po-form-group"><label>Payment Terms</label><select id="poSupTerms" class="po-select">' +
    '<option value="Net 30">Net 30</option><option value="Net 15">Net 15</option><option value="Net 60">Net 60</option><option value="COD">COD</option><option value="Prepaid">Prepaid</option>' +
    '</select></div>' +
    '<div class="po-form-group"><label>Notes</label><textarea id="poSupNotes" class="po-input" rows="2" placeholder="Notes..."></textarea></div>';

  var footer = '<button class="po-btn po-btn-primary" onclick="poDoAddSupplier()"><i class="fas fa-plus"></i> Add Supplier</button>';
  poShowModal('<i class="fas fa-building"></i> Add Supplier', body, footer);
}

async function poDoAddSupplier() {
  var name = document.getElementById('poSupName').value;
  if (!name) { poToast('Name is required', 'warning'); return; }

  try {
    await poAPI.post('/api/purchasing/suppliers', {
      name: name,
      code: document.getElementById('poSupCode').value,
      contact_name: document.getElementById('poSupContact').value,
      phone: document.getElementById('poSupPhone').value,
      email: document.getElementById('poSupEmail').value,
      address: document.getElementById('poSupAddress').value,
      city: document.getElementById('poSupCity').value,
      state: document.getElementById('poSupState').value,
      zip: document.getElementById('poSupZip').value,
      payment_terms: document.getElementById('poSupTerms').value,
      notes: document.getElementById('poSupNotes').value
    }, { headers: poHeaders() });
    poToast('Supplier added');
    poCloseModal();
    poNav('suppliers');
  } catch(e) { poToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

function poShowEditSupplier(id) {
  var s = poSuppliers.find(function(sup) { return sup.id === id; });
  if (!s) return;

  var body = '<div class="po-form-group"><label>Name *</label><input id="poSupName" type="text" class="po-input" value="' + poEsc(s.name) + '"></div>' +
    '<div class="po-form-row">' +
    '<div class="po-form-group"><label>Code</label><input id="poSupCode" type="text" class="po-input" value="' + poEsc(s.code || '') + '"></div>' +
    '<div class="po-form-group"><label>Contact</label><input id="poSupContact" type="text" class="po-input" value="' + poEsc(s.contact_name || '') + '"></div>' +
    '</div>' +
    '<div class="po-form-row">' +
    '<div class="po-form-group"><label>Phone</label><input id="poSupPhone" type="tel" class="po-input" value="' + poEsc(s.phone || '') + '"></div>' +
    '<div class="po-form-group"><label>Email</label><input id="poSupEmail" type="email" class="po-input" value="' + poEsc(s.email || '') + '"></div>' +
    '</div>' +
    '<div class="po-form-group"><label>Address</label><input id="poSupAddress" type="text" class="po-input" value="' + poEsc(s.address || '') + '"></div>' +
    '<div class="po-form-row">' +
    '<div class="po-form-group"><label>City</label><input id="poSupCity" type="text" class="po-input" value="' + poEsc(s.city || '') + '"></div>' +
    '<div class="po-form-group" style="flex:0.5"><label>State</label><input id="poSupState" type="text" class="po-input" value="' + poEsc(s.state || 'FL') + '"></div>' +
    '<div class="po-form-group" style="flex:0.5"><label>ZIP</label><input id="poSupZip" type="text" class="po-input" value="' + poEsc(s.zip || '') + '"></div>' +
    '</div>' +
    '<div class="po-form-group"><label>Payment Terms</label><select id="poSupTerms" class="po-select">' +
    ['Net 30','Net 15','Net 60','COD','Prepaid'].map(function(t) {
      return '<option value="' + t + '"' + (s.payment_terms === t ? ' selected' : '') + '>' + t + '</option>';
    }).join('') + '</select></div>' +
    '<div class="po-form-group"><label>Notes</label><textarea id="poSupNotes" class="po-input" rows="2">' + poEsc(s.notes || '') + '</textarea></div>';

  var footer = '<button class="po-btn po-btn-primary" onclick="poDoEditSupplier(' + id + ')"><i class="fas fa-save"></i> Save</button>';
  poShowModal('<i class="fas fa-pen"></i> Edit Supplier', body, footer);
}

async function poDoEditSupplier(id) {
  var name = document.getElementById('poSupName').value;
  if (!name) { poToast('Name is required', 'warning'); return; }

  try {
    await poAPI.put('/api/purchasing/suppliers/' + id, {
      name: name,
      code: document.getElementById('poSupCode').value,
      contact_name: document.getElementById('poSupContact').value,
      phone: document.getElementById('poSupPhone').value,
      email: document.getElementById('poSupEmail').value,
      address: document.getElementById('poSupAddress').value,
      city: document.getElementById('poSupCity').value,
      state: document.getElementById('poSupState').value,
      zip: document.getElementById('poSupZip').value,
      payment_terms: document.getElementById('poSupTerms').value,
      notes: document.getElementById('poSupNotes').value,
      active: 1
    }, { headers: poHeaders() });
    poToast('Supplier updated');
    poCloseModal();
    poNav('suppliers');
  } catch(e) { poToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// ==================== IMAGE COMPRESSION ====================
function poCompressImage(file, maxWidth, quality) {
  maxWidth = maxWidth || 800;
  quality = quality || 0.7;
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement('canvas');
        var w = img.width;
        var h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ==================== ORDER REQUESTS ====================
var poRequestItems = [{ product_id: '', description: '', qty_requested: 1, unit: 'each', notes: '' }];

async function poLoadRequests() {
  var url = '/api/purchasing/requests?';
  var statusFilter = document.getElementById('poReqStatusFilter');
  var urgencyFilter = document.getElementById('poReqUrgencyFilter');
  if (statusFilter && statusFilter.value) url += 'status=' + statusFilter.value + '&';
  if (urgencyFilter && urgencyFilter.value) url += 'urgency=' + urgencyFilter.value + '&';
  if (poSelectedLocation) url += 'location_id=' + poSelectedLocation + '&';
  var resp = await poAPI.get(url, { headers: poHeaders() });
  poRequests = resp.data.requests || [];
}

async function poLoadAndRenderRequests() {
  await poLoadRequests();
  var root = document.getElementById('purchasing-app');
  if (root) root.innerHTML = poRenderNav() + poRenderRequests();
}

function poRenderRequests() {
  var html = '<div class="po-orders-page">';

  // Toolbar
  html += '<div class="po-toolbar">';
  html += '<select id="poReqStatusFilter" onchange="poLoadAndRenderRequests()" class="po-select">' +
    '<option value="">All Statuses</option>' +
    ['pending','approved','rejected','converted','cancelled'].map(function(s) {
      return '<option value="' + s + '">' + poReqStatusLabel(s) + '</option>';
    }).join('') + '</select>';
  html += '<select id="poReqUrgencyFilter" onchange="poLoadAndRenderRequests()" class="po-select">' +
    '<option value="">All Urgency</option>' +
    '<option value="critical">Critical</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>' +
    '</select>';
  if (poCanEdit('requests')) html += '<button class="po-btn po-btn-primary" onclick="poShowNewRequest()"><i class="fas fa-plus"></i> New Request</button>';
  html += '</div>';

  html += '<div class="po-stock-count">' + poRequests.length + ' request' + (poRequests.length !== 1 ? 's' : '') + '</div>';

  if (poRequests.length === 0) {
    html += '<div class="po-empty"><i class="fas fa-hand" style="font-size:48px;color:#CBD5E1"></i>';
    html += '<h3>No Requests Found</h3><p>Order requests from warehouse or inventory will appear here.</p></div>';
  } else {
    // Desktop table
    html += '<div class="po-table-wrap po-desktop-only"><table class="po-table po-table-hover">';
    html += '<thead><tr><th>Request #</th><th>Urgency</th><th>Type</th><th>Location</th><th>Items</th><th>Requested By</th><th>Status</th><th>Date</th></tr></thead><tbody>';
    poRequests.forEach(function(r) {
      html += '<tr class="po-clickable" onclick="poNav(\'request_detail\',' + r.id + ')">' +
        '<td><strong>' + poEsc(r.request_number) + '</strong></td>' +
        '<td><span class="po-urgency-badge po-urgency-' + r.urgency + '">' + poUrgencyLabel(r.urgency) + '</span></td>' +
        '<td>' + (r.order_type ? '<span class="po-type-badge po-type-' + r.order_type + '">' + poTypeLabel(r.order_type) + '</span>' : '—') + '</td>' +
        '<td><span class="po-loc-badge">' + poEsc(r.location_code) + '</span></td>' +
        '<td>' + (r.item_count || 0) + '</td>' +
        '<td>' + poEsc(r.requested_by_name || '—') + '</td>' +
        '<td><span class="po-req-status-badge po-req-status-' + r.status + '">' + poReqStatusLabel(r.status) + '</span></td>' +
        '<td>' + poFormatDateTime(r.created_at) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';

    // Mobile cards
    html += '<div class="po-mobile-only po-order-cards">';
    poRequests.forEach(function(r) {
      html += '<div class="po-order-card" onclick="poNav(\'request_detail\',' + r.id + ')">' +
        '<div class="po-order-card-top">' +
        '<div><strong>' + poEsc(r.request_number) + '</strong><br><span class="po-muted">' + poEsc(r.requested_by_name || 'Unknown') + '</span></div>' +
        '<span class="po-req-status-badge po-req-status-' + r.status + '">' + poReqStatusLabel(r.status) + '</span>' +
        '</div>' +
        '<div class="po-order-card-meta">' +
        '<span class="po-urgency-badge po-urgency-' + r.urgency + '">' + poUrgencyLabel(r.urgency) + '</span>' +
        (r.order_type ? '<span class="po-type-badge po-type-' + r.order_type + '">' + poTypeLabel(r.order_type) + '</span>' : '') +
        '<span class="po-loc-badge">' + poEsc(r.location_code) + '</span>' +
        '</div>' +
        '<div class="po-order-card-nums">' +
        '<div><span class="po-muted">Items</span><strong>' + (r.item_count || 0) + '</strong></div>' +
        '<div><span class="po-muted">Requested</span><strong>' + poFormatDateTime(r.created_at) + '</strong></div>' +
        '</div>' +
        (r.reason ? '<div class="po-muted" style="padding:4px 12px 8px;font-size:13px"><i class="fas fa-comment"></i> ' + poEsc(r.reason) + '</div>' : '') +
        '</div>';
    });
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function poRenderRequestDetail(data) {
  var r = data.request;
  var items = data.items || [];

  var html = '<div class="po-detail-page">';
  html += '<div class="po-section-header"><h2><i class="fas fa-hand"></i> ' + poEsc(r.request_number) + '</h2>';
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
  html += '<button class="po-btn po-btn-outline" onclick="poNav(\'requests\')"><i class="fas fa-arrow-left"></i> Back</button>';
  if (r.status === 'pending') {
    html += '<button class="po-btn po-btn-success" onclick="poReviewRequest(' + r.id + ',\'approved\')"><i class="fas fa-check"></i> Approve</button>';
    html += '<button class="po-btn po-btn-danger" onclick="poReviewRequest(' + r.id + ',\'rejected\')"><i class="fas fa-times"></i> Reject</button>';
  }
  if (r.status === 'approved') {
    html += '<button class="po-btn po-btn-primary" onclick="poShowConvertRequest(' + r.id + ')"><i class="fas fa-file-invoice"></i> Convert to PO</button>';
  }
  if (r.status === 'pending' || r.status === 'approved') {
    html += '<button class="po-btn po-btn-outline" onclick="poCancelRequest(' + r.id + ')"><i class="fas fa-ban"></i> Cancel</button>';
  }
  html += '</div></div>';

  // Info grid
  html += '<div class="po-detail-grid">';
  html += '<div class="po-detail-card">';
  html += '<h4>Request Info</h4>';
  html += '<div class="po-detail-row"><span>Status</span><span class="po-req-status-badge po-req-status-' + r.status + '">' + poReqStatusLabel(r.status) + '</span></div>';
  html += '<div class="po-detail-row"><span>Urgency</span><span class="po-urgency-badge po-urgency-' + r.urgency + '">' + poUrgencyLabel(r.urgency) + '</span></div>';
  html += '<div class="po-detail-row"><span>Type</span><span>' + (r.order_type ? poTypeLabel(r.order_type) : '—') + '</span></div>';
  html += '<div class="po-detail-row"><span>Location</span><span><span class="po-loc-badge">' + poEsc(r.location_code) + '</span> ' + poEsc(r.location_name) + '</span></div>';
  html += '<div class="po-detail-row"><span>Requested By</span><span>' + poEsc(r.requested_by_name || '—') + '</span></div>';
  html += '<div class="po-detail-row"><span>Date</span><span>' + poFormatDateTime(r.created_at) + '</span></div>';
  if (r.reason) html += '<div class="po-detail-row"><span>Reason</span><span>' + poEsc(r.reason) + '</span></div>';
  if (r.notes) html += '<div class="po-detail-row"><span>Notes</span><span>' + poEsc(r.notes) + '</span></div>';
  html += '</div>';

  // Review info
  if (r.reviewed_by_name) {
    html += '<div class="po-detail-card">';
    html += '<h4>Review</h4>';
    html += '<div class="po-detail-row"><span>Reviewed By</span><span>' + poEsc(r.reviewed_by_name) + '</span></div>';
    html += '<div class="po-detail-row"><span>Reviewed At</span><span>' + poFormatDateTime(r.reviewed_at) + '</span></div>';
    if (r.review_notes) html += '<div class="po-detail-row"><span>Review Notes</span><span>' + poEsc(r.review_notes) + '</span></div>';
    if (r.converted_po_id) html += '<div class="po-detail-row"><span>Converted PO</span><span><a href="javascript:void(0)" onclick="poNav(\'detail\',' + r.converted_po_id + ')" class="po-link">View PO →</a></span></div>';
    html += '</div>';
  }
  html += '</div>';

  // Items table
  html += '<div class="po-section">';
  html += '<h3 class="po-section-title"><i class="fas fa-list"></i> Requested Items (' + items.length + ')</h3>';
  html += '<div class="po-table-wrap"><table class="po-table">';
  html += '<thead><tr><th>Product</th><th>Description</th><th class="text-right">Qty Requested</th><th>Unit</th><th class="text-right">Current Stock</th><th>Notes</th></tr></thead><tbody>';
  items.forEach(function(item) {
    html += '<tr>' +
      '<td>' + (item.product_name ? '<strong>' + poEsc(item.product_name) + '</strong>' + (item.sku ? '<br><span class="po-muted">' + poEsc(item.sku) + '</span>' : '') : '<span class="po-muted">—</span>') + '</td>' +
      '<td>' + poEsc(item.description || '—') + '</td>' +
      '<td class="text-right"><strong>' + (item.qty_requested || 0) + '</strong></td>' +
      '<td>' + poEsc(item.unit || 'each') + '</td>' +
      '<td class="text-right">' + (item.current_stock !== null ? '<span class="' + (item.current_stock <= 0 ? 'po-danger' : '') + '">' + item.current_stock + '</span>' : '—') + '</td>' +
      '<td>' + poEsc(item.notes || '—') + '</td>' +
      '</tr>';
  });
  html += '</tbody></table></div></div>';

  html += '</div>';
  return html;
}

// Approve/reject a request
async function poReviewRequest(requestId, action) {
  var actionLabel = action === 'approved' ? 'Approve' : 'Reject';
  var notes = prompt(actionLabel + ' this request? Enter optional notes:');
  if (notes === null) return; // cancelled

  try {
    await poAPI.post('/api/purchasing/requests/' + requestId + '/review', {
      action: action,
      review_notes: notes || null
    }, { headers: poHeaders() });
    poToast('Request ' + (action === 'approved' ? 'approved' : 'rejected'));
    poNav('request_detail', requestId);
  } catch(e) { poToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// Cancel a request
async function poCancelRequest(requestId) {
  if (!confirm('Cancel this request?')) return;
  try {
    await poAPI.post('/api/purchasing/requests/' + requestId + '/cancel', {}, { headers: poHeaders() });
    poToast('Request cancelled');
    poNav('requests');
  } catch(e) { poToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// Convert request to PO modal
function poShowConvertRequest(requestId) {
  var supplierOpts = '<option value="">— No Supplier —</option>';
  poSuppliers.forEach(function(s) {
    supplierOpts += '<option value="' + s.id + '">' + poEsc(s.name) + (s.code ? ' (' + poEsc(s.code) + ')' : '') + '</option>';
  });

  var body = '<p style="margin-bottom:12px;color:#64748B">This will create a new Purchase Order from this request and mark it as converted.</p>' +
    '<div class="po-form-group"><label>Supplier</label><select id="poConvertSupplier" class="po-select">' + supplierOpts + '</select></div>' +
    '<div class="po-form-group"><label>Expected Arrival</label><input id="poConvertExpected" type="date" class="po-input"></div>';

  var footer = '<button class="po-btn po-btn-primary" onclick="poDoConvertRequest(' + requestId + ')"><i class="fas fa-file-invoice"></i> Create Purchase Order</button>';
  poShowModal('<i class="fas fa-file-invoice"></i> Convert to Purchase Order', body, footer);
}

async function poDoConvertRequest(requestId) {
  var supplierId = document.getElementById('poConvertSupplier').value || null;
  var expectedDate = document.getElementById('poConvertExpected').value || null;

  try {
    var resp = await poAPI.post('/api/purchasing/requests/' + requestId + '/convert', {
      supplier_id: supplierId ? parseInt(supplierId) : null,
      expected_date: expectedDate
    }, { headers: poHeaders() });
    poToast('PO ' + resp.data.po_number + ' created from request');
    poCloseModal();
    poNav('detail', resp.data.po_id);
  } catch(e) { poToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// New Request modal (also callable from purchasing module itself)
function poShowNewRequest(preselectedProduct) {
  poRequestItems = [{ product_id: '', description: '', qty_requested: 1, unit: 'each', notes: '' }];
  if (preselectedProduct) {
    poRequestItems[0] = {
      product_id: preselectedProduct.id || '',
      description: preselectedProduct.name || '',
      qty_requested: preselectedProduct.qty || 1,
      unit: preselectedProduct.unit || 'each',
      notes: ''
    };
  }

  var locOpts = '';
  poLocations.forEach(function(l) {
    locOpts += '<option value="' + l.id + '"' + (poSelectedLocation == l.id ? ' selected' : '') + '>' + poEsc(l.code) + ' — ' + poEsc(l.name) + '</option>';
  });

  var body = '<div class="po-form-group"><label>Location *</label><select id="poReqLocation" class="po-select">' + locOpts + '</select></div>' +
    '<div class="po-form-row">' +
    '<div class="po-form-group"><label>Order Type</label><select id="poReqType" class="po-select">' +
    '<option value="">— Auto —</option><option value="hay_shavings">Hay & Shavings</option><option value="feed">Feed</option><option value="shelf_goods">Shelf Goods</option>' +
    '</select></div>' +
    '<div class="po-form-group"><label>Urgency</label><select id="poReqUrgency" class="po-select">' +
    '<option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option><option value="critical">Critical</option>' +
    '</select></div>' +
    '</div>' +
    '<div class="po-form-group"><label>Reason</label><input id="poReqReason" type="text" class="po-input" placeholder="Why is this needed? e.g. Running low, customer order..."></div>' +
    '<div class="po-form-group"><label>Notes</label><textarea id="poReqNotes" class="po-input" rows="2" placeholder="Additional details..."></textarea></div>' +
    '<div class="po-req-items-section">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><label style="font-weight:600">Items *</label>' +
    '<button class="po-btn po-btn-xs po-btn-outline" onclick="poAddReqItem()"><i class="fas fa-plus"></i> Add Item</button></div>' +
    '<div id="poReqItemsList">' + poRenderReqItems() + '</div>' +
    '</div>';

  var footer = '<button class="po-btn po-btn-primary" onclick="poDoSubmitRequest()"><i class="fas fa-paper-plane"></i> Submit Request</button>';
  poShowModal('<i class="fas fa-hand"></i> New Order Request', body, footer);
}

function poRenderReqItems() {
  var html = '';
  poRequestItems.forEach(function(item, idx) {
    html += '<div class="po-req-item" data-idx="' + idx + '">' +
      '<div class="po-form-row" style="gap:6px;align-items:flex-end">' +
      '<div class="po-form-group" style="flex:2"><label>Product / Description</label>' +
      '<input type="text" class="po-input" placeholder="Search or type..." value="' + poEsc(item.description) + '" oninput="poReqSearchProduct(this.value,' + idx + ')" id="poReqDesc_' + idx + '">' +
      '<select class="po-select" id="poReqProd_' + idx + '" onchange="poReqSelectProduct(' + idx + ')" style="margin-top:4px"><option value="">— pick from catalog —</option></select></div>' +
      '<div class="po-form-group" style="flex:0 0 70px"><label>Qty</label><input type="number" class="po-input" value="' + (item.qty_requested || 1) + '" min="1" id="poReqQty_' + idx + '" inputmode="numeric"></div>' +
      '<div class="po-form-group" style="flex:0 0 80px"><label>Unit</label><select class="po-select" id="poReqUnit_' + idx + '">' +
      ['each','bag','bale','pallet','case','box','roll','ton','lb'].map(function(u) {
        return '<option value="' + u + '"' + (item.unit === u ? ' selected' : '') + '>' + u + '</option>';
      }).join('') + '</select></div>' +
      (poRequestItems.length > 1 ? '<button class="po-btn po-btn-xs po-btn-danger" style="margin-bottom:4px" onclick="poRemoveReqItem(' + idx + ')"><i class="fas fa-trash"></i></button>' : '') +
      '</div></div>';
  });
  return html;
}

function poAddReqItem() {
  poRequestItems.push({ product_id: '', description: '', qty_requested: 1, unit: 'each', notes: '' });
  var list = document.getElementById('poReqItemsList');
  if (list) list.innerHTML = poRenderReqItems();
}

function poRemoveReqItem(idx) {
  poRequestItems.splice(idx, 1);
  var list = document.getElementById('poReqItemsList');
  if (list) list.innerHTML = poRenderReqItems();
}

async function poReqSearchProduct(term, idx) {
  if (term.length < 2) return;
  try {
    var resp = await poAPI.get('/api/purchasing/products?search=' + encodeURIComponent(term), { headers: poHeaders() });
    var sel = document.getElementById('poReqProd_' + idx);
    if (!sel) return;
    sel.innerHTML = '<option value="">— pick from catalog —</option>';
    (resp.data.products || []).forEach(function(p) {
      sel.innerHTML += '<option value="' + p.id + '" data-name="' + poEsc(p.name) + '" data-unit="' + (p.unit_type || 'each') + '">' + poEsc(p.name) + ' (' + poEsc(p.sku || 'no SKU') + ')</option>';
    });
  } catch(e) {}
}

function poReqSelectProduct(idx) {
  var sel = document.getElementById('poReqProd_' + idx);
  var desc = document.getElementById('poReqDesc_' + idx);
  var unitSel = document.getElementById('poReqUnit_' + idx);
  if (!sel || !sel.value) return;
  var opt = sel.options[sel.selectedIndex];
  if (desc) desc.value = opt.dataset.name || opt.textContent;
  if (unitSel && opt.dataset.unit) unitSel.value = opt.dataset.unit;
  poRequestItems[idx].product_id = sel.value;
  poRequestItems[idx].description = opt.dataset.name || opt.textContent;
}

async function poDoSubmitRequest() {
  var locationId = document.getElementById('poReqLocation').value;
  if (!locationId) { poToast('Location is required', 'warning'); return; }

  // Collect items
  var items = [];
  poRequestItems.forEach(function(item, idx) {
    var desc = document.getElementById('poReqDesc_' + idx);
    var prodSel = document.getElementById('poReqProd_' + idx);
    var qty = document.getElementById('poReqQty_' + idx);
    var unit = document.getElementById('poReqUnit_' + idx);
    var description = desc ? desc.value : item.description;
    var productId = (prodSel && prodSel.value) ? parseInt(prodSel.value) : (item.product_id ? parseInt(item.product_id) : null);
    if (description || productId) {
      items.push({
        product_id: productId,
        description: description,
        qty_requested: parseInt(qty ? qty.value : item.qty_requested) || 1,
        unit: unit ? unit.value : item.unit
      });
    }
  });

  if (items.length === 0) { poToast('Add at least one item', 'warning'); return; }

  try {
    var resp = await poAPI.post('/api/purchasing/requests', {
      location_id: parseInt(locationId),
      order_type: document.getElementById('poReqType').value || null,
      urgency: document.getElementById('poReqUrgency').value || 'normal',
      reason: document.getElementById('poReqReason').value || null,
      notes: document.getElementById('poReqNotes').value || null,
      items: items
    }, { headers: poHeaders() });
    poToast('Request ' + resp.data.request_number + ' submitted');
    poCloseModal();
    poNav('requests');
  } catch(e) { poToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// ==================== HELPERS ====================
function poEsc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function poFormatDate(d) {
  if (!d) return '\u2014';
  try { return dayjs(d).format('MMM D, YYYY'); } catch(e) { return d; }
}

function poFormatDateTime(d) {
  if (!d) return '\u2014';
  try { return dayjs(d).format('MMM D, h:mm A'); } catch(e) { return d; }
}

function poTypeLabel(type) {
  var labels = { hay_shavings: 'Hay & Shavings', feed: 'Feed', shelf_goods: 'Shelf Goods' };
  return labels[type] || type || '—';
}

function poStatusLabel(status) {
  var labels = { draft: 'Draft', ordered: 'Ordered', in_transit: 'In Transit', delayed: 'Delayed', partial: 'Partial', received: 'Received', cancelled: 'Cancelled', claim: 'Claim' };
  return labels[status] || status || '—';
}

function poReqStatusLabel(status) {
  var labels = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', converted: 'Converted', cancelled: 'Cancelled' };
  return labels[status] || status || '—';
}

function poUrgencyLabel(urgency) {
  var labels = { low: 'Low', normal: 'Normal', high: 'High', critical: 'Critical' };
  return labels[urgency] || urgency || 'Normal';
}
