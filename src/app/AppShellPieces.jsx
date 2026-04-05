export function AppShellStyles({ theme, isCompactSidebar }) {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Bebas+Neue&display=swap');
      *{margin:0;padding:0;box-sizing:border-box}
      ::-webkit-scrollbar{width:3px;height:3px}
      ::-webkit-scrollbar-thumb{background:${theme.border};border-radius:4px}
      input,select,textarea,button{font-family:'Cairo',sans-serif!important}
      @keyframes fadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
      @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      .nav-item:hover{background:${theme.accent}10!important}
      .nav-child:hover{background:${theme.accent}15!important}
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
          border-bottom:1px solid ${theme.border};
        }
        .app-main{min-height:0}
      }
    `}</style>
  );
}

export function AppSidebar({
  theme,
  logo,
  user,
  navItems,
  openMenus,
  activePage,
  tabs,
  isCompactSidebar,
  onToggleMenu,
  onOpenPage,
  onLogout,
}) {
  return (
    <div className="app-sidebar" style={{ background:theme.sidebar, borderLeft:`1px solid ${theme.border}`, display:'flex', flexDirection:'column', flexShrink:0, overflow:'hidden', transition:'width .2s' }}>
      <div style={{ padding:isCompactSidebar ? '12px 10px' : '16px 20px', borderBottom:`1px solid ${theme.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:10, overflow:'hidden', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:logo ? 'transparent' : theme.accent, fontSize:20 }}>
            {logo ? <img src={logo} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="logo"/> : '💡'}
          </div>
          {!isCompactSidebar && <div>
            <div style={{ fontFamily:"'Bebas Neue'", color:theme.accent, fontSize:16, letterSpacing:2 }}>أضواء المدينة</div>
            <div style={{ color:theme.textMuted, fontSize:9 }}>نظام إدارة متكامل</div>
          </div>}
        </div>
      </div>

      <div style={{ padding:isCompactSidebar ? '10px' : '10px 20px', borderBottom:`1px solid ${theme.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:30, height:30, borderRadius:8, background:`${theme.accent}22`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>👤</div>
          {!isCompactSidebar && <div>
            <div style={{ color:theme.text, fontSize:11, fontWeight:700 }}>{user.name}</div>
            <div style={{ color:theme.accent, fontSize:9, fontWeight:700 }}>{user.role}</div>
          </div>}
        </div>
      </div>

      <nav style={{ flex:1, overflowY:'auto', padding:'6px 0' }}>
        {navItems.map((item) => {
          if (!item.children) {
            return (
              <button key={item.id} className="nav-item" onClick={() => onOpenPage(item.page)}
                title={item.label}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:isCompactSidebar?'9px 10px':'9px 16px', border:'none', cursor:'pointer', marginBottom:1, background:activePage===item.page?`${theme.accent}18`:'transparent', textAlign:'right' }}>
                <span style={{ fontSize:15, opacity:activePage===item.page?1:0.35 }}>{item.icon}</span>
                {!isCompactSidebar && <span style={{ color:activePage===item.page?theme.accent:theme.textMuted, fontSize:12, fontWeight:activePage===item.page?700:400, flex:1 }}>{item.label}</span>}
                {activePage===item.page && <div style={{ width:3, height:14, borderRadius:2, background:theme.accent }}/>}
              </button>
            );
          }

          const isOpen = openMenus[item.id];
          const hasActive = item.children.some((child) => tabs.some((tab) => tab.page === child.page));
          return (
            <div key={item.id}>
              <button className="nav-item" onClick={() => onToggleMenu(item.id)}
                title={item.label}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:isCompactSidebar?'9px 10px':'9px 16px', border:'none', cursor:'pointer', marginBottom:1, background:hasActive?`${theme.accent}08`:'transparent', textAlign:'right' }}>
                <span style={{ fontSize:15, opacity:hasActive||isOpen?1:0.35 }}>{item.icon}</span>
                {!isCompactSidebar && <span style={{ color:hasActive?item.color||theme.accent:theme.textMuted, fontSize:12, fontWeight:hasActive?700:400, flex:1 }}>{item.label}</span>}
                {!isCompactSidebar && <span style={{ color:theme.textMuted, fontSize:10, transition:'transform .2s', transform:isOpen?'rotate(90deg)':'rotate(0)' }}>▶</span>}
              </button>
              {isOpen && !isCompactSidebar && (
                <div style={{ background:theme.bg, borderRight:`2px solid ${item.color||theme.accent}22` }}>
                  {item.children.map((child) => {
                    const isTabOpen = tabs.some((tab) => tab.page === child.page);
                    const isActive = activePage === child.page;
                    return (
                      <button key={child.page} className="nav-child" onClick={() => onOpenPage(child.page)}
                        style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 16px 8px 24px', border:'none', cursor:'pointer', background:isActive?`${item.color||theme.accent}18`:'transparent', textAlign:'right' }}>
                        <span style={{ fontSize:13, opacity:isActive?1:0.3 }}>{child.icon}</span>
                        <span style={{ color:isActive?item.color||theme.accent:theme.textMuted, fontSize:11, fontWeight:isActive?700:400, flex:1 }}>{child.label}</span>
                        {isActive && <div style={{ width:3, height:12, borderRadius:2, background:item.color||theme.accent }}/>}
                        {isTabOpen && !isActive && <div style={{ width:5, height:5, borderRadius:'50%', background:item.color||theme.accent, opacity:0.5 }}/>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div style={{ padding:isCompactSidebar ? '10px 8px' : '10px 12px', borderTop:`1px solid ${theme.border}`, flexShrink:0 }}>
        <button onClick={onLogout}
          style={{ width:'100%', background:'#ef444411', border:'1px solid #ef444433', borderRadius:8, padding:'8px', color:'#ef4444', cursor:'pointer', fontSize:11, fontWeight:700 }}>
          {isCompactSidebar ? '🚪' : '🚪 تسجيل الخروج'}
        </button>
      </div>
    </div>
  );
}

export function AppHeader({
  theme,
  tabs,
  activeTabId,
  syncBadge,
  syncBadgeLabel,
  isDesktopApp,
  onSelectTab,
  onCloseTab,
  getPageLabel,
}) {
  return (
    <div style={{ background:theme.sidebar, borderBottom:`1px solid ${theme.border}`, flexShrink:0 }} className={isDesktopApp ? 'desktop-drag-region' : ''}>
      <div style={{ display:'flex', alignItems:'stretch', overflowX:'auto', padding:'5px 8px 0', gap:2, minHeight:38 }} className="desktop-no-drag">
        {tabs.map((tab) => {
          const lbl = getPageLabel(tab.page);
          const isActive = tab.id === activeTabId;
          return (
            <div key={tab.id} className="tab-btn"
              onClick={() => onSelectTab(tab.id)}
              style={{ display:'flex', alignItems:'center', gap:4, background:isActive ? theme.bg : `${theme.accent}08`, border:`1px solid ${isActive ? theme.accent+'66' : theme.border}`, borderBottom:isActive ? `1px solid ${theme.bg}` : `1px solid ${theme.border}`, borderRadius:'7px 7px 0 0', padding:'4px 10px', cursor:'pointer', flexShrink:0, position:'relative', top:1, transition:'background .15s' }}>
              <span style={{ fontSize:11 }}>{lbl.icon}</span>
              <span style={{ color:isActive ? theme.accent : theme.textMuted, fontSize:10, fontWeight:isActive?700:400, whiteSpace:'nowrap', maxWidth:90, overflow:'hidden', textOverflow:'ellipsis' }}>
                {lbl.label}
              </span>
              {tabs.length > 1 && (
                <span className="tab-close"
                  onClick={(event) => { event.stopPropagation(); onCloseTab(tab.id); }}
                  style={{ color:theme.textMuted, fontSize:9, cursor:'pointer', opacity:0, marginRight:1, lineHeight:1, padding:'1px 2px', borderRadius:3, transition:'opacity .15s' }}>
                  ✕
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'3px 16px 5px' }}>
        <div style={{ color:theme.textMuted, fontSize:10 }}>
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
  );
}

export function AppBrowserModal({ url, onClose }) {
  if (!url) return null;
  return (
    <div style={{ position:'fixed', inset:0, zIndex:3000, background:'rgba(2,6,23,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ width:'min(1080px,96vw)', height:'min(820px,92vh)', background:'#ffffff', border:'1px solid #d9e2f2', borderRadius:14, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderBottom:'1px solid #d9e2f2', background:'#f8fbff' }}>
          <div style={{ color:'#0f172a', fontSize:13, fontWeight:700 }}>واتساب داخل التطبيق</div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onClose}
              style={{ background:'#ef444422', border:'1px solid #ef444444', borderRadius:8, color:'#ef4444', padding:'6px 10px', cursor:'pointer', fontFamily:"'Cairo'", fontSize:12 }}>
              إغلاق
            </button>
          </div>
        </div>
        <iframe src={url} title="In App Browser" style={{ border:'none', width:'100%', height:'100%', background:'#fff' }} />
      </div>
    </div>
  );
}

export function ComingSoon({ label, icon, theme }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', fontFamily:"'Cairo'" }}>
      <div style={{ fontSize:60, marginBottom:16 }}>{icon}</div>
      <div style={{ color:theme.accent, fontSize:22, fontWeight:800, marginBottom:8 }}>{label}</div>
      <div style={{ color:theme.textMuted, fontSize:14 }}>هذه الصفحة قيد التطوير</div>
    </div>
  );
}

export function UnauthorizedPage({ label, theme }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', fontFamily:"'Cairo'" }}>
      <div style={{ fontSize:56, marginBottom:16 }}>🔒</div>
      <div style={{ color:theme.accent, fontSize:22, fontWeight:800, marginBottom:8 }}>{label}</div>
      <div style={{ color:theme.textMuted, fontSize:14 }}>ليس لديك صلاحية للوصول إلى هذه الصفحة</div>
    </div>
  );
}

export function PageLoading({ label, theme }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', fontFamily:"'Cairo'" }}>
      <div style={{ width:46, height:46, borderRadius:'50%', border:`4px solid ${theme.border}`, borderTopColor:theme.accent, animation:'spin .8s linear infinite', marginBottom:14 }} />
      <div style={{ color:theme.accent, fontSize:18, fontWeight:800, marginBottom:6 }}>{label}</div>
      <div style={{ color:theme.textMuted, fontSize:13 }}>جارٍ تحميل الصفحة...</div>
    </div>
  );
}
