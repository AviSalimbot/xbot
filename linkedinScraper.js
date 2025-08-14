const puppeteer = require('puppeteer');

/**
 * Scrapes LinkedIn alumni search results for a given university
 * @param {string} universitySlug - The LinkedIn university slug (e.g., 'stanford-university')
 * @param {string} keywords - Optional keywords to filter results (e.g., 'hr')
 * @param {number} maxResults - Maximum number of results to return (default: 20)
 * @returns {Object} - Results object containing success status and alumni data
 */
async function scrapeLinkedInAlumni(universitySlug, keywords = '', maxResults = 20) {
    let browser = null;
    
    try {
        console.log(`🔍 Starting LinkedIn alumni scrape for ${universitySlug} with keywords: "${keywords}"`);
        
        // Launch browser with stealth settings
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });
        
        const page = await browser.newPage();
        
        // Set a realistic viewport and user agent
        await page.setViewport({ width: 1366, height: 768 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        // Construct LinkedIn alumni search URL
        let linkedinUrl = `https://www.linkedin.com/school/${universitySlug}/people/`;
        if (keywords) {
            linkedinUrl += `?keywords=${encodeURIComponent(keywords)}`;
        }
        
        console.log(`📱 Navigating to: ${linkedinUrl}`);
        
        // Navigate to the LinkedIn alumni page
        await page.goto(linkedinUrl, { 
            waitUntil: 'networkidle0',
            timeout: 30000 
        });
        
        // Wait for content to load
        await page.waitForTimeout(3000);
        
        // Check if we're being asked to log in
        const currentUrl = page.url();
        if (currentUrl.includes('linkedin.com/login') || currentUrl.includes('authwall')) {
            return {
                success: false,
                error: 'LinkedIn requires authentication. This scraper works best when LinkedIn allows public access to school pages.',
                alumni: []
            };
        }
        
        // Wait for alumni results to load
        try {
            await page.waitForSelector('.org-people-profile-card', { timeout: 10000 });
        } catch (error) {
            // Try alternative selectors
            const hasResults = await page.$('.search-results-container') || 
                             await page.$('.people-search-results') ||
                             await page.$('[data-test-id="people-search-result"]');
            
            if (!hasResults) {
                return {
                    success: false,
                    error: 'No alumni results found. The page structure may have changed or no results are available.',
                    alumni: []
                };
            }
        }
        
        // Extract alumni data using multiple selector strategies
        const alumni = await page.evaluate((maxResults) => {
            const results = [];
            
            // Try multiple selectors as LinkedIn frequently changes their structure
            const selectors = [
                '.org-people-profile-card',
                '[data-test-id="people-search-result"]',
                '.people-search-card',
                '.search-result-card'
            ];
            
            let elements = [];
            for (const selector of selectors) {
                elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    console.log(`Found ${elements.length} elements with selector: ${selector}`);
                    break;
                }
            }
            
            // If no specific alumni cards found, try general profile cards
            if (elements.length === 0) {
                elements = document.querySelectorAll('.entity-result__item, .reusable-search-result');
            }
            
            console.log(`Processing ${Math.min(elements.length, maxResults)} alumni profiles`);
            
            for (let i = 0; i < Math.min(elements.length, maxResults); i++) {
                const element = elements[i];
                
                try {
                    // Try multiple strategies to extract name
                    let firstName = '';
                    let lastName = '';
                    let fullName = '';
                    
                    // Strategy 1: Look for specific name elements
                    const nameElement = element.querySelector('.org-people-profile-card__profile-title a') ||
                                      element.querySelector('[data-test-id="people-search-result-name"]') ||
                                      element.querySelector('.people-search-card__name') ||
                                      element.querySelector('.entity-result__title-text a') ||
                                      element.querySelector('.actor-name');
                    
                    if (nameElement) {
                        fullName = nameElement.textContent.trim();
                    }
                    
                    // Strategy 2: Look for aria-label with name
                    if (!fullName) {
                        const ariaElement = element.querySelector('[aria-label*="View"]:first-child') ||
                                          element.querySelector('a[aria-label]');
                        if (ariaElement) {
                            const ariaLabel = ariaElement.getAttribute('aria-label');
                            const nameMatch = ariaLabel.match(/View (.+?)'s profile/);
                            if (nameMatch) {
                                fullName = nameMatch[1];
                            }
                        }
                    }
                    
                    // Parse first and last name
                    if (fullName) {
                        const nameParts = fullName.split(' ');
                        firstName = nameParts[0] || '';
                        lastName = nameParts.slice(1).join(' ') || '';
                    }
                    
                    // Extract company name
                    let company = '';
                    const companyElement = element.querySelector('.org-people-profile-card__summary-title') ||
                                         element.querySelector('[data-test-id="people-search-result-company"]') ||
                                         element.querySelector('.people-search-card__occupation') ||
                                         element.querySelector('.entity-result__primary-subtitle') ||
                                         element.querySelector('.subline-level-1');
                    
                    if (companyElement) {
                        company = companyElement.textContent.trim();
                    }
                    
                    // Extract job title
                    let jobTitle = '';
                    const jobElement = element.querySelector('.org-people-profile-card__summary-subtitle') ||
                                     element.querySelector('[data-test-id="people-search-result-title"]') ||
                                     element.querySelector('.people-search-card__occupation') ||
                                     element.querySelector('.entity-result__secondary-subtitle') ||
                                     element.querySelector('.subline-level-2');
                    
                    if (jobElement) {
                        jobTitle = jobElement.textContent.trim();
                    }
                    
                    // If company and jobTitle are the same, try to separate them
                    if (company === jobTitle && company.includes(' at ')) {
                        const parts = company.split(' at ');
                        jobTitle = parts[0];
                        company = parts[1];
                    }
                    
                    // Clean up extracted data
                    company = company.replace(/^at\s+/i, '').trim();
                    
                    // Only add if we have at least a name
                    if (firstName || lastName) {
                        results.push({
                            firstName: firstName,
                            lastName: lastName,
                            company: company,
                            jobTitle: jobTitle
                        });
                    }
                    
                } catch (error) {
                    console.error(`Error processing alumni ${i}:`, error);
                }
            }
            
            return results;
        }, maxResults);
        
        console.log(`✅ Successfully scraped ${alumni.length} alumni profiles`);
        
        return {
            success: true,
            alumni: alumni,
            totalFound: alumni.length,
            university: universitySlug,
            keywords: keywords
        };
        
    } catch (error) {
        console.error('❌ LinkedIn scraping error:', error);
        return {
            success: false,
            error: `Scraping failed: ${error.message}`,
            alumni: []
        };
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

module.exports = {
    scrapeLinkedInAlumni
};