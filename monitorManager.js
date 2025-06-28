const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const START_SCRIPT = path.join(SCRIPT_DIR, 'start-monitoring.sh');
const PID_FILE = path.join(SCRIPT_DIR, '.monitor.pid');
const LOCK_FILE = path.join(SCRIPT_DIR, '.monitor.lock');

function executeScript(command) {
    return new Promise((resolve, reject) => {
        exec(`"${START_SCRIPT}" ${command}`, (error, stdout, stderr) => {
            if (error) {
                reject({ success: false, message: `Error: ${error.message}`, output: stderr });
            } else {
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
        return {
            success: true,
            isMonitoring: true,
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