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
    await page.goto('https://twitter.com/search?q=ethereum%20-XRP%20-ADA%20-ICO%20-prize%20-giveaway%20-airdrop%20-air%20-drop%20-rich%20-win%20-scam%20-free%20-claim%20-bonus%20-earn%20-presale%20-whitelist%20-referral%20-rewards%20-lottery%20-jackpot%20-million%20-profit%20-trading%20-bot%20-pump%20-dump%20-wallet%20-click%20-link%20-join%20-moon%20-100x%20-gem%20-10x%20-20x%20-1000x%20-live%20-connect%20-%23coinoxa%20-%23yovovix%20-%23twyae%20-%23coinanzor%20-%23coinfluct%20-%23soondex%20-%23Fextap%20-%23Cryptorecovery%20-%23Cryptoscam%20-%23Cryptexar%20-%23scam%20-%23giveaway%20-%23airdrop%20-RT%20-%23invest%20-invest%20-doge%20-pepe%20-meme%20-mint%20-memecoin%20-memecoins%20-%24SHIB%20-%23SHIB%20lang%3Aen%20-%C3%B6%20-%C3%A4%20-%C3%BC%20-%C3%9F%20-%C3%A9%20-%C3%A8%20-%C3%AA%20-%C3%AB%20-%C3%A7%20-%C3%A0%20-%C3%A2%20-%C3%AE%20-%C3%B4%20-%C3%BB%20-%C3%B1%20-%C3%A1%20-%C3%AD%20-%C3%B3%20-%C3%BA%20-%C3%A5%20-%C3%B8%20-%C3%A6%20-%C5%82%20-%C5%A1%20-%C5%BE%20-%C4%8D%20-%C5%99%20-%C4%99%20-%C4%85&src=typed_query&f=top', {
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
