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

  let stockQuery = `SELECT s.*, p.name as product_name, p.sku, p.category, p.unit_type, p.price, p.cost, p.weight_per_unit,
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

  return c.json({
    stock: stock.results || [],
    summary: {
      total_products: totalProducts,
      total_units: totalUnits,
      total_value: Math.round(totalValue * 100) / 100,
      low_stock: lowStock,
      on_hold: onHold,
      reserved: reserved,
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

  let query = `SELECT s.*, p.name as product_name, p.sku, p.category, p.unit_type, p.price, p.cost, p.weight_per_unit, p.pallet_qty,
    l.name as location_name, l.code as location_code,
    u_count.name as last_counted_by_name
    FROM inventory_stock s
    JOIN products p ON s.product_id = p.id
    JOIN locations l ON s.location_id = l.id
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
  return c.json({ stock: stock.results || [] })
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

  return c.json({
    stock: stock.results || [],
    batches: batches.results || [],
    holds: holds.results || [],
    reservations: reservations.results || []
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

  let query = `SELECT b.*, p.name as product_name, p.sku, p.unit_type,
    l.name as location_name, l.code as location_code, u.name as created_by_name
    FROM inventory_batches b
    JOIN products p ON b.product_id = p.id
    JOIN locations l ON b.location_id = l.id
    LEFT JOIN users u ON b.created_by = u.id WHERE b.qty > 0`
  const binds: any[] = []
  if (productId) { query += ' AND b.product_id = ?'; binds.push(parseInt(productId)) }
  if (locationId) { query += ' AND b.location_id = ?'; binds.push(parseInt(locationId)) }
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

  await auditLog(db, {
    product_id, location_id, action: 'batch_created', qty_change: 0,
    reason: `Batch ${batchNum} created (${condition || 'good'})`,
    batch_id: result.meta.last_row_id as number,
    notes: notes || null,
    user_id: user.id, user_name: userInfo?.name || user.email
  })

  return c.json({ success: true, id: result.meta.last_row_id, batch_number: batchNum })
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

  let query = 'SELECT id, name, sku, category, unit_type, price, cost, weight_per_unit, active, tax_rate, pallet_qty, stock_quantity FROM products'
  const conditions: string[] = []
  const binds: any[] = []

  if (!includeInactive) { conditions.push('active = 1') }
  if (search) { conditions.push('(name LIKE ? OR sku LIKE ?)'); binds.push(`%${search}%`, `%${search}%`) }
  if (category) { conditions.push('category = ?'); binds.push(category) }

  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ')
  query += ' ORDER BY name ASC LIMIT ? OFFSET ?'
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

// Get single product detail
app.get('/api/inventory/products/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const product = await db.prepare('SELECT * FROM products WHERE id = ?').bind(id).first()
  if (!product) return c.json({ error: 'Product not found' }, 404)
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
  const allowedFields = ['name', 'sku', 'category', 'unit_type', 'price', 'cost', 'weight_per_unit',
    'active', 'tax_rate', 'pallet_qty', 'pallet_weight', 'length_in', 'width_in', 'height_in',
    'stackable', 'max_stack', 'bag_length_in', 'bag_width_in', 'bag_height_in']

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
    `INSERT INTO products (name, sku, category, unit_type, price, cost, weight_per_unit, active, tax_rate, pallet_qty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    body.name, body.sku || null, body.category || 'other', body.unit_type || 'each',
    body.price || 0, body.cost || 0, body.weight_per_unit || 0,
    body.active !== undefined ? body.active : 1, body.tax_rate || 0, body.pallet_qty || 0
  ).run()

  const product = await db.prepare('SELECT * FROM products WHERE id = ?').bind(result.meta.last_row_id).first()
  return c.json({ success: true, product })
})

export default app
export { app as inventoryApp }
