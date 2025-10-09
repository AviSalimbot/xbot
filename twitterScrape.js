require('dotenv').config();
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function analyzeTweet(tweetText) {
  return new Promise((resolve) => {
    const prompt = `You are a strict filter checking tweets against five criteria.
    1. Is NOT spammy
    2. Does NOT contain financial advice
    3. Is NOT from a bot
    4. Does NOT contain price predictions
    5. Does NOT contain political news
    
    Tweet: "${tweetText}"
    
    Return only one of these responses:
    - "PASS" if the tweet passes ALL criteria
    - "FAIL (Tweet is spam)" if it fails criteria 1
    - "FAIL (Tweet contains financial advice)" if it fails criteria 2
    - "FAIL (Tweet is from a bot)" if it fails criteria 3
    - "FAIL (Tweet contains price predictions)" if it fails criteria 4
    - "FAIL (Tweet contains political news)" if it fails criteria 5
    
    Return only the response, nothing else.`;

    const claude = spawn('/usr/local/bin/claude', ['-'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    
    claude.stdin.write(prompt);
    claude.stdin.end();
    
    claude.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    claude.on('close', () => {
      const result = output.trim();
      if (result.startsWith('FAIL')) {
        console.log(`Tweet analysis result: ${result}`);
        resolve('FAIL');
      } else {
        console.log(`Tweet analysis result: PASS`);
        resolve('PASS');
      }
    });
    
    claude.on('error', (error) => {
      console.error('Claude analysis failed:', error.message);
      resolve('FAIL');
    });
    
    // Add timeout to prevent hanging
    setTimeout(() => {
      claude.kill();
      console.log('Tweet analysis result: FAIL (Analysis timeout)');
      resolve('FAIL');
    }, 180000); // Increased timeout to 180 seconds
  });
}

async function scrapeTweets(topicConfig) {
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9222',
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(90000);

  try {
    const searchQuery = encodeURIComponent(topicConfig.searchQuery);
    const searchUrl = `https://twitter.com/search?q=${searchQuery}&src=typed_query&f=top`;
    
    console.log(`✅ Navigating to search page for ${topicConfig.name}...`);
    console.log(`Search URL: ${searchUrl}`);
    
    await page.goto(searchUrl, {
      waitUntil: 'networkidle2',
      timeout: 90000,
    });

    await page.waitForSelector('article', { timeout: 90000 });

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await delay(2000);
    }

    const rawTweets = await page.$$eval('article', articles =>
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

    console.log(`✅ Found ${rawTweets.length} raw tweets. Starting AI filtering...`);
    
    // Filter tweets using Claude Code
    const filteredTweets = [];
    for (const tweet of rawTweets) {
      const passesAI = await analyzeTweet(tweet.text);
      if (passesAI) {
        filteredTweets.push(tweet);
      }
      await delay(5000); // Longer delay to avoid rate limits
    }

    console.log(`✅ After AI filtering: ${filteredTweets.length} tweets remain.`);
    await page.close();
    return filteredTweets;
  } catch (error) {
    console.error('❌ Scraping failed:', error.message);
    await page.close();
    return [];
  }
}

// Keep the old function for backwards compatibility
async function scrapeEthereumTweets() {
  const fs = require('fs');
  const path = require('path');
  const configPath = path.join(__dirname, 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return scrapeTweets(config.ethereum);
}

module.exports = {
  scrapeTweets,
  scrapeEthereumTweets,
  analyzeTweet
};
