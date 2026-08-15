const express = require('express');
const PickupStoreService = require('../services/PickupStoreService');

const router = express.Router();

// GET /api/v1/pickup-stores — active Cyprus courier pickup locations
router.get('/', async (req, res) => {
  try {
    const provider = String(req.query.provider || '').trim().toLowerCase();
    const q = String(req.query.q || '').trim();
    const city = String(req.query.city || '').trim();
    const filters = {};
    if (provider && provider !== 'all') filters.provider = provider;
    if (q) filters.q = q;
    if (city) filters.city = city;

    const [stores, cities, counts] = await Promise.all([
      PickupStoreService.listActive(filters),
      PickupStoreService.listCities(),
      PickupStoreService.countByProvider(),
    ]);

    res.json({
      stores,
      cities,
      counts,
      country: 'CY',
      providers: PickupStoreService.PROVIDER_LABELS,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
