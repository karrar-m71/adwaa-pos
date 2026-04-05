import { lazy } from 'react';

const Dashboard = lazy(() => import('../pages/Dashboard'));
const POS = lazy(() => import('../pages/POS'));
const Products = lazy(() => import('../pages/Products'));
const Reports = lazy(() => import('../pages/Reports'));
const Expenses = lazy(() => import('../pages/Expenses'));
const Customers = lazy(() => import('../pages/Customers'));
const Suppliers = lazy(() => import('../pages/Suppliers'));
const Technicians = lazy(() => import('../pages/Technicians'));
const Inventory = lazy(() => import('../pages/Inventory'));
const Vouchers = lazy(() => import('../pages/Vouchers'));
const MobileAdminDashboard = lazy(() => import('../pages/MobileAdminDashboard'));

const Warehouses = lazy(() => import('../pages/warehouse/Warehouses'));
const Packages = lazy(() => import('../pages/warehouse/Packages'));
const BarcodeManager = lazy(() => import('../pages/warehouse/BarcodeManager'));
const BarcodePrint = lazy(() => import('../pages/warehouse/BarcodePrint'));
const StockIn = lazy(() => import('../pages/warehouse/StockIn'));
const StockOut = lazy(() => import('../pages/warehouse/StockOut'));
const StockSettle = lazy(() => import('../pages/warehouse/StockSettle'));
const StockTransfer = lazy(() => import('../pages/warehouse/StockTransfer'));

const SalesList = lazy(() => import('../pages/sales/SalesList'));
const SalesReturn = lazy(() => import('../pages/sales/SalesReturn'));
const PriceQuote = lazy(() => import('../pages/sales/PriceQuote'));

const PurchaseList = lazy(() => import('../pages/purchase/PurchaseList'));
const PurchaseReturn = lazy(() => import('../pages/purchase/PurchaseReturn'));

const AccountStatement = lazy(() => import('../pages/acc_reports/AccountStatement'));
const AccountBalances = lazy(() => import('../pages/acc_reports/AccountBalances'));
const VoucherReport = lazy(() => import('../pages/acc_reports/VoucherReport'));
const VoucherSummary = lazy(() => import('../pages/acc_reports/VoucherSummary'));
const TradingReport = lazy(() => import('../pages/acc_reports/TradingReport'));
const BalanceSummary = lazy(() => import('../pages/acc_reports/BalanceSummary'));
const CashStatement = lazy(() => import('../pages/acc_reports/CashStatement'));
const CustomerDebts = lazy(() => import('../pages/acc_reports/CustomerDebts'));
const SupplierDebts = lazy(() => import('../pages/acc_reports/SupplierDebts'));
const DailyMovement = lazy(() => import('../pages/acc_reports/DailyMovement'));

const ProfitExpenses = lazy(() => import('../pages/profit_reports/ProfitExpenses'));
const ProfitReport = lazy(() => import('../pages/profit_reports/ProfitReport'));
const ProfitSummary = lazy(() => import('../pages/profit_reports/ProfitSummary'));
const ListProfits = lazy(() => import('../pages/profit_reports/ListProfits'));
const ListDiscounts = lazy(() => import('../pages/profit_reports/ListDiscounts'));
const LossSales = lazy(() => import('../pages/profit_reports/LossSales'));
const CustomerProfits = lazy(() => import('../pages/profit_reports/CustomerProfits'));
const CustomerItemProfit = lazy(() => import('../pages/profit_reports/CustomerItemProfit'));
const ItemProfits = lazy(() => import('../pages/profit_reports/ItemProfits'));
const ItemCustomerProfit = lazy(() => import('../pages/profit_reports/ItemCustomerProfit'));
const WarehouseProfits = lazy(() => import('../pages/profit_reports/WarehouseProfits'));
const GroupProfits = lazy(() => import('../pages/profit_reports/GroupProfits'));

const ItemsDisplay = lazy(() => import('../pages/item_reports/ItemsDisplay'));
const ItemMovement = lazy(() => import('../pages/item_reports/ItemMovement'));
const TopSelling = lazy(() => import('../pages/item_reports/TopSelling'));
const LeastSelling = lazy(() => import('../pages/item_reports/LeastSelling'));
const SellBelowCost = lazy(() => import('../pages/item_reports/SellBelowCost'));
const SlowMoving = lazy(() => import('../pages/item_reports/SlowMoving'));
const MinStockItems = lazy(() => import('../pages/item_reports/MinStockItems'));
const MaxStockItems = lazy(() => import('../pages/item_reports/MaxStockItems'));
const StockShortage = lazy(() => import('../pages/item_reports/StockShortage'));
const SalesIndicator = lazy(() => import('../pages/item_reports/SalesIndicator'));

const AdjustedBalances = lazy(() => import('../pages/audit/AdjustedBalances'));
const AdjustedItems = lazy(() => import('../pages/audit/AdjustedItems'));
const AdjustedLists = lazy(() => import('../pages/audit/AdjustedLists'));
const DeletedAccounts = lazy(() => import('../pages/audit/DeletedAccounts'));
const DeletedVouchers = lazy(() => import('../pages/audit/DeletedVouchers'));
const DeletedLists = lazy(() => import('../pages/audit/DeletedLists'));
const DeletedItems = lazy(() => import('../pages/audit/DeletedItems'));

const UsersManage = lazy(() => import('../pages/users/UsersManage'));
const ChangePassword = lazy(() => import('../pages/users/ChangePassword'));
const TaskManager = lazy(() => import('../pages/users/TaskManager'));
const CompletedTasks = lazy(() => import('../pages/users/CompletedTasks'));

const PrinterSettings = lazy(() => import('../pages/tools/PrinterSettings'));
const AppSettings = lazy(() => import('../pages/tools/AppSettings'));
const ReportSettings = lazy(() => import('../pages/tools/ReportSettings'));
const Backup = lazy(() => import('../pages/tools/Backup'));
const Shortcuts = lazy(() => import('../pages/tools/Shortcuts'));
const VoucherShortcuts = lazy(() => import('../pages/tools/VoucherShortcuts'));
const InvoiceSettings = lazy(() => import('../pages/tools/InvoiceSettings'));
const AIAssistant = lazy(() => import('../pages/ai/AIAssistant'));

export const PAGE_MAP = {
  dashboard: Dashboard, pos: POS, products: Products, customers: Customers,
  suppliers: Suppliers, technicians: Technicians, mobile_dashboard: MobileAdminDashboard, expenses: Expenses, vouchers: Vouchers, inventory: Inventory, reports: Reports,
  warehouses: Warehouses, packages: Packages, barcode_print: BarcodePrint,
  barcode_mgr: BarcodeManager, stock_in: StockIn, stock_out: StockOut,
  stock_settle: StockSettle, stock_transfer: StockTransfer,
  sales_list: SalesList, sales_return: SalesReturn, price_quote: PriceQuote,
  purchase_list: PurchaseList, purchase_return: PurchaseReturn,
  acc_statement: AccountStatement, acc_balances: AccountBalances,
  voucher_report: VoucherReport, voucher_summary: VoucherSummary,
  trading_report: TradingReport, balance_summary: BalanceSummary,
  cash_statement: CashStatement, customer_debts: CustomerDebts,
  supplier_debts: SupplierDebts, daily_movement: DailyMovement,
  profit_expenses: ProfitExpenses, profit_report: ProfitReport,
  profit_summary: ProfitSummary, list_profits: ListProfits,
  list_discounts: ListDiscounts, loss_sales: LossSales,
  customer_profits: CustomerProfits, cust_item_profit: CustomerItemProfit,
  item_profits: ItemProfits, item_cust_profit: ItemCustomerProfit,
  warehouse_profits: WarehouseProfits, group_profits: GroupProfits,
  items_display: ItemsDisplay, item_movement: ItemMovement,
  top_selling: TopSelling, least_selling: LeastSelling,
  sell_below_cost: SellBelowCost, slow_moving: SlowMoving,
  min_stock: MinStockItems, max_stock: MaxStockItems,
  stock_shortage: StockShortage, sales_indicator: SalesIndicator,
  adj_balances: AdjustedBalances, adj_items: AdjustedItems,
  adj_lists: AdjustedLists, del_accounts: DeletedAccounts,
  del_vouchers: DeletedVouchers, del_lists: DeletedLists, del_items: DeletedItems,
  users_manage: UsersManage, change_password: ChangePassword,
  task_manager: TaskManager, completed_tasks: CompletedTasks,
  printer_settings: PrinterSettings, app_settings: AppSettings,
  report_settings: ReportSettings, backup: Backup,
  shortcuts: Shortcuts, voucher_shortcuts: VoucherShortcuts,
  invoice_settings: InvoiceSettings,
  ai_assistant: AIAssistant,
};

export const NAV = [
  { id:'home', icon:'📊', label:'الرئيسية', page:'dashboard', roles:['مدير','محاسب','كاشير'] },
  { id:'pos_quick', icon:'🛒', label:'نقطة البيع', page:'pos', roles:['مدير','كاشير'] },
  { id:'warehouse', icon:'🏪', label:'المخزن', color:'#a78bfa', roles:['مدير','محاسب'], children:[
    {page:'products', icon:'📦', label:'المواد'},
    {page:'warehouses', icon:'🏭', label:'المخازن'},
    {page:'packages', icon:'📦', label:'التعبئات'},
    {page:'barcode_print', icon:'🖨️', label:'طباعة باركود'},
    {page:'barcode_mgr', icon:'📊', label:'إدارة الباركود'},
    {page:'stock_in', icon:'📥', label:'إدخال مخزني'},
    {page:'stock_out', icon:'📤', label:'إخراج مخزني'},
    {page:'stock_settle', icon:'⚖️', label:'تسوية مخزنية'},
    {page:'stock_transfer', icon:'🔄', label:'نقل بين المخازن'},
  ]},
  { id:'sales', icon:'💰', label:'البيع', color:'#10b981', roles:['مدير','كاشير'], children:[
    {page:'sales_list', icon:'🧾', label:'قائمة بيع'},
    {page:'sales_return', icon:'↩️', label:'قائمة إرجاع بيع'},
    {page:'price_quote', icon:'💬', label:'قائمة عرض السعر'},
  ]},
  { id:'purchase', icon:'🛍️', label:'الشراء', color:'#f59e0b', roles:['مدير','محاسب'], children:[
    {page:'purchase_list', icon:'📋', label:'قائمة شراء'},
    {page:'purchase_return', icon:'↩️', label:'قائمة إرجاع شراء'},
  ]},
  { id:'vouchers_menu', icon:'🧾', label:'السندات', page:'vouchers', roles:['مدير','محاسب'] },
  { id:'ai_assistant_menu', icon:'🤖', label:'المساعد الذكي', page:'ai_assistant', roles:['مدير','محاسب'] },
  { id:'customers_menu', icon:'👥', label:'الزبائن', page:'customers', roles:['مدير','كاشير','محاسب'] },
  { id:'suppliers_menu', icon:'🏭', label:'الموردون', page:'suppliers', roles:['مدير','محاسب'] },
  { id:'mobile_dashboard_menu', icon:'📱', label:'لوحة التحكم', page:'mobile_dashboard', roles:['مدير','محاسب'] },
  { id:'expenses_menu', icon:'💸', label:'المصروفات', page:'expenses', roles:['مدير','محاسب'] },
  { id:'acc_reports', icon:'📋', label:'تقارير الحسابات', color:'#3b82f6', roles:['مدير','محاسب'], children:[
    {page:'acc_statement', icon:'📄', label:'كشف حساب'},
    {page:'acc_balances', icon:'⚖️', label:'أرصدة الحسابات'},
    {page:'voucher_report', icon:'🧾', label:'تقرير السندات'},
    {page:'voucher_summary', icon:'📊', label:'ملخص السندات'},
    {page:'trading_report', icon:'📈', label:'تقرير المتاجرة'},
    {page:'balance_summary', icon:'💰', label:'ملخص الأرصدة'},
    {page:'cash_statement', icon:'💵', label:'كشف النقدية'},
    {page:'customer_debts', icon:'👥', label:'ديون الزبائن'},
    {page:'supplier_debts', icon:'🏭', label:'ديون الموردين'},
    {page:'daily_movement', icon:'📅', label:'الحركة اليومية'},
  ]},
  { id:'profit_reports', icon:'📈', label:'تقارير الأرباح', color:'#10b981', roles:['مدير','محاسب'], children:[
    {page:'profit_expenses', icon:'💰', label:'الأرباح والمصاريف'},
    {page:'profit_report', icon:'📈', label:'الأرباح'},
    {page:'profit_summary', icon:'📊', label:'ملخص الأرباح والخسائر'},
    {page:'list_profits', icon:'🧾', label:'أرباح القوائم'},
    {page:'list_discounts', icon:'🏷️', label:'خصومات القوائم'},
    {page:'loss_sales', icon:'📉', label:'المبيعات الخاسرة'},
    {page:'customer_profits', icon:'👥', label:'أرباح الزبائن'},
    {page:'cust_item_profit', icon:'🔍', label:'أرباح زبون بالنسبة للمواد'},
    {page:'item_profits', icon:'📦', label:'أرباح المواد'},
    {page:'item_cust_profit', icon:'🔍', label:'أرباح مادة بالنسبة للزبائن'},
    {page:'warehouse_profits', icon:'🏪', label:'أرباح المخازن'},
    {page:'group_profits', icon:'📂', label:'أرباح المجاميع'},
  ]},
  { id:'item_reports', icon:'📦', label:'تقارير المواد', color:'#a78bfa', roles:['مدير','محاسب'], children:[
    {page:'items_display', icon:'📋', label:'عرض المواد'},
    {page:'item_movement', icon:'🔄', label:'حركة المادة'},
    {page:'top_selling', icon:'🏆', label:'الأكثر مبيعاً'},
    {page:'least_selling', icon:'📉', label:'الأقل مبيعاً'},
    {page:'sell_below_cost', icon:'⚠️', label:'البيع أقل من الشراء'},
    {page:'slow_moving', icon:'🐌', label:'المواد الراكدة'},
    {page:'min_stock', icon:'🔴', label:'مواد الحد الأدنى'},
    {page:'max_stock', icon:'🟡', label:'مواد الحد الأعلى'},
    {page:'stock_shortage', icon:'❗', label:'نواقص المخزن'},
    {page:'sales_indicator', icon:'📊', label:'مؤشر المبيعات'},
  ]},
  { id:'audit', icon:'🔍', label:'تقارير المتابعة', color:'#f59e0b', roles:['مدير'], children:[
    {page:'adj_balances', icon:'⚖️', label:'الأرصدة المعدلة'},
    {page:'adj_items', icon:'📦', label:'المواد المعدلة'},
    {page:'adj_lists', icon:'📋', label:'القوائم المعدلة'},
    {page:'del_accounts', icon:'🗑️', label:'الحسابات المحذوفة'},
    {page:'del_vouchers', icon:'🗑️', label:'السندات المحذوفة'},
    {page:'del_lists', icon:'🗑️', label:'القوائم المحذوفة'},
    {page:'del_items', icon:'🗑️', label:'المواد المحذوفة'},
  ]},
  { id:'users_menu', icon:'👤', label:'المستخدمين', color:'#06b6d4', roles:['مدير'], children:[
    {page:'users_manage', icon:'👥', label:'المستخدمين'},
    {page:'change_password', icon:'🔑', label:'تغيير كلمة المرور'},
    {page:'task_manager', icon:'✅', label:'مدير المهام'},
    {page:'completed_tasks', icon:'🏁', label:'عرض المهام المنجزة'},
  ]},
  { id:'tools', icon:'⚙️', label:'الأدوات', color:'#6b7280', roles:['مدير'], children:[
    {page:'printer_settings', icon:'🖨️', label:'الطابعة الافتراضية'},
    {page:'app_settings', icon:'⚙️', label:'الإعدادات'},
    {page:'report_settings', icon:'📊', label:'إعدادات التقارير'},
    {page:'invoice_settings', icon:'🧾', label:'إعدادات الفاتورة'},
    {page:'backup', icon:'💾', label:'النسخ الاحتياطي'},
    {page:'shortcuts', icon:'⌨️', label:'الاختصارات'},
    {page:'voucher_shortcuts', icon:'🧾', label:'اختصارات السندات'},
  ]},
];

export function getPageLabel(page) {
  for (const n of NAV) {
    if (n.page === page) return { icon: n.icon, label: n.label };
    if (n.children) {
      const child = n.children.find((item) => item.page === page);
      if (child) return { icon: child.icon, label: child.label };
    }
  }
  return { icon: '📄', label: page };
}
