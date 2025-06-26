require('dotenv').config();
const { google } = require('googleapis');
const puppeteer = require('puppeteer');
const { analyzeTweet } = require('./twitterScrape');
const cron = require('node-cron');
const fs = require('fs');
const LAST_ROW_FILE = '.last_row.txt';
const LOCK_FILE = '.monitor.lock';
let isProcessing = false;

const SHEET_NAME_PREFIX = 'Ethereum Tweets';
const RELEVANT_SHEET = 'Sheet1';

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

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


async function getLatestEthereumTweetsSpreadsheet(auth) {
  const drive = google.drive({ version: 'v3', auth });
  // List all spreadsheets accessible to the service account
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed = false",
    fields: 'files(id,name,modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: 50
  });
  const files = res.data.files || [];
  // Find the most recent file whose name matches the prefix
  const candidates = files.filter(f => f.name.startsWith(SHEET_NAME_PREFIX));
  if (candidates.length === 0) return null;
  // Return the most recently modified
  return candidates[0];
}

async function getLatestEthereumTweetsSheet(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  // Just pick the first (or only) tab, regardless of its name
  return meta.data.sheets[0]?.properties.title;
}

function toUTC8(dateStr) {
  // Example input: "June 24, 2025 at 07:34AM" or "June 24, 2025 at 07:34 AM"
  let d;
  if (dateStr.includes('at')) {
    let [date, time] = dateStr.split(' at ');
    // Ensure there is a space before AM/PM
    time = time.replace(/(\d{1,2}:\d{2})\s?(AM|PM)/i, '$1 $2');
    // Parse as UTC
    d = new Date(`${date} ${time} UTC`);
  } else {
    d = new Date(dateStr + ' UTC');
  }
  if (isNaN(d.getTime())) {
    d = new Date(Date.parse(dateStr));
  }
  if (isNaN(d.getTime())) {
    return 'Invalid Date';
  }
  // Add 8 hours in milliseconds
  d = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  // Format back
  const options = { month: 'long', day: 'numeric', year: 'numeric' };
  const datePart = d.toLocaleDateString('en-US', options);
  let hour = d.getUTCHours();
  const min = d.getUTCMinutes().toString().padStart(2, '0');
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${datePart} at ${hour}:${min}${ampm}`;
}

async function getFollowerCount(handle) {
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9222'
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1, height: 1 }); // Minimize visibility
  try {
    await page.goto(`https://x.com/${handle.replace(/^@/, '')}`, { waitUntil: 'networkidle2', timeout: 60000 });
    // Wait for the followers element
    await page.waitForSelector('a[href$="/verified_followers"] span > span', { timeout: 15000 });

    const followersText = await page.$eval(
      'a[href$="/verified_followers"] span > span',
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
    await page.close();
    return Math.round(followersCount) || 0;
  } catch (e) {
    console.error(`Failed to load profile for ${handle}:`, e.message);
    await page.close();
    return 0; // or another fallback value
  }
}

async function processNewRows() {
  if (isProcessing) {
    console.log('Already processing, skipping...');
    return;
  }
  isProcessing = true;
  
  try {
    const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  
  // Find the latest Ethereum Tweets spreadsheet file
  const latestFile = await getLatestEthereumTweetsSpreadsheet(auth);
  if (!latestFile) {
    console.log('No Ethereum Tweets spreadsheet file found.');
    return;
  }
  
  const spreadsheetId = latestFile.id;
  
  // Reset .last_row.txt if a new sheet is detected, and create/update .last_sheet_id.txt
  const LAST_SHEET_ID_FILE = '.last_sheet_id.txt';
  let lastSheetId = '';
  if (fs.existsSync(LAST_SHEET_ID_FILE)) {
    lastSheetId = fs.readFileSync(LAST_SHEET_ID_FILE, 'utf8');
  }
  if (spreadsheetId !== lastSheetId) {
    fs.writeFileSync(LAST_ROW_FILE, '0');
    fs.writeFileSync(LAST_SHEET_ID_FILE, spreadsheetId);
  }
  
  const latestSheet = await getLatestEthereumTweetsSheet(sheets, spreadsheetId);
  if (!latestSheet) {
    console.log('No Ethereum Tweets sheet/tab found in the latest file.');
    return;
  }
  
  // Get all data
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${latestSheet}!A:D`
  });
  const rows = res.data.values || [];
  if (rows.length === 0) return; // No data

  let lastProcessedRow = 0;
  if (fs.existsSync(LAST_ROW_FILE)) {
    lastProcessedRow = parseInt(fs.readFileSync(LAST_ROW_FILE, 'utf8'), 10);
  }

  // Get already processed (Relevant Tweets) to avoid duplicates
  const targetSpreadsheetId = process.env.GOOGLE_TARGET_SPREADSHEET_ID;
  const relevantRes = await sheets.spreadsheets.values.get({
    spreadsheetId: targetSpreadsheetId,
    range: `${RELEVANT_SHEET}!A:E`
  });
  const relevantRows = relevantRes.data.values || [];
  const processedSet = new Set(relevantRows.map(r => r[3])); // Use tweet link as unique key

  // Only process each new row once per run
  for (let i = lastProcessedRow; i < rows.length; i++) {
    const [createdAt, handle, tweetText, tweetLink] = rows[i];
    if (processedSet.has(tweetLink)) continue;

    const followerCount = await getFollowerCount(handle);
    if (followerCount <= 1000) {
      console.log(`Tweet ${i + 1} FAIL (Follower count too low)`);
      continue;
    }

    const result = await analyzeTweet(tweetText);
    if (result !== 'PASS') {
      console.log(`Tweet ${i + 1} FAIL`);
      continue;
    }

    const createdAtUTC8 = toUTC8(createdAt);
    const newRow = [createdAtUTC8, handle, tweetText, tweetLink, followerCount];
    await sheets.spreadsheets.values.append({
      spreadsheetId: targetSpreadsheetId,
      range: `${RELEVANT_SHEET}!A:E`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: [newRow] }
    });
    console.log(`Tweet ${i + 1} PASS`);
    console.log(`✅ Added relevant tweet: ${tweetLink}`);
    await new Promise(r => setTimeout(r, 2000)); // Avoid rate limits
  }

  // Update last processed row to avoid duplicate processing
  fs.writeFileSync(LAST_ROW_FILE, rows.length.toString());
  } catch (error) {
    console.error('Error processing rows:', error);
  } finally {
    isProcessing = false;
  }
}

function getMonitoringStatus() {
  // Monitoring is active if the lock file exists and the process is alive
  if (!fs.existsSync(LOCK_FILE)) return false;
  try {
    const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8'), 10);
    // Check if process is running
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // Process not running, remove stale lock file
    fs.unlinkSync(LOCK_FILE);
    return false;
  }
}

if (require.main === module) {
  // Create lock file to indicate monitoring is active
  fs.writeFileSync(LOCK_FILE, process.pid.toString());

  // Remove lock file on exit
  const cleanup = () => {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
    process.exit();
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);

  // Run immediately when script is executed directly
  processNewRows();
  // Then run every 5 minutes
  cron.schedule('*/5 * * * *', processNewRows);
  console.log('Monitoring started. Running every 5 minutes...');
}

module.exports = { processNewRows, getMonitoringStatus };

