require('dotenv').config();
const puppeteer = require('puppeteer');

async function scrapeEthereumTweets() {
  const browser = await puppeteer.connect({
    browserURL: 'http://localhost:9222', // Use running Chrome
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(90000);

  try {

    console.log('✅ Navigating to search page...');
    await page.goto('https://twitter.com/search?q=%23ethereum&src=typed_query&f=top', {
      waitUntil: 'networkidle2',
      timeout: 90000,
    });

    await page.waitForSelector('article', { timeout: 90000 });

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const tweets = await page.$$eval('article', articles =>
      articles.map(article => {
        const textEl = article.querySelector('div[lang]');
        const linkEl = article.querySelector('a[href*="/status/"]');
        const metrics = [...article.querySelectorAll('div[role="group"] span')]
          .map(el => el.innerText.replace(/,/g, '').trim());
        const [replies = '0', reposts = '0', likes = '0'] = metrics;
        const text = textEl?.innerText;
        const url = linkEl ? 'https://twitter.com' + linkEl.getAttribute('href') : null;

        return text && url
          ? {
              text,
              url,
              replies: parseInt(replies),
              reposts: parseInt(reposts),
              likes: parseInt(likes),
            }
          : null;
      }).filter(Boolean)
    );

    console.log(`✅ Found ${tweets.length} tweets.`);
    await page.close(); // Just close the tab
    return tweets;
  } catch (error) {
    console.error('❌ Scraping failed:', error.message);
    await page.close(); // Ensure tab is closed even on error
    return [];
  }
}

module.exports = scrapeEthereumTweets;
