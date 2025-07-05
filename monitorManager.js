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

const PID_FILE = path.join(SCRIPT_DIR, '.monitor.pid');
const LOCK_FILE = path.join(SCRIPT_DIR, '.monitor.lock');

// Log which script will be used
console.log(`🔧 Platform detected: ${os.platform()}`);
console.log(`📜 Using monitoring script: ${START_SCRIPT}`);

function executeScript(command) {
    return new Promise((resolve, reject) => {
        // Use the appropriate command based on OS
        const execCommand = IS_WINDOWS 
            ? `powershell -ExecutionPolicy Bypass -File "${START_SCRIPT}" ${command}`
            : `"${START_SCRIPT}" ${command}`;
            
        console.log(`🚀 Executing: ${execCommand}`);
            
        exec(execCommand, (error, stdout, stderr) => {
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
        const result = await executeScript('status');
        // Parse the output to determine if monitoring is running
        let isMonitoring = false;
        if (result && result.message) {
            // Check for the phrase 'Monitoring is running' in the output
            if (result.message.includes('Monitoring is running')) {
                isMonitoring = true;
            }
        }
        return {
            success: true,
            isMonitoring,
            message: result.message
        };
    } catch (error) {
        return {
            success: true,
            isMonitoring: false,
            message: error.message || 'Monitoring is not running'
        };
    }
}

function getMonitoringStatusSync() {
    // Check if PID file exists and process is running
    if (!fs.existsSync(PID_FILE)) return false;
    
    try {
        const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10);
        // Check if process is running
        process.kill(pid, 0);
        return true;
    } catch (e) {
        // Process not running, remove stale files
        if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
        if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
        return false;
    }
}

module.exports = {
    startMonitoring,
    stopMonitoring,
    getMonitoringStatus,
    getMonitoringStatusSync
};