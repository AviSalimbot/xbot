const express = require('express');
const followEthereumAccounts = require('../followEthereumAccounts');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
      const followedAccounts = await followEthereumAccounts();
  
      const successMessage = followedAccounts.length > 0
        ? `Followed ${followedAccounts.length} accounts! Spreadsheet created.`
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
