import { Hono } from 'hono'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// ==================== HELPERS ====================
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
    SELECT p.id, p.name, p.sku, p.category, p.price, p.cost, p.tax_rate,
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
    query += ' AND (p.name LIKE ? OR p.sku LIKE ?)'
    params.push(`%${search}%`, `%${search}%`)
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

  return c.json({
    customer,
    account: account || { balance: 0, credit_limit: 0, payment_terms: 'COD', status: 'active' },
    addresses: addresses.results,
    recentOrders: recentOrders.results,
    recentSales: recentSales.results,
    priceRules: priceRules.results,
    crmOrg
  })
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

  // Insert line items & deduct inventory
  for (const item of processedItems) {
    await db.prepare(`
      INSERT INTO pos_sale_items (sale_id, product_id, product_name, sku, category, quantity, unit_price, unit_cost, discount_pct, discount_amount, tax_rate, tax_amount, line_total, location_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(saleId, item.product_id, item.product_name, item.sku, item.category, item.quantity, item.unit_price, item.unit_cost, item.discount_pct, item.discount_amount, item.tax_rate, item.tax_amount, item.line_total, item.location_id).run()

    // Deduct inventory from the correct location
    await db.prepare(`
      UPDATE inventory_stock SET qty_on_hand = qty_on_hand - ?, updated_at = CURRENT_TIMESTAMP
      WHERE product_id = ? AND location_id = ?
    `).bind(item.quantity, item.product_id, item.location_id).run()

    // Audit trail
    const auditAction = fulfillment === 'reserve_retail' ? 'transfer_out' : 'sale'
    const auditReason = fulfillment !== 'local'
      ? `POS ${fulfillment} (from loc ${item.location_id} for sale at loc ${saleLocationId})`
      : 'POS Sale'
    await db.prepare(`
      INSERT INTO inventory_audit (product_id, location_id, action, qty_change, reason, reference_type, reference_id, notes, user_name)
      VALUES (?, ?, ?, ?, ?, 'pos_sale', ?, ?, ?)
    `).bind(item.product_id, item.location_id, auditAction, -item.quantity, auditReason, saleId, 'Sale #' + saleNumber, body.cashier_name || '').run()
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

  // Restore inventory
  const items = await db.prepare('SELECT * FROM pos_sale_items WHERE sale_id = ?').bind(id).all()
  for (const item of items.results as any[]) {
    await db.prepare('UPDATE inventory_stock SET qty_on_hand = qty_on_hand + ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND location_id = ?')
      .bind(item.quantity, item.product_id, item.location_id || sale.location_id).run()

    await db.prepare(`
      INSERT INTO inventory_audit (product_id, location_id, action, qty_change, reason, reference_type, reference_id, notes, user_name)
      VALUES (?, ?, 'void_restock', ?, 'Sale voided', 'pos_sale', ?, ?, ?)
    `).bind(item.product_id, item.location_id || sale.location_id, item.quantity, id, 'Void: ' + sale.sale_number, body.voided_by_name || '').run()
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
      priority_rank = ?, location_id = ?, tags = ?,
      salesperson_id = ?, salesperson_name = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    body.business_name || '', body.contact_name || '', body.phone || '', body.email || '',
    body.customer_type || 'other', body.notes || '', body.tax_exempt ? 1 : 0,
    body.sponsor_discount || 0, body.priority_rank || 0,
    body.location_id || null, body.tags || '',
    body.salesperson_id || null, body.salesperson_name || '',
    id
  ).run()

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

  // Move all related records from merge → keep
  await db.prepare('UPDATE addresses SET customer_id = ? WHERE customer_id = ?').bind(keepId, mergeId).run()
  await db.prepare('UPDATE orders SET customer_id = ? WHERE customer_id = ?').bind(keepId, mergeId).run()
  await db.prepare('UPDATE pos_sales SET customer_id = ? WHERE customer_id = ?').bind(keepId, mergeId).run()
  await db.prepare('UPDATE pos_refunds SET customer_id = ? WHERE customer_id = ?').bind(keepId, mergeId).run()
  await db.prepare('UPDATE pos_price_rules SET customer_id = ? WHERE customer_id = ?').bind(keepId, mergeId).run()
  await db.prepare('UPDATE customer_account_transactions SET customer_id = ? WHERE customer_id = ?').bind(keepId, mergeId).run()
  await db.prepare('UPDATE pos_payment_tokens SET customer_id = ? WHERE customer_id = ?').bind(keepId, mergeId).run()
  await db.prepare('UPDATE pos_stock_reservations SET requested_by = ? WHERE requested_by = ?').bind(keepId, mergeId).run()

  // Merge account balances
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

  // CRM orgs
  await db.prepare('UPDATE crm_organizations SET customer_id = ? WHERE customer_id = ?').bind(keepId, mergeId).run()

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
    const sale = await db.prepare('SELECT * FROM pos_sales WHERE id = ?').bind(id).first()
    if (!sale) return c.json({ error: 'Sale not found' }, 404)
    const items = await db.prepare('SELECT * FROM pos_sale_items WHERE sale_id = ? ORDER BY id').bind(id).all()
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

export { app as posApp }
