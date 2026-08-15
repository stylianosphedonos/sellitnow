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
  if (resolved.fulfillment_method === 'pickup') {
    const meta = {
      fulfillment_method: 'pickup',
      pickup_store_id: resolved.pickup_store_id,
      country: CHECKOUT_COUNTRY,
    };
    if (resolved.phone) meta.phone = resolved.phone;
    return meta;
  }
  const meta = {
    fulfillment_method: 'delivery',
    address_line1: resolved.address_line1,
    city: resolved.city,
    postal_code: resolved.postal_code,
    country: CHECKOUT_COUNTRY,
  };
  if (resolved.phone) meta.phone = resolved.phone;
  return meta;
}

/**
 * Resolve and validate buyer checkout address. Cyprus only.
 * Pickup expands store details from the database.
 *
 * @param {object} raw
 * @param {{ getActiveById: (id: number) => Promise<object|null> }} pickupStoreService
 */
async function resolveCheckoutAddress(raw, pickupStoreService) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Shipping address is required');
  }

  const method = String(raw.fulfillment_method || 'delivery')
    .trim()
    .toLowerCase();
  const phone = normalizePhone(raw.phone);

  if (method === 'pickup') {
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

  if (method !== 'delivery') {
    throw new Error('Invalid fulfillment method');
  }

  assertCyprusOnly(raw.country);

  const address_line1 = String(raw.address_line1 || '').trim();
  const city = String(raw.city || '').trim();
  const postal_code = String(raw.postal_code || '').trim();
  if (!address_line1 || !city || !postal_code) {
    throw new Error('Delivery address is incomplete');
  }

  const resolved = {
    fulfillment_method: 'delivery',
    address_line1,
    city,
    postal_code,
    country: CHECKOUT_COUNTRY,
  };
  if (phone) resolved.phone = phone;
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
