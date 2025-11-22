require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { connectCommandPrompt } = require('./prompts/connect-command');

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Store running processes and channel topics
const runningProcesses = new Map(); // "channelId_topic" -> process info
const channelTopics = new Map(); // channelId -> topic
const channelFollowerCounts = new Map(); // channelId -> follower count override
const runningSuggestPosts = new Set(); // Track running suggest post commands
const runningAutoReplies = new Map(); // "channelId_topic" -> auto reply process info
const runningMonitors = new Map(); // "channelId_topic" -> monitor process info

// Function to get topic for a channel (channel name fallback)
function getChannelTopic(channelId, channel) {
    // First check if topic is explicitly set
    const explicitTopic = channelTopics.get(channelId);
    if (explicitTopic) {
        return explicitTopic;
    }
    
    // Fallback to channel name as topic, but validate it exists in config
    if (channel && channel.name) {
        const channelTopic = channel.name.toLowerCase();
        
        // Validate topic exists in config
        try {
            const fs = require('fs');
            const path = require('path');
            const configPath = path.join(process.cwd(), 'config.json');
            
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (config[channelTopic]) {
                    return channelTopic;
                }
            }
        } catch (error) {
            console.error('Error validating channel topic:', error);
        }
    }
    
    return null;
}

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
    
    // Check for set commands
    if (content.startsWith('set ')) {
        await handleSetCommand(message);
        return;
    }

    // Check for get topic command
    if (content === 'get topic') {
        await handleGetTopic(message);
        return;
    }

    // Check for get follower command
    if (content === 'get follower') {
        await handleGetFollower(message);
        return;
    }

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

    // Check for topic association command
    if (content.startsWith('topic association')) {
        await handleTopicAssociation(message);
        return;
    }

    // Check for connect command
    if (content.startsWith('connect')) {
        await handleConnect(message);
        return;
    }

    // Check for suggest post command
    if (content.startsWith('suggest post')) {
        await handleSuggestPost(message);
        return;
    }

    // Check for stock search command
    if (content.startsWith('stock search')) {
        await handleStockSearch(message);
        return;
    }

    // Check for LinkedIn alumni search command
    if (content.startsWith('linkedin alumni')) {
        await handleLinkedInAlumni(message);
        return;
    }

    // Check for auto reply command
    if (content.startsWith('auto reply')) {
        await handleAutoReply(message);
        return;
    }

    // Check for monitor command
    if (content === 'monitor') {
        await handleMonitor(message);
        return;
    }

    // Check for stop monitor command
    if (content === 'stop monitor') {
        await handleStopMonitor(message);
        return;
    }

    // Check for monitor status command
    if (content === 'monitor status') {
        await handleMonitorStatus(message);
        return;
    }


});

async function handleSetCommand(message) {
    try {
        const content = message.content.trim();
        const args = content.substring(4).trim().split(' '); // Remove 'set ' prefix and split by spaces
        
        if (args.length === 0) {
            await message.reply(`❌ Usage: \`set topic <topic>\` or \`set follower [count]\`\n\nExamples:\n• \`set topic ethereum\`\n• \`set follower 5000\`\n• \`set follower\` (uses config default)`);
            return;
        }
        
        const command = args[0];
        const channelId = message.channel.id;
        
        if (command === 'topic') {
            await handleSetTopicCommand(message, args);
        } else if (command === 'follower') {
            await handleSetFollowerCommand(message, args);
        } else {
            // Legacy support: treat "set <topic>" as "set topic <topic>"
            await handleSetTopicLegacy(message, args);
        }
        
    } catch (error) {
        console.error('Error in set command:', error);
        await message.reply(`❌ Error processing set command: ${error.message}`);
    }
}

async function handleSetTopicCommand(message, args) {
    if (args.length !== 2) {
        await message.reply(`❌ Usage: \`set topic <topic>\`\n\nExample: \`set topic ethereum\``);
        return;
    }
    
    const topic = args[1];
    
    // Validate topic exists in config
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(process.cwd(), 'config.json');
    
    if (!fs.existsSync(configPath)) {
        await message.reply(`❌ Config file not found.`);
        return;
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config[topic]) {
        const availableTopics = Object.keys(config).join(', ');
        await message.reply(`❌ Invalid topic '${topic}'. Available topics: ${availableTopics}`);
        return;
    }
    
    // Set topic for this channel
    const channelId = message.channel.id;
    channelTopics.set(channelId, topic);
    
    await message.reply(`✅ Topic set to **${topic}** for this channel.`);
}

async function handleSetTopicLegacy(message, args) {
    // Legacy support for "set ethereum" -> "set topic ethereum"
    const topic = args[0];
    
    // Validate topic exists in config
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(process.cwd(), 'config.json');
    
    if (!fs.existsSync(configPath)) {
        await message.reply(`❌ Config file not found.`);
        return;
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config[topic]) {
        await message.reply(`❌ Usage: \`set topic <topic>\` or \`set follower [count]\`\n\nExamples:\n• \`set topic ethereum\`\n• \`set follower 5000\`\n• \`set follower\` (uses config default)`);
        return;
    }
    
    // Set topic for this channel
    const channelId = message.channel.id;
    channelTopics.set(channelId, topic);
    
    await message.reply(`✅ Topic set to **${topic}** for this channel.\n\n⚠️ **Note:** Please use \`set topic ${topic}\` in the future for consistency.`);
}

async function handleSetFollowerCommand(message, args) {
    const channelId = message.channel.id;
    
    if (args.length === 1) {
        // "set follower" - clear override, use config default
        channelFollowerCounts.delete(channelId);
        await message.reply(`✅ Follower count set to use **config default** for this channel.\nNext monitoring will use the follower threshold from config.json based on the topic.`);
    } else if (args.length === 2) {
        // "set follower 5000" - set specific count
        const followerCount = parseInt(args[1]);
        
        if (isNaN(followerCount) || followerCount < 0) {
            await message.reply(`❌ Invalid follower count. Please provide a positive number.\n\nExample: \`set follower 5000\``);
            return;
        }
        
        channelFollowerCounts.set(channelId, followerCount);
        await message.reply(`✅ Follower count set to **${followerCount}** for this channel.\nNext monitoring will use this follower threshold instead of config default.`);
    } else {
        await message.reply(`❌ Usage: \`set follower [count]\`\n\nExamples:\n• \`set follower 5000\` - Set specific follower count\n• \`set follower\` - Use config default`);
    }
}

async function handleGetTopic(message) {
    try {
        const channelId = message.channel.id;
        const explicitTopic = channelTopics.get(channelId);
        const topic = getChannelTopic(channelId, message.channel);
        
        if (!topic) {
            await message.reply(`❌ Could not determine topic for this channel. Either use \`set topic <topic>\` or rename the channel to a valid topic.`);
            return;
        }
        
        if (explicitTopic) {
            await message.reply(`📋 Current topic for this channel: **${topic}** (explicitly set)`);
        } else {
            await message.reply(`📋 Current topic for this channel: **${topic}** (from channel name)`);
        }
        
    } catch (error) {
        console.error('Error getting topic:', error);
        await message.reply(`❌ Error getting topic: ${error.message}`);
    }
}

async function handleGetFollower(message) {
    try {
        const channelId = message.channel.id;
        const topic = channelTopics.get(channelId);
        const followerOverride = channelFollowerCounts.get(channelId);
        
        if (!topic) {
            await message.reply(`❌ No topic set for this channel. Use \`set topic <topic>\` first.`);
            return;
        }
        
        // Get config default for comparison
        const fs = require('fs');
        const path = require('path');
        const configPath = path.join(process.cwd(), 'config.json');
        
        if (!fs.existsSync(configPath)) {
            await message.reply(`❌ Config file not found.`);
            return;
        }
        
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const topicConfig = config[topic];
        
        if (!topicConfig) {
            await message.reply(`❌ Topic '${topic}' not found in config.`);
            return;
        }
        
        let response = `📊 **Follower Threshold for this channel:**\n\n`;
        response += `**Topic:** ${topic}\n`;
        
        if (followerOverride !== undefined) {
            response += `**Current Threshold:** ${followerOverride} (override)\n`;
            response += `**Config Default:** ${topicConfig.followersThreshold}\n\n`;
            response += `ℹ️ Using override value. Use \`set follower\` to reset to config default.`;
        } else {
            response += `**Current Threshold:** ${topicConfig.followersThreshold} (config default)\n\n`;
            response += `ℹ️ Using config default. Use \`set follower <count>\` to override for this channel.`;
        }
        
        await message.reply(response);
        
    } catch (error) {
        console.error('Error getting follower threshold:', error);
        await message.reply(`❌ Error getting follower threshold: ${error.message}`);
    }
}

async function handleStartMonitoring(message) {
    try {
        const channelId = message.channel.id;
        const topic = getChannelTopic(channelId, message.channel);
        
        if (!topic) {
            await message.reply(`❌ Could not determine topic for this channel. Either use \`set topic <topic>\` or rename the channel to a valid topic.`);
            return;
        }
        
        const processKey = `${channelId}_${topic}`;
        
        // Check if monitoring is already running for this channel+topic
        if (runningProcesses.has(processKey)) {
            await message.reply(`⚠️ Monitoring for **${topic}** is already running in this channel! Use \`stop monitoring\` first.`);
            return;
        }

        await message.reply(`🚀 Starting **${topic}** monitoring for this channel...`);

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
        
        // Get follower count for this channel (override or config default)
        const followerOverride = channelFollowerCounts.get(channelId);
        const envVars = { ...process.env, TOPIC: topic };
        
        if (followerOverride !== undefined) {
            envVars.FOLLOWER_OVERRIDE = followerOverride.toString();
        }

        if (isWindows) {
            // Windows PowerShell with topic parameter
            monitoringProcess = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, 'start', topic], {
                cwd: process.cwd(),
                stdio: ['ignore', 'pipe', 'pipe'],
                env: envVars
            });
        } else {
            // Unix/Linux/macOS bash with topic parameter
            monitoringProcess = spawn('./start-monitoring.sh', ['start', topic], {
                cwd: process.cwd(),
                stdio: ['ignore', 'pipe', 'pipe'],
                env: envVars
            });
        }

        // Store the process with channel+topic key
        runningProcesses.set(processKey, {
            process: monitoringProcess,
            startTime: new Date(),
            channel: message.channel,
            topic: topic,
            channelId: channelId
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
            console.log(`Monitoring startup script exited with code ${code}`);
            
            if (code === 0) {
                // Script exited successfully - monitoring is now running in background
                // Update the stored process info to indicate background operation
                const monitoringInfo = runningProcesses.get(processKey);
                if (monitoringInfo) {
                    monitoringInfo.isBackground = true;
                    monitoringInfo.startupCompleted = true;
                }
                
            } else {
                // Script failed to start monitoring
                runningProcesses.delete(processKey);
                message.channel.send(`❌ ${topic} monitoring startup failed with exit code ${code}.`);
            }
        });

        monitoringProcess.on('error', (error) => {
            console.error(`Failed to start ${topic} monitoring: ${error.message}`);
            runningProcesses.delete(processKey);
            message.channel.send(`❌ Failed to start ${topic} monitoring: ${error.message}`);
        });

        await message.channel.send(`✅ **${topic}** monitoring started successfully for this channel!\n🔍 Use \`status\` to check progress.`);

    } catch (error) {
        console.error('Error starting monitoring:', error);
        await message.reply(`❌ Error starting monitoring: ${error.message}`);
    }
}

async function handleStopMonitoring(message) {
    try {
        const channelId = message.channel.id;
        const topic = getChannelTopic(channelId, message.channel);
        
        if (!topic) {
            await message.reply(`❌ Could not determine topic for this channel. Either use \`set topic <topic>\` or rename the channel to a valid topic.`);
            return;
        }
        
        const processKey = `${channelId}_${topic}`;
        const monitoring = runningProcesses.get(processKey);
        
        // Check for actual running monitoring processes for this specific topic
        const { exec } = require('child_process');
        const checkTopicProcess = () => new Promise((resolve) => {
            // Check for topic-specific PID file
            const fs = require('fs');
            const topicPidFile = `.${topic}_monitor.pid`;
            
            if (fs.existsSync(topicPidFile)) {
                try {
                    const pid = fs.readFileSync(topicPidFile, 'utf8').trim();
                    exec(`ps -p ${pid}`, (error, stdout) => {
                        resolve(!error && stdout.includes(pid));
                    });
                } catch (e) {
                    resolve(false);
                }
            } else {
                resolve(false);
            }
        });
        
        const hasRunningProcess = await checkTopicProcess();
        
        if (!monitoring && !hasRunningProcess) {
            await message.reply(`ℹ️ No **${topic}** monitoring process is currently running in this channel.`);
            return;
        }

        await message.reply(`🛑 Stopping **${topic}** monitoring for this channel...`);

        // Kill the tracked process if it exists
        if (monitoring) {
            monitoring.process.kill('SIGTERM');
        }
        
        const isWindows = process.platform === 'win32';
        const stopScript = isWindows ? 'stop-monitoring.ps1' : './stop-monitoring.sh';
        const stopScriptPath = path.join(process.cwd(), stopScript);

        let stopProcess;
        if (isWindows) {
            // Use PowerShell for Windows with topic parameter
            stopProcess = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', stopScriptPath, topic], {
                cwd: process.cwd(),
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env, TOPIC: topic }
            });
        } else {
            // Use Bash for Mac/Linux with topic parameter
            stopProcess = spawn('./stop-monitoring.sh', [topic], {
                cwd: process.cwd(),
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env, TOPIC: topic }
            });
        }
        
        stopProcess.on('close', async (code) => {
            runningProcesses.delete(processKey);
            if (code === 0) {
                await message.channel.send(`✅ **${topic}** monitoring stopped successfully for this channel.`);
            } else {
                await message.channel.send(`⚠️ Stop script exited with code ${code}, but **${topic}** monitoring should be stopped.`);
            }
        });
        
        // Force kill any remaining processes for this specific topic after 10 seconds
        setTimeout(async () => {
            const fs = require('fs');
            const topicPidFile = `.${topic}_monitor.pid`;
            
            if (fs.existsSync(topicPidFile)) {
                try {
                    const pid = fs.readFileSync(topicPidFile, 'utf8').trim();
                    exec(`kill -9 ${pid}`, () => {
                        // Force killed topic-specific process
                    });
                    // Clean up PID file
                    fs.unlinkSync(topicPidFile);
                } catch (e) {
                    // Ignore cleanup errors
                }
            }
        }, 10000);

    } catch (error) {
        console.error('Error stopping monitoring:', error);
        await message.reply(`❌ Error stopping monitoring: ${error.message}`);
    }
}

async function handleMonitoringStatus(message) {
    try {
        const channelId = message.channel.id;
        const topic = getChannelTopic(channelId, message.channel);
        
        if (!topic) {
            await message.reply(`❌ Could not determine topic for this channel. Either use \`set topic <topic>\` or rename the channel to a valid topic.`);
            return;
        }
        
        const processKey = `${channelId}_${topic}`;
        const monitoring = runningProcesses.get(processKey);
        
        // Check for actual running monitoring processes for this specific topic
        const { exec } = require('child_process');
        const checkTopicProcess = () => new Promise((resolve) => {
            // Check for topic-specific PID file
            const fs = require('fs');
            const topicPidFile = `.${topic}_monitor.pid`;
            
            if (fs.existsSync(topicPidFile)) {
                try {
                    const pid = fs.readFileSync(topicPidFile, 'utf8').trim();
                    exec(`ps -p ${pid}`, (error, stdout) => {
                        if (!error && stdout.includes(pid)) {
                            resolve([pid]);
                        } else {
                            // PID file exists but process is dead, clean it up
                            fs.unlinkSync(topicPidFile);
                            resolve(null);
                        }
                    });
                } catch (e) {
                    // Clean up corrupted PID file
                    try {
                        fs.unlinkSync(topicPidFile);
                    } catch (e2) {}
                    resolve(null);
                }
            } else {
                resolve(null);
            }
        });
        
        const runningPids = await checkTopicProcess();
        
        if (!monitoring && !runningPids) {
            await message.reply(`📊 **Monitoring Status:** **${topic}** not running in this channel\n\nUse \`start monitoring\` to begin monitoring.`);
            return;
        }

        if (monitoring && monitoring.isBackground) {
            // Background monitoring started via Discord bot
            const uptime = new Date() - monitoring.startTime;
            const hours = Math.floor(uptime / (1000 * 60 * 60));
            const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((uptime % (1000 * 60)) / 1000);

            let statusMessage = `📊 **Monitoring Status:** **${topic}** running in this channel ✅\n`;
            statusMessage += `**Started:** ${monitoring.startTime.toLocaleString()}\n`;
            statusMessage += `**Uptime:** ${hours}h ${minutes}m ${seconds}s\n`;
            statusMessage += `**Mode:** Background process\n`;
            
            if (runningPids) {
                statusMessage += `**Process ID(s):** ${runningPids.join(', ')}\n`;
            }
            
            statusMessage += `\nUse \`stop monitoring\` to stop **${topic}** monitoring for this channel.`;
            
            await message.reply(statusMessage);
        } else if (runningPids) {
            // Monitoring running but not started via Discord bot
            await message.reply(`📊 **Monitoring Status:** **${topic}** running ✅
**Mode:** External process
**Process ID(s):** ${runningPids.join(', ')}

Monitoring was started outside of Discord bot.
Use \`stop monitoring\` to stop **${topic}** monitoring for this channel.`);
        }

    } catch (error) {
        console.error('Error getting monitoring status:', error);
        await message.reply(`❌ Error getting monitoring status: ${error.message}`);
    }
}

async function handleTopicAssociation(message) {
    try {
        const content = message.content.trim();
        const parts = content.split(' ');
        
        if (parts.length < 4) {
            await message.reply(`❌ Usage: \`topic association "keyword" "sheetName" "range"\`\n\nExample: \`topic association "inflation" "Relevant Tweets" "1:10"\`\n\n⚠️ **Note:** This uses the channel's topic folder to find the sheet.`);
            return;
        }

        // Parse command: topic association "keyword" "sheetName" "range"
        const commandText = content.substring('topic association'.length).trim();
        const matches = commandText.match(/^"([^"]*)"(?:\s+"([^"]*)")?(?:\s+"([^"]*)")?$/);
        
        if (!matches) {
            await message.reply(`❌ Invalid format. Use: \`topic association "keyword" "sheetName" "range"\`\n\nExample: \`topic association "inflation" "Relevant Tweets" "1:10"\``);
            return;
        }

        const keyword = matches[1]; // This is for analysis, not folder searching
        const sheetName = matches[2];
        const sheetRange = matches[3] || '';

        if (!keyword || !sheetName) {
            await message.reply(`❌ Keyword and Sheet Name are required.\n\nExample: \`topic association "inflation" "Relevant Tweets" "1:10"\``);
            return;
        }

        // Get the channel's topic (this determines which folder to search)
        const channelId = message.channel.id;
        const channelTopic = channelTopics.get(channelId);
        
        if (!channelTopic) {
            await message.reply(`❌ No topic set for this channel. Use \`set topic <topic>\` first to specify which folder to search.\n\nExample: \`set topic ethereum\``);
            return;
        }

        // Validate channel topic exists in config
        const fs = require('fs');
        const path = require('path');
        const configPath = path.join(process.cwd(), 'config.json');
        
        if (!fs.existsSync(configPath)) {
            await message.reply(`❌ Config file not found.`);
            return;
        }
        
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (!config[channelTopic]) {
            const availableTopics = Object.keys(config).join(', ');
            await message.reply(`❌ Channel topic '${channelTopic}' not found in config. Available topics: ${availableTopics}`);
            return;
        }

        await message.reply(`🔄 Processing topic association for "${keyword}"...\nChannel Topic: ${channelTopic}\nSheet: ${sheetName}\nRange: ${sheetRange || 'all'}`);

        // Import and use the topic association route
        const topicAssociationRoute = require('./routes/topicAssociation');
        
        // Implement topic-aware sheet lookup in channel's topic folder
        let sheetId = null;
        
        try {
            const { google } = require('googleapis');
            
            // Get Google Drive client
            const auth = new google.auth.GoogleAuth({
                keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || 'service-account-key.json',
                scopes: [
                    'https://www.googleapis.com/auth/drive.readonly',
                    'https://www.googleapis.com/auth/spreadsheets'
                ],
            });
            
            const client = await auth.getClient();
            const drive = google.drive({ version: 'v3', auth: client });
            
            // First find the channel's topic folder
            const topicFolderQuery = `name='${channelTopic}' and mimeType='application/vnd.google-apps.folder'`;
            const folderResponse = await drive.files.list({
                q: topicFolderQuery,
                fields: 'files(id, name)',
                orderBy: 'name'
            });
            
            if (!folderResponse.data.files || folderResponse.data.files.length === 0) {
                await message.reply(`❌ Topic folder "${channelTopic}" not found. Make sure the folder exists and the service account has access to it.`);
                return;
            }
            
            const topicFolderId = folderResponse.data.files[0].id;
            console.log(`✅ Found topic folder "${channelTopic}" with ID: ${topicFolderId}`);
            
            // Search for sheet within the channel's topic folder
            const sheetsQuery = `name='${sheetName}' and parents in '${topicFolderId}' and mimeType='application/vnd.google-apps.spreadsheet'`;
            const sheetsResponse = await drive.files.list({
                q: sheetsQuery,
                fields: 'files(id, name)',
                orderBy: 'name'
            });
            
            if (sheetsResponse.data.files && sheetsResponse.data.files.length > 0) {
                sheetId = sheetsResponse.data.files[0].id;
                console.log(`✅ Found sheet "${sheetName}" in "${channelTopic}" folder with ID: ${sheetId}`);
            } else {
                await message.reply(`❌ Sheet "${sheetName}" not found in "${channelTopic}" folder. Make sure the sheet exists in the correct folder and the service account has access to it.`);
                return;
            }
            
        } catch (error) {
            console.error('Error looking up sheet:', error);
            await message.reply(`❌ Error looking up sheet "${sheetName}": ${error.message}`);
            return;
        }

        // Create mock request/response objects
        const mockReq = {
            body: {
                topic1: keyword,
                sheetId: sheetId,
                sheetRange: sheetRange
            }
        };

        const mockRes = {
            json: async (data) => {
                if (data.success) {
                    // Format the response for Discord
                    let response = `✅ **Topic Association Results**\n\n`;
                    response += `**Keyword:** ${keyword}\n`;
                    response += `**Channel Topic:** ${channelTopic}\n`;
                    response += `**Generated:** ${data.suggestions.length} connections\n\n`;
                    
                    // Track meaningful connections found
                    let meaningfulConnections = 0;
                    
                    // Send results in chunks to avoid Discord message limits
                    for (let i = 0; i < data.suggestions.length; i++) {
                        const suggestion = data.suggestions[i];
                        
                        // Check if this is a meaningful connection
                        if (!suggestion.replies || suggestion.replies.length === 0) {
                            // Send connection analysis even without replies
                            let analysisResponse = `🔍 **Analysis ${i + 1}:**\n`;
                            analysisResponse += `**URL:** ${suggestion.tweetUrl}\n`;
                            analysisResponse += `**Connection:** ${suggestion.connection}\n\n`;
                            await message.channel.send(analysisResponse);
                            continue;
                        }
                        
                        meaningfulConnections++;
                        
                        let tweetResponse = `📢 **Topic Association Alert ${i + 1}!**\n`;
                        tweetResponse += `**URL:** ${suggestion.tweetUrl}\n`;
                        tweetResponse += `**Connection:** ${suggestion.connection}\n\n`;
                        tweetResponse += `**Replies:**\n`;
                        
                        for (let j = 0; j < suggestion.replies.length; j++) {
                            tweetResponse += `${j + 1}. ${suggestion.replies[j]}\n`;
                        }
                        
                        
                        // Send individual tweet responses to avoid length limits
                        if (tweetResponse.length > 1900) {
                            // Split into smaller chunks if still too long
                            const chunks = tweetResponse.match(/.{1,1900}/g);
                            for (const chunk of chunks) {
                                await message.channel.send(chunk);
                            }
                        } else {
                            await message.channel.send(tweetResponse);
                        }
                    }
                    
                    // Send summary message
                    if (meaningfulConnections === 0) {
                        await message.channel.send(`💡 **Summary:** No meaningful connections found between these tweets and "${keyword}". The analysis shows these tweets don't strongly relate to the topic.`);
                    } else {
                        await message.channel.send(`✅ **Summary:** Found ${meaningfulConnections} meaningful connections out of ${data.suggestions.length} analyzed tweets.`);
                    }
                } else {
                    await message.channel.send(`❌ **Error:** ${data.message}`);
                }
            },
            status: (code) => ({
                json: async (data) => {
                    await message.channel.send(`❌ **Error (${code}):** ${data.message}`);
                }
            })
        };

        // Execute the topic association logic
        const routeHandler = topicAssociationRoute.stack.find(layer => layer.route && layer.route.methods.post);
        if (routeHandler) {
            await routeHandler.route.stack[0].handle(mockReq, mockRes);
        } else {
            await message.reply(`❌ Topic association route not found.`);
        }

    } catch (error) {
        console.error('Error in topic association command:', error);
        await message.reply(`❌ Error processing topic association: ${error.message}`);
    }
}

async function handleConnect(message) {
    try {
        const content = message.content.trim();
        
        // Parse command: connect "keyword" "tweetLink"
        const commandText = content.substring('connect'.length).trim();
        const matches = commandText.match(/^"([^"]*)"(?:\s+"([^"]*)")?$/);
        
        if (!matches || !matches[1] || !matches[2]) {
            await message.reply(`❌ Usage: \`connect "keyword" "tweetLink"\`\n\nExample: \`connect "inflation" "https://twitter.com/user/status/1234567890"\`\n\n⚠️ **Note:** This uses the channel's topic folder to search for the tweet.`);
            return;
        }

        const keyword = matches[1]; // This is just for connection analysis, not folder searching
        const tweetLink = matches[2];

        // Get the channel's topic (this determines which folder to search)
        const channelId = message.channel.id;
        const channelTopic = channelTopics.get(channelId);
        
        if (!channelTopic) {
            await message.reply(`❌ No topic set for this channel. Use \`set topic <topic>\` first to specify which folder to search.\n\nExample: \`set topic ethereum\``);
            return;
        }

        // Validate channel topic exists in config
        const fs = require('fs');
        const path = require('path');
        const configPath = path.join(process.cwd(), 'config.json');
        
        if (!fs.existsSync(configPath)) {
            await message.reply(`❌ Config file not found.`);
            return;
        }
        
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (!config[channelTopic]) {
            const availableTopics = Object.keys(config).join(', ');
            await message.reply(`❌ Channel topic '${channelTopic}' not found in config. Available topics: ${availableTopics}`);
            return;
        }


        // Import required modules
        const { google } = require('googleapis');
        
        // Get Google Drive client to find "Relevant Tweets" sheet
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || 'service-account-key.json',
            scopes: [
                'https://www.googleapis.com/auth/drive.readonly',
                'https://www.googleapis.com/auth/spreadsheets'
            ],
        });
        
        const client = await auth.getClient();
        const drive = google.drive({ version: 'v3', auth: client });
        const sheets = google.sheets({ version: 'v4', auth: client });
        
        // Search for "Relevant Tweets" sheet in the channel's topic folder
        // First find the channel's topic folder
        const topicFolderQuery = `name='${channelTopic}' and mimeType='application/vnd.google-apps.folder'`;
        const folderResponse = await drive.files.list({
            q: topicFolderQuery,
            fields: 'files(id, name)',
            orderBy: 'name'
        });
        
        if (!folderResponse.data.files || folderResponse.data.files.length === 0) {
            await message.reply(`❌ Topic folder "${channelTopic}" not found. Make sure the folder exists and the service account has access to it.`);
            return;
        }
        
        const topicFolderId = folderResponse.data.files[0].id;
        console.log(`✅ Found topic folder "${channelTopic}" with ID: ${topicFolderId}`);
        
        // Now search for "Relevant Tweets" sheet within the channel's topic folder
        const sheetsQuery = `name='Relevant Tweets' and parents in '${topicFolderId}' and mimeType='application/vnd.google-apps.spreadsheet'`;
        const sheetsResponse = await drive.files.list({
            q: sheetsQuery,
            fields: 'files(id, name)',
            orderBy: 'name'
        });
        
        if (!sheetsResponse.data.files || sheetsResponse.data.files.length === 0) {
            await message.reply(`❌ "Relevant Tweets" sheet not found in "${channelTopic}" folder. Make sure the sheet exists in the correct folder and the service account has access to it.`);
            return;
        }
        
        const sheetId = sheetsResponse.data.files[0].id;
        console.log(`✅ Found "Relevant Tweets" sheet in "${channelTopic}" folder with ID: ${sheetId}`);

        // Get all data from the sheet to search for the tweet URL (specify large range to get all rows)
        const sheetResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: 'A1:E10000',
            majorDimension: 'ROWS'
        });
        
        const rows = sheetResponse.data.values || [];
        console.log(`📊 Found ${rows.length} rows in "Relevant Tweets" sheet`);
        console.log(`🔍 Searching for tweet URL: ${tweetLink}`);
        
        // Find the tweet by URL (column D) with improved search logic
        let foundTweet = null;
        let foundRowIndex = -1;
        
        // Normalize the search URL with enhanced normalization
        const normalizedSearchUrl = normalizeTwitterUrl(tweetLink);
        
        console.log(`🔍 Searching for normalized URL: ${normalizedSearchUrl}`);
        console.log(`🔍 Original URL: ${tweetLink}`);
        
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row && row[3]) {
                const originalSheetUrl = row[3];
                const normalizedSheetUrl = normalizeTwitterUrl(originalSheetUrl);
                
                // Try multiple matching strategies with better URL normalization
                const exactMatch = normalizedSheetUrl === normalizedSearchUrl;
                const includesMatch = normalizedSheetUrl.includes(normalizedSearchUrl) || normalizedSearchUrl.includes(normalizedSheetUrl);
                const statusIdMatch = extractStatusId(originalSheetUrl) === extractStatusId(tweetLink);
                
                
                if (exactMatch || includesMatch || statusIdMatch) {
                    console.log(`✅ Found match at row ${i + 1}:`);
                    console.log(`   Sheet URL: ${row[3]}`);
                    console.log(`   Search URL: ${tweetLink}`);
                    console.log(`   Match type: ${exactMatch ? 'exact' : includesMatch ? 'includes' : 'status_id'}`);
                    
                    foundTweet = {
                        text: row[2] || '',
                        handle: row[1] || '@unknown',
                        url: row[3] || 'N/A',
                        date: row[0] || 'N/A',
                        followerCount: row[4] || 'N/A',
                        rowNumber: i + 1
                    };
                    foundRowIndex = i;
                    break;
                }
            }
        }
        
        // Helper function to extract status ID from Twitter URL
        function extractStatusId(url) {
            const match = url.match(/status\/(\d+)/);
            return match ? match[1] : null;
        }
        
        // Helper function to normalize Twitter URLs for better matching
        function normalizeTwitterUrl(url) {
            if (!url) return '';
            
            let normalized = url.trim().toLowerCase();
            
            // Convert x.com to twitter.com for consistency
            normalized = normalized.replace(/x\.com/g, 'twitter.com');
            
            // Remove trailing slashes and query parameters
            normalized = normalized.replace(/[?#].*$/, '').replace(/\/$/, '');
            
            // Remove www. prefix if present
            normalized = normalized.replace(/www\./g, '');
            
            return normalized;
        }
        
        if (!foundTweet) {
            // Show some sample URLs from the sheet for debugging
            console.log(`❌ Tweet not found. Sample URLs from sheet:`);
            console.log(`❌ Searched for: ${normalizedSearchUrl} (normalized from: ${tweetLink})`);
            for (let i = 0; i < Math.min(10, rows.length); i++) {
                const row = rows[i];
                if (row && row[3]) {
                    const normalized = normalizeTwitterUrl(row[3]);
                    console.log(`   Row ${i + 1}: "${row[3]}" -> "${normalized}"`);
                    console.log(`   Status ID: ${extractStatusId(row[3])}`);
                }
            }
            
            await message.reply(`❌ Tweet not found in "Relevant Tweets" sheet. Make sure the tweet URL is correct and exists in the sheet.\n\nSearched for: ${tweetLink}\nNormalized to: ${normalizedSearchUrl}\n\nCheck the console for detailed debug information.`);
            return;
        }
        
        // Ensure handler has @ symbol
        const formattedHandler = foundTweet.handle.startsWith('@') ? foundTweet.handle : `@${foundTweet.handle}`;
        foundTweet.handle = formattedHandler;
        
        console.log(`✅ Found tweet at row ${foundTweet.rowNumber}: "${foundTweet.text.substring(0, 50)}..."`);
        
        // Generate connections and replies using the keyword and channel topic
        const topicAssociationRoute = require('./routes/topicAssociation');
        const suggestions = await generateConnectionsAndRepliesForConnect(keyword, [foundTweet]);
        
        if (suggestions === null) {
            await message.reply(`❌ No connections could be drawn. Claude CLI failed or is not available.`);
            return;
        }
        
        if (suggestions.length === 0 || !suggestions[0].replies || suggestions[0].replies.length === 0) {
            await message.reply(`❌ No meaningful connections found between the tweet and "${keyword}".`);
            return;
        }
        
        // Format and send the response
        const suggestion = suggestions[0];
        let response = `✅ Connection Found!\n\n`;
        response += `**Keyword:** ${keyword}\n`;
        response += `**Channel Topic:** ${channelTopic}\n`;
        response += `**Tweet:** ${foundTweet.url}\n`;
        response += `**Connection:** ${suggestion.connection}\n\n`;
        response += `**Reply Suggestions:**\n`;
        
        for (let i = 0; i < suggestion.replies.length; i++) {
            response += `${i + 1}. ${suggestion.replies[i]}\n`;
        }
        
        // Send response, splitting if too long
        if (response.length > 1900) {
            const chunks = response.match(/.{1,1900}/g);
            for (const chunk of chunks) {
                await message.channel.send(chunk);
            }
        } else {
            await message.channel.send(response);
        }
        
    } catch (error) {
        console.error('Error in connect command:', error);
        await message.reply(`❌ Error processing connect command: ${error.message}`);
    }
}

// Helper function to generate connections and replies for connect command
async function generateConnectionsAndRepliesForConnect(topic1, tweets) {
    const isWindows = process.platform === 'win32';
    
    console.log(`🤖 Starting Claude ${isWindows ? 'API' : 'CLI'} for topic: ${topic1} with ${tweets.length} tweets`);
    
    const prompt = connectCommandPrompt(topic1, tweets);

    if (isWindows) {
        // Use Anthropic API for Windows
        return await generateWithAnthropicAPI(prompt, topic1, tweets.length);
    } else {
        // Use Claude CLI for Mac/Linux
        return await generateWithClaudeCLI(prompt, topic1, tweets.length);
    }
}

// Windows: Use Anthropic API
async function generateWithAnthropicAPI(prompt, topic1, tweetCount) {
    const Anthropic = require('@anthropic-ai/sdk');
    
    let content = '';
    
    try {
        const anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
        });

        console.log(`📝 Sending prompt to Claude API (${prompt.length} characters)`);
        
        const message = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 8000,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ]
        });

        content = message.content[0].text.trim();
        
        console.log(`✅ Claude API completed successfully`);
        console.log(`📄 Raw output length: ${content.length} characters`);
        
        // Extract JSON from the response with better error handling
        let jsonContent = content;
        let result;
        
        try {
            // First try to find JSON in code blocks
            const codeBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
            if (codeBlockMatch) {
                jsonContent = codeBlockMatch[1];
            } else {
                // Try to find JSON array
                const arrayMatch = content.match(/(\[[\s\S]*\])/);
                if (arrayMatch) {
                    jsonContent = arrayMatch[1];
                } else {
                    // Try to find JSON object
                    const jsonMatch = content.match(/(\{[\s\S]*\})/);
                    if (jsonMatch) {
                        jsonContent = jsonMatch[1];
                    }
                }
            }
            
            // Try to parse the extracted JSON
            result = JSON.parse(jsonContent);
            
        } catch (parseError) {
            console.warn(`❌ Initial JSON parsing failed: ${parseError.message}`);
            
            // If parsing fails, try to fix common truncation issues
            try {
                // Look for incomplete JSON and try to complete it
                const incompleteArrayMatch = content.match(/(\[[\s\S]*?)(?:\s*$|\s*\n)/);
                if (incompleteArrayMatch) {
                    let incompleteJson = incompleteArrayMatch[1];
                    
                    // Count opening and closing brackets/braces
                    const openBrackets = (incompleteJson.match(/\[/g) || []).length;
                    const closeBrackets = (incompleteJson.match(/\]/g) || []).length;
                    const openBraces = (incompleteJson.match(/\{/g) || []).length;
                    const closeBraces = (incompleteJson.match(/\}/g) || []).length;
                    
                    // Add missing closing brackets/braces
                    while (closeBrackets < openBrackets) {
                        incompleteJson += ']';
                    }
                    while (closeBraces < openBraces) {
                        incompleteJson += '}';
                    }
                    
                    console.log(`🔧 Attempting to fix truncated JSON: ${incompleteJson.substring(0, 100)}...`);
                    result = JSON.parse(incompleteJson);
                    
                } else {
                    throw new Error('Could not extract or fix JSON content');
                }
            } catch (fixError) {
                console.warn(`❌ JSON fix attempt failed: ${fixError.message}`);
                console.warn(`Raw content preview: ${content.substring(0, 500)}...`);
                throw parseError; // Re-throw original error
            }
        }
        
        console.log(`🎯 Successfully generated ${result.length} sets of replies`);
        return result;
        
    } catch (error) {
        if (error.name === 'SyntaxError') {
            console.warn(`❌ Failed to parse Claude response: ${error.message}`);
            console.warn(`Raw output: ${content ? content.substring(0, 200) : 'No content'}...`);
        } else {
            console.warn(`❌ Claude API error: ${error.message}`);
        }
        return null;
    }
}

// Mac/Linux: Use Claude CLI
async function generateWithClaudeCLI(prompt, topic1, tweetCount) {
    const { spawn } = require('child_process');
    
    return new Promise((resolve) => {
        const claude = spawn('/usr/local/bin/claude', ['-'], { stdio: ['pipe', 'pipe', 'pipe'] });
        let output = '';
        let errorOutput = '';
        
        console.log(`📝 Sending prompt to Claude CLI (${prompt.length} characters)`);
        
        claude.stdin.write(prompt);
        claude.stdin.end();
        
        claude.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        claude.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        
        claude.on('close', (code) => {
            if (code !== 0) {
                console.warn(`❌ Claude CLI exited with code ${code}`);
                console.warn(`Error output: ${errorOutput}`);
                resolve(null);
                return;
            }
            
            try {
                console.log(`✅ Claude CLI completed successfully`);
                console.log(`📄 Raw output length: ${output.length} characters`);
                const content = output.trim();
                // Extract JSON from the response (handle markdown code blocks)
                let jsonContent = content;
                const codeBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
                if (codeBlockMatch) {
                    jsonContent = codeBlockMatch[1];
                } else {
                    // Try to extract JSON array from the content
                    const jsonMatch = content.match(/(\[[\s\S]*\])/);
                    if (jsonMatch) {
                        jsonContent = jsonMatch[1];
                    }
                }
                let result;
                try {
                    result = JSON.parse(jsonContent);
                } catch (parseError) {
                    console.warn(`❌ Failed to parse Claude response: ${parseError.message}`);
                    console.warn(`Full raw output for debugging: ${content}`);
                    resolve(null);
                    return;
                }
                console.log(`🎯 Successfully generated ${result.length} sets of replies`);
                resolve(result);
            } catch (parseError) {
                console.warn(`❌ Failed to parse Claude response: ${parseError.message}`);
                console.warn(`Full raw output for debugging: ${output}`);
                resolve(null);
            }
        });
        
        claude.on('error', (error) => {
            console.warn(`❌ Claude CLI error: ${error.message}`);
            resolve(null);
        });
    });
}

async function handleSuggestPost(message) {
    let processKey = null;
    try {
        const content = message.content.trim();
        
        // Parse command: suggest post <twitter_handle>
        const commandText = content.substring('suggest post'.length).trim();
        
        if (!commandText) {
            await message.reply(`❌ Usage: \`suggest post <twitter_handle>\`\n\nExample: \`suggest post elonmusk\`\n\n⚠️ **Note:** Make sure to set a topic for this channel first using \`set topic <topic>\``);
            return;
        }
        
        // Get the topic for this channel (required for topic-aware suggestions)
        const channelId = message.channel.id;
        const topic = channelTopics.get(channelId);
        
        if (!topic) {
            await message.reply(`❌ No topic set for this channel. Use \`set topic <topic>\` first to get topic-specific suggestions.\n\nExample: \`set topic ethereum\``);
            return;
        }
        
        // Clean the twitter handle - remove @ symbol if present
        const twitterHandle = commandText.replace(/^@/, '').trim();
        
        if (!twitterHandle) {
            await message.reply(`❌ Please provide a valid Twitter handle.\n\nExample: \`suggest post elonmusk\``);
            return;
        }
        
        // Check if suggest post is already running for this exact user+topic in this channel
        processKey = `${message.channel.id}_${topic}_${twitterHandle}`;
        if (runningSuggestPosts.has(processKey)) {
            await message.reply(`⚠️ A suggest post for @${twitterHandle} with topic "${topic}" is already running in this channel. Please wait for it to complete.`);
            return;
        }
        
        // Mark this suggest post as running (allow multiple channels simultaneously)
        runningSuggestPosts.add(processKey);
        
        await message.reply(`🔄 Analyzing @${twitterHandle}'s tweets and generating topic-specific suggestions for "${topic}"...\nThis may take a moment...`);
        
        // Import and use the suggestPost functionality
        const { suggestPost } = require('./suggestPost');
        
        const result = await suggestPost(twitterHandle, topic);
        
        if (!result.success) {
            await message.channel.send(`❌ **Error:** ${result.message}`);
            // Clean up tracking
            runningSuggestPosts.delete(processKey);
            return;
        }
        
        // Format and send the response
        let response = `✅ **Post Suggestions for @${twitterHandle}**\n\n`;
        response += `**Analysis:** ${result.userAnalysis}\n\n`;
        response += `**Data Processed:** ${result.userTweetsCount} user tweets, ${result.recentTweetsCount} recent trending tweets\n\n`;
        
        if (result.suggestions.length === 0) {
            response += `🤔 **No suggestions found.** The user's interests don't strongly align with the current trending tweets.`;
            await message.channel.send(response);
            // Clean up tracking
            runningSuggestPosts.delete(processKey);
            return;
        }
        
        response += `**${result.suggestions.length} Recommended Posts:**\n\n`;
        
        // Send the main response first
        await message.channel.send(response);
        
        // Send each suggestion separately to avoid message length limits
        for (let i = 0; i < result.suggestions.length; i++) {
            const suggestion = result.suggestions[i];
            
            let suggestionResponse = `**${i + 1}. ${suggestion.author}**\n`;
            suggestionResponse += `"${suggestion.tweetText}"\n`;
            suggestionResponse += `🔗 ${suggestion.tweetUrl}\n\n`;
            suggestionResponse += `**Why this matches:** ${suggestion.reason}\n\n`;
            suggestionResponse += `**Engagement Ideas:**\n`;
            
            for (let j = 0; j < suggestion.engagementIdeas.length; j++) {
                suggestionResponse += `• ${suggestion.engagementIdeas[j]}\n`;
            }
            
            // Send individual suggestion, splitting if too long
            if (suggestionResponse.length > 1900) {
                const chunks = suggestionResponse.match(/.{1,1900}/g);
                for (const chunk of chunks) {
                    await message.channel.send(chunk);
                }
            } else {
                await message.channel.send(suggestionResponse);
            }
            
            // Add a small delay between suggestions
            if (i < result.suggestions.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        // Clean up tracking after successful completion
        runningSuggestPosts.delete(processKey);
        
    } catch (error) {
        console.error('Error in suggest post command:', error);
        await message.reply(`❌ Error processing suggest post command: ${error.message}`);
        // Clean up tracking on error
        if (processKey) {
            runningSuggestPosts.delete(processKey);
        }
    }
}

async function handleStockSearch(message) {
    try {
        const content = message.content.trim();
        
        // Parse command: stock search [ticker]
        const commandText = content.substring('stock search'.length).trim();
        
        // Import the stock search module
        const { searchStockTickers, searchSpecificTicker } = require('./stockSearch');
        
        let ticker = null;
        let minFollowers = 5000; // Default minimum followers
        
        if (commandText) {
            // Extract ticker if provided (handle both $TICKER and TICKER formats)
            const tickerMatch = commandText.match(/\$?([A-Z]{2,5})/);
            if (tickerMatch) {
                ticker = '$' + tickerMatch[1];
            }
        }
        
        await message.reply(`🔍 Searching Twitter for stock ticker threads${ticker ? ` about ${ticker}` : ''}...\n👥 Filtering for users with ${minFollowers}+ followers\n⏳ This may take a moment...`);
        
        let result;
        if (ticker) {
            result = await searchSpecificTicker(ticker, minFollowers);
        } else {
            result = await searchStockTickers(null, minFollowers);
        }
        
        if (!result.success) {
            await message.channel.send(`❌ **Error:** ${result.error}`);
            return;
        }
        
        if (result.tweets.length === 0) {
            let noResultsMsg = `📊 **No Results Found**\n\n`;
            noResultsMsg += `**Search:** ${result.searchQuery}\n`;
            noResultsMsg += `**Total tweets found:** ${result.totalFound || 0}\n`;
            noResultsMsg += `**After follower filter (${minFollowers}+):** 0\n\n`;
            noResultsMsg += `💡 Try:\n• Searching for a different ticker\n• Lowering the follower requirement\n• Searching during market hours for more activity`;
            
            await message.channel.send(noResultsMsg);
            return;
        }
        
        // Format and send results
        let response = `📊 **Stock Ticker Thread Results**\n\n`;
        response += `**Search:** ${result.searchQuery}\n`;
        response += `**Found:** ${result.filteredCount} threads from users with ${minFollowers}+ followers\n`;
        response += `**Total scanned:** ${result.totalFound} tweets\n\n`;
        
        await message.channel.send(response);
        
        // Send individual thread results (limit to top 5 to avoid spam)
        const topTweets = result.tweets.slice(0, 5);
        
        for (let i = 0; i < topTweets.length; i++) {
            const tweet = topTweets[i];
            
            let tweetResponse = `🧵 **Thread ${i + 1}**\n`;
            tweetResponse += `**Author:** @${tweet.username} (${tweet.displayName})\n`;
            tweetResponse += `**Followers:** ${tweet.followerCount.toLocaleString()}\n`;
            tweetResponse += `**Tickers:** ${tweet.stockTickers.join(', ')}\n`;
            tweetResponse += `**URL:** ${tweet.tweetUrl}\n\n`;
            
            if (tweet.timestamp) {
                const date = new Date(tweet.timestamp);
                tweetResponse += `\n**Posted:** ${date.toLocaleString()}`;
            }
            
            await message.channel.send(tweetResponse);
            
            // Add delay between messages to avoid rate limits
            if (i < topTweets.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        if (result.tweets.length > 5) {
            await message.channel.send(`📋 **Note:** Showing top 5 results. Found ${result.tweets.length} total threads.`);
        }
        
    } catch (error) {
        console.error('Error in stock search command:', error);
        await message.reply(`❌ Error processing stock search command: ${error.message}`);
    }
}

async function handleLinkedInAlumni(message) {
    try {
        const content = message.content.trim();
        
        // Parse command: linkedin alumni <university-slug> [keywords]
        const commandText = content.substring('linkedin alumni'.length).trim();
        
        if (!commandText) {
            await message.reply(`❌ Usage: \`linkedin alumni <university-slug> [keywords]\`\n\nExamples:\n• \`linkedin alumni stanford-university hr\`\n• \`linkedin alumni harvard-university software engineer\`\n• \`linkedin alumni mit\`\n\n⚠️ **Note:** University slug is the part after '/school/' in LinkedIn URLs`);
            return;
        }
        
        // Parse university slug and optional keywords
        const parts = commandText.split(' ');
        const universitySlug = parts[0];
        const keywords = parts.slice(1).join(' ') || '';
        
        if (!universitySlug) {
            await message.reply(`❌ Please provide a university slug.\n\nExample: \`linkedin alumni stanford-university hr\``);
            return;
        }
        
        await message.reply(`🔍 Searching LinkedIn alumni for **${universitySlug}**${keywords ? ` with keywords: "${keywords}"` : ''}...\n⏳ This may take a moment...`);
        
        // Import and use the LinkedIn scraper
        const { scrapeLinkedInAlumni } = require('./linkedinScraper');
        
        const result = await scrapeLinkedInAlumni(universitySlug, keywords, 15); // Limit to 15 results
        
        if (!result.success) {
            await message.channel.send(`❌ **Error:** ${result.error}`);
            return;
        }
        
        if (result.alumni.length === 0) {
            let noResultsMsg = `📊 **No Alumni Found**\n\n`;
            noResultsMsg += `**University:** ${universitySlug}\n`;
            noResultsMsg += `**Keywords:** ${keywords || 'None'}\n\n`;
            noResultsMsg += `💡 Tips:\n• Try different keywords\n• Check if the university slug is correct\n• Some LinkedIn pages may require authentication`;
            
            await message.channel.send(noResultsMsg);
            return;
        }
        
        // Format and send results
        let response = `🎓 **LinkedIn Alumni Results**\n\n`;
        response += `**University:** ${universitySlug.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}\n`;
        response += `**Keywords:** ${keywords || 'None'}\n`;
        response += `**Found:** ${result.alumni.length} alumni\n\n`;
        
        await message.channel.send(response);
        
        // Send individual alumni results (limit to avoid spam)
        const alumniToShow = result.alumni.slice(0, 10); // Show max 10
        
        for (let i = 0; i < alumniToShow.length; i++) {
            const alumni = alumniToShow[i];
            
            let alumniResponse = `👤 **${i + 1}. ${alumni.firstName} ${alumni.lastName}**\n`;
            
            if (alumni.jobTitle) {
                alumniResponse += `**Position:** ${alumni.jobTitle}\n`;
            }
            
            if (alumni.company) {
                alumniResponse += `**Company:** ${alumni.company}\n`;
            }
            
            if (!alumni.jobTitle && !alumni.company) {
                alumniResponse += `**Info:** Limited profile information available\n`;
            }
            
            alumniResponse += `\n`;
            
            await message.channel.send(alumniResponse);
            
            // Add delay between messages to avoid rate limits
            if (i < alumniToShow.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 800));
            }
        }
        
        if (result.alumni.length > 10) {
            await message.channel.send(`📋 **Note:** Showing top 10 results out of ${result.alumni.length} found alumni.`);
        }
        
    } catch (error) {
        console.error('Error in LinkedIn alumni command:', error);
        await message.reply(`❌ Error processing LinkedIn alumni search: ${error.message}`);
    }
}

async function handleAutoReply(message) {
    try {
        const content = message.content.trim();
        
        // Check if there are any subcommands
        const commandText = content.substring('auto reply'.length).trim();
        
        if (commandText === 'stop') {
            await handleStopAutoReply(message);
            return;
        } else if (commandText === 'status') {
            await handleAutoReplyStatus(message);
            return;
        } else if (commandText && (commandText.includes('twitter.com/') || commandText.includes('x.com/'))) {
            // Extract URL from command text
            const urlMatch = commandText.match(/(https?:\/\/(?:twitter\.com|x\.com)\/\w+\/status\/\d+)/);
            if (urlMatch) {
                await handleInstantAutoReply(message, urlMatch[1]);
                return;
            } else {
                await message.reply(`❌ Invalid Twitter/X URL format. Use: \`auto reply "https://twitter.com/user/status/123456"\``);
                return;
            }
        } else if (commandText && !commandText.startsWith('start')) {
            await message.reply(`❌ Usage:\n\`auto reply\` - Start automatic replies\n\`auto reply "https://twitter.com/user/status/123"\` - Reply to specific tweet\n\`auto reply stop\` - Stop automatic replies\n\`auto reply status\` - Check status\n\n⚠️ **Note:** Set topic first with \`set topic <topic>\``);
            return;
        }
        
        // Start auto reply (default action or explicit "start")
        await handleStartAutoReply(message);
        
    } catch (error) {
        console.error('Error in auto reply command:', error);
        await message.reply(`❌ Error processing auto reply command: ${error.message}`);
    }
}

async function handleStartAutoReply(message) {
    try {
        const channelId = message.channel.id;
        const topic = getChannelTopic(channelId, message.channel);
        
        if (!topic) {
            await message.reply(`❌ Could not determine topic for this channel. Either use \`set topic <topic>\` or rename the channel to a valid topic.`);
            return;
        }
        
        const processKey = `${channelId}_${topic}`;
        
        // Check if auto reply is already running for this channel+topic
        if (runningAutoReplies.has(processKey)) {
            await message.reply(`⚠️ Automatic replies for **${topic}** are already running in this channel! Use \`auto reply stop\` first.`);
            return;
        }

        await message.reply(`🚀 Starting automatic replies for **${topic}** in this channel...`);

        // Start the automatic reply process
        const { spawn } = require('child_process');
        
        let autoReplyProcess = spawn('node', ['automaticReply.js', 'start'], {
            cwd: process.cwd(),
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { 
                ...process.env, 
                TOPIC: topic,
                DISCORD_CHANNEL_ID: channelId,
                DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN
            }
        });

        // Store the process with channel+topic key
        runningAutoReplies.set(processKey, {
            process: autoReplyProcess,
            startTime: new Date(),
            channel: message.channel,
            topic: topic,
            channelId: channelId
        });

        // Handle process output
        autoReplyProcess.stdout.on('data', (data) => {
            console.log(`Auto Reply (${topic}) output: ${data.toString().trim()}`);
        });

        autoReplyProcess.stderr.on('data', (data) => {
            console.error(`Auto Reply (${topic}) error: ${data.toString().trim()}`);
        });

        // Handle process exit
        autoReplyProcess.on('close', (code) => {
            console.log(`Auto Reply (${topic}) process exited with code ${code}`);
            
            if (code === 0) {
                // Process exited normally
                const autoReplyInfo = runningAutoReplies.get(processKey);
                if (autoReplyInfo) {
                    autoReplyInfo.isBackground = true;
                    autoReplyInfo.startupCompleted = true;
                }
            } else {
                // Process failed
                runningAutoReplies.delete(processKey);
                message.channel.send(`❌ ${topic} automatic replies failed to start (exit code ${code}).`);
            }
        });

        autoReplyProcess.on('error', (error) => {
            console.error(`Failed to start ${topic} automatic replies: ${error.message}`);
            runningAutoReplies.delete(processKey);
            message.channel.send(`❌ Failed to start ${topic} automatic replies: ${error.message}`);
        });

        await message.channel.send(`✅ **${topic}** automatic replies started successfully!\n🔍 Use \`auto reply status\` to check progress.`);

    } catch (error) {
        console.error('Error starting auto reply:', error);
        await message.reply(`❌ Error starting automatic replies: ${error.message}`);
    }
}

async function handleStopAutoReply(message) {
    try {
        const channelId = message.channel.id;
        const topic = getChannelTopic(channelId, message.channel);
        
        if (!topic) {
            await message.reply(`❌ Could not determine topic for this channel. Either use \`set topic <topic>\` or rename the channel to a valid topic.`);
            return;
        }
        
        const processKey = `${channelId}_${topic}`;
        const autoReply = runningAutoReplies.get(processKey);
        
        // Check for actual running auto reply processes for this specific topic
        const { exec } = require('child_process');
        const checkAutoReplyProcess = () => new Promise((resolve) => {
            const fs = require('fs');
            const topicPidFile = `.${topic}_reply.pid`;
            
            if (fs.existsSync(topicPidFile)) {
                try {
                    const pid = fs.readFileSync(topicPidFile, 'utf8').trim();
                    exec(`ps -p ${pid}`, (error, stdout) => {
                        resolve(!error && stdout.includes(pid));
                    });
                } catch (e) {
                    resolve(false);
                }
            } else {
                resolve(false);
            }
        });
        
        const hasRunningProcess = await checkAutoReplyProcess();
        
        if (!autoReply && !hasRunningProcess) {
            await message.reply(`ℹ️ No automatic replies are currently running for **${topic}** in this channel.`);
            return;
        }

        await message.reply(`🛑 Stopping automatic replies for **${topic}** in this channel...`);

        // Kill the tracked process if it exists
        if (autoReply) {
            autoReply.process.kill('SIGTERM');
        }
        
        // Run stop script
        const { spawn } = require('child_process');
        let stopProcess = spawn('node', ['automaticReply.js', 'stop'], {
            cwd: process.cwd(),
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, TOPIC: topic }
        });
        
        stopProcess.on('close', async (code) => {
            runningAutoReplies.delete(processKey);
            if (code === 0) {
                await message.channel.send(`✅ **${topic}** automatic replies stopped successfully.`);
            } else {
                await message.channel.send(`⚠️ Stop script exited with code ${code}, but **${topic}** automatic replies should be stopped.`);
            }
        });
        
        // Force kill any remaining processes for this specific topic after 10 seconds
        setTimeout(async () => {
            const fs = require('fs');
            const topicPidFile = `.${topic}_reply.pid`;
            
            if (fs.existsSync(topicPidFile)) {
                try {
                    const pid = fs.readFileSync(topicPidFile, 'utf8').trim();
                    exec(`kill -9 ${pid}`, () => {
                        // Force killed topic-specific process
                    });
                    // Clean up PID file
                    fs.unlinkSync(topicPidFile);
                } catch (e) {
                    // Ignore cleanup errors
                }
            }
        }, 10000);

    } catch (error) {
        console.error('Error stopping auto reply:', error);
        await message.reply(`❌ Error stopping automatic replies: ${error.message}`);
    }
}

async function handleAutoReplyStatus(message) {
    try {
        const channelId = message.channel.id;
        const topic = getChannelTopic(channelId, message.channel);
        
        if (!topic) {
            await message.reply(`❌ Could not determine topic for this channel. Either use \`set topic <topic>\` or rename the channel to a valid topic.`);
            return;
        }
        
        const processKey = `${channelId}_${topic}`;
        const autoReply = runningAutoReplies.get(processKey);
        
        // Check for actual running auto reply processes for this specific topic
        const { exec } = require('child_process');
        const checkAutoReplyProcess = () => new Promise((resolve) => {
            const fs = require('fs');
            const topicPidFile = `.${topic}_reply.pid`;
            
            if (fs.existsSync(topicPidFile)) {
                try {
                    const pid = fs.readFileSync(topicPidFile, 'utf8').trim();
                    exec(`ps -p ${pid}`, (error, stdout) => {
                        if (!error && stdout.includes(pid)) {
                            resolve([pid]);
                        } else {
                            // PID file exists but process is dead, clean it up
                            fs.unlinkSync(topicPidFile);
                            resolve(null);
                        }
                    });
                } catch (e) {
                    // Clean up corrupted PID file
                    try {
                        fs.unlinkSync(topicPidFile);
                    } catch (e2) {}
                    resolve(null);
                }
            } else {
                resolve(null);
            }
        });
        
        const runningPids = await checkAutoReplyProcess();
        
        if (!autoReply && !runningPids) {
            await message.reply(`📊 **Auto Reply Status:** **${topic}** not running in this channel\n\nUse \`auto reply\` to begin automatic replies.`);
            return;
        }

        if (autoReply && autoReply.isBackground) {
            // Background auto reply started via Discord bot
            const uptime = new Date() - autoReply.startTime;
            const hours = Math.floor(uptime / (1000 * 60 * 60));
            const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((uptime % (1000 * 60)) / 1000);

            let statusMessage = `📊 **Auto Reply Status:** **${topic}** running in this channel ✅\n`;
            statusMessage += `**Started:** ${autoReply.startTime.toLocaleString()}\n`;
            statusMessage += `**Uptime:** ${hours}h ${minutes}m ${seconds}s\n`;
            statusMessage += `**Mode:** Background process\n`;
            
            if (runningPids) {
                statusMessage += `**Process ID(s):** ${runningPids.join(', ')}\n`;
            }
            
            statusMessage += `\nUse \`auto reply stop\` to stop **${topic}** automatic replies.`;
            
            await message.reply(statusMessage);
        } else if (runningPids) {
            // Auto reply running but not started via Discord bot
            await message.reply(`📊 **Auto Reply Status:** **${topic}** running ✅
**Mode:** External process
**Process ID(s):** ${runningPids.join(', ')}

Automatic replies were started outside of Discord bot.
Use \`auto reply stop\` to stop **${topic}** automatic replies.`);
        }

    } catch (error) {
        console.error('Error getting auto reply status:', error);
        await message.reply(`❌ Error getting auto reply status: ${error.message}`);
    }
}

async function handleInstantAutoReply(message, tweetUrl) {
    try {
        const channelId = message.channel.id;
        const topic = getChannelTopic(channelId, message.channel);
        
        if (!topic) {
            await message.reply(`❌ Could not determine topic for this channel. Either use \`set topic <topic>\` or rename the channel to a valid topic.`);
            return;
        }

        const statusMsg = await message.reply(`🚀 Processing instant auto reply for tweet...\n**URL:** ${tweetUrl}\n**Topic:** ${topic}`);

        // Import required modules
        const { generateReply } = require('./claude-reply');
        const { google } = require('googleapis');
        const fs = require('fs');
        const path = require('path');

        // Get tweet content from Google Sheet (same as regular auto reply)
        try {
            // Load configuration
            const configPath = path.join(__dirname, 'config.json');
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            const topicConfig = config[topic];
            
            if (!topicConfig) {
                await statusMsg.edit(`❌ Topic "${topic}" not found in config. Available topics: ${Object.keys(config).join(', ')}`);
                return;
            }

            // Set up Google Sheets (same as auto reply)
            const auth = new google.auth.GoogleAuth({
                keyFile: 'service-account-key-new.json',
                scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/drive.readonly']
            });
            
            const drive = google.drive({ version: 'v3', auth });
            const sheets = google.sheets({ version: 'v4', auth });
            
            // Find target spreadsheet (same logic as auto reply)
            const driveResponse = await drive.files.list({
                q: `name='${topicConfig.targetSheet}' and '${topicConfig.folder}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed = false`,
                fields: 'files(id, name)'
            });
            
            if (!driveResponse.data.files || driveResponse.data.files.length === 0) {
                await statusMsg.edit(`❌ Target sheet "${topicConfig.targetSheet}" not found in folder for topic "${topic}"`);
                return;
            }
            
            const spreadsheetId = driveResponse.data.files[0].id;
            const range = 'Sheet1!A:E'; // [dateTime, handle, tweetText, tweetLink, followerCount]
            
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range,
            });
            
            const rows = response.data.values;
            if (!rows || rows.length === 0) {
                await statusMsg.edit(`❌ No tweet data found in Google Sheet for topic "${topic}"`);
                return;
            }
            
            // Normalize URLs for comparison (x.com vs twitter.com)
            const normalizeUrl = (url) => {
                if (!url) return '';
                return url.replace('x.com', 'twitter.com');
            };
            
            const normalizedSearchUrl = normalizeUrl(tweetUrl);
            console.log(`🔍 Searching for: ${normalizedSearchUrl}`);
            
            // Find the tweet by URL (start from row 0, no header)
            let tweetData = null;
            let foundUrls = [];
            for (let i = 0; i < rows.length && i < 10; i++) { // Check first 10 rows for debugging
                const [, handle, tweetText, tweetLink] = rows[i];
                const normalizedSheetUrl = normalizeUrl(tweetLink);
                foundUrls.push(normalizedSheetUrl);
                console.log(`📄 Row ${i + 1}: ${normalizedSheetUrl}`);
                
                if (normalizedSheetUrl === normalizedSearchUrl) {
                    tweetData = { handle, tweetText };
                    console.log(`✅ Found match at row ${i + 1}!`);
                    break;
                }
            }
            
            if (!tweetData || !tweetData.tweetText || !tweetData.handle) {
                console.log(`❌ No match found. First 10 URLs in sheet:`, foundUrls);
                await statusMsg.edit(`❌ Tweet not found in Google Sheet. Searched: ${normalizedSearchUrl}\n\nFirst few URLs in sheet:\n${foundUrls.slice(0, 3).map(url => `• ${url}`).join('\n')}`);
                return;
            }
            
            // Update status - generating reply
            await statusMsg.edit(`🤖 Generating AI reply for @${tweetData.handle}...\n**URL:** ${tweetUrl}\n**Topic:** ${topic}`);
            const replyText = await generateReply(tweetData.tweetText, tweetData.handle, topic);
            
            if (!replyText || replyText.trim().length === 0) {
                await statusMsg.edit(`❌ Failed to generate reply for the tweet.`);
                return;
            }
            
            // Post the reply using the same function as auto reply
            const { postTweetReply } = require('./automaticReply');
            const success = await postTweetReply(tweetUrl, replyText);
            
            if (success) {
                // Update status - reply posted with checkmark
                await statusMsg.edit(`✅ **Auto Reply Posted**\nTweet Link: ${tweetUrl}\nReply: ${replyText}`);
            } else {
                await statusMsg.edit(`❌ Failed to post reply to the tweet. Please check the URL and try again.`);
            }
            
        } catch (sheetError) {
            throw sheetError;
        }
        
    } catch (error) {
        console.error('Error in instant auto reply:', error);
        if (typeof statusMsg !== 'undefined') {
            await statusMsg.edit(`❌ Error processing instant auto reply: ${error.message}`);
        } else {
            await message.reply(`❌ Error processing instant auto reply: ${error.message}`);
        }
    }
}

async function handleMonitor(message) {
    try {
        const channelId = message.channel.id;
        const topic = getChannelTopic(channelId, message.channel);
        
        if (!topic) {
            await message.reply(`❌ Could not determine topic for this channel. Either use \`set topic <topic>\` or rename the channel to a valid topic.`);
            return;
        }
        
        const processKey = `${channelId}_${topic}`;
        
        // Check if monitor is already running for this channel+topic
        if (runningMonitors.has(processKey)) {
            await message.reply(`⚠️ Monitor alerts for **${topic}** are already running in this channel! Use \`stop monitor\` first.`);
            return;
        }

        await message.reply(`🚀 Starting monitor alerts for **${topic}** in this channel...\nThis will filter tweets using AI and follower count, then generate reply.`);

        // Start the monitor process
        const { spawn } = require('child_process');
        
        // Get follower count for this channel (override or config default)
        const followerOverride = channelFollowerCounts.get(channelId);
        const envVars = { 
            ...process.env, 
            TOPIC: topic,
            DISCORD_CHANNEL_ID: channelId,
            DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN
        };
        
        if (followerOverride !== undefined) {
            envVars.FOLLOWER_OVERRIDE = followerOverride.toString();
        }
        
        let monitorProcess = spawn('node', ['monitorTweets.js', 'start'], {
            cwd: process.cwd(),
            stdio: ['ignore', 'pipe', 'pipe'],
            env: envVars
        });

        // Store the process with channel+topic key
        runningMonitors.set(processKey, {
            process: monitorProcess,
            startTime: new Date(),
            channel: message.channel,
            topic: topic,
            channelId: channelId
        });

        // Handle process output
        monitorProcess.stdout.on('data', (data) => {
            console.log(`Monitor (${topic}) output: ${data.toString().trim()}`);
        });

        monitorProcess.stderr.on('data', (data) => {
            console.error(`Monitor (${topic}) error: ${data.toString().trim()}`);
        });

        // Handle process exit
        monitorProcess.on('close', (code) => {
            console.log(`Monitor (${topic}) process exited with code ${code}`);
            
            if (code === 0) {
                // Process exited normally
                const monitorInfo = runningMonitors.get(processKey);
                if (monitorInfo) {
                    monitorInfo.isBackground = true;
                    monitorInfo.startupCompleted = true;
                }
            } else {
                // Process failed
                runningMonitors.delete(processKey);
                message.channel.send(`❌ ${topic} monitor alerts failed to start (exit code ${code}).`);
            }
        });

        monitorProcess.on('error', (error) => {
            console.error(`Failed to start ${topic} monitor alerts: ${error.message}`);
            runningMonitors.delete(processKey);
            message.channel.send(`❌ Failed to start ${topic} monitor alerts: ${error.message}`);
        });

        await message.channel.send(`✅ **${topic}** monitor alerts started successfully!`);

    } catch (error) {
        console.error('Error starting monitor:', error);
        await message.reply(`❌ Error starting monitor alerts: ${error.message}`);
    }
}

async function handleStopMonitor(message) {
    try {
        const channelId = message.channel.id;
        const topic = getChannelTopic(channelId, message.channel);
        
        if (!topic) {
            await message.reply(`❌ Could not determine topic for this channel. Either use \`set topic <topic>\` or rename the channel to a valid topic.`);
            return;
        }
        
        const processKey = `${channelId}_${topic}`;
        const monitor = runningMonitors.get(processKey);
        
        // Check for actual running monitor processes for this specific topic
        const { exec } = require('child_process');
        const checkMonitorProcess = () => new Promise((resolve) => {
            const fs = require('fs');
            const topicPidFile = `.${topic}_monitor_alert.pid`;
            
            if (fs.existsSync(topicPidFile)) {
                try {
                    const pid = fs.readFileSync(topicPidFile, 'utf8').trim();
                    exec(`ps -p ${pid}`, (error, stdout) => {
                        resolve(!error && stdout.includes(pid));
                    });
                } catch (e) {
                    resolve(false);
                }
            } else {
                resolve(false);
            }
        });
        
        const hasRunningProcess = await checkMonitorProcess();
        
        if (!monitor && !hasRunningProcess) {
            await message.reply(`ℹ️ No monitor alerts are currently running for **${topic}** in this channel.`);
            return;
        }

        await message.reply(`🛑 Stopping monitor alerts for **${topic}** in this channel...`);

        // Kill the tracked process if it exists
        if (monitor) {
            monitor.process.kill('SIGTERM');
        }
        
        // Run stop script
        const { spawn } = require('child_process');
        let stopProcess = spawn('node', ['monitorTweets.js', 'stop'], {
            cwd: process.cwd(),
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, TOPIC: topic }
        });
        
        stopProcess.on('close', async (code) => {
            runningMonitors.delete(processKey);
            if (code === 0) {
                await message.channel.send(`✅ **${topic}** monitor alerts stopped successfully.`);
            } else {
                await message.channel.send(`⚠️ Stop script exited with code ${code}, but **${topic}** monitor alerts should be stopped.`);
            }
        });
        
        // Force kill any remaining processes for this specific topic after 10 seconds
        setTimeout(async () => {
            const fs = require('fs');
            const topicPidFile = `.${topic}_monitor_alert.pid`;
            
            if (fs.existsSync(topicPidFile)) {
                try {
                    const pid = fs.readFileSync(topicPidFile, 'utf8').trim();
                    exec(`kill -9 ${pid}`, () => {
                        // Force killed topic-specific process
                    });
                    // Clean up PID file
                    fs.unlinkSync(topicPidFile);
                } catch (e) {
                    // Ignore cleanup errors
                }
            }
        }, 10000);

    } catch (error) {
        console.error('Error stopping monitor:', error);
        await message.reply(`❌ Error stopping monitor alerts: ${error.message}`);
    }
}

async function handleMonitorStatus(message) {
    try {
        const channelId = message.channel.id;
        const topic = getChannelTopic(channelId, message.channel);
        
        if (!topic) {
            await message.reply(`❌ Could not determine topic for this channel. Either use \`set topic <topic>\` or rename the channel to a valid topic.`);
            return;
        }
        
        const processKey = `${channelId}_${topic}`;
        const monitor = runningMonitors.get(processKey);
        
        // Check for actual running monitor processes for this specific topic
        const { exec } = require('child_process');
        const checkMonitorProcess = () => new Promise((resolve) => {
            const fs = require('fs');
            const topicPidFile = `.${topic}_monitor_alert.pid`;
            
            if (fs.existsSync(topicPidFile)) {
                try {
                    const pid = fs.readFileSync(topicPidFile, 'utf8').trim();
                    exec(`ps -p ${pid}`, (error, stdout) => {
                        if (!error && stdout.includes(pid)) {
                            resolve([pid]);
                        } else {
                            // PID file exists but process is dead, clean it up
                            fs.unlinkSync(topicPidFile);
                            resolve(null);
                        }
                    });
                } catch (e) {
                    // Clean up corrupted PID file
                    try {
                        fs.unlinkSync(topicPidFile);
                    } catch (e2) {}
                    resolve(null);
                }
            } else {
                resolve(null);
            }
        });
        
        const runningPids = await checkMonitorProcess();
        
        if (!monitor && !runningPids) {
            await message.reply(`📊 **Monitor Status:** **${topic}** alerts not running in this channel\n\nUse \`monitor\` to begin sending alerts for filtered tweets.`);
            return;
        }

        if (monitor && monitor.isBackground) {
            // Background monitor started via Discord bot
            const uptime = new Date() - monitor.startTime;
            const hours = Math.floor(uptime / (1000 * 60 * 60));
            const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((uptime % (1000 * 60)) / 1000);

            let statusMessage = `📊 **Monitor Status:** **${topic}** alerts running in this channel ✅\n`;
            statusMessage += `**Started:** ${monitor.startTime.toLocaleString()}\n`;
            statusMessage += `**Uptime:** ${hours}h ${minutes}m ${seconds}s\n`;
            statusMessage += `**Mode:** Background process\n`;
            
            if (runningPids) {
                statusMessage += `**Process ID(s):** ${runningPids.join(', ')}\n`;
            }
            
            statusMessage += `\nSending Discord alerts for tweets that pass AI and follower filters.\nUse \`stop monitor\` to stop **${topic}** alerts.`;
            
            await message.reply(statusMessage);
        } else if (runningPids) {
            // Monitor running but not started via Discord bot
            await message.reply(`📊 **Monitor Status:** **${topic}** alerts running ✅
**Mode:** External process
**Process ID(s):** ${runningPids.join(', ')}

Monitor alerts were started outside of Discord bot.
Use \`stop monitor\` to stop **${topic}** alerts.`);
        }

    } catch (error) {
        console.error('Error getting monitor status:', error);
        await message.reply(`❌ Error getting monitor status: ${error.message}`);
    }
}

async function handleHelp(message) {
    const helpText1 = `🤖 **XBot Commands**

**Topic Management:**
\`set topic <topic>\` - Set topic for this channel
\`get topic\` - Show current topic

**Monitoring:**
\`start monitoring\` - Start monitoring for channel's topic
\`stop monitoring\` - Stop monitoring for channel's topic
\`status\` - Check monitoring status
\`help monitoring\` - Show this help

**Monitor Alerts (NEW):**
\`monitor\` - Filter raw Twitter feed → Discord alerts (bypasses sheets)
\`stop monitor\` - Stop monitor alerts
\`monitor status\` - Check monitor alert status

**Follower Management:**
\`set follower [count]\` - Set follower threshold
\`get follower\` - Show current threshold

**Topic Association:**
\`topic association "keyword" "sheet" "range"\` - Generate connections
\`connect "keyword" "tweetLink"\` - Find tweet and connect

**Post Suggestions:**
\`suggest post <handle>\` - Analyze tweets and suggest posts

**Auto Reply:**
\`auto reply\` - Start automatic replies
\`auto reply stop\` - Stop automatic replies  
\`auto reply status\` - Check auto reply status`;

    const helpText2 = `**Stock Research:**
\`stock search\` - Search ticker threads (5000+ followers)
\`stock search <ticker>\` - Search specific ticker

**LinkedIn Research:**
\`linkedin alumni <university> [keywords]\` - Search alumni profiles

**Examples:**
• \`set topic ethereum\` - Set channel topic
• \`set follower 5000\` - Set follower threshold
• \`start monitoring\` - Collect tweets → Google Sheets
• \`monitor\` - Filter tweets → Direct alerts (faster)
• \`status\` - Check status
• \`suggest post elonmusk\` - Get suggestions
• \`auto reply\` - Start automatic replies
• \`stock search BTCS\` - Find ticker threads
• \`linkedin alumni stanford-university hr\` - Find HR alumni

**Monitoring Comparison:**
\`start monitoring\` = Raw Twitter → Filter → Google Sheets → Auto Reply
\`monitor\` = Raw Twitter → Filter → Discord Alerts (no sheets)

**Legacy:** \`set ethereum\` still works`;

    await message.reply(helpText1);
    await message.reply(helpText2);
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
    for (const [processKey, monitoring] of runningProcesses) {
        console.log(`Stopping ${processKey} monitoring process...`);
        monitoring.process.kill('SIGTERM');
    }
    
    // Kill all running auto reply processes
    for (const [processKey, autoReply] of runningAutoReplies) {
        console.log(`Stopping ${processKey} auto reply process...`);
        autoReply.process.kill('SIGTERM');
    }
    
    // Kill all running monitor processes
    for (const [processKey, monitor] of runningMonitors) {
        console.log(`Stopping ${processKey} monitor process...`);
        monitor.process.kill('SIGTERM');
    }
    
    client.destroy();
    process.exit(0);
});