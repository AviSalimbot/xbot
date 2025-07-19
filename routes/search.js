const express = require('express');
const { scrapeTweets } = require('../twitterScrape');
const router = express.Router();

router.get('/', async (req, res) => {
  const tweets = await scrapeTweets(req.topicConfig);
  res.json({ success: true, message: `Fetched ${tweets.length} relevant tweets.`, tweets });
});

module.exports = router;
