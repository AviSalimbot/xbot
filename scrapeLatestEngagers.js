const puppeteer = require('puppeteer');

async function scrapeLatestEngagers() {
  let browser = null;
  let page = null;
  
  try {
    // Connect with retry logic
    let retries = 3;
    while (retries > 0) {
      try {
        browser = await puppeteer.connect({
          browserURL: 'http://localhost:9222',
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
    page.setDefaultNavigationTimeout(120000); // ⏱️ Increased timeout

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
            || text.includes('replied to your post')
            || text.includes('reposted your post')
            || text.includes('liked your reply')
            || text.includes('retweeted')
            || text.includes('Replying to')
            || /reposted \d+ of your posts/.test(text)
            || /liked \d+ of your posts/.test(text)
          })
          .map(article => {
            const link = article.querySelector('a[role="link"][href^="/"]');
            const href = link ? link.getAttribute('href') : '';
            return href.replace('/', '').split('?')[0];
          })
          .filter(Boolean);
      }
    );

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

    // 🔥 Sort engagers by follower count (highest to lowest)
    results.sort((a, b) => b.followers - a.followers);

    console.log('✅ Engagers sorted by follower count:');
    results.forEach((engager, index) => {
      console.log(`${index + 1}. @${engager.handle} - ${engager.followers.toLocaleString()} followers`);
    });

    await page.close(); // Close main page tab only
    // Do NOT close the browser itself
    return { success: true, engagers: results };

  } catch (err) {
    console.error('❌ Scraper failed:', err.message);
    return { success: false, engagers: [], error: err.message };
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

module.exports = scrapeLatestEngagers;