import { Suspense, useEffect, useRef, useState } from 'react';
import { waitForPendingWrites } from 'firebase/firestore';
import { ThemeProvider, useTheme } from './ThemeContext';
import { db } from './firebase';
import { startOfflineImageQueueWorker } from './utils/offlineImageQueue';
import { canAccessPage, hasSectionAccess } from './utils/permissions';
import Login from './pages/Login';
import { AppBrowserModal, AppHeader, AppShellStyles, AppSidebar, ComingSoon, PageLoading, UnauthorizedPage } from './app/AppShellPieces';
import { getPageLabel, NAV, PAGE_MAP } from './app/pageRegistry';

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
    if (!canAccessPage(user, page)) return;
    if (user?.mustChangePassword && page !== 'change_password') return;
    const existing = tabs.find(t => t.page === page);
    if (existing) { setActiveTabId(existing.id); return; }
    const id = nextTabId.current++;
    setTabs(t => [...t, { id, page }]);
    setActiveTabId(id);
  };

  const closeTab = (id) => {
    if (tabs.length === 1) return;
    const targetTab = tabs.find((tab) => tab.id === id);
    if (user?.mustChangePassword && targetTab?.page === 'change_password') return;
    const idx = tabs.findIndex(t => t.id === id);
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);
    if (activeTabId === id) setActiveTabId(newTabs[Math.max(0, idx - 1)].id);
  };

  const allowedNav  = NAV.filter(n => hasSectionAccess(user, n.id));
  const hasForcedPasswordTab = tabs.some((tab) => tab.page === 'change_password');
  const effectiveTabs = user?.mustChangePassword && !hasForcedPasswordTab
    ? [{ id: 1, page: 'change_password' }]
    : tabs;
  const changePasswordTabId = effectiveTabs.find((tab) => tab.page === 'change_password')?.id || 1;
  const effectiveActiveTabId = user?.mustChangePassword
    ? changePasswordTabId
    : (effectiveTabs.some((tab) => tab.id === activeTabId) ? activeTabId : effectiveTabs[0]?.id);
  const activeTab = effectiveTabs.find((tab) => tab.id === effectiveActiveTabId);
  const activePage = activeTab?.page;

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
      <AppShellStyles theme={T} isCompactSidebar={isCompactSidebar} />
      <AppSidebar
        theme={T}
        logo={logo}
        user={user}
        navItems={allowedNav}
        openMenus={openMenus}
        activePage={activePage}
        tabs={effectiveTabs}
        isCompactSidebar={isCompactSidebar}
        onToggleMenu={toggleMenu}
        onOpenPage={openPage}
        onLogout={() => { if (confirm('تسجيل الخروج؟')) setUser(null); }}
      />

      <div className="app-main" style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <AppHeader
          theme={T}
          tabs={effectiveTabs}
          activeTabId={effectiveActiveTabId}
          syncBadge={syncBadge}
          syncBadgeLabel={syncBadgeLabel}
          isDesktopApp={isDesktopApp}
          onSelectTab={setActiveTabId}
          onCloseTab={closeTab}
          getPageLabel={getPageLabel}
        />
        <div style={{ flex:1, position:'relative', background:T.bg, minWidth:0 }}>
          {effectiveTabs.map(tab => {
            const TabPage = PAGE_MAP[tab.page];
            const lbl     = getPageLabel(tab.page);
            return (
              <div key={tab.id} style={{ position:'absolute', inset:0, overflow:'auto', display: tab.id === effectiveActiveTabId ? 'block' : 'none' }}>
                {!canAccessPage(user, tab.page)
                  ? <UnauthorizedPage label={lbl.label} theme={T}/>
                  : TabPage
                  ? (
                    <Suspense fallback={<PageLoading label={lbl.label} theme={T}/>}>
                      <TabPage user={user}/>
                    </Suspense>
                  )
                  : <ComingSoon label={lbl.label} icon={lbl.icon} theme={T}/>
                }
              </div>
            );
          })}
        </div>
      </div>
      <AppBrowserModal url={inAppBrowserUrl} onClose={() => setInAppBrowserUrl('')} />
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
