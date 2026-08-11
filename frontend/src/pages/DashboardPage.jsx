import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Boxes,
  CircleDollarSign,
  Coins,
  Gauge,
  PackageCheck,
  PackageSearch,
  Percent,
  ReceiptText,
  ShoppingBag,
  TrendingUp,
  Trophy,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { KpiCard, PageHeader, Panel, StatusBadge } from '../components/UI';
import { formatCAD, formatCompactToman, formatToman } from '../utils/formatters';

const chartColors = ['#818cf8', '#34d399', '#fbbf24', '#fb7185', '#38bdf8', '#c084fc'];
const MILLION = 1_000_000;

function getStartOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function getBuckets(timeframe) {
  const now = new Date();

  if (timeframe === 'today') {
    const startOfDay = getStartOfDay(now);
    return Array.from({ length: 6 }, (_, index) => {
      const start = new Date(startOfDay.getTime() + index * 4 * 60 * 60 * 1000);
      const end = new Date(startOfDay.getTime() + (index + 1) * 4 * 60 * 60 * 1000);
      return {
        label: `${String(start.getHours()).padStart(2, '0')}:00`,
        start,
        end,
      };
    });
  }

  if (timeframe === 'week') {
    const start = new Date(getStartOfDay(now).getTime() - 6 * 24 * 60 * 60 * 1000);
    return Array.from({ length: 7 }, (_, index) => {
      const bucketStart = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
      const bucketEnd = new Date(bucketStart.getTime() + 24 * 60 * 60 * 1000);
      return {
        label: new Intl.DateTimeFormat('fa-IR', { weekday: 'short' }).format(bucketStart),
        start: bucketStart,
        end: bucketEnd,
      };
    });
  }

  if (timeframe === 'month') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const buckets = [];
    let cursor = new Date(monthStart);
    let index = 1;

    while (cursor < nextMonth) {
      const start = new Date(cursor);
      const end = new Date(Math.min(nextMonth.getTime(), start.getTime() + 7 * 24 * 60 * 60 * 1000));
      buckets.push({ label: `هفته ${index}`, start, end });
      cursor = end;
      index += 1;
    }

    return buckets;
  }

  return Array.from({ length: 12 }, (_, index) => {
    const start = new Date(now.getFullYear(), index, 1);
    const end = new Date(now.getFullYear(), index + 1, 1);
    return {
      label: new Intl.DateTimeFormat('fa-IR', { month: 'short' }).format(start),
      start,
      end,
    };
  });
}

function matchesProduct(item, selectedProductId) {
  return selectedProductId === 'all' || item.productId === Number(selectedProductId);
}

function makeTimeSeries(timeframe, sales, purchases, cadRate, selectedProductId) {
  const buckets = getBuckets(timeframe).map((bucket) => ({
    ...bucket,
    salesValue: 0,
    purchaseValue: 0,
    soldQty: 0,
    purchasedQty: 0,
    cashIn: 0,
    cashOut: 0,
  }));

  sales.forEach((sale) => {
    const date = new Date(sale.date);
    const bucket = buckets.find((item) => date >= item.start && date < item.end);
    if (!bucket) return;

    const matchingItems = sale.items.filter((item) => matchesProduct(item, selectedProductId));
    if (matchingItems.length === 0) return;

    const lineValue = matchingItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const lineQty = matchingItems.reduce((sum, item) => sum + item.qty, 0);
    const collectionRatio = sale.total > 0 ? sale.paid / sale.total : 0;

    bucket.salesValue += lineValue;
    bucket.soldQty += lineQty;
    bucket.cashIn += lineValue * collectionRatio;
  });

  purchases.forEach((purchase) => {
    const date = new Date(purchase.date);
    const bucket = buckets.find((item) => date >= item.start && date < item.end);
    if (!bucket) return;

    const matchingItems = purchase.items.filter((item) => matchesProduct(item, selectedProductId));
    if (matchingItems.length === 0) return;

    const lineValue = matchingItems.reduce(
      (sum, item) => sum + item.qty * (item.landedUnitCostCAD ?? item.unitCostCAD ?? 0) * cadRate,
      0,
    );
    const lineQty = matchingItems.reduce((sum, item) => sum + item.qty, 0);

    bucket.purchaseValue += lineValue;
    bucket.purchasedQty += lineQty;
    bucket.cashOut += lineValue;
  });

  return buckets.map((bucket) => ({
    label: bucket.label,
    فروش: Math.round(bucket.salesValue / MILLION),
    خرید: Math.round(bucket.purchaseValue / MILLION),
    'تعداد فروش': bucket.soldQty,
    'تعداد خرید': bucket.purchasedQty,
    'ورودی نقدی': Math.round(bucket.cashIn / MILLION),
    'خروجی نقدی': Math.round(bucket.cashOut / MILLION),
  }));
}

function getRange(timeframe) {
  const buckets = getBuckets(timeframe);
  return {
    start: buckets[0]?.start ?? new Date(0),
    end: buckets[buckets.length - 1]?.end ?? new Date(),
  };
}

function aggregatePerformance({ products, sales, purchases, cadRate, timeframe, selectedProductId }) {
  const range = getRange(timeframe);
  const productMap = new Map(
    products.map((product) => [
      product.id,
      {
        productId: product.id,
        name: product.name,
        category: product.category,
        salesValue: 0,
        purchaseValue: 0,
        soldQty: 0,
        purchasedQty: 0,
        cogs: 0,
        available: product.qtyW1 + product.qtyW2 - product.reserved,
      },
    ]),
  );

  sales.forEach((sale) => {
    const date = new Date(sale.date);
    if (date < range.start || date >= range.end) return;

    sale.items.forEach((item) => {
      if (!matchesProduct(item, selectedProductId)) return;
      const row = productMap.get(item.productId);
      const product = products.find((candidate) => candidate.id === item.productId);
      if (!row || !product) return;

      row.salesValue += item.lineTotal;
      row.soldQty += item.qty;
      row.cogs += item.qty * product.costCAD * cadRate;
    });
  });

  purchases.forEach((purchase) => {
    const date = new Date(purchase.date);
    if (date < range.start || date >= range.end) return;

    purchase.items.forEach((item) => {
      if (!matchesProduct(item, selectedProductId)) return;
      const row = productMap.get(item.productId);
      if (!row) return;

      row.purchaseValue += item.qty * (item.landedUnitCostCAD ?? item.unitCostCAD ?? 0) * cadRate;
      row.purchasedQty += item.qty;
    });
  });

  return [...productMap.values()]
    .filter((row) => selectedProductId === 'all' || row.productId === Number(selectedProductId))
    .map((row) => {
      const grossProfit = row.salesValue - row.cogs;
      return {
        ...row,
        grossProfit,
        margin: row.salesValue > 0 ? (grossProfit / row.salesValue) * 100 : 0,
      };
    });
}

function truncate(value, length = 18) {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

export default function DashboardPage({ onNavigate }) {
  const { products, customers, accounts, sales, purchases, metrics } = useERP();
  const [timeframe, setTimeframe] = useState('week');
  const [selectedProductId, setSelectedProductId] = useState('all');

  const selectedProduct = products.find((product) => product.id === Number(selectedProductId));
  const productLabel = selectedProduct?.name ?? 'همه کالاها';

  const trendData = useMemo(
    () => makeTimeSeries(timeframe, sales, purchases, accounts.cadRate, selectedProductId),
    [timeframe, sales, purchases, accounts.cadRate, selectedProductId],
  );

  const performanceRows = useMemo(
    () => aggregatePerformance({
      products,
      sales,
      purchases,
      cadRate: accounts.cadRate,
      timeframe,
      selectedProductId,
    }),
    [products, sales, purchases, accounts.cadRate, timeframe, selectedProductId],
  );

  const periodMetrics = useMemo(() => {
    const salesValue = performanceRows.reduce((sum, row) => sum + row.salesValue, 0);
    const purchaseValue = performanceRows.reduce((sum, row) => sum + row.purchaseValue, 0);
    const soldQty = performanceRows.reduce((sum, row) => sum + row.soldQty, 0);
    const purchasedQty = performanceRows.reduce((sum, row) => sum + row.purchasedQty, 0);
    const cogs = performanceRows.reduce((sum, row) => sum + row.cogs, 0);
    const grossProfit = salesValue - cogs;
    const available = performanceRows.reduce((sum, row) => sum + row.available, 0);
    const sellThroughBase = soldQty + Math.max(available, 0);

    return {
      salesValue,
      purchaseValue,
      soldQty,
      purchasedQty,
      grossProfit,
      margin: salesValue > 0 ? (grossProfit / salesValue) * 100 : 0,
      averageSalePrice: soldQty > 0 ? salesValue / soldQty : 0,
      available,
      sellThrough: sellThroughBase > 0 ? (soldQty / sellThroughBase) * 100 : 0,
    };
  }, [performanceRows]);

  const categoryData = useMemo(() => {
    const map = new Map();
    products.forEach((product) => {
      const value = (product.qtyW1 + product.qtyW2) * product.costCAD;
      map.set(product.category, (map.get(product.category) ?? 0) + value);
    });
    return [...map.entries()].map(([name, value], index) => ({
      name,
      value: Math.round(value),
      color: chartColors[index % chartColors.length],
    }));
  }, [products]);

  const topProductsData = useMemo(
    () => [...performanceRows]
      .filter((row) => row.salesValue > 0 || row.purchaseValue > 0)
      .sort((a, b) => b.salesValue - a.salesValue)
      .slice(0, 7)
      .map((row) => ({
        name: truncate(row.name),
        فروش: Math.round(row.salesValue / MILLION),
        سود: Math.round(row.grossProfit / MILLION),
      })),
    [performanceRows],
  );

  const stockData = useMemo(() => {
    const candidates = selectedProductId === 'all'
      ? products.slice(0, 8)
      : products.filter((product) => product.id === Number(selectedProductId));

    return candidates.map((product) => ({
      name: truncate(product.name, 14),
      موجودی: product.qtyW1 + product.qtyW2 - product.reserved,
      حداقل: product.minStock,
    }));
  }, [products, selectedProductId]);

  const receivablesData = useMemo(() => {
    const range = getRange(timeframe);
    let collected = 0;
    let outstanding = 0;

    sales.forEach((sale) => {
      const date = new Date(sale.date);
      if (date < range.start || date >= range.end) return;

      const lineValue = sale.items
        .filter((item) => matchesProduct(item, selectedProductId))
        .reduce((sum, item) => sum + item.lineTotal, 0);

      if (lineValue <= 0 || sale.total <= 0) return;
      collected += lineValue * (sale.paid / sale.total);
      outstanding += lineValue * (sale.debt / sale.total);
    });

    return [
      { name: 'وصول‌شده', value: Math.round(collected), color: '#34d399' },
      { name: 'مطالبات', value: Math.round(outstanding), color: '#fbbf24' },
    ].filter((item) => item.value > 0);
  }, [sales, timeframe, selectedProductId]);

  const lowStock = products
    .filter((product) => selectedProductId === 'all' || product.id === Number(selectedProductId))
    .map((product) => ({ ...product, available: product.qtyW1 + product.qtyW2 - product.reserved }))
    .filter((product) => product.available <= product.minStock)
    .sort((a, b) => a.available - b.available);

  const topCustomers = useMemo(() => {
    const range = getRange(timeframe);
    const map = new Map();

    sales.forEach((sale) => {
      const date = new Date(sale.date);
      if (date < range.start || date >= range.end) return;

      const lineValue = sale.items
        .filter((item) => matchesProduct(item, selectedProductId))
        .reduce((sum, item) => sum + item.lineTotal, 0);

      if (lineValue <= 0) return;
      const current = map.get(sale.customerId) ?? {
        id: sale.customerId,
        name: sale.customerName,
        phone: customers.find((customer) => customer.id === sale.customerId)?.phone ?? '—',
        revenue: 0,
        debt: 0,
      };

      current.revenue += lineValue;
      current.debt += sale.total > 0 ? lineValue * (sale.debt / sale.total) : 0;
      map.set(sale.customerId, current);
    });

    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [sales, customers, timeframe, selectedProductId]);

  const timeframeLabel = {
    today: 'امروز',
    week: 'هفت روز اخیر',
    month: 'ماه جاری',
    year: 'سال جاری',
  }[timeframe];

  return (
    <div className="page-stack">
      <PageHeader
        title="داشبورد هوش تجاری فروشگاه"
        subtitle={`تحلیل ${productLabel} در بازه ${timeframeLabel}`}
        actions={(
          <div className="bi-dashboard-actions">
            <label className="bi-product-filter">
              <span>فیلتر کالا</span>
              <select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}>
                <option value="all">همه کالاها</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name} — {product.sku}</option>
                ))}
              </select>
            </label>

            <div className="segmented-control">
              {[
                ['today', 'امروز'],
                ['week', 'هفته'],
                ['month', 'ماه'],
                ['year', 'سال'],
              ].map(([key, label]) => (
                <button key={key} className={timeframe === key ? 'active' : ''} onClick={() => setTimeframe(key)} type="button">
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      />

      <div className="kpi-grid kpi-grid-4">
        <KpiCard title="فروش در بازه" value={formatCompactToman(periodMetrics.salesValue)} hint={`${periodMetrics.soldQty} واحد فروخته‌شده`} icon={<ArrowUpRight size={21} />} tone="emerald" />
        <KpiCard title="خرید در بازه" value={formatCompactToman(periodMetrics.purchaseValue)} hint={`${periodMetrics.purchasedQty} واحد خریداری‌شده`} icon={<ArrowDownLeft size={21} />} tone="indigo" />
        <KpiCard title="سود ناخالص برآوردی" value={formatCompactToman(periodMetrics.grossProfit)} hint="بر اساس بهای فعلی ثبت‌شده کالا" icon={<TrendingUp size={21} />} tone="purple" />
        <KpiCard title="حاشیه سود" value={`${periodMetrics.margin.toFixed(1)}٪`} hint={`میانگین فروش هر واحد: ${formatCompactToman(periodMetrics.averageSalePrice)}`} icon={<Percent size={21} />} tone="amber" />
      </div>

      <div className="kpi-grid kpi-grid-4 compact-kpis">
        <KpiCard title="تعداد فروش" value={`${periodMetrics.soldQty} واحد`} icon={<ShoppingBag size={19} />} tone="emerald" />
        <KpiCard title="تعداد خرید" value={`${periodMetrics.purchasedQty} واحد`} icon={<PackageCheck size={19} />} tone="sky" />
        <KpiCard title="موجودی قابل فروش" value={`${periodMetrics.available} واحد`} icon={<Boxes size={19} />} tone="indigo" />
        <KpiCard title="نرخ فروش از موجودی" value={`${periodMetrics.sellThrough.toFixed(1)}٪`} icon={<Gauge size={19} />} tone="rose" />
      </div>

      <div className="dashboard-grid primary-grid">
        <Panel title="روند مبلغ فروش و خرید" subtitle="مبالغ بر حسب میلیون تومان؛ فیلتر کالا و زمان روی نمودار اعمال می‌شود" className="chart-panel span-2">
          <div className="chart-large">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 18, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.46} />
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="purchaseGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#25314a" vertical={false} />
                <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={11} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }} />
                <Legend />
                <Area type="monotone" dataKey="فروش" stroke="#818cf8" strokeWidth={3} fill="url(#salesGradient)" />
                <Area type="monotone" dataKey="خرید" stroke="#34d399" strokeWidth={3} fill="url(#purchaseGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="وضعیت وصول فروش" subtitle="مقایسه مبلغ وصول‌شده و مطالبات در بازه انتخابی" className="chart-panel">
          {receivablesData.length === 0 ? (
            <div className="mini-empty chart-empty">در این بازه فروشی ثبت نشده است.</div>
          ) : (
            <>
              <div className="chart-donut">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={receivablesData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={84} paddingAngle={4}>
                      {receivablesData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(value) => formatToman(value)} contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center">
                  <strong>{formatCompactToman(receivablesData.reduce((sum, item) => sum + item.value, 0))}</strong>
                  <span>فروش دوره</span>
                </div>
              </div>
              <div className="legend-list">
                {receivablesData.map((item) => (
                  <div key={item.name}>
                    <span className="legend-dot" style={{ background: item.color }} />
                    <span>{item.name}</span>
                    <strong>{formatCompactToman(item.value)}</strong>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>

      <div className="dashboard-grid secondary-grid">
        <Panel title="تعداد خرید و فروش کالا" subtitle="تعداد واحدهای خریداری‌شده و فروخته‌شده در هر بازه" className="chart-panel span-2">
          <div className="chart-medium">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 12, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="#25314a" vertical={false} />
                <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={10} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }} />
                <Legend />
                <Bar dataKey="تعداد فروش" fill="#818cf8" radius={[6, 6, 0, 0]} />
                <Bar dataKey="تعداد خرید" fill="#34d399" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="پرفروش‌ترین کالاها" subtitle="مقایسه درآمد فروش و سود ناخالص برآوردی" className="chart-panel">
          {topProductsData.length === 0 ? (
            <div className="mini-empty chart-empty">در این بازه داده‌ای برای کالا وجود ندارد.</div>
          ) : (
            <div className="chart-medium">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProductsData} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#25314a" horizontal={false} />
                  <XAxis type="number" stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis dataKey="name" type="category" width={95} stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={9} />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }} />
                  <Legend />
                  <Bar dataKey="فروش" fill="#818cf8" radius={[0, 6, 6, 0]} />
                  <Bar dataKey="سود" fill="#fbbf24" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      <div className="dashboard-grid primary-grid">
        <Panel title="جریان نقدی عملیاتی" subtitle="ورودی وصول‌شده از فروش و خروجی خرید؛ میلیون تومان" className="chart-panel span-2">
          <div className="chart-medium">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 12, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="cashInGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.42} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="cashOutGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fb7185" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#fb7185" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#25314a" vertical={false} />
                <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={10} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={11} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }} />
                <Legend />
                <Area type="monotone" dataKey="ورودی نقدی" stroke="#34d399" strokeWidth={3} fill="url(#cashInGradient)" />
                <Area type="monotone" dataKey="خروجی نقدی" stroke="#fb7185" strokeWidth={3} fill="url(#cashOutGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="ترکیب ارزش موجودی" subtitle="سهم دسته‌بندی‌ها بر اساس بهای CAD" className="chart-panel">
          <div className="chart-donut">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={84} paddingAngle={4}>
                  {categoryData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(value) => formatCAD(value)} contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center">
              <strong>{formatCAD(metrics.inventoryCAD)}</strong>
              <span>ارزش کل</span>
            </div>
          </div>
          <div className="legend-list">
            {categoryData.map((item) => (
              <div key={item.name}>
                <span className="legend-dot" style={{ background: item.color }} />
                <span>{item.name}</span>
                <strong>{formatCAD(item.value)}</strong>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="dashboard-grid secondary-grid">
        <Panel title="سلامت موجودی کالا" subtitle="مقایسه موجودی قابل فروش و نقطه سفارش" className="chart-panel span-2">
          <div className="chart-medium">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockData} margin={{ top: 12, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="#25314a" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={10} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={11} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }} />
                <Legend />
                <Bar dataKey="موجودی" fill="#818cf8" radius={[6, 6, 0, 0]} />
                <Bar dataKey="حداقل" fill="#fbbf24" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="اقلام نیازمند اقدام"
          subtitle="موجودی قابل فروش کمتر یا مساوی نقطه سفارش"
          action={<button className="text-button" onClick={() => onNavigate('inventory')} type="button">مشاهده انبار</button>}
        >
          <div className="watch-list">
            {lowStock.length === 0 ? (
              <div className="mini-empty">برای فیلتر فعلی هشدار موجودی وجود ندارد.</div>
            ) : lowStock.slice(0, 5).map((product) => {
              const status = product.available <= 0 ? 'critical' : 'low';
              return (
                <div className="watch-item" key={product.id}>
                  <div className="watch-icon"><PackageSearch size={17} /></div>
                  <div className="watch-copy">
                    <strong>{product.name}</strong>
                    <span>{product.sku} • حداقل {product.minStock}</span>
                  </div>
                  <div className="watch-value">
                    <b>{product.available}</b>
                    <StatusBadge status={status} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <div className="dashboard-grid tertiary-grid">
        <Panel title="مشتریان ارزشمند در بازه" subtitle={`رتبه‌بندی بر اساس خرید ${productLabel}`}>
          <div className="rank-list">
            {topCustomers.length === 0 ? (
              <div className="mini-empty">برای فیلتر فعلی مشتری ثبت نشده است.</div>
            ) : topCustomers.map((customer, index) => (
              <div key={customer.id} className="rank-row">
                <span className="rank-number">{index + 1}</span>
                <div>
                  <strong>{customer.name}</strong>
                  <span>{customer.phone}</span>
                </div>
                <div className="rank-amount">
                  <strong>{formatToman(customer.revenue)}</strong>
                  {customer.debt > 0 ? <small>{formatToman(customer.debt)} بدهی</small> : <small className="positive">تسویه</small>}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="خلاصه مدیریتی" subtitle="مانده حساب‌ها و شاخص‌های کلیدی جاری">
          <div className="finance-summary">
            <div className="finance-summary-row">
              <span><WalletCards size={17} /> حساب ریالی</span>
              <strong>{formatToman(accounts.irrBalance)}</strong>
            </div>
            <div className="finance-summary-row">
              <span><CircleDollarSign size={17} /> حساب CAD</span>
              <strong>{formatCAD(accounts.cadBalance)}</strong>
            </div>
            <div className="finance-summary-row">
              <span><ReceiptText size={17} /> مطالبات کل</span>
              <strong>{formatToman(metrics.totalDebt)}</strong>
            </div>
            <div className="finance-summary-row">
              <span><Trophy size={17} /> سود دوره فیلترشده</span>
              <strong>{formatToman(periodMetrics.grossProfit)}</strong>
            </div>
            <div className="rate-strip">
              <span><Coins size={15} /> نرخ تسعیر CAD</span>
              <strong>{formatToman(accounts.cadRate)}</strong>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}