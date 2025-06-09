const express = require('express');
const scrapeEthereumTweets = require('../twitterScrape');
const router = express.Router();

router.get('/', async (req, res) => {
  const tweets = await scrapeEthereumTweets();
  res.json({ success: true, message: `Fetched ${tweets.length} relevant tweets.`, tweets });
});

module.exports = router;
