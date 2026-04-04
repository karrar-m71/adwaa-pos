import { useEffect, useState, useRef } from 'react';
import { waitForPendingWrites } from 'firebase/firestore';
import { ThemeProvider, useTheme } from './ThemeContext';
import { db } from './firebase';
import { startOfflineImageQueueWorker } from './utils/offlineImageQueue';
import Login     from './pages/Login';
import Dashboard from './pages/Dashboard';
import POS       from './pages/POS';
import Products  from './pages/Products';
import Reports   from './pages/Reports';
import Expenses  from './pages/Expenses';
import Customers from './pages/Customers';
import Suppliers from './pages/Suppliers';
import Technicians from './pages/Technicians';
import Inventory from './pages/Inventory';
import Vouchers  from './pages/Vouchers';
import MobileAdminDashboard from './pages/MobileAdminDashboard';

import Warehouses     from './pages/warehouse/Warehouses';
import Packages       from './pages/warehouse/Packages';
import BarcodeManager from './pages/warehouse/BarcodeManager';
import BarcodePrint   from './pages/warehouse/BarcodePrint';
import StockIn        from './pages/warehouse/StockIn';
import StockOut       from './pages/warehouse/StockOut';
import StockSettle    from './pages/warehouse/StockSettle';
import StockTransfer  from './pages/warehouse/StockTransfer';

import SalesList    from './pages/sales/SalesList';
import SalesReturn  from './pages/sales/SalesReturn';
import PriceQuote   from './pages/sales/PriceQuote';

import PurchaseList   from './pages/purchase/PurchaseList';
import PurchaseReturn from './pages/purchase/PurchaseReturn';

import AccountStatement from './pages/acc_reports/AccountStatement';
import AccountBalances  from './pages/acc_reports/AccountBalances';
import VoucherReport    from './pages/acc_reports/VoucherReport';
import VoucherSummary   from './pages/acc_reports/VoucherSummary';
import TradingReport    from './pages/acc_reports/TradingReport';
import BalanceSummary   from './pages/acc_reports/BalanceSummary';
import CashStatement    from './pages/acc_reports/CashStatement';
import CustomerDebts    from './pages/acc_reports/CustomerDebts';
import SupplierDebts    from './pages/acc_reports/SupplierDebts';
import DailyMovement    from './pages/acc_reports/DailyMovement';

import ProfitExpenses    from './pages/profit_reports/ProfitExpenses';
import ProfitReport      from './pages/profit_reports/ProfitReport';
import ProfitSummary     from './pages/profit_reports/ProfitSummary';
import ListProfits       from './pages/profit_reports/ListProfits';
import ListDiscounts     from './pages/profit_reports/ListDiscounts';
import LossSales         from './pages/profit_reports/LossSales';
import CustomerProfits   from './pages/profit_reports/CustomerProfits';
import CustomerItemProfit from './pages/profit_reports/CustomerItemProfit';
import ItemProfits       from './pages/profit_reports/ItemProfits';
import ItemCustomerProfit from './pages/profit_reports/ItemCustomerProfit';
import WarehouseProfits  from './pages/profit_reports/WarehouseProfits';
import GroupProfits      from './pages/profit_reports/GroupProfits';

import ItemsDisplay   from './pages/item_reports/ItemsDisplay';
import ItemMovement   from './pages/item_reports/ItemMovement';
import TopSelling     from './pages/item_reports/TopSelling';
import LeastSelling   from './pages/item_reports/LeastSelling';
import SellBelowCost  from './pages/item_reports/SellBelowCost';
import SlowMoving     from './pages/item_reports/SlowMoving';
import MinStockItems  from './pages/item_reports/MinStockItems';
import MaxStockItems  from './pages/item_reports/MaxStockItems';
import StockShortage  from './pages/item_reports/StockShortage';
import SalesIndicator from './pages/item_reports/SalesIndicator';

import AdjustedBalances from './pages/audit/AdjustedBalances';
import AdjustedItems    from './pages/audit/AdjustedItems';
import AdjustedLists    from './pages/audit/AdjustedLists';
import DeletedAccounts  from './pages/audit/DeletedAccounts';
import DeletedVouchers  from './pages/audit/DeletedVouchers';
import DeletedLists     from './pages/audit/DeletedLists';
import DeletedItems     from './pages/audit/DeletedItems';

import UsersManage    from './pages/users/UsersManage';
import ChangePassword from './pages/users/ChangePassword';
import TaskManager    from './pages/users/TaskManager';
import CompletedTasks from './pages/users/CompletedTasks';

import PrinterSettings  from './pages/tools/PrinterSettings';
import AppSettings      from './pages/tools/AppSettings';
import ReportSettings   from './pages/tools/ReportSettings';
import Backup           from './pages/tools/Backup';
import Shortcuts        from './pages/tools/Shortcuts';
import VoucherShortcuts from './pages/tools/VoucherShortcuts';
import AIAssistant      from './pages/ai/AIAssistant';

const PAGE_MAP = {
  dashboard:Dashboard, pos:POS, products:Products, customers:Customers,
  suppliers:Suppliers, technicians:Technicians, mobile_dashboard:MobileAdminDashboard, expenses:Expenses, vouchers:Vouchers, inventory:Inventory, reports:Reports,
  warehouses:Warehouses, packages:Packages, barcode_print:BarcodePrint,
  barcode_mgr:BarcodeManager, stock_in:StockIn, stock_out:StockOut,
  stock_settle:StockSettle, stock_transfer:StockTransfer,
  sales_list:SalesList, sales_return:SalesReturn, price_quote:PriceQuote,
  purchase_list:PurchaseList, purchase_return:PurchaseReturn,
  acc_statement:AccountStatement, acc_balances:AccountBalances,
  voucher_report:VoucherReport, voucher_summary:VoucherSummary,
  trading_report:TradingReport, balance_summary:BalanceSummary,
  cash_statement:CashStatement, customer_debts:CustomerDebts,
  supplier_debts:SupplierDebts, daily_movement:DailyMovement,
  profit_expenses:ProfitExpenses, profit_report:ProfitReport,
  profit_summary:ProfitSummary, list_profits:ListProfits,
  list_discounts:ListDiscounts, loss_sales:LossSales,
  customer_profits:CustomerProfits, cust_item_profit:CustomerItemProfit,
  item_profits:ItemProfits, item_cust_profit:ItemCustomerProfit,
  warehouse_profits:WarehouseProfits, group_profits:GroupProfits,
  items_display:ItemsDisplay, item_movement:ItemMovement,
  top_selling:TopSelling, least_selling:LeastSelling,
  sell_below_cost:SellBelowCost, slow_moving:SlowMoving,
  min_stock:MinStockItems, max_stock:MaxStockItems,
  stock_shortage:StockShortage, sales_indicator:SalesIndicator,
  adj_balances:AdjustedBalances, adj_items:AdjustedItems,
  adj_lists:AdjustedLists, del_accounts:DeletedAccounts,
  del_vouchers:DeletedVouchers, del_lists:DeletedLists, del_items:DeletedItems,
  users_manage:UsersManage, change_password:ChangePassword,
  task_manager:TaskManager, completed_tasks:CompletedTasks,
  printer_settings:PrinterSettings, app_settings:AppSettings,
  report_settings:ReportSettings, backup:Backup,
  shortcuts:Shortcuts, voucher_shortcuts:VoucherShortcuts,
  ai_assistant:AIAssistant,
};

const NAV = [
  { id:'home',        icon:'📊', label:'الرئيسية',    page:'dashboard', roles:['مدير','محاسب','كاشير'] },
  { id:'pos_quick',   icon:'🛒', label:'نقطة البيع',  page:'pos',       roles:['مدير','كاشير'] },
  { id:'warehouse', icon:'🏪', label:'المخزن', color:'#a78bfa', roles:['مدير','محاسب'],
    children:[
      {page:'products',      icon:'📦', label:'المواد'},
      {page:'warehouses',    icon:'🏭', label:'المخازن'},
      {page:'packages',      icon:'📦', label:'التعبئات'},
      {page:'barcode_print', icon:'🖨️', label:'طباعة باركود'},
      {page:'barcode_mgr',   icon:'📊', label:'إدارة الباركود'},
      {page:'stock_in',      icon:'📥', label:'إدخال مخزني'},
      {page:'stock_out',     icon:'📤', label:'إخراج مخزني'},
      {page:'stock_settle',  icon:'⚖️', label:'تسوية مخزنية'},
      {page:'stock_transfer',icon:'🔄', label:'نقل بين المخازن'},
    ],
  },
  { id:'sales', icon:'💰', label:'البيع', color:'#10b981', roles:['مدير','كاشير'],
    children:[
      {page:'sales_list',   icon:'🧾', label:'قائمة بيع'},
      {page:'sales_return', icon:'↩️', label:'قائمة إرجاع بيع'},
      {page:'price_quote',  icon:'💬', label:'قائمة عرض السعر'},
    ],
  },
  { id:'purchase', icon:'🛍️', label:'الشراء', color:'#f59e0b', roles:['مدير','محاسب'],
    children:[
      {page:'purchase_list',   icon:'📋', label:'قائمة شراء'},
      {page:'purchase_return', icon:'↩️', label:'قائمة إرجاع شراء'},
    ],
  },
  { id:'vouchers_menu',  icon:'🧾', label:'السندات',   page:'vouchers',   roles:['مدير','محاسب'] },
  { id:'ai_assistant_menu', icon:'🤖', label:'المساعد الذكي', page:'ai_assistant', roles:['مدير','محاسب'] },
  { id:'customers_menu', icon:'👥', label:'الزبائن',   page:'customers',  roles:['مدير','كاشير','محاسب'] },
  { id:'suppliers_menu', icon:'🏭', label:'الموردون',  page:'suppliers',  roles:['مدير','محاسب'] },
  { id:'mobile_dashboard_menu', icon:'📱', label:'لوحة التحكم', page:'mobile_dashboard', roles:['مدير','محاسب'] },
  { id:'expenses_menu',  icon:'💸', label:'المصروفات', page:'expenses',   roles:['مدير','محاسب'] },
  { id:'acc_reports', icon:'📋', label:'تقارير الحسابات', color:'#3b82f6', roles:['مدير','محاسب'],
    children:[
      {page:'acc_statement',  icon:'📄', label:'كشف حساب'},
      {page:'acc_balances',   icon:'⚖️', label:'أرصدة الحسابات'},
      {page:'voucher_report', icon:'🧾', label:'تقرير السندات'},
      {page:'voucher_summary',icon:'📊', label:'ملخص السندات'},
      {page:'trading_report', icon:'📈', label:'تقرير المتاجرة'},
      {page:'balance_summary',icon:'💰', label:'ملخص الأرصدة'},
      {page:'cash_statement', icon:'💵', label:'كشف النقدية'},
      {page:'customer_debts', icon:'👥', label:'ديون الزبائن'},
      {page:'supplier_debts', icon:'🏭', label:'ديون الموردين'},
      {page:'daily_movement', icon:'📅', label:'الحركة اليومية'},
    ],
  },
  { id:'profit_reports', icon:'📈', label:'تقارير الأرباح', color:'#10b981', roles:['مدير','محاسب'],
    children:[
      {page:'profit_expenses',   icon:'💰', label:'الأرباح والمصاريف'},
      {page:'profit_report',     icon:'📈', label:'الأرباح'},
      {page:'profit_summary',    icon:'📊', label:'ملخص الأرباح والخسائر'},
      {page:'list_profits',      icon:'🧾', label:'أرباح القوائم'},
      {page:'list_discounts',    icon:'🏷️', label:'خصومات القوائم'},
      {page:'loss_sales',        icon:'📉', label:'المبيعات الخاسرة'},
      {page:'customer_profits',  icon:'👥', label:'أرباح الزبائن'},
      {page:'cust_item_profit',  icon:'🔍', label:'أرباح زبون بالنسبة للمواد'},
      {page:'item_profits',      icon:'📦', label:'أرباح المواد'},
      {page:'item_cust_profit',  icon:'🔍', label:'أرباح مادة بالنسبة للزبائن'},
      {page:'warehouse_profits', icon:'🏪', label:'أرباح المخازن'},
      {page:'group_profits',     icon:'📂', label:'أرباح المجاميع'},
    ],
  },
  { id:'item_reports', icon:'📦', label:'تقارير المواد', color:'#a78bfa', roles:['مدير','محاسب'],
    children:[
      {page:'items_display',   icon:'📋', label:'عرض المواد'},
      {page:'item_movement',   icon:'🔄', label:'حركة المادة'},
      {page:'top_selling',     icon:'🏆', label:'الأكثر مبيعاً'},
      {page:'least_selling',   icon:'📉', label:'الأقل مبيعاً'},
      {page:'sell_below_cost', icon:'⚠️', label:'البيع أقل من الشراء'},
      {page:'slow_moving',     icon:'🐌', label:'المواد الراكدة'},
      {page:'min_stock',       icon:'🔴', label:'مواد الحد الأدنى'},
      {page:'max_stock',       icon:'🟡', label:'مواد الحد الأعلى'},
      {page:'stock_shortage',  icon:'❗', label:'نواقص المخزن'},
      {page:'sales_indicator', icon:'📊', label:'مؤشر المبيعات'},
    ],
  },
  { id:'audit', icon:'🔍', label:'تقارير المتابعة', color:'#f59e0b', roles:['مدير'],
    children:[
      {page:'adj_balances', icon:'⚖️', label:'الأرصدة المعدلة'},
      {page:'adj_items',    icon:'📦', label:'المواد المعدلة'},
      {page:'adj_lists',    icon:'📋', label:'القوائم المعدلة'},
      {page:'del_accounts', icon:'🗑️', label:'الحسابات المحذوفة'},
      {page:'del_vouchers', icon:'🗑️', label:'السندات المحذوفة'},
      {page:'del_lists',    icon:'🗑️', label:'القوائم المحذوفة'},
      {page:'del_items',    icon:'🗑️', label:'المواد المحذوفة'},
    ],
  },
  { id:'users_menu', icon:'👤', label:'المستخدمين', color:'#06b6d4', roles:['مدير'],
    children:[
      {page:'users_manage',    icon:'👥', label:'المستخدمين'},
      {page:'change_password', icon:'🔑', label:'تغيير كلمة المرور'},
      {page:'task_manager',    icon:'✅', label:'مدير المهام'},
      {page:'completed_tasks', icon:'🏁', label:'عرض المهام المنجزة'},
    ],
  },
  { id:'tools', icon:'⚙️', label:'الأدوات', color:'#6b7280', roles:['مدير'],
    children:[
      {page:'printer_settings', icon:'🖨️', label:'الطابعة الافتراضية'},
      {page:'app_settings',     icon:'⚙️', label:'الإعدادات'},
      {page:'report_settings',  icon:'📊', label:'إعدادات التقارير'},
      {page:'backup',           icon:'💾', label:'النسخ الاحتياطي'},
      {page:'shortcuts',        icon:'⌨️', label:'الاختصارات'},
      {page:'voucher_shortcuts',icon:'🧾', label:'اختصارات السندات'},
    ],
  },
];

const DIGIT_MAP = {
  '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
  '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9',
  '٫':'.','٬':'',',':'.','−':'-',
};

function toLatinDigits(value) {
  return String(value ?? '').replace(/[٠-٩۰-۹٫٬,−]/g, (ch) => DIGIT_MAP[ch] ?? ch);
}

function isNumericInput(el) {
  if (!(el instanceof HTMLInputElement)) return false;
  return el.type === 'number' || el.inputMode === 'numeric' || el.inputMode === 'decimal' || el.dataset.numeric === 'true';
}

function setNativeInputValue(el, value) {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  const setter = descriptor?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function insertNormalizedText(el, text) {
  if (!text) return;
  try {
    const start = typeof el.selectionStart === 'number' ? el.selectionStart : String(el.value ?? '').length;
    const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : start;
    el.setRangeText(text, start, end, 'end');
  } catch {
    const current = String(el.value ?? '');
    setNativeInputValue(el, `${current}${text}`);
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// استخراج تسمية الصفحة من NAV
function getPageLabel(page) {
  for (const n of NAV) {
    if (n.page === page) return { icon: n.icon, label: n.label };
    if (n.children) {
      const c = n.children.find(c => c.page === page);
      if (c) return { icon: c.icon, label: c.label };
    }
  }
  return { icon: '📄', label: page };
}

const OFFLINE_SYNC_FLAG = 'adwaa_pending_offline_sync';

const readOfflineSyncFlag = () => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(OFFLINE_SYNC_FLAG) === '1';
};

const writeOfflineSyncFlag = (value) => {
  if (typeof window === 'undefined') return;
  if (value) window.localStorage.setItem(OFFLINE_SYNC_FLAG, '1');
  else window.localStorage.removeItem(OFFLINE_SYNC_FLAG);
};

// ── التطبيق الرئيسي مع الثيم ─────────────────
function AppInner() {
  const { theme } = useTheme();
  const [user, setUser]           = useState(null);
  const [tabs, setTabs]           = useState([{ id: 1, page: 'dashboard' }]);
  const [activeTabId, setActiveTabId] = useState(1);
  const nextTabId                 = useRef(2);
  const [openMenus, setOpenMenus] = useState({});
  const [inAppBrowserUrl, setInAppBrowserUrl] = useState('');
  const [syncState, setSyncState] = useState(() => {
    if (typeof navigator === 'undefined') return 'online';
    if (!navigator.onLine) return 'offline';
    return readOfflineSyncFlag() ? 'syncing' : 'online';
  });
  const [isCompactSidebar, setIsCompactSidebar] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 1280;
  });
  const isDesktopApp = Boolean(window?.adwaaDesktop?.isDesktop);
  const imgbbKey = import.meta.env.VITE_IMGBB_KEY || '';

  useEffect(() => {
    const stop = startOfflineImageQueueWorker(imgbbKey);
    return () => stop();
  }, [imgbbKey]);

  useEffect(() => {
    const onBeforeInput = (e) => {
      const target = e.target;
      if (!isNumericInput(target)) return;
      if (e.isComposing) return;
      if (typeof e.data !== 'string' || !e.data) return;
      const normalized = toLatinDigits(e.data);
      if (normalized === e.data) return;
      e.preventDefault();
      insertNormalizedText(target, normalized);
    };

    const onPaste = (e) => {
      const target = e.target;
      if (!isNumericInput(target)) return;
      const text = e.clipboardData?.getData('text') ?? '';
      const normalized = toLatinDigits(text);
      if (!normalized || normalized === text) return;
      e.preventDefault();
      insertNormalizedText(target, normalized);
    };

    document.addEventListener('beforeinput', onBeforeInput, true);
    document.addEventListener('paste', onPaste, true);
    return () => {
      document.removeEventListener('beforeinput', onBeforeInput, true);
      document.removeEventListener('paste', onPaste, true);
    };
  }, []);

  useEffect(() => {
    const onResize = () => setIsCompactSidebar(window.innerWidth <= 1280);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const settlePendingWrites = async () => {
      if (!navigator.onLine) {
        setSyncState('offline');
        writeOfflineSyncFlag(true);
        return;
      }

      if (!readOfflineSyncFlag()) {
        setSyncState('online');
        return;
      }

      setSyncState('syncing');
      try {
        await waitForPendingWrites(db);
      } catch (error) {
        console.warn('Pending writes sync status fallback:', error?.message || error);
      }

      if (!cancelled) {
        writeOfflineSyncFlag(false);
        setSyncState('online');
      }
    };

    const onOffline = () => {
      writeOfflineSyncFlag(true);
      setSyncState('offline');
    };

    const onOnline = () => {
      settlePendingWrites();
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    settlePendingWrites();

    return () => {
      cancelled = true;
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  useEffect(() => {
    window.__adwaaInAppBrowserReady = true;
    const onOpenInAppBrowser = (e) => {
      const url = e?.detail?.url;
      if (!url) return;
      setInAppBrowserUrl(url);
    };
    window.addEventListener('adwaa:open-in-app-browser', onOpenInAppBrowser);
    return () => {
      window.__adwaaInAppBrowserReady = false;
      window.removeEventListener('adwaa:open-in-app-browser', onOpenInAppBrowser);
    };
  }, []);

  if (!user) return (
    <Login onLogin={u => {
      setUser(u);
      const firstPage = u?.mustChangePassword ? 'change_password' : 'dashboard';
      setTabs([{ id: 1, page: firstPage }]);
      setActiveTabId(1);
      nextTabId.current = 2;
    }}/>
  );

  // ── إغلاق بقية القوائم عند فتح قائمة جديدة ──
  const toggleMenu = (id) => setOpenMenus(m => {
    if (m[id]) return { ...m, [id]: false };
    const reset = {};
    Object.keys(m).forEach(k => { reset[k] = false; });
    return { ...reset, [id]: true };
  });

  // ── فتح تبويب (أو التركيز على تبويب موجود) ──
  const openPage = (page) => {
    const existing = tabs.find(t => t.page === page);
    if (existing) { setActiveTabId(existing.id); return; }
    const id = nextTabId.current++;
    setTabs(t => [...t, { id, page }]);
    setActiveTabId(id);
  };

  const closeTab = (id) => {
    if (tabs.length === 1) return;
    const idx = tabs.findIndex(t => t.id === id);
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);
    if (activeTabId === id) setActiveTabId(newTabs[Math.max(0, idx - 1)].id);
  };

  const extraAccess = user.extraAccess || [];
  const allowedNav  = NAV.filter(n => n.roles.includes(user.role) || extraAccess.includes(n.id));

  const T = theme;
  const logo = localStorage.getItem('adwaa_logo');
  const syncBadge = syncState === 'offline'
    ? { label:'يعمل بدون إنترنت', bg:'#fff7ed', border:'#fdba74', color:'#c2410c', dot:'#f59e0b' }
    : syncState === 'syncing'
      ? { label:'جارٍ مزامنة البيانات', bg:'#dbeafe', border:'#93c5fd', color:'#1d4ed8', dot:'#2563eb' }
      : { label:'متصل وتمت المزامنة', bg:'#ecfdf5', border:'#86efac', color:'#047857', dot:'#10b981' };
  const syncBadgeLabel = syncBadge.label;

  return (
    <div className="app-shell" style={{ display:'flex', height:'100svh', background:T.bg, fontFamily:"'Cairo',sans-serif", direction:'rtl', overflow:'hidden', minWidth:0 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Bebas+Neue&display=swap');
        *{margin:0;padding:0;box-sizing:border-box}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:4px}
        input,select,textarea,button{font-family:'Cairo',sans-serif!important}
        @keyframes fadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        .nav-item:hover{background:${T.accent}10!important}
        .nav-child:hover{background:${T.accent}15!important}
        .tab-btn:hover .tab-close{opacity:1!important}
        .desktop-drag-region{-webkit-app-region:drag}
        .desktop-no-drag{-webkit-app-region:no-drag}
        .app-sidebar{width:${isCompactSidebar ? 76 : 240}px}
        .app-main{min-width:0}
        @media (max-width: 1100px){
          .app-sidebar{width:76px!important}
        }
        @media (max-width: 860px){
          .app-shell{flex-direction:column}
          .app-sidebar{
            width:100%!important;
            max-height:72px;
            border-left:none!important;
            border-bottom:1px solid ${T.border};
          }
          .app-main{min-height:0}
        }
      `}</style>

      {/* ── Sidebar ── */}
      <div className="app-sidebar" style={{ background:T.sidebar, borderLeft:`1px solid ${T.border}`, display:'flex', flexDirection:'column', flexShrink:0, overflow:'hidden', transition:'width .2s' }}>
        {/* لوجو */}
        <div style={{ padding:isCompactSidebar ? '12px 10px' : '16px 20px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:10, overflow:'hidden', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background: logo ? 'transparent' : T.accent, fontSize:20 }}>
              {logo
                ? <img src={logo} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="logo"/>
                : '💡'}
            </div>
            {!isCompactSidebar && <div>
              <div style={{ fontFamily:"'Bebas Neue'", color:T.accent, fontSize:16, letterSpacing:2 }}>أضواء المدينة</div>
              <div style={{ color:T.textMuted, fontSize:9 }}>نظام إدارة متكامل</div>
            </div>}
          </div>
        </div>

        {/* المستخدم */}
        <div style={{ padding:isCompactSidebar ? '10px' : '10px 20px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:30, height:30, borderRadius:8, background:`${T.accent}22`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>👤</div>
            {!isCompactSidebar && <div>
              <div style={{ color:T.text, fontSize:11, fontWeight:700 }}>{user.name}</div>
              <div style={{ color:T.accent, fontSize:9, fontWeight:700 }}>{user.role}</div>
            </div>}
          </div>
        </div>

        {/* القائمة */}
        <nav style={{ flex:1, overflowY:'auto', padding:'6px 0' }}>
          {allowedNav.map(item => {
            const activeTab = tabs.find(t => t.id === activeTabId);
            const activePage = activeTab?.page;
            if (!item.children) {
              return (
                <button key={item.id} className="nav-item" onClick={() => openPage(item.page)}
                  title={item.label}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:isCompactSidebar?'9px 10px':'9px 16px', border:'none', cursor:'pointer', marginBottom:1, background:activePage===item.page?`${T.accent}18`:'transparent', textAlign:'right' }}>
                  <span style={{ fontSize:15, opacity:activePage===item.page?1:0.35 }}>{item.icon}</span>
                  {!isCompactSidebar && <span style={{ color:activePage===item.page?T.accent:T.textMuted, fontSize:12, fontWeight:activePage===item.page?700:400, flex:1 }}>{item.label}</span>}
                  {activePage===item.page && <div style={{ width:3, height:14, borderRadius:2, background:T.accent }}/>}
                </button>
              );
            }
            const isOpen   = openMenus[item.id];
            const hasActive = item.children.some(c => tabs.some(t => t.page === c.page));
            return (
              <div key={item.id}>
                <button className="nav-item" onClick={() => toggleMenu(item.id)}
                  title={item.label}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:isCompactSidebar?'9px 10px':'9px 16px', border:'none', cursor:'pointer', marginBottom:1, background:hasActive?`${T.accent}08`:'transparent', textAlign:'right' }}>
                  <span style={{ fontSize:15, opacity:hasActive||isOpen?1:0.35 }}>{item.icon}</span>
                  {!isCompactSidebar && <span style={{ color:hasActive?item.color||T.accent:T.textMuted, fontSize:12, fontWeight:hasActive?700:400, flex:1 }}>{item.label}</span>}
                  {!isCompactSidebar && <span style={{ color:T.textMuted, fontSize:10, transition:'transform .2s', transform:isOpen?'rotate(90deg)':'rotate(0)' }}>▶</span>}
                </button>
                {isOpen && !isCompactSidebar && (
                  <div style={{ background:T.bg, borderRight:`2px solid ${item.color||T.accent}22` }}>
                    {item.children.map(c => {
                      const isTabOpen = tabs.some(t => t.page === c.page);
                      const isActive  = activePage === c.page;
                      return (
                        <button key={c.page} className="nav-child" onClick={() => openPage(c.page)}
                          style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 16px 8px 24px', border:'none', cursor:'pointer', background:isActive?`${item.color||T.accent}18`:'transparent', textAlign:'right' }}>
                          <span style={{ fontSize:13, opacity:isActive?1:0.3 }}>{c.icon}</span>
                          <span style={{ color:isActive?item.color||T.accent:T.textMuted, fontSize:11, fontWeight:isActive?700:400, flex:1 }}>{c.label}</span>
                          {isActive && <div style={{ width:3, height:12, borderRadius:2, background:item.color||T.accent }}/>}
                          {isTabOpen && !isActive && <div style={{ width:5, height:5, borderRadius:'50%', background:item.color||T.accent, opacity:0.5 }}/>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* خروج */}
        <div style={{ padding:isCompactSidebar ? '10px 8px' : '10px 12px', borderTop:`1px solid ${T.border}`, flexShrink:0 }}>
          <button onClick={() => { if (confirm('تسجيل الخروج؟')) setUser(null); }}
            style={{ width:'100%', background:'#ef444411', border:'1px solid #ef444433', borderRadius:8, padding:'8px', color:'#ef4444', cursor:'pointer', fontSize:11, fontWeight:700 }}>
            {isCompactSidebar ? '🚪' : '🚪 تسجيل الخروج'}
          </button>
        </div>
      </div>

      {/* ── المحتوى ── */}
      <div className="app-main" style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* ── شريط التبويبات العلوي ── */}
        <div style={{ background:T.sidebar, borderBottom:`1px solid ${T.border}`, flexShrink:0 }} className={isDesktopApp ? 'desktop-drag-region' : ''}>
          <div style={{ display:'flex', alignItems:'stretch', overflowX:'auto', padding:'5px 8px 0', gap:2, minHeight:38 }} className="desktop-no-drag">
            {tabs.map(tab => {
              const lbl      = getPageLabel(tab.page);
              const isActive = tab.id === activeTabId;
              return (
                <div key={tab.id} className="tab-btn"
                  onClick={() => setActiveTabId(tab.id)}
                  style={{
                    display:'flex', alignItems:'center', gap:4,
                    background: isActive ? T.bg : `${T.accent}08`,
                    border: `1px solid ${isActive ? T.accent+'66' : T.border}`,
                    borderBottom: isActive ? `1px solid ${T.bg}` : `1px solid ${T.border}`,
                    borderRadius:'7px 7px 0 0',
                    padding:'4px 10px', cursor:'pointer', flexShrink:0,
                    position:'relative', top:1,
                    transition:'background .15s',
                  }}>
                  <span style={{ fontSize:11 }}>{lbl.icon}</span>
                  <span style={{ color: isActive ? T.accent : T.textMuted, fontSize:10, fontWeight:isActive?700:400, whiteSpace:'nowrap', maxWidth:90, overflow:'hidden', textOverflow:'ellipsis' }}>
                    {lbl.label}
                  </span>
                  {tabs.length > 1 && (
                    <span className="tab-close"
                      onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                      style={{ color:T.textMuted, fontSize:9, cursor:'pointer', opacity:0, marginRight:1, lineHeight:1, padding:'1px 2px', borderRadius:3, transition:'opacity .15s' }}>
                      ✕
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {/* سطر ثانوي: تاريخ */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'3px 16px 5px' }}>
            <div style={{ color:T.textMuted, fontSize:10 }}>
              {new Date().toLocaleDateString('ar-IQ', { weekday:'short', year:'numeric', month:'short', day:'numeric' })}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }} className="desktop-no-drag">
              <div style={{ display:'flex', alignItems:'center', gap:6, background:syncBadge.bg, border:`1px solid ${syncBadge.border}`, borderRadius:999, padding:'4px 10px' }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:syncBadge.dot, flexShrink:0 }} />
                <span style={{ color:syncBadge.color, fontSize:10, fontWeight:800, whiteSpace:'nowrap' }}>{syncBadgeLabel}</span>
              </div>
              {isDesktopApp && (
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <button onClick={() => window.adwaaDesktop.hide()} title="إخفاء" style={{ width:28, height:24, border:'1px solid #cdd8ec', background:'#f8fbff', borderRadius:6, cursor:'pointer' }}>👁️</button>
                  <button onClick={() => window.adwaaDesktop.minimize()} title="تصغير" style={{ width:28, height:24, border:'1px solid #cdd8ec', background:'#f8fbff', borderRadius:6, cursor:'pointer' }}>—</button>
                  <button onClick={() => window.adwaaDesktop.toggleMaximize()} title="تكبير/استعادة" style={{ width:28, height:24, border:'1px solid #cdd8ec', background:'#f8fbff', borderRadius:6, cursor:'pointer' }}>▢</button>
                  <button onClick={() => window.adwaaDesktop.close()} title="إغلاق" style={{ width:28, height:24, border:'1px solid #ef444444', background:'#ef444422', color:'#ef4444', borderRadius:6, cursor:'pointer' }}>✕</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── صفحات التبويبات ── */}
        <div style={{ flex:1, position:'relative', background:T.bg, minWidth:0 }}>
          {tabs.map(tab => {
            const TabPage = PAGE_MAP[tab.page];
            const lbl     = getPageLabel(tab.page);
            return (
              <div key={tab.id} style={{ position:'absolute', inset:0, overflow:'auto', display: tab.id === activeTabId ? 'block' : 'none' }}>
                {TabPage
                  ? <TabPage user={user}/>
                  : <ComingSoon label={lbl.label} icon={lbl.icon} theme={T}/>
                }
              </div>
            );
          })}
        </div>
      </div>
      {inAppBrowserUrl && (
        <div style={{ position:'fixed', inset:0, zIndex:3000, background:'rgba(2,6,23,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ width:'min(1080px,96vw)', height:'min(820px,92vh)', background:'#ffffff', border:'1px solid #d9e2f2', borderRadius:14, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderBottom:'1px solid #d9e2f2', background:'#f8fbff' }}>
              <div style={{ color:'#0f172a', fontSize:13, fontWeight:700 }}>واتساب داخل التطبيق</div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setInAppBrowserUrl('')}
                  style={{ background:'#ef444422', border:'1px solid #ef444444', borderRadius:8, color:'#ef4444', padding:'6px 10px', cursor:'pointer', fontFamily:"'Cairo'", fontSize:12 }}>
                  إغلاق
                </button>
              </div>
            </div>
            <iframe
              src={inAppBrowserUrl}
              title="In App Browser"
              style={{ border:'none', width:'100%', height:'100%', background:'#fff' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ComingSoon({ label, icon, theme: T }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', fontFamily:"'Cairo'" }}>
      <div style={{ fontSize:60, marginBottom:16 }}>{icon}</div>
      <div style={{ color:T.accent, fontSize:22, fontWeight:800, marginBottom:8 }}>{label}</div>
      <div style={{ color:T.textMuted, fontSize:14 }}>هذه الصفحة قيد التطوير</div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner/>
    </ThemeProvider>
  );
}
