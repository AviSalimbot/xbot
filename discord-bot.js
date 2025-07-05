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

        // Check if monitorRelevantTweets.js exists
        const scriptPath = path.join(process.cwd(), 'monitorRelevantTweets.js');
        if (!fs.existsSync(scriptPath)) {
            await message.reply(`❌ Script not found: monitorRelevantTweets.js\nPlease ensure the script exists in the project directory.`);
            return;
        }

        await message.reply(`🚀 Starting monitoring...`);

        // Start the monitoring process with Node.js
        const monitoringProcess = spawn('node', ['monitorRelevantTweets.js'], {
            cwd: process.cwd(),
            stdio: ['ignore', 'pipe', 'pipe']
        });

        // Store the process
        runningProcesses.set('monitoring', {
            process: monitoringProcess,
            startTime: new Date(),
            channel: message.channel
        });

        // Handle process output
        monitoringProcess.stdout.on('data', (data) => {
            const output = data.toString().trim();
            console.log(`Monitoring output: ${output}`);
            // Optionally send important output to Discord channel
            // message.channel.send(`📊 ${output}`);
        });

        monitoringProcess.stderr.on('data', (data) => {
            const error = data.toString().trim();
            console.error(`Monitoring error: ${error}`);
            // Optionally send errors to Discord channel
            // message.channel.send(`❌ Error: ${error}`);
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
        
        if (!monitoring) {
            await message.reply(`ℹ️ No monitoring process is currently running.`);
            return;
        }

        await message.reply(`🛑 Stopping monitoring...`);

        // Kill the monitoring process
        try {
            // Try graceful termination first
            monitoring.process.kill('SIGTERM');
            
            // Force kill after 5 seconds if still running
            setTimeout(() => {
                if (!monitoring.process.killed) {
                    monitoring.process.kill('SIGKILL');
                }
            }, 5000);
            
        } catch (killError) {
            console.error('Error killing process:', killError);
        }

        // Remove from running processes
        runningProcesses.delete('monitoring');
        
        await message.channel.send(`✅ Monitoring stopped successfully.`);

    } catch (error) {
        console.error('Error stopping monitoring:', error);
        await message.reply(`❌ Error stopping monitoring: ${error.message}`);
    }
}

async function handleMonitoringStatus(message) {
    try {
        const monitoring = runningProcesses.get('monitoring');
        
        if (!monitoring) {
            await message.reply(`📊 **Monitoring Status:** Not running\n\nUse \`start monitoring\` to begin monitoring.`);
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
**Script:** monitorRelevantTweets.js

Use \`stop monitoring\` to stop the process.`);

    } catch (error) {
        console.error('Error getting monitoring status:', error);
        await message.reply(`❌ Error getting monitoring status: ${error.message}`);
    }
}

async function handleHelp(message) {
    const helpText = `🤖 **XBot Monitoring Commands**

\`start monitoring\` - Start monitoring with monitorRelevantTweets.js
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
        try {
            monitoring.process.kill('SIGTERM');
        } catch (error) {
            console.error(`Error stopping ${name}:`, error.message);
        }
    }
    
    client.destroy();
    process.exit(0);
});