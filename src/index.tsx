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

  // Generate simple token (same approach as logistics)
  const token = btoa(JSON.stringify({ id: user.id, email: user.email, role: user.role, exp: Date.now() + 86400000 }))

  return c.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, modules: allModules },
    token
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

// ==================== ADMIN: USER MODULE ACCESS ====================

app.get('/api/admin/users', async (c) => {
  const db = c.env.DB
  const users = await db.prepare('SELECT id, name, email, role, phone, active FROM users ORDER BY name').all()
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
  return c.json({ users: result })
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
