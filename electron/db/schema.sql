PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  local_id TEXT PRIMARY KEY,
  firebase_id TEXT UNIQUE,
  name TEXT NOT NULL,
  barcode TEXT,
  sell_price REAL NOT NULL DEFAULT 0,
  buy_price REAL NOT NULL DEFAULT 0,
  stock REAL NOT NULL DEFAULT 0,
  raw_json TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending_create',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_products_sync ON products(sync_status, updated_at);

CREATE TABLE IF NOT EXISTS customers (
  local_id TEXT PRIMARY KEY,
  firebase_id TEXT UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  debt REAL NOT NULL DEFAULT 0,
  raw_json TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending_create',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_customers_sync ON customers(sync_status, updated_at);

CREATE TABLE IF NOT EXISTS invoices (
  local_id TEXT PRIMARY KEY,
  firebase_id TEXT UNIQUE,
  invoice_no TEXT NOT NULL,
  customer_local_id TEXT,
  total REAL NOT NULL DEFAULT 0,
  paid_amount REAL NOT NULL DEFAULT 0,
  due_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'confirmed',
  raw_json TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending_create',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(customer_local_id) REFERENCES customers(local_id)
);
CREATE INDEX IF NOT EXISTS idx_invoices_sync ON invoices(sync_status, updated_at);

CREATE TABLE IF NOT EXISTS invoice_items (
  local_id TEXT PRIMARY KEY,
  firebase_id TEXT UNIQUE,
  invoice_local_id TEXT NOT NULL,
  product_local_id TEXT NOT NULL,
  qty REAL NOT NULL,
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL,
  raw_json TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending_create',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(invoice_local_id) REFERENCES invoices(local_id),
  FOREIGN KEY(product_local_id) REFERENCES products(local_id)
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_sync ON invoice_items(sync_status, updated_at);

CREATE TABLE IF NOT EXISTS payments (
  local_id TEXT PRIMARY KEY,
  firebase_id TEXT UNIQUE,
  invoice_local_id TEXT,
  customer_local_id TEXT,
  amount REAL NOT NULL,
  method TEXT,
  raw_json TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending_create',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_payments_sync ON payments(sync_status, updated_at);

CREATE TABLE IF NOT EXISTS expenses (
  local_id TEXT PRIMARY KEY,
  firebase_id TEXT UNIQUE,
  title TEXT NOT NULL,
  amount REAL NOT NULL,
  category TEXT,
  raw_json TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending_create',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_expenses_sync ON expenses(sync_status, updated_at);

-- Generic local-first document store for existing POS collections.
-- This table allows gradual migration without rewriting all screens at once.
CREATE TABLE IF NOT EXISTS documents (
  local_id TEXT PRIMARY KEY,
  collection_name TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  doc_path TEXT NOT NULL UNIQUE,
  firebase_id TEXT,
  data_json TEXT NOT NULL,
  searchable_name TEXT,
  searchable_barcode TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending_create',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_collection_doc ON documents(collection_name, doc_id);
CREATE INDEX IF NOT EXISTS idx_documents_collection_active ON documents(collection_name, is_deleted, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_sync ON documents(sync_status, updated_at);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  local_id TEXT NOT NULL,
  collection_name TEXT NOT NULL,
  doc_path TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_attempt_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_doc ON sync_queue(doc_path, status);

CREATE TABLE IF NOT EXISTS app_counters (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS image_processing_cache (
  hash TEXT PRIMARY KEY,
  data_url TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_image_processing_cache_updated_at ON image_processing_cache(updated_at DESC);
