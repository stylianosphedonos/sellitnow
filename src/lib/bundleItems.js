function normalizeBundleItemsInput(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const normalized = [];
  for (let i = 0; i < items.length; i++) {
    const row = items[i];
    if (!row || typeof row !== 'object') continue;
    const productId = Number(row.component_product_id ?? row.product_id);
    const quantity = Number(row.quantity);
    if (!Number.isInteger(productId) || productId <= 0) continue;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error('Each included product must have a quantity of at least 1.');
    }
    if (seen.has(productId)) {
      throw new Error('The same product cannot be added to an offer more than once.');
    }
    seen.add(productId);
    normalized.push({
      component_product_id: productId,
      quantity,
      display_order: Number.isInteger(Number(row.display_order)) ? Number(row.display_order) : i,
    });
  }
  return normalized;
}

function computeStockFromBundleRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  let minAvailable = Infinity;
  for (const row of rows) {
    const stock = Number(row.component_stock_quantity ?? row.stock_quantity ?? 0);
    const qty = Number(row.quantity) || 1;
    if (!Number.isFinite(stock) || stock < 0) {
      minAvailable = 0;
      break;
    }
    const available = Math.floor(stock / qty);
    minAvailable = Math.min(minAvailable, available);
  }
  return Number.isFinite(minAvailable) ? Math.max(0, minAvailable) : 0;
}

function sumComponentPrices(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  return rows.reduce((sum, row) => {
    const price = Number(row.component_price ?? row.price ?? 0);
    const qty = Number(row.quantity) || 1;
    return sum + (Number.isFinite(price) ? price * qty : 0);
  }, 0);
}

module.exports = {
  normalizeBundleItemsInput,
  computeStockFromBundleRows,
  sumComponentPrices,
};
