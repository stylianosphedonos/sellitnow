const OrderService = require('./OrderService');

const CHECK_INTERVAL_MS = Math.max(
  60_000,
  parseInt(process.env.UNPAID_ORDER_CHECK_INTERVAL_MS || String(6 * 60 * 60 * 1000), 10) ||
    6 * 60 * 60 * 1000
);

let timer = null;
let running = false;

async function runExpiryCheck() {
  if (running) return;
  running = true;
  try {
    await OrderService.expireUnpaidOrders();
  } catch (err) {
    console.error('[OrderExpiry] Scheduled check failed:', err.message);
  } finally {
    running = false;
  }
}

function startOrderExpiryScheduler() {
  if (timer) return;
  runExpiryCheck().catch(() => {});
  timer = setInterval(() => {
    runExpiryCheck().catch(() => {});
  }, CHECK_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  console.log(
    `[OrderExpiry] Checking unpaid orders every ${Math.round(CHECK_INTERVAL_MS / 60000)} minutes`
  );
}

module.exports = { startOrderExpiryScheduler, runExpiryCheck };
