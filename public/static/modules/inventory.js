// BF Ops - Inventory Module
// Functions stay global so inline onclick handlers work.
// NOTE: API is already declared by shell.js — reassign, don't redeclare.

var invAPI = axios.create({ baseURL: '' });
var invUser = null;
var invPage = 'dashboard';
var invLocations = [];
var invSelectedLocation = null; // null = all locations
var invProducts = [];
var invStockData = [];
var invSummary = {};
var invCategoryList = [];
var invProductsPageData = [];
var invProductsTotal = 0;
var invProductsOffset = 0;

// ==================== AUTH BRIDGE ====================
function invGetToken() {
  return localStorage.getItem('bf_ops_token') || localStorage.getItem('bf_token') || '';
}
function invHeaders() {
  return { Authorization: 'Bearer ' + invGetToken() };
}

// ==================== INIT ====================
window._inventoryInit = function() {
  console.log('[Inventory] init called');
  var savedUser = localStorage.getItem('bf_ops_user') || localStorage.getItem('bf_user');
  if (savedUser) {
    try { invUser = JSON.parse(savedUser); } catch(e) { invUser = null; }
  }
  invPage = 'dashboard';
  Promise.all([invLoadLocations(), invLoadCategories()]).then(function() {
    console.log('[Inventory] locations loaded:', invLocations.length, ', categories:', invCategoryList.length, '— rendering');
    invRender();
  }).catch(function(e) {
    console.error('[Inventory] init failed:', e);
    var root = document.getElementById('inventory-app');
    if (root) root.innerHTML = '<div style="padding:24px;color:#DC2626"><i class="fas fa-exclamation-triangle"></i> Inventory failed to load. Please refresh the page.</div>';
  });
};

window._inventoryCleanup = function() {
  invUser = null;
  invPage = 'dashboard';
  invStockData = [];
  invSummary = {};
};

// ==================== DATA LOADING ====================
async function invLoadLocations() {
  try {
    var resp = await invAPI.get('/api/locations', { headers: invHeaders() });
    invLocations = resp.data.locations || [];
  } catch(e) { invLocations = []; }
}

async function invLoadCategories() {
  try {
    var resp = await invAPI.get('/api/inventory/products/categories', { headers: invHeaders() });
    invCategoryList = resp.data.categories || [];
  } catch(e) {
    invCategoryList = ['horse','cattle','poultry','swine','goat','supplement','hay','shavings','fly_spray','fly_control','electrolyte','gut_health','psyllium','oil','grooming','shampoo','liniment','clippers','leather','barn','treats','other'];
  }
}

async function invLoadDashboard() {
  try {
    var url = '/api/inventory/dashboard';
    if (invSelectedLocation) url += '?location_id=' + invSelectedLocation;
    console.log('[Inventory] loading dashboard from:', url);
    var resp = await invAPI.get(url, { headers: invHeaders() });
    invStockData = resp.data.stock || [];
    invSummary = resp.data.summary || {};
    console.log('[Inventory] dashboard loaded:', invStockData.length, 'stock items');
  } catch(e) {
    console.error('[Inventory] Dashboard load failed:', e);
    invStockData = [];
    invSummary = {};
  }
}

async function invLoadStock() {
  try {
    var url = '/api/inventory/stock?';
    if (invSelectedLocation) url += 'location_id=' + invSelectedLocation + '&';
    var search = document.getElementById('invSearchInput');
    if (search && search.value) url += 'search=' + encodeURIComponent(search.value) + '&';
    var cat = document.getElementById('invCategoryFilter');
    if (cat && cat.value) url += 'category=' + cat.value + '&';
    var resp = await invAPI.get(url, { headers: invHeaders() });
    invStockData = resp.data.stock || [];
  } catch(e) { console.error('Stock load failed:', e); }
}

// ==================== TOAST ====================
function invToast(msg, type) {
  type = type || 'success';
  var t = document.createElement('div');
  t.className = 'inv-toast inv-toast-' + type;
  t.innerHTML = '<i class="fas fa-' + (type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'check-circle') + '"></i> ' + msg;
  document.body.appendChild(t);
  setTimeout(function() { t.classList.add('inv-toast-show'); }, 10);
  setTimeout(function() { t.classList.remove('inv-toast-show'); setTimeout(function() { t.remove(); }, 300); }, 3000);
}

// ==================== NAVIGATION ====================
function invNav(page) {
  invPage = page;
  invRender();
}

// ==================== MAIN RENDER ====================
async function invRender() {
  var root = document.getElementById('inventory-app');
  if (!root) { console.warn('[Inventory] #inventory-app not found, aborting render'); return; }

  root.innerHTML = '<div class="inv-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
  console.log('[Inventory] rendering page:', invPage);

  try {
  if (invPage === 'dashboard') {
    await invLoadDashboard();
    root = document.getElementById('inventory-app'); if (!root) return;
    root.innerHTML = invRenderNav() + invRenderDashboard();
  } else if (invPage === 'stock') {
    await invLoadStock();
    root.innerHTML = invRenderNav() + invRenderStockList();
  } else if (invPage === 'products') {
    root.innerHTML = invRenderNav() + '<div class="inv-loading"><i class="fas fa-spinner fa-spin"></i></div>';
    var html = await invRenderProductsPage();
    root = document.getElementById('inventory-app'); if (!root) return;
    root.innerHTML = invRenderNav() + html;
  } else if (invPage === 'count') {
    await invLoadStock();
    root.innerHTML = invRenderNav() + invRenderQuickCount();
  } else if (invPage === 'transfers') {
    root.innerHTML = invRenderNav() + '<div class="inv-loading"><i class="fas fa-spinner fa-spin"></i></div>';
    var html = await invRenderTransfers();
    root.innerHTML = invRenderNav() + html;
  } else if (invPage === 'batches') {
    root.innerHTML = invRenderNav() + '<div class="inv-loading"><i class="fas fa-spinner fa-spin"></i></div>';
    var html = await invRenderBatches();
    root.innerHTML = invRenderNav() + html;
  } else if (invPage === 'losses') {
    root.innerHTML = invRenderNav() + '<div class="inv-loading"><i class="fas fa-spinner fa-spin"></i></div>';
    var html = await invRenderLosses();
    root.innerHTML = invRenderNav() + html;
  } else if (invPage === 'holds') {
    root.innerHTML = invRenderNav() + '<div class="inv-loading"><i class="fas fa-spinner fa-spin"></i></div>';
    var html = await invRenderHolds();
    root.innerHTML = invRenderNav() + html;
  } else if (invPage === 'reservations') {
    root.innerHTML = invRenderNav() + '<div class="inv-loading"><i class="fas fa-spinner fa-spin"></i></div>';
    var html = await invRenderReservations();
    root.innerHTML = invRenderNav() + html;
  } else if (invPage === 'audit') {
    root.innerHTML = invRenderNav() + '<div class="inv-loading"><i class="fas fa-spinner fa-spin"></i></div>';
    var html = await invRenderAuditLog();
    root.innerHTML = invRenderNav() + html;
  }
  } catch(err) {
    console.error('[Inventory] render error:', err);
    var r = document.getElementById('inventory-app');
    if (r) r.innerHTML = '<div style="padding:24px;color:#DC2626"><i class="fas fa-exclamation-triangle"></i> Error rendering inventory: ' + (err.message || err) + '. Please refresh.</div>';
  }
}

// ==================== NAV BAR ====================
function invRenderNav() {
  var pages = [
    { id: 'dashboard', icon: 'fa-chart-line', label: 'Dashboard' },
    { id: 'stock', icon: 'fa-boxes-stacked', label: 'Stock' },
    { id: 'products', icon: 'fa-tags', label: 'Products' },
    { id: 'count', icon: 'fa-calculator', label: 'Count' },
    { id: 'transfers', icon: 'fa-truck-ramp-box', label: 'Transfers' },
    { id: 'batches', icon: 'fa-layer-group', label: 'Batches' },
    { id: 'losses', icon: 'fa-triangle-exclamation', label: 'Losses' },
    { id: 'holds', icon: 'fa-lock', label: 'Holds' },
    { id: 'reservations', icon: 'fa-bookmark', label: 'Reserved' },
    { id: 'audit', icon: 'fa-clock-rotate-left', label: 'Audit Log' }
  ];

  var locOpts = '<option value="">All Locations</option>';
  invLocations.forEach(function(l) {
    locOpts += '<option value="' + l.id + '"' + (invSelectedLocation == l.id ? ' selected' : '') + '>' + l.code + ' — ' + l.name + '</option>';
  });

  return '<div class="inv-nav">' +
    '<div class="inv-nav-scroll">' +
    pages.map(function(p) {
      return '<button class="inv-nav-btn' + (invPage === p.id ? ' active' : '') + '" onclick="invNav(\'' + p.id + '\')">' +
        '<i class="fas ' + p.icon + '"></i><span>' + p.label + '</span></button>';
    }).join('') +
    '</div>' +
    '<div class="inv-loc-picker">' +
    '<i class="fas fa-location-dot"></i>' +
    '<select onchange="invSelectedLocation=this.value||null;invRender()">' + locOpts + '</select>' +
    '</div>' +
    '</div>';
}

// ==================== DASHBOARD ====================
function invRenderDashboard() {
  var s = invSummary;
  var cards = [
    { icon: 'fa-boxes-stacked', label: 'Total Products', value: s.total_products || 0, color: '#059669' },
    { icon: 'fa-cubes', label: 'Total Units', value: (s.total_units || 0).toLocaleString(), color: '#2563EB' },
    { icon: 'fa-dollar-sign', label: 'Total Value', value: '$' + (s.total_value || 0).toLocaleString(undefined, {minimumFractionDigits:2}), color: '#7C3AED' },
    { icon: 'fa-triangle-exclamation', label: 'Low Stock', value: s.low_stock || 0, color: s.low_stock > 0 ? '#DC2626' : '#6B7280' },
    { icon: 'fa-lock', label: 'On Hold', value: (s.on_hold || 0).toLocaleString(), color: '#D97706' },
    { icon: 'fa-bookmark', label: 'Reserved', value: (s.reserved || 0).toLocaleString(), color: '#0891B2' },
    { icon: 'fa-truck-ramp-box', label: 'Active Transfers', value: s.active_transfers || 0, color: '#4F46E5' },
    { icon: 'fa-chart-line-down', label: 'Losses (30d)', value: s.losses_30d || 0, color: s.losses_30d > 0 ? '#DC2626' : '#6B7280' }
  ];

  var html = '<div class="inv-dashboard">';
  html += '<div class="inv-cards-grid">';
  cards.forEach(function(card) {
    html += '<div class="inv-stat-card" onclick="' +
      (card.label === 'Low Stock' ? "invNav('stock')" :
       card.label === 'Active Transfers' ? "invNav('transfers')" :
       card.label === 'Losses (30d)' ? "invNav('losses')" :
       card.label === 'On Hold' ? "invNav('holds')" :
       card.label === 'Reserved' ? "invNav('reservations')" : '') + '">' +
      '<div class="inv-stat-icon" style="background:' + card.color + '20;color:' + card.color + '"><i class="fas ' + card.icon + '"></i></div>' +
      '<div class="inv-stat-info"><div class="inv-stat-value">' + card.value + '</div><div class="inv-stat-label">' + card.label + '</div></div>' +
      '</div>';
  });
  html += '</div>';

  // Quick actions
  html += '<div class="inv-section">';
  html += '<h3 class="inv-section-title"><i class="fas fa-bolt"></i> Quick Actions</h3>';
  html += '<div class="inv-quick-actions">';
  html += '<button class="inv-action-btn inv-action-count" onclick="invNav(\'count\')"><i class="fas fa-calculator"></i> Quick Count</button>';
  html += '<button class="inv-action-btn inv-action-transfer" onclick="invShowNewTransfer()"><i class="fas fa-truck-ramp-box"></i> New Transfer</button>';
  html += '<button class="inv-action-btn inv-action-loss" onclick="invShowReportLoss()"><i class="fas fa-triangle-exclamation"></i> Report Loss</button>';
  html += '<button class="inv-action-btn inv-action-adjust" onclick="invShowQuickAdjust()"><i class="fas fa-sliders"></i> Adjust Stock</button>';
  html += '<button class="inv-action-btn inv-action-request" onclick="invShowRequestOrder()"><i class="fas fa-hand"></i> Request Order</button>';
  html += '</div>';
  html += '</div>';

  // Stock by location summary
  if (!invSelectedLocation && invStockData.length > 0) {
    var byLoc = {};
    invStockData.forEach(function(s) {
      if (!byLoc[s.location_code]) byLoc[s.location_code] = { name: s.location_name, code: s.location_code, id: s.location_id, units: 0, products: 0, value: 0 };
      byLoc[s.location_code].units += s.qty_on_hand || 0;
      byLoc[s.location_code].products++;
      byLoc[s.location_code].value += (s.qty_on_hand || 0) * (s.price || 0);
    });

    html += '<div class="inv-section">';
    html += '<h3 class="inv-section-title"><i class="fas fa-warehouse"></i> By Location</h3>';
    html += '<div class="inv-loc-cards">';
    Object.values(byLoc).forEach(function(l) {
      html += '<div class="inv-loc-card" onclick="invSelectedLocation=' + l.id + ';invRender()">' +
        '<div class="inv-loc-card-header"><span class="inv-loc-badge">' + l.code + '</span> ' + l.name + '</div>' +
        '<div class="inv-loc-card-stats">' +
        '<div><strong>' + l.products + '</strong> products</div>' +
        '<div><strong>' + l.units.toLocaleString() + '</strong> units</div>' +
        '<div><strong>$' + l.value.toLocaleString(undefined, {minimumFractionDigits:2}) + '</strong></div>' +
        '</div></div>';
    });
    html += '</div></div>';
  }

  // Top stock items
  if (invStockData.length > 0) {
    var sorted = invStockData.slice().sort(function(a, b) { return (b.qty_on_hand || 0) - (a.qty_on_hand || 0); });
    html += '<div class="inv-section">';
    html += '<h3 class="inv-section-title"><i class="fas fa-ranking-star"></i> Top Stock Items</h3>';
    html += '<div class="inv-table-wrap"><table class="inv-table">';
    html += '<thead><tr><th>Product</th><th>Location</th><th class="text-right">On Hand</th><th class="text-right">Available</th><th class="text-right">Value</th></tr></thead><tbody>';
    sorted.slice(0, 15).forEach(function(s) {
      var avail = (s.qty_on_hand || 0) - (s.qty_on_hold || 0) - (s.qty_reserved || 0);
      html += '<tr onclick="invShowProductDetail(' + s.product_id + ')" class="inv-clickable">' +
        '<td><strong>' + escH(s.product_name) + '</strong><br><span class="inv-muted">' + escH(s.sku || '') + ' · ' + escH(s.category || '') + '</span></td>' +
        '<td><span class="inv-loc-badge">' + escH(s.location_code) + '</span></td>' +
        '<td class="text-right">' + (s.qty_on_hand || 0).toLocaleString() + ' <span class="inv-muted">' + escH(s.unit_type || '') + '</span></td>' +
        '<td class="text-right' + (avail <= 0 ? ' inv-danger' : '') + '">' + avail.toLocaleString() + '</td>' +
        '<td class="text-right">$' + ((s.qty_on_hand || 0) * (s.price || 0)).toLocaleString(undefined, {minimumFractionDigits:2}) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div></div>';
  }

  // Init stock button if no stock data
  if (invStockData.length === 0) {
    html += '<div class="inv-section inv-empty">';
    html += '<i class="fas fa-warehouse" style="font-size:48px;color:#CBD5E1"></i>';
    html += '<h3>No Inventory Data Yet</h3>';
    html += '<p>Initialize stock from your products catalog to get started.</p>';
    html += '<div class="inv-init-btns">';
    invLocations.forEach(function(l) {
      html += '<button class="inv-btn inv-btn-primary" onclick="invInitStock(' + l.id + ')"><i class="fas fa-download"></i> Init Stock at ' + escH(l.name) + '</button>';
    });
    html += '</div></div>';
  }

  html += '</div>';
  return html;
}

// ==================== STOCK LIST ====================
function invRenderStockList() {
  var html = '<div class="inv-stock-page">';

  // Search & filter bar
  html += '<div class="inv-toolbar">';
  html += '<div class="inv-search-box"><i class="fas fa-search"></i><input id="invSearchInput" type="text" placeholder="Search products..." oninput="invDebounceSearch()"></div>';
  html += '<select id="invCategoryFilter" onchange="invRender()" class="inv-select"><option value="">All Categories</option>';
  (invCategoryList || []).forEach(function(c) {
    var label = c.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
    html += '<option value="' + c + '">' + label + '</option>';
  });
  html += '</select>';
  html += '<button class="inv-btn inv-btn-sm inv-btn-outline" onclick="invExportStock()"><i class="fas fa-download"></i> Export</button>';
  html += '</div>';

  html += '<div class="inv-stock-count">' + invStockData.length + ' items</div>';

  // Stock table (desktop) / cards (mobile)
  html += '<div class="inv-table-wrap inv-desktop-only"><table class="inv-table inv-table-hover">';
  html += '<thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Location</th><th class="text-right">On Hand</th><th class="text-right">Hold</th><th class="text-right">Avail</th><th class="text-right">Sell</th><th class="text-right">Cost</th><th class="text-right">Value</th><th></th></tr></thead><tbody>';

  invStockData.forEach(function(s) {
    var avail = (s.qty_on_hand || 0) - (s.qty_on_hold || 0) - (s.qty_reserved || 0);
    var lowStock = s.reorder_point > 0 && s.qty_on_hand <= s.reorder_point;
    html += '<tr class="' + (lowStock ? 'inv-row-warning' : '') + '">' +
      '<td class="inv-clickable" onclick="invShowProductDetail(' + s.product_id + ')"><strong>' + escH(s.product_name) + '</strong></td>' +
      '<td class="inv-muted">' + escH(s.sku || '—') + '</td>' +
      '<td><span class="inv-cat-badge inv-cat-' + (s.category || 'other') + '">' + escH(s.category || 'other') + '</span></td>' +
      '<td><span class="inv-loc-badge">' + escH(s.location_code) + '</span></td>' +
      '<td class="text-right"><strong>' + (s.qty_on_hand || 0).toLocaleString() + '</strong></td>' +
      '<td class="text-right">' + (s.qty_on_hold || 0 ? '<span class="inv-hold-badge">' + s.qty_on_hold + '</span>' : '—') + '</td>' +
      '<td class="text-right' + (avail <= 0 ? ' inv-danger' : lowStock ? ' inv-warning' : '') + '"><strong>' + avail.toLocaleString() + '</strong></td>' +
      '<td class="text-right">$' + (s.price || 0).toFixed(2) + '</td>' +
      '<td class="text-right inv-muted">$' + (s.cost || 0).toFixed(2) + '</td>' +
      '<td class="text-right">$' + ((s.qty_on_hand || 0) * (s.cost || s.price || 0)).toLocaleString(undefined, {minimumFractionDigits:2}) + '</td>' +
      '<td><button class="inv-btn inv-btn-xs" onclick="invShowQuickAdjust(' + s.product_id + ',' + s.location_id + ')"><i class="fas fa-pen"></i></button>' +
      '<button class="inv-btn inv-btn-xs inv-btn-request" onclick="invShowRequestOrder(' + s.product_id + ',' + s.location_id + ',\'' + escH(s.product_name).replace(/'/g, "\\'") + '\',\'' + escH(s.unit_type || 'each') + '\')"><i class="fas fa-hand"></i></button></td>' +
      '</tr>';
  });
  html += '</tbody></table></div>';

  // Mobile cards
  html += '<div class="inv-mobile-only inv-stock-cards">';
  invStockData.forEach(function(s) {
    var avail = (s.qty_on_hand || 0) - (s.qty_on_hold || 0) - (s.qty_reserved || 0);
    var lowStock = s.reorder_point > 0 && s.qty_on_hand <= s.reorder_point;
    html += '<div class="inv-stock-card' + (lowStock ? ' inv-card-warning' : '') + '" onclick="invShowProductDetail(' + s.product_id + ')">' +
      '<div class="inv-stock-card-top">' +
      '<div><strong>' + escH(s.product_name) + '</strong><br><span class="inv-muted">' + escH(s.sku || '') + '</span></div>' +
      '<span class="inv-loc-badge">' + escH(s.location_code) + '</span>' +
      '</div>' +
      '<div class="inv-stock-card-nums">' +
      '<div><span class="inv-muted">On Hand</span><strong>' + (s.qty_on_hand || 0) + '</strong></div>' +
      '<div><span class="inv-muted">Available</span><strong class="' + (avail <= 0 ? 'inv-danger' : '') + '">' + avail + '</strong></div>' +
      '<div><span class="inv-muted">Sell</span><span>$' + (s.price || 0).toFixed(2) + '</span></div>' +
      '<div><span class="inv-muted">Cost</span><span>$' + (s.cost || 0).toFixed(2) + '</span></div>' +
      '</div>' +
      '<div class="inv-stock-card-actions">' +
      '<button class="inv-btn inv-btn-xs inv-btn-outline" onclick="event.stopPropagation();invShowQuickAdjust(' + s.product_id + ',' + s.location_id + ')"><i class="fas fa-pen"></i> Adjust</button>' +
      '<button class="inv-btn inv-btn-xs inv-btn-request" onclick="event.stopPropagation();invShowRequestOrder(' + s.product_id + ',' + s.location_id + ',\'' + escH(s.product_name).replace(/'/g, "\\'") + '\',\'' + escH(s.unit_type || 'each') + '\')"><i class="fas fa-hand"></i> Request</button>' +
      '</div>' +
      '</div>';
  });
  html += '</div>';

  html += '</div>';
  return html;
}

// ==================== QUICK COUNT (MOBILE OPTIMIZED) ====================
function invRenderQuickCount() {
  if (!invSelectedLocation) {
    return '<div class="inv-section inv-empty">' +
      '<i class="fas fa-location-dot" style="font-size:48px;color:#CBD5E1"></i>' +
      '<h3>Select a Location</h3>' +
      '<p>Choose a location from the dropdown above to start counting.</p>' +
      '</div>';
  }

  var locName = invLocations.find(function(l) { return l.id == invSelectedLocation; });
  locName = locName ? locName.name : 'Location';

  var html = '<div class="inv-count-page">';
  html += '<div class="inv-count-header">';
  html += '<h2><i class="fas fa-calculator"></i> Quick Count — ' + escH(locName) + '</h2>';
  html += '<p>Tap quantities to update. Changes are highlighted. Submit when done.</p>';
  html += '<div class="inv-count-toolbar">';
  html += '<input id="invCountSearch" type="text" placeholder="Search products..." class="inv-count-search" oninput="invFilterCountList()">';
  html += '<button class="inv-btn inv-btn-primary" onclick="invSubmitBulkCount()"><i class="fas fa-check"></i> Submit Count</button>';
  html += '</div>';
  html += '</div>';

  html += '<div id="invCountList" class="inv-count-list">';
  invStockData.forEach(function(s, idx) {
    html += '<div class="inv-count-item" data-name="' + escH((s.product_name || '').toLowerCase()) + '" data-sku="' + escH((s.sku || '').toLowerCase()) + '">' +
      '<div class="inv-count-item-info">' +
      '<strong>' + escH(s.product_name) + '</strong>' +
      '<span class="inv-muted">' + escH(s.sku || '') + ' · ' + escH(s.unit_type || '') + '</span>' +
      '</div>' +
      '<div class="inv-count-item-input">' +
      '<span class="inv-count-current">was: ' + (s.qty_on_hand || 0) + '</span>' +
      '<div class="inv-count-stepper">' +
      '<button class="inv-stepper-btn" onclick="invStepCount(' + idx + ',-1)">−</button>' +
      '<input type="number" id="invCount_' + idx + '" class="inv-count-field" value="' + (s.qty_on_hand || 0) + '" data-original="' + (s.qty_on_hand || 0) + '" data-product="' + s.product_id + '" inputmode="numeric" onchange="invMarkChanged(' + idx + ')">' +
      '<button class="inv-stepper-btn" onclick="invStepCount(' + idx + ',1)">+</button>' +
      '</div></div></div>';
  });
  html += '</div></div>';
  return html;
}

function invStepCount(idx, delta) {
  var input = document.getElementById('invCount_' + idx);
  if (!input) return;
  var val = parseInt(input.value) || 0;
  val = Math.max(0, val + delta);
  input.value = val;
  invMarkChanged(idx);
}

function invMarkChanged(idx) {
  var input = document.getElementById('invCount_' + idx);
  if (!input) return;
  var original = parseInt(input.dataset.original) || 0;
  var current = parseInt(input.value) || 0;
  var item = input.closest('.inv-count-item');
  if (current !== original) {
    item.classList.add('inv-count-changed');
  } else {
    item.classList.remove('inv-count-changed');
  }
}

function invFilterCountList() {
  var search = (document.getElementById('invCountSearch').value || '').toLowerCase();
  var items = document.querySelectorAll('.inv-count-item');
  items.forEach(function(item) {
    var name = item.dataset.name || '';
    var sku = item.dataset.sku || '';
    item.style.display = (!search || name.includes(search) || sku.includes(search)) ? '' : 'none';
  });
}

async function invSubmitBulkCount() {
  var counts = [];
  var inputs = document.querySelectorAll('.inv-count-field');
  inputs.forEach(function(input) {
    var original = parseInt(input.dataset.original) || 0;
    var current = parseInt(input.value) || 0;
    if (current !== original) {
      counts.push({ product_id: parseInt(input.dataset.product), new_qty: current });
    }
  });

  if (counts.length === 0) { invToast('No changes to submit', 'warning'); return; }

  if (!confirm('Submit count for ' + counts.length + ' item(s)?')) return;

  try {
    await invAPI.post('/api/inventory/bulk-count', { location_id: parseInt(invSelectedLocation), counts: counts }, { headers: invHeaders() });
    invToast(counts.length + ' items updated');
    invRender();
  } catch(e) {
    invToast('Count failed: ' + (e.response?.data?.error || e.message), 'error');
  }
}

// ==================== TRANSFERS ====================
async function invRenderTransfers() {
  var resp = await invAPI.get('/api/inventory/transfers', { headers: invHeaders() });
  var transfers = resp.data.transfers || [];

  var html = '<div class="inv-section">';
  html += '<div class="inv-section-header"><h2><i class="fas fa-truck-ramp-box"></i> Transfers</h2>';
  html += '<button class="inv-btn inv-btn-primary" onclick="invShowNewTransfer()"><i class="fas fa-plus"></i> New Transfer</button></div>';

  if (transfers.length === 0) {
    html += '<div class="inv-empty"><p>No transfers yet.</p></div>';
  } else {
    html += '<div class="inv-table-wrap"><table class="inv-table inv-table-hover">';
    html += '<thead><tr><th>Transfer #</th><th>From</th><th>To</th><th>Items</th><th>Qty</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>';
    transfers.forEach(function(t) {
      var statusClass = t.status === 'received' ? 'inv-status-success' : t.status === 'in_transit' ? 'inv-status-warning' : t.status === 'cancelled' ? 'inv-status-danger' : 'inv-status-info';
      html += '<tr class="inv-clickable" onclick="invShowTransferDetail(' + t.id + ')">' +
        '<td><strong>' + escH(t.transfer_number) + '</strong></td>' +
        '<td><span class="inv-loc-badge">' + escH(t.from_code) + '</span></td>' +
        '<td><span class="inv-loc-badge">' + escH(t.to_code) + '</span></td>' +
        '<td>' + t.item_count + '</td>' +
        '<td>' + (t.total_qty || 0) + '</td>' +
        '<td><span class="inv-status ' + statusClass + '">' + escH(t.status) + '</span></td>' +
        '<td>' + invFormatDate(t.created_at) + '</td>' +
        '<td>' + invTransferActions(t) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';
  return html;
}

function invTransferActions(t) {
  if (t.status === 'pending') {
    return '<button class="inv-btn inv-btn-xs inv-btn-primary" onclick="event.stopPropagation();invShipTransfer(' + t.id + ')"><i class="fas fa-truck"></i> Ship</button> ' +
      '<button class="inv-btn inv-btn-xs inv-btn-danger" onclick="event.stopPropagation();invCancelTransfer(' + t.id + ')"><i class="fas fa-times"></i></button>';
  }
  if (t.status === 'in_transit') {
    return '<button class="inv-btn inv-btn-xs inv-btn-success" onclick="event.stopPropagation();invReceiveTransfer(' + t.id + ')"><i class="fas fa-check"></i> Receive</button> ' +
      '<button class="inv-btn inv-btn-xs inv-btn-danger" onclick="event.stopPropagation();invCancelTransfer(' + t.id + ')"><i class="fas fa-times"></i></button>';
  }
  return '';
}

async function invShipTransfer(id) {
  if (!confirm('Ship this transfer? Stock will be deducted from source.')) return;
  try {
    await invAPI.post('/api/inventory/transfers/' + id + '/ship', {}, { headers: invHeaders() });
    invToast('Transfer shipped');
    invRender();
  } catch(e) { invToast('Ship failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

async function invReceiveTransfer(id) {
  if (!confirm('Receive this transfer? Stock will be added to destination.')) return;
  try {
    await invAPI.post('/api/inventory/transfers/' + id + '/receive', {}, { headers: invHeaders() });
    invToast('Transfer received');
    invRender();
  } catch(e) { invToast('Receive failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

async function invCancelTransfer(id) {
  if (!confirm('Cancel this transfer?')) return;
  try {
    await invAPI.post('/api/inventory/transfers/' + id + '/cancel', {}, { headers: invHeaders() });
    invToast('Transfer cancelled');
    invRender();
  } catch(e) { invToast('Cancel failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// ==================== BATCHES ====================
async function invRenderBatches() {
  var url = '/api/inventory/batches?';
  if (invSelectedLocation) url += 'location_id=' + invSelectedLocation;
  var resp = await invAPI.get(url, { headers: invHeaders() });
  var batches = resp.data.batches || [];

  var html = '<div class="inv-section">';
  html += '<div class="inv-section-header"><h2><i class="fas fa-layer-group"></i> Batches</h2>';
  html += '<button class="inv-btn inv-btn-primary" onclick="invShowNewBatch()"><i class="fas fa-plus"></i> New Batch</button></div>';
  html += '<p class="inv-muted">Track condition-based lots. Split batches when hay or product quality varies.</p>';

  if (batches.length === 0) {
    html += '<div class="inv-empty"><p>No batches created yet.</p></div>';
  } else {
    // Load batch thumbnails
    var batchIds = batches.map(function(b) { return b.id; });
    await invLoadBatchThumbnails(batchIds);

    // Desktop table
    html += '<div class="inv-table-wrap inv-desktop-only"><table class="inv-table inv-table-hover">';
    html += '<thead><tr><th style="width:48px"></th><th>Batch #</th><th>Product</th><th>Location</th><th>Qty</th><th>Condition</th><th>Notes</th><th>Date</th><th></th></tr></thead><tbody>';
    batches.forEach(function(b) {
      var condClass = b.condition === 'good' ? 'inv-cond-good' : b.condition === 'fair' ? 'inv-cond-fair' : 'inv-cond-bad';
      html += '<tr>' +
        '<td>' + invBatchThumbHTML(b.id, 40) + '</td>' +
        '<td><strong>' + escH(b.batch_number) + '</strong></td>' +
        '<td>' + escH(b.product_name) + '<br><span class="inv-muted">' + escH(b.sku || '') + '</span></td>' +
        '<td><span class="inv-loc-badge">' + escH(b.location_code) + '</span></td>' +
        '<td><strong>' + b.qty + '</strong> ' + escH(b.unit_type || '') + '</td>' +
        '<td><span class="inv-cond-badge ' + condClass + '">' + escH(b.condition) + '</span></td>' +
        '<td class="inv-muted">' + escH(b.notes || '—') + '</td>' +
        '<td>' + invFormatDate(b.created_at) + '</td>' +
        '<td>' +
        '<button class="inv-btn inv-btn-xs inv-btn-outline" onclick="invShowCaptureBatchImage(' + b.id + ')" title="Add photo"><i class="fas fa-camera"></i></button> ' +
        '<button class="inv-btn inv-btn-xs inv-btn-outline" onclick="invShowBatchImages(' + b.id + ')" title="View photos"><i class="fas fa-images"></i></button> ' +
        '<button class="inv-btn inv-btn-xs" onclick="invShowSplitBatch(' + b.id + ',' + b.qty + ',\'' + escH(b.batch_number) + '\',\'' + escH(b.product_name) + '\')"><i class="fas fa-scissors"></i> Split</button>' +
        '</td></tr>';
    });
    html += '</tbody></table></div>';

    // Mobile cards
    html += '<div class="inv-mobile-only inv-stock-cards">';
    batches.forEach(function(b) {
      var condClass = b.condition === 'good' ? 'inv-cond-good' : b.condition === 'fair' ? 'inv-cond-fair' : 'inv-cond-bad';
      html += '<div class="inv-stock-card">' +
        '<div class="inv-stock-card-top">' +
        '<div class="inv-stock-card-top-left">' + invBatchThumbHTML(b.id, 44) +
        '<div><strong>' + escH(b.batch_number) + '</strong><br><span class="inv-muted">' + escH(b.product_name) + '</span></div></div>' +
        '<span class="inv-loc-badge">' + escH(b.location_code) + '</span>' +
        '</div>' +
        '<div class="inv-stock-card-nums">' +
        '<div><span class="inv-muted">Qty</span><strong>' + b.qty + '</strong></div>' +
        '<div><span class="inv-muted">Condition</span><span class="inv-cond-badge ' + condClass + '">' + escH(b.condition) + '</span></div>' +
        '<div><span class="inv-muted">Date</span><span>' + invFormatDate(b.created_at) + '</span></div>' +
        '</div>' +
        (b.notes ? '<div class="inv-muted" style="padding:0 12px 8px;font-size:13px">' + escH(b.notes) + '</div>' : '') +
        '<div class="inv-stock-card-actions">' +
        '<button class="inv-btn inv-btn-xs inv-btn-outline" onclick="invShowCaptureBatchImage(' + b.id + ')"><i class="fas fa-camera"></i> Photo</button>' +
        '<button class="inv-btn inv-btn-xs inv-btn-outline" onclick="invShowBatchImages(' + b.id + ')"><i class="fas fa-images"></i> View</button>' +
        '<button class="inv-btn inv-btn-xs" onclick="invShowSplitBatch(' + b.id + ',' + b.qty + ',\'' + escH(b.batch_number) + '\',\'' + escH(b.product_name) + '\')"><i class="fas fa-scissors"></i> Split</button>' +
        '</div></div>';
    });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

// ==================== LOSSES ====================
async function invRenderLosses() {
  var url = '/api/inventory/losses?';
  if (invSelectedLocation) url += 'location_id=' + invSelectedLocation;
  var resp = await invAPI.get(url, { headers: invHeaders() });
  var losses = resp.data.losses || [];

  var html = '<div class="inv-section">';
  html += '<div class="inv-section-header"><h2><i class="fas fa-triangle-exclamation"></i> Losses</h2>';
  html += '<button class="inv-btn inv-btn-danger" onclick="invShowReportLoss()"><i class="fas fa-plus"></i> Report Loss</button></div>';

  if (losses.length === 0) {
    html += '<div class="inv-empty"><p>No losses recorded.</p></div>';
  } else {
    // Summary by reason
    var byReason = {};
    losses.forEach(function(l) {
      if (!byReason[l.reason]) byReason[l.reason] = { count: 0, qty: 0 };
      byReason[l.reason].count++;
      byReason[l.reason].qty += l.qty;
    });
    html += '<div class="inv-loss-summary">';
    Object.keys(byReason).forEach(function(r) {
      html += '<span class="inv-loss-reason-badge"><strong>' + byReason[r].qty + '</strong> ' + r + ' (' + byReason[r].count + 'x)</span>';
    });
    html += '</div>';

    html += '<div class="inv-table-wrap"><table class="inv-table">';
    html += '<thead><tr><th>Product</th><th>Location</th><th>Qty Lost</th><th>Reason</th><th>Notes</th><th>Reported By</th><th>Date</th></tr></thead><tbody>';
    losses.forEach(function(l) {
      html += '<tr>' +
        '<td><strong>' + escH(l.product_name) + '</strong><br><span class="inv-muted">' + escH(l.sku || '') + '</span></td>' +
        '<td><span class="inv-loc-badge">' + escH(l.location_code) + '</span></td>' +
        '<td class="inv-danger"><strong>−' + l.qty + '</strong> ' + escH(l.unit_type || '') + '</td>' +
        '<td><span class="inv-loss-reason-badge">' + escH(l.reason) + '</span></td>' +
        '<td class="inv-muted">' + escH(l.notes || '—') + '</td>' +
        '<td>' + escH(l.reported_by_name || '—') + '</td>' +
        '<td>' + invFormatDate(l.created_at) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';
  return html;
}

// ==================== HOLDS ====================
async function invRenderHolds() {
  var resp = await invAPI.get('/api/inventory/holds?active=1', { headers: invHeaders() });
  var holds = resp.data.holds || [];

  var html = '<div class="inv-section">';
  html += '<div class="inv-section-header"><h2><i class="fas fa-lock"></i> Active Holds</h2>';
  html += '<button class="inv-btn inv-btn-primary" onclick="invShowNewHold()"><i class="fas fa-plus"></i> Place Hold</button></div>';

  if (holds.length === 0) {
    html += '<div class="inv-empty"><p>No active holds.</p></div>';
  } else {
    html += '<div class="inv-table-wrap"><table class="inv-table">';
    html += '<thead><tr><th>Product</th><th>Location</th><th>Qty</th><th>Reason</th><th>Reference</th><th>Notes</th><th>Created</th><th></th></tr></thead><tbody>';
    holds.forEach(function(h) {
      html += '<tr>' +
        '<td><strong>' + escH(h.product_name) + '</strong><br><span class="inv-muted">' + escH(h.sku || '') + '</span></td>' +
        '<td><span class="inv-loc-badge">' + escH(h.location_name) + '</span></td>' +
        '<td><span class="inv-hold-badge">' + h.qty + '</span> ' + escH(h.unit_type || '') + '</td>' +
        '<td>' + escH(h.reason) + '</td>' +
        '<td class="inv-muted">' + (h.reference_type ? h.reference_type + ' #' + h.reference_id : '—') + '</td>' +
        '<td class="inv-muted">' + escH(h.notes || '—') + '</td>' +
        '<td>' + invFormatDate(h.created_at) + '</td>' +
        '<td><button class="inv-btn inv-btn-xs inv-btn-success" onclick="invReleaseHold(' + h.id + ')"><i class="fas fa-unlock"></i> Release</button></td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';
  return html;
}

async function invReleaseHold(id) {
  if (!confirm('Release this hold?')) return;
  try {
    await invAPI.post('/api/inventory/holds/' + id + '/release', {}, { headers: invHeaders() });
    invToast('Hold released');
    invRender();
  } catch(e) { invToast('Release failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// ==================== RESERVATIONS ====================
async function invRenderReservations() {
  var resp = await invAPI.get('/api/inventory/reservations?status=active', { headers: invHeaders() });
  var reservations = resp.data.reservations || [];

  var html = '<div class="inv-section">';
  html += '<div class="inv-section-header"><h2><i class="fas fa-bookmark"></i> Active Reservations</h2>';
  html += '<button class="inv-btn inv-btn-primary" onclick="invShowNewReservation()"><i class="fas fa-plus"></i> Reserve</button></div>';

  if (reservations.length === 0) {
    html += '<div class="inv-empty"><p>No active reservations.</p></div>';
  } else {
    html += '<div class="inv-table-wrap"><table class="inv-table">';
    html += '<thead><tr><th>Product</th><th>Location</th><th>Qty</th><th>Customer</th><th>Order</th><th>Notes</th><th>Created</th><th></th></tr></thead><tbody>';
    reservations.forEach(function(r) {
      html += '<tr>' +
        '<td><strong>' + escH(r.product_name) + '</strong></td>' +
        '<td><span class="inv-loc-badge">' + escH(r.location_name) + '</span></td>' +
        '<td><span class="inv-res-badge">' + r.qty + '</span></td>' +
        '<td>' + escH(r.customer_name || '—') + '</td>' +
        '<td>' + escH(r.order_number || '—') + '</td>' +
        '<td class="inv-muted">' + escH(r.notes || '—') + '</td>' +
        '<td>' + invFormatDate(r.created_at) + '</td>' +
        '<td>' +
        '<button class="inv-btn inv-btn-xs inv-btn-success" onclick="invFulfillReservation(' + r.id + ')"><i class="fas fa-check"></i></button> ' +
        '<button class="inv-btn inv-btn-xs inv-btn-danger" onclick="invCancelReservation(' + r.id + ')"><i class="fas fa-times"></i></button>' +
        '</td></tr>';
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';
  return html;
}

async function invFulfillReservation(id) {
  if (!confirm('Fulfill this reservation? Stock will be deducted.')) return;
  try {
    await invAPI.post('/api/inventory/reservations/' + id + '/fulfill', {}, { headers: invHeaders() });
    invToast('Reservation fulfilled');
    invRender();
  } catch(e) { invToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

async function invCancelReservation(id) {
  if (!confirm('Cancel this reservation?')) return;
  try {
    await invAPI.post('/api/inventory/reservations/' + id + '/cancel', {}, { headers: invHeaders() });
    invToast('Reservation cancelled');
    invRender();
  } catch(e) { invToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// ==================== AUDIT LOG ====================
async function invRenderAuditLog() {
  var url = '/api/inventory/audit?limit=100';
  if (invSelectedLocation) url += '&location_id=' + invSelectedLocation;
  var resp = await invAPI.get(url, { headers: invHeaders() });
  var audit = resp.data.audit || [];
  var total = resp.data.total || 0;

  var html = '<div class="inv-section">';
  html += '<div class="inv-section-header"><h2><i class="fas fa-clock-rotate-left"></i> Audit Log</h2>';
  html += '<span class="inv-muted">' + total + ' entries</span></div>';

  if (audit.length === 0) {
    html += '<div class="inv-empty"><p>No audit entries yet.</p></div>';
  } else {
    html += '<div class="inv-table-wrap"><table class="inv-table inv-table-compact">';
    html += '<thead><tr><th>Time</th><th>Action</th><th>Product</th><th>Location</th><th>Change</th><th>Before→After</th><th>Reason</th><th>User</th><th>Notes</th></tr></thead><tbody>';
    audit.forEach(function(a) {
      var changeClass = a.qty_change > 0 ? 'inv-positive' : a.qty_change < 0 ? 'inv-danger' : '';
      var actionIcon = invActionIcon(a.action);
      html += '<tr>' +
        '<td class="inv-muted inv-nowrap">' + invFormatDateTime(a.created_at) + '</td>' +
        '<td><span class="inv-audit-action">' + actionIcon + ' ' + escH(a.action) + '</span></td>' +
        '<td>' + escH(a.product_name) + '</td>' +
        '<td><span class="inv-loc-badge">' + escH(a.location_code) + '</span></td>' +
        '<td class="' + changeClass + ' text-right"><strong>' + (a.qty_change > 0 ? '+' : '') + a.qty_change + '</strong></td>' +
        '<td class="inv-muted text-right">' + (a.qty_before != null ? a.qty_before + '→' + a.qty_after : '—') + '</td>' +
        '<td class="inv-muted">' + escH(a.reason || '—') + '</td>' +
        '<td>' + escH(a.user_name || '—') + '</td>' +
        '<td class="inv-muted">' + escH(a.notes || '') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';
  return html;
}

function invActionIcon(action) {
  var icons = {
    'count': '<i class="fas fa-calculator" style="color:#2563EB"></i>',
    'adjust': '<i class="fas fa-sliders" style="color:#7C3AED"></i>',
    'transfer_out': '<i class="fas fa-arrow-right-from-bracket" style="color:#DC2626"></i>',
    'transfer_in': '<i class="fas fa-arrow-right-to-bracket" style="color:#059669"></i>',
    'transfer_cancelled': '<i class="fas fa-ban" style="color:#6B7280"></i>',
    'transfer_discrepancy': '<i class="fas fa-exclamation" style="color:#D97706"></i>',
    'loss': '<i class="fas fa-triangle-exclamation" style="color:#DC2626"></i>',
    'hold_placed': '<i class="fas fa-lock" style="color:#D97706"></i>',
    'hold_released': '<i class="fas fa-unlock" style="color:#059669"></i>',
    'reserved': '<i class="fas fa-bookmark" style="color:#0891B2"></i>',
    'reservation_fulfilled': '<i class="fas fa-check-circle" style="color:#059669"></i>',
    'reservation_cancelled': '<i class="fas fa-times-circle" style="color:#6B7280"></i>',
    'route_hold': '<i class="fas fa-truck" style="color:#D97706"></i>',
    'route_delivered': '<i class="fas fa-truck-fast" style="color:#059669"></i>',
    'batch_created': '<i class="fas fa-layer-group" style="color:#4F46E5"></i>',
    'batch_split': '<i class="fas fa-scissors" style="color:#D97706"></i>',
    'batch_updated': '<i class="fas fa-pen" style="color:#2563EB"></i>',
    'init': '<i class="fas fa-download" style="color:#059669"></i>'
  };
  return icons[action] || '<i class="fas fa-circle-info" style="color:#6B7280"></i>';
}

// ==================== MODALS / DIALOGS ====================

function invShowModal(title, body, footer) {
  var existing = document.getElementById('invModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'invModal';
  modal.className = 'inv-modal-overlay';
  modal.innerHTML = '<div class="inv-modal">' +
    '<div class="inv-modal-header"><h3>' + title + '</h3><button onclick="invCloseModal()" class="inv-modal-close"><i class="fas fa-times"></i></button></div>' +
    '<div class="inv-modal-body">' + body + '</div>' +
    (footer ? '<div class="inv-modal-footer">' + footer + '</div>' : '') +
    '</div>';
  modal.onclick = function(e) { if (e.target === modal) invCloseModal(); };
  document.body.appendChild(modal);
  setTimeout(function() { modal.classList.add('inv-modal-show'); }, 10);
}

function invCloseModal() {
  var modal = document.getElementById('invModal');
  if (modal) { modal.classList.remove('inv-modal-show'); setTimeout(function() { modal.remove(); }, 200); }
}

// Product picker with search
function invProductPickerHTML(selectId) {
  return '<div class="inv-form-group">' +
    '<label>Product</label>' +
    '<input id="invProdSearch" type="text" placeholder="Type to search products..." class="inv-input" oninput="invSearchProducts(this.value,\'' + selectId + '\')">' +
    '<select id="' + selectId + '" class="inv-select inv-select-lg" size="5"></select>' +
    '</div>';
}

async function invSearchProducts(term, selectId) {
  try {
    var resp = await invAPI.get('/api/inventory/products?search=' + encodeURIComponent(term), { headers: invHeaders() });
    var sel = document.getElementById(selectId);
    sel.innerHTML = '';
    (resp.data.products || []).forEach(function(p) {
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name + ' (' + (p.sku || 'no SKU') + ') — ' + (p.unit_type || 'unit');
      sel.appendChild(opt);
    });
  } catch(e) {}
}

function invLocationPickerHTML(selectId, label, excludeId) {
  var opts = '';
  invLocations.forEach(function(l) {
    if (excludeId && l.id == excludeId) return;
    opts += '<option value="' + l.id + '">' + l.code + ' — ' + l.name + '</option>';
  });
  return '<div class="inv-form-group"><label>' + (label || 'Location') + '</label><select id="' + selectId + '" class="inv-select">' + opts + '</select></div>';
}

// Quick Adjust modal
function invShowQuickAdjust(productId, locationId) {
  var body = invProductPickerHTML('invAdjProduct') +
    invLocationPickerHTML('invAdjLocation', 'Location') +
    '<div class="inv-form-group"><label>Adjustment (+/-)</label><input id="invAdjQty" type="number" class="inv-input" placeholder="e.g. 10 or -5" inputmode="numeric"></div>' +
    '<div class="inv-form-group"><label>Reason</label><select id="invAdjReason" class="inv-select">' +
    '<option value="Manual adjustment">Manual adjustment</option><option value="Recount correction">Recount correction</option><option value="Received shipment">Received shipment</option><option value="Returned stock">Returned stock</option><option value="Other">Other</option></select></div>' +
    '<div class="inv-form-group"><label>Notes</label><textarea id="invAdjNotes" class="inv-input" rows="2" placeholder="Optional notes..."></textarea></div>';

  var footer = '<button class="inv-btn inv-btn-primary" onclick="invDoAdjust()"><i class="fas fa-check"></i> Adjust</button>';
  invShowModal('<i class="fas fa-sliders"></i> Adjust Stock', body, footer);

  // Pre-select if provided
  if (productId) {
    setTimeout(function() {
      invSearchProducts('', 'invAdjProduct').then(function() {
        var sel = document.getElementById('invAdjProduct');
        if (sel) sel.value = productId;
      });
    }, 100);
  }
  if (locationId) {
    setTimeout(function() { var sel = document.getElementById('invAdjLocation'); if (sel) sel.value = locationId; }, 50);
  }
}

async function invDoAdjust() {
  var productId = parseInt(document.getElementById('invAdjProduct').value);
  var locationId = parseInt(document.getElementById('invAdjLocation').value);
  var qty = parseInt(document.getElementById('invAdjQty').value);
  var reason = document.getElementById('invAdjReason').value;
  var notes = document.getElementById('invAdjNotes').value;

  if (!productId || !locationId || !qty) { invToast('Fill in all required fields', 'warning'); return; }

  try {
    await invAPI.post('/api/inventory/adjust', { product_id: productId, location_id: locationId, qty_change: qty, reason: reason, notes: notes }, { headers: invHeaders() });
    invToast('Stock adjusted');
    invCloseModal();
    invRender();
  } catch(e) { invToast('Adjust failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// Request Order modal (sends to purchasing module)
function invShowRequestOrder(productId, locationId, productName, unitType) {
  var locOpts = '';
  invLocations.forEach(function(l) {
    locOpts += '<option value="' + l.id + '"' + ((locationId && l.id == locationId) || (!locationId && invSelectedLocation == l.id) ? ' selected' : '') + '>' + l.code + ' — ' + l.name + '</option>';
  });

  var body = '<div class="inv-form-group"><label>Location *</label><select id="invReqLocation" class="inv-select">' + locOpts + '</select></div>';

  if (!productId) {
    // Generic request — show product picker
    body += invProductPickerHTML('invReqProduct');
  } else {
    body += '<div class="inv-form-group"><label>Product</label><div style="padding:8px;background:#F1F5F9;border-radius:6px;font-weight:600">' + escH(productName || 'Product #' + productId) + '</div>' +
      '<input type="hidden" id="invReqProductId" value="' + productId + '"><input type="hidden" id="invReqProductName" value="' + escH(productName || '') + '"></div>';
  }

  body += '<div class="inv-form-row" style="display:flex;gap:8px">' +
    '<div class="inv-form-group" style="flex:0 0 90px"><label>Qty Needed</label><input id="invReqQty" type="number" class="inv-input" value="1" min="1" inputmode="numeric"></div>' +
    '<div class="inv-form-group" style="flex:0 0 90px"><label>Unit</label><select id="invReqUnit" class="inv-select">' +
    ['each','bag','bale','pallet','case','box','roll','ton','lb'].map(function(u) {
      return '<option value="' + u + '"' + (u === (unitType || 'each') ? ' selected' : '') + '>' + u + '</option>';
    }).join('') + '</select></div>' +
    '<div class="inv-form-group"><label>Urgency</label><select id="invReqUrgency" class="inv-select">' +
    '<option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option><option value="critical">Critical</option>' +
    '</select></div></div>' +
    '<div class="inv-form-group"><label>Reason</label><input id="invReqReason" type="text" class="inv-input" placeholder="Why is this needed? e.g. Running low, customer request..."></div>' +
    '<div class="inv-form-group"><label>Notes</label><textarea id="invReqNotes" class="inv-input" rows="2" placeholder="Additional details..."></textarea></div>';

  var footer = '<button class="inv-btn inv-btn-primary" onclick="invDoSubmitRequest(' + (productId || 0) + ')"><i class="fas fa-paper-plane"></i> Submit Request</button>';
  invShowModal('<i class="fas fa-hand" style="color:#D97706"></i> Request Order', body, footer);
}

async function invDoSubmitRequest(preProductId) {
  var locationId = document.getElementById('invReqLocation').value;
  if (!locationId) { invToast('Location is required', 'warning'); return; }

  var productId = preProductId || null;
  var description = '';

  if (!preProductId) {
    // From product picker
    var prodSel = document.getElementById('invReqProduct');
    if (prodSel && prodSel.value) {
      productId = parseInt(prodSel.value);
      description = prodSel.options[prodSel.selectedIndex].textContent;
    }
  } else {
    var nameField = document.getElementById('invReqProductName');
    description = nameField ? nameField.value : '';
  }

  if (!productId && !description) { invToast('Select a product', 'warning'); return; }

  var qty = parseInt(document.getElementById('invReqQty').value) || 1;
  var unit = document.getElementById('invReqUnit').value || 'each';
  var urgency = document.getElementById('invReqUrgency').value || 'normal';
  var reason = document.getElementById('invReqReason').value || '';
  var notes = document.getElementById('invReqNotes').value || '';

  try {
    var resp = await invAPI.post('/api/purchasing/requests', {
      location_id: parseInt(locationId),
      urgency: urgency,
      reason: reason || null,
      notes: notes || null,
      items: [{
        product_id: productId,
        description: description,
        qty_requested: qty,
        unit: unit
      }]
    }, { headers: invHeaders() });
    invToast('Order request ' + resp.data.request_number + ' submitted!');
    invCloseModal();
  } catch(e) { invToast('Request failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// New Transfer modal
function invShowNewTransfer() {
  var body = invLocationPickerHTML('invTrfFrom', 'From Location') +
    '<div id="invTrfToWrap">' + invLocationPickerHTML('invTrfTo', 'To Location') + '</div>' +
    '<div class="inv-form-group"><label>Notes</label><textarea id="invTrfNotes" class="inv-input" rows="2" placeholder="Transfer notes..."></textarea></div>' +
    '<hr>' +
    '<h4>Items</h4>' +
    '<div id="invTrfItems"></div>' +
    '<button class="inv-btn inv-btn-sm inv-btn-outline" onclick="invAddTransferItem()"><i class="fas fa-plus"></i> Add Item</button>';

  var footer = '<button class="inv-btn inv-btn-primary" onclick="invDoCreateTransfer()"><i class="fas fa-paper-plane"></i> Create Transfer</button>';
  invShowModal('<i class="fas fa-truck-ramp-box"></i> New Transfer', body, footer);
  invAddTransferItem();
}

var invTrfItemCount = 0;
function invAddTransferItem() {
  var idx = invTrfItemCount++;
  var div = document.createElement('div');
  div.className = 'inv-trf-item';
  div.innerHTML = '<input type="text" placeholder="Search product..." class="inv-input inv-input-sm" oninput="invSearchTrfProduct(this.value,' + idx + ')" style="flex:2">' +
    '<select id="invTrfProd_' + idx + '" class="inv-select" style="flex:2"><option value="">Select...</option></select>' +
    '<input id="invTrfQty_' + idx + '" type="number" placeholder="Qty" class="inv-input inv-input-sm" style="flex:1;min-width:60px" inputmode="numeric">' +
    '<button class="inv-btn inv-btn-xs inv-btn-danger" onclick="this.parentElement.remove()"><i class="fas fa-trash"></i></button>';
  document.getElementById('invTrfItems').appendChild(div);
}

async function invSearchTrfProduct(term, idx) {
  try {
    var resp = await invAPI.get('/api/inventory/products?search=' + encodeURIComponent(term), { headers: invHeaders() });
    var sel = document.getElementById('invTrfProd_' + idx);
    sel.innerHTML = '<option value="">Select...</option>';
    (resp.data.products || []).forEach(function(p) {
      sel.innerHTML += '<option value="' + p.id + '">' + p.name + ' (' + (p.sku || '') + ')</option>';
    });
  } catch(e) {}
}

async function invDoCreateTransfer() {
  var from = parseInt(document.getElementById('invTrfFrom').value);
  var to = parseInt(document.getElementById('invTrfTo').value);
  var notes = document.getElementById('invTrfNotes').value;

  if (from === to) { invToast('From and To must be different', 'warning'); return; }

  var items = [];
  for (var i = 0; i < invTrfItemCount; i++) {
    var prod = document.getElementById('invTrfProd_' + i);
    var qty = document.getElementById('invTrfQty_' + i);
    if (prod && qty && prod.value && parseInt(qty.value) > 0) {
      items.push({ product_id: parseInt(prod.value), qty: parseInt(qty.value) });
    }
  }

  if (items.length === 0) { invToast('Add at least one item', 'warning'); return; }

  try {
    await invAPI.post('/api/inventory/transfers', { from_location_id: from, to_location_id: to, items: items, notes: notes }, { headers: invHeaders() });
    invToast('Transfer created');
    invCloseModal();
    invTrfItemCount = 0;
    invNav('transfers');
  } catch(e) { invToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// Transfer detail
async function invShowTransferDetail(id) {
  try {
    var resp = await invAPI.get('/api/inventory/transfers/' + id, { headers: invHeaders() });
    var t = resp.data.transfer;
    var items = resp.data.items || [];

    var body = '<div class="inv-detail-grid">' +
      '<div><span class="inv-muted">Transfer #</span><strong>' + escH(t.transfer_number) + '</strong></div>' +
      '<div><span class="inv-muted">Status</span><strong>' + escH(t.status) + '</strong></div>' +
      '<div><span class="inv-muted">From</span><span class="inv-loc-badge">' + escH(t.from_code) + '</span> ' + escH(t.from_location_name) + '</div>' +
      '<div><span class="inv-muted">To</span><span class="inv-loc-badge">' + escH(t.to_code) + '</span> ' + escH(t.to_location_name) + '</div>' +
      '<div><span class="inv-muted">Created</span>' + invFormatDateTime(t.created_at) + ' by ' + escH(t.created_by_name || '—') + '</div>' +
      (t.shipped_at ? '<div><span class="inv-muted">Shipped</span>' + invFormatDateTime(t.shipped_at) + ' by ' + escH(t.shipped_by_name || '—') + '</div>' : '') +
      (t.received_at ? '<div><span class="inv-muted">Received</span>' + invFormatDateTime(t.received_at) + ' by ' + escH(t.received_by_name || '—') + '</div>' : '') +
      '</div><hr><h4>Items</h4>';

    body += '<table class="inv-table inv-table-compact"><thead><tr><th>Product</th><th>SKU</th><th>Requested</th><th>Shipped</th><th>Received</th></tr></thead><tbody>';
    items.forEach(function(item) {
      body += '<tr><td>' + escH(item.product_name) + '</td><td class="inv-muted">' + escH(item.sku || '') + '</td>' +
        '<td>' + item.qty_requested + '</td><td>' + (item.qty_shipped || '—') + '</td><td>' + (item.qty_received || '—') + '</td></tr>';
    });
    body += '</tbody></table>';

    invShowModal('<i class="fas fa-truck-ramp-box"></i> Transfer Detail', body, invTransferActions(t));
  } catch(e) { invToast('Failed to load transfer', 'error'); }
}

// Report Loss modal
function invShowReportLoss() {
  var body = invProductPickerHTML('invLossProduct') +
    invLocationPickerHTML('invLossLocation', 'Location') +
    '<div class="inv-form-group"><label>Quantity Lost</label><input id="invLossQty" type="number" class="inv-input" min="1" placeholder="How many?" inputmode="numeric"></div>' +
    '<div class="inv-form-group"><label>Reason</label><select id="invLossReason" class="inv-select">' +
    '<option value="damaged">Damaged</option><option value="expired">Expired</option><option value="spoiled">Spoiled</option><option value="pest">Pest damage</option><option value="stolen">Stolen</option><option value="shrinkage">Shrinkage</option><option value="other">Other</option></select></div>' +
    '<div class="inv-form-group"><label>Notes / Explanation</label><textarea id="invLossNotes" class="inv-input" rows="3" placeholder="Describe what happened..."></textarea></div>';

  var footer = '<button class="inv-btn inv-btn-danger" onclick="invDoReportLoss()"><i class="fas fa-triangle-exclamation"></i> Report Loss</button>';
  invShowModal('<i class="fas fa-triangle-exclamation"></i> Report Loss', body, footer);
}

async function invDoReportLoss() {
  var productId = parseInt(document.getElementById('invLossProduct').value);
  var locationId = parseInt(document.getElementById('invLossLocation').value);
  var qty = parseInt(document.getElementById('invLossQty').value);
  var reason = document.getElementById('invLossReason').value;
  var notes = document.getElementById('invLossNotes').value;

  if (!productId || !locationId || !qty) { invToast('Fill in all required fields', 'warning'); return; }

  try {
    await invAPI.post('/api/inventory/losses', { product_id: productId, location_id: locationId, qty: qty, reason: reason, notes: notes }, { headers: invHeaders() });
    invToast('Loss reported');
    invCloseModal();
    invRender();
  } catch(e) { invToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// New Batch modal
function invShowNewBatch() {
  var body = invProductPickerHTML('invBatchProduct') +
    invLocationPickerHTML('invBatchLocation', 'Location') +
    '<div class="inv-form-group"><label>Quantity</label><input id="invBatchQty" type="number" class="inv-input" min="1" placeholder="Batch quantity" inputmode="numeric"></div>' +
    '<div class="inv-form-group"><label>Condition</label><select id="invBatchCondition" class="inv-select">' +
    '<option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option><option value="damaged">Damaged</option><option value="rejected">Rejected</option></select></div>' +
    '<div class="inv-form-group"><label>Source</label><input id="invBatchSource" type="text" class="inv-input" placeholder="e.g. Vendor name, PO#..."></div>' +
    '<div class="inv-form-group"><label>Notes (condition details, inspection notes)</label><textarea id="invBatchNotes" class="inv-input" rows="3" placeholder="Describe batch quality, issues, etc..."></textarea></div>';

  var footer = '<button class="inv-btn inv-btn-primary" onclick="invDoCreateBatch()"><i class="fas fa-layer-group"></i> Create Batch</button>';
  invShowModal('<i class="fas fa-layer-group"></i> New Batch', body, footer);
}

async function invDoCreateBatch() {
  var productId = parseInt(document.getElementById('invBatchProduct').value);
  var locationId = parseInt(document.getElementById('invBatchLocation').value);
  var qty = parseInt(document.getElementById('invBatchQty').value);
  var condition = document.getElementById('invBatchCondition').value;
  var source = document.getElementById('invBatchSource').value;
  var notes = document.getElementById('invBatchNotes').value;

  if (!productId || !locationId || !qty) { invToast('Fill in all required fields', 'warning'); return; }

  try {
    var resp = await invAPI.post('/api/inventory/batches', { product_id: productId, location_id: locationId, qty: qty, condition: condition, source: source, notes: notes }, { headers: invHeaders() });
    invToast('Batch created');
    invCloseModal();
    // Prompt to add a photo to the new batch
    var newBatchId = resp.data.batch_id || resp.data.id;
    if (newBatchId && confirm('Batch created! Want to add a photo?')) {
      invShowCaptureBatchImage(newBatchId);
    } else {
      invRender();
    }
  } catch(e) { invToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// Split Batch modal
function invShowSplitBatch(batchId, maxQty, batchNum, productName) {
  var body = '<p>Splitting batch <strong>' + escH(batchNum) + '</strong> (' + escH(productName) + ', ' + maxQty + ' units)</p>' +
    '<div class="inv-form-group"><label>Quantity to Split Off</label><input id="invSplitQty" type="number" class="inv-input" min="1" max="' + maxQty + '" placeholder="How many to split off?" inputmode="numeric"></div>' +
    '<div class="inv-form-group"><label>Condition of Split Portion</label><select id="invSplitCondition" class="inv-select">' +
    '<option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option><option value="damaged">Damaged</option><option value="rejected">Rejected</option></select></div>' +
    '<div class="inv-form-group"><label>Notes</label><textarea id="invSplitNotes" class="inv-input" rows="3" placeholder="Why is this being split? Condition details..."></textarea></div>';

  var footer = '<button class="inv-btn inv-btn-primary" onclick="invDoSplitBatch(' + batchId + ')"><i class="fas fa-scissors"></i> Split Batch</button>';
  invShowModal('<i class="fas fa-scissors"></i> Split Batch', body, footer);
}

async function invDoSplitBatch(batchId) {
  var qty = parseInt(document.getElementById('invSplitQty').value);
  var condition = document.getElementById('invSplitCondition').value;
  var notes = document.getElementById('invSplitNotes').value;

  if (!qty) { invToast('Enter a quantity', 'warning'); return; }

  try {
    await invAPI.post('/api/inventory/batches/' + batchId + '/split', { qty: qty, condition: condition, notes: notes }, { headers: invHeaders() });
    invToast('Batch split');
    invCloseModal();
    invRender();
  } catch(e) { invToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// New Hold modal
function invShowNewHold() {
  var body = invProductPickerHTML('invHoldProduct') +
    invLocationPickerHTML('invHoldLocation', 'Location') +
    '<div class="inv-form-group"><label>Quantity</label><input id="invHoldQty" type="number" class="inv-input" min="1" inputmode="numeric"></div>' +
    '<div class="inv-form-group"><label>Reason</label><select id="invHoldReason" class="inv-select">' +
    '<option value="manual">Manual hold</option><option value="order">Order hold</option><option value="route">Route loading</option><option value="transfer">Transfer</option></select></div>' +
    '<div class="inv-form-group"><label>Notes</label><textarea id="invHoldNotes" class="inv-input" rows="2"></textarea></div>';

  var footer = '<button class="inv-btn inv-btn-primary" onclick="invDoCreateHold()"><i class="fas fa-lock"></i> Place Hold</button>';
  invShowModal('<i class="fas fa-lock"></i> Place Hold', body, footer);
}

async function invDoCreateHold() {
  var productId = parseInt(document.getElementById('invHoldProduct').value);
  var locationId = parseInt(document.getElementById('invHoldLocation').value);
  var qty = parseInt(document.getElementById('invHoldQty').value);
  var reason = document.getElementById('invHoldReason').value;
  var notes = document.getElementById('invHoldNotes').value;

  if (!productId || !locationId || !qty) { invToast('Fill in all fields', 'warning'); return; }

  try {
    await invAPI.post('/api/inventory/holds', { product_id: productId, location_id: locationId, qty: qty, reason: reason, notes: notes }, { headers: invHeaders() });
    invToast('Hold placed');
    invCloseModal();
    invRender();
  } catch(e) { invToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// New Reservation modal
function invShowNewReservation() {
  var body = invProductPickerHTML('invResProduct') +
    invLocationPickerHTML('invResLocation', 'Location') +
    '<div class="inv-form-group"><label>Quantity</label><input id="invResQty" type="number" class="inv-input" min="1" inputmode="numeric"></div>' +
    '<div class="inv-form-group"><label>Customer (optional)</label><input id="invResCustomer" type="text" placeholder="Search customer..." class="inv-input" oninput="invSearchCustomers(this.value)">' +
    '<select id="invResCustomerId" class="inv-select"><option value="">— No customer —</option></select></div>' +
    '<div class="inv-form-group"><label>Notes</label><textarea id="invResNotes" class="inv-input" rows="2"></textarea></div>';

  var footer = '<button class="inv-btn inv-btn-primary" onclick="invDoCreateReservation()"><i class="fas fa-bookmark"></i> Reserve</button>';
  invShowModal('<i class="fas fa-bookmark"></i> Reserve Inventory', body, footer);
}

async function invSearchCustomers(term) {
  try {
    var resp = await invAPI.get('/api/customers?search=' + encodeURIComponent(term), { headers: invHeaders() });
    var sel = document.getElementById('invResCustomerId');
    sel.innerHTML = '<option value="">— No customer —</option>';
    (resp.data.customers || []).forEach(function(c) {
      sel.innerHTML += '<option value="' + c.id + '">' + c.business_name + '</option>';
    });
  } catch(e) {}
}

async function invDoCreateReservation() {
  var productId = parseInt(document.getElementById('invResProduct').value);
  var locationId = parseInt(document.getElementById('invResLocation').value);
  var qty = parseInt(document.getElementById('invResQty').value);
  var customerId = parseInt(document.getElementById('invResCustomerId').value) || null;
  var notes = document.getElementById('invResNotes').value;

  if (!productId || !locationId || !qty) { invToast('Fill in all fields', 'warning'); return; }

  try {
    await invAPI.post('/api/inventory/reservations', { product_id: productId, location_id: locationId, qty: qty, customer_id: customerId, notes: notes }, { headers: invHeaders() });
    invToast('Reservation created');
    invCloseModal();
    invRender();
  } catch(e) { invToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// ==================== BATCH IMAGES ====================

// Batch thumbnail cache — keyed by batch_id
var invBatchThumbs = {};

async function invLoadBatchThumbnails(batchIds) {
  if (!batchIds || batchIds.length === 0) return;
  try {
    var resp = await invAPI.post('/api/inventory/batch-images/thumbnails', { batch_ids: batchIds }, { headers: invHeaders() });
    var thumbs = resp.data.thumbnails || {};
    // Merge into cache
    Object.keys(thumbs).forEach(function(k) { invBatchThumbs[k] = thumbs[k]; });
  } catch(e) { console.error('Batch thumbnail load failed:', e); }
}

function invBatchThumbHTML(batchId, size) {
  size = size || 40;
  var thumb = invBatchThumbs[batchId];
  if (thumb) {
    return '<img src="' + thumb.image_data + '" class="inv-thumb" style="width:' + size + 'px;height:' + size + 'px;" alt="' + escH(thumb.caption || '') + '" onclick="event.stopPropagation();invShowBatchImages(' + batchId + ')">';
  }
  return '<div class="inv-thumb-empty" style="width:' + size + 'px;height:' + size + 'px;" onclick="event.stopPropagation();invShowCaptureBatchImage(' + batchId + ')" title="Add batch photo"><i class="fas fa-camera"></i></div>';
}

// Compress image client-side before upload
function invCompressImage(file, maxWidth, quality) {
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
        var dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Camera / file capture modal — scoped to a batch
function invShowCaptureBatchImage(batchId) {
  var body = '<div class="inv-img-capture">' +
    '<div class="inv-img-capture-zone" id="invCaptureZone">' +
    '<div class="inv-img-capture-placeholder" id="invCapturePlaceholder">' +
    '<i class="fas fa-camera"></i>' +
    '<p>Tap to take photo or choose file</p>' +
    '<div class="inv-img-capture-btns">' +
    '<label class="inv-btn inv-btn-primary inv-btn-sm"><i class="fas fa-camera"></i> Camera<input type="file" accept="image/*" capture="environment" id="invCameraInput" style="display:none" onchange="invPreviewBatchCapture(this)"></label>' +
    '<label class="inv-btn inv-btn-outline inv-btn-sm"><i class="fas fa-images"></i> Gallery<input type="file" accept="image/*" id="invFileInput" style="display:none" onchange="invPreviewBatchCapture(this)"></label>' +
    '</div>' +
    '</div>' +
    '<img id="invCapturePreview" class="inv-img-capture-preview" style="display:none">' +
    '</div>' +
    '<div class="inv-form-group"><label>Caption (optional)</label><input id="invImgCaption" type="text" class="inv-input" placeholder="e.g. Front of pallet, Damage close-up..."></div>' +
    '<input type="hidden" id="invImgBatchId" value="' + batchId + '">' +
    '</div>';

  var footer = '<button class="inv-btn inv-btn-primary" onclick="invDoUploadBatchImage()" id="invUploadBtn" disabled><i class="fas fa-cloud-arrow-up"></i> Upload Photo</button>';
  invShowModal('<i class="fas fa-camera"></i> Add Batch Photo', body, footer);
}

function invPreviewBatchCapture(input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  var preview = document.getElementById('invCapturePreview');
  var placeholder = document.getElementById('invCapturePlaceholder');
  var uploadBtn = document.getElementById('invUploadBtn');

  invCompressImage(file, 800, 0.7).then(function(dataUrl) {
    preview.src = dataUrl;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    uploadBtn.disabled = false;
    preview.dataset.imageData = dataUrl;
    var sizeKB = Math.round(dataUrl.length * 3 / 4 / 1024);
    invToast('Photo ready (' + sizeKB + ' KB)', 'success');
  }).catch(function() {
    invToast('Failed to process image', 'error');
  });
}

async function invDoUploadBatchImage() {
  var preview = document.getElementById('invCapturePreview');
  var imageData = preview.dataset.imageData;
  var batchId = parseInt(document.getElementById('invImgBatchId').value);
  var caption = document.getElementById('invImgCaption').value;

  if (!imageData || !batchId) { invToast('No image to upload', 'warning'); return; }

  var btn = document.getElementById('invUploadBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

  try {
    await invAPI.post('/api/inventory/batches/' + batchId + '/images', {
      image_data: imageData,
      caption: caption
    }, { headers: invHeaders() });

    invToast('Batch photo uploaded');
    invCloseModal();
    // Clear cache for this batch so it reloads
    delete invBatchThumbs[batchId];
    invRender();
  } catch(e) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-cloud-arrow-up"></i> Upload Photo';
    invToast('Upload failed: ' + (e.response?.data?.error || e.message), 'error');
  }
}

// Show all images for a batch (gallery view)
async function invShowBatchImages(batchId) {
  try {
    var resp = await invAPI.get('/api/inventory/batches/' + batchId + '/images', { headers: invHeaders() });
    var images = resp.data.images || [];

    if (images.length === 0) {
      invShowCaptureBatchImage(batchId);
      return;
    }

    var body = '<div class="inv-img-gallery">';
    for (var i = 0; i < images.length; i++) {
      var img = images[i];
      body += '<div class="inv-img-gallery-item" id="invGalleryItem_' + img.id + '">' +
        '<div class="inv-img-gallery-loading"><i class="fas fa-spinner fa-spin"></i></div>' +
        '<div class="inv-img-gallery-meta">' +
        '<span class="inv-muted">' + escH(img.caption || 'No caption') + '</span>' +
        '<span class="inv-muted">' + invFormatDateTime(img.created_at) + (img.taken_by_name ? ' by ' + escH(img.taken_by_name) : '') + '</span>' +
        '<button class="inv-btn inv-btn-xs inv-btn-danger" onclick="invDeleteBatchImage(' + img.id + ',' + batchId + ')"><i class="fas fa-trash"></i></button>' +
        '</div></div>';
    }
    body += '</div>';

    var footer = '<button class="inv-btn inv-btn-primary" onclick="invCloseModal();invShowCaptureBatchImage(' + batchId + ')"><i class="fas fa-plus"></i> Add Another Photo</button>';
    invShowModal('<i class="fas fa-images"></i> Batch Photos (' + images.length + ')', body, footer);

    // Lazy-load full image data for each gallery item
    images.forEach(function(img) {
      invAPI.get('/api/inventory/batch-images/' + img.id, { headers: invHeaders() }).then(function(r) {
        var item = document.getElementById('invGalleryItem_' + img.id);
        if (item && r.data.image) {
          var imgEl = document.createElement('img');
          imgEl.src = r.data.image.image_data;
          imgEl.className = 'inv-img-gallery-photo';
          imgEl.onclick = function() { invShowFullImage(r.data.image.image_data); };
          var loading = item.querySelector('.inv-img-gallery-loading');
          if (loading) loading.replaceWith(imgEl);
        }
      });
    });

  } catch(e) { invToast('Failed to load batch images', 'error'); }
}

function invShowFullImage(dataUrl) {
  var overlay = document.createElement('div');
  overlay.className = 'inv-fullimg-overlay';
  overlay.onclick = function() { overlay.remove(); };
  overlay.innerHTML = '<img src="' + dataUrl + '" class="inv-fullimg">' +
    '<button class="inv-fullimg-close"><i class="fas fa-times"></i></button>';
  document.body.appendChild(overlay);
  setTimeout(function() { overlay.classList.add('inv-fullimg-show'); }, 10);
}

async function invDeleteBatchImage(imageId, batchId) {
  if (!confirm('Delete this photo?')) return;
  try {
    await invAPI.delete('/api/inventory/batch-images/' + imageId, { headers: invHeaders() });
    invToast('Photo deleted');
    delete invBatchThumbs[batchId];
    invCloseModal();
    invShowBatchImages(batchId);
  } catch(e) { invToast('Delete failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// Product detail modal (no images — images are on batches)
async function invShowProductDetail(productId) {
  try {
    var resp = await invAPI.get('/api/inventory/stock/' + productId, { headers: invHeaders() });
    var stock = resp.data.stock || [];
    var batches = resp.data.batches || [];
    var holds = resp.data.holds || [];
    var reservations = resp.data.reservations || [];

    var pResp = await invAPI.get('/api/inventory/products/' + productId, { headers: invHeaders() });
    var product = pResp.data.product || null;
    var pName = product ? product.name : 'Product #' + productId;

    // Product info card
    var body = '';
    if (product) {
      var margin = product.price && product.cost ? (((product.price - product.cost) / product.price) * 100).toFixed(1) : '—';
      body += '<div class="inv-product-info-card">';
      body += '<div class="inv-product-info-row"><span class="inv-muted">SKU</span><strong>' + escH(product.sku || '—') + '</strong></div>';
      body += '<div class="inv-product-info-row"><span class="inv-muted">Category</span><span class="inv-cat-badge inv-cat-' + (product.category || 'other') + '">' + escH(product.category || 'other') + '</span></div>';
      body += '<div class="inv-product-info-row"><span class="inv-muted">Unit</span><span>' + escH(product.unit_type || 'each') + '</span></div>';
      body += '<div class="inv-product-info-row"><span class="inv-muted">Sell Price</span><strong style="color:#059669">$' + (product.price || 0).toFixed(2) + '</strong></div>';
      body += '<div class="inv-product-info-row"><span class="inv-muted">Cost</span><strong style="color:#DC2626">$' + (product.cost || 0).toFixed(2) + '</strong></div>';
      body += '<div class="inv-product-info-row"><span class="inv-muted">Margin</span><span>' + margin + '%</span></div>';
      body += '<div class="inv-product-info-row"><span class="inv-muted">Tax Rate</span><span>' + ((product.tax_rate || 0) * 100).toFixed(1) + '%</span></div>';
      body += '<div class="inv-product-info-row"><span class="inv-muted">Status</span><span class="inv-cat-badge ' + (product.active ? 'inv-cat-supplement' : 'inv-cat-other') + '">' + (product.active ? 'Active' : 'Inactive') + '</span></div>';
      body += '</div>';
    }

    body += '<h4 style="margin-top:16px">Stock by Location</h4>';
    if (stock.length === 0) {
      body += '<p class="inv-muted">No stock records for this product.</p>';
    } else {
      body += '<table class="inv-table inv-table-compact"><thead><tr><th>Location</th><th>On Hand</th><th>Hold</th><th>Reserved</th><th>Available</th></tr></thead><tbody>';
      stock.forEach(function(s) {
        var avail = (s.qty_on_hand || 0) - (s.qty_on_hold || 0) - (s.qty_reserved || 0);
        body += '<tr><td><span class="inv-loc-badge">' + escH(s.location_code) + '</span> ' + escH(s.location_name) + '</td>' +
          '<td><strong>' + s.qty_on_hand + '</strong></td><td>' + s.qty_on_hold + '</td><td>' + s.qty_reserved + '</td>' +
          '<td class="' + (avail <= 0 ? 'inv-danger' : '') + '"><strong>' + avail + '</strong></td></tr>';
      });
      body += '</tbody></table>';
    }

    if (batches.length > 0) {
      // Load batch thumbnails
      var batchIds = batches.map(function(b) { return b.id; });
      await invLoadBatchThumbnails(batchIds);

      body += '<h4 style="margin-top:16px">Batches</h4><table class="inv-table inv-table-compact"><thead><tr><th style="width:48px"></th><th>Batch</th><th>Loc</th><th>Qty</th><th>Condition</th><th>Notes</th></tr></thead><tbody>';
      batches.forEach(function(b) {
        body += '<tr>' +
          '<td>' + invBatchThumbHTML(b.id, 36) + '</td>' +
          '<td>' + escH(b.batch_number) + '</td><td>' + escH(b.location_code) + '</td><td>' + b.qty + '</td><td><span class="inv-cond-badge inv-cond-' + (b.condition === 'good' ? 'good' : b.condition === 'fair' ? 'fair' : 'bad') + '">' + b.condition + '</span></td><td class="inv-muted">' + escH(b.notes || '') + '</td></tr>';
      });
      body += '</tbody></table>';
    }

    if (holds.length > 0) {
      body += '<h4 style="margin-top:16px">Active Holds</h4>';
      holds.forEach(function(h) {
        body += '<div class="inv-detail-item"><span class="inv-hold-badge">' + h.qty + ' held</span> at ' + escH(h.location_name) + ' — ' + escH(h.reason) + '</div>';
      });
    }

    if (reservations.length > 0) {
      body += '<h4 style="margin-top:16px">Active Reservations</h4>';
      reservations.forEach(function(r) {
        body += '<div class="inv-detail-item"><span class="inv-res-badge">' + r.qty + ' reserved</span> at ' + escH(r.location_name) + (r.customer_name ? ' for ' + escH(r.customer_name) : '') + (r.order_number ? ' (Order ' + escH(r.order_number) + ')' : '') + '</div>';
      });
    }

    var footer = '<button class="inv-btn inv-btn-primary" onclick="invCloseModal();invShowEditProduct(' + productId + ')"><i class="fas fa-pen"></i> Edit Product</button>';
    invShowModal('<i class="fas fa-box"></i> ' + escH(pName), body, footer);

  } catch(e) { invToast('Failed to load product detail', 'error'); }
}

// ==================== INIT STOCK ====================
async function invInitStock(locationId) {
  if (!confirm('Initialize stock at this location from the products catalog? This imports current stock_quantity values.')) return;
  try {
    var resp = await invAPI.post('/api/inventory/init-stock', { location_id: locationId }, { headers: invHeaders() });
    invToast(resp.data.products_initialized + ' products initialized');
    invRender();
  } catch(e) { invToast('Init failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// ==================== EXPORT ====================
function invExportStock() {
  var csv = 'Product,SKU,Category,Location,On Hand,On Hold,Reserved,Available,Sell Price,Cost,Value\n';
  invStockData.forEach(function(s) {
    var avail = (s.qty_on_hand || 0) - (s.qty_on_hold || 0) - (s.qty_reserved || 0);
    csv += '"' + (s.product_name || '') + '","' + (s.sku || '') + '","' + (s.category || '') + '","' + (s.location_name || '') + '",' +
      (s.qty_on_hand || 0) + ',' + (s.qty_on_hold || 0) + ',' + (s.qty_reserved || 0) + ',' + avail + ',' +
      (s.price || 0) + ',' + (s.cost || 0) + ',' + ((s.qty_on_hand || 0) * (s.cost || s.price || 0)).toFixed(2) + '\n';
  });
  var blob = new Blob([csv], { type: 'text/csv' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'inventory-stock-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  invToast('Stock exported');
}

// ==================== UTILITIES ====================
function escH(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function invFormatDate(d) {
  if (!d) return '—';
  try { return dayjs(d).format('MMM D, YYYY'); } catch(e) { return d; }
}

function invFormatDateTime(d) {
  if (!d) return '—';
  try { return dayjs(d).format('MMM D, h:mm A'); } catch(e) { return d; }
}

var invSearchTimer = null;
function invDebounceSearch() {
  clearTimeout(invSearchTimer);
  invSearchTimer = setTimeout(function() { invRender(); }, 300);
}

// ==================== PRODUCTS MANAGEMENT PAGE ====================

var invProdSearchTimer = null;
function invDebounceProductSearch() {
  clearTimeout(invProdSearchTimer);
  invProdSearchTimer = setTimeout(function() { invProductsOffset = 0; invRender(); }, 300);
}

async function invRenderProductsPage() {
  // Load products with search/filter/pagination
  var search = '';
  var cat = '';
  var searchEl = document.getElementById('invProdSearchInput');
  var catEl = document.getElementById('invProdCategoryFilter');
  if (searchEl) search = searchEl.value;
  if (catEl) cat = catEl.value;

  var url = '/api/inventory/products?limit=50&offset=' + invProductsOffset;
  if (search) url += '&search=' + encodeURIComponent(search);
  if (cat) url += '&category=' + cat;
  url += '&include_inactive=1';

  try {
    var resp = await invAPI.get(url, { headers: invHeaders() });
    invProductsPageData = resp.data.products || [];
    invProductsTotal = resp.data.total || 0;
  } catch(e) {
    invProductsPageData = [];
    invProductsTotal = 0;
  }

  var html = '<div class="inv-stock-page">';

  // Toolbar
  html += '<div class="inv-toolbar">';
  html += '<div class="inv-search-box"><i class="fas fa-search"></i><input id="invProdSearchInput" type="text" placeholder="Search products..." value="' + escH(search) + '" oninput="invDebounceProductSearch()"></div>';
  html += '<select id="invProdCategoryFilter" onchange="invProductsOffset=0;invRender()" class="inv-select"><option value="">All Categories</option>';
  (invCategoryList || []).forEach(function(c) {
    var label = c.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
    html += '<option value="' + c + '"' + (cat === c ? ' selected' : '') + '>' + label + '</option>';
  });
  html += '</select>';
  html += '<button class="inv-btn inv-btn-primary inv-btn-sm" onclick="invShowNewProduct()"><i class="fas fa-plus"></i> New Product</button>';
  html += '</div>';

  html += '<div class="inv-stock-count">' + invProductsTotal + ' products (showing ' + invProductsPageData.length + ')</div>';

  // Products table (desktop)
  html += '<div class="inv-table-wrap inv-desktop-only"><table class="inv-table inv-table-hover">';
  html += '<thead><tr><th>Name</th><th>SKU</th><th>Category</th><th>Unit</th><th class="text-right">Sell Price</th><th class="text-right">Cost</th><th class="text-right">Margin</th><th>Status</th><th></th></tr></thead><tbody>';

  invProductsPageData.forEach(function(p) {
    var margin = p.price && p.cost ? (((p.price - p.cost) / p.price) * 100).toFixed(1) + '%' : '—';
    html += '<tr class="' + (!p.active ? 'inv-row-inactive' : '') + '">' +
      '<td class="inv-clickable" onclick="invShowProductDetail(' + p.id + ')"><strong>' + escH(p.name) + '</strong></td>' +
      '<td class="inv-muted">' + escH(p.sku || '—') + '</td>' +
      '<td><span class="inv-cat-badge inv-cat-' + (p.category || 'other') + '">' + escH(p.category || 'other') + '</span></td>' +
      '<td>' + escH(p.unit_type || 'each') + '</td>' +
      '<td class="text-right">$' + (p.price || 0).toFixed(2) + '</td>' +
      '<td class="text-right inv-muted">$' + (p.cost || 0).toFixed(2) + '</td>' +
      '<td class="text-right">' + margin + '</td>' +
      '<td>' + (p.active ? '<span class="inv-cat-badge inv-cat-supplement">Active</span>' : '<span class="inv-cat-badge inv-cat-other">Inactive</span>') + '</td>' +
      '<td><button class="inv-btn inv-btn-xs" onclick="invShowEditProduct(' + p.id + ')" title="Edit"><i class="fas fa-pen"></i></button></td>' +
      '</tr>';
  });
  html += '</tbody></table></div>';

  // Mobile cards
  html += '<div class="inv-mobile-only inv-stock-cards">';
  invProductsPageData.forEach(function(p) {
    var margin = p.price && p.cost ? (((p.price - p.cost) / p.price) * 100).toFixed(1) + '%' : '—';
    html += '<div class="inv-stock-card' + (!p.active ? ' inv-card-inactive' : '') + '" onclick="invShowProductDetail(' + p.id + ')">' +
      '<div class="inv-stock-card-top">' +
      '<div><strong>' + escH(p.name) + '</strong><br><span class="inv-muted">' + escH(p.sku || '') + ' · ' + escH(p.category || 'other') + '</span></div>' +
      (p.active ? '' : '<span class="inv-cat-badge inv-cat-other">Inactive</span>') +
      '</div>' +
      '<div class="inv-stock-card-nums">' +
      '<div><span class="inv-muted">Sell</span><strong>$' + (p.price || 0).toFixed(2) + '</strong></div>' +
      '<div><span class="inv-muted">Cost</span><span>$' + (p.cost || 0).toFixed(2) + '</span></div>' +
      '<div><span class="inv-muted">Margin</span><span>' + margin + '</span></div>' +
      '<div><span class="inv-muted">Unit</span><span>' + escH(p.unit_type || 'each') + '</span></div>' +
      '</div>' +
      '<div class="inv-stock-card-actions">' +
      '<button class="inv-btn inv-btn-xs inv-btn-primary" onclick="event.stopPropagation();invShowEditProduct(' + p.id + ')"><i class="fas fa-pen"></i> Edit</button>' +
      '</div></div>';
  });
  html += '</div>';

  // Pagination
  if (invProductsTotal > 50) {
    var totalPages = Math.ceil(invProductsTotal / 50);
    var currentPage = Math.floor(invProductsOffset / 50) + 1;
    html += '<div class="inv-pagination">';
    if (invProductsOffset > 0) {
      html += '<button class="inv-btn inv-btn-sm inv-btn-outline" onclick="invProductsOffset=Math.max(0,invProductsOffset-50);invRender()"><i class="fas fa-chevron-left"></i> Prev</button>';
    }
    html += '<span class="inv-muted" style="margin:0 12px">Page ' + currentPage + ' of ' + totalPages + '</span>';
    if (invProductsOffset + 50 < invProductsTotal) {
      html += '<button class="inv-btn inv-btn-sm inv-btn-outline" onclick="invProductsOffset+=50;invRender()">Next <i class="fas fa-chevron-right"></i></button>';
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}

// ==================== EDIT PRODUCT MODAL ====================

async function invShowEditProduct(productId) {
  try {
    var resp = await invAPI.get('/api/inventory/products/' + productId, { headers: invHeaders() });
    var p = resp.data.product;
    if (!p) { invToast('Product not found', 'error'); return; }

    var catOpts = '';
    (invCategoryList || []).forEach(function(c) {
      var label = c.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
      catOpts += '<option value="' + c + '"' + (p.category === c ? ' selected' : '') + '>' + label + '</option>';
    });

    var unitOpts = '';
    ['each','bag','bale','bottle','tub','tube','gallon','box','case','roll','pair','set','lb','oz','bar'].forEach(function(u) {
      unitOpts += '<option value="' + u + '"' + (p.unit_type === u ? ' selected' : '') + '>' + u + '</option>';
    });

    var body = '<div class="inv-edit-form">';
    body += '<div class="inv-form-row">';
    body += '<div class="inv-form-group" style="flex:2"><label>Product Name</label><input type="text" class="inv-input" id="invEditName" value="' + escH(p.name) + '"></div>';
    body += '<div class="inv-form-group" style="flex:1"><label>SKU</label><input type="text" class="inv-input" id="invEditSku" value="' + escH(p.sku || '') + '"></div>';
    body += '</div>';

    body += '<div class="inv-form-row">';
    body += '<div class="inv-form-group"><label>Category</label><select class="inv-select" id="invEditCategory">' + catOpts + '</select></div>';
    body += '<div class="inv-form-group"><label>Unit Type</label><select class="inv-select" id="invEditUnit">' + unitOpts + '</select></div>';
    body += '<div class="inv-form-group"><label>Status</label><select class="inv-select" id="invEditActive"><option value="1"' + (p.active ? ' selected' : '') + '>Active</option><option value="0"' + (!p.active ? ' selected' : '') + '>Inactive</option></select></div>';
    body += '</div>';

    body += '<div class="inv-form-row">';
    body += '<div class="inv-form-group"><label>Sell Price ($)</label><input type="number" step="0.01" class="inv-input" id="invEditPrice" value="' + (p.price || 0) + '"></div>';
    body += '<div class="inv-form-group"><label>Cost ($)</label><input type="number" step="0.01" class="inv-input" id="invEditCost" value="' + (p.cost || 0) + '"></div>';
    body += '<div class="inv-form-group"><label>Tax Rate</label><input type="number" step="0.01" class="inv-input" id="invEditTaxRate" value="' + (p.tax_rate || 0) + '" placeholder="e.g. 0.07 = 7%"></div>';
    body += '</div>';

    // Margin preview
    if (p.price && p.cost) {
      var marginPct = (((p.price - p.cost) / p.price) * 100).toFixed(1);
      var marginAmt = (p.price - p.cost).toFixed(2);
      body += '<div class="inv-margin-preview" id="invMarginPreview"><i class="fas fa-chart-pie"></i> Margin: $' + marginAmt + ' (' + marginPct + '%)</div>';
    } else {
      body += '<div class="inv-margin-preview" id="invMarginPreview"><i class="fas fa-chart-pie"></i> Margin: —</div>';
    }

    body += '<div class="inv-form-row">';
    body += '<div class="inv-form-group"><label>Weight per Unit (lbs)</label><input type="number" step="0.1" class="inv-input" id="invEditWeight" value="' + (p.weight_per_unit || 0) + '"></div>';
    body += '<div class="inv-form-group"><label>Pallet Qty</label><input type="number" class="inv-input" id="invEditPalletQty" value="' + (p.pallet_qty || 0) + '"></div>';
    body += '</div>';
    body += '</div>';

    var footer = '<button class="inv-btn inv-btn-outline" onclick="invCloseModal()">Cancel</button>' +
      '<button class="inv-btn inv-btn-primary" onclick="invSaveProduct(' + productId + ')"><i class="fas fa-save"></i> Save Changes</button>';

    invShowModal('<i class="fas fa-pen"></i> Edit Product — ' + escH(p.name), body, footer);

    // Live margin preview update
    setTimeout(function() {
      var priceEl = document.getElementById('invEditPrice');
      var costEl = document.getElementById('invEditCost');
      if (priceEl && costEl) {
        var updateMargin = function() {
          var price = parseFloat(priceEl.value) || 0;
          var cost = parseFloat(costEl.value) || 0;
          var preview = document.getElementById('invMarginPreview');
          if (preview && price > 0) {
            var m = (((price - cost) / price) * 100).toFixed(1);
            var a = (price - cost).toFixed(2);
            preview.innerHTML = '<i class="fas fa-chart-pie"></i> Margin: $' + a + ' (' + m + '%)';
            preview.style.color = (price - cost) > 0 ? '#059669' : '#DC2626';
          }
        };
        priceEl.oninput = updateMargin;
        costEl.oninput = updateMargin;
      }
    }, 100);

  } catch(e) { invToast('Failed to load product: ' + (e.response?.data?.error || e.message), 'error'); }
}

async function invSaveProduct(productId) {
  var data = {
    name: document.getElementById('invEditName').value.trim(),
    sku: document.getElementById('invEditSku').value.trim() || null,
    category: document.getElementById('invEditCategory').value,
    unit_type: document.getElementById('invEditUnit').value,
    active: parseInt(document.getElementById('invEditActive').value),
    price: parseFloat(document.getElementById('invEditPrice').value) || 0,
    cost: parseFloat(document.getElementById('invEditCost').value) || 0,
    tax_rate: parseFloat(document.getElementById('invEditTaxRate').value) || 0,
    weight_per_unit: parseFloat(document.getElementById('invEditWeight').value) || 0,
    pallet_qty: parseInt(document.getElementById('invEditPalletQty').value) || 0
  };

  if (!data.name) { invToast('Product name is required', 'error'); return; }

  try {
    await invAPI.put('/api/inventory/products/' + productId, data, { headers: invHeaders() });
    invToast('Product updated successfully');
    invCloseModal();
    invRender();
  } catch(e) { invToast('Save failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// ==================== NEW PRODUCT MODAL ====================

function invShowNewProduct() {
  var catOpts = '';
  (invCategoryList || []).forEach(function(c) {
    var label = c.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
    catOpts += '<option value="' + c + '"' + (c === 'other' ? ' selected' : '') + '>' + label + '</option>';
  });

  var unitOpts = '';
  ['each','bag','bale','bottle','tub','tube','gallon','box','case','roll','pair','set','lb','oz','bar'].forEach(function(u) {
    unitOpts += '<option value="' + u + '"' + (u === 'each' ? ' selected' : '') + '>' + u + '</option>';
  });

  var body = '<div class="inv-edit-form">';
  body += '<div class="inv-form-row">';
  body += '<div class="inv-form-group" style="flex:2"><label>Product Name *</label><input type="text" class="inv-input" id="invNewName" placeholder="Enter product name"></div>';
  body += '<div class="inv-form-group" style="flex:1"><label>SKU</label><input type="text" class="inv-input" id="invNewSku" placeholder="Optional"></div>';
  body += '</div>';
  body += '<div class="inv-form-row">';
  body += '<div class="inv-form-group"><label>Category</label><select class="inv-select" id="invNewCategory">' + catOpts + '</select></div>';
  body += '<div class="inv-form-group"><label>Unit Type</label><select class="inv-select" id="invNewUnit">' + unitOpts + '</select></div>';
  body += '</div>';
  body += '<div class="inv-form-row">';
  body += '<div class="inv-form-group"><label>Sell Price ($)</label><input type="number" step="0.01" class="inv-input" id="invNewPrice" value="0"></div>';
  body += '<div class="inv-form-group"><label>Cost ($)</label><input type="number" step="0.01" class="inv-input" id="invNewCost" value="0"></div>';
  body += '<div class="inv-form-group"><label>Tax Rate</label><input type="number" step="0.01" class="inv-input" id="invNewTaxRate" value="0" placeholder="e.g. 0.07"></div>';
  body += '</div>';
  body += '<div class="inv-form-row">';
  body += '<div class="inv-form-group"><label>Weight per Unit (lbs)</label><input type="number" step="0.1" class="inv-input" id="invNewWeight" value="0"></div>';
  body += '<div class="inv-form-group"><label>Pallet Qty</label><input type="number" class="inv-input" id="invNewPalletQty" value="0"></div>';
  body += '</div>';
  body += '</div>';

  var footer = '<button class="inv-btn inv-btn-outline" onclick="invCloseModal()">Cancel</button>' +
    '<button class="inv-btn inv-btn-primary" onclick="invCreateProduct()"><i class="fas fa-plus"></i> Create Product</button>';

  invShowModal('<i class="fas fa-plus"></i> New Product', body, footer);
}

async function invCreateProduct() {
  var data = {
    name: document.getElementById('invNewName').value.trim(),
    sku: document.getElementById('invNewSku').value.trim() || null,
    category: document.getElementById('invNewCategory').value,
    unit_type: document.getElementById('invNewUnit').value,
    price: parseFloat(document.getElementById('invNewPrice').value) || 0,
    cost: parseFloat(document.getElementById('invNewCost').value) || 0,
    tax_rate: parseFloat(document.getElementById('invNewTaxRate').value) || 0,
    weight_per_unit: parseFloat(document.getElementById('invNewWeight').value) || 0,
    pallet_qty: parseInt(document.getElementById('invNewPalletQty').value) || 0
  };

  if (!data.name) { invToast('Product name is required', 'error'); return; }

  try {
    var resp = await invAPI.post('/api/inventory/products', data, { headers: invHeaders() });
    invToast('Product "' + data.name + '" created');
    invCloseModal();
    invRender();
  } catch(e) { invToast('Create failed: ' + (e.response?.data?.error || e.message), 'error'); }
}
