export const formatNumber = (value = 0) => new Intl.NumberFormat('fa-IR').format(Number(value) || 0);

export const formatToman = (value = 0) => `${formatNumber(Math.round(value))} تومان`;

export const formatCAD = (value = 0) => `${new Intl.NumberFormat('en-CA', {
  maximumFractionDigits: 2,
}).format(Number(value) || 0)} CAD`;

export const formatCompactToman = (value = 0) => {
  const number = Number(value) || 0;
  if (Math.abs(number) >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(1)} میلیارد تومان`;
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(1)} میلیون تومان`;
  return formatToman(number);
};

export const formatDate = (value) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
};

export const nowISO = () => new Date().toISOString();

export const makeId = (prefix) => `${prefix}-${Date.now().toString().slice(-8)}`;

export const irrToToman = (value = 0) =>
  (Number(value) || 0) / 10;


export const tomanToIrr = (value = 0) =>
  (Number(value) || 0) * 10;