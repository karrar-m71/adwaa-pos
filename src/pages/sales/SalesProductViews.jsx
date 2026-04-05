import { memo } from 'react';
import { getUnitPriceByMode, PRICE_MODES } from '../../utils/pricing';
import { resolveImageUrl, resolvePackageMeta, SALES_UI as UI } from './salesListShared';

export function ProductPopup({ product, pkg, pos, onClose }) {
  const pkgMeta = resolvePackageMeta(product, pkg);
  const supportsPackage = Boolean(pkgMeta);
  return (
    <div style={{ position:'fixed', inset:0, zIndex:900 }} onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()} style={{
        position:'fixed',
        top: Math.min(pos.y, window.innerHeight - 380),
        left: Math.min(pos.x, window.innerWidth - 300),
        zIndex:901, background:UI.panel, border:`1px solid ${UI.border}`,
        borderRadius:16, padding:20, width:280,
        boxShadow:'0 16px 40px rgba(15,23,42,0.12)', direction:'rtl',
      }}>
        <div style={{ display:'flex', gap:12, marginBottom:14, alignItems:'center' }}>
          {product.imgUrl
            ? <img src={resolveImageUrl(product.imgUrl)} loading="lazy" decoding="async" style={{ width:64, height:64, borderRadius:10, objectFit:'cover' }} alt=""
                onError={(event) => { event.target.style.display = 'none'; }}/>
            : <div style={{ width:64, height:64, borderRadius:10, background:UI.soft, border:`1px solid ${UI.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:36 }}>{product.img || '📦'}</div>}
          <div>
            <div style={{ color:UI.text, fontSize:15, fontWeight:800 }}>{product.name}</div>
            <div style={{ color:UI.muted, fontSize:11 }}>{product.cat}</div>
            {product.barcode && <div style={{ color:UI.subtle, fontSize:10, fontFamily:'monospace' }}>{product.barcode}</div>}
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
          {[
            ['سعر الشراء', (product.buyPrice || 0).toLocaleString('ar-IQ') + ' د.ع', '#f59e0b'],
            ['سعر البيع', (product.sellPrice || 0).toLocaleString('ar-IQ') + ' د.ع', '#F5C800'],
            ['سعر الجملة', (product.wholesalePrice || 0).toLocaleString('ar-IQ') + ' د.ع', '#3b82f6'],
            ['المخزون', (product.stock || 0) + ' وحدة', (product.stock || 0) <= 0 ? '#ef4444' : '#10b981'],
          ].map(([label, value, color]) => (
            <div key={label} style={{ background:UI.soft, border:`1px solid ${UI.borderSoft}`, borderRadius:8, padding:'8px', textAlign:'center' }}>
              <div style={{ color:UI.muted, fontSize:10, marginBottom:2 }}>{label}</div>
              <div style={{ color, fontSize:12, fontWeight:700 }}>{value}</div>
            </div>
          ))}
        </div>
        {supportsPackage && (
          <div style={{ background:UI.purpleSoft, border:'1px solid #d8b4fe', borderRadius:10, padding:10, marginBottom:10 }}>
            <div style={{ color:UI.purple, fontSize:11, fontWeight:700, marginBottom:4 }}>📦 التعبئة: {pkgMeta.name}</div>
            <div style={{ color:UI.muted, fontSize:11 }}>{pkgMeta.qty} {pkgMeta.unit}</div>
            <div style={{ color:UI.success, fontSize:12, fontWeight:700 }}>
              {(product.packagePrice || (product.sellPrice * pkgMeta.qty)).toLocaleString('ar-IQ')} د.ع
            </div>
          </div>
        )}
        {product.desc && <div style={{ color:UI.muted, fontSize:11, borderTop:`1px solid ${UI.borderSoft}`, paddingTop:10 }}>{product.desc}</div>}
        <button onClick={onClose} style={{ width:'100%', background:UI.soft, border:`1px solid ${UI.border}`, borderRadius:8, padding:'7px', color:UI.muted, cursor:'pointer', fontFamily:"'Cairo'", marginTop:10 }}>إغلاق ✕</button>
      </div>
    </div>
  );
}

export const PCard = memo(function PCard({ p, packageMap, onAdd, onInfo, priceMode }) {
  const pkg = packageMap[p.packageTypeId] || null;
  const pkgMeta = resolvePackageMeta(p, pkg);
  const supportsPackage = Boolean(pkgMeta);
  const low = (p.stock || 0) <= 0;
  const unitPrice = getUnitPriceByMode(p, priceMode);
  const priceModeLabel = PRICE_MODES[priceMode]?.label || 'مفرد';
  return (
    <div onContextMenu={(event) => { event.preventDefault(); onInfo(event, p, pkg); }}
      style={{ background:UI.panel, borderRadius:11, border:`1px solid ${low ? '#fecaca' : UI.border}`, overflow:'hidden', position:'relative', boxShadow:'0 6px 18px rgba(15,23,42,0.04)' }}>
      {low && <div style={{ position:'absolute', top:5, right:5, background:UI.danger, borderRadius:20, padding:'1px 5px', fontSize:8, color:'#fff', fontWeight:700, zIndex:1 }}>نفد</div>}
      <div style={{ padding:'8px 8px 4px', textAlign:'center' }}>
        {p.imgUrl
          ? <img src={resolveImageUrl(p.imgUrl)} loading="lazy" decoding="async" style={{ width:48, height:48, objectFit:'cover', borderRadius:7, marginBottom:4 }} alt=""
              onError={(event) => { event.target.style.display = 'none'; }}/>
          : <div style={{ fontSize:28, marginBottom:4 }}>{p.img || '📦'}</div>}
        <div style={{ color:UI.text, fontSize:10, fontWeight:600, marginBottom:1, lineHeight:1.3 }} title={p.name}>
          {p.name?.length > 13 ? p.name.slice(0, 13) + '…' : p.name}
        </div>
        <div style={{ color:UI.muted, fontSize:9 }}>{p.stock || 0}</div>
      </div>
      {supportsPackage ? (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', borderTop:`1px solid ${UI.borderSoft}` }}>
          <button onClick={() => onAdd(p, 'unit')}
            style={{ padding:'7px 2px', background:'none', border:'none', borderLeft:`1px solid ${UI.borderSoft}`, cursor:'pointer', textAlign:'center' }}
            onMouseEnter={(event) => { event.currentTarget.style.background = UI.accentSoft; }}
            onMouseLeave={(event) => { event.currentTarget.style.background = 'none'; }}>
            <div style={{ color:UI.accent, fontSize:10, fontWeight:800 }}>{unitPrice.toLocaleString('ar-IQ')}</div>
            <div style={{ color:UI.muted, fontSize:8 }}>{priceModeLabel}</div>
          </button>
          <button onClick={() => onAdd(p, 'package')}
            style={{ padding:'7px 2px', background:'none', border:'none', cursor:'pointer', textAlign:'center' }}
            onMouseEnter={(event) => { event.currentTarget.style.background = UI.purpleSoft; }}
            onMouseLeave={(event) => { event.currentTarget.style.background = 'none'; }}>
            <div style={{ color:UI.purple, fontSize:10, fontWeight:800 }}>
              {(p.packagePrice || (p.sellPrice * pkgMeta.qty)).toLocaleString('ar-IQ')}
            </div>
            <div style={{ color:UI.muted, fontSize:8 }}>{pkgMeta.name}</div>
          </button>
        </div>
      ) : (
        <button onClick={() => onAdd(p, 'unit')}
          style={{ width:'100%', padding:'7px', background:'none', border:'none', borderTop:`1px solid ${UI.borderSoft}`, cursor:'pointer' }}
          onMouseEnter={(event) => { event.currentTarget.style.background = UI.accentSoft; }}
          onMouseLeave={(event) => { event.currentTarget.style.background = 'none'; }}>
          <div style={{ color:UI.accent, fontSize:11, fontWeight:800 }}>{unitPrice.toLocaleString('ar-IQ')} د.ع</div>
        </button>
      )}
    </div>
  );
});
