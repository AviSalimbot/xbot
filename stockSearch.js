require('dotenv').config();
const puppeteer = require('puppeteer');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function searchStockTickers(ticker = null, minFollowers = 5000) {
    let browser = null;
    let page = null;
    
    try {
        console.log(`🔍 Starting stock ticker search${ticker ? ` for ${ticker}` : ''}...`);
        console.log(`👥 Minimum followers: ${minFollowers}`);
        
        // Connect to existing Chrome instance on port 9222 (Windows compatible)
        browser = await puppeteer.connect({
            browserURL: 'http://127.0.0.1:9222',
            defaultViewport: { width: 1366, height: 768 }
        });
        
        page = await browser.newPage();
        page.setDefaultNavigationTimeout(60000);
        
        // Set user agent
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        );
        
        // Build search query
        let searchQuery = 'thread 🧵';
        
        if (ticker) {
            // Search for specific ticker
            searchQuery += ` ${ticker}`;
        } else {
            // Search for general stock patterns - any $ followed by 4 letters
            searchQuery += ' ($AAPL OR $TSLA OR $NVDA OR $MSFT OR $GOOGL OR $AMZN OR $META OR $NFLX)';
        }
        
        console.log(`🔍 Search query: ${searchQuery}`);
        
        // Navigate to X.com search
        const encodedQuery = encodeURIComponent(searchQuery);
        const searchUrl = `https://x.com/search?q=${encodedQuery}&src=typed_query&f=live`;
        
        console.log('🌐 Navigating to X.com search...');
        await page.goto(searchUrl, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        // Wait for search results to load
        await delay(3000);
        
        // Scroll to load more tweets
        console.log('📜 Scrolling to load more tweets...');
        for (let i = 0; i < 3; i++) {
            await page.evaluate(() => window.scrollBy(0, window.innerHeight));
            await delay(2000);
        }
        
        // Extract tweets and user info
        console.log('📊 Extracting tweet data...');
        const tweets = await page.evaluate(() => {
            const articles = document.querySelectorAll('article[data-testid="tweet"]');
            const results = [];
            
            articles.forEach(article => {
                try {
                    // Get tweet text
                    const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
                    const tweetText = tweetTextEl ? tweetTextEl.innerText : '';
                    
                    // Skip if no text or doesn't contain thread indicator
                    if (!tweetText || (!tweetText.includes('🧵') && !tweetText.toLowerCase().includes('thread'))) {
                        return;
                    }
                    
                    // Get username
                    const usernameEl = article.querySelector('[data-testid="User-Name"] a[role="link"]');
                    const username = usernameEl ? usernameEl.href.split('/').pop() : null;
                    
                    // Get display name
                    const displayNameEl = article.querySelector('[data-testid="User-Name"] span span');
                    const displayName = displayNameEl ? displayNameEl.innerText : '';
                    
                    // Get tweet URL
                    const tweetLinkEl = article.querySelector('a[href*="/status/"]');
                    const tweetUrl = tweetLinkEl ? `https://x.com${tweetLinkEl.getAttribute('href')}` : '';
                    
                    // Get timestamp
                    const timeEl = article.querySelector('time');
                    const timestamp = timeEl ? timeEl.getAttribute('datetime') : '';
                    
                    // Check for stock ticker pattern
                    const stockTickerMatch = tweetText.match(/\$[A-Z]{2,5}/g);
                    
                    if (username && tweetText && stockTickerMatch) {
                        results.push({
                            username: username,
                            displayName: displayName,
                            tweetText: tweetText,
                            tweetUrl: tweetUrl,
                            timestamp: timestamp,
                            stockTickers: stockTickerMatch,
                            followerCount: null // Will be populated later
                        });
                    }
                } catch (error) {
                    console.error('Error processing tweet:', error);
                }
            });
            
            return results;
        });
        
        console.log(`📊 Found ${tweets.length} potential stock ticker threads`);
        
        // Get follower counts for users
        const uniqueUsers = [...new Set(tweets.map(t => t.username))];
        console.log(`👥 Getting follower counts for ${uniqueUsers.length} unique users...`);
        
        const userFollowerCounts = {};
        
        for (const username of uniqueUsers.slice(0, 10)) { // Limit to first 10 users to avoid rate limits
            try {
                console.log(`👤 Checking followers for @${username}...`);
                await page.goto(`https://x.com/${username}`, {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                });
                
                await delay(2000);
                
                // Wait for the followers element and get follower count
                await page.waitForSelector('a[href*="verified_followers"] span > span', { timeout: 15000 });

                const followersText = await page.$eval(
                    'a[href*="verified_followers"] span > span',
                    el => el.textContent.trim()
                );
                
                if (followersText) {
                    const numericFollowers = parseFollowerCount(followersText);
                    userFollowerCounts[username] = numericFollowers;
                    console.log(`👥 @${username}: ${followersText} (${numericFollowers} numeric)`);
                } else {
                    console.log(`❌ Could not get follower count for @${username}`);
                    userFollowerCounts[username] = 0;
                }
                
                await delay(1000);
            } catch (error) {
                console.error(`Error getting followers for @${username}:`, error.message);
                userFollowerCounts[username] = 0;
            }
        }
        
        // Filter tweets by follower count and add follower data
        const filteredTweets = tweets
            .map(tweet => ({
                ...tweet,
                followerCount: userFollowerCounts[tweet.username] || 0
            }))
            .filter(tweet => tweet.followerCount >= minFollowers)
            .sort((a, b) => b.followerCount - a.followerCount);
        
        console.log(`✅ Found ${filteredTweets.length} threads from users with ${minFollowers}+ followers`);
        
        return {
            success: true,
            tweets: filteredTweets,
            searchQuery: searchQuery,
            totalFound: tweets.length,
            filteredCount: filteredTweets.length,
            minFollowers: minFollowers
        };
        
    } catch (error) {
        console.error('❌ Error in stock ticker search:', error);
        return {
            success: false,
            error: error.message,
            tweets: []
        };
    } finally {
        if (page) {
            await page.close();
        }
        // Don't close browser since we're connecting to existing instance
        if (browser) {
            await browser.disconnect();
        }
    }
}

function parseFollowerCount(followersText) {
    if (!followersText) return 0;
    
    // Convert followers count text to number
    let followersCount = 0;
    if (followersText.toLowerCase().endsWith('k')) {
        followersCount = parseFloat(followersText.toLowerCase().replace('k', '')) * 1000;
    } else if (followersText.toLowerCase().endsWith('m')) {
        followersCount = parseFloat(followersText.toLowerCase().replace('m', '')) * 1000000;
    } else {
        followersCount = parseInt(followersText.replace(/,/g, ''), 10);
    }
    
    return Math.round(followersCount) || 0;
}

// Function to search for specific stock tickers
async function searchSpecificTicker(ticker, minFollowers = 5000) {
    if (!ticker.startsWith('$')) {
        ticker = '$' + ticker;
    }
    
    console.log(`🎯 Searching specifically for ${ticker} threads...`);
    return await searchStockTickers(ticker, minFollowers);
}

module.exports = {
    searchStockTickers,
    searchSpecificTicker
};