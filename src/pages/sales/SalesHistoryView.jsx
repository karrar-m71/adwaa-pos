import { fmtCur, SALES_UI as UI, toDisplay } from './salesListShared';

const HEADERS = ['رقم الفاتورة', 'الزبون', 'المبلغ الكلي', 'الواصل', 'المتبقي', 'الدفع', 'الكاشير', 'التاريخ', '', '', ''];

export function SalesHistoryView({
  listSales,
  listSearchInput,
  onListSearchInputChange,
  onResetSearch,
  onCreateSale,
  onPrint,
  onEdit,
  onRemove,
  rowActionState,
}) {
  return (
    <div style={{ padding:20, fontFamily:"'Cairo'", direction:'rtl', background:UI.bg, minHeight:'100%' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ color:UI.text, fontSize:20, fontWeight:800 }}>🧾 قائمة فواتير البيع</div>
        <button onClick={onCreateSale} style={{ background:UI.accent, color:'#fff', border:'none', borderRadius:12, padding:'9px 18px', fontWeight:800, cursor:'pointer', fontSize:13 }}>+ بيع جديد</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, marginBottom:12 }}>
        <input
          value={listSearchInput}
          onChange={(event) => onListSearchInputChange(event.target.value)}
          placeholder="بحث برقم الفاتورة / الزبون / التاريخ / الكاشير"
          style={{ width:'100%', background:'#fff', border:`1px solid ${UI.border}`, borderRadius:10, padding:'10px 12px', color:UI.text, fontSize:12, outline:'none', boxSizing:'border-box' }}
        />
        <button onClick={onResetSearch} style={{ background:'#fff', border:`1px solid ${UI.border}`, borderRadius:10, padding:'10px 12px', color:UI.muted, cursor:'pointer', fontFamily:"'Cairo'", fontSize:12 }}>
          إعادة ضبط
        </button>
      </div>
      <div style={{ background:UI.panel, borderRadius:14, border:`1px solid ${UI.border}`, overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1.3fr 1fr 1fr 1fr 1fr 1fr 1fr auto auto auto', padding:'11px 18px', background:UI.soft, borderBottom:`1px solid ${UI.borderSoft}` }}>
          {HEADERS.map((header) => (
            <div key={header} style={{ color:UI.muted, fontSize:10, fontWeight:700 }}>{header}</div>
          ))}
        </div>
        {listSales.length === 0 ? <div style={{ color:UI.subtle, textAlign:'center', padding:60 }}>لا توجد فواتير</div>
          : listSales.map((sale, index) => (
            <div key={sale.id} style={{ display:'grid', gridTemplateColumns:'1fr 1.3fr 1fr 1fr 1fr 1fr 1fr 1fr auto auto auto', padding:'10px 18px', borderBottom:index < listSales.length - 1 ? `1px solid ${UI.borderSoft}` : 'none', alignItems:'center', background:index % 2 === 0 ? 'transparent' : UI.soft }}>
              <div style={{ color:UI.success, fontSize:11, fontWeight:700 }}>{sale.invoiceNo}</div>
              <div style={{ color:UI.text, fontSize:11 }}>{sale.customer}</div>
              <div style={{ color:UI.accent, fontSize:12, fontWeight:800 }}>{fmtCur(toDisplay(sale.total || 0, sale.currency || 'IQD', sale.exchangeRate || 1), sale.currency || 'IQD')}</div>
              <div style={{ color:UI.info, fontSize:11, fontWeight:700 }}>{fmtCur(toDisplay((sale.receivedAmount ?? sale.cash ?? 0), sale.currency || 'IQD', sale.exchangeRate || 1), sale.currency || 'IQD')}</div>
              <div style={{ color:(sale.remainingAmount || 0) > 0 ? '#f59e0b' : UI.success, fontSize:11, fontWeight:700 }}>{fmtCur(toDisplay((sale.remainingAmount || 0), sale.currency || 'IQD', sale.exchangeRate || 1), sale.currency || 'IQD')}</div>
              <span style={{ background:sale.paymentMethod === 'آجل' ? '#fff7ed' : sale.paymentMethod === 'نقدي' ? UI.successSoft : UI.infoSoft, borderRadius:20, padding:'2px 7px', color:sale.paymentMethod === 'آجل' ? '#f59e0b' : sale.paymentMethod === 'نقدي' ? UI.success : UI.info, fontSize:9, fontWeight:700, display:'inline-block' }}>{sale.paymentMethod}</span>
              <div style={{ color:UI.muted, fontSize:10 }}>{sale.cashier}</div>
              <div style={{ color:UI.subtle, fontSize:9 }}>{sale.dateISO}</div>
              <button disabled={Boolean(rowActionState[sale.id])} onClick={() => onPrint(sale.id)} style={{ background:UI.infoSoft, border:'1px solid #93c5fd', borderRadius:8, padding:'4px 10px', color:UI.info, fontSize:10, cursor:rowActionState[sale.id] ? 'wait' : 'pointer', fontFamily:"'Cairo'", fontWeight:700, opacity:rowActionState[sale.id] ? 0.7 : 1 }}>
                {rowActionState[sale.id] === 'print' ? '...' : 'طباعة'}
              </button>
              <button disabled={Boolean(rowActionState[sale.id])} onClick={() => onEdit(sale.id)} style={{ background:UI.accentSoft, border:'1px solid #fcd34d', borderRadius:8, padding:'4px 10px', color:UI.accent, fontSize:10, cursor:rowActionState[sale.id] ? 'wait' : 'pointer', fontFamily:"'Cairo'", fontWeight:700, opacity:rowActionState[sale.id] ? 0.7 : 1 }}>
                {rowActionState[sale.id] === 'edit' ? '...' : 'تعديل'}
              </button>
              <button onClick={() => onRemove(sale)} style={{ background:UI.dangerSoft, border:'1px solid #fca5a5', borderRadius:8, padding:'4px 10px', color:UI.danger, fontSize:10, cursor:'pointer', fontFamily:"'Cairo'", fontWeight:700 }}>
                حذف
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
