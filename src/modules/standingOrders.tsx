import { Hono } from 'hono'
import type { BFBindings, BFVariables } from '../lib/types'

const app = new Hono<{ Bindings: BFBindings; Variables: BFVariables }>()

// ==================== HELPERS ====================

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

// ==================== AUTO-TASK & NOTIFICATION HELPERS ====================

// Generate a task number like TK-XXXX
function genSOTaskNumber() {
  return 'SO-' + Date.now().toString(36).toUpperCase()
}

// Create a task + notification for the team. user_id=null = broadcast to all.
async function createAutoTask(db: D1Database, opts: {
  title: string, description?: string, task_type?: string, priority?: string,
  due_date?: string, ref_type?: string, ref_id?: number, ref_number?: string,
  customer_id?: number, customer_name?: string, created_by_name?: string
}) {
  const taskNum = genSOTaskNumber()
  try {
    const r = await db.prepare(`
      INSERT INTO tasks (task_number, title, description, task_type, priority, status,
        assigned_to, assigned_to_name, created_by_name, due_date,
        ref_type, ref_id, ref_number, customer_id, customer_name, tags)
      VALUES (?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      taskNum, opts.title, opts.description || null,
      opts.task_type || 'follow_up', opts.priority || 'normal',
      opts.created_by_name || 'System', opts.due_date || null,
      opts.ref_type || null, opts.ref_id || null, opts.ref_number || null,
      opts.customer_id || null, opts.customer_name || null,
      'standing-orders,auto'
    ).run()
    return r.meta.last_row_id
  } catch (e) {
    console.error('Auto-task creation failed:', e)
    return null
  }
}

// Create notification for all team members (user_id = NULL = broadcast)
async function createAutoNotification(db: D1Database, opts: {
  title: string, message?: string, notification_type?: string,
  ref_type?: string, ref_id?: number
}) {
  try {
    await db.prepare(`
      INSERT INTO notifications (user_id, title, message, notification_type, ref_type, ref_id)
      VALUES (NULL, ?, ?, ?, ?, ?)
    `).bind(
      opts.title, opts.message || '',
      opts.notification_type || 'info',
      opts.ref_type || null, opts.ref_id || null
    ).run()
  } catch (e) {
    console.error('Auto-notification failed:', e)
  }
}

// ==================== CONFIRMATION RUNS ====================

// List all confirmation runs
app.get('/api/standing-orders/runs', async (c) => {
  const db = c.env.DB
  const status = c.req.query('status')
  const limit = parseInt(c.req.query('limit') || '20')
  let q = 'SELECT * FROM confirmation_runs'
  const binds: any[] = []
  if (status) { q += ' WHERE status = ?'; binds.push(status) }
  q += ' ORDER BY run_date DESC, created_at DESC LIMIT ?'
  binds.push(limit)
  try {
    const runs = await db.prepare(q).bind(...binds).all()
    return c.json({ runs: runs.results })
  } catch (e: any) {
    return c.json({ runs: [], error: e.message })
  }
})

// Get single run with all entries
app.get('/api/standing-orders/runs/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  try {
    const run = await db.prepare('SELECT * FROM confirmation_runs WHERE id = ?').bind(id).first()
    if (!run) return c.json({ error: 'Run not found' }, 404)

    const entries = await db.prepare(`
      SELECT ce.*,
        c.business_name, c.phone as customer_phone_main, c.sms_phone,
        dz.name as zone_name, dz.color as zone_color
      FROM confirmation_entries ce
      LEFT JOIN customers c ON ce.customer_id = c.id
      LEFT JOIN delivery_zones dz ON ce.zone_id = dz.id
      WHERE ce.run_id = ?
      ORDER BY ce.status ASC, c.business_name ASC
    `).bind(id).all()

    return c.json({ run, entries: entries.results })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// Generate a new confirmation run for a given date
app.post('/api/standing-orders/runs/generate', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)
  const body = await c.req.json()
  const runDate = body.run_date // e.g. "2026-06-23"
  const cutoffTime = body.cutoff_time || null // e.g. "2026-06-22T18:00:00"
  const includeZoneIds: number[] = body.zone_ids || [] // which zones to include
  const includeBroadcast = body.include_broadcast !== false // send "want anything?" to non-standing customers

  if (!runDate) return c.json({ error: 'run_date is required' }, 400)

  // Determine day of week
  const d = new Date(runDate + 'T12:00:00Z')
  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const deliveryDay = dayNames[d.getUTCDay()]

  // Get all zones that deliver on this day
  let zones: any[] = []
  try {
    const allZones = await db.prepare('SELECT * FROM delivery_zones WHERE active = 1').all()
    zones = (allZones.results as any[]).filter(z => {
      const days = (z.delivery_days || '').split(',').map((s: string) => s.trim())
      if (!days.includes(deliveryDay)) return false
      if (includeZoneIds.length > 0 && !includeZoneIds.includes(z.id)) return false
      return true
    })
  } catch (e: any) {
    return c.json({ error: 'Failed to load zones: ' + e.message }, 500)
  }

  if (zones.length === 0) {
    return c.json({ error: `No zones deliver on ${deliveryDay} (${runDate})` }, 400)
  }

  const zoneIds = zones.map(z => z.id)
  const zoneIdStr = zoneIds.join(',')

  // Create the run record
  const runRes = await db.prepare(`
    INSERT INTO confirmation_runs (run_date, delivery_day, zone_ids, status, cutoff_time, created_by, created_by_name)
    VALUES (?, ?, ?, 'draft', ?, ?, ?)
  `).bind(runDate, deliveryDay, zoneIdStr, cutoffTime, user?.id || null, user?.name || user?.email || 'System').run()
  const runId = runRes.meta.last_row_id

  let totalEntries = 0
  let broadcastCount = 0
  const processedCustomerIds = new Set<number>()

  // 1. Standing orders: find all active recurring_schedules for customers in these zones
  try {
    const placeholders = zoneIds.map(() => '?').join(',')
    const standingCustomers = await db.prepare(`
      SELECT DISTINCT rs.id as schedule_id, rs.customer_id, rs.address_id, rs.confirm_mode, rs.auto_confirm,
        c.business_name, c.phone, c.sms_phone, c.sms_opt_in, c.is_seasonal, c.season_status,
        a.zone_id
      FROM recurring_schedules rs
      JOIN customers c ON rs.customer_id = c.id
      LEFT JOIN addresses a ON rs.address_id = a.id
      WHERE rs.status = 'active'
        AND c.active = 1
        AND (rs.confirm_mode IS NULL OR rs.confirm_mode != 'skip')
        AND (c.is_seasonal = 0 OR c.season_status IS NULL OR c.season_status NOT IN ('out_of_season'))
        AND a.zone_id IN (${placeholders})
    `).bind(...zoneIds).all()

    for (const sc of standingCustomers.results as any[]) {
      // Get the items for this schedule
      const items = await db.prepare(`
        SELECT rsi.product_id, rsi.quantity, p.name as product_name, p.unit_type, p.sku
        FROM recurring_schedule_items rsi
        JOIN products p ON rsi.product_id = p.id
        WHERE rsi.schedule_id = ?
      `).bind(sc.schedule_id).all()

      const proposedItems = (items.results as any[]).map(i => ({
        product_id: i.product_id, product_name: i.product_name,
        quantity: i.quantity, unit_type: i.unit_type || 'bag', sku: i.sku
      }))

      const confirmMode = sc.confirm_mode || (sc.auto_confirm ? 'auto' : 'text_confirm')
      const phone = sc.sms_phone || sc.phone
      const initialStatus = confirmMode === 'auto' ? 'confirmed' : 'pending'

      await db.prepare(`
        INSERT INTO confirmation_entries
          (run_id, customer_id, customer_name, customer_phone, address_id, zone_id,
           entry_type, schedule_id, status, proposed_items)
        VALUES (?, ?, ?, ?, ?, ?, 'standing', ?, ?, ?)
      `).bind(
        runId, sc.customer_id, sc.business_name, phone, sc.address_id, sc.zone_id,
        sc.schedule_id, initialStatus, JSON.stringify(proposedItems)
      ).run()

      processedCustomerIds.add(sc.customer_id)
      totalEntries++
    }
  } catch (e: any) {
    console.error('Standing orders query error:', e.message)
  }

  // 2. Broadcast: all other customers in these zones who have sms_opt_in
  if (includeBroadcast) {
    try {
      const placeholders = zoneIds.map(() => '?').join(',')
      const broadcastCustomers = await db.prepare(`
        SELECT DISTINCT c.id as customer_id, c.business_name, c.phone, c.sms_phone, c.sms_opt_in,
          c.is_seasonal, c.season_status,
          a.id as address_id, a.zone_id
        FROM customers c
        JOIN addresses a ON a.customer_id = c.id
        WHERE c.active = 1
          AND (c.sms_opt_in IS NULL OR c.sms_opt_in = 1)
          AND (c.is_seasonal = 0 OR c.season_status IS NULL OR c.season_status NOT IN ('out_of_season'))
          AND a.zone_id IN (${placeholders})
        ORDER BY c.business_name
      `).bind(...zoneIds).all()

      for (const bc of broadcastCustomers.results as any[]) {
        if (processedCustomerIds.has(bc.customer_id)) continue
        const phone = bc.sms_phone || bc.phone
        if (!phone) continue

        await db.prepare(`
          INSERT INTO confirmation_entries
            (run_id, customer_id, customer_name, customer_phone, address_id, zone_id,
             entry_type, schedule_id, status, proposed_items)
          VALUES (?, ?, ?, ?, ?, ?, 'broadcast', NULL, 'pending', NULL)
        `).bind(
          runId, bc.customer_id, bc.business_name, phone, bc.address_id, bc.zone_id
        ).run()

        processedCustomerIds.add(bc.customer_id)
        totalEntries++
        broadcastCount++
      }
    } catch (e: any) {
      console.error('Broadcast query error:', e.message)
    }
  }

  // Update run counts
  const standingConfirmed = totalEntries - broadcastCount // auto-confirmed count will be recounted
  await db.prepare(`
    UPDATE confirmation_runs SET total_entries = ?, broadcast_count = ?,
      pending_count = ?, updated_at = datetime('now') WHERE id = ?
  `).bind(totalEntries, broadcastCount, totalEntries, runId).run()

  // Notify team about new run
  await createAutoNotification(db, {
    title: `New confirmation run created: ${runDate} (${deliveryDay})`,
    message: `${totalEntries} customers queued: ${totalEntries - broadcastCount} standing + ${broadcastCount} broadcast. Review and send texts.`,
    notification_type: 'info', ref_type: 'confirmation_run', ref_id: runId as number
  })

  return c.json({
    run_id: runId, run_date: runDate, delivery_day: deliveryDay,
    zones: zones.map(z => ({ id: z.id, name: z.name })),
    total_entries: totalEntries, broadcast_count: broadcastCount,
    standing_count: totalEntries - broadcastCount
  })
})

// ==================== SEND TEXTS (trigger Make webhook) ====================

app.post('/api/standing-orders/runs/:id/send', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)
  const runId = c.req.param('id')

  const run = await db.prepare('SELECT * FROM confirmation_runs WHERE id = ?').bind(runId).first() as any
  if (!run) return c.json({ error: 'Run not found' }, 404)

  // Get pending entries that need texts
  const entries = await db.prepare(`
    SELECT ce.*, c.business_name, c.phone, c.sms_phone, c.sms_opt_in
    FROM confirmation_entries ce
    JOIN customers c ON ce.customer_id = c.id
    WHERE ce.run_id = ? AND ce.status = 'pending'
  `).bind(runId).all()

  const webhookUrl = c.env.MAKE_WEBHOOK_URL
  const broadcastWebhookUrl = c.env.MAKE_BROADCAST_WEBHOOK_URL || webhookUrl
  let sentCount = 0
  let failCount = 0
  const errors: string[] = []

  for (const entry of entries.results as any[]) {
    const phone = entry.customer_phone || entry.sms_phone || entry.phone
    if (!phone) { failCount++; errors.push(`No phone for ${entry.customer_name}`); continue }

    // Use AI-drafted message if available, otherwise build template
    let messageBody = entry.draft_message || ''
    if (!messageBody) {
      if (entry.entry_type === 'standing' && entry.proposed_items) {
        const items = JSON.parse(entry.proposed_items)
        const itemList = items.map((i: any) => `${i.quantity}x ${i.product_name}`).join(', ')
        messageBody = `Hi ${entry.customer_name}! Your standing order for ${run.run_date}: ${itemList}. Reply C to confirm, N to skip, or text changes. Cutoff: ${run.cutoff_time ? new Date(run.cutoff_time).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) : 'EOD'}.`
      } else {
        messageBody = `Hi ${entry.customer_name}! We're delivering in your area on ${run.run_date}. Need anything? Text your order or N to skip.`
      }
    }

    // Log the outbound SMS
    const smsRes = await db.prepare(`
      INSERT INTO sms_messages (confirmation_entry_id, customer_id, customer_phone, direction, message_body, status, sent_at)
      VALUES (?, ?, ?, 'outbound', ?, 'queued', datetime('now'))
    `).bind(entry.id, entry.customer_id, phone, messageBody).run()
    const smsId = smsRes.meta.last_row_id

    // Fire Make webhook (non-blocking best-effort)
    const targetWebhook = entry.entry_type === 'broadcast' ? broadcastWebhookUrl : webhookUrl
    if (targetWebhook) {
      try {
        const resp = await fetch(targetWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: phone,
            message: messageBody,
            customer_name: entry.customer_name,
            customer_id: entry.customer_id,
            entry_id: entry.id,
            run_id: runId,
            entry_type: entry.entry_type,
            run_date: run.run_date
          })
        })
        if (resp.ok) {
          await db.prepare("UPDATE sms_messages SET status = 'sent' WHERE id = ?").bind(smsId).run()
        } else {
          const errText = await resp.text().catch(() => 'unknown')
          await db.prepare("UPDATE sms_messages SET status = 'failed', error_message = ? WHERE id = ?").bind(errText, smsId).run()
          failCount++
          errors.push(`Webhook failed for ${entry.customer_name}: ${resp.status}`)
          continue
        }
      } catch (e: any) {
        await db.prepare("UPDATE sms_messages SET status = 'failed', error_message = ? WHERE id = ?").bind(e.message, smsId).run()
        failCount++
        errors.push(`Webhook error for ${entry.customer_name}: ${e.message}`)
        continue
      }
    }

    // Update entry
    await db.prepare(`
      UPDATE confirmation_entries SET status = 'sent', outbound_sms_id = ?, sms_sent_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(smsId, entry.id).run()
    sentCount++
  }

  // Update run status
  await db.prepare(`
    UPDATE confirmation_runs SET status = 'sent', updated_at = datetime('now') WHERE id = ?
  `).bind(runId).run()

  // Recount
  await recountRun(db, parseInt(runId))

  return c.json({ sent: sentCount, failed: failCount, errors })
})

// ==================== HOLD INVENTORY for pending confirmations ====================

app.post('/api/standing-orders/runs/:id/hold-inventory', async (c) => {
  const db = c.env.DB
  const runId = c.req.param('id')

  // Get all standing entries that are sent or pending with proposed items
  const entries = await db.prepare(`
    SELECT ce.* FROM confirmation_entries ce
    WHERE ce.run_id = ? AND ce.entry_type = 'standing'
      AND ce.hold_created = 0 AND ce.proposed_items IS NOT NULL
      AND ce.status IN ('pending', 'sent')
  `).bind(runId).all()

  let holdCount = 0
  const stockIssues: any[] = []
  const WAREHOUSE_LOC = 2 // ALDI warehouse

  for (const entry of entries.results as any[]) {
    const items = JSON.parse((entry as any).proposed_items || '[]')
    let allAvailable = true

    // Check availability first
    for (const item of items) {
      try {
        const stock = await db.prepare(
          'SELECT qty_available FROM inventory_stock WHERE product_id = ? AND location_id = ?'
        ).bind(item.product_id, WAREHOUSE_LOC).first() as any
        if (!stock || stock.qty_available < item.quantity) {
          allAvailable = false
          stockIssues.push({
            entry_id: (entry as any).id,
            customer_name: (entry as any).customer_name,
            product_name: item.product_name,
            requested: item.quantity,
            available: stock?.qty_available || 0
          })
        }
      } catch { allAvailable = false }
    }

    if (!allAvailable) continue // skip hold if not all available — flag for review

    // Place holds
    for (const item of items) {
      await db.prepare(`
        UPDATE inventory_stock SET qty_on_hold = qty_on_hold + ?, updated_at = datetime('now')
        WHERE product_id = ? AND location_id = ?
      `).bind(item.quantity, item.product_id, WAREHOUSE_LOC).run()
    }
    await db.prepare(
      "UPDATE confirmation_entries SET hold_created = 1, updated_at = datetime('now') WHERE id = ?"
    ).bind((entry as any).id).run()
    holdCount++
  }

  return c.json({ holds_placed: holdCount, stock_issues: stockIssues })
})

// Release holds for declined/expired entries
app.post('/api/standing-orders/entries/:id/release-hold', async (c) => {
  const db = c.env.DB
  const entryId = c.req.param('id')
  const entry = await db.prepare('SELECT * FROM confirmation_entries WHERE id = ?').bind(entryId).first() as any
  if (!entry) return c.json({ error: 'Entry not found' }, 404)
  if (!entry.hold_created || entry.hold_released) return c.json({ message: 'No hold to release' })

  const WAREHOUSE_LOC = 2
  const items = JSON.parse(entry.proposed_items || '[]')
  for (const item of items) {
    await db.prepare(`
      UPDATE inventory_stock SET qty_on_hold = MAX(0, qty_on_hold - ?), updated_at = datetime('now')
      WHERE product_id = ? AND location_id = ?
    `).bind(item.quantity, item.product_id, WAREHOUSE_LOC).run()
  }
  await db.prepare(
    "UPDATE confirmation_entries SET hold_released = 1, updated_at = datetime('now') WHERE id = ?"
  ).bind(entryId).run()

  return c.json({ success: true })
})

// ==================== INBOUND SMS WEBHOOK (from Make) ====================

app.post('/api/sms/inbound', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  // Expected from Make: { phone, message, timestamp? }
  const phone = (body.phone || body.from || '').replace(/\D/g, '')
  const messageBody = body.message || body.text || body.body || ''

  if (!phone || !messageBody) {
    return c.json({ error: 'phone and message are required' }, 400)
  }

  // Find the customer by phone number (check sms_phone first, then phone)
  let customer: any = null
  try {
    customer = await db.prepare(
      "SELECT id, business_name, phone, sms_phone FROM customers WHERE REPLACE(REPLACE(REPLACE(sms_phone, '-', ''), '(', ''), ')', '') LIKE ? OR REPLACE(REPLACE(REPLACE(phone, '-', ''), '(', ''), ')', '') LIKE ?"
    ).bind('%' + phone.slice(-10), '%' + phone.slice(-10)).first()
  } catch { /* table issue */ }

  if (!customer) {
    // Log unknown sender
    await db.prepare(`
      INSERT INTO sms_messages (customer_id, customer_phone, direction, message_body, status, received_at)
      VALUES (NULL, ?, 'inbound', ?, 'received', datetime('now'))
    `).bind(phone, messageBody).run()
    return c.json({ status: 'unknown_sender', phone })
  }

  // Find the most recent active confirmation entry for this customer
  let entry: any = null
  try {
    entry = await db.prepare(`
      SELECT ce.* FROM confirmation_entries ce
      JOIN confirmation_runs cr ON ce.run_id = cr.id
      WHERE ce.customer_id = ? AND ce.status IN ('sent', 'pending', 'modified')
        AND cr.status IN ('sent', 'sending')
      ORDER BY ce.created_at DESC LIMIT 1
    `).bind(customer.id).first()
  } catch { /* table issue */ }

  // Log inbound SMS
  const smsRes = await db.prepare(`
    INSERT INTO sms_messages (confirmation_entry_id, customer_id, customer_phone, direction, message_body, status, received_at)
    VALUES (?, ?, ?, 'inbound', ?, 'received', datetime('now'))
  `).bind(entry?.id || null, customer.id, phone, messageBody).run()
  const smsId = smsRes.meta.last_row_id

  if (!entry) {
    return c.json({ status: 'no_active_entry', customer_id: customer.id, customer_name: customer.business_name })
  }

  // Parse the reply
  const normalizedMsg = messageBody.trim().toUpperCase()
  let newStatus = 'modified' // default: treat as modification needing review

  if (normalizedMsg === 'C' || normalizedMsg === 'Y' || normalizedMsg === 'YES' || normalizedMsg === 'CONFIRM') {
    newStatus = 'confirmed'
  } else if (normalizedMsg === 'N' || normalizedMsg === 'NO' || normalizedMsg === 'SKIP' || normalizedMsg === 'CANCEL') {
    newStatus = 'declined'
  }
  // Anything else = modification (customer wants changes, needs staff review)

  // Update the entry
  const updates: string[] = [`status = '${newStatus}'`, `last_inbound_sms_id = ${smsId}`, "updated_at = datetime('now')"]
  if (newStatus === 'confirmed') {
    updates.push("confirmed_at = datetime('now')")
  }
  if (newStatus === 'modified') {
    // Store the raw message as modified_items (staff will interpret)
    updates.push(`modified_items = '${messageBody.replace(/'/g, "''")}'`)
  }

  await db.prepare(`UPDATE confirmation_entries SET ${updates.join(', ')} WHERE id = ?`).bind(entry.id).run()

  // If confirmed and has proposed items, create the order
  if (newStatus === 'confirmed' && entry.proposed_items) {
    try {
      const orderId = await createOrderFromEntry(db, entry)
      if (orderId) {
        await db.prepare("UPDATE confirmation_entries SET order_id = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(orderId, entry.id).run()
      }
    } catch (e: any) {
      console.error('Auto-create order failed:', e.message)
    }
  }

  // If declined, release inventory hold
  if (newStatus === 'declined' && entry.hold_created && !entry.hold_released) {
    try {
      const WAREHOUSE_LOC = 2
      const items = JSON.parse(entry.proposed_items || '[]')
      for (const item of items) {
        await db.prepare(`
          UPDATE inventory_stock SET qty_on_hold = MAX(0, qty_on_hold - ?), updated_at = datetime('now')
          WHERE product_id = ? AND location_id = ?
        `).bind(item.quantity, item.product_id, WAREHOUSE_LOC).run()
      }
      await db.prepare("UPDATE confirmation_entries SET hold_released = 1, updated_at = datetime('now') WHERE id = ?")
        .bind(entry.id).run()
    } catch (e: any) { console.error('Release hold failed:', e.message) }
  }

  // Recount run
  try { await recountRun(db, entry.run_id) } catch {}

  // ---- AUTO-TASKS & NOTIFICATIONS ----
  if (newStatus === 'modified') {
    // Customer wants changes — task for team to review
    await createAutoTask(db, {
      title: `Review modified order: ${customer.business_name}`,
      description: `Customer replied with changes: "${messageBody}"\n\nOriginal standing order items need to be reviewed and confirmed or adjusted.`,
      task_type: 'customer', priority: 'high',
      ref_type: 'confirmation_entry', ref_id: entry.id,
      customer_id: customer.id, customer_name: customer.business_name,
      created_by_name: 'SMS Auto'
    })
    await createAutoNotification(db, {
      title: `${customer.business_name} wants order changes`,
      message: `Customer replied: "${messageBody.substring(0, 100)}" — needs staff review`,
      notification_type: 'alert', ref_type: 'confirmation_entry', ref_id: entry.id
    })
  } else if (newStatus === 'confirmed') {
    await createAutoNotification(db, {
      title: `${customer.business_name} confirmed their order`,
      message: `Order auto-created from standing order confirmation`,
      notification_type: 'success', ref_type: 'confirmation_entry', ref_id: entry.id
    })
  } else if (newStatus === 'declined') {
    await createAutoNotification(db, {
      title: `${customer.business_name} declined delivery`,
      message: `Customer skipped this delivery. Inventory holds released.`,
      notification_type: 'info', ref_type: 'confirmation_entry', ref_id: entry.id
    })
  }

  return c.json({
    status: newStatus,
    customer_id: customer.id,
    customer_name: customer.business_name,
    entry_id: entry.id,
    order_created: newStatus === 'confirmed'
  })
})

// ==================== MANUAL ENTRY ACTIONS ====================

// Manually confirm an entry (staff action)
app.post('/api/standing-orders/entries/:id/confirm', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)
  const entryId = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))

  const entry = await db.prepare('SELECT * FROM confirmation_entries WHERE id = ?').bind(entryId).first() as any
  if (!entry) return c.json({ error: 'Entry not found' }, 404)

  // If items were modified by staff, use those
  const finalItems = body.items ? JSON.stringify(body.items) : entry.proposed_items

  // Create order
  let orderId = null
  if (finalItems) {
    const itemsParsed = JSON.parse(finalItems)
    // Update proposed_items if staff modified
    if (body.items) {
      await db.prepare("UPDATE confirmation_entries SET proposed_items = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(finalItems, entryId).run()
    }
    orderId = await createOrderFromEntry(db, { ...entry, proposed_items: finalItems })
  }

  await db.prepare(`
    UPDATE confirmation_entries SET status = 'confirmed', order_id = ?, confirmed_at = datetime('now'),
      reviewed_by = ?, reviewed_by_name = ?, review_notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(orderId, user?.id || null, user?.name || user?.email || null, body.notes || null, entryId).run()

  await recountRun(db, entry.run_id)
  return c.json({ success: true, order_id: orderId })
})

// Manually decline an entry
app.post('/api/standing-orders/entries/:id/decline', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)
  const entryId = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))

  const entry = await db.prepare('SELECT * FROM confirmation_entries WHERE id = ?').bind(entryId).first() as any
  if (!entry) return c.json({ error: 'Entry not found' }, 404)

  await db.prepare(`
    UPDATE confirmation_entries SET status = 'declined',
      reviewed_by = ?, reviewed_by_name = ?, review_notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(user?.id || null, user?.name || user?.email || null, body.notes || null, entryId).run()

  // Release hold if any
  if (entry.hold_created && !entry.hold_released) {
    const WAREHOUSE_LOC = 2
    const items = JSON.parse(entry.proposed_items || '[]')
    for (const item of items) {
      await db.prepare(`
        UPDATE inventory_stock SET qty_on_hold = MAX(0, qty_on_hold - ?), updated_at = datetime('now')
        WHERE product_id = ? AND location_id = ?
      `).bind(item.quantity, item.product_id, WAREHOUSE_LOC).run()
    }
    await db.prepare("UPDATE confirmation_entries SET hold_released = 1, updated_at = datetime('now') WHERE id = ?")
      .bind(entryId).run()
  }

  await recountRun(db, entry.run_id)
  return c.json({ success: true })
})

// Send a reply text to customer (outbound from staff)
app.post('/api/standing-orders/entries/:id/reply', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)
  const entryId = c.req.param('id')
  const body = await c.req.json()
  const messageBody = body.message

  if (!messageBody) return c.json({ error: 'message is required' }, 400)

  const entry = await db.prepare('SELECT * FROM confirmation_entries WHERE id = ?').bind(entryId).first() as any
  if (!entry) return c.json({ error: 'Entry not found' }, 404)

  const phone = entry.customer_phone
  if (!phone) return c.json({ error: 'No phone number for customer' }, 400)

  // Log outbound SMS
  const smsRes = await db.prepare(`
    INSERT INTO sms_messages (confirmation_entry_id, customer_id, customer_phone, direction, message_body, status, sent_at)
    VALUES (?, ?, ?, 'outbound', ?, 'queued', datetime('now'))
  `).bind(entryId, entry.customer_id, phone, messageBody).run()
  const smsId = smsRes.meta.last_row_id

  // Fire Make webhook
  const webhookUrl = c.env.MAKE_WEBHOOK_URL
  if (webhookUrl) {
    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone, message: messageBody,
          customer_name: entry.customer_name, customer_id: entry.customer_id,
          entry_id: entryId, run_id: entry.run_id, type: 'staff_reply'
        })
      })
      if (resp.ok) {
        await db.prepare("UPDATE sms_messages SET status = 'sent' WHERE id = ?").bind(smsId).run()
      } else {
        await db.prepare("UPDATE sms_messages SET status = 'failed' WHERE id = ?").bind(smsId).run()
      }
    } catch (e: any) {
      await db.prepare("UPDATE sms_messages SET status = 'failed', error_message = ? WHERE id = ?").bind(e.message, smsId).run()
    }
  }

  return c.json({ success: true, sms_id: smsId })
})

// Get SMS thread for an entry
app.get('/api/standing-orders/entries/:id/messages', async (c) => {
  const db = c.env.DB
  const entryId = c.req.param('id')
  try {
    const messages = await db.prepare(
      'SELECT * FROM sms_messages WHERE confirmation_entry_id = ? ORDER BY created_at ASC'
    ).bind(entryId).all()
    return c.json({ messages: messages.results })
  } catch (e: any) {
    return c.json({ messages: [], error: e.message })
  }
})

// ==================== STOCK CHECK for a run ====================

app.get('/api/standing-orders/runs/:id/stock-check', async (c) => {
  const db = c.env.DB
  const runId = c.req.param('id')
  const WAREHOUSE_LOC = 2

  try {
    const entries = await db.prepare(`
      SELECT ce.* FROM confirmation_entries ce
      WHERE ce.run_id = ? AND ce.entry_type = 'standing' AND ce.proposed_items IS NOT NULL
    `).bind(runId).all()

    // Aggregate total demand by product
    const demand: Record<number, { product_name: string, total_qty: number, entries: number }> = {}
    for (const e of entries.results as any[]) {
      const items = JSON.parse(e.proposed_items || '[]')
      for (const item of items) {
        if (!demand[item.product_id]) {
          demand[item.product_id] = { product_name: item.product_name, total_qty: 0, entries: 0 }
        }
        demand[item.product_id].total_qty += item.quantity
        demand[item.product_id].entries++
      }
    }

    // Check stock for each product
    const stockCheck: any[] = []
    for (const [productId, d] of Object.entries(demand)) {
      const stock = await db.prepare(
        'SELECT qty_on_hand, qty_on_hold, qty_reserved, qty_available FROM inventory_stock WHERE product_id = ? AND location_id = ?'
      ).bind(parseInt(productId), WAREHOUSE_LOC).first() as any

      stockCheck.push({
        product_id: parseInt(productId),
        product_name: d.product_name,
        total_requested: d.total_qty,
        num_entries: d.entries,
        qty_on_hand: stock?.qty_on_hand || 0,
        qty_on_hold: stock?.qty_on_hold || 0,
        qty_available: stock?.qty_available || 0,
        sufficient: (stock?.qty_available || 0) >= d.total_qty,
        shortfall: Math.max(0, d.total_qty - (stock?.qty_available || 0))
      })
    }

    return c.json({ stock_check: stockCheck.sort((a, b) => b.shortfall - a.shortfall) })
  } catch (e: any) {
    return c.json({ stock_check: [], error: e.message })
  }
})

// ==================== EXPIRE ENTRIES past cutoff ====================

app.post('/api/standing-orders/runs/:id/expire', async (c) => {
  const db = c.env.DB
  const runId = c.req.param('id')

  const run = await db.prepare('SELECT * FROM confirmation_runs WHERE id = ?').bind(runId).first() as any
  if (!run) return c.json({ error: 'Run not found' }, 404)

  // Mark sent entries that haven't responded as expired
  const result = await db.prepare(`
    UPDATE confirmation_entries SET status = 'no_response', updated_at = datetime('now')
    WHERE run_id = ? AND status = 'sent'
  `).bind(runId).run()

  // Release holds for expired entries
  const expired = await db.prepare(`
    SELECT * FROM confirmation_entries WHERE run_id = ? AND status = 'no_response' AND hold_created = 1 AND hold_released = 0
  `).bind(runId).all()

  const WAREHOUSE_LOC = 2
  for (const entry of expired.results as any[]) {
    const items = JSON.parse(entry.proposed_items || '[]')
    for (const item of items) {
      await db.prepare(`
        UPDATE inventory_stock SET qty_on_hold = MAX(0, qty_on_hold - ?), updated_at = datetime('now')
        WHERE product_id = ? AND location_id = ?
      `).bind(item.quantity, item.product_id, WAREHOUSE_LOC).run()
    }
    await db.prepare("UPDATE confirmation_entries SET hold_released = 1, updated_at = datetime('now') WHERE id = ?")
      .bind(entry.id).run()
  }

  await db.prepare("UPDATE confirmation_runs SET status = 'completed', updated_at = datetime('now') WHERE id = ?")
    .bind(runId).run()
  await recountRun(db, parseInt(runId))

  // Notify team about no-responses
  const noRespCount = expired.results?.length || 0
  if (noRespCount > 0) {
    const names = (expired.results as any[]).map(e => e.customer_name).slice(0, 5).join(', ')
    await createAutoNotification(db, {
      title: `${noRespCount} customer${noRespCount > 1 ? 's' : ''} didn't respond`,
      message: `Run for ${run.run_date} closed. No response from: ${names}${noRespCount > 5 ? '...' : ''}`,
      notification_type: 'warning', ref_type: 'confirmation_run', ref_id: parseInt(runId)
    })
    // Create follow-up task for no-responders
    await createAutoTask(db, {
      title: `Follow up: ${noRespCount} no-response for ${run.run_date}`,
      description: `These customers didn't respond to the delivery confirmation:\n${(expired.results as any[]).map(e => '- ' + e.customer_name).join('\n')}\n\nConsider calling them or noting for next run.`,
      task_type: 'follow_up', priority: 'normal',
      ref_type: 'confirmation_run', ref_id: parseInt(runId),
      created_by_name: 'System'
    })
  }

  return c.json({ expired: noRespCount })
})

// ==================== AI MESSAGE GENERATION ====================

// Generate AI-personalized messages for all entries in a run
app.post('/api/standing-orders/runs/:id/generate-messages', async (c) => {
  const db = c.env.DB
  const runId = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const promoText = body.promotion || '' // optional promotion text to include

  const run = await db.prepare('SELECT * FROM confirmation_runs WHERE id = ?').bind(runId).first() as any
  if (!run) return c.json({ error: 'Run not found' }, 404)

  const apiKey = c.env.OPENAI_API_KEY
  const baseUrl = c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const model = 'gpt-4o-mini'
  if (!apiKey) return c.json({ error: 'OpenAI API key not configured' }, 500)

  // Get entries that need messages
  const entries = await db.prepare(`
    SELECT ce.* FROM confirmation_entries ce WHERE ce.run_id = ? AND ce.status IN ('pending', 'draft')
  `).bind(runId).all()

  if (!entries.results?.length) return c.json({ generated: 0, message: 'No pending entries' })

  let generated = 0
  const errors: string[] = []

  // Process in batches — gather all context first, then make AI calls
  for (const entry of entries.results as any[]) {
    try {
      // Get customer order history (last 5 orders)
      let orderHistory: any[] = []
      try {
        const hist = await db.prepare(`
          SELECT o.order_number, o.scheduled_date, o.status,
            GROUP_CONCAT(oi.quantity || 'x ' || p.name, ', ') as items
          FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
          JOIN products p ON oi.product_id = p.id
          WHERE o.customer_id = ? AND o.status NOT IN ('cancelled')
          GROUP BY o.id
          ORDER BY o.scheduled_date DESC LIMIT 5
        `).bind(entry.customer_id).all()
        orderHistory = hist.results as any[] || []
      } catch {}

      // Get customer details
      let customer: any = {}
      try {
        customer = await db.prepare('SELECT business_name, contact_name, customer_type, notes FROM customers WHERE id = ?')
          .bind(entry.customer_id).first() || {}
      } catch {}

      // Build the context for AI
      const isStanding = entry.entry_type === 'standing'
      const proposedItems = entry.proposed_items ? JSON.parse(entry.proposed_items) : []

      let context = `Customer: ${entry.customer_name}\n`
      context += `Type: ${customer.customer_type || 'unknown'}\n`
      context += `Delivery date: ${run.run_date} (${run.delivery_day})\n`
      if (run.cutoff_time) context += `Confirmation cutoff: ${run.cutoff_time}\n`

      if (isStanding && proposedItems.length > 0) {
        context += `Standing order items: ${proposedItems.map((i: any) => `${i.quantity}x ${i.product_name}`).join(', ')}\n`
      }

      if (orderHistory.length > 0) {
        context += `Recent orders:\n`
        orderHistory.forEach((oh: any) => {
          context += `  - ${oh.scheduled_date}: ${oh.items}\n`
        })
      } else {
        context += `No recent order history found.\n`
      }

      if (promoText) context += `Current promotion: ${promoText}\n`

      // Choose the right prompt based on entry type
      let systemPrompt = ''
      if (isStanding) {
        systemPrompt = `You are a friendly SMS message writer for British Feed, an animal feed delivery company in South Florida.

Write a SHORT, warm confirmation text for a customer with a standing order. Rules:
- Keep it under 160 characters if possible (SMS length), max 300
- Start with "Hi [first name or business name]!"
- Mention what's on their standing order
- Ask them to reply C to confirm or text any changes
- If there's a promotion, naturally mention it (don't force it)
- If their cutoff time is given, mention it casually
- Sound friendly and human, not robotic
- End with reply instructions: "Reply C to confirm, or text changes"
- Do NOT include any emojis
- Return ONLY the message text, nothing else`
      } else {
        // Broadcast — this is the money maker
        systemPrompt = `You are a friendly SMS message writer for British Feed, an animal feed delivery company in South Florida.

Write a SHORT, personalized outreach text to a customer to see if they'd like a delivery. Rules:
- Keep it under 200 characters if possible, max 300
- Start with "Hi [business name]!"
- If they have order history, reference what they usually buy (e.g. "Time for more Premium Feed?")
- If they haven't ordered recently, be warm and re-engaging
- If there's a promotion, lead with it naturally
- Mention you're delivering in their area on [date]
- Make it feel personal, not mass-sent
- Create gentle urgency (limited truck space, fresh stock just arrived, etc.)
- Sound friendly, conversational, like a text from someone they know
- End with something like "Text your order or let me know!" 
- Do NOT include any emojis
- Return ONLY the message text, nothing else`
      }

      // Call OpenAI
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, max_tokens: 200, temperature: 0.8,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: context }
          ]
        })
      })

      if (!resp.ok) {
        errors.push(`AI failed for ${entry.customer_name}: ${resp.status}`)
        continue
      }

      const data = await resp.json() as any
      const aiMessage = data.choices?.[0]?.message?.content?.trim()
      if (!aiMessage) {
        errors.push(`Empty AI response for ${entry.customer_name}`)
        continue
      }

      // Store the AI-drafted message
      await db.prepare(`
        UPDATE confirmation_entries SET draft_message = ?, updated_at = datetime('now') WHERE id = ?
      `).bind(aiMessage, entry.id).run()
      generated++

    } catch (e: any) {
      errors.push(`Error for ${entry.customer_name}: ${e.message}`)
    }
  }

  return c.json({ generated, total: entries.results.length, errors })
})

// Generate AI message for a single entry
app.post('/api/standing-orders/entries/:id/generate-message', async (c) => {
  const db = c.env.DB
  const entryId = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))

  const entry = await db.prepare('SELECT * FROM confirmation_entries WHERE id = ?').bind(entryId).first() as any
  if (!entry) return c.json({ error: 'Entry not found' }, 404)

  const run = await db.prepare('SELECT * FROM confirmation_runs WHERE id = ?').bind(entry.run_id).first() as any

  const apiKey = c.env.OPENAI_API_KEY
  const baseUrl = c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  if (!apiKey) return c.json({ error: 'OpenAI API key not configured' }, 500)

  // Get order history
  let orderHistory: any[] = []
  try {
    const hist = await db.prepare(`
      SELECT o.scheduled_date, GROUP_CONCAT(oi.quantity || 'x ' || p.name, ', ') as items
      FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON oi.product_id = p.id
      WHERE o.customer_id = ? AND o.status NOT IN ('cancelled')
      GROUP BY o.id ORDER BY o.scheduled_date DESC LIMIT 5
    `).bind(entry.customer_id).all()
    orderHistory = hist.results as any[] || []
  } catch {}

  const proposedItems = entry.proposed_items ? JSON.parse(entry.proposed_items) : []
  const isStanding = entry.entry_type === 'standing'

  let context = `Customer: ${entry.customer_name}\nDelivery: ${run?.run_date} (${run?.delivery_day})\n`
  if (run?.cutoff_time) context += `Cutoff: ${run.cutoff_time}\n`
  if (isStanding && proposedItems.length) context += `Standing order: ${proposedItems.map((i: any) => `${i.quantity}x ${i.product_name}`).join(', ')}\n`
  if (orderHistory.length) context += `Recent: ${orderHistory.map((h: any) => `${h.scheduled_date}: ${h.items}`).join('; ')}\n`
  if (body.promotion) context += `Promo: ${body.promotion}\n`
  if (body.extra_context) context += `Note: ${body.extra_context}\n`

  const systemPrompt = isStanding
    ? `You write short, friendly SMS texts for British Feed (animal feed delivery, South Florida). Write a standing order confirmation text. Under 250 chars. Say hi, list the items, ask to reply C to confirm or text changes. Mention cutoff if given. Sound human and warm, not corporate. No emojis. Return ONLY the message.`
    : `You write short, friendly SMS texts for British Feed (animal feed delivery, South Florida). Write a personalized outreach text. Under 250 chars. Reference their past orders if available. Mention you're delivering nearby on the date. Create gentle urgency. Sound personal and warm. No emojis. Return ONLY the message.`

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini', max_tokens: 200, temperature: 0.8,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: context }]
      })
    })
    if (!resp.ok) return c.json({ error: `AI returned ${resp.status}` }, 500)
    const data = await resp.json() as any
    const aiMessage = data.choices?.[0]?.message?.content?.trim()
    if (!aiMessage) return c.json({ error: 'Empty AI response' }, 500)

    await db.prepare("UPDATE confirmation_entries SET draft_message = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(aiMessage, entryId).run()

    return c.json({ message: aiMessage })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// Update draft message (staff edit)
app.put('/api/standing-orders/entries/:id/draft-message', async (c) => {
  const db = c.env.DB
  const entryId = c.req.param('id')
  const body = await c.req.json()
  if (!body.message) return c.json({ error: 'message is required' }, 400)

  await db.prepare("UPDATE confirmation_entries SET draft_message = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(body.message, entryId).run()
  return c.json({ success: true })
})

// ==================== REMINDER TEXTS ====================

// Send reminders to entries that haven't responded
app.post('/api/standing-orders/runs/:id/send-reminders', async (c) => {
  const db = c.env.DB
  const runId = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))

  const run = await db.prepare('SELECT * FROM confirmation_runs WHERE id = ?').bind(runId).first() as any
  if (!run) return c.json({ error: 'Run not found' }, 404)

  // Get sent entries that haven't responded
  const entries = await db.prepare(`
    SELECT ce.*, c.business_name, c.phone, c.sms_phone
    FROM confirmation_entries ce JOIN customers c ON ce.customer_id = c.id
    WHERE ce.run_id = ? AND ce.status = 'sent'
  `).bind(runId).all()

  if (!entries.results?.length) return c.json({ sent: 0, message: 'No entries need reminders' })

  const apiKey = c.env.OPENAI_API_KEY
  const baseUrl = c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const webhookUrl = c.env.MAKE_WEBHOOK_URL
  let sentCount = 0
  const errors: string[] = []

  for (const entry of entries.results as any[]) {
    const phone = entry.customer_phone || entry.sms_phone || entry.phone
    if (!phone) continue

    let reminderMsg = ''

    // Try AI-generated reminder
    if (apiKey) {
      try {
        const proposedItems = entry.proposed_items ? JSON.parse(entry.proposed_items) : []
        const itemStr = proposedItems.map((i: any) => `${i.quantity}x ${i.product_name}`).join(', ')
        const isStanding = entry.entry_type === 'standing'

        const context = `Customer: ${entry.customer_name}\nDelivery: ${run.run_date}\nCutoff: ${run.cutoff_time || 'soon'}\nType: ${isStanding ? 'standing order' : 'broadcast'}\n${itemStr ? 'Items: ' + itemStr : 'No specific items (open invite)'}`

        const resp = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini', max_tokens: 150, temperature: 0.7,
            messages: [{
              role: 'system',
              content: `You write friendly reminder SMS texts for British Feed (animal feed delivery). Write a brief, gentle reminder that their delivery confirmation is needed soon. Under 160 chars. Be warm, mention the cutoff is approaching. If they have a standing order, remind them of the items. Reply C to confirm. No emojis. Return ONLY the message.`
            }, { role: 'user', content: context }]
          })
        })
        if (resp.ok) {
          const data = await resp.json() as any
          reminderMsg = data.choices?.[0]?.message?.content?.trim() || ''
        }
      } catch {}
    }

    // Fallback if AI fails
    if (!reminderMsg) {
      reminderMsg = `Hey ${entry.customer_name}! Just a reminder — we need your delivery confirmation for ${run.run_date}. Reply C to confirm or N to skip. Cutoff is approaching!`
    }

    // Log outbound SMS
    const smsRes = await db.prepare(`
      INSERT INTO sms_messages (confirmation_entry_id, customer_id, customer_phone, direction, message_body, status, sent_at)
      VALUES (?, ?, ?, 'outbound', ?, 'queued', datetime('now'))
    `).bind(entry.id, entry.customer_id, phone, reminderMsg).run()
    const smsId = smsRes.meta.last_row_id

    // Fire webhook
    if (webhookUrl) {
      try {
        const resp = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone, message: reminderMsg,
            customer_name: entry.customer_name, customer_id: entry.customer_id,
            entry_id: entry.id, run_id: runId, type: 'reminder'
          })
        })
        if (resp.ok) {
          await db.prepare("UPDATE sms_messages SET status = 'sent' WHERE id = ?").bind(smsId).run()
          sentCount++
        } else {
          await db.prepare("UPDATE sms_messages SET status = 'failed' WHERE id = ?").bind(smsId).run()
          errors.push(`Webhook failed for ${entry.customer_name}`)
        }
      } catch (e: any) {
        await db.prepare("UPDATE sms_messages SET status = 'failed', error_message = ? WHERE id = ?").bind(e.message, smsId).run()
        errors.push(`Error for ${entry.customer_name}: ${e.message}`)
      }
    } else {
      // No webhook — just mark as sent for testing
      await db.prepare("UPDATE sms_messages SET status = 'sent' WHERE id = ?").bind(smsId).run()
      sentCount++
    }
  }

  return c.json({ sent: sentCount, total: entries.results.length, errors })
})

// ==================== CUSTOMER SMS PREFERENCES ====================

app.put('/api/customers/:id/sms-preferences', async (c) => {
  const db = c.env.DB
  const customerId = c.req.param('id')
  const body = await c.req.json()

  const updates: string[] = []
  const vals: any[] = []
  if (body.sms_opt_in !== undefined) { updates.push('sms_opt_in = ?'); vals.push(body.sms_opt_in ? 1 : 0) }
  if (body.sms_phone !== undefined) { updates.push('sms_phone = ?'); vals.push(body.sms_phone) }
  if (body.delivery_notes_default !== undefined) { updates.push('delivery_notes_default = ?'); vals.push(body.delivery_notes_default) }

  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400)
  vals.push(customerId)

  await db.prepare(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`).bind(...vals).run()
  return c.json({ success: true })
})

// ==================== HELPERS ====================

async function createOrderFromEntry(db: D1Database, entry: any, runDate?: string): Promise<number | null> {
  const items = JSON.parse(entry.proposed_items || '[]')
  if (items.length === 0) return null

  // Get run_date from the confirmation_runs table if not provided
  let deliveryDate = runDate || entry.run_date
  if (!deliveryDate && entry.run_id) {
    const run = await db.prepare('SELECT run_date FROM confirmation_runs WHERE id = ?').bind(entry.run_id).first() as any
    deliveryDate = run?.run_date
  }
  if (!deliveryDate) deliveryDate = new Date().toISOString().split('T')[0]

  const orderNum = 'BF-' + Date.now().toString(36).toUpperCase() + '-SO'
  const orderRes = await db.prepare(`
    INSERT INTO orders (order_number, customer_id, address_id, status, priority, scheduled_date,
      special_instructions, recurring_schedule_id)
    VALUES (?, ?, ?, 'confirmed', 'normal', ?, ?, ?)
  `).bind(
    orderNum, entry.customer_id, entry.address_id,
    deliveryDate,
    entry.delivery_notes || null,
    entry.schedule_id || null
  ).run()
  const orderId = orderRes.meta.last_row_id

  for (const item of items) {
    await db.prepare('INSERT INTO order_items (order_id, product_id, quantity) VALUES (?, ?, ?)')
      .bind(orderId, item.product_id, item.quantity).run()
  }

  return orderId as number
}

async function recountRun(db: D1Database, runId: number) {
  try {
    const counts = await db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN status = 'declined' THEN 1 ELSE 0 END) as declined,
        SUM(CASE WHEN status IN ('pending', 'sent') THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'modified' THEN 1 ELSE 0 END) as modified,
        SUM(CASE WHEN status = 'no_response' THEN 1 ELSE 0 END) as no_response
      FROM confirmation_entries WHERE run_id = ?
    `).bind(runId).first() as any
    await db.prepare(`
      UPDATE confirmation_runs SET total_entries = ?, confirmed_count = ?, declined_count = ?,
        pending_count = ?, modified_count = ?, updated_at = datetime('now') WHERE id = ?
    `).bind(
      counts.total || 0, counts.confirmed || 0, counts.declined || 0,
      counts.pending || 0, counts.modified || 0, runId
    ).run()
  } catch {}
}

// ==================== DASHBOARD (easy status board) ====================

// Single endpoint returning everything the team needs to see at a glance
app.get('/api/standing-orders/dashboard', async (c) => {
  const db = c.env.DB

  try {
    // 1. Active / recent runs (last 7 days)
    const runs = await db.prepare(`
      SELECT * FROM confirmation_runs
      WHERE run_date >= date('now', '-7 days') OR status IN ('draft','sending','sent')
      ORDER BY run_date DESC LIMIT 10
    `).all()

    // 2. For each active run, get per-entry status breakdown
    const activeRuns = runs.results as any[] || []
    const runSummaries: any[] = []
    for (const run of activeRuns) {
      const entries = await db.prepare(`
        SELECT ce.id, ce.customer_id, ce.customer_name, ce.customer_phone,
          ce.entry_type, ce.status, ce.draft_message, ce.order_id,
          ce.sms_sent_at, ce.confirmed_at, ce.modified_items,
          dz.name as zone_name, dz.color as zone_color
        FROM confirmation_entries ce
        LEFT JOIN delivery_zones dz ON ce.zone_id = dz.id
        WHERE ce.run_id = ?
        ORDER BY 
          CASE ce.status 
            WHEN 'modified' THEN 1
            WHEN 'sent' THEN 2
            WHEN 'pending' THEN 3
            WHEN 'confirmed' THEN 4
            WHEN 'declined' THEN 5
            WHEN 'no_response' THEN 6
          END, ce.customer_name
      `).bind(run.id).all()

      runSummaries.push({
        ...run,
        entries: entries.results || []
      })
    }

    // 3. Recent SMS activity (last 48h) — the text message log
    const recentSms = await db.prepare(`
      SELECT sm.*, ce.customer_name, ce.entry_type,
        cr.run_date
      FROM sms_messages sm
      LEFT JOIN confirmation_entries ce ON sm.confirmation_entry_id = ce.id
      LEFT JOIN confirmation_runs cr ON ce.run_id = cr.id
      WHERE sm.created_at >= datetime('now', '-48 hours')
      ORDER BY sm.created_at DESC
      LIMIT 100
    `).all()

    // 4. Action needed: entries requiring attention
    const needsAction = await db.prepare(`
      SELECT ce.*, cr.run_date, cr.cutoff_time,
        dz.name as zone_name
      FROM confirmation_entries ce
      JOIN confirmation_runs cr ON ce.run_id = cr.id
      LEFT JOIN delivery_zones dz ON ce.zone_id = dz.id
      WHERE ce.status IN ('modified','sent')
        AND cr.status IN ('sent','sending','draft')
      ORDER BY 
        CASE ce.status WHEN 'modified' THEN 0 ELSE 1 END,
        cr.run_date ASC
    `).all()

    // 5. Seasonal overview
    const seasonalStats = await db.prepare(`
      SELECT
        COUNT(*) as total_customers,
        SUM(CASE WHEN is_seasonal = 1 THEN 1 ELSE 0 END) as seasonal_count,
        SUM(CASE WHEN season_status = 'in_season' THEN 1 ELSE 0 END) as in_season,
        SUM(CASE WHEN season_status = 'out_of_season' THEN 1 ELSE 0 END) as out_of_season,
        SUM(CASE WHEN season_status = 'arriving_soon' THEN 1 ELSE 0 END) as arriving_soon,
        SUM(CASE WHEN season_status = 'departing_soon' THEN 1 ELSE 0 END) as departing_soon
      FROM customers WHERE active = 1
    `).first() as any

    // 6. Customers arriving/departing within 30 days
    const now = new Date()
    const currentMonth = now.getMonth() + 1 // 1-12
    const currentDay = now.getDate()
    const seasonalAlerts = await db.prepare(`
      SELECT id, business_name, contact_name, phone, sms_phone,
        is_seasonal, season_start_month, season_start_day,
        season_end_month, season_end_day, season_status, season_notes
      FROM customers
      WHERE active = 1 AND is_seasonal = 1
        AND (season_status IN ('arriving_soon','departing_soon','in_season','out_of_season'))
      ORDER BY season_status, business_name
    `).all()

    return c.json({
      runs: runSummaries,
      recent_sms: recentSms.results || [],
      needs_action: needsAction.results || [],
      seasonal: {
        stats: seasonalStats,
        alerts: seasonalAlerts.results || [],
        current_month: currentMonth,
        current_day: currentDay
      }
    })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ==================== SEASONALITY MANAGEMENT ====================

// Get all seasonal customers with their status
app.get('/api/customers/seasonal', async (c) => {
  const db = c.env.DB
  const status = c.req.query('status') // in_season, out_of_season, arriving_soon, departing_soon

  let q = `
    SELECT c.id, c.business_name, c.contact_name, c.phone, c.sms_phone,
      c.is_seasonal, c.season_start_month, c.season_start_day,
      c.season_end_month, c.season_end_day, c.season_status, c.season_notes,
      c.last_season_update, c.active, c.customer_type
    FROM customers c WHERE c.active = 1
  `
  const binds: any[] = []
  if (status) {
    q += ' AND c.season_status = ?'
    binds.push(status)
  }
  q += ' ORDER BY c.is_seasonal DESC, c.season_status, c.business_name'

  try {
    const result = await db.prepare(q).bind(...binds).all()
    return c.json({ customers: result.results || [] })
  } catch (e: any) {
    return c.json({ customers: [], error: e.message })
  }
})

// Update customer seasonal info
app.put('/api/customers/:id/seasonal', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)
  const customerId = c.req.param('id')
  const body = await c.req.json()

  const updates: string[] = []
  const vals: any[] = []

  if (body.is_seasonal !== undefined) { updates.push('is_seasonal = ?'); vals.push(body.is_seasonal ? 1 : 0) }
  if (body.season_start_month !== undefined) { updates.push('season_start_month = ?'); vals.push(body.season_start_month) }
  if (body.season_start_day !== undefined) { updates.push('season_start_day = ?'); vals.push(body.season_start_day) }
  if (body.season_end_month !== undefined) { updates.push('season_end_month = ?'); vals.push(body.season_end_month) }
  if (body.season_end_day !== undefined) { updates.push('season_end_day = ?'); vals.push(body.season_end_day) }
  if (body.season_status !== undefined) { updates.push('season_status = ?'); vals.push(body.season_status) }
  if (body.season_notes !== undefined) { updates.push('season_notes = ?'); vals.push(body.season_notes) }

  updates.push("last_season_update = datetime('now')")

  if (updates.length <= 1) return c.json({ error: 'No fields to update' }, 400)
  vals.push(customerId)

  await db.prepare(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`).bind(...vals).run()

  // Log the update
  if (body.season_status) {
    const eventType = body.season_status === 'in_season' ? 'arrival'
      : body.season_status === 'out_of_season' ? 'departure'
      : 'season_update'
    await db.prepare(`
      INSERT INTO customer_season_log (customer_id, event_type, season_year, notes, created_by, created_by_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      customerId, eventType, new Date().getFullYear(),
      body.notes || `Status changed to ${body.season_status}`,
      user?.id || null, user?.name || user?.email || 'System'
    ).run()
  }

  return c.json({ success: true })
})

// Mark customer as arrived (returning for the season)
app.post('/api/customers/:id/season-arrival', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)
  const customerId = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const sendWelcome = body.send_welcome !== false

  // Update status
  await db.prepare(`
    UPDATE customers SET season_status = 'in_season', last_season_update = datetime('now') WHERE id = ?
  `).bind(customerId).run()

  // Log arrival
  await db.prepare(`
    INSERT INTO customer_season_log (customer_id, event_type, season_year, notes, created_by, created_by_name)
    VALUES (?, 'arrival', ?, ?, ?, ?)
  `).bind(
    customerId, new Date().getFullYear(),
    body.notes || 'Customer arrived for the season',
    user?.id || null, user?.name || user?.email || 'System'
  ).run()

  // Notify team
  const custNameArr = await db.prepare('SELECT business_name FROM customers WHERE id = ?').bind(customerId).first() as any
  const custN = custNameArr?.business_name || 'Customer'
  await createAutoNotification(db, {
    title: `${custN} is back for the season!`,
    message: `Seasonal customer marked as arrived. ${sendWelcome ? 'Welcome text sent.' : 'No welcome text sent.'} Add them to delivery runs.`,
    notification_type: 'success', ref_type: 'customer', ref_id: parseInt(customerId)
  })
  // Create a task to set up their deliveries
  await createAutoTask(db, {
    title: `Set up deliveries for returning customer: ${custN}`,
    description: `${custN} is back for the season.\n\nChecklist:\n- Verify recurring schedule is active\n- Confirm delivery address and zone\n- Include in next confirmation run\n- Check if they need any products stocked`,
    task_type: 'customer', priority: 'normal',
    due_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
    customer_id: parseInt(customerId), customer_name: custN,
    created_by_name: user?.name || user?.email || 'System'
  })

  // Send welcome-back text if requested
  let smsSent = false
  if (sendWelcome) {
    const customer = await db.prepare(
      'SELECT id, business_name, phone, sms_phone FROM customers WHERE id = ?'
    ).bind(customerId).first() as any

    if (customer) {
      const phone = customer.sms_phone || customer.phone
      if (phone) {
        // Get welcome template
        let template = await db.prepare(
          "SELECT message_template FROM sms_templates WHERE template_type = 'welcome_back' AND active = 1 LIMIT 1"
        ).first() as any

        let msg = template?.message_template || 'Hi {customer_name}! Welcome back! Ready for deliveries? Text us your first order!'
        msg = msg.replace(/{customer_name}/g, customer.business_name || 'there')
          .replace(/{season_year}/g, String(new Date().getFullYear()))

        // Use AI to personalize if available
        const apiKey = c.env.OPENAI_API_KEY
        const baseUrl = c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
        if (apiKey) {
          try {
            // Get last order info
            let lastOrder = ''
            try {
              const lo = await db.prepare(`
                SELECT GROUP_CONCAT(oi.quantity || 'x ' || p.name, ', ') as items
                FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON oi.product_id = p.id
                WHERE o.customer_id = ? AND o.status NOT IN ('cancelled')
                ORDER BY o.scheduled_date DESC LIMIT 1
              `).bind(customerId).first() as any
              lastOrder = lo?.items || ''
            } catch {}

            const resp = await fetch(`${baseUrl}/chat/completions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
              body: JSON.stringify({
                model: 'gpt-4o-mini', max_tokens: 150, temperature: 0.7,
                messages: [{
                  role: 'system',
                  content: `Write a warm, brief welcome-back SMS for British Feed (animal feed delivery, South Florida). Customer is returning for the season. Under 200 chars. Be genuine and friendly. If they have past orders, reference them. Ask when they want to start deliveries. No emojis. Return ONLY the message.`
                }, {
                  role: 'user',
                  content: `Customer: ${customer.business_name}\nLast order items: ${lastOrder || 'unknown'}\nSeason year: ${new Date().getFullYear()}`
                }]
              })
            })
            if (resp.ok) {
              const data = await resp.json() as any
              const aiMsg = data.choices?.[0]?.message?.content?.trim()
              if (aiMsg) msg = aiMsg
            }
          } catch {}
        }

        // Log and send
        const smsRes = await db.prepare(`
          INSERT INTO sms_messages (customer_id, customer_phone, direction, message_body, status, sent_at)
          VALUES (?, ?, 'outbound', ?, 'queued', datetime('now'))
        `).bind(customerId, phone, msg).run()

        // Log welcome text event
        await db.prepare(`
          INSERT INTO customer_season_log (customer_id, event_type, season_year, notes, created_by, created_by_name)
          VALUES (?, 'welcome_text', ?, ?, ?, ?)
        `).bind(customerId, new Date().getFullYear(), msg, user?.id || null, user?.name || user?.email || 'System').run()

        // Fire Make webhook
        const webhookUrl = c.env.MAKE_WEBHOOK_URL
        if (webhookUrl) {
          try {
            const resp = await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone, message: msg, customer_name: customer.business_name, customer_id: customerId, type: 'welcome_back' })
            })
            if (resp.ok) {
              await db.prepare("UPDATE sms_messages SET status = 'sent' WHERE id = ?").bind(smsRes.meta.last_row_id).run()
            }
          } catch {}
        }
        smsSent = true
      }
    }
  }

  return c.json({ success: true, sms_sent: smsSent })
})

// Mark customer as departing (leaving for off-season)
app.post('/api/customers/:id/season-departure', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)
  const customerId = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const sendFarewell = body.send_farewell !== false
  const askFinalOrder = body.ask_final_order !== false

  // Update status
  await db.prepare(`
    UPDATE customers SET season_status = 'out_of_season', last_season_update = datetime('now') WHERE id = ?
  `).bind(customerId).run()

  // Log departure
  await db.prepare(`
    INSERT INTO customer_season_log (customer_id, event_type, season_year, notes, created_by, created_by_name)
    VALUES (?, 'departure', ?, ?, ?, ?)
  `).bind(
    customerId, new Date().getFullYear(),
    body.notes || 'Customer departed for off-season',
    user?.id || null, user?.name || user?.email || 'System'
  ).run()

  // Notify team
  const custNameDep = await db.prepare('SELECT business_name FROM customers WHERE id = ?').bind(customerId).first() as any
  const custD = custNameDep?.business_name || 'Customer'
  await createAutoNotification(db, {
    title: `${custD} leaving for off-season`,
    message: `Marked as departed. ${sendFarewell || askFinalOrder ? 'Farewell text sent.' : ''} They will be excluded from future confirmation runs.`,
    notification_type: 'info', ref_type: 'customer', ref_id: parseInt(customerId)
  })

  // Send farewell / final order text
  let smsSent = false
  if (sendFarewell || askFinalOrder) {
    const customer = await db.prepare(
      'SELECT id, business_name, phone, sms_phone FROM customers WHERE id = ?'
    ).bind(customerId).first() as any

    if (customer) {
      const phone = customer.sms_phone || customer.phone
      if (phone) {
        const templateType = askFinalOrder ? 'final_order' : 'farewell'
        let template = await db.prepare(
          "SELECT message_template FROM sms_templates WHERE template_type = ? AND active = 1 LIMIT 1"
        ).bind(templateType).first() as any

        let msg = template?.message_template || 'Hi {customer_name}! Safe travels! See you next season.'
        msg = msg.replace(/{customer_name}/g, customer.business_name || 'there')
          .replace(/{season_year}/g, String(new Date().getFullYear()))

        // AI personalization if available
        const apiKey = c.env.OPENAI_API_KEY
        const baseUrl = c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
        if (apiKey) {
          try {
            const prompt = askFinalOrder
              ? `Write a brief farewell + final order SMS for British Feed (animal feed delivery). Customer is leaving for the season. Ask if they need one last delivery before they go. Under 200 chars. Warm and friendly. No emojis. Return ONLY the message.`
              : `Write a brief farewell SMS for British Feed (animal feed delivery). Customer is leaving for the season. Wish them well, say see you next year. Under 160 chars. Warm. No emojis. Return ONLY the message.`

            const resp = await fetch(`${baseUrl}/chat/completions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
              body: JSON.stringify({
                model: 'gpt-4o-mini', max_tokens: 150, temperature: 0.7,
                messages: [{ role: 'system', content: prompt }, {
                  role: 'user', content: `Customer: ${customer.business_name}`
                }]
              })
            })
            if (resp.ok) {
              const data = await resp.json() as any
              const aiMsg = data.choices?.[0]?.message?.content?.trim()
              if (aiMsg) msg = aiMsg
            }
          } catch {}
        }

        const smsRes = await db.prepare(`
          INSERT INTO sms_messages (customer_id, customer_phone, direction, message_body, status, sent_at)
          VALUES (?, ?, 'outbound', ?, 'queued', datetime('now'))
        `).bind(customerId, phone, msg).run()

        await db.prepare(`
          INSERT INTO customer_season_log (customer_id, event_type, season_year, notes, created_by, created_by_name)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          customerId, askFinalOrder ? 'final_order_text' : 'farewell_text',
          new Date().getFullYear(), msg,
          user?.id || null, user?.name || user?.email || 'System'
        ).run()

        const webhookUrl = c.env.MAKE_WEBHOOK_URL
        if (webhookUrl) {
          try {
            const resp = await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone, message: msg, customer_name: customer.business_name, customer_id: customerId, type: templateType })
            })
            if (resp.ok) {
              await db.prepare("UPDATE sms_messages SET status = 'sent' WHERE id = ?").bind(smsRes.meta.last_row_id).run()
            }
          } catch {}
        }
        smsSent = true
      }
    }
  }

  return c.json({ success: true, sms_sent: smsSent })
})

// Get season log for a customer
app.get('/api/customers/:id/season-log', async (c) => {
  const db = c.env.DB
  const customerId = c.req.param('id')
  try {
    const log = await db.prepare(
      'SELECT * FROM customer_season_log WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50'
    ).bind(customerId).all()
    return c.json({ log: log.results || [] })
  } catch (e: any) {
    return c.json({ log: [], error: e.message })
  }
})

// Batch update season statuses (cron-like — call periodically or manually)
// Checks all seasonal customers and updates arriving_soon / departing_soon
app.post('/api/customers/seasonal/refresh-statuses', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentDay = now.getDate()

  // Helper: days until a month/day combo, accounting for year wrap
  function daysUntil(targetMonth: number, targetDay: number): number {
    const thisYear = now.getFullYear()
    let target = new Date(thisYear, targetMonth - 1, targetDay)
    if (target < now) target = new Date(thisYear + 1, targetMonth - 1, targetDay)
    return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  }

  // Helper: check if current date is within season
  function isInSeason(startM: number, startD: number, endM: number, endD: number): boolean {
    const startVal = startM * 100 + startD
    const endVal = endM * 100 + endD
    const curVal = currentMonth * 100 + currentDay
    if (startVal <= endVal) {
      // Season doesn't wrap year (e.g. Mar-Sep)
      return curVal >= startVal && curVal <= endVal
    } else {
      // Season wraps year (e.g. Oct-May)
      return curVal >= startVal || curVal <= endVal
    }
  }

  const customers = await db.prepare(`
    SELECT id, business_name, is_seasonal, season_start_month, season_start_day,
      season_end_month, season_end_day, season_status
    FROM customers WHERE active = 1 AND is_seasonal = 1
      AND season_start_month IS NOT NULL AND season_end_month IS NOT NULL
  `).all()

  let updated = 0
  const changes: any[] = []

  for (const c of customers.results as any[]) {
    const inSeason = isInSeason(c.season_start_month, c.season_start_day || 1, c.season_end_month, c.season_end_day || 28)
    const daysToStart = daysUntil(c.season_start_month, c.season_start_day || 1)
    const daysToEnd = daysUntil(c.season_end_month, c.season_end_day || 28)

    let newStatus = c.season_status
    if (inSeason) {
      if (daysToEnd <= 30 && daysToEnd > 0) {
        newStatus = 'departing_soon'
      } else {
        newStatus = 'in_season'
      }
    } else {
      if (daysToStart <= 30 && daysToStart > 0) {
        newStatus = 'arriving_soon'
      } else {
        newStatus = 'out_of_season'
      }
    }

    if (newStatus !== c.season_status) {
      await db.prepare("UPDATE customers SET season_status = ?, last_season_update = datetime('now') WHERE id = ?")
        .bind(newStatus, c.id).run()
      await db.prepare(`
        INSERT INTO customer_season_log (customer_id, event_type, season_year, notes, created_by, created_by_name)
        VALUES (?, 'season_update', ?, ?, ?, ?)
      `).bind(c.id, now.getFullYear(), `Auto-updated: ${c.season_status} → ${newStatus}`, user?.id || null, 'System').run()

      // Create tasks for transitions that need team action
      if (newStatus === 'arriving_soon') {
        await createAutoTask(db, {
          title: `${c.business_name} arriving soon — send welcome text`,
          description: `Seasonal customer ${c.business_name} is arriving within 30 days.\n\nAction needed:\n- Send welcome-back text\n- Add to delivery confirmation runs\n- Check if recurring schedule is still active`,
          task_type: 'customer', priority: 'high',
          due_date: new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0],
          customer_id: c.id, customer_name: c.business_name,
          created_by_name: 'Season Auto'
        })
        await createAutoNotification(db, {
          title: `${c.business_name} arriving soon!`,
          message: 'Seasonal customer returning within 30 days — time to send welcome text and set up deliveries',
          notification_type: 'alert', ref_type: 'customer', ref_id: c.id
        })
      } else if (newStatus === 'departing_soon') {
        await createAutoTask(db, {
          title: `${c.business_name} departing soon — send farewell text`,
          description: `Seasonal customer ${c.business_name} is leaving within 30 days.\n\nAction needed:\n- Send farewell/final order text\n- Ask about last delivery date\n- Remove from future confirmation runs`,
          task_type: 'customer', priority: 'high',
          due_date: new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0],
          customer_id: c.id, customer_name: c.business_name,
          created_by_name: 'Season Auto'
        })
        await createAutoNotification(db, {
          title: `${c.business_name} departing soon`,
          message: 'Seasonal customer leaving within 30 days — send farewell text and ask about final order',
          notification_type: 'warning', ref_type: 'customer', ref_id: c.id
        })
      }

      changes.push({ customer: c.business_name, from: c.season_status, to: newStatus })
      updated++
    }
  }

  return c.json({ updated, total: customers.results?.length || 0, changes })
})

// ==================== DAILY DIGEST (create morning tasks/notifications) ====================

// Call this daily (manually or via cron) to auto-create tasks for the team
app.post('/api/standing-orders/daily-digest', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)
  const today = new Date().toISOString().split('T')[0]
  const tasksCreated: string[] = []
  const notifsCreated: string[] = []

  // 1. Check for pending/modified entries that need action
  try {
    const pendingMods = await db.prepare(`
      SELECT ce.id, ce.customer_name, ce.status, ce.modified_items, cr.run_date, cr.cutoff_time
      FROM confirmation_entries ce
      JOIN confirmation_runs cr ON ce.run_id = cr.id
      WHERE ce.status = 'modified' AND cr.status IN ('sent','sending')
    `).all()
    const mods = pendingMods.results as any[] || []
    if (mods.length > 0) {
      const names = mods.map(m => m.customer_name).join(', ')
      await createAutoTask(db, {
        title: `${mods.length} modified order${mods.length > 1 ? 's' : ''} need review`,
        description: `Customers who replied with changes:\n${mods.map(m => `- ${m.customer_name}: "${(m.modified_items || '').substring(0, 80)}"`).join('\n')}\n\nReview in Standing Orders > SO Dashboard`,
        task_type: 'customer', priority: 'high', due_date: today,
        created_by_name: 'Daily Digest'
      })
      tasksCreated.push(`Modified orders: ${mods.length}`)
    }
  } catch {}

  // 2. Check for active runs with pending/sent entries (need follow-up)
  try {
    const activeRuns = await db.prepare(`
      SELECT cr.*, 
        SUM(CASE WHEN ce.status = 'sent' THEN 1 ELSE 0 END) as waiting_count,
        SUM(CASE WHEN ce.status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_count
      FROM confirmation_runs cr
      JOIN confirmation_entries ce ON ce.run_id = cr.id
      WHERE cr.status = 'sent' AND cr.run_date >= ?
      GROUP BY cr.id
    `).bind(today).all()
    for (const run of (activeRuns.results as any[] || [])) {
      if (run.waiting_count > 0) {
        await createAutoNotification(db, {
          title: `${run.waiting_count} customers still waiting — ${run.run_date} delivery`,
          message: `${run.confirmed_count} confirmed, ${run.waiting_count} haven't responded yet. Consider sending reminders.`,
          notification_type: 'warning', ref_type: 'confirmation_run', ref_id: run.id
        })
        notifsCreated.push(`Waiting: ${run.waiting_count} for ${run.run_date}`)
      }
    }
  } catch {}

  // 3. Seasonal: arriving soon customers that don't have an open task yet
  try {
    const arriving = await db.prepare(`
      SELECT c.id, c.business_name, c.season_start_month, c.season_start_day
      FROM customers c
      WHERE c.active = 1 AND c.is_seasonal = 1 AND c.season_status = 'arriving_soon'
        AND c.id NOT IN (
          SELECT DISTINCT t.customer_id FROM tasks t
          WHERE t.customer_id IS NOT NULL AND t.status IN ('pending','in_progress')
            AND t.title LIKE '%arriving%' AND t.tags LIKE '%standing-orders%'
        )
    `).all()
    for (const cust of (arriving.results as any[] || [])) {
      await createAutoTask(db, {
        title: `${cust.business_name} arriving soon — welcome text needed`,
        description: `Seasonal customer is arriving soon. Send welcome-back text and set up their delivery schedule.`,
        task_type: 'customer', priority: 'high',
        due_date: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
        customer_id: cust.id, customer_name: cust.business_name,
        created_by_name: 'Daily Digest'
      })
      tasksCreated.push(`Arriving: ${cust.business_name}`)
    }
  } catch {}

  // 4. Seasonal: departing soon customers that don't have an open task yet
  try {
    const departing = await db.prepare(`
      SELECT c.id, c.business_name, c.season_end_month, c.season_end_day
      FROM customers c
      WHERE c.active = 1 AND c.is_seasonal = 1 AND c.season_status = 'departing_soon'
        AND c.id NOT IN (
          SELECT DISTINCT t.customer_id FROM tasks t
          WHERE t.customer_id IS NOT NULL AND t.status IN ('pending','in_progress')
            AND t.title LIKE '%departing%' AND t.tags LIKE '%standing-orders%'
        )
    `).all()
    for (const cust of (departing.results as any[] || [])) {
      await createAutoTask(db, {
        title: `${cust.business_name} departing soon — farewell + final order`,
        description: `Seasonal customer is leaving within 30 days. Send farewell text, ask about final delivery, and remove from future runs.`,
        task_type: 'customer', priority: 'high',
        due_date: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
        customer_id: cust.id, customer_name: cust.business_name,
        created_by_name: 'Daily Digest'
      })
      tasksCreated.push(`Departing: ${cust.business_name}`)
    }
  } catch {}

  // 5. Run the seasonal status refresh automatically
  try {
    // Same logic as /api/customers/seasonal/refresh-statuses but inline
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentDay = now.getDate()

    function daysUntilDigest(targetMonth: number, targetDay: number): number {
      const thisYear = now.getFullYear()
      let target = new Date(thisYear, targetMonth - 1, targetDay)
      if (target < now) target = new Date(thisYear + 1, targetMonth - 1, targetDay)
      return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    }
    function isInSeasonDigest(sM: number, sD: number, eM: number, eD: number): boolean {
      const sv = sM * 100 + sD, ev = eM * 100 + eD, cv = currentMonth * 100 + currentDay
      return sv <= ev ? (cv >= sv && cv <= ev) : (cv >= sv || cv <= ev)
    }

    const seasonals = await db.prepare(`
      SELECT id, business_name, season_start_month, season_start_day, season_end_month, season_end_day, season_status
      FROM customers WHERE active = 1 AND is_seasonal = 1 AND season_start_month IS NOT NULL AND season_end_month IS NOT NULL
    `).all()

    let statusUpdates = 0
    for (const cst of (seasonals.results as any[])) {
      const inS = isInSeasonDigest(cst.season_start_month, cst.season_start_day || 1, cst.season_end_month, cst.season_end_day || 28)
      const dEnd = daysUntilDigest(cst.season_end_month, cst.season_end_day || 28)
      const dStart = daysUntilDigest(cst.season_start_month, cst.season_start_day || 1)
      let ns = cst.season_status
      if (inS) { ns = dEnd <= 30 && dEnd > 0 ? 'departing_soon' : 'in_season' }
      else { ns = dStart <= 30 && dStart > 0 ? 'arriving_soon' : 'out_of_season' }
      if (ns !== cst.season_status) {
        await db.prepare("UPDATE customers SET season_status = ?, last_season_update = datetime('now') WHERE id = ?").bind(ns, cst.id).run()
        await db.prepare("INSERT INTO customer_season_log (customer_id, event_type, season_year, notes, created_by_name) VALUES (?, 'season_update', ?, ?, 'Daily Digest')")
          .bind(cst.id, now.getFullYear(), `Auto: ${cst.season_status} → ${ns}`).run()
        statusUpdates++
      }
    }
    if (statusUpdates > 0) notifsCreated.push(`Season statuses updated: ${statusUpdates}`)
  } catch {}

  // Summary notification
  if (tasksCreated.length > 0) {
    await createAutoNotification(db, {
      title: `Daily digest: ${tasksCreated.length} new tasks created`,
      message: tasksCreated.join('\n'),
      notification_type: 'info'
    })
  }

  return c.json({
    tasks_created: tasksCreated,
    notifications_created: notifsCreated,
    date: today
  })
})

// Get SMS templates
app.get('/api/sms-templates', async (c) => {
  const db = c.env.DB
  try {
    const result = await db.prepare('SELECT * FROM sms_templates ORDER BY template_type, name').all()
    return c.json({ templates: result.results || [] })
  } catch (e: any) {
    return c.json({ templates: [], error: e.message })
  }
})

// Update SMS template
app.put('/api/sms-templates/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const body = await c.req.json()
  const updates: string[] = []
  const vals: any[] = []
  if (body.name !== undefined) { updates.push('name = ?'); vals.push(body.name) }
  if (body.message_template !== undefined) { updates.push('message_template = ?'); vals.push(body.message_template) }
  if (body.active !== undefined) { updates.push('active = ?'); vals.push(body.active ? 1 : 0) }
  if (!updates.length) return c.json({ error: 'No fields' }, 400)
  vals.push(id)
  await db.prepare(`UPDATE sms_templates SET ${updates.join(', ')} WHERE id = ?`).bind(...vals).run()
  return c.json({ success: true })
})

export const standingOrdersApp = app
