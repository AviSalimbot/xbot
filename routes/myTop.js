const express = require('express');
const scrapeTopTweets = require('../scrapeTopTweets');
const router = express.Router();

router.get('/', async (req, res) => {
  const tweets = await scrapeTopTweets();
  res.json({ success: true, message: `Fetched ${tweets.length} top tweets.`, tweets });
});

module.exports = router;
