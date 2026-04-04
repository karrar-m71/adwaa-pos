const SECTION_ACCESS = {
  home: ['مدير', 'محاسب', 'كاشير'],
  pos_quick: ['مدير', 'كاشير'],
  warehouse: ['مدير', 'محاسب'],
  sales: ['مدير', 'كاشير'],
  purchase: ['مدير', 'محاسب'],
  vouchers_menu: ['مدير', 'محاسب'],
  ai_assistant_menu: ['مدير', 'محاسب'],
  customers_menu: ['مدير', 'محاسب', 'كاشير'],
  suppliers_menu: ['مدير', 'محاسب'],
  mobile_dashboard_menu: ['مدير', 'محاسب'],
  expenses_menu: ['مدير', 'محاسب'],
  acc_reports: ['مدير', 'محاسب'],
  profit_reports: ['مدير', 'محاسب'],
  item_reports: ['مدير', 'محاسب'],
  audit: ['مدير'],
  users_menu: ['مدير'],
  tools: ['مدير'],
};

const PAGE_TO_SECTION = {
  dashboard: 'home',
  pos: 'pos_quick',
  products: 'warehouse',
  warehouses: 'warehouse',
  packages: 'warehouse',
  barcode_print: 'warehouse',
  barcode_mgr: 'warehouse',
  stock_in: 'warehouse',
  stock_out: 'warehouse',
  stock_settle: 'warehouse',
  stock_transfer: 'warehouse',
  sales_list: 'sales',
  sales_return: 'sales',
  price_quote: 'sales',
  purchase_list: 'purchase',
  purchase_return: 'purchase',
  vouchers: 'vouchers_menu',
  ai_assistant: 'ai_assistant_menu',
  customers: 'customers_menu',
  suppliers: 'suppliers_menu',
  mobile_dashboard: 'mobile_dashboard_menu',
  expenses: 'expenses_menu',
  acc_statement: 'acc_reports',
  acc_balances: 'acc_reports',
  voucher_report: 'acc_reports',
  voucher_summary: 'acc_reports',
  trading_report: 'acc_reports',
  balance_summary: 'acc_reports',
  cash_statement: 'acc_reports',
  customer_debts: 'acc_reports',
  supplier_debts: 'acc_reports',
  daily_movement: 'acc_reports',
  profit_expenses: 'profit_reports',
  profit_report: 'profit_reports',
  profit_summary: 'profit_reports',
  list_profits: 'profit_reports',
  list_discounts: 'profit_reports',
  loss_sales: 'profit_reports',
  customer_profits: 'profit_reports',
  cust_item_profit: 'profit_reports',
  item_profits: 'profit_reports',
  item_cust_profit: 'profit_reports',
  warehouse_profits: 'profit_reports',
  group_profits: 'profit_reports',
  items_display: 'item_reports',
  item_movement: 'item_reports',
  top_selling: 'item_reports',
  least_selling: 'item_reports',
  sell_below_cost: 'item_reports',
  slow_moving: 'item_reports',
  min_stock: 'item_reports',
  max_stock: 'item_reports',
  stock_shortage: 'item_reports',
  sales_indicator: 'item_reports',
  adj_balances: 'audit',
  adj_items: 'audit',
  adj_lists: 'audit',
  del_accounts: 'audit',
  del_vouchers: 'audit',
  del_lists: 'audit',
  del_items: 'audit',
  users_manage: 'users_menu',
  change_password: 'users_menu',
  task_manager: 'users_menu',
  completed_tasks: 'users_menu',
  printer_settings: 'tools',
  app_settings: 'tools',
  report_settings: 'tools',
  backup: 'tools',
  shortcuts: 'tools',
  voucher_shortcuts: 'tools',
};

const ACTION_RULES = {
  products_view: ['مدير', 'محاسب'],
  products_create: ['مدير', 'محاسب'],
  products_edit: ['مدير', 'محاسب'],
  products_delete: ['مدير'],
  customers_view: ['مدير', 'محاسب', 'كاشير'],
  customers_create: ['مدير', 'محاسب', 'كاشير'],
  customers_edit: ['مدير', 'محاسب', 'كاشير'],
  customers_delete: ['مدير'],
  suppliers_view: ['مدير', 'محاسب'],
  suppliers_create: ['مدير', 'محاسب'],
  suppliers_edit: ['مدير', 'محاسب'],
  suppliers_delete: ['مدير'],
};

function rolesForSection(sectionId) {
  return SECTION_ACCESS[sectionId] || [];
}

export function hasSectionAccess(user, sectionId) {
  if (!user || !sectionId) return false;
  const extraAccess = Array.isArray(user.extraAccess) ? user.extraAccess : [];
  return rolesForSection(sectionId).includes(user.role) || extraAccess.includes(sectionId);
}

export function getSectionForPage(page) {
  return PAGE_TO_SECTION[page] || null;
}

export function canAccessPage(user, page) {
  const sectionId = getSectionForPage(page);
  if (!sectionId) return true;
  return hasSectionAccess(user, sectionId);
}

export function canUser(user, actionKey) {
  if (!user || !actionKey) return false;
  const roles = ACTION_RULES[actionKey] || [];
  return roles.includes(user.role);
}

