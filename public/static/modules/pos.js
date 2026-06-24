// BF Operations — Point of Sale Module
// Full register, customer panel, payment, receipt, held sales, history
// Supports Loxahatchee Retail + Aldi Warehouse cross-location workflows

(function() {
'use strict';

var API = window.axios ? axios.create({ baseURL: '/api' }) : null;
var _s = {
  session: null,
  cart: [],
  customer: null,
  customerAcct: null,
  customerAddresses: [],
  locations: [],
  categories: [],
  currentCat: '',
  searchTimer: null,
  view: 'register',
  heldCount: 0,
  deliveryReq: false,
  deliveryDate: '',
  deliveryAddrId: null,
  warnings: [],
  payMethod: null, // set dynamically: 'cash' for retail, 'credit_card' for DC
  splitPayments: [],
  productCache: {}, // keyed by id for click lookups
  custPage: 1,
  custSearch: '',
  custTagFilter: '',
  custTypeFilter: '',
  custAllTags: [],
  custUsers: [],
  custEditing: null, // customer being edited in sheet
  appliedPromo: null, // { promo_id, discount, description, code }
  promoCode: '',
  mergeMode: false,
  mergeTarget: null, // first customer selected for merge
  fees: [], // loaded from /api/pos/fees
  appliedFuelSurcharge: 0,
  appliedCCFee: 0,
  // Barcode scanner state
  scanBuffer: '',
  scanLastKey: 0,
  scanTimer: null,
  scanListenerBound: false
};

// ==================== INIT ====================
window._posInit = function() {
  if (!API) API = axios.create({ baseURL: '/api' });
  var token = localStorage.getItem('bf_token') || localStorage.getItem('bf_ops_token');
  if (token) API.defaults.headers.common['Authorization'] = 'Bearer ' + token;

  _s.cart = [];
  _s.customer = null;
  _s.customerAcct = null;
  _s.warnings = [];
  _s.deliveryReq = false;
  _s.productCache = {};

  // Load locations, categories, and fees, then check session
  Promise.all([
    API.get('/pos/locations').then(function(r) { _s.locations = r.data || []; }).catch(function() {}),
    API.get('/pos/categories').then(function(r) { _s.categories = r.data || []; }).catch(function() {}),
    API.get('/pos/fees').then(function(r) { _s.fees = r.data || []; }).catch(function() { _s.fees = []; })
  ]).then(function() {
    checkExistingSession();
  });
};

window._posCleanup = function() {
  _s.session = null;
  _s.cart = [];
  _s.customer = null;
  _s.view = 'register';
  _s.productCache = {};
  // Remove barcode scanner listener
  if (_s.scanListenerBound) {
    document.removeEventListener('keydown', posHandleScanKeydown);
    _s.scanListenerBound = false;
  }
  // Restore logistics navigate if we overrode it in DC mode
  if (_origLogisticsNavigate) {
    window.navigate = _origLogisticsNavigate;
    _origLogisticsNavigate = null;
  }
};

function checkExistingSession() {
  var saved = localStorage.getItem('bf_pos_session');
  if (saved) {
    try {
      _s.session = JSON.parse(saved);
      renderRegisterView();
      return;
    } catch(e) {}
  }
  renderOpenSession();
}

function getLocationId() {
  return _s.session ? (_s.session.location_id || 1) : 1;
}

function getLocationType() {
  var locId = getLocationId();
  var loc = _s.locations.find(function(l) { return l.id == locId; });
  return loc ? loc.type : 'retail';
}

function getLocationName(id) {
  var loc = _s.locations.find(function(l) { return l.id == (id || getLocationId()); });
  return loc ? loc.name : 'Unknown';
}

function getOtherLocation() {
  var current = getLocationId();
  return _s.locations.find(function(l) { return l.id != current; });
}

function isDCMode() {
  return getLocationType() === 'distribution';
}

function getDefaultPayMethod() {
  return isDCMode() ? 'credit_card' : 'cash';
}

// ==================== RENDER: OPEN SESSION ====================
function renderOpenSession() {
  var el = document.getElementById('pos-app');
  if (!el) return;

  var locOpts = '';
  if (_s.locations.length === 0) {
    locOpts = '<option value="1">Main Location</option>';
  } else {
    _s.locations.forEach(function(l) {
      locOpts += '<option value="' + l.id + '">' + esc(l.name) + ' (' + esc(l.type) + ')</option>';
    });
  }

  el.innerHTML =
    '<div class="pos-topbar">' +
      '<div class="pos-topbar-title"><i class="fas fa-cash-register"></i> Point of Sale</div>' +
    '</div>' +
    '<div class="pos-view active pos-open-session">' +
      '<div class="pos-session-card">' +
        '<i class="fas fa-cash-register" style="font-size:48px;color:var(--pos-navy);margin-bottom:12px"></i>' +
        '<h2>Open Register</h2>' +
        '<p>Start a new shift to begin taking sales</p>' +
        '<div class="pos-session-form">' +
          '<div><label>Location</label><select id="posSessionLoc">' + locOpts + '</select></div>' +
          '<div id="posSessionCashWrap"><label>Opening Cash ($)</label><input type="number" id="posSessionCash" value="0" min="0" step="0.01"></div>' +
          '<div id="posSessionDcNotice" style="display:none;background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:10px;font-size:12px;color:#92400E"><i class="fas fa-info-circle"></i> Distribution center — no cash drawer. Card &amp; account payments only.</div>' +
          '<button class="pos-session-open-btn" id="posOpenBtn"><i class="fas fa-play"></i> Open Register</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  // Toggle cash field based on location type
  function updateSessionLocUI() {
    var selLoc = parseInt(gv('posSessionLoc')) || 1;
    var loc = _s.locations.find(function(l) { return l.id == selLoc; });
    var isDC = loc && loc.type === 'distribution';
    var cashWrap = document.getElementById('posSessionCashWrap');
    var dcNotice = document.getElementById('posSessionDcNotice');
    if (cashWrap) cashWrap.style.display = isDC ? 'none' : '';
    if (dcNotice) dcNotice.style.display = isDC ? '' : 'none';
  }
  on('posSessionLoc', 'change', updateSessionLocUI);
  updateSessionLocUI();

  on('posOpenBtn', 'click', function() {
    var user = getUser();
    var locId = parseInt(gv('posSessionLoc')) || 1;
    var loc = _s.locations.find(function(l) { return l.id == locId; });
    var regType = (loc && loc.type === 'distribution') ? 'wholesale' : 'retail';

    var body = {
      user_id: user ? user.id : null,
      user_name: user ? user.name : 'Unknown',
      location_id: locId,
      register_type: regType,
      opening_cash: parseFloat(gv('posSessionCash')) || 0
    };

    API.post('/pos/sessions', body).then(function(r) {
      _s.session = { id: r.data.id, location_id: body.location_id, register_type: regType, status: 'open', user_name: body.user_name, opened_at: new Date().toISOString() };
      localStorage.setItem('bf_pos_session', JSON.stringify(_s.session));
      renderRegisterView();
    }).catch(function(err) {
      toast('Failed to open session: ' + errMsg(err), 'error');
    });
  });
}

// ==================== RENDER: MAIN REGISTER VIEW ====================
// ==================== DISTRIBUTION CENTER (ALDI) SIDEBAR NAV ITEMS ====================
var _posSidebarItems = [
  { section: 'Quick Start' },
  { id: 'today', icon: 'fa-clipboard-check', label: 'Today' },
  { section: 'Point of Sale' },
  { id: 'register', icon: 'fa-cash-register', label: 'Register' },
  { id: 'dashboard', icon: 'fa-chart-bar', label: 'Dashboard' },
  { id: 'history', icon: 'fa-clock-rotate-left', label: 'Sales History' },
  { id: 'all-orders', icon: 'fa-layer-group', label: 'All Orders' },
  { section: 'Order Management' },
  { id: 'orders', icon: 'fa-clipboard-list', label: 'Customer Orders' },
  { id: 'recurring', icon: 'fa-sync-alt', label: 'Recurring Orders' },
  { section: 'Standing Orders' },
  { id: 'standing_orders', icon: 'fa-bell-concierge', label: 'Standing Orders' },
  { id: 'so_dashboard', icon: 'fa-tv', label: 'SO Dashboard' },
  { id: 'seasonality', icon: 'fa-sun', label: 'Seasonality' },
  { section: 'Resources' },
  { id: 'customers', icon: 'fa-users', label: 'Customers' },
  { id: 'inventory-requests', icon: 'fa-boxes-stacked', label: 'Stock Requests' },
  { id: 'statements', icon: 'fa-file-invoice-dollar', label: 'Statements' },
  { section: 'Cash Management' },
  { id: 'petty-cash', icon: 'fa-money-bill-transfer', label: 'Petty Cash' },
  { section: 'Warehouse' },
  { id: 'darts-queue', icon: 'fa-satellite-dish', label: 'DARTS Queue' }
];

// Logistics render functions called from POS distribution mode
var _posLogisticsPages = {
  today: 'renderToday',
  orders: 'renderOrders',
  recurring: 'renderRecurring',
  standing_orders: 'renderStandingOrders',
  so_dashboard: 'renderSODashboard',
  seasonality: 'renderSeasonality'
};

var _posSidebarOpen = false;

function renderRegisterView() {
  var el = document.getElementById('pos-app');
  if (!el) return;

  var locName = getLocationName();
  var locType = getLocationType();

  // ---- DISTRIBUTION CENTER: sidebar layout ----
  if (locType === 'distribution') {
    _renderDistributionLayout(el, locName);
    return;
  }

  // ---- RETAIL STORE: simple topbar layout ----
  var locBadge = '<span style="background:rgba(16,185,129,0.2);color:#6EE7B7;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700">RETAIL</span>';

  el.innerHTML =
    '<div class="pos-topbar">' +
      '<div class="pos-topbar-title"><i class="fas fa-cash-register"></i> POS</div>' +
      '<div class="pos-topbar-location"><i class="fas fa-map-marker-alt"></i> ' + esc(locName) + ' ' + locBadge + '</div>' +
      '<div class="pos-topbar-session">Session #' + (_s.session ? _s.session.id : '-') + '</div>' +
      '<div class="pos-topbar-right">' +
        '<button class="pos-topbar-btn" id="posBtnDash"><i class="fas fa-chart-bar"></i> <span class="hide-mobile">Dashboard</span></button>' +
        '<button class="pos-topbar-btn" id="posBtnReg"><i class="fas fa-cash-register"></i> <span class="hide-mobile">Register</span></button>' +
        '<button class="pos-topbar-btn" id="posBtnHist"><i class="fas fa-clock-rotate-left"></i> <span class="hide-mobile">History</span></button>' +
        '<button class="pos-topbar-btn" id="posBtnOrders"><i class="fas fa-clipboard-list"></i> <span class="hide-mobile">Orders</span></button>' +
        '<button class="pos-topbar-btn" id="posBtnCust"><i class="fas fa-address-book"></i> <span class="hide-mobile">Customers</span></button>' +
        '<button class="pos-topbar-btn" id="posBtnInvReq"><i class="fas fa-boxes-stacked"></i> <span class="hide-mobile">Stock Req</span></button>' +
        '<button class="pos-topbar-btn" id="posBtnStmts"><i class="fas fa-file-invoice-dollar"></i> <span class="hide-mobile">Statements</span></button>' +
        '<button class="pos-topbar-btn" id="posBtnPetty" style="color:#F59E0B"><i class="fas fa-money-bill-transfer"></i> <span class="hide-mobile">Petty Cash</span></button>' +
        '<button class="pos-topbar-btn" id="posBtnDarts" style="color:#8B5CF6"><i class="fas fa-satellite-dish"></i> <span class="hide-mobile">DARTS</span> <span id="posDartsBadge" class="pos-held-badge" style="display:none;background:#8B5CF6">0</span></button>' +
        '<button class="pos-topbar-btn" id="posBtnHeld"><i class="fas fa-pause-circle"></i> <span class="hide-mobile">Held</span> <span id="posHeldBadge" class="pos-held-badge" style="display:none">0</span></button>' +
        '<button class="pos-topbar-btn danger" id="posBtnClose"><i class="fas fa-power-off"></i> <span class="hide-mobile">Close</span></button>' +
      '</div>' +
    '</div>' +
    '<div id="posViewDashboard" class="pos-view pos-dashboard"></div>' +
    '<div id="posViewRegister" class="pos-view pos-register"></div>' +
    '<div id="posViewHistory" class="pos-view pos-history"></div>' +
    '<div id="posViewCustomers" class="pos-view pos-customers"></div>' +
    '<div id="posViewAll-orders" class="pos-view pos-all-orders"></div>' +
    '<div id="posViewInventory-requests" class="pos-view pos-inv-requests"></div>' +
    '<div id="posViewStatements" class="pos-view pos-statements"></div>' +
    '<div id="posViewPetty-cash" class="pos-view pos-petty-cash"></div>' +
    '<div id="posViewDarts-queue" class="pos-view pos-darts-queue"></div>';

  on('posBtnDash', 'click', function() { switchView('dashboard'); });
  on('posBtnReg', 'click', function() { switchView('register'); });
  on('posBtnHist', 'click', function() { switchView('history'); });
  on('posBtnOrders', 'click', function() { switchView('all-orders'); });
  on('posBtnCust', 'click', function() { switchView('customers'); });
  on('posBtnPetty', 'click', function() { switchView('petty-cash'); });
  on('posBtnDarts', 'click', function() { switchView('darts-queue'); });
  on('posBtnInvReq', 'click', function() { switchView('inventory-requests'); });
  on('posBtnStmts', 'click', function() { switchView('statements'); });
  on('posBtnHeld', 'click', showHeld);
  on('posBtnClose', 'click', closeSession);

  switchView('register');
  loadHeldCount();
  _loadDartsBadge();
}

// ==================== DISTRIBUTION CENTER LAYOUT (ALDI) ==

// Ensure logistics.js is loaded (for render functions like renderStandingOrders, renderOrders, etc.)
function _ensureLogisticsLoaded(callback) {
  // If logistics functions are already available, callback immediately
  if (typeof window.renderStandingOrders === 'function') { callback(); return; }
  // Check if script is already in DOM but not initialized
  if (document.querySelector('script[src*="logistics.js"]')) {
    // Wait for it to finish loading
    var attempts = 0;
    var check = setInterval(function() {
      if (typeof window.renderStandingOrders === 'function' || attempts > 50) {
        clearInterval(check);
        callback();
      }
      attempts++;
    }, 100);
    return;
  }
  // Load the logistics script
  var script = document.createElement('script');
  script.src = '/static/modules/logistics.js?v=' + Date.now();
  script.dataset.module = 'logistics-preload';
  script.onload = function() {
    // Bridge token for logistics API interceptor
    var parentToken = localStorage.getItem('bf_ops_token');
    var shellUser = localStorage.getItem('bf_ops_user');
    if (parentToken) localStorage.setItem('bf_token', parentToken);
    if (shellUser) localStorage.setItem('bf_user', shellUser);
    // Ensure logistics' currentUser is set
    try { if (shellUser) window.currentUser = JSON.parse(shellUser); } catch(e2) {}
    callback();
  };
  document.body.appendChild(script);
}

// Save/restore logistics navigate function when entering/leaving POS DC mode
var _origLogisticsNavigate = null;

function _renderDistributionLayout(el, locName) {
  var sidebarHtml = '<div class="pos-dc-sidebar-header">' +
    '<div style="display:flex;align-items:center;gap:8px">' +
      '<i class="fas fa-warehouse" style="font-size:18px;color:#F59E0B"></i>' +
      '<div><div style="font-weight:700;font-size:14px;color:white">' + esc(locName) + '</div>' +
      '<div style="font-size:10px;color:rgba(255,255,255,0.6)">Session #' + (_s.session ? _s.session.id : '-') + '</div></div>' +
    '</div>' +
    '<button class="pos-dc-close-btn" onclick="window._posSidebarOpen=false;_updateDCSidebar()" title="Close menu"><i class="fas fa-times"></i></button>' +
  '</div>';

  _posSidebarItems.forEach(function(item) {
    if (item.section) {
      sidebarHtml += '<div class="pos-dc-nav-section">' + item.section + '</div>';
    } else {
      sidebarHtml += '<div class="pos-dc-nav-item" data-view="' + item.id + '" onclick="_posSwitchDCView(\'' + item.id + '\')">' +
        '<i class="fas ' + item.icon + '"></i> ' + item.label + '</div>';
    }
  });

  // Add held sales + close session at bottom
  sidebarHtml += '<div class="pos-dc-nav-section" style="margin-top:auto">Session</div>' +
    '<div class="pos-dc-nav-item" data-view="held" onclick="showHeld()"><i class="fas fa-pause-circle"></i> Held Sales <span id="posHeldBadge" class="pos-held-badge" style="display:none;margin-left:auto">0</span></div>' +
    '<div class="pos-dc-nav-item pos-dc-nav-danger" onclick="closeSession()"><i class="fas fa-power-off"></i> Close Session</div>';

  el.innerHTML =
    '<div class="pos-dc-layout">' +
      '<aside class="pos-dc-sidebar' + (_posSidebarOpen ? ' open' : '') + '" id="posDCSidebar">' + sidebarHtml + '</aside>' +
      '<div class="pos-dc-sidebar-overlay" id="posDCOverlay" onclick="window._posSidebarOpen=false;_updateDCSidebar()"></div>' +
      '<div class="pos-dc-main">' +
        '<div class="pos-dc-topbar">' +
          '<button class="pos-dc-menu-btn" onclick="window._posSidebarOpen=!window._posSidebarOpen;_updateDCSidebar()"><i class="fas fa-bars"></i></button>' +
          '<div class="pos-dc-topbar-title" id="posDCPageTitle"><i class="fas fa-cash-register"></i> Register</div>' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<span style="background:rgba(249,115,22,0.15);color:#FB923C;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700">DISTRIBUTION</span>' +
          '</div>' +
        '</div>' +
        '<div class="pos-dc-content" id="pageContent">' +
          '<div id="posViewDashboard" class="pos-view pos-dashboard"></div>' +
          '<div id="posViewRegister" class="pos-view pos-register"></div>' +
          '<div id="posViewHistory" class="pos-view pos-history"></div>' +
          '<div id="posViewCustomers" class="pos-view pos-customers"></div>' +
          '<div id="posViewAll-orders" class="pos-view pos-all-orders"></div>' +
          '<div id="posViewInventory-requests" class="pos-view pos-inv-requests"></div>' +
          '<div id="posViewStatements" class="pos-view pos-statements"></div>' +
          '<div id="posViewPetty-cash" class="pos-view pos-petty-cash"></div>' +
          '<div id="posViewDarts-queue" class="pos-view pos-darts-queue"></div>' +
        '</div>' +
      '</div>' +
    '</div>';

  // Highlight active nav item
  _updateDCNavActive('register');
  switchView('register');
  loadHeldCount();
  _loadDartsBadge();
}

function _updateDCSidebar() {
  var sb = document.getElementById('posDCSidebar');
  var ov = document.getElementById('posDCOverlay');
  if (sb) sb.classList.toggle('open', _posSidebarOpen);
  if (ov) ov.classList.toggle('active', _posSidebarOpen);
}

function _updateDCNavActive(viewId) {
  document.querySelectorAll('.pos-dc-nav-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.view === viewId);
  });
}

// Page titles for distribution center
var _dcPageTitles = {
  register: '<i class="fas fa-cash-register"></i> Register',
  dashboard: '<i class="fas fa-chart-bar"></i> Dashboard',
  history: '<i class="fas fa-clock-rotate-left"></i> Sales History',
  'all-orders': '<i class="fas fa-clipboard-list"></i> All Orders',
  customers: '<i class="fas fa-users"></i> Customers',
  'inventory-requests': '<i class="fas fa-boxes-stacked"></i> Stock Requests',
  statements: '<i class="fas fa-file-invoice-dollar"></i> Statements',
  today: '<i class="fas fa-clipboard-check"></i> Today',
  orders: '<i class="fas fa-clipboard-list"></i> Customer Orders',
  recurring: '<i class="fas fa-sync-alt"></i> Recurring Orders',
  standing_orders: '<i class="fas fa-bell-concierge"></i> Standing Orders',
  so_dashboard: '<i class="fas fa-tv"></i> SO Dashboard',
  seasonality: '<i class="fas fa-sun"></i> Seasonality'
};

function _posSwitchDCView(viewId) {
  // Close sidebar on mobile
  _posSidebarOpen = false;
  _updateDCSidebar();
  _updateDCNavActive(viewId);

  // Update title
  var titleEl = document.getElementById('posDCPageTitle');
  if (titleEl) titleEl.innerHTML = _dcPageTitles[viewId] || viewId;

  // Is this a logistics page (rendered by logistics.js)?
  var logFn = _posLogisticsPages[viewId];
  if (logFn) {
    // Hide POS views, show pageContent for logistics
    document.querySelectorAll('.pos-view').forEach(function(v) { v.classList.remove('active'); v.style.display = 'none'; });
    var pc = document.getElementById('pageContent');
    if (pc) {
      pc.style.display = '';
      pc.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:200px;color:#94A3B8"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';
    }
    _s.view = viewId;
    _ensureLogisticsLoaded(function() {
      // Override logistics navigate() to route through POS DC view switcher
      if (!_origLogisticsNavigate && typeof window.navigate === 'function') {
        _origLogisticsNavigate = window.navigate;
      }
      window.navigate = function(page, params) {
        window._params = params || {};
        if (_posLogisticsPages[page]) {
          _posSwitchDCView(page);
        } else if (['register','dashboard','history','all-orders','customers','inventory-requests','statements'].indexOf(page) >= 0) {
          _posSwitchDCView(page);
        } else {
          // Page not in POS — show toast
          if (typeof showToast === 'function') showToast('Open Logistics module for this page', 'info');
        }
      };
      if (typeof window[logFn] === 'function') {
        try { window[logFn](); } catch(err) { console.error('POS DC: Error rendering ' + logFn, err); }
      } else {
        if (pc) pc.innerHTML = '<div style="padding:40px;text-align:center;color:#94A3B8"><i class="fas fa-exclamation-triangle" style="font-size:32px;display:block;margin-bottom:8px"></i>This page could not be loaded. Try refreshing.</div>';
      }
    });
    return;
  }

  // POS-native view — restore pos-view display, render into correct container
  document.querySelectorAll('.pos-view').forEach(function(v) { v.style.display = ''; });
  switchView(viewId);
}
window._posSwitchDCView = _posSwitchDCView;
window._updateDCSidebar = _updateDCSidebar;

function switchView(view) {
  _s.view = view;
  document.querySelectorAll('.pos-view').forEach(function(v) { v.classList.remove('active'); });
  var viewEl = document.getElementById('posView' + view.charAt(0).toUpperCase() + view.slice(1));
  if (viewEl) viewEl.classList.add('active');

  if (view === 'register') renderRegisterContent();
  else if (view === 'dashboard') loadDashboard();
  else if (view === 'history') loadHistory();
  else if (view === 'all-orders') loadAllOrders();
  else if (view === 'customers') loadCustomerList();
  else if (view === 'inventory-requests') loadInventoryRequests();
  else if (view === 'statements') loadStatements();
  else if (view === 'petty-cash') loadPettyCash();
  else if (view === 'darts-queue') loadDartsQueue();
}

// ==================== REGISTER CONTENT ====================
function renderRegisterContent() {
  var frame = document.getElementById('posViewRegister');
  if (!frame) return;

  frame.innerHTML =
    '<div class="pos-products-panel">' +
      '<div class="pos-search-bar">' +
        '<input type="text" class="pos-search-input" id="posProductSearch" placeholder="Search products by name or SKU..." autofocus>' +
        '<button class="pos-btn pos-btn-clear" style="padding:10px 14px" id="posScanBtn" title="Scan Barcode"><i class="fas fa-barcode"></i></button>' +
      '</div>' +
      '<div class="pos-categories" id="posCatBar"></div>' +
      '<div class="pos-product-grid" id="posProductGrid"><div class="pos-loading"><i class="fas fa-spinner fa-spin"></i> Loading products...</div></div>' +
    '</div>' +
    '<div class="pos-cart-panel">' +
      '<div class="pos-customer-bar" id="posCustomerBar"></div>' +
      '<div id="posWarnings"></div>' +
      '<div class="pos-cart-items" id="posCartItems">' +
        '<div class="pos-cart-empty"><i class="fas fa-shopping-cart"></i><span>Cart is empty</span><span style="font-size:12px">Search or click a product to add</span></div>' +
      '</div>' +
      '<div class="pos-cart-footer" id="posCartFooter"></div>' +
    '</div>';

  // Delegated event: product search
  var searchInput = document.getElementById('posProductSearch');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      clearTimeout(_s.searchTimer);
      _s.searchTimer = setTimeout(function() {
        searchProducts(searchInput.value || '');
      }, 250);
    });
  }

  // Delegated event: product grid clicks
  var grid = document.getElementById('posProductGrid');
  if (grid) {
    grid.addEventListener('click', function(e) {
      var card = e.target.closest('[data-pid]');
      if (!card) return;
      var pid = parseInt(card.dataset.pid);
      var stockBadge = e.target.closest('.pos-product-stock');
      if (stockBadge) { openStockCheck(pid); return; }
      var p = _s.productCache[pid];
      if (p) addToCart(pid, p);
    });
    // Right-click or long-press to check stock
    grid.addEventListener('contextmenu', function(e) {
      var card = e.target.closest('[data-pid]');
      if (card) { e.preventDefault(); openStockCheck(parseInt(card.dataset.pid)); }
    });
  }

  on('posScanBtn', 'click', function() {
    posShowScanModal();
  });

  // Attach global barcode scanner listener (once)
  if (!_s.scanListenerBound) {
    _s.scanListenerBound = true;
    document.addEventListener('keydown', posHandleScanKeydown);
  }

  renderCategories();
  searchProducts('');
  renderCustomerArea();
  renderCartFooter();
}

// ==================== BARCODE SCANNER ====================
// Barcode scanners act like rapid keyboards: chars typed fast + Enter at end.
// We detect this pattern: if keystrokes arrive < 60ms apart and end with Enter,
// and the accumulated string is 4+ chars, treat it as a barcode scan.

function posHandleScanKeydown(e) {
  // Only process when on register view with active session
  if (!_s.session) return;
  if (_s.view !== 'register') return;

  // Ignore if focus is in a non-search text input, textarea, or select
  var tag = (e.target.tagName || '').toLowerCase();
  var isSearchInput = e.target.id === 'posProductSearch';
  var isTypingField = (tag === 'input' && e.target.type !== 'button' && e.target.type !== 'submit') || tag === 'textarea' || tag === 'select';

  // If user is typing in search box, don't intercept (search already handles barcode via API)
  // But DO intercept Enter if buffer looks like a fast scan
  if (isTypingField && !isSearchInput) return;

  var now = Date.now();
  var timeSinceLast = now - _s.scanLastKey;

  if (e.key === 'Enter') {
    var buf = _s.scanBuffer.trim();
    if (buf.length >= 4 && timeSinceLast < 200) {
      // Looks like a barcode scan — intercept
      e.preventDefault();
      e.stopPropagation();
      _s.scanBuffer = '';
      _s.scanLastKey = 0;
      // Clear search input if it has the barcode text
      var si = document.getElementById('posProductSearch');
      if (si && si.value === buf) si.value = '';
      posLookupBarcode(buf);
    } else {
      _s.scanBuffer = '';
      _s.scanLastKey = 0;
    }
    return;
  }

  // Only accumulate printable single characters
  if (e.key.length !== 1) { return; }

  // If more than 200ms since last key, start fresh buffer
  if (timeSinceLast > 200) {
    _s.scanBuffer = '';
  }
  _s.scanBuffer += e.key;
  _s.scanLastKey = now;

  // Auto-clear buffer after 300ms of no typing (manual typing, not scanner)
  clearTimeout(_s.scanTimer);
  _s.scanTimer = setTimeout(function() { _s.scanBuffer = ''; }, 300);
}

function posLookupBarcode(code) {
  // Show scanning indicator
  posToast('<i class="fas fa-barcode"></i> Scanning: ' + esc(code) + '...', 'info', 1500);

  API.get('/pos/barcode/' + encodeURIComponent(code) + '?location_id=' + getLocationId()).then(function(r) {
    var p = r.data;
    if (p && p.id) {
      // Cache product and add to cart
      _s.productCache[p.id] = { name: p.name, sku: p.sku, category: p.category, price: p.price, cost: p.cost, tax_rate: p.tax_rate, stock: p.qty_available };
      addToCart(p.id, _s.productCache[p.id]);
      posToast('<i class="fas fa-check-circle"></i> ' + esc(p.name) + ' added', 'success', 2000);
      // Try beep sound
      posScanBeep(true);
    }
  }).catch(function(err) {
    var msg = err.response && err.response.data ? err.response.data.error : 'Barcode not found';
    posToast('<i class="fas fa-times-circle"></i> ' + esc(msg), 'error', 3000);
    posScanBeep(false);
    // Fall back to search
    var si = document.getElementById('posProductSearch');
    if (si) { si.value = code; searchProducts(code); si.focus(); }
  });
}

function posScanBeep(success) {
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
  } catch(e) { /* audio not available */ }
}

var _posHtml5QrLoaded = false;
var _posHtml5QrLoading = false;

function posLoadBarcodeLib(callback) {
  if (_posHtml5QrLoaded || (typeof Html5Qrcode !== 'undefined')) { _posHtml5QrLoaded = true; callback(); return; }
  if (_posHtml5QrLoading) {
    var iv = setInterval(function() { if (_posHtml5QrLoaded) { clearInterval(iv); callback(); } }, 100);
    return;
  }
  _posHtml5QrLoading = true;
  var script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
  script.onload = function() { _posHtml5QrLoaded = true; _posHtml5QrLoading = false; callback(); };
  script.onerror = function() { _posHtml5QrLoading = false; posToast('Failed to load barcode scanner library', 'error'); };
  document.head.appendChild(script);
}

function posShowScanModal() {
  var overlay = document.createElement('div');
  overlay.className = 'pos-modal-overlay';
  overlay.id = 'posScanOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML =
    '<div style="background:white;border-radius:16px;padding:24px;width:92%;max-width:480px;box-shadow:0 20px 60px rgba(0,0,0,0.3)">' +
    '<h3 style="margin:0 0 16px;font-size:18px;display:flex;align-items:center;gap:8px"><i class="fas fa-barcode" style="color:#8B5CF6"></i> Scan / Enter Barcode</h3>' +
    '<div id="posCameraScanReader" style="display:none;width:100%;margin-bottom:12px;border-radius:8px;overflow:hidden"></div>' +
    '<div id="posCameraBtnRow" style="margin-bottom:12px;text-align:center">' +
    '<button onclick="posStartCameraScan()" class="pos-btn" style="padding:10px 20px;background:#8B5CF6;color:white;border:none;border-radius:8px;font-weight:600;font-size:15px"><i class="fas fa-camera"></i> Open Camera Scanner</button>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><hr style="flex:1;border:none;border-top:1px solid #E2E8F0"><span style="color:#94A3B8;font-size:12px;font-weight:600">OR TYPE MANUALLY</span><hr style="flex:1;border:none;border-top:1px solid #E2E8F0"></div>' +
    '<input type="text" id="posScanInput" placeholder="Type barcode number..." ' +
    'style="width:100%;padding:14px 16px;border:2px solid #E2E8F0;border-radius:10px;font-size:18px;text-align:center;letter-spacing:2px;box-sizing:border-box" ' +
    'inputmode="numeric">' +
    '<div style="display:flex;gap:8px;margin-top:16px">' +
    '<button onclick="posCloseScanModal()" class="pos-btn pos-btn-clear" style="flex:1;padding:10px">Cancel</button>' +
    '<button onclick="posDoManualScan()" class="pos-btn" style="flex:1;padding:10px;background:#059669;color:white;border:none;border-radius:8px;font-weight:600"><i class="fas fa-search"></i> Lookup</button>' +
    '</div></div>';

  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) posCloseScanModal(); });

  setTimeout(function() {
    var inp = document.getElementById('posScanInput');
    if (inp) {
      inp.focus();
      inp.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); posDoManualScan(); }
      });
    }
  }, 50);
}

function posStartCameraScan() {
  posLoadBarcodeLib(function() {
    var readerEl = document.getElementById('posCameraScanReader');
    var btnRow = document.getElementById('posCameraBtnRow');
    if (!readerEl) return;
    readerEl.style.display = 'block';
    if (btnRow) btnRow.innerHTML = '<button onclick="posStopCameraScan()" class="pos-btn" style="padding:8px 16px;background:#DC2626;color:white;border:none;border-radius:8px;font-weight:600;font-size:13px"><i class="fas fa-stop"></i> Stop Camera</button>';

    try {
      var html5QrCode = new Html5Qrcode('posCameraScanReader');
      window._posActiveScanner = html5QrCode;

      html5QrCode.start(
        { facingMode: 'environment' },
        {
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
        },
        function onScanSuccess(decodedText) {
          posScanBeep(true);
          posStopCameraScan();
          posCloseScanModal();
          posLookupBarcode(decodedText);
        },
        function onScanFailure() { /* ignore */ }
      ).catch(function(err) {
        posToast('Camera error: ' + (err.message || err), 'error');
        posStopCameraScan();
      });
    } catch(e) {
      posToast('Scanner error: ' + e.message, 'error');
    }
  });
}
window.posStartCameraScan = posStartCameraScan;

function posStopCameraScan() {
  if (window._posActiveScanner) {
    window._posActiveScanner.stop().then(function() {
      window._posActiveScanner.clear();
    }).catch(function() {});
    window._posActiveScanner = null;
  }
  var readerEl = document.getElementById('posCameraScanReader');
  if (readerEl) { readerEl.style.display = 'none'; readerEl.innerHTML = ''; }
  var btnRow = document.getElementById('posCameraBtnRow');
  if (btnRow) btnRow.innerHTML = '<button onclick="posStartCameraScan()" class="pos-btn" style="padding:10px 20px;background:#8B5CF6;color:white;border:none;border-radius:8px;font-weight:600;font-size:15px"><i class="fas fa-camera"></i> Open Camera Scanner</button>';
}
window.posStopCameraScan = posStopCameraScan;

function posCloseScanModal() {
  posStopCameraScan();
  var overlay = document.getElementById('posScanOverlay');
  if (overlay) overlay.remove();
}
window.posCloseScanModal = posCloseScanModal;

function posDoManualScan() {
  var inp = document.getElementById('posScanInput');
  if (!inp) return;
  var code = inp.value.trim();
  if (!code) return;
  document.getElementById('posScanOverlay')?.remove();
  posLookupBarcode(code);
}
window.posDoManualScan = posDoManualScan;

// ==================== CATEGORIES ====================
function renderCategories() {
  var el = document.getElementById('posCatBar');
  if (!el) return;
  var html = '<button class="pos-cat-pill ' + (!_s.currentCat ? 'active' : '') + '" data-cat="">All</button>';
  _s.categories.forEach(function(c) {
    if (!c.category) return;
    html += '<button class="pos-cat-pill ' + (_s.currentCat === c.category ? 'active' : '') + '" data-cat="' + escAttr(c.category) + '">' + esc(c.category) + ' <small style="opacity:0.6">(' + c.count + ')</small></button>';
  });
  el.innerHTML = html;

  // Only attach the delegated handler once (guard with flag on element)
  if (!el._catHandlerBound) {
    el._catHandlerBound = true;
    el.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-cat]');
      if (!btn) return;
      _s.currentCat = btn.dataset.cat;
      renderCategories();
      searchProducts(document.getElementById('posProductSearch')?.value || '');
    });
  }
}

// ==================== PRODUCT SEARCH ====================
function searchProducts(term) {
  var q = 'search=' + encodeURIComponent(term) + '&location_id=' + getLocationId() + '&limit=80';
  if (_s.currentCat) q += '&category=' + encodeURIComponent(_s.currentCat);

  API.get('/pos/products?' + q).then(function(r) {
    renderProductGrid(r.data || []);
  }).catch(function() {
    var g = document.getElementById('posProductGrid');
    if (g) g.innerHTML = '<div class="pos-loading" style="color:var(--pos-red)"><i class="fas fa-exclamation-triangle"></i> Failed to load products</div>';
  });
}

function renderProductGrid(products) {
  var g = document.getElementById('posProductGrid');
  if (!g) return;

  if (products.length === 0) {
    g.innerHTML = '<div class="pos-loading" style="grid-column:1/-1"><i class="fas fa-search"></i> No products found</div>';
    return;
  }

  var html = '';
  products.forEach(function(p) {
    // Cache product data for click handler (avoids inline JSON)
    _s.productCache[p.id] = { name: p.name, sku: p.sku, category: p.category, price: p.price, cost: p.cost, tax_rate: p.tax_rate, stock: p.qty_available };

    var stockClass = 'ok';
    var stockLabel = p.qty_available;
    if (p.qty_available <= 0) { stockClass = 'out'; stockLabel = 'OUT'; }
    else if (p.qty_available <= 10) { stockClass = 'low'; }

    var cardClass = 'pos-product-card';
    if (p.qty_available <= 0) cardClass += ' no-stock';
    else if (p.qty_available <= 10) cardClass += ' low-stock';

    html += '<div class="' + cardClass + '" data-pid="' + p.id + '">' +
      '<span class="pos-product-stock ' + stockClass + '">' + stockLabel + '</span>' +
      '<div class="pos-product-name">' + esc(p.name) + '</div>' +
      '<div class="pos-product-sku">' + esc(p.sku || '') + (p.category ? ' &middot; ' + esc(p.category) : '') + '</div>' +
      '<div class="pos-product-price">$' + (p.price || 0).toFixed(2) + '</div>' +
    '</div>';
  });
  g.innerHTML = html;
}

// ==================== ADD TO CART ====================
function addToCart(productId, info) {
  var existing = _s.cart.find(function(c) { return c.product_id === productId; });
  if (existing) {
    existing.qty += 1;
    checkStockWarning(existing);
  } else {
    var item = {
      product_id: productId,
      name: info.name,
      sku: info.sku,
      category: info.category,
      qty: 1,
      unit_price: info.price || 0,
      effective_price: info.price || 0,
      price_source: 'list',
      tax_rate: info.tax_rate || 0,
      cost: info.cost || 0,
      discount_pct: 0,
      stock: info.stock || 0
    };
    _s.cart.push(item);
    checkStockWarning(item);
  }

  if (_s.customer) priceCheckItem(productId);
  renderCart();
  renderCartFooter();
}

function checkStockWarning(item) {
  _s.warnings = _s.warnings.filter(function(w) { return w.product_id !== item.product_id; });
  if (item.qty > item.stock) {
    if (item.stock <= 0) {
      // Zero local stock — smart check other locations
      _s.warnings.push({
        product_id: item.product_id, type: 'error',
        message: '<strong>' + esc(item.name) + '</strong>: <span style="color:var(--pos-red)">Out of stock here.</span> <i class="fas fa-spinner fa-spin" style="font-size:11px"></i> Checking other locations...'
      });
      renderWarnings();
      API.get('/pos/stock-check?product_ids=' + item.product_id + '&location_id=' + getLocationId()).then(function(r) {
        var stockData = (r.data.stock || [])[0];
        _s.warnings = _s.warnings.filter(function(w) { return w.product_id !== item.product_id; });
        if (stockData && stockData.other_locations && stockData.other_locations.length > 0) {
          // Found stock elsewhere
          var otherLoc = stockData.other_locations[0];
          var msg = '<strong>' + esc(item.name) + '</strong>: Out of stock here, but <strong>' + otherLoc.available + '</strong> available at <strong>' + esc(otherLoc.location_name) + '</strong>.' +
            ' <button class="pos-stock-action-btn transfer" data-xfer-pid="' + item.product_id + '" data-xfer-name="' + escAttr(item.name) + '" data-xfer-from="' + otherLoc.location_id + '" data-xfer-fromname="' + escAttr(otherLoc.location_name) + '" data-xfer-avail="' + otherLoc.available + '"><i class="fas fa-arrows-left-right"></i> Request Transfer</button>';
          _s.warnings.push({ product_id: item.product_id, type: 'error', message: msg });
        } else {
          // No stock anywhere
          var msg2 = '<strong>' + esc(item.name) + '</strong>: <span style="color:var(--pos-red)">Out of stock everywhere.</span>' +
            ' <button class="pos-stock-action-btn purchase" data-purch-pid="' + item.product_id + '" data-purch-name="' + escAttr(item.name) + '"><i class="fas fa-cart-plus"></i> Request Purchase for Customer</button>';
          _s.warnings.push({ product_id: item.product_id, type: 'error', message: msg2 });
        }
        renderWarnings();
      }).catch(function() {
        // Fallback to old behavior
        _s.warnings = _s.warnings.filter(function(w) { return w.product_id !== item.product_id; });
        var other = getOtherLocation();
        var msg3 = esc(item.name) + ': Out of stock.';
        if (other) msg3 += ' <a href="#" class="pos-stock-check-link" data-stock-pid="' + item.product_id + '">Check ' + esc(other.name) + '</a>';
        _s.warnings.push({ product_id: item.product_id, type: 'error', message: msg3 });
        renderWarnings();
      });
      return; // async — renderWarnings called in callback
    } else {
      // Some stock but not enough
      var other = getOtherLocation();
      var msg = esc(item.name) + ': Only ' + item.stock + ' in stock (need ' + item.qty + ')';
      if (other) msg += ' <a href="#" class="pos-stock-check-link" data-stock-pid="' + item.product_id + '">Check ' + esc(other.name) + '</a>';
      _s.warnings.push({ product_id: item.product_id, type: 'warning', message: msg });
    }
  }
  renderWarnings();
}

function priceCheckItem(productId) {
  var item = _s.cart.find(function(c) { return c.product_id === productId; });
  if (!item || !_s.customer) return;
  API.get('/pos/price-check?product_id=' + productId + '&customer_id=' + _s.customer.id + '&qty=' + item.qty).then(function(r) {
    var d = r.data;
    item.effective_price = d.effective_price;
    item.price_source = d.price_source;
    item.discount_pct = d.discount_pct;
    renderCart();
    renderCartFooter();
  }).catch(function() {});
}

function priceCheckAll() {
  _s.cart.forEach(function(item) { priceCheckItem(item.product_id); });
}

// ==================== CART RENDERING ====================
function renderCart() {
  var el = document.getElementById('posCartItems');
  if (!el) return;

  if (_s.cart.length === 0) {
    el.innerHTML = '<div class="pos-cart-empty"><i class="fas fa-shopping-cart"></i><span>Cart is empty</span><span style="font-size:12px">Search or click a product to add</span></div>';
    return;
  }

  var html = '';
  _s.cart.forEach(function(item, idx) {
    var lineTotal = item.effective_price * item.qty;
    var meta = '$' + item.effective_price.toFixed(2) + ' ea';
    if (item.price_source !== 'list') {
      meta += ' <span class="special-price">' + item.price_source.replace(/_/g, ' ') + (item.discount_pct ? ' (-' + item.discount_pct + '%)' : '') + '</span>';
    }

    html += '<div class="pos-cart-item" data-idx="' + idx + '">' +
      '<div class="pos-cart-item-info">' +
        '<div class="pos-cart-item-name">' + esc(item.name) + '</div>' +
        '<div class="pos-cart-item-meta">' + meta + '</div>' +
      '</div>' +
      '<div class="pos-cart-qty">' +
        '<button data-action="qty-minus">-</button>' +
        '<input type="number" value="' + item.qty + '" min="1" data-action="qty-input">' +
        '<button data-action="qty-plus">+</button>' +
      '</div>' +
      '<div class="pos-cart-item-total">$' + lineTotal.toFixed(2) + '</div>' +
      '<button class="pos-cart-item-disc" data-action="line-disc" title="Discount"><i class="fas fa-percent"></i></button>' +
      '<button class="pos-cart-item-remove" data-action="remove" title="Remove"><i class="fas fa-trash"></i></button>' +
    '</div>';
  });
  el.innerHTML = html;

  // Delegated cart events — only attach once (guard with flag on element)
  if (!el._cartHandlersBound) {
    el._cartHandlersBound = true;
    el.addEventListener('click', function(e) {
      var row = e.target.closest('[data-idx]');
      if (!row) return;
      var idx = parseInt(row.dataset.idx);
      var action = e.target.closest('[data-action]');
      if (!action) return;
      var act = action.dataset.action;
      var item = _s.cart[idx];
      if (!item) return;

      if (act === 'qty-minus') { item.qty = Math.max(1, item.qty - 1); checkStockWarning(item); if (_s.customer) priceCheckItem(item.product_id); renderCart(); renderCartFooter(); }
      else if (act === 'qty-plus') { item.qty += 1; checkStockWarning(item); if (_s.customer) priceCheckItem(item.product_id); renderCart(); renderCartFooter(); }
      else if (act === 'line-disc') { openLineDiscount(idx); }
      else if (act === 'remove') { _s.warnings = _s.warnings.filter(function(w) { return w.product_id !== item.product_id; }); _s.cart.splice(idx, 1); renderWarnings(); renderCart(); renderCartFooter(); }
    });

    el.addEventListener('change', function(e) {
      var input = e.target.closest('[data-action="qty-input"]');
      if (!input) return;
      var row = input.closest('[data-idx]');
      if (!row) return;
      var idx = parseInt(row.dataset.idx);
      var item = _s.cart[idx];
      if (!item) return;
      item.qty = Math.max(1, parseInt(input.value) || 1);
      checkStockWarning(item);
      if (_s.customer) priceCheckItem(item.product_id);
      renderCart();
      renderCartFooter();
    });
  }
}

// ==================== CART FOOTER ====================
function renderCartFooter() {
  var el = document.getElementById('posCartFooter');
  if (!el) return;

  var totals = calcTotals();
  var hasItems = _s.cart.length > 0;
  var locType = getLocationType();
  var other = getOtherLocation();

  var html = '<div class="pos-cart-totals">' +
    '<div class="pos-cart-total-row"><span>Subtotal (' + _s.cart.length + ' items)</span><span>$' + totals.subtotal.toFixed(2) + '</span></div>';
  if (totals.discount > 0) {
    html += '<div class="pos-cart-total-row discount"><span>Discounts</span><span>-$' + totals.discount.toFixed(2) + '</span></div>';
  }
  if (totals.promoDiscount > 0) {
    html += '<div class="pos-cart-total-row discount"><span>Promo <span class="pos-badge pos-badge-green">' + esc(_s.appliedPromo ? _s.appliedPromo.code : '') + '</span></span><span>-$' + totals.promoDiscount.toFixed(2) + '</span></div>';
  }
  if (_s.customer && _s.customer.tax_exempt) {
    html += '<div class="pos-cart-total-row"><span>Tax <span class="pos-badge pos-badge-green">EXEMPT</span></span><span>$0.00</span></div>';
  } else {
    html += '<div class="pos-cart-total-row"><span>Tax</span><span>$' + totals.tax.toFixed(2) + '</span></div>';
  }
  if (totals.fuelSurcharge > 0) {
    html += '<div class="pos-cart-total-row"><span><i class="fas fa-gas-pump" style="color:var(--pos-orange)"></i> Fuel Surcharge</span><span>$' + totals.fuelSurcharge.toFixed(2) + '</span></div>';
  }
  html += '<div class="pos-cart-total-row grand"><span>Total</span><span>$' + totals.total.toFixed(2) + '</span></div></div>';

  // === CROSS-LOCATION OPTIONS ===
  if (_s.customer && other) {
    if (locType === 'retail') {
      // Retail store: can order from DC for pickup or delivery
      html += '<div class="pos-cross-loc" style="margin-bottom:10px">' +
        '<div class="pos-cross-loc-header"><i class="fas fa-warehouse" style="color:var(--pos-orange)"></i> Fulfillment Options</div>' +
        '<label class="pos-cross-loc-opt"><input type="radio" name="posFulfill" value="local" ' + (!_s.deliveryReq ? 'checked' : '') + ' data-fulfill="local"> <span><strong>In-Store</strong> — Customer picks up here</span></label>' +
        '<label class="pos-cross-loc-opt"><input type="radio" name="posFulfill" value="dc_pickup" ' + (_s.deliveryReq === 'dc_pickup' ? 'checked' : '') + ' data-fulfill="dc_pickup"> <span><strong>DC Pickup</strong> — Customer picks up at ' + esc(other.name) + '</span></label>' +
        '<label class="pos-cross-loc-opt"><input type="radio" name="posFulfill" value="delivery" ' + (_s.deliveryReq === 'delivery' ? 'checked' : '') + ' data-fulfill="delivery"> <span><strong>Deliver</strong> — Ship from ' + esc(other.name) + '</span></label>' +
      '</div>';
    } else {
      // Distribution center: delivery or reserve from retail
      html += '<div class="pos-cross-loc" style="margin-bottom:10px">' +
        '<div class="pos-cross-loc-header"><i class="fas fa-truck" style="color:var(--pos-navy-light)"></i> Fulfillment Options</div>' +
        '<label class="pos-cross-loc-opt"><input type="radio" name="posFulfill" value="local" ' + (!_s.deliveryReq ? 'checked' : '') + ' data-fulfill="local"> <span><strong>Pickup Here</strong> — Customer/driver picks up</span></label>' +
        '<label class="pos-cross-loc-opt"><input type="radio" name="posFulfill" value="delivery" ' + (_s.deliveryReq === 'delivery' ? 'checked' : '') + ' data-fulfill="delivery"> <span><strong>Deliver</strong> — Create delivery order</span></label>' +
        '<label class="pos-cross-loc-opt"><input type="radio" name="posFulfill" value="reserve_retail" ' + (_s.deliveryReq === 'reserve_retail' ? 'checked' : '') + ' data-fulfill="reserve_retail"> <span><strong>Reserve from ' + esc(other.name) + '</strong> — Transfer stock if out here</span></label>' +
      '</div>';
    }
  } else if (!_s.customer) {
    // Walk-in — simple delivery toggle not available without customer
  }

  // Delivery date + address when relevant
  if (_s.deliveryReq === 'delivery' || _s.deliveryReq === 'dc_pickup') {
    html += '<div class="pos-delivery-opts" id="posDeliveryOpts">';
    if (_s.deliveryReq === 'delivery') {
      html += '<div><label><i class="fas fa-calendar"></i> Delivery Date</label><input type="date" id="posDeliveryDate" value="' + _s.deliveryDate + '"></div>';
      if (_s.customerAddresses.length > 0) {
        var addrOpts = '<option value="">Select address...</option>';
        _s.customerAddresses.forEach(function(a) {
          var full = (a.label ? a.label + ': ' : '') + (a.street || '') + ', ' + (a.city || '') + (a.state ? ', ' + a.state : '') + (a.zip ? ' ' + a.zip : '') + (a.is_primary ? ' ★' : '');
          addrOpts += '<option value="' + a.id + '" ' + (a.is_primary ? 'selected' : '') + '>' + esc(full) + '</option>';
        });
        addrOpts += '<option value="__new__">➕ Add New Address...</option>';
        html += '<div><label><i class="fas fa-map-marker-alt"></i> Address</label><select id="posDeliveryAddr">' + addrOpts + '</select></div>';
        html += '<div id="posNewAddrForm" style="display:none;background:var(--pos-gray-50);border:1px solid var(--pos-gray-200);border-radius:8px;padding:10px;margin-top:6px">' +
          '<div style="font-weight:600;font-size:12px;margin-bottom:6px"><i class="fas fa-plus"></i> New Address</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' +
          '<input type="text" id="posNewAddrLabel" placeholder="Label (e.g. Farm, Home)" style="padding:6px;border:1px solid var(--pos-gray-200);border-radius:6px;font-size:13px">' +
          '<input type="text" id="posNewAddrStreet" placeholder="Street *" style="padding:6px;border:1px solid var(--pos-gray-200);border-radius:6px;font-size:13px">' +
          '<input type="text" id="posNewAddrCity" placeholder="City *" style="padding:6px;border:1px solid var(--pos-gray-200);border-radius:6px;font-size:13px">' +
          '<div style="display:flex;gap:4px">' +
          '<input type="text" id="posNewAddrState" placeholder="State" maxlength="2" style="width:50px;padding:6px;border:1px solid var(--pos-gray-200);border-radius:6px;font-size:13px">' +
          '<input type="text" id="posNewAddrZip" placeholder="ZIP" style="flex:1;padding:6px;border:1px solid var(--pos-gray-200);border-radius:6px;font-size:13px">' +
          '</div></div>' +
          '<div style="margin-top:6px;display:flex;gap:6px">' +
          '<button class="pos-btn pos-btn-sm" id="posNewAddrSave" style="background:var(--pos-green);color:white"><i class="fas fa-save"></i> Save</button>' +
          '<button class="pos-btn pos-btn-sm" id="posNewAddrCancel" style="background:var(--pos-gray-200);color:var(--pos-gray-700)">Cancel</button>' +
          '</div></div>';
      } else {
        html += '<div style="font-size:12px;color:var(--pos-gray-400);padding:8px 0"><i class="fas fa-map-marker-alt"></i> No addresses on file — <a href="javascript:void(0)" id="posAddFirstAddr" style="color:var(--pos-navy)">Add one</a></div>';
        html += '<div id="posNewAddrForm" style="display:none;background:var(--pos-gray-50);border:1px solid var(--pos-gray-200);border-radius:8px;padding:10px;margin-top:6px">' +
          '<div style="font-weight:600;font-size:12px;margin-bottom:6px"><i class="fas fa-plus"></i> New Address</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' +
          '<input type="text" id="posNewAddrLabel" placeholder="Label (e.g. Farm)" style="padding:6px;border:1px solid var(--pos-gray-200);border-radius:6px;font-size:13px">' +
          '<input type="text" id="posNewAddrStreet" placeholder="Street *" style="padding:6px;border:1px solid var(--pos-gray-200);border-radius:6px;font-size:13px">' +
          '<input type="text" id="posNewAddrCity" placeholder="City *" style="padding:6px;border:1px solid var(--pos-gray-200);border-radius:6px;font-size:13px">' +
          '<div style="display:flex;gap:4px">' +
          '<input type="text" id="posNewAddrState" placeholder="State" maxlength="2" style="width:50px;padding:6px;border:1px solid var(--pos-gray-200);border-radius:6px;font-size:13px">' +
          '<input type="text" id="posNewAddrZip" placeholder="ZIP" style="flex:1;padding:6px;border:1px solid var(--pos-gray-200);border-radius:6px;font-size:13px">' +
          '</div></div>' +
          '<div style="margin-top:6px;display:flex;gap:6px">' +
          '<button class="pos-btn pos-btn-sm" id="posNewAddrSave" style="background:var(--pos-green);color:white"><i class="fas fa-save"></i> Save</button>' +
          '<button class="pos-btn pos-btn-sm" id="posNewAddrCancel" style="background:var(--pos-gray-200);color:var(--pos-gray-700)">Cancel</button>' +
          '</div></div>';
      }
    }
    if (_s.deliveryReq === 'dc_pickup') {
      html += '<div><label><i class="fas fa-calendar"></i> Pickup Date</label><input type="date" id="posDeliveryDate" value="' + _s.deliveryDate + '"></div>';
    }
    html += '</div>';
  }

  // === PROMO CODE + CART DISCOUNT ===
  if (hasItems) {
    if (_s.appliedPromo) {
      html += '<div class="pos-promo-applied"><i class="fas fa-tag"></i> <strong>' + esc(_s.appliedPromo.description || _s.appliedPromo.code) + '</strong> — saves $' + (_s.appliedPromo.discount || 0).toFixed(2) + '<button class="pos-promo-remove" id="posRemovePromo"><i class="fas fa-times"></i></button></div>';
    } else {
      html += '<div class="pos-promo-input-row"><input type="text" id="posPromoInput" class="pos-promo-input" placeholder="Promo code..." value="' + esc(_s.promoCode) + '"><button class="pos-btn pos-btn-sm" id="posApplyPromo"><i class="fas fa-tag"></i> Apply</button></div>';
    }
    html += '<div class="pos-cart-disc-row"><button class="pos-btn pos-btn-sm" id="posDiscountBtn" style="width:100%;background:var(--pos-gray-100);color:var(--pos-gray-700)"><i class="fas fa-tags"></i> Cart Discount</button></div>';
  }

  html += '<div class="pos-cart-actions">' +
    '<button class="pos-btn pos-btn-clear" id="posClearBtn" ' + (!hasItems ? 'disabled' : '') + '><i class="fas fa-trash"></i></button>' +
    '<button class="pos-btn pos-btn-hold" id="posHoldBtn" ' + (!hasItems ? 'disabled' : '') + '><i class="fas fa-pause"></i> Hold</button>' +
    '<button class="pos-btn pos-btn-pay" id="posPayBtn" ' + (!hasItems ? 'disabled' : '') + '><i class="fas fa-dollar-sign"></i> Pay $' + totals.total.toFixed(2) + '</button>' +
  '</div>';

  el.innerHTML = html;

  // Bind footer events
  on('posClearBtn', 'click', function() {
    if (_s.cart.length > 0 && !confirm('Clear all items from cart?')) return;
    _s.cart = [];
    _s.warnings = _s.warnings.filter(function(w) { return !w.product_id; });
    renderCart(); renderCartFooter(); renderWarnings();
  });
  on('posHoldBtn', 'click', holdSale);
  on('posPayBtn', 'click', openPayment);

  // Fulfillment radio handlers
  document.querySelectorAll('[data-fulfill]').forEach(function(radio) {
    radio.addEventListener('change', function() {
      var val = this.value;
      if (val === 'local') { _s.deliveryReq = false; }
      else { _s.deliveryReq = val; }
      if ((val === 'delivery' || val === 'dc_pickup') && !_s.deliveryDate) {
        var tomorrow = new Date(Date.now() + 86400000);
        _s.deliveryDate = tomorrow.toISOString().slice(0, 10);
      }
      renderCartFooter();
    });
  });

  // Delivery date/addr change
  on('posDeliveryDate', 'change', function() { _s.deliveryDate = this.value; });
  on('posDeliveryAddr', 'change', function() {
    if (this.value === '__new__') {
      var form = document.getElementById('posNewAddrForm');
      if (form) form.style.display = 'block';
      this.value = '';
    } else {
      _s.deliveryAddrId = this.value;
    }
  });
  on('posAddFirstAddr', 'click', function() {
    var form = document.getElementById('posNewAddrForm');
    if (form) form.style.display = 'block';
  });
  on('posNewAddrCancel', 'click', function() {
    var form = document.getElementById('posNewAddrForm');
    if (form) form.style.display = 'none';
    var sel = document.getElementById('posDeliveryAddr');
    if (sel) sel.value = '';
  });
  on('posNewAddrSave', 'click', function() {
    var street = gv('posNewAddrStreet');
    var city = gv('posNewAddrCity');
    if (!street || !city) { toast('Street and city are required', 'error'); return; }
    if (!_s.customer) { toast('No customer selected', 'error'); return; }
    var btn = document.getElementById('posNewAddrSave');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    API.post('/pos/customers/' + _s.customer.id + '/addresses', {
      label: gv('posNewAddrLabel') || null,
      street: street,
      city: city,
      state: gv('posNewAddrState') || null,
      zip: gv('posNewAddrZip') || null
    }).then(function(r) {
      var newAddr = r.data;
      _s.customerAddresses.push(newAddr);
      _s.deliveryAddrId = newAddr.id;
      toast('Address saved');
      renderCartFooter();
    }).catch(function(err) {
      toast('Failed to save address: ' + errMsg(err), 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save'; }
    });
  });

  // Promo + discount buttons
  on('posApplyPromo', 'click', applyPromoCode);
  on('posRemovePromo', 'click', removePromo);
  on('posDiscountBtn', 'click', openCartDiscountModal);
  var promoInput = document.getElementById('posPromoInput');
  if (promoInput) promoInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') applyPromoCode(); });
}

// ==================== WARNINGS ====================
function renderWarnings() {
  var el = document.getElementById('posWarnings');
  if (!el) return;
  if (_s.warnings.length === 0) { el.innerHTML = ''; return; }
  var html = '';
  _s.warnings.forEach(function(w) {
    html += '<div class="pos-warning-bar ' + (w.type === 'error' ? 'error' : '') + '"><i class="fas fa-exclamation-triangle"></i><span class="pos-warning-text">' + w.message + '</span></div>';
  });
  el.innerHTML = html;

  // Wire stock check links
  el.querySelectorAll('.pos-stock-check-link').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      openStockCheck(parseInt(link.dataset.stockPid));
    });
  });

  // Wire "Request Transfer" buttons
  el.querySelectorAll('[data-xfer-pid]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      var pid = parseInt(btn.dataset.xferPid);
      var pName = btn.dataset.xferName;
      var fromId = parseInt(btn.dataset.xferFrom);
      var fromName = btn.dataset.xferFromname;
      var avail = parseInt(btn.dataset.xferAvail);
      var cartItem = _s.cart.find(function(c) { return c.product_id === pid; });
      var qtyNeeded = cartItem ? cartItem.qty : 1;
      var qtyToTransfer = Math.min(qtyNeeded, avail);
      posConfirmTransfer(pid, pName, fromId, fromName, qtyToTransfer, avail);
    });
  });

  // Wire "Request Purchase for Customer" buttons
  el.querySelectorAll('[data-purch-pid]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      var pid = parseInt(btn.dataset.purchPid);
      var pName = btn.dataset.purchName;
      posConfirmPurchaseRequest(pid, pName);
    });
  });
}

// ==================== SMART TRANSFER / PURCHASE REQUESTS ====================

function posConfirmTransfer(productId, productName, fromLocId, fromLocName, qty, maxAvail) {
  var cartItem = _s.cart.find(function(c) { return c.product_id === productId; });
  var body = '<div style="margin-bottom:16px">' +
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
      '<div style="width:40px;height:40px;background:#EFF6FF;border-radius:10px;display:flex;align-items:center;justify-content:center"><i class="fas fa-arrows-left-right" style="color:#3B82F6"></i></div>' +
      '<div><strong style="font-size:15px">' + esc(productName) + '</strong><br><span style="color:#64748B;font-size:12px">Not in stock at your location</span></div>' +
    '</div>' +
    '<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:12px;margin-bottom:12px">' +
      '<i class="fas fa-warehouse" style="color:#16A34A"></i> <strong>' + esc(fromLocName) + '</strong> has <strong>' + maxAvail + '</strong> available' +
    '</div>' +
    '<div class="pos-cust-form-group">' +
      '<label>Quantity to transfer</label>' +
      '<input type="number" id="posXferQty" value="' + qty + '" min="1" max="' + maxAvail + '" style="width:100px;padding:8px;border:1px solid #D1D5DB;border-radius:6px">' +
    '</div>' +
  '</div>';

  showModal('<i class="fas fa-arrows-left-right"></i> Request Transfer from ' + esc(fromLocName), body,
    '<button class="pos-btn" onclick="closeModal()" style="margin-right:8px">Cancel</button>' +
    '<button class="pos-btn pos-btn-pay" onclick="posDoTransferRequest(' + productId + ',' + fromLocId + ')"><i class="fas fa-paper-plane"></i> Request Transfer</button>');
}

function posDoTransferRequest(productId, fromLocId) {
  var qty = parseInt(document.getElementById('posXferQty').value);
  if (!qty || qty < 1) { toast('Enter a valid quantity', 'error'); return; }

  var cartItem = _s.cart.find(function(c) { return c.product_id === productId; });
  var custName = _s.customer ? (_s.customer.business_name || _s.customer.contact_name || '') : '';
  var custId = _s.customer ? _s.customer.id : null;

  API.post('/pos/request-transfer', {
    to_location_id: getLocationId(),
    from_location_id: fromLocId,
    items: [{ product_id: productId, qty: qty }],
    customer_id: custId,
    customer_name: custName,
    notes: 'POS transfer request' + (cartItem ? ' for ' + cartItem.name : '')
  }).then(function(r) {
    closeModal();
    toast('Transfer ' + r.data.transfer_number + ' requested! It will appear in the Inventory module for shipping.', 'success');
    // Update warning to show transfer is in progress
    _s.warnings = _s.warnings.filter(function(w) { return w.product_id !== productId; });
    _s.warnings.push({
      product_id: productId, type: 'info',
      message: '<strong>' + esc(cartItem ? cartItem.name : 'Product') + '</strong>: Transfer <strong>' + r.data.transfer_number + '</strong> requested. Waiting to be shipped.'
    });
    renderWarnings();
  }).catch(function(err) { toast('Transfer request failed: ' + errMsg(err), 'error'); });
}

function posConfirmPurchaseRequest(productId, productName) {
  var custName = _s.customer ? (_s.customer.business_name || _s.customer.contact_name || '') : '';
  var hasCust = !!_s.customer;

  var body = '<div style="margin-bottom:16px">' +
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
      '<div style="width:40px;height:40px;background:#FEF2F2;border-radius:10px;display:flex;align-items:center;justify-content:center"><i class="fas fa-box-open" style="color:#DC2626"></i></div>' +
      '<div><strong style="font-size:15px">' + esc(productName) + '</strong><br><span style="color:#DC2626;font-size:12px;font-weight:600">Out of stock at all locations</span></div>' +
    '</div>' +
    '<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px;margin-bottom:12px">' +
      '<i class="fas fa-info-circle" style="color:#DC2626"></i> This will create a <strong>purchase request</strong> for the purchasing team and a <strong>task</strong> to remind you when the product arrives.' +
    '</div>' +
    (hasCust ? '<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:10px;margin-bottom:12px"><i class="fas fa-user" style="color:#16A34A"></i> Customer: <strong>' + esc(custName) + '</strong> — will be notified when product arrives.</div>' :
      '<div style="background:#FEF9C3;border:1px solid #FDE68A;border-radius:8px;padding:10px;margin-bottom:12px"><i class="fas fa-exclamation-triangle" style="color:#D97706"></i> No customer selected. <strong>Select a customer first</strong> to tag this purchase request and get notified on arrival.</div>') +
    '<div class="pos-cust-form-group">' +
      '<label>Quantity needed</label>' +
      '<input type="number" id="posPurchQty" value="1" min="1" style="width:100px;padding:8px;border:1px solid #D1D5DB;border-radius:6px">' +
    '</div>' +
    '<div class="pos-cust-form-group">' +
      '<label>Urgency</label>' +
      '<select id="posPurchUrgency" style="padding:8px;border:1px solid #D1D5DB;border-radius:6px">' +
        '<option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option>' +
      '</select>' +
    '</div>' +
    '<div class="pos-cust-form-group">' +
      '<label>Notes (optional)</label>' +
      '<input type="text" id="posPurchNotes" placeholder="e.g. Customer needs by Friday" style="width:100%;padding:8px;border:1px solid #D1D5DB;border-radius:6px">' +
    '</div>' +
  '</div>';

  _s._pendingPurchName = productName;
  showModal('<i class="fas fa-cart-plus"></i> Request Purchase — ' + esc(productName), body,
    '<button class="pos-btn" onclick="closeModal()" style="margin-right:8px">Cancel</button>' +
    '<button class="pos-btn pos-btn-pay" onclick="posDoPurchaseRequest(' + productId + ')"><i class="fas fa-paper-plane"></i> Submit Purchase Request</button>');
}

function posDoPurchaseRequest(productId) {
  var productName = _s._pendingPurchName || 'Product #' + productId;
  var qty = parseInt(document.getElementById('posPurchQty').value);
  if (!qty || qty < 1) { toast('Enter a valid quantity', 'error'); return; }
  var urgency = document.getElementById('posPurchUrgency').value;
  var notes = document.getElementById('posPurchNotes').value;

  var custName = _s.customer ? (_s.customer.business_name || _s.customer.contact_name || '') : '';
  var custId = _s.customer ? _s.customer.id : null;

  API.post('/pos/request-purchase', {
    location_id: getLocationId(),
    items: [{ product_id: productId, product_name: productName, qty: qty }],
    customer_id: custId,
    customer_name: custName,
    urgency: urgency,
    notes: notes
  }).then(function(r) {
    closeModal();
    toast('Purchase request ' + r.data.purchasing_request_number + ' created!' + (custId ? ' Task created to notify ' + custName + ' when it arrives.' : ''), 'success');
    // Update warning
    _s.warnings = _s.warnings.filter(function(w) { return w.product_id !== productId; });
    _s.warnings.push({
      product_id: productId, type: 'info',
      message: '<strong>' + esc(productName) + '</strong>: Purchase request <strong>' + r.data.purchasing_request_number + '</strong> submitted.' +
        (custName ? ' <i class="fas fa-bell"></i> ' + esc(custName) + ' will be notified on arrival.' : '')
    });
    renderWarnings();
  }).catch(function(err) { toast('Purchase request failed: ' + errMsg(err), 'error'); });
}

// ==================== CUSTOMER SELECTOR ====================
function renderCustomerArea() {
  var el = document.getElementById('posCustomerBar');
  if (!el) return;

  if (_s.customer) {
    var acctHtml = '';
    if (_s.customerAcct) {
      var bal = _s.customerAcct.balance || 0;
      var limit = _s.customerAcct.credit_limit || 0;
      var balClass = bal > limit && limit > 0 ? 'pos-badge-red' : 'pos-badge-blue';
      acctHtml = ' &middot; Bal: <span class="pos-badge ' + balClass + '">$' + bal.toFixed(2) + '</span>';
      if (limit > 0) acctHtml += ' / $' + limit.toFixed(2);
    }
    var details = (_s.customer.phone || '') + (_s.customer.customer_type ? ' &middot; ' + esc(_s.customer.customer_type) : '');
    if (_s.customer.tax_exempt) details += ' &middot; <span class="pos-badge pos-badge-green">TAX EXEMPT</span>';
    if (_s.customer.sponsor_discount) details += ' &middot; <span class="pos-badge pos-badge-purple">' + _s.customer.sponsor_discount + '% Sponsor</span>';
    if (_s.customer.priority_rank) details += ' &middot; <span class="pos-badge pos-badge-orange">P' + _s.customer.priority_rank + '</span>';

    el.innerHTML =
      '<div class="pos-customer-selected">' +
        '<div id="posCustAvatarLink" class="pos-cust-avatar-link" title="View / Edit Customer">' +
          '<div style="width:36px;height:36px;background:var(--pos-navy);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">' +
            initials(_s.customer.business_name || _s.customer.contact_name || '?') +
          '</div>' +
        '</div>' +
        '<div class="pos-customer-info">' +
          '<div class="pos-customer-name"><a href="#" id="posCustNameLink" class="pos-cust-name-link">' + esc(_s.customer.business_name || _s.customer.contact_name) + '</a>' +
            ' <a href="#" id="posCustPanelLink" style="font-size:11px;color:var(--pos-navy-light)" title="Quick view"><i class="fas fa-info-circle"></i></a>' +
            ' <button id="posCustReorderBtn" class="pos-reorder-btn" title="Reorder from history"><i class="fas fa-clock-rotate-left"></i> Reorder</button></div>' +
          '<div class="pos-customer-detail">' + details + acctHtml + '</div>' +
        '</div>' +
        '<button class="pos-customer-remove" id="posCustRemoveBtn" title="Remove customer"><i class="fas fa-times"></i></button>' +
      '</div>';

    on('posCustNameLink', 'click', function(e) { e.preventDefault(); openCustomerSheet(_s.customer.id); });
    on('posCustAvatarLink', 'click', function(e) { e.preventDefault(); openCustomerSheet(_s.customer.id); });
    on('posCustPanelLink', 'click', function(e) { e.preventDefault(); showCustomerPanel(_s.customer.id); });
    on('posCustReorderBtn', 'click', function() { showReorderHistory(_s.customer.id); });
    on('posCustRemoveBtn', 'click', removeCustomer);
  } else {
    el.innerHTML =
      '<div style="position:relative">' +
        '<input type="text" class="pos-customer-search" id="posCustomerSearch" placeholder="Search customer (name, phone, email)...">' +
        '<div id="posCustomerDropdown" class="pos-customer-dropdown" style="display:none"></div>' +
      '</div>';

    var searchEl = document.getElementById('posCustomerSearch');
    if (searchEl) {
      var timer = null;
      searchEl.addEventListener('input', function() {
        clearTimeout(timer);
        var term = this.value;
        if (term.length < 1) { document.getElementById('posCustomerDropdown').style.display = 'none'; return; }
        timer = setTimeout(function() { searchCustomers(term); }, 200);
      });
      searchEl.addEventListener('focus', function() {
        if (this.value.length >= 1) searchCustomers(this.value);
      });
    }
  }
}

function searchCustomers(term) {
  API.get('/pos/customers?search=' + encodeURIComponent(term)).then(function(r) {
    var dd = document.getElementById('posCustomerDropdown');
    if (!dd) return;
    var custs = r.data || [];
    if (custs.length === 0) {
      dd.innerHTML = '<div style="padding:12px;color:var(--pos-gray-400);font-size:13px;text-align:center">No customers found</div>';
    } else {
      var html = '';
      custs.forEach(function(c) {
        var info = (c.phone || '') + (c.customer_type ? ' &middot; ' + esc(c.customer_type) : '');
        if (c.account_balance > 0) info += ' &middot; Bal: $' + (c.account_balance || 0).toFixed(2);
        html += '<div class="pos-customer-option" data-cust-id="' + c.id + '">' +
          '<div style="font-weight:600;font-size:13px">' + esc(c.business_name || c.contact_name || 'Unknown') + '</div>' +
          '<div style="font-size:11px;color:var(--pos-gray-500)">' + info + '</div>' +
        '</div>';
      });
      dd.innerHTML = html;
    }
    dd.style.display = 'block';

    // Delegated click on dropdown
    dd.onclick = function(e) {
      var opt = e.target.closest('[data-cust-id]');
      if (opt) selectCustomer(parseInt(opt.dataset.custId));
    };
  });
}

function selectCustomer(id) {
  API.get('/pos/customers/' + id).then(function(r) {
    _s.customer = r.data.customer;
    _s.customerAcct = r.data.account;
    _s.customerAddresses = r.data.addresses || [];
    _s.deliveryAddrId = null;

    // Build warnings
    _s.warnings = _s.warnings.filter(function(w) { return w.product_id; });
    if (_s.customerAcct && _s.customerAcct.credit_limit > 0 && _s.customerAcct.balance >= _s.customerAcct.credit_limit) {
      _s.warnings.push({ type: 'error', message: 'Credit limit reached! Balance: $' + (_s.customerAcct.balance || 0).toFixed(2) + ' / Limit: $' + _s.customerAcct.credit_limit.toFixed(2) });
    }
    if (_s.customerAcct && _s.customerAcct.status === 'suspended') {
      _s.warnings.push({ type: 'error', message: 'Account is SUSPENDED — cannot charge to account' });
    }
    if (_s.customer.priority_rank && _s.customer.priority_rank >= 3) {
      _s.warnings.push({ type: 'warning', message: 'Low priority customer (rank ' + _s.customer.priority_rank + ')' });
    }

    renderCustomerArea();
    renderWarnings();
    renderCartFooter();
    priceCheckAll();
  }).catch(function() {
    toast('Failed to load customer', 'error');
  });
}

function removeCustomer() {
  _s.customer = null;
  _s.customerAcct = null;
  _s.customerAddresses = [];
  _s.deliveryReq = false;
  _s.deliveryAddrId = null;
  _s.warnings = _s.warnings.filter(function(w) { return w.product_id; });
  _s.cart.forEach(function(item) { item.effective_price = item.unit_price; item.price_source = 'list'; item.discount_pct = 0; });
  renderCustomerArea(); renderWarnings(); renderCart(); renderCartFooter();
}

// ==================== CUSTOMER DETAIL PANEL ====================
function showCustomerPanel(id) {
  API.get('/pos/customers/' + id).then(function(r) {
    var c = r.data.customer;
    var acct = r.data.account;
    var sales = r.data.recentSales || [];
    var orders = r.data.recentOrders || [];
    var rules = r.data.priceRules || [];
    var addrs = r.data.addresses || [];

    var crmOrg = r.data.crmOrg;

    var html = '<div class="pos-cust-panel">' +
      '<div class="pos-cust-panel-header"><h3><i class="fas fa-user"></i> ' + esc(c.business_name || c.contact_name) + '</h3>' +
      '<div class="pos-cust-panel-actions">' +
        '<button class="pos-btn pos-btn-sm" id="posCustPanelQuickEdit" title="Quick Edit"><i class="fas fa-pen"></i></button>' +
        '<button class="pos-btn pos-btn-sm" id="posCustPanelCRM" title="CRM Link"><i class="fas fa-link"></i></button>' +
      '</div>' +
      '<button class="pos-modal-close" id="posCustPanelClose"><i class="fas fa-times"></i></button></div>' +
      '<div class="pos-cust-panel-body">';

    html += '<div class="pos-cust-section"><h4><i class="fas fa-id-card"></i> Information</h4>' +
      fld('Business', c.business_name) + fld('Contact', c.contact_name) + fld('Phone', c.phone) +
      fld('Email', c.email) + fld('Type', c.customer_type) + fld('Location', c.location_name) +
      fld('Tax Exempt', c.tax_exempt ? 'Yes' : 'No') + fld('Sponsor Discount', c.sponsor_discount ? c.sponsor_discount + '%' : 'None') +
      fld('Priority', c.priority_rank ? 'Rank ' + c.priority_rank : 'Normal') +
    '</div>';

    html += '<div class="pos-cust-section"><h4><i class="fas fa-credit-card"></i> Account</h4>' +
      fld('Balance', '$' + (acct.balance || 0).toFixed(2)) +
      fld('Credit Limit', acct.credit_limit ? '$' + acct.credit_limit.toFixed(2) : 'None') +
      fld('Terms', acct.payment_terms || 'COD') +
      fld('Status', acct.status || 'active') +
    '</div>';

    if (addrs.length > 0) {
      html += '<div class="pos-cust-section"><h4><i class="fas fa-map-marker-alt"></i> Addresses</h4>';
      addrs.forEach(function(a) {
        html += '<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--pos-gray-100)">' +
          (a.label ? '<strong>' + esc(a.label) + '</strong> ' : '') +
          esc((a.street || '') + ', ' + (a.city || '') + ' ' + (a.state || '') + ' ' + (a.zip || '')) +
          (a.is_primary ? ' <span class="pos-badge pos-badge-green">Primary</span>' : '') + '</div>';
      });
      html += '</div>';
    }

    if (rules.length > 0) {
      html += '<div class="pos-cust-section"><h4><i class="fas fa-tag"></i> Price Rules</h4>';
      rules.forEach(function(r) {
        html += '<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--pos-gray-100)">' +
          esc(r.product_name || 'Product #' + r.product_id) + ' — ' +
          (r.price ? '$' + r.price.toFixed(2) : r.discount_pct + '% off') + ' (' + r.rule_type + ')</div>';
      });
      html += '</div>';
    }

    if (sales.length > 0) {
      html += '<div class="pos-cust-section"><h4><i class="fas fa-receipt"></i> Recent POS Sales</h4>';
      sales.forEach(function(s) {
        html += '<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--pos-gray-100);display:flex;justify-content:space-between">' +
          '<span>' + esc(s.sale_number) + ' &middot; ' + (s.created_at || '').slice(0, 10) + '</span>' +
          '<span style="font-weight:600">$' + (s.total || 0).toFixed(2) + '</span></div>';
      });
      html += '</div>';
    }

    // CRM link info
    if (crmOrg) {
      html += '<div class="pos-cust-section"><h4><i class="fas fa-link"></i> CRM Organization</h4>' +
        fld('Name', crmOrg.name) + fld('Type', crmOrg.org_type) +
        (crmOrg.tags ? fld('Tags', crmOrg.tags) : '') +
      '</div>';
    }

    if (c.notes) {
      html += '<div class="pos-cust-section"><h4><i class="fas fa-sticky-note"></i> Notes</h4>' +
        '<div style="font-size:12px;white-space:pre-wrap;color:var(--pos-gray-600)">' + esc(c.notes) + '</div></div>';
    }

    html += '</div></div>';

    var existing = document.querySelector('.pos-cust-panel');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', html);

    on('posCustPanelClose', 'click', function() {
      var p = document.querySelector('.pos-cust-panel');
      if (p) p.remove();
    });
    on('posCustPanelQuickEdit', 'click', function() {
      var p = document.querySelector('.pos-cust-panel');
      if (p) p.remove();
      openQuickEditCustomer(c.id);
    });
    on('posCustPanelCRM', 'click', function() {
      var p = document.querySelector('.pos-cust-panel');
      if (p) p.remove();
      openCRMLink(c.id);
    });
  });
}

// ==================== REORDER FROM CUSTOMER HISTORY ====================
function showReorderHistory(customerId) {
  var locId = getLocationId();
  showModal('<i class="fas fa-clock-rotate-left"></i> Reorder — ' + esc(_s.customer ? (_s.customer.business_name || _s.customer.contact_name) : 'Customer'),
    '<div id="posReorderContent"><div class="pos-loading"><i class="fas fa-spinner fa-spin"></i> Loading purchase history...</div></div>', '');

  API.get('/pos/customer-history/' + customerId + '?location_id=' + locId).then(function(r) {
    var items = r.data || [];
    var content = document.getElementById('posReorderContent');
    if (!content) return;

    if (items.length === 0) {
      content.innerHTML = '<div style="text-align:center;padding:30px;color:var(--pos-gray-400)">' +
        '<i class="fas fa-inbox" style="font-size:36px;display:block;margin-bottom:12px"></i>' +
        '<p style="font-size:14px;margin:0">No purchase history yet</p>' +
        '<p style="font-size:12px;margin:4px 0 0">This customer hasn\'t placed any orders.</p></div>';
      return;
    }

    var html = '<div class="pos-reorder-search-row">' +
      '<input type="text" id="posReorderSearch" class="pos-search-input" placeholder="Filter products..." style="flex:1;font-size:13px;padding:8px 12px">' +
      '<span style="font-size:12px;color:var(--pos-gray-400);white-space:nowrap">' + items.length + ' products</span></div>';

    html += '<div class="pos-reorder-list" id="posReorderList">';
    items.forEach(function(item, idx) {
      var stockClass = item.stock <= 0 ? 'out' : item.stock <= 10 ? 'low' : 'ok';
      var stockLabel = item.stock <= 0 ? 'OUT' : item.stock;
      var lastDate = item.last_ordered ? item.last_ordered.slice(0, 10) : 'Unknown';
      var avgQty = item.pos_avg_qty ? Math.round(item.pos_avg_qty) : 1;

      html += '<div class="pos-reorder-item" data-idx="' + idx + '" data-pid="' + item.product_id + '" data-name="' + esc((item.name || '').toLowerCase()) + '" data-sku="' + esc((item.sku || '').toLowerCase()) + '">' +
        '<div class="pos-reorder-item-info">' +
          '<div class="pos-reorder-item-name">' + esc(item.name) + '</div>' +
          '<div class="pos-reorder-item-meta">' +
            '<span title="Times ordered"><i class="fas fa-repeat"></i> ' + item.times_ordered + 'x</span>' +
            '<span title="Total qty purchased"><i class="fas fa-cubes"></i> ' + item.total_qty + ' total</span>' +
            '<span title="Last ordered"><i class="fas fa-calendar"></i> ' + lastDate + '</span>' +
            '<span class="pos-reorder-stock ' + stockClass + '" title="Current stock">' + stockLabel + ' in stock</span>' +
          '</div>' +
        '</div>' +
        '<div class="pos-reorder-item-actions">' +
          '<div class="pos-reorder-price">$' + (item.price || 0).toFixed(2) + '</div>' +
          '<div class="pos-reorder-qty-row">' +
            '<button class="pos-reorder-qty-btn" data-action="minus" data-idx="' + idx + '">−</button>' +
            '<input type="number" id="posReorderQty_' + idx + '" class="pos-reorder-qty" value="' + avgQty + '" min="1" inputmode="numeric">' +
            '<button class="pos-reorder-qty-btn" data-action="plus" data-idx="' + idx + '">+</button>' +
          '</div>' +
          '<button class="pos-reorder-add-btn" data-idx="' + idx + '" data-pid="' + item.product_id + '"><i class="fas fa-plus"></i> Add</button>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';

    content.innerHTML = html;

    // Store items for event handlers
    content._reorderItems = items;

    // Search filter
    var searchEl = document.getElementById('posReorderSearch');
    if (searchEl) {
      searchEl.addEventListener('input', function() {
        var q = (this.value || '').toLowerCase();
        document.querySelectorAll('.pos-reorder-item').forEach(function(el) {
          var name = el.dataset.name || '';
          var sku = el.dataset.sku || '';
          el.style.display = (!q || name.includes(q) || sku.includes(q)) ? '' : 'none';
        });
      });
      searchEl.focus();
    }

    // Delegated event handling for the reorder list
    var list = document.getElementById('posReorderList');
    if (list) {
      list.addEventListener('click', function(e) {
        var addBtn = e.target.closest('.pos-reorder-add-btn');
        if (addBtn) {
          var pidAdd = parseInt(addBtn.dataset.pid);
          var idxAdd = parseInt(addBtn.dataset.idx);
          var qtyInput = document.getElementById('posReorderQty_' + idxAdd);
          var qty = parseInt(qtyInput ? qtyInput.value : '1') || 1;
          var item = content._reorderItems[idxAdd];
          if (item) {
            _s.productCache[pidAdd] = {
              name: item.name, sku: item.sku, category: item.category,
              price: item.price, cost: item.cost, tax_rate: item.tax_rate, stock: item.stock
            };
            // Add to cart with desired qty
            for (var q = 0; q < qty; q++) addToCart(pidAdd, _s.productCache[pidAdd]);
            // Visual feedback
            addBtn.innerHTML = '<i class="fas fa-check"></i> Added!';
            addBtn.classList.add('pos-reorder-added');
            setTimeout(function() {
              addBtn.innerHTML = '<i class="fas fa-plus"></i> Add';
              addBtn.classList.remove('pos-reorder-added');
            }, 1500);
          }
          return;
        }
        // Qty stepper buttons
        var qtyBtn = e.target.closest('.pos-reorder-qty-btn');
        if (qtyBtn) {
          var idxQ = parseInt(qtyBtn.dataset.idx);
          var input = document.getElementById('posReorderQty_' + idxQ);
          if (input) {
            var val = parseInt(input.value) || 1;
            if (qtyBtn.dataset.action === 'minus') val = Math.max(1, val - 1);
            else val += 1;
            input.value = val;
          }
          return;
        }
      });
    }
  }).catch(function(err) {
    var content = document.getElementById('posReorderContent');
    if (content) content.innerHTML = '<div style="text-align:center;padding:20px;color:var(--pos-red)"><i class="fas fa-exclamation-triangle"></i> Failed to load history: ' + esc(err.message || 'Unknown error') + '</div>';
  });
}
window.showReorderHistory = showReorderHistory;

// ==================== HOLD SALE ====================
function holdSale() {
  if (_s.cart.length === 0) return;
  var reason = prompt('Hold reason (optional):') || '';
  var body = buildSaleBody('hold');
  body.status = 'hold';

  API.post('/pos/sales', body).then(function(r) {
    var saleId = r.data.id;
    var user = getUser();
    return API.put('/pos/sales/' + saleId + '/hold', {
      held_by: user ? user.id : null,
      held_by_name: user ? user.name : '',
      reason: reason,
      customer_name: _s.customer ? _s.customer.business_name : ''
    });
  }).then(function() {
    _s.cart = []; _s.warnings = []; _s.deliveryReq = false;
    renderCart(); renderCartFooter(); renderWarnings();
    loadHeldCount();
    toast('Sale held successfully');
  }).catch(function(err) {
    toast('Failed to hold: ' + errMsg(err), 'error');
  });
}

function loadHeldCount() {
  API.get('/pos/held?location_id=' + getLocationId()).then(function(r) {
    _s.heldCount = (r.data || []).length;
    var badge = document.getElementById('posHeldBadge');
    if (badge) {
      badge.textContent = _s.heldCount;
      badge.style.display = _s.heldCount > 0 ? 'inline' : 'none';
    }
  }).catch(function() {});
}

// ==================== SHOW HELD SALES ====================
function showHeld() {
  API.get('/pos/held?location_id=' + getLocationId()).then(function(r) {
    var held = r.data || [];
    var html = '';
    if (held.length === 0) {
      html = '<div style="text-align:center;padding:20px;color:var(--pos-gray-400)"><i class="fas fa-inbox" style="font-size:24px;display:block;margin-bottom:8px"></i>No held sales</div>';
    } else {
      html = '<div style="display:flex;flex-direction:column;gap:8px">';
      held.forEach(function(h) {
        html += '<div class="pos-held-row" data-sale-id="' + h.sale_id + '">' +
          '<div style="flex:1">' +
            '<div style="font-weight:700;font-size:14px">' + esc(h.sale_number || 'Sale #' + h.sale_id) + '</div>' +
            '<div style="font-size:12px;color:var(--pos-gray-500)">' +
              (h.customer_business ? esc(h.customer_business) + ' &middot; ' : '') +
              (h.item_count || 0) + ' items &middot; $' + (h.total || 0).toFixed(2) +
              (h.reason ? ' &middot; ' + esc(h.reason) : '') +
            '</div>' +
            '<div style="font-size:11px;color:var(--pos-gray-400)">' + esc(h.held_by_name || '') + ' &middot; ' + timeAgo(h.held_at) + '</div>' +
          '</div>' +
          '<button class="pos-btn" data-held-action="resume" style="background:var(--pos-navy);color:white;padding:8px 14px;font-size:12px"><i class="fas fa-play"></i> Resume</button>' +
          '<button class="pos-btn" data-held-action="void" style="background:var(--pos-red);color:white;padding:8px 14px;font-size:12px"><i class="fas fa-trash"></i></button>' +
        '</div>';
      });
      html += '</div>';
    }
    showModal('Held Sales', html);

    // Bind held sale actions
    setTimeout(function() {
      document.querySelectorAll('[data-held-action]').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          var row = e.target.closest('[data-sale-id]');
          if (!row) return;
          var saleId = parseInt(row.dataset.saleId);
          if (btn.dataset.heldAction === 'resume') resumeHeld(saleId);
          else if (btn.dataset.heldAction === 'void') voidSale(saleId, true);
        });
      });
    }, 50);
  });
}

function resumeHeld(saleId) {
  API.put('/pos/sales/' + saleId + '/resume').then(function(r) {
    var sale = r.data.sale;
    var items = r.data.items || [];
    _s.cart = items.map(function(si) {
      return {
        product_id: si.product_id, name: si.product_name, sku: si.sku, category: si.category,
        qty: si.quantity, unit_price: si.unit_price,
        effective_price: si.unit_price - (si.discount_amount || 0) / (si.quantity || 1),
        price_source: 'list', tax_rate: si.tax_rate || 0, cost: si.unit_cost || 0,
        discount_pct: si.discount_pct || 0, stock: 999
      };
    });
    if (sale.customer_id) selectCustomer(sale.customer_id);
    closeModal(); renderCart(); renderCartFooter(); loadHeldCount();
    toast('Sale resumed');
  }).catch(function(err) { toast('Failed to resume: ' + errMsg(err), 'error'); });
}

// ==================== PAYMENT FLOW ====================
function openPayment() {
  if (_s.cart.length === 0) return;
  _s.payMethod = getDefaultPayMethod();
  var totals = calcTotals();
  var canChargeAccount = _s.customer && _s.customerAcct && _s.customerAcct.status !== 'suspended';
  var acctCls = !canChargeAccount ? ' style="opacity:0.4;pointer-events:none"' : '';

  var html =
    '<div style="text-align:center;margin-bottom:16px">' +
      '<div style="font-size:14px;color:var(--pos-gray-500)">Total Due</div>' +
      '<div style="font-size:36px;font-weight:800;color:var(--pos-navy)">$' + totals.total.toFixed(2) + '</div>' +
      (_s.customer ? '<div style="font-size:13px;color:var(--pos-gray-500)">' + esc(_s.customer.business_name || '') + '</div>' : '') +
    '</div>' +
    '<div class="pos-pay-methods">' +
      (isDCMode() ? '' : '<div class="pos-pay-method' + (!isDCMode() ? ' active' : '') + '" data-method="cash"><i class="fas fa-money-bill-wave"></i><span>Cash</span></div>') +
      '<div class="pos-pay-method' + (isDCMode() ? ' active' : '') + '" data-method="credit_card"><i class="fas fa-credit-card"></i><span>Credit Card</span></div>' +
      '<div class="pos-pay-method" data-method="debit_card"><i class="far fa-credit-card"></i><span>Debit Card</span></div>' +
      (isDCMode() ? '' : '<div class="pos-pay-method" data-method="check"><i class="fas fa-money-check"></i><span>Check</span></div>') +
      '<div class="pos-pay-method" data-method="account"' + acctCls + '><i class="fas fa-building"></i><span>On Account</span></div>' +
      (isDCMode() ? '' : '<div class="pos-pay-method" data-method="split"><i class="fas fa-divide"></i><span>Split</span></div>') +
    '</div>' +
    (isDCMode() ? '<div style="background:#FEF3C7;border-radius:8px;padding:8px 12px;font-size:11px;color:#92400E;margin-bottom:8px;text-align:center"><i class="fas fa-warehouse"></i> DC mode — card &amp; account payments only</div>' : '') +
    '<div id="posPayDetails"></div>';

  showModal('Payment', html,
    '<button class="pos-btn" style="background:var(--pos-gray-200);color:var(--pos-gray-700);flex:1" id="posPayCancelBtn">Cancel</button>' +
    '<button class="pos-btn pos-btn-pay" style="flex:2" id="posPaySubmitBtn"><i class="fas fa-check"></i> Complete Sale</button>'
  );

  // Bind method selection
  setTimeout(function() {
    document.querySelectorAll('.pos-pay-method').forEach(function(el) {
      el.addEventListener('click', function() {
        document.querySelectorAll('.pos-pay-method').forEach(function(m) { m.classList.remove('active'); });
        el.classList.add('active');
        _s.payMethod = el.dataset.method;
        renderPayDetails();
      });
    });
    on('posPayCancelBtn', 'click', closeModal);
    on('posPaySubmitBtn', 'click', processPayment);
    renderPayDetails();
  }, 50);
}

function renderPayDetails() {
  var detailEl = document.getElementById('posPayDetails');
  if (!detailEl) return;
  var totals = calcTotals();
  var method = _s.payMethod;

  if (method === 'cash') {
    var html = '<div class="pos-pay-amount"><label>Cash Received</label>' +
      '<input type="number" id="posCashAmount" value="' + totals.total.toFixed(2) + '" step="0.01" min="0"></div>' +
      '<div class="pos-quick-cash">';
    [5, 10, 20, 50, 100].forEach(function(amt) {
      if (amt >= totals.total) html += '<button class="pos-quick-cash-btn" data-cash-amt="' + amt + '">$' + amt + '</button>';
    });
    html += '<button class="pos-quick-cash-btn" data-cash-amt="' + totals.total.toFixed(2) + '">Exact</button>';
    html += '</div><div id="posChangeDisplay" style="text-align:center;font-size:18px;font-weight:700;color:var(--pos-green)"></div>';
    detailEl.innerHTML = html;

    // Quick cash buttons
    detailEl.querySelectorAll('[data-cash-amt]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.getElementById('posCashAmount').value = btn.dataset.cashAmt;
        calcChange();
      });
    });
    var cashInput = document.getElementById('posCashAmount');
    if (cashInput) cashInput.addEventListener('input', calcChange);
    calcChange();

  } else if (method === 'credit_card' || method === 'debit_card') {
    var ccConfig = _s._ccFeeConfig;
    var ccFeeAmt = 0;
    var ccFeeHtml = '';
    if (method === 'credit_card' && ccConfig && (ccConfig.is_active || ccConfig.active)) {
      ccFeeAmt = Math.round(totals.total * ((ccConfig.rate || 0) / 100) * 100) / 100;
      ccFeeHtml = '<div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:12px;margin-top:12px;font-size:12px;color:#92400E">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><i class="fas fa-info-circle" style="color:#D97706"></i> <strong>Credit Card Processing Fee</strong></div>' +
        '<div style="font-size:13px;margin-bottom:6px">A <strong>' + (ccConfig.rate || 0) + '%</strong> processing fee of <strong>$' + ccFeeAmt.toFixed(2) + '</strong> applies to credit card payments.</div>' +
        '<div style="background:#FFFBEB;border-radius:6px;padding:8px;font-size:12px;font-weight:600;color:#92400E">New Total: <span style="font-size:15px">$' + (totals.total + ccFeeAmt).toFixed(2) + '</span></div>' +
        '<div style="font-size:10px;color:#78716C;margin-top:8px;line-height:1.4">' +
          '<i class="fas fa-balance-scale" style="margin-right:3px"></i> ' + esc(ccConfig.legal_notice || 'This fee does not exceed the merchant\'s cost of acceptance. You may avoid this fee by paying with cash, check, or debit card.') +
        '</div>' +
        '</div>';
    } else if (method === 'debit_card') {
      // Legal: No convenience fee on debit cards
      ccFeeAmt = 0;
    }
    _s.appliedCCFee = ccFeeAmt;
    var cardIcon = method === 'debit_card' ? 'far fa-credit-card' : 'fas fa-credit-card';
    var cardLabel = method === 'debit_card' ? 'Debit Card' : 'Credit Card';
    detailEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--pos-gray-500)">' +
      '<i class="' + cardIcon + '" style="font-size:24px;margin-bottom:8px;display:block"></i>' +
      '<div>Process <strong>$' + (totals.total + ccFeeAmt).toFixed(2) + '</strong> via ' + cardLabel + '</div>' +
      ccFeeHtml +
      '<input type="text" placeholder="Last 4 digits (optional)" id="posCardLast4" maxlength="4" style="margin-top:12px;padding:8px;border:1px solid var(--pos-gray-200);border-radius:8px;text-align:center;font-size:16px;width:100px">' +
    '</div>';

  } else if (method === 'check') {
    detailEl.innerHTML = '<div class="pos-pay-amount"><label>Check Number</label>' +
      '<input type="text" id="posCheckNumber" placeholder="Check #" style="font-size:16px"></div>';

  } else if (method === 'account') {
    var bal = _s.customerAcct ? _s.customerAcct.balance : 0;
    var limit = _s.customerAcct ? _s.customerAcct.credit_limit : 0;
    var newBal = bal + totals.total;
    var over = limit > 0 && newBal > limit;
    detailEl.innerHTML = '<div style="text-align:center;padding:16px">' +
      '<i class="fas fa-building" style="font-size:24px;color:var(--pos-navy);margin-bottom:8px;display:block"></i>' +
      '<div style="font-size:14px;color:var(--pos-gray-600)">Charge to ' + esc(_s.customer?.business_name || 'customer') + ' account</div>' +
      '<div style="margin-top:12px;font-size:13px">' +
        '<div>Current Balance: <strong>$' + bal.toFixed(2) + '</strong></div>' +
        '<div>This Sale: <strong>$' + totals.total.toFixed(2) + '</strong></div>' +
        '<div>New Balance: <strong style="color:' + (over ? 'var(--pos-red)' : 'var(--pos-navy)') + '">$' + newBal.toFixed(2) + '</strong></div>' +
        (limit > 0 ? '<div>Credit Limit: $' + limit.toFixed(2) + '</div>' : '') +
        (over ? '<div style="color:var(--pos-red);font-weight:700;margin-top:6px"><i class="fas fa-exclamation-triangle"></i> OVER CREDIT LIMIT</div>' : '') +
      '</div></div>';

  } else if (method === 'split') {
    _s.splitPayments = [{ method: 'cash', amount: totals.total }];
    renderSplitPayments(totals.total);
  }
}

function calcChange() {
  var totals = calcTotals();
  var cash = parseFloat(gv('posCashAmount')) || 0;
  var change = cash - totals.total;
  var el = document.getElementById('posChangeDisplay');
  if (el) {
    el.innerHTML = change >= 0
      ? 'Change: $' + change.toFixed(2)
      : 'Short: $' + Math.abs(change).toFixed(2);
    el.style.color = change >= 0 ? 'var(--pos-green)' : 'var(--pos-red)';
  }
}

function renderSplitPayments(total) {
  var el = document.getElementById('posPayDetails');
  if (!el) return;
  var html = '<div class="pos-pay-split"><div style="font-size:13px;font-weight:600;margin-bottom:8px">Split Payment</div>';
  var allocated = 0;
  _s.splitPayments.forEach(function(sp, i) {
    allocated += parseFloat(sp.amount) || 0;
    html += '<div class="pos-pay-split-row" data-split-idx="' + i + '">' +
      '<select data-split-field="method">' + splitOpts(sp.method) + '</select>' +
      '<input type="number" value="' + (sp.amount || 0).toFixed(2) + '" step="0.01" data-split-field="amount">' +
      '<button style="background:none;border:none;color:var(--pos-red);cursor:pointer;font-size:14px" data-split-field="remove"><i class="fas fa-trash"></i></button>' +
    '</div>';
  });
  var remaining = total - allocated;
  html += '<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:13px">' +
    '<span>Remaining: <strong style="color:' + (remaining > 0.01 ? 'var(--pos-red)' : 'var(--pos-green)') + '">$' + remaining.toFixed(2) + '</strong></span>' +
    '<button class="pos-btn" id="posSplitAddBtn" style="background:var(--pos-gray-200);color:var(--pos-gray-700);padding:6px 12px;font-size:12px"><i class="fas fa-plus"></i> Add</button>' +
  '</div></div>';
  el.innerHTML = html;

  // Bind split events
  el.querySelectorAll('[data-split-idx]').forEach(function(row) {
    var idx = parseInt(row.dataset.splitIdx);
    row.querySelector('[data-split-field="method"]').addEventListener('change', function() { _s.splitPayments[idx].method = this.value; });
    row.querySelector('[data-split-field="amount"]').addEventListener('change', function() { _s.splitPayments[idx].amount = parseFloat(this.value) || 0; renderSplitPayments(total); });
    row.querySelector('[data-split-field="remove"]').addEventListener('click', function() { _s.splitPayments.splice(idx, 1); renderSplitPayments(total); });
  });
  on('posSplitAddBtn', 'click', function() {
    var alloc = _s.splitPayments.reduce(function(s, p) { return s + (parseFloat(p.amount) || 0); }, 0);
    _s.splitPayments.push({ method: 'cash', amount: Math.max(0, total - alloc) });
    renderSplitPayments(total);
  });
}

function splitOpts(sel) {
  var opts = [['cash','Cash'],['credit_card','Credit Card'],['debit_card','Debit Card'],['check','Check'],['account','On Account']];
  return opts.map(function(o) { return '<option value="' + o[0] + '"' + (o[0]===sel?' selected':'') + '>' + o[1] + '</option>'; }).join('');
}

// ==================== PROCESS PAYMENT ====================
function processPayment() {
  var totals = calcTotals();
  var body = buildSaleBody('completed');

  if (_s.payMethod === 'split') {
    body.payments = _s.splitPayments.map(function(sp) { return { method: sp.method, amount: sp.amount }; });
    body.amount_paid = _s.splitPayments.reduce(function(s, p) { return s + (parseFloat(p.amount) || 0); }, 0);
  } else if (_s.payMethod === 'cash') {
    var cashAmt = parseFloat(gv('posCashAmount')) || totals.total;
    body.amount_paid = cashAmt;
    body.payments = [{ method: 'cash', amount: cashAmt }];
  } else if (_s.payMethod === 'credit_card' || _s.payMethod === 'debit_card') {
    var ccFeeForPayment = _s.payMethod === 'credit_card' ? (_s.appliedCCFee || 0) : 0;
    var cardTotal = totals.total + ccFeeForPayment;
    body.payments = [{ method: _s.payMethod, amount: cardTotal, card_last4: gv('posCardLast4') || null }];
    body.amount_paid = cardTotal;
    if (ccFeeForPayment > 0) { body.cc_convenience_fee = ccFeeForPayment; }
  } else if (_s.payMethod === 'check') {
    body.payments = [{ method: 'check', amount: totals.total, check_number: gv('posCheckNumber') || null }];
    body.amount_paid = totals.total;
  } else if (_s.payMethod === 'account') {
    body.payments = [{ method: 'account', amount: totals.total }];
    body.amount_paid = totals.total;
  }

  var btn = document.getElementById('posPaySubmitBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; }

  API.post('/pos/sales', body).then(function(r) {
    closeModal();
    showReceipt(r.data);
    _s.cart = []; _s.warnings = []; _s.deliveryReq = false;
    renderCart(); renderCartFooter(); renderWarnings(); loadHeldCount();
  }).catch(function(err) {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Complete Sale'; }
    var msg = errMsg(err);
    var warnings = (err.response?.data?.warnings || []);
    toast('Sale failed: ' + msg + (warnings.length ? '\n' + warnings.join(', ') : ''), 'error');
  });
}

function buildSaleBody(status) {
  var user = getUser();
  var items = _s.cart.map(function(c) {
    return { product_id: c.product_id, quantity: c.qty, unit_price: c.effective_price, discount_pct: c.discount_pct || 0, discount_reason: c.discount_reason || '', promo_id: c.promo_id || null, location_id: getLocationId() };
  });

  var saleType = 'walk_in';
  if (_s.deliveryReq === 'delivery') saleType = 'delivery';
  else if (_s.deliveryReq === 'dc_pickup') saleType = 'pickup';
  else if (_s.deliveryReq === 'reserve_retail') saleType = 'transfer_reserve';
  else if (_s.session && _s.session.register_type === 'wholesale') saleType = 'wholesale';

  return {
    session_id: _s.session ? _s.session.id : null,
    location_id: getLocationId(),
    customer_id: _s.customer ? _s.customer.id : null,
    sale_type: saleType,
    status: status,
    items: items,
    allow_negative_stock: true,
    delivery_requested: (_s.deliveryReq === 'delivery' || _s.deliveryReq === 'dc_pickup'),
    delivery_date: _s.deliveryDate || null,
    delivery_address_id: _s.deliveryAddrId || null,
    fulfillment: _s.deliveryReq || 'local',
    source_location_id: (_s.deliveryReq === 'dc_pickup' || _s.deliveryReq === 'delivery')
      ? (isDCMode() ? getLocationId() : (getOtherLocation() ? getOtherLocation().id : null))
      : (_s.deliveryReq === 'reserve_retail' ? (getOtherLocation() ? getOtherLocation().id : null) : null),
    cashier_id: user ? user.id : null,
    cashier_name: user ? user.name : '',
    notes: '',
    internal_notes: '',
    promo_id: _s.appliedPromo ? _s.appliedPromo.promo_id : null,
    promo_code: _s.appliedPromo ? _s.appliedPromo.code : null,
    promo_discount: _s.appliedPromo ? _s.appliedPromo.discount : 0,
    fuel_surcharge: _s.appliedFuelSurcharge || 0
  };
}

function calcTotals() {
  var subtotal = 0, taxTotal = 0, discountTotal = 0, promoDisc = 0;
  var isTaxExempt = _s.customer && _s.customer.tax_exempt;
  _s.cart.forEach(function(item) {
    var ls = item.effective_price * item.qty;
    var ld = (item.unit_price - item.effective_price) * item.qty;
    var tr = isTaxExempt ? 0 : (item.tax_rate || 0);
    subtotal += ls; taxTotal += ls * (tr / 100); discountTotal += ld;
  });
  if (_s.appliedPromo && _s.appliedPromo.discount > 0) {
    promoDisc = _s.appliedPromo.discount;
    // Tax on the reduced amount
    taxTotal = 0;
    var promoRatio = promoDisc / subtotal;
    _s.cart.forEach(function(item) {
      var ls = item.effective_price * item.qty;
      var tr = isTaxExempt ? 0 : (item.tax_rate || 0);
      taxTotal += (ls - ls * promoRatio) * (tr / 100);
    });
  }
  // Calculate fees
  var fuelSurcharge = 0;
  var ccFee = 0;
  var fuelConfig = _s.fees.find(function(f) { return f.fee_type === 'fuel_surcharge' && (f.is_active || f.active); });
  var ccConfig = _s.fees.find(function(f) { return f.fee_type === 'cc_convenience' && (f.is_active || f.active); });
  if (fuelConfig && (_s.deliveryReq === 'delivery')) {
    fuelSurcharge = (subtotal - promoDisc) * ((fuelConfig.rate || 0) / 100);
  }
  // CC fee is calculated at payment time, not here — just expose config
  _s.appliedFuelSurcharge = fuelSurcharge;
  _s._ccFeeConfig = ccConfig;

  var total = subtotal - promoDisc + taxTotal + fuelSurcharge;
  return { subtotal: subtotal, tax: taxTotal, discount: discountTotal, promoDiscount: promoDisc, fuelSurcharge: fuelSurcharge, ccFeeConfig: ccConfig, total: total };
}

// ==================== RECEIPT ====================
function showReceipt(saleData) {
  var locName = getLocationName();
  var html = '<div class="pos-receipt">' +
    '<div class="pos-receipt-header"><h2>British Feed & Supplies</h2><p>' + esc(locName) + '</p>' +
    '<p>Sale #' + esc(saleData.sale_number) + '</p><p>' + new Date().toLocaleString() + '</p>' +
    (_s.customer ? '<p>' + esc(_s.customer.business_name || _s.customer.contact_name || '') + '</p>' : '') +
    '</div><div class="pos-receipt-items">';

  _s.cart.forEach(function(item) {
    html += '<div class="pos-receipt-item"><span class="name">' + esc(item.name) + '</span>' +
      '<span class="qty">x' + item.qty + '</span><span class="amount">$' + (item.effective_price * item.qty).toFixed(2) + '</span></div>';
  });

  html += '</div><div class="pos-receipt-totals">' +
    '<div class="pos-receipt-total"><span>Subtotal</span><span>$' + (saleData.subtotal || 0).toFixed(2) + '</span></div>' +
    '<div class="pos-receipt-total"><span>Tax</span><span>$' + (saleData.tax || 0).toFixed(2) + '</span></div>';
  if (saleData.discount > 0) html += '<div class="pos-receipt-total"><span>Discount</span><span>-$' + saleData.discount.toFixed(2) + '</span></div>';
  html += '<div class="pos-receipt-total grand"><span>Total</span><span>$' + (saleData.total || 0).toFixed(2) + '</span></div>';
  if (saleData.change_due > 0) html += '<div class="pos-receipt-total"><span>Change</span><span>$' + saleData.change_due.toFixed(2) + '</span></div>';
  html += '</div>';

  if (saleData.order_id) html += '<div style="text-align:center;margin-top:12px;padding:8px;background:#EFF6FF;border-radius:8px;font-size:12px;font-weight:600;color:var(--pos-navy)"><i class="fas fa-truck"></i> Delivery Order Created</div>';
  if (saleData.transfer_id) html += '<div style="text-align:center;margin-top:8px;padding:8px;background:#FEF3C7;border-radius:8px;font-size:12px;font-weight:600;color:var(--pos-orange)"><i class="fas fa-arrows-left-right"></i> Transfer Request Created</div>';
  html += '<div class="pos-receipt-footer">Thank you for your business!</div></div>';

  showModal('Sale Complete', html,
    '<button class="pos-btn" style="background:var(--pos-gray-200);color:var(--pos-gray-700);flex:1" id="posPrintBtn"><i class="fas fa-print"></i> Print</button>' +
    '<button class="pos-btn pos-btn-pay" style="flex:1" id="posDoneBtn"><i class="fas fa-check"></i> Done</button>'
  );

  on('posPrintBtn', 'click', function() {
    var receipt = document.querySelector('.pos-receipt');
    if (!receipt) return;
    var win = window.open('', '_blank');
    win.document.write('<!DOCTYPE html><html><head><style>body{font-family:monospace;padding:20px;max-width:300px;margin:0 auto}h2{text-align:center;margin:0}p{text-align:center;margin:2px 0;font-size:12px}.pos-receipt-item,.pos-receipt-total{display:flex;justify-content:space-between;padding:2px 0;font-size:12px}.pos-receipt-total.grand{font-weight:bold;border-top:1px dashed #000;margin-top:4px;padding-top:4px}.pos-receipt-footer{text-align:center;margin-top:16px;border-top:1px dashed #000;padding-top:8px;font-size:11px}</style></head><body>' + receipt.innerHTML + '</body></html>');
    win.document.close();
    setTimeout(function() { win.print(); }, 300);
  });
  on('posDoneBtn', 'click', closeModal);
}

// ==================== VOID / REFUND ====================
function voidSale(saleId, fromHeld) {
  if (!confirm('Are you sure you want to void this sale?')) return;
  var reason = prompt('Void reason:') || 'Voided by cashier';
  var user = getUser();
  API.put('/pos/sales/' + saleId + '/void', { reason: reason, voided_by_name: user ? user.name : '' }).then(function() {
    toast('Sale voided');
    if (fromHeld) { closeModal(); loadHeldCount(); }
    else if (_s.view === 'history') loadHistory();
  }).catch(function(err) { toast('Void failed: ' + errMsg(err), 'error'); });
}

function showRefundModal(saleId) {
  API.get('/pos/sales/' + saleId).then(function(r) {
    var sale = r.data.sale;
    var items = r.data.items || [];
    var html = '<div style="margin-bottom:12px;font-size:13px;color:var(--pos-gray-600)">Select items to refund for Sale #' + esc(sale.sale_number) + '</div>';
    html += '<div id="posRefundItems">';
    items.forEach(function(item, idx) {
      html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--pos-gray-100)">' +
        '<input type="checkbox" class="ref-cb" data-ref-idx="' + idx + '" data-item-id="' + item.id + '" data-product-id="' + item.product_id + '" data-unit-price="' + item.unit_price + '" data-max-qty="' + item.quantity + '" checked>' +
        '<div style="flex:1"><div style="font-weight:600;font-size:13px">' + esc(item.product_name) + '</div><div style="font-size:11px;color:var(--pos-gray-400)">$' + (item.unit_price || 0).toFixed(2) + ' ea</div></div>' +
        '<input type="number" class="ref-qty" data-ref-idx="' + idx + '" value="' + item.quantity + '" min="1" max="' + item.quantity + '" style="width:60px;padding:6px;border:1px solid var(--pos-gray-200);border-radius:6px;text-align:center;font-size:13px">' +
      '</div>';
    });
    html += '</div>';
    html += '<div style="margin-top:12px"><label style="display:flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" id="posRefRestock" checked> Restock items</label></div>';
    html += '<div style="margin-top:8px"><label style="font-size:12px;font-weight:600;color:var(--pos-gray-500)">Reason</label><input type="text" id="posRefReason" placeholder="Return reason..." style="width:100%;padding:8px;border:1px solid var(--pos-gray-200);border-radius:8px;margin-top:4px"></div>';

    closeModal();
    showModal('Process Refund', html,
      '<button class="pos-btn" style="background:var(--pos-gray-200);color:var(--pos-gray-700);flex:1" id="posRefCancelBtn">Cancel</button>' +
      '<button class="pos-btn" style="background:var(--pos-purple);color:white;flex:1" id="posRefSubmitBtn"><i class="fas fa-rotate-left"></i> Process Refund</button>'
    );

    on('posRefCancelBtn', 'click', closeModal);
    on('posRefSubmitBtn', 'click', function() {
      var refundItems = [];
      document.querySelectorAll('.ref-cb:checked').forEach(function(cb) {
        var idx = cb.dataset.refIdx;
        var qtyInput = document.querySelector('.ref-qty[data-ref-idx="' + idx + '"]');
        refundItems.push({
          sale_item_id: parseInt(cb.dataset.itemId),
          product_id: parseInt(cb.dataset.productId),
          product_name: items[idx].product_name,
          unit_price: parseFloat(cb.dataset.unitPrice),
          quantity: parseInt(qtyInput ? qtyInput.value : 1),
          restock: document.getElementById('posRefRestock')?.checked !== false
        });
      });
      if (refundItems.length === 0) { toast('Select at least one item', 'error'); return; }

      var user = getUser();
      API.post('/pos/refunds', {
        original_sale_id: saleId,
        location_id: getLocationId(),
        customer_id: _s.customer ? _s.customer.id : null,
        refund_type: 'return', refund_method: 'original',
        reason: gv('posRefReason') || '', restock: document.getElementById('posRefRestock')?.checked !== false,
        processed_by: user ? user.id : null, processed_by_name: user ? user.name : '',
        items: refundItems
      }).then(function(r) {
        closeModal();
        toast('Refund #' + r.data.refund_number + ' processed — $' + (r.data.total || 0).toFixed(2));
        if (_s.view === 'history') loadHistory();
      }).catch(function(err) { toast('Refund failed: ' + errMsg(err), 'error'); });
    });
  });
}

// ==================== CLOSE SESSION ====================
function closeSession() {
  if (!confirm('Close this register session?')) return;
  var closingCash = prompt('Enter closing cash count ($):', '0') || '0';
  API.put('/pos/sessions/' + _s.session.id + '/close', { closing_cash: parseFloat(closingCash) || 0, notes: '' }).then(function() {
    _s.session = null;
    localStorage.removeItem('bf_pos_session');
    _s.cart = []; _s.warnings = [];
    renderOpenSession();
    toast('Register closed');
  }).catch(function(err) { toast('Failed to close: ' + errMsg(err), 'error'); });
}

// ==================== DASHBOARD ====================
function loadDashboard() {
  var el = document.getElementById('posViewDashboard');
  if (!el) return;
  el.innerHTML = '<div class="pos-loading"><i class="fas fa-spinner fa-spin"></i> Loading dashboard...</div>';

  API.get('/pos/dashboard?location_id=' + getLocationId()).then(function(r) {
    var d = r.data; var t = d.today || {};
    var html = '<div class="pos-dash-cards">' +
      dc('Transactions', fmtN(t.transactions), '', 'Today') +
      dc('Revenue', '$' + (t.revenue || 0).toFixed(2), 'green', 'Today') +
      dc('Avg Sale', '$' + (t.avg_transaction || 0).toFixed(2), '', 'Today') +
      dc('Walk-in', '$' + (t.walk_in_revenue || 0).toFixed(2), '', '') +
      dc('Delivery', '$' + (t.delivery_revenue || 0).toFixed(2), '', '') +
      dc('Wholesale', '$' + (t.wholesale_revenue || 0).toFixed(2), '', '') +
      dc('Held Sales', _s.heldCount, _s.heldCount > 0 ? 'orange' : '', '') +
    '</div>';

    if (d.paymentBreakdown && d.paymentBreakdown.length > 0) {
      html += '<div class="pos-dash-section"><h3><i class="fas fa-credit-card"></i> Payments Today</h3>' +
        '<table class="pos-table"><thead><tr><th>Method</th><th class="right">Count</th><th class="right">Total</th></tr></thead><tbody>';
      d.paymentBreakdown.forEach(function(p) {
        html += '<tr><td style="text-transform:capitalize">' + (p.method||'').replace(/_/g,' ') + '</td><td class="right">' + p.count + '</td><td class="right money">$' + (p.total||0).toFixed(2) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    if (d.topProducts && d.topProducts.length > 0) {
      html += '<div class="pos-dash-section"><h3><i class="fas fa-star"></i> Top Products Today</h3>' +
        '<table class="pos-table"><thead><tr><th>Product</th><th class="right">Qty</th><th class="right">Revenue</th></tr></thead><tbody>';
      d.topProducts.forEach(function(p) {
        html += '<tr><td>' + esc(p.product_name) + '</td><td class="right">' + fmtN(p.qty) + '</td><td class="right money">$' + (p.revenue||0).toFixed(2) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    if (d.lowStock && d.lowStock.length > 0) {
      html += '<div class="pos-dash-section"><h3><i class="fas fa-exclamation-triangle" style="color:var(--pos-orange)"></i> Low Stock Alerts' +
        ' <button class="pos-btn pos-btn-sm" id="posDashRequestStock" style="margin-left:12px;background:var(--pos-navy);color:white;font-size:11px"><i class="fas fa-paper-plane"></i> Request All Low Stock</button></h3>' +
        '<table class="pos-table"><thead><tr><th>Product</th><th>Location</th><th class="right">Available</th><th class="right">Reorder</th><th></th></tr></thead><tbody>';
      d.lowStock.forEach(function(s) {
        html += '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.location||'') + '</td><td class="right" style="color:var(--pos-red);font-weight:700">' + fmtN(s.qty_available) + '</td><td class="right">' + fmtN(s.reorder_point) + '</td>' +
          '<td><button class="pos-btn pos-btn-sm" data-req-product="' + s.id + '" data-req-name="' + escAttr(s.name) + '" data-req-stock="' + (s.qty_available||0) + '" data-req-reorder="' + (s.reorder_point||0) + '" style="font-size:10px"><i class="fas fa-paper-plane"></i></button></td></tr>';
      });
      html += '</tbody></table></div>';
      window._dashLowStock = d.lowStock;
    }

    // === SETTINGS & TOOLS ===
    html += '<div class="pos-dash-section"><h3><i class="fas fa-cog"></i> Settings & Tools</h3>' +
      '<div class="pos-dash-tools">' +
        '<button class="pos-btn pos-dash-tool-btn" id="posDashPromos"><i class="fas fa-bullhorn"></i> Promotions</button>' +
        '<button class="pos-btn pos-dash-tool-btn" id="posDashTax"><i class="fas fa-calculator"></i> Tax Config</button>' +
        '<button class="pos-btn pos-dash-tool-btn" id="posDashReservations"><i class="fas fa-bookmark"></i> Reservations</button>' +
        '<button class="pos-btn pos-dash-tool-btn" id="posDashPettyCash" style="background:linear-gradient(135deg,#F59E0B,#D97706);color:white"><i class="fas fa-money-bill-transfer"></i> Petty Cash</button>' +
      '</div></div>';

    el.innerHTML = html;

    // Wire dashboard tool buttons
    on('posDashPromos', 'click', openPromotionsManager);
    on('posDashTax', 'click', openTaxSettings);
    on('posDashReservations', 'click', openReservationsList);
    on('posDashPettyCash', 'click', function() { switchView('petty-cash'); });

    // Wire low stock request buttons
    on('posDashRequestStock', 'click', function() {
      if (!window._dashLowStock || window._dashLowStock.length === 0) return;
      var items = window._dashLowStock.map(function(s) {
        var needed = Math.max(1, (s.reorder_point || 0) - (s.qty_available || 0));
        return { product_id: s.id, product_name: s.name, qty_requested: needed, current_stock: s.qty_available || 0, reorder_point: s.reorder_point || 0 };
      });
      openInvRequestForm(items);
    });
    el.querySelectorAll('[data-req-product]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var needed = Math.max(1, parseInt(btn.dataset.reqReorder||'0') - parseInt(btn.dataset.reqStock||'0'));
        openInvRequestForm([{ product_id: parseInt(btn.dataset.reqProduct), product_name: btn.dataset.reqName, qty_requested: needed, current_stock: parseInt(btn.dataset.reqStock||'0'), reorder_point: parseInt(btn.dataset.reqReorder||'0') }]);
      });
    });
  }).catch(function() {
    el.innerHTML = '<div class="pos-loading" style="color:var(--pos-red)"><i class="fas fa-exclamation-triangle"></i> Failed to load dashboard</div>';
  });
}

function dc(label, value, color, sub) {
  return '<div class="pos-dash-card"><div class="pos-dash-card-label">' + label + '</div><div class="pos-dash-card-value ' + (color||'') + '">' + value + '</div>' + (sub ? '<div class="pos-dash-card-sub">' + sub + '</div>' : '') + '</div>';
}

// ==================== HISTORY ====================
function loadHistory() {
  var el = document.getElementById('posViewHistory');
  if (!el) return;
  var today = new Date().toISOString().slice(0, 10);
  var weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  el.innerHTML =
    '<div class="pos-history-filters">' +
      '<input type="date" id="posHistFrom" value="' + weekAgo + '">' +
      '<span style="color:var(--pos-gray-400);font-size:12px">to</span>' +
      '<input type="date" id="posHistTo" value="' + today + '">' +
      '<select id="posHistStatus"><option value="">All Status</option><option value="completed">Completed</option><option value="voided">Voided</option><option value="hold">On Hold</option></select>' +
      '<input type="text" id="posHistSearch" placeholder="Search sale # or customer...">' +
      '<button class="pos-btn" id="posHistSearchBtn" style="background:var(--pos-navy);color:white;padding:8px 14px;font-size:13px"><i class="fas fa-search"></i> Search</button>' +
    '</div>' +
    '<div class="pos-history-table" id="posHistTable"><div class="pos-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div></div>';

  on('posHistSearchBtn', 'click', doHistorySearch);
  doHistorySearch();
}

function doHistorySearch() {
  var from = gv('posHistFrom') || '';
  var to = gv('posHistTo') || '';
  var status = gv('posHistStatus') || '';
  var search = gv('posHistSearch') || '';
  var q = 'from=' + from + '&to=' + to + '&location_id=' + getLocationId();
  if (status) q += '&status=' + status;
  if (search) q += '&search=' + encodeURIComponent(search);

  API.get('/pos/sales?' + q).then(function(r) {
    var sales = r.data || [];
    var tableEl = document.getElementById('posHistTable');
    if (!tableEl) return;
    if (sales.length === 0) {
      tableEl.innerHTML = '<div style="text-align:center;padding:30px;color:var(--pos-gray-400)"><i class="fas fa-inbox" style="font-size:24px;display:block;margin-bottom:8px"></i>No sales found</div>';
      return;
    }
    var html = '<table class="pos-table"><thead><tr><th>Sale #</th><th>Customer</th><th>Type</th><th>Status</th><th>Items</th><th class="right">Total</th><th>Payment</th><th>Date</th><th></th></tr></thead><tbody>';
    sales.forEach(function(s) {
      var pmtStr = (s.payment_methods || '').split(',').map(function(p) { return (p.split(':')[0]||'').replace(/_/g,' '); }).join(', ');
      html += '<tr class="clickable" data-hist-sale-id="' + s.id + '">' +
        '<td style="font-weight:600">' + esc(s.sale_number||'') + '</td>' +
        '<td>' + esc(s.customer_name||'Walk-in') + '</td>' +
        '<td><span class="pos-badge pos-badge-blue">' + (s.sale_type||'').replace(/_/g,' ') + '</span></td>' +
        '<td><span class="status-badge status-' + s.status + '">' + s.status + '</span></td>' +
        '<td>' + (s.item_count||0) + '</td>' +
        '<td class="right money">$' + (s.total||0).toFixed(2) + '</td>' +
        '<td style="font-size:12px;text-transform:capitalize">' + pmtStr + '</td>' +
        '<td style="font-size:12px;color:var(--pos-gray-400)">' + (s.created_at||'').slice(0,16).replace('T',' ') + '</td>' +
        '<td>' +
          (s.status === 'completed' ? '<button class="pos-btn" data-hist-void="' + s.id + '" style="background:var(--pos-red);color:white;padding:4px 8px;font-size:11px">Void</button>' : '') +
        '</td>' +
      '</tr>';
    });
    html += '</tbody></table>';
    tableEl.innerHTML = html;

    // Bind history table events
    tableEl.querySelectorAll('[data-hist-sale-id]').forEach(function(row) {
      row.addEventListener('click', function(e) {
        if (e.target.closest('[data-hist-void]')) return;
        showSaleDetail(parseInt(row.dataset.histSaleId));
      });
    });
    tableEl.querySelectorAll('[data-hist-void]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        voidSale(parseInt(btn.dataset.histVoid), false);
      });
    });
  }).catch(function() {
    var tableEl = document.getElementById('posHistTable');
    if (tableEl) tableEl.innerHTML = '<div class="pos-loading" style="color:var(--pos-red)"><i class="fas fa-exclamation-triangle"></i> Failed to load</div>';
  });
}

// ==================== ALL ORDERS VIEW (unified POS + Delivery) ====================
function loadAllOrders() {
  var el = document.getElementById('posViewAll-orders');
  if (!el) return;
  var today = new Date().toISOString().slice(0, 10);
  var weekAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);

  el.innerHTML =
    '<div style="padding:16px">' +
      '<h3 style="margin:0 0 12px;font-size:16px;font-weight:700;color:var(--pos-navy)"><i class="fas fa-clipboard-list"></i> All Orders</h3>' +
      '<div class="pos-history-filters" style="flex-wrap:wrap">' +
        '<input type="date" id="posAllOrdFrom" value="' + weekAgo + '">' +
        '<span style="color:var(--pos-gray-400);font-size:12px">to</span>' +
        '<input type="date" id="posAllOrdTo" value="' + today + '">' +
        '<select id="posAllOrdType"><option value="">All Types</option><option value="sale">POS Sales</option><option value="delivery">Delivery Orders</option></select>' +
        '<select id="posAllOrdStatus"><option value="">All Statuses</option><option value="completed">Completed</option><option value="new">New</option><option value="confirmed">Confirmed</option><option value="scheduled">Scheduled</option><option value="in_transit">In Transit</option><option value="delivered">Delivered</option></select>' +
        '<input type="text" id="posAllOrdSearch" placeholder="Search order # or customer...">' +
        '<button class="pos-btn" id="posAllOrdSearchBtn" style="background:var(--pos-navy);color:white;padding:8px 14px;font-size:13px"><i class="fas fa-search"></i> Search</button>' +
      '</div>' +
      '<div id="posAllOrdTable" style="margin-top:12px"><div class="pos-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div></div>' +
    '</div>';

  on('posAllOrdSearchBtn', 'click', doAllOrdersSearch);
  var searchIn = document.getElementById('posAllOrdSearch');
  if (searchIn) searchIn.addEventListener('keydown', function(e) { if (e.key === 'Enter') doAllOrdersSearch(); });
  doAllOrdersSearch();
}

function doAllOrdersSearch() {
  var from = gv('posAllOrdFrom') || '';
  var to = gv('posAllOrdTo') || '';
  var type = gv('posAllOrdType') || '';
  var status = gv('posAllOrdStatus') || '';
  var search = gv('posAllOrdSearch') || '';
  var q = 'from=' + from + '&to=' + to;
  if (type) q += '&type=' + type;
  if (status) q += '&status=' + status;
  if (search) q += '&search=' + encodeURIComponent(search);

  API.get('/pos/all-orders?' + q).then(function(r) {
    var orders = r.data.orders || [];
    var tableEl = document.getElementById('posAllOrdTable');
    if (!tableEl) return;
    if (orders.length === 0) {
      tableEl.innerHTML = '<div style="text-align:center;padding:30px;color:var(--pos-gray-400)"><i class="fas fa-inbox" style="font-size:24px;display:block;margin-bottom:8px"></i>No orders found</div>';
      return;
    }
    var html = '<table class="pos-table"><thead><tr><th>Order #</th><th>Type</th><th>Customer</th><th>Status</th><th>Items</th><th class="right">Total</th><th>Date</th></tr></thead><tbody>';
    orders.forEach(function(o) {
      var srcIcon = o.source === 'sale' ? '<span class="pos-badge" style="background:#DBEAFE;color:#1D4ED8;font-size:10px"><i class="fas fa-cash-register"></i> POS</span>' :
        '<span class="pos-badge" style="background:#DCFCE7;color:#16A34A;font-size:10px"><i class="fas fa-truck"></i> Delivery</span>';
      var statusClass = 'status-' + (o.status || 'draft');
      html += '<tr class="clickable" data-allord-id="' + o.id + '" data-allord-src="' + o.source + '">' +
        '<td style="font-weight:600">' + esc(o.order_number || '') + '</td>' +
        '<td>' + srcIcon + '</td>' +
        '<td>' + esc(o.customer_name || 'Walk-in') + '</td>' +
        '<td><span class="status-badge ' + statusClass + '">' + esc(o.status || '') + '</span></td>' +
        '<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">' + esc((o.items_summary || '').slice(0, 80)) + '</td>' +
        '<td class="right money">$' + (o.total || 0).toFixed(2) + '</td>' +
        '<td style="font-size:12px;color:var(--pos-gray-400)">' + (o.created_at || '').slice(0, 10) + '</td>' +
      '</tr>';
    });
    html += '</tbody></table>';
    tableEl.innerHTML = html;

    tableEl.querySelectorAll('[data-allord-id]').forEach(function(row) {
      row.addEventListener('click', function() {
        var id = parseInt(row.dataset.allordId);
        var src = row.dataset.allordSrc;
        if (src === 'sale') showSaleDetail(id);
        else openOrderDetail(id, 'order');
      });
    });
  }).catch(function() {
    var tableEl = document.getElementById('posAllOrdTable');
    if (tableEl) tableEl.innerHTML = '<div class="pos-loading" style="color:var(--pos-red)"><i class="fas fa-exclamation-triangle"></i> Failed to load</div>';
  });
}
window.loadAllOrders = loadAllOrders;

// ==================== SALE DETAIL MODAL ====================
function showSaleDetail(id) {
  API.get('/pos/sales/' + id).then(function(r) {
    var sale = r.data.sale;
    var items = r.data.items || [];
    var payments = r.data.payments || [];
    var customer = r.data.customer;

    var html = '<div style="display:grid;gap:12px">';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">' +
      fld('Sale Number', sale.sale_number) +
      fld('Status', '<span class="status-badge status-' + sale.status + '">' + sale.status + '</span>') +
      fld('Date', (sale.created_at||'').slice(0,16).replace('T',' ')) +
      fld('Type', (sale.sale_type||'').replace(/_/g,' ')) +
      fld('Cashier', sale.cashier_name || '-') +
      fld('Customer', customer ? esc(customer.business_name || customer.contact_name || '-') : 'Walk-in') +
    '</div>';

    html += '<div><h4 style="font-size:13px;font-weight:700;color:var(--pos-navy);margin-bottom:6px">Items</h4>' +
      '<table class="pos-table"><thead><tr><th>Product</th><th class="right">Qty</th><th class="right">Price</th><th class="right">Total</th></tr></thead><tbody>';
    items.forEach(function(item) {
      html += '<tr><td>' + esc(item.product_name) + '<br><span style="font-size:11px;color:var(--pos-gray-400)">' + esc(item.sku||'') + '</span></td>' +
        '<td class="right">' + item.quantity + '</td><td class="right">$' + (item.unit_price||0).toFixed(2) + '</td>' +
        '<td class="right money">$' + (item.line_total||0).toFixed(2) + '</td></tr>';
    });
    html += '</tbody></table></div>';

    html += '<div><h4 style="font-size:13px;font-weight:700;color:var(--pos-navy);margin-bottom:6px">Payments</h4>';
    payments.forEach(function(p) {
      html += '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;border-bottom:1px solid var(--pos-gray-100)">' +
        '<span style="text-transform:capitalize">' + (p.method||'').replace(/_/g,' ') +
        (p.card_last4 ? ' ****' + p.card_last4 : '') + (p.check_number ? ' #' + p.check_number : '') + '</span>' +
        '<span style="font-weight:600">$' + (p.amount||0).toFixed(2) + '</span></div>';
    });
    html += '</div>';

    html += '<div style="background:var(--pos-gray-50);border-radius:8px;padding:12px">' +
      '<div style="display:flex;justify-content:space-between;font-size:13px"><span>Subtotal</span><span>$' + (sale.subtotal||0).toFixed(2) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:13px"><span>Tax</span><span>$' + (sale.tax_amount||0).toFixed(2) + '</span></div>';
    if (sale.discount_amount > 0) html += '<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--pos-red)"><span>Discount</span><span>-$' + sale.discount_amount.toFixed(2) + '</span></div>';
    html += '<div style="display:flex;justify-content:space-between;font-size:18px;font-weight:800;border-top:2px solid var(--pos-gray-200);margin-top:4px;padding-top:6px"><span>Total</span><span>$' + (sale.total||0).toFixed(2) + '</span></div>';
    if (sale.change_due > 0) html += '<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--pos-green)"><span>Change</span><span>$' + sale.change_due.toFixed(2) + '</span></div>';
    html += '</div>';

    if (sale.order_id) html += '<div style="background:#EFF6FF;border-radius:8px;padding:12px;font-size:13px;text-align:center;font-weight:600;color:var(--pos-navy)"><i class="fas fa-truck"></i> Delivery Order #' + sale.order_id + '</div>';
    html += '</div>';

    var footer = '';
    if (sale.status === 'completed') {
      footer += '<button class="pos-btn" style="background:var(--pos-purple);color:white;flex:1" id="posDetailRefundBtn"><i class="fas fa-rotate-left"></i> Refund</button>';
      footer += '<button class="pos-btn" style="background:var(--pos-red);color:white;flex:1" id="posDetailVoidBtn"><i class="fas fa-ban"></i> Void</button>';
    }
    footer += '<button class="pos-btn" style="background:var(--pos-gray-200);color:var(--pos-gray-700);flex:1" id="posDetailCloseBtn">Close</button>';

    showModal('Sale ' + sale.sale_number, html, footer);

    on('posDetailRefundBtn', 'click', function() { showRefundModal(sale.id); });
    on('posDetailVoidBtn', 'click', function() { voidSale(sale.id, false); closeModal(); });
    on('posDetailCloseBtn', 'click', closeModal);
  });
}

// ==================== MODAL HELPERS ====================
function showModal(title, bodyHtml, footerHtml) {
  closeModal();
  var overlay = document.createElement('div');
  overlay.className = 'pos-modal-overlay';
  overlay.id = 'posModalOverlay';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });
  overlay.innerHTML =
    '<div class="pos-modal">' +
      '<div class="pos-modal-header"><h3>' + title + '</h3><button class="pos-modal-close" id="posModalCloseX"><i class="fas fa-times"></i></button></div>' +
      '<div class="pos-modal-body">' + bodyHtml + '</div>' +
      (footerHtml ? '<div class="pos-modal-footer">' + footerHtml + '</div>' : '') +
    '</div>';
  document.body.appendChild(overlay);
  on('posModalCloseX', 'click', closeModal);
}

function closeModal() {
  var el = document.getElementById('posModalOverlay');
  if (el) el.remove();
}
// Keep global for any legacy references
window.closePosModal = closeModal;

// ==================== CUSTOMER MANAGEMENT VIEW ====================

function loadCustomerList(resetPage) {
  if (resetPage) _s.custPage = 1;
  var view = document.getElementById('posViewCustomers');
  if (!view) return;

  // Load tags + users once
  if (_s.custAllTags.length === 0) {
    API.get('/pos/customer-tags').then(function(r) { _s.custAllTags = r.data || []; renderCustFilters(); }).catch(function(){});
  }
  if (_s.custUsers.length === 0) {
    API.get('/pos/users').then(function(r) { _s.custUsers = r.data || []; }).catch(function(){});
  }

  var params = 'page=' + _s.custPage + '&limit=50';
  if (_s.custSearch) params += '&search=' + encodeURIComponent(_s.custSearch);
  if (_s.custTagFilter) params += '&tag=' + encodeURIComponent(_s.custTagFilter);
  if (_s.custTypeFilter) params += '&type=' + encodeURIComponent(_s.custTypeFilter);

  // Render shell first
  if (!document.getElementById('posCustListBody')) {
    view.innerHTML =
      '<div class="pos-cust-view-header">' +
        '<div class="pos-cust-view-title"><h2><i class="fas fa-address-book"></i> Customer Management</h2></div>' +
        '<div class="pos-cust-view-actions">' +
          '<button class="pos-btn" id="posCustMergeBtn" style="background:var(--pos-orange);color:white"><i class="fas fa-compress-arrows-alt"></i> Merge</button>' +
          '<button class="pos-btn pos-btn-add-cust" id="posCustAddBtn"><i class="fas fa-plus"></i> New Customer</button>' +
        '</div>' +
      '</div>' +
      '<div class="pos-cust-filters" id="posCustFilters">' +
        '<input type="text" id="posCustSearchInput" placeholder="Search name, phone, email..." value="' + esc(_s.custSearch) + '">' +
        '<select id="posCustTypeSelect"><option value="">All Types</option>' +
          '<option value="farm"' + (_s.custTypeFilter==='farm'?' selected':'') + '>Farm</option>' +
          '<option value="ranch"' + (_s.custTypeFilter==='ranch'?' selected':'') + '>Ranch</option>' +
          '<option value="retail"' + (_s.custTypeFilter==='retail'?' selected':'') + '>Retail</option>' +
          '<option value="equestrian"' + (_s.custTypeFilter==='equestrian'?' selected':'') + '>Equestrian</option>' +
          '<option value="other"' + (_s.custTypeFilter==='other'?' selected':'') + '>Other</option>' +
        '</select>' +
        '<select id="posCustTagSelect"><option value="">All Tags</option></select>' +
      '</div>' +
      '<div id="posCustListBody" class="pos-cust-list-body"><div class="pos-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div></div>' +
      '<div id="posCustPagination" class="pos-cust-pagination"></div>';

    on('posCustAddBtn', 'click', function() { openCustomerSheet(null); });
    on('posCustMergeBtn', 'click', function() {
      _s.mergeMode = !_s.mergeMode;
      _s.mergeTarget = null;
      var btn = document.getElementById('posCustMergeBtn');
      if (_s.mergeMode) {
        if (btn) { btn.style.background = 'var(--pos-red)'; btn.innerHTML = '<i class="fas fa-times"></i> Cancel Merge'; }
        toast('Select the PRIMARY customer (keep)', 'info');
      } else {
        if (btn) { btn.style.background = 'var(--pos-orange)'; btn.innerHTML = '<i class="fas fa-compress-arrows-alt"></i> Merge'; }
      }
      var banner = document.getElementById('posMergeBanner');
      if (banner) banner.style.display = _s.mergeMode ? '' : 'none';
    });
    var searchInput = document.getElementById('posCustSearchInput');
    if (searchInput) searchInput.addEventListener('input', function() {
      clearTimeout(_s.searchTimer);
      _s.searchTimer = setTimeout(function() { _s.custSearch = searchInput.value; loadCustomerList(true); }, 400);
    });
    on('posCustTypeSelect', 'change', function() { _s.custTypeFilter = gv('posCustTypeSelect'); loadCustomerList(true); });
    on('posCustTagSelect', 'change', function() { _s.custTagFilter = gv('posCustTagSelect'); loadCustomerList(true); });
    renderCustFilters();
  }

  var body = document.getElementById('posCustListBody');
  if (body) body.innerHTML = '<div class="pos-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

  API.get('/pos/customer-list?' + params).then(function(r) {
    var data = r.data;
    var custs = data.customers || [];
    if (custs.length === 0) {
      body.innerHTML = '<div class="pos-loading">No customers found</div>';
      document.getElementById('posCustPagination').innerHTML = '';
      return;
    }

    var html = '<table class="pos-table pos-cust-table"><thead><tr>' +
      '<th>Customer</th><th>Contact</th><th>Phone / Email</th>' +
      '<th>Type</th><th>Tags</th><th>Salesperson</th>' +
      '<th class="right">Orders</th><th class="right">Spent</th><th></th>' +
    '</tr></thead><tbody>';

    custs.forEach(function(c) {
      var tags = (c.tags || '').split(',').filter(function(t) { return t.trim(); }).map(function(t) {
        return '<span class="pos-cust-tag">' + esc(t.trim()) + '</span>';
      }).join(' ');

      html += '<tr class="clickable" data-cust-sheet="' + c.id + '">' +
        '<td><div class="pos-cust-list-name">' + esc(c.business_name || '-') + '</div>' +
          '<div class="pos-cust-list-sub">' + esc(c.location_name || '') + '</div></td>' +
        '<td>' + esc(c.contact_name || '-') + '</td>' +
        '<td><div>' + esc(c.phone || '-') + '</div><div class="pos-cust-list-sub">' + esc(c.email || '') + '</div></td>' +
        '<td><span class="pos-badge pos-badge-blue">' + esc(c.customer_type || '-') + '</span></td>' +
        '<td>' + (tags || '<span style="color:var(--pos-gray-400)">—</span>') + '</td>' +
        '<td>' + esc(c.salesperson_name || '-') + '</td>' +
        '<td class="right">' + ((c.order_count || 0) + (c.sale_count || 0)) + '</td>' +
        '<td class="right money">$' + (c.total_spent || 0).toFixed(2) + '</td>' +
        '<td><button class="pos-cust-edit-btn" data-cust-edit="' + c.id + '" title="Edit"><i class="fas fa-pen"></i></button></td>' +
      '</tr>';
    });
    html += '</tbody></table>';
    body.innerHTML = html;

    // Click row to open sheet or handle merge mode
    body.querySelectorAll('[data-cust-sheet]').forEach(function(row) {
      row.addEventListener('click', function(e) {
        if (e.target.closest('[data-cust-edit]')) return;
        var custId = parseInt(row.dataset.custSheet);
        if (_s.mergeMode) {
          if (!_s.mergeTarget) {
            _s.mergeTarget = custId;
            row.style.background = '#D1FAE5';
            toast('Primary selected. Now click the customer to MERGE INTO primary.', 'info');
          } else if (custId === _s.mergeTarget) {
            toast('Cannot merge customer into itself', 'error');
          } else {
            // Open merge confirmation
            openCustomerMerge(_s.mergeTarget);
            // Pre-fill the merge search with the second customer
            _s.mergeMode = false;
            _s.mergeTarget = null;
          }
          return;
        }
        openCustomerSheet(custId);
      });
    });
    body.querySelectorAll('[data-cust-edit]').forEach(function(btn) {
      btn.addEventListener('click', function() { openCustomerSheet(parseInt(btn.dataset.custEdit)); });
    });

    // Pagination
    var pag = document.getElementById('posCustPagination');
    if (pag && data.pages > 1) {
      var ph = '';
      for (var p = 1; p <= data.pages; p++) {
        ph += '<button class="pos-cust-page-btn' + (p === data.page ? ' active' : '') + '" data-page="' + p + '">' + p + '</button>';
      }
      pag.innerHTML = '<span class="pos-cust-page-info">' + data.total + ' customers</span>' + ph;
      pag.querySelectorAll('[data-page]').forEach(function(btn) {
        btn.addEventListener('click', function() { _s.custPage = parseInt(btn.dataset.page); loadCustomerList(); });
      });
    } else if (pag) {
      pag.innerHTML = '<span class="pos-cust-page-info">' + data.total + ' customers</span>';
    }
  }).catch(function(err) {
    if (body) body.innerHTML = '<div class="pos-loading" style="color:var(--pos-red)">Error loading customers: ' + errMsg(err) + '</div>';
  });
}

function renderCustFilters() {
  var sel = document.getElementById('posCustTagSelect');
  if (!sel) return;
  var val = _s.custTagFilter;
  var html = '<option value="">All Tags</option>';
  _s.custAllTags.forEach(function(t) {
    html += '<option value="' + esc(t) + '"' + (val === t ? ' selected' : '') + '>' + esc(t) + '</option>';
  });
  sel.innerHTML = html;
}

// ==================== CUSTOMER SHEET (full detail / edit modal) ====================
function openCustomerSheet(id) {
  // Remove any existing sheet
  var old = document.getElementById('posCustSheetOverlay');
  if (old) old.remove();

  if (!id) {
    // New customer — blank form
    renderCustomerSheet({
      id: null, business_name: '', contact_name: '', phone: '', email: '',
      customer_type: 'other', notes: '', tax_exempt: 0, sponsor_discount: 0,
      priority_rank: 0, location_id: null, tags: '', salesperson_id: null, salesperson_name: ''
    }, [], [], [], {}, {});
    return;
  }

  // Load full customer data
  API.get('/pos/customers/' + id).then(function(r) {
    var c = r.data.customer;
    var addrs = r.data.addresses || [];
    var orders = r.data.recentOrders || [];
    var sales = r.data.recentSales || [];
    var rules = r.data.priceRules || [];
    var acct = r.data.account || {};
    var extra = {
      standingOrders: r.data.standingOrders || [],
      lastDelivery: r.data.lastDelivery || null,
      deliveryZone: r.data.deliveryZone || null,
      crmOrg: r.data.crmOrg || null
    };
    renderCustomerSheet(c, addrs, orders.concat(sales).sort(function(a, b) {
      return (b.created_at || '').localeCompare(a.created_at || '');
    }), rules, acct, extra);
  }).catch(function(err) { toast('Failed to load customer: ' + errMsg(err), 'error'); });
}

function renderCustomerSheet(c, addrs, history, rules, acct, extra) {
  extra = extra || {};
  var isNew = !c.id;
  var locOpts = '<option value="">None</option>';
  _s.locations.forEach(function(l) {
    locOpts += '<option value="' + l.id + '"' + (c.location_id == l.id ? ' selected' : '') + '>' + esc(l.name) + '</option>';
  });
  var spOpts = '<option value="">None</option>';
  _s.custUsers.forEach(function(u) {
    spOpts += '<option value="' + u.id + '"' + (c.salesperson_id == u.id ? ' selected' : '') + '>' + esc(u.name) + ' (' + u.role + ')</option>';
  });
  var typeOpts = ['farm','ranch','retail','equestrian','other'].map(function(t) {
    return '<option value="' + t + '"' + (c.customer_type === t ? ' selected' : '') + '>' + t.charAt(0).toUpperCase() + t.slice(1) + '</option>';
  }).join('');

  // Build quick-info summary card (for existing customers)
  var summaryCard = '';
  if (!isNew) {
    var bal = (acct && acct.balance) ? acct.balance : 0;
    var limit = (acct && acct.credit_limit) ? acct.credit_limit : 0;
    var balColor = (limit > 0 && bal >= limit) ? '#EF4444' : '#10B981';
    var lastDel = extra.lastDelivery;
    var zone = extra.deliveryZone;
    var standing = extra.standingOrders || [];
    var totalHistory = (history || []).length;

    summaryCard = '<div class="pos-cust-summary-card">' +
      '<div class="pos-cust-summary-items">' +
        '<div class="pos-cust-summary-item">' +
          '<div class="pos-cust-summary-icon" style="background:#EFF6FF;color:#3B82F6"><i class="fas fa-credit-card"></i></div>' +
          '<div><div class="pos-cust-summary-label">Balance</div><div class="pos-cust-summary-value" style="color:' + balColor + '">$' + bal.toFixed(2) + (limit > 0 ? ' / $' + limit.toFixed(2) : '') + '</div></div>' +
        '</div>' +
        '<div class="pos-cust-summary-item">' +
          '<div class="pos-cust-summary-icon" style="background:#F0FDF4;color:#22C55E"><i class="fas fa-truck"></i></div>' +
          '<div><div class="pos-cust-summary-label">Last Delivery</div><div class="pos-cust-summary-value">' + (lastDel ? (lastDel.scheduled_date || lastDel.created_at || '').slice(0, 10) : '<span style="color:#9CA3AF">None</span>') + '</div></div>' +
        '</div>' +
        '<div class="pos-cust-summary-item">' +
          '<div class="pos-cust-summary-icon" style="background:#FEF3C7;color:#D97706"><i class="fas fa-redo"></i></div>' +
          '<div><div class="pos-cust-summary-label">Standing Orders</div><div class="pos-cust-summary-value">' + (standing.length > 0 ? '<span style="color:#16A34A">' + standing.length + ' active</span>' : '<span style="color:#9CA3AF">None</span>') + '</div></div>' +
        '</div>' +
        '<div class="pos-cust-summary-item">' +
          '<div class="pos-cust-summary-icon" style="background:#FDF2F8;color:#EC4899"><i class="fas fa-receipt"></i></div>' +
          '<div><div class="pos-cust-summary-label">Recent Orders</div><div class="pos-cust-summary-value">' + totalHistory + '</div></div>' +
        '</div>' +
      '</div>' +
      (zone ? '<div class="pos-cust-summary-zone"><i class="fas fa-map-marker-alt"></i> Zone: <span style="background:' + esc(zone.color || '#6366F1') + ';color:white;padding:1px 8px;border-radius:10px;font-size:11px">' + esc(zone.name) + '</span>' + (zone.delivery_days ? ' &middot; ' + esc(zone.delivery_days) : '') + '</div>' : '') +
      (c.is_seasonal ? '<div class="pos-cust-summary-zone"><i class="fas fa-calendar-alt"></i> Seasonal: <span class="pos-badge ' + (c.season_status === 'in_season' ? 'pos-badge-green' : c.season_status === 'out_of_season' ? 'pos-badge-red' : 'pos-badge-orange') + '">' + esc(c.season_status || 'unknown') + '</span></div>' : '') +
    '</div>';
  }

  var hasStanding = !isNew && (extra.standingOrders || []).length > 0;

  var html = '<div class="pos-modal-overlay" id="posCustSheetOverlay">' +
    '<div class="pos-cust-sheet">' +
      '<div class="pos-cust-sheet-header">' +
        '<h3><i class="fas fa-' + (isNew ? 'user-plus' : 'user-edit') + '"></i> ' + (isNew ? 'New Customer' : esc(c.business_name || c.contact_name)) + '</h3>' +
        '<button class="pos-modal-close" id="posCustSheetClose"><i class="fas fa-times"></i></button>' +
      '</div>' +
      summaryCard +
      '<div class="pos-cust-sheet-body">' +
        '<div class="pos-cust-sheet-tabs">' +
          '<button class="pos-cust-tab active" data-tab="details"><i class="fas fa-id-card"></i> <span class="hide-mobile">Details</span></button>' +
          '<button class="pos-cust-tab" data-tab="addresses"><i class="fas fa-map-marker-alt"></i> <span class="hide-mobile">Addresses</span>' + (addrs && addrs.length ? ' (' + addrs.length + ')' : '') + '</button>' +
          (isNew ? '' : '<button class="pos-cust-tab" data-tab="delivery"><i class="fas fa-truck"></i> <span class="hide-mobile">Delivery</span></button>') +
          (isNew ? '' : '<button class="pos-cust-tab" data-tab="discounts"><i class="fas fa-tags"></i> <span class="hide-mobile">Discounts</span></button>') +
          (isNew ? '' : '<button class="pos-cust-tab" data-tab="history"><i class="fas fa-receipt"></i> <span class="hide-mobile">Orders</span></button>') +
          (isNew ? '' : '<button class="pos-cust-tab" data-tab="account"><i class="fas fa-credit-card"></i> <span class="hide-mobile">Account</span></button>') +
          (isNew ? '' : '<button class="pos-cust-tab" data-tab="crm"><i class="fas fa-link"></i> <span class="hide-mobile">CRM</span></button>') +
        '</div>' +

        // === DETAILS TAB ===
        '<div class="pos-cust-tab-content active" data-content="details">' +
          '<div class="pos-cust-form-grid">' +
            '<div class="pos-cust-form-group full">' +
              '<label>Business Name *</label>' +
              '<input type="text" id="posCustBizName" value="' + esc(c.business_name || '') + '" placeholder="Business or farm name">' +
            '</div>' +
            '<div class="pos-cust-form-group">' +
              '<label>Contact Name</label>' +
              '<input type="text" id="posCustContactName" value="' + esc(c.contact_name || '') + '" placeholder="Contact person">' +
            '</div>' +
            '<div class="pos-cust-form-group">' +
              '<label>Phone</label>' +
              '<input type="tel" id="posCustPhone" value="' + esc(c.phone || '') + '" placeholder="(555) 123-4567">' +
            '</div>' +
            '<div class="pos-cust-form-group">' +
              '<label>Email</label>' +
              '<input type="email" id="posCustEmail" value="' + esc(c.email || '') + '" placeholder="email@example.com">' +
            '</div>' +
            '<div class="pos-cust-form-group">' +
              '<label>Customer Type</label>' +
              '<select id="posCustType">' + typeOpts + '</select>' +
            '</div>' +
            '<div class="pos-cust-form-group">' +
              '<label>Location</label>' +
              '<select id="posCustLocation">' + locOpts + '</select>' +
            '</div>' +
            '<div class="pos-cust-form-group">' +
              '<label>Salesperson</label>' +
              '<select id="posCustSalesperson">' + spOpts + '</select>' +
            '</div>' +
            '<div class="pos-cust-form-group">' +
              '<label>Priority Rank</label>' +
              '<select id="posCustPriority">' +
                '<option value="0"' + (!c.priority_rank ? ' selected' : '') + '>Normal</option>' +
                '<option value="1"' + (c.priority_rank==1 ? ' selected' : '') + '>1 — VIP</option>' +
                '<option value="2"' + (c.priority_rank==2 ? ' selected' : '') + '>2 — High</option>' +
                '<option value="3"' + (c.priority_rank==3 ? ' selected' : '') + '>3 — Low</option>' +
              '</select>' +
            '</div>' +
            '<div class="pos-cust-form-group">' +
              '<label>Sponsor Discount %</label>' +
              '<input type="number" id="posCustDiscount" value="' + (c.sponsor_discount || 0) + '" min="0" max="100" step="0.5">' +
            '</div>' +
            '<div class="pos-cust-form-group">' +
              '<label>Fixed Discount $</label>' +
              '<input type="number" id="posCustDiscFixed" value="' + (c.discount_fixed || 0) + '" min="0" step="0.01" placeholder="e.g. 5.00 off every order">' +
            '</div>' +
            '<div class="pos-cust-form-group">' +
              '<label>Tax Exempt</label>' +
              '<label class="pos-cust-toggle"><input type="checkbox" id="posCustTaxExempt"' + (c.tax_exempt ? ' checked' : '') + '> <span>Tax Exempt</span></label>' +
            '</div>' +
            '<div class="pos-cust-form-group">' +
              '<label>SMS Opt-In</label>' +
              '<label class="pos-cust-toggle"><input type="checkbox" id="posCustSmsOptIn"' + (c.sms_opt_in ? ' checked' : '') + '> <span>SMS Opt-In</span></label>' +
            '</div>' +
            '<div class="pos-cust-form-group full">' +
              '<label>SMS Phone <span style="font-weight:400;color:var(--pos-gray-400)">(if different from main)</span></label>' +
              '<input type="tel" id="posCustSmsPhone" value="' + esc(c.sms_phone || '') + '" placeholder="Leave blank to use main phone">' +
            '</div>' +
            '<div class="pos-cust-form-group full">' +
              '<label>Tags <span style="font-weight:400;color:var(--pos-gray-400)">(comma separated)</span></label>' +
              '<div class="pos-cust-tags-input-wrap">' +
                '<input type="text" id="posCustTags" value="' + esc(c.tags || '') + '" placeholder="e.g. wholesale, vip, seasonal">' +
                '<div class="pos-cust-tags-suggestions" id="posCustTagSuggestions"></div>' +
              '</div>' +
            '</div>' +
            '<div class="pos-cust-form-group full">' +
              '<label>Notes</label>' +
              '<textarea id="posCustNotes" rows="3" placeholder="Internal notes about this customer...">' + esc(c.notes || '') + '</textarea>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // === ADDRESSES TAB ===
        '<div class="pos-cust-tab-content" data-content="addresses">' +
          '<div class="pos-cust-addr-header">' +
            '<strong>Delivery Addresses</strong>' +
            '<button class="pos-btn pos-btn-sm" id="posCustAddAddr"><i class="fas fa-plus"></i> Add Address</button>' +
          '</div>' +
          '<div id="posCustAddrList">' + renderAddrList(addrs, c.id) + '</div>' +
        '</div>' +

        // === DELIVERY TAB (standing orders, delivery prefs, seasonality) ===
        (isNew ? '' :
        '<div class="pos-cust-tab-content" data-content="delivery">' +
          // Standing Orders section
          (function() {
            var so = extra.standingOrders || [];
            var html = '<div class="pos-cust-section"><h4><i class="fas fa-redo"></i> Standing Orders</h4>';
            if (so.length === 0) {
              html += '<div style="padding:12px;color:var(--pos-gray-400);font-size:13px">No active standing orders. Set up recurring schedules in the Logistics module.</div>';
            } else {
              so.forEach(function(s) {
                html += '<div class="pos-cust-standing-card">' +
                  '<div class="pos-cust-standing-header">' +
                    '<span><i class="fas fa-clipboard-list"></i> Schedule #' + s.id + '</span>' +
                    '<span class="pos-badge pos-badge-green">' + esc(s.status) + '</span>' +
                  '</div>' +
                  (s.zone_name ? '<div style="font-size:12px;color:var(--pos-gray-500);margin-bottom:4px"><i class="fas fa-map-marker-alt"></i> ' + esc(s.zone_name) + (s.zone_delivery_days ? ' (' + esc(s.zone_delivery_days) + ')' : '') + '</div>' : '') +
                  (s.address_label ? '<div style="font-size:12px;color:var(--pos-gray-500);margin-bottom:6px"><i class="fas fa-home"></i> ' + esc(s.address_label) + (s.address_street ? ' — ' + esc(s.address_street) + ', ' + esc(s.address_city || '') : '') + '</div>' : '') +
                  '<div style="font-size:12px;margin-bottom:4px;color:var(--pos-gray-500)">Confirm: <strong>' + esc(s.confirm_mode || 'sms') + '</strong>' + (s.auto_confirm ? ' (auto)' : '') + '</div>';
                if (s.items && s.items.length > 0) {
                  html += '<table class="pos-table" style="font-size:12px;margin-top:6px"><thead><tr><th>Product</th><th>Qty</th><th>Unit</th></tr></thead><tbody>';
                  s.items.forEach(function(item) {
                    html += '<tr><td>' + esc(item.product_name) + '</td><td>' + item.quantity + '</td><td>' + esc(item.unit_type || 'bag') + '</td></tr>';
                  });
                  html += '</tbody></table>';
                }
                html += '</div>';
              });
            }
            html += '</div>';

            // Delivery Preferences
            html += '<div class="pos-cust-section" style="margin-top:16px"><h4><i class="fas fa-clipboard-check"></i> Delivery Preferences</h4>' +
              '<div class="pos-cust-form-grid">' +
                '<div class="pos-cust-form-group full">' +
                  '<label>Default Delivery Instructions</label>' +
                  '<textarea id="posCustDeliveryNotes" rows="3" placeholder="e.g. Leave at gate, call before delivery...">' + esc(c.delivery_notes_default || '') + '</textarea>' +
                '</div>' +
              '</div>' +
            '</div>';

            // Seasonality
            html += '<div class="pos-cust-section" style="margin-top:16px"><h4><i class="fas fa-calendar-alt"></i> Seasonality</h4>' +
              '<div class="pos-cust-form-grid">' +
                '<div class="pos-cust-form-group">' +
                  '<label>Seasonal Customer</label>' +
                  '<label class="pos-cust-toggle"><input type="checkbox" id="posCustSeasonal"' + (c.is_seasonal ? ' checked' : '') + '> <span>Seasonal</span></label>' +
                '</div>' +
                '<div class="pos-cust-form-group">' +
                  '<label>Season Status</label>' +
                  '<select id="posCustSeasonStatus">' +
                    '<option value="unknown"' + ((c.season_status||'unknown')==='unknown'?' selected':'') + '>Unknown</option>' +
                    '<option value="in_season"' + (c.season_status==='in_season'?' selected':'') + '>In Season</option>' +
                    '<option value="out_of_season"' + (c.season_status==='out_of_season'?' selected':'') + '>Out of Season</option>' +
                    '<option value="arriving_soon"' + (c.season_status==='arriving_soon'?' selected':'') + '>Arriving Soon</option>' +
                    '<option value="departing_soon"' + (c.season_status==='departing_soon'?' selected':'') + '>Departing Soon</option>' +
                  '</select>' +
                '</div>' +
                '<div class="pos-cust-form-group">' +
                  '<label>Season Start</label>' +
                  '<div style="display:flex;gap:6px">' +
                    '<select id="posCustSeasonStartMonth" style="flex:1">' +
                      '<option value="">Month</option>' +
                      ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(function(m,i) {
                        return '<option value="' + (i+1) + '"' + (c.season_start_month==(i+1)?' selected':'') + '>' + m + '</option>';
                      }).join('') +
                    '</select>' +
                    '<input type="number" id="posCustSeasonStartDay" min="1" max="31" value="' + (c.season_start_day || '') + '" placeholder="Day" style="width:60px">' +
                  '</div>' +
                '</div>' +
                '<div class="pos-cust-form-group">' +
                  '<label>Season End</label>' +
                  '<div style="display:flex;gap:6px">' +
                    '<select id="posCustSeasonEndMonth" style="flex:1">' +
                      '<option value="">Month</option>' +
                      ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(function(m,i) {
                        return '<option value="' + (i+1) + '"' + (c.season_end_month==(i+1)?' selected':'') + '>' + m + '</option>';
                      }).join('') +
                    '</select>' +
                    '<input type="number" id="posCustSeasonEndDay" min="1" max="31" value="' + (c.season_end_day || '') + '" placeholder="Day" style="width:60px">' +
                  '</div>' +
                '</div>' +
                '<div class="pos-cust-form-group full">' +
                  '<label>Season Notes</label>' +
                  '<textarea id="posCustSeasonNotes" rows="2" placeholder="e.g. Snowbird, arrives October...">' + esc(c.season_notes || '') + '</textarea>' +
                '</div>' +
              '</div>' +
            '</div>';

            // Last delivery info
            if (extra.lastDelivery) {
              var ld = extra.lastDelivery;
              html += '<div class="pos-cust-section" style="margin-top:16px"><h4><i class="fas fa-truck"></i> Last Delivery</h4>' +
                '<div style="font-size:13px;padding:8px 0">' +
                  '<strong>' + esc(ld.order_number || 'Order') + '</strong> — ' + esc(ld.status) +
                  '<br>Date: ' + esc((ld.scheduled_date || ld.created_at || '').slice(0, 10)) +
                  (ld.actual_arrival ? '<br>Arrived: ' + esc(ld.actual_arrival.slice(0, 16).replace('T', ' ')) : '') +
                  (ld.delivery_photo_url ? '<br><a href="' + esc(ld.delivery_photo_url) + '" target="_blank" style="color:var(--pos-navy)"><i class="fas fa-camera"></i> Delivery Photo</a>' : '') +
                '</div></div>';
            }

            return html;
          })() +
        '</div>') +

        // === DISCOUNTS TAB (pricing rules) ===
        (isNew ? '' :
        '<div class="pos-cust-tab-content" data-content="discounts">' +
          '<div class="pos-cust-section">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
              '<h4><i class="fas fa-tags"></i> Pricing Rules</h4>' +
              '<button class="pos-btn pos-btn-sm" id="posCustAddDiscRule"><i class="fas fa-plus"></i> Add Rule</button>' +
            '</div>' +
            '<div id="posCustDiscountList"><div class="pos-loading"><i class="fas fa-spinner fa-spin"></i></div></div>' +
          '</div>' +
        '</div>') +

        // === HISTORY TAB (orders/sales) ===
        (isNew ? '' :
        '<div class="pos-cust-tab-content" data-content="history">' +
          renderCustHistory(history, rules) +
        '</div>') +

        // === ACCOUNT TAB ===
        (isNew ? '' :
        '<div class="pos-cust-tab-content" data-content="account">' +
          renderCustAccount(acct || {}) +
        '</div>') +

        // === CRM TAB ===
        (isNew ? '' :
        '<div class="pos-cust-tab-content" data-content="crm">' +
          '<div id="posCustCRMTabContent"><div class="pos-loading"><i class="fas fa-spinner fa-spin"></i> Loading CRM data...</div></div>' +
        '</div>') +

      '</div>' +
      '<div class="pos-cust-sheet-footer">' +
        (isNew ? '' : '<button class="pos-btn pos-cust-delete-btn" id="posCustDeleteBtn"><i class="fas fa-trash"></i> Deactivate</button>') +
        '<div style="flex:1"></div>' +
        '<button class="pos-btn pos-btn-hold" id="posCustCancelBtn">Cancel</button>' +
        '<button class="pos-btn pos-btn-pay" id="posCustSaveBtn"><i class="fas fa-save"></i> ' + (isNew ? 'Create Customer' : 'Save Changes') + '</button>' +
      '</div>' +
    '</div>' +
  '</div>';

  document.body.insertAdjacentHTML('beforeend', html);

  // Tab switching
  document.querySelectorAll('.pos-cust-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.pos-cust-tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.pos-cust-tab-content').forEach(function(tc) { tc.classList.remove('active'); });
      tab.classList.add('active');
      var content = document.querySelector('[data-content="' + tab.dataset.tab + '"]');
      if (content) content.classList.add('active');
    });
  });

  // Tag suggestions
  var tagsInput = document.getElementById('posCustTags');
  if (tagsInput) tagsInput.addEventListener('focus', function() { showTagSuggestions(); });
  if (tagsInput) tagsInput.addEventListener('input', function() { showTagSuggestions(); });
  document.addEventListener('click', function hideTagSugg(e) {
    if (!e.target.closest('.pos-cust-tags-input-wrap')) {
      var sg = document.getElementById('posCustTagSuggestions');
      if (sg) sg.style.display = 'none';
    }
  });

  // Close
  on('posCustSheetClose', 'click', closeCustomerSheet);
  on('posCustCancelBtn', 'click', closeCustomerSheet);
  document.getElementById('posCustSheetOverlay').addEventListener('click', function(e) {
    if (e.target === this) closeCustomerSheet();
  });

  // Save
  on('posCustSaveBtn', 'click', function() { saveCustomer(c.id); });

  // Delete
  if (!isNew) {
    on('posCustDeleteBtn', 'click', function() {
      if (!confirm('Deactivate ' + (c.business_name || c.contact_name) + '? This will hide them from active lists.')) return;
      API.delete('/pos/customer-manage/' + c.id).then(function() {
        toast('Customer deactivated');
        closeCustomerSheet();
        loadCustomerList();
      }).catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
    });
  }

  // Add address button
  if (c.id) {
    on('posCustAddAddr', 'click', function() { openAddressForm(c.id, null); });
  } else {
    on('posCustAddAddr', 'click', function() { toast('Save the customer first, then add addresses', 'error'); });
  }

  // Wire address edit/delete buttons
  wireAddrButtons(c.id);

  // Wire discounts tab
  if (c.id) {
    on('posCustAddDiscRule', 'click', function() { openDiscountRuleForm(c.id, null); });
    // Load discounts when tab is opened
    document.querySelectorAll('.pos-cust-tab').forEach(function(tab) {
      if (tab.dataset.tab === 'discounts') {
        tab.addEventListener('click', function() { renderCustDiscounts(c.id); });
      }
    });
    // Load CRM data when tab clicked
    document.querySelectorAll('.pos-cust-tab').forEach(function(tab) {
      if (tab.dataset.tab === 'crm') {
        tab.addEventListener('click', function() { loadCRMTabContent(c.id); });
      }
    });

    // Also add merge button to sheet header
    var sheetHeader = document.querySelector('.pos-cust-sheet-header h3');
    if (sheetHeader && c.id) {
      var mergeBtn = document.createElement('button');
      mergeBtn.className = 'pos-btn pos-btn-sm';
      mergeBtn.style.cssText = 'margin-left:12px;background:var(--pos-orange);color:white;font-size:11px';
      mergeBtn.innerHTML = '<i class="fas fa-compress-arrows-alt"></i> Merge';
      mergeBtn.addEventListener('click', function() { openCustomerMerge(c.id); });
      sheetHeader.appendChild(mergeBtn);
    }
  }
}

function showTagSuggestions() {
  var input = document.getElementById('posCustTags');
  var sg = document.getElementById('posCustTagSuggestions');
  if (!input || !sg) return;

  var current = input.value.split(',').map(function(t) { return t.trim().toLowerCase(); });
  var lastPart = current[current.length - 1] || '';
  var available = _s.custAllTags.filter(function(t) {
    return !current.includes(t.toLowerCase()) && t.toLowerCase().indexOf(lastPart) >= 0;
  });

  if (available.length === 0) { sg.style.display = 'none'; return; }

  sg.style.display = 'block';
  sg.innerHTML = available.map(function(t) {
    return '<div class="pos-cust-tag-sug" data-tag="' + escAttr(t) + '">' + esc(t) + '</div>';
  }).join('');

  sg.querySelectorAll('.pos-cust-tag-sug').forEach(function(el) {
    el.addEventListener('click', function() {
      var parts = input.value.split(',').map(function(t) { return t.trim(); }).filter(function(t) { return t; });
      parts[parts.length - 1] = el.dataset.tag;
      input.value = parts.join(', ') + ', ';
      input.focus();
      sg.style.display = 'none';
    });
  });
}

function saveCustomer(id) {
  var sp = document.getElementById('posCustSalesperson');
  var spName = '';
  if (sp && sp.selectedIndex > 0) spName = sp.options[sp.selectedIndex].text.split(' (')[0];

  var body = {
    business_name: gv('posCustBizName'),
    contact_name: gv('posCustContactName'),
    phone: gv('posCustPhone'),
    email: gv('posCustEmail'),
    customer_type: gv('posCustType'),
    location_id: gv('posCustLocation') ? parseInt(gv('posCustLocation')) : null,
    salesperson_id: gv('posCustSalesperson') ? parseInt(gv('posCustSalesperson')) : null,
    salesperson_name: spName,
    priority_rank: parseInt(gv('posCustPriority') || '0'),
    sponsor_discount: parseFloat(gv('posCustDiscount') || '0'),
    discount_fixed: parseFloat(gv('posCustDiscFixed') || '0'),
    tax_exempt: document.getElementById('posCustTaxExempt') && document.getElementById('posCustTaxExempt').checked ? 1 : 0,
    sms_opt_in: document.getElementById('posCustSmsOptIn') && document.getElementById('posCustSmsOptIn').checked ? 1 : 0,
    sms_phone: gv('posCustSmsPhone') || null,
    tags: gv('posCustTags'),
    notes: gv('posCustNotes'),
    delivery_notes_default: gv('posCustDeliveryNotes') || null,
    is_seasonal: document.getElementById('posCustSeasonal') && document.getElementById('posCustSeasonal').checked ? 1 : 0,
    season_status: gv('posCustSeasonStatus') || 'unknown',
    season_start_month: gv('posCustSeasonStartMonth') ? parseInt(gv('posCustSeasonStartMonth')) : null,
    season_start_day: gv('posCustSeasonStartDay') ? parseInt(gv('posCustSeasonStartDay')) : null,
    season_end_month: gv('posCustSeasonEndMonth') ? parseInt(gv('posCustSeasonEndMonth')) : null,
    season_end_day: gv('posCustSeasonEndDay') ? parseInt(gv('posCustSeasonEndDay')) : null,
    season_notes: gv('posCustSeasonNotes') || null
  };

  if (!body.business_name && !body.contact_name) {
    toast('Business name or contact name required', 'error');
    return;
  }

  var req = id ? API.put('/pos/customer-manage/' + id, body) : API.post('/pos/customer-manage', body);
  req.then(function(r) {
    toast(id ? 'Customer updated' : 'Customer created');
    if (!id && r.data.id) {
      // Re-open the sheet for the new customer so they can add addresses
      closeCustomerSheet();
      openCustomerSheet(r.data.id);
    } else {
      closeCustomerSheet();
    }
    // Refresh the customer in register if they're the selected customer
    if (id && _s.customer && _s.customer.id === id) {
      selectCustomer(id);
    }
    loadCustomerList();
    // Refresh tags
    API.get('/pos/customer-tags').then(function(r2) { _s.custAllTags = r2.data || []; }).catch(function(){});
  }).catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
}

function closeCustomerSheet() {
  var overlay = document.getElementById('posCustSheetOverlay');
  if (overlay) overlay.remove();
}

// ==================== ADDRESS LIST / FORM ====================
function renderAddrList(addrs, custId) {
  if (!addrs || addrs.length === 0) {
    return '<div class="pos-cust-addr-empty"><i class="fas fa-map-marker-alt"></i><p>No addresses yet</p></div>';
  }
  var html = '';
  addrs.forEach(function(a) {
    html += '<div class="pos-cust-addr-card">' +
      '<div class="pos-cust-addr-main">' +
        (a.label ? '<div class="pos-cust-addr-label">' + esc(a.label) + (a.is_primary ? ' <span class="pos-badge pos-badge-green">Primary</span>' : '') + '</div>' : '') +
        '<div class="pos-cust-addr-street">' + esc(a.street || '') + '</div>' +
        '<div class="pos-cust-addr-city">' + esc((a.city || '') + (a.state ? ', ' + a.state : '') + ' ' + (a.zip || '')) + '</div>' +
        (a.gate_code ? '<div class="pos-cust-addr-meta"><i class="fas fa-key"></i> Gate: ' + esc(a.gate_code) + '</div>' : '') +
        (a.driver_notes ? '<div class="pos-cust-addr-meta"><i class="fas fa-sticky-note"></i> ' + esc(a.driver_notes) + '</div>' : '') +
      '</div>' +
      '<div class="pos-cust-addr-actions">' +
        '<button class="pos-cust-addr-btn" data-addr-edit="' + a.id + '" title="Edit"><i class="fas fa-pen"></i></button>' +
        '<button class="pos-cust-addr-btn danger" data-addr-del="' + a.id + '" title="Delete"><i class="fas fa-trash"></i></button>' +
      '</div>' +
    '</div>';
  });
  return html;
}

function wireAddrButtons(custId) {
  var list = document.getElementById('posCustAddrList');
  if (!list) return;
  list.querySelectorAll('[data-addr-edit]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var addrId = parseInt(btn.dataset.addrEdit);
      API.get('/pos/customer-addresses/' + custId).then(function(r) {
        var addr = (r.data || []).find(function(a) { return a.id === addrId; });
        if (addr) openAddressForm(custId, addr);
      });
    });
  });
  list.querySelectorAll('[data-addr-del]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (!confirm('Delete this address?')) return;
      API.delete('/pos/customer-addresses/' + custId + '/' + btn.dataset.addrDel).then(function() {
        toast('Address deleted');
        refreshAddrList(custId);
      }).catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
    });
  });
}

function refreshAddrList(custId) {
  API.get('/pos/customer-addresses/' + custId).then(function(r) {
    var list = document.getElementById('posCustAddrList');
    if (list) { list.innerHTML = renderAddrList(r.data || [], custId); wireAddrButtons(custId); }
  });
}

function openAddressForm(custId, addr) {
  var isEdit = !!addr;
  var a = addr || { label: '', street: '', city: '', state: 'FL', zip: '', gate_code: '', driver_notes: '', is_primary: 0 };

  var formHtml = '<div class="pos-cust-addr-form" id="posCustAddrForm">' +
    '<h4>' + (isEdit ? 'Edit Address' : 'New Address') + '</h4>' +
    '<div class="pos-cust-form-grid">' +
      '<div class="pos-cust-form-group">' +
        '<label>Label</label><input type="text" id="posAddrLabel" value="' + esc(a.label) + '" placeholder="e.g. Home, Barn, Office">' +
      '</div>' +
      '<div class="pos-cust-form-group">' +
        '<label><input type="checkbox" id="posAddrPrimary"' + (a.is_primary ? ' checked' : '') + '> Primary Address</label>' +
      '</div>' +
      '<div class="pos-cust-form-group full">' +
        '<label>Street</label><input type="text" id="posAddrStreet" value="' + esc(a.street) + '" placeholder="123 Main St">' +
      '</div>' +
      '<div class="pos-cust-form-group">' +
        '<label>City</label><input type="text" id="posAddrCity" value="' + esc(a.city) + '" placeholder="City">' +
      '</div>' +
      '<div class="pos-cust-form-group">' +
        '<label>State</label><input type="text" id="posAddrState" value="' + esc(a.state) + '" placeholder="FL" maxlength="2">' +
      '</div>' +
      '<div class="pos-cust-form-group">' +
        '<label>Zip</label><input type="text" id="posAddrZip" value="' + esc(a.zip) + '" placeholder="33470">' +
      '</div>' +
      '<div class="pos-cust-form-group">' +
        '<label>Gate Code</label><input type="text" id="posAddrGate" value="' + esc(a.gate_code) + '" placeholder="Gate code">' +
      '</div>' +
      '<div class="pos-cust-form-group full">' +
        '<label>Driver Notes</label><textarea id="posAddrNotes" rows="2" placeholder="Delivery instructions...">' + esc(a.driver_notes) + '</textarea>' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:12px">' +
      '<button class="pos-btn pos-btn-hold" id="posAddrCancelBtn">Cancel</button>' +
      '<button class="pos-btn pos-btn-pay" id="posAddrSaveBtn"><i class="fas fa-save"></i> ' + (isEdit ? 'Update' : 'Add') + '</button>' +
    '</div>' +
  '</div>';

  var list = document.getElementById('posCustAddrList');
  if (list) {
    var existing = document.getElementById('posCustAddrForm');
    if (existing) existing.remove();
    list.insertAdjacentHTML('afterbegin', formHtml);
  }

  on('posAddrCancelBtn', 'click', function() {
    var f = document.getElementById('posCustAddrForm');
    if (f) f.remove();
  });

  on('posAddrSaveBtn', 'click', function() {
    var body = {
      label: gv('posAddrLabel'),
      street: gv('posAddrStreet'),
      city: gv('posAddrCity'),
      state: gv('posAddrState'),
      zip: gv('posAddrZip'),
      gate_code: gv('posAddrGate'),
      driver_notes: gv('posAddrNotes'),
      is_primary: document.getElementById('posAddrPrimary') && document.getElementById('posAddrPrimary').checked ? 1 : 0
    };

    if (!body.street) { toast('Street address required', 'error'); return; }

    var req = isEdit
      ? API.put('/pos/customer-addresses/' + custId + '/' + addr.id, body)
      : API.post('/pos/customer-addresses/' + custId, body);

    req.then(function() {
      toast(isEdit ? 'Address updated' : 'Address added');
      refreshAddrList(custId);
    }).catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
  });
}

// ==================== CUSTOMER MERGE (sheet-level) ====================
function openCustomerMerge(keepId) {
  var html = '<div class="pos-merge-form">' +
    '<p style="font-size:13px;color:var(--pos-gray-600);margin:0 0 12px 0">Search for the customer to merge <strong>into</strong> this one. All orders, sales, addresses, and account data will be moved to this customer. The merged customer will be deactivated.</p>' +
    '<input type="text" id="posMergeSearch" placeholder="Search customer to merge..." class="pos-customer-search">' +
    '<div id="posMergeResults" style="max-height:250px;overflow-y:auto;margin-top:8px"></div>' +
    '<div id="posMergeConfirm" style="display:none;margin-top:12px;padding:12px;background:#FEF3C7;border-radius:8px">' +
      '<p style="font-size:13px;font-weight:600;color:var(--pos-orange);margin:0 0 8px 0"><i class="fas fa-exclamation-triangle"></i> Confirm Merge</p>' +
      '<p id="posMergeConfirmText" style="font-size:12px;color:var(--pos-gray-700);margin:0 0 8px 0"></p>' +
      '<button class="pos-btn" id="posMergeConfirmBtn" style="background:var(--pos-orange);color:white;width:100%"><i class="fas fa-compress-arrows-alt"></i> Merge Customers</button>' +
    '</div>' +
  '</div>';

  showModal('Merge Customer', html,
    '<button class="pos-btn pos-btn-hold" id="posMergeCancel">Cancel</button>');
  on('posMergeCancel', 'click', closeModal);

  var mergeTarget = null;
  var searchInput = document.getElementById('posMergeSearch');
  if (searchInput) {
    var timer = null;
    searchInput.addEventListener('input', function() {
      clearTimeout(timer);
      var term = searchInput.value;
      if (term.length < 2) { document.getElementById('posMergeResults').innerHTML = ''; return; }
      timer = setTimeout(function() {
        API.get('/pos/customers?search=' + encodeURIComponent(term)).then(function(r) {
          var results = document.getElementById('posMergeResults');
          var custs = (r.data || []).filter(function(c) { return c.id !== keepId; });
          if (custs.length === 0) {
            results.innerHTML = '<div style="padding:12px;text-align:center;color:var(--pos-gray-400);font-size:13px">No matching customers</div>';
          } else {
            var html = '';
            custs.forEach(function(c) {
              html += '<div class="pos-merge-option" data-merge-id="' + c.id + '">' +
                '<div style="font-weight:600;font-size:13px">' + esc(c.business_name || c.contact_name || 'Unknown') + '</div>' +
                '<div style="font-size:11px;color:var(--pos-gray-500)">' + esc(c.phone || '') + ' &middot; ' + esc(c.customer_type || '') + ' &middot; ' + (c.total_orders || 0) + ' orders</div>' +
              '</div>';
            });
            results.innerHTML = html;

            results.querySelectorAll('.pos-merge-option').forEach(function(opt) {
              opt.addEventListener('click', function() {
                results.querySelectorAll('.pos-merge-option').forEach(function(o) { o.classList.remove('selected'); });
                opt.classList.add('selected');
                mergeTarget = parseInt(opt.dataset.mergeId);
                var name = opt.querySelector('div').textContent;
                document.getElementById('posMergeConfirm').style.display = 'block';
                document.getElementById('posMergeConfirmText').textContent = 'Merge "' + name + '" into this customer? This action cannot be undone.';
              });
            });
          }
        });
      }, 300);
    });
  }

  on('posMergeConfirmBtn', 'click', function() {
    if (!mergeTarget) return;
    var btn = document.getElementById('posMergeConfirmBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Merging...';

    API.post('/pos/customer-merge', { keep_id: keepId, merge_id: mergeTarget }).then(function() {
      closeModal();
      toast('Customers merged successfully');
      closeCustomerSheet();
      loadCustomerList(true);
    }).catch(function(err) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-compress-arrows-alt"></i> Merge Customers';
      toast('Merge failed: ' + errMsg(err), 'error');
    });
  });
}

// ==================== STOCK CHECK POPUP ====================
function openStockCheck(productId) {
  var product = _s.productCache[productId];
  var pName = product ? product.name : 'Product #' + productId;
  showModal('<i class="fas fa-boxes-stacked"></i> Stock Check — ' + esc(pName),
    '<div class="pos-stock-loading"><i class="fas fa-spinner fa-spin"></i> Checking inventory...</div>', '');

  API.get('/pos/stock-check/' + productId).then(function(r) {
    var d = r.data;
    var locs = d.stock || d.locations || [];
    var reserves = d.reservations || [];
    var html = '<div class="pos-stock-check-grid">';
    locs.forEach(function(loc) {
      var isCurrent = loc.location_id == getLocationId();
      html += '<div class="pos-stock-check-loc' + (isCurrent ? ' current' : '') + '">' +
        '<div class="pos-stock-check-header">' +
          '<i class="fas fa-' + (loc.location_type === 'distribution' ? 'warehouse' : 'store') + '"></i> ' + esc(loc.location_name) +
          (isCurrent ? ' <span class="pos-badge pos-badge-green">Current</span>' : '') +
        '</div>' +
        '<div class="pos-stock-check-nums">' +
          '<div class="pos-stock-num"><span class="label">Available</span><span class="val ' + (loc.qty_available <= 0 ? 'red' : loc.qty_available <= (loc.reorder_point || 5) ? 'orange' : 'green') + '">' + fmtN(loc.qty_available) + '</span></div>' +
          '<div class="pos-stock-num"><span class="label">Committed</span><span class="val">' + fmtN(loc.qty_committed || 0) + '</span></div>' +
          '<div class="pos-stock-num"><span class="label">On Hand</span><span class="val">' + fmtN(loc.qty_on_hand || 0) + '</span></div>' +
        '</div>' +
        (!isCurrent && loc.qty_available > 0 ? '<div class="pos-stock-reserve-row"><button class="pos-btn pos-btn-sm pos-stock-reserve-btn" data-reserve-loc="' + loc.location_id + '" data-reserve-pid="' + productId + '"><i class="fas fa-bookmark"></i> Reserve & Transfer</button></div>' : '') +
      '</div>';
    });
    html += '</div>';

    if (reserves.length > 0) {
      html += '<div class="pos-stock-reserves"><h4><i class="fas fa-bookmark"></i> Active Reservations</h4>';
      reserves.forEach(function(res) {
        html += '<div class="pos-stock-reserve-item">' +
          '<span>' + fmtN(res.quantity) + ' units — from ' + esc(res.from_location || '?') + ' → ' + esc(res.to_location || '?') + '</span>' +
          '<span class="pos-stock-reserve-date">' + (res.created_at || '').slice(0, 10) + '</span>' +
          (res.status === 'pending' ? '<button class="pos-btn pos-btn-sm danger" data-cancel-reserve="' + res.id + '"><i class="fas fa-times"></i></button>' : '<span class="pos-badge pos-badge-green">' + res.status + '</span>') +
        '</div>';
      });
      html += '</div>';
    }

    var body = document.querySelector('#posModalOverlay .pos-modal-body');
    if (body) body.innerHTML = html;

    // Wire reserve buttons
    document.querySelectorAll('.pos-stock-reserve-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var qty = prompt('Quantity to reserve and transfer:', '1');
        if (!qty || isNaN(parseInt(qty)) || parseInt(qty) < 1) return;
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        API.post('/pos/stock-reserve', {
          product_id: parseInt(btn.dataset.reservePid),
          from_location_id: parseInt(btn.dataset.reserveLoc),
          to_location_id: getLocationId(),
          quantity: parseInt(qty)
        }).then(function() {
          toast('Stock reserved — transfer created');
          openStockCheck(productId); // Refresh
        }).catch(function(err) { toast('Reserve failed: ' + errMsg(err), 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-bookmark"></i> Reserve & Transfer'; });
      });
    });

    // Wire cancel reservation buttons
    document.querySelectorAll('[data-cancel-reserve]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (!confirm('Cancel this reservation?')) return;
        API.put('/pos/stock-reserve/' + btn.dataset.cancelReserve + '/cancel').then(function() {
          toast('Reservation cancelled');
          openStockCheck(productId);
        }).catch(function(err) { toast('Cancel failed: ' + errMsg(err), 'error'); });
      });
    });
  }).catch(function(err) {
    var body = document.querySelector('#posModalOverlay .pos-modal-body');
    if (body) body.innerHTML = '<div style="color:var(--pos-red);text-align:center;padding:20px"><i class="fas fa-exclamation-triangle"></i> ' + errMsg(err) + '</div>';
  });
}

// ==================== LINE-LEVEL DISCOUNT ====================
function openLineDiscount(cartIdx) {
  var item = _s.cart[cartIdx];
  if (!item) return;
  var origPrice = item.unit_price;
  var currentDisc = item.discount_pct || 0;
  var currentReason = item.discount_reason || '';

  var html = '<div class="pos-line-disc-form">' +
    '<div class="pos-line-disc-product"><strong>' + esc(item.name) + '</strong><span>Unit price: $' + origPrice.toFixed(2) + '</span></div>' +
    '<div class="pos-line-disc-tabs">' +
      '<button class="pos-line-disc-tab active" data-disc-type="percent"><i class="fas fa-percent"></i> Percentage</button>' +
      '<button class="pos-line-disc-tab" data-disc-type="fixed"><i class="fas fa-dollar-sign"></i> Fixed Price</button>' +
      '<button class="pos-line-disc-tab" data-disc-type="amount"><i class="fas fa-tag"></i> Amount Off</button>' +
    '</div>' +
    '<div class="pos-line-disc-panel" id="posLineDiscPanel">' +
      '<div data-panel="percent" class="active"><label>Discount %</label><input type="number" id="posLineDiscPct" value="' + currentDisc + '" min="0" max="100" step="0.5"><p class="pos-line-disc-preview">New price: $' + (origPrice * (1 - currentDisc / 100)).toFixed(2) + '</p></div>' +
      '<div data-panel="fixed"><label>Fixed Price $</label><input type="number" id="posLineDiscFixed" value="' + item.effective_price.toFixed(2) + '" min="0" step="0.01"><p class="pos-line-disc-preview">Original: $' + origPrice.toFixed(2) + '</p></div>' +
      '<div data-panel="amount"><label>Amount Off $</label><input type="number" id="posLineDiscAmount" value="' + (origPrice - item.effective_price).toFixed(2) + '" min="0" step="0.01"><p class="pos-line-disc-preview">New price: $' + item.effective_price.toFixed(2) + '</p></div>' +
    '</div>' +
    '<div class="pos-line-disc-reason"><label>Reason (optional)</label><input type="text" id="posLineDiscReason" value="' + esc(currentReason) + '" placeholder="e.g. Damaged, loyalty, price match"></div>' +
  '</div>';

  showModal('<i class="fas fa-tag"></i> Line Discount — ' + esc(item.name), html,
    '<button class="pos-btn" style="background:var(--pos-red);color:white" id="posLineDiscRemove"><i class="fas fa-times"></i> Remove Discount</button>' +
    '<button class="pos-btn pos-btn-pay" id="posLineDiscApply"><i class="fas fa-check"></i> Apply</button>');

  // Tab switching
  document.querySelectorAll('.pos-line-disc-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.pos-line-disc-tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('#posLineDiscPanel > div').forEach(function(p) { p.classList.remove('active'); });
      tab.classList.add('active');
      var panel = document.querySelector('[data-panel="' + tab.dataset.discType + '"]');
      if (panel) panel.classList.add('active');
    });
  });

  // Live previews
  on('posLineDiscPct', 'input', function() {
    var pct = parseFloat(this.value) || 0;
    var preview = this.parentElement.querySelector('.pos-line-disc-preview');
    if (preview) preview.textContent = 'New price: $' + (origPrice * (1 - pct / 100)).toFixed(2);
  });
  on('posLineDiscFixed', 'input', function() {
    var fixed = parseFloat(this.value) || 0;
    var preview = this.parentElement.querySelector('.pos-line-disc-preview');
    if (preview) preview.textContent = 'Discount: $' + (origPrice - fixed).toFixed(2) + ' off';
  });
  on('posLineDiscAmount', 'input', function() {
    var amt = parseFloat(this.value) || 0;
    var preview = this.parentElement.querySelector('.pos-line-disc-preview');
    if (preview) preview.textContent = 'New price: $' + Math.max(0, origPrice - amt).toFixed(2);
  });

  // Apply
  on('posLineDiscApply', 'click', function() {
    var activeTab = document.querySelector('.pos-line-disc-tab.active');
    var type = activeTab ? activeTab.dataset.discType : 'percent';
    var newPrice = origPrice;
    var pct = 0;
    if (type === 'percent') {
      pct = parseFloat(gv('posLineDiscPct')) || 0;
      newPrice = origPrice * (1 - pct / 100);
    } else if (type === 'fixed') {
      newPrice = parseFloat(gv('posLineDiscFixed')) || origPrice;
      pct = ((origPrice - newPrice) / origPrice) * 100;
    } else if (type === 'amount') {
      var amt = parseFloat(gv('posLineDiscAmount')) || 0;
      newPrice = Math.max(0, origPrice - amt);
      pct = ((origPrice - newPrice) / origPrice) * 100;
    }
    item.effective_price = Math.max(0, Math.round(newPrice * 100) / 100);
    item.discount_pct = Math.round(pct * 100) / 100;
    item.discount_reason = gv('posLineDiscReason');
    closeModal();
    renderCart(); renderCartFooter();
    toast('Discount applied: $' + item.effective_price.toFixed(2));
  });

  // Remove
  on('posLineDiscRemove', 'click', function() {
    item.effective_price = origPrice;
    item.discount_pct = 0;
    item.discount_reason = '';
    closeModal();
    renderCart(); renderCartFooter();
    toast('Discount removed');
  });
}

// ==================== ORDER DETAIL MODAL ====================
function openOrderDetail(id, type) {
  type = type || 'sale';
  showModal('<i class="fas fa-receipt"></i> Order Detail',
    '<div class="pos-stock-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>', '');

  API.get('/pos/order-detail/' + id + '?type=' + type).then(function(r) {
    var d = r.data;
    var html = '<div class="pos-order-detail">';

    // Header
    html += '<div class="pos-order-detail-header">' +
      '<div><h4>' + esc(d.sale_number || d.order_number || '#' + d.id) + '</h4>' +
      '<span class="pos-badge pos-badge-' + (d.status === 'completed' ? 'green' : d.status === 'voided' ? 'red' : 'blue') + '">' + esc(d.status) + '</span></div>' +
      '<div class="pos-order-detail-meta">' +
        '<span><i class="fas fa-calendar"></i> ' + (d.created_at || '').slice(0, 16).replace('T', ' ') + '</span>' +
        (d.customer_name ? '<span><i class="fas fa-user"></i> ' + esc(d.customer_name) + '</span>' : '') +
        (d.cashier_name ? '<span><i class="fas fa-cash-register"></i> ' + esc(d.cashier_name) + '</span>' : '') +
        (d.location_name ? '<span><i class="fas fa-map-marker-alt"></i> ' + esc(d.location_name) + '</span>' : '') +
      '</div></div>';

    // Line items
    if (d.items && d.items.length > 0) {
      html += '<div class="pos-order-section-title">Line Items</div>' +
        '<table class="pos-table"><thead><tr><th>Product</th><th class="right">Qty</th><th class="right">Unit</th><th class="right">Disc</th><th class="right">Total</th></tr></thead><tbody>';
      d.items.forEach(function(it) {
        var lineTotal = (it.unit_price || 0) * (it.quantity || 0);
        var disc = it.discount_pct ? it.discount_pct + '%' : '-';
        if (it.discount_reason) disc += ' <small>(' + esc(it.discount_reason) + ')</small>';
        html += '<tr><td>' + esc(it.product_name || 'Product #' + it.product_id) + '</td>' +
          '<td class="right">' + fmtN(it.quantity) + '</td>' +
          '<td class="right money">$' + (it.unit_price || 0).toFixed(2) + '</td>' +
          '<td class="right">' + disc + '</td>' +
          '<td class="right money">$' + lineTotal.toFixed(2) + '</td></tr>';
      });
      html += '</tbody></table>';
    }

    // Totals
    html += '<div class="pos-order-detail-totals">' +
      '<div><span>Subtotal</span><span>$' + (d.subtotal || 0).toFixed(2) + '</span></div>' +
      (d.discount > 0 ? '<div class="discount"><span>Discount</span><span>-$' + d.discount.toFixed(2) + '</span></div>' : '') +
      (d.promo_discount > 0 ? '<div class="discount"><span>Promo (' + esc(d.promo_code || '') + ')</span><span>-$' + d.promo_discount.toFixed(2) + '</span></div>' : '') +
      '<div><span>Tax</span><span>$' + (d.tax || 0).toFixed(2) + '</span></div>' +
      '<div class="grand"><span>Total</span><span>$' + (d.total || 0).toFixed(2) + '</span></div>' +
    '</div>';

    // Payments
    if (d.payments && d.payments.length > 0) {
      html += '<div class="pos-order-section-title">Payments</div>' +
        '<table class="pos-table"><thead><tr><th>Method</th><th>Ref</th><th class="right">Amount</th><th>Date</th></tr></thead><tbody>';
      d.payments.forEach(function(p) {
        html += '<tr><td style="text-transform:capitalize">' + esc((p.method || '').replace(/_/g, ' ')) + (p.card_brand ? ' <small>(' + esc(p.card_brand) + ')</small>' : '') + '</td>' +
          '<td>' + esc(p.gateway_ref || p.reference_number || '-') + '</td>' +
          '<td class="right money">$' + (p.amount || 0).toFixed(2) + '</td>' +
          '<td>' + (p.created_at || '').slice(0, 10) + '</td></tr>';
      });
      html += '</tbody></table>';
    }

    // Refunds
    if (d.refunds && d.refunds.length > 0) {
      html += '<div class="pos-order-section-title" style="color:var(--pos-red)">Refunds</div>' +
        '<table class="pos-table"><thead><tr><th>Reason</th><th class="right">Amount</th><th>Date</th></tr></thead><tbody>';
      d.refunds.forEach(function(ref) {
        html += '<tr><td>' + esc(ref.reason || '-') + '</td>' +
          '<td class="right money" style="color:var(--pos-red)">-$' + (ref.amount || 0).toFixed(2) + '</td>' +
          '<td>' + (ref.created_at || '').slice(0, 10) + '</td></tr>';
      });
      html += '</tbody></table>';
    }

    html += '</div>';
    var body = document.querySelector('#posModalOverlay .pos-modal-body');
    if (body) body.innerHTML = html;
  }).catch(function(err) {
    var body = document.querySelector('#posModalOverlay .pos-modal-body');
    if (body) body.innerHTML = '<div style="color:var(--pos-red);text-align:center;padding:20px"><i class="fas fa-exclamation-triangle"></i> ' + errMsg(err) + '</div>';
  });
}

// ==================== PROMO CODE ====================
function applyPromoCode() {
  var code = (gv('posPromoInput') || '').trim();
  if (!code) { toast('Enter a promo code', 'error'); return; }

  var items = _s.cart.map(function(c) {
    return { product_id: c.product_id, quantity: c.qty, unit_price: c.effective_price, category_id: c.category_id };
  });

  API.post('/pos/promotions/check', {
    code: code,
    location_id: getLocationId(),
    customer_id: _s.customer ? _s.customer.id : null,
    items: items
  }).then(function(r) {
    var p = r.data;
    if (p.valid) {
      _s.appliedPromo = { promo_id: p.promo_id, code: code, discount: p.discount || 0, description: p.description || code };
      _s.promoCode = code;
      renderCartFooter();
      toast('Promo applied: ' + (_s.appliedPromo.description || code));
    } else {
      toast(p.message || 'Invalid promo code', 'error');
    }
  }).catch(function(err) { toast('Promo check failed: ' + errMsg(err), 'error'); });
}

function removePromo() {
  _s.appliedPromo = null;
  _s.promoCode = '';
  renderCartFooter();
  toast('Promo removed');
}

// ==================== CART DISCOUNT MODAL ====================
function openCartDiscountModal() {
  var totals = calcTotals();
  var html = '<div class="pos-cart-disc-form">' +
    '<p style="margin:0 0 12px;color:var(--pos-gray-600);font-size:13px">Apply a discount to the entire cart (subtotal: $' + totals.subtotal.toFixed(2) + ')</p>' +
    '<div class="pos-line-disc-tabs">' +
      '<button class="pos-line-disc-tab active" data-cdtype="percent"><i class="fas fa-percent"></i> Percentage</button>' +
      '<button class="pos-line-disc-tab" data-cdtype="amount"><i class="fas fa-dollar-sign"></i> Amount Off</button>' +
    '</div>' +
    '<div style="margin-top:12px">' +
      '<div data-cdpanel="percent" class="active"><label>Discount %</label><input type="number" id="posCartDiscPct" value="0" min="0" max="100" step="0.5"></div>' +
      '<div data-cdpanel="amount" style="display:none"><label>Amount Off $</label><input type="number" id="posCartDiscAmt" value="0" min="0" step="0.01"></div>' +
    '</div>' +
    '<div style="margin-top:8px"><label>Reason</label><input type="text" id="posCartDiscReason" placeholder="e.g. Manager override, loyalty"></div>' +
  '</div>';

  showModal('<i class="fas fa-tags"></i> Cart Discount', html,
    '<button class="pos-btn pos-btn-pay" id="posCartDiscApply"><i class="fas fa-check"></i> Apply to All Items</button>');

  document.querySelectorAll('[data-cdtype]').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('[data-cdtype]').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      document.querySelectorAll('[data-cdpanel]').forEach(function(p) { p.style.display = 'none'; });
      var panel = document.querySelector('[data-cdpanel="' + tab.dataset.cdtype + '"]');
      if (panel) panel.style.display = '';
    });
  });

  on('posCartDiscApply', 'click', function() {
    var activeType = document.querySelector('[data-cdtype].active');
    var type = activeType ? activeType.dataset.cdtype : 'percent';
    var reason = gv('posCartDiscReason');
    _s.cart.forEach(function(item) {
      if (type === 'percent') {
        var pct = parseFloat(gv('posCartDiscPct')) || 0;
        item.effective_price = item.unit_price * (1 - pct / 100);
        item.discount_pct = pct;
      } else {
        var totalAmt = parseFloat(gv('posCartDiscAmt')) || 0;
        var share = totalAmt * (item.effective_price * item.qty / totals.subtotal);
        item.effective_price = Math.max(0, item.unit_price - share / item.qty);
        item.discount_pct = ((item.unit_price - item.effective_price) / item.unit_price) * 100;
      }
      item.discount_reason = reason || 'Cart discount';
    });
    closeModal();
    renderCart(); renderCartFooter();
    toast('Cart discount applied');
  });
}

// ==================== PROMOTIONS MANAGER ====================
function openPromotionsManager() {
  showModal('<i class="fas fa-bullhorn"></i> Promotions', '<div class="pos-stock-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>',
    '<button class="pos-btn pos-btn-pay" id="posPromoAddBtn"><i class="fas fa-plus"></i> New Promotion</button>');

  API.get('/pos/promotions').then(function(r) {
    var promos = r.data || [];
    var html = '';
    if (promos.length === 0) {
      html = '<div style="text-align:center;padding:20px;color:var(--pos-gray-400)"><i class="fas fa-bullhorn" style="font-size:32px"></i><p>No promotions yet</p></div>';
    } else {
      html = '<table class="pos-table"><thead><tr><th>Name</th><th>Type</th><th>Code</th><th>Period</th><th>Status</th><th></th></tr></thead><tbody>';
      promos.forEach(function(p) {
        var now = new Date().toISOString().slice(0, 10);
        var active = (!p.start_date || p.start_date <= now) && (!p.end_date || p.end_date >= now) && p.is_active;
        html += '<tr>' +
          '<td><strong>' + esc(p.name) + '</strong><br><small style="color:var(--pos-gray-400)">' + esc(p.description || '') + '</small></td>' +
          '<td><span class="pos-badge pos-badge-blue">' + esc(p.promo_type) + '</span></td>' +
          '<td>' + (p.code ? '<code>' + esc(p.code) + '</code>' : '<em>auto</em>') + '</td>' +
          '<td><small>' + (p.start_date || '∞') + ' → ' + (p.end_date || '∞') + '</small></td>' +
          '<td><span class="pos-badge ' + (active ? 'pos-badge-green' : 'pos-badge-red') + '">' + (active ? 'Active' : 'Inactive') + '</span></td>' +
          '<td>' +
            '<button class="pos-btn pos-btn-sm" data-promo-edit="' + p.id + '" title="Edit"><i class="fas fa-pen"></i></button> ' +
            '<button class="pos-btn pos-btn-sm danger" data-promo-del="' + p.id + '" title="Delete"><i class="fas fa-trash"></i></button>' +
          '</td></tr>';
      });
      html += '</tbody></table>';
    }
    var body = document.querySelector('#posModalOverlay .pos-modal-body');
    if (body) body.innerHTML = html;

    // Wire edit/delete
    document.querySelectorAll('[data-promo-edit]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var promo = promos.find(function(p) { return p.id == btn.dataset.promoEdit; });
        if (promo) openPromoForm(promo);
      });
    });
    document.querySelectorAll('[data-promo-del]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (!confirm('Delete this promotion?')) return;
        API.delete('/pos/promotions/' + btn.dataset.promoDel).then(function() { toast('Deleted'); openPromotionsManager(); }).catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
      });
    });
  }).catch(function(err) {
    var body = document.querySelector('#posModalOverlay .pos-modal-body');
    if (body) body.innerHTML = '<div style="color:var(--pos-red);padding:20px;text-align:center">' + errMsg(err) + '</div>';
  });

  on('posPromoAddBtn', 'click', function() { openPromoForm(null); });
}

function openPromoForm(promo) {
  var p = promo || { name: '', description: '', promo_type: 'percent_off', code: '', discount_value: 0, min_purchase: 0, start_date: '', end_date: '', is_active: 1, buy_qty: 0, get_qty: 0, applies_to: '', location_id: '' };
  var typeOpts = ['percent_off','fixed_off','bogo','buy_x_get_y','bundle'].map(function(t) {
    return '<option value="' + t + '"' + (p.promo_type === t ? ' selected' : '') + '>' + t.replace(/_/g, ' ') + '</option>';
  }).join('');
  var locOpts = '<option value="">All Locations</option>';
  _s.locations.forEach(function(l) { locOpts += '<option value="' + l.id + '"' + (p.location_id == l.id ? ' selected' : '') + '>' + esc(l.name) + '</option>'; });

  var html = '<div class="pos-promo-form">' +
    '<div class="pos-cust-form-grid">' +
      '<div class="pos-cust-form-group full"><label>Name *</label><input type="text" id="posPromoName" value="' + esc(p.name) + '"></div>' +
      '<div class="pos-cust-form-group full"><label>Description</label><input type="text" id="posPromoDesc" value="' + esc(p.description || '') + '"></div>' +
      '<div class="pos-cust-form-group"><label>Type</label><select id="posPromoType">' + typeOpts + '</select></div>' +
      '<div class="pos-cust-form-group"><label>Coupon Code</label><input type="text" id="posPromoCode" value="' + esc(p.code || '') + '" placeholder="e.g. SUMMER20"></div>' +
      '<div class="pos-cust-form-group"><label>Discount Value</label><input type="number" id="posPromoValue" value="' + (p.discount_value || 0) + '" min="0" step="0.01"></div>' +
      '<div class="pos-cust-form-group"><label>Min Purchase $</label><input type="number" id="posPromoMin" value="' + (p.min_purchase || 0) + '" min="0" step="0.01"></div>' +
      '<div class="pos-cust-form-group"><label>Buy Qty (BOGO)</label><input type="number" id="posPromoBuy" value="' + (p.buy_qty || 0) + '" min="0"></div>' +
      '<div class="pos-cust-form-group"><label>Get Qty (BOGO)</label><input type="number" id="posPromoGet" value="' + (p.get_qty || 0) + '" min="0"></div>' +
      '<div class="pos-cust-form-group"><label>Start Date</label><input type="date" id="posPromoStart" value="' + (p.start_date || '') + '"></div>' +
      '<div class="pos-cust-form-group"><label>End Date</label><input type="date" id="posPromoEnd" value="' + (p.end_date || '') + '"></div>' +
      '<div class="pos-cust-form-group"><label>Location</label><select id="posPromoLoc">' + locOpts + '</select></div>' +
      '<div class="pos-cust-form-group"><label>Applies To (category/product IDs)</label><input type="text" id="posPromoApplies" value="' + esc(p.applies_to || '') + '" placeholder="e.g. cat:5, prod:12"></div>' +
      '<div class="pos-cust-form-group"><label><input type="checkbox" id="posPromoActive"' + (p.is_active ? ' checked' : '') + '> Active</label></div>' +
    '</div></div>';

  showModal('<i class="fas fa-bullhorn"></i> ' + (promo ? 'Edit' : 'New') + ' Promotion', html,
    '<button class="pos-btn pos-btn-hold" onclick="openPromotionsManager()">Back</button>' +
    '<button class="pos-btn pos-btn-pay" id="posPromoSaveBtn"><i class="fas fa-save"></i> Save</button>');

  on('posPromoSaveBtn', 'click', function() {
    var body = {
      name: gv('posPromoName'), description: gv('posPromoDesc'), promo_type: gv('posPromoType'),
      code: gv('posPromoCode'), discount_value: parseFloat(gv('posPromoValue')) || 0,
      min_purchase: parseFloat(gv('posPromoMin')) || 0, buy_qty: parseInt(gv('posPromoBuy')) || 0,
      get_qty: parseInt(gv('posPromoGet')) || 0, start_date: gv('posPromoStart'), end_date: gv('posPromoEnd'),
      location_id: gv('posPromoLoc') ? parseInt(gv('posPromoLoc')) : null,
      applies_to: gv('posPromoApplies'),
      is_active: document.getElementById('posPromoActive') && document.getElementById('posPromoActive').checked ? 1 : 0
    };
    if (!body.name) { toast('Name is required', 'error'); return; }
    var req = promo ? API.put('/pos/promotions/' + promo.id, body) : API.post('/pos/promotions', body);
    req.then(function() { toast(promo ? 'Updated' : 'Created'); openPromotionsManager(); })
      .catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
  });
}

// ==================== TAX SETTINGS ====================
function openTaxSettings() {
  showModal('<i class="fas fa-calculator"></i> Tax Configuration', '<div class="pos-stock-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>',
    '<button class="pos-btn pos-btn-pay" id="posTaxAddBtn"><i class="fas fa-plus"></i> New Tax Rule</button>');

  API.get('/pos/tax-config').then(function(r) {
    var rules = r.data || [];
    var html = '<p style="margin:0 0 12px;color:var(--pos-gray-500);font-size:12px">Tax rules cascade: Customer exempt → Product → Category → Location → Global default</p>';
    if (rules.length === 0) {
      html += '<div style="text-align:center;padding:20px;color:var(--pos-gray-400)"><p>No custom tax rules — using product-level rates</p></div>';
    } else {
      html += '<table class="pos-table"><thead><tr><th>Scope</th><th>Target</th><th class="right">Rate %</th><th></th></tr></thead><tbody>';
      rules.forEach(function(r) {
        html += '<tr>' +
          '<td><span class="pos-badge pos-badge-blue">' + esc(r.scope) + '</span></td>' +
          '<td>' + esc(r.target_name || r.target_id || 'Global') + '</td>' +
          '<td class="right">' + (r.rate || 0).toFixed(2) + '%</td>' +
          '<td>' +
            '<button class="pos-btn pos-btn-sm" data-tax-edit="' + r.id + '"><i class="fas fa-pen"></i></button> ' +
            '<button class="pos-btn pos-btn-sm danger" data-tax-del="' + r.id + '"><i class="fas fa-trash"></i></button>' +
          '</td></tr>';
      });
      html += '</tbody></table>';
    }
    var body = document.querySelector('#posModalOverlay .pos-modal-body');
    if (body) body.innerHTML = html;

    document.querySelectorAll('[data-tax-edit]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var rule = rules.find(function(r) { return r.id == btn.dataset.taxEdit; });
        if (rule) openTaxForm(rule);
      });
    });
    document.querySelectorAll('[data-tax-del]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (!confirm('Delete this tax rule?')) return;
        API.delete('/pos/tax-config/' + btn.dataset.taxDel).then(function() { toast('Deleted'); openTaxSettings(); }).catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
      });
    });
  }).catch(function(err) {
    var body = document.querySelector('#posModalOverlay .pos-modal-body');
    if (body) body.innerHTML = '<div style="color:var(--pos-red);padding:20px;text-align:center">' + errMsg(err) + '</div>';
  });

  on('posTaxAddBtn', 'click', function() { openTaxForm(null); });
}

function openTaxForm(rule) {
  var r = rule || { scope: 'location', target_id: '', rate: 7.0 };
  var locOpts = _s.locations.map(function(l) { return '<option value="' + l.id + '"' + (r.target_id == l.id && r.scope === 'location' ? ' selected' : '') + '>' + esc(l.name) + '</option>'; }).join('');
  var catOpts = _s.categories.map(function(c) { return '<option value="' + c.id + '"' + (r.target_id == c.id && r.scope === 'category' ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');

  var html = '<div class="pos-cust-form-grid">' +
    '<div class="pos-cust-form-group"><label>Scope</label><select id="posTaxScope">' +
      '<option value="global"' + (r.scope === 'global' ? ' selected' : '') + '>Global Default</option>' +
      '<option value="location"' + (r.scope === 'location' ? ' selected' : '') + '>Per Location</option>' +
      '<option value="category"' + (r.scope === 'category' ? ' selected' : '') + '>Per Category</option>' +
      '<option value="product"' + (r.scope === 'product' ? ' selected' : '') + '>Per Product</option>' +
    '</select></div>' +
    '<div class="pos-cust-form-group"><label>Tax Rate %</label><input type="number" id="posTaxRate" value="' + (r.rate || 0) + '" min="0" max="50" step="0.01"></div>' +
    '<div class="pos-cust-form-group" id="posTaxTargetWrap"><label>Target</label>' +
      '<select id="posTaxTargetLoc" ' + (r.scope !== 'location' ? 'style="display:none"' : '') + '>' + locOpts + '</select>' +
      '<select id="posTaxTargetCat" ' + (r.scope !== 'category' ? 'style="display:none"' : '') + '>' + catOpts + '</select>' +
      '<input type="number" id="posTaxTargetProd" placeholder="Product ID" value="' + (r.scope === 'product' ? r.target_id : '') + '" ' + (r.scope !== 'product' ? 'style="display:none"' : '') + '>' +
    '</div>' +
  '</div>';

  showModal('<i class="fas fa-calculator"></i> ' + (rule ? 'Edit' : 'New') + ' Tax Rule', html,
    '<button class="pos-btn pos-btn-hold" onclick="openTaxSettings()">Back</button>' +
    '<button class="pos-btn pos-btn-pay" id="posTaxSaveBtn"><i class="fas fa-save"></i> Save</button>');

  on('posTaxScope', 'change', function() {
    var s = this.value;
    document.getElementById('posTaxTargetLoc').style.display = s === 'location' ? '' : 'none';
    document.getElementById('posTaxTargetCat').style.display = s === 'category' ? '' : 'none';
    document.getElementById('posTaxTargetProd').style.display = s === 'product' ? '' : 'none';
  });

  on('posTaxSaveBtn', 'click', function() {
    var scope = gv('posTaxScope');
    var targetId = null;
    if (scope === 'location') targetId = gv('posTaxTargetLoc');
    else if (scope === 'category') targetId = gv('posTaxTargetCat');
    else if (scope === 'product') targetId = gv('posTaxTargetProd');
    var body = { scope: scope, target_id: targetId ? parseInt(targetId) : null, rate: parseFloat(gv('posTaxRate')) || 0 };
    var req = rule ? API.put('/pos/tax-config/' + rule.id, body) : API.post('/pos/tax-config', body);
    req.then(function() { toast(rule ? 'Updated' : 'Created'); openTaxSettings(); })
      .catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
  });
}

// ==================== CUSTOMER DISCOUNTS (pricing rules) ====================
function renderCustDiscounts(custId) {
  API.get('/pos/customer-discounts/' + custId).then(function(r) {
    var rules = r.data || [];
    var el = document.getElementById('posCustDiscountList');
    if (!el) return;
    if (rules.length === 0) {
      el.innerHTML = '<div style="text-align:center;padding:12px;color:var(--pos-gray-400)"><i class="fas fa-tag"></i> No pricing rules</div>';
      return;
    }
    var html = '<table class="pos-table"><thead><tr><th>Product</th><th>Type</th><th class="right">Value</th><th></th></tr></thead><tbody>';
    rules.forEach(function(r) {
      html += '<tr>' +
        '<td>' + esc(r.product_name || 'Product #' + r.product_id) + '</td>' +
        '<td>' + esc(r.rule_type) + '</td>' +
        '<td class="right">' + (r.rule_type === 'fixed_price' ? '$' + (r.price || 0).toFixed(2) : (r.discount_pct || 0) + '%') + '</td>' +
        '<td>' +
          '<button class="pos-btn pos-btn-sm" data-disc-edit="' + r.id + '"><i class="fas fa-pen"></i></button> ' +
          '<button class="pos-btn pos-btn-sm danger" data-disc-del="' + r.id + '"><i class="fas fa-trash"></i></button>' +
        '</td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;

    el.querySelectorAll('[data-disc-edit]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var rule = rules.find(function(r) { return r.id == btn.dataset.discEdit; });
        if (rule) openDiscountRuleForm(custId, rule);
      });
    });
    el.querySelectorAll('[data-disc-del]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (!confirm('Delete this pricing rule?')) return;
        API.delete('/pos/customer-discounts/' + custId + '/' + btn.dataset.discDel).then(function() { toast('Deleted'); renderCustDiscounts(custId); }).catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
      });
    });
  }).catch(function(err) {
    var el = document.getElementById('posCustDiscountList');
    if (el) el.innerHTML = '<div style="color:var(--pos-red);padding:8px">' + errMsg(err) + '</div>';
  });
}

function refreshCustDiscounts(custId) { renderCustDiscounts(custId); }

function openDiscountRuleForm(custId, rule) {
  var r = rule || { product_id: '', rule_type: 'discount_pct', price: 0, discount_pct: 0 };
  var html = '<div class="pos-cust-form-grid">' +
    '<div class="pos-cust-form-group"><label>Product ID</label><input type="number" id="posDiscRuleProd" value="' + (r.product_id || '') + '" placeholder="Product ID"></div>' +
    '<div class="pos-cust-form-group"><label>Rule Type</label><select id="posDiscRuleType">' +
      '<option value="discount_pct"' + (r.rule_type === 'discount_pct' ? ' selected' : '') + '>Percentage Off</option>' +
      '<option value="fixed_price"' + (r.rule_type === 'fixed_price' ? ' selected' : '') + '>Fixed Price</option>' +
    '</select></div>' +
    '<div class="pos-cust-form-group"><label>Discount %</label><input type="number" id="posDiscRulePct" value="' + (r.discount_pct || 0) + '" min="0" max="100" step="0.5"></div>' +
    '<div class="pos-cust-form-group"><label>Fixed Price $</label><input type="number" id="posDiscRulePrice" value="' + (r.price || 0) + '" min="0" step="0.01"></div>' +
  '</div>';

  showModal('<i class="fas fa-tag"></i> ' + (rule ? 'Edit' : 'New') + ' Pricing Rule', html,
    '<button class="pos-btn pos-btn-hold" id="posDiscRuleCancel">Cancel</button>' +
    '<button class="pos-btn pos-btn-pay" id="posDiscRuleSave"><i class="fas fa-save"></i> Save</button>');

  on('posDiscRuleCancel', 'click', closeModal);
  on('posDiscRuleSave', 'click', function() {
    var body = {
      product_id: parseInt(gv('posDiscRuleProd')) || null,
      rule_type: gv('posDiscRuleType'),
      price: parseFloat(gv('posDiscRulePrice')) || 0,
      discount_pct: parseFloat(gv('posDiscRulePct')) || 0
    };
    if (!body.product_id) { toast('Product ID required', 'error'); return; }
    var req = rule ? API.put('/pos/customer-discounts/' + custId + '/' + rule.id, body) : API.post('/pos/customer-discounts/' + custId, body);
    req.then(function() { toast(rule ? 'Updated' : 'Created'); closeModal(); renderCustDiscounts(custId); })
      .catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
  });
}

// ==================== RESERVATIONS LIST ====================
function openReservationsList() {
  showModal('<i class="fas fa-bookmark"></i> Pending Reservations', '<div class="pos-stock-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>', '');

  API.get('/pos/stock-reserve/' + getLocationId() + '/pending').then(function(r) {
    var reserves = r.data || [];
    if (reserves.length === 0) {
      var body = document.querySelector('#posModalOverlay .pos-modal-body');
      if (body) body.innerHTML = '<div style="text-align:center;padding:20px;color:var(--pos-gray-400)"><i class="fas fa-bookmark" style="font-size:32px"></i><p>No pending reservations</p></div>';
      return;
    }
    var html = '<table class="pos-table"><thead><tr><th>Product</th><th class="right">Qty</th><th>From → To</th><th>Date</th><th>Status</th><th></th></tr></thead><tbody>';
    reserves.forEach(function(res) {
      html += '<tr>' +
        '<td>' + esc(res.product_name || 'Product #' + res.product_id) + '</td>' +
        '<td class="right">' + fmtN(res.quantity) + '</td>' +
        '<td>' + esc(res.from_location || '?') + ' → ' + esc(res.to_location || '?') + '</td>' +
        '<td>' + (res.created_at || '').slice(0, 10) + '</td>' +
        '<td><span class="pos-badge pos-badge-' + (res.status === 'pending' ? 'orange' : 'green') + '">' + esc(res.status) + '</span></td>' +
        (res.status === 'pending' ? '<td><button class="pos-btn pos-btn-sm danger" data-cancel-res="' + res.id + '"><i class="fas fa-times"></i></button></td>' : '<td></td>') +
      '</tr>';
    });
    html += '</tbody></table>';
    var body = document.querySelector('#posModalOverlay .pos-modal-body');
    if (body) body.innerHTML = html;

    document.querySelectorAll('[data-cancel-res]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (!confirm('Cancel this reservation?')) return;
        API.put('/pos/stock-reserve/' + btn.dataset.cancelRes + '/cancel').then(function() {
          toast('Cancelled');
          openReservationsList();
        }).catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
      });
    });
  }).catch(function(err) {
    var body = document.querySelector('#posModalOverlay .pos-modal-body');
    if (body) body.innerHTML = '<div style="color:var(--pos-red);padding:20px;text-align:center">' + errMsg(err) + '</div>';
  });
}

// Make functions available for inline onclick handlers
window.openPromotionsManager = openPromotionsManager;
window.openTaxSettings = openTaxSettings;

// ==================== HISTORY + ACCOUNT SUB-RENDERERS ====================
function renderCustHistory(items, rules) {
  var html = '';
  if (rules && rules.length > 0) {
    html += '<div class="pos-cust-section"><h4><i class="fas fa-tag"></i> Price Rules</h4>';
    rules.forEach(function(r) {
      html += '<div class="pos-cust-field"><span class="pos-cust-field-label">' + esc(r.product_name || 'Product #' + r.product_id) + '</span>' +
        '<span class="pos-cust-field-value">' + (r.price ? '$' + r.price.toFixed(2) : r.discount_pct + '% off') + ' (' + r.rule_type + ')</span></div>';
    });
    html += '</div>';
  }

  if (!items || items.length === 0) {
    html += '<div class="pos-cust-addr-empty"><i class="fas fa-receipt"></i><p>No order history</p></div>';
    return html;
  }

  html += '<table class="pos-table pos-cust-history-table"><thead><tr><th>Number</th><th>Date</th><th>Items</th><th>Status</th><th class="right">Total</th></tr></thead><tbody>';
  items.forEach(function(o) {
    var num = o.sale_number || o.order_number || '#' + o.id;
    var status = o.status || '';
    var statusClass = status === 'completed' ? 'status-completed' : status === 'voided' ? 'status-voided' : 'status-draft';
    var orderType = o.sale_number ? 'sale' : 'order';
    html += '<tr class="clickable" data-order-id="' + o.id + '" data-order-type="' + orderType + '" style="cursor:pointer">' +
      '<td><span style="color:var(--pos-navy);text-decoration:underline">' + esc(num) + '</span></td>' +
      '<td>' + (o.created_at || '').slice(0, 10) + '</td>' +
      '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.items || '-') + '</td>' +
      '<td><span class="status-badge ' + statusClass + '">' + esc(status) + '</span></td>' +
      '<td class="right money">$' + (o.total || o.total_weight || 0).toFixed(2) + '</td>' +
    '</tr>';
  });
  html += '</tbody></table>';

  // Wire clickable rows after a brief delay (DOM needs to be in place)
  setTimeout(function() {
    document.querySelectorAll('.pos-cust-history-table [data-order-id]').forEach(function(row) {
      row.addEventListener('click', function() {
        openOrderDetail(parseInt(row.dataset.orderId), row.dataset.orderType);
      });
    });
  }, 100);

  return html;
}

function renderCustAccount(acct) {
  return '<div class="pos-cust-section">' +
    '<h4><i class="fas fa-credit-card"></i> Account Details</h4>' +
    fld('Balance', '$' + (acct.balance || 0).toFixed(2)) +
    fld('Credit Limit', acct.credit_limit ? '$' + acct.credit_limit.toFixed(2) : 'None') +
    fld('Payment Terms', acct.payment_terms || 'COD') +
    fld('Status', acct.status || 'active') +
    fld('Last Payment', acct.last_payment_date || 'Never') +
    fld('Last Payment Amount', acct.last_payment_amount ? '$' + acct.last_payment_amount.toFixed(2) : '-') +
  '</div>';
}
function toast(msg, type) {
  posToast(msg, type, 3000);
}

function posToast(msg, type, duration) {
  duration = duration || 3000;
  var bgMap = { error: '#DC2626', success: '#059669', info: '#3B82F6', warning: '#D97706' };
  var iconMap = { error: 'fa-exclamation-circle', success: 'fa-check-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
  var bg = bgMap[type] || bgMap.success;
  var icon = iconMap[type] || iconMap.success;
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:20px;right:20px;background:' + bg + ';color:white;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:99999;max-width:400px;transition:opacity 0.3s';
  el.innerHTML = '<i class="fas ' + icon + '"></i> ' + msg;
  document.body.appendChild(el);
  setTimeout(function() { el.style.opacity = '0'; setTimeout(function() { el.remove(); }, 300); }, duration);
}

// ==================== TAX REPORT ====================
function loadTaxReport() {
  var el = document.getElementById('posViewtax-report');
  if (!el) return;
  el.innerHTML = '<div class="pos-loading"><i class="fas fa-spinner fa-spin"></i> Loading tax report...</div>';

  var now = new Date();
  var month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  el.innerHTML = '<div class="pos-cust-view-header">' +
    '<div class="pos-cust-view-title"><h2><i class="fas fa-receipt"></i> Sales Tax Report</h2></div>' +
    '<div style="display:flex;gap:8px;align-items:center">' +
    '<input type="month" id="posTaxMonth" value="' + month + '" style="padding:6px 10px;border:1px solid var(--pos-gray-200);border-radius:6px;font-size:13px">' +
    '<button class="pos-btn pos-btn-sm" id="posTaxLoad" style="background:var(--pos-navy);color:white"><i class="fas fa-search"></i> Load</button>' +
    '</div></div>' +
    '<div id="posTaxContent"><div class="pos-loading" style="color:var(--pos-gray-400)">Select a month and click Load</div></div>';

  on('posTaxLoad', 'click', function() { doLoadTaxReport(); });
  doLoadTaxReport();
}

function doLoadTaxReport() {
  var month = gv('posTaxMonth');
  if (!month) return;
  var contentEl = document.getElementById('posTaxContent');
  if (!contentEl) return;
  contentEl.innerHTML = '<div class="pos-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

  API.get('/pos/tax-report?month=' + month + '&location_id=' + getLocationId()).then(function(r) {
    var data = r.data;
    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin:16px 0">';
    html += '<div style="padding:16px;background:white;border:1px solid var(--pos-gray-200);border-radius:10px">' +
      '<div style="font-size:12px;color:var(--pos-gray-500)">Total Sales</div>' +
      '<div style="font-size:24px;font-weight:800;color:var(--pos-navy)">$' + ((data.summary || {}).total_sales || 0).toFixed(2) + '</div></div>';
    html += '<div style="padding:16px;background:white;border:1px solid var(--pos-gray-200);border-radius:10px">' +
      '<div style="font-size:12px;color:var(--pos-gray-500)">Tax Collected</div>' +
      '<div style="font-size:24px;font-weight:800;color:var(--pos-orange)">$' + ((data.summary || {}).total_tax || 0).toFixed(2) + '</div></div>';
    html += '<div style="padding:16px;background:white;border:1px solid var(--pos-gray-200);border-radius:10px">' +
      '<div style="font-size:12px;color:var(--pos-gray-500)">Exempt Sales</div>' +
      '<div style="font-size:24px;font-weight:800;color:var(--pos-green)">$' + ((data.summary || {}).exempt_sales || 0).toFixed(2) + '</div></div>';
    html += '<div style="padding:16px;background:white;border:1px solid var(--pos-gray-200);border-radius:10px">' +
      '<div style="font-size:12px;color:var(--pos-gray-500)">Transactions</div>' +
      '<div style="font-size:24px;font-weight:800;color:var(--pos-navy)">' + ((data.summary || {}).transaction_count || 0) + '</div></div>';
    html += '</div>';

    // By-category breakdown
    var cats = data.by_category || [];
    if (cats.length > 0) {
      html += '<div style="background:white;border:1px solid var(--pos-gray-200);border-radius:10px;padding:16px;margin-bottom:16px">';
      html += '<h3 style="margin:0 0 12px;font-size:15px"><i class="fas fa-layer-group" style="color:var(--pos-orange)"></i> By Category</h3>';
      html += '<table class="pos-table"><thead><tr><th>Category</th><th class="right">Sales</th><th class="right">Tax</th><th class="right">Items</th></tr></thead><tbody>';
      cats.forEach(function(c) {
        html += '<tr><td style="text-transform:capitalize">' + esc(c.category || 'Other') + '</td>' +
          '<td class="right">$' + (c.total_sales || 0).toFixed(2) + '</td>' +
          '<td class="right">$' + (c.total_tax || 0).toFixed(2) + '</td>' +
          '<td class="right">' + (c.item_count || 0) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    // Daily totals
    var daily = data.daily_totals || [];
    if (daily.length > 0) {
      html += '<div style="background:white;border:1px solid var(--pos-gray-200);border-radius:10px;padding:16px">';
      html += '<h3 style="margin:0 0 12px;font-size:15px"><i class="fas fa-calendar-day" style="color:var(--pos-navy)"></i> Daily Breakdown</h3>';
      html += '<table class="pos-table"><thead><tr><th>Date</th><th class="right">Sales</th><th class="right">Tax</th><th class="right">Transactions</th></tr></thead><tbody>';
      daily.forEach(function(d) {
        html += '<tr><td>' + esc(d.sale_date) + '</td><td class="right">$' + (d.total_sales || 0).toFixed(2) + '</td>' +
          '<td class="right">$' + (d.total_tax || 0).toFixed(2) + '</td>' +
          '<td class="right">' + (d.transaction_count || 0) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    contentEl.innerHTML = html;
  }).catch(function(err) {
    contentEl.innerHTML = '<div class="pos-loading" style="color:var(--pos-red)">Error: ' + errMsg(err) + '</div>';
  });
}

// ==================== FEE ADMINISTRATION ====================
function loadFeeAdmin() {
  var el = document.getElementById('posViewfee-admin');
  if (!el) return;
  el.innerHTML = '<div class="pos-loading"><i class="fas fa-spinner fa-spin"></i> Loading fee settings...</div>';

  API.get('/pos/fees').then(function(r) {
    var fees = r.data || [];
    _s.fees = fees;
    var html = '<div class="pos-cust-view-header">' +
      '<div class="pos-cust-view-title"><h2><i class="fas fa-sliders"></i> Fee & Surcharge Settings</h2></div></div>';

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:16px;margin-top:16px">';

    fees.forEach(function(fee) {
      var isFuel = fee.fee_type === 'fuel_surcharge';
      var icon = isFuel ? 'fa-gas-pump' : 'fa-credit-card';
      var label = isFuel ? 'Fuel Surcharge' : 'Credit Card Processing Fee';
      var isOn = fee.is_active || fee.active;
      var desc, legalBlock;

      if (isFuel) {
        desc = 'Automatically applied when delivery is selected at checkout. Calculated on the order subtotal after any promo discounts.';
        legalBlock = '';
      } else {
        desc = 'Applied to credit card payments only. NOT applied to debit card, cash, check, or account payments.';
        legalBlock = '<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:10px;margin:10px 0;font-size:11px;line-height:1.5;color:#991B1B">' +
          '<strong><i class="fas fa-balance-scale"></i> Legal Requirements (Visa/MC rules & state law):</strong><br>' +
          '&bull; Fee must not exceed your actual cost of card acceptance (typically 2-4%)<br>' +
          '&bull; Must be disclosed to customer BEFORE payment is processed<br>' +
          '&bull; Must NOT be applied to debit card transactions<br>' +
          '&bull; Must be listed as a separate line item on receipt<br>' +
          '&bull; Some states prohibit surcharges — verify your state allows it</div>';
      }

      html += '<div style="background:white;border:1px solid ' + (isOn ? '#FDE68A' : 'var(--pos-gray-200)') + ';border-radius:12px;padding:20px;position:relative" id="posFeeCard_' + fee.id + '">' +
        (isOn ? '<div style="position:absolute;top:12px;right:12px"><span class="pos-badge pos-badge-green" style="font-size:10px">ACTIVE</span></div>' :
          '<div style="position:absolute;top:12px;right:12px"><span class="pos-badge" style="font-size:10px;background:#F1F5F9;color:#94A3B8">OFF</span></div>') +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
          '<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:' + (isOn ? '#FEF3C7' : '#F1F5F9') + ';color:' + (isOn ? '#D97706' : '#94A3B8') + ';font-size:18px">' +
          '<i class="fas ' + icon + '"></i></div>' +
          '<div style="flex:1"><div style="font-weight:700;font-size:15px">' + esc(label) + '</div>' +
          '<div style="font-size:11px;color:var(--pos-gray-500);margin-top:2px">' + desc + '</div></div>' +
        '</div>' +
        legalBlock +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px">' +
          '<div><label style="font-size:11px;font-weight:600;color:var(--pos-gray-500);text-transform:uppercase;display:block;margin-bottom:3px">Rate</label>' +
          '<div style="display:flex;align-items:center"><input type="number" id="posFeeRate_' + fee.id + '" value="' + (fee.rate || 0) + '" min="0" max="100" step="0.1" style="width:100%;padding:8px;border:1px solid var(--pos-gray-200);border-radius:6px 0 0 6px;font-size:14px">' +
          '<span style="padding:8px 10px;background:var(--pos-gray-100);border:1px solid var(--pos-gray-200);border-left:none;border-radius:0 6px 6px 0;font-size:13px;color:var(--pos-gray-500)">%</span></div></div>' +
          '<div><label style="font-size:11px;font-weight:600;color:var(--pos-gray-500);text-transform:uppercase;display:block;margin-bottom:3px">Max Cap ($0=none)</label>' +
          '<input type="number" id="posFeeMax_' + fee.id + '" value="' + (fee.max_fee || 0) + '" min="0" step="1" style="width:100%;padding:8px;border:1px solid var(--pos-gray-200);border-radius:6px;font-size:14px"></div>' +
          '<div><label style="font-size:11px;font-weight:600;color:var(--pos-gray-500);text-transform:uppercase;display:block;margin-bottom:3px">Status</label>' +
          '<select id="posFeeActive_' + fee.id + '" style="width:100%;padding:8px;border:1px solid var(--pos-gray-200);border-radius:6px;font-size:14px">' +
          '<option value="1"' + (isOn ? ' selected' : '') + '>Active</option>' +
          '<option value="0"' + (!isOn ? ' selected' : '') + '>Disabled</option>' +
          '</select></div>' +
        '</div>' +
        '<button class="pos-btn pos-btn-sm" data-save-fee="' + fee.id + '" style="background:var(--pos-navy);color:white;width:100%"><i class="fas fa-save"></i> Save Changes</button>' +
      '</div>';
    });

    if (fees.length === 0) {
      html += '<div style="text-align:center;padding:32px;color:var(--pos-gray-400)"><i class="fas fa-sliders" style="font-size:36px"></i><p>No fee configurations found</p></div>';
    }
    html += '</div>';
    el.innerHTML = html;

    // Bind save buttons
    el.querySelectorAll('[data-save-fee]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var fid = btn.dataset.saveFee;
        var rate = parseFloat(document.getElementById('posFeeRate_' + fid).value) || 0;
        var maxFee = parseFloat(document.getElementById('posFeeMax_' + fid).value) || 0;
        var isActive = document.getElementById('posFeeActive_' + fid).value === '1';
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        API.put('/pos/fees/' + fid, { rate: rate, max_fee: maxFee, is_active: isActive }).then(function() {
          toast('Fee updated');
          btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
          // Reload fees to update everywhere
          API.get('/pos/fees').then(function(r2) { _s.fees = r2.data || []; loadFeeAdmin(); });
        }).catch(function(err) {
          toast('Error: ' + errMsg(err), 'error');
          btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
        });
      });
    });
  }).catch(function(err) {
    el.innerHTML = '<div class="pos-loading" style="color:var(--pos-red)">Error: ' + errMsg(err) + '</div>';
  });
}

// ==================== INVENTORY REQUESTS ====================

function loadInventoryRequests() {
  var el = document.getElementById('posViewInventory-requests');
  if (!el) return;
  el.innerHTML = '<div class="pos-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

  API.get('/pos/inventory-requests?location_id=' + getLocationId()).then(function(r) {
    var reqs = r.data || [];
    var html = '<div class="pos-cust-view-header">' +
      '<div class="pos-cust-view-title"><h2><i class="fas fa-boxes-stacked"></i> Inventory Requests</h2></div>' +
      '<div class="pos-cust-view-actions">' +
        '<button class="pos-btn pos-btn-add-cust" id="posNewInvReq"><i class="fas fa-plus"></i> New Request</button>' +
      '</div>' +
    '</div>';

    if (reqs.length === 0) {
      html += '<div class="pos-loading">No inventory requests yet</div>';
    } else {
      html += '<table class="pos-table"><thead><tr><th>Request #</th><th>Location</th><th>Items</th><th>Urgency</th><th>Status</th><th>Requested By</th><th>Date</th><th></th></tr></thead><tbody>';
      reqs.forEach(function(r) {
        var urgClass = r.urgency === 'critical' ? 'pos-badge-red' : r.urgency === 'high' ? 'pos-badge-orange' : r.urgency === 'low' ? 'pos-badge-blue' : '';
        var statClass = r.status === 'approved' ? 'pos-badge-green' : r.status === 'rejected' ? 'pos-badge-red' : r.status === 'fulfilled' ? 'pos-badge-purple' : 'pos-badge-blue';
        html += '<tr class="clickable" data-invreq-id="' + r.id + '">' +
          '<td style="font-weight:600;color:var(--pos-navy)">' + esc(r.request_number) + '</td>' +
          '<td>' + esc(r.location_name || '') + '</td>' +
          '<td>' + (r.item_count || 0) + ' items (' + (r.total_qty || 0) + ' qty)</td>' +
          '<td><span class="pos-badge ' + urgClass + '">' + esc(r.urgency) + '</span></td>' +
          '<td><span class="pos-badge ' + statClass + '">' + esc(r.status) + '</span></td>' +
          '<td>' + esc(r.requested_by_name || '') + '</td>' +
          '<td>' + (r.created_at || '').slice(0, 10) + '</td>' +
          '<td><button class="pos-btn pos-btn-sm" data-invreq-detail="' + r.id + '"><i class="fas fa-eye"></i></button></td>' +
        '</tr>';
      });
      html += '</tbody></table>';
    }

    el.innerHTML = html;
    on('posNewInvReq', 'click', function() { openInvRequestForm([]); });
    el.querySelectorAll('[data-invreq-detail]').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); openInvRequestDetail(parseInt(btn.dataset.invreqDetail)); });
    });
    el.querySelectorAll('[data-invreq-id]').forEach(function(row) {
      row.addEventListener('click', function() { openInvRequestDetail(parseInt(row.dataset.invreqId)); });
    });
  }).catch(function(err) {
    el.innerHTML = '<div class="pos-loading" style="color:var(--pos-red)">Error: ' + errMsg(err) + '</div>';
  });
}

function openInvRequestForm(prefillItems) {
  var user = getUser();
  var old = document.getElementById('posInvReqOverlay');
  if (old) old.remove();

  var html = '<div class="pos-modal-overlay" id="posInvReqOverlay">' +
    '<div class="pos-cust-sheet" style="max-width:700px">' +
      '<div class="pos-cust-sheet-header"><h3><i class="fas fa-paper-plane"></i> New Inventory Request</h3>' +
        '<button class="pos-modal-close" id="posInvReqClose"><i class="fas fa-times"></i></button></div>' +
      '<div class="pos-cust-sheet-body" style="padding:16px">' +
        '<div class="pos-cust-form-grid">' +
          '<div class="pos-cust-form-group">' +
            '<label>Urgency</label>' +
            '<select id="posInvReqUrgency"><option value="low">Low</option><option value="normal" selected>Normal</option><option value="high">High</option><option value="critical">Critical</option></select>' +
          '</div>' +
          '<div class="pos-cust-form-group">' +
            '<label>Reason</label>' +
            '<input type="text" id="posInvReqReason" placeholder="e.g. Running low, customer order">' +
          '</div>' +
          '<div class="pos-cust-form-group">' +
            '<label>Tag Customer</label>' +
            '<input type="text" id="posInvReqCustName" placeholder="Customer name (optional)" value="' + (_s.customer ? esc(_s.customer.business_name || _s.customer.contact_name || '') : '') + '">' +
            '<input type="hidden" id="posInvReqCustId" value="' + (_s.customer ? _s.customer.id : '') + '">' +
          '</div>' +
          '<div class="pos-cust-form-group">' +
            '<label><input type="checkbox" id="posInvReqNotify" ' + (_s.customer ? 'checked' : '') + ' style="margin-right:4px"> Notify customer when received</label>' +
          '</div>' +
          '<div class="pos-cust-form-group full">' +
            '<label>Notes</label>' +
            '<textarea id="posInvReqNotes" rows="2" placeholder="Additional details..."></textarea>' +
          '</div>' +
        '</div>' +
        '<h4 style="margin:12px 0 8px"><i class="fas fa-list"></i> Items <button class="pos-btn pos-btn-sm" id="posInvReqAddItem" style="margin-left:8px"><i class="fas fa-plus"></i> Add</button></h4>' +
        '<div id="posInvReqItemSearch" style="margin-bottom:8px;display:none;position:relative">' +
          '<input type="text" id="posInvReqSearchInput" placeholder="Search product..." style="width:100%;padding:8px;border:1px solid var(--pos-gray-200);border-radius:6px">' +
          '<div id="posInvReqSearchResults" style="position:absolute;top:100%;left:0;right:0;background:white;border:1px solid var(--pos-gray-200);border-radius:0 0 6px 6px;max-height:200px;overflow-y:auto;z-index:10;display:none"></div>' +
        '</div>' +
        '<table class="pos-table" id="posInvReqItemsTable"><thead><tr><th>Product</th><th class="right">Current Stock</th><th class="right">Reorder Point</th><th class="right">Qty Requested</th><th></th></tr></thead>' +
          '<tbody id="posInvReqItemsBody"></tbody></table>' +
      '</div>' +
      '<div class="pos-cust-sheet-footer">' +
        '<div style="flex:1"></div>' +
        '<button class="pos-btn pos-btn-hold" id="posInvReqCancelBtn">Cancel</button>' +
        '<button class="pos-btn pos-btn-pay" id="posInvReqSubmitBtn"><i class="fas fa-paper-plane"></i> Submit Request</button>' +
      '</div>' +
    '</div></div>';

  document.body.insertAdjacentHTML('beforeend', html);

  var _reqItems = prefillItems || [];
  renderInvReqItems();

  function renderInvReqItems() {
    var body = document.getElementById('posInvReqItemsBody');
    if (!body) return;
    if (_reqItems.length === 0) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--pos-gray-400);padding:16px">No items yet — click "Add" to search products</td></tr>';
      return;
    }
    var h = '';
    _reqItems.forEach(function(item, i) {
      h += '<tr>' +
        '<td>' + esc(item.product_name) + '</td>' +
        '<td class="right">' + (item.current_stock || 0) + '</td>' +
        '<td class="right">' + (item.reorder_point || 0) + '</td>' +
        '<td class="right"><input type="number" class="pos-inline-input" data-reqitem-qty="' + i + '" value="' + (item.qty_requested || 1) + '" min="1" style="width:60px;text-align:right"></td>' +
        '<td><button class="pos-btn pos-btn-sm" data-reqitem-remove="' + i + '" style="color:var(--pos-red)"><i class="fas fa-trash"></i></button></td>' +
      '</tr>';
    });
    body.innerHTML = h;
    body.querySelectorAll('[data-reqitem-qty]').forEach(function(inp) {
      inp.addEventListener('change', function() { _reqItems[parseInt(inp.dataset.reqitemQty)].qty_requested = parseInt(inp.value) || 1; });
    });
    body.querySelectorAll('[data-reqitem-remove]').forEach(function(btn) {
      btn.addEventListener('click', function() { _reqItems.splice(parseInt(btn.dataset.reqitemRemove), 1); renderInvReqItems(); });
    });
  }

  on('posInvReqAddItem', 'click', function() {
    var searchDiv = document.getElementById('posInvReqItemSearch');
    searchDiv.style.display = 'block';
    var inp = document.getElementById('posInvReqSearchInput');
    inp.focus();
  });

  var searchTimer;
  var searchInp = document.getElementById('posInvReqSearchInput');
  if (searchInp) searchInp.addEventListener('input', function() {
    clearTimeout(searchTimer);
    var term = searchInp.value;
    if (term.length < 1) { document.getElementById('posInvReqSearchResults').style.display = 'none'; return; }
    searchTimer = setTimeout(function() {
      API.get('/pos/products?search=' + encodeURIComponent(term) + '&location_id=' + getLocationId()).then(function(r) {
        var results = document.getElementById('posInvReqSearchResults');
        var products = r.data || [];
        if (products.length === 0) { results.innerHTML = '<div style="padding:8px;color:var(--pos-gray-400)">No products found</div>'; results.style.display = 'block'; return; }
        var h = '';
        products.forEach(function(p) {
          h += '<div class="pos-customer-option" data-add-product=\'' + JSON.stringify({id:p.id,name:p.name,stock:p.qty_available||0,reorder:p.reorder_point||0}).replace(/'/g,'&#39;') + '\'>' +
            '<div style="font-weight:600;font-size:13px">' + esc(p.name) + '</div>' +
            '<div style="font-size:11px;color:var(--pos-gray-500)">Stock: ' + (p.qty_available||0) + ' | Reorder: ' + (p.reorder_point||0) + '</div>' +
          '</div>';
        });
        results.innerHTML = h;
        results.style.display = 'block';
        results.querySelectorAll('[data-add-product]').forEach(function(opt) {
          opt.addEventListener('click', function() {
            var pd = JSON.parse(opt.dataset.addProduct);
            if (_reqItems.some(function(i) { return i.product_id === pd.id; })) { toast('Product already in list', 'error'); return; }
            var needed = Math.max(1, (pd.reorder||0) - (pd.stock||0));
            _reqItems.push({ product_id: pd.id, product_name: pd.name, qty_requested: needed, current_stock: pd.stock, reorder_point: pd.reorder });
            renderInvReqItems();
            results.style.display = 'none';
            searchInp.value = '';
            document.getElementById('posInvReqItemSearch').style.display = 'none';
          });
        });
      });
    }, 200);
  });

  on('posInvReqClose', 'click', function() { document.getElementById('posInvReqOverlay').remove(); });
  on('posInvReqCancelBtn', 'click', function() { document.getElementById('posInvReqOverlay').remove(); });
  on('posInvReqSubmitBtn', 'click', function() {
    if (_reqItems.length === 0) { toast('Add at least one item', 'error'); return; }
    var custId = gv('posInvReqCustId');
    var custName = gv('posInvReqCustName');
    var notifyCheck = document.getElementById('posInvReqNotify');
    API.post('/pos/inventory-request', {
      location_id: getLocationId(),
      urgency: gv('posInvReqUrgency'),
      reason: gv('posInvReqReason'),
      notes: gv('posInvReqNotes'),
      requested_by: user ? user.id : null,
      requested_by_name: user ? user.name : '',
      customer_id: custId ? parseInt(custId) : null,
      customer_name: custName || null,
      notify_customer: notifyCheck && notifyCheck.checked ? 1 : 0,
      items: _reqItems
    }).then(function(r) {
      toast('Inventory request ' + r.data.request_number + ' submitted');
      document.getElementById('posInvReqOverlay').remove();
      if (_s.view === 'inventory-requests') loadInventoryRequests();
    }).catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
  });
}

function openInvRequestDetail(id) {
  API.get('/pos/inventory-request/' + id).then(function(r) {
    var req = r.data.request;
    var items = r.data.items || [];
    var urgClass = req.urgency === 'critical' ? 'pos-badge-red' : req.urgency === 'high' ? 'pos-badge-orange' : req.urgency === 'low' ? 'pos-badge-blue' : '';
    var statClass = req.status === 'approved' ? 'pos-badge-green' : req.status === 'rejected' ? 'pos-badge-red' : req.status === 'fulfilled' ? 'pos-badge-purple' : 'pos-badge-blue';

    var old = document.getElementById('posInvReqDetailOverlay');
    if (old) old.remove();

    var html = '<div class="pos-modal-overlay" id="posInvReqDetailOverlay">' +
      '<div class="pos-cust-sheet" style="max-width:600px">' +
        '<div class="pos-cust-sheet-header"><h3><i class="fas fa-clipboard-list"></i> ' + esc(req.request_number) + '</h3>' +
          '<button class="pos-modal-close" id="posInvReqDetailClose"><i class="fas fa-times"></i></button></div>' +
        '<div class="pos-cust-sheet-body" style="padding:16px">' +
          '<div class="pos-cust-field">' + fld('Status', '<span class="pos-badge ' + statClass + '">' + esc(req.status) + '</span>') + '</div>' +
          fld('Urgency', '<span class="pos-badge ' + urgClass + '">' + esc(req.urgency) + '</span>') +
          fld('Location', req.location_name) +
          fld('Requested By', req.requested_by_name) +
          fld('Date', (req.created_at || '').slice(0, 16)) +
          fld('Reason', req.reason || '-') +
          fld('Notes', req.notes || '-') +
          (req.reviewed_by_name ? fld('Reviewed By', req.reviewed_by_name + ' on ' + (req.reviewed_at || '').slice(0, 10)) : '') +
          (req.review_notes ? fld('Review Notes', req.review_notes) : '') +
          '<h4 style="margin:12px 0 8px"><i class="fas fa-list"></i> Items</h4>' +
          '<table class="pos-table"><thead><tr><th>Product</th><th class="right">Current</th><th class="right">Reorder</th><th class="right">Requested</th><th class="right">Fulfilled</th></tr></thead><tbody>';

    items.forEach(function(item) {
      html += '<tr><td>' + esc(item.product_name || 'Product #' + item.product_id) + '</td>' +
        '<td class="right">' + (item.current_stock || 0) + '</td>' +
        '<td class="right">' + (item.reorder_point || 0) + '</td>' +
        '<td class="right" style="font-weight:700">' + item.qty_requested + '</td>' +
        '<td class="right">' + (item.qty_fulfilled || 0) + '</td></tr>';
    });

    html += '</tbody></table></div>';

    // Actions for pending requests
    if (req.status === 'pending') {
      html += '<div class="pos-cust-sheet-footer">' +
        '<button class="pos-btn" id="posInvReqReject" style="background:var(--pos-red);color:white"><i class="fas fa-times"></i> Reject</button>' +
        '<div style="flex:1"></div>' +
        '<button class="pos-btn" id="posInvReqCancel" style="background:var(--pos-gray-400);color:white"><i class="fas fa-ban"></i> Cancel</button>' +
        '<button class="pos-btn pos-btn-pay" id="posInvReqApprove"><i class="fas fa-check"></i> Approve</button>' +
      '</div>';
    } else {
      html += '<div class="pos-cust-sheet-footer"><div style="flex:1"></div><button class="pos-btn pos-btn-hold" id="posInvReqDetailCloseBtn">Close</button></div>';
    }

    html += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);

    on('posInvReqDetailClose', 'click', function() { document.getElementById('posInvReqDetailOverlay').remove(); });
    on('posInvReqDetailCloseBtn', 'click', function() { document.getElementById('posInvReqDetailOverlay').remove(); });

    var user = getUser();
    on('posInvReqApprove', 'click', function() {
      API.patch('/pos/inventory-request/' + id, { status: 'approved', reviewed_by: user ? user.id : null, reviewed_by_name: user ? user.name : '' })
        .then(function() { toast('Request approved'); document.getElementById('posInvReqDetailOverlay').remove(); loadInventoryRequests(); })
        .catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
    });
    on('posInvReqReject', 'click', function() {
      var notes = prompt('Rejection reason:');
      API.patch('/pos/inventory-request/' + id, { status: 'rejected', review_notes: notes || '', reviewed_by: user ? user.id : null, reviewed_by_name: user ? user.name : '' })
        .then(function() { toast('Request rejected'); document.getElementById('posInvReqDetailOverlay').remove(); loadInventoryRequests(); })
        .catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
    });
    on('posInvReqCancel', 'click', function() {
      API.patch('/pos/inventory-request/' + id, { status: 'cancelled' })
        .then(function() { toast('Request cancelled'); document.getElementById('posInvReqDetailOverlay').remove(); loadInventoryRequests(); })
        .catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
    });
  }).catch(function(err) { toast('Error loading request: ' + errMsg(err), 'error'); });
}

// ==================== MONTHLY STATEMENTS ====================

function loadStatements() {
  var el = document.getElementById('posViewStatements');
  if (!el) return;
  el.innerHTML = '<div class="pos-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

  API.get('/pos/account-customers').then(function(r) {
    var customers = r.data || [];

    var html = '<div class="pos-cust-view-header">' +
      '<div class="pos-cust-view-title"><h2><i class="fas fa-file-invoice-dollar"></i> Monthly Statements</h2></div>' +
      '<div class="pos-cust-view-actions">' +
        '<button class="pos-btn pos-btn-add-cust" id="posStmtViewAll"><i class="fas fa-list"></i> All Statements</button>' +
      '</div>' +
    '</div>';

    if (customers.length === 0) {
      html += '<div class="pos-loading">No account customers found. Customers with payment terms other than COD will appear here.</div>';
    } else {
      html += '<div class="pos-stmt-grid">';
      customers.forEach(function(c) {
        var balClass = (c.balance || 0) > 0 ? 'pos-badge-red' : 'pos-badge-green';
        html += '<div class="pos-stmt-card" data-stmt-cust="' + c.id + '">' +
          '<div class="pos-stmt-card-header">' +
            '<div class="pos-stmt-card-name">' + esc(c.business_name || c.contact_name) + '</div>' +
            '<span class="pos-badge ' + balClass + '">$' + (c.balance || 0).toFixed(2) + '</span>' +
          '</div>' +
          '<div class="pos-stmt-card-body">' +
            '<div class="pos-stmt-card-info">' + esc(c.payment_terms || 'Net 30') + ' &middot; ' + esc(c.account_status || 'active') + '</div>' +
            '<div class="pos-stmt-card-info">' + (c.total_sales || 0) + ' sales &middot; Last: ' + ((c.last_sale_date || '').slice(0, 10) || 'Never') + '</div>' +
            '<div class="pos-stmt-card-info">' + (c.statement_count || 0) + ' statements' + (c.last_statement_period ? ' &middot; Last: ' + c.last_statement_period : '') + '</div>' +
          '</div>' +
          '<div class="pos-stmt-card-actions">' +
            '<button class="pos-btn pos-btn-sm" data-gen-stmt="' + c.id + '" data-gen-name="' + escAttr(c.business_name || c.contact_name) + '"><i class="fas fa-file-circle-plus"></i> Generate</button>' +
            '<button class="pos-btn pos-btn-sm" data-view-stmts="' + c.id + '"><i class="fas fa-list"></i> History</button>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    }

    el.innerHTML = html;

    on('posStmtViewAll', 'click', function() { loadAllStatements(); });

    el.querySelectorAll('[data-gen-stmt]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        openGenerateStatement(parseInt(btn.dataset.genStmt), btn.dataset.genName);
      });
    });
    el.querySelectorAll('[data-view-stmts]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        loadAllStatements(parseInt(btn.dataset.viewStmts));
      });
    });
  }).catch(function(err) {
    el.innerHTML = '<div class="pos-loading" style="color:var(--pos-red)">Error: ' + errMsg(err) + '</div>';
  });
}

function openGenerateStatement(customerId, customerName) {
  var now = new Date();
  var firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  var lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  // Default to previous month
  var prevFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var prevLast = new Date(now.getFullYear(), now.getMonth(), 0);

  var old = document.getElementById('posStmtGenOverlay');
  if (old) old.remove();

  var html = '<div class="pos-modal-overlay" id="posStmtGenOverlay">' +
    '<div class="pos-cust-sheet" style="max-width:500px">' +
      '<div class="pos-cust-sheet-header"><h3><i class="fas fa-file-circle-plus"></i> Generate Statement</h3>' +
        '<button class="pos-modal-close" id="posStmtGenClose"><i class="fas fa-times"></i></button></div>' +
      '<div class="pos-cust-sheet-body" style="padding:16px">' +
        '<div class="pos-cust-form-grid">' +
          '<div class="pos-cust-form-group full">' +
            '<label>Customer</label>' +
            '<input type="text" value="' + esc(customerName || '') + '" disabled style="background:var(--pos-gray-100)">' +
          '</div>' +
          '<div class="pos-cust-form-group">' +
            '<label>Period Start</label>' +
            '<input type="date" id="posStmtStart" value="' + prevFirst.toISOString().slice(0,10) + '">' +
          '</div>' +
          '<div class="pos-cust-form-group">' +
            '<label>Period End</label>' +
            '<input type="date" id="posStmtEnd" value="' + prevLast.toISOString().slice(0,10) + '">' +
          '</div>' +
          '<div class="pos-cust-form-group full">' +
            '<label>Due Date</label>' +
            '<input type="date" id="posStmtDue" value="' + lastDay.toISOString().slice(0,10) + '">' +
          '</div>' +
          '<div class="pos-cust-form-group full">' +
            '<label>Notes</label>' +
            '<textarea id="posStmtNotes" rows="2" placeholder="Optional notes..."></textarea>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="pos-cust-sheet-footer">' +
        '<div style="flex:1"></div>' +
        '<button class="pos-btn pos-btn-hold" id="posStmtGenCancelBtn">Cancel</button>' +
        '<button class="pos-btn pos-btn-pay" id="posStmtGenSubmit"><i class="fas fa-file-circle-plus"></i> Generate</button>' +
      '</div>' +
    '</div></div>';

  document.body.insertAdjacentHTML('beforeend', html);
  on('posStmtGenClose', 'click', function() { document.getElementById('posStmtGenOverlay').remove(); });
  on('posStmtGenCancelBtn', 'click', function() { document.getElementById('posStmtGenOverlay').remove(); });
  on('posStmtGenSubmit', 'click', function() {
    var user = getUser();
    API.post('/pos/statements/generate', {
      customer_id: customerId,
      period_start: gv('posStmtStart'),
      period_end: gv('posStmtEnd'),
      due_date: gv('posStmtDue'),
      notes: gv('posStmtNotes'),
      generated_by: user ? user.id : null,
      generated_by_name: user ? user.name : ''
    }).then(function(r) {
      toast('Statement ' + r.data.statement_number + ' generated. Balance: $' + (r.data.closing_balance || 0).toFixed(2));
      document.getElementById('posStmtGenOverlay').remove();
      openStatementDetail(r.data.id);
    }).catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
  });
}

function loadAllStatements(customerId) {
  var old = document.getElementById('posStmtListOverlay');
  if (old) old.remove();

  var url = '/pos/statements';
  if (customerId) url += '?customer_id=' + customerId;

  API.get(url).then(function(r) {
    var stmts = r.data || [];
    var html = '<div class="pos-modal-overlay" id="posStmtListOverlay">' +
      '<div class="pos-cust-sheet" style="max-width:800px">' +
        '<div class="pos-cust-sheet-header"><h3><i class="fas fa-file-invoice-dollar"></i> Statement History</h3>' +
          '<button class="pos-modal-close" id="posStmtListClose"><i class="fas fa-times"></i></button></div>' +
        '<div class="pos-cust-sheet-body" style="padding:16px">';

    if (stmts.length === 0) {
      html += '<div class="pos-loading">No statements found</div>';
    } else {
      html += '<table class="pos-table"><thead><tr><th>Statement #</th><th>Customer</th><th>Period</th><th>Status</th><th class="right">Charges</th><th class="right">Payments</th><th class="right">Balance</th><th></th></tr></thead><tbody>';
      stmts.forEach(function(s) {
        var statClass = s.status === 'paid' ? 'pos-badge-green' : s.status === 'overdue' ? 'pos-badge-red' : s.status === 'sent' ? 'pos-badge-blue' : '';
        html += '<tr class="clickable" data-stmt-id="' + s.id + '">' +
          '<td style="font-weight:600;color:var(--pos-navy)">' + esc(s.statement_number) + '</td>' +
          '<td>' + esc(s.business_name || s.contact_name || '') + '</td>' +
          '<td>' + (s.period_start || '') + ' to ' + (s.period_end || '') + '</td>' +
          '<td><span class="pos-badge ' + statClass + '">' + esc(s.status) + '</span></td>' +
          '<td class="right money">$' + (s.total_charges || 0).toFixed(2) + '</td>' +
          '<td class="right money">$' + (s.total_payments || 0).toFixed(2) + '</td>' +
          '<td class="right money" style="font-weight:700">$' + (s.closing_balance || 0).toFixed(2) + '</td>' +
          '<td><button class="pos-btn pos-btn-sm" data-stmt-view="' + s.id + '"><i class="fas fa-eye"></i></button></td>' +
        '</tr>';
      });
      html += '</tbody></table>';
    }

    html += '</div><div class="pos-cust-sheet-footer"><div style="flex:1"></div><button class="pos-btn pos-btn-hold" id="posStmtListCloseBtn">Close</button></div></div></div>';

    document.body.insertAdjacentHTML('beforeend', html);
    on('posStmtListClose', 'click', function() { document.getElementById('posStmtListOverlay').remove(); });
    on('posStmtListCloseBtn', 'click', function() { document.getElementById('posStmtListOverlay').remove(); });

    document.querySelectorAll('[data-stmt-view]').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); openStatementDetail(parseInt(btn.dataset.stmtView)); });
    });
    document.querySelectorAll('[data-stmt-id]').forEach(function(row) {
      row.addEventListener('click', function() { openStatementDetail(parseInt(row.dataset.stmtId)); });
    });
  });
}

function openStatementDetail(id) {
  API.get('/pos/statements/' + id).then(function(r) {
    var s = r.data.statement;
    var lines = r.data.lines || [];

    var old = document.getElementById('posStmtDetailOverlay');
    if (old) old.remove();

    var statClass = s.status === 'paid' ? 'pos-badge-green' : s.status === 'overdue' ? 'pos-badge-red' : s.status === 'sent' ? 'pos-badge-blue' : '';
    var html = '<div class="pos-modal-overlay" id="posStmtDetailOverlay">' +
      '<div class="pos-cust-sheet pos-stmt-detail" style="max-width:800px">' +
        '<div class="pos-cust-sheet-header"><h3><i class="fas fa-file-invoice-dollar"></i> ' + esc(s.statement_number) + '</h3>' +
          '<button class="pos-modal-close" id="posStmtDetailClose"><i class="fas fa-times"></i></button></div>' +
        '<div class="pos-cust-sheet-body pos-stmt-print" id="posStmtPrintArea" style="padding:16px">' +
          '<div class="pos-stmt-header-block">' +
            '<div>' +
              '<h2 style="margin:0 0 4px;font-size:18px">STATEMENT</h2>' +
              '<div style="font-size:12px;color:var(--pos-gray-500)">' + esc(s.statement_number) + '</div>' +
            '</div>' +
            '<div style="text-align:right">' +
              '<div style="font-weight:600">' + esc(s.business_name || s.contact_name || '') + '</div>' +
              '<div style="font-size:12px">' + esc(s.phone || '') + (s.email ? ' | ' + esc(s.email) : '') + '</div>' +
              (s.address ? '<div style="font-size:12px">' + esc(s.address) + '</div>' : '') +
            '</div>' +
          '</div>' +
          '<div class="pos-stmt-summary">' +
            '<div>Period: <strong>' + (s.period_start || '') + '</strong> to <strong>' + (s.period_end || '') + '</strong></div>' +
            '<div>Due Date: <strong>' + (s.due_date || '-') + '</strong></div>' +
            '<div>Status: <span class="pos-badge ' + statClass + '">' + esc(s.status) + '</span></div>' +
          '</div>' +
          '<table class="pos-table pos-stmt-lines-table"><thead><tr><th>Date</th><th>Description</th><th>Reference</th><th class="right">Amount</th><th class="right">Balance</th></tr></thead><tbody>';

    lines.forEach(function(l) {
      var isCredit = l.amount < 0 || l.line_type === 'payment' || l.line_type === 'credit';
      html += '<tr' + (l.line_type === 'opening_balance' ? ' style="background:var(--pos-gray-50);font-weight:600"' : '') + '>' +
        '<td>' + (l.line_date || '') + '</td>' +
        '<td>' + esc(l.description || '') + '</td>' +
        '<td style="font-size:11px">' + esc(l.reference_number || '') + '</td>' +
        '<td class="right" style="color:' + (isCredit ? 'var(--pos-green)' : 'inherit') + '">' +
          (l.line_type !== 'opening_balance' ? (l.amount >= 0 ? '$' : '-$') + Math.abs(l.amount).toFixed(2) : '') + '</td>' +
        '<td class="right" style="font-weight:600">$' + (l.running_balance || 0).toFixed(2) + '</td>' +
      '</tr>';
    });

    html += '</tbody></table>' +
          '<div class="pos-stmt-totals">' +
            '<div>Opening Balance: <strong>$' + (s.opening_balance || 0).toFixed(2) + '</strong></div>' +
            '<div>Total Charges: <strong style="color:var(--pos-red)">$' + (s.total_charges || 0).toFixed(2) + '</strong></div>' +
            '<div>Total Payments: <strong style="color:var(--pos-green)">-$' + (s.total_payments || 0).toFixed(2) + '</strong></div>' +
            '<div style="font-size:16px;border-top:2px solid var(--pos-navy);padding-top:8px">Balance Due: <strong>$' + (s.closing_balance || 0).toFixed(2) + '</strong></div>' +
          '</div>' +
          (s.notes ? '<div style="margin-top:12px;padding:8px;background:var(--pos-gray-50);border-radius:6px;font-size:12px"><strong>Notes:</strong> ' + esc(s.notes) + '</div>' : '') +
        '</div>';

    // Actions
    html += '<div class="pos-cust-sheet-footer no-print">';
    if (s.status === 'draft') {
      html += '<button class="pos-btn" id="posStmtMarkSent" style="background:var(--pos-navy);color:white"><i class="fas fa-paper-plane"></i> Mark Sent</button>';
    }
    if (s.status !== 'paid' && s.status !== 'void') {
      html += '<button class="pos-btn" id="posStmtMarkPaid" style="background:var(--pos-green);color:white"><i class="fas fa-check"></i> Mark Paid</button>';
    }
    html += '<div style="flex:1"></div>' +
      '<button class="pos-btn" id="posStmtPrint" style="background:var(--pos-gray-600);color:white"><i class="fas fa-print"></i> Print</button>' +
      '<button class="pos-btn pos-btn-hold" id="posStmtDetailCloseBtn">Close</button>' +
    '</div></div></div>';

    document.body.insertAdjacentHTML('beforeend', html);

    on('posStmtDetailClose', 'click', function() { document.getElementById('posStmtDetailOverlay').remove(); });
    on('posStmtDetailCloseBtn', 'click', function() { document.getElementById('posStmtDetailOverlay').remove(); });

    on('posStmtMarkSent', 'click', function() {
      API.patch('/pos/statements/' + id, { status: 'sent', sent_at: new Date().toISOString(), sent_method: 'manual' })
        .then(function() { toast('Statement marked as sent'); document.getElementById('posStmtDetailOverlay').remove(); openStatementDetail(id); })
        .catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
    });
    on('posStmtMarkPaid', 'click', function() {
      API.patch('/pos/statements/' + id, { status: 'paid' })
        .then(function() { toast('Statement marked as paid'); document.getElementById('posStmtDetailOverlay').remove(); if (_s.view === 'statements') loadStatements(); })
        .catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
    });
    on('posStmtPrint', 'click', function() {
      var printArea = document.getElementById('posStmtPrintArea');
      if (!printArea) return;
      var w = window.open('', '_blank');
      w.document.write('<html><head><title>Statement ' + esc(s.statement_number) + '</title>' +
        '<style>body{font-family:system-ui,-apple-system,sans-serif;padding:20px;font-size:12px}table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}.right{text-align:right}h2{margin:0}' +
        '.pos-stmt-header-block{display:flex;justify-content:space-between;margin-bottom:16px}.pos-stmt-summary{display:flex;gap:20px;margin:12px 0;padding:10px;background:#f8f8f8;border-radius:4px}' +
        '.pos-stmt-totals{margin-top:16px;text-align:right;line-height:1.8}.pos-badge{padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700}' +
        '</style></head><body>' + printArea.innerHTML + '</body></html>');
      w.document.close();
      w.print();
    });
  }).catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
}

// ==================== QUICK-EDIT CUSTOMER (inline from panel) ====================

function openQuickEditCustomer(custId) {
  API.get('/pos/customers/' + custId).then(function(r) {
    var c = r.data.customer;
    var acct = r.data.account || {};
    var crmOrg = r.data.crmOrg;

    var old = document.getElementById('posQuickEditOverlay');
    if (old) old.remove();

    var html = '<div class="pos-modal-overlay" id="posQuickEditOverlay">' +
      '<div class="pos-cust-sheet" style="max-width:500px">' +
        '<div class="pos-cust-sheet-header"><h3><i class="fas fa-pen"></i> Quick Edit</h3>' +
          '<button class="pos-modal-close" id="posQEClose"><i class="fas fa-times"></i></button></div>' +
        '<div class="pos-cust-sheet-body" style="padding:16px">' +
          '<div class="pos-cust-form-grid">' +
            '<div class="pos-cust-form-group full">' +
              '<label>Business Name</label>' +
              '<input type="text" id="posQEBizName" value="' + esc(c.business_name || '') + '">' +
            '</div>' +
            '<div class="pos-cust-form-group">' +
              '<label>Contact Name</label>' +
              '<input type="text" id="posQEContact" value="' + esc(c.contact_name || '') + '">' +
            '</div>' +
            '<div class="pos-cust-form-group">' +
              '<label>Phone</label>' +
              '<input type="tel" id="posQEPhone" value="' + esc(c.phone || '') + '">' +
            '</div>' +
            '<div class="pos-cust-form-group">' +
              '<label>Email</label>' +
              '<input type="email" id="posQEEmail" value="' + esc(c.email || '') + '">' +
            '</div>' +
            '<div class="pos-cust-form-group">' +
              '<label>Payment Terms</label>' +
              '<select id="posQETerms">' +
                '<option value="COD"' + ((acct.payment_terms||'COD')==='COD'?' selected':'') + '>COD</option>' +
                '<option value="Net 7"' + ((acct.payment_terms)==='Net 7'?' selected':'') + '>Net 7</option>' +
                '<option value="Net 15"' + ((acct.payment_terms)==='Net 15'?' selected':'') + '>Net 15</option>' +
                '<option value="Net 30"' + ((acct.payment_terms)==='Net 30'?' selected':'') + '>Net 30</option>' +
                '<option value="Net 60"' + ((acct.payment_terms)==='Net 60'?' selected':'') + '>Net 60</option>' +
                '<option value="Monthly"' + ((acct.payment_terms)==='Monthly'?' selected':'') + '>Monthly</option>' +
              '</select>' +
            '</div>' +
            '<div class="pos-cust-form-group">' +
              '<label>Credit Limit</label>' +
              '<input type="number" id="posQECreditLimit" value="' + (acct.credit_limit || 0) + '" min="0" step="100">' +
            '</div>' +
            '<div class="pos-cust-form-group full">' +
              '<label>Notes</label>' +
              '<textarea id="posQENotes" rows="3">' + esc(c.notes || '') + '</textarea>' +
            '</div>' +
            '<div class="pos-cust-form-group full">' +
              '<label>Tags</label>' +
              '<input type="text" id="posQETags" value="' + esc(c.tags || '') + '" placeholder="comma-separated">' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="pos-cust-sheet-footer">' +
          '<div style="flex:1"></div>' +
          '<button class="pos-btn pos-btn-hold" id="posQECancelBtn">Cancel</button>' +
          '<button class="pos-btn pos-btn-pay" id="posQESaveBtn"><i class="fas fa-save"></i> Save</button>' +
        '</div>' +
      '</div></div>';

    document.body.insertAdjacentHTML('beforeend', html);

    on('posQEClose', 'click', function() { document.getElementById('posQuickEditOverlay').remove(); });
    on('posQECancelBtn', 'click', function() { document.getElementById('posQuickEditOverlay').remove(); });
    on('posQESaveBtn', 'click', function() {
      var body = {
        business_name: gv('posQEBizName'),
        contact_name: gv('posQEContact'),
        phone: gv('posQEPhone'),
        email: gv('posQEEmail'),
        notes: gv('posQENotes'),
        tags: gv('posQETags'),
        payment_terms: gv('posQETerms'),
        credit_limit: parseFloat(gv('posQECreditLimit') || '0')
      };
      API.patch('/pos/customer-manage/' + custId, body).then(function(r) {
        toast('Customer updated');
        document.getElementById('posQuickEditOverlay').remove();
        // Refresh customer in register if selected
        if (_s.customer && _s.customer.id === custId) {
          selectCustomer(custId);
        }
      }).catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
    });
  }).catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
}

// ==================== CRM TAB in Customer Sheet ====================

function loadCRMTabContent(custId) {
  var container = document.getElementById('posCustCRMTabContent');
  if (!container) return;
  container.innerHTML = '<div class="pos-loading"><i class="fas fa-spinner fa-spin"></i> Loading CRM data...</div>';

  API.get('/pos/customer-crm/' + custId).then(function(r) {
    var org = r.data.organization;
    var contacts = r.data.contacts || [];
    var activities = r.data.activities || [];
    var html = '';

    if (org) {
      html += '<div class="pos-crm-linked-banner"><i class="fas fa-check-circle"></i> Linked to: <strong>' + esc(org.name) + '</strong> (' + esc(org.org_type) + ')</div>';
      html += fld('Phone', org.phone) + fld('Email', org.email) + fld('Industry', org.industry) + fld('Tags', org.tags);

      if (contacts.length > 0) {
        html += '<h4 style="margin:12px 0 4px"><i class="fas fa-users"></i> Contacts</h4>';
        contacts.forEach(function(ct) {
          html += '<div style="padding:4px 0;border-bottom:1px solid var(--pos-gray-100);font-size:12px">' +
            '<strong>' + esc((ct.first_name||'') + ' ' + (ct.last_name||'')) + '</strong>' +
            (ct.is_primary ? ' <span class="pos-badge pos-badge-green">Primary</span>' : '') +
            (ct.phone ? ' &middot; ' + esc(ct.phone) : '') + (ct.email ? ' &middot; ' + esc(ct.email) : '') +
          '</div>';
        });
      }

      if (activities.length > 0) {
        html += '<h4 style="margin:12px 0 4px"><i class="fas fa-list-check"></i> Recent Activities</h4>';
        activities.forEach(function(a) {
          html += '<div style="padding:4px 0;border-bottom:1px solid var(--pos-gray-100);font-size:12px">' +
            '<span class="pos-badge">' + esc(a.activity_type) + '</span> ' + esc(a.subject || '') +
            ' <span style="color:var(--pos-gray-400)">' + (a.activity_date || '').slice(0, 10) + '</span></div>';
        });
      }

      html += '<div style="margin-top:12px"><button class="pos-btn pos-btn-sm" id="posCustCRMUnlink" style="background:var(--pos-red);color:white"><i class="fas fa-unlink"></i> Unlink</button>' +
        ' <button class="pos-btn pos-btn-sm" id="posCustCRMOpen" style="background:var(--pos-navy);color:white"><i class="fas fa-external-link-alt"></i> Full CRM View</button></div>';
    } else {
      html += '<div class="pos-crm-unlinked-banner"><i class="fas fa-unlink"></i> Not linked to any CRM organization</div>';
      html += '<div style="margin:12px 0">' +
        '<button class="pos-btn pos-btn-pay" id="posCustCRMCreate"><i class="fas fa-plus"></i> Create CRM Organization</button>' +
        ' <button class="pos-btn pos-btn-sm" id="posCustCRMLinkSearch" style="margin-left:8px"><i class="fas fa-search"></i> Search & Link</button>' +
      '</div>';
    }

    container.innerHTML = html;

    on('posCustCRMUnlink', 'click', function() {
      if (!confirm('Unlink from CRM?')) return;
      API.delete('/pos/customer-crm-link/' + custId).then(function() { toast('Unlinked'); loadCRMTabContent(custId); })
        .catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
    });
    on('posCustCRMOpen', 'click', function() {
      closeCustomerSheet();
      openCRMLink(custId);
    });
    on('posCustCRMCreate', 'click', function() {
      var user = getUser();
      API.post('/pos/customer-crm-link', { customer_id: custId, create_org: true, created_by: user ? user.id : null }).then(function() {
        toast('CRM org created'); loadCRMTabContent(custId);
      }).catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
    });
    on('posCustCRMLinkSearch', 'click', function() {
      closeCustomerSheet();
      openCRMLink(custId);
    });
  }).catch(function(err) {
    container.innerHTML = '<div style="color:var(--pos-red)">Error: ' + errMsg(err) + '</div>';
  });
}

// ==================== POS ↔ CRM LINKING ====================

function openCRMLink(custId) {
  API.get('/pos/customer-crm/' + custId).then(function(r) {
    var org = r.data.organization;
    var contacts = r.data.contacts || [];
    var activities = r.data.activities || [];
    var opportunities = r.data.opportunities || [];

    var old = document.getElementById('posCRMLinkOverlay');
    if (old) old.remove();

    var html = '<div class="pos-modal-overlay" id="posCRMLinkOverlay">' +
      '<div class="pos-cust-sheet" style="max-width:700px">' +
        '<div class="pos-cust-sheet-header"><h3><i class="fas fa-link"></i> CRM Link</h3>' +
          '<button class="pos-modal-close" id="posCRMLinkClose"><i class="fas fa-times"></i></button></div>' +
        '<div class="pos-cust-sheet-body" style="padding:16px">';

    if (org) {
      // Linked — show CRM data
      html += '<div class="pos-crm-linked-banner"><i class="fas fa-check-circle"></i> Linked to CRM Organization</div>';
      html += '<div class="pos-cust-section"><h4><i class="fas fa-building"></i> ' + esc(org.name) + '</h4>' +
        fld('Type', org.org_type) + fld('Phone', org.phone) + fld('Email', org.email) +
        fld('Industry', org.industry) + fld('Tags', org.tags) +
        (org.address_street ? fld('Address', org.address_street + ', ' + (org.address_city||'') + ' ' + (org.address_state||'') + ' ' + (org.address_zip||'')) : '') +
      '</div>';

      if (contacts.length > 0) {
        html += '<div class="pos-cust-section"><h4><i class="fas fa-users"></i> Contacts (' + contacts.length + ')</h4>';
        contacts.forEach(function(ct) {
          html += '<div class="pos-crm-contact-row">' +
            '<div><strong>' + esc((ct.first_name||'') + ' ' + (ct.last_name||'')) + '</strong>' + (ct.is_primary ? ' <span class="pos-badge pos-badge-green">Primary</span>' : '') + '</div>' +
            '<div style="font-size:11px;color:var(--pos-gray-500)">' + esc(ct.title||'') + (ct.phone ? ' &middot; ' + esc(ct.phone) : '') + (ct.email ? ' &middot; ' + esc(ct.email) : '') + '</div>' +
          '</div>';
        });
        html += '</div>';
      }

      if (opportunities.length > 0) {
        html += '<div class="pos-cust-section"><h4><i class="fas fa-handshake"></i> Opportunities (' + opportunities.length + ')</h4>';
        opportunities.forEach(function(opp) {
          var stageClass = opp.stage === 'won' ? 'pos-badge-green' : opp.stage === 'lost' ? 'pos-badge-red' : 'pos-badge-blue';
          html += '<div style="padding:4px 0;border-bottom:1px solid var(--pos-gray-100);font-size:12px;display:flex;justify-content:space-between">' +
            '<span>' + esc(opp.name) + '</span><span class="pos-badge ' + stageClass + '">' + esc(opp.stage) + '</span></div>';
        });
        html += '</div>';
      }

      if (activities.length > 0) {
        html += '<div class="pos-cust-section"><h4><i class="fas fa-list-check"></i> Recent Activities</h4>';
        activities.forEach(function(a) {
          html += '<div style="padding:4px 0;border-bottom:1px solid var(--pos-gray-100);font-size:12px">' +
            '<span class="pos-badge">' + esc(a.activity_type) + '</span> ' + esc(a.subject || '') + ' <span style="color:var(--pos-gray-400)">' + (a.activity_date || '').slice(0, 10) + '</span></div>';
        });
        html += '</div>';
      }

      html += '<div style="margin-top:12px"><button class="pos-btn" id="posCRMUnlink" style="background:var(--pos-red);color:white;font-size:12px"><i class="fas fa-unlink"></i> Unlink from CRM</button></div>';
    } else {
      // Not linked — show link options
      html += '<div class="pos-crm-unlinked-banner"><i class="fas fa-unlink"></i> Not linked to CRM</div>';
      html += '<div style="margin:16px 0">' +
        '<h4>Link to Existing Organization</h4>' +
        '<div style="position:relative;margin:8px 0">' +
          '<input type="text" id="posCRMLinkSearch" placeholder="Search CRM organizations..." style="width:100%;padding:8px;border:1px solid var(--pos-gray-200);border-radius:6px">' +
          '<div id="posCRMLinkResults" style="position:absolute;top:100%;left:0;right:0;background:white;border:1px solid var(--pos-gray-200);border-radius:0 0 6px 6px;max-height:200px;overflow-y:auto;z-index:10;display:none"></div>' +
        '</div>' +
        '<div style="margin-top:16px;text-align:center;padding:12px;border:2px dashed var(--pos-gray-200);border-radius:8px">' +
          '<p style="color:var(--pos-gray-500);margin:0 0 8px;font-size:12px">Or create a new CRM organization from this customer</p>' +
          '<button class="pos-btn pos-btn-pay" id="posCRMCreateOrg"><i class="fas fa-plus"></i> Create CRM Organization</button>' +
        '</div>' +
      '</div>';
    }

    html += '</div><div class="pos-cust-sheet-footer"><div style="flex:1"></div><button class="pos-btn pos-btn-hold" id="posCRMLinkCloseBtn">Close</button></div></div></div>';

    document.body.insertAdjacentHTML('beforeend', html);

    on('posCRMLinkClose', 'click', function() { document.getElementById('posCRMLinkOverlay').remove(); });
    on('posCRMLinkCloseBtn', 'click', function() { document.getElementById('posCRMLinkOverlay').remove(); });

    if (org) {
      on('posCRMUnlink', 'click', function() {
        if (!confirm('Unlink this customer from CRM organization "' + org.name + '"?')) return;
        API.delete('/pos/customer-crm-link/' + custId).then(function() {
          toast('CRM link removed');
          document.getElementById('posCRMLinkOverlay').remove();
          openCRMLink(custId);
        }).catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
      });
    } else {
      // Search CRM orgs
      var searchTimer;
      var searchInp = document.getElementById('posCRMLinkSearch');
      if (searchInp) searchInp.addEventListener('input', function() {
        clearTimeout(searchTimer);
        var term = searchInp.value;
        if (term.length < 2) { document.getElementById('posCRMLinkResults').style.display = 'none'; return; }
        searchTimer = setTimeout(function() {
          API.get('/pos/crm-orgs-search?search=' + encodeURIComponent(term)).then(function(r) {
            var results = document.getElementById('posCRMLinkResults');
            var orgs = r.data || [];
            if (orgs.length === 0) { results.innerHTML = '<div style="padding:8px;color:var(--pos-gray-400)">No unlinked organizations found</div>'; results.style.display = 'block'; return; }
            var h = '';
            orgs.forEach(function(o) {
              h += '<div class="pos-customer-option" data-link-org="' + o.id + '">' +
                '<div style="font-weight:600;font-size:13px">' + esc(o.name) + '</div>' +
                '<div style="font-size:11px;color:var(--pos-gray-500)">' + esc(o.org_type || '') + (o.phone ? ' &middot; ' + esc(o.phone) : '') + '</div>' +
              '</div>';
            });
            results.innerHTML = h;
            results.style.display = 'block';
            results.querySelectorAll('[data-link-org]').forEach(function(opt) {
              opt.addEventListener('click', function() {
                API.post('/pos/customer-crm-link', { customer_id: custId, organization_id: parseInt(opt.dataset.linkOrg) }).then(function() {
                  toast('Linked to CRM organization');
                  document.getElementById('posCRMLinkOverlay').remove();
                  openCRMLink(custId);
                }).catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
              });
            });
          });
        }, 300);
      });

      on('posCRMCreateOrg', 'click', function() {
        var user = getUser();
        API.post('/pos/customer-crm-link', { customer_id: custId, create_org: true, created_by: user ? user.id : null }).then(function(r) {
          toast('CRM organization created and linked');
          document.getElementById('posCRMLinkOverlay').remove();
          openCRMLink(custId);
        }).catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
      });
    }
  }).catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
}

// ==================== DARTS QUEUE ====================
var _dartsData = [];
var _dartsFilter = 'pending'; // pending, completed, all

function loadDartsQueue() {
  var el = document.getElementById('posViewDarts-queue');
  if (!el) return;
  el.innerHTML = '<div class="pos-loading"><i class="fas fa-spinner fa-spin"></i> Loading DARTS queue...</div>';

  var qp = 'status=' + _dartsFilter;
  if (_dartsFilter === 'completed' || _dartsFilter === 'all') qp += '&include_completed=1';

  API.get('/pos/darts-queue?' + qp).then(function(r) {
    _dartsData = r.data.tasks || [];
    var counts = r.data.counts || {};
    var pending = (counts.pending || 0) + (counts.in_progress || 0);

    // Update badge in topbar
    var badge = document.getElementById('posDartsBadge');
    if (badge) { badge.textContent = pending; badge.style.display = pending > 0 ? '' : 'none'; }

    var html = '<div class="pos-cust-view-header">' +
      '<div class="pos-cust-view-title"><h2><i class="fas fa-satellite-dish" style="color:#8B5CF6"></i> DARTS Entry Queue</h2>' +
      '<span style="font-size:12px;color:var(--pos-gray-500)">Delivery orders from LOX POS that need entering into DARTS</span></div>' +
      '<div style="display:flex;gap:8px;align-items:center">' +
        '<button class="pos-btn pos-btn-sm" id="dartsRefresh" style="background:var(--pos-navy);color:white"><i class="fas fa-sync"></i></button>' +
      '</div></div>';

    // Summary cards
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin:12px 0">';
    html += '<div style="padding:14px;background:white;border:1px solid var(--pos-gray-200);border-radius:10px;border-left:4px solid #EF4444">' +
      '<div style="font-size:11px;color:var(--pos-gray-500);text-transform:uppercase;font-weight:600">Pending</div>' +
      '<div style="font-size:28px;font-weight:800;color:#EF4444">' + (counts.pending || 0) + '</div></div>';
    html += '<div style="padding:14px;background:white;border:1px solid var(--pos-gray-200);border-radius:10px;border-left:4px solid #10B981">' +
      '<div style="font-size:11px;color:var(--pos-gray-500);text-transform:uppercase;font-weight:600">Done Today</div>' +
      '<div style="font-size:28px;font-weight:800;color:#10B981">' + (counts.completed_today || 0) + '</div></div>';
    html += '</div>';

    // Filter tabs
    html += '<div style="display:flex;gap:6px;margin-bottom:16px">';
    ['pending','completed','all'].forEach(function(f) {
      var active = _dartsFilter === f;
      var label = f === 'pending' ? 'Pending' : f === 'completed' ? 'Completed' : 'All';
      html += '<button class="pos-btn pos-btn-sm" onclick="window.dartsSetFilter(\'' + f + '\')" style="' +
        (active ? 'background:#8B5CF6;color:white;font-weight:700' : 'background:var(--pos-gray-100);color:var(--pos-gray-600)') +
        '">' + label + '</button>';
    });
    html += '</div>';

    // Task cards
    if (_dartsData.length === 0) {
      html += '<div style="text-align:center;padding:48px;color:var(--pos-gray-400)">' +
        '<i class="fas fa-check-circle" style="font-size:48px;color:#10B981;display:block;margin-bottom:12px"></i>' +
        '<div style="font-size:16px;font-weight:600;color:var(--pos-navy)">All caught up!</div>' +
        '<div style="font-size:13px;margin-top:4px">No pending DARTS entries</div></div>';
    } else {
      html += '<div style="display:flex;flex-direction:column;gap:10px">';
      _dartsData.forEach(function(t) {
        var isPending = t.status === 'pending' || t.status === 'in_progress';
        var borderColor = isPending ? '#8B5CF6' : '#10B981';
        var priorityBadge = t.priority === 'high' || t.priority === 'critical'
          ? '<span style="background:#FEE2E2;color:#DC2626;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:700"><i class="fas fa-arrow-up"></i> ' + t.priority.toUpperCase() + '</span> '
          : '';

        html += '<div style="background:white;border:1px solid var(--pos-gray-200);border-radius:12px;padding:16px;border-left:4px solid ' + borderColor + '">';

        // Header row
        html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">' +
              priorityBadge +
              '<span style="font-weight:800;font-size:15px;color:var(--pos-navy)">' + esc(t.customer_name || t.customer_display_name || 'Unknown') + '</span>' +
              (t.customer_phone ? '<span style="font-size:12px;color:var(--pos-gray-500)"><i class="fas fa-phone"></i> ' + esc(t.customer_phone) + '</span>' : '') +
            '</div>' +
            '<div style="font-size:12px;color:var(--pos-gray-500);margin-bottom:8px">' +
              '<span style="background:#EDE9FE;color:#7C3AED;padding:2px 8px;border-radius:6px;font-weight:600"><i class="fas fa-hashtag"></i> ' + esc(t.ref_number || t.order_number || '') + '</span> ' +
              (t.sale_number ? '<span style="color:var(--pos-gray-400)">Sale #' + esc(t.sale_number) + '</span> ' : '') +
              '<span><i class="fas fa-clock"></i> ' + timeAgo(t.created_at) + '</span>' +
              (t.cashier_name ? ' <span><i class="fas fa-user"></i> ' + esc(t.cashier_name) + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<div style="text-align:right;flex-shrink:0">' +
            (t.sale_total ? '<div style="font-size:18px;font-weight:800;color:var(--pos-navy)">$' + (t.sale_total || 0).toFixed(2) + '</div>' : '') +
            (t.scheduled_date ? '<div style="font-size:11px;color:#D97706;font-weight:600"><i class="fas fa-calendar"></i> ' + esc(t.scheduled_date) + '</div>' : '<div style="font-size:11px;color:#EF4444;font-weight:600">ASAP</div>') +
          '</div>' +
        '</div>';

        // Items
        if (t.items_list) {
          html += '<div style="background:var(--pos-gray-50);border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:13px">' +
            '<div style="font-weight:600;color:var(--pos-gray-600);margin-bottom:4px"><i class="fas fa-boxes-stacked"></i> Items (' + (t.item_count || 0) + ')</div>' +
            '<div style="color:var(--pos-gray-700)">' + esc(t.items_list) + '</div>' +
          '</div>';
        }

        // Order status
        if (t.order_status) {
          var osColor = t.order_status === 'new' ? '#F59E0B' : t.order_status === 'confirmed' ? '#3B82F6' : '#10B981';
          html += '<div style="font-size:11px;margin-bottom:8px">Order Status: <span style="background:' + osColor + '20;color:' + osColor + ';padding:2px 6px;border-radius:4px;font-weight:600">' + esc(t.order_status) + '</span></div>';
        }

        // Completion info
        if (t.status === 'completed') {
          html += '<div style="background:#ECFDF5;border-radius:8px;padding:8px 12px;font-size:12px;color:#047857">' +
            '<i class="fas fa-check-circle"></i> <strong>Entered into DARTS</strong>' +
            (t.completed_by_name ? ' by ' + esc(t.completed_by_name) : '') +
            (t.completed_at ? ' — ' + timeAgo(t.completed_at) : '') +
          '</div>';
        }

        // Action buttons
        if (isPending) {
          html += '<div style="display:flex;gap:8px;margin-top:10px;border-top:1px solid var(--pos-gray-100);padding-top:10px">' +
            '<button class="pos-btn" onclick="window.dartsMarkDone(' + t.id + ')" style="flex:1;background:#8B5CF6;color:white;font-weight:700;padding:10px"><i class="fas fa-check-double"></i> Mark Entered in DARTS</button>' +
          '</div>';
        }

        html += '</div>';
      });
      html += '</div>';
    }

    el.innerHTML = html;
    on('dartsRefresh', 'click', loadDartsQueue);
  }).catch(function(err) {
    el.innerHTML = '<div class="pos-loading" style="color:var(--pos-red)"><i class="fas fa-exclamation-triangle"></i> ' + errMsg(err) + '</div>';
  });
}

function dartsSetFilter(f) {
  _dartsFilter = f;
  loadDartsQueue();
}

function dartsMarkDone(taskId) {
  var user = getUser();

  var overlay = document.createElement('div');
  overlay.id = 'dartsCompleteOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';

  overlay.innerHTML =
    '<div style="background:white;border-radius:16px;width:100%;max-width:400px;box-shadow:0 25px 50px rgba(0,0,0,0.25)">' +
      '<div style="padding:20px 24px;border-bottom:1px solid var(--pos-gray-100)">' +
        '<h3 style="margin:0;font-size:16px"><i class="fas fa-check-double" style="color:#8B5CF6"></i> Confirm DARTS Entry</h3>' +
      '</div>' +
      '<div style="padding:24px">' +
        '<div style="margin-bottom:16px">' +
          '<label style="display:block;font-size:12px;font-weight:600;color:var(--pos-gray-600);margin-bottom:4px">DARTS Confirmation / Reference (optional)</label>' +
          '<input id="dartsConfirmRef" type="text" placeholder="e.g. DARTS order #, confirmation code" style="width:100%;padding:10px 12px;border:1px solid var(--pos-gray-200);border-radius:8px;font-size:14px;box-sizing:border-box">' +
        '</div>' +
        '<div style="background:#EDE9FE;border:1px solid #C4B5FD;border-radius:10px;padding:12px;margin-bottom:16px;font-size:12px;color:#5B21B6">' +
          '<i class="fas fa-info-circle"></i> This confirms the order has been entered into the DARTS system at ALDI warehouse.' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<button id="dartsDoComplete" style="flex:1;padding:12px;background:#8B5CF6;color:white;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer"><i class="fas fa-check-double"></i> Confirm</button>' +
          '<button onclick="document.getElementById(\'dartsCompleteOverlay\').remove()" style="padding:12px 20px;background:var(--pos-gray-100);color:var(--pos-gray-600);border:none;border-radius:10px;font-size:14px;cursor:pointer">Cancel</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  document.getElementById('dartsDoComplete').addEventListener('click', function() {
    var ref = gv('dartsConfirmRef').trim();
    var btn = document.getElementById('dartsDoComplete');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    API.put('/pos/darts-queue/' + taskId + '/complete', {
      darts_confirmation: ref || null,
      completed_by: user ? user.id : null,
      completed_by_name: user ? user.name : null
    }).then(function() {
      toast('DARTS entry confirmed ✓');
      overlay.remove();
      loadDartsQueue();
    }).catch(function(err) {
      toast('Error: ' + errMsg(err), 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check-double"></i> Confirm';
    });
  });
}

// Load Darts badge count on startup
function _loadDartsBadge() {
  API.get('/pos/darts-queue?status=pending').then(function(r) {
    var counts = r.data.counts || {};
    var pending = (counts.pending || 0) + (counts.in_progress || 0);
    var badge = document.getElementById('posDartsBadge');
    if (badge) { badge.textContent = pending; badge.style.display = pending > 0 ? '' : 'none'; }
  }).catch(function() {});
}

// ==================== PETTY CASH ====================
var _pettyCashData = [];

function loadPettyCash() {
  var el = document.getElementById('posViewPetty-cash');
  if (!el) return;
  el.innerHTML = '<div class="pos-loading"><i class="fas fa-spinner fa-spin"></i> Loading petty cash...</div>';

  var locId = getLocationId();
  var sessionId = _s.session ? _s.session.id : '';

  API.get('/pos/petty-cash?location_id=' + locId + (sessionId ? '&session_id=' + sessionId : '')).then(function(r) {
    _pettyCashData = r.data.transactions || [];
    var summary = r.data.summary || {};
    var netOut = (summary.total_out || 0) - (summary.total_returned || 0);

    var html = '<div class="pos-cust-view-header">' +
      '<div class="pos-cust-view-title"><h2><i class="fas fa-money-bill-transfer" style="color:#F59E0B"></i> Petty Cash</h2>' +
      '<span style="font-size:12px;color:var(--pos-gray-500)">Session #' + (sessionId || 'All') + ' &bull; ' + esc(getLocationName()) + '</span></div>' +
      '<div style="display:flex;gap:8px">' +
        '<button class="pos-btn" id="pcBtnNew" style="background:linear-gradient(135deg,#F59E0B,#D97706);color:white;font-weight:700"><i class="fas fa-arrow-right-from-bracket"></i> Cash Out</button>' +
        '<button class="pos-btn pos-btn-sm" id="pcBtnRefresh" style="background:var(--pos-navy);color:white"><i class="fas fa-sync"></i></button>' +
      '</div></div>';

    // Summary cards
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin:16px 0">';
    html += '<div style="padding:16px;background:white;border:1px solid var(--pos-gray-200);border-radius:10px;border-left:4px solid #F59E0B">' +
      '<div style="font-size:11px;color:var(--pos-gray-500);text-transform:uppercase;font-weight:600">Total Cash Out</div>' +
      '<div style="font-size:22px;font-weight:800;color:#D97706">$' + (summary.total_out || 0).toFixed(2) + '</div></div>';
    html += '<div style="padding:16px;background:white;border:1px solid var(--pos-gray-200);border-radius:10px;border-left:4px solid #10B981">' +
      '<div style="font-size:11px;color:var(--pos-gray-500);text-transform:uppercase;font-weight:600">Returned</div>' +
      '<div style="font-size:22px;font-weight:800;color:#10B981">$' + (summary.total_returned || 0).toFixed(2) + '</div></div>';
    html += '<div style="padding:16px;background:white;border:1px solid var(--pos-gray-200);border-radius:10px;border-left:4px solid ' + (netOut > 0 ? '#EF4444' : '#6B7280') + '">' +
      '<div style="font-size:11px;color:var(--pos-gray-500);text-transform:uppercase;font-weight:600">Net Out</div>' +
      '<div style="font-size:22px;font-weight:800;color:' + (netOut > 0 ? '#EF4444' : '#6B7280') + '">$' + netOut.toFixed(2) + '</div></div>';
    html += '<div style="padding:16px;background:white;border:1px solid var(--pos-gray-200);border-radius:10px;border-left:4px solid var(--pos-navy)">' +
      '<div style="font-size:11px;color:var(--pos-gray-500);text-transform:uppercase;font-weight:600">Transactions</div>' +
      '<div style="font-size:22px;font-weight:800;color:var(--pos-navy)">' + (summary.total_count || 0) + '</div></div>';
    html += '</div>';

    // Transactions list
    if (_pettyCashData.length === 0) {
      html += '<div style="text-align:center;padding:40px;color:var(--pos-gray-400)"><i class="fas fa-money-bill-transfer" style="font-size:48px;margin-bottom:12px;display:block"></i>No petty cash transactions yet<br><span style="font-size:12px">Use "Cash Out" to take cash from the register</span></div>';
    } else {
      html += '<div style="display:flex;flex-direction:column;gap:10px">';
      _pettyCashData.forEach(function(tx) {
        var statusColor = tx.status === 'completed' ? '#10B981' : tx.status === 'voided' ? '#EF4444' : tx.status === 'approved' ? '#3B82F6' : '#F59E0B';
        var statusIcon = tx.status === 'completed' ? 'fa-check-circle' : tx.status === 'voided' ? 'fa-ban' : tx.status === 'approved' ? 'fa-thumbs-up' : 'fa-clock';
        var catLabel = _pcCatLabel(tx.category);
        var catIcon = _pcCatIcon(tx.category);

        html += '<div class="pc-tx-card" style="background:white;border:1px solid var(--pos-gray-200);border-radius:10px;padding:14px 16px;border-left:4px solid ' + statusColor + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">' +
            '<div style="flex:1;min-width:0">' +
              '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
                '<i class="fas ' + catIcon + '" style="color:' + statusColor + ';font-size:14px"></i>' +
                '<span style="font-weight:700;font-size:14px;color:var(--pos-navy)">' + esc(tx.description) + '</span>' +
              '</div>' +
              '<div style="display:flex;flex-wrap:wrap;gap:8px;font-size:11px;color:var(--pos-gray-500)">' +
                '<span><i class="fas fa-tag"></i> ' + esc(catLabel) + '</span>' +
                (tx.recipient ? '<span><i class="fas fa-user"></i> ' + esc(tx.recipient) + '</span>' : '') +
                '<span><i class="fas fa-user-pen"></i> ' + esc(tx.created_by_name || tx.created_by_user_name || '') + '</span>' +
                '<span><i class="fas fa-clock"></i> ' + timeAgo(tx.created_at) + '</span>' +
              '</div>' +
              (tx.receipt_note ? '<div style="font-size:11px;color:var(--pos-gray-500);margin-top:4px;font-style:italic"><i class="fas fa-receipt"></i> ' + esc(tx.receipt_note) + '</div>' : '') +
            '</div>' +
            '<div style="text-align:right;flex-shrink:0">' +
              '<div style="font-size:20px;font-weight:800;color:#D97706">$' + (tx.amount || 0).toFixed(2) + '</div>' +
              (tx.returned_amount > 0 ? '<div style="font-size:12px;color:#10B981;font-weight:600">+$' + tx.returned_amount.toFixed(2) + ' back</div>' : '') +
              '<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;color:' + statusColor + ';background:' + statusColor + '15;padding:2px 8px;border-radius:10px;margin-top:4px;text-transform:uppercase"><i class="fas ' + statusIcon + '"></i> ' + tx.status + '</span>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:6px;margin-top:10px;border-top:1px solid var(--pos-gray-100);padding-top:10px">';

        // Action buttons based on status
        if (tx.status === 'pending') {
          html += '<button class="pos-btn pos-btn-sm" onclick="window.pcComplete(' + tx.id + ')" style="background:#10B981;color:white;font-size:11px"><i class="fas fa-check"></i> Complete</button>';
          html += '<button class="pos-btn pos-btn-sm" onclick="window.pcVoid(' + tx.id + ')" style="background:var(--pos-gray-200);color:var(--pos-gray-600);font-size:11px"><i class="fas fa-ban"></i> Void</button>';
        } else if (tx.status === 'approved') {
          html += '<button class="pos-btn pos-btn-sm" onclick="window.pcComplete(' + tx.id + ')" style="background:#10B981;color:white;font-size:11px"><i class="fas fa-check"></i> Complete</button>';
          html += '<button class="pos-btn pos-btn-sm" onclick="window.pcVoid(' + tx.id + ')" style="background:var(--pos-gray-200);color:var(--pos-gray-600);font-size:11px"><i class="fas fa-ban"></i> Void</button>';
        }

        html += '</div></div>';
      });
      html += '</div>';
    }

    el.innerHTML = html;
    on('pcBtnNew', 'click', pcShowCashOutForm);
    on('pcBtnRefresh', 'click', loadPettyCash);
  }).catch(function(err) {
    el.innerHTML = '<div class="pos-loading" style="color:var(--pos-red)"><i class="fas fa-exclamation-triangle"></i> ' + errMsg(err) + '</div>';
  });
}

function _pcCatLabel(cat) {
  var map = { misc_purchase: 'Misc Purchase', warehouse_supplies: 'Warehouse Supplies', employee_expense: 'Employee Expense', vendor_payment: 'Vendor Payment', other: 'Other' };
  return map[cat] || cat || 'Other';
}
function _pcCatIcon(cat) {
  var map = { misc_purchase: 'fa-bag-shopping', warehouse_supplies: 'fa-warehouse', employee_expense: 'fa-user-tie', vendor_payment: 'fa-handshake', other: 'fa-ellipsis' };
  return map[cat] || 'fa-ellipsis';
}

function pcShowCashOutForm() {
  var user = getUser();
  var overlay = document.createElement('div');
  overlay.id = 'pcFormOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';

  overlay.innerHTML =
    '<div style="background:white;border-radius:16px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;box-shadow:0 25px 50px rgba(0,0,0,0.25)">' +
      '<div style="padding:20px 24px;border-bottom:1px solid var(--pos-gray-100);display:flex;align-items:center;justify-content:space-between">' +
        '<h3 style="margin:0;font-size:18px;display:flex;align-items:center;gap:8px"><i class="fas fa-arrow-right-from-bracket" style="color:#F59E0B"></i> Cash Out from Register</h3>' +
        '<button onclick="document.getElementById(\'pcFormOverlay\').remove()" style="background:none;border:none;font-size:20px;color:var(--pos-gray-400);cursor:pointer"><i class="fas fa-times"></i></button>' +
      '</div>' +
      '<div style="padding:24px">' +
        '<div style="margin-bottom:16px">' +
          '<label style="display:block;font-size:12px;font-weight:600;color:var(--pos-gray-600);margin-bottom:4px">Amount ($) <span style="color:#EF4444">*</span></label>' +
          '<input id="pcAmount" type="number" min="0.01" step="0.01" placeholder="0.00" style="width:100%;padding:12px;border:2px solid var(--pos-gray-200);border-radius:10px;font-size:24px;font-weight:800;color:#D97706;text-align:center;box-sizing:border-box" autofocus>' +
        '</div>' +
        '<div style="margin-bottom:16px">' +
          '<label style="display:block;font-size:12px;font-weight:600;color:var(--pos-gray-600);margin-bottom:4px">Category <span style="color:#EF4444">*</span></label>' +
          '<div id="pcCatPicker" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
            _pcCatBtn('misc_purchase', 'fa-bag-shopping', 'Misc Purchase', true) +
            _pcCatBtn('warehouse_supplies', 'fa-warehouse', 'Warehouse Supplies', false) +
            _pcCatBtn('employee_expense', 'fa-user-tie', 'Employee Expense', false) +
            _pcCatBtn('vendor_payment', 'fa-handshake', 'Vendor Payment', false) +
            _pcCatBtn('other', 'fa-ellipsis', 'Other', false) +
          '</div>' +
        '</div>' +
        '<div style="margin-bottom:16px">' +
          '<label style="display:block;font-size:12px;font-weight:600;color:var(--pos-gray-600);margin-bottom:4px">Recipient / Who Gets the Cash</label>' +
          '<input id="pcRecipient" type="text" placeholder="e.g. Juan (warehouse), Store supplies" style="width:100%;padding:10px 12px;border:1px solid var(--pos-gray-200);border-radius:8px;font-size:14px;box-sizing:border-box">' +
        '</div>' +
        '<div style="margin-bottom:20px">' +
          '<label style="display:block;font-size:12px;font-weight:600;color:var(--pos-gray-600);margin-bottom:4px">Description / What For <span style="color:#EF4444">*</span></label>' +
          '<textarea id="pcDescription" rows="2" placeholder="e.g. Buy packing tape and zip ties from Home Depot" style="width:100%;padding:10px 12px;border:1px solid var(--pos-gray-200);border-radius:8px;font-size:14px;resize:vertical;box-sizing:border-box"></textarea>' +
        '</div>' +
        '<div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:10px;padding:12px;margin-bottom:20px;font-size:12px;color:#92400E">' +
          '<i class="fas fa-info-circle"></i> <strong>Reminder:</strong> Cash will be taken from the register drawer. When the person returns, use "Complete" to record any change returned.' +
        '</div>' +
        '<button id="pcSubmitBtn" style="width:100%;padding:14px;background:linear-gradient(135deg,#F59E0B,#D97706);color:white;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">' +
          '<i class="fas fa-arrow-right-from-bracket"></i> Take Cash Out' +
        '</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  // Category picker logic
  overlay.querySelectorAll('.pc-cat-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      overlay.querySelectorAll('.pc-cat-btn').forEach(function(b) { b.classList.remove('pc-cat-active'); });
      btn.classList.add('pc-cat-active');
    });
  });

  // Submit
  document.getElementById('pcSubmitBtn').addEventListener('click', function() {
    var amount = parseFloat(gv('pcAmount'));
    var activeCat = overlay.querySelector('.pc-cat-btn.pc-cat-active');
    var category = activeCat ? activeCat.dataset.cat : 'misc_purchase';
    var recipient = gv('pcRecipient').trim();
    var description = gv('pcDescription').trim();

    if (!amount || amount <= 0) { toast('Enter a valid amount', 'error'); return; }
    if (!description) { toast('Enter a description', 'error'); return; }

    var btn = document.getElementById('pcSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    API.post('/pos/petty-cash', {
      session_id: _s.session ? _s.session.id : null,
      location_id: getLocationId(),
      amount: amount,
      category: category,
      recipient: recipient || null,
      description: description,
      created_by: user ? user.id : null,
      created_by_name: user ? user.name : null
    }).then(function() {
      toast('Cash out recorded — $' + amount.toFixed(2));
      overlay.remove();
      loadPettyCash();
    }).catch(function(err) {
      toast('Error: ' + errMsg(err), 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-arrow-right-from-bracket"></i> Take Cash Out';
    });
  });
}

function _pcCatBtn(value, icon, label, active) {
  return '<button class="pc-cat-btn' + (active ? ' pc-cat-active' : '') + '" data-cat="' + value + '" style="padding:10px;border:2px solid var(--pos-gray-200);border-radius:10px;background:white;cursor:pointer;display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--pos-gray-600);transition:all 0.15s">' +
    '<i class="fas ' + icon + '"></i> ' + label + '</button>';
}

function pcComplete(id) {
  var tx = _pettyCashData.find(function(t) { return t.id === id; });
  if (!tx) return;

  var overlay = document.createElement('div');
  overlay.id = 'pcCompleteOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';

  overlay.innerHTML =
    '<div style="background:white;border-radius:16px;width:100%;max-width:420px;box-shadow:0 25px 50px rgba(0,0,0,0.25)">' +
      '<div style="padding:20px 24px;border-bottom:1px solid var(--pos-gray-100)">' +
        '<h3 style="margin:0;font-size:16px"><i class="fas fa-check-circle" style="color:#10B981"></i> Complete Cash Out</h3>' +
      '</div>' +
      '<div style="padding:24px">' +
        '<div style="background:var(--pos-gray-50);border-radius:10px;padding:12px;margin-bottom:16px;font-size:13px">' +
          '<div style="font-weight:700;color:var(--pos-navy)">' + esc(tx.description) + '</div>' +
          '<div style="color:var(--pos-gray-500);margin-top:2px">Amount taken: <strong style="color:#D97706">$' + (tx.amount || 0).toFixed(2) + '</strong></div>' +
          (tx.recipient ? '<div style="color:var(--pos-gray-500)">Given to: ' + esc(tx.recipient) + '</div>' : '') +
        '</div>' +
        '<div style="margin-bottom:16px">' +
          '<label style="display:block;font-size:12px;font-weight:600;color:var(--pos-gray-600);margin-bottom:4px">Change Returned to Register ($)</label>' +
          '<input id="pcReturnAmt" type="number" min="0" step="0.01" value="0" style="width:100%;padding:10px 12px;border:2px solid var(--pos-gray-200);border-radius:8px;font-size:18px;font-weight:700;text-align:center;color:#10B981;box-sizing:border-box">' +
          '<div style="font-size:11px;color:var(--pos-gray-400);margin-top:4px">Enter $0 if all cash was spent</div>' +
        '</div>' +
        '<div style="margin-bottom:20px">' +
          '<label style="display:block;font-size:12px;font-weight:600;color:var(--pos-gray-600);margin-bottom:4px">Receipt Note (optional)</label>' +
          '<input id="pcReceiptNote" type="text" placeholder="e.g. Receipt #4521, Home Depot" style="width:100%;padding:10px 12px;border:1px solid var(--pos-gray-200);border-radius:8px;font-size:13px;box-sizing:border-box">' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<button id="pcDoComplete" style="flex:1;padding:12px;background:#10B981;color:white;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer"><i class="fas fa-check"></i> Complete</button>' +
          '<button onclick="document.getElementById(\'pcCompleteOverlay\').remove()" style="padding:12px 20px;background:var(--pos-gray-100);color:var(--pos-gray-600);border:none;border-radius:10px;font-size:14px;cursor:pointer">Cancel</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  document.getElementById('pcDoComplete').addEventListener('click', function() {
    var returned = parseFloat(gv('pcReturnAmt')) || 0;
    var note = gv('pcReceiptNote').trim();
    var btn = document.getElementById('pcDoComplete');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    API.put('/pos/petty-cash/' + id, { action: 'complete', returned_amount: returned, receipt_note: note || null }).then(function() {
      toast('Cash out completed' + (returned > 0 ? ' — $' + returned.toFixed(2) + ' returned' : ''));
      overlay.remove();
      loadPettyCash();
    }).catch(function(err) {
      toast('Error: ' + errMsg(err), 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check"></i> Complete';
    });
  });
}

function pcVoid(id) {
  if (!confirm('Void this petty cash transaction? The cash should be returned to the register.')) return;
  API.put('/pos/petty-cash/' + id, { action: 'void' }).then(function() {
    toast('Transaction voided');
    loadPettyCash();
  }).catch(function(err) { toast('Error: ' + errMsg(err), 'error'); });
}

// ==================== UTILITY ====================
function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function escAttr(s) { return (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtN(v) { return (v || 0).toLocaleString(); }
function initials(name) { return (name || '?').split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase(); }
function fld(label, value) { return '<div class="pos-cust-field"><span class="pos-cust-field-label">' + label + '</span><span class="pos-cust-field-value">' + (value || '-') + '</span></div>'; }
function errMsg(err) { return err.response?.data?.error || err.message || 'Unknown error'; }
function getUser() { try { return JSON.parse(localStorage.getItem('bf_ops_user')); } catch(e) { return null; } }
function gv(id) { var el = document.getElementById(id); return el ? el.value : ''; }
function on(id, evt, fn) { var el = document.getElementById(id); if (el) el.addEventListener(evt, fn); }
function timeAgo(dateStr) {
  if (!dateStr) return '';
  var diff = Date.now() - new Date(dateStr).getTime();
  var mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  var hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  return Math.floor(hours / 24) + 'd ago';
}

// ==================== GLOBAL EXPORTS (for onclick handlers in innerHTML) ====================
window.closeModal = closeModal;
window.posDoTransferRequest = posDoTransferRequest;
window.posConfirmTransfer = posConfirmTransfer;
window.posConfirmPurchaseRequest = posConfirmPurchaseRequest;
window.posDoPurchaseRequest = posDoPurchaseRequest;
window.openStockCheck = openStockCheck;
window.showModal = showModal;
window.pcComplete = pcComplete;
window.pcVoid = pcVoid;
window.pcShowCashOutForm = pcShowCashOutForm;
window.dartsMarkDone = dartsMarkDone;
window.dartsSetFilter = dartsSetFilter;

})();
