const CHECKOUT_COUNTRY = 'CY';

function normalizeCountry(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function normalizePhone(value) {
  const phone = String(value || '').trim();
  return phone || null;
}

function assertCyprusOnly(country) {
  if (normalizeCountry(country) !== CHECKOUT_COUNTRY) {
    throw new Error('Checkout is available only in Cyprus (CY).');
  }
}

/**
 * Compact payload for Stripe PaymentIntent metadata (length-limited).
 */
function toPaymentMetadataAddress(resolved) {
  const meta = {
    fulfillment_method: 'pickup',
    pickup_store_id: resolved.pickup_store_id,
    country: CHECKOUT_COUNTRY,
  };
  if (resolved.phone) meta.phone = resolved.phone;
  return meta;
}

/**
 * Resolve and validate buyer checkout address. Cyprus pickup only.
 *
 * @param {object} raw
 * @param {{ getActiveById: (id: number) => Promise<object|null> }} pickupStoreService
 */
async function resolveCheckoutAddress(raw, pickupStoreService) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Pickup store selection is required');
  }

  const method = String(raw.fulfillment_method || 'pickup')
    .trim()
    .toLowerCase();
  if (method === 'delivery') {
    throw new Error('Home delivery is not available. Please choose a Cyprus pickup store.');
  }
  if (method !== 'pickup') {
    throw new Error('Invalid fulfillment method');
  }

  const phone = normalizePhone(raw.phone);
  const storeId = parseInt(raw.pickup_store_id, 10);
  if (!Number.isInteger(storeId) || storeId <= 0) {
    throw new Error('Please select a pickup store');
  }
  const store = await pickupStoreService.getActiveById(storeId);
  if (!store) {
    throw new Error('Selected pickup store is not available');
  }
  assertCyprusOnly(store.country || CHECKOUT_COUNTRY);

  const resolved = {
    fulfillment_method: 'pickup',
    pickup_store_id: store.id,
    pickup_store_name: store.name,
    pickup_provider: store.provider || null,
    address_line1: store.address_line1,
    city: store.city,
    postal_code: store.postal_code,
    country: CHECKOUT_COUNTRY,
  };
  if (phone) resolved.phone = phone;
  else if (store.phone) resolved.phone = String(store.phone).trim();
  if (store.hours) resolved.hours = store.hours;
  return resolved;
}

function isPickupAddress(addr) {
  return addr && String(addr.fulfillment_method || '').toLowerCase() === 'pickup';
}

module.exports = {
  CHECKOUT_COUNTRY,
  assertCyprusOnly,
  normalizeCountry,
  resolveCheckoutAddress,
  toPaymentMetadataAddress,
  isPickupAddress,
};
