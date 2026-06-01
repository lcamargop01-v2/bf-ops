// BF Deliver Logistics Module — mounted by parent shell
// Direct copy of standalone logistics app. Only init/export changed.
import { Hono } from 'hono'
import type { BFBindings, BFVariables } from '../lib/types'

const app = new Hono<{ Bindings: BFBindings; Variables: BFVariables }>()

// ==================== PALLET CALCULATION HELPER ====================
// Groups items by pallet_qty, sums quantities within each group, then CEILs per group.
// This allows different items/orders to share pallet space when they have the same pallet capacity.
function calcPallets(items: Array<{ quantity: number; pallet_qty: number | null }>): number {
  const groups: Record<number, number> = {}
  for (const item of items) {
    const pq = item.pallet_qty && item.pallet_qty > 0 ? item.pallet_qty : 40
    const qty = item.quantity || 0
    groups[pq] = (groups[pq] || 0) + qty
  }
  let total = 0
  for (const pq in groups) {
    total += Math.ceil(groups[pq] / Number(pq))
  }
  return total
}

// SQL subquery: groups items by pallet_qty, sums quantities per group, CEILs each, then sums.
// Use for per-order pallet count (pass order_items condition).
const PALLET_SQL_ORDER = `(SELECT COALESCE(SUM(grp_pallets),0) FROM (SELECT CAST(CEIL(CAST(SUM(oi2.quantity) AS REAL) / CASE WHEN p.pallet_qty > 0 THEN p.pallet_qty ELSE 40 END) AS INTEGER) as grp_pallets FROM order_items oi2 JOIN products p ON oi2.product_id = p.id WHERE oi2.order_id = o.id GROUP BY CASE WHEN p.pallet_qty > 0 THEN p.pallet_qty ELSE 40 END))`
// SQL subquery: same logic but for route total pallets (groups ALL items across all stops on the route).
const PALLET_SQL_ROUTE = `(SELECT COALESCE(SUM(grp_pallets),0) FROM (SELECT CAST(CEIL(CAST(SUM(oi2.quantity) AS REAL) / CASE WHEN p.pallet_qty > 0 THEN p.pallet_qty ELSE 40 END) AS INTEGER) as grp_pallets FROM route_stops rs3 JOIN order_items oi2 ON oi2.order_id = rs3.order_id JOIN products p ON oi2.product_id = p.id WHERE rs3.route_id = r.id GROUP BY CASE WHEN p.pallet_qty > 0 THEN p.pallet_qty ELSE 40 END))`
// SQL subquery: groups return items by pallet_qty for per-return pallet count.
const PALLET_SQL_RETURN = `(SELECT COALESCE(SUM(grp_pallets),0) FROM (SELECT CAST(CEIL(CAST(SUM(ri2.expected_qty) AS REAL) / CASE WHEN p2.pallet_qty > 0 THEN p2.pallet_qty ELSE 40 END) AS INTEGER) as grp_pallets FROM return_items ri2 JOIN products p2 ON ri2.product_id = p2.id WHERE ri2.return_id = ret.id GROUP BY CASE WHEN p2.pallet_qty > 0 THEN p2.pallet_qty ELSE 40 END))`

// ==================== GEOCODING HELPER (Multi-Provider) ====================
// South Florida bounding box (Palm Beach / Broward / Miami-Dade area)
const SF_VIEWBOX = { west: -80.9, south: 25.7, east: -79.8, north: 27.2 }
const SF_CENTER = { lat: 26.65, lng: -80.25 }

// Clean up street address for better geocoding
function normalizeStreet(street: string): string {
  return street
    .replace(/\./g, '')              // "DR." → "DR"
    .replace(/\s+/g, ' ')           // collapse whitespace
    .replace(/\bN\b/gi, 'North')    // Expand abbreviations
    .replace(/\bS\b/gi, 'South')
    .replace(/\bE\b/gi, 'East')
    .replace(/\bW\b/gi, 'West')
    .trim()
}

// Check if coordinates are within South Florida region
function isInSouthFlorida(lat: number, lng: number): boolean {
  return lat >= SF_VIEWBOX.south && lat <= SF_VIEWBOX.north &&
         lng >= SF_VIEWBOX.west && lng <= SF_VIEWBOX.east
}

// Strategy 1: Google Maps Geocoding (best accuracy, needs API key)
async function geocodeGoogle(street: string, city: string, state: string, zip: string | undefined, apiKey: string): Promise<{lat: number, lng: number, source: string} | null> {
  try {
    const address = encodeURIComponent(`${street}, ${city}, ${state}${zip ? ' ' + zip : ''}, USA`)
    const resp = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${address}&key=${apiKey}&bounds=${SF_VIEWBOX.south},${SF_VIEWBOX.west}|${SF_VIEWBOX.north},${SF_VIEWBOX.east}`
    )
    const data = await resp.json() as any
    if (data.status === 'OK' && data.results?.length > 0) {
      const loc = data.results[0].geometry.location
      if (isInSouthFlorida(loc.lat, loc.lng)) {
        return { lat: loc.lat, lng: loc.lng, source: 'google' }
      }
    }
  } catch (e) { /* google geocoding failed */ }
  return null
}

// Strategy 2: Nominatim structured query with South FL viewbox bias
async function geocodeNominatim(street: string, city: string, state: string, zip?: string): Promise<{lat: number, lng: number, source: string} | null> {
  try {
    // Try structured query first (more accurate)
    const params = new URLSearchParams({
      format: 'json', limit: '3', countrycodes: 'us',
      street: street, city: city, state: state,
      viewbox: `${SF_VIEWBOX.west},${SF_VIEWBOX.north},${SF_VIEWBOX.east},${SF_VIEWBOX.south}`,
      bounded: '0'
    })
    if (zip) params.set('postalcode', zip)
    const resp = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'BFDeliver/1.0 (delivery-management)' }
    })
    const results = await resp.json() as any[]
    if (results?.length > 0) {
      const r = results[0]
      const lat = parseFloat(r.lat), lng = parseFloat(r.lon)
      if (isInSouthFlorida(lat, lng)) return { lat, lng, source: 'nominatim-structured' }
    }

    // Fallback: free-text query
    await new Promise(r => setTimeout(r, 1100)) // Nominatim rate limit
    const q = encodeURIComponent(`${street}, ${city}, ${state}${zip ? ' ' + zip : ''}`)
    const resp2 = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=3&countrycodes=us&viewbox=${SF_VIEWBOX.west},${SF_VIEWBOX.north},${SF_VIEWBOX.east},${SF_VIEWBOX.south}&bounded=0`,
      { headers: { 'User-Agent': 'BFDeliver/1.0 (delivery-management)' } }
    )
    const results2 = await resp2.json() as any[]
    if (results2?.length > 0) {
      const r = results2[0]
      const lat = parseFloat(r.lat), lng = parseFloat(r.lon)
      if (isInSouthFlorida(lat, lng)) return { lat, lng, source: 'nominatim-freetext' }
    }
  } catch (e) { /* nominatim failed */ }
  return null
}

// Strategy 3: Photon geocoder (OSM-based, better fuzzy matching)
async function geocodePhoton(street: string, city: string, state: string, zip?: string): Promise<{lat: number, lng: number, source: string} | null> {
  try {
    const q = encodeURIComponent(`${street}, ${city}, ${state}${zip ? ' ' + zip : ''}`)
    const resp = await fetch(
      `https://photon.komoot.io/api/?q=${q}&limit=5&lat=${SF_CENTER.lat}&lon=${SF_CENTER.lng}&lang=en`
    )
    const data = await resp.json() as any
    if (data.features?.length > 0) {
      // Find the best match within South Florida
      for (const f of data.features) {
        const [lng, lat] = f.geometry.coordinates
        if (isInSouthFlorida(lat, lng)) {
          return { lat, lng, source: 'photon' }
        }
      }
    }
  } catch (e) { /* photon failed */ }
  return null
}

// Strategy 4: ZIP code centroid (last resort — approximate but better than nothing)
const ZIP_CENTROIDS: Record<string, {lat: number, lng: number}> = {
  '33470': { lat: 26.6849, lng: -80.2589 },  // Loxahatchee / Loxahatchee Groves
  '33414': { lat: 26.7081, lng: -80.2025 },  // Wellington / Jupiter Farms area
  '33418': { lat: 26.8384, lng: -80.1565 },  // Palm Beach Gardens
  '33458': { lat: 26.9261, lng: -80.1076 },  // Jupiter
  '33478': { lat: 26.9384, lng: -80.1754 },  // Jupiter (west)
  '33411': { lat: 26.6783, lng: -80.1761 },  // Royal Palm Beach
  '33412': { lat: 26.7957, lng: -80.1874 },  // West Palm Beach (west)
  '33415': { lat: 26.6523, lng: -80.1267 },  // West Palm Beach
  '33417': { lat: 26.7153, lng: -80.1088 },  // West Palm Beach (north)
  '33401': { lat: 26.7153, lng: -80.0534 },  // West Palm Beach (downtown)
  '33409': { lat: 26.7021, lng: -80.1051 },  // West Palm Beach
  '33410': { lat: 26.8123, lng: -80.0889 },  // Palm Beach Gardens (east)
  '33413': { lat: 26.6641, lng: -80.1515 },  // Greenacres
  '33428': { lat: 26.3535, lng: -80.2285 },  // Boca Raton (west)
  '33437': { lat: 26.5291, lng: -80.1693 },  // Boynton Beach (west)
  '33467': { lat: 26.5935, lng: -80.1783 },  // Lake Worth (west)
  '33476': { lat: 26.7259, lng: -80.6312 },  // Pahokee
  '33430': { lat: 26.6518, lng: -80.6345 },  // Belle Glade
  '33440': { lat: 26.5891, lng: -80.8124 },  // Clewiston
  '33493': { lat: 26.5634, lng: -80.5603 },  // South Bay
  '33438': { lat: 26.5917, lng: -80.4401 },  // Canal Point
}

async function geocodeZipFallback(zip?: string): Promise<{lat: number, lng: number, source: string} | null> {
  if (!zip) return null
  const centroid = ZIP_CENTROIDS[zip]
  if (centroid) return { lat: centroid.lat, lng: centroid.lng, source: 'zip-centroid' }
  return null
}

// Main geocoding function — tries multiple providers in order
async function geocodeAddress(street: string, city: string, state: string, zip?: string, googleApiKey?: string): Promise<{lat: number, lng: number, source?: string} | null> {
  const cleanStreet = normalizeStreet(street)

  // 1. Google Maps (if API key is available — best for rural addresses)
  if (googleApiKey) {
    const google = await geocodeGoogle(cleanStreet, city, state, zip, googleApiKey)
    if (google) return google
  }

  // 2. Nominatim with structured query + viewbox bias
  const nominatim = await geocodeNominatim(cleanStreet, city, state, zip)
  if (nominatim) return nominatim

  // 3. Photon geocoder with South Florida proximity bias
  const photon = await geocodePhoton(cleanStreet, city, state, zip)
  if (photon) return photon

  // 4. ZIP code centroid (approximate — marks as such)
  const zipFallback = await geocodeZipFallback(zip)
  if (zipFallback) return zipFallback

  return null
}

// ==================== AUTH API ====================
app.post('/api/auth/login', async (c) => {
  const { email, password } = await c.req.json()
  const user = await c.env.DB.prepare(
    'SELECT id, email, name, role, phone FROM users WHERE email = ? AND password_hash = ? AND active = 1'
  ).bind(email, password).first()
  if (!user) return c.json({ error: 'Invalid credentials' }, 401)
  return c.json({ user, token: btoa(JSON.stringify({ id: user.id, role: user.role })) })
})

app.get('/api/auth/me', async (c) => {
  const auth = c.req.header('Authorization')
  if (!auth) return c.json({ error: 'No auth' }, 401)
  try {
    const payload = JSON.parse(atob(auth.replace('Bearer ', '')))
    const user = await c.env.DB.prepare('SELECT id, email, name, role, phone FROM users WHERE id = ?').bind(payload.id).first()
    return user ? c.json({ user }) : c.json({ error: 'Not found' }, 404)
  } catch { return c.json({ error: 'Invalid token' }, 401) }
})

// ==================== DASHBOARD API ====================
app.get('/api/dashboard/stats', async (c) => {
  const today = new Date().toISOString().split('T')[0]
  const [totalOrders, todayOrders, pendingOrders, inTransit, completedToday, totalCustomers, totalProducts, urgentOrders] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as c FROM orders WHERE archived = 0').first(),
    c.env.DB.prepare("SELECT COUNT(*) as c FROM orders WHERE archived = 0 AND scheduled_date = ?").bind(today).first(),
    c.env.DB.prepare("SELECT COUNT(*) as c FROM orders WHERE archived = 0 AND status IN ('new','confirmed','scheduled')").first(),
    c.env.DB.prepare("SELECT COUNT(*) as c FROM orders WHERE archived = 0 AND status = 'in_transit'").first(),
    c.env.DB.prepare("SELECT COUNT(*) as c FROM orders WHERE archived = 0 AND status IN ('delivered','completed') AND scheduled_date = ?").bind(today).first(),
    c.env.DB.prepare('SELECT COUNT(*) as c FROM customers WHERE active = 1').first(),
    c.env.DB.prepare('SELECT COUNT(*) as c FROM products WHERE active = 1').first(),
    c.env.DB.prepare("SELECT COUNT(*) as c FROM orders WHERE archived = 0 AND priority = 'urgent' AND status NOT IN ('delivered','completed','cancelled')").first(),
  ])
  const recentOrders = await c.env.DB.prepare(
    `SELECT o.*, c.business_name, a.street, a.city, CAST(a.lat AS REAL) as addr_lat, CAST(a.lng AS REAL) as addr_lng
    FROM orders o JOIN customers c ON o.customer_id = c.id LEFT JOIN addresses a ON o.address_id = a.id
    WHERE o.archived = 0 ORDER BY o.created_at DESC LIMIT 10`
  ).all()
  // Fetch ALL active non-completed/cancelled orders for map (both unrouted and routed)
  const pendingMapOrders = await c.env.DB.prepare(
    `SELECT o.id, o.order_number, o.priority, o.scheduled_date, o.status, c.business_name, a.street, a.city,
    CAST(a.lat AS REAL) as addr_lat, CAST(a.lng AS REAL) as addr_lng,
    rs.route_id, r.route_number, r.date as route_date,
    (SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi WHERE oi.order_id = o.id) as item_count,
    ${PALLET_SQL_ORDER} as pallet_count
    FROM orders o JOIN customers c ON o.customer_id = c.id LEFT JOIN addresses a ON o.address_id = a.id
    LEFT JOIN route_stops rs ON rs.order_id = o.id
    LEFT JOIN routes r ON rs.route_id = r.id
    WHERE o.archived = 0 AND o.status NOT IN ('completed','cancelled','delivered')
    ORDER BY o.created_at DESC LIMIT 100`
  ).all()
  const todayRoutes = await c.env.DB.prepare(
    `SELECT r.*, u.name as driver_name, t.name as truck_name FROM routes r LEFT JOIN users u ON r.driver_id = u.id LEFT JOIN trucks t ON r.truck_id = t.id WHERE r.date = ? AND r.archived = 0`
  ).bind(today).all()
  const statusBreakdown = await c.env.DB.prepare('SELECT status, COUNT(*) as count FROM orders WHERE archived = 0 GROUP BY status').all()
  const priorityBreakdown = await c.env.DB.prepare("SELECT priority, COUNT(*) as count FROM orders WHERE archived = 0 AND status NOT IN ('delivered','completed','cancelled') GROUP BY priority").all()
  // Fetch actionable returns with coordinates for map
  const pendingReturns = await c.env.DB.prepare(
    `SELECT ret.id, ret.status, ret.customer_id, ret.route_id, ret.notes, ret.scheduled_date, c.business_name,
     a.street, a.city, CAST(a.lat AS REAL) as addr_lat, CAST(a.lng AS REAL) as addr_lng,
     o.order_number,
     (SELECT COALESCE(SUM(ri.expected_qty),0) FROM return_items ri WHERE ri.return_id = ret.id) as total_units,
     ${PALLET_SQL_RETURN} as pallet_count
     FROM returns ret
     JOIN customers c ON ret.customer_id = c.id
     LEFT JOIN orders o ON ret.order_id = o.id
     LEFT JOIN addresses a ON COALESCE(o.address_id, (SELECT id FROM addresses WHERE customer_id = ret.customer_id LIMIT 1)) = a.id
     WHERE ret.status IN ('pending','approved')
     ORDER BY ret.created_at DESC`
  ).all()
  return c.json({
    stats: {
      totalOrders: (totalOrders as any)?.c || 0,
      todayOrders: (todayOrders as any)?.c || 0,
      pendingOrders: (pendingOrders as any)?.c || 0,
      inTransit: (inTransit as any)?.c || 0,
      completedToday: (completedToday as any)?.c || 0,
      totalCustomers: (totalCustomers as any)?.c || 0,
      totalProducts: (totalProducts as any)?.c || 0,
      urgentOrders: (urgentOrders as any)?.c || 0,
    },
    recentOrders: (recentOrders.results as any[]).map((o: any) => ({ ...o, lat: o.addr_lat ?? null, lng: o.addr_lng ?? null })),
    pendingMapOrders: (pendingMapOrders.results as any[]).map((o: any) => ({ ...o, lat: o.addr_lat ?? null, lng: o.addr_lng ?? null })),
    pendingReturns: (pendingReturns.results as any[]).map((r: any) => ({ ...r, lat: r.addr_lat ?? null, lng: r.addr_lng ?? null })),
    todayRoutes: todayRoutes.results,
    statusBreakdown: statusBreakdown.results,
    priorityBreakdown: priorityBreakdown.results,
  })
})

// ==================== ORDERS API ====================
app.get('/api/orders', async (c) => {
  const statuses = c.req.queries('status') || []
  const status = statuses.length === 1 ? statuses[0] : null
  const priority = c.req.query('priority')
  const date = c.req.query('date')
  const search = c.req.query('search')
  const limit = parseInt(c.req.query('limit') || '2000')
  const offset = parseInt(c.req.query('offset') || '0')
  let query = `SELECT o.*, c.business_name, c.contact_name, c.phone as customer_phone,
    a.street, a.city, a.zip, a.gate_code, a.driver_notes as address_notes, CAST(a.lat AS REAL) as addr_lat, CAST(a.lng AS REAL) as addr_lng,
    a.truck_requirement, a.driver_restrictions,
    rs.route_id, r.route_number, r.status as route_status, r.date as route_date,
    (SELECT COUNT(*) FROM returns ret WHERE ret.order_id = o.id) as return_count,
    (SELECT ret2.status FROM returns ret2 WHERE ret2.order_id = o.id ORDER BY ret2.created_at DESC LIMIT 1) as return_status,
    (SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi WHERE oi.order_id = o.id) as item_count,
    ${PALLET_SQL_ORDER} as pallet_count
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    LEFT JOIN addresses a ON o.address_id = a.id
    LEFT JOIN route_stops rs ON rs.order_id = o.id
    LEFT JOIN routes r ON rs.route_id = r.id WHERE 1=1`
  const params: any[] = []
  if (c.req.query('include_archived') !== '1') { query += ' AND o.archived = 0' }
  // Support multiple status values: ?status=new&status=confirmed
  if (statuses.length > 1) {
    const placeholders = statuses.map(() => '?').join(',')
    query += ` AND o.status IN (${placeholders})`
    params.push(...statuses)
  } else if (status && status !== 'on_hold') { query += ' AND o.status = ?'; params.push(status) }
  if (status === 'on_hold' || statuses.includes('on_hold')) { query += " AND o.special_instructions LIKE '%[HOLD_STATUS:%'"; }
  if (priority) { query += ' AND o.priority = ?'; params.push(priority) }
  if (date) { query += ' AND o.scheduled_date = ?'; params.push(date) }
  if (search) { query += ' AND (c.business_name LIKE ? OR o.order_number LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  query += ' ORDER BY CASE o.priority WHEN "urgent" THEN 1 WHEN "high" THEN 2 WHEN "normal" THEN 3 WHEN "low" THEN 4 END, o.scheduled_date ASC'
  query += ' LIMIT ? OFFSET ?'
  params.push(limit, offset)
  const stmt = c.env.DB.prepare(query)
  const result = await stmt.bind(...params).all()
  // Post-process: mark orders with [HOLD_STATUS:] as 'on_hold' virtual status + fix lat/lng
  const orders = (result.results as any[]).map((o: any) => {
    const row = { ...o, lat: o.addr_lat ?? null, lng: o.addr_lng ?? null }
    delete row.addr_lat; delete row.addr_lng
    if (row.special_instructions?.includes('[HOLD_STATUS:')) {
      return { ...row, status: 'on_hold', _db_status: row.status }
    }
    return row
  })
  return c.json({ orders })
})

app.get('/api/orders/:id', async (c) => {
  const id = c.req.param('id')
  const order = await c.env.DB.prepare(
    `SELECT o.*, c.business_name, c.contact_name, c.phone as customer_phone, c.email as customer_email,
    a.street, a.city, a.state, a.zip, CAST(a.lat AS REAL) as addr_lat, CAST(a.lng AS REAL) as addr_lng, a.gate_code, a.driver_notes as address_notes,
    a.truck_requirement, a.driver_restrictions,
    rs.route_id, r.route_number, r.status as route_status, r.date as route_date
    FROM orders o JOIN customers c ON o.customer_id = c.id LEFT JOIN addresses a ON o.address_id = a.id
    LEFT JOIN route_stops rs ON rs.order_id = o.id LEFT JOIN routes r ON rs.route_id = r.id WHERE o.id = ?`
  ).bind(id).first() as any
  if (!order) return c.json({ error: 'Order not found' }, 404)
  if (order) { order.lat = order.addr_lat ?? null; order.lng = order.addr_lng ?? null; delete order.addr_lat; delete order.addr_lng; }
  const items = await c.env.DB.prepare(
    `SELECT oi.*, p.name as product_name, p.sku, p.category, p.weight_per_unit, p.unit_type, p.price
    FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`
  ).bind(id).all()
  const proof = await c.env.DB.prepare('SELECT * FROM delivery_proofs WHERE order_id = ?').bind(id).first()
  // Fetch ticket image from separate table
  let ticketImage = null
  try {
    const ti = await c.env.DB.prepare('SELECT image_data FROM ticket_images WHERE order_id = ?').bind(id).first() as any
    if (ti) ticketImage = ti.image_data
  } catch (e) { /* table may not exist yet */ }
  // Check for hold status
  let orderData = { ...order as any, ticket_image: ticketImage }
  if (orderData.special_instructions?.includes('[HOLD_STATUS:')) {
    orderData = { ...orderData, status: 'on_hold', _db_status: orderData.status }
  }
  // Fetch recurring schedule info if linked
  let recurringSchedule = null
  if (orderData.recurring_schedule_id) {
    try {
      recurringSchedule = await c.env.DB.prepare(
        'SELECT id, frequency, interval_days, day_of_week, day_of_month, status, next_delivery_date, auto_confirm FROM recurring_schedules WHERE id = ?'
      ).bind(orderData.recurring_schedule_id).first()
    } catch (e) { /* table may not exist yet */ }
  }
  // Fetch returns linked to this order
  let returns: any[] = []
  try {
    const retResult = await c.env.DB.prepare(
      `SELECT ret.*, u.name as created_by_name, r.route_number
       FROM returns ret LEFT JOIN users u ON ret.created_by = u.id LEFT JOIN routes r ON ret.route_id = r.id
       WHERE ret.order_id = ? ORDER BY ret.created_at DESC`
    ).bind(id).all()
    for (const ret of retResult.results as any[]) {
      const ri = await c.env.DB.prepare(
        'SELECT ri.*, p.name as product_name, p.sku, p.unit_type, p.pallet_qty FROM return_items ri JOIN products p ON ri.product_id = p.id WHERE ri.return_id = ?'
      ).bind(ret.id).all()
      ret.items = ri.results
    }
    returns = retResult.results as any[]
  } catch (e) { /* returns table may not exist */ }
  return c.json({ order: orderData, items: items.results, proof, recurring_schedule: recurringSchedule, returns })
})

app.post('/api/orders', async (c) => {
  try {
    const body = await c.req.json()
    const { customer_id, address_id, priority, special_instructions, items, ticket_image } = body
    // Sanitize scheduled_date to YYYY-MM-DD only (strip any time component)
    const scheduled_date = body.scheduled_date ? String(body.scheduled_date).substring(0, 10) : null
    // Use user-provided order number (from ticket) or auto-generate with random suffix
    let orderNum = body.order_number?.trim() || ('BF-' + Math.floor(10000 + Math.random() * 90000))
    
    // Try to insert, retry with modified number if duplicate
    let res
    let retries = 3
    while (retries > 0) {
      try {
        res = await c.env.DB.prepare(
          `INSERT INTO orders (order_number, customer_id, address_id, status, priority, scheduled_date, special_instructions, created_by)
          VALUES (?, ?, ?, 'new', ?, ?, ?, ?)`
        ).bind(orderNum, customer_id, address_id || null, priority || 'normal', scheduled_date || null, special_instructions || null, body.created_by || null).run()
        break
      } catch (e: any) {
        if (e.message?.includes('UNIQUE constraint') && retries > 1) {
          // Append random suffix to make it unique
          orderNum = (body.order_number?.trim() || 'BF') + '-' + Math.floor(10000 + Math.random() * 90000)
          retries--
        } else {
          throw e
        }
      }
    }
    const orderId = res!.meta.last_row_id
    if (items && items.length > 0) {
      for (const item of items) {
        await c.env.DB.prepare('INSERT INTO order_items (order_id, product_id, quantity) VALUES (?, ?, ?)')
          .bind(orderId, item.product_id, item.quantity).run()
      }
    }

    // Store ticket image in separate table to avoid D1 size limits
    if (ticket_image) {
      try {
        await c.env.DB.prepare('CREATE TABLE IF NOT EXISTS ticket_images (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER UNIQUE NOT NULL, image_data TEXT NOT NULL, created_at TEXT DEFAULT (datetime(\'now\')), FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE)').run()
        await c.env.DB.prepare('INSERT OR REPLACE INTO ticket_images (order_id, image_data) VALUES (?, ?)').bind(orderId, ticket_image).run()
      } catch (e) { console.error('Failed to store ticket image:', e) }
    }

    return c.json({ id: orderId, order_number: orderNum }, 201)
  } catch (e: any) {
    const msg = e.message || String(e)
    if (msg.includes('UNIQUE constraint')) {
      return c.json({ error: 'An order with this number already exists. Clear the order number field to auto-generate one.' }, 409)
    }
    return c.json({ error: 'Failed to create order', detail: msg }, 500)
  }
})

app.put('/api/orders/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  // Sanitize scheduled_date to YYYY-MM-DD only
  if (body.scheduled_date) body.scheduled_date = String(body.scheduled_date).substring(0, 10)
  const fields: string[] = []
  const vals: any[] = []
  for (const key of ['status', 'priority', 'scheduled_date', 'special_instructions', 'address_id', 'customer_id', 'order_number', 'recurring_schedule_id']) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); vals.push(body[key]) }
  }
  if (body.items) {
    await c.env.DB.prepare('DELETE FROM order_items WHERE order_id = ?').bind(id).run()
    for (const item of body.items) {
      await c.env.DB.prepare('INSERT INTO order_items (order_id, product_id, quantity) VALUES (?, ?, ?)')
        .bind(id, item.product_id, item.quantity).run()
    }
  }
  if (fields.length === 0 && !body.items) return c.json({ error: 'No fields to update' }, 400)
  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')")
    vals.push(id)
    await c.env.DB.prepare(`UPDATE orders SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run()
  } else {
    // Items were updated, just touch the timestamp
    await c.env.DB.prepare("UPDATE orders SET updated_at = datetime('now') WHERE id = ?").bind(id).run()
  }
  return c.json({ success: true })
})

app.patch('/api/orders/:id/status', async (c) => {
  const id = c.req.param('id')
  const { status } = await c.req.json()

  // If reverting from scheduled to confirmed, ensure order is not on a route
  if (status === 'confirmed') {
    const order = await c.env.DB.prepare('SELECT status FROM orders WHERE id = ?').bind(id).first() as any
    if (order && order.status === 'scheduled') {
      const onRoute = await c.env.DB.prepare('SELECT id FROM route_stops WHERE order_id = ?').bind(id).first()
      if (onRoute) {
        return c.json({ error: 'Cannot revert to confirmed — order is assigned to a route. Remove it from the route first.' }, 400)
      }
    }
  }

  await c.env.DB.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(status, id).run()
  return c.json({ success: true })
})

app.delete('/api/orders/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM order_items WHERE order_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ==================== BULK ORDER UPLOAD API ====================

// Helper: fuzzy match a string against a list (returns best match or null)
function fuzzyMatch(input: string, candidates: {id: number, name: string, aliases?: string[]}[], threshold = 0.4): {id: number, name: string, score: number} | null {
  if (!input || !candidates.length) return null
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const inputN = normalize(input)
  if (!inputN) return null

  let best: {id: number, name: string, score: number} | null = null

  for (const c of candidates) {
    // Exact match (normalized)
    if (normalize(c.name) === inputN) return { id: c.id, name: c.name, score: 1.0 }
    // Check aliases too
    if (c.aliases) {
      for (const a of c.aliases) {
        if (normalize(a) === inputN) return { id: c.id, name: c.name, score: 1.0 }
      }
    }
    // Contains match
    const nameN = normalize(c.name)
    if (nameN.includes(inputN) || inputN.includes(nameN)) {
      const score = Math.min(inputN.length, nameN.length) / Math.max(inputN.length, nameN.length)
      if (!best || score > best.score) best = { id: c.id, name: c.name, score: Math.max(score, 0.6) }
    }
    // Word overlap scoring
    const inputWords = input.toLowerCase().split(/\s+/)
    const nameWords = c.name.toLowerCase().split(/\s+/)
    let wordMatches = 0
    for (const iw of inputWords) {
      for (const nw of nameWords) {
        if (nw.includes(iw) || iw.includes(nw)) { wordMatches++; break }
      }
    }
    const wordScore = wordMatches / Math.max(inputWords.length, nameWords.length)
    if (wordScore > threshold && (!best || wordScore > best.score)) {
      best = { id: c.id, name: c.name, score: wordScore }
    }
  }

  return best && best.score >= threshold ? best : null
}

// Parse bulk orders: accepts array of order objects with flexible field names
app.post('/api/orders/bulk-parse', async (c) => {
  try {
    const body = await c.req.json()
    const { orders: rawOrders } = body
    if (!rawOrders || !Array.isArray(rawOrders) || rawOrders.length === 0) {
      return c.json({ error: 'No orders provided. Send an array of order objects.' }, 400)
    }

    // Load customers and products for matching
    const custRes = await c.env.DB.prepare(
      'SELECT id, business_name, contact_name FROM customers WHERE active = 1'
    ).all()
    const prodRes = await c.env.DB.prepare(
      'SELECT id, name, sku, unit_type, pallet_qty, price, weight_per_unit FROM products WHERE active = 1'
    ).all()
    const customers = (custRes.results as any[]).map(c => ({
      id: c.id, name: c.business_name, aliases: c.contact_name ? [c.contact_name] : []
    }))
    const products = (prodRes.results as any[]).map(p => ({
      id: p.id, name: p.name, sku: p.sku, aliases: p.sku ? [p.sku] : [],
      unit_type: p.unit_type, pallet_qty: p.pallet_qty, price: p.price, weight_per_unit: p.weight_per_unit
    }))

    // Also get customer addresses
    const addrRes = await c.env.DB.prepare(
      'SELECT id, customer_id, street, city, state, zip, is_primary FROM addresses ORDER BY is_primary DESC'
    ).all()
    const addressesByCustomer: Record<number, any[]> = {}
    for (const a of addrRes.results as any[]) {
      if (!addressesByCustomer[a.customer_id]) addressesByCustomer[a.customer_id] = []
      addressesByCustomer[a.customer_id].push(a)
    }

    const parsed: any[] = []
    let warnings: string[] = []

    for (let i = 0; i < rawOrders.length; i++) {
      const raw = rawOrders[i]
      const rowNum = i + 1
      const result: any = {
        row: rowNum,
        input: raw,
        customer_match: null,
        address_id: null,
        items: [],
        priority: raw.priority || 'normal',
        scheduled_date: raw.scheduled_date || raw.date || null,
        order_number: raw.order_number || raw.ticket_number || null,
        special_instructions: raw.special_instructions || raw.notes || '',
        status: 'ready', // ready, warning, error
        issues: []
      }

      // Match customer
      const custInput = raw.customer || raw.customer_name || raw.business_name || raw.farm || ''
      if (!custInput) {
        result.status = 'error'
        result.issues.push('No customer name provided')
      } else {
        const match = fuzzyMatch(custInput, customers)
        if (match) {
          result.customer_match = { id: match.id, name: match.name, score: match.score, input: custInput }
          // Auto-pick primary address
          const addrs = addressesByCustomer[match.id]
          if (addrs && addrs.length > 0) {
            result.address_id = addrs[0].id
            result.address_display = `${addrs[0].street}, ${addrs[0].city}`
          }
          if (match.score < 0.8) {
            result.issues.push(`Customer "${custInput}" matched to "${match.name}" (${Math.round(match.score*100)}% confidence)`)
            if (result.status !== 'error') result.status = 'warning'
          }
        } else {
          result.status = 'error'
          result.issues.push(`Customer "${custInput}" not found. Please add the customer first.`)
        }
      }

      // Match products
      const rawItems = raw.items || raw.products || []
      if (Array.isArray(rawItems) && rawItems.length > 0) {
        for (const ri of rawItems) {
          const prodInput = ri.product || ri.name || ri.sku || ''
          const qty = parseInt(ri.quantity || ri.qty || '1') || 1
          if (!prodInput) continue

          // Try SKU match first (exact)
          let prodMatch = products.find(p => p.sku && p.sku.toLowerCase() === prodInput.toLowerCase())
          if (prodMatch) {
            result.items.push({
              product_id: prodMatch.id, product_name: prodMatch.name, sku: prodMatch.sku,
              quantity: qty, match_score: 1.0, input: prodInput, unit_type: prodMatch.unit_type
            })
          } else {
            // Fuzzy match product name
            const match = fuzzyMatch(prodInput, products.map(p => ({ id: p.id, name: p.name, aliases: p.sku ? [p.sku] : [] })))
            if (match) {
              const prod = products.find(p => p.id === match.id)
              result.items.push({
                product_id: match.id, product_name: match.name, sku: prod?.sku,
                quantity: qty, match_score: match.score, input: prodInput, unit_type: prod?.unit_type
              })
              if (match.score < 0.8) {
                result.issues.push(`Product "${prodInput}" matched to "${match.name}" (${Math.round(match.score*100)}%)`)
                if (result.status !== 'error') result.status = 'warning'
              }
            } else {
              result.issues.push(`Product "${prodInput}" not found`)
              if (result.status !== 'error') result.status = 'warning'
              result.items.push({
                product_id: null, product_name: prodInput, sku: null,
                quantity: qty, match_score: 0, input: prodInput, unit_type: null
              })
            }
          }
        }
      } else if (raw.product || raw.product_name) {
        // Single-product shorthand
        const prodInput = raw.product || raw.product_name || ''
        const qty = parseInt(raw.quantity || raw.qty || '1') || 1
        const match = fuzzyMatch(prodInput, products.map(p => ({ id: p.id, name: p.name, aliases: p.sku ? [p.sku] : [] })))
        if (match) {
          const prod = products.find(p => p.id === match.id)
          result.items.push({
            product_id: match.id, product_name: match.name, sku: prod?.sku,
            quantity: qty, match_score: match.score, input: prodInput, unit_type: prod?.unit_type
          })
        } else {
          result.issues.push(`Product "${prodInput}" not found`)
          if (result.status !== 'error') result.status = 'warning'
        }
      }

      if (result.items.length === 0 && result.status !== 'error') {
        result.issues.push('No products matched')
        result.status = 'warning'
      }

      parsed.push(result)
    }

    const summary = {
      total: parsed.length,
      ready: parsed.filter(p => p.status === 'ready').length,
      warnings: parsed.filter(p => p.status === 'warning').length,
      errors: parsed.filter(p => p.status === 'error').length,
    }

    return c.json({ success: true, parsed, summary, customers: custRes.results, products: prodRes.results })
  } catch (e: any) {
    console.error('Bulk parse error:', e)
    return c.json({ error: 'Failed to parse orders', detail: e?.message || String(e) }, 500)
  }
})

// Confirm bulk orders: create all parsed orders at once
app.post('/api/orders/bulk-confirm', async (c) => {
  try {
    const body = await c.req.json()
    const { orders } = body
    // orders: array of { customer_id, address_id, items: [{product_id, quantity}], priority, scheduled_date, order_number, special_instructions }

    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return c.json({ error: 'No orders to create' }, 400)
    }

    const created: any[] = []
    const errors: any[] = []

    for (let i = 0; i < orders.length; i++) {
      const o = orders[i]
      try {
        if (!o.customer_id) { errors.push({ row: i+1, error: 'Missing customer_id' }); continue }
        
        const orderNum = o.order_number?.trim() || ('BF-' + (Date.now() % 100000) + '-' + (i+1))
        const res = await c.env.DB.prepare(
          `INSERT INTO orders (order_number, customer_id, address_id, status, priority, scheduled_date, special_instructions, created_by)
          VALUES (?, ?, ?, 'new', ?, ?, ?, ?)`
        ).bind(orderNum, o.customer_id, o.address_id || null, o.priority || 'normal', o.scheduled_date || null, o.special_instructions || null, o.created_by || null).run()
        const orderId = res.meta.last_row_id

        if (o.items && o.items.length > 0) {
          for (const item of o.items) {
            if (item.product_id) {
              await c.env.DB.prepare('INSERT INTO order_items (order_id, product_id, quantity) VALUES (?, ?, ?)')
                .bind(orderId, item.product_id, item.quantity || 1).run()
            }
          }
        }

        created.push({ id: orderId, order_number: orderNum, customer_id: o.customer_id })
      } catch (e: any) {
        errors.push({ row: i+1, error: e?.message || String(e) })
      }
    }

    return c.json({ 
      success: true, 
      created_count: created.length, 
      error_count: errors.length, 
      created, 
      errors 
    }, 201)
  } catch (e: any) {
    console.error('Bulk confirm error:', e)
    return c.json({ error: 'Failed to create orders', detail: e?.message || String(e) }, 500)
  }
})

// ==================== CUSTOMERS API ====================
app.get('/api/customers', async (c) => {
  const search = c.req.query('search')
  const type = c.req.query('type')
  const incArchived = c.req.query('include_archived') === '1'
  let query = `SELECT c.*, t.name as preferred_truck_name, (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) as order_count, (SELECT COUNT(*) FROM addresses WHERE customer_id = c.id) as address_count, (SELECT COUNT(*) FROM addresses WHERE customer_id = c.id AND (lat IS NULL OR lng IS NULL)) as missing_coords FROM customers c LEFT JOIN trucks t ON c.preferred_truck_id = t.id WHERE ${incArchived ? '1=1' : 'c.active = 1'}`
  const params: any[] = []
  if (search) { query += ' AND (c.business_name LIKE ? OR c.contact_name LIKE ? OR c.phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`) }
  if (type) { query += ' AND c.customer_type = ?'; params.push(type) }
  query += ' ORDER BY c.business_name ASC'
  const result = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ customers: result.results })
})

app.get('/api/customers/:id', async (c) => {
  const id = c.req.param('id')
  const customer = await c.env.DB.prepare('SELECT c.*, t.name as preferred_truck_name FROM customers c LEFT JOIN trucks t ON c.preferred_truck_id = t.id WHERE c.id = ?').bind(id).first()
  if (!customer) return c.json({ error: 'Customer not found' }, 404)
  const addresses = await c.env.DB.prepare('SELECT * FROM addresses WHERE customer_id = ? ORDER BY is_primary DESC').bind(id).all()
  const orders = await c.env.DB.prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20').bind(id).all()
  return c.json({ customer, addresses: addresses.results, orders: orders.results })
})

app.post('/api/customers', async (c) => {
  const body = await c.req.json()
  const res = await c.env.DB.prepare(
    'INSERT INTO customers (business_name, contact_name, phone, email, customer_type, notes, preferred_truck_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(body.business_name, body.contact_name || null, body.phone || null, body.email || null, body.customer_type || 'farm', body.notes || null, body.preferred_truck_id || null).run()
  const newId = res.meta.last_row_id
  if (body.address) {
    let lat = null, lng = null
    if (body.address.street && body.address.city) {
      const coords = await geocodeAddress(body.address.street, body.address.city, body.address.state || 'FL', body.address.zip, c.env.GOOGLE_MAPS_API_KEY)
      if (coords) { lat = coords.lat; lng = coords.lng }
    }
    await c.env.DB.prepare(
      'INSERT INTO addresses (customer_id, street, city, state, zip, lat, lng, gate_code, driver_notes, is_primary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
    ).bind(newId, body.address.street, body.address.city, body.address.state || 'FL', body.address.zip || null, lat, lng, body.address.gate_code || null, body.address.driver_notes || null).run()
  }
  // Return full customer for inline creation
  const customer = await c.env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(newId).first()
  return c.json({ id: newId, customer }, 201)
})

app.put('/api/customers/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  await c.env.DB.prepare(
    'UPDATE customers SET business_name = ?, contact_name = ?, phone = ?, email = ?, customer_type = ?, notes = ?, preferred_truck_id = ? WHERE id = ?'
  ).bind(body.business_name, body.contact_name || null, body.phone || null, body.email || null, body.customer_type || 'farm', body.notes || null, body.preferred_truck_id !== undefined ? (body.preferred_truck_id || null) : null, id).run()
  return c.json({ success: true })
})

// ==================== ADDRESSES API ====================
app.get('/api/addresses/:id', async (c) => {
  const id = c.req.param('id')
  const address = await c.env.DB.prepare('SELECT * FROM addresses WHERE id = ?').bind(id).first()
  if (!address) return c.json({ error: 'Address not found' }, 404)
  return c.json({ address })
})

app.post('/api/addresses', async (c) => {
  const body = await c.req.json()
  // Auto-geocode if no lat/lng provided
  let lat = body.lat || null, lng = body.lng || null
  if (!lat && !lng && body.street && body.city) {
    const coords = await geocodeAddress(body.street, body.city, body.state || 'FL', body.zip, c.env.GOOGLE_MAPS_API_KEY)
    if (coords) { lat = coords.lat; lng = coords.lng }
  }
  const res = await c.env.DB.prepare(
    'INSERT INTO addresses (customer_id, label, street, city, state, zip, lat, lng, gate_code, driver_notes, is_primary, truck_requirement, driver_restrictions) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(body.customer_id, body.label || 'Primary', body.street, body.city, body.state || 'FL', body.zip || null, lat, lng, body.gate_code || null, body.driver_notes || null, body.is_primary || 0, body.truck_requirement || null, body.driver_restrictions || null).run()
  return c.json({ id: res.meta.last_row_id, lat, lng, geocoded: !!(lat && lng && !body.lat) }, 201)
})

app.put('/api/addresses/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  // Auto-geocode on address update
  let lat = body.lat || null, lng = body.lng || null
  if (!lat && !lng && body.street && body.city) {
    const coords = await geocodeAddress(body.street, body.city, body.state || 'FL', body.zip, c.env.GOOGLE_MAPS_API_KEY)
    if (coords) { lat = coords.lat; lng = coords.lng }
  }
  await c.env.DB.prepare(
    'UPDATE addresses SET label=?, street=?, city=?, state=?, zip=?, lat=?, lng=?, gate_code=?, driver_notes=?, is_primary=?, truck_requirement=?, driver_restrictions=? WHERE id=?'
  ).bind(body.label, body.street, body.city, body.state || 'FL', body.zip, lat, lng, body.gate_code || null, body.driver_notes || null, body.is_primary || 0, body.truck_requirement || null, body.driver_restrictions || null, id).run()
  return c.json({ success: true, lat, lng, geocoded: !!(lat && lng && !body.lat) })
})

app.delete('/api/addresses/:id', async (c) => {
  const id = c.req.param('id')
  const addr = await c.env.DB.prepare('SELECT id, customer_id FROM addresses WHERE id = ?').bind(id).first() as any
  if (!addr) return c.json({ error: 'Address not found' }, 404)
  // Don't allow deleting if orders reference this address
  const orderRef = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM orders WHERE address_id = ?').bind(id).first() as any
  if (orderRef?.cnt > 0) return c.json({ error: `Cannot delete: ${orderRef.cnt} order(s) use this address. Update those orders first.` }, 400)
  await c.env.DB.prepare('DELETE FROM addresses WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

app.post('/api/addresses/:id/geocode', async (c) => {
  const id = c.req.param('id')
  const addr = await c.env.DB.prepare('SELECT * FROM addresses WHERE id = ?').bind(id).first() as any
  if (!addr) return c.json({ error: 'Address not found' }, 404)
  const coords = await geocodeAddress(addr.street, addr.city, addr.state || 'FL', addr.zip, c.env.GOOGLE_MAPS_API_KEY)
  if (coords) {
    await c.env.DB.prepare('UPDATE addresses SET lat = ?, lng = ? WHERE id = ?').bind(coords.lat, coords.lng, id).run()
    return c.json({ success: true, lat: coords.lat, lng: coords.lng, source: (coords as any).source || 'unknown' })
  }
  return c.json({ success: false, error: 'Could not geocode address. Try editing the address or placing the pin manually on the map.' })
})

// Bulk re-geocode ALL addresses using Google Maps API
// Smart update logic:
//   1. Try Google Maps first (best accuracy for rural South FL addresses)
//   2. If Google succeeds → update coords
//   3. If Google fails AND address is stuck at a zip-centroid → try Nominatim/Photon to restore street-level precision
//   4. If Google fails AND address already has good (non-centroid) coords → keep them
//   5. If address has NO coords at all → try full fallback chain
app.post('/api/addresses/geocode-all', async (c) => {
  const apiKey = c.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return c.json({ error: 'Google Maps API key not configured' }, 400)
  // Known zip-centroid values — addresses stuck at these need re-geocoding
  const centroidSet = new Set(Object.values(ZIP_CENTROIDS).map(c => `${c.lat},${c.lng}`))
  const addresses = await c.env.DB.prepare('SELECT id, street, city, state, zip, lat, lng FROM addresses ORDER BY id').all()
  const results: any[] = []
  for (const addr of addresses.results as any[]) {
    const oldLat = addr.lat, oldLng = addr.lng
    const hasCoords = oldLat && oldLng && oldLat !== 0 && oldLng !== 0
    const isAtCentroid = hasCoords && centroidSet.has(`${oldLat},${oldLng}`)
    try {
      // Always try Google first (best accuracy)
      const cleanStreet = normalizeStreet(addr.street || '')
      const googleResult = await geocodeGoogle(cleanStreet, addr.city, addr.state || 'FL', addr.zip, apiKey)
      if (googleResult) {
        await c.env.DB.prepare('UPDATE addresses SET lat = ?, lng = ? WHERE id = ?').bind(googleResult.lat, googleResult.lng, addr.id).run()
        results.push({ id: addr.id, street: addr.street, city: addr.city, old: { lat: oldLat, lng: oldLng }, new: { lat: googleResult.lat, lng: googleResult.lng }, source: 'google', status: 'updated' })
        continue
      }
      // Google failed — check if coords are stuck at a zip centroid (imprecise)
      if (isAtCentroid || !hasCoords) {
        // Try Nominatim and Photon to get better street-level coords
        const nominatim = await geocodeNominatim(cleanStreet, addr.city, addr.state || 'FL', addr.zip)
        if (nominatim) {
          await c.env.DB.prepare('UPDATE addresses SET lat = ?, lng = ? WHERE id = ?').bind(nominatim.lat, nominatim.lng, addr.id).run()
          results.push({ id: addr.id, street: addr.street, city: addr.city, old: { lat: oldLat, lng: oldLng }, new: { lat: nominatim.lat, lng: nominatim.lng }, source: nominatim.source, status: 'updated' })
          continue
        }
        const photon = await geocodePhoton(cleanStreet, addr.city, addr.state || 'FL', addr.zip)
        if (photon) {
          await c.env.DB.prepare('UPDATE addresses SET lat = ?, lng = ? WHERE id = ?').bind(photon.lat, photon.lng, addr.id).run()
          results.push({ id: addr.id, street: addr.street, city: addr.city, old: { lat: oldLat, lng: oldLng }, new: { lat: photon.lat, lng: photon.lng }, source: photon.source, status: 'updated' })
          continue
        }
        // All providers failed — keep centroid if we have it, or mark failed
        if (hasCoords) {
          results.push({ id: addr.id, street: addr.street, city: addr.city, old: { lat: oldLat, lng: oldLng }, status: 'kept', reason: 'All providers failed, kept zip-centroid' })
        } else {
          // Last resort for truly empty coords — use zip centroid
          const zipFb = await geocodeZipFallback(addr.zip)
          if (zipFb) {
            await c.env.DB.prepare('UPDATE addresses SET lat = ?, lng = ? WHERE id = ?').bind(zipFb.lat, zipFb.lng, addr.id).run()
            results.push({ id: addr.id, street: addr.street, city: addr.city, old: { lat: oldLat, lng: oldLng }, new: { lat: zipFb.lat, lng: zipFb.lng }, source: 'zip-centroid', status: 'updated' })
          } else {
            results.push({ id: addr.id, street: addr.street, city: addr.city, old: { lat: oldLat, lng: oldLng }, status: 'failed', error: 'No geocode result from any provider' })
          }
        }
        continue
      }
      // Has good non-centroid coords — keep them
      results.push({ id: addr.id, street: addr.street, city: addr.city, old: { lat: oldLat, lng: oldLng }, status: 'kept', reason: 'Google failed but existing precise coords preserved' })
    } catch (e: any) {
      results.push({ id: addr.id, street: addr.street, city: addr.city, old: { lat: oldLat, lng: oldLng }, status: 'error', error: e.message })
    }
  }
  const updated = results.filter(r => r.status === 'updated').length
  const kept = results.filter(r => r.status === 'kept').length
  const failed = results.filter(r => r.status === 'failed' || r.status === 'error').length
  return c.json({ success: true, total: results.length, updated, kept, failed, results })
})

// Manual pin-drop: save user-placed coordinates for an address
app.put('/api/addresses/:id/coordinates', async (c) => {
  const id = c.req.param('id')
  const { lat, lng } = await c.req.json()
  if (!lat || !lng) return c.json({ error: 'lat and lng are required' }, 400)
  if (!isInSouthFlorida(lat, lng)) return c.json({ error: 'Coordinates appear to be outside the South Florida delivery area' }, 400)
  await c.env.DB.prepare('UPDATE addresses SET lat = ?, lng = ? WHERE id = ?').bind(lat, lng, id).run()
  return c.json({ success: true, lat, lng })
})



// ==================== PRODUCTS API ====================
app.get('/api/products', async (c) => {
  const category = c.req.query('category')
  const search = c.req.query('search')
  const incArchived = c.req.query('include_archived') === '1'
  let query = `SELECT * FROM products WHERE ${incArchived ? '1=1' : 'active = 1'}`
  const params: any[] = []
  if (category) { query += ' AND category = ?'; params.push(category) }
  if (search) { query += ' AND (name LIKE ? OR sku LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  query += ' ORDER BY category, name'
  const result = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ products: result.results })
})

app.post('/api/products', async (c) => {
  const body = await c.req.json()
  const res = await c.env.DB.prepare(
    'INSERT INTO products (name, sku, category, weight_per_unit, unit_type, price, stock_quantity, pallet_qty, pallet_weight, length_in, width_in, height_in, stackable, max_stack, bag_length_in, bag_width_in, bag_height_in) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(body.name, body.sku || null, body.category || 'other', body.weight_per_unit || 50, body.unit_type || 'bag', body.price || 0, body.stock_quantity || 0, body.pallet_qty || 0, body.pallet_weight || 0, body.length_in || 0, body.width_in || 0, body.height_in || 0, body.stackable ?? 1, body.max_stack || 3, body.bag_length_in || 0, body.bag_width_in || 0, body.bag_height_in || 0).run()
  const newId = res.meta.last_row_id
  const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(newId).first()
  return c.json({ id: newId, product }, 201)
})

app.put('/api/products/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const fields: string[] = []
  const vals: any[] = []
  for (const key of ['name','sku','category','weight_per_unit','unit_type','price','stock_quantity','pallet_qty','pallet_weight','length_in','width_in','height_in','stackable','max_stack','bag_length_in','bag_width_in','bag_height_in']) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); vals.push(body[key]) }
  }
  if (fields.length > 0) {
    vals.push(id)
    await c.env.DB.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run()
  }
  return c.json({ success: true })
})

// (Dispatch Rules removed — replaced by AI Learning Engine)

// ==================== TRUCK LOADING OPTIMIZER ====================
app.post('/api/trucks/:id/optimize-load', async (c) => {
  const truckId = c.req.param('id')
  const body = await c.req.json()
  const { order_ids } = body

  const truck = await c.env.DB.prepare(
    'SELECT * FROM trucks WHERE id = ?'
  ).bind(truckId).first() as any
  if (!truck) return c.json({ error: 'Truck not found' }, 404)

  const truckInfo = {
    maxPallets: truck.max_pallet_spots || 12,
    truckType: truck.truck_type || 'pallet',
  }

  // Get order items with product info
  const orderItems: any[] = []
  for (const oid of (order_ids || [])) {
    const items = await c.env.DB.prepare(
      `SELECT oi.*, p.name as product_name, p.pallet_qty, p.unit_type,
              o.order_number, o.business_name, o.special_instructions
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN (SELECT o.id, o.order_number, c.business_name, o.special_instructions FROM orders o JOIN customers c ON o.customer_id = c.id) o ON oi.order_id = o.id
       WHERE oi.order_id = ?`
    ).bind(oid).all()
    for (const item of items.results as any[]) {
      item.order_id = oid
      orderItems.push(item)
    }
  }

  // Group items per order and calculate pallets (items within an order share pallets by pallet_qty)
  const orderLoads: Record<number, any> = {}
  for (const item of orderItems) {
    if (!orderLoads[item.order_id]) {
      orderLoads[item.order_id] = {
        order_id: item.order_id, order_number: item.order_number, business_name: item.business_name,
        totalPallets: 0, items: [], _rawItems: []
      }
    }
    const palletQty = item.pallet_qty || 40
    const qty = item.quantity || 0
    orderLoads[item.order_id]._rawItems.push({ quantity: qty, pallet_qty: palletQty })
    orderLoads[item.order_id].items.push({
      product: item.product_name, quantity: qty, unit: item.unit_type || 'bags',
      per_pallet: palletQty
    })
  }
  // Calculate pallets per order using grouped logic
  for (const oid in orderLoads) {
    orderLoads[oid].totalPallets = calcPallets(orderLoads[oid]._rawItems)
  }

  // Build loading plan
  const orderList = (order_ids || []).map((id: number, seq: number) => ({
    id, seq, ...(orderLoads[id] || { items: [], totalPallets: 0 })
  }))
  const reversedOrders = [...orderList].reverse()

  const loadingPlan: any[] = []
  const warnings: string[] = []
  // Collect ALL items across all orders for route-level pallet calculation
  const allRouteItems: Array<{ quantity: number; pallet_qty: number }> = []

  for (const order of reversedOrders) {
    for (const item of (order.items || [])) {
      allRouteItems.push({ quantity: item.quantity, pallet_qty: item.per_pallet || 40 })
      loadingPlan.push({
        order_id: order.id,
        order_number: order.order_number,
        business_name: order.business_name,
        delivery_sequence: order.seq + 1,
        product: item.product,
        quantity: item.quantity,
        unit: item.unit,
        per_pallet: item.per_pallet || null,
      })
    }
  }
  // Route-level pallets: items across different orders share pallets
  const totalPallets = calcPallets(allRouteItems)

  // Capacity checks
  if (totalPallets > truckInfo.maxPallets) warnings.push(`${totalPallets} pallets exceed truck capacity of ${truckInfo.maxPallets} pallets`)
  else if (totalPallets > truckInfo.maxPallets * 0.9) warnings.push(`Pallet load at ${Math.round(totalPallets / truckInfo.maxPallets * 100)}% capacity`)
  return c.json({
    truck: { id: truck.id, name: truck.name, truck_type: truckInfo.truckType, max_pallets: truckInfo.maxPallets },
    loading_plan: loadingPlan,
    summary: {
      total_pallets: totalPallets,
      pallet_pct: truckInfo.maxPallets > 0 ? Math.round(totalPallets / truckInfo.maxPallets * 100) : 0,
    },
    warnings,
  })
})

// ==================== TRANSLATE INSTRUCTIONS ENDPOINT ====================
app.post('/api/translate-instructions', async (c) => {
  const body = await c.req.json()
  const { text, target_lang } = body
  if (!text || !target_lang || target_lang === 'en') return c.json({ translated: text })

  const apiKey = body.api_key || c.env.OPENAI_API_KEY
  const baseUrl = body.base_url || c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const model = body.model || c.env.OPENAI_MODEL || 'gpt-5-mini'
  if (!apiKey) return c.json({ translated: text, error: 'no_api_key' })

  const langName = target_lang === 'es' ? 'Spanish' : target_lang === 'ht' ? 'Haitian Creole' : 'English'
  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, max_tokens: 500,
        messages: [
          { role: 'system', content: `You are a translator for a feed delivery company in South Florida. Translate the following delivery instructions from English to ${langName}. Keep proper nouns (names, addresses, brand names, gate codes) unchanged. Return ONLY the translation, nothing else.` },
          { role: 'user', content: text }
        ]
      })
    })
    if (!resp.ok) {
      console.error('Translate API error:', resp.status, await resp.text().catch(() => ''))
      return c.json({ translated: text, original: text, error: `API returned ${resp.status}` })
    }
    const data = await resp.json() as any
    const translated = data.choices?.[0]?.message?.content?.trim()
    return c.json({ translated: translated || text, original: text })
  } catch (e: any) {
    console.error('Translate error:', e?.message || String(e))
    return c.json({ translated: text, original: text, error: e?.message || 'translation_failed' })
  }
})

// ==================== TRUCKS API ====================
app.get('/api/trucks', async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT t.*, dz.name as zone_name, dz.color as zone_color,
    (SELECT COUNT(*) FROM routes WHERE truck_id = t.id AND date = date('now') AND status NOT IN ('completed','cancelled')) as active_routes
    FROM trucks t LEFT JOIN delivery_zones dz ON t.zone_id = dz.id
    WHERE ${c.req.query('include_archived') === '1' ? '1=1' : 't.archived = 0'} ORDER BY t.name`
  ).all()
  return c.json({ trucks: result.results })
})

app.post('/api/trucks', async (c) => {
  const body = await c.req.json()
  const res = await c.env.DB.prepare(
    'INSERT INTO trucks (name, plate_number, max_pallet_spots, truck_type, bale_capacity, status, notes, zone_id, vin, make, model, year, license_plate, verizon_vehicle_id, verizon_vehicle_number) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(body.name, body.plate_number || null, body.max_pallet_spots || 12, body.truck_type || 'pallet', body.bale_capacity || 0, body.status || 'available', body.notes || null, body.zone_id || null, body.vin || null, body.make || null, body.model || null, body.year || null, body.license_plate || null, body.verizon_vehicle_id || null, body.verizon_vehicle_number || null).run()
  return c.json({ id: res.meta.last_row_id }, 201)
})

app.put('/api/trucks/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const fields: string[] = []
  const vals: any[] = []
  for (const key of ['name','plate_number','max_pallet_spots','truck_type','bale_capacity','status','notes','zone_id','vin','make','model','year','license_plate','verizon_vehicle_id','verizon_vehicle_number','verizon_synced_at']) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); vals.push(body[key]) }
  }
  if (fields.length > 0) { vals.push(id); await c.env.DB.prepare(`UPDATE trucks SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run() }
  return c.json({ success: true })
})

// Helper: get order snapshot (items + instructions) for storing when adding to route
async function getOrderSnapshot(db: D1Database, orderId: number | string) {
  const items = await db.prepare(
    `SELECT oi.product_id, oi.quantity, p.name, p.sku, p.unit_type
     FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`
  ).bind(orderId).all()
  const order = await db.prepare('SELECT special_instructions FROM orders WHERE id = ?').bind(orderId).first() as any
  return {
    items: JSON.stringify(items.results),
    instructions: order?.special_instructions || ''
  }
}

async function insertRouteStop(db: D1Database, routeId: number | string, orderId: number | string, sequence: number) {
  const snap = await getOrderSnapshot(db, orderId)
  await db.prepare(
    `INSERT INTO route_stops (route_id, order_id, sequence, added_at, items_snapshot, instructions_snapshot)
     VALUES (?,?,?,datetime("now"),?,?)`
  ).bind(routeId, orderId, sequence, snap.items, snap.instructions).run()
}

// ==================== ROUTES API ====================
app.get('/api/routes', async (c) => {
  const date = c.req.query('date')
  const status = c.req.query('status')
  let query = `SELECT r.*, u.name as driver_name, t.name as truck_name, t.max_pallet_spots, t.truck_type, t.bale_capacity,
    (SELECT COUNT(*) FROM route_stops WHERE route_id = r.id) as stop_count,
    (SELECT COALESCE(SUM(oi.quantity),0) FROM route_stops rs2 JOIN order_items oi ON oi.order_id = rs2.order_id WHERE rs2.route_id = r.id) as total_items,
    ${PALLET_SQL_ROUTE} as total_pallets
    FROM routes r LEFT JOIN users u ON r.driver_id = u.id LEFT JOIN trucks t ON r.truck_id = t.id WHERE 1=1`
  const params: any[] = []
  if (c.req.query('include_archived') !== '1') { query += ' AND r.archived = 0' }
  if (date) { query += ' AND r.date = ?'; params.push(date) }
  if (status) { query += ' AND r.status = ?'; params.push(status) }
  query += ' ORDER BY r.date DESC, r.created_at DESC'
  const result = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ routes: result.results })
})

// Route Builder context: active routes with their stops in one call
app.get('/api/routes/builder-context', async (c) => {
  // Get all active (non-completed, non-cancelled, non-archived) routes
  const routesResult = await c.env.DB.prepare(
    `SELECT r.id, r.route_number, r.date, r.status, r.driver_id, r.truck_id, r.total_miles, r.notes,
      u.name as driver_name, t.name as truck_name, t.max_pallet_spots, t.truck_type, t.bale_capacity,
      (SELECT COUNT(*) FROM route_stops WHERE route_id = r.id) as stop_count,
      (SELECT COALESCE(SUM(oi.quantity),0) FROM route_stops rs2 JOIN order_items oi ON oi.order_id = rs2.order_id WHERE rs2.route_id = r.id) as total_items,
      ${PALLET_SQL_ROUTE} as total_pallets
    FROM routes r LEFT JOIN users u ON r.driver_id = u.id LEFT JOIN trucks t ON r.truck_id = t.id
    WHERE r.archived = 0 AND r.status NOT IN ('completed','cancelled')
    ORDER BY r.date DESC, r.created_at DESC`
  ).all()
  const routes = routesResult.results as any[]

  // For each route, fetch its order stops with customer/address info
  const routesWithStops = []
  for (const route of routes) {
    const stopsResult = await c.env.DB.prepare(
      `SELECT rs.sequence, rs.order_id, rs.return_id, rs.status as stop_status,
        o.order_number, o.status as order_status, o.priority, o.scheduled_date,
        c.business_name, c.contact_name,
        a.street, a.city, a.state, a.zip, CAST(a.lat AS REAL) as lat, CAST(a.lng AS REAL) as lng,
        (SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi WHERE oi.order_id = o.id) as item_count,
        ${PALLET_SQL_ORDER} as pallet_count
      FROM route_stops rs
      LEFT JOIN orders o ON rs.order_id = o.id
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN addresses a ON o.address_id = a.id
      WHERE rs.route_id = ? AND rs.order_id IS NOT NULL
      ORDER BY rs.sequence`
    ).bind(route.id).all()

    // Also fetch return stops
    const retStopsResult = await c.env.DB.prepare(
      `SELECT rs.sequence, rs.return_id, ret.status as return_status, ret.notes as return_notes,
        c.business_name,
        a.street, a.city, a.state, a.zip, CAST(a.lat AS REAL) as lat, CAST(a.lng AS REAL) as lng
      FROM route_stops rs
      JOIN returns ret ON rs.return_id = ret.id
      JOIN customers c ON ret.customer_id = c.id
      LEFT JOIN orders o ON ret.order_id = o.id
      LEFT JOIN addresses a ON COALESCE(o.address_id, (SELECT id FROM addresses WHERE customer_id = ret.customer_id LIMIT 1)) = a.id
      WHERE rs.route_id = ? AND rs.return_id IS NOT NULL
      ORDER BY rs.sequence`
    ).bind(route.id).all()

    routesWithStops.push({
      ...route,
      stops: stopsResult.results,
      return_stops: retStopsResult.results
    })
  }

  return c.json({ routes: routesWithStops })
})

app.get('/api/routes/:id', async (c) => {
  const id = c.req.param('id')
  const route = await c.env.DB.prepare(
    `SELECT r.*, u.name as driver_name, u.phone as driver_phone, t.name as truck_name, t.max_pallet_spots, t.truck_type, t.plate_number
    FROM routes r LEFT JOIN users u ON r.driver_id = u.id LEFT JOIN trucks t ON r.truck_id = t.id WHERE r.id = ?`
  ).bind(id).first()
  if (!route) return c.json({ error: 'Route not found' }, 404)

  // Fetch order stops
  const orderStops = await c.env.DB.prepare(
    `SELECT rs.*, o.order_number, o.special_instructions, o.priority, o.customer_id, o.updated_at as order_updated_at,
    c.business_name, c.contact_name, c.phone as customer_phone,
    a.street, a.city, a.zip, a.gate_code, a.driver_notes, CAST(a.lat AS REAL) as lat, CAST(a.lng AS REAL) as lng
    FROM route_stops rs
    JOIN orders o ON rs.order_id = o.id
    JOIN customers c ON o.customer_id = c.id
    LEFT JOIN addresses a ON o.address_id = a.id
    WHERE rs.route_id = ? AND rs.order_id IS NOT NULL ORDER BY rs.sequence`
  ).bind(id).all()

  // Fetch return stops
  const returnStops = await c.env.DB.prepare(
    `SELECT rs.*, ret.status as return_status, ret.notes as return_notes, ret.customer_id,
    c.business_name, c.contact_name, c.phone as customer_phone,
    a.street, a.city, a.zip, a.gate_code, a.driver_notes, CAST(a.lat AS REAL) as lat, CAST(a.lng AS REAL) as lng
    FROM route_stops rs
    JOIN returns ret ON rs.return_id = ret.id
    JOIN customers c ON ret.customer_id = c.id
    LEFT JOIN orders o ON ret.order_id = o.id
    LEFT JOIN addresses a ON COALESCE(o.address_id, (SELECT id FROM addresses WHERE customer_id = ret.customer_id LIMIT 1)) = a.id
    WHERE rs.route_id = ? AND rs.return_id IS NOT NULL ORDER BY rs.sequence`
  ).bind(id).all()

  // Merge and sort all stops by sequence
  const allStops = [...orderStops.results as any[], ...returnStops.results as any[]].sort((a: any, b: any) => a.sequence - b.sequence)

  // Get item details per stop and collect all items for route-level pallet calculation
  let totalItems = 0
  const allRouteItems: Array<{ quantity: number; pallet_qty: number }> = []
  for (const stop of allStops) {
    if (stop.return_id) {
      // Return stop — load return items
      const retItems = await c.env.DB.prepare(
        `SELECT ri.expected_qty as quantity, ri.product_id, ri.reason, p.name as product_name, p.sku, p.unit_type, p.pallet_qty
         FROM return_items ri JOIN products p ON ri.product_id = p.id WHERE ri.return_id = ?`
      ).bind(stop.return_id).all()
      stop.items = retItems.results
      stop.is_return = true
      stop.order_number = `RET-${stop.return_id}`
      stop.priority = 'normal'
      stop.special_instructions = stop.return_notes || ''
      let stopItems = 0
      for (const it of retItems.results as any[]) {
        stopItems += it.quantity || 0
        allRouteItems.push({ quantity: it.quantity || 0, pallet_qty: it.pallet_qty || 40 })
      }
      stop.item_count = stopItems
      stop.pallet_count = Math.max(calcPallets(retItems.results as any[]), retItems.results.length > 0 ? 1 : 0)
      stop.changed_after_routing = false
      stop.changes = []
      stop.instructions_changed = false
      totalItems += stopItems
    } else {
      // Order stop — existing logic
      const items = await c.env.DB.prepare(
        `SELECT oi.quantity, oi.product_id, p.name as product_name, p.sku, p.unit_type, p.pallet_qty
         FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`
      ).bind(stop.order_id).all()
      stop.items = items.results
      stop.is_return = false
      let stopItems = 0
      for (const it of items.results as any[]) {
        stopItems += it.quantity || 0
        allRouteItems.push({ quantity: it.quantity || 0, pallet_qty: it.pallet_qty || 40 })
      }
      stop.item_count = stopItems
      stop.pallet_count = Math.max(calcPallets(items.results as any[]), items.results.length > 0 ? 1 : 0)

      // Compare current items vs snapshot for specific change detection
      let changes: any[] = []
      const wasUpdated = !!(stop.added_at && stop.order_updated_at && stop.order_updated_at > stop.added_at)
      if (wasUpdated && stop.items_snapshot) {
        try {
          const oldItems = JSON.parse(stop.items_snapshot) as any[]
          const curItems = items.results as any[]
          const oldMap: Record<number, any> = {}
          for (const oi of oldItems) oldMap[oi.product_id] = oi
          const curMap: Record<number, any> = {}
          for (const ci of curItems) curMap[ci.product_id] = ci
          for (const ci of curItems) {
            const old = oldMap[ci.product_id]
            if (!old) { changes.push({ type: 'added', product_id: ci.product_id, name: ci.product_name || ci.name, sku: ci.sku, quantity: ci.quantity, old_quantity: 0 }) }
            else if (old.quantity !== ci.quantity) { changes.push({ type: 'qty_changed', product_id: ci.product_id, name: ci.product_name || ci.name, sku: ci.sku, quantity: ci.quantity, old_quantity: old.quantity }) }
          }
          for (const oi of oldItems) {
            if (!curMap[oi.product_id]) { changes.push({ type: 'removed', product_id: oi.product_id, name: oi.name, sku: oi.sku, quantity: 0, old_quantity: oi.quantity }) }
          }
        } catch (e) { /* snapshot parse error */ }
      }
      let instructions_changed = false
      if (wasUpdated && stop.instructions_snapshot !== undefined && stop.instructions_snapshot !== null) {
        instructions_changed = (stop.special_instructions || '') !== (stop.instructions_snapshot || '')
      }
      stop.changed_after_routing = wasUpdated && (changes.length > 0 || instructions_changed)
      stop.changes = changes
      stop.instructions_changed = instructions_changed

      totalItems += stopItems
    }
  }

  // Route-level pallets: items across all orders share pallets by pallet_qty
  const totalPallets = calcPallets(allRouteItems)
  return c.json({ route, stops: allStops, totals: { items: totalItems, pallets: totalPallets } })
})

app.post('/api/routes', async (c) => {
  const body = await c.req.json()
  const db = c.env.DB
  // More entropy: 4 random digits to prevent collisions when creating multiple routes/day
  const routeNum = 'RT-' + body.date.replace(/-/g, '').slice(4) + '-' + String(Math.floor(1000 + Math.random() * 9000))
  const res = await db.prepare(
    'INSERT INTO routes (route_number, date, truck_id, driver_id, status, notes) VALUES (?,?,?,?,?,?)'
  ).bind(routeNum, body.date, body.truck_id || null, body.driver_id || null, 'planned', body.notes || null).run()
  const routeId = res.meta.last_row_id

  // --- Batch all stop inserts + order status updates in one D1 batch ---
  // This avoids sequential round-trips that cause timeouts with many orders
  const batchStmts: D1PreparedStatement[] = []
  let seq = 1

  if (body.order_ids && body.order_ids.length > 0) {
    // Pre-fetch all order snapshots in parallel (2 queries per order, but parallel)
    const snapshots = await Promise.all(
      body.order_ids.map((oid: number) => getOrderSnapshot(db, oid))
    )
    for (let i = 0; i < body.order_ids.length; i++) {
      const oid = body.order_ids[i]
      const snap = snapshots[i]
      batchStmts.push(
        db.prepare(
          `INSERT INTO route_stops (route_id, order_id, sequence, added_at, items_snapshot, instructions_snapshot)
           VALUES (?,?,?,datetime("now"),?,?)`
        ).bind(routeId, oid, seq++, snap.items, snap.instructions)
      )
      batchStmts.push(
        db.prepare("UPDATE orders SET status = 'scheduled' WHERE id = ? AND status IN ('new','confirmed')")
          .bind(oid)
      )
    }
  }

  // Pre-fetch return data in parallel if needed
  if (body.return_ids && body.return_ids.length > 0) {
    const retDataArr = await Promise.all(
      body.return_ids.map(async (retId: number) => {
        const [ret, retItems] = await Promise.all([
          db.prepare('SELECT * FROM returns WHERE id = ?').bind(retId).first() as Promise<any>,
          db.prepare('SELECT ri.*, p.name, p.sku, p.pallet_qty FROM return_items ri JOIN products p ON ri.product_id = p.id WHERE ri.return_id = ?').bind(retId).all()
        ])
        return { retId, ret, retItems }
      })
    )
    for (const { retId, ret, retItems } of retDataArr) {
      if (!ret) continue
      const itemsSnap = JSON.stringify(retItems.results.map((ri: any) => ({ product_id: ri.product_id, name: ri.name, sku: ri.sku, quantity: ri.expected_qty })))
      batchStmts.push(
        db.prepare(
          `INSERT INTO route_stops (route_id, order_id, return_id, sequence, added_at, items_snapshot, instructions_snapshot)
           VALUES (?,NULL,?,?,datetime("now"),?,?)`
        ).bind(routeId, retId, seq++, itemsSnap, ret.notes || '')
      )
      batchStmts.push(
        db.prepare('UPDATE returns SET scheduled_date = ?, route_id = ? WHERE id = ?')
          .bind(body.date, routeId, retId)
      )
    }
  }

  // Execute all stop inserts + status updates in a single D1 batch
  if (batchStmts.length > 0) {
    await db.batch(batchStmts)
  }

  // Defer learning engine capture to after response is sent (non-blocking)
  c.executionCtx.waitUntil(
    captureRoutePatterns(db, routeId as number, 'created').catch(() => {})
  )

  return c.json({ id: routeId, route_number: routeNum }, 201)
})

app.put('/api/routes/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const fields: string[] = []
  const vals: any[] = []
  for (const key of ['route_number', 'truck_id', 'driver_id', 'status', 'total_miles', 'estimated_time', 'notes', 'date']) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); vals.push(body[key]) }
  }
  if (fields.length > 0) {
    vals.push(id)
    await c.env.DB.prepare(`UPDATE routes SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run()
  }
  // If date changed, update scheduled_date on all orders in this route
  if (body.date !== undefined) {
    await c.env.DB.prepare(
      `UPDATE orders SET scheduled_date = ?, updated_at = datetime('now')
       WHERE id IN (SELECT order_id FROM route_stops WHERE route_id = ?)`
    ).bind(body.date, id).run()
  }
  // If route marked completed, mark all its orders and stops as completed too
  if (body.status === 'completed') {
    await c.env.DB.prepare(
      `UPDATE orders SET status = 'completed', updated_at = datetime('now')
       WHERE id IN (SELECT order_id FROM route_stops WHERE route_id = ?)
       AND status NOT IN ('completed','cancelled')`
    ).bind(id).run()
    await c.env.DB.prepare(
      `UPDATE route_stops SET status = 'completed', completed_at = datetime('now')
       WHERE route_id = ? AND status != 'completed'`
    ).bind(id).run()
    // Capture completed snapshot for learning engine
    captureRoutePatterns(c.env.DB, parseInt(id), 'completed').catch(() => {})
  }
  // If truck or driver changed, capture modified snapshot for learning
  if (body.truck_id !== undefined || body.driver_id !== undefined) {
    captureRoutePatterns(c.env.DB, parseInt(id), 'modified').catch(() => {})
  }
  return c.json({ success: true })
})

// ==================== ROUTE STOPS API ====================
app.patch('/api/route-stops/:id/status', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { status } = body
  const now = new Date().toISOString()

  // REQUIRE photo proof for completion
  if (status === 'completed' && !body.photo) {
    return c.json({ error: 'Photo proof of delivery is required to complete a stop.' }, 400)
  }

  let extra = ''
  if (status === 'arrived') extra = `, arrived_at = '${now}'`
  if (status === 'completed') extra = `, completed_at = '${now}'`
  await c.env.DB.prepare(`UPDATE route_stops SET status = ?${extra} WHERE id = ?`).bind(status, id).run()

  // Also update order status
  const stop = await c.env.DB.prepare('SELECT order_id FROM route_stops WHERE id = ?').bind(id).first() as any
  if (stop) {
    const orderStatus = status === 'completed' ? 'delivered' : status === 'arrived' ? 'in_transit' : undefined
    if (orderStatus) {
      await c.env.DB.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(orderStatus, stop.order_id).run()
    }

    // Save delivery proof with photo when completing
    if (status === 'completed' && body.photo) {
      // Get GPS from request or fallback
      const gpsLat = body.gps_lat || null
      const gpsLng = body.gps_lng || null
      const notes = body.notes || null
      await c.env.DB.prepare(
        `INSERT OR REPLACE INTO delivery_proofs (order_id, photo_url, gps_lat, gps_lng, notes, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`
      ).bind(stop.order_id, body.photo, gpsLat, gpsLng, notes).run()
    }
  }
  return c.json({ success: true })
})

// ==================== ROUTE STOP REORDERING ====================
app.put('/api/routes/:id/reorder', async (c) => {
  const routeId = c.req.param('id')
  const body = await c.req.json()
  const { stop_order } = body // Array of stop IDs in new order
  if (!stop_order || !Array.isArray(stop_order)) return c.json({ error: 'stop_order array required' }, 400)
  for (let i = 0; i < stop_order.length; i++) {
    await c.env.DB.prepare('UPDATE route_stops SET sequence = ? WHERE id = ? AND route_id = ?')
      .bind(i + 1, stop_order[i], routeId).run()
  }
  return c.json({ success: true })
})

// ==================== ROUTE OPTIMIZATION (Nearest-Neighbor TSP) ====================
app.post('/api/routes/:id/optimize', async (c) => {
  const routeId = c.req.param('id')
  const stops = await c.env.DB.prepare(
    `SELECT rs.id, rs.sequence, a.lat, a.lng, o.priority, c.business_name
    FROM route_stops rs JOIN orders o ON rs.order_id = o.id
    JOIN customers c ON o.customer_id = c.id LEFT JOIN addresses a ON o.address_id = a.id
    WHERE rs.route_id = ? AND rs.status = 'pending' ORDER BY rs.sequence`
  ).bind(routeId).all()

  const pending = (stops.results as any[]).filter(s => s.lat && s.lng)
  if (pending.length < 2) return c.json({ error: 'Need at least 2 geocoded stops to optimize' }, 400)

  // Nearest-neighbor from depot
  const visited: any[] = []
  const remaining = [...pending]
  let currentLat = DEPOT.lat
  let currentLng = DEPOT.lng
  let totalDist = 0

  // Calculate original route distance for comparison
  let origDist = 0
  let prevLat = DEPOT.lat, prevLng = DEPOT.lng
  for (const s of pending) {
    origDist += distanceMiles(prevLat, prevLng, s.lat, s.lng)
    prevLat = s.lat; prevLng = s.lng
  }
  origDist += distanceMiles(prevLat, prevLng, DEPOT.lat, DEPOT.lng)

  // Priority boost: urgent stops get visited earlier by reducing their apparent distance
  while (remaining.length > 0) {
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < remaining.length; i++) {
      let d = distanceMiles(currentLat, currentLng, remaining[i].lat, remaining[i].lng)
      // Priority boost: urgent/high items get 30%/15% distance reduction to prioritize them
      if (remaining[i].priority === 'urgent') d *= 0.7
      else if (remaining[i].priority === 'high') d *= 0.85
      if (d < bestDist) { bestDist = d; bestIdx = i }
    }
    const next = remaining.splice(bestIdx, 1)[0]
    totalDist += distanceMiles(currentLat, currentLng, next.lat, next.lng)
    currentLat = next.lat
    currentLng = next.lng
    visited.push(next)
  }
  totalDist += distanceMiles(currentLat, currentLng, DEPOT.lat, DEPOT.lng)

  // Apply optimized order
  const stop_order = visited.map(v => v.id)
  // Also include completed/non-pending stops at their current position
  const allStops = stops.results as any[]
  const nonPending = allStops.filter(s => !pending.find(p => p.id === s.id))

  // Reorder: pending stops get new sequence, non-pending keep theirs
  let seq = 1
  for (const s of nonPending.filter(np => np.sequence <= (visited[0]?.sequence || 999))) {
    await c.env.DB.prepare('UPDATE route_stops SET sequence = ? WHERE id = ?').bind(seq++, s.id).run()
  }
  for (const s of visited) {
    await c.env.DB.prepare('UPDATE route_stops SET sequence = ? WHERE id = ?').bind(seq++, s.id).run()
  }

  // Update route totals
  const savedMiles = Math.max(0, origDist - totalDist)
  const estTimeMin = Math.round(totalDist / 25 * 60) // Avg 25mph with stops
  const estFuelGal = totalDist / 8 // ~8 mpg for heavy trucks
  await c.env.DB.prepare(
    "UPDATE routes SET total_miles = ?, estimated_time = ?, status = 'optimized' WHERE id = ?"
  ).bind(Math.round(totalDist * 10) / 10, `${Math.floor(estTimeMin/60)}h ${estTimeMin%60}m`, routeId).run()

  return c.json({
    success: true,
    optimized_order: visited.map((v, i) => ({ stop_id: v.id, sequence: i + 1, business_name: v.business_name })),
    stats: {
      original_miles: Math.round(origDist * 10) / 10,
      optimized_miles: Math.round(totalDist * 10) / 10,
      saved_miles: Math.round(savedMiles * 10) / 10,
      saved_pct: origDist > 0 ? Math.round(savedMiles / origDist * 100) : 0,
      estimated_time: `${Math.floor(estTimeMin/60)}h ${estTimeMin%60}m`,
      estimated_fuel_gal: Math.round(estFuelGal * 10) / 10,
      estimated_fuel_cost: Math.round(estFuelGal * 4.2 * 100) / 100, // ~$4.20/gal diesel
    }
  })
})

// ==================== ROUTE STOP NOTES & TIME WINDOWS ====================
app.put('/api/route-stops/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const fields: string[] = []
  const vals: any[] = []
  for (const key of ['notes', 'eta', 'sequence']) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); vals.push(body[key]) }
  }
  if (fields.length > 0) {
    vals.push(id)
    await c.env.DB.prepare(`UPDATE route_stops SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run()
  }
  return c.json({ success: true })
})

// ==================== ROUTE ANALYTICS ====================
app.get('/api/routes/:id/analytics', async (c) => {
  const routeId = c.req.param('id')
  const route = await c.env.DB.prepare(
    `SELECT r.*, u.name as driver_name, t.name as truck_name, t.max_pallet_spots, t.truck_type
    FROM routes r LEFT JOIN users u ON r.driver_id = u.id LEFT JOIN trucks t ON r.truck_id = t.id WHERE r.id = ?`
  ).bind(routeId).first() as any
  if (!route) return c.json({ error: 'Route not found' }, 404)

  const stops = await c.env.DB.prepare(
    `SELECT rs.*, o.priority, c.business_name, a.lat, a.lng, a.street, a.city
    FROM route_stops rs JOIN orders o ON rs.order_id = o.id
    JOIN customers c ON o.customer_id = c.id LEFT JOIN addresses a ON o.address_id = a.id
    WHERE rs.route_id = ? ORDER BY rs.sequence`
  ).bind(routeId).all()

  const stopsArr = stops.results as any[]
  const geocoded = stopsArr.filter(s => s.lat && s.lng)

  // Calculate total route distance
  let totalMiles = 0
  let prevLat = DEPOT.lat, prevLng = DEPOT.lng
  const legs: any[] = []
  for (const s of geocoded) {
    const legDist = distanceMiles(prevLat, prevLng, s.lat, s.lng)
    totalMiles += legDist
    legs.push({ stop_id: s.id, business_name: s.business_name, distance_mi: Math.round(legDist * 10) / 10, cumulative_mi: Math.round(totalMiles * 10) / 10 })
    prevLat = s.lat; prevLng = s.lng
  }
  // Return to depot
  const returnDist = geocoded.length > 0 ? distanceMiles(prevLat, prevLng, DEPOT.lat, DEPOT.lng) : 0
  totalMiles += returnDist

  const completedStops = stopsArr.filter(s => s.status === 'completed')
  const avgStopTime = completedStops.length >= 2
    ? completedStops.reduce((sum, s) => {
        if (s.arrived_at && s.completed_at) {
          return sum + (new Date(s.completed_at).getTime() - new Date(s.arrived_at).getTime()) / 60000
        }
        return sum
      }, 0) / completedStops.filter(s => s.arrived_at && s.completed_at).length
    : 15 // default 15 min per stop

  const estDriveTimeMin = totalMiles / 25 * 60 // 25 mph avg
  const estStopTimeMin = stopsArr.length * (avgStopTime || 15)
  const estTotalTimeMin = estDriveTimeMin + estStopTimeMin
  const estFuelGal = totalMiles / 8

  return c.json({
    route_id: routeId,
    total_stops: stopsArr.length,
    completed_stops: completedStops.length,
    total_miles: Math.round(totalMiles * 10) / 10,
    return_to_depot_miles: Math.round(returnDist * 10) / 10,
    legs,
    truck_type: route.truck_type || 'pallet',
    max_pallet_spots: route.max_pallet_spots || 12,
    estimated_drive_time: `${Math.floor(estDriveTimeMin/60)}h ${Math.round(estDriveTimeMin%60)}m`,
    estimated_stop_time: `${Math.round(estStopTimeMin)}m`,
    estimated_total_time: `${Math.floor(estTotalTimeMin/60)}h ${Math.round(estTotalTimeMin%60)}m`,
    avg_stop_time_min: Math.round(avgStopTime || 15),
    fuel_estimate: { gallons: Math.round(estFuelGal * 10) / 10, cost: Math.round(estFuelGal * 4.2 * 100) / 100 },
    priority_breakdown: {
      urgent: stopsArr.filter(s => s.priority === 'urgent').length,
      high: stopsArr.filter(s => s.priority === 'high').length,
      normal: stopsArr.filter(s => s.priority === 'normal').length,
      low: stopsArr.filter(s => s.priority === 'low').length,
    }
  })
})

// ==================== RE-OPTIMIZE ROUTE STOP ORDER ====================
// Re-sorts stops on an existing route using nearest-neighbor from depot
app.post('/api/routes/:id/reoptimize', async (c) => {
 try {
  const routeId = c.req.param('id')
  const stopsRes = await c.env.DB.prepare(
    `SELECT rs.id as stop_id, rs.order_id, rs.status as stop_status,
      o.priority, a.lat, a.lng
    FROM route_stops rs
    JOIN orders o ON rs.order_id = o.id
    LEFT JOIN addresses a ON o.address_id = a.id
    WHERE rs.route_id = ? ORDER BY rs.sequence`
  ).bind(routeId).all()
  const stops = stopsRes.results as any[]
  if (stops.length < 2) return c.json({ success: true, message: 'Nothing to reorder' })

  // Only reoptimize stops that haven't been completed
  const movable = stops.filter(s => !['completed','failed'].includes(s.stop_status))
  const fixed = stops.filter(s => ['completed','failed'].includes(s.stop_status))

  // Nearest-neighbor ordering from depot (or from last fixed stop)
  let cLat = DEPOT.lat, cLng = DEPOT.lng
  if (fixed.length > 0) {
    const lastFixed = fixed[fixed.length - 1]
    if (lastFixed.lat && lastFixed.lng) { cLat = lastFixed.lat; cLng = lastFixed.lng }
  }
  const geo = movable.filter(s => s.lat && s.lng)
  const noGeo = movable.filter(s => !s.lat || !s.lng)
  const ordered: any[] = []
  const remaining = [...geo]
  while (remaining.length > 0) {
    let bI = 0, bD = Infinity
    for (let i = 0; i < remaining.length; i++) {
      let dd = distanceMiles(cLat, cLng, remaining[i].lat, remaining[i].lng)
      if (remaining[i].priority === 'urgent') dd *= 0.7
      else if (remaining[i].priority === 'high') dd *= 0.85
      if (dd < bD) { bD = dd; bI = i }
    }
    const next = remaining.splice(bI, 1)[0]
    ordered.push(next)
    cLat = next.lat; cLng = next.lng
  }
  ordered.push(...noGeo)

  // Update sequences: fixed stops first, then reordered — batched
  const allOrdered = [...fixed, ...ordered]
  const reoptStmts: D1PreparedStatement[] = allOrdered.map((s, i) =>
    c.env.DB.prepare('UPDATE route_stops SET sequence = ? WHERE id = ?').bind(i + 1, s.stop_id)
  )

  // Recalculate total miles
  let totalMiles = 0, pLat = DEPOT.lat, pLng = DEPOT.lng
  for (const s of allOrdered.filter(o => o.lat && o.lng)) {
    totalMiles += distanceMiles(pLat, pLng, s.lat, s.lng); pLat = s.lat; pLng = s.lng
  }
  if (allOrdered.some(o => o.lat && o.lng)) totalMiles += distanceMiles(pLat, pLng, DEPOT.lat, DEPOT.lng)
  reoptStmts.push(c.env.DB.prepare('UPDATE routes SET total_miles = ? WHERE id = ?').bind(Math.round(totalMiles * 10) / 10, routeId))
  await c.env.DB.batch(reoptStmts)

  return c.json({ success: true, total_miles: Math.round(totalMiles * 10) / 10, stops_reordered: ordered.length })
 } catch (e: any) {
  return c.json({ error: 'Reoptimize failed', detail: e?.message }, 500)
 }
})

// Add order to existing route AND re-optimize stop order
app.post('/api/routes/:id/add-order-reoptimize', async (c) => {
 try {
  const routeId = c.req.param('id')
  const { order_ids } = await c.req.json()
  if (!order_ids?.length) return c.json({ error: 'order_ids required' }, 400)

  // Get route date
  const route = await c.env.DB.prepare('SELECT date FROM routes WHERE id = ?').bind(routeId).first() as any
  if (!route) return c.json({ error: 'Route not found' }, 404)

  // Add each order as a stop — batched for performance
  const db = c.env.DB
  const maxSeq = await db.prepare('SELECT MAX(sequence) as m FROM route_stops WHERE route_id = ?').bind(routeId).first() as any
  let seq = (maxSeq?.m || 0) + 1

  // Check which orders are NOT already on this route (parallel)
  const existChecks = await Promise.all(
    order_ids.map((oid: number) => db.prepare('SELECT id FROM route_stops WHERE route_id = ? AND order_id = ?').bind(routeId, oid).first())
  )
  const newOrderIds = order_ids.filter((_: number, i: number) => !existChecks[i])

  if (newOrderIds.length > 0) {
    // Pre-fetch snapshots in parallel
    const snapshots = await Promise.all(
      newOrderIds.map((oid: number) => getOrderSnapshot(db, oid))
    )
    // Batch insert all stops + update order statuses
    const batchStmts: D1PreparedStatement[] = []
    for (let i = 0; i < newOrderIds.length; i++) {
      const oid = newOrderIds[i]
      const snap = snapshots[i]
      batchStmts.push(
        db.prepare(
          `INSERT INTO route_stops (route_id, order_id, sequence, added_at, items_snapshot, instructions_snapshot)
           VALUES (?,?,?,datetime("now"),?,?)`
        ).bind(routeId, oid, seq++, snap.items, snap.instructions)
      )
      batchStmts.push(
        db.prepare("UPDATE orders SET status = 'scheduled', scheduled_date = ? WHERE id = ? AND status IN ('new','confirmed')")
          .bind(route.date, oid)
      )
    }
    await db.batch(batchStmts)
  }

  // Now re-optimize the entire route using nearest-neighbor
  const stopsRes = await c.env.DB.prepare(
    `SELECT rs.id as stop_id, rs.order_id, rs.status as stop_status,
      o.priority, a.lat, a.lng
    FROM route_stops rs
    JOIN orders o ON rs.order_id = o.id
    LEFT JOIN addresses a ON o.address_id = a.id
    WHERE rs.route_id = ? ORDER BY rs.sequence`
  ).bind(routeId).all()
  const stops = stopsRes.results as any[]

  const movable = stops.filter(s => !['completed','failed'].includes(s.stop_status))
  const fixed = stops.filter(s => ['completed','failed'].includes(s.stop_status))
  let cLat = DEPOT.lat, cLng = DEPOT.lng
  if (fixed.length > 0) {
    const lastFixed = fixed[fixed.length - 1]
    if (lastFixed.lat && lastFixed.lng) { cLat = lastFixed.lat; cLng = lastFixed.lng }
  }
  const geo = movable.filter(s => s.lat && s.lng)
  const noGeo = movable.filter(s => !s.lat || !s.lng)
  const ordered: any[] = []
  const rem = [...geo]
  while (rem.length > 0) {
    let bI = 0, bD = Infinity
    for (let i = 0; i < rem.length; i++) {
      let dd = distanceMiles(cLat, cLng, rem[i].lat, rem[i].lng)
      if (rem[i].priority === 'urgent') dd *= 0.7
      else if (rem[i].priority === 'high') dd *= 0.85
      if (dd < bD) { bD = dd; bI = i }
    }
    const next = rem.splice(bI, 1)[0]; ordered.push(next); cLat = next.lat; cLng = next.lng
  }
  ordered.push(...noGeo)

  const allOrdered = [...fixed, ...ordered]
  // Batch all sequence updates + miles update in one round-trip
  const reorderStmts: D1PreparedStatement[] = allOrdered.map((s, i) =>
    db.prepare('UPDATE route_stops SET sequence = ? WHERE id = ?').bind(i + 1, s.stop_id)
  )
  let totalMiles = 0, pLat = DEPOT.lat, pLng = DEPOT.lng
  for (const s of allOrdered.filter(o => o.lat && o.lng)) { totalMiles += distanceMiles(pLat, pLng, s.lat, s.lng); pLat = s.lat; pLng = s.lng }
  if (allOrdered.some(o => o.lat && o.lng)) totalMiles += distanceMiles(pLat, pLng, DEPOT.lat, DEPOT.lng)
  reorderStmts.push(db.prepare('UPDATE routes SET total_miles = ? WHERE id = ?').bind(Math.round(totalMiles * 10) / 10, routeId))
  await db.batch(reorderStmts)

  return c.json({ success: true, added: order_ids.length, total_stops: allOrdered.length, total_miles: Math.round(totalMiles * 10) / 10 })
 } catch (e: any) {
  return c.json({ error: 'Add + reoptimize failed', detail: e?.message }, 500)
 }
})

// ==================== ADD/REMOVE STOPS FROM ROUTE ====================
app.post('/api/routes/:id/stops', async (c) => {
  const routeId = c.req.param('id')
  const body = await c.req.json()
  const { order_id } = body
  if (!order_id) return c.json({ error: 'order_id required' }, 400)
  // Get next sequence number
  const maxSeq = await c.env.DB.prepare('SELECT MAX(sequence) as m FROM route_stops WHERE route_id = ?').bind(routeId).first() as any
  const nextSeq = (maxSeq?.m || 0) + 1
  await insertRouteStop(c.env.DB, routeId, order_id, nextSeq)
  await c.env.DB.prepare("UPDATE orders SET status = 'scheduled' WHERE id = ? AND status IN ('new','confirmed')").bind(order_id).run()
  return c.json({ success: true, sequence: nextSeq })
})

// Add a return as a stop on a route
app.post('/api/routes/:id/return-stops', async (c) => {
  const routeId = c.req.param('id')
  const { return_id } = await c.req.json()
  if (!return_id) return c.json({ error: 'return_id required' }, 400)
  // Verify return exists
  const ret = await c.env.DB.prepare('SELECT * FROM returns WHERE id = ?').bind(return_id).first() as any
  if (!ret) return c.json({ error: 'Return not found' }, 404)
  // Check not already on a route
  const existing = await c.env.DB.prepare('SELECT id FROM route_stops WHERE return_id = ?').bind(return_id).first()
  if (existing) return c.json({ error: 'Return already on a route' }, 409)
  // Get route date
  const route = await c.env.DB.prepare('SELECT date FROM routes WHERE id = ?').bind(routeId).first() as any
  if (!route) return c.json({ error: 'Route not found' }, 404)
  // Get next sequence
  const maxSeq = await c.env.DB.prepare('SELECT MAX(sequence) as m FROM route_stops WHERE route_id = ?').bind(routeId).first() as any
  const nextSeq = (maxSeq?.m || 0) + 1
  // Build a snapshot of return items
  const retItems = await c.env.DB.prepare('SELECT ri.*, p.name, p.sku, p.pallet_qty FROM return_items ri JOIN products p ON ri.product_id = p.id WHERE ri.return_id = ?').bind(return_id).all()
  const itemsSnap = JSON.stringify(retItems.results.map((ri: any) => ({ product_id: ri.product_id, name: ri.name, sku: ri.sku, quantity: ri.expected_qty })))
  // Insert stop with return_id (order_id is null)
  await c.env.DB.prepare(
    `INSERT INTO route_stops (route_id, order_id, return_id, sequence, added_at, items_snapshot, instructions_snapshot)
     VALUES (?,NULL,?,?,datetime("now"),?,?)`
  ).bind(routeId, return_id, nextSeq, itemsSnap, ret.notes || '').run()
  // Update return with scheduled_date and route_id
  await c.env.DB.prepare('UPDATE returns SET scheduled_date = ?, route_id = ? WHERE id = ?').bind(route.date, routeId, return_id).run()
  return c.json({ success: true, sequence: nextSeq })
})

app.delete('/api/routes/:id/stops/:stopId', async (c) => {
  const routeId = c.req.param('id')
  const stopId = c.req.param('stopId')
  const stop = await c.env.DB.prepare('SELECT order_id, return_id FROM route_stops WHERE id = ? AND route_id = ?').bind(stopId, routeId).first() as any
  if (!stop) return c.json({ error: 'Stop not found' }, 404)
  await c.env.DB.prepare('DELETE FROM route_stops WHERE id = ?').bind(stopId).run()
  if (stop.order_id) {
    // Revert order status back to 'confirmed' (unrouted) only for routing-stage statuses
    // Orders that are loaded/in_transit/delivered should not be silently reverted
    await c.env.DB.prepare("UPDATE orders SET status = 'confirmed' WHERE id = ? AND status IN ('new','confirmed','scheduled')").bind(stop.order_id).run()
  }
  if (stop.return_id) {
    // Clear both route_id and scheduled_date so the return appears unrouted
    await c.env.DB.prepare("UPDATE returns SET route_id = NULL, scheduled_date = NULL WHERE id = ?").bind(stop.return_id).run()
  }
  // Re-sequence remaining stops (batched)
  const remaining = await c.env.DB.prepare('SELECT id FROM route_stops WHERE route_id = ? ORDER BY sequence').bind(routeId).all()
  if (remaining.results.length > 0) {
    await c.env.DB.batch(
      remaining.results.map((r: any, i: number) => c.env.DB.prepare('UPDATE route_stops SET sequence = ? WHERE id = ?').bind(i + 1, r.id))
    )
  }
  return c.json({ success: true })
})

// Remove an order from whatever route it's on (by order ID — for map popup use)
app.delete('/api/orders/:orderId/route', async (c) => {
  const orderId = c.req.param('orderId')
  const stop = await c.env.DB.prepare('SELECT id, route_id FROM route_stops WHERE order_id = ?').bind(orderId).first() as any
  if (!stop) return c.json({ error: 'Order is not on any route' }, 404)
  const routeId = stop.route_id
  await c.env.DB.prepare('DELETE FROM route_stops WHERE id = ?').bind(stop.id).run()
  // Revert order status to confirmed (unrouted)
  await c.env.DB.prepare("UPDATE orders SET status = 'confirmed' WHERE id = ? AND status IN ('new','confirmed','scheduled')").bind(orderId).run()
  // Re-sequence remaining stops on that route (batched)
  const remaining = await c.env.DB.prepare('SELECT id FROM route_stops WHERE route_id = ? ORDER BY sequence').bind(routeId).all()
  if (remaining.results.length > 0) {
    await c.env.DB.batch(
      remaining.results.map((r: any, i: number) => c.env.DB.prepare('UPDATE route_stops SET sequence = ? WHERE id = ?').bind(i + 1, r.id))
    )
  }
  return c.json({ success: true, route_id: routeId })
})

// Remove a return from whatever route it's on (by return ID — for map popup use)
app.delete('/api/returns/:returnId/route', async (c) => {
  const returnId = c.req.param('returnId')
  const stop = await c.env.DB.prepare('SELECT id, route_id FROM route_stops WHERE return_id = ?').bind(returnId).first() as any
  if (!stop) return c.json({ error: 'Return is not on any route' }, 404)
  const routeId = stop.route_id
  await c.env.DB.prepare('DELETE FROM route_stops WHERE id = ?').bind(stop.id).run()
  await c.env.DB.prepare("UPDATE returns SET route_id = NULL, scheduled_date = NULL WHERE id = ?").bind(returnId).run()
  // Re-sequence remaining stops (batched)
  const remaining = await c.env.DB.prepare('SELECT id FROM route_stops WHERE route_id = ? ORDER BY sequence').bind(routeId).all()
  if (remaining.results.length > 0) {
    await c.env.DB.batch(
      remaining.results.map((r: any, i: number) => c.env.DB.prepare('UPDATE route_stops SET sequence = ? WHERE id = ?').bind(i + 1, r.id))
    )
  }
  return c.json({ success: true, route_id: routeId })
})

// ==================== PACKING LISTS API ====================
app.get('/api/packing-list/:routeId', async (c) => {
  const routeId = c.req.param('routeId')
  const route = await c.env.DB.prepare(
    `SELECT r.*, u.name as driver_name, t.name as truck_name, t.max_pallet_spots, t.truck_type
    FROM routes r LEFT JOIN users u ON r.driver_id = u.id LEFT JOIN trucks t ON r.truck_id = t.id WHERE r.id = ?`
  ).bind(routeId).first()
  if (!route) return c.json({ error: 'Route not found' }, 404)
  const stops = await c.env.DB.prepare(
    `SELECT rs.sequence, rs.added_at, rs.items_snapshot, rs.instructions_snapshot,
    o.id as order_id, o.order_number, o.special_instructions, o.updated_at,
    c.business_name, a.street, a.city
    FROM route_stops rs
    JOIN orders o ON rs.order_id = o.id
    JOIN customers c ON o.customer_id = c.id
    LEFT JOIN addresses a ON o.address_id = a.id
    WHERE rs.route_id = ? ORDER BY rs.sequence`
  ).bind(routeId).all()
  const packingItems: any[] = []
  for (const stop of stops.results as any[]) {
    const s = stop as any
    const items = await c.env.DB.prepare(
      `SELECT oi.quantity, oi.product_id, p.name, p.sku, p.unit_type, p.pallet_qty
      FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`
    ).bind(s.order_id).all()

    // Compare current items vs snapshot to find specific changes
    let changes: any[] = []
    const changed = s.added_at && s.updated_at && s.updated_at > s.added_at
    if (changed && s.items_snapshot) {
      try {
        const oldItems = JSON.parse(s.items_snapshot) as any[]
        const curItems = items.results as any[]
        const oldMap: Record<number, any> = {}
        for (const oi of oldItems) oldMap[oi.product_id] = oi
        const curMap: Record<number, any> = {}
        for (const ci of curItems) curMap[ci.product_id] = ci
        // Quantity changes & new items
        for (const ci of curItems) {
          const old = oldMap[ci.product_id]
          if (!old) { changes.push({ type: 'added', product_id: ci.product_id, name: ci.name, sku: ci.sku, quantity: ci.quantity, old_quantity: 0 }) }
          else if (old.quantity !== ci.quantity) { changes.push({ type: 'qty_changed', product_id: ci.product_id, name: ci.name, sku: ci.sku, quantity: ci.quantity, old_quantity: old.quantity }) }
        }
        // Removed items
        for (const oi of oldItems) {
          if (!curMap[oi.product_id]) { changes.push({ type: 'removed', product_id: oi.product_id, name: oi.name, sku: oi.sku, quantity: 0, old_quantity: oi.quantity }) }
        }
      } catch (e) { /* snapshot parse error, fallback to generic changed flag */ }
    }
    // Check instructions change
    let instructions_changed = false
    if (changed && s.instructions_snapshot !== undefined && s.instructions_snapshot !== null) {
      instructions_changed = (s.special_instructions || '') !== (s.instructions_snapshot || '')
    }

    packingItems.push({
      ...s, items: items.results,
      changed_after_routing: changed && (changes.length > 0 || instructions_changed),
      changes, instructions_changed
    })
  }
  return c.json({ route, stops: packingItems })
})

// ==================== DELIVERY ZONES API ====================
app.get('/api/zones', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      `SELECT z.*, t.name as default_truck_name, (SELECT COUNT(*) FROM addresses WHERE zone_id = z.id) as address_count
      FROM delivery_zones z LEFT JOIN trucks t ON z.default_truck_id = t.id WHERE z.active = 1 ORDER BY z.name`
    ).all()
    return c.json({ zones: result.results })
  } catch (e: any) {
    console.error('Zones list error:', e.message)
    return c.json({ zones: [], error: 'Failed to load zones' })
  }
})

// Zone schedule (must be before :id)
app.get('/api/zones/schedule', async (c) => {
  try {
    const zones = await c.env.DB.prepare('SELECT id, name, color, delivery_days FROM delivery_zones WHERE active = 1 ORDER BY name').all()
    const days = ['mon','tue','wed','thu','fri','sat']
    const schedule: Record<string, any[]> = {}
    for (const day of days) schedule[day] = []
    for (const z of zones.results as any[]) {
      const zDays = (z as any).delivery_days.split(',').map((s: string) => s.trim())
      for (const d of zDays) {
        if (schedule[d]) schedule[d].push({ id: (z as any).id, name: (z as any).name, color: (z as any).color })
      }
    }
    return c.json({ zones: zones.results, schedule, days })
  } catch (e: any) {
    console.error('Zone schedule error:', e.message)
    const days = ['mon','tue','wed','thu','fri','sat']
    const schedule: Record<string, any[]> = {}
    for (const day of days) schedule[day] = []
    return c.json({ zones: [], schedule, days })
  }
})

// Zone detection (must be before :id)
app.get('/api/zones/detect', async (c) => {
  const lat = parseFloat(c.req.query('lat') || '0')
  const lng = parseFloat(c.req.query('lng') || '0')
  const city = c.req.query('city') || ''
  const zip = c.req.query('zip') || ''

  const zones = await c.env.DB.prepare('SELECT * FROM delivery_zones WHERE active = 1').all()
  const matches: any[] = []

  for (const z of zones.results as any[]) {
    let score = 0
    if (z.boundary_json && lat && lng) {
      try {
        const poly = JSON.parse(z.boundary_json) as number[][]
        if (pointInPolygon(lat, lng, poly)) score += 100
      } catch (e) {}
    }
    if (z.center_lat && z.center_lng && lat && lng) {
      const dist = distanceMiles(lat, lng, z.center_lat, z.center_lng)
      if (dist <= (z.radius_miles || 5)) score += Math.round(80 - dist * 10)
    }
    if (z.city_pattern && city) {
      const pattern = z.city_pattern.replace(/%/g, '.*')
      if (new RegExp(pattern, 'i').test(city)) score += 50
    }
    if (z.zip_codes && zip) {
      const zips = z.zip_codes.split(',').map((s: string) => s.trim())
      if (zips.includes(zip)) score += 60
    }
    if (score > 0) matches.push({ zone: z, score })
  }

  matches.sort((a, b) => b.score - a.score)
  return c.json({ matches, best: matches[0]?.zone || null })
})

app.get('/api/zones/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const zone = await c.env.DB.prepare('SELECT * FROM delivery_zones WHERE id = ?').bind(id).first()
    if (!zone) return c.json({ error: 'Zone not found' }, 404)
    const addresses = await c.env.DB.prepare(
      `SELECT a.*, c.business_name FROM addresses a JOIN customers c ON a.customer_id = c.id WHERE a.zone_id = ? ORDER BY c.business_name`
    ).bind(id).all()
    return c.json({ zone, addresses: addresses.results })
  } catch (e: any) {
    console.error('Zone detail error:', e.message)
    return c.json({ error: 'Failed to load zone' }, 500)
  }
})

app.post('/api/zones', async (c) => {
  const body = await c.req.json()
  const res = await c.env.DB.prepare(
    `INSERT INTO delivery_zones (name, color, delivery_days, boundary_json, center_lat, center_lng, radius_miles, city_pattern, zip_codes, notes, default_truck_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    body.name, body.color || '#2563EB', body.delivery_days || 'mon,wed,fri',
    body.boundary_json || null, body.center_lat || null, body.center_lng || null,
    body.radius_miles || 5, body.city_pattern || null, body.zip_codes || null, body.notes || null, body.default_truck_id || null
  ).run()
  return c.json({ id: res.meta.last_row_id, success: true }, 201)
})

app.put('/api/zones/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const fields: string[] = []
  const vals: any[] = []
  for (const key of ['name','color','delivery_days','boundary_json','center_lat','center_lng','radius_miles','city_pattern','zip_codes','notes','active','default_truck_id']) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); vals.push(body[key]) }
  }
  if (fields.length > 0) {
    vals.push(id)
    await c.env.DB.prepare(`UPDATE delivery_zones SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run()
  }
  return c.json({ success: true })
})

app.delete('/api/zones/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('UPDATE addresses SET zone_id = NULL WHERE zone_id = ?').bind(id).run()
  await c.env.DB.prepare('UPDATE delivery_zones SET active = 0 WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// Recalculate zone centers from the average of their member address coordinates
app.post('/api/zones/recalculate-centers', async (c) => {
  try {
    const zones = await c.env.DB.prepare('SELECT * FROM delivery_zones WHERE active = 1').all()
    const results: any[] = []
    for (const z of zones.results as any[]) {
      // Find addresses in this zone by zone_id, city pattern, or zip codes
      let addrs: any[] = []
      // Primary: addresses explicitly assigned to this zone
      const byZone = await c.env.DB.prepare('SELECT lat, lng FROM addresses WHERE zone_id = ? AND lat IS NOT NULL AND lng IS NOT NULL').bind(z.id).all()
      addrs = byZone.results as any[]
      // Fallback: match by city pattern or zip if no explicit zone assignments
      if (addrs.length === 0) {
        const allAddrs = await c.env.DB.prepare('SELECT lat, lng, city, zip FROM addresses WHERE lat IS NOT NULL AND lng IS NOT NULL').all()
        for (const a of allAddrs.results as any[]) {
          let match = false
          if ((z as any).city_pattern && a.city) {
            if (new RegExp((z as any).city_pattern.replace(/%/g, '.*'), 'i').test(a.city)) match = true
          }
          if ((z as any).zip_codes && a.zip) {
            if ((z as any).zip_codes.split(',').map((s: string) => s.trim()).includes(a.zip)) match = true
          }
          if (match) addrs.push(a)
        }
      }
      if (addrs.length > 0) {
        const avgLat = addrs.reduce((sum: number, a: any) => sum + a.lat, 0) / addrs.length
        const avgLng = addrs.reduce((sum: number, a: any) => sum + a.lng, 0) / addrs.length
        const oldLat = (z as any).center_lat, oldLng = (z as any).center_lng
        await c.env.DB.prepare('UPDATE delivery_zones SET center_lat = ?, center_lng = ? WHERE id = ?')
          .bind(Math.round(avgLat * 1000000) / 1000000, Math.round(avgLng * 1000000) / 1000000, z.id).run()
        results.push({ id: z.id, name: (z as any).name, addr_count: addrs.length, old: { lat: oldLat, lng: oldLng }, new: { lat: Math.round(avgLat * 1000000) / 1000000, lng: Math.round(avgLng * 1000000) / 1000000 }, status: 'updated' })
      } else {
        results.push({ id: z.id, name: (z as any).name, addr_count: 0, status: 'no_addresses' })
      }
    }
    return c.json({ success: true, zones_updated: results.filter(r => r.status === 'updated').length, results })
  } catch (e: any) {
    return c.json({ error: 'Failed to recalculate zone centers', detail: e.message }, 500)
  }
})

// Assign an address to a zone
app.put('/api/addresses/:id/zone', async (c) => {
  const id = c.req.param('id')
  const { zone_id } = await c.req.json()
  await c.env.DB.prepare('UPDATE addresses SET zone_id = ? WHERE id = ?').bind(zone_id, id).run()
  return c.json({ success: true })
})

// Auto-assign all un-zoned addresses
app.post('/api/zones/auto-assign', async (c) => {
  try {
  const unzoned = await c.env.DB.prepare('SELECT id, lat, lng, city, zip FROM addresses WHERE zone_id IS NULL').all()
  const zones = await c.env.DB.prepare('SELECT * FROM delivery_zones WHERE active = 1').all()
  let assigned = 0

  for (const addr of unzoned.results as any[]) {
    let bestZone: any = null
    let bestScore = 0
    for (const z of zones.results as any[]) {
      let score = 0
      if (z.boundary_json && addr.lat && addr.lng) {
        try {
          if (pointInPolygon(addr.lat, addr.lng, JSON.parse(z.boundary_json))) score += 100
        } catch (e) {}
      }
      if (z.center_lat && z.center_lng && addr.lat && addr.lng) {
        const dist = distanceMiles(addr.lat, addr.lng, z.center_lat, z.center_lng)
        if (dist <= (z.radius_miles || 5)) score += Math.round(80 - dist * 10)
      }
      if (z.city_pattern && addr.city) {
        if (new RegExp(z.city_pattern.replace(/%/g, '.*'), 'i').test(addr.city)) score += 50
      }
      if (z.zip_codes && addr.zip) {
        if (z.zip_codes.split(',').map((s: string) => s.trim()).includes(addr.zip)) score += 60
      }
      if (score > bestScore) { bestScore = score; bestZone = z }
    }
    if (bestZone) {
      await c.env.DB.prepare('UPDATE addresses SET zone_id = ? WHERE id = ?').bind(bestZone.id, addr.id).run()
      assigned++
    }
  }
  return c.json({ success: true, assigned })
  } catch (e: any) {
    console.error('Auto-assign error:', e.message)
    return c.json({ error: 'Failed to auto-assign zones', assigned: 0 }, 500)
  }
})

// Point-in-polygon (ray casting)
function pointInPolygon(lat: number, lng: number, polygon: number[][]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i][0], xi = polygon[i][1]
    const yj = polygon[j][0], xj = polygon[j][1]
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

// ==================== SMART ROUTE BUILDER API ====================
app.post('/api/routes/smart-build', async (c) => {
  const body = await c.req.json()
  const { date, zone_id, truck_id, driver_id, max_pallets, include_order_ids } = body

  if (!date) return c.json({ error: 'Date is required' }, 400)

  // Get truck info for capacity (pallet-based only)
  let truckPallets = max_pallets || 26
  if (truck_id) {
    const truck = await c.env.DB.prepare('SELECT max_pallet_spots FROM trucks WHERE id = ?').bind(truck_id).first() as any
    if (truck) { truckPallets = truck.max_pallet_spots || truckPallets }
  }

  // Determine which day of week for zone matching
  const dow = new Date(date + 'T12:00:00').getDay()
  const dayNames = ['sun','mon','tue','wed','thu','fri','sat']
  const dayName = dayNames[dow]

  // Build candidate orders query
  let orderQuery = `SELECT o.id, o.order_number, o.customer_id, o.address_id, o.priority, o.special_instructions,
    c.business_name, a.lat, a.lng, a.street, a.city, a.zip, a.zone_id, a.gate_code
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    LEFT JOIN addresses a ON o.address_id = a.id
    WHERE o.status IN ('new','confirmed') AND o.id NOT IN (SELECT order_id FROM route_stops)`
  const params: any[] = []

  // If specific order IDs provided, use them
  if (include_order_ids && include_order_ids.length > 0) {
    orderQuery += ` AND o.id IN (${include_order_ids.map(() => '?').join(',')})`
    params.push(...include_order_ids)
  }
  // Optionally filter by scheduled date
  if (body.filter_date) {
    orderQuery += ' AND (o.scheduled_date = ? OR o.scheduled_date IS NULL)'
    params.push(date)
  }

  orderQuery += ' ORDER BY CASE o.priority WHEN "urgent" THEN 1 WHEN "high" THEN 2 WHEN "normal" THEN 3 WHEN "low" THEN 4 END, o.created_at ASC'
  const candidates = await c.env.DB.prepare(orderQuery).bind(...params).all()
  let allCandidates = candidates.results as any[]

  // Filter by zone if specified
  if (zone_id) {
    const zone = await c.env.DB.prepare('SELECT * FROM delivery_zones WHERE id = ?').bind(zone_id).first() as any
    if (zone) {
      allCandidates = allCandidates.filter(o => {
        if (o.zone_id == zone_id) return true
        // Check if address falls within zone by proximity
        if (zone.center_lat && zone.center_lng && o.lat && o.lng) {
          return distanceMiles(o.lat, o.lng, zone.center_lat, zone.center_lng) <= (zone.radius_miles || 5)
        }
        return false
      })
    }
  } else if (!include_order_ids) {
    // Auto-match: get zones that deliver on this day
    const zonesForDay = await c.env.DB.prepare('SELECT * FROM delivery_zones WHERE active = 1').all()
    const matchingZoneIds = (zonesForDay.results as any[])
      .filter(z => z.delivery_days.split(',').map((s: string) => s.trim()).includes(dayName))
      .map(z => z.id)

    if (matchingZoneIds.length > 0) {
      // Prefer orders in zones that deliver today, but include unzoned too
      allCandidates.sort((a, b) => {
        const aInZone = matchingZoneIds.includes(a.zone_id) ? 0 : 1
        const bInZone = matchingZoneIds.includes(b.zone_id) ? 0 : 1
        if (aInZone !== bInZone) return aInZone - bInZone
        return 0
      })
    }
  }

  // Calculate pallet counts for each order (group by pallet_qty so items share pallets)
  for (const order of allCandidates) {
    const items = await c.env.DB.prepare(
      `SELECT oi.quantity, p.pallet_qty, p.unit_type
       FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`
    ).bind(order.id).all()
    order.pallet_count = calcPallets(items.results as any[])
  }

  // Greedy bin-packing: fill truck by priority, then pallet capacity
  const selected: any[] = []
  let totalPallets = 0

  for (const order of allCandidates) {
    const newPallets = totalPallets + (order.pallet_count || 0)
    if (newPallets <= truckPallets) {
      selected.push(order)
      totalPallets = newPallets
    }
  }

  // Optimize stop order using nearest-neighbor from depot
  const geocoded = selected.filter(s => s.lat && s.lng)
  const nonGeocoded = selected.filter(s => !s.lat || !s.lng)
  const ordered: any[] = []
  if (geocoded.length > 0) {
    const remaining = [...geocoded]
    let curLat = DEPOT.lat, curLng = DEPOT.lng
    while (remaining.length > 0) {
      let bestIdx = 0, bestDist = Infinity
      for (let i = 0; i < remaining.length; i++) {
        let d = distanceMiles(curLat, curLng, remaining[i].lat, remaining[i].lng)
        if (remaining[i].priority === 'urgent') d *= 0.7
        else if (remaining[i].priority === 'high') d *= 0.85
        if (d < bestDist) { bestDist = d; bestIdx = i }
      }
      const next = remaining.splice(bestIdx, 1)[0]
      ordered.push(next)
      curLat = next.lat; curLng = next.lng
    }
  }
  ordered.push(...nonGeocoded)

  // Calculate route metrics
  let totalMiles = 0
  let prevLat = DEPOT.lat, prevLng = DEPOT.lng
  for (const s of ordered.filter(o => o.lat && o.lng)) {
    totalMiles += distanceMiles(prevLat, prevLng, s.lat, s.lng)
    prevLat = s.lat; prevLng = s.lng
  }
  if (ordered.some(o => o.lat && o.lng)) totalMiles += distanceMiles(prevLat, prevLng, DEPOT.lat, DEPOT.lng)

  return c.json({
    success: true,
    preview: {
      date,
      zone_id: zone_id || null,
      orders: ordered.map((o, i) => ({
        id: o.id, order_number: o.order_number, business_name: o.business_name,
        pallet_count: o.pallet_count, priority: o.priority,
        sequence: i + 1, street: o.street, city: o.city, lat: o.lat, lng: o.lng,
        gate_code: o.gate_code, zone_id: o.zone_id
      })),
      totals: {
        orders: ordered.length,
        pallets: totalPallets,
        pallets_pct: Math.round(totalPallets / truckPallets * 100),
        estimated_miles: Math.round(totalMiles * 10) / 10,
        estimated_fuel_gal: Math.round(totalMiles / 8 * 10) / 10,
        estimated_fuel_cost: Math.round(totalMiles / 8 * 4.2 * 100) / 100,
        estimated_time: `${Math.floor(totalMiles / 25 * 60 / 60)}h ${Math.round(totalMiles / 25 * 60 % 60 + ordered.length * 15)}m`,
        truck_pallet_capacity: truckPallets,
      },
      remaining_candidates: allCandidates.length - selected.length,
    }
  })
})

// Confirm a smart-built route (actually create it)
app.post('/api/routes/smart-confirm', async (c) => {
  const body = await c.req.json()
  const { date, truck_id, driver_id, order_ids, notes } = body
  if (!date || !order_ids?.length) return c.json({ error: 'Date and order_ids required' }, 400)

  const routeNum = 'RT-' + date.replace(/-/g, '').slice(4) + '-' + Math.floor(Math.random() * 9 + 1)
  const res = await c.env.DB.prepare(
    'INSERT INTO routes (route_number, date, truck_id, driver_id, status, notes) VALUES (?,?,?,?,?,?)'
  ).bind(routeNum, date, truck_id || null, driver_id || null, 'planned', notes || null).run()
  const routeId = res.meta.last_row_id

  for (let i = 0; i < order_ids.length; i++) {
    await insertRouteStop(c.env.DB, routeId, order_ids[i], i + 1)
    await c.env.DB.prepare("UPDATE orders SET status = 'scheduled', scheduled_date = ? WHERE id = ? AND status IN ('new','confirmed')")
      .bind(date, order_ids[i]).run()
  }

  // Capture route patterns for learning engine
  captureRoutePatterns(c.env.DB, routeId as number, 'created').catch(() => {})

  return c.json({ id: routeId, route_number: routeNum }, 201)
})

// ==================== AUTO ROUTE PLANNER (SINGLE-DAY) ====================
// Plans routes for ONE specific date. Shows existing routes too for last-minute additions.
app.post('/api/routes/auto-plan', async (c) => {
 try {
  const body = await c.req.json()
  const { date, preferences } = body
  // date: "2026-04-09" — the single day to plan for (defaults to tomorrow)
  // preferences: { max_stops_per_route }

  const dayNames = ['sun','mon','tue','wed','thu','fri','sat']
  const planDate = date || (() => { const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().split('T')[0] })()
  const maxStopsPerRoute = preferences?.max_stops_per_route || 10
  const dow = dayNames[new Date(planDate + 'T12:00:00').getDay()]
  const dayLabel = new Date(planDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  // 1. Get existing routes for this date (already planned/confirmed)
  const existingRoutesRes = await c.env.DB.prepare(
    `SELECT r.id, r.route_number, r.date, r.truck_id, r.driver_id, r.status, r.notes,
      t.name as truck_name, t.max_pallet_spots as truck_pallets,
      u.name as driver_name
    FROM routes r
    LEFT JOIN trucks t ON r.truck_id = t.id
    LEFT JOIN users u ON r.driver_id = u.id
    WHERE r.date = ? AND r.archived = 0 ORDER BY r.id`
  ).bind(planDate).all()

  // Get stops + pallets for each existing route
  const existingRoutes: any[] = []
  for (const rt of existingRoutesRes.results as any[]) {
    const stopsRes = await c.env.DB.prepare(
      `SELECT rs.id as stop_id, rs.sequence, rs.status as stop_status,
        o.id as order_id, o.order_number, o.priority, o.special_instructions,
        c.business_name, a.lat, a.lng, a.street, a.city, a.zone_id, a.gate_code
      FROM route_stops rs
      JOIN orders o ON rs.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN addresses a ON o.address_id = a.id
      WHERE rs.route_id = ? ORDER BY rs.sequence`
    ).bind(rt.id).all()
    let usedPallets = 0
    const routeAllItems: Array<{ quantity: number; pallet_qty: number }> = []
    for (const s of stopsRes.results as any[]) {
      const items = await c.env.DB.prepare(
        `SELECT oi.quantity, p.pallet_qty FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`
      ).bind((s as any).order_id).all()
      ;(s as any).pallet_count = Math.max(calcPallets(items.results as any[]), 1)
      for (const i of items.results as any[]) { routeAllItems.push({ quantity: i.quantity, pallet_qty: i.pallet_qty || 40 }) }
    }
    usedPallets = calcPallets(routeAllItems)
    existingRoutes.push({
      ...rt, truck_pallets: rt.truck_pallets || 12,
      stops: stopsRes.results,
      used_pallets: usedPallets,
      available_pallets: (rt.truck_pallets || 12) - usedPallets,
    })
  }

  // 2. Get all unrouted orders (new/confirmed, not already on a route)
  const ordersRes = await c.env.DB.prepare(
    `SELECT o.id, o.order_number, o.customer_id, o.address_id, o.priority, o.special_instructions, o.scheduled_date,
      c.business_name, c.preferred_truck_id,
      a.lat, a.lng, a.street, a.city, a.state, a.zip, a.zone_id, a.gate_code, a.driver_notes as address_notes
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    LEFT JOIN addresses a ON o.address_id = a.id
    WHERE o.archived = 0 AND o.status IN ('new','confirmed')
      AND o.id NOT IN (SELECT order_id FROM route_stops)
    ORDER BY CASE o.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 END, o.created_at ASC`
  ).all()
  const allOrders = ordersRes.results as any[]

  // 3. Get pallet counts and item counts for each unrouted order
  for (const order of allOrders) {
    const items = await c.env.DB.prepare(
      `SELECT oi.quantity, p.pallet_qty FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`
    ).bind(order.id).all()
    let pallets = 0, itemCount = 0
    for (const item of items.results as any[]) {
      pallets += Math.ceil(item.quantity / (item.pallet_qty || 40))
      itemCount += item.quantity || 0
    }
    order.pallet_count = Math.max(pallets, 1)
    order.item_count = itemCount
  }

  // 4. Get zones, trucks, drivers
  const zonesRes = await c.env.DB.prepare('SELECT * FROM delivery_zones WHERE active = 1').all()
  const zones = zonesRes.results as any[]
  const trucksRes = await c.env.DB.prepare(
    "SELECT t.*, dz.name as zone_name, dz.delivery_days as zone_delivery_days FROM trucks t LEFT JOIN delivery_zones dz ON t.zone_id = dz.id WHERE t.status = 'available' AND t.archived = 0 ORDER BY t.max_pallet_spots DESC"
  ).all()
  const trucks = trucksRes.results as any[]
  const driversRes = await c.env.DB.prepare(
    "SELECT id, name, phone FROM users WHERE role = 'driver' AND active = 1 ORDER BY name"
  ).all()
  const drivers = driversRes.results as any[]

  // 5. Auto-detect zone for orders missing zone_id
  for (const order of allOrders) {
    if (!order.zone_id && order.lat && order.lng) {
      let bestScore = 0
      for (const z of zones) {
        let score = 0
        if (z.boundary_json) { try { if (pointInPolygon(order.lat, order.lng, JSON.parse(z.boundary_json))) score += 100 } catch {} }
        if (z.center_lat && z.center_lng) {
          const dist = distanceMiles(order.lat, order.lng, z.center_lat, z.center_lng)
          if (dist <= (z.radius_miles || 5)) score += Math.round(80 - dist * 10)
        }
        if (z.city_pattern && order.city) { if (new RegExp(z.city_pattern.replace(/%/g, '.*'), 'i').test(order.city)) score += 50 }
        if (z.zip_codes && order.zip) { if (z.zip_codes.split(',').map((s: string) => s.trim()).includes(order.zip)) score += 60 }
        if (score > bestScore) { bestScore = score; order.zone_id = z.id }
      }
    }
  }

  // 6. Which zones deliver on this day?
  const todayZoneIds = zones
    .filter(z => (z.delivery_days || '').split(',').map((s: string) => s.trim().toLowerCase()).includes(dow))
    .map(z => z.id)
  const todayZones = zones.filter(z => todayZoneIds.includes(z.id))

  // 7. Build new routes from unrouted orders
  //    Sort: urgent first, then zone-matched orders first
  const sortedOrders = [...allOrders].sort((a, b) => {
    const priA = a.priority === 'urgent' ? 0 : a.priority === 'high' ? 1 : 2
    const priB = b.priority === 'urgent' ? 0 : b.priority === 'high' ? 1 : 2
    if (priA !== priB) return priA - priB
    const aInZone = todayZoneIds.includes(a.zone_id) ? 0 : 1
    const bInZone = todayZoneIds.includes(b.zone_id) ? 0 : 1
    return aInZone - bInZone
  })

  const usedTruckIds = existingRoutes.map(r => r.truck_id).filter(Boolean)
  const usedDriverIds = existingRoutes.map(r => r.driver_id).filter(Boolean)
  const plannedRoutes: any[] = []
  let remaining = [...sortedOrders]
  let routeIdx = existingRoutes.length

  const unassignableOrders: any[] = []

  while (remaining.length > 0) {
    routeIdx++
    // Pick truck
    let truck = null
    const allUsedTrucks = [...usedTruckIds, ...plannedRoutes.map(r => r.truck_id).filter(Boolean)]
    for (const t of trucks) { if (!allUsedTrucks.includes(t.id) && t.zone_id && todayZoneIds.includes(t.zone_id)) { truck = t; break } }
    if (!truck) { for (const t of trucks) { if (!allUsedTrucks.includes(t.id)) { truck = t; break } } }
    if (!truck && trucks.length > 0) truck = trucks[0]

    const truckPallets = truck ? (truck.max_pallet_spots || 12) : 12
    const maxStops = Math.min(maxStopsPerRoute, 15)

    const routeOrders: any[] = []
    let routePallets = 0
    const leftover: any[] = []

    for (const order of remaining) {
      if (routeOrders.length >= maxStops) { leftover.push(order); continue }
      const newPallets = routePallets + (order.pallet_count || 1)
      if (newPallets <= truckPallets) { routeOrders.push(order); routePallets = newPallets }
      else { leftover.push(order) }
    }

    if (routeOrders.length === 0) { unassignableOrders.push(...leftover); break }

    // Nearest-neighbor ordering from depot
    const geo = routeOrders.filter(s => s.lat && s.lng), noGeo = routeOrders.filter(s => !s.lat || !s.lng)
    const ordered: any[] = []
    if (geo.length > 0) {
      const rem = [...geo]; let cLat = DEPOT.lat, cLng = DEPOT.lng
      while (rem.length > 0) {
        let bI = 0, bD = Infinity
        for (let i = 0; i < rem.length; i++) {
          let dd = distanceMiles(cLat, cLng, rem[i].lat, rem[i].lng)
          if (rem[i].priority === 'urgent') dd *= 0.7; else if (rem[i].priority === 'high') dd *= 0.85
          if (dd < bD) { bD = dd; bI = i }
        }
        const next = rem.splice(bI, 1)[0]; ordered.push(next); cLat = next.lat; cLng = next.lng
      }
    }
    ordered.push(...noGeo)

    let totalMiles = 0, pLat = DEPOT.lat, pLng = DEPOT.lng
    for (const s of ordered.filter(o => o.lat && o.lng)) { totalMiles += distanceMiles(pLat, pLng, s.lat, s.lng); pLat = s.lat; pLng = s.lng }
    if (ordered.some(o => o.lat && o.lng)) totalMiles += distanceMiles(pLat, pLng, DEPOT.lat, DEPOT.lng)

    // Pick driver
    let driver = null
    const allUsedDrivers = [...usedDriverIds, ...plannedRoutes.map(r => r.driver_id).filter(Boolean)]
    for (const dr of drivers) { if (!allUsedDrivers.includes(dr.id)) { driver = dr; break } }
    if (!driver && drivers.length > 0) driver = drivers[0]

    // Primary zone
    const zoneCounts: Record<number, number> = {}
    for (const o of ordered) { if (o.zone_id) zoneCounts[o.zone_id] = (zoneCounts[o.zone_id] || 0) + 1 }
    let primaryZoneId: number | null = null, maxZC = 0
    for (const [zid, cnt] of Object.entries(zoneCounts)) { if (cnt > maxZC) { maxZC = cnt; primaryZoneId = parseInt(zid) } }
    const primaryZone = primaryZoneId ? zones.find(z => z.id === primaryZoneId) : null

    plannedRoutes.push({
      _new: true, date: planDate, route_index: routeIdx,
      truck_id: truck?.id || null, truck_name: truck?.name || 'Unassigned', truck_pallets: truckPallets,
      driver_id: driver?.id || null, driver_name: driver?.name || 'Unassigned',
      zone_id: primaryZoneId, zone_name: primaryZone?.name || null, zone_color: primaryZone?.color || null,
      orders: ordered.map((o, i) => ({
        id: o.id, order_number: o.order_number, business_name: o.business_name,
        pallet_count: o.pallet_count, item_count: o.item_count || 0, priority: o.priority,
        sequence: i + 1, street: o.street, city: o.city, lat: o.lat, lng: o.lng,
        gate_code: o.gate_code, zone_id: o.zone_id, special_instructions: o.special_instructions
      })),
      totals: {
        stops: ordered.length, pallets: routePallets,
        items: ordered.reduce((s: number, o: any) => s + (o.item_count || 0), 0),
        pallets_pct: Math.round(routePallets / truckPallets * 100),
        estimated_miles: Math.round(totalMiles * 10) / 10,
        estimated_fuel_gal: Math.round(totalMiles / 8 * 10) / 10,
        estimated_fuel_cost: Math.round(totalMiles / 8 * 4.2 * 100) / 100,
      }
    })
    remaining = leftover
  }

  return c.json({
    success: true,
    date: planDate,
    day_label: dayLabel,
    day_of_week: dow,
    zones_today: todayZones.map(z => ({ id: z.id, name: z.name, color: z.color, delivery_days: z.delivery_days })),
    existing_routes: existingRoutes,
    new_routes: plannedRoutes,
    unrouted_orders: allOrders.length,
    total_new_routes: plannedRoutes.length,
    unassignable: unassignableOrders.map(o => ({ id: o.id, order_number: o.order_number, business_name: o.business_name, reason: 'Could not fit in available truck capacity' })),
    trucks_available: trucks.map(t => ({ id: t.id, name: t.name, pallets: t.max_pallet_spots || 12, zone_name: t.zone_name })),
    drivers_available: drivers.map(d => ({ id: d.id, name: d.name })),
  })
 } catch (e: any) {
  console.error('Auto-plan error:', e)
  return c.json({ error: 'Auto-plan failed', detail: e?.message || String(e) }, 500)
 }
})

// Confirm auto-plan: create new routes + optionally add orders to existing routes
app.post('/api/routes/auto-plan/confirm', async (c) => {
 try {
  const body = await c.req.json()
  const { routes, add_to_existing } = body
  // routes: array of { date, truck_id, driver_id, order_ids, notes }  (new routes to create)
  // add_to_existing: array of { route_id, order_ids }  (add orders to existing routes)

  const createdRoutes: any[] = []
  const addedStops: any[] = []

  // Create new routes
  if (routes && routes.length > 0) {
    for (const route of routes) {
      if (!route.date || !route.order_ids?.length) continue
      const routeNum = 'RT-' + route.date.replace(/-/g, '').slice(4) + '-' + Math.floor(Math.random() * 9 + 1)
      const res = await c.env.DB.prepare(
        'INSERT INTO routes (route_number, date, truck_id, driver_id, status, notes) VALUES (?,?,?,?,?,?)'
      ).bind(routeNum, route.date, route.truck_id || null, route.driver_id || null, 'planned', route.notes || null).run()
      const routeId = res.meta.last_row_id
      for (let i = 0; i < route.order_ids.length; i++) {
        await insertRouteStop(c.env.DB, routeId, route.order_ids[i], i + 1)
        await c.env.DB.prepare("UPDATE orders SET status = 'scheduled', scheduled_date = ? WHERE id = ? AND status IN ('new','confirmed')").bind(route.date, route.order_ids[i]).run()
      }
      createdRoutes.push({ id: routeId, route_number: routeNum, date: route.date, stops: route.order_ids.length })
      // Capture patterns for learning engine
      captureRoutePatterns(c.env.DB, routeId as number, 'created').catch(() => {})
    }
  }

  // Add orders to existing routes
  if (add_to_existing && add_to_existing.length > 0) {
    for (const entry of add_to_existing) {
      if (!entry.route_id || !entry.order_ids?.length) continue
      const route = await c.env.DB.prepare('SELECT date FROM routes WHERE id = ?').bind(entry.route_id).first() as any
      const maxSeq = await c.env.DB.prepare('SELECT MAX(sequence) as m FROM route_stops WHERE route_id = ?').bind(entry.route_id).first() as any
      let seq = (maxSeq?.m || 0) + 1
      for (const oid of entry.order_ids) {
        await insertRouteStop(c.env.DB, entry.route_id, oid, seq++)
        if (route?.date) await c.env.DB.prepare("UPDATE orders SET status = 'scheduled', scheduled_date = ? WHERE id = ? AND status IN ('new','confirmed')").bind(route.date, oid).run()
      }
      addedStops.push({ route_id: entry.route_id, added: entry.order_ids.length })
      // Re-capture patterns after modifying existing route
      captureRoutePatterns(c.env.DB, entry.route_id, 'modified').catch(() => {})
    }
  }

  return c.json({ success: true, created: createdRoutes, created_count: createdRoutes.length, added: addedStops })
 } catch (e: any) {
  console.error('Auto-plan confirm error:', e)
  return c.json({ error: 'Confirmation failed', detail: e?.message || String(e) }, 500)
 }
})

// ==================== RETURNS API ====================
// Actionable returns (pending/approved) for the orders page
app.get('/api/returns/actionable', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      `SELECT ret.*, c.business_name, c.contact_name, c.phone as customer_phone,
       a.street, a.city, a.state, a.zip, CAST(a.lat AS REAL) as addr_lat, CAST(a.lng AS REAL) as addr_lng,
       o.order_number, o.address_id,
       u.name as created_by_name
       FROM returns ret
       JOIN customers c ON ret.customer_id = c.id
       LEFT JOIN orders o ON ret.order_id = o.id
       LEFT JOIN addresses a ON COALESCE(o.address_id, (SELECT id FROM addresses WHERE customer_id = ret.customer_id LIMIT 1)) = a.id
       LEFT JOIN users u ON ret.created_by = u.id
       WHERE ret.status IN ('pending','approved')
       ORDER BY ret.created_at DESC`
    ).all()
    const returns = (result.results as any[]).map((r: any) => ({ ...r, lat: r.addr_lat ?? null, lng: r.addr_lng ?? null, addr_lat: undefined, addr_lng: undefined }))
    for (const ret of returns) {
      const items = await c.env.DB.prepare(
        'SELECT ri.*, p.name as product_name, p.sku, p.unit_type, p.pallet_qty FROM return_items ri JOIN products p ON ri.product_id = p.id WHERE ri.return_id = ?'
      ).bind(ret.id).all()
      ret.items = items.results
    }
    return c.json({ returns })
  } catch (e: any) {
    return c.json({ returns: [], error: e.message })
  }
})
app.get('/api/returns', async (c) => {
  const customerId = c.req.query('customer_id')
  const routeId = c.req.query('route_id')
  const orderId = c.req.query('order_id')
  let query = `SELECT ret.*, c.business_name, u.name as created_by_name,
    o.order_number, r.route_number
    FROM returns ret
    LEFT JOIN customers c ON ret.customer_id = c.id
    LEFT JOIN users u ON ret.created_by = u.id
    LEFT JOIN orders o ON ret.order_id = o.id
    LEFT JOIN routes r ON ret.route_id = r.id WHERE 1=1`
  const params: any[] = []
  if (customerId) { query += ' AND ret.customer_id = ?'; params.push(customerId) }
  if (routeId) { query += ' AND ret.route_id = ?'; params.push(routeId) }
  if (orderId) { query += ' AND ret.order_id = ?'; params.push(orderId) }
  query += ' ORDER BY ret.created_at DESC'
  const result = await c.env.DB.prepare(query).bind(...params).all()
  // Get items for each return and calculate pallet count using grouped logic
  for (const ret of result.results as any[]) {
    const items = await c.env.DB.prepare(
      `SELECT ri.*, p.name as product_name, p.sku, p.unit_type, p.pallet_qty FROM return_items ri JOIN products p ON ri.product_id = p.id WHERE ri.return_id = ?`
    ).bind(ret.id).all()
    ret.items = items.results
    ret.item_count = (items.results as any[]).reduce((s: number, i: any) => s + (i.expected_qty || 0), 0)
    ret.pallet_count = calcPallets((items.results as any[]).map((i: any) => ({ quantity: i.expected_qty || 0, pallet_qty: i.pallet_qty })))
  }
  return c.json({ returns: result.results })
})

app.get('/api/returns/:id', async (c) => {
  const id = c.req.param('id')
  const ret = await c.env.DB.prepare(
    `SELECT ret.*, c.business_name, u.name as created_by_name, o.order_number, r.route_number,
     ru.name as received_by_name
     FROM returns ret LEFT JOIN customers c ON ret.customer_id = c.id LEFT JOIN users u ON ret.created_by = u.id
     LEFT JOIN orders o ON ret.order_id = o.id LEFT JOIN routes r ON ret.route_id = r.id
     LEFT JOIN users ru ON ret.received_by = ru.id WHERE ret.id = ?`
  ).bind(id).first()
  if (!ret) return c.json({ error: 'Return not found' }, 404)
  const items = await c.env.DB.prepare(
    `SELECT ri.*, p.name as product_name, p.sku, p.unit_type, p.pallet_qty FROM return_items ri JOIN products p ON ri.product_id = p.id WHERE ri.return_id = ?`
  ).bind(id).all()
  return c.json({ return: ret, items: items.results })
})

app.post('/api/returns', async (c) => {
  const body = await c.req.json()
  if (!body.customer_id || !body.items?.length) return c.json({ error: 'customer_id and items required' }, 400)
  const res = await c.env.DB.prepare(
    `INSERT INTO returns (order_id, route_id, customer_id, created_by, status, notes) VALUES (?,?,?,?,?,?)`
  ).bind(body.order_id || null, body.route_id || null, body.customer_id, body.created_by || null, 'pending', body.notes || null).run()
  const retId = res.meta.last_row_id
  for (const item of body.items) {
    if (!item.product_id) continue
    await c.env.DB.prepare(
      'INSERT INTO return_items (return_id, product_id, expected_qty, actual_qty, reason) VALUES (?,?,?,?,?)'
    ).bind(retId, item.product_id, item.expected_qty || 0, item.actual_qty || 0, item.reason || null).run()
  }
  return c.json({ id: retId, success: true }, 201)
})

app.put('/api/returns/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  if (body.status) await c.env.DB.prepare("UPDATE returns SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(body.status, id).run()
  if (body.notes !== undefined) await c.env.DB.prepare("UPDATE returns SET notes = ?, updated_at = datetime('now') WHERE id = ?").bind(body.notes, id).run()
  if (body.scheduled_date !== undefined) await c.env.DB.prepare("UPDATE returns SET scheduled_date = ?, updated_at = datetime('now') WHERE id = ?").bind(body.scheduled_date || null, id).run()
  if (body.items) {
    await c.env.DB.prepare('DELETE FROM return_items WHERE return_id = ?').bind(id).run()
    for (const item of body.items) {
      if (!item.product_id) continue
      await c.env.DB.prepare(
        'INSERT INTO return_items (return_id, product_id, expected_qty, actual_qty, reason) VALUES (?,?,?,?,?)'
      ).bind(id, item.product_id, item.expected_qty || 0, item.actual_qty || 0, item.reason || null).run()
    }
  }
  return c.json({ success: true })
})

// Receive return — warehouse inspects each item, marks condition, qty received, restock decision
app.post('/api/returns/:id/receive', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  // Validate return exists
  const ret = await c.env.DB.prepare('SELECT * FROM returns WHERE id = ?').bind(id).first()
  if (!ret) return c.json({ error: 'Return not found' }, 404)
  if (!body.items || !body.items.length) return c.json({ error: 'items array required with receive data' }, 400)

  // Update each return_item with receive data
  for (const item of body.items) {
    if (!item.id) continue
    await c.env.DB.prepare(
      `UPDATE return_items SET received = 1, received_qty = ?, condition = ?, restock = ?, receive_notes = ? WHERE id = ? AND return_id = ?`
    ).bind(
      item.received_qty ?? 0,
      item.condition || 'good',
      item.restock ? 1 : 0,
      item.receive_notes || null,
      item.id,
      id
    ).run()
  }

  // Update returns header — mark as received, record who and when
  await c.env.DB.prepare(
    `UPDATE returns SET status = 'received', received_by = ?, received_at = datetime('now'), receive_notes = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(body.received_by || null, body.receive_notes || null, id).run()

  return c.json({ success: true })
})

// Mark received return as fully processed (restocked / disposed)
app.post('/api/returns/:id/process', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  await c.env.DB.prepare(
    `UPDATE returns SET status = 'processed', updated_at = datetime('now') WHERE id = ?`
  ).bind(id).run()
  return c.json({ success: true })
})

app.delete('/api/returns/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM return_items WHERE return_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM returns WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ==================== SCHEDULING API ====================
app.get('/api/schedule', async (c) => {
  const startDate = c.req.query('start') || new Date().toISOString().split('T')[0]
  const endDate = c.req.query('end') || startDate
  const orders = await c.env.DB.prepare(
    `SELECT o.*, c.business_name, a.street, a.city, a.lat, a.lng,
    rs.route_id, r.route_number, r.status as route_status, r.truck_id, t.name as truck_name
    FROM orders o JOIN customers c ON o.customer_id = c.id LEFT JOIN addresses a ON o.address_id = a.id
    LEFT JOIN route_stops rs ON rs.order_id = o.id LEFT JOIN routes r ON rs.route_id = r.id LEFT JOIN trucks t ON r.truck_id = t.id
    WHERE o.archived = 0 AND o.scheduled_date BETWEEN ? AND ?
    ORDER BY o.scheduled_date, t.name, r.route_number, CASE o.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 END`
  ).bind(startDate, endDate).all()
  const routes = await c.env.DB.prepare(
    `SELECT r.*, u.name as driver_name, t.name as truck_name
    FROM routes r LEFT JOIN users u ON r.driver_id = u.id LEFT JOIN trucks t ON r.truck_id = t.id
    WHERE r.archived = 0 AND r.date BETWEEN ? AND ?`
  ).bind(startDate, endDate).all()
  const unscheduled = await c.env.DB.prepare(
    `SELECT o.*, c.business_name, a.lat, a.lng, a.street, a.city FROM orders o
    JOIN customers c ON o.customer_id = c.id LEFT JOIN addresses a ON o.address_id = a.id
    WHERE o.archived = 0 AND o.scheduled_date IS NULL AND o.status IN ('new','confirmed') ORDER BY o.priority, o.created_at`
  ).all()
  // Scheduled returns for the date range
  let scheduledReturns: any[] = []
  try {
    const retResult = await c.env.DB.prepare(
      `SELECT ret.*, c.business_name, a.street, a.city, a.lat, a.lng
       FROM returns ret JOIN customers c ON ret.customer_id = c.id
       LEFT JOIN orders o ON ret.order_id = o.id
       LEFT JOIN addresses a ON COALESCE(o.address_id, (SELECT id FROM addresses WHERE customer_id = ret.customer_id LIMIT 1)) = a.id
       WHERE ret.status IN ('pending','approved') AND ret.scheduled_date BETWEEN ? AND ?
       ORDER BY ret.scheduled_date`
    ).bind(startDate, endDate).all()
    for (const ret of retResult.results as any[]) {
      const ri = await c.env.DB.prepare(
        'SELECT ri.*, p.name as product_name, p.sku, p.unit_type, p.pallet_qty FROM return_items ri JOIN products p ON ri.product_id = p.id WHERE ri.return_id = ?'
      ).bind((ret as any).id).all()
      ;(ret as any).items = ri.results
    }
    scheduledReturns = retResult.results as any[]
  } catch (e) { /* returns table may not exist */ }
  return c.json({ orders: orders.results, routes: routes.results, unscheduled: unscheduled.results, scheduled_returns: scheduledReturns })
})

// ==================== SCHEDULE MAP API ====================
// Distribution center: 100 Aldi Way, Ste 400, West Palm Beach, FL 33411
const DEPOT = { lat: 26.7045593, lng: -80.2047917, name: 'BF Distribution Center', address: '100 Aldi Way, Ste 400, West Palm Beach, FL 33411' }

// Haversine distance in miles
function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959 // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

app.get('/api/schedule/map', async (c) => {
  const startDate = c.req.query('start') || new Date().toISOString().split('T')[0]
  const endDate = c.req.query('end') || startDate
  // Get all orders with coordinates for the date range
  const orders = await c.env.DB.prepare(
    `SELECT o.id, o.order_number, o.customer_id, o.status, o.priority, o.scheduled_date,
     o.special_instructions, c.business_name, c.contact_name,
     a.id as address_id, a.street, a.city, a.state, a.zip, a.lat, a.lng, a.gate_code
     FROM orders o
     JOIN customers c ON o.customer_id = c.id
     LEFT JOIN addresses a ON o.address_id = a.id
     WHERE o.archived = 0 AND (o.scheduled_date BETWEEN ? AND ? OR (o.scheduled_date IS NULL AND o.status IN ('new','confirmed')))
       AND o.status NOT IN ('completed','cancelled','delivered')
     ORDER BY o.scheduled_date, o.priority`
  ).bind(startDate, endDate).all()

  const routes = await c.env.DB.prepare(
    `SELECT r.id, r.route_number, r.date, r.status, r.total_miles,
     u.name as driver_name, t.name as truck_name, t.max_pallet_spots
     FROM routes r LEFT JOIN users u ON r.driver_id = u.id LEFT JOIN trucks t ON r.truck_id = t.id
     WHERE r.archived = 0 AND r.date BETWEEN ? AND ? AND r.status NOT IN ('completed','cancelled')
     ORDER BY r.date`
  ).bind(startDate, endDate).all()

  // Calculate per-day stats
  const dayStats: Record<string, any> = {}
  for (const o of orders.results as any[]) {
    if (!o.scheduled_date) continue
    if (!dayStats[o.scheduled_date]) {
      dayStats[o.scheduled_date] = { date: o.scheduled_date, order_count: 0, orders: [] }
    }
    dayStats[o.scheduled_date].order_count++
    if (o.lat && o.lng) {
      dayStats[o.scheduled_date].orders.push({ lat: o.lat, lng: o.lng })
    }
  }

  // Calculate centroid for each day (for cluster visualization)
  for (const ds of Object.values(dayStats) as any[]) {
    if (ds.orders.length > 0) {
      ds.centroid = {
        lat: ds.orders.reduce((s: number, o: any) => s + o.lat, 0) / ds.orders.length,
        lng: ds.orders.reduce((s: number, o: any) => s + o.lng, 0) / ds.orders.length,
      }
      ds.avg_distance_from_depot = ds.orders.reduce(
        (s: number, o: any) => s + distanceMiles(DEPOT.lat, DEPOT.lng, o.lat, o.lng), 0
      ) / ds.orders.length
    }
  }

  return c.json({ depot: DEPOT, orders: orders.results, routes: routes.results, dayStats })
})

// Smart scheduling recommendation (enhanced with zone-day logic)
app.get('/api/schedule/recommend', async (c) => {
 try {
  const orderId = c.req.query('order_id')
  const customerId = c.req.query('customer_id')
  const addressId = c.req.query('address_id')

  // Get target address coordinates and zone
  let targetLat: number | null = null
  let targetLng: number | null = null
  let targetZoneId: number | null = null
  let targetCity = ''
  let targetZip = ''

  if (orderId) {
    const order = await c.env.DB.prepare(
      `SELECT a.lat, a.lng, a.zone_id, a.city, a.zip FROM orders o LEFT JOIN addresses a ON o.address_id = a.id WHERE o.id = ?`
    ).bind(orderId).first() as any
    if (order) { targetLat = order.lat; targetLng = order.lng; targetZoneId = order.zone_id; targetCity = order.city || ''; targetZip = order.zip || '' }
  } else if (addressId) {
    const addr = await c.env.DB.prepare('SELECT lat, lng, zone_id, city, zip FROM addresses WHERE id = ?').bind(addressId).first() as any
    if (addr) { targetLat = addr.lat; targetLng = addr.lng; targetZoneId = addr.zone_id; targetCity = addr.city || ''; targetZip = addr.zip || '' }
  } else if (customerId) {
    const addr = await c.env.DB.prepare(
      'SELECT lat, lng, zone_id, city, zip FROM addresses WHERE customer_id = ? AND is_primary = 1 LIMIT 1'
    ).bind(customerId).first() as any
    if (addr) { targetLat = addr.lat; targetLng = addr.lng; targetZoneId = addr.zone_id; targetCity = addr.city || ''; targetZip = addr.zip || '' }
  }

  const hasCoords = targetLat !== null && targetLng !== null

  // Auto-detect zone if not assigned
  let detectedZone: any = null
  if (!targetZoneId) {
    const zones = await c.env.DB.prepare('SELECT * FROM delivery_zones WHERE active = 1').all()
    let bestScore = 0
    for (const z of zones.results as any[]) {
      let score = 0
      if (z.boundary_json && hasCoords) {
        try { if (pointInPolygon(targetLat!, targetLng!, JSON.parse(z.boundary_json))) score += 100 } catch (e) {}
      }
      if (z.center_lat && z.center_lng && hasCoords) {
        const dist = distanceMiles(targetLat!, targetLng!, z.center_lat, z.center_lng)
        if (dist <= (z.radius_miles || 5)) score += Math.round(80 - dist * 10)
      }
      if (z.city_pattern && targetCity) {
        if (new RegExp(z.city_pattern.replace(/%/g, '.*'), 'i').test(targetCity)) score += 50
      }
      if (z.zip_codes && targetZip) {
        if (z.zip_codes.split(',').map((s: string) => s.trim()).includes(targetZip)) score += 60
      }
      if (score > bestScore) { bestScore = score; detectedZone = z; targetZoneId = z.id }
    }
  } else {
    detectedZone = await c.env.DB.prepare('SELECT * FROM delivery_zones WHERE id = ?').bind(targetZoneId).first()
  }

  // Parse zone delivery days
  const zoneDeliveryDays: string[] = detectedZone?.delivery_days
    ? detectedZone.delivery_days.split(',').map((s: string) => s.trim().toLowerCase())
    : []

  // Get upcoming schedule (next 7 operating days: Mon-Sat)
  const today = new Date()
  const days: string[] = []
  let d = new Date(today)
  const dayNames = ['sun','mon','tue','wed','thu','fri','sat']
  for (let i = 0; i < 14 && days.length < 7; i++) {
    d.setDate(d.getDate() + (i === 0 ? 0 : 1))
    const dow = d.getDay()
    if (dow === 0) continue
    const dateStr = d.toISOString().split('T')[0]
    if (dateStr >= today.toISOString().split('T')[0]) days.push(dateStr)
  }

  // For each day, get scheduled orders with coordinates
  const recommendations: any[] = []
  for (const date of days) {
    const dow = new Date(date + 'T12:00:00').getDay()
    const dowName = dayNames[dow]

    const dayOrders = await c.env.DB.prepare(
      `SELECT o.id, o.priority, a.lat, a.lng, c.business_name
       FROM orders o JOIN customers c ON o.customer_id = c.id LEFT JOIN addresses a ON o.address_id = a.id
       WHERE o.archived = 0 AND o.scheduled_date = ? AND o.status NOT IN ('completed','cancelled','delivered')`
    ).bind(date).all()

    const dayRoutes = await c.env.DB.prepare(
      `SELECT t.max_pallet_spots, t.truck_type,
       (SELECT COUNT(*) FROM route_stops WHERE route_id = r.id) as stop_count
       FROM routes r LEFT JOIN trucks t ON r.truck_id = t.id
       WHERE r.archived = 0 AND r.date = ? AND r.status NOT IN ('completed','cancelled')`
    ).bind(date).all()

    const orders = dayOrders.results as any[]
    const ordersWithCoords = orders.filter(o => o.lat && o.lng)

    // 1. Geographic clustering score
    let clusterScore = 0
    let nearestOrder = null
    let avgDistToOrders = 999
    if (hasCoords && ordersWithCoords.length > 0) {
      const distances = ordersWithCoords.map(o => ({
        dist: distanceMiles(targetLat!, targetLng!, o.lat, o.lng),
        name: o.business_name
      }))
      distances.sort((a, b) => a.dist - b.dist)
      nearestOrder = distances[0]
      avgDistToOrders = distances.reduce((s, d) => s + d.dist, 0) / distances.length
      clusterScore = Math.max(0, 100 - avgDistToOrders * 10)
    }

    // 2. Zone-day match score - big boost if this day matches the zone's delivery day
    let zoneScore = 0
    const isZoneDay = zoneDeliveryDays.includes(dowName)
    if (isZoneDay) {
      zoneScore = 100
    } else if (zoneDeliveryDays.length === 0) {
      zoneScore = 50 // No zone info, neutral
    } else {
      zoneScore = 10 // Not the zone's delivery day - penalty
    }

    // 3. Depot distance score
    let depotScore = 50 // neutral default when no coords
    if (hasCoords) {
      const distFromDepot = distanceMiles(DEPOT.lat, DEPOT.lng, targetLat!, targetLng!)
      depotScore = Math.max(0, 100 - distFromDepot * 5)
    }

    // 4. Capacity score - use pallet-based capacity
    const routes = dayRoutes.results as any[]
    const dayOrderCount = orders.length
    // Estimate capacity based on pallet spots rather than weight
    let totalPalletSpots = routes.length > 0 ? routes.reduce((s, r) => s + ((r as any).max_pallet_spots || 12), 0) : 12
    let usedPalletSpots = dayOrderCount // rough estimate: 1 order ≈ 1-2 pallets
    const capacityPct = totalPalletSpots > 0 ? (usedPalletSpots + 1) / totalPalletSpots * 100 : 50
    const capacityScore = capacityPct > 95 ? 10 : capacityPct > 80 ? 50 : capacityPct > 60 ? 80 : 100

    // 5. Load balance
    const loadScore = Math.max(0, 100 - orders.length * 12)

    // Weighted total score - when no coords, redistribute cluster+depot weight to other factors
    let totalScore: number
    if (hasCoords) {
      totalScore = Math.round(
        clusterScore * 0.35 +
        zoneScore * 0.25 +
        capacityScore * 0.20 +
        depotScore * 0.10 +
        loadScore * 0.10
      )
    } else {
      // No coordinates: skip geographic scores, rely on zone, capacity, balance
      totalScore = Math.round(
        zoneScore * 0.45 +
        capacityScore * 0.35 +
        loadScore * 0.20
      )
    }

    // Generate reason text
    const reasons: string[] = []
    if (isZoneDay && detectedZone) {
      reasons.push(`${detectedZone.name} zone delivery day`)
    } else if (zoneDeliveryDays.length > 0 && !isZoneDay) {
      reasons.push('Not zone delivery day')
    }
    if (!hasCoords) {
      reasons.push('No coordinates — based on capacity & zone')
    }
    if (hasCoords && ordersWithCoords.length > 0 && nearestOrder && nearestOrder.dist < 5) {
      reasons.push(`${nearestOrder.name} is ${nearestOrder.dist.toFixed(1)} mi away`)
    }
    if (hasCoords && ordersWithCoords.length > 0 && avgDistToOrders < 8) {
      reasons.push(`${ordersWithCoords.length} nearby (avg ${avgDistToOrders.toFixed(1)} mi)`)
    }
    if (capacityPct > 80) reasons.push(`Truck ${Math.round(capacityPct)}% full`)
    if (orders.length === 0) reasons.push('No other orders yet')
    if (orders.length >= 6) reasons.push('Heavy day')
    const dayNameFmt = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

    recommendations.push({
      date,
      day_name: dayNameFmt,
      score: totalScore,
      order_count: orders.length,
      capacity_pct: Math.round(capacityPct),
      nearest_order: nearestOrder ? { name: nearestOrder.name, distance_mi: Math.round(nearestOrder.dist * 10) / 10 } : null,
      avg_distance: Math.round(avgDistToOrders * 10) / 10,
      cluster_score: Math.round(clusterScore),
      zone_score: Math.round(zoneScore),
      capacity_score: Math.round(capacityScore),
      is_zone_day: isZoneDay,
      reasons,
    })
  }

  // Sort by score descending
  recommendations.sort((a, b) => b.score - a.score)

  return c.json({
    target: hasCoords ? { lat: targetLat, lng: targetLng } : null,
    depot: DEPOT,
    zone: detectedZone ? { id: detectedZone.id, name: detectedZone.name, color: detectedZone.color, delivery_days: detectedZone.delivery_days } : null,
    recommendations,
    best_day: recommendations[0] || null,
    ...(hasCoords ? {} : { warning: 'Address has no coordinates. Recommendations are based on zone schedule, truck capacity, and load balance only. Add coordinates for better results.' }),
  })
 } catch (e: any) {
  console.error('Schedule recommend error:', e)
  return c.json({ error: 'Recommendation failed', detail: e?.message || String(e) }, 500)
 }
})

// ==================== DRIVERS API ====================
app.get('/api/drivers', async (c) => {
  const result = await c.env.DB.prepare("SELECT id, name, phone, email FROM users WHERE role = 'driver' AND active = 1").all()
  return c.json({ drivers: result.results })
})

app.get('/api/driver/route', async (c) => {
  const driverId = c.req.query('driver_id')
  const date = c.req.query('date') || new Date().toISOString().split('T')[0]
  const route = await c.env.DB.prepare(
    `SELECT r.*, t.name as truck_name, t.plate_number FROM routes r LEFT JOIN trucks t ON r.truck_id = t.id
    WHERE r.driver_id = ? AND r.date = ? AND r.status NOT IN ('completed','cancelled') LIMIT 1`
  ).bind(driverId, date).first()
  if (!route) return c.json({ route: null, stops: [] })
  const stops = await c.env.DB.prepare(
    `SELECT rs.*, o.order_number, o.special_instructions, o.priority,
    c.business_name, c.contact_name, c.phone as customer_phone,
    a.street, a.city, a.zip, a.gate_code, a.driver_notes, a.lat, a.lng
    FROM route_stops rs JOIN orders o ON rs.order_id = o.id
    JOIN customers c ON o.customer_id = c.id LEFT JOIN addresses a ON o.address_id = a.id
    WHERE rs.route_id = ? ORDER BY rs.sequence`
  ).bind((route as any).id).all()
  // Fetch order items (packing list) for each stop
  const stopsWithItems: any[] = []
  for (const stop of stops.results as any[]) {
    const items = await c.env.DB.prepare(
      `SELECT oi.quantity, p.name as product_name, p.sku, p.unit_type, p.pallet_qty
      FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`
    ).bind(stop.order_id).all()
    stopsWithItems.push({ ...stop, items: items.results })
  }
  return c.json({ route, stops: stopsWithItems })
})

// ==================== DELIVERY PROOF API ====================
app.post('/api/delivery-proof', async (c) => {
  const body = await c.req.json()
  if (!body.photo && !body.photo_url) {
    return c.json({ error: 'Photo proof is required' }, 400)
  }
  const photoData = body.photo || body.photo_url || null
  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO delivery_proofs (order_id, photo_url, signature_url, gps_lat, gps_lng, notes, created_at)
     VALUES (?,?,?,?,?,?, datetime('now'))`
  ).bind(body.order_id, photoData, body.signature_url || null, body.gps_lat || null, body.gps_lng || null, body.notes || null).run()
  await c.env.DB.prepare("UPDATE orders SET status = 'delivered', updated_at = datetime('now') WHERE id = ?").bind(body.order_id).run()
  return c.json({ success: true }, 201)
})

app.get('/api/delivery-proof/:orderId', async (c) => {
  const orderId = c.req.param('orderId')
  const proof = await c.env.DB.prepare('SELECT * FROM delivery_proofs WHERE order_id = ?').bind(orderId).first()
  if (!proof) return c.json({ error: 'No proof found' }, 404)
  return c.json({ proof })
})

// ==================== OCR TICKET SCAN API ====================
app.post('/api/ocr/scan-ticket', async (c) => {
  const body = await c.req.json()
  const { image } = body // base64 data URL string
  if (!image) return c.json({ error: 'No image provided' }, 400)

  // Priority: 1) user-supplied key from request, 2) server env key
  const apiKey = body.api_key || c.env.OPENAI_API_KEY
  const baseUrl = body.base_url || c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const model = body.model || c.env.OPENAI_MODEL || 'gpt-5-mini'
  if (!apiKey) return c.json({ error: 'OCR service not configured. The server has no API key and none was provided.' }, 500)

  // Fetch all customers and products for matching context
  const customers = await c.env.DB.prepare('SELECT id, business_name, contact_name FROM customers WHERE active = 1').all()
  const products = await c.env.DB.prepare('SELECT id, name, sku, weight_per_unit, unit_type, price, category FROM products WHERE active = 1').all()

  const customerList = (customers.results as any[]).map(cu => `ID:${cu.id} "${cu.business_name}" (${cu.contact_name || 'no contact'})`).join('\n')
  const productList = (products.results as any[]).map(p => `ID:${p.id} "${p.name}" SKU:${p.sku} ${p.unit_type} $${p.price} [${p.category}]`).join('\n')

  const systemPrompt = `You are an expert OCR assistant for British Feed and Supplies, an animal feed delivery company in South Florida.
You extract order information from photos of printed or handwritten delivery tickets, picking slips, and order forms.

TYPICAL TICKET FORMAT (fields may vary):
- PICKING SLIP or ORDER with a date
- ORDER#, CLERK, DELIVERY DATE
- CUST#, (QB) CUSTOMER NAME, delivery address lines
- TUESDAY/BIG TRUC or similar = delivery day/truck info
- City, State, Zip on its own line
- CONTACT:, PHONE:, CELL:, EMAIL: fields
- DELIVERY INSTRUCTIONS section
- Special notes like "*** MUST COLLECT PAYMENT ***"
- Product lines: PRODUCT NAME, PRICE EA, PLU code, PICK QTY

KNOWN CUSTOMERS (match if possible, otherwise return null for customer_id):
${customerList || '(none yet)'}

KNOWN PRODUCTS (match if possible, otherwise return null for product_id):
${productList || '(none yet)'}

Extract ALL information and return ONLY valid JSON (no markdown, no code fences):
{
  "confidence": 0.0-1.0,
  "order_number": "ORDER# or order number from ticket exactly as printed (e.g. 526826-1), or null if not found",
  "customer_name": "the (QB) name or main customer name EXACTLY as on ticket",
  "customer_id": null or matching customer ID number,
  "customer_confidence": 0.0-1.0,
  "contact_name": "from CONTACT: field, or null",
  "phone": "phone number digits only (strip leading 1 for US), or null",
  "email": "email address, or null",
  "delivery_address": {
    "street": "street address from ticket",
    "city": "city name",
    "state": "state abbreviation",
    "zip": "zip code"
  },
  "items": [
    {
      "product_name": "EXACT product name as printed on ticket",
      "product_id": null or matching product ID number,
      "sku": "PLU code from ticket, or null",
      "price": unit price number or null,
      "quantity": number from PICK QTY,
      "product_confidence": 0.0-1.0
    }
  ],
  "delivery_date": "YYYY-MM-DD (convert 02/24/26 to 2026-02-24)",
  "priority": "normal" or "urgent" or "high" or "low",
  "special_instructions": "combine delivery instructions + notes like MUST COLLECT PAYMENT + delivery day/truck info",
  "raw_text": "full raw text you can read from the ticket"
}

CRITICAL RULES:
- ORDER# or Order Number is usually near the top of the ticket — extract it exactly as printed (e.g. "526826-1")
- The (QB) line has the CUSTOMER NAME — use this as customer_name (e.g. "BROOKE BALDWIN")
- CONTACT: field is often a farm/business name — save as contact_name (e.g. "RIVERSIDE FARM")
- DELIVERY DATE is the actual delivery date, NOT the printed/picking date
- Convert 2-digit years: 02/24/26 means 2026-02-24
- Phone: strip any leading country code "1" — "19145842943" becomes "9145842943"
- PICK QTY is the quantity to deliver
- PLU codes should be stored as SKU
- PRICE EA is the unit price
- If "MUST COLLECT PAYMENT" or "COD" appears, include in special_instructions
- If TUESDAY/BIG TRUCK or similar, include delivery day and truck preference in special_instructions
- ALWAYS include exact product names and customer name as printed, even if matched to known entries
- Set confidence 1.0 for clearly printed text, lower for handwritten or unclear
- Return ONLY the JSON object, no other text`

  // Helper: call AI and parse JSON response with retry logic
  async function callAIWithRetry(systemMsg: string, userContent: any, retries = 2): Promise<any> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemMsg },
            { role: 'user', content: userContent }
          ],
          // GPT-5 reasoning models need high max_tokens because reasoning tokens
          // count against the limit. 16384 gives plenty of room for reasoning + output.
          max_tokens: 16384,
          temperature: 0.1
        })
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error(`AI API error (attempt ${attempt}):`, response.status, errText)
        // Parse the error for better messages
        let details = errText
        try {
          const errObj = JSON.parse(errText)
          if (errObj.detail) details = errObj.detail
        } catch (_) {}
        if (response.status === 402) {
          return { error: true, status: 402, details: 'Insufficient API credits. Please add credits to your GenSpark account or configure your own OpenAI API key in AI Settings.', creditError: true }
        }
        if (attempt === retries) {
          return { error: true, status: response.status, details }
        }
        continue
      }

      const result = await response.json() as any
      const content = result.choices?.[0]?.message?.content || ''
      const finishReason = result.choices?.[0]?.finish_reason || 'unknown'
      const usage = result.usage || {}

      console.log(`AI attempt ${attempt}: finish=${finishReason}, reasoning_tokens=${usage.completion_tokens_details?.reasoning_tokens || 0}, total_completion=${usage.completion_tokens || 0}, content_length=${content.length}`)

      // If content is empty, the model ran out of tokens for output (all spent on reasoning)
      if (!content || content.trim().length === 0) {
        console.error(`AI returned empty content (attempt ${attempt}). finish_reason=${finishReason}, usage=${JSON.stringify(usage)}`)
        if (attempt === retries) {
          return { error: true, emptyContent: true, finishReason, usage }
        }
        continue
      }

      // Clean and parse JSON - handle various formats the model might return
      let cleaned = content.trim()
      // Strip markdown code fences
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
      // Strip leading/trailing text before/after JSON object
      const jsonStart = cleaned.indexOf('{')
      const jsonEnd = cleaned.lastIndexOf('}')
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleaned = cleaned.substring(jsonStart, jsonEnd + 1)
      }

      try {
        return JSON.parse(cleaned)
      } catch (parseErr) {
        console.error(`JSON parse failed (attempt ${attempt}):`, (parseErr as Error).message, 'Content:', content.substring(0, 500))
        if (attempt === retries) {
          return { error: true, parseError: true, raw: content }
        }
      }
    }
    return { error: true, message: 'All retry attempts exhausted' }
  }

  try {
    const userContent = [
      { type: 'text', text: 'Please scan this delivery ticket and extract the order information. Match customers and products to our database.' },
      { type: 'image_url', image_url: { url: image } }
    ]

    const parsed = await callAIWithRetry(systemPrompt, userContent)

    // Check for errors from the helper
    if (parsed.error) {
      if (parsed.creditError) {
        return c.json({ error: 'Insufficient API credits. Please add credits to your GenSpark account, or enter your own OpenAI-compatible API key in the AI Settings panel.', details: parsed.details, creditError: true }, 402)
      }
      if (parsed.status) {
        return c.json({ error: `AI service error (${parsed.status}): ${parsed.details || 'Check API key and model configuration.'}` }, 500)
      }
      if (parsed.emptyContent) {
        return c.json({ error: 'AI model returned empty response (reasoning token limit). Try a simpler image or different model.', finishReason: parsed.finishReason }, 500)
      }
      if (parsed.parseError) {
        return c.json({ error: 'Failed to parse AI response', raw: parsed.raw }, 500)
      }
      return c.json({ error: 'OCR scan failed after retries' }, 500)
    }

    // Enrich with address info if customer was matched
    if (parsed.customer_id) {
      const addresses = await c.env.DB.prepare(
        'SELECT id, label, street, city, state, zip FROM addresses WHERE customer_id = ? ORDER BY is_primary DESC'
      ).bind(parsed.customer_id).all()
      parsed.addresses = addresses.results
    }

    // Enrich product items with full product info
    if (parsed.items) {
      for (const item of parsed.items) {
        if (item.product_id) {
          const prod = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(item.product_id).first()
          if (prod) item.product_details = prod
        }
      }
    }

    return c.json({ success: true, data: parsed })
  } catch (err: any) {
    console.error('OCR scan error:', err)
    return c.json({ error: 'OCR scan failed', message: err.message }, 500)
  }
})

// Check if server has OCR API key configured
app.get('/api/ocr/status', async (c) => {
  const hasKey = !!c.env.OPENAI_API_KEY
  return c.json({ configured: hasKey })
})

// ==================== TRANSLATION API ====================
app.post('/api/translate', async (c) => {
  const body = await c.req.json()
  const { text, target_lang } = body
  if (!text || !target_lang || target_lang === 'en') return c.json({ translated: text })

  const apiKey = body.api_key || c.env.OPENAI_API_KEY
  const baseUrl = body.base_url || c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const model = body.model || c.env.OPENAI_MODEL || 'gpt-5-mini'
  if (!apiKey) return c.json({ translated: text }) // No API key, return original

  const langName = target_lang === 'es' ? 'Spanish' : target_lang === 'ht' ? 'Haitian Creole' : 'English'

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        messages: [
          { role: 'system', content: `You are a translator for a feed delivery company in South Florida. Translate the following English text to ${langName}. Keep proper nouns (names, addresses, brand names) unchanged. Return ONLY the translation, nothing else.` },
          { role: 'user', content: text }
        ]
      })
    })
    const data = await resp.json() as any
    const translated = data.choices?.[0]?.message?.content?.trim()
    return c.json({ translated: translated || text })
  } catch (e) {
    return c.json({ translated: text })
  }
})

// ==================== USERS / DRIVERS API ====================
app.get('/api/users', async (c) => {
  const incArchived = c.req.query('include_archived') === '1'
  const result = await c.env.DB.prepare(`SELECT id, email, name, role, phone, preferred_language, active, created_at FROM users ${incArchived ? '' : 'WHERE active = 1'} ORDER BY role, name`).all()
  return c.json({ users: result.results })
})

app.get('/api/users/drivers', async (c) => {
  const result = await c.env.DB.prepare("SELECT id, email, name, phone, preferred_language, active, created_at FROM users WHERE role = 'driver' AND active = 1 ORDER BY name").all()
  return c.json({ drivers: result.results })
})

app.post('/api/users', async (c) => {
  const body = await c.req.json()
  const res = await c.env.DB.prepare(
    'INSERT INTO users (email, name, role, phone, preferred_language, password_hash, active, verizon_driver_id, verizon_driver_number) VALUES (?,?,?,?,?,?,?,?,?)'
  ).bind(body.email, body.name, body.role || 'driver', body.phone || null, body.preferred_language || 'en', body.password || 'driver123', 1, body.verizon_driver_id || null, body.verizon_driver_number || null).run()
  return c.json({ id: res.meta.last_row_id }, 201)
})

app.put('/api/users/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const fields: string[] = []
  const vals: any[] = []
  for (const key of ['name','email','phone','role','preferred_language','active','verizon_driver_id','verizon_driver_number','verizon_synced_at']) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); vals.push(body[key]) }
  }
  if (body.password) { fields.push('password_hash = ?'); vals.push(body.password) }
  if (fields.length > 0) { vals.push(id); await c.env.DB.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run() }
  return c.json({ success: true })
})

// ==================== FLEET MAINTENANCE API ====================
app.get('/api/fleet/maintenance', async (c) => {
  const truckId = c.req.query('truck_id')
  const status = c.req.query('status')
  let query = `SELECT fm.*, t.name as truck_name, t.plate_number, u.name as created_by_name
    FROM fleet_maintenance fm LEFT JOIN trucks t ON fm.truck_id = t.id LEFT JOIN users u ON fm.created_by = u.id WHERE 1=1`
  const params: any[] = []
  if (truckId) { query += ' AND fm.truck_id = ?'; params.push(truckId) }
  if (status) { query += ' AND fm.status = ?'; params.push(status) }
  query += ' ORDER BY CASE fm.status WHEN \'overdue\' THEN 0 WHEN \'scheduled\' THEN 1 WHEN \'in_progress\' THEN 2 ELSE 3 END, fm.scheduled_date'
  const result = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ maintenance: result.results })
})

app.post('/api/fleet/maintenance', async (c) => {
  const body = await c.req.json()
  const res = await c.env.DB.prepare(
    `INSERT INTO fleet_maintenance (truck_id, service_type, description, status, scheduled_date, completed_date, mileage_at_service, cost, vendor, notes, next_service_date, next_service_mileage, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(body.truck_id, body.service_type || 'routine', body.description, body.status || 'scheduled', body.scheduled_date || null, body.completed_date || null, body.mileage_at_service || null, body.cost || 0, body.vendor || null, body.notes || null, body.next_service_date || null, body.next_service_mileage || null, body.created_by || null).run()
  return c.json({ id: res.meta.last_row_id }, 201)
})

app.put('/api/fleet/maintenance/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const fields: string[] = ['updated_at = datetime(\'now\')']
  const vals: any[] = []
  for (const key of ['truck_id','service_type','description','status','scheduled_date','completed_date','mileage_at_service','cost','vendor','notes','next_service_date','next_service_mileage']) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); vals.push(body[key]) }
  }
  vals.push(id)
  await c.env.DB.prepare(`UPDATE fleet_maintenance SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run()
  return c.json({ success: true })
})

app.delete('/api/fleet/maintenance/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM fleet_maintenance WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ success: true })
})

// Fleet maintenance reminders - items due within 14 days or overdue
app.get('/api/fleet/reminders', async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT fm.*, t.name as truck_name, t.plate_number
     FROM fleet_maintenance fm JOIN trucks t ON fm.truck_id = t.id
     WHERE fm.status IN ('scheduled','overdue')
       AND (fm.scheduled_date <= date('now', '+14 days') OR fm.status = 'overdue')
     ORDER BY fm.scheduled_date`
  ).all()
  // Auto-mark overdue items
  await c.env.DB.prepare(
    `UPDATE fleet_maintenance SET status = 'overdue' WHERE status = 'scheduled' AND scheduled_date < date('now')`
  ).run()
  return c.json({ reminders: result.results })
})

// ==================== DRIVER ISSUES API ====================
app.get('/api/fleet/issues', async (c) => {
  const truckId = c.req.query('truck_id')
  const status = c.req.query('status')
  let query = `SELECT di.*, t.name as truck_name, t.plate_number, u.name as reporter_name, ru.name as resolver_name
    FROM driver_issues di LEFT JOIN trucks t ON di.truck_id = t.id LEFT JOIN users u ON di.reported_by = u.id LEFT JOIN users ru ON di.resolved_by = ru.id WHERE 1=1`
  const params: any[] = []
  if (truckId) { query += ' AND di.truck_id = ?'; params.push(truckId) }
  if (status) { query += ' AND di.status = ?'; params.push(status) }
  query += ' ORDER BY CASE di.severity WHEN \'critical\' THEN 0 WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 ELSE 3 END, di.created_at DESC'
  const result = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ issues: result.results })
})

app.post('/api/fleet/issues', async (c) => {
  const body = await c.req.json()
  const res = await c.env.DB.prepare(
    'INSERT INTO driver_issues (truck_id, reported_by, severity, category, description, photo_data, status) VALUES (?,?,?,?,?,?,?)'
  ).bind(body.truck_id, body.reported_by, body.severity || 'low', body.category || 'other', body.description, body.photo_data || null, 'open').run()
  return c.json({ id: res.meta.last_row_id }, 201)
})

app.put('/api/fleet/issues/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const fields: string[] = []
  const vals: any[] = []
  for (const key of ['status','resolution_notes','resolved_by','severity','category','description']) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); vals.push(body[key]) }
  }
  if (body.status === 'resolved') { fields.push("resolved_at = datetime('now')") }
  vals.push(id)
  await c.env.DB.prepare(`UPDATE driver_issues SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run()
  return c.json({ success: true })
})

// ==================== MAINTENANCE RECORDS API ====================
app.get('/api/fleet/records', async (c) => {
  const truckId = c.req.query('truck_id')
  const maintenanceId = c.req.query('maintenance_id')
  let query = 'SELECT mr.*, u.name as uploader_name FROM maintenance_records mr LEFT JOIN users u ON mr.uploaded_by = u.id WHERE 1=1'
  const params: any[] = []
  if (truckId) { query += ' AND mr.truck_id = ?'; params.push(truckId) }
  if (maintenanceId) { query += ' AND mr.maintenance_id = ?'; params.push(maintenanceId) }
  query += ' ORDER BY mr.created_at DESC'
  const result = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ records: result.results })
})

app.post('/api/fleet/records', async (c) => {
  const body = await c.req.json()
  const res = await c.env.DB.prepare(
    'INSERT INTO maintenance_records (maintenance_id, truck_id, record_type, file_name, file_data, notes, uploaded_by) VALUES (?,?,?,?,?,?,?)'
  ).bind(body.maintenance_id || null, body.truck_id, body.record_type || 'document', body.file_name || null, body.file_data || null, body.notes || null, body.uploaded_by || null).run()
  return c.json({ id: res.meta.last_row_id }, 201)
})

// ==================== DRIVER-TRUCK ASSIGNMENTS API ====================
app.get('/api/driver-truck-assignments', async (c) => {
  const driverId = c.req.query('driver_id')
  const truckId = c.req.query('truck_id')
  let query = `SELECT dta.*, u.name as driver_name, t.name as truck_name, t.plate_number
    FROM driver_truck_assignments dta
    JOIN users u ON dta.driver_id = u.id
    JOIN trucks t ON dta.truck_id = t.id WHERE 1=1`
  const params: any[] = []
  if (driverId) { query += ' AND dta.driver_id = ?'; params.push(driverId) }
  if (truckId) { query += ' AND dta.truck_id = ?'; params.push(truckId) }
  query += ' ORDER BY dta.is_primary DESC, u.name, t.name'
  const result = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ assignments: result.results })
})

app.post('/api/driver-truck-assignments', async (c) => {
  const body = await c.req.json()
  try {
    const res = await c.env.DB.prepare(
      'INSERT INTO driver_truck_assignments (driver_id, truck_id, is_primary, notes) VALUES (?,?,?,?)'
    ).bind(body.driver_id, body.truck_id, body.is_primary || 0, body.notes || null).run()
    return c.json({ id: res.meta.last_row_id }, 201)
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: 'This driver is already assigned to this truck' }, 409)
    throw e
  }
})

app.delete('/api/driver-truck-assignments/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM driver_truck_assignments WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ success: true })
})

app.put('/api/driver-truck-assignments/:id/primary', async (c) => {
  const id = c.req.param('id')
  const assignment = await c.env.DB.prepare('SELECT * FROM driver_truck_assignments WHERE id = ?').bind(id).first() as any
  if (!assignment) return c.json({ error: 'Not found' }, 404)
  // Unset all primary for this driver, then set this one
  await c.env.DB.prepare('UPDATE driver_truck_assignments SET is_primary = 0 WHERE driver_id = ?').bind(assignment.driver_id).run()
  await c.env.DB.prepare('UPDATE driver_truck_assignments SET is_primary = 1 WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// Get trucks a specific driver can drive
app.get('/api/drivers/:id/trucks', async (c) => {
  const id = c.req.param('id')
  const result = await c.env.DB.prepare(
    `SELECT t.*, dta.is_primary, dta.id as assignment_id
     FROM driver_truck_assignments dta
     JOIN trucks t ON dta.truck_id = t.id
     WHERE dta.driver_id = ? ORDER BY dta.is_primary DESC, t.name`
  ).bind(id).all()
  return c.json({ trucks: result.results })
})

// Get drivers who can drive a specific truck
app.get('/api/trucks/:id/drivers', async (c) => {
  const id = c.req.param('id')
  const result = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.phone, u.email, u.preferred_language, dta.is_primary, dta.id as assignment_id
     FROM driver_truck_assignments dta
     JOIN users u ON dta.driver_id = u.id
     WHERE dta.truck_id = ? AND u.active = 1 ORDER BY dta.is_primary DESC, u.name`
  ).bind(id).all()
  return c.json({ drivers: result.results })
})

// ==================== RECURRING SCHEDULES API ====================
app.get('/api/recurring-schedules', async (c) => {
  const status = c.req.query('status')
  const customer_id = c.req.query('customer_id')
  let query = `SELECT rs.*, c.business_name, a.street, a.city, a.state, a.zip,
    (SELECT COUNT(*) FROM recurring_schedule_items WHERE schedule_id = rs.id) as item_count,
    (SELECT COUNT(*) FROM recurring_order_log WHERE schedule_id = rs.id AND status = 'generated') as orders_generated
    FROM recurring_schedules rs
    JOIN customers c ON rs.customer_id = c.id
    LEFT JOIN addresses a ON rs.address_id = a.id WHERE 1=1`
  const params: any[] = []
  if (c.req.query('include_archived') !== '1') { query += ' AND rs.archived = 0' }
  if (status) { query += ' AND rs.status = ?'; params.push(status) }
  if (customer_id) { query += ' AND rs.customer_id = ?'; params.push(customer_id) }
  query += ' ORDER BY rs.status ASC, rs.next_delivery_date ASC'
  const result = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ schedules: result.results })
})

app.get('/api/recurring-schedules/:id', async (c) => {
  const id = c.req.param('id')
  const schedule = await c.env.DB.prepare(
    `SELECT rs.*, c.business_name, c.contact_name, a.street, a.city, a.state, a.zip
     FROM recurring_schedules rs JOIN customers c ON rs.customer_id = c.id
     LEFT JOIN addresses a ON rs.address_id = a.id WHERE rs.id = ?`
  ).bind(id).first()
  if (!schedule) return c.json({ error: 'Schedule not found' }, 404)
  const items = await c.env.DB.prepare(
    `SELECT rsi.*, p.name as product_name, p.sku, p.unit_type, p.category, p.pallet_qty
     FROM recurring_schedule_items rsi JOIN products p ON rsi.product_id = p.id WHERE rsi.schedule_id = ?`
  ).bind(id).all()
  const log = await c.env.DB.prepare(
    `SELECT rol.*, o.order_number, o.status as order_status
     FROM recurring_order_log rol LEFT JOIN orders o ON rol.order_id = o.id
     WHERE rol.schedule_id = ? ORDER BY rol.scheduled_date DESC LIMIT 20`
  ).bind(id).all()
  return c.json({ schedule, items: items.results, log: log.results })
})

app.post('/api/recurring-schedules', async (c) => {
  const body = await c.req.json()
  const { customer_id, address_id, frequency, interval_days, day_of_week, day_of_month,
    priority, special_instructions, notes, auto_confirm, items, next_delivery_date, created_by } = body
  const res = await c.env.DB.prepare(
    `INSERT INTO recurring_schedules (customer_id, address_id, frequency, interval_days, day_of_week,
     day_of_month, priority, special_instructions, notes, auto_confirm, next_delivery_date, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(customer_id, address_id || null, frequency, interval_days || 7, day_of_week ?? null,
    day_of_month ?? null, priority || 'normal', special_instructions || null, notes || null,
    auto_confirm ? 1 : 0, next_delivery_date || null, created_by || null).run()
  const scheduleId = res.meta.last_row_id
  if (items && items.length > 0) {
    for (const item of items) {
      await c.env.DB.prepare('INSERT INTO recurring_schedule_items (schedule_id, product_id, quantity) VALUES (?, ?, ?)')
        .bind(scheduleId, item.product_id, item.quantity || 1).run()
    }
  }
  return c.json({ id: scheduleId }, 201)
})

app.put('/api/recurring-schedules/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const fields: string[] = []
  const vals: any[] = []
  for (const key of ['customer_id','address_id','frequency','interval_days','day_of_week','day_of_month',
    'priority','special_instructions','notes','status','auto_confirm','next_delivery_date']) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); vals.push(body[key]) }
  }
  if (fields.length === 0 && !body.items) return c.json({ error: 'No fields to update' }, 400)
  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')")
    vals.push(id)
    await c.env.DB.prepare(`UPDATE recurring_schedules SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run()
  }
  if (body.items) {
    await c.env.DB.prepare('DELETE FROM recurring_schedule_items WHERE schedule_id = ?').bind(id).run()
    for (const item of body.items) {
      await c.env.DB.prepare('INSERT INTO recurring_schedule_items (schedule_id, product_id, quantity) VALUES (?, ?, ?)')
        .bind(id, item.product_id, item.quantity || 1).run()
    }
  }
  return c.json({ success: true })
})

app.delete('/api/recurring-schedules/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM recurring_schedule_items WHERE schedule_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM recurring_order_log WHERE schedule_id = ?').bind(id).run()
  await c.env.DB.prepare('UPDATE orders SET recurring_schedule_id = NULL WHERE recurring_schedule_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM recurring_schedules WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// Generate next order from a recurring schedule
app.post('/api/recurring-schedules/:id/generate', async (c) => {
  const id = c.req.param('id')
  const schedule = await c.env.DB.prepare('SELECT * FROM recurring_schedules WHERE id = ?').bind(id).first() as any
  if (!schedule) return c.json({ error: 'Schedule not found' }, 404)
  if (schedule.status !== 'active') return c.json({ error: 'Schedule is not active' }, 400)

  const items = await c.env.DB.prepare(
    'SELECT rsi.* FROM recurring_schedule_items rsi WHERE rsi.schedule_id = ?'
  ).bind(id).all()

  const deliveryDate = schedule.next_delivery_date || new Date().toISOString().split('T')[0]
  const orderNum = 'BF-' + (Date.now() % 100000)
  const initialStatus = schedule.auto_confirm ? 'confirmed' : 'new'

  const orderRes = await c.env.DB.prepare(
    `INSERT INTO orders (order_number, customer_id, address_id, status, priority, scheduled_date,
     special_instructions, created_by, recurring_schedule_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(orderNum, schedule.customer_id, schedule.address_id, initialStatus, schedule.priority || 'normal',
    deliveryDate, schedule.special_instructions || null, schedule.created_by, id).run()
  const orderId = orderRes.meta.last_row_id

  for (const item of items.results as any[]) {
    await c.env.DB.prepare('INSERT INTO order_items (order_id, product_id, quantity) VALUES (?, ?, ?)')
      .bind(orderId, item.product_id, item.quantity).run()
  }

  // Log the generation
  await c.env.DB.prepare(
    'INSERT INTO recurring_order_log (schedule_id, order_id, scheduled_date, status) VALUES (?, ?, ?, ?)'
  ).bind(id, orderId, deliveryDate, 'generated').run()

  // Calculate next delivery date
  const nextDate = calculateNextDate(deliveryDate, schedule.frequency, schedule.interval_days, schedule.day_of_week, schedule.day_of_month)
  await c.env.DB.prepare(
    "UPDATE recurring_schedules SET next_delivery_date = ?, last_generated_date = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(nextDate, deliveryDate, id).run()

  return c.json({ order_id: orderId, order_number: orderNum, next_delivery_date: nextDate })
})

// Skip next occurrence
app.post('/api/recurring-schedules/:id/skip', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const schedule = await c.env.DB.prepare('SELECT * FROM recurring_schedules WHERE id = ?').bind(id).first() as any
  if (!schedule) return c.json({ error: 'Schedule not found' }, 404)

  const skipDate = schedule.next_delivery_date || new Date().toISOString().split('T')[0]
  await c.env.DB.prepare(
    'INSERT INTO recurring_order_log (schedule_id, scheduled_date, status, skip_reason) VALUES (?, ?, ?, ?)'
  ).bind(id, skipDate, 'skipped', body.reason || null).run()

  const nextDate = calculateNextDate(skipDate, schedule.frequency, schedule.interval_days, schedule.day_of_week, schedule.day_of_month)
  await c.env.DB.prepare(
    "UPDATE recurring_schedules SET next_delivery_date = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(nextDate, id).run()

  return c.json({ success: true, next_delivery_date: nextDate })
})

// Generate all due recurring orders (called manually or via cron)
app.post('/api/recurring-schedules/generate-due', async (c) => {
  const today = new Date().toISOString().split('T')[0]
  const dueSchedules = await c.env.DB.prepare(
    "SELECT * FROM recurring_schedules WHERE status = 'active' AND next_delivery_date <= ?"
  ).bind(today).all()

  const generated: any[] = []
  for (const schedule of dueSchedules.results as any[]) {
    try {
      const items = await c.env.DB.prepare(
        'SELECT rsi.* FROM recurring_schedule_items rsi WHERE rsi.schedule_id = ?'
      ).bind(schedule.id).all()

      const orderNum = 'BF-' + (Date.now() % 100000) + '-R'
      const initialStatus = schedule.auto_confirm ? 'confirmed' : 'new'

      const orderRes = await c.env.DB.prepare(
        `INSERT INTO orders (order_number, customer_id, address_id, status, priority, scheduled_date,
         special_instructions, created_by, recurring_schedule_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(orderNum, schedule.customer_id, schedule.address_id, initialStatus, schedule.priority || 'normal',
        schedule.next_delivery_date, schedule.special_instructions || null, schedule.created_by, schedule.id).run()
      const orderId = orderRes.meta.last_row_id

      for (const item of items.results as any[]) {
        await c.env.DB.prepare('INSERT INTO order_items (order_id, product_id, quantity) VALUES (?, ?, ?)')
          .bind(orderId, item.product_id, item.quantity).run()
      }

      await c.env.DB.prepare(
        'INSERT INTO recurring_order_log (schedule_id, order_id, scheduled_date, status) VALUES (?, ?, ?, ?)'
      ).bind(schedule.id, orderId, schedule.next_delivery_date, 'generated').run()

      const nextDate = calculateNextDate(schedule.next_delivery_date, schedule.frequency, schedule.interval_days, schedule.day_of_week, schedule.day_of_month)
      await c.env.DB.prepare(
        "UPDATE recurring_schedules SET next_delivery_date = ?, last_generated_date = ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(nextDate, schedule.next_delivery_date, schedule.id).run()

      generated.push({ schedule_id: schedule.id, order_id: orderId, order_number: orderNum })
    } catch (e: any) { console.error('Failed to generate order for schedule', schedule.id, e) }
  }

  return c.json({ generated, count: generated.length })
})

function calculateNextDate(fromDate: string, frequency: string, intervalDays: number, dayOfWeek: number | null, dayOfMonth: number | null): string {
  const d = new Date(fromDate + 'T12:00:00Z')
  switch (frequency) {
    case 'weekly':
      d.setUTCDate(d.getUTCDate() + 7)
      break
    case 'biweekly':
      d.setUTCDate(d.getUTCDate() + 14)
      break
    case 'monthly':
      d.setUTCMonth(d.getUTCMonth() + 1)
      if (dayOfMonth) { d.setUTCDate(Math.min(dayOfMonth, new Date(d.getUTCFullYear(), d.getUTCMonth() + 1, 0).getUTCDate())) }
      break
    case 'custom':
      d.setUTCDate(d.getUTCDate() + (intervalDays || 7))
      break
  }
  return d.toISOString().split('T')[0]
}

// ==================== ORDER HOLD STATUS API ====================
// Uses special_instructions field with [HOLD:...] marker since D1 CHECK constraint
// prevents adding new status values without table recreation.
app.patch('/api/orders/:id/hold', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  try {
    if (body.action === 'hold') {
      const holdMarker = '[HOLD_STATUS:' + (body.hold_reason || 'Pending confirmation') + ']'
      // Store hold state in special_instructions, keep DB status as 'confirmed'
      const order = await c.env.DB.prepare('SELECT special_instructions, status FROM orders WHERE id = ?').bind(id).first() as any
      const prevStatus = order?.status || 'new'
      const existing = (order?.special_instructions || '').replace(/\[HOLD_STATUS:.*?\]/g, '').trim()
      const newInstructions = (existing ? existing + '\n' : '') + holdMarker + '[PREV_STATUS:' + prevStatus + ']'
      await c.env.DB.prepare(
        "UPDATE orders SET special_instructions = ?, status = 'confirmed', updated_at = datetime('now') WHERE id = ?"
      ).bind(newInstructions, id).run()
    } else {
      // Release from hold - remove hold marker, restore previous status
      const order = await c.env.DB.prepare('SELECT special_instructions FROM orders WHERE id = ?').bind(id).first() as any
      const existing = order?.special_instructions || ''
      const prevMatch = existing.match(/\[PREV_STATUS:(\w+)\]/)
      const restoreStatus = prevMatch ? prevMatch[1] : (body.restore_status || 'confirmed')
      const cleaned = existing.replace(/\[HOLD_STATUS:.*?\]/g, '').replace(/\[PREV_STATUS:\w+\]/g, '').trim()
      await c.env.DB.prepare(
        "UPDATE orders SET special_instructions = ?, status = ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(cleaned || null, restoreStatus, id).run()
    }
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message || 'Failed to update hold status' }, 500)
  }
})

// ==================== UNIFIED ARCHIVE/RESTORE API ====================
app.patch('/api/archive/:entity/:id', async (c) => {
  const entity = c.req.param('entity')
  const id = c.req.param('id')
  const body = await c.req.json()
  const archive = body.archived ? 1 : 0
  try {
    // Entities with 'active' column (active=1 means NOT archived, active=0 means archived)
    const activeEntities: Record<string, string> = {
      customers: 'customers', products: 'products', users: 'users',
      zones: 'delivery_zones'
    }
    // Entities with 'archived' column (archived=0 means NOT archived, archived=1 means archived)
    const archivedEntities: Record<string, string> = {
      trucks: 'trucks', orders: 'orders', routes: 'routes', recurring_schedules: 'recurring_schedules'
    }
    if (activeEntities[entity]) {
      await c.env.DB.prepare(`UPDATE ${activeEntities[entity]} SET active = ? WHERE id = ?`).bind(archive ? 0 : 1, id).run()
    } else if (archivedEntities[entity]) {
      await c.env.DB.prepare(`UPDATE ${archivedEntities[entity]} SET archived = ? WHERE id = ?`).bind(archive, id).run()
    } else {
      return c.json({ error: 'Invalid entity type' }, 400)
    }
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message || 'Failed to archive/restore' }, 500)
  }
})

// ==================== GOOGLE MAPS API ====================
// Serve API key to frontend (never expose raw key in HTML source)
app.get('/api/maps/config', async (c) => {
  const key = c.env.GOOGLE_MAPS_API_KEY
  return c.json({ 
    apiKey: key || null,
    configured: !!key,
    depot: DEPOT
  })
})

// Proxy Google Directions API to keep API key server-side
app.post('/api/maps/directions', async (c) => {
  const apiKey = c.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return c.json({ error: 'Google Maps API key not configured' }, 500)
  
  const body = await c.req.json()
  const { origin, destination, waypoints } = body
  // origin/destination: "lat,lng" strings
  // waypoints: array of "lat,lng" strings
  
  if (!origin || !destination) return c.json({ error: 'origin and destination required' }, 400)

  let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&key=${apiKey}&units=imperial`
  
  if (waypoints && waypoints.length > 0) {
    // stop_mode: true = actual stops (separate legs with travel times), false = via: (pass-through, single leg)
    const stopMode = body.stop_mode !== false  // default to true for per-leg travel times
    const wpStr = waypoints.map((wp: string) => stopMode ? wp : `via:${wp}`).join('|')
    url += `&waypoints=${encodeURIComponent(wpStr)}`
  }

  try {
    const resp = await fetch(url)
    const data = await resp.json() as any
    
    if (data.status !== 'OK') {
      console.error('Directions API error:', data.status, data.error_message)
      return c.json({ error: `Directions API: ${data.status}`, detail: data.error_message }, 400)
    }

    // Extract useful info from the response
    const route = data.routes?.[0]
    if (!route) return c.json({ error: 'No route found' }, 404)

    const legs = route.legs || []
    let totalDistanceMeters = 0
    let totalDurationSeconds = 0
    const legDetails = legs.map((leg: any, i: number) => {
      totalDistanceMeters += leg.distance?.value || 0
      totalDurationSeconds += leg.duration?.value || 0
      return {
        index: i,
        start: leg.start_address,
        end: leg.end_address,
        distance: leg.distance,
        duration: leg.duration,
        polyline: leg.steps?.reduce((pts: string[], step: any) => {
          if (step.polyline?.points) pts.push(step.polyline.points)
          return pts
        }, []) || [],
        steps: leg.steps?.map((step: any) => ({
          instruction: step.html_instructions,
          distance: step.distance,
          duration: step.duration,
          maneuver: step.maneuver,
          polyline: step.polyline?.points
        }))
      }
    })

    return c.json({
      status: 'OK',
      overview_polyline: route.overview_polyline?.points,
      bounds: route.bounds,
      legs: legDetails,
      total_distance: {
        text: `${(totalDistanceMeters / 1609.34).toFixed(1)} mi`,
        value: totalDistanceMeters,
        miles: +(totalDistanceMeters / 1609.34).toFixed(1)
      },
      total_duration: {
        text: `${Math.floor(totalDurationSeconds / 3600)}h ${Math.round((totalDurationSeconds % 3600) / 60)}m`,
        value: totalDurationSeconds,
        minutes: Math.round(totalDurationSeconds / 60)
      },
      warnings: route.warnings || [],
      waypoint_order: route.waypoint_order || []
    })
  } catch (e: any) {
    console.error('Directions proxy error:', e)
    return c.json({ error: 'Failed to fetch directions', detail: e?.message }, 500)
  }
})

// Optimized directions: use Google's optimize waypoint order
app.post('/api/maps/directions-optimized', async (c) => {
  const apiKey = c.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return c.json({ error: 'Google Maps API key not configured' }, 500)
  
  const body = await c.req.json()
  const { origin, destination, waypoints } = body
  
  if (!origin || !destination) return c.json({ error: 'origin and destination required' }, 400)
  if (!waypoints || waypoints.length === 0) return c.json({ error: 'waypoints required for optimization' }, 400)

  // Use optimize:true to let Google find the best order
  const wpStr = 'optimize:true|' + waypoints.join('|')
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&waypoints=${encodeURIComponent(wpStr)}&key=${apiKey}&units=imperial`

  try {
    const resp = await fetch(url)
    const data = await resp.json() as any
    
    if (data.status !== 'OK') {
      return c.json({ error: `Directions API: ${data.status}`, detail: data.error_message }, 400)
    }

    const route = data.routes?.[0]
    if (!route) return c.json({ error: 'No route found' }, 404)

    const legs = route.legs || []
    let totalDistanceMeters = 0
    let totalDurationSeconds = 0
    legs.forEach((leg: any) => {
      totalDistanceMeters += leg.distance?.value || 0
      totalDurationSeconds += leg.duration?.value || 0
    })

    return c.json({
      status: 'OK',
      overview_polyline: route.overview_polyline?.points,
      bounds: route.bounds,
      legs: legs.map((leg: any, i: number) => ({
        index: i,
        start: leg.start_address,
        end: leg.end_address,
        distance: leg.distance,
        duration: leg.duration,
        polyline: leg.steps?.reduce((pts: string[], step: any) => {
          if (step.polyline?.points) pts.push(step.polyline.points)
          return pts
        }, []) || [],
        steps: leg.steps?.map((step: any) => ({
          instruction: step.html_instructions,
          distance: step.distance,
          duration: step.duration,
          maneuver: step.maneuver,
          polyline: step.polyline?.points
        }))
      })),
      total_distance: {
        text: `${(totalDistanceMeters / 1609.34).toFixed(1)} mi`,
        value: totalDistanceMeters,
        miles: +(totalDistanceMeters / 1609.34).toFixed(1)
      },
      total_duration: {
        text: `${Math.floor(totalDurationSeconds / 3600)}h ${Math.round((totalDurationSeconds % 3600) / 60)}m`,
        value: totalDurationSeconds,
        minutes: Math.round(totalDurationSeconds / 60)
      },
      waypoint_order: route.waypoint_order || [],
      warnings: route.warnings || []
    })
  } catch (e: any) {
    return c.json({ error: 'Failed to fetch optimized directions', detail: e?.message }, 500)
  }
})

// Google Places Autocomplete proxy (keeps API key server-side)
app.get('/api/maps/places/autocomplete', async (c) => {
  const apiKey = c.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return c.json({ error: 'Google Maps API key not configured' }, 500)
  
  const input = c.req.query('input')
  if (!input || input.length < 2) return c.json({ predictions: [] })
  
  // Bias to South Florida area
  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${apiKey}&components=country:us&location=26.7045593,-80.2047917&radius=80000&types=address`
  
  try {
    const resp = await fetch(url)
    const data = await resp.json() as any
    return c.json({
      predictions: (data.predictions || []).map((p: any) => ({
        place_id: p.place_id,
        description: p.description,
        structured: p.structured_formatting
      }))
    })
  } catch (e: any) {
    return c.json({ error: 'Places autocomplete failed', detail: e?.message }, 500)
  }
})

// Google Place Details proxy — get lat/lng from place_id
app.get('/api/maps/places/details', async (c) => {
  const apiKey = c.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return c.json({ error: 'Google Maps API key not configured' }, 500)
  
  const placeId = c.req.query('place_id')
  if (!placeId) return c.json({ error: 'place_id required' }, 400)
  
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&key=${apiKey}&fields=geometry,formatted_address,address_components`
  
  try {
    const resp = await fetch(url)
    const data = await resp.json() as any
    const result = data.result
    if (!result) return c.json({ error: 'Place not found' }, 404)
    
    return c.json({
      formatted_address: result.formatted_address,
      lat: result.geometry?.location?.lat,
      lng: result.geometry?.location?.lng,
      components: (result.address_components || []).map((c: any) => ({
        long_name: c.long_name,
        short_name: c.short_name,
        types: c.types
      }))
    })
  } catch (e: any) {
    return c.json({ error: 'Place details failed', detail: e?.message }, 500)
  }
})

// Geocode address server-side (keeps API key hidden)
app.post('/api/maps/geocode', async (c) => {
  const apiKey = c.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return c.json({ error: 'Google Maps API key not configured' }, 500)
  
  const { address } = await c.req.json()
  if (!address) return c.json({ error: 'address required' }, 400)
  
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}&bounds=25.7,-80.9|27.2,-79.8`
  
  try {
    const resp = await fetch(url)
    const data = await resp.json() as any
    if (data.status === 'OK' && data.results?.[0]) {
      const loc = data.results[0].geometry.location
      return c.json({
        status: 'OK',
        formatted_address: data.results[0].formatted_address,
        lat: loc.lat,
        lng: loc.lng
      })
    }
    return c.json({ status: data.status, error: 'Geocoding failed' }, 400)
  } catch (e: any) {
    return c.json({ error: 'Geocode failed', detail: e?.message }, 500)
  }
})

// ==================== ROUTE LEARNING ENGINE ====================
// Captures patterns from every route decision to power intelligent recommendations.

const DAY_NAMES = ['sun','mon','tue','wed','thu','fri','sat']

// Core learning function: called whenever a route is created or completed.
// Snapshots the route and updates all pattern tables.
async function captureRoutePatterns(db: D1Database, routeId: number, snapshotType: string = 'created') {
  try {
    const route = await db.prepare(
      `SELECT r.*, t.name as truck_name, t.truck_type, u.name as driver_name
       FROM routes r LEFT JOIN trucks t ON r.truck_id = t.id LEFT JOIN users u ON r.driver_id = u.id
       WHERE r.id = ?`
    ).bind(routeId).first() as any
    if (!route) return

    // Get all stops with customer/address/order details
    const stopsRes = await db.prepare(
      `SELECT rs.sequence, rs.order_id,
        o.customer_id, o.address_id, c.business_name,
        a.lat, a.lng, a.city, a.zip, a.zone_id
       FROM route_stops rs
       LEFT JOIN orders o ON rs.order_id = o.id
       LEFT JOIN customers c ON o.customer_id = c.id
       LEFT JOIN addresses a ON o.address_id = a.id
       WHERE rs.route_id = ? ORDER BY rs.sequence`
    ).bind(routeId).all()
    const stops = stopsRes.results as any[]

    // Calculate totals
    let totalItems = 0, totalPallets = 0
    const stopDetails: any[] = []
    const customerIds: number[] = []

    for (const s of stops) {
      if (!s.order_id) continue
      const items = await db.prepare(
        `SELECT oi.quantity, p.pallet_qty FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`
      ).bind(s.order_id).all()
      const itemCount = (items.results as any[]).reduce((sum: number, i: any) => sum + (i.quantity || 0), 0)
      const palletCount = calcPallets(items.results as any[])
      totalItems += itemCount
      totalPallets += palletCount

      if (s.customer_id && !customerIds.includes(s.customer_id)) customerIds.push(s.customer_id)
      stopDetails.push({
        customer_id: s.customer_id, address_id: s.address_id, order_id: s.order_id,
        sequence: s.sequence, lat: s.lat, lng: s.lng, city: s.city, zip: s.zip,
        zone_id: s.zone_id, pallet_count: palletCount, item_count: itemCount
      })
    }

    const dow = DAY_NAMES[new Date(route.date + 'T12:00:00').getDay()]
    // Determine primary zone
    const zoneCounts: Record<number, number> = {}
    for (const s of stopDetails) { if (s.zone_id) zoneCounts[s.zone_id] = (zoneCounts[s.zone_id] || 0) + 1 }
    let primaryZoneId: number | null = null, maxZC = 0
    for (const [zid, cnt] of Object.entries(zoneCounts)) { if (cnt > maxZC) { maxZC = cnt; primaryZoneId = parseInt(zid) } }

    // 1. Save route snapshot
    await db.prepare(
      `INSERT INTO route_snapshots (route_id, snapshot_type, date, day_of_week, truck_id, truck_name, truck_type,
        driver_id, driver_name, zone_id, zone_name, stop_count, total_pallets, total_items, total_miles, stops_json, customer_ids_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      routeId, snapshotType, route.date, dow, route.truck_id, route.truck_name, route.truck_type,
      route.driver_id, route.driver_name, primaryZoneId, null, stops.length, totalPallets, totalItems,
      route.total_miles || 0, JSON.stringify(stopDetails), JSON.stringify(customerIds)
    ).run()

    // 2. Update customer pairings (every pair of customers on this route)
    for (let i = 0; i < customerIds.length; i++) {
      for (let j = i + 1; j < customerIds.length; j++) {
        const a = Math.min(customerIds[i], customerIds[j])
        const b = Math.max(customerIds[i], customerIds[j])
        const seqA = stopDetails.find(s => s.customer_id === customerIds[i])?.sequence || 0
        const seqB = stopDetails.find(s => s.customer_id === customerIds[j])?.sequence || 0
        const gap = Math.abs(seqA - seqB)
        await db.prepare(
          `INSERT INTO customer_pairings (customer_a_id, customer_b_id, times_paired, avg_sequence_gap, same_truck_count, last_paired_date, first_paired_date)
           VALUES (?,?,1,?,1,?,?)
           ON CONFLICT(customer_a_id, customer_b_id) DO UPDATE SET
             times_paired = times_paired + 1,
             avg_sequence_gap = (avg_sequence_gap * (times_paired - 1) + ?) / times_paired,
             same_truck_count = same_truck_count + 1,
             last_paired_date = ?,
             updated_at = datetime('now')`
        ).bind(a, b, gap, route.date, route.date, gap, route.date).run()
      }
    }

    // 3. Update customer → truck history
    if (route.truck_id) {
      for (const cid of customerIds) {
        await db.prepare(
          `INSERT INTO customer_truck_history (customer_id, truck_id, truck_type, times_assigned, last_assigned_date)
           VALUES (?,?,?,1,?)
           ON CONFLICT(customer_id, truck_id) DO UPDATE SET
             times_assigned = times_assigned + 1,
             last_assigned_date = ?,
             updated_at = datetime('now')`
        ).bind(cid, route.truck_id, route.truck_type || 'pallet', route.date, route.date).run()
      }
    }

    // 4. Update customer → driver history
    if (route.driver_id) {
      for (const cid of customerIds) {
        await db.prepare(
          `INSERT INTO customer_driver_history (customer_id, driver_id, times_assigned, last_assigned_date)
           VALUES (?,?,1,?)
           ON CONFLICT(customer_id, driver_id) DO UPDATE SET
             times_assigned = times_assigned + 1,
             last_assigned_date = ?,
             updated_at = datetime('now')`
        ).bind(cid, route.driver_id, route.date, route.date).run()
      }
    }

    // 5. Update customer day-of-week patterns
    for (const cid of customerIds) {
      await db.prepare(
        `INSERT INTO customer_day_patterns (customer_id, day_of_week, delivery_count, last_delivery_date)
         VALUES (?,?,1,?)
         ON CONFLICT(customer_id, day_of_week) DO UPDATE SET
           delivery_count = delivery_count + 1,
           last_delivery_date = ?,
           updated_at = datetime('now')`
      ).bind(cid, dow, route.date, route.date).run()
    }
  } catch (e) {
    console.error('captureRoutePatterns error:', e)
  }
}

// Backfill: analyze all existing completed/planned routes to bootstrap learning data
app.post('/api/learning/backfill', async (c) => {
  const routes = await c.env.DB.prepare(
    `SELECT id FROM routes WHERE archived = 0 AND status NOT IN ('cancelled') ORDER BY date ASC`
  ).all()
  let processed = 0
  const errors: string[] = []
  for (const r of routes.results as any[]) {
    try {
      await captureRoutePatterns(c.env.DB, r.id, 'backfill')
      processed++
    } catch (e: any) {
      errors.push(`Route ${r.id}: ${e.message || e}`)
    }
  }
  return c.json({ success: true, routes_processed: processed, errors: errors.length > 0 ? errors : undefined })
})

// Get learning stats — what the system has learned so far
app.get('/api/learning/stats', async (c) => {
  const snapshots = await c.env.DB.prepare('SELECT COUNT(*) as c FROM route_snapshots').first() as any
  const pairings = await c.env.DB.prepare('SELECT COUNT(*) as c FROM customer_pairings').first() as any
  const topPairings = await c.env.DB.prepare(
    `SELECT cp.*, ca.business_name as customer_a_name, cb.business_name as customer_b_name
     FROM customer_pairings cp
     JOIN customers ca ON cp.customer_a_id = ca.id
     JOIN customers cb ON cp.customer_b_id = cb.id
     ORDER BY cp.times_paired DESC LIMIT 20`
  ).all()
  const truckHistory = await c.env.DB.prepare('SELECT COUNT(*) as c FROM customer_truck_history').first() as any
  const driverHistory = await c.env.DB.prepare('SELECT COUNT(*) as c FROM customer_driver_history').first() as any
  const dayPatterns = await c.env.DB.prepare('SELECT COUNT(*) as c FROM customer_day_patterns').first() as any
  const corrections = await c.env.DB.prepare('SELECT COUNT(*) as c FROM pallet_corrections').first() as any

  // Top customer-truck affinities
  const topTruckAffinities = await c.env.DB.prepare(
    `SELECT cth.*, c.business_name, t.name as truck_name
     FROM customer_truck_history cth
     JOIN customers c ON cth.customer_id = c.id
     JOIN trucks t ON cth.truck_id = t.id
     ORDER BY cth.times_assigned DESC LIMIT 15`
  ).all()

  // Top customer-driver affinities
  const topDriverAffinities = await c.env.DB.prepare(
    `SELECT cdh.*, c.business_name, u.name as driver_name
     FROM customer_driver_history cdh
     JOIN customers c ON cdh.customer_id = c.id
     JOIN users u ON cdh.driver_id = u.id
     ORDER BY cdh.times_assigned DESC LIMIT 15`
  ).all()

  // Day-of-week distribution
  const dayDist = await c.env.DB.prepare(
    `SELECT day_of_week, SUM(delivery_count) as total FROM customer_day_patterns GROUP BY day_of_week ORDER BY total DESC`
  ).all()

  return c.json({
    totals: {
      route_snapshots: snapshots?.c || 0,
      customer_pairings: pairings?.c || 0,
      truck_assignments: truckHistory?.c || 0,
      driver_assignments: driverHistory?.c || 0,
      day_patterns: dayPatterns?.c || 0,
      pallet_corrections: corrections?.c || 0,
    },
    top_customer_pairings: topPairings.results,
    top_truck_affinities: topTruckAffinities.results,
    top_driver_affinities: topDriverAffinities.results,
    day_distribution: dayDist.results,
  })
})

// ==================== PALLET CORRECTIONS API ====================
// Correct pallet count for an order/stop and feed back to learning system
app.post('/api/learning/pallet-correction', async (c) => {
  const body = await c.req.json()
  const { context_type, context_id, route_id, order_id, calculated_pallets, actual_pallets, notes } = body

  if (!context_type || !context_id || actual_pallets == null) {
    return c.json({ error: 'context_type, context_id, and actual_pallets required' }, 400)
  }

  // Get items snapshot for learning
  let itemsJson = '[]'
  const targetOrderId = order_id || (context_type === 'order' ? context_id : null)
  if (targetOrderId) {
    const items = await c.env.DB.prepare(
      `SELECT oi.quantity, oi.product_id, p.name as product_name, p.pallet_qty, p.unit_type
       FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`
    ).bind(targetOrderId).all()
    itemsJson = JSON.stringify(items.results)
  }

  // Save the correction
  await c.env.DB.prepare(
    `INSERT INTO pallet_corrections (context_type, context_id, route_id, order_id, calculated_pallets, actual_pallets, items_json, notes)
     VALUES (?,?,?,?,?,?,?,?)`
  ).bind(context_type, context_id, route_id || null, targetOrderId || null, calculated_pallets, actual_pallets, itemsJson, notes || null).run()

  // If correcting a route stop, update the actual_pallets on the stop
  if (context_type === 'route_stop') {
    await c.env.DB.prepare(
      `UPDATE route_stops SET actual_pallets = ?, pallets_corrected = 1 WHERE id = ?`
    ).bind(actual_pallets, context_id).run()
  }

  // Update product_pallet_learned from this correction
  if (targetOrderId) {
    const items = await c.env.DB.prepare(
      `SELECT oi.quantity, oi.product_id, p.pallet_qty
       FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`
    ).bind(targetOrderId).all()

    // If single-product order, we can directly learn the mapping
    if ((items.results as any[]).length === 1) {
      const item = (items.results as any[])[0]
      const qty = item.quantity
      await c.env.DB.prepare(
        `INSERT INTO product_pallet_learned (product_id, quantity_min, quantity_max, learned_pallets, sample_count, confidence)
         VALUES (?, ?, ?, ?, 1, 0.6)
         ON CONFLICT(product_id, quantity_min, quantity_max) DO UPDATE SET
           learned_pallets = (learned_pallets * sample_count + ?) / (sample_count + 1),
           sample_count = sample_count + 1,
           confidence = MIN(1.0, 0.5 + sample_count * 0.05),
           updated_at = datetime('now')`
      ).bind(item.product_id, qty, qty, actual_pallets, actual_pallets).run()
    }
  }

  return c.json({ success: true, message: 'Pallet correction saved and learning updated' })
})

// Get correction history
app.get('/api/learning/pallet-corrections', async (c) => {
  const orderId = c.req.query('order_id')
  const routeId = c.req.query('route_id')
  let query = `SELECT pc.*, o.order_number, c.business_name
    FROM pallet_corrections pc
    LEFT JOIN orders o ON pc.order_id = o.id
    LEFT JOIN customers c ON o.customer_id = c.id
    WHERE 1=1`
  const params: any[] = []
  if (orderId) { query += ' AND pc.order_id = ?'; params.push(orderId) }
  if (routeId) { query += ' AND pc.route_id = ?'; params.push(routeId) }
  query += ' ORDER BY pc.created_at DESC LIMIT 100'
  const result = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ corrections: result.results })
})

// ==================== ROUTE RECOMMENDATION API ====================
// The heart of the learning system: given a set of pending orders, recommend
// how to group them into routes based on historical patterns.
app.post('/api/learning/recommend', async (c) => {
  const body = await c.req.json()
  const { date, order_ids } = body

  if (!date || !order_ids?.length) {
    return c.json({ error: 'date and order_ids required' }, 400)
  }

  const dow = DAY_NAMES[new Date(date + 'T12:00:00').getDay()]

  // Load order details with customer info
  const orders: any[] = []
  for (const oid of order_ids) {
    const o = await c.env.DB.prepare(
      `SELECT o.id, o.order_number, o.customer_id, o.priority, o.address_id,
        c.business_name, c.preferred_truck_id,
        a.lat, a.lng, a.city, a.zip, a.zone_id, a.gate_code
       FROM orders o JOIN customers c ON o.customer_id = c.id LEFT JOIN addresses a ON o.address_id = a.id
       WHERE o.id = ?`
    ).bind(oid).first() as any
    if (o) {
      const items = await c.env.DB.prepare(
        `SELECT oi.quantity, p.pallet_qty FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`
      ).bind(oid).all()
      o.pallet_count = calcPallets(items.results as any[])
      o.item_count = (items.results as any[]).reduce((s: number, i: any) => s + (i.quantity || 0), 0)
      orders.push(o)
    }
  }

  if (orders.length === 0) return c.json({ recommendations: [], reason: 'No valid orders found' })

  const customerIds = [...new Set(orders.map(o => o.customer_id))]

  // 1. Get customer pairing scores (how often these customers are grouped together)
  const pairingScores: Record<string, number> = {}
  if (customerIds.length > 1) {
    const placeholders = customerIds.map(() => '?').join(',')
    const pairings = await c.env.DB.prepare(
      `SELECT customer_a_id, customer_b_id, times_paired, avg_sequence_gap
       FROM customer_pairings
       WHERE customer_a_id IN (${placeholders}) AND customer_b_id IN (${placeholders})
       ORDER BY times_paired DESC`
    ).bind(...customerIds, ...customerIds).all()
    for (const p of pairings.results as any[]) {
      pairingScores[`${p.customer_a_id}-${p.customer_b_id}`] = p.times_paired
    }
  }

  // 2. Get customer → truck preferences (from history)
  const truckPrefs: Record<number, { truck_id: number; truck_name: string; count: number }[]> = {}
  for (const cid of customerIds) {
    const prefs = await c.env.DB.prepare(
      `SELECT cth.truck_id, t.name as truck_name, cth.times_assigned as count, t.truck_type, t.max_pallet_spots
       FROM customer_truck_history cth JOIN trucks t ON cth.truck_id = t.id
       WHERE cth.customer_id = ? ORDER BY cth.times_assigned DESC LIMIT 3`
    ).bind(cid).all()
    truckPrefs[cid] = prefs.results as any[]
  }

  // 3. Get customer → driver preferences (from history)
  const driverPrefs: Record<number, { driver_id: number; driver_name: string; count: number }[]> = {}
  for (const cid of customerIds) {
    const prefs = await c.env.DB.prepare(
      `SELECT cdh.driver_id, u.name as driver_name, cdh.times_assigned as count
       FROM customer_driver_history cdh JOIN users u ON cdh.driver_id = u.id
       WHERE cdh.customer_id = ? ORDER BY cdh.times_assigned DESC LIMIT 3`
    ).bind(cid).all()
    driverPrefs[cid] = prefs.results as any[]
  }

  // 4. Get customer day-of-week affinity for this day
  const dayAffinities: Record<number, number> = {}
  for (const cid of customerIds) {
    const aff = await c.env.DB.prepare(
      `SELECT delivery_count FROM customer_day_patterns WHERE customer_id = ? AND day_of_week = ?`
    ).bind(cid, dow).first() as any
    dayAffinities[cid] = aff?.delivery_count || 0
  }

  // 5. Build route grouping recommendations using pairing affinity
  //    Greedy clustering: start with the strongest pairs and expand clusters
  const trucks = await c.env.DB.prepare(
    "SELECT id, name, max_pallet_spots, truck_type FROM trucks WHERE status = 'available' AND archived = 0 ORDER BY max_pallet_spots DESC"
  ).all()
  const drivers = await c.env.DB.prepare(
    "SELECT id, name FROM users WHERE role = 'driver' AND active = 1 ORDER BY name"
  ).all()

  // Build affinity graph between orders (through their customers)
  const orderAffinity: Record<string, number> = {}
  for (let i = 0; i < orders.length; i++) {
    for (let j = i + 1; j < orders.length; j++) {
      const a = Math.min(orders[i].customer_id, orders[j].customer_id)
      const b = Math.max(orders[i].customer_id, orders[j].customer_id)
      const pairScore = pairingScores[`${a}-${b}`] || 0
      // Also factor in geographic proximity
      let geoScore = 0
      if (orders[i].lat && orders[j].lat) {
        const dist = distanceMiles(orders[i].lat, orders[i].lng, orders[j].lat, orders[j].lng)
        geoScore = Math.max(0, 20 - dist * 2) // Close customers get up to 20 points
      }
      // Same zone bonus
      const zoneScore = (orders[i].zone_id && orders[i].zone_id === orders[j].zone_id) ? 10 : 0
      orderAffinity[`${orders[i].id}-${orders[j].id}`] = pairScore * 3 + geoScore + zoneScore
    }
  }

  // Greedy clustering
  const clusters: any[][] = []
  const assigned = new Set<number>()

  // Sort orders by day affinity (prefer customers who usually deliver on this day)
  const sortedOrders = [...orders].sort((a, b) => {
    const aAff = dayAffinities[a.customer_id] || 0
    const bAff = dayAffinities[b.customer_id] || 0
    if (bAff !== aAff) return bAff - aAff
    const priOrder = { urgent: 0, high: 1, normal: 2, low: 3 }
    return (priOrder[a.priority as keyof typeof priOrder] ?? 2) - (priOrder[b.priority as keyof typeof priOrder] ?? 2)
  })

  for (const order of sortedOrders) {
    if (assigned.has(order.id)) continue

    // Start new cluster with this order
    const cluster = [order]
    assigned.add(order.id)

    // Find the best matching unassigned orders by affinity
    const candidates = sortedOrders
      .filter(o => !assigned.has(o.id))
      .map(o => ({
        order: o,
        score: orderAffinity[`${Math.min(order.id, o.id)}-${Math.max(order.id, o.id)}`] || 0
      }))
      .sort((a, b) => b.score - a.score)

    // Add high-affinity orders to this cluster (up to truck capacity)
    let clusterPallets = order.pallet_count || 1
    const maxPallets = 12 // Default; will be refined by truck recommendation

    for (const cand of candidates) {
      if (clusterPallets + (cand.order.pallet_count || 1) <= maxPallets) {
        // Only add if there's meaningful affinity or geographic proximity
        if (cand.score > 0 || (cand.order.zone_id && cand.order.zone_id === order.zone_id)) {
          cluster.push(cand.order)
          assigned.add(cand.order.id)
          clusterPallets += cand.order.pallet_count || 1
        }
      }
    }
    clusters.push(cluster)
  }

  // For each cluster, recommend truck and driver
  const recommendations = clusters.map((cluster, idx) => {
    const clusterCustomerIds = [...new Set(cluster.map(o => o.customer_id))]
    const totalPallets = cluster.reduce((s, o) => s + (o.pallet_count || 1), 0)
    const totalItems = cluster.reduce((s, o) => s + (o.item_count || 0), 0)

    // Recommend truck: find the truck most associated with these customers
    const truckVotes: Record<number, number> = {}
    for (const cid of clusterCustomerIds) {
      for (const pref of (truckPrefs[cid] || [])) {
        truckVotes[pref.truck_id] = (truckVotes[pref.truck_id] || 0) + pref.count
      }
    }
    let recTruck: any = null
    let recTruckScore = 0
    const truckList = trucks.results as any[]
    for (const t of truckList) {
      const vote = truckVotes[t.id] || 0
      // Must fit pallets
      if ((t.max_pallet_spots || 12) >= totalPallets && vote > recTruckScore) {
        recTruckScore = vote
        recTruck = t
      }
    }
    // Fallback: smallest truck that fits
    if (!recTruck) {
      recTruck = truckList.find(t => (t.max_pallet_spots || 12) >= totalPallets) || truckList[0]
    }

    // Recommend driver: find the driver most associated with these customers
    const driverVotes: Record<number, number> = {}
    for (const cid of clusterCustomerIds) {
      for (const pref of (driverPrefs[cid] || [])) {
        driverVotes[pref.driver_id] = (driverVotes[pref.driver_id] || 0) + pref.count
      }
    }
    let recDriver: any = null
    let recDriverScore = 0
    const driverList = drivers.results as any[]
    for (const d of driverList) {
      if ((driverVotes[d.id] || 0) > recDriverScore) {
        recDriverScore = driverVotes[d.id] || 0
        recDriver = d
      }
    }

    // Calculate confidence: based on how much historical data supports this recommendation
    const maxPairScore = Math.max(...cluster.flatMap((o, i) =>
      cluster.slice(i + 1).map(o2 => {
        const a = Math.min(o.customer_id, o2.customer_id)
        const b = Math.max(o.customer_id, o2.customer_id)
        return pairingScores[`${a}-${b}`] || 0
      })
    ), 0)
    const avgDayAff = clusterCustomerIds.reduce((s, cid) => s + (dayAffinities[cid] || 0), 0) / clusterCustomerIds.length
    const confidence = Math.min(1, (maxPairScore * 0.05 + avgDayAff * 0.1 + recTruckScore * 0.03 + recDriverScore * 0.03))

    return {
      group_index: idx + 1,
      orders: cluster.map((o, i) => ({
        id: o.id, order_number: o.order_number, business_name: o.business_name,
        customer_id: o.customer_id, pallet_count: o.pallet_count, item_count: o.item_count,
        priority: o.priority, sequence: i + 1, lat: o.lat, lng: o.lng, city: o.city,
        zone_id: o.zone_id, gate_code: o.gate_code,
        day_affinity: dayAffinities[o.customer_id] || 0,
      })),
      totals: { stops: cluster.length, pallets: totalPallets, items: totalItems },
      recommended_truck: recTruck ? { id: recTruck.id, name: recTruck.name, max_pallets: recTruck.max_pallet_spots || 12, type: recTruck.truck_type } : null,
      truck_confidence: recTruckScore > 0 ? Math.min(1, recTruckScore * 0.1) : 0,
      recommended_driver: recDriver ? { id: recDriver.id, name: recDriver.name } : null,
      driver_confidence: recDriverScore > 0 ? Math.min(1, recDriverScore * 0.1) : 0,
      confidence: Math.round(confidence * 100) / 100,
      reasons: [
        maxPairScore > 0 ? `These customers have been grouped together ${maxPairScore}+ times before` : null,
        avgDayAff > 1 ? `${Math.round(avgDayAff)} avg deliveries on ${dow}s for these customers` : null,
        recTruck && recTruckScore > 0 ? `${recTruck.name} has been used ${recTruckScore}x for these customers` : null,
        recDriver && recDriverScore > 0 ? `${recDriver.name} has delivered to these customers ${recDriverScore}x` : null,
      ].filter(Boolean),
    }
  })

  return c.json({
    date, day_of_week: dow,
    total_orders: orders.length,
    recommendations,
    has_learning_data: Object.keys(pairingScores).length > 0 || Object.keys(dayAffinities).some(k => dayAffinities[Number(k)] > 0),
  })
})

// Get learned patterns for a specific customer (for inline hints)
app.get('/api/learning/customer/:id', async (c) => {
  const customerId = c.req.param('id')

  const pairings = await c.env.DB.prepare(
    `SELECT cp.*, c.business_name as paired_with
     FROM customer_pairings cp
     JOIN customers c ON c.id = CASE WHEN cp.customer_a_id = ? THEN cp.customer_b_id ELSE cp.customer_a_id END
     WHERE cp.customer_a_id = ? OR cp.customer_b_id = ?
     ORDER BY cp.times_paired DESC LIMIT 10`
  ).bind(customerId, customerId, customerId).all()

  const truckHistory = await c.env.DB.prepare(
    `SELECT cth.*, t.name as truck_name, t.truck_type
     FROM customer_truck_history cth JOIN trucks t ON cth.truck_id = t.id
     WHERE cth.customer_id = ? ORDER BY cth.times_assigned DESC`
  ).bind(customerId).all()

  const driverHistory = await c.env.DB.prepare(
    `SELECT cdh.*, u.name as driver_name
     FROM customer_driver_history cdh JOIN users u ON cdh.driver_id = u.id
     WHERE cdh.customer_id = ? ORDER BY cdh.times_assigned DESC`
  ).bind(customerId).all()

  const dayPatterns = await c.env.DB.prepare(
    `SELECT * FROM customer_day_patterns WHERE customer_id = ? ORDER BY delivery_count DESC`
  ).bind(customerId).all()

  const corrections = await c.env.DB.prepare(
    `SELECT * FROM pallet_corrections WHERE order_id IN (SELECT id FROM orders WHERE customer_id = ?) ORDER BY created_at DESC LIMIT 10`
  ).bind(customerId).all()

  return c.json({
    usually_paired_with: pairings.results,
    truck_history: truckHistory.results,
    driver_history: driverHistory.results,
    day_patterns: dayPatterns.results,
    recent_pallet_corrections: corrections.results,
  })
})

// ==================== ROUTE TEMPLATES (Repeat Route) ====================
// Get past route patterns for a given day-of-week to use as templates
app.get('/api/learning/templates', async (c) => {
  const dow = c.req.query('day_of_week') // 'mon','tue',...
  const limit = parseInt(c.req.query('limit') || '10')
  let query = `SELECT rs.*, 
    (SELECT COUNT(DISTINCT customer_id) FROM route_stops rst JOIN orders o ON rst.order_id = o.id WHERE rst.route_id = rs.route_id) as unique_customers
    FROM route_snapshots rs WHERE rs.snapshot_type IN ('created','completed','backfill')`
  const params: any[] = []
  if (dow) { query += ' AND rs.day_of_week = ?'; params.push(dow) }
  query += ' ORDER BY rs.date DESC LIMIT ?'
  params.push(limit)
  const result = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ templates: result.results })
})

// Clone a route template for a new date — reuses the customer grouping from a past route
app.post('/api/learning/clone-route', async (c) => {
  const body = await c.req.json()
  const { snapshot_id, new_date, truck_id, driver_id } = body
  if (!snapshot_id || !new_date) return c.json({ error: 'snapshot_id and new_date required' }, 400)

  const snap = await c.env.DB.prepare('SELECT * FROM route_snapshots WHERE id = ?').bind(snapshot_id).first() as any
  if (!snap) return c.json({ error: 'Snapshot not found' }, 404)

  const stops = JSON.parse(snap.stops_json || '[]')
  const customerIds = stops.map((s: any) => s.customer_id).filter(Boolean)
  if (customerIds.length === 0) return c.json({ error: 'No customers in this template' }, 400)

  // Find current pending orders for these customers
  const placeholders = customerIds.map(() => '?').join(',')
  const orders = await c.env.DB.prepare(
    `SELECT o.id, o.customer_id, o.order_number, c.business_name, a.lat, a.lng, a.city, a.street, a.zip
     FROM orders o JOIN customers c ON o.customer_id = c.id LEFT JOIN addresses a ON o.address_id = a.id
     WHERE o.customer_id IN (${placeholders}) AND o.status IN ('new','confirmed') AND o.route_id IS NULL
     ORDER BY o.customer_id`
  ).bind(...customerIds).all()

  // Also find customers with no current orders (for info)
  const foundCustomerIds = new Set((orders.results as any[]).map(o => o.customer_id))
  const missingCustomers: string[] = []
  for (const cid of customerIds) {
    if (!foundCustomerIds.has(cid)) {
      const cust = await c.env.DB.prepare('SELECT business_name FROM customers WHERE id = ?').bind(cid).first() as any
      if (cust) missingCustomers.push(cust.business_name)
    }
  }

  return c.json({
    template: {
      date: snap.date, day_of_week: snap.day_of_week, truck_name: snap.truck_name,
      driver_name: snap.driver_name, stop_count: snap.stop_count, total_pallets: snap.total_pallets,
    },
    available_orders: orders.results,
    missing_customers: missingCustomers,
    suggested_truck_id: truck_id || snap.truck_id,
    suggested_driver_id: driver_id || snap.driver_id,
  })
})

// Quick learning hints for a batch of orders (used in order list/schedule views)
app.post('/api/learning/order-hints', async (c) => {
  const body = await c.req.json()
  const { order_ids } = body
  if (!order_ids?.length) return c.json({ hints: {} })

  const hints: Record<number, any> = {}
  for (const oid of order_ids.slice(0, 50)) {
    const order = await c.env.DB.prepare(
      'SELECT customer_id FROM orders WHERE id = ?'
    ).bind(oid).first() as any
    if (!order) continue

    const cid = order.customer_id
    // Top truck
    const topTruck = await c.env.DB.prepare(
      `SELECT t.name, cth.times_assigned FROM customer_truck_history cth
       JOIN trucks t ON cth.truck_id = t.id WHERE cth.customer_id = ?
       ORDER BY cth.times_assigned DESC LIMIT 1`
    ).bind(cid).first() as any
    // Top driver
    const topDriver = await c.env.DB.prepare(
      `SELECT u.name, cdh.times_assigned FROM customer_driver_history cdh
       JOIN users u ON cdh.driver_id = u.id WHERE cdh.customer_id = ?
       ORDER BY cdh.times_assigned DESC LIMIT 1`
    ).bind(cid).first() as any
    // Top paired customer
    const topPair = await c.env.DB.prepare(
      `SELECT c.business_name, cp.times_paired FROM customer_pairings cp
       JOIN customers c ON c.id = CASE WHEN cp.customer_a_id = ? THEN cp.customer_b_id ELSE cp.customer_a_id END
       WHERE cp.customer_a_id = ? OR cp.customer_b_id = ?
       ORDER BY cp.times_paired DESC LIMIT 1`
    ).bind(cid, cid, cid).first() as any
    // Best day
    const bestDay = await c.env.DB.prepare(
      `SELECT day_of_week, delivery_count FROM customer_day_patterns
       WHERE customer_id = ? ORDER BY delivery_count DESC LIMIT 1`
    ).bind(cid).first() as any
    // Pallet correction history
    const palletAdj = await c.env.DB.prepare(
      `SELECT AVG(actual_pallets - calculated_pallets) as avg_adj, COUNT(*) as count
       FROM pallet_corrections WHERE order_id IN (SELECT id FROM orders WHERE customer_id = ?)`
    ).bind(cid).first() as any

    hints[oid] = {
      usual_truck: topTruck ? { name: topTruck.name, count: topTruck.times_assigned } : null,
      usual_driver: topDriver ? { name: topDriver.name, count: topDriver.times_assigned } : null,
      usually_with: topPair ? { name: topPair.business_name, count: topPair.times_paired } : null,
      best_day: bestDay ? { day: bestDay.day_of_week, count: bestDay.delivery_count } : null,
      pallet_adjustment: palletAdj?.count > 0 ? { avg: Math.round((palletAdj.avg_adj || 0) * 10) / 10, samples: palletAdj.count } : null,
    }
  }
  return c.json({ hints })
})

// Get learned pallet estimate for an order (uses corrections history)
app.get('/api/learning/pallet-estimate/:orderId', async (c) => {
  const orderId = c.req.param('orderId')
  const items = await c.env.DB.prepare(
    `SELECT oi.quantity, oi.product_id, p.pallet_qty, p.name
     FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`
  ).bind(orderId).all()

  const calculated = calcPallets(items.results as any[])
  let learnedEstimate = calculated
  let hasLearning = false

  // Check product_pallet_learned for overrides
  for (const item of items.results as any[]) {
    const learned = await c.env.DB.prepare(
      `SELECT learned_pallets, confidence, sample_count FROM product_pallet_learned
       WHERE product_id = ? AND quantity_min <= ? AND quantity_max >= ?
       ORDER BY confidence DESC LIMIT 1`
    ).bind((item as any).product_id, (item as any).quantity, (item as any).quantity).first() as any
    if (learned && learned.confidence >= 0.6) {
      learnedEstimate = Math.round(learned.learned_pallets)
      hasLearning = true
      break
    }
  }

  // Also check recent corrections for this customer's similar orders
  const order = await c.env.DB.prepare('SELECT customer_id FROM orders WHERE id = ?').bind(orderId).first() as any
  if (order && !hasLearning) {
    const recent = await c.env.DB.prepare(
      `SELECT AVG(actual_pallets) as avg_pallets, COUNT(*) as cnt
       FROM pallet_corrections
       WHERE order_id IN (SELECT id FROM orders WHERE customer_id = ?)
       AND ABS(calculated_pallets - ?) <= 2
       AND created_at > datetime('now', '-90 days')`
    ).bind(order.customer_id, calculated).first() as any
    if (recent && recent.cnt >= 2) {
      learnedEstimate = Math.round(recent.avg_pallets)
      hasLearning = true
    }
  }

  return c.json({
    calculated_pallets: calculated,
    learned_pallets: learnedEstimate,
    has_learning: hasLearning,
    items: items.results,
  })
})

// ==================== FLEET SYNC API (Verizon ↔ App Two-Way Sync) ====================

// Verizon drivers come wrapped: [{Driver:{FirstName,LastName,...}}, ...] — normalize to flat objects
function normalizeVerizonDrivers(raw: any[]): any[] {
  return raw.map(d => d.Driver ? d.Driver : d)
}

// GET sync status: show all trucks/drivers with their Verizon link status
app.get('/api/sync/status', async (c) => {
  try {
    const trucks = await c.env.DB.prepare(
      `SELECT t.id, t.name, t.plate_number, t.vin, t.make, t.model, t.year, t.license_plate,
       t.verizon_vehicle_id, t.verizon_vehicle_number, t.verizon_synced_at, t.status, t.truck_type,
       dz.name as zone_name
       FROM trucks t LEFT JOIN delivery_zones dz ON t.zone_id = dz.id
       WHERE t.archived = 0 ORDER BY t.name`
    ).all()
    const drivers = await c.env.DB.prepare(
      `SELECT id, name, email, phone, role, active, verizon_driver_id, verizon_driver_number, verizon_synced_at
       FROM users WHERE active = 1 ORDER BY role, name`
    ).all()
    // Try to get Verizon data
    let verizonVehicles: any[] = []
    let verizonDrivers: any[] = []
    let verizonError = ''
    try {
      const vData = await verizonFetch(c.env, '/cmd/v1/vehicles')
      verizonVehicles = Array.isArray(vData) ? vData : []
      const dData = await verizonFetch(c.env, '/cmd/v1/drivers')
      verizonDrivers = normalizeVerizonDrivers(Array.isArray(dData) ? dData : [])
    } catch (e: any) {
      verizonError = e.message
    }
    return c.json({
      trucks: trucks.results,
      drivers: drivers.results,
      verizonVehicles,
      verizonDrivers,
      verizonError,
      timestamp: new Date().toISOString()
    })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// POST link a truck to a Verizon vehicle
app.post('/api/sync/link-truck', async (c) => {
  try {
    const { truckId, verizonVehicleId, verizonVehicleNumber, vin, make, model, year, licensePlate, vehicleName } = await c.req.json()
    if (!truckId) return c.json({ error: 'truckId is required' }, 400)
    
    const fields: string[] = ['verizon_synced_at = datetime(\'now\')']
    const vals: any[] = []
    
    if (verizonVehicleId !== undefined) { fields.push('verizon_vehicle_id = ?'); vals.push(verizonVehicleId) }
    if (verizonVehicleNumber !== undefined) { fields.push('verizon_vehicle_number = ?'); vals.push(verizonVehicleNumber) }
    if (vin !== undefined) { fields.push('vin = ?'); vals.push(vin) }
    if (make !== undefined) { fields.push('make = ?'); vals.push(make) }
    if (model !== undefined) { fields.push('model = ?'); vals.push(model) }
    if (year !== undefined) { fields.push('year = ?'); vals.push(year) }
    if (licensePlate !== undefined) { fields.push('license_plate = ?'); vals.push(licensePlate) }
    
    vals.push(truckId)
    await c.env.DB.prepare(`UPDATE trucks SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run()
    return c.json({ success: true, message: `Truck linked to Verizon vehicle ${verizonVehicleNumber || verizonVehicleId}` })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// POST unlink a truck from Verizon
app.post('/api/sync/unlink-truck', async (c) => {
  try {
    const { truckId } = await c.req.json()
    if (!truckId) return c.json({ error: 'truckId is required' }, 400)
    await c.env.DB.prepare(
      `UPDATE trucks SET verizon_vehicle_id = NULL, verizon_vehicle_number = NULL, vin = NULL, make = NULL, model = NULL, year = NULL, license_plate = NULL, verizon_synced_at = NULL WHERE id = ?`
    ).bind(truckId).run()
    return c.json({ success: true })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// POST link a driver/user to a Verizon driver
app.post('/api/sync/link-driver', async (c) => {
  try {
    const { userId, verizonDriverId, verizonDriverNumber } = await c.req.json()
    if (!userId) return c.json({ error: 'userId is required' }, 400)
    await c.env.DB.prepare(
      `UPDATE users SET verizon_driver_id = ?, verizon_driver_number = ?, verizon_synced_at = datetime('now') WHERE id = ?`
    ).bind(verizonDriverId || null, verizonDriverNumber || null, userId).run()
    return c.json({ success: true, message: `Driver linked to Verizon driver ${verizonDriverNumber || verizonDriverId}` })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// POST unlink a driver from Verizon
app.post('/api/sync/unlink-driver', async (c) => {
  try {
    const { userId } = await c.req.json()
    if (!userId) return c.json({ error: 'userId is required' }, 400)
    await c.env.DB.prepare(
      `UPDATE users SET verizon_driver_id = NULL, verizon_driver_number = NULL, verizon_synced_at = NULL WHERE id = ?`
    ).bind(userId).run()
    return c.json({ success: true })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// POST auto-sync: pull Verizon data and auto-link matching trucks/drivers
app.post('/api/sync/auto', async (c) => {
  try {
    const results: any = { trucksLinked: 0, driversLinked: 0, trucksUpdated: 0, driversImported: 0, errors: [] }
    
    // Get Verizon data
    let verizonVehicles: any[] = []
    let verizonDrivers: any[] = []
    try {
      const vData = await verizonFetch(c.env, '/cmd/v1/vehicles')
      verizonVehicles = Array.isArray(vData) ? vData : []
    } catch (e: any) { results.errors.push('Vehicles: ' + e.message) }
    try {
      const dData = await verizonFetch(c.env, '/cmd/v1/drivers')
      verizonDrivers = normalizeVerizonDrivers(Array.isArray(dData) ? dData : [])
    } catch (e: any) { results.errors.push('Drivers: ' + e.message) }
    
    // Get app data
    const appTrucks = (await c.env.DB.prepare('SELECT * FROM trucks WHERE archived = 0').all()).results as any[]
    const appUsers = (await c.env.DB.prepare('SELECT * FROM users WHERE active = 1').all()).results as any[]
    
    // Auto-link trucks by name matching
    for (const vv of verizonVehicles) {
      const vName = (vv.VehicleName || vv.Name || '').toLowerCase()
      const vNumber = vv.VehicleNumber || vv.Number || ''
      const vId = vv.VehicleId || vv.Id
      const vVin = vv.VIN || vv.Vin || null
      const vMake = vv.Make || null
      const vModel = vv.Model || null
      const vYear = vv.Year || null
      const vPlate = vv.RegistrationNumber || vNumber
      
      // Check if already linked
      const alreadyLinked = appTrucks.find((t: any) => t.verizon_vehicle_id == vId || t.verizon_vehicle_number === vNumber)
      if (alreadyLinked) {
        // Update vehicle details from Verizon
        await c.env.DB.prepare(
          `UPDATE trucks SET vin = COALESCE(?, vin), make = COALESCE(?, make), model = COALESCE(?, model), 
           year = COALESCE(?, year), license_plate = COALESCE(?, license_plate), verizon_synced_at = datetime('now')
           WHERE id = ?`
        ).bind(vVin, vMake, vModel, vYear, vPlate, alreadyLinked.id).run()
        results.trucksUpdated++
        continue
      }
      
      // Try to match by name
      const match = appTrucks.find((t: any) => {
        const tName = (t.name || '').toLowerCase()
        return vName.includes(tName) || tName.includes(vName.replace(/ (big |small )?truck/i, '').trim())
      })
      if (match && !match.verizon_vehicle_id) {
        await c.env.DB.prepare(
          `UPDATE trucks SET verizon_vehicle_id = ?, verizon_vehicle_number = ?, vin = ?, make = ?, model = ?, year = ?, license_plate = ?, verizon_synced_at = datetime('now') WHERE id = ?`
        ).bind(vId, vNumber, vVin, vMake, vModel, vYear, vPlate, match.id).run()
        results.trucksLinked++
      }
    }
    
    // Auto-link drivers by name/email matching
    for (const vd of verizonDrivers) {
      const vFirstName = (vd.FirstName || '').toLowerCase().trim()
      const vLastName = (vd.LastName || '').toLowerCase().trim()
      const vEmail = (vd.EmailAddress || '').toLowerCase().trim()
      const vDriverId = vd.DriverId || vd.Id
      const vDriverNumber = vd.DriverNumber || vd.Number || String(vDriverId)
      
      // Skip placeholder "No Driver" entries
      if (vFirstName === 'no' && vLastName === 'driver') continue
      
      // Check if already linked
      const alreadyLinked = appUsers.find((u: any) => u.verizon_driver_id == vDriverId)
      if (alreadyLinked) continue
      
      // Try to match by email
      let match = appUsers.find((u: any) => u.email && vEmail && u.email.toLowerCase() === vEmail)
      
      // Try to match by name
      if (!match) {
        match = appUsers.find((u: any) => {
          const uName = (u.name || '').toLowerCase()
          const fullName = `${vFirstName} ${vLastName}`
          return uName === fullName || uName.includes(vFirstName) && uName.includes(vLastName)
        })
      }
      
      if (match && !match.verizon_driver_id) {
        await c.env.DB.prepare(
          `UPDATE users SET verizon_driver_id = ?, verizon_driver_number = ?, verizon_synced_at = datetime('now') WHERE id = ?`
        ).bind(vDriverId, vDriverNumber, match.id).run()
        results.driversLinked++
      }
    }
    
    return c.json({ success: true, results })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// POST import a Verizon driver as a new app user
app.post('/api/sync/import-driver', async (c) => {
  try {
    const { verizonDriverId, name, email, phone, role } = await c.req.json()
    if (!name) return c.json({ error: 'name is required' }, 400)
    
    // Check if email already exists
    if (email) {
      const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
      if (existing) return c.json({ error: 'A user with this email already exists', existingId: (existing as any).id }, 409)
    }
    
    const driverEmail = email || `driver_${verizonDriverId || Date.now()}@britishfeed.com`
    const res = await c.env.DB.prepare(
      `INSERT INTO users (email, name, role, phone, preferred_language, password_hash, active, verizon_driver_id, verizon_driver_number, verizon_synced_at)
       VALUES (?,?,?,?,?,?,1,?,?,datetime('now'))`
    ).bind(driverEmail, name, role || 'driver', phone || null, 'en', 'driver123', verizonDriverId || null, String(verizonDriverId || '')).run()
    return c.json({ success: true, id: res.meta.last_row_id, message: `Driver "${name}" imported successfully` })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// POST import a Verizon vehicle as a new app truck
app.post('/api/sync/import-truck', async (c) => {
  try {
    const { verizonVehicleId, verizonVehicleNumber, name, vin, make, model, year, licensePlate, truckType } = await c.req.json()
    if (!name) return c.json({ error: 'name is required' }, 400)
    
    const res = await c.env.DB.prepare(
      `INSERT INTO trucks (name, plate_number, max_pallet_spots, truck_type, bale_capacity, status, vin, make, model, year, license_plate, verizon_vehicle_id, verizon_vehicle_number, verizon_synced_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`
    ).bind(name, licensePlate || verizonVehicleNumber || null, 12, truckType || 'pallet', 0, 'available', vin || null, make || null, model || null, year || null, licensePlate || verizonVehicleNumber || null, verizonVehicleId || null, verizonVehicleNumber || null).run()
    return c.json({ success: true, id: res.meta.last_row_id, message: `Truck "${name}" imported successfully` })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// POST bulk update: push Verizon vehicle details to all linked trucks
app.post('/api/sync/refresh-vehicles', async (c) => {
  try {
    const vData = await verizonFetch(c.env, '/cmd/v1/vehicles')
    const verizonVehicles = Array.isArray(vData) ? vData : []
    const linkedTrucks = (await c.env.DB.prepare('SELECT id, verizon_vehicle_id, verizon_vehicle_number FROM trucks WHERE verizon_vehicle_id IS NOT NULL').all()).results as any[]
    
    let updated = 0
    for (const truck of linkedTrucks) {
      const vv = verizonVehicles.find((v: any) => (v.VehicleId || v.Id) == truck.verizon_vehicle_id || (v.VehicleNumber || v.Number) === truck.verizon_vehicle_number)
      if (vv) {
        await c.env.DB.prepare(
          `UPDATE trucks SET vin = ?, make = ?, model = ?, year = ?, license_plate = ?, verizon_synced_at = datetime('now') WHERE id = ?`
        ).bind(vv.VIN || vv.Vin || null, vv.Make || null, vv.Model || null, vv.Year || null, vv.RegistrationNumber || vv.VehicleNumber || null, truck.id).run()
        updated++
      }
    }
    return c.json({ success: true, updated, total: linkedTrucks.length })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ==================== VERIZON CONNECT REVEAL API ====================
// Proxy layer for Verizon Connect Reveal fleet tracking API
// All credentials stay server-side; frontend calls our /api/verizon/* endpoints

// Token cache to avoid re-authenticating every request (tokens last 20 min)
let verizonTokenCache: { token: string; expiresAt: number } | null = null

async function getVerizonToken(env: Bindings): Promise<string> {
  const username = env.VERIZON_USERNAME
  const password = env.VERIZON_PASSWORD
  if (!username || !password) throw new Error('Verizon Connect credentials not configured')

  // Return cached token if still valid (with 2-min buffer)
  if (verizonTokenCache && Date.now() < verizonTokenCache.expiresAt - 120000) {
    return verizonTokenCache.token
  }

  const basicAuth = btoa(`${username}:${password}`)
  const resp = await fetch('https://fim.api.us.fleetmatics.com/token', {
    headers: { 'Authorization': `Basic ${basicAuth}`, 'Accept': 'text/plain' }
  })
  if (!resp.ok) throw new Error(`Verizon token request failed: ${resp.status}`)
  const token = await resp.text()
  verizonTokenCache = { token, expiresAt: Date.now() + 20 * 60 * 1000 }
  return token
}

function verizonAuthHeader(appId: string, token: string): string {
  return `Atmosphere atmosphere_app_id=${appId}, Bearer ${token}`
}

async function verizonFetch(env: Bindings, path: string, method = 'GET', body?: any): Promise<any> {
  const appId = env.VERIZON_APP_ID
  if (!appId) throw new Error('Verizon Connect App ID not configured. Register at https://fim.us.fleetmatics.com to get your atmosphere_app_id.')
  const token = await getVerizonToken(env)
  const url = `https://fim.api.us.fleetmatics.com${path}`
  const headers: Record<string, string> = {
    'Authorization': verizonAuthHeader(appId, token),
    'Accept': 'application/json',
  }
  const opts: RequestInit = { method, headers }
  if (body) {
    headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const resp = await fetch(url, opts)
  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`Verizon API ${method} ${path} failed (${resp.status}): ${errText}`)
  }
  const ct = resp.headers.get('content-type') || ''
  return ct.includes('json') ? resp.json() : resp.text()
}

// -- Config check: is Verizon Connect configured?
app.get('/api/verizon/config', async (c) => {
  const hasUsername = !!c.env.VERIZON_USERNAME
  const hasPassword = !!c.env.VERIZON_PASSWORD
  const hasAppId = !!c.env.VERIZON_APP_ID
  return c.json({
    configured: hasUsername && hasPassword && hasAppId,
    hasCredentials: hasUsername && hasPassword,
    hasAppId,
    message: !hasUsername || !hasPassword
      ? 'Verizon Connect credentials not set. Add VERIZON_USERNAME and VERIZON_PASSWORD.'
      : !hasAppId
        ? 'Verizon App ID not set. Register at fim.us.fleetmatics.com and add VERIZON_APP_ID.'
        : 'Verizon Connect is configured and ready.'
  })
})

// -- Test connection (validates token + app_id)
app.post('/api/verizon/test', async (c) => {
  try {
    await getVerizonToken(c.env)
    // If we have app_id, try a real API call
    if (c.env.VERIZON_APP_ID) {
      const vehicles = await verizonFetch(c.env, '/cmd/v1/vehicles')
      return c.json({ success: true, message: 'Connected to Verizon Connect', vehicleCount: Array.isArray(vehicles) ? vehicles.length : 0 })
    }
    return c.json({ success: true, message: 'Token authentication works. App ID needed for full API access.' })
  } catch (e: any) {
    return c.json({ success: false, message: e.message }, 400)
  }
})

// -- GET all vehicles
app.get('/api/verizon/vehicles', async (c) => {
  try {
    const data = await verizonFetch(c.env, '/cmd/v1/vehicles')
    return c.json({ vehicles: Array.isArray(data) ? data : [] })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// -- GET vehicle by number
app.get('/api/verizon/vehicles/:vehicleNumber', async (c) => {
  try {
    const vn = c.req.param('vehicleNumber')
    const data = await verizonFetch(c.env, `/cmd/v1/vehicles/${encodeURIComponent(vn)}`)
    return c.json(data)
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// -- GET vehicle location (real-time)
app.get('/api/verizon/vehicles/:vehicleNumber/location', async (c) => {
  try {
    const vn = c.req.param('vehicleNumber')
    const data = await verizonFetch(c.env, `/rad/v1/vehicles/${encodeURIComponent(vn)}/location`)
    return c.json(data)
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// -- GET all vehicle locations (batch — fetches each vehicle's location)
app.get('/api/verizon/locations', async (c) => {
  try {
    const vehicles = await verizonFetch(c.env, '/cmd/v1/vehicles') as any[]
    if (!Array.isArray(vehicles) || vehicles.length === 0) return c.json({ locations: [] })

    // Fetch locations in parallel (limit concurrency to 10)
    const results: any[] = []
    const batchSize = 10
    for (let i = 0; i < vehicles.length; i += batchSize) {
      const batch = vehicles.slice(i, i + batchSize)
      const locs = await Promise.allSettled(
        batch.map(async (v: any) => {
          const vn = v.VehicleNumber || v.Number || v.vehicleNumber
          if (!vn) return null
          try {
            const loc = await verizonFetch(c.env, `/rad/v1/vehicles/${encodeURIComponent(vn)}/location`)
            return { ...loc, VehicleNumber: vn, VehicleName: v.VehicleName || v.Name || vn }
          } catch { return null }
        })
      )
      results.push(...locs.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean))
    }
    return c.json({ locations: results })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// -- GET vehicle segments (journey/trip data for a day)
app.get('/api/verizon/vehicles/:vehicleNumber/segments', async (c) => {
  try {
    const vn = c.req.param('vehicleNumber')
    const date = c.req.query('date') || new Date().toISOString().split('T')[0]
    const startUtc = `${date}T00:00:00`
    const data = await verizonFetch(c.env, `/rad/v1/vehicles/${encodeURIComponent(vn)}/segments?startdateutc=${encodeURIComponent(startUtc)}`)
    return c.json(Array.isArray(data) ? data : [data])
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// -- GET vehicle status
app.get('/api/verizon/vehicles/:vehicleNumber/status', async (c) => {
  try {
    const vn = c.req.param('vehicleNumber')
    const data = await verizonFetch(c.env, `/rad/v1/vehicles/${encodeURIComponent(vn)}/status`)
    return c.json(data)
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// -- GET all drivers
app.get('/api/verizon/drivers', async (c) => {
  try {
    const data = await verizonFetch(c.env, '/cmd/v1/drivers')
    return c.json({ drivers: normalizeVerizonDrivers(Array.isArray(data) ? data : []) })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// -- GET driver by number
app.get('/api/verizon/drivers/:driverNumber', async (c) => {
  try {
    const dn = c.req.param('driverNumber')
    const data = await verizonFetch(c.env, `/cmd/v1/drivers/${encodeURIComponent(dn)}`)
    return c.json(data)
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// -- GET driver segments (trip history)
app.get('/api/verizon/drivers/:driverNumber/segments', async (c) => {
  try {
    const dn = c.req.param('driverNumber')
    const date = c.req.query('date') || new Date().toISOString().split('T')[0]
    const startUtc = `${date}T00:00:00`
    const data = await verizonFetch(c.env, `/rad/v1/drivers/${encodeURIComponent(dn)}/segments?startdateutc=${encodeURIComponent(startUtc)}`)
    return c.json(Array.isArray(data) ? data : [data])
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// -- GET driver assignment (which vehicle a driver is in)
app.get('/api/verizon/drivers/:driverNumber/assignment', async (c) => {
  try {
    const dn = c.req.param('driverNumber')
    const data = await verizonFetch(c.env, `/rad/v1/drivers/${encodeURIComponent(dn)}/assignment`)
    return c.json(data)
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// -- GET vehicle assignment (which driver is in a vehicle)
app.get('/api/verizon/vehicles/:vehicleNumber/assignment', async (c) => {
  try {
    const vn = c.req.param('vehicleNumber')
    const data = await verizonFetch(c.env, `/rad/v1/vehicles/${encodeURIComponent(vn)}/assignment`)
    return c.json(data)
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// -- GET all groups
app.get('/api/verizon/groups', async (c) => {
  try {
    const data = await verizonFetch(c.env, '/cmd/v1/groups')
    return c.json({ groups: Array.isArray(data) ? data : [] })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// -- GET driver safety events (harsh braking, acceleration, speeding)
app.get('/api/verizon/safety/driver/:driverNumber', async (c) => {
  try {
    const dn = c.req.param('driverNumber')
    const date = c.req.query('date') || new Date().toISOString().split('T')[0]
    const startUtc = `${date}T00:00:00`
    const data = await verizonFetch(c.env, `/da/v1/drivers/${encodeURIComponent(dn)}/safety?startdateutc=${encodeURIComponent(startUtc)}`)
    return c.json(Array.isArray(data) ? data : [data])
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// -- GET geofences by group
app.get('/api/verizon/geofences', async (c) => {
  try {
    const groupId = c.req.query('groupId')
    const category = c.req.query('category')
    let path = ''
    if (groupId) path = `/gs/v1/geofences/group/${encodeURIComponent(groupId)}`
    else if (category) path = `/gs/v1/geofences/category/${encodeURIComponent(category)}`
    else return c.json({ error: 'groupId or category query param required' }, 400)
    const data = await verizonFetch(c.env, path)
    return c.json({ geofences: Array.isArray(data) ? data : [] })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// -- POST work order
app.post('/api/verizon/workorders', async (c) => {
  try {
    const body = await c.req.json()
    const data = await verizonFetch(c.env, '/ps/v1/workorders', 'POST', body)
    return c.json(data)
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// -- GET work order by number
app.get('/api/verizon/workorders/:workOrderNumber', async (c) => {
  try {
    const won = c.req.param('workOrderNumber')
    const data = await verizonFetch(c.env, `/ps/v1/workorders/${encodeURIComponent(won)}`)
    return c.json(data)
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// -- POST navigation stops to a vehicle
app.post('/api/verizon/vehicles/:vehicleNumber/stops', async (c) => {
  try {
    const vn = c.req.param('vehicleNumber')
    const body = await c.req.json()
    const data = await verizonFetch(c.env, `/ps/v1/vehicles/${encodeURIComponent(vn)}/stops`, 'POST', body)
    return c.json(data)
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// -- Combined fleet dashboard data (vehicles + locations + drivers)
app.get('/api/verizon/dashboard', async (c) => {
  try {
    const [vehiclesData, driversData] = await Promise.allSettled([
      verizonFetch(c.env, '/cmd/v1/vehicles'),
      verizonFetch(c.env, '/cmd/v1/drivers'),
    ])
    const vehicles = vehiclesData.status === 'fulfilled' && Array.isArray(vehiclesData.value) ? vehiclesData.value : []
    const drivers = driversData.status === 'fulfilled' && Array.isArray(driversData.value) ? normalizeVerizonDrivers(driversData.value) : []

    // Fetch locations for all vehicles in parallel
    const locationPromises = vehicles.slice(0, 50).map(async (v: any) => {
      const vn = v.VehicleNumber || v.Number
      if (!vn) return null
      try {
        const loc = await verizonFetch(c.env, `/rad/v1/vehicles/${encodeURIComponent(vn)}/location`)
        return { vehicleNumber: vn, vehicleName: v.VehicleName || v.Name || vn, ...loc }
      } catch { return { vehicleNumber: vn, vehicleName: v.VehicleName || v.Name || vn, error: true } }
    })
    const locations = (await Promise.allSettled(locationPromises))
      .map(r => r.status === 'fulfilled' ? r.value : null)
      .filter(Boolean)

    return c.json({ vehicles, drivers, locations, timestamp: new Date().toISOString() })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ==================== WAREHOUSE API ====================

// Warehouse dashboard summary
app.get('/api/warehouse/dashboard', async (c) => {
  const db = c.env.DB
  const today = new Date().toISOString().split('T')[0]
  try {
    const [products, todayOrders, todayRoutes, pendingReturns, recentActivity] = await Promise.all([
      db.prepare(`SELECT p.id, p.name, p.sku, p.category, p.unit_type, p.stock_quantity, p.warehouse_zone,
        p.weight_per_unit, p.pallet_qty, p.low_stock_threshold, p.reorder_point
        FROM products p WHERE p.active = 1 ORDER BY p.warehouse_zone, p.category, p.name`).all(),
      db.prepare(`SELECT o.id, o.order_number, o.status, o.priority, o.scheduled_date, o.warehouse_received,
        c.business_name, (SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi WHERE oi.order_id = o.id) as item_count
        FROM orders o JOIN customers c ON o.customer_id = c.id
        WHERE o.archived = 0 AND o.scheduled_date = ? AND o.status IN ('new','confirmed','scheduled','loaded')
        ORDER BY CASE o.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END`).bind(today).all(),
      db.prepare(`SELECT r.id, r.route_number, r.date, r.status, r.truck_id, r.driver_id,
        t.name as truck_name, u.name as driver_name,
        (SELECT COUNT(*) FROM route_stops rs WHERE rs.route_id = r.id) as stop_count,
        (SELECT COUNT(*) FROM route_stops rs WHERE rs.route_id = r.id AND rs.loaded_at IS NOT NULL) as loaded_count
        FROM routes r LEFT JOIN trucks t ON r.truck_id = t.id LEFT JOIN users u ON r.driver_id = u.id
        WHERE r.date = ? AND r.status NOT IN ('completed','cancelled')
        ORDER BY r.route_number`).bind(today).all(),
      db.prepare(`SELECT ret.id, ret.status, ret.order_id, c.business_name, o.order_number,
        (SELECT COUNT(*) FROM return_items ri WHERE ri.return_id = ret.id) as item_count
        FROM returns ret JOIN customers c ON ret.customer_id = c.id LEFT JOIN orders o ON ret.order_id = o.id
        WHERE ret.status IN ('pending','approved','received')
        ORDER BY ret.created_at DESC LIMIT 20`).all(),
      db.prepare(`SELECT wa.*, p.name as product_name, u.name as performed_by_name
        FROM warehouse_activity wa LEFT JOIN products p ON wa.product_id = p.id LEFT JOIN users u ON wa.performed_by = u.id
        ORDER BY wa.created_at DESC LIMIT 30`).all(),
    ])
    return c.json({
      products: products.results,
      today_orders: todayOrders.results,
      today_routes: todayRoutes.results,
      pending_returns: pendingReturns.results,
      recent_activity: recentActivity.results,
    })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// Warehouse inventory counts by zone
app.get('/api/warehouse/inventory', async (c) => {
  const zone = c.req.query('zone')
  const search = c.req.query('search')
  let query = `SELECT p.id, p.name, p.sku, p.category, p.unit_type, p.stock_quantity, p.warehouse_zone,
    p.weight_per_unit, p.pallet_qty, p.price, p.cost, p.low_stock_threshold, p.reorder_point
    FROM products p WHERE p.active = 1`
  const params: any[] = []
  if (zone && zone !== 'all') { query += ' AND p.warehouse_zone = ?'; params.push(zone) }
  if (search) { query += ' AND (p.name LIKE ? OR p.sku LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  query += ' ORDER BY p.warehouse_zone, p.category, p.name'
  const result = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ products: result.results })
})

// Update stock count for a product (quick count)
app.post('/api/warehouse/count', async (c) => {
  const body = await c.req.json()
  const { product_id, count_qty, zone, notes, counted_by } = body
  if (!product_id || count_qty === undefined) return c.json({ error: 'product_id and count_qty required' }, 400)
  const db = c.env.DB
  // Get current stock
  const product = await db.prepare('SELECT stock_quantity, name FROM products WHERE id = ?').bind(product_id).first() as any
  if (!product) return c.json({ error: 'Product not found' }, 404)
  const oldQty = product.stock_quantity || 0
  const diff = count_qty - oldQty
  // Update products table
  await db.prepare('UPDATE products SET stock_quantity = ? WHERE id = ?').bind(count_qty, product_id).run()
  // Record the count
  await db.prepare(
    'INSERT INTO warehouse_counts (product_id, zone, count_qty, counted_by, notes) VALUES (?,?,?,?,?)'
  ).bind(product_id, zone || 'shelf_goods', count_qty, counted_by || null, notes || null).run()
  // Log activity
  await db.prepare(
    `INSERT INTO warehouse_activity (activity_type, product_id, quantity, direction, reference_type, zone, notes, performed_by)
     VALUES ('count_update', ?, ?, ?, 'adjustment', ?, ?, ?)`
  ).bind(product_id, Math.abs(diff), diff >= 0 ? 'in' : 'out', zone || 'shelf_goods',
    `Count updated: ${oldQty} → ${count_qty}` + (notes ? ` (${notes})` : ''), counted_by || null).run()
  return c.json({ success: true, old_qty: oldQty, new_qty: count_qty, diff })
})

// Bulk update stock counts
app.post('/api/warehouse/count/bulk', async (c) => {
  const body = await c.req.json()
  const { counts, counted_by } = body // counts: [{product_id, count_qty, zone?, notes?}]
  if (!counts || !counts.length) return c.json({ error: 'counts array required' }, 400)
  const db = c.env.DB
  let updated = 0
  for (const item of counts) {
    const product = await db.prepare('SELECT stock_quantity FROM products WHERE id = ?').bind(item.product_id).first() as any
    if (!product) continue
    const oldQty = product.stock_quantity || 0
    const diff = item.count_qty - oldQty
    if (diff === 0) continue
    await db.prepare('UPDATE products SET stock_quantity = ? WHERE id = ?').bind(item.count_qty, item.product_id).run()
    await db.prepare(
      'INSERT INTO warehouse_counts (product_id, zone, count_qty, counted_by, notes) VALUES (?,?,?,?,?)'
    ).bind(item.product_id, item.zone || 'shelf_goods', item.count_qty, counted_by || null, item.notes || null).run()
    await db.prepare(
      `INSERT INTO warehouse_activity (activity_type, product_id, quantity, direction, reference_type, zone, notes, performed_by)
       VALUES ('count_update', ?, ?, ?, 'adjustment', ?, ?, ?)`
    ).bind(item.product_id, Math.abs(diff), diff >= 0 ? 'in' : 'out', item.zone || 'shelf_goods',
      `Count: ${oldQty} → ${item.count_qty}`, counted_by || null).run()
    updated++
  }
  return c.json({ success: true, updated })
})

// Set warehouse zone for a product
app.put('/api/warehouse/product/:id/zone', async (c) => {
  const id = c.req.param('id')
  const { zone } = await c.req.json()
  await c.env.DB.prepare('UPDATE products SET warehouse_zone = ? WHERE id = ?').bind(zone || 'shelf_goods', id).run()
  return c.json({ success: true })
})

// Get orders ready to load for a route
app.get('/api/warehouse/route/:id/load', async (c) => {
  const routeId = c.req.param('id')
  const db = c.env.DB
  const route = await db.prepare(
    `SELECT r.*, t.name as truck_name, u.name as driver_name
     FROM routes r LEFT JOIN trucks t ON r.truck_id = t.id LEFT JOIN users u ON r.driver_id = u.id WHERE r.id = ?`
  ).bind(routeId).first() as any
  if (!route) return c.json({ error: 'Route not found' }, 404)
  const stops = await db.prepare(
    `SELECT rs.id as stop_id, rs.order_id, rs.sequence, rs.status as stop_status, rs.loaded_at, rs.loaded_by,
     o.order_number, o.status as order_status, o.priority, o.special_instructions, c.business_name,
     a.street, a.city
     FROM route_stops rs JOIN orders o ON rs.order_id = o.id JOIN customers c ON o.customer_id = c.id
     LEFT JOIN addresses a ON o.address_id = a.id
     WHERE rs.route_id = ? ORDER BY rs.sequence`
  ).bind(routeId).all()
  // Get items for each stop
  for (const stop of stops.results as any[]) {
    const items = await db.prepare(
      `SELECT oi.quantity, p.name as product_name, p.sku, p.unit_type, p.weight_per_unit, p.pallet_qty
       FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`
    ).bind(stop.order_id).all()
    stop.items = items.results
  }
  return c.json({ route, stops: stops.results })
})

// Mark a stop as loaded
app.post('/api/warehouse/route-stop/:id/load', async (c) => {
  const stopId = c.req.param('id')
  const { loaded_by } = await c.req.json()
  const db = c.env.DB
  const stop = await db.prepare(
    'SELECT rs.*, o.order_number FROM route_stops rs JOIN orders o ON rs.order_id = o.id WHERE rs.id = ?'
  ).bind(stopId).first() as any
  if (!stop) return c.json({ error: 'Stop not found' }, 404)
  await db.prepare(
    "UPDATE route_stops SET loaded_at = datetime('now'), loaded_by = ? WHERE id = ?"
  ).bind(loaded_by || null, stopId).run()
  // Update order status to loaded
  await db.prepare("UPDATE orders SET status = 'loaded', updated_at = datetime('now') WHERE id = ? AND status IN ('new','confirmed','scheduled')")
    .bind(stop.order_id).run()
  // Log activity
  const items = await db.prepare(
    'SELECT oi.quantity, p.name as product_name, p.id as product_id FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?'
  ).bind(stop.order_id).all()
  for (const item of items.results as any[]) {
    await db.prepare(
      `INSERT INTO warehouse_activity (activity_type, product_id, quantity, direction, reference_type, reference_id, notes, performed_by)
       VALUES ('order_loaded', ?, ?, 'out', 'order', ?, ?, ?)`
    ).bind(item.product_id, item.quantity, stop.order_id, `Loaded for ${stop.order_number}`, loaded_by || null).run()
  }
  return c.json({ success: true })
})

// Mark all stops in a route as loaded
app.post('/api/warehouse/route/:id/load-all', async (c) => {
  const routeId = c.req.param('id')
  const { loaded_by } = await c.req.json()
  const db = c.env.DB
  const stops = await db.prepare(
    'SELECT rs.id, rs.order_id FROM route_stops rs WHERE rs.route_id = ? AND rs.loaded_at IS NULL'
  ).bind(routeId).all()
  for (const stop of stops.results as any[]) {
    await db.prepare("UPDATE route_stops SET loaded_at = datetime('now'), loaded_by = ? WHERE id = ?").bind(loaded_by || null, stop.id).run()
    await db.prepare("UPDATE orders SET status = 'loaded', updated_at = datetime('now') WHERE id = ? AND status IN ('new','confirmed','scheduled')").bind(stop.order_id).run()
  }
  // Log activity
  await db.prepare(
    `INSERT INTO warehouse_activity (activity_type, quantity, direction, reference_type, reference_id, notes, performed_by)
     VALUES ('order_loaded', ?, 'out', 'route', ?, ?, ?)`
  ).bind(stops.results.length, routeId, `Loaded all ${stops.results.length} stops for route`, loaded_by || null).run()
  return c.json({ success: true, loaded: stops.results.length })
})

// Warehouse activity log
app.get('/api/warehouse/activity', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50')
  const type = c.req.query('type')
  let query = `SELECT wa.*, p.name as product_name, p.sku, u.name as performed_by_name
    FROM warehouse_activity wa LEFT JOIN products p ON wa.product_id = p.id LEFT JOIN users u ON wa.performed_by = u.id`
  const params: any[] = []
  if (type) { query += ' WHERE wa.activity_type = ?'; params.push(type) }
  query += ' ORDER BY wa.created_at DESC LIMIT ?'
  params.push(limit)
  const result = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ activity: result.results })
})

// Receive inbound stock (manual — no PO link)
app.post('/api/warehouse/receive-stock', async (c) => {
  const body = await c.req.json()
  const { items, received_by, notes } = body // items: [{product_id, quantity}]
  if (!items || !items.length) return c.json({ error: 'items array required' }, 400)
  const db = c.env.DB
  for (const item of items) {
    await db.prepare('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?').bind(item.quantity, item.product_id).run()
    await db.prepare(
      `INSERT INTO warehouse_activity (activity_type, product_id, quantity, direction, reference_type, notes, performed_by)
       VALUES ('order_received', ?, ?, 'in', 'adjustment', ?, ?)`
    ).bind(item.product_id, item.quantity, notes || 'Inbound stock received', received_by || null).run()
  }
  return c.json({ success: true, received: items.length })
})

// ==================== PO-LINKED WAREHOUSE RECEIVING ====================

// Get receivable POs (ordered / in_transit / partial) for warehouse Receive tab
app.get('/api/warehouse/pending-pos', async (c) => {
  const db = c.env.DB
  const result = await db.prepare(`
    SELECT po.id, po.po_number, po.status, po.order_type, po.expected_date, po.supplier_id,
      s.name as supplier_name,
      (SELECT COUNT(*) FROM po_items WHERE po_id = po.id) as item_count,
      (SELECT COALESCE(SUM(qty_ordered),0) FROM po_items WHERE po_id = po.id) as total_ordered,
      (SELECT COALESCE(SUM(qty_received),0) FROM po_items WHERE po_id = po.id) as total_received
    FROM purchase_orders po
    LEFT JOIN suppliers s ON po.supplier_id = s.id
    WHERE po.status IN ('ordered','in_transit','partial','delayed')
    ORDER BY CASE po.status WHEN 'in_transit' THEN 1 WHEN 'partial' THEN 2 WHEN 'delayed' THEN 3 ELSE 4 END,
      po.expected_date ASC`).all()
  return c.json({ pos: result.results || [] })
})

// Get PO items for warehouse receiving (shows remaining qty to receive)
app.get('/api/warehouse/po/:id/items', async (c) => {
  const db = c.env.DB
  const poId = parseInt(c.req.param('id'))
  const po = await db.prepare(`
    SELECT po.*, s.name as supplier_name
    FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id
    WHERE po.id = ?`).bind(poId).first() as any
  if (!po) return c.json({ error: 'PO not found' }, 404)

  const items = await db.prepare(`
    SELECT pi.id as po_item_id, pi.product_id, pi.description, pi.qty_ordered, pi.qty_received,
      pi.unit, pi.unit_cost, (pi.qty_ordered - pi.qty_received) as qty_remaining,
      p.name as product_name, p.sku, p.stock_quantity, p.warehouse_zone, p.unit_type
    FROM po_items pi LEFT JOIN products p ON pi.product_id = p.id
    WHERE pi.po_id = ? ORDER BY pi.id`).bind(poId).all()

  return c.json({ po, items: items.results || [] })
})

// Receive PO items through warehouse — updates stock, po_items, warehouse_activity, and PO status
app.post('/api/warehouse/po/:id/receive', async (c) => {
  const db = c.env.DB
  const poId = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { items, received_by, notes } = body
  // items: [{ po_item_id, product_id, qty_received, condition }]
  if (!items || !items.length) return c.json({ error: 'items array required' }, 400)

  const po = await db.prepare('SELECT * FROM purchase_orders WHERE id = ?').bind(poId).first() as any
  if (!po) return c.json({ error: 'PO not found' }, 404)

  // Create a po_receiving record (leverages existing purchasing schema)
  const recvResult = await db.prepare(
    `INSERT INTO po_receiving (po_id, received_by, received_by_name, notes, location_id) VALUES (?,?,?,?,?)`
  ).bind(poId, received_by || null, 'warehouse', notes || null, po.location_id).run()
  const receivingId = recvResult.meta.last_row_id

  let totalReceived = 0
  for (const item of items) {
    if (!item.po_item_id || !item.qty_received || item.qty_received <= 0) continue
    const condition = item.condition || 'good'

    // Insert po_receiving_items
    await db.prepare(
      `INSERT INTO po_receiving_items (receiving_id, po_item_id, product_id, qty_received, condition, notes)
       VALUES (?,?,?,?,?,?)`
    ).bind(receivingId, item.po_item_id, item.product_id || null, item.qty_received, condition, item.notes || null).run()

    // Update cumulative qty_received on po_items
    await db.prepare('UPDATE po_items SET qty_received = qty_received + ? WHERE id = ?')
      .bind(item.qty_received, item.po_item_id).run()

    // Update product stock_quantity (only for non-rejected items)
    if (item.product_id && condition !== 'rejected') {
      await db.prepare('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?')
        .bind(item.qty_received, item.product_id).run()
    }

    // Log warehouse activity with PO link
    await db.prepare(
      `INSERT INTO warehouse_activity (activity_type, product_id, quantity, direction, reference_type, reference_id, zone, notes, performed_by, po_id)
       VALUES ('order_received', ?, ?, 'in', 'purchase_order', ?, ?, ?, ?, ?)`
    ).bind(item.product_id || null, item.qty_received, poId,
      item.warehouse_zone || null, `PO ${po.po_number} received` + (condition !== 'good' ? ` (${condition})` : ''),
      received_by || null, poId).run()

    totalReceived += item.qty_received
  }

  // Auto-update PO status based on remaining quantities
  const poItems = await db.prepare('SELECT qty_ordered, qty_received FROM po_items WHERE po_id = ?').bind(poId).all()
  const allReceived = (poItems.results || []).every((i: any) => i.qty_received >= i.qty_ordered)
  const anyReceived = (poItems.results || []).some((i: any) => i.qty_received > 0)
  let newStatus = po.status
  if (allReceived) newStatus = 'received'
  else if (anyReceived) newStatus = 'partial'

  if (newStatus !== po.status) {
    await db.prepare(`UPDATE purchase_orders SET status = ?,
      received_date = CASE WHEN ? = 'received' THEN date('now') ELSE received_date END,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(newStatus, newStatus, poId).run()
  }

  return c.json({ success: true, receiving_id: receivingId, total_received: totalReceived, new_status: newStatus })
})

// ==================== LOW STOCK ALERTS & THRESHOLDS ====================

// Get low stock alerts — products where stock_quantity <= low_stock_threshold (and threshold > 0)
app.get('/api/warehouse/alerts', async (c) => {
  const db = c.env.DB
  const zone = c.req.query('zone')
  let query = `SELECT p.id, p.name, p.sku, p.category, p.unit_type, p.stock_quantity, p.warehouse_zone,
    p.low_stock_threshold, p.reorder_point, p.cost, p.price
    FROM products p WHERE p.active = 1 AND p.low_stock_threshold > 0 AND p.stock_quantity <= p.low_stock_threshold`
  const params: any[] = []
  if (zone && zone !== 'all') { query += ' AND p.warehouse_zone = ?'; params.push(zone) }
  query += ' ORDER BY (p.stock_quantity - p.low_stock_threshold) ASC, p.warehouse_zone, p.name'
  const result = await db.prepare(query).bind(...params).all()

  // Also get products at or below reorder_point (need reorder soon)
  let reorderQuery = `SELECT p.id, p.name, p.sku, p.category, p.unit_type, p.stock_quantity, p.warehouse_zone,
    p.low_stock_threshold, p.reorder_point, p.cost, p.price
    FROM products p WHERE p.active = 1 AND p.reorder_point > 0 AND p.stock_quantity <= p.reorder_point`
  const reorderParams: any[] = []
  if (zone && zone !== 'all') { reorderQuery += ' AND p.warehouse_zone = ?'; reorderParams.push(zone) }
  reorderQuery += ' ORDER BY (p.stock_quantity - p.reorder_point) ASC, p.name'
  const reorderResult = await db.prepare(reorderQuery).bind(...reorderParams).all()

  return c.json({
    low_stock: result.results || [],
    needs_reorder: reorderResult.results || [],
  })
})

// Update thresholds for a single product
app.put('/api/warehouse/product/:id/thresholds', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const { low_stock_threshold, reorder_point } = await c.req.json()
  await db.prepare('UPDATE products SET low_stock_threshold = ?, reorder_point = ? WHERE id = ?')
    .bind(low_stock_threshold ?? 0, reorder_point ?? 0, id).run()
  return c.json({ success: true })
})

// Bulk update thresholds (set same threshold for all products in a zone or category)
app.post('/api/warehouse/thresholds/bulk', async (c) => {
  const db = c.env.DB
  const { zone, category, low_stock_threshold, reorder_point } = await c.req.json()
  let query = 'UPDATE products SET '
  const sets: string[] = []
  const params: any[] = []
  if (low_stock_threshold !== undefined) { sets.push('low_stock_threshold = ?'); params.push(low_stock_threshold) }
  if (reorder_point !== undefined) { sets.push('reorder_point = ?'); params.push(reorder_point) }
  if (sets.length === 0) return c.json({ error: 'No thresholds provided' }, 400)
  query += sets.join(', ') + ' WHERE active = 1'
  if (zone) { query += ' AND warehouse_zone = ?'; params.push(zone) }
  if (category) { query += ' AND category = ?'; params.push(category) }
  const result = await db.prepare(query).bind(...params).run()
  return c.json({ success: true, updated: result.meta.changes || 0 })
})

// HTML serving is handled by the parent shell — not this module
export default app
export { app as logisticsApp }
