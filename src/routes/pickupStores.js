const express = require('express');
const PickupStoreService = require('../services/PickupStoreService');

const router = express.Router();

// GET /api/v1/pickup-stores — active Cyprus pickup locations for checkout
router.get('/', async (req, res) => {
  try {
    const stores = await PickupStoreService.listActive();
    res.json({ stores, country: 'CY' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
