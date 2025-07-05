require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Store running processes
const runningProcesses = new Map();

// When the client is ready, run this code (only once)
client.once('ready', () => {
    console.log(`🤖 Discord bot is ready! Logged in as ${client.user.tag}`);
    console.log(`🔗 Bot is online and listening for commands`);
});

// Listen for messages
client.on('messageCreate', async (message) => {
    // Don't respond to bots
    if (message.author.bot) return;

    const content = message.content.toLowerCase().trim();
    
    // Check for start monitoring command
    if (content === 'start monitoring') {
        await handleStartMonitoring(message);
        return;
    }

    // Check for stop monitoring command
    if (content === 'stop monitoring') {
        await handleStopMonitoring(message);
        return;
    }

    // Check for status command
    if (content === 'monitoring status' || content === 'status') {
        await handleMonitoringStatus(message);
        return;
    }

    // Show help for monitoring commands
    if (content === 'help monitoring' || content === 'monitoring help') {
        await handleHelp(message);
        return;
    }
});

async function handleStartMonitoring(message) {
    try {
        // Check if monitoring is already running
        if (runningProcesses.has('monitoring')) {
            await message.reply(`⚠️ Monitoring is already running! Use \`stop monitoring\` first.`);
            return;
        }

        await message.reply(`🚀 Starting monitoring...`);

        // Determine which script to run based on platform
        const isWindows = process.platform === 'win32';
        const scriptName = isWindows ? 'start-monitoring.ps1' : './start-monitoring.sh';
        const scriptPath = path.join(process.cwd(), scriptName);

        // Check if script exists
        if (!fs.existsSync(scriptPath)) {
            await message.reply(`❌ Script not found: ${scriptName}\nPlease ensure the script exists in the project directory.`);
            return;
        }

        // Start the monitoring process
        let monitoringProcess;
        
        if (isWindows) {
            // Windows PowerShell
            monitoringProcess = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
                cwd: process.cwd(),
                stdio: ['ignore', 'pipe', 'pipe']
            });
        } else {
            // Unix/Linux/macOS bash
            monitoringProcess = spawn('./start-monitoring.sh', [], {
                cwd: process.cwd(),
                stdio: ['ignore', 'pipe', 'pipe']
            });
        }

        // Store the process
        runningProcesses.set('monitoring', {
            process: monitoringProcess,
            startTime: new Date(),
            channel: message.channel
        });

        // Handle process output
        monitoringProcess.stdout.on('data', (data) => {
            console.log(`Monitoring output: ${data.toString().trim()}`);
        });

        monitoringProcess.stderr.on('data', (data) => {
            console.error(`Monitoring error: ${data.toString().trim()}`);
        });

        // Handle process exit
        monitoringProcess.on('close', (code) => {
            console.log(`Monitoring process exited with code ${code}`);
            runningProcesses.delete('monitoring');
            
            if (code === 0) {
                message.channel.send(`✅ Monitoring completed successfully.`);
            } else {
                message.channel.send(`❌ Monitoring stopped with exit code ${code}.`);
            }
        });

        monitoringProcess.on('error', (error) => {
            console.error(`Failed to start monitoring: ${error.message}`);
            runningProcesses.delete('monitoring');
            message.channel.send(`❌ Failed to start monitoring: ${error.message}`);
        });

        await message.channel.send(`✅ Monitoring started successfully!\n🔍 Use \`monitoring status\` to check progress.`);

    } catch (error) {
        console.error('Error starting monitoring:', error);
        await message.reply(`❌ Error starting monitoring: ${error.message}`);
    }
}

async function handleStopMonitoring(message) {
    try {
        const monitoring = runningProcesses.get('monitoring');
        
        // Check for actual running monitoring processes even if not in our Map
        const { exec } = require('child_process');
        const checkProcess = () => new Promise((resolve) => {
            exec('pgrep -f "monitorRelevantTweets.js"', (error, stdout) => {
                resolve(stdout.trim() !== '');
            });
        });
        
        const hasRunningProcess = await checkProcess();
        
        if (!monitoring && !hasRunningProcess) {
            await message.reply(`ℹ️ No monitoring process is currently running.`);
            return;
        }

        await message.reply(`🛑 Stopping monitoring...`);

        // Kill the tracked process if it exists
        if (monitoring) {
            monitoring.process.kill('SIGTERM');
        }
        
        // Also run the stop script to ensure all processes are killed
        const stopProcess = spawn('./stop-monitoring.sh', [], {
            cwd: process.cwd(),
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        stopProcess.on('close', async (code) => {
            runningProcesses.delete('monitoring');
            if (code === 0) {
                await message.channel.send(`✅ Monitoring stopped successfully.`);
            } else {
                await message.channel.send(`⚠️ Stop script exited with code ${code}, but monitoring should be stopped.`);
            }
        });
        
        // Force kill any remaining processes after 10 seconds
        setTimeout(async () => {
            exec('pkill -9 -f "monitorRelevantTweets.js"', () => {
                // Process killed, no need to report unless there was an issue
            });
        }, 10000);

    } catch (error) {
        console.error('Error stopping monitoring:', error);
        await message.reply(`❌ Error stopping monitoring: ${error.message}`);
    }
}

async function handleMonitoringStatus(message) {
    try {
        const monitoring = runningProcesses.get('monitoring');
        
        if (!monitoring) {
            await message.reply(`📊 **Monitoring Status:** Not running\n\nUse \`start monitoring <topic>\` to begin monitoring.`);
            return;
        }

        const uptime = new Date() - monitoring.startTime;
        const hours = Math.floor(uptime / (1000 * 60 * 60));
        const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((uptime % (1000 * 60)) / 1000);

        await message.reply(`📊 **Monitoring Status:** Running ✅
**Started:** ${monitoring.startTime.toLocaleString()}
**Uptime:** ${hours}h ${minutes}m ${seconds}s
**Process ID:** ${monitoring.process.pid}

Use \`stop monitoring\` to stop the process.`);

    } catch (error) {
        console.error('Error getting monitoring status:', error);
        await message.reply(`❌ Error getting monitoring status: ${error.message}`);
    }
}

async function handleHelp(message) {
    const helpText = `🤖 **XBot Monitoring Commands**

\`start monitoring\` - Start monitoring
\`stop monitoring\` - Stop the current monitoring process
\`monitoring status\` or \`status\` - Check monitoring status
\`help monitoring\` - Show this help message

**Examples:**
• \`start monitoring\`
• \`stop monitoring\`
• \`status\``;

    await message.reply(helpText);
}

// Login to Discord with your client's token
const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
    console.error('❌ DISCORD_BOT_TOKEN not found in environment variables!');
    console.log('Please add your Discord bot token to the .env file:');
    console.log('DISCORD_BOT_TOKEN=your_discord_bot_token_here');
    process.exit(1);
}

client.login(token).catch(error => {
    console.error('❌ Failed to login to Discord:', error.message);
    console.log('Please check your DISCORD_BOT_TOKEN in the .env file');
    process.exit(1);
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down Discord bot...');
    
    // Kill all running monitoring processes
    for (const [name, monitoring] of runningProcesses) {
        console.log(`Stopping ${name} process...`);
        monitoring.process.kill('SIGTERM');
    }
    
    client.destroy();
    process.exit(0);
});