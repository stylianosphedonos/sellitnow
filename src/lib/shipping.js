/**
 * Shipping / delivery for an order.
 *
 * Rules:
 * - Fewer than FREE_DELIVERY_MIN_ITEMS units → charge the store default delivery
 *   cost, adjusted by any per-product delivery overrides (delta vs default).
 * - FREE_DELIVERY_MIN_ITEMS or more units → free delivery.
 * - Pickup uses the same quantity rule (Cyprus pickup still charges the default
 *   under the threshold).
 *
 * @param {number} defaultDelivery
 * @param {Array<{ quantity: number, delivery_cost?: number | null }>} lines
 * @param {{ fulfillmentMethod?: string }} [options] reserved for callers; quantity rule applies to all methods
 */
const FREE_DELIVERY_MIN_ITEMS = 10;

function countOrderItems(lines) {
  return (lines || []).reduce((sum, line) => sum + Math.max(0, Number(line.quantity) || 0), 0);
}

function computeShippingTotal(defaultDelivery, lines, options = {}) {
  void options;
  const itemCount = countOrderItems(lines);
  if (itemCount >= FREE_DELIVERY_MIN_ITEMS) return 0;

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

module.exports = { computeShippingTotal, countOrderItems, FREE_DELIVERY_MIN_ITEMS };
