// BF Ops - Tasks & Notifications Module
var tkAPI = axios.create({ baseURL: '' });
var tkUser = null;
var tkPage = 'dashboard';
var tkTasks = [];
var tkSummary = {};
var tkCurrentTask = null;
var tkNotifications = [];

function tkGetToken() { return localStorage.getItem('bf_ops_token') || localStorage.getItem('bf_token') || ''; }
function tkHeaders() { return { Authorization: 'Bearer ' + tkGetToken() }; }

function tkToast(msg, type) {
  type = type || 'success';
  var t = document.createElement('div');
  t.className = 'po-toast po-toast-' + type;
  t.innerHTML = '<i class="fas fa-' + (type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'check-circle') + '"></i> ' + msg;
  document.body.appendChild(t);
  setTimeout(function() { t.classList.add('po-toast-show'); }, 10);
  setTimeout(function() { t.classList.remove('po-toast-show'); setTimeout(function() { t.remove(); }, 300); }, 3000);
}

// ==================== INIT ====================
window._tasksInit = function() {
  var savedUser = localStorage.getItem('bf_ops_user') || localStorage.getItem('bf_user');
  if (savedUser) { try { tkUser = JSON.parse(savedUser); } catch(e) { tkUser = null; } }
  tkPage = 'dashboard';
  if (window._shellInitialPage) {
    tkPage = window._shellInitialPage;
    window._shellInitialPage = null;
  }
  tkRender();
};

window._tasksCleanup = function() { tkUser = null; tkPage = 'dashboard'; tkTasks = []; };

// ==================== NAV ====================
function tkNav(page, data) { tkPage = page; tkCurrentTask = data || null; tkRender(); }

function tkRenderNav() {
  var pages = [
    { id: 'dashboard', icon: 'fa-chart-line', label: 'Dashboard' },
    { id: 'my-tasks', icon: 'fa-user', label: 'My Tasks' },
    { id: 'all-tasks', icon: 'fa-list-check', label: 'All Tasks' },
    { id: 'pricing-alerts', icon: 'fa-dollar-sign', label: 'Price Alerts' },
    { id: 'notifications', icon: 'fa-bell', label: 'Notifications' },
  ];
  return '<div class="tk-nav">' +
    '<div class="tk-nav-scroll">' +
    pages.map(function(p) {
      return '<button class="tk-nav-btn' + (tkPage === p.id ? ' active' : '') + '" onclick="tkNav(\'' + p.id + '\')">' +
        '<i class="fas ' + p.icon + '"></i><span>' + p.label + '</span></button>';
    }).join('') +
    '</div>' +
    '<button class="tk-btn tk-btn-primary tk-btn-sm" onclick="tkShowCreateTask()" style="margin-left:auto;white-space:nowrap"><i class="fas fa-plus"></i> New Task</button>' +
    '</div>';
}

// ==================== MAIN RENDER ====================
async function tkRender() {
  var root = document.getElementById('tasks-app');
  if (!root) return;
  root.innerHTML = '<div class="tk-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

  try {
    if (tkPage === 'dashboard') {
      var resp = await tkAPI.get('/api/tasks/summary' + (tkUser ? '?user_id=' + tkUser.id : ''), { headers: tkHeaders() });
      tkSummary = resp.data;
      root = document.getElementById('tasks-app'); if (!root) return;
      root.innerHTML = tkRenderNav() + tkRenderDashboard();
    } else if (tkPage === 'my-tasks') {
      var resp = await tkAPI.get('/api/tasks?assigned_to=' + (tkUser ? tkUser.id : ''), { headers: tkHeaders() });
      tkTasks = resp.data.tasks || [];
      root = document.getElementById('tasks-app'); if (!root) return;
      root.innerHTML = tkRenderNav() + tkRenderTaskList('My Tasks');
    } else if (tkPage === 'all-tasks') {
      var resp = await tkAPI.get('/api/tasks', { headers: tkHeaders() });
      tkTasks = resp.data.tasks || [];
      root = document.getElementById('tasks-app'); if (!root) return;
      root.innerHTML = tkRenderNav() + tkRenderTaskList('All Tasks');
    } else if (tkPage === 'task-detail') {
      var resp = await tkAPI.get('/api/tasks/' + tkCurrentTask, { headers: tkHeaders() });
      root = document.getElementById('tasks-app'); if (!root) return;
      root.innerHTML = tkRenderNav() + tkRenderTaskDetail(resp.data);
    } else if (tkPage === 'pricing-alerts') {
      var resp = await tkAPI.get('/api/purchasing/pricing-alerts', { headers: tkHeaders() });
      root = document.getElementById('tasks-app'); if (!root) return;
      root.innerHTML = tkRenderNav() + tkRenderPricingAlerts(resp.data.alerts || []);
    } else if (tkPage === 'notifications') {
      var resp = await tkAPI.get('/api/notifications' + (tkUser ? '?user_id=' + tkUser.id : ''), { headers: tkHeaders() });
      tkNotifications = resp.data.notifications || [];
      root = document.getElementById('tasks-app'); if (!root) return;
      root.innerHTML = tkRenderNav() + tkRenderNotifications();
    }
  } catch(err) {
    console.error('[Tasks] render error:', err);
    var r = document.getElementById('tasks-app');
    if (r) r.innerHTML = tkRenderNav() + '<div style="padding:24px;color:#DC2626"><i class="fas fa-exclamation-triangle"></i> Error: ' + (err.message || err) + '</div>';
  }
}

// ==================== DASHBOARD ====================
function tkRenderDashboard() {
  var s = tkSummary;
  var statusTotals = {};
  (s.counts || []).forEach(function(c) { statusTotals[c.status] = (statusTotals[c.status] || 0) + c.cnt; });

  var cards = [
    { icon: 'fa-clock', label: 'Pending', value: statusTotals.pending || 0, color: '#D97706' },
    { icon: 'fa-play-circle', label: 'In Progress', value: statusTotals.in_progress || 0, color: '#2563EB' },
    { icon: 'fa-check-circle', label: 'Completed', value: statusTotals.completed || 0, color: '#059669' },
    { icon: 'fa-exclamation-circle', label: 'Overdue', value: s.overdue_count || 0, color: s.overdue_count > 0 ? '#DC2626' : '#6B7280' },
    { icon: 'fa-ban', label: 'Blocked', value: statusTotals.blocked || 0, color: statusTotals.blocked > 0 ? '#DC2626' : '#6B7280' },
  ];

  var html = '<div class="tk-dashboard">';
  html += '<div class="tk-cards-grid">';
  cards.forEach(function(c) {
    html += '<div class="tk-stat-card">' +
      '<div class="tk-stat-icon" style="background:' + c.color + '20;color:' + c.color + '"><i class="fas ' + c.icon + '"></i></div>' +
      '<div class="tk-stat-info"><div class="tk-stat-value">' + c.value + '</div><div class="tk-stat-label">' + c.label + '</div></div></div>';
  });
  html += '</div>';

  // Due today
  if ((s.due_today || []).length > 0) {
    html += '<div class="tk-section"><h3><i class="fas fa-calendar-day" style="color:#D97706"></i> Due Today</h3>';
    html += tkRenderTaskTable(s.due_today);
    html += '</div>';
  }

  // Recent completed
  if ((s.recent_completed || []).length > 0) {
    html += '<div class="tk-section"><h3><i class="fas fa-check-circle" style="color:#059669"></i> Recently Completed</h3>';
    html += tkRenderTaskTable(s.recent_completed);
    html += '</div>';
  }

  html += '</div>';
  return html;
}

// ==================== TASK LIST ====================
function tkRenderTaskList(title) {
  var html = '<div class="tk-list-page">';
  html += '<div class="tk-toolbar">';
  html += '<h2><i class="fas fa-list-check"></i> ' + title + ' (' + tkTasks.length + ')</h2>';
  html += '<div class="tk-filters">' +
    '<select id="tkStatusFilter" onchange="tkFilterTasks()" class="tk-select"><option value="">Active</option>' +
    '<option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="blocked">Blocked</option><option value="all">All</option></select>' +
    '<select id="tkTypeFilter" onchange="tkFilterTasks()" class="tk-select"><option value="">All Types</option>' +
    '<option value="general">General</option><option value="inventory">Inventory</option><option value="purchasing">Purchasing</option>' +
    '<option value="delivery">Delivery</option><option value="customer">Customer</option><option value="follow_up">Follow Up</option>' +
    '<option value="price_update">Price Update</option><option value="label_update">Label Update</option></select>' +
    '</div></div>';

  if (tkTasks.length === 0) {
    html += '<div class="tk-empty"><i class="fas fa-check-circle" style="font-size:48px;color:#D1D5DB"></i><h3>No Tasks</h3><p>All clear! Create a new task to get started.</p></div>';
  } else {
    html += tkRenderTaskTable(tkTasks);
  }
  html += '</div>';
  return html;
}

function tkRenderTaskTable(tasks) {
  var html = '<div class="tk-task-cards">';
  tasks.forEach(function(t) {
    var isOverdue = t.due_date && t.status !== 'completed' && t.status !== 'cancelled' && new Date(t.due_date) < new Date();
    html += '<div class="tk-task-card tk-priority-' + t.priority + (isOverdue ? ' tk-overdue' : '') + '" onclick="tkNav(\'task-detail\',' + t.id + ')">' +
      '<div class="tk-task-card-top">' +
      '<span class="tk-task-number">' + tkEsc(t.task_number) + '</span>' +
      '<span class="tk-status-badge tk-status-' + t.status + '">' + tkStatusLabel(t.status) + '</span>' +
      '</div>' +
      '<div class="tk-task-title">' + tkEsc(t.title) + '</div>' +
      '<div class="tk-task-meta">' +
      '<span class="tk-priority-badge tk-priority-' + t.priority + '">' + tkPriorityLabel(t.priority) + '</span>' +
      '<span class="tk-type-badge">' + tkTypeLabel(t.task_type) + '</span>' +
      (t.assigned_to_name ? '<span><i class="fas fa-user"></i> ' + tkEsc(t.assigned_to_name) + '</span>' : '') +
      (t.due_date ? '<span class="' + (isOverdue ? 'tk-danger' : '') + '"><i class="fas fa-calendar"></i> ' + tkFormatDate(t.due_date) + (isOverdue ? ' OVERDUE' : '') + '</span>' : '') +
      (t.customer_name ? '<span><i class="fas fa-user-tie"></i> ' + tkEsc(t.customer_name) + '</span>' : '') +
      (t.comment_count > 0 ? '<span><i class="fas fa-comment"></i> ' + t.comment_count + '</span>' : '') +
      '</div>' +
      '</div>';
  });
  html += '</div>';
  return html;
}

async function tkFilterTasks() {
  var status = document.getElementById('tkStatusFilter')?.value || '';
  var type = document.getElementById('tkTypeFilter')?.value || '';
  var url = '/api/tasks?';
  if (tkPage === 'my-tasks' && tkUser) url += 'assigned_to=' + tkUser.id + '&';
  if (status && status !== 'all') url += 'status=' + status + '&';
  else if (status === 'all') url += 'status=&'; // no filter
  if (type) url += 'task_type=' + type + '&';
  try {
    var resp = await tkAPI.get(url, { headers: tkHeaders() });
    tkTasks = resp.data.tasks || [];
    var root = document.getElementById('tasks-app');
    if (root) root.innerHTML = tkRenderNav() + tkRenderTaskList(tkPage === 'my-tasks' ? 'My Tasks' : 'All Tasks');
  } catch(e) { tkToast('Filter failed', 'error'); }
}

// ==================== TASK DETAIL ====================
function tkRenderTaskDetail(data) {
  var t = data.task;
  var comments = data.comments || [];

  var html = '<div class="tk-detail-page">';
  html += '<div class="tk-detail-header">';
  html += '<button class="tk-btn tk-btn-outline tk-btn-sm" onclick="tkNav(\'' + (tkPage === 'task-detail' ? 'all-tasks' : tkPage) + '\')"><i class="fas fa-arrow-left"></i> Back</button>';
  html += '<h2>' + tkEsc(t.task_number) + ' — ' + tkEsc(t.title) + '</h2>';
  html += '<div class="tk-detail-actions">';
  if (t.status === 'pending') html += '<button class="tk-btn tk-btn-primary tk-btn-sm" onclick="tkUpdateStatus(' + t.id + ',\'in_progress\')"><i class="fas fa-play"></i> Start</button>';
  if (t.status === 'in_progress') html += '<button class="tk-btn tk-btn-success tk-btn-sm" onclick="tkUpdateStatus(' + t.id + ',\'completed\')"><i class="fas fa-check"></i> Complete</button>';
  if (['pending','in_progress'].includes(t.status)) html += '<button class="tk-btn tk-btn-warning tk-btn-sm" onclick="tkUpdateStatus(' + t.id + ',\'blocked\')"><i class="fas fa-ban"></i> Block</button>';
  if (t.status !== 'cancelled' && t.status !== 'completed') html += '<button class="tk-btn tk-btn-outline tk-btn-sm" onclick="tkUpdateStatus(' + t.id + ',\'cancelled\')"><i class="fas fa-times"></i> Cancel</button>';
  html += '</div></div>';

  // Info grid
  html += '<div class="tk-detail-grid">';
  html += '<div class="tk-detail-card">';
  html += '<div class="tk-detail-row"><span>Status</span><span class="tk-status-badge tk-status-' + t.status + '">' + tkStatusLabel(t.status) + '</span></div>';
  html += '<div class="tk-detail-row"><span>Priority</span><span class="tk-priority-badge tk-priority-' + t.priority + '">' + tkPriorityLabel(t.priority) + '</span></div>';
  html += '<div class="tk-detail-row"><span>Type</span><span>' + tkTypeLabel(t.task_type) + '</span></div>';
  html += '<div class="tk-detail-row"><span>Created By</span><span>' + tkEsc(t.created_by_name || '—') + '</span></div>';
  html += '<div class="tk-detail-row"><span>Assigned To</span><span>' + tkEsc(t.assigned_to_name || 'Unassigned') + '</span></div>';
  if (t.due_date) html += '<div class="tk-detail-row"><span>Due Date</span><span>' + tkFormatDate(t.due_date) + '</span></div>';
  if (t.customer_name) html += '<div class="tk-detail-row"><span>Customer</span><span>' + tkEsc(t.customer_name) + '</span></div>';
  if (t.location_name) html += '<div class="tk-detail-row"><span>Location</span><span>' + tkEsc(t.location_name) + '</span></div>';
  if (t.ref_type) html += '<div class="tk-detail-row"><span>Reference</span><span>' + tkEsc(t.ref_type) + (t.ref_number ? ' #' + tkEsc(t.ref_number) : t.ref_id ? ' #' + t.ref_id : '') + '</span></div>';
  if (t.completed_at) html += '<div class="tk-detail-row"><span>Completed</span><span>' + tkFormatDateTime(t.completed_at) + ' by ' + tkEsc(t.completed_by_name || '') + '</span></div>';
  html += '</div>';

  // Description
  if (t.description || t.notes) {
    html += '<div class="tk-detail-card">';
    if (t.description) html += '<div style="margin-bottom:8px"><strong>Description:</strong><br>' + tkEsc(t.description) + '</div>';
    if (t.notes) html += '<div><strong>Notes:</strong><br>' + tkEsc(t.notes) + '</div>';
    html += '</div>';
  }
  html += '</div>';

  // Comments
  html += '<div class="tk-section"><h3><i class="fas fa-comments"></i> Activity (' + comments.length + ')</h3>';
  if (comments.length > 0) {
    html += '<div class="tk-comments">';
    comments.forEach(function(c) {
      html += '<div class="tk-comment"><div class="tk-comment-header"><strong>' + tkEsc(c.user_name || 'System') + '</strong><span class="tk-muted">' + tkFormatDateTime(c.created_at) + '</span></div>' +
        '<div class="tk-comment-body">' + tkEsc(c.comment) + '</div></div>';
    });
    html += '</div>';
  }
  html += '<div class="tk-add-comment"><textarea id="tkNewComment" class="tk-input" rows="2" placeholder="Add a comment..."></textarea>' +
    '<button class="tk-btn tk-btn-primary tk-btn-sm" onclick="tkAddComment(' + t.id + ')"><i class="fas fa-paper-plane"></i> Post</button></div>';
  html += '</div>';

  html += '</div>';
  return html;
}

async function tkUpdateStatus(taskId, status) {
  if (status === 'cancelled' && !confirm('Cancel this task?')) return;
  try {
    await tkAPI.patch('/api/tasks/' + taskId, { status: status }, { headers: tkHeaders() });
    tkToast('Task ' + status);
    tkNav('task-detail', taskId);
  } catch(e) { tkToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

async function tkAddComment(taskId) {
  var comment = document.getElementById('tkNewComment')?.value;
  if (!comment) { tkToast('Enter a comment', 'warning'); return; }
  try {
    await tkAPI.post('/api/tasks/' + taskId + '/comments', { comment: comment }, { headers: tkHeaders() });
    tkToast('Comment added');
    tkNav('task-detail', taskId);
  } catch(e) { tkToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// ==================== CREATE TASK ====================
function tkShowCreateTask(prefill) {
  prefill = prefill || {};
  var body = '<div class="tk-form">' +
    '<div class="tk-form-group"><label>Title *</label><input id="tkNewTitle" class="tk-input" value="' + tkEsc(prefill.title || '') + '" placeholder="What needs to be done?"></div>' +
    '<div class="tk-form-group"><label>Description</label><textarea id="tkNewDesc" class="tk-input" rows="3" placeholder="Details...">' + tkEsc(prefill.description || '') + '</textarea></div>' +
    '<div class="tk-form-row">' +
    '<div class="tk-form-group"><label>Type</label><select id="tkNewType" class="tk-select">' +
    ['general','inventory','purchasing','delivery','customer','follow_up','price_update','label_update'].map(function(t) {
      return '<option value="' + t + '"' + (prefill.task_type === t ? ' selected' : '') + '>' + tkTypeLabel(t) + '</option>';
    }).join('') + '</select></div>' +
    '<div class="tk-form-group"><label>Priority</label><select id="tkNewPriority" class="tk-select">' +
    ['low','normal','high','critical'].map(function(p) {
      return '<option value="' + p + '"' + ((prefill.priority || 'normal') === p ? ' selected' : '') + '>' + tkPriorityLabel(p) + '</option>';
    }).join('') + '</select></div>' +
    '<div class="tk-form-group"><label>Due Date</label><input id="tkNewDue" type="date" class="tk-input" value="' + (prefill.due_date || '') + '"></div>' +
    '</div>' +
    '<div class="tk-form-row">' +
    '<div class="tk-form-group"><label>Assign To (name)</label><input id="tkNewAssignName" class="tk-input" value="' + tkEsc(prefill.assigned_to_name || '') + '" placeholder="Staff name..."></div>' +
    '<div class="tk-form-group"><label>Customer</label><input id="tkNewCustName" class="tk-input" value="' + tkEsc(prefill.customer_name || '') + '" placeholder="Customer name (optional)"></div>' +
    '</div>' +
    '<div class="tk-form-group"><label>Notes</label><textarea id="tkNewNotes" class="tk-input" rows="2" placeholder="Additional notes...">' + tkEsc(prefill.notes || '') + '</textarea></div>' +
    '</div>';

  // Store prefill ref data
  window._tkPrefill = prefill;

  var footer = '<button class="tk-btn tk-btn-primary" onclick="tkDoCreateTask()"><i class="fas fa-plus"></i> Create Task</button>';
  tkShowModal('<i class="fas fa-plus-circle"></i> New Task', body, footer);
}

async function tkDoCreateTask() {
  var title = document.getElementById('tkNewTitle')?.value;
  if (!title) { tkToast('Title is required', 'warning'); return; }

  var pf = window._tkPrefill || {};
  try {
    var resp = await tkAPI.post('/api/tasks', {
      title: title,
      description: document.getElementById('tkNewDesc')?.value || null,
      task_type: document.getElementById('tkNewType')?.value || 'general',
      priority: document.getElementById('tkNewPriority')?.value || 'normal',
      due_date: document.getElementById('tkNewDue')?.value || null,
      assigned_to_name: document.getElementById('tkNewAssignName')?.value || null,
      customer_name: document.getElementById('tkNewCustName')?.value || pf.customer_name || null,
      customer_id: pf.customer_id || null,
      notes: document.getElementById('tkNewNotes')?.value || null,
      ref_type: pf.ref_type || null,
      ref_id: pf.ref_id || null,
      ref_number: pf.ref_number || null,
    }, { headers: tkHeaders() });
    tkToast('Task ' + resp.data.task_number + ' created');
    tkCloseModal();
    tkNav('task-detail', resp.data.id);
  } catch(e) { tkToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

// ==================== PRICING ALERTS ====================
function tkRenderPricingAlerts(alerts) {
  var html = '<div class="tk-list-page">';
  html += '<div class="tk-toolbar"><h2><i class="fas fa-dollar-sign" style="color:#D97706"></i> Pricing Alerts (' + alerts.length + ')</h2></div>';

  if (alerts.length === 0) {
    html += '<div class="tk-empty"><i class="fas fa-check-circle" style="font-size:48px;color:#D1D5DB"></i><h3>No Active Alerts</h3><p>Price alerts will appear here when supplier costs change.</p></div>';
  } else {
    html += '<div class="tk-alert-cards">';
    alerts.forEach(function(a) {
      var typeLabel = a.alert_type === 'cost_increase' ? '<span style="color:#D97706"><i class="fas fa-arrow-up"></i> Cost Increase</span>' :
        a.alert_type === 'margin_low' ? '<span style="color:#DC2626"><i class="fas fa-exclamation-triangle"></i> Low Margin</span>' :
        '<span style="color:#2563EB"><i class="fas fa-tag"></i> Label Update</span>';
      html += '<div class="tk-alert-card">' +
        '<div class="tk-alert-top">' +
        typeLabel + ' <span class="tk-status-badge tk-status-' + a.status + '">' + tkStatusLabel(a.status) + '</span>' +
        '</div>' +
        '<div class="tk-alert-product"><strong>' + tkEsc(a.product_name || a.product_name_live || '') + '</strong> <span class="tk-muted">' + tkEsc(a.sku || a.sku_live || '') + '</span></div>' +
        '<div class="tk-alert-details">' +
        '<div>Old Cost: <strong>$' + (a.old_cost || 0).toFixed(2) + '</strong></div>' +
        '<div>New Cost: <strong style="color:#DC2626">$' + (a.new_cost || 0).toFixed(2) + '</strong></div>' +
        '<div>Change: <strong style="color:#D97706">' + (a.cost_change_pct > 0 ? '+' : '') + (a.cost_change_pct || 0).toFixed(1) + '%</strong></div>' +
        '<div>Price: <strong>$' + (a.current_price || a.current_price_live || 0).toFixed(2) + '</strong></div>' +
        '<div>Margin: <strong class="' + ((a.margin_pct || 0) < 15 ? 'tk-danger' : '') + '">' + (a.margin_pct || 0).toFixed(1) + '%</strong></div>' +
        (a.suggested_price ? '<div>Suggested: <strong style="color:#059669">$' + (a.suggested_price || 0).toFixed(2) + '</strong></div>' : '') +
        '</div>' +
        (a.customer_name ? '<div class="tk-alert-customer"><i class="fas fa-user"></i> ' + tkEsc(a.customer_name) + ' (Discount: ' + (a.discount_pct || 0) + '%)</div>' : '') +
        '<div class="tk-alert-actions">' +
        (a.status === 'pending' ? '<button class="tk-btn tk-btn-success tk-btn-xs" onclick="tkResolveAlert(' + a.id + ',' + (a.suggested_price || 0) + ')"><i class="fas fa-check"></i> Update Price</button>' +
          '<button class="tk-btn tk-btn-outline tk-btn-xs" onclick="tkDismissAlert(' + a.id + ')"><i class="fas fa-times"></i> Dismiss</button>' +
          '<button class="tk-btn tk-btn-outline tk-btn-xs" onclick="tkCreateAlertTask(' + a.id + ',\'' + tkEsc(a.product_name || '') + '\')"><i class="fas fa-list-check"></i> Create Task</button>' : '') +
        '</div>' +
        '<div class="tk-muted" style="margin-top:4px;font-size:11px">' + tkFormatDateTime(a.created_at) + '</div>' +
        '</div>';
    });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

async function tkResolveAlert(alertId, suggestedPrice) {
  var newPrice = prompt('Set new price for this product:', suggestedPrice.toFixed(2));
  if (!newPrice) return;
  try {
    await tkAPI.patch('/api/purchasing/pricing-alerts/' + alertId, {
      status: 'resolved', new_price: parseFloat(newPrice), resolution_notes: 'Price updated to $' + newPrice
    }, { headers: tkHeaders() });
    tkToast('Alert resolved — price updated');
    tkNav('pricing-alerts');
  } catch(e) { tkToast('Failed: ' + (e.response?.data?.error || e.message), 'error'); }
}

async function tkDismissAlert(alertId) {
  if (!confirm('Dismiss this alert?')) return;
  try {
    await tkAPI.patch('/api/purchasing/pricing-alerts/' + alertId, { status: 'dismissed' }, { headers: tkHeaders() });
    tkToast('Alert dismissed');
    tkNav('pricing-alerts');
  } catch(e) { tkToast('Failed', 'error'); }
}

function tkCreateAlertTask(alertId, productName) {
  tkShowCreateTask({ title: 'Price update needed: ' + productName, task_type: 'price_update', priority: 'high', ref_type: 'pricing_alert', ref_id: alertId });
}

// ==================== NOTIFICATIONS ====================
function tkRenderNotifications() {
  var html = '<div class="tk-list-page">';
  html += '<div class="tk-toolbar"><h2><i class="fas fa-bell"></i> Notifications (' + tkNotifications.length + ')</h2>';
  html += '<button class="tk-btn tk-btn-outline tk-btn-sm" onclick="tkMarkAllRead()"><i class="fas fa-check-double"></i> Mark All Read</button>';
  html += '</div>';

  if (tkNotifications.length === 0) {
    html += '<div class="tk-empty"><i class="fas fa-bell-slash" style="font-size:48px;color:#D1D5DB"></i><h3>No Notifications</h3></div>';
  } else {
    html += '<div class="tk-notif-list">';
    tkNotifications.forEach(function(n) {
      html += '<div class="tk-notif-item' + (n.is_read ? ' tk-notif-read' : '') + '" onclick="tkReadNotif(' + n.id + ')">' +
        '<div class="tk-notif-icon"><i class="fas fa-' + tkNotifIcon(n.notification_type) + '"></i></div>' +
        '<div class="tk-notif-content">' +
        '<div class="tk-notif-title">' + tkEsc(n.title) + '</div>' +
        (n.message ? '<div class="tk-notif-msg">' + tkEsc(n.message) + '</div>' : '') +
        '<div class="tk-muted">' + tkFormatDateTime(n.created_at) + '</div>' +
        '</div></div>';
    });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

async function tkReadNotif(id) {
  try { await tkAPI.patch('/api/notifications/' + id + '/read', {}, { headers: tkHeaders() }); } catch(e) {}
  // Navigate based on ref_type
  tkNav('notifications');
}

async function tkMarkAllRead() {
  if (!tkUser) return;
  try {
    await tkAPI.post('/api/notifications/read-all', { user_id: tkUser.id }, { headers: tkHeaders() });
    tkToast('All notifications marked read');
    tkNav('notifications');
  } catch(e) { tkToast('Failed', 'error'); }
}

// ==================== MODAL ====================
function tkShowModal(title, bodyHtml, footerHtml) {
  var old = document.getElementById('tkModal');
  if (old) old.remove();
  var m = document.createElement('div');
  m.id = 'tkModal'; m.className = 'po-modal-overlay';
  m.innerHTML = '<div class="po-modal"><div class="po-modal-header"><h3>' + title + '</h3><button class="po-modal-close" onclick="tkCloseModal()"><i class="fas fa-times"></i></button></div>' +
    '<div class="po-modal-body">' + bodyHtml + '</div>' +
    (footerHtml ? '<div class="po-modal-footer">' + footerHtml + '</div>' : '') + '</div>';
  document.body.appendChild(m);
  setTimeout(function() { m.classList.add('po-modal-visible'); }, 10);
}
function tkCloseModal() {
  var m = document.getElementById('tkModal');
  if (m) { m.classList.remove('po-modal-visible'); setTimeout(function() { m.remove(); }, 200); }
}

// ==================== HELPERS ====================
function tkEsc(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function tkFormatDate(d) { if (!d) return '—'; try { return dayjs(d).format('MMM D, YYYY'); } catch(e) { return d; } }
function tkFormatDateTime(d) { if (!d) return '—'; try { return dayjs(d).format('MMM D, h:mm A'); } catch(e) { return d; } }
function tkStatusLabel(s) { return { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled', blocked: 'Blocked', acknowledged: 'Acknowledged', resolved: 'Resolved', dismissed: 'Dismissed' }[s] || s || '—'; }
function tkPriorityLabel(p) { return { low: 'Low', normal: 'Normal', high: 'High', critical: 'Critical' }[p] || p || 'Normal'; }
function tkTypeLabel(t) { return { general: 'General', inventory: 'Inventory', purchasing: 'Purchasing', delivery: 'Delivery', customer: 'Customer', follow_up: 'Follow Up', price_update: 'Price Update', label_update: 'Label Update' }[t] || t || 'General'; }
function tkNotifIcon(t) { return { task: 'list-check', price_alert: 'dollar-sign', warning: 'exclamation-triangle', success: 'check-circle', info: 'info-circle', alert: 'bell' }[t] || 'bell'; }
