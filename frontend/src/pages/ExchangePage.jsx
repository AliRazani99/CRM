import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ArrowLeftRight,
  CircleDollarSign,
  RefreshCw,
  WalletCards,
} from 'lucide-react';

import {
  useERP,
} from '../context/ERPContext';

import {
  Field,
  FormMessage,
  KpiCard,
  PageHeader,
  Panel,
} from '../components/UI';

import {
  formatCAD,
  formatDate,
  formatToman,
} from '../utils/formatters';


export default function ExchangePage({
  onNavigate,
}) {
  const {
    accounts,

    financialAccounts = [],
    exchanges = [],

    recordExchange,
  } = useERP();


  const irrAccounts =
    financialAccounts.filter(
      (account) =>
        account.isActive &&
        account.currencyCode ===
          'IRR',
    );


  const cadAccounts =
    financialAccounts.filter(
      (account) =>
        account.isActive &&
        account.currencyCode ===
          'CAD',
    );


  const [
    fromAccountId,
    setFromAccountId,
  ] = useState('');

  const [
    toAccountId,
    setToAccountId,
  ] = useState('');

  const [
    partner,
    setPartner,
  ] = useState('');

  const [
    irrPaid,
    setIrrPaid,
  ] = useState(0);

  const [
    cadReceived,
    setCadReceived,
  ] = useState(0);

  const [
    result,
    setResult,
  ] = useState(null);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);


  useEffect(() => {
    setFromAccountId(
      (current) =>
        current ||
        irrAccounts[0]?.id ||
        '',
    );
  }, [financialAccounts]);


  useEffect(() => {
    setToAccountId(
      (current) =>
        current ||
        cadAccounts[0]?.id ||
        '',
    );
  }, [financialAccounts]);


  const selectedFromAccount =
    irrAccounts.find(
      (account) =>
        Number(account.id) ===
        Number(
          fromAccountId
        ),
    );


  const selectedToAccount =
    cadAccounts.find(
      (account) =>
        Number(account.id) ===
        Number(
          toAccountId
        ),
    );


  const rate =
    useMemo(
      () => {
        const paid =
          Number(
            irrPaid || 0
          );

        const received =
          Number(
            cadReceived || 0
          );

        return received > 0
          ? paid / received
          : 0;
      },
      [
        irrPaid,
        cadReceived,
      ],
    );


  const submit =
    async (event) => {
      event.preventDefault();

      setSubmitting(
        true
      );

      setResult(null);

      const response =
        await recordExchange({
          partner,

          fromAccountId,

          toAccountId,

          irrPaid,

          cadReceived,
        });

      setResult(
        response
      );

      if (response.ok) {
        setIrrPaid(0);
        setCadReceived(0);
        setPartner('');
      }

      setSubmitting(
        false
      );
    };


  const missingAccounts =
    irrAccounts.length === 0 ||
    cadAccounts.length === 0;


  return (
    <div className="page-stack">

      <PageHeader
        title="تبدیل ارز"
        subtitle="تبدیل واقعی IRR به CAD با ثبت دوطرفه در حساب‌ها و Ledger"
      />


      <div className="kpi-grid kpi-grid-3">

        <KpiCard
          title="کل مانده IRR"
          value={formatToman(
            accounts.irrBalance
          )}
          icon={
            <WalletCards
              size={20}
            />
          }
          tone="emerald"
        />

        <KpiCard
          title="کل مانده CAD"
          value={formatCAD(
            accounts.cadBalance
          )}
          icon={
            <CircleDollarSign
              size={20}
            />
          }
          tone="indigo"
        />

        <KpiCard
          title="آخرین نرخ CAD"
          value={
            accounts.cadRate
              ? formatToman(
                  accounts.cadRate
                )
              : '—'
          }
          icon={
            <RefreshCw
              size={20}
            />
          }
          tone="amber"
        />

      </div>


      {missingAccounts && (
        <Panel>
          <div className="empty-state">
            <WalletCards
              size={24}
            />

            <strong>
              برای تبدیل ارز حداقل یک حساب IRR و یک حساب CAD فعال لازم است.
            </strong>

            {onNavigate && (
              <button
                className="button primary"
                type="button"
                onClick={() =>
                  onNavigate(
                    'finance'
                  )
                }
              >
                رفتن به حساب‌ها
              </button>
            )}
          </div>
        </Panel>
      )}


      <div className="split-layout exchange-layout">

        <Panel
          title="ثبت تبدیل ارز"
          subtitle="مبلغ IRR از حساب مبدأ کم و CAD به حساب مقصد اضافه می‌شود"
          className="form-panel"
        >

          <form
            onSubmit={submit}
            className="form-stack"
          >

            <Field
              label="طرف معامله / صراف"
              required
            >
              <input
                required
                value={partner}
                onChange={(
                  event
                ) =>
                  setPartner(
                    event.target
                      .value
                  )
                }
              />
            </Field>


            <div className="form-grid two-columns">

              <Field
                label="حساب مبدأ IRR"
                required
              >
                <select
                  required
                  value={
                    fromAccountId
                  }
                  onChange={(
                    event
                  ) =>
                    setFromAccountId(
                      event.target
                        .value
                    )
                  }
                >
                  <option value="">
                    انتخاب حساب IRR
                  </option>

                  {irrAccounts.map(
                    (account) => (
                      <option
                        key={
                          account.id
                        }
                        value={
                          account.id
                        }
                      >
                        {account.name}
                        {' — '}
                        {formatToman(
                          account.currentBalance
                        )}
                      </option>
                    ),
                  )}
                </select>
              </Field>


              <Field
                label="حساب مقصد CAD"
                required
              >
                <select
                  required
                  value={
                    toAccountId
                  }
                  onChange={(
                    event
                  ) =>
                    setToAccountId(
                      event.target
                        .value
                    )
                  }
                >
                  <option value="">
                    انتخاب حساب CAD
                  </option>

                  {cadAccounts.map(
                    (account) => (
                      <option
                        key={
                          account.id
                        }
                        value={
                          account.id
                        }
                      >
                        {account.name}
                        {' — '}
                        {formatCAD(
                          account.currentBalance
                        )}
                      </option>
                    ),
                  )}
                </select>
              </Field>

            </div>


            <div className="form-grid two-columns">

              <Field
                label="مبلغ پرداختی — تومان"
                required
              >
                <input
                  required
                  type="number"
                  min="1"
                  max={
                    selectedFromAccount
                      ?.currentBalance ||
                    undefined
                  }
                  value={irrPaid}
                  onChange={(
                    event
                  ) =>
                    setIrrPaid(
                      event.target
                        .value
                    )
                  }
                />
              </Field>


              <Field
                label="CAD دریافتی"
                required
              >
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={
                    cadReceived
                  }
                  onChange={(
                    event
                  ) =>
                    setCadReceived(
                      event.target
                        .value
                    )
                  }
                />
              </Field>

            </div>


            <div className="exchange-visual">

              <div>
                <span>
                  کاهش حساب IRR
                </span>

                <strong>
                  {formatToman(
                    irrPaid
                  )}
                </strong>
              </div>

              <div className="exchange-arrow">
                <ArrowLeftRight
                  size={22}
                />
              </div>

              <div>
                <span>
                  افزایش حساب CAD
                </span>

                <strong>
                  {formatCAD(
                    cadReceived
                  )}
                </strong>
              </div>

            </div>


            <div className="rate-strip large">
              <span>
                نرخ این معامله
              </span>

              <strong>
                {rate > 0
                  ? `${formatToman(
                      rate
                    )} / CAD`
                  : '—'}
              </strong>
            </div>


            <div className="balance-checks">

              <span
                className={
                  Number(
                    irrPaid || 0
                  ) >
                  (
                    selectedFromAccount
                      ?.currentBalance ||
                    0
                  )
                    ? 'danger-text'
                    : ''
                }
              >
                موجودی مبدأ:
                {' '}
                {formatToman(
                  selectedFromAccount
                    ?.currentBalance ||
                  0
                )}
              </span>

              <span>
                موجودی مقصد:
                {' '}
                {formatCAD(
                  selectedToAccount
                    ?.currentBalance ||
                  0
                )}
              </span>

            </div>


            <FormMessage
              result={result}
            />


            <button
              className="button primary full"
              type="submit"
              disabled={
                submitting ||
                missingAccounts
              }
            >
              <RefreshCw
                size={17}
              />

              {submitting
                ? 'در حال ثبت...'
                : 'ثبت و اعمال روی حساب‌ها'}
            </button>

          </form>

        </Panel>


        <Panel
          title="سوابق تبدیل ارز"
          subtitle="هر تبدیل به دو AccountTransaction متصل است"
          className="side-panel"
        >

          <div className="purchase-history">

            {exchanges.length ===
            0 ? (
              <div className="mini-empty">
                هنوز تبدیل ارزی ثبت نشده است.
              </div>
            ) : (
              exchanges.map(
                (exchange) => (
                  <article
                    className="purchase-card"
                    key={
                      exchange.backendId
                    }
                  >

                    <div className="purchase-card-top">

                      <div>
                        <strong>
                          {
                            exchange.id
                          }
                        </strong>

                        <span>
                          {
                            exchange.partner
                          }
                        </span>
                      </div>

                      <span className="warehouse-chip">
                        {formatDate(
                          exchange.date
                        )}
                      </span>

                    </div>


                    <div className="purchase-card-meta">

                      <span>
                        {
                          exchange.fromAccountName
                        }
                      </span>

                      <span>
                        ←
                      </span>

                      <span>
                        {
                          exchange.toAccountName
                        }
                      </span>

                    </div>


                    <div className="purchase-card-values">

                      <div>
                        <span>
                          پرداخت IRR
                        </span>

                        <strong>
                          {formatToman(
                            exchange.irrPaid
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          دریافت CAD
                        </span>

                        <strong>
                          {formatCAD(
                            exchange.cadReceived
                          )}
                        </strong>
                      </div>

                    </div>


                    <div className="exchange-rate-row">

                      <span>
                        نرخ
                      </span>

                      <strong>
                        {formatToman(
                          exchange.rateToman
                        )}
                      </strong>

                    </div>

                  </article>
                ),
              )
            )}

          </div>

        </Panel>

      </div>

    </div>
  );
}
