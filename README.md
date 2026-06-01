# BF-Ops

Internal operations platform for BF Deliver. Built on Cloudflare Pages with Hono + D1 SQLite.

## URLs

- **Production**: https://bf-ops.pages.dev
- **GitHub**: https://github.com/lcamargop01-v2/bf-ops

## Modules

### Inventory (`/inventory`)
Product catalog, stock tracking, quick counts, and category management.

**Key Endpoints:**
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/inventory/products` | No | List products (paginated, filterable by category/search/active) |
| GET | `/api/inventory/products/categories` | No | Get distinct category list |
| GET | `/api/inventory/products/recategorize-preview` | Yes | Preview AI category consolidation for all products |
| POST | `/api/inventory/products/recategorize-apply` | Admin | Apply bulk category update with optional per-product overrides |
| GET | `/api/inventory/products/:id` | No | Single product detail |
| PUT | `/api/inventory/products/:id` | Yes | Update product |
| POST | `/api/inventory/products` | Yes | Create product |

**Category Consolidation (Categories Tab):**
Reduces 29+ legacy categories to 4 standardized ones:
- **Hay** (green badge) - Hay bales, alfalfa cubes/pellets, timothy, forage, straw bales
- **Shavings** (amber badge) - Wood shavings, bedding, PDZ, stall dry
- **Grain** (blue badge) - Feed, grain, oats, branded feeds (Cavalor feeds, Purina, Nutrena, etc.), salt/mineral blocks
- **Shelf Goods** (purple badge) - Everything else: supplements, grooming, tack, barn supplies, health products

Classification uses keyword-based matching with exclusion rules for accessories (hay nets, feed scoops, shaving forks, Cavalor supplements/treats vs feeds). Admin UI provides per-product override before applying.

### CRM (`/crm`)
Customer relationship management with pipeline tracking.

### Logistics (`/logistics`)
Delivery routing, fleet management, and dispatch.

### Purchasing (`/purchasing`)
Purchase orders and vendor management.

## Tech Stack

- **Framework**: Hono (TypeScript) on Cloudflare Pages
- **Database**: Cloudflare D1 SQLite (`bf-deliver-production`)
- **Frontend**: Vanilla JS + Tailwind CSS (CDN) + Font Awesome
- **Auth**: Base64-encoded JSON tokens (24h expiry), role-based (admin/owner/user)
- **Build**: Vite + wrangler

## Development

```bash
# Local dev (port 3001)
npm run build
pm2 start ecosystem.config.cjs

# Deploy to production
npm run deploy

# Database migrations
npm run db:migrate:local   # Local
npm run db:migrate:prod    # Production
```

## Data Architecture

- **Products**: `category TEXT` (free-form, no CHECK constraint after migration 0025)
- **29 migrations** covering delivery, fleet, inventory, CRM, purchasing modules
- **Audit logging**: `inventory_audit` table tracks all stock/category changes

## Last Updated
2026-06-01
