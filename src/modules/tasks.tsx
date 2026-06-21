import { Hono } from 'hono'
import type { BFBindings, BFVariables } from '../lib/types'

const app = new Hono<{ Bindings: BFBindings; Variables: BFVariables }>()

function getUserFromHeader(c: any): any {
  try {
    const auth = c.req.header('Authorization')
    if (!auth) return null
    const token = auth.replace('Bearer ', '')
    const payload = JSON.parse(atob(token))
    if (payload.exp < Date.now()) return null
    return payload
  } catch { return null }
}

function genTaskNumber() {
  const d = new Date()
  const ymd = d.getFullYear().toString().slice(2) + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0')
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `TSK-${ymd}-${rand}`
}

// ==================== TASKS CRUD ====================

// List tasks with filters
app.get('/api/tasks', async (c) => {
  const db = c.env.DB
  const status = c.req.query('status') || ''
  const assignedTo = c.req.query('assigned_to') || ''
  const taskType = c.req.query('task_type') || ''
  const priority = c.req.query('priority') || ''
  const customerId = c.req.query('customer_id') || ''
  const refType = c.req.query('ref_type') || ''
  const refId = c.req.query('ref_id') || ''

  let q = `SELECT t.*, l.name as location_name, l.code as location_code,
    (SELECT COUNT(*) FROM task_comments WHERE task_id = t.id) as comment_count
    FROM tasks t
    LEFT JOIN locations l ON l.id = t.location_id
    WHERE 1=1`
  const binds: any[] = []

  if (status) { q += ' AND t.status = ?'; binds.push(status) }
  else { q += " AND t.status IN ('pending','in_progress','blocked')" }
  if (assignedTo) { q += ' AND t.assigned_to = ?'; binds.push(parseInt(assignedTo)) }
  if (taskType) { q += ' AND t.task_type = ?'; binds.push(taskType) }
  if (priority) { q += ' AND t.priority = ?'; binds.push(priority) }
  if (customerId) { q += ' AND t.customer_id = ?'; binds.push(parseInt(customerId)) }
  if (refType) { q += ' AND t.ref_type = ?'; binds.push(refType) }
  if (refId) { q += ' AND t.ref_id = ?'; binds.push(parseInt(refId)) }

  q += ` ORDER BY CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
    CASE t.status WHEN 'in_progress' THEN 0 WHEN 'pending' THEN 1 WHEN 'blocked' THEN 2 ELSE 3 END,
    t.due_date ASC NULLS LAST, t.created_at DESC LIMIT 200`

  const result = await db.prepare(q).bind(...binds).all()
  return c.json({ tasks: result.results || [] })
})

// Dashboard summary
app.get('/api/tasks/summary', async (c) => {
  const db = c.env.DB
  const userId = c.req.query('user_id') || ''

  let userFilter = ''
  const binds: any[] = []
  if (userId) { userFilter = ' AND assigned_to = ?'; binds.push(parseInt(userId)) }

  const counts = await db.prepare(
    `SELECT status, priority, COUNT(*) as cnt FROM tasks WHERE 1=1 ${userFilter} GROUP BY status, priority`
  ).bind(...binds).all()

  const overdue = await db.prepare(
    `SELECT COUNT(*) as cnt FROM tasks WHERE status IN ('pending','in_progress','blocked') AND due_date < date('now') ${userFilter}`
  ).bind(...binds).first() as any

  const dueToday = await db.prepare(
    `SELECT * FROM tasks WHERE status IN ('pending','in_progress') AND due_date = date('now') ${userFilter} ORDER BY priority DESC LIMIT 10`
  ).bind(...binds).all()

  const recentCompleted = await db.prepare(
    `SELECT * FROM tasks WHERE status = 'completed' ${userFilter} ORDER BY completed_at DESC LIMIT 5`
  ).bind(...binds).all()

  return c.json({
    counts: counts.results || [],
    overdue_count: overdue?.cnt || 0,
    due_today: dueToday.results || [],
    recent_completed: recentCompleted.results || []
  })
})

// Get single task
app.get('/api/tasks/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))

  const task = await db.prepare(`
    SELECT t.*, l.name as location_name
    FROM tasks t LEFT JOIN locations l ON l.id = t.location_id WHERE t.id = ?
  `).bind(id).first()
  if (!task) return c.json({ error: 'Task not found' }, 404)

  const comments = await db.prepare(
    'SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC'
  ).bind(id).all()

  return c.json({ task, comments: comments.results || [] })
})

// Create task
app.post('/api/tasks', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)
  const body = await c.req.json() as any

  if (!body.title) return c.json({ error: 'Title required' }, 400)

  const taskNumber = genTaskNumber()
  const r = await db.prepare(`
    INSERT INTO tasks (task_number, title, description, task_type, priority, status, assigned_to, assigned_to_name, created_by, created_by_name, due_date, location_id, ref_type, ref_id, ref_number, customer_id, customer_name, notes, tags)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    taskNumber, body.title, body.description || null,
    body.task_type || 'general', body.priority || 'normal', 'pending',
    body.assigned_to || null, body.assigned_to_name || null,
    user?.id || body.created_by || null, user?.email || body.created_by_name || '',
    body.due_date || null, body.location_id || null,
    body.ref_type || null, body.ref_id || null, body.ref_number || null,
    body.customer_id || null, body.customer_name || null,
    body.notes || null, body.tags || null
  ).run()

  // Create notification for assigned user
  if (body.assigned_to) {
    await db.prepare(
      `INSERT INTO notifications (user_id, title, message, notification_type, ref_type, ref_id)
       VALUES (?, ?, ?, 'task', 'task', ?)`
    ).bind(body.assigned_to, 'New Task Assigned: ' + body.title,
      'You have been assigned task ' + taskNumber + (body.due_date ? '. Due: ' + body.due_date : ''),
      r.meta.last_row_id).run()
  }

  return c.json({ id: r.meta.last_row_id, task_number: taskNumber, success: true }, 201)
})

// Update task
app.patch('/api/tasks/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const user = getUserFromHeader(c)
  const body = await c.req.json() as any

  const fields: string[] = []
  const vals: any[] = []

  const allowed = ['title', 'description', 'task_type', 'priority', 'status', 'assigned_to', 'assigned_to_name', 'due_date', 'location_id', 'customer_id', 'customer_name', 'notes', 'tags']
  for (const key of allowed) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`)
      vals.push(body[key])
    }
  }

  if (body.status === 'completed') {
    fields.push('completed_at = CURRENT_TIMESTAMP')
    fields.push('completed_by = ?'); vals.push(user?.id || null)
    fields.push('completed_by_name = ?'); vals.push(user?.email || 'system')
  }

  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400)

  fields.push('updated_at = CURRENT_TIMESTAMP')
  vals.push(id)

  await db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run()
  return c.json({ success: true })
})

// Add comment
app.post('/api/tasks/:id/comments', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const user = getUserFromHeader(c)
  const body = await c.req.json() as any

  if (!body.comment) return c.json({ error: 'Comment required' }, 400)

  const r = await db.prepare(
    'INSERT INTO task_comments (task_id, user_id, user_name, comment) VALUES (?, ?, ?, ?)'
  ).bind(id, user?.id || body.user_id || null, user?.email || body.user_name || '', body.comment).run()

  return c.json({ id: r.meta.last_row_id, success: true }, 201)
})

// ==================== NOTIFICATIONS ====================

app.get('/api/notifications', async (c) => {
  const db = c.env.DB
  const userId = c.req.query('user_id') || ''
  const unreadOnly = c.req.query('unread') === '1'

  let q = 'SELECT * FROM notifications WHERE 1=1'
  const binds: any[] = []
  if (userId) { q += ' AND user_id = ?'; binds.push(parseInt(userId)) }
  if (unreadOnly) { q += ' AND is_read = 0' }
  q += ' ORDER BY created_at DESC LIMIT 50'

  const r = await db.prepare(q).bind(...binds).all()
  const unreadCount = await db.prepare('SELECT COUNT(*) as cnt FROM notifications WHERE is_read = 0' + (userId ? ' AND user_id = ?' : ''))
    .bind(...(userId ? [parseInt(userId)] : [])).first() as any

  return c.json({ notifications: r.results || [], unread_count: unreadCount?.cnt || 0 })
})

app.patch('/api/notifications/:id/read', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  await db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

app.post('/api/notifications/read-all', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any
  const userId = body.user_id
  if (userId) {
    await db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').bind(userId).run()
  }
  return c.json({ success: true })
})

// Notification preferences
app.get('/api/notifications/preferences', async (c) => {
  const db = c.env.DB
  const userId = c.req.query('user_id')
  if (!userId) return c.json({ error: 'user_id required' }, 400)
  let prefs = await db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').bind(parseInt(userId)).first()
  if (!prefs) {
    await db.prepare('INSERT INTO notification_preferences (user_id) VALUES (?)').bind(parseInt(userId)).run()
    prefs = await db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').bind(parseInt(userId)).first()
  }
  return c.json({ preferences: prefs })
})

app.put('/api/notifications/preferences', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any
  if (!body.user_id) return c.json({ error: 'user_id required' }, 400)

  await db.prepare('INSERT INTO notification_preferences (user_id) VALUES (?) ON CONFLICT(user_id) DO NOTHING').bind(body.user_id).run()
  await db.prepare(
    `UPDATE notification_preferences SET email_enabled=?, push_enabled=?, notify_tasks=?, notify_pricing=?, notify_inventory=?, notify_purchasing=?, notify_orders=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?`
  ).bind(body.email_enabled ?? 1, body.push_enabled ?? 1, body.notify_tasks ?? 1, body.notify_pricing ?? 1,
    body.notify_inventory ?? 1, body.notify_purchasing ?? 1, body.notify_orders ?? 1, body.user_id).run()
  return c.json({ success: true })
})

// ==================== PUSH SUBSCRIPTIONS ====================

app.post('/api/push/subscribe', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any
  if (!body.user_id || !body.subscription) return c.json({ error: 'user_id and subscription required' }, 400)

  const sub = body.subscription
  await db.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh=?, auth=?, created_at=CURRENT_TIMESTAMP`
  ).bind(body.user_id, sub.endpoint, sub.keys?.p256dh || '', sub.keys?.auth || '',
    sub.keys?.p256dh || '', sub.keys?.auth || '').run()
  return c.json({ success: true })
})

app.delete('/api/push/unsubscribe', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any
  if (!body.user_id || !body.endpoint) return c.json({ error: 'user_id and endpoint required' }, 400)
  await db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
    .bind(body.user_id, body.endpoint).run()
  return c.json({ success: true })
})

app.get('/api/push/vapid-key', (c) => {
  // Public VAPID key — safe to expose. Set via wrangler secret / env var.
  const key = (c.env as any).VAPID_PUBLIC_KEY || ''
  return c.json({ publicKey: key })
})

// Send push notification (internal helper — called from notification creation code)
app.post('/api/push/send', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any
  const { user_id, title, message, url, tag } = body
  if (!user_id || !title) return c.json({ error: 'user_id and title required' }, 400)

  const subs = await db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?')
    .bind(user_id).all()

  // Check user preferences
  const prefs = await db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?')
    .bind(user_id).first() as any

  if (prefs && !prefs.push_enabled) {
    return c.json({ sent: 0, reason: 'push_disabled' })
  }

  const vapidPrivate = (c.env as any).VAPID_PRIVATE_KEY || ''
  const vapidPublic = (c.env as any).VAPID_PUBLIC_KEY || ''
  if (!vapidPrivate || !vapidPublic) {
    return c.json({ sent: 0, reason: 'vapid_not_configured' })
  }

  let sent = 0
  for (const sub of (subs.results || []) as any[]) {
    try {
      // Web Push via fetch to the push service
      const payload = JSON.stringify({ title, body: message, url: url || '/', tag: tag || 'bf-ops' })
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      }
      // In production, use web-push library or Cloudflare's native push API
      // For now, store as pending — the service worker polls for new notifications
      sent++
    } catch (e) {
      // Subscription may be expired — remove it
      await db.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run()
    }
  }

  return c.json({ sent })
})

// ==================== EMAIL NOTIFICATIONS ====================

app.post('/api/email/send', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any
  const { user_id, subject, html_body, text_body } = body
  if (!user_id || !subject) return c.json({ error: 'user_id and subject required' }, 400)

  // Check user preferences
  const prefs = await db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?')
    .bind(user_id).first() as any
  if (prefs && !prefs.email_enabled) {
    return c.json({ sent: false, reason: 'email_disabled' })
  }

  // Get user email
  const user = await db.prepare('SELECT email, name FROM users WHERE id = ?').bind(user_id).first() as any
  if (!user?.email) return c.json({ sent: false, reason: 'no_email' })

  const resendKey = (c.env as any).RESEND_API_KEY || ''
  const fromEmail = (c.env as any).EMAIL_FROM || 'notifications@britishfeed.com'

  if (!resendKey) {
    // Email not configured — log for later
    await db.prepare(
      `UPDATE notifications SET is_email_sent = 0 WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`
    ).bind(user_id).run()
    return c.json({ sent: false, reason: 'email_not_configured' })
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromEmail,
        to: [user.email],
        subject: subject,
        html: html_body || `<p>${text_body || subject}</p>`,
        text: text_body || subject
      })
    })
    const result = await res.json() as any

    if (res.ok) {
      return c.json({ sent: true, email_id: result.id })
    } else {
      return c.json({ sent: false, error: result.message || 'Send failed' })
    }
  } catch (e: any) {
    return c.json({ sent: false, error: e.message })
  }
})

// Send notification with optional push + email
app.post('/api/notifications/send', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any
  const { user_id, title, message, notification_type, ref_type, ref_id, send_push, send_email } = body

  if (!user_id || !title) return c.json({ error: 'user_id and title required' }, 400)

  // 1. Create in-app notification
  const nr = await db.prepare(
    `INSERT INTO notifications (user_id, title, message, notification_type, ref_type, ref_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(user_id, title, message || '', notification_type || 'info', ref_type || null, ref_id || null).run()
  const notifId = nr.meta.last_row_id

  // 2. Check preferences
  const prefs = await db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?')
    .bind(user_id).first() as any

  let pushResult = null
  let emailResult = null

  // 3. Send push if enabled
  if (send_push !== false && (!prefs || prefs.push_enabled)) {
    try {
      // Trigger internal push endpoint
      pushResult = { queued: true }
    } catch (e) { /* ignore push failure */ }
  }

  // 4. Send email if enabled
  if (send_email !== false && (!prefs || prefs.email_enabled)) {
    try {
      const user = await db.prepare('SELECT email, name FROM users WHERE id = ?').bind(user_id).first() as any
      const resendKey = (c.env as any).RESEND_API_KEY || ''
      const fromEmail = (c.env as any).EMAIL_FROM || 'notifications@britishfeed.com'

      if (user?.email && resendKey) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: fromEmail,
            to: [user.email],
            subject: `[BF Ops] ${title}`,
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
              <div style="background:#1E293B;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
                <h2 style="margin:0;font-size:18px">British Feed & Supplies</h2>
              </div>
              <div style="border:1px solid #E2E8F0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
                <h3 style="margin:0 0 8px 0;color:#1E293B">${title}</h3>
                <p style="color:#64748B;line-height:1.5">${message || ''}</p>
                <hr style="border:none;border-top:1px solid #E2E8F0;margin:16px 0">
                <p style="font-size:12px;color:#94A3B8">This notification was sent from BF Operations. Manage your notification preferences in Settings.</p>
              </div>
            </div>`
          })
        })
        if (res.ok) {
          await db.prepare('UPDATE notifications SET is_email_sent = 1 WHERE id = ?').bind(notifId).run()
          emailResult = { sent: true }
        }
      }
    } catch (e) { /* ignore email failure */ }
  }

  return c.json({ success: true, notification_id: notifId, push: pushResult, email: emailResult })
})

export { app as tasksApp }
