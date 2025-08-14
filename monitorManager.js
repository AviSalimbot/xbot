const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT_DIR = __dirname;
const IS_WINDOWS = os.platform() === 'win32';

// Choose the correct script based on operating system
const START_SCRIPT = IS_WINDOWS 
    ? path.join(SCRIPT_DIR, 'start-monitoring.ps1')
    : path.join(SCRIPT_DIR, 'start-monitoring.sh');

// Topic-specific file naming
function getTopicFiles(topic) {
  return {
    PID_FILE: path.join(SCRIPT_DIR, `.${topic}_monitor.pid`),
    LOCK_FILE: path.join(SCRIPT_DIR, `.${topic}_monitor.lock`),
    LOG_FILE: path.join(SCRIPT_DIR, `${topic}_monitor.log`)
  };
}

// Get topic from environment or default
const TOPIC = process.env.TOPIC || 'ethereum';
const FILES = getTopicFiles(TOPIC);
const PID_FILE = FILES.PID_FILE;
const LOCK_FILE = FILES.LOCK_FILE;

// Log which script will be used
console.log(`🔧 Platform detected: ${os.platform()}`);
console.log(`📜 Using monitoring script: ${START_SCRIPT}`);

function executeScript(command, topic = TOPIC) {
    return new Promise((resolve, reject) => {
        // Use the appropriate command based on OS with topic parameter
        const execCommand = IS_WINDOWS 
            ? `powershell -ExecutionPolicy Bypass -File "${START_SCRIPT}" ${command} ${topic}`
            : `"${START_SCRIPT}" ${command} ${topic}`;
            
        console.log(`🚀 Executing: ${execCommand}`);
            
        exec(execCommand, { env: { ...process.env, TOPIC: topic } }, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Script execution failed:`, error);
                reject({ success: false, message: `Error: ${error.message}`, output: stderr });
            } else {
                console.log(`✅ Script executed successfully:`, stdout.trim());
                resolve({ success: true, message: stdout.trim(), output: stdout });
            }
        });
    });
}

async function startMonitoring() {
    try {
        const result = await executeScript('start');
        return result;
    } catch (error) {
        return error;
    }
}

async function stopMonitoring() {
    try {
        const result = await executeScript('stop');
        return result;
    } catch (error) {
        return error;
    }
}

async function getMonitoringStatus() {
    try {
        // Use the sync function instead of calling external script for status
        const isMonitoring = getMonitoringStatusSync();
        const message = isMonitoring 
            ? 'Monitoring is running' 
            : 'Monitoring is not running';
            
        return {
            success: true,
            isMonitoring,
            message
        };
    } catch (error) {
        return {
            success: true,
            isMonitoring: false,
            message: 'Monitoring is not running'
        };
    }
}

function getMonitoringStatusSync() {
    // Check if PID file exists and process is running
    if (!fs.existsSync(PID_FILE)) {
        console.log('❌ PID file not found:', PID_FILE);
        return false;
    }
    
    try {
        const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10);
        console.log('🔍 Checking process with PID:', pid);
        
        // Check if process is running
        process.kill(pid, 0);
        console.log('✅ Process is running');
        return true;
    } catch (e) {
        console.log('❌ Process not running or error:', e.message);
        // Process not running, remove stale files
        if (fs.existsSync(PID_FILE)) {
            console.log('🧹 Removing stale PID file');
            fs.unlinkSync(PID_FILE);
        }
        if (fs.existsSync(LOCK_FILE)) {
            console.log('🧹 Removing stale LOCK file');
            fs.unlinkSync(LOCK_FILE);
        }
        return false;
    }
}

module.exports = {
    startMonitoring,
    stopMonitoring,
    getMonitoringStatus,
    getMonitoringStatusSync
};