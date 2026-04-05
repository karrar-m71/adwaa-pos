import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { getErrorMessage, getExchangeRate, getPreferredCurrency, setPreferredCurrency } from '../../utils/helpers';
import { hasLocalApi, localDeleteSale, runLocalSync } from '../../data/api/localApi';
import { buildInvoiceEditDraft, explainInvoiceError, getInvoiceById, printInvoice, updateInvoice as updateInvoiceService } from '../../services/invoiceService';
import { SalesCartPanel } from './SalesCartPanel';
import { SalesHistoryView } from './SalesHistoryView';
import { PCard, ProductPopup } from './SalesProductViews';
import { SalesWorkspaceView } from './SalesWorkspaceView';
import { applyCurrencyDelta, readDebtByCurrency, readTotalByCurrency, selectFieldValue, sortProductsStable } from './salesListShared';

let _tabId = 2;

export default function SalesList({ user }) {
  const [products, setProducts] = useState([]);
  const [packages, setPackages] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('الكل');
  const [tabs, setTabs] = useState([{ id:1, label:'فاتورة 1' }]);
  const [activeTab, setActiveTab] = useState(1);
  const [view, setView] = useState('pos');
  const [currency, setCurrency] = useState(() => getPreferredCurrency());
  const [rate, setRate] = useState(() => getExchangeRate());
  const [showRate, setShowRate] = useState(false);
  const [popup, setPopup] = useState(null);
  const [priceMode, setPriceMode] = useState('retail');
  const [listSearchInput, setListSearchInput] = useState('');
  const [listSearch, setListSearch] = useState('');
  const [draftsByTab, setDraftsByTab] = useState({});
  const [rowActionState, setRowActionState] = useState({});
  const deferredSearch = useDeferredValue(search);
  const productsRef = useRef(products);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const packageMap = useMemo(
    () => Object.fromEntries(packages.map((pkg) => [pkg.id, pkg])),
    [packages],
  );
  const productMap = useMemo(
    () => Object.fromEntries(products.map((product) => [product.id, product])),
    [products],
  );
  const customerMap = useMemo(
    () => customers.reduce((acc, customerItem) => {
      const key = String(customerItem?.name || '').trim();
      if (key) acc[key] = customerItem;
      return acc;
    }, {}),
    [customers],
  );

  useEffect(() => {
    const unsubscribers = [
      onSnapshot(collection(db, 'pos_products'), (snapshot) => setProducts(sortProductsStable(snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id }))))),
      onSnapshot(collection(db, 'pos_packages'), (snapshot) => setPackages(snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id })))),
      onSnapshot(collection(db, 'pos_customers'), (snapshot) => setCustomers(snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id })))),
      onSnapshot(collection(db, 'pos_sales'), (snapshot) => setSales(snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  useEffect(() => {
    setPreferredCurrency(currency);
  }, [currency]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setListSearch(listSearchInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [listSearchInput]);

  const cats = useMemo(
    () => ['الكل', ...new Set(products.map((product) => product.cat).filter(Boolean))],
    [products],
  );

  const filtered = useMemo(() => products.filter((product) => {
    const matchesSearch = !deferredSearch || product.name?.includes(deferredSearch) || product.barcode?.includes(deferredSearch) || product.packageBarcode?.includes(deferredSearch);
    const matchesCategory = catFilter === 'الكل' || product.cat === catFilter;
    return matchesSearch && matchesCategory;
  }), [products, catFilter, deferredSearch]);

  const inferSellTypeFromSearch = (product, queryText = '') => {
    const normalizedQuery = String(queryText || '').trim().toLowerCase();
    if (!normalizedQuery) return 'unit';
    const packageBarcode = String(product?.packageBarcode || '').trim().toLowerCase();
    if (packageBarcode && packageBarcode === normalizedQuery) return 'package';
    return 'unit';
  };

  const addTab = () => {
    const id = _tabId++;
    setTabs((current) => [...current, { id, label:`فاتورة ${id}` }]);
    setActiveTab(id);
  };

  const repeatSaleIntoNewTab = (sale) => {
    const id = _tabId++;
    setTabs((current) => [...current, { id, label:`تعديل ${sale.invoiceNo || id}` }]);
    setActiveTab(id);
    if (sale?.currency === 'USD' || sale?.currency === 'IQD') setCurrency(sale.currency);
    setView('pos');
    setDraftsByTab((current) => ({
      ...current,
      [id]: buildInvoiceEditDraft(sale, productsRef.current),
    }));
  };

  const clearDraftForTab = (tabId) => {
    setDraftsByTab((current) => {
      if (!current[tabId]) return current;
      const next = { ...current };
      delete next[tabId];
      return next;
    });
  };

  const setRowAction = (invoiceId, action) => {
    setRowActionState((current) => ({ ...current, [invoiceId]: action }));
  };

  const clearRowAction = (invoiceId) => {
    setRowActionState((current) => {
      if (!current[invoiceId]) return current;
      const next = { ...current };
      delete next[invoiceId];
      return next;
    });
  };

  const handlePrint = async (invoiceId) => {
    if (!invoiceId || rowActionState[invoiceId]) return;
    setRowAction(invoiceId, 'print');
    try {
      await printInvoice(invoiceId, { customers });
    } catch (error) {
      console.error('[adwaa-invoice] Print failed', error);
      alert(explainInvoiceError(error, 'تعذر طباعة الفاتورة'));
    } finally {
      clearRowAction(invoiceId);
    }
  };

  const handleEdit = async (invoiceId) => {
    if (!invoiceId || rowActionState[invoiceId]) return;
    setRowAction(invoiceId, 'edit');
    try {
      const invoice = await getInvoiceById(invoiceId);
      repeatSaleIntoNewTab(invoice);
    } catch (error) {
      console.error('[adwaa-invoice] Edit load failed', error);
      alert(explainInvoiceError(error, 'تعذر تحميل الفاتورة للتعديل'));
    } finally {
      clearRowAction(invoiceId);
    }
  };

  const handleUpdateInvoice = async (draft) => {
    try {
      await updateInvoiceService(draft, { products, customers, user });
      return await getInvoiceById(draft.invoiceId);
    } catch (error) {
      console.error('[adwaa-invoice] Update failed', error);
      throw new Error(explainInvoiceError(error, 'تعذر تحديث الفاتورة'));
    }
  };

  const closeTab = (id) => {
    if (tabs.length === 1) return;
    const idx = tabs.findIndex((tab) => tab.id === id);
    const newTabs = tabs.filter((tab) => tab.id !== id);
    setTabs(newTabs);
    clearDraftForTab(id);
    if (activeTab === id) setActiveTab(newTabs[Math.max(0, idx - 1)].id);
  };

  const handleAdd = useCallback((product, sellType) => {
    window.dispatchEvent(new CustomEvent('cartAdd', { detail:{ tabId: activeTab, product, sellType } }));
    setSearch('');
  }, [activeTab]);

  const handleSearchEnter = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const queryText = String(search || '').trim();
    if (!queryText) return;
    const normalized = queryText.toLowerCase();
    const exactMatch = products.find((product) => {
      const name = String(product.name || '').trim().toLowerCase();
      const barcode = String(product.barcode || '').trim().toLowerCase();
      const packageBarcode = String(product.packageBarcode || '').trim().toLowerCase();
      return name === normalized || barcode === normalized || packageBarcode === normalized;
    });
    if (exactMatch) {
      handleAdd(exactMatch, inferSellTypeFromSearch(exactMatch, queryText));
      return;
    }
    if (filtered[0]) {
      handleAdd(filtered[0], inferSellTypeFromSearch(filtered[0], queryText));
    }
  };

  const listSales = useMemo(() => {
    const q = String(listSearch || '').trim();
    if (!q) return sales;
    return sales.filter((sale) => (
      sale.invoiceNo?.includes(q)
      || sale.customer?.includes(q)
      || sale.dateISO?.includes(q)
      || sale.cashier?.includes(q)
      || sale.paymentMethod?.includes(q)
    ));
  }, [sales, listSearch]);

  const removeSale = async (sale) => {
    if (!sale?.id) return;
    if (!confirm(`حذف الفاتورة ${sale.invoiceNo || ''}؟ سيتم عكس أثرها على المخزون والحسابات.`)) return;
    try {
      if (hasLocalApi()) {
        await localDeleteSale({ id: sale.id });
        runLocalSync().catch(() => null);
        return;
      }

      const batch = writeBatch(db);
      for (const item of sale.items || []) {
        let product = productMap[item.id];
        if (!product) {
          const snap = await getDoc(doc(db, 'pos_products', item.id));
          if (snap.exists()) product = { id: snap.id, ...snap.data() };
        }
        if (!product) continue;
        const qtyUnits = item.isPackage
          ? Number(item.qty || 0) * Math.max(1, Number(item.packageQty || 1))
          : Number(item.qty || 0);
        batch.set(doc(db, 'pos_products', item.id), {
          stock: Number(product.stock || 0) + qtyUnits,
          soldCount: Math.max(0, Number(product.soldCount || 0) - qtyUnits),
        }, { merge: true });
      }

      const customerName = String(sale.customer || '').trim();
      if (customerName && customerName !== 'زبون عام') {
        let customerRef = null;
        if (sale.customerId) {
          const snap = await getDoc(doc(db, 'pos_customers', sale.customerId));
          if (snap.exists()) customerRef = { id: snap.id, data: snap.data() };
        }
        if (!customerRef) {
          const found = await getDocs(query(collection(db, 'pos_customers'), where('name', '==', customerName)));
          if (!found.empty) customerRef = { id: found.docs[0].id, data: found.docs[0].data() };
        }
        if (customerRef) {
          const currencyCode = sale.currency === 'USD' ? 'USD' : 'IQD';
          const invoiceRate = Number(sale.exchangeRate || 1) || 1;
          const totalDisplay = currencyCode === 'USD' ? Number(sale.total || 0) / invoiceRate : Number(sale.total || 0);
          const dueDisplay = currencyCode === 'USD' ? Number(sale.dueAmount || sale.remainingAmount || 0) / invoiceRate : Number(sale.dueAmount || sale.remainingAmount || 0);
          const nextTotalsByCurrency = applyCurrencyDelta(readTotalByCurrency(customerRef.data), currencyCode, -totalDisplay);
          const nextDebtByCurrency = applyCurrencyDelta(readDebtByCurrency(customerRef.data), currencyCode, -dueDisplay);
          batch.set(doc(db, 'pos_customers', customerRef.id), {
            totalPurchases: Math.max(0, Number(customerRef.data.totalPurchases || 0) - Number(sale.total || 0)),
            totalPurchasesByCurrency: nextTotalsByCurrency,
            debt: Math.max(0, Number(nextDebtByCurrency.IQD || 0)),
            debtByCurrency: nextDebtByCurrency,
          }, { merge: true });
        }
      }

      const linkedVouchers = await getDocs(query(collection(db, 'pos_vouchers'), where('linkedSaleId', '==', sale.id)));
      linkedVouchers.docs.forEach((voucherDoc) => batch.delete(doc(db, 'pos_vouchers', voucherDoc.id)));
      batch.delete(doc(db, 'pos_sales', sale.id));
      await batch.commit();
    } catch (error) {
      alert('تعذر حذف الفاتورة: ' + getErrorMessage(error));
    }
  };

  const productCards = useMemo(() => filtered.map((product) => (
    <PCard
      key={product.id}
      p={product}
      packageMap={packageMap}
      priceMode={priceMode}
      onAdd={handleAdd}
      onInfo={(event, currentProduct, pkg) => setPopup({
        product: currentProduct,
        pkg,
        pos: {
          x: Math.min(event.clientX, window.innerWidth - 295),
          y: Math.min(event.clientY, window.innerHeight - 390),
        },
      })}
    />
  )), [filtered, packageMap, priceMode, handleAdd]);

  if (view === 'list') return (
    <SalesHistoryView
      listSales={listSales}
      listSearchInput={listSearchInput}
      onListSearchInputChange={setListSearchInput}
      onResetSearch={() => {
        setListSearchInput('');
        setListSearch('');
      }}
      onCreateSale={() => setView('pos')}
      onPrint={handlePrint}
      onEdit={handleEdit}
      onRemove={removeSale}
      rowActionState={rowActionState}
    />
  );

  return (
    <SalesWorkspaceView
      popup={popup}
      onClosePopup={() => setPopup(null)}
      ProductPopupComponent={ProductPopup}
      showRate={showRate}
      onHideRate={() => setShowRate(false)}
      onShowList={() => setView('list')}
      tabs={tabs}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      onCloseTab={closeTab}
      onAddTab={addTab}
      priceMode={priceMode}
      onPriceModeChange={setPriceMode}
      currency={currency}
      onCurrencyChange={setCurrency}
      rate={rate}
      onToggleRate={() => setShowRate((prev) => !prev)}
      onRateChange={(value) => setRate(Number(value))}
      onRateFieldDoubleClick={selectFieldValue}
      search={search}
      onSearchChange={setSearch}
      onSearchEnter={handleSearchEnter}
      cats={cats}
      catFilter={catFilter}
      onCategoryChange={setCatFilter}
      productCards={productCards}
      cartPanels={tabs.map((tab) => (
        <div key={tab.id} style={{ display:activeTab === tab.id ? 'flex' : 'none', flex:'1 1 340px', maxWidth:'100%' }}>
          <SalesCartPanel
            key={`${tab.id}:${draftsByTab[tab.id]?.invoiceId || draftsByTab[tab.id]?.createdAt || 'blank'}`}
            tabId={tab.id}
            productMap={productMap}
            packageMap={packageMap}
            customers={customers}
            customerMap={customerMap}
            user={user}
            currency={currency}
            exchangeRate={rate}
            priceMode={priceMode}
            initialDraft={draftsByTab[tab.id] || null}
            onDraftApplied={clearDraftForTab}
            onUpdateInvoice={handleUpdateInvoice}
          />
        </div>
      ))}
    />
  );
}
