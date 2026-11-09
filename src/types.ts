export interface Settings {
  id: number
  bakery_name: string
  business_type: string
  owner_name: string
  currency: string
  currency_symbol: string
  currency_position: 'prefix' | 'suffix'
  date_format: string
  measurement_system: string
  default_tax_rate: number
  default_labor_rate: number
  labor_unit: 'hour' | 'minute'
  overhead_method: 'percent' | 'fixed'
  overhead_percent: number
  overhead_fixed: number
  opening_days: string
  default_lead_time_days: number
  low_stock_warnings: number
  expiry_warning_days: number
  allow_negative_stock: number
  auto_order_no: number
  onboarding_complete: number
  updated_at: string | null
}

export interface Customer {
  id: string
  name: string
  phone: string
  email: string
  address: string
  notes: string
  created_at: string
  archived_at: string | null
  is_sample: number
}

export interface Product {
  id: string
  name: string
  category_id: number | null
  category_name: string
  description: string
  selling_price: number
  recipe_id: string | null
  unit_of_sale: string
  availability: string
  lead_time_days: number
  notes: string
  image_path: string
  created_at: string
  is_sample: number
}

export interface ProductCategory {
  id: number
  name: string
  is_system: number
  sort_order: number
}

export interface Ingredient {
  id: string
  name: string
  category: string
  purchase_unit: string
  current_stock: number
  min_stock: number
  reorder_qty: number
  avg_cost: number
  supplier_id: string | null
  storage_location: string
  expiry_date: string | null
  notes: string
  created_at: string
  is_sample: number
}

export interface Recipe {
  id: string
  name: string
  category: string
  description: string
  yield_qty: number
  yield_unit: string
  prep_minutes: number
  bake_minutes: number
  cool_minutes: number
  instructions: string
  notes: string
  image_path: string
  packaging_cost: number
  labor_minutes: number
  overhead_override: number | null
  archived_at: string | null
  created_at: string
  is_sample: number
}

export interface RecipeIngredient {
  id: number
  recipe_id: string
  ingredient_id: string | null
  ingredient_name: string
  quantity: number
  unit: string
  unit_cost: number
  sort_order: number
}

export interface Supplier {
  id: string
  name: string
  contact_person: string
  phone: string
  email: string
  address: string
  notes: string
  created_at: string
  is_sample: number
}

export const ORDER_STATUSES = [
  'Inquiry',
  'Quoted',
  'Confirmed',
  'In Production',
  'Ready',
  'Completed',
  'Cancelled',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const PAYMENT_STATUSES = ['Unpaid', 'Partially Paid', 'Paid', 'Refunded'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export interface Order {
  id: string
  order_no: string
  customer_id: string | null
  customer_name: string
  created_at: string
  due_date: string | null
  due_time: string
  order_type: string
  status: OrderStatus
  payment_status: PaymentStatus
  subtotal: number
  discount: number
  tax_rate: number
  tax_amount: number
  delivery_fee: number
  total: number
  amount_paid: number
  outstanding: number
  special_instructions: string
  customer_notes: string
  internal_notes: string
  cancelled_at: string | null
  archived_at: string | null
  is_sample: number
}

export interface OrderItem {
  id: number
  order_id: string
  product_id: string | null
  product_name: string
  recipe_id: string | null
  unit_price: number
  quantity: number
  customization: string
  line_total: number
}

export interface OrderPayment {
  id: string
  order_id: string
  amount: number
  type: 'deposit' | 'payment' | 'refund'
  method: string
  paid_at: string
  notes: string
  created_at: string
}

export interface Purchase {
  id: string
  supplier_id: string | null
  supplier_name: string
  purchase_date: string
  total: number
  payment_status: string
  received: number
  received_at: string | null
  notes: string
  created_at: string
  is_sample: number
}

export interface PurchaseItem {
  id: number
  purchase_id: string
  ingredient_id: string | null
  ingredient_name: string
  quantity: number
  unit: string
  unit_price: number
  line_total: number
}

export interface InventoryMovement {
  id: number
  ingredient_id: string
  movement_type: string
  quantity: number
  stock_after: number
  movement_date: string
  related_order_id: string | null
  related_batch_id: string | null
  related_purchase_id: string | null
  related_waste_id: string | null
  reason: string
  created_at: string
}

export const BATCH_STATUSES = [
  'Planned',
  'Preparing',
  'Baking',
  'Cooling',
  'Decorating',
  'Packaging',
  'Completed',
  'Failed',
  'Cancelled',
] as const
export type BatchStatus = (typeof BATCH_STATUSES)[number]

export interface ProductionBatch {
  id: string
  batch_no: string
  production_date: string
  order_id: string | null
  product_id: string | null
  product_name: string
  recipe_id: string | null
  recipe_name: string
  planned_qty: number
  actual_qty: number
  status: BatchStatus
  priority: string
  start_time: string
  end_time: string
  labor_minutes: number
  waste_qty: number
  instructions: string
  notes: string
  consumption_committed: number
  recipe_snapshot: string
  created_at: string
  is_sample: number
}

export interface ProductionConsumption {
  id: number
  batch_id: string
  ingredient_id: string | null
  ingredient_name: string
  unit: string
  quantity: number
  unit_cost: number
  total_cost: number
  created_at: string
}

export interface WasteRecord {
  id: string
  waste_date: string
  waste_type: string
  ingredient_id: string | null
  ingredient_name: string
  batch_id: string | null
  product_name: string
  quantity: number
  unit: string
  category: string
  reason: string
  value: number
  movement_created: number
  notes: string
  created_at: string
  is_sample: number
}

export interface Expense {
  id: string
  expense_date: string
  category: string
  amount: number
  payment_method: string
  description: string
  notes: string
  related_purchase_id: string | null
  created_at: string
  is_sample: number
}

export interface IncomeTxn {
  id: string
  txn_date: string
  type: string
  category: string
  amount: number
  payment_method: string
  description: string
  notes: string
  created_at: string
  is_sample: number
}

export interface Task {
  id: string
  title: string
  description: string
  due_date: string | null
  priority: string
  status: 'To Do' | 'In Progress' | 'Completed'
  related_order_id: string | null
  notes: string
  created_at: string
  is_sample: number
}

export interface CalEvent {
  id: string
  title: string
  start_date: string
  end_date: string | null
  event_type: string
  related_order_id: string | null
  notes: string
  created_at: string
  is_sample: number
}
