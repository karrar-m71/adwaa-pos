import { PRICE_MODES } from '../../utils/pricing';
import { SALES_UI as UI } from './salesListShared';

export function SalesWorkspaceView({
  popup,
  onClosePopup,
  ProductPopupComponent,
  showRate,
  onHideRate,
  onShowList,
  tabs,
  activeTab,
  onSelectTab,
  onCloseTab,
  onAddTab,
  priceMode,
  onPriceModeChange,
  currency,
  onCurrencyChange,
  rate,
  onToggleRate,
  onRateChange,
  onRateFieldDoubleClick,
  search,
  onSearchChange,
  onSearchEnter,
  cats,
  catFilter,
  onCategoryChange,
  productCards,
  cartPanels,
}) {
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0, fontFamily:"'Cairo'", direction:'rtl', overflow:'hidden', background:UI.bg }}>
      {popup && <ProductPopupComponent {...popup} onClose={onClosePopup} />}
      {showRate && <div style={{ position:'fixed', inset:0, zIndex:700 }} onClick={onHideRate} />}

      <div style={{ background:UI.panel, borderBottom:`1px solid ${UI.border}`, display:'flex', alignItems:'flex-end', padding:'4px 8px 0', flexShrink:0, gap:2, overflowX:'auto' }}>
        <button onClick={onShowList} style={{ background:UI.soft, border:`1px solid ${UI.border}`, borderBottom:'none', borderRadius:'7px 7px 0 0', padding:'5px 12px', color:UI.muted, cursor:'pointer', fontSize:10, fontWeight:600, flexShrink:0, marginLeft:4 }}>
          📋 القائمة
        </button>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            style={{ display:'flex', alignItems:'center', gap:5, background:activeTab === tab.id ? UI.panel : UI.soft, border:`1px solid ${activeTab === tab.id ? UI.accent : UI.border}`, borderBottom:'none', borderRadius:'7px 7px 0 0', padding:'5px 10px', cursor:'pointer', flexShrink:0, position:'relative', top:1 }}
          >
            <span onClick={() => onSelectTab(tab.id)} style={{ color:activeTab === tab.id ? UI.accent : UI.muted, fontSize:10, fontWeight:activeTab === tab.id ? 700 : 400, whiteSpace:'nowrap' }}>
              🧾 {tab.label}
            </span>
            {tabs.length > 1 && <span onClick={(event) => { event.stopPropagation(); onCloseTab(tab.id); }} style={{ color:UI.subtle, fontSize:11, cursor:'pointer', padding:'0 1px' }}>✕</span>}
          </div>
        ))}
        <button onClick={onAddTab} style={{ background:'none', border:`1px solid ${UI.border}`, borderBottom:'none', borderRadius:'7px 7px 0 0', color:UI.muted, cursor:'pointer', fontSize:16, padding:'3px 10px', flexShrink:0 }} title="فاتورة جديدة">＋</button>

        <div style={{ marginRight:'auto', display:'flex', gap:6, alignItems:'center', paddingBottom:4, flexShrink:0 }}>
          {Object.entries(PRICE_MODES).map(([mode, meta]) => (
            <button
              key={mode}
              onClick={() => onPriceModeChange(mode)}
              style={{ background:priceMode === mode ? UI.purpleSoft : 'transparent', color:priceMode === mode ? UI.purple : UI.muted, border:`1px solid ${priceMode === mode ? UI.purple : UI.border}`, borderRadius:7, padding:'3px 8px', fontSize:9, cursor:'pointer', fontWeight:priceMode === mode ? 700 : 400 }}
            >
              {meta.label}
            </button>
          ))}
          {['IQD', 'USD'].map((code) => (
            <button
              key={code}
              onClick={() => onCurrencyChange(code)}
              style={{ background:currency === code ? UI.accentSoft : 'transparent', color:currency === code ? UI.accent : UI.muted, border:`1px solid ${currency === code ? UI.accent : UI.border}`, borderRadius:7, padding:'3px 8px', fontSize:9, cursor:'pointer', fontWeight:currency === code ? 700 : 400 }}
            >
              {code === 'IQD' ? 'دينار' : 'دولار $'}
            </button>
          ))}
          {currency === 'USD' && (
            <div style={{ position:'relative' }}>
              <button onClick={onToggleRate} style={{ background:UI.infoSoft, border:'1px solid #93c5fd', borderRadius:7, padding:'3px 8px', color:UI.info, fontSize:9, cursor:'pointer', fontWeight:700 }}>
                1$={rate.toLocaleString()} د.ع
              </button>
              {showRate && (
                <div style={{ position:'absolute', bottom:'110%', left:0, background:UI.panel, border:`1px solid ${UI.border}`, borderRadius:10, padding:10, zIndex:800, boxShadow:'0 10px 30px rgba(15,23,42,0.12)' }}>
                  <div style={{ color:UI.muted, fontSize:10, marginBottom:5 }}>سعر الصرف</div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={rate}
                    onChange={(event) => onRateChange(event.target.value)}
                    onDoubleClick={onRateFieldDoubleClick}
                    autoFocus
                    style={{ width:90, background:'#fff', border:'1px solid #93c5fd', borderRadius:6, padding:'5px 7px', color:UI.info, fontSize:13, outline:'none', fontWeight:700 }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'auto', flexWrap:'wrap', alignItems:'stretch', minHeight:0 }}>
        <div style={{ flex:'999 1 540px', minWidth:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'6px 10px', borderBottom:`1px solid ${UI.border}` }}>
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={onSearchEnter}
              placeholder="🔍 اسم / باركود..."
              style={{ width:'100%', background:'#fff', border:`1px solid ${UI.border}`, borderRadius:9, padding:'7px 12px', color:UI.text, fontSize:12, outline:'none', boxSizing:'border-box', marginBottom:5 }}
            />
            <div style={{ display:'flex', gap:5, overflowX:'auto', paddingBottom:2 }}>
              {cats.map((category) => (
                <button
                  key={category}
                  onClick={() => onCategoryChange(category)}
                  style={{ background:catFilter === category ? UI.accent : '#fff', color:catFilter === category ? '#fff' : UI.muted, border:`1px solid ${catFilter === category ? UI.accent : UI.border}`, borderRadius:20, padding:'3px 10px', fontSize:10, cursor:'pointer', whiteSpace:'nowrap', fontWeight:catFilter === category ? 700 : 400 }}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:8, minHeight:280 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(120px, 1fr))', gap:7 }}>
              {productCards}
            </div>
          </div>
        </div>

        {cartPanels}
      </div>
    </div>
  );
}
