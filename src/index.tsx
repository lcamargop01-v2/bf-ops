import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { BFBindings, BFVariables } from './lib/types'
import { logisticsApp } from './modules/logistics'
import { inventoryApp } from './modules/inventory'
import { purchasingApp } from './modules/purchasing'
import { crmApp } from './modules/crm'
import { reportsApp } from './modules/reports'
import { posApp } from './modules/pos'
import { tasksApp } from './modules/tasks'
import { standingOrdersApp } from './modules/standingOrders'

const app = new Hono<{ Bindings: BFBindings; Variables: BFVariables }>()

app.use('/api/*', cors())

// Static assets are served by Cloudflare's asset router via _routes.json exclude
// Fallback: serve from ASSETS binding for Workers for Platform compatibility
app.get('/static/*', async (c) => {
  try {
    const assets = (c.env as any).ASSETS
    if (assets && typeof assets.fetch === 'function') {
      const url = new URL(c.req.url)
      const assetReq = new Request(url.toString(), { headers: c.req.raw.headers })
      return await assets.fetch(assetReq)
    }
  } catch (e) { /* fall through */ }
  return c.notFound()
})

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json({ error: 'Internal server error', detail: err?.message || String(err) }, 500)
})

// ==================== PARENT AUTH ENDPOINTS ====================
// These override logistics auth to add module_access to the response

// Public endpoint: list active users for PIN login picker (no sensitive data)
app.get('/api/auth/users-list', async (c) => {
  const db = c.env.DB
  const users = await db.prepare(
    `SELECT id, name, role, department, job_title FROM users WHERE active = 1 ORDER BY
      CASE department
        WHEN 'management' THEN 1
        WHEN 'office' THEN 2
        WHEN 'warehouse' THEN 3
        WHEN 'logistics' THEN 4
        ELSE 5
      END, name`
  ).all()
  return c.json({ users: users.results || [] })
})

// Rate limiting for PIN attempts — in-memory tracker (resets on isolate recycle)
const pinAttempts: Record<number, { count: number, lockedUntil: number }> = {}
const PIN_MAX_ATTEMPTS = 5
const PIN_LOCKOUT_MS = 5 * 60 * 1000  // 5 minutes

// PIN-based login — select user by id, authenticate with 4-digit PIN
app.post('/api/auth/pin-login', async (c) => {
  const { user_id, pin } = await c.req.json()
  const db = c.env.DB

  if (!user_id || !pin) return c.json({ error: 'User and PIN are required' }, 400)

  const uid = parseInt(user_id)

  // Check rate limit
  const attempt = pinAttempts[uid]
  if (attempt) {
    if (attempt.lockedUntil > Date.now()) {
      const remainSec = Math.ceil((attempt.lockedUntil - Date.now()) / 1000)
      return c.json({ error: `Too many attempts. Try again in ${remainSec}s.`, locked: true, retry_after: remainSec }, 429)
    }
    // Reset if lockout expired
    if (attempt.lockedUntil > 0 && attempt.lockedUntil <= Date.now()) {
      attempt.count = 0
      attempt.lockedUntil = 0
    }
  }

  const user = await db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').bind(uid).first() as any
  if (!user) return c.json({ error: 'User not found' }, 401)

  // Check PIN (stored as plaintext 4-digit code)
  if (!user.pin) return c.json({ error: 'PIN not set for this user. Contact admin.' }, 401)
  if (user.pin !== String(pin)) {
    // Track failed attempt
    if (!pinAttempts[uid]) pinAttempts[uid] = { count: 0, lockedUntil: 0 }
    pinAttempts[uid].count++
    const remaining = PIN_MAX_ATTEMPTS - pinAttempts[uid].count
    if (remaining <= 0) {
      pinAttempts[uid].lockedUntil = Date.now() + PIN_LOCKOUT_MS
      return c.json({ error: 'Too many failed attempts. Locked for 5 minutes.', locked: true, retry_after: 300 }, 429)
    }
    return c.json({ error: 'Incorrect PIN' + (remaining <= 2 ? ` (${remaining} attempt${remaining === 1 ? '' : 's'} remaining)` : '') }, 401)
  }

  // Successful login — clear attempts
  delete pinAttempts[uid]

  // Get module access for this user
  let modules: string[] = []
  try {
    const accessRows = await db.prepare('SELECT module FROM user_module_access WHERE user_id = ?').bind(user.id).all()
    modules = accessRows.results?.map((r: any) => r.module) || []
  } catch { /* table may not exist in dev */ }
  const allModules = user.role === 'admin' ? ['logistics', 'inventory', 'ordering', 'crm', 'reports', 'pos', 'tasks', 'admin'] : modules

  // Get role-based feature permissions
  let featurePerms: any = 'all'
  let canViewFinancials = true
  if (user.role !== 'admin') {
    try {
      const perms = await db.prepare('SELECT module, feature, access_level FROM role_permissions WHERE role_name = ?').bind(user.role).all()
      const permMap: Record<string, Record<string, string>> = {}
      for (const p of (perms.results || []) as any[]) {
        if (!permMap[p.module]) permMap[p.module] = {}
        permMap[p.module][p.feature] = p.access_level || 'edit'
      }
      featurePerms = permMap
      const roleRow = await db.prepare('SELECT can_view_financials FROM roles WHERE name = ?').bind(user.role).first() as any
      canViewFinancials = roleRow ? !!roleRow.can_view_financials : true
    } catch { /* permissions tables may not exist in dev — default to 'all' */ }
  }

  // Generate token (24hr expiry)
  const token = btoa(JSON.stringify({ id: user.id, email: user.email, role: user.role, exp: Date.now() + 86400000 }))

  let pinnedPages = null
  try { pinnedPages = user.pinned_pages ? JSON.parse(user.pinned_pages) : null } catch {}

  return c.json({
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone,
      modules: allModules,
      default_module: user.default_module || null,
      default_page: user.default_page || null,
      pinned_pages: pinnedPages,
      sidebar_mode: user.sidebar_mode || 'full',
    },
    token,
    permissions: featurePerms,
    can_view_financials: canViewFinancials
  })
})

// Admin password verification for sensitive views (financial/admin)
app.post('/api/auth/verify-admin', async (c) => {
  const auth = c.req.header('Authorization')
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const tokenStr = auth.replace('Bearer ', '')
    const payload = JSON.parse(atob(tokenStr))
    if (payload.exp < Date.now()) return c.json({ error: 'Token expired' }, 401)

    const { password } = await c.req.json()
    const db = c.env.DB
    const user = await db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').bind(payload.id).first() as any
    if (!user) return c.json({ error: 'User not found' }, 401)

    // Must be admin role
    if (user.role !== 'admin') return c.json({ error: 'Admin access required' }, 403)

    // Verify password (SHA-256 hash)
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password))
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')

    if (user.password_hash !== hashHex && user.password_hash !== password) {
      return c.json({ error: 'Incorrect password' }, 401)
    }

    return c.json({ verified: true })
  } catch { return c.json({ error: 'Invalid token' }, 401) }
})

// Update user PIN (self or admin)
app.put('/api/auth/pin', async (c) => {
  const auth = c.req.header('Authorization')
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const tokenStr = auth.replace('Bearer ', '')
    const payload = JSON.parse(atob(tokenStr))
    if (payload.exp < Date.now()) return c.json({ error: 'Token expired' }, 401)

    const { user_id, new_pin } = await c.req.json()
    const db = c.env.DB

    // Validate PIN format (4 digits)
    if (!new_pin || !/^\d{4}$/.test(String(new_pin))) {
      return c.json({ error: 'PIN must be exactly 4 digits' }, 400)
    }

    const targetId = user_id || payload.id
    // Only admin can change other users' PINs
    if (targetId !== payload.id) {
      const caller = await db.prepare('SELECT role FROM users WHERE id = ?').bind(payload.id).first() as any
      if (!caller || caller.role !== 'admin') return c.json({ error: 'Only admins can change other users\' PINs' }, 403)
    }

    await db.prepare('UPDATE users SET pin = ? WHERE id = ?').bind(String(new_pin), targetId).run()
    return c.json({ success: true })
  } catch { return c.json({ error: 'Invalid token' }, 401) }
})

// Admin: view all PINs
app.get('/api/admin/pins', async (c) => {
  const auth = c.req.header('Authorization')
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const payload = JSON.parse(atob(auth.replace('Bearer ', '')))
    if (payload.exp < Date.now()) return c.json({ error: 'Token expired' }, 401)
    const db = c.env.DB
    const caller = await db.prepare('SELECT role FROM users WHERE id = ?').bind(payload.id).first() as any
    if (!caller || caller.role !== 'admin') return c.json({ error: 'Admin only' }, 403)
    const rows = await db.prepare('SELECT id, name, role, department, pin, active FROM users ORDER BY department, name').all()
    return c.json({ users: rows.results || [] })
  } catch { return c.json({ error: 'Invalid token' }, 401) }
})

// Admin: reset user PIN to random 4-digit code
app.post('/api/admin/reset-pin/:userId', async (c) => {
  const auth = c.req.header('Authorization')
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const payload = JSON.parse(atob(auth.replace('Bearer ', '')))
    if (payload.exp < Date.now()) return c.json({ error: 'Token expired' }, 401)
    const db = c.env.DB
    const caller = await db.prepare('SELECT role FROM users WHERE id = ?').bind(payload.id).first() as any
    if (!caller || caller.role !== 'admin') return c.json({ error: 'Admin only' }, 403)
    const uid = parseInt(c.req.param('userId'))
    const newPin = String(Math.floor(1000 + Math.random() * 9000))
    await db.prepare('UPDATE users SET pin = ? WHERE id = ?').bind(newPin, uid).run()
    // Clear any lockout for this user
    delete pinAttempts[uid]
    return c.json({ success: true, new_pin: newPin })
  } catch { return c.json({ error: 'Invalid token' }, 401) }
})

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
  const allModules = user.role === 'admin' ? ['logistics', 'inventory', 'ordering', 'crm', 'reports', 'pos', 'tasks', 'admin'] : modules

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

  // Parse pinned_pages JSON
  let pinnedPages = null
  try { pinnedPages = user.pinned_pages ? JSON.parse(user.pinned_pages) : null } catch {}

  return c.json({
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone,
      modules: allModules,
      default_module: user.default_module || null,
      default_page: user.default_page || null,
      pinned_pages: pinnedPages,
      sidebar_mode: user.sidebar_mode || 'full',
    },
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
    const user = await db.prepare('SELECT id, name, email, role, phone, default_module, default_page, pinned_pages, sidebar_mode FROM users WHERE id = ? AND active = 1').bind(payload.id).first() as any
    if (!user) return c.json({ error: 'User not found' }, 401)

    const accessRows = await db.prepare('SELECT module FROM user_module_access WHERE user_id = ?').bind(user.id).all()
    const modules = accessRows.results?.map((r: any) => r.module) || []
    const allModules = user.role === 'admin' ? ['logistics', 'inventory', 'ordering', 'crm', 'reports', 'pos', 'tasks', 'admin'] : modules

    let pinnedPages = null
    try { pinnedPages = user.pinned_pages ? JSON.parse(user.pinned_pages) : null } catch {}

    return c.json({ user: { ...user, modules: allModules, pinned_pages: pinnedPages, sidebar_mode: user.sidebar_mode || 'full' } })
  } catch { return c.json({ error: 'Invalid token' }, 401) }
})

// ==================== ADMIN: USER MANAGEMENT ====================

app.get('/api/admin/users', async (c) => {
  const db = c.env.DB
  const incArchived = c.req.query('include_archived') === '1'
  const users = await db.prepare(
    `SELECT id, name, email, role, phone, preferred_language, active, created_at, default_module, default_page, pinned_pages, sidebar_mode, department, job_title, pin FROM users ${incArchived ? '' : 'WHERE active = 1'} ORDER BY role, name`
  ).all()
  // Get module access for all users
  const access = await db.prepare('SELECT user_id, module FROM user_module_access').all()
  const accessMap: Record<number, string[]> = {}
  for (const row of (access.results || []) as any[]) {
    if (!accessMap[row.user_id]) accessMap[row.user_id] = []
    accessMap[row.user_id].push(row.module)
  }
  const result = (users.results || []).map((u: any) => {
    let pinnedPages = null
    try { pinnedPages = u.pinned_pages ? JSON.parse(u.pinned_pages) : null } catch {}
    return {
      ...u,
      modules: u.role === 'admin' ? ['logistics', 'inventory', 'ordering', 'crm', 'pos', 'tasks', 'admin'] : (accessMap[u.id] || []),
      pinned_pages: pinnedPages,
      sidebar_mode: u.sidebar_mode || 'full',
    }
  })
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
      'INSERT INTO users (email, name, role, phone, preferred_language, password_hash, active, department, job_title, pin) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(body.email, body.name, body.role || 'dispatcher', body.phone || null, body.preferred_language || 'en', hashHex, 1, body.department || null, body.job_title || null, body.pin || null).run()
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
  for (const key of ['name', 'email', 'phone', 'role', 'preferred_language', 'active', 'department', 'job_title', 'pin']) {
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
  try {
    await db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run()
    return c.json({ success: true })
  } catch (err: any) {
    console.error('User update error:', err)
    if (err.message?.includes('CHECK') || err.message?.includes('constraint')) {
      return c.json({ error: 'Invalid role or field value. Ensure the role exists in the system.' }, 400)
    }
    return c.json({ error: err.message || 'Failed to update user' }, 500)
  }
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

// ==================== USER VIEW PREFERENCES ====================

// Users can update their own preferences
app.put('/api/user/preferences', async (c) => {
  const auth = c.req.header('Authorization')
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const token = auth.replace('Bearer ', '')
    const payload = JSON.parse(atob(token))
    if (payload.exp < Date.now()) return c.json({ error: 'Token expired' }, 401)

    const body = await c.req.json() as any
    const db = c.env.DB
    const fields: string[] = []
    const vals: any[] = []

    if (body.default_module !== undefined) { fields.push('default_module = ?'); vals.push(body.default_module || null) }
    if (body.default_page !== undefined) { fields.push('default_page = ?'); vals.push(body.default_page || null) }
    if (body.pinned_pages !== undefined) { fields.push('pinned_pages = ?'); vals.push(body.pinned_pages ? JSON.stringify(body.pinned_pages) : null) }
    if (body.sidebar_mode !== undefined) { fields.push('sidebar_mode = ?'); vals.push(body.sidebar_mode || 'full') }

    if (fields.length === 0) return c.json({ error: 'No preferences to update' }, 400)
    vals.push(payload.id)
    await db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run()
    return c.json({ success: true })
  } catch { return c.json({ error: 'Invalid token' }, 401) }
})

// Admin can set preferences for any user
app.put('/api/admin/users/:id/preferences', async (c) => {
  const userId = parseInt(c.req.param('id'))
  const body = await c.req.json() as any
  const db = c.env.DB
  const fields: string[] = []
  const vals: any[] = []

  if (body.default_module !== undefined) { fields.push('default_module = ?'); vals.push(body.default_module || null) }
  if (body.default_page !== undefined) { fields.push('default_page = ?'); vals.push(body.default_page || null) }
  if (body.pinned_pages !== undefined) { fields.push('pinned_pages = ?'); vals.push(body.pinned_pages ? JSON.stringify(body.pinned_pages) : null) }
  if (body.sidebar_mode !== undefined) { fields.push('sidebar_mode = ?'); vals.push(body.sidebar_mode || 'full') }

  if (fields.length === 0) return c.json({ error: 'No preferences to update' }, 400)
  vals.push(userId)
  await db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run()
  return c.json({ success: true })
})

// ==================== ADMIN: INVITE SYSTEM ====================

// Generate a random invite token (32 hex characters)
async function generateInviteToken(): Promise<string> {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Generate invite for an existing user
app.post('/api/admin/users/:id/invite', async (c) => {
  const userId = parseInt(c.req.param('id'))
  const db = c.env.DB

  // Verify user exists
  const user = await db.prepare('SELECT id, name, email, active FROM users WHERE id = ?').bind(userId).first() as any
  if (!user) return c.json({ error: 'User not found' }, 404)
  if (!user.active) return c.json({ error: 'Cannot invite inactive user' }, 400)

  // Generate token, expires in 7 days
  const token = await generateInviteToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  await db.prepare('UPDATE users SET invite_token = ?, invite_expires_at = ? WHERE id = ?')
    .bind(token, expiresAt, userId).run()

  // Build the invite URL
  const host = new URL(c.req.url).origin
  const inviteUrl = `${host}/invite/${token}`

  return c.json({ success: true, invite_url: inviteUrl, token, expires_at: expiresAt, user_name: user.name, user_email: user.email })
})

// Validate invite token (public — no auth required)
app.get('/api/invite/:token', async (c) => {
  const token = c.req.param('token')
  const db = c.env.DB

  const user = await db.prepare('SELECT id, name, email, invite_expires_at FROM users WHERE invite_token = ? AND active = 1').bind(token).first() as any
  if (!user) return c.json({ error: 'Invalid or expired invite link' }, 404)

  // Check expiry
  if (user.invite_expires_at && new Date(user.invite_expires_at) < new Date()) {
    return c.json({ error: 'This invite link has expired. Please ask your administrator for a new one.' }, 410)
  }

  return c.json({ valid: true, name: user.name, email: user.email })
})

// Complete invite — set password (public — no auth required)
app.post('/api/invite/:token/setup', async (c) => {
  const token = c.req.param('token')
  const { password } = await c.req.json() as { password: string }
  const db = c.env.DB

  if (!password || password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters' }, 400)
  }

  const user = await db.prepare('SELECT id, name, email, invite_expires_at FROM users WHERE invite_token = ? AND active = 1').bind(token).first() as any
  if (!user) return c.json({ error: 'Invalid or expired invite link' }, 404)

  // Check expiry
  if (user.invite_expires_at && new Date(user.invite_expires_at) < new Date()) {
    return c.json({ error: 'This invite link has expired. Please ask your administrator for a new one.' }, 410)
  }

  // Hash the new password
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password))
  const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')

  // Update password and clear invite token
  await db.prepare('UPDATE users SET password_hash = ?, invite_token = NULL, invite_expires_at = NULL, password_set = 1 WHERE id = ?')
    .bind(hashHex, user.id).run()

  return c.json({ success: true, message: 'Password set successfully! You can now sign in.', email: user.email })
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
    { id: 'warehouse', label: 'Warehouse' },
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

    { id: 'audit', label: 'Audit Log' },
    { id: 'snapshots', label: 'Snapshots' },
    { id: 'categories', label: 'Categories' },
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
  reports: [
    { id: 'financial', label: 'Financial' },
    { id: 'sales', label: 'Sales' },
    { id: 'products', label: 'Products' },
    { id: 'purchasing', label: 'Purchasing' },
    { id: 'delivery', label: 'Delivery' },
    { id: 'returns', label: 'Returns' },
    { id: 'customers', label: 'Customers' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'fleet', label: 'Fleet' },
    { id: 'warehouse', label: 'Warehouse' },
    { id: 'export', label: 'Data Export' },
  ],
  pos: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'register', label: 'Register' },
    { id: 'sales', label: 'Sales' },
    { id: 'customers', label: 'Customers' },
    { id: 'refunds', label: 'Refunds' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'inventory-requests', label: 'Inventory Requests' },
    { id: 'statements', label: 'Statements' },
  ],
  tasks: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'my-tasks', label: 'My Tasks' },
    { id: 'all-tasks', label: 'All Tasks' },
    { id: 'create', label: 'Create Task' },
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

// ==================== AI HELP ASSISTANT ====================

app.post('/api/help/ask', async (c) => {
  const apiKey = c.env.OPENAI_API_KEY
  const baseUrl = c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  if (!apiKey) return c.json({ answer: 'AI help is not configured. Ask your admin to set up the OpenAI API key.' })

  const body = await c.req.json().catch(() => ({}))
  const question = body.question || ''
  const module = body.module || ''
  const page = body.page || ''

  if (!question) return c.json({ error: 'No question provided' }, 400)

  const systemPrompt = `You are a friendly help assistant for British Feed Operations (BF Ops), an animal feed delivery company in South Florida. You help staff who may not be very tech-savvy understand how to use the system.

CRITICAL RULES:
- Answer in VERY SIMPLE language. Short sentences. Use bullet points.
- Never say "click" — say "tap" (they're on tablets/phones mostly)
- Explain like you're talking to someone who just learned to use a phone
- Keep answers under 200 words
- Use emoji to make it visual and easy to scan
- If you don't know something, say "I'm not sure about that — ask your manager"

The user is currently in: MODULE="${module}", PAGE="${page}"

Here is what every page does:

LOGISTICS MODULE:
- Today: Morning briefing page. Shows what needs doing RIGHT NOW. Big colored boxes: 🔴=urgent, 🟡=needs attention, 🟢=all good. Has "Start Today's Deliveries" button for the step-by-step autopilot wizard.
- Dashboard: Overview of today's deliveries, order counts, recent activity.
- Orders: All delivery orders. Can create, edit, assign to routes. Filter by status, date, customer.
- Ticket Review: QuickBooks-style split screen. Left side shows orders, right side shows details. Scan barcodes to mark items ready.
- Schedule: Calendar view of deliveries. See which days have orders.
- Routes: Delivery routes. Each route has stops (customers). Can drag-and-drop to reorder.
- Route Builder: Visual map to build routes. Drag customers onto routes, see distances.
- Zones: Delivery zones by area. Each zone has delivery days (mon/wed/fri etc). Color-coded.
- Recurring: Customer recurring/standing orders. Set up weekly schedules.
- Standing Orders: Text message confirmation system. Generate a run → AI writes personalized texts → send → customers reply C to confirm or text changes → orders auto-created.
- SO Dashboard: Quick view of standing order runs. See who's confirmed, waiting, changed. Big colored status circles. Has daily digest button.
- Seasonality: Manage seasonal customers. Track when they arrive/depart. Send welcome/farewell texts.
- Customers: Customer list. Business name, phone, address, zone, delivery notes.
- Products: Product catalog. Names, SKUs, prices, categories (horse, hay, feed, shavings, etc).
- Fleet (Trucks): Manage delivery trucks.
- Drivers: Assign drivers to routes.
- Maintenance: Fleet maintenance tracking.
- Warehouse: Warehouse operations, packing.
- Driver View: What drivers see on their phone during deliveries. Navigation, delivery confirmations.
- Packing Lists: Print packing lists for orders being prepared.
- Returns: Handle product returns.
- AI Learning: The AI learns from past orders to get smarter about recommendations.
- Fleet Tracking: Live GPS tracking of delivery trucks.
- Fleet Sync: Sync fleet data with external systems.

STANDING ORDERS WORKFLOW (this is the main daily workflow):
1. Go to "Today" page or "Standing Orders"
2. Tap "Start Today's Deliveries" (or "New Confirmation Run")
3. Pick the delivery date → system pulls all customers in zones that deliver that day
4. Tap "Generate AI Texts" → AI writes personalized messages for each customer
5. Review messages if needed (or just trust the AI)
6. Tap "Send All Texts" → texts go out via SMS
7. Wait for replies: customers text C to confirm, or text changes, or N to decline
8. Status shows: ✅=confirmed, 🟡=waiting, 🟣=changed, 🔴=declined, ⚪=no reply
9. If changes: review what they said, confirm or decline
10. Send reminders to people who haven't replied
11. After cutoff: expire no-responses
12. Confirmed orders auto-create in the system

INVENTORY MODULE:
- Dashboard: Stock overview by location.
- Stock: Current stock levels at each location (Loxahatchee Retail, Aldi Warehouse).
- Products: Same product catalog, inventory-focused view.
- Count: Physical inventory counts. Scan or enter quantities.
- Transfers: Move stock between locations. Pack, ship, receive.

PURCHASING MODULE:
- Dashboard: Purchase order overview.
- Orders: Create purchase orders to suppliers.
- Requests: Staff request items they need (smart restock suggestions).
- Arriving: Track incoming shipments from suppliers.
- Bills: Manage supplier invoices.
- Suppliers: Supplier directory.

CRM MODULE:
- Dashboard: Customer relationship overview.
- Pipeline: Sales pipeline stages.
- Organizations: Company/business profiles.
- Contacts: Individual contact details.

TASKS MODULE:
- Team tasks and notifications. Auto-created tasks from standing orders, seasonal events, etc.
- Bell icon in top bar shows notifications. Red badge = unread.

POS MODULE:
- Point of Sale for in-store purchases.
- Register: Process walk-in sales.

GENERAL TIPS:
- The 🔔 bell icon at top shows notifications. Tap it to see what's new.
- The sidebar on the left has all pages. On mobile, tap ☰ to open it.
- "Today" page is the simplest view — just follow the big buttons.
- Most actions auto-create tasks and notifications for the team.
- The system auto-texts customers — you just review and approve.
- If something breaks, try refreshing the page.
- On mobile: use the 4 buttons at the bottom (Today, Messages, Alerts, More).`

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        max_tokens: 800,
        temperature: 0.5,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question }
        ]
      })
    })

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '')
      console.error('AI help error:', resp.status, errBody)
      return c.json({ answer: 'Sorry, I couldn\'t think of an answer right now. Try again in a moment!' })
    }

    const data = await resp.json() as any
    const answer = (data.choices?.[0]?.message?.content || '').trim()
    if (!answer) {
      return c.json({ answer: 'I\'m thinking... but I couldn\'t come up with an answer. Try asking in a different way!' })
    }
    return c.json({ answer })
  } catch (e: any) {
    return c.json({ answer: 'Sorry, something went wrong. Try again!' })
  }
})

// ==================== MOUNT MODULES ====================
// Inventory module: /api/inventory/*
app.route('/', inventoryApp)

// Purchasing module: /api/purchasing/*
app.route('/', purchasingApp)

// CRM module: /api/crm/*
app.route('/', crmApp)

// Reports module: /api/reports/*
app.route('/', reportsApp)

// POS module: /api/pos/*
app.route('/', posApp)

// Tasks & Notifications module: /api/tasks/*, /api/notifications/*
app.route('/', tasksApp)

// Standing Orders & SMS Confirmations: /api/standing-orders/*, /api/sms/*
app.route('/', standingOrdersApp)

// Logistics module: /api/orders, /api/routes, /api/customers, etc.
app.route('/', logisticsApp)

// ==================== SERVE INVITE PAGE (PUBLIC — NO AUTH) ====================
app.get('/invite/:token', (c) => {
  const token = c.req.param('token')
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Set Up Your Account — BF Operations</title>
  <meta name="theme-color" content="#0F172A">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background: linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #334155 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .invite-card { background: white; border-radius: 16px; width: 440px; max-width: 92vw; box-shadow: 0 25px 80px rgba(0,0,0,.4); overflow: hidden; }
    .invite-header { background: linear-gradient(135deg, #10B981, #059669); padding: 32px; text-align: center; color: white; }
    .invite-header i { font-size: 40px; margin-bottom: 12px; }
    .invite-header h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .invite-header p { font-size: 13px; opacity: 0.9; }
    .invite-body { padding: 28px; }
    .invite-label { font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px; }
    .invite-input { width: 100%; padding: 12px 14px; border: 2px solid #E2E8F0; border-radius: 10px; font-size: 14px; font-family: inherit; transition: border-color .2s; outline: none; }
    .invite-input:focus { border-color: #10B981; }
    .invite-btn { width: 100%; padding: 14px; background: linear-gradient(135deg, #10B981, #059669); color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; transition: transform .1s, box-shadow .2s; }
    .invite-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 15px rgba(16,185,129,.4); }
    .invite-btn:active { transform: translateY(0); }
    .invite-btn:disabled { opacity: .6; cursor: not-allowed; transform: none; }
    .invite-msg { padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; display: none; }
    .invite-msg.error { background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; display: block; }
    .invite-msg.success { background: #ECFDF5; color: #059669; border: 1px solid #A7F3D0; display: block; }
    .invite-info { background: #F8FAFC; border-radius: 10px; padding: 14px; margin-bottom: 20px; }
    .invite-info .name { font-size: 15px; font-weight: 700; color: #1E293B; }
    .invite-info .email { font-size: 13px; color: #64748B; }
    .pw-strength { height: 4px; border-radius: 2px; margin-top: 6px; transition: all .3s; background: #E2E8F0; }
    .pw-strength.weak { background: #EF4444; width: 33%; }
    .pw-strength.medium { background: #F59E0B; width: 66%; }
    .pw-strength.strong { background: #10B981; width: 100%; }
    .pw-toggle { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #94A3B8; font-size: 14px; }
  </style>
</head>
<body>
  <div class="invite-card" id="inviteCard">
    <div class="invite-header">
      <i class="fas fa-user-shield"></i>
      <h1>Set Up Your Account</h1>
      <p>BF Operations Portal</p>
    </div>
    <div class="invite-body" id="inviteBody">
      <div style="text-align:center;padding:40px 0">
        <i class="fas fa-spinner fa-spin" style="font-size:28px;color:#10B981"></i>
        <p style="margin-top:12px;color:#64748B;font-size:14px">Validating your invite...</p>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/axios@1.7.0/dist/axios.min.js"></script>
  <script>
    var INVITE_TOKEN = '${token}';

    // Validate the token on page load
    (async function() {
      var body = document.getElementById('inviteBody');
      try {
        var resp = await axios.get('/api/invite/' + INVITE_TOKEN);
        var d = resp.data;
        renderSetupForm(d.name, d.email);
      } catch(err) {
        var msg = (err.response && err.response.data && err.response.data.error) || 'Invalid or expired invite link';
        body.innerHTML = '<div style="text-align:center;padding:30px 0">' +
          '<i class="fas fa-exclamation-triangle" style="font-size:36px;color:#F59E0B;margin-bottom:12px"></i>' +
          '<h3 style="font-size:16px;font-weight:700;color:#1E293B;margin-bottom:8px">Invite Not Valid</h3>' +
          '<p style="color:#64748B;font-size:13px;line-height:1.5;max-width:320px;margin:0 auto">' + msg + '</p>' +
          '<a href="/app" style="display:inline-block;margin-top:20px;padding:10px 20px;background:#3B82F6;color:white;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600"><i class="fas fa-sign-in-alt"></i> Go to Login</a>' +
          '</div>';
      }
    })();

    function renderSetupForm(name, email) {
      var body = document.getElementById('inviteBody');
      body.innerHTML =
        '<div class="invite-info">' +
          '<div class="name"><i class="fas fa-user" style="color:#10B981;margin-right:8px"></i>' + name + '</div>' +
          '<div class="email" style="margin-top:2px;padding-left:26px">' + email + '</div>' +
        '</div>' +
        '<div id="inviteMsg" class="invite-msg"></div>' +
        '<form id="inviteForm" style="display:flex;flex-direction:column;gap:16px">' +
          '<div>' +
            '<label class="invite-label">Create Password</label>' +
            '<div style="position:relative">' +
              '<input class="invite-input" type="password" id="invPw1" placeholder="At least 6 characters" required minlength="6">' +
              '<button type="button" class="pw-toggle" id="togglePw1"><i class="fas fa-eye"></i></button>' +
            '</div>' +
            '<div class="pw-strength" id="pwStrength"></div>' +
          '</div>' +
          '<div>' +
            '<label class="invite-label">Confirm Password</label>' +
            '<div style="position:relative">' +
              '<input class="invite-input" type="password" id="invPw2" placeholder="Re-enter your password" required minlength="6">' +
              '<button type="button" class="pw-toggle" id="togglePw2"><i class="fas fa-eye"></i></button>' +
            '</div>' +
          '</div>' +
          '<button type="submit" class="invite-btn" id="inviteSubmitBtn"><i class="fas fa-check-circle"></i> Set Password &amp; Activate</button>' +
        '</form>';
      // Bind events after DOM is set
      document.getElementById('invPw1').addEventListener('input', function() { checkStrength(this.value); });
      document.getElementById('togglePw1').addEventListener('click', function() { togglePw('invPw1', this); });
      document.getElementById('togglePw2').addEventListener('click', function() { togglePw('invPw2', this); });
      document.getElementById('inviteForm').addEventListener('submit', function(e) { setupPassword(e); });
    }

    function togglePw(id, btn) {
      var inp = document.getElementById(id);
      if (inp.type === 'password') { inp.type = 'text'; btn.innerHTML = '<i class="fas fa-eye-slash"></i>'; }
      else { inp.type = 'password'; btn.innerHTML = '<i class="fas fa-eye"></i>'; }
    }

    function checkStrength(pw) {
      var bar = document.getElementById('pwStrength');
      if (!pw) { bar.className = 'pw-strength'; return; }
      var score = 0;
      if (pw.length >= 6) score++;
      if (pw.length >= 10) score++;
      if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
      if (/[0-9]/.test(pw)) score++;
      if (/[^A-Za-z0-9]/.test(pw)) score++;
      if (score <= 2) bar.className = 'pw-strength weak';
      else if (score <= 3) bar.className = 'pw-strength medium';
      else bar.className = 'pw-strength strong';
    }

    async function setupPassword(e) {
      e.preventDefault();
      var pw1 = document.getElementById('invPw1').value;
      var pw2 = document.getElementById('invPw2').value;
      var msgEl = document.getElementById('inviteMsg');
      var btn = document.getElementById('inviteSubmitBtn');

      if (pw1 !== pw2) {
        msgEl.className = 'invite-msg error';
        msgEl.textContent = 'Passwords do not match.';
        return;
      }
      if (pw1.length < 6) {
        msgEl.className = 'invite-msg error';
        msgEl.textContent = 'Password must be at least 6 characters.';
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Setting up...';
      msgEl.style.display = 'none';

      try {
        var resp = await axios.post('/api/invite/' + INVITE_TOKEN + '/setup', { password: pw1 });
        var d = resp.data;
        // Show success
        document.getElementById('inviteBody').innerHTML =
          '<div style="text-align:center;padding:30px 0">' +
            '<i class="fas fa-check-circle" style="font-size:48px;color:#10B981;margin-bottom:16px"></i>' +
            '<h3 style="font-size:18px;font-weight:700;color:#1E293B;margin-bottom:8px">You&apos;re All Set!</h3>' +
            '<p style="color:#64748B;font-size:13px;margin-bottom:4px">Your password has been set successfully.</p>' +
            '<p style="color:#64748B;font-size:13px;margin-bottom:24px">Sign in with: <strong>' + d.email + '</strong></p>' +
            '<a href="/app" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#10B981,#059669);color:white;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;box-shadow:0 4px 15px rgba(16,185,129,.3)"><i class="fas fa-sign-in-alt" style="margin-right:6px"></i> Sign In Now</a>' +
          '</div>';
        // Update header to show success
        document.querySelector('.invite-header').style.background = 'linear-gradient(135deg, #10B981, #047857)';
        document.querySelector('.invite-header i').className = 'fas fa-check-circle';
        document.querySelector('.invite-header h1').textContent = 'Account Ready!';
        document.querySelector('.invite-header p').textContent = 'Your portal access is now active';
      } catch(err) {
        var errMsg = (err.response && err.response.data && err.response.data.error) || 'Failed to set password. Please try again.';
        msgEl.className = 'invite-msg error';
        msgEl.textContent = errMsg;
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check-circle"></i> Set Password & Activate';
      }
    }
  </script>
</body>
</html>`)
})

// ==================== SERVE PARENT SHELL ====================
app.get('/', (c) => c.redirect('/app'))
app.get('/app', (c) => renderShell(c))
app.get('/app/*', (c) => renderShell(c))

function renderShell(c: any) {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>BF Operations - British Feed & Supplies</title>
  <meta name="description" content="British Feed and Supplies Operations Management">
  <meta name="theme-color" content="#0F172A">
  <meta name="color-scheme" content="light">

  <!-- PWA Manifest -->
  <link rel="manifest" href="/static/manifest.json">

  <!-- iOS / Apple Meta Tags -->
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="BF Ops">
  <link rel="apple-touch-icon" href="/static/icons/apple-touch-icon.png">
  <link rel="apple-touch-icon" sizes="152x152" href="/static/icons/icon-152.png">
  <link rel="apple-touch-icon" sizes="167x167" href="/static/icons/icon-167.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/static/icons/icon-180.png">

  <!-- Favicon -->
  <link rel="icon" type="image/png" sizes="32x32" href="/static/icons/icon-32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/static/icons/icon-16.png">
  <link rel="shortcut icon" href="/static/favicon.ico">

  <!-- Splash Screens for iOS (common sizes) -->
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">

  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <link href="/static/shell.css?v=${Date.now()}" rel="stylesheet">

  <!-- iOS safe area CSS variables -->
  <style>
    :root {
      --sat: env(safe-area-inset-top, 0px);
      --sar: env(safe-area-inset-right, 0px);
      --sab: env(safe-area-inset-bottom, 0px);
      --sal: env(safe-area-inset-left, 0px);
    }
  </style>
</head>
<body class="font-sans">
  <div id="bf-ops-root"></div>
  <script src="https://cdn.jsdelivr.net/npm/axios@1.7.0/dist/axios.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.13/dayjs.min.js"></script>
  <script src="/static/capacitor-init.js"></script>
  <script src="/static/shell.js?v=${Date.now()}"></script>

  <!-- Service Worker Registration -->
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/static/sw.js').then(function(reg) {
          console.log('[SW] Registered:', reg.scope);
        }).catch(function(err) {
          console.warn('[SW] Registration failed:', err);
        });
      });
    }
  </script>
</body>
</html>`)
}

export default app
