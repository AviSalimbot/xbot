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
            console.log(`Monitoring startup script exited with code ${code}`);
            
            if (code === 0) {
                // Script exited successfully - monitoring is now running in background
                // Update the stored process info to indicate background operation
                const monitoringInfo = runningProcesses.get('monitoring');
                if (monitoringInfo) {
                    monitoringInfo.isBackground = true;
                    monitoringInfo.startupCompleted = true;
                }
                
            } else {
                // Script failed to start monitoring
                runningProcesses.delete('monitoring');
                message.channel.send(`❌ Monitoring startup failed with exit code ${code}.`);
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
        
        const isWindows = process.platform === 'win32';
        const stopScript = isWindows ? 'stop-monitoring.ps1' : './stop-monitoring.sh';
        const stopScriptPath = path.join(process.cwd(), stopScript);

        let stopProcess;
        if (isWindows) {
            // Use PowerShell for Windows
            stopProcess = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', stopScriptPath], {
                cwd: process.cwd(),
                stdio: ['ignore', 'pipe', 'pipe']
            });
        } else {
            // Use Bash for Mac/Linux
            stopProcess = spawn('./stop-monitoring.sh', [], {
                cwd: process.cwd(),
                stdio: ['ignore', 'pipe', 'pipe']
            });
        }
        
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
        
        // Check for actual running monitoring processes even if not in our Map
        const { exec } = require('child_process');
        const checkProcess = () => new Promise((resolve) => {
            exec('pgrep -f "monitorRelevantTweets.js"', (_, stdout) => {
                const pids = stdout.trim().split('\n').filter(pid => pid);
                resolve(pids.length > 0 ? pids : null);
            });
        });
        
        const runningPids = await checkProcess();
        
        if (!monitoring && !runningPids) {
            await message.reply(`📊 **Monitoring Status:** Not running\n\nUse \`start monitoring\` to begin monitoring.`);
            return;
        }

        if (monitoring && monitoring.isBackground) {
            // Background monitoring started via Discord bot
            const uptime = new Date() - monitoring.startTime;
            const hours = Math.floor(uptime / (1000 * 60 * 60));
            const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((uptime % (1000 * 60)) / 1000);

            let statusMessage = `📊 **Monitoring Status:** Running ✅\n`;
            statusMessage += `**Started:** ${monitoring.startTime.toLocaleString()}\n`;
            statusMessage += `**Uptime:** ${hours}h ${minutes}m ${seconds}s\n`;
            statusMessage += `**Mode:** Background process\n`;
            
            if (runningPids) {
                statusMessage += `**Process ID(s):** ${runningPids.join(', ')}\n`;
            }
            
            statusMessage += `\nUse \`stop monitoring\` to stop the process.`;
            
            await message.reply(statusMessage);
        } else if (runningPids) {
            // Monitoring running but not started via Discord bot
            await message.reply(`📊 **Monitoring Status:** Running ✅
**Mode:** External process
**Process ID(s):** ${runningPids.join(', ')}

Monitoring was started outside of Discord bot.
Use \`stop monitoring\` to stop the process.`);
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
            await message.reply(`❌ Usage: \`topic association "topic" "sheetName" "range"\`\n\nExample: \`topic association "inflation" "Relevant Tweets" "1:10"\``);
            return;
        }

        // Parse command: topic association "topic" "sheetName" "range"
        const commandText = content.substring('topic association'.length).trim();
        const matches = commandText.match(/^"([^"]*)"(?:\s+"([^"]*)")?(?:\s+"([^"]*)")?$/);
        
        if (!matches) {
            await message.reply(`❌ Invalid format. Use: \`topic association "topic" "sheetName" "range"\`\n\nExample: \`topic association "inflation" "Relevant Tweets" "1:10"\``);
            return;
        }

        const topic = matches[1];
        const sheetName = matches[2];
        const sheetRange = matches[3] || '';

        if (!topic || !sheetName) {
            await message.reply(`❌ Topic and Sheet Name are required.\n\nExample: \`topic association "inflation" "Relevant Tweets" "1:10"\``);
            return;
        }

        await message.reply(`🔄 Processing topic association for "${topic}"...\nSheet: ${sheetName}\nRange: ${sheetRange || 'all'}`);

        // Import and use the topic association route
        const topicAssociationRoute = require('./routes/topicAssociation');
        
        // Implement sheet name lookup without requiring TOPIC env var
        let sheetId = null;
        
        try {
            // Create a modified version of getAvailableSheets that searches all folders
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
            
            // Search for spreadsheet by name across all accessible folders
            const sheetsQuery = `name='${sheetName}' and mimeType='application/vnd.google-apps.spreadsheet'`;
            const sheetsResponse = await drive.files.list({
                q: sheetsQuery,
                fields: 'files(id, name)',
                orderBy: 'name'
            });
            
            if (sheetsResponse.data.files && sheetsResponse.data.files.length > 0) {
                sheetId = sheetsResponse.data.files[0].id;
                console.log(`✅ Found sheet "${sheetName}" with ID: ${sheetId}`);
            } else {
                await message.reply(`❌ Sheet "${sheetName}" not found. Make sure the sheet name is exact and the service account has access to it.`);
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
                topic1: topic,
                sheetId: sheetId,
                sheetRange: sheetRange
            }
        };

        const mockRes = {
            json: async (data) => {
                if (data.success) {
                    // Format the response for Discord
                    let response = `✅ **Topic Association Results**\n\n`;
                    response += `**Topic:** ${topic}\n`;
                    response += `**Generated:** ${data.suggestions.length} connections\n\n`;
                    
                    // Send results in chunks to avoid Discord message limits
                    for (let i = 0; i < data.suggestions.length; i++) {
                        const suggestion = data.suggestions[i];
                        
                        // Skip if no replies
                        if (!suggestion.replies || suggestion.replies.length === 0) {
                            continue;
                        }
                        
                        let tweetResponse = `📢 Topic Association Alert!\n`;
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
        
        // Parse command: connect "topic" "tweetLink"
        const commandText = content.substring('connect'.length).trim();
        const matches = commandText.match(/^"([^"]*)"(?:\s+"([^"]*)")?$/);
        
        if (!matches || !matches[1] || !matches[2]) {
            await message.reply(`❌ Usage: \`connect "topic" "tweetLink"\`\n\nExample: \`connect "inflation" "https://twitter.com/user/status/1234567890"\``);
            return;
        }

        const topic = matches[1];
        const tweetLink = matches[2];


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
        
        // Search for "Relevant Tweets" sheet
        const sheetsQuery = `name='Relevant Tweets' and mimeType='application/vnd.google-apps.spreadsheet'`;
        const sheetsResponse = await drive.files.list({
            q: sheetsQuery,
            fields: 'files(id, name)',
            orderBy: 'name'
        });
        
        if (!sheetsResponse.data.files || sheetsResponse.data.files.length === 0) {
            await message.reply(`❌ "Relevant Tweets" sheet not found. Make sure the sheet name is exact and the service account has access to it.`);
            return;
        }
        
        const sheetId = sheetsResponse.data.files[0].id;
        console.log(`✅ Found "Relevant Tweets" sheet with ID: ${sheetId}`);

        // Get all data from the sheet to search for the tweet URL
        const sheetResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: 'A:E'
        });
        
        const rows = sheetResponse.data.values || [];
        
        // Find the tweet by URL (column D)
        let foundTweet = null;
        let foundRowIndex = -1;
        
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row && row[3] && row[3].includes(tweetLink)) {
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
        
        if (!foundTweet) {
            await message.reply(`❌ Tweet not found in "Relevant Tweets" sheet. Make sure the tweet URL is correct and exists in the sheet.`);
            return;
        }
        
        // Ensure handler has @ symbol
        const formattedHandler = foundTweet.handle.startsWith('@') ? foundTweet.handle : `@${foundTweet.handle}`;
        foundTweet.handle = formattedHandler;
        
        console.log(`✅ Found tweet at row ${foundTweet.rowNumber}: "${foundTweet.text.substring(0, 50)}..."`);
        
        // Generate connections and replies using the same logic as topic association
        const topicAssociationRoute = require('./routes/topicAssociation');
        const suggestions = await generateConnectionsAndRepliesForConnect(topic, [foundTweet]);
        
        if (suggestions === null) {
            await message.reply(`❌ No connections could be drawn. Claude CLI failed or is not available.`);
            return;
        }
        
        if (suggestions.length === 0 || !suggestions[0].replies || suggestions[0].replies.length === 0) {
            await message.reply(`❌ No meaningful connections found between the tweet and "${topic}".`);
            return;
        }
        
        // Format and send the response
        const suggestion = suggestions[0];
        let response = `✅ Connection Found!\n\n`;
        response += `**Topic:** ${topic}\n`;
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
    
    const prompt = `You are a clever and engaging Twitter user who replies to tweets by drawing smart or witty connections to broad social topics.

Input:

Broad Topic: ${topic1}

Tweets:
${tweets.map((tweet, index) => `${index + 1}. Tweet Text: "${tweet.text}"
Tweet Handle: ${tweet.handle}
Tweet URL: ${tweet.url}
Date: ${tweet.date}`).join('\n\n')}

Follow these steps strictly:
1. If the Tweet Text contains fewer than 4 meaningful words, or is vague/ambiguous, do not generate any connection or replies.
  - Instead, return:
    "connection": "Tweet is too short or vague for meaningful connection to ${topic1}."
    "replies": []           
2. If the tweet is detailed enough to suggest context or opinion, and you can genuinely connect it to ${topic1}, proceed to:
  - Write a brief connection summary explaining how it relates to ${topic1}.
  - Generate 5 tweet-length replies (≤280 characters), mixing:
    - Standalone witty insights (e.g.,
      "Inflation's got us paying steakhouse prices for rabbit food. At this rate, lettuce gonna be a luxury item soon 🥬📈")
    - Replies that explicitly mention the original tweet (e.g.,
      "Just like @handle said — steakhouse prices for lettuce. Inflation's turning salads into status symbols. https://twitter.com/handle/status/1234567890")
3. If no strong connection exists, return:
  - connection: "No meaningful connection to ${topic1}."
  - replies: []
  
Tone: Insightful, witty, sarcastic, or casually humorous—just like good Twitter replies.

Please format your response as a JSON array with this structure:
[
  {
    "originalTweet": "tweet text",
    "tweetHandle": "@handle",
    "tweetUrl": "url",
    "connection": "brief explanation of how this connects to ${topic1}",
    "replies": ["reply1", "reply2", "reply3", "reply4", "reply5"]
  }
]

Make sure the replies are diverse, witty, and truly connect the tweet content to ${topic1}.`;

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
            max_tokens: 4000,
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
        
        // Extract JSON from the response (handle markdown code blocks)
        let jsonContent = content;
        
        // Remove markdown code blocks if present
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
        
        const result = JSON.parse(jsonContent);
        
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
        const claude = spawn('claude', ['-'], { stdio: ['pipe', 'pipe', 'pipe'] });
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
    try {
        const content = message.content.trim();
        
        // Parse command: suggest post <twitter_handle>
        const commandText = content.substring('suggest post'.length).trim();
        
        if (!commandText) {
            await message.reply(`❌ Usage: \`suggest post <twitter_handle>\`\n\nExample: \`suggest post elonmusk\``);
            return;
        }
        
        // Clean the twitter handle - remove @ symbol if present
        const twitterHandle = commandText.replace(/^@/, '').trim();
        
        if (!twitterHandle) {
            await message.reply(`❌ Please provide a valid Twitter handle.\n\nExample: \`suggest post elonmusk\``);
            return;
        }
        
        await message.reply(`🔄 Analyzing @${twitterHandle}'s tweets and generating suggestions...\nThis may take a moment...`);
        
        // Import and use the suggestPost functionality
        const { suggestPost } = require('./suggestPost');
        
        const result = await suggestPost(twitterHandle);
        
        if (!result.success) {
            await message.channel.send(`❌ **Error:** ${result.message}`);
            return;
        }
        
        // Format and send the response
        let response = `✅ **Post Suggestions for @${twitterHandle}**\n\n`;
        response += `**Analysis:** ${result.userAnalysis}\n\n`;
        response += `**Data Processed:** ${result.userTweetsCount} user tweets, ${result.recentTweetsCount} recent trending tweets\n\n`;
        
        if (result.suggestions.length === 0) {
            response += `🤔 **No suggestions found.** The user's interests don't strongly align with the current trending tweets.`;
            await message.channel.send(response);
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
        
    } catch (error) {
        console.error('Error in suggest post command:', error);
        await message.reply(`❌ Error processing suggest post command: ${error.message}`);
    }
}


async function handleHelp(message) {
    const helpText = `🤖 **XBot Commands**

    
**Monitoring:**
\`start monitoring\` - Start monitoring
\`stop monitoring\` - Stop the current monitoring process
\`monitoring status\` or \`status\` - Check monitoring status
\`help monitoring\` - Show this help message

**Topic Association:**
\`topic association "topic" "sheetName" "range"\` - Generate topic connections and replies
\`connect "topic" "tweetLink"\` - Find tweet by URL in Relevant Tweets and generate connections

**Post Suggestions:**
\`suggest post <twitter_handle>\` - Analyze user's tweets and suggest relevant posts from trending tweets

**Examples:**
• \`start monitoring\`
• \`stop monitoring\`
• \`status\`
• \`topic association "inflation" "Relevant Tweets" "1:10"\`
• \`connect "inflation" "https://twitter.com/user/status/1234567890"\`
• \`suggest post elonmusk\``;

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