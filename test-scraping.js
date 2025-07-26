const puppeteer = require('puppeteer');

async function testChromeConnection() {
  console.log('🧪 Testing Chrome connection for scraping...');
  
  try {
    // Test connection
    const browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222',
    });
    
    console.log('✅ Chrome connection successful!');
    
    // Test page creation
    const page = await browser.newPage();
    console.log('✅ Page creation successful!');
    
    // Test navigation
    await page.goto('https://twitter.com', { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('✅ Navigation successful!');
    
    // Clean up
    await page.close();
    await browser.disconnect();
    
    console.log('✅ All tests passed! Chrome is working correctly for scraping.');
    return true;
    
  } catch (error) {
    console.error('❌ Chrome connection test failed:', error.message);
    return false;
  }
}

testChromeConnection(); 