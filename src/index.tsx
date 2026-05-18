import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { BFBindings, BFVariables } from './lib/types'
import { logisticsApp } from './modules/logistics'
import { inventoryApp } from './modules/inventory'
import { purchasingApp } from './modules/purchasing'
import { crmApp } from './modules/crm'

const app = new Hono<{ Bindings: BFBindings; Variables: BFVariables }>()

app.use('/api/*', cors())

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json({ error: 'Internal server error', detail: err?.message || String(err) }, 500)
})

// ==================== PARENT AUTH ENDPOINTS ====================
// These override logistics auth to add module_access to the response

app.post('/api/auth/login', async (c) => {
  const { email, password } = await c.req.json()
  const db = c.env.DB
  const user = await db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').bind(email).first() as any
  if (!user) return c.json({ error: 'Invalid credentials' }, 401)

  // Simple password check (same as logistics)
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

  if (user.password_hash !== hashHex && user.password_hash !== password) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  // Get module access for this user
  const accessRows = await db.prepare('SELECT module FROM user_module_access WHERE user_id = ?').bind(user.id).all()
  const modules = accessRows.results?.map((r: any) => r.module) || []

  // Admins get all modules
  const allModules = user.role === 'admin' ? ['logistics', 'inventory', 'ordering', 'crm', 'pos', 'tasks', 'admin'] : modules

  // Get role-based feature permissions with access levels
  let featurePerms: any = 'all'
  let canViewFinancials = true
  if (user.role !== 'admin') {
    const perms = await db.prepare('SELECT module, feature, access_level FROM role_permissions WHERE role_name = ?').bind(user.role).all()
    const permMap: Record<string, Record<string, string>> = {}
    for (const p of (perms.results || []) as any[]) {
      if (!permMap[p.module]) permMap[p.module] = {}
      permMap[p.module][p.feature] = p.access_level || 'edit'
    }
    featurePerms = permMap
    // Get financial visibility
    const roleRow = await db.prepare('SELECT can_view_financials FROM roles WHERE name = ?').bind(user.role).first() as any
    canViewFinancials = roleRow ? !!roleRow.can_view_financials : true
  }

  // Generate simple token (same approach as logistics)
  const token = btoa(JSON.stringify({ id: user.id, email: user.email, role: user.role, exp: Date.now() + 86400000 }))

  return c.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, modules: allModules },
    token,
    permissions: featurePerms,
    can_view_financials: canViewFinancials
  })
})

app.get('/api/auth/me', async (c) => {
  const auth = c.req.header('Authorization')
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const token = auth.replace('Bearer ', '')
    const payload = JSON.parse(atob(token))
    if (payload.exp < Date.now()) return c.json({ error: 'Token expired' }, 401)
    const db = c.env.DB
    const user = await db.prepare('SELECT id, name, email, role, phone FROM users WHERE id = ? AND active = 1').bind(payload.id).first() as any
    if (!user) return c.json({ error: 'User not found' }, 401)

    const accessRows = await db.prepare('SELECT module FROM user_module_access WHERE user_id = ?').bind(user.id).all()
    const modules = accessRows.results?.map((r: any) => r.module) || []
    const allModules = user.role === 'admin' ? ['logistics', 'inventory', 'ordering', 'crm', 'pos', 'tasks', 'admin'] : modules

    return c.json({ user: { ...user, modules: allModules } })
  } catch { return c.json({ error: 'Invalid token' }, 401) }
})

// ==================== ADMIN: USER MANAGEMENT ====================

app.get('/api/admin/users', async (c) => {
  const db = c.env.DB
  const incArchived = c.req.query('include_archived') === '1'
  const users = await db.prepare(
    `SELECT id, name, email, role, phone, preferred_language, active, created_at FROM users ${incArchived ? '' : 'WHERE active = 1'} ORDER BY role, name`
  ).all()
  // Get module access for all users
  const access = await db.prepare('SELECT user_id, module FROM user_module_access').all()
  const accessMap: Record<number, string[]> = {}
  for (const row of (access.results || []) as any[]) {
    if (!accessMap[row.user_id]) accessMap[row.user_id] = []
    accessMap[row.user_id].push(row.module)
  }
  const result = (users.results || []).map((u: any) => ({
    ...u,
    modules: u.role === 'admin' ? ['logistics', 'inventory', 'ordering', 'crm', 'pos', 'tasks', 'admin'] : (accessMap[u.id] || [])
  }))
  // Also return available roles for the edit user modal
  const rolesRes = await db.prepare('SELECT name, description, is_system FROM roles ORDER BY is_system DESC, name').all()
  return c.json({ users: result, roles: rolesRes.results || [] })
})

app.post('/api/admin/users', async (c) => {
  const body = await c.req.json() as any
  const db = c.env.DB
  if (!body.name || !body.email) return c.json({ error: 'Name and email are required' }, 400)
  // Hash password
  const pw = body.password || 'changeme123'
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(pw))
  const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
  try {
    const res = await db.prepare(
      'INSERT INTO users (email, name, role, phone, preferred_language, password_hash, active) VALUES (?,?,?,?,?,?,?)'
    ).bind(body.email, body.name, body.role || 'dispatcher', body.phone || null, body.preferred_language || 'en', hashHex, 1).run()
    return c.json({ id: res.meta.last_row_id }, 201)
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) return c.json({ error: 'Email already exists' }, 409)
    throw err
  }
})

app.put('/api/admin/users/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json() as any
  const db = c.env.DB
  const fields: string[] = []
  const vals: any[] = []
  for (const key of ['name', 'email', 'phone', 'role', 'preferred_language', 'active']) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); vals.push(body[key]) }
  }
  if (body.password) {
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(body.password))
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
    fields.push('password_hash = ?'); vals.push(hashHex)
  }
  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400)
  vals.push(id)
  await db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run()
  return c.json({ success: true })
})

app.put('/api/admin/users/:id/modules', async (c) => {
  const userId = parseInt(c.req.param('id'))
  const { modules } = await c.req.json() as { modules: string[] }
  const db = c.env.DB

  // Delete existing access
  await db.prepare('DELETE FROM user_module_access WHERE user_id = ?').bind(userId).run()

  // Insert new access
  for (const mod of modules) {
    await db.prepare('INSERT INTO user_module_access (user_id, module) VALUES (?, ?)').bind(userId, mod).run()
  }

  return c.json({ success: true, modules })
})

// ==================== ADMIN: ROLES & PERMISSIONS ====================

// All features available per module (used by frontend for rendering toggles)
const MODULE_FEATURES: Record<string, { id: string; label: string }[]> = {
  logistics: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'orders', label: 'Orders' },
    { id: 'ticket_review', label: 'Ticket Review' },
    { id: 'schedule', label: 'Schedule' },
    { id: 'routes', label: 'Routes' },
    { id: 'route_builder', label: 'Route Builder' },
    { id: 'zones', label: 'Zones' },
    { id: 'recurring', label: 'Recurring' },
    { id: 'customers', label: 'Customers' },
    { id: 'products', label: 'Products' },
    { id: 'trucks', label: 'Fleet' },
    { id: 'drivers_mgmt', label: 'Drivers' },
    { id: 'maintenance', label: 'Maintenance' },
    { id: 'driver', label: 'Driver View' },
    { id: 'packing', label: 'Packing Lists' },
    { id: 'returns', label: 'Returns' },
    { id: 'learning', label: 'AI Learning' },
    { id: 'fleet_tracking', label: 'Fleet Tracking' },
    { id: 'fleet_sync', label: 'Fleet Sync' },
  ],
  inventory: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'stock', label: 'Stock' },
    { id: 'products', label: 'Products' },
    { id: 'count', label: 'Count' },
    { id: 'transfers', label: 'Transfers' },
    { id: 'batches', label: 'Batches' },
    { id: 'losses', label: 'Losses' },
    { id: 'holds', label: 'Holds' },
    { id: 'reservations', label: 'Reserved' },
    { id: 'audit', label: 'Audit Log' },
  ],
  ordering: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'orders', label: 'Orders' },
    { id: 'requests', label: 'Requests' },
    { id: 'arriving', label: 'Arriving' },
    { id: 'bills', label: 'Bills' },
    { id: 'suppliers', label: 'Suppliers' },
  ],
  crm: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'organizations', label: 'Organizations' },
    { id: 'contacts', label: 'Contacts' },
  ],
}

app.get('/api/admin/module-features', (c) => {
  return c.json({ features: MODULE_FEATURES })
})

app.get('/api/admin/roles', async (c) => {
  const db = c.env.DB
  const roles = await db.prepare('SELECT * FROM roles ORDER BY is_system DESC, name').all()
  // Get permissions for all roles (include access_level)
  const perms = await db.prepare('SELECT * FROM role_permissions ORDER BY role_name, module, feature').all()
  const permMap: Record<string, { module: string; feature: string; access_level: string }[]> = {}
  for (const p of (perms.results || []) as any[]) {
    if (!permMap[p.role_name]) permMap[p.role_name] = []
    permMap[p.role_name].push({ module: p.module, feature: p.feature, access_level: p.access_level || 'edit' })
  }
  const result = (roles.results || []).map((r: any) => ({
    ...r,
    permissions: permMap[r.name] || []
  }))
  return c.json({ roles: result, features: MODULE_FEATURES })
})

app.post('/api/admin/roles', async (c) => {
  const body = await c.req.json() as any
  const db = c.env.DB
  if (!body.name) return c.json({ error: 'Role name is required' }, 400)
  const safeName = body.name.toLowerCase().replace(/[^a-z0-9_\- ]/g, '').trim()
  if (!safeName) return c.json({ error: 'Invalid role name' }, 400)
  try {
    await db.prepare('INSERT INTO roles (name, description, is_system) VALUES (?, ?, 0)')
      .bind(safeName, body.description || null).run()
    return c.json({ success: true, name: safeName }, 201)
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) return c.json({ error: 'Role already exists' }, 409)
    throw err
  }
})

app.put('/api/admin/roles/:name', async (c) => {
  const name = c.req.param('name')
  const body = await c.req.json() as any
  const db = c.env.DB
  if (body.description !== undefined) {
    await db.prepare('UPDATE roles SET description = ? WHERE name = ?').bind(body.description, name).run()
  }
  if (body.can_view_financials !== undefined) {
    await db.prepare('UPDATE roles SET can_view_financials = ? WHERE name = ?').bind(body.can_view_financials ? 1 : 0, name).run()
  }
  return c.json({ success: true })
})

app.delete('/api/admin/roles/:name', async (c) => {
  const name = c.req.param('name')
  const db = c.env.DB
  // Don't allow deleting system roles
  const role = await db.prepare('SELECT is_system FROM roles WHERE name = ?').bind(name).first() as any
  if (!role) return c.json({ error: 'Role not found' }, 404)
  if (role.is_system) return c.json({ error: 'Cannot delete system roles' }, 403)
  // Check if any users have this role
  const users = await db.prepare('SELECT COUNT(*) as cnt FROM users WHERE role = ?').bind(name).first() as any
  if (users.cnt > 0) return c.json({ error: `Cannot delete role — ${users.cnt} user(s) still have this role` }, 409)
  await db.prepare('DELETE FROM role_permissions WHERE role_name = ?').bind(name).run()
  await db.prepare('DELETE FROM roles WHERE name = ?').bind(name).run()
  return c.json({ success: true })
})

// Save all permissions for a role (bulk replace) — now includes access_level and can_view_financials
app.put('/api/admin/roles/:name/permissions', async (c) => {
  const name = c.req.param('name')
  const body = await c.req.json() as { permissions: { module: string; feature: string; access_level?: string }[]; can_view_financials?: boolean }
  const db = c.env.DB
  // Delete existing permissions
  await db.prepare('DELETE FROM role_permissions WHERE role_name = ?').bind(name).run()
  // Insert new permissions with access_level
  for (const p of (body.permissions || [])) {
    await db.prepare('INSERT INTO role_permissions (role_name, module, feature, access_level) VALUES (?, ?, ?, ?)')
      .bind(name, p.module, p.feature, p.access_level || 'edit').run()
  }
  // Update can_view_financials if provided
  if (body.can_view_financials !== undefined) {
    await db.prepare('UPDATE roles SET can_view_financials = ? WHERE name = ?')
      .bind(body.can_view_financials ? 1 : 0, name).run()
  }
  return c.json({ success: true })
})

// Get permissions for a specific user (used by frontend on login/module load)
app.get('/api/permissions/me', async (c) => {
  const auth = c.req.header('Authorization')
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const token = auth.replace('Bearer ', '')
    const payload = JSON.parse(atob(token))
    if (payload.exp < Date.now()) return c.json({ error: 'Token expired' }, 401)
    const db = c.env.DB
    const user = await db.prepare('SELECT id, role FROM users WHERE id = ? AND active = 1').bind(payload.id).first() as any
    if (!user) return c.json({ error: 'User not found' }, 401)
    // Admin gets everything
    if (user.role === 'admin') return c.json({ role: 'admin', permissions: 'all', can_view_financials: true })
    // Get role permissions with access_level
    const perms = await db.prepare('SELECT module, feature, access_level FROM role_permissions WHERE role_name = ?').bind(user.role).all()
    const permMap: Record<string, Record<string, string>> = {}
    for (const p of (perms.results || []) as any[]) {
      if (!permMap[p.module]) permMap[p.module] = {}
      permMap[p.module][p.feature] = p.access_level || 'edit'
    }
    // Get financial visibility
    const roleRow = await db.prepare('SELECT can_view_financials FROM roles WHERE name = ?').bind(user.role).first() as any
    const canViewFin = roleRow ? !!roleRow.can_view_financials : true
    return c.json({ role: user.role, permissions: permMap, can_view_financials: canViewFin })
  } catch { return c.json({ error: 'Invalid token' }, 401) }
})

// ==================== ADMIN: LOCATIONS ====================

app.get('/api/locations', async (c) => {
  const db = c.env.DB
  const locations = await db.prepare('SELECT * FROM locations WHERE active = 1 ORDER BY name ASC').all()
  return c.json({ locations: locations.results || [] })
})

app.post('/api/locations', async (c) => {
  const body = await c.req.json()
  const db = c.env.DB
  const result = await db.prepare(
    'INSERT INTO locations (name, code, type, street, city, state, zip, lat, lng, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(body.name, body.code, body.type, body.street || null, body.city || null, body.state || 'FL', body.zip || null, body.lat || null, body.lng || null, body.phone || null).run()
  return c.json({ id: result.meta.last_row_id, ...body })
})

app.put('/api/locations/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const db = c.env.DB
  await db.prepare(
    'UPDATE locations SET name=?, code=?, type=?, street=?, city=?, state=?, zip=?, lat=?, lng=?, phone=? WHERE id=?'
  ).bind(body.name, body.code, body.type, body.street || null, body.city || null, body.state || 'FL', body.zip || null, body.lat || null, body.lng || null, body.phone || null, id).run()
  return c.json({ success: true })
})

// ==================== MOUNT MODULES ====================
// Inventory module: /api/inventory/*
app.route('/', inventoryApp)

// Purchasing module: /api/purchasing/*
app.route('/', purchasingApp)

// CRM module: /api/crm/*
app.route('/', crmApp)

// Logistics module: /api/orders, /api/routes, /api/customers, etc.
app.route('/', logisticsApp)

// ==================== SERVE PARENT SHELL ====================
app.get('/', (c) => c.redirect('/app'))
app.get('/app', (c) => renderShell(c))
app.get('/app/*', (c) => renderShell(c))

function renderShell(c: any) {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>BF Operations - British Feed & Supplies</title>
  <meta name="description" content="British Feed and Supplies Operations Management">
  <meta name="theme-color" content="#0F172A">
  <link rel="manifest" href="/static/manifest.json">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <link href="/static/shell.css?v=${Date.now()}" rel="stylesheet">
</head>
<body class="font-sans">
  <div id="bf-ops-root"></div>
  <script src="https://cdn.jsdelivr.net/npm/axios@1.7.0/dist/axios.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.13/dayjs.min.js"></script>
  <script src="/static/shell.js?v=${Date.now()}"></script>
</body>
</html>`)
}

export default app
