const express = require('express');
const router = express.Router();
const { 
    startAutomaticReply, 
    stopAutomaticReply, 
    processOnceAutomaticReply,
    getAutoReplyStatus,
    readAutoReplyLogs
} = require('../autoReplyManager');
const fs = require('fs');
const path = require('path');

// GET /auto-reply/status - Get automatic reply status
router.get('/status', async (req, res) => {
    try {
        // Topic is already validated by middleware and available in req.topic
        const topic = req.topic;
        
        console.log(`🔍 Auto-reply status check - Topic from middleware: ${topic}`);
        console.log(`🔍 Session topic: ${req.session?.topic}`);
        console.log(`🔍 Process env topic: ${process.env.TOPIC}`);
        console.log(`🔍 Request headers:`, req.headers);
        
        const status = await getAutoReplyStatus(topic);
        console.log(`🔍 Auto-reply status result:`, status);
        res.json(status);
        
    } catch (error) {
        console.error('Error getting auto reply status:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting automatic reply status: ' + error.message,
            isRunning: false
        });
    }
});

// POST /auto-reply/start - Start automatic reply
router.post('/start', async (req, res) => {
    try {
        // Topic is already validated by middleware
        const topic = req.topic;
        
        console.log(`Starting automatic reply for topic: ${topic}`);
        const result = await startAutomaticReply(topic);
        
        if (result.success) {
            console.log(`✅ Automatic reply started for ${topic}`);
        } else {
            console.log(`❌ Failed to start automatic reply for ${topic}: ${result.message}`);
        }
        
        res.json(result);
        
    } catch (error) {
        console.error('Error starting automatic reply:', error);
        res.status(500).json({
            success: false,
            message: 'Error starting automatic reply: ' + error.message
        });
    }
});

// POST /auto-reply/stop - Stop automatic reply
router.post('/stop', async (req, res) => {
    try {
        // Topic is already validated by middleware
        const topic = req.topic;
        
        console.log(`Stopping automatic reply for topic: ${topic}`);
        const result = await stopAutomaticReply(topic);
        
        if (result.success) {
            console.log(`✅ Automatic reply stopped for ${topic}`);
        } else {
            console.log(`❌ Failed to stop automatic reply for ${topic}: ${result.message}`);
        }
        
        res.json(result);
        
    } catch (error) {
        console.error('Error stopping automatic reply:', error);
        res.status(500).json({
            success: false,
            message: 'Error stopping automatic reply: ' + error.message
        });
    }
});

// POST /auto-reply/process - Process tweets once
router.post('/process', async (req, res) => {
    try {
        // Topic is already validated by middleware
        const topic = req.topic;
        
        console.log(`Processing automatic replies once for topic: ${topic}`);
        const result = await processOnceAutomaticReply(topic);
        
        if (result.success) {
            console.log(`✅ Automatic reply processing completed for ${topic}`);
        } else {
            console.log(`❌ Failed to process automatic replies for ${topic}: ${result.message}`);
        }
        
        res.json(result);
        
    } catch (error) {
        console.error('Error processing automatic replies:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing automatic replies: ' + error.message
        });
    }
});

// GET /auto-reply/logs - Get automatic reply logs
router.get('/logs', async (req, res) => {
    try {
        // Topic is already validated by middleware
        const topic = req.topic;
        const lines = parseInt(req.query.lines) || 50;
        
        const logs = readAutoReplyLogs(topic, lines);
        
        res.json({
            success: true,
            logs: logs,
            topic: topic,
            message: `Retrieved ${logs.length} log entries for ${topic}`
        });
        
    } catch (error) {
        console.error('Error getting automatic reply logs:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting automatic reply logs: ' + error.message,
            logs: []
        });
    }
});

module.exports = router;