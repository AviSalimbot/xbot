const puppeteer = require('puppeteer');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// Load configuration based on environment
function getConfig() {
  const configPath = path.join(__dirname, 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  const environment = process.env.TOPIC || 'ethereum';
  if (!config[environment]) {
    throw new Error(`Configuration for topic '${environment}' not found in config.json`);
  }
  
  return config[environment];
}

async function getAuth() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || 'service-account-key.json',
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file'
    ],
  });
  return auth.getClient();
}

async function findFollowSheet(auth, config) {
  const drive = google.drive({ version: 'v3', auth });
  // Search for the follow sheet by name in the specified folder
  const res = await drive.files.list({
    q: `name='${config.followSheet}' and '${config.folder}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed = false`,
    fields: 'files(id,name)',
    pageSize: 10
  });
  const files = res.data.files || [];
  return files.length > 0 ? files[0].id : null;
}

async function followAccounts(customThreshold = null) {
  const config = getConfig();
  
  // Use custom threshold if provided, otherwise use config default
  const effectiveThreshold = customThreshold !== null ? customThreshold : config.followAccountsThreshold;
  console.log(`🎯 Using follower threshold: ${effectiveThreshold} (${customThreshold !== null ? 'custom' : 'config default'})`);
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9222',
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(90000);

  try {
    console.log(`✅ Searching for ${config.name} accounts...`);

    await page.goto(`https://twitter.com/search?q=${config.userSearchQuery}&f=user`, { waitUntil: 'networkidle2' });
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

    console.log(`🔎 Found ${accounts.length} ${config.name.toLowerCase()}-related accounts.`);

    const followedAccounts = [];

    for (const relativeUrl of accounts) {
      if (followedAccounts.length >= 1) break; // Limit to 1 follow

      try {
        const profilePage = await browser.newPage();
        const profileUrl = 'https://twitter.com' + relativeUrl;
        console.log(`➡️ Opening profile ${profileUrl}`);

        await profilePage.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait for followers count span inside verified_followers link
        await profilePage.waitForSelector('a[href*="verified_followers"] span > span', { timeout: 15000 });

        const followersText = await profilePage.$eval(
          'a[href*="verified_followers"] span > span',
          el => el.textContent.trim()
        );

        // Convert followers count text to number
        let followersCount = 0;
        if (followersText.toLowerCase().endsWith('k')) {
          followersCount = parseFloat(followersText.toLowerCase().replace('k', '')) * 1000;
        } else if (followersText.toLowerCase().endsWith('m')) {
          followersCount = parseFloat(followersText.toLowerCase().replace('m', '')) * 1000000;
        } else {
          followersCount = parseInt(followersText.replace(/,/g, ''), 10);
        }

        console.log(`👥 Followers: ${followersCount}`);

        // Select follow button by data-testid ending with "-follow"
        const followButton = await profilePage.$('button[data-testid$="-follow"]');

        if (followersCount > effectiveThreshold && followButton) {
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
          console.log(`⏭️ Skipping (followers <= ${effectiveThreshold} or already following).`);
        }

        await profilePage.close();
      } catch (e) {
        console.error(`❌ Failed on ${relativeUrl}: ${e.message}`);
      }
    }

    await page.close();

    if (followedAccounts.length > 0) {
      console.log('📄 Adding followed accounts to Google Sheet...');

      try {
        const auth = await getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        
        const followSheetId = await findFollowSheet(auth, config);
        if (!followSheetId) {
          console.log(`Follow sheet "${config.followSheet}" not found in folder`);
          return followedAccounts;
        }

        // Add each followed account as a row
        for (const acc of followedAccounts) {
          const now = new Date().toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });
          
          const newRow = [now, acc.profileUrl, acc.handle, acc.followers];
          
          await sheets.spreadsheets.values.append({
            spreadsheetId: followSheetId,
            range: 'Sheet1!A:D',
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: { values: [newRow] }
          });
          
          console.log(`✅ Added followed account to sheet: ${acc.handle}`);
        }
      } catch (error) {
        console.error('❌ Error adding to Google Sheet:', error.message);
      }
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

module.exports = followAccounts;
