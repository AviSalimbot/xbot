const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT_DIR = path.resolve(__dirname);
const IS_WINDOWS = os.platform() === 'win32';

// Topic-specific file naming for automatic reply
function getTopicFiles(topic) {
  return {
    PID_FILE: path.join(SCRIPT_DIR, `.${topic}_reply.pid`),
    LOCK_FILE: path.join(SCRIPT_DIR, `.${topic}_reply.lock`),
    LOG_FILE: path.join(SCRIPT_DIR, `${topic}_reply.log`)
  };
}

// Execute Node.js script with topic parameter
function executeAutoReplyScript(command, topic) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(SCRIPT_DIR, 'automaticReply.js');
        const files = getTopicFiles(topic);
        const LOG_FILE = files.LOG_FILE;
        
        let execCommand;
        
        if (command === 'start') {
            // For start command, use nohup to keep process running in background
            execCommand = IS_WINDOWS 
                ? `start /B node "${scriptPath}" ${command}` 
                : `nohup node "${scriptPath}" ${command} > "${LOG_FILE}" 2>&1 &`;
        } else {
            // For stop and process commands, run normally
            execCommand = `node "${scriptPath}" ${command}`;
        }
        
        console.log(`🚀 Executing automatic reply: ${execCommand}`);
        console.log(`📋 Topic: ${topic}`);
            
        exec(execCommand, { 
            env: { ...process.env, TOPIC: topic },
            timeout: command === 'start' ? 5000 : 30000 // Shorter timeout for start since it runs in background
        }, (error, stdout, stderr) => {
            if (error && command !== 'start') {
                // For start command, timeout is expected since process runs in background
                console.error(`❌ Automatic reply execution failed:`, error);
                reject({ success: false, message: `Error: ${error.message}`, output: stderr });
            } else {
                const message = command === 'start' 
                    ? `Automatic reply started in background for ${topic}` 
                    : stdout.trim();
                console.log(`✅ Automatic reply executed: ${message}`);
                resolve({ success: true, message, output: stdout });
            }
        });
    });
}

async function startAutomaticReply(topic) {
    try {
        // Check if already running
        const status = getAutoReplyStatusSync(topic);
        if (status) {
            return {
                success: false,
                message: `Automatic reply is already running for ${topic}`
            };
        }
        
        const result = await executeAutoReplyScript('start', topic);
        
        // Wait a moment for the background process to create PID file
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        return result;
    } catch (error) {
        return error;
    }
}

async function stopAutomaticReply(topic) {
    try {
        // First kill the process if it's running
        const files = getTopicFiles(topic);
        const PID_FILE = files.PID_FILE;
        
        if (fs.existsSync(PID_FILE)) {
            try {
                const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10);
                console.log(`🔫 Killing automatic reply process ${pid}`);
                process.kill(pid, 'SIGTERM'); // Use SIGTERM for graceful shutdown
                
                // Wait a moment for graceful shutdown
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // If still running, force kill
                try {
                    process.kill(pid, 0); // Check if still running
                    console.log(`⚡ Force killing process ${pid}`);
                    process.kill(pid, 'SIGKILL');
                } catch (e) {
                    console.log(`✅ Process ${pid} terminated gracefully`);
                }
            } catch (error) {
                console.log(`⚠️ Error stopping process: ${error.message}`);
            }
        }
        
        // Clean up files after stopping
        [files.PID_FILE, files.LOCK_FILE].forEach(file => {
            if (fs.existsSync(file)) {
                try {
                    fs.unlinkSync(file);
                    console.log(`🧹 Cleaned up file: ${file}`);
                } catch (err) {
                    console.log(`⚠️ Could not clean up file ${file}:`, err.message);
                }
            }
        });
        
        return {
            success: true,
            message: `Automatic reply stopped and cleaned up for ${topic}`
        };
        
    } catch (error) {
        return {
            success: false,
            message: `Error stopping automatic reply: ${error.message}`
        };
    }
}

async function processOnceAutomaticReply(topic) {
    try {
        // Check if already running to prevent conflicts
        const status = getAutoReplyStatusSync(topic);
        if (status) {
            return {
                success: false,
                message: `Automatic reply is already running for ${topic}. Stop it first before manual processing.`
            };
        }
        
        const result = await executeAutoReplyScript('process', topic);
        return result;
    } catch (error) {
        return error;
    }
}

async function getAutoReplyStatus(topic) {
    try {
        const isRunning = getAutoReplyStatusSync(topic);
        const message = isRunning 
            ? `Automatic reply is running for ${topic}` 
            : `Automatic reply is not running for ${topic}`;
            
        return {
            success: true,
            isRunning,
            message,
            topic
        };
    } catch (error) {
        return {
            success: true,
            isRunning: false,
            message: `Automatic reply is not running for ${topic}`,
            topic
        };
    }
}

function getAutoReplyStatusSync(topic) {
    const files = getTopicFiles(topic);
    const PID_FILE = files.PID_FILE;
    
    // Check if PID file exists and process is running
    console.log('🔍 Status check - Current working directory:', process.cwd());
    console.log('🔍 Status check - SCRIPT_DIR:', SCRIPT_DIR);
    console.log('🔍 Status check - Looking for PID file at:', PID_FILE);
    console.log('🔍 Status check - File exists:', fs.existsSync(PID_FILE));
    
    if (!fs.existsSync(PID_FILE)) {
        console.log('❌ Auto reply PID file not found:', PID_FILE);
        return false;
    }
    
    try {
        const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10);
        console.log('🔍 Checking auto reply process with PID:', pid);
        
        // Check if process is running
        process.kill(pid, 0);
        console.log('✅ Auto reply process is running');
        return true;
    } catch (e) {
        console.log('❌ Auto reply process not running or error:', e.message);
        
        // Process not running, remove stale files
        const files = getTopicFiles(topic);
        [files.PID_FILE, files.LOCK_FILE].forEach(file => {
            if (fs.existsSync(file)) {
                console.log(`🧹 Removing stale auto reply file: ${file}`);
                try {
                    fs.unlinkSync(file);
                } catch (cleanupError) {
                    console.log(`⚠️ Could not remove stale file ${file}:`, cleanupError.message);
                }
            }
        });
        
        return false;
    }
}

/**
 * Read log file for a specific topic
 * @param {string} topic - Topic name
 * @param {number} lines - Number of lines to read from end of file
 * @returns {Array} Array of log entries
 */
function readAutoReplyLogs(topic, lines = 50) {
    const files = getTopicFiles(topic);
    const LOG_FILE = files.LOG_FILE;
    
    try {
        if (!fs.existsSync(LOG_FILE)) {
            return [];
        }
        
        const logContent = fs.readFileSync(LOG_FILE, 'utf8');
        const logLines = logContent.split('\n').filter(line => line.trim().length > 0);
        
        // Return last 'lines' entries
        const recentLines = logLines.slice(-lines);
        
        return recentLines.map(line => {
            // Parse log line for type classification
            let type = '';
            if (line.includes('✅') || line.includes('Successfully Posted Reply')) {
                type = 'success';
            } else if (line.includes('❌') || line.includes('Error') || line.includes('Failed')) {
                type = 'error';
            }
            
            return {
                message: line,
                type,
                timestamp: new Date().toISOString() // Could parse actual timestamp if logs include it
            };
        });
        
    } catch (error) {
        console.error('Error reading auto reply logs:', error);
        return [];
    }
}

module.exports = {
    startAutomaticReply,
    stopAutomaticReply,
    processOnceAutomaticReply,
    getAutoReplyStatus,
    getAutoReplyStatusSync,
    readAutoReplyLogs
};