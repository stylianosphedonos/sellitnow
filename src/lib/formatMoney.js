/**
 * Format a numeric amount with ISO 4217 currency (for emails, PDFs, logs).
 */
function formatMoney(amount, currencyCode = 'usd') {
  const n = parseFloat(amount);
  const code = String(currencyCode || 'usd').toUpperCase();
  if (!Number.isFinite(n)) return String(amount);
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(n);
  } catch {
    return `${code} ${n.toFixed(2)}`;
  }
}

module.exports = { formatMoney };
