import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import jsPDF from 'jspdf';

function BarcodeDisplay({ value, width=200, height=60, showText=true }) {
  if(!value) return null;
  const barW=(width-20)/(value.length*8);
  const bars=[];
  let x=10;
  const patterns=[1,2,3,2,1,1,2,3,1,2];
  bars.push(<rect key="s1" x={2} y={0} width={3} height={height-16} fill="#000"/>);
  bars.push(<rect key="s2" x={8} y={0} width={2} height={height-16} fill="#000"/>);
  for(let i=0;i<value.length;i++){
    const d=parseInt(value[i])||0;
    const bw=patterns[d]*barW;
    bars.push(<rect key={`b${i}`} x={x} y={0} width={bw} height={height-16} fill="#000"/>);
    x+=bw+barW;
  }
  return(
    <svg width={width} height={height} xmlns="http://www.w3.org/2000/svg" style={{background:'#fff',display:'block'}}>
      <rect width={width} height={height} fill="white"/>
      {bars}
      {showText&&<text x={width/2} y={height-2} textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#000">{value}</text>}
    </svg>
  );
}

const SIZES=[
  {id:'small', label:'صغير', w:100,h:60, cols:4, desc:'4×6 سم'},
  {id:'medium',label:'متوسط',w:150,h:80, cols:3, desc:'5×8 سم'},
  {id:'large', label:'كبير', w:200,h:100,cols:2, desc:'7×10 سم'},
];

export default function BarcodePrint({ user }) {
  const [products, setProducts]=useState([]);
  const [packages, setPackages]=useState([]);
  const [selected, setSelected]=useState([]);
  const [search,   setSearch]  =useState('');
  const [sizeId,   setSizeId]  =useState('medium');
  const [showPrice,setShowPrice]=useState(true);
  const [showName, setShowName]=useState(true);
  const [usePkg,   setUsePkg]  =useState(false);
  const [catFilter,setCatFilter]=useState('الكل');

  useEffect(()=>{
    const u1=onSnapshot(collection(db,'pos_products'),s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u2=onSnapshot(collection(db,'pos_packages'),s=>setPackages(s.docs.map(d=>({...d.data(),id:d.id}))));
    return()=>{u1();u2();};
  },[]);

  const CATS=['الكل',...new Set(products.map(p=>p.cat).filter(Boolean))];
  const size=SIZES.find(s=>s.id===sizeId)||SIZES[1];

  const filtered=products.filter(p=>{
    const matchSearch=!search||p.name?.includes(search)||p.barcode?.includes(search);
    const matchCat=catFilter==='الكل'||p.cat===catFilter;
    const hasBarcode=usePkg?(p.hasPackage&&p.packageBarcode):p.barcode;
    return matchSearch&&matchCat&&hasBarcode;
  });

  const addProduct=(p)=>{
    const barcode=usePkg?p.packageBarcode:p.barcode;
    if(!barcode)return alert('لا يوجد باركود — أضفه من إدارة الباركود');
    const key=`${p.id}_${usePkg?'pkg':'unit'}`;
    const pkg=packages.find(pk=>pk.id===p.packageTypeId);
    setSelected(s=>{
      const ex=s.find(i=>i.key===key);
      if(ex)return s.map(i=>i.key===key?{...i,qty:i.qty+1}:i);
      return[...s,{key,id:p.id,name:p.name,barcode,
        price:usePkg?(p.packagePrice||(p.sellPrice*(p.packageQty||pkg?.qty||1))):p.sellPrice,
        type:usePkg?'تعبئة':'مفرد',packageName:pkg?.name||'',qty:1}];
    });
  };

  const updateQty=(key,v)=>setSelected(s=>s.map(i=>i.key===key?{...i,qty:Math.max(1,Number(v))}:i));
  const removeItem=(key)=>setSelected(s=>s.filter(i=>i.key!==key));
  const totalLabels=selected.reduce((s,i)=>s+i.qty,0);
  const allLabels=selected.flatMap(i=>Array(i.qty).fill(i));

  function generateBarcodeSVGStr(value,w,h){
    if(!value)return'';
    const barW=(w-20)/(value.length*8);
    const patterns=[1,2,3,2,1,1,2,3,1,2];
    let out=`<rect x="2" y="0" width="3" height="${h-16}" fill="#000"/>`;
    out+=`<rect x="8" y="0" width="2" height="${h-16}" fill="#000"/>`;
    let x=10;
    for(let i=0;i<value.length;i++){
      const d=parseInt(value[i])||0;
      const bw=patterns[d]*barW;
      out+=`<rect x="${x.toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${h-16}" fill="#000"/>`;
      x+=bw+barW;
    }
    return out;
  }

  const handlePrint=()=>{
    if(allLabels.length===0)return alert('أضف مواد أولاً');
    const win=window.open('','_blank');
    if(!win)return alert('اسمح بالنوافذ المنبثقة في المتصفح');
    const labelsHtml=allLabels.map(item=>`
      <div class="label">
        ${showName?`<div class="lname">${item.name}${item.type==='تعبئة'?` (${item.packageName})`:''}</div>`:''}
        <svg width="${size.w}" height="${size.h-22}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${size.w}" height="${size.h-22}" fill="white"/>
          ${generateBarcodeSVGStr(item.barcode,size.w,size.h-22)}
          <text x="${size.w/2}" y="${size.h-26}" text-anchor="middle" font-size="9" font-family="monospace" fill="#000">${item.barcode}</text>
        </svg>
        ${showPrice?`<div class="lprice">${item.price?.toLocaleString('ar-IQ')} د.ع</div>`:''}
      </div>
    `).join('');
    win.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>طباعة الباركود</title>
    <style>
      @media print{@page{margin:5mm}body{margin:0}}
      body{font-family:Arial,sans-serif;margin:0;padding:8px;background:#fff}
      .grid{display:grid;grid-template-columns:repeat(${size.cols},1fr);gap:3px}
      .label{border:1px solid #334155;border-radius:3px;padding:3px;text-align:center;break-inside:avoid;background:white;page-break-inside:avoid}
      .lname{font-size:9px;font-weight:bold;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;margin-bottom:2px}
      .lprice{font-size:10px;font-weight:bold;color:#000;margin-top:2px}
    </style></head><body>
    <div class="grid">${labelsHtml}</div>
    <script>window.onload=()=>{window.print();}</script>
    </body></html>`);
    win.document.close();
  };

  const exportPDF=()=>{
    if(allLabels.length===0)return alert('أضف مواد أولاً');
    const doc2=new jsPDF({orientation:'p',unit:'mm',format:'a4'});
    const pW=size.w*0.265, pH=size.h*0.265;
    const cols=size.cols, gap=1.5;
    let col=0, row=0;
    const startX=8, startY=8;
    for(const item of allLabels){
      const x=startX+col*(pW+gap);
      const y=startY+row*(pH+gap);
      doc2.setDrawColor(180);doc2.roundedRect(x,y,pW,pH,0.5,0.5);
      let ty=y+3;
      if(showName){
        doc2.setFontSize(6);doc2.setFont('helvetica','bold');
        const n=item.name.length>22?item.name.slice(0,22)+'...':item.name;
        doc2.text(n,x+pW/2,ty,{align:'center'});
        ty+=3.5;
      }
      doc2.setFontSize(7);doc2.setFont('helvetica','normal');
      doc2.text(item.barcode||'',x+pW/2,y+pH-(showPrice?5:2),{align:'center'});
      if(showPrice){
        doc2.setFontSize(7);doc2.setFont('helvetica','bold');
        doc2.text(`${item.price?.toLocaleString()||0} IQD`,x+pW/2,y+pH-1.5,{align:'center'});
      }
      col++;
      if(col>=cols){col=0;row++;}
      if(y+pH+gap+startY>285&&allLabels.indexOf(item)<allLabels.length-1){
        doc2.addPage();col=0;row=0;
      }
    }
    doc2.save(`barcodes-${Date.now()}.pdf`);
  };

  return(
    <div style={{display:'flex',height:'calc(100vh - 60px)',fontFamily:"'Cairo'",direction:'rtl',overflow:'hidden'}}>

      {/* المواد */}
      <div style={{flex:1,padding:16,overflowY:'auto',borderLeft:'1px solid #ffffff'}}>
        <div style={{color:'#fff',fontSize:18,fontWeight:800,marginBottom:14}}>🖨️ طباعة الباركود</div>

        {/* نوع */}
        <div style={{display:'flex',gap:8,marginBottom:12}}>
          {[[false,'📦 مفرد'],[true,'📦 تعبئة']].map(([val,label])=>(
            <button key={String(val)} onClick={()=>{setUsePkg(val);setSelected([]);}}
              style={{flex:1,background:usePkg===val?'#a78bfa22':'#ffffff',color:usePkg===val?'#a78bfa':'#64748b',border:`2px solid ${usePkg===val?'#a78bfa':'#cdd8ec'}`,borderRadius:10,padding:'9px 0',fontWeight:700,cursor:'pointer',fontSize:13}}>
              {label}
            </button>
          ))}
        </div>

        <div style={{display:'flex',gap:8,marginBottom:12}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث..."
            style={{flex:1,color:'#0f172a',fontSize:13,outline:'none',fontFamily:"'Cairo'"}}/>
          <select value={catFilter} onChange={e=>setCatFilter(e.target.value)}
            style={{color:'#0f172a',outline:'none'}}>
            {CATS.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10}}>
          {filtered.map(p=>{
            const barcode=usePkg?p.packageBarcode:p.barcode;
            const pkg=packages.find(pk=>pk.id===p.packageTypeId);
            const inSel=selected.find(s=>s.key===`${p.id}_${usePkg?'pkg':'unit'}`);
            return(
              <div key={p.id} onClick={()=>addProduct(p)}
                style={{background:inSel?'#F5C80011':'#ffffff',borderRadius:12,padding:12,border:`1px solid ${inSel?'#F5C80055':'#d9e2f2'}`,cursor:'pointer',transition:'border .15s'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor='#F5C800'}
                onMouseLeave={e=>e.currentTarget.style.borderColor=inSel?'#F5C80055':'#d9e2f2'}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <span style={{fontSize:18}}>{p.img||'📦'}</span>
                    <div>
                      <div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{p.name?.length>18?p.name.slice(0,18)+'...':p.name}</div>
                      {usePkg&&pkg&&<div style={{color:'#a78bfa',fontSize:10}}>{pkg.name}</div>}
                    </div>
                  </div>
                  {inSel&&<span style={{background:'#F5C800',color:'#000',fontSize:13,fontWeight:900,width:24,height:24,borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center'}}>×{inSel.qty}</span>}
                </div>
                {barcode
                  ?<BarcodeDisplay value={barcode} width={160} height={50} showText/>
                  :<div style={{color:'#ef4444',fontSize:11,textAlign:'center',padding:8,background:'#ef444411',borderRadius:8}}>❌ لا يوجد باركود</div>
                }
              </div>
            );
          })}
          {filtered.length===0&&<div style={{gridColumn:'1/-1',color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد نتائج</div>}
        </div>
      </div>

      {/* الإعدادات */}
      <div style={{width:340,padding:16,background:'#f8fbff',borderRight:'1px solid #ffffff',display:'flex',flexDirection:'column',overflowY:'auto'}}>
        <div style={{color:'#fff',fontSize:15,fontWeight:800,marginBottom:14}}>⚙️ إعدادات</div>

        {/* حجم الطابع */}
        <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:8}}>حجم الطابع</label>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:16}}>
          {SIZES.map(s=>(
            <button key={s.id} onClick={()=>setSizeId(s.id)}
              style={{background:sizeId===s.id?'#F5C80022':'#ffffff',border:`2px solid ${sizeId===s.id?'#F5C800':'#cdd8ec'}`,borderRadius:10,padding:'8px 4px',cursor:'pointer',textAlign:'center'}}>
              <div style={{color:sizeId===s.id?'#F5C800':'#1e293b',fontSize:12,fontWeight:700}}>{s.label}</div>
              <div style={{color:'#64748b',fontSize:10}}>{s.desc}</div>
            </button>
          ))}
        </div>

        {/* خيارات */}
        <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:8}}>محتوى الطابع</label>
        {[[showName,setShowName,'✏️ اسم المادة'],[showPrice,setShowPrice,'💰 السعر']].map(([val,setter,label])=>(
          <div key={label} onClick={()=>setter(!val)}
            style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 12px',background:val?'#F5C80011':'#ffffff',border:`1px solid ${val?'#F5C80033':'#cdd8ec'}`,borderRadius:10,cursor:'pointer',marginBottom:8}}>
            <span style={{color:val?'#F5C800':'#64748b',fontSize:13,fontWeight:val?700:400}}>{label}</span>
            <div style={{width:38,height:20,borderRadius:10,background:val?'#F5C800':'#cdd8ec',position:'relative',transition:'all .2s'}}>
              <div style={{position:'absolute',top:2,width:16,height:16,borderRadius:8,background:'#fff',transition:'left .2s',left:val?20:2}}/>
            </div>
          </div>
        ))}

        {/* المختارة */}
        <div style={{flex:1,overflowY:'auto',marginTop:14,marginBottom:14}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <div style={{color:'#1e293b',fontSize:13,fontWeight:700}}>قائمة الطباعة</div>
            {selected.length>0&&<button onClick={()=>setSelected([])} style={{background:'#ef444411',border:'none',borderRadius:8,padding:'3px 10px',color:'#ef4444',fontSize:11,cursor:'pointer',fontFamily:"'Cairo'"}}>مسح الكل</button>}
          </div>
          {selected.length===0
            ?<div style={{color:'#cdd8ec',textAlign:'center',padding:24,fontSize:13}}>اضغط على المواد لإضافتها</div>
            :selected.map(item=>(
              <div key={item.key} style={{background:'#ffffff',borderRadius:10,padding:10,marginBottom:8,border:'1px solid #d9e2f2'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <div>
                    <div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{item.name}</div>
                    <div style={{color:'#64748b',fontSize:10,fontFamily:'monospace'}}>{item.barcode}</div>
                  </div>
                  <button onClick={()=>removeItem(item.key)} style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:16}}>✕</button>
                </div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span style={{color:'#64748b',fontSize:11}}>عدد الطوابع:</span>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <button onClick={()=>updateQty(item.key,item.qty-1)} style={{width:26,height:26,borderRadius:6,background:'#d9e2f2',border:'none',color:'#F5C800',cursor:'pointer',fontSize:14}}>−</button>
                    <input type="number" value={item.qty} onChange={e=>updateQty(item.key,e.target.value)} min={1}
                      style={{width:48,background:'#f8fbff',border:'1px solid #cdd8ec',borderRadius:8,padding:'3px 6px',color:'#F5C800',fontSize:14,fontWeight:800,outline:'none',textAlign:'center'}}/>
                    <button onClick={()=>updateQty(item.key,item.qty+1)} style={{width:26,height:26,borderRadius:6,background:'#d9e2f2',border:'none',color:'#F5C800',cursor:'pointer',fontSize:14}}>+</button>
                  </div>
                </div>
              </div>
            ))
          }
        </div>

        {/* معاينة */}
        {selected[0]&&(
          <div style={{background:'#fff',borderRadius:10,padding:8,marginBottom:12,display:'inline-flex',flexDirection:'column',alignItems:'center',gap:4,alignSelf:'center'}}>
            {showName&&<div style={{fontSize:10,fontWeight:700,color:'#000',maxWidth:size.w,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{selected[0].name}</div>}
            <BarcodeDisplay value={selected[0].barcode} width={size.w} height={size.h-22} showText/>
            {showPrice&&<div style={{fontSize:11,fontWeight:700,color:'#cdd8ec'}}>{selected[0].price?.toLocaleString('ar-IQ')} د.ع</div>}
          </div>
        )}

        {totalLabels>0&&(
          <div style={{background:'#F5C80022',border:'1px solid #F5C80044',borderRadius:12,padding:10,marginBottom:12,textAlign:'center'}}>
            <div style={{color:'#F5C800',fontSize:22,fontWeight:900}}>{totalLabels}</div>
            <div style={{color:'#64748b',fontSize:11}}>طابع باركود</div>
          </div>
        )}

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <button onClick={handlePrint} disabled={totalLabels===0}
            style={{background:totalLabels===0?'#ffffff':'#10b981',color:totalLabels===0?'#cdd8ec':'#fff',border:'none',borderRadius:12,padding:'12px 0',fontWeight:800,cursor:totalLabels===0?'not-allowed':'pointer',fontFamily:"'Cairo'",fontSize:14}}>
            🖨️ طباعة
          </button>
          <button onClick={exportPDF} disabled={totalLabels===0}
            style={{background:totalLabels===0?'#ffffff':'#3b82f6',color:totalLabels===0?'#cdd8ec':'#fff',border:'none',borderRadius:12,padding:'12px 0',fontWeight:800,cursor:totalLabels===0?'not-allowed':'pointer',fontFamily:"'Cairo'",fontSize:14}}>
            📄 PDF
          </button>
        </div>
      </div>
    </div>
  );
}
