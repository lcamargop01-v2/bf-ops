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
  // Remove module-injected scripts (but keep cached references)
  // Reset module globals
  window._logisticsActive = false;
}

// ==================== LOGISTICS MODULE LOADER ====================

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
  // The logistics module looks for a saved user in localStorage under 'bf_user'
  // We bridge the parent auth to what logistics expects
  if (currentUser) {
    localStorage.setItem('bf_user', JSON.stringify(currentUser));
    // Also set the token logistics expects
    const parentToken = localStorage.getItem('bf_ops_token');
    if (parentToken) {
      localStorage.setItem('bf_token', parentToken);
    }
  }

  // Trigger logistics init — the module's IIFE looks for bf_user in localStorage
  // and calls render(). Since we've already loaded the script once, we need to
  // manually trigger re-initialization.
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

async function renderAdminPanel() {
  const frame = document.getElementById('moduleFrame');
  frame.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%"><i class="fas fa-spinner fa-spin fa-2x" style="color:#94A3B8"></i></div>';

  try {
    const [usersRes, locationsRes] = await Promise.all([
      API.get('/admin/users'),
      API.get('/locations')
    ]);
    const users = usersRes.data.users || [];
    const locations = locationsRes.data.locations || [];
    const allModuleIds = ['logistics', 'inventory', 'ordering', 'crm', 'pos', 'tasks'];

    frame.innerHTML = `
      <div class="shell-admin-panel">
        <h2 style="font-size:22px;font-weight:800;color:#1E293B;margin-bottom:20px"><i class="fas fa-cog" style="margin-right:8px;color:#64748B"></i>Administration</h2>

        <!-- Locations -->
        <div class="shell-admin-card" style="margin-bottom:20px">
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

        <!-- User Module Access -->
        <div class="shell-admin-card">
          <div class="shell-admin-card-header">
            <h3><i class="fas fa-users-cog" style="color:#7C3AED;margin-right:8px"></i>User Module Access</h3>
          </div>
          <table class="shell-admin-table">
            <thead>
              <tr>
                <th>User</th><th>Role</th>
                ${allModuleIds.map(m => `<th style="text-align:center">${m.charAt(0).toUpperCase() + m.slice(1)}</th>`).join('')}
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => `
                <tr data-user-id="${u.id}">
                  <td>
                    <div style="display:flex;align-items:center;gap:8px">
                      <div style="width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#3B82F6,#7C3AED);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:700">${getInitials(u.name)}</div>
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
                        : `<input type="checkbox" class="shell-module-toggle" data-user="${u.id}" data-module="${m}" ${u.modules?.includes(m) ? 'checked' : ''}>`}
                    </td>
                  `).join('')}
                  <td>
                    ${u.role !== 'admin' ? `<button class="shell-save-btn" onclick="saveUserModules(${u.id})"><i class="fas fa-save"></i> Save</button>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  } catch(err) {
    frame.innerHTML = `<div style="padding:40px;text-align:center"><p style="color:#DC2626">Error loading admin panel: ${err.message}</p></div>`;
  }
}

async function saveUserModules(userId) {
  const row = document.querySelector(`tr[data-user-id="${userId}"]`);
  if (!row) return;
  const checkboxes = row.querySelectorAll('.shell-module-toggle');
  const modules = [];
  checkboxes.forEach(cb => { if (cb.checked) modules.push(cb.dataset.module); });
  try {
    await API.put(`/admin/users/${userId}/modules`, { modules });
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
