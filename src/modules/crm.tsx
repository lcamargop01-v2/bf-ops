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

// ==================== USERS (for sales rep dropdown) ====================

app.get('/api/crm/users', async (c) => {
  const db = c.env.DB
  const users = await db.prepare('SELECT id, name, email, role FROM users WHERE active = 1 ORDER BY name').all()
  return c.json({ users: users.results || [] })
})

// ==================== PIPELINE & STAGES ====================

app.get('/api/crm/pipelines', async (c) => {
  const db = c.env.DB
  const pipelines = await db.prepare('SELECT * FROM crm_pipelines ORDER BY id').all()
  const stages = await db.prepare('SELECT * FROM crm_pipeline_stages ORDER BY pipeline_id, sort_order').all()

  const result = (pipelines.results || []).map((p: any) => ({
    ...p,
    stages: (stages.results || []).filter((s: any) => s.pipeline_id === p.id)
  }))

  return c.json({ pipelines: result })
})

// ==================== DASHBOARD / SUMMARY ====================

app.get('/api/crm/dashboard', async (c) => {
  const db = c.env.DB
  const user = getUserFromHeader(c)

  const [contacts, orgs, oppOpen, oppWon, oppLost, activities, recentOpps, upcomingTasks, stageBreakdown] = await Promise.all([
    db.prepare("SELECT COUNT(*) as cnt FROM crm_contacts").first(),
    db.prepare("SELECT COUNT(*) as cnt FROM crm_organizations").first(),
    db.prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(value),0) as total FROM crm_opportunities WHERE status='open'").first(),
    db.prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(value),0) as total FROM crm_opportunities WHERE status='won'").first(),
    db.prepare("SELECT COUNT(*) as cnt FROM crm_opportunities WHERE status='lost'").first(),
    db.prepare("SELECT COUNT(*) as cnt FROM crm_activities WHERE completed=0").first(),
    db.prepare(`SELECT o.*, s.name as stage_name, org.name as org_name, c.first_name || ' ' || COALESCE(c.last_name,'') as contact_name
      FROM crm_opportunities o
      LEFT JOIN crm_pipeline_stages s ON o.stage_id = s.id
      LEFT JOIN crm_organizations org ON o.organization_id = org.id
      LEFT JOIN crm_contacts c ON o.contact_id = c.id
      WHERE o.status='open' ORDER BY o.updated_at DESC LIMIT 10`).all(),
    db.prepare(`SELECT a.*, c.first_name || ' ' || COALESCE(c.last_name,'') as contact_name, org.name as org_name
      FROM crm_activities a
      LEFT JOIN crm_contacts c ON a.contact_id = c.id
      LEFT JOIN crm_organizations org ON a.organization_id = org.id
      WHERE a.completed=0 AND a.due_date IS NOT NULL
      ORDER BY a.due_date ASC LIMIT 10`).all(),
    db.prepare(`SELECT s.id, s.name, s.sort_order, s.stage_type, COUNT(o.id) as opp_count, COALESCE(SUM(o.value),0) as opp_value
      FROM crm_pipeline_stages s
      LEFT JOIN crm_opportunities o ON o.stage_id = s.id AND o.status = 'open'
      WHERE s.pipeline_id = 1
      GROUP BY s.id ORDER BY s.sort_order`).all()
  ]) as any[]

  return c.json({
    summary: {
      contacts: contacts?.cnt || 0,
      organizations: orgs?.cnt || 0,
      open_opportunities: oppOpen?.cnt || 0,
      open_value: oppOpen?.total || 0,
      won_opportunities: oppWon?.cnt || 0,
      won_value: oppWon?.total || 0,
      lost_opportunities: oppLost?.cnt || 0,
      pending_activities: activities?.cnt || 0
    },
    recent_opportunities: recentOpps.results || [],
    upcoming_tasks: upcomingTasks.results || [],
    pipeline_stages: stageBreakdown.results || []
  })
})

// ==================== ORGANIZATIONS ====================

app.get('/api/crm/organizations', async (c) => {
  const db = c.env.DB
  const search = c.req.query('search')
  const type = c.req.query('type')
  const limit = parseInt(c.req.query('limit') || '50')
  const offset = parseInt(c.req.query('offset') || '0')

  let q = `SELECT o.*, u.name as owner_name,
    (SELECT COUNT(*) FROM crm_contacts WHERE organization_id = o.id) as contact_count,
    (SELECT COUNT(*) FROM crm_opportunities WHERE organization_id = o.id AND status = 'open') as open_opps
    FROM crm_organizations o
    LEFT JOIN users u ON o.owner_id = u.id WHERE 1=1`
  const binds: any[] = []

  if (search) { q += ' AND (o.name LIKE ? OR o.email LIKE ? OR o.phone LIKE ?)'; binds.push(`%${search}%`, `%${search}%`, `%${search}%`) }
  if (type) { q += ' AND o.org_type = ?'; binds.push(type) }

  const countQ = q.replace(/SELECT o\.\*.*FROM/, 'SELECT COUNT(*) as total FROM')
  const countR = await db.prepare(countQ).bind(...binds).first() as any

  q += ' ORDER BY o.updated_at DESC LIMIT ? OFFSET ?'
  binds.push(limit, offset)

  const orgs = await db.prepare(q).bind(...binds).all()
  return c.json({ organizations: orgs.results || [], total: countR?.total || 0 })
})

app.get('/api/crm/organizations/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const org = await db.prepare('SELECT o.*, u.name as owner_name FROM crm_organizations o LEFT JOIN users u ON o.owner_id = u.id WHERE o.id = ?').bind(id).first()
  if (!org) return c.json({ error: 'Organization not found' }, 404)

  const contacts = await db.prepare('SELECT * FROM crm_contacts WHERE organization_id = ? ORDER BY is_primary DESC, first_name').bind(id).all()
  const opps = await db.prepare(`SELECT o.*, s.name as stage_name FROM crm_opportunities o LEFT JOIN crm_pipeline_stages s ON o.stage_id = s.id WHERE o.organization_id = ? ORDER BY o.updated_at DESC`).bind(id).all()
  const activities = await db.prepare(`SELECT a.*, u.name as owner_name FROM crm_activities a LEFT JOIN users u ON a.owner_id = u.id WHERE a.organization_id = ? ORDER BY a.created_at DESC LIMIT 20`).bind(id).all()

  return c.json({ organization: org, contacts: contacts.results || [], opportunities: opps.results || [], activities: activities.results || [] })
})

app.post('/api/crm/organizations', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const b = await c.req.json()

  const result = await db.prepare(
    `INSERT INTO crm_organizations (name, phone, email, website, address_street, address_city, address_state, address_zip, industry, org_type, source, tags, notes, owner_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(b.name, b.phone || null, b.email || null, b.website || null, b.address_street || null, b.address_city || null, b.address_state || 'FL', b.address_zip || null,
    b.industry || 'equestrian', b.org_type || 'prospect', b.source || null, b.tags || null, b.notes || null, b.owner_id || user.id, user.id).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

app.put('/api/crm/organizations/:id', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const b = await c.req.json()

  const fields = ['name', 'phone', 'email', 'website', 'address_street', 'address_city', 'address_state', 'address_zip', 'industry', 'org_type', 'source', 'tags', 'notes', 'owner_id', 'customer_id']
  const sets: string[] = []
  const vals: any[] = []
  for (const f of fields) { if (b[f] !== undefined) { sets.push(`${f} = ?`); vals.push(b[f]) } }
  if (!sets.length) return c.json({ error: 'No fields' }, 400)
  sets.push('updated_at = CURRENT_TIMESTAMP')
  vals.push(id)

  await db.prepare(`UPDATE crm_organizations SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run()
  return c.json({ success: true })
})

// ==================== CONTACTS ====================

app.get('/api/crm/contacts', async (c) => {
  const db = c.env.DB
  const search = c.req.query('search')
  const status = c.req.query('status')
  const org_id = c.req.query('organization_id')
  const limit = parseInt(c.req.query('limit') || '50')
  const offset = parseInt(c.req.query('offset') || '0')

  let q = `SELECT c.*, o.name as organization_name, u.name as owner_name
    FROM crm_contacts c
    LEFT JOIN crm_organizations o ON c.organization_id = o.id
    LEFT JOIN users u ON c.owner_id = u.id WHERE 1=1`
  const binds: any[] = []

  if (search) { q += ' AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)'; binds.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`) }
  if (status) { q += ' AND c.lead_status = ?'; binds.push(status) }
  if (org_id) { q += ' AND c.organization_id = ?'; binds.push(parseInt(org_id)) }

  const countQ = q.replace(/SELECT c\.\*.*FROM/, 'SELECT COUNT(*) as total FROM')
  const countR = await db.prepare(countQ).bind(...binds).first() as any

  q += ' ORDER BY c.updated_at DESC LIMIT ? OFFSET ?'
  binds.push(limit, offset)

  const contacts = await db.prepare(q).bind(...binds).all()
  return c.json({ contacts: contacts.results || [], total: countR?.total || 0 })
})

// Export contacts (all or filtered) — returns all matching records without pagination
app.get('/api/crm/contacts/export', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const search = c.req.query('search')
  const status = c.req.query('status')
  const org_id = c.req.query('organization_id')

  let q = `SELECT c.first_name, c.last_name, c.title, c.phone, c.mobile, c.email,
    c.lead_source, c.lead_status, c.tags, c.notes,
    o.name as organization_name, o.org_type as organization_type, o.phone as organization_phone,
    o.address_street, o.address_city, o.address_state, o.address_zip,
    u.name as owner_name, c.created_at, c.updated_at
    FROM crm_contacts c
    LEFT JOIN crm_organizations o ON c.organization_id = o.id
    LEFT JOIN users u ON c.owner_id = u.id WHERE 1=1`
  const binds: any[] = []

  if (search) { q += ' AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)'; binds.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`) }
  if (status) { q += ' AND c.lead_status = ?'; binds.push(status) }
  if (org_id) { q += ' AND c.organization_id = ?'; binds.push(parseInt(org_id)) }

  q += ' ORDER BY c.last_name ASC, c.first_name ASC'

  const contacts = await db.prepare(q).bind(...binds).all()
  return c.json({ contacts: contacts.results || [] })
})

app.get('/api/crm/contacts/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const contact = await db.prepare(`SELECT c.*, o.name as organization_name FROM crm_contacts c LEFT JOIN crm_organizations o ON c.organization_id = o.id WHERE c.id = ?`).bind(id).first()
  if (!contact) return c.json({ error: 'Contact not found' }, 404)

  const opps = await db.prepare(`SELECT o.*, s.name as stage_name FROM crm_opportunities o LEFT JOIN crm_pipeline_stages s ON o.stage_id = s.id WHERE o.contact_id = ? ORDER BY o.updated_at DESC`).bind(id).all()
  const activities = await db.prepare(`SELECT a.*, u.name as owner_name FROM crm_activities a LEFT JOIN users u ON a.owner_id = u.id WHERE a.contact_id = ? ORDER BY a.created_at DESC LIMIT 20`).bind(id).all()

  return c.json({ contact, opportunities: opps.results || [], activities: activities.results || [] })
})

app.post('/api/crm/contacts', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const b = await c.req.json()

  const result = await db.prepare(
    `INSERT INTO crm_contacts (first_name, last_name, title, phone, mobile, email, organization_id, is_primary, lead_source, lead_status, tags, notes, owner_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(b.first_name, b.last_name || null, b.title || null, b.phone || null, b.mobile || null, b.email || null,
    b.organization_id || null, b.is_primary || 0, b.lead_source || null, b.lead_status || 'new', b.tags || null, b.notes || null, b.owner_id || user.id, user.id).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

app.put('/api/crm/contacts/:id', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const b = await c.req.json()

  const fields = ['first_name', 'last_name', 'title', 'phone', 'mobile', 'email', 'organization_id', 'is_primary', 'lead_source', 'lead_status', 'tags', 'notes', 'owner_id', 'customer_id']
  const sets: string[] = []
  const vals: any[] = []
  for (const f of fields) { if (b[f] !== undefined) { sets.push(`${f} = ?`); vals.push(b[f]) } }
  if (!sets.length) return c.json({ error: 'No fields' }, 400)
  sets.push('updated_at = CURRENT_TIMESTAMP')
  vals.push(id)

  await db.prepare(`UPDATE crm_contacts SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run()
  return c.json({ success: true })
})

// ==================== OPPORTUNITIES ====================

app.get('/api/crm/opportunities', async (c) => {
  const db = c.env.DB
  const status = c.req.query('status') || 'open'
  const pipeline_id = c.req.query('pipeline_id') || '1'
  const search = c.req.query('search')

  let q = `SELECT o.*, s.name as stage_name, s.sort_order, s.stage_type, s.win_probability,
    org.name as org_name, org.phone as org_phone,
    c.first_name || ' ' || COALESCE(c.last_name,'') as contact_name,
    c.phone as contact_phone, c.email as contact_email,
    u.name as owner_name
    FROM crm_opportunities o
    LEFT JOIN crm_pipeline_stages s ON o.stage_id = s.id
    LEFT JOIN crm_organizations org ON o.organization_id = org.id
    LEFT JOIN crm_contacts c ON o.contact_id = c.id
    LEFT JOIN users u ON o.owner_id = u.id
    WHERE o.pipeline_id = ?`
  const binds: any[] = [parseInt(pipeline_id)]

  if (status && status !== 'all') { q += ' AND o.status = ?'; binds.push(status) }
  if (search) { q += ' AND (o.name LIKE ? OR org.name LIKE ?)'; binds.push(`%${search}%`, `%${search}%`) }
  q += ' ORDER BY s.sort_order ASC, o.updated_at DESC'

  const opps = await db.prepare(q).bind(...binds).all()
  return c.json({ opportunities: opps.results || [] })
})

app.get('/api/crm/opportunities/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const opp = await db.prepare(`SELECT o.*, s.name as stage_name, org.name as org_name, c.first_name || ' ' || COALESCE(c.last_name,'') as contact_name, u.name as owner_name
    FROM crm_opportunities o LEFT JOIN crm_pipeline_stages s ON o.stage_id = s.id LEFT JOIN crm_organizations org ON o.organization_id = org.id LEFT JOIN crm_contacts c ON o.contact_id = c.id LEFT JOIN users u ON o.owner_id = u.id WHERE o.id = ?`).bind(id).first()
  if (!opp) return c.json({ error: 'Opportunity not found' }, 404)

  const activities = await db.prepare(`SELECT a.*, u.name as owner_name FROM crm_activities a LEFT JOIN users u ON a.owner_id = u.id WHERE a.opportunity_id = ? ORDER BY a.created_at DESC`).bind(id).all()

  return c.json({ opportunity: opp, activities: activities.results || [] })
})

app.post('/api/crm/opportunities', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const b = await c.req.json()

  // Default to first open stage of pipeline
  let stage_id = b.stage_id
  if (!stage_id && b.pipeline_id) {
    const first = await db.prepare("SELECT id FROM crm_pipeline_stages WHERE pipeline_id = ? AND stage_type = 'open' ORDER BY sort_order LIMIT 1").bind(b.pipeline_id).first() as any
    stage_id = first?.id
  }

  const result = await db.prepare(
    `INSERT INTO crm_opportunities (name, organization_id, contact_id, pipeline_id, stage_id, value, close_date, probability, status, source, tags, notes, owner_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`
  ).bind(b.name, b.organization_id || null, b.contact_id || null, b.pipeline_id || 1, stage_id || null,
    b.value || 0, b.close_date || null, b.probability || 0, b.source || null, b.tags || null, b.notes || null, b.owner_id || user.id, user.id).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

app.put('/api/crm/opportunities/:id', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const b = await c.req.json()

  const fields = ['name', 'organization_id', 'contact_id', 'stage_id', 'value', 'close_date', 'probability', 'status', 'source', 'tags', 'notes', 'owner_id', 'lost_reason', 'customer_id']
  const sets: string[] = []
  const vals: any[] = []
  for (const f of fields) { if (b[f] !== undefined) { sets.push(`${f} = ?`); vals.push(b[f]) } }

  // Handle won/lost status changes
  if (b.status === 'won' && !b.won_at) { sets.push('won_at = CURRENT_TIMESTAMP') }
  if (!sets.length) return c.json({ error: 'No fields' }, 400)
  sets.push('updated_at = CURRENT_TIMESTAMP')
  vals.push(id)

  await db.prepare(`UPDATE crm_opportunities SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run()
  return c.json({ success: true })
})

// Move opportunity to a stage (drag-and-drop on pipeline board)
app.post('/api/crm/opportunities/:id/move', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const { stage_id } = await c.req.json()

  const stage = await db.prepare('SELECT * FROM crm_pipeline_stages WHERE id = ?').bind(stage_id).first() as any
  if (!stage) return c.json({ error: 'Stage not found' }, 404)

  const updates: any = { stage_id, probability: stage.win_probability, updated_at: 'CURRENT_TIMESTAMP' }
  let status = 'open'
  if (stage.stage_type === 'won') status = 'won'
  else if (stage.stage_type === 'lost') status = 'lost'

  await db.prepare(`UPDATE crm_opportunities SET stage_id = ?, probability = ?, status = ?, updated_at = CURRENT_TIMESTAMP ${status === 'won' ? ", won_at = CURRENT_TIMESTAMP" : ''} WHERE id = ?`)
    .bind(stage_id, stage.win_probability, status, id).run()

  return c.json({ success: true, status, stage_name: stage.name })
})

// Convert opportunity to customer (creates customer record, links to POS)
app.post('/api/crm/opportunities/:id/convert', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const b = await c.req.json()

  const opp = await db.prepare(`SELECT o.*, org.name as org_name, org.phone as org_phone, org.email as org_email, org.address_street, org.address_city, org.address_state, org.address_zip,
    c.first_name, c.last_name, c.phone as contact_phone, c.email as contact_email
    FROM crm_opportunities o
    LEFT JOIN crm_organizations org ON o.organization_id = org.id
    LEFT JOIN crm_contacts c ON o.contact_id = c.id
    WHERE o.id = ?`).bind(id).first() as any
  if (!opp) return c.json({ error: 'Opportunity not found' }, 404)

  // Create customer record from org/contact data
  const bizName = b.business_name || opp.org_name || `${opp.first_name || ''} ${opp.last_name || ''}`.trim() || opp.name
  const contactName = `${opp.first_name || ''} ${opp.last_name || ''}`.trim() || null
  const phone = opp.contact_phone || opp.org_phone || null
  const email = opp.contact_email || opp.org_email || null
  const custType = b.customer_type || 'equestrian'

  const custResult = await db.prepare(
    `INSERT INTO customers (business_name, contact_name, phone, email, customer_type, notes, active, location_id)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
  ).bind(bizName, contactName, phone, email, custType, `Converted from CRM opportunity: ${opp.name}`, b.location_id || null).run()

  const customerId = custResult.meta.last_row_id

  // Create address if org has one
  if (opp.address_street) {
    await db.prepare(
      `INSERT INTO addresses (customer_id, label, street, city, state, zip, is_primary)
       VALUES (?, 'Primary', ?, ?, ?, ?, 1)`
    ).bind(customerId, opp.address_street, opp.address_city || '', opp.address_state || 'FL', opp.address_zip || '').run()
  }

  // Link CRM records to the new customer
  await db.prepare('UPDATE crm_opportunities SET customer_id = ?, status = ?, won_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(customerId, 'won', id).run()

  // Move to Won stage
  const wonStage = await db.prepare("SELECT id FROM crm_pipeline_stages WHERE pipeline_id = ? AND stage_type = 'won' LIMIT 1").bind(opp.pipeline_id || 1).first() as any
  if (wonStage) {
    await db.prepare('UPDATE crm_opportunities SET stage_id = ?, probability = 100 WHERE id = ?').bind(wonStage.id, id).run()
  }

  if (opp.organization_id) {
    await db.prepare('UPDATE crm_organizations SET customer_id = ?, org_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(customerId, 'customer', opp.organization_id).run()
  }
  if (opp.contact_id) {
    await db.prepare('UPDATE crm_contacts SET customer_id = ?, lead_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(customerId, 'converted', opp.contact_id).run()
  }

  return c.json({ success: true, customer_id: customerId, business_name: bizName })
})

// ==================== ACTIVITIES ====================

app.get('/api/crm/activities', async (c) => {
  const db = c.env.DB
  const type = c.req.query('type')
  const contact_id = c.req.query('contact_id')
  const org_id = c.req.query('organization_id')
  const opp_id = c.req.query('opportunity_id')
  const pending = c.req.query('pending') === '1'

  let q = `SELECT a.*, u.name as owner_name, c.first_name || ' ' || COALESCE(c.last_name,'') as contact_name, org.name as org_name, opp.name as opp_name
    FROM crm_activities a
    LEFT JOIN users u ON a.owner_id = u.id
    LEFT JOIN crm_contacts c ON a.contact_id = c.id
    LEFT JOIN crm_organizations org ON a.organization_id = org.id
    LEFT JOIN crm_opportunities opp ON a.opportunity_id = opp.id WHERE 1=1`
  const binds: any[] = []

  if (type) { q += ' AND a.activity_type = ?'; binds.push(type) }
  if (contact_id) { q += ' AND a.contact_id = ?'; binds.push(parseInt(contact_id)) }
  if (org_id) { q += ' AND a.organization_id = ?'; binds.push(parseInt(org_id)) }
  if (opp_id) { q += ' AND a.opportunity_id = ?'; binds.push(parseInt(opp_id)) }
  if (pending) { q += ' AND a.completed = 0' }
  q += ' ORDER BY a.created_at DESC LIMIT 100'

  const activities = await db.prepare(q).bind(...binds).all()
  return c.json({ activities: activities.results || [] })
})

app.post('/api/crm/activities', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const b = await c.req.json()

  const result = await db.prepare(
    `INSERT INTO crm_activities (activity_type, subject, body, due_date, contact_id, organization_id, opportunity_id, owner_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(b.activity_type || 'note', b.subject || null, b.body || null, b.due_date || null,
    b.contact_id || null, b.organization_id || null, b.opportunity_id || null, b.owner_id || user.id, user.id).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

app.put('/api/crm/activities/:id', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const b = await c.req.json()

  const fields = ['activity_type', 'subject', 'body', 'due_date', 'completed', 'contact_id', 'organization_id', 'opportunity_id', 'owner_id']
  const sets: string[] = []
  const vals: any[] = []
  for (const f of fields) { if (b[f] !== undefined) { sets.push(`${f} = ?`); vals.push(b[f]) } }
  if (b.completed === 1) { sets.push('completed_at = CURRENT_TIMESTAMP') }
  if (!sets.length) return c.json({ error: 'No fields' }, 400)
  sets.push('updated_at = CURRENT_TIMESTAMP')
  vals.push(id)

  await db.prepare(`UPDATE crm_activities SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run()
  return c.json({ success: true })
})

app.delete('/api/crm/activities/:id', async (c) => {
  const user = getUserFromHeader(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  await db.prepare('DELETE FROM crm_activities WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

export default app
export { app as crmApp }
