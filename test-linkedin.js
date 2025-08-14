// Simple test script for LinkedIn scraper
const { scrapeLinkedInAlumni } = require('./linkedinScraper');

async function testLinkedInScraper() {
    console.log('🧪 Testing LinkedIn Alumni Scraper...\n');
    
    try {
        // Test with Stanford University and HR keywords
        const result = await scrapeLinkedInAlumni('stanford-university', 'hr', 5);
        
        console.log('📊 Test Results:');
        console.log(`Success: ${result.success}`);
        console.log(`University: ${result.university}`);
        console.log(`Keywords: "${result.keywords}"`);
        console.log(`Alumni found: ${result.alumni.length}`);
        
        if (result.success && result.alumni.length > 0) {
            console.log('\n👥 Sample Alumni:');
            result.alumni.slice(0, 3).forEach((alumni, index) => {
                console.log(`${index + 1}. ${alumni.firstName} ${alumni.lastName}`);
                console.log(`   Company: ${alumni.company || 'Not specified'}`);
                console.log(`   Job Title: ${alumni.jobTitle || 'Not specified'}`);
                console.log();
            });
        } else if (!result.success) {
            console.log(`❌ Error: ${result.error}`);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Only run test if called directly
if (require.main === module) {
    testLinkedInScraper();
}

module.exports = { testLinkedInScraper };