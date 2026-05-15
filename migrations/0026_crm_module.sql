-- Migration 0026: CRM module — mirrors Insightly data model
-- Core entities: Organizations, Contacts, Opportunities (with pipeline stages), Activities

-- ==================== ORGANIZATIONS (companies / barns / farms) ====================
CREATE TABLE IF NOT EXISTS crm_organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  website TEXT,
  address_street TEXT,
  address_city TEXT,
  address_state TEXT DEFAULT 'FL',
  address_zip TEXT,
  industry TEXT DEFAULT 'equestrian',
  org_type TEXT DEFAULT 'prospect' CHECK(org_type IN ('prospect','customer','vendor','partner','other')),
  source TEXT,
  tags TEXT,
  notes TEXT,
  customer_id INTEGER REFERENCES customers(id),
  owner_id INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_crm_org_type ON crm_organizations(org_type);
CREATE INDEX IF NOT EXISTS idx_crm_org_customer ON crm_organizations(customer_id);

-- ==================== CONTACTS (people linked to organizations) ====================
CREATE TABLE IF NOT EXISTS crm_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  title TEXT,
  phone TEXT,
  mobile TEXT,
  email TEXT,
  organization_id INTEGER REFERENCES crm_organizations(id),
  is_primary INTEGER DEFAULT 0,
  lead_source TEXT,
  lead_status TEXT DEFAULT 'new' CHECK(lead_status IN ('new','contacted','qualified','unqualified','converted','lost')),
  tags TEXT,
  notes TEXT,
  customer_id INTEGER REFERENCES customers(id),
  owner_id INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_crm_contact_org ON crm_contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_contact_status ON crm_contacts(lead_status);
CREATE INDEX IF NOT EXISTS idx_crm_contact_customer ON crm_contacts(customer_id);

-- ==================== PIPELINES & STAGES ====================
CREATE TABLE IF NOT EXISTS crm_pipelines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pipeline_id INTEGER NOT NULL REFERENCES crm_pipelines(id),
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  win_probability INTEGER DEFAULT 0,
  stage_type TEXT DEFAULT 'open' CHECK(stage_type IN ('open','won','lost')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_crm_stage_pipeline ON crm_pipeline_stages(pipeline_id);

-- ==================== OPPORTUNITIES (deals) ====================
CREATE TABLE IF NOT EXISTS crm_opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  organization_id INTEGER REFERENCES crm_organizations(id),
  contact_id INTEGER REFERENCES crm_contacts(id),
  pipeline_id INTEGER REFERENCES crm_pipelines(id),
  stage_id INTEGER REFERENCES crm_pipeline_stages(id),
  value REAL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  close_date TEXT,
  probability INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK(status IN ('open','won','lost','abandoned')),
  source TEXT,
  tags TEXT,
  notes TEXT,
  customer_id INTEGER REFERENCES customers(id),
  owner_id INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id),
  won_at TEXT,
  lost_reason TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_crm_opp_org ON crm_opportunities(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_opp_contact ON crm_opportunities(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_opp_stage ON crm_opportunities(stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_opp_status ON crm_opportunities(status);

-- ==================== ACTIVITIES (notes, calls, emails, tasks) ====================
CREATE TABLE IF NOT EXISTS crm_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_type TEXT NOT NULL CHECK(activity_type IN ('note','call','email','meeting','task')),
  subject TEXT,
  body TEXT,
  due_date TEXT,
  completed INTEGER DEFAULT 0,
  completed_at TEXT,
  -- Polymorphic link: can attach to contact, org, or opportunity
  contact_id INTEGER REFERENCES crm_contacts(id),
  organization_id INTEGER REFERENCES crm_organizations(id),
  opportunity_id INTEGER REFERENCES crm_opportunities(id),
  owner_id INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_crm_act_contact ON crm_activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_act_org ON crm_activities(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_act_opp ON crm_activities(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_crm_act_type ON crm_activities(activity_type);

-- ==================== SEED DEFAULT PIPELINE ====================
INSERT INTO crm_pipelines (name, is_default) VALUES ('Sales Pipeline', 1);

INSERT INTO crm_pipeline_stages (pipeline_id, name, sort_order, win_probability, stage_type) VALUES
  (1, 'Lead In', 1, 10, 'open'),
  (1, 'Contacted', 2, 20, 'open'),
  (1, 'Qualified', 3, 40, 'open'),
  (1, 'Proposal Sent', 4, 60, 'open'),
  (1, 'Negotiation', 5, 80, 'open'),
  (1, 'Won', 6, 100, 'won'),
  (1, 'Lost', 7, 0, 'lost');
