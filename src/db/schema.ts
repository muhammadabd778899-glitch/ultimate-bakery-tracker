// Database schema + versioned migrations.
// SQLite (compiled to WebAssembly) is the single source of truth.

export const SCHEMA_V1 = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS bakery_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  bakery_name TEXT NOT NULL DEFAULT '',
  business_type TEXT DEFAULT '',
  owner_name TEXT DEFAULT '',
  currency TEXT DEFAULT 'USD',
  currency_symbol TEXT DEFAULT '$',
  currency_position TEXT DEFAULT 'prefix',
  date_format TEXT DEFAULT 'YYYY-MM-DD',
  measurement_system TEXT DEFAULT 'metric',
  default_tax_rate REAL DEFAULT 0,
  default_labor_rate REAL DEFAULT 0,
  labor_unit TEXT DEFAULT 'hour',
  overhead_method TEXT DEFAULT 'percent',
  overhead_percent REAL DEFAULT 0,
  overhead_fixed REAL DEFAULT 0,
  opening_days TEXT DEFAULT 'Mon,Tue,Wed,Thu,Fri,Sat',
  default_lead_time_days INTEGER DEFAULT 3,
  low_stock_warnings INTEGER DEFAULT 1,
  expiry_warning_days INTEGER DEFAULT 7,
  allow_negative_stock INTEGER DEFAULT 0,
  auto_order_no INTEGER DEFAULT 1,
  onboarding_complete INTEGER DEFAULT 0,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS product_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_system INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'Other',
  description TEXT DEFAULT '',
  yield_qty REAL NOT NULL DEFAULT 1,
  yield_unit TEXT NOT NULL DEFAULT 'unit',
  prep_minutes INTEGER DEFAULT 0,
  bake_minutes INTEGER DEFAULT 0,
  cool_minutes INTEGER DEFAULT 0,
  instructions TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  image_path TEXT DEFAULT '',
  packaging_cost REAL DEFAULT 0,
  labor_minutes REAL DEFAULT 0,
  overhead_override REAL DEFAULT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  is_sample INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ingredients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'Other',
  purchase_unit TEXT NOT NULL DEFAULT 'g',
  current_stock REAL NOT NULL DEFAULT 0,
  min_stock REAL DEFAULT 0,
  reorder_qty REAL DEFAULT 0,
  avg_cost REAL DEFAULT 0,
  supplier_id TEXT,
  storage_location TEXT DEFAULT '',
  expiry_date TEXT,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  is_sample INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS unit_conversions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_unit TEXT NOT NULL,
  to_unit TEXT NOT NULL,
  factor REAL NOT NULL,
  UNIQUE(from_unit, to_unit)
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id TEXT REFERENCES ingredients(id) ON DELETE SET NULL,
  ingredient_name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'g',
  unit_cost REAL DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES product_categories(id) ON DELETE SET NULL,
  category_name TEXT DEFAULT 'Other',
  description TEXT DEFAULT '',
  selling_price REAL DEFAULT 0,
  recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL,
  unit_of_sale TEXT DEFAULT 'each',
  availability TEXT DEFAULT 'active',
  lead_time_days INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  image_path TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  is_sample INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  is_sample INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  archived_at TEXT,
  is_sample INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  due_date TEXT,
  due_time TEXT DEFAULT '',
  order_type TEXT DEFAULT 'pickup',
  status TEXT DEFAULT 'Inquiry',
  payment_status TEXT DEFAULT 'Unpaid',
  subtotal REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  tax_rate REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  delivery_fee REAL DEFAULT 0,
  total REAL DEFAULT 0,
  amount_paid REAL DEFAULT 0,
  outstanding REAL DEFAULT 0,
  special_instructions TEXT DEFAULT '',
  customer_notes TEXT DEFAULT '',
  internal_notes TEXT DEFAULT '',
  cancelled_at TEXT,
  archived_at TEXT,
  is_sample INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL,
  unit_price REAL NOT NULL DEFAULT 0,
  quantity REAL NOT NULL DEFAULT 1,
  customization TEXT DEFAULT '',
  line_total REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  type TEXT NOT NULL DEFAULT 'payment',
  method TEXT DEFAULT 'Cash',
  paid_at TEXT NOT NULL,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT DEFAULT '',
  purchase_date TEXT NOT NULL,
  total REAL DEFAULT 0,
  payment_status TEXT DEFAULT 'Unpaid',
  received INTEGER DEFAULT 0,
  received_at TEXT,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  is_sample INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  ingredient_id TEXT REFERENCES ingredients(id) ON DELETE SET NULL,
  ingredient_name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'g',
  unit_price REAL DEFAULT 0,
  line_total REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL,
  quantity REAL NOT NULL,
  stock_after REAL NOT NULL DEFAULT 0,
  movement_date TEXT NOT NULL,
  related_order_id TEXT,
  related_batch_id TEXT,
  related_purchase_id TEXT,
  related_waste_id TEXT,
  reason TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS production_batches (
  id TEXT PRIMARY KEY,
  batch_no TEXT NOT NULL,
  production_date TEXT NOT NULL,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT DEFAULT '',
  recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL,
  recipe_name TEXT DEFAULT '',
  planned_qty REAL DEFAULT 0,
  actual_qty REAL DEFAULT 0,
  status TEXT DEFAULT 'Planned',
  priority TEXT DEFAULT 'Normal',
  start_time TEXT DEFAULT '',
  end_time TEXT DEFAULT '',
  labor_minutes INTEGER DEFAULT 0,
  waste_qty REAL DEFAULT 0,
  instructions TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  consumption_committed INTEGER DEFAULT 0,
  recipe_snapshot TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  is_sample INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS production_consumption (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
  ingredient_id TEXT,
  ingredient_name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'g',
  quantity REAL NOT NULL DEFAULT 0,
  unit_cost REAL DEFAULT 0,
  total_cost REAL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS waste_records (
  id TEXT PRIMARY KEY,
  waste_date TEXT NOT NULL,
  waste_type TEXT NOT NULL DEFAULT 'ingredient',
  ingredient_id TEXT REFERENCES ingredients(id) ON DELETE SET NULL,
  ingredient_name TEXT DEFAULT '',
  batch_id TEXT REFERENCES production_batches(id) ON DELETE SET NULL,
  product_name TEXT DEFAULT '',
  quantity REAL NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'g',
  category TEXT DEFAULT 'Other',
  reason TEXT DEFAULT '',
  value REAL DEFAULT 0,
  movement_created INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  is_sample INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  expense_date TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  amount REAL NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'Cash',
  description TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  related_purchase_id TEXT REFERENCES purchases(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  is_sample INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS income_transactions (
  id TEXT PRIMARY KEY,
  txn_date TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'other_income',
  category TEXT DEFAULT 'Other',
  amount REAL NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'Cash',
  description TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  is_sample INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  due_date TEXT,
  priority TEXT DEFAULT 'Normal',
  status TEXT DEFAULT 'To Do',
  related_order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  is_sample INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  event_type TEXT DEFAULT 'other',
  related_order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  is_sample INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  detail TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments_metadata (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  entity_id TEXT,
  file_name TEXT DEFAULT '',
  file_path TEXT DEFAULT '',
  mime TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_history (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  size_bytes INTEGER DEFAULT 0,
  note TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_orders_due ON orders(due_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_movements_ing ON inventory_movements(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_batches_date ON production_batches(production_date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
`;

// Ordered, idempotent migrations. Each entry runs once and is recorded in `meta`.
export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  { version: 1, name: 'initial schema', sql: SCHEMA_V1 },
  {
    version: 2,
    name: 'seed product categories',
    sql: `
      INSERT OR IGNORE INTO product_categories (name, is_system, sort_order)
      VALUES ('Cakes',1,1),('Cupcakes',1,2),('Cookies',1,3),('Brownies',1,4),
             ('Bread',1,5),('Pastries',1,6),('Donuts',1,7),('Desserts',1,8),
             ('Custom Orders',1,9),('Other',1,10);
      INSERT OR IGNORE INTO unit_conversions (from_unit,to_unit,factor) VALUES
        ('kg','g',1000),('g','kg',0.001),
        ('L','ml',1000),('ml','L',0.001),
        ('lb','oz',16),('oz','lb',0.0625),
        ('kg','lb',2.2046226218),('lb','kg',0.45359237),
        ('L','ml_oz',33.8140226),
        ('cup','ml',236.5882365),('tbsp','ml',14.7867648),('tsp','ml',4.92892159),
        ('pcs','pcs',1);
    `,
  },
];
