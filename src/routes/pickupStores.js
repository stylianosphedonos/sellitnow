const express = require('express');
const PickupStoreService = require('../services/PickupStoreService');
const CourierPickupSyncService = require('../services/CourierPickupSyncService');

const router = express.Router();

let syncInFlight = null;

async function ensureStoresSynced() {
  const counts = await PickupStoreService.countByProvider();
  const activeTotal = Object.values(counts).reduce((sum, c) => sum + (c.active || 0), 0);
  if (activeTotal > 0) return { synced: false, counts };

  if (!syncInFlight) {
    syncInFlight = CourierPickupSyncService.syncAll()
      .catch((err) => ({ error: err.message }))
      .finally(() => {
        syncInFlight = null;
      });
  }
  await syncInFlight;
  const refreshed = await PickupStoreService.countByProvider();
  return { synced: true, counts: refreshed };
}

// GET /api/v1/pickup-stores — Cyprus courier pickup locations (city required for store list)
router.get('/', async (req, res) => {
  try {
    const provider = String(req.query.provider || '').trim().toLowerCase();
    const q = String(req.query.q || '').trim();
    const city = String(req.query.city || '').trim();

    const ensure = await ensureStoresSynced();
    const counts = ensure.counts || (await PickupStoreService.countByProvider());
    const cities = await PickupStoreService.listCities();
    const activeTotal = Object.values(counts).reduce((sum, c) => sum + (c.active || 0), 0);

    let stores = [];
    if (city) {
      const filters = { city };
      if (provider && provider !== 'all') filters.provider = provider;
      if (q) filters.q = q;
      stores = await PickupStoreService.listActive(filters);
    }

    res.json({
      stores,
      cities,
      counts,
      active_total: activeTotal,
      country: 'CY',
      providers: PickupStoreService.PROVIDER_LABELS,
      synced_now: Boolean(ensure.synced),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
