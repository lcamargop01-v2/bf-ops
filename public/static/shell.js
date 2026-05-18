// BF Operations — Parent Shell
// Manages auth, module switching, and the top-level navigation

var API = axios.create({ baseURL: '/api' });
var currentUser = null;
var activeModule = null; // 'logistics', 'inventory', 'ordering', 'pos', 'tasks', 'admin'
var loadedModuleScripts = {}; // track loaded JS modules

var MODULES = [
  { id: 'logistics', name: 'Logistics', icon: 'fa-truck-fast', desc: 'Delivery routes, orders, fleet management', color: '#1E3A8A' },
  { id: 'inventory', name: 'Inventory', icon: 'fa-warehouse', desc: 'Stock levels, movements, multi-location tracking', color: '#059669' },
  { id: 'ordering', name: 'Purchasing', icon: 'fa-cart-shopping', desc: 'Purchase orders, vendors, receiving', color: '#D97706' },
  { id: 'crm', name: 'CRM', icon: 'fa-handshake', desc: 'Contacts, organizations, sales pipeline', color: '#6366F1' },
  { id: 'pos', name: 'Point of Sale', icon: 'fa-cash-register', desc: 'Register, payments, receipts', color: '#7C3AED', soon: true },
  { id: 'tasks', name: 'Tasks', icon: 'fa-list-check', desc: 'Team tasks, checklists, operations', color: '#DC2626', soon: true },
];

// ==================== AUTH ====================

function setToken(t) {
  if (t) { localStorage.setItem('bf_ops_token', t); API.defaults.headers.common['Authorization'] = 'Bearer ' + t; }
  else { localStorage.removeItem('bf_ops_token'); delete API.defaults.headers.common['Authorization']; }
}

function getInitials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

function shellToast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = 'shell-toast ' + type;
  el.innerHTML = `<i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i> ${msg}`;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}

// ==================== RENDER: LOGIN ====================

function renderLogin() {
  const root = document.getElementById('bf-ops-root');
  root.innerHTML = `
    <div class="shell-login-page">
      <div class="shell-login-card">
        <div class="shell-login-logo">
          <i class="fas fa-cubes"></i>
          <h1>BF Operations</h1>
          <p>British Feed & Supplies Management</p>
        </div>
        <form onsubmit="doLogin(event)">
          <div class="form-group">
            <label class="form-label">Email</label>
            <input class="form-input" type="email" id="shellLoginEmail" placeholder="your@email.com" required>
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input class="form-input" type="password" id="shellLoginPassword" placeholder="Enter password" required>
          </div>
          <button type="submit" class="shell-btn-login">
            <i class="fas fa-sign-in-alt"></i> Sign In
          </button>
        </form>
        <div class="shell-quick-logins">
          <p>Quick access</p>
          <div class="grid">
            <button class="shell-quick-btn" onclick="shellQuickLogin('laura@britishfeed.com','admin123')"><i class="fas fa-crown"></i> Admin</button>
            <button class="shell-quick-btn" onclick="shellQuickLogin('baylee@britishfeed.com','dispatch123')"><i class="fas fa-headset"></i> Dispatch</button>
            <button class="shell-quick-btn" onclick="shellQuickLogin('taj@britishfeed.com','warehouse123')"><i class="fas fa-warehouse"></i> Warehouse</button>
            <button class="shell-quick-btn" onclick="shellQuickLogin('james@britishfeed.com','driver123')"><i class="fas fa-truck"></i> Driver</button>
          </div>
        </div>
      </div>
    </div>`;
}

// Global permissions object:
//   'all' for admin (full access to everything)
//   { module: { feature: 'view'|'edit' } } for non-admin roles
// Also stores can_view_financials (boolean) — controls financial data visibility in Inventory
var _userPermissions = 'all';
var _canViewFinancials = true;

// Sub-page → parent feature mapping
// Detail/sub-pages inherit permissions from their parent feature
var _featureParentMap = {
  // CRM sub-pages
  'orgDetail': 'organizations',
  'contactDetail': 'contacts',
  'oppDetail': 'pipeline',
  // Purchasing sub-pages
  'create': 'orders',
  'detail': 'orders',
  'receive': 'arriving',
  'request_detail': 'requests'
};

function _resolveFeature(module, feature) {
  if (!_userPermissions || _userPermissions === 'all') return feature;
  var modulePerms = _userPermissions[module];
  if (modulePerms && typeof modulePerms === 'object' && !Array.isArray(modulePerms)) {
    // If feature exists directly in permissions, use it
    if (modulePerms[feature] !== undefined) return feature;
    // Otherwise try the parent map
    if (_featureParentMap[feature]) return _featureParentMap[feature];
  }
  return feature;
}

function canAccess(module, feature) {
  if (_userPermissions === 'all') return true;
  if (!_userPermissions || !_userPermissions[module]) return false;
  var resolved = _resolveFeature(module, feature);
  // New format: object { feature: 'view'|'edit' }
  var modulePerms = _userPermissions[module];
  if (typeof modulePerms === 'object' && !Array.isArray(modulePerms)) {
    return !!modulePerms[resolved]; // 'view' or 'edit' both count as access
  }
  // Legacy fallback: array format
  if (Array.isArray(modulePerms)) return modulePerms.indexOf(resolved) !== -1;
  return false;
}

function canEdit(module, feature) {
  if (_userPermissions === 'all') return true;
  if (!_userPermissions || !_userPermissions[module]) return false;
  var resolved = _resolveFeature(module, feature);
  var modulePerms = _userPermissions[module];
  if (typeof modulePerms === 'object' && !Array.isArray(modulePerms)) {
    return modulePerms[resolved] === 'edit';
  }
  // Legacy fallback: array format = edit access
  if (Array.isArray(modulePerms)) return modulePerms.indexOf(resolved) !== -1;
  return false;
}

function canViewFinancials() {
  if (_userPermissions === 'all') return true;
  return !!_canViewFinancials;
}

async function doLogin(e) {
  if (e) e.preventDefault();
  const email = document.getElementById('shellLoginEmail').value;
  const password = document.getElementById('shellLoginPassword').value;
  try {
    const { data } = await API.post('/auth/login', { email, password });
    currentUser = data.user;
    setToken(data.token);
    localStorage.setItem('bf_ops_user', JSON.stringify(data.user));
    // Store permissions (new format: { module: { feature: access_level } })
    _userPermissions = data.permissions || 'all';
    _canViewFinancials = data.can_view_financials !== undefined ? !!data.can_view_financials : true;
    localStorage.setItem('bf_ops_permissions', JSON.stringify(_userPermissions));
    localStorage.setItem('bf_ops_can_view_financials', JSON.stringify(_canViewFinancials));
    window._userPermissions = _userPermissions;
    window._canViewFinancials = _canViewFinancials;
    window.canAccess = canAccess;
    window.canEdit = canEdit;
    window.canViewFinancials = canViewFinancials;
    shellToast(`Welcome, ${currentUser.name}!`);
    // Auto-navigate to user's default landing if configured
    if (currentUser.default_module) {
      launchModule(currentUser.default_module, currentUser.default_page || null);
    } else {
      renderHome();
    }
  } catch (err) {
    shellToast('Invalid credentials', 'error');
  }
}

function shellQuickLogin(email, pw) {
  document.getElementById('shellLoginEmail').value = email;
  document.getElementById('shellLoginPassword').value = pw;
  doLogin(null);
}

function shellLogout() {
  currentUser = null;
  activeModule = null;
  setToken(null);
  localStorage.removeItem('bf_ops_user');
  localStorage.removeItem('bf_ops_token');
  localStorage.removeItem('bf_ops_permissions');
  localStorage.removeItem('bf_ops_can_view_financials');
  _userPermissions = 'all';
  _canViewFinancials = true;
  window._userPermissions = 'all';
  window._canViewFinancials = true;
  // Also clean up logistics module's auth keys
  localStorage.removeItem('bf_user');
  localStorage.removeItem('bf_token');
  // Clean up any module state
  cleanupActiveModule();
  renderLogin();
}

// ==================== RENDER: HOME (MODULE PICKER) ====================

function renderHome() {
  activeModule = null;
  cleanupActiveModule();
  const root = document.getElementById('bf-ops-root');
  const userModules = currentUser.modules || [];
  const isAdmin = currentUser.role === 'admin';

  root.innerHTML = `
    <div class="shell-home">
      <div class="shell-home-header">
        <div class="shell-home-brand">
          <i class="fas fa-cubes"></i>
          <div>
            <h1>BF Operations</h1>
            <p>British Feed & Supplies</p>
          </div>
        </div>
        <div class="shell-home-user">
          <div class="shell-home-user-info">
            <div class="name">${currentUser.name}</div>
            <div class="role">${currentUser.role}</div>
          </div>
          <div class="shell-user-avatar">${getInitials(currentUser.name)}</div>
          <button class="shell-my-view-btn" onclick="showMyViewSettings()" title="Customize your view"><i class="fas fa-sliders-h"></i></button>
          <button class="shell-logout-btn" onclick="shellLogout()"><i class="fas fa-sign-out-alt"></i> Sign Out</button>
        </div>
      </div>
      <div class="shell-home-grid">
        ${MODULES.filter(m => isAdmin || userModules.includes(m.id)).map(m => `
          <div class="shell-module-card ${m.soon ? 'coming-soon' : ''}" ${!m.soon ? `onclick="launchModule('${m.id}')"` : ''}>
            <div class="shell-module-icon" style="background:linear-gradient(135deg, ${m.color}, ${m.color}dd)">
              <i class="fas ${m.icon}"></i>
            </div>
            <h3>${m.name}</h3>
            <p>${m.desc}</p>
            ${m.soon ? '<span class="shell-module-badge soon">Coming Soon</span>' : '<span class="shell-module-badge live">Live</span>'}
          </div>
        `).join('')}
        ${isAdmin ? `
          <div class="shell-module-card" onclick="launchModule('admin')">
            <div class="shell-module-icon" style="background:linear-gradient(135deg, #475569, #334155)">
              <i class="fas fa-cog"></i>
            </div>
            <h3>Admin</h3>
            <p>User management, module access, locations, settings</p>
            <span class="shell-module-badge live">Live</span>
          </div>
        ` : ''}
      </div>
    </div>`;
}

// ==================== MODULE LAUNCHER ====================

function launchModule(moduleId, initialPage) {
  if (moduleId === activeModule && !initialPage) return;
  // Store initial page for module to pick up after loading
  window._shellInitialPage = initialPage || null;

  // Clean up previous module
  cleanupActiveModule();
  activeModule = moduleId;

  const root = document.getElementById('bf-ops-root');
  const userModules = currentUser.modules || [];
  const isAdmin = currentUser.role === 'admin';
  const allMods = MODULES.filter(m => isAdmin || userModules.includes(m.id));

  root.innerHTML = `
    <div class="shell-app-layout">
      <div class="shell-topbar">
        <button class="shell-back-btn" onclick="renderHome()">
          <i class="fas fa-th-large"></i> <span class="back-label">Modules</span>
        </button>
        <div class="shell-module-tabs">
          ${allMods.map(m => `
            <button class="shell-module-tab ${m.id === moduleId ? 'active' : ''} ${m.soon ? 'coming-soon' : ''}"
              ${!m.soon ? `onclick="launchModule('${m.id}')"` : ''}
              style="${m.id === moduleId ? `background:${m.color}` : ''}">
              <i class="fas ${m.icon}"></i> ${m.name}
            </button>
          `).join('')}
          ${isAdmin ? `
            <button class="shell-module-tab ${'admin' === moduleId ? 'active' : ''}"
              onclick="launchModule('admin')"
              style="${'admin' === moduleId ? 'background:#475569' : ''}">
              <i class="fas fa-cog"></i> Admin
            </button>
          ` : ''}
        </div>
        <select class="shell-mobile-module-select" onchange="if(this.value)launchModule(this.value)">
          ${allMods.map(m => `<option value="${m.id}" ${m.id === moduleId ? 'selected' : ''} ${m.soon ? 'disabled' : ''}>${m.name}</option>`).join('')}
          ${isAdmin ? `<option value="admin" ${'admin' === moduleId ? 'selected' : ''}>Admin</option>` : ''}
        </select>
        <div class="shell-topbar-right">
          <div class="shell-topbar-user" onclick="renderHome()">
            <div>
              <div class="name">${currentUser.name}</div>
              <div class="role">${currentUser.role}</div>
            </div>
            <div class="shell-topbar-avatar">${getInitials(currentUser.name)}</div>
          </div>
        </div>
      </div>
      <div class="shell-module-container">
        <div class="shell-module-frame" id="moduleFrame">
          <div style="display:flex;align-items:center;justify-content:center;height:100%">
            <i class="fas fa-spinner fa-spin fa-2x" style="color:#94A3B8"></i>
          </div>
        </div>
      </div>
    </div>`;

  // Load the module
  if (moduleId === 'admin') {
    renderAdminPanel();
  } else if (moduleId === 'logistics') {
    loadLogisticsModule();
  } else if (moduleId === 'inventory') {
    loadInventoryModule();
  } else if (moduleId === 'ordering') {
    loadPurchasingModule();
  } else if (moduleId === 'crm') {
    loadCRMModule();
  } else {
    document.getElementById('moduleFrame').innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px">
        <i class="fas fa-hard-hat" style="font-size:48px;color:#F59E0B"></i>
        <h2 style="font-size:20px;font-weight:700;color:#1E293B">Coming Soon</h2>
        <p style="color:#64748B">The ${moduleId} module is under development.</p>
      </div>`;
  }
}

function cleanupActiveModule() {
  // Clean up logistics module global state if it was active
  if (typeof window._logisticsCleanup === 'function') {
    try { window._logisticsCleanup(); } catch(e) {}
  }
  if (typeof window._crmCleanup === 'function') {
    try { window._crmCleanup(); } catch(e) {}
  }
  // Remove module-specific stylesheets
  document.querySelectorAll('link[data-module]').forEach(el => el.remove());
  // Restore shell globals that logistics.js may have overwritten
  // (API, setToken, doLogin, currentUser)
  _restoreShellGlobals();
  window._logisticsActive = false;
}

// ==================== LOGISTICS MODULE LOADER ====================

// ---- Shell globals that logistics.js will overwrite ----
// We save them before loading logistics and restore when leaving the module.
var _shellSaved = {};

function _saveShellGlobals() {
  _shellSaved.API = window.API;
  _shellSaved.setToken = window.setToken;
  _shellSaved.doLogin = window.doLogin;
  // currentUser is read from localStorage on re-entry, so we just save the ref
  _shellSaved.currentUser = currentUser;
}

function _restoreShellGlobals() {
  if (_shellSaved.API) window.API = _shellSaved.API;
  if (_shellSaved.setToken) window.setToken = _shellSaved.setToken;
  if (_shellSaved.doLogin) window.doLogin = _shellSaved.doLogin;
  // Restore currentUser from localStorage (logistics may have cleared/changed it)
  try {
    var su = localStorage.getItem('bf_ops_user');
    if (su) currentUser = JSON.parse(su);
  } catch(e) {}
}

function loadLogisticsModule() {
  var frame = document.getElementById('moduleFrame');
  window._logisticsActive = true;

  // The logistics module needs its own #app div and its CSS
  // Load logistics CSS
  if (!document.querySelector('link[data-module="logistics-css"]')) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/static/modules/logistics.css?v=' + Date.now();
    link.dataset.module = 'logistics-css';
    document.head.appendChild(link);
  }

  // Create the app container logistics expects
  frame.innerHTML = '<div id="app"></div>';

  // Helper: load Google Maps API (returns a promise that resolves when ready)
  function ensureGoogleMaps() {
    // Already loaded from a previous visit to this module
    if (window.__gmapsLoaded) return Promise.resolve();

    // Already loading (script tag injected but callback hasn't fired yet)
    if (document.querySelector('script[data-gmaps]')) {
      return new Promise(function(resolve) {
        var prev = window.__gmapsReady;
        window.__gmapsReady = function() { window.__gmapsLoaded = true; if (prev) prev(); resolve(); };
        // If it loaded between our check and now, resolve immediately
        if (window.__gmapsLoaded) resolve();
      });
    }

    // First time — fetch config, inject script, wait for callback
    return new Promise(function(resolve) {
      window.__gmapsLoaded = false;
      window.__gmapsReady = function() { window.__gmapsLoaded = true; resolve(); };

      fetch('/api/maps/config')
        .then(function(r) { return r.json(); })
        .then(function(cfg) {
          if (cfg.apiKey) {
            window.__GMAPS_KEY = cfg.apiKey;
            window.__DEPOT = cfg.depot;
            var s = document.createElement('script');
            s.src = 'https://maps.googleapis.com/maps/api/js?key=' + cfg.apiKey + '&libraries=geometry,places&callback=__gmapsReady';
            s.async = true; s.defer = true;
            s.dataset.gmaps = '1';
            s.onerror = function() { console.warn('Google Maps script failed to load'); resolve(); };
            document.head.appendChild(s);
          } else {
            console.warn('Google Maps API key not configured');
            resolve(); // Continue without maps rather than hanging
          }
        })
        .catch(function(e) { console.warn('Google Maps config fetch failed:', e); resolve(); });
    });
  }

  // Helper: load the logistics JS module (returns a promise)
  function ensureLogisticsScript() {
    if (loadedModuleScripts.logistics) return Promise.resolve();
    // Save shell globals BEFORE logistics.js loads (it will overwrite them)
    _saveShellGlobals();
    return new Promise(function(resolve) {
      var script = document.createElement('script');
      script.src = '/static/modules/logistics.js?v=' + Date.now();
      script.dataset.module = 'logistics';
      script.onload = function() { loadedModuleScripts.logistics = true; resolve(); };
      script.onerror = function() { console.error('Failed to load logistics.js'); resolve(); };
      document.body.appendChild(script);
    });
  }

  // Load Google Maps and logistics.js in parallel, init only after BOTH are ready
  Promise.all([ensureGoogleMaps(), ensureLogisticsScript()]).then(function() {
    initLogisticsInShell();
  });
}

function initLogisticsInShell() {
  // Bridge the parent shell's auth to what logistics expects.
  // We read from localStorage (bf_ops_user) because logistics.js overwrites
  // the global currentUser variable when it loads.
  var shellUser = localStorage.getItem('bf_ops_user');
  var parentToken = localStorage.getItem('bf_ops_token');
  if (shellUser && parentToken) {
    localStorage.setItem('bf_user', shellUser);
    localStorage.setItem('bf_token', parentToken);
  }

  // Trigger logistics init — the module reads bf_user from localStorage
  if (typeof window._logisticsInit === 'function') {
    window._logisticsInit();
  }
}

// ==================== INVENTORY MODULE LOADER ====================

function loadInventoryModule() {
  const frame = document.getElementById('moduleFrame');

  // Load inventory CSS if needed
  if (!document.querySelector('link[data-module="inventory-css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/static/modules/inventory.css?v=' + Date.now();
    link.dataset.module = 'inventory-css';
    document.head.appendChild(link);
  }

  frame.innerHTML = '<div id="inventory-app"></div>';

  if (!loadedModuleScripts.inventory) {
    const script = document.createElement('script');
    script.src = '/static/modules/inventory.js?v=' + Date.now();
    script.dataset.module = 'inventory';
    script.onload = () => {
      loadedModuleScripts.inventory = true;
      if (typeof window._inventoryInit === 'function') window._inventoryInit();
    };
    document.body.appendChild(script);
  } else {
    if (typeof window._inventoryInit === 'function') window._inventoryInit();
  }
}

// ==================== PURCHASING MODULE LOADER ====================

function loadPurchasingModule() {
  const frame = document.getElementById('moduleFrame');

  // Load purchasing CSS if needed
  if (!document.querySelector('link[data-module="purchasing-css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/static/modules/purchasing.css?v=' + Date.now();
    link.dataset.module = 'purchasing-css';
    document.head.appendChild(link);
  }

  frame.innerHTML = '<div id="purchasing-app"></div>';

  if (!loadedModuleScripts.purchasing) {
    const script = document.createElement('script');
    script.src = '/static/modules/purchasing.js?v=' + Date.now();
    script.dataset.module = 'purchasing';
    script.onload = () => {
      loadedModuleScripts.purchasing = true;
      if (typeof window._purchasingInit === 'function') window._purchasingInit();
    };
    document.body.appendChild(script);
  } else {
    if (typeof window._purchasingInit === 'function') window._purchasingInit();
  }
}

// ==================== CRM MODULE LOADER ====================

function loadCRMModule() {
  const frame = document.getElementById('moduleFrame');

  // Load CRM CSS if needed
  if (!document.querySelector('link[data-module="crm-css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/static/modules/crm.css?v=' + Date.now();
    link.dataset.module = 'crm-css';
    document.head.appendChild(link);
  }

  frame.innerHTML = '<div id="crm-app"></div>';

  if (!loadedModuleScripts.crm) {
    const script = document.createElement('script');
    script.src = '/static/modules/crm.js?v=' + Date.now();
    script.dataset.module = 'crm';
    script.onload = () => {
      loadedModuleScripts.crm = true;
      if (typeof window._crmInit === 'function') window._crmInit();
    };
    document.body.appendChild(script);
  } else {
    if (typeof window._crmInit === 'function') window._crmInit();
  }
}

// ==================== ADMIN PANEL ==

var _adminShowArchived = false;

async function renderAdminPanel() {
  const frame = document.getElementById('moduleFrame');
  frame.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%"><i class="fas fa-spinner fa-spin fa-2x" style="color:#94A3B8"></i></div>';

  try {
    const [usersRes, locationsRes, rolesRes] = await Promise.all([
      API.get('/admin/users' + (_adminShowArchived ? '?include_archived=1' : '')),
      API.get('/locations'),
      API.get('/admin/roles')
    ]);
    const users = usersRes.data.users || [];
    const locations = locationsRes.data.locations || [];
    const allRoles = rolesRes.data.roles || [];
    const moduleFeatures = rolesRes.data.features || {};
    // Store roles globally so modals can use them
    window._adminRoles = allRoles;
    window._adminModuleFeatures = moduleFeatures;
    // Store users globally so view config modal can look up user data
    window._adminUsers = users;
    const allModuleIds = ['logistics', 'inventory', 'ordering', 'crm', 'pos', 'tasks'];
    var roleColors = { admin: '#7C3AED', dispatcher: '#3B82F6', warehouse: '#059669', driver: '#D97706', customer: '#94A3B8' };
    var langNames = { en: 'English', es: 'Español', ht: 'Kreyòl' };

    frame.innerHTML = `
      <div class="shell-admin-panel">
        <h2 style="font-size:22px;font-weight:800;color:#1E293B;margin-bottom:20px"><i class="fas fa-cog" style="margin-right:8px;color:#64748B"></i>Administration</h2>

        <!-- User Management -->
        <div class="shell-admin-card" style="margin-bottom:20px">
          <div class="shell-admin-card-header" style="display:flex;justify-content:space-between;align-items:center">
            <h3><i class="fas fa-users" style="color:#7C3AED;margin-right:8px"></i>User Management</h3>
            <div style="display:flex;gap:8px;align-items:center">
              <label style="font-size:12px;color:#64748B;display:flex;align-items:center;gap:4px;cursor:pointer">
                <input type="checkbox" ${_adminShowArchived ? 'checked' : ''} onchange="_adminShowArchived=this.checked;renderAdminPanel()"> Show inactive
              </label>
              <button class="shell-save-btn" style="background:#10B981" onclick="showAdminNewUserModal()"><i class="fas fa-plus"></i> New User</button>
            </div>
          </div>
          <table class="shell-admin-table">
            <thead><tr><th>User</th><th>Role</th><th class="hide-mobile">Phone</th><th class="hide-mobile">Language</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${users.map(u => `
                <tr ${!u.active ? 'style="opacity:0.5"' : ''}>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px">
                      <div style="width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,${roleColors[u.role]||'#64748B'},${roleColors[u.role]||'#64748B'}dd);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:700">${getInitials(u.name)}</div>
                      <div>
                        <div style="font-weight:600">${u.name}</div>
                        <div style="font-size:11px;color:#94A3B8">${u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><span style="font-size:11px;padding:2px 8px;border-radius:12px;background:${roleColors[u.role]||'#F1F5F9'}22;color:${roleColors[u.role]||'#475569'};font-weight:600;border:1px solid ${roleColors[u.role]||'#E2E8F0'}">${u.role}</span></td>
                  <td class="hide-mobile" style="font-size:12px">${u.phone || '—'}</td>
                  <td class="hide-mobile" style="font-size:12px">${langNames[u.preferred_language] || u.preferred_language || 'English'}</td>
                  <td>${u.active ? '<span style="font-size:11px;padding:2px 8px;border-radius:12px;background:#ECFDF5;color:#059669;font-weight:600">Active</span>' : '<span style="font-size:11px;padding:2px 8px;border-radius:12px;background:#FEF2F2;color:#DC2626;font-weight:600">Inactive</span>'}</td>
                  <td style="display:flex;gap:4px;flex-wrap:wrap">
                    <button class="shell-save-btn" onclick="showAdminEditUserModal(${u.id})" title="Edit"><i class="fas fa-edit"></i></button>
                    <button class="shell-save-btn" style="background:#6366F1" onclick="showAdminViewConfigModal(${u.id})" title="Configure View"><i class="fas fa-sliders-h"></i></button>
                    ${u.active ? '<button class="shell-save-btn" style="background:#7C3AED" onclick="adminGenerateInvite(' + u.id + ',this)" title="Send Invite Link"><i class="fas fa-envelope"></i></button>' : ''}
                    ${u.active ? '<button class="shell-save-btn" style="background:#DC2626" onclick="adminToggleUser(' + u.id + ',0)" title="Deactivate"><i class="fas fa-ban"></i></button>' : '<button class="shell-save-btn" style="background:#059669" onclick="adminToggleUser(' + u.id + ',1)" title="Reactivate"><i class="fas fa-check"></i></button>'}
                  </td>
                </tr>
              `).join('')}
              ${users.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:#94A3B8;padding:24px">No users found</td></tr>' : ''}
            </tbody>
          </table>
        </div>

        <!-- User Module Access -->
        <div class="shell-admin-card" style="margin-bottom:20px">
          <div class="shell-admin-card-header">
            <h3><i class="fas fa-users-cog" style="color:#6366F1;margin-right:8px"></i>Module Access</h3>
          </div>
          <table class="shell-admin-table">
            <thead>
              <tr>
                <th>User</th><th>Role</th>
                ${allModuleIds.map(m => '<th style="text-align:center">' + m.charAt(0).toUpperCase() + m.slice(1) + '</th>').join('')}
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${users.filter(u => u.active).map(u => `
                <tr data-user-id="${u.id}">
                  <td>
                    <div style="display:flex;align-items:center;gap:8px">
                      <div style="width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,${roleColors[u.role]||'#64748B'},${roleColors[u.role]||'#64748B'}dd);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:700">${getInitials(u.name)}</div>
                      <div>
                        <div style="font-weight:600">${u.name}</div>
                        <div style="font-size:11px;color:#94A3B8">${u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><span style="font-size:11px;padding:2px 8px;border-radius:12px;background:#F1F5F9;color:#475569;font-weight:600">${u.role}</span></td>
                  ${allModuleIds.map(m => `
                    <td style="text-align:center">
                      ${u.role === 'admin'
                        ? '<i class="fas fa-check-circle" style="color:#10B981;font-size:16px" title="Admin has all access"></i>'
                        : '<input type="checkbox" class="shell-module-toggle" data-user="' + u.id + '" data-module="' + m + '" ' + (u.modules && u.modules.includes(m) ? 'checked' : '') + '>'}
                    </td>
                  `).join('')}
                  <td>
                    ${u.role !== 'admin' ? '<button class="shell-save-btn" onclick="saveUserModules(' + u.id + ')"><i class="fas fa-save"></i> Save</button>' : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- Roles & Permissions -->
        <div class="shell-admin-card" style="margin-bottom:20px">
          <div class="shell-admin-card-header" style="display:flex;justify-content:space-between;align-items:center">
            <h3><i class="fas fa-shield-halved" style="color:#D97706;margin-right:8px"></i>Roles & Feature Permissions</h3>
            <button class="shell-save-btn" style="background:#D97706" onclick="showNewRoleModal()"><i class="fas fa-plus"></i> New Role</button>
          </div>
          <div style="overflow-x:auto">
            <table class="shell-admin-table" style="font-size:12px">
              <thead>
                <tr>
                  <th style="min-width:120px">Role</th>
                  <th style="min-width:100px">Options</th>
                  ${Object.keys(moduleFeatures).map(function(mod) { return '<th colspan="' + moduleFeatures[mod].length + '" style="text-align:center;background:#F8FAFC;border-left:2px solid #E2E8F0">' + mod.charAt(0).toUpperCase() + mod.slice(1) + '</th>'; }).join('')}
                  <th></th>
                </tr>
                <tr>
                  <th></th><th></th>
                  ${Object.keys(moduleFeatures).map(function(mod) { return moduleFeatures[mod].map(function(f,i) { return '<th style="text-align:center;font-size:10px;font-weight:500;color:#64748B;writing-mode:vertical-lr;padding:4px 2px;min-width:32px' + (i===0?';border-left:2px solid #E2E8F0':'') + '">' + f.label + '</th>'; }).join(''); }).join('')}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${allRoles.map(function(role) {
                  var perms = role.permissions || [];
                  var permMap = {};
                  perms.forEach(function(p) { permMap[p.module + ':' + p.feature] = p.access_level || 'edit'; });
                  var hasFinancials = role.can_view_financials !== undefined ? !!role.can_view_financials : true;
                  return '<tr data-role="' + role.name + '">' +
                    '<td><strong>' + role.name + '</strong>' + (role.is_system ? ' <span style="font-size:9px;background:#F1F5F9;color:#64748B;padding:1px 4px;border-radius:4px">system</span>' : '') + '<br><span style="font-size:10px;color:#94A3B8">' + (role.description || '') + '</span></td>' +
                    '<td>' + (role.name !== 'admin' ? '<label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;white-space:nowrap"><input type="checkbox" class="role-financials-cb" data-role="' + role.name + '"' + (hasFinancials ? ' checked' : '') + '> <i class="fas fa-dollar-sign" style="color:#7C3AED;font-size:10px"></i> Financials</label>' : '<span style="font-size:11px;color:#10B981"><i class="fas fa-check"></i> All</span>') + '</td>' +
                    Object.keys(moduleFeatures).map(function(mod) {
                      return moduleFeatures[mod].map(function(f,i) {
                        var key = mod + ':' + f.id;
                        var level = permMap[key] || 'none';
                        if (role.name === 'admin') return '<td style="text-align:center' + (i===0?';border-left:2px solid #E2E8F0':'') + '"><i class="fas fa-pen" style="color:#10B981;font-size:10px" title="Full edit"></i></td>';
                        return '<td style="text-align:center;padding:2px' + (i===0?';border-left:2px solid #E2E8F0':'') + '"><select class="role-perm-sel" data-role="' + role.name + '" data-module="' + mod + '" data-feature="' + f.id + '" style="font-size:10px;padding:1px 2px;border:1px solid #E2E8F0;border-radius:3px;width:44px;background:' + (level==='edit'?'#ECFDF5':level==='view'?'#EFF6FF':'#F9FAFB') + ';color:' + (level==='edit'?'#059669':level==='view'?'#2563EB':'#94A3B8') + '" onchange="this.style.background=this.value===\'edit\'?\'#ECFDF5\':this.value===\'view\'?\'#EFF6FF\':\'#F9FAFB\';this.style.color=this.value===\'edit\'?\'#059669\':this.value===\'view\'?\'#2563EB\':\'#94A3B8\'">' +
                          '<option value="none"' + (level==='none'?' selected':'') + '>\u2014</option>' +
                          '<option value="view"' + (level==='view'?' selected':'') + '>\ud83d\udc41</option>' +
                          '<option value="edit"' + (level==='edit'?' selected':'') + '>\u270f\ufe0f</option>' +
                        '</select></td>';
                      }).join('');
                    }).join('') +
                    '<td style="display:flex;gap:4px">' +
                      (role.name !== 'admin' ? '<button class="shell-save-btn" onclick="saveRolePermissions(\'' + role.name + '\')"><i class="fas fa-save"></i></button>' : '') +
                      (!role.is_system ? '<button class="shell-save-btn" style="background:#DC2626" onclick="deleteRole(\'' + role.name + '\')"><i class="fas fa-trash"></i></button>' : '') +
                    '</td></tr>';
                }).join('')}
              </tbody>
            </table>
          </div>
          <div style="padding:8px 12px;font-size:11px;color:#94A3B8;border-top:1px solid #F1F5F9"><i class="fas fa-info-circle"></i> Set each feature to: <strong>\u2014</strong> (no access), <strong>\ud83d\udc41</strong> (view only), or <strong>\u270f\ufe0f</strong> (full edit). <strong><i class="fas fa-dollar-sign" style="font-size:10px"></i> Financials</strong> controls cost/price/margin visibility in Inventory. Admin always has full access.</div>
        </div>

        <!-- Locations -->
        <div class="shell-admin-card">
          <div class="shell-admin-card-header">
            <h3><i class="fas fa-map-marker-alt" style="color:#3B82F6;margin-right:8px"></i>Locations</h3>
          </div>
          <table class="shell-admin-table">
            <thead><tr><th>Name</th><th>Code</th><th>Type</th><th>Address</th><th>Phone</th></tr></thead>
            <tbody>
              ${locations.map(l => `
                <tr>
                  <td><strong>${l.name}</strong></td>
                  <td><code style="background:#F1F5F9;padding:2px 8px;border-radius:4px;font-size:12px">${l.code}</code></td>
                  <td><span style="font-size:12px;padding:2px 8px;border-radius:12px;background:${l.type==='retail'?'#DBEAFE':'#F0FDF4'};color:${l.type==='retail'?'#1D4ED8':'#166534'};font-weight:600">${l.type}</span></td>
                  <td style="font-size:12px;color:#64748B">${l.street ? l.street + ', ' + l.city + ' ' + l.state + ' ' + (l.zip||'') : '—'}</td>
                  <td style="font-size:12px">${l.phone || '—'}</td>
                </tr>
              `).join('')}
              ${locations.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:#94A3B8;padding:24px">No locations configured</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>`;
  } catch(err) {
    frame.innerHTML = '<div style="padding:40px;text-align:center"><p style="color:#DC2626">Error loading admin panel: ' + err.message + '</p><button class="shell-save-btn" onclick="renderAdminPanel()"><i class="fas fa-redo"></i> Retry</button></div>';
  }
}

function showAdminNewUserModal() {
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div style="background:white;border-radius:12px;width:500px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="padding:16px 20px;border-bottom:1px solid #E2E8F0;display:flex;justify-content:space-between;align-items:center">
        <h3 style="font-size:16px;font-weight:700;color:#1E293B"><i class="fas fa-user-plus" style="color:#10B981;margin-right:8px"></i>New User</h3>
        <button onclick="this.closest('div[style*=fixed]').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94A3B8">&times;</button>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;gap:12px">
          <div style="flex:1"><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">Name *</label><input id="adminNewName" style="width:100%;padding:8px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px" placeholder="Full name"></div>
          <div style="flex:1"><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">Email *</label><input id="adminNewEmail" type="email" style="width:100%;padding:8px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px" placeholder="email@britishfeed.com"></div>
        </div>
        <div style="display:flex;gap:12px">
          <div style="flex:1"><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">Role</label>
            <select id="adminNewRole" style="width:100%;padding:8px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px">${(window._adminRoles||[]).map(function(r){return '<option value="'+r.name+'">'+r.name+'</option>';}).join('')}</select>
          </div>
          <div style="flex:1"><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">Phone</label><input id="adminNewPhone" style="width:100%;padding:8px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px" placeholder="561-555-1234"></div>
        </div>
        <div style="display:flex;gap:12px">
          <div style="flex:1"><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">Language</label>
            <select id="adminNewLang" style="width:100%;padding:8px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px"><option value="en">English</option><option value="es">Español</option><option value="ht">Kreyòl</option></select>
          </div>
          <div style="flex:1" id="adminNewPwContainer"><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">Password</label><input id="adminNewPassword" type="password" style="width:100%;padding:8px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px" value="changeme123" placeholder="Initial password"></div>
        </div>
        <div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:10px">
          <input type="checkbox" id="adminNewSendInvite" style="width:16px;height:16px;cursor:pointer" onchange="document.getElementById('adminNewPwContainer').style.opacity=this.checked?'.4':'1';document.getElementById('adminNewPassword').disabled=this.checked;">
          <div>
            <label for="adminNewSendInvite" style="font-size:13px;font-weight:600;color:#5B21B6;cursor:pointer"><i class="fas fa-envelope" style="margin-right:4px"></i> Send invite link instead</label>
            <div style="font-size:11px;color:#7C3AED;margin-top:2px">User will set their own password via a secure link</div>
          </div>
        </div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid #E2E8F0;display:flex;justify-content:flex-end;gap:8px">
        <button onclick="this.closest('div[style*=fixed]').remove()" style="padding:8px 16px;border:1px solid #E2E8F0;border-radius:6px;background:white;cursor:pointer;font-size:13px">Cancel</button>
        <button onclick="submitAdminNewUser()" style="padding:8px 16px;border:none;border-radius:6px;background:#10B981;color:white;cursor:pointer;font-size:13px;font-weight:600"><i class="fas fa-check"></i> Create User</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function submitAdminNewUser() {
  var name = document.getElementById('adminNewName').value.trim();
  var email = document.getElementById('adminNewEmail').value.trim();
  if (!name || !email) { shellToast('Name and email are required', 'error'); return; }
  var sendInvite = document.getElementById('adminNewSendInvite').checked;
  try {
    var resp = await API.post('/admin/users', {
      name: name,
      email: email,
      role: document.getElementById('adminNewRole').value,
      phone: document.getElementById('adminNewPhone').value.trim() || null,
      preferred_language: document.getElementById('adminNewLang').value,
      password: sendInvite ? ('temp_' + Math.random().toString(36).slice(2)) : (document.getElementById('adminNewPassword').value || 'changeme123')
    });
    var newUserId = resp.data.id;
    document.querySelector('div[style*="fixed"][style*="inset"]').remove();
    shellToast('User created!');

    if (sendInvite && newUserId) {
      // Auto-generate invite for the new user
      try {
        var invResp = await API.post('/admin/users/' + newUserId + '/invite');
        var d = invResp.data;
        // Show invite link modal
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999';
        overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
        overlay.innerHTML =
          '<div style="background:white;border-radius:12px;width:520px;max-width:92vw;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
            '<div style="padding:16px 20px;border-bottom:1px solid #E2E8F0;display:flex;justify-content:space-between;align-items:center">' +
              '<h3 style="font-size:16px;font-weight:700;color:#1E293B"><i class="fas fa-envelope" style="color:#7C3AED;margin-right:8px"></i>Invite Link for ' + name + '</h3>' +
              '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94A3B8">&times;</button>' +
            '</div>' +
            '<div style="padding:20px">' +
              '<div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:13px;color:#059669"><i class="fas fa-check-circle" style="margin-right:6px"></i>User created! Share this invite link so they can set their password.</div>' +
              '<label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:6px">Invite Link (expires in 7 days)</label>' +
              '<div style="display:flex;gap:8px">' +
                '<input id="inviteLinkInput" readonly value="' + d.invite_url + '" style="flex:1;padding:10px 12px;border:2px solid #E2E8F0;border-radius:8px;font-size:12px;font-family:monospace;background:#F8FAFC;color:#334155" onclick="this.select()">' +
                '<button id="inviteCopyBtn" onclick="copyInviteLink()" style="padding:10px 16px;border:none;border-radius:8px;background:#7C3AED;color:white;cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap"><i class="fas fa-copy"></i> Copy</button>' +
              '</div>' +
              '<p style="font-size:11px;color:#94A3B8;margin-top:10px"><i class="fas fa-info-circle"></i> The user will set their own password when they open this link.</p>' +
            '</div>' +
            '<div style="padding:12px 20px;border-top:1px solid #E2E8F0;display:flex;justify-content:flex-end">' +
              '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="padding:8px 20px;border:none;border-radius:6px;background:#10B981;color:white;cursor:pointer;font-size:13px;font-weight:600">Done</button>' +
            '</div>' +
          '</div>';
        document.body.appendChild(overlay);
      } catch(invErr) {
        shellToast('User created, but invite generation failed: ' + (invErr.response ? invErr.response.data.error : invErr.message), 'error');
      }
    }
    renderAdminPanel();
  } catch(err) {
    shellToast('Failed to create user: ' + (err.response ? err.response.data.error : err.message), 'error');
  }
}

async function showAdminEditUserModal(userId) {
  try {
    var resp = await API.get('/admin/users?include_archived=1');
    var user = (resp.data.users || []).find(function(u) { return u.id === userId; });
    if (!user) { shellToast('User not found', 'error'); return; }
  } catch(err) { shellToast('Failed to load user', 'error'); return; }

  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  var roles = (window._adminRoles||[]).map(function(r){return r.name;});
  if (roles.length === 0) roles = ['admin','dispatcher','warehouse','driver','customer'];
  var langs = [['en','English'],['es','Español'],['ht','Kreyòl']];
  overlay.innerHTML = `
    <div style="background:white;border-radius:12px;width:500px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="padding:16px 20px;border-bottom:1px solid #E2E8F0;display:flex;justify-content:space-between;align-items:center">
        <h3 style="font-size:16px;font-weight:700;color:#1E293B"><i class="fas fa-user-edit" style="color:#3B82F6;margin-right:8px"></i>Edit User</h3>
        <button onclick="this.closest('div[style*=fixed]').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94A3B8">&times;</button>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;gap:12px">
          <div style="flex:1"><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">Name *</label><input id="adminEditName" style="width:100%;padding:8px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px" value="${user.name}"></div>
          <div style="flex:1"><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">Email</label><input id="adminEditEmail" type="email" style="width:100%;padding:8px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px" value="${user.email || ''}"></div>
        </div>
        <div style="display:flex;gap:12px">
          <div style="flex:1"><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">Role</label>
            <select id="adminEditRole" style="width:100%;padding:8px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px">${roles.map(function(r) { return '<option value="' + r + '"' + (user.role === r ? ' selected' : '') + '>' + r + '</option>'; }).join('')}</select>
          </div>
          <div style="flex:1"><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">Phone</label><input id="adminEditPhone" style="width:100%;padding:8px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px" value="${user.phone || ''}"></div>
        </div>
        <div style="display:flex;gap:12px">
          <div style="flex:1"><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">Language</label>
            <select id="adminEditLang" style="width:100%;padding:8px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px">${langs.map(function(l) { return '<option value="' + l[0] + '"' + (user.preferred_language === l[0] ? ' selected' : '') + '>' + l[1] + '</option>'; }).join('')}</select>
          </div>
          <div style="flex:1"><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">Active</label>
            <select id="adminEditActive" style="width:100%;padding:8px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px"><option value="1" ${user.active ? 'selected' : ''}>Yes</option><option value="0" ${!user.active ? 'selected' : ''}>No</option></select>
          </div>
        </div>
        <div><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">New Password (leave blank to keep current)</label><input id="adminEditPassword" type="password" style="width:100%;padding:8px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px" placeholder="Leave blank to keep current"></div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid #E2E8F0;display:flex;justify-content:flex-end;gap:8px">
        <button onclick="this.closest('div[style*=fixed]').remove()" style="padding:8px 16px;border:1px solid #E2E8F0;border-radius:6px;background:white;cursor:pointer;font-size:13px">Cancel</button>
        <button onclick="submitAdminEditUser(${userId})" style="padding:8px 16px;border:none;border-radius:6px;background:#3B82F6;color:white;cursor:pointer;font-size:13px;font-weight:600"><i class="fas fa-save"></i> Save Changes</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function submitAdminEditUser(userId) {
  var name = document.getElementById('adminEditName').value.trim();
  if (!name) { shellToast('Name is required', 'error'); return; }
  var payload = {
    name: name,
    email: document.getElementById('adminEditEmail').value.trim() || null,
    role: document.getElementById('adminEditRole').value,
    phone: document.getElementById('adminEditPhone').value.trim() || null,
    preferred_language: document.getElementById('adminEditLang').value,
    active: parseInt(document.getElementById('adminEditActive').value)
  };
  var pw = document.getElementById('adminEditPassword').value;
  if (pw) payload.password = pw;
  try {
    await API.put('/admin/users/' + userId, payload);
    document.querySelector('div[style*="fixed"][style*="inset"]').remove();
    shellToast('User updated!');
    renderAdminPanel();
  } catch(err) {
    shellToast('Failed to update user: ' + (err.response ? err.response.data.error : err.message), 'error');
  }
}

async function adminToggleUser(userId, active) {
  if (!confirm(active ? 'Reactivate this user?' : 'Deactivate this user?')) return;
  try {
    await API.put('/admin/users/' + userId, { active: active });
    shellToast(active ? 'User reactivated' : 'User deactivated');
    renderAdminPanel();
  } catch(err) {
    shellToast('Failed: ' + err.message, 'error');
  }
}

async function adminGenerateInvite(userId, btn) {
  var origHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  try {
    var resp = await API.post('/admin/users/' + userId + '/invite');
    var d = resp.data;
    // Show modal with invite link
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML =
      '<div style="background:white;border-radius:12px;width:520px;max-width:92vw;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
        '<div style="padding:16px 20px;border-bottom:1px solid #E2E8F0;display:flex;justify-content:space-between;align-items:center">' +
          '<h3 style="font-size:16px;font-weight:700;color:#1E293B"><i class="fas fa-envelope" style="color:#7C3AED;margin-right:8px"></i>Invite Link Generated</h3>' +
          '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94A3B8">&times;</button>' +
        '</div>' +
        '<div style="padding:20px">' +
          '<div style="background:#F8FAFC;border-radius:10px;padding:14px;margin-bottom:16px">' +
            '<div style="font-weight:600;color:#1E293B"><i class="fas fa-user" style="color:#7C3AED;margin-right:6px"></i>' + d.user_name + '</div>' +
            '<div style="font-size:12px;color:#64748B;margin-top:2px;padding-left:22px">' + d.user_email + '</div>' +
          '</div>' +
          '<label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:6px">Invite Link (expires in 7 days)</label>' +
          '<div style="display:flex;gap:8px">' +
            '<input id="inviteLinkInput" readonly value="' + d.invite_url + '" style="flex:1;padding:10px 12px;border:2px solid #E2E8F0;border-radius:8px;font-size:12px;font-family:monospace;background:#F8FAFC;color:#334155" onclick="this.select()">' +
            '<button id="inviteCopyBtn" onclick="copyInviteLink()" style="padding:10px 16px;border:none;border-radius:8px;background:#7C3AED;color:white;cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap"><i class="fas fa-copy"></i> Copy</button>' +
          '</div>' +
          '<p style="font-size:11px;color:#94A3B8;margin-top:10px"><i class="fas fa-info-circle"></i> Share this link with the user. They\'ll set their own password when they open it.</p>' +
        '</div>' +
        '<div style="padding:12px 20px;border-top:1px solid #E2E8F0;display:flex;justify-content:flex-end">' +
          '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="padding:8px 20px;border:none;border-radius:6px;background:#10B981;color:white;cursor:pointer;font-size:13px;font-weight:600">Done</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    shellToast('Invite link generated for ' + d.user_name);
  } catch(err) {
    shellToast('Failed to generate invite: ' + (err.response ? err.response.data.error : err.message), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHtml;
  }
}

function copyInviteLink() {
  var input = document.getElementById('inviteLinkInput');
  var btn = document.getElementById('inviteCopyBtn');
  input.select();
  navigator.clipboard.writeText(input.value).then(function() {
    btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
    btn.style.background = '#059669';
    setTimeout(function() { btn.innerHTML = '<i class="fas fa-copy"></i> Copy'; btn.style.background = '#7C3AED'; }, 2000);
  }).catch(function() {
    // Fallback
    document.execCommand('copy');
    btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
    btn.style.background = '#059669';
    setTimeout(function() { btn.innerHTML = '<i class="fas fa-copy"></i> Copy'; btn.style.background = '#7C3AED'; }, 2000);
  });
}

async function saveUserModules(userId) {
  var row = document.querySelector('tr[data-user-id="' + userId + '"]');
  if (!row) return;
  var checkboxes = row.querySelectorAll('.shell-module-toggle');
  var modules = [];
  checkboxes.forEach(function(cb) { if (cb.checked) modules.push(cb.dataset.module); });
  try {
    await API.put('/admin/users/' + userId + '/modules', { modules: modules });
    shellToast('Module access updated');
  } catch(err) {
    shellToast('Failed to update: ' + err.message, 'error');
  }
}

// ==================== ROLES MANAGEMENT ====================

function showNewRoleModal() {
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = '<div style="background:white;border-radius:12px;width:400px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
    '<div style="padding:16px 20px;border-bottom:1px solid #E2E8F0"><h3 style="font-size:16px;font-weight:700;color:#1E293B"><i class="fas fa-shield-halved" style="color:#D97706;margin-right:8px"></i>New Role</h3></div>' +
    '<div style="padding:20px;display:flex;flex-direction:column;gap:12px">' +
      '<div><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">Role Name *</label><input id="newRoleName" style="width:100%;padding:8px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px" placeholder="e.g. sales rep, route planner"></div>' +
      '<div><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">Description</label><input id="newRoleDesc" style="width:100%;padding:8px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px" placeholder="What this role does"></div>' +
    '</div>' +
    '<div style="padding:12px 20px;border-top:1px solid #E2E8F0;display:flex;justify-content:flex-end;gap:8px">' +
      '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="padding:8px 16px;border:1px solid #E2E8F0;border-radius:6px;background:white;cursor:pointer;font-size:13px">Cancel</button>' +
      '<button onclick="submitNewRole()" style="padding:8px 16px;border:none;border-radius:6px;background:#D97706;color:white;cursor:pointer;font-size:13px;font-weight:600"><i class="fas fa-check"></i> Create Role</button>' +
    '</div></div>';
  document.body.appendChild(overlay);
}

async function submitNewRole() {
  var name = document.getElementById('newRoleName').value.trim();
  if (!name) { shellToast('Role name is required', 'error'); return; }
  try {
    await API.post('/admin/roles', { name: name, description: document.getElementById('newRoleDesc').value.trim() || null });
    document.querySelector('div[style*="fixed"][style*="inset"]').remove();
    shellToast('Role created! Set its permissions below.');
    renderAdminPanel();
  } catch(err) {
    shellToast('Failed: ' + (err.response ? err.response.data.error : err.message), 'error');
  }
}

async function saveRolePermissions(roleName) {
  var selects = document.querySelectorAll('select.role-perm-sel[data-role="' + roleName + '"]');
  var permissions = [];
  selects.forEach(function(sel) {
    if (sel.value !== 'none') {
      permissions.push({ module: sel.dataset.module, feature: sel.dataset.feature, access_level: sel.value });
    }
  });
  // Get can_view_financials checkbox
  var finCb = document.querySelector('input.role-financials-cb[data-role="' + roleName + '"]');
  var canViewFin = finCb ? finCb.checked : true;
  try {
    await API.put('/admin/roles/' + roleName + '/permissions', { permissions: permissions, can_view_financials: canViewFin });
    shellToast('Permissions saved for ' + roleName);
  } catch(err) {
    shellToast('Failed: ' + err.message, 'error');
  }
}

async function deleteRole(roleName) {
  if (!confirm('Delete role "' + roleName + '"? This cannot be undone.')) return;
  try {
    await API.delete('/admin/roles/' + roleName);
    shellToast('Role deleted');
    renderAdminPanel();
  } catch(err) {
    shellToast('Failed: ' + (err.response ? err.response.data.error : err.message), 'error');
  }
}

// ==================== MY VIEW SETTINGS ====================

var SHELL_ALL_MODULES = [
  { id: 'logistics', label: 'Logistics', icon: 'fa-truck-fast', color: '#2563EB' },
  { id: 'inventory', label: 'Inventory', icon: 'fa-warehouse', color: '#059669' },
  { id: 'ordering', label: 'Purchasing', icon: 'fa-cart-shopping', color: '#D97706' },
  { id: 'crm', label: 'CRM', icon: 'fa-handshake', color: '#7C3AED' },
];

var SHELL_MODULE_PAGES = {
  logistics: [
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-tachometer-alt' },
    { id: 'orders', label: 'Orders', icon: 'fa-clipboard-list' },
    { id: 'ticket_review', label: 'Ticket Review', icon: 'fa-rectangle-list' },
    { id: 'schedule', label: 'Schedule', icon: 'fa-calendar-alt' },
    { id: 'routes', label: 'Routes', icon: 'fa-route' },
    { id: 'route_builder', label: 'Route Builder', icon: 'fa-map-location-dot' },
    { id: 'zones', label: 'Zones', icon: 'fa-map-location-dot' },
    { id: 'recurring', label: 'Recurring', icon: 'fa-sync-alt' },
    { id: 'customers', label: 'Customers', icon: 'fa-users' },
    { id: 'products', label: 'Products', icon: 'fa-box-open' },
    { id: 'trucks', label: 'Fleet', icon: 'fa-truck' },
    { id: 'drivers_mgmt', label: 'Drivers', icon: 'fa-id-card' },
    { id: 'maintenance', label: 'Maintenance', icon: 'fa-wrench' },
    { id: 'warehouse', label: 'Warehouse', icon: 'fa-warehouse' },
    { id: 'driver', label: 'Driver View', icon: 'fa-steering-wheel' },
    { id: 'packing', label: 'Packing Lists', icon: 'fa-list-check' },
    { id: 'returns', label: 'Returns', icon: 'fa-rotate-left' },
    { id: 'learning', label: 'AI Learning', icon: 'fa-brain' },
    { id: 'fleet_tracking', label: 'Fleet Tracking', icon: 'fa-satellite-dish' },
    { id: 'fleet_sync', label: 'Fleet Sync', icon: 'fa-arrows-rotate' },
  ],
  inventory: [
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-tachometer-alt' },
    { id: 'stock', label: 'Stock', icon: 'fa-boxes-stacked' },
    { id: 'products', label: 'Products', icon: 'fa-box-open' },
    { id: 'count', label: 'Count', icon: 'fa-clipboard-check' },
    { id: 'transfers', label: 'Transfers', icon: 'fa-arrows-left-right' },
  ],
  ordering: [
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-tachometer-alt' },
    { id: 'orders', label: 'Orders', icon: 'fa-file-invoice' },
    { id: 'requests', label: 'Requests', icon: 'fa-hand-paper' },
    { id: 'arriving', label: 'Arriving', icon: 'fa-truck-ramp-box' },
    { id: 'bills', label: 'Bills', icon: 'fa-file-invoice-dollar' },
    { id: 'suppliers', label: 'Suppliers', icon: 'fa-industry' },
  ],
  crm: [
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-tachometer-alt' },
    { id: 'pipeline', label: 'Pipeline', icon: 'fa-filter' },
    { id: 'organizations', label: 'Organizations', icon: 'fa-building' },
    { id: 'contacts', label: 'Contacts', icon: 'fa-address-book' },
  ],
};

function showMyViewSettings() {
  var dm = currentUser.default_module || '';
  var dp = currentUser.default_page || '';
  var sm = currentUser.sidebar_mode || 'full';
  var pinned = currentUser.pinned_pages || {};
  var userMods = currentUser.modules || [];
  var isAdmin = currentUser.role === 'admin';

  var overlay = document.createElement('div');
  overlay.id = 'myViewOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;animation:shellFadeIn .2s';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  var availMods = SHELL_ALL_MODULES.filter(function(m) { return isAdmin || userMods.includes(m.id); });
  var defaultPageOpts = '';
  if (dm && SHELL_MODULE_PAGES[dm]) {
    defaultPageOpts = SHELL_MODULE_PAGES[dm].map(function(p) {
      return '<option value="' + p.id + '"' + (dp === p.id ? ' selected' : '') + '>' + p.label + '</option>';
    }).join('');
  }

  overlay.innerHTML = '<div style="background:white;border-radius:16px;width:90%;max-width:500px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.2)" onclick="event.stopPropagation()">' +
    '<div style="padding:20px 24px;border-bottom:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:center">' +
      '<h3 style="font-size:18px;font-weight:700;display:flex;align-items:center;gap:8px;margin:0"><i class="fas fa-sliders-h" style="color:#7C3AED"></i> My View</h3>' +
      '<button onclick="document.getElementById(\'myViewOverlay\').remove()" style="background:none;border:none;font-size:20px;color:#94A3B8;cursor:pointer;padding:4px"><i class="fas fa-times"></i></button>' +
    '</div>' +
    '<div style="padding:20px 24px">' +

      '<div style="margin-bottom:20px">' +
        '<label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px"><i class="fas fa-home" style="color:#2563EB;margin-right:6px"></i>Default Landing</label>' +
        '<p style="font-size:12px;color:#9CA3AF;margin-bottom:8px">Where to go when you log in. Leave blank for the module picker.</p>' +
        '<div style="display:flex;gap:8px">' +
          '<select id="mvDefModule" style="flex:1;padding:10px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:14px" onchange="mvUpdatePageSelect()">' +
            '<option value="">Module picker (default)</option>' +
            availMods.map(function(m) { return '<option value="' + m.id + '"' + (dm === m.id ? ' selected' : '') + '>' + m.label + '</option>'; }).join('') +
          '</select>' +
          '<select id="mvDefPage" style="flex:1;padding:10px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:14px">' +
            '<option value="">Dashboard</option>' +
            defaultPageOpts +
          '</select>' +
        '</div>' +
      '</div>' +

      '<div style="margin-bottom:20px">' +
        '<label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px"><i class="fas fa-bars" style="color:#059669;margin-right:6px"></i>Sidebar Mode</label>' +
        '<p style="font-size:12px;color:#9CA3AF;margin-bottom:8px">Control how many pages show in the sidebar.</p>' +
        '<div style="display:flex;gap:8px">' +
          '<label style="flex:1;display:flex;align-items:center;gap:6px;padding:10px 12px;border:2px solid ' + (sm === 'full' ? '#2563EB' : '#E5E7EB') + ';border-radius:10px;cursor:pointer;font-size:13px;background:' + (sm === 'full' ? '#EFF6FF' : 'white') + '"><input type="radio" name="mvSidebar" value="full"' + (sm === 'full' ? ' checked' : '') + '> <span><strong>Full</strong><br><span style="font-size:11px;color:#6B7280">All pages</span></span></label>' +
          '<label style="flex:1;display:flex;align-items:center;gap:6px;padding:10px 12px;border:2px solid ' + (sm === 'pinned' ? '#2563EB' : '#E5E7EB') + ';border-radius:10px;cursor:pointer;font-size:13px;background:' + (sm === 'pinned' ? '#EFF6FF' : 'white') + '"><input type="radio" name="mvSidebar" value="pinned"' + (sm === 'pinned' ? ' checked' : '') + '> <span><strong>Simple</strong><br><span style="font-size:11px;color:#6B7280">Pinned only</span></span></label>' +
        '</div>' +
      '</div>' +

      '<div style="margin-bottom:20px">' +
        '<label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px"><i class="fas fa-thumbtack" style="color:#F97316;margin-right:6px"></i>Pinned Pages</label>' +
        '<p style="font-size:12px;color:#9CA3AF;margin-bottom:8px">Choose which pages appear when sidebar is in Simple mode. These also show at the top in Full mode.</p>' +
        '<div id="mvPinnedContainer">' + mvRenderPinnedModules(pinned, availMods) + '</div>' +
      '</div>' +

      '<button style="width:100%;padding:12px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:white;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer" onclick="mvSavePreferences()"><i class="fas fa-check" style="margin-right:6px"></i>Save Preferences</button>' +
    '</div>' +
  '</div>';

  document.body.appendChild(overlay);
}

function mvRenderPinnedModules(pinned, availMods) {
  var html = '';
  availMods.forEach(function(mod) {
    var pages = SHELL_MODULE_PAGES[mod.id] || [];
    var modPins = pinned[mod.id] || [];
    html += '<div style="margin-bottom:12px">' +
      '<div style="font-size:12px;font-weight:600;color:' + mod.color + ';margin-bottom:6px;display:flex;align-items:center;gap:6px"><i class="fas ' + mod.icon + '"></i> ' + mod.label + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px">';
    pages.forEach(function(p) {
      var isPinned = modPins.includes(p.id);
      html += '<button class="mv-pin-btn' + (isPinned ? ' active' : '') + '" data-mod="' + mod.id + '" data-page="' + p.id + '" onclick="mvTogglePin(this)" style="display:flex;align-items:center;gap:4px;padding:5px 10px;font-size:12px;border:1px solid ' + (isPinned ? '#7C3AED' : '#E5E7EB') + ';border-radius:16px;background:' + (isPinned ? '#F5F3FF' : 'white') + ';color:' + (isPinned ? '#7C3AED' : '#6B7280') + ';cursor:pointer">' +
        '<i class="fas ' + (isPinned ? 'fa-thumbtack' : p.icon) + '" style="font-size:10px"></i> ' + p.label + '</button>';
    });
    html += '</div></div>';
  });
  return html;
}

function mvTogglePin(btn) {
  var isActive = btn.classList.contains('active');
  btn.classList.toggle('active');
  if (isActive) {
    btn.style.borderColor = '#E5E7EB'; btn.style.background = 'white'; btn.style.color = '#6B7280';
    var icon = btn.querySelector('i');
    var page = SHELL_MODULE_PAGES[btn.dataset.mod]?.find(function(p){return p.id === btn.dataset.page});
    if (icon && page) icon.className = 'fas ' + page.icon;
  } else {
    btn.style.borderColor = '#7C3AED'; btn.style.background = '#F5F3FF'; btn.style.color = '#7C3AED';
    var icon = btn.querySelector('i');
    if (icon) icon.className = 'fas fa-thumbtack';
  }
}

function mvUpdatePageSelect() {
  var mod = document.getElementById('mvDefModule').value;
  var sel = document.getElementById('mvDefPage');
  if (!mod) { sel.innerHTML = '<option value="">—</option>'; return; }
  var pages = SHELL_MODULE_PAGES[mod] || [];
  sel.innerHTML = '<option value="">Dashboard</option>' + pages.map(function(p) {
    return '<option value="' + p.id + '">' + p.label + '</option>';
  }).join('');
}

async function mvSavePreferences() {
  var defMod = document.getElementById('mvDefModule').value || null;
  var defPage = document.getElementById('mvDefPage').value || null;
  var sidebarMode = document.querySelector('input[name="mvSidebar"]:checked')?.value || 'full';

  // Collect pinned pages
  var pinned = {};
  document.querySelectorAll('.mv-pin-btn.active').forEach(function(btn) {
    var mod = btn.dataset.mod;
    var page = btn.dataset.page;
    if (!pinned[mod]) pinned[mod] = [];
    pinned[mod].push(page);
  });

  try {
    await API.put('/user/preferences', {
      default_module: defMod,
      default_page: defPage,
      pinned_pages: Object.keys(pinned).length > 0 ? pinned : null,
      sidebar_mode: sidebarMode
    });
    // Update local user object
    currentUser.default_module = defMod;
    currentUser.default_page = defPage;
    currentUser.pinned_pages = Object.keys(pinned).length > 0 ? pinned : null;
    currentUser.sidebar_mode = sidebarMode;
    localStorage.setItem('bf_ops_user', JSON.stringify(currentUser));
    document.getElementById('myViewOverlay')?.remove();
    shellToast('View preferences saved!');
  } catch(e) { shellToast('Error saving preferences', 'error'); }
}

// ==================== ADMIN: USER VIEW CONFIG ====================

function showAdminViewConfigModal(userId) {
  var users = window._adminUsers || [];
  var user = users.find(function(u) { return u.id === userId; });
  if (!user) { shellToast('User not found', 'error'); return; }

  var dm = user.default_module || '';
  var dp = user.default_page || '';
  var sm = user.sidebar_mode || 'full';
  var pinned = user.pinned_pages || {};
  if (typeof pinned === 'string') { try { pinned = JSON.parse(pinned); } catch(e) { pinned = {}; } }
  var userMods = user.modules || [];
  var isAdminUser = user.role === 'admin';
  var availMods = SHELL_ALL_MODULES.filter(function(m) { return isAdminUser || userMods.includes(m.id); });

  var defaultPageOpts = '';
  if (dm && SHELL_MODULE_PAGES[dm]) {
    defaultPageOpts = SHELL_MODULE_PAGES[dm].map(function(p) {
      return '<option value="' + p.id + '"' + (dp === p.id ? ' selected' : '') + '>' + p.label + '</option>';
    }).join('');
  }

  var overlay = document.createElement('div');
  overlay.id = 'adminViewOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = '<div style="background:white;border-radius:16px;width:90%;max-width:500px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.2)" onclick="event.stopPropagation()">' +
    '<div style="padding:16px 20px;border-bottom:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:center">' +
      '<h3 style="font-size:16px;font-weight:700;margin:0"><i class="fas fa-sliders-h" style="color:#7C3AED;margin-right:6px"></i>View Config: ' + user.name + '</h3>' +
      '<button onclick="document.getElementById(\'adminViewOverlay\').remove()" style="background:none;border:none;font-size:18px;color:#94A3B8;cursor:pointer"><i class="fas fa-times"></i></button>' +
    '</div>' +
    '<div style="padding:16px 20px">' +

      '<div style="margin-bottom:16px">' +
        '<label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Default Landing</label>' +
        '<div style="display:flex;gap:6px">' +
          '<select id="avDefModule" style="flex:1;padding:8px;border:1px solid #E5E7EB;border-radius:6px;font-size:13px" onchange="mvUpdatePageSelect2()">' +
            '<option value="">Module picker</option>' +
            availMods.map(function(m) { return '<option value="' + m.id + '"' + (dm === m.id ? ' selected' : '') + '>' + m.label + '</option>'; }).join('') +
          '</select>' +
          '<select id="avDefPage" style="flex:1;padding:8px;border:1px solid #E5E7EB;border-radius:6px;font-size:13px"><option value="">Dashboard</option>' + defaultPageOpts + '</select>' +
        '</div>' +
      '</div>' +

      '<div style="margin-bottom:16px">' +
        '<label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Sidebar</label>' +
        '<div style="display:flex;gap:6px">' +
          '<label style="flex:1;padding:8px;border:2px solid ' + (sm==='full'?'#2563EB':'#E5E7EB') + ';border-radius:8px;cursor:pointer;font-size:12px;background:' + (sm==='full'?'#EFF6FF':'white') + ';text-align:center"><input type="radio" name="avSidebar" value="full"' + (sm==='full'?' checked':'') + '> Full</label>' +
          '<label style="flex:1;padding:8px;border:2px solid ' + (sm==='pinned'?'#2563EB':'#E5E7EB') + ';border-radius:8px;cursor:pointer;font-size:12px;background:' + (sm==='pinned'?'#EFF6FF':'white') + ';text-align:center"><input type="radio" name="avSidebar" value="pinned"' + (sm==='pinned'?' checked':'') + '> Simple</label>' +
        '</div>' +
      '</div>' +

      '<div style="margin-bottom:16px">' +
        '<label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Pinned Pages</label>' +
        '<div id="avPinnedContainer">' + mvRenderPinnedModules(pinned, availMods) + '</div>' +
      '</div>' +

      '<button style="width:100%;padding:10px;background:#7C3AED;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer" onclick="avSavePreferences(' + userId + ')"><i class="fas fa-check"></i> Save</button>' +
    '</div></div>';

  document.body.appendChild(overlay);
}

function mvUpdatePageSelect2() {
  var mod = document.getElementById('avDefModule').value;
  var sel = document.getElementById('avDefPage');
  if (!mod) { sel.innerHTML = '<option value="">—</option>'; return; }
  var pages = SHELL_MODULE_PAGES[mod] || [];
  sel.innerHTML = '<option value="">Dashboard</option>' + pages.map(function(p) {
    return '<option value="' + p.id + '">' + p.label + '</option>';
  }).join('');
}

async function avSavePreferences(userId) {
  var defMod = document.getElementById('avDefModule').value || null;
  var defPage = document.getElementById('avDefPage').value || null;
  var sidebarMode = document.querySelector('input[name="avSidebar"]:checked')?.value || 'full';
  var pinned = {};
  document.querySelectorAll('#adminViewOverlay .mv-pin-btn.active').forEach(function(btn) {
    var mod = btn.dataset.mod;
    var page = btn.dataset.page;
    if (!pinned[mod]) pinned[mod] = [];
    pinned[mod].push(page);
  });
  try {
    await API.put('/admin/users/' + userId + '/preferences', {
      default_module: defMod, default_page: defPage,
      pinned_pages: Object.keys(pinned).length > 0 ? pinned : null,
      sidebar_mode: sidebarMode
    });
    shellToast('View config saved for user');
    document.getElementById('adminViewOverlay')?.remove();
  } catch(e) { shellToast('Error: ' + (e.response?.data?.error || e.message), 'error'); }
}

// ==================== INIT ====================

(function init() {
  // Expose permission helpers globally for modules
  window._userPermissions = _userPermissions;
  window._canViewFinancials = _canViewFinancials;
  window.canAccess = canAccess;
  window.canEdit = canEdit;
  window.canViewFinancials = canViewFinancials;

  const savedUser = localStorage.getItem('bf_ops_user');
  const savedToken = localStorage.getItem('bf_ops_token');
  if (savedUser && savedToken) {
    try {
      currentUser = JSON.parse(savedUser);
      setToken(savedToken);
      // Restore permissions from localStorage
      var savedPerms = localStorage.getItem('bf_ops_permissions');
      if (savedPerms) {
        _userPermissions = JSON.parse(savedPerms);
        window._userPermissions = _userPermissions;
      }
      var savedFin = localStorage.getItem('bf_ops_can_view_financials');
      if (savedFin !== null) {
        _canViewFinancials = JSON.parse(savedFin);
        window._canViewFinancials = _canViewFinancials;
      }
      // Auto-navigate to default landing if configured
      if (currentUser.default_module) {
        launchModule(currentUser.default_module, currentUser.default_page || null);
      } else {
        renderHome();
      }
    } catch(e) {
      setToken(null);
      renderLogin();
    }
  } else {
    renderLogin();
  }
})();
