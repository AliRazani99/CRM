import {
  useMemo,
  useState,
} from 'react';

import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CircleDollarSign,
  Plus,
  Search,
  WalletCards,
} from 'lucide-react';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  useERP,
} from '../context/ERPContext';

import {
  Field,
  FormMessage,
  KpiCard,
  Modal,
  PageHeader,
  Panel,
} from '../components/UI';

import {
  formatCAD,
  formatDate,
  formatToman,
} from '../utils/formatters';


const blankAccountForm = {
  name: '',
  accountType: 'BANK',
  currencyCode: 'IRR',
  openingBalance: 0,
};


function formatAccountBalance(
  account,
) {
  if (
    account.currencyCode ===
    'CAD'
  ) {
    return formatCAD(
      account.currentBalance
    );
  }

  return formatToman(
    account.currentBalance
  );
}


function transactionTypeLabel(
  type,
) {
  const labels = {
    OPENING_BALANCE:
      'مانده اولیه',

    SALE_PAYMENT:
      'دریافت فروش',

    CUSTOMER_SETTLEMENT:
      'تسویه مشتری',

    PURCHASE_PAYMENT:
      'پرداخت خرید',

    PURCHASE_LANDING_COST:
      'هزینه ورود',

    CURRENCY_EXCHANGE:
      'تبدیل ارز',
  };

  return (
    labels[type] ||
    type ||
    '—'
  );
}


function referenceLabel(
  transaction,
) {
  if (
    !transaction.referenceType ||
    !transaction.referenceId
  ) {
    return '—';
  }

  const labels = {
    SALES: 'فروش',
    PROCUREMENT: 'خرید',
    CURRENCY_EXCHANGE:
      'تبدیل ارز',
    FINANCIAL_ACCOUNT:
      'حساب',
  };

  return `${
    labels[
      transaction.referenceType
    ] ||
    transaction.referenceType
  } #${transaction.referenceId}`;
}


export default function FinancePage({
  onNavigate,
}) {
  const {
    accounts,

    financialAccounts = [],
    transactions = [],

    addFinancialAccount,
    updateFinancialAccount,
  } = useERP();

  const [
    accountFilter,
    setAccountFilter,
  ] = useState('all');

  const [
    search,
    setSearch,
  ] = useState('');

  const [
    accountModalOpen,
    setAccountModalOpen,
  ] = useState(false);

  const [
    accountForm,
    setAccountForm,
  ] = useState(
    blankAccountForm
  );

  const [
    accountResult,
    setAccountResult,
  ] = useState(null);

  const [
    accountSubmitting,
    setAccountSubmitting,
  ] = useState(false);


  const activeAccounts =
    financialAccounts.filter(
      (account) =>
        account.isActive
    );


  const filtered =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return transactions.filter(
        (transaction) => {
          const matchesAccount =
            accountFilter ===
              'all' ||
            transaction
              .currencyCode ===
              accountFilter;

          const haystack = [
            transaction.id,
            transaction.title,
            transaction.accountName,
            transaction.type,
            transaction.referenceType,
            transaction.referenceId,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          const matchesSearch =
            !query ||
            haystack.includes(
              query
            );

          return (
            matchesAccount &&
            matchesSearch
          );
        },
      );
    }, [
      transactions,
      accountFilter,
      search,
    ]);


  const aggregates =
    useMemo(() => {
      return transactions.reduce(
        (
          result,
          transaction,
        ) => {
          const key =
            transaction
              .currencyCode;

          if (!result[key]) {
            result[key] = {
              in: 0,
              out: 0,
            };
          }

          if (
            transaction.direction ===
            'IN'
          ) {
            result[key].in +=
              Math.abs(
                transaction.amount
              );
          } else {
            result[key].out +=
              Math.abs(
                transaction.amount
              );
          }

          return result;
        },
        {},
      );
    }, [transactions]);


  const totalIrrBalance =
    activeAccounts
      .filter(
        (account) =>
          account.currencyCode ===
          'IRR',
      )
      .reduce(
        (sum, account) =>
          sum +
          Number(
            account.currentBalance
          ),
        0,
      );


  const totalCadBalance =
    activeAccounts
      .filter(
        (account) =>
          account.currencyCode ===
          'CAD',
      )
      .reduce(
        (sum, account) =>
          sum +
          Number(
            account.currentBalance
          ),
        0,
      );


  const flowData = [
    {
      name: 'IRR',

      ورودی:
        aggregates.IRR?.in ??
        0,

      خروجی:
        aggregates.IRR?.out ??
        0,
    },

    {
      name:
        'CAD معادل تومان',

      ورودی:
        (
          aggregates.CAD?.in ??
          0
        ) *
        (
          accounts.cadRate ||
          0
        ),

      خروجی:
        (
          aggregates.CAD?.out ??
          0
        ) *
        (
          accounts.cadRate ||
          0
        ),
    },
  ];


  const submitAccount =
    async (event) => {
      event.preventDefault();

      setAccountSubmitting(
        true
      );

      setAccountResult(
        null
      );

      const response =
        await addFinancialAccount(
          accountForm
        );

      setAccountResult(
        response
      );

      if (response.ok) {
        setAccountForm(
          blankAccountForm
        );

        setTimeout(() => {
          setAccountModalOpen(
            false
          );

          setAccountResult(
            null
          );
        }, 600);
      }

      setAccountSubmitting(
        false
      );
    };


  const toggleAccount =
    async (account) => {
      const response =
        await updateFinancialAccount(
          account.id,
          {
            isActive:
              !account.isActive,
          },
        );

      if (!response.ok) {
        window.alert(
          response.message
        );
      }
    };


  const navigateReference =
    (transaction) => {
      if (!onNavigate) {
        return;
      }

      const pageMap = {
        SALES: 'sales',
        PROCUREMENT:
          'purchases',
        CURRENCY_EXCHANGE:
          'exchange',
      };

      const page =
        pageMap[
          transaction
            .referenceType
        ];

      if (page) {
        onNavigate(page);
      }
    };


  return (
    <div className="page-stack">

      <PageHeader
        title="حساب‌ها و گردش مالی"
        subtitle="مانده حساب‌های واقعی و دفتر تراکنش‌های متصل به فروش، خرید و تبدیل ارز"
        actions={(
          <button
            className="button primary"
            type="button"
            onClick={() => {
              setAccountResult(
                null
              );

              setAccountForm(
                blankAccountForm
              );

              setAccountModalOpen(
                true
              );
            }}
          >
            <Plus size={17} />
            حساب مالی جدید
          </button>
        )}
      />


      <div className="kpi-grid kpi-grid-4">

        <KpiCard
          title="مانده فعال IRR"
          value={formatToman(
            totalIrrBalance
          )}
          icon={
            <Banknote
              size={20}
            />
          }
          tone="emerald"
        />

        <KpiCard
          title="مانده فعال CAD"
          value={formatCAD(
            totalCadBalance
          )}
          icon={
            <CircleDollarSign
              size={20}
            />
          }
          tone="indigo"
        />

        <KpiCard
          title="کل ورودی IRR"
          value={formatToman(
            aggregates.IRR?.in ??
            0
          )}
          icon={
            <ArrowUpRight
              size={20}
            />
          }
          tone="sky"
        />

        <KpiCard
          title="کل خروجی IRR"
          value={formatToman(
            aggregates.IRR?.out ??
            0
          )}
          icon={
            <ArrowDownLeft
              size={20}
            />
          }
          tone="rose"
        />

      </div>


      <Panel
        title="حساب‌های مالی"
        subtitle="مانده حساب فقط از مسیر تراکنش عملیاتی تغییر می‌کند؛ حذف حساب مالی مجاز نیست"
      >
        <div className="table-wrap">

          <table className="data-table">

            <thead>
              <tr>
                <th>حساب</th>
                <th>نوع</th>
                <th>ارز</th>
                <th>مانده</th>
                <th>وضعیت</th>
                <th>عملیات</th>
              </tr>
            </thead>

            <tbody>

              {financialAccounts
                .length === 0 ? (
                <tr>
                  <td
                    colSpan="6"
                    className="empty-cell"
                  >
                    هنوز حساب مالی ثبت نشده است.
                  </td>
                </tr>
              ) : (
                financialAccounts.map(
                  (account) => (
                    <tr
                      key={
                        account.id
                      }
                    >
                      <td>
                        <strong>
                          {
                            account.name
                          }
                        </strong>
                      </td>

                      <td>
                        {
                          account.accountType ===
                          'BANK'
                            ? 'بانکی'
                            : 'صندوق'
                        }
                      </td>

                      <td>
                        {
                          account.currencyCode
                        }
                      </td>

                      <td>
                        {formatAccountBalance(
                          account
                        )}
                      </td>

                      <td>
                        {account.isActive
                          ? 'فعال'
                          : 'غیرفعال'}
                      </td>

                      <td>
                        <button
                          className="button ghost small"
                          type="button"
                          onClick={() =>
                            toggleAccount(
                              account
                            )
                          }
                        >
                          {account.isActive
                            ? 'غیرفعال‌کردن'
                            : 'فعال‌کردن'}
                        </button>
                      </td>
                    </tr>
                  ),
                )
              )}

            </tbody>

          </table>

        </div>
      </Panel>


      <div className="dashboard-grid finance-grid">

        <Panel
          title="جریان ورودی و خروجی"
          subtitle="CAD برای مقایسه با نرخ آخرین تبدیل به تومان نمایش داده می‌شود"
          className="chart-panel span-2"
        >

          <div className="chart-medium">

            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart
                data={flowData}
              >
                <CartesianGrid
                  strokeDasharray="4 4"
                  stroke="#25314a"
                  vertical={false}
                />

                <XAxis
                  dataKey="name"
                  stroke="#94a3b8"
                  axisLine={false}
                  tickLine={false}
                  fontSize={11}
                />

                <YAxis
                  stroke="#94a3b8"
                  axisLine={false}
                  tickLine={false}
                  fontSize={11}
                  tickFormatter={(
                    value
                  ) =>
                    `${
                      Math.round(
                        value /
                        1_000_000
                      )
                    }M`
                  }
                />

                <Tooltip
                  contentStyle={{
                    background:
                      '#0f172a',

                    border:
                      '1px solid #334155',

                    borderRadius:
                      12,
                  }}
                  formatter={(
                    value
                  ) =>
                    formatToman(
                      value
                    )
                  }
                />

                <Legend />

                <Bar
                  dataKey="ورودی"
                  fill="#34d399"
                  radius={[
                    6,
                    6,
                    0,
                    0,
                  ]}
                />

                <Bar
                  dataKey="خروجی"
                  fill="#fb7185"
                  radius={[
                    6,
                    6,
                    0,
                    0,
                  ]}
                />

              </BarChart>
            </ResponsiveContainer>

          </div>

        </Panel>


        <Panel
          title="خلاصه نقدینگی"
          subtitle="جمع حساب‌های فعال"
        >

          <div className="account-summary-list">

            <div className="account-summary-item">
              <div className="account-logo emerald">
                <WalletCards
                  size={20}
                />
              </div>

              <div>
                <strong>
                  کل حساب‌های IRR
                </strong>

                <span>
                  بانک و صندوق فعال
                </span>
              </div>

              <b>
                {formatToman(
                  totalIrrBalance
                )}
              </b>
            </div>


            <div className="account-summary-item">
              <div className="account-logo indigo">
                <CircleDollarSign
                  size={20}
                />
              </div>

              <div>
                <strong>
                  کل حساب‌های CAD
                </strong>

                <span>
                  بانک و صندوق فعال
                </span>
              </div>

              <b>
                {formatCAD(
                  totalCadBalance
                )}
              </b>
            </div>


            <div className="rate-strip">
              <span>
                آخرین نرخ CAD
              </span>

              <strong>
                {accounts.cadRate
                  ? formatToman(
                      accounts.cadRate
                    )
                  : '—'}
              </strong>
            </div>

          </div>

        </Panel>

      </div>


      <Panel
        title="دفتر تراکنش‌ها"
        subtitle="reference_type + reference_id مرجع عملیاتی هر گردش را مشخص می‌کند"
      >

        <div className="toolbar-row">

          <div className="search-box wide">
            <Search size={16} />

            <input
              value={search}
              onChange={(
                event
              ) =>
                setSearch(
                  event.target
                    .value
                )
              }
              placeholder="شرح، حساب، شناسه یا مرجع تراکنش"
            />
          </div>


          <div className="segmented-control compact">

            {[
              [
                'all',
                'همه',
              ],
              [
                'IRR',
                'IRR',
              ],
              [
                'CAD',
                'CAD',
              ],
            ].map(
              ([
                key,
                label,
              ]) => (
                <button
                  type="button"
                  key={key}
                  className={
                    accountFilter ===
                    key
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    setAccountFilter(
                      key
                    )
                  }
                >
                  {label}
                </button>
              ),
            )}

          </div>

        </div>


        <div className="table-wrap">

          <table className="data-table">

            <thead>
              <tr>
                <th>شناسه</th>
                <th>تاریخ</th>
                <th>شرح</th>
                <th>نوع</th>
                <th>حساب</th>
                <th>مبلغ</th>
                <th>جهت</th>
                <th>مرجع</th>
              </tr>
            </thead>

            <tbody>

              {filtered.length ===
              0 ? (
                <tr>
                  <td
                    colSpan="8"
                    className="empty-cell"
                  >
                    تراکنشی با این فیلتر وجود ندارد.
                  </td>
                </tr>
              ) : (
                filtered.map(
                  (
                    transaction
                  ) => {
                    const incoming =
                      transaction.direction ===
                      'IN';

                    return (
                      <tr
                        key={
                          transaction.backendId
                        }
                      >
                        <td className="mono accent-text">
                          {
                            transaction.id
                          }
                        </td>

                        <td>
                          {formatDate(
                            transaction.date
                          )}
                        </td>

                        <td>
                          {
                            transaction.title
                          }
                        </td>

                        <td>
                          <span className="type-chip">
                            {transactionTypeLabel(
                              transaction.type
                            )}
                          </span>
                        </td>

                        <td>
                          {
                            transaction.accountName
                          }
                        </td>

                        <td
                          className={
                            incoming
                              ? 'positive-text'
                              : 'danger-text'
                          }
                        >
                          {transaction.currencyCode ===
                          'CAD'
                            ? formatCAD(
                                Math.abs(
                                  transaction.amount
                                )
                              )
                            : formatToman(
                                Math.abs(
                                  transaction.amount
                                )
                              )}
                        </td>

                        <td>
                          {incoming
                            ? 'ورودی'
                            : 'خروجی'}
                        </td>

                        <td>
                          <button
                            className="button ghost small"
                            type="button"
                            disabled={
                              ![
                                'SALES',
                                'PROCUREMENT',
                                'CURRENCY_EXCHANGE',
                              ].includes(
                                transaction.referenceType
                              )
                            }
                            onClick={() =>
                              navigateReference(
                                transaction
                              )
                            }
                          >
                            {referenceLabel(
                              transaction
                            )}
                          </button>
                        </td>

                      </tr>
                    );
                  },
                )
              )}

            </tbody>

          </table>

        </div>

      </Panel>


      <Modal
        open={accountModalOpen}
        onClose={() =>
          setAccountModalOpen(
            false
          )
        }
        title="ایجاد حساب مالی"
        subtitle="مانده اولیه نیز به عنوان تراکنش افتتاحیه در دفتر مالی ثبت می‌شود"
      >

        <form
          className="form-stack"
          onSubmit={
            submitAccount
          }
        >

          <Field
            label="نام حساب"
            required
          >
            <input
              required
              value={
                accountForm.name
              }
              onChange={(
                event
              ) =>
                setAccountForm({
                  ...accountForm,

                  name:
                    event.target
                      .value,
                })
              }
            />
          </Field>


          <div className="form-grid two-columns">

            <Field
              label="نوع حساب"
              required
            >
              <select
                value={
                  accountForm.accountType
                }
                onChange={(
                  event
                ) =>
                  setAccountForm({
                    ...accountForm,

                    accountType:
                      event.target
                        .value,
                  })
                }
              >
                <option value="BANK">
                  حساب بانکی
                </option>

                <option value="CASH">
                  صندوق
                </option>
              </select>
            </Field>


            <Field
              label="ارز حساب"
              required
            >
              <select
                value={
                  accountForm.currencyCode
                }
                onChange={(
                  event
                ) =>
                  setAccountForm({
                    ...accountForm,

                    currencyCode:
                      event.target
                        .value,

                    openingBalance:
                      0,
                  })
                }
              >
                <option value="IRR">
                  IRR
                </option>

                <option value="CAD">
                  CAD
                </option>
              </select>
            </Field>

          </div>


          <Field
            label={
              accountForm.currencyCode ===
              'IRR'
                ? 'مانده اولیه — تومان'
                : 'مانده اولیه — CAD'
            }
            required
          >
            <input
              required
              type="number"
              min="0"
              step={
                accountForm.currencyCode ===
                'CAD'
                  ? '0.01'
                  : '1'
              }
              value={
                accountForm.openingBalance
              }
              onChange={(
                event
              ) =>
                setAccountForm({
                  ...accountForm,

                  openingBalance:
                    event.target
                      .value,
                })
              }
            />
          </Field>


          <FormMessage
            result={
              accountResult
            }
          />


          <button
            className="button primary full"
            type="submit"
            disabled={
              accountSubmitting
            }
          >
            <Plus size={17} />

            {accountSubmitting
              ? 'در حال ثبت...'
              : 'ایجاد حساب'}
          </button>

        </form>

      </Modal>

    </div>
  );
}
