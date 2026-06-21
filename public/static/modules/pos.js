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
  mergeTarget: null // first customer selected for merge
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

  // Load locations first, then check session
  Promise.all([
    API.get('/pos/locations').then(function(r) { _s.locations = r.data || []; }).catch(function() {}),
    API.get('/pos/categories').then(function(r) { _s.categories = r.data || []; }).catch(function() {})
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
function renderRegisterView() {
  var el = document.getElementById('pos-app');
  if (!el) return;

  var locName = getLocationName();
  var locType = getLocationType();
  var locBadge = locType === 'distribution'
    ? '<span style="background:rgba(249,115,22,0.2);color:#FB923C;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700">DISTRIBUTION</span>'
    : '<span style="background:rgba(16,185,129,0.2);color:#6EE7B7;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700">RETAIL</span>';

  el.innerHTML =
    '<div class="pos-topbar">' +
      '<div class="pos-topbar-title"><i class="fas fa-cash-register"></i> POS</div>' +
      '<div class="pos-topbar-location"><i class="fas fa-map-marker-alt"></i> ' + esc(locName) + ' ' + locBadge + '</div>' +
      '<div class="pos-topbar-session">Session #' + (_s.session ? _s.session.id : '-') + '</div>' +
      '<div class="pos-topbar-right">' +
        '<button class="pos-topbar-btn" id="posBtnDash"><i class="fas fa-chart-bar"></i> <span class="hide-mobile">Dashboard</span></button>' +
        '<button class="pos-topbar-btn" id="posBtnReg"><i class="fas fa-cash-register"></i> <span class="hide-mobile">Register</span></button>' +
        '<button class="pos-topbar-btn" id="posBtnHist"><i class="fas fa-clock-rotate-left"></i> <span class="hide-mobile">History</span></button>' +
        '<button class="pos-topbar-btn" id="posBtnCust"><i class="fas fa-address-book"></i> <span class="hide-mobile">Customers</span></button>' +
        '<button class="pos-topbar-btn" id="posBtnHeld"><i class="fas fa-pause-circle"></i> <span class="hide-mobile">Held</span> <span id="posHeldBadge" class="pos-held-badge" style="display:none">0</span></button>' +
        '<button class="pos-topbar-btn danger" id="posBtnClose"><i class="fas fa-power-off"></i> <span class="hide-mobile">Close</span></button>' +
      '</div>' +
    '</div>' +
    '<div id="posViewDashboard" class="pos-view pos-dashboard"></div>' +
    '<div id="posViewRegister" class="pos-view pos-register"></div>' +
    '<div id="posViewHistory" class="pos-view pos-history"></div>' +
    '<div id="posViewCustomers" class="pos-view pos-customers"></div>';

  on('posBtnDash', 'click', function() { switchView('dashboard'); });
  on('posBtnReg', 'click', function() { switchView('register'); });
  on('posBtnHist', 'click', function() { switchView('history'); });
  on('posBtnCust', 'click', function() { switchView('customers'); });
  on('posBtnHeld', 'click', showHeld);
  on('posBtnClose', 'click', closeSession);

  switchView('register');
  loadHeldCount();
}

function switchView(view) {
  _s.view = view;
  document.querySelectorAll('.pos-view').forEach(function(v) { v.classList.remove('active'); });
  var viewEl = document.getElementById('posView' + view.charAt(0).toUpperCase() + view.slice(1));
  if (viewEl) viewEl.classList.add('active');

  if (view === 'register') renderRegisterContent();
  else if (view === 'dashboard') loadDashboard();
  else if (view === 'history') loadHistory();
  else if (view === 'customers') loadCustomerList();
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
    var code = prompt('Enter barcode / SKU:');
    if (code && searchInput) { searchInput.value = code; searchProducts(code); }
  });

  renderCategories();
  searchProducts('');
  renderCustomerArea();
  renderCartFooter();
}

// ==================== CATEGORIES ====================
function renderCategories() {
  var el = document.getElementById('posCatBar');
  if (!el) return;
  var html = '<button class="pos-cat-pill ' + (!_s.currentCat ? 'active' : '') + '" data-cat="">All</button>';
  _s.categories.forEach(function(c) {
    if (!c.category) return;
    html += '<button class="pos-cat-pill ' + (_s.currentCat === c.category ? 'active' : '') + '" data-cat="' + esc(c.category) + '">' + esc(c.category) + ' <small style="opacity:0.6">(' + c.count + ')</small></button>';
  });
  el.innerHTML = html;

  el.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-cat]');
    if (!btn) return;
    _s.currentCat = btn.dataset.cat;
    renderCategories();
    searchProducts(document.getElementById('posProductSearch')?.value || '');
  });
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
    var other = getOtherLocation();
    var msg = esc(item.name) + ': Only ' + item.stock + ' in stock (need ' + item.qty + ')';
    if (other) msg += ' <a href="#" class="pos-stock-check-link" data-stock-pid="' + item.product_id + '">Check ' + esc(other.name) + '</a>';
    _s.warnings.push({ product_id: item.product_id, type: item.stock <= 0 ? 'error' : 'warning', message: msg });
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

  // Delegated cart events
  el.addEventListener('click', function handler(e) {
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
          var label = (a.label || a.street || 'Address #' + a.id);
          addrOpts += '<option value="' + a.id + '" ' + (a.is_primary ? 'selected' : '') + '>' + esc(label) + '</option>';
        });
        html += '<div><label><i class="fas fa-map-marker-alt"></i> Address</label><select id="posDeliveryAddr">' + addrOpts + '</select></div>';
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
  on('posDeliveryAddr', 'change', function() { _s.deliveryAddrId = this.value; });

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
        '<div style="width:36px;height:36px;background:var(--pos-navy);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">' +
          initials(_s.customer.business_name || _s.customer.contact_name || '?') +
        '</div>' +
        '<div class="pos-customer-info">' +
          '<div class="pos-customer-name">' + esc(_s.customer.business_name || _s.customer.contact_name) +
            ' <a href="#" id="posCustPanelLink" style="font-size:11px;color:var(--pos-navy-light)"><i class="fas fa-external-link-alt"></i></a></div>' +
          '<div class="pos-customer-detail">' + details + acctHtml + '</div>' +
        '</div>' +
        '<button class="pos-customer-remove" id="posCustRemoveBtn" title="Remove customer"><i class="fas fa-times"></i></button>' +
      '</div>';

    on('posCustPanelLink', 'click', function(e) { e.preventDefault(); showCustomerPanel(_s.customer.id); });
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

    var html = '<div class="pos-cust-panel">' +
      '<div class="pos-cust-panel-header"><h3><i class="fas fa-user"></i> ' + esc(c.business_name || c.contact_name) + '</h3>' +
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

    html += '</div></div>';

    var existing = document.querySelector('.pos-cust-panel');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', html);

    on('posCustPanelClose', 'click', function() {
      var p = document.querySelector('.pos-cust-panel');
      if (p) p.remove();
    });
  });
}

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
    detailEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--pos-gray-500)">' +
      '<i class="fas fa-credit-card" style="font-size:24px;margin-bottom:8px;display:block"></i>' +
      '<div>Process $' + totals.total.toFixed(2) + ' on card terminal</div>' +
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
    body.payments = [{ method: _s.payMethod, amount: totals.total, card_last4: gv('posCardLast4') || null }];
    body.amount_paid = totals.total;
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
      ? (getOtherLocation() ? getOtherLocation().id : null)
      : (_s.deliveryReq === 'reserve_retail' ? (getOtherLocation() ? getOtherLocation().id : null) : null),
    cashier_id: user ? user.id : null,
    cashier_name: user ? user.name : '',
    notes: '',
    internal_notes: '',
    promo_id: _s.appliedPromo ? _s.appliedPromo.promo_id : null,
    promo_code: _s.appliedPromo ? _s.appliedPromo.code : null,
    promo_discount: _s.appliedPromo ? _s.appliedPromo.discount : 0
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
  return { subtotal: subtotal, tax: taxTotal, discount: discountTotal, promoDiscount: promoDisc, total: subtotal - promoDisc + taxTotal };
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
      html += '<div class="pos-dash-section"><h3><i class="fas fa-exclamation-triangle" style="color:var(--pos-orange)"></i> Low Stock Alerts</h3>' +
        '<table class="pos-table"><thead><tr><th>Product</th><th>Location</th><th class="right">Available</th><th class="right">Reorder</th></tr></thead><tbody>';
      d.lowStock.forEach(function(s) {
        html += '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.location||'') + '</td><td class="right" style="color:var(--pos-red);font-weight:700">' + fmtN(s.qty_available) + '</td><td class="right">' + fmtN(s.reorder_point) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    // === SETTINGS & TOOLS ===
    html += '<div class="pos-dash-section"><h3><i class="fas fa-cog"></i> Settings & Tools</h3>' +
      '<div class="pos-dash-tools">' +
        '<button class="pos-btn pos-dash-tool-btn" id="posDashPromos"><i class="fas fa-bullhorn"></i> Promotions</button>' +
        '<button class="pos-btn pos-dash-tool-btn" id="posDashTax"><i class="fas fa-calculator"></i> Tax Config</button>' +
        '<button class="pos-btn pos-dash-tool-btn" id="posDashReservations"><i class="fas fa-bookmark"></i> Reservations</button>' +
      '</div></div>';

    el.innerHTML = html;

    // Wire dashboard tool buttons
    on('posDashPromos', 'click', openPromotionsManager);
    on('posDashTax', 'click', openTaxSettings);
    on('posDashReservations', 'click', openReservationsList);
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
    }, [], []);
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
    renderCustomerSheet(c, addrs, orders.concat(sales).sort(function(a, b) {
      return (b.created_at || '').localeCompare(a.created_at || '');
    }), rules, acct);
  }).catch(function(err) { toast('Failed to load customer: ' + errMsg(err), 'error'); });
}

function renderCustomerSheet(c, addrs, history, rules, acct) {
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

  var html = '<div class="pos-modal-overlay" id="posCustSheetOverlay">' +
    '<div class="pos-cust-sheet">' +
      '<div class="pos-cust-sheet-header">' +
        '<h3><i class="fas fa-' + (isNew ? 'user-plus' : 'user-edit') + '"></i> ' + (isNew ? 'New Customer' : esc(c.business_name || c.contact_name)) + '</h3>' +
        '<button class="pos-modal-close" id="posCustSheetClose"><i class="fas fa-times"></i></button>' +
      '</div>' +
      '<div class="pos-cust-sheet-body">' +
        '<div class="pos-cust-sheet-tabs">' +
          '<button class="pos-cust-tab active" data-tab="details"><i class="fas fa-id-card"></i> Details</button>' +
          '<button class="pos-cust-tab" data-tab="addresses"><i class="fas fa-map-marker-alt"></i> Addresses' + (addrs && addrs.length ? ' (' + addrs.length + ')' : '') + '</button>' +
          (isNew ? '' : '<button class="pos-cust-tab" data-tab="discounts"><i class="fas fa-tags"></i> Discounts</button>') +
          (isNew ? '' : '<button class="pos-cust-tab" data-tab="history"><i class="fas fa-receipt"></i> Orders</button>') +
          (isNew ? '' : '<button class="pos-cust-tab" data-tab="account"><i class="fas fa-credit-card"></i> Account</button>') +
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
    return '<div class="pos-cust-tag-sug" data-tag="' + esc(t) + '">' + esc(t) + '</div>';
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
    tags: gv('posCustTags'),
    notes: gv('posCustNotes')
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
  if (typeof window.shellToast === 'function') { window.shellToast(msg, type || 'success'); return; }
  var el = document.createElement('div');
  var bg = type === 'error' ? '#DC2626' : '#059669';
  el.style.cssText = 'position:fixed;bottom:20px;right:20px;background:' + bg + ';color:white;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:99999;max-width:400px';
  el.innerHTML = '<i class="fas ' + (type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle') + '"></i> ' + msg;
  document.body.appendChild(el);
  setTimeout(function() { el.style.opacity = '0'; setTimeout(function() { el.remove(); }, 300); }, 3000);
}

// ==================== UTILITY ====================
function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
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

})();
