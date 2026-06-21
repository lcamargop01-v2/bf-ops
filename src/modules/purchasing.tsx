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

function generatePONumber(type: string): string {
  const d = new Date()
  const ymd = d.getFullYear().toString().slice(2) + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0')
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  const prefix = type === 'hay_shavings' ? 'HS' : type === 'feed' ? 'FD' : 'SG'
  return `PO-${prefix}-${ymd}-${rand}`
}

function generateBillNumber(): string {
  const d = new Date()
  const ymd = d.getFullYear().toString().slice(2) + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0')
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `BILL-${ymd}-${rand}`
}

// ==================== SUPPLIERS ====================

app.get('/api/purchasing/suppliers', async (c) => {
  const db = c.env.DB
  const active = c.req.query('active')
  let q = 'SELECT * FROM suppliers'
  if (active === '1') q += ' WHERE active = 1'
  q += ' ORDER BY name'
  const result = await db.prepare(q).all()
  return c.json({ suppliers: result.results || [] })
})

app.post('/api/purchasing/suppliers', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const { name, code, contact_name, email, phone, address, city, state, zip, notes, payment_terms } = body
  if (!name) return c.json({ error: 'Name required' }, 400)
  const result = await db.prepare(
    `INSERT INTO suppliers (name, code, contact_name, email, phone, address, city, state, zip, notes, payment_terms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(name, code || null, contact_name || null, email || null, phone || null,
    address || null, city || null, state || null, zip || null, notes || null, payment_terms || 'Net 30').run()
  return c.json({ id: result.meta.last_row_id, success: true })
})

app.put('/api/purchasing/suppliers/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { name, code, contact_name, email, phone, address, city, state, zip, notes, payment_terms, active } = body
  await db.prepare(
    `UPDATE suppliers SET name=?, code=?, contact_name=?, email=?, phone=?, address=?, city=?, state=?, zip=?, notes=?, payment_terms=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(name, code || null, contact_name || null, email || null, phone || null,
    address || null, city || null, state || null, zip || null, notes || null, payment_terms || 'Net 30', active ?? 1, id).run()
  return c.json({ success: true })
})

// ==================== PURCHASE ORDERS ====================

app.get('/api/purchasing/orders', async (c) => {
  const db = c.env.DB
  const status = c.req.query('status')
  const type = c.req.query('type')
  const supplierId = c.req.query('supplier_id')
  const locationId = c.req.query('location_id')

  let q = `SELECT po.*, s.name as supplier_name, l.name as location_name, l.code as location_code,
    (SELECT COUNT(*) FROM po_items WHERE po_id = po.id) as item_count,
    (SELECT COALESCE(SUM(qty_ordered), 0) FROM po_items WHERE po_id = po.id) as total_qty_ordered,
    (SELECT COALESCE(SUM(qty_received), 0) FROM po_items WHERE po_id = po.id) as total_qty_received,
    (SELECT COUNT(*) FROM po_images WHERE po_id = po.id) as image_count,
    (SELECT COUNT(*) FROM po_bills WHERE po_id = po.id) as bill_count
    FROM purchase_orders po
    LEFT JOIN suppliers s ON po.supplier_id = s.id
    JOIN locations l ON po.location_id = l.id
    WHERE 1=1`
  const binds: any[] = []
  if (status && status !== 'all') { q += ' AND po.status = ?'; binds.push(status) }
  if (type) { q += ' AND po.order_type = ?'; binds.push(type) }
  if (supplierId) { q += ' AND po.supplier_id = ?'; binds.push(parseInt(supplierId)) }
  if (locationId) { q += ' AND po.location_id = ?'; binds.push(parseInt(locationId)) }
  q += ' ORDER BY po.expected_date DESC, po.created_at DESC'

  const result = await db.prepare(q).bind(...binds).all()
  return c.json({ orders: result.results || [] })
})

app.get('/api/purchasing/orders/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))

  const po = await db.prepare(
    `SELECT po.*, s.name as supplier_name, s.code as supplier_code, s.phone as supplier_phone, s.email as supplier_email,
      l.name as location_name, l.code as location_code
     FROM purchase_orders po
     LEFT JOIN suppliers s ON po.supplier_id = s.id
     JOIN locations l ON po.location_id = l.id
     WHERE po.id = ?`
  ).bind(id).first()
  if (!po) return c.json({ error: 'PO not found' }, 404)

  const items = await db.prepare(
    `SELECT pi.*, p.name as product_name, p.sku, p.category, p.unit_type as product_unit_type
     FROM po_items pi LEFT JOIN products p ON pi.product_id = p.id WHERE pi.po_id = ? ORDER BY pi.id`
  ).bind(id).all()

  const receivings = await db.prepare(
    `SELECT r.*, (SELECT COUNT(*) FROM po_receiving_items WHERE receiving_id = r.id) as item_count,
      (SELECT COUNT(*) FROM po_images WHERE receiving_id = r.id) as image_count
     FROM po_receiving r WHERE r.po_id = ? ORDER BY r.received_at DESC`
  ).bind(id).all()

  const images = await db.prepare('SELECT id, po_id, receiving_id, caption, uploaded_by_name, created_at FROM po_images WHERE po_id = ? ORDER BY created_at DESC').bind(id).all()

  const bills = await db.prepare('SELECT * FROM po_bills WHERE po_id = ? ORDER BY created_at DESC').bind(id).all()

  // Freight charges
  let freightCharges: any[] = []
  try {
    const freightResult = await db.prepare(
      `SELECT f.*, s.name as supplier_name_resolved
       FROM po_freight_charges f
       LEFT JOIN suppliers s ON f.vendor_id = s.id
       WHERE f.po_id = ? ORDER BY f.created_at DESC`
    ).bind(id).all()
    freightCharges = freightResult.results || []
  } catch(e) { /* table may not exist yet */ }

  return c.json({
    order: po,
    items: items.results || [],
    receivings: receivings.results || [],
    images: images.results || [],
    bills: bills.results || [],
    freight_charges: freightCharges
  })
})

app.post('/api/purchasing/orders', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)
  const body = await c.req.json()
  const { supplier_id, order_type, location_id, order_date, expected_date, notes, internal_notes, items } = body

  if (!location_id) return c.json({ error: 'Location required' }, 400)
  if (!order_type) return c.json({ error: 'Order type required' }, 400)

  const po_number = generatePONumber(order_type)
  const result = await db.prepare(
    `INSERT INTO purchase_orders (po_number, supplier_id, order_type, status, location_id, order_date, expected_date, notes, internal_notes, created_by, created_by_name)
     VALUES (?, ?, ?, 'ordered', ?, ?, ?, ?, ?, ?, ?)`
  ).bind(po_number, supplier_id || null, order_type, location_id, order_date || new Date().toISOString().slice(0,10),
    expected_date || null, notes || null, internal_notes || null, user?.id || null, user?.email || 'system').run()

  const poId = result.meta.last_row_id

  // Insert line items
  if (items && Array.isArray(items)) {
    let totalAmount = 0
    for (const item of items) {
      await db.prepare(
        `INSERT INTO po_items (po_id, product_id, description, qty_ordered, unit, unit_cost, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(poId, item.product_id || null, item.description || '', item.qty_ordered || 0,
        item.unit || 'each', item.unit_cost || 0, item.notes || null).run()
      totalAmount += (item.qty_ordered || 0) * (item.unit_cost || 0)
    }
    await db.prepare('UPDATE purchase_orders SET total_amount = ? WHERE id = ?').bind(totalAmount, poId).run()
  }

  return c.json({ id: poId, po_number, success: true })
})

app.put('/api/purchasing/orders/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { supplier_id, order_type, status, location_id, order_date, expected_date, notes, internal_notes } = body

  await db.prepare(
    `UPDATE purchase_orders SET supplier_id=?, order_type=COALESCE(?,order_type), status=COALESCE(?,status),
     location_id=COALESCE(?,location_id), order_date=?, expected_date=?, notes=?, internal_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(supplier_id ?? null, order_type, status, location_id, order_date || null,
    expected_date || null, notes ?? null, internal_notes ?? null, id).run()
  return c.json({ success: true })
})

// Update PO status
app.post('/api/purchasing/orders/:id/status', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const { status } = await c.req.json()
  const validStatuses = ['draft','ordered','in_transit','delayed','partial','received','cancelled','claim']
  if (!validStatuses.includes(status)) return c.json({ error: 'Invalid status' }, 400)

  const updates: any = { status }
  if (status === 'received') updates.received_date = new Date().toISOString().slice(0,10)

  await db.prepare('UPDATE purchase_orders SET status = ?, received_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(status, updates.received_date || null, id).run()
  return c.json({ success: true })
})

// Add/update PO items
app.post('/api/purchasing/orders/:id/items', async (c) => {
  const db = c.env.DB
  const poId = parseInt(c.req.param('id'))
  const { items } = await c.req.json()

  if (!items || !Array.isArray(items)) return c.json({ error: 'Items array required' }, 400)

  // Delete existing items and re-insert (simple approach)
  await db.prepare('DELETE FROM po_items WHERE po_id = ?').bind(poId).run()

  let totalAmount = 0
  for (const item of items) {
    await db.prepare(
      `INSERT INTO po_items (po_id, product_id, description, qty_ordered, unit, unit_cost, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(poId, item.product_id || null, item.description || '', item.qty_ordered || 0,
      item.unit || 'each', item.unit_cost || 0, item.notes || null).run()
    totalAmount += (item.qty_ordered || 0) * (item.unit_cost || 0)
  }
  await db.prepare('UPDATE purchase_orders SET total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(totalAmount, poId).run()
  return c.json({ success: true })
})

// ==================== QUICK UPDATE (inline from dashboard/arriving) ====================

app.patch('/api/purchasing/orders/:id/quick', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { status, expected_date } = body

  const po = await db.prepare('SELECT id, status FROM purchase_orders WHERE id = ?').bind(id).first() as any
  if (!po) return c.json({ error: 'PO not found' }, 404)

  const fields: string[] = []
  const binds: any[] = []
  if (status) {
    const validStatuses = ['draft','ordered','in_transit','delayed','partial','received','cancelled','claim']
    if (!validStatuses.includes(status)) return c.json({ error: 'Invalid status' }, 400)
    fields.push('status = ?')
    binds.push(status)
    if (status === 'received') { fields.push("received_date = date('now')") }
  }
  if (expected_date !== undefined) {
    fields.push('expected_date = ?')
    binds.push(expected_date || null)
  }
  if (fields.length === 0) return c.json({ error: 'Nothing to update' }, 400)

  fields.push('updated_at = CURRENT_TIMESTAMP')
  binds.push(id)
  await db.prepare(`UPDATE purchase_orders SET ${fields.join(', ')} WHERE id = ?`).bind(...binds).run()
  return c.json({ success: true })
})

// ==================== RECEIVING (WAREHOUSE) ====================
// Enhanced: supports good/bad qty split per item

app.post('/api/purchasing/orders/:id/receive', async (c) => {
  const db = c.env.DB
  const poId = parseInt(c.req.param('id'))
  const user = getUserFromHeader(c)
  const body = await c.req.json()
  const { items, notes, location_id } = body

  if (!items || !Array.isArray(items) || items.length === 0) return c.json({ error: 'Receiving items required' }, 400)

  const po = await db.prepare('SELECT * FROM purchase_orders WHERE id = ?').bind(poId).first() as any
  if (!po) return c.json({ error: 'PO not found' }, 404)

  const locId = location_id || po.location_id

  // Create receiving record
  const recvResult = await db.prepare(
    `INSERT INTO po_receiving (po_id, received_by, received_by_name, notes, location_id) VALUES (?, ?, ?, ?, ?)`
  ).bind(poId, user?.id || null, user?.email || 'warehouse', notes || null, locId).run()
  const receivingId = recvResult.meta.last_row_id

  const badItems: any[] = [] // Track bad items for the response

  for (const item of items) {
    if (!item.po_item_id) continue
    const qtyGood = parseFloat(item.qty_good ?? item.qty_received ?? 0) || 0
    const qtyBad = parseFloat(item.qty_bad ?? 0) || 0
    const totalReceived = qtyGood + qtyBad
    if (totalReceived <= 0) continue

    // Record the GOOD portion
    if (qtyGood > 0) {
      await db.prepare(
        `INSERT INTO po_receiving_items (receiving_id, po_item_id, product_id, qty_received, condition, notes)
         VALUES (?, ?, ?, ?, 'good', ?)`
      ).bind(receivingId, item.po_item_id, item.product_id || null, qtyGood, item.notes || null).run()
    }

    // Record the BAD portion (damaged/rejected)
    if (qtyBad > 0) {
      const badCondition = item.bad_condition || 'damaged'
      await db.prepare(
        `INSERT INTO po_receiving_items (receiving_id, po_item_id, product_id, qty_received, condition, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(receivingId, item.po_item_id, item.product_id || null, qtyBad, badCondition, item.bad_notes || item.notes || null).run()

      if (item.product_id) {
        badItems.push({
          po_item_id: item.po_item_id,
          product_id: item.product_id,
          product_name: item.product_name || '',
          qty: qtyBad,
          condition: badCondition,
          notes: item.bad_notes || ''
        })
      }
    }

    // Update cumulative qty_received on po_items (total = good + bad)
    await db.prepare('UPDATE po_items SET qty_received = qty_received + ? WHERE id = ?')
      .bind(totalReceived, item.po_item_id).run()

    // Only add GOOD qty to inventory_stock (bad items handled separately via loss or batch)
    if (item.product_id && qtyGood > 0) {
      const existing = await db.prepare('SELECT id, qty_on_hand FROM inventory_stock WHERE product_id = ? AND location_id = ?')
        .bind(item.product_id, locId).first() as any

      if (existing) {
        const newQty = (existing.qty_on_hand || 0) + qtyGood
        await db.prepare('UPDATE inventory_stock SET qty_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .bind(newQty, existing.id).run()
        await db.prepare(
          `INSERT INTO inventory_audit (product_id, location_id, action, qty_change, qty_before, qty_after, reason, reference_type, reference_id, user_id, user_name)
           VALUES (?, ?, 'po_received', ?, ?, ?, 'PO received (good)', 'purchase_order', ?, ?, ?)`
        ).bind(item.product_id, locId, qtyGood, existing.qty_on_hand, newQty, poId, user?.id || null, user?.email || 'warehouse').run()
      } else {
        await db.prepare(
          `INSERT INTO inventory_stock (product_id, location_id, qty_on_hand, qty_on_hold, qty_reserved, last_counted_at, last_counted_by, updated_at)
           VALUES (?, ?, ?, 0, 0, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)`
        ).bind(item.product_id, locId, qtyGood, user?.id || null).run()
        await db.prepare(
          `INSERT INTO inventory_audit (product_id, location_id, action, qty_change, qty_before, qty_after, reason, reference_type, reference_id, user_id, user_name)
           VALUES (?, ?, 'po_received', ?, 0, ?, 'PO received (new stock)', 'purchase_order', ?, ?, ?)`
        ).bind(item.product_id, locId, qtyGood, qtyGood, poId, user?.id || null, user?.email || 'warehouse').run()
      }
    }
  }

  // Check if PO is fully received or partial
  const poItems = await db.prepare('SELECT qty_ordered, qty_received FROM po_items WHERE po_id = ?').bind(poId).all()
  const allReceived = (poItems.results || []).every((i: any) => i.qty_received >= i.qty_ordered)
  const anyReceived = (poItems.results || []).some((i: any) => i.qty_received > 0)

  let newStatus = po.status
  if (allReceived) newStatus = 'received'
  else if (anyReceived) newStatus = 'partial'

  if (newStatus !== po.status) {
    await db.prepare('UPDATE purchase_orders SET status = ?, received_date = CASE WHEN ? = \'received\' THEN date(\'now\') ELSE received_date END, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(newStatus, newStatus, poId).run()
  }

  return c.json({ receiving_id: receivingId, new_status: newStatus, bad_items: badItems, success: true })
})

// Report loss from receiving — deduct from stock, record in inventory_losses + audit
app.post('/api/purchasing/receiving/:receivingId/report-loss', async (c) => {
  const db = c.env.DB
  const receivingId = parseInt(c.req.param('receivingId'))
  const user = getUserFromHeader(c)
  const body = await c.req.json()
  const { items } = body // [{product_id, qty, reason, notes}]

  if (!items || !Array.isArray(items) || items.length === 0) return c.json({ error: 'Items required' }, 400)

  const receiving = await db.prepare('SELECT r.*, po.location_id as po_location_id FROM po_receiving r JOIN purchase_orders po ON r.po_id = po.id WHERE r.id = ?')
    .bind(receivingId).first() as any
  if (!receiving) return c.json({ error: 'Receiving record not found' }, 404)

  const locId = receiving.location_id || receiving.po_location_id
  const losses: any[] = []

  for (const item of items) {
    if (!item.product_id || !item.qty || item.qty <= 0) continue

    // Record loss
    const lossResult = await db.prepare(
      `INSERT INTO inventory_losses (product_id, location_id, qty, reason, notes, reported_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).bind(item.product_id, locId, item.qty, item.reason || 'damaged',
      item.notes || 'Reported from PO receiving #' + receivingId, user?.id || null).run()

    // Note: We do NOT deduct from stock because bad items were never added to stock
    // (good qty goes to stock, bad qty is reported as loss directly from receiving)
    // Audit trail for documentation
    await db.prepare(
      `INSERT INTO inventory_audit (product_id, location_id, action, qty_change, qty_before, qty_after, reason, reference_type, reference_id, user_id, user_name)
       VALUES (?, ?, 'receiving_loss', ?, NULL, NULL, ?, 'po_receiving', ?, ?, ?)`
    ).bind(item.product_id, locId, -(item.qty), 'Loss from receiving: ' + (item.reason || 'damaged'),
      receivingId, user?.id || null, user?.email || 'warehouse').run()

    losses.push({ loss_id: lossResult.meta.last_row_id, product_id: item.product_id, qty: item.qty })
  }

  return c.json({ losses, success: true })
})

// Create batch from bad receiving items — mark as sellable at reduced quality/price
app.post('/api/purchasing/receiving/:receivingId/create-batch', async (c) => {
  const db = c.env.DB
  const receivingId = parseInt(c.req.param('receivingId'))
  const user = getUserFromHeader(c)
  const body = await c.req.json()
  const { product_id, qty, condition, notes, reduced_price, image_data, image_caption } = body

  if (!product_id || !qty || qty <= 0) return c.json({ error: 'Product and qty required' }, 400)

  const receiving = await db.prepare('SELECT r.*, po.location_id as po_location_id, po.po_number FROM po_receiving r JOIN purchase_orders po ON r.po_id = po.id WHERE r.id = ?')
    .bind(receivingId).first() as any
  if (!receiving) return c.json({ error: 'Receiving record not found' }, 404)

  const locId = receiving.location_id || receiving.po_location_id

  // Generate batch number
  const d = new Date()
  const ymd = d.getFullYear().toString().slice(2) + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0')
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  const batchNumber = `BATCH-${ymd}-${rand}`

  // Create the batch
  const batchResult = await db.prepare(
    `INSERT INTO inventory_batches (product_id, location_id, batch_number, qty, condition, notes, received_date, source, created_by)
     VALUES (?, ?, ?, ?, ?, ?, date('now'), ?, ?)`
  ).bind(product_id, locId, batchNumber, qty, condition || 'fair',
    notes || null, 'PO receiving #' + receivingId + ' (' + (receiving.po_number || '') + ')', user?.id || null).run()
  const batchId = batchResult.meta.last_row_id

  // Add batch qty to inventory stock (these are still sellable, just not full quality)
  const existing = await db.prepare('SELECT id, qty_on_hand FROM inventory_stock WHERE product_id = ? AND location_id = ?')
    .bind(product_id, locId).first() as any

  if (existing) {
    const newQty = (existing.qty_on_hand || 0) + qty
    await db.prepare('UPDATE inventory_stock SET qty_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(newQty, existing.id).run()
    await db.prepare(
      `INSERT INTO inventory_audit (product_id, location_id, action, qty_change, qty_before, qty_after, reason, reference_type, reference_id, batch_id, user_id, user_name)
       VALUES (?, ?, 'batch_created', ?, ?, ?, ?, 'po_receiving', ?, ?, ?, ?)`
    ).bind(product_id, locId, qty, existing.qty_on_hand, newQty,
      'Batch ' + batchNumber + ' created from receiving (' + (condition || 'fair') + ' condition)',
      receivingId, batchId, user?.id || null, user?.email || 'warehouse').run()
  } else {
    await db.prepare(
      `INSERT INTO inventory_stock (product_id, location_id, qty_on_hand, qty_on_hold, qty_reserved, last_counted_at, last_counted_by, updated_at)
       VALUES (?, ?, ?, 0, 0, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)`
    ).bind(product_id, locId, qty, user?.id || null).run()
    await db.prepare(
      `INSERT INTO inventory_audit (product_id, location_id, action, qty_change, qty_before, qty_after, reason, reference_type, reference_id, batch_id, user_id, user_name)
       VALUES (?, ?, 'batch_created', ?, 0, ?, ?, 'po_receiving', ?, ?, ?, ?)`
    ).bind(product_id, locId, qty, qty,
      'Batch ' + batchNumber + ' created from receiving (' + (condition || 'fair') + ' condition)',
      receivingId, batchId, user?.id || null, user?.email || 'warehouse').run()
  }

  // Upload batch image if provided
  let imageId = null
  if (image_data) {
    const imgResult = await db.prepare(
      `INSERT INTO po_images (po_id, receiving_id, image_data, caption, uploaded_by, uploaded_by_name)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(receiving.po_id, receivingId, image_data,
      image_caption || 'Batch ' + batchNumber + ' (' + (condition || 'fair') + ')',
      user?.id || null, user?.email || 'warehouse').run()
    imageId = imgResult.meta.last_row_id
  }

  return c.json({
    batch_id: batchId,
    batch_number: batchNumber,
    image_id: imageId,
    success: true
  })
})

// Get receiving detail
app.get('/api/purchasing/receiving/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))

  const receiving = await db.prepare('SELECT * FROM po_receiving WHERE id = ?').bind(id).first()
  if (!receiving) return c.json({ error: 'Receiving not found' }, 404)

  const items = await db.prepare(
    `SELECT ri.*, pi.description, pi.qty_ordered, p.name as product_name, p.sku
     FROM po_receiving_items ri
     JOIN po_items pi ON ri.po_item_id = pi.id
     LEFT JOIN products p ON ri.product_id = p.id
     WHERE ri.receiving_id = ?`
  ).bind(id).all()

  const images = await db.prepare('SELECT id, caption, uploaded_by_name, created_at FROM po_images WHERE receiving_id = ?').bind(id).all()

  return c.json({ receiving, items: items.results || [], images: images.results || [] })
})

// ==================== PO IMAGES ====================

app.post('/api/purchasing/orders/:id/images', async (c) => {
  const db = c.env.DB
  const poId = parseInt(c.req.param('id'))
  const user = getUserFromHeader(c)
  const { image_data, caption, receiving_id } = await c.req.json()

  if (!image_data) return c.json({ error: 'Image data required' }, 400)

  const result = await db.prepare(
    `INSERT INTO po_images (po_id, receiving_id, image_data, caption, uploaded_by, uploaded_by_name) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(poId, receiving_id || null, image_data, caption || null, user?.id || null, user?.email || 'unknown').run()

  return c.json({ id: result.meta.last_row_id, success: true })
})

app.get('/api/purchasing/images/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const img = await db.prepare('SELECT * FROM po_images WHERE id = ?').bind(id).first() as any
  if (!img) return c.json({ error: 'Image not found' }, 404)
  return c.json({ image: img })
})

app.delete('/api/purchasing/images/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  await db.prepare('DELETE FROM po_images WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ==================== BILLS ====================

// Create bill WITH line items (enhanced — supports variable cost per product)
app.post('/api/purchasing/orders/:id/bills', async (c) => {
  const db = c.env.DB
  const poId = parseInt(c.req.param('id'))
  const user = getUserFromHeader(c)
  const body = await c.req.json()
  const { supplier_invoice_number, tax, due_date, notes, items, receiving_id } = body

  if (!items || !Array.isArray(items) || items.length === 0) {
    return c.json({ error: 'Bill line items required' }, 400)
  }

  // Calculate amount from line items
  let amount = 0
  for (const item of items) {
    amount += (item.qty || 0) * (item.unit_cost || 0)
  }

  const bill_number = generateBillNumber()
  const result = await db.prepare(
    `INSERT INTO po_bills (po_id, bill_number, supplier_invoice_number, amount, tax, status, due_date, notes, receiving_id, created_by)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`
  ).bind(poId, bill_number, supplier_invoice_number || null, amount, tax || 0,
    due_date || null, notes || null, receiving_id || null, user?.id || null).run()

  const billId = result.meta.last_row_id

  // Insert bill line items
  for (const item of items) {
    await db.prepare(
      `INSERT INTO po_bill_items (bill_id, po_item_id, product_id, description, qty, unit, unit_cost, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(billId, item.po_item_id || null, item.product_id || null,
      item.description || '', item.qty || 0, item.unit || 'each',
      item.unit_cost || 0, item.notes || null).run()
  }

  return c.json({ id: billId, bill_number, amount, success: true })
})

// Get single bill with items
app.get('/api/purchasing/bills/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))

  const bill = await db.prepare(
    `SELECT b.*, po.po_number, po.order_type, po.supplier_id, s.name as supplier_name, s.payment_terms,
      l.name as location_name, l.code as location_code
     FROM po_bills b
     JOIN purchase_orders po ON b.po_id = po.id
     LEFT JOIN suppliers s ON po.supplier_id = s.id
     JOIN locations l ON po.location_id = l.id
     WHERE b.id = ?`
  ).bind(id).first()
  if (!bill) return c.json({ error: 'Bill not found' }, 404)

  const items = await db.prepare(
    `SELECT bi.*, p.name as product_name, p.sku, p.cost as current_product_cost
     FROM po_bill_items bi
     LEFT JOIN products p ON bi.product_id = p.id
     WHERE bi.bill_id = ? ORDER BY bi.id`
  ).bind(id).all()

  return c.json({ bill, items: items.results || [] })
})

// Update bill (header-level edits or status changes)
app.put('/api/purchasing/bills/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const user = getUserFromHeader(c)
  const body = await c.req.json()
  const { status, supplier_invoice_number, amount, tax, due_date, paid_date, notes, items } = body

  // If items are provided, update them and recalculate amount
  if (items && Array.isArray(items) && items.length > 0) {
    // Delete existing items and re-insert
    await db.prepare('DELETE FROM po_bill_items WHERE bill_id = ?').bind(id).run()
    let calcAmount = 0
    for (const item of items) {
      await db.prepare(
        `INSERT INTO po_bill_items (bill_id, po_item_id, product_id, description, qty, unit, unit_cost, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, item.po_item_id || null, item.product_id || null,
        item.description || '', item.qty || 0, item.unit || 'each',
        item.unit_cost || 0, item.notes || null).run()
      calcAmount += (item.qty || 0) * (item.unit_cost || 0)
    }
    await db.prepare('UPDATE po_bills SET amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(calcAmount, id).run()
  }

  // Update header fields
  await db.prepare(
    `UPDATE po_bills SET status=COALESCE(?,status), supplier_invoice_number=COALESCE(?,supplier_invoice_number),
     tax=COALESCE(?,tax), due_date=?, paid_date=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(status, supplier_invoice_number, tax, due_date || null, paid_date || null, notes ?? null, id).run()

  // If status is being set to 'approved', update product costs from bill line items
  if (status === 'approved') {
    const bill = await db.prepare('SELECT * FROM po_bills WHERE id = ?').bind(id).first() as any
    const billItems = await db.prepare(
      'SELECT bi.*, p.cost as old_cost FROM po_bill_items bi LEFT JOIN products p ON bi.product_id = p.id WHERE bi.bill_id = ?'
    ).bind(id).all()

    for (const bi of (billItems.results || []) as any[]) {
      if (!bi.product_id || !bi.unit_cost) continue
      const oldCost = bi.old_cost || 0

      // Update product cost to latest bill unit_cost
      if (bi.unit_cost !== oldCost) {
        await db.prepare('UPDATE products SET cost = ? WHERE id = ?')
          .bind(bi.unit_cost, bi.product_id).run()

        // Record cost history
        await db.prepare(
          `INSERT INTO product_cost_history (product_id, old_cost, new_cost, source, reference_type, reference_id, bill_id, po_id, supplier_id, changed_by, changed_by_name, notes)
           VALUES (?, ?, ?, 'bill', 'bill', ?, ?, ?, ?, ?, ?, ?)`
        ).bind(bi.product_id, oldCost, bi.unit_cost, id, bill?.po_id, bill?.supplier_id || null,
          user?.id || null, user?.email || 'system',
          'Cost updated from bill ' + (bill?.bill_number || id)).run()

        // === AUTO-GENERATE PRICING ALERTS ===
        if (bi.unit_cost > oldCost && oldCost > 0) {
          const changePct = ((bi.unit_cost - oldCost) / oldCost) * 100
          // Get product price info
          const prod = await db.prepare('SELECT name, sku, price FROM products WHERE id = ?').bind(bi.product_id).first() as any
          const currentPrice = prod?.price || 0
          const margin = currentPrice > 0 ? ((currentPrice - bi.unit_cost) / currentPrice) * 100 : 0
          const suggestedPrice = bi.unit_cost > 0 ? Math.ceil((bi.unit_cost / 0.70) * 100) / 100 : currentPrice // 30% margin target

          // Cost increase alert
          await db.prepare(
            `INSERT INTO pricing_alerts (alert_type, product_id, product_name, sku, old_cost, new_cost, cost_change_pct, current_price, suggested_price, margin_pct)
             VALUES ('cost_increase', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(bi.product_id, prod?.name || '', prod?.sku || '', oldCost, bi.unit_cost, Math.round(changePct * 100) / 100, currentPrice, suggestedPrice, Math.round(margin * 100) / 100).run()

          // Retail label update alert (price_change type for retail staff)
          await db.prepare(
            `INSERT INTO pricing_alerts (alert_type, product_id, product_name, sku, old_cost, new_cost, cost_change_pct, current_price, suggested_price, margin_pct)
             VALUES ('price_change', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(bi.product_id, prod?.name || '', prod?.sku || '', oldCost, bi.unit_cost, Math.round(changePct * 100) / 100, currentPrice, suggestedPrice, Math.round(margin * 100) / 100).run()

          // Check margin alerts for discounted customers
          const discountedCusts = await db.prepare(
            `SELECT pr.customer_id, c.business_name, pr.discount_pct, pr.price
             FROM pos_price_rules pr JOIN customers c ON c.id = pr.customer_id
             WHERE pr.product_id = ? AND pr.active = 1 AND (pr.discount_pct > 0 OR pr.price < ?)`
          ).bind(bi.product_id, currentPrice).all()

          for (const dc of (discountedCusts.results || []) as any[]) {
            const custPrice = dc.price || (currentPrice * (1 - (dc.discount_pct || 0) / 100))
            const custMargin = custPrice > 0 ? ((custPrice - bi.unit_cost) / custPrice) * 100 : 0
            if (custMargin < 15) { // Margin too low
              await db.prepare(
                `INSERT INTO pricing_alerts (alert_type, product_id, product_name, sku, old_cost, new_cost, cost_change_pct, current_price, margin_pct, customer_id, customer_name, discount_pct)
                 VALUES ('margin_low', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              ).bind(bi.product_id, prod?.name || '', prod?.sku || '', oldCost, bi.unit_cost, Math.round(changePct * 100) / 100, custPrice, Math.round(custMargin * 100) / 100, dc.customer_id, dc.business_name || '', dc.discount_pct || 0).run()
            }
          }
        }
      }
    }
  }

  return c.json({ success: true })
})

// List all bills (with enriched data)
app.get('/api/purchasing/bills', async (c) => {
  const db = c.env.DB
  const status = c.req.query('status')
  const poId = c.req.query('po_id')
  let q = `SELECT b.*, po.po_number, po.order_type, s.name as supplier_name,
    l.code as location_code,
    (SELECT COUNT(*) FROM po_bill_items WHERE bill_id = b.id) as item_count
    FROM po_bills b
    JOIN purchase_orders po ON b.po_id = po.id
    LEFT JOIN suppliers s ON po.supplier_id = s.id
    JOIN locations l ON po.location_id = l.id
    WHERE 1=1`
  const binds: any[] = []
  if (status && status !== 'all') { q += ' AND b.status = ?'; binds.push(status) }
  if (poId) { q += ' AND b.po_id = ?'; binds.push(parseInt(poId)) }
  q += ' ORDER BY b.created_at DESC'

  const result = await db.prepare(q).bind(...binds).all()
  return c.json({ bills: result.results || [] })
})

// Pre-populate bill from PO items (for "Create Bill" workflow)
// Returns PO items with received quantities ready to fill in supplier costs
app.get('/api/purchasing/orders/:id/bill-preview', async (c) => {
  const db = c.env.DB
  const poId = parseInt(c.req.param('id'))

  const po = await db.prepare(
    `SELECT po.*, s.name as supplier_name, s.payment_terms, l.code as location_code
     FROM purchase_orders po
     LEFT JOIN suppliers s ON po.supplier_id = s.id
     JOIN locations l ON po.location_id = l.id
     WHERE po.id = ?`
  ).bind(poId).first() as any
  if (!po) return c.json({ error: 'PO not found' }, 404)

  // Get PO items with product info
  const items = await db.prepare(
    `SELECT pi.*, p.name as product_name, p.sku, p.cost as current_product_cost, p.unit_type as product_unit_type
     FROM po_items pi
     LEFT JOIN products p ON pi.product_id = p.id
     WHERE pi.po_id = ? ORDER BY pi.id`
  ).bind(poId).all()

  // Calculate suggested due date from supplier payment terms
  let suggestedDueDate = null
  if (po.payment_terms) {
    const match = po.payment_terms.match(/Net\s*(\d+)/i)
    if (match) {
      const days = parseInt(match[1])
      const due = new Date()
      due.setDate(due.getDate() + days)
      suggestedDueDate = due.toISOString().slice(0, 10)
    }
  }

  return c.json({
    po,
    items: (items.results || []).map((item: any) => ({
      po_item_id: item.id,
      product_id: item.product_id,
      product_name: item.product_name,
      sku: item.sku,
      description: item.description,
      qty_ordered: item.qty_ordered,
      qty_received: item.qty_received,
      unit: item.unit,
      po_unit_cost: item.unit_cost,
      current_product_cost: item.current_product_cost || 0,
      product_unit_type: item.product_unit_type
    })),
    suggested_due_date: suggestedDueDate
  })
})

// Product cost history (includes bill and freight entries)
app.get('/api/purchasing/cost-history/:productId', async (c) => {
  const db = c.env.DB
  const productId = parseInt(c.req.param('productId'))
  const limit = parseInt(c.req.query('limit') || '20')

  const history = await db.prepare(
    `SELECT h.*, po.po_number, s.name as supplier_name, b.bill_number, b.supplier_invoice_number,
      f.carrier_name as freight_carrier, f.invoice_number as freight_invoice, f.vendor_name as freight_vendor_name
     FROM product_cost_history h
     LEFT JOIN po_bills b ON h.bill_id = b.id
     LEFT JOIN purchase_orders po ON h.po_id = po.id
     LEFT JOIN suppliers s ON h.supplier_id = s.id
     LEFT JOIN po_freight_charges f ON h.source = 'freight' AND h.reference_id = f.id
     WHERE h.product_id = ?
     ORDER BY h.created_at DESC LIMIT ?`
  ).bind(productId, limit).all()

  return c.json({ history: history.results || [] })
})

// ==================== FREIGHT CHARGES ====================

function generateFreightNumber(): string {
  const d = new Date()
  const ymd = d.getFullYear().toString().slice(2) + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0')
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `FRT-${ymd}-${rand}`
}

// Create freight charge for a PO
app.post('/api/purchasing/orders/:id/freight', async (c) => {
  const db = c.env.DB
  const poId = parseInt(c.req.param('id'))
  const user = getUserFromHeader(c)
  const body = await c.req.json()
  const { vendor_id, vendor_name, invoice_number, amount, tax, allocation_method,
    due_date, notes, is_third_party, carrier_name, tracking_number } = body

  if (!amount || amount <= 0) return c.json({ error: 'Freight amount is required' }, 400)

  // Verify PO exists
  const po = await db.prepare('SELECT id FROM purchase_orders WHERE id = ?').bind(poId).first()
  if (!po) return c.json({ error: 'Purchase order not found' }, 404)

  const result = await db.prepare(
    `INSERT INTO po_freight_charges (po_id, vendor_id, vendor_name, invoice_number, amount, tax,
      allocation_method, status, due_date, notes, is_third_party, carrier_name, tracking_number, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`
  ).bind(poId, vendor_id || null, vendor_name || null, invoice_number || null,
    amount, tax || 0, allocation_method || 'by_qty',
    due_date || null, notes || null, is_third_party ? 1 : 0,
    carrier_name || null, tracking_number || null, user?.id || null).run()

  return c.json({ id: result.meta.last_row_id, success: true })
})

// Get freight charges for a PO (with allocations)
app.get('/api/purchasing/orders/:id/freight', async (c) => {
  const db = c.env.DB
  const poId = parseInt(c.req.param('id'))

  const charges = await db.prepare(
    `SELECT f.*, s.name as supplier_name_resolved
     FROM po_freight_charges f
     LEFT JOIN suppliers s ON f.vendor_id = s.id
     WHERE f.po_id = ? ORDER BY f.created_at DESC`
  ).bind(poId).all()

  // For approved freight, also load allocations
  const chargeList = charges.results || [] as any[]
  for (const charge of chargeList as any[]) {
    if (charge.status === 'approved' || charge.status === 'paid') {
      const allocs = await db.prepare(
        `SELECT fa.*, p.name as product_name, p.sku
         FROM po_freight_allocations fa
         LEFT JOIN products p ON fa.product_id = p.id
         WHERE fa.freight_id = ? ORDER BY fa.id`
      ).bind(charge.id).all()
      charge.allocations = allocs.results || []
    }
  }

  return c.json({ freight_charges: chargeList })
})

// Get single freight charge with allocations
app.get('/api/purchasing/freight/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))

  const charge = await db.prepare(
    `SELECT f.*, s.name as supplier_name_resolved, po.po_number
     FROM po_freight_charges f
     LEFT JOIN suppliers s ON f.vendor_id = s.id
     LEFT JOIN purchase_orders po ON f.po_id = po.id
     WHERE f.id = ?`
  ).bind(id).first() as any

  if (!charge) return c.json({ error: 'Freight charge not found' }, 404)

  const allocations = await db.prepare(
    `SELECT fa.*, p.name as product_name, p.sku, p.cost as current_cost
     FROM po_freight_allocations fa
     LEFT JOIN products p ON fa.product_id = p.id
     WHERE fa.freight_id = ? ORDER BY fa.id`
  ).bind(id).all()

  // Get PO items for allocation preview
  const poItems = await db.prepare(
    `SELECT pi.*, p.name as product_name, p.sku, p.cost as current_cost
     FROM po_items pi
     LEFT JOIN products p ON pi.product_id = p.id
     WHERE pi.po_id = ? ORDER BY pi.id`
  ).bind(charge.po_id).all()

  return c.json({ charge, allocations: allocations.results || [], po_items: poItems.results || [] })
})

// Preview freight allocation before approval
app.get('/api/purchasing/freight/:id/preview-allocation', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))

  const charge = await db.prepare('SELECT * FROM po_freight_charges WHERE id = ?').bind(id).first() as any
  if (!charge) return c.json({ error: 'Freight charge not found' }, 404)

  const poItems = await db.prepare(
    `SELECT pi.*, p.name as product_name, p.sku, p.cost as current_cost
     FROM po_items pi
     LEFT JOIN products p ON pi.product_id = p.id
     WHERE pi.po_id = ? AND pi.qty_ordered > 0 ORDER BY pi.id`
  ).bind(charge.po_id).all()

  const items = (poItems.results || []) as any[]
  const method = charge.allocation_method || 'by_qty'
  const freightAmount = charge.amount || 0

  let preview: any[] = []

  if (method === 'by_qty') {
    const totalQty = items.reduce((sum: number, i: any) => sum + (i.qty_received || i.qty_ordered || 0), 0)
    preview = items.map((item: any) => {
      const qty = item.qty_received || item.qty_ordered || 0
      const allocated = totalQty > 0 ? (qty / totalQty) * freightAmount : 0
      const perUnit = qty > 0 ? allocated / qty : 0
      return {
        po_item_id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        sku: item.sku,
        qty,
        allocated_amount: Math.round(allocated * 100) / 100,
        per_unit_freight: Math.round(perUnit * 100) / 100,
        current_cost: item.current_cost || 0,
        new_landed_cost: Math.round(((item.current_cost || 0) + perUnit) * 100) / 100
      }
    })
  } else if (method === 'by_value') {
    const totalValue = items.reduce((sum: number, i: any) => {
      const qty = i.qty_received || i.qty_ordered || 0
      return sum + qty * (i.unit_cost || 0)
    }, 0)
    preview = items.map((item: any) => {
      const qty = item.qty_received || item.qty_ordered || 0
      const lineValue = qty * (item.unit_cost || 0)
      const allocated = totalValue > 0 ? (lineValue / totalValue) * freightAmount : 0
      const perUnit = qty > 0 ? allocated / qty : 0
      return {
        po_item_id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        sku: item.sku,
        qty,
        allocated_amount: Math.round(allocated * 100) / 100,
        per_unit_freight: Math.round(perUnit * 100) / 100,
        current_cost: item.current_cost || 0,
        new_landed_cost: Math.round(((item.current_cost || 0) + perUnit) * 100) / 100
      }
    })
  } else {
    // even split
    const itemCount = items.length
    preview = items.map((item: any) => {
      const qty = item.qty_received || item.qty_ordered || 0
      const allocated = itemCount > 0 ? freightAmount / itemCount : 0
      const perUnit = qty > 0 ? allocated / qty : 0
      return {
        po_item_id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        sku: item.sku,
        qty,
        allocated_amount: Math.round(allocated * 100) / 100,
        per_unit_freight: Math.round(perUnit * 100) / 100,
        current_cost: item.current_cost || 0,
        new_landed_cost: Math.round(((item.current_cost || 0) + perUnit) * 100) / 100
      }
    })
  }

  return c.json({ charge, preview, method, total_freight: freightAmount })
})

// Update freight charge (status changes, approval with cost allocation)
app.put('/api/purchasing/freight/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const user = getUserFromHeader(c)
  const body = await c.req.json()
  const { status, vendor_id, vendor_name, invoice_number, amount, tax,
    allocation_method, due_date, paid_date, notes, carrier_name, tracking_number } = body

  // Update header fields
  await db.prepare(
    `UPDATE po_freight_charges SET
      status=COALESCE(?,status), vendor_id=COALESCE(?,vendor_id), vendor_name=COALESCE(?,vendor_name),
      invoice_number=COALESCE(?,invoice_number), amount=COALESCE(?,amount), tax=COALESCE(?,tax),
      allocation_method=COALESCE(?,allocation_method), due_date=?, paid_date=?,
      notes=?, carrier_name=COALESCE(?,carrier_name), tracking_number=COALESCE(?,tracking_number),
      updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(status, vendor_id, vendor_name, invoice_number, amount, tax,
    allocation_method, due_date || null, paid_date || null,
    notes ?? null, carrier_name, tracking_number, id).run()

  // If approving, calculate allocation and update product costs
  if (status === 'approved') {
    const charge = await db.prepare('SELECT * FROM po_freight_charges WHERE id = ?').bind(id).first() as any
    if (!charge) return c.json({ error: 'Freight not found' }, 404)

    const poItems = await db.prepare(
      `SELECT pi.*, p.cost as current_cost
       FROM po_items pi
       LEFT JOIN products p ON pi.product_id = p.id
       WHERE pi.po_id = ? AND pi.qty_ordered > 0 ORDER BY pi.id`
    ).bind(charge.po_id).all()

    const items = (poItems.results || []) as any[]
    const method = charge.allocation_method || 'by_qty'
    const freightAmount = charge.amount || 0

    // Clear previous allocations
    await db.prepare('DELETE FROM po_freight_allocations WHERE freight_id = ?').bind(id).run()

    // Calculate totals for allocation
    let totalQty = 0, totalValue = 0
    if (method === 'by_qty') {
      totalQty = items.reduce((sum: number, i: any) => sum + (i.qty_received || i.qty_ordered || 0), 0)
    } else if (method === 'by_value') {
      totalValue = items.reduce((sum: number, i: any) => {
        const qty = i.qty_received || i.qty_ordered || 0
        return sum + qty * (i.unit_cost || 0)
      }, 0)
    }

    for (const item of items) {
      const qty = item.qty_received || item.qty_ordered || 0
      let allocated = 0

      if (method === 'by_qty') {
        allocated = totalQty > 0 ? (qty / totalQty) * freightAmount : 0
      } else if (method === 'by_value') {
        const lineValue = qty * (item.unit_cost || 0)
        allocated = totalValue > 0 ? (lineValue / totalValue) * freightAmount : 0
      } else {
        allocated = items.length > 0 ? freightAmount / items.length : 0
      }

      const perUnit = qty > 0 ? allocated / qty : 0
      const roundedAllocated = Math.round(allocated * 100) / 100
      const roundedPerUnit = Math.round(perUnit * 100) / 100

      // Insert allocation record
      await db.prepare(
        `INSERT INTO po_freight_allocations (freight_id, po_item_id, product_id, qty, allocated_amount, per_unit_freight)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(id, item.id, item.product_id || null, qty, roundedAllocated, roundedPerUnit).run()

      // Update product cost (add freight per unit to current cost)
      if (item.product_id && roundedPerUnit > 0) {
        const oldCost = item.current_cost || 0
        const newCost = Math.round((oldCost + roundedPerUnit) * 100) / 100

        await db.prepare('UPDATE products SET cost = ? WHERE id = ?')
          .bind(newCost, item.product_id).run()

        // Record cost history
        await db.prepare(
          `INSERT INTO product_cost_history (product_id, old_cost, new_cost, source, reference_type, reference_id, bill_id, po_id, supplier_id, changed_by, changed_by_name, notes)
           VALUES (?, ?, ?, 'freight', 'freight', ?, NULL, ?, ?, ?, ?, ?)`
        ).bind(item.product_id, oldCost, newCost, id, charge.po_id,
          charge.vendor_id || null, user?.id || null, user?.email || 'system',
          'Freight $' + roundedAllocated.toFixed(2) + ' allocated ($' + roundedPerUnit.toFixed(2) + '/unit) from ' + (charge.carrier_name || charge.vendor_name || 'freight charge')).run()
      }
    }
  }

  return c.json({ success: true })
})

// Delete freight charge (only pending)
app.delete('/api/purchasing/freight/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))

  const charge = await db.prepare('SELECT status FROM po_freight_charges WHERE id = ?').bind(id).first() as any
  if (!charge) return c.json({ error: 'Not found' }, 404)
  if (charge.status !== 'pending') return c.json({ error: 'Can only delete pending freight charges' }, 400)

  await db.prepare('DELETE FROM po_freight_charges WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// List all freight charges (for bills page)
app.get('/api/purchasing/freight', async (c) => {
  const db = c.env.DB
  const status = c.req.query('status')
  const poId = c.req.query('po_id')

  let q = `SELECT f.*, po.po_number, s.name as supplier_name_resolved,
    (SELECT COUNT(*) FROM po_freight_allocations WHERE freight_id = f.id) as allocation_count
    FROM po_freight_charges f
    LEFT JOIN purchase_orders po ON f.po_id = po.id
    LEFT JOIN suppliers s ON f.vendor_id = s.id
    WHERE 1=1`
  const binds: any[] = []

  if (status) { q += ' AND f.status = ?'; binds.push(status) }
  if (poId) { q += ' AND f.po_id = ?'; binds.push(parseInt(poId)) }
  q += ' ORDER BY f.created_at DESC'

  const result = await db.prepare(q).bind(...binds).all()
  return c.json({ freight_charges: result.results || [] })
})

// Get landed cost summary for a PO (product costs + freight per unit)
app.get('/api/purchasing/orders/:id/landed-cost', async (c) => {
  const db = c.env.DB
  const poId = parseInt(c.req.param('id'))

  // Get PO items with current product cost
  const items = await db.prepare(
    `SELECT pi.*, p.name as product_name, p.sku, p.cost as current_cost
     FROM po_items pi
     LEFT JOIN products p ON pi.product_id = p.id
     WHERE pi.po_id = ? ORDER BY pi.id`
  ).bind(poId).all()

  // Get bill items unit costs for this PO
  const billCosts = await db.prepare(
    `SELECT bi.product_id, bi.unit_cost as bill_unit_cost
     FROM po_bill_items bi
     JOIN po_bills b ON bi.bill_id = b.id
     WHERE b.po_id = ? AND b.status IN ('approved','paid')
     ORDER BY b.created_at DESC`
  ).bind(poId).all()

  // Get approved freight allocations
  const freightAllocs = await db.prepare(
    `SELECT fa.product_id, fa.per_unit_freight, fa.allocated_amount,
      f.carrier_name, f.vendor_name, f.invoice_number
     FROM po_freight_allocations fa
     JOIN po_freight_charges f ON fa.freight_id = f.id
     WHERE f.po_id = ? AND f.status IN ('approved','paid')`
  ).bind(poId).all()

  // Get freight totals
  const freightTotals = await db.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total_freight, COUNT(*) as freight_count
     FROM po_freight_charges WHERE po_id = ? AND status IN ('approved','paid')`
  ).bind(poId).first() as any

  // Build cost map per product
  const billCostMap: Record<number, number> = {}
  for (const bc of (billCosts.results || []) as any[]) {
    if (bc.product_id && !billCostMap[bc.product_id]) {
      billCostMap[bc.product_id] = bc.bill_unit_cost
    }
  }

  const freightMap: Record<number, number> = {}
  for (const fa of (freightAllocs.results || []) as any[]) {
    if (fa.product_id) {
      freightMap[fa.product_id] = (freightMap[fa.product_id] || 0) + (fa.per_unit_freight || 0)
    }
  }

  const landedItems = ((items.results || []) as any[]).map((item: any) => {
    const billCost = billCostMap[item.product_id] || item.unit_cost || 0
    const freightPerUnit = freightMap[item.product_id] || 0
    const landedCost = Math.round((billCost + freightPerUnit) * 100) / 100
    return {
      ...item,
      bill_unit_cost: billCost,
      freight_per_unit: Math.round(freightPerUnit * 100) / 100,
      landed_cost: landedCost
    }
  })

  return c.json({
    items: landedItems,
    total_freight: freightTotals?.total_freight || 0,
    freight_count: freightTotals?.freight_count || 0
  })
})

// ==================== DASHBOARD / SUMMARY ====================

app.get('/api/purchasing/dashboard', async (c) => {
  const db = c.env.DB

  // Summary counts by status
  const statusCounts = await db.prepare(
    `SELECT status, COUNT(*) as cnt, order_type FROM purchase_orders GROUP BY status, order_type`
  ).all()

  // Arriving soon (expected in next 7 days OR no date set — all active POs need attention)
  const arrivingSoon = await db.prepare(
    `SELECT po.*, s.name as supplier_name, l.name as location_name, l.code as location_code,
      (SELECT COALESCE(SUM(qty_ordered), 0) FROM po_items WHERE po_id = po.id) as total_qty_ordered,
      (SELECT COALESCE(SUM(qty_received), 0) FROM po_items WHERE po_id = po.id) as total_qty_received,
      (SELECT COUNT(*) FROM po_items WHERE po_id = po.id) as item_count
     FROM purchase_orders po
     LEFT JOIN suppliers s ON po.supplier_id = s.id
     JOIN locations l ON po.location_id = l.id
     WHERE po.status IN ('ordered','in_transit','delayed','partial')
       AND (po.expected_date IS NULL
            OR (po.expected_date >= date('now') AND po.expected_date <= date('now', '+7 days')))
     ORDER BY po.expected_date IS NULL, po.expected_date ASC`
  ).all()

  // Active POs (not received/cancelled/claim)
  const activePOs = await db.prepare(
    `SELECT po.*, s.name as supplier_name, l.code as location_code,
      (SELECT COALESCE(SUM(qty_ordered), 0) FROM po_items WHERE po_id = po.id) as total_qty_ordered,
      (SELECT COALESCE(SUM(qty_received), 0) FROM po_items WHERE po_id = po.id) as total_qty_received,
      (SELECT COUNT(*) FROM po_items WHERE po_id = po.id) as item_count
     FROM purchase_orders po
     LEFT JOIN suppliers s ON po.supplier_id = s.id
     JOIN locations l ON po.location_id = l.id
     WHERE po.status IN ('ordered','in_transit','delayed','partial')
     ORDER BY po.expected_date ASC NULLS LAST`
  ).all()

  // Overdue POs
  const overdue = await db.prepare(
    `SELECT COUNT(*) as cnt FROM purchase_orders WHERE status IN ('ordered','in_transit','delayed') AND expected_date < date('now') AND expected_date IS NOT NULL`
  ).first() as any

  // Pending bills
  const pendingBills = await db.prepare(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(amount + tax), 0) as total FROM po_bills WHERE status = 'pending'`
  ).first() as any

  // Pending freight
  let pendingFreight = { cnt: 0, total: 0 } as any
  try {
    pendingFreight = await db.prepare(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(amount + tax), 0) as total FROM po_freight_charges WHERE status = 'pending'`
    ).first() as any
  } catch(e) { /* table may not exist yet */ }

  // Recent receivings (last 7 days)
  const recentReceivings = await db.prepare(
    `SELECT r.*, po.po_number, po.order_type, l.code as location_code,
      (SELECT COUNT(*) FROM po_receiving_items WHERE receiving_id = r.id) as item_count
     FROM po_receiving r
     JOIN purchase_orders po ON r.po_id = po.id
     JOIN locations l ON COALESCE(r.location_id, po.location_id) = l.id
     WHERE r.received_at >= datetime('now', '-7 days')
     ORDER BY r.received_at DESC LIMIT 20`
  ).all()

  return c.json({
    status_counts: statusCounts.results || [],
    arriving_soon: arrivingSoon.results || [],
    active_pos: activePOs.results || [],
    overdue_count: overdue?.cnt || 0,
    pending_bills: { count: pendingBills?.cnt || 0, total: pendingBills?.total || 0 },
    pending_freight: { count: pendingFreight?.cnt || 0, total: pendingFreight?.total || 0 },
    recent_receivings: recentReceivings.results || []
  })
})

// Arriving view — what's coming and when (for stock planning)
app.get('/api/purchasing/arriving', async (c) => {
  const db = c.env.DB
  const locationId = c.req.query('location_id')
  const days = parseInt(c.req.query('days') || '30')

  let q = `SELECT po.id, po.po_number, po.order_type, po.status, po.expected_date, po.notes,
    s.name as supplier_name, l.name as location_name, l.code as location_code,
    pi.id as item_id, pi.description, pi.qty_ordered, pi.qty_received, pi.unit, pi.product_id,
    p.name as product_name, p.category as product_category
    FROM purchase_orders po
    LEFT JOIN suppliers s ON po.supplier_id = s.id
    JOIN locations l ON po.location_id = l.id
    JOIN po_items pi ON pi.po_id = po.id
    LEFT JOIN products p ON pi.product_id = p.id
    WHERE po.status IN ('ordered','in_transit','delayed','partial')
      AND (po.expected_date IS NULL
           OR po.expected_date <= date('now', '+' || ? || ' days'))`
  const binds: any[] = [days]
  if (locationId) { q += ' AND po.location_id = ?'; binds.push(parseInt(locationId)) }
  q += ' ORDER BY po.expected_date IS NULL, po.expected_date ASC, po.id'

  const result = await db.prepare(q).bind(...binds).all()
  return c.json({ arriving: result.results || [] })
})

// Products search for PO item picker
app.get('/api/purchasing/products', async (c) => {
  const db = c.env.DB
  const search = c.req.query('search') || ''
  const category = c.req.query('category')
  const limit = parseInt(c.req.query('limit') || '50')
  const safeLimit = Math.min(limit, 2000)

  let q = 'SELECT id, name, sku, category, unit_type, price, cost FROM products WHERE active = 1'
  const binds: any[] = []
  if (search) { q += ' AND (name LIKE ? OR sku LIKE ?)'; binds.push(`%${search}%`, `%${search}%`) }
  if (category) { q += ' AND category = ?'; binds.push(category) }
  q += ' ORDER BY name LIMIT ?'
  binds.push(safeLimit)

  const result = await db.prepare(q).bind(...binds).all()
  return c.json({ products: result.results || [] })
})

// ==================== ORDER REQUESTS ====================

function generateRequestNumber(): string {
  const d = new Date()
  const ymd = d.getFullYear().toString().slice(2) + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0')
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `REQ-${ymd}-${rand}`
}

// List order requests (includes POS-originated requests since they now go into same table)
app.get('/api/purchasing/requests', async (c) => {
  const db = c.env.DB
  const status = c.req.query('status')
  const locationId = c.req.query('location_id')
  const urgency = c.req.query('urgency')
  const source = c.req.query('source')
  const assignedTo = c.req.query('assigned_to')
  const category = c.req.query('category')

  let q = `SELECT r.*, l.name as location_name, l.code as location_code,
    (SELECT COUNT(*) FROM order_request_items WHERE request_id = r.id) as item_count
    FROM order_requests r
    JOIN locations l ON r.location_id = l.id
    WHERE 1=1`
  const binds: any[] = []
  if (status && status !== 'all') { q += ' AND r.status = ?'; binds.push(status) }
  if (locationId) { q += ' AND r.location_id = ?'; binds.push(parseInt(locationId)) }
  if (urgency) { q += ' AND r.urgency = ?'; binds.push(urgency) }
  if (source) { q += ' AND r.source = ?'; binds.push(source) }
  if (assignedTo) { q += ' AND CAST(r.assigned_to AS TEXT) = ?'; binds.push(assignedTo) }
  if (category) {
    q += ` AND r.id IN (SELECT ri.request_id FROM order_request_items ri JOIN products p ON ri.product_id = p.id WHERE p.category = ?)`
    binds.push(category)
  }
  q += ' ORDER BY CASE r.urgency WHEN \'critical\' THEN 0 WHEN \'high\' THEN 1 WHEN \'normal\' THEN 2 ELSE 3 END, r.created_at DESC'

  const result = await db.prepare(q).bind(...binds).all()
  return c.json({ requests: result.results || [] })
})

// Dashboard request summary (for purchasing dashboard) — MUST be before :id route
app.get('/api/purchasing/requests/summary', async (c) => {
  const db = c.env.DB
  const counts = await db.prepare(
    `SELECT status, urgency, COUNT(*) as cnt FROM order_requests GROUP BY status, urgency`
  ).all()

  const pending = await db.prepare(
    `SELECT r.*, l.code as location_code,
      (SELECT COUNT(*) FROM order_request_items WHERE request_id = r.id) as item_count
     FROM order_requests r
     JOIN locations l ON r.location_id = l.id
     WHERE r.status = 'pending'
     ORDER BY CASE r.urgency WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, r.created_at DESC
     LIMIT 20`
  ).all()

  return c.json({ counts: counts.results || [], pending_requests: pending.results || [] })
})

// Get single request with items
app.get('/api/purchasing/requests/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))

  const request = await db.prepare(
    `SELECT r.*, l.name as location_name, l.code as location_code
     FROM order_requests r
     JOIN locations l ON r.location_id = l.id
     WHERE r.id = ?`
  ).bind(id).first()
  if (!request) return c.json({ error: 'Request not found' }, 404)

  const items = await db.prepare(
    `SELECT ri.*, p.name as product_name, p.sku, p.category, p.unit_type as product_unit_type
     FROM order_request_items ri
     LEFT JOIN products p ON ri.product_id = p.id
     WHERE ri.request_id = ? ORDER BY ri.id`
  ).bind(id).all()

  return c.json({ request, items: items.results || [] })
})

// Create order request (from warehouse / sales rep / inventory / POS / smart restock)
app.post('/api/purchasing/requests', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)
  const body = await c.req.json()
  const { location_id, order_type, urgency, reason, notes, items, source } = body

  if (!location_id) return c.json({ error: 'Location required' }, 400)
  if (!items || !Array.isArray(items) || items.length === 0) return c.json({ error: 'At least one item required' }, 400)

  // Auto-assign based on category of first item
  let assignedTo: number | null = null
  let assignedToName: string | null = null
  if (items[0]?.product_id) {
    try {
      const prod = await db.prepare('SELECT category FROM products WHERE id = ?').bind(items[0].product_id).first() as any
      if (prod?.category) {
        const assignment = await db.prepare(
          'SELECT user_id, user_name FROM category_order_assignments WHERE category = ? AND is_primary = 1 LIMIT 1'
        ).bind(prod.category).first() as any
        if (assignment) {
          assignedTo = assignment.user_id
          assignedToName = assignment.user_name
        }
      }
    } catch(e) { /* table may not exist yet */ }
  }

  const request_number = generateRequestNumber()
  const result = await db.prepare(
    `INSERT INTO order_requests (request_number, status, urgency, order_type, location_id, requested_by, requested_by_name, requested_by_role, reason, notes, source, assigned_to, assigned_to_name)
     VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    request_number,
    urgency || 'normal',
    order_type || null,
    location_id,
    user?.id || null,
    user?.email || 'unknown',
    user?.role || 'staff',
    reason || null,
    notes || null,
    source || 'manual',
    assignedTo,
    assignedToName
  ).run()

  const requestId = result.meta.last_row_id

  // Insert request items — optionally capture current stock level
  for (const item of items) {
    let currentStock = null
    if (item.product_id && location_id) {
      const stock = await db.prepare('SELECT qty_on_hand FROM inventory_stock WHERE product_id = ? AND location_id = ?')
        .bind(item.product_id, location_id).first() as any
      currentStock = stock?.qty_on_hand ?? null
    }
    await db.prepare(
      `INSERT INTO order_request_items (request_id, product_id, description, qty_requested, unit, current_stock, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      requestId,
      item.product_id || null,
      item.description || '',
      item.qty_requested || 1,
      item.unit || 'each',
      currentStock,
      item.notes || null
    ).run()
  }

  return c.json({ id: requestId, request_number, success: true })
})

// Review (approve/reject) a request
app.post('/api/purchasing/requests/:id/review', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const user = getUserFromHeader(c)
  const { action, review_notes } = await c.req.json()

  if (!['approved', 'rejected'].includes(action)) return c.json({ error: 'Invalid action' }, 400)

  const request = await db.prepare('SELECT * FROM order_requests WHERE id = ?').bind(id).first() as any
  if (!request) return c.json({ error: 'Request not found' }, 404)
  if (request.status !== 'pending') return c.json({ error: 'Request already reviewed' }, 400)

  await db.prepare(
    `UPDATE order_requests SET status = ?, reviewed_by = ?, reviewed_by_name = ?, reviewed_at = CURRENT_TIMESTAMP, review_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(action, user?.id || null, user?.email || 'admin', review_notes || null, id).run()

  return c.json({ success: true, new_status: action })
})

// Convert approved request to PO
app.post('/api/purchasing/requests/:id/convert', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { supplier_id, expected_date } = body

  const request = await db.prepare('SELECT * FROM order_requests WHERE id = ?').bind(id).first() as any
  if (!request) return c.json({ error: 'Request not found' }, 404)
  if (request.status !== 'approved') return c.json({ error: 'Request must be approved first' }, 400)

  // Get request items
  const reqItems = await db.prepare('SELECT * FROM order_request_items WHERE request_id = ?').bind(id).all()

  // Create a PO from this request
  const poType = request.order_type || 'shelf_goods'
  const po_number = generatePONumber(poType)
  const poResult = await db.prepare(
    `INSERT INTO purchase_orders (po_number, supplier_id, order_type, status, location_id, order_date, expected_date, notes, internal_notes, created_by, created_by_name)
     VALUES (?, ?, ?, 'ordered', ?, date('now'), ?, ?, ?, ?, ?)`
  ).bind(
    po_number,
    supplier_id || null,
    poType,
    request.location_id,
    expected_date || null,
    request.notes || null,
    'Converted from request ' + request.request_number + (request.reason ? '. Reason: ' + request.reason : ''),
    user?.id || null,
    user?.email || 'system'
  ).run()

  const poId = poResult.meta.last_row_id

  // Insert PO line items from request items — auto-fill cost from product.cost on file
  let totalAmount = 0
  for (const item of (reqItems.results || []) as any[]) {
    let unitCost = 0
    if (item.product_id) {
      const prod = await db.prepare('SELECT cost FROM products WHERE id = ?').bind(item.product_id).first() as any
      unitCost = prod?.cost || 0
    }
    totalAmount += (item.qty_requested || 1) * unitCost
    await db.prepare(
      `INSERT INTO po_items (po_id, product_id, description, qty_ordered, unit, unit_cost, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(poId, item.product_id || null, item.description || '', item.qty_requested || 1, item.unit || 'each', unitCost, item.notes || null).run()
  }
  if (totalAmount > 0) {
    await db.prepare('UPDATE purchase_orders SET total_amount = ? WHERE id = ?').bind(totalAmount, poId).run()
  }

  // Mark request as converted
  await db.prepare(
    'UPDATE order_requests SET status = ?, converted_po_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind('converted', poId, id).run()

  return c.json({ success: true, po_id: poId, po_number })
})

// Cancel a request
app.post('/api/purchasing/requests/:id/cancel', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))

  const request = await db.prepare('SELECT * FROM order_requests WHERE id = ?').bind(id).first() as any
  if (!request) return c.json({ error: 'Request not found' }, 404)
  if (!['pending', 'approved'].includes(request.status)) return c.json({ error: 'Cannot cancel this request' }, 400)

  await db.prepare('UPDATE order_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind('cancelled', id).run()
  return c.json({ success: true })
})

// ==================== POS INVENTORY REQUEST → PURCHASING BRIDGE ====================

// Get POS inventory requests visible to purchasing (pending/approved that haven't been converted)
app.get('/api/purchasing/pos-requests', async (c) => {
  const db = c.env.DB
  const status = c.req.query('status') || ''
  const locationId = c.req.query('location_id') || ''

  let q = `SELECT r.*, l.name as location_name, l.code as location_code,
    (SELECT COUNT(*) FROM pos_inventory_request_items WHERE request_id = r.id) as item_count,
    (SELECT SUM(qty_requested) FROM pos_inventory_request_items WHERE request_id = r.id) as total_qty
    FROM pos_inventory_requests r
    LEFT JOIN locations l ON l.id = r.location_id
    WHERE 1=1`
  const binds: any[] = []
  if (status) { q += ' AND r.status = ?'; binds.push(status) }
  else { q += " AND r.status IN ('pending','approved')" }
  if (locationId) { q += ' AND r.location_id = ?'; binds.push(parseInt(locationId)) }
  q += ` ORDER BY CASE r.urgency WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, r.created_at DESC`

  const result = await db.prepare(q).bind(...binds).all()
  return c.json({ requests: result.results || [] })
})

// Get single POS request detail (for purchasing to review)
app.get('/api/purchasing/pos-requests/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const req = await db.prepare(`
    SELECT r.*, l.name as location_name, l.code as location_code
    FROM pos_inventory_requests r LEFT JOIN locations l ON l.id = r.location_id WHERE r.id = ?
  `).bind(id).first()
  if (!req) return c.json({ error: 'Request not found' }, 404)

  const items = await db.prepare(`
    SELECT ri.*, p.name as product_name, p.sku, p.category
    FROM pos_inventory_request_items ri
    LEFT JOIN products p ON ri.product_id = p.id
    WHERE ri.request_id = ? ORDER BY ri.id
  `).bind(id).all()

  return c.json({ request: req, items: items.results || [] })
})

// Fulfill POS request via transfer (from Aldi warehouse)
app.post('/api/purchasing/pos-requests/:id/transfer', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const user = getUserFromHeader(c)
  const body = await c.req.json()
  const { source_location_id, notes } = body

  const req = await db.prepare('SELECT * FROM pos_inventory_requests WHERE id = ?').bind(id).first() as any
  if (!req) return c.json({ error: 'Request not found' }, 404)

  // Create inventory transfer
  const d = new Date()
  const tNum = `TRF${d.getFullYear().toString().slice(2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.random().toString(36).substring(2,7).toUpperCase()}`

  const items = await db.prepare('SELECT * FROM pos_inventory_request_items WHERE request_id = ?').bind(id).all()

  const trResult = await db.prepare(
    `INSERT INTO inventory_transfers (transfer_number, from_location_id, to_location_id, status, notes, created_by)
     VALUES (?, ?, ?, 'pending', ?, ?)`
  ).bind(tNum, source_location_id, req.location_id, (notes || '') + ' | From POS request ' + req.request_number, user?.id || null).run()

  const transferId = trResult.meta.last_row_id

  for (const item of (items.results || []) as any[]) {
    await db.prepare(
      `INSERT INTO inventory_transfer_items (transfer_id, product_id, qty_requested)
       VALUES (?, ?, ?)`
    ).bind(transferId, item.product_id, item.qty_requested).run()
  }

  // Update POS request
  await db.prepare(
    `UPDATE pos_inventory_requests SET fulfillment_type = 'transfer', transfer_id = ?, status = 'approved', reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(transferId, id).run()

  return c.json({ success: true, transfer_id: transferId, transfer_number: tNum })
})

// Fulfill POS request via purchase order (from supplier)
app.post('/api/purchasing/pos-requests/:id/purchase', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const user = getUserFromHeader(c)
  const body = await c.req.json()
  const { supplier_id, expected_date } = body

  const req = await db.prepare('SELECT * FROM pos_inventory_requests WHERE id = ?').bind(id).first() as any
  if (!req) return c.json({ error: 'Request not found' }, 404)

  const items = await db.prepare('SELECT * FROM pos_inventory_request_items WHERE request_id = ?').bind(id).all()

  // First create an order_request in the purchasing system
  const reqNum = `REQ${Date.now().toString(36).toUpperCase()}`
  const orResult = await db.prepare(
    `INSERT INTO order_requests (request_number, status, urgency, location_id, requested_by, requested_by_name, requested_by_role, reason, notes)
     VALUES (?, 'pending', ?, ?, ?, ?, 'pos_staff', ?, ?)`
  ).bind(reqNum, req.urgency || 'normal', req.location_id,
    req.requested_by || user?.id, req.requested_by_name || user?.email || 'POS',
    'POS Inventory Request: ' + req.request_number,
    (req.notes || '') + (req.customer_name ? ' | Client: ' + req.customer_name : '')).run()

  const orderRequestId = orResult.meta.last_row_id

  for (const item of (items.results || []) as any[]) {
    await db.prepare(
      `INSERT INTO order_request_items (request_id, product_id, description, qty_requested, unit, current_stock, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(orderRequestId, item.product_id, item.product_name || '', item.qty_requested, item.unit || 'each', item.current_stock || null, item.notes || null).run()
  }

  // Update POS request
  await db.prepare(
    `UPDATE pos_inventory_requests SET fulfillment_type = 'purchase', purchasing_request_id = ?, status = 'approved', reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(orderRequestId, id).run()

  return c.json({ success: true, purchasing_request_id: orderRequestId, request_number: reqNum })
})

// ==================== PRICING ALERTS (auto-generated on bill approval) ====================

app.get('/api/purchasing/pricing-alerts', async (c) => {
  const db = c.env.DB
  const status = c.req.query('status') || ''
  const type = c.req.query('type') || ''
  let q = `SELECT pa.*, p.name as product_name_live, p.sku as sku_live, p.price as current_price_live, p.cost as current_cost_live
           FROM pricing_alerts pa LEFT JOIN products p ON pa.product_id = p.id WHERE 1=1`
  const binds: any[] = []
  if (status) { q += ' AND pa.status = ?'; binds.push(status) }
  else { q += " AND pa.status IN ('pending','acknowledged')" }
  if (type) { q += ' AND pa.alert_type = ?'; binds.push(type) }
  q += ' ORDER BY pa.created_at DESC LIMIT 100'
  const r = await db.prepare(q).bind(...binds).all()
  return c.json({ alerts: r.results || [] })
})

app.patch('/api/purchasing/pricing-alerts/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const user = getUserFromHeader(c)
  const body = await c.req.json()

  const fields: string[] = []
  const vals: any[] = []
  if (body.status) { fields.push('status = ?'); vals.push(body.status) }
  if (body.resolution_notes !== undefined) { fields.push('resolution_notes = ?'); vals.push(body.resolution_notes) }
  if (body.status === 'resolved' || body.status === 'dismissed') {
    fields.push('resolved_by = ?'); vals.push(user?.id || null)
    fields.push('resolved_by_name = ?'); vals.push(user?.email || 'system')
    fields.push('resolved_at = CURRENT_TIMESTAMP')
  }
  if (body.suggested_price !== undefined) { fields.push('suggested_price = ?'); vals.push(body.suggested_price) }
  fields.push('updated_at = CURRENT_TIMESTAMP')
  vals.push(id)

  await db.prepare(`UPDATE pricing_alerts SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run()

  // If resolved with a new price, update the product
  if (body.status === 'resolved' && body.new_price !== undefined) {
    const alert = await db.prepare('SELECT product_id FROM pricing_alerts WHERE id = ?').bind(id).first() as any
    if (alert?.product_id) {
      await db.prepare('UPDATE products SET price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(body.new_price, alert.product_id).run()
    }
  }

  return c.json({ success: true })
})

// Get pricing alert settings
app.get('/api/purchasing/pricing-alert-settings', async (c) => {
  const db = c.env.DB
  const r = await db.prepare('SELECT * FROM pricing_alert_settings WHERE active = 1 ORDER BY alert_type').all()
  return c.json({ settings: r.results || [] })
})

app.put('/api/purchasing/pricing-alert-settings/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  await db.prepare(
    `UPDATE pricing_alert_settings SET threshold_pct = ?, min_margin_pct = ?, notify_user_ids = ?, notify_roles = ?, active = ? WHERE id = ?`
  ).bind(body.threshold_pct || 0, body.min_margin_pct || 15, body.notify_user_ids || null, body.notify_roles || 'admin,manager', body.active ?? 1, id).run()
  return c.json({ success: true })
})

// ==================== FEE CONFIGURATION ====================

app.get('/api/purchasing/fees', async (c) => {
  const db = c.env.DB
  const r = await db.prepare('SELECT * FROM fee_config ORDER BY fee_type').all()
  return c.json({ fees: r.results || [] })
})

app.put('/api/purchasing/fees/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  await db.prepare(
    `UPDATE fee_config SET name=?, rate=?, rate_type=?, apply_to=?, min_order_amount=?, max_fee=?, active=?, legal_notice=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(body.name, body.rate || 0, body.rate_type || 'percentage', body.apply_to || 'delivery',
    body.min_order_amount || 0, body.max_fee || 0, body.active ?? 1,
    body.legal_notice || null, body.notes || null, id).run()
  return c.json({ success: true })
})

export { app as purchasingApp }
