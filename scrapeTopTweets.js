require('dotenv').config();
const puppeteer = require('puppeteer-core'); // use puppeteer-core for connect()

async function scrapeTopTweets() {
  const browser = await puppeteer.connect({
    browserURL: 'http://localhost:9222',
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);

  try {
    console.log('✅ Navigating to your tweets...');
    await page.goto(`https://twitter.com/${process.env.TWITTER_USERNAME}/with_replies`, {
      waitUntil: 'networkidle2',
    });

    // Scroll to load more tweets
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const tweets = await page.$$eval('article', articles =>
      articles.map(article => {
        const textEl = article.querySelector('div[lang]');
        const linkEl = article.querySelector('a[href*="/status/"]');

        const metricSpans = [...article.querySelectorAll('div[role="group"] span')];
        const metricValues = metricSpans
          .map(el => el.innerText?.replace(/,/g, '').trim())
          .filter(val => val && /^\d+$/.test(val));

        const replies = parseInt(metricValues[0]) || 0;
        const reposts = parseInt(metricValues[1]) || 0;
        const likes = parseInt(metricValues[2]) || 0;

        const text = textEl?.innerText || '';
        const url = linkEl ? 'https://twitter.com' + linkEl.getAttribute('href') : null;

        return (text && url) ? {
          text,
          url,
          replies,
          reposts,
          likes,
          engagements: replies + reposts + likes
        } : null;
      }).filter(Boolean)
    );

    const topTweets = tweets
      .sort((a, b) => b.engagements - a.engagements)
      .slice(0, 10);

    console.log(`📌 Found ${topTweets.length} top tweets.`);

    // ✅ Only close the page, not the entire browser
    await page.close();

    return topTweets;
  } catch (err) {
    console.error('❌ Scraping error:', err.message);

    // Safely close page if open
    if (!page.isClosed()) {
      await page.close();
    }

    return [];
  }
}

module.exports = scrapeTopTweets;
