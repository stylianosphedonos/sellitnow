/**
 * Order shipping from a per-order default plus per-line adjustments.
 * Lines without an explicit product delivery use the default (no delta).
 * Lines with an explicit per-unit delivery P contribute (P - default) * qty to the total (can be negative for cheaper / free-shipping SKUs). Result is never below zero.
 *
 * @param {number} defaultDelivery
 * @param {Array<{ quantity: number, delivery_cost?: number | null }>} lines
 */
function computeShippingTotal(defaultDelivery, lines) {
  const D = Number(defaultDelivery);
  const base = Number.isFinite(D) && D >= 0 ? D : 0;
  let deltaSum = 0;
  for (const line of lines || []) {
    const qty = Math.max(0, Number(line.quantity) || 0);
    if (qty === 0) continue;
    const raw = line.delivery_cost;
    if (raw === undefined || raw === null || raw === '') continue;
    const P = Number(raw);
    if (!Number.isFinite(P) || P < 0) continue;
    deltaSum += (P - base) * qty;
  }
  const total = base + deltaSum;
  return Math.max(0, Math.round(total * 100) / 100);
}

module.exports = { computeShippingTotal };
