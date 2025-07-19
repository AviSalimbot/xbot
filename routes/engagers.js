const express = require('express');
const scrapeLatestEngagers = require('../scrapeLatestEngagers');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await scrapeLatestEngagers();
    if (result.success) {
      res.json({ success: true, message: 'Fetched latest engagers!', engagers: result.engagers });
    } else {
      res.status(500).json({ success: false, message: result.error, engagers: [] });
    }
  } catch (error) {
    console.error('Error in engagers route:', error);
    res.status(500).json({ success: false, message: 'Error fetching latest engagers', engagers: [] });
  }
});

module.exports = router;
