const express = require('express');
const followAccounts = require('../followAccounts');
const router = express.Router();

// Handle both GET (legacy) and POST (new with threshold) requests
router.get('/', async (req, res) => {
    try {
      const followedAccounts = await followAccounts();
  
      const successMessage = followedAccounts.length > 0
        ? `Followed ${followedAccounts.length} accounts! Row created.`
        : 'No accounts followed.';
  
      // Always respond with JSON for this route:
      return res.json({
        success: true,
        message: successMessage,
        followed: followedAccounts
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
        followed: []
      });
    }
  });

router.post('/', async (req, res) => {
    try {
      const { threshold } = req.body;
      const followedAccounts = await followAccounts(threshold);
  
      const successMessage = followedAccounts.length > 0
        ? `Followed ${followedAccounts.length} accounts with ${threshold}+ followers! Row created.`
        : 'No accounts followed.';
  
      // Always respond with JSON for this route:
      return res.json({
        success: true,
        message: successMessage,
        followed: followedAccounts
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
        followed: []
      });
    }
  });  

module.exports = router;
