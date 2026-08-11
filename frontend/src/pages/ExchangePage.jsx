import { useMemo, useState } from 'react';
import { ArrowLeftRight, CircleDollarSign, RefreshCw, WalletCards } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { Field, FormMessage, KpiCard, PageHeader, Panel } from '../components/UI';
import { formatCAD, formatDate, formatToman } from '../utils/formatters';

export default function ExchangePage() {
  const { accounts, exchanges, recordExchange } = useERP();
  const [partner, setPartner] = useState('صرافی پارس');
  const [irrPaid, setIrrPaid] = useState(72_500_000);
  const [cadReceived, setCadReceived] = useState(1_000);
  const [result, setResult] = useState(null);

  const rate = useMemo(() => Number(irrPaid || 0) / (Number(cadReceived || 0) || 1), [irrPaid, cadReceived]);

  const submit = (event) => {
    event.preventDefault();
    const response = recordExchange({ partner, irrPaid, cadReceived });
    setResult(response);
  };

  return (
    <div className="page-stack">
      <PageHeader title="تبدیل ارز" subtitle="انتقال ارزش از حساب ریالی به حساب CAD بدون اثر بر موجودی کالا" />

      <div className="kpi-grid kpi-grid-3">
        <KpiCard title="مانده ریالی" value={formatToman(accounts.irrBalance)} icon={<WalletCards size={20} />} tone="emerald" />
        <KpiCard title="مانده CAD" value={formatCAD(accounts.cadBalance)} icon={<CircleDollarSign size={20} />} tone="indigo" />
        <KpiCard title="نرخ تسعیر جاری" value={formatToman(accounts.cadRate)} icon={<RefreshCw size={20} />} tone="amber" />
      </div>

      <div className="split-layout exchange-layout">
        <Panel title="ثبت تراکنش تبدیل ارز" subtitle="سیستم کفایت موجودی حساب ریالی را کنترل می‌کند" className="form-panel">
          <form onSubmit={submit} className="form-stack">
            <Field label="طرف معامله / صراف" required><input value={partner} onChange={(event) => setPartner(event.target.value)} /></Field>
            <div className="form-grid two-columns">
              <Field label="مبلغ پرداختی تومان" required><input type="number" min="1" value={irrPaid} onChange={(event) => setIrrPaid(event.target.value)} /></Field>
              <Field label="CAD دریافتی" required><input type="number" min="0.01" step="0.01" value={cadReceived} onChange={(event) => setCadReceived(event.target.value)} /></Field>
            </div>

            <div className="exchange-visual">
              <div>
                <span>کاهش حساب ریالی</span>
                <strong>{formatToman(irrPaid)}</strong>
              </div>
              <div className="exchange-arrow"><ArrowLeftRight size={22} /></div>
              <div>
                <span>افزایش حساب CAD</span>
                <strong>{formatCAD(cadReceived)}</strong>
              </div>
            </div>

            <div className="rate-strip large">
              <span>نرخ محاسباتی این معامله</span>
              <strong>{formatToman(rate)}</strong>
            </div>
            <FormMessage result={result} />
            <button className="button primary full" type="submit"><RefreshCw size={17} /> ثبت و اعمال روی حساب‌ها</button>
          </form>
        </Panel>

        <Panel title="سوابق تبدیل ارز" subtitle="آخرین تراکنش‌های ثبت‌شده" className="side-panel">
          <div className="purchase-history">
            {exchanges.map((exchange) => (
              <article className="purchase-card" key={exchange.id}>
                <div className="purchase-card-top">
                  <div><strong>{exchange.id}</strong><span>{exchange.partner}</span></div>
                  <span className="warehouse-chip">{formatDate(exchange.date)}</span>
                </div>
                <div className="purchase-card-values">
                  <div><span>پرداخت ریالی</span><strong>{formatToman(exchange.irrPaid)}</strong></div>
                  <div><span>دریافت CAD</span><strong>{formatCAD(exchange.cadReceived)}</strong></div>
                </div>
                <div className="exchange-rate-row"><span>نرخ</span><strong>{formatToman(exchange.rate)}</strong></div>
              </article>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
