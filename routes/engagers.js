const express = require('express');
const scrapeLatestEngagers = require('../scrapeLatestEngagers');
const router = express.Router();

router.get('/', async (req, res) => {
  const result = await scrapeLatestEngagers();
  if (result.success) {
    res.json({ success: true, message: 'Fetched latest engagers!', engagers: result.engagers });
  } else {
    res.status(500).json({ success: false, message: result.error, engagers: [] });
  }
});

module.exports = router;
