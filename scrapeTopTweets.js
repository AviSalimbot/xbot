require('dotenv').config();
const puppeteer = require('puppeteer-core'); // use puppeteer-core for connect()

async function scrapeTopTweets() {
  let browser = null;
  let page = null;
  
  try {
    // Check if TWITTER_USERNAME is set
    if (!process.env.TWITTER_USERNAME) {
      throw new Error('TWITTER_USERNAME environment variable is not set');
    }
    
    // Remove @ symbol if present
    const username = process.env.TWITTER_USERNAME.replace('@', '');
    
    // Connect with retry logic
    let retries = 3;
    while (retries > 0) {
      try {
        browser = await puppeteer.connect({
          browserURL: 'http://127.0.0.1:9222',
        });
        break;
      } catch (connectError) {
        retries--;
        if (retries === 0) {
          throw new Error(`Browser connection failed: ${connectError.message}`);
        }
        console.log(`⚠️ Browser connection failed, retrying... (${3 - retries}/3)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    page = await browser.newPage();
    page.setDefaultNavigationTimeout(90000);
    console.log('✅ Navigating to your tweets...');
    await page.goto(`https://twitter.com/${username}/with_replies`, {
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
  } catch (error) {
    console.error('❌ Error scraping tweets:', error.message);
    return [];
  } finally {
    // Cleanup
    try {
      if (page && !page.isClosed()) {
        await page.close();
      }
      if (browser && browser.connected) {
        await browser.disconnect();
      }
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError.message);
    }
  }
}

module.exports = scrapeTopTweets;
