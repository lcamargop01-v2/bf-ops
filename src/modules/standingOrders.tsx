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
        c.business_name, c.phone, c.sms_phone, c.sms_opt_in,
        a.zone_id
      FROM recurring_schedules rs
      JOIN customers c ON rs.customer_id = c.id
      LEFT JOIN addresses a ON rs.address_id = a.id
      WHERE rs.status = 'active'
        AND c.active = 1
        AND (rs.confirm_mode IS NULL OR rs.confirm_mode != 'skip')
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
          a.id as address_id, a.zone_id
        FROM customers c
        JOIN addresses a ON a.customer_id = c.id
        WHERE c.active = 1
          AND (c.sms_opt_in IS NULL OR c.sms_opt_in = 1)
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

  return c.json({ expired: expired.results?.length || 0 })
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

export const standingOrdersApp = app
