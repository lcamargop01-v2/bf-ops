import { Hono } from 'hono'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// ==================== HELPERS ====================
function getUserFromHeader(c: any): any {
  try {
    const auth = c.req.header('Authorization')
    if (!auth) return null
    const token = auth.replace('Bearer ', '')
    const payload = JSON.parse(atob(token))
    return payload
  } catch { return null }
}

function genSaleNumber() {
  const d = new Date()
  const prefix = 'S' + d.getFullYear().toString().slice(2) + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0')
  const rand = Math.random().toString(36).substring(2,8).toUpperCase()
  return prefix + '-' + rand
}
function genRefundNumber() {
  const d = new Date()
  return 'R' + d.getFullYear().toString().slice(2) + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0') + '-' + Math.random().toString(36).substring(2,7).toUpperCase()
}
function genTransferNumber() {
  const d = new Date()
  return 'TRF' + d.getFullYear().toString().slice(2) + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0') + '-' + Math.random().toString(36).substring(2,7).toUpperCase()
}

// Map frontend fulfillment types to valid sale_type values
function mapSaleType(fulfillment: string, baseSaleType: string): string {
  const validTypes = ['walk_in','delivery','pickup','wholesale','phone_order']
  // If base sale type is already valid, use it
  if (validTypes.includes(baseSaleType)) return baseSaleType
  // Map fulfillment-based types
  if (fulfillment === 'dc_pickup') return 'pickup'
  if (fulfillment === 'delivery') return 'delivery'
  if (fulfillment === 'reserve_retail') return 'walk_in' // Transfer is tracked separately
  return 'walk_in'
}

// ==================== PRODUCTS: Quick search for POS ====================
app.get('/api/pos/products', async (c) => {
  const db = c.env.DB
  const search = c.req.query('search') || ''
  const locationId = c.req.query('location_id') || '1'
  const category = c.req.query('category') || ''
  const limit = parseInt(c.req.query('limit') || '50')

  let query = `
    SELECT p.id, p.name, p.sku, p.barcode, p.category, p.price, p.cost, p.tax_rate,
           COALESCE(s.qty_available, 0) as qty_available,
           COALESCE(s.qty_on_hand, 0) as qty_on_hand,
           COALESCE(s.qty_on_hold, 0) as qty_on_hold,
           COALESCE(s.qty_reserved, 0) as qty_reserved
    FROM products p
    LEFT JOIN inventory_stock s ON s.product_id = p.id AND s.location_id = ?
    WHERE p.active = 1
  `
  const params: any[] = [locationId]

  if (search) {
    query += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode = ?)'
    params.push(`%${search}%`, `%${search}%`, search)
  }
  if (category) {
    query += ' AND p.category = ?'
    params.push(category)
  }

  query += ' ORDER BY p.name LIMIT ?'
  params.push(limit)

  const result = await db.prepare(query).bind(...params).all()
  return c.json(result.results)
})

// ==================== BARCODE LOOKUP (fast exact match) ====================
app.get('/api/pos/barcode/:code', async (c) => {
  const db = c.env.DB
  const code = c.req.param('code')
  const locationId = c.req.query('location_id') || '1'

  const product = await db.prepare(`
    SELECT p.id, p.name, p.sku, p.barcode, p.category, p.price, p.cost, p.tax_rate,
           COALESCE(s.qty_available, 0) as qty_available,
           COALESCE(s.qty_on_hand, 0) as qty_on_hand
    FROM products p
    LEFT JOIN inventory_stock s ON s.product_id = p.id AND s.location_id = ?
    WHERE p.active = 1 AND p.barcode = ?
    LIMIT 1
  `).bind(locationId, code).first()

  if (!product) return c.json({ error: 'No product found for barcode: ' + code }, 404)
  return c.json(product)
})

// ==================== PRODUCT CATEGORIES (for POS quick filters) ====================
app.get('/api/pos/categories', async (c) => {
  const db = c.env.DB
  const r = await db.prepare(`
    SELECT DISTINCT category, COUNT(*) as count 
    FROM products WHERE active = 1 
    GROUP BY category ORDER BY category
  `).all()
  return c.json(r.results)
})

// ==================== CUSTOMER SEARCH ====================
app.get('/api/pos/customers', async (c) => {
  const db = c.env.DB
  const search = c.req.query('search') || ''

  let query = `
    SELECT c.id, c.business_name, c.contact_name, c.phone, c.email, 
           c.customer_type, c.tax_exempt, c.sponsor_discount, c.priority_rank,
           c.location_id,
           COALESCE(loc.name, '') as location_name,
           (SELECT COUNT(*) FROM orders WHERE customer_id = c.id AND status NOT IN ('cancelled')) as total_orders,
           (SELECT MAX(created_at) FROM orders WHERE customer_id = c.id) as last_order,
           ca.balance as account_balance,
           ca.credit_limit,
           ca.payment_terms as account_terms,
           ca.status as account_status
    FROM customers c
    LEFT JOIN locations loc ON loc.id = c.location_id
    LEFT JOIN customer_accounts ca ON ca.customer_id = c.id
    WHERE c.active = 1
  `
  const params: any[] = []

  if (search) {
    query += ' AND (c.business_name LIKE ? OR c.contact_name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)'
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
  }

  query += ' ORDER BY c.business_name LIMIT 30'

  const result = await db.prepare(query).bind(...params).all()
  return c.json(result.results)
})

// ==================== CUSTOMER DETAIL (full info panel) ====================
app.get('/api/pos/customers/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))

  const customer = await db.prepare(`
    SELECT c.*, COALESCE(loc.name, '') as location_name
    FROM customers c
    LEFT JOIN locations loc ON loc.id = c.location_id
    WHERE c.id = ?
  `).bind(id).first()

  if (!customer) return c.json({ error: 'Customer not found' }, 404)

  // Account info
  const account = await db.prepare('SELECT * FROM customer_accounts WHERE customer_id = ?').bind(id).first()

  // Addresses
  const addresses = await db.prepare('SELECT * FROM addresses WHERE customer_id = ? ORDER BY is_primary DESC').bind(id).all()

  // Recent orders (last 10)
  const recentOrders = await db.prepare(`
    SELECT o.id, o.order_number, o.status, o.total_weight, o.created_at,
           GROUP_CONCAT(p.name || ' x' || oi.quantity, ', ') as items
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE o.customer_id = ? AND o.status != 'cancelled'
    GROUP BY o.id ORDER BY o.created_at DESC LIMIT 10
  `).bind(id).all()

  // Recent POS sales (last 10)
  const recentSales = await db.prepare(`
    SELECT s.id, s.sale_number, s.status, s.total, s.sale_type, s.created_at,
           GROUP_CONCAT(si.product_name || ' x' || CAST(si.quantity AS INTEGER), ', ') as items
    FROM pos_sales s
    LEFT JOIN pos_sale_items si ON si.sale_id = s.id
    WHERE s.customer_id = ? AND s.status != 'voided'
    GROUP BY s.id ORDER BY s.created_at DESC LIMIT 10
  `).bind(id).all()

  // Price rules for this customer
  const priceRules = await db.prepare(`
    SELECT pr.*, p.name as product_name
    FROM pos_price_rules pr
    LEFT JOIN products p ON p.id = pr.product_id
    WHERE pr.customer_id = ? AND pr.active = 1
  `).bind(id).all()

  // CRM org if linked
  const crmOrg = await db.prepare('SELECT id, name, org_type, tags FROM crm_organizations WHERE customer_id = ?').bind(id).first()

  // Standing orders (recurring schedules)
  let standingOrders: any[] = []
  try {
    const schedules = await db.prepare(`
      SELECT rs.id, rs.status, rs.confirm_mode, rs.auto_confirm, rs.address_id,
        a.label as address_label, a.street as address_street, a.city as address_city,
        dz.name as zone_name, dz.color as zone_color, dz.delivery_days as zone_delivery_days
      FROM recurring_schedules rs
      LEFT JOIN addresses a ON rs.address_id = a.id
      LEFT JOIN delivery_zones dz ON a.zone_id = dz.id
      WHERE rs.customer_id = ? AND rs.status = 'active'
    `).bind(id).all()
    for (const sched of (schedules.results || []) as any[]) {
      const items = await db.prepare(`
        SELECT rsi.product_id, rsi.quantity, p.name as product_name, p.unit_type, p.sku
        FROM recurring_schedule_items rsi
        JOIN products p ON rsi.product_id = p.id
        WHERE rsi.schedule_id = ?
      `).bind(sched.id).all()
      standingOrders.push({ ...sched, items: items.results || [] })
    }
  } catch(e) { /* table might not exist locally */ }

  // Last delivery info
  let lastDelivery: any = null
  try {
    lastDelivery = await db.prepare(`
      SELECT o.id, o.order_number, o.status, o.scheduled_date, o.created_at,
        rs.actual_arrival, rs.signature_url, rs.delivery_photo_url
      FROM orders o
      LEFT JOIN route_stops rs ON rs.order_id = o.id
      WHERE o.customer_id = ? AND o.status IN ('completed','delivered')
      ORDER BY COALESCE(rs.actual_arrival, o.scheduled_date, o.created_at) DESC LIMIT 1
    `).bind(id).first()
  } catch(e) {}

  // Primary address zone info
  let deliveryZone: any = null
  try {
    const primaryAddr = (addresses.results || []).find((a: any) => a.is_primary) || (addresses.results || [])[0]
    if (primaryAddr && (primaryAddr as any).zone_id) {
      deliveryZone = await db.prepare('SELECT id, name, color, delivery_days FROM delivery_zones WHERE id = ?')
        .bind((primaryAddr as any).zone_id).first()
    }
  } catch(e) {}

  return c.json({
    customer,
    account: account || { balance: 0, credit_limit: 0, payment_terms: 'COD', status: 'active' },
    addresses: addresses.results,
    recentOrders: recentOrders.results,
    recentSales: recentSales.results,
    priceRules: priceRules.results,
    crmOrg,
    standingOrders,
    lastDelivery,
    deliveryZone
  })
})

// ==================== CUSTOMER PURCHASE HISTORY (for reorder) ====================
app.get('/api/pos/customer-history/:customerId', async (c) => {
  const db = c.env.DB
  const customerId = parseInt(c.req.param('customerId'))
  const locationId = c.req.query('location_id')

  // Get all products this customer has ever purchased — from both POS sales and logistics orders
  // Aggregate: total times ordered, total qty, last order date
  const history = await db.prepare(`
    SELECT
      p.id as product_id,
      p.name,
      p.sku,
      p.category,
      p.price,
      p.cost,
      p.tax_rate,
      p.active,
      COALESCE(pos.times_ordered, 0) + COALESCE(ord.times_ordered, 0) as times_ordered,
      COALESCE(pos.total_qty, 0) + COALESCE(ord.total_qty, 0) as total_qty,
      MAX(COALESCE(pos.last_ordered, ''), COALESCE(ord.last_ordered, '')) as last_ordered,
      COALESCE(pos.avg_qty, 0) as pos_avg_qty,
      COALESCE(stk.qty_available, 0) as stock
    FROM products p
    LEFT JOIN (
      SELECT si.product_id,
        COUNT(DISTINCT si.sale_id) as times_ordered,
        SUM(si.quantity) as total_qty,
        MAX(s.created_at) as last_ordered,
        ROUND(AVG(si.quantity), 1) as avg_qty
      FROM pos_sale_items si
      JOIN pos_sales s ON s.id = si.sale_id
      WHERE s.customer_id = ? AND s.status NOT IN ('voided', 'hold')
      GROUP BY si.product_id
    ) pos ON pos.product_id = p.id
    LEFT JOIN (
      SELECT oi.product_id,
        COUNT(DISTINCT oi.order_id) as times_ordered,
        SUM(oi.quantity) as total_qty,
        MAX(o.created_at) as last_ordered
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.customer_id = ? AND o.status NOT IN ('cancelled')
      GROUP BY oi.product_id
    ) ord ON ord.product_id = p.id
    LEFT JOIN inventory_stock stk ON stk.product_id = p.id AND stk.location_id = ?
    WHERE (pos.product_id IS NOT NULL OR ord.product_id IS NOT NULL)
      AND p.active = 1
    ORDER BY times_ordered DESC, last_ordered DESC
    LIMIT 50
  `).bind(customerId, customerId, locationId ? parseInt(locationId) : 1).all()

  return c.json(history.results || [])
})

// ==================== PRICE CHECK (get effective price for customer + product) ====================
app.get('/api/pos/price-check', async (c) => {
  const db = c.env.DB
  const productId = c.req.query('product_id')
  const customerId = c.req.query('customer_id')
  const qty = parseFloat(c.req.query('qty') || '1')

  if (!productId) return c.json({ error: 'product_id required' }, 400)

  const product = await db.prepare('SELECT id, name, price, cost, tax_rate FROM products WHERE id = ?').bind(productId).first<any>()
  if (!product) return c.json({ error: 'Product not found' }, 404)

  let effectivePrice = product.price
  let priceSource = 'list'
  let discountPct = 0

  if (customerId) {
    // Check customer-specific pricing
    const custPrice = await db.prepare(`
      SELECT price, discount_pct, rule_type, name FROM pos_price_rules
      WHERE customer_id = ? AND product_id = ? AND active = 1
        AND (start_date IS NULL OR start_date <= DATE('now'))
        AND (end_date IS NULL OR end_date >= DATE('now'))
      ORDER BY rule_type = 'customer_price' DESC LIMIT 1
    `).bind(customerId, productId).first<any>()

    if (custPrice) {
      if (custPrice.price) { effectivePrice = custPrice.price; priceSource = 'customer_price' }
      else if (custPrice.discount_pct) { discountPct = custPrice.discount_pct; effectivePrice = product.price * (1 - discountPct/100); priceSource = 'customer_discount' }
    }

    // Check volume discounts
    const volDiscount = await db.prepare(`
      SELECT discount_pct, min_qty FROM pos_price_rules
      WHERE (customer_id IS NULL OR customer_id = ?) AND product_id = ? AND rule_type = 'volume_discount' AND active = 1
        AND min_qty <= ?
        AND (start_date IS NULL OR start_date <= DATE('now'))
        AND (end_date IS NULL OR end_date >= DATE('now'))
      ORDER BY min_qty DESC LIMIT 1
    `).bind(customerId, productId, qty).first<any>()

    if (volDiscount && volDiscount.discount_pct > discountPct) {
      discountPct = volDiscount.discount_pct
      effectivePrice = product.price * (1 - discountPct/100)
      priceSource = 'volume_discount'
    }

    // Check customer sponsor discount
    const cust = await db.prepare('SELECT sponsor_discount, tax_exempt FROM customers WHERE id = ?').bind(customerId).first<any>()
    if (cust?.sponsor_discount > discountPct) {
      discountPct = cust.sponsor_discount
      effectivePrice = product.price * (1 - discountPct/100)
      priceSource = 'sponsor_discount'
    }
  }

  return c.json({
    product_id: product.id,
    product_name: product.name,
    list_price: product.price,
    effective_price: Math.round(effectivePrice * 100) / 100,
    price_source: priceSource,
    discount_pct: discountPct,
    cost: product.cost,
    tax_rate: product.tax_rate || 0
  })
})

// ==================== REGISTER SESSIONS ====================
app.get('/api/pos/sessions', async (c) => {
  const db = c.env.DB
  const status = c.req.query('status') || 'open'
  const locationId = c.req.query('location_id')

  let query = 'SELECT * FROM pos_register_sessions WHERE status = ?'
  const params: any[] = [status]
  if (locationId) { query += ' AND location_id = ?'; params.push(locationId) }
  query += ' ORDER BY opened_at DESC LIMIT 50'

  const r = await db.prepare(query).bind(...params).all()
  return c.json(r.results)
})

app.post('/api/pos/sessions', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any
  const r = await db.prepare(
    'INSERT INTO pos_register_sessions (user_id, user_name, location_id, register_type, opening_cash) VALUES (?,?,?,?,?)'
  ).bind(body.user_id, body.user_name || '', body.location_id || 1, body.register_type || 'retail', body.opening_cash || 0).run()
  return c.json({ id: r.meta.last_row_id }, 201)
})

app.put('/api/pos/sessions/:id/close', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json() as any
  await db.prepare(
    'UPDATE pos_register_sessions SET status = ?, closed_at = CURRENT_TIMESTAMP, closing_cash = ?, notes = ? WHERE id = ?'
  ).bind('closed', body.closing_cash || 0, body.notes || null, id).run()
  return c.json({ success: true })
})

// ==================== CREATE SALE (with cross-location support) ====================
app.post('/api/pos/sales', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any

  const saleNumber = genSaleNumber()
  const items = body.items || []
  if (items.length === 0) return c.json({ error: 'No items in sale' }, 400)

  // Cross-location fields from frontend
  const fulfillment = body.fulfillment || 'local'   // local | dc_pickup | delivery | reserve_retail
  const sourceLocationId = body.source_location_id ? parseInt(body.source_location_id) : null
  const saleLocationId = parseInt(body.location_id || '1')

  // Determine which location inventory gets deducted from
  // - local: deduct from sale location
  // - dc_pickup: customer at retail, product ships from DC → deduct from DC (source)
  // - delivery: product delivered from DC → deduct from DC (source)
  // - reserve_retail: DC reserving from retail → deduct from retail (source), create transfer
  const deductLocationId = (fulfillment !== 'local' && sourceLocationId) ? sourceLocationId : saleLocationId

  // Calculate totals
  let subtotal = 0
  let taxTotal = 0
  let discountTotal = 0

  const processedItems: any[] = []
  const warnings: string[] = []

  for (const item of items) {
    const product = await db.prepare('SELECT id, name, sku, category, price, cost, tax_rate FROM products WHERE id = ?').bind(item.product_id).first<any>()
    if (!product) { warnings.push(`Product ID ${item.product_id} not found, skipped`); continue }

    const qty = parseFloat(item.quantity || 1)
    const unitPrice = item.unit_price !== undefined ? parseFloat(item.unit_price) : product.price
    const discountPct = parseFloat(item.discount_pct || 0)
    const discountAmt = unitPrice * qty * (discountPct / 100)
    const lineSubtotal = unitPrice * qty - discountAmt

    // Tax: check if customer is tax exempt
    let taxRate = product.tax_rate || 0
    if (body.customer_id) {
      const cust = await db.prepare('SELECT tax_exempt FROM customers WHERE id = ?').bind(body.customer_id).first<any>()
      if (cust?.tax_exempt) taxRate = 0
    }
    const lineTax = lineSubtotal * (taxRate / 100)

    // Check stock at the location we're deducting from
    const stock = await db.prepare('SELECT qty_available FROM inventory_stock WHERE product_id = ? AND location_id = ?')
      .bind(product.id, deductLocationId).first<any>()

    if (!stock || stock.qty_available < qty) {
      const avail = stock?.qty_available || 0
      warnings.push(`${product.name}: Only ${avail} available at deduct location (requested ${qty})`)
      if (!body.allow_negative_stock) continue
    }

    processedItems.push({
      product_id: product.id,
      product_name: product.name,
      sku: product.sku,
      category: product.category,
      quantity: qty,
      unit_price: unitPrice,
      unit_cost: product.cost || 0,
      discount_pct: discountPct,
      discount_amount: discountAmt,
      tax_rate: taxRate,
      tax_amount: lineTax,
      line_total: lineSubtotal + lineTax,
      location_id: deductLocationId  // inventory deducted from this location
    })

    subtotal += lineSubtotal
    taxTotal += lineTax
    discountTotal += discountAmt
  }

  if (processedItems.length === 0) return c.json({ error: 'No valid items to sell', warnings }, 400)

  const total = subtotal + taxTotal
  const amountPaid = parseFloat(body.amount_paid || total)
  const changeDue = Math.max(0, amountPaid - total)

  // Map sale_type to valid CHECK values
  const saleType = mapSaleType(fulfillment, body.sale_type || 'walk_in')

  // Insert sale with cross-location columns
  const saleRes = await db.prepare(`
    INSERT INTO pos_sales (sale_number, session_id, location_id, customer_id, sale_type, status,
      subtotal, tax_amount, discount_amount, discount_reason, total, amount_paid, change_due,
      notes, internal_notes, delivery_requested, delivery_date, delivery_address_id,
      cashier_id, cashier_name, source_location_id, fulfillment_type)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    saleNumber, body.session_id || null, saleLocationId, body.customer_id || null,
    saleType, body.status || 'completed',
    subtotal, taxTotal, discountTotal, body.discount_reason || null,
    total, amountPaid, changeDue,
    body.notes || null, body.internal_notes || null,
    body.delivery_requested ? 1 : 0, body.delivery_date || null, body.delivery_address_id || null,
    body.cashier_id || null, body.cashier_name || null,
    sourceLocationId, fulfillment
  ).run()

  const saleId = saleRes.meta.last_row_id

  // Determine inventory action based on status + fulfillment
  // - hold: RESERVE (qty_on_hold++) — don't deduct yet, customer may not complete
  // - completed + pickup/walk_in/wholesale/local: DEDUCT (qty_on_hand--) — product leaves immediately
  // - completed + delivery/dc_pickup: RESERVE (qty_on_hold++) — product stays until shipped
  // - reserve_retail: DEDUCT from source (transfer scenario)
  const saleStatus = body.status || 'completed'
  const isHold = saleStatus === 'hold' || saleStatus === 'draft'
  const isDelivery = fulfillment === 'delivery' || fulfillment === 'dc_pickup'
  const shouldReserve = isHold || (isDelivery && saleStatus === 'completed')
  const shouldDeduct = !shouldReserve  // local pickup, walk_in, wholesale, reserve_retail

  // Insert line items & update inventory
  for (const item of processedItems) {
    await db.prepare(`
      INSERT INTO pos_sale_items (sale_id, product_id, product_name, sku, category, quantity, unit_price, unit_cost, discount_pct, discount_amount, tax_rate, tax_amount, line_total, location_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(saleId, item.product_id, item.product_name, item.sku, item.category, item.quantity, item.unit_price, item.unit_cost, item.discount_pct, item.discount_amount, item.tax_rate, item.tax_amount, item.line_total, item.location_id).run()

    if (shouldDeduct) {
      // Immediate deduction — product leaves the shelf now
      await db.prepare(`
        UPDATE inventory_stock SET qty_on_hand = qty_on_hand - ?, updated_at = CURRENT_TIMESTAMP
        WHERE product_id = ? AND location_id = ?
      `).bind(item.quantity, item.product_id, item.location_id).run()
    } else {
      // Reserve — product stays on shelf but is spoken for
      await db.prepare(`
        UPDATE inventory_stock SET qty_on_hold = qty_on_hold + ?, updated_at = CURRENT_TIMESTAMP
        WHERE product_id = ? AND location_id = ?
      `).bind(item.quantity, item.product_id, item.location_id).run()
    }

    // Audit trail
    const auditAction = fulfillment === 'reserve_retail' ? 'transfer_out' : (shouldReserve ? 'hold' : 'sale')
    const auditReason = isHold
      ? 'POS Held Sale — inventory reserved'
      : isDelivery
        ? `POS ${fulfillment} delivery — inventory reserved until shipped`
        : fulfillment !== 'local'
          ? `POS ${fulfillment} (from loc ${item.location_id} for sale at loc ${saleLocationId})`
          : 'POS Sale — inventory deducted'
    await db.prepare(`
      INSERT INTO inventory_audit (product_id, location_id, action, qty_change, reason, reference_type, reference_id, notes, user_name)
      VALUES (?, ?, ?, ?, ?, 'pos_sale', ?, ?, ?)
    `).bind(item.product_id, item.location_id, auditAction, shouldDeduct ? -item.quantity : 0, auditReason, saleId, 'Sale #' + saleNumber, body.cashier_name || '').run()
  }

  // Insert payments
  const payments = body.payments || [{ method: 'cash', amount: amountPaid }]
  for (const pmt of payments) {
    await db.prepare(`
      INSERT INTO pos_payments (sale_id, method, amount, reference, card_last4, check_number, notes)
      VALUES (?,?,?,?,?,?,?)
    `).bind(saleId, pmt.method || 'cash', pmt.amount || 0, pmt.reference || null, pmt.card_last4 || null, pmt.check_number || null, pmt.notes || null).run()
  }

  // If payment on account, update customer balance
  const onAccountPmt = payments.find((p: any) => p.method === 'account')
  if (onAccountPmt && body.customer_id) {
    await db.prepare(`
      INSERT INTO customer_accounts (customer_id, balance) VALUES (?, ?)
      ON CONFLICT(customer_id) DO UPDATE SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
    `).bind(body.customer_id, onAccountPmt.amount, onAccountPmt.amount).run()

    await db.prepare(`
      INSERT INTO customer_account_transactions (customer_id, transaction_type, amount, description, reference_type, reference_id, processed_by)
      VALUES (?, 'charge', ?, ?, 'pos_sale', ?, ?)
    `).bind(body.customer_id, onAccountPmt.amount, 'Sale #' + saleNumber, saleId, body.cashier_id || null).run()
  }

  // ===== CROSS-LOCATION WORKFLOWS =====
  let orderId = null
  let transferId = null

  if (fulfillment === 'reserve_retail') {
    // DC is reserving inventory FROM retail → Create inventory transfer (retail → DC)
    const transferNumber = genTransferNumber()
    const tRes = await db.prepare(`
      INSERT INTO inventory_transfers (transfer_number, from_location_id, to_location_id, status, notes, created_by)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `).bind(transferNumber, sourceLocationId, saleLocationId,
      'POS reserve from retail — Sale #' + saleNumber, body.cashier_id || null).run()
    transferId = tRes.meta.last_row_id

    // Add transfer items
    for (const item of processedItems) {
      await db.prepare(`
        INSERT INTO inventory_transfer_items (transfer_id, product_id, qty_requested, qty_shipped, qty_received)
        VALUES (?, ?, ?, 0, 0)
      `).bind(transferId, item.product_id, item.quantity).run()
    }

    // Link transfer to sale
    await db.prepare('UPDATE pos_sales SET transfer_id = ? WHERE id = ?').bind(transferId, saleId).run()

  } else if (fulfillment === 'dc_pickup' && body.customer_id) {
    // Retail customer picking up at DC — create a pickup order linked to DC
    const orderNumber = 'POS-PU-' + saleNumber
    const orderRes = await db.prepare(`
      INSERT INTO orders (order_number, customer_id, address_id, status, priority, scheduled_date, special_instructions, created_by)
      VALUES (?,?,?,?,?,?,?,?)
    `).bind(orderNumber, body.customer_id, null, 'new', 'normal',
      body.delivery_date || null,
      'POS Pickup at DC — Sale #' + saleNumber + (body.notes ? ' — ' + body.notes : ''),
      body.cashier_id || null).run()
    orderId = orderRes.meta.last_row_id

    for (const item of processedItems) {
      await db.prepare('INSERT INTO order_items (order_id, product_id, quantity) VALUES (?,?,?)')
        .bind(orderId, item.product_id, item.quantity).run()
    }
    await db.prepare('UPDATE pos_sales SET order_id = ? WHERE id = ?').bind(orderId, saleId).run()
    // Pickup orders: mark source but set status to 'confirmed' so they don't appear in unrouted delivery queue
    await db.prepare("UPDATE orders SET source = 'pos', status = 'confirmed' WHERE id = ?").bind(orderId).run()

  } else if (fulfillment === 'delivery' && body.customer_id) {
    // Delivery from DC (or same-location delivery)
    const orderNumber = 'POS-DLV-' + saleNumber
    const orderRes = await db.prepare(`
      INSERT INTO orders (order_number, customer_id, address_id, status, priority, scheduled_date, special_instructions, created_by)
      VALUES (?,?,?,?,?,?,?,?)
    `).bind(orderNumber, body.customer_id, body.delivery_address_id || null, 'new', 'normal',
      body.delivery_date || null,
      (sourceLocationId ? 'Cross-location delivery from loc ' + sourceLocationId + ' — ' : '') +
      'POS Sale #' + saleNumber + (body.notes ? ' — ' + body.notes : ''),
      body.cashier_id || null).run()
    orderId = orderRes.meta.last_row_id

    for (const item of processedItems) {
      await db.prepare('INSERT INTO order_items (order_id, product_id, quantity) VALUES (?,?,?)')
        .bind(orderId, item.product_id, item.quantity).run()
    }
    await db.prepare('UPDATE pos_sales SET order_id = ? WHERE id = ?').bind(orderId, saleId).run()
    // Delivery orders: source=pos, keep status='new' so they appear as unrouted in logistics
    await db.prepare("UPDATE orders SET source = 'pos' WHERE id = ?").bind(orderId).run()

  } else if (body.delivery_requested && body.customer_id) {
    // Legacy: simple same-location delivery
    const orderNumber = 'POS-' + saleNumber
    const orderRes = await db.prepare(`
      INSERT INTO orders (order_number, customer_id, address_id, status, priority, scheduled_date, special_instructions, created_by)
      VALUES (?,?,?,?,?,?,?,?)
    `).bind(orderNumber, body.customer_id, body.delivery_address_id || null, 'new', 'normal',
      body.delivery_date || null, 'POS Sale #' + saleNumber + (body.notes ? ' - ' + body.notes : ''), body.cashier_id || null).run()
    orderId = orderRes.meta.last_row_id

    for (const item of processedItems) {
      await db.prepare('INSERT INTO order_items (order_id, product_id, quantity) VALUES (?,?,?)')
        .bind(orderId, item.product_id, item.quantity).run()
    }
    await db.prepare('UPDATE pos_sales SET order_id = ? WHERE id = ?').bind(orderId, saleId).run()
    // Legacy delivery: source=pos, keep status='new' for logistics routing
    await db.prepare("UPDATE orders SET source = 'pos' WHERE id = ?").bind(orderId).run()
  }

  // ===== AUTO-CREATE DARTS ENTRY TASK FOR ALDI WAREHOUSE =====
  // DARTS task is created when:
  //   1. Any delivery/dc_pickup/delivery_requested order (all locations)
  //   2. ANY sale by a sales rep (their orders always need warehouse import)
  const isDeliveryOrder = orderId && (fulfillment === 'delivery' || fulfillment === 'dc_pickup' || body.delivery_requested)

  // Check if cashier is a sales rep — their sales always need DARTS entry
  let cashierRole = ''
  if (body.cashier_id) {
    const cashierUser = await db.prepare('SELECT role FROM users WHERE id = ?').bind(body.cashier_id).first<any>()
    if (cashierUser) cashierRole = cashierUser.role || ''
  }
  const isSalesRepSale = cashierRole === 'sales rep'

  if (isDeliveryOrder || isSalesRepSale) {
    try {
      // Get customer name for the task
      let custName = 'Walk-in'
      if (body.customer_id) {
        const cust = await db.prepare('SELECT business_name, contact_name FROM customers WHERE id = ?').bind(body.customer_id).first<any>()
        if (cust) custName = cust.business_name || cust.contact_name || 'Customer #' + body.customer_id
      }

      // Build items summary for task description
      const itemsSummary = processedItems.map((it: any) => `${it.quantity}x ${it.product_name}`).join(', ')

      // Determine reference type and number
      const hasOrder = !!orderId
      const refType = hasOrder ? 'order' : 'pos_sale'
      const refId = hasOrder ? orderId : saleId
      const refNumber = hasOrder
        ? (fulfillment === 'dc_pickup' ? 'POS-PU-' + saleNumber : fulfillment === 'delivery' ? 'POS-DLV-' + saleNumber : 'POS-' + saleNumber)
        : 'SALE-' + saleNumber

      // Build type description
      let typeDesc = fulfillment === 'dc_pickup' ? 'Customer Pickup at DC'
        : fulfillment === 'delivery' ? 'Delivery'
        : fulfillment === 'local' ? 'Walk-in / Local Pickup'
        : fulfillment || 'Sale'

      const dartsTaskNumber = 'DARTS-' + Date.now().toString(36).toUpperCase()
      await db.prepare(`
        INSERT INTO tasks (task_number, title, description, task_type, priority, status, location_id, ref_type, ref_id, ref_number, customer_id, customer_name, created_by, created_by_name, due_date, tags)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        dartsTaskNumber,
        '📦 DARTS Entry — ' + custName,
        `Enter into DARTS system:\n\n${hasOrder ? 'Order' : 'Sale'}: ${refNumber}\nCustomer: ${custName}\n${body.delivery_date ? 'Delivery Date: ' + body.delivery_date + '\n' : ''}Type: ${typeDesc}\nItems: ${itemsSummary}\nTotal: $${total.toFixed(2)}\nSale #: ${saleNumber}\nCashier: ${body.cashier_name || 'POS'}\n\nCreated from POS${isSalesRepSale && !isDeliveryOrder ? ' (Sales Rep order — auto-flagged for DARTS)' : ''}`,
        'darts_entry', 'high', 'pending',
        2, // ALDI warehouse location
        refType, refId, refNumber,
        body.customer_id || null, custName,
        body.cashier_id || null, body.cashier_name || 'POS',
        body.delivery_date || null,
        isSalesRepSale ? 'darts,sales_rep,pos' : 'darts,pos_delivery,lox'
      ).run()

      // Create notification for all dispatchers at ALDI
      const dispatchers = await db.prepare(
        "SELECT id FROM users WHERE active = 1 AND (role IN ('dispatcher','admin') OR department = 'office')"
      ).all()
      for (const d of (dispatchers.results || [])) {
        await db.prepare(
          `INSERT INTO notifications (user_id, title, message, notification_type, ref_type, ref_id)
           VALUES (?, ?, ?, 'task', 'task', ?)`
        ).bind(
          (d as any).id,
          '📦 New DARTS Entry Needed',
          `${custName} — ${refNumber} — ${itemsSummary.substring(0, 100)}`,
          refId
        ).run()
      }
    } catch (e) {
      // Don't fail the sale if task creation fails
      console.error('Darts task creation failed:', e)
    }
  }

  return c.json({
    id: saleId,
    sale_number: saleNumber,
    subtotal, tax: taxTotal, discount: discountTotal, total,
    amount_paid: amountPaid, change_due: changeDue,
    items_count: processedItems.length,
    order_id: orderId,
    transfer_id: transferId,
    fulfillment_type: fulfillment,
    warnings
  }, 201)
})

// ==================== GET SALE DETAIL ====================
app.get('/api/pos/sales/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')

  // Support lookup by ID or sale_number
  const isNum = /^\d+$/.test(id)
  const sale = isNum
    ? await db.prepare('SELECT * FROM pos_sales WHERE id = ?').bind(parseInt(id)).first()
    : await db.prepare('SELECT * FROM pos_sales WHERE sale_number = ?').bind(id).first()

  if (!sale) return c.json({ error: 'Sale not found' }, 404)

  const saleId = (sale as any).id
  const items = await db.prepare('SELECT * FROM pos_sale_items WHERE sale_id = ? ORDER BY id').bind(saleId).all()
  const payments = await db.prepare('SELECT * FROM pos_payments WHERE sale_id = ? ORDER BY id').bind(saleId).all()
  const customer = (sale as any).customer_id
    ? await db.prepare('SELECT id, business_name, contact_name, phone, email, tax_exempt FROM customers WHERE id = ?').bind((sale as any).customer_id).first()
    : null

  // Include transfer info if linked
  let transfer = null
  if ((sale as any).transfer_id) {
    transfer = await db.prepare('SELECT * FROM inventory_transfers WHERE id = ?').bind((sale as any).transfer_id).first()
  }

  return c.json({ sale, items: items.results, payments: payments.results, customer, transfer })
})

// ==================== LIST SALES (with filters) ====================
app.get('/api/pos/sales', async (c) => {
  const db = c.env.DB
  const from = c.req.query('from') || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const to = c.req.query('to') || new Date().toISOString().slice(0, 10)
  const status = c.req.query('status') || ''
  const customerId = c.req.query('customer_id') || ''
  const saleType = c.req.query('sale_type') || ''
  const locationId = c.req.query('location_id') || ''
  const search = c.req.query('search') || ''

  let query = `
    SELECT s.*, c.business_name as customer_name,
           (SELECT COUNT(*) FROM pos_sale_items WHERE sale_id = s.id) as item_count,
           (SELECT GROUP_CONCAT(method || ':' || amount) FROM pos_payments WHERE sale_id = s.id) as payment_methods
    FROM pos_sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?
  `
  const params: any[] = [from, to]

  if (status) { query += ' AND s.status = ?'; params.push(status) }
  if (customerId) { query += ' AND s.customer_id = ?'; params.push(customerId) }
  if (saleType) { query += ' AND s.sale_type = ?'; params.push(saleType) }
  if (locationId) { query += ' AND s.location_id = ?'; params.push(locationId) }
  if (search) { query += ' AND (s.sale_number LIKE ? OR c.business_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }

  query += ' ORDER BY s.created_at DESC LIMIT 200'

  const result = await db.prepare(query).bind(...params).all()
  return c.json(result.results)
})

// ==================== VOID SALE ====================
app.put('/api/pos/sales/:id/void', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json() as any

  const sale = await db.prepare('SELECT * FROM pos_sales WHERE id = ?').bind(id).first<any>()
  if (!sale) return c.json({ error: 'Sale not found' }, 404)
  if (sale.status === 'voided') return c.json({ error: 'Already voided' }, 400)

  // Restore inventory — depends on whether it was deducted or reserved
  const wasHeld = sale.status === 'hold'
  const wasDelivery = sale.fulfillment_type === 'delivery' || sale.fulfillment_type === 'dc_pickup'
  const wasReserved = wasHeld || wasDelivery  // these used qty_on_hold instead of qty_on_hand
  const items = await db.prepare('SELECT * FROM pos_sale_items WHERE sale_id = ?').bind(id).all()
  for (const item of items.results as any[]) {
    const locId = item.location_id || sale.location_id
    if (wasReserved) {
      // Release the hold
      await db.prepare('UPDATE inventory_stock SET qty_on_hold = MAX(0, qty_on_hold - ?), updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND location_id = ?')
        .bind(item.quantity, item.product_id, locId).run()
    } else {
      // Restore deducted inventory
      await db.prepare('UPDATE inventory_stock SET qty_on_hand = qty_on_hand + ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND location_id = ?')
        .bind(item.quantity, item.product_id, locId).run()
    }

    await db.prepare(`
      INSERT INTO inventory_audit (product_id, location_id, action, qty_change, reason, reference_type, reference_id, notes, user_name)
      VALUES (?, ?, 'void_restock', ?, ?, 'pos_sale', ?, ?, ?)
    `).bind(item.product_id, locId, wasReserved ? 0 : item.quantity,
      wasReserved ? 'Sale voided — hold released' : 'Sale voided — inventory restored',
      id, 'Void: ' + sale.sale_number, body.voided_by_name || '').run()
  }

  // Reverse account charge if applicable
  if (sale.customer_id) {
    const acctPmt = await db.prepare("SELECT SUM(amount) as total FROM pos_payments WHERE sale_id = ? AND method = 'account'").bind(id).first<any>()
    if (acctPmt?.total > 0) {
      await db.prepare('UPDATE customer_accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?')
        .bind(acctPmt.total, sale.customer_id).run()
      await db.prepare("INSERT INTO customer_account_transactions (customer_id, transaction_type, amount, description, reference_type, reference_id) VALUES (?, 'adjustment', ?, ?, 'pos_sale', ?)")
        .bind(sale.customer_id, -acctPmt.total, 'Void: ' + sale.sale_number, id).run()
    }
  }

  // Cancel linked transfer if exists
  if (sale.transfer_id) {
    await db.prepare("UPDATE inventory_transfers SET status = 'cancelled' WHERE id = ? AND status = 'pending'")
      .bind(sale.transfer_id).run()
  }

  // Cancel linked order if exists
  if (sale.order_id) {
    await db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ? AND status IN ('new','pending')")
      .bind(sale.order_id).run()
  }

  await db.prepare("UPDATE pos_sales SET status = 'voided', internal_notes = COALESCE(internal_notes, '') || '\nVoided: ' || ? WHERE id = ?")
    .bind(body.reason || 'No reason given', id).run()

  return c.json({ success: true })
})

// ==================== HOLD/PARK SALE ====================
app.put('/api/pos/sales/:id/hold', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json() as any

  await db.prepare("UPDATE pos_sales SET status = 'hold' WHERE id = ?").bind(id).run()
  await db.prepare('INSERT INTO pos_held_sales (sale_id, held_by, held_by_name, reason, customer_name) VALUES (?,?,?,?,?)')
    .bind(id, body.held_by || null, body.held_by_name || '', body.reason || '', body.customer_name || '').run()

  return c.json({ success: true })
})

// ==================== GET HELD SALES ====================
app.get('/api/pos/held', async (c) => {
  const db = c.env.DB
  const locationId = c.req.query('location_id') || ''

  let query = `
    SELECT h.*, s.sale_number, s.subtotal, s.total, s.customer_id,
           (SELECT COUNT(*) FROM pos_sale_items WHERE sale_id = s.id) as item_count,
           c.business_name as customer_business
    FROM pos_held_sales h
    JOIN pos_sales s ON s.id = h.sale_id AND s.status = 'hold'
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE 1=1
  `
  const params: any[] = []
  if (locationId) { query += ' AND s.location_id = ?'; params.push(locationId) }
  query += ' ORDER BY h.held_at DESC'

  const r = await db.prepare(query).bind(...params).all()
  return c.json(r.results)
})

// ==================== RESUME HELD SALE ====================
app.put('/api/pos/sales/:id/resume', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))

  // Release inventory holds before resuming
  const heldItems = await db.prepare('SELECT product_id, quantity, location_id FROM pos_sale_items WHERE sale_id = ?').bind(id).all<any>()
  for (const item of (heldItems.results || [])) {
    await db.prepare(`
      UPDATE inventory_stock SET qty_on_hold = MAX(0, qty_on_hold - ?), updated_at = CURRENT_TIMESTAMP
      WHERE product_id = ? AND location_id = ?
    `).bind(item.quantity, item.product_id, item.location_id).run()

    await db.prepare(`
      INSERT INTO inventory_audit (product_id, location_id, action, qty_change, reason, reference_type, reference_id, notes, user_name)
      VALUES (?, ?, 'hold_release', 0, 'POS held sale resumed — hold released', 'pos_sale', ?, ?, 'system')
    `).bind(item.product_id, item.location_id, id, 'Resumed held sale #' + id).run()
  }

  await db.prepare("UPDATE pos_sales SET status = 'draft' WHERE id = ? AND status = 'hold'").bind(id).run()
  await db.prepare('DELETE FROM pos_held_sales WHERE sale_id = ?').bind(id).run()

  // Return the full sale data
  const sale = await db.prepare('SELECT * FROM pos_sales WHERE id = ?').bind(id).first()
  const items = await db.prepare('SELECT * FROM pos_sale_items WHERE sale_id = ?').bind(id).all()

  return c.json({ sale, items: items.results })
})

// ==================== REFUND ====================
app.post('/api/pos/refunds', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any

  const refundNumber = genRefundNumber()
  const items = body.items || []
  if (items.length === 0) return c.json({ error: 'No items to refund' }, 400)

  let subtotal = 0
  let taxRefunded = 0

  // Insert refund
  const refRes = await db.prepare(`
    INSERT INTO pos_refunds (refund_number, original_sale_id, location_id, customer_id, refund_type, refund_method, reason, notes, restock, processed_by, processed_by_name)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).bind(refundNumber, body.original_sale_id || null, body.location_id || 1, body.customer_id || null,
    body.refund_type || 'return', body.refund_method || 'original', body.reason || '', body.notes || null,
    body.restock !== false ? 1 : 0, body.processed_by || null, body.processed_by_name || '').run()

  const refundId = refRes.meta.last_row_id

  for (const item of items) {
    const lineTotal = (item.unit_price || 0) * (item.quantity || 1)
    subtotal += lineTotal

    await db.prepare(`
      INSERT INTO pos_refund_items (refund_id, sale_item_id, product_id, product_name, quantity, unit_price, line_total, condition, restock)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).bind(refundId, item.sale_item_id || null, item.product_id, item.product_name || '', item.quantity || 1,
      item.unit_price || 0, lineTotal, item.condition || 'good', item.restock !== false ? 1 : 0).run()

    // Restock if applicable
    if (item.restock !== false && body.restock !== false) {
      const locId = body.location_id || 1
      await db.prepare('UPDATE inventory_stock SET qty_on_hand = qty_on_hand + ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND location_id = ?')
        .bind(item.quantity || 1, item.product_id, locId).run()

      await db.prepare(`
        INSERT INTO inventory_audit (product_id, location_id, action, qty_change, reason, reference_type, reference_id, notes, user_name)
        VALUES (?, ?, 'return_restock', ?, 'POS Refund', 'pos_refund', ?, ?, ?)
      `).bind(item.product_id, locId, item.quantity || 1, refundId, 'Refund #' + refundNumber, body.processed_by_name || '').run()
    }
  }

  const total = subtotal + taxRefunded
  await db.prepare('UPDATE pos_refunds SET subtotal = ?, tax_refunded = ?, total = ? WHERE id = ?')
    .bind(subtotal, taxRefunded, total, refundId).run()

  // If original sale was on account, credit the account
  if (body.customer_id && body.refund_method === 'account') {
    await db.prepare('UPDATE customer_accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?')
      .bind(total, body.customer_id).run()
    await db.prepare("INSERT INTO customer_account_transactions (customer_id, transaction_type, amount, description, reference_type, reference_id) VALUES (?, 'refund', ?, ?, 'pos_refund', ?)")
      .bind(body.customer_id, -total, 'Refund #' + refundNumber, refundId).run()
  }

  return c.json({ id: refundId, refund_number: refundNumber, total, items_count: items.length }, 201)
})

// ==================== CUSTOMER ACCOUNT: Make Payment ====================
app.post('/api/pos/account-payment', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any

  if (!body.customer_id || !body.amount) return c.json({ error: 'customer_id and amount required' }, 400)

  await db.prepare(`
    INSERT INTO customer_accounts (customer_id, balance, last_payment_date, last_payment_amount) VALUES (?, -?, DATE('now'), ?)
    ON CONFLICT(customer_id) DO UPDATE SET balance = balance - ?, last_payment_date = DATE('now'), last_payment_amount = ?, updated_at = CURRENT_TIMESTAMP
  `).bind(body.customer_id, body.amount, body.amount, body.amount, body.amount).run()

  await db.prepare(`
    INSERT INTO customer_account_transactions (customer_id, transaction_type, amount, description, processed_by)
    VALUES (?, 'payment', ?, ?, ?)
  `).bind(body.customer_id, -body.amount, body.description || 'Account payment - ' + (body.method || 'cash'), body.processed_by || null).run()

  const acct = await db.prepare('SELECT balance FROM customer_accounts WHERE customer_id = ?').bind(body.customer_id).first<any>()

  return c.json({ success: true, new_balance: acct?.balance || 0 })
})

// ==================== POS DASHBOARD STATS ====================
app.get('/api/pos/dashboard', async (c) => {
  const db = c.env.DB
  const locationId = c.req.query('location_id') || ''
  const today = new Date().toISOString().slice(0, 10)

  let locFilter = ''
  const params: any[] = [today]
  if (locationId) { locFilter = ' AND s.location_id = ?'; params.push(locationId) }

  const todayStats = await db.prepare(`
    SELECT COUNT(*) as transactions,
           COALESCE(SUM(total), 0) as revenue,
           COALESCE(SUM(CASE WHEN sale_type = 'walk_in' THEN total ELSE 0 END), 0) as walk_in_revenue,
           COALESCE(SUM(CASE WHEN sale_type = 'delivery' THEN total ELSE 0 END), 0) as delivery_revenue,
           COALESCE(SUM(CASE WHEN sale_type = 'wholesale' THEN total ELSE 0 END), 0) as wholesale_revenue,
           COALESCE(SUM(CASE WHEN fulfillment_type = 'reserve_retail' THEN total ELSE 0 END), 0) as transfer_revenue,
           COALESCE(SUM(CASE WHEN fulfillment_type = 'dc_pickup' THEN total ELSE 0 END), 0) as dc_pickup_revenue,
           COALESCE(AVG(total), 0) as avg_transaction
    FROM pos_sales s WHERE DATE(s.created_at) = ? AND s.status = 'completed' ${locFilter}
  `).bind(...params).first<any>()

  // Payment method breakdown
  const paymentBreakdown = await db.prepare(`
    SELECT p.method, SUM(p.amount) as total, COUNT(*) as count
    FROM pos_payments p
    JOIN pos_sales s ON s.id = p.sale_id
    WHERE DATE(s.created_at) = ? AND s.status = 'completed' ${locFilter}
    GROUP BY p.method
  `).bind(...params).all()

  // Top products today
  const topProducts = await db.prepare(`
    SELECT si.product_name, SUM(si.quantity) as qty, SUM(si.line_total) as revenue
    FROM pos_sale_items si
    JOIN pos_sales s ON s.id = si.sale_id
    WHERE DATE(s.created_at) = ? AND s.status = 'completed' ${locFilter}
    GROUP BY si.product_id ORDER BY revenue DESC LIMIT 10
  `).bind(...params).all()

  // Held sales count
  const heldCount = await db.prepare(`
    SELECT COUNT(*) as cnt FROM pos_sales s WHERE s.status = 'hold' ${locFilter}
  `).bind(...(locationId ? [locationId] : [])).first<any>()

  // Low stock warnings (< reorder point)
  const lowStockParams: any[] = locationId ? [locationId] : []
  const lowStock = await db.prepare(`
    SELECT p.name, p.id, s.qty_available, s.reorder_point, l.name as location
    FROM inventory_stock s
    JOIN products p ON p.id = s.product_id
    JOIN locations l ON l.id = s.location_id
    WHERE p.active = 1 AND s.qty_available <= s.reorder_point AND s.reorder_point > 0
    ${locationId ? 'AND s.location_id = ?' : ''}
    ORDER BY s.qty_available ASC LIMIT 20
  `).bind(...lowStockParams).all()

  // Pending transfers for this location
  const pendingTransfers = await db.prepare(`
    SELECT t.*, 
           fl.name as from_location_name, tl.name as to_location_name,
           (SELECT COUNT(*) FROM inventory_transfer_items WHERE transfer_id = t.id) as item_count
    FROM inventory_transfers t
    LEFT JOIN locations fl ON fl.id = t.from_location_id
    LEFT JOIN locations tl ON tl.id = t.to_location_id
    WHERE t.status IN ('pending','in_transit')
    ${locationId ? 'AND (t.from_location_id = ? OR t.to_location_id = ?)' : ''}
    ORDER BY t.created_at DESC LIMIT 10
  `).bind(...(locationId ? [locationId, locationId] : [])).all()

  return c.json({
    today: todayStats,
    paymentBreakdown: paymentBreakdown.results,
    topProducts: topProducts.results,
    heldCount: heldCount?.cnt || 0,
    lowStock: lowStock.results,
    pendingTransfers: pendingTransfers.results
  })
})

// ==================== LOCATIONS (for POS location picker) ====================
app.get('/api/pos/locations', async (c) => {
  const db = c.env.DB
  const r = await db.prepare('SELECT id, name, code, type FROM locations WHERE active = 1 ORDER BY name').all()
  return c.json(r.results)
})

// ==================== USERS LIST (for salesperson picker) ====================
app.get('/api/pos/users', async (c) => {
  const db = c.env.DB
  const r = await db.prepare('SELECT id, name, role FROM users WHERE active = 1 ORDER BY name').all()
  return c.json(r.results)
})

// ==================== CUSTOMER MANAGEMENT (full CRUD) ====================

// List customers with pagination + filters
app.get('/api/pos/customer-list', async (c) => {
  const db = c.env.DB
  const search = c.req.query('search') || ''
  const tag = c.req.query('tag') || ''
  const type = c.req.query('type') || ''
  const salesperson = c.req.query('salesperson_id') || ''
  const page = parseInt(c.req.query('page') || '1')
  const limit = parseInt(c.req.query('limit') || '50')
  const offset = (page - 1) * limit

  let where = 'WHERE c.active = 1'
  const params: any[] = []

  if (search) {
    where += ' AND (c.business_name LIKE ? OR c.contact_name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)'
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
  }
  if (tag) {
    where += ' AND c.tags LIKE ?'
    params.push(`%${tag}%`)
  }
  if (type) {
    where += ' AND c.customer_type = ?'
    params.push(type)
  }
  if (salesperson) {
    where += ' AND c.salesperson_id = ?'
    params.push(salesperson)
  }

  const countR = await db.prepare(`SELECT COUNT(*) as total FROM customers c ${where}`).bind(...params).first<any>()
  const total = countR?.total || 0

  const query = `
    SELECT c.*, COALESCE(loc.name, '') as location_name,
           ca.balance as account_balance, ca.credit_limit,
           (SELECT COUNT(*) FROM orders WHERE customer_id = c.id AND status NOT IN ('cancelled')) as order_count,
           (SELECT COUNT(*) FROM pos_sales WHERE customer_id = c.id AND status = 'completed') as sale_count,
           (SELECT COALESCE(SUM(total), 0) FROM pos_sales WHERE customer_id = c.id AND status = 'completed') as total_spent,
           (SELECT GROUP_CONCAT(label || ': ' || street || ', ' || city || ' ' || state || ' ' || zip, ' | ')
            FROM addresses WHERE customer_id = c.id) as address_summary
    FROM customers c
    LEFT JOIN locations loc ON loc.id = c.location_id
    LEFT JOIN customer_accounts ca ON ca.customer_id = c.id
    ${where}
    ORDER BY c.business_name ASC
    LIMIT ? OFFSET ?
  `
  params.push(limit, offset)

  const r = await db.prepare(query).bind(...params).all()
  return c.json({ customers: r.results, total, page, limit, pages: Math.ceil(total / limit) })
})

// Get all distinct tags across customers
app.get('/api/pos/customer-tags', async (c) => {
  const db = c.env.DB
  const r = await db.prepare("SELECT tags FROM customers WHERE tags IS NOT NULL AND tags != '' AND active = 1").all()
  const tagSet = new Set<string>()
  for (const row of r.results as any[]) {
    if (row.tags) {
      row.tags.split(',').forEach((t: string) => {
        const trimmed = t.trim()
        if (trimmed) tagSet.add(trimmed)
      })
    }
  }
  return c.json(Array.from(tagSet).sort())
})

// Create customer
app.post('/api/pos/customer-manage', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any

  if (!body.business_name && !body.contact_name) {
    return c.json({ error: 'Business name or contact name required' }, 400)
  }

  const r = await db.prepare(`
    INSERT INTO customers (business_name, contact_name, phone, email, customer_type, notes, tax_exempt, sponsor_discount, priority_rank, location_id, tags, salesperson_id, salesperson_name)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    body.business_name || '', body.contact_name || '', body.phone || '', body.email || '',
    body.customer_type || 'other', body.notes || '', body.tax_exempt ? 1 : 0,
    body.sponsor_discount || 0, body.priority_rank || 0,
    body.location_id || null, body.tags || '', body.salesperson_id || null, body.salesperson_name || ''
  ).run()

  return c.json({ id: r.meta.last_row_id, success: true }, 201)
})

// Update customer
app.put('/api/pos/customer-manage/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json() as any

  const existing = await db.prepare('SELECT id FROM customers WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ error: 'Customer not found' }, 404)

  await db.prepare(`
    UPDATE customers SET
      business_name = ?, contact_name = ?, phone = ?, email = ?,
      customer_type = ?, notes = ?, tax_exempt = ?, sponsor_discount = ?,
      discount_fixed = ?, priority_rank = ?, location_id = ?, tags = ?,
      salesperson_id = ?, salesperson_name = ?,
      sms_opt_in = ?, sms_phone = ?, delivery_notes_default = ?,
      is_seasonal = ?, season_status = ?,
      season_start_month = ?, season_start_day = ?,
      season_end_month = ?, season_end_day = ?, season_notes = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    body.business_name || '', body.contact_name || '', body.phone || '', body.email || '',
    body.customer_type || 'other', body.notes || '', body.tax_exempt ? 1 : 0,
    body.sponsor_discount || 0, body.discount_fixed || 0,
    body.priority_rank || 0, body.location_id || null, body.tags || '',
    body.salesperson_id || null, body.salesperson_name || '',
    body.sms_opt_in !== undefined ? (body.sms_opt_in ? 1 : 0) : 1,
    body.sms_phone ?? null, body.delivery_notes_default ?? null,
    body.is_seasonal ? 1 : 0, body.season_status || 'unknown',
    body.season_start_month ?? null, body.season_start_day ?? null,
    body.season_end_month ?? null, body.season_end_day ?? null, body.season_notes ?? null,
    id
  ).run()

  // Update account terms if provided
  if (body.payment_terms || body.credit_limit !== undefined) {
    const acctFields: string[] = []
    const acctVals: any[] = []
    if (body.payment_terms) { acctFields.push('payment_terms = ?'); acctVals.push(body.payment_terms) }
    if (body.credit_limit !== undefined) { acctFields.push('credit_limit = ?'); acctVals.push(body.credit_limit) }
    if (acctFields.length > 0) {
      acctFields.push('updated_at = CURRENT_TIMESTAMP')
      acctVals.push(id)
      await db.prepare('INSERT INTO customer_accounts (customer_id) VALUES (?) ON CONFLICT(customer_id) DO NOTHING').bind(id).run()
      await db.prepare(`UPDATE customer_accounts SET ${acctFields.join(', ')} WHERE customer_id = ?`).bind(...acctVals).run()
    }
  }

  return c.json({ success: true })
})

// Soft-delete customer (set active = 0)
app.delete('/api/pos/customer-manage/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  await db.prepare('UPDATE customers SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ==================== ADDRESS MANAGEMENT ====================
app.get('/api/pos/customer-addresses/:customerId', async (c) => {
  const db = c.env.DB
  const customerId = parseInt(c.req.param('customerId'))
  const r = await db.prepare('SELECT * FROM addresses WHERE customer_id = ? ORDER BY is_primary DESC, id DESC').bind(customerId).all()
  return c.json(r.results)
})

app.post('/api/pos/customer-addresses/:customerId', async (c) => {
  const db = c.env.DB
  const customerId = parseInt(c.req.param('customerId'))
  const body = await c.req.json() as any

  // If this is marked primary, unset any other primary
  if (body.is_primary) {
    await db.prepare('UPDATE addresses SET is_primary = 0 WHERE customer_id = ?').bind(customerId).run()
  }

  const r = await db.prepare(`
    INSERT INTO addresses (customer_id, label, street, city, state, zip, gate_code, driver_notes, is_primary, zone_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(
    customerId, body.label || '', body.street || '', body.city || '', body.state || '', body.zip || '',
    body.gate_code || '', body.driver_notes || '', body.is_primary ? 1 : 0, body.zone_id || null
  ).run()

  return c.json({ id: r.meta.last_row_id, success: true }, 201)
})

app.put('/api/pos/customer-addresses/:customerId/:addrId', async (c) => {
  const db = c.env.DB
  const customerId = parseInt(c.req.param('customerId'))
  const addrId = parseInt(c.req.param('addrId'))
  const body = await c.req.json() as any

  if (body.is_primary) {
    await db.prepare('UPDATE addresses SET is_primary = 0 WHERE customer_id = ?').bind(customerId).run()
  }

  await db.prepare(`
    UPDATE addresses SET label = ?, street = ?, city = ?, state = ?, zip = ?,
      gate_code = ?, driver_notes = ?, is_primary = ?, zone_id = ?
    WHERE id = ? AND customer_id = ?
  `).bind(
    body.label || '', body.street || '', body.city || '', body.state || '', body.zip || '',
    body.gate_code || '', body.driver_notes || '', body.is_primary ? 1 : 0, body.zone_id || null,
    addrId, customerId
  ).run()

  return c.json({ success: true })
})

app.delete('/api/pos/customer-addresses/:customerId/:addrId', async (c) => {
  const db = c.env.DB
  const customerId = parseInt(c.req.param('customerId'))
  const addrId = parseInt(c.req.param('addrId'))
  await db.prepare('DELETE FROM addresses WHERE id = ? AND customer_id = ?').bind(addrId, customerId).run()
  return c.json({ success: true })
})

// ==================== STOCK CHECK (cross-location inventory popup) ====================
app.get('/api/pos/stock-check/:productId', async (c) => {
  const db = c.env.DB
  const productId = parseInt(c.req.param('productId'))

  const product = await db.prepare('SELECT id, name, sku, category, price FROM products WHERE id = ?').bind(productId).first()
  if (!product) return c.json({ error: 'Product not found' }, 404)

  const stock = await db.prepare(`
    SELECT s.location_id, l.name as location_name, l.code as location_code, l.type as location_type,
           s.qty_on_hand, s.qty_available, s.qty_on_hold, s.qty_reserved, s.reorder_point
    FROM inventory_stock s
    JOIN locations l ON l.id = s.location_id
    WHERE s.product_id = ? AND l.active = 1
    ORDER BY l.name
  `).bind(productId).all()

  // Pending reservations for this product
  const reservations = await db.prepare(`
    SELECT r.*, fl.name as from_name, tl.name as to_name
    FROM pos_stock_reservations r
    JOIN locations fl ON fl.id = r.from_location_id
    JOIN locations tl ON tl.id = r.to_location_id
    WHERE r.product_id = ? AND r.status IN ('pending','confirmed')
    ORDER BY r.created_at DESC
  `).bind(productId).all()

  return c.json({ product, stock: stock.results, reservations: reservations.results })
})

// Reserve stock for transfer
app.post('/api/pos/stock-reserve', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any

  if (!body.product_id || !body.from_location_id || !body.to_location_id || !body.quantity) {
    return c.json({ error: 'product_id, from_location_id, to_location_id, and quantity required' }, 400)
  }

  // Check available stock at source
  const stock = await db.prepare('SELECT qty_available FROM inventory_stock WHERE product_id = ? AND location_id = ?')
    .bind(body.product_id, body.from_location_id).first<any>()

  if (!stock || stock.qty_available < body.quantity) {
    return c.json({ error: `Insufficient stock. Available: ${stock?.qty_available || 0}` }, 400)
  }

  // Create reservation
  const res = await db.prepare(`
    INSERT INTO pos_stock_reservations (product_id, from_location_id, to_location_id, quantity, status, requested_by, requested_by_name, notes)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(body.product_id, body.from_location_id, body.to_location_id, body.quantity,
    'pending', body.requested_by || null, body.requested_by_name || '', body.notes || '').run()

  // Update reserved qty
  await db.prepare('UPDATE inventory_stock SET qty_reserved = qty_reserved + ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND location_id = ?')
    .bind(body.quantity, body.product_id, body.from_location_id).run()

  // Create transfer request
  const transferNumber = genTransferNumber()
  const tRes = await db.prepare(`
    INSERT INTO inventory_transfers (transfer_number, from_location_id, to_location_id, status, notes, created_by)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `).bind(transferNumber, body.from_location_id, body.to_location_id,
    'Stock reservation from POS' + (body.notes ? ' — ' + body.notes : ''), body.requested_by || null).run()

  const transferId = tRes.meta.last_row_id
  await db.prepare('INSERT INTO inventory_transfer_items (transfer_id, product_id, qty_requested) VALUES (?,?,?)')
    .bind(transferId, body.product_id, body.quantity).run()

  // Link reservation to transfer
  await db.prepare('UPDATE pos_stock_reservations SET transfer_id = ?, status = ? WHERE id = ?')
    .bind(transferId, 'confirmed', res.meta.last_row_id).run()

  return c.json({ id: res.meta.last_row_id, transfer_id: transferId, transfer_number: transferNumber }, 201)
})

// ==================== CUSTOMER MERGE ====================
app.post('/api/pos/customer-merge', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any
  const keepId = parseInt(body.keep_id)
  const mergeId = parseInt(body.merge_id)

  if (!keepId || !mergeId || keepId === mergeId) {
    return c.json({ error: 'keep_id and merge_id required (must be different)' }, 400)
  }

  const keep = await db.prepare('SELECT * FROM customers WHERE id = ?').bind(keepId).first()
  const merge = await db.prepare('SELECT * FROM customers WHERE id = ?').bind(mergeId).first()
  if (!keep || !merge) return c.json({ error: 'One or both customers not found' }, 404)

  // Move all related records from merge → keep (each wrapped to handle missing tables)
  const safeMerge = async (sql: string, ...binds: any[]) => {
    try { await db.prepare(sql).bind(...binds).run() } catch (e) { /* table may not exist */ }
  }
  await safeMerge('UPDATE addresses SET customer_id = ? WHERE customer_id = ?', keepId, mergeId)
  await safeMerge('UPDATE orders SET customer_id = ? WHERE customer_id = ?', keepId, mergeId)
  await safeMerge('UPDATE pos_sales SET customer_id = ? WHERE customer_id = ?', keepId, mergeId)
  await safeMerge('UPDATE pos_refunds SET customer_id = ? WHERE customer_id = ?', keepId, mergeId)
  await safeMerge('UPDATE pos_price_rules SET customer_id = ? WHERE customer_id = ?', keepId, mergeId)
  await safeMerge('UPDATE customer_account_transactions SET customer_id = ? WHERE customer_id = ?', keepId, mergeId)
  await safeMerge('UPDATE pos_payment_tokens SET customer_id = ? WHERE customer_id = ?', keepId, mergeId)
  await safeMerge('UPDATE pos_stock_reservations SET requested_by = ? WHERE requested_by = ?', keepId, mergeId)
  await safeMerge('UPDATE recurring_schedules SET customer_id = ? WHERE customer_id = ?', keepId, mergeId)
  await safeMerge('UPDATE standing_orders SET customer_id = ? WHERE customer_id = ?', keepId, mergeId)
  await safeMerge('UPDATE returns SET customer_id = ? WHERE customer_id = ?', keepId, mergeId)

  // Merge account balances
  try {
    const mergeAcct = await db.prepare('SELECT * FROM customer_accounts WHERE customer_id = ?').bind(mergeId).first<any>()
    if (mergeAcct) {
      const keepAcct = await db.prepare('SELECT * FROM customer_accounts WHERE customer_id = ?').bind(keepId).first<any>()
      if (keepAcct) {
        await db.prepare('UPDATE customer_accounts SET balance = balance + ?, credit_limit = MAX(credit_limit, ?), updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?')
          .bind(mergeAcct.balance || 0, mergeAcct.credit_limit || 0, keepId).run()
        await db.prepare('DELETE FROM customer_accounts WHERE customer_id = ?').bind(mergeId).run()
      } else {
        await db.prepare('UPDATE customer_accounts SET customer_id = ? WHERE customer_id = ?').bind(keepId, mergeId).run()
      }
    }
  } catch (e) { /* customer_accounts may not exist */ }

  // CRM orgs
  await safeMerge('UPDATE crm_organizations SET customer_id = ? WHERE customer_id = ?', keepId, mergeId)

  // Merge tags (combine unique tags)
  const keepTags = ((keep as any).tags || '').split(',').map((t: string) => t.trim()).filter((t: string) => t)
  const mergeTags = ((merge as any).tags || '').split(',').map((t: string) => t.trim()).filter((t: string) => t)
  const allTags = Array.from(new Set([...keepTags, ...mergeTags]))
  await db.prepare('UPDATE customers SET tags = ? WHERE id = ?').bind(allTags.join(', '), keepId).run()

  // Append merge notes
  const mergeNote = `[Merged from: ${(merge as any).business_name || (merge as any).contact_name} (ID:${mergeId}) on ${new Date().toISOString().slice(0,10)}]`
  await db.prepare("UPDATE customers SET notes = COALESCE(notes, '') || '\n' || ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(mergeNote, keepId).run()

  // Deactivate merged customer
  await db.prepare('UPDATE customers SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(mergeId).run()

  return c.json({ success: true, kept: keepId, merged: mergeId })
})

// ==================== ORDER DETAIL (from customer page) ====================
app.get('/api/pos/order-detail/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const type = c.req.query('type') || 'order' // 'order' or 'sale'

  if (type === 'sale') {
    const sale = await db.prepare(`
      SELECT ps.*, l.name as location_name, o.order_number
      FROM pos_sales ps
      LEFT JOIN locations l ON ps.location_id = l.id
      LEFT JOIN orders o ON ps.order_id = o.id
      WHERE ps.id = ?
    `).bind(id).first()
    if (!sale) return c.json({ error: 'Sale not found' }, 404)
    const items = await db.prepare(`
      SELECT psi.*, p.name as product_name
      FROM pos_sale_items psi
      LEFT JOIN products p ON p.id = psi.product_id
      WHERE psi.sale_id = ? ORDER BY psi.id
    `).bind(id).all()
    const payments = await db.prepare('SELECT * FROM pos_payments WHERE sale_id = ? ORDER BY id').bind(id).all()
    const customer = (sale as any).customer_id
      ? await db.prepare('SELECT id, business_name, contact_name, phone, email FROM customers WHERE id = ?').bind((sale as any).customer_id).first()
      : null
    let transfer = null
    if ((sale as any).transfer_id) {
      transfer = await db.prepare('SELECT * FROM inventory_transfers WHERE id = ?').bind((sale as any).transfer_id).first()
    }
    const refunds = await db.prepare(`
      SELECT r.*, GROUP_CONCAT(ri.product_name || ' x' || CAST(ri.quantity AS INTEGER), ', ') as refund_items
      FROM pos_refunds r
      LEFT JOIN pos_refund_items ri ON ri.refund_id = r.id
      WHERE r.original_sale_id = ?
      GROUP BY r.id
    `).bind(id).all()
    return c.json({ type: 'sale', sale, items: items.results, payments: payments.results, customer, transfer, refunds: refunds.results })
  } else {
    const order = await db.prepare(`
      SELECT o.*, c.business_name, c.contact_name, c.phone,
             a.street, a.city, a.state, a.zip, a.gate_code, a.driver_notes as addr_driver_notes,
             l.name as route_name
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN addresses a ON a.id = o.address_id
      LEFT JOIN routes l ON l.id = o.route_id
      WHERE o.id = ?
    `).bind(id).first()
    if (!order) return c.json({ error: 'Order not found' }, 404)
    const items = await db.prepare(`
      SELECT oi.*, p.name as product_name, p.sku, p.price as list_price
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
    `).bind(id).all()
    return c.json({ type: 'order', order, items: items.results })
  }
})

// ==================== CUSTOMER DISCOUNTS (manage price rules) ====================
app.get('/api/pos/customer-discounts/:customerId', async (c) => {
  const db = c.env.DB
  const customerId = parseInt(c.req.param('customerId'))
  const rules = await db.prepare(`
    SELECT pr.*, p.name as product_name, p.sku
    FROM pos_price_rules pr
    LEFT JOIN products p ON p.id = pr.product_id
    WHERE pr.customer_id = ? AND pr.active = 1
    ORDER BY pr.rule_type, pr.name
  `).bind(customerId).all()
  return c.json(rules.results)
})

app.post('/api/pos/customer-discounts/:customerId', async (c) => {
  const db = c.env.DB
  const customerId = parseInt(c.req.param('customerId'))
  const body = await c.req.json() as any

  const r = await db.prepare(`
    INSERT INTO pos_price_rules (name, rule_type, customer_id, product_id, category, min_qty, price, discount_pct, start_date, end_date, active, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,1,?)
  `).bind(
    body.name || 'Custom Price', body.rule_type || 'customer_price', customerId,
    body.product_id || null, body.category || null, body.min_qty || 0,
    body.price || null, body.discount_pct || null,
    body.start_date || null, body.end_date || null, body.created_by || null
  ).run()
  return c.json({ id: r.meta.last_row_id, success: true }, 201)
})

app.put('/api/pos/customer-discounts/:customerId/:ruleId', async (c) => {
  const db = c.env.DB
  const customerId = parseInt(c.req.param('customerId'))
  const ruleId = parseInt(c.req.param('ruleId'))
  const body = await c.req.json() as any

  await db.prepare(`
    UPDATE pos_price_rules SET name=?, rule_type=?, product_id=?, category=?, min_qty=?, price=?, discount_pct=?, start_date=?, end_date=?
    WHERE id = ? AND customer_id = ?
  `).bind(
    body.name || 'Custom Price', body.rule_type || 'customer_price',
    body.product_id || null, body.category || null, body.min_qty || 0,
    body.price || null, body.discount_pct || null,
    body.start_date || null, body.end_date || null, ruleId, customerId
  ).run()
  return c.json({ success: true })
})

app.delete('/api/pos/customer-discounts/:customerId/:ruleId', async (c) => {
  const db = c.env.DB
  const ruleId = parseInt(c.req.param('ruleId'))
  await db.prepare('UPDATE pos_price_rules SET active = 0 WHERE id = ?').bind(ruleId).run()
  return c.json({ success: true })
})

// ==================== TAX CONFIGURATION ====================
app.get('/api/pos/tax-config', async (c) => {
  const db = c.env.DB
  const locationId = c.req.query('location_id') || ''
  let query = `
    SELECT tc.*, l.name as location_name, p.name as product_name
    FROM pos_tax_config tc
    LEFT JOIN locations l ON l.id = tc.location_id
    LEFT JOIN products p ON p.id = tc.product_id
    WHERE tc.active = 1
  `
  const params: any[] = []
  if (locationId) { query += ' AND (tc.location_id = ? OR tc.location_id IS NULL)'; params.push(locationId) }
  query += ' ORDER BY tc.priority DESC, tc.name'
  const r = await db.prepare(query).bind(...params).all()
  return c.json(r.results)
})

app.post('/api/pos/tax-config', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any
  const r = await db.prepare(`
    INSERT INTO pos_tax_config (name, tax_type, rate, location_id, category, product_id, priority, notes)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(body.name, body.tax_type || 'sales_tax', body.rate || 0,
    body.location_id || null, body.category || null, body.product_id || null,
    body.priority || 0, body.notes || '').run()
  return c.json({ id: r.meta.last_row_id, success: true }, 201)
})

app.put('/api/pos/tax-config/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json() as any
  await db.prepare(`
    UPDATE pos_tax_config SET name=?, tax_type=?, rate=?, location_id=?, category=?, product_id=?, priority=?, notes=?
    WHERE id = ?
  `).bind(body.name, body.tax_type || 'sales_tax', body.rate || 0,
    body.location_id || null, body.category || null, body.product_id || null,
    body.priority || 0, body.notes || '', id).run()
  return c.json({ success: true })
})

app.delete('/api/pos/tax-config/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  await db.prepare('UPDATE pos_tax_config SET active = 0 WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// Effective tax rate lookup (used at POS checkout)
app.get('/api/pos/effective-tax', async (c) => {
  const db = c.env.DB
  const locationId = c.req.query('location_id') || ''
  const productId = c.req.query('product_id') || ''
  const category = c.req.query('category') || ''
  const customerId = c.req.query('customer_id') || ''

  // Check customer tax exemption or custom rate
  if (customerId) {
    const cust = await db.prepare('SELECT tax_exempt, custom_tax_rate FROM customers WHERE id = ?').bind(customerId).first<any>()
    if (cust?.tax_exempt) return c.json({ rate: 0, source: 'tax_exempt' })
    if (cust?.custom_tax_rate !== null && cust?.custom_tax_rate !== undefined) {
      return c.json({ rate: cust.custom_tax_rate, source: 'customer_custom' })
    }
  }

  // Highest priority matching tax config
  const configs = await db.prepare(`
    SELECT * FROM pos_tax_config WHERE active = 1
    ORDER BY priority DESC
  `).all()

  for (const cfg of configs.results as any[]) {
    // Product-specific match (highest priority)
    if (cfg.product_id && productId && cfg.product_id == productId) {
      if (!cfg.location_id || cfg.location_id == locationId) {
        return c.json({ rate: cfg.rate, source: 'product_config', config_id: cfg.id })
      }
    }
    // Category match
    if (cfg.category && category && cfg.category === category) {
      if (!cfg.location_id || cfg.location_id == locationId) {
        return c.json({ rate: cfg.rate, source: 'category_config', config_id: cfg.id })
      }
    }
    // Location-only match
    if (!cfg.product_id && !cfg.category && cfg.location_id && cfg.location_id == locationId) {
      return c.json({ rate: cfg.rate, source: 'location_config', config_id: cfg.id })
    }
    // Global default
    if (!cfg.product_id && !cfg.category && !cfg.location_id) {
      return c.json({ rate: cfg.rate, source: 'global_config', config_id: cfg.id })
    }
  }

  // Fall back to product's own tax_rate
  if (productId) {
    const p = await db.prepare('SELECT tax_rate FROM products WHERE id = ?').bind(productId).first<any>()
    if (p) return c.json({ rate: p.tax_rate || 0, source: 'product_default' })
  }

  return c.json({ rate: 0, source: 'none' })
})

// ==================== PROMOTIONS CRUD ====================
app.get('/api/pos/promotions', async (c) => {
  const db = c.env.DB
  const activeOnly = c.req.query('active') !== '0'
  const locationId = c.req.query('location_id') || ''

  let query = 'SELECT * FROM pos_promotions WHERE 1=1'
  const params: any[] = []
  if (activeOnly) { query += ' AND active = 1' }
  if (locationId) { query += ' AND (location_id = ? OR location_id IS NULL)'; params.push(locationId) }
  query += ' ORDER BY created_at DESC'

  const r = await db.prepare(query).bind(...params).all()
  return c.json(r.results)
})

app.post('/api/pos/promotions', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any

  if (!body.name || !body.promo_type) return c.json({ error: 'name and promo_type required' }, 400)

  const r = await db.prepare(`
    INSERT INTO pos_promotions (name, code, promo_type, scope, discount_pct, discount_amount, flat_price,
      buy_qty, get_qty, product_id, category, customer_type, min_purchase, max_discount,
      start_date, end_date, days_of_week, usage_limit, per_customer_limit, stackable, location_id, active, created_by, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    body.name, body.code || null, body.promo_type, body.scope || 'cart',
    body.discount_pct || 0, body.discount_amount || 0, body.flat_price || null,
    body.buy_qty || 0, body.get_qty || 0, body.product_id || null,
    body.category || null, body.customer_type || null,
    body.min_purchase || 0, body.max_discount || null,
    body.start_date || null, body.end_date || null, body.days_of_week || null,
    body.usage_limit || 0, body.per_customer_limit || 0, body.stackable ? 1 : 0,
    body.location_id || null, 1, body.created_by || null, body.notes || ''
  ).run()
  return c.json({ id: r.meta.last_row_id, success: true }, 201)
})

app.put('/api/pos/promotions/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json() as any

  await db.prepare(`
    UPDATE pos_promotions SET name=?, code=?, promo_type=?, scope=?, discount_pct=?, discount_amount=?,
      flat_price=?, buy_qty=?, get_qty=?, product_id=?, category=?, customer_type=?,
      min_purchase=?, max_discount=?, start_date=?, end_date=?, days_of_week=?,
      usage_limit=?, per_customer_limit=?, stackable=?, location_id=?, active=?, notes=?
    WHERE id = ?
  `).bind(
    body.name, body.code || null, body.promo_type, body.scope || 'cart',
    body.discount_pct || 0, body.discount_amount || 0, body.flat_price || null,
    body.buy_qty || 0, body.get_qty || 0, body.product_id || null,
    body.category || null, body.customer_type || null,
    body.min_purchase || 0, body.max_discount || null,
    body.start_date || null, body.end_date || null, body.days_of_week || null,
    body.usage_limit || 0, body.per_customer_limit || 0, body.stackable ? 1 : 0,
    body.location_id || null, body.active !== false ? 1 : 0, body.notes || '', id
  ).run()
  return c.json({ success: true })
})

app.delete('/api/pos/promotions/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  await db.prepare('UPDATE pos_promotions SET active = 0 WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// Get applicable promotions for current cart
app.post('/api/pos/promotions/check', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any
  const locationId = body.location_id || 1
  const customerId = body.customer_id
  const items = body.items || []
  const today = new Date().toISOString().slice(0, 10)
  const dayOfWeek = new Date().getDay().toString()

  const promos = await db.prepare(`
    SELECT * FROM pos_promotions
    WHERE active = 1
      AND (start_date IS NULL OR start_date <= ?)
      AND (end_date IS NULL OR end_date >= ?)
      AND (location_id IS NULL OR location_id = ?)
      AND (usage_limit = 0 OR usage_count < usage_limit)
  `).bind(today, today, locationId).all()

  const applicable: any[] = []
  const cartTotal = items.reduce((s: number, i: any) => s + (i.unit_price || 0) * (i.quantity || 1), 0)

  for (const promo of promos.results as any[]) {
    // Day of week check
    if (promo.days_of_week && !promo.days_of_week.includes(dayOfWeek)) continue

    // Per-customer limit check
    if (promo.per_customer_limit > 0 && customerId) {
      const usage = await db.prepare('SELECT COUNT(*) as cnt FROM pos_promotion_usage WHERE promotion_id = ? AND customer_id = ?')
        .bind(promo.id, customerId).first<any>()
      if (usage && usage.cnt >= promo.per_customer_limit) continue
    }

    // Customer type match
    if (promo.customer_type && customerId) {
      const cust = await db.prepare('SELECT customer_type FROM customers WHERE id = ?').bind(customerId).first<any>()
      if (cust && cust.customer_type !== promo.customer_type) continue
    }

    // Min purchase check
    if (promo.min_purchase > 0 && cartTotal < promo.min_purchase) continue

    // Scope-specific checks
    let matchedItems: any[] = []
    if (promo.scope === 'product' && promo.product_id) {
      matchedItems = items.filter((i: any) => i.product_id == promo.product_id)
      if (matchedItems.length === 0) continue
    } else if (promo.scope === 'category' && promo.category) {
      matchedItems = items.filter((i: any) => i.category === promo.category)
      if (matchedItems.length === 0) continue
    } else {
      matchedItems = items
    }

    // Calculate discount
    let discountValue = 0
    if (promo.promo_type === 'percent_off') {
      const base = matchedItems.reduce((s: number, i: any) => s + (i.unit_price || 0) * (i.quantity || 1), 0)
      discountValue = base * (promo.discount_pct / 100)
    } else if (promo.promo_type === 'dollar_off') {
      discountValue = promo.discount_amount || 0
    } else if (promo.promo_type === 'bogo') {
      const totalQty = matchedItems.reduce((s: number, i: any) => s + (i.quantity || 1), 0)
      const buyQty = promo.buy_qty || 1
      const getQty = promo.get_qty || 1
      const freeItems = Math.floor(totalQty / (buyQty + getQty)) * getQty
      if (freeItems > 0) {
        const cheapest = Math.min(...matchedItems.map((i: any) => i.unit_price || 0))
        discountValue = cheapest * freeItems
      }
    }

    if (promo.max_discount && discountValue > promo.max_discount) discountValue = promo.max_discount
    if (discountValue <= 0 && promo.promo_type !== 'flat_price') continue

    applicable.push({
      id: promo.id, name: promo.name, code: promo.code, promo_type: promo.promo_type,
      scope: promo.scope, discount_value: Math.round(discountValue * 100) / 100,
      discount_pct: promo.discount_pct, discount_amount: promo.discount_amount,
      product_id: promo.product_id, category: promo.category, stackable: promo.stackable
    })
  }

  return c.json(applicable)
})

// ==================== APPLY LINE-LEVEL DISCOUNT ====================
app.post('/api/pos/apply-discount', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any
  // This is a calculation endpoint — doesn't modify DB, just returns adjusted pricing
  // discount_type: 'percent' | 'dollar' | 'override_price'
  // scope: 'line' | 'cart'

  const items = body.items || []
  const discountType = body.discount_type || 'percent'
  const discountValue = parseFloat(body.discount_value || 0)
  const targetProductId = body.product_id // null = cart-wide
  const reason = body.reason || ''

  const adjusted = items.map((item: any) => {
    const isTarget = !targetProductId || item.product_id == targetProductId
    if (!isTarget) return item

    let newPrice = item.unit_price
    let discPct = 0
    let discAmt = 0

    if (discountType === 'percent') {
      discPct = discountValue
      newPrice = item.unit_price * (1 - discountValue / 100)
      discAmt = item.unit_price * item.quantity * (discountValue / 100)
    } else if (discountType === 'dollar') {
      discAmt = discountValue
      newPrice = Math.max(0, item.unit_price - discountValue / item.quantity)
      discPct = item.unit_price > 0 ? (discountValue / (item.unit_price * item.quantity)) * 100 : 0
    } else if (discountType === 'override_price') {
      newPrice = discountValue
      discAmt = (item.unit_price - discountValue) * item.quantity
      discPct = item.unit_price > 0 ? ((item.unit_price - discountValue) / item.unit_price) * 100 : 0
    }

    return {
      ...item,
      effective_price: Math.round(newPrice * 100) / 100,
      discount_pct: Math.round(discPct * 100) / 100,
      discount_amount: Math.round(discAmt * 100) / 100,
      discount_type: discountType,
      discount_source: reason || 'manual',
      price_source: 'manual_discount'
    }
  })

  return c.json(adjusted)
})

// ==================== CANCEL STOCK RESERVATION ====================
app.put('/api/pos/stock-reserve/:id/cancel', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const res = await db.prepare("SELECT * FROM pos_stock_reservations WHERE id = ? AND status IN ('pending','confirmed')").bind(id).first<any>()
  if (!res) return c.json({ error: 'Reservation not found or already resolved' }, 404)

  await db.prepare('UPDATE inventory_stock SET qty_reserved = MAX(0, qty_reserved - ?), updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND location_id = ?')
    .bind(res.quantity, res.product_id, res.from_location_id).run()
  if (res.transfer_id)
    await db.prepare("UPDATE inventory_transfers SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(res.transfer_id).run()
  await db.prepare("UPDATE pos_stock_reservations SET status = 'cancelled', resolved_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run()

  return c.json({ success: true })
})

// ==================== LIST STOCK RESERVATIONS ====================
app.get('/api/pos/stock-reserve/:locationId/pending', async (c) => {
  const db = c.env.DB
  const locationId = parseInt(c.req.param('locationId'))
  const rows = await db.prepare(`
    SELECT r.*, p.name as product_name,
      fl.name as from_location, tl.name as to_location
    FROM pos_stock_reservations r
    LEFT JOIN products p ON p.id = r.product_id
    LEFT JOIN locations fl ON fl.id = r.from_location_id
    LEFT JOIN locations tl ON tl.id = r.to_location_id
    WHERE (r.from_location_id = ? OR r.to_location_id = ?)
    ORDER BY r.created_at DESC LIMIT 50
  `).bind(locationId, locationId).all<any>()
  return c.json(rows.results || [])
})

// ==================== DARTS SYNC STATUS ====================
app.put('/api/pos/darts-sync/:type/:id', async (c) => {
  const db = c.env.DB
  const type = c.req.param('type') // 'sale' or 'order'
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json() as any
  const synced = body.synced ? 1 : 0
  const user = body.user_name || 'Unknown'
  const now = new Date().toISOString()

  if (type === 'sale') {
    await db.prepare('UPDATE pos_sales SET darts_synced = ?, darts_synced_at = ?, darts_synced_by = ? WHERE id = ?')
      .bind(synced, synced ? now : null, synced ? user : null, id).run()
  } else if (type === 'order') {
    await db.prepare('UPDATE orders SET darts_synced = ?, darts_synced_at = ?, darts_synced_by = ? WHERE id = ?')
      .bind(synced, synced ? now : null, synced ? user : null, id).run()
  } else {
    return c.json({ error: 'Invalid type' }, 400)
  }
  return c.json({ success: true, synced })
})

// ==================== POS INVENTORY REQUESTS ====================

// Create inventory request from POS
app.post('/api/pos/inventory-request', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any

  if (!body.items || body.items.length === 0) return c.json({ error: 'At least one item required' }, 400)
  if (!body.location_id) return c.json({ error: 'Location required' }, 400)

  const num = 'PIR-' + Date.now().toString(36).toUpperCase()

  const r = await db.prepare(`
    INSERT INTO pos_inventory_requests (request_number, location_id, urgency, requested_by, requested_by_name, reason, notes, customer_id, customer_name, notify_customer)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(num, body.location_id, body.urgency || 'normal', body.requested_by || null, body.requested_by_name || '', body.reason || '', body.notes || '',
    body.customer_id || null, body.customer_name || null, body.notify_customer ? 1 : 0).run()

  const reqId = r.meta.last_row_id

  for (const item of body.items) {
    await db.prepare(`
      INSERT INTO pos_inventory_request_items (request_id, product_id, product_name, qty_requested, current_stock, reorder_point, unit, notes)
      VALUES (?,?,?,?,?,?,?,?)
    `).bind(reqId, item.product_id, item.product_name || '', item.qty_requested || 1, item.current_stock || 0, item.reorder_point || 0, item.unit || 'each', item.notes || '').run()
  }

  return c.json({ id: reqId, request_number: num, success: true }, 201)
})

// List inventory requests
app.get('/api/pos/inventory-requests', async (c) => {
  const db = c.env.DB
  const locationId = c.req.query('location_id') || ''
  const status = c.req.query('status') || ''

  let where = 'WHERE 1=1'
  const params: any[] = []
  if (locationId) { where += ' AND r.location_id = ?'; params.push(locationId) }
  if (status) { where += ' AND r.status = ?'; params.push(status) }

  const rows = await db.prepare(`
    SELECT r.*, l.name as location_name,
           (SELECT COUNT(*) FROM pos_inventory_request_items WHERE request_id = r.id) as item_count,
           (SELECT SUM(qty_requested) FROM pos_inventory_request_items WHERE request_id = r.id) as total_qty
    FROM pos_inventory_requests r
    LEFT JOIN locations l ON l.id = r.location_id
    ${where}
    ORDER BY CASE r.urgency WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, r.created_at DESC
    LIMIT 100
  `).bind(...params).all<any>()

  return c.json(rows.results || [])
})

// Get inventory request detail
app.get('/api/pos/inventory-request/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const req = await db.prepare(`
    SELECT r.*, l.name as location_name
    FROM pos_inventory_requests r LEFT JOIN locations l ON l.id = r.location_id WHERE r.id = ?
  `).bind(id).first()
  if (!req) return c.json({ error: 'Request not found' }, 404)

  const items = await db.prepare('SELECT * FROM pos_inventory_request_items WHERE request_id = ? ORDER BY id').bind(id).all()
  return c.json({ request: req, items: items.results || [] })
})

// Update inventory request status (approve/reject/cancel)
app.patch('/api/pos/inventory-request/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json() as any

  const fields: string[] = []
  const vals: any[] = []

  if (body.status) { fields.push('status = ?'); vals.push(body.status) }
  if (body.review_notes !== undefined) { fields.push('review_notes = ?'); vals.push(body.review_notes) }
  if (body.reviewed_by) { fields.push('reviewed_by = ?'); vals.push(body.reviewed_by) }
  if (body.reviewed_by_name) { fields.push('reviewed_by_name = ?'); vals.push(body.reviewed_by_name) }
  if (body.status === 'approved' || body.status === 'rejected') {
    fields.push('reviewed_at = CURRENT_TIMESTAMP')
  }
  if (body.converted_po_id) { fields.push('converted_po_id = ?'); vals.push(body.converted_po_id) }
  if (body.converted_transfer_id) { fields.push('converted_transfer_id = ?'); vals.push(body.converted_transfer_id) }
  fields.push('updated_at = CURRENT_TIMESTAMP')
  vals.push(id)

  await db.prepare(`UPDATE pos_inventory_requests SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run()
  return c.json({ success: true })
})

// ==================== QUICK-EDIT CUSTOMER (PATCH) ====================
app.patch('/api/pos/customer-manage/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json() as any

  const existing = await db.prepare('SELECT id FROM customers WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ error: 'Customer not found' }, 404)

  const allowed = ['business_name', 'contact_name', 'phone', 'email', 'notes', 'tags', 'customer_type', 'tax_exempt', 'priority_rank', 'sponsor_discount', 'discount_fixed', 'location_id', 'salesperson_id', 'salesperson_name', 'sms_phone', 'sms_opt_in', 'delivery_notes_default', 'is_seasonal', 'season_start_month', 'season_start_day', 'season_end_month', 'season_end_day', 'season_status', 'season_notes', 'preferred_truck_id']
  const fields: string[] = []
  const vals: any[] = []

  for (const key of allowed) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`)
      vals.push(body[key])
    }
  }

  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400)

  fields.push('updated_at = CURRENT_TIMESTAMP')
  vals.push(id)

  await db.prepare(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run()

  // Also update account terms if provided
  if (body.payment_terms || body.credit_limit !== undefined) {
    const acctFields: string[] = []
    const acctVals: any[] = []
    if (body.payment_terms) { acctFields.push('payment_terms = ?'); acctVals.push(body.payment_terms) }
    if (body.credit_limit !== undefined) { acctFields.push('credit_limit = ?'); acctVals.push(body.credit_limit) }
    acctFields.push('updated_at = CURRENT_TIMESTAMP')
    acctVals.push(id)

    // Ensure account exists
    await db.prepare('INSERT INTO customer_accounts (customer_id) VALUES (?) ON CONFLICT(customer_id) DO NOTHING').bind(id).run()
    await db.prepare(`UPDATE customer_accounts SET ${acctFields.join(', ')} WHERE customer_id = ?`).bind(...acctVals).run()
  }

  const updated = await db.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first()
  const acct = await db.prepare('SELECT * FROM customer_accounts WHERE customer_id = ?').bind(id).first()
  return c.json({ success: true, customer: updated, account: acct })
})

// ==================== MONTHLY STATEMENT SYSTEM ====================

// Generate a statement for a customer for a given period
app.post('/api/pos/statements/generate', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any

  if (!body.customer_id) return c.json({ error: 'Customer required' }, 400)
  if (!body.period_start || !body.period_end) return c.json({ error: 'Period start and end dates required' }, 400)

  const customer = await db.prepare('SELECT id, business_name, contact_name FROM customers WHERE id = ?').bind(body.customer_id).first<any>()
  if (!customer) return c.json({ error: 'Customer not found' }, 404)

  // Get opening balance from account transactions before period_start
  const priorBal = await db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as bal
    FROM customer_account_transactions
    WHERE customer_id = ? AND created_at < ?
  `).bind(body.customer_id, body.period_start).first<any>()
  const openingBalance = priorBal?.bal || 0

  // Get all sales in period
  const sales = await db.prepare(`
    SELECT s.id, s.sale_number, s.total, s.created_at, s.sale_type,
           (SELECT GROUP_CONCAT(method || ':' || amount) FROM pos_payments WHERE sale_id = s.id) as payments
    FROM pos_sales s
    WHERE s.customer_id = ? AND DATE(s.created_at) >= ? AND DATE(s.created_at) <= ? AND s.status = 'completed'
    ORDER BY s.created_at
  `).bind(body.customer_id, body.period_start, body.period_end).all<any>()

  // Get account transactions in period (payments, credits, adjustments)
  const txns = await db.prepare(`
    SELECT * FROM customer_account_transactions
    WHERE customer_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?
    ORDER BY created_at
  `).bind(body.customer_id, body.period_start, body.period_end).all<any>()

  // Build statement lines
  const lines: any[] = []
  let runBal = openingBalance
  let totalCharges = 0, totalPayments = 0, totalCredits = 0

  // Opening balance line
  lines.push({
    line_date: body.period_start,
    line_type: 'opening_balance',
    description: 'Opening Balance',
    amount: openingBalance,
    running_balance: openingBalance
  })

  // Merge sales (as charges) and transactions, sorted by date
  const allEvents: any[] = []

  for (const s of (sales.results || [])) {
    // Check if sale was charged to account (has 'account' payment)
    const payStr = s.payments || ''
    if (payStr.includes('account:')) {
      const acctAmt = parseFloat((payStr.match(/account:([\d.]+)/) || [, '0'])[1])
      if (acctAmt > 0) {
        allEvents.push({ date: s.created_at, type: 'charge', desc: `POS Sale ${s.sale_number}`, amount: acctAmt, ref_type: 'pos_sale', ref_id: s.id, ref_number: s.sale_number })
        totalCharges += acctAmt
      }
    }
  }

  for (const t of (txns.results || [])) {
    if (t.transaction_type === 'payment') {
      allEvents.push({ date: t.created_at, type: 'payment', desc: t.description || 'Payment', amount: t.amount, ref_type: 'payment', ref_id: t.id })
      totalPayments += Math.abs(t.amount)
    } else if (t.transaction_type === 'credit' || t.transaction_type === 'refund') {
      allEvents.push({ date: t.created_at, type: 'credit', desc: t.description || 'Credit/Refund', amount: t.amount, ref_type: t.transaction_type, ref_id: t.id })
      totalCredits += Math.abs(t.amount)
    } else if (t.transaction_type === 'adjustment') {
      allEvents.push({ date: t.created_at, type: 'adjustment', desc: t.description || 'Adjustment', amount: t.amount, ref_type: 'adjustment', ref_id: t.id })
    }
  }

  // Sort by date
  allEvents.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  for (const ev of allEvents) {
    runBal += ev.amount
    lines.push({
      line_date: (ev.date || '').slice(0, 10),
      line_type: ev.type,
      description: ev.desc,
      reference_type: ev.ref_type,
      reference_id: ev.ref_id,
      reference_number: ev.ref_number || '',
      amount: ev.amount,
      running_balance: runBal
    })
  }

  const closingBalance = runBal
  const stmtNum = 'STMT-' + Date.now().toString(36).toUpperCase()
  const dueDate = body.due_date || new Date(new Date(body.period_end).getTime() + 30 * 86400000).toISOString().slice(0, 10)

  const r = await db.prepare(`
    INSERT INTO customer_statements (statement_number, customer_id, period_start, period_end, opening_balance, total_charges, total_payments, total_credits, closing_balance, due_date, generated_by, generated_by_name, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(stmtNum, body.customer_id, body.period_start, body.period_end, openingBalance, totalCharges, totalPayments, totalCredits, closingBalance, dueDate, body.generated_by || null, body.generated_by_name || '', body.notes || '').run()

  const stmtId = r.meta.last_row_id

  for (const line of lines) {
    await db.prepare(`
      INSERT INTO customer_statement_lines (statement_id, line_date, line_type, description, reference_type, reference_id, reference_number, amount, running_balance)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).bind(stmtId, line.line_date, line.line_type, line.description, line.reference_type || null, line.reference_id || null, line.reference_number || '', line.amount, line.running_balance).run()
  }

  return c.json({ id: stmtId, statement_number: stmtNum, opening_balance: openingBalance, closing_balance: closingBalance, total_charges: totalCharges, total_payments: totalPayments, total_credits: totalCredits, line_count: lines.length, due_date: dueDate }, 201)
})

// List statements for a customer
app.get('/api/pos/statements', async (c) => {
  const db = c.env.DB
  const customerId = c.req.query('customer_id') || ''
  const status = c.req.query('status') || ''

  let where = 'WHERE 1=1'
  const params: any[] = []
  if (customerId) { where += ' AND s.customer_id = ?'; params.push(customerId) }
  if (status) { where += ' AND s.status = ?'; params.push(status) }

  const rows = await db.prepare(`
    SELECT s.*, c.business_name, c.contact_name, c.phone, c.email
    FROM customer_statements s
    LEFT JOIN customers c ON c.id = s.customer_id
    ${where}
    ORDER BY s.created_at DESC LIMIT 100
  `).bind(...params).all<any>()

  return c.json(rows.results || [])
})

// Get statement detail with lines
app.get('/api/pos/statements/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const stmt = await db.prepare(`
    SELECT s.*, c.business_name, c.contact_name, c.phone, c.email,
           (SELECT street || ', ' || city || ' ' || state || ' ' || zip FROM addresses WHERE customer_id = c.id AND is_primary = 1 LIMIT 1) as address
    FROM customer_statements s
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE s.id = ?
  `).bind(id).first()
  if (!stmt) return c.json({ error: 'Statement not found' }, 404)

  const lines = await db.prepare('SELECT * FROM customer_statement_lines WHERE statement_id = ? ORDER BY line_date, id').bind(id).all()
  return c.json({ statement: stmt, lines: lines.results || [] })
})

// Update statement status (mark sent, paid, etc.)
app.patch('/api/pos/statements/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json() as any

  const fields: string[] = []
  const vals: any[] = []

  if (body.status) { fields.push('status = ?'); vals.push(body.status) }
  if (body.sent_at) { fields.push('sent_at = ?'); vals.push(body.sent_at) }
  if (body.sent_method) { fields.push('sent_method = ?'); vals.push(body.sent_method) }
  if (body.notes !== undefined) { fields.push('notes = ?'); vals.push(body.notes) }
  fields.push('updated_at = CURRENT_TIMESTAMP')
  vals.push(id)

  await db.prepare(`UPDATE customer_statements SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run()
  return c.json({ success: true })
})

// List monthly-account customers (payment_terms != 'COD')
app.get('/api/pos/account-customers', async (c) => {
  const db = c.env.DB
  const rows = await db.prepare(`
    SELECT c.id, c.business_name, c.contact_name, c.phone, c.email,
           ca.balance, ca.credit_limit, ca.payment_terms, ca.status as account_status,
           ca.last_payment_date, ca.last_payment_amount,
           (SELECT COUNT(*) FROM pos_sales WHERE customer_id = c.id AND status = 'completed') as total_sales,
           (SELECT MAX(created_at) FROM pos_sales WHERE customer_id = c.id AND status = 'completed') as last_sale_date,
           (SELECT COUNT(*) FROM customer_statements WHERE customer_id = c.id) as statement_count,
           (SELECT MAX(period_end) FROM customer_statements WHERE customer_id = c.id) as last_statement_period
    FROM customers c
    JOIN customer_accounts ca ON ca.customer_id = c.id
    WHERE c.active = 1 AND ca.payment_terms != 'COD'
    ORDER BY ca.balance DESC
  `).all<any>()
  return c.json(rows.results || [])
})

// ==================== POS ↔ CRM CUSTOMER LINKING ====================

// Link POS customer to CRM org
app.post('/api/pos/customer-crm-link', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any

  if (!body.customer_id) return c.json({ error: 'customer_id required' }, 400)

  if (body.organization_id) {
    // Link to existing CRM org
    await db.prepare('UPDATE crm_organizations SET customer_id = ?, org_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(body.customer_id, 'customer', body.organization_id).run()
    return c.json({ success: true, linked: 'organization', id: body.organization_id })
  }

  if (body.contact_id) {
    // Link to existing CRM contact
    await db.prepare('UPDATE crm_contacts SET customer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(body.customer_id, body.contact_id).run()
    return c.json({ success: true, linked: 'contact', id: body.contact_id })
  }

  if (body.create_org) {
    // Create new CRM org from customer data
    const cust = await db.prepare('SELECT * FROM customers WHERE id = ?').bind(body.customer_id).first<any>()
    if (!cust) return c.json({ error: 'Customer not found' }, 404)

    const addr = await db.prepare('SELECT * FROM addresses WHERE customer_id = ? AND is_primary = 1 LIMIT 1').bind(body.customer_id).first<any>()

    const r = await db.prepare(`
      INSERT INTO crm_organizations (name, phone, email, address_street, address_city, address_state, address_zip, industry, org_type, customer_id, notes, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      cust.business_name || cust.contact_name || 'Unknown',
      cust.phone || '', cust.email || '',
      addr?.street || '', addr?.city || '', addr?.state || 'FL', addr?.zip || '',
      'equestrian', 'customer', body.customer_id,
      cust.notes || '',
      body.created_by || null
    ).run()

    const orgId = r.meta.last_row_id

    // Also create a CRM contact if contact_name exists
    if (cust.contact_name) {
      const nameParts = (cust.contact_name || '').split(' ')
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''
      await db.prepare(`
        INSERT INTO crm_contacts (first_name, last_name, phone, email, organization_id, is_primary, lead_status, customer_id, created_by)
        VALUES (?,?,?,?,?,1,'converted',?,?)
      `).bind(firstName, lastName, cust.phone || '', cust.email || '', orgId, body.customer_id, body.created_by || null).run()
    }

    return c.json({ success: true, linked: 'organization', id: orgId, created: true })
  }

  return c.json({ error: 'Provide organization_id, contact_id, or set create_org: true' }, 400)
})

// Unlink POS customer from CRM
app.delete('/api/pos/customer-crm-link/:customerId', async (c) => {
  const db = c.env.DB
  const customerId = parseInt(c.req.param('customerId'))
  await db.prepare('UPDATE crm_organizations SET customer_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?').bind(customerId).run()
  await db.prepare('UPDATE crm_contacts SET customer_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?').bind(customerId).run()
  return c.json({ success: true })
})

// Search CRM orgs for linking (not already linked)
app.get('/api/pos/crm-orgs-search', async (c) => {
  const db = c.env.DB
  const search = c.req.query('search') || ''
  const rows = await db.prepare(`
    SELECT id, name, phone, email, org_type, customer_id FROM crm_organizations
    WHERE (name LIKE ? OR phone LIKE ? OR email LIKE ?) AND customer_id IS NULL
    ORDER BY name LIMIT 20
  `).bind(`%${search}%`, `%${search}%`, `%${search}%`).all<any>()
  return c.json(rows.results || [])
})

// Get full CRM data for a customer
app.get('/api/pos/customer-crm/:customerId', async (c) => {
  const db = c.env.DB
  const customerId = parseInt(c.req.param('customerId'))

  const org = await db.prepare('SELECT * FROM crm_organizations WHERE customer_id = ?').bind(customerId).first<any>()
  const contacts = org
    ? await db.prepare('SELECT * FROM crm_contacts WHERE organization_id = ? ORDER BY is_primary DESC').bind(org.id).all<any>()
    : { results: [] }
  const directContacts = await db.prepare('SELECT * FROM crm_contacts WHERE customer_id = ? AND organization_id IS NULL').bind(customerId).all<any>()

  let recentActivities: any = { results: [] }
  if (org) {
    recentActivities = await db.prepare(`
      SELECT * FROM crm_activities WHERE organization_id = ? ORDER BY activity_date DESC LIMIT 10
    `).bind(org.id).all<any>()
  }

  let opportunities: any = { results: [] }
  if (org) {
    opportunities = await db.prepare(`
      SELECT * FROM crm_opportunities WHERE organization_id = ? ORDER BY created_at DESC LIMIT 10
    `).bind(org.id).all<any>()
  }

  return c.json({
    organization: org,
    contacts: (contacts.results || []).concat(directContacts.results || []),
    activities: recentActivities.results || [],
    opportunities: opportunities.results || []
  })
})

// ==================== FEE CONFIG (fuel surcharge, CC convenience) ====================

app.get('/api/pos/fees', async (c) => {
  const db = c.env.DB
  const locationId = c.req.query('location_id') || ''
  const activeOnly = c.req.query('active_only') === '1'
  let q = 'SELECT *, active as is_active FROM fee_config WHERE 1=1'
  const binds: any[] = []
  if (activeOnly) { q += ' AND active = 1' }
  if (locationId) { q += ' AND (location_id = ? OR location_id IS NULL)'; binds.push(parseInt(locationId)) }
  q += ' ORDER BY fee_type'
  const r = await db.prepare(q).bind(...binds).all()
  return c.json(r.results || [])
})

// Update fee config
app.put('/api/pos/fees/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json() as any

  const sets: string[] = ['updated_at = CURRENT_TIMESTAMP']
  const binds: any[] = []

  if (body.rate !== undefined) { sets.push('rate = ?'); binds.push(body.rate) }
  if (body.rate_type !== undefined) { sets.push('rate_type = ?'); binds.push(body.rate_type) }
  if (body.is_active !== undefined) { sets.push('active = ?'); binds.push(body.is_active ? 1 : 0) }
  if (body.active !== undefined) { sets.push('active = ?'); binds.push(body.active ? 1 : 0) }
  if (body.name !== undefined) { sets.push('name = ?'); binds.push(body.name) }
  if (body.apply_to !== undefined) { sets.push('apply_to = ?'); binds.push(body.apply_to) }
  if (body.min_order_amount !== undefined) { sets.push('min_order_amount = ?'); binds.push(body.min_order_amount) }
  if (body.max_fee !== undefined) { sets.push('max_fee = ?'); binds.push(body.max_fee) }
  if (body.legal_notice !== undefined) { sets.push('legal_notice = ?'); binds.push(body.legal_notice) }
  if (body.notes !== undefined) { sets.push('notes = ?'); binds.push(body.notes) }

  binds.push(id)
  await db.prepare(`UPDATE fee_config SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run()
  return c.json({ success: true })
})

// Calculate fees for an order
app.post('/api/pos/calculate-fees', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any
  const { subtotal, is_delivery, payment_method, location_id } = body

  const fees = await db.prepare('SELECT *, active as is_active FROM fee_config WHERE active = 1').all()
  const result: any[] = []

  for (const fee of (fees.results || []) as any[]) {
    if (fee.location_id && fee.location_id !== location_id) continue

    let applies = false
    if (fee.apply_to === 'delivery' && is_delivery) applies = true
    if (fee.apply_to === 'cc_payment' && (payment_method === 'credit' || payment_method === 'credit_card')) applies = true
    if (fee.apply_to === 'all') applies = true

    if (!applies) continue
    if (fee.min_order_amount && subtotal < fee.min_order_amount) continue

    let amount = 0
    if (fee.rate_type === 'percentage') {
      amount = Math.round((subtotal * (fee.rate / 100)) * 100) / 100
    } else {
      amount = fee.rate || 0
    }
    if (fee.max_fee > 0 && amount > fee.max_fee) amount = fee.max_fee

    result.push({
      fee_id: fee.id,
      fee_type: fee.fee_type,
      name: fee.name,
      rate: fee.rate,
      rate_type: fee.rate_type,
      amount: amount,
      legal_notice: fee.legal_notice || null
    })
  }

  return c.json({ fees: result, total_fees: result.reduce((s: number, f: any) => s + f.amount, 0) })
})

// ==================== SALES TAX REPORT ====================

app.get('/api/pos/tax-report', async (c) => {
  const db = c.env.DB
  const month = c.req.query('month') || '' // YYYY-MM format
  const locationId = c.req.query('location_id') || ''

  if (!month) return c.json({ error: 'Month required (YYYY-MM)' }, 400)

  const startDate = month + '-01'
  const nextMonth = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 1)
  const endDate = nextMonth.toISOString().slice(0, 10)

  let locFilter = ''
  const binds: any[] = [startDate, endDate]
  if (locationId) { locFilter = ' AND s.location_id = ?'; binds.push(parseInt(locationId)) }

  // Total sales and tax by category
  const byCat = await db.prepare(`
    SELECT si.category, COUNT(DISTINCT s.id) as sale_count,
           SUM(si.line_total) as gross_sales,
           SUM(si.tax_amount) as tax_collected,
           SUM(si.discount_amount) as total_discounts,
           AVG(si.tax_rate) as avg_tax_rate
    FROM pos_sale_items si
    JOIN pos_sales s ON s.id = si.sale_id
    WHERE s.status = 'completed'
      AND DATE(s.created_at) >= ? AND DATE(s.created_at) < ?
      ${locFilter}
    GROUP BY si.category ORDER BY gross_sales DESC
  `).bind(...binds).all()

  // Tax exempt sales
  const exempt = await db.prepare(`
    SELECT COUNT(DISTINCT s.id) as exempt_sales,
           SUM(si.line_total) as exempt_amount
    FROM pos_sale_items si
    JOIN pos_sales s ON s.id = si.sale_id
    JOIN customers c ON c.id = s.customer_id
    WHERE s.status = 'completed' AND c.tax_exempt = 1
      AND DATE(s.created_at) >= ? AND DATE(s.created_at) < ?
      ${locFilter}
  `).bind(...binds).first() as any

  // Daily breakdown
  const daily = await db.prepare(`
    SELECT DATE(s.created_at) as sale_date,
           SUM(s.subtotal) as subtotal,
           SUM(s.tax) as tax,
           SUM(s.total) as total,
           COUNT(*) as sale_count
    FROM pos_sales s
    WHERE s.status = 'completed'
      AND DATE(s.created_at) >= ? AND DATE(s.created_at) < ?
      ${locFilter}
    GROUP BY DATE(s.created_at) ORDER BY sale_date
  `).bind(...binds).all()

  // Summary totals
  const totals = await db.prepare(`
    SELECT SUM(s.subtotal) as total_subtotal,
           SUM(s.tax) as total_tax,
           SUM(s.total) as total_sales,
           SUM(s.discount) as total_discounts,
           COUNT(*) as total_transactions
    FROM pos_sales s
    WHERE s.status = 'completed'
      AND DATE(s.created_at) >= ? AND DATE(s.created_at) < ?
      ${locFilter}
  `).bind(...binds).first() as any

  return c.json({
    month,
    by_category: byCat.results || [],
    exempt: exempt || { exempt_sales: 0, exempt_amount: 0 },
    daily: daily.results || [],
    totals: totals || { total_subtotal: 0, total_tax: 0, total_sales: 0, total_discounts: 0, total_transactions: 0 }
  })
})

// ==================== ADDRESS CRUD (enhanced) ====================

// Add new address inline (used from order creation or POS)
app.post('/api/pos/customers/:id/addresses', async (c) => {
  const db = c.env.DB
  const customerId = parseInt(c.req.param('id'))
  const body = await c.req.json() as any

  if (!body.street) return c.json({ error: 'Street address required' }, 400)

  // Check if this is the first address → make primary
  const existing = await db.prepare('SELECT COUNT(*) as cnt FROM addresses WHERE customer_id = ?').bind(customerId).first() as any
  const isPrimary = (existing?.cnt || 0) === 0 ? 1 : (body.is_primary ? 1 : 0)

  // If setting as primary, unset other primaries
  if (isPrimary) {
    await db.prepare('UPDATE addresses SET is_primary = 0 WHERE customer_id = ?').bind(customerId).run()
  }

  const r = await db.prepare(`
    INSERT INTO addresses (customer_id, label, street, city, state, zip, lat, lng, is_primary, notes, delivery_instructions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(customerId, body.label || 'Delivery', body.street, body.city || '', body.state || 'FL',
    body.zip || '', body.lat || null, body.lng || null, isPrimary,
    body.notes || null, body.delivery_instructions || null).run()

  return c.json({ id: r.meta.last_row_id, success: true }, 201)
})

// ==================== SMART STOCK CHECK (cross-location) ====================

app.get('/api/pos/stock-check', async (c) => {
  const db = c.env.DB
  const productIds = (c.req.query('product_ids') || '').split(',').filter(Boolean).map(Number)
  const currentLocationId = parseInt(c.req.query('location_id') || '0')

  if (!productIds.length) return c.json({ error: 'product_ids required' }, 400)

  // Get all locations
  const locs = await db.prepare('SELECT id, name, code, type FROM locations').all()
  const locations = locs.results || []

  // Get stock for all requested products across ALL locations
  const placeholders = productIds.map(() => '?').join(',')
  const stocks = await db.prepare(
    `SELECT s.product_id, s.location_id, s.qty_on_hand, s.qty_on_hold, s.qty_reserved,
            p.name as product_name, p.sku, p.unit_type
     FROM inventory_stock s
     JOIN products p ON p.id = s.product_id
     WHERE s.product_id IN (${placeholders})`
  ).bind(...productIds).all()

  // Build result per product
  const result = productIds.map(pid => {
    const productStocks = (stocks.results || []).filter((s: any) => s.product_id === pid)
    const product = productStocks[0] || {} as any
    const byLocation = locations.map((loc: any) => {
      const s = productStocks.find((st: any) => st.location_id === loc.id) as any
      return {
        location_id: loc.id,
        location_name: loc.name,
        location_code: loc.code,
        location_type: loc.type,
        is_current: loc.id === currentLocationId,
        qty_on_hand: s?.qty_on_hand || 0,
        qty_on_hold: s?.qty_on_hold || 0,
        qty_reserved: s?.qty_reserved || 0,
        available: Math.max(0, (s?.qty_on_hand || 0) - (s?.qty_on_hold || 0) - (s?.qty_reserved || 0))
      }
    })

    const current = byLocation.find(l => l.is_current)
    const others = byLocation.filter(l => !l.is_current && l.available > 0)

    return {
      product_id: pid,
      product_name: product.product_name || product.name || '',
      sku: product.sku || '',
      unit_type: product.unit_type || 'each',
      local_available: current?.available || 0,
      local_on_hand: current?.qty_on_hand || 0,
      other_locations: others
    }
  })

  return c.json({ stock: result })
})

// ==================== POS-INITIATED TRANSFER (smart one-click) ====================

app.post('/api/pos/request-transfer', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)
  const body = await c.req.json() as any

  // body: { to_location_id, from_location_id, items: [{product_id, qty}], customer_id?, customer_name?, notes? }
  if (!body.to_location_id || !body.from_location_id) return c.json({ error: 'Locations required' }, 400)
  if (!body.items?.length) return c.json({ error: 'Items required' }, 400)

  const d = new Date()
  const tNum = `TRF${d.getFullYear().toString().slice(2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.random().toString(36).substring(2,7).toUpperCase()}`

  const notes = (body.notes || 'POS transfer request') +
    (body.customer_name ? ' | For customer: ' + body.customer_name : '')

  const tResult = await db.prepare(
    `INSERT INTO inventory_transfers (transfer_number, from_location_id, to_location_id, status, notes, created_by)
     VALUES (?, ?, ?, 'pending', ?, ?)`
  ).bind(tNum, body.from_location_id, body.to_location_id, notes, user?.id || null).run()
  const transferId = tResult.meta.last_row_id

  for (const item of body.items) {
    await db.prepare(
      `INSERT INTO inventory_transfer_items (transfer_id, product_id, qty_requested) VALUES (?, ?, ?)`
    ).bind(transferId, item.product_id, item.qty || 1).run()
  }

  // If customer tagged, create a notification + task to remind when received
  if (body.customer_id) {
    await db.prepare(
      `INSERT INTO notifications (user_id, title, message, notification_type, ref_type, ref_id)
       VALUES (?, ?, ?, 'inventory', 'transfer', ?)`
    ).bind(user?.id || 0,
      'Transfer Requested for Customer',
      'Transfer ' + tNum + ' created for ' + (body.customer_name || 'customer') + '. Will notify when received.',
      transferId).run()
  }

  return c.json({ success: true, transfer_id: transferId, transfer_number: tNum })
})

// ==================== POS-INITIATED PURCHASE REQUEST (customer-tagged) ====================

app.post('/api/pos/request-purchase', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)
  const body = await c.req.json() as any

  // body: { location_id, items: [{product_id, product_name, qty}], customer_id, customer_name, notes? }
  if (!body.items?.length) return c.json({ error: 'Items required' }, 400)

  // 1. Create POS inventory request
  const pirNum = 'PIR-' + Date.now().toString(36).toUpperCase()
  const pirResult = await db.prepare(`
    INSERT INTO pos_inventory_requests (request_number, location_id, urgency, requested_by, requested_by_name, reason, notes, customer_id, customer_name, notify_customer, fulfillment_type)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).bind(pirNum, body.location_id || 0, body.urgency || 'normal',
    user?.id || null, user?.email || '', 'Customer order — not in stock',
    body.notes || '', body.customer_id || null, body.customer_name || null,
    body.customer_id ? 1 : 0, 'purchase').run()
  const pirId = pirResult.meta.last_row_id

  for (const item of body.items) {
    await db.prepare(`
      INSERT INTO pos_inventory_request_items (request_id, product_id, product_name, qty_requested, current_stock, unit)
      VALUES (?,?,?,?,?,?)
    `).bind(pirId, item.product_id, item.product_name || '', item.qty || 1, 0, item.unit || 'each').run()
  }

  // 2. Create a purchasing order_request so it shows up in the purchasing module
  const reqNum = `REQ${Date.now().toString(36).toUpperCase()}`

  // Auto-assign based on category
  let assignedTo: any = null, assignedToName: any = null
  if (body.items[0]?.product_id) {
    try {
      const prod = await db.prepare('SELECT category FROM products WHERE id = ?').bind(body.items[0].product_id).first() as any
      if (prod?.category) {
        const assignment = await db.prepare(
          'SELECT user_id, user_name FROM category_order_assignments WHERE category = ? AND is_primary = 1 LIMIT 1'
        ).bind(prod.category).first() as any
        if (assignment) { assignedTo = assignment.user_id; assignedToName = assignment.user_name }
      }
    } catch(e) { /* table may not exist yet */ }
  }

  const orResult = await db.prepare(`
    INSERT INTO order_requests (request_number, status, urgency, location_id, requested_by, requested_by_name, requested_by_role, reason, notes, source, assigned_to, assigned_to_name)
    VALUES (?, 'pending', ?, ?, ?, ?, 'pos_staff', ?, ?, 'pos', ?, ?)
  `).bind(reqNum, body.urgency || 'normal', body.location_id || 0,
    user?.id || null, user?.email || 'POS',
    'Customer order — product not in stock at any location',
    'POS Request ' + pirNum + (body.customer_name ? ' | Customer: ' + body.customer_name : ''),
    assignedTo, assignedToName).run()
  const orderRequestId = orResult.meta.last_row_id

  // Add items to order_request
  for (const item of body.items) {
    await db.prepare(`
      INSERT INTO order_request_items (request_id, product_id, description, qty_requested, unit)
      VALUES (?,?,?,?,?)
    `).bind(orderRequestId, item.product_id, item.product_name || '', item.qty || 1, item.unit || 'each').run()
  }

  // Link POS request to purchasing request
  await db.prepare(
    `UPDATE pos_inventory_requests SET purchasing_request_id = ?, status = 'approved' WHERE id = ?`
  ).bind(orderRequestId, pirId).run()

  // 3. Create a task: "Remind to inform customer when product received"
  if (body.customer_id) {
    const taskNum = 'TSK-' + Date.now().toString(36).toUpperCase()
    await db.prepare(`
      INSERT INTO tasks (task_number, title, description, task_type, priority, status, assigned_to, assigned_to_name, created_by, created_by_name, location_id, ref_type, ref_id, ref_number, customer_id, customer_name, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      taskNum,
      'Notify ' + (body.customer_name || 'customer') + ' when product arrives',
      'Products requested for customer ' + (body.customer_name || '') + ' are not in stock. A purchase request (' + reqNum + ') has been created. Contact the customer when the order is received.',
      'follow_up', body.urgency === 'critical' ? 'critical' : 'high', 'pending',
      user?.id || null, user?.email || null, user?.id || null, user?.email || 'POS',
      body.location_id || null, 'pos_request', pirId, pirNum,
      body.customer_id, body.customer_name || null,
      'Auto-created from POS. Waiting for purchase to arrive.'
    ).run()

    // 4. Reserve stock for this customer (mark qty_reserved in inventory_stock)
    // This ensures when the product arrives via PO receiving, it's earmarked
    for (const item of body.items) {
      // We can't reserve what doesn't exist yet, but we track the intent
      // The reservation will be applied when the PO is received
      // For now, create a notification so the receiver knows
    }

    // Notification for the user
    await db.prepare(
      `INSERT INTO notifications (user_id, title, message, notification_type, ref_type, ref_id)
       VALUES (?, ?, ?, 'task', 'pos_request', ?)`
    ).bind(user?.id || 0,
      'Purchase Requested for Customer',
      'No stock available. Purchase request ' + reqNum + ' created for ' + (body.customer_name || 'customer') + '. Task created to notify customer when received.',
      pirId).run()
  }

  return c.json({
    success: true,
    pos_request_id: pirId,
    pos_request_number: pirNum,
    purchasing_request_id: orderRequestId,
    purchasing_request_number: reqNum
  })
})

// ==================== ALL ORDERS (unified POS sales + delivery orders) ====================
app.get('/api/pos/all-orders', async (c) => {
  const db = c.env.DB
  const from = c.req.query('from') || ''
  const to = c.req.query('to') || ''
  const search = c.req.query('search') || ''
  const type = c.req.query('type') || '' // 'sale', 'delivery', or '' for both
  const status = c.req.query('status') || ''
  const customerId = c.req.query('customer_id') || ''
  const limit = parseInt(c.req.query('limit') || '100')

  const results: any[] = []

  // POS Sales
  if (type !== 'delivery') {
    let sq = `SELECT s.id, s.sale_number as order_number, 'sale' as source, s.status, s.total,
      s.sale_type, s.created_at, s.customer_id,
      COALESCE(c.business_name, c.contact_name, 'Walk-in') as customer_name,
      (SELECT COUNT(*) FROM pos_sale_items si WHERE si.sale_id = s.id) as item_count,
      GROUP_CONCAT(si2.product_name, ', ') as items_summary,
      s.order_id as linked_order_id,
      o_linked.order_number as linked_order_number,
      o_linked.status as linked_order_status,
      o_linked.scheduled_date as linked_delivery_date
      FROM pos_sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN pos_sale_items si2 ON si2.sale_id = s.id
      LEFT JOIN orders o_linked ON s.order_id = o_linked.id`
    const sp: any[] = []
    const swhere: string[] = ['1=1']
    if (from) { swhere.push('DATE(s.created_at) >= ?'); sp.push(from) }
    if (to) { swhere.push('DATE(s.created_at) <= ?'); sp.push(to) }
    if (status) { swhere.push('s.status = ?'); sp.push(status) }
    if (customerId) { swhere.push('s.customer_id = ?'); sp.push(parseInt(customerId)) }
    if (search) { swhere.push('(s.sale_number LIKE ? OR c.business_name LIKE ? OR c.contact_name LIKE ?)'); sp.push(`%${search}%`, `%${search}%`, `%${search}%`) }
    sq += ' WHERE ' + swhere.join(' AND ') + ' GROUP BY s.id ORDER BY s.created_at DESC LIMIT ?'
    sp.push(limit)
    const sales = await db.prepare(sq).bind(...sp).all()
    for (const s of (sales.results || []) as any[]) {
      results.push({ ...s, source: 'sale' })
    }
  }

  // Delivery Orders — exclude orders that originated from POS (they already appear as sales with linked order info)
  if (type !== 'sale') {
    let oq = `SELECT o.id, o.order_number, 'delivery' as source, o.status, o.total_weight as total,
      'delivery' as sale_type, o.created_at, o.customer_id,
      COALESCE(c.business_name, c.contact_name, '') as customer_name,
      (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count,
      (SELECT GROUP_CONCAT(p.name, ', ') FROM order_items oi2 JOIN products p ON p.id = oi2.product_id WHERE oi2.order_id = o.id) as items_summary,
      o.scheduled_date, o.priority,
      r.route_number, r.status as route_status
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN route_stops rs ON rs.order_id = o.id
      LEFT JOIN routes r ON rs.route_id = r.id`
    const op: any[] = []
    const owhere: string[] = ["1=1", "COALESCE(o.source,'') != 'pos'"]
    if (from) { owhere.push('DATE(o.created_at) >= ?'); op.push(from) }
    if (to) { owhere.push('DATE(o.created_at) <= ?'); op.push(to) }
    if (status) { owhere.push('o.status = ?'); op.push(status) }
    if (customerId) { owhere.push('o.customer_id = ?'); op.push(parseInt(customerId)) }
    if (search) { owhere.push('(o.order_number LIKE ? OR c.business_name LIKE ? OR c.contact_name LIKE ?)'); op.push(`%${search}%`, `%${search}%`, `%${search}%`) }
    oq += ' WHERE ' + owhere.join(' AND ') + ' ORDER BY o.created_at DESC LIMIT ?'
    op.push(limit)
    const orders = await db.prepare(oq).bind(...op).all()
    for (const o of (orders.results || []) as any[]) {
      results.push({ ...o, source: 'delivery' })
    }
  }

  // Sort combined by created_at DESC
  results.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

  return c.json({ orders: results.slice(0, limit) })
})

// ==================== CUSTOMER UNIFIED HISTORY (for CRM + logistics) ====================
app.get('/api/pos/customer-history/:customerId', async (c) => {
  const db = c.env.DB
  const customerId = parseInt(c.req.param('customerId'))
  const limit = parseInt(c.req.query('limit') || '50')

  const [sales, orders] = await Promise.all([
    db.prepare(`
      SELECT s.id, s.sale_number as order_number, 'sale' as source, s.status, s.total,
        s.sale_type, s.created_at,
        (SELECT GROUP_CONCAT(method || ':' || amount) FROM pos_payments WHERE sale_id = s.id) as payment_methods,
        (SELECT COUNT(*) FROM pos_sale_items si WHERE si.sale_id = s.id) as item_count,
        GROUP_CONCAT(si2.product_name || ' x' || CAST(si2.quantity AS INTEGER), ', ') as items_summary
      FROM pos_sales s
      LEFT JOIN pos_sale_items si2 ON si2.sale_id = s.id
      WHERE s.customer_id = ? AND s.status != 'voided'
      GROUP BY s.id ORDER BY s.created_at DESC LIMIT ?
    `).bind(customerId, limit).all(),
    db.prepare(`
      SELECT o.id, o.order_number, 'delivery' as source, o.status, o.total_weight as total,
        'delivery' as sale_type, o.created_at, o.scheduled_date, o.priority,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count,
        (SELECT GROUP_CONCAT(p.name || ' x' || CAST(oi2.quantity AS INTEGER), ', ') FROM order_items oi2 JOIN products p ON p.id = oi2.product_id WHERE oi2.order_id = o.id) as items_summary,
        r.route_number
      FROM orders o
      LEFT JOIN route_stops rs ON rs.order_id = o.id
      LEFT JOIN routes r ON rs.route_id = r.id
      WHERE o.customer_id = ? AND o.status != 'cancelled' AND COALESCE(o.source,'') != 'pos'
      ORDER BY o.created_at DESC LIMIT ?
    `).bind(customerId, limit).all()
  ])

  const combined = [...(sales.results || []), ...(orders.results || [])]
    .sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, limit)

  // Summary stats
  const allSales = (sales.results || []) as any[]
  const allOrders = (orders.results || []) as any[]
  const stats = {
    total_sales: allSales.length,
    total_orders: allOrders.length,
    sales_revenue: allSales.reduce((s: number, x: any) => s + (x.total || 0), 0),
    orders_revenue: allOrders.reduce((s: number, x: any) => s + (x.total || 0), 0)
  }

  return c.json({ history: combined, stats })
})

// ==================== DARTS QUEUE ====================

// Get all pending Darts entry tasks
app.get('/api/pos/darts-queue', async (c) => {
  const db = c.env.DB
  const status = c.req.query('status') || 'pending'
  const includeCompleted = c.req.query('include_completed') === '1'

  let query = `SELECT t.*,
    o.order_number, o.status as order_status, o.scheduled_date, o.customer_id as order_customer_id,
    COALESCE(c.business_name, c.contact_name) as customer_display_name,
    c.phone as customer_phone,
    (SELECT GROUP_CONCAT(p.name || ' x' || oi.quantity, ', ') FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = t.ref_id) as items_list,
    (SELECT COUNT(*) FROM order_items oi2 WHERE oi2.order_id = t.ref_id) as item_count,
    s.sale_number, s.total as sale_total, s.cashier_name
    FROM tasks t
    LEFT JOIN orders o ON t.ref_type = 'order' AND t.ref_id = o.id
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN pos_sales s ON s.order_id = o.id
    WHERE t.task_type = 'darts_entry'`

  if (!includeCompleted) {
    if (status === 'all') {
      query += " AND t.status IN ('pending','in_progress','completed')"
    } else {
      query += ` AND t.status = '${status === 'completed' ? 'completed' : 'pending'}'`
    }
  }
  query += ' ORDER BY t.priority DESC, t.created_at DESC LIMIT 100'

  const result = await db.prepare(query).all()

  // Summary counts
  const counts = await db.prepare(`
    SELECT
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
      COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
      COUNT(CASE WHEN status = 'completed' AND completed_at >= datetime('now', '-24 hours') THEN 1 END) as completed_today
    FROM tasks WHERE task_type = 'darts_entry'
  `).first() as any

  return c.json({ tasks: result.results, counts })
})

// Mark a Darts task as completed
app.put('/api/pos/darts-queue/:taskId/complete', async (c) => {
  const db = c.env.DB
  const taskId = parseInt(c.req.param('taskId'))
  const body = await c.req.json() as any
  const user = getUserFromHeader(c)

  const task = await db.prepare('SELECT * FROM tasks WHERE id = ? AND task_type = ?').bind(taskId, 'darts_entry').first() as any
  if (!task) return c.json({ error: 'Darts task not found' }, 404)

  await db.prepare(`
    UPDATE tasks SET status = 'completed', completed_at = datetime('now'),
      completed_by = ?, completed_by_name = ?, notes = COALESCE(notes, '') || ?
    WHERE id = ?
  `).bind(
    user?.id || body.completed_by || null,
    user?.email || body.completed_by_name || null,
    body.darts_confirmation ? '\n\nDARTS Confirmation: ' + body.darts_confirmation : '',
    taskId
  ).run()

  // Mark the linked order as Darts-synced
  if (task.ref_type === 'order' && task.ref_id) {
    await db.prepare('UPDATE orders SET darts_synced = 1, darts_synced_at = datetime(\'now\'), darts_synced_by = ? WHERE id = ?')
      .bind(user?.id || body.completed_by || null, task.ref_id).run()
  }

  return c.json({ success: true })
})

// ==================== PETTY CASH ====================

// List petty cash transactions
app.get('/api/pos/petty-cash', async (c) => {
  const db = c.env.DB
  const locationId = c.req.query('location_id')
  const sessionId = c.req.query('session_id')
  const status = c.req.query('status')
  const dateFrom = c.req.query('date_from')
  const dateTo = c.req.query('date_to')

  let query = `SELECT pc.*, u.name as created_by_user_name, ua.name as approved_by_name, l.name as location_name
    FROM pos_petty_cash pc
    LEFT JOIN users u ON pc.created_by = u.id
    LEFT JOIN users ua ON pc.approved_by = ua.id
    LEFT JOIN locations l ON pc.location_id = l.id
    WHERE 1=1`
  const binds: any[] = []

  if (locationId) { query += ' AND pc.location_id = ?'; binds.push(parseInt(locationId)) }
  if (sessionId) { query += ' AND pc.session_id = ?'; binds.push(parseInt(sessionId)) }
  if (status) { query += ' AND pc.status = ?'; binds.push(status) }
  if (dateFrom) { query += " AND pc.created_at >= ?"; binds.push(dateFrom + ' 00:00:00') }
  if (dateTo) { query += " AND pc.created_at <= ?"; binds.push(dateTo + ' 23:59:59') }

  query += ' ORDER BY pc.created_at DESC LIMIT 100'

  const result = await db.prepare(query).bind(...binds).all()

  // Get summary for the location
  const summaryBinds: any[] = []
  let summaryQ = `SELECT
    COUNT(*) as total_count,
    COALESCE(SUM(CASE WHEN status IN ('pending','approved','completed') THEN amount ELSE 0 END), 0) as total_out,
    COALESCE(SUM(CASE WHEN status IN ('pending','approved','completed') THEN returned_amount ELSE 0 END), 0) as total_returned
    FROM pos_petty_cash WHERE 1=1`
  if (locationId) { summaryQ += ' AND location_id = ?'; summaryBinds.push(parseInt(locationId)) }
  if (sessionId) { summaryQ += ' AND session_id = ?'; summaryBinds.push(parseInt(sessionId)) }
  if (dateFrom) { summaryQ += " AND created_at >= ?"; summaryBinds.push(dateFrom + ' 00:00:00') }
  if (dateTo) { summaryQ += " AND created_at <= ?"; summaryBinds.push(dateTo + ' 23:59:59') }

  const summary = await db.prepare(summaryQ).bind(...summaryBinds).first()

  return c.json({ transactions: result.results, summary })
})

// Create petty cash transaction (cash-out from register)
app.post('/api/pos/petty-cash', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as any
  const { session_id, location_id, amount, category, recipient, description, created_by, created_by_name } = body

  if (!amount || amount <= 0) return c.json({ error: 'Amount must be positive' }, 400)
  if (!description) return c.json({ error: 'Description is required' }, 400)
  if (!location_id) return c.json({ error: 'Location is required' }, 400)

  const result = await db.prepare(
    `INSERT INTO pos_petty_cash (session_id, location_id, amount, category, recipient, description, created_by, created_by_name, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
  ).bind(
    session_id || null, location_id, amount,
    category || 'misc_purchase', recipient || null,
    description, created_by, created_by_name || null
  ).run()

  return c.json({ id: result.meta.last_row_id, success: true })
})

// Update petty cash (approve, complete with return, void)
app.put('/api/pos/petty-cash/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json() as any
  const { action, approved_by, returned_amount, receipt_note } = body

  const existing = await db.prepare('SELECT * FROM pos_petty_cash WHERE id = ?').bind(id).first() as any
  if (!existing) return c.json({ error: 'Not found' }, 404)

  if (action === 'approve') {
    if (existing.status !== 'pending') return c.json({ error: 'Can only approve pending transactions' }, 400)
    await db.prepare('UPDATE pos_petty_cash SET status = ?, approved_by = ? WHERE id = ?')
      .bind('approved', approved_by || null, id).run()
  } else if (action === 'complete') {
    if (existing.status === 'voided' || existing.status === 'completed') return c.json({ error: 'Already ' + existing.status }, 400)
    await db.prepare('UPDATE pos_petty_cash SET status = ?, returned_amount = ?, receipt_note = ?, completed_at = datetime(\'now\'), returned_at = CASE WHEN ? > 0 THEN datetime(\'now\') ELSE NULL END WHERE id = ?')
      .bind('completed', returned_amount || 0, receipt_note || null, returned_amount || 0, id).run()
  } else if (action === 'void') {
    if (existing.status === 'completed') return c.json({ error: 'Cannot void completed transaction' }, 400)
    await db.prepare('UPDATE pos_petty_cash SET status = ? WHERE id = ?').bind('voided', id).run()
  } else {
    return c.json({ error: 'Invalid action' }, 400)
  }

  return c.json({ success: true })
})

// Delete petty cash (only pending)
app.delete('/api/pos/petty-cash/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const existing = await db.prepare('SELECT * FROM pos_petty_cash WHERE id = ?').bind(id).first() as any
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.status !== 'pending') return c.json({ error: 'Can only delete pending transactions' }, 400)
  await db.prepare('DELETE FROM pos_petty_cash WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// Get session cash summary (opening cash - petty cash out + returns)
app.get('/api/pos/session-cash/:sessionId', async (c) => {
  const db = c.env.DB
  const sessionId = parseInt(c.req.param('sessionId'))

  const session = await db.prepare('SELECT * FROM pos_register_sessions WHERE id = ?').bind(sessionId).first() as any
  if (!session) return c.json({ error: 'Session not found' }, 404)

  const cashSales = await db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN sp.method = 'cash' THEN sp.amount ELSE 0 END), 0) as total
     FROM pos_sale_payments sp
     JOIN pos_sales s ON sp.sale_id = s.id
     WHERE s.session_id = ? AND s.status != 'voided'`
  ).bind(sessionId).first() as any

  const pettyOut = await db.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total_out, COALESCE(SUM(returned_amount), 0) as total_returned
     FROM pos_petty_cash WHERE session_id = ? AND status != 'voided'`
  ).bind(sessionId).first() as any

  return c.json({
    session_id: sessionId,
    opening_cash: session.opening_cash || 0,
    cash_sales: cashSales?.total || 0,
    petty_cash_out: pettyOut?.total_out || 0,
    petty_cash_returned: pettyOut?.total_returned || 0,
    expected_drawer: (session.opening_cash || 0) + (cashSales?.total || 0) - (pettyOut?.total_out || 0) + (pettyOut?.total_returned || 0)
  })
})

export { app as posApp }
