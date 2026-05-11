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

  return c.json({
    order: po,
    items: items.results || [],
    receivings: receivings.results || [],
    images: images.results || [],
    bills: bills.results || []
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

// ==================== RECEIVING (WAREHOUSE) ====================

app.post('/api/purchasing/orders/:id/receive', async (c) => {
  const db = c.env.DB
  const poId = parseInt(c.req.param('id'))
  const user = getUserFromHeader(c)
  const body = await c.req.json()
  const { items, notes, location_id } = body

  if (!items || !Array.isArray(items) || items.length === 0) return c.json({ error: 'Receiving items required' }, 400)

  // Get the PO
  const po = await db.prepare('SELECT * FROM purchase_orders WHERE id = ?').bind(poId).first() as any
  if (!po) return c.json({ error: 'PO not found' }, 404)

  const locId = location_id || po.location_id

  // Create receiving record
  const recvResult = await db.prepare(
    `INSERT INTO po_receiving (po_id, received_by, received_by_name, notes, location_id) VALUES (?, ?, ?, ?, ?)`
  ).bind(poId, user?.id || null, user?.email || 'warehouse', notes || null, locId).run()
  const receivingId = recvResult.meta.last_row_id

  // Insert receiving line items and update po_items qty_received
  for (const item of items) {
    if (!item.po_item_id || !item.qty_received) continue

    await db.prepare(
      `INSERT INTO po_receiving_items (receiving_id, po_item_id, product_id, qty_received, condition, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(receivingId, item.po_item_id, item.product_id || null, item.qty_received,
      item.condition || 'good', item.notes || null).run()

    // Update cumulative qty_received on po_items
    await db.prepare('UPDATE po_items SET qty_received = qty_received + ? WHERE id = ?')
      .bind(item.qty_received, item.po_item_id).run()

    // Update inventory_stock if product_id exists
    if (item.product_id && item.condition !== 'rejected') {
      // Check if stock row exists
      const existing = await db.prepare('SELECT id, qty_on_hand FROM inventory_stock WHERE product_id = ? AND location_id = ?')
        .bind(item.product_id, locId).first() as any

      if (existing) {
        const newQty = (existing.qty_on_hand || 0) + item.qty_received
        await db.prepare('UPDATE inventory_stock SET qty_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .bind(newQty, existing.id).run()

        // Audit log
        await db.prepare(
          `INSERT INTO inventory_audit (product_id, location_id, action, qty_change, qty_before, qty_after, reason, reference_type, reference_id, user_id, user_name)
           VALUES (?, ?, 'po_received', ?, ?, ?, 'Purchase Order received', 'purchase_order', ?, ?, ?)`
        ).bind(item.product_id, locId, item.qty_received, existing.qty_on_hand, newQty, poId, user?.id || null, user?.email || 'warehouse').run()
      } else {
        // Create new stock row
        await db.prepare(
          `INSERT INTO inventory_stock (product_id, location_id, qty_on_hand, qty_on_hold, qty_reserved, last_counted_at, last_counted_by, updated_at)
           VALUES (?, ?, ?, 0, 0, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)`
        ).bind(item.product_id, locId, item.qty_received, user?.id || null).run()

        // Audit log
        await db.prepare(
          `INSERT INTO inventory_audit (product_id, location_id, action, qty_change, qty_before, qty_after, reason, reference_type, reference_id, user_id, user_name)
           VALUES (?, ?, 'po_received', ?, 0, ?, 'Purchase Order received (new stock)', 'purchase_order', ?, ?, ?)`
        ).bind(item.product_id, locId, item.qty_received, item.qty_received, poId, user?.id || null, user?.email || 'warehouse').run()
      }
    }
  }

  // Check if PO is fully received or partial
  const poItems = await db.prepare('SELECT qty_ordered, qty_received FROM po_items WHERE po_id = ?').bind(poId).all()
  const allReceived = (poItems.results || []).every((i: any) => i.qty_received >= i.qty_ordered)
  const anyReceived = (poItems.results || []).some((i: any) => i.qty_received > 0)

  let newStatus = po.status
  if (allReceived) {
    newStatus = 'received'
  } else if (anyReceived) {
    newStatus = 'partial'
  }

  if (newStatus !== po.status) {
    await db.prepare('UPDATE purchase_orders SET status = ?, received_date = CASE WHEN ? = \'received\' THEN date(\'now\') ELSE received_date END, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(newStatus, newStatus, poId).run()
  }

  return c.json({ receiving_id: receivingId, new_status: newStatus, success: true })
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

app.post('/api/purchasing/orders/:id/bills', async (c) => {
  const db = c.env.DB
  const poId = parseInt(c.req.param('id'))
  const user = getUserFromHeader(c)
  const { supplier_invoice_number, amount, tax, due_date, notes } = await c.req.json()

  const bill_number = generateBillNumber()
  const result = await db.prepare(
    `INSERT INTO po_bills (po_id, bill_number, supplier_invoice_number, amount, tax, status, due_date, notes, created_by)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
  ).bind(poId, bill_number, supplier_invoice_number || null, amount || 0, tax || 0, due_date || null, notes || null, user?.id || null).run()

  return c.json({ id: result.meta.last_row_id, bill_number, success: true })
})

app.put('/api/purchasing/bills/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const { status, supplier_invoice_number, amount, tax, due_date, paid_date, notes } = await c.req.json()

  await db.prepare(
    `UPDATE po_bills SET status=COALESCE(?,status), supplier_invoice_number=COALESCE(?,supplier_invoice_number),
     amount=COALESCE(?,amount), tax=COALESCE(?,tax), due_date=?, paid_date=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(status, supplier_invoice_number, amount, tax, due_date || null, paid_date || null, notes ?? null, id).run()
  return c.json({ success: true })
})

app.get('/api/purchasing/bills', async (c) => {
  const db = c.env.DB
  const status = c.req.query('status')
  let q = `SELECT b.*, po.po_number, po.order_type, s.name as supplier_name
    FROM po_bills b
    JOIN purchase_orders po ON b.po_id = po.id
    LEFT JOIN suppliers s ON po.supplier_id = s.id
    WHERE 1=1`
  const binds: any[] = []
  if (status) { q += ' AND b.status = ?'; binds.push(status) }
  q += ' ORDER BY b.created_at DESC'

  const result = await db.prepare(q).bind(...binds).all()
  return c.json({ bills: result.results || [] })
})

// ==================== DASHBOARD / SUMMARY ====================

app.get('/api/purchasing/dashboard', async (c) => {
  const db = c.env.DB

  // Summary counts by status
  const statusCounts = await db.prepare(
    `SELECT status, COUNT(*) as cnt, order_type FROM purchase_orders GROUP BY status, order_type`
  ).all()

  // Arriving soon (expected_date in next 7 days, not received)
  const arrivingSoon = await db.prepare(
    `SELECT po.*, s.name as supplier_name, l.name as location_name, l.code as location_code,
      (SELECT COALESCE(SUM(qty_ordered), 0) FROM po_items WHERE po_id = po.id) as total_qty_ordered,
      (SELECT COALESCE(SUM(qty_received), 0) FROM po_items WHERE po_id = po.id) as total_qty_received,
      (SELECT COUNT(*) FROM po_items WHERE po_id = po.id) as item_count
     FROM purchase_orders po
     LEFT JOIN suppliers s ON po.supplier_id = s.id
     JOIN locations l ON po.location_id = l.id
     WHERE po.status IN ('ordered','in_transit','delayed','partial')
       AND po.expected_date IS NOT NULL
       AND po.expected_date >= date('now')
       AND po.expected_date <= date('now', '+7 days')
     ORDER BY po.expected_date ASC`
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
      AND po.expected_date IS NOT NULL
      AND po.expected_date <= date('now', '+' || ? || ' days')`
  const binds: any[] = [days]
  if (locationId) { q += ' AND po.location_id = ?'; binds.push(parseInt(locationId)) }
  q += ' ORDER BY po.expected_date ASC, po.id'

  const result = await db.prepare(q).bind(...binds).all()
  return c.json({ arriving: result.results || [] })
})

// Products search for PO item picker
app.get('/api/purchasing/products', async (c) => {
  const db = c.env.DB
  const search = c.req.query('search') || ''
  const category = c.req.query('category')

  let q = 'SELECT id, name, sku, category, unit_type, price FROM products WHERE active = 1'
  const binds: any[] = []
  if (search) { q += ' AND (name LIKE ? OR sku LIKE ?)'; binds.push(`%${search}%`, `%${search}%`) }
  if (category) { q += ' AND category = ?'; binds.push(category) }
  q += ' ORDER BY name LIMIT 50'

  const result = await db.prepare(q).bind(...binds).all()
  return c.json({ products: result.results || [] })
})

export { app as purchasingApp }
