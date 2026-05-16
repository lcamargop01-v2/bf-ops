// BF Ops - CRM Module
// Organizations, Contacts, Leads (pipeline), Activities
// Ties into POS via convert-to-customer flow

var crmAPI = axios.create({ baseURL: '' });
var crmUser = null;
var crmPage = 'dashboard'; // dashboard, pipeline, organizations, contacts, orgDetail, contactDetail, oppDetail
var crmPipelines = [];
var crmStages = [];
var crmDashData = null;
var crmOrgs = []; var crmOrgsTotal = 0; var crmOrgsOffset = 0;
var crmContacts = []; var crmContactsTotal = 0; var crmContactsOffset = 0;
var crmOpps = [];
var crmDetailData = null; // current detail view data
var crmDragOppId = null;
var crmAllOrgs = []; // cached org list for dropdowns
var crmAllUsers = []; // cached user list for sales rep dropdowns

// ==================== AUTH BRIDGE ====================
function crmGetToken() { return localStorage.getItem('bf_ops_token') || localStorage.getItem('bf_token') || ''; }
function crmHeaders() { return { Authorization: 'Bearer ' + crmGetToken() }; }

// ==================== HELPERS ====================
function crmFmt$(v) { return '$' + (parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function crmFmtDate(d) { if (!d) return '—'; return dayjs(d).format('MMM D, YYYY'); }
function crmFmtDateTime(d) { if (!d) return '—'; return dayjs(d).format('MMM D, YYYY h:mm A'); }
function crmEsc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
async function crmFetchAllOrgs() {
  try {
    var resp = await crmAPI.get('/api/crm/organizations?limit=500&offset=0', { headers: crmHeaders() });
    crmAllOrgs = resp.data.organizations || [];
  } catch(e) { crmAllOrgs = []; }
}
async function crmFetchAllUsers() {
  try {
    var resp = await crmAPI.get('/api/crm/users', { headers: crmHeaders() });
    crmAllUsers = resp.data.users || [];
  } catch(e) { crmAllUsers = []; }
}
function crmUserSelectHtml(fieldId, selectedId) {
  var html = '<select class="crm-input" id="' + fieldId + '">';
  html += '<option value="">(Unassigned)</option>';
  crmAllUsers.forEach(function(u) {
    html += '<option value="' + u.id + '"' + (u.id == selectedId ? ' selected' : '') + '>' + crmEsc(u.name) + '</option>';
  });
  html += '</select>';
  return html;
}
function crmOrgSelectHtml(fieldId, selectedId, required) {
  var html = '<select class="crm-input" id="' + fieldId + '">';
  html += '<option value="">' + (required ? '-- Select Organization --' : '(None)') + '</option>';
  crmAllOrgs.forEach(function(o) {
    html += '<option value="' + o.id + '"' + (o.id == selectedId ? ' selected' : '') + '>' + crmEsc(o.name) + (o.org_type ? ' (' + o.org_type + ')' : '') + '</option>';
  });
  html += '</select>';
  return html;
}
function crmToast(msg, type) {
  type = type || 'success';
  var el = document.createElement('div');
  el.className = 'crm-toast crm-toast-' + type;
  el.innerHTML = '<i class="fas ' + (type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle') + '"></i> ' + msg;
  document.body.appendChild(el);
  requestAnimationFrame(function() { el.classList.add('crm-toast-show'); });
  setTimeout(function() { el.style.opacity = '0'; setTimeout(function() { el.remove(); }, 300); }, 3000);
}

// ==================== INIT ====================
window._crmInit = function() {
  console.log('[CRM] init called');
  var savedUser = localStorage.getItem('bf_ops_user') || localStorage.getItem('bf_user');
  if (savedUser) { try { crmUser = JSON.parse(savedUser); } catch(e) { crmUser = null; } }
  crmPage = 'dashboard';
  crmLoadPipelines().then(function() { crmRender(); });
};

window._crmCleanup = function() {
  crmUser = null;
  crmPage = 'dashboard';
  crmDashData = null;
};

// ==================== DATA LOADING ====================
async function crmLoadPipelines() {
  try {
    var resp = await crmAPI.get('/api/crm/pipelines', { headers: crmHeaders() });
    crmPipelines = resp.data.pipelines || [];
    crmStages = crmPipelines.length ? crmPipelines[0].stages || [] : [];
  } catch(e) { crmPipelines = []; crmStages = []; }
}

async function crmLoadDashboard() {
  try {
    var resp = await crmAPI.get('/api/crm/dashboard', { headers: crmHeaders() });
    crmDashData = resp.data;
  } catch(e) { crmDashData = null; }
}

async function crmLoadOrgs(reset) {
  if (reset) crmOrgsOffset = 0;
  var search = document.getElementById('crmOrgSearch');
  var typeEl = document.getElementById('crmOrgTypeFilter');
  var params = 'limit=50&offset=' + crmOrgsOffset;
  if (search && search.value) params += '&search=' + encodeURIComponent(search.value);
  if (typeEl && typeEl.value) params += '&type=' + typeEl.value;
  try {
    var resp = await crmAPI.get('/api/crm/organizations?' + params, { headers: crmHeaders() });
    crmOrgs = resp.data.organizations || [];
    crmOrgsTotal = resp.data.total || 0;
  } catch(e) { crmOrgs = []; crmOrgsTotal = 0; }
}

async function crmLoadContacts(reset) {
  if (reset) crmContactsOffset = 0;
  var search = document.getElementById('crmContactSearch');
  var statusEl = document.getElementById('crmContactStatusFilter');
  var params = 'limit=50&offset=' + crmContactsOffset;
  if (search && search.value) params += '&search=' + encodeURIComponent(search.value);
  if (statusEl && statusEl.value) params += '&status=' + statusEl.value;
  try {
    var resp = await crmAPI.get('/api/crm/contacts?' + params, { headers: crmHeaders() });
    crmContacts = resp.data.contacts || [];
    crmContactsTotal = resp.data.total || 0;
  } catch(e) { crmContacts = []; crmContactsTotal = 0; }
}

async function crmLoadOpps() {
  try {
    var resp = await crmAPI.get('/api/crm/opportunities?status=open&pipeline_id=1', { headers: crmHeaders() });
    crmOpps = resp.data.opportunities || [];
  } catch(e) { crmOpps = []; }
}

// ==================== MAIN RENDER ====================
function crmRender() {
  var root = document.getElementById('crm-app');
  if (!root) return;

  var pages = [
    { id: 'dashboard', icon: 'fa-chart-line', label: 'Dashboard' },
    { id: 'pipeline', icon: 'fa-columns', label: 'Pipeline' },
    { id: 'organizations', icon: 'fa-building', label: 'Organizations' },
    { id: 'contacts', icon: 'fa-address-book', label: 'Contacts' }
  ];

  root.innerHTML =
    '<div class="crm-nav">' +
      '<div class="crm-nav-scroll">' +
        pages.map(function(p) {
          return '<button class="crm-nav-btn ' + (crmPage === p.id ? 'active' : '') + '" onclick="crmGoPage(\'' + p.id + '\')">' +
            '<i class="fas ' + p.icon + '"></i> <span>' + p.label + '</span></button>';
        }).join('') +
      '</div>' +
    '</div>' +
    '<div id="crmContent"><div class="crm-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div></div>';

  if (crmPage === 'dashboard') { crmRenderDashboard(); }
  else if (crmPage === 'pipeline') { crmRenderPipeline(); }
  else if (crmPage === 'organizations') { crmRenderOrgsPage(); }
  else if (crmPage === 'contacts') { crmRenderContactsPage(); }
  else if (crmPage === 'orgDetail') { crmRenderOrgDetail(); }
  else if (crmPage === 'contactDetail') { crmRenderContactDetail(); }
  else if (crmPage === 'oppDetail') { crmRenderOppDetail(); }
}

function crmGoPage(pg) { crmPage = pg; crmRender(); }

// ==================== DASHBOARD ====================
async function crmRenderDashboard() {
  var ct = document.getElementById('crmContent');
  ct.innerHTML = '<div class="crm-loading"><i class="fas fa-spinner fa-spin"></i> Loading dashboard...</div>';
  await crmLoadDashboard();
  if (!crmDashData) { ct.innerHTML = '<div class="crm-empty"><i class="fas fa-handshake" style="font-size:48px;color:#CBD5E1"></i><h3>CRM</h3><p>Could not load dashboard data.</p></div>'; return; }

  var s = crmDashData.summary;
  var stages = crmDashData.pipeline_stages || [];
  var recentOpps = crmDashData.recent_opportunities || [];
  var tasks = crmDashData.upcoming_tasks || [];

  ct.innerHTML =
    '<div class="crm-dashboard">' +
      // Summary cards
      '<div class="crm-cards-grid">' +
        crmStatCard('fa-building', '#6366F1', '#EEF2FF', s.organizations, 'Organizations', "crmGoPage('organizations')") +
        crmStatCard('fa-address-book', '#0EA5E9', '#F0F9FF', s.contacts, 'Contacts', "crmGoPage('contacts')") +
        crmStatCard('fa-handshake', '#F59E0B', '#FFFBEB', s.open_opportunities, 'Active Leads', "crmGoPage('pipeline')") +
        crmStatCard('fa-dollar-sign', '#059669', '#F0FDF4', crmFmt$(s.open_value), 'Pipeline Value', "crmGoPage('pipeline')") +
        crmStatCard('fa-trophy', '#7C3AED', '#F5F3FF', s.won_opportunities, 'Won', null) +
        crmStatCard('fa-dollar-sign', '#059669', '#F0FDF4', crmFmt$(s.won_value), 'Won Revenue', null) +
        crmStatCard('fa-times-circle', '#DC2626', '#FEF2F2', s.lost_opportunities, 'Lost', null) +
        crmStatCard('fa-tasks', '#D97706', '#FFFBEB', s.pending_activities, 'Pending Tasks', null) +
      '</div>' +

      // Pipeline mini-board
      '<div class="crm-section">' +
        '<div class="crm-section-header"><h2><i class="fas fa-columns"></i> Pipeline Overview</h2>' +
          '<button class="crm-btn crm-btn-primary crm-btn-sm" onclick="crmGoPage(\'pipeline\')"><i class="fas fa-external-link-alt"></i> Full Board</button>' +
        '</div>' +
        '<div class="crm-pipeline-mini">' +
          stages.map(function(st) {
            var pct = s.open_opportunities > 0 ? Math.round((st.opp_count / s.open_opportunities) * 100) : 0;
            return '<div class="crm-pipeline-mini-stage">' +
              '<div class="crm-pipeline-mini-bar" style="width:' + Math.max(pct, 8) + '%"></div>' +
              '<div class="crm-pipeline-mini-info">' +
                '<span class="crm-pipeline-mini-name">' + crmEsc(st.name) + '</span>' +
                '<span class="crm-pipeline-mini-count">' + st.opp_count + ' &middot; ' + crmFmt$(st.opp_value) + '</span>' +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>' +

      // Recent opportunities + upcoming tasks side by side
      '<div class="crm-dash-split">' +
        '<div class="crm-section">' +
          '<h2 class="crm-section-title"><i class="fas fa-handshake"></i> Recent Leads</h2>' +
          (recentOpps.length === 0 ? '<p class="crm-muted">No active leads yet.</p>' :
            '<div class="crm-table-wrap"><table class="crm-table crm-table-hover"><thead><tr><th>Lead</th><th>Org</th><th>Stage</th><th class="text-right">Value</th></tr></thead><tbody>' +
            recentOpps.map(function(o) {
              return '<tr class="crm-clickable" onclick="crmViewOpp(' + o.id + ')">' +
                '<td><strong>' + crmEsc(o.name) + '</strong></td>' +
                '<td>' + crmEsc(o.org_name || '—') + '</td>' +
                '<td><span class="crm-stage-badge">' + crmEsc(o.stage_name || '—') + '</span></td>' +
                '<td class="text-right"><strong>' + crmFmt$(o.value) + '</strong></td>' +
              '</tr>';
            }).join('') + '</tbody></table></div>'
          ) +
        '</div>' +
        '<div class="crm-section">' +
          '<h2 class="crm-section-title"><i class="fas fa-tasks"></i> Upcoming Tasks</h2>' +
          (tasks.length === 0 ? '<p class="crm-muted">No pending tasks.</p>' :
            '<div class="crm-activity-list">' +
            tasks.map(function(t) {
              return '<div class="crm-activity-item">' +
                '<div class="crm-activity-icon crm-activity-task"><i class="fas fa-clipboard-check"></i></div>' +
                '<div class="crm-activity-body">' +
                  '<div class="crm-activity-subject">' + crmEsc(t.subject || 'Task') + '</div>' +
                  '<div class="crm-activity-meta">' +
                    (t.contact_name && t.contact_name.trim() ? '<span>' + crmEsc(t.contact_name) + '</span>' : '') +
                    (t.org_name ? '<span>' + crmEsc(t.org_name) + '</span>' : '') +
                    '<span>Due: ' + crmFmtDate(t.due_date) + '</span>' +
                  '</div>' +
                '</div>' +
                '<button class="crm-btn crm-btn-xs crm-btn-outline" onclick="crmCompleteActivity(' + t.id + ')"><i class="fas fa-check"></i></button>' +
              '</div>';
            }).join('') +
            '</div>'
          ) +
        '</div>' +
      '</div>' +

      // Quick actions
      '<div class="crm-section">' +
        '<h2 class="crm-section-title"><i class="fas fa-bolt"></i> Quick Actions</h2>' +
        '<div class="crm-quick-actions">' +
          '<button class="crm-action-btn" onclick="crmShowNewOrg()"><i class="fas fa-building"></i> New Organization</button>' +
          '<button class="crm-action-btn" onclick="crmShowNewContact()"><i class="fas fa-user-plus"></i> New Contact</button>' +
          '<button class="crm-action-btn" onclick="crmShowNewOpp()"><i class="fas fa-handshake"></i> New Lead</button>' +
          '<button class="crm-action-btn" onclick="crmShowNewActivity()"><i class="fas fa-sticky-note"></i> Log Activity</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function crmStatCard(icon, iconColor, iconBg, value, label, onclick) {
  return '<div class="crm-stat-card" ' + (onclick ? 'onclick="' + onclick + '" style="cursor:pointer"' : '') + '>' +
    '<div class="crm-stat-icon" style="background:' + iconBg + ';color:' + iconColor + '"><i class="fas ' + icon + '"></i></div>' +
    '<div><div class="crm-stat-value">' + value + '</div><div class="crm-stat-label">' + label + '</div></div></div>';
}

// ==================== PIPELINE BOARD ====================
async function crmRenderPipeline() {
  var ct = document.getElementById('crmContent');
  ct.innerHTML = '<div class="crm-loading"><i class="fas fa-spinner fa-spin"></i> Loading pipeline...</div>';
  await crmLoadOpps();

  var stageColors = { open: '#6366F1', won: '#059669', lost: '#DC2626' };
  var allStages = crmStages.slice().sort(function(a, b) { return a.sort_order - b.sort_order; });

  ct.innerHTML =
    '<div class="crm-pipeline-page">' +
      '<div class="crm-pipeline-header">' +
        '<h2><i class="fas fa-columns"></i> Sales Pipeline</h2>' +
        '<button class="crm-btn crm-btn-primary" onclick="crmShowNewOpp()"><i class="fas fa-plus"></i> New Lead</button>' +
      '</div>' +
      '<div class="crm-pipeline-board" id="crmPipelineBoard">' +
        allStages.map(function(stage) {
          var stageOpps = crmOpps.filter(function(o) { return o.stage_id === stage.id; });
          var totalVal = stageOpps.reduce(function(s, o) { return s + (parseFloat(o.value) || 0); }, 0);
          var colColor = stageColors[stage.stage_type] || stageColors.open;
          var isTerminal = stage.stage_type === 'won' || stage.stage_type === 'lost';
          return '<div class="crm-pipeline-col' + (isTerminal ? ' crm-pipeline-col-terminal' : '') + '" data-stage-id="' + stage.id + '" ondragover="crmDragOver(event)" ondrop="crmDrop(event, ' + stage.id + ')" style="border-top:3px solid ' + colColor + '">' +
            '<div class="crm-pipeline-col-header">' +
              '<div class="crm-pipeline-col-title">' + (stage.stage_type === 'won' ? '<i class="fas fa-trophy" style="color:#059669;margin-right:4px"></i>' : stage.stage_type === 'lost' ? '<i class="fas fa-times-circle" style="color:#DC2626;margin-right:4px"></i>' : '') + crmEsc(stage.name) + '</div>' +
              '<div class="crm-pipeline-col-meta">' + stageOpps.length + ' &middot; ' + crmFmt$(totalVal) + '</div>' +
            '</div>' +
            '<div class="crm-pipeline-col-body">' +
              stageOpps.map(function(o) {
                return '<div class="crm-pipeline-card" draggable="true" ondragstart="crmDragStart(event, ' + o.id + ')" onclick="crmViewOpp(' + o.id + ')">' +
                  '<div class="crm-pipeline-card-title">' + crmEsc(o.name) + '</div>' +
                  '<div class="crm-pipeline-card-org">' + crmEsc(o.org_name || '—') + '</div>' +
                  (o.owner_name ? '<div class="crm-pipeline-card-rep"><i class="fas fa-user-tie"></i> ' + crmEsc(o.owner_name) + '</div>' : '') +
                  '<div class="crm-pipeline-card-footer">' +
                    '<span class="crm-pipeline-card-value">' + crmFmt$(o.value) + '</span>' +
                    (o.close_date ? '<span class="crm-pipeline-card-date">' + crmFmtDate(o.close_date) + '</span>' : '') +
                  '</div>' +
                '</div>';
              }).join('') +
              (stageOpps.length === 0 ? '<div class="crm-pipeline-empty">No leads</div>' : '') +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>';
}

// Drag and drop
function crmDragStart(ev, oppId) {
  crmDragOppId = oppId;
  ev.dataTransfer.effectAllowed = 'move';
  ev.target.classList.add('crm-dragging');
}
function crmDragOver(ev) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; }
async function crmDrop(ev, stageId) {
  ev.preventDefault();
  if (!crmDragOppId) return;
  try {
    await crmAPI.post('/api/crm/opportunities/' + crmDragOppId + '/move', { stage_id: stageId }, { headers: crmHeaders() });
    crmToast('Lead moved');
    crmDragOppId = null;
    crmRenderPipeline();
  } catch(e) { crmToast('Failed to move lead', 'error'); }
}

// ==================== ORGANIZATIONS PAGE ====================
async function crmRenderOrgsPage() {
  var ct = document.getElementById('crmContent');
  ct.innerHTML = '<div class="crm-loading"><i class="fas fa-spinner fa-spin"></i> Loading organizations...</div>';
  await crmLoadOrgs(true);
  crmRenderOrgsContent();
}

function crmRenderOrgsContent() {
  var ct = document.getElementById('crmContent');
  ct.innerHTML =
    '<div class="crm-list-page">' +
      '<div class="crm-list-header">' +
        '<h2><i class="fas fa-building"></i> Organizations</h2>' +
        '<button class="crm-btn crm-btn-primary" onclick="crmShowNewOrg()"><i class="fas fa-plus"></i> New Org</button>' +
      '</div>' +
      '<div class="crm-toolbar">' +
        '<div class="crm-search-box"><i class="fas fa-search"></i>' +
          '<input id="crmOrgSearch" placeholder="Search organizations..." onkeydown="if(event.key===\'Enter\')crmSearchOrgs()">' +
        '</div>' +
        '<select id="crmOrgTypeFilter" class="crm-select" onchange="crmSearchOrgs()">' +
          '<option value="">All Types</option>' +
          '<option value="prospect">Prospect</option><option value="customer">Customer</option>' +
          '<option value="vendor">Vendor</option><option value="partner">Partner</option><option value="other">Other</option>' +
        '</select>' +
      '</div>' +
      '<div class="crm-stock-count">' + crmOrgsTotal + ' organization' + (crmOrgsTotal !== 1 ? 's' : '') + '</div>' +

      // Desktop table
      '<div class="crm-desktop-only"><div class="crm-table-wrap"><table class="crm-table crm-table-hover"><thead><tr>' +
        '<th>Organization</th><th>Type</th><th>Phone</th><th>Email</th><th>Contacts</th><th>Active Leads</th>' +
      '</tr></thead><tbody>' +
      (crmOrgs.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:24px;color:#94A3B8">No organizations found</td></tr>' :
        crmOrgs.map(function(o) {
          return '<tr class="crm-clickable" onclick="crmViewOrg(' + o.id + ')">' +
            '<td><strong>' + crmEsc(o.name) + '</strong>' + (o.industry ? '<br><span class="crm-muted">' + crmEsc(o.industry) + '</span>' : '') + '</td>' +
            '<td>' + crmOrgTypeBadge(o.org_type) + '</td>' +
            '<td>' + crmEsc(o.phone || '—') + '</td>' +
            '<td>' + crmEsc(o.email || '—') + '</td>' +
            '<td>' + (o.contact_count || 0) + '</td>' +
            '<td>' + (o.open_opps || 0) + '</td>' +
          '</tr>';
        }).join('')) +
      '</tbody></table></div></div>' +

      // Mobile cards
      '<div class="crm-mobile-only"><div class="crm-stock-cards">' +
      (crmOrgs.length === 0 ? '<div class="crm-empty"><p>No organizations found</p></div>' :
        crmOrgs.map(function(o) {
          return '<div class="crm-stock-card" onclick="crmViewOrg(' + o.id + ')">' +
            '<div class="crm-stock-card-top">' +
              '<div><strong>' + crmEsc(o.name) + '</strong><br><span class="crm-muted">' + crmEsc(o.industry || '') + '</span></div>' +
              crmOrgTypeBadge(o.org_type) +
            '</div>' +
            '<div class="crm-stock-card-nums" style="grid-template-columns:repeat(3,1fr)">' +
              '<div><span class="crm-muted">Contacts</span><strong>' + (o.contact_count || 0) + '</strong></div>' +
              '<div><span class="crm-muted">Leads</span><strong>' + (o.open_opps || 0) + '</strong></div>' +
              '<div><span class="crm-muted">Phone</span><span style="font-size:12px">' + crmEsc(o.phone || '—') + '</span></div>' +
            '</div>' +
          '</div>';
        }).join('')) +
      '</div></div>' +

      crmPaginationHtml(crmOrgsOffset, crmOrgsTotal, 50, 'crmOrgsPageNav') +
    '</div>';
}

async function crmSearchOrgs() { await crmLoadOrgs(true); crmRenderOrgsContent(); }
async function crmOrgsPageNav(dir) {
  if (dir === 'next' && crmOrgsOffset + 50 < crmOrgsTotal) crmOrgsOffset += 50;
  else if (dir === 'prev' && crmOrgsOffset >= 50) crmOrgsOffset -= 50;
  await crmLoadOrgs(false);
  crmRenderOrgsContent();
}

// ==================== CONTACTS PAGE ====================
async function crmRenderContactsPage() {
  var ct = document.getElementById('crmContent');
  ct.innerHTML = '<div class="crm-loading"><i class="fas fa-spinner fa-spin"></i> Loading contacts...</div>';
  await crmLoadContacts(true);
  crmRenderContactsContent();
}

function crmRenderContactsContent() {
  var ct = document.getElementById('crmContent');
  ct.innerHTML =
    '<div class="crm-list-page">' +
      '<div class="crm-list-header">' +
        '<h2><i class="fas fa-address-book"></i> Contacts</h2>' +
        '<button class="crm-btn crm-btn-primary" onclick="crmShowNewContact()"><i class="fas fa-plus"></i> New Contact</button>' +
      '</div>' +
      '<div class="crm-toolbar">' +
        '<div class="crm-search-box"><i class="fas fa-search"></i>' +
          '<input id="crmContactSearch" placeholder="Search contacts..." onkeydown="if(event.key===\'Enter\')crmSearchContacts()">' +
        '</div>' +
        '<select id="crmContactStatusFilter" class="crm-select" onchange="crmSearchContacts()">' +
          '<option value="">All Statuses</option>' +
          '<option value="new">New</option><option value="contacted">Contacted</option>' +
          '<option value="qualified">Qualified</option><option value="unqualified">Unqualified</option>' +
          '<option value="converted">Converted</option><option value="lost">Lost</option>' +
        '</select>' +
      '</div>' +
      '<div class="crm-stock-count">' + crmContactsTotal + ' contact' + (crmContactsTotal !== 1 ? 's' : '') + '</div>' +

      '<div class="crm-desktop-only"><div class="crm-table-wrap"><table class="crm-table crm-table-hover"><thead><tr>' +
        '<th>Name</th><th>Organization</th><th>Status</th><th>Phone</th><th>Email</th>' +
      '</tr></thead><tbody>' +
      (crmContacts.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:24px;color:#94A3B8">No contacts found</td></tr>' :
        crmContacts.map(function(c) {
          return '<tr class="crm-clickable" onclick="crmViewContact(' + c.id + ')">' +
            '<td><strong>' + crmEsc(c.first_name + ' ' + (c.last_name || '')) + '</strong>' + (c.title ? '<br><span class="crm-muted">' + crmEsc(c.title) + '</span>' : '') + '</td>' +
            '<td>' + crmEsc(c.organization_name || '—') + '</td>' +
            '<td>' + crmLeadStatusBadge(c.lead_status) + '</td>' +
            '<td>' + crmEsc(c.phone || c.mobile || '—') + '</td>' +
            '<td>' + crmEsc(c.email || '—') + '</td>' +
          '</tr>';
        }).join('')) +
      '</tbody></table></div></div>' +

      '<div class="crm-mobile-only"><div class="crm-stock-cards">' +
      (crmContacts.length === 0 ? '<div class="crm-empty"><p>No contacts found</p></div>' :
        crmContacts.map(function(c) {
          return '<div class="crm-stock-card" onclick="crmViewContact(' + c.id + ')">' +
            '<div class="crm-stock-card-top">' +
              '<div><strong>' + crmEsc(c.first_name + ' ' + (c.last_name || '')) + '</strong>' +
                (c.title ? '<br><span class="crm-muted">' + crmEsc(c.title) + '</span>' : '') +
              '</div>' +
              crmLeadStatusBadge(c.lead_status) +
            '</div>' +
            '<div class="crm-stock-card-nums" style="grid-template-columns:1fr 1fr">' +
              '<div><span class="crm-muted">Org</span><span style="font-size:12px">' + crmEsc(c.organization_name || '—') + '</span></div>' +
              '<div><span class="crm-muted">Phone</span><span style="font-size:12px">' + crmEsc(c.phone || c.mobile || '—') + '</span></div>' +
            '</div>' +
          '</div>';
        }).join('')) +
      '</div></div>' +

      crmPaginationHtml(crmContactsOffset, crmContactsTotal, 50, 'crmContactsPageNav') +
    '</div>';
}

async function crmSearchContacts() { await crmLoadContacts(true); crmRenderContactsContent(); }
async function crmContactsPageNav(dir) {
  if (dir === 'next' && crmContactsOffset + 50 < crmContactsTotal) crmContactsOffset += 50;
  else if (dir === 'prev' && crmContactsOffset >= 50) crmContactsOffset -= 50;
  await crmLoadContacts(false);
  crmRenderContactsContent();
}

// ==================== ORGANIZATION DETAIL ====================
async function crmViewOrg(id) {
  crmPage = 'orgDetail';
  crmRender();
  var ct = document.getElementById('crmContent');
  ct.innerHTML = '<div class="crm-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
  try {
    var resp = await crmAPI.get('/api/crm/organizations/' + id, { headers: crmHeaders() });
    crmDetailData = resp.data;
  } catch(e) { ct.innerHTML = '<div class="crm-empty"><p>Failed to load organization</p></div>'; return; }
  crmRenderOrgDetail();
}

function crmRenderOrgDetail() {
  var ct = document.getElementById('crmContent');
  if (!crmDetailData) return;
  var org = crmDetailData.organization;
  var contacts = crmDetailData.contacts || [];
  var opps = crmDetailData.opportunities || [];
  var activities = crmDetailData.activities || [];

  ct.innerHTML =
    '<div class="crm-detail-page">' +
      '<div class="crm-detail-topbar">' +
        '<button class="crm-btn crm-btn-outline crm-btn-sm" onclick="crmGoPage(\'organizations\')"><i class="fas fa-arrow-left"></i> Back</button>' +
        '<div class="crm-detail-actions">' +
          '<button class="crm-btn crm-btn-outline crm-btn-sm" onclick="crmShowEditOrg(' + org.id + ')"><i class="fas fa-edit"></i> Edit</button>' +
          '<button class="crm-btn crm-btn-primary crm-btn-sm" onclick="crmShowNewOpp(' + org.id + ')"><i class="fas fa-plus"></i> New Lead</button>' +
        '</div>' +
      '</div>' +

      '<div class="crm-detail-header">' +
        '<div class="crm-detail-avatar" style="background:linear-gradient(135deg,#6366F1,#818CF8)">' +
          '<i class="fas fa-building"></i>' +
        '</div>' +
        '<div>' +
          '<h2>' + crmEsc(org.name) + '</h2>' +
          '<div class="crm-detail-meta">' +
            crmOrgTypeBadge(org.org_type) +
            (org.industry ? '<span class="crm-muted" style="margin-left:8px">' + crmEsc(org.industry) + '</span>' : '') +
            (org.customer_id ? '<span class="crm-badge-converted"><i class="fas fa-check-circle"></i> POS Customer #' + org.customer_id + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +

      // Info grid
      '<div class="crm-detail-info-grid">' +
        '<div class="crm-info-card">' +
          '<h4><i class="fas fa-info-circle"></i> Details</h4>' +
          crmInfoRow('Phone', org.phone) + crmInfoRow('Email', org.email) + crmInfoRow('Website', org.website) +
          crmInfoRow('Source', org.source) + crmInfoRow('Owner', org.owner_name) +
        '</div>' +
        '<div class="crm-info-card">' +
          '<h4><i class="fas fa-map-marker-alt"></i> Address</h4>' +
          crmInfoRow('Street', org.address_street) + crmInfoRow('City', org.address_city) +
          crmInfoRow('State', org.address_state) + crmInfoRow('ZIP', org.address_zip) +
        '</div>' +
      '</div>' +

      (org.notes ? '<div class="crm-section"><h2 class="crm-section-title"><i class="fas fa-sticky-note"></i> Notes</h2><p style="white-space:pre-wrap;color:#475569;font-size:14px">' + crmEsc(org.notes) + '</p></div>' : '') +
      (org.tags ? '<div style="margin-bottom:12px"><strong>Tags:</strong> ' + org.tags.split(',').map(function(t) { return '<span class="crm-tag">' + crmEsc(t.trim()) + '</span>'; }).join(' ') + '</div>' : '') +

      // Contacts
      '<div class="crm-section">' +
        '<div class="crm-section-header"><h2 class="crm-section-title"><i class="fas fa-address-book"></i> Contacts (' + contacts.length + ')</h2>' +
          '<button class="crm-btn crm-btn-outline crm-btn-sm" onclick="crmShowNewContact(' + org.id + ')"><i class="fas fa-plus"></i> Add</button>' +
        '</div>' +
        (contacts.length === 0 ? '<p class="crm-muted">No contacts linked to this organization.</p>' :
          '<div class="crm-table-wrap"><table class="crm-table crm-table-hover"><thead><tr><th>Name</th><th>Title</th><th>Phone</th><th>Email</th><th>Status</th></tr></thead><tbody>' +
          contacts.map(function(c) {
            return '<tr class="crm-clickable" onclick="crmViewContact(' + c.id + ')">' +
              '<td><strong>' + crmEsc(c.first_name + ' ' + (c.last_name || '')) + '</strong>' + (c.is_primary ? ' <span class="crm-badge-primary">Primary</span>' : '') + '</td>' +
              '<td>' + crmEsc(c.title || '—') + '</td>' +
              '<td>' + crmEsc(c.phone || c.mobile || '—') + '</td>' +
              '<td>' + crmEsc(c.email || '—') + '</td>' +
              '<td>' + crmLeadStatusBadge(c.lead_status) + '</td>' +
            '</tr>';
          }).join('') + '</tbody></table></div>') +
      '</div>' +

      // Opportunities
      '<div class="crm-section">' +
        '<div class="crm-section-header"><h2 class="crm-section-title"><i class="fas fa-handshake"></i> Leads (' + opps.length + ')</h2></div>' +
        (opps.length === 0 ? '<p class="crm-muted">No leads yet.</p>' :
          '<div class="crm-table-wrap"><table class="crm-table crm-table-hover"><thead><tr><th>Lead</th><th>Stage</th><th>Status</th><th class="text-right">Value</th></tr></thead><tbody>' +
          opps.map(function(o) {
            return '<tr class="crm-clickable" onclick="crmViewOpp(' + o.id + ')">' +
              '<td><strong>' + crmEsc(o.name) + '</strong></td>' +
              '<td><span class="crm-stage-badge">' + crmEsc(o.stage_name || '—') + '</span></td>' +
              '<td>' + crmOppStatusBadge(o.status) + '</td>' +
              '<td class="text-right"><strong>' + crmFmt$(o.value) + '</strong></td>' +
            '</tr>';
          }).join('') + '</tbody></table></div>') +
      '</div>' +

      // Activities
      crmActivitiesSection(activities, org.id, 'organization') +
    '</div>';
}

// ==================== CONTACT DETAIL ====================
async function crmViewContact(id) {
  crmPage = 'contactDetail';
  crmRender();
  var ct = document.getElementById('crmContent');
  ct.innerHTML = '<div class="crm-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
  try {
    var resp = await crmAPI.get('/api/crm/contacts/' + id, { headers: crmHeaders() });
    crmDetailData = resp.data;
  } catch(e) { ct.innerHTML = '<div class="crm-empty"><p>Failed to load contact</p></div>'; return; }
  crmRenderContactDetail();
}

function crmRenderContactDetail() {
  var ct = document.getElementById('crmContent');
  if (!crmDetailData) return;
  var c = crmDetailData.contact;
  var opps = crmDetailData.opportunities || [];
  var activities = crmDetailData.activities || [];
  var fullName = (c.first_name || '') + ' ' + (c.last_name || '');

  ct.innerHTML =
    '<div class="crm-detail-page">' +
      '<div class="crm-detail-topbar">' +
        '<button class="crm-btn crm-btn-outline crm-btn-sm" onclick="crmGoPage(\'contacts\')"><i class="fas fa-arrow-left"></i> Back</button>' +
        '<div class="crm-detail-actions">' +
          '<button class="crm-btn crm-btn-outline crm-btn-sm" onclick="crmShowEditContact(' + c.id + ')"><i class="fas fa-edit"></i> Edit</button>' +
          '<button class="crm-btn crm-btn-primary crm-btn-sm" onclick="crmShowNewOpp(null, ' + c.id + ')"><i class="fas fa-plus"></i> New Lead</button>' +
        '</div>' +
      '</div>' +

      '<div class="crm-detail-header">' +
        '<div class="crm-detail-avatar" style="background:linear-gradient(135deg,#0EA5E9,#38BDF8)">' +
          '<i class="fas fa-user"></i>' +
        '</div>' +
        '<div>' +
          '<h2>' + crmEsc(fullName) + '</h2>' +
          '<div class="crm-detail-meta">' +
            crmLeadStatusBadge(c.lead_status) +
            (c.title ? '<span class="crm-muted" style="margin-left:8px">' + crmEsc(c.title) + '</span>' : '') +
            (c.customer_id ? '<span class="crm-badge-converted"><i class="fas fa-check-circle"></i> POS Customer #' + c.customer_id + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="crm-detail-info-grid">' +
        '<div class="crm-info-card">' +
          '<h4><i class="fas fa-info-circle"></i> Contact Info</h4>' +
          crmInfoRow('Phone', c.phone) + crmInfoRow('Mobile', c.mobile) + crmInfoRow('Email', c.email) +
          crmInfoRow('Organization', c.organization_name, c.organization_id ? 'crmViewOrg(' + c.organization_id + ')' : null) +
        '</div>' +
        '<div class="crm-info-card">' +
          '<h4><i class="fas fa-funnel-dollar"></i> Lead Info</h4>' +
          crmInfoRow('Lead Source', c.lead_source) + crmInfoRow('Lead Status', c.lead_status) +
          crmInfoRow('Owner', c.owner_name) + crmInfoRow('Primary', c.is_primary ? 'Yes' : 'No') +
        '</div>' +
      '</div>' +

      (c.notes ? '<div class="crm-section"><h2 class="crm-section-title"><i class="fas fa-sticky-note"></i> Notes</h2><p style="white-space:pre-wrap;color:#475569;font-size:14px">' + crmEsc(c.notes) + '</p></div>' : '') +
      (c.tags ? '<div style="margin-bottom:12px"><strong>Tags:</strong> ' + c.tags.split(',').map(function(t) { return '<span class="crm-tag">' + crmEsc(t.trim()) + '</span>'; }).join(' ') + '</div>' : '') +

      // Opportunities
      '<div class="crm-section">' +
        '<div class="crm-section-header"><h2 class="crm-section-title"><i class="fas fa-handshake"></i> Leads (' + opps.length + ')</h2></div>' +
        (opps.length === 0 ? '<p class="crm-muted">No leads yet.</p>' :
          '<div class="crm-table-wrap"><table class="crm-table crm-table-hover"><thead><tr><th>Lead</th><th>Stage</th><th>Status</th><th class="text-right">Value</th></tr></thead><tbody>' +
          opps.map(function(o) {
            return '<tr class="crm-clickable" onclick="crmViewOpp(' + o.id + ')">' +
              '<td><strong>' + crmEsc(o.name) + '</strong></td>' +
              '<td><span class="crm-stage-badge">' + crmEsc(o.stage_name || '—') + '</span></td>' +
              '<td>' + crmOppStatusBadge(o.status) + '</td>' +
              '<td class="text-right"><strong>' + crmFmt$(o.value) + '</strong></td>' +
            '</tr>';
          }).join('') + '</tbody></table></div>') +
      '</div>' +

      // Activities
      crmActivitiesSection(activities, c.id, 'contact') +
    '</div>';
}

// ==================== OPPORTUNITY DETAIL ====================
async function crmViewOpp(id) {
  crmPage = 'oppDetail';
  crmRender();
  var ct = document.getElementById('crmContent');
  ct.innerHTML = '<div class="crm-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
  try {
    var resp = await crmAPI.get('/api/crm/opportunities/' + id, { headers: crmHeaders() });
    crmDetailData = resp.data;
  } catch(e) { ct.innerHTML = '<div class="crm-empty"><p>Failed to load lead</p></div>'; return; }
  crmRenderOppDetail();
}

function crmRenderOppDetail() {
  var ct = document.getElementById('crmContent');
  if (!crmDetailData) return;
  var o = crmDetailData.opportunity;
  var activities = crmDetailData.activities || [];

  var stageOptions = crmStages.map(function(s) {
    return '<option value="' + s.id + '" ' + (s.id === o.stage_id ? 'selected' : '') + '>' + crmEsc(s.name) + '</option>';
  }).join('');

  ct.innerHTML =
    '<div class="crm-detail-page">' +
      '<div class="crm-detail-topbar">' +
        '<button class="crm-btn crm-btn-outline crm-btn-sm" onclick="crmGoPage(\'pipeline\')"><i class="fas fa-arrow-left"></i> Pipeline</button>' +
        '<div class="crm-detail-actions">' +
          '<button class="crm-btn crm-btn-outline crm-btn-sm" onclick="crmShowEditOpp(' + o.id + ')"><i class="fas fa-edit"></i> Edit</button>' +
          (o.status === 'open' ? '<button class="crm-btn crm-btn-sm" style="background:#059669;color:white" onclick="crmConvertOpp(' + o.id + ')"><i class="fas fa-trophy"></i> Convert to Customer</button>' : '') +
          (o.status === 'open' ? '<button class="crm-btn crm-btn-sm" style="background:#DC2626;color:white" onclick="crmLoseOpp(' + o.id + ')"><i class="fas fa-times"></i> Lost</button>' : '') +
        '</div>' +
      '</div>' +

      '<div class="crm-detail-header">' +
        '<div class="crm-detail-avatar" style="background:linear-gradient(135deg,#F59E0B,#FBBF24)">' +
          '<i class="fas fa-handshake"></i>' +
        '</div>' +
        '<div>' +
          '<h2>' + crmEsc(o.name) + '</h2>' +
          '<div class="crm-detail-meta">' +
            crmOppStatusBadge(o.status) +
            '<span class="crm-stage-badge" style="margin-left:8px">' + crmEsc(o.stage_name || '—') + '</span>' +
            (o.customer_id ? '<span class="crm-badge-converted"><i class="fas fa-check-circle"></i> POS Customer #' + o.customer_id + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +

      // Stage mover
      (o.status === 'open' ?
        '<div class="crm-stage-mover">' +
          '<label>Move to stage:</label>' +
          '<select class="crm-select" onchange="crmMoveOppToStage(' + o.id + ', this.value)">' + stageOptions + '</select>' +
        '</div>' : '') +

      '<div class="crm-detail-info-grid">' +
        '<div class="crm-info-card">' +
          '<h4><i class="fas fa-dollar-sign"></i> Lead Info</h4>' +
          crmInfoRow('Value', crmFmt$(o.value)) + crmInfoRow('Probability', (o.probability || 0) + '%') +
          crmInfoRow('Close Date', crmFmtDate(o.close_date)) + crmInfoRow('Source', o.source) +
        '</div>' +
        '<div class="crm-info-card">' +
          '<h4><i class="fas fa-link"></i> Related</h4>' +
          crmInfoRow('Organization', o.org_name, o.organization_id ? 'crmViewOrg(' + o.organization_id + ')' : null) +
          crmInfoRow('Contact', o.contact_name && o.contact_name.trim() ? o.contact_name : null, o.contact_id ? 'crmViewContact(' + o.contact_id + ')' : null) +
          crmInfoRow('Sales Rep', o.owner_name) +
          (o.won_at ? crmInfoRow('Won At', crmFmtDateTime(o.won_at)) : '') +
          (o.lost_reason ? crmInfoRow('Lost Reason', o.lost_reason) : '') +
        '</div>' +
      '</div>' +

      (o.notes ? '<div class="crm-section"><h2 class="crm-section-title"><i class="fas fa-sticky-note"></i> Notes</h2><p style="white-space:pre-wrap;color:#475569;font-size:14px">' + crmEsc(o.notes) + '</p></div>' : '') +

      // Activities
      crmActivitiesSection(activities, o.id, 'opportunity') +
    '</div>';
}

async function crmMoveOppToStage(oppId, stageId) {
  try {
    var resp = await crmAPI.post('/api/crm/opportunities/' + oppId + '/move', { stage_id: parseInt(stageId) }, { headers: crmHeaders() });
    crmToast('Moved to ' + (resp.data.stage_name || 'stage'));
    crmViewOpp(oppId);
  } catch(e) { crmToast('Failed to move', 'error'); }
}

async function crmConvertOpp(oppId) {
  if (!confirm('Convert this lead to a POS customer?\n\nThis will:\n- Create a customer record\n- Mark the lead as WON\n- Link the organization and contact')) return;
  try {
    var resp = await crmAPI.post('/api/crm/opportunities/' + oppId + '/convert', {}, { headers: crmHeaders() });
    crmToast('Converted! Customer #' + resp.data.customer_id + ' created: ' + resp.data.business_name);
    crmViewOpp(oppId);
  } catch(e) { crmToast('Conversion failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

async function crmLoseOpp(oppId) {
  var reason = prompt('Reason for losing this lead (optional):');
  if (reason === null) return;
  try {
    await crmAPI.put('/api/crm/opportunities/' + oppId, { status: 'lost', lost_reason: reason || null }, { headers: crmHeaders() });
    crmToast('Lead marked as lost');
    crmViewOpp(oppId);
  } catch(e) { crmToast('Failed to update', 'error'); }
}

// ==================== ACTIVITIES SECTION (reusable) ====================
function crmActivitiesSection(activities, entityId, entityType) {
  var actTypesMap = { note: { icon: 'fa-sticky-note', cls: 'crm-activity-note' }, call: { icon: 'fa-phone', cls: 'crm-activity-call' }, email: { icon: 'fa-envelope', cls: 'crm-activity-email' }, meeting: { icon: 'fa-calendar', cls: 'crm-activity-meeting' }, task: { icon: 'fa-clipboard-check', cls: 'crm-activity-task' } };

  return '<div class="crm-section">' +
    '<div class="crm-section-header"><h2 class="crm-section-title"><i class="fas fa-stream"></i> Activities (' + activities.length + ')</h2>' +
      '<button class="crm-btn crm-btn-outline crm-btn-sm" onclick="crmShowNewActivity(\'' + entityType + '\', ' + entityId + ')"><i class="fas fa-plus"></i> Log</button>' +
    '</div>' +
    (activities.length === 0 ? '<p class="crm-muted">No activities logged yet.</p>' :
      '<div class="crm-activity-list">' +
      activities.map(function(a) {
        var t = actTypesMap[a.activity_type] || actTypesMap.note;
        return '<div class="crm-activity-item ' + (a.completed ? 'crm-activity-done' : '') + '">' +
          '<div class="crm-activity-icon ' + t.cls + '"><i class="fas ' + t.icon + '"></i></div>' +
          '<div class="crm-activity-body">' +
            '<div class="crm-activity-subject">' + crmEsc(a.subject || a.activity_type) + '</div>' +
            (a.body ? '<div class="crm-activity-body-text">' + crmEsc(a.body) + '</div>' : '') +
            '<div class="crm-activity-meta">' +
              '<span>' + crmEsc(a.activity_type) + '</span>' +
              '<span>' + crmFmtDateTime(a.created_at) + '</span>' +
              (a.owner_name ? '<span>by ' + crmEsc(a.owner_name) + '</span>' : '') +
              (a.due_date ? '<span>Due: ' + crmFmtDate(a.due_date) + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="crm-activity-actions">' +
            (!a.completed ? '<button class="crm-btn crm-btn-xs crm-btn-outline" onclick="crmCompleteActivity(' + a.id + ')" title="Complete"><i class="fas fa-check"></i></button>' : '') +
            '<button class="crm-btn crm-btn-xs crm-btn-outline" onclick="crmDeleteActivity(' + a.id + ')" title="Delete"><i class="fas fa-trash"></i></button>' +
          '</div>' +
        '</div>';
      }).join('') +
      '</div>') +
  '</div>';
}

async function crmCompleteActivity(id) {
  try {
    await crmAPI.put('/api/crm/activities/' + id, { completed: 1 }, { headers: crmHeaders() });
    crmToast('Activity completed');
    // Refresh current page
    if (crmPage === 'dashboard') crmRenderDashboard();
    else if (crmPage === 'orgDetail' && crmDetailData) crmViewOrg(crmDetailData.organization.id);
    else if (crmPage === 'contactDetail' && crmDetailData) crmViewContact(crmDetailData.contact.id);
    else if (crmPage === 'oppDetail' && crmDetailData) crmViewOpp(crmDetailData.opportunity.id);
  } catch(e) { crmToast('Failed', 'error'); }
}

async function crmDeleteActivity(id) {
  if (!confirm('Delete this activity?')) return;
  try {
    await crmAPI.delete('/api/crm/activities/' + id, { headers: crmHeaders() });
    crmToast('Deleted');
    if (crmPage === 'orgDetail' && crmDetailData) crmViewOrg(crmDetailData.organization.id);
    else if (crmPage === 'contactDetail' && crmDetailData) crmViewContact(crmDetailData.contact.id);
    else if (crmPage === 'oppDetail' && crmDetailData) crmViewOpp(crmDetailData.opportunity.id);
  } catch(e) { crmToast('Failed', 'error'); }
}

// ==================== BADGE HELPERS ====================
function crmOrgTypeBadge(t) {
  var colors = { prospect: 'background:#FEF3C7;color:#92400E', customer: 'background:#D1FAE5;color:#065F46', vendor: 'background:#DBEAFE;color:#1E40AF', partner: 'background:#E0E7FF;color:#3730A3', other: 'background:#F1F5F9;color:#475569' };
  return '<span class="crm-type-badge" style="' + (colors[t] || colors.other) + '">' + crmEsc(t || 'other') + '</span>';
}

function crmLeadStatusBadge(s) {
  var colors = { new: 'background:#DBEAFE;color:#1E40AF', contacted: 'background:#FEF3C7;color:#92400E', qualified: 'background:#D1FAE5;color:#065F46', unqualified: 'background:#FEE2E2;color:#991B1B', converted: 'background:#D1FAE5;color:#065F46', lost: 'background:#FEE2E2;color:#991B1B' };
  return '<span class="crm-type-badge" style="' + (colors[s] || colors.new) + '">' + crmEsc(s || 'new') + '</span>';
}

function crmOppStatusBadge(s) {
  var colors = { open: 'background:#DBEAFE;color:#1E40AF', won: 'background:#D1FAE5;color:#065F46', lost: 'background:#FEE2E2;color:#991B1B', abandoned: 'background:#F1F5F9;color:#475569' };
  return '<span class="crm-type-badge" style="' + (colors[s] || colors.open) + '">' + crmEsc(s || 'open') + '</span>';
}

function crmInfoRow(label, value, onclick) {
  if (!value && value !== 0) return '<div class="crm-info-row"><span class="crm-muted">' + label + '</span><span class="crm-muted">—</span></div>';
  if (onclick) {
    return '<div class="crm-info-row"><span class="crm-muted">' + label + '</span><a href="#" onclick="event.preventDefault();' + onclick + '" style="color:#6366F1;font-weight:600;text-decoration:none">' + crmEsc(String(value)) + '</a></div>';
  }
  return '<div class="crm-info-row"><span class="crm-muted">' + label + '</span><span>' + crmEsc(String(value)) + '</span></div>';
}

function crmPaginationHtml(offset, total, pageSize, fnName) {
  if (total <= pageSize) return '';
  var page = Math.floor(offset / pageSize) + 1;
  var totalPages = Math.ceil(total / pageSize);
  return '<div class="crm-pagination">' +
    '<button class="crm-btn crm-btn-outline crm-btn-sm" ' + (offset === 0 ? 'disabled' : '') + ' onclick="' + fnName + '(\'prev\')"><i class="fas fa-chevron-left"></i></button>' +
    '<span class="crm-muted">Page ' + page + ' of ' + totalPages + '</span>' +
    '<button class="crm-btn crm-btn-outline crm-btn-sm" ' + (offset + pageSize >= total ? 'disabled' : '') + ' onclick="' + fnName + '(\'next\')"><i class="fas fa-chevron-right"></i></button>' +
  '</div>';
}

// ==================== MODAL HELPERS ====================
function crmShowModal(title, bodyHtml, footerHtml) {
  var existing = document.querySelector('.crm-modal-overlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.className = 'crm-modal-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) crmCloseModal(); };
  overlay.innerHTML =
    '<div class="crm-modal">' +
      '<div class="crm-modal-header"><h3>' + title + '</h3><button class="crm-modal-close" onclick="crmCloseModal()">&times;</button></div>' +
      '<div class="crm-modal-body">' + bodyHtml + '</div>' +
      (footerHtml ? '<div class="crm-modal-footer">' + footerHtml + '</div>' : '') +
    '</div>';
  document.body.appendChild(overlay);
  requestAnimationFrame(function() { overlay.classList.add('crm-modal-show'); });
}

function crmCloseModal() {
  var overlay = document.querySelector('.crm-modal-overlay');
  if (overlay) { overlay.style.opacity = '0'; setTimeout(function() { overlay.remove(); }, 200); }
}

// ==================== NEW/EDIT ORGANIZATION ====================
function crmShowNewOrg() {
  crmShowModal('<i class="fas fa-building" style="color:#6366F1"></i> New Organization',
    '<div class="crm-edit-form">' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>Name *</label><input class="crm-input" id="crmOrgName" placeholder="Organization name"></div>' +
        '<div class="crm-form-group"><label>Type</label><select class="crm-input" id="crmOrgType"><option value="prospect">Prospect</option><option value="customer">Customer</option><option value="vendor">Vendor</option><option value="partner">Partner</option><option value="other">Other</option></select></div>' +
      '</div>' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>Phone</label><input class="crm-input" id="crmOrgPhone" placeholder="Phone"></div>' +
        '<div class="crm-form-group"><label>Email</label><input class="crm-input" id="crmOrgEmail" placeholder="Email"></div>' +
      '</div>' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>Website</label><input class="crm-input" id="crmOrgWebsite" placeholder="Website"></div>' +
        '<div class="crm-form-group"><label>Industry</label><input class="crm-input" id="crmOrgIndustry" value="equestrian" placeholder="Industry"></div>' +
      '</div>' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>Street</label><input class="crm-input" id="crmOrgStreet" placeholder="Street address"></div>' +
      '</div>' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>City</label><input class="crm-input" id="crmOrgCity" placeholder="City"></div>' +
        '<div class="crm-form-group"><label>State</label><input class="crm-input" id="crmOrgState" value="FL" placeholder="State"></div>' +
        '<div class="crm-form-group"><label>ZIP</label><input class="crm-input" id="crmOrgZip" placeholder="ZIP"></div>' +
      '</div>' +
      '<div class="crm-form-group"><label>Source</label><input class="crm-input" id="crmOrgSource" placeholder="e.g. Referral, Trade Show, Website"></div>' +
      '<div class="crm-form-group"><label>Notes</label><textarea class="crm-input" id="crmOrgNotes" rows="3" placeholder="Notes..."></textarea></div>' +
    '</div>',
    '<button class="crm-btn crm-btn-outline" onclick="crmCloseModal()">Cancel</button>' +
    '<button class="crm-btn crm-btn-primary" onclick="crmCreateOrg()"><i class="fas fa-save"></i> Create</button>'
  );
}

async function crmCreateOrg() {
  var name = document.getElementById('crmOrgName').value.trim();
  if (!name) { crmToast('Name is required', 'error'); return; }
  try {
    var resp = await crmAPI.post('/api/crm/organizations', {
      name: name,
      org_type: document.getElementById('crmOrgType').value,
      phone: document.getElementById('crmOrgPhone').value || null,
      email: document.getElementById('crmOrgEmail').value || null,
      website: document.getElementById('crmOrgWebsite').value || null,
      industry: document.getElementById('crmOrgIndustry').value || null,
      address_street: document.getElementById('crmOrgStreet').value || null,
      address_city: document.getElementById('crmOrgCity').value || null,
      address_state: document.getElementById('crmOrgState').value || null,
      address_zip: document.getElementById('crmOrgZip').value || null,
      source: document.getElementById('crmOrgSource').value || null,
      notes: document.getElementById('crmOrgNotes').value || null
    }, { headers: crmHeaders() });
    crmToast('Organization created');
    crmCloseModal();
    crmViewOrg(resp.data.id);
  } catch(e) { crmToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

async function crmShowEditOrg(id) {
  var resp = await crmAPI.get('/api/crm/organizations/' + id, { headers: crmHeaders() });
  var org = resp.data.organization;

  crmShowModal('<i class="fas fa-edit" style="color:#6366F1"></i> Edit Organization',
    '<div class="crm-edit-form">' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>Name *</label><input class="crm-input" id="crmOrgName" value="' + crmEsc(org.name) + '"></div>' +
        '<div class="crm-form-group"><label>Type</label><select class="crm-input" id="crmOrgType">' +
          ['prospect','customer','vendor','partner','other'].map(function(t) { return '<option value="' + t + '" ' + (org.org_type === t ? 'selected' : '') + '>' + t + '</option>'; }).join('') +
        '</select></div>' +
      '</div>' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>Phone</label><input class="crm-input" id="crmOrgPhone" value="' + crmEsc(org.phone || '') + '"></div>' +
        '<div class="crm-form-group"><label>Email</label><input class="crm-input" id="crmOrgEmail" value="' + crmEsc(org.email || '') + '"></div>' +
      '</div>' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>Website</label><input class="crm-input" id="crmOrgWebsite" value="' + crmEsc(org.website || '') + '"></div>' +
        '<div class="crm-form-group"><label>Industry</label><input class="crm-input" id="crmOrgIndustry" value="' + crmEsc(org.industry || '') + '"></div>' +
      '</div>' +
      '<div class="crm-form-row"><div class="crm-form-group"><label>Street</label><input class="crm-input" id="crmOrgStreet" value="' + crmEsc(org.address_street || '') + '"></div></div>' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>City</label><input class="crm-input" id="crmOrgCity" value="' + crmEsc(org.address_city || '') + '"></div>' +
        '<div class="crm-form-group"><label>State</label><input class="crm-input" id="crmOrgState" value="' + crmEsc(org.address_state || '') + '"></div>' +
        '<div class="crm-form-group"><label>ZIP</label><input class="crm-input" id="crmOrgZip" value="' + crmEsc(org.address_zip || '') + '"></div>' +
      '</div>' +
      '<div class="crm-form-group"><label>Source</label><input class="crm-input" id="crmOrgSource" value="' + crmEsc(org.source || '') + '"></div>' +
      '<div class="crm-form-group"><label>Notes</label><textarea class="crm-input" id="crmOrgNotes" rows="3">' + crmEsc(org.notes || '') + '</textarea></div>' +
    '</div>',
    '<button class="crm-btn crm-btn-outline" onclick="crmCloseModal()">Cancel</button>' +
    '<button class="crm-btn crm-btn-primary" onclick="crmSaveOrg(' + id + ')"><i class="fas fa-save"></i> Save</button>'
  );
}

async function crmSaveOrg(id) {
  var name = document.getElementById('crmOrgName').value.trim();
  if (!name) { crmToast('Name is required', 'error'); return; }
  try {
    await crmAPI.put('/api/crm/organizations/' + id, {
      name: name,
      org_type: document.getElementById('crmOrgType').value,
      phone: document.getElementById('crmOrgPhone').value || null,
      email: document.getElementById('crmOrgEmail').value || null,
      website: document.getElementById('crmOrgWebsite').value || null,
      industry: document.getElementById('crmOrgIndustry').value || null,
      address_street: document.getElementById('crmOrgStreet').value || null,
      address_city: document.getElementById('crmOrgCity').value || null,
      address_state: document.getElementById('crmOrgState').value || null,
      address_zip: document.getElementById('crmOrgZip').value || null,
      source: document.getElementById('crmOrgSource').value || null,
      notes: document.getElementById('crmOrgNotes').value || null
    }, { headers: crmHeaders() });
    crmToast('Saved');
    crmCloseModal();
    crmViewOrg(id);
  } catch(e) { crmToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// ==================== NEW/EDIT CONTACT ====================
async function crmShowNewContact(orgId) {
  await crmFetchAllOrgs();
  crmShowModal('<i class="fas fa-user-plus" style="color:#0EA5E9"></i> New Contact',
    '<div class="crm-edit-form">' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>First Name *</label><input class="crm-input" id="crmConFirst" placeholder="First name"></div>' +
        '<div class="crm-form-group"><label>Last Name</label><input class="crm-input" id="crmConLast" placeholder="Last name"></div>' +
      '</div>' +
      '<div class="crm-form-group"><label>Title</label><input class="crm-input" id="crmConTitle" placeholder="e.g. Barn Manager, Owner"></div>' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>Phone</label><input class="crm-input" id="crmConPhone" placeholder="Phone"></div>' +
        '<div class="crm-form-group"><label>Mobile</label><input class="crm-input" id="crmConMobile" placeholder="Mobile"></div>' +
      '</div>' +
      '<div class="crm-form-group"><label>Email</label><input class="crm-input" id="crmConEmail" placeholder="Email"></div>' +
      '<div class="crm-form-group"><label>Organization</label>' + crmOrgSelectHtml('crmConOrgId', orgId) + '</div>' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>Lead Source</label><input class="crm-input" id="crmConSource" placeholder="e.g. Referral, Walk-In"></div>' +
        '<div class="crm-form-group"><label>Lead Status</label><select class="crm-input" id="crmConStatus"><option value="new">New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="unqualified">Unqualified</option></select></div>' +
      '</div>' +
      '<div class="crm-form-group"><label>Notes</label><textarea class="crm-input" id="crmConNotes" rows="3" placeholder="Notes..."></textarea></div>' +
    '</div>',
    '<button class="crm-btn crm-btn-outline" onclick="crmCloseModal()">Cancel</button>' +
    '<button class="crm-btn crm-btn-primary" onclick="crmCreateContact()"><i class="fas fa-save"></i> Create</button>'
  );
}

async function crmCreateContact() {
  var first = document.getElementById('crmConFirst').value.trim();
  if (!first) { crmToast('First name is required', 'error'); return; }
  try {
    var resp = await crmAPI.post('/api/crm/contacts', {
      first_name: first,
      last_name: document.getElementById('crmConLast').value || null,
      title: document.getElementById('crmConTitle').value || null,
      phone: document.getElementById('crmConPhone').value || null,
      mobile: document.getElementById('crmConMobile').value || null,
      email: document.getElementById('crmConEmail').value || null,
      organization_id: parseInt(document.getElementById('crmConOrgId').value) || null,
      lead_source: document.getElementById('crmConSource').value || null,
      lead_status: document.getElementById('crmConStatus').value || 'new',
      notes: document.getElementById('crmConNotes').value || null
    }, { headers: crmHeaders() });
    crmToast('Contact created');
    crmCloseModal();
    crmViewContact(resp.data.id);
  } catch(e) { crmToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

async function crmShowEditContact(id) {
  await crmFetchAllOrgs();
  var resp = await crmAPI.get('/api/crm/contacts/' + id, { headers: crmHeaders() });
  var c = resp.data.contact;

  crmShowModal('<i class="fas fa-edit" style="color:#0EA5E9"></i> Edit Contact',
    '<div class="crm-edit-form">' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>First Name *</label><input class="crm-input" id="crmConFirst" value="' + crmEsc(c.first_name) + '"></div>' +
        '<div class="crm-form-group"><label>Last Name</label><input class="crm-input" id="crmConLast" value="' + crmEsc(c.last_name || '') + '"></div>' +
      '</div>' +
      '<div class="crm-form-group"><label>Title</label><input class="crm-input" id="crmConTitle" value="' + crmEsc(c.title || '') + '"></div>' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>Phone</label><input class="crm-input" id="crmConPhone" value="' + crmEsc(c.phone || '') + '"></div>' +
        '<div class="crm-form-group"><label>Mobile</label><input class="crm-input" id="crmConMobile" value="' + crmEsc(c.mobile || '') + '"></div>' +
      '</div>' +
      '<div class="crm-form-group"><label>Email</label><input class="crm-input" id="crmConEmail" value="' + crmEsc(c.email || '') + '"></div>' +
      '<div class="crm-form-group"><label>Organization</label>' + crmOrgSelectHtml('crmConOrgId', c.organization_id) + '</div>' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>Lead Source</label><input class="crm-input" id="crmConSource" value="' + crmEsc(c.lead_source || '') + '"></div>' +
        '<div class="crm-form-group"><label>Lead Status</label><select class="crm-input" id="crmConStatus">' +
          ['new','contacted','qualified','unqualified','converted','lost'].map(function(s) { return '<option value="' + s + '" ' + (c.lead_status === s ? 'selected' : '') + '>' + s + '</option>'; }).join('') +
        '</select></div>' +
      '</div>' +
      '<div class="crm-form-group"><label>Notes</label><textarea class="crm-input" id="crmConNotes" rows="3">' + crmEsc(c.notes || '') + '</textarea></div>' +
    '</div>',
    '<button class="crm-btn crm-btn-outline" onclick="crmCloseModal()">Cancel</button>' +
    '<button class="crm-btn crm-btn-primary" onclick="crmSaveContact(' + id + ')"><i class="fas fa-save"></i> Save</button>'
  );
}

async function crmSaveContact(id) {
  var first = document.getElementById('crmConFirst').value.trim();
  if (!first) { crmToast('First name is required', 'error'); return; }
  try {
    await crmAPI.put('/api/crm/contacts/' + id, {
      first_name: first,
      last_name: document.getElementById('crmConLast').value || null,
      title: document.getElementById('crmConTitle').value || null,
      phone: document.getElementById('crmConPhone').value || null,
      mobile: document.getElementById('crmConMobile').value || null,
      email: document.getElementById('crmConEmail').value || null,
      organization_id: parseInt(document.getElementById('crmConOrgId').value) || null,
      lead_source: document.getElementById('crmConSource').value || null,
      lead_status: document.getElementById('crmConStatus').value,
      notes: document.getElementById('crmConNotes').value || null
    }, { headers: crmHeaders() });
    crmToast('Saved');
    crmCloseModal();
    crmViewContact(id);
  } catch(e) { crmToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// ==================== NEW/EDIT OPPORTUNITY ====================
async function crmShowNewOpp(orgId, contactId) {
  await crmFetchAllOrgs();
  await crmFetchAllUsers();
  var stageOpts = crmStages.filter(function(s) { return s.stage_type === 'open'; }).map(function(s) {
    return '<option value="' + s.id + '">' + crmEsc(s.name) + '</option>';
  }).join('');

  crmShowModal('<i class="fas fa-handshake" style="color:#F59E0B"></i> New Lead',
    '<div class="crm-edit-form">' +
      '<div class="crm-form-group"><label>Lead Name *</label><input class="crm-input" id="crmOppName" placeholder="e.g. Monthly Feed Supply"></div>' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>Est. Value ($)</label><input class="crm-input" id="crmOppValue" type="number" step="0.01" value="0" placeholder="Estimated value"></div>' +
        '<div class="crm-form-group"><label>Close Date</label><input class="crm-input" id="crmOppCloseDate" type="date"></div>' +
      '</div>' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>Organization</label>' + crmOrgSelectHtml('crmOppOrgId', orgId) + '</div>' +
        '<div class="crm-form-group"><label>Contact ID</label><input class="crm-input" id="crmOppContactId" value="' + (contactId || '') + '" placeholder="Contact ID"></div>' +
      '</div>' +
      '<div class="crm-form-group"><label>Stage</label><select class="crm-input" id="crmOppStage">' + stageOpts + '</select></div>' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>Sales Rep</label>' + crmUserSelectHtml('crmOppOwner', crmUser ? crmUser.id : '') + '</div>' +
        '<div class="crm-form-group"><label>Source</label><input class="crm-input" id="crmOppSource" placeholder="e.g. Referral, Cold Call"></div>' +
      '</div>' +
      '<div class="crm-form-group"><label>Notes</label><textarea class="crm-input" id="crmOppNotes" rows="3" placeholder="Notes..."></textarea></div>' +
    '</div>',
    '<button class="crm-btn crm-btn-outline" onclick="crmCloseModal()">Cancel</button>' +
    '<button class="crm-btn crm-btn-primary" onclick="crmCreateOpp()"><i class="fas fa-save"></i> Create</button>'
  );
}

async function crmCreateOpp() {
  var name = document.getElementById('crmOppName').value.trim();
  if (!name) { crmToast('Lead name is required', 'error'); return; }
  try {
    var resp = await crmAPI.post('/api/crm/opportunities', {
      name: name,
      value: parseFloat(document.getElementById('crmOppValue').value) || 0,
      close_date: document.getElementById('crmOppCloseDate').value || null,
      organization_id: parseInt(document.getElementById('crmOppOrgId').value) || null,
      contact_id: parseInt(document.getElementById('crmOppContactId').value) || null,
      stage_id: parseInt(document.getElementById('crmOppStage').value) || null,
      pipeline_id: 1,
      source: document.getElementById('crmOppSource').value || null,
      notes: document.getElementById('crmOppNotes').value || null,
      owner_id: parseInt(document.getElementById('crmOppOwner').value) || null
    }, { headers: crmHeaders() });
    crmToast('Lead created');
    crmCloseModal();
    crmViewOpp(resp.data.id);
  } catch(e) { crmToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

async function crmShowEditOpp(id) {
  await crmFetchAllOrgs();
  await crmFetchAllUsers();
  var resp = await crmAPI.get('/api/crm/opportunities/' + id, { headers: crmHeaders() });
  var o = resp.data.opportunity;

  var stageOpts = crmStages.map(function(s) {
    return '<option value="' + s.id + '" ' + (o.stage_id === s.id ? 'selected' : '') + '>' + crmEsc(s.name) + '</option>';
  }).join('');

  crmShowModal('<i class="fas fa-edit" style="color:#F59E0B"></i> Edit Lead',
    '<div class="crm-edit-form">' +
      '<div class="crm-form-group"><label>Lead Name *</label><input class="crm-input" id="crmOppName" value="' + crmEsc(o.name) + '"></div>' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>Value ($)</label><input class="crm-input" id="crmOppValue" type="number" step="0.01" value="' + (o.value || 0) + '"></div>' +
        '<div class="crm-form-group"><label>Close Date</label><input class="crm-input" id="crmOppCloseDate" type="date" value="' + (o.close_date || '') + '"></div>' +
      '</div>' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>Organization</label>' + crmOrgSelectHtml('crmOppOrgId', o.organization_id) + '</div>' +
        '<div class="crm-form-group"><label>Contact ID</label><input class="crm-input" id="crmOppContactId" value="' + (o.contact_id || '') + '"></div>' +
      '</div>' +
      '<div class="crm-form-group"><label>Stage</label><select class="crm-input" id="crmOppStage">' + stageOpts + '</select></div>' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>Sales Rep</label>' + crmUserSelectHtml('crmOppOwner', o.owner_id) + '</div>' +
        '<div class="crm-form-group"><label>Source</label><input class="crm-input" id="crmOppSource" value="' + crmEsc(o.source || '') + '"></div>' +
      '</div>' +
      '<div class="crm-form-group"><label>Notes</label><textarea class="crm-input" id="crmOppNotes" rows="3">' + crmEsc(o.notes || '') + '</textarea></div>' +
    '</div>',
    '<button class="crm-btn crm-btn-outline" onclick="crmCloseModal()">Cancel</button>' +
    '<button class="crm-btn crm-btn-primary" onclick="crmSaveOpp(' + id + ')"><i class="fas fa-save"></i> Save</button>'
  );
}

async function crmSaveOpp(id) {
  var name = document.getElementById('crmOppName').value.trim();
  if (!name) { crmToast('Lead name is required', 'error'); return; }
  try {
    await crmAPI.put('/api/crm/opportunities/' + id, {
      name: name,
      value: parseFloat(document.getElementById('crmOppValue').value) || 0,
      close_date: document.getElementById('crmOppCloseDate').value || null,
      organization_id: parseInt(document.getElementById('crmOppOrgId').value) || null,
      contact_id: parseInt(document.getElementById('crmOppContactId').value) || null,
      stage_id: parseInt(document.getElementById('crmOppStage').value) || null,
      source: document.getElementById('crmOppSource').value || null,
      notes: document.getElementById('crmOppNotes').value || null,
      owner_id: parseInt(document.getElementById('crmOppOwner').value) || null
    }, { headers: crmHeaders() });
    crmToast('Saved');
    crmCloseModal();
    crmViewOpp(id);
  } catch(e) { crmToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// ==================== NEW ACTIVITY ====================
async function crmShowNewActivity(entityType, entityId) {
  await crmFetchAllOrgs();
  crmShowModal('<i class="fas fa-stream" style="color:#059669"></i> Log Activity',
    '<div class="crm-edit-form">' +
      '<div class="crm-form-row">' +
        '<div class="crm-form-group"><label>Type</label><select class="crm-input" id="crmActType"><option value="note">Note</option><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="task">Task</option></select></div>' +
        '<div class="crm-form-group"><label>Due Date</label><input class="crm-input" id="crmActDue" type="date"></div>' +
      '</div>' +
      '<div class="crm-form-group"><label>Subject</label><input class="crm-input" id="crmActSubject" placeholder="Brief subject"></div>' +
      '<div class="crm-form-group"><label>Details</label><textarea class="crm-input" id="crmActBody" rows="4" placeholder="Details..."></textarea></div>' +
      (entityType && entityId ? '<input type="hidden" id="crmActEntityType" value="' + entityType + '"><input type="hidden" id="crmActEntityId" value="' + entityId + '">' : 
        '<div class="crm-form-row">' +
          '<div class="crm-form-group"><label>Contact ID</label><input class="crm-input" id="crmActContactId" placeholder="(optional)"></div>' +
          '<div class="crm-form-group"><label>Organization</label>' + crmOrgSelectHtml('crmActOrgId') + '</div>' +
          '<div class="crm-form-group"><label>Lead ID</label><input class="crm-input" id="crmActOppId" placeholder="(optional)"></div>' +
        '</div>') +
    '</div>',
    '<button class="crm-btn crm-btn-outline" onclick="crmCloseModal()">Cancel</button>' +
    '<button class="crm-btn crm-btn-primary" onclick="crmCreateActivity()"><i class="fas fa-save"></i> Log</button>'
  );
}

async function crmCreateActivity() {
  var payload = {
    activity_type: document.getElementById('crmActType').value,
    subject: document.getElementById('crmActSubject').value || null,
    body: document.getElementById('crmActBody').value || null,
    due_date: document.getElementById('crmActDue').value || null
  };

  var etEl = document.getElementById('crmActEntityType');
  var eiEl = document.getElementById('crmActEntityId');
  if (etEl && eiEl) {
    var et = etEl.value;
    var ei = parseInt(eiEl.value);
    if (et === 'contact') payload.contact_id = ei;
    else if (et === 'organization') payload.organization_id = ei;
    else if (et === 'opportunity') payload.opportunity_id = ei;
  } else {
    var cid = document.getElementById('crmActContactId');
    var oid = document.getElementById('crmActOrgId');
    var opid = document.getElementById('crmActOppId');
    if (cid && cid.value) payload.contact_id = parseInt(cid.value);
    if (oid && oid.value) payload.organization_id = parseInt(oid.value);
    if (opid && opid.value) payload.opportunity_id = parseInt(opid.value);
  }

  try {
    await crmAPI.post('/api/crm/activities', payload, { headers: crmHeaders() });
    crmToast('Activity logged');
    crmCloseModal();
    // Refresh current view
    if (crmPage === 'dashboard') crmRenderDashboard();
    else if (crmPage === 'orgDetail' && crmDetailData) crmViewOrg(crmDetailData.organization.id);
    else if (crmPage === 'contactDetail' && crmDetailData) crmViewContact(crmDetailData.contact.id);
    else if (crmPage === 'oppDetail' && crmDetailData) crmViewOpp(crmDetailData.opportunity.id);
  } catch(e) { crmToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}
