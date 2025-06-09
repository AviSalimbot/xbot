const puppeteer = require('puppeteer');

async function scrapeLatestEngagers() {
  // Connect to an existing Chrome with remote debugging enabled
  const browser = await puppeteer.connect({
    browserURL: 'http://localhost:9222',
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(120000); // ⏱️ Increased timeout

  try {

    console.log('✅ Navigating to notifications...');
    await page.goto('https://twitter.com/notifications', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 10000));

    // 3️⃣ Filter for engagement notifications
    const handles = await page.$$eval(
      'article[data-testid="notification"]',
      articles => {
        return articles
          .filter(article => {
            const text = article.innerText.toLowerCase();
            return text.includes('liked your post')
              || text.includes('replied to your tweet')
              || text.includes('reposted your tweet')
              || text.includes('retweeted');
          })
          .map(article => {
            const link = article.querySelector('a[role="link"][href^="/"]');
            const href = link ? link.getAttribute('href') : '';
            return href.replace('/', '').split('?')[0];
          })
          .filter(Boolean);
      }
    );

    console.log('✅ Inside Handles...');

    const uniqueHandles = [...new Set(handles)].slice(0, 10);

    // 4️⃣ Visit each profile to get followers count
    const results = [];
    for (const handle of uniqueHandles) {
      try {
        const profilePage = await browser.newPage();
        await profilePage.goto(`https://twitter.com/${handle}`, { waitUntil: 'networkidle2', timeout: 60000 });
        await profilePage.waitForSelector('a[href$="/verified_followers"]', { timeout: 60000 });

        const followersText = await profilePage.$eval(
          'a[href$="/verified_followers"] span:nth-child(1) > span:nth-child(1)',
          el => el.textContent.trim()
        );

        const followers = parseInt(followersText.replace(/,/g, '')) || 0;

        await profilePage.close(); // Close profile tab only
        results.push({ handle, followers });
      } catch (e) {
        console.error(`Failed @${handle}: ${e.message}`);
      }
    }

    await page.close(); // Close main page tab only
    // Do NOT close the browser itself
    return { success: true, engagers: results };

  } catch (err) {
    console.error('❌ Scraper failed:', err.message);
    await page.close(); // Close the main page tab on error as well
    return { success: false, engagers: [], error: err.message };
  }
}

module.exports = scrapeLatestEngagers;
