const express = require('express');
const router = express.Router();
const { processNewRows } = require('../monitorRelevantTweets');
const { startMonitoring, stopMonitoring, getMonitoringStatus, getMonitoringStatusSync } = require('../monitorManager');
const { google } = require('googleapis');
const cron = require('node-cron');

let isWebMonitoring = false;
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
        const standaloneMonitoring = getMonitoringStatusSync();
        
        if (standaloneMonitoring) {
            return res.json({ 
                success: false, 
                message: 'Monitoring is already running. Stop it first before starting again.' 
            });
        }

        console.log('🚀 Starting monitoring with sleep prevention...');
        
        // Use the new monitoring manager to start with caffeinate
        const result = await startMonitoring();
        
        if (result.success) {
            res.json({ 
                success: true, 
                message: 'Monitoring started successfully with sleep prevention. Running every 5 minutes.' 
            });
        } else {
            res.json({ 
                success: false, 
                message: result.message || 'Failed to start monitoring' 
            });
        }
        
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
        const standaloneMonitoring = getMonitoringStatusSync();
        
        if (!standaloneMonitoring) {
            return res.json({ 
                success: false, 
                message: 'Monitoring is not running' 
            });
        }

        console.log('🛑 Stopping monitoring...');
        
        // Use the new monitoring manager to stop
        const result = await stopMonitoring();
        
        if (result.success) {
            res.json({ 
                success: true, 
                message: 'Monitoring stopped successfully' 
            });
        } else {
            res.json({ 
                success: false, 
                message: result.message || 'Failed to stop monitoring' 
            });
        }
        
    } catch (error) {
        console.error('❌ Error stopping monitoring:', error);
        res.json({ 
            success: false, 
            message: 'Failed to stop monitoring: ' + error.message 
        });
    }
});

// Get monitoring status
router.get('/status', async (req, res) => {
    try {
        const statusResult = await getMonitoringStatus();
        
        res.json({
            success: true,
            isMonitoring: statusResult.isMonitoring,
            message: statusResult.message
        });
    } catch (error) {
        res.json({
            success: true,
            isMonitoring: false,
            message: 'Monitoring is not running'
        });
    }
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