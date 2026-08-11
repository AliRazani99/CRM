import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CircleDollarSign,
  CreditCard,
  RefreshCw,
  Search,
  WalletCards,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useERP } from '../context/ERPContext';
import { KpiCard, PageHeader, Panel, StatusBadge } from '../components/UI';
import { formatCAD, formatDate, formatToman } from '../utils/formatters';

export default function FinancePage() {
  const { accounts, transactions } = useERP();
  const [accountFilter, setAccountFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transactions.filter((transaction) => {
      const matchesAccount = accountFilter === 'all' || transaction.account === accountFilter;
      const matchesSearch = !query || transaction.title.toLowerCase().includes(query) || transaction.id.toLowerCase().includes(query);
      return matchesAccount && matchesSearch;
    });
  }, [transactions, accountFilter, search]);

  const aggregates = useMemo(() => {
    return transactions.reduce((result, transaction) => {
      const key = transaction.account;
      if (!result[key]) result[key] = { in: 0, out: 0 };
      if (transaction.amount >= 0) result[key].in += transaction.amount;
      else result[key].out += Math.abs(transaction.amount);
      return result;
    }, {});
  }, [transactions]);

  const flowData = [
    { name: 'IRR', ورودی: aggregates.IRR?.in ?? 0, خروجی: aggregates.IRR?.out ?? 0 },
    {
      name: 'CAD معادل تومان',
      ورودی: (aggregates.CAD?.in ?? 0) * accounts.cadRate,
      خروجی: (aggregates.CAD?.out ?? 0) * accounts.cadRate,
    },
  ];

  return (
    <div className="page-stack">
      <PageHeader title="حساب‌ها و گردش مالی" subtitle="نمای مانده حساب‌ها و دفتر ساده تراکنش‌های عملیاتی" />

      <div className="kpi-grid kpi-grid-4">
        <KpiCard title="مانده حساب ریالی" value={formatToman(accounts.irrBalance)} icon={<Banknote size={20} />} tone="emerald" />
        <KpiCard title="مانده حساب CAD" value={formatCAD(accounts.cadBalance)} icon={<CircleDollarSign size={20} />} tone="indigo" />
        <KpiCard title="کل ورودی ریالی" value={formatToman(aggregates.IRR?.in ?? 0)} icon={<ArrowUpRight size={20} />} tone="sky" />
        <KpiCard title="کل خروجی ریالی" value={formatToman(aggregates.IRR?.out ?? 0)} icon={<ArrowDownLeft size={20} />} tone="rose" />
      </div>

      <div className="dashboard-grid finance-grid">
        <Panel title="جریان ورودی و خروجی" subtitle="برای مقایسه، حساب CAD با نرخ جاری به تومان تبدیل شده است" className="chart-panel span-2">
          <div className="chart-medium">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flowData}>
                <CartesianGrid strokeDasharray="4 4" stroke="#25314a" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" axisLine={false} tickLine={false} fontSize={11} />
                <YAxis stroke="#94a3b8" axisLine={false} tickLine={false} fontSize={11} tickFormatter={(value) => `${Math.round(value / 1_000_000)}M`} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }} formatter={(value) => formatToman(value)} />
                <Legend />
                <Bar dataKey="ورودی" fill="#34d399" radius={[6, 6, 0, 0]} />
                <Bar dataKey="خروجی" fill="#fb7185" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="خلاصه حساب‌ها" subtitle="وضعیت نقدینگی عملیاتی">
          <div className="account-summary-list">
            <div className="account-summary-item">
              <div className="account-logo emerald"><WalletCards size={20} /></div>
              <div><strong>حساب ریالی اصلی</strong><span>فروش، هزینه داخلی و تسویه بدهی</span></div>
              <b>{formatToman(accounts.irrBalance)}</b>
            </div>
            <div className="account-summary-item">
              <div className="account-logo indigo"><CircleDollarSign size={20} /></div>
              <div><strong>حساب CAD</strong><span>خرید خارجی و تأمین کالا</span></div>
              <b>{formatCAD(accounts.cadBalance)}</b>
            </div>
            <div className="rate-strip">
              <span>ارزش ریالی حساب CAD</span>
              <strong>{formatToman(accounts.cadBalance * accounts.cadRate)}</strong>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="دفتر تراکنش‌ها" subtitle="ثبت خودکار اثر مالی فروش، خرید، صرافی و تسویه بدهی">
        <div className="toolbar-row">
          <div className="search-box wide">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جست‌وجو در شرح یا شناسه تراکنش" />
          </div>
          <div className="segmented-control compact">
            {[
              ['all', 'همه'],
              ['IRR', 'ریالی'],
              ['CAD', 'CAD'],
            ].map(([key, label]) => <button type="button" key={key} className={accountFilter === key ? 'active' : ''} onClick={() => setAccountFilter(key)}>{label}</button>)}
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>شناسه</th><th>تاریخ</th><th>شرح</th><th>نوع عملیات</th><th>حساب</th><th>مبلغ</th><th>جهت</th></tr></thead>
            <tbody>
              {filtered.map((transaction) => {
                const incoming = transaction.amount >= 0;
                const typeIcon = transaction.type === 'sale'
                  ? <CreditCard size={15} />
                  : transaction.type === 'exchange'
                    ? <RefreshCw size={15} />
                    : transaction.type === 'settlement'
                      ? <WalletCards size={15} />
                      : <ArrowDownLeft size={15} />;
                return (
                  <tr key={transaction.id}>
                    <td className="mono accent-text">{transaction.id}</td>
                    <td>{formatDate(transaction.date)}</td>
                    <td>{transaction.title}</td>
                    <td><span className="type-chip">{typeIcon}{transaction.type}</span></td>
                    <td>{transaction.account}</td>
                    <td className={incoming ? 'positive-text' : 'danger-text'}>
                      {transaction.account === 'CAD' ? formatCAD(Math.abs(transaction.amount)) : formatToman(Math.abs(transaction.amount))}
                    </td>
                    <td><StatusBadge status={incoming ? 'in' : 'out'} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
