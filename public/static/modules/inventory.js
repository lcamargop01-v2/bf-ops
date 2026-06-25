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
var invCountCategory = ''; // Quick Count category filter
var invCountSort = 'name'; // Quick Count sort: name, category, sku, qty, last_counted
var invRecatData = null; // Recategorize preview data
var invRecatOverrides = {}; // User overrides { product_id: category }
var invRecatFilter = ''; // Filter: '', 'changed', 'hay', 'shavings', 'grain', 'shelf_goods'
var invRecatSearch = '';
var invSuppliersList = []; // Cached suppliers for vendor picker
var invBatchSummaryMap = {}; // batch summary per product_id for count page
var invStockSearch = ''; // persisted stock search across re-renders
var invStockCatFilter = ''; // persisted category filter across re-renders
var invShowInactive = false; // toggle for showing inactive products
var invShowAllProducts = false; // toggle for showing all products including those without stock rows

// Barcode scanner state for quick count
var invScanBuffer = '';
var invScanLastKey = 0;
var invScanTimer = null;
var invScanListenerBound = false;

// Auto-save state for quick count
var invCountAutoSaveTimers = {}; // idx -> timeout
var invCountSavedCount = 0; // how many saved this session

// Permission helper for edit access (view-only enforcement)
function invCanEdit(feature) {
  var fn = typeof window.canEdit === 'function' ? window.canEdit : function() { return true; };
  return fn('inventory', feature || invPage);
}

// Permission helper for financial data visibility
function invCanViewFin() {
  var fn = typeof window.canViewFinancials === 'function' ? window.canViewFinancials : function() { return true; };
  return fn();
}

// Permission helper for pricing edit access (price, cost, tax_rate)
function invCanEditPricing() {
  var fn = typeof window.canEdit === 'function' ? window.canEdit : function() { return true; };
  return fn('inventory', 'pricing');
}

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
  // Consume initial page from parent shell
  if (window._shellInitialPage) {
    var _ca = typeof window.canAccess === 'function' ? window.canAccess : function() { return true; };
    if (_ca('inventory', window._shellInitialPage)) invPage = window._shellInitialPage;
    window._shellInitialPage = null;
  }
  Promise.all([invLoadLocations(), invLoadCategories(), invLoadSuppliers()]).then(function() {
    console.log('[Inventory] locations loaded:', invLocations.length, ', categories:', invCategoryList.length, ', suppliers:', invSuppliersList.length, '— rendering');
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
  // Remove barcode scanner listener
  if (invScanListenerBound) {
    document.removeEventListener('keydown', invHandleScanKeydown);
    invScanListenerBound = false;
  }
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
    invCategoryList = ['hay','shavings','grain','shelf_goods'];
  }
}

async function invLoadSuppliers() {
  try {
    var resp = await invAPI.get('/api/purchasing/suppliers', { headers: invHeaders() });
    invSuppliersList = (resp.data.suppliers || []).filter(function(s) { return s.active; });
  } catch(e) { invSuppliersList = []; }
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
    // Use persisted search state (DOM may be destroyed by loading spinner)
    var search = document.getElementById('invSearchInput');
    var searchVal = (search && search.value) ? search.value : invStockSearch;
    if (searchVal) url += 'search=' + encodeURIComponent(searchVal) + '&';
    // Category filter — from stock page dropdown or count page state
    var cat = document.getElementById('invCategoryFilter');
    var catVal = (cat && cat.value) ? cat.value : invStockCatFilter;
    if (catVal) url += 'category=' + catVal + '&';
    else if (invPage === 'count' && invCountCategory) url += 'category=' + encodeURIComponent(invCountCategory) + '&';
    // Sort — from count page state
    if (invPage === 'count' && invCountSort) url += 'sort=' + invCountSort + '&';
    // Include inactive products
    if (invShowInactive) url += 'include_inactive=1&';
    // Quick Count OR stock page "Show All": include ALL active products even with no stock row
    if (invPage === 'count' || (invPage === 'stock' && invShowAllProducts)) url += 'include_all_products=1&';
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
  // Update shell bottom nav
  if (typeof window.shellSetSubPage === 'function') window.shellSetSubPage(page);
}

// ==================== MAIN RENDER ====================
async function invRender() {
  var root = document.getElementById('inventory-app');
  if (!root) { console.warn('[Inventory] #inventory-app not found, aborting render'); return; }

  // Set view-only mode class based on permissions
  var _ce = typeof window.canEdit === 'function' ? window.canEdit : function() { return true; };
  var _editMode = _ce('inventory', invPage);
  root.classList.toggle('inv-view-only', !_editMode);

  // Save search/filter state BEFORE wiping the DOM
  var _si = document.getElementById('invSearchInput');
  if (_si) invStockSearch = _si.value;
  var _ci = document.getElementById('invCategoryFilter');
  if (_ci) invStockCatFilter = _ci.value;

  root.innerHTML = '<div class="inv-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
  console.log('[Inventory] rendering page:', invPage);

  // Remove barcode scanner listener when leaving count page
  if (invPage !== 'count' && invScanListenerBound) {
    document.removeEventListener('keydown', invHandleScanKeydown);
    invScanListenerBound = false;
  }

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
    invCountSavedCount = 0; // Reset saved counter for new count session
    invCountAutoSaveTimers = {}; // Clear any pending timers
    await invLoadStock();
    // Load batch summary for current location
    if (invSelectedLocation) {
      try {
        var bsResp = await invAPI.get('/api/inventory/batch-summary?location_id=' + invSelectedLocation, { headers: invHeaders() });
        invBatchSummaryMap = bsResp.data.summary || {};
      } catch(e) { invBatchSummaryMap = {}; }
    }
    root.innerHTML = invRenderNav() + invRenderQuickCount();
    // Attach barcode scanner listener for quick count page
    if (!invScanListenerBound) {
      invScanListenerBound = true;
      document.addEventListener('keydown', invHandleScanKeydown);
    }
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
  } else if (invPage === 'audit') {
    root.innerHTML = invRenderNav() + '<div class="inv-loading"><i class="fas fa-spinner fa-spin"></i></div>';
    var html = await invRenderAuditLog();
    root.innerHTML = invRenderNav() + html;
  } else if (invPage === 'smart_restock') {
    root.innerHTML = invRenderNav() + '<div class="inv-loading"><i class="fas fa-spinner fa-spin"></i> Analyzing demand patterns...</div>';
    var html = await invRenderSmartRestock();
    root = document.getElementById('inventory-app'); if (!root) return;
    root.innerHTML = invRenderNav() + html;
  } else if (invPage === 'categories') {
    root.innerHTML = invRenderNav() + '<div class="inv-loading"><i class="fas fa-spinner fa-spin"></i> Analyzing products...</div>';
    var html = await invRenderCategoriesPage();
    root = document.getElementById('inventory-app'); if (!root) return;
    root.innerHTML = invRenderNav() + html;
  } else if (invPage === 'snapshots') {
    root.innerHTML = invRenderNav() + '<div class="inv-loading"><i class="fas fa-spinner fa-spin"></i> Loading snapshots...</div>';
    var html = await invRenderSnapshotsPage();
    root = document.getElementById('inventory-app'); if (!root) return;
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
    { id: 'smart_restock', icon: 'fa-wand-magic-sparkles', label: 'Smart Restock' },
    { id: 'batches', icon: 'fa-layer-group', label: 'Batches' },
    { id: 'losses', icon: 'fa-triangle-exclamation', label: 'Losses' },

    { id: 'audit', icon: 'fa-clock-rotate-left', label: 'Audit Log' },
    { id: 'snapshots', icon: 'fa-camera', label: 'Snapshots' },
    { id: 'categories', icon: 'fa-wand-magic-sparkles', label: 'Categories' }
  ];
  // Filter by role permissions
  var _ca = typeof window.canAccess === 'function' ? window.canAccess : function() { return true; };
  pages = pages.filter(function(p) { return _ca('inventory', p.id); });

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
    '</div>' +
    (!(typeof window.canEdit === 'function' ? window.canEdit : function(){return true;})('inventory', invPage) ? '<div style="background:#FEF3C7;color:#92400E;padding:6px 16px;font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;border-bottom:1px solid #FDE68A"><i class="fas fa-eye"></i> View Only — You don\'t have edit access to this page</div>' : '');
}

// ==================== DASHBOARD ====================
function invRenderDashboard() {
  var s = invSummary;
  var _showFin = invCanViewFin();
  var cards = [
    { icon: 'fa-boxes-stacked', label: 'Total Products', value: s.total_products || 0, color: '#059669' },
    { icon: 'fa-cubes', label: 'Total Units', value: (s.total_units || 0).toLocaleString(), color: '#2563EB' },
    { icon: 'fa-dollar-sign', label: 'Total Value', value: _showFin ? '$' + (s.total_value || 0).toLocaleString(undefined, {minimumFractionDigits:2}) : '—', color: '#7C3AED', hidden: !_showFin },
    { icon: 'fa-triangle-exclamation', label: 'Low Stock', value: s.low_stock || 0, color: s.low_stock > 0 ? '#DC2626' : '#6B7280' },
    { icon: 'fa-lock', label: 'On Hold', value: (s.on_hold || 0).toLocaleString(), color: '#D97706' },
    { icon: 'fa-bookmark', label: 'Reserved', value: (s.reserved || 0).toLocaleString(), color: '#0891B2' },
    { icon: 'fa-truck-loading', label: 'Incoming', value: (s.total_incoming || 0).toLocaleString(), color: '#059669' },
    { icon: 'fa-truck-ramp-box', label: 'Active Transfers', value: s.active_transfers || 0, color: '#4F46E5' },
    { icon: 'fa-chart-line-down', label: 'Losses (30d)', value: s.losses_30d || 0, color: s.losses_30d > 0 ? '#DC2626' : '#6B7280' }
  ];
  cards = cards.filter(function(c) { return !c.hidden; });

  var html = '<div class="inv-dashboard">';
  html += '<div class="inv-cards-grid">';
  cards.forEach(function(card) {
    html += '<div class="inv-stat-card" onclick="' +
      (card.label === 'Low Stock' ? "invNav('stock')" :
       card.label === 'Active Transfers' ? "invNav('transfers')" :
       card.label === 'Losses (30d)' ? "invNav('losses')" :
       card.label === 'On Hold' ? "invNav('stock')" :
       card.label === 'Reserved' ? "invNav('stock')" : '') + '">' +
      '<div class="inv-stat-icon" style="background:' + card.color + '20;color:' + card.color + '"><i class="fas ' + card.icon + '"></i></div>' +
      '<div class="inv-stat-info"><div class="inv-stat-value">' + card.value + '</div><div class="inv-stat-label">' + card.label + '</div></div>' +
      '</div>';
  });
  html += '</div>';

  // Quick actions — only show if user has edit access to dashboard
  if (invCanEdit('dashboard')) {
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
  }

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
        (_showFin ? '<div><strong>$' + l.value.toLocaleString(undefined, {minimumFractionDigits:2}) + '</strong></div>' : '') +
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
    html += '<thead><tr><th>Product</th><th>Location</th><th class="text-right">On Hand</th><th class="text-right">Available</th>' + (_showFin ? '<th class="text-right">Value</th>' : '') + '</tr></thead><tbody>';
    sorted.slice(0, 15).forEach(function(s) {
      var avail = (s.qty_on_hand || 0) - (s.qty_on_hold || 0) - (s.qty_reserved || 0);
      html += '<tr onclick="invShowProductDetail(' + s.product_id + ')" class="inv-clickable">' +
        '<td><strong>' + escH(s.product_name) + '</strong><br><span class="inv-muted">' + escH(s.sku || '') + ' · ' + escH(s.category || '') + '</span></td>' +
        '<td><span class="inv-loc-badge">' + escH(s.location_code) + '</span></td>' +
        '<td class="text-right">' + (s.qty_on_hand || 0).toLocaleString() + ' <span class="inv-muted">' + escH(s.unit_type || '') + '</span></td>' +
        '<td class="text-right' + (avail <= 0 ? ' inv-danger' : '') + '">' + avail.toLocaleString() + '</td>' +
        (_showFin ? '<td class="text-right">$' + ((s.qty_on_hand || 0) * (s.price || 0)).toLocaleString(undefined, {minimumFractionDigits:2}) + '</td>' : '') +
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

  // Admin tools
  if (typeof window.currentUser !== 'undefined' && window.currentUser && window.currentUser.role === 'admin') {
    html += '<div class="inv-section" style="margin-top:16px;border-top:1px solid #E5E7EB;padding-top:16px">';
    html += '<h3 class="inv-section-title"><i class="fas fa-tools" style="color:#6B7280"></i> Admin Tools</h3>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    html += '<button class="inv-btn inv-btn-sm inv-btn-outline" onclick="invRecalculateHolds()" title="Recalculate qty_on_hold and qty_reserved from actual pending orders. Fixes drift from cancelled/modified orders."><i class="fas fa-calculator"></i> Recalculate Holds</button>';
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
  html += '<div class="inv-search-box"><i class="fas fa-search"></i><input id="invSearchInput" type="text" placeholder="Search products..." value="' + escH(invStockSearch) + '" oninput="invDebounceSearch()"></div>';
  html += '<select id="invCategoryFilter" onchange="invRender()" class="inv-select"><option value="">All Categories</option>';
  (invCategoryList || []).forEach(function(c) {
    var label = c.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
    html += '<option value="' + c + '"' + (invStockCatFilter === c ? ' selected' : '') + '>' + label + '</option>';
  });
  html += '</select>';
  if (invSelectedLocation) html += '<label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#B45309;cursor:pointer;white-space:nowrap;font-weight:' + (invShowAllProducts ? '700' : '400') + '"><input type="checkbox" ' + (invShowAllProducts ? 'checked' : '') + ' onchange="invShowAllProducts=this.checked;invRender()"> <i class="fas fa-boxes-packing"></i> Show All Products</label>';
  html += '<label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#64748B;cursor:pointer;white-space:nowrap"><input type="checkbox" ' + (invShowInactive ? 'checked' : '') + ' onchange="invShowInactive=this.checked;invRender()"> Inactive</label>';
  html += '<button class="inv-btn inv-btn-sm inv-btn-outline" onclick="invExportStock()"><i class="fas fa-download"></i> Export</button>';
  html += '</div>';

  html += '<div id="invStockListArea">';
  html += invRenderStockRows();
  html += '</div>';
  html += '</div>';
  return html;
}

function invRenderStockRows() {
  var _oos = 0, _noRow = 0;
  if (invShowAllProducts) invStockData.forEach(function(s) { if (s.no_stock_row) _noRow++; else if ((s.qty_on_hand || 0) === 0) _oos++; });
  var html = '<div class="inv-stock-count">' + invStockData.length + ' items' + (invShowInactive ? ' (incl. inactive)' : '') + (invShowAllProducts && _noRow > 0 ? ' &bull; <span style="color:#1D4ED8">' + _noRow + ' not in stock</span>' : '') + (invShowAllProducts && _oos > 0 ? ' &bull; <span style="color:#B45309">' + _oos + ' out of stock</span>' : '') + '</div>';
  var _sf = invCanViewFin();
  var _se = invCanEdit('stock');
  var _sp = invCanEditPricing();
  var _sfp = _sf || _sp;
  html += '<div class="inv-table-wrap inv-desktop-only"><table class="inv-table inv-table-hover">';
  html += '<thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Vendor</th><th>Location</th><th class="text-right">On Hand</th><th class="text-right">Hold</th><th class="text-right">Avail</th><th class="text-right">Incoming</th>' + (_sfp ? '<th class="text-right">Sell</th><th class="text-right">Cost</th>' : '') + (_sf ? '<th class="text-right">Value</th>' : '') + (_se ? '<th></th>' : '') + '</tr></thead><tbody>';

  invStockData.forEach(function(s) {
    var avail = (s.qty_on_hand || 0) - (s.qty_on_hold || 0) - (s.qty_reserved || 0);
    var lowStock = s.reorder_point > 0 && s.qty_on_hand <= s.reorder_point;
    var pNameEsc = escH(s.product_name).replace(/'/g, "\\'");
    var incoming = s.qty_incoming || 0;
    var isInactive = s.product_active === 0;
    var isNoRow = s.no_stock_row === 1;
    var isOos = !isNoRow && (s.qty_on_hand || 0) === 0;
    html += '<tr class="' + (isInactive ? 'inv-row-inactive' : isNoRow ? 'inv-row-new' : lowStock ? 'inv-row-warning' : '') + '">' +
      '<td class="inv-clickable" onclick="invShowProductDetail(' + s.product_id + ')"><strong>' + escH(s.product_name) + '</strong>' + (isInactive ? ' <span class="inv-cat-badge inv-cat-other" style="font-size:9px">Inactive</span>' : '') + (isNoRow ? ' <span class="inv-count-badge inv-count-badge-new" style="font-size:9px"><i class="fas fa-circle-plus"></i> NOT IN STOCK</span>' : '') + (isOos ? ' <span class="inv-count-badge inv-count-badge-oos" style="font-size:9px"><i class="fas fa-box-open"></i> OUT OF STOCK</span>' : '') + '</td>' +
      '<td class="inv-muted">' + escH(s.sku || '—') + '</td>' +
      '<td><span class="inv-cat-badge inv-cat-' + (s.category || 'shelf_goods') + '">' + escH((s.category || 'shelf_goods').replace(/_/g, ' ')) + '</span>' +
        (s.subcategory ? '<div style="font-size:10px;color:#64748B;margin-top:2px">' + invSubcatLabel(s.subcategory) + '</div>' : '') + '</td>' +
      '<td class="inv-muted" style="font-size:13px">' + escH(s.primary_vendor_name || '—') + '</td>' +
      '<td><span class="inv-loc-badge">' + escH(s.location_code) + '</span></td>' +
      '<td class="text-right"><span class="inv-num-click" onclick="event.stopPropagation();invStockDrilldown(' + s.product_id + ',' + s.location_id + ',\'all\',\'' + pNameEsc + '\')"><strong>' + (s.qty_on_hand || 0).toLocaleString() + '</strong></span></td>' +
      '<td class="text-right">' + (s.qty_on_hold || 0 ? '<span class="inv-hold-badge inv-num-click" onclick="event.stopPropagation();invStockDrilldown(' + s.product_id + ',' + s.location_id + ',\'on_hold\',\'' + pNameEsc + '\')">' + s.qty_on_hold + '</span>' : '—') + '</td>' +
      '<td class="text-right' + (avail <= 0 ? ' inv-danger' : lowStock ? ' inv-warning' : '') + '"><strong>' + avail.toLocaleString() + '</strong></td>' +
      '<td class="text-right">' + (incoming > 0 ? '<span class="inv-incoming-badge inv-num-click" onclick="event.stopPropagation();invShowIncoming(' + s.product_id + ',' + s.location_id + ',\'' + pNameEsc + '\')">' + incoming + '</span>' : '<span class="inv-muted">—</span>') + '</td>' +
      (_sfp ? '<td class="text-right"><span' + (_sp ? ' style="cursor:pointer;text-decoration:underline dotted #059669" onclick="event.stopPropagation();invInlinePriceEdit(' + s.product_id + ',\'price\')" title="Click to edit"' : '') + '>$' + (s.price || 0).toFixed(2) + '</span></td>' +
      '<td class="text-right inv-muted"><span' + (_sp ? ' style="cursor:pointer;text-decoration:underline dotted #DC2626" onclick="event.stopPropagation();invInlinePriceEdit(' + s.product_id + ',\'cost\')" title="Click to edit"' : '') + '>$' + (s.cost || 0).toFixed(2) + '</span></td>' : '') +
      (_sf ? '<td class="text-right">$' + ((s.qty_on_hand || 0) * (s.cost || s.price || 0)).toLocaleString(undefined, {minimumFractionDigits:2}) + '</td>' : '') +
      (_se ? '<td><button class="inv-btn inv-btn-xs" onclick="invShowQuickAdjust(' + s.product_id + ',' + s.location_id + ')"><i class="fas fa-pen"></i></button>' +
      '<button class="inv-btn inv-btn-xs inv-btn-request" onclick="invShowRequestOrder(' + s.product_id + ',' + s.location_id + ',\'' + pNameEsc + '\',\'' + escH(s.unit_type || 'each') + '\')"><i class="fas fa-hand"></i></button></td>' : '') +
      '</tr>';
  });
  html += '</tbody></table></div>';

  // Mobile cards
  html += '<div class="inv-mobile-only inv-stock-cards">';
  invStockData.forEach(function(s) {
    var avail = (s.qty_on_hand || 0) - (s.qty_on_hold || 0) - (s.qty_reserved || 0);
    var lowStock = s.reorder_point > 0 && s.qty_on_hand <= s.reorder_point;
    var incoming = s.qty_incoming || 0;
    var pNameEsc = escH(s.product_name).replace(/'/g, "\\'");
    var _isNoRow = s.no_stock_row === 1;
    var _isOos = !_isNoRow && (s.qty_on_hand || 0) === 0;
    html += '<div class="inv-stock-card' + (lowStock ? ' inv-card-warning' : _isNoRow ? ' inv-count-item-new' : '') + '" onclick="invShowProductDetail(' + s.product_id + ')">' +
      '<div class="inv-stock-card-top">' +
      '<div><strong>' + escH(s.product_name) + '</strong>' +
      (_isNoRow ? ' <span class="inv-count-badge inv-count-badge-new" style="font-size:9px"><i class="fas fa-circle-plus"></i> NOT IN STOCK</span>' : '') +
      (_isOos ? ' <span class="inv-count-badge inv-count-badge-oos" style="font-size:9px"><i class="fas fa-box-open"></i> OUT OF STOCK</span>' : '') +
      '<br><span class="inv-muted">' + escH(s.sku || '') + (s.primary_vendor_name ? ' \u00b7 ' + escH(s.primary_vendor_name) : '') + '</span></div>' +
      '<span class="inv-loc-badge">' + escH(s.location_code) + '</span>' +
      '</div>' +
      '<div class="inv-stock-card-nums">' +
      '<div onclick="event.stopPropagation();invStockDrilldown(' + s.product_id + ',' + s.location_id + ',\'all\',\'' + pNameEsc + '\')"><span class="inv-muted">On Hand</span><strong class="inv-num-click">' + (s.qty_on_hand || 0) + '</strong></div>' +
      '<div><span class="inv-muted">Available</span><strong class="' + (avail <= 0 ? 'inv-danger' : '') + '">' + avail + '</strong></div>' +
      (s.qty_on_hold > 0 ? '<div onclick="event.stopPropagation();invStockDrilldown(' + s.product_id + ',' + s.location_id + ',\'on_hold\',\'' + pNameEsc + '\')"><span class="inv-muted">Hold</span><strong class="inv-num-click" style="color:#D97706">' + s.qty_on_hold + '</strong></div>' : '') +
      (incoming > 0 ? '<div onclick="event.stopPropagation();invShowIncoming(' + s.product_id + ',' + s.location_id + ',\'' + pNameEsc + '\')"><span class="inv-muted">Incoming</span><strong class="inv-num-click" style="color:#059669">' + incoming + '</strong></div>' : '') +
      (_sfp ? '<div' + (_sp ? ' onclick="event.stopPropagation();invInlinePriceEdit(' + s.product_id + ',\'price\')" style="cursor:pointer"' : '') + '><span class="inv-muted">Sell</span><span>$' + (s.price || 0).toFixed(2) + '</span></div>' +
      '<div' + (_sp ? ' onclick="event.stopPropagation();invInlinePriceEdit(' + s.product_id + ',\'cost\')" style="cursor:pointer"' : '') + '><span class="inv-muted">Cost</span><span>$' + (s.cost || 0).toFixed(2) + '</span></div>' : '') +
      '</div>' +
      (_se ? '<div class="inv-stock-card-actions">' +
      '<button class="inv-btn inv-btn-xs inv-btn-outline" onclick="event.stopPropagation();invShowQuickAdjust(' + s.product_id + ',' + s.location_id + ')"><i class="fas fa-pen"></i> Adjust</button>' +
      '<button class="inv-btn inv-btn-xs inv-btn-request" onclick="event.stopPropagation();invShowRequestOrder(' + s.product_id + ',' + s.location_id + ',\'' + pNameEsc + '\',\'' + escH(s.unit_type || 'each') + '\')"><i class="fas fa-hand"></i> Request</button>' +
      '</div>' : '') +
      '</div>';
  });
  html += '</div>';
  return html;
}

// ==================== QUICK COUNT (MOBILE OPTIMIZED) ====================
function invRenderQuickCount() {
  if (!invSelectedLocation) {
    // Show store selection cards
    var html = '<div class="inv-count-page">';
    html += '<div class="inv-count-header">';
    html += '<h2><i class="fas fa-calculator"></i> Quick Count</h2>';
    html += '<p>Select a store / location to start counting inventory.</p>';
    html += '</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;padding:16px">';
    invLocations.forEach(function(l) {
      html += '<div class="inv-loc-card" onclick="invSelectedLocation=' + l.id + ';invRender()" style="cursor:pointer;padding:20px;background:white;border-radius:12px;border:1px solid #E2E8F0;text-align:center;transition:all 0.15s">' +
        '<i class="fas fa-store" style="font-size:28px;color:#6366F1;margin-bottom:8px;display:block"></i>' +
        '<strong style="display:block;font-size:15px">' + escH(l.name) + '</strong>' +
        '<span class="inv-muted">' + escH(l.code) + '</span></div>';
    });
    html += '</div></div>';
    return html;
  }

  var locName = invLocations.find(function(l) { return l.id == invSelectedLocation; });
  locName = locName ? locName.name : 'Location';

  // Category filter options
  var catOpts = '<option value="">All Categories</option>';
  invCategoryList.forEach(function(c) {
    var label = c.replace(/_/g, ' ').replace(/\b\w/g, function(m) { return m.toUpperCase(); });
    catOpts += '<option value="' + escH(c) + '"' + (invCountCategory === c ? ' selected' : '') + '>' + label + '</option>';
  });

  // Sort options
  var sortOpts = [
    { val: 'name', label: 'Name (A\u2013Z)' },
    { val: 'category', label: 'Category' },
    { val: 'sku', label: 'SKU' },
    { val: 'qty', label: 'Qty (High\u2192Low)' },
    { val: 'last_counted', label: 'Last Counted' }
  ];
  var sortHtml = sortOpts.map(function(o) {
    return '<option value="' + o.val + '"' + (invCountSort === o.val ? ' selected' : '') + '>' + o.label + '</option>';
  }).join('');

  // Store selector
  var storeOpts = '';
  invLocations.forEach(function(l) {
    storeOpts += '<option value="' + l.id + '"' + (invSelectedLocation == l.id ? ' selected' : '') + '>' + escH(l.code) + ' \u2014 ' + escH(l.name) + '</option>';
  });

  var html = '<div class="inv-count-page">';
  html += '<div class="inv-count-header">';
  html += '<h2><i class="fas fa-calculator"></i> Quick Count \u2014 ' + escH(locName) + '</h2>';
  html += '<p>Tap quantities to update. Tap <i class="fas fa-pen-to-square" style="font-size:11px"></i> to edit names, categories, or request deletions.</p>';

  // Row 1: Store + Category + Sort
  html += '<div class="inv-count-filters">';
  html += '<div class="inv-count-filter-group"><label><i class="fas fa-store"></i> Store</label>';
  html += '<select class="inv-select" onchange="invSelectedLocation=this.value;invRender()">' + storeOpts + '</select></div>';
  html += '<div class="inv-count-filter-group"><label><i class="fas fa-tags"></i> Category</label>';
  html += '<select class="inv-select" onchange="invCountCategory=this.value;invRender()">' + catOpts + '</select></div>';
  html += '<div class="inv-count-filter-group"><label><i class="fas fa-sort"></i> Sort By</label>';
  html += '<select class="inv-select" onchange="invCountSort=this.value;invRender()">' + sortHtml + '</select></div>';
  html += '</div>';

  // Pre-compute counts for new / out-of-stock
  var _preNewCount = 0, _preOosCount = 0;
  invStockData.forEach(function(s) { if (s.no_stock_row) _preNewCount++; else if ((s.qty_on_hand || 0) === 0) _preOosCount++; });

  // Row 2: Search + filter pills + Summary + auto-save info
  html += '<div class="inv-count-toolbar">';
  html += '<input id="invCountSearch" type="text" placeholder="Search products..." class="inv-count-search" oninput="invFilterCountList()">';
  html += '<div class="inv-count-toolbar-right">';
  html += '<span id="invCountSummary" class="inv-count-summary">' + invStockData.length + ' items</span>';
  if (_preNewCount > 0) html += '<button class="inv-count-pill inv-count-pill-new" data-status="new" onclick="invFilterCountByStatus(\'new\')" title="Show only new products"><i class="fas fa-circle-plus"></i> ' + _preNewCount + ' new</button>';
  if (_preOosCount > 0) html += '<button class="inv-count-pill inv-count-pill-oos" data-status="oos" onclick="invFilterCountByStatus(\'oos\')" title="Show only out-of-stock"><i class="fas fa-box-open"></i> ' + _preOosCount + ' out of stock</button>';
  if (invCanEdit('count')) html += '<button class="inv-btn inv-btn-outline inv-btn-sm" onclick="invShowNewProduct()" style="color:#6366F1;border-color:#6366F1"><i class="fas fa-plus"></i> Add Product</button> ';
  if (invUser && invUser.role === 'admin') html += '<button class="inv-btn inv-btn-outline inv-btn-sm" onclick="invShowCleanupReview()" style="color:#DC2626;border-color:#DC2626"><i class="fas fa-broom"></i> Review Deletions</button> ';
  html += '</div></div>';
  // Auto-save info banner
  if (invCanEdit('count')) html += '<div class="inv-count-autosave-banner"><i class="fas fa-bolt"></i> Counts auto-save as you go — no submit button needed</div>';
  html += '</div>'; // end header

  // Count list
  html += '<div id="invCountList" class="inv-count-list">';
  if (invStockData.length === 0) {
    html += '<div class="inv-empty" style="padding:40px;text-align:center"><i class="fas fa-box-open" style="font-size:36px;color:#CBD5E1;margin-bottom:12px;display:block"></i><p>No products found for this location' + (invCountCategory ? ' and category' : '') + '.</p></div>';
  }
  invStockData.forEach(function(s, idx) {
    var catLabel = (s.category || 'shelf_goods').replace(/_/g, ' ').replace(/\b\w/g, function(m) { return m.toUpperCase(); });
    var subLabel = s.subcategory ? invSubcatLabel(s.subcategory) : '';
    var lastCountedInfo = '';
    if (s.last_counted_at) {
      lastCountedInfo = '<span class="inv-count-last"><i class="fas fa-user-check"></i> ' +
        escH(s.last_counted_by_name || 'Unknown') + ' \u00b7 ' + invFmtDateShort(s.last_counted_at) + '</span>';
    } else {
      lastCountedInfo = '<span class="inv-count-last inv-count-never"><i class="fas fa-exclamation-circle"></i> Never counted</span>';
    }
    // Subcategory options for this product's category
    var subOptsForCat = invSubcatOptionsFor(s.category || 'shelf_goods');

    // Batch info for this product
    var bs = invBatchSummaryMap[s.product_id];
    var batchBadge = '';
    // Categories that typically use batches (hay, shavings, grain)
    var _batchCat = { hay: 1, shavings: 1, grain: 1 };
    var _needsBatches = !!_batchCat[s.category];
    if (bs && bs.batch_count > 0) {
      var unbatched = (s.qty_on_hand || 0) - (bs.batched_qty || 0);
      batchBadge = '<span class="inv-batch-indicator" onclick="event.stopPropagation();invCountViewBatches(' + s.product_id + ')" title="' + escH(bs.batch_detail) + '">' +
        '<i class="fas fa-layer-group"></i> ' + bs.batch_count + ' batch' + (bs.batch_count > 1 ? 'es' : '') + ' (' + bs.batched_qty + ')' +
        (unbatched > 0 ? ' · <span style="color:#D97706">' + unbatched + ' unbatched</span>' : '') + '</span>';
    } else if (s.qty_on_hand > 0 && _needsBatches) {
      // Only show "No batches" warning for hay/shavings/grain — these SHOULD have batches
      batchBadge = '<span class="inv-batch-indicator inv-batch-none inv-batch-warning" onclick="event.stopPropagation();invCountViewBatches(' + s.product_id + ')" title="No batches — click to add">' +
        '<i class="fas fa-exclamation-triangle"></i> No batches — tap to add</span>';
    }

    // Visual indicator for new products (no stock row) or out-of-stock
    var statusBadge = '';
    var itemExtraClass = '';
    if (s.no_stock_row) {
      statusBadge = '<span class="inv-count-badge inv-count-badge-new"><i class="fas fa-circle-plus"></i> NEW</span>';
      itemExtraClass = ' inv-count-item-new';
    } else if ((s.qty_on_hand || 0) === 0) {
      statusBadge = '<span class="inv-count-badge inv-count-badge-oos"><i class="fas fa-box-open"></i> OUT OF STOCK</span>';
      itemExtraClass = ' inv-count-item-oos';
    }

    html += '<div class="inv-count-item' + itemExtraClass + '" data-name="' + escH((s.product_name || '').toLowerCase()) + '" data-sku="' + escH((s.sku || '').toLowerCase()) + '" data-barcode="' + escH((s.barcode || '').toLowerCase()) + '" data-pid="' + s.product_id + '" data-status="' + (s.no_stock_row ? 'new' : (s.qty_on_hand || 0) === 0 ? 'oos' : 'stocked') + '">' +
      '<div class="inv-count-item-row">' +
      '<div class="inv-count-item-info">' +
      '<strong id="invCntName_' + idx + '">' + escH(s.product_name) + '</strong>' + statusBadge +
      '<span class="inv-muted">' + escH(s.sku || '') + ' · ' + escH(s.unit_type || '') + ' · <span class="inv-cat-badge">' + catLabel + '</span>' + (subLabel ? ' · ' + subLabel : '') + (s.barcode ? ' · <i class="fas fa-barcode" style="color:#8B5CF6;font-size:10px" title="' + escH(s.barcode) + '"></i>' : '') + '</span>' +
      lastCountedInfo + batchBadge +
      '</div>' +
      '<div class="inv-count-item-input">' +
      '<span class="inv-count-current">was: ' + (s.qty_on_hand || 0) + '</span>' +
      '<div class="inv-count-stepper">' +
      '<button class="inv-stepper-btn" onclick="invStepCount(' + idx + ',-1)">−</button>' +
      '<input type="number" id="invCount_' + idx + '" class="inv-count-field" value="' + (s.qty_on_hand || 0) + '" data-original="' + (s.qty_on_hand || 0) + '" data-product="' + s.product_id + '" inputmode="numeric" onchange="invAutoSaveCount(' + idx + ')" oninput="invAutoSaveCount(' + idx + ')">' +
      '<button class="inv-stepper-btn" onclick="invStepCount(' + idx + ',1)">+</button>' +
      '</div>' +
      '<span id="invCountStatus_' + idx + '" class="inv-count-status"></span>' +
      '</div></div>' +
      // Expand toggle
      '<button class="inv-count-expand-btn" onclick="invToggleCountEdit(' + idx + ')" title="Edit product"><i class="fas fa-pen-to-square"></i></button>' +
      // Expandable edit panel (hidden by default)
      '<div class="inv-count-edit-panel" id="invCntEdit_' + idx + '" style="display:none">' +
      '<div class="inv-count-edit-grid">' +
      '<div class="inv-count-edit-field"><label>Name</label>' +
      '<input type="text" id="invCntEditName_' + idx + '" class="inv-input" value="' + escH(s.product_name) + '" data-original="' + escH(s.product_name) + '" data-pid="' + s.product_id + '"></div>' +
      '<div class="inv-count-edit-field"><label>Category</label>' +
      '<select id="invCntEditCat_' + idx + '" class="inv-select" data-original="' + escH(s.category || 'shelf_goods') + '" data-pid="' + s.product_id + '" onchange="invCountCatChanged(' + idx + ')">' +
      '<option value="hay"' + (s.category === 'hay' ? ' selected' : '') + '>Hay</option>' +
      '<option value="shavings"' + (s.category === 'shavings' ? ' selected' : '') + '>Shavings</option>' +
      '<option value="grain"' + (s.category === 'grain' ? ' selected' : '') + '>Grain</option>' +
      '<option value="shelf_goods"' + (s.category === 'shelf_goods' || !s.category ? ' selected' : '') + '>Shelf Goods</option>' +
      '</select></div>' +
      '<div class="inv-count-edit-field"><label>Subcategory</label>' +
      '<select id="invCntEditSub_' + idx + '" class="inv-select" data-original="' + escH(s.subcategory || '') + '" data-pid="' + s.product_id + '">' +
      '<option value="">None</option>' + subOptsForCat +
      '</select></div>' +
      '</div>' +
      '<div class="inv-count-edit-actions">' +
      '<button class="inv-btn inv-btn-sm inv-btn-primary" onclick="invCountSaveEdit(' + idx + ')"><i class="fas fa-check"></i> Save Changes</button>' +
      '<button class="inv-btn inv-btn-sm inv-btn-outline" onclick="invCountViewBatches(' + s.product_id + ')"><i class="fas fa-layer-group"></i> Batches</button>' +
      '<button class="inv-btn inv-btn-sm inv-btn-danger-outline" onclick="invCountRequestDelete(' + s.product_id + ',\'' + escH(s.product_name).replace(/'/g, "\\'") + '\')"><i class="fas fa-trash"></i> Request Delete</button>' +
      '</div>' +
      '</div>' +
      '</div>';
  });
  html += '</div></div>';
  return html;
}

// Format date for quick count display
function invFmtDateShort(d) {
  if (!d) return '';
  try {
    var dt = new Date(d);
    var now = new Date();
    var diff = now - dt;
    if (diff < 86400000) return 'Today';
    if (diff < 172800000) return 'Yesterday';
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch(e) { return ''; }
}

function invStepCount(idx, delta) {
  var input = document.getElementById('invCount_' + idx);
  if (!input) return;
  var val = parseInt(input.value) || 0;
  val = Math.max(0, val + delta);
  input.value = val;
  invAutoSaveCount(idx);
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
  invUpdateCountSummary();
}

function invUpdateCountSummary() {
  var changed = document.querySelectorAll('.inv-count-changed').length;
  var unsaved = document.querySelectorAll('.inv-count-unsaved').length;
  var summary = document.getElementById('invCountSummary');
  if (summary) {
    var parts = [invStockData.length + ' items'];
    if (invCountSavedCount > 0) parts.push('<strong style="color:#059669"><i class="fas fa-check"></i> ' + invCountSavedCount + ' saved</strong>');
    if (unsaved > 0) parts.push('<strong style="color:#D97706">' + unsaved + ' unsaved</strong>');
    else if (changed > 0) parts.push('<strong style="color:#2563EB">' + changed + ' changed</strong>');
    summary.innerHTML = parts.join(' · ');
  }
}

// Auto-save a single count item after a short debounce
function invAutoSaveCount(idx) {
  var input = document.getElementById('invCount_' + idx);
  if (!input) return;
  var original = parseInt(input.dataset.original) || 0;
  var current = parseInt(input.value) || 0;
  var item = input.closest('.inv-count-item');

  // Visual: mark as changed immediately
  if (current !== original) {
    item.classList.add('inv-count-changed');
    item.classList.add('inv-count-unsaved');
  } else {
    item.classList.remove('inv-count-changed');
    item.classList.remove('inv-count-unsaved');
  }
  invUpdateCountSummary();

  // Cancel any pending debounce for this item
  if (invCountAutoSaveTimers[idx]) clearTimeout(invCountAutoSaveTimers[idx]);

  // If value hasn't actually changed from original, no need to save
  if (current === original) {
    invCountSetStatus(idx, '');
    return;
  }

  // Debounce: save after 800ms of inactivity (fast enough for steppers, allows manual typing)
  invCountAutoSaveTimers[idx] = setTimeout(function() {
    invCountSaveSingle(idx);
  }, 800);
}

async function invCountSaveSingle(idx) {
  var input = document.getElementById('invCount_' + idx);
  if (!input) return;
  var productId = parseInt(input.dataset.product);
  var original = parseInt(input.dataset.original) || 0;
  var newQty = parseInt(input.value) || 0;
  if (newQty === original) return; // No change

  var item = input.closest('.inv-count-item');
  invCountSetStatus(idx, 'saving');

  try {
    await invAPI.post('/api/inventory/count', {
      product_id: productId,
      location_id: parseInt(invSelectedLocation),
      new_qty: newQty,
      notes: 'Quick Count (auto-save)'
    }, { headers: invHeaders() });

    // Success: update the original baseline so re-saving won't fire again
    input.dataset.original = newQty;
    item.classList.remove('inv-count-changed');
    item.classList.remove('inv-count-unsaved');
    invCountSavedCount++;
    invCountSetStatus(idx, 'saved');
    invUpdateCountSummary();

    // Update the "was: X" label
    var wasLabel = item.querySelector('.inv-count-current');
    if (wasLabel) wasLabel.textContent = 'was: ' + newQty;

    // Clear saved indicator after 3s
    setTimeout(function() {
      invCountSetStatus(idx, '');
    }, 3000);
  } catch(e) {
    if (e && e.__viewOnly) return;
    invCountSetStatus(idx, 'error');
    invToast('Save failed for item: ' + (e.response?.data?.error || e.message), 'error');
  }
}

function invCountSetStatus(idx, status) {
  var indicator = document.getElementById('invCountStatus_' + idx);
  if (!indicator) return;
  if (status === 'saving') {
    indicator.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:#2563EB"></i>';
    indicator.title = 'Saving...';
  } else if (status === 'saved') {
    indicator.innerHTML = '<i class="fas fa-check-circle" style="color:#059669"></i>';
    indicator.title = 'Saved';
  } else if (status === 'error') {
    indicator.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:#DC2626"></i>';
    indicator.title = 'Save failed — tap to retry';
    indicator.onclick = function() { invCountSaveSingle(idx); };
  } else {
    indicator.innerHTML = '';
    indicator.title = '';
    indicator.onclick = null;
  }
}

function invFilterCountList() {
  var search = (document.getElementById('invCountSearch').value || '').toLowerCase();
  var items = document.querySelectorAll('.inv-count-item');
  var activeStatus = document.querySelector('.inv-count-pill.active');
  var statusFilter = activeStatus ? activeStatus.dataset.status : '';
  items.forEach(function(item) {
    var name = item.dataset.name || '';
    var sku = item.dataset.sku || '';
    var barcode = item.dataset.barcode || '';
    var matchesSearch = !search || name.includes(search) || sku.includes(search) || barcode.includes(search);
    var matchesStatus = !statusFilter || item.dataset.status === statusFilter;
    item.style.display = (matchesSearch && matchesStatus) ? '' : 'none';
  });
}

function invFilterCountByStatus(status) {
  var pills = document.querySelectorAll('.inv-count-pill');
  var alreadyActive = false;
  pills.forEach(function(p) {
    if (p.dataset.status === status && p.classList.contains('active')) alreadyActive = true;
    p.classList.remove('active');
  });
  if (!alreadyActive) {
    var target = document.querySelector('.inv-count-pill[data-status="' + status + '"]');
    if (target) target.classList.add('active');
  }
  invFilterCountList();
}
window.invFilterCountByStatus = invFilterCountByStatus;

// ==================== BARCODE SCANNER (Quick Count) ====================
// Detects barcode scanner input (rapid keystrokes + Enter) and scrolls to matching product.

function invHandleScanKeydown(e) {
  // Only process when on count page
  if (invPage !== 'count') return;

  // Ignore if focus is in a text input (user is manually typing a count or search)
  var tag = (e.target.tagName || '').toLowerCase();
  var isCountField = e.target.classList && e.target.classList.contains('inv-count-field');
  var isCountSearch = e.target.id === 'invCountSearch';
  var isEditField = (tag === 'input' || tag === 'textarea' || tag === 'select');
  // Allow scanner to work even when typing, but only intercept if buffer is fast
  if (isEditField && !isCountSearch && !isCountField) return;

  var now = Date.now();
  var timeSinceLast = now - invScanLastKey;

  if (e.key === 'Enter') {
    var buf = invScanBuffer.trim();
    if (buf.length >= 4 && timeSinceLast < 200) {
      e.preventDefault();
      e.stopPropagation();
      invScanBuffer = '';
      invScanLastKey = 0;
      // Clear search if it contains barcode text
      var si = document.getElementById('invCountSearch');
      if (si && si.value === buf) si.value = '';
      invScanFindProduct(buf);
    } else {
      invScanBuffer = '';
      invScanLastKey = 0;
    }
    return;
  }

  if (e.key.length !== 1) return;

  if (timeSinceLast > 200) {
    invScanBuffer = '';
  }
  invScanBuffer += e.key;
  invScanLastKey = now;

  clearTimeout(invScanTimer);
  invScanTimer = setTimeout(function() { invScanBuffer = ''; }, 300);
}

function invScanFindProduct(code) {
  var codeLower = code.toLowerCase();

  // First: try to find by data-barcode attribute (exact match)
  var items = document.querySelectorAll('.inv-count-item');
  var found = null;
  var foundIdx = -1;
  for (var i = 0; i < items.length; i++) {
    var bc = items[i].dataset.barcode || '';
    if (bc === codeLower) {
      found = items[i];
      foundIdx = i;
      break;
    }
  }

  // Fallback: try matching by SKU
  if (!found) {
    for (var i = 0; i < items.length; i++) {
      var sku = items[i].dataset.sku || '';
      if (sku === codeLower) {
        found = items[i];
        foundIdx = i;
        break;
      }
    }
  }

  if (found) {
    // Clear any active status filters so the item is visible
    var activeFilter = document.querySelector('.inv-count-pill.active');
    if (activeFilter) { activeFilter.classList.remove('active'); }
    // Clear search filter
    var searchEl = document.getElementById('invCountSearch');
    if (searchEl) searchEl.value = '';
    // Show all items first
    items.forEach(function(item) { item.style.display = ''; });

    // Scroll to the item
    found.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Highlight with animation
    found.classList.add('inv-count-scanned');
    setTimeout(function() { found.classList.remove('inv-count-scanned'); }, 2500);

    // Focus the count input and increment by 1
    var countInput = found.querySelector('.inv-count-field');
    if (countInput) {
      countInput.focus();
      countInput.select();
    }

    invToast('<i class="fas fa-barcode"></i> Found: ' + (found.querySelector('strong') ? found.querySelector('strong').textContent : code), 'success');
    invScanBeep(true);
  } else {
    invToast('<i class="fas fa-times-circle"></i> No product found for barcode: ' + escH(code), 'error');
    invScanBeep(false);
    // Put the code in search to help user find it
    var searchEl = document.getElementById('invCountSearch');
    if (searchEl) { searchEl.value = code; invFilterCountList(); searchEl.focus(); }
  }
}

function invScanBeep(success) {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = success ? 880 : 220;
    gain.gain.value = 0.15;
    osc.start();
    osc.stop(ctx.currentTime + (success ? 0.1 : 0.3));
  } catch(e) {}
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

// ==================== COUNT PAGE — INLINE EDIT HELPERS ====================

function invSubcatOptionsFor(category) {
  var allSubs = {
    hay: ['hay'],
    shavings: ['bedding'],
    grain: ['feed','supplement'],
    shelf_goods: ['dewormer','fly_control','grooming','hoof_care','first_aid',
      'tack','blankets','treats','barn_equipment','fencing','riding_apparel','pet_supplies',
      'cleaning','poultry','farm_supplies','tools','gift','general']
  };
  var subs = allSubs[category] || allSubs.shelf_goods;
  return subs.map(function(s) { return '<option value="' + s + '">' + invSubcatLabel(s) + '</option>'; }).join('');
}

function invToggleCountEdit(idx) {
  var panel = document.getElementById('invCntEdit_' + idx);
  if (!panel) return;
  var isOpen = panel.style.display !== 'none';
  // Close all other panels first
  document.querySelectorAll('.inv-count-edit-panel').forEach(function(p) { p.style.display = 'none'; });
  document.querySelectorAll('.inv-count-item').forEach(function(i) { i.classList.remove('inv-count-editing'); });
  if (!isOpen) {
    panel.style.display = 'block';
    panel.closest('.inv-count-item').classList.add('inv-count-editing');
  }
}
window.invToggleCountEdit = invToggleCountEdit;

function invCountCatChanged(idx) {
  var catSel = document.getElementById('invCntEditCat_' + idx);
  var subSel = document.getElementById('invCntEditSub_' + idx);
  if (!catSel || !subSel) return;
  var newCat = catSel.value;
  var origSub = subSel.dataset.original || '';
  subSel.innerHTML = '<option value="">None</option>' + invSubcatOptionsFor(newCat);
  // Try to re-select original if it still applies
  if (origSub) { subSel.value = origSub; if (!subSel.value) subSel.value = ''; }
}
window.invCountCatChanged = invCountCatChanged;

async function invCountSaveEdit(idx) {
  var nameInput = document.getElementById('invCntEditName_' + idx);
  var catSel = document.getElementById('invCntEditCat_' + idx);
  var subSel = document.getElementById('invCntEditSub_' + idx);
  if (!nameInput || !catSel) return;

  var pid = parseInt(nameInput.dataset.pid);
  var changes = {};
  if (nameInput.value.trim() !== nameInput.dataset.original) changes.name = nameInput.value.trim();
  if (catSel.value !== catSel.dataset.original) changes.category = catSel.value;
  if (subSel && subSel.value !== subSel.dataset.original) changes.subcategory = subSel.value || null;

  if (!Object.keys(changes).length) { invToast('No changes to save', 'info'); return; }
  if (!changes.name && nameInput.value.trim() === '') { invToast('Name cannot be empty', 'warning'); return; }

  try {
    await invAPI.patch('/api/inventory/products/' + pid + '/quick-update', changes, { headers: invHeaders() });
    invToast('Product updated');
    // Update local display immediately
    if (changes.name) {
      var nameEl = document.getElementById('invCntName_' + idx);
      if (nameEl) nameEl.textContent = changes.name;
      nameInput.dataset.original = changes.name;
    }
    if (changes.category) catSel.dataset.original = changes.category;
    if (changes.subcategory !== undefined && subSel) subSel.dataset.original = changes.subcategory || '';
    invToggleCountEdit(idx); // close panel
  } catch(e) {
    invToast('Save failed: ' + (e.response?.data?.error || e.message), 'error');
  }
}
window.invCountSaveEdit = invCountSaveEdit;

// Inline batch management for quick count — stays on the count page
async function invCountViewBatches(productId) {
  try {
    var locId = invSelectedLocation;
    var resp = await invAPI.get('/api/inventory/batches?product_id=' + productId + '&location_id=' + locId, { headers: invHeaders() });
    var batches = resp.data.batches || [];

    // Find product info from stock data
    var prod = invStockData.find(function(s) { return s.product_id == productId; });
    var pName = prod ? prod.product_name : 'Product #' + productId;
    var totalOnHand = prod ? (prod.qty_on_hand || 0) : 0;
    var batchedQty = batches.reduce(function(s, b) { return s + (b.qty || 0); }, 0);
    var unbatched = totalOnHand - batchedQty;

    // Summary bar
    var allOk = unbatched <= 0 && totalOnHand > 0;
    var summaryColor = allOk ? '#F0FDF4' : '#EFF6FF';
    var summaryBorder = allOk ? '#BBF7D0' : '#BFDBFE';
    var body = '<div style="background:' + summaryColor + ';border:1px solid ' + summaryBorder + ';border-radius:10px;padding:14px;margin-bottom:16px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">' +
      '<div style="font-weight:700;font-size:15px;color:#1E293B"><i class="fas fa-boxes-stacked" style="color:#3B82F6"></i> ' + escH(pName) + '</div>' +
      '<div style="font-size:24px;font-weight:800;color:#1E293B">' + totalOnHand + ' <span style="font-size:13px;font-weight:500;color:#64748B">total</span></div>' +
      '</div>' +
      '<div style="display:flex;gap:12px;margin-top:10px;font-size:13px;flex-wrap:wrap">' +
      '<span style="background:white;padding:4px 10px;border-radius:6px;border:1px solid #E2E8F0"><i class="fas fa-layer-group" style="color:#3B82F6"></i> <strong>' + batchedQty + '</strong> batched</span>' +
      (unbatched > 0 ? '<span style="background:#FEF3C7;padding:4px 10px;border-radius:6px;border:1px solid #FDE68A;color:#92400E"><i class="fas fa-exclamation-triangle"></i> <strong>' + unbatched + '</strong> unbatched</span>'
        : '<span style="background:#DCFCE7;padding:4px 10px;border-radius:6px;border:1px solid #BBF7D0;color:#166534"><i class="fas fa-check-circle"></i> All batched</span>') +
      '</div></div>';

    // Existing batches as editable cards
    if (batches.length > 0) {
      body += '<div style="margin-bottom:12px">';
      batches.forEach(function(b, i) {
        var condColors = { good: '#059669', fair: '#D97706', poor: '#EA580C', damaged: '#DC2626' };
        var cc = condColors[b.condition] || '#64748B';
        body += '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:white;border:1px solid #E2E8F0;border-radius:10px;border-left:4px solid ' + cc + ';margin-bottom:6px">' +
          '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;align-items:center;gap:6px"><strong style="font-size:14px">' + escH(b.batch_number) + '</strong>' +
          '<span style="font-size:11px;background:' + cc + '22;color:' + cc + ';padding:2px 8px;border-radius:12px;font-weight:600">' + escH(b.condition) + '</span>' +
          (b.expiry_date ? '<span style="font-size:11px;background:#FEF3C7;color:#92400E;padding:2px 8px;border-radius:12px;font-weight:600;margin-left:4px"><i class="fas fa-calendar-xmark" style="font-size:10px"></i> Exp ' + b.expiry_date + '</span>' : '') +
          '</div>' +
          (b.notes ? '<div style="font-size:12px;color:#64748B;margin-top:2px">' + escH(b.notes) + '</div>' : '') +
          '</div>' +
          '<div style="text-align:center;min-width:50px"><div style="font-size:22px;font-weight:800;color:#1E293B;line-height:1">' + b.qty + '</div><div style="font-size:10px;color:#94A3B8;text-transform:uppercase">' + escH(b.unit_type || 'units') + '</div></div>' +
          '<button onclick="invDeleteBatch(' + b.id + ',' + productId + ')" style="background:none;border:none;color:#CBD5E1;cursor:pointer;padding:4px 6px;font-size:14px;border-radius:6px;transition:all 0.15s" onmouseover="this.style.color=\'#DC2626\';this.style.background=\'#FEE2E2\'" onmouseout="this.style.color=\'#CBD5E1\';this.style.background=\'none\'" title="Delete batch"><i class="fas fa-trash"></i></button>' +
          '</div>';
      });
      body += '</div>';
    }

    // Quick add batch form — always visible for adding more
    var addTitle = batches.length > 0 ? 'Add Another Batch' : 'Create First Batch';
    var defaultQty = Math.max(unbatched, 1);
    body += '<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:14px">' +
      '<div style="font-weight:700;font-size:13px;margin-bottom:10px;color:#334155"><i class="fas fa-plus-circle" style="color:#3B82F6"></i> ' + addTitle + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
      '<div><label style="font-size:11px;font-weight:600;color:#64748B;display:block;margin-bottom:4px">Quantity</label>' +
      '<input id="invInlineBatchQty" type="number" class="inv-input" value="' + defaultQty + '" min="1" max="' + Math.max(unbatched, 9999) + '" inputmode="numeric" style="font-size:18px;font-weight:700;text-align:center"' +
      ' oninput="invUpdateBatchRemaining(' + totalOnHand + ',' + batchedQty + ')"></div>' +
      '<div><label style="font-size:11px;font-weight:600;color:#64748B;display:block;margin-bottom:4px">Condition</label>' +
      '<select id="invInlineBatchCond" class="inv-select" style="height:44px">' +
      '<option value="good">✅ Good</option><option value="fair">⚠️ Fair</option><option value="poor">🔶 Poor</option><option value="damaged">❌ Damaged</option></select></div></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">' +
      '<div><label style="font-size:11px;font-weight:600;color:#64748B;display:block;margin-bottom:4px"><i class="fas fa-calendar-xmark" style="font-size:10px"></i> Expiration Date</label>' +
      '<input id="invInlineBatchExpiry" type="date" class="inv-input" style="height:44px"></div>' +
      '<div><label style="font-size:11px;font-weight:600;color:#64748B;display:block;margin-bottom:4px">Notes <span style="font-weight:400">(optional)</span></label>' +
      '<input id="invInlineBatchNotes" type="text" class="inv-input" placeholder="e.g. pallet #3" style="height:44px"></div></div>' +
      '<div id="invBatchRemainPreview" style="margin-top:8px;font-size:12px;color:#64748B;text-align:center"></div>' +
      '<button class="inv-btn inv-btn-primary" style="margin-top:10px;width:100%;padding:12px;font-size:14px" onclick="invDoInlineBatch(' + productId + ',' + locId + ')">' +
      '<i class="fas fa-layer-group"></i> Create Batch</button>' +
      '</div>';

    // "Batch All" shortcut — single click to batch everything as good
    if (unbatched > 0 && batches.length === 0) {
      body += '<button class="inv-btn inv-btn-outline" style="width:100%;margin-top:8px;padding:10px;font-size:13px" onclick="invBatchAllQuick(' + productId + ',' + locId + ',' + totalOnHand + ')">' +
        '<i class="fas fa-magic"></i> Batch All ' + totalOnHand + ' as Good (one batch)</button>';
    }

    var footer = '<button class="inv-btn inv-btn-outline" onclick="invCloseModal()">Done</button>';
    invShowModal('<i class="fas fa-layer-group"></i> Batches', body, footer);

    // Initial remaining preview
    invUpdateBatchRemaining(totalOnHand, batchedQty);
  } catch(e) {
    invToast('Failed to load batches: ' + (e.response?.data?.error || e.message), 'error');
  }
}
window.invCountViewBatches = invCountViewBatches;

function invUpdateBatchRemaining(totalOnHand, alreadyBatched) {
  var el = document.getElementById('invBatchRemainPreview');
  if (!el) return;
  var newQty = parseInt(document.getElementById('invInlineBatchQty').value) || 0;
  var afterBatch = alreadyBatched + newQty;
  var remain = totalOnHand - afterBatch;
  if (remain < 0) {
    el.innerHTML = '<span style="color:#DC2626"><i class="fas fa-exclamation-triangle"></i> Over-allocated by ' + Math.abs(remain) + ' — total on hand is ' + totalOnHand + '</span>';
  } else if (remain === 0) {
    el.innerHTML = '<span style="color:#059669"><i class="fas fa-check-circle"></i> All ' + totalOnHand + ' will be batched</span>';
  } else {
    el.innerHTML = '<span style="color:#64748B">' + remain + ' will remain unbatched after this</span>';
  }
}
window.invUpdateBatchRemaining = invUpdateBatchRemaining;

async function invDoInlineBatch(productId, locationId) {
  var qtyEl = document.getElementById('invInlineBatchQty');
  var qty = parseInt(qtyEl.value);
  var condition = document.getElementById('invInlineBatchCond').value;
  var notes = document.getElementById('invInlineBatchNotes').value;

  if (!qty || qty <= 0) { invToast('Enter a valid quantity', 'warning'); return; }

  try {
    var expiryEl = document.getElementById('invInlineBatchExpiry');
    var expiry = expiryEl ? expiryEl.value : null;
    var resp = await invAPI.post('/api/inventory/batches', {
      product_id: productId, location_id: locationId,
      qty: qty, condition: condition, notes: notes || null,
      expiry_date: expiry || null,
      track_only: true  // Don't increase qty_on_hand — just organizing existing stock
    }, { headers: invHeaders() });
    invToast('Batch ' + (resp.data.batch_number || '') + ' created (' + qty + ' ' + condition + ')');
    // Refresh batch summary cache
    try {
      var bsResp = await invAPI.get('/api/inventory/batch-summary?location_id=' + locationId, { headers: invHeaders() });
      invBatchSummaryMap = bsResp.data.summary || {};
    } catch(e) {}
    // Re-open the same panel to show updated list
    invCountViewBatches(productId);
  } catch(e) { invToast('Batch failed: ' + (e.response?.data?.error || e.message), 'error'); }
}
window.invDoInlineBatch = invDoInlineBatch;

async function invBatchAllQuick(productId, locationId, totalQty) {
  try {
    var resp = await invAPI.post('/api/inventory/batches', {
      product_id: productId, location_id: locationId,
      qty: totalQty, condition: 'good', notes: null,
      track_only: true
    }, { headers: invHeaders() });
    invToast('All ' + totalQty + ' batched as good');
    try {
      var bsResp = await invAPI.get('/api/inventory/batch-summary?location_id=' + locationId, { headers: invHeaders() });
      invBatchSummaryMap = bsResp.data.summary || {};
    } catch(e) {}
    invCountViewBatches(productId);
  } catch(e) { invToast('Batch failed: ' + (e.response?.data?.error || e.message), 'error'); }
}
window.invBatchAllQuick = invBatchAllQuick;

async function invDeleteBatch(batchId, productId) {
  if (!confirm('Delete this batch? (Stock quantities will not change — only the batch record is removed)')) return;
  try {
    await invAPI.delete('/api/inventory/batches/' + batchId, { headers: invHeaders() });
    invToast('Batch deleted');
    // Refresh batch summary cache
    try {
      var bsResp = await invAPI.get('/api/inventory/batch-summary?location_id=' + invSelectedLocation, { headers: invHeaders() });
      invBatchSummaryMap = bsResp.data.summary || {};
    } catch(e) {}
    // Re-open modal to show updated list
    invCountViewBatches(productId);
  } catch(e) { invToast('Delete failed: ' + (e.response?.data?.error || e.message), 'error'); }
}
window.invDeleteBatch = invDeleteBatch;

// Delete batch from the Batches list page — prompts with choice to adjust stock or not
async function invDeleteBatchFromList(batchId, batchNumber, qty) {
  // Show modal with two options
  var body = '<div style="text-align:center;padding:8px 0">' +
    '<i class="fas fa-exclamation-triangle" style="font-size:32px;color:#D97706;margin-bottom:12px;display:block"></i>' +
    '<p style="font-size:15px;font-weight:600;margin:0 0 8px">Delete batch ' + escH(batchNumber) + '?</p>' +
    '<p style="font-size:13px;color:#64748B;margin:0 0 16px">This batch has <strong>' + qty + '</strong> unit' + (qty !== 1 ? 's' : '') + '.</p>' +
    '<div style="display:flex;flex-direction:column;gap:10px">' +
    '<button id="invDelBatchTrackOnly" class="inv-btn inv-btn-primary" style="width:100%;padding:14px;font-size:14px">' +
    '<i class="fas fa-eraser"></i> Remove Batch Record Only<br><span style="font-size:11px;font-weight:400;opacity:0.85">Stock stays the same — just removes the batch tracking</span></button>' +
    '<button id="invDelBatchAndStock" class="inv-btn inv-btn-danger" style="width:100%;padding:14px;font-size:14px;background:#DC2626;border-color:#DC2626">' +
    '<i class="fas fa-trash"></i> Delete Batch + Reduce Stock<br><span style="font-size:11px;font-weight:400;opacity:0.85">Removes batch AND subtracts ' + qty + ' from on-hand stock</span></button>' +
    '<button id="invDelBatchCancel" class="inv-btn inv-btn-outline" style="width:100%;padding:10px;font-size:13px">' +
    '<i class="fas fa-times"></i> Cancel</button>' +
    '</div></div>';
  invShowModal('<i class="fas fa-layer-group"></i> Delete Batch', body, '');

  // Bind events
  var doDelete = async function(adjustStock) {
    invCloseModal();
    try {
      var url = '/api/inventory/batches/' + batchId;
      if (adjustStock) url += '?adjust_stock=1';
      await invAPI.delete(url, { headers: invHeaders() });
      invToast('Batch ' + batchNumber + ' deleted' + (adjustStock ? ' (stock adjusted)' : ''));
      invRender(); // Refresh the batches page
    } catch(e) { invToast('Delete failed: ' + (e.response?.data?.error || e.message), 'error'); }
  };
  var el1 = document.getElementById('invDelBatchTrackOnly');
  if (el1) el1.addEventListener('click', function() { doDelete(false); });
  var el2 = document.getElementById('invDelBatchAndStock');
  if (el2) el2.addEventListener('click', function() { doDelete(true); });
  var el3 = document.getElementById('invDelBatchCancel');
  if (el3) el3.addEventListener('click', function() { invCloseModal(); });
}
window.invDeleteBatchFromList = invDeleteBatchFromList;

function invCountRequestDelete(productId, productName) {
  var reasons = [
    { val: 'duplicate', label: 'Duplicate product' },
    { val: 'wrong_product', label: 'Wrong / incorrect product' },
    { val: 'obsolete', label: 'Obsolete / no longer sold' },
    { val: 'test_data', label: 'Test data / junk entry' },
    { val: 'other', label: 'Other' }
  ];
  var reasonOpts = reasons.map(function(r) { return '<option value="' + r.val + '">' + r.label + '</option>'; }).join('');

  var body = '<div style="margin-bottom:12px"><strong style="font-size:15px">' + escH(productName) + '</strong></div>' +
    '<div style="margin-bottom:12px"><label style="display:block;font-weight:600;margin-bottom:4px">Reason</label>' +
    '<select id="invCleanupReason" class="inv-select" style="width:100%">' + reasonOpts + '</select></div>' +
    '<div style="margin-bottom:12px"><label style="display:block;font-weight:600;margin-bottom:4px">Details (optional)</label>' +
    '<textarea id="invCleanupDetails" class="inv-input" rows="2" style="width:100%" placeholder="e.g. Duplicate of Product #123"></textarea></div>';

  var footer = '<button class="inv-btn inv-btn-danger" onclick="invDoRequestDelete(' + productId + ')"><i class="fas fa-trash"></i> Submit Delete Request</button>';
  invShowModal('<i class="fas fa-trash" style="color:#DC2626"></i> Request Product Deletion', body, footer);
}
window.invCountRequestDelete = invCountRequestDelete;

async function invDoRequestDelete(productId) {
  var reason = document.getElementById('invCleanupReason').value;
  var details = (document.getElementById('invCleanupDetails').value || '').trim();

  try {
    await invAPI.post('/api/inventory/cleanup-requests', {
      product_id: productId, request_type: 'delete', reason: reason, details: details || null
    }, { headers: invHeaders() });
    invToast('Delete request submitted — an admin will review it');
    invCloseModal();
    // Visually mark the item
    var item = document.querySelector('.inv-count-item[data-pid="' + productId + '"]');
    if (item) {
      item.style.opacity = '0.5';
      item.style.borderLeft = '3px solid #DC2626';
      var badge = document.createElement('span');
      badge.style.cssText = 'position:absolute;top:4px;right:4px;background:#DC2626;color:white;font-size:9px;padding:2px 6px;border-radius:4px;font-weight:700';
      badge.textContent = 'DELETE REQUESTED';
      item.style.position = 'relative';
      item.appendChild(badge);
    }
  } catch(e) {
    invToast('Request failed: ' + (e.response?.data?.error || e.message), 'error');
  }
}
window.invDoRequestDelete = invDoRequestDelete;

// ==================== CLEANUP REQUEST REVIEW (Admin) ====================

async function invShowCleanupReview() {
  try {
    var resp = await invAPI.get('/api/inventory/cleanup-requests?status=pending', { headers: invHeaders() });
    var requests = resp.data.requests || [];
  } catch(e) {
    invToast('Failed to load requests: ' + (e.response?.data?.error || e.message), 'error');
    return;
  }

  if (requests.length === 0) {
    invToast('No pending cleanup requests', 'info');
    return;
  }

  var body = '<div style="max-height:60vh;overflow-y:auto">';
  requests.forEach(function(r) {
    var reasonLabel = { duplicate: 'Duplicate', wrong_product: 'Wrong Product', obsolete: 'Obsolete', test_data: 'Test Data', other: 'Other' };
    var typeLabel = { delete: 'Delete', rename: 'Rename', recategorize: 'Recategorize', merge_duplicate: 'Merge Duplicate' };
    body += '<div style="padding:12px;border:1px solid #E2E8F0;border-radius:8px;margin-bottom:8px;background:white">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px">' +
      '<div><strong style="font-size:14px">' + escH(r.product_name || 'Unknown Product') + '</strong>' +
      '<div style="font-size:12px;color:#64748B">' + escH(r.product_sku || '') + ' · ' + escH(r.product_category || '') + '</div></div>' +
      '<span style="background:#FEE2E2;color:#991B1B;font-size:10px;padding:2px 8px;border-radius:4px;font-weight:700;white-space:nowrap">' + (typeLabel[r.request_type] || r.request_type) + '</span></div>' +
      '<div style="font-size:12px;margin-bottom:8px"><span style="font-weight:600">Reason:</span> ' + escH(reasonLabel[r.reason] || r.reason || '—') +
      (r.details ? '<br><span style="font-weight:600">Details:</span> ' + escH(r.details) : '') + '</div>' +
      '<div style="font-size:11px;color:#94A3B8;margin-bottom:8px">Requested by ' + escH(r.requested_by_name || 'Unknown') + ' · ' + invFmtDateShort(r.created_at) + '</div>' +
      '<div style="display:flex;gap:6px">' +
      '<button class="inv-btn inv-btn-sm inv-btn-success" onclick="invReviewCleanup(' + r.id + ',\'approved\')"><i class="fas fa-check"></i> Approve</button>' +
      '<button class="inv-btn inv-btn-sm inv-btn-outline" onclick="invReviewCleanup(' + r.id + ',\'rejected\')"><i class="fas fa-times"></i> Reject</button>' +
      '</div></div>';
  });
  body += '</div>';

  invShowModal('<i class="fas fa-broom" style="color:#DC2626"></i> Pending Cleanup Requests (' + requests.length + ')', body, '');
}
window.invShowCleanupReview = invShowCleanupReview;

async function invReviewCleanup(requestId, status) {
  var notes = status === 'rejected' ? prompt('Reason for rejection (optional):') : null;
  try {
    await invAPI.put('/api/inventory/cleanup-requests/' + requestId, {
      status: status, review_notes: notes || null
    }, { headers: invHeaders() });
    invToast('Request ' + status);
    invCloseModal();
    // Re-open to refresh the list
    setTimeout(function() { invShowCleanupReview(); }, 300);
  } catch(e) {
    invToast('Failed: ' + (e.response?.data?.error || e.message), 'error');
  }
}
window.invReviewCleanup = invReviewCleanup;

// ==================== TRANSFERS ====================
async function invRenderTransfers() {
  var resp = await invAPI.get('/api/inventory/transfers', { headers: invHeaders() });
  var transfers = resp.data.transfers || [];

  var html = '<div class="inv-section">';
  html += '<div class="inv-section-header"><h2><i class="fas fa-truck-ramp-box"></i> Transfers</h2>';
  if (invCanEdit('transfers')) html += '<button class="inv-btn inv-btn-primary" onclick="invShowNewTransfer()"><i class="fas fa-plus"></i> New Transfer</button>';
  html += '</div>';

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
  var btns = '';
  if (t.status === 'pending') {
    btns += '<button class="inv-btn inv-btn-xs inv-btn-outline" onclick="event.stopPropagation();invShowTransferChecklist(' + t.id + ')" title="Checklist"><i class="fas fa-clipboard-check"></i></button> ';
    btns += '<button class="inv-btn inv-btn-xs inv-btn-outline" onclick="event.stopPropagation();invPrintTransferPackingList(' + t.id + ')" title="Print"><i class="fas fa-print"></i></button> ';
    btns += '<button class="inv-btn inv-btn-xs inv-btn-primary" onclick="event.stopPropagation();invShipTransfer(' + t.id + ')"><i class="fas fa-truck"></i> Ship</button> ';
    btns += '<button class="inv-btn inv-btn-xs inv-btn-danger" onclick="event.stopPropagation();invCancelTransfer(' + t.id + ')"><i class="fas fa-times"></i></button>';
  } else if (t.status === 'in_transit') {
    btns += '<button class="inv-btn inv-btn-xs inv-btn-outline" onclick="event.stopPropagation();invShowTransferChecklist(' + t.id + ')" title="Checklist"><i class="fas fa-clipboard-check"></i></button> ';
    btns += '<button class="inv-btn inv-btn-xs inv-btn-outline" onclick="event.stopPropagation();invPrintTransferPackingList(' + t.id + ')" title="Print"><i class="fas fa-print"></i></button> ';
    btns += '<button class="inv-btn inv-btn-xs inv-btn-success" onclick="event.stopPropagation();invReceiveTransfer(' + t.id + ')"><i class="fas fa-check"></i> Receive</button> ';
    btns += '<button class="inv-btn inv-btn-xs inv-btn-danger" onclick="event.stopPropagation();invCancelTransfer(' + t.id + ')"><i class="fas fa-times"></i></button>';
  } else if (t.status === 'cancelled') {
    btns = '<span class="inv-status inv-status-danger" style="font-size:11px"><i class="fas fa-ban"></i> Cancelled</span>';
  } else if (t.status === 'received') {
    btns += '<button class="inv-btn inv-btn-xs inv-btn-outline" onclick="event.stopPropagation();invPrintTransferPackingList(' + t.id + ')" title="Print"><i class="fas fa-print"></i></button>';
  }
  return btns;
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
  try {
    var resp = await invAPI.get('/api/inventory/transfers/' + id, { headers: invHeaders() });
    var t = resp.data.transfer;
    var items = resp.data.items || [];

    var body = '<div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#1E40AF">' +
      '<strong><i class="fas fa-info-circle"></i> Verify Received Quantities</strong>' +
      '<div style="margin-top:4px;color:#64748B">Adjust quantities if actual received differs from shipped. Items not received will be logged as discrepancies.</div></div>';

    body += '<div style="display:flex;gap:10px;margin-bottom:12px;font-size:13px;flex-wrap:wrap">' +
      '<span><i class="fas fa-arrow-right-from-bracket" style="color:#6366F1"></i> From: <strong>' + escH(t.from_code) + '</strong></span>' +
      '<span><i class="fas fa-arrow-right-to-bracket" style="color:#059669"></i> To: <strong>' + escH(t.to_code) + '</strong></span></div>';

    items.forEach(function(item, idx) {
      var shipped = item.qty_shipped || item.qty_requested || 0;
      body += '<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:white;border:1px solid #E2E8F0;border-radius:10px;margin-bottom:6px">' +
        '<div style="flex:1;min-width:0">' +
        '<strong style="font-size:14px">' + escH(item.product_name) + '</strong>' +
        '<div style="font-size:12px;color:#64748B">' + escH(item.sku || '') + ' · Shipped: <strong>' + shipped + '</strong></div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:4px">' +
        '<button class="inv-stepper-btn" onclick="invStepRecvTrf(\'invTrfRecv_' + idx + '\',-1)" style="width:32px;height:32px">−</button>' +
        '<input type="number" id="invTrfRecv_' + idx + '" class="inv-input" value="' + shipped + '" min="0" max="' + shipped + '"' +
        ' data-item-id="' + item.id + '" data-shipped="' + shipped + '"' +
        ' style="width:60px;text-align:center;font-size:16px;font-weight:700;padding:4px" inputmode="numeric"' +
        ' oninput="invCheckTrfRecvDiff(' + idx + ')">' +
        '<button class="inv-stepper-btn" onclick="invStepRecvTrf(\'invTrfRecv_' + idx + '\',1)" style="width:32px;height:32px">+</button>' +
        '</div>' +
        '<div id="invTrfRecvFlag_' + idx + '" style="width:20px;text-align:center"></div>' +
        '</div>';
    });

    body += '<div style="margin-top:12px"><label style="font-size:12px;font-weight:600;color:#64748B">Receiving Notes (optional)</label>' +
      '<input type="text" id="invTrfRecvNotes" class="inv-input" placeholder="Any issues or notes..." style="margin-top:4px"></div>';

    var footer = '<button class="inv-btn inv-btn-outline" onclick="invCloseModal()">Cancel</button>' +
      '<button class="inv-btn inv-btn-primary" id="invTrfRecvBtn" onclick="invSubmitTransferReceive(' + id + ',' + items.length + ')"><i class="fas fa-check-double"></i> Confirm Receiving</button>';

    invShowModal('<i class="fas fa-truck-ramp-box"></i> Receive Transfer — ' + escH(t.transfer_number), body, footer);

    // Initial diff check
    items.forEach(function(item, idx) { invCheckTrfRecvDiff(idx); });

  } catch(e) { invToast('Failed to load transfer: ' + (e.response?.data?.error || e.message), 'error'); }
}

function invStepRecvTrf(fieldId, delta) {
  var el = document.getElementById(fieldId);
  if (!el) return;
  var val = parseInt(el.value) || 0;
  var max = parseInt(el.dataset.shipped) || 9999;
  el.value = Math.max(0, Math.min(max, val + delta));
  el.dispatchEvent(new Event('input'));
}
window.invStepRecvTrf = invStepRecvTrf;

function invCheckTrfRecvDiff(idx) {
  var el = document.getElementById('invTrfRecv_' + idx);
  var flag = document.getElementById('invTrfRecvFlag_' + idx);
  if (!el || !flag) return;
  var recv = parseInt(el.value) || 0;
  var shipped = parseInt(el.dataset.shipped) || 0;
  if (recv < shipped) {
    flag.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:#D97706" title="Discrepancy: ' + (shipped - recv) + ' short"></i>';
    el.style.borderColor = '#F59E0B';
  } else {
    flag.innerHTML = '<i class="fas fa-check-circle" style="color:#059669"></i>';
    el.style.borderColor = '';
  }
}
window.invCheckTrfRecvDiff = invCheckTrfRecvDiff;

async function invSubmitTransferReceive(transferId, itemCount) {
  var btn = document.getElementById('invTrfRecvBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Receiving...'; }

  var receivedItems = [];
  for (var i = 0; i < itemCount; i++) {
    var el = document.getElementById('invTrfRecv_' + i);
    if (el) {
      receivedItems.push({ id: parseInt(el.dataset.itemId), qty_received: parseInt(el.value) || 0 });
    }
  }

  try {
    await invAPI.post('/api/inventory/transfers/' + transferId + '/receive', { items: receivedItems }, { headers: invHeaders() });
    invCloseModal();
    invToast('Transfer received successfully');
    invRender();
  } catch(e) {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-double"></i> Confirm Receiving'; }
    invToast('Receive failed: ' + (e.response?.data?.error || e.message), 'error');
  }
}
window.invSubmitTransferReceive = invSubmitTransferReceive;

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
  if (invSelectedLocation) url += 'location_id=' + invSelectedLocation + '&';
  var bSearch = document.getElementById('invBatchSearchInput');
  if (bSearch && bSearch.value) url += 'search=' + encodeURIComponent(bSearch.value) + '&';
  var bCond = document.getElementById('invBatchCondFilter');
  if (bCond && bCond.value) url += 'condition=' + bCond.value + '&';
  var resp = await invAPI.get(url, { headers: invHeaders() });
  var batches = resp.data.batches || [];

  var html = '<div class="inv-section">';
  html += '<div class="inv-section-header"><h2><i class="fas fa-layer-group"></i> Batches</h2>';
  if (invCanEdit('batches')) html += '<button class="inv-btn inv-btn-primary" onclick="invShowNewBatch()"><i class="fas fa-plus"></i> New Batch</button>';
  html += '</div>';
  html += '<p class="inv-muted">Track condition-based lots. Split batches when hay or product quality varies.</p>';

  // Search & filter bar
  var _bsVal = (bSearch ? bSearch.value : '');
  var _bcVal = (bCond ? bCond.value : '');
  html += '<div class="inv-toolbar">';
  html += '<div class="inv-search-box"><i class="fas fa-search"></i><input id="invBatchSearchInput" type="text" placeholder="Search batches..." value="' + escH(_bsVal) + '" oninput="invDebounceBatchSearch()"></div>';
  html += '<select id="invBatchCondFilter" onchange="invRender()" class="inv-select"><option value="">All Conditions</option>';
  ['good','fair','poor','damaged','rejected'].forEach(function(c) {
    html += '<option value="' + c + '"' + (c === _bcVal ? ' selected' : '') + '>' + c.charAt(0).toUpperCase() + c.slice(1) + '</option>';
  });
  html += '</select>';
  html += '</div>';
  html += '<div class="inv-stock-count">' + batches.length + ' batch' + (batches.length !== 1 ? 'es' : '') + '</div>';

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
        '<button class="inv-btn inv-btn-xs" onclick="invShowSplitBatch(' + b.id + ',' + b.qty + ',\'' + escH(b.batch_number) + '\',\'' + escH(b.product_name) + '\')"><i class="fas fa-scissors"></i> Split</button> ' +
        '<button class="inv-btn inv-btn-xs inv-btn-danger-outline" onclick="invDeleteBatchFromList(' + b.id + ',\'' + escH(b.batch_number).replace(/'/g, "\\'") + '\',' + b.qty + ')" title="Delete batch"><i class="fas fa-trash"></i></button>' +
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
        '<button class="inv-btn inv-btn-xs inv-btn-danger-outline" onclick="invDeleteBatchFromList(' + b.id + ',\'' + escH(b.batch_number).replace(/'/g, "\\'") + '\',' + b.qty + ')"><i class="fas fa-trash"></i> Delete</button>' +
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
  if (invCanEdit('losses')) html += '<button class="inv-btn inv-btn-danger" onclick="invShowReportLoss()"><i class="fas fa-plus"></i> Report Loss</button>';
  html += '</div>';

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

// ==================== AUDIT LOG ==
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

// ==================== CATEGORY CONSOLIDATION PAGE ====================

async function invRenderCategoriesPage() {
  console.log('[Inventory] rendering categories page, cached:', !!invRecatData);
  // Load preview data if not already loaded
  if (!invRecatData) {
    try {
      var resp = await invAPI.get('/api/inventory/products/recategorize-preview', { headers: invHeaders() });
      invRecatData = resp.data;
      console.log('[Inventory] categories data loaded:', (invRecatData.products || []).length, 'products');
    } catch(e) {
      console.error('[Inventory] categories API error:', e);
      return '<div class="inv-section"><div class="inv-empty"><i class="fas fa-exclamation-triangle" style="font-size:36px;color:#DC2626;display:block;margin-bottom:12px"></i>' +
        '<h3>Failed to load classification data</h3><p>' + (e.response?.data?.error || e.message) + '</p>' +
        '<button class="inv-btn inv-btn-primary" onclick="invRecatData=null;invRender()"><i class="fas fa-redo"></i> Retry</button></div></div>';
    }
  }

  var data = invRecatData;
  var products = data.products || [];
  var summary = data.summary || {};
  var byS = summary.by_suggested || {};

  // Apply filters
  var filtered = products;
  if (invRecatFilter === 'changed') {
    filtered = products.filter(function(p) { return p.changed || invRecatOverrides[p.id]; });
  } else if (['hay', 'shavings', 'grain', 'shelf_goods'].indexOf(invRecatFilter) >= 0) {
    filtered = products.filter(function(p) {
      var eff = invRecatOverrides[p.id] || p.suggested_category;
      return eff === invRecatFilter;
    });
  }
  if (invRecatSearch) {
    var s = invRecatSearch.toLowerCase();
    filtered = filtered.filter(function(p) {
      return (p.name || '').toLowerCase().includes(s) || (p.sku || '').toLowerCase().includes(s) || (p.current_category || '').includes(s);
    });
  }

  var overrideCount = Object.keys(invRecatOverrides).length;

  var html = '<div class="inv-section" style="max-width:1200px;margin:16px auto">';

  // Header
  html += '<div class="inv-section-header"><h2><i class="fas fa-wand-magic-sparkles"></i> Category Consolidation</h2></div>';
  html += '<p class="inv-muted" style="margin-bottom:16px">AI-powered classification of <strong>' + summary.total + '</strong> products into 3 categories. Review the suggestions below, override any you disagree with, then apply.</p>';

  // Summary cards
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:20px">';
  var cats = [
    { key: 'hay', icon: 'fa-wheat-awn', color: '#059669', label: 'Hay' },
    { key: 'shavings', icon: 'fa-tree', color: '#D97706', label: 'Shavings' },
    { key: 'grain', icon: 'fa-seedling', color: '#2563EB', label: 'Grain' },
    { key: 'shelf_goods', icon: 'fa-store', color: '#7C3AED', label: 'Shelf Goods' }
  ];
  cats.forEach(function(cat) {
    var count = byS[cat.key] || 0;
    var pct = summary.total > 0 ? Math.round(count / summary.total * 100) : 0;
    var active = invRecatFilter === cat.key ? 'border:2px solid ' + cat.color + ';box-shadow:0 0 0 2px ' + cat.color + '30' : 'border:1px solid #E2E8F0';
    html += '<div style="padding:14px;background:white;border-radius:10px;' + active + ';cursor:pointer;transition:all 0.15s" onclick="invRecatFilter=invRecatFilter===\'' + cat.key + '\'?\'\':' + '\'' + cat.key + '\';invRenderCatPage()">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i class="fas ' + cat.icon + '" style="color:' + cat.color + ';font-size:16px"></i><strong>' + cat.label + '</strong></div>' +
      '<div style="font-size:24px;font-weight:700;color:' + cat.color + '">' + count + '</div>' +
      '<div style="font-size:11px;color:#94A3B8">' + pct + '% of all products</div>' +
      '</div>';
  });
  html += '</div>';

  // Change summary bar
  html += '<div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap">';
  html += '<span style="background:#D1FAE5;color:#065F46;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600"><i class="fas fa-arrows-rotate"></i> ' + summary.changed + ' will change</span>';
  html += '<span style="background:#F1F5F9;color:#64748B;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600">' + summary.unchanged + ' unchanged</span>';
  if (overrideCount > 0) {
    html += '<span style="background:#DBEAFE;color:#1E40AF;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600"><i class="fas fa-pen"></i> ' + overrideCount + ' manual overrides</span>';
  }
  html += '</div>';

  // Filter toolbar
  html += '<div class="inv-toolbar">';
  html += '<div class="inv-search-box"><i class="fas fa-search"></i><input id="invRecatSearchInput" type="text" placeholder="Search products..." value="' + escH(invRecatSearch) + '" oninput="invRecatSearch=this.value;invRenderCatPage()"></div>';
  var filterOpts = [
    { val: '', label: 'All Products (' + summary.total + ')' },
    { val: 'changed', label: 'Changed Only (' + summary.changed + ')' },
    { val: 'hay', label: 'Hay (' + (byS.hay || 0) + ')' },
    { val: 'shavings', label: 'Shavings (' + (byS.shavings || 0) + ')' },
    { val: 'grain', label: 'Grain (' + (byS.grain || 0) + ')' },
    { val: 'shelf_goods', label: 'Shelf Goods (' + (byS.shelf_goods || 0) + ')' }
  ];
  html += '<select class="inv-select" onchange="invRecatFilter=this.value;invRenderCatPage()">';
  filterOpts.forEach(function(o) {
    html += '<option value="' + o.val + '"' + (invRecatFilter === o.val ? ' selected' : '') + '>' + o.label + '</option>';
  });
  html += '</select>';
  html += '<button class="inv-btn inv-btn-primary" onclick="invApplyRecategorize()"><i class="fas fa-check"></i> Apply All</button>';
  html += '<button class="inv-btn inv-btn-outline" onclick="invRecatData=null;invRecatOverrides={};invRender()" title="Re-analyze"><i class="fas fa-redo"></i></button>';
  html += '</div>';

  html += '<div class="inv-stock-count">' + filtered.length + ' products shown</div>';

  // Products table
  html += '<div class="inv-table-wrap"><table class="inv-table inv-table-hover">';
  html += '<thead><tr><th>Product</th><th>SKU</th><th>Current</th><th><i class="fas fa-arrow-right"></i></th><th>New Category</th><th>Subcategory</th><th>Override</th></tr></thead><tbody>';

  var maxShow = 200;
  var shown = filtered.slice(0, maxShow);
  shown.forEach(function(p) {
    var effCat = invRecatOverrides[p.id] || p.suggested_category;
    var hasOverride = invRecatOverrides[p.id] ? true : false;
    var changed = effCat !== p.current_category;
    var rowClass = hasOverride ? 'style="background:#EFF6FF"' : changed ? 'style="background:#F0FDF4"' : '';
    var subLabel = invSubcatLabel(p.suggested_subcategory);
    
    html += '<tr ' + rowClass + '>' +
      '<td><strong>' + escH(p.name) + '</strong></td>' +
      '<td class="inv-muted">' + escH(p.sku || '—') + '</td>' +
      '<td><span class="inv-cat-badge inv-recat-old">' + escH(p.current_category || 'shelf_goods').replace(/_/g, ' ') + '</span></td>' +
      '<td style="text-align:center">' + (changed ? '<i class="fas fa-arrow-right" style="color:#059669"></i>' : '<i class="fas fa-equals" style="color:#CBD5E1"></i>') + '</td>' +
      '<td><span class="inv-cat-badge inv-recat-' + effCat + '">' + invCatLabel(effCat) + '</span></td>' +
      '<td style="font-size:12px;color:#64748B">' + subLabel + '</td>' +
      '<td><select class="inv-select" style="padding:4px 8px;font-size:12px;min-width:110px" onchange="invRecatOverride(' + p.id + ',this.value)">' +
      '<option value=""' + (!hasOverride ? ' selected' : '') + '>AI: ' + invCatLabel(p.suggested_category) + '</option>' +
      '<option value="hay"' + (invRecatOverrides[p.id] === 'hay' ? ' selected' : '') + '>Hay</option>' +
      '<option value="shavings"' + (invRecatOverrides[p.id] === 'shavings' ? ' selected' : '') + '>Shavings</option>' +
      '<option value="grain"' + (invRecatOverrides[p.id] === 'grain' ? ' selected' : '') + '>Grain</option>' +
      '<option value="shelf_goods"' + (invRecatOverrides[p.id] === 'shelf_goods' ? ' selected' : '') + '>Shelf Goods</option>' +
      '</select></td></tr>';
  });

  if (filtered.length > maxShow) {
    html += '<tr><td colspan="7" style="text-align:center;padding:16px;color:#64748B;font-style:italic">' +
      'Showing ' + maxShow + ' of ' + filtered.length + ' — use search or filters to narrow results</td></tr>';
  }

  html += '</tbody></table></div>';
  html += '</div>';
  return html;
}

function invCatLabel(cat) {
  var labels = { hay: 'Hay', shavings: 'Shavings', grain: 'Grain', shelf_goods: 'Shelf Goods' };
  return labels[cat] || (cat || 'shelf_goods').replace(/_/g, ' ').replace(/\b\w/g, function(m) { return m.toUpperCase(); });
}

// Handle __new__ category selection — show/hide inline input
function invHandleCategoryChange(selectId, rowId) {
  var sel = document.getElementById(selectId);
  var row = document.getElementById(rowId);
  if (!sel || !row) return;
  if (sel.value === '__new__') {
    row.style.display = 'block';
    var inp = row.querySelector('input');
    if (inp) { inp.value = ''; inp.focus(); }
  } else {
    row.style.display = 'none';
  }
}

// Resolve actual category value from select + optional new-category input
function invGetCategory(selectId, inputId) {
  var sel = document.getElementById(selectId);
  if (!sel) return 'shelf_goods';
  if (sel.value === '__new__') {
    var inp = document.getElementById(inputId);
    var raw = inp ? inp.value.trim() : '';
    if (!raw) return null; // signal missing
    // Normalize: lowercase, spaces → underscores, strip non-alphanum
    return raw.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  }
  return sel.value;
}

function invSubcatLabel(sub) {
  if (!sub) return '—';
  var labels = {
    hay: 'Hay', bedding: 'Bedding', feed: 'Feed', supplement: 'Supplement',
    dewormer: 'Dewormer', fly_control: 'Fly Control', grooming: 'Grooming',
    hoof_care: 'Hoof Care', first_aid: 'First Aid', tack: 'Tack',
    blankets: 'Blankets', treats: 'Treats', barn_equipment: 'Barn Equipment',
    fencing: 'Fencing', riding_apparel: 'Riding Apparel', pet_supplies: 'Pet Supplies',
    cleaning: 'Cleaning', poultry: 'Poultry', farm_supplies: 'Farm Supplies',
    tools: 'Tools', gift: 'Gift', general: 'General'
  };
  return labels[sub] || sub.replace(/_/g, ' ').replace(/\b\w/g, function(m) { return m.toUpperCase(); });
}

function invRecatOverride(productId, value) {
  if (value) {
    invRecatOverrides[productId] = value;
  } else {
    delete invRecatOverrides[productId];
  }
  // Refresh the page inline
  invRenderCatPage();
}

function invRenderCatPage() {
  // Re-render categories page without reloading data
  var root = document.getElementById('inventory-app');
  if (!root || !invRecatData) return;
  invRenderCategoriesPage().then(function(html) {
    var r = document.getElementById('inventory-app');
    if (r) r.innerHTML = invRenderNav() + html;
  });
}

async function invApplyRecategorize() {
  if (!invRecatData) { invToast('No data to apply', 'warning'); return; }

  var changed = (invRecatData.products || []).filter(function(p) {
    var eff = invRecatOverrides[p.id] || p.suggested_category;
    return eff !== p.current_category;
  }).length;

  if (changed === 0) { invToast('No changes to apply', 'warning'); return; }

  if (!confirm('Apply category consolidation?\n\n' + changed + ' products will be recategorized into:\n- Hay\n- Shavings\n- Shelf Goods\n\n(Subcategories like Feed, Supplement, First Aid will also be set.)\n\nThis action cannot be undone.')) return;

  try {
    var btn = document.querySelector('[onclick*="invApplyRecategorize"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Applying...'; }

    var resp = await invAPI.post('/api/inventory/products/recategorize-apply', {
      overrides: invRecatOverrides
    }, { headers: invHeaders() });

    invToast(resp.data.updated + ' products recategorized!');
    // Clear cached data
    invRecatData = null;
    invRecatOverrides = {};
    // Reload categories list
    await invLoadCategories();
    invRender();
  } catch(e) {
    invToast('Failed: ' + (e.response?.data?.error || e.message), 'error');
    var btn = document.querySelector('[onclick*="invApplyRecategorize"]');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Apply All'; }
  }
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

    // Add packing list / checklist buttons
    var extraBtns = '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
      '<button class="inv-btn inv-btn-outline" onclick="invCloseModal();invShowTransferChecklist(' + t.id + ')"><i class="fas fa-clipboard-check"></i> Checklist</button>' +
      '<button class="inv-btn inv-btn-outline" onclick="invPrintTransferPackingList(' + t.id + ')"><i class="fas fa-print"></i> Print Packing List</button>' +
      '</div>';
    body += extraBtns;

    invShowModal('<i class="fas fa-truck-ramp-box"></i> Transfer Detail', body, invTransferActions(t));
  } catch(e) { invToast('Failed to load transfer', 'error'); }
}
window.invShowTransferDetail = invShowTransferDetail;

// ==================== TRANSFER CHECKLIST ====================

async function invShowTransferChecklist(transferId) {
  try {
    var resp = await invAPI.get('/api/inventory/transfers/' + transferId + '/checklist', { headers: invHeaders() });
    var t = resp.data.transfer;
    var items = resp.data.items || [];
    var totalItems = resp.data.totalItems;
    var checkedItems = resp.data.checkedItems;

    var html = '<div class="inv-transfer-checklist">';
    html += '<div class="inv-section-header">';
    html += '<div><h2><i class="fas fa-clipboard-check"></i> Transfer Checklist</h2>';
    html += '<p class="inv-muted">' + invEsc(t.transfer_number) + ' &mdash; ' + invEsc(t.from_code || '') + ' → ' + invEsc(t.to_code || '') + '</p></div>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    html += '<button class="inv-btn inv-btn-outline" onclick="invRender()"><i class="fas fa-arrow-left"></i> Back</button>';
    html += '<button class="inv-btn inv-btn-outline" onclick="invPrintTransferPackingList(' + transferId + ')"><i class="fas fa-print"></i> Print</button>';
    html += '</div></div>';

    // Progress bar
    var pct = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;
    html += '<div class="inv-sr-stats" style="margin-bottom:16px"><div class="inv-sr-stat-card">' +
      '<div style="font-size:24px;font-weight:700;color:' + (pct === 100 ? '#16A34A' : '#2563EB') + '">' + checkedItems + ' / ' + totalItems + '</div>' +
      '<div class="inv-muted">Items Checked</div>' +
      '<div style="background:#E5E7EB;border-radius:4px;height:8px;margin-top:8px;overflow:hidden">' +
      '<div style="background:' + (pct === 100 ? '#16A34A' : '#2563EB') + ';height:100%;width:' + pct + '%;transition:width .3s"></div></div>' +
      '</div></div>';

    if (checkedItems < totalItems) {
      html += '<div style="margin-bottom:12px"><button class="inv-btn inv-btn-primary" onclick="invTransferCheckAll(' + transferId + ')"><i class="fas fa-check-double"></i> Check All</button> ';
      html += '<button class="inv-btn inv-btn-outline inv-btn-danger" onclick="invTransferChecklistReset(' + transferId + ')"><i class="fas fa-rotate-left"></i> Reset</button></div>';
    } else if (totalItems > 0) {
      html += '<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:12px;margin-bottom:16px;text-align:center">' +
        '<i class="fas fa-circle-check" style="color:#16A34A;font-size:24px"></i><br>' +
        '<strong style="color:#16A34A">All items checked!</strong>' +
        (t.status === 'pending' ? '<br><button class="inv-btn inv-btn-primary" style="margin-top:8px" onclick="invShipTransfer(' + transferId + ')"><i class="fas fa-truck"></i> Ship Transfer</button>' : '') +
        '</div>';
      html += '<button class="inv-btn inv-btn-outline inv-btn-danger" onclick="invTransferChecklistReset(' + transferId + ')"><i class="fas fa-rotate-left"></i> Reset</button> ';
    }

    // Items list
    html += '<div class="inv-transfer-checklist-items">';
    items.forEach(function(item) {
      var checked = item.checked ? ' inv-tcl-checked' : '';
      html += '<div class="inv-tcl-item' + checked + '" onclick="invToggleTransferCheckItem(' + item.id + ',' + transferId + ')">' +
        '<div class="inv-tcl-checkbox"><i class="fas ' + (item.checked ? 'fa-square-check' : 'fa-square') + '"></i></div>' +
        '<div class="inv-tcl-info">' +
          '<strong>' + invEsc(item.product_name) + '</strong>' +
          (item.sku ? '<span class="inv-muted"> (' + invEsc(item.sku) + ')</span>' : '') +
          '<div class="inv-muted">Qty: <strong>' + item.qty_requested + '</strong> ' + invEsc(item.unit_type || '') + '</div>' +
        '</div>' +
        (item.checked_by_name ? '<div class="inv-tcl-who inv-muted"><i class="fas fa-user-check"></i> ' + invEsc(item.checked_by_name) + '</div>' : '') +
        '</div>';
    });
    html += '</div></div>';

    var root = document.getElementById('inventory-app');
    if (root) root.innerHTML = invRenderNav() + html;
  } catch(e) { invToast('Failed to load checklist: ' + (e.response?.data?.error || e.message), 'error'); }
}
window.invShowTransferChecklist = invShowTransferChecklist;

async function invToggleTransferCheckItem(itemId, transferId) {
  try {
    await invAPI.put('/api/inventory/transfer-checklist/' + itemId + '/toggle', {}, { headers: invHeaders() });
    invShowTransferChecklist(transferId);
  } catch(e) { invToast('Toggle failed', 'error'); }
}
window.invToggleTransferCheckItem = invToggleTransferCheckItem;

async function invTransferCheckAll(transferId) {
  try {
    await invAPI.post('/api/inventory/transfers/' + transferId + '/checklist/check-all', {}, { headers: invHeaders() });
    invShowTransferChecklist(transferId);
  } catch(e) { invToast('Check all failed', 'error'); }
}
window.invTransferCheckAll = invTransferCheckAll;

async function invTransferChecklistReset(transferId) {
  if (!confirm('Reset all checks for this transfer?')) return;
  try {
    await invAPI.post('/api/inventory/transfers/' + transferId + '/checklist/reset', {}, { headers: invHeaders() });
    invShowTransferChecklist(transferId);
  } catch(e) { invToast('Reset failed', 'error'); }
}
window.invTransferChecklistReset = invTransferChecklistReset;

function invPrintTransferPackingList(transferId) {
  invAPI.get('/api/inventory/transfers/' + transferId + '/checklist', { headers: invHeaders() }).then(function(resp) {
    var t = resp.data.transfer;
    var items = resp.data.items || [];
    var w = window.open('', '_blank');
    if (!w) { invToast('Pop-up blocked', 'error'); return; }

    var html = '<!DOCTYPE html><html><head><title>Transfer Packing List - ' + invEsc(t.transfer_number) + '</title>' +
      '<style>' +
      'body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }' +
      'h1 { font-size: 20px; margin-bottom: 4px; }' +
      '.meta { color: #666; font-size: 13px; margin-bottom: 16px; }' +
      '.info-row { display: flex; gap: 24px; margin-bottom: 8px; font-size: 14px; }' +
      '.info-row strong { min-width: 60px; }' +
      'table { width: 100%; border-collapse: collapse; margin-top: 16px; }' +
      'th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; font-size: 13px; }' +
      'th { background: #F3F4F6; font-weight: 600; }' +
      '.check-col { width: 40px; text-align: center; }' +
      '.qty-col { width: 60px; text-align: center; }' +
      '.sig-line { margin-top: 40px; display: flex; gap: 40px; }' +
      '.sig-line div { flex: 1; border-top: 1px solid #333; padding-top: 4px; font-size: 12px; color: #666; }' +
      '@media print { body { padding: 10px; } }' +
      '</style></head><body>' +
      '<h1><i>📦</i> Transfer Packing List</h1>' +
      '<div class="meta">Transfer ' + invEsc(t.transfer_number) + ' &bull; Generated ' + new Date().toLocaleDateString() + '</div>' +
      '<div class="info-row"><strong>From:</strong> ' + invEsc(t.from_name || t.from_code || '') + '</div>' +
      '<div class="info-row"><strong>To:</strong> ' + invEsc(t.to_name || t.to_code || '') + '</div>' +
      '<div class="info-row"><strong>Status:</strong> ' + invEsc(t.status) + '</div>' +
      (t.notes ? '<div class="info-row"><strong>Notes:</strong> ' + invEsc(t.notes) + '</div>' : '') +
      '<table><thead><tr><th class="check-col">✓</th><th>Product</th><th>SKU</th><th class="qty-col">Qty</th><th>Unit</th><th>Notes</th></tr></thead><tbody>';

    items.forEach(function(item) {
      html += '<tr>' +
        '<td class="check-col">☐</td>' +
        '<td>' + invEsc(item.product_name) + '</td>' +
        '<td>' + invEsc(item.sku || '') + '</td>' +
        '<td class="qty-col">' + item.qty_requested + '</td>' +
        '<td>' + invEsc(item.unit_type || '') + '</td>' +
        '<td></td></tr>';
    });

    html += '</tbody></table>' +
      '<div class="sig-line">' +
      '<div>Packed by / Date</div>' +
      '<div>Verified by / Date</div>' +
      '<div>Received by / Date</div>' +
      '</div></body></html>';

    w.document.write(html);
    w.document.close();
    setTimeout(function() { w.print(); }, 500);
  }).catch(function(e) { invToast('Failed to load packing list', 'error'); });
}
window.invPrintTransferPackingList = invPrintTransferPackingList;

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

// ==================== SECOND-LAYER MODAL (for order detail from drilldown) ====================

function invShowModal2(title, body, footer) {
  var existing = document.getElementById('invModal2');
  if (existing) existing.remove();
  var modal = document.createElement('div');
  modal.id = 'invModal2';
  modal.className = 'inv-modal-overlay';
  modal.style.zIndex = '10001';
  modal.innerHTML = '<div class="inv-modal" style="max-width:700px">' +
    '<div class="inv-modal-header"><h3>' + title + '</h3><button onclick="invCloseModal2()" class="inv-modal-close"><i class="fas fa-times"></i></button></div>' +
    '<div class="inv-modal-body">' + body + '</div>' +
    (footer ? '<div class="inv-modal-footer">' + footer + '</div>' : '') +
    '</div>';
  modal.onclick = function(e) { if (e.target === modal) invCloseModal2(); };
  document.body.appendChild(modal);
  setTimeout(function() { modal.classList.add('inv-modal-show'); }, 10);
}

function invCloseModal2() {
  var modal = document.getElementById('invModal2');
  if (modal) { modal.classList.remove('inv-modal-show'); setTimeout(function() { modal.remove(); }, 200); }
}

// ==================== ORDER / SALE DETAIL VIEWER ====================

function invViewOrder(id, type) {
  type = type || 'order';
  invShowModal2(
    '<i class="fas fa-spinner fa-spin"></i> Loading...',
    '<div style="text-align:center;padding:40px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#94A3B8"></i></div>',
    ''
  );

  if (type === 'sale') {
    invAPI.get('/api/pos/order-detail/' + id + '?type=sale', { headers: invHeaders() }).then(function(r) {
      var d = r.data;
      var s = d.sale || {};
      var html = '<div style="margin-bottom:16px">';

      // Header
      html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:8px">' +
        '<div><h3 style="margin:0;font-size:18px;font-weight:700">' + escH(s.sale_number || '#' + s.id) + '</h3>' +
        (d.customer ? '<div style="color:#64748B;font-size:13px;margin-top:2px"><i class="fas fa-user"></i> ' + escH(d.customer.business_name || d.customer.contact_name || '') + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        '<span class="inv-drill-status inv-drill-status-' + (s.status || 'new') + '">' + escH(s.status || 'unknown') + '</span>' +
        (s.fulfillment_type ? '<span style="background:#EFF6FF;color:#1E40AF;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600">' + escH(s.fulfillment_type) + '</span>' : '') +
        '</div></div>';

      // Meta info
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:16px;padding:12px;background:#F8FAFC;border-radius:8px">';
      if (s.cashier_name) html += '<div><span class="inv-muted" style="font-size:11px;display:block">Cashier</span><strong style="font-size:13px">' + escH(s.cashier_name) + '</strong></div>';
      if (s.location_name || s.location_id) html += '<div><span class="inv-muted" style="font-size:11px;display:block">Location</span><strong style="font-size:13px">' + escH(s.location_name || 'Location #' + s.location_id) + '</strong></div>';
      if (s.created_at) html += '<div><span class="inv-muted" style="font-size:11px;display:block">Created</span><strong style="font-size:13px">' + invFormatDate(s.created_at) + '</strong></div>';
      if (s.order_id) html += '<div><span class="inv-muted" style="font-size:11px;display:block">Linked Order</span><span class="inv-drill-order" style="cursor:pointer" onclick="invViewOrder(' + s.order_id + ',\'order\')">' + (s.order_number || 'Order #' + s.order_id) + '</span></div>';
      html += '</div>';

      // Line items
      if (d.items && d.items.length > 0) {
        html += '<h4 class="inv-drill-section"><i class="fas fa-list" style="color:#2563EB"></i> Line Items</h4>';
        html += '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="border-bottom:2px solid #E2E8F0"><th style="text-align:left;padding:6px 8px">Product</th><th style="text-align:right;padding:6px 8px">Qty</th><th style="text-align:right;padding:6px 8px">Price</th><th style="text-align:right;padding:6px 8px">Total</th></tr></thead><tbody>';
        d.items.forEach(function(it) {
          var lineTotal = (it.unit_price || 0) * (it.quantity || 0);
          html += '<tr style="border-bottom:1px solid #F1F5F9"><td style="padding:6px 8px">' + escH(it.product_name || 'Product #' + it.product_id) + '</td>' +
            '<td style="text-align:right;padding:6px 8px">' + (it.quantity || 0) + '</td>' +
            '<td style="text-align:right;padding:6px 8px">$' + (it.unit_price || 0).toFixed(2) + '</td>' +
            '<td style="text-align:right;padding:6px 8px;font-weight:600">$' + lineTotal.toFixed(2) + '</td></tr>';
        });
        html += '</tbody></table>';
      }

      // Totals
      html += '<div style="margin-top:12px;padding:12px;background:#F0FDF4;border-radius:8px;display:flex;flex-direction:column;gap:4px;align-items:flex-end">';
      if (s.subtotal != null) html += '<div style="font-size:13px"><span class="inv-muted">Subtotal:</span> $' + (s.subtotal || 0).toFixed(2) + '</div>';
      if (s.discount > 0) html += '<div style="font-size:13px;color:#DC2626"><span class="inv-muted">Discount:</span> -$' + s.discount.toFixed(2) + '</div>';
      if (s.tax > 0) html += '<div style="font-size:13px"><span class="inv-muted">Tax:</span> $' + s.tax.toFixed(2) + '</div>';
      html += '<div style="font-size:16px;font-weight:700;color:#059669"><span>Total: $' + (s.total || 0).toFixed(2) + '</span></div>';
      html += '</div>';

      // Payments
      if (d.payments && d.payments.length > 0) {
        html += '<h4 class="inv-drill-section" style="margin-top:16px"><i class="fas fa-credit-card" style="color:#059669"></i> Payments</h4>';
        d.payments.forEach(function(p) {
          var method = (p.method || '').replace(/_/g, ' ');
          html += '<div class="inv-drill-row">' +
            '<div class="inv-drill-qty"><span style="background:#DCFCE7;color:#166534;padding:3px 8px;border-radius:10px;font-size:12px;font-weight:600">$' + (p.amount || 0).toFixed(2) + '</span></div>' +
            '<div class="inv-drill-info"><strong style="text-transform:capitalize">' + escH(method) + '</strong>' +
            (p.gateway_ref || p.reference_number ? ' <span class="inv-muted">#' + escH(p.gateway_ref || p.reference_number) + '</span>' : '') +
            '<br><span class="inv-muted">' + invFormatDate(p.created_at) + '</span></div></div>';
        });
      }

      // Refunds
      if (d.refunds && d.refunds.length > 0) {
        html += '<h4 class="inv-drill-section" style="margin-top:16px"><i class="fas fa-undo" style="color:#DC2626"></i> Refunds</h4>';
        d.refunds.forEach(function(ref) {
          html += '<div class="inv-drill-row">' +
            '<div class="inv-drill-qty"><span style="background:#FEE2E2;color:#991B1B;padding:3px 8px;border-radius:10px;font-size:12px;font-weight:600">-$' + (ref.amount || 0).toFixed(2) + '</span></div>' +
            '<div class="inv-drill-info"><strong>' + escH(ref.reason || 'Refund') + '</strong>' +
            (ref.refund_items ? '<br><span class="inv-muted">' + escH(ref.refund_items) + '</span>' : '') +
            '<br><span class="inv-muted">' + invFormatDate(ref.created_at) + '</span></div></div>';
        });
      }

      html += '</div>';

      // Footer with navigation to logistics if there's a linked order
      var footer = '';
      if (s.order_id) {
        footer = '<button class="inv-btn inv-btn-primary" onclick="invViewOrder(' + s.order_id + ',\'order\')"><i class="fas fa-truck"></i> View Delivery Order</button>';
      }

      invShowModal2('<i class="fas fa-receipt" style="color:#059669"></i> ' + escH(s.sale_number || 'Sale #' + s.id), html, footer);
    }).catch(function(e) {
      invShowModal2('<i class="fas fa-exclamation-triangle" style="color:#DC2626"></i> Error',
        '<div style="text-align:center;padding:20px;color:#DC2626">' + escH(e.response?.data?.error || e.message) + '</div>', '');
    });
  } else {
    // Order type — use logistics API
    invAPI.get('/api/orders/' + id, { headers: invHeaders() }).then(function(r) {
      var o = r.data.order || {};
      var items = r.data.items || [];
      var html = '<div style="margin-bottom:16px">';

      // Header
      html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:8px">' +
        '<div><h3 style="margin:0;font-size:18px;font-weight:700">' + escH(o.order_number || 'Order #' + o.id) + '</h3>' +
        (o.business_name ? '<div style="color:#64748B;font-size:13px;margin-top:2px"><i class="fas fa-building"></i> ' + escH(o.business_name) + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        '<span class="inv-drill-status inv-drill-status-' + (o.status || 'new') + '">' + escH(o.status || 'unknown') + '</span>' +
        (o.priority && o.priority !== 'normal' ? '<span style="background:#FEF2F2;color:#991B1B;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;text-transform:uppercase">' + escH(o.priority) + '</span>' : '') +
        '</div></div>';

      // Meta info
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:16px;padding:12px;background:#F8FAFC;border-radius:8px">';
      if (o.contact_name) html += '<div><span class="inv-muted" style="font-size:11px;display:block">Contact</span><strong style="font-size:13px">' + escH(o.contact_name) + '</strong></div>';
      if (o.customer_phone) html += '<div><span class="inv-muted" style="font-size:11px;display:block">Phone</span><strong style="font-size:13px">' + escH(o.customer_phone) + '</strong></div>';
      if (o.scheduled_date) html += '<div><span class="inv-muted" style="font-size:11px;display:block">Scheduled</span><strong style="font-size:13px">' + o.scheduled_date + '</strong></div>';
      if (o.created_at) html += '<div><span class="inv-muted" style="font-size:11px;display:block">Created</span><strong style="font-size:13px">' + invFormatDate(o.created_at) + '</strong></div>';
      html += '</div>';

      // Delivery address
      if (o.street) {
        html += '<div style="padding:10px 14px;background:#EFF6FF;border-radius:8px;border-left:3px solid #2563EB;margin-bottom:16px">' +
          '<div style="font-size:11px;color:#1D4ED8;font-weight:600;margin-bottom:4px"><i class="fas fa-map-marker-alt"></i> Delivery Address</div>' +
          '<div style="font-size:13px">' + escH(o.street) + ', ' + escH(o.city || '') + ' ' + escH(o.state || '') + ' ' + escH(o.zip || '') + '</div>' +
          (o.gate_code ? '<div style="font-size:12px;color:#D97706;margin-top:4px"><i class="fas fa-key"></i> Gate: ' + escH(o.gate_code) + '</div>' : '') +
          (o.address_notes ? '<div style="font-size:12px;color:#64748B;margin-top:2px"><i class="fas fa-sticky-note"></i> ' + escH(o.address_notes) + '</div>' : '') +
          '</div>';
      }

      // Route info
      if (o.route_number) {
        html += '<div style="padding:10px 14px;background:#F5F3FF;border-radius:8px;border-left:3px solid #7C3AED;margin-bottom:16px">' +
          '<div style="font-size:11px;color:#7C3AED;font-weight:600;margin-bottom:4px"><i class="fas fa-route"></i> Assigned Route</div>' +
          '<div style="font-size:13px">' + escH(o.route_number) + (o.route_date ? ' &middot; ' + o.route_date : '') +
          (o.route_status ? ' &middot; <span class="inv-drill-status inv-drill-status-' + o.route_status + '">' + escH(o.route_status) + '</span>' : '') + '</div></div>';
      }

      // Special instructions
      if (o.special_instructions) {
        html += '<div style="padding:10px 14px;background:#FFF7ED;border-radius:8px;border-left:3px solid #D97706;margin-bottom:16px">' +
          '<div style="font-size:11px;color:#D97706;font-weight:600;margin-bottom:4px"><i class="fas fa-exclamation-circle"></i> Special Instructions</div>' +
          '<div style="font-size:13px">' + escH(o.special_instructions) + '</div></div>';
      }

      // Line items
      if (items.length > 0) {
        html += '<h4 class="inv-drill-section"><i class="fas fa-list" style="color:#2563EB"></i> Order Items</h4>';
        html += '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="border-bottom:2px solid #E2E8F0"><th style="text-align:left;padding:6px 8px">Product</th><th style="text-align:left;padding:6px 8px">SKU</th><th style="text-align:right;padding:6px 8px">Qty</th><th style="text-align:right;padding:6px 8px">Weight</th></tr></thead><tbody>';
        var totalWeight = 0;
        items.forEach(function(it) {
          var w = it.weight_subtotal || ((it.weight_per_unit || 0) * (it.quantity || 0));
          totalWeight += w;
          html += '<tr style="border-bottom:1px solid #F1F5F9"><td style="padding:6px 8px">' + escH(it.product_name || '') + '</td>' +
            '<td style="padding:6px 8px;color:#64748B;font-size:12px">' + escH(it.sku || '—') + '</td>' +
            '<td style="text-align:right;padding:6px 8px;font-weight:600">' + (it.quantity || 0) + '</td>' +
            '<td style="text-align:right;padding:6px 8px">' + (w > 0 ? w.toLocaleString() + ' lbs' : '—') + '</td></tr>';
        });
        if (totalWeight > 0) {
          html += '<tr style="border-top:2px solid #E2E8F0"><td colspan="3" style="text-align:right;padding:6px 8px;font-weight:600">Total Weight</td><td style="text-align:right;padding:6px 8px;font-weight:700">' + totalWeight.toLocaleString() + ' lbs</td></tr>';
        }
        html += '</tbody></table>';
      }

      html += '</div>';

      // Footer — open in logistics module
      var footer = '<button class="inv-btn inv-btn-outline" onclick="invCloseModal2();invCloseModal();launchModule(\'logistics\',\'orders\');setTimeout(function(){if(typeof navigate===\'function\')navigate(\'orders\',{viewId:' + o.id + '})},800)"><i class="fas fa-external-link-alt"></i> Open in Logistics</button>';

      invShowModal2('<i class="fas fa-truck" style="color:#2563EB"></i> ' + escH(o.order_number || 'Order #' + o.id), html, footer);
    }).catch(function(e) {
      invShowModal2('<i class="fas fa-exclamation-triangle" style="color:#DC2626"></i> Error',
        '<div style="text-align:center;padding:20px;color:#DC2626">' + escH(e.response?.data?.error || e.message) + '</div>', '');
    });
  }
}

// ==================== STOCK DRILLDOWN POPUPS ====================

// Drill into a stock number — shows WHO is holding/reserving/ordering inventory
async function invStockDrilldown(productId, locationId, field, productName) {
  try {
    var resp = await invAPI.get('/api/inventory/stock-drilldown/' + productId + '/' + locationId, { headers: invHeaders() });
    var d = resp.data;
    var body = '';

    if (field === 'on_hold' || field === 'all') {
      // POS Held Sales
      var posHolds = d.pos_holds || [];
      var deliveryHolds = d.delivery_holds || [];
      var manualHolds = d.manual_holds || [];
      var manualOrderHolds = d.manual_order_holds || [];
      var totalHoldQty = 0;

      if (posHolds.length > 0) {
        body += '<h4 class="inv-drill-section"><i class="fas fa-pause-circle" style="color:#D97706"></i> Held Sales</h4>';
        posHolds.forEach(function(h) {
          totalHoldQty += h.quantity || 0;
          body += '<div class="inv-drill-row">' +
            '<div class="inv-drill-qty"><span class="inv-hold-badge">' + h.quantity + '</span></div>' +
            '<div class="inv-drill-info">' +
            '<span class="inv-drill-order" style="cursor:pointer" onclick="invViewOrder(' + h.sale_id + ',\'sale\')">' + escH(h.sale_number) + '</span>' +
            (h.customer_name ? ' — ' + escH(h.customer_name) : ' — Walk-in') +
            '<br><span class="inv-muted"><i class="fas fa-user"></i> ' + escH(h.cashier_name || 'Unknown') +
            ' &middot; ' + invFormatDate(h.created_at) + '</span>' +
            (h.notes ? '<br><span class="inv-muted"><i class="fas fa-sticky-note"></i> ' + escH(h.notes) + '</span>' : '') +
            '</div></div>';
        });
      }

      if (deliveryHolds.length > 0) {
        body += '<h4 class="inv-drill-section"><i class="fas fa-truck" style="color:#2563EB"></i> Delivery Orders (Awaiting Shipment)</h4>';
        deliveryHolds.forEach(function(h) {
          totalHoldQty += h.quantity || 0;
          var statusLabel = h.order_status === 'new' ? 'Unrouted' : h.order_status === 'confirmed' ? 'Confirmed' : h.order_status === 'scheduled' ? 'Scheduled' : h.order_status || 'Pending';
          body += '<div class="inv-drill-row">' +
            '<div class="inv-drill-qty"><span class="inv-hold-badge">' + h.quantity + '</span></div>' +
            '<div class="inv-drill-info">' +
            '<span class="inv-drill-order" style="cursor:pointer" onclick="invViewOrder(' + h.sale_id + ',\'sale\')">' + escH(h.sale_number) + '</span>' +
            (h.order_number ? ' → <span class="inv-drill-order" style="cursor:pointer" onclick="invViewOrder(' + (h.order_id || 0) + ',\'order\')">' + escH(h.order_number) + '</span>' : '') +
            (h.customer_name ? ' — ' + escH(h.customer_name) : '') +
            '<br><span class="inv-muted"><i class="fas fa-route"></i> ' + escH(h.fulfillment_type) +
            ' &middot; <span class="inv-drill-status inv-drill-status-' + (h.order_status || 'new') + '">' + statusLabel + '</span>' +
            (h.scheduled_date ? ' &middot; <i class="fas fa-calendar"></i> ' + h.scheduled_date : '') +
            '</span></div></div>';
        });
      }

      if (manualOrderHolds.length > 0) {
        body += '<h4 class="inv-drill-section"><i class="fas fa-clipboard-list" style="color:#7C3AED"></i> Manual Orders (Pending)</h4>';
        manualOrderHolds.forEach(function(h) {
          totalHoldQty += h.quantity || 0;
          body += '<div class="inv-drill-row">' +
            '<div class="inv-drill-qty"><span class="inv-hold-badge">' + h.quantity + '</span></div>' +
            '<div class="inv-drill-info">' +
            '<span class="inv-drill-order" style="cursor:pointer" onclick="invViewOrder(' + h.order_id + ',\'order\')">' + escH(h.order_number) + '</span>' +
            (h.customer_name ? ' — ' + escH(h.customer_name) : '') +
            '<br><span class="inv-muted"><span class="inv-drill-status inv-drill-status-' + h.order_status + '">' + escH(h.order_status) + '</span>' +
            (h.scheduled_date ? ' &middot; <i class="fas fa-calendar"></i> ' + h.scheduled_date : '') +
            '</span></div></div>';
        });
      }

      if (manualHolds.length > 0) {
        body += '<h4 class="inv-drill-section"><i class="fas fa-hand" style="color:#DC2626"></i> Manual Holds</h4>';
        manualHolds.forEach(function(h) {
          totalHoldQty += h.qty || 0;
          body += '<div class="inv-drill-row">' +
            '<div class="inv-drill-qty"><span class="inv-hold-badge">' + h.qty + '</span></div>' +
            '<div class="inv-drill-info">' +
            '<strong>' + escH(h.reason) + '</strong>' +
            (h.notes ? ' — ' + escH(h.notes) : '') +
            '<br><span class="inv-muted">' + escH(h.created_by_name || 'System') + ' &middot; ' + invFormatDate(h.created_at) + '</span>' +
            '</div></div>';
        });
      }

      if (totalHoldQty === 0) {
        body += '<p class="inv-muted" style="text-align:center;padding:20px">No active holds for this product at this location.</p>';
      }

      // Add manual hold button
      if (invCanEdit('stock')) {
        body += '<div style="border-top:1px solid #E5E7EB;margin-top:16px;padding-top:12px;text-align:center">';
        body += '<button class="inv-btn inv-btn-sm" style="background:#D97706;color:#fff" onclick="invShowHoldOrReserve(' + productId + ',' + locationId + ',\'' + escH(productName).replace(/'/g, "\\'") + '\',\'hold\')">';
        body += '<i class="fas fa-lock"></i> Place Manual Hold</button>';
        body += '</div>';
      }
    }

    if (field === 'reserved') {
      var reservations = d.reservations || [];
      if (reservations.length > 0) {
        body += '<h4 class="inv-drill-section"><i class="fas fa-bookmark" style="color:#0891B2"></i> Active Reservations</h4>';
        reservations.forEach(function(r) {
          body += '<div class="inv-drill-row">' +
            '<div class="inv-drill-qty"><span class="inv-res-badge">' + r.qty + '</span></div>' +
            '<div class="inv-drill-info">' +
            (r.customer_name ? '<strong>' + escH(r.customer_name) + '</strong>' : '<strong>No customer</strong>') +
            (r.order_number ? ' — Order <span class="inv-drill-order" style="cursor:pointer" onclick="invViewOrder(' + (r.order_id || 0) + ',\'order\')">' + escH(r.order_number) + '</span>' : '') +
            '<br><span class="inv-muted">' + escH(r.created_by_name || 'System') + ' &middot; ' + invFormatDate(r.created_at) +
            (r.notes ? ' &middot; ' + escH(r.notes) : '') + '</span>' +
            '</div></div>';
        });
      } else {
        body += '<p class="inv-muted" style="text-align:center;padding:20px">No active reservations for this product at this location.</p>';
      }

      // Add reservation button
      if (invCanEdit('stock')) {
        body += '<div style="border-top:1px solid #E5E7EB;margin-top:16px;padding-top:12px;text-align:center">';
        body += '<button class="inv-btn inv-btn-sm" style="background:#0891B2;color:#fff" onclick="invShowHoldOrReserve(' + productId + ',' + locationId + ',\'' + escH(productName).replace(/'/g, "\\'") + '\',\'reserve\')">';
        body += '<i class="fas fa-bookmark"></i> Add Reservation</button>';
        body += '</div>';
      }
    }

    // Recent audit trail
    if (d.recent_audit && d.recent_audit.length > 0) {
      body += '<h4 class="inv-drill-section" style="margin-top:16px"><i class="fas fa-history" style="color:#6B7280"></i> Recent Activity</h4>';
      body += '<div class="inv-drill-audit">';
      d.recent_audit.forEach(function(a) {
        var icon = a.action === 'sale' ? 'fa-cash-register' : a.action === 'hold' ? 'fa-pause' : a.action === 'hold_release' ? 'fa-play' :
          a.action === 'shipment' ? 'fa-truck' : a.action === 'count' ? 'fa-clipboard-check' : a.action === 'receive' ? 'fa-dolly' : 'fa-circle-info';
        var changeStr = a.qty_change > 0 ? '+' + a.qty_change : a.qty_change < 0 ? '' + a.qty_change : '';
        body += '<div class="inv-drill-audit-row">' +
          '<i class="fas ' + icon + ' inv-muted"></i> ' +
          '<span class="inv-drill-audit-change' + (a.qty_change > 0 ? ' inv-drill-pos' : a.qty_change < 0 ? ' inv-drill-neg' : '') + '">' + changeStr + '</span> ' +
          '<span>' + escH(a.reason || a.action) + '</span>' +
          '<span class="inv-muted" style="margin-left:auto;font-size:11px">' + escH(a.user_name || '') + ' &middot; ' + invFormatDate(a.created_at) + '</span>' +
          '</div>';
      });
      body += '</div>';
    }

    var titleIcon = field === 'on_hold' ? 'fa-lock' : field === 'reserved' ? 'fa-bookmark' : 'fa-boxes-stacked';
    var titleColor = field === 'on_hold' ? '#D97706' : field === 'reserved' ? '#0891B2' : '#059669';
    var titleText = field === 'on_hold' ? 'On Hold' : field === 'reserved' ? 'Reserved' : 'Stock Detail';
    invShowModal('<i class="fas ' + titleIcon + '" style="color:' + titleColor + '"></i> ' + escH(productName) + ' — ' + titleText, body, '');
  } catch(e) { invToast('Failed to load stock detail: ' + (e.response?.data?.error || e.message), 'error'); }
}

// ==================== HOLD vs RESERVE EXPLAINER + FORMS ====================

function invShowHoldOrReserve(productId, locationId, productName, intent) {
  var isHold = intent === 'hold';

  var body = '<div style="margin-bottom:16px;padding:14px;background:#FFF7ED;border:1px solid #FDE68A;border-radius:10px">';
  body += '<div style="display:flex;align-items:flex-start;gap:10px">';
  body += '<i class="fas fa-circle-info" style="color:#D97706;font-size:18px;margin-top:2px"></i>';
  body += '<div style="font-size:13px;line-height:1.5;color:#78350F">';
  body += '<strong style="font-size:14px">Which do you need?</strong><br><br>';

  body += '<div style="display:flex;gap:12px;flex-wrap:wrap">';

  // Hold card
  body += '<div style="flex:1;min-width:200px;padding:12px;border-radius:8px;border:2px solid ' + (isHold ? '#D97706' : '#E5E7EB') + ';background:' + (isHold ? '#FFFBEB' : '#fff') + '">';
  body += '<div style="font-weight:700;color:#92400E;margin-bottom:6px"><i class="fas fa-lock" style="color:#D97706"></i> Hold</div>';
  body += '<div style="font-size:12px;color:#78350F">Set aside stock <strong>temporarily</strong> — not tied to a specific order. Use for damaged items, pending returns, or internal needs.</div>';
  body += '<div style="margin-top:8px;font-size:11px;color:#92400E"><i class="fas fa-arrow-right"></i> You release it manually when done</div>';
  if (!isHold) {
    body += '<button class="inv-btn inv-btn-xs" style="margin-top:8px;background:#D97706;color:#fff;border:none" onclick="invShowHoldOrReserve(' + productId + ',' + locationId + ',\'' + escH(productName).replace(/'/g, "\\'") + '\',\'hold\')"><i class="fas fa-arrow-right"></i> Switch to Hold</button>';
  }
  body += '</div>';

  // Reserve card
  body += '<div style="flex:1;min-width:200px;padding:12px;border-radius:8px;border:2px solid ' + (!isHold ? '#0891B2' : '#E5E7EB') + ';background:' + (!isHold ? '#ECFEFF' : '#fff') + '">';
  body += '<div style="font-weight:700;color:#155E75;margin-bottom:6px"><i class="fas fa-bookmark" style="color:#0891B2"></i> Reservation</div>';
  body += '<div style="font-size:12px;color:#164E63">Save stock <strong>for a specific customer</strong> who hasn\'t placed an order yet. Use when a customer calls to request something.</div>';
  body += '<div style="margin-top:8px;font-size:11px;color:#155E75"><i class="fas fa-arrow-right"></i> Fulfilled when they order, or cancelled</div>';
  if (isHold) {
    body += '<button class="inv-btn inv-btn-xs" style="margin-top:8px;background:#0891B2;color:#fff;border:none" onclick="invShowHoldOrReserve(' + productId + ',' + locationId + ',\'' + escH(productName).replace(/'/g, "\\'") + '\',\'reserve\')"><i class="fas fa-arrow-right"></i> Switch to Reservation</button>';
  }
  body += '</div>';

  body += '</div>'; // flex row
  body += '</div></div></div>'; // info box

  // Product info
  body += '<div style="padding:10px;background:#F1F5F9;border-radius:8px;margin-bottom:12px;font-size:13px">';
  body += '<strong>' + escH(productName) + '</strong>';
  var locName = '';
  invLocations.forEach(function(l) { if (l.id == locationId) locName = l.name; });
  body += ' <span class="inv-loc-badge">' + escH(locName) + '</span>';
  body += '</div>';

  // Form
  body += '<div class="inv-form-group"><label>Quantity *</label><input type="number" min="1" class="inv-input" id="invHoldResQty" placeholder="How many units?" inputmode="numeric"></div>';

  if (isHold) {
    body += '<div class="inv-form-group"><label>Reason *</label><select class="inv-select" id="invHoldReason">';
    body += '<option value="manual">Manual hold</option>';
    body += '<option value="damaged">Damaged / Defective</option>';
    body += '<option value="pending_return">Pending Return</option>';
    body += '<option value="quality_check">Quality Check</option>';
    body += '<option value="other">Other</option>';
    body += '</select></div>';
  } else {
    // Reservation — customer picker
    body += '<div class="inv-form-group"><label>Customer</label><input type="text" class="inv-input" id="invResCustomerSearch" placeholder="Search customer..." oninput="invSearchCustomersForRes()"><select class="inv-select" id="invResCustomer" style="margin-top:4px"><option value="">— No specific customer —</option></select></div>';
  }

  body += '<div class="inv-form-group"><label>Notes</label><textarea class="inv-input" id="invHoldResNotes" rows="2" placeholder="Optional notes..."></textarea></div>';

  var titleIcon = isHold ? 'fa-lock' : 'fa-bookmark';
  var titleColor = isHold ? '#D97706' : '#0891B2';
  var titleText = isHold ? 'Place Hold' : 'Add Reservation';
  var btnColor = isHold ? '#D97706' : '#0891B2';

  var footer = '<button class="inv-btn" style="background:' + btnColor + ';color:#fff" onclick="invSubmitHoldOrReserve(' + productId + ',' + locationId + ',\'' + (isHold ? 'hold' : 'reserve') + '\')"><i class="fas ' + titleIcon + '"></i> ' + titleText + '</button>';

  invShowModal('<i class="fas ' + titleIcon + '" style="color:' + titleColor + '"></i> ' + titleText + ' — ' + escH(productName), body, footer);
}
window.invShowHoldOrReserve = invShowHoldOrReserve;

var _invResSearchTimeout = null;
function invSearchCustomersForRes() {
  clearTimeout(_invResSearchTimeout);
  _invResSearchTimeout = setTimeout(async function() {
    var q = (document.getElementById('invResCustomerSearch') || {}).value || '';
    if (q.length < 2) return;
    try {
      var resp = await invAPI.get('/api/customers?search=' + encodeURIComponent(q) + '&limit=20', { headers: invHeaders() });
      var customers = resp.data.customers || resp.data || [];
      var sel = document.getElementById('invResCustomer');
      if (!sel) return;
      sel.innerHTML = '<option value="">— No specific customer —</option>';
      customers.forEach(function(c) {
        sel.innerHTML += '<option value="' + c.id + '">' + escH(c.business_name || c.name || 'Customer #' + c.id) + '</option>';
      });
      if (customers.length === 1) sel.value = customers[0].id;
    } catch(e) {}
  }, 300);
}
window.invSearchCustomersForRes = invSearchCustomersForRes;

async function invSubmitHoldOrReserve(productId, locationId, type) {
  var qty = parseInt((document.getElementById('invHoldResQty') || {}).value);
  var notes = (document.getElementById('invHoldResNotes') || {}).value || '';

  if (!qty || qty <= 0) { invToast('Enter a quantity', 'warning'); return; }

  try {
    if (type === 'hold') {
      var reason = (document.getElementById('invHoldReason') || {}).value || 'manual';
      await invAPI.post('/api/inventory/holds', {
        product_id: productId,
        location_id: locationId,
        qty: qty,
        reason: reason,
        notes: notes || null
      }, { headers: invHeaders() });
      invToast(qty + ' unit(s) placed on hold', 'success');
    } else {
      var customerId = parseInt((document.getElementById('invResCustomer') || {}).value) || null;
      await invAPI.post('/api/inventory/reservations', {
        product_id: productId,
        location_id: locationId,
        qty: qty,
        customer_id: customerId,
        notes: notes || null
      }, { headers: invHeaders() });
      invToast(qty + ' unit(s) reserved', 'success');
    }
    invCloseModal();
    invRender();
  } catch(e) {
    invToast('Failed: ' + (e.response?.data?.error || e.message), 'error');
  }
}
window.invSubmitHoldOrReserve = invSubmitHoldOrReserve;

// Show incoming POs for a product
async function invShowIncoming(productId, locationId, productName) {
  try {
    var url = '/api/inventory/incoming/' + productId;
    if (locationId) url += '?location_id=' + locationId;
    var resp = await invAPI.get(url, { headers: invHeaders() });
    var incoming = resp.data.incoming || [];
    var totalIncoming = resp.data.total_incoming || 0;
    var body = '';

    if (incoming.length === 0) {
      body += '<div style="text-align:center;padding:30px"><i class="fas fa-box-open fa-2x inv-muted" style="margin-bottom:12px;display:block"></i>' +
        '<p class="inv-muted">No purchase orders pending for this product.</p></div>';
    } else {
      body += '<div class="inv-drill-summary">' +
        '<div class="inv-drill-summary-num" style="color:#059669"><i class="fas fa-truck-ramp-box"></i> ' + totalIncoming + ' total incoming</div>' +
        '</div>';

      // Group by PO
      var byPO = {};
      incoming.forEach(function(item) {
        if (!byPO[item.po_id]) byPO[item.po_id] = { po: item, items: [] };
        byPO[item.po_id].items.push(item);
      });

      Object.values(byPO).forEach(function(group) {
        var po = group.po;
        var poQty = group.items.reduce(function(s, i) { return s + (i.qty_remaining || 0); }, 0);
        var statusClass = po.po_status === 'in_transit' ? 'transit' : po.po_status === 'delayed' ? 'delayed' : po.po_status === 'partial' ? 'partial' : 'ordered';

        body += '<div class="inv-drill-po-card">' +
          '<div class="inv-drill-po-header">' +
          '<div>' +
          '<strong>' + escH(po.po_number) + '</strong>' +
          (po.supplier_name ? ' — <span class="inv-muted">' + escH(po.supplier_name) + '</span>' : '') +
          '</div>' +
          '<span class="inv-drill-po-status inv-drill-po-' + statusClass + '">' + escH(po.po_status) + '</span>' +
          '</div>';

        // ETA row
        if (po.expected_date) {
          var today = new Date(); today.setHours(0,0,0,0);
          var eta = new Date(po.expected_date + 'T00:00:00'); eta.setHours(0,0,0,0);
          var diff = Math.ceil((eta - today) / 86400000);
          var etaLabel = diff < 0 ? Math.abs(diff) + ' days overdue' : diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff + ' days away';
          var etaColor = diff < 0 ? '#DC2626' : diff <= 2 ? '#D97706' : '#059669';
          body += '<div class="inv-drill-po-eta">' +
            '<i class="fas fa-calendar-day" style="color:' + etaColor + '"></i> ' +
            '<strong style="color:' + etaColor + '">ETA: ' + po.expected_date + '</strong>' +
            ' <span class="inv-muted">(' + etaLabel + ')</span>' +
            '</div>';
        } else {
          body += '<div class="inv-drill-po-eta"><i class="fas fa-question-circle inv-muted"></i> <span class="inv-muted">No ETA set</span></div>';
        }

        body += '<div class="inv-drill-po-qty">' +
          '<span class="inv-incoming-badge">' + poQty + ' incoming</span>' +
          '<span class="inv-muted" style="margin-left:8px">' + escH(po.location_code) + '</span>' +
          '</div>';

        if (po.po_notes) {
          body += '<div class="inv-muted" style="font-size:12px;margin-top:4px"><i class="fas fa-sticky-note"></i> ' + escH(po.po_notes) + '</div>';
        }

        body += '</div>';
      });
    }

    invShowModal('<i class="fas fa-truck-ramp-box" style="color:#059669"></i> ' + escH(productName) + ' — Incoming', body, '');
  } catch(e) { invToast('Failed to load incoming data: ' + (e.response?.data?.error || e.message), 'error'); }
}

// Format date helper — use invFormatDate() in utilities section below

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
      body += '<div class="inv-product-info-row"><span class="inv-muted">Category</span><span class="inv-cat-badge inv-cat-' + (product.category || 'shelf_goods') + '">' + escH((product.category || 'shelf_goods').replace(/_/g, ' ')) + '</span></div>';
      if (product.subcategory) {
        body += '<div class="inv-product-info-row"><span class="inv-muted">Subcategory</span><span>' + invSubcatLabel(product.subcategory) + '</span></div>';
      }
      body += '<div class="inv-product-info-row"><span class="inv-muted">Unit</span><span>' + escH(product.unit_type || 'each') + '</span></div>';
      body += '<div class="inv-product-info-row"><span class="inv-muted">Primary Vendor</span><strong>' + escH(product.primary_vendor_name || '\u2014 None') + '</strong></div>';
      if (product.vendors && product.vendors.length > 0) {
        var vendorNames = product.vendors.map(function(v) { return escH(v.vendor_name) + (v.is_primary ? ' \u2605' : ''); }).join(', ');
        body += '<div class="inv-product-info-row"><span class="inv-muted">All Vendors</span><span style="font-size:12px">' + vendorNames + '</span></div>';
      }
      if (invCanViewFin() || invCanEditPricing()) {
        var _cep = invCanEditPricing();
        var _editBtn = function(field, pid) {
          return _cep ? ' <button class="inv-btn inv-btn-xs" style="padding:1px 6px;font-size:10px;background:none;color:#6366F1;border:1px solid #E2E8F0;border-radius:4px;cursor:pointer" onclick="invInlinePriceEdit(' + pid + ',\'' + field + '\')" title="Edit ' + field + '"><i class="fas fa-pen" style="font-size:9px"></i></button>' : '';
        };
        body += '<div class="inv-product-info-row"><span class="inv-muted">Sell Price</span><span><strong style="color:#059669" id="invDetailPrice">$' + (product.price || 0).toFixed(2) + '</strong>' + _editBtn('price', productId) + '</span></div>';
        body += '<div class="inv-product-info-row"><span class="inv-muted">Cost</span><span><strong style="color:#DC2626" id="invDetailCost">$' + (product.cost || 0).toFixed(2) + '</strong>' + _editBtn('cost', productId) + '</span></div>';
        body += '<div class="inv-product-info-row"><span class="inv-muted">Margin</span><span id="invDetailMargin">' + margin + '%</span></div>';
        body += '<div class="inv-product-info-row"><span class="inv-muted">Tax Rate</span><span><span id="invDetailTaxRate">' + (product.tax_rate || 0) + '%</span>' + _editBtn('tax_rate', productId) + '</span></div>';
      } else {
        body += '<div class="inv-product-info-row"><span class="inv-muted">Tax Rate</span><span>' + (product.tax_rate || 0) + '%</span></div>';
      }
      body += '<div class="inv-product-info-row"><span class="inv-muted">Status</span><span class="inv-cat-badge ' + (product.active ? 'inv-cat-supplement' : 'inv-cat-other') + '">' + (product.active ? 'Active' : 'Inactive') + '</span></div>';
      body += '</div>';
    }

    body += '<h4 style="margin-top:16px">Stock by Location</h4>';
    var incomingData = resp.data.incoming || [];
    if (stock.length === 0) {
      body += '<p class="inv-muted">No stock records for this product.</p>';
    } else {
      var _canEditStock = invCanEdit('stock');
      body += '<table class="inv-table inv-table-compact"><thead><tr><th>Location</th><th>On Hand</th><th>Hold</th><th>Reserved</th><th>Available</th><th>Incoming</th>' + (_canEditStock ? '<th></th>' : '') + '</tr></thead><tbody>';
      stock.forEach(function(s) {
        var avail = (s.qty_on_hand || 0) - (s.qty_on_hold || 0) - (s.qty_reserved || 0);
        var locIncoming = incomingData.filter(function(i) { return i.location_id === s.location_id; }).reduce(function(sum, i) { return sum + (i.qty_remaining || i.qty_ordered - i.qty_received || 0); }, 0);
        var _pnEsc = escH(pName).replace(/'/g, "\\'");
        body += '<tr><td><span class="inv-loc-badge">' + escH(s.location_code) + '</span> ' + escH(s.location_name) + '</td>' +
          '<td><span class="inv-num-click" onclick="invStockDrilldown(' + productId + ',' + s.location_id + ',\'all\',\'' + _pnEsc + '\')"><strong>' + s.qty_on_hand + '</strong></span></td>' +
          '<td>' + (s.qty_on_hold ? '<span class="inv-hold-badge inv-num-click" onclick="invStockDrilldown(' + productId + ',' + s.location_id + ',\'on_hold\',\'' + _pnEsc + '\')">' + s.qty_on_hold + '</span>' : '0') + '</td>' +
          '<td>' + (s.qty_reserved ? '<span class="inv-res-badge inv-num-click" onclick="invStockDrilldown(' + productId + ',' + s.location_id + ',\'reserved\',\'' + _pnEsc + '\')">' + s.qty_reserved + '</span>' : '0') + '</td>' +
          '<td class="' + (avail <= 0 ? 'inv-danger' : '') + '"><strong>' + avail + '</strong></td>' +
          '<td>' + (locIncoming > 0 ? '<span class="inv-incoming-badge inv-num-click" onclick="invShowIncoming(' + productId + ',' + s.location_id + ',\'' + _pnEsc + '\')">' + locIncoming + '</span>' : '<span class="inv-muted">—</span>') + '</td>' +
          (_canEditStock ? '<td style="white-space:nowrap">' +
            '<button class="inv-btn inv-btn-xs" style="background:#D97706;color:#fff;padding:2px 5px;font-size:10px" onclick="invShowHoldOrReserve(' + productId + ',' + s.location_id + ',\'' + _pnEsc + '\',\'hold\')" title="Place Hold"><i class="fas fa-lock"></i></button> ' +
            '<button class="inv-btn inv-btn-xs" style="background:#0891B2;color:#fff;padding:2px 5px;font-size:10px" onclick="invShowHoldOrReserve(' + productId + ',' + s.location_id + ',\'' + _pnEsc + '\',\'reserve\')" title="Reserve"><i class="fas fa-bookmark"></i></button>' +
            '</td>' : '') +
          '</tr>';
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
        body += '<div class="inv-detail-item"><span class="inv-res-badge">' + r.qty + ' reserved</span> at ' + escH(r.location_name) + (r.customer_name ? ' for ' + escH(r.customer_name) : '') + (r.order_number ? ' (Order <span class="inv-drill-order" style="cursor:pointer" onclick="invViewOrder(' + (r.order_id || 0) + ',\'order\')">' + escH(r.order_number) + '</span>)' : '') + '</div>';
      });
    }

    // Cost History section (financial permission required)
    if (invCanViewFin() || invCanEditPricing()) {
      try {
        var chResp = await invAPI.get('/api/purchasing/cost-history/' + productId, { headers: invHeaders() });
        var costHistory = chResp.data.history || [];
        if (costHistory.length > 0) {
          body += '<h4 style="margin-top:16px"><i class="fas fa-chart-line" style="color:#6366F1"></i> Cost History</h4>';
          body += '<table class="inv-table inv-table-compact"><thead><tr><th>Date</th><th>Old Cost</th><th>New Cost</th><th>Change</th><th>Source</th><th>Reference</th></tr></thead><tbody>';
          costHistory.forEach(function(ch) {
            var diff = ch.new_cost - ch.old_cost;
            var diffPct = ch.old_cost > 0 ? ((diff / ch.old_cost) * 100).toFixed(1) : '—';
            var diffClass = diff > 0 ? 'color:#DC2626' : diff < 0 ? 'color:#059669' : '';
            var diffSign = diff > 0 ? '+' : '';
            var refLabel = '';
            if (ch.source === 'freight') {
              // Freight-specific reference
              if (ch.po_number) refLabel += '<span class="inv-muted">PO ' + escH(ch.po_number) + '</span>';
              var carrier = ch.freight_carrier || ch.freight_vendor_name || '';
              if (carrier) refLabel += (refLabel ? ' → ' : '') + '<span style="color:#0369A1"><i class="fas fa-truck-loading"></i> ' + escH(carrier) + '</span>';
              if (ch.freight_invoice) refLabel += (refLabel ? '<br>' : '') + '<span class="inv-muted" style="font-size:11px">Inv: ' + escH(ch.freight_invoice) + '</span>';
            } else {
              // Bill or other reference
              if (ch.po_number) refLabel += '<span class="inv-muted">PO ' + escH(ch.po_number) + '</span>';
              if (ch.bill_number || ch.bill_id) refLabel += (refLabel ? ' → ' : '') + '<span style="color:#2563EB">Bill #' + (ch.bill_number || ch.bill_id) + '</span>';
              if (ch.supplier_name) refLabel += (refLabel ? '<br>' : '') + '<span class="inv-muted" style="font-size:11px">' + escH(ch.supplier_name) + '</span>';
            }
            if (!refLabel) refLabel = '<span class="inv-muted">—</span>';
            var sourceColor = ch.source === 'bill' ? 'supplement' : ch.source === 'freight' ? 'hay' : ch.source === 'manual' ? 'grain' : 'other';
            body += '<tr>' +
              '<td style="white-space:nowrap">' + invFormatDate(ch.created_at) + '</td>' +
              '<td class="text-right">$' + (ch.old_cost || 0).toFixed(2) + '</td>' +
              '<td class="text-right"><strong>$' + (ch.new_cost || 0).toFixed(2) + '</strong></td>' +
              '<td class="text-right" style="' + diffClass + '">' + diffSign + '$' + Math.abs(diff).toFixed(2) + (diffPct !== '—' ? ' <span style="font-size:11px">(' + diffSign + diffPct + '%)</span>' : '') + '</td>' +
              '<td><span class="inv-cat-badge inv-cat-' + sourceColor + '">' + escH(ch.source || 'bill') + '</span></td>' +
              '<td>' + refLabel + '</td>' +
              '</tr>';
          });
          body += '</tbody></table>';
        } else {
          body += '<h4 style="margin-top:16px"><i class="fas fa-chart-line" style="color:#6366F1"></i> Cost History</h4>';
          body += '<p class="inv-muted" style="font-size:13px">No cost changes recorded yet. Costs update automatically when supplier bills and freight charges are approved.</p>';
        }
      } catch(e) {
        // Cost history endpoint might not be available — silently skip
        body += '<h4 style="margin-top:16px"><i class="fas fa-chart-line" style="color:#6366F1"></i> Cost History</h4>';
        body += '<p class="inv-muted" style="font-size:13px">No cost changes recorded yet. Costs update automatically when supplier bills and freight charges are approved.</p>';
      }
    }

    var footer = invCanEdit('products') ? '<button class="inv-btn inv-btn-primary" onclick="invCloseModal();invShowEditProduct(' + productId + ')"><i class="fas fa-pen"></i> Edit Product</button>' : '';
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

// ==================== RECALCULATE HOLDS ====================
async function invRecalculateHolds() {
  // First do a dry run to show what would change
  try {
    var dryResp = await invAPI.post('/api/inventory/recalculate-holds', { dry_run: true }, { headers: invHeaders() });
    var data = dryResp.data;
    if (data.changes_needed === 0) {
      invToast('All holds and reservations are already correct!', 'success');
      return;
    }
    var msg = data.changes_needed + ' product(s) have incorrect hold/reserved values.\n\n';
    var sample = (data.changes || []).slice(0, 5);
    sample.forEach(function(c) {
      msg += '• Product #' + c.product_id + ': hold ' + c.old_hold + '→' + c.new_hold;
      if (c.reserved_diff !== 0) msg += ', reserved ' + c.old_reserved + '→' + c.new_reserved;
      msg += '\n';
    });
    if (data.changes_needed > 5) msg += '... and ' + (data.changes_needed - 5) + ' more\n';
    msg += '\nApply corrections?';

    if (!confirm(msg)) return;

    var resp = await invAPI.post('/api/inventory/recalculate-holds', { dry_run: false }, { headers: invHeaders() });
    invToast('Fixed ' + resp.data.changes_needed + ' stock records', 'success');
    invRender();
  } catch(e) {
    invToast('Recalculation failed: ' + (e.response?.data?.error || e.message), 'error');
  }
}
window.invRecalculateHolds = invRecalculateHolds;

// ==================== EXPORT ====================
function invExportStock() {
  var _sf = invCanViewFin();
  var _sfep = _sf || invCanEditPricing();
  var csv = 'Product,SKU,Category,Location,On Hand,On Hold,Reserved,Available,Incoming' + (_sfep ? ',Sell Price,Cost' : '') + (_sf ? ',Value' : '') + '\n';
  invStockData.forEach(function(s) {
    var avail = (s.qty_on_hand || 0) - (s.qty_on_hold || 0) - (s.qty_reserved || 0);
    csv += '"' + (s.product_name || '') + '","' + (s.sku || '') + '","' + (s.category || '') + '","' + (s.location_name || '') + '",' +
      (s.qty_on_hand || 0) + ',' + (s.qty_on_hold || 0) + ',' + (s.qty_reserved || 0) + ',' + avail + ',' + (s.qty_incoming || 0) +
      (_sfep ? ',' + (s.price || 0) + ',' + (s.cost || 0) : '') + (_sf ? ',' + ((s.qty_on_hand || 0) * (s.cost || s.price || 0)).toFixed(2) : '') + '\n';
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
  invSearchTimer = setTimeout(async function() {
    // Save search value before API call (input still alive)
    var si = document.getElementById('invSearchInput');
    if (si) invStockSearch = si.value;
    await invLoadStock();
    // Re-render just the stock list area, preserving the toolbar (and search focus)
    var listEl = document.getElementById('invStockListArea');
    if (listEl) {
      listEl.innerHTML = invRenderStockRows();
    } else {
      invRender(); // fallback
    }
  }, 300);
}
var invBatchSearchTimer = null;
function invDebounceBatchSearch() {
  clearTimeout(invBatchSearchTimer);
  invBatchSearchTimer = setTimeout(function() { invRender(); }, 300);
}

// ==================== PRODUCTS MANAGEMENT PAGE ====================

var invProdSearchTimer = null;
function invDebounceProductSearch() {
  clearTimeout(invProdSearchTimer);
  invProdSearchTimer = setTimeout(async function() {
    invProductsOffset = 0;
    var prodListEl = document.getElementById('invProductListArea');
    if (prodListEl) {
      prodListEl.innerHTML = '<div class="inv-loading"><i class="fas fa-spinner fa-spin"></i></div>';
      var html = await invRenderProductRows();
      prodListEl = document.getElementById('invProductListArea');
      if (prodListEl) prodListEl.innerHTML = html;
    } else {
      invRender();
    }
  }, 300);
}

async function invRenderProductsPage() {
  var search = '';
  var searchEl = document.getElementById('invProdSearchInput');
  if (searchEl) search = searchEl.value;
  var cat = '';
  var catEl = document.getElementById('invProdCategoryFilter');
  if (catEl) cat = catEl.value;

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
  html += '<label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#64748B;cursor:pointer;white-space:nowrap"><input type="checkbox" ' + (invShowInactive ? 'checked' : '') + ' onchange="invShowInactive=this.checked;invProductsOffset=0;invRender()"> Show Inactive</label>';
  if (invCanEdit('products')) html += '<button class="inv-btn inv-btn-primary inv-btn-sm" onclick="invShowNewProduct()"><i class="fas fa-plus"></i> New Product</button>';
  html += '</div>';

  html += '<div id="invProductListArea">';
  html += await invRenderProductRows();
  html += '</div>';
  html += '</div>';
  return html;
}

async function invRenderProductRows() {
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
  if (invShowInactive) url += '&include_inactive=1';

  try {
    var resp = await invAPI.get(url, { headers: invHeaders() });
    invProductsPageData = resp.data.products || [];
    invProductsTotal = resp.data.total || 0;
  } catch(e) {
    invProductsPageData = [];
    invProductsTotal = 0;
  }

  var html = '<div class="inv-stock-count">' + invProductsTotal + ' products (showing ' + invProductsPageData.length + ')</div>';

  // Products table (desktop)
  html += '<div class="inv-table-wrap inv-desktop-only"><table class="inv-table inv-table-hover">';
  var _pf = invCanViewFin();
  var _pe = invCanEdit('products');
  var _pp = invCanEditPricing();
  var _pfp = _pf || _pp;
  html += '<thead><tr><th>Name</th><th>SKU</th><th>Category</th><th>Vendor</th><th>Unit</th>' + (_pfp ? '<th class="text-right">Sell Price</th><th class="text-right">Cost</th><th class="text-right">Margin</th>' : '') + '<th>Status</th>' + (_pe ? '<th></th>' : '') + '</tr></thead><tbody>';

  invProductsPageData.forEach(function(p) {
    var margin = p.price && p.cost ? (((p.price - p.cost) / p.price) * 100).toFixed(1) + '%' : '—';
    var priceClick = _pp ? ' style="cursor:pointer;text-decoration:underline dotted #059669" onclick="event.stopPropagation();invInlinePriceEdit(' + p.id + ',\'price\')" title="Click to edit"' : '';
    var costClick = _pp ? ' style="cursor:pointer;text-decoration:underline dotted #DC2626" onclick="event.stopPropagation();invInlinePriceEdit(' + p.id + ',\'cost\')" title="Click to edit"' : '';
    html += '<tr class="' + (!p.active ? 'inv-row-inactive' : '') + '">' +
      '<td class="inv-clickable" onclick="invShowProductDetail(' + p.id + ')"><strong>' + escH(p.name) + '</strong></td>' +
      '<td class="inv-muted">' + escH(p.sku || '—') + '</td>' +
      '<td><span class="inv-cat-badge inv-cat-' + (p.category || 'shelf_goods') + '">' + escH((p.category || 'shelf_goods').replace(/_/g, ' ')) + '</span>' +
        (p.subcategory ? '<div style="font-size:10px;color:#64748B;margin-top:2px">' + invSubcatLabel(p.subcategory) + '</div>' : '') + '</td>' +
      '<td class="inv-muted" style="font-size:13px">' + escH(p.primary_vendor_name || '—') + '</td>' +
      '<td>' + escH(p.unit_type || 'each') + '</td>' +
      (_pfp ? '<td class="text-right"><span' + priceClick + '>$' + (p.price || 0).toFixed(2) + '</span></td>' +
      '<td class="text-right inv-muted"><span' + costClick + '>$' + (p.cost || 0).toFixed(2) + '</span></td>' +
      '<td class="text-right">' + margin + '</td>' : '') +
      '<td>' + (p.active ? '<span class="inv-cat-badge inv-cat-supplement">Active</span>' : '<span class="inv-cat-badge inv-cat-other">Inactive</span>') + '</td>' +
      (_pe ? '<td><button class="inv-btn inv-btn-xs" onclick="invShowEditProduct(' + p.id + ')" title="Edit"><i class="fas fa-pen"></i></button></td>' : '') +
      '</tr>';
  });
  html += '</tbody></table></div>';

  // Mobile cards
  html += '<div class="inv-mobile-only inv-stock-cards">';
  invProductsPageData.forEach(function(p) {
    var margin = p.price && p.cost ? (((p.price - p.cost) / p.price) * 100).toFixed(1) + '%' : '—';
    html += '<div class="inv-stock-card' + (!p.active ? ' inv-card-inactive' : '') + '" onclick="invShowProductDetail(' + p.id + ')">' +
      '<div class="inv-stock-card-top">' +
      '<div><strong>' + escH(p.name) + '</strong><br><span class="inv-muted">' + escH(p.sku || '') + ' · ' + invCatLabel(p.category || 'shelf_goods') + (p.subcategory ? ' · ' + invSubcatLabel(p.subcategory) : '') + '</span></div>' +
      (p.active ? '' : '<span class="inv-cat-badge inv-cat-other">Inactive</span>') +
      '</div>' +
      '<div class="inv-stock-card-nums">' +
      (_pfp ? '<div onclick="' + (_pp ? 'event.stopPropagation();invInlinePriceEdit(' + p.id + ',\'price\')' : '') + '" style="' + (_pp ? 'cursor:pointer' : '') + '"><span class="inv-muted">Sell</span><strong>$' + (p.price || 0).toFixed(2) + '</strong></div>' +
      '<div onclick="' + (_pp ? 'event.stopPropagation();invInlinePriceEdit(' + p.id + ',\'cost\')' : '') + '" style="' + (_pp ? 'cursor:pointer' : '') + '"><span class="inv-muted">Cost</span><span>$' + (p.cost || 0).toFixed(2) + '</span></div>' +
      '<div><span class="inv-muted">Margin</span><span>' + margin + '</span></div>' : '') +
      '<div><span class="inv-muted">Unit</span><span>' + escH(p.unit_type || 'each') + '</span></div>' +
      '</div>' +
      (_pe ? '<div class="inv-stock-card-actions">' +
      '<button class="inv-btn inv-btn-xs inv-btn-primary" onclick="event.stopPropagation();invShowEditProduct(' + p.id + ')"><i class="fas fa-pen"></i> Edit</button>' +
      '</div>' : '') + '</div>';
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

  return html;
}

// ==================== CAMERA BARCODE SCANNER ====================

var _invHtml5QrLoaded = false;
var _invHtml5QrLoading = false;

function invLoadBarcodeLib(callback) {
  if (_invHtml5QrLoaded) { callback(); return; }
  if (_invHtml5QrLoading) {
    // Wait for existing load
    var checkInterval = setInterval(function() {
      if (_invHtml5QrLoaded) { clearInterval(checkInterval); callback(); }
    }, 100);
    return;
  }
  _invHtml5QrLoading = true;
  var script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
  script.onload = function() { _invHtml5QrLoaded = true; _invHtml5QrLoading = false; callback(); };
  script.onerror = function() { _invHtml5QrLoading = false; invToast('Failed to load barcode scanner library', 'error'); };
  document.head.appendChild(script);
}

function invOpenCameraScanner(targetInputId) {
  invLoadBarcodeLib(function() {
    // Create scanner overlay
    var overlay = document.createElement('div');
    overlay.id = 'invBarcodeScanOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;';
    overlay.innerHTML =
      '<div style="background:white;border-radius:16px;width:92%;max-width:480px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5)">' +
        '<div style="padding:16px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #E2E8F0">' +
          '<h3 style="margin:0;font-size:16px;display:flex;align-items:center;gap:8px"><i class="fas fa-camera" style="color:#8B5CF6"></i> Scan Barcode</h3>' +
          '<button onclick="invStopCameraScanner()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748B;padding:4px 8px"><i class="fas fa-times"></i></button>' +
        '</div>' +
        '<div id="invBarcodeScanReader" style="width:100%"></div>' +
        '<div style="padding:12px 20px;text-align:center;font-size:13px;color:#64748B;border-top:1px solid #E2E8F0">' +
          '<i class="fas fa-info-circle"></i> Point camera at the barcode on the product' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    // Dismiss on background click
    overlay.addEventListener('click', function(e) { if (e.target === overlay) invStopCameraScanner(); });

    // Start the camera scanner
    try {
      var html5QrCode = new Html5Qrcode('invBarcodeScanReader');
      window._invActiveScanner = html5QrCode;
      window._invScanTargetInput = targetInputId;

      var config = {
        fps: 10,
        qrbox: { width: 280, height: 120 },
        formatsToSupport: [
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.ITF
        ]
      };

      html5QrCode.start(
        { facingMode: 'environment' },
        config,
        function onScanSuccess(decodedText) {
          // Got a barcode — fill input and close
          var inp = document.getElementById(window._invScanTargetInput);
          if (inp) {
            inp.value = decodedText;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
          }
          invScanBeep(true);
          invToast('<i class="fas fa-check-circle"></i> Barcode scanned: ' + escH(decodedText), 'success');
          invStopCameraScanner();
        },
        function onScanFailure() { /* ignore continuous scan failures */ }
      ).catch(function(err) {
        console.error('Camera scanner error:', err);
        invToast('Camera error: ' + (err.message || err), 'error');
        invStopCameraScanner();
      });
    } catch(e) {
      console.error('Scanner init error:', e);
      invToast('Failed to start scanner: ' + e.message, 'error');
      invStopCameraScanner();
    }
  });
}
window.invOpenCameraScanner = invOpenCameraScanner;

function invStopCameraScanner() {
  if (window._invActiveScanner) {
    window._invActiveScanner.stop().then(function() {
      window._invActiveScanner.clear();
    }).catch(function() {});
    window._invActiveScanner = null;
  }
  var overlay = document.getElementById('invBarcodeScanOverlay');
  if (overlay) overlay.remove();
}
window.invStopCameraScanner = invStopCameraScanner;

// ==================== EDIT PRODUCT MODAL ====================

async function invShowEditProduct(productId) {
  try {
    var resp = await invAPI.get('/api/inventory/products/' + productId, { headers: invHeaders() });
    var p = resp.data.product;
    if (!p) { invToast('Product not found', 'error'); return; }

    var catOpts = '';
    var catInList = false;
    (invCategoryList || []).forEach(function(c) {
      var label = c.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
      if (p.category === c) catInList = true;
      catOpts += '<option value="' + c + '"' + (p.category === c ? ' selected' : '') + '>' + label + '</option>';
    });
    // If product has a custom category not in the standard list, include it
    if (p.category && !catInList) {
      var customLabel = p.category.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
      catOpts = '<option value="' + escH(p.category) + '" selected>' + escH(customLabel) + '</option>' + catOpts;
    }
    catOpts += '<option value="__new__">＋ New Category…</option>';

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
    body += '<div class="inv-form-group"><label><i class="fas fa-barcode" style="color:#8B5CF6"></i> Barcode / UPC</label><div style="display:flex;gap:6px"><input type="text" class="inv-input" id="invEditBarcode" value="' + escH(p.barcode || '') + '" placeholder="Scan or type barcode" style="flex:1"><button type="button" class="inv-btn inv-btn-outline inv-btn-sm" onclick="invOpenCameraScanner(\'invEditBarcode\')" style="white-space:nowrap;color:#8B5CF6;border-color:#8B5CF6"><i class="fas fa-camera"></i> Scan</button></div></div>';
    body += '</div>';

    var subcatOpts = '<option value="">— None —</option>';
    var subcatList = ['feed','supplement','dewormer','fly_control','grooming','hoof_care','first_aid','tack','blankets','treats','barn_equipment','fencing','riding_apparel','pet_supplies','cleaning','poultry','farm_supplies','tools','gift','general'];
    subcatList.forEach(function(sc) {
      subcatOpts += '<option value="' + sc + '"' + (p.subcategory === sc ? ' selected' : '') + '>' + invSubcatLabel(sc) + '</option>';
    });

    body += '<div class="inv-form-row">';
    body += '<div class="inv-form-group"><label>Category</label><select class="inv-select" id="invEditCategory" onchange="invHandleCategoryChange(\'invEditCategory\',\'invEditNewCatRow\')">' + catOpts + '</select><div id="invEditNewCatRow" style="display:none;margin-top:6px"><input type="text" class="inv-input" id="invEditNewCatName" placeholder="Enter new category name" style="font-size:14px"></div></div>';
    body += '<div class="inv-form-group"><label>Subcategory</label><select class="inv-select" id="invEditSubcategory">' + subcatOpts + '</select></div>';
    body += '<div class="inv-form-group"><label>Unit Type</label><select class="inv-select" id="invEditUnit">' + unitOpts + '</select></div>';
    body += '<div class="inv-form-group"><label>Status</label><select class="inv-select" id="invEditActive"><option value="1"' + (p.active ? ' selected' : '') + '>Active</option><option value="0"' + (!p.active ? ' selected' : '') + '>Inactive</option></select></div>';
    body += '</div>';

    if (invCanViewFin() || invCanEditPricing()) {
      var _pricingEditable = invCanEditPricing();
      var _roAttr = _pricingEditable ? '' : ' readonly style="background:#F1F5F9;color:#64748B;cursor:not-allowed"';
      var _lockIcon = _pricingEditable ? '' : ' <i class="fas fa-lock" style="color:#94A3B8;font-size:10px" title="No pricing edit permission"></i>';
      body += '<div class="inv-form-row">';
      body += '<div class="inv-form-group"><label>Sell Price ($)' + _lockIcon + '</label><input type="number" step="0.01" class="inv-input" id="invEditPrice" value="' + (p.price || 0) + '"' + _roAttr + '></div>';
      body += '<div class="inv-form-group"><label>Cost ($)' + _lockIcon + '</label><input type="number" step="0.01" class="inv-input" id="invEditCost" value="' + (p.cost || 0) + '"' + _roAttr + '></div>';
      body += '<div class="inv-form-group"><label>Tax Rate' + _lockIcon + '</label><input type="number" step="0.01" class="inv-input" id="invEditTaxRate" value="' + (p.tax_rate || 0) + '" placeholder="e.g. 7 = 7%"' + _roAttr + '></div>';
      body += '</div>';

      // Margin preview
      if (p.price && p.cost) {
        var marginPct = (((p.price - p.cost) / p.price) * 100).toFixed(1);
        var marginAmt = (p.price - p.cost).toFixed(2);
        body += '<div class="inv-margin-preview" id="invMarginPreview"><i class="fas fa-chart-pie"></i> Margin: $' + marginAmt + ' (' + marginPct + '%)</div>';
      } else {
        body += '<div class="inv-margin-preview" id="invMarginPreview"><i class="fas fa-chart-pie"></i> Margin: —</div>';
      }
    } else {
      body += '<input type="hidden" id="invEditPrice" value="' + (p.price || 0) + '">';
      body += '<input type="hidden" id="invEditCost" value="' + (p.cost || 0) + '">';
      body += '<input type="hidden" id="invEditTaxRate" value="' + (p.tax_rate || 0) + '">';
    }

    body += '<div class="inv-form-row">';
    body += '<div class="inv-form-group"><label>Weight per Unit (lbs)</label><input type="number" step="0.1" class="inv-input" id="invEditWeight" value="' + (p.weight_per_unit || 0) + '"></div>';
    body += '<div class="inv-form-group"><label>Pallet Qty</label><input type="number" class="inv-input" id="invEditPalletQty" value="' + (p.pallet_qty || 0) + '"></div>';
    body += '</div>';

    // Primary Vendor picker
    var vendorOpts = '<option value="">— No Primary Vendor —</option>';
    invSuppliersList.forEach(function(s) {
      vendorOpts += '<option value="' + s.id + '"' + (p.primary_vendor_id == s.id ? ' selected' : '') + '>' + escH(s.name) + (s.code ? ' (' + escH(s.code) + ')' : '') + '</option>';
    });
    body += '<div class="inv-form-row">';
    body += '<div class="inv-form-group" style="flex:2"><label><i class="fas fa-truck-field" style="color:#6366F1"></i> Primary Vendor</label><select class="inv-select" id="invEditPrimaryVendor">' + vendorOpts + '</select></div>';
    body += '</div>';

    // Additional vendors list
    var existingVendors = p.vendors || [];
    body += '<div style="margin-top:8px">';
    body += '<label style="font-weight:600;font-size:13px;color:#64748B;margin-bottom:6px;display:block"><i class="fas fa-users"></i> Additional Vendors</label>';
    if (existingVendors.length > 0) {
      body += '<div id="invEditVendorsList" style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px">';
      existingVendors.forEach(function(v) {
        body += '<div class="inv-vendor-row" style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#F8FAFC;border-radius:8px;font-size:13px">' +
          '<span style="flex:1"><strong>' + escH(v.vendor_name) + '</strong>' + (v.is_primary ? ' <span style="background:#DBEAFE;color:#1E40AF;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600">PRIMARY</span>' : '') +
          (v.cost ? ' · $' + Number(v.cost).toFixed(2) : '') +
          (v.lead_time_days ? ' · ' + v.lead_time_days + ' days' : '') + '</span>' +
          '<button class="inv-btn inv-btn-xs" style="color:#DC2626;background:none;padding:2px 6px" onclick="invRemoveProductVendor(' + productId + ',' + v.id + ')" title="Remove"><i class="fas fa-times"></i></button>' +
          '</div>';
      });
      body += '</div>';
    } else {
      body += '<div id="invEditVendorsList" style="margin-bottom:8px"><span class="inv-muted" style="font-size:12px">No additional vendors assigned</span></div>';
    }
    body += '<button class="inv-btn inv-btn-xs inv-btn-outline" onclick="invShowAddVendorRow(' + productId + ')"><i class="fas fa-plus"></i> Add Vendor</button>';
    body += '<div id="invAddVendorRow" style="display:none;margin-top:8px"></div>';
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
  var vendorVal = document.getElementById('invEditPrimaryVendor') ? document.getElementById('invEditPrimaryVendor').value : '';
  var resolvedCat = invGetCategory('invEditCategory', 'invEditNewCatName');
  if (resolvedCat === null) { invToast('Please enter a category name', 'error'); return; }
  var data = {
    name: document.getElementById('invEditName').value.trim(),
    sku: document.getElementById('invEditSku').value.trim() || null,
    barcode: document.getElementById('invEditBarcode') ? document.getElementById('invEditBarcode').value.trim() || null : null,
    category: resolvedCat,
    subcategory: document.getElementById('invEditSubcategory') ? document.getElementById('invEditSubcategory').value || null : null,
    unit_type: document.getElementById('invEditUnit').value,
    active: parseInt(document.getElementById('invEditActive').value),
    price: parseFloat(document.getElementById('invEditPrice').value) || 0,
    cost: parseFloat(document.getElementById('invEditCost').value) || 0,
    tax_rate: parseFloat(document.getElementById('invEditTaxRate').value) || 0,
    weight_per_unit: parseFloat(document.getElementById('invEditWeight').value) || 0,
    pallet_qty: parseInt(document.getElementById('invEditPalletQty').value) || 0,
    primary_vendor_id: vendorVal ? parseInt(vendorVal) : null
  };

  if (!data.name) { invToast('Product name is required', 'error'); return; }

  try {
    await invAPI.put('/api/inventory/products/' + productId, data, { headers: invHeaders() });
    invToast('Product updated successfully');
    // Refresh category list if a new category was added
    if (resolvedCat && invCategoryList.indexOf(resolvedCat) === -1) {
      invLoadCategories();
    }
    invCloseModal();
    invRender();
  } catch(e) { invToast('Save failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// ==================== INLINE PRICING EDITOR ====================

function invInlinePriceEdit(productId, field) {
  if (!invCanEditPricing()) { invToast('No pricing edit permission', 'error'); return; }

  var labels = { price: 'Sell Price', cost: 'Cost', tax_rate: 'Tax Rate' };
  var label = labels[field] || field;

  // Read current value from detail display
  var currentVal = '';
  var elId = field === 'price' ? 'invDetailPrice' : field === 'cost' ? 'invDetailCost' : 'invDetailTaxRate';
  var el = document.getElementById(elId);
  if (el) {
    currentVal = el.textContent.replace(/[$%]/g, '').trim();
  }

  var overlay = document.createElement('div');
  overlay.id = 'invPriceEditOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML =
    '<div style="background:white;border-radius:16px;padding:24px;width:100%;max-width:340px;box-shadow:0 20px 60px rgba(0,0,0,0.3)">' +
      '<h3 style="margin:0 0 16px;font-size:16px;color:#1E293B"><i class="fas fa-dollar-sign" style="color:#6366F1;margin-right:6px"></i>Edit ' + label + '</h3>' +
      '<input type="number" step="0.01" id="invInlinePriceInput" class="inv-input" value="' + currentVal + '" style="font-size:18px;text-align:center;padding:12px;font-weight:700" autofocus>' +
      (field === 'tax_rate' ? '<div style="font-size:11px;color:#94A3B8;text-align:center;margin-top:4px">Enter as percentage (e.g. 7 = 7%)</div>' : '') +
      '<div style="display:flex;gap:8px;margin-top:16px">' +
        '<button class="inv-btn inv-btn-outline" style="flex:1;justify-content:center;padding:10px" onclick="document.getElementById(\'invPriceEditOverlay\').remove()">Cancel</button>' +
        '<button class="inv-btn inv-btn-primary" style="flex:1;justify-content:center;padding:10px" onclick="invSaveInlinePrice(' + productId + ',\'' + field + '\')"><i class="fas fa-check"></i> Save</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  // Focus and select
  setTimeout(function() {
    var inp = document.getElementById('invInlinePriceInput');
    if (inp) { inp.focus(); inp.select(); }
  }, 100);

  // Enter key to save
  overlay.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { invSaveInlinePrice(productId, field); }
    if (e.key === 'Escape') { overlay.remove(); }
  });
}
window.invInlinePriceEdit = invInlinePriceEdit;

async function invSaveInlinePrice(productId, field) {
  var inp = document.getElementById('invInlinePriceInput');
  if (!inp) return;
  var newVal = parseFloat(inp.value) || 0;

  var payload = {};
  payload[field] = newVal;

  try {
    var resp = await invAPI.patch('/api/inventory/products/' + productId + '/pricing', payload, { headers: invHeaders() });
    if (resp.data.success) {
      invToast(resp.data.changes || 'Pricing updated', 'success');

      // Update the displayed values in the detail modal without closing it
      var product = resp.data.product;
      if (product) {
        var priceEl = document.getElementById('invDetailPrice');
        var costEl = document.getElementById('invDetailCost');
        var taxEl = document.getElementById('invDetailTaxRate');
        var marginEl = document.getElementById('invDetailMargin');

        if (priceEl && product.price !== undefined) priceEl.textContent = '$' + (product.price || 0).toFixed(2);
        if (costEl && product.cost !== undefined) costEl.textContent = '$' + (product.cost || 0).toFixed(2);
        if (taxEl && product.tax_rate !== undefined) taxEl.textContent = (product.tax_rate || 0) + '%';

        // Update margin
        if (marginEl && product.price && product.cost) {
          var m = (((product.price - product.cost) / product.price) * 100).toFixed(1);
          marginEl.textContent = m + '%';
        }
      }

      // Close the edit overlay
      var overlay = document.getElementById('invPriceEditOverlay');
      if (overlay) overlay.remove();

      // If we're on stock or products page (not in a detail modal), re-render to refresh the list
      var detailPrice = document.getElementById('invDetailPrice');
      if (!detailPrice) {
        // Not in detail modal — refresh the page list
        invRender();
      }
    }
  } catch(e) {
    invToast('Save failed: ' + (e.response?.data?.error || e.message), 'error');
  }
}
window.invSaveInlinePrice = invSaveInlinePrice;

// ==================== VENDOR MANAGEMENT ====================

function invShowAddVendorRow(productId) {
  var row = document.getElementById('invAddVendorRow');
  if (!row) return;
  var opts = '<option value="">Select vendor...</option>';
  invSuppliersList.forEach(function(s) {
    opts += '<option value="' + s.id + '">' + escH(s.name) + (s.code ? ' (' + escH(s.code) + ')' : '') + '</option>';
  });
  row.style.display = 'block';
  row.innerHTML = '<div style="display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap">' +
    '<div class="inv-form-group" style="flex:2;margin:0"><label style="font-size:12px">Vendor</label><select class="inv-select" id="invAddVendorSelect">' + opts + '</select></div>' +
    '<div class="inv-form-group" style="flex:1;margin:0"><label style="font-size:12px">Cost ($)</label><input type="number" step="0.01" class="inv-input" id="invAddVendorCost" placeholder="0.00"></div>' +
    '<div class="inv-form-group" style="flex:1;margin:0"><label style="font-size:12px">Lead Time (days)</label><input type="number" class="inv-input" id="invAddVendorLead" placeholder="0"></div>' +
    '<button class="inv-btn inv-btn-xs inv-btn-primary" onclick="invDoAddVendor(' + productId + ')"><i class="fas fa-check"></i></button>' +
    '<button class="inv-btn inv-btn-xs inv-btn-outline" onclick="document.getElementById(\'invAddVendorRow\').style.display=\'none\'"><i class="fas fa-times"></i></button>' +
    '</div>';
}

async function invDoAddVendor(productId) {
  var supplierId = document.getElementById('invAddVendorSelect').value;
  if (!supplierId) { invToast('Select a vendor', 'warning'); return; }
  var cost = parseFloat(document.getElementById('invAddVendorCost').value) || 0;
  var leadTime = parseInt(document.getElementById('invAddVendorLead').value) || 0;
  try {
    await invAPI.post('/api/inventory/products/' + productId + '/vendors', {
      supplier_id: parseInt(supplierId), is_primary: false, cost: cost, lead_time_days: leadTime
    }, { headers: invHeaders() });
    invToast('Vendor added');
    invCloseModal();
    invShowEditProduct(productId); // Refresh the edit modal
  } catch(e) { invToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

async function invRemoveProductVendor(productId, vendorRowId) {
  if (!confirm('Remove this vendor from the product?')) return;
  try {
    await invAPI.delete('/api/inventory/products/' + productId + '/vendors/' + vendorRowId, { headers: invHeaders() });
    invToast('Vendor removed');
    invCloseModal();
    invShowEditProduct(productId);
  } catch(e) { invToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// ==================== NEW PRODUCT MODAL ====================

function invShowNewProduct() {
  var catOpts = '';
  (invCategoryList || []).forEach(function(c) {
    var label = c.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
    catOpts += '<option value="' + c + '"' + (c === 'shelf_goods' ? ' selected' : '') + '>' + label + '</option>';
  });
  catOpts += '<option value="__new__">＋ New Category…</option>';

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
  body += '<div class="inv-form-group"><label><i class="fas fa-barcode" style="color:#8B5CF6"></i> Barcode / UPC</label><div style="display:flex;gap:6px"><input type="text" class="inv-input" id="invNewBarcode" placeholder="Scan or type barcode" style="flex:1"><button type="button" class="inv-btn inv-btn-outline inv-btn-sm" onclick="invOpenCameraScanner(\'invNewBarcode\')" style="white-space:nowrap;color:#8B5CF6;border-color:#8B5CF6"><i class="fas fa-camera"></i> Scan</button></div></div>';
  body += '</div>';
  var newSubcatOpts = '<option value="">— None —</option>';
  var newSubcatList = ['feed','supplement','dewormer','fly_control','grooming','hoof_care','first_aid','tack','blankets','treats','barn_equipment','fencing','riding_apparel','pet_supplies','cleaning','poultry','farm_supplies','tools','gift','general'];
  newSubcatList.forEach(function(sc) {
    newSubcatOpts += '<option value="' + sc + '">' + invSubcatLabel(sc) + '</option>';
  });

  body += '<div class="inv-form-row">';
  body += '<div class="inv-form-group"><label>Category</label><select class="inv-select" id="invNewCategory" onchange="invHandleCategoryChange(\'invNewCategory\',\'invNewCatRow\')">' + catOpts + '</select><div id="invNewCatRow" style="display:none;margin-top:6px"><input type="text" class="inv-input" id="invNewCatName" placeholder="Enter new category name" style="font-size:14px"></div></div>';
  body += '<div class="inv-form-group"><label>Subcategory</label><select class="inv-select" id="invNewSubcategory">' + newSubcatOpts + '</select></div>';
  body += '<div class="inv-form-group"><label>Unit Type</label><select class="inv-select" id="invNewUnit">' + unitOpts + '</select></div>';
  body += '</div>';
  if (invCanViewFin() || invCanEditPricing()) {
    var _npEditable = invCanEditPricing();
    var _npRo = _npEditable ? '' : ' readonly style="background:#F1F5F9;color:#64748B;cursor:not-allowed"';
    var _npLock = _npEditable ? '' : ' <i class="fas fa-lock" style="color:#94A3B8;font-size:10px" title="No pricing edit permission"></i>';
    body += '<div class="inv-form-row">';
    body += '<div class="inv-form-group"><label>Sell Price ($)' + _npLock + '</label><input type="number" step="0.01" class="inv-input" id="invNewPrice" value="0"' + _npRo + '></div>';
    body += '<div class="inv-form-group"><label>Cost ($)' + _npLock + '</label><input type="number" step="0.01" class="inv-input" id="invNewCost" value="0"' + _npRo + '></div>';
    body += '<div class="inv-form-group"><label>Tax Rate' + _npLock + '</label><input type="number" step="0.01" class="inv-input" id="invNewTaxRate" value="0" placeholder="e.g. 7 = 7%"' + _npRo + '></div>';
    body += '</div>';
  } else {
    body += '<input type="hidden" id="invNewPrice" value="0"><input type="hidden" id="invNewCost" value="0"><input type="hidden" id="invNewTaxRate" value="0">';
  }
  body += '<div class="inv-form-row">';
  body += '<div class="inv-form-group"><label>Weight per Unit (lbs)</label><input type="number" step="0.1" class="inv-input" id="invNewWeight" value="0"></div>';
  body += '<div class="inv-form-group"><label>Pallet Qty</label><input type="number" class="inv-input" id="invNewPalletQty" value="0"></div>';
  body += '</div>';
  // Primary Vendor
  var newVendorOpts = '<option value="">— No Primary Vendor —</option>';
  invSuppliersList.forEach(function(s) {
    newVendorOpts += '<option value="' + s.id + '">' + escH(s.name) + (s.code ? ' (' + escH(s.code) + ')' : '') + '</option>';
  });
  body += '<div class="inv-form-row">';
  body += '<div class="inv-form-group"><label><i class="fas fa-truck-field" style="color:#6366F1"></i> Primary Vendor</label><select class="inv-select" id="invNewPrimaryVendor">' + newVendorOpts + '</select></div>';
  body += '</div>';
  body += '</div>';

  var footer = '<button class="inv-btn inv-btn-outline" onclick="invCloseModal()">Cancel</button>' +
    '<button class="inv-btn inv-btn-primary" onclick="invCreateProduct()"><i class="fas fa-plus"></i> Create Product</button>';

  invShowModal('<i class="fas fa-plus"></i> New Product', body, footer);
}

async function invCreateProduct() {
  var newVendorVal = document.getElementById('invNewPrimaryVendor') ? document.getElementById('invNewPrimaryVendor').value : '';
  var newResolvedCat = invGetCategory('invNewCategory', 'invNewCatName');
  if (newResolvedCat === null) { invToast('Please enter a category name', 'error'); return; }
  var data = {
    name: document.getElementById('invNewName').value.trim(),
    sku: document.getElementById('invNewSku').value.trim() || null,
    barcode: document.getElementById('invNewBarcode') ? document.getElementById('invNewBarcode').value.trim() || null : null,
    category: newResolvedCat,
    subcategory: document.getElementById('invNewSubcategory') ? document.getElementById('invNewSubcategory').value || null : null,
    unit_type: document.getElementById('invNewUnit').value,
    price: parseFloat(document.getElementById('invNewPrice').value) || 0,
    cost: parseFloat(document.getElementById('invNewCost').value) || 0,
    tax_rate: parseFloat(document.getElementById('invNewTaxRate').value) || 0,
    weight_per_unit: parseFloat(document.getElementById('invNewWeight').value) || 0,
    pallet_qty: parseInt(document.getElementById('invNewPalletQty').value) || 0,
    primary_vendor_id: newVendorVal ? parseInt(newVendorVal) : null
  };

  if (!data.name) { invToast('Product name is required', 'error'); return; }

  try {
    var resp = await invAPI.post('/api/inventory/products', data, { headers: invHeaders() });
    invToast('Product "' + data.name + '" created');
    // Refresh category list if a new category was added
    if (newResolvedCat && invCategoryList.indexOf(newResolvedCat) === -1) {
      invLoadCategories();
    }
    invCloseModal();
    invRender();
  } catch(e) { invToast('Create failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// ==================== SNAPSHOTS PAGE ====================

var invSnapshotList = [];
var invSnapshotDetail = null;
var invSnapshotDetailDate = null;
var invSnapshotCompare = null;

async function invRenderSnapshotsPage() {
  try {
    var resp = await invAPI.get('/api/inventory/snapshots?limit=90', { headers: invHeaders() });
    invSnapshotList = resp.data.snapshots || [];
  } catch(e) {
    invSnapshotList = [];
    console.error('[Inventory] snapshots load error:', e);
  }

  // If we're viewing a detail
  if (invSnapshotDetailDate) {
    return invRenderSnapshotDetail();
  }
  // If we're comparing
  if (invSnapshotCompare) {
    return invRenderSnapshotCompareView();
  }

  var _showFin = invCanViewFin();
  var html = '<div class="inv-section">';
  html += '<div class="inv-section-header">';
  html += '<div><h2 style="margin:0;font-size:18px;font-weight:700;color:#111"><i class="fas fa-camera" style="color:#7C3AED"></i> Daily Inventory Snapshots</h2>';
  html += '<p style="margin:4px 0 0;color:#6B7280;font-size:13px">Automatic snapshot taken every day at 6:30 PM. Click any date to view details.</p></div>';
  html += '<div style="display:flex;gap:8px;align-items:center">';
  html += '<button class="inv-btn inv-btn-secondary" onclick="invSnapshotCompareStart()"><i class="fas fa-code-compare"></i> Compare</button>';
  if (invCanEdit('snapshots')) {
    html += '<button class="inv-btn" onclick="invTakeSnapshotNow()"><i class="fas fa-camera"></i> Take Snapshot Now</button>';
  }
  html += '</div></div>';

  if (invSnapshotList.length === 0) {
    html += '<div style="padding:40px;text-align:center;color:#9CA3AF">';
    html += '<i class="fas fa-camera" style="font-size:40px;margin-bottom:12px;display:block"></i>';
    html += '<p style="font-size:15px;font-weight:600">No snapshots yet</p>';
    html += '<p style="font-size:13px">Snapshots are taken automatically every day at 6:30 PM, or you can take one manually.</p>';
    if (invCanEdit('snapshots')) {
      html += '<button class="inv-btn" style="margin-top:12px" onclick="invTakeSnapshotNow()"><i class="fas fa-camera"></i> Take First Snapshot</button>';
    }
    html += '</div>';
  } else {
    // Snapshot calendar/list
    html += '<div class="inv-snapshot-grid">';
    for (var i = 0; i < invSnapshotList.length; i++) {
      var snap = invSnapshotList[i];
      var dt = new Date(snap.snapshot_date + 'T12:00:00');
      var dayName = dt.toLocaleDateString('en-US', { weekday: 'short' });
      var monthDay = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      var year = dt.getFullYear();
      var isToday = snap.snapshot_date === new Date().toISOString().slice(0, 10);
      var isYesterday = snap.snapshot_date === new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      // Change from prior day
      var qtyDiff = '';
      if (i < invSnapshotList.length - 1) {
        var prev = invSnapshotList[i + 1];
        var diff = (snap.total_qty || 0) - (prev.total_qty || 0);
        if (diff > 0) qtyDiff = '<span style="color:#059669;font-size:11px;font-weight:600">+' + diff.toLocaleString() + '</span>';
        else if (diff < 0) qtyDiff = '<span style="color:#DC2626;font-size:11px;font-weight:600">' + diff.toLocaleString() + '</span>';
      }

      html += '<div class="inv-snapshot-card' + (isToday ? ' today' : '') + '" onclick="invViewSnapshotDetail(\'' + snap.snapshot_date + '\')">';
      html += '<div class="inv-snapshot-date">';
      html += '<span class="inv-snapshot-day">' + dayName + '</span>';
      html += '<span class="inv-snapshot-monthday">' + monthDay + (year !== new Date().getFullYear() ? ', ' + year : '') + '</span>';
      if (isToday) html += '<span class="inv-snapshot-badge today">Today</span>';
      else if (isYesterday) html += '<span class="inv-snapshot-badge yesterday">Yesterday</span>';
      html += '</div>';
      html += '<div class="inv-snapshot-stats">';
      html += '<div class="inv-snapshot-stat"><span class="inv-snapshot-stat-value">' + (snap.total_qty || 0).toLocaleString() + '</span><span class="inv-snapshot-stat-label">Units ' + qtyDiff + '</span></div>';
      html += '<div class="inv-snapshot-stat"><span class="inv-snapshot-stat-value">' + (snap.product_count || 0) + '</span><span class="inv-snapshot-stat-label">Products</span></div>';
      if (_showFin) {
        html += '<div class="inv-snapshot-stat"><span class="inv-snapshot-stat-value">$' + ((snap.total_value || 0) / 1000).toFixed(1) + 'k</span><span class="inv-snapshot-stat-label">Value</span></div>';
      }
      html += '</div>';
      html += '</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

async function invViewSnapshotDetail(date) {
  invSnapshotDetailDate = date;
  invSnapshotCompare = null;
  invRender();
}

async function invRenderSnapshotDetail() {
  try {
    var locParam = invSelectedLocation ? '&location_id=' + invSelectedLocation : '';
    var resp = await invAPI.get('/api/inventory/snapshots/' + invSnapshotDetailDate + '?x=1' + locParam, { headers: invHeaders() });
    invSnapshotDetail = resp.data;
  } catch(e) {
    return '<div style="padding:24px;color:#DC2626">Failed to load snapshot: ' + (e.response?.data?.error || e.message) + '</div>';
  }

  var d = invSnapshotDetail;
  var dt = new Date(invSnapshotDetailDate + 'T12:00:00');
  var dateStr = dt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  var _showFin = invCanViewFin();

  var html = '<div class="inv-section">';
  html += '<div class="inv-section-header">';
  html += '<div>';
  html += '<button class="inv-btn inv-btn-secondary" onclick="invSnapshotDetailDate=null;invSnapshotDetail=null;invRender()" style="margin-bottom:8px"><i class="fas fa-arrow-left"></i> Back to Snapshots</button>';
  html += '<h2 style="margin:0;font-size:18px;font-weight:700;color:#111"><i class="fas fa-camera" style="color:#7C3AED"></i> Snapshot: ' + dateStr + '</h2>';
  html += '</div></div>';

  // Summary cards
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px">';
  html += '<div class="inv-stat-card"><div class="inv-stat-value">' + (d.summary.totalItems || 0) + '</div><div class="inv-stat-label">Products</div></div>';
  html += '<div class="inv-stat-card"><div class="inv-stat-value">' + (d.summary.totalQty || 0).toLocaleString() + '</div><div class="inv-stat-label">Total Units</div></div>';
  if (_showFin) {
    html += '<div class="inv-stat-card"><div class="inv-stat-value">$' + (d.summary.totalValue || 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) + '</div><div class="inv-stat-label">Total Value</div></div>';
  }
  html += '</div>';

  // By category
  if (d.byCategory && d.byCategory.length > 0) {
    html += '<h3 style="font-size:14px;font-weight:700;color:#374151;margin:16px 0 8px"><i class="fas fa-tags"></i> By Category</h3>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-bottom:20px">';
    d.byCategory.sort(function(a,b) { return (b.qty||0)-(a.qty||0); });
    for (var i = 0; i < d.byCategory.length; i++) {
      var cat = d.byCategory[i];
      html += '<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:10px">';
      html += '<div style="font-weight:600;font-size:13px;color:#111;text-transform:capitalize">' + (cat.category || 'Uncategorized') + '</div>';
      html += '<div style="font-size:12px;color:#6B7280;margin-top:2px">' + cat.products + ' products &middot; ' + (cat.qty || 0).toLocaleString() + ' units';
      if (_showFin) html += ' &middot; $' + (cat.value || 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
      html += '</div></div>';
    }
    html += '</div>';
  }

  // Item table
  html += '<h3 style="font-size:14px;font-weight:700;color:#374151;margin:16px 0 8px"><i class="fas fa-list"></i> All Items (' + (d.items || []).length + ')</h3>';
  html += '<div style="overflow-x:auto"><table class="inv-table"><thead><tr>';
  html += '<th>Product</th><th>Category</th><th>Location</th><th style="text-align:right">On Hand</th><th style="text-align:right">On Hold</th><th style="text-align:right">Available</th>';
  if (_showFin) html += '<th style="text-align:right">Unit Cost</th><th style="text-align:right">Total Value</th>';
  html += '</tr></thead><tbody>';

  if (!d.items || d.items.length === 0) {
    html += '<tr><td colspan="' + (_showFin ? 8 : 6) + '" style="text-align:center;color:#9CA3AF;padding:20px">No items in this snapshot</td></tr>';
  } else {
    for (var i = 0; i < d.items.length; i++) {
      var item = d.items[i];
      html += '<tr>';
      html += '<td style="font-weight:600">' + (item.product_name || 'Unknown') + '</td>';
      html += '<td><span style="text-transform:capitalize;font-size:12px;color:#6B7280">' + (item.category || '-') + '</span></td>';
      html += '<td>' + (item.location_name || 'Loc #' + item.location_id) + '</td>';
      html += '<td style="text-align:right;font-weight:600">' + (item.qty_on_hand || 0).toLocaleString() + '</td>';
      html += '<td style="text-align:right;color:#D97706">' + (item.qty_on_hold || 0) + '</td>';
      html += '<td style="text-align:right;color:#059669">' + (item.qty_available || 0).toLocaleString() + '</td>';
      if (_showFin) {
        html += '<td style="text-align:right">$' + (item.unit_cost || 0).toFixed(2) + '</td>';
        html += '<td style="text-align:right;font-weight:600">$' + (item.total_value || 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) + '</td>';
      }
      html += '</tr>';
    }
  }
  html += '</tbody></table></div>';
  html += '</div>';
  return html;
}

// Compare two snapshots
function invSnapshotCompareStart() {
  if (invSnapshotList.length < 2) {
    invToast('Need at least 2 snapshots to compare', 'error');
    return;
  }
  // Default: compare yesterday to today (or last two available)
  var dateA = invSnapshotList.length > 1 ? invSnapshotList[1].snapshot_date : invSnapshotList[0].snapshot_date;
  var dateB = invSnapshotList[0].snapshot_date;

  var html = '<div style="padding:16px">';
  html += '<h3 style="margin:0 0 12px;font-size:15px;font-weight:700"><i class="fas fa-code-compare" style="color:#7C3AED"></i> Compare Snapshots</h3>';
  html += '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">';
  html += '<div><label style="font-size:12px;font-weight:600;color:#6B7280;display:block;margin-bottom:4px">From</label>';
  html += '<select id="inv-compare-from" style="padding:8px;border:1px solid #D1D5DB;border-radius:6px;font-size:13px">';
  for (var i = 0; i < invSnapshotList.length; i++) {
    html += '<option value="' + invSnapshotList[i].snapshot_date + '"' + (invSnapshotList[i].snapshot_date === dateA ? ' selected' : '') + '>' + invSnapshotList[i].snapshot_date + '</option>';
  }
  html += '</select></div>';
  html += '<div style="font-size:20px;color:#9CA3AF;padding-top:18px"><i class="fas fa-arrow-right"></i></div>';
  html += '<div><label style="font-size:12px;font-weight:600;color:#6B7280;display:block;margin-bottom:4px">To</label>';
  html += '<select id="inv-compare-to" style="padding:8px;border:1px solid #D1D5DB;border-radius:6px;font-size:13px">';
  for (var i = 0; i < invSnapshotList.length; i++) {
    html += '<option value="' + invSnapshotList[i].snapshot_date + '"' + (invSnapshotList[i].snapshot_date === dateB ? ' selected' : '') + '>' + invSnapshotList[i].snapshot_date + '</option>';
  }
  html += '</select></div>';
  html += '<button class="inv-btn" style="margin-top:18px" onclick="invDoCompare()"><i class="fas fa-code-compare"></i> Compare</button>';
  html += '</div></div>';

  invShowModal('Compare Snapshots', html);
}

async function invDoCompare() {
  var dateA = document.getElementById('inv-compare-from')?.value;
  var dateB = document.getElementById('inv-compare-to')?.value;
  if (!dateA || !dateB) return;
  if (dateA === dateB) { invToast('Select different dates', 'error'); return; }
  invCloseModal();
  invSnapshotCompare = { from: dateA, to: dateB };
  invSnapshotDetailDate = null;
  invRender();
}

async function invRenderSnapshotCompareView() {
  var comp = invSnapshotCompare;
  var locParam = invSelectedLocation ? '&location_id=' + invSelectedLocation : '';
  var _showFin = invCanViewFin();
  var data;
  try {
    var resp = await invAPI.get('/api/inventory/snapshot-compare?from=' + comp.from + '&to=' + comp.to + locParam, { headers: invHeaders() });
    data = resp.data;
  } catch(e) {
    return '<div style="padding:24px;color:#DC2626">Compare failed: ' + (e.response?.data?.error || e.message) + '</div>';
  }

  var html = '<div class="inv-section">';
  html += '<div class="inv-section-header">';
  html += '<div>';
  html += '<button class="inv-btn inv-btn-secondary" onclick="invSnapshotCompare=null;invRender()" style="margin-bottom:8px"><i class="fas fa-arrow-left"></i> Back to Snapshots</button>';
  html += '<h2 style="margin:0;font-size:18px;font-weight:700;color:#111"><i class="fas fa-code-compare" style="color:#7C3AED"></i> Comparison: ' + comp.from + ' → ' + comp.to + '</h2>';
  html += '</div></div>';

  // Summary
  var s = data.summary;
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:20px">';
  html += '<div class="inv-stat-card"><div class="inv-stat-value">' + (s.totalQtyFrom || 0).toLocaleString() + ' → ' + (s.totalQtyTo || 0).toLocaleString() + '</div><div class="inv-stat-label">Total Units <span style="color:' + (s.qtyChange >= 0 ? '#059669' : '#DC2626') + ';font-weight:700">(' + (s.qtyChange >= 0 ? '+' : '') + s.qtyChange.toLocaleString() + ')</span></div></div>';
  if (_showFin) {
    html += '<div class="inv-stat-card"><div class="inv-stat-value" style="font-size:14px">$' + (s.totalValueFrom || 0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0}) + ' → $' + (s.totalValueTo || 0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0}) + '</div><div class="inv-stat-label">Total Value <span style="color:' + (s.valueChange >= 0 ? '#059669' : '#DC2626') + ';font-weight:700">(' + (s.valueChange >= 0 ? '+$' : '-$') + Math.abs(s.valueChange).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2}) + ')</span></div></div>';
  }
  html += '<div class="inv-stat-card"><div class="inv-stat-value">' + (s.productsChanged || 0) + '</div><div class="inv-stat-label">Products Changed</div></div>';
  html += '</div>';

  // Changes table
  html += '<h3 style="font-size:14px;font-weight:700;color:#374151;margin:16px 0 8px"><i class="fas fa-exchange-alt"></i> Changes (' + data.changes.length + ')</h3>';
  if (data.changes.length === 0) {
    html += '<div style="padding:24px;text-align:center;color:#9CA3AF">No changes between these dates</div>';
  } else {
    html += '<div style="overflow-x:auto"><table class="inv-table"><thead><tr>';
    html += '<th>Product</th><th>Category</th><th style="text-align:right">' + comp.from + '</th><th style="text-align:right">' + comp.to + '</th><th style="text-align:right">Change</th>';
    if (_showFin) html += '<th style="text-align:right">Value Change</th>';
    html += '</tr></thead><tbody>';
    for (var i = 0; i < data.changes.length; i++) {
      var ch = data.changes[i];
      var color = ch.qty_change > 0 ? '#059669' : '#DC2626';
      var icon = ch.qty_change > 0 ? 'fa-arrow-up' : 'fa-arrow-down';
      html += '<tr>';
      html += '<td style="font-weight:600">' + (ch.product_name || 'Product #' + ch.product_id) + '</td>';
      html += '<td style="text-transform:capitalize;font-size:12px;color:#6B7280">' + (ch.category || '-') + '</td>';
      html += '<td style="text-align:right">' + (ch.qty_from || 0).toLocaleString() + '</td>';
      html += '<td style="text-align:right;font-weight:600">' + (ch.qty_to || 0).toLocaleString() + '</td>';
      html += '<td style="text-align:right;color:' + color + ';font-weight:700"><i class="fas ' + icon + '" style="font-size:10px"></i> ' + (ch.qty_change > 0 ? '+' : '') + ch.qty_change.toLocaleString() + '</td>';
      if (_showFin) {
        var vc = ch.value_change || 0;
        html += '<td style="text-align:right;color:' + (vc >= 0 ? '#059669' : '#DC2626') + '">' + (vc >= 0 ? '+$' : '-$') + Math.abs(vc).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2}) + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';
  }

  html += '</div>';
  return html;
}

// ==================== SMART RESTOCK ====================
var _srData = null;
var _srLocationId = '';
var _srDays = '90';
var _srFilter = 'suggestions'; // suggestions, all, critical, low
var _srSearch = '';
var _srSelected = {}; // { product_id: qty } for batch transfer creation

async function invRenderSmartRestock() {
  try {
    var params = '?days=' + _srDays;
    if (_srLocationId) params += '&location_id=' + _srLocationId;
    var resp = await invAPI.get('/api/inventory/smart-restock' + params, { headers: invHeaders() });
    _srData = resp.data;
  } catch(e) {
    return '<div class="inv-card" style="padding:24px;color:#DC2626"><i class="fas fa-exclamation-triangle"></i> Error loading analysis: ' + (e.message || e) + '</div>';
  }

  var d = _srData;
  var locs = d.locations || [];
  var suggestions = d.suggestions || [];
  var products = d.products || [];

  // Location picker
  var locOpts = '<option value="">All Locations</option>';
  locs.forEach(function(l) {
    locOpts += '<option value="' + l.id + '"' + (_srLocationId == l.id ? ' selected' : '') + '>' + l.code + ' — ' + l.name + '</option>';
  });

  // Period picker
  var dayOpts = [30,60,90,180].map(function(v) {
    return '<option value="' + v + '"' + (_srDays == v ? ' selected' : '') + '>' + v + ' days</option>';
  }).join('');

  // Filter tabs
  var tabs = [
    { id: 'suggestions', label: 'Suggestions', count: suggestions.length, icon: 'fa-lightbulb', color: '#F59E0B' },
    { id: 'critical', label: 'Critical', count: d.summary.critical, icon: 'fa-fire', color: '#DC2626' },
    { id: 'low', label: 'Low Stock', count: d.summary.low, icon: 'fa-arrow-down', color: '#F97316' },
    { id: 'all', label: 'All Products', count: d.total_products_analyzed, icon: 'fa-boxes-stacked', color: '#6366F1' }
  ];

  var html = '<div class="inv-sr">';

  // Header
  html += '<div class="inv-sr-header">' +
    '<div class="inv-sr-title"><i class="fas fa-wand-magic-sparkles" style="color:#F59E0B"></i> Smart Restock</div>' +
    '<div class="inv-sr-controls">' +
      '<select class="inv-sr-select" onchange="_srLocationId=this.value;invRender()">' + locOpts + '</select>' +
      '<select class="inv-sr-select" onchange="_srDays=this.value;invRender()">' + dayOpts + '</select>' +
    '</div>' +
  '</div>';

  // Summary cards
  var statusCards = [
    { label: 'Critical', count: d.summary.critical, icon: 'fa-fire', color: '#DC2626', bg: '#FEF2F2' },
    { label: 'Low Stock', count: d.summary.low, icon: 'fa-arrow-down', color: '#F97316', bg: '#FFF7ED' },
    { label: 'Watch', count: d.summary.watch, icon: 'fa-eye', color: '#CA8A04', bg: '#FEFCE8' },
    { label: 'OK', count: d.summary.ok, icon: 'fa-check-circle', color: '#059669', bg: '#F0FDF4' },
  ];
  html += '<div class="inv-sr-stats">' +
    statusCards.map(function(sc) {
      return '<div class="inv-sr-stat" style="border-left:3px solid ' + sc.color + ';background:' + sc.bg + '" onclick="_srFilter=\'' + sc.label.toLowerCase().replace(' stock','') + '\';invRender()">' +
        '<div class="inv-sr-stat-icon" style="color:' + sc.color + '"><i class="fas ' + sc.icon + '"></i></div>' +
        '<div class="inv-sr-stat-val">' + sc.count + '</div>' +
        '<div class="inv-sr-stat-label">' + sc.label + '</div></div>';
    }).join('') +
  '</div>';

  // Tabs + search
  html += '<div class="inv-sr-tabs">' +
    '<div class="inv-sr-tab-row">' +
    tabs.map(function(t) {
      return '<button class="inv-sr-tab' + (_srFilter === t.id ? ' active' : '') + '" onclick="_srFilter=\'' + t.id + '\';_srSelected={};invRender()">' +
        '<i class="fas ' + t.icon + '" style="color:' + t.color + '"></i> ' + t.label +
        (t.count > 0 ? ' <span class="inv-sr-tab-count">' + t.count + '</span>' : '') +
      '</button>';
    }).join('') +
    '</div>' +
    '<input class="inv-sr-search" placeholder="Search products..." value="' + (_srSearch || '') + '" oninput="_srSearch=this.value;invSrRerender()">' +
  '</div>';

  // Content area
  html += '<div id="invSrContent">' + invSrRenderContent() + '</div>';

  html += '</div>';
  return html;
}

function invSrRerender() {
  var ct = document.getElementById('invSrContent');
  if (ct) ct.innerHTML = invSrRenderContent();
}

function invSrRenderContent() {
  if (!_srData) return '';
  var d = _srData;
  var html = '';

  if (_srFilter === 'suggestions') {
    html = invSrRenderSuggestions(d.suggestions || []);
  } else {
    var products = d.products || [];
    if (_srFilter === 'critical') products = products.filter(function(p) { return p.stock.status === 'critical'; });
    else if (_srFilter === 'low') products = products.filter(function(p) { return p.stock.status === 'low'; });

    if (_srSearch) {
      var q = _srSearch.toLowerCase();
      products = products.filter(function(p) {
        return (p.product_name || '').toLowerCase().indexOf(q) >= 0 || (p.sku || '').toLowerCase().indexOf(q) >= 0 || (p.category || '').toLowerCase().indexOf(q) >= 0;
      });
    }

    html = invSrRenderProductList(products);
  }
  return html;
}

function invSrRenderSuggestions(suggestions) {
  if (suggestions.length === 0) {
    return '<div class="inv-sr-empty"><i class="fas fa-check-circle" style="color:#059669;font-size:32px"></i><h3>All stocked up!</h3><p>No restock suggestions for the selected location and period.</p></div>';
  }

  // Group by action type
  var transfers = suggestions.filter(function(s) { return s.action === 'transfer'; });
  var purchases = suggestions.filter(function(s) { return s.action === 'purchase'; });

  var html = '';

  // Transfer suggestions
  if (transfers.length > 0) {
    html += '<div class="inv-sr-section">' +
      '<div class="inv-sr-section-hdr">' +
        '<div><i class="fas fa-arrows-left-right" style="color:#3B82F6"></i> <strong>Transfer from Other Location</strong> <span class="inv-sr-section-count">' + transfers.length + ' items</span></div>' +
        '<button class="inv-sr-action-btn transfer" onclick="invSrSelectAll(\'transfer\')"><i class="fas fa-check-double"></i> Select All</button>' +
      '</div>';

    transfers.forEach(function(s) {
      var statusColor = s.status === 'critical' ? '#DC2626' : s.status === 'low' ? '#F97316' : '#CA8A04';
      var isSelected = _srSelected[s.product_id] > 0;
      html += '<div class="inv-sr-suggestion ' + s.status + (isSelected ? ' selected' : '') + '" onclick="invSrToggle(' + s.product_id + ',' + s.suggested_qty + ')">' +
        '<div class="inv-sr-sug-check"><i class="fas ' + (isSelected ? 'fa-check-square' : 'fa-square') + '"></i></div>' +
        '<div class="inv-sr-sug-info">' +
          '<div class="inv-sr-sug-name">' + invEsc(s.product_name) + '</div>' +
          '<div class="inv-sr-sug-meta">' + invEsc(s.sku || '') + ' &bull; ' + invEsc(s.category || '') + '</div>' +
        '</div>' +
        '<div class="inv-sr-sug-demand">' +
          '<div class="inv-sr-sug-demand-val">' + s.weekly_demand + '<small>/wk</small></div>' +
          '<div class="inv-sr-sug-supply" style="color:' + statusColor + '">' + s.days_of_supply + 'd supply</div>' +
        '</div>' +
        '<div class="inv-sr-sug-stock">' +
          '<div>Now: <strong>' + s.current_stock + '</strong></div>' +
          '<div>Need: <strong style="color:#3B82F6">+' + s.suggested_qty + '</strong></div>' +
        '</div>' +
        '<div class="inv-sr-sug-from">' +
          '<i class="fas fa-arrow-right" style="color:#3B82F6"></i>' +
          '<div><small>from</small><br><strong>' + invEsc(s.from_location.code) + '</strong><br><small>' + s.from_location.available + ' avail</small></div>' +
        '</div>' +
      '</div>';
    });

    // Batch create transfer button
    var selectedCount = 0;
    transfers.forEach(function(s) { if (_srSelected[s.product_id] > 0) selectedCount++; });
    if (selectedCount > 0) {
      html += '<div class="inv-sr-batch-bar">' +
        '<span>' + selectedCount + ' item' + (selectedCount !== 1 ? 's' : '') + ' selected</span>' +
        '<button class="inv-sr-create-btn" onclick="invSrCreateTransfer()"><i class="fas fa-truck-ramp-box"></i> Create Transfer</button>' +
      '</div>';
    }
    html += '</div>';
  }

  // Purchase suggestions
  if (purchases.length > 0) {
    html += '<div class="inv-sr-section">' +
      '<div class="inv-sr-section-hdr">' +
        '<div><i class="fas fa-cart-shopping" style="color:#059669"></i> <strong>Needs Purchase Order</strong> <span class="inv-sr-section-count">' + purchases.length + ' items</span></div>' +
      '</div>';
    purchases.forEach(function(s) {
      var statusColor = s.status === 'critical' ? '#DC2626' : s.status === 'low' ? '#F97316' : '#CA8A04';
      html += '<div class="inv-sr-suggestion ' + s.status + ' purchase">' +
        '<div class="inv-sr-sug-info" style="flex:1">' +
          '<div class="inv-sr-sug-name">' + invEsc(s.product_name) + '</div>' +
          '<div class="inv-sr-sug-meta">' + invEsc(s.sku || '') + ' &bull; ' + invEsc(s.category || '') + '</div>' +
        '</div>' +
        '<div class="inv-sr-sug-demand">' +
          '<div class="inv-sr-sug-demand-val">' + s.weekly_demand + '<small>/wk</small></div>' +
          '<div class="inv-sr-sug-supply" style="color:' + statusColor + '">' + s.days_of_supply + 'd supply</div>' +
        '</div>' +
        '<div class="inv-sr-sug-stock">' +
          '<div>Now: <strong>' + s.current_stock + '</strong></div>' +
          '<div>Need: <strong style="color:#059669">+' + s.suggested_qty + '</strong></div>' +
        '</div>' +
        '<div class="inv-sr-sug-po"><span style="color:#9CA3AF;font-size:11px">Low everywhere<br>Order from supplier</span></div>' +
      '</div>';
    });
    html += '</div>';
  }

  return html;
}

function invSrRenderProductList(products) {
  if (products.length === 0) {
    return '<div class="inv-sr-empty"><i class="fas fa-search" style="color:#9CA3AF;font-size:24px"></i><p>No products match this filter</p></div>';
  }

  var html = '<div class="inv-sr-products">';
  products.forEach(function(p) {
    var statusColor = p.stock.status === 'critical' ? '#DC2626' : p.stock.status === 'low' ? '#F97316' : p.stock.status === 'watch' ? '#CA8A04' : '#059669';
    var statusLabel = p.stock.status === 'critical' ? 'CRITICAL' : p.stock.status === 'low' ? 'LOW' : p.stock.status === 'watch' ? 'WATCH' : 'OK';
    html += '<div class="inv-sr-product">' +
      '<div class="inv-sr-prod-main">' +
        '<div class="inv-sr-prod-info">' +
          '<div class="inv-sr-prod-name">' + invEsc(p.product_name) + '</div>' +
          '<div class="inv-sr-prod-meta">' + invEsc(p.sku || '') + ' &bull; ' + invEsc(p.category || '') + ' &bull; ' + p.demand.unique_customers + ' customers</div>' +
        '</div>' +
        '<span class="inv-sr-badge" style="background:' + statusColor + '15;color:' + statusColor + ';border:1px solid ' + statusColor + '40">' + statusLabel + '</span>' +
      '</div>' +
      '<div class="inv-sr-prod-metrics">' +
        '<div class="inv-sr-metric"><div class="inv-sr-metric-val">' + p.demand.avg_weekly + '</div><div class="inv-sr-metric-label">Avg/Week</div></div>' +
        '<div class="inv-sr-metric"><div class="inv-sr-metric-val">' + p.demand.order_count + '</div><div class="inv-sr-metric-label">Orders</div></div>' +
        '<div class="inv-sr-metric"><div class="inv-sr-metric-val">' + p.stock.total_available + '</div><div class="inv-sr-metric-label">Total Stock</div></div>' +
        '<div class="inv-sr-metric"><div class="inv-sr-metric-val" style="color:' + statusColor + '">' + (p.stock.days_of_supply >= 999 ? '∞' : p.stock.days_of_supply + 'd') + '</div><div class="inv-sr-metric-label">Days Supply</div></div>' +
      '</div>' +
      '<div class="inv-sr-prod-locs">' +
        (p.locations || []).map(function(l) {
          var lc = l.status === 'critical' ? '#DC2626' : l.status === 'low' ? '#F97316' : l.status === 'watch' ? '#CA8A04' : '#059669';
          var pct = l.demand_weekly > 0 ? Math.min(100, Math.round((l.stock_available / (l.demand_weekly * 4)) * 100)) : (l.stock_available > 0 ? 100 : 0);
          return '<div class="inv-sr-loc-bar">' +
            '<div class="inv-sr-loc-name">' + invEsc(l.location_code) + '</div>' +
            '<div class="inv-sr-loc-progress"><div class="inv-sr-loc-fill" style="width:' + pct + '%;background:' + lc + '"></div></div>' +
            '<div class="inv-sr-loc-qty">' + l.stock_available + ' <small>(' + l.demand_weekly + '/wk)</small></div>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>';
  });
  html += '</div>';
  return html;
}

function invSrToggle(productId, suggestedQty) {
  if (_srSelected[productId]) { delete _srSelected[productId]; }
  else { _srSelected[productId] = suggestedQty; }
  invSrRerender();
}

function invSrSelectAll(actionType) {
  if (!_srData) return;
  var suggestions = (_srData.suggestions || []).filter(function(s) { return s.action === actionType; });
  // If all selected, deselect all
  var allSelected = suggestions.every(function(s) { return _srSelected[s.product_id] > 0; });
  if (allSelected) {
    suggestions.forEach(function(s) { delete _srSelected[s.product_id]; });
  } else {
    suggestions.forEach(function(s) { _srSelected[s.product_id] = s.suggested_qty; });
  }
  invSrRerender();
}

async function invSrCreateTransfer() {
  if (!_srData) return;
  var suggestions = (_srData.suggestions || []).filter(function(s) { return s.action === 'transfer' && _srSelected[s.product_id] > 0; });
  if (suggestions.length === 0) { invToast('No items selected', 'error'); return; }

  // Group by from_location → to_location
  var groups = {};
  suggestions.forEach(function(s) {
    var key = s.from_location.id + '_' + s.to_location.id;
    if (!groups[key]) groups[key] = { from: s.from_location.id, to: s.to_location.id, from_name: s.from_location.name, to_name: s.to_location.name, items: [] };
    groups[key].items.push({ product_id: s.product_id, quantity: _srSelected[s.product_id], name: s.product_name });
  });

  // Confirm
  var msg = 'Create transfer(s)?\\n\\n';
  Object.values(groups).forEach(function(g) {
    msg += g.from_name + ' → ' + g.to_name + ': ' + g.items.length + ' items\\n';
    g.items.forEach(function(i) { msg += '  • ' + i.name + ' × ' + i.quantity + '\\n'; });
  });
  if (!confirm(msg)) return;

  try {
    var created = [];
    for (var key of Object.keys(groups)) {
      var g = groups[key];
      var resp = await invAPI.post('/api/inventory/smart-restock/create-transfer', {
        from_location_id: g.from,
        to_location_id: g.to,
        items: g.items.map(function(i) { return { product_id: i.product_id, quantity: i.quantity }; }),
        notes: 'Smart Restock: ' + g.items.length + ' items based on ' + _srDays + '-day demand analysis',
        created_by: invUser?.id
      }, { headers: invHeaders() });
      created.push(resp.data.transfer_number);
    }
    invToast('Transfer(s) created: ' + created.join(', '));
    _srSelected = {};
    invRender();
  } catch(e) {
    invToast('Error: ' + (e.response?.data?.error || e.message), 'error');
  }
}

function invEsc(s) {
  var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML;
}

// Take a snapshot manually
async function invTakeSnapshotNow() {
  if (!confirm('Take an inventory snapshot now? This captures the current state of all stock levels.')) return;
  try {
    var resp = await invAPI.post('/api/inventory/snapshot', {}, { headers: invHeaders() });
    if (resp.data.skipped) {
      invToast('Snapshot for today already exists', 'info');
    } else {
      invToast('Snapshot taken! ' + (resp.data.items_captured || 0) + ' items captured.');
    }
    invRender();
  } catch(e) {
    invToast('Snapshot failed: ' + (e.response?.data?.error || e.message), 'error');
  }
}

// ==================== ORDER ASSIGNMENTS (per category) ====================

var _oaData = null;

async function invRenderOrderAssignments() {
  try {
    var resp = await invAPI.get('/api/inventory/category-assignments', { headers: invHeaders() });
    _oaData = resp.data;
  } catch(e) {
    return '<div class="inv-section"><div class="inv-empty"><i class="fas fa-exclamation-triangle" style="color:#DC2626;font-size:32px"></i><h3>Failed to load</h3><p>' + (e.response?.data?.error || e.message) + '</p></div></div>';
  }

  var assignments = _oaData.assignments || [];
  var categories = _oaData.categories || [];
  var users = _oaData.users || [];

  // Group assignments by category
  var byCategory = {};
  categories.forEach(function(c) { byCategory[c] = []; });
  assignments.forEach(function(a) {
    if (!byCategory[a.category]) byCategory[a.category] = [];
    byCategory[a.category].push(a);
  });

  var html = '<div class="inv-section">';
  html += '<div class="inv-section-header"><h2><i class="fas fa-user-gear"></i> Order Assignments</h2>';
  html += '<button class="inv-btn inv-btn-primary" onclick="invShowAddAssignment()"><i class="fas fa-plus"></i> Add Assignment</button>';
  html += '</div>';
  html += '<p class="inv-muted" style="margin-bottom:16px">Assign who is responsible for ordering each product category. When purchase requests are created, they will auto-assign to the person responsible for that category.</p>';

  if (categories.length === 0) {
    html += '<div class="inv-empty"><p>No product categories found. Add products first.</p></div>';
  } else {
    html += '<div class="inv-oa-grid">';
    categories.forEach(function(cat) {
      var catAssigns = byCategory[cat] || [];
      var catLabel = cat.replace(/_/g, ' ');
      catLabel = catLabel.charAt(0).toUpperCase() + catLabel.slice(1);

      html += '<div class="inv-oa-card">';
      html += '<div class="inv-oa-card-header"><strong>' + invEsc(catLabel) + '</strong></div>';
      if (catAssigns.length === 0) {
        html += '<div class="inv-oa-unassigned"><i class="fas fa-user-slash"></i> Unassigned</div>';
      } else {
        catAssigns.forEach(function(a) {
          html += '<div class="inv-oa-person">' +
            '<div><i class="fas fa-user"></i> <strong>' + invEsc(a.user_name || a.user_email || 'User #' + a.user_id) + '</strong>' +
            (a.is_primary ? ' <span class="inv-status inv-status-success" style="font-size:10px">Primary</span>' : '') +
            (a.notes ? '<br><span class="inv-muted" style="font-size:12px">' + invEsc(a.notes) + '</span>' : '') +
            '</div>' +
            '<button class="inv-btn inv-btn-xs inv-btn-danger" onclick="invRemoveAssignment(' + a.id + ')" title="Remove"><i class="fas fa-times"></i></button>' +
            '</div>';
        });
      }
      html += '</div>';
    });
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function invShowAddAssignment() {
  if (!_oaData) { invToast('Data not loaded', 'error'); return; }
  var categories = _oaData.categories || [];
  var users = _oaData.users || [];

  var body = '<div class="inv-form-group"><label>Category</label><select id="invOaCategory" class="inv-select">' +
    '<option value="">Select category...</option>';
  categories.forEach(function(c) {
    var label = c.replace(/_/g, ' ');
    label = label.charAt(0).toUpperCase() + label.slice(1);
    body += '<option value="' + invEsc(c) + '">' + invEsc(label) + '</option>';
  });
  body += '</select></div>';

  body += '<div class="inv-form-group"><label>Assigned To</label><select id="invOaUser" class="inv-select">' +
    '<option value="">Select person...</option>';
  users.forEach(function(u) {
    body += '<option value="' + u.id + '" data-name="' + invEsc(u.name) + '">' + invEsc(u.name) + ' (' + invEsc(u.role) + ')</option>';
  });
  body += '</select></div>';

  body += '<div class="inv-form-group"><label><input type="checkbox" id="invOaPrimary" checked> Primary person for this category</label></div>';
  body += '<div class="inv-form-group"><label>Notes (optional)</label><input id="invOaNotes" class="inv-input" placeholder="e.g. Handles all hay vendors"></div>';

  var footer = '<button class="inv-btn inv-btn-primary" onclick="invDoAddAssignment()"><i class="fas fa-check"></i> Assign</button>';
  invShowModal('<i class="fas fa-user-gear"></i> Assign Category', body, footer);
}
window.invShowAddAssignment = invShowAddAssignment;

async function invDoAddAssignment() {
  var category = document.getElementById('invOaCategory').value;
  var userSel = document.getElementById('invOaUser');
  var userId = parseInt(userSel.value);
  var userName = userSel.options[userSel.selectedIndex]?.getAttribute('data-name') || '';
  var isPrimary = document.getElementById('invOaPrimary').checked ? 1 : 0;
  var notes = document.getElementById('invOaNotes').value;

  if (!category || !userId) { invToast('Select category and person', 'warning'); return; }

  try {
    await invAPI.post('/api/inventory/category-assignments', {
      category: category, user_id: userId, user_name: userName, is_primary: isPrimary, notes: notes
    }, { headers: invHeaders() });
    invToast('Assignment saved');
    invCloseModal();
    invRender();
  } catch(e) { invToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}
window.invDoAddAssignment = invDoAddAssignment;

async function invRemoveAssignment(id) {
  if (!confirm('Remove this assignment?')) return;
  try {
    await invAPI.delete('/api/inventory/category-assignments/' + id, { headers: invHeaders() });
    invToast('Assignment removed');
    invRender();
  } catch(e) { invToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}
window.invRemoveAssignment = invRemoveAssignment;
