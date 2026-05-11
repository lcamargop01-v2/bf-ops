// Shared types used across all modules

export type BFBindings = {
  DB: D1Database
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
  GOOGLE_MAPS_API_KEY?: string
  VERIZON_USERNAME?: string
  VERIZON_PASSWORD?: string
  VERIZON_APP_ID?: string
}

export type BFVariables = {
  user: any
}

export type BFEnv = {
  Bindings: BFBindings
  Variables: BFVariables
}

// Module definitions
export interface ModuleDef {
  id: string
  name: string
  icon: string
  description: string
  color: string
  comingSoon?: boolean
}

export const MODULES: ModuleDef[] = [
  { id: 'logistics', name: 'Logistics', icon: 'fa-truck-fast', description: 'Delivery routes, orders, fleet management', color: '#1E3A8A' },
  { id: 'inventory', name: 'Inventory', icon: 'fa-warehouse', description: 'Stock levels, movements, multi-location tracking', color: '#059669' },
  { id: 'ordering', name: 'Ordering', icon: 'fa-cart-shopping', description: 'Purchase orders, vendors, receiving', color: '#D97706', comingSoon: true },
  { id: 'pos', name: 'Point of Sale', icon: 'fa-cash-register', description: 'Register, payments, receipts', color: '#7C3AED', comingSoon: true },
  { id: 'tasks', name: 'Tasks', icon: 'fa-list-check', description: 'Team tasks, checklists, operations', color: '#DC2626', comingSoon: true },
]
