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

async function doLogin(e) {
  if (e) e.preventDefault();
  const email = document.getElementById('shellLoginEmail').value;
  const password = document.getElementById('shellLoginPassword').value;
  try {
    const { data } = await API.post('/auth/login', { email, password });
    currentUser = data.user;
    setToken(data.token);
    localStorage.setItem('bf_ops_user', JSON.stringify(data.user));
    shellToast(`Welcome, ${currentUser.name}!`);
    renderHome();
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

function launchModule(moduleId) {
  if (moduleId === activeModule) return;

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
          <i class="fas fa-th-large"></i> Modules
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
    const [usersRes, locationsRes] = await Promise.all([
      API.get('/admin/users' + (_adminShowArchived ? '?include_archived=1' : '')),
      API.get('/locations')
    ]);
    const users = usersRes.data.users || [];
    const locations = locationsRes.data.locations || [];
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
            <thead><tr><th>User</th><th>Role</th><th>Phone</th><th>Language</th><th>Status</th><th></th></tr></thead>
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
                  <td style="font-size:12px">${u.phone || '—'}</td>
                  <td style="font-size:12px">${langNames[u.preferred_language] || u.preferred_language || 'English'}</td>
                  <td>${u.active ? '<span style="font-size:11px;padding:2px 8px;border-radius:12px;background:#ECFDF5;color:#059669;font-weight:600">Active</span>' : '<span style="font-size:11px;padding:2px 8px;border-radius:12px;background:#FEF2F2;color:#DC2626;font-weight:600">Inactive</span>'}</td>
                  <td style="display:flex;gap:4px">
                    <button class="shell-save-btn" onclick="showAdminEditUserModal(${u.id})" title="Edit"><i class="fas fa-edit"></i></button>
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
            <select id="adminNewRole" style="width:100%;padding:8px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px"><option value="dispatcher">Dispatcher</option><option value="warehouse">Warehouse</option><option value="driver">Driver</option><option value="admin">Admin</option></select>
          </div>
          <div style="flex:1"><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">Phone</label><input id="adminNewPhone" style="width:100%;padding:8px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px" placeholder="561-555-1234"></div>
        </div>
        <div style="display:flex;gap:12px">
          <div style="flex:1"><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">Language</label>
            <select id="adminNewLang" style="width:100%;padding:8px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px"><option value="en">English</option><option value="es">Español</option><option value="ht">Kreyòl</option></select>
          </div>
          <div style="flex:1"><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">Password</label><input id="adminNewPassword" type="password" style="width:100%;padding:8px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px" value="changeme123" placeholder="Initial password"></div>
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
  try {
    await API.post('/admin/users', {
      name: name,
      email: email,
      role: document.getElementById('adminNewRole').value,
      phone: document.getElementById('adminNewPhone').value.trim() || null,
      preferred_language: document.getElementById('adminNewLang').value,
      password: document.getElementById('adminNewPassword').value || 'changeme123'
    });
    document.querySelector('div[style*="fixed"][style*="inset"]').remove();
    shellToast('User created!');
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
  var roles = ['admin','dispatcher','warehouse','driver','customer'];
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

// ==================== INIT ====================

(function init() {
  const savedUser = localStorage.getItem('bf_ops_user');
  const savedToken = localStorage.getItem('bf_ops_token');
  if (savedUser && savedToken) {
    try {
      currentUser = JSON.parse(savedUser);
      setToken(savedToken);
      renderHome();
    } catch(e) {
      setToken(null);
      renderLogin();
    }
  } else {
    renderLogin();
  }
})();
