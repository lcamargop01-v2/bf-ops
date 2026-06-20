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

export { app as posApp }
