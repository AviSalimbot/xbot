const puppeteer = require('puppeteer');
const xlsx = require('xlsx');
const path = require('path');

async function followEthereumAccounts() {
  const browser = await puppeteer.connect({
    browserURL: 'http://localhost:9222',
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(90000);

  try {
    console.log('✅ Searching for Ethereum accounts...');

    await page.goto('https://twitter.com/search?q=ethereum&f=user', { waitUntil: 'networkidle2' });
    await page.waitForSelector('div[aria-label="Timeline: Search timeline"]', { timeout: 90000 });

    // Scroll to load more accounts
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await new Promise(res => setTimeout(res, 2000));
    }

    // Get unique account URLs from the search timeline (filter out tweets)
    const accounts = await page.$$eval(
      'div[aria-label="Timeline: Search timeline"] a[role="link"][href^="/"]:not([href*="/status/"])',
      links => {
        const hrefs = links.map(a => a.getAttribute('href'));
        return [...new Set(hrefs)];
      }
    );

    console.log(`🔎 Found ${accounts.length} ethereum-related accounts.`);

    const followedAccounts = [];

    for (const relativeUrl of accounts) {
      if (followedAccounts.length >= 5) break; // Limit to 5 follows

      try {
        const profilePage = await browser.newPage();
        const profileUrl = 'https://twitter.com' + relativeUrl;
        console.log(`➡️ Opening profile ${profileUrl}`);

        await profilePage.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait for followers count span inside verified_followers link
        await profilePage.waitForSelector('a[href$="/verified_followers"] span > span', { timeout: 15000 });

        const followersText = await profilePage.$eval(
          'a[href$="/verified_followers"] span > span',
          el => el.textContent.trim()
        );

        // Convert followers count text to number
        let followersCount = 0;
        if (followersText.toLowerCase().endsWith('k')) {
          followersCount = parseFloat(followersText.toLowerCase().replace('k', '')) * 1000;
        } else {
          followersCount = parseInt(followersText.replace(/,/g, ''), 10);
        }

        console.log(`👥 Followers: ${followersCount}`);

        // Select follow button by data-testid ending with "-follow"
        const followButton = await profilePage.$('button[data-testid$="-follow"]');

        if (followersCount > 5000 && followButton) {
          console.log('👉 Following...');
          await followButton.click();
          await new Promise(res => setTimeout(res, 3000));

          // Extract twitter handle from URL
          const handle = relativeUrl.replace('/', '').split('?')[0];

          followedAccounts.push({
            profileUrl,
            handle,
            followers: Math.round(followersCount),
          });
        } else {
          console.log('⏭️ Skipping (followers <= 5000 or already following).');
        }

        await profilePage.close();
      } catch (e) {
        console.error(`❌ Failed on ${relativeUrl}: ${e.message}`);
      }
    }

    await page.close();

    if (followedAccounts.length > 0) {
      console.log('📄 Creating spreadsheet with followed accounts...');

      const worksheetData = [
        ['URL LINK', 'TWITTER HANDLE', 'NUMBER OF FOLLOWERS'],
        ...followedAccounts.map(acc => [acc.profileUrl, acc.handle, acc.followers]),
      ];

      const workbook = xlsx.utils.book_new();
      const worksheet = xlsx.utils.aoa_to_sheet(worksheetData);
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Followed Ethereum Accounts');

      const now = new Date();
        const displayName = now.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
        }); // "06/10/2025, 14:35"

        const safeDisplayName = displayName
        .replace(/\//g, '-')  // replace slashes with dashes
        .replace(/:/g, '-')   // replace colons with dashes
        .replace(',', '');    // remove comma

        const filePath = path.join(
        process.cwd(),
        `Follow Report - ${safeDisplayName}.xlsx`
        );

        xlsx.writeFile(workbook, filePath);
        console.log(`✅ Spreadsheet saved: ${filePath}`);


    } else {
      console.log('No accounts followed.');
    }

    return followedAccounts;
  } catch (error) {
    console.error('❌ Error:', error.message);
    await page.close();
    return [];
  }
}

module.exports = followEthereumAccounts;
