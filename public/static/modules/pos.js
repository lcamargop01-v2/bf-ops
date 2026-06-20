// BF Operations — Point of Sale Module
// Full register, customer panel, payment, receipt, held sales, history

(function() {
'use strict';

var API = window.axios ? axios.create({ baseURL: '/api' }) : null;
var _posSession = null; // current register session
var _posCart = [];       // [{product_id, name, sku, category, qty, unit_price, effective_price, price_source, tax_rate, cost, discount_pct, stock}]
var _posCustomer = null; // selected customer object
var _posCustomerAcct = null; // customer account info
var _posLocations = [];
var _posCategories = [];
var _posCurrentCat = '';
var _posSearchTimer = null;
var _posView = 'register'; // 'register', 'dashboard', 'history'
var _posHeldCount = 0;
var _posDeliveryReq = false;
var _posDeliveryDate = '';
var _posDeliveryAddrId = null;
var _posCustomerAddresses = [];
var _posWarnings = [];

// ==================== INIT ====================
window._posInit = function() {
  if (!API) API = axios.create({ baseURL: '/api' });
  var token = localStorage.getItem('bf_token') || localStorage.getItem('bf_ops_token');
  if (token) API.defaults.headers.common['Authorization'] = 'Bearer ' + token;

  // Reset state
  _posCart = [];
  _posCustomer = null;
  _posCustomerAcct = null;
  _posWarnings = [];
  _posDeliveryReq = false;

  loadLocations();
  loadCategories();
  checkExistingSession();
};

window._posCleanup = function() {
  _posSession = null;
  _posCart = [];
  _posCustomer = null;
  _posView = 'register';
};

// ==================== DATA LOADERS ====================
function loadLocations() {
  API.get('/pos/locations').then(function(r) { _posLocations = r.data || []; }).catch(function() {});
}

function loadCategories() {
  API.get('/pos/categories').then(function(r) { _posCategories = r.data || []; }).catch(function() {});
}

function checkExistingSession() {
  var savedSession = localStorage.getItem('bf_pos_session');
  if (savedSession) {
    try {
      _posSession = JSON.parse(savedSession);
      renderRegisterView();
      return;
    } catch(e) {}
  }
  renderOpenSession();
}

function getLocationId() {
  return _posSession ? (_posSession.location_id || 1) : 1;
}

// ==================== RENDER: OPEN SESSION ====================
function renderOpenSession() {
  var el = document.getElementById('pos-app');
  if (!el) return;

  var locOpts = '<option value="1">Main Location</option>';
  _posLocations.forEach(function(l) {
    locOpts += '<option value="' + l.id + '">' + l.name + '</option>';
  });

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
          '<div><label>Register Type</label><select id="posSessionType"><option value="retail">Retail</option><option value="warehouse">Warehouse / Distribution</option></select></div>' +
          '<div><label>Opening Cash ($)</label><input type="number" id="posSessionCash" value="0" min="0" step="0.01"></div>' +
          '<button class="pos-session-open-btn" onclick="window._posOpenSession()"><i class="fas fa-play"></i> Open Register</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}

window._posOpenSession = function() {
  var user = null;
  try { user = JSON.parse(localStorage.getItem('bf_ops_user')); } catch(e) {}

  var body = {
    user_id: user ? user.id : null,
    user_name: user ? user.name : 'Unknown',
    location_id: parseInt(document.getElementById('posSessionLoc').value) || 1,
    register_type: document.getElementById('posSessionType').value,
    opening_cash: parseFloat(document.getElementById('posSessionCash').value) || 0
  };

  API.post('/pos/sessions', body).then(function(r) {
    _posSession = { id: r.data.id, ...body, status: 'open', opened_at: new Date().toISOString() };
    localStorage.setItem('bf_pos_session', JSON.stringify(_posSession));
    renderRegisterView();
  }).catch(function(err) {
    alert('Failed to open session: ' + (err.response?.data?.error || err.message));
  });
};

// ==================== RENDER: MAIN REGISTER VIEW ====================
function renderRegisterView() {
  var el = document.getElementById('pos-app');
  if (!el) return;

  var locName = 'Location';
  _posLocations.forEach(function(l) { if (l.id == getLocationId()) locName = l.name; });

  el.innerHTML =
    buildTopBar(locName) +
    '<div id="posViewDashboard" class="pos-view pos-dashboard"></div>' +
    '<div id="posViewRegister" class="pos-view pos-register"></div>' +
    '<div id="posViewHistory" class="pos-view pos-history"></div>';

  switchView('register');
  loadHeldCount();
}

function buildTopBar(locName) {
  return '<div class="pos-topbar">' +
    '<div class="pos-topbar-title"><i class="fas fa-cash-register"></i> POS</div>' +
    '<div class="pos-topbar-location"><i class="fas fa-map-marker-alt"></i> ' + locName + '</div>' +
    '<div class="pos-topbar-session">Session #' + (_posSession ? _posSession.id : '-') + '</div>' +
    '<div class="pos-topbar-right">' +
      '<button class="pos-topbar-btn" onclick="window._posSwitchView(\'dashboard\')"><i class="fas fa-chart-bar"></i> Dashboard</button>' +
      '<button class="pos-topbar-btn" onclick="window._posSwitchView(\'register\')"><i class="fas fa-cash-register"></i> Register</button>' +
      '<button class="pos-topbar-btn" onclick="window._posSwitchView(\'history\')"><i class="fas fa-clock-rotate-left"></i> History</button>' +
      '<button class="pos-topbar-btn" onclick="window._posShowHeld()"><i class="fas fa-pause-circle"></i> Held <span id="posHeldBadge" class="pos-held-badge" style="display:none">0</span></button>' +
      '<button class="pos-topbar-btn danger" onclick="window._posCloseSession()"><i class="fas fa-power-off"></i> Close</button>' +
    '</div>' +
  '</div>';
}

function switchView(view) {
  _posView = view;
  document.querySelectorAll('.pos-view').forEach(function(v) { v.classList.remove('active'); });
  var viewEl = document.getElementById('posView' + view.charAt(0).toUpperCase() + view.slice(1));
  if (viewEl) viewEl.classList.add('active');

  if (view === 'register') renderRegisterContent();
  else if (view === 'dashboard') loadDashboard();
  else if (view === 'history') loadHistory();
}
window._posSwitchView = function(v) { switchView(v); };

// ==================== REGISTER CONTENT ====================
function renderRegisterContent() {
  var frame = document.getElementById('posViewRegister');
  if (!frame) return;

  frame.innerHTML =
    '<div class="pos-products-panel">' +
      '<div class="pos-search-bar">' +
        '<input type="text" class="pos-search-input" id="posProductSearch" placeholder="Search products by name or SKU..." oninput="window._posSearchProducts()" autofocus>' +
        '<button class="pos-btn pos-btn-clear" style="padding:10px 14px" onclick="window._posScanBarcode()" title="Scan Barcode"><i class="fas fa-barcode"></i></button>' +
      '</div>' +
      '<div class="pos-categories" id="posCatBar"></div>' +
      '<div class="pos-product-grid" id="posProductGrid"><div class="pos-loading"><i class="fas fa-spinner fa-spin"></i> Loading products...</div></div>' +
    '</div>' +
    '<div class="pos-cart-panel">' +
      '<div class="pos-customer-bar" style="position:relative">' +
        '<div id="posCustomerArea"></div>' +
      '</div>' +
      '<div id="posWarnings"></div>' +
      '<div class="pos-cart-items" id="posCartItems">' +
        '<div class="pos-cart-empty"><i class="fas fa-shopping-cart"></i><span>Cart is empty</span><span style="font-size:12px">Search or click a product to add</span></div>' +
      '</div>' +
      '<div class="pos-cart-footer" id="posCartFooter"></div>' +
    '</div>';

  renderCategories();
  searchProducts('');
  renderCustomerArea();
  renderCartFooter();
}

// ==================== CATEGORIES ====================
function renderCategories() {
  var el = document.getElementById('posCatBar');
  if (!el) return;
  var html = '<button class="pos-cat-pill ' + (!_posCurrentCat ? 'active' : '') + '" onclick="window._posFilterCat(\'\')">All</button>';
  _posCategories.forEach(function(c) {
    html += '<button class="pos-cat-pill ' + (_posCurrentCat === c.category ? 'active' : '') + '" onclick="window._posFilterCat(\'' + esc(c.category) + '\')">' + esc(c.category) + ' <small style="opacity:0.6">(' + c.count + ')</small></button>';
  });
  el.innerHTML = html;
}

window._posFilterCat = function(cat) {
  _posCurrentCat = cat;
  renderCategories();
  searchProducts(document.getElementById('posProductSearch')?.value || '');
};

// ==================== PRODUCT SEARCH ====================
window._posSearchProducts = function() {
  clearTimeout(_posSearchTimer);
  _posSearchTimer = setTimeout(function() {
    searchProducts(document.getElementById('posProductSearch')?.value || '');
  }, 250);
};

function searchProducts(term) {
  var q = 'search=' + encodeURIComponent(term) + '&location_id=' + getLocationId() + '&limit=80';
  if (_posCurrentCat) q += '&category=' + encodeURIComponent(_posCurrentCat);

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
    var stockClass = 'ok';
    var stockLabel = p.qty_available;
    if (p.qty_available <= 0) { stockClass = 'out'; stockLabel = 'OUT'; }
    else if (p.qty_available <= 10) { stockClass = 'low'; }

    var cardClass = 'pos-product-card';
    if (p.qty_available <= 0) cardClass += ' no-stock';
    else if (p.qty_available <= 10) cardClass += ' low-stock';

    html += '<div class="' + cardClass + '" onclick="window._posAddToCart(' + p.id + ',' + esc2(JSON.stringify({name: p.name, sku: p.sku, category: p.category, price: p.price, cost: p.cost, tax_rate: p.tax_rate, stock: p.qty_available})) + ')">' +
      '<span class="pos-product-stock ' + stockClass + '">' + stockLabel + '</span>' +
      '<div class="pos-product-name">' + esc(p.name) + '</div>' +
      '<div class="pos-product-sku">' + esc(p.sku || '') + (p.category ? ' · ' + esc(p.category) : '') + '</div>' +
      '<div class="pos-product-price">$' + (p.price || 0).toFixed(2) + '</div>' +
    '</div>';
  });
  g.innerHTML = html;
}

// ==================== BARCODE SCAN ====================
window._posScanBarcode = function() {
  var code = prompt('Enter barcode / SKU:');
  if (code) {
    document.getElementById('posProductSearch').value = code;
    searchProducts(code);
  }
};

// ==================== ADD TO CART ====================
window._posAddToCart = function(productId, info) {
  if (typeof info === 'string') info = JSON.parse(info);
  // Check if already in cart
  var existing = _posCart.find(function(c) { return c.product_id === productId; });
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
      unit_price: info.price,
      effective_price: info.price,
      price_source: 'list',
      tax_rate: info.tax_rate || 0,
      cost: info.cost || 0,
      discount_pct: 0,
      stock: info.stock || 0
    };
    _posCart.push(item);
    checkStockWarning(item);
  }

  // Check customer-specific pricing
  if (_posCustomer) {
    priceCheckItem(productId);
  }

  renderCart();
  renderCartFooter();
};

function checkStockWarning(item) {
  // Remove old warning for this product
  _posWarnings = _posWarnings.filter(function(w) { return w.product_id !== item.product_id; });
  if (item.qty > item.stock) {
    _posWarnings.push({
      product_id: item.product_id,
      type: item.stock <= 0 ? 'error' : 'warning',
      message: item.name + ': Only ' + item.stock + ' in stock (requesting ' + item.qty + ')'
    });
  }
  renderWarnings();
}

function priceCheckItem(productId) {
  var item = _posCart.find(function(c) { return c.product_id === productId; });
  if (!item || !_posCustomer) return;

  API.get('/pos/price-check?product_id=' + productId + '&customer_id=' + _posCustomer.id + '&qty=' + item.qty).then(function(r) {
    var d = r.data;
    item.effective_price = d.effective_price;
    item.price_source = d.price_source;
    item.discount_pct = d.discount_pct;
    renderCart();
    renderCartFooter();
  }).catch(function() {});
}

function priceCheckAll() {
  _posCart.forEach(function(item) {
    priceCheckItem(item.product_id);
  });
}

// ==================== CART RENDERING ====================
function renderCart() {
  var el = document.getElementById('posCartItems');
  if (!el) return;

  if (_posCart.length === 0) {
    el.innerHTML = '<div class="pos-cart-empty"><i class="fas fa-shopping-cart"></i><span>Cart is empty</span><span style="font-size:12px">Search or click a product to add</span></div>';
    return;
  }

  var html = '';
  _posCart.forEach(function(item, idx) {
    var lineTotal = item.effective_price * item.qty;
    var meta = '$' + item.effective_price.toFixed(2) + ' ea';
    if (item.price_source !== 'list') {
      meta += ' <span class="special-price">' + item.price_source.replace(/_/g, ' ') + (item.discount_pct ? ' (-' + item.discount_pct + '%)' : '') + '</span>';
    }

    html += '<div class="pos-cart-item">' +
      '<div class="pos-cart-item-info">' +
        '<div class="pos-cart-item-name">' + esc(item.name) + '</div>' +
        '<div class="pos-cart-item-meta">' + meta + '</div>' +
      '</div>' +
      '<div class="pos-cart-qty">' +
        '<button onclick="window._posCartQty(' + idx + ',-1)">-</button>' +
        '<input type="number" value="' + item.qty + '" min="1" onchange="window._posCartQtySet(' + idx + ',this.value)">' +
        '<button onclick="window._posCartQty(' + idx + ',1)">+</button>' +
      '</div>' +
      '<div class="pos-cart-item-total">$' + lineTotal.toFixed(2) + '</div>' +
      '<button class="pos-cart-item-remove" onclick="window._posCartRemove(' + idx + ')" title="Remove"><i class="fas fa-trash"></i></button>' +
    '</div>';
  });
  el.innerHTML = html;
}

window._posCartQty = function(idx, delta) {
  var item = _posCart[idx];
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  checkStockWarning(item);
  if (_posCustomer) priceCheckItem(item.product_id); // volume pricing may change
  renderCart();
  renderCartFooter();
};

window._posCartQtySet = function(idx, val) {
  var item = _posCart[idx];
  if (!item) return;
  item.qty = Math.max(1, parseInt(val) || 1);
  checkStockWarning(item);
  if (_posCustomer) priceCheckItem(item.product_id);
  renderCart();
  renderCartFooter();
};

window._posCartRemove = function(idx) {
  var item = _posCart[idx];
  if (item) {
    _posWarnings = _posWarnings.filter(function(w) { return w.product_id !== item.product_id; });
  }
  _posCart.splice(idx, 1);
  renderWarnings();
  renderCart();
  renderCartFooter();
};

// ==================== CART FOOTER (totals + actions) ====================
function renderCartFooter() {
  var el = document.getElementById('posCartFooter');
  if (!el) return;

  var subtotal = 0;
  var taxTotal = 0;
  var discountTotal = 0;
  var isTaxExempt = _posCustomer && _posCustomer.tax_exempt;

  _posCart.forEach(function(item) {
    var lineSubtotal = item.effective_price * item.qty;
    var lineDiscount = (item.unit_price - item.effective_price) * item.qty;
    var taxRate = isTaxExempt ? 0 : (item.tax_rate || 0);
    var lineTax = lineSubtotal * (taxRate / 100);
    subtotal += lineSubtotal;
    taxTotal += lineTax;
    discountTotal += lineDiscount;
  });

  var total = subtotal + taxTotal;
  var hasItems = _posCart.length > 0;

  var html = '<div class="pos-cart-totals">' +
    '<div class="pos-cart-total-row"><span>Subtotal (' + _posCart.length + ' items)</span><span>$' + subtotal.toFixed(2) + '</span></div>';
  if (discountTotal > 0) {
    html += '<div class="pos-cart-total-row discount"><span>Discounts</span><span>-$' + discountTotal.toFixed(2) + '</span></div>';
  }
  if (isTaxExempt) {
    html += '<div class="pos-cart-total-row"><span>Tax <span class="pos-badge pos-badge-green">EXEMPT</span></span><span>$0.00</span></div>';
  } else {
    html += '<div class="pos-cart-total-row"><span>Tax</span><span>$' + taxTotal.toFixed(2) + '</span></div>';
  }
  html += '<div class="pos-cart-total-row grand"><span>Total</span><span>$' + total.toFixed(2) + '</span></div>' +
    '</div>';

  // Delivery toggle
  if (_posCustomer) {
    html += '<div style="margin-bottom:10px">' +
      '<label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;cursor:pointer;color:var(--pos-gray-700)">' +
        '<input type="checkbox" id="posDeliveryCheck" ' + (_posDeliveryReq ? 'checked' : '') + ' onchange="window._posToggleDelivery(this.checked)"> ' +
        '<i class="fas fa-truck" style="color:var(--pos-navy)"></i> Request Delivery' +
      '</label>' +
    '</div>';

    if (_posDeliveryReq) {
      var addrOpts = '<option value="">Select address...</option>';
      _posCustomerAddresses.forEach(function(a) {
        addrOpts += '<option value="' + a.id + '" ' + (a.is_primary ? 'selected' : '') + '>' + (a.label || a.street || 'Address #' + a.id) + '</option>';
      });
      html += '<div class="pos-delivery-opts">' +
        '<div><label><i class="fas fa-calendar"></i> Delivery Date</label><input type="date" id="posDeliveryDate" value="' + _posDeliveryDate + '" onchange="window._posDeliveryDate=this.value"></div>' +
        '<div><label><i class="fas fa-map-marker-alt"></i> Delivery Address</label><select id="posDeliveryAddr" onchange="window._posDeliveryAddrId=this.value">' + addrOpts + '</select></div>' +
      '</div>';
    }
  }

  html += '<div class="pos-cart-actions">' +
    '<button class="pos-btn pos-btn-clear" onclick="window._posClearCart()" ' + (!hasItems ? 'disabled' : '') + '><i class="fas fa-trash"></i></button>' +
    '<button class="pos-btn pos-btn-hold" onclick="window._posHoldSale()" ' + (!hasItems ? 'disabled' : '') + '><i class="fas fa-pause"></i> Hold</button>' +
    '<button class="pos-btn pos-btn-pay" onclick="window._posOpenPayment()" ' + (!hasItems ? 'disabled' : '') + '><i class="fas fa-dollar-sign"></i> Pay $' + total.toFixed(2) + '</button>' +
  '</div>';

  el.innerHTML = html;
}

window._posToggleDelivery = function(checked) {
  _posDeliveryReq = checked;
  if (checked && !_posDeliveryDate) {
    var tomorrow = new Date(Date.now() + 86400000);
    _posDeliveryDate = tomorrow.toISOString().slice(0, 10);
  }
  renderCartFooter();
};

// ==================== WARNINGS ====================
function renderWarnings() {
  var el = document.getElementById('posWarnings');
  if (!el) return;
  if (_posWarnings.length === 0) { el.innerHTML = ''; return; }

  var html = '';
  _posWarnings.forEach(function(w) {
    var cls = w.type === 'error' ? 'error' : '';
    html += '<div class="pos-warning-bar ' + cls + '"><i class="fas fa-exclamation-triangle"></i><span class="pos-warning-text">' + esc(w.message) + '</span></div>';
  });
  el.innerHTML = html;
}

// ==================== CUSTOMER SELECTOR ====================
function renderCustomerArea() {
  var el = document.getElementById('posCustomerArea');
  if (!el) return;

  if (_posCustomer) {
    var acctHtml = '';
    if (_posCustomerAcct) {
      var bal = _posCustomerAcct.balance || 0;
      var limit = _posCustomerAcct.credit_limit || 0;
      var balClass = bal > limit && limit > 0 ? 'pos-badge-red' : 'pos-badge-blue';
      acctHtml = ' · Bal: <span class="pos-badge ' + balClass + '">$' + bal.toFixed(2) + '</span>';
      if (limit > 0) acctHtml += ' / $' + limit.toFixed(2);
    }
    var details = (_posCustomer.phone || '') + (_posCustomer.customer_type ? ' · ' + _posCustomer.customer_type : '');
    if (_posCustomer.tax_exempt) details += ' · <span class="pos-badge pos-badge-green">TAX EXEMPT</span>';
    if (_posCustomer.sponsor_discount) details += ' · <span class="pos-badge pos-badge-purple">' + _posCustomer.sponsor_discount + '% Sponsor</span>';
    if (_posCustomer.priority_rank) details += ' · <span class="pos-badge pos-badge-orange">P' + _posCustomer.priority_rank + '</span>';

    el.innerHTML =
      '<div class="pos-customer-selected">' +
        '<div style="width:36px;height:36px;background:var(--pos-navy);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">' +
          getInitials(_posCustomer.business_name || _posCustomer.contact_name || '?') +
        '</div>' +
        '<div class="pos-customer-info">' +
          '<div class="pos-customer-name">' + esc(_posCustomer.business_name || _posCustomer.contact_name) +
            ' <a href="#" onclick="window._posShowCustomerPanel(' + _posCustomer.id + ');return false" style="font-size:11px;color:var(--pos-navy-light)"><i class="fas fa-external-link-alt"></i></a></div>' +
          '<div class="pos-customer-detail">' + details + acctHtml + '</div>' +
        '</div>' +
        '<button class="pos-customer-remove" onclick="window._posRemoveCustomer()" title="Remove customer"><i class="fas fa-times"></i></button>' +
      '</div>';
  } else {
    el.innerHTML =
      '<input type="text" class="pos-customer-search" id="posCustomerSearch" placeholder="Search customer (name, phone, email)..." oninput="window._posSearchCustomers()" onfocus="window._posSearchCustomers()">' +
      '<div id="posCustomerDropdown" class="pos-customer-dropdown" style="display:none"></div>';
  }
}

window._posSearchCustomers = function() {
  var term = document.getElementById('posCustomerSearch')?.value || '';
  if (term.length < 1) { document.getElementById('posCustomerDropdown').style.display = 'none'; return; }

  API.get('/pos/customers?search=' + encodeURIComponent(term)).then(function(r) {
    var dd = document.getElementById('posCustomerDropdown');
    if (!dd) return;
    var custs = r.data || [];
    if (custs.length === 0) {
      dd.innerHTML = '<div style="padding:12px;color:var(--pos-gray-400);font-size:13px;text-align:center">No customers found</div>';
    } else {
      var html = '';
      custs.forEach(function(c) {
        var info = (c.phone || '') + (c.customer_type ? ' · ' + c.customer_type : '');
        if (c.account_balance > 0) info += ' · Bal: $' + (c.account_balance || 0).toFixed(2);
        html += '<div class="pos-customer-option" onclick="window._posSelectCustomer(' + c.id + ')">' +
          '<div style="font-weight:600;font-size:13px">' + esc(c.business_name || c.contact_name || 'Unknown') + '</div>' +
          '<div style="font-size:11px;color:var(--pos-gray-500)">' + info + '</div>' +
        '</div>';
      });
      dd.innerHTML = html;
    }
    dd.style.display = 'block';
  });
};

window._posSelectCustomer = function(id) {
  API.get('/pos/customers/' + id).then(function(r) {
    _posCustomer = r.data.customer;
    _posCustomerAcct = r.data.account;
    _posCustomerAddresses = r.data.addresses || [];
    _posDeliveryAddrId = null;

    // Build warnings for this customer
    _posWarnings = _posWarnings.filter(function(w) { return w.product_id; }); // keep stock warnings
    if (_posCustomerAcct && _posCustomerAcct.credit_limit > 0 && _posCustomerAcct.balance >= _posCustomerAcct.credit_limit) {
      _posWarnings.push({ type: 'error', message: 'Credit limit reached! Balance: $' + (_posCustomerAcct.balance || 0).toFixed(2) + ' / Limit: $' + _posCustomerAcct.credit_limit.toFixed(2) });
    }
    if (_posCustomerAcct && _posCustomerAcct.status === 'suspended') {
      _posWarnings.push({ type: 'error', message: 'Account is SUSPENDED — cannot charge to account' });
    }
    if (_posCustomer.priority_rank && _posCustomer.priority_rank >= 3) {
      _posWarnings.push({ type: 'warning', message: 'Low priority customer (rank ' + _posCustomer.priority_rank + ')' });
    }

    renderCustomerArea();
    renderWarnings();
    renderCartFooter();
    priceCheckAll();
  }).catch(function() {
    alert('Failed to load customer');
  });

  var dd = document.getElementById('posCustomerDropdown');
  if (dd) dd.style.display = 'none';
};

window._posRemoveCustomer = function() {
  _posCustomer = null;
  _posCustomerAcct = null;
  _posCustomerAddresses = [];
  _posDeliveryReq = false;
  _posDeliveryAddrId = null;
  _posWarnings = _posWarnings.filter(function(w) { return w.product_id; });

  // Reset prices to list
  _posCart.forEach(function(item) {
    item.effective_price = item.unit_price;
    item.price_source = 'list';
    item.discount_pct = 0;
  });

  renderCustomerArea();
  renderWarnings();
  renderCart();
  renderCartFooter();
};

function getInitials(name) {
  return (name || '?').split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
}

// ==================== CUSTOMER DETAIL PANEL ====================
window._posShowCustomerPanel = function(id) {
  API.get('/pos/customers/' + id).then(function(r) {
    var c = r.data.customer;
    var acct = r.data.account;
    var orders = r.data.recentOrders || [];
    var sales = r.data.recentSales || [];
    var rules = r.data.priceRules || [];
    var addrs = r.data.addresses || [];

    var html = '<div class="pos-cust-panel">' +
      '<div class="pos-cust-panel-header"><h3><i class="fas fa-user"></i> ' + esc(c.business_name || c.contact_name) + '</h3>' +
      '<button class="pos-modal-close" onclick="this.closest(\'.pos-cust-panel\').remove()"><i class="fas fa-times"></i></button></div>' +
      '<div class="pos-cust-panel-body">';

    // Basic info
    html += '<div class="pos-cust-section"><h4><i class="fas fa-id-card"></i> Information</h4>' +
      field('Business', c.business_name) + field('Contact', c.contact_name) + field('Phone', c.phone) +
      field('Email', c.email) + field('Type', c.customer_type) + field('Location', c.location_name) +
      field('Tax Exempt', c.tax_exempt ? 'Yes' : 'No') + field('Sponsor Discount', c.sponsor_discount ? c.sponsor_discount + '%' : 'None') +
      field('Priority', c.priority_rank ? 'Rank ' + c.priority_rank : 'Normal') +
    '</div>';

    // Account
    html += '<div class="pos-cust-section"><h4><i class="fas fa-credit-card"></i> Account</h4>' +
      field('Balance', '$' + (acct.balance || 0).toFixed(2)) +
      field('Credit Limit', acct.credit_limit ? '$' + acct.credit_limit.toFixed(2) : 'None') +
      field('Terms', acct.payment_terms || 'COD') +
      field('Status', acct.status || 'active') +
      (acct.last_payment_date ? field('Last Payment', acct.last_payment_date + ' ($' + (acct.last_payment_amount || 0).toFixed(2) + ')') : '') +
    '</div>';

    // Addresses
    if (addrs.length > 0) {
      html += '<div class="pos-cust-section"><h4><i class="fas fa-map-marker-alt"></i> Addresses</h4>';
      addrs.forEach(function(a) {
        html += '<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--pos-gray-100)">' +
          (a.label ? '<strong>' + esc(a.label) + '</strong> ' : '') +
          esc(a.street || '') + ', ' + esc(a.city || '') + ' ' + esc(a.state || '') + ' ' + esc(a.zip || '') +
          (a.is_primary ? ' <span class="pos-badge pos-badge-green">Primary</span>' : '') +
        '</div>';
      });
      html += '</div>';
    }

    // Price rules
    if (rules.length > 0) {
      html += '<div class="pos-cust-section"><h4><i class="fas fa-tag"></i> Price Rules</h4>';
      rules.forEach(function(r) {
        html += '<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--pos-gray-100)">' +
          esc(r.product_name || 'Product #' + r.product_id) + ' — ' +
          (r.price ? '$' + r.price.toFixed(2) : r.discount_pct + '% off') + ' (' + r.rule_type + ')' +
        '</div>';
      });
      html += '</div>';
    }

    // Recent sales
    if (sales.length > 0) {
      html += '<div class="pos-cust-section"><h4><i class="fas fa-receipt"></i> Recent POS Sales</h4>';
      sales.forEach(function(s) {
        html += '<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--pos-gray-100);display:flex;justify-content:space-between">' +
          '<span>' + s.sale_number + ' · ' + (s.created_at || '').slice(0, 10) + '</span>' +
          '<span style="font-weight:600">$' + (s.total || 0).toFixed(2) + '</span>' +
        '</div>';
      });
      html += '</div>';
    }

    // Recent orders
    if (orders.length > 0) {
      html += '<div class="pos-cust-section"><h4><i class="fas fa-box"></i> Recent Orders</h4>';
      orders.forEach(function(o) {
        html += '<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--pos-gray-100);display:flex;justify-content:space-between">' +
          '<span>' + o.order_number + ' · ' + o.status + '</span>' +
          '<span class="muted">' + (o.created_at || '').slice(0, 10) + '</span>' +
        '</div>';
      });
      html += '</div>';
    }

    html += '</div></div>';

    // Remove existing panel
    var existing = document.querySelector('.pos-cust-panel');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', html);
  });
};

function field(label, value) {
  return '<div class="pos-cust-field"><span class="pos-cust-field-label">' + label + '</span><span class="pos-cust-field-value">' + (value || '-') + '</span></div>';
}

// ==================== CLEAR CART ====================
window._posClearCart = function() {
  if (_posCart.length > 0 && !confirm('Clear all items from cart?')) return;
  _posCart = [];
  _posWarnings = _posWarnings.filter(function(w) { return !w.product_id; });
  renderCart();
  renderCartFooter();
  renderWarnings();
};

// ==================== HOLD SALE ====================
window._posHoldSale = function() {
  if (_posCart.length === 0) return;
  var reason = prompt('Hold reason (optional):') || '';

  // First create the sale as draft then hold it
  var body = buildSaleBody('hold');
  body.status = 'hold';

  API.post('/pos/sales', body).then(function(r) {
    var saleId = r.data.id;
    var user = null;
    try { user = JSON.parse(localStorage.getItem('bf_ops_user')); } catch(e) {}

    return API.put('/pos/sales/' + saleId + '/hold', {
      held_by: user ? user.id : null,
      held_by_name: user ? user.name : '',
      reason: reason,
      customer_name: _posCustomer ? _posCustomer.business_name : ''
    });
  }).then(function() {
    _posCart = [];
    _posWarnings = [];
    _posDeliveryReq = false;
    renderCart();
    renderCartFooter();
    renderWarnings();
    loadHeldCount();
    posToast('Sale held successfully');
  }).catch(function(err) {
    alert('Failed to hold sale: ' + (err.response?.data?.error || err.message));
  });
};

function loadHeldCount() {
  API.get('/pos/held?location_id=' + getLocationId()).then(function(r) {
    _posHeldCount = (r.data || []).length;
    var badge = document.getElementById('posHeldBadge');
    if (badge) {
      badge.textContent = _posHeldCount;
      badge.style.display = _posHeldCount > 0 ? 'inline' : 'none';
    }
  }).catch(function() {});
}

// ==================== SHOW HELD SALES ====================
window._posShowHeld = function() {
  API.get('/pos/held?location_id=' + getLocationId()).then(function(r) {
    var held = r.data || [];
    var html = '';
    if (held.length === 0) {
      html = '<div style="text-align:center;padding:20px;color:var(--pos-gray-400)"><i class="fas fa-inbox" style="font-size:24px;display:block;margin-bottom:8px"></i>No held sales</div>';
    } else {
      html = '<div style="display:flex;flex-direction:column;gap:8px">';
      held.forEach(function(h) {
        html += '<div style="background:var(--pos-gray-50);border:1px solid var(--pos-gray-200);border-radius:10px;padding:12px;display:flex;align-items:center;gap:12px">' +
          '<div style="flex:1">' +
            '<div style="font-weight:700;font-size:14px">' + esc(h.sale_number || 'Sale #' + h.sale_id) + '</div>' +
            '<div style="font-size:12px;color:var(--pos-gray-500)">' +
              (h.customer_business ? esc(h.customer_business) + ' · ' : '') +
              (h.item_count || 0) + ' items · $' + (h.total || 0).toFixed(2) +
              (h.reason ? ' · ' + esc(h.reason) : '') +
            '</div>' +
            '<div style="font-size:11px;color:var(--pos-gray-400)">' + esc(h.held_by_name || '') + ' · ' + timeAgo(h.held_at) + '</div>' +
          '</div>' +
          '<button class="pos-btn" style="background:var(--pos-navy);color:white;padding:8px 14px;font-size:12px" onclick="window._posResumeHeld(' + h.sale_id + ')"><i class="fas fa-play"></i> Resume</button>' +
          '<button class="pos-btn" style="background:var(--pos-red);color:white;padding:8px 14px;font-size:12px" onclick="window._posVoidSale(' + h.sale_id + ',true)"><i class="fas fa-trash"></i></button>' +
        '</div>';
      });
      html += '</div>';
    }
    showPosModal('Held Sales', html);
  });
};

window._posResumeHeld = function(saleId) {
  API.put('/pos/sales/' + saleId + '/resume').then(function(r) {
    // Load the sale items into cart
    var sale = r.data.sale;
    var items = r.data.items || [];

    _posCart = items.map(function(si) {
      return {
        product_id: si.product_id,
        name: si.product_name,
        sku: si.sku,
        category: si.category,
        qty: si.quantity,
        unit_price: si.unit_price,
        effective_price: si.unit_price - (si.discount_amount || 0) / (si.quantity || 1),
        price_source: 'list',
        tax_rate: si.tax_rate || 0,
        cost: si.unit_cost || 0,
        discount_pct: si.discount_pct || 0,
        stock: 999 // Don't know current stock, be generous
      };
    });

    // Load customer if any
    if (sale.customer_id) {
      window._posSelectCustomer(sale.customer_id);
    }

    closePosModal();
    renderCart();
    renderCartFooter();
    loadHeldCount();
    posToast('Sale resumed');
  }).catch(function(err) {
    alert('Failed to resume: ' + (err.response?.data?.error || err.message));
  });
};

// ==================== PAYMENT FLOW ====================
window._posOpenPayment = function() {
  if (_posCart.length === 0) return;

  var totals = calcTotals();
  var canChargeAccount = _posCustomer && _posCustomerAcct && _posCustomerAcct.status !== 'suspended';
  var accountDisabled = !canChargeAccount ? ' style="opacity:0.4;pointer-events:none"' : '';

  var html =
    '<div style="text-align:center;margin-bottom:16px">' +
      '<div style="font-size:14px;color:var(--pos-gray-500)">Total Due</div>' +
      '<div style="font-size:36px;font-weight:800;color:var(--pos-navy)">$' + totals.total.toFixed(2) + '</div>' +
      (_posCustomer ? '<div style="font-size:13px;color:var(--pos-gray-500)">' + esc(_posCustomer.business_name || '') + '</div>' : '') +
    '</div>' +

    '<div class="pos-pay-methods">' +
      '<div class="pos-pay-method active" data-method="cash" onclick="window._posSelectPayMethod(\'cash\')">' +
        '<i class="fas fa-money-bill-wave"></i><span>Cash</span></div>' +
      '<div class="pos-pay-method" data-method="credit_card" onclick="window._posSelectPayMethod(\'credit_card\')">' +
        '<i class="fas fa-credit-card"></i><span>Credit Card</span></div>' +
      '<div class="pos-pay-method" data-method="debit_card" onclick="window._posSelectPayMethod(\'debit_card\')">' +
        '<i class="far fa-credit-card"></i><span>Debit Card</span></div>' +
      '<div class="pos-pay-method" data-method="check" onclick="window._posSelectPayMethod(\'check\')">' +
        '<i class="fas fa-money-check"></i><span>Check</span></div>' +
      '<div class="pos-pay-method" data-method="account" onclick="window._posSelectPayMethod(\'account\')"' + accountDisabled + '>' +
        '<i class="fas fa-building"></i><span>On Account</span></div>' +
      '<div class="pos-pay-method" data-method="split" onclick="window._posSelectPayMethod(\'split\')">' +
        '<i class="fas fa-divide"></i><span>Split</span></div>' +
    '</div>' +

    '<div id="posPayDetails"></div>';

  showPosModal('Payment', html,
    '<button class="pos-btn" style="background:var(--pos-gray-200);color:var(--pos-gray-700);flex:1" onclick="closePosModal()">Cancel</button>' +
    '<button class="pos-btn pos-btn-pay" style="flex:2" id="posPaySubmitBtn" onclick="window._posProcessPayment()"><i class="fas fa-check"></i> Complete Sale</button>'
  );

  _posSelectPayMethod('cash');
};

var _posPayMethod = 'cash';
var _posSplitPayments = [];

window._posSelectPayMethod = function(method) {
  _posPayMethod = method;
  document.querySelectorAll('.pos-pay-method').forEach(function(el) { el.classList.remove('active'); });
  var target = document.querySelector('.pos-pay-method[data-method="' + method + '"]');
  if (target) target.classList.add('active');

  var totals = calcTotals();
  var detailEl = document.getElementById('posPayDetails');
  if (!detailEl) return;

  if (method === 'cash') {
    var html = '<div class="pos-pay-amount"><label>Cash Received</label>' +
      '<input type="number" id="posCashAmount" value="' + totals.total.toFixed(2) + '" step="0.01" min="0" oninput="window._posCalcChange()"></div>' +
      '<div class="pos-quick-cash">';
    [5, 10, 20, 50, 100].forEach(function(amt) {
      if (amt >= totals.total) {
        html += '<button class="pos-quick-cash-btn" onclick="document.getElementById(\'posCashAmount\').value=' + amt + ';window._posCalcChange()">$' + amt + '</button>';
      }
    });
    // Exact
    html += '<button class="pos-quick-cash-btn" onclick="document.getElementById(\'posCashAmount\').value=\'' + totals.total.toFixed(2) + '\';window._posCalcChange()">Exact</button>';
    html += '</div>';
    html += '<div id="posChangeDisplay" style="text-align:center;font-size:18px;font-weight:700;color:var(--pos-green)"></div>';
    detailEl.innerHTML = html;
    window._posCalcChange();
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
    var bal = _posCustomerAcct ? _posCustomerAcct.balance : 0;
    var limit = _posCustomerAcct ? _posCustomerAcct.credit_limit : 0;
    var newBal = bal + totals.total;
    var overLimit = limit > 0 && newBal > limit;

    detailEl.innerHTML = '<div style="text-align:center;padding:16px">' +
      '<i class="fas fa-building" style="font-size:24px;color:var(--pos-navy);margin-bottom:8px;display:block"></i>' +
      '<div style="font-size:14px;color:var(--pos-gray-600)">Charge to ' + esc(_posCustomer?.business_name || 'customer') + ' account</div>' +
      '<div style="margin-top:12px;font-size:13px">' +
        '<div>Current Balance: <strong>$' + bal.toFixed(2) + '</strong></div>' +
        '<div>This Sale: <strong>$' + totals.total.toFixed(2) + '</strong></div>' +
        '<div>New Balance: <strong style="color:' + (overLimit ? 'var(--pos-red)' : 'var(--pos-navy)') + '">$' + newBal.toFixed(2) + '</strong></div>' +
        (limit > 0 ? '<div>Credit Limit: $' + limit.toFixed(2) + '</div>' : '') +
        (overLimit ? '<div style="color:var(--pos-red);font-weight:700;margin-top:6px"><i class="fas fa-exclamation-triangle"></i> OVER CREDIT LIMIT</div>' : '') +
      '</div></div>';
  } else if (method === 'split') {
    _posSplitPayments = [{ method: 'cash', amount: totals.total }];
    renderSplitPayments(totals.total);
  }
};

window._posCalcChange = function() {
  var totals = calcTotals();
  var cash = parseFloat(document.getElementById('posCashAmount')?.value || 0);
  var change = cash - totals.total;
  var el = document.getElementById('posChangeDisplay');
  if (el) {
    if (change >= 0) {
      el.innerHTML = 'Change: $' + change.toFixed(2);
      el.style.color = 'var(--pos-green)';
    } else {
      el.innerHTML = 'Short: $' + Math.abs(change).toFixed(2);
      el.style.color = 'var(--pos-red)';
    }
  }
};

function renderSplitPayments(total) {
  var el = document.getElementById('posPayDetails');
  if (!el) return;

  var html = '<div class="pos-pay-split"><div style="font-size:13px;font-weight:600;margin-bottom:8px">Split Payment</div>';
  var allocated = 0;
  _posSplitPayments.forEach(function(sp, i) {
    allocated += parseFloat(sp.amount) || 0;
    html += '<div class="pos-pay-split-row">' +
      '<select onchange="window._posSplitMethod(' + i + ',this.value)">' +
        splitOption('cash', sp.method) + splitOption('credit_card', sp.method) + splitOption('debit_card', sp.method) +
        splitOption('check', sp.method) + splitOption('account', sp.method) +
      '</select>' +
      '<input type="number" value="' + (sp.amount || 0).toFixed(2) + '" step="0.01" onchange="window._posSplitAmount(' + i + ',this.value)">' +
      '<button style="background:none;border:none;color:var(--pos-red);cursor:pointer;font-size:14px" onclick="window._posSplitRemove(' + i + ')"><i class="fas fa-trash"></i></button>' +
    '</div>';
  });

  var remaining = total - allocated;
  html += '<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:13px">' +
    '<span>Remaining: <strong style="color:' + (remaining > 0.01 ? 'var(--pos-red)' : 'var(--pos-green)') + '">$' + remaining.toFixed(2) + '</strong></span>' +
    '<button class="pos-btn" style="background:var(--pos-gray-200);color:var(--pos-gray-700);padding:6px 12px;font-size:12px" onclick="window._posSplitAdd()"><i class="fas fa-plus"></i> Add</button>' +
  '</div></div>';
  el.innerHTML = html;
}

function splitOption(val, selected) {
  var labels = { cash: 'Cash', credit_card: 'Credit Card', debit_card: 'Debit Card', check: 'Check', account: 'On Account' };
  return '<option value="' + val + '" ' + (val === selected ? 'selected' : '') + '>' + labels[val] + '</option>';
}

window._posSplitMethod = function(i, val) { _posSplitPayments[i].method = val; };
window._posSplitAmount = function(i, val) { _posSplitPayments[i].amount = parseFloat(val) || 0; renderSplitPayments(calcTotals().total); };
window._posSplitRemove = function(i) { _posSplitPayments.splice(i, 1); renderSplitPayments(calcTotals().total); };
window._posSplitAdd = function() {
  var totals = calcTotals();
  var allocated = _posSplitPayments.reduce(function(s, p) { return s + (parseFloat(p.amount) || 0); }, 0);
  _posSplitPayments.push({ method: 'cash', amount: Math.max(0, totals.total - allocated) });
  renderSplitPayments(totals.total);
};

// ==================== PROCESS PAYMENT ====================
window._posProcessPayment = function() {
  var totals = calcTotals();
  var body = buildSaleBody('completed');

  // Build payments array
  if (_posPayMethod === 'split') {
    body.payments = _posSplitPayments.map(function(sp) { return { method: sp.method, amount: sp.amount }; });
    body.amount_paid = _posSplitPayments.reduce(function(s, p) { return s + (parseFloat(p.amount) || 0); }, 0);
  } else if (_posPayMethod === 'cash') {
    var cashAmt = parseFloat(document.getElementById('posCashAmount')?.value || totals.total);
    body.amount_paid = cashAmt;
    body.payments = [{ method: 'cash', amount: cashAmt }];
  } else if (_posPayMethod === 'credit_card' || _posPayMethod === 'debit_card') {
    body.payments = [{ method: _posPayMethod, amount: totals.total, card_last4: document.getElementById('posCardLast4')?.value || null }];
    body.amount_paid = totals.total;
  } else if (_posPayMethod === 'check') {
    body.payments = [{ method: 'check', amount: totals.total, check_number: document.getElementById('posCheckNumber')?.value || null }];
    body.amount_paid = totals.total;
  } else if (_posPayMethod === 'account') {
    body.payments = [{ method: 'account', amount: totals.total }];
    body.amount_paid = totals.total;
  }

  // Disable button
  var btn = document.getElementById('posPaySubmitBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; }

  API.post('/pos/sales', body).then(function(r) {
    closePosModal();
    showReceipt(r.data);
    _posCart = [];
    _posWarnings = [];
    _posDeliveryReq = false;
    renderCart();
    renderCartFooter();
    renderWarnings();
    loadHeldCount();
  }).catch(function(err) {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Complete Sale'; }
    var msg = err.response?.data?.error || err.message;
    var warnings = err.response?.data?.warnings || [];
    alert('Sale failed: ' + msg + (warnings.length ? '\n\nWarnings:\n' + warnings.join('\n') : ''));
  });
};

function buildSaleBody(status) {
  var isTaxExempt = _posCustomer && _posCustomer.tax_exempt;
  var user = null;
  try { user = JSON.parse(localStorage.getItem('bf_ops_user')); } catch(e) {}

  var items = _posCart.map(function(c) {
    return {
      product_id: c.product_id,
      quantity: c.qty,
      unit_price: c.effective_price,
      discount_pct: c.discount_pct || 0,
      location_id: getLocationId()
    };
  });

  var saleType = 'walk_in';
  if (_posDeliveryReq) saleType = 'delivery';
  else if (_posSession && _posSession.register_type === 'warehouse') saleType = 'wholesale';

  return {
    session_id: _posSession ? _posSession.id : null,
    location_id: getLocationId(),
    customer_id: _posCustomer ? _posCustomer.id : null,
    sale_type: saleType,
    status: status,
    items: items,
    allow_negative_stock: true,
    delivery_requested: _posDeliveryReq,
    delivery_date: _posDeliveryReq ? _posDeliveryDate : null,
    delivery_address_id: _posDeliveryReq ? _posDeliveryAddrId : null,
    cashier_id: user ? user.id : null,
    cashier_name: user ? user.name : '',
    notes: '',
    internal_notes: ''
  };
}

function calcTotals() {
  var subtotal = 0, taxTotal = 0, discountTotal = 0;
  var isTaxExempt = _posCustomer && _posCustomer.tax_exempt;
  _posCart.forEach(function(item) {
    var lineSubtotal = item.effective_price * item.qty;
    var lineDiscount = (item.unit_price - item.effective_price) * item.qty;
    var taxRate = isTaxExempt ? 0 : (item.tax_rate || 0);
    subtotal += lineSubtotal;
    taxTotal += lineSubtotal * (taxRate / 100);
    discountTotal += lineDiscount;
  });
  return { subtotal: subtotal, tax: taxTotal, discount: discountTotal, total: subtotal + taxTotal };
}

// ==================== RECEIPT ====================
function showReceipt(saleData) {
  var html = '<div class="pos-receipt">' +
    '<div class="pos-receipt-header">' +
      '<h2>British Feed & Supplies</h2>' +
      '<p>Sale #' + saleData.sale_number + '</p>' +
      '<p>' + new Date().toLocaleString() + '</p>' +
      (_posCustomer ? '<p>' + esc(_posCustomer.business_name || _posCustomer.contact_name || '') + '</p>' : '') +
    '</div>' +
    '<div class="pos-receipt-items">';

  _posCart.forEach(function(item) {
    html += '<div class="pos-receipt-item">' +
      '<span class="name">' + esc(item.name) + '</span>' +
      '<span class="qty">x' + item.qty + '</span>' +
      '<span class="amount">$' + (item.effective_price * item.qty).toFixed(2) + '</span>' +
    '</div>';
  });

  html += '</div><div class="pos-receipt-totals">' +
    '<div class="pos-receipt-total"><span>Subtotal</span><span>$' + (saleData.subtotal || 0).toFixed(2) + '</span></div>' +
    '<div class="pos-receipt-total"><span>Tax</span><span>$' + (saleData.tax || 0).toFixed(2) + '</span></div>';
  if (saleData.discount > 0) {
    html += '<div class="pos-receipt-total"><span>Discount</span><span>-$' + saleData.discount.toFixed(2) + '</span></div>';
  }
  html += '<div class="pos-receipt-total grand"><span>Total</span><span>$' + (saleData.total || 0).toFixed(2) + '</span></div>';
  if (saleData.change_due > 0) {
    html += '<div class="pos-receipt-total"><span>Change</span><span>$' + saleData.change_due.toFixed(2) + '</span></div>';
  }
  html += '</div>';

  if (saleData.order_id) {
    html += '<div style="text-align:center;margin-top:12px;padding:8px;background:#EFF6FF;border-radius:8px;font-size:12px;font-weight:600;color:var(--pos-navy)"><i class="fas fa-truck"></i> Delivery Order Created</div>';
  }
  if (saleData.warnings && saleData.warnings.length > 0) {
    html += '<div style="text-align:center;margin-top:8px;font-size:11px;color:var(--pos-orange)">Warnings: ' + saleData.warnings.join(', ') + '</div>';
  }

  html += '<div class="pos-receipt-footer">Thank you for your business!</div></div>';

  showPosModal('Sale Complete', html,
    '<button class="pos-btn" style="background:var(--pos-gray-200);color:var(--pos-gray-700);flex:1" onclick="window._posPrintReceipt()"><i class="fas fa-print"></i> Print</button>' +
    '<button class="pos-btn pos-btn-pay" style="flex:1" onclick="closePosModal()"><i class="fas fa-check"></i> Done</button>'
  );
}

window._posPrintReceipt = function() {
  var receipt = document.querySelector('.pos-receipt');
  if (!receipt) return;
  var win = window.open('', '_blank');
  win.document.write('<!DOCTYPE html><html><head><style>body{font-family:monospace;padding:20px;max-width:300px;margin:0 auto}h2{text-align:center;margin:0}p{text-align:center;margin:2px 0;font-size:12px}.pos-receipt-item,.pos-receipt-total{display:flex;justify-content:space-between;padding:2px 0;font-size:12px}.pos-receipt-total.grand{font-weight:bold;border-top:1px dashed #000;margin-top:4px;padding-top:4px}.pos-receipt-footer{text-align:center;margin-top:16px;border-top:1px dashed #000;padding-top:8px;font-size:11px}</style></head><body>' + receipt.innerHTML + '</body></html>');
  win.document.close();
  setTimeout(function() { win.print(); }, 300);
};

// ==================== VOID SALE ====================
window._posVoidSale = function(saleId, fromHeld) {
  if (!confirm('Are you sure you want to void this sale?')) return;
  var reason = prompt('Void reason:') || 'Voided by cashier';
  var user = null;
  try { user = JSON.parse(localStorage.getItem('bf_ops_user')); } catch(e) {}

  API.put('/pos/sales/' + saleId + '/void', { reason: reason, voided_by_name: user ? user.name : '' }).then(function() {
    posToast('Sale voided');
    if (fromHeld) { closePosModal(); loadHeldCount(); }
    else if (_posView === 'history') loadHistory();
  }).catch(function(err) {
    alert('Void failed: ' + (err.response?.data?.error || err.message));
  });
};

// ==================== CLOSE SESSION ====================
window._posCloseSession = function() {
  if (!confirm('Close this register session?')) return;
  var closingCash = prompt('Enter closing cash count ($):', '0') || '0';

  API.put('/pos/sessions/' + _posSession.id + '/close', {
    closing_cash: parseFloat(closingCash) || 0,
    notes: ''
  }).then(function() {
    _posSession = null;
    localStorage.removeItem('bf_pos_session');
    _posCart = [];
    _posWarnings = [];
    renderOpenSession();
    posToast('Register closed');
  }).catch(function(err) {
    alert('Failed to close session: ' + (err.response?.data?.error || err.message));
  });
};

// ==================== DASHBOARD ====================
function loadDashboard() {
  var el = document.getElementById('posViewDashboard');
  if (!el) return;
  el.innerHTML = '<div class="pos-loading"><i class="fas fa-spinner fa-spin"></i> Loading dashboard...</div>';

  API.get('/pos/dashboard?location_id=' + getLocationId()).then(function(r) {
    var d = r.data;
    var t = d.today || {};

    var html = '<div class="pos-dash-cards">' +
      dashCard('Transactions', fmtN(t.transactions), '', 'Today') +
      dashCard('Revenue', '$' + (t.revenue || 0).toFixed(2), 'green', 'Today') +
      dashCard('Avg Transaction', '$' + (t.avg_transaction || 0).toFixed(2), '', 'Today') +
      dashCard('Walk-in', '$' + (t.walk_in_revenue || 0).toFixed(2), '', '') +
      dashCard('Delivery', '$' + (t.delivery_revenue || 0).toFixed(2), '', '') +
      dashCard('Wholesale', '$' + (t.wholesale_revenue || 0).toFixed(2), '', '') +
      dashCard('Held Sales', _posHeldCount, _posHeldCount > 0 ? 'orange' : '', '') +
    '</div>';

    // Payment breakdown
    if (d.paymentBreakdown && d.paymentBreakdown.length > 0) {
      html += '<div class="pos-dash-section"><h3><i class="fas fa-credit-card"></i> Payments Today</h3>';
      html += '<table class="pos-table"><thead><tr><th>Method</th><th class="right">Count</th><th class="right">Total</th></tr></thead><tbody>';
      d.paymentBreakdown.forEach(function(p) {
        html += '<tr><td style="text-transform:capitalize">' + (p.method || '').replace(/_/g, ' ') + '</td><td class="right">' + p.count + '</td><td class="right money">$' + (p.total || 0).toFixed(2) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    // Top products
    if (d.topProducts && d.topProducts.length > 0) {
      html += '<div class="pos-dash-section"><h3><i class="fas fa-star"></i> Top Products Today</h3>';
      html += '<table class="pos-table"><thead><tr><th>Product</th><th class="right">Qty</th><th class="right">Revenue</th></tr></thead><tbody>';
      d.topProducts.forEach(function(p) {
        html += '<tr><td>' + esc(p.product_name) + '</td><td class="right">' + fmtN(p.qty) + '</td><td class="right money">$' + (p.revenue || 0).toFixed(2) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    // Low stock
    if (d.lowStock && d.lowStock.length > 0) {
      html += '<div class="pos-dash-section"><h3><i class="fas fa-exclamation-triangle" style="color:var(--pos-orange)"></i> Low Stock Alerts</h3>';
      html += '<table class="pos-table"><thead><tr><th>Product</th><th>Location</th><th class="right">Available</th><th class="right">Reorder Pt</th></tr></thead><tbody>';
      d.lowStock.forEach(function(s) {
        html += '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.location || '') + '</td><td class="right" style="color:var(--pos-red);font-weight:700">' + fmtN(s.qty_available) + '</td><td class="right">' + fmtN(s.reorder_point) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    el.innerHTML = html;
  }).catch(function() {
    el.innerHTML = '<div class="pos-loading" style="color:var(--pos-red)"><i class="fas fa-exclamation-triangle"></i> Failed to load dashboard</div>';
  });
}

function dashCard(label, value, color, sub) {
  return '<div class="pos-dash-card">' +
    '<div class="pos-dash-card-label">' + label + '</div>' +
    '<div class="pos-dash-card-value ' + (color || '') + '">' + value + '</div>' +
    (sub ? '<div class="pos-dash-card-sub">' + sub + '</div>' : '') +
  '</div>';
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
      '<button class="pos-btn" style="background:var(--pos-navy);color:white;padding:8px 14px;font-size:13px" onclick="window._posLoadHistory()"><i class="fas fa-search"></i> Search</button>' +
    '</div>' +
    '<div class="pos-history-table" id="posHistTable"><div class="pos-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div></div>';

  window._posLoadHistory();
}

window._posLoadHistory = function() {
  var from = document.getElementById('posHistFrom')?.value || '';
  var to = document.getElementById('posHistTo')?.value || '';
  var status = document.getElementById('posHistStatus')?.value || '';
  var search = document.getElementById('posHistSearch')?.value || '';

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
      var statusClass = 'status-' + s.status;
      var pmtStr = (s.payment_methods || '').split(',').map(function(p) { return (p.split(':')[0] || '').replace(/_/g,' '); }).join(', ');
      html += '<tr class="clickable" onclick="window._posShowSaleDetail(' + s.id + ')">' +
        '<td style="font-weight:600">' + esc(s.sale_number || '') + '</td>' +
        '<td>' + esc(s.customer_name || 'Walk-in') + '</td>' +
        '<td><span class="pos-badge pos-badge-blue">' + (s.sale_type || '').replace(/_/g,' ') + '</span></td>' +
        '<td><span class="status-badge ' + statusClass + '">' + s.status + '</span></td>' +
        '<td>' + (s.item_count || 0) + '</td>' +
        '<td class="right money">$' + (s.total || 0).toFixed(2) + '</td>' +
        '<td style="font-size:12px;text-transform:capitalize">' + pmtStr + '</td>' +
        '<td style="font-size:12px;color:var(--pos-gray-400)">' + (s.created_at || '').slice(0, 16).replace('T', ' ') + '</td>' +
        '<td>' + (s.status === 'completed' ? '<button class="pos-btn" style="background:var(--pos-red);color:white;padding:4px 8px;font-size:11px" onclick="event.stopPropagation();window._posVoidSale(' + s.id + ')">Void</button>' : '') + '</td>' +
      '</tr>';
    });
    html += '</tbody></table>';
    tableEl.innerHTML = html;
  }).catch(function() {
    var tableEl = document.getElementById('posHistTable');
    if (tableEl) tableEl.innerHTML = '<div class="pos-loading" style="color:var(--pos-red)"><i class="fas fa-exclamation-triangle"></i> Failed to load</div>';
  });
};

// ==================== SALE DETAIL MODAL ====================
window._posShowSaleDetail = function(id) {
  API.get('/pos/sales/' + id).then(function(r) {
    var sale = r.data.sale;
    var items = r.data.items || [];
    var payments = r.data.payments || [];
    var customer = r.data.customer;

    var html = '<div style="display:grid;gap:12px">';

    // Header info
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">' +
      field('Sale Number', sale.sale_number) +
      field('Status', '<span class="status-badge status-' + sale.status + '">' + sale.status + '</span>') +
      field('Date', (sale.created_at || '').slice(0, 16).replace('T', ' ')) +
      field('Type', (sale.sale_type || '').replace(/_/g, ' ')) +
      field('Cashier', sale.cashier_name || '-') +
      field('Customer', customer ? esc(customer.business_name || customer.contact_name || '-') : 'Walk-in') +
    '</div>';

    // Items
    html += '<div><h4 style="font-size:13px;font-weight:700;color:var(--pos-navy);margin-bottom:6px">Items</h4>' +
      '<table class="pos-table"><thead><tr><th>Product</th><th class="right">Qty</th><th class="right">Price</th><th class="right">Total</th></tr></thead><tbody>';
    items.forEach(function(item) {
      html += '<tr><td>' + esc(item.product_name) + '<br><span style="font-size:11px;color:var(--pos-gray-400)">' + esc(item.sku || '') + '</span></td>' +
        '<td class="right">' + item.quantity + '</td>' +
        '<td class="right">$' + (item.unit_price || 0).toFixed(2) + '</td>' +
        '<td class="right money">$' + (item.line_total || 0).toFixed(2) + '</td></tr>';
    });
    html += '</tbody></table></div>';

    // Payments
    html += '<div><h4 style="font-size:13px;font-weight:700;color:var(--pos-navy);margin-bottom:6px">Payments</h4>';
    payments.forEach(function(p) {
      html += '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;border-bottom:1px solid var(--pos-gray-100)">' +
        '<span style="text-transform:capitalize">' + (p.method || '').replace(/_/g, ' ') +
        (p.card_last4 ? ' ****' + p.card_last4 : '') +
        (p.check_number ? ' #' + p.check_number : '') + '</span>' +
        '<span style="font-weight:600">$' + (p.amount || 0).toFixed(2) + '</span></div>';
    });
    html += '</div>';

    // Totals
    html += '<div style="background:var(--pos-gray-50);border-radius:8px;padding:12px">' +
      '<div style="display:flex;justify-content:space-between;font-size:13px"><span>Subtotal</span><span>$' + (sale.subtotal || 0).toFixed(2) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:13px"><span>Tax</span><span>$' + (sale.tax_amount || 0).toFixed(2) + '</span></div>';
    if (sale.discount_amount > 0) {
      html += '<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--pos-red)"><span>Discount</span><span>-$' + sale.discount_amount.toFixed(2) + '</span></div>';
    }
    html += '<div style="display:flex;justify-content:space-between;font-size:18px;font-weight:800;border-top:2px solid var(--pos-gray-200);margin-top:4px;padding-top:6px"><span>Total</span><span>$' + (sale.total || 0).toFixed(2) + '</span></div>';
    if (sale.change_due > 0) {
      html += '<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--pos-green)"><span>Change</span><span>$' + sale.change_due.toFixed(2) + '</span></div>';
    }
    html += '</div>';

    if (sale.order_id) {
      html += '<div style="background:#EFF6FF;border-radius:8px;padding:12px;font-size:13px;text-align:center;font-weight:600;color:var(--pos-navy)"><i class="fas fa-truck"></i> Delivery Order #' + sale.order_id + '</div>';
    }
    if (sale.notes) {
      html += '<div style="font-size:12px;color:var(--pos-gray-500)"><i class="fas fa-note-sticky"></i> ' + esc(sale.notes) + '</div>';
    }

    html += '</div>';

    var footerBtns = '';
    if (sale.status === 'completed') {
      footerBtns += '<button class="pos-btn" style="background:var(--pos-purple);color:white;flex:1" onclick="window._posRefundSale(' + sale.id + ')"><i class="fas fa-rotate-left"></i> Refund</button>';
      footerBtns += '<button class="pos-btn" style="background:var(--pos-red);color:white;flex:1" onclick="window._posVoidSale(' + sale.id + ');closePosModal()"><i class="fas fa-ban"></i> Void</button>';
    }
    footerBtns += '<button class="pos-btn" style="background:var(--pos-gray-200);color:var(--pos-gray-700);flex:1" onclick="closePosModal()">Close</button>';

    showPosModal('Sale ' + sale.sale_number, html, footerBtns);
  });
};

// ==================== REFUND ====================
window._posRefundSale = function(saleId) {
  API.get('/pos/sales/' + saleId).then(function(r) {
    var sale = r.data.sale;
    var items = r.data.items || [];

    var html = '<div style="margin-bottom:12px;font-size:13px;color:var(--pos-gray-600)">Select items to refund for Sale #' + esc(sale.sale_number) + '</div>';
    html += '<div id="posRefundItems">';
    items.forEach(function(item, idx) {
      html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--pos-gray-100)">' +
        '<input type="checkbox" id="posRefItem' + idx + '" checked data-item-id="' + item.id + '" data-product-id="' + item.product_id + '" data-product-name="' + esc(item.product_name) + '" data-unit-price="' + item.unit_price + '" data-max-qty="' + item.quantity + '">' +
        '<div style="flex:1"><div style="font-weight:600;font-size:13px">' + esc(item.product_name) + '</div><div style="font-size:11px;color:var(--pos-gray-400)">$' + (item.unit_price || 0).toFixed(2) + ' ea</div></div>' +
        '<input type="number" value="' + item.quantity + '" min="1" max="' + item.quantity + '" style="width:60px;padding:6px;border:1px solid var(--pos-gray-200);border-radius:6px;text-align:center;font-size:13px" id="posRefQty' + idx + '">' +
      '</div>';
    });
    html += '</div>';
    html += '<div style="margin-top:12px"><label style="display:flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" id="posRefRestock" checked> Restock items</label></div>';
    html += '<div style="margin-top:8px"><label style="font-size:12px;font-weight:600;color:var(--pos-gray-500)">Reason</label><input type="text" id="posRefReason" placeholder="Return reason..." style="width:100%;padding:8px;border:1px solid var(--pos-gray-200);border-radius:8px;margin-top:4px"></div>';

    closePosModal();
    showPosModal('Process Refund', html,
      '<button class="pos-btn" style="background:var(--pos-gray-200);color:var(--pos-gray-700);flex:1" onclick="closePosModal()">Cancel</button>' +
      '<button class="pos-btn" style="background:var(--pos-purple);color:white;flex:1" onclick="window._posSubmitRefund(' + saleId + ',' + items.length + ')"><i class="fas fa-rotate-left"></i> Process Refund</button>'
    );
  });
};

window._posSubmitRefund = function(saleId, itemCount) {
  var refundItems = [];
  for (var i = 0; i < itemCount; i++) {
    var cb = document.getElementById('posRefItem' + i);
    if (cb && cb.checked) {
      refundItems.push({
        sale_item_id: parseInt(cb.dataset.itemId),
        product_id: parseInt(cb.dataset.productId),
        product_name: cb.dataset.productName,
        unit_price: parseFloat(cb.dataset.unitPrice),
        quantity: parseInt(document.getElementById('posRefQty' + i)?.value || 1),
        restock: document.getElementById('posRefRestock')?.checked !== false
      });
    }
  }

  if (refundItems.length === 0) { alert('Select at least one item to refund'); return; }

  var user = null;
  try { user = JSON.parse(localStorage.getItem('bf_ops_user')); } catch(e) {}

  var body = {
    original_sale_id: saleId,
    location_id: getLocationId(),
    customer_id: _posCustomer ? _posCustomer.id : null,
    refund_type: 'return',
    refund_method: 'original',
    reason: document.getElementById('posRefReason')?.value || '',
    restock: document.getElementById('posRefRestock')?.checked !== false,
    processed_by: user ? user.id : null,
    processed_by_name: user ? user.name : '',
    items: refundItems
  };

  API.post('/pos/refunds', body).then(function(r) {
    closePosModal();
    posToast('Refund #' + r.data.refund_number + ' processed — $' + (r.data.total || 0).toFixed(2));
    if (_posView === 'history') loadHistory();
  }).catch(function(err) {
    alert('Refund failed: ' + (err.response?.data?.error || err.message));
  });
};

// ==================== MODAL HELPERS ====================
function showPosModal(title, bodyHtml, footerHtml) {
  closePosModal();
  var overlay = document.createElement('div');
  overlay.className = 'pos-modal-overlay';
  overlay.id = 'posModalOverlay';
  overlay.onclick = function(e) { if (e.target === overlay) closePosModal(); };
  overlay.innerHTML =
    '<div class="pos-modal">' +
      '<div class="pos-modal-header"><h3>' + title + '</h3><button class="pos-modal-close" onclick="closePosModal()"><i class="fas fa-times"></i></button></div>' +
      '<div class="pos-modal-body">' + bodyHtml + '</div>' +
      (footerHtml ? '<div class="pos-modal-footer">' + footerHtml + '</div>' : '') +
    '</div>';
  document.body.appendChild(overlay);
}

window.closePosModal = function() {
  var existing = document.getElementById('posModalOverlay');
  if (existing) existing.remove();
};

function posToast(msg) {
  if (typeof window.shellToast === 'function') { window.shellToast(msg); return; }
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#059669;color:white;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:99999;animation:posFadeIn 0.3s';
  el.innerHTML = '<i class="fas fa-check-circle"></i> ' + msg;
  document.body.appendChild(el);
  setTimeout(function() { el.style.opacity = '0'; setTimeout(function() { el.remove(); }, 300); }, 3000);
}

// ==================== UTILITY ====================
function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function esc2(s) { return "'" + s.replace(/'/g, "\\'").replace(/\\/g, "\\\\") + "'"; }
function fmtN(v) { return (v || 0).toLocaleString(); }
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
