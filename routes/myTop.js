const express = require('express');
const scrapeTopTweets = require('../scrapeTopTweets');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const tweets = await scrapeTopTweets();
    res.json({ success: true, message: `Fetched ${tweets.length} top tweets.`, tweets });
  } catch (error) {
    console.error('Error in myTop route:', error);
    res.status(500).json({ success: false, message: 'Error fetching my tweets', tweets: [] });
  }
});

module.exports = router;
