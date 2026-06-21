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

async function auditLog(db: D1Database, params: {
  product_id: number, location_id: number, action: string, qty_change: number,
  qty_before?: number, qty_after?: number, reason?: string,
  reference_type?: string, reference_id?: number, batch_id?: number,
  notes?: string, user_id?: number, user_name?: string
}) {
  await db.prepare(`INSERT INTO inventory_audit 
    (product_id, location_id, action, qty_change, qty_before, qty_after, reason, reference_type, reference_id, batch_id, notes, user_id, user_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(params.product_id, params.location_id, params.action, params.qty_change,
      params.qty_before ?? null, params.qty_after ?? null, params.reason ?? null,
      params.reference_type ?? null, params.reference_id ?? null, params.batch_id ?? null,
      params.notes ?? null, params.user_id ?? null, params.user_name ?? null)
    .run()
}

async function getOrCreateStock(db: D1Database, product_id: number, location_id: number): Promise<any> {
  let stock = await db.prepare('SELECT * FROM inventory_stock WHERE product_id = ? AND location_id = ?')
    .bind(product_id, location_id).first()
  if (!stock) {
    await db.prepare('INSERT INTO inventory_stock (product_id, location_id, qty_on_hand, qty_on_hold, qty_reserved) VALUES (?, ?, 0, 0, 0)')
      .bind(product_id, location_id).run()
    stock = await db.prepare('SELECT * FROM inventory_stock WHERE product_id = ? AND location_id = ?')
      .bind(product_id, location_id).first()
  }
  return stock
}

function generateTransferNumber(): string {
  const d = new Date()
  const ymd = d.getFullYear().toString().slice(2) + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0')
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `TRF-${ymd}-${rand}`
}

// ==================== DASHBOARD / OVERVIEW ====================

app.get('/api/inventory/dashboard', async (c) => {
  const db = c.env.DB
  const locationId = c.req.query('location_id')

  let stockQuery = `SELECT s.*, p.name as product_name, p.sku, p.category, p.subcategory, p.unit_type, p.price, p.cost, p.weight_per_unit,
    l.name as location_name, l.code as location_code,
    u_count.name as last_counted_by_name
    FROM inventory_stock s
    JOIN products p ON s.product_id = p.id
    JOIN locations l ON s.location_id = l.id
    LEFT JOIN users u_count ON s.last_counted_by = u_count.id
    WHERE p.active = 1`
  const binds: any[] = []
  if (locationId) { stockQuery += ' AND s.location_id = ?'; binds.push(parseInt(locationId)) }
  stockQuery += ' ORDER BY p.name ASC'

  const stock = await db.prepare(stockQuery).bind(...binds).all()

  // Summary stats
  const totalProducts = new Set((stock.results || []).map((r: any) => r.product_id)).size
  const totalUnits = (stock.results || []).reduce((sum: number, r: any) => sum + (r.qty_on_hand || 0), 0)
  const totalValue = (stock.results || []).reduce((sum: number, r: any) => sum + ((r.qty_on_hand || 0) * (r.price || 0)), 0)
  const lowStock = (stock.results || []).filter((r: any) => r.reorder_point > 0 && r.qty_on_hand <= r.reorder_point).length
  const onHold = (stock.results || []).reduce((sum: number, r: any) => sum + (r.qty_on_hold || 0), 0)
  const reserved = (stock.results || []).reduce((sum: number, r: any) => sum + (r.qty_reserved || 0), 0)

  // Active transfers
  const transfers = await db.prepare(
    `SELECT COUNT(*) as cnt FROM inventory_transfers WHERE status IN ('pending','in_transit')`
  ).first() as any

  // Recent losses (last 30 days)
  const losses = await db.prepare(
    `SELECT COALESCE(SUM(qty), 0) as total FROM inventory_losses WHERE created_at >= datetime('now', '-30 days')`
  ).first() as any

  // Total incoming (POs not yet fully received)
  let incomingQuery = `SELECT COALESCE(SUM(pi.qty_ordered - pi.qty_received), 0) as total
    FROM po_items pi JOIN purchase_orders po ON pi.po_id = po.id
    WHERE po.status IN ('ordered', 'in_transit', 'delayed', 'partial')
      AND pi.qty_received < pi.qty_ordered AND pi.product_id IS NOT NULL`
  if (locationId) incomingQuery += ` AND po.location_id = ${parseInt(locationId)}`
  const incomingTotal = await db.prepare(incomingQuery).first() as any

  return c.json({
    stock: stock.results || [],
    summary: {
      total_products: totalProducts,
      total_units: totalUnits,
      total_value: Math.round(totalValue * 100) / 100,
      low_stock: lowStock,
      on_hold: onHold,
      reserved: reserved,
      total_incoming: incomingTotal?.total || 0,
      active_transfers: transfers?.cnt || 0,
      losses_30d: losses?.total || 0
    }
  })
})

// ==================== STOCK LEVELS ====================

app.get('/api/inventory/stock', async (c) => {
  const db = c.env.DB
  const locationId = c.req.query('location_id')
  const category = c.req.query('category')
  const search = c.req.query('search')
  const lowStockOnly = c.req.query('low_stock') === '1'
  const sort = c.req.query('sort') // name, category, sku, qty, last_counted

  let query = `SELECT s.*, p.name as product_name, p.sku, p.category, p.subcategory, p.unit_type, p.price, p.cost, p.weight_per_unit, p.pallet_qty,
    p.primary_vendor_id, sv.name as primary_vendor_name,
    l.name as location_name, l.code as location_code,
    u_count.name as last_counted_by_name
    FROM inventory_stock s
    JOIN products p ON s.product_id = p.id
    JOIN locations l ON s.location_id = l.id
    LEFT JOIN suppliers sv ON p.primary_vendor_id = sv.id
    LEFT JOIN users u_count ON s.last_counted_by = u_count.id
    WHERE p.active = 1`
  const binds: any[] = []

  if (locationId) { query += ' AND s.location_id = ?'; binds.push(parseInt(locationId)) }
  if (category) { query += ' AND p.category = ?'; binds.push(category) }
  if (search) { query += ' AND (p.name LIKE ? OR p.sku LIKE ?)'; binds.push(`%${search}%`, `%${search}%`) }
  if (lowStockOnly) { query += ' AND s.reorder_point > 0 AND s.qty_on_hand <= s.reorder_point' }

  const orderMap: Record<string, string> = {
    category: 'p.category ASC, p.name ASC',
    sku: 'p.sku ASC',
    qty: 's.qty_on_hand DESC, p.name ASC',
    last_counted: 's.last_counted_at DESC NULLS LAST, p.name ASC'
  }
  query += ' ORDER BY ' + (orderMap[sort || ''] || 'p.name ASC')

  const stock = await db.prepare(query).bind(...binds).all()
  const stockList = stock.results || [] as any[]

  // Enrich with incoming PO quantities — how much is on order but not yet received
  if (stockList.length > 0) {
    const incomingQuery = `SELECT pi.product_id, po.location_id, SUM(pi.qty_ordered - pi.qty_received) as qty_incoming
      FROM po_items pi
      JOIN purchase_orders po ON pi.po_id = po.id
      WHERE po.status IN ('ordered', 'in_transit', 'delayed', 'partial')
        AND pi.qty_received < pi.qty_ordered
        AND pi.product_id IS NOT NULL
      GROUP BY pi.product_id, po.location_id`
    const incomingResult = await db.prepare(incomingQuery).all()
    const incomingMap: Record<string, number> = {}
    for (const row of (incomingResult.results || []) as any[]) {
      incomingMap[row.product_id + '_' + row.location_id] = row.qty_incoming || 0
    }
    for (const s of stockList as any[]) {
      s.qty_incoming = incomingMap[s.product_id + '_' + s.location_id] || 0
    }
  }

  return c.json({ stock: stockList })
})

// Get stock for a single product across all locations
app.get('/api/inventory/stock/:productId', async (c) => {
  const productId = parseInt(c.req.param('productId'))
  const db = c.env.DB
  const stock = await db.prepare(
    `SELECT s.*, l.name as location_name, l.code as location_code
     FROM inventory_stock s JOIN locations l ON s.location_id = l.id
     WHERE s.product_id = ? ORDER BY l.name`
  ).bind(productId).all()

  const batches = await db.prepare(
    `SELECT b.*, l.name as location_name, l.code as location_code, u.name as created_by_name
     FROM inventory_batches b
     JOIN locations l ON b.location_id = l.id
     LEFT JOIN users u ON b.created_by = u.id
     WHERE b.product_id = ? AND b.qty > 0 ORDER BY b.created_at DESC`
  ).bind(productId).all()

  const holds = await db.prepare(
    `SELECT h.*, l.name as location_name FROM inventory_holds h
     JOIN locations l ON h.location_id = l.id
     WHERE h.product_id = ? AND h.released_at IS NULL ORDER BY h.created_at DESC`
  ).bind(productId).all()

  const reservations = await db.prepare(
    `SELECT r.*, l.name as location_name, c.business_name as customer_name, o.order_number
     FROM inventory_reservations r
     JOIN locations l ON r.location_id = l.id
     LEFT JOIN customers c ON r.customer_id = c.id
     LEFT JOIN orders o ON r.order_id = o.id
     WHERE r.product_id = ? AND r.status = 'active' ORDER BY r.created_at DESC`
  ).bind(productId).all()

  // Incoming PO quantities for this product
  const incoming = await db.prepare(`
    SELECT po.id as po_id, po.po_number, po.status as po_status, po.expected_date,
      s.name as supplier_name, l.name as location_name, l.code as location_code,
      pi.qty_ordered, pi.qty_received, (pi.qty_ordered - pi.qty_received) as qty_remaining,
      po.location_id
    FROM po_items pi
    JOIN purchase_orders po ON pi.po_id = po.id
    LEFT JOIN suppliers s ON po.supplier_id = s.id
    JOIN locations l ON po.location_id = l.id
    WHERE pi.product_id = ?
      AND po.status IN ('ordered', 'in_transit', 'delayed', 'partial')
      AND pi.qty_received < pi.qty_ordered
    ORDER BY po.expected_date ASC NULLS LAST
  `).bind(productId).all()

  return c.json({
    stock: stock.results || [],
    batches: batches.results || [],
    holds: holds.results || [],
    reservations: reservations.results || [],
    incoming: incoming.results || []
  })
})

// ==================== STOCK DRILLDOWN — Who's holding this inventory? ====================

app.get('/api/inventory/stock-drilldown/:productId/:locationId', async (c) => {
  const productId = parseInt(c.req.param('productId'))
  const locationId = parseInt(c.req.param('locationId'))
  const db = c.env.DB

  // 1. POS Held Sales — sales on hold that reserved qty_on_hold
  const posHolds = await db.prepare(`
    SELECT ps.id as sale_id, ps.sale_number, ps.status, ps.customer_id, ps.cashier_name,
      ps.created_at, ps.notes,
      psi.quantity, psi.unit_price,
      c.business_name as customer_name
    FROM pos_sale_items psi
    JOIN pos_sales ps ON psi.sale_id = ps.id
    LEFT JOIN customers c ON ps.customer_id = c.id
    WHERE psi.product_id = ? AND psi.location_id = ?
      AND ps.status IN ('hold', 'draft')
    ORDER BY ps.created_at DESC
  `).bind(productId, locationId).all()

  // 2. POS Delivery Orders — completed sales awaiting shipment (hold until loaded)
  const deliveryHolds = await db.prepare(`
    SELECT ps.id as sale_id, ps.sale_number, ps.fulfillment_type, ps.order_id,
      ps.created_at, ps.cashier_name,
      psi.quantity, psi.unit_price,
      c.business_name as customer_name,
      o.order_number, o.status as order_status, o.scheduled_date
    FROM pos_sale_items psi
    JOIN pos_sales ps ON psi.sale_id = ps.id
    LEFT JOIN customers c ON ps.customer_id = c.id
    LEFT JOIN orders o ON ps.order_id = o.id
    WHERE psi.product_id = ? AND psi.location_id = ?
      AND ps.status = 'completed'
      AND ps.fulfillment_type IN ('delivery', 'dc_pickup')
      AND (o.id IS NULL OR o.status IN ('new', 'confirmed', 'scheduled'))
    ORDER BY ps.created_at DESC
  `).bind(productId, locationId).all()

  // 3. Manual logistics orders — orders not linked to POS that are pending shipment
  //    These contribute to holds for orders originating from location
  const manualOrderHolds = await db.prepare(`
    SELECT o.id as order_id, o.order_number, o.status as order_status, o.scheduled_date,
      o.created_at, o.source,
      oi.quantity,
      c.business_name as customer_name
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN customers c ON o.customer_id = c.id
    LEFT JOIN pos_sales ps ON ps.order_id = o.id
    WHERE oi.product_id = ?
      AND o.status IN ('new', 'confirmed', 'scheduled')
      AND ps.id IS NULL
    ORDER BY o.scheduled_date ASC, o.created_at DESC
  `).bind(productId).all()

  // 4. Manual inventory holds from inventory_holds table
  const manualHolds = await db.prepare(`
    SELECT h.*, l.name as location_name, u.name as created_by_name
    FROM inventory_holds h
    JOIN locations l ON h.location_id = l.id
    LEFT JOIN users u ON h.created_by = u.id
    WHERE h.product_id = ? AND h.location_id = ? AND h.released_at IS NULL
    ORDER BY h.created_at DESC
  `).bind(productId, locationId).all()

  // 5. Active reservations from inventory_reservations table
  const reservations = await db.prepare(`
    SELECT r.*, l.name as location_name, c.business_name as customer_name, o.order_number,
      u.name as created_by_name
    FROM inventory_reservations r
    JOIN locations l ON r.location_id = l.id
    LEFT JOIN customers c ON r.customer_id = c.id
    LEFT JOIN orders o ON r.order_id = o.id
    LEFT JOIN users u ON r.created_by = u.id
    WHERE r.product_id = ? AND r.location_id = ? AND r.status = 'active'
    ORDER BY r.created_at DESC
  `).bind(productId, locationId).all()

  // 6. Recent inventory audit trail for this product+location
  const recentAudit = await db.prepare(`
    SELECT action, qty_change, reason, reference_type, reference_id, notes, user_name, created_at
    FROM inventory_audit
    WHERE product_id = ? AND location_id = ?
    ORDER BY created_at DESC LIMIT 10
  `).bind(productId, locationId).all()

  return c.json({
    pos_holds: posHolds.results || [],
    delivery_holds: deliveryHolds.results || [],
    manual_order_holds: manualOrderHolds.results || [],
    manual_holds: manualHolds.results || [],
    reservations: reservations.results || [],
    recent_audit: recentAudit.results || []
  })
})

// ==================== INCOMING — Purchase Orders not yet received ====================

app.get('/api/inventory/incoming/:productId', async (c) => {
  const productId = parseInt(c.req.param('productId'))
  const locationId = c.req.query('location_id')
  const db = c.env.DB

  let q = `SELECT po.id as po_id, po.po_number, po.order_type, po.status as po_status,
    po.expected_date, po.order_date, po.notes as po_notes,
    s.name as supplier_name,
    l.name as location_name, l.code as location_code,
    pi.id as item_id, pi.description, pi.qty_ordered, pi.qty_received, pi.unit,
    (pi.qty_ordered - pi.qty_received) as qty_remaining
    FROM po_items pi
    JOIN purchase_orders po ON pi.po_id = po.id
    LEFT JOIN suppliers s ON po.supplier_id = s.id
    JOIN locations l ON po.location_id = l.id
    WHERE pi.product_id = ?
      AND po.status IN ('ordered', 'in_transit', 'delayed', 'partial')
      AND pi.qty_received < pi.qty_ordered`
  const binds: any[] = [productId]
  if (locationId) { q += ' AND po.location_id = ?'; binds.push(parseInt(locationId)) }
  q += ' ORDER BY po.expected_date ASC NULLS LAST, po.order_date ASC'

  const result = await db.prepare(q).bind(...binds).all()

  // Summarize totals
  const items = result.results || []
  const totalIncoming = items.reduce((sum: number, i: any) => sum + (i.qty_remaining || 0), 0)

  return c.json({
    incoming: items,
    total_incoming: totalIncoming
  })
})

// ==================== COUNT / ADJUST INVENTORY ====================

app.post('/api/inventory/count', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const { product_id, location_id, new_qty, notes } = await c.req.json()

  const userInfo = await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any
  const stock = await getOrCreateStock(db, product_id, location_id)
  const oldQty = stock.qty_on_hand

  await db.prepare('UPDATE inventory_stock SET qty_on_hand = ?, last_counted_at = datetime("now"), last_counted_by = ?, updated_at = datetime("now") WHERE product_id = ? AND location_id = ?')
    .bind(new_qty, user.id, product_id, location_id).run()

  await auditLog(db, {
    product_id, location_id, action: 'count',
    qty_change: new_qty - oldQty, qty_before: oldQty, qty_after: new_qty,
    reason: 'Physical count', notes: notes || null,
    user_id: user.id, user_name: userInfo?.name || user.email
  })

  return c.json({ success: true, qty_before: oldQty, qty_after: new_qty })
})

// Quick adjust (add/remove)
app.post('/api/inventory/adjust', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const { product_id, location_id, qty_change, reason, notes } = await c.req.json()

  const userInfo = await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any
  const stock = await getOrCreateStock(db, product_id, location_id)
  const oldQty = stock.qty_on_hand
  const newQty = oldQty + qty_change

  if (newQty < 0) return c.json({ error: 'Insufficient stock' }, 400)

  await db.prepare('UPDATE inventory_stock SET qty_on_hand = ?, updated_at = datetime("now") WHERE product_id = ? AND location_id = ?')
    .bind(newQty, product_id, location_id).run()

  await auditLog(db, {
    product_id, location_id, action: 'adjust',
    qty_change, qty_before: oldQty, qty_after: newQty,
    reason: reason || 'Manual adjustment', notes: notes || null,
    user_id: user.id, user_name: userInfo?.name || user.email
  })

  return c.json({ success: true, qty_before: oldQty, qty_after: newQty })
})

// Bulk count — update multiple products at once (mobile-friendly)
app.post('/api/inventory/bulk-count', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const { location_id, counts } = await c.req.json() as { location_id: number, counts: { product_id: number, new_qty: number, notes?: string }[] }

  const userInfo = await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any
  let updated = 0

  for (const item of counts) {
    const stock = await getOrCreateStock(db, item.product_id, location_id)
    const oldQty = stock.qty_on_hand
    if (oldQty === item.new_qty) continue // Skip unchanged

    await db.prepare('UPDATE inventory_stock SET qty_on_hand = ?, last_counted_at = datetime("now"), last_counted_by = ?, updated_at = datetime("now") WHERE product_id = ? AND location_id = ?')
      .bind(item.new_qty, user.id, item.product_id, location_id).run()

    await auditLog(db, {
      product_id: item.product_id, location_id, action: 'count',
      qty_change: item.new_qty - oldQty, qty_before: oldQty, qty_after: item.new_qty,
      reason: 'Bulk count', notes: item.notes || null,
      user_id: user.id, user_name: userInfo?.name || user.email
    })
    updated++
  }

  return c.json({ success: true, updated })
})

// Set reorder points
app.put('/api/inventory/stock/:productId/reorder', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const productId = parseInt(c.req.param('productId'))
  const { location_id, reorder_point, reorder_qty } = await c.req.json()

  await getOrCreateStock(db, productId, location_id)
  await db.prepare('UPDATE inventory_stock SET reorder_point = ?, reorder_qty = ?, updated_at = datetime("now") WHERE product_id = ? AND location_id = ?')
    .bind(reorder_point || 0, reorder_qty || 0, productId, location_id).run()

  return c.json({ success: true })
})

// ==================== TRANSFERS ====================

app.get('/api/inventory/transfers', async (c) => {
  const db = c.env.DB
  const status = c.req.query('status')

  let query = `SELECT t.*, fl.name as from_location_name, fl.code as from_code,
    tl.name as to_location_name, tl.code as to_code,
    cu.name as created_by_name, su.name as shipped_by_name, ru.name as received_by_name,
    (SELECT COUNT(*) FROM inventory_transfer_items WHERE transfer_id = t.id) as item_count,
    (SELECT COALESCE(SUM(qty_requested), 0) FROM inventory_transfer_items WHERE transfer_id = t.id) as total_qty
    FROM inventory_transfers t
    JOIN locations fl ON t.from_location_id = fl.id
    JOIN locations tl ON t.to_location_id = tl.id
    LEFT JOIN users cu ON t.created_by = cu.id
    LEFT JOIN users su ON t.shipped_by = su.id
    LEFT JOIN users ru ON t.received_by = ru.id`
  const binds: any[] = []
  if (status) { query += ' WHERE t.status = ?'; binds.push(status) }
  query += ' ORDER BY t.created_at DESC LIMIT 100'

  const transfers = await db.prepare(query).bind(...binds).all()
  return c.json({ transfers: transfers.results || [] })
})

app.get('/api/inventory/transfers/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const db = c.env.DB

  const transfer = await db.prepare(
    `SELECT t.*, fl.name as from_location_name, fl.code as from_code,
     tl.name as to_location_name, tl.code as to_code,
     cu.name as created_by_name, su.name as shipped_by_name, ru.name as received_by_name
     FROM inventory_transfers t
     JOIN locations fl ON t.from_location_id = fl.id
     JOIN locations tl ON t.to_location_id = tl.id
     LEFT JOIN users cu ON t.created_by = cu.id
     LEFT JOIN users su ON t.shipped_by = su.id
     LEFT JOIN users ru ON t.received_by = ru.id
     WHERE t.id = ?`
  ).bind(id).first()
  if (!transfer) return c.json({ error: 'Transfer not found' }, 404)

  const items = await db.prepare(
    `SELECT ti.*, p.name as product_name, p.sku, p.unit_type, p.category
     FROM inventory_transfer_items ti
     JOIN products p ON ti.product_id = p.id
     WHERE ti.transfer_id = ? ORDER BY p.name`
  ).bind(id).all()

  return c.json({ transfer, items: items.results || [] })
})

app.post('/api/inventory/transfers', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const { from_location_id, to_location_id, items, notes } = await c.req.json()

  if (from_location_id === to_location_id) return c.json({ error: 'Cannot transfer to same location' }, 400)
  if (!items?.length) return c.json({ error: 'No items to transfer' }, 400)

  const transferNumber = generateTransferNumber()

  const result = await db.prepare(
    `INSERT INTO inventory_transfers (transfer_number, from_location_id, to_location_id, status, notes, created_by)
     VALUES (?, ?, ?, 'pending', ?, ?)`
  ).bind(transferNumber, from_location_id, to_location_id, notes || null, user.id).run()
  const transferId = result.meta.last_row_id

  for (const item of items) {
    await db.prepare(
      `INSERT INTO inventory_transfer_items (transfer_id, product_id, qty_requested, batch_id) VALUES (?, ?, ?, ?)`
    ).bind(transferId, item.product_id, item.qty, item.batch_id || null).run()
  }

  return c.json({ success: true, id: transferId, transfer_number: transferNumber })
})

// Ship a transfer — deducts from source location, puts on hold
app.post('/api/inventory/transfers/:id/ship', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))

  const transfer = await db.prepare('SELECT * FROM inventory_transfers WHERE id = ?').bind(id).first() as any
  if (!transfer) return c.json({ error: 'Transfer not found' }, 404)
  if (transfer.status !== 'pending') return c.json({ error: 'Transfer already shipped' }, 400)

  const items = await db.prepare('SELECT * FROM inventory_transfer_items WHERE transfer_id = ?').bind(id).all()
  const userInfo = await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any

  for (const item of (items.results || []) as any[]) {
    const stock = await getOrCreateStock(db, item.product_id, transfer.from_location_id)
    const oldQty = stock.qty_on_hand
    const newQty = oldQty - item.qty_requested
    if (newQty < 0) return c.json({ error: `Insufficient stock for product ${item.product_id}` }, 400)

    await db.prepare('UPDATE inventory_stock SET qty_on_hand = ?, updated_at = datetime("now") WHERE product_id = ? AND location_id = ?')
      .bind(newQty, item.product_id, transfer.from_location_id).run()

    await db.prepare('UPDATE inventory_transfer_items SET qty_shipped = ? WHERE id = ?')
      .bind(item.qty_requested, item.id).run()

    await auditLog(db, {
      product_id: item.product_id, location_id: transfer.from_location_id,
      action: 'transfer_out', qty_change: -item.qty_requested,
      qty_before: oldQty, qty_after: newQty,
      reason: 'Transfer shipped', reference_type: 'transfer', reference_id: id,
      user_id: user.id, user_name: userInfo?.name || user.email
    })
  }

  await db.prepare('UPDATE inventory_transfers SET status = "in_transit", shipped_by = ?, shipped_at = datetime("now") WHERE id = ?')
    .bind(user.id, id).run()

  return c.json({ success: true })
})

// Receive a transfer — adds to destination location
app.post('/api/inventory/transfers/:id/receive', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const receivedItems = body.items || [] // optional: [{id, qty_received}]

  const transfer = await db.prepare('SELECT * FROM inventory_transfers WHERE id = ?').bind(id).first() as any
  if (!transfer) return c.json({ error: 'Transfer not found' }, 404)
  if (transfer.status !== 'in_transit') return c.json({ error: 'Transfer not in transit' }, 400)

  const items = await db.prepare('SELECT * FROM inventory_transfer_items WHERE transfer_id = ?').bind(id).all()
  const userInfo = await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any

  for (const item of (items.results || []) as any[]) {
    // Check if custom received qty was provided
    const customItem = receivedItems.find((ri: any) => ri.id === item.id)
    const qtyReceived = customItem ? customItem.qty_received : item.qty_shipped

    const stock = await getOrCreateStock(db, item.product_id, transfer.to_location_id)
    const oldQty = stock.qty_on_hand
    const newQty = oldQty + qtyReceived

    await db.prepare('UPDATE inventory_stock SET qty_on_hand = ?, updated_at = datetime("now") WHERE product_id = ? AND location_id = ?')
      .bind(newQty, item.product_id, transfer.to_location_id).run()

    await db.prepare('UPDATE inventory_transfer_items SET qty_received = ? WHERE id = ?')
      .bind(qtyReceived, item.id).run()

    await auditLog(db, {
      product_id: item.product_id, location_id: transfer.to_location_id,
      action: 'transfer_in', qty_change: qtyReceived,
      qty_before: oldQty, qty_after: newQty,
      reason: 'Transfer received', reference_type: 'transfer', reference_id: id,
      user_id: user.id, user_name: userInfo?.name || user.email
    })

    // Log discrepancy if received != shipped
    if (qtyReceived < item.qty_shipped) {
      const diff = item.qty_shipped - qtyReceived
      await auditLog(db, {
        product_id: item.product_id, location_id: transfer.to_location_id,
        action: 'transfer_discrepancy', qty_change: -diff,
        reason: `Shipped ${item.qty_shipped} but received ${qtyReceived}`,
        reference_type: 'transfer', reference_id: id,
        user_id: user.id, user_name: userInfo?.name || user.email
      })
    }
  }

  await db.prepare('UPDATE inventory_transfers SET status = "received", received_by = ?, received_at = datetime("now") WHERE id = ?')
    .bind(user.id, id).run()

  // Check if this transfer was linked to a POS inventory request with a tagged customer
  const linkedPIR = await db.prepare(
    `SELECT * FROM pos_inventory_requests WHERE transfer_id = ? AND notify_customer = 1 AND customer_id IS NOT NULL`
  ).bind(id).first() as any

  if (linkedPIR) {
    // Update the POS request status to fulfilled
    await db.prepare(
      `UPDATE pos_inventory_requests SET status = 'fulfilled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(linkedPIR.id).run()

    // Create notification for the user who requested it
    if (linkedPIR.requested_by) {
      await db.prepare(
        `INSERT INTO notifications (user_id, title, message, notification_type, ref_type, ref_id)
         VALUES (?, ?, ?, 'inventory', 'transfer', ?)`
      ).bind(linkedPIR.requested_by,
        'Transfer Received — Notify Customer',
        'Transfer for ' + (linkedPIR.customer_name || 'customer') + ' has arrived at ' + (transfer as any).to_location_name + '. Please contact them to let them know their product is ready.',
        id).run()
    }

    // Also complete any tasks linked to this POS request
    await db.prepare(
      `UPDATE tasks SET status = 'completed', completed_at = CURRENT_TIMESTAMP, notes = COALESCE(notes, '') || ' | Auto-completed: transfer received'
       WHERE ref_type = 'pos_request' AND ref_id = ? AND status != 'completed'`
    ).bind(linkedPIR.id).run()
  }

  return c.json({ success: true })
})

// Cancel a transfer
app.post('/api/inventory/transfers/:id/cancel', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))

  const transfer = await db.prepare('SELECT * FROM inventory_transfers WHERE id = ?').bind(id).first() as any
  if (!transfer) return c.json({ error: 'Transfer not found' }, 404)
  if (transfer.status === 'received' || transfer.status === 'cancelled') {
    return c.json({ error: 'Transfer already ' + transfer.status + ' — cannot cancel' }, 400)
  }

  const userInfo = await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any

  // If in_transit, return stock to source
  if (transfer.status === 'in_transit') {
    const items = await db.prepare('SELECT * FROM inventory_transfer_items WHERE transfer_id = ?').bind(id).all()
    for (const item of (items.results || []) as any[]) {
      const stock = await getOrCreateStock(db, item.product_id, transfer.from_location_id)
      const oldQty = stock.qty_on_hand
      const newQty = oldQty + (item as any).qty_shipped

      await db.prepare('UPDATE inventory_stock SET qty_on_hand = ?, updated_at = datetime("now") WHERE product_id = ? AND location_id = ?')
        .bind(newQty, item.product_id, transfer.from_location_id).run()

      await auditLog(db, {
        product_id: item.product_id, location_id: transfer.from_location_id,
        action: 'transfer_cancelled', qty_change: (item as any).qty_shipped,
        qty_before: oldQty, qty_after: newQty,
        reason: 'Transfer cancelled — stock returned', reference_type: 'transfer', reference_id: id,
        user_id: user.id, user_name: userInfo?.name || user.email
      })
    }
  }

  await db.prepare('UPDATE inventory_transfers SET status = "cancelled" WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ==================== BATCHES ====================

app.get('/api/inventory/batches', async (c) => {
  const db = c.env.DB
  const productId = c.req.query('product_id')
  const locationId = c.req.query('location_id')
  const search = c.req.query('search')
  const condition = c.req.query('condition')

  let query = `SELECT b.*, p.name as product_name, p.sku, p.unit_type,
    l.name as location_name, l.code as location_code, u.name as created_by_name
    FROM inventory_batches b
    JOIN products p ON b.product_id = p.id
    JOIN locations l ON b.location_id = l.id
    LEFT JOIN users u ON b.created_by = u.id WHERE b.qty > 0`
  const binds: any[] = []
  if (productId) { query += ' AND b.product_id = ?'; binds.push(parseInt(productId)) }
  if (locationId) { query += ' AND b.location_id = ?'; binds.push(parseInt(locationId)) }
  if (search) { query += ' AND (p.name LIKE ? OR p.sku LIKE ? OR b.batch_number LIKE ? OR b.notes LIKE ?)'; binds.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`) }
  if (condition) { query += ' AND b.condition = ?'; binds.push(condition) }
  query += ' ORDER BY b.created_at DESC'

  const batches = await db.prepare(query).bind(...binds).all()
  return c.json({ batches: batches.results || [] })
})

app.post('/api/inventory/batches', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const { product_id, location_id, qty, condition, notes, source, batch_number } = await c.req.json()

  const userInfo = await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any
  const batchNum = batch_number || `B-${Date.now().toString(36).toUpperCase()}`

  const result = await db.prepare(
    `INSERT INTO inventory_batches (product_id, location_id, batch_number, qty, condition, notes, source, received_date, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, date('now'), ?)`
  ).bind(product_id, location_id, batchNum, qty, condition || 'good', notes || null, source || null, user.id).run()

  const batchId = result.meta.last_row_id as number

  // Update inventory stock — batch qty adds to on-hand inventory
  const stock = await getOrCreateStock(db, product_id, location_id)
  const oldQty = stock.qty_on_hand || 0
  const newQty = oldQty + qty
  await db.prepare('UPDATE inventory_stock SET qty_on_hand = ?, updated_at = datetime("now") WHERE product_id = ? AND location_id = ?')
    .bind(newQty, product_id, location_id).run()

  await auditLog(db, {
    product_id, location_id, action: 'batch_created', qty_change: qty,
    qty_before: oldQty, qty_after: newQty,
    reason: `Batch ${batchNum} created (${condition || 'good'})`,
    batch_id: batchId,
    notes: notes || null,
    user_id: user.id, user_name: userInfo?.name || user.email
  })

  return c.json({ success: true, id: batchId, batch_number: batchNum })
})

// Split a batch (break up damaged hay etc.)
app.post('/api/inventory/batches/:id/split', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const { qty, condition, notes } = await c.req.json()

  const batch = await db.prepare('SELECT * FROM inventory_batches WHERE id = ?').bind(id).first() as any
  if (!batch) return c.json({ error: 'Batch not found' }, 404)
  if (qty > batch.qty) return c.json({ error: 'Split qty exceeds batch qty' }, 400)

  const userInfo = await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any
  const newBatchNum = `${batch.batch_number}-S${Date.now().toString(36).slice(-3).toUpperCase()}`

  // Reduce original batch
  await db.prepare('UPDATE inventory_batches SET qty = qty - ?, updated_at = datetime("now") WHERE id = ?')
    .bind(qty, id).run()

  // Create new split batch
  const result = await db.prepare(
    `INSERT INTO inventory_batches (product_id, location_id, batch_number, qty, condition, notes, source, received_date, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(batch.product_id, batch.location_id, newBatchNum, qty, condition, notes || null, `Split from ${batch.batch_number}`, batch.received_date, user.id).run()

  await auditLog(db, {
    product_id: batch.product_id, location_id: batch.location_id,
    action: 'batch_split', qty_change: 0,
    reason: `Split ${qty} from ${batch.batch_number} → ${newBatchNum} (${condition})`,
    batch_id: result.meta.last_row_id as number,
    notes: notes || null,
    user_id: user.id, user_name: userInfo?.name || user.email
  })

  return c.json({ success: true, new_batch_id: result.meta.last_row_id, batch_number: newBatchNum })
})

// Update batch notes/condition
app.put('/api/inventory/batches/:id', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const { condition, notes, qty } = await c.req.json()

  const batch = await db.prepare('SELECT * FROM inventory_batches WHERE id = ?').bind(id).first() as any
  if (!batch) return c.json({ error: 'Batch not found' }, 404)

  const userInfo = await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any

  await db.prepare('UPDATE inventory_batches SET condition = COALESCE(?, condition), notes = COALESCE(?, notes), qty = COALESCE(?, qty), updated_at = datetime("now") WHERE id = ?')
    .bind(condition || null, notes || null, qty ?? null, id).run()

  await auditLog(db, {
    product_id: batch.product_id, location_id: batch.location_id,
    action: 'batch_updated', qty_change: qty ? qty - batch.qty : 0,
    reason: `Batch ${batch.batch_number} updated`, batch_id: id,
    notes: notes || null,
    user_id: user.id, user_name: userInfo?.name || user.email
  })

  return c.json({ success: true })
})

// ==================== HOLDS ====================

app.get('/api/inventory/holds', async (c) => {
  const db = c.env.DB
  const active = c.req.query('active') !== '0'

  let query = `SELECT h.*, p.name as product_name, p.sku, p.unit_type,
    l.name as location_name, u.name as created_by_name
    FROM inventory_holds h
    JOIN products p ON h.product_id = p.id
    JOIN locations l ON h.location_id = l.id
    LEFT JOIN users u ON h.created_by = u.id`
  if (active) query += ' WHERE h.released_at IS NULL'
  query += ' ORDER BY h.created_at DESC'

  const holds = await db.prepare(query).all()
  return c.json({ holds: holds.results || [] })
})

app.post('/api/inventory/holds', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const { product_id, location_id, qty, reason, reference_type, reference_id, notes } = await c.req.json()

  const userInfo = await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any
  const stock = await getOrCreateStock(db, product_id, location_id)

  await db.prepare(
    `INSERT INTO inventory_holds (product_id, location_id, qty, reason, reference_type, reference_id, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(product_id, location_id, qty, reason, reference_type || null, reference_id || null, notes || null, user.id).run()

  // Update qty_on_hold in stock
  await db.prepare('UPDATE inventory_stock SET qty_on_hold = qty_on_hold + ?, updated_at = datetime("now") WHERE product_id = ? AND location_id = ?')
    .bind(qty, product_id, location_id).run()

  await auditLog(db, {
    product_id, location_id, action: 'hold_placed', qty_change: 0,
    reason: `Hold: ${reason}`, reference_type, reference_id,
    notes: notes || null,
    user_id: user.id, user_name: userInfo?.name || user.email
  })

  return c.json({ success: true })
})

// Release a hold
app.post('/api/inventory/holds/:id/release', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))

  const hold = await db.prepare('SELECT * FROM inventory_holds WHERE id = ? AND released_at IS NULL').bind(id).first() as any
  if (!hold) return c.json({ error: 'Hold not found or already released' }, 404)

  const userInfo = await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any

  await db.prepare('UPDATE inventory_holds SET released_at = datetime("now") WHERE id = ?').bind(id).run()
  await db.prepare('UPDATE inventory_stock SET qty_on_hold = MAX(0, qty_on_hold - ?), updated_at = datetime("now") WHERE product_id = ? AND location_id = ?')
    .bind(hold.qty, hold.product_id, hold.location_id).run()

  await auditLog(db, {
    product_id: hold.product_id, location_id: hold.location_id,
    action: 'hold_released', qty_change: 0,
    reason: `Hold released: ${hold.reason}`, reference_type: hold.reference_type, reference_id: hold.reference_id,
    user_id: user.id, user_name: userInfo?.name || user.email
  })

  return c.json({ success: true })
})

// ==================== RESERVATIONS ====================

app.get('/api/inventory/reservations', async (c) => {
  const db = c.env.DB
  const status = c.req.query('status') || 'active'

  const reservations = await db.prepare(
    `SELECT r.*, p.name as product_name, p.sku, p.unit_type,
     l.name as location_name, c.business_name as customer_name, o.order_number,
     u.name as created_by_name
     FROM inventory_reservations r
     JOIN products p ON r.product_id = p.id
     JOIN locations l ON r.location_id = l.id
     LEFT JOIN customers c ON r.customer_id = c.id
     LEFT JOIN orders o ON r.order_id = o.id
     LEFT JOIN users u ON r.created_by = u.id
     WHERE r.status = ?
     ORDER BY r.created_at DESC`
  ).bind(status).all()

  return c.json({ reservations: reservations.results || [] })
})

app.post('/api/inventory/reservations', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const { product_id, location_id, qty, customer_id, order_id, notes } = await c.req.json()

  const userInfo = await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any
  const stock = await getOrCreateStock(db, product_id, location_id)

  await db.prepare(
    `INSERT INTO inventory_reservations (product_id, location_id, qty, customer_id, order_id, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(product_id, location_id, qty, customer_id || null, order_id || null, notes || null, user.id).run()

  // Update qty_reserved in stock
  await db.prepare('UPDATE inventory_stock SET qty_reserved = qty_reserved + ?, updated_at = datetime("now") WHERE product_id = ? AND location_id = ?')
    .bind(qty, product_id, location_id).run()

  await auditLog(db, {
    product_id, location_id, action: 'reserved', qty_change: 0,
    reason: 'Reservation created',
    reference_type: order_id ? 'order' : 'customer',
    reference_id: order_id || customer_id || null,
    notes: notes || null,
    user_id: user.id, user_name: userInfo?.name || user.email
  })

  return c.json({ success: true })
})

// Fulfill or cancel a reservation
app.post('/api/inventory/reservations/:id/:action', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const action = c.req.param('action')

  if (!['fulfill', 'cancel'].includes(action)) return c.json({ error: 'Invalid action' }, 400)

  const res = await db.prepare('SELECT * FROM inventory_reservations WHERE id = ? AND status = "active"').bind(id).first() as any
  if (!res) return c.json({ error: 'Reservation not found or not active' }, 404)

  const userInfo = await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any
  const newStatus = action === 'fulfill' ? 'fulfilled' : 'cancelled'

  await db.prepare(`UPDATE inventory_reservations SET status = ?, fulfilled_at = datetime('now') WHERE id = ?`)
    .bind(newStatus, id).run()

  // Release the reserved qty
  await db.prepare('UPDATE inventory_stock SET qty_reserved = MAX(0, qty_reserved - ?), updated_at = datetime("now") WHERE product_id = ? AND location_id = ?')
    .bind(res.qty, res.product_id, res.location_id).run()

  // If fulfilled, also deduct from on_hand
  if (action === 'fulfill') {
    const stock = await getOrCreateStock(db, res.product_id, res.location_id)
    const oldQty = stock.qty_on_hand
    const newQty = Math.max(0, oldQty - res.qty)
    await db.prepare('UPDATE inventory_stock SET qty_on_hand = ?, updated_at = datetime("now") WHERE product_id = ? AND location_id = ?')
      .bind(newQty, res.product_id, res.location_id).run()

    await auditLog(db, {
      product_id: res.product_id, location_id: res.location_id,
      action: 'reservation_fulfilled', qty_change: -res.qty,
      qty_before: oldQty, qty_after: newQty,
      reason: 'Reservation fulfilled',
      reference_type: res.order_id ? 'order' : 'customer',
      reference_id: res.order_id || res.customer_id || null,
      user_id: user.id, user_name: userInfo?.name || user.email
    })
  } else {
    await auditLog(db, {
      product_id: res.product_id, location_id: res.location_id,
      action: 'reservation_cancelled', qty_change: 0,
      reason: 'Reservation cancelled',
      user_id: user.id, user_name: userInfo?.name || user.email
    })
  }

  return c.json({ success: true })
})

// ==================== LOSSES ====================

app.get('/api/inventory/losses', async (c) => {
  const db = c.env.DB
  const locationId = c.req.query('location_id')

  let query = `SELECT lo.*, p.name as product_name, p.sku, p.unit_type,
    l.name as location_name, l.code as location_code,
    u.name as reported_by_name, a.name as approved_by_name
    FROM inventory_losses lo
    JOIN products p ON lo.product_id = p.id
    JOIN locations l ON lo.location_id = l.id
    LEFT JOIN users u ON lo.reported_by = u.id
    LEFT JOIN users a ON lo.approved_by = a.id`
  const binds: any[] = []
  if (locationId) { query += ' WHERE lo.location_id = ?'; binds.push(parseInt(locationId)) }
  query += ' ORDER BY lo.created_at DESC LIMIT 200'

  const losses = await db.prepare(query).bind(...binds).all()
  return c.json({ losses: losses.results || [] })
})

app.post('/api/inventory/losses', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const { product_id, location_id, qty, reason, notes, batch_id } = await c.req.json()

  const userInfo = await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any
  const stock = await getOrCreateStock(db, product_id, location_id)
  const oldQty = stock.qty_on_hand
  const newQty = Math.max(0, oldQty - qty)

  await db.prepare(
    `INSERT INTO inventory_losses (product_id, location_id, qty, reason, notes, batch_id, reported_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(product_id, location_id, qty, reason, notes || null, batch_id || null, user.id).run()

  // Deduct from stock
  await db.prepare('UPDATE inventory_stock SET qty_on_hand = ?, updated_at = datetime("now") WHERE product_id = ? AND location_id = ?')
    .bind(newQty, product_id, location_id).run()

  // If batch, reduce batch qty too
  if (batch_id) {
    await db.prepare('UPDATE inventory_batches SET qty = MAX(0, qty - ?), updated_at = datetime("now") WHERE id = ?')
      .bind(qty, batch_id).run()
  }

  await auditLog(db, {
    product_id, location_id, action: 'loss', qty_change: -qty,
    qty_before: oldQty, qty_after: newQty,
    reason: `Loss: ${reason}`, batch_id: batch_id || null,
    notes: notes || null,
    user_id: user.id, user_name: userInfo?.name || user.email
  })

  return c.json({ success: true, qty_before: oldQty, qty_after: newQty })
})

// ==================== AUDIT LOG ====================

app.get('/api/inventory/audit', async (c) => {
  const db = c.env.DB
  const productId = c.req.query('product_id')
  const locationId = c.req.query('location_id')
  const action = c.req.query('action')
  const limit = parseInt(c.req.query('limit') || '100')
  const offset = parseInt(c.req.query('offset') || '0')

  let query = `SELECT a.*, p.name as product_name, p.sku, l.name as location_name, l.code as location_code
    FROM inventory_audit a
    JOIN products p ON a.product_id = p.id
    JOIN locations l ON a.location_id = l.id WHERE 1=1`
  const binds: any[] = []

  if (productId) { query += ' AND a.product_id = ?'; binds.push(parseInt(productId)) }
  if (locationId) { query += ' AND a.location_id = ?'; binds.push(parseInt(locationId)) }
  if (action) { query += ' AND a.action = ?'; binds.push(action) }

  const countQuery = query.replace('SELECT a.*, p.name as product_name, p.sku, l.name as location_name, l.code as location_code', 'SELECT COUNT(*) as total')
  const totalResult = await db.prepare(countQuery).bind(...binds).first() as any

  query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?'
  binds.push(limit, offset)

  const audit = await db.prepare(query).bind(...binds).all()
  return c.json({ audit: audit.results || [], total: totalResult?.total || 0, limit, offset })
})

// ==================== LOGISTICS INTEGRATION ====================

// Called when a route is dispatched — puts inventory on hold
app.post('/api/inventory/logistics/dispatch', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const { route_id, location_id } = await c.req.json()

  // Get all order items for stops in this route
  const stops = await db.prepare(
    `SELECT rs.order_id, oi.product_id, oi.quantity
     FROM route_stops rs
     JOIN order_items oi ON rs.order_id = oi.order_id
     WHERE rs.route_id = ? AND rs.status NOT IN ('failed','skipped')`
  ).bind(route_id).all()

  const userInfo = await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any
  const loc = location_id || 2 // Default to Aldi warehouse
  let holdCount = 0

  for (const stop of (stops.results || []) as any[]) {
    const stock = await getOrCreateStock(db, stop.product_id, loc)

    // Place hold
    await db.prepare(
      `INSERT INTO inventory_holds (product_id, location_id, qty, reason, reference_type, reference_id, created_by)
       VALUES (?, ?, ?, 'route', 'route', ?, ?)`
    ).bind(stop.product_id, loc, stop.quantity, route_id, user.id).run()

    await db.prepare('UPDATE inventory_stock SET qty_on_hold = qty_on_hold + ?, updated_at = datetime("now") WHERE product_id = ? AND location_id = ?')
      .bind(stop.quantity, stop.product_id, loc).run()

    await auditLog(db, {
      product_id: stop.product_id, location_id: loc,
      action: 'route_hold', qty_change: 0,
      reason: `Hold for route ${route_id}`, reference_type: 'route', reference_id: route_id,
      user_id: user.id, user_name: userInfo?.name || user.email
    })
    holdCount++
  }

  return c.json({ success: true, holds_placed: holdCount })
})

// Called when a route completes — deducts inventory, releases holds
app.post('/api/inventory/logistics/complete', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const { route_id, location_id } = await c.req.json()

  const loc = location_id || 2
  const userInfo = await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any

  // Get completed stops
  const stops = await db.prepare(
    `SELECT rs.order_id, rs.status, oi.product_id, oi.quantity
     FROM route_stops rs
     JOIN order_items oi ON rs.order_id = oi.order_id
     WHERE rs.route_id = ?`
  ).bind(route_id).all()

  let deducted = 0
  for (const stop of (stops.results || []) as any[]) {
    // Release holds for this route
    const holds = await db.prepare(
      `SELECT id, qty FROM inventory_holds WHERE product_id = ? AND location_id = ? AND reference_type = 'route' AND reference_id = ? AND released_at IS NULL`
    ).bind(stop.product_id, loc, route_id).all()

    for (const hold of (holds.results || []) as any[]) {
      await db.prepare('UPDATE inventory_holds SET released_at = datetime("now") WHERE id = ?').bind(hold.id).run()
      await db.prepare('UPDATE inventory_stock SET qty_on_hold = MAX(0, qty_on_hold - ?), updated_at = datetime("now") WHERE product_id = ? AND location_id = ?')
        .bind(hold.qty, stop.product_id, loc).run()
    }

    // Deduct stock for completed deliveries
    if ((stop as any).status === 'completed') {
      const stock = await getOrCreateStock(db, stop.product_id, loc)
      const oldQty = stock.qty_on_hand
      const newQty = Math.max(0, oldQty - (stop as any).quantity)

      await db.prepare('UPDATE inventory_stock SET qty_on_hand = ?, updated_at = datetime("now") WHERE product_id = ? AND location_id = ?')
        .bind(newQty, stop.product_id, loc).run()

      await auditLog(db, {
        product_id: stop.product_id, location_id: loc,
        action: 'route_delivered', qty_change: -(stop as any).quantity,
        qty_before: oldQty, qty_after: newQty,
        reason: `Delivered on route ${route_id}`, reference_type: 'route', reference_id: route_id,
        user_id: user.id, user_name: userInfo?.name || user.email
      })
      deducted++
    }
  }

  return c.json({ success: true, items_deducted: deducted })
})

// ==================== INIT STOCK (bulk seed from products table) ====================

app.post('/api/inventory/init-stock', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const { location_id } = await c.req.json()

  const products = await db.prepare('SELECT id, stock_quantity FROM products WHERE active = 1').all()
  const userInfo = await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any
  let created = 0

  for (const p of (products.results || []) as any[]) {
    const existing = await db.prepare('SELECT id FROM inventory_stock WHERE product_id = ? AND location_id = ?')
      .bind(p.id, location_id).first()
    if (!existing) {
      await db.prepare('INSERT INTO inventory_stock (product_id, location_id, qty_on_hand) VALUES (?, ?, ?)')
        .bind(p.id, location_id, p.stock_quantity || 0).run()

      if (p.stock_quantity > 0) {
        await auditLog(db, {
          product_id: p.id, location_id, action: 'init',
          qty_change: p.stock_quantity, qty_before: 0, qty_after: p.stock_quantity,
          reason: 'Initial stock import from products table',
          user_id: user.id, user_name: userInfo?.name || user.email
        })
      }
      created++
    }
  }

  return c.json({ success: true, products_initialized: created })
})

// ==================== BATCH IMAGES ====================

// Get images for a batch (metadata only — no image_data blob)
app.get('/api/inventory/batches/:batchId/images', async (c) => {
  const db = c.env.DB
  const batchId = parseInt(c.req.param('batchId'))
  const images = await db.prepare(
    `SELECT id, batch_id, caption, taken_by_name, created_at FROM batch_images WHERE batch_id = ? ORDER BY created_at DESC`
  ).bind(batchId).all()
  return c.json({ images: images.results || [] })
})

// Get a single image with full data
app.get('/api/inventory/batch-images/:imageId', async (c) => {
  const db = c.env.DB
  const imageId = parseInt(c.req.param('imageId'))
  const image = await db.prepare('SELECT * FROM batch_images WHERE id = ?').bind(imageId).first()
  if (!image) return c.json({ error: 'Image not found' }, 404)
  return c.json({ image })
})

// Batch thumbnail map — returns latest image per batch for a list of batch IDs
app.post('/api/inventory/batch-images/thumbnails', async (c) => {
  const db = c.env.DB
  const { batch_ids } = await c.req.json() as { batch_ids: number[] }
  if (!batch_ids?.length) return c.json({ thumbnails: {} })

  const placeholders = batch_ids.map(() => '?').join(',')
  const results = await db.prepare(
    `SELECT bi.batch_id, bi.id, bi.image_data, bi.caption FROM batch_images bi
     INNER JOIN (SELECT batch_id, MAX(id) as max_id FROM batch_images WHERE batch_id IN (${placeholders}) GROUP BY batch_id) latest
     ON bi.id = latest.max_id`
  ).bind(...batch_ids).all()

  const thumbnails: Record<number, { id: number; image_data: string; caption: string | null }> = {}
  for (const r of (results.results || []) as any[]) {
    thumbnails[r.batch_id] = { id: r.id, image_data: r.image_data, caption: r.caption }
  }
  return c.json({ thumbnails })
})

// Upload an image to a batch
app.post('/api/inventory/batches/:batchId/images', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const batchId = parseInt(c.req.param('batchId'))
  const { image_data, caption } = await c.req.json()

  if (!image_data) return c.json({ error: 'image_data required' }, 400)
  if (!image_data.startsWith('data:image/')) return c.json({ error: 'Invalid image format — must be data:image/* URL' }, 400)
  if (image_data.length > 2_800_000) return c.json({ error: 'Image too large — max ~2MB. Compress or reduce resolution.' }, 400)

  // Verify batch exists and get its product/location for audit
  const batch = await db.prepare('SELECT product_id, location_id, batch_number FROM inventory_batches WHERE id = ?').bind(batchId).first() as any
  if (!batch) return c.json({ error: 'Batch not found' }, 404)

  const userInfo = await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any

  const result = await db.prepare(
    `INSERT INTO batch_images (batch_id, image_data, caption, taken_by, taken_by_name) VALUES (?, ?, ?, ?, ?)`
  ).bind(batchId, image_data, caption || null, user.id, userInfo?.name || user.email).run()

  await auditLog(db, {
    product_id: batch.product_id, location_id: batch.location_id, action: 'batch_image_added', qty_change: 0,
    reason: `Photo added to batch ${batch.batch_number}` + (caption ? `: ${caption}` : ''),
    batch_id: batchId, notes: `Image ID: ${result.meta.last_row_id}`,
    user_id: user.id, user_name: userInfo?.name || user.email
  })

  return c.json({ success: true, id: result.meta.last_row_id })
})

// Delete a batch image
app.delete('/api/inventory/batch-images/:imageId', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const imageId = parseInt(c.req.param('imageId'))

  const image = await db.prepare('SELECT bi.batch_id, bi.caption, b.product_id, b.location_id, b.batch_number FROM batch_images bi JOIN inventory_batches b ON bi.batch_id = b.id WHERE bi.id = ?').bind(imageId).first() as any
  if (!image) return c.json({ error: 'Image not found' }, 404)

  const userInfo = await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any

  await db.prepare('DELETE FROM batch_images WHERE id = ?').bind(imageId).run()

  await auditLog(db, {
    product_id: image.product_id, location_id: image.location_id, action: 'batch_image_deleted', qty_change: 0,
    reason: `Photo deleted from batch ${image.batch_number}` + (image.caption ? `: ${image.caption}` : ''),
    batch_id: image.batch_id,
    user_id: user.id, user_name: userInfo?.name || user.email
  })

  return c.json({ success: true })
})

// ==================== PRODUCTS LIST & CRUD ====================

// List products (for dropdowns + inventory table)
app.get('/api/inventory/products', async (c) => {
  const db = c.env.DB
  const search = c.req.query('search')
  const category = c.req.query('category')
  const includeInactive = c.req.query('include_inactive') === '1'
  const limit = parseInt(c.req.query('limit') || '500')
  const offset = parseInt(c.req.query('offset') || '0')

  let query = `SELECT p.id, p.name, p.sku, p.category, p.subcategory, p.unit_type, p.price, p.cost, p.weight_per_unit, p.active, p.tax_rate, p.pallet_qty, p.stock_quantity, p.primary_vendor_id, sv.name as primary_vendor_name
    FROM products p LEFT JOIN suppliers sv ON p.primary_vendor_id = sv.id`
  const conditions: string[] = []
  const binds: any[] = []

  if (!includeInactive) { conditions.push('p.active = 1') }
  if (search) { conditions.push('(p.name LIKE ? OR p.sku LIKE ?)'); binds.push(`%${search}%`, `%${search}%`) }
  if (category) { conditions.push('p.category = ?'); binds.push(category) }

  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ')
  query += ' ORDER BY p.name ASC LIMIT ? OFFSET ?'
  binds.push(limit, offset)

  const products = await db.prepare(query).bind(...binds).all()

  // Get total count for pagination
  let countQuery = 'SELECT COUNT(*) as total FROM products'
  const countBinds: any[] = []
  const countConditions: string[] = []
  if (!includeInactive) { countConditions.push('active = 1') }
  if (search) { countConditions.push('(name LIKE ? OR sku LIKE ?)'); countBinds.push(`%${search}%`, `%${search}%`) }
  if (category) { countConditions.push('category = ?'); countBinds.push(category) }
  if (countConditions.length) countQuery += ' WHERE ' + countConditions.join(' AND ')
  const countResult = await db.prepare(countQuery).bind(...countBinds).first() as any

  return c.json({ products: products.results || [], total: countResult?.total || 0 })
})

// Get all unique categories (for filter dropdowns)
app.get('/api/inventory/products/categories', async (c) => {
  const db = c.env.DB
  const cats = await db.prepare('SELECT DISTINCT category FROM products WHERE active = 1 ORDER BY category ASC').all()
  return c.json({ categories: (cats.results || []).map((r: any) => r.category) })
})

// Preview recategorization — returns all products with suggested new category
// IMPORTANT: This must be registered BEFORE /products/:id to avoid route collision
app.get('/api/inventory/products/recategorize-preview', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB

  // Fetch ALL products (including inactive) in batches
  const allProducts: any[] = []
  let offset = 0
  const batchSize = 500
  while (true) {
    const batch = await db.prepare(
      'SELECT id, name, sku, category, subcategory, active FROM products ORDER BY name ASC LIMIT ? OFFSET ?'
    ).bind(batchSize, offset).all()
    const rows = batch.results || []
    allProducts.push(...rows)
    if (rows.length < batchSize) break
    offset += batchSize
  }

  // Classify each product
  const results = allProducts.map((p: any) => {
    const { category: suggested, subcategory } = classifyProduct(p.name, p.category)
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      current_category: p.category,
      current_subcategory: p.subcategory || null,
      suggested_category: suggested,
      suggested_subcategory: subcategory,
      changed: p.category !== suggested,
      active: p.active
    }
  })

  // Summary stats
  // Collect subcategory counts
  const subCounts: Record<string, number> = {}
  results.forEach(r => {
    const sub = r.suggested_subcategory || 'general'
    subCounts[sub] = (subCounts[sub] || 0) + 1
  })

  const summary = {
    total: results.length,
    changed: results.filter(r => r.changed).length,
    unchanged: results.filter(r => !r.changed).length,
    by_suggested: {
      hay: results.filter(r => r.suggested_category === 'hay').length,
      shavings: results.filter(r => r.suggested_category === 'shavings').length,
      shelf_goods: results.filter(r => r.suggested_category === 'shelf_goods').length
    },
    by_subcategory: subCounts,
    by_current: {} as Record<string, number>
  }
  results.forEach(r => {
    summary.by_current[r.current_category] = (summary.by_current[r.current_category] || 0) + 1
  })

  return c.json({ products: results, summary })
})

// Apply recategorization — bulk update products with optional overrides
app.post('/api/inventory/products/recategorize-apply', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (user.role !== 'admin' && user.role !== 'owner') {
    return c.json({ error: 'Only admins can apply category consolidation' }, 403)
  }
  const db = c.env.DB
  const body = await c.req.json()
  // overrides: { [product_id]: category } — user can override specific products
  const overrides: Record<number, string> = body.overrides || {}
  const validCategories = ['hay', 'shavings', 'shelf_goods']

  // Fetch all products
  const allProducts: any[] = []
  let offset = 0
  const batchSize = 500
  while (true) {
    const batch = await db.prepare(
      'SELECT id, name, category, subcategory FROM products ORDER BY id ASC LIMIT ? OFFSET ?'
    ).bind(batchSize, offset).all()
    const rows = batch.results || []
    allProducts.push(...rows)
    if (rows.length < batchSize) break
    offset += batchSize
  }

  let updated = 0
  let skipped = 0
  const userInfo = await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any

  // Build batch of UPDATE statements for changed products
  const batchStmts: D1PreparedStatement[] = []
  for (const p of allProducts) {
    const overrideCat = overrides[p.id]
    const classified = classifyProduct(p.name, p.category)
    let newCat = overrideCat || classified.category
    let newSub = overrideCat ? null : classified.subcategory  // subcategory from AI only
    if (!validCategories.includes(newCat)) newCat = 'shelf_goods'

    if (newCat !== p.category || (newSub && newSub !== p.subcategory)) {
      batchStmts.push(
        db.prepare('UPDATE products SET category = ?, subcategory = COALESCE(?, subcategory) WHERE id = ?').bind(newCat, newSub ?? null, p.id)
      )
      updated++
    } else {
      skipped++
    }
  }

  // D1 batch limit is ~100 statements per batch call, so chunk them
  const BATCH_CHUNK = 80
  for (let i = 0; i < batchStmts.length; i += BATCH_CHUNK) {
    await db.batch(batchStmts.slice(i, i + BATCH_CHUNK))
  }

  // Log the bulk action in audit
  const anyStock = await db.prepare('SELECT location_id FROM inventory_stock LIMIT 1').first() as any
  if (anyStock) {
    await auditLog(db, {
      product_id: 0, location_id: anyStock.location_id, action: 'category_consolidation', qty_change: 0,
      reason: `Bulk category consolidation: ${updated} products updated, ${skipped} unchanged.`,
      notes: `Overrides applied: ${Object.keys(overrides).length}`,
      user_id: user.id, user_name: userInfo?.name || user.email
    })
  }

  return c.json({ success: true, updated, skipped, total: allProducts.length })
})

// Get single product detail (enriched with vendor info)
app.get('/api/inventory/products/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const product = await db.prepare(
    `SELECT p.*, s.name as primary_vendor_name, s.code as primary_vendor_code
     FROM products p LEFT JOIN suppliers s ON p.primary_vendor_id = s.id WHERE p.id = ?`
  ).bind(id).first() as any
  if (!product) return c.json({ error: 'Product not found' }, 404)

  // Get additional vendors
  const vendors = await db.prepare(
    `SELECT pv.*, s.name as vendor_name, s.code as vendor_code
     FROM product_vendors pv JOIN suppliers s ON pv.supplier_id = s.id
     WHERE pv.product_id = ? ORDER BY pv.is_primary DESC, s.name ASC`
  ).bind(id).all()
  product.vendors = vendors.results || []

  return c.json({ product })
})

// Update product
app.put('/api/inventory/products/:id', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()

  const product = await db.prepare('SELECT * FROM products WHERE id = ?').bind(id).first() as any
  if (!product) return c.json({ error: 'Product not found' }, 404)

  // Fields that can be updated
  const allowedFields = ['name', 'sku', 'category', 'subcategory', 'unit_type', 'price', 'cost', 'weight_per_unit',
    'active', 'tax_rate', 'pallet_qty', 'pallet_weight', 'length_in', 'width_in', 'height_in',
    'stackable', 'max_stack', 'bag_length_in', 'bag_width_in', 'bag_height_in', 'primary_vendor_id']

  const sets: string[] = []
  const vals: any[] = []
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      sets.push(`${field} = ?`)
      vals.push(body[field])
    }
  }

  if (!sets.length) return c.json({ error: 'No fields to update' }, 400)

  vals.push(id)
  await db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run()

  // Log the change in audit
  const userInfo = await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any
  const changes = allowedFields.filter(f => body[f] !== undefined && body[f] !== product[f]).map(f => `${f}: ${product[f]} → ${body[f]}`).join(', ')
  if (changes) {
    // Find any stock entry for this product to get a location_id for audit
    const anyStock = await db.prepare('SELECT location_id FROM inventory_stock WHERE product_id = ? LIMIT 1').bind(id).first() as any
    if (anyStock) {
      await auditLog(db, {
        product_id: id, location_id: anyStock.location_id, action: 'product_updated', qty_change: 0,
        reason: 'Product details updated', notes: changes,
        user_id: user.id, user_name: userInfo?.name || user.email
      })
    }
  }

  const updated = await db.prepare('SELECT * FROM products WHERE id = ?').bind(id).first()
  return c.json({ success: true, product: updated })
})

// Create new product
app.post('/api/inventory/products', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const body = await c.req.json()

  if (!body.name) return c.json({ error: 'Product name is required' }, 400)

  const result = await db.prepare(
    `INSERT INTO products (name, sku, category, subcategory, unit_type, price, cost, weight_per_unit, active, tax_rate, pallet_qty, primary_vendor_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    body.name, body.sku || null, body.category || 'shelf_goods', body.subcategory || null,
    body.unit_type || 'each',
    body.price || 0, body.cost || 0, body.weight_per_unit || 0,
    body.active !== undefined ? body.active : 1, body.tax_rate || 0, body.pallet_qty || 0,
    body.primary_vendor_id || null
  ).run()

  const productId = result.meta.last_row_id as number

  // If primary vendor specified, also add to product_vendors junction
  if (body.primary_vendor_id) {
    await db.prepare(
      `INSERT OR IGNORE INTO product_vendors (product_id, supplier_id, is_primary, cost) VALUES (?, ?, 1, ?)`
    ).bind(productId, body.primary_vendor_id, body.cost || 0).run()
  }

  const product = await db.prepare('SELECT * FROM products WHERE id = ?').bind(productId).first()
  return c.json({ success: true, product })
})

// ==================== PRODUCT VENDORS ====================

// List vendors for a product
app.get('/api/inventory/products/:id/vendors', async (c) => {
  const db = c.env.DB
  const productId = parseInt(c.req.param('id'))
  const vendors = await db.prepare(
    `SELECT pv.*, s.name as vendor_name, s.code as vendor_code, s.phone, s.email
     FROM product_vendors pv JOIN suppliers s ON pv.supplier_id = s.id
     WHERE pv.product_id = ? ORDER BY pv.is_primary DESC, s.name ASC`
  ).bind(productId).all()
  return c.json({ vendors: vendors.results || [] })
})

// Add vendor to product
app.post('/api/inventory/products/:id/vendors', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const productId = parseInt(c.req.param('id'))
  const { supplier_id, is_primary, cost, lead_time_days, notes } = await c.req.json()

  if (!supplier_id) return c.json({ error: 'Supplier is required' }, 400)

  await db.prepare(
    `INSERT INTO product_vendors (product_id, supplier_id, is_primary, cost, lead_time_days, notes)
     VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(product_id, supplier_id) DO UPDATE SET
     is_primary=excluded.is_primary, cost=excluded.cost, lead_time_days=excluded.lead_time_days,
     notes=excluded.notes, updated_at=CURRENT_TIMESTAMP`
  ).bind(productId, supplier_id, is_primary ? 1 : 0, cost || 0, lead_time_days || 0, notes || null).run()

  // If marking as primary, update products.primary_vendor_id and clear other primaries
  if (is_primary) {
    await db.prepare('UPDATE products SET primary_vendor_id = ? WHERE id = ?').bind(supplier_id, productId).run()
    await db.prepare('UPDATE product_vendors SET is_primary = 0 WHERE product_id = ? AND supplier_id != ?').bind(productId, supplier_id).run()
  }

  return c.json({ success: true })
})

// Remove vendor from product
app.delete('/api/inventory/products/:id/vendors/:vendorId', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const productId = parseInt(c.req.param('id'))
  const vendorId = parseInt(c.req.param('vendorId'))

  const pv = await db.prepare('SELECT * FROM product_vendors WHERE id = ?').bind(vendorId).first() as any
  if (pv && pv.is_primary) {
    // Clear primary_vendor_id on product
    await db.prepare('UPDATE products SET primary_vendor_id = NULL WHERE id = ?').bind(productId).run()
  }
  await db.prepare('DELETE FROM product_vendors WHERE id = ?').bind(vendorId).run()
  return c.json({ success: true })
})

// ==================== CATEGORY CONSOLIDATION HELPER ====================

// Classify a product into 3 consolidated categories: hay, shavings, shelf_goods
function classifyProduct(name: string, currentCategory: string): { category: string, subcategory: string } {
  const n = (name || '').toLowerCase()
  const cat = (currentCategory || '').toLowerCase()

  // Helper: all detailed subcategories map to one of 3 main categories
  function result(mainCat: string, sub: string) { return { category: mainCat, subcategory: sub } }

  // === KEYWORD-BASED CLASSIFICATION ===

  // --- HAY ---
  const hayKeywords = ['hay', ' teff', 'teff ', 'alfalfa cube', 'alfalfa pellet', 'timothy', 'orchard grass',
    'bermuda', 'standlee', '3 string', '2 string', '2nd cut', '1st cut', '3rd cut', 'grass hay',
    'coastal', 'bale of', 'compressed hay', 'hay bale', 'straw bale', 'wheat straw', 'forage']
  const hayAccessory = /\b(hay\s*net|haynet|hay\s*bag|hay\s*ring|hay\s*rack|hay\s*hook)\b/.test(n)
    || (n.includes('hay') && /\b(net|feeder|ring|hook|rack|tote|carrier)\b/.test(n))
  if (!hayAccessory) {
    for (const kw of hayKeywords) { if (n.includes(kw)) return result('hay', 'hay') }
  }

  // --- SHAVINGS / BEDDING ---
  const shavingsKeywords = ['shaving', 'bedding', 'shavings', 'pine flake', 'wood pellet bed',
    'stall dry', 'stall-dry', 'stalldry', 'sweet pdz', 'pdz', 'pelleted bedding']
  if (!/\bshaving\s*fork\b/.test(n)) {
    for (const kw of shavingsKeywords) { if (n.includes(kw)) return result('shavings', 'bedding') }
  }

  // === Everything below is shelf_goods with a subcategory ===

  // --- FEED ---
  const feedKeywords = ['feed', 'grain', ' oat', 'oats ', 'beet pulp', ' mash', 'mash ',
    'cavalor', 'buckeye', 'nutrena', 'purina', 'tribute', 'calf-manna', 'sweet feed',
    'pelleted feed', 'complete feed', 'equine senior', 'horse feed', 'ration balancer',
    'mineral block', 'salt block', 'salt lick', 'omolene', 'ultium', 'safechoice',
    'strategy ', 'enrich', 'impact ']
  const feedAccessory = (n.includes('feed') && /\b(scoop|bucket|pan|tub|bin)\b/.test(n))
    || /\b(corner\s*feeder|hook\s*over\s*feeder|hang\s*feeder|greedy\s*feeder|slow\s*feed\s*net)\b/.test(n)
  if (!feedAccessory) {
    for (const kw of feedKeywords) { if (n.includes(kw)) return result('shelf_goods', 'feed') }
  }

  // --- SUPPLEMENT ---
  if (/\b(supplement|electrolyte|probiotic|vitamin|mineral mix|joint|glucosamine|msm|omega|biotin|amino|digest|gut health)\b/.test(n)) return result('shelf_goods', 'supplement')
  if (n.includes('cavalor') && /\b(derma|electroliq|gastro|hepato|oilmega|resist|vitaflora|vitamino|nutri|arti|bronchix)\b/.test(n)) return result('shelf_goods', 'supplement')

  // --- DEWORMER ---
  if (/\b(dewormer|deworm|ivermectin|fenbendazole|panacur|safeguard|anthelmintic|pyrantel|strongid|quest|moxidectin)\b/.test(n)) return result('shelf_goods', 'dewormer')

  // --- FLY CONTROL / INSECT ---
  if (/\b(fly\s*(spray|mask|sheet|trap|repel|control)|insect|bug\s*spray|mosquito|permethrin|pyrethrin)\b/.test(n)) return result('shelf_goods', 'fly_control')

  // --- GROOMING ---
  if (/\b(shampoo|conditioner|brush|comb|mane|tail.*spray|coat.*polish|grooming|curry|shedding|clipper|blade)\b/.test(n)) return result('shelf_goods', 'grooming')

  // --- HOOF CARE ---
  if (/\b(hoof|farrier|hoof.*pick|hoof.*dressing|hoof.*oil|thrush|shoe.*pull|rasp)\b/.test(n)) return result('shelf_goods', 'hoof_care')

  // --- FIRST AID / HEALTH ---
  if (/\b(wound|bandage|wrap|liniment|poultice|antiseptic|iodine|betadine|vetericyn|first\s*aid|bute|phenylbutazone|dmso|vetrx|vet.*spray)\b/.test(n)) return result('shelf_goods', 'first_aid')

  // --- TACK ---
  if (/\b(halter|lead\s*rope|bridle|saddle|girth|bit\s|martingale|breast\s*collar|reins|cinch|pad|noseband|browband)\b/.test(n)) return result('shelf_goods', 'tack')

  // --- BLANKETS ---
  if (/\b(blanket|sheet|turnout|stable\s*sheet|fly\s*sheet|cooler|neck\s*cover)\b/.test(n)) return result('shelf_goods', 'blankets')

  // --- TREATS ---
  if (/\b(treat|cookie|snack|crunchies|fruities|sweeties|apple.*wafer|carrot.*nugget)\b/.test(n)) return result('shelf_goods', 'treats')

  // --- BARN EQUIPMENT ---
  if (/\b(bucket|feeder|water.*trough|muck.*tub|muck.*bucket|stall\s*guard|hay\s*feeder|salt.*holder|waterer|tank.*heater|heated.*bucket)\b/.test(n)) return result('shelf_goods', 'barn_equipment')
  if (hayAccessory || feedAccessory) return result('shelf_goods', 'barn_equipment')

  // --- FENCING ---
  if (/\b(fence|fencing|electric.*tape|t-post|insulator|gate|poly.*rope|charger.*fence)\b/.test(n)) return result('shelf_goods', 'fencing')

  // --- RIDING APPAREL ---
  if (/\b(boot|helmet|glove|breeches|riding.*pant|spur|crop|whip|chap)\b/.test(n)) return result('shelf_goods', 'riding_apparel')

  // --- PET SUPPLIES ---
  if (/\b(dog\s*(food|treat|toy|collar|leash|bed)|cat\s*(food|treat|toy|litter))\b/.test(n)) return result('shelf_goods', 'pet_supplies')

  // --- CLEANING ---
  if (/\b(cleaner|disinfect|sanitize|lime|barn.*fresh|odor|deodor)\b/.test(n)) return result('shelf_goods', 'cleaning')

  // --- POULTRY ---
  if (/\b(chicken|poultry|layer|chick\s*starter|gamebird|game\s*bird|rooster|hen|egg.*carton|coop)\b/.test(n)) return result('shelf_goods', 'poultry')

  // --- FARM SUPPLIES ---
  if (/\b(wheelbarrow|shovel|fork|rake|cart|trailer|tractor|barn|storage|tarp)\b/.test(n)) return result('shelf_goods', 'farm_supplies')
  if (/\bshaving\s*fork\b/.test(n)) return result('shelf_goods', 'farm_supplies')

  // --- TOOLS ---
  if (/\b(tool|knife|plier|wire.*cutter|bolt.*cutter|wrench|screwdriver)\b/.test(n)) return result('shelf_goods', 'tools')

  // --- GIFT ---
  if (/\b(gift\s*card|gift\s*certificate|gift\s*basket)\b/.test(n)) return result('shelf_goods', 'gift')

  // --- DEFAULT ---
  return result('shelf_goods', 'general')
}

// ==================== INVENTORY SNAPSHOTS ====================

// Core snapshot function — captures current inventory state for a given date
async function takeSnapshot(db: D1Database, snapshotDate: string): Promise<{ inserted: number; skipped: boolean }> {
  // Check if snapshot already exists for this date
  const existing = await db.prepare(
    'SELECT COUNT(*) as cnt FROM inventory_snapshots WHERE snapshot_date = ?'
  ).bind(snapshotDate).first<any>()

  if (existing?.cnt > 0) return { inserted: 0, skipped: true }

  // Insert snapshot rows for all active products with stock
  const result = await db.prepare(`
    INSERT OR IGNORE INTO inventory_snapshots (snapshot_date, product_id, location_id, product_name, category, qty_on_hand, qty_on_hold, qty_reserved, qty_available, unit_cost, total_value)
    SELECT ?, s.product_id, s.location_id, p.name, p.category,
           s.qty_on_hand, s.qty_on_hold, s.qty_reserved, s.qty_available,
           COALESCE(p.cost, 0),
           s.qty_on_hand * COALESCE(p.cost, 0)
    FROM inventory_stock s
    JOIN products p ON p.id = s.product_id
    WHERE p.active = 1
  `).bind(snapshotDate).run()

  return { inserted: result.meta?.changes || 0, skipped: false }
}

// POST /api/inventory/snapshot — Take a snapshot now (cron or manual)
// Auth: either CRON_SECRET header or normal user auth
app.post('/api/inventory/snapshot', async (c) => {
  const db = c.env.DB

  // Check auth — accept cron secret OR normal user token
  const cronSecret = c.req.header('X-Cron-Secret')
  const cronSecretEnv = c.env.CRON_SECRET || 'bf-ops-cron-default-2024'
  let triggeredBy = 'cron'

  if (cronSecret && cronSecret === cronSecretEnv) {
    triggeredBy = 'cron'
  } else {
    const user = getUserFromHeader(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)
    triggeredBy = user.name || user.email || `user:${user.id}`
  }

  // Use today's date (snapshot captures "end of day" state)
  const today = new Date().toISOString().slice(0, 10)

  // Allow override via body for backfilling
  let body: any = {}
  try { body = await c.req.json() } catch {}
  const snapshotDate = body.date || today

  const { inserted, skipped } = await takeSnapshot(db, snapshotDate)

  if (skipped) {
    return c.json({ success: true, message: `Snapshot for ${snapshotDate} already exists`, date: snapshotDate, skipped: true })
  }

  return c.json({
    success: true,
    message: `Snapshot taken for ${snapshotDate}`,
    date: snapshotDate,
    items_captured: inserted,
    triggered_by: triggeredBy
  })
})

// GET /api/inventory/snapshots — List all snapshot dates with summary
app.get('/api/inventory/snapshots', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  const limit = parseInt(c.req.query('limit') || '90')
  const offset = parseInt(c.req.query('offset') || '0')

  const snapshots = await db.prepare(`
    SELECT snapshot_date,
           COUNT(DISTINCT product_id) as product_count,
           COUNT(DISTINCT location_id) as location_count,
           SUM(qty_on_hand) as total_qty,
           SUM(total_value) as total_value,
           MIN(created_at) as created_at
    FROM inventory_snapshots
    GROUP BY snapshot_date
    ORDER BY snapshot_date DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all()

  const totalDays = await db.prepare(
    'SELECT COUNT(DISTINCT snapshot_date) as cnt FROM inventory_snapshots'
  ).first<any>()

  return c.json({
    snapshots: snapshots.results || [],
    total: totalDays?.cnt || 0
  })
})

// GET /api/inventory/snapshots/:date — Get snapshot detail for a specific date
app.get('/api/inventory/snapshots/:date', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  const date = c.req.param('date')
  const locationId = c.req.query('location_id') || null
  const category = c.req.query('category') || null
  const search = c.req.query('search') || null

  let query = `
    SELECT s.*, l.name as location_name
    FROM inventory_snapshots s
    LEFT JOIN locations l ON l.id = s.location_id
    WHERE s.snapshot_date = ?
  `
  const params: any[] = [date]

  if (locationId) { query += ' AND s.location_id = ?'; params.push(parseInt(locationId)) }
  if (category) { query += ' AND s.category = ?'; params.push(category) }
  if (search) { query += ' AND s.product_name LIKE ?'; params.push(`%${search}%`) }

  query += ' ORDER BY s.product_name'

  const items = await db.prepare(query).bind(...params).all()

  // Build summary
  const totalQty = (items.results as any[]).reduce((s, r) => s + (r.qty_on_hand || 0), 0)
  const totalValue = (items.results as any[]).reduce((s, r) => s + (r.total_value || 0), 0)
  const byCategory: Record<string, any> = {}
  for (const r of items.results as any[]) {
    const cat = r.category || 'uncategorized'
    if (!byCategory[cat]) byCategory[cat] = { category: cat, qty: 0, value: 0, products: 0 }
    byCategory[cat].qty += r.qty_on_hand || 0
    byCategory[cat].value += r.total_value || 0
    byCategory[cat].products++
  }

  return c.json({
    date,
    summary: { totalItems: items.results.length, totalQty, totalValue },
    byCategory: Object.values(byCategory),
    items: items.results
  })
})

// GET /api/inventory/snapshots/compare — Compare two snapshot dates
app.get('/api/inventory/snapshot-compare', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  const dateA = c.req.query('from')
  const dateB = c.req.query('to')
  if (!dateA || !dateB) return c.json({ error: 'Both from and to dates are required' }, 400)

  const locationId = c.req.query('location_id') || null

  // Get both snapshots aggregated by product
  let baseQuery = `
    SELECT product_id, product_name, category,
           SUM(qty_on_hand) as qty_on_hand,
           SUM(total_value) as total_value
    FROM inventory_snapshots
    WHERE snapshot_date = ?
  `
  const paramsA: any[] = [dateA]
  const paramsB: any[] = [dateB]

  if (locationId) {
    baseQuery += ' AND location_id = ?'
    paramsA.push(parseInt(locationId))
    paramsB.push(parseInt(locationId))
  }
  baseQuery += ' GROUP BY product_id'

  const [snapA, snapB] = await Promise.all([
    db.prepare(baseQuery).bind(...paramsA).all(),
    db.prepare(baseQuery).bind(...paramsB).all()
  ])

  const mapA: Record<number, any> = {}
  for (const r of (snapA.results || []) as any[]) mapA[r.product_id] = r
  const mapB: Record<number, any> = {}
  for (const r of (snapB.results || []) as any[]) mapB[r.product_id] = r

  const allIds = new Set([...Object.keys(mapA).map(Number), ...Object.keys(mapB).map(Number)])
  const changes: any[] = []

  for (const pid of allIds) {
    const a = mapA[pid]
    const b = mapB[pid]
    const qtyA = a?.qty_on_hand || 0
    const qtyB = b?.qty_on_hand || 0
    const diff = qtyB - qtyA
    if (diff !== 0) {
      changes.push({
        product_id: pid,
        product_name: b?.product_name || a?.product_name,
        category: b?.category || a?.category,
        qty_from: qtyA,
        qty_to: qtyB,
        qty_change: diff,
        value_from: a?.total_value || 0,
        value_to: b?.total_value || 0,
        value_change: (b?.total_value || 0) - (a?.total_value || 0)
      })
    }
  }

  changes.sort((a, b) => Math.abs(b.qty_change) - Math.abs(a.qty_change))

  const totalQtyFrom = (snapA.results as any[]).reduce((s, r) => s + (r.qty_on_hand || 0), 0)
  const totalQtyTo = (snapB.results as any[]).reduce((s, r) => s + (r.qty_on_hand || 0), 0)
  const totalValueFrom = (snapA.results as any[]).reduce((s, r) => s + (r.total_value || 0), 0)
  const totalValueTo = (snapB.results as any[]).reduce((s, r) => s + (r.total_value || 0), 0)

  return c.json({
    from: dateA,
    to: dateB,
    summary: {
      totalQtyFrom, totalQtyTo, qtyChange: totalQtyTo - totalQtyFrom,
      totalValueFrom, totalValueTo, valueChange: totalValueTo - totalValueFrom,
      productsChanged: changes.length
    },
    changes
  })
})

// ==================== TRANSFER PACKING CHECKLIST ====================

// Auto-generate checklist from transfer items, then return grouped checklist
app.get('/api/inventory/transfers/:id/checklist', async (c) => {
  const db = c.env.DB
  const transferId = parseInt(c.req.param('id'))

  const transfer = await db.prepare(
    `SELECT t.*, fl.name as from_name, fl.code as from_code, tl.name as to_name, tl.code as to_code
     FROM inventory_transfers t
     LEFT JOIN locations fl ON fl.id = t.from_location_id
     LEFT JOIN locations tl ON tl.id = t.to_location_id
     WHERE t.id = ?`
  ).bind(transferId).first() as any
  if (!transfer) return c.json({ error: 'Transfer not found' }, 404)

  // Check if checklist exists, if not auto-generate
  const existing = await db.prepare('SELECT COUNT(*) as cnt FROM transfer_checklist WHERE transfer_id = ?').bind(transferId).first() as any
  if (!existing || existing.cnt === 0) {
    const items = await db.prepare(
      `SELECT ti.*, p.name as product_name, p.sku, p.unit_type
       FROM inventory_transfer_items ti
       JOIN products p ON p.id = ti.product_id
       WHERE ti.transfer_id = ?
       ORDER BY p.name`
    ).bind(transferId).all()

    for (const item of (items.results || []) as any[]) {
      await db.prepare(
        `INSERT INTO transfer_checklist (transfer_id, product_id, product_name, sku, qty_requested, unit_type)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(transferId, item.product_id, item.product_name, item.sku || null, item.qty_requested, item.unit_type || 'each').run()
    }
  }

  // Return checklist items
  const checklist = await db.prepare(
    `SELECT * FROM transfer_checklist WHERE transfer_id = ? ORDER BY product_name`
  ).bind(transferId).all()

  const items = (checklist.results || []) as any[]
  const totalItems = items.length
  const checkedItems = items.filter((i: any) => i.checked).length

  return c.json({ transfer, items, totalItems, checkedItems })
})

// Toggle a single checklist item
app.put('/api/inventory/transfer-checklist/:id/toggle', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const user = getUserFromHeader(c)

  const item = await db.prepare('SELECT * FROM transfer_checklist WHERE id = ?').bind(id).first() as any
  if (!item) return c.json({ error: 'Item not found' }, 404)

  const newChecked = item.checked ? 0 : 1
  const userName = user ? (await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any)?.name || user.email : null

  await db.prepare(
    `UPDATE transfer_checklist SET checked = ?, checked_by = ?, checked_by_name = ?, checked_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END WHERE id = ?`
  ).bind(newChecked, newChecked ? user?.id : null, newChecked ? userName : null, newChecked, id).run()

  return c.json({ success: true, checked: newChecked })
})

// Check all items in a transfer checklist
app.post('/api/inventory/transfers/:id/checklist/check-all', async (c) => {
  const db = c.env.DB
  const transferId = parseInt(c.req.param('id'))
  const user = getUserFromHeader(c)
  const userName = user ? (await db.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first() as any)?.name || user.email : null

  await db.prepare(
    `UPDATE transfer_checklist SET checked = 1, checked_by = ?, checked_by_name = ?, checked_at = datetime('now') WHERE transfer_id = ? AND checked = 0`
  ).bind(user?.id || null, userName, transferId).run()

  return c.json({ success: true })
})

// Reset transfer checklist
app.post('/api/inventory/transfers/:id/checklist/reset', async (c) => {
  const db = c.env.DB
  const transferId = parseInt(c.req.param('id'))
  await db.prepare('DELETE FROM transfer_checklist WHERE transfer_id = ?').bind(transferId).run()
  return c.json({ success: true })
})

// ==================== CATEGORY ORDER ASSIGNMENTS ====================

// Get all category assignments
app.get('/api/inventory/category-assignments', async (c) => {
  const db = c.env.DB

  // Get assignments
  let assignments: any
  try {
    assignments = await db.prepare(
      `SELECT ca.*, u.email as user_email FROM category_order_assignments ca LEFT JOIN users u ON u.id = ca.user_id ORDER BY ca.category, ca.is_primary DESC`
    ).all()
  } catch(e) { assignments = { results: [] } }

  // Get distinct categories from products
  let categories: any
  try {
    categories = await db.prepare(
      `SELECT DISTINCT category FROM products WHERE active = 1 AND category IS NOT NULL AND category != '' ORDER BY category`
    ).all()
  } catch(e) { categories = { results: [] } }

  // Get users for dropdown
  let users: any
  try {
    users = await db.prepare('SELECT id, name, email, role FROM users WHERE active = 1 ORDER BY name').all()
  } catch(e) { users = { results: [] } }

  return c.json({
    assignments: assignments.results || [],
    categories: (categories.results || []).map((r: any) => r.category),
    users: users.results || []
  })
})

// Set assignment (upsert)
app.post('/api/inventory/category-assignments', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  const { category, user_id, user_name, is_primary, notes } = await c.req.json()
  if (!category || !user_id) return c.json({ error: 'category and user_id required' }, 400)

  // Upsert
  await db.prepare(
    `INSERT INTO category_order_assignments (category, user_id, user_name, is_primary, notes, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(category, user_id) DO UPDATE SET is_primary = excluded.is_primary, notes = excluded.notes, user_name = excluded.user_name, updated_at = datetime('now')`
  ).bind(category, user_id, user_name || null, is_primary ?? 1, notes || null).run()

  return c.json({ success: true })
})

// Remove assignment
app.delete('/api/inventory/category-assignments/:id', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  const id = parseInt(c.req.param('id'))
  await db.prepare('DELETE FROM category_order_assignments WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ==================== SMART RESTOCK (DEMAND ANALYSIS) ====================

// Analyze buying habits at each location vs current stock
// Combines: order_items (logistics/delivery orders) + pos_sale_items (POS sales)
// Returns per-product demand metrics and restock suggestions
app.get('/api/inventory/smart-restock', async (c) => {
  const db = c.env.DB
  const targetLocationId = parseInt(c.req.query('location_id') || '0')
  const days = parseInt(c.req.query('days') || '90') // lookback period
  const minOrders = parseInt(c.req.query('min_orders') || '2') // min order count to be relevant

  // Get all active locations
  let locations: any
  try {
    locations = await db.prepare('SELECT id, name, code, type FROM locations WHERE active = 1').all()
  } catch (e) {
    locations = { results: [] }
  }
  const locMap: Record<number, any> = {}
  for (const l of locations.results as any[]) locMap[l.id] = l

  // --- 1. DEMAND from logistics orders (order_items) ---
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]

  let orderDemand: any
  try {
    orderDemand = await db.prepare(`
      SELECT oi.product_id, p.name as product_name, p.sku, p.category, p.unit_type, p.price,
        SUM(oi.quantity) as total_qty,
        COUNT(DISTINCT o.id) as order_count,
        COUNT(DISTINCT o.customer_id) as unique_customers,
        MIN(o.created_at) as first_order,
        MAX(o.created_at) as last_order
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN products p ON oi.product_id = p.id
      WHERE o.status NOT IN ('cancelled')
        AND o.created_at >= ?
        AND p.active = 1
      GROUP BY oi.product_id
      HAVING order_count >= ?
      ORDER BY total_qty DESC
    `).bind(cutoff, minOrders).all()
  } catch (e) {
    orderDemand = { results: [] }
  }

  // --- 2. DEMAND from POS sales (pos_sale_items) per location ---
  let posDemand: any
  try {
    posDemand = await db.prepare(`
      SELECT psi.product_id, psi.location_id,
        SUM(psi.quantity) as total_qty,
        COUNT(DISTINCT psi.sale_id) as sale_count
      FROM pos_sale_items psi
      JOIN pos_sales ps ON psi.sale_id = ps.id
      WHERE ps.status = 'completed'
        AND ps.created_at >= ?
      GROUP BY psi.product_id, psi.location_id
    `).bind(cutoff).all()
  } catch (e) {
    posDemand = { results: [] }
  }

  // Build POS demand map: { product_id: { loc_id: qty, ... } }
  const posMap: Record<number, Record<number, number>> = {}
  for (const row of posDemand.results as any[]) {
    if (!posMap[row.product_id]) posMap[row.product_id] = {}
    posMap[row.product_id][row.location_id] = row.total_qty
  }

  // --- 3. CURRENT STOCK per location ---
  let stockRows: any
  try {
    stockRows = await db.prepare(`
      SELECT is2.product_id, is2.location_id, is2.qty_on_hand, is2.qty_available, is2.qty_on_hold
      FROM inventory_stock is2
    `).all()
  } catch (e) {
    stockRows = { results: [] }
  }

  // Stock map: { product_id: { loc_id: { on_hand, available }, ... } }
  const stockMap: Record<number, Record<number, any>> = {}
  for (const row of stockRows.results as any[]) {
    if (!stockMap[row.product_id]) stockMap[row.product_id] = {}
    stockMap[row.product_id][row.location_id] = {
      on_hand: row.qty_on_hand,
      available: row.qty_available,
      on_hold: row.qty_on_hold
    }
  }

  // --- 4. BUILD ANALYSIS per product ---
  const analysis: any[] = []

  for (const item of orderDemand.results as any[]) {
    const pid = item.product_id
    const stock = stockMap[pid] || {}
    const posDemandForProduct = posMap[pid] || {}

    // Total demand = logistics orders + POS
    const totalLogisticsDemand = item.total_qty
    let totalPosDemand = 0
    for (const locId of Object.keys(posDemandForProduct)) {
      totalPosDemand += posDemandForProduct[parseInt(locId)]
    }
    const totalDemand = totalLogisticsDemand + totalPosDemand

    // Calc rates
    const weeksInPeriod = Math.max(1, days / 7)
    const avgWeeklyDemand = Math.round((totalDemand / weeksInPeriod) * 10) / 10
    const avgDailyDemand = Math.round((totalDemand / days) * 10) / 10

    // Per-location breakdown
    const locationBreakdown: any[] = []
    for (const loc of locations.results as any[]) {
      const locStock = stock[loc.id] || { on_hand: 0, available: 0, on_hold: 0 }
      const locPosDemand = posDemandForProduct[loc.id] || 0

      // For logistics orders, warehouse (distribution) fills deliveries
      // Retail location only sees POS demand directly
      let locDemand = locPosDemand
      if (loc.type === 'distribution') {
        locDemand += totalLogisticsDemand // warehouse fulfills delivery orders
      }

      const weeklyDemand = Math.round((locDemand / weeksInPeriod) * 10) / 10
      const dailyDemand = locDemand > 0 ? (locDemand / days) : 0
      const daysOfSupply = dailyDemand > 0 ? Math.round(locStock.available / dailyDemand) : (locStock.available > 0 ? 999 : 0)

      locationBreakdown.push({
        location_id: loc.id,
        location_name: loc.name,
        location_code: loc.code,
        location_type: loc.type,
        stock_on_hand: locStock.on_hand,
        stock_available: locStock.available,
        stock_on_hold: locStock.on_hold,
        demand_total: locDemand,
        demand_weekly: weeklyDemand,
        days_of_supply: daysOfSupply,
        status: daysOfSupply <= 7 ? 'critical' : daysOfSupply <= 14 ? 'low' : daysOfSupply <= 30 ? 'watch' : 'ok'
      })
    }

    // Overall stock totals
    let totalOnHand = 0, totalAvailable = 0
    for (const loc of Object.values(stock) as any[]) {
      totalOnHand += loc.on_hand
      totalAvailable += loc.available
    }

    const overallDailyDemand = totalDemand / days
    const overallDaysOfSupply = overallDailyDemand > 0 ? Math.round(totalAvailable / overallDailyDemand) : (totalAvailable > 0 ? 999 : 0)

    analysis.push({
      product_id: pid,
      product_name: item.product_name,
      sku: item.sku,
      category: item.category,
      unit_type: item.unit_type,
      price: item.price,
      demand: {
        total_qty: totalDemand,
        logistics_qty: totalLogisticsDemand,
        pos_qty: totalPosDemand,
        order_count: item.order_count,
        unique_customers: item.unique_customers,
        avg_weekly: avgWeeklyDemand,
        avg_daily: avgDailyDemand,
        first_order: item.first_order,
        last_order: item.last_order
      },
      stock: {
        total_on_hand: totalOnHand,
        total_available: totalAvailable,
        days_of_supply: overallDaysOfSupply,
        status: overallDaysOfSupply <= 7 ? 'critical' : overallDaysOfSupply <= 14 ? 'low' : overallDaysOfSupply <= 30 ? 'watch' : 'ok'
      },
      locations: locationBreakdown
    })
  }

  // --- 5. Generate SUGGESTIONS ---
  // Filter to target location if specified
  const filtered = targetLocationId ? analysis.filter(a => {
    const locData = a.locations.find((l: any) => l.location_id === targetLocationId)
    return locData && (locData.status === 'critical' || locData.status === 'low' || locData.status === 'watch')
  }) : analysis.filter(a => a.stock.status !== 'ok')

  const suggestions: any[] = []
  for (const item of filtered) {
    const targetLoc = targetLocationId
      ? item.locations.find((l: any) => l.location_id === targetLocationId)
      : item.locations.find((l: any) => l.status === 'critical' || l.status === 'low')

    if (!targetLoc) continue

    // How much do we need? Enough for 3 weeks of demand
    const weeksInPeriod = Math.max(1, days / 7)
    const targetWeeks = 3
    const neededQty = Math.max(0, Math.ceil(targetLoc.demand_weekly * targetWeeks) - targetLoc.stock_available)
    if (neededQty <= 0) continue

    // Can another location supply it?
    const otherLoc = item.locations.find((l: any) =>
      l.location_id !== targetLoc.location_id && l.stock_available > neededQty && l.days_of_supply > 21
    )

    suggestions.push({
      product_id: item.product_id,
      product_name: item.product_name,
      sku: item.sku,
      category: item.category,
      unit_type: item.unit_type,
      to_location: { id: targetLoc.location_id, name: targetLoc.location_name, code: targetLoc.location_code },
      current_stock: targetLoc.stock_available,
      weekly_demand: targetLoc.demand_weekly,
      days_of_supply: targetLoc.days_of_supply,
      suggested_qty: neededQty,
      status: targetLoc.status,
      action: otherLoc ? 'transfer' : 'purchase',
      from_location: otherLoc ? { id: otherLoc.location_id, name: otherLoc.location_name, code: otherLoc.location_code, available: otherLoc.stock_available } : null
    })
  }

  // Sort suggestions: critical first, then low, then by qty needed
  const statusOrder: Record<string, number> = { critical: 0, low: 1, watch: 2, ok: 3 }
  suggestions.sort((a, b) => (statusOrder[a.status] || 3) - (statusOrder[b.status] || 3) || b.suggested_qty - a.suggested_qty)

  return c.json({
    analysis_period_days: days,
    cutoff_date: cutoff,
    target_location: targetLocationId ? locMap[targetLocationId] : null,
    locations: locations.results,
    total_products_analyzed: analysis.length,
    summary: {
      critical: analysis.filter(a => a.stock.status === 'critical').length,
      low: analysis.filter(a => a.stock.status === 'low').length,
      watch: analysis.filter(a => a.stock.status === 'watch').length,
      ok: analysis.filter(a => a.stock.status === 'ok').length,
    },
    suggestions,
    products: analysis
  })
})

// Create transfer from smart restock suggestions (batch)
app.post('/api/inventory/smart-restock/create-transfer', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const { from_location_id, to_location_id, items, notes } = body
  // items: [{ product_id, quantity }]

  if (!from_location_id || !to_location_id || !items?.length) {
    return c.json({ error: 'from_location_id, to_location_id, and items required' }, 400)
  }

  // Generate transfer number
  const d = new Date()
  const prefix = 'SR' // Smart Restock
  const num = prefix + d.getFullYear().toString().slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + Math.random().toString(36).substring(2, 6).toUpperCase()

  const result = await db.prepare(
    `INSERT INTO inventory_transfers (transfer_number, from_location_id, to_location_id, status, notes, created_by, created_at)
     VALUES (?, ?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP)`
  ).bind(num, from_location_id, to_location_id, notes || 'Auto-generated from Smart Restock analysis', body.created_by || null).run()

  const transferId = result.meta.last_row_id

  for (const item of items) {
    await db.prepare(
      'INSERT INTO inventory_transfer_items (transfer_id, product_id, qty_requested) VALUES (?, ?, ?)'
    ).bind(transferId, item.product_id, item.quantity).run()
  }

  return c.json({ success: true, transfer_id: transferId, transfer_number: num })
})

export default app
export { app as inventoryApp, takeSnapshot }
