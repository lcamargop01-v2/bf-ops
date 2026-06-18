import { Hono } from 'hono'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// ==================== HELPER: Date range from query params ====================
function parseDateRange(c: any) {
  const from = c.req.query('from') || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const to = c.req.query('to') || new Date().toISOString().slice(0, 10)
  const locationId = c.req.query('location_id') || null
  return { from, to, locationId }
}

// ==================== INVENTORY SNAPSHOT: Take daily snapshot ====================
app.post('/api/reports/inventory/snapshot', async (c) => {
  const db = c.env.DB
  const today = new Date().toISOString().slice(0, 10)

  // Check if snapshot already exists for today
  const existing = await db.prepare('SELECT COUNT(*) as cnt FROM inventory_snapshots WHERE snapshot_date = ?').bind(today).first<any>()
  if (existing?.cnt > 0) {
    return c.json({ message: 'Snapshot already exists for today', date: today, count: existing.cnt })
  }

  // Take snapshot of current inventory
  const snap = await db.prepare(`
    INSERT INTO inventory_snapshots (snapshot_date, product_id, location_id, product_name, category, qty_on_hand, qty_on_hold, qty_reserved, qty_available, unit_cost, total_value)
    SELECT ?, s.product_id, s.location_id, p.name, p.category,
           s.qty_on_hand, s.qty_on_hold, s.qty_reserved, s.qty_available,
           COALESCE(p.cost, 0),
           s.qty_on_hand * COALESCE(p.cost, 0)
    FROM inventory_stock s
    JOIN products p ON p.id = s.product_id
    WHERE p.active = 1
  `).bind(today).run()

  return c.json({ success: true, date: today, rows: snap.meta?.changes || 0 })
})

// ==================== INVENTORY AS-OF DATE ====================
app.get('/api/reports/inventory/as-of', async (c) => {
  const db = c.env.DB
  const date = c.req.query('date') || new Date().toISOString().slice(0, 10)
  const locationId = c.req.query('location_id') || null
  const category = c.req.query('category') || null
  const search = c.req.query('search') || null

  // Check if we have a snapshot for this date
  let snapshotQuery = `SELECT * FROM inventory_snapshots WHERE snapshot_date = ?`
  const params: any[] = [date]

  if (locationId) { snapshotQuery += ' AND location_id = ?'; params.push(locationId) }
  if (category) { snapshotQuery += ' AND category = ?'; params.push(category) }
  if (search) { snapshotQuery += ' AND product_name LIKE ?'; params.push(`%${search}%`) }

  snapshotQuery += ' ORDER BY product_name'
  const snap = await db.prepare(snapshotQuery).bind(...params).all()

  if (snap.results.length > 0) {
    // We have a snapshot — calculate summary
    const totalItems = snap.results.length
    const totalQty = snap.results.reduce((s: number, r: any) => s + r.qty_on_hand, 0)
    const totalValue = snap.results.reduce((s: number, r: any) => s + (r.total_value || 0), 0)
    const byCategory: Record<string, any> = {}
    for (const r of snap.results as any[]) {
      const cat = r.category || 'uncategorized'
      if (!byCategory[cat]) byCategory[cat] = { category: cat, qty: 0, value: 0, products: 0 }
      byCategory[cat].qty += r.qty_on_hand
      byCategory[cat].value += r.total_value || 0
      byCategory[cat].products++
    }
    return c.json({
      date,
      source: 'snapshot',
      summary: { totalItems, totalQty, totalValue },
      byCategory: Object.values(byCategory),
      items: snap.results
    })
  }

  // No snapshot — check if date is today → use live data
  const today = new Date().toISOString().slice(0, 10)
  if (date === today) {
    let liveQuery = `
      SELECT s.product_id, s.location_id, p.name as product_name, p.category,
             s.qty_on_hand, s.qty_on_hold, s.qty_reserved, s.qty_available,
             COALESCE(p.cost, 0) as unit_cost,
             s.qty_on_hand * COALESCE(p.cost, 0) as total_value
      FROM inventory_stock s
      JOIN products p ON p.id = s.product_id
      WHERE p.active = 1
    `
    const liveParams: any[] = []
    if (locationId) { liveQuery += ' AND s.location_id = ?'; liveParams.push(locationId) }
    if (category) { liveQuery += ' AND p.category = ?'; liveParams.push(category) }
    if (search) { liveQuery += ' AND p.name LIKE ?'; liveParams.push(`%${search}%`) }
    liveQuery += ' ORDER BY p.name'

    const live = await db.prepare(liveQuery).bind(...liveParams).all()
    const totalItems = live.results.length
    const totalQty = live.results.reduce((s: number, r: any) => s + r.qty_on_hand, 0)
    const totalValue = live.results.reduce((s: number, r: any) => s + (r.total_value || 0), 0)
    const byCategory: Record<string, any> = {}
    for (const r of live.results as any[]) {
      const cat = r.category || 'uncategorized'
      if (!byCategory[cat]) byCategory[cat] = { category: cat, qty: 0, value: 0, products: 0 }
      byCategory[cat].qty += r.qty_on_hand
      byCategory[cat].value += r.total_value || 0
      byCategory[cat].products++
    }
    return c.json({
      date,
      source: 'live',
      summary: { totalItems, totalQty, totalValue },
      byCategory: Object.values(byCategory),
      items: live.results
    })
  }

  // Historical date with no snapshot — try to reconstruct from audit trail
  // Get latest snapshot before this date as baseline, then apply audit changes
  const baseline = await db.prepare(`
    SELECT snapshot_date FROM inventory_snapshots 
    WHERE snapshot_date <= ? 
    ORDER BY snapshot_date DESC LIMIT 1
  `).bind(date).first<any>()

  if (baseline) {
    return c.json({
      date,
      source: 'nearest_snapshot',
      nearestDate: baseline.snapshot_date,
      message: `No snapshot for ${date}. Nearest snapshot is ${baseline.snapshot_date}. Use that date for accurate data.`,
      items: []
    })
  }

  return c.json({ date, source: 'none', message: 'No inventory snapshot available for this date. Take daily snapshots going forward.', items: [] })
})

// ==================== INVENTORY SNAPSHOT DATES (available dates) ====================
app.get('/api/reports/inventory/snapshot-dates', async (c) => {
  const db = c.env.DB
  const dates = await db.prepare(`
    SELECT DISTINCT snapshot_date, COUNT(*) as product_count,
           SUM(qty_on_hand) as total_qty, SUM(total_value) as total_value
    FROM inventory_snapshots 
    GROUP BY snapshot_date 
    ORDER BY snapshot_date DESC 
    LIMIT 90
  `).all()
  return c.json(dates.results)
})

// ==================== SALES / ORDERS REPORT ====================
app.get('/api/reports/sales', async (c) => {
  const db = c.env.DB
  const { from, to, locationId } = parseDateRange(c)
  const groupBy = c.req.query('group_by') || 'day' // day, week, month, customer, product

  // Overall summary
  const summary = await db.prepare(`
    SELECT 
      COUNT(*) as total_orders,
      COUNT(CASE WHEN status = 'delivered' OR status = 'completed' THEN 1 END) as delivered,
      COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
      COUNT(CASE WHEN status NOT IN ('delivered','completed','cancelled') THEN 1 END) as active,
      SUM(total_weight) as total_weight
    FROM orders 
    WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
  `).bind(from, to).first<any>()

  // Revenue by items (qty * price)
  const revenue = await db.prepare(`
    SELECT SUM(oi.quantity * COALESCE(p.price, 0)) as total_revenue,
           SUM(oi.quantity * COALESCE(p.cost, 0)) as total_cost,
           SUM(oi.quantity) as total_units
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    WHERE DATE(o.created_at) >= ? AND DATE(o.created_at) <= ?
      AND o.status NOT IN ('cancelled')
  `).bind(from, to).first<any>()

  let breakdown: any[] = []

  if (groupBy === 'day') {
    const r = await db.prepare(`
      SELECT DATE(created_at) as period, COUNT(*) as orders,
             SUM(total_weight) as weight
      FROM orders 
      WHERE DATE(created_at) >= ? AND DATE(created_at) <= ? AND status != 'cancelled'
      GROUP BY DATE(created_at) ORDER BY period
    `).bind(from, to).all()
    breakdown = r.results
  } else if (groupBy === 'customer') {
    const r = await db.prepare(`
      SELECT c.business_name as label, c.id as customer_id,
             COUNT(o.id) as orders,
             SUM(oi_agg.units) as units,
             SUM(oi_agg.revenue) as revenue,
             SUM(o.total_weight) as weight
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      LEFT JOIN (
        SELECT oi.order_id, SUM(oi.quantity) as units,
               SUM(oi.quantity * COALESCE(p.price, 0)) as revenue
        FROM order_items oi JOIN products p ON p.id = oi.product_id
        GROUP BY oi.order_id
      ) oi_agg ON oi_agg.order_id = o.id
      WHERE DATE(o.created_at) >= ? AND DATE(o.created_at) <= ? AND o.status != 'cancelled'
      GROUP BY c.id ORDER BY revenue DESC
    `).bind(from, to).all()
    breakdown = r.results
  } else if (groupBy === 'product') {
    const r = await db.prepare(`
      SELECT p.name as label, p.id as product_id, p.category,
             SUM(oi.quantity) as units,
             SUM(oi.quantity * COALESCE(p.price, 0)) as revenue,
             SUM(oi.quantity * COALESCE(p.cost, 0)) as cost,
             SUM(oi.quantity * (COALESCE(p.price, 0) - COALESCE(p.cost, 0))) as margin,
             COUNT(DISTINCT o.id) as orders
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      WHERE DATE(o.created_at) >= ? AND DATE(o.created_at) <= ? AND o.status != 'cancelled'
      GROUP BY p.id ORDER BY revenue DESC
    `).bind(from, to).all()
    breakdown = r.results
  } else if (groupBy === 'month') {
    const r = await db.prepare(`
      SELECT SUBSTR(created_at, 1, 7) as period, COUNT(*) as orders,
             SUM(total_weight) as weight
      FROM orders 
      WHERE DATE(created_at) >= ? AND DATE(created_at) <= ? AND status != 'cancelled'
      GROUP BY SUBSTR(created_at, 1, 7) ORDER BY period
    `).bind(from, to).all()
    breakdown = r.results
  } else if (groupBy === 'status') {
    const r = await db.prepare(`
      SELECT status as label, COUNT(*) as orders, SUM(total_weight) as weight
      FROM orders 
      WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
      GROUP BY status ORDER BY orders DESC
    `).bind(from, to).all()
    breakdown = r.results
  }

  return c.json({
    period: { from, to },
    summary: { ...summary, ...revenue },
    breakdown
  })
})

// ==================== SALES DRILL-DOWN: Orders for a specific customer/product/day ====================
app.get('/api/reports/sales/drill', async (c) => {
  const db = c.env.DB
  const { from, to } = parseDateRange(c)
  const customerId = c.req.query('customer_id')
  const productId = c.req.query('product_id')
  const date = c.req.query('date')
  const status = c.req.query('status')

  let query = `
    SELECT o.id, o.order_number, o.status, o.scheduled_date, o.total_weight, o.created_at,
           c.business_name as customer_name,
           GROUP_CONCAT(p.name || ' x' || oi.quantity, ', ') as items_summary
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE DATE(o.created_at) >= ? AND DATE(o.created_at) <= ?
  `
  const params: any[] = [from, to]

  if (customerId) { query += ' AND o.customer_id = ?'; params.push(customerId) }
  if (productId) { query += ' AND oi.product_id = ?'; params.push(productId) }
  if (date) { query += ' AND DATE(o.created_at) = ?'; params.push(date) }
  if (status) { query += ' AND o.status = ?'; params.push(status) }

  query += ' GROUP BY o.id ORDER BY o.created_at DESC LIMIT 200'

  const result = await db.prepare(query).bind(...params).all()
  return c.json(result.results)
})

// ==================== PURCHASING REPORT ====================
app.get('/api/reports/purchasing', async (c) => {
  const db = c.env.DB
  const { from, to } = parseDateRange(c)
  const groupBy = c.req.query('group_by') || 'supplier' // supplier, product, month, status

  const summary = await db.prepare(`
    SELECT COUNT(*) as total_pos,
           COUNT(CASE WHEN status = 'received' THEN 1 END) as received,
           COUNT(CASE WHEN status IN ('ordered','in_transit') THEN 1 END) as active,
           COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
           SUM(total_amount) as total_spent
    FROM purchase_orders
    WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
  `).bind(from, to).first<any>()

  // Bills summary
  const bills = await db.prepare(`
    SELECT COUNT(*) as total_bills,
           SUM(CASE WHEN b.status = 'pending' THEN b.total ELSE 0 END) as pending_amount,
           SUM(CASE WHEN b.status = 'paid' THEN b.total ELSE 0 END) as paid_amount,
           SUM(b.total) as total_billed
    FROM po_bills b
    JOIN purchase_orders po ON po.id = b.po_id
    WHERE DATE(b.created_at) >= ? AND DATE(b.created_at) <= ?
  `).bind(from, to).first<any>()

  let breakdown: any[] = []

  if (groupBy === 'supplier') {
    const r = await db.prepare(`
      SELECT s.name as label, s.id as supplier_id,
             COUNT(po.id) as pos, SUM(po.total_amount) as spent,
             COUNT(CASE WHEN po.status = 'received' THEN 1 END) as received,
             COUNT(CASE WHEN po.status IN ('ordered','in_transit') THEN 1 END) as active
      FROM purchase_orders po
      JOIN suppliers s ON s.id = po.supplier_id
      WHERE DATE(po.created_at) >= ? AND DATE(po.created_at) <= ?
      GROUP BY s.id ORDER BY spent DESC
    `).bind(from, to).all()
    breakdown = r.results
  } else if (groupBy === 'product') {
    const r = await db.prepare(`
      SELECT p.name as label, p.id as product_id, p.category,
             SUM(pi.qty_ordered) as qty_ordered,
             SUM(pi.qty_received) as qty_received,
             SUM(pi.qty_ordered * pi.unit_cost) as total_cost,
             COUNT(DISTINCT po.id) as pos
      FROM po_items pi
      JOIN purchase_orders po ON po.id = pi.po_id
      LEFT JOIN products p ON p.id = pi.product_id
      WHERE DATE(po.created_at) >= ? AND DATE(po.created_at) <= ?
      GROUP BY pi.product_id ORDER BY total_cost DESC
    `).bind(from, to).all()
    breakdown = r.results
  } else if (groupBy === 'month') {
    const r = await db.prepare(`
      SELECT SUBSTR(created_at, 1, 7) as period,
             COUNT(*) as pos, SUM(total_amount) as spent
      FROM purchase_orders
      WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
      GROUP BY SUBSTR(created_at, 1, 7) ORDER BY period
    `).bind(from, to).all()
    breakdown = r.results
  }

  return c.json({
    period: { from, to },
    summary: { ...summary, ...bills },
    breakdown
  })
})

// ==================== DELIVERY / ROUTE PERFORMANCE ====================
app.get('/api/reports/delivery', async (c) => {
  const db = c.env.DB
  const { from, to } = parseDateRange(c)
  const groupBy = c.req.query('group_by') || 'day' // day, driver, truck, route

  const summary = await db.prepare(`
    SELECT COUNT(*) as total_routes,
           COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
           COUNT(CASE WHEN status IN ('dispatched','in_progress') THEN 1 END) as active,
           (SELECT COUNT(*) FROM route_stops rs JOIN routes r ON r.id = rs.route_id 
            WHERE DATE(r.created_at) >= ? AND DATE(r.created_at) <= ?) as total_stops,
           (SELECT COUNT(*) FROM route_stops rs JOIN routes r ON r.id = rs.route_id 
            WHERE DATE(r.created_at) >= ? AND DATE(r.created_at) <= ? AND rs.status = 'delivered') as delivered_stops,
           (SELECT COUNT(*) FROM delivery_proofs dp JOIN route_stops rs ON rs.id = dp.stop_id
            JOIN routes r ON r.id = rs.route_id
            WHERE DATE(r.created_at) >= ? AND DATE(r.created_at) <= ?) as proofs_collected
    FROM routes
    WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
  `).bind(from, to, from, to, from, to, from, to).first<any>()

  let breakdown: any[] = []

  if (groupBy === 'day') {
    const r = await db.prepare(`
      SELECT DATE(r.created_at) as period, COUNT(r.id) as routes,
             COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completed,
             (SELECT COUNT(*) FROM route_stops rs WHERE rs.route_id IN 
              (SELECT id FROM routes WHERE DATE(created_at) = DATE(r.created_at))) as stops
      FROM routes r
      WHERE DATE(r.created_at) >= ? AND DATE(r.created_at) <= ?
      GROUP BY DATE(r.created_at) ORDER BY period
    `).bind(from, to).all()
    breakdown = r.results
  } else if (groupBy === 'driver') {
    const r = await db.prepare(`
      SELECT u.name as label, r.driver_id,
             COUNT(r.id) as routes,
             COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completed,
             (SELECT COUNT(*) FROM route_stops rs WHERE rs.route_id IN 
              (SELECT id FROM routes WHERE driver_id = r.driver_id AND DATE(created_at) >= ? AND DATE(created_at) <= ?)) as stops
      FROM routes r
      LEFT JOIN users u ON u.id = r.driver_id
      WHERE DATE(r.created_at) >= ? AND DATE(r.created_at) <= ? AND r.driver_id IS NOT NULL
      GROUP BY r.driver_id ORDER BY routes DESC
    `).bind(from, to, from, to).all()
    breakdown = r.results
  } else if (groupBy === 'truck') {
    const r = await db.prepare(`
      SELECT t.name as label, r.truck_id,
             COUNT(r.id) as routes,
             COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completed
      FROM routes r
      LEFT JOIN trucks t ON t.id = r.truck_id
      WHERE DATE(r.created_at) >= ? AND DATE(r.created_at) <= ? AND r.truck_id IS NOT NULL
      GROUP BY r.truck_id ORDER BY routes DESC
    `).bind(from, to).all()
    breakdown = r.results
  }

  return c.json({
    period: { from, to },
    summary,
    breakdown
  })
})

// ==================== RETURNS REPORT ====================
app.get('/api/reports/returns', async (c) => {
  const db = c.env.DB
  const { from, to } = parseDateRange(c)
  const groupBy = c.req.query('group_by') || 'customer' // customer, product, reason, day

  const summary = await db.prepare(`
    SELECT COUNT(*) as total_returns,
           COUNT(CASE WHEN status = 'completed' OR status = 'restocked' THEN 1 END) as completed,
           COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
           (SELECT COUNT(*) FROM return_items ri JOIN returns r ON r.id = ri.return_id
            WHERE DATE(r.created_at) >= ? AND DATE(r.created_at) <= ?) as total_items,
           (SELECT SUM(ri.actual_qty) FROM return_items ri JOIN returns r ON r.id = ri.return_id
            WHERE DATE(r.created_at) >= ? AND DATE(r.created_at) <= ?) as total_qty_returned
    FROM returns
    WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
  `).bind(from, to, from, to, from, to).first<any>()

  let breakdown: any[] = []

  if (groupBy === 'customer') {
    const r = await db.prepare(`
      SELECT c.business_name as label, c.id as customer_id,
             COUNT(ret.id) as returns,
             SUM(ri_agg.items) as items, SUM(ri_agg.qty) as qty
      FROM returns ret
      JOIN customers c ON c.id = ret.customer_id
      LEFT JOIN (
        SELECT return_id, COUNT(*) as items, SUM(actual_qty) as qty FROM return_items GROUP BY return_id
      ) ri_agg ON ri_agg.return_id = ret.id
      WHERE DATE(ret.created_at) >= ? AND DATE(ret.created_at) <= ?
      GROUP BY c.id ORDER BY returns DESC
    `).bind(from, to).all()
    breakdown = r.results
  } else if (groupBy === 'product') {
    const r = await db.prepare(`
      SELECT p.name as label, p.id as product_id, p.category,
             SUM(ri.actual_qty) as qty_returned, COUNT(DISTINCT ret.id) as returns
      FROM return_items ri
      JOIN returns ret ON ret.id = ri.return_id
      JOIN products p ON p.id = ri.product_id
      WHERE DATE(ret.created_at) >= ? AND DATE(ret.created_at) <= ?
      GROUP BY p.id ORDER BY qty_returned DESC
    `).bind(from, to).all()
    breakdown = r.results
  } else if (groupBy === 'day') {
    const r = await db.prepare(`
      SELECT DATE(created_at) as period, COUNT(*) as returns
      FROM returns
      WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
      GROUP BY DATE(created_at) ORDER BY period
    `).bind(from, to).all()
    breakdown = r.results
  }

  return c.json({ period: { from, to }, summary, breakdown })
})

// ==================== CUSTOMER REPORT ====================
app.get('/api/reports/customers', async (c) => {
  const db = c.env.DB
  const { from, to } = parseDateRange(c)

  const summary = await db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM customers WHERE active = 1) as total_active,
      (SELECT COUNT(*) FROM customers WHERE active = 0) as total_inactive,
      (SELECT COUNT(DISTINCT customer_id) FROM orders WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?) as ordering_customers,
      (SELECT COUNT(*) FROM customers WHERE active = 1 
       AND id NOT IN (SELECT DISTINCT customer_id FROM orders WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?)) as dormant_customers
  `).bind(from, to, from, to).first<any>()

  // Top customers by order volume
  const topCustomers = await db.prepare(`
    SELECT c.id, c.business_name, c.zone,
           COUNT(o.id) as order_count,
           SUM(o.total_weight) as total_weight,
           SUM(oi_agg.revenue) as revenue,
           MAX(o.created_at) as last_order
    FROM customers c
    JOIN orders o ON o.customer_id = c.id
    LEFT JOIN (
      SELECT oi.order_id, SUM(oi.quantity * COALESCE(p.price, 0)) as revenue
      FROM order_items oi JOIN products p ON p.id = oi.product_id GROUP BY oi.order_id
    ) oi_agg ON oi_agg.order_id = o.id
    WHERE DATE(o.created_at) >= ? AND DATE(o.created_at) <= ? AND o.status != 'cancelled'
    GROUP BY c.id ORDER BY revenue DESC LIMIT 50
  `).bind(from, to).all()

  // Customers with no orders in period (dormant)
  const dormant = await db.prepare(`
    SELECT c.id, c.business_name, c.zone,
           (SELECT MAX(created_at) FROM orders WHERE customer_id = c.id) as last_order
    FROM customers c
    WHERE c.active = 1
      AND c.id NOT IN (SELECT DISTINCT customer_id FROM orders WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?)
    ORDER BY last_order DESC LIMIT 50
  `).bind(from, to).all()

  return c.json({
    period: { from, to },
    summary,
    topCustomers: topCustomers.results,
    dormant: dormant.results
  })
})

// ==================== PRODUCT PERFORMANCE ====================
app.get('/api/reports/products', async (c) => {
  const db = c.env.DB
  const { from, to } = parseDateRange(c)
  const category = c.req.query('category') || null

  let query = `
    SELECT p.id, p.name, p.sku, p.category, p.price, p.cost,
           COALESCE(SUM(oi.quantity), 0) as units_sold,
           COALESCE(SUM(oi.quantity * p.price), 0) as revenue,
           COALESCE(SUM(oi.quantity * p.cost), 0) as cost_of_goods,
           COALESCE(SUM(oi.quantity * (p.price - p.cost)), 0) as margin,
           COUNT(DISTINCT o.id) as order_count,
           COUNT(DISTINCT o.customer_id) as customer_count,
           (SELECT COALESCE(SUM(s.qty_on_hand), 0) FROM inventory_stock s WHERE s.product_id = p.id) as current_stock
    FROM products p
    LEFT JOIN order_items oi ON oi.product_id = p.id
    LEFT JOIN orders o ON o.id = oi.order_id AND DATE(o.created_at) >= ? AND DATE(o.created_at) <= ? AND o.status != 'cancelled'
    WHERE p.active = 1
  `
  const params: any[] = [from, to]
  if (category) { query += ' AND p.category = ?'; params.push(category) }
  query += ' GROUP BY p.id ORDER BY revenue DESC'

  const result = await db.prepare(query).bind(...params).all()

  // Summary
  const totalRevenue = result.results.reduce((s: number, r: any) => s + r.revenue, 0)
  const totalCost = result.results.reduce((s: number, r: any) => s + r.cost_of_goods, 0)
  const totalMargin = result.results.reduce((s: number, r: any) => s + r.margin, 0)
  const totalUnits = result.results.reduce((s: number, r: any) => s + r.units_sold, 0)

  // By category
  const byCategory: Record<string, any> = {}
  for (const r of result.results as any[]) {
    const cat = r.category || 'uncategorized'
    if (!byCategory[cat]) byCategory[cat] = { category: cat, revenue: 0, cost: 0, margin: 0, units: 0, products: 0 }
    byCategory[cat].revenue += r.revenue
    byCategory[cat].cost += r.cost_of_goods
    byCategory[cat].margin += r.margin
    byCategory[cat].units += r.units_sold
    byCategory[cat].products++
  }

  return c.json({
    period: { from, to },
    summary: { totalRevenue, totalCost, totalMargin, totalUnits, productCount: result.results.length },
    byCategory: Object.values(byCategory),
    products: result.results
  })
})

// ==================== FLEET / MAINTENANCE REPORT ====================
app.get('/api/reports/fleet', async (c) => {
  const db = c.env.DB
  const { from, to } = parseDateRange(c)

  const summary = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM trucks WHERE active = 1) as active_trucks,
      (SELECT COUNT(*) FROM fleet_maintenance WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?) as maintenance_records,
      (SELECT COUNT(*) FROM fleet_maintenance WHERE status = 'open' OR status = 'in_progress') as open_issues,
      (SELECT COUNT(*) FROM routes WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?) as total_routes
  `).bind(from, to, from, to).first<any>()

  // Routes per truck
  const truckUsage = await db.prepare(`
    SELECT t.id, t.name, t.plate_number,
           COUNT(r.id) as routes,
           COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completed,
           (SELECT COUNT(*) FROM fleet_maintenance fm WHERE fm.truck_id = t.id 
            AND DATE(fm.created_at) >= ? AND DATE(fm.created_at) <= ?) as maintenance_events
    FROM trucks t
    LEFT JOIN routes r ON r.truck_id = t.id AND DATE(r.created_at) >= ? AND DATE(r.created_at) <= ?
    WHERE t.active = 1
    GROUP BY t.id ORDER BY routes DESC
  `).bind(from, to, from, to).all()

  // Driver performance
  const driverPerformance = await db.prepare(`
    SELECT u.id, u.name,
           COUNT(r.id) as routes,
           COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completed,
           (SELECT COUNT(*) FROM route_stops rs WHERE rs.route_id IN 
            (SELECT id FROM routes WHERE driver_id = u.id AND DATE(created_at) >= ? AND DATE(created_at) <= ?) 
            AND rs.status = 'delivered') as stops_delivered,
           (SELECT COUNT(*) FROM delivery_proofs dp JOIN route_stops rs ON rs.id = dp.stop_id
            WHERE rs.route_id IN 
            (SELECT id FROM routes WHERE driver_id = u.id AND DATE(created_at) >= ? AND DATE(created_at) <= ?)) as proofs
    FROM users u
    JOIN routes r ON r.driver_id = u.id
    WHERE DATE(r.created_at) >= ? AND DATE(r.created_at) <= ?
    GROUP BY u.id ORDER BY routes DESC
  `).bind(from, to, from, to, from, to).all()

  return c.json({
    period: { from, to },
    summary,
    truckUsage: truckUsage.results,
    driverPerformance: driverPerformance.results
  })
})

// ==================== INVENTORY MOVEMENTS REPORT ====================
app.get('/api/reports/inventory/movements', async (c) => {
  const db = c.env.DB
  const { from, to, locationId } = parseDateRange(c)
  const groupBy = c.req.query('group_by') || 'action' // action, product, day

  let summaryQuery = `
    SELECT action, SUM(ABS(qty_change)) as total_qty, COUNT(*) as count
    FROM inventory_audit
    WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
  `
  const summaryParams: any[] = [from, to]
  if (locationId) { summaryQuery += ' AND location_id = ?'; summaryParams.push(locationId) }
  summaryQuery += ' GROUP BY action ORDER BY total_qty DESC'

  const actionSummary = await db.prepare(summaryQuery).bind(...summaryParams).all()

  let breakdown: any[] = []

  if (groupBy === 'product') {
    let q = `
      SELECT p.name as label, p.id as product_id, p.category,
             SUM(CASE WHEN ia.qty_change > 0 THEN ia.qty_change ELSE 0 END) as inbound,
             SUM(CASE WHEN ia.qty_change < 0 THEN ABS(ia.qty_change) ELSE 0 END) as outbound,
             SUM(ia.qty_change) as net_change, COUNT(*) as movements
      FROM inventory_audit ia
      JOIN products p ON p.id = ia.product_id
      WHERE DATE(ia.created_at) >= ? AND DATE(ia.created_at) <= ?
    `
    const qp: any[] = [from, to]
    if (locationId) { q += ' AND ia.location_id = ?'; qp.push(locationId) }
    q += ' GROUP BY p.id ORDER BY movements DESC'
    const r = await db.prepare(q).bind(...qp).all()
    breakdown = r.results
  } else if (groupBy === 'day') {
    let q = `
      SELECT DATE(created_at) as period,
             SUM(CASE WHEN qty_change > 0 THEN qty_change ELSE 0 END) as inbound,
             SUM(CASE WHEN qty_change < 0 THEN ABS(qty_change) ELSE 0 END) as outbound,
             COUNT(*) as movements
      FROM inventory_audit
      WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
    `
    const qp: any[] = [from, to]
    if (locationId) { q += ' AND location_id = ?'; qp.push(locationId) }
    q += ' GROUP BY DATE(created_at) ORDER BY period'
    const r = await db.prepare(q).bind(...qp).all()
    breakdown = r.results
  }

  return c.json({
    period: { from, to },
    actionSummary: actionSummary.results,
    breakdown
  })
})

// ==================== WAREHOUSE ACTIVITY REPORT ====================
app.get('/api/reports/warehouse', async (c) => {
  const db = c.env.DB
  const { from, to } = parseDateRange(c)

  const summary = await db.prepare(`
    SELECT 
      COUNT(*) as total_activities,
      SUM(CASE WHEN direction = 'in' THEN quantity ELSE 0 END) as total_in,
      SUM(CASE WHEN direction = 'out' THEN quantity ELSE 0 END) as total_out,
      COUNT(DISTINCT product_id) as products_touched,
      COUNT(DISTINCT performed_by) as staff_involved
    FROM warehouse_activity
    WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
  `).bind(from, to).first<any>()

  // By activity type
  const byType = await db.prepare(`
    SELECT activity_type, COUNT(*) as count,
           SUM(CASE WHEN direction = 'in' THEN quantity ELSE 0 END) as qty_in,
           SUM(CASE WHEN direction = 'out' THEN quantity ELSE 0 END) as qty_out
    FROM warehouse_activity
    WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
    GROUP BY activity_type ORDER BY count DESC
  `).bind(from, to).all()

  // By staff member
  const byStaff = await db.prepare(`
    SELECT u.name as label, wa.performed_by,
           COUNT(*) as activities,
           SUM(CASE WHEN wa.direction = 'in' THEN wa.quantity ELSE 0 END) as qty_in,
           SUM(CASE WHEN wa.direction = 'out' THEN wa.quantity ELSE 0 END) as qty_out
    FROM warehouse_activity wa
    LEFT JOIN users u ON u.id = wa.performed_by
    WHERE DATE(wa.created_at) >= ? AND DATE(wa.created_at) <= ?
    GROUP BY wa.performed_by ORDER BY activities DESC
  `).bind(from, to).all()

  return c.json({
    period: { from, to },
    summary,
    byType: byType.results,
    byStaff: byStaff.results
  })
})

// ==================== FINANCIAL SUMMARY (P&L style) ====================
app.get('/api/reports/financial', async (c) => {
  const db = c.env.DB
  const { from, to } = parseDateRange(c)

  // Revenue (orders)
  const revenue = await db.prepare(`
    SELECT SUM(oi.quantity * COALESCE(p.price, 0)) as total_revenue,
           SUM(oi.quantity * COALESCE(p.cost, 0)) as cogs,
           SUM(oi.quantity * (COALESCE(p.price, 0) - COALESCE(p.cost, 0))) as gross_margin,
           COUNT(DISTINCT o.id) as order_count
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    WHERE DATE(o.created_at) >= ? AND DATE(o.created_at) <= ? AND o.status NOT IN ('cancelled')
  `).bind(from, to).first<any>()

  // Purchasing spend
  const purchasing = await db.prepare(`
    SELECT SUM(total_amount) as total_purchasing,
           COUNT(*) as po_count
    FROM purchase_orders
    WHERE DATE(created_at) >= ? AND DATE(created_at) <= ? AND status != 'cancelled'
  `).bind(from, to).first<any>()

  // Bills
  const bills = await db.prepare(`
    SELECT SUM(CASE WHEN b.status = 'paid' THEN b.total ELSE 0 END) as paid,
           SUM(CASE WHEN b.status = 'pending' THEN b.total ELSE 0 END) as pending,
           SUM(b.total) as total_billed
    FROM po_bills b
    JOIN purchase_orders po ON po.id = b.po_id
    WHERE DATE(b.created_at) >= ? AND DATE(b.created_at) <= ?
  `).bind(from, to).first<any>()

  // Inventory value
  const invValue = await db.prepare(`
    SELECT SUM(s.qty_on_hand * COALESCE(p.cost, 0)) as inventory_value,
           SUM(s.qty_on_hand * COALESCE(p.price, 0)) as inventory_retail_value,
           SUM(s.qty_on_hand) as total_units
    FROM inventory_stock s
    JOIN products p ON p.id = s.product_id
    WHERE p.active = 1
  `).first<any>()

  // Monthly trend
  const monthlyTrend = await db.prepare(`
    SELECT SUBSTR(o.created_at, 1, 7) as month,
           SUM(oi.quantity * COALESCE(p.price, 0)) as revenue,
           SUM(oi.quantity * COALESCE(p.cost, 0)) as cogs,
           SUM(oi.quantity * (COALESCE(p.price, 0) - COALESCE(p.cost, 0))) as margin,
           COUNT(DISTINCT o.id) as orders
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    WHERE DATE(o.created_at) >= ? AND DATE(o.created_at) <= ? AND o.status NOT IN ('cancelled')
    GROUP BY SUBSTR(o.created_at, 1, 7) ORDER BY month
  `).bind(from, to).all()

  return c.json({
    period: { from, to },
    revenue,
    purchasing,
    bills,
    inventoryValue: invValue,
    monthlyTrend: monthlyTrend.results
  })
})

// ==================== EXPORT DATA (Generic - for PDF/Excel) ====================
app.get('/api/reports/export', async (c) => {
  const db = c.env.DB
  const type = c.req.query('type') // orders, products, customers, inventory, returns, pos, bills
  const { from, to } = parseDateRange(c)

  let data: any[] = []

  if (type === 'orders') {
    const r = await db.prepare(`
      SELECT o.order_number, o.status, o.scheduled_date, o.total_weight, o.priority,
             o.created_at, c.business_name as customer, 
             GROUP_CONCAT(p.name || ' x' || oi.quantity, '; ') as items,
             SUM(oi.quantity * COALESCE(p.price, 0)) as revenue
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE DATE(o.created_at) >= ? AND DATE(o.created_at) <= ?
      GROUP BY o.id ORDER BY o.created_at DESC
    `).bind(from, to).all()
    data = r.results
  } else if (type === 'products') {
    const r = await db.prepare(`
      SELECT p.name, p.sku, p.category, p.price, p.cost,
             (p.price - p.cost) as margin,
             COALESCE(SUM(oi.quantity), 0) as units_sold,
             (SELECT COALESCE(SUM(qty_on_hand), 0) FROM inventory_stock WHERE product_id = p.id) as current_stock
      FROM products p
      LEFT JOIN order_items oi ON oi.product_id = p.id
      LEFT JOIN orders o ON o.id = oi.order_id AND DATE(o.created_at) >= ? AND DATE(o.created_at) <= ? AND o.status != 'cancelled'
      WHERE p.active = 1
      GROUP BY p.id ORDER BY p.name
    `).bind(from, to).all()
    data = r.results
  } else if (type === 'customers') {
    const r = await db.prepare(`
      SELECT c.business_name, c.zone, c.email, c.phone,
             COUNT(o.id) as orders,
             SUM(o.total_weight) as weight,
             MAX(o.created_at) as last_order
      FROM customers c
      LEFT JOIN orders o ON o.customer_id = c.id AND DATE(o.created_at) >= ? AND DATE(o.created_at) <= ? AND o.status != 'cancelled'
      WHERE c.active = 1
      GROUP BY c.id ORDER BY orders DESC
    `).bind(from, to).all()
    data = r.results
  } else if (type === 'inventory') {
    const r = await db.prepare(`
      SELECT p.name, p.sku, p.category, l.name as location,
             s.qty_on_hand, s.qty_on_hold, s.qty_reserved, s.qty_available,
             p.cost, p.price,
             s.qty_on_hand * COALESCE(p.cost, 0) as value_at_cost,
             s.qty_on_hand * COALESCE(p.price, 0) as value_at_retail
      FROM inventory_stock s
      JOIN products p ON p.id = s.product_id
      JOIN locations l ON l.id = s.location_id
      WHERE p.active = 1
      ORDER BY p.name
    `).all()
    data = r.results
  } else if (type === 'returns') {
    const r = await db.prepare(`
      SELECT ret.id, c.business_name as customer, ret.status, ret.notes, ret.created_at,
             GROUP_CONCAT(p.name || ' x' || ri.actual_qty, '; ') as items
      FROM returns ret
      JOIN customers c ON c.id = ret.customer_id
      LEFT JOIN return_items ri ON ri.return_id = ret.id
      LEFT JOIN products p ON p.id = ri.product_id
      WHERE DATE(ret.created_at) >= ? AND DATE(ret.created_at) <= ?
      GROUP BY ret.id ORDER BY ret.created_at DESC
    `).bind(from, to).all()
    data = r.results
  } else if (type === 'bills') {
    const r = await db.prepare(`
      SELECT po.po_number, s.name as supplier, b.bill_number, b.supplier_invoice_number,
             b.amount, b.tax, b.total, b.status, b.due_date, b.paid_date
      FROM po_bills b
      JOIN purchase_orders po ON po.id = b.po_id
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      WHERE DATE(b.created_at) >= ? AND DATE(b.created_at) <= ?
      ORDER BY b.created_at DESC
    `).bind(from, to).all()
    data = r.results
  } else if (type === 'inventory_snapshot') {
    const date = c.req.query('date') || new Date().toISOString().slice(0, 10)
    const r = await db.prepare(`
      SELECT product_name as name, category, qty_on_hand, qty_on_hold, qty_reserved, qty_available,
             unit_cost as cost, total_value
      FROM inventory_snapshots
      WHERE snapshot_date = ?
      ORDER BY product_name
    `).bind(date).all()
    data = r.results
  }

  return c.json({ type, period: { from, to }, count: data.length, data })
})

// ==================== LOCATIONS LIST (for filters) ====================
app.get('/api/reports/locations', async (c) => {
  const db = c.env.DB
  const r = await db.prepare('SELECT id, name, type FROM locations ORDER BY name').all()
  return c.json(r.results)
})

// ==================== CATEGORIES LIST (for filters) ====================
app.get('/api/reports/categories', async (c) => {
  const db = c.env.DB
  const r = await db.prepare('SELECT DISTINCT category FROM products WHERE active = 1 ORDER BY category').all()
  return c.json(r.results.map((r: any) => r.category))
})

export { app as reportsApp }
