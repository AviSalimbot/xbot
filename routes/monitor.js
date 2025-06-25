const express = require('express');
const router = express.Router();
const { processNewRows, getMonitoringStatus } = require('../monitorRelevantTweets');
const { google } = require('googleapis');
const cron = require('node-cron');

let isMonitoring = false;
let cronJob = null;

// Get relevant tweets from the target spreadsheet
router.get('/', async (req, res) => {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || 'service-account-key.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const client = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: client });
        
        const targetSpreadsheetId = process.env.GOOGLE_TARGET_SPREADSHEET_ID;
        const relevantSheet = 'Sheet1';
        
        // Get all relevant tweets
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: targetSpreadsheetId,
            range: `${relevantSheet}!A:E`
        });
        
        const rows = response.data.values || [];
        if (rows.length <= 1) {
            return res.json({
                success: true,
                message: 'No relevant tweets found',
                tweets: []
            });
        }
        
        // Convert rows to tweet format (skip header row)
        const tweets = rows.slice(1).map(row => {
            const [createdAt, handle, tweetText, tweetLink, followerCount] = row;
            return {
                text: tweetText || '',
                url: tweetLink || '',
                replies: 0, // These aren't stored in our sheet
                reposts: 0,
                likes: 0,
                handle: handle || '',
                createdAt: createdAt || '',
                followerCount: parseInt(followerCount) || 0
            };
        }).reverse(); // Show newest first
        
        res.json({
            success: true,
            message: `Found ${tweets.length} relevant tweets`,
            tweets: tweets
        });
        
    } catch (error) {
        console.error('Error fetching relevant tweets:', error);
        res.json({
            success: false,
            message: 'Failed to fetch relevant tweets: ' + error.message,
            tweets: []
        });
    }
});

// Start monitoring
router.post('/start', async (req, res) => {
    try {
        const standaloneMonitoring = getMonitoringStatus();
        
        if (isMonitoring) {
            return res.json({ 
                success: false, 
                message: 'Web interface monitoring is already running' 
            });
        }
        
        if (standaloneMonitoring) {
            return res.json({ 
                success: false, 
                message: 'Monitoring is already active via standalone script. Stop the script first or use "Process Now" for manual processing.' 
            });
        }

        console.log('🚀 Starting monitoring from web interface...');
        
        // Start the cron job to run every 2 minutes
        cronJob = cron.schedule('*/2 * * * *', async () => {
            try {
                console.log('🔄 Running scheduled tweet processing...');
                await processNewRows();
            } catch (error) {
                console.error('❌ Error in scheduled processing:', error);
            }
        }, {
            scheduled: false // Don't start immediately
        });
        
        cronJob.start();
        isMonitoring = true;
        
        // Run initial processing
        console.log('🔄 Running initial tweet processing...');
        await processNewRows();
        
        res.json({ 
            success: true, 
            message: 'Relevant tweets monitoring started successfully. Processing every 2 minutes.' 
        });
        
    } catch (error) {
        console.error('❌ Error starting monitoring:', error);
        res.json({ 
            success: false, 
            message: 'Failed to start monitoring: ' + error.message 
        });
    }
});

// Stop monitoring
router.post('/stop', async (req, res) => {
    try {
        if (!isMonitoring) {
            return res.json({ 
                success: false, 
                message: 'Monitoring is not running' 
            });
        }

        console.log('🛑 Stopping monitoring from web interface...');
        
        if (cronJob) {
            cronJob.stop();
            cronJob.destroy();
            cronJob = null;
        }
        
        isMonitoring = false;
        
        res.json({ 
            success: true, 
            message: 'Relevant tweets monitoring stopped successfully' 
        });
        
    } catch (error) {
        console.error('❌ Error stopping monitoring:', error);
        res.json({ 
            success: false, 
            message: 'Failed to stop monitoring: ' + error.message 
        });
    }
});

// Get monitoring status
router.get('/status', (req, res) => {
    // Check both web interface monitoring and standalone monitoring
    const webMonitoring = isMonitoring;
    const standaloneMonitoring = getMonitoringStatus();
    const anyMonitoring = webMonitoring || standaloneMonitoring;
    
    let message;
    if (standaloneMonitoring) {
        message = 'Monitoring is active (standalone script)';
    } else if (webMonitoring) {
        message = 'Monitoring is active (web interface)';
    } else {
        message = 'Monitoring is not running';
    }
    
    res.json({
        success: true,
        isMonitoring: anyMonitoring,
        webMonitoring: webMonitoring,
        standaloneMonitoring: standaloneMonitoring,
        message: message
    });
});

// Manual trigger to process new rows
router.post('/process', async (req, res) => {
    try {
        console.log('🔄 Manual processing triggered from web interface...');
        
        await processNewRows();
        
        res.json({ 
            success: true, 
            message: 'Manual processing completed' 
        });
        
    } catch (error) {
        console.error('❌ Error in manual processing:', error);
        res.json({ 
            success: false, 
            message: 'Failed to process: ' + error.message 
        });
    }
});

module.exports = router; 